"""v1.1 checks (docs/PLAN_v1.1_2026-11-12.md). Step 1: six kinds, one migration table, nothing about the calls changes.
Step 1b: the profile table and tag thresholds; with measured numbers on every pitch the calls are still exactly v1.0's.
Step 2: the profile terms (fitted and priors) — the tables, both engines' parity, the typical pitch, HS scaling, grounders;
outside Step 2's three functions the calls are still exactly v1.0's. Step 3: the setup rules fire and stay silent as written,
the cap, root only, the tie-break, both engines.

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


# v1.1 Step 2 changes the calls on purpose in a few named places; readthrough/step2_off.py sets them back to Step 1b
sys.path.insert(0, os.path.join(HERE, "readthrough"))
from step2_off import step2_off as _s2off, params_at as _params_at
_P1B = _params_at("7b5ebbb")
step2_off = lambda: _s2off(e, _P1B)


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
                with step2_off():
                    d1, _ = dist_of(e, mk(e, spec), e.Situation(b, k, 1, bases, **ss))
                n += 1
                if set(d0) != set(d1):
                    worst = float("inf")
                else:
                    worst = max(worst, max(abs(d0[x] - d1[x]) for x in d0))
check(f"exactly v1.0 ({ref}) with measured numbers and Step 2's changes set back (profile_terms, class_terms, gb_rate, the slot "
      f"movement, the refit level shifts, Step 3's setup credits and tie-break): FB/sink, FB/run, FB/cut, CB/loopy, CB/sharp, CH/drop, SL/'' as stored (typed and "
      f"untyped), every pitch's speed and movement entered: the same call mix (Step 1b changed only the defaults; Step 2 changes "
      f"only those)",
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

# ------------------------------------------------------------------ 7. the not-landing hold lifts after a run of pitches without the pitch (Drew, Nov 12)
cold = e.Situation(0, 0, 0, (False, False, False), landing_today={"Fastball": (5, 7.8, 12)}, pitch_count=60)
names_at = lambda st: sorted({a[0] for a in e.allowed_calls(A3, st)})
from dataclasses import replace as _rp
cb_py = [names_at(cold), names_at(_rp(cold, since_thrown={"Fastball": e.COMEBACK_N - 1})), names_at(_rp(cold, since_thrown={"Fastball": e.COMEBACK_N})),
         names_at(_rp(cold, balls=0, strikes=1, since_thrown={}))]
cb_js = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const A = [E.Pitch({name:'Fastball',kind:'FB',grade:3,command:3,conf:.8,velo:86}), E.Pitch({name:'Slider',kind:'SL',shape:'tight',grade:3,command:3,conf:.75,velo:78}), E.Pitch({name:'Changeup',kind:'CH',grade:3,command:3,conf:.65,velo:78})];
const base = {balls:0,strikes:0,outs:0,bases:[false,false,false],landing_today:{Fastball:[5,7.8,12]},pitch_count:60};
const at = (o) => [...new Set(E.v08.allowedCalls(A, E.Situation(Object.assign({}, base, o))).map((k) => k.split('|')[0]))].sort();
console.log(JSON.stringify([at({}), at({since_thrown:{Fastball:E.v08.COMEBACK_N-1}}), at({since_thrown:{Fastball:E.v08.COMEBACK_N}}), at({strikes:1})]));"""],
    cwd=HERE, capture_output=True, text=True, check=True).stdout)
check(f"a pitch not landing (fastball 5-for-12) is held at 0-0 and still called ahead in the count; after {e.COMEBACK_N} pitches without it "
      "the hold lifts; both engines", cb_py == cb_js and "Fastball" not in cb_py[0] and "Fastball" not in cb_py[1] and "Fastball" in cb_py[2]
      and "Fastball" in cb_py[3], f"{cb_py}")

