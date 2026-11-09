"""Fast live Python-vs-JS parity harness (v1.0 Step 0b).

Runs golden/cases.py's compute() on the first N cases of golden/golden_v09.json in Python, runs the JS twin
(golden/fast.js) on the same inputs, and diffs the two live. Unlike golden/golden_v09.py this compares the two
*current* engines against each other rather than against the frozen golden JSON, so it is immune to the
platform libm drift that makes bit-exact comparison against a glibc-generated reference impossible off that
platform. Tolerance 1e-9 on numbers; exact on everything else.

usage: python3 golden/fast.py N          -> compute both sides, diff, exit non-zero on any mismatch
       python3 golden/fast.py --emit N   -> print this side's results as JSON (used by golden/fast.js)
"""
import json, os, subprocess, sys
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[:0] = [HERE, ROOT]
import cases as G                                  # noqa: E402

TOL = 1e-9
GOLD = os.path.join(HERE, "golden_v09.json")


def load(n):
    cs = json.load(open(GOLD))
    if n > len(cs):
        sys.exit(f"only {len(cs)} golden cases available, asked for {n}")
    return cs[:n]


def compute(c):
    """cases.compute() on one golden case, with v0.9's matchup applied the way golden_v09.py applies it."""
    d = dict(c)
    s = dict(c["s"])
    mm = s.pop("matchup", None)
    d["s"] = s
    ars, sit = G.from_dicts(d)
    if mm:
        sit = replace(sit, matchup=mm)
    orig = G.from_dicts
    G.from_dicts = lambda _c: (ars, sit)             # cases.compute() re-derives inputs; hand it ours
    try:
        return G.compute(c)
    finally:
        G.from_dicts = orig


def py_side(n):
    return [compute(c) for c in load(n)]


def js_side(n):
    out = subprocess.run([os.environ.get("NODE", "node"), os.path.join(HERE, "fast.js"), "--emit", str(n)],
                         capture_output=True, text=True, cwd=ROOT)
    if out.returncode != 0:
        sys.exit(f"JS side failed (exit {out.returncode}):\n{out.stderr.strip()[:4000]}")
    return json.loads(out.stdout)


def diff(py, js):
    """Flatten both sides and compare. Returns (mismatches, worst-by-group, compared-count)."""
    bad, worst, n = [], {}, 0
    for i, (p, j) in enumerate(zip(py, js)):
        wp, wj = dict(G.flat(p)), dict(G.flat(j))
        for k in sorted(set(wp) ^ set(wj)):
            bad.append(f"case {i} {k}: only in {'Python' if k in wp else 'JS'}")
        for k in sorted(set(wp) & set(wj)):
            a, b = wp[k], wj[k]
            n += 1
            num = (isinstance(a, (int, float)) and not isinstance(a, bool)
                   and isinstance(b, (int, float)) and not isinstance(b, bool))
            if num:
                d = abs(a - b)
                grp = k.split(".")[0]
                if d > worst.get(grp, 0.0):
                    worst[grp] = d
                if not (d <= TOL):
                    bad.append(f"case {i} {k}: py {a!r} js {b!r} (diff {d:.3e})")
            elif a != b:
                bad.append(f"case {i} {k}: py {a!r} js {b!r}")
    return bad, worst, n


def main():
    args = [a for a in sys.argv[1:] if a != "--emit"]
    emit = "--emit" in sys.argv
    n = int(args[0]) if args else 40
    if emit:
        json.dump(py_side(n), sys.stdout)
        return
    import time
    t0 = time.time(); py = py_side(n); t_py = time.time() - t0
    t0 = time.time(); js = js_side(n); t_js = time.time() - t0
    bad, worst, cmp_n = diff(py, js)
    print(f"{n} cases ({sum(1 for c in load(n) if c['full'])} with full solves), {cmp_n} values compared, "
          f"tolerance {TOL:g}")
    print(f"  python {t_py:.2f}s   js {t_js:.2f}s")
    print("Largest Python-vs-JS differences:")
    for k in sorted(worst, key=lambda k: -worst[k]):
        print(f"  {k:<11} {worst[k]:.2e}")
    for b in bad[:10]:
        print("  " + b)
    print(f"FAIL: {len(bad)} mismatches" if bad else "PASS: 0 mismatches")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
