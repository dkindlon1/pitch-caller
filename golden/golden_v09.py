"""v0.9 golden (Nov 6): the reference for the single, flag-free v0.9 engine.
  python3 golden/golden_v09.py make   -> writes golden/golden_v09.json from the current engine (made once on Nov 6, from the
                                         engine still carrying flags, run as v0.9, just before the flags were removed)
  python3 golden/golden_v09.py check  -> recomputes every case and requires agreement to TOL (1e-9)
The 500 cases and outputs of golden/cases.py, plus v0.9's own inputs and outputs: each case gets an earlier-trip matchup
record (item 6) and the call's intent label (item 4). Landing records (item 9), hitter power grades (item 8) and inside
targets (item 3) are already in those inputs."""
import json, os, random, sys
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import engine as e
import cases as G8

PATH = os.path.join(HERE, "golden_v09.json")
KINDS = ("FB", "SL", "CB", "CH")
# The engine is pure Python math.exp/log, so exp/log come from the platform's C library. golden_v09.json was made on
# Linux (CI is ubuntu-24.04/glibc); another libm differs by about 1 ULP per call, which the table solve accumulates to
# ~1e-13. That is float noise, not a behaviour change, so the check allows it -- the same reason golden_v09.js has a
# tolerance (it absorbs up to 1.7e-13 of the same drift). A real change to the engine moves these numbers by far more.
# For a platform-independent check of the two live engines against each other, use golden/fast.py.
TOL = 1e-9


def inputs():
    cs = G8.inputs()
    rng = random.Random(G8.SEED + 9)
    for c in cs:
        kinds = sorted({p["kind"] for p in c["arsenal"]})
        mm = {}
        if rng.random() < 0.6:
            for k in kinds:
                if rng.random() < 0.6:
                    mm[f"succ|{k}"] = rng.randint(1, 4)
                if rng.random() < 0.4:
                    mm[f"hard|{k}|{rng.choice(e.QUADS)}"] = rng.randint(1, 2)
        c["s"]["matchup"] = mm or None
    return cs


def from_dicts(c):
    d = dict(c)
    s = dict(c["s"])
    mm = s.pop("matchup", None)
    d["s"] = s
    ars, sit = G8.from_dicts(d)
    return ars, (replace(sit, matchup=mm) if mm else sit)


def compute(c):
    ars, s = from_dicts(c)
    s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
    G8_from = G8.from_dicts                  # the shared outputs, computed on this case's situation (with its matchup)
    G8.from_dicts = lambda _c: (ars, s)
    try:
        r = G8.compute(c)
    finally:
        G8.from_dicts = G8_from
    if c["full"]:
        tab = e.solve_table(ars, replace(s_w, balls=0, strikes=0, last=None))
        pick, dist, tab, info = e.call_v08(ars, s_w, rng=G8.Half(), tab=tab)
        lab = e.intent_label(ars, s_w, tab, pick, info)
        r["intent"] = list(lab) if isinstance(lab, (list, tuple)) else lab
    return r


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    if mode == "make":
        if os.path.exists(PATH) and "--force" not in sys.argv:
            sys.exit(f"{PATH} exists; it is the frozen v0.9 reference.")
        cs = inputs()
        for i, c in enumerate(cs):
            c["out"] = compute(c)
            if (i + 1) % 100 == 0:
                print(i + 1, flush=True)
        json.dump(cs, open(PATH, "w"))
        print(f"wrote {PATH}: {len(cs)} cases")
        return
    cs = json.load(open(PATH))
    worst, bad = 0.0, []
    for i, c in enumerate(cs):
        want = dict(G8.flat(c["out"]))
        got = dict(G8.flat(compute(c)))
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
    print(f"PASS: v0.9 reproduced within {TOL:g}" if not bad else f"FAIL: {len(bad)} differences")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
