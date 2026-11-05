"""v0.8 acceptance tests (docs/SPEC_v0.8.md). Each prints PASS/FAIL with the measured numbers.
usage: python3 tests_v08.py [step ...]   (default: all steps built so far)"""
import random, sys, time
from dataclasses import replace
import engine as e
from metrics import ref_arsenals

results = []


def check(name, ok, detail):
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}\n       {detail}", flush=True)


def step4():
    e.set_flags(**e.FLAGS_V07); e.set_flags(umpire_learn=True)
    ars = ref_arsenals()["three"]
    rng = random.Random(4)
    pool = []
    for (b, k) in e.COUNTS:
        s = e.Situation(b, k, 0, (False, False, False), level="college_d3")
        _, dist = e.call_mixed(ars, s)
        pool += [(pr, p, q, s) for pr, _, p, q in dist]
    for u_true in (-0.8, 0.0, 0.8):
        ests = []
        for trial in range(150):
            takes = []
            while len(takes) < 60:
                pr, p, q, s = rng.choice(pool)
                pt, _ = e.take_stats(p, q, replace(s, ump_u=u_true), ars)
                p0, d0 = e.take_stats(p, q, replace(s, ump_u=0.0), ars)
                takes.append((1 if rng.random() < pt else 0, p0, d0))
            ests.append(e.ump_estimate(takes, "college_d3"))
        m = sum(ests) / len(ests)
        sd = (sum((x - m) ** 2 for x in ests) / len(ests)) ** 0.5
        ok = (abs(m) < 0.15) if u_true == 0 else (m * u_true > 0 and abs(m) >= 0.4 * abs(u_true))
        check(f"umpire learner recovers u = {u_true:+.1f} from 60 takes", ok, f"mean estimate {m:+.3f}, sd {sd:.3f}")
    # fatigue: speed and stuff loss start at the fatigue point and are capped
    e.set_flags(fatigue_v08=True)
    p = e.Pitch("FB", "FB", 3, 3, 0.7, velo=88)
    v = [e.speed_today(p, e.Situation(0, 0, 0, (False,) * 3, level="college_d3", pitch_count=pc)) for pc in (70, 75, 95, 300)]
    check("fatigue: no loss before 75 (D3), 1 mph at 95, capped at 4 mph", v[0] == 88 and v[1] == 88 and abs(v[2] - 87) < 1e-9 and abs(v[3] - 84) < 1e-9, f"speeds {v}")
    rp = e.speed_today(p, e.Situation(0, 0, 0, (False,) * 3, level="college_d3", pitch_count=120, radar={"FB": 86.5}))
    check("fatigue: logged radar replaces the formula", rp == 86.5, f"speed {rp}")
    # familiarity: shift by class, capped at 0.5
    e.set_flags(**e.FLAGS_V07); e.set_flags(bf_term_v07=False)
    s0 = e.Situation(1, 1, 0, (False,) * 3, level="college_d3")
    sl = ars[1]
    h0 = e.outcome_probs(sl, "down-away", s0, ars)["hard"]
    h2 = e.outcome_probs(sl, "down-away", replace(s0, familiar={"OS": 2}), ars)["hard"]
    h4 = e.outcome_probs(sl, "down-away", replace(s0, familiar={"OS": 4}), ars)["hard"]
    h20 = e.outcome_probs(sl, "down-away", replace(s0, familiar={"OS": 20}), ars)["hard"]
    h50 = e.outcome_probs(sl, "down-away", replace(s0, familiar={"OS": 50}), ars)["hard"]
    check("familiarity raises hard contact with looks and caps at 0.5 logits (off-speed: ~4.3 looks)",
          h0 < h2 < h4 < h20 and abs(h20 - h50) < 1e-12,
          f"hard share 0 looks {h0:.4f}, 2 {h2:.4f}, 4 {h4:.4f}, 20 {h20:.4f}, 50 {h50:.4f}")
    e.set_flags(**e.FLAGS_V07)


STEPS = {"4": step4}

if __name__ == "__main__":
    t0 = time.time()
    for st in (sys.argv[1:] or list(STEPS)):
        print(f"== step {st}")
        STEPS[st]()
    print(f"\n{sum(results)}/{len(results)} v0.8 checks passed ({time.time() - t0:.0f} s)")
    sys.exit(0 if all(results) else 1)
