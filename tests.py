"""Tests for the eight philosophy changes in engine v0.2. Each prints what it checks and PASS/FAIL."""
import sys
import time
import random
from collections import Counter
from engine import Pitch, Situation, call_v08, outcome_probs, grade_call, landing, solve_table, ev_adj, CV, is_fastball

random.seed(11)
results = []


def check(name, ok, detail):
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}\n       {detail}")


def arsenal(sl_grade=4, sl_conf=0.75):
    return [
        Pitch("Fastball", "FB", grade=3, command=4, conf=0.80, shape="ride", velo=86),
        Pitch("Slider", "SL", grade=sl_grade, command=3, conf=sl_conf, shape="tight", velo=78),
        Pitch("Changeup", "CH", grade=3, command=2, conf=0.60, shape="fade", velo=77),
    ]


def share(ars, s):
    """Pitch-type shares of the live call (call_v08). v1.0 #18: was the retired v0.7c mixed_policy."""
    _, d_, _, _ = call_v08(ars, s, rng=random.Random(0))
    out = {p_.name: 0.0 for p_ in ars}
    for pr, _, p_, q_ in d_:
        out[p_.name] += pr
    return out


def loc_share(ars, s, pitch, quad):
    _, dist, _, _ = call_v08(ars, s, rng=random.Random(0))
    return sum(pr for pr, _, p, q in dist if p.name == pitch and q == quad)


E, R1, R3 = (False, False, False), (True, False, False), (False, False, True)
A = arsenal()

# R1 mix, don't script: no situation is 100% one pitch unless it's clearly right
# v1.0 Step 2 (Drew, Nov 10): measured on the live call (call_v08). "Mostly slider" (50%+) only ever held on the retired
# v0.7c path; the live engine calls slider 42-48% here (at Step 1 too), so the check keeps its intent: slider on top,
# nothing scripted (no pitch at 95%+). Level pinned to "college", the level this check always ran at (v1.0 #27).
def type_shares(ars, s_):
    _, d_, _, _ = call_v08(ars, s_, rng=random.Random(0))
    out = {}
    for pr, _, p_, q_ in d_:
        out[p_.name] = out.get(p_.name, 0.0) + pr
    return out
p = type_shares(A, Situation(1, 2, 1, R3, last=("Fastball", "up-in"), level="college"))
check("R1 mixing: 1-2 with a runner on 3rd after a fastball up-in: slider is the top pitch, nothing scripted (< 95%)",
      max(p, key=p.get) == "Slider" and max(p.values()) < 0.95,
      ", ".join(f"{n} {v:.0%}" for n, v in sorted(p.items(), key=lambda x: -x[1])))

# R2 think in at-bats: count values come from this matchup (v1.0 #18: the live at-bat table, solve_table, read at the
# hitter's starting look; was the retired v0.7c at_bat_values)
def _rel(ars):
    tab_ = solve_table(ars, Situation(0, 0, 0, E))
    v00 = tab_.value(0, 0, tab_.h0)
    return {c: tab_.value(c[0], c[1], tab_.h0) - v00 for c in tab_.V}
t0 = time.time()
rel_k = _rel(arsenal(sl_grade=5))
t_k = time.time() - t0
contact = [Pitch("Fastball", "FB", grade=2, command=5, conf=0.8, velo=82),
           Pitch("Curve", "CB", grade=2, command=4, conf=0.7, velo=68),
           Pitch("Changeup", "CH", grade=2, command=4, conf=0.7, velo=73)]
rel_c = _rel(contact)
check("R2 at-bat values: a strikeout pitcher's 0-2 is worth more to him than a contact pitcher's",
      rel_k[(0, 2)] < rel_c[(0, 2)],
      f"0-2 value (hitter runs vs 0-0): strikeout pitcher {rel_k[(0,2)]:+.3f}, contact pitcher {rel_c[(0,2)]:+.3f}, "
      f"MLB average {CV[(0,2)]:+.3f}  (solve took {t_k:.1f}s)")
print("       Full solved table, strikeout pitcher vs MLB average:")
for c in sorted(rel_k, key=lambda c: (c[1], c[0])):
    print(f"         {c[0]}-{c[1]}: {rel_k[c]:+.3f}  (MLB {CV[c]:+.3f})")

# R4 expand, don't waste: chase target is mostly just off, rarely way off
z = landing(A[1], "chase", Situation(0, 2, 0, E))
check("R4 expand, don't waste: a chase slider lands just off the plate far more than way off",
      z["off"] > 3 * z["noncomp"], f"just off {z['off']:.0%}, way off {z['noncomp']:.0%}, edge {z['edge']:.0%}")

# R5 avoid strengths > hunt holes
base = share(A, Situation(1, 1, 0, E))["Fastball"]
crush = share(A, Situation(1, 1, 0, E, hitter_damage={"FB": (0.8, 30)}))["Fastball"]
hole_small = share(A, Situation(1, 1, 0, E, hitter_damage={"FB": (-0.8, 5)}))["Fastball"]
hole_big = share(A, Situation(1, 1, 0, E, hitter_damage={"FB": (-0.8, 40)}))["Fastball"]
check("R5 strengths: a hitter who crushes fastballs (30 pitches of evidence) sees fewer",
      crush < base - 0.05, f"fastball share {base:.0%} -> {crush:.0%}")
check("R5 holes: a thin fastball hole (5 pitches) barely moves the call; a proven one (40) does",
      abs(hole_small - base) < abs(hole_big - base) and abs(hole_small - base) < 0.06,
      f"fastball share {base:.0%} -> {hole_small:.0%} (thin evidence) vs {hole_big:.0%} (proven)")