# ------------------------------------------------------------------ Step 2: profile terms (plan 2.3)
import profile_terms_tables as PTT
T2 = json.load(open(os.path.join(HERE, "results", "v11", "step2_terms.json")))
fit2 = json.load(open(os.path.join(HERE, "results", "v11", "step2_fit.json")))
names2 = ("PT_C", "PT_B", "PT_FBZ_W", "PT_FBZ_H", "PT_PLAT", "PT_CHASE_OPP", "PT_CHASE_MEAN", "GB_PROFILE", "SLOT_ANGLE", "PT_FB_IVB",
          "SLOT_MOVE")
norm = lambda x: json.loads(json.dumps(x))
py_tab = {k: norm(getattr(e, k)) for k in names2}
js_tab = json.loads(subprocess.run(["node", "-e", "const E=require('./app/engine.js');console.log(JSON.stringify(E.v11terms))"],
                                   cwd=HERE, capture_output=True, text=True, check=True).stdout)
rebuilt = norm(PTT.build(fit2, T2["PT_CHASE_MEAN"]))
check("Step 2 tables: engine.py and app/engine.js hold the same profile terms, equal to results/v11/step2_terms.json and to a "
      "fresh build from the fit file (step2_fit.json)", py_tab == js_tab == {k: T2[k] for k in names2} == {k: rebuilt[k] for k in names2})
ships = {t: (fit2["2a"][t]["C_over_A"]["ship"], fit2["2a"][t]["B_over_C"]["ship"]) for t in ("whiff", "chase", "cstrike", "hard")}
check("Step 2 shipping as fitted: shape (C) on all four targets; profile beyond shape (B) on whiff and chase; fastball zone (2b) "
      "on whiff, the riding cutter on the cutter's lines (its own didn't ship); opposite-side chase (2c); every other term a prior "
      "at its no-harm scale (the called-strike zone and platoon priors at 0)",
      ships == {"whiff": (True, True), "chase": (True, True), "cstrike": (True, False), "hard": (True, False)}
      and fit2["2b"]["whiff"]["ship"] and fit2["2c"]["chase"]["ship"] and fit2["priors"]["fbzone_cstrike"]["scale"] == 0.0
      and fit2["priors"]["platoon_cstrike"]["scale"] == 0.0 and not fit2["2b"]["gate:FC|ride:whiff"]["ship"]
      and e.PT_FBZ_W["FC|ride"] == e.PT_FBZ_W["FC|"] and set(e.PT_B) == {"whiff", "chase"}, f"{ships}")

# parity: random pitches, arsenals and spots, both engines
rng2 = random.Random(7)
cases2 = []
for _ in range(600):
    lv = rng2.choice(["hs", "travel", "college_d3", "college_d1", "mlb"])
    def rp(nm, kind):
        tag = rng2.choice(e.SHAPE_TAGS[kind])
        d = dict(name=nm, kind=kind, shape=tag, grade=3, command=3, conf=0.7, slot=rng2.choice(list(e.SLOT_ANGLE) + ["three-quarter"]))
        if rng2.random() < 0.4:
            d["velo"] = round(rng2.uniform(70, 96), 1)
        if rng2.random() < 0.3:
            d["ivb"], d["hb"] = round(rng2.uniform(-18, 20), 1), round(rng2.uniform(-18, 19), 1)
        return d
    fbk = rng2.choice(["FB", "SI", "FC"])
    ars = [rp("F", fbk), rp("A", rng2.choice(e.KINDS)), rp("B", rng2.choice(e.KINDS))]
    if rng2.random() < 0.3:
        ars[2]["main"] = True
    cases2.append(dict(ars=ars, i=rng2.randrange(3), q=rng2.choice(["up-in", "up-away", "down-in", "down-away", "middle", "down-middle", "chase"]),
                       same=rng2.random() < 0.5, level=lv, k=rng2.randrange(3)))
def py_pt(c):
    A = [e.Pitch(**{k: v for k, v in d.items()}) for d in c["ars"]]
    e.resolve_speeds(A)
    s = e.Situation(0, c["k"], 0, (False, False, False), level=c["level"], same_side=c["same"])
    t = dict(e.profile_terms(A[c["i"]], c["q"], s, A))
    ct = e.class_terms(A[c["i"]], c["q"], s)
    t.update(cw=ct["whiff"], cc=ct["chase"]["off"], cs=ct["cstrike"], ch=ct["hard"])
    return t
