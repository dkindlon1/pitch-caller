"""V1.3 audit regression checks (Nov 27-28): the call-policy rules Drew ruled on after the V1.3 audit, checked on the
final call (call_v08's mix), across levels, counts and arsenals. Python only; golden_v13core pins Python = JS.
  python3 tests_audit_v13.py"""
import random, sys
from dataclasses import replace
import engine as e
from engine import Pitch, Situation

E3 = (False,) * 3
P = lambda n, k, g, c, cf, sh, v: Pitch(n, k, grade=g, command=c, conf=cf, shape=sh, velo=v)
AVG3 = [P("Fastball", "FB", 3, 3, 0.80, "ride", 86), P("Slider", "SL", 3, 3, 0.75, "tight", 78),
        P("Changeup", "CH", 3, 3, 0.65, "fade", 78)]
FBCB = [P("Fastball", "FB", 3, 3, 0.80, "ride", 84), P("Curveball", "CB", 3, 3, 0.70, "12-6", 70)]
FOUR = AVG3 + [P("Curveball", "CB", 3, 2, 0.60, "12-6", 72)]
COUNTS = [(b, k) for b in range(4) for k in range(3)]
fails = 0
checks = 0


def check(ok, msg):
    global fails, checks
    checks += 1
    print(("[PASS] " if ok else "[FAIL] ") + msg, flush=True)
    if not ok:
        fails += 1


def shares(ars, s, tab, exclude=None):
    _, d, _, _ = e.call_v08(ars, s, rng=random.Random(0), tab=tab, exclude=exclude or [])
    out = {}
    for pr, _, p, q in d:
        out[p.name] = out.get(p.name, 0.0) + pr
    return out


def fbw(ars, sh):
    return sum(v for n, v in sh.items() if e.is_fastball(next(x for x in ars if x.name == n).kind))


# 1. HS / travel: the fastball never sits under its floor table, and gets 72% at 2-0 and 3-1 whenever it's allowed and
#    not under his expectation today (no landing data here, so always)
worst = []
for lvl in ("hs", "travel"):
    for name, ars in (("AVG3", AVG3), ("FB/CB", FBCB), ("FOUR", FOUR)):
        for side in (True, False):
            s0 = Situation(0, 0, 1, E3, inning=4, level=lvl, same_side=side, pitch_count=40, batters_faced=10)
            tab = e.solve_table(ars, s0)
            for b, k in COUNTS:
                s = replace(s0, balls=b, strikes=k)
                w = fbw(ars, shares(ars, s, tab))
                need = max(e.fb_floor(s), 0.72 if (b, k) in ((2, 0), (3, 1)) else 0.0)
                if w < need - 1e-9:
                    worst.append(f"{lvl} {name} {'same' if side else 'opp'} {b}-{k}: FB {w:.3f} < {need:.3f}")
check(not worst, f"HS/travel fastball >= its floor table everywhere and >= 72% at 2-0/3-1 ({len(worst)} misses: {worst[:3]})")

# 2. college: the best pitch gets 72% at 2-0 / 3-1 when it's the fastball, 50% otherwise; 50% at 2-1 (no hot reads)
low = []
for lvl in ("college_d1", "college_d2", "college_d3"):
    for name, ars in (("AVG3", AVG3), ("FOUR", FOUR)):
        for side in (True, False):
            for bases in (E3, (True, False, False)):
                s0 = Situation(0, 0, 1, bases, inning=4, level=lvl, same_side=side, pitch_count=40, batters_faced=10)
                tab = e.solve_table(ars, s0)
                for (b, k) in ((2, 0), (2, 1), (3, 1)):
                    sh = shares(ars, replace(s0, balls=b, strikes=k), tab)
                    top = max(sh.values())
                    if top < 0.50 - 1e-9:
                        low.append(f"{lvl} {name} {b}-{k}: top {top:.3f}")
check(not low, f"college hitter's counts: the top pitch type is >= 50% in every cell ({len(low)} misses: {low[:3]})")

# 3. the hot cap holds on the final call: a hot pitch gains at most HOT_CAP over the same call without the read
over = []
for lvl in ("hs", "college_d3", "college_d1"):
    for hot, ars in (("Slider", AVG3), ("Curveball", FBCB)):
        lt = {hot: (8, 10), "Fastball": (10, 15)}
        s_hot = Situation(0, 0, 1, E3, inning=4, level=lvl, pitch_count=45, batters_faced=11, landing_today=lt)
        s_off = replace(s_hot, landing_today={hot: (6, 10), "Fastball": (10, 15)})   # same pitch count, not hot
        t_hot, t_off = e.solve_table(ars, s_hot), e.solve_table(ars, s_off)
        for b, k in COUNTS:
            g = shares(ars, replace(s_hot, balls=b, strikes=k), t_hot).get(hot, 0.0)
            e._HOT_OFF[0] = True
            try:
                g0 = shares(ars, replace(s_hot, balls=b, strikes=k), t_hot).get(hot, 0.0)
            finally:
                e._HOT_OFF[0] = False
            if g - g0 > e.HOT_CAP + 1e-9:
                over.append(f"{lvl} {hot} {b}-{k}: +{(g - g0) * 100:.1f}")
check(not over, f"hot gain <= HOT_CAP ({e.HOT_CAP}) on the final call at HS, D3, D1, every count ({len(over)} over: {over[:3]})")

# 4. shake-offs: the pitch shaken on the last sign is never the very next call while another pitch is left
bad = []
for lvl in ("hs", "college_d3"):
    for name, ars in (("AVG3", AVG3), ("FB/CB", FBCB)):
        names = [x.name for x in ars]
        s0 = Situation(0, 0, 1, E3, inning=4, level=lvl, pitch_count=40, batters_faced=10)
        tab = e.solve_table(ars, s0)
        seqs = [[names[0]], names[:], names[::-1], [names[0], names[1], names[0]]]
        for seq in seqs:
            for b, k in ((0, 0), (1, 2), (3, 2), (3, 1)):
                sh = shares(ars, replace(s0, balls=b, strikes=k), tab, exclude=list(seq))
                twice = {n for n in names if seq.count(n) >= 2}
                if any(n not in twice and n != seq[-1] for n in names) and sh.get(seq[-1], 0.0) > 0.0:
                    bad.append(f"{lvl} {name} shakes {seq} {b}-{k}: {seq[-1]} {sh[seq[-1]]:.2f}")
check(not bad, f"the last-shaken pitch is never the next call while another is left ({len(bad)} misses: {bad[:3]})")

print(f"{checks - fails}/{checks} checks passed")
sys.exit(1 if fails else 0)
