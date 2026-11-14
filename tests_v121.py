"""v1.2.1 checks (Drew, Nov 14): the second shake-off is a hard switch, and a shake-off costs 0.05 confidence (was 0.20).

- A shake list with no pitch shaken twice calls exactly as v1.2 (`git archive 504aaa8`), bit for bit.
- Shaken once, a pitch may come back when nothing else he trusts is left; shaken twice this at-bat it stays out while any
  other pitch is left (trusted first, else his most-trusted of the rest). Every pitch shaken twice: there is still a call.
- The exclude list carries one entry per shake (names, or the older (pitch, spot) pairs).
- Python = JS on every rule case.

  python3 tests_v121.py           -> runs every check, exits non-zero on a failure
"""
import io, json, os, random, subprocess, sys, tarfile, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as e
from simulate import _load_call_engine

V12 = "504aaa8"
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""))


def v12_engine():
    blob = subprocess.run(["git", "archive", V12], cwd=HERE, capture_output=True, check=True).stdout
    d = tempfile.mkdtemp(prefix="v12tree_")
    tarfile.open(fileobj=io.BytesIO(blob)).extractall(d, filter="data")
    return _load_call_engine(os.path.join(d, "engine.py"))


def ars_of(eng, spec):
    return [eng.Pitch(**d) for d in spec]


def mix(dist):
    m = {}
    for d in dist:
        m[d[2].name] = m.get(d[2].name, 0.0) + d[0]
    return m


def call(eng, spec, sd, exclude):
    ars = ars_of(eng, spec)
    s = eng.Situation(sd["balls"], sd["strikes"], sd["outs"], tuple(sd["bases"]), level=sd["level"],
                      same_side=sd.get("same_side", True))
    pick, dist, tab, info = eng.call_v08(ars, s, rng=random.Random(1), exclude=exclude)
    return ars, s, pick, dist, tab, info


FB = lambda c: dict(name="Fastball", kind="FB", grade=4, command=3, conf=c, shape="rides", velo=90)
SL = lambda c: dict(name="Slider", kind="SL", grade=3, command=3, conf=c, shape="sweeper")
CH = lambda c: dict(name="Changeup", kind="CH", grade=3, command=3, conf=c, shape="fade")
D3 = dict(balls=1, strikes=1, outs=0, bases=[False, False, False], level="college_d3")   # cutoff 0.45

# --- 1. no pitch shaken twice: exactly v1.2 -----------------------------------------------------------------------
old = v12_engine()
rng = random.Random(121)
KINDS = ["FB", "SI", "FC", "SL", "CB", "CH"]
NAMES = {"FB": "Fastball", "SI": "Sinker", "FC": "Cutter", "SL": "Slider", "CB": "Curveball", "CH": "Changeup"}
diffs, n_cases = 0, 0
while n_cases < 40:
    kinds = ["FB"] + rng.sample(KINDS[1:], rng.randint(1, 3))
    spec = [dict(name=NAMES[k], kind=k, grade=rng.randint(1, 5), command=rng.randint(1, 5),
                 conf=round(rng.uniform(0.25, 0.95), 2), shape=rng.choice(e.SHAPE_TAGS[k])) for k in kinds]
    sd = dict(balls=rng.randint(0, 3), strikes=rng.randint(0, 2), outs=rng.randint(0, 2),
              bases=[rng.random() < 0.3 for _ in range(3)], level=rng.choice(["hs", "college_d3", "college_d1", "mlb"]),
              same_side=rng.random() < 0.5)
    cut = e.LEVEL[sd["level"]]["cutoff"]
    if any(cut - e.RAMP_W < d["conf"] < cut for d in spec):
        continue        # v1.2.2: a pitch in the confidence band blends in (tests_v122.py); this check is the v1.2.1 rule only
    ex = rng.sample([d["name"] for d in spec], rng.randint(0, len(spec)))   # 0 to every pitch, each once
    if rng.random() < 0.3:
        ex = [(n, rng.choice(e.QUADS)) for n in ex]                         # the older pair form
    a = call(e, spec, sd, ex)
    b = call(old, spec, sd, ex)
    da = [(round(d[0], 15), d[1], d[2].name, d[3]) for d in a[3]]
    db = [(round(d[0], 15), d[1], d[2].name, d[3]) for d in b[3]]
    n_cases += 1
    if [(x[2], x[3]) for x in da] != [(x[2], x[3]) for x in db] or any(x[0] != y[0] or x[1] != y[1] for x, y in zip(a[3], b[3])) \
            or (a[2][0].name, a[2][1]) != (b[2][0].name, b[2][1]):
        diffs += 1
check("no pitch shaken twice: calls identical to v1.2 (504aaa8), dist and pick, bit for bit", diffs == 0,
      f"{n_cases} random cases, 0-all pitches shaken once, names and pairs; {diffs} differ")

# --- 2. the rule ---------------------------------------------------------------------------------------------------
# v1.2.2: the other pitches sit under the confidence band (D3: 0.35-0.45), so they are out, as the v1.2.1 rule assumes
strong = [FB(0.85), SL(0.30), CH(0.28)]
m0 = mix(call(e, strong, D3, [])[3])
m1 = mix(call(e, strong, D3, ["Fastball"])[3])
m2 = mix(call(e, strong, D3, ["Fastball", "Fastball"])[3])
check("only trusted pitch, shaken once: it comes back (a strong pitch can be re-called)",
      set(m0) == {"Fastball"} and abs(m1.get("Fastball", 0) - 1) < 1e-12, f"before {m0}, after one shake {m1}")
