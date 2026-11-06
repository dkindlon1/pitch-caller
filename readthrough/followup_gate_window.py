"""v0.9 follow-up C (Nov 5 night): the item 10 changeup gate (gate_step4b.py: the 3-pitch starter's changeup in the mix
in at least 11 of 24 count-and-side cells and at least 5% of calls, every level) for the guardrail at several windows.
Rows: v0.9 with the guardrail on at GUARD_DELTA = 0.010 (v0.8's window) up to 0.030, and v0.9 as built (guardrail off).
usage (repo root): python3 readthrough/followup_gate_window.py [--out results/followups/gate_window.txt]"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import engine as e
import baseline_reports as B
from gate_step4b import mix


def main():
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    built = dict(B.MODES["v09"])
    rows = [("guardrail on, window 0.010", dict(built, guardrail_v09=False), 0.010),
            ("guardrail on, window 0.0125", dict(built, guardrail_v09=False), 0.0125),
            ("guardrail on, window 0.015", dict(built, guardrail_v09=False), 0.015),
            ("guardrail on, window 0.0175", dict(built, guardrail_v09=False), 0.0175),
            ("guardrail on, window 0.020", dict(built, guardrail_v09=False), 0.020),
            ("guardrail on, window 0.030", dict(built, guardrail_v09=False), 0.030),
            ("guardrail off (v0.9 as built)", built, 0.010)]
    L = ["v0.9 follow-up C: item 10 changeup gate by guardrail window (3-pitch starter; pass = 11+ of 24 cells and 5%+)", ""]
    try:
        for lab, flags, d in rows:
            B.MODES["v09"] = flags
            e.GUARD_DELTA = d
            cells = []
            ok = True
            for lv in B.LEVELS:
                m = mix("v09", lv, "default")["Changeup"]
                g = m["cells"] >= 11 and m["share"] >= 0.05
                ok &= g
                cells.append(f"{lv} {m['cells']:2d}/24 {m['share']:5.1%}")
            L.append(f"{lab:32s} " + " | ".join(cells) + f"   gate {'PASS' if ok else 'FAIL'}")
            print(L[-1], flush=True)
    finally:
        B.MODES["v09"] = built
        e.GUARD_DELTA = 0.010
    if out:
        open(out, "w").write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