# R6 repeat after a whiff
s_whiff = Situation(1, 2, 1, E, last=("Slider", "down-away", "whiff"))
s_foul = Situation(1, 2, 1, E, last=("Slider", "down-away", "foul"))
w, f_ = loc_share(A, s_whiff, "Slider", "down-away"), loc_share(A, s_foul, "Slider", "down-away")
check("R6 repeat after a whiff: same slider, same spot is called more after a whiff than after a foul",
      w > f_ + 0.03, f"slider down-away {w:.0%} after a whiff vs {f_:.0%} after a foul")

# R7 perceived speed: after fastball up-in, the down-away changeup has the bigger perceived-speed gap (the timing term's
# perceived speed is the pitch's speed + its location adjustment; v1.0 #18 dropped the retired pairing() path)
from engine import tunnel_score
perceived = lambda p_, q_: p_.mph() + ev_adj(p_, q_)
gap_away = abs(perceived(A[2], "down-away") - perceived(A[0], "up-in"))
gap_in = abs(perceived(A[2], "down-in") - perceived(A[0], "up-in"))
check("R7 perceived speed: after fastball up-in, changeup down-away looks slower than changeup down-in",
      gap_away > gap_in, f"perceived speed gap {gap_away:.0f} mph (down-away) vs {gap_in:.0f} mph (down-in)")

# v0.4 tunneling
ride = Pitch("FB", "FB", 3, 4, 0.8, shape="ride", velo=86)
cb = Pitch("CB", "CB", 3, 3, 0.7, shape="loopy", velo=72)
cb_tip = Pitch("CB2", "CB", 3, 3, 0.7, shape="loopy", velo=72, release_offset_in=(-3, 6))
sink = Pitch("SI", "FB", 3, 4, 0.8, shape="sink", velo=86)
sweep = Pitch("SW", "SL", 3, 3, 0.7, shape="sweeper", velo=78)
classic = tunnel_score(ride, "up-away", cb, "down-away", True)
tipped = tunnel_score(ride, "up-away", cb_tip, "down-away", True)
split_early = tunnel_score(sink, "down-away", sweep, "down-away", True)
check("Tunnel: riding fastball up + 12-6 curve down is a strong tunnel",
      classic[0] > 0.4, f"score {classic[0]:+.2f}: {classic[1]:.1f} in apart at the decision point, "
      f"{classic[2]:.1f} in of break difference after it")
check("Tunnel: the same curve from a different slot loses the tunnel",
      tipped[0] < classic[0] - 0.3, f"score {tipped[0]:+.2f} vs {classic[0]:+.2f}")
check("Tunnel: sinker + sweeper separate early and rank below the classic pair",
      split_early[0] < classic[0], f"score {split_early[0]:+.2f}: {split_early[1]:.1f} in apart at the decision point")

# R8 no cliff (v0.9: familiarity): hard contact rises smoothly with how often he has seen the pitch type today, then
# levels off at its cap; no jump at the third time through
hard = [(n, outcome_probs(A[0], "up-in", Situation(1, 1, 0, E, familiar={"FB": n}), A)["hard"]) for n in (0, 6, 12, 18, 19, 27)]
jumps = [hard[i + 1][1] - hard[i][1] for i in range(len(hard) - 1)]
check("R8 no third-time cliff: the 19th fastball he sees is barely worse than the 18th",
      all(j >= -1e-12 for j in jumps) and jumps[3] < jumps[0] / 5, "fastball up-in hard contact by fastballs seen: " +
      ", ".join(f"{n}: {h:.2%}" for n, h in hard))

# Learning mode
g = grade_call(A, Situation(0, 2, 1, E, last=("Fastball", "up-in")), "Fastball", "middle")
g2 = grade_call(A, Situation(0, 2, 1, E, last=("Fastball", "up-in")), "Slider", "chase")
check("Learning mode: a grooved 0-2 fastball is outside the engine's mix and clearly worse; slider chase is in the mix",
      g["engine_prob"] < 0.02 and g["runs_vs_best"] > 0.015 and g2["verdict"] == "in the engine's mix",
      f"{g['call']}: {g['verdict']} ({g['runs_vs_best']:+.3f} runs); "
      f"{g2['call']}: {g2['verdict']} (picked {g2['engine_prob']:.0%} of the time)")

# v0.6 hit by pitch: a way-inside miss can hit the batter; aiming in raises it vs aiming away
from engine import outcome_probs, OUTCOME_ADJ
s_hs = Situation(1, 1, 0, E, level="hs")
hin = outcome_probs(A[0], "down-in", s_hs, A)["hbp"]
haway = outcome_probs(A[0], "down-away", s_hs, A)["hbp"]
check("v0.6 hit by pitch: inside pitches hit batters more than away pitches (HS)",
      OUTCOME_ADJ["hs"]["hbp"] > 0 and hin > 2 * haway > 0,
      f"HBP per pitch: down-in {hin:.2%}, down-away {haway:.2%}")

# v0.6 level realism: exact plate-appearance math reproduces each level's real K / BB / HBP
import calib
real = calib.RV
for lvl, key in (("mlb", "mlb_check"), ("college_d3", "college_d3"), ("hs", "hs")):
    m = calib.evaluate(lvl)
    errs = {k: m[k] - real[key][k] for k in ("K", "BB", "HBP")}
    check(f"v0.6 realism ({lvl}): strikeouts, walks and HBP within 1 point of real",
          all(abs(v) < 0.01 for v in errs.values()),
          ", ".join(f"{k} {m[k]:.1%} vs {real[key][k]:.1%}" for k in ("K", "BB", "HBP")))

