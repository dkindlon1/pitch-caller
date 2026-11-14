"""v1.2 checks (docs/PLAN_v1.2_2026-11-13.md). Step 1: the location model's structure (miss lean and spread per pitch).
At lean 0 / spread 1 every number is v1.1's exactly, measured against the real v1.1 engine read from git (`git archive
14e0ad2`). With a lean: directions, the counted-once HBP factor, the re-solve trigger, validation, and Python = JS.

  python3 tests_v12.py            -> runs every check, exits non-zero on a failure
"""
import io, json, os, random, subprocess, sys, tarfile, tempfile
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as e
from simulate import _load_call_engine

V11 = "14e0ad2"
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""))


def v11_engine():
    blob = subprocess.run(["git", "archive", V11], cwd=HERE, capture_output=True, check=True).stdout
    d = tempfile.mkdtemp(prefix="v11tree_")
    tarfile.open(fileobj=io.BytesIO(blob)).extractall(d, filter="data")
    return _load_call_engine(os.path.join(d, "engine.py"))


old = v11_engine()
LEVELS = ("hs", "college_d3", "college_d1", "mlb")
QS = e.QUADS
TAGS = {k: list(v) for k, v in e.SHAPE_TAGS.items()}


def rand_case(rng, lean=False):
    kind = rng.choice(e.KINDS)
    kw = dict(grade=rng.randint(1, 5), command=rng.randint(1, 5), conf=round(rng.uniform(0.3, 0.95), 3),
              shape=rng.choice(TAGS[kind]))
    if rng.random() < 0.3:
        kw["traits"] = {"miss_heart": round(rng.uniform(-1, 1), 2)}
    if lean:
        kw.update(lean_x=round(rng.uniform(-4, 4), 2), lean_z=round(rng.uniform(-4, 4), 2),
                  spread=round(rng.choice([1.0, rng.uniform(0.7, 1.5)]), 3))
    p = dict(name="P", kind=kind, **kw)
    other = dict(name="O", kind="FB", grade=3, command=3, conf=0.7)
    s = dict(balls=rng.randint(0, 3), strikes=rng.randint(0, 2), outs=rng.randint(0, 2),
             bases=[rng.random() < 0.3, rng.random() < 0.3, rng.random() < 0.2], level=rng.choice(LEVELS),
             same_side=rng.random() < 0.5, pitch_count=rng.randint(0, 110),
             wild_true={"P": round(rng.uniform(-0.1, 0.3), 3)} if rng.random() < 0.4 else {})
    return p, other, s, rng.choice(QS)


def build(eng, p, other, s):
    P = eng.Pitch(**p)
    O = eng.Pitch(**other)
    S = eng.Situation(s["balls"], s["strikes"], s["outs"], tuple(s["bases"]), level=s["level"], same_side=s["same_side"],
                      pitch_count=s["pitch_count"], wild_true=dict(s["wild_true"]))
    return P, O, S


# ------------------------------------------------------------------ 1. exactness at lean 0 against the real v1.1 engine
rng = random.Random(12)
diff_l = diff_o = 0
n = 2000
for _ in range(n):
    p, other, s, q = rand_case(rng)
    P, O, S = build(e, p, other, s)
    P0, O0, S0 = build(old, p, other, s)
    a, b = e.landing(P, q, S), old.landing(P0, q, S0)
    diff_l += any(a[k] != b[k] for k in e.ZONES)
    oa, ob = e.outcome_probs(P, q, S, [P, O]), old.outcome_probs(P0, q, S0, [P0, O0])
    diff_o += any(oa[k] != ob[k] for k in oa)
check(f"exact at lean 0: landing() equals v1.1's ({V11}) bit for bit on {n} random pitches / situations / targets",
      diff_l == 0, f"{diff_l} differ")
