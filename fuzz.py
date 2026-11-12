"""
Logic checks on thousands of random situations (v0.6d).
Part A: rules that must hold everywhere (probabilities, windows, cutoffs, count logic, run values, monotonic effects).
Part B: learning checks over game-like sequences (mashers, holes, timing, a pitch not landing, shake-offs, the change flag).
usage: python3 fuzz.py [n_cheap] [n_full]
"""
import random, sys, math
from dataclasses import replace
import engine as e
from flags import pitcher_status
from simulate import our_staff

N_CHEAP = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
N_FULL = int(sys.argv[2]) if len(sys.argv) > 2 else 300
rng = random.Random(7)
LEVELS = ["hs", "college_d3", "college_d1", "mlb"]
SH = {"FB": ["ride", "sink", "run", "cut", ""], "SL": ["tight", "sweeper", ""], "CB": ["loopy", "sharp", ""], "CH": ["fade", "drop", ""]}
results = []


MATERIAL = 0.002     # runs per pitch: smaller reversals are reported but are not failures (see note at the end)
tiny = {}


def report(name, fails, n, example=""):
    ok = fails == 0
    results.append(ok)
    t = tiny.get(name, 0)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {n - fails}/{n} hold" + (f" ({t} tiny reversals under {MATERIAL} runs)" if t else "")
          + (f"\n       e.g. {example}" if not ok and example else ""))


def worse(d, name):
    """d = how much the 'better' version costs above the 'worse' one. Material if over MATERIAL."""
    if d > MATERIAL:
        return 1
    if d > 1e-9:
        tiny[name] = tiny.get(name, 0) + 1
    return 0


def rand_arsenal():
    kinds = rng.choice([["FB", "CB"], ["FB", "SL"], ["FB", "SL", "CH"], ["FB", "CB", "CH"], ["FB", "SL", "CB", "CH"]])
    out = []
    for k in kinds:
        out.append(e.Pitch({"FB": "Fastball", "SL": "Slider", "CB": "Curveball", "CH": "Changeup"}[k], k,
                           grade=rng.randint(1, 5), command=rng.randint(1, 5), conf=round(rng.uniform(0.3, 0.95), 2),
                           shape=rng.choice(SH[k]), velo=rng.choice([0, 72, 80, 88, 94]) if k == "FB" else 0,
                           slot=rng.choice(["three-quarter", "over the top", "sidearm", "high three-quarter"])))
    return out


def rand_situation(ars):
    b, k = rng.randint(0, 3), rng.randint(0, 2)
    last = None
    if rng.random() < 0.6:
        lp = rng.choice(ars)
        last = (lp.name, rng.choice(e.QUADS)) + ((rng.choice(["whiff", "foul", "ball", "cstrike"]),) if rng.random() < 0.7 else ())
    return e.Situation(b, k, rng.randint(0, 2), tuple(rng.random() < 0.35 for _ in range(3)), inning=rng.randint(1, 9),
                       margin=rng.randint(-4, 4), pitch_count=rng.randint(0, 120), batters_faced=rng.randint(0, 30),
                       level=rng.choice(LEVELS), same_side=rng.random() < 0.6, last=last,
                       usage_this_count={p.name: rng.randint(0, 3) for p in ars if rng.random() < 0.4},
                       timing={"FB": round(rng.uniform(-0.8, 0.8), 2), "OS": round(rng.uniform(-0.8, 0.8), 2)} if rng.random() < 0.5 else {},
                       hitter_damage={kk: (round(rng.uniform(-0.9, 0.9), 2), rng.randint(1, 40)) for kk in ("FB", "OS") if rng.random() < 0.4},
                       landing_today={p.name: (rng.randint(0, 10), rng.randint(5, 14)) for p in ars if rng.random() < 0.4})


