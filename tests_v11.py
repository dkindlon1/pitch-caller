"""v1.1 checks (docs/PLAN_v1.1_2026-11-12.md). Step 1: six kinds, one migration table, nothing about the calls changes.

  python3 tests_v11.py            -> runs every check, exits non-zero on a failure

The exactness checks compare this engine with the real v1.0 engine, read from git (`git archive v1.0` into a temporary
directory), so "an SI/run pitch costs exactly what FB/sink did" is measured against v1.0 itself, not against a copy.
"""
import json, os, random, re, subprocess, sys, tempfile, tarfile, io, importlib.util
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as e
from simulate import _load_call_engine

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""))


# ------------------------------------------------------------------ the frozen v1.0 engine
def v10_engine():
    ref = "v1.0" if subprocess.run(["git", "rev-parse", "-q", "--verify", "v1.0^{commit}"], cwd=HERE,
                                   capture_output=True).returncode == 0 else "b318098"
    blob = subprocess.run(["git", "archive", ref], cwd=HERE, capture_output=True, check=True).stdout
    d = tempfile.mkdtemp(prefix="v10tree_")
    tarfile.open(fileobj=io.BytesIO(blob)).extractall(d, filter="data")
    return _load_call_engine(os.path.join(d, "engine.py")), ref


old, ref = v10_engine()

# ------------------------------------------------------------------ 1. the migration table
type_rows = {
    "Four-seam": ("FB", "rides"), "Two-seam": ("SI", "two-seam"), "Sinker": ("SI", "run"), "Cutter": ("FC", ""),
    "Slider": ("SL", "tight"), "Sweeper": ("SL", "sweeper"), "Slurve": ("SL", "slurve"), "Curveball": ("CB", ""),
    "Knuckle curve": ("CB", "power"), "12-6 curve": ("CB", "12-6"), "Changeup": ("CH", "fade"),
    "Splitter": ("CH", "split"), "Forkball": ("CH", "split"),
}
tag_rows = {("FB", "ride"): ("FB", "rides"), ("FB", "run"): ("FB", "runs"), ("FB", "sink"): ("SI", "run"),
            ("FB", "cut"): ("FB", "cuts"), ("FB", ""): ("FB", ""), ("SL", "tight"): ("SL", "tight"),
            ("SL", "sweeper"): ("SL", "sweeper"), ("SL", ""): ("SL", ""), ("CB", "loopy"): ("CB", "slow"),
            ("CB", "sharp"): ("CB", "power"), ("CB", ""): ("CB", ""), ("CH", "fade"): ("CH", "fade"),
            ("CH", "drop"): ("CH", "drop"), ("CH", ""): ("CH", ""),
            # v1.0 fastball tags on a v1.1 sinker or cutter (an old portal proposal accepted after migration)
            ("SI", "sink"): ("SI", "run"), ("SI", "ride"): ("SI", "two-seam"), ("SI", "cut"): ("SI", ""),
            ("FC", "cut"): ("FC", ""), ("FC", "run"): ("FC", ""), ("FC", "sink"): ("FC", "")}
bad = [t for t, want in type_rows.items() if e.migrate_pitch(*e.V10_TYPE_TAGS[t], t) != want]
bad += [kt for kt, want in tag_rows.items() if e.migrate_pitch(*kt) != want]
check("migration: every row of the plan's table (13 stored types, 14 v1.0 kind/tags, 6 old fastball tags on a sinker or cutter) maps as listed", not bad, f"{bad}" if bad else "33 rows")
idem = [(k, s) for k, tags in e.SHAPE_TAGS.items() for s in tags for t in (None,) + tuple(type_rows)
        if e.migrate_pitch(k, s, t) != (k, s) and (e.V10_TYPE_TAGS.get(t) != (k, s))]
check("migration is idempotent: every v1.1 kind/tag passes through, with or without a type", not idem, f"{idem[:4]}")
edited = e.migrate_pitch("FB", "runs", "Four-seam")
check("a type never undoes a coach's edit: a Four-seam the coach set to 'runs' stays FB/runs", edited == ("FB", "runs"), f"{edited}")
p = e.Pitch("Sinker", "FB", grade=3, command=3, conf=0.7, shape="sink")
check("the one migration point: Pitch(kind='FB', shape='sink') is a sinker (SI/run) the moment it exists", (p.kind, p.shape) == ("SI", "run"))
p2 = replace(p, conf=0.5)
check("replace() on a migrated pitch keeps it migrated", (p2.kind, p2.shape) == ("SI", "run"))

