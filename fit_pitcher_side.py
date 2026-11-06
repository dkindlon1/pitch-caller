"""v1.0 Phase 4: refit the pitcher-side terms at the v1.0 call mix and write pitcher_side_params.py (loaded by engine.py
after outcome_params). Levels hs, college_d3, college_d1 (travel copies hs, college copies college_d1; MLB unchanged).
  4a  the level hbp scale (HBP_LOC ratios kept) so HBP per batter matches calib.RV[level]['HBP'], with the engine's targets
      within each pitch replaced by real target usage u_L (mix_prior.json): how risky is inside if college pitchers go
      inside as often as real pitchers do. Sensitivity: the same with the inside shares x 0.7.
  4b  with hbp fixed, the level `wild` so walks per batter match calib.RV[level]['BB'], at the engine's own v1.0 mix.
  4c  one multiplier per level on the wild-pitch chances (off-speed 0.12, fastball 0.04, ratio kept) so wild pitches per
      batter in simulated games (simulate.py, 30 games per level, fixed seeds) match data/pitcher_lines_2026.csv
      (D1 0.0209, D3 0.0274). Rescale and repeat twice. hs has no target and keeps its constants.
Strikeouts are reported, not fitted (hitter model): a move of more than 1.0 point from the target is flagged.
The evaluator is calib.evaluate copied with one change: plate appearances are played with the v1.0 call (call_v08 on a
table solved at the PA start), not call_mixed. Same lineups (calib.population) and staff. calib.py itself is not edited.
usage (repo root): python3 fit_pitcher_side.py [--round N] [--skip-wp] [--jobs 4] [--wp-ratio R]"""
import concurrent.futures as cf, csv, json, os, pprint, subprocess, sys, time
from collections import defaultdict
from dataclasses import replace

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
os.chdir(ROOT)
import engine
from engine import Situation, outcome_probs, OUTCOME_ADJ, IN_PLAY_BY_LEVEL
import calib                                     # lineups and staff (importing it fits nothing and writes nothing)
import simulate

LEVELS = ("hs", "college_d3", "college_d1")
WP_TARGET = {"college_d1": 0.0209, "college_d3": 0.0274}
TOL = {"BB": 0.003, "HBP": 0.002, "WP": 0.003}
PARAMS = os.path.join(ROOT, "pitcher_side_params.py")
COUNTS = calib.COUNTS
INSIDE = ("up-in", "down-in")


class Half:
    def random(self):
        return 0.5


def call_dists(level):
    """The v1.0 call in every count, per staff member and side: [(share, pitch, target)]. One table per plate appearance
    (bases empty, no outs, pitch count 40, 9 batters faced, as calib), reused across counts like the app."""
    out = {}
    for who in calib.STAFF:
        ars = who["arsenal"]
        for same in (True, False):
            s0 = Situation(0, 0, 0, (False, False, False), level=level, same_side=same, pitch_count=40, batters_faced=9)
            tab = engine.solve_table(ars, s0)
            for c in COUNTS:
                s = replace(s0, balls=c[0], strikes=c[1], look=tab.h0)
                s = replace(s, b_h=engine.lean_b_h(ars, s))
                _, dist, _, _ = engine.call_v08(ars, s, rng=Half(), tab=tab)
                out[(who["name"], same, c)] = [(pr, p, q) for pr, _, p, q in dist]
    return out


def real_targets(dists, level, inside_mult=1.0):
    """4a: keep the engine's pitch-type shares, spread each pitch over the allowed targets by real usage u_L (inside
    shares x inside_mult, renormalized)."""
    out = {}
    for (name, same, c), d in dists.items():
        by = {}
        for pr, p, q in d:
            by.setdefault(p.name, [0.0, p])
            by[p.name][0] += pr
        allowed = engine.targets(*c)
        new = []
        for n, (pn, p) in by.items():
            ul = engine.MIX_PRIOR["u_L"][p.kind][f"{c[0]}-{c[1]}"]["same" if same else "opp"]
            w = {q: ul[q] * (inside_mult if q in INSIDE else 1.0) for q in allowed}
            t = sum(w.values())
            new += [(pn * w[q] / t, p, q) for q in allowed]
        out[(name, same, c)] = new
    return out


