"""v1.1 Step 4 (Drew's Q4): size the riding-fastball-up-with-two-strikes coach rule. For each size: row C5's acceptable
share (pass >= 70%) and the "can't overly lean" ceiling: the riding four-seam aimed up as a share of all two-strike calls,
on every grid arsenal with a riding four-seam, every level, bases empty, both sides (proposed ceiling 35%).
usage (repo root): python3 readthrough/ride_up_sizes.py --suite v11"""
import os, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
import scenarios as S, engine as e, grid_v10 as G
doc, _ = S.load()
c5 = [r for r in doc["rows"] if r["id"] == "C5"][0]
ARS = {k: v for k, v in G.ARSENALS.items() if any(p.kind == "FB" and p.shape in ("rides", "ride") for p in v)}
def c5_acc():
    ars, s, ex = S.build(doc, c5)
    d = S.call_dist("v09", ars, s, ex)
    return sum(pr for pr, _, k, q in d if any(S.matches(x, k, q) for x in c5["acceptable"]))
def ride_up_share():
    worst = {lv: (0, None) for lv in ("hs", "college_d3", "college_d1")}
    for name, a0 in ARS.items():
        for lv in ("hs", "college_d3", "college_d1"):
            for b in (0, 1, 2):
                for same in (True, False):
                    a = [e.Pitch(**{**p.__dict__}) for p in a0]
                    s = e.Situation(b, 2, 0, (False,) * 3, level=lv, same_side=same); s = replace(s, win=e.win_constants(s))
                    _, dist, _, _ = e.call_v08(a, s, rng=None)
                    sh = sum(pr for pr, _, p, q in dist if e.ride_up_2k(p, q, s))
                    if sh > worst[lv][0]: worst[lv] = (sh, f"{name} {b}-2 {'same' if same else 'opp'}")
    return worst
SIZES = [float(x) for x in sys.argv[1:] if not x.startswith("--") and x != "v11"] or [0.0, 0.005, 0.01, 0.015]
for size in SIZES:
    e.COACH_RULE["ride_up_2k"] = size
    w = ride_up_share()
    print(f"size {size:.4f}: C5 acceptable {c5_acc():.1%}  | ride-up largest share of two-strike calls: " +
          "; ".join(f"{lv} {v[0]:.0%} ({v[1]})" for lv, v in w.items()), flush=True)