py_r = [py_pt(c) for c in cases2]
js_r = json.loads(subprocess.run(["node", "-e", """
const E=require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const C=JSON.parse(require('fs').readFileSync(0,'utf8'));
console.log(JSON.stringify(C.map((c)=>{ const A=c.ars.map((d)=>E.Pitch(d)); E.resolveSpeeds(A);
  const s=E.Situation({balls:0,strikes:c.k,outs:0,bases:[false,false,false],level:c.level,same_side:c.same});
  const t=E.v11profileTerms(A[c.i], c.q, s, A), ct=E.classTerms(A[c.i], c.q, s);
  return Object.assign(t, {cw: ct.whiff, cc: ct.chase.off, cs: ct.cstrike, ch: ct.hard}); })))"""], input=json.dumps(cases2), cwd=HERE, capture_output=True, text=True, check=True).stdout)
worst2 = max(abs(a[k] - b[k]) for a, b in zip(py_r, js_r) for k in a)
check("Step 2 parity: profile_terms and class_terms in Python and JS agree on 600 random pitches (every kind and tag, measured or "
      "not, every slot, level and strike count, sinker / cutter main fastballs, the coach's mark)", worst2 < 1e-12, f"largest difference {worst2:.1e}")

# the typical pitch of each class keeps its v1.0 value at every level: only the platoon priors touch it (same side: no
# chase-opp term). Speeds entered at the level's own gaps (default speeds use the college gaps at every level, Step 1b).
dev = 0.0
for lv in ("mlb", "college_d1", "college_d3", "hs", "travel"):
    typ = [e.Pitch(k, k, grade=3, command=3, conf=0.7, shape="", velo=90 - e.profile(k, "", lv)[0]) for k in ("FB", "SL", "CB", "CH")]
    e.resolve_speeds(typ)
    s_m = e.Situation(0, 0, 0, (False, False, False), level=lv, same_side=True)
    rho = e.RHO_L.get(lv, 1.0)
    for p in typ:
        t = e.profile_terms(p, "down-away", s_m, typ)
        k = e.pt_key(p)
        dev = max(dev, *(abs(t[g] - rho * (e.PT_PLAT[g][k][0] if g in e.PT_PLAT else 0.0)) for g in t))
check("Step 2: the typical four-seam, slider, curve and changeup (3/4 slot) keep their v1.0 class values at every level; only "
      "the platoon priors move them", dev < 1e-9, f"largest other term {dev:.1e}")

# slot adjustment of default movement (E10): an untagged pitch only; a tag or measured numbers win; both engines
_mv = lambda k, sh, slot, **kw: e.movement(e.Pitch("x", k, 3, 3, 0.7, shape=sh, slot=slot, **kw), "college_d3")
mv_py = [_mv("FB", "", "over the top"), _mv("FB", "", "sidearm"), _mv("FB", "rides", "over the top"), _mv("FB", "rides", "sidearm"),
         _mv("CB", "", "over the top"), _mv("CB", "", "sidearm"), _mv("FB", "", "sidearm", ivb=17.0, hb=9.0)]
mv_js = json.loads(subprocess.run(["node", "-e", """
const E=require('./app/engine.js'); const m=(k,sh,slot,o)=>E.movement(E.Pitch(Object.assign({name:'x',kind:k,shape:sh,grade:3,command:3,conf:.7,slot:slot},o||{})),'college_d3');
console.log(JSON.stringify([m('FB','','over the top'),m('FB','','sidearm'),m('FB','rides','over the top'),m('FB','rides','sidearm'),
  m('CB','','over the top'),m('CB','','sidearm'),m('FB','','sidearm',{ivb:17,hb:9})]));"""], cwd=HERE, capture_output=True, text=True, check=True).stdout)
