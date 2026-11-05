"""v0.8 steps 5-6 acceptance on random situations (docs/SPEC_v0.8.md 2.3, 2.4, 6.4, 6.5).
usage: python3 tests_v08_solve.py N_TABLES PER_TABLE SEED OUT.json"""
import sys, json, time, random
from dataclasses import replace
import engine as e
import fuzz_lib as F

nt, per, seed, out = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
F.rng.seed(seed)
rng = random.Random(seed + 1)
e.set_flags(**e.FLAGS_V08)
rows = []
for t in range(nt):
    ars = F.rand_arsenal()
    s0 = replace(F.rand_situation(ars), balls=0, strikes=0, last=None)
    t0 = time.time()
    tab = e.solve_table(ars, s0)
    t_solve = time.time() - t0
    by = {x.name: x for x in ars}
    ks = e.sit_options(ars)
    for i in range(per):
        b, k = rng.randint(0, 3), rng.randint(0, 2)
        lp = rng.choice(ars)
        last = (lp.name, rng.choice(e.QUADS), rng.choice(["whiff", "foul", "ball", "cstrike"])) if rng.random() < 0.8 else None
        look = (rng.uniform(0.86, 1.02) * e.v_fb(ars, s0), rng.uniform(1.8, 3.2)) if rng.random() < 0.8 else None
        fooled = tuple(rng.choice(["FB", "OS"]) for _ in range(rng.randint(0, 1) if rng.random() < 0.3 else 0))
        s = replace(s0, balls=b, strikes=k, last=last, look=look)
        s = replace(s, b_h=e.lean_b_h(ars, s, fooled),
                    usage_by_call={(p.name, q): rng.randint(0, 2) for p in ars for q in e.targets(b, k) if rng.random() < 0.1})
        t1 = time.time()
        pi, sg, full, res, M = e.root_call(ars, s, tab)
        t_root = time.time() - t1
        pi2, sg2, full2, res2, _ = e.root_call(ars, s, tab)
        det = pi == pi2 and sg == sg2
        # linearization: exact sum_k sigma(k) C(a|k) vs C(a | expected shift), over the root's allowed calls
        look_ = s.look or tab.h0
        lin = {a: e.cost08(by[a[0]], a[1], s, ars, tab, look_, ("mix", sg))[0] for a in M}
        if b == 3:
            lin = {a: e.cost08(by[a[0]], a[1], s, ars, tab, look_, ("mix", sg), myopic=True)[0] for a in M}
        diffs = {a: abs(full[a] - lin[a]) for a in M}
        mean_d = sum(pi.get(a, 0) * d for a, d in diffs.items())
        # guardrail: every call with weight has myopic cost within delta of the best myopic cost (over all allowed calls)
        calls = e.allowed_calls(ars, s)
        cmy = {a: sum(tab.sigma[(b, k)][kk] * e.cost08(by[a[0]], a[1], s, ars, tab, look_, ("pure",) + kk, myopic=True)[0] for kk in ks) for a in calls}
        delta = 0.010 * e.run_scale(s.level)
        worst = max(cmy[a] - min(cmy.values()) for a, v in pi.items() if v > 0)
        chase_3 = b == 3 and k < 2 and any(q == "chase" for (n, q), v in pi.items() if v > 0)
        rows.append(dict(level=s.level, n=len(ars), b=b, k=k, res=res, det=det, lin_mean=mean_d, lin_max=max(diffs.values()),
                         guard=worst - delta, chase3=chase_3, t_solve=t_solve if i == 0 else None, t_root=t_root,
                         sweeps=tab.sweeps if i == 0 else None))
    print(t, round(t_solve, 2), flush=True)
json.dump(rows, open(out, "w"))