check(f"exact at lean 0: outcome_probs() equals v1.1's bit for bit on the same {n}", diff_o == 0, f"{diff_o} differ")
check("a pitch with no lean has lean 0 / 0 and spread 1 and runs none of the v1.2 code",
      not e.has_lean(e.Pitch("X", "FB", grade=3, command=3, conf=0.7)) and e.lean_hbp_wp(
          e.Pitch("X", "FB", grade=3, command=3, conf=0.7), "up-in", e.Situation(0, 0, 0, (False,) * 3)) == (1.0, 1.0))

# ------------------------------------------------------------------ 2. the geometry
s_d3 = e.Situation(1, 0, 0, (False,) * 3, level="college_d3", same_side=True)
base = dict(grade=3, command=3, conf=0.7)
si = e.Pitch("Sinker", "SI", shape="run", **base)
z0 = e.landing(si, "up-in", s_d3)
toward = e.landing(replace(si, lean_x=2.7), "up-in", s_d3)      # arm side = inside to a same-side hitter: off the plate
back = e.landing(replace(si, lean_x=-2.7), "up-in", s_d3)       # glove side = back toward the plate
check("a lean toward the side the target is on moves misses off the plate (off + non-competitive up)",
      toward["off"] + toward["noncomp"] > z0["off"] + z0["noncomp"],
      f"{z0['off'] + z0['noncomp']:.3f} -> {toward['off'] + toward['noncomp']:.3f}")
check("a lean toward the plate pulls misses over the heart", back["heart"] > z0["heart"], f"{z0['heart']:.3f} -> {back['heart']:.3f}")
opp = replace(s_d3, same_side=False)
check("lean_x is in the pitcher's frame: the same arm-side lean on an inside target to an opposite-side hitter (his glove "
      "side) pulls toward the plate", e.landing(replace(si, lean_x=2.7), "up-in", opp)["heart"] > e.landing(si, "up-in", opp)["heart"])
check("height works the same way: an up lean on an up target moves misses off the top",
      e.landing(replace(si, lean_z=2.7), "up-away", s_d3)["noncomp"] > e.landing(si, "up-away", s_d3)["noncomp"])
check("a wider spread puts more mass way off; a tighter one less",
      e.landing(replace(si, spread=1.4), "down-away", s_d3)["noncomp"] > e.landing(si, "down-away", s_d3)["noncomp"]
      > e.landing(replace(si, spread=0.7), "down-away", s_d3)["noncomp"])

# the HBP curve and the research doc's geometry (results/v12/lean_hbp_geometry.txt: x1.94 at sigma 8, x1.56 at sigma 11)
r8 = e._geo_hbp_weight(20 / 3 + 2.7, 8.0) / e._geo_hbp_weight(20 / 3, 8.0)
r11 = e._geo_hbp_weight(20 / 3 + 2.7, 11.0) / e._geo_hbp_weight(20 / 3, 11.0)
check("the engine's HBP curve reproduces the research doc: a +2.7 in. lean on an inside target x1.94 at sigma 8, x1.56 at 11",
      abs(r8 - 1.94) < 0.03 and abs(r11 - 1.56) < 0.03, f"x{r8:.3f}, x{r11:.3f}")

# counted once: the engine's total HBP change equals the geometry's at the solved sigma (within 10%)
worst = 0.0
for lvl in LEVELS:
    for sd_side in (True, False):
        S = e.Situation(1, 0, 0, (False,) * 3, level=lvl, same_side=sd_side)
        for lx in (1.5, 2.7, -2.7):
            P1 = replace(si, lean_x=lx)
            h0 = e.outcome_probs(si, "up-in", S, [si])["hbp"]
            h1 = e.outcome_probs(P1, "up-in", S, [P1])["hbp"]
            mx, mz, l_b, lz, sd, sp = e.lean_geometry(P1, "up-in", S, e.landing_pre(si, "up-in", S))
            g = e._geo_hbp_weight(mx + l_b, sd) / e._geo_hbp_weight(mx, sd)
            worst = max(worst, abs((h1 / h0) / g - 1))
