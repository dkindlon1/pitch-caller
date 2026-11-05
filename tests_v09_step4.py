"""v0.9 Step 4 (item 4, intent labels) acceptance. usage: python3 tests_v09_step4.py
  1 constructed cost vectors give the right label for every rule, including ties
  2 invariants on 3,000 random situations (75 solved tables x 40 root calls, fuzz_lib, v0.8 mode)
  3 writes golden/labels_parity.json (150 golden v0.8 full cases with Python labels) for node golden/labels_parity.js
The 'labels change no call' check is the v0.8 golden test (python3 golden/golden_v08.py check; node golden/golden_v08.js),
run separately because the label function is never called by the call path."""
import json, os, random, sys
from collections import Counter
from dataclasses import replace
import engine as e
import fuzz_lib as F

HERE = os.path.dirname(os.path.abspath(__file__))
fails = 0


def check(ok, msg):
    global fails
    print(("  ok   " if ok else "  FAIL ") + msg, flush=True)
    fails += not ok


class Half:
    def random(self):
        return 0.5


print("1. Constructed cost vectors")
E = 0.0005
L = e.intent_from_costs
cases = [((3, 0, "middle", 1.0, 1.0, 1.0, 1.0), "Get it over"), ((3, 1, "up-away", 1.2, 1.0, 0.9, 1.0), "Get it over"),
         ((0, 2, "chase", 1.0, 1.0, 1.0, 1.0), "Expand"), ((3, 2, "chase", 1.0, 1.0, 1.0, 1.0), "Expand"),
         ((1, 2, "down-away", 1.0, 1.0, 1.0, 1.0), "Finish"), ((2, 2, "middle", 1.0, 0.9, 1.0, 0.9), "Finish"),
         ((0, 1, "up-in", 1.01, 1.0, 0.99, 1.0), "Setup"), ((1, 0, "chase", 1.01, 1.0, 0.99, 1.0), "Setup"),
         ((0, 0, "down-in", 1.0, 1.0, 0.99, 1.0), "Get ahead"),        # tie on c_my, lower C: cheapest now -> not a setup
         ((0, 0, "down-in", 1.0 + E / 2, 1.0, 0.99, 1.0), "Get ahead"),  # inside the noise margin
         ((0, 1, "middle", 1.01, 1.0, 1.01, 1.0), "Get ahead"),         # costs more now and more overall: not chosen for future
         ((1, 1, "chase", 1.0, 1.0, 1.0, 1.0), "Early off-zone"), ((2, 1, "chase", 1.02, 1.0, 1.01, 1.0), "Early off-zone")]
for args, want in cases:
    got = L(*args, E)
    check(got == want, f"{args[:3]} c_my {args[3]} vs {args[4]}, C {args[5]} vs {args[6]} -> {got} (want {want})")

print("2. Invariants on 3,000 random situations")
e.set_flags(**e.FLAGS_V08)
F.rng.seed(4401)
rng = random.Random(4402)
mix = Counter()
bad = Counter()
n = 0
for t in range(75):
    ars = F.rand_arsenal()
    s0 = replace(F.rand_situation(ars), balls=0, strikes=0, last=None)
    tab = e.solve_table(ars, s0)
    for i in range(40):
        b, k = rng.randint(0, 3), rng.randint(0, 2)
        lp = rng.choice(ars)
        last = (lp.name, rng.choice(e.QUADS), rng.choice(["whiff", "foul", "ball", "cstrike"])) if rng.random() < 0.8 else None
        look = (rng.uniform(0.86, 1.02) * e.v_fb(ars, s0), rng.uniform(1.8, 3.2)) if rng.random() < 0.8 else None
        s = replace(s0, balls=b, strikes=k, last=last, look=look)
        s = replace(s, b_h=e.lean_b_h(ars, s, ()))
        pick, dist, tab, info = e.call_v08(ars, s, rng=Half(), tab=tab)
        lab, mech, line = e.intent_label(ars, s, tab, pick, info)
        lab2 = e.intent_label(ars, s, tab, pick, info)
        n += 1
        mix[lab] += 1
        if lab2 != (lab, mech, line):
            bad["not deterministic"] += 1
        if lab == "Setup" and b == 3:
            bad["Setup with three balls"] += 1
        if lab in ("Expand", "Finish") and k < 2:
            bad["Expand/Finish with fewer than two strikes"] += 1
        if lab == "Early off-zone" and (k == 2 or b == 3):
            bad["Early off-zone with two strikes or three balls"] += 1
        if lab == "Get it over" and not (b == 3 and k < 2):
            bad["Get it over outside 3-0/3-1"] += 1
        if not line:
            bad["empty line"] += 1
check(n == 3000 and not bad, f"{n} situations, violations: {dict(bad) or 'none'}")
print("   label mix:", dict(mix.most_common()))

print("3. Python labels for the JS parity check (150 golden v0.8 full cases)")
sys.path.insert(0, os.path.join(HERE, "golden"))
import golden_v08 as G
cs = [c for c in json.load(open(G.PATH)) if c["full"]][:150]
out = []
for c in cs:
    ars, s = G.from_dicts(c)
    s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
    tab = e.solve_table(ars, replace(s_w, balls=0, strikes=0, last=None))
    pick, dist, tab, info = e.call_v08(ars, s_w, rng=Half(), tab=tab)
    lab, mech, line = e.intent_label(ars, s_w, tab, pick, info)
    out.append(dict(arsenal=c["arsenal"], s=c["s"], pick=[pick[0].name, pick[1]], label=lab, mech=mech, line=line))
json.dump(out, open(os.path.join(HERE, "golden", "labels_parity.json"), "w"))
check(len(out) == 150, f"wrote golden/labels_parity.json ({Counter(o['label'] for o in out)})")

print("all step 4 checks passed" if not fails else f"{fails} FAILED")
sys.exit(1 if fails else 0)
