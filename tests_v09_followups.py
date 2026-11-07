"""v0.9 checks (Nov 5-6): one flag-free engine, the guardrail window constant, the simulator's TRUE_POWER world and the
Supabase migration versions.
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


# --- one engine: no flags anywhere in the engine, Python or JS
js = open(os.path.join(HERE, "app", "engine.js"), encoding="utf-8").read()
check(not any(hasattr(e, n) for n in ("FLAGS", "set_flags", "flags", "FLAGS_V07", "FLAGS_V08", "FLAGS_V09")) and "FLAGS" not in open(e.__file__, encoding="utf-8").read(),
      "engine.py has no flags")
check("FLAGS" not in js and "setFlags" not in js, "engine.js has no flags")

# --- guardrail window: a named constant, same value in Python and JS
# v1.0 3.6 split the guardrail, and engine.js now declares both constants on one line
# ("const GUARD_DELTA = 0.010, GUARD_TYPE = 0.030;"), so the terminator is a comma or a semicolon.
m = re.search(r"GUARD_DELTA = ([0-9.]+)\s*[,;]", js)
mt = re.search(r"GUARD_TYPE = ([0-9.]+)\s*[,;]", js)
check(e.GUARD_DELTA == 0.010, f"engine.py GUARD_DELTA = {e.GUARD_DELTA}")
check(m is not None and float(m.group(1)) == e.GUARD_DELTA, "engine.js GUARD_DELTA matches")
# GUARD_TYPE's value is tuned in Phase 5 (plan range [0.020, 0.060]), so only assert that the two
# engines agree on it, never a particular number. GUARD_DELTA stays 0.010 by the plan, so it is pinned above.
check(mt is not None and float(mt.group(1)) == e.GUARD_TYPE, f"engine.js GUARD_TYPE matches ({e.GUARD_TYPE})")
# v1.0 3.1 RP4's plain-foul damp. Same rule as GUARD_TYPE above: assert only that the two engines agree, so that
# choosing a different damp never has to be made in two places at once.
md = re.search(r"FOUL_DAMP = ([0-9.]+)\s*[,;]", js)
check(md is not None and float(md.group(1)) == e.FOUL_DAMP, f"engine.js FOUL_DAMP matches ({e.FOUL_DAMP})")
check("0.010 * run_scale(s.level)" not in open(os.path.join(HERE, "engine.py"), encoding="utf-8").read().split("def root_call")[1].split("def call_v08")[0],
      "root_call reads the constant (no literal left)")

simulate.STAFF = "default"
ARS = simulate.our_staff()[0]["arsenal"]


def kept(delta, s):
    """Calls the guardrail keeps at this window."""
    old = e.GUARD_DELTA
    e.GUARD_DELTA = delta
    try:
        tab = e.solve_table(ARS, s)
        _, _, full, _, M = e.root_call(ARS, s, tab)
        return set(M)
    finally:
        e.GUARD_DELTA = old


s = e.Situation(1, 0, 0, (False, False, False), inning=3, level="college_d3", same_side=False)
k1, k2, k3 = kept(0.010, s), kept(0.020, s), kept(0.030, s)
allc = set(e.allowed_calls(ARS, s))
check(k1 <= k2 <= k3 <= allc, f"a wider window keeps a superset of calls (1-0: {len(k1)}, {len(k2)}, {len(k3)} at 0.010/0.020/0.030, of {len(allc)} allowed)")

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
check(not simulate.TRUE_POWER and not simulate.SEE_POWER and not hasattr(simulate, "ENGINE") and not hasattr(simulate, "WORLD"),
      "simulator: one engine, world settings off by default")
h = {"name": "#1", "hand": "R", "fb": 0.1, "os": -0.1, "timing": 0.0}
s0 = e.Situation(0, 0, 0, (False,) * 3, level="college_d3")
check(simulate.true_situation(s0, h).grades is None, "no true grade: world situation unchanged")
check(simulate.true_situation(s0, dict(h, w=4.3)).grades == {"w": 4.3}, "with a true grade: the world sees it")

# --- Supabase migrations: every version (the timestamp prefix) unique. A duplicate is recorded as already applied
# and silently never runs on prod (happened twice on Nov 6 while main and v0.9-work both added migrations).
mig = sorted(f for f in os.listdir(os.path.join(HERE, "supabase", "migrations")) if f.endswith(".sql"))
vers = [f.split("_", 1)[0] for f in mig]
dups = sorted({v for v in vers if vers.count(v) > 1})
check(not dups and all(len(v) == 14 and v.isdigit() for v in vers), f"{len(mig)} migrations, versions unique" + (f" (DUPLICATES {dups})" if dups else ""))
v08 = [f for f in mig if f.endswith("_v08_inputs.sql")]
v09 = [f for f in mig if f.endswith("_v09_intent.sql")]
check(len(v08) == len(v09) == 1 and mig.index(v08[0]) < mig.index(v09[0]), "v0.8 inputs migration sorts before v0.9 intent")

print(f"\n{'all follow-up checks passed' if not fails else f'{fails} FAILED'}")
raise SystemExit(1 if fails else 0)