check("shaken twice: out, and the call goes to his most-trusted other pitch",
      "Fastball" not in m2 and abs(m2.get("Slider", 0) - 1) < 1e-12, f"after two shakes {m2}")
mp = mix(call(e, strong, D3, [("Fastball", "middle"), ("Fastball", "up-in")])[3])
check("older (pitch, spot) pairs count by pitch: two pairs of one pitch = shaken twice", "Fastball" not in mp, f"{mp}")
two_trusted = [FB(0.85), SL(0.60), CH(0.28)]
mt = mix(call(e, two_trusted, D3, ["Fastball", "Slider", "Fastball"])[3])
check("fastball shaken twice, slider (trusted) once: the slider, still trusted, is called (once-shaken can come back)",
      abs(mt.get("Slider", 0) - 1) < 1e-12, f"{mt}")
mall = mix(call(e, strong, D3, ["Fastball", "Fastball", "Slider", "Slider", "Changeup", "Changeup"])[3])
check("every pitch shaken twice: still a call (shake-offs set aside)", abs(sum(mall.values()) - 1) < 1e-12 and mall, f"{mall}")
all_trusted = [FB(0.75), SL(0.60), CH(0.55)]
ma = mix(call(e, all_trusted, D3, ["Fastball"])[3])
check("other trusted pitches left: one shake already takes the pitch out (as v1.2)", "Fastball" not in ma, f"{ma}")
ars, s, pick, dist, tab, info = call(e, strong, D3, ["Fastball", "Fastball"])
try:
    why = e.why_line(ars, s, tab, (pick[0], pick[1]), info, ["Fastball", "Fastball"])[0]
    intent = e.intent_label(ars, s, tab, (pick[0], pick[1]), info, ["Fastball", "Fastball"])[0]
    ok = bool(why) and pick[0].name != "Fastball"
except Exception as ex_:
    ok, why, intent = False, repr(ex_), ""
check("why line and intent label work with a pitch shaken twice", ok, f"{pick[0].name} {pick[1]}: {why!r} / {intent!r}")

# --- 3. the confidence cost ----------------------------------------------------------------------------------------
p = e.Pitch(**FB(0.85))
e.update_confidence(p, "shakeoff")
check("a shake-off costs 0.05 confidence (was 0.20)", abs(p.conf - 0.80) < 1e-12 and e.CONF_DELTA["shakeoff"] == -0.05,
      f"0.85 -> {p.conf:.2f}")

# --- 4. the app's sequence: shake, shake again (the engine's own confidence update between calls) ------------------
seq = []
ars = ars_of(e, strong)
s = e.Situation(1, 1, 0, (False, False, False), level="college_d3")
shaken = []
for k in range(3):
    pick, dist, _, _ = e.call_v08(ars, s, rng=random.Random(1), exclude=shaken)
    seq.append(pick[0].name)
    e.update_confidence(next(x for x in ars if x.name == pick[0].name), "shakeoff")
    shaken.append(pick[0].name)
check("app sequence (fastball 0.85, others under the cutoff): fastball, fastball again, then a switch",
      seq[0] == "Fastball" and seq[1] == "Fastball" and seq[2] != "Fastball", " -> ".join(seq))

# --- 5. Python = JS -----------------------------------------------------------------------------------------------
cases = [(strong, D3, []), (strong, D3, ["Fastball"]), (strong, D3, ["Fastball", "Fastball"]),
         (strong, D3, [["Fastball", "middle"], ["Fastball", "up-in"]]), (two_trusted, D3, ["Fastball", "Slider", "Fastball"]),
         (strong, D3, ["Fastball", "Fastball", "Slider", "Slider", "Changeup", "Changeup"]), (all_trusted, D3, ["Fastball"]),
         ([FB(0.70), SL(0.40), CH(0.30)], dict(D3, balls=3, strikes=2, outs=2, bases=[True, True, True], level="hs"),
          ["Fastball", "Fastball"])]
js = json.loads(subprocess.run(["node", "-e", """
const E = require('./app/engine.js'); E.init(require('./app/engine_data.json'));
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = cases.map(([spec, sd, ex]) => {
  const ars = spec.map((d) => E.Pitch(Object.assign({}, d)));
  const s = E.Situation(Object.assign({}, sd));
  const r = E.v08.callV08(ars, s, { rng: () => 0.5, exclude: ex });
  const d = {}; for (const x of r.dist) d[x.pitch.name + '|' + x.quad] = x.prob;
  const p = E.Pitch(Object.assign({}, spec[0])); E.updateConfidence(p, 'shakeoff');
  return { dist: d, conf: p.conf };
});
console.log(JSON.stringify(out));
"""], cwd=HERE, input=json.dumps(cases), capture_output=True, text=True, check=True).stdout)
worst, bad = 0.0, 0
for (spec, sd, ex), j in zip(cases, js):
    ex_py = [tuple(x) if isinstance(x, list) else x for x in ex]
    d = {f"{x[2].name}|{x[3]}": x[0] for x in call(e, spec, sd, ex_py)[3]}
    if set(d) != set(j["dist"]):
        bad += 1
        continue
    worst = max([worst] + [abs(d[k] - j["dist"][k]) for k in d])
    p = e.Pitch(**spec[0]); e.update_confidence(p, "shakeoff")
    worst = max(worst, abs(p.conf - j["conf"]))
check("Python = JS on every rule case (calls and the shake-off confidence cost)", bad == 0 and worst < 1e-12,
      f"{len(cases)} cases, {bad} with different calls, largest difference {worst:.1e}")

n_fail = sum(1 for _, ok, _ in results if not ok)
print(f"\n{len(results) - n_fail}/{len(results)} passed")
sys.exit(1 if n_fail else 0)
