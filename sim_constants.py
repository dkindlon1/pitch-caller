"""v0.8 shared constants computed from simulation -> sim_constants.json (read by engine.py and engine.js).
A_BAR (7.5): weighted geometric mean of the count zone area, weights = taken pitches per count in simulated games.
I_BAR_UMP (7.5): average per-take information d^2/(p(1-p)) for a three-pitch reference arsenal.
usage: python3 sim_constants.py runs/v07base/g*.csv"""
# Nov 6: the engine is now one flag-free v0.9 engine. This script ran under the v0.7c settings when its data was made;
# those settings no longer exist, so a rerun computes v0.9-based values.

import csv, json, os, sys
from math import exp, log
from collections import Counter
import engine as e
from metrics import ref_arsenals

takes = Counter()
for path in sys.argv[1:]:
    for r in csv.DictReader(open(path)):
        if r["result"] in ("ball", "cstrike", "wp_ball", "hbp"):
            takes[tuple(int(x) for x in r["count"].split("-"))] += 1
tot = sum(takes.values())
a_bar = exp(sum(n * log(e.zone_area(b, k)) for (b, k), n in takes.items()) / tot)
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sim_constants.json")
cons = json.load(open(path)) if os.path.exists(path) else {}
cons["A_BAR"] = {}; cons["I_BAR_UMP"] = {}
cons["TAKE_W"] = {f"{b}-{k}": n / tot for (b, k), n in sorted(takes.items())}   # count weights for centering kappa
ars = ref_arsenals()["three"]
for level in ("hs", "college_d3", "college_d1", "mlb"):
    cons["A_BAR"][level] = a_bar
    num = den = 0.0
    for (b, k), n in takes.items():
        s = e.Situation(b, k, 0, (False, False, False), level=level)
        _, dist = e.call_mixed(ars, s)
        for pr, _, p, q in dist:
            P = e.outcome_probs(p, q, s, ars)
            pt = P["cstrike"] + P["ball"] + P["wp_ball"] + P["hbp"]
            pi, d = e.take_stats(p, q, s, ars)
            if 0 < pi < 1:
                w = n * pr * pt
                num += w * d * d / (pi * (1 - pi)); den += w
    cons["I_BAR_UMP"][level] = num / den
# 8.2 I0: information of 50 average plate appearances, per grade and level (pitch mix over counts from the logs)
allp = Counter()
n_pa = 0
for log_path in sys.argv[1:]:
    rows = list(csv.DictReader(open(log_path)))
    for r in rows:
        allp[tuple(int(x) for x in r["count"].split("-"))] += 1
    n_pa += sum(1 for a, b in zip(rows, rows[1:] + [None]) if b is None or a["batter"] != b["batter"] or a["inning"] != b["inning"])
ppa = sum(allp.values()) / n_pa
cons["I0_GRADE"] = {}
for level in ("hs", "college_d3", "college_d1", "mlb"):
    acc = {"c": 0.0, "w": 0.0, "d": 0.0}
    wt = sum(allp.values())
    for (b, k), n in allp.items():
        s = e.Situation(b, k, 0, (False, False, False), level=level)
        _, dist = e.call_mixed(ars, s)
        for pr, _, p, q in dist:
            P = e.outcome_probs(p, q, s, ars)
            gs = e.grade_stats(p, q, s, ars)
            share = {"c": P["whiff"] + P["foul"] + P["weak"] + P["solid"] + P["hard"], "w": P["weak"] + P["solid"] + P["hard"], "d": 1.0}
            for g, (pi, d) in gs.items():
                if 0 < pi < 1:
                    acc[g] += n / wt * pr * share[g] * d * d / (pi * (1 - pi))
    cons["I0_GRADE"][level] = {g: 50 * ppa * v for g, v in acc.items()}
cons["PITCHES_PER_PA"] = ppa
for t in ("A_BAR", "I_BAR_UMP", "I0_GRADE"):
    cons[t]["travel"] = cons[t]["hs"]; cons[t]["college"] = cons[t]["college_d1"]
json.dump(cons, open(path, "w"), indent=1)
print(f"takes {tot}, A_BAR {a_bar:.4f}, I_BAR_UMP", {k: round(v, 4) for k, v in cons["I_BAR_UMP"].items()})
