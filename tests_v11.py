"""v1.1 checks (docs/PLAN_v1.1_2026-11-12.md). Step 1: six kinds, one migration table, nothing about the calls changes.
Step 1b: the profile table and tag thresholds; with measured numbers on every pitch the calls are still exactly v1.0's.

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
    "Knuckle curve": ("CB", ""), "12-6 curve": ("CB", "12-6"), "Changeup": ("CH", "fade"),
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


# v1.0's movement for its tags (engine.py SHAPES at v1.0), entered as measured numbers so the v1.1 profile table never enters
V10_MOVE = {("FB", "ride"): (18, 8), ("FB", "run"): (13, 15), ("FB", "sink"): (8, 16), ("FB", "cut"): (12, -3), ("FB", ""): (15, 10),
            ("SL", "tight"): (3, -5), ("SL", "sweeper"): (0, -15), ("SL", ""): (2, -7), ("CB", "loopy"): (-14, -5),
            ("CB", "sharp"): (-8, -9), ("CB", ""): (-10, -7), ("CH", "fade"): (7, 15), ("CH", "drop"): (3, 10), ("CH", ""): (6, 13)}


def mk_plain(E, spec):
    return [E.Pitch(n, k, grade=g, command=c, conf=cf, shape=sh, velo=v) for (n, k, g, c, cf, sh, v, t) in spec]


def mk(E, spec):
    """the arsenal with every pitch's speed and movement entered (measured), as v1.0 had them"""
    return [E.Pitch(n, k, grade=g, command=c, conf=cf, shape=sh, velo=v or {"FB": 85, "SL": 77, "CB": 71, "CH": 77}[k],
                    ivb=V10_MOVE[(k, sh)][0], hb=V10_MOVE[(k, sh)][1], **({"type": t} if t and E is e else {}))
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
check(f"exactly v1.0 ({ref}) with measured numbers: FB/sink, FB/run, FB/cut, CB/loopy, CB/sharp, CH/drop, SL/'' as stored (typed "
      f"and untyped), every pitch's speed and movement entered: the same call mix (Step 1b changed only the defaults)",
      worst < 1e-12, f"{n} situations, largest difference {worst:.1e}")

# ------------------------------------------------------------------ 3. new kinds run and validate
for name, spec in {"sinker only": [("Sinker", "SI", 3, 4, .8, "run", 86, None), ("Slider", "SL", 3, 3, .7, "sweeper", 78, None)],
                   "cutter + four-seam + curve": [("Fastball", "FB", 3, 3, .8, "rides", 90, None), ("Cutter", "FC", 3, 3, .75, "hard", 87, None),
                                                  ("Curve", "CB", 3, 3, .7, "12-6", 75, None)],
                   "all six": [("FB", "FB", 3, 3, .8, "", 90, None), ("SI", "SI", 3, 3, .8, "drop", 89, None), ("FC", "FC", 3, 3, .8, "big", 85, None),
                               ("SL", "SL", 3, 3, .7, "gyro", 82, None), ("CB", "CB", 3, 3, .7, "slow", 72, None), ("CH", "CH", 3, 3, .7, "firm", 85, None)]}.items():
    ars = mk_plain(e, spec)
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

# ------------------------------------------------------------------ 5. Step 1b: the profile table and the tags
J2 = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js');
console.log(JSON.stringify({ P: E.PROFILES, T: E.PROFILE_T, R: E.MOVE_RATIO, N: E.PROFILE_NAMES,
  dm: Object.fromEntries(Object.entries(E.SHAPE_TAGS).flatMap(([k, ts]) => ts.map((t) => [k + '|' + t, E.defaultMph(k, t)]))) }));"""],
    cwd=HERE, capture_output=True, text=True, check=True).stdout)
same_tab = all({k: tuple(v) for k, v in J2["P"][lv].items()} == {f"{a}|{b}": v for (a, b), v in e.PROFILES[lv].items()} for lv in e.PROFILES) \
    and set(J2["P"]) == set(e.PROFILES) and J2["T"] == e.PROFILE_T and J2["R"] == e.MOVE_RATIO and J2["N"] == e.PROFILE_NAMES \
    and all(abs(J2["dm"][f"{k}|{t}"] - e.default_mph(k, t)) < 1e-9 for k, ts in e.SHAPE_TAGS.items() for t in ts)
check("one table: the profile table, thresholds, movement ratios, profile names and default speeds are the same in both engines", same_tab)
full = all((k, t) in e.PROFILES[lv] for lv in e.PROFILES for k, ts in e.SHAPE_TAGS.items() for t in ts)
col, hs = e.PROFILES["college_d3"], e.PROFILES["hs"]
lvl_ok = e.PROFILES["college_d1"] == col and e.PROFILES["travel"] == hs and all(
    hs[k][0] == col[k][0] and abs(hs[k][1] - round(col[k][1] * 0.85, 1)) < 1e-9 and abs(hs[k][2] - round(col[k][2] * 0.85, 1)) < 1e-9 for k in col)
check("every kind and tag has its own row at every level; D1 = D3 (college); HS and travel = college movement x 0.85, same speed gaps",
      full and lvl_ok, f"{sum(len(v) for v in e.PROFILES.values())} rows")
fit = json.load(open(os.path.join(HERE, "results", "v11", "profiles.json")))
mlb_ok = all(e.PROFILES["mlb"][tuple(k.split("|"))] == (v["dmph"], v["ivb"], v["hb"]) for k, v in fit["mlb"].items())
n_rows = sum(len(ts) for ts in e.SHAPE_TAGS.values())
check(f"the MLB rows are the Statcast medians in results/v11/profiles.json (2024, 172k pitches), all {n_rows}", mlb_ok and len(fit["mlb"]) == n_rows)
sw = fit["agreement_2024"]["ST"]["agree"], fit["agreement_2025"]["ST"]["agree"]
check("sweeper threshold matches Statcast's sweeper label on its own: >= 80% in 2024 (fit) and 2025 (held out)",
      min(sw) >= 0.80 and fit["thresholds"]["sl_sweeper_hb"] == -10.0, f"2024 {sw[0]:.1%}, 2025 {sw[1]:.1%}, threshold -10 in.")
smp = json.load(open(os.path.join(HERE, "results", "v11", "tag_sample.json")))
miss_py = [r for r in smp["rows"] if e.tag_for(r[0], r[1], r[2], r[3], r[4], r[5], r[6], "mlb") != r[7]]
js_tags = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js'), S = require('./results/v11/tag_sample.json');
console.log(JSON.stringify(S.rows.map((r) => E.tagFor(r[0], r[1], r[2], r[3], r[4], r[5], r[6], 'mlb'))));"""],
    cwd=HERE, capture_output=True, text=True, check=True).stdout)
