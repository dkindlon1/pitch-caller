"""v0.9 Step 5 report (no target): how often the engine calls inside (up-in, down-in), by count, at each level, for the
3-pitch starter, both sides averaged; v0.8, v0.9 without the inside term, and v0.9.
usage (repo root): python3 readthrough/inside_by_count.py -> results/step5/inside_by_count.txt"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import baseline_reports as B

MODES = ["v08", "v09_no_inside", "v09"]
out = []
for lv in B.LEVELS:
    G = {m: B.grid(m, lv, "default") for m in MODES}
    out.append(f"\n{lv}: inside share of calls (FB inside in brackets)")
    out.append("count  " + "  ".join(f"{m:>18s}" for m in MODES))
    tot = {m: [0.0, 0.0] for m in MODES}
    for b, k in B.COUNTS:
        cells = []
        for m in MODES:
            ins = sum(p for same in (True, False) for (n, q), p in G[m][(b, k, same)]["dist"].items() if q in ("up-in", "down-in")) / 2
            fbi = sum(p for same in (True, False) for (n, q), p in G[m][(b, k, same)]["dist"].items()
                      if q in ("up-in", "down-in") and G[m][(b, k, same)]["kind"][n] == "FB") / 2
            tot[m][0] += ins / len(B.COUNTS); tot[m][1] += fbi / len(B.COUNTS)
            cells.append(f"{ins:9.1%} ({fbi:5.1%})")
        out.append(f"{b}-{k}    " + "  ".join(f"{c:>18s}" for c in cells))
    out.append("all    " + "  ".join(f"{tot[m][0]:9.1%} ({tot[m][1]:5.1%})".rjust(18) for m in MODES))
    print("\n".join(out[-15:]), flush=True)
os.makedirs(os.path.join(os.path.dirname(HERE), "results", "step5"), exist_ok=True)
open(os.path.join(os.path.dirname(HERE), "results", "step5", "inside_by_count.txt"), "w").write("\n".join(out) + "\n")
