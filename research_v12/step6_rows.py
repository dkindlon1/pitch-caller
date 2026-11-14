"""v1.2 Step 6 (plan): the location rows L1-L6 and the hitter rows H1-H5 (H6 went with spray, dropped by Drew), PROPOSED (Claude, Nov 13; Drew grades). Each row
compares the same situation with and without the lean or tag and checks the direction the plan wrote down before running
(L: "directions are from the geometry"; H: Step B4's list). A row passes when its share moves the stated way by more than
0.5 points (or "holds": moves less than 2 points the wrong way). P1 (the inside sinker, graded by crossing) is in
readthrough/scenarios.py (`SI:inx`).
usage (repo root): python3 research_v12/step6_rows.py  -> results/v12/step6_rows.json"""
import json, os, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import engine as e

P = lambda n, k, sh, v, g=3, c=3, f=0.75, **kw: e.Pitch(n, k, g, c, f, shape=sh, velo=v, **kw)
SINK = [P("Sinker", "SI", "run", 88, f=0.8), P("Slider", "SL", "sweeper", 78, f=0.7), P("Changeup", "CH", "fade", 80, f=0.7)]
SLID = [P("Fastball", "FB", "", 89, f=0.8), P("Slider", "SL", "tight", 80, f=0.7), P("Changeup", "CH", "fade", 81, f=0.7)]
CURV = [P("Fastball", "FB", "", 87, f=0.8), P("Curve", "CB", "12-6", 73, f=0.7), P("Changeup", "CH", "fade", 79, f=0.7)]
RIDE = [P("Fastball", "FB", "rides", 90, f=0.8), P("Curve", "CB", "12-6", 75, f=0.7), P("Changeup", "CH", "fade", 81, f=0.7)]
CUTR = [P("Fastball", "FB", "", 90, f=0.8), P("Cutter", "FC", "hard", 86, f=0.75), P("Changeup", "CH", "fade", 81, f=0.7)]
THREE = [P("Fastball", "FB", "", 88, f=0.8), P("Slider", "SL", "tight", 80, f=0.7), P("Changeup", "CH", "fade", 80, f=0.7)]


def dist(ars, b, k, same=True, bases=(False,) * 3, outs=1, tags=None, level="college_d3"):
    s = e.Situation(b, k, outs, bases, level=level, same_side=same, hitter_tags=tags)
    s = replace(s, win=e.win_constants(s))
    return e.call_v08([replace(x) for x in ars], s, rng=None)[1]


def share(d, f):
    return sum(pr for pr, _, x, q in d if f(x, q))


def lean(ars, name, **kw):
    return [replace(x, **kw) if x.name == name else x for x in ars]


ROWS = [  # id, text, arsenal (base), arsenal (changed), situation kwargs, measure, direction (+1 up, -1 down, 0 holds)
    ("L1", "arm-leaning sinker (+3) to a same-side hitter: inside less", SINK, lean(SINK, "Sinker", lean_x=3.0), dict(b=1, k=1),
     lambda x, q: x.kind == "SI" and q in ("up-in", "down-in"), -1),
    ("L3", "glove-leaning slider (-3) to an opposite-side hitter: the back-foot slider holds or rises", SLID, lean(SLID, "Slider", lean_x=-3.0),
     dict(b=1, k=2, same=False), lambda x, q: x.kind == "SL" and q == "down-in", 0),
    ("L4", "down-leaning curve (-3), runner on 3rd, 0-2, two outs: fewer dirt chases", CURV, lean(CURV, "Curve", lean_z=-3.0), dict(b=0, k=2, bases=(False, False, True), outs=2),
     lambda x, q: x.kind == "CB" and q == "chase", -1),
    ("L5a", "up-leaning riding four-seam (+3), two strikes: the up target holds", RIDE, lean(RIDE, "Fastball", lean_z=3.0), dict(b=1, k=2),
     lambda x, q: x.kind == "FB" and q in ("up-in", "up-away", "chase"), 0),
    ("L5b", "... and its down target falls", RIDE, lean(RIDE, "Fastball", lean_z=3.0), dict(b=1, k=2),
     lambda x, q: x.kind == "FB" and q in ("down-in", "down-away", "down-middle"), -1),
    ("L6", "glove-leaning cutter (-3) in on an opposite-side hitter's hands: holds", CUTR, lean(CUTR, "Cutter", lean_x=-3.0), dict(b=1, k=1, same=False),
     lambda x, q: x.kind == "FC" and q in ("up-in", "down-in"), 0),
]
TAGROWS = [
    ("H1", "flat / level swing: fewer riding fastballs up", RIDE, dict(b=1, k=2), {"path": "flat"}, lambda x, q: x.kind == "FB" and q in ("up-in", "up-away"), -1),
    ("H2a", "uppercut / lift swing: the riding fastball up holds", RIDE, dict(b=1, k=2), {"path": "lift"}, lambda x, q: x.kind == "FB" and q in ("up-in", "up-away"), 0),
    ("H2b", "... and the curve down gets riskier (called less)", RIDE, dict(b=1, k=2), {"path": "lift"},
     lambda x, q: x.kind == "CB" and q in ("down-in", "down-away", "down-middle", "chase"), -1),
    ("H3", "aggressive early: fewer grooved first pitches", THREE, dict(b=0, k=0), {"approach": "aggressive"}, lambda x, q: q in ("middle", "down-middle"), -1),
    ("H4", "patient early: more first-pitch strikes over the plate", THREE, dict(b=0, k=0), {"approach": "patient"}, lambda x, q: q in ("middle", "down-middle"), 1),
    ("H5", "hits off-speed hard: fewer hittable off-speed pitches", THREE, dict(b=1, k=1), {"offspeed": "hits"}, lambda x, q: e.is_offspeed(x.kind) and q != "chase", -1),
]


