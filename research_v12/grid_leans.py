"""v1.2 Step 6, last bullet: v1.1's predictability grid checks (grid_v10.checks) on all 10 arsenals at lean 0 and at the
research-check leans: every pitch given the MLB average lateral lean for its kind from the OpenCommand naive-target check
(RESEARCH_location_proxies section 1, after removing the pull toward the middle: four-seam +1.1, sinker +2.7, cutter -1.0,
slider -2.2, curve -0.8, changeup +3.5 in., arm side +). Vertical leans aren't supported by that check, so they stay 0.
usage (repo root): python3 research_v12/grid_leans.py  -> results/v12/grid_leans.txt"""
import os, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import grid_v10 as G

LEAN = {"FB": 1.1, "SI": 2.7, "FC": -1.0, "SL": -2.2, "CB": -0.8, "CH": 3.5}
OUT = []


def say(x=""):
    print(x, flush=True)
    OUT.append(x)


def run(label, arsenals):
    g = G.grid(arsenals=arsenals)
    res = G.checks(g)
    say(f"== {label}: {sum(1 for _, ok, _, hard in res if hard and ok)}/{sum(1 for *_, hard in res if hard)} hard checks pass")
    for name, ok, detail, hard in res:
        say(f"  [{'PASS' if ok else 'FAIL'}{'' if hard else ', reported'}] {name}  ({detail})")
    return g, res


def main():
    g0, r0 = run("lean 0", G.ARSENALS)
    leaned = {an: [replace(x, lean_x=LEAN[x.kind]) for x in ars] for an, ars in G.ARSENALS.items()}
    g1, r1 = run("research-check leans", leaned)
    moved = sorted(((k, abs(g1[k]["top_share"] - g0[k]["top_share"])) for k in g0), key=lambda t: -t[1])[:5]
    say("largest top-call share changes with the leans: " + "; ".join(f"{k[0]}/{k[1]}/{k[2]}/{k[3][0]}-{k[3][1]} {d:+.2f}" for k, d in moved))
    open(os.path.join(HERE, "results", "v12", "grid_leans.txt"), "w").write("\n".join(OUT) + "\n")
    sys.exit(0 if all(ok for _, ok, _, hard in r0 + r1 if hard) else 1)


if __name__ == "__main__":
    main()
