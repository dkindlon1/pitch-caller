"""v1.0 unit tests, one group per Phase 3 sub-step. Each prints what it checks and PASS/FAIL.
usage (repo root): python3 tests_v10.py
Exit is non-zero if any check fails.
"""
import random
import sys
from dataclasses import replace

from engine import (Pitch, Situation, call_v08, solve_table, allowed_calls, repeat_blocks, rule_notes,
                    lean_b_h, why_line, candidates, nothing_trusted, landing_estimate, RULE_WHY,
                    frozen_inputs, needs_resolve, coach_blocks, root_call, sit_options, cost08,
                    run_scale, GUARD_DELTA, GUARD_TYPE)

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

# ---------------------------------------------------------------------------------------------------------------
# 3.3 the landing filter with a runner on 3rd
# ---------------------------------------------------------------------------------------------------------------
print("\n== 3.3 landing filter with a runner on 3rd ==")


def slider_share(bases):
    s = Situation(0, 2, 0, bases, level="college_d3", landing_today={"Slider": (0, 4)})
    return sum(pr for pr, _, p, q in dist(s) if p.name == "Slider"), rule_notes(A, s)


on3, note_on3 = slider_share((False, False, True))
empty, note_empty = slider_share(E)
check("3.3 a pitch that isn't landing gets 0% with a runner on 3rd, two strikes or not",
      on3 == 0.0,
      f"0-2, runner on 3rd, slider 0 for 4: slider {on3:.1%}")
check("3.3 with 3rd empty the two-strike chase exemption still applies",
      empty > 0.0,
      f"same count and slider, bases empty: slider {empty:.1%}")
check("3.3 says why",
      RULE_WHY["LAND3"] in note_on3 and RULE_WHY["LAND3"] not in note_empty,
      f"on 3rd: {note_on3}; empty: {note_empty}")

# ---------------------------------------------------------------------------------------------------------------
# 3.4 rebuild the plan when runners or outs change
# ---------------------------------------------------------------------------------------------------------------
print("\n== 3.4 re-solve when runners or outs change ==")

s_on1 = Situation(1, 1, 0, (True, False, False), level="college_d3")
fz = frozen_inputs(A, s_on1)
check("3.4 nothing changed: no re-solve",
      not needs_resolve(fz, A, s_on1) and not needs_resolve(fz, A, replace(s_on1, pitch_count=99)),
      "the same base-out state, and an unrelated field moving, both keep the frozen plan")
check("3.4 a stolen base mid at-bat triggers a re-solve",
      needs_resolve(fz, A, replace(s_on1, bases=(False, True, False))),
      "runner on 1st steals 2nd -> the plate-appearance table is rebuilt")
check("3.4 an out mid at-bat triggers a re-solve",
      needs_resolve(fz, A, replace(s_on1, outs=1))
      and needs_resolve(fz, A, replace(s_on1, bases=(False, False, False), outs=1)),
      "a foul-out elsewhere, and a runner thrown out, both rebuild the table")
check("3.4 a table frozen before v1.0 re-solves once rather than crashing",
      needs_resolve({k: v for k, v in fz.items() if k not in ("bases", "outs")}, A, s_on1),
      "the new keys are read with .get, so an older frozen dict is treated as stale")

# the re-solve has to actually change the plan, or the trigger is pointless
tab_on1 = solve_table(A, replace(s_on1, balls=0, strikes=0, last=None, history=()))
tab_on2 = solve_table(A, replace(s_on1, balls=0, strikes=0, last=None, history=(), bases=(False, True, False)))
check("3.4 the rebuilt plan really differs",
      tab_on1.V != tab_on2.V,
      "a runner on 2nd instead of 1st gives a different table, which is why the trigger matters")

# ---------------------------------------------------------------------------------------------------------------
# 3.5 the two coach rules
# ---------------------------------------------------------------------------------------------------------------
print("\n== 3.5 coach rules CR1 and CR2 ==")

