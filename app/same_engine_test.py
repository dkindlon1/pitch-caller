"""v0.7 check: with no traits, no strike_rate, every level's spread scales at 1 and cmd_whiff 0, the engine must give exactly what v0.6f
gave (so every v0.7 change is opt-in and isolated). Both engines import the same outcome_params module, so they share
the same level averages: the test compares code paths, not fitted numbers.
Usage: python3 same_engine_test.py <path to the old engine.py> [cases]"""
import importlib.util, random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import engine as new
# v0.7 calibrated levels are meant to differ from v0.6f; this test proves the code path is identical at scale 1
for _l in new.LEVEL.values():
    _l["cmd_scale"] = 1.0; _l["stuff_scale"] = 1.0; _l["cmd_whiff"] = 0.0
spec = importlib.util.spec_from_file_location("engine_old", sys.argv[1])
old = importlib.util.module_from_spec(spec); spec.loader.exec_module(old)

rng = random.Random(7)
SH = {"FB": ["ride", "sink", "run", ""], "SL": ["tight", "sweeper", ""], "CB": ["loopy", "sharp"], "CH": ["fade", "drop"]}
N = int(sys.argv[2]) if len(sys.argv) > 2 else 200
worst = 0.0
for i in range(N):
    kinds = rng.sample(["FB", "SL", "CB", "CH"], rng.randint(2, 4))
    if "FB" not in kinds: kinds[0] = "FB"
    spec_ = [dict(name=f"P{k}", kind=k, grade=rng.randint(1, 5), command=rng.randint(1, 5), conf=round(rng.uniform(0.3, 0.95), 3),
                  shape=rng.choice(SH[k]), velo=rng.choice([0, 84, 78])) for k in kinds]
    lvl = rng.choice(["mlb", "college_d1", "college_d3", "hs"])
    sd = dict(balls=rng.randint(0, 3), strikes=rng.randint(0, 2), outs=rng.randint(0, 2), bases=tuple(rng.random() < 0.35 for _ in range(3)),
              inning=rng.randint(1, 9), margin=rng.randint(-3, 3), pitch_count=rng.randint(0, 110), batters_faced=rng.randint(0, 27), level=lvl,
              same_side=rng.random() < 0.5, landing_today={f"P{k}": (rng.randint(0, 6), rng.randint(6, 12)) for k in kinds if rng.random() < 0.5})
    an = [new.Pitch(**d) for d in spec_]; ao = [old.Pitch(**d) for d in spec_]
    sn = new.Situation(**sd); so = old.Situation(**sd)
    for pn, po in zip(an, ao):
        for q in new.QUADS:
            a, b = new.outcome_probs(pn, q, sn, an), old.outcome_probs(po, q, so, ao)
            worst = max(worst, max(abs(a[k] - b[k]) for k in a))
            worst = max(worst, abs(new.cost(pn, q, sn, an)[0] - old.cost(po, q, so, ao)[0]))
    # the full call: same options, same probabilities, same costs, same pick. Not at 3-0 or 3-1, where v0.7b adds coach
    # rule W1 (no chase target), a deliberate change; outcome probabilities and costs are still compared there.
    if i % 10 == 0 and (sd["balls"], sd["strikes"]) not in new.NO_CHASE:
        (pn_, qn, prn, cn), dn = new.call_mixed(an, sn, rng=random.Random(1))
        (po_, qo, pro, co), do = old.call_mixed(ao, so, rng=random.Random(1))
        if (pn_.name, qn) != (po_.name, qo) or len(dn) != len(do): worst = max(worst, 1.0)
        for x, y in zip(dn, do):
            if (x[2].name, x[3]) != (y[2].name, y[3]): worst = max(worst, 1.0)
            worst = max(worst, abs(x[0] - y[0]), abs(x[1] - y[1]))
    for ev in ("ball", "cstrike", "whiff", "hard", "shakeoff"):
        a, b = new.Pitch(**spec_[0]), old.Pitch(**spec_[0])
        new.update_confidence(a, ev); old.update_confidence(b, ev)
        worst = max(worst, abs(a.conf - b.conf))
print(f"{N} random situations: largest difference between v0.7 (no traits) and v0.6f = {worst:.2e}")
print("PASS: identical" if worst == 0.0 else "FAIL")
sys.exit(0 if worst == 0.0 else 1)
