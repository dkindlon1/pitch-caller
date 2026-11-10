"""v1.0 Phase 4: the pitcher-side fits. Writes pitcher_side_params.py, which engine.py loads AFTER outcome_params.

Three numbers per level, for hs, college_d3 and college_d1 (travel copies hs and college copies college_d1 in
engine.py, as everywhere else). MLB is not in this file.

  hbp   the level's hit-by-pitch scale, fitted at a REAL target mix (4a). This is what breaks root cause R3's loop.
        fit_all.py fits hbp at the mix the engine itself throws, and the engine barely goes inside, so inside looks
        as risky as the engine's own avoidance of it implies. 4a instead asks: if these pitchers went inside as often
        as real pitchers do (the u_L table from Phase 3.7), what scale reproduces the level's real HBP rate? The
        HBP_LOC ratios are kept; only the level scale moves.
  wild  the level's wildness, refitted for walks at the engine's own v1.0 mix with the new hbp in place (4b).
  wp    one multiplier on the wild-pitch constants, ratio kept, fitted against real wild pitches per batter from
        full simulated games, because wild pitches need runners on base (4c).

The evaluator is calib.evaluate, copied here as the plan requires, with one change: the targets inside each pitch can
be replaced by the real usage table (`force_ul`). The call itself is already the v1.0 call -- calib.py was ported to
call_v08 in Step 0c -- so nothing else needed changing. calib.py is not edited; its lineups and staff are imported, so
both scripts fit against the same population.

usage (repo root):
  python3 fit_pitcher_side.py                 # 4a and 4b, then 4c, then the sensitivities; writes the file
  python3 fit_pitcher_side.py --no-wp         # skip 4c (no simulated games); keeps the current wp multipliers
  python3 fit_pitcher_side.py --only hs       # one level
"""
import json, os, pprint, random, sys, time
from collections import defaultdict
from dataclasses import replace

import engine
from engine import Situation, call_v08, solve_table, outcome_probs, OUTCOME_ADJ, IN_PLAY_BY_LEVEL, targets
import calib
import simulate

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "pitcher_side_params.py")
LEVELS = ["hs", "college_d3", "college_d1"]
COUNTS = calib.COUNTS
TOL = {"BB": 0.003, "HBP": 0.002, "WP": 0.003}     # the plan's tolerances, per batter
INSIDE_Q = ("up-in", "down-in")
INSIDE_SCALE = 1.0                                 # --sens-hbp refits 4a at 0.7 (the plan's sensitivity)
WP_TARGET = {}                                      # filled from data/pitcher_lines_2026.csv
t0 = time.time()


def log(msg):
    print(f"[{time.time() - t0:5.0f}s] {msg}", flush=True)


# --------------------------------------------------------------------------------------------- the evaluator
def ul_dist(dist, ars, s):
    """4a: keep each pitch's share of the calls, but spread it over the targets the way real pitchers do.

    Not a reweighting of the targets the engine happened to keep -- that would change almost nothing, because the
    engine's own avoidance of inside is the thing being questioned. The share goes over every target the count
    allows, in the proportions of the 3.7 usage table.
    """
    _uT, uL = engine.mix_prior_tables(ars, s)
    if not uL:
        return dist
    qs = targets(s.balls, s.strikes)
    if INSIDE_SCALE != 1.0:          # 4a sensitivity: what if real pitchers went inside less than the table says
        uL = {k: (v * INSIDE_SCALE if k[1] in INSIDE_Q else v) for k, v in uL.items()}
    by_pitch = defaultdict(float)
    pitch_of = {}
    for pr, p, q in dist:
        by_pitch[p.name] += pr
        pitch_of[p.name] = p
    out = []
    for name, share in by_pitch.items():
        w = {q: uL.get((name, q), 0.0) for q in qs}
        t = sum(w.values())
        if t <= 0:
            out.extend((pr, p, q) for pr, p, q in dist if p.name == name)
            continue
        for q in qs:
            if w[q] > 0:
                out.append((share * w[q] / t, pitch_of[name], q))
    return out


