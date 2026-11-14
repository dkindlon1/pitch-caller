"""v1.2.2 checks (Drew, Nov 14): the confidence band under the cutoff.

A pitch within RAMP_W (0.10) under its level's cutoff is blended into the call by its band weight: the root call is the
weighted blend of the v1.2.1 call with it allowed and without it (every with / without combination when several are in
the band). Drew's decisions: width 0.10 (D1), mix when nothing clears the cutoff (D2), the band in every count (D3).

- No pitch in the band: calls exactly v1.2.1's (`git archive cb64db1`), bit for bit.
- At the band's edges the blend meets v1.2.1's calls (out at the bottom, trusted at the top).
- Smooth: confidence swept in 0.01 steps through the band; no pitch's share moves more than 5 points per step.
- Rules: never a chase at 3-0 / 3-1; a second shake-off of a band pitch keeps it out; a band pitch is never a setup payoff.
- Nothing trusted: a mix of his band pitches (D2), no longer 100% of one pitch that flips on 0.01.
- Python = JS on band cases; the time of a call on a solved table, worst case (every pitch in the band).

  python3 tests_v122.py           -> runs every check, exits non-zero on a failure
"""
import io, json, os, random, subprocess, sys, tarfile, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as e
from simulate import _load_call_engine

V121 = "cb64db1"
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""), flush=True)


def v121_engine():
    blob = subprocess.run(["git", "archive", V121], cwd=HERE, capture_output=True, check=True).stdout
    d = tempfile.mkdtemp(prefix="v121tree_")
    tarfile.open(fileobj=io.BytesIO(blob)).extractall(d, filter="data")
    return _load_call_engine(os.path.join(d, "engine.py"))


def call(eng, spec, sd, exclude=None, tab=None):
    ars = [eng.Pitch(**dict(d)) for d in spec]
    s = eng.Situation(sd["balls"], sd["strikes"], sd.get("outs", 0), tuple(sd.get("bases", (False, False, False))),
                      level=sd["level"], same_side=sd.get("same_side", True))
    pick, dist, tab, info = eng.call_v08(ars, s, rng=random.Random(1), exclude=exclude, tab=tab)
    return ars, s, pick, dist, tab, info


def mix(dist):
    m = {}
    for d in dist:
        m[d[2].name] = m.get(d[2].name, 0.0) + d[0]
    return m


def in_band(spec, level):
    cut = e.LEVEL[level]["cutoff"]
    return [d["name"] for d in spec if cut - e.RAMP_W < d["conf"] < cut]


FB = lambda c: dict(name="Fastball", kind="FB", grade=4, command=3, conf=c, shape="rides", velo=90)
SL = lambda c, g=4: dict(name="Slider", kind="SL", grade=g, command=3, conf=c, shape="sweeper")
CH = lambda c: dict(name="Changeup", kind="CH", grade=3, command=3, conf=c, shape="fade")
D3 = dict(balls=1, strikes=1, outs=1, level="college_d3")                    # cutoff 0.45, band 0.35-0.45
KINDS = ["FB", "SI", "FC", "SL", "CB", "CH"]
NAMES = {"FB": "Fastball", "SI": "Sinker", "FC": "Cutter", "SL": "Slider", "CB": "Curveball", "CH": "Changeup"}
LEVELS = ["hs", "college_d3", "college_d1", "mlb"]

check("band width 0.10 (Drew D1)", e.RAMP_W == 0.10, f"RAMP_W {e.RAMP_W}")

# --- 1. no pitch in the band: exactly v1.2.1 -----------------------------------------------------------------------
old = v121_engine()
rng = random.Random(122)
n_cases, diffs = 0, 0
while n_cases < 60:
    kinds = ["FB"] + rng.sample(KINDS[1:], rng.randint(1, 3))
    lvl = rng.choice(LEVELS)
    spec = [dict(name=NAMES[k], kind=k, grade=rng.randint(1, 5), command=rng.randint(1, 5),
                 conf=round(rng.uniform(0.15, 0.95), 2), shape=rng.choice(e.SHAPE_TAGS[k])) for k in kinds]
    if in_band(spec, lvl):
        continue
    sd = dict(balls=rng.randint(0, 3), strikes=rng.randint(0, 2), outs=rng.randint(0, 2),
              bases=[rng.random() < 0.3 for _ in range(3)], level=lvl, same_side=rng.random() < 0.5)
    ex = rng.sample([d["name"] for d in spec], rng.randint(0, 1)) * rng.randint(1, 2)
    a, b = call(e, spec, sd, ex), call(old, spec, sd, ex)
    n_cases += 1
    if [(d[0], d[1], d[2].name, d[3]) for d in a[3]] != [(d[0], d[1], d[2].name, d[3]) for d in b[3]] \
            or (a[2][0].name, a[2][1]) != (b[2][0].name, b[2][1]):
        diffs += 1