check("HBP counted once: the engine's HBP change with a lean matches the geometry's at the solved miss size, within 10% "
      "(4 levels x both sides x 3 leans, inside target)", worst < 0.10, f"worst {worst:.1%}")

# the solved miss size and how well 2 parameters match landing()'s split (reported against the plan's 0.03)
err, sig, by_t = 0.0, {}, {}
for lvl in LEVELS:
    for cmd in (1, 3, 5):
        for conf in (0.4, 0.7, 0.9):
            for k in ("FB", "SL"):
                P = e.Pitch("X", k, grade=3, command=cmd, conf=conf)
                S = e.Situation(1, 0, 0, (False,) * 3, level=lvl)
                for q in QS:
                    zp = e.landing_pre(P, q, S)
                    mx, mz = e.geo_target(P, q)
                    sd = e.geo_sigma(mx, mz, 1 - zp["noncomp"])
                    g = e.geo_shares(mx, mz, sd, sd)
                    t = sum(zp.values())
                    er = max(abs(g[z] - zp[z] / t) for z in ("heart", "edge", "off"))
                    err = max(err, er)
                    grp = "corner" if q in ("up-in", "up-away", "down-in", "down-away") else q
                    by_t[grp] = max(by_t.get(grp, 0.0), er)
                    if k == "FB" and cmd == 3 and conf == 0.7 and q == "up-in":
                        sig[lvl] = round(sd, 1)
check("REPORTED: the 2-parameter miss model vs landing()'s heart / edge / off split at lean 0 (plan tolerance 0.03; "
      "exactness never depends on it, only the difference is used)", True,
      f"largest share error {err:.3f} ({'within' if err <= 0.03 else 'OVER'} 0.03); by target "
      f"{ {k: round(v, 3) for k, v in by_t.items()} }; solved miss size, average fastball up-in: {sig}")

# ------------------------------------------------------------------ 3. re-solve, validation
ars = [e.Pitch("Sinker", "SI", shape="run", **base), e.Pitch("Slider", "SL", **base)]
fz = e.frozen_inputs(ars, s_d3)
check("re-solve: an unchanged arsenal doesn't re-solve; changing only a lean does",
      not e.needs_resolve(fz, ars, s_d3) and e.needs_resolve(fz, [replace(ars[0], lean_x=1.5), ars[1]], s_d3))
fz_old = dict(fz); fz_old.pop("lean")
check("re-solve: a frozen table from before leans existed counts as lean 0 (no needless re-solve; a lean re-solves)",
      not e.needs_resolve(fz_old, ars, s_d3) and e.needs_resolve(fz_old, [ars[0], replace(ars[1], spread=1.2)], s_d3))
bad = []
for kw in ({"lean_x": 6.5}, {"lean_z": -7}, {"spread": 0.4}, {"spread": 2.5}):
    try:
        e.check_inputs([e.Pitch("X", "FB", **base, **kw)], s_d3); bad.append(kw)
    except ValueError:
        pass
check("validation rejects a lean past 6 in. or a spread outside 0.5-2", not bad, f"accepted {bad}")

# ------------------------------------------------------------------ 4. Python = JS, with leans
rng = random.Random(34)
cases = [rand_case(rng, lean=True) for _ in range(600)]
js = subprocess.run(["node", "-e", """
const E = require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = cases.map(([p, o, s, q]) => {
  const P = E.Pitch(p), O = E.Pitch(o);
  const S = E.Situation({ balls: s.balls, strikes: s.strikes, outs: s.outs, bases: s.bases, level: s.level, same_side: s.same_side,
    pitch_count: s.pitch_count, wild_true: s.wild_true });
  return { land: E.landing(P, q, S), r: E.v12.leanHbpWp(P, q, S), op: E.outcomeProbs(P, q, S, [P, O]) };
});
console.log(JSON.stringify(out));"""], cwd=HERE, input=json.dumps(cases), capture_output=True, text=True, check=True)
J = json.loads(js.stdout)
worst = 0.0
for (p, other, s, q), j in zip(cases, J):
    P, O, S = build(e, p, other, s)
    la, r, op = e.landing(P, q, S), e.lean_hbp_wp(P, q, S), e.outcome_probs(P, q, S, [P, O])
    worst = max([worst] + [abs(la[k] - j["land"][k]) for k in la] + [abs(r[0] - j["r"][0]), abs(r[1] - j["r"][1])]
                + [abs(op[k] - j["op"][k]) for k in op])
