"""v0.8 step 6 scenario tests (docs/SPEC_v0.8.md section 11). Scenario 2 (guardrail) runs in tests_v08_solve.py.
usage: python3 tests_v08_step6.py"""
from dataclasses import replace
import engine as e

import sys
e.set_flags(**e.FLAGS_V08)
MODE = sys.argv[1] if len(sys.argv) > 1 else "fitted"
if MODE == "spec":      # the spec's starting values (mechanism check), instead of the Statcast values that shipped
    e.P08.update(beta_T=0.5, gamma_T=0.3, lam=0.6, alpha=0.4, beta_E=0.25, beta_E_S=0.25, dstar_E=1.5, beta_tun=0.15,
                 phi_FB=0.058, phi_OS=0.116)
    e.TYPED["beta_y"] = -0.8
    e.KAPPA_FIT.clear()
print(f"mode: {MODE} values")
P = e.Pitch
ok_all = []


def check(name, ok, detail=""):
    ok_all.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f": {detail}" if detail else ""), flush=True)


ars = [P("Fastball", "FB", 3, 3, 0.70, shape="ride", velo=85), P("Slider", "SL", 4, 3, 0.65, shape="tight", velo=77),
       P("Changeup", "CH", 3, 3, 0.60, shape="fade", velo=77)]
by = {x.name: x for x in ars}
s0 = e.Situation(0, 0, 0, (False, False, False), level="college_d3")
tab = e.solve_table(ars, s0)

# 1. Setup
s01 = replace(s0, balls=0, strikes=1)
on = e.root_call(ars, s01, tab)[0]
off = e.root_call(ars, s01, tab, look_value=False)[0]
fbup = lambda pi: sum(v for (n, q), v in pi.items() if n == "Fastball" and q.startswith("up"))
check("1a setup: fastball-up share at 0-1 higher with look value on", fbup(on) > fbup(off),
      f"on {fbup(on):.4f} vs off {fbup(off):.4f}")
s02 = replace(s0, balls=0, strikes=2)
la = e.look_update(tab.h0, by["Fastball"], "up-away", s0)
lb = e.look_update(tab.h0, by["Slider"], "down-away", s0)
ca = e.root_call(ars, replace(s02, last=("Fastball", "up-away", "foul"), look=la), tab)[2]
cb = e.root_call(ars, replace(s02, last=("Slider", "down-away", "foul"), look=lb), tab)[2]
key = ("Slider", "down-away")
check("1b setup: 0-2 slider down-away costs less after a fastball up than after a slider",
      key in ca and key in cb and ca[key] < cb[key], f"{ca.get(key, float('nan')):.4f} vs {cb.get(key, float('nan')):.4f}")

# 3. Big spot halves every pair term (eye level, tunnel, repeat; and timing B)
sb_no = replace(s0, balls=1, strikes=1, inning=5, margin=1, bases=(False, True, False), last=("Fastball", "up-away", "whiff"),
                look=(85.0, 3.1))
sb_big = replace(sb_no, inning=8)
okp = True
for p in ars:
    for q in e.QUADS:
        a = e.pair_terms(p, q, sb_no, ars); b = e.pair_terms(p, q, sb_big, ars)
        okp &= abs(b[0] - 0.5 * a[0]) < 1e-12 and abs(b[1] - 0.5 * a[1]) < 1e-12
check("3a big spot: eye level, tunnel and repeat terms halved", okp and e.is_big_spot(sb_big) and not e.is_big_spot(sb_no))
vs = 85.0
tb_no = [e.RHO_L.get(sb_no.level, 1.0) * e.timing_B(p, q, sb_no, vs) for p in ars for q in e.QUADS]
# the halving of B happens inside outcome_probs; check its whiff effect through a zero-sit-difference comparison
with e.flags(timing_B=False):
    w0n = e.outcome_probs(by["Changeup"], "down-away", sb_no, ars, sit=("pure", "Fastball", "up"))["whiff"]
    w0b = e.outcome_probs(by["Changeup"], "down-away", sb_big, ars, sit=("pure", "Fastball", "up"))["whiff"]
w1n = e.outcome_probs(by["Changeup"], "down-away", sb_no, ars, sit=("pure", "Fastball", "up"))["whiff"]
w1b = e.outcome_probs(by["Changeup"], "down-away", sb_big, ars, sit=("pure", "Fastball", "up"))["whiff"]
check("3b big spot: timing B's whiff effect smaller in a big spot", 0 < (w1b - w0b) < (w1n - w0n),
      f"big {w1b - w0b:+.4f} vs normal {w1n - w0n:+.4f}")

# 4. Repeat after a whiff raises the same pitch's share versus no whiff
s11 = replace(s0, balls=1, strikes=1)
pw = e.root_call(ars, replace(s11, last=("Slider", "down-away", "whiff"), look=lb), tab)[0]
pn = e.root_call(ars, replace(s11, last=("Slider", "down-away", "ball"), look=lb), tab)[0]
sl = lambda pi: sum(v for (n, q), v in pi.items() if n == "Slider")
check("4 repeat: slider share after a slider whiff above after a slider ball", sl(pw) > sl(pn), f"{sl(pw):.3f} vs {sl(pn):.3f}")

# 5. Timing B
ch = P("Changeup", "CH", 3, 3, 0.6, velo=77)
vt = 77 / 0.91          # changeup 9% slower than v-tilde (look and sit both at v-tilde)
B = e.timing_B(ch, "up-away", replace(s0, look=(vt, 2.5)), vt)
check("5a a changeup 9% slower than v-tilde gets B = 1", abs(B - 1) < 1e-12, f"B = {B:.4f}")
fb = by["Fastball"]
vfb = e.speed_today(fb, s0)
Bs = [e.timing_B(fb, q, replace(s0, look=(vfb, 2.5)), vfb) for q in e.QUADS]
check("5b v-tilde = v_FB: the fastball at every target gets B = 0", max(Bs) == 0.0, f"max B {max(Bs)}")

print(f"{sum(ok_all)}/{len(ok_all)} step 6 scenario checks passed")