# the JS twin has the same table (engine.js) and the app's PITCH_TYPES (db.js) agrees with it
js = subprocess.run(["node", "-e", """
const E = require('./app/engine.js'), D = require('./app/db.js');
console.log(JSON.stringify({ byType: E.MIGRATE_BY_TYPE, byTag: E.MIGRATE_BY_TAG, v10: E.V10_TYPE_TAGS, tags: E.SHAPE_TAGS, kinds: E.KINDS,
  types: D.PITCH_TYPES }));"""], cwd=HERE, capture_output=True, text=True, check=True)
J = json.loads(js.stdout)
same = (J["kinds"] == list(e.KINDS) and {k: tuple(v) for k, v in J["byType"].items()} == e.MIGRATE_BY_TYPE
        and {tuple(k.split("|")): tuple(v) for k, v in J["byTag"].items()} == e.MIGRATE_BY_TAG
        and {k: tuple(v) for k, v in J["v10"].items()} == e.V10_TYPE_TAGS
        and {k: tuple(v) for k, v in J["tags"].items()} == e.SHAPE_TAGS
        and {k: (v["kind"], v["shape"]) for k, v in J["types"].items()} == e.MIGRATE_BY_TYPE)
check("one table: engine.py, app/engine.js and the app's PITCH_TYPES (db.js) hold the same migration table and tags", same)

# ------------------------------------------------------------------ 2. exactly v1.0's calls
LEVELS = ["hs", "college_d3", "college_d1", "mlb"]


def dist_of(E, ars, s):
    tab = E.solve_table(ars, replace(s, balls=0, strikes=0, last=None))
    _, dist, _, _ = E.call_v08(ars, s, rng=random.Random(0), tab=tab)
    return {(d[2].name, d[3]): d[0] for d in dist}, tab


def mk(E, spec):
    return [E.Pitch(n, k, grade=g, command=c, conf=cf, shape=sh, velo=v, **({"type": t} if t and E is e else {}))
            for (n, k, g, c, cf, sh, v, t) in spec]


arsenals = {   # v1.0 kind/tag, as stored; v1.1 migrates them (typed rows go through the stored type)
    "sinker + curve + change": [("Sinker", "FB", 3, 4, .8, "sink", 87, "Sinker"), ("Curve", "CB", 3, 3, .7, "loopy", 74, None),
                                ("Change", "CH", 3, 3, .65, "drop", 79, None)],
    "two-seam + cutter + slider": [("Two-seam", "FB", 3, 3, .8, "run", 0, "Two-seam"), ("Cutter", "FB", 3, 3, .75, "cut", 84, "Cutter"),
                                   ("Slider", "SL", 4, 3, .7, "tight", 78, "Slider")],
    "cut four-seam + 12-6 + splitter": [("Fastball", "FB", 4, 3, .8, "cut", 90, None), ("12-6", "CB", 3, 3, .7, "sharp", 76, "12-6 curve"),
                                        ("Splitter", "CH", 3, 3, .65, "drop", 82, "Splitter")],
    "run four-seam + slurve + knuckle curve": [("Fastball", "FB", 3, 3, .8, "run", 85, None), ("Slurve", "SL", 3, 3, .7, "", 74, "Slurve"),
                                               ("KC", "CB", 3, 3, .65, "sharp", 77, "Knuckle curve")],
}
worst, n = 0.0, 0
rng = random.Random(20261112)
for an, spec in arsenals.items():
    for lvl in LEVELS:
        for bases in ((False, False, False), (True, False, True)):
            for (b, k) in ((0, 0), (1, 2), (3, 2)):
                ss = dict(inning=rng.randint(1, 9), margin=rng.randint(-2, 2), level=lvl, same_side=rng.random() < 0.5,
                          timing={"FB": 0.5, "OS": -0.4}, hitter_damage={"FB": (0.4, 15), "FB|up-in": (0.6, 8)},
                          matchup={"succ|FB": 1, "hard|FB|down-away": 1})
                d0, _ = dist_of(old, mk(old, spec), old.Situation(b, k, 1, bases, **ss))
                d1, _ = dist_of(e, mk(e, spec), e.Situation(b, k, 1, bases, **ss))
                n += 1
                if set(d0) != set(d1):
                    worst = float("inf")
                else:
                    worst = max(worst, max(abs(d0[x] - d1[x]) for x in d0))
