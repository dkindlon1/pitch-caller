"""v1.0 golden (Nov 9): the reference for the v1.0 engine.
  python3 golden/golden_v10.py make   -> writes golden/golden_v10.json from the current engine
  python3 golden/golden_v10.py check  -> recomputes every case and requires agreement to TOL (1e-9)

The same 500 input cases as the v0.9 golden, and the same outputs: the inputs, `inputs()` and `compute()` are imported
from golden_v09.py rather than copied, so the two goldens are provably the same cases and the only difference is which
engine produced the stored numbers. golden/golden_v09.json stays frozen as the historical v0.9 reference; this file is
what scripts/test-app.sh gates on from v1.0 on.

Why a tolerance rather than bit-exact equality: the engine is pure Python math.exp/log, so exp and log come from the
platform C library, and glibc and MSVC's libm differ by about 1 ULP per call, which the at-bat table solve accumulates
to ~1e-13. Demanding exact equality makes the check pass only on the machine that generated the file (see
docs/STEP0_v1.0_REPORT.md section 1.1). A real engine change moves these numbers by 1e-2 or more.
For a platform-independent check of the live Python and JS engines against each other, use golden/fast.py."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import cases as G8                                  # noqa: E402  (flat())
import golden_v09 as G9                             # noqa: E402  (inputs(), compute())

PATH = os.path.join(HERE, "golden_v10.json")
TOL = 1e-9


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    if mode == "make":
        if os.path.exists(PATH) and "--force" not in sys.argv:
            sys.exit(f"{PATH} exists; it is the frozen v1.0 reference. Pass --force to overwrite it deliberately.")
        cs = G9.inputs()
        for i, c in enumerate(cs):
            c["out"] = G9.compute(c)
            if (i + 1) % 100 == 0:
                print(i + 1, flush=True)
        json.dump(cs, open(PATH, "w"))
        print(f"wrote {PATH}: {len(cs)} cases")
        return
    cs = json.load(open(PATH))
    worst, bad = 0.0, []
    for i, c in enumerate(cs):
        want = dict(G8.flat(c["out"]))
        got = dict(G8.flat(G9.compute(c)))
        if set(want) != set(got):
            bad.append(f"case {i}: keys differ ({len(set(want) ^ set(got))})")
            continue
        for k, w in want.items():
            g = got[k]
            if isinstance(w, (int, float)) and not isinstance(w, bool) and isinstance(g, (int, float)):
                d = abs(w - g)
                worst = max(worst, d)
                if not (d <= TOL):
                    bad.append(f"case {i} {k}: golden {w} now {g} (diff {d:.3e})")
            elif w != g:
                bad.append(f"case {i} {k}: golden {w!r} now {g!r}")
    print(f"{len(cs)} cases, largest difference {worst:.2e}")
    for b in bad[:10]:
        print("  " + b)
    print(f"PASS: v1.0 reproduced within {TOL:g}" if not bad else f"FAIL: {len(bad)} differences")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