# CR1, mashed it twice: the I4 situation
fb_mid_fresh = call_share(BASE, "Fastball", "middle")
cr1 = replace(BASE, matchup={"hard|FB|middle": 2})
check("3.5 CR1: a pitch type he has hit hard twice at that spot gets 0% there",
      call_share(cr1, "Fastball", "middle") == 0.0 and fb_mid_fresh > 0.0,
      f"fastball middle {fb_mid_fresh:.1%} -> {call_share(cr1, 'Fastball', 'middle'):.1%} "
      f"after two hard-hit balls; codes {coach_blocks(A, cr1)[1]}")
check("3.5 CR1 only bans that pitch type at that spot",
      call_share(cr1, "Fastball", "down-away") > 0.0 and call_share(cr1, "Slider", "middle") > 0.0,
      f"fastball down-away {call_share(cr1, 'Fastball', 'down-away'):.1%}, "
      f"slider middle {call_share(cr1, 'Slider', 'middle'):.1%} still allowed")

# CR2, don't feed power: the H1 situation
mid_fresh = sum(pr for pr, _, p, q in dist(BASE) if q == "middle")
cr2 = replace(BASE, grades={"w": 5})
mid_cr2 = sum(pr for pr, _, p, q in dist(cr2) if q == "middle")
check("3.5 CR2: against a power hitter the middle gets 0% for every pitch",
      mid_cr2 == 0.0 and mid_fresh > 0.0,
      f"middle share {mid_fresh:.1%} -> {mid_cr2:.1%} at power grade 5; codes {coach_blocks(A, cr2)[1]}")
check("3.5 CR2 fires at grade 4 but not at grade 3",
      coach_blocks(A, replace(BASE, grades={"w": 4}))[1] == ["CR2"]
      and coach_blocks(A, replace(BASE, grades={"w": 3}))[1] == [],
      "grade 4 and 5 trigger it, grade 3 does not")

check("3.5 both rules say why",
      rule_notes(A, cr1) == [RULE_WHY["CR1"]] and rule_notes(A, cr2) == [RULE_WHY["CR2"]],
      f"{rule_notes(A, cr1)} / {rule_notes(A, cr2)}")

# both stand down in fallback, where he has nothing to spare
fb_pitches = [replace(p, conf=0.30, base_conf=0.30) for p in A]
s_fb2 = replace(BASE, grades={"w": 5}, matchup={"hard|FB|middle": 3})
check("3.5 both rules stand down when nothing is trusted",
      coach_blocks(fb_pitches, s_fb2) == (set(), []),
      "in fallback (3.2) the coach rules are off: he has no pitch to spare")

# and they stand down rather than leave nothing
one = [Pitch("Fastball", "FB", grade=3, command=3, conf=0.80, shape="ride", velo=88)]
s_one2 = replace(Situation(1, 1, 0, E, level="college_d3"), grades={"w": 5},
                 matchup={"hard|FB|up-in": 2, "hard|FB|down-in": 2})
left = allowed_calls(one, s_one2, exclude={("Fastball", "up-away"), ("Fastball", "down-away"),
                                           ("Fastball", "chase")})
check("3.5 the coach rules stand down rather than leave nothing",
      left != [],
      f"one pitch with its other spots shaken off, the middle banned by CR2 and both inside spots by CR1: "
      f"allowed_calls still returns {left}")

# ---------------------------------------------------------------------------------------------------------------
# 3.6 the guardrail split into a location guard and a pitch-type guard
# ---------------------------------------------------------------------------------------------------------------
print("\n== 3.6 location guard and pitch-type guard ==")

AVG_CH = [Pitch("Fastball", "FB", grade=3, command=3, conf=0.80, shape="ride", velo=88),
          Pitch("Slider", "SL", grade=3, command=3, conf=0.75, shape="tight", velo=79),
          Pitch("Changeup", "CH", grade=3, command=2, conf=0.60, shape="fade", velo=80)]