# v0.6d Drew's rule: if the off-speed gets it over, get it over; if it isn't landing, don't lean on it
fresh = Situation(2, 1, 1, E, level="college_d3", last=("Fastball", "up-in"))
# v1.0 Step 3: the landing record is (strikes, expected strikes, pitches); 9 slider calls at his own expectation
from engine import expected_strike as _exs
_ex9 = 9 * _exs(next(p for p in A if p.name == "Slider"), "middle", fresh, A)
missing = Situation(2, 1, 1, E, level="college_d3", last=("Fastball", "up-in"), landing_today={"Slider": (3, _ex9, 9)})
landing_ok = Situation(2, 1, 1, E, level="college_d3", last=("Fastball", "up-in"), landing_today={"Slider": (7, _ex9, 9)})
def sl_mid(s_):
    _, d_, _, _ = call_v08(A, s_, rng=random.Random(0))
    return sum(pr for pr, _, p, q in d_ if p.name == "Slider" and q == "middle")
a_, b_, c_ = sl_mid(fresh), sl_mid(missing), sl_mid(landing_ok)
# bar set by Drew (2026-11-02): losing about half is right ("it's good"); v0.6f lost 50.4%, the calibrated engine 47%.
# v1.0 Step 2 (Drew, Nov 10): measured on the live call (call_v08); "about half" = 40% or more. On the live engine at
# Step 1 the guardrail cut this call to 0% even when the slider was landing, so the rule had never acted there.
# v1.0 Step 3 (Drew, Nov 10): landing is two-sided, so a slider landing better than expected may gain calls; the check
# is that it doesn't lose them.
check("v0.6d get it over only when it's landing: a slider 3-for-9 today loses about half its get-it-over calls or more;"
      " 7-for-9 doesn't lose any",
      a_ > 0.05 and b_ < 0.60 * a_ and c_ >= a_ - 0.02,
      f"slider get-it-over at 2-1: {a_:.0%} fresh, {b_:.0%} at 3 of 9 strikes, {c_:.0%} at 7 of 9 (expected {_ex9:.1f} of 9)")

AVG3 = [Pitch("Fastball", "FB", grade=3, command=3, conf=0.80, shape="ride", velo=86),
        Pitch("Slider", "SL", grade=3, command=3, conf=0.75, shape="tight", velo=78),
        Pitch("Changeup", "CH", grade=3, command=3, conf=0.65, shape="fade", velo=78)]

# v1.0 Step 2: the predictability grid (grid_v10.py) replaces the v0.7c "3-0 / 3-1" check, which measured the retired
# v0.7c call path. call_v08 in 12 counts x hs/D3/D1 x 5 arsenals x bases empty/R1/R3; hard checks gate, the rest print.
import grid_v10
_g = grid_v10.grid()
for _name, _ok, _det, _hard in grid_v10.checks(_g):
    if _hard:
        check("v1.0 grid: " + _name, _ok, _det)
    else:
        print(f"[INFO] v1.0 grid: {_name}\n       {_det}")

# v0.9 hitter's-count rule and a real mix: the engine's own calls never include a chase at 3-0, 3-1 or 2-2, and its
# top call there is a pitch in the zone
rule_ok, tops = True, []
for (b, k) in ((3, 0), (3, 1), (2, 2), (0, 0)):
    _, d_, _, _ = call_v08(AVG3, Situation(b, k, 1, E, level="college_d3"), rng=random.Random(0))
    if (b, k) != (0, 0):
        rule_ok &= not any(q == "chase" and pr > 0 for pr, _, _, q in d_)
    tops.append(f"{b}-{k} {d_[0][2].name} {d_[0][3]} {d_[0][0]:.0%}")
check("v0.9 calls: no chase at 3-0, 3-1 or 2-2; every count has a top call",
      rule_ok and len(tops) == 4, "; ".join(tops))

# ---------------------------------------------------------------- v1.0 Step 1 (docs/PLAN_v1.0_2026-11-09.md)
import json as _json
from engine import (solve_table, frozen_inputs, needs_resolve, is_big_spot, gb_rate, hbp_loc, ev_adj,
                    outcome_probs as _op)
_perceived = lambda p_, q_: p_.mph() + ev_adj(p_, q_)      # the timing term's perceived speed (v1.0 #18: no engine helper)
from dataclasses import replace as _replace
R2 = (False, True, False)


def _dist(ars, s, **kw):
    _, d_, tab_, _ = call_v08(ars, s, rng=random.Random(0), **kw)
    out = {}
    for pr, _, p_, q_ in d_:
        out[(p_.name, q_)] = out.get((p_.name, q_), 0.0) + pr
    return out


def _tv(a, b):
    return 0.5 * sum(abs(a.get(k, 0.0) - b.get(k, 0.0)) for k in set(a) | set(b))