same_mv = all(abs(a - b) < 1e-12 for x, y in zip(mv_py, mv_js) for a, b in zip(x, y))
check("Step 2 slot adjustment: an untagged four-seam rides more and runs less from over the top than from the side, a curve drops "
      "more; a tagged pitch (rides) and measured numbers don't move; both engines", same_mv and mv_py[0][0] > mv_py[1][0]
      and mv_py[0][1] < mv_py[1][1] and mv_py[4][0] < mv_py[5][0] and mv_py[2] == mv_py[3] and mv_py[6] == (17.0, 9.0),
      f"FB over the top {mv_py[0][0]:.1f}/{mv_py[0][1]:.1f}, sidearm {mv_py[1][0]:.1f}/{mv_py[1][1]:.1f}; CB {mv_py[4][0]:.1f} vs {mv_py[5][0]:.1f}")

# HS: every term is RHO_L (0.6) times college (movement read on the MLB scale, so the HS ratio doesn't shrink it again)
worst_hs = 0.0
for kind in e.KINDS:
    for tag in e.SHAPE_TAGS[kind]:
        A = [e.Pitch("F", "FB", grade=3, command=3, conf=0.7, velo=84), e.Pitch("X", kind, grade=3, command=3, conf=0.7, shape=tag, velo=76)]
        e.resolve_speeds(A)
        for same in (True, False):
            tc = e.profile_terms(A[1], "down-away", e.Situation(0, 0, 0, (False, False, False), level="college_d3", same_side=same), A)
            th = e.profile_terms(A[1], "down-away", e.Situation(0, 0, 0, (False, False, False), level="hs", same_side=same), A)
            worst_hs = max(worst_hs, max(abs(th[k] - e.RHO_L["hs"] * tc[k]) for k in tc))
check("Step 2 at HS: every profile term is 0.6 x its college value (same speeds), for every kind and tag, both sides (to "
      "0.005 logit: the HS rows are the college rows x 0.85 rounded to 0.1 in.)", worst_hs < 0.005, f"largest difference {worst_hs:.1e}")

# 2e grounders
g_ok = all(e.gb_rate(e.Pitch("x", k, grade=3, command=3, conf=0.7, shape=t)) == T2["GB_PROFILE"][f"{k}|{t}"]
           for k in e.KINDS for t in e.SHAPE_TAGS[k])
small = [p for p, v in fit2["2e"].items() if v["n"] < 200]
check("Step 2e: gb_rate is the 2024 grounder rate by kind and profile; a profile with under 200 balls in play uses its kind's rate "
      f"({', '.join(small)})", g_ok and all(T2["GB_PROFILE"][p] != round(fit2["2e"][p]["gb"], 4) for p in small))