def kept_types(ars, s):
    tab = solve_table(ars, replace(s, balls=0, strikes=0, last=None, history=()))
    pi, sg, full, res, M = root_call(ars, s, tab)
    return sorted({n for n, q in M})


# the plan's acceptance case for this sub-step
s20_opp = Situation(2, 0, 0, E, level="college_d3", same_side=False)
check("3.6 an average changeup to an opposite-side hitter at 2-0 survives the guard",
      "Changeup" in kept_types(AVG_CH, s20_opp),
      f"kept types at 2-0 opposite-side: {kept_types(AVG_CH, s20_opp)} (GUARD_TYPE {GUARD_TYPE})")
check("3.6 it survives to a same-side hitter too",
      "Changeup" in kept_types(AVG_CH, replace(s20_opp, same_side=True)),
      f"kept types same-side: {kept_types(AVG_CH, replace(s20_opp, same_side=True))}")


def guard_sets(ars, s, gtype):
    """v0.9's single-guard kept set, and the 3.6 two-guard kept set, from the same myopic costs."""
    tab = solve_table(ars, replace(s, balls=0, strikes=0, last=None, history=()))
    by = {x.name: x for x in ars}
    ks = sit_options(ars)
    look = s.look or tab.h0
    sg = tab.sigma[(s.balls, s.strikes)]
    sL = replace(s, look=look)
    cmy = {a: sum(sg[kk] * cost08(by[a[0]], a[1], sL, ars, tab, look, ("pure",) + kk, myopic=True)[0] for kk in ks)
           for a in allowed_calls(ars, s)}
    best = min(cmy.values())
    rs = run_scale(s.level)
    d = GUARD_DELTA * rs
    bt = {}
    for (n, q), c in cmy.items():
        bt[n] = min(bt.get(n, 9e9), c)
    old = {a for a in cmy if cmy[a] - best <= d}
    new = {a for a in cmy if cmy[a] - bt[a[0]] <= d and bt[a[0]] - best <= gtype * rs}
    return old, new


# The plan's sanity check says "at GUARD_TYPE = GUARD_DELTA the kept set is a subset of v0.9's". That direction
# cannot hold, and the proof is one line: for any call v0.9 keeps, cmy[a] - best <= d, so its type's best is also
# within d of best (type guard passes) and the call is within d of its own type's best (location guard passes). So
# v0.9's set is a SUBSET of the new one, never the other way. Equal thresholds can only ever admit more, which is the
# whole point of splitting the guard. Checked below in the direction that is actually true.
sub_ok, n_chk = 0, 0
for b_ in range(4):
    for k_ in range(3):
        for side_ in (True, False):
            o_, n_ = guard_sets(AVG_CH, Situation(b_, k_, 1, E, level="college_d3", same_side=side_), GUARD_DELTA)
            n_chk += 1
            sub_ok += o_ <= n_
check("3.6 at equal thresholds the v0.9 kept set is a subset of the new one",
      sub_ok == n_chk,
      f"{sub_ok}/{n_chk} count-and-side combinations: splitting the guard only ever admits more, never fewer")

# the location guard still bites: a clearly worse spot for a pitch is dropped
o_, n_ = guard_sets(AVG_CH, Situation(1, 1, 1, E, level="college_d3"), GUARD_TYPE)
check("3.6 the location guard still drops clearly worse spots",
      len(n_) < len(allowed_calls(AVG_CH, Situation(1, 1, 1, E, level="college_d3"))),
      f"{len(n_)} of {len(allowed_calls(AVG_CH, Situation(1, 1, 1, E, level='college_d3')))} allowed calls "
      f"survive both guards at 1-1")

