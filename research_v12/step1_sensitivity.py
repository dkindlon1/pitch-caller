"""v1.2 Step 1 sensitivity report (no gate): the call mix with every pitch at the research-check leans by type
(research doc section 1: sinker +2.7, changeup +3.5, four-seam +1.1, cutter -1.0, slider -2.2, curve -0.8 in. arm side)
vs even, on the grid arsenals, bases empty, counts 0-0..2-2, both batter sides. Reports the fastball-class share aimed
inside, the share aimed at the middle / down-middle, and how far each cell's call mix moves.
usage (repo root): python3 research_v12/step1_sensitivity.py [levels...]"""
import os, random, sys
from dataclasses import replace
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import engine as e
from grid_v10 import ARSENALS
LEAN = {"SI": 2.7, "CH": 3.5, "FB": 1.1, "FC": -1.0, "SL": -2.2, "CB": -0.8}
COUNTS = [(0, 0), (1, 0), (0, 1), (1, 1), (2, 1), (0, 2), (1, 2), (2, 2)]
levels = sys.argv[1:] or ["college_d3", "mlb"]


def mix(ars, s):
    _, dist, _, _ = e.call_v08(ars, s, rng=random.Random(0))
    m = {}
    for pr, _, p, q in dist:
        m[(p.kind, q)] = m.get((p.kind, q), 0.0) + pr
    return m


def share(m, pred):
    return sum(v for (k, q), v in m.items() if pred(k, q))


INS = ("up-in", "down-in")
for lvl in levels:
    print(f"== {lvl}")
    print(f"{'arsenal':11}{'side':6}{'FB-class in: even -> lean':>28}{'middle/dm: even -> lean':>26}{'median / max mix move':>24}")
    for an, ars in ARSENALS.items():
        leaned = [replace(p, lean_x=LEAN[p.kind]) for p in ars]
        for same in (True, False):
            a_in = b_in = a_mid = b_mid = 0.0; moves = []
            for b, k in COUNTS:
                s = e.Situation(b, k, 1, (False, False, False), inning=3, level=lvl, same_side=same)
                m0, m1 = mix(ars, s), mix(leaned, s)
                a_in += share(m0, lambda kk, q: e.is_fastball(kk) and q in INS); b_in += share(m1, lambda kk, q: e.is_fastball(kk) and q in INS)
                a_mid += share(m0, lambda kk, q: q in ("middle", "down-middle")); b_mid += share(m1, lambda kk, q: q in ("middle", "down-middle"))
                keys = set(m0) | set(m1)
                moves.append(0.5 * sum(abs(m0.get(x, 0) - m1.get(x, 0)) for x in keys))
            n = len(COUNTS); moves.sort()
            print(f"{an:11}{'same' if same else 'opp':6}{a_in / n:>17.1%} -> {b_in / n:5.1%}{a_mid / n:>17.1%} -> {b_mid / n:5.1%}"
                  f"{moves[n // 2]:>14.1%} / {moves[-1]:5.1%}")