# #2: a runner moves mid at-bat -> the table is re-solved, and the stale table really did give a different call
s_r1 = Situation(1, 1, 1, R1, level="college_d3")
tab_r1 = solve_table(AVG3, _replace(s_r1, balls=0, strikes=0, last=None))
fz = frozen_inputs(AVG3, s_r1)
s_r2 = _replace(s_r1, bases=R2)
stale, fresh = _dist(AVG3, s_r2, tab=tab_r1), _dist(AVG3, s_r2, tab=solve_table(AVG3, _replace(s_r2, balls=0, strikes=0, last=None)))
tv2 = _tv(stale, fresh)
same = needs_resolve(fz, AVG3, s_r1)
out_ch = needs_resolve(fz, AVG3, _replace(s_r1, outs=2))
check("v1.0 #2 re-solve: a runner moving R1 -> R2 (or an out) forces a re-solve; the stale table's call differs",
      needs_resolve(fz, AVG3, s_r2) and out_ch and not same and tv2 > 0.05,
      f"needs_resolve R1->R2 {needs_resolve(fz, AVG3, s_r2)}, outs 1->2 {out_ch}, unchanged {same}; "
      f"stale vs fresh 1-1 mix differ by {tv2:.0%} (total variation)")

# #9: the live entry points validate their input
errs = []
for fn in (lambda: call_v08(AVG3, Situation(0, 0, 3, E, level="college_d3")),
           lambda: solve_table(AVG3, Situation(0, 0, 3, E, level="college_d3")),
           lambda: call_v08(AVG3, Situation(4, 0, 0, E, level="college_d3"))):
    try:
        fn(); errs.append("no error")
    except ValueError as ex:
        errs.append(str(ex))
    except Exception as ex:
        errs.append(f"{type(ex).__name__}: {ex}")
check("v1.0 #9 input check: call_v08 and solve_table reject 3 outs and a 4-ball count with ValueError",
      errs[0].startswith("impossible number of outs") and errs[1].startswith("impossible number of outs")
      and errs[2].startswith("impossible count"), "; ".join(errs))

# #6 / D2: a shake-off removes the pitch at every spot (names, or the older (pitch, spot) pairs)
s22 = Situation(2, 2, 1, E, level="college_d3")
fb_by_name = sum(v for (n, _), v in _dist(AVG3, s22, exclude={"Fastball"}).items() if n == "Fastball")
fb_by_pair = sum(v for (n, _), v in _dist(AVG3, s22, exclude={("Fastball", "middle")}).items() if n == "Fastball")
fb_none = sum(v for (n, _), v in _dist(AVG3, s22).items() if n == "Fastball")
check("v1.0 #6 shake-off = the pitch: after shaking off the fastball at 2-2 it gets 0% at every spot",
      fb_by_name == 0.0 and fb_by_pair == 0.0 and fb_none > 0.0,
      f"fastball share {fb_none:.0%} fresh, {fb_by_name:.3f} after a shake by name, {fb_by_pair:.3f} after a (pitch, spot) shake")

# #10: chase is class-aware for effective velocity and HBP
fb_, ch_ = AVG3[0], AVG3[2]
hbp_r = {}
for _l in ("hs", "college_d3", "college_d1"):
    sh = Situation(0, 2, 0, E, level=_l)
    hbp_r[_l] = (_op(fb_, "chase", sh, AVG3)["hbp"], _op(fb_, "middle", sh, AVG3)["hbp"])
hbp_ch, hbp_mid = hbp_r["hs"]
check("v1.0 #10 chase by class: a fastball chase (up) plays fast and hits batters no more than a middle fastball"
      " at every level;"
      " an off-speed chase (low) plays slow",
      all(c_ <= m_ + 1e-12 for c_, m_ in hbp_r.values()) and ev_adj(fb_, "chase") == 3.0 and ev_adj(ch_, "chase") == -3.0
      and _perceived(fb_, "chase") > _perceived(fb_, "middle") and hbp_loc(ch_, "chase") == 0.8,
      "P(HBP) FB chase / FB middle at 0-2: " + ", ".join(f"{l} {c_:.4f}/{m_:.4f}" for l, (c_, m_) in hbp_r.items())
      + f"; EV adj FB chase {ev_adj(fb_, 'chase'):+.0f}, "
      f"CH chase {ev_adj(ch_, 'chase'):+.0f}")

# #8: "late" is the last three innings of the scheduled game
bs = {(lvl, inn): is_big_spot(Situation(0, 0, 1, R2, inning=inn, margin=0, level=lvl))
      for lvl, inn in (("hs", 4), ("hs", 5), ("college_d3", 6), ("college_d3", 7))}
check("v1.0 #8 big spot: HS 5th of 7, tie, R2 is late and close; HS 4th and college 6th of 9 are not",
      bs[("hs", 5)] and bs[("college_d3", 7)] and not bs[("hs", 4)] and not bs[("college_d3", 6)],
      ", ".join(f"{l} inning {i}: {v}" for (l, i), v in bs.items()))

# #16: ground-ball rates are the 2024 Statcast fit
gbt = _json.load(open("fit_v08.json"))["results"]["gb_types"]
mk = lambda k, sh_="": Pitch("x", k, grade=3, command=3, conf=0.7, shape=sh_)
got = {"4-seam": gb_rate(mk("FB", "ride")), "sink": gb_rate(mk("FB", "sink")), "cut": gb_rate(mk("FB", "cut")),
       "SL": gb_rate(mk("SL")), "CB": gb_rate(mk("CB")), "CH": gb_rate(mk("CH"))}
check("v1.0 #16 ground-ball rates match fit_v08.json results.gb_types",
      all(abs(got[k] - gbt[k]) < 1e-12 for k in got), ", ".join(f"{k} {v:.3f}" for k, v in got.items()))

# ---------------------------------------------------------------- v1.0 Step 3 (landing, confidence, repeats)
from engine import (wild_today as _wt, not_landing as _nl, landing_estimate as _le, ball_conf_event as _bce,
                    expected_strike as _xs)