check("no pitch in the band: calls identical to v1.2.1 (cb64db1), dist, costs and pick, bit for bit", diffs == 0,
      f"{n_cases} random cases (every level, count and kind; some with shake-offs); {diffs} differ")

# --- 2. the band's edges meet v1.2.1 ------------------------------------------------------------------------------
worst_lo, worst_hi = 0.0, 0.0
for cnt in [(0, 0), (1, 2), (3, 1)]:
    sd = dict(D3, balls=cnt[0], strikes=cnt[1])
    base_out = mix(call(old, [FB(0.70), SL(0.35), CH(0.60)], sd)[3])         # slider out (v1.2.1)
    lo = mix(call(e, [FB(0.70), SL(0.35 + 1e-6), CH(0.60)], sd)[3])          # just into the band
    base_in = mix(call(old, [FB(0.70), SL(0.45), CH(0.60)], sd)[3])          # slider trusted (v1.2.1)
    hi = mix(call(e, [FB(0.70), SL(0.45 - 1e-6), CH(0.60)], sd)[3])          # just under the cutoff
    worst_lo = max(worst_lo, max(abs(lo.get(n, 0) - base_out.get(n, 0)) for n in set(lo) | set(base_out)))
    worst_hi = max(worst_hi, max(abs(hi.get(n, 0) - base_in.get(n, 0)) for n in set(hi) | set(base_in)))
# the top edge carries one small step: the PA table (future counts) keeps the trusted set, so it gains the pitch only at
# the cutoff itself (plan risk 3); bar 1 point, against the 27-49 points the cliff used to move
check("bottom of the band = v1.2.1 with the pitch out; top = v1.2.1 with it trusted within 1 point (D3, 0-0 / 1-2 / 3-1)",
      worst_lo < 1e-4 and worst_hi < 0.01, f"largest share difference {worst_lo:.1e} at the bottom, {worst_hi:.1e} at the top")

# --- 3. smooth through the band -----------------------------------------------------------------------------------
GRID = {
    "fb_sl_ch": lambda c: [FB(0.70), SL(c), CH(0.60)],
    "fb_cb": lambda c: [FB(0.70), dict(name="Curveball", kind="CB", grade=3, command=3, conf=c, shape="12-6")],
    "four": lambda c: [FB(0.70), SL(0.62, 3), dict(name="Curveball", kind="CB", grade=3, command=3, conf=c, shape="loopy"),
                       CH(0.60)],
    "fb_in_band": lambda c: [FB(c), SL(0.65), CH(0.60)],
}
worst, where, n_calls, over, n_steps = 0.0, "", 0, [], 0
for lvl in ["hs", "college_d3", "college_d1"]:
    cut = e.LEVEL[lvl]["cutoff"]
    steps = [round(cut - 0.11 + 0.01 * i, 4) for i in range(13)]            # cutoff - 0.11 ... cutoff + 0.01
    for name, f in GRID.items():
        for cnt in [(0, 0), (1, 2), (3, 1)]:
            sd = dict(balls=cnt[0], strikes=cnt[1], outs=1, level=lvl)
            ms = []
            for c in steps:
                ms.append(mix(call(e, f(c), sd)[3]))
                n_calls += 1
            names = set().union(*ms)
            # the band is linear in its weight: each 0.01 moves a pitch about a tenth of its whole with / without difference
            # (bottom of the band vs the cutoff). Slack 1.5 points for the two things on top of the weight: the pitch's
            # own landing improves as its confidence rises inside the band, and the PA table gains it only at the cutoff
            span = {n: abs(ms[-2].get(n, 0) - ms[1].get(n, 0)) for n in names}
            for i in range(1, len(ms)):
                for n in names:
                    d = abs(ms[i].get(n, 0) - ms[i - 1].get(n, 0))
                    n_steps += 1
                    if d > worst:
                        worst, where = d, f"{lvl} {name} {cnt[0]}-{cnt[1]}, {n} at conf {steps[i]:.2f}"
                    if d > span[n] / 10 + 0.015 + 1e-9:
                        over.append((lvl, name, cnt, n, steps[i - 1], steps[i], d, span[n] / 10 + 0.015))
