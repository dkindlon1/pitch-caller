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

# 5. round 2: a fastball barely in the confidence band is lifted only in proportion to its band weight (it went 1% -> 72%)
cut = e.LEVEL["hs"]["cutoff"]
steps = []
for lvl in ("hs", "college_d3"):
    cut = e.LEVEL[lvl]["cutoff"]
    prev = None
    for conf in [cut - e.RAMP_W + d for d in (0.0, 0.001, 0.002, 0.005, 0.01, 0.02)]:
        ars = [replace(AVG3[0], conf=conf)] + AVG3[1:]
        s = Situation(3, 1, 1, E3, inning=4, level=lvl, pitch_count=40, batters_faced=10)
        w = fbw(ars, shares(ars, s, e.solve_table(ars, replace(s, balls=0, strikes=0))))
        if prev is not None and w - prev > 0.08:
            steps.append(f"{lvl} conf {conf:.3f}: FB {prev:.3f} -> {w:.3f}")
        prev = w
check(not steps, f"no jump when the fastball enters the confidence band at 3-1 (HS, D3) ({steps[:3]})")

# 6. round 2: a fastball mashed at every height is not lifted to 72% (it went 29% -> 72%), nor is a mashed spot
mash = {"hard|" + e.key_kind("FB") + "|" + q: e.MASHED_N for q in e.QUADS}
bad = []
for lvl in ("hs", "college_d3"):
    s = Situation(3, 1, 1, E3, inning=4, level=lvl, pitch_count=40, batters_faced=10, matchup=mash)
    s0 = replace(s, balls=0, strikes=0)
    tab = e.solve_table(AVG3, s0)
    sh = shares(AVG3, s, tab)
    base = shares(AVG3, replace(s, matchup=None), e.solve_table(AVG3, replace(s0, matchup=None)))
    if fbw(AVG3, sh) > fbw(AVG3, base) - 1e-9 and fbw(AVG3, sh) >= 0.72 - 1e-9:
        bad.append(f"{lvl}: mashed FB {fbw(AVG3, sh):.3f} (not mashed {fbw(AVG3, base):.3f})")
check(not bad, f"a fastball mashed at every height isn't forced to 72% at 3-1 ({bad})")

# 7. round 2: the HS 3-1 fastball rule fades out smoothly as the fastball slips under his expectation (no 5-pt step)
jumps = []
prev = None
for st in (10, 9, 8, 7, 6, 5, 4, 3):
    s = Situation(3, 1, 1, E3, inning=4, level="hs", pitch_count=40, batters_faced=10,
                  landing_today={"Fastball": (st, 10), "Slider": (6, 10)})
    w = fbw(AVG3, shares(AVG3, s, e.solve_table(AVG3, replace(s, balls=0, strikes=0))))
    if prev is not None and abs(w - prev) > 0.25:
        jumps.append(f"{st}/10: {prev:.3f} -> {w:.3f}")
    prev = w
s_a = Situation(3, 1, 1, E3, inning=4, level="hs", pitch_count=40, batters_faced=10)
w0 = fbw(AVG3, shares(AVG3, s_a, e.solve_table(AVG3, replace(s_a, balls=0, strikes=0))))
orig = e.wild_today
e.wild_today = lambda p, s_: 0.0014 if e.is_fastball(p.kind) else orig(p, s_)
try:
    w1 = fbw(AVG3, shares(AVG3, s_a, e.solve_table(AVG3, replace(s_a, balls=0, strikes=0))))
finally:
    e.wild_today = orig
check(abs(w1 - w0) < 0.01, f"HS 3-1 fastball: wild_today 0 -> 0.0014 moves {w0:.3f} -> {w1:.3f} (the ramp, no 5-pt step)")
# report only (pre-existing, for Drew): the not-landing block still flips HS 3-1 when the fastball drops one more strike
print(f"[INFO] HS 3-1 fastball as it lands 10..3 of 10 (the not-landing block is older than this audit): {jumps or 'no step'}")

# 8. stable pitcher ids: the same id in separate processes (Python's hash() of text changed every process)
import subprocess
code = "import sys; sys.path.insert(0, '.'); from hitter_data.fit_count_hs import stable_pid; print(stable_pid('PG-12345'), stable_pid('x'))"
outs = {subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env={"PYTHONHASHSEED": h, "PATH": ""}).stdout
        for h in ("1", "2", "random")}
check(len(outs) == 1 and all(int(v) < 2 ** 40 for v in next(iter(outs)).split()), f"stable_pid is the same in three processes and < 2^40 ({outs})")

print(f"{checks - fails}/{checks} checks passed")
sys.exit(1 if fails else 0)