fb_, sl_, ch_ = AVG3
_seq = [(0, 0, "down-away"), (0, 1, "up-in"), (1, 1, "middle"), (1, 2, "down-away"), (0, 0, "middle"), (1, 0, "down-away"),
        (2, 1, "middle"), (0, 0, "up-away"), (0, 1, "down-away"), (1, 1, "down-in"), (2, 2, "down-away"), (0, 0, "middle")]
_exp = lambda p, lvl, n=12: sum(_xs(p, q, Situation(b, k, 1, E, level=lvl), AVG3) for b, k, q in _seq[:n])

# #4: a pitcher doing what the model expects reads as not wild, at every level
w_at, w_hs = {}, None
for lvl in ("hs", "college_d3", "college_d1"):
    ex = _exp(fb_, lvl)
    w_at[lvl] = _wt(fb_, Situation(0, 0, 1, E, level=lvl, landing_today={"Fastball": (ex, ex, 12)}))
    if lvl == "hs":
        w_hs = (round(ex), ex, _wt(fb_, Situation(0, 0, 1, E, level=lvl, landing_today={"Fastball": (round(ex), ex, 12)})))
check("v1.0 #4 landing: at his own expected strike rate after 12 pitches, wild-today < 0.03 at every level",
      all(abs(v) < 0.03 for v in w_at.values()) and abs(w_hs[2]) < 0.1,
      ", ".join(f"{l} {v:.3f}" for l, v in w_at.items())
      + f"; HS fastball {w_hs[0]}/12 with {w_hs[1]:.1f} expected reads {w_hs[2]:.3f} (the old fixed center read 0.45)")

# #4: chase balls are no confidence debit (unless way off), and chase targets stay out of the landing record (callers)
check("v1.0 #4 chase takes: a ball on a chase target is no confidence debit (just off, or no location logged); way off is",
      _bce("chase") is None and _bce("chase", "off") is None and _bce("chase", "noncomp") == "ball"
      and _bce("down-away") == "ball", f"chase/none {_bce('chase')}, chase/off {_bce('chase', 'off')}, "
      f"chase/noncomp {_bce('chase', 'noncomp')}, down-away {_bce('down-away')}")

# #4 Q4: the block is relative to his own expectation
s_ = Situation(1, 1, 1, E, level="college_d3")
low = _replace(s_, landing_today={"Slider": (2, 4 * 0.30, 4)})
high = _replace(s_, landing_today={"Slider": (2, 4 * 0.72, 4)})
# (v1.0 review: at 4 pitches the -0.15 block needs 1/4 for a 0.72 pitch, so 2/4 is kept but read as wild. v1.0 Step 5:
# with the fitted LAND_K 20 / GAIN 2, four pitches move wild-today only a little; the direction is what's checked)
check("v1.0 #4 landing filter: a 0.30-strike-rate pitch going 2/4 is not blocked or wild; a 0.72 pitch going 2/4 is"
      " read as wild but not blocked",
      not _nl(sl_, low) and _wt(sl_, low) <= 0 and _wt(sl_, high) > 0.03 and not _nl(sl_, high),
      f"0.30 pitch 2/4: wild {_wt(sl_, low):+.2f}, blocked {_nl(sl_, low)}; 0.72 pitch 2/4: wild {_wt(sl_, high):+.2f}, "
      f"blocked {_nl(sl_, high)}")

# #13 / D8: no repeat penalty after a take; after a foul it applies
wh = {lab: _op(fb_, "up-away", Situation(1, 1, 1, E, level="college_d3", last=last), AVG3)["whiff"]
      for lab, last in (("fresh", None), ("ball", ("Fastball", "up-away", "ball")), ("cstrike", ("Fastball", "up-away", "cstrike")),
                        ("foul", ("Fastball", "up-away", "foul")))}
check("v1.0 D8 repeat: fastball up-away again after a take whiffs within 0.002 of fresh; after a foul the penalty applies",
      abs(wh["ball"] - wh["fresh"]) < 0.002 and abs(wh["cstrike"] - wh["fresh"]) < 0.002 and wh["foul"] < wh["fresh"] - 0.005,
      ", ".join(f"{k} {v:.4f}" for k, v in wh.items()))

# D1 acceptance: the 3-1 call moves to the pitch he's controlling today. Drew, Nov 11 (Step 5): ship the real-data landing
# fit, so the check is that the slider rises clearly at 8-for-10 vs a 4-for-10 fastball, and takes over the top once the
# fastball is clearly off (3+ strikes under his own expectation over 10)
d1, d1n, d1o = {}, {}, {}
for lvl in ("hs", "college_d3", "college_d1"):
    lt = {"Slider": (8, _exp(sl_, lvl, 10), 10), "Fastball": (4, _exp(fb_, lvl, 10), 10)}
    d1[lvl] = type_shares(AVG3, Situation(3, 1, 1, E, level=lvl, landing_today=lt))
    d1n[lvl] = type_shares(AVG3, Situation(3, 1, 1, E, level=lvl))
    d1o[lvl] = type_shares(AVG3, Situation(3, 1, 1, E, level=lvl, landing_today={"Slider": (9, _exp(sl_, lvl, 10), 10),
                                                                                 "Fastball": (int(_exp(fb_, lvl, 10) - 3), _exp(fb_, lvl, 10), 10)}))
