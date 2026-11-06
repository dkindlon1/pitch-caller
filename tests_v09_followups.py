"""v0.9 follow-up checks (Nov 5 night): the guardrail window constant and the simulator's TRUE_POWER world.
usage: python3 tests_v09_followups.py"""
import math, os, random, re
import engine as e
import simulate

HERE = os.path.dirname(os.path.abspath(__file__))
fails = 0


def check(ok, msg):
    global fails
    print(("  ok   " if ok else "  FAIL ") + msg)
    fails += not ok


# --- guardrail window: a named constant, same value in Python and JS, unchanged in every engine version
js = open(os.path.join(HERE, "app", "engine.js")).read()
m = re.search(r"const GUARD_DELTA = ([0-9.]+);", js)
check(e.GUARD_DELTA == 0.010, f"engine.py GUARD_DELTA = {e.GUARD_DELTA}")
check(m is not None and float(m.group(1)) == e.GUARD_DELTA, "engine.js GUARD_DELTA matches")
check("0.010 * run_scale(s.level)" not in open(os.path.join(HERE, "engine.py")).read().split("def root_call")[1].split("def call_v08")[0],
      "root_call reads the constant (no literal left)")

simulate.STAFF = "default"
ARS = simulate.our_staff()[0]["arsenal"]


def kept(delta, s):
    """Calls the v0.8 guardrail keeps at this delta (the v0.9 guardrail off: every allowed call)."""
    old = e.GUARD_DELTA
    e.GUARD_DELTA = delta
    try:
        tab = e.solve_table(ARS, s)
        _, _, full, _, M = e.root_call(ARS, s, tab)
        return set(M)
    finally:
        e.GUARD_DELTA = old


with e.flags(**dict(e.FLAGS_V09, guardrail_v09=False)):
    s = e.Situation(1, 0, 0, (False, False, False), inning=3, level="college_d3", same_side=False)
    k1, k2, k3 = kept(0.010, s), kept(0.020, s), kept(0.030, s)
check(k1 <= k2 <= k3, f"a wider window keeps a superset of calls (1-0: {len(k1)}, {len(k2)}, {len(k3)} at 0.010/0.020/0.030)")
with e.flags(**e.FLAGS_V09):
    tab = e.solve_table(ARS, s)
    allc = set(e.root_call(ARS, s, tab)[4])
check(k3 <= allc, f"and never more than the guardrail-off set ({len(allc)})")

# --- TRUE_POWER: item 8's HR shift in the batted-ball draw matches the engine's value exactly
seen = {}


def fake_sample(dist):
    if "FB" in dist:                       # batted-ball type: a fly ball, where home runs live
        return "FB"
    seen["last"] = dict(dist)
    return "out"


simulate.LEVEL_NAME = "college_d3"
simulate.rng = random.Random(1)
orig = simulate.sample
simulate.sample = fake_sample
try:
    FB = ARS[0]
    simulate.run_ball_in_play_typed("hard", 0, (False, False, False), FB, "middle")
    base = seen["last"]
    dh = e.power_hr_shift(e.Situation(0, 0, 0, (False,) * 3, level="college_d3"), {"w": 5})
    simulate.run_ball_in_play_typed("hard", 0, (False, False, False), FB, "middle", dh=dh)
    hi = seen["last"]
finally:
    simulate.sample = orig
nhr = e.sig(e.logit(base["homer"]) + dh)
check(dh > 0, f"power grade 5 at D3: +{dh:.4f} logits on HR given hard contact")
check(abs(hi["homer"] - nhr) < 1e-15 and abs(hi["out"] - (base["out"] - (nhr - base["homer"]))) < 1e-15,
      f"draw: HR {base['homer']:.4f} -> {hi['homer']:.4f}, taken from outs (same transform as in_play_value_typed)")
check(all(abs(hi[k] - base[k]) < 1e-15 for k in ("single", "double", "triple", "error")), "other hit types untouched")
check(abs(sum(hi.values()) - sum(base.values())) < 1e-12, "the distribution still sums to the same total")

# --- TRUE_POWER defaults: off, and the true grade reaches only the world's situation
check(not simulate.TRUE_POWER and not simulate.SEE_POWER and simulate.GUARD_DELTA_ENV == "", "all follow-up settings off by default")
h = {"name": "#1", "hand": "R", "fb": 0.1, "os": -0.1, "timing": 0.0}
s0 = e.Situation(0, 0, 0, (False,) * 3, level="college_d3")
check(simulate.true_situation(s0, h).grades is None, "no true grade: world situation unchanged")
check(simulate.true_situation(s0, dict(h, w=4.3)).grades == {"w": 4.3}, "with a true grade: the world sees it")

print(f"\n{'all follow-up checks passed' if not fails else f'{fails} FAILED'}")
raise SystemExit(1 if fails else 0)
