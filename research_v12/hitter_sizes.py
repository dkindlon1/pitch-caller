"""v1.2 Step B2: size the swing-path coach rule (the data didn't ship the channel: research_v12/hitter_fits.py), the way
v1.0's reads were sized: the smallest grid size that moves its proposed rows 5+ points (rows H1 / H2, Claude's proposal,
Drew grades at Step 6). Also prints what the fitted channels (approach, spray) and the off-speed prior do on rows H3-H6.
usage (repo root): python3 research_v12/hitter_sizes.py  -> results/v12/hitter_sizes.json"""
import json, os, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import engine as e

GRID = [0.002, 0.003, 0.004, 0.005, 0.006, 0.008, 0.010, 0.012, 0.015, 0.02]
P = lambda n, k, sh, v, g=3, c=3, f=0.75: e.Pitch(n, k, g, c, f, shape=sh, velo=v)
RIDE = [P("Fastball", "FB", "rides", 90, f=0.8), P("Curve", "CB", "12-6", 75, f=0.7), P("Changeup", "CH", "fade", 81, f=0.7)]
THREE = [P("Fastball", "FB", "", 88, f=0.8), P("Slider", "SL", "tight", 80, f=0.7), P("Changeup", "CH", "fade", 80, f=0.7)]


def dist(ars, b, k, tags, level="college_d3", same=True):
    s = e.Situation(b, k, 1, (False,) * 3, level=level, same_side=same, hitter_tags=tags)
    s = replace(s, win=e.win_constants(s))
    return [(pr, x, q) for pr, _, x, q in e.call_v08([replace(x) for x in ars], s, rng=None)[1]]


def share(d, f):
    return sum(pr for pr, x, q in d if f(x, q))


FB_UP = lambda x, q: e.is_fastball(x.kind) and q in ("up-in", "up-away")
OS_DOWN = lambda x, q: e.is_offspeed(x.kind) and q in ("down-in", "down-away", "down-middle", "chase")
ROWS = {   # id: (what, arsenal, count, tags, measure, direction wanted)
    "H1": ("flat / level swing: fewer riding fastballs up (1-2, D3)", RIDE, (1, 2), {"path": "flat"}, FB_UP, -1),
    "H2": ("uppercut / lift swing: the curve down gets riskier (1-2, D3)", RIDE, (1, 2), {"path": "lift"}, OS_DOWN, -1),
}


def main():
    out = {"grid": GRID, "path": None, "rows": {}}
    saved = e.HIT_PATH_RULE
    base = {r: share(dist(v[1], *v[2], None), v[4]) for r, v in ROWS.items()}
    pick = None
    for size in GRID:
        e.HIT_PATH_RULE = size
        moved = {r: (share(dist(v[1], *v[2], v[3]), v[4]) - base[r]) * v[5] for r, v in ROWS.items()}
        print(f"  path {size:.3f}: " + ", ".join(f"{r} {ROWS[r][0].split(':')[0]} {base[r]:.1%} -> moved {m:+.1%}" for r, m in moved.items()), flush=True)
        if all(m >= 0.05 - 1e-9 for m in moved.values()):
            pick = size
            out["rows"].update({r: dict(base=round(base[r], 4), moved=round(m, 4)) for r, m in moved.items()})
            break
    e.HIT_PATH_RULE = saved
    out["path"] = pick
    print(f"path rule size: {pick}")
    # H2's other half: the riding fastball up holds against a lift swing
    hold = share(dist(RIDE, 1, 2, {"path": "lift"}), FB_UP) - share(dist(RIDE, 1, 2, None), FB_UP)
    out["H2_fastball_up_change"] = round(hold, 4)
    print(f"H2: riding fastball up against a lift swing moves {hold:+.1%} (should hold or rise)")
    # the fitted channels and the prior on their rows (sizes fixed by the fits; reported, not sized)
    for rid, what, ars, cnt, tags, f in (
            ("H3", "aggressive early: fewer grooved first pitches (0-0, middle / down-middle)", THREE, (0, 0), {"approach": "aggressive"},
             lambda x, q: q in ("middle", "down-middle")),
            ("H4", "patient early: more first-pitch strikes over the plate (0-0, middle / down-middle)", THREE, (0, 0), {"approach": "patient"},
             lambda x, q: q in ("middle", "down-middle")),
            ("H5", "hits off-speed hard: fewer hittable off-speed pitches (1-1, OS in the zone)", THREE, (1, 1), {"offspeed": "hits"},
             lambda x, q: e.is_offspeed(x.kind) and q != "chase"),
            ("H6", "pull-heavy: away (1-1, any pitch away)", THREE, (1, 1), {"spray": "pull"}, lambda x, q: q in ("up-away", "down-away"))):
        b0 = share(dist(ars, *cnt, None), f)
        b1 = share(dist(ars, *cnt, tags), f)
        out["rows"][rid] = dict(what=what, untagged=round(b0, 4), tagged=round(b1, 4), moved=round(b1 - b0, 4))
        print(f"  {rid} {what}: {b0:.1%} -> {b1:.1%} ({b1 - b0:+.1%})")
    json.dump(out, open(os.path.join(HERE, "results", "v12", "hitter_sizes.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
