"""v1.2 Part B (plan 2.8, Step B2 proof): the coach's hitter tags in both engines.
usage (repo root): python3 tests_v12b.py   (FAST_TAGS=1 python3 golden/fast.py 40 checks full calls with tags, Python = JS)"""
import json, os, random, subprocess, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as e

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""), flush=True)


def js(code, data=None):
    r = subprocess.run(["node", "-e", "const E=require('./app/engine.js');E.init(require('./app/engine_data.json'));" + code],
                       cwd=HERE, input=json.dumps(data) if data is not None else None, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


P = lambda n, k, sh, v, g=3, c=3, f=0.75: e.Pitch(n, k, g, c, f, shape=sh, velo=v)
A = [P("Fastball", "FB", "rides", 90, f=0.8), P("Slider", "SL", "tight", 80, f=0.7), P("Changeup", "CH", "fade", 81, f=0.7)]
e.resolve_speeds(A)
SIT = lambda b, k, tags=None, level="college_d3", **kw: e.Situation(b, k, 1, (False,) * 3, level=level, hitter_tags=tags, **kw)

# ------------------------------------------------------------------ 1. unknown = no effect
rng = random.Random(7)
same, n = True, 0
for _ in range(120):
    b, k = rng.randint(0, 3), rng.randint(0, 2)
    lv = rng.choice(["hs", "college_d3", "college_d1", "mlb"])
    q = rng.choice(e.TARGETS if hasattr(e, "TARGETS") else ["up-in", "up-away", "middle", "down-in", "down-away", "down-middle", "chase"])
    for p in A:
        base = e.outcome_probs(p, q, SIT(b, k, None, lv), A)
        for t in ({}, {"approach": None, "spray": None, "path": None, "offspeed": None}):
            if e.outcome_probs(p, q, SIT(b, k, t, lv), A) != base or e.coach_credit(p, q, SIT(b, k, t, lv), A) != e.coach_credit(p, q, SIT(b, k, None, lv), A):
                same = False
            n += 1
check("every tag unknown (no tags, an empty dict, every key None): outcome_probs and coach credit bitwise identical to "
      "untagged", same, f"{n} comparisons")
s0 = replace(SIT(1, 1), win=e.win_constants(SIT(1, 1)))
d0 = e.call_v08(A, s0, rng=None)[1]
d1 = e.call_v08(A, replace(s0, hitter_tags={}), rng=None)[1]
check("a full call with no tags set is bitwise the untagged call", [(pr, x.name, q) for pr, _, x, q in d0] == [(pr, x.name, q) for pr, _, x, q in d1])

# ------------------------------------------------------------------ 2. directions and sizes
def swing_iz(tags, b, k, level="college_d3"):
    st = {"pitches": 0, "zone": 0, "zswing": 0, "oswing": 0, "zcontact": 0, "ocontact": 0}
    e.outcome_probs(A[0], "middle", SIT(b, k, tags, level), A, stats=st)
    return st["zswing"] / st["zone"]
ag, pa, un = swing_iz({"approach": "aggressive"}, 0, 0), swing_iz({"approach": "patient"}, 0, 0), swing_iz(None, 0, 0)
ag2, un2 = swing_iz({"approach": "aggressive"}, 2, 2), swing_iz(None, 2, 2)
check("approach: an aggressive early hitter swings more at in-zone pitches at 0-0, a patient one less; nothing at 2-2",
      ag > un > pa and ag2 == un2, f"0-0 in-zone swing {pa:.3f} / {un:.3f} / {ag:.3f}; 2-2 {un2:.3f} vs {ag2:.3f}")
hs_ag, hs_un = swing_iz({"approach": "aggressive"}, 0, 0, "hs"), swing_iz(None, 0, 0, "hs")
check("approach x RHO_L: smaller at HS than at D3", 0 < hs_ag - hs_un < ag - un, f"HS +{hs_ag - hs_un:.4f}, D3 +{ag - un:.4f}")
hard = lambda tags, q: (lambda o: o["hard"] / (o["weak"] + o["solid"] + o["hard"]))(e.outcome_probs(A[0], q, SIT(1, 1, tags), A))
hp_in, hu_in, hp_aw, hu_aw = hard({"spray": "pull"}, "down-in"), hard(None, "down-in"), hard({"spray": "pull"}, "down-away"), hard(None, "down-away")
check("spray (fitted, MLB): a pull-heavy hitter hits pitches away harder and inside softer; middle unchanged",
      hp_aw > hu_aw and hp_in < hu_in and hard({"spray": "pull"}, "middle") == hard(None, "middle"),
      f"hard share in {hu_in:.4f} -> {hp_in:.4f}, away {hu_aw:.4f} -> {hp_aw:.4f}")
gb = lambda tags, q: e.type_mix(A[0], q, "solid", SIT(1, 1, tags))["GB"]
check("spray: a pull-heavy hitter hits fewer grounders both sides (fitted), an opposite-field one more",
      gb({"spray": "pull"}, "down-in") < gb(None, "down-in") < gb({"spray": "oppo"}, "down-in") and gb({"spray": "pull"}, "down-away") < gb(None, "down-away")
      and e.type_mix(A[0], "middle", "solid", SIT(1, 1, {"spray": "pull"})) == e.type_mix(A[0], "middle", "solid"),
      f"GB in {gb(None, 'down-in'):.4f} -> pull {gb({'spray': 'pull'}, 'down-in'):.4f}")
pc_f = e.path_cost(A[0], "up-away", SIT(1, 2, {"path": "flat"}))
pc_l = e.path_cost(A[2], "down-away", SIT(1, 2, {"path": "lift"}))
pc_n = [e.path_cost(A[0], "up-away", SIT(1, 2, {"path": "lift"})), e.path_cost(A[2], "down-away", SIT(1, 2, {"path": "flat"})),
        e.path_cost(A[0], "down-away", SIT(1, 2, {"path": "flat"}))]
pc_mem = e.path_cost(A[0], "up-away", SIT(1, 2, {"path": "flat"}, hitter_damage={"FB|up-away": (0.1, 10)}))
pc_hs = e.path_cost(A[0], "up-away", SIT(1, 2, {"path": "flat"}, "hs"))
check(f"path (coach rule, {e.HIT_PATH_RULE}): a flat swing costs the fastball up, a lift swing the off-speed pitch down; "
      "nothing else; halves once he's shown 10 pitches at that class and spot; x RHO_L at HS",
      abs(pc_f - e.HIT_PATH_RULE) < 1e-15 and abs(pc_l - e.HIT_PATH_RULE) < 1e-15 and pc_n == [0.0, 0.0, 0.0]
      and abs(pc_mem - e.HIT_PATH_RULE / 2) < 1e-15 and abs(pc_hs - 0.6 * e.HIT_PATH_RULE) < 1e-15,
      f"flat FB up {pc_f}, lift OS down {pc_l}, others {pc_n}, after 10 seen {pc_mem}, HS {pc_hs}")
dm0 = e.damage(A[1], "down-away", SIT(1, 1, {"offspeed": "hits"}))
dm1 = e.damage(A[1], "down-away", SIT(1, 1, {"offspeed": "hits"}, hitter_damage={"OS": (-0.4, 30)}))
dm1u = e.damage(A[1], "down-away", SIT(1, 1, None, hitter_damage={"OS": (-0.4, 30)}))
check("off-speed (Q7, coach-set prior): a small positive damage prior on off-speed only (about 0.07 with no evidence); 30 "
      "pitches of real evidence outweigh it", 0.05 < dm0 < 0.1 and e.damage(A[0], "middle", SIT(1, 1, {"offspeed": "hits"})) == 0.0
      and dm1u < dm1 < 0 and dm1 - dm1u < 0.05, f"no evidence {dm0:.4f}; with 30 pitches at -0.4: {dm1u:.4f} -> {dm1:.4f}")

# ------------------------------------------------------------------ 3. re-solve and validation
fz = e.frozen_inputs(A, SIT(0, 0))
fzt = e.frozen_inputs(A, SIT(0, 0, {"approach": "aggressive"}))
check("re-solve: an untagged table's inputs carry no tags key (unchanged); a tag change re-solves; an old table counts as untagged",
      "tags" not in fz and not e.needs_resolve(fz, A, SIT(0, 0)) and e.needs_resolve(fz, A, SIT(0, 0, {"spray": "pull"}))
      and not e.needs_resolve(fzt, A, SIT(0, 0, {"approach": "aggressive"})) and e.needs_resolve(fzt, A, SIT(0, 0)))
bad = []
for t in ({"approach": "wild"}, {"swing": "lift"}, {"offspeed": "misses"}):
    try:
        e.check_inputs(A, SIT(0, 0, t)); bad.append(t)
    except ValueError:
        pass
check("validation rejects an unknown tag or value", not bad, f"accepted {bad}")

# ------------------------------------------------------------------ 4. Python = JS on 600 random hitters with tags
rng = random.Random(41)
TV = {k: [None] + list(v) for k, v in e.HIT_TAG_VALUES.items()}
QS = ["up-in", "up-away", "middle", "down-in", "down-away", "down-middle", "chase"]
cases = []
for _ in range(600):
    tags = {k: rng.choice(v) for k, v in TV.items() if rng.random() < 0.8}
    hd = {"OS": [round(rng.uniform(-0.6, 0.6), 3), rng.randint(0, 40)]} if rng.random() < 0.5 else {}
    if rng.random() < 0.5:
        hd["FB|" + rng.choice(QS[:6])] = [round(rng.uniform(-0.6, 0.6), 3), rng.randint(0, 30)]
    cases.append(dict(tags=tags, hd=hd, b=rng.randint(0, 3), k=rng.randint(0, 2), lv=rng.choice(["hs", "travel", "college_d3", "college_d1", "mlb"]),
                      same=rng.random() < 0.5, q=rng.choice(QS), i=rng.randint(0, 2)))
J = js("""const A=[E.Pitch({name:'Fastball',kind:'FB',grade:3,command:3,conf:0.8,shape:'rides',velo:90}),E.Pitch({name:'Slider',kind:'SL',grade:3,command:3,conf:0.7,shape:'tight',velo:80}),E.Pitch({name:'Changeup',kind:'CH',grade:3,command:3,conf:0.7,shape:'fade',velo:81})];
E.resolveSpeeds(A);
const cs=JSON.parse(require('fs').readFileSync(0,'utf8'));
console.log(JSON.stringify(cs.map((c)=>{const S=E.Situation({balls:c.b,strikes:c.k,outs:1,bases:[false,false,false],level:c.lv,same_side:c.same,hitter_tags:c.tags,hitter_damage:c.hd});
const p=A[c.i];return {op:E.outcomeProbs(p,c.q,S,A),cc:E.v08.coachCredit(p,c.q,S,A),dm:E.v12.damage(p,c.q,S),tm:E.v12.typeMix(p,c.q,'solid',S)};})));""", cases)
worst = 0.0
for c, j in zip(cases, J):
    S = e.Situation(c["b"], c["k"], 1, (False,) * 3, level=c["lv"], same_side=c["same"], hitter_tags=c["tags"],
                    hitter_damage={k: tuple(v) for k, v in c["hd"].items()})
    p = A[c["i"]]
    op, cc, dm, tm = e.outcome_probs(p, c["q"], S, A), e.coach_credit(p, c["q"], S, A), e.damage(p, c["q"], S), e.type_mix(p, c["q"], "solid", S)
    worst = max([worst, abs(cc - j["cc"]), abs(dm - j["dm"])] + [abs(op[k] - j["op"][k]) for k in op] + [abs(tm[k] - j["tm"][k]) for k in tm])
check("Python = JS on 600 random hitters with tags (outcome_probs, coach credit, damage, batted-ball mix)", worst < 1e-12, f"largest difference {worst:.1e}")
jc = js("console.log(JSON.stringify({fit:E.v12.HIT_FIT,path:E.v12.HIT_PATH_RULE,os:[E.v12.HIT_OS_PRIOR,E.v12.HIT_OS_N0],vals:E.v12.HIT_TAG_VALUES}))")
check("the same sizes in both engines", jc["fit"] == e.HIT_FIT and jc["path"] == e.HIT_PATH_RULE and jc["os"] == [e.HIT_OS_PRIOR, e.HIT_OS_N0]
      and jc["vals"] == e.HIT_TAG_VALUES)
fit = json.load(open(os.path.join(HERE, "results", "v12", "hitter_fits.json")))["channels"]
check("the fitted sizes are the held-out fits' own coefficients (results/v12/hitter_fits.json), and only channels that shipped",
      fit["approach_swing"]["ships"] and fit["spray_hard"]["ships"] and fit["spray_gb"]["ships"]
      and not fit["path_fb_whiff"]["ships"] and not fit["offspeed_hard"]["ships"]
      and abs(fit["approach_swing"]["coefs"]["appr"] - e.HIT_FIT["approach"]) < 1e-12
      and abs(fit["spray_hard"]["coefs"]["pull_in"] - e.HIT_FIT["spray_hard_in"]) < 1e-12 and abs(fit["spray_hard"]["coefs"]["pull_aw"] - e.HIT_FIT["spray_hard_away"]) < 1e-12
      and abs(fit["spray_gb"]["coefs"]["pull_in"] - e.HIT_FIT["spray_gb_in"]) < 1e-12 and abs(fit["spray_gb"]["coefs"]["pull_aw"] - e.HIT_FIT["spray_gb_away"]) < 1e-12)

fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