miss_js = [i for i, r in enumerate(smp["rows"]) if js_tags[i] != r[7]]
check("one definition: on 4,200 real 2024 pitches (700 per kind) both engines' tag_for give exactly the fit script's tags",
      not miss_py and not miss_js, f"Python misses {len(miss_py)}, JS misses {len(miss_js)}")
rr = random.Random(7)
cases = [(rr.choice(e.KINDS), rr.uniform(-20, 22), rr.uniform(-20, 20), rr.uniform(60, 98), rr.uniform(75, 99), rr.uniform(4, 22),
          rr.uniform(-4, 20), rr.choice(list(e.PROFILES)), rr.choice([None, None, "Sweeper", "Splitter", "Slider", "12-6 curve", "Two-seam"]))
         for _ in range(3000)]
js_r = json.loads(subprocess.run(["node", "-e", "const E=require('./app/engine.js');const C=JSON.parse(require('fs').readFileSync(0,'utf8'));"
                                  "console.log(JSON.stringify(C.map((c)=>E.tagFor(...c))))"], input=json.dumps(cases), cwd=HERE,
                                 capture_output=True, text=True, check=True).stdout)
diff_r = [c for c, j in zip(cases, js_r) if e.tag_for(*c) != j]
check("tag_for: Python and JS agree on 3,000 random pitches at every level, with and without a pitch name", not diff_r, f"{len(diff_r)} differ")
names_ok = (e.tag_for("SL", 2, -4, 80, 90, 16, 8, "mlb", "Sweeper") == "sweeper" and e.tag_for("CH", 6, 14, 82, 90, 16, 8, "mlb", "Splitter") == "split"
            and e.tag_for("SL", 2, -14, 80, 90, 16, 8, "mlb", "Slider") == "sweeper" and e.tag_for("CB", -10, -3, 77, 90, 16, 8, "mlb", "Knuckle curve") == "12-6")
