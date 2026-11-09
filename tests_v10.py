"""v1.0 unit tests, one group per Phase 3 sub-step. Each prints what it checks and PASS/FAIL.
usage (repo root): python3 tests_v10.py
Exit is non-zero if any check fails.
"""
import random
import sys
from dataclasses import replace

from engine import (Pitch, Situation, call_v08, solve_table, allowed_calls, repeat_blocks, rule_notes,
                    lean_b_h, why_line, candidates, nothing_trusted, landing_estimate, RULE_WHY)

results = []


def check(name, ok, detail):
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}\n       {detail}")


E = (False, False, False)


def arsenal():
    return [Pitch("Fastball", "FB", grade=3, command=3, conf=0.80, shape="ride", velo=88),
            Pitch("Slider", "SL", grade=3, command=3, conf=0.75, shape="tight", velo=79),
            Pitch("Changeup", "CH", grade=3, command=3, conf=0.70, shape="fade", velo=80)]


A = arsenal()


def dist(s):
    """The call distribution, with the PA table solved from 0-0 the way the app does it."""
    tab = solve_table(A, replace(s, balls=0, strikes=0, last=None, history=()))
    s_ = replace(s, b_h=lean_b_h(A, s))
    _, d, _, _ = call_v08(A, s_, rng=random.Random(0), tab=tab)
    return d


def call_share(s, name, quad):
    return sum(pr for pr, _, p, q in dist(s) if p.name == name and q == quad)


def pitch_share(s, name):
    return sum(pr for pr, _, p, q in dist(s) if p.name == name)


def hist(*rows):
    """(pitch, target, result, read) rows, oldest first, with `last` kept consistent as the plan requires."""
    return dict(history=tuple(rows), last=tuple(rows[-1][:3]))


BASE = Situation(1, 1, 0, E, level="college_d3")

# ---------------------------------------------------------------------------------------------------------------
# 3.1 at-bat history and repeats
# ---------------------------------------------------------------------------------------------------------------
print("== 3.1 at-bat history and repeats ==")

# RP1: a third straight exact repeat gets 0%
twice = replace(BASE, **hist(("Fastball", "middle", "foul", None), ("Fastball", "middle", "ball", None)))
fresh_fb = call_share(BASE, "Fastball", "middle")
third = call_share(twice, "Fastball", "middle")
check("RP1 no third time: the same pitch and spot twice already gets 0% on the third",
      third == 0.0 and fresh_fb > 0.0,
      f"fastball middle {fresh_fb:.1%} with no history, {third:.1%} after two in a row; codes {repeat_blocks(twice)[1]}")

# RP1 stands down rather than leaving nothing. Getting there needs the blocked call to be the ONLY one left, so a
# one-pitch arsenal at 3-0 (no chase) with its other four targets shaken off.
one_pitch = [Pitch("Fastball", "FB", grade=3, command=3, conf=0.80, shape="ride", velo=88)]
s_one = replace(Situation(3, 0, 0, E, level="college_d3"),
                **hist(("Fastball", "middle", "ball", None), ("Fastball", "middle", "ball", None)))
shaken = {("Fastball", q) for q in ("up-in", "up-away", "down-in", "down-away")}
calls_one = allowed_calls(one_pitch, s_one, exclude=shaken)
check("RP1 stands down when it would leave nothing",
      calls_one == [("Fastball", "middle")] and repeat_blocks(s_one)[1] == ["RP1"],
      f"one pitch at 3-0 with its other four targets shaken off and two fastball-middles already thrown: "
      f"allowed_calls returns {calls_one} rather than nothing")

# RP2: after a foul straight back, the exact repeat gets 0% next pitch, the same pitch elsewhere does not
back = replace(BASE, **hist(("Fastball", "middle", "foul", "back")))
back_mid = call_share(back, "Fastball", "middle")
back_else = call_share(back, "Fastball", "down-away")
check("RP2 fouled straight back: that exact pitch and spot gets 0%, the same pitch elsewhere is still allowed",
      back_mid == 0.0 and back_else > 0.0,
      f"fastball middle {back_mid:.1%}, fastball down-away {back_else:.1%}; codes {repeat_blocks(back)[1]}")

check("RP2 says why",
      rule_notes(A, back) == ["He fouled it straight back. Don't go back there yet."],
      f"{rule_notes(A, back)}")

# RP2 is for the next pitch only: one more pitch after it and the call is free again
back_then = replace(BASE, **hist(("Fastball", "middle", "foul", "back"), ("Slider", "down-away", "ball", None)))
check("RP2 lasts one pitch only",
      call_share(back_then, "Fastball", "middle") > 0.0,
      f"fastball middle {call_share(back_then, 'Fastball', 'middle'):.1%} one pitch later; "
      f"codes {repeat_blocks(back_then)[1] or 'none'}")