check("Python = JS on 600 random pitches with leans and spreads: landing, the HBP / wild-pitch factors, outcome_probs",
      worst < 1e-12, f"largest difference {worst:.1e}")
x = [i / 7 - 6 for i in range(85)]
jn = json.loads(subprocess.run(["node", "-e", "const E=require('./app/engine.js');E.init(require('./app/engine_data.json'));console.log(JSON.stringify("
                                + json.dumps(x) + ".map(E.v12.geoNcdf)))"], cwd=HERE, capture_output=True, text=True,
                               check=True).stdout)
check("one CDF in both engines (Abramowitz & Stegun 7.1.26)", max(abs(e.geo_ncdf(a) - b) for a, b in zip(x, jn)) < 1e-15)

# ------------------------------------------------------------------ 5. a directional "Way off" cell (Step 3/4)
ars_s = [e.Pitch("Fastball", "FB", grade=3, command=3, conf=0.8, shape="rides", velo=88),
         e.Pitch("Changeup", "CH", grade=3, command=3, conf=0.7, shape="fade", velo=79)]
e.resolve_speeds(ars_s)
cells = [[1, 4, True], [2, 5, True], [-1, 4, True], [5, 3, True]]
py = []
_S4_SAVED = e.SETUP_RULE["S4"]; e.SETUP_RULE["S4"] = _S4_SAVED or 0.005   # v1.2 Step 5 dropped S4 (0): its logic is checked at a test size
for c in cells:
    S = e.Situation(0, 1, 0, (False,) * 3, level="college_d3", pa_log=(("Fastball", "up-away", "cstrike", tuple(c), None, None),))
    py.append(e.setup_payoff(ars_s[1], "down-away", S, ars_s)[0])
jsv = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const ars = [E.Pitch({ name: 'Fastball', kind: 'FB', grade: 3, command: 3, conf: 0.8, shape: 'rides', velo: 88 }),
  E.Pitch({ name: 'Changeup', kind: 'CH', grade: 3, command: 3, conf: 0.7, shape: 'fade', velo: 79 })];
E.resolveSpeeds(ars); E.v08.SETUP_RULE.S4 = E.v08.SETUP_RULE.S4 || 0.005;
console.log(JSON.stringify(""" + json.dumps(cells) + """.map((c) => E.v08.setupPayoff(ars[1], 'down-away',
  E.Situation({ balls: 0, strikes: 1, outs: 0, bases: [false, false, false], level: 'college_d3', pa_log: [['Fastball', 'up-away', 'cstrike', c, null, null]] }), ars)[0])));