def evaluate(level, dists):
    """calib.evaluate's exact plate-appearance chain against calib's hidden hitters, with the given call distributions."""
    tot = defaultdict(float)
    pa_tot = defaultdict(float)
    for (who, w) in zip(calib.STAFF, calib.STAFF_W):
        ars = who["arsenal"]
        for same in (True, False):
            hs = [h for h in calib.HITTERS if (h["hand"] == who["hand"]) == same]
            if not hs:
                continue
            ws = w * len(hs) / len(calib.HITTERS)
            for h in hs:
                reach = defaultdict(float)
                reach[(0, 0)] = 1.0
                pa = defaultdict(float)
                for c in sorted(COUNTS, key=lambda c: c[0] + c[1]):
                    r = reach[c]
                    if r <= 0:
                        continue
                    s = Situation(c[0], c[1], 0, (False, False, False), level=level, same_side=same,
                                  pitch_count=40, batters_faced=9)
                    simulate.CURRENT_OFF.clear(); simulate.CURRENT_OFF.update(h["_off"][who["name"]])
                    ts = simulate.true_situation(s, h)
                    P = defaultdict(float)
                    for pr, p, q in dists[(who["name"], same, c)]:
                        for k_, v in outcome_probs(p, q, ts, ars).items():
                            P[k_] += pr * v
                    b, k = c
                    loop = P["foul"] if k == 2 else 0.0
                    visits = r / (1 - loop)
                    tot["pitches"] += ws / len(hs) * visits
                    balls = visits * (P["ball"] + P["wp_ball"])
                    strikes = visits * (P["cstrike"] + P["whiff"])
                    fouls = visits * P["foul"] if k < 2 else 0.0
                    pa["hbp"] += visits * P["hbp"]
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
    return {"K": pa_tot["k"], "BB": pa_tot["bb"], "HBP": pa_tot["hbp"], "pitches_per_PA": tot["pitches"]}


def solve1(f, lo, hi, target, tol=1e-6, it=60):
    """Bisection for f(x) = target on [lo, hi], f increasing."""
    flo, fhi = f(lo), f(hi)
    if not (flo <= target <= fhi):
        return (lo if target < flo else hi), False
    for _ in range(it):
        mid = (lo + hi) / 2
        if f(mid) < target:
            lo = mid
        else:
            hi = mid
        if hi - lo < tol:
            break
    return (lo + hi) / 2, True


def fit_hbp(level, inside_mult=1.0, rounds=4):
    """4a: rounds of (engine pitch-type shares at the current hbp -> hbp that hits the target with them fixed)."""
    target = calib.RV[level]["HBP"]
    hist = []
    for _ in range(rounds):
        mix = real_targets(call_dists(level), level, inside_mult)

        def f(x):
            OUTCOME_ADJ[level]["hbp"] = x
            return evaluate(level, mix)["HBP"]
        old = OUTCOME_ADJ[level]["hbp"]
        x, ok = solve1(f, 0.0, 0.5, target)
        OUTCOME_ADJ[level]["hbp"] = x
        hist.append(round(x, 5))
        if not ok or abs(x - old) < 1e-3:
            break
    return x, ok, hist


def fit_wild(level, rounds=4):
    """4b: rounds of (the engine's own v1.0 mix at the current wild -> wild that hits the walk target with it fixed)."""
    target = calib.RV[level]["BB"]
    hist = []
    for _ in range(rounds):
        mix = call_dists(level)

        def f(x):
            OUTCOME_ADJ[level]["wild"] = x
            return evaluate(level, mix)["BB"]
        old = OUTCOME_ADJ[level]["wild"]
        x, ok = solve1(f, -0.5, 0.7, target)
        OUTCOME_ADJ[level]["wild"] = x
        hist.append(round(x, 5))
        if not ok or abs(x - old) < 1e-3:
            break
    return x, ok, hist


def load_params():
    try:
        ns = {}
        exec(open(PARAMS).read(), ns)
        return ns["PITCHER_SIDE"]
    except FileNotFoundError:
        return {lv: dict(hbp=OUTCOME_ADJ[lv]["hbp"], wild=OUTCOME_ADJ[lv]["wild"], wp_os=engine.WP_DEFAULT[0],
                         wp_fb=engine.WP_DEFAULT[1]) for lv in LEVELS}


