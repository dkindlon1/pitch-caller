"""v1.2 Step 6 (Drew, Nov 13: row L6, "check the HBP rate first"): is the engine's hit-batter rate for a cutter in on an
opposite-side hitter too high at college? Single-A 2024-25 (data/statcast_minors, every 4th day) is the nearest measured
level. Compared per pitch, the same way on both sides:
  - Single-A: cutters (FC) to opposite-hand hitters: HBP per pitch, overall and by where the pitch crossed (inches toward
    the batter from plate centre);
  - the engine at D3 and HS: the same pitch's HBP chance per pitch, by target, and over its own call mix (lean 0).
usage (repo root): python3 -I research_v12/l6_hbp_check.py  -> results/v12/l6_hbp_check.txt"""
import glob, os, sys
from dataclasses import replace
import pandas as pd
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import engine as e

OUT = []


def say(x=""):
    print(x, flush=True)
    OUT.append(x)


def main():
    fs = sorted(glob.glob(os.path.join(HERE, "data", "statcast_minors", "A_*.csv")))
    df = pd.concat([pd.read_csv(f, usecols=["pitch_type", "events", "description", "game_type", "stand", "p_throws", "plate_x"], low_memory=False)
                    for f in fs], ignore_index=True)
    df = df[df.plate_x.notna() & df.stand.isin(["R", "L"]) & df.p_throws.isin(["R", "L"])]
    df["hbp"] = (df.description == "hit_by_pitch") | (df.events == "hit_by_pitch")
    df["opp"] = df.stand != df.p_throws
    df["xin"] = df.plate_x.where(df.stand == "L", -df.plate_x) * 12.0          # inches toward the batter
    say(f"== Single-A 2024-25 sample: {len(df):,} pitches, {len(fs)} days")
    for lab, sub in (("all pitches", df), ("cutters, any hitter", df[df.pitch_type == "FC"]),
                     ("cutters, opposite-hand hitter", df[(df.pitch_type == "FC") & df.opp]),
                     ("four-seams, opposite-hand hitter", df[(df.pitch_type == "FF") & df.opp])):
        say(f"  {lab:34} n {len(sub):>7,}  HBP per pitch {sub.hbp.mean():.4f}")
    c = df[(df.pitch_type == "FC") & df.opp]
    say("  cutters to opposite-hand hitters, by crossing point (in. toward the batter): HBP per pitch")
    for lo, hi in ((-99, 2.8), (2.8, 8.5), (8.5, 12), (12, 99)):
        sub = c[(c.xin >= lo) & (c.xin < hi)]
        say(f"    {lo:>5} to {hi:<5} n {len(sub):>6,}  share {len(sub) / len(c):5.1%}  HBP {sub.hbp.mean() if len(sub) else 0:.4f}")
    inside = c[c.xin >= 2.8]
    say(f"  crossing the inside third or further in: {len(inside) / len(c):.1%} of them; HBP per such pitch {inside.hbp.mean():.4f}")

    say("\n== The engine, lean 0, opposite-side hitter, 1-1 (the L6 setup)")
    ars = [e.Pitch("Fastball", "FB", 3, 3, 0.8, shape="", velo=90), e.Pitch("Cutter", "FC", 3, 3, 0.75, shape="hard", velo=86),
           e.Pitch("Changeup", "CH", 3, 3, 0.7, shape="fade", velo=81)]
    e.resolve_speeds(ars)
    for lv in ("hs", "college_d3", "college_d1", "mlb"):
        s = e.Situation(1, 1, 1, (False,) * 3, level=lv, same_side=False)
        s = replace(s, win=e.win_constants(s))
        fc = ars[1]
        by_q = {q: e.outcome_probs(fc, q, s, ars)["hbp"] for q in ("up-in", "down-in", "middle", "up-away", "down-away", "chase")}
        _, dist, _, _ = e.call_v08(ars, s, rng=None)
        t = sum(pr for pr, _, p, q in dist if p.kind == "FC")
        mix = sum(pr * e.outcome_probs(p, q, s, ars)["hbp"] for pr, _, p, q in dist if p.kind == "FC") / t if t else float("nan")
        say(f"  {lv:11} cutter HBP per pitch by target: " + ", ".join(f"{q} {v:.4f}" for q, v in by_q.items()) + f"; over its call mix {mix:.4f}")
    say("\nReading: compare the engine's per-pitch rate aimed in (up-in / down-in) with Single-A's per-pitch rate for cutters that "
        "crossed the inside third, and its call-mix rate with Single-A's overall cutter-to-opposite rate.")
    open(os.path.join(HERE, "results", "v12", "l6_hbp_check.txt"), "w").write("\n".join(OUT) + "\n")


if __name__ == "__main__":
    main()