check("v1.0 D1 3-1: slider 8-for-10 and fastball 4-for-10 today: the slider gains 8+ points over a neutral day at every "
      "level; slider 9-for-10 and the fastball 3+ strikes under his expectation: the slider is the top 3-1 pitch",
      all(d1[l].get("Slider", 0) >= d1n[l].get("Slider", 0) + 0.08 and max(d1o[l], key=d1o[l].get) == "Slider" for l in d1),
      "; ".join(f"{l}: slider {d1n[l].get('Slider', 0):.0%} -> {d1[l].get('Slider', 0):.0%} (fastball {d1[l].get('Fastball', 0):.0%}),"
                f" fastball clearly off: slider {d1o[l].get('Slider', 0):.0%}" for l in d1))

# v1.0 review (Drew, Nov 11): sharpening never moves a chase target toward the plate
from engine import landing as _land
_sh = _replace(Situation(0, 2, 1, E, level="college_d3"), landing_today={"Slider": (9, 4.5, 10)})
_c0, _c1 = _land(sl_, "chase", Situation(0, 2, 1, E, level="college_d3")), _land(sl_, "chase", _sh)
_z0, _z1 = _land(sl_, "down-away", Situation(0, 2, 1, E, level="college_d3")), _land(sl_, "down-away", _sh)
check("v1.0 review: a slider landing better than expected (9 of 10, 4.5 expected) sharpens its zone targets, not its chase",
      _wt(sl_, _sh) < 0 and all(abs(_c0[k] - _c1[k]) < 1e-12 for k in _c0) and _z1["off"] < _z0["off"],
      f"wild {_wt(sl_, _sh):+.2f}; chase off {_c0['off']:.3f} -> {_c1['off']:.3f}, edge {_c0['edge']:.3f} -> {_c1['edge']:.3f}; "
      f"down-away off {_z0['off']:.3f} -> {_z1['off']:.3f}")

# ---------------------------------------------------------------- v1.0 Step 5 (fits and model changes)
import json as _json
import engine as _e
import grid_v10 as _G
from dataclasses import replace as _rp


def _cnt_shares(ars, s0, pick):
    """Share of the calls `pick(pitch, quad)` accepts at every count, from one table solved at 0-0 (the live path)."""
    tab = _e.solve_table(ars, s0)
    out = {}
    for (b, k) in _G.COUNTS:
        _, d_, _, _ = call_v08(ars, _rp(s0, balls=b, strikes=k), rng=random.Random(0), tab=tab)
        out[(b, k)] = sum(pr for pr, _, p_, q_ in d_ if pick(p_, q_))
    return out


# #22: one same-side changeup term
chs = {}
for lvl in ("hs", "college_d3", "college_d1"):
    r_ = []
    for side in (True, False):
        s0 = Situation(0, 0, 1, E, inning=3, margin=0, level=lvl, same_side=side)
        r_.append(_cnt_shares(_G.ARSENALS["AVG3"], s0, lambda p_, q_: p_.kind == "CH")[(2, 1)])
    chs[lvl] = r_
check("v1.0 #22 same-side changeup: one term (no duplicate); at 2-1 its share is >= 60% of the opposite-side share",
      all(v[0] >= 0.6 * v[1] for v in chs.values()), ", ".join(f"{l} {v[0]:.0%} vs {v[1]:.0%}" for l, v in chs.items()))

# D3: mashed twice at a height -> the call's share at least halves at every count but 3-0 (cells with 2%+ to start)
d3, d3_30 = [], []
for lvl in ("hs", "college_d3", "college_d1"):
    for an in ("AVG3", "power"):
        fbm = lambda p_, q_: is_fastball(p_.kind) and q_ == "middle"
        b0 = _cnt_shares(_G.ARSENALS[an], Situation(0, 0, 1, E, inning=3, margin=0, level=lvl), fbm)
        b2 = _cnt_shares(_G.ARSENALS[an], Situation(0, 0, 1, E, inning=3, margin=0, level=lvl,
                                                    matchup={"hard|FB|middle": 2}), fbm)
        d3 += [(lvl, an, c, b0[c], b2[c]) for c in b0 if c != (3, 0) and b0[c] >= 0.02]
        d3_30.append((lvl, an, b0[(3, 0)], b2[(3, 0)]))
worst = max(d3, key=lambda x: x[4] / x[3])
check("v1.0 D3 mashed twice: fastball middle after two hard hits there (earlier trips) keeps <= half its share at every "
      "count but 3-0; a soft cost (MASHED_PENALTY), separate from the fitted memory",
      all(x[4] <= 0.5 * x[3] for x in d3) and _e.mashed(fb_, "middle", Situation(0, 0, 1, E, matchup={"hard|FB|middle": 2}))
      and not _e.mashed(fb_, "middle", Situation(0, 0, 1, E, matchup={"hard|FB|middle": 1})),
      f"{len(d3)} cells; least cut {worst[0]}/{worst[1]} {worst[2][0]}-{worst[2][1]} {worst[3]:.0%} -> {worst[4]:.0%}; at 3-0 "
      + ", ".join(f"{a}/{b} {c:.0%}->{d:.0%}" for a, b, c, d in d3_30[:4]))

# #7: matchup memory has its own caps, no shared clip; spot damage per pitch kind (#21)
mw = _e.matchup_whiff(fb_, "middle", Situation(1, 1, 1, E, level="college_d3", matchup={"hard|FB|middle": 3}))
want = _e.MM["hard"] * 2
mw1 = _e.matchup_whiff(fb_, "middle", Situation(1, 1, 1, E, level="college_d3", matchup={"succ|FB": 6}))
s_dk = Situation(1, 1, 1, E, level="college_d3", hitter_damage={"middle": (0.9, 30), "SL|middle": (0.9, 30)})
check("v1.0 #7 / #21: matchup memory = M1 (cap 4) + M2 (cap 2) with no shared clip; spot damage is read per pitch kind",
      abs(mw - want) < 1e-12 and abs(want) > _e.P08["fam_cap"] and abs(mw1 - 4 * _e.MM["succ"]) < 1e-12
      and _e.damage(fb_, "middle", s_dk) == 0.0
      and _e.damage(sl_, "middle", s_dk) > 0,
      f"3 hard hits {mw:+.3f} (2 x {_e.MM['hard']}; the old shared clip was +/-{_e.P08['fam_cap']}), 6 successes {mw1:+.3f}; FB middle damage {_e.damage(fb_, 'middle', s_dk):.3f}, "
      f"SL middle {_e.damage(sl_, 'middle', s_dk):.3f}")