def write_params(ps, note):
    body = pprint.pformat({lv: {k: round(v, 5) for k, v in d.items()} for lv, d in ps.items()}, width=100, sort_dicts=True)
    open(PARAMS, "w").write(f'"""Generated by fit_pitcher_side.py (v1.0 Phase 4). {note}\nPITCHER_SIDE[level]: hbp (level scale on '
                            f'HBP_LOC), wild (level wildness), wp_os / wp_fb (wild-pitch chance per non-competitive ball with '
                            f'runners on).\ntravel copies hs, college copies college_d1 (engine.py)."""\nPITCHER_SIDE = {body}\n')


WP_STAFFS = ["two_pitch", "default", "four_pitch"]
WP_SEEDS = range(201, 211)


def _one_game(args):
    level, staff, seed, out = args
    code = ("import simulate, io, contextlib\n"
            "with contextlib.redirect_stdout(io.StringIO()): simulate.run(%d, %r)\n" % (seed, out))
    r = subprocess.run([sys.executable, "-c", code], cwd=ROOT, env=dict(os.environ, LEVEL=level, STAFF=staff),
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip().splitlines()[-1])
    n, wp = 0, 0
    for row in csv.DictReader(open(out)):
        d = row.get("detail", "")
        wp += "wild pitch" in d
        n += ("WALK" in d) or ("STRIKEOUT" in d) or ("HIT BY PITCH" in d) or row["result"] in ("weak", "solid", "hard")
    return level, n, wp


def sim_wp(levels, tag, jobs):
    """Wild pitches per batter in 30 simulated games per level (3 staffs x 10 seeds), with the params file as written."""
    d = os.path.join(ROOT, "runs", "pitcher_side", tag)
    os.makedirs(d, exist_ok=True)
    todo = [(lv, st, sd, os.path.join(d, f"{lv}_{st}_s{sd}.csv")) for lv in levels for st in WP_STAFFS for sd in WP_SEEDS]
    agg = {lv: [0, 0] for lv in levels}
    with cf.ThreadPoolExecutor(jobs) as ex:
        for lv, n, wp in ex.map(_one_game, todo):
            agg[lv][0] += n
            agg[lv][1] += wp
    return {lv: (wp / n if n else 0.0, n, wp) for lv, (n, wp) in agg.items()}