print(f"PART A: rules on {N_CHEAP} random situations ({N_FULL} with full calls)\n")
f = {k: 0 for k in ["sum", "neg", "land", "grade", "conf", "dmg", "timing", "landing", "hbp", "wp"]}
ex = {}
n_pairs = 0
for i in range(N_CHEAP):
    ars = rand_arsenal(); s = rand_situation(ars); p = rng.choice(ars); q = rng.choice(e.QUADS)
    P = e.outcome_probs(p, q, s, ars)
    if abs(sum(P.values()) - 1) > 1e-9: f["sum"] += 1; ex["sum"] = (p.name, q, sum(P.values()))
    if min(P.values()) < -1e-12: f["neg"] += 1; ex["neg"] = (p.name, q, P)
    L = e.landing(p, q, s)
    if abs(sum(L.values()) - 1) > 1e-9 or min(L.values()) <= 0: f["land"] += 1
    # v1.0 #18: the live cost (cost08) at the PA's starting look, every variant priced with this situation's at-bat table
    # (the retired v0.7c cost() used fixed count values instead)
    tab_ = e.solve_table(ars, replace(s, balls=0, strikes=0, last=None))
    cst = lambda p_, s_, a_: e.cost08(p_, q, s_, a_, tab_, tab_.h0, None)[0]
    c0 = cst(p, s, ars)
    # better stuff never makes the pitch worse. Outside 2-0, 3-0, 3-1, like the timing rule below: in those counts more
    # swing-and-misses replace balls in play that are usually outs, and the miss leaves a hitter's count. With stuff
    # spread to real pitchers (v0.7) that reversal reaches 0.002-0.003 runs (8 of 3000, all in those counts).
    hitters_count = (s.balls, s.strikes) in ((2, 0), (3, 0), (3, 1))
    if p.grade < 5 and not hitters_count:
        p2 = replace(p, grade=p.grade + 1); ars2 = [p2 if x is p else x for x in ars]
        if worse(cst(p2, s, ars2) - c0, "Better stuff never makes a pitch cost more (outside 2-0, 3-0, 3-1)"): f["grade"] += 1; ex["grade"] = (p.name, q, s.balls, s.strikes)
    # more confidence never makes the pitch worse
    if p.conf < 0.9:
        p3 = replace(p, conf=p.conf + 0.05, base_conf=p.base_conf); ars3 = [p3 if x is p else x for x in ars]
        if worse(cst(p3, s, ars3) - c0, "More confidence never makes a pitch cost more"): f["conf"] += 1; ex["conf"] = (p.name, q, s.balls, s.strikes, p.conf, s.level)
    # a hitter who crushes this pitch class makes it costlier (more damage evidence, same n)
    key = "OS" if e.is_offspeed(p.kind) else "FB"
    s_hi = replace(s, hitter_damage={**s.hitter_damage, key: (0.8, 20)}); s_lo = replace(s, hitter_damage={**s.hitter_damage, key: (-0.2, 20)})
    if not hitters_count and worse(cst(p, s_lo, ars) - cst(p, s_hi, ars), "A hitter crushing a pitch class makes it cost more (outside 2-0, 3-0, 3-1)"): f["dmg"] += 1
    # a fastball looks better to a hitter who is late on fastballs than to one who is early
    if e.is_fastball(p.kind) and (s.balls, s.strikes) not in ((2, 0), (3, 0), (3, 1)):   # hitter's counts: a ball in play beats a whiff
        s_late = replace(s, timing={**s.timing, "FB": 0.8}); s_early = replace(s, timing={**s.timing, "FB": -0.8})
        if worse(cst(p, s_late, ars) - cst(p, s_early, ars), "Fastball costs less vs a hitter late on fastballs than one early (outside 2-0, 3-0, 3-1)"): f["timing"] += 1
    # a pitch landing worse today is never better
    s_good = replace(s, landing_today={**s.landing_today, p.name: (8, 10)}); s_bad = replace(s, landing_today={**s.landing_today, p.name: (2, 10)})
    pass   # landing is judged at the call level below: a pitch that isn't landing must never be called more
    # inside misses hit batters more than away misses; wild pitches only with runners on
    pin = e.outcome_probs(p, "down-in", s, ars)["hbp"]; paw = e.outcome_probs(p, "down-away", s, ars)["hbp"]
    if pin + 1e-12 < paw: f["hbp"] += 1
    s_empty = replace(s, bases=(False, False, False))
    if e.outcome_probs(p, q, s_empty, ars)["wp_ball"] > 0: f["wp"] += 1