# A step over the bar is explained only if it goes away with the v1.1 setup tie-break off (TIE_CAP 0): that rule moves up
# to 5 points between near-tied calls, can switch which call it takes from on a small change, and does so in v1.2.1 too.
explained, unexplained = [], []
saved = e.TIE_CAP
try:
    e.TIE_CAP = 0.0
    for (lvl, name, cnt, n, c0, c1, d, bar) in over:
        sd = dict(balls=cnt[0], strikes=cnt[1], outs=1, level=lvl)
        a, b = mix(call(e, GRID[name](c0), sd)[3]), mix(call(e, GRID[name](c1), sd)[3])
        d0 = abs(b.get(n, 0) - a.get(n, 0))
        (explained if d0 <= bar + 1e-9 else unexplained).append(
            f"{lvl} {name} {cnt[0]}-{cnt[1]} {n} {c0:.2f}->{c1:.2f}: {d * 100:.1f} pts, {d0 * 100:.1f} with the tie-break off")
finally:
    e.TIE_CAP = saved
check("smooth: through the band, each 0.01 of confidence moves a pitch at most a tenth of its with / without difference "
      "plus 1.5 points (a step over that must be the setup tie-break's)", not unexplained,
      f"{n_calls} calls, {n_steps} steps (HS / D3 / D1, 4 arsenals, 0-0 / 1-2 / 3-1); largest step {worst * 100:.1f} points "
      f"({where}); over the bar: {len(over)}, explained by the tie-break {explained}, not explained {unexplained}")

# --- 4. the rules -------------------------------------------------------------------------------------------------
rng = random.Random(1222)
chase, n_band = 0, 0
for i in range(60):
    lvl = rng.choice(LEVELS)
    cut = e.LEVEL[lvl]["cutoff"]
    kinds = ["FB"] + rng.sample(KINDS[1:], rng.randint(1, 3))
    spec = [dict(name=NAMES[k], kind=k, grade=rng.randint(1, 5), command=rng.randint(1, 5),
                 conf=round(rng.uniform(cut - 0.10, cut + 0.30), 2), shape=rng.choice(e.SHAPE_TAGS[k])) for k in kinds]
    spec[rng.randrange(len(spec))]["conf"] = round(cut - rng.uniform(0.01, 0.09), 3)   # at least one in the band
    sd = dict(balls=3, strikes=rng.randint(0, 1), outs=rng.randint(0, 2), level=lvl, same_side=rng.random() < 0.5)
    d = call(e, spec, sd)[3]
    n_band += 1
    chase += sum(1 for x in d if x[3] == "chase" and x[0] > 0)
check("never a chase at 3-0 or 3-1 with pitches in the band", chase == 0, f"{n_band} random states, {chase} chase calls")

band_sl = [FB(0.70), SL(0.42), CH(0.60)]
m1 = mix(call(e, band_sl, D3, ["Slider"])[3])
m2 = mix(call(e, band_sl, D3, ["Slider", "Slider"])[3])
check("a band pitch shaken off is out for the at-bat (once or twice)", "Slider" not in m1 and "Slider" not in m2, f"{m1} / {m2}")

ars = [e.Pitch(**d) for d in band_sl]
s = e.Situation(0, 1, 0, (False, False, False), level="college_d3")
pay = [e.setup_payoff(ars[1], q, s, ars)[0] for q in e.targets(0, 1)]
check("a band pitch is never a setup payoff (check 3 keeps the trusted set)", all(v == 0 for v in pay), f"{pay}")

ex_ = mix(call(e, [FB(0.85), SL(0.30), CH(0.28)], D3, ["Fastball", "Fastball"])[3])
check("v1.2.1 rule holds under the band: only trusted pitch shaken twice -> out, his most-trusted other pitch called",
      "Fastball" not in ex_ and abs(ex_.get("Slider", 0) - 1) < 1e-12, f"{ex_}")

# --- 5. nothing trusted: a mix (D2) -------------------------------------------------------------------------------
a = mix(call(e, [FB(0.41), SL(0.40), CH(0.30)], D3)[3])
b = mix(call(e, [FB(0.41), SL(0.42), CH(0.30)], D3)[3])
check("nothing trusted (D3 fastball 0.41, slider 0.40 / 0.42): a mix, and 0.02 on the slider no longer flips it",
      min(a.values()) > 0.15 and len(a) == 2 and len(b) == 2 and abs(a["Slider"] - b["Slider"]) < 0.30,
      f"slider 0.40: {({k: round(v, 2) for k, v in a.items()})}; slider 0.42: {({k: round(v, 2) for k, v in b.items()})} "
      f"(v1.2.1: 100% fastball, then 100% slider)")