def evaluate(level, force_ul=False, policy_cache=None):
    """calib.evaluate, copied per the plan, plus force_ul. Plays the plate appearance exactly -- no dice -- with the
    engine's own call in each count against the simulator's hidden hitters, through the count chain."""
    tot = defaultdict(float)
    pa_tot = defaultdict(float)
    for (who, w) in zip(calib.STAFF, calib.STAFF_W):
        ars = who["arsenal"]
        for same in (True, False):
            hs = [h for h in calib.HITTERS if (h["hand"] == who["hand"]) == same]
            if not hs:
                continue
            ws = w * len(hs) / len(calib.HITTERS)
            dists = {}
            tab0 = None                        # one PA table per (level, pitcher, side), solved at 0-0 and reused
            for c in COUNTS:
                key = (level, who["name"], same, c, force_ul)
                if policy_cache is not None and key in policy_cache:
                    dists[c] = policy_cache[key]
                    continue
                s = Situation(c[0], c[1], 0, (False, False, False), level=level, same_side=same,
                              pitch_count=40, batters_faced=9)
                if tab0 is None:
                    tab0 = solve_table(ars, replace(s, balls=0, strikes=0, last=None))
                _, dist, _, _ = call_v08(ars, s, rng=random.Random(0), tab=tab0)
                d = [(pr, p, q) for pr, _, p, q in dist]
                dists[c] = ul_dist(d, ars, s) if force_ul else d
                if policy_cache is not None:
                    policy_cache[key] = dists[c]
            for h in hs:
                reach = defaultdict(float)
                reach[(0, 0)] = 1.0
                pa = defaultdict(float)
                st = defaultdict(float)
                for c in sorted(COUNTS, key=lambda c: c[0] + c[1]):
                    r = reach[c]
                    if r <= 0:
                        continue
                    s = Situation(c[0], c[1], 0, (False, False, False), level=level, same_side=same,
                                  pitch_count=40, batters_faced=9)
                    simulate.CURRENT_OFF.clear(); simulate.CURRENT_OFF.update(h["_off"][who["name"]])
                    ts = simulate.true_situation(s, h)
                    P = defaultdict(float)
                    for pr, p, q in dists[c]:
                        o = outcome_probs(p, q, ts, ars)
                        for k_, v in o.items():
                            P[k_] += pr * v
                    b, k = c
                    loop = P["foul"] if k == 2 else 0.0
                    visits = r / (1 - loop)
                    balls = visits * (P["ball"] + P["wp_ball"])
                    strikes = visits * (P["cstrike"] + P["whiff"])
                    fouls = visits * P["foul"] if k < 2 else 0.0
                    pa["hbp"] += visits * P["hbp"]
                    pa["pitches"] += visits
                    for ct in ("weak", "solid", "hard"):
                        pa[ct] += visits * P[ct]
                    if b == 3:
                        pa["bb"] += balls
                    else:
                        reach[(b + 1, k)] += balls
                    if k == 2:
                        pa["k"] += strikes
                    else:
                        reach[(b, k + 1)] += strikes + fouls
                for k_, v in pa.items():
                    pa_tot[k_] += ws / len(hs) * v
                for k_, v in st.items():
                    tot[k_] += ws / len(hs) * v
    hits = 0.0
    for ct in ("weak", "solid", "hard"):
        _po, p1, p2, p3, phr, _pe = IN_PLAY_BY_LEVEL[level][ct]
        hits += pa_tot[ct] * (p1 + p2 + p3 + phr)
    return {"K": pa_tot["k"], "BB": pa_tot["bb"], "HBP": pa_tot["hbp"], "H": hits,
            "pitches_per_PA": pa_tot["pitches"]}


# --------------------------------------------------------------------------------------------- scalar solving
def solve_scalar(f, target, x0, lo, hi, tol, label, max_iter=10):
    """A monotone one-dimensional solve: secant where it behaves, bisection where it does not. Reports every step.
    Returns (x, value, evals). Least squares would do, but one free number deserves one honest bracket."""
    xs, ys = [], []
    x = x0
    evals = 0
    for it in range(max_iter):
        y = f(x)
        evals += 1
        xs.append(x); ys.append(y)
        print(f"    {label}: x {x:+.5f} -> {y:.4%} (target {target:.4%})", flush=True)
        if abs(y - target) <= tol:
            return x, y, evals
        # bracket, then secant on the two closest points
        if len(xs) >= 2:
            order = sorted(range(len(xs)), key=lambda i: abs(ys[i] - target))
            i, j = order[0], order[1]
            if abs(ys[i] - ys[j]) > 1e-9:
                nx = xs[i] + (target - ys[i]) * (xs[j] - xs[i]) / (ys[j] - ys[i])
            else:
                nx = 0.5 * (xs[i] + xs[j])
        else:
            nx = x * 1.5 if y < target else x * 0.6
            if abs(nx - x) < 1e-6:
                nx = x + (0.05 if y < target else -0.05)
        x = min(hi, max(lo, nx))
        if any(abs(x - u) < 1e-7 for u in xs):
            break
    best = min(range(len(xs)), key=lambda i: abs(ys[i] - target))
    return xs[best], ys[best], evals