# ------------------------------------------------------------------ Step 3: setup and payoff rules (plan 2.4)
_P3 = lambda n, k, sh, cmd=3, v=None: e.Pitch(n, k, 3, cmd, 0.75, shape=sh, velo=v)
_E0 = (False, False, False)
_ent = lambda n, q, r, landed=None, contact=None, read=None: (n, q, r, landed, contact, read)
A_si = [_P3("Sinker", "SI", "run", v=89), _P3("Slider", "SL", "sweeper"), _P3("Changeup", "CH", "fade")]
A_rf = [_P3("Fastball", "FB", "rides", v=91), _P3("Slider", "SL", "tight"), _P3("Changeup", "CH", "fade")]
A_ed = [_P3("Fastball", "FB", "", v=90), _P3("Cutter", "FC", "hard"), _P3("Slider", "SL", "tight")]
A_fd = [_P3("Sinker", "SI", "run", cmd=4, v=88), _P3("Curve", "CB", ""), _P3("Changeup", "CH", "fade")]
sp = lambda ars, nm, q, s_: e.setup_payoff(next(x for x in ars if x.name == nm), q, s_, ars)
S = lambda b, k, log, same=True, **kw: e.Situation(b, k, 1, _E0, level="college_d3", same_side=same, pa_log=tuple(log), **kw)
rows3 = [  # (label, arsenal, situation, payoff call, rule expected or None)
    ("S2 fires after a sinker in taken for a strike", A_si, S(0, 1, [_ent("Sinker", "up-in", "cstrike")]), ("Slider", "down-away"), "S2"),
    ("S2 no read on a foul in: unknown, no fire", A_si, S(0, 1, [_ent("Sinker", "up-in", "foul")]), ("Slider", "down-away"), None),
    ("S2 opposite-way foul in (late): fires", A_si, S(0, 1, [_ent("Sinker", "up-in", "foul", read="opposite")]), ("Slider", "down-away"), "S2"),
    ("S2 pulled foul in (on time): no fire", A_si, S(0, 1, [_ent("Sinker", "up-in", "foul", read="pull")]), ("Slider", "down-away"), None),
    ("S2 opposite-side hitter: no fire (S3's job)", A_si, S(0, 1, [_ent("Sinker", "up-in", "cstrike")], same=False), ("Slider", "down-away"), None),
    ("S2 a ball in that landed way off: no fire", A_si, S(1, 0, [_ent("Sinker", "up-in", "ball", "way")]), ("Slider", "down-away"), None),
    ("S2 a ball in, no cell logged: no fire (may have been wild)", A_si, S(1, 0, [_ent("Sinker", "up-in", "ball")]), ("Slider", "down-away"), None),
    ("S2 a ball in logged next to the target: fires", A_si, S(1, 0, [_ent("Sinker", "down-in", "ball", (3, 0, True))]), ("Slider", "down-away"), "S2"),
    ("S7 whiff up, no read: fires at two strikes", A_rf, S(0, 2, [_ent("Fastball", "up-in", "cstrike"), _ent("Fastball", "up-away", "whiff")]), ("Fastball", "chase"), "S7"),
    ("S7 out-in-front whiff: no fire", A_rf, S(0, 2, [_ent("Fastball", "up-in", "cstrike"), _ent("Fastball", "up-away", "whiff", read="front")]), ("Fastball", "chase"), None),
    ("S7 fouled straight back: no fire (squared up)", A_rf, S(0, 2, [_ent("Fastball", "up-in", "cstrike"), _ent("Fastball", "up-away", "foul", read="back")]), ("Fastball", "chase"), None),
    ("S7 under two strikes: no fire", A_rf, S(0, 1, [_ent("Fastball", "up-away", "whiff")]), ("Fastball", "chase"), None),
    ("S9 early outside-edge fastball, two-strike slider away: fires", A_ed, S(1, 2, [_ent("Fastball", "down-away", "cstrike"), _ent("Slider", "middle", "foul"), _ent("Cutter", "up-in", "ball", (0, 0, True))]), ("Slider", "chase"), "S9"),
    ("S5 back door: worked away soft earlier, two strikes, command 4 curve? (curve command 3): no fire", A_fd, S(1, 2, [_ent("Changeup", "down-away", "whiff"), _ent("Curve", "down-away", "cstrike"), _ent("Sinker", "up-in", "ball", (1, 4, False))], same=False), ("Curve", "down-away"), None),
    ("S5 front door: run sinker (command 4) in to an opposite-side hitter after soft away, two strikes: fires", A_fd, S(1, 2, [_ent("Changeup", "down-away", "whiff"), _ent("Curve", "down-away", "cstrike"), _ent("Sinker", "up-away", "ball", (1, 4, False))], same=False), ("Sinker", "down-in"), "S5"),
    ("N2 sinker right after a changeup: a cost", A_fd, S(0, 1, [_ent("Changeup", "down-away", "cstrike")]), ("Sinker", "down-in"), "N2"),
    ("no credit at three balls (S2's pattern at 3-1)", A_si, S(3, 1, [_ent("Sinker", "up-in", "cstrike"), _ent("Slider", "chase", "ball"), _ent("Slider", "chase", "ball"), _ent("Slider", "chase", "ball")]), ("Slider", "down-away"), None),
    ("no chase payoff where the count has no chase target (2-2)", A_rf, S(2, 2, [_ent("Fastball", "up-in", "whiff"), _ent("Fastball", "up-away", "whiff"), _ent("Slider", "chase", "ball"), _ent("Slider", "chase", "ball")]), ("Fastball", "chase"), None),
]
bad3 = []
for lab, ars, s_, call, want in rows3:
    v, rule, ent = sp(ars, call[0], call[1], s_)
    got = rule if (v != 0) else None
    if got != want or (want == "N2" and v >= 0) or (want not in (None, "N2") and v <= 0):
        bad3.append(f"{lab}: got {rule} {v:+.4f}")
