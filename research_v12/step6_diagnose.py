"""v1.2 Step 6 follow-up (Drew, Nov 13: "plan is right" on L2, L5, L6; "diagnose first"): why the engine goes the other way on
each row, measured, before any engine change. For the row's key call, with and without the lean: where the pitch lands
(heart / edge / off / way off), what happens (ball, called strike, whiff, foul, weak / solid / hard contact, hit batter),
and the call's root cost (runs; lower is better), split into the parts that moved.
usage (repo root): python3 research_v12/step6_diagnose.py  -> results/v12/step6_diagnose.txt"""
import os, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0] = [HERE, os.path.join(HERE, "research_v12")]
import engine as e
import step6_rows as R

OUT = []


def say(s=""):
    print(s, flush=True)
    OUT.append(s)


def detail(ars, name, q, kw):
    s = e.Situation(kw.get("b", 0), kw.get("k", 0), kw.get("outs", 1), kw.get("bases", (False,) * 3), level="college_d3", same_side=kw.get("same", True))
    s = replace(s, win=e.win_constants(s))
    ars = [replace(x) for x in ars]
    e.resolve_speeds(ars)
    p = next(x for x in ars if x.name == name)
    land = e.landing(p, q, s)
    op = e.outcome_probs(p, q, s, ars)
    tab = e.solve_table(ars, s)
    c = e.cost08(p, q, s, ars, tab, tab.h0, ("mix", tab.sigma[(s.balls, s.strikes)]))[0]
    return land, op, c


def show(label, ars0, ars1, name, q, kw):
    l0, o0, c0 = detail(ars0, name, q, kw)
    l1, o1, c1 = detail(ars1, name, q, kw)
    say(f"  {label}: {name} {q}")
    say("    lands     " + "  ".join(f"{z} {l0[z]:.3f}->{l1[z]:.3f}" for z in ("heart", "edge", "off", "noncomp")))
    keys = ("ball", "cstrike", "whiff", "foul", "weak", "solid", "hard", "hbp")
    say("    outcomes  " + "  ".join(f"{k} {o0[k]:.3f}->{o1[k]:.3f}" for k in keys))
    strikes0 = o0["cstrike"] + o0["whiff"] + o0["foul"]
    strikes1 = o1["cstrike"] + o1["whiff"] + o1["foul"]
    say(f"    strikes (called + whiff + foul) {strikes0:.3f}->{strikes1:.3f}; hard {o0['hard']:.3f}->{o1['hard']:.3f}; "
        f"chase swings off the zone n/a; root cost {c0:.4f}->{c1:.4f} runs ({'better' if c1 < c0 else 'worse'} by {abs(c1 - c0):.4f})")
    return dict(land=(l0, l1), op=(o0, o1), cost=(c0, c1))


def main():
    say("== L2: arm-leaning sinker (+3), same-side hitter, 1-1, the AWAY target (plan: called less)")
    d = show("L2", R.SINK, R.lean(R.SINK, "Sinker", lean_x=3.0), "Sinker", "down-away", dict(b=1, k=1))
    l0, l1 = d["land"]
    say(f"    reading: the away sinker itself gets WORSE with the lean (its cost rises; heart {l1['heart'] - l0['heart']:+.3f}, and hit batters "
        "double because arm side is inside to him). It's called more only because the inside sinker got much worse (row L1, "
        "-10.5 points) and the mix shifts toward away. So the engine already sees the leak; L2 fails on the relative move.")
    say("\n== L5: up-leaning riding four-seam (+3), 1-2, the UP target (plan: holds)")
    d = show("L5 up-away", R.RIDE, R.lean(R.RIDE, "Fastball", lean_z=3.0), "Fastball", "up-away", dict(b=1, k=2))
    show("L5 chase", R.RIDE, R.lean(R.RIDE, "Fastball", lean_z=3.0), "Fastball", "chase", dict(b=1, k=2))
    show("L5 down-away", R.RIDE, R.lean(R.RIDE, "Fastball", lean_z=3.0), "Fastball", "down-away", dict(b=1, k=2))
    say("    reading: the up lean moves the up target's misses from 'off' to 'way off' (noncomp). The engine's swing rate on way-off "
        "pitches is low even with two strikes, so they become balls, not chases; the down target's misses move up into the zone "
        "(more strikes). A riding fastball just above the zone with two strikes is a chase pitch in coaching terms.")
    say("\n== L6: glove-leaning cutter (-3), opposite-side hitter, 1-1, IN (plan: holds)")
    d = show("L6 up-in", R.CUTR, R.lean(R.CUTR, "Cutter", lean_x=-3.0), "Cutter", "up-in", dict(b=1, k=1, same=False))
    show("L6 down-in", R.CUTR, R.lean(R.CUTR, "Cutter", lean_x=-3.0), "Cutter", "down-in", dict(b=1, k=1, same=False))
    s = e.Situation(1, 1, 1, (False,) * 3, level="college_d3", same_side=False)
    for lx in (0.0, -1.5, -3.0):
        p = replace(next(x for x in R.CUTR if x.kind == "FC"), lean_x=lx)
        e.resolve_speeds([p])
        say(f"    lean {lx:+.1f}: HBP / wild factors {tuple(round(v, 3) for v in e.lean_hbp_wp(p, 'up-in', s))}")
    say("    reading: the lean moves mass off the plate toward his body (way off 0.161 -> 0.215) and hit batters go 3.7% -> 6.0%; "
        "strikes fall. The conditional HBP factor is small (1.28 at -3 in.); most of the cost is the landing shift plus a "
        "high starting hit-batter rate for a cutter in at D3 (3.7%). The plan's read: a cutter in on the hands is a weapon.")
    say("\n== Proposals (none built; Drew picks)")
    say("  L2 option A: regrade L2 as 'the away sinker's own cost rises' (true now: +0.002 runs) instead of 'called less'; the "
        "share moves the other way only because inside got worse.")
    say("  L2 option B: price a lean-induced heart pitch as a 'leaker' (the hanger-style +0.5 hard logit on the heart mass the "
        "lean adds, fastballs too) so away falls in absolute share. Moves only pitches with a lean.")
    say("  L5 option A: misses within ~6 in. above the zone with two strikes swing like 'off' (chase), not 'way off': split the "
        "noncomp band by distance for up targets. Moves only leaned pitches and the chase target. Expected: L5a holds, L5b falls.")
    say("  L5 option B: narrow the vertical miss (the model is one size both ways; Step 2 already flagged it as wide).")
    say("  L6 option A: lower the starting hit-batter rate for a cutter in on an opposite-side hitter at college (3.7% per pitch "
        "aimed there is high; check against Single-A by crossing), then rerun.")
    say("  L6 option B: option C from Step 2 (narrow the side-to-side miss to MLB's crossing rates), which shrinks how much "
        "mass a lean puts on the body. Also lowers every crossing share (P1 would need regrading).")
    open(os.path.join(HERE, "results", "v12", "step6_diagnose.txt"), "w").write("\n".join(OUT) + "\n")


if __name__ == "__main__":
    main()
