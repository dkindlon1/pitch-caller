"""
Logic checks on thousands of random situations (v0.6d).
Part A: rules that must hold everywhere (probabilities, windows, cutoffs, count logic, run values, monotonic effects).
Part B: learning checks over game-like sequences (mashers, holes, timing, a pitch not landing, shake-offs, the change flag).
usage: python3 fuzz.py [n_cheap] [n_full]
"""
import random, sys, math
from dataclasses import replace
import engine as e
from flags import pitcher_status
from simulate import our_staff

rng = random.Random(7)
LEVELS = ["hs", "college_d3", "college_d1", "mlb"]
SH = {"FB": ["ride", "sink", "run", "cut", ""], "SL": ["tight", "sweeper", ""], "CB": ["loopy", "sharp", ""], "CH": ["fade", "drop", ""]}
results = []


MATERIAL = 0.002     # runs per pitch: smaller reversals are reported but are not failures (see note at the end)
tiny = {}


def report(name, fails, n, example=""):
    ok = fails == 0
    results.append(ok)
    t = tiny.get(name, 0)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {n - fails}/{n} hold" + (f" ({t} tiny reversals under {MATERIAL} runs)" if t else "")
          + (f"\n       e.g. {example}" if not ok and example else ""))


def worse(d, name):
    """d = how much the 'better' version costs above the 'worse' one. Material if over MATERIAL."""
    if d > MATERIAL:
        return 1
    if d > 1e-9:
        tiny[name] = tiny.get(name, 0) + 1
    return 0


def rand_arsenal():
    kinds = rng.choice([["FB", "CB"], ["FB", "SL"], ["FB", "SL", "CH"], ["FB", "CB", "CH"], ["FB", "SL", "CB", "CH"]])
    out = []
    for k in kinds:
        out.append(e.Pitch({"FB": "Fastball", "SL": "Slider", "CB": "Curveball", "CH": "Changeup"}[k], k,
                           grade=rng.randint(1, 5), command=rng.randint(1, 5), conf=round(rng.uniform(0.3, 0.95), 2),
                           shape=rng.choice(SH[k]), velo=rng.choice([0, 72, 80, 88, 94]) if k == "FB" else 0,
                           slot=rng.choice(["three-quarter", "over the top", "sidearm", "high three-quarter"])))
    return out


def rand_situation(ars):
    b, k = rng.randint(0, 3), rng.randint(0, 2)
    last = None
    if rng.random() < 0.6:
        lp = rng.choice(ars)
        last = (lp.name, rng.choice(e.QUADS)) + ((rng.choice(["whiff", "foul", "ball", "cstrike"]),) if rng.random() < 0.7 else ())
    return e.Situation(b, k, rng.randint(0, 2), tuple(rng.random() < 0.35 for _ in range(3)), inning=rng.randint(1, 9),
                       margin=rng.randint(-4, 4), pitch_count=rng.randint(0, 120), batters_faced=rng.randint(0, 30),
                       level=rng.choice(LEVELS), same_side=rng.random() < 0.6, last=last,
                       usage_this_count={p.name: rng.randint(0, 3) for p in ars if rng.random() < 0.4},
                       timing={"FB": round(rng.uniform(-0.8, 0.8), 2), "OS": round(rng.uniform(-0.8, 0.8), 2)} if rng.random() < 0.5 else {},
                       hitter_damage={kk: (round(rng.uniform(-0.9, 0.9), 2), rng.randint(1, 40)) for kk in ("FB", "OS") if rng.random() < 0.4},
                       landing_today={p.name: (rng.randint(0, 10), rng.randint(5, 14)) for p in ars if rng.random() < 0.4})