def main():
    rnd = int(sys.argv[sys.argv.index("--round") + 1]) if "--round" in sys.argv else 1
    jobs = int(sys.argv[sys.argv.index("--jobs") + 1]) if "--jobs" in sys.argv else 4
    ratio = float(sys.argv[sys.argv.index("--wp-ratio") + 1]) if "--wp-ratio" in sys.argv else None
    global PARAMS
    t0 = time.time()
    ps = load_params()
    start = json.loads(json.dumps(ps))
    rep = {"round": rnd, "kappa_T": engine.KAPPA_T, "kappa_L": engine.KAPPA_L, "guard_type": engine.GUARD_TYPE,
           "start": start, "levels": {}}
    lines = [f"Phase 4 round {rnd} (KAPPA_T {engine.KAPPA_T}, KAPPA_L {engine.KAPPA_L}, GUARD_TYPE {engine.GUARD_TYPE})"]
    for lv in LEVELS:
        OUTCOME_ADJ[lv]["hbp"], OUTCOME_ADJ[lv]["wild"] = ps[lv]["hbp"], ps[lv]["wild"]
        engine.WP_RATE[lv] = (ps[lv]["wp_os"], ps[lv]["wp_fb"])
    if ratio:
        # sensitivity: off-speed:fastball ratio R, the wild-pitch scale refit; 4a/4b and pitcher_side_params.py untouched
        PARAMS = os.path.join(ROOT, "results", f"pitcher_side_params_ratio{ratio:g}.py")
        os.environ["PC_PITCHER_SIDE"] = PARAMS
        lines[0] += f" | sensitivity: wild-pitch off-speed:fastball ratio {ratio:g}:1"
        for lv in WP_TARGET:
            tot = ps[lv]["wp_os"] + ps[lv]["wp_fb"]
            ps[lv]["wp_os"], ps[lv]["wp_fb"] = tot * ratio / (ratio + 1), tot / (ratio + 1)
    else:
        for lv in LEVELS:
            before = evaluate(lv, call_dists(lv))
            # 4a, then its sensitivity (from the same start), then 4b
            h0 = OUTCOME_ADJ[lv]["hbp"]
            hbp_s, ok_s, hist_s = fit_hbp(lv, inside_mult=0.7)
            OUTCOME_ADJ[lv]["hbp"] = h0
            hbp, ok_h, hist_h = fit_hbp(lv)
            wild, ok_w, hist_w = fit_wild(lv)
            after = evaluate(lv, call_dists(lv))
            tg = calib.RV[lv]
            ps[lv]["hbp"], ps[lv]["wild"] = hbp, wild
            rec = dict(before=before, after=after, target={k: tg[k] for k in ("K", "BB", "HBP")}, hbp=hbp, hbp_hist=hist_h,
                       hbp_sens_inside07=hbp_s, hbp_sens_hist=hist_s, wild=wild, wild_hist=hist_w,
                       converged=dict(hbp=ok_h, hbp_sens=ok_s, wild=ok_w), k_drift=after["K"] - tg["K"])
            rep["levels"][lv] = rec
            lines.append(f"{lv}: hbp {start[lv]['hbp']:.4f} -> {hbp:.4f} (rounds {hist_h}; inside x0.7: {hbp_s:.4f}) | "
                         f"wild {start[lv]['wild']:.4f} -> {wild:.4f} (rounds {hist_w})")
            lines.append(f"   engine's own v1.0 mix: BB {after['BB']:.2%} (target {tg['BB']:.2%}), HBP {after['HBP']:.2%} "
                         f"(target {tg['HBP']:.2%}), K {after['K']:.2%} (target {tg['K']:.2%}, drift "
                         f"{100 * rec['k_drift']:+.2f} pts) | before: BB {before['BB']:.2%} HBP {before['HBP']:.2%} "
                         f"K {before['K']:.2%}")
            print(lines[-2] + "\n" + lines[-1], flush=True)
        write_params(ps, f"Round {rnd}: 4a/4b fitted; wild pitches from the previous round.")
    if "--skip-wp" not in sys.argv:
        hist = {lv: [] for lv in WP_TARGET}
        for it in range(3):           # simulate, rescale, and repeat twice
            write_params(ps, f"Round {rnd}: wild-pitch pass {it + 1}.")
            res = sim_wp(list(WP_TARGET), f"r{rnd}_{'ratio' + format(ratio, 'g') if ratio else 'fit'}_{it}", jobs)
            for lv, (rate, n, wp) in res.items():
                hist[lv].append(dict(wp_os=ps[lv]["wp_os"], wp_fb=ps[lv]["wp_fb"], rate=rate, batters=n, wp=wp))
                print(f"  wild pitches {lv} pass {it + 1}: {rate:.4f} per batter ({wp}/{n}) at wp_os {ps[lv]['wp_os']:.4f} "
                      f"wp_fb {ps[lv]['wp_fb']:.4f} (target {WP_TARGET[lv]:.4f})", flush=True)
                if it < 2 and rate > 0:
                    m = WP_TARGET[lv] / rate
                    ps[lv]["wp_os"] *= m
                    ps[lv]["wp_fb"] *= m
        rep["wp"] = hist              # the last pass was simulated with the values now in ps
        for lv in WP_TARGET:
            last = hist[lv][-1]
            lines.append(f"{lv}: wild pitches {last['rate']:.4f} per batter (target {WP_TARGET[lv]:.4f}, "
                         f"{'within' if abs(last['rate'] - WP_TARGET[lv]) <= TOL['WP'] else 'OUTSIDE'} +-0.3 pts) at wp_os "
                         f"{last['wp_os']:.4f}, wp_fb {last['wp_fb']:.4f}")
    write_params(ps, f"Round {rnd} final." + (f" Sensitivity: ratio {ratio:g}:1." if ratio else ""))
    rep["final"] = ps
    rep["seconds"] = round(time.time() - t0)
    tag = f"round{rnd}" + (f"_ratio{ratio:g}" if ratio else "")
    json.dump(rep, open(os.path.join(ROOT, "results", f"pitcher_side_{tag}.json"), "w"), indent=1, default=str)
    open(os.path.join(ROOT, "results", f"pitcher_side_{tag}.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"wrote {os.path.relpath(PARAMS, ROOT)} and results/pitcher_side_{tag}.* ({rep['seconds'] / 60:.1f} min)")


if __name__ == "__main__":
    main()