# #12: infield in, more ground balls get through
s_in = Situation(1, 1, 1, R3, inning=7, margin=0, level="college_d3")
low_ = lambda p_, q_: _e.target_height(q_, p_.kind) == "down"
sh0 = _cnt_shares(_G.ARSENALS["AVG3"], s_in, low_)[(1, 1)]
sh1 = _cnt_shares(_G.ARSENALS["AVG3"], _rp(s_in, infield_in=True), low_)[(1, 1)]
_saved = _e.TYPED["gb_babip_in"]
try:
    _e.TYPED["gb_babip_in"] = 0.0
    sh_old = _cnt_shares(_G.ARSENALS["AVG3"], _rp(s_in, infield_in=True), low_)[(1, 1)]
finally:
    _e.TYPED["gb_babip_in"] = _saved
check("v1.0 #12 infield in: ground balls get through more (+0.08 hit rate, the plan's fallback: Statcast has no infield-in "
      "alignment); the pull toward low targets shrinks (Drew, Nov 11: some pull is right)",
      _e.TYPED["gb_babip_in"] == 0.08 and sh0 <= sh1 < sh_old,
      f"D3 AVG3 1-1 R3: low targets {sh0:.1%} -> {sh1:.1%} with the infield in (no hit cost: {sh_old:.1%})")

# #19: one RHO_L rule: eye level, tunneling and familiarity scale at HS like timing, MM, SIDE and POWER_HR
s_c = Situation(1, 1, 1, E, level="college_d3", look=(85.0, 3.3), last=("Fastball", "up-in", "ball"), familiar={"OS": 6})
s_h = _rp(s_c, level="hs")
# v1.1 Step 1b: HS profiles move 15% less than college, so the tunnel geometry differs by level; with measured movement
# (the same numbers at both levels) the check isolates the RHO_L rule it is about
_meas = lambda x: _rp(x, ivb=_e.movement(x)[0], hb=_e.movement(x)[1])
AVG3m, sl_m = [_meas(x) for x in AVG3], _meas(sl_)
pc_, ph_ = _e.pair_terms(sl_m, "chase", s_c, AVG3m), _e.pair_terms(sl_m, "chase", s_h, AVG3m)
check("v1.0 #19 RHO_L: eye level and tunneling (pair terms) at HS are 0.6x the college values",
      abs(ph_[0] - 0.6 * pc_[0]) < 1e-12 and abs(ph_[1] - 0.6 * pc_[1]) < 1e-12 and abs(pc_[1]) > 0.01,
      f"college whiff {pc_[0]:+.4f} swing {pc_[1]:+.4f}; hs {ph_[0]:+.4f} {ph_[1]:+.4f}")

# #24: the look follows the logged landing height
lk = (85.0, 2.5)
l_t = _e.look_update(lk, fb_, "down-away", s_c)
l_y = _e.look_update(lk, fb_, "down-away", s_c, _e.LOC_ROW_Y[0])
check("v1.0 #24 look: a fastball called down-away but logged in the top row moves his eye level up, not down",
      l_t[1] < 2.5 < l_y[1] and l_t[0] == l_y[0], f"look height after target {l_t[1]:.2f}, after logged top row {l_y[1]:.2f}")

# landing fit (Drew, Nov 11): the shipped constants are the fitted ones
lf = _json.load(open("results/v10/landing_fit.json"))["chosen"]
check("v1.0 Step 5 landing fit: LAND_K and LAND_GAIN are the Statcast fit (shipped only on held-out gain > 2 boot SD)",
      lf["ship"] and _e.LAND_K == lf["K"] and abs(_e.LAND_GAIN - lf["implied_gain"]) < 0.05 and _e.LAND_BLOCK_K == 5.0,
      f"K {_e.LAND_K} (fit {lf['K']}), GAIN {_e.LAND_GAIN} (fit {lf['implied_gain']:.2f}), held-out {lf['test_gain'] / lf['test_sd']:+.1f} SD;"
      f" block keeps K {_e.LAND_BLOCK_K}")

# ---------------------------------------------------------------- v1.0 Step 7: down-middle and the ground-ball rule
s7 = Situation(1, 1, 1, E, level="college_d3")
zm, zd, zc = (landing(fb_, q, s7) for q in ("middle", "down-middle", "down-away"))
inz = lambda z: z["heart"] + 0.5 * z["edge"]
ok_dm = (inz(zc) < inz(zd) < inz(zm) and _e.y_target("down-middle", "FB") == _e.y_target("down-away", "FB")
         and _e.target_height("down-middle", "FB") == "down" and "down-middle" in _e.targets(3, 1)
         and _e.loc_quad((3, 2), "FB", True) == "down-middle")
check("v1.0 Step 7 down-middle (knee-high over the plate): lands in the zone between a corner and middle, as low as the "
      "down corners, allowed in every count, the low center cell of the logging grid",
      ok_dm, f"zone share corner {inz(zc):.3f} < down-middle {inz(zd):.3f} < middle {inz(zm):.3f}")
