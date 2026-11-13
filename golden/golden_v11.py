"""v1.1 goldens (Nov 12): the references for the v1.1 engine as it is built.
  python3 golden/golden_v11.py make [--tag v11a] [--force]   -> writes golden/golden_<tag>.json from the current engine
  python3 golden/golden_v11.py check [--tag v11a]            -> recomputes every case and requires agreement to TOL (1e-9)

golden_v11a: frozen after Step 1b (the profile table). golden_v11: frozen after Step 2, again after Step 3 (setup rules:
about 40% of the cases past 0-0 carry an at-bat so far, pa_log) and at release (plan section 4).
golden_v12a: v1.2 Part A, frozen after Step 5 (HS ride-up x RHO_L, the hot fade by ratio, S4 narrowed, S5 resized, S2 / S4
dropped); same inputs (no leans, no out-of-grid cells, no hitter tags).
The inputs are golden_v10's 500 cases (v1.0 kinds and tags, migrated on the way in) with about 45% of them rewritten into
v1.1 terms: the fastball becomes a four-seam, sinker or cutter, every pitch gets a random v1.1 tag, some get measured
movement, and some arsenals get a coach's main-fastball mark. Outputs are the same as golden_v10's (golden_v10.compute)."""
import json, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import cases as G8                                  # noqa: E402  (flat(), SEED)
import golden_v10 as G10                            # noqa: E402  (inputs(), compute())
import engine as e                                  # noqa: E402

TAG = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else "v11a"
PATH = os.path.join(HERE, f"golden_{TAG}.json")
TOL = 1e-9


def inputs():
    cs = G10.inputs()
    rng = random.Random(G8.SEED + 111)          # own stream: the v1.0 inputs are drawn first, unchanged
    for c in cs:
        if rng.random() < 0.45:
            for d in c["arsenal"]:
                if d["kind"] == "FB":
                    d["kind"] = rng.choice(["FB", "SI", "FC"])
                d["shape"] = rng.choice(e.SHAPE_TAGS[d["kind"]])
                if rng.random() < 0.25:
                    d["ivb"], d["hb"] = round(rng.uniform(-14, 20), 1), round(rng.uniform(-16, 18), 1)
            if rng.random() < 0.3:
                fbs = [d for d in c["arsenal"] if d["kind"] in e.FASTBALL_KINDS]
                rng.choice(fbs or c["arsenal"])["main"] = True
            c["v11"] = True
    # v1.1 Step 3: an at-bat so far (pa_log) on about 40% of the cases past 0-0, consistent with the count, drawn so the
    # setup rules' patterns come up (fastballs up and in, breaking balls down, reads and landing cells, way-off misses)
    rng3 = random.Random(G8.SEED + 333)          # own stream again: the earlier inputs are unchanged
    for c in cs:
        b, k = c["s"]["balls"], c["s"]["strikes"]
        if b + k == 0 or rng3.random() >= 0.4:
            continue
        evs = ["ball"] * b + ["k"] * k
        rng3.shuffle(evs)
        if k == 2 and rng3.random() < 0.3:
            evs.append("foul2")
        log = []
        for ev in evs:
            d = rng3.choice(c["arsenal"])
            q = rng3.choice(["up-in", "up-away", "down-in", "down-away", "middle", "down-middle", "chase"])
            res = "ball" if ev == "ball" else ("foul" if ev == "foul2" else rng3.choice(["cstrike", "whiff", "foul"]))
            u = rng3.random()
            landed = None if u < 0.5 else ("way" if u < 0.6 else [rng3.randrange(5), rng3.randrange(5), rng3.random() < 0.5])
            read = None
            if res == "whiff" and rng3.random() < 0.5:
                read = rng3.choice(["front", "late", "fooled"])
            if res == "foul" and rng3.random() < 0.6:
                read = rng3.choice(["pull", "opposite", "back"])
            log.append([d["name"], q, res, landed, None, read])
        c["s"]["pa_log"] = log
        if log:
            c["s"]["last"] = [log[-1][0], log[-1][1], log[-1][2]]
    return cs


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    if mode == "make":
        if os.path.exists(PATH) and "--force" not in sys.argv:
            sys.exit(f"{PATH} exists; it is a frozen reference. Pass --force to overwrite it deliberately.")
        cs = inputs()
        for i, c in enumerate(cs):
            c["out"] = G10.compute(c)
            if (i + 1) % 100 == 0:
                print(i + 1, flush=True)
        json.dump(cs, open(PATH, "w"))
        print(f"wrote {PATH}: {len(cs)} cases ({sum(1 for c in cs if c.get('v11'))} in v1.1 terms)")
        return
    cs = json.load(open(PATH))
    worst, bad = 0.0, []
    for i, c in enumerate(cs):
        want = dict(G8.flat(c["out"]))
        got = dict(G8.flat(G10.compute(c)))
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
    print(f"PASS: {TAG} reproduced within {TOL:g}" if not bad else f"FAIL: {len(bad)} differences")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