check(f"Step 3 rules: each fires on its pattern and stays silent on its 'doesn't fire' cases, the no-read cases included "
      f"({len(rows3)} cases: S2, S5, S7, S9, N2, three balls, no chase at 2-2; S1, S3, S4, S6 in tests_v11_explain)", not bad3, "; ".join(bad3[:4]))

# the cap: setup <= 0.02 x run scale; coach + setup <= max(coach, 0.02 x run scale)
saved_sr = dict(e.SETUP_RULE)
try:
    for k_ in e.SETUP_RULE:
        e.SETUP_RULE[k_] = 0.05
    cap_v = sp(A_si, "Slider", "down-away", S(0, 1, [_ent("Sinker", "up-in", "cstrike")]))[0]
finally:
    e.SETUP_RULE.update(saved_sr)
s_cap = S(0, 1, [_ent("Sinker", "up-in", "cstrike")], matchup={"succ|SL|down-away": 1})
tab_c = e.solve_table(A_si, replace(s_cap, pa_log=()))
c_with = e.cost08(A_si[1], "down-away", s_cap, A_si, tab_c, tab_c.h0, ("mix", tab_c.sigma[(0, 1)]))[0]
c_none = e.cost08(A_si[1], "down-away", replace(s_cap, pa_log=()), A_si, tab_c, tab_c.h0, ("mix", tab_c.sigma[(0, 1)]))[0]
cc_ = e.coach_credit(A_si[1], "down-away", s_cap, A_si)
moved_ = (c_none - c_with) / e.run_scale("college_d3")
s_nc = replace(s_cap, matchup={})                                         # no coach read: the setup credit applies
c_with2 = e.cost08(A_si[1], "down-away", s_nc, A_si, tab_c, tab_c.h0, ("mix", tab_c.sigma[(0, 1)]))[0]
c_none2 = e.cost08(A_si[1], "down-away", replace(s_nc, pa_log=()), A_si, tab_c, tab_c.h0, ("mix", tab_c.sigma[(0, 1)]))[0]
moved2 = (c_none2 - c_with2) / e.run_scale("college_d3")
check("Step 3 cap: a setup credit is at most 0.02 x run scale, and coach + setup at most max(coach, 0.02): with the "
      "went-back read (0.03) on, the setup adds nothing; without it, the setup credit applies in full",
      abs(cap_v - e.SETUP_CAP) < 1e-12 and abs(moved_) < 1e-12 and cc_ >= e.SETUP_CAP
      and abs(moved2 - e.SETUP_RULE["S2"]) < 1e-12,
      f"credit with every size at 0.05: {cap_v}; coach {cc_:.3f} -> setup adds {moved_:.4f}; no coach read -> {moved2:.4f}")

# root only: pa_log is empty in every table solve
seen_pa = []
_orig_cost08 = e.cost08
def _spy(p, q, s_, *a, **k):
    seen_pa.append(len(s_.pa_log))
    return _orig_cost08(p, q, s_, *a, **k)
e.cost08 = _spy
try:
    e.solve_table(A_si, S(0, 1, [_ent("Sinker", "up-in", "cstrike")]))
finally:
    e.cost08 = _orig_cost08
check("Step 3 root only: every cost inside a table solve sees an empty pa_log, even when the live situation has one",
      seen_pa and max(seen_pa) == 0, f"{len(seen_pa)} cost evaluations")

# tie-break: exact ties only, at most 5 points, never at three balls
pi_t = {("Fastball", "up-in"): 0.5, ("Slider", "down-away"): 0.5}
full_t = {("Fastball", "up-in"): 1.0, ("Slider", "down-away"): 1.0}
_orig_en = e.enables_payoff
e.enables_payoff = lambda a, ars, s_, ex=None: a == ("Fastball", "up-in")
try:
    tb_tie = e.tie_break(pi_t, full_t, A_rf, S(0, 0, []))
    tb_far = e.tie_break(pi_t, {**full_t, ("Fastball", "up-in"): 1.0 + 0.01}, A_rf, S(0, 0, []))
    tb_three = e.tie_break(pi_t, full_t, A_rf, S(3, 0, []))
