"""v1.2 research: can the app's 5x5 landing grid show a miss lean? Lateral axis only, pitcher frame (arm side +), inches.
Plate edges +-10 in. (half plate + ball radius); the inner three grid columns split the plate in thirds; the outer ring is
"just off" (assumed out to +-16 in.); past it is "Way off" (no direction today). Misses ~ Normal(target + lean - pull*target,
sigma). Estimators: A = mean cell offset, way-off pitches dropped (today's log); B = A with a directional way-off
(scored at +-20 in.); C = B averaged over arm-side and glove-side targets (cancels the pull toward the middle).
usage: python3 research_v12/grid_lean_sim.py"""
import random, statistics as st
COLS = [(-16, -10, -13), (-10, -10 / 3, -20 / 3), (-10 / 3, 10 / 3, 0), (10 / 3, 10, 20 / 3), (10, 16, 13)]
def cell(x, directional):
    for lo, hi, c in COLS:
        if lo <= x < hi: return c
    return (20 if x > 0 else -20) if directional else None
def est(n, lean, sigma, pull, directional, both_sides, rng):
    vals = []
    for i in range(n):
        t = 20 / 3 if (not both_sides or i % 2 == 0) else -20 / 3
        x = rng.gauss(t + lean - pull * t, sigma)
        c = cell(x, directional)
        if c is None: continue
        vals.append(c - (20 / 3 if t > 0 else -20 / 3))
    return st.mean(vals) if vals else 0.0
rng = random.Random(7)
print(f"{'sigma':>5}{'n':>5}{'lean':>5} | {'A bias':>7}{'A sd':>6} | {'B bias':>7}{'B sd':>6} | {'C bias':>7}{'C sd':>6}")
for sigma in (8, 11):
    for n in (30, 60, 120):
        for lean in (0.0, 2.5):
            r = {}
            for k, (dr, bs) in {"A": (False, False), "B": (True, False), "C": (True, True)}.items():
                xs = [est(n, lean, sigma, 0.3, dr, bs, rng) for _ in range(2000)]
                r[k] = (st.mean(xs) - lean, st.pstdev(xs))
            print(f"{sigma:5}{n:5}{lean:5.1f} | {r['A'][0]:+7.2f}{r['A'][1]:6.2f} | {r['B'][0]:+7.2f}{r['B'][1]:6.2f} | {r['C'][0]:+7.2f}{r['C'][1]:6.2f}")
