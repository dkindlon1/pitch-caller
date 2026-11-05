"""v0.8 vs v0.7c in seed-paired simulated D3 games (sanity only: the simulator uses the engine's own model).
usage: python3 compare_sims.py runs/v07base runs/v08 -> results/v08_sims_d3.txt"""
import csv, glob, os, sys
from metrics import rho_from_logs


def summary(d):
    files = sorted(glob.glob(os.path.join(d, "g*.csv")))
    rows = [r for f in files for r in csv.DictReader(open(f))]
    runs = sum(int(r["runs"]) for r in rows)
    pa_end = [r for r in rows if any(x in r["detail"] for x in ("STRIKEOUT", "WALK", "HIT BY PITCH")) or r["result"] in ("weak", "solid", "hard")]
    k = sum("STRIKEOUT" in r["detail"] for r in rows); bb = sum("WALK" in r["detail"] for r in rows)
    pas = len(pa_end)
    chase3 = sum(r["count"] in ("3-0", "3-1") and r["quad"] == "chase" for r in rows)
    reg = sum(float(r["regret_exp"]) for r in rows) / len(rows)
    fb = sum(r["kind"] == "FB" for r in rows) / len(rows)
    mid22 = [r for r in rows if r["count"] == "2-2"]
    inz22 = sum(r["quad"] != "chase" for r in mid22) / max(1, len(mid22))
    return dict(games=len(files), pitches=len(rows), runs=runs, rpg=runs / len(files), pas=pas, k=k / pas, bb=bb / pas,
                ppa=len(rows) / pas, regret=reg, fb=fb, chase3=chase3, zone22=inz22, rho=rho_from_logs(files))


a, b = summary(sys.argv[1]), summary(sys.argv[2])
lines = ["Seed-paired simulated D3 games (same seeds, same hidden hitters and off-days); v0.7c vs v0.8. Sanity only: the",
         "simulator plays by the engine's own outcome model, and 8 games carry wide noise (runs per game sd ~3).", ""]
for key, lab, fmt in [("games", "games", "{}"), ("pitches", "pitches", "{}"), ("rpg", "runs allowed per game", "{:.2f}"), ("k", "strikeout rate", "{:.3f}"),
                      ("bb", "walk rate", "{:.3f}"), ("ppa", "pitches per plate appearance", "{:.2f}"), ("regret", "mean regret vs a caller who knows the hidden truth (runs/pitch)", "{:.4f}"),
                      ("fb", "fastball share", "{:.3f}"), ("chase3", "chase calls at 3-0/3-1 (must be 0)", "{}"), ("zone22", "2-2 calls aimed at the zone", "{:.3f}"),
                      ("rho", "rho, consecutive-fastball correlation (target |rho| <= 0.05)", "{:+.3f}")]:
    lines.append(f"  {lab:70s} v0.7c {fmt.format(a[key]):>8}   v0.8 {fmt.format(b[key]):>8}")
open("results/v08_sims_d3.txt", "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