"""], cwd=HERE, capture_output=True, text=True, check=True).stdout)
check("a directional Way off cell (outside the 5x5 grid) counts as way off: no setup credit, both engines (an in-grid cell "
      "at the target still credits)", py[0] > 0 and py[1:] == [0.0, 0.0, 0.0] and all(abs(a - b) < 1e-15 for a, b in zip(py, jsv)),
      f"python {py}, js {jsv}")

# ------------------------------------------------------------------ 6. Step 5 follow-ups (plan 2.7)
# HS ride-up x RHO_L (Q5)
_ru = e.Pitch("Fastball", "FB", grade=3, command=3, conf=0.8, shape="rides", velo=88)
_cc = {lv: e.coach_credit(_ru, "up-away", e.Situation(1, 2, 0, (False,) * 3, level=lv)) for lv in ("hs", "travel", "college_d3", "college_d1", "mlb")}
_ccj = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const p = E.Pitch({ name: 'Fastball', kind: 'FB', grade: 3, command: 3, conf: 0.8, shape: 'rides', velo: 88 });
const out = {}; for (const lv of ['hs', 'travel', 'college_d3', 'college_d1', 'mlb']) out[lv] = E.v08.coachCredit(p, 'up-away', E.Situation({ balls: 1, strikes: 2, outs: 0, bases: [false, false, false], level: lv }));
console.log(JSON.stringify(out));"""], cwd=HERE, capture_output=True, text=True, check=True).stdout)
check("Step 5 (Q5): the riding four-seam up with two strikes gets 0.008 x RHO_L: 0.0048 at HS and travel, 0.008 at college and "
      "MLB; both engines", all(abs(_cc[lv] - 0.008 * e.RHO_L.get(lv, 1.0)) < 1e-15 and abs(_ccj[lv] - _cc[lv]) < 1e-15 for lv in _cc), str(_cc))
# S4 narrowed (L7): the fastball away went for a strike, and the payoff is 8+ mph slower
_S4 = [  # (setup result, payoff kind, shape, payoff mph, fires)
    ("cstrike", "CH", "fade", 81, True), ("foul", "CH", "fade", 81, True), ("whiff", "CB", "", 80, True), ("ball", "CH", "fade", 81, False),
    ("cstrike", "CH", "fade", 82, False), ("cstrike", "CB", "", 82, False), ("cstrike", "CH", "firm", 80, False)]
def _s4py(res, k, sh, v):
    a = [e.Pitch("Fastball", "FB", grade=3, command=3, conf=0.8, velo=89), e.Pitch("Payoff", k, grade=3, command=3, conf=0.7, shape=sh, velo=v)]
    e.resolve_speeds(a)
    S = e.Situation(1, 1, 0, (False,) * 3, level="college_d3", pa_log=(("Fastball", "up-away", res, (1, 4, True), None, None),))
    c, rule, _ = e.setup_payoff(a[1], "down-away", S, a)
    return rule == "S4" and c > 0