# --------------------------------------------------------------------------------------------- 4c: wild pitches
def wp_targets():
    """Real wild pitches per batter faced, from the 2026 college lines. hs has no target, so its constants stay."""
    import csv
    path = os.path.join(HERE, "data", "pitcher_lines_2026.csv")
    agg = defaultdict(lambda: [0.0, 0.0])
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            lvl = r.get("level")
            if lvl not in ("college_d1", "college_d3"):
                continue
            try:
                bf, wp = float(r["bf"]), float(r["wp"])
            except (TypeError, ValueError):
                continue
            agg[lvl][0] += wp
            agg[lvl][1] += bf
    return {lvl: (wp / bf) for lvl, (wp, bf) in agg.items() if bf > 0}


PA_END = ("WALK", "HIT BY PITCH", "STRIKEOUT", " contact: ")      # simulate.py sets pa_done exactly on these
# The plan says 30 games per level. That is not enough to fit against: 30 games is about 1,300 batters and about
# 30 wild pitches, so the Poisson noise on the rate is around +/- 0.005 per batter -- larger than the +/- 0.003
# tolerance it is being held to. Measured: at 30 games college_d1 read 0.0179 and at 90 games the same multiplier
# read 0.0228, a full standard deviation apart. 90 games halves the noise to +/- 0.0024, under the tolerance, so a
# pass means something. At 30 games neither level's gap from a multiplier of 1 was distinguishable from zero.
WP_GAMES, WP_SEED0, WP_JOBS = 90, 4101, 8


def sim_wp(level, games, seed0, tag, jobs=WP_JOBS):
    """Wild pitches per batter faced in full simulated games.

    It has to be games: a wild pitch needs a runner on base, which the exact plate-appearance math in evaluate() does
    not have. One subprocess per game with LEVEL in the environment, the way readthrough/run_games.py does it, because
    simulate.py reads its level at import -- which also means the games read pitcher_side_params.py off disk, so the
    file is written before each round.
    """
    import concurrent.futures as cf, csv as _csv, subprocess
    d = os.path.join(HERE, "runs", "pitcher_side", tag)
    os.makedirs(d, exist_ok=True)

    def one(g):
        seed = seed0 + g
        path = os.path.join(d, f"{level}_s{seed}.csv")
        code = ("import simulate, io, contextlib\n"
                "with contextlib.redirect_stdout(io.StringIO()): simulate.run(%d, %r)\n" % (seed, path))
        r = subprocess.run([sys.executable, "-c", code], cwd=HERE, capture_output=True, text=True,
                           env=dict(os.environ, LEVEL=level))
        if r.returncode != 0:
            raise RuntimeError(f"game {level} s{seed} failed: {r.stderr[-400:]}")
        return path

    with cf.ThreadPoolExecutor(jobs) as ex:
        paths = list(ex.map(one, range(games)))
    wp = bf = 0
    for path in paths:
        with open(path, newline="", encoding="utf-8-sig") as fh:
            for r in _csv.DictReader(fh):
                det = r.get("detail") or ""
                if "wild pitch" in det:
                    wp += 1
                if any(x in det for x in PA_END):
                    bf += 1
    return ((wp / bf) if bf else 0.0), wp, bf


def next_mult(hist, target):
    """The next multiplier to try, from everything measured so far.

    The plan says to rescale by target / measured, which assumes the rate is proportional to the multiplier. It is
    not: a wild pitch moves runners, which changes the states that produce the next one, so the response is steeper
    than proportional and a proportional rescale overshoots and then undershoots. With two measurements in hand a
    secant through them is both simpler and right, so proportional is used only for the very first step.
    """
    if len(hist) == 1:
        m, r = hist[0]
        return m * ((target / r) if r > 1e-6 else 2.0)
    a, b = sorted(hist, key=lambda x: abs(x[1] - target))[:2]
    if abs(a[1] - b[1]) < 1e-9:
        return 0.5 * (a[0] + b[0])
    return a[0] + (target - a[1]) * (b[0] - a[0]) / (b[1] - a[1])


