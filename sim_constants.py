"""v0.8 shared constants computed from simulation -> sim_constants.json (read by engine.py and engine.js).
A_BAR (7.5): weighted geometric mean of the count zone area, weights = taken pitches per count in simulated games.
I_BAR_UMP (7.5): average per-take information d^2/(p(1-p)) for a three-pitch reference arsenal.
usage: python3 sim_constants.py runs/v07base/g*.csv"""
import csv, json, os, sys
from math import exp, log
from collections import Counter
import engine as e
from metrics import ref_arsenals

e.set_flags(**e.FLAGS_V07)
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
for t in ("A_BAR", "I_BAR_UMP"):
    cons[t]["travel"] = cons[t]["hs"]; cons[t]["college"] = cons[t]["college_d1"]
json.dump(cons, open(path, "w"), indent=1)
print(f"takes {tot}, A_BAR {a_bar:.4f}, I_BAR_UMP", {k: round(v, 4) for k, v in cons["I_BAR_UMP"].items()})