check("a pitch name that names a profile sets the tag (Sweeper, Splitter); a plain name (Slider) or a grip (Knuckle curve) is tagged by movement", names_ok)
dm = {k: e.default_mph(*k) for k in [("FB", ""), ("SI", ""), ("FC", ""), ("SL", ""), ("SL", "sweeper"), ("SL", "gyro"), ("CB", "power"), ("CB", "slow"),
                                     ("CH", "firm"), ("CH", "")]}
dm_ok = (dm[("FB", "")] == 85 and dm[("SI", "")] > dm[("FC", "")] and 79 <= dm[("FC", "")] <= 81 and dm[("SL", "sweeper")] < dm[("SL", "gyro")]
         and dm[("CB", "power")] > dm[("CB", "slow")] and dm[("CH", "firm")] > dm[("CH", "")])
check("default speeds follow the profiles: cutter about 5 mph under the fastball (MLB 2024: 5.0), sweeper slower than gyro, power curve "
      "faster than slow, firm changeup faster than typical", dm_ok, ", ".join(f"{a}/{b or 'typ'} {v}" for (a, b), v in dm.items()))
A = [e.Pitch("Sinker", "SI", 3, 3, .7, shape="run", velo=88), e.Pitch("Slider", "SL", 3, 3, .7, shape="sweeper")]
B = [e.Pitch("FB", "FB", 3, 3, .7, velo=92), e.Pitch("Cutter", "FC", 3, 3, .7, shape="hard", velo=89, main=True), e.Pitch("CH", "CH", 3, 3, .7, velo=83)]
rs = e.rel_shape(A[1], A, "mlb")
pf_ok = (e.primary_fb(A).name == "Sinker" and e.primary_fb(B).name == "Cutter" and e.primary_fb([e.Pitch("C", "CB", 3, 3, .7, velo=74), e.Pitch("H", "CH", 3, 3, .7, velo=80)]).name == "H"
         and rs == (round(88 - e.default_mph("SL", "sweeper"), 3), round(e.profile("SL", "sweeper", "mlb")[1] - e.profile("SI", "run", "mlb")[1], 3), e.profile("SL", "sweeper", "mlb")[2])
         and e.rel_shape(A[0], A, "mlb")[:2] == (0, 0))
check("main fastball and relative shape: a sinker-only pitcher's main fastball is the sinker; the coach's mark wins; no fastball -> the "
      "fastest pitch; a sweeper's shape is read off that main fastball", pf_ok, f"sweeper off the sinker: {rs}")