def fit_wp(out, report, rounds=3):
    """4c: one multiplier per level on the wild-pitch constants, the off-speed:fastball ratio kept. Measure, adjust,
    repeat. hs has no real wild-pitch target, so its constants stay at 1.

    The value written is always one that was actually measured, never the last extrapolation -- 30 games is 1,300
    batters and about 25 wild pitches, so the measurement carries real Poisson noise and an unverified multiplier is
    not a fit.
    """
    tg = wp_targets()
    hist = {lvl: [] for lvl in ("college_d1", "college_d3")}
    log_rounds = []
    for rnd in range(rounds):
        save(out, report)                 # the subprocesses read the file, so it has to be on disk first
        row = {}
        for lvl in ("college_d1", "college_d3"):
            if hist[lvl] and abs(hist[lvl][-1][1] - tg[lvl]) <= TOL["WP"]:
                continue                  # already inside the tolerance; don't spend 30 more games confirming it
            rate, wp, bf = sim_wp(lvl, WP_GAMES, WP_SEED0, f"v10_r{rnd}")
            ok = abs(rate - tg[lvl]) <= TOL["WP"]
            log(f"4c {lvl} round {rnd + 1}: multiplier {out[lvl]['wp']:.3f} -> {wp} wild pitches in {bf} batters "
                f"= {rate:.4f} per batter (target {tg[lvl]:.4f}){' OK' if ok else ''}")
            hist[lvl].append((out[lvl]["wp"], rate))
            row[lvl] = {"mult": out[lvl]["wp"], "rate": rate, "wp": wp, "bf": bf, "target": tg[lvl], "ok": ok}
            if not ok and rnd < rounds - 1:
                out[lvl]["wp"] = round(min(4.0, max(0.1, next_mult(hist[lvl], tg[lvl]))), 4)
        log_rounds.append(row)
    for lvl, h in hist.items():
        if h:
            m, r = min(h, key=lambda x: abs(x[1] - tg[lvl]))
            out[lvl]["wp"] = m
            miss = abs(r - tg[lvl])
            log(f"4c {lvl}: multiplier {m:.4f}, measured {r:.4f} against {tg[lvl]:.4f} "
                f"({'inside' if miss <= TOL['WP'] else 'OUTSIDE'} the {TOL['WP']:.3f} tolerance)")
    report["4c"] = log_rounds
    return out