o = mix(call(e, [FB(0.30), SL(0.29), CH(0.20)], D3)[3])
check("nothing in the band either: v1.2.1's fallback (100% his most-trusted pitch, 'Time for a change?')",
      abs(o.get("Fastball", 0) - 1) < 1e-12, f"{o}")

# --- 6. Python = JS -----------------------------------------------------------------------------------------------
rng = random.Random(12221)
cases = []
while len(cases) < 40:
    lvl = rng.choice(LEVELS)
    cut = e.LEVEL[lvl]["cutoff"]
    kinds = ["FB"] + rng.sample(KINDS[1:], rng.randint(1, 3))
    spec = [dict(name=NAMES[k], kind=k, grade=rng.randint(1, 5), command=rng.randint(1, 5),
                 conf=round(rng.uniform(cut - 0.14, cut + 0.25), 2), shape=rng.choice(e.SHAPE_TAGS[k])) for k in kinds]
    if not in_band(spec, lvl):
        continue
    sd = dict(balls=rng.randint(0, 3), strikes=rng.randint(0, 2), outs=rng.randint(0, 2),
              bases=[rng.random() < 0.3 for _ in range(3)], level=lvl, same_side=rng.random() < 0.5)
    ex = rng.sample([d["name"] for d in spec], rng.randint(0, 1)) * rng.randint(1, 2)
    cases.append((spec, sd, ex))
js = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = cases.map(([spec, sd, ex]) => {
  const ars = spec.map((d) => E.Pitch(Object.assign({}, d)));
  const s = E.Situation(Object.assign({}, sd));
  const r = E.v08.callV08(ars, s, { rng: () => 0.5, exclude: ex });
  const d = {}; for (const x of r.dist) d[x.pitch.name + '|' + x.quad] = [x.prob, x.cost];
  return d;
});
console.log(JSON.stringify(out));
"""], cwd=HERE, input=json.dumps(cases), capture_output=True, text=True, check=True).stdout)
worst, bad = 0.0, 0
for (spec, sd, ex), j in zip(cases, js):
    d = {f"{x[2].name}|{x[3]}": (x[0], x[1]) for x in call(e, spec, sd, ex)[3]}
    if set(d) != set(j):
        bad += 1
        continue
    worst = max([worst] + [max(abs(d[k][0] - j[k][0]), abs(d[k][1] - j[k][1])) for k in d])
check("Python = JS on band cases (shares and costs)", bad == 0 and worst < 1e-9,
      f"{len(cases)} random cases with pitches in the band, every level and count; {bad} with different calls, "
      f"largest difference {worst:.1e}")

# --- 7. speed: a call on a solved table, worst case ---------------------------------------------------------------
six = [dict(name=NAMES[k], kind=k, grade=3, command=3, conf=c, shape=e.SHAPE_TAGS[k][0])
       for k, c in zip(KINDS, [0.44, 0.43, 0.42, 0.41, 0.40, 0.39])]
sd6 = dict(balls=1, strikes=1, outs=1, bases=[False, False, False], level="college_d3")
tab6 = call(e, [dict(d, conf=0.60) for d in six], sd6)[4]
t0 = time.time()
call(e, [dict(d, conf=0.60) for d in six], sd6, tab=tab6)
t_one = time.time() - t0
t0 = time.time()
call(e, six, sd6, tab=tab6)
t_six = time.time() - t0
jt = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const [six, sd] = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const mk = (c) => six.map((d) => E.Pitch(Object.assign({}, d, c === null ? {} : { conf: c })));
const s = E.Situation(Object.assign({}, sd));
const tab = E.v08.solveTable(mk(0.6), Object.assign({}, s));
const t = (ars) => { const t0 = process.hrtime.bigint(); for (let i = 0; i < 3; i++) E.v08.callV08(ars, s, { rng: () => 0.5, tab }); return Number(process.hrtime.bigint() - t0) / 3e6; };
t(mk(0.6));
console.log(JSON.stringify({ one: t(mk(0.6)), six: t(mk(null)) }));
"""], cwd=HERE, input=json.dumps([six, sd6]), capture_output=True, text=True, check=True).stdout)
check("speed: a call on a solved table with all six pitches in the band stays under 50 ms in JS",
      jt["six"] < 50, f"JS (node, this box): {jt['one']:.1f} ms with none in the band, {jt['six']:.1f} ms with six; "
      f"Python {t_one * 1000:.0f} ms / {t_six * 1000:.0f} ms. The iPad is not measured")

n_fail = sum(1 for _, ok, _ in results if not ok)
print(f"\n{len(results) - n_fail}/{len(results)} passed")
sys.exit(1 if n_fail else 0)