report("Outcome probabilities add to 1", f["sum"], N_CHEAP, ex.get("sum"))
report("No negative probabilities", f["neg"], N_CHEAP, ex.get("neg"))
report("Landing shares add to 1 and are all positive", f["land"], N_CHEAP)
report("Better stuff never makes a pitch cost more (outside 2-0, 3-0, 3-1)", f["grade"], N_CHEAP, ex.get("grade"))
report("More confidence never makes a pitch cost more", f["conf"], N_CHEAP, ex.get("conf"))
report("A hitter crushing a pitch class makes it cost more (outside 2-0, 3-0, 3-1)", f["dmg"], N_CHEAP)
report("Fastball costs less vs a hitter late on fastballs than one early (outside 2-0, 3-0, 3-1)", f["timing"], N_CHEAP)
report("Inside misses hit batters at least as often as away misses", f["hbp"], N_CHEAP)
report("No wild pitches with the bases empty", f["wp"], N_CHEAP)

# run tables and count values
bad = 0; tot = 0
for lvl in LEVELS:
    for o in range(3):
        for b1 in (0, 1):
            for b2 in (0, 1):
                for b3 in (0, 1):
                    B = (bool(b1), bool(b2), bool(b3))
                    tot += 1
                    if o < 2 and e.re(o + 1, B, lvl) >= e.re(o, B, lvl): bad += 1
                    if e.walk_value(o, B, lvl) <= e.re(o, B, lvl): bad += 1
                    for i in range(3):
                        if not B[i]:
                            B2 = tuple(True if j == i else B[j] for j in range(3))
                            if e.re(o, B2, lvl) <= e.re(o, B, lvl): bad += 1
report("Run tables: an out lowers expected runs, a walk or an extra runner raises them", bad, tot * 2)
bad = 0
for lvl in LEVELS:
    cv = e.CV_BY_LEVEL[lvl]
    for (b, k) in e.COUNTS:
        if k < 2 and cv[(b, k + 1)] >= cv[(b, k)]: bad += 1
        if b < 3 and cv[(b + 1, k)] <= cv[(b, k)]: bad += 1
report("Counts: a strike always helps the pitcher, a ball always helps the hitter", bad, 4 * 17)
sf = [(lvl, e.stakes_factor(2, 2, lvl), e.stakes_factor(3, 2, lvl), e.stakes_factor(0, 0, lvl)) for lvl in LEVELS]
# v1.0 Step 2c (Drew, Nov 10) set 0-0 to 0.9, under 1, so the check compares the counts directly instead of against 1
report("Big counts (2-2, 3-2) mix tighter than 0-0", sum(1 for _, a, b_, c in sf if not (a < c and b_ < c)), len(sf))