finally:
    e.enables_payoff = _orig_en
check("Step 3 tie-break: an exact tie moves 5 points to the setup-enabling call (the cap); outside the noise margin nothing "
      "moves; nothing at three balls", abs(tb_tie[("Fastball", "up-in")] - 0.55) < 1e-12 and tb_far == pi_t and tb_three == pi_t,
      f"tie {tb_tie}")

# both engines: setup_payoff on these cases and on random at-bats
rng3 = random.Random(31)
cases3 = []
for lab, ars, s_, call, want in rows3:
    cases3.append(dict(ars=[dict(name=x.name, kind=x.kind, shape=x.shape, grade=x.grade, command=x.command, conf=x.conf, velo=x.velo) for x in ars],
                       b=s_.balls, k=s_.strikes, same=s_.same_side, log=[list(z) for z in s_.pa_log], call=list(call)))
for _ in range(400):
    ars = rng3.choice([A_si, A_rf, A_ed, A_fd])
    log = []
    for _j in range(rng3.randrange(1, 5)):
        x = rng3.choice(ars)
        res = rng3.choice(["ball", "cstrike", "whiff", "foul", "foul"])
        u = rng3.random()
        landed = None if u < 0.5 else ("way" if u < 0.6 else [rng3.randrange(5), rng3.randrange(5), rng3.random() < 0.5])
        rd = rng3.choice([None, "front", "late", "fooled"]) if res == "whiff" else (rng3.choice([None, "pull", "opposite", "back"]) if res == "foul" else None)
        log.append([x.name, rng3.choice(e.QUADS), res, landed, None, rd])
    cases3.append(dict(ars=[dict(name=x.name, kind=x.kind, shape=x.shape, grade=x.grade, command=x.command, conf=x.conf, velo=x.velo) for x in ars],
                       b=rng3.randrange(4), k=rng3.randrange(3), same=rng3.random() < 0.5, log=log,
                       call=[rng3.choice(ars).name, rng3.choice(e.QUADS)]))
def _py3(c):
    A = [e.Pitch(**d) for d in c["ars"]]
    e.resolve_speeds(A)
    log = tuple(tuple(tuple(v) if isinstance(v, list) else v for v in z) for z in c["log"])
    s_ = e.Situation(c["b"], c["k"], 1, _E0, level="college_d3", same_side=c["same"], pa_log=log)
    v, r, _x = e.setup_payoff(next(x for x in A if x.name == c["call"][0]), c["call"][1], s_, A)
    return [round(v, 12), r]
py3 = [_py3(c) for c in cases3]
js3 = json.loads(subprocess.run(["node", "-e", """
const E=require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const C=JSON.parse(require('fs').readFileSync(0,'utf8'));
console.log(JSON.stringify(C.map((c)=>{ const A=c.ars.map((d)=>E.Pitch(d)); E.resolveSpeeds(A);
  const s=E.Situation({balls:c.b,strikes:c.k,outs:1,bases:[false,false,false],level:'college_d3',same_side:c.same,pa_log:c.log});
  const r=E.v08.setupPayoff(A.find((x)=>x.name===c.call[0]), c.call[1], s, A); return [Math.round(r[0]*1e12)/1e12, r[1]]; })))"""],
    input=json.dumps(cases3), cwd=HERE, capture_output=True, text=True, check=True).stdout)
diff3 = [i for i, (a, b) in enumerate(zip(py3, js3)) if a != b]
fired3 = sum(1 for v in py3 if v[0] != 0)
check("Step 3 parity: setup_payoff in Python and JS agree on the rule cases and 400 random at-bats",
      not diff3, f"{len(diff3)} differ; {fired3} of {len(py3)} credited")

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
