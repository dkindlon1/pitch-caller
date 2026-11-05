"""v0.8 step 8 checks: hitter grades (8.2) and their learner, the why line (9). The temperature floor and the X
comparison are in results/v08_step8_X.txt (metrics.py after perturb.py). usage: python3 tests_v08_step8.py"""
import random
from dataclasses import replace
import engine as e
from metrics import ref_arsenals
import fuzz_lib as F

ok_all = []


def check(name, ok, detail=""):
    ok_all.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f": {detail}" if detail else ""), flush=True)


e.set_flags(**e.FLAGS_V08)
ars = ref_arsenals()["three"]
s = e.Situation(1, 1, 0, (False, False, False), level="college_d3")
same = all(abs(e.outcome_probs(p, q, s, ars)[k] - e.outcome_probs(p, q, replace(s, grades={"c": 3, "w": 3, "d": 3}), ars)[k]) < 1e-15
           for p in ars for q in e.QUADS for k in ("whiff", "hard", "ball"))
check("grades 3 everywhere = no grades", same)
P3 = e.outcome_probs(ars[1], "down-away", s, ars)
P5c = e.outcome_probs(ars[1], "down-away", replace(s, grades={"c": 5}), ars)
P5w = e.outcome_probs(ars[1], "down-away", replace(s, grades={"w": 5}), ars)
P5d = e.outcome_probs(ars[1], "down-away", replace(s, grades={"d": 5}), ars)
check("contact 5 lowers whiffs, power 5 raises hard contact, discipline 5 raises balls",
      P5c["whiff"] < P3["whiff"] and P5w["hard"] > P3["hard"] and P5d["ball"] > P3["ball"],
      f"whiff {P3['whiff']:.3f}->{P5c['whiff']:.3f}, hard {P3['hard']:.3f}->{P5w['hard']:.3f}, ball {P3['ball']:.3f}->{P5d['ball']:.3f}")

# learner: a hitter whose true grades are c 4.5, w 3, d 2; coach says 3 3 3; events drawn from the engine itself.
# Five "games" of 300 pitches; after each, every grade is re-estimated from all pitches so far, each with the other two
# at their current estimates (spec 8.2), without the per-game rails (checked separately below).
rng = random.Random(5)
true = {"c": 4.5, "w": 3, "d": 2}
I0 = e.I0_GRADE["college_d3"]
events = []
for i in range(1500):
    b, k = rng.randint(0, 3), rng.randint(0, 2)
    p = rng.choice(ars); q = rng.choice(e.targets(b, k))
    st = e.Situation(b, k, 0, (False, False, False), level="college_d3")
    zo = {}
    e.outcome_probs(p, q, replace(st, grades=true), ars, zout=zo)
    swing_p = sum(v["L"] * v["S"] for v in zo.values())
    ev = {"d": 1 if rng.random() < swing_p else 0}
    if ev["d"]:
        wp = sum(v["L"] * v["S"] * v["W"] for v in zo.values()) / swing_p
        ev["c"] = 1 if rng.random() < wp else 0
        if not ev["c"]:
            bw = {z: v["L"] * v["S"] * (1 - v["W"]) * (1 - v["F"]) for z, v in zo.items()}
            if rng.random() < sum(bw.values()) / (swing_p * (1 - wp)):
                ev["w"] = 1 if rng.random() < sum(bw[z] * v["H"] for z, v in zo.items()) / sum(bw.values()) else 0
    events.append((p, q, st, ev))
cur = {"c": 3.0, "w": 3.0, "d": 3.0}
hist = []
info = {}
for game in range(5):
    upto = events[:300 * (game + 1)]
    new = {}
    for g in ("c", "w", "d"):
        obs = []
        for p, q, st, ev in upto:
            if g in ev:
                gs = e.grade_stats(p, q, st, ars, grades=cur)
                if g in gs:
                    obs.append((ev[g],) + gs[g])
        new[g] = e.grade_estimate(obs, 3, I0[g], n_pitches=len(upto))[1]
        info[g] = sum(d * d / (pp * (1 - pp)) for y, pp, d in obs if 0 < pp < 1)
    cur = new
    hist.append({g: round(v, 2) for g, v in cur.items()})
est = cur
ok = True
det = []
for g in ("c", "w", "d"):
    target = (I0[g] * 3 + info[g] * true[g]) / (I0[g] + info[g])      # the shrunk truth the estimator aims at
    se = (I0[g] + info[g]) ** -0.5
    ok &= abs(est[g] - target) < 2 * se
    det.append(f"{g}: est {est[g]:.2f}, shrunk target {target:.2f}, se {se:.2f}, information {info[g]:.1f} (prior {I0[g]:.1f})")
check("grade learner: each estimate within 2 SE of its shrunk target after five games of 300 pitches", ok,
      "; ".join(det) + f"; by game {hist}")
obs = {"c": [(ev["c"],) + e.grade_stats(p, q, st, ars, grades=cur)["c"] for p, q, st, ev in events if "c" in ev]}
g_used, g_est, flag = e.grade_estimate(obs["c"][:20], 3, I0["c"], n_pitches=20)
check("rail: no effect before 30 pitches", g_used == 3 and not flag)
g_used, g_est, flag = e.grade_estimate(obs["c"], 3, I0["c"], g_prev=3, n_pitches=1500)
check("rail: at most 0.5 per game, or a flag past 1 point", (flag and g_used == 3) or (abs(g_used - 3) <= 0.5 + 1e-12),
      f"estimate {g_est:.2f} -> used {g_used:.2f}, flag {flag}")

# why line: runs on random situations and always returns a line; deterministic
F.rng.seed(9)
n_ok, n = 0, 40
lines = {}
for i in range(n // 10):
    a2 = F.rand_arsenal()
    s0 = replace(F.rand_situation(a2), balls=0, strikes=0, last=None)
    tab = e.solve_table(a2, s0)
    for j in range(10):
        st = replace(F.rand_situation(a2), outs=s0.outs, bases=s0.bases, level=s0.level)
        pick, dist, tab, info = e.call_v08(a2, st, rng=random.Random(j), tab=tab)
        l1 = e.why_line(a2, st, tab, pick, info)[0]
        l2 = e.why_line(a2, st, tab, pick, info)[0]
        n_ok += bool(l1) and l1 == l2
        lines[l1.split(" ")[0] + " " + l1.split(" ")[1]] = lines.get(l1.split(" ")[0] + " " + l1.split(" ")[1], 0) + 1
check("why line: a line for every call, deterministic", n_ok == n, f"{n_ok}/{n}; line starts {lines}")
print(f"{sum(ok_all)}/{len(ok_all)} step 8 checks passed")