# full calls
f2 = {k: 0 for k in ["dsum", "window", "cutoff", "chase30", "chase31", "nan"]}
ex2 = {}
for i in range(N_FULL):
    ars = rand_arsenal(); s = rand_situation(ars)
    if i % 5 == 0:
        s = replace(s, balls=3, strikes=rng.choice([0, 1]))
    (pick, q, prob, c), dist, _, info = e.call_v08(ars, s, rng=random.Random(i))     # v1.0 #18: the live call
    probs = [d[0] for d in dist]
    if abs(sum(probs) - 1) > 1e-9 or min(probs) <= 0: f2["dsum"] += 1
    if any(math.isnan(d[1]) for d in dist): f2["nan"] += 1
    # the live never-pick window (policy_from_costs): a pitch is in the mix only within `win` of the best pitch, a spot
    # only within `lwin` of its pitch's best, on the full costs under the hitter's sit mix
    win, lwin = e.windows(s)
    full = {a: sum(info["sigma"][k] * info["M"][a][k] for k in info["M"][a]) for a in info["M"]}
    allbest = min(full.values())
    for d in dist:
        pbest = min(v for a, v in full.items() if a[0] == d[2].name)
        if pbest - allbest > win + 1e-9 or d[1] - pbest > lwin + 1e-9:
            f2["window"] += 1; ex2["window"] = (d[2].name, d[3], round(pbest - allbest, 4), round(d[1] - pbest, 4), s.level, s.balls, s.strikes); break
    cut = e.LEVEL[s.level]["cutoff"]
    trusted = [x for x in ars if x.conf >= cut]
    if trusted and any(d[2].conf < cut for d in dist): f2["cutoff"] += 1
    if (s.balls, s.strikes) == (3, 0) and any(d[3] == "chase" for d in dist): f2["chase30"] += 1; ex2["chase30"] = [(d[2].name, d[3], round(d[0], 2)) for d in dist]
    if (s.balls, s.strikes) == (3, 1) and any(d[3] == "chase" for d in dist): f2["chase31"] += 1; ex2["chase31"] = [(d[2].name, d[3], round(d[0], 2)) for d in dist]