_s4j = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js'); E.init(require('./app/engine_data.json')); E.v08.SETUP_RULE.S4 = E.v08.SETUP_RULE.S4 || 0.005;
console.log(JSON.stringify(""" + json.dumps([list(x[:4]) for x in _S4]) + """.map(([res, k, sh, v]) => {
  const a = [E.Pitch({ name: 'Fastball', kind: 'FB', grade: 3, command: 3, conf: 0.8, velo: 89 }), E.Pitch({ name: 'Payoff', kind: k, grade: 3, command: 3, conf: 0.7, shape: sh, velo: v })];
  E.resolveSpeeds(a);
  const r = E.v08.setupPayoff(a[1], 'down-away', E.Situation({ balls: 1, strikes: 1, outs: 0, bases: [false, false, false], level: 'college_d3', pa_log: [['Fastball', 'up-away', res, [1, 4, true], null, null]] }), a);
  return r[1] === 'S4' && r[0] > 0; })));"""], cwd=HERE, capture_output=True, text=True, check=True).stdout)
_s4p = [_s4py(*x[:4]) for x in _S4]
e.SETUP_RULE["S4"] = _S4_SAVED
check("Step 5 (L7): S4 fires only after a fastball away for a strike (called, foul or whiff) with a payoff 8+ mph slower "
      "(changeup not firm, or curve); not after a ball, not at 7 mph, not a firm changeup; both engines",
      _s4p == [x[4] for x in _S4] and _s4j == _s4p, f"python {_s4p}, js {_s4j}")
check("Step 5 (L7): S2, S4 and S5 dropped to 0: S2 / S4's lifting sizes (0.004, 0.005) put the credit-only change rate at "
      "17-22% on the three staffs; S5 (0.004) kept the band but put 2 of game_mix_e2e's 21 games over 70% (Drew: drop it); both engines",
      e.SETUP_RULE["S2"] == 0.0 and e.SETUP_RULE["S4"] == 0.0 and e.SETUP_RULE["S5"] == 0.0 and json.loads(subprocess.run(
          ["node", "-e", "const E=require('./app/engine.js');console.log(JSON.stringify(E.v08.SETUP_RULE))"], cwd=HERE, capture_output=True,
          text=True, check=True).stdout) == e.SETUP_RULE, str({k: e.SETUP_RULE[k] for k in ("S2", "S4", "S5")}))
# S5's lean gate: a sinker leaning toward an opposite-side hitter (glove side for a righty against a lefty) pays the HBP cost
sys.path.insert(0, os.path.join(HERE, "readthrough"))
import scenarios as _SC
_doc = json.load(open(os.path.join(HERE, "readthrough", "scenarios_v11.json")))
_fr = next(r for r in _doc["rows"] if r["id"] == "S5f")
def _s5(lean):
    ars, S, ex = _SC.build(_doc, _fr)
    ars = [replace(x, lean_x=lean) if x.kind == "SI" else x for x in ars]
    return sum(pr for pr, _, k, q in _SC.call_dist("v09", ars, S, ex) if k == "SI" and q in ("up-in", "down-in"))
_S5_SAVED = e.SETUP_RULE["S5"]; e.SETUP_RULE["S5"] = _S5_SAVED or 0.004   # dropped (0): the gate's logic is checked at a test size
_g0, _gt, _ga = _s5(0.0), _s5(-3.0), _s5(3.0)
e.SETUP_RULE["S5"] = _S5_SAVED
check("Step 5 (L7): S5 re-gated by the lean: on its fire row the front-door sinker drops when it leans toward the opposite-side "
      "hitter (the HBP cost) and rises when it leans away", _gt < _g0 - 0.03 and _ga > _g0, f"sinker in {_g0:.1%}; leaning toward him {_gt:.1%}; away {_ga:.1%}")

# ------------------------------------------------------------------ 7. Step 6 (Drew, L5): high misses with two strikes are chases
_rf = e.Pitch("Fastball", "FB", grade=3, command=3, conf=0.8, shape="rides", velo=90, lean_z=3.0)
_rf0 = replace(_rf, lean_z=0.0)
_L = lambda st, q, p: e.landing(p, q, e.Situation(1, st, 0, (False,) * 3, level="college_d3"))
_two, _one = _L(2, "up-away", _rf), _L(1, "up-away", _rf)
_base2 = _L(2, "up-away", _rf0)
_dn = _L(2, "down-away", _rf)
_jl = js_land = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const p = E.Pitch({ name: 'Fastball', kind: 'FB', grade: 3, command: 3, conf: 0.8, shape: 'rides', velo: 90, lean_z: 3.0 });
const L = (st, q) => E.landing(p, q, E.Situation({ balls: 1, strikes: st, outs: 0, bases: [false, false, false], level: 'college_d3' }));
console.log(JSON.stringify([L(2, 'up-away'), L(1, 'up-away'), L(2, 'down-away')]));"""], cwd=HERE, capture_output=True, text=True, check=True).stdout)
check("Step 6 (Drew, L5): with two strikes, the way-off share an up lean adds to an up target lands in the chase band instead "
      "(not before two strikes, not on a down target); both engines",
      abs(_two["noncomp"] - _base2["noncomp"]) < 0.02 and _one["noncomp"] > _L(1, "up-away", _rf0)["noncomp"] + 0.01
      and all(abs(a[k] - b[k]) < 1e-12 for a, b in zip([_two, _one, _dn], _jl) for k in a),
      f"2 strikes way off {_base2['noncomp']:.3f} -> {_two['noncomp']:.3f}; 1 strike {_L(1, 'up-away', _rf0)['noncomp']:.3f} -> {_one['noncomp']:.3f}")

fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