RA = [e.Pitch("FB", "FB", 3, 3, .8, velo=94), e.Pitch("CH", "CH", 3, 3, .7), e.Pitch("Cut", "FC", 3, 3, .8, shape="hard")]
RB = [e.Pitch("FB", "FB", 3, 3, .8), e.Pitch("CH", "CH", 3, 3, .7)]
e.solve_table(RA, e.Situation(0, 0, 0, (False, False, False))); e.resolve_speeds(RB)
gap = lambda k, t: e.profile(k, t, "college_d3")[0]
js_sp = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const A = [E.Pitch({name:'FB',kind:'FB',grade:3,command:3,conf:.8,velo:94}), E.Pitch({name:'CH',kind:'CH',grade:3,command:3,conf:.7}), E.Pitch({name:'Cut',kind:'FC',shape:'hard',grade:3,command:3,conf:.8})];
E.solveTable(A, E.Situation({balls:0,strikes:0,outs:0,bases:[false,false,false]}));
console.log(JSON.stringify(A.map((x) => E.mph(x))));"""], cwd=HERE, capture_output=True, text=True, check=True).stdout)
sp_ok = ([x.mph() for x in RA] == [94, round(94 - gap("CH", ""), 1), round(94 - gap("FC", "hard"), 1)] and RB[1].mph() == e.default_mph("CH", "")
         and js_sp == [x.mph() for x in RA])
check("a pitch with no speed is read off his main fastball's entered speed (94 mph: changeup 87, hard cutter 91); with none entered, "
      "off the default fastball (85); both engines", sp_ok, f"{[x.mph() for x in RA]}, no FB speed: changeup {RB[1].mph()}")

# ------------------------------------------------------------------ 6. the hot read wears off once he has leaned (FINDING_v1.0_game_mix_collapse)
A3 = [e.Pitch("Fastball", "FB", 3, 3, .8, velo=86), e.Pitch("Slider", "SL", 3, 3, .75, shape="tight", velo=78), e.Pitch("Changeup", "CH", 3, 3, .65, velo=78)]
def _sit(n_sl, pc): return e.Situation(1, 2, 1, (False, False, True), landing_today={"Slider": (min(n_sl, round(n_sl * 0.9)), n_sl)}, pitch_count=pc)
fades = {(n, pc): e.hot_fade(A3[1], _sit(n, pc), A3) for (n, pc) in ((10, 50), (17, 50), (25, 50), (34, 50), (33, 39), (10, 10))}
js_f = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js');
const A = [E.Pitch({name:'Fastball',kind:'FB',grade:3,command:3,conf:.8,velo:86}), E.Pitch({name:'Slider',kind:'SL',shape:'tight',grade:3,command:3,conf:.75,velo:78}), E.Pitch({name:'Changeup',kind:'CH',grade:3,command:3,conf:.65,velo:78})];
const out = {}; for (const [n, pc] of [[10,50],[17,50],[25,50],[34,50],[33,39],[10,10]]) out[n + ',' + pc] = E.v08.hotFade(A[1], E.Situation({balls:1,strikes:2,outs:1,bases:[false,false,true],landing_today:{Slider:[Math.min(n, Math.round(n*0.9)), n]},pitch_count:pc}), A);
console.log(JSON.stringify(out));"""], cwd=HERE, capture_output=True, text=True, check=True).stdout)
fade_ok = (fades[(10, 50)] == 1.0 and fades[(17, 50)] == 1.0 and 0 < fades[(25, 50)] < 1 and fades[(34, 50)] == 0.0 and fades[(33, 39)] == 0.0
           and all(abs(js_f[f"{n},{pc}"] - v) < 1e-12 for (n, pc), v in fades.items()))
check("the hot read keeps its full size until his share of today's pitches is 10 points over its normal share (slider 25% here) and "
      "is gone at 40 over (the v1.0 collapse: 33 sliders of 39 pitches); both engines", fade_ok,
      ", ".join(f"{n}/{pc} -> {v:.2f}" for (n, pc), v in fades.items()))

# ------------------------------------------------------------------ 4. no class logic left on the bare string "FB"
CMP = re.compile(r"""kind\s*(==|===|!=|!==)\s*['"]FB['"]|['"]FB['"]\s*(==|===|!=|!==)\s*\w*kind""")
ALLOWED = ("shape", "gb_rate", "gbRate", "4-seam", "rides")   # four-seam profile lines (incl. tag_for's tag rules), not class logic
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