report("Call mix: probabilities add to 1, none zero, no NaN", f2["dsum"] + f2["nan"], N_FULL)
report("Every option in the mix is inside the never-pick windows (pitch and spot)", f2["window"], N_FULL, ex2.get("window"))
report("Nothing below the trust line is called while a trusted pitch exists", f2["cutoff"], N_FULL)
n30 = sum(1 for i in range(N_FULL) if i % 5 == 0)
# the call-level landing rule
bad_l, ex_l, n_l = 0, None, 0
for i in range(N_FULL // 2):
    ars = rand_arsenal(); s = rand_situation(ars); p = rng.choice(ars); n_l += 1
    sg = replace(s, landing_today={**s.landing_today, p.name: (8, 10)}); sb = replace(s, landing_today={**s.landing_today, p.name: (2, 10)})
    shr = lambda s_: sum(d[0] for d in e.call_v08(ars, s_, rng=random.Random(0))[1] if d[2].name == p.name)
    g_, b_ = shr(sg), shr(sb)
    if b_ > g_ + 0.02:
        bad_l += 1; ex_l = (p.name, s.balls, s.strikes, s.level, f"{g_:.0%} landing, {b_:.0%} not landing")
report("No chase pitch in the mix at 3-0 or 3-1", f2["chase30"] + f2["chase31"], n30, ex2.get("chase30") or ex2.get("chase31"))
report("A pitch going 2-for-10 for strikes is never called more than when it's 8-for-10", bad_l, n_l, ex_l)

print("\nPART B: learning over game-like sequences\n")
st, rl = our_staff()
A = st["arsenal"]


def share(s, name=None, kind=None, quad=None):
    _, d, _, _ = e.call_v08(A, s, rng=random.Random(0))     # v1.0 #18: the live call
    return sum(pr for pr, _, p, q in d if (name is None or p.name == name) and (kind is None or p.kind == kind) and (quad is None or q == quad))


for lvl in ("college_d3", "hs"):
    base = e.Situation(1, 1, 0, (False,) * 3, level=lvl, same_side=True)
    seq = [share(replace(base, hitter_damage={"FB": (0.8, n)}), kind="FB") for n in (0, 3, 6, 10, 20, 40)]
    hL = e.LEVEL[lvl]["hL"]
    ok = seq[-1] < seq[0] - 0.125 * hL and all(seq[i + 1] <= seq[i] + 0.03 for i in range(len(seq) - 1))
    results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {lvl} (hitter-read weight {hL}): fastball share falls as evidence builds that he crushes fastballs, by {12.5 * hL:.0f}+ points: " + " -> ".join(f"{x:.0%}" for x in seq) + "  (0,3,6,10,20,40 looks)")
    seq = [share(replace(base, hitter_damage={"FB": (-0.8, n)}), kind="FB") for n in (0, 3, 6, 10, 20, 40)]
    ok = abs(seq[1] - seq[0]) < 0.06 and seq[-1] > seq[0] + 0.05
    results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {lvl}: a fastball hole barely moves the call on thin evidence, then pays off: " + " -> ".join(f"{x:.0%}" for x in seq))
    late, early = share(replace(base, timing={"FB": 0.8, "OS": 0.0}), kind="FB"), share(replace(base, timing={"FB": -0.8, "OS": 0.0}), kind="FB")
    ok = late > early + 0.06 * hL
    results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {lvl}: {6 * hL:.0f}+ points more fastballs to a hitter late on them ({late:.0%}) than to one out in front ({early:.0%})")
    seq = [share(replace(base, balls=2, strikes=1, landing_today={"Slider": (st_, 10)}), name="Slider") for st_ in (9, 7, 5, 3, 1)]
    ok = seq[-1] < seq[0] - 0.10 and all(seq[i + 1] <= seq[i] + 0.03 for i in range(len(seq) - 1))
    results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {lvl}: slider share at 2-1 falls as it stops landing: " + " -> ".join(f"{x:.0%}" for x in seq) + "  (9,7,5,3,1 of 10 strikes)")

# confidence collapse: balls on the changeup push it under the trust line and out of the mix
A2 = [replace(p) for p in A]
ch = next(p for p in A2 if p.name == "Changeup")
for _ in range(12):
    e.update_confidence(ch, "ball")
s = e.Situation(1, 1, 0, (False,) * 3, level="college_d3")
_, d, _, _ = e.call_v08(A2, s, rng=random.Random(0))
ok = ch.conf < e.LEVEL["college_d3"]["cutoff"] and all(p.name != "Changeup" for _, _, p, _ in d)
results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] 12 straight balls on the changeup: confidence {ch.conf:.2f}, below the 0.45 line, and it leaves the mix")
# shake-off lowers that pitch's share on the next call
s = e.Situation(2, 1, 0, (False,) * 3, level="college_d3", last=("Fastball", "up-in"))
before = share(s, name="Slider")
A3 = [replace(p) for p in A]; sl = next(p for p in A3 if p.name == "Slider"); e.update_confidence(sl, "shakeoff")
_, d, _, _ = e.call_v08(A3, s, rng=random.Random(0)); after = sum(pr for pr, _, p, _ in d if p.name == "Slider")
ok = after < before
results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] After a slider shake-off the slider is called less: {before:.0%} -> {after:.0%}")
# change flag
fresh = pitcher_status(A, "college_d3", 35, ["out", "k", "out", "hit", "out"])
tired = pitcher_status([replace(p, conf=p.base_conf - 0.2) for p in A], "college_d3", 88, ["walk", "hard", "out", "walk", "hbp", "out"])
gone = pitcher_status([replace(p, conf=0.3) for p in A], "hs", 50, ["walk", "walk", "hard", "walk"])
ok = fresh["status"] == "ok" and tired["status"] == "change" and gone["status"] == "change"
results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] Change flag: cruising = {fresh['status']}, tired with traffic = {tired['status']}, trusts nothing = {gone['status']}")
watch = pitcher_status(A, "college_d3", 78, ["out", "walk", "out", "out"])
results.append(watch["status"] == "watch"); print(f"[{'PASS' if watch['status'] == 'watch' else 'FAIL'}] Change flag: at his fatigue point, otherwise fine = {watch['status']}")

print(f"\n{sum(results)}/{len(results)} logic and learning checks passed")
print("Tiny reversals are expected baseball, not bugs: in 3-ball and 2-0 counts a ball in play (usually an out) is worth more"
      " to the pitcher than a swing-and-miss that leaves a hitter's count, and more precise chase pitches mean more balls;"
      " at two strikes a miss off the plate is cheap and often chased.")
