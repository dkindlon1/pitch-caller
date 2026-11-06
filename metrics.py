"""v0.8 step 1 metrics (docs/SPEC_v0.8.md 2.3, 6.7): exploitability X per count, location and pitch shares, inside and
middle shares, top-call share, and (from simulated game logs) the count-conditional fastball autocorrelation rho.
Runs with whatever engine flags are set: `python3 metrics.py v07 out.json [game.csv ...]` or `... v08 ...`."""
# Nov 6: the engine is now one flag-free v0.9 engine. This script ran under the v0.7c or v0.8 (by argument) settings when its data was made;
# those settings no longer exist, so a rerun computes v0.9-based values.

import json, sys, csv
from collections import defaultdict
import engine as e

LEVELS = ["hs", "college_d3", "college_d1"]


def ref_arsenals():
    P = e.Pitch
    return {
        "two": [P("Fastball", "FB", 3, 3, 0.70, shape="ride", velo=85), P("Slider", "SL", 3, 3, 0.65, shape="tight", velo=77)],
        "three": [P("Fastball", "FB", 3, 3, 0.70, shape="ride", velo=85), P("Slider", "SL", 3, 3, 0.65, shape="tight", velo=77),
                  P("Changeup", "CH", 3, 3, 0.60, shape="fade", velo=77)],
        "four": [P("Fastball", "FB", 3, 3, 0.70, shape="ride", velo=85), P("Slider", "SL", 3, 3, 0.65, shape="tight", velo=77),
                 P("Curveball", "CB", 3, 3, 0.62, shape="loopy", velo=71), P("Changeup", "CH", 3, 3, 0.60, shape="fade", velo=77)],
    }


_TABS = {}


def count_metrics(ars, s):
    """One count: the engine's call mix, then X against the hitter's response to it."""
    return count_metrics_v08(ars, s)


def count_metrics_v08(ars, s):
    """v0.8: the planning table for this arsenal and base-out state (solved at 0-0), then the root's sit game."""
    from dataclasses import replace
    key = (id(ars), s.level, s.outs, s.bases)
    if key not in _TABS:
        _TABS[key] = e.solve_table(ars, replace(s, balls=0, strikes=0))
    tab = _TABS[key]
    pi, sg, full, res, M = e.root_call(ars, s, tab)
    ks = e.sit_options(ars)
    loc = defaultdict(float); pit = defaultdict(float)
    for (n, q), v in pi.items():
        loc[q] += v; pit[n] += v
    return dict(X=e.exploitability(M, ks, pi, sg), top=max(pi.values()), n_calls=sum(1 for v in pi.values() if v > 0),
                middle=loc["middle"], inside=loc["up-in"] + loc["down-in"], loc=dict(loc), pitch=dict(pit), residual=res)


def rho_from_logs(paths):
    """6.7 count-conditional correlation of 1[fastball] on consecutive pitches in an at-bat, frequency-weighted."""
    pairs = defaultdict(list)
    for path in paths:
        rows = list(csv.DictReader(open(path)))
        for a, b in zip(rows, rows[1:]):
            if a["batter"] == b["batter"] and a["inning"] == b["inning"] and int(b["pc"]) == int(a["pc"]) + 1:
                pairs[b["count"]].append((a["kind"] == "FB", b["kind"] == "FB"))
    tot, acc = 0, 0.0
    for c, xs in pairs.items():
        n = len(xs)
        if n < 10:
            continue
        mx = sum(x for x, _ in xs) / n; my = sum(y for _, y in xs) / n
        vx = sum((x - mx) ** 2 for x, _ in xs) / n; vy = sum((y - my) ** 2 for _, y in xs) / n
        if vx == 0 or vy == 0:
            continue
        r = sum((x - mx) * (y - my) for x, y in xs) / n / (vx * vy) ** 0.5
        acc += n * r; tot += n
    return acc / tot if tot else None


def main():
    mode, out = sys.argv[1], sys.argv[2]
    res = {"engine": "v0.9", "counts": {}}
    for lvl in LEVELS:
        for an, ars in ref_arsenals().items():
            for (b, k) in sorted(e.COUNTS):
                s = e.Situation(b, k, 0, (False, False, False), level=lvl)
                res["counts"][f"{lvl}|{an}|{b}-{k}"] = count_metrics(ars, s)
    if len(sys.argv) > 3:
        res["rho"] = rho_from_logs(sys.argv[3:])
    json.dump(res, open(out, "w"), indent=1)
    rows = res["counts"]
    print(f"{mode}: X mean {sum(r['X'] for r in rows.values())/len(rows):.4f} max {max(r['X'] for r in rows.values()):.4f}; "
          f"middle share mean {sum(r['middle'] for r in rows.values())/len(rows):.2f}; inside mean "
          f"{sum(r['inside'] for r in rows.values())/len(rows):.3f}; rho {res.get('rho')}")
    for lvl in LEVELS:
        print(lvl, "three-pitch:", " ".join(f"{c.split('|')[2]} X{r['X']:.3f} mid{r['middle']:.2f} in{r['inside']:.2f}"
                                           for c, r in rows.items() if c.startswith(lvl + "|three")))


if __name__ == "__main__":
    main()
