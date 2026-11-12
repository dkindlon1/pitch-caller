"""v1.0 golden (Nov 9): the reference for the v1.0 engine.
  python3 golden/golden_v10.py make   -> writes golden/golden_v10.json from the current engine
  python3 golden/golden_v10.py check  -> recomputes every case and requires agreement to TOL (1e-9)

The v0.9 golden's 500 cases and outputs (imported from golden_v09.py, not copied), plus the v1.0 Step 7 coverage
(re-frozen Nov 11 after Step 7's knee-high target and ground-ball rule):
  - quad-keyed hitter damage ("KIND|target", v1.0 #21) on about a third of the cases, next to the FB/OS keys;
  - the Step 7 coaching reads' inputs: success at a spot in the matchup memory ('succ|KIND|target') and a last pitch
    fouled straight back ([pitch, spot, "foul", "back"]);
  - on full cases, the walk suggestion (never auto-called) and, on about a third of them, a shake-off list (a pitch, or
    a pitch and spot) with the call, why line and intent label recomputed under it.
Matchup memory and the intent label were already in the v0.9 inputs and outputs. golden/golden_v09.json stays frozen as
the historical v0.9 reference; this file is what scripts/test-app.sh gates on from v1.0 on.

Why a tolerance rather than bit-exact equality: the engine is pure Python math.exp/log, so exp and log come from the
platform C library, and glibc and MSVC's libm differ by about 1 ULP per call, which the at-bat table solve accumulates
to ~1e-13. Demanding exact equality makes the check pass only on the machine that generated the file (see
docs/STEP0_v1.0_REPORT.md section 1.1). A real engine change moves these numbers by 1e-2 or more.
For a platform-independent check of the live Python and JS engines against each other, use golden/fast.py."""
import json, os, random, sys
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import cases as G8                                  # noqa: E402  (flat())
import golden_v09 as G9                             # noqa: E402  (inputs(), compute())
import engine as e                                  # noqa: E402

PATH = os.path.join(HERE, "golden_v10.json")
TOL = 1e-9


def inputs():
    """golden_v09's 500 cases plus the Step 7 inputs (own RNG, fixed seed; the v0.9 inputs are drawn first, unchanged)."""
    cs = G9.inputs()
    rng = random.Random(G8.SEED + 10)
    for c in cs:
        if rng.random() < 0.35:
            for _ in range(rng.randint(1, 3)):
                p = rng.choice(c["arsenal"])
                c["s"]["hitter_damage"][f"{p['kind']}|{rng.choice(e.QUADS)}"] = [round(rng.uniform(-1, 1), 2), rng.randint(1, 15)]
        mm = c["s"].get("matchup") or {}         # Step 7 coaching reads: success at a spot, a foul straight back
        if rng.random() < 0.3:
            p = rng.choice(c["arsenal"])
            mm[f"succ|{p['kind']}|{rng.choice(e.QUADS)}"] = rng.randint(1, 2)
            c["s"]["matchup"] = mm
        if c["s"].get("last") and len(c["s"]["last"]) == 2 and rng.random() < 0.3:
            c["s"]["last"] = list(c["s"]["last"]) + ["foul", "back"]
        c["exclude"] = None
        names = [p["name"] for p in c["arsenal"]]
        if c["full"] and len(names) > 1 and rng.random() < 0.35:
            c["exclude"] = [rng.choice(names)] if rng.random() < 0.5 else [[rng.choice(names), rng.choice(e.QUADS)]]
    return cs


def exclude_of(c):
    return [x if isinstance(x, str) else tuple(x) for x in c["exclude"]] if c.get("exclude") else None


def compute(c):
    r = G9.compute(c)
    if c["full"]:
        ars, s = G9.from_dicts(c)
        s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
        tab = e.solve_table(ars, replace(s_w, balls=0, strikes=0, last=None))
        r["walk"] = list(e.walk_suggestion(ars, s_w, tab))
        ex = exclude_of(c)
        if ex:
            pick, dist, tab, info = e.call_v08(ars, s_w, rng=G8.Half(), tab=tab, exclude=ex)
            line, deltas, _ = e.why_line(ars, s_w, tab, pick, info, exclude=ex)
            lab = e.intent_label(ars, s_w, tab, pick, info, exclude=ex)
            r["shaken"] = dict(pick=[pick[0].name, pick[1]], prob=pick[2], cost=pick[3],
                               dist={f"{d[2].name}|{d[3]}": [d[0], d[1]] for d in dist}, why=line, deltas=deltas,
                               intent=list(lab) if isinstance(lab, (list, tuple)) else lab)
    return r


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    if mode == "make":
        if os.path.exists(PATH) and "--force" not in sys.argv:
            sys.exit(f"{PATH} exists; it is the frozen v1.0 reference. Pass --force to overwrite it deliberately.")
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
    print(f"PASS: v1.0 reproduced within {TOL:g}" if not bad else f"FAIL: {len(bad)} differences")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