# ---------------------------------------------------------------------------------------------------------------
# 3.7 the mixing operator weighted by real usage
# ---------------------------------------------------------------------------------------------------------------
# The grid below is the CI call-sheet grid in miniature: three levels, three arsenals, both platoons, all 12 counts.
# root_call returns (pi, sg, full, res, M) where pi is policy_from_costs(full, s, temp, arsenal) exactly -- the sit
# game returns the policy of the sigma it stopped on -- so `full` is the real cost dict the operator was handed.
AR37 = {
    "FB+SL": [Pitch("Fastball", "FB", grade=3, command=3, conf=0.80, shape="ride", velo=88),
              Pitch("Slider", "SL", grade=3, command=3, conf=0.75, shape="tight", velo=79)],
    "FB+SL+CH": arsenal(),
    "FB+SL+CB+CH": arsenal() + [Pitch("Curve", "CB", grade=3, command=3, conf=0.70, shape="sharp", velo=74)],
}


def grid37():
    """(arsenal, situation, pi, full, M, temp, res) over the grid."""
    out = []
    for lvl in ("hs", "college_d3", "college_d1"):
        for ars in AR37.values():
            for side in (True, False):
                base = Situation(0, 0, 1, E, level=lvl, same_side=side)
                tab = solve_table(ars, base)
                for b_ in range(4):
                    for k_ in range(3):
                        s_ = replace(base, balls=b_, strikes=k_, look=tab.h0)
                        pi, sg, full, res, M = root_call(ars, s_, tab)
                        out.append((ars, s_, pi, full, M, e37.temperature(ars, s_), res))
    return out


import engine as e37                                                          # noqa: E402
from math import exp, log                                                     # noqa: E402

G37 = grid37()


def v09_policy(costs, s, temp):
    """The v0.9 operator, kept here as the reference the plan's first 3.7 test compares against: a softmax over each
    pitch's best cost inside the never-pick window, then a softmax over that pitch's targets inside the location
    window. Both tapered. No usage weighting anywhere."""
    win, lwin = e37.windows(s)
    names = []
    for (n_, q_) in costs:
        if n_ not in names:
            names.append(n_)
    best_by = {n_: min(c for (m_, q_), c in costs.items() if m_ == n_) for n_ in names}
    overall = min(best_by.values())

    def soft(cs, w, ref):
        wt = {k_: exp(-(c - ref) / temp) * e37._taper(c - ref, w) for k_, c in cs.items()}
        t = sum(wt.values())
        return {k_: v / t for k_, v in wt.items() if v > 0} if t > 0 else {}

    pp = soft(best_by, win, overall)
    pi = {}
    for n_, pn in pp.items():
        lw = max(e37.TAPER * lwin, lwin - (best_by[n_] - overall))
        for q_, pq in soft({q_: c for (m_, q_), c in costs.items() if m_ == n_}, lw, best_by[n_]).items():
            pi[(n_, q_)] = pn * pq
    return pi


def by_pitch(pi):
    o = {}
    for (n_, q_), v in pi.items():
        o[n_] = o.get(n_, 0.0) + v
    return o


def cond(pi):
    """The target mix within each pitch."""
    tot = by_pitch(pi)
    return {a: v / tot[a[0]] for a, v in pi.items() if tot[a[0]] > 0}


# the plan's first test: with u flat and kappa_T = kappa_L = 1, the TARGET mix inside each pitch is v0.9's exactly
mp, kt, kl = e37.MIX_PRIOR, e37.KAPPA_T, e37.KAPPA_L
e37.MIX_PRIOR, e37.KAPPA_T, e37.KAPPA_L = {}, 1.0, 1.0
worst_loc, n_loc = 0.0, 0
ord_ok, ord_n = 0, 0
for ars, s_, _pi, full, M, temp, _res in G37:
    flat = e37.policy_from_costs(full, s_, temp, ars)
    ref = v09_policy(full, s_, temp)
    c_new, c_ref = cond(flat), cond(ref)
    for a in set(c_new) | set(c_ref):
        n_loc += 1
        worst_loc = max(worst_loc, abs(c_new.get(a, 0.0) - c_ref.get(a, 0.0)))
    # and the pitch-type ORDER matches v0.9's best-cost order wherever two best costs differ by more than T
    best_by = {}
    for (n_, q_), c in full.items():
        if n_ not in best_by or c < best_by[n_]:
            best_by[n_] = c
    pt = by_pitch(flat)
    names = sorted(pt)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            x, y = names[i], names[j]
            if abs(best_by[x] - best_by[y]) <= temp:
                continue
            ord_n += 1
            ord_ok += (pt[x] > pt[y]) == (best_by[x] < best_by[y])