dp = Situation(1, 1, 0, R1, level="college_d3")
down_ = lambda p_, q_: q_ in _e.GB_RULE_TARGETS
d_on = _cnt_shares(AVG3, _rp(dp, balls=0, strikes=0), down_)
_saved = _e.GB_RULE_BONUS
try:
    _e.GB_RULE_BONUS = 0.0
    d_off = _cnt_shares(AVG3, _rp(dp, balls=0, strikes=0), down_)
finally:
    _e.GB_RULE_BONUS = _saved
gb_spots = [_e.ground_ball_spot(x) for x in (dp, _rp(dp, outs=2), _rp(dp, balls=3), _rp(dp, strikes=2),
                                             Situation(1, 1, 1, R3), Situation(1, 1, 1, E))]
check("v1.0 Step 7 ground-ball rule (Drew): double play on, 1-1: most calls go down (a coach rule on top of the run math); "
      "off with 2 outs, 3 balls, 2 strikes or nobody on",
      d_on[(1, 1)] >= 0.70 > d_off[(1, 1)] and gb_spots == [True, False, False, False, True, False],
      f"1-1, runner on 1st, 0 outs: down targets {d_off[(1, 1)]:.0%} on the run math alone -> {d_on[(1, 1)]:.0%} with the rule")

# v1.0 Step 7 (Drew): the coaching reads. Each read, switched off and on, on the situation of its read-through row
def _share7(s_, pick, ars=AVG3):
    _, d_, _, _ = call_v08(ars, s_, rng=random.Random(0))
    return sum(pr for pr, _, p_, q_ in d_ if pick(p_, q_))
FBk, OSk = (lambda p_: is_fastball(p_.kind)), (lambda p_: not is_fastball(p_.kind))
_plus = [_rp(x, grade=4) if x.kind in ("SL", "CH") else x for x in AVG3]
reads7 = [   # (rule, situation, which calls it should move toward, arsenal); "squared_up" moves away
    ("late_fb", Situation(1, 1, 0, E, timing={"FB": 0.6}), lambda p_, q_: FBk(p_) and q_ in ("up-in", "up-away", "down-in"), AVG3),
    ("early_os", Situation(1, 1, 0, E, timing={"OS": -0.6}), lambda p_, q_: OSk(p_) and q_ in ("down-in", "down-away", "down-middle", "chase"), AVG3),
    ("crowd", Situation(1, 1, 0, E, crowding=True), lambda p_, q_: FBk(p_) and q_ in ("up-in", "down-in"), AVG3),
    ("squared_up", Situation(0, 1, 0, E, last=("Changeup", "down-away", "foul", "back")), lambda p_, q_: p_.name == "Changeup" and q_ == "down-away", AVG3),
    ("away", Situation(1, 1, 0, E, matchup={"hard|FB|up-in": 1}), lambda p_, q_: FBk(p_) and q_ in ("up-away", "down-away"), AVG3),
    ("went_back", Situation(1, 2, 0, E, matchup={"succ|CH": 2, "succ|CH|down-away": 2}), lambda p_, q_: p_.name == "Changeup" and q_ == "down-away", AVG3),
    # v1.1: the read now wears off as his share of today's pitches climbs (hot_fade), so the situation carries a real pitch
    # count (50, the read-through's default) instead of 0 with ten changeups thrown
    ("hot", Situation(1, 2, 1, R3, landing_today={"Changeup": (9, 10)}, pitch_count=50), lambda p_, q_: p_.name == "Changeup", AVG3),
    ("plus_opp", Situation(1, 2, 0, E, same_side=False), lambda p_, q_: (p_.kind == "CH" and q_ in ("down-away", "chase")) or (p_.kind == "SL" and q_ == "down-in"), _plus),
]
moved7, ok7 = [], True
for rule, s_, pick, ars_ in reads7:
    _saved = _e.COACH_RULE[rule]
    try:
        _e.COACH_RULE[rule] = 0.0
        off_ = _share7(s_, pick, ars_)
    finally:
        _e.COACH_RULE[rule] = _saved
    on_ = _share7(s_, pick, ars_)
    ok7 &= (on_ <= 0.01 < off_) if rule == "squared_up" else (on_ >= off_ + 0.20)
    moved7.append(f"{rule} {off_:.0%}->{on_:.0%}")
quiet7 = _e.coach_credit(fb_, "up-in", Situation(1, 1, 0, E, timing={"FB": 0.1})) == 0.0 and \
    _e.coach_credit(ch_, "down-away", Situation(0, 1, 0, E, last=("Changeup", "down-away", "foul"))) == 0.0
check("v1.0 Step 7 coaching reads (Drew): late on the fastball -> up/in, out front on soft -> soft and down, crowds -> "
      "fastball in, fouled straight back -> not that pitch there again, hit hard on one side -> the other side, worked "
      "earlier -> go back, landing better than normal -> lean on it, plus pitches to an opposite-side hitter -> changeup "
      "away and back-foot slider; each moves its calls by 20+ points, and nothing fires on a weak read or a plain foul",
      ok7 and quiet7, "; ".join(moved7))

print(f"\n{sum(results)}/{len(results)} checks passed")
# exit non-zero when anything failed, so a direct run (a hook, a pre-commit, another agent) cannot read a pass
# from $? while checks are failing. scripts/run-check.sh also parses the line above, so CI is unaffected.
sys.exit(0 if all(results) else 1)

