"""Tests for the eight philosophy changes in engine v0.2. Each prints what it checks and PASS/FAIL."""
import sys
import time
import random
from collections import Counter
from engine import (Pitch, Situation, call_v08, outcome_probs, call_mixed, mixed_policy, at_bat_values, grade_call,
                    landing, CV)

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


def share(ars, s, **kw):
    policy, _, _ = mixed_policy(ars, s, **kw)
    return policy


def loc_share(ars, s, pitch, quad):
    _, dist = call_mixed(ars, s)
    return sum(pr for pr, _, p, q in dist if p.name == pitch and q == quad)


E, R1, R3 = (False, False, False), (True, False, False), (False, False, True)
A = arsenal()

# R1 mix, don't script: no situation is 100% one pitch unless it's clearly right
p = share(A, Situation(1, 2, 1, R3, last=("Fastball", "up-in")))
check("R1 mixing: 1-2 with a runner on 3rd is mostly slider, not all slider",
      0.5 < p["Slider"] < 0.95, f"slider {p['Slider']:.0%}, fastball {p['Fastball']:.0%}, changeup {p['Changeup']:.0%}")

# R2 think in at-bats: count values come from this matchup
t0 = time.time()
rel_k, _ = at_bat_values(arsenal(sl_grade=5), Situation(0, 0, 0, E))
t_k = time.time() - t0
contact = [Pitch("Fastball", "FB", grade=2, command=5, conf=0.8, velo=82),
           Pitch("Curve", "CB", grade=2, command=4, conf=0.7, velo=68),
           Pitch("Changeup", "CH", grade=2, command=4, conf=0.7, velo=73)]
rel_c, _ = at_bat_values(contact, Situation(0, 0, 0, E))
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

# R7 perceived speed: after fastball up-in, the down-away changeup has the bigger perceived-speed gap
# (v0.4: the combined pairing can now prefer down-in, because tunneling favors the same lane)
from engine import perceived, tunnel_score
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
missing = Situation(2, 1, 1, E, level="college_d3", last=("Fastball", "up-in"), landing_today={"Slider": (3, 9)})
landing_ok = Situation(2, 1, 1, E, level="college_d3", last=("Fastball", "up-in"), landing_today={"Slider": (7, 9)})
def sl_mid(s_):
    _, d_ = call_mixed(A, s_, rng=random.Random(0))
    return sum(pr for pr, _, p, q in d_ if p.name == "Slider" and q == "middle")
a_, b_, c_ = sl_mid(fresh), sl_mid(missing), sl_mid(landing_ok)
# bar set by Drew (2026-11-02): losing about half is right ("it's good"); v0.6f lost 50.4%, the calibrated engine 47%
check("v0.6d get it over only when it's landing: a slider 3-for-9 today loses about half its get-it-over calls or more",
      b_ < 0.55 * a_ and abs(c_ - a_) < 0.02, f"slider get-it-over at 2-1: {a_:.0%} fresh, {b_:.0%} at 3 of 9 strikes, {c_:.0%} at 7 of 9")

# v0.7c Drew (2026-11-03): 3-0 leans on the cheaper pitch (tightest mix, like 3-2); 3-1 is left as it was
AVG3 = [Pitch("Fastball", "FB", grade=3, command=3, conf=0.80, shape="ride", velo=86),
        Pitch("Slider", "SL", grade=3, command=3, conf=0.75, shape="tight", velo=78),
        Pitch("Changeup", "CH", grade=3, command=3, conf=0.65, shape="fade", velo=78)]
def fb_share(b, k, lvl):
    _, d_ = call_mixed(AVG3, Situation(b, k, 0, E, level=lvl), rng=random.Random(0))
    return sum(pr for pr, _, p, q in d_ if p.kind == "FB")
f30 = {l: fb_share(3, 0, l) for l in ("hs", "college_d3", "college_d1")}
f31 = fb_share(3, 1, "college_d3")
check("v0.7c 3-0: an average arsenal throws mostly fastballs (60%+ at every level), 3-1 still mixes",
      all(v >= 0.60 for v in f30.values()) and 0.6 < f31 < 0.95,
      ", ".join(f"{l} 3-0 fastball {v:.0%}" for l, v in f30.items()) + f", college_d3 3-1 fastball {f31:.0%}")

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

print(f"\n{sum(results)}/{len(results)} checks passed")
# exit non-zero when anything failed, so a direct run (a hook, a pre-commit, another agent) cannot read a pass
# from $? while checks are failing. scripts/run-check.sh also parses the line above, so CI is unaffected.
sys.exit(0 if all(results) else 1)