def verdict(moved, want):
    if want == 0:
        return moved > -0.02
    return moved * want > 0.005


def main():
    out = {}
    for rid, text, a0, a1, kw, f, want in ROWS:
        b0, b1 = share(dist(a0, **kw), f), share(dist(a1, **kw), f)
        out[rid] = dict(text=text, base=round(b0, 4), changed=round(b1, 4), moved=round(b1 - b0, 4), want=want, passes=verdict(b1 - b0, want))
    for rid, text, a, kw, tags, f, want in TAGROWS:
        b0, b1 = share(dist(a, **kw), f), share(dist(a, tags=tags, **kw), f)
        nm = share(dist(a, tags={}, **kw), f)          # the no-move row: an unknown hitter
        out[rid] = dict(text=text, base=round(b0, 4), changed=round(b1, 4), moved=round(b1 - b0, 4), want=want, passes=verdict(b1 - b0, want),
                        unknown_moves=round(nm - b0, 6))
    # L2, regraded (Drew, Nov 13): the arm-leaning sinker AWAY gets costlier itself (its share can still rise when the
    # inside sinker gets worse still, row L1)
    def root_cost(ars):
        s = e.Situation(1, 1, 1, (False,) * 3, level="college_d3", same_side=True)
        s = replace(s, win=e.win_constants(s))
        ars = [replace(x) for x in ars]
        e.resolve_speeds(ars)
        p = next(x for x in ars if x.name == "Sinker")
        tab = e.solve_table(ars, s)
        return e.cost08(p, "down-away", s, ars, tab, tab.h0, ("mix", tab.sigma[(1, 1)]))[0]
    c0, c1 = root_cost(SINK), root_cost(lean(SINK, "Sinker", lean_x=3.0))
    out["L2"] = dict(text="arm-leaning sinker (+3) away to a same-side hitter: its own cost rises (regraded, Drew)", base=round(c0, 4),
                     changed=round(c1, 4), moved=round(c1 - c0, 4), want=1, passes=c1 > c0)
    out["L3"]["note"] = "untestable as written: the engine calls no slider down-in to an opposite-side hitter at 1-2 or 0-2, with or without the lean"
    for rid, r in out.items():
        fmt = (lambda v: f"{v:.4f}") if rid == "L2" else (lambda v: f"{v:6.1%}")
        print(f"  {rid:4} {'pass' if r['passes'] else 'FAIL'}  {fmt(r['base'])} -> {fmt(r['changed'])} ({r['moved']:+.4f})  {r['text']}")
    json.dump(out, open(os.path.join(HERE, "results", "v12", "step6_rows.json"), "w"), indent=1)
    print(f"{sum(r['passes'] for r in out.values())}/{len(out)} rows go the stated way (PROPOSED: Drew grades)")


if __name__ == "__main__":
    main()
