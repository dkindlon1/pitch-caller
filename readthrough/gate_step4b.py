"""v0.9 Step 4b gate for item 10 (guardrail off): the 3-pitch starter's changeup must be in the mix in at least 11 of the
24 count-and-side cells and get at least 5% of calls, at every level. Also reports the 2- and 4-pitch starters.
usage (repo root): python3 readthrough/gate_step4b.py [--out results/step4b]"""
import json, os, sys
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import baseline_reports as B


def mix(mode, lv, st):
    G = B.grid(mode, lv, st)
    cells = defaultdict(int)
    use = defaultdict(float)
    for v in G.values():
        names = {n for (n, q), p in v["dist"].items() if p > 0}
        for n in v["kind"]:
            cells[n] += n in names
        for (n, q), p in v["dist"].items():
            use[n] += p / len(G)
    return {n: dict(cells=cells[n], of=len(G), share=round(use[n], 4)) for n in G[(0, 0, True)]["kind"]}


def main():
    outdir = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(os.path.dirname(HERE), "results", "step4b")
    os.makedirs(outdir, exist_ok=True)
    res, ok = {}, True
    for mode in ("v08", "v09"):
        for lv in B.LEVELS:
            for st in B.STAFFS:
                m = mix(mode, lv, st)
                res[f"{mode}|{lv}|{st}"] = m
                line = ", ".join(f"{n} {v['cells']}/{v['of']} cells {v['share']:.1%}" for n, v in m.items())
                gate = ""
                if st == "default" and "Changeup" in m:
                    g = m["Changeup"]["cells"] >= 11 and m["Changeup"]["share"] >= 0.05
                    gate = "  GATE " + ("pass" if g else "FAIL")
                    if mode == "v09":
                        ok &= g
                print(f"{mode} {lv:10s} {st:10s} {line}{gate}", flush=True)
    json.dump(res, open(os.path.join(outdir, "gate_mix.json"), "w"), indent=1)
    print("item 10 changeup gate (v09, every level):", "PASS" if ok else "FAIL")


if __name__ == "__main__":
    main()