check(f"exactly v1.0 ({ref}): FB/sink, FB/run, FB/cut, CB/loopy, CB/sharp, CH/drop, SL/'' as stored (typed and untyped) give "
      f"the same call mix after migration", worst < 1e-12, f"{n} situations, largest difference {worst:.1e}")

# the one deliberate exception: a stored generic "Curveball" (v1.0 CB/loopy) becomes CB/typical, which moves only its
# movement (the tunnel model); written down in the build report
c10 = e.Pitch("Curve", "CB", grade=3, command=3, conf=0.7, shape="loopy", type="Curveball")
check("the one exception is what the report says: a stored generic Curveball is CB/typical (movement -10/-7, was -14/-5)",
      (c10.kind, c10.shape) == ("CB", "") and e.movement(c10) == (-10, -7) and old.movement(old.Pitch("C", "CB", 3, 3, .7, shape="loopy")) == (-14, -5))

# ------------------------------------------------------------------ 3. new kinds run and validate
for name, spec in {"sinker only": [("Sinker", "SI", 3, 4, .8, "run", 86, None), ("Slider", "SL", 3, 3, .7, "sweeper", 78, None)],
                   "cutter + four-seam + curve": [("Fastball", "FB", 3, 3, .8, "rides", 90, None), ("Cutter", "FC", 3, 3, .75, "hard", 87, None),
                                                  ("Curve", "CB", 3, 3, .7, "12-6", 75, None)],
                   "all six": [("FB", "FB", 3, 3, .8, "", 90, None), ("SI", "SI", 3, 3, .8, "drop", 89, None), ("FC", "FC", 3, 3, .8, "big", 85, None),
                               ("SL", "SL", 3, 3, .7, "gyro", 82, None), ("CB", "CB", 3, 3, .7, "slow", 72, None), ("CH", "CH", 3, 3, .7, "firm", 85, None)]}.items():
    ars = mk(e, spec)
    okc = True
    for lvl in LEVELS:
        s0 = e.Situation(0, 0, 0, (False, False, False), level=lvl)
        tab = e.solve_table(ars, s0)
        for (b, k) in e.COUNTS:
            _, dist, _, _ = e.call_v08(ars, replace(s0, balls=b, strikes=k), rng=random.Random(0), tab=tab)
            okc &= abs(sum(d[0] for d in dist) - 1) < 1e-9
    check(f"new kinds run: {name}, every count at hs / D3 / D1 / MLB gives a call mix that sums to 1", okc)
s = e.Situation(0, 0, 0, (False, False, False))
try:
    e.check_inputs([e.Pitch("X", "KN", 3, 3, .7)], s); bad_kind = False
except ValueError:
    bad_kind = True
try:
    e.check_inputs([e.Pitch("X", "SI", 3, 3, .7, shape="rides")], s); bad_shape = False
except ValueError:
    bad_shape = True
check("validation after migration: an unknown kind and a tag from another kind (SI/rides) are rejected; v1.0 tags pass",
      bad_kind and bad_shape and e.check_inputs([e.Pitch("X", "FB", 3, 3, .7, shape="sink")], s) is None)

# ------------------------------------------------------------------ 4. no class logic left on the bare string "FB"
CMP = re.compile(r"""kind\s*(==|===|!=|!==)\s*['"]FB['"]|['"]FB['"]\s*(==|===|!=|!==)\s*\w*kind""")
ALLOWED = ("shape", "gb_rate", "gbRate", "4-seam")      # profile-specific (four-seam) lines, not class logic
left = []
for path in ("engine.py", "app/engine.js"):
    lines = open(os.path.join(HERE, path), encoding="utf-8").read().splitlines()
    for i, line in enumerate(lines, 1):
        if CMP.search(line) and not any(a in line or a in lines[i] for a in ALLOWED):
            left.append(f"{path}:{i}")
check("no 'fastball' decision on the bare kind string: every kind-to-'FB' comparison left in either engine is a four-seam "
      "profile line (shape or grounder rate)", not left, ", ".join(left))

fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
