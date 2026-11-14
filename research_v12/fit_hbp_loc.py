"""v1.2 Step 6 (Drew, Nov 13, row L6: "flatten inside, keep the total"): refit the inside hit-batter multiplier HBP_LOC so the
engine's ratio (HBP per pitch on calls aimed inside) / (HBP per pitch over all its calls) matches Single-A's ratio (HBP per
pitch that crossed the inside third or further in) / (HBP per pitch overall), then scale every HBP_LOC value by one constant
so the engine's overall HBP per pitch is unchanged. Caveat (said to Drew): "aimed in" and "crossed in" aren't the same
event; aimed-in pitches cross further in on average, so matching the ratio is a conservative flattening.
Reference calls: the 10 grid arsenals x 8 counts x both hitter sides at D3, lean 0, solved once with the current prices.
usage (repo root): python3 -I research_v12/fit_hbp_loc.py  -> results/v12/fit_hbp_loc.txt"""
import glob, os, random, sys
import pandas as pd
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import engine as e
from grid_v10 import ARSENALS

OUT = []
COUNTS = [(0, 0), (1, 0), (0, 1), (1, 1), (2, 1), (0, 2), (1, 2), (2, 2)]
INS = ("up-in", "down-in")


def say(x=""):
    print(x, flush=True)
    OUT.append(x)


def single_a_ratio():
    fs = sorted(glob.glob(os.path.join(HERE, "data", "statcast_minors", "A_*.csv")))
    df = pd.concat([pd.read_csv(f, usecols=["events", "description", "stand", "plate_x"], low_memory=False) for f in fs], ignore_index=True)
    df = df[df.plate_x.notna() & df.stand.isin(["R", "L"])]
    hbp = (df.description == "hit_by_pitch") | (df.events == "hit_by_pitch")
    xin = df.plate_x.where(df.stand == "L", -df.plate_x) * 12.0
    inside = xin >= 17.0 / 6.0
    r = hbp[inside].mean() / hbp.mean()
    say(f"Single-A 2024-25 ({len(df):,} pitches): HBP per pitch {hbp.mean():.4f} overall, {hbp[inside].mean():.4f} crossing the inside "
        f"third or further in ({inside.mean():.1%} of pitches): ratio {r:.2f}")
    return r


def reference_calls(level="college_d3"):
    rows = []
    for an, ars0 in ARSENALS.items():
        for same in (True, False):
            for b, k in COUNTS:
                ars = [e.Pitch(**x.__dict__) for x in ars0]
                s = e.Situation(b, k, 1, (False,) * 3, level=level, same_side=same)
                _, dist, _, _ = e.call_v08(ars, s, rng=random.Random(0))
                rows += [(pr, p, q, s, ars) for pr, _, p, q in dist]
    return rows


def rates(rows):
    tot = sum(pr for pr, *_ in rows)
    allh = sum(pr * e.outcome_probs(p, q, s, a)["hbp"] for pr, p, q, s, a in rows) / tot
    ti = sum(pr for pr, p, q, s, a in rows if q in INS)
    inh = sum(pr * e.outcome_probs(p, q, s, a)["hbp"] for pr, p, q, s, a in rows if q in INS) / ti
    return allh, inh


def main():
    target = single_a_ratio()
    base = dict(e.HBP_LOC)
    rows = {lv: reference_calls(lv) for lv in ("college_d3", "hs")}
    a0, i0 = rates(rows["college_d3"])
    say(f"engine D3 now: HBP per pitch {a0:.4f} overall, {i0:.4f} aimed inside: ratio {i0 / a0:.2f} (inside multiplier {base['up-in']})")
    best = None
    for m in [x / 100 for x in range(60, 161, 5)]:
        e.HBP_LOC.update({"up-in": m, "down-in": m})
        a, i = rates(rows["college_d3"])
        say(f"  inside {m:.2f}: ratio {i / a:.2f}")
        if best is None or abs(i / a - target) < abs(best[1] - target):
            best = (m, i / a)
    m = best[0]
    e.HBP_LOC.update({"up-in": m, "down-in": m})
    a1, _ = rates(rows["college_d3"])
    c = a0 / a1              # scale every multiplier so the overall rate is unchanged
    new = {k: round(v * c, 3) for k, v in e.HBP_LOC.items()}
    e.HBP_LOC.clear(); e.HBP_LOC.update(new)
    a2, i2 = rates(rows["college_d3"])
    say(f"fit: inside {m:.2f} before scaling; scale x{c:.3f} -> HBP_LOC {new}")
    say(f"check D3: overall {a0:.4f} -> {a2:.4f}; aimed inside {i0:.4f} -> {i2:.4f}; ratio {i2 / a2:.2f} (Single-A {target:.2f})")
    for lv in ("hs",):
        e.HBP_LOC.clear(); e.HBP_LOC.update(base); b0, _ = rates(rows[lv])
        e.HBP_LOC.clear(); e.HBP_LOC.update(new); b1, _ = rates(rows[lv])
        say(f"check {lv}: overall {b0:.4f} -> {b1:.4f}")
    e.HBP_LOC.clear(); e.HBP_LOC.update(base)
    open(os.path.join(HERE, "results", "v12", "fit_hbp_loc.txt"), "w").write("\n".join(OUT) + "\n")


if __name__ == "__main__":
    main()
