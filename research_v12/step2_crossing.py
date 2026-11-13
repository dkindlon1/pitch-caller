"""v1.2 Step 2 (Drew, Nov 13: "inside" is judged by where the pitch crosses; v1.1's hit-batter price stays): fastball-
class share AIMED inside vs share CROSSING the inside third (miss model), same-side hitters, by level, on three grid
arsenals, counts 0-0..2-2 averaged. Compare: Drew's D3 estimate 20-35%; Single-A 34% four-seam / 41% sinker; MLB 28% / 48%.
usage (repo root): python3 research_v12/step2_crossing.py"""
import os, random, sys
sys.path[:0] = [os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "readthrough")]
import engine as e
from grid_v10 import ARSENALS
from scenarios import p_cross_inside
COUNTS = [(0, 0), (1, 0), (0, 1), (1, 1), (2, 1), (0, 2), (1, 2), (2, 2)]
print(f"{'level':11}{'arsenal':12}{'pitch':10}{'aimed in':>10}{'crossing in':>13}   (share of that pitch's calls)")
for lvl in ("hs", "college_d3", "college_d1", "mlb"):
    for an in ("sink_sweep", "deadzone", "AVG3"):
        ars = ARSENALS[an]
        agg = {}
        for b, k in COUNTS:
            s = e.Situation(b, k, 1, (False, False, False), inning=3, level=lvl, same_side=True)
            _, dist, _, _ = e.call_v08(ars, s, rng=random.Random(0))
            for pr, _, p, q in dist:
                if not e.is_fastball(p.kind):
                    continue
                a = agg.setdefault(p.name, [0.0, 0.0, 0.0])
                a[0] += pr; a[1] += pr * (q in ("up-in", "down-in")); a[2] += pr * p_cross_inside(p, q, s)
        for name, (t, ai, cx) in agg.items():
            print(f"{lvl:11}{an:12}{name:10}{ai / t:>10.1%}{cx / t:>13.1%}")