# --------------------------------------------------------------------------------------------- main
def main():
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    levels = [only] if only else LEVELS
    cur = {}
    try:
        from pitcher_side_params import PITCHER_SIDE as _p
        cur = {k: dict(v) for k, v in _p.items()}
    except ImportError:
        pass
    out = {lvl: dict(cur.get(lvl) or {}) for lvl in LEVELS}
    for lvl in LEVELS:
        out[lvl].setdefault("hbp", OUTCOME_ADJ[lvl]["hbp"])
        out[lvl].setdefault("wild", OUTCOME_ADJ[lvl]["wild"])
        out[lvl].setdefault("wp", 1.0)

    report = {}
    for lvl in levels:
        tgt = calib.RV[lvl]
        print(f"\n== {lvl} ==", flush=True)
        start = {"hbp": OUTCOME_ADJ[lvl]["hbp"], "wild": OUTCOME_ADJ[lvl]["wild"]}
        print(f"  starting from hbp {start['hbp']:+.4f}, wild {start['wild']:+.4f} "
              f"(fit_all.py's values on a first run, this file's on a rerun)", flush=True)
        hbp, wild = start["hbp"], start["wild"]
        for rnd in range(2):
            # calib.fit's discipline: the engine's calls are re-solved between rounds, because it adapts to the new
            # environment, and held fixed within a round, because a target that moves while you aim at it never lands
            cache = {}

            # 4a: hbp at the real target mix
            def f_hbp(x, _lvl=lvl, _c=cache):
                OUTCOME_ADJ[_lvl]["hbp"] = x
                return evaluate(_lvl, force_ul=True, policy_cache=_c)["HBP"]
            hbp, got_hbp, n1 = solve_scalar(f_hbp, tgt["HBP"], hbp, 0.0, 2.0, TOL["HBP"],
                                            f"4a {lvl} hbp (real target mix)")
            OUTCOME_ADJ[lvl]["hbp"] = hbp
            # 4b: wild for walks, at the engine's own mix
            def f_wild(x, _lvl=lvl, _c=cache):
                OUTCOME_ADJ[_lvl]["wild"] = x
                return evaluate(_lvl, policy_cache=_c)["BB"]
            wild, got_bb, n2 = solve_scalar(f_wild, tgt["BB"], wild, -1.0, 2.0, TOL["BB"],
                                            f"4b {lvl} wild (engine mix)")
            OUTCOME_ADJ[lvl]["wild"] = wild
            m = evaluate(lvl, policy_cache={})
            mu = evaluate(lvl, force_ul=True, policy_cache={})
            print(f"  round {rnd + 1}: hbp {hbp:+.4f} wild {wild:+.4f} | engine mix K {m['K']:.1%} BB {m['BB']:.1%} "
                  f"HBP {m['HBP']:.1%} | real mix HBP {mu['HBP']:.1%} | targets K {tgt['K']:.1%} BB {tgt['BB']:.1%} "
                  f"HBP {tgt['HBP']:.1%}", flush=True)
            report[lvl] = {"hbp": hbp, "wild": wild, "K": m["K"], "BB": m["BB"], "HBP": m["HBP"],
                           "HBP_real_mix": mu["HBP"], "evals": n1 + n2}
        out[lvl]["hbp"] = round(float(hbp), 5)
        out[lvl]["wild"] = round(float(wild), 5)
        # strikeouts are reported, never fitted: they belong to the hitter model
        d = report[lvl]["K"] - tgt["K"]
        print(f"  strikeouts {report[lvl]['K']:.1%} vs {tgt['K']:.1%} ({100 * d:+.1f} points)"
              f"{' -- OVER 1.0 POINT, record for the handoff and ask' if abs(d) > 0.01 else ''}", flush=True)

    # 4a sensitivity (the plan): refit hbp with the real inside shares cut to 0.7. Phase 5's bands have to pass at
    # this value too, so both are recorded. It asks what happens if the usage table overstates how often pitchers
    # really go inside -- the one input 4a leans on hardest.
    if "--sens-hbp" in sys.argv:
        global INSIDE_SCALE
        sens = {}
        for lvl in levels:
            INSIDE_SCALE = 0.7
            cache = {}

            def f(x, _lvl=lvl, _c=cache):
                OUTCOME_ADJ[_lvl]["hbp"] = x
                return evaluate(_lvl, force_ul=True, policy_cache=_c)["HBP"]
            x, y, _n = solve_scalar(f, calib.RV[lvl]["HBP"], out[lvl]["hbp"], 0.0, 2.0, TOL["HBP"],
                                    f"4a-sens {lvl} hbp (inside x 0.7)")
            sens[lvl] = round(float(x), 5)
            INSIDE_SCALE = 1.0
            OUTCOME_ADJ[lvl]["hbp"] = out[lvl]["hbp"]       # put the fitted value back
            log(f"4a sensitivity {lvl}: hbp {out[lvl]['hbp']:+.5f} at the real inside shares, {x:+.5f} at 0.7x "
                f"({100 * (x / out[lvl]['hbp'] - 1):+.0f}%)")
        report["4a_sensitivity_inside_0.7"] = sens

    if "--no-wp" in sys.argv:
        log("4c skipped (--no-wp); the wild-pitch multipliers keep their current values")
    else:
        fit_wp(out, report)

    save(out, report)
    print("\ndone", flush=True)


def save(out, report):
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write('"""Generated by fit_pitcher_side.py (v1.0 Phase 4). The pitcher-side numbers, by level.\n'
                'hbp: the hit-by-pitch scale, fitted at the real target mix (4a) -- see the script for why.\n'
                'wild: level wildness, refitted for walks at the engine\'s own v1.0 mix (4b).\n'
                'wp: one multiplier on the wild-pitch constants, ratio kept, from simulated games (4c).\n'
                'engine.py loads this AFTER outcome_params, so these win over fit_all.py for hbp and wild."""\n')
        f.write("PITCHER_SIDE = " + pprint.pformat({k: dict(v) for k, v in out.items()}, width=100) + "\n")
    print("wrote", OUT, flush=True)
    rp = os.path.join(HERE, "results", "fit_pitcher_side.json")
    os.makedirs(os.path.dirname(rp), exist_ok=True)
    json.dump({"fit": out, "report": report}, open(rp, "w", encoding="utf-8"), indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