# RP3: after a plain foul the exact repeat is not called MORE than with no history
plain = replace(BASE, **hist(("Fastball", "middle", "foul", None)))
plain_mid = call_share(plain, "Fastball", "middle")
check("RP3 after a plain foul the exact repeat is not called more than with no history",
      plain_mid <= fresh_fb + 1e-9,
      f"fastball middle {plain_mid:.1%} after a plain foul vs {fresh_fb:.1%} with no history")

# after a whiff the same pitch TYPE keeps at least 90% of its share (R6's repeat-after-whiff must survive)
whiffed = replace(BASE, **hist(("Fastball", "middle", "whiff", None)))
fb_fresh = pitch_share(BASE, "Fastball")
fb_whiff = pitch_share(whiffed, "Fastball")
check("after a whiff the same pitch type keeps at least 90% of its share",
      fb_whiff >= 0.90 * fb_fresh,
      f"fastball {fb_whiff:.1%} after a whiff vs {fb_fresh:.1%} with no history "
      f"({fb_whiff / fb_fresh:.0%} of it)")

# history must not leak into the PA table: the table is the plan from 0-0
tab_plain = solve_table(A, replace(BASE, balls=0, strikes=0, last=None, history=()))
tab_hist = solve_table(A, replace(twice, balls=0, strikes=0, last=None))
check("history does not change the plate-appearance table",
      tab_plain.V == tab_hist.V and tab_plain.sigma == tab_hist.sigma,
      "solve_table clears history, as it already cleared last and usage, so the 0-0 plan is unchanged")

# ---------------------------------------------------------------------------------------------------------------
# 3.2 the fallback when nothing is trusted
# ---------------------------------------------------------------------------------------------------------------
print("\n== 3.2 fallback when nothing is trusted ==")

# the plan's own test: curveball 2 of 12, fastball 7 of 12, everything below the cutoff, and the CURVEBALL the more
# confident pitch. The fastball must still get 100%.
TWO = [Pitch("Fastball", "FB", grade=3, command=3, conf=0.30, shape="ride", velo=82),
       Pitch("Curveball", "CB", grade=3, command=3, conf=0.40, shape="loopy", velo=70)]


def two_dist(s):
    tab = solve_table(TWO, replace(s, balls=0, strikes=0, last=None, history=()))
    _, d, _, _ = call_v08(TWO, s, rng=random.Random(0), tab=tab)
    return d


s_fb = Situation(1, 1, 0, E, level="hs", landing_today={"Fastball": (7, 12), "Curveball": (2, 12)})
fb_only = sum(pr for pr, _, p, q in two_dist(s_fb) if p.name == "Fastball")
check("3.2 nothing trusted: the pitch that is LANDING gets 100%, not the more confident one",
      nothing_trusted(TWO, s_fb) and fb_only == 1.0 and [p.name for p in candidates(TWO, s_fb)] == ["Fastball"],
      f"fastball (7 of 12, conf 0.30) {fb_only:.0%} vs curveball (2 of 12, conf 0.40, the higher feel); "
      f"candidates {[p.name for p in candidates(TWO, s_fb)]}")

check("3.2 the why line says nothing is working",
      RULE_WHY["FALLBACK"] in rule_notes(TWO, s_fb),
      f"{rule_notes(TWO, s_fb)}")

# if NOTHING is landing, fall back to the best shrunk strike estimate
s_none = Situation(1, 1, 0, E, level="hs", landing_today={"Fastball": (1, 12), "Curveball": (2, 12)})
best = max(TWO, key=lambda x: landing_estimate(x, s_none)[0])
check("3.2 when nothing is landing either, go with the best strike estimate",
      [p.name for p in candidates(TWO, s_none)] == [best.name],
      f"fastball estimate {landing_estimate(TWO[0], s_none)[0]:.3f}, curveball "
      f"{landing_estimate(TWO[1], s_none)[0]:.3f} -> {best.name}")

# a trusted arsenal must be untouched by any of this
TRUSTED = arsenal()
s_ok = Situation(1, 1, 0, E, level="college_d3", landing_today={"Changeup": (1, 12)})
check("3.2 does not touch a pitcher who trusts his stuff",
      not nothing_trusted(TRUSTED, s_ok) and len(candidates(TRUSTED, s_ok)) == 3
      and RULE_WHY["FALLBACK"] not in rule_notes(TRUSTED, s_ok),
      f"all {len(candidates(TRUSTED, s_ok))} pitches are candidates and no fallback note, "
      f"even with the changeup 1 of 12")

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