e37.MIX_PRIOR, e37.KAPPA_T, e37.KAPPA_L = mp, kt, kl
check("3.7 with a flat prior and kappa = 1 the target mix inside each pitch is v0.9's exactly",
      worst_loc < 1e-12,
      f"largest difference {worst_loc:.2e} over {n_loc} (pitch, target) shares on the {len(G37)}-situation grid")
check("3.7 the pitch-type order follows the best-cost order wherever the best costs differ by more than T",
      ord_ok == ord_n,
      f"{ord_ok}/{ord_n} pitch pairs whose best costs differ by more than T")

# shares sum to 1, and nothing outside the guards is ever picked
worst_sum, outside = 0.0, 0
for ars, s_, pi, full, M, temp, _res in G37:
    worst_sum = max(worst_sum, abs(sum(pi.values()) - 1.0))
    outside += len(set(pi) - set(M))
check("3.7 the mix sums to 1 and never picks a call the guards removed",
      worst_sum < 1e-12 and outside == 0,
      f"largest |sum - 1| {worst_sum:.2e}, {outside} calls outside the guarded set, over {len(G37)} situations")

# the sit game still converges everywhere on the grid
worst_res = max(r for *_x, r in G37)
check("3.7 the sit game converges on the whole grid",
      worst_res < e37.QRE_TOL,
      f"largest residual {worst_res:.2e} (tolerance {e37.QRE_TOL}) over {len(G37)} situations")

# the prior is doing the work it was added for: off-speed is no longer shut out of a hitter's count, and the engine's
# own 0-0 mix now sits close to what real pitchers throw in that count and platoon
pri = e37.MIX_PRIOR["u_T"]["FB+SL+CH"]
worst_mix = 0.0
mix_lines = []
for side, plat in ((True, "same"), (False, "opp")):
    s_ = Situation(0, 0, 1, E, level="college_d1", same_side=side)
    tab = solve_table(A, s_)
    pi = root_call(A, replace(s_, look=tab.h0), tab)[0]
    got = by_pitch(pi)
    want = pri[plat]["0-0"]
    kind = {x.name: x.kind for x in A}
    d = {kind[n_]: v for n_, v in got.items()}
    worst_mix = max(worst_mix, max(abs(d.get(k_, 0.0) - want[k_]) for k_ in want))
    mix_lines.append(f"{plat} " + " ".join(f"{k_} {d.get(k_, 0.0):.0%}/{want[k_]:.0%}" for k_ in sorted(want)))
check("3.7 the 0-0 pitch-type mix tracks real usage (engine/real, within 8 points)",
      worst_mix < 0.08,
      "; ".join(mix_lines))

s20 = Situation(2, 0, 1, E, level="college_d1", same_side=False)
tab20 = solve_table(A, s20)
ch20 = by_pitch(root_call(A, replace(s20, balls=2, strikes=0, look=tab20.h0), tab20)[0]).get("Changeup", 0.0)
check("3.7 off-speed is not shut out of a hitter's count (issue 6)",
      ch20 > 0.05,
      f"changeup at 2-0 to an opposite-side hitter: {ch20:.1%} (real changeup usage there is "
      f"{pri['opp']['2-0']['CH']:.1%})")


print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
