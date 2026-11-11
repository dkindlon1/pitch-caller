"""v1.0 Step 5 (Drew, Nov 11; review #2): fit "is it landing today" to real data. Statcast, 2024 train / 2025 held out,
game-clustered bootstrap, ship only on held-out gain > 2 boot SD (seq_fit.py's rule).

The engine (Step 3): for each pitch, a record (strikes, expected strikes, pitches) of this pitcher's earlier pitches of
that type today; est = (strikes - expected) / (LAND_K + n); wildness today wt = clip(-LAND_GAIN * est, -0.3, +0.6); wt
moves the landing shares, so the strike chance moves by about -c * wt (c from the engine, measured below).

The data question: does a pitcher's strike rate on a pitch type earlier in this game, against his own expectation, predict
his strike chance on the next pitch of that type, and how much?
  strike   = anything but a ball (called strike, swinging strike, foul, ball in play); HBP and pitchouts dropped.
  expected = his strike rate on that pitch type this season, leaving this game out, moved by league count offsets
             (logit; 12 count terms fitted on 2024).
  model    logit P(strike) = logit(expected) + beta * (st - ex) / (K + n)   over earlier pitches of the type today (n >= 1)
K is chosen on 2024 log likelihood (grid), beta fitted on 2024; held-out gain on 2025 vs beta = 0.
Then LAND_GAIN = e(1-e) * beta / c (same strike-chance slope as the data at small est), and binned 2025 deviations show
whether the effect keeps growing at the ends (the caps).
usage (repo root): python3 readthrough/v10_landing_fit.py -> results/v10/landing_fit.json and .txt"""
import json, math, os, sys
from collections import defaultdict
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import seq_fit as S

OUT = os.path.join(ROOT, "results", "v10")
lines = []
BALL = {"ball", "blocked_ball", "pitchout", "automatic_ball"}


def say(*a):
    t = " ".join(str(x) for x in a)
    print(t, flush=True)
    lines.append(t)


def logit(p):
    return math.log(p / (1 - p))


def newton_offsets(y, off, groups, ng, iters=30):
    """logit P = off + a[group]; returns a (MLE per group)."""
    a = np.zeros(ng)
    for _ in range(iters):
        eta = off + a[groups]
        p = 1 / (1 + np.exp(-eta))
        g = np.bincount(groups, y - p, ng)
        h = np.bincount(groups, p * (1 - p), ng) + 1e-9
        step = g / h
        a += step
        if np.max(np.abs(step)) < 1e-9:
            break
    return a


def fit_beta(y, off, x, iters=50):
    b = 0.0
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(off + b * x)))
        g = np.sum((y - p) * x)
        h = np.sum(p * (1 - p) * x * x) + 1e-12
        b += g / h
        if abs(g / h) < 1e-10:
            break
    return b


def ll(y, p):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return float(np.sum(y * np.log(p) + (1 - y) * np.log(1 - p)))


def engine_c():
    """The engine's strike-chance slope in wt at wt = 0 (and the curve), averaged over targets and levels, for an average
    pitcher. Returns (c, rows)."""
    import engine as e
    out, slopes = [], []
    for lvl in ("hs", "college_d3", "college_d1"):
        for kind, nm, sh in (("FB", "Fastball", "ride"), ("SL", "Slider", "tight"), ("CH", "Changeup", "fade")):
            ars = [e.Pitch("Fastball", "FB", grade=3, command=3, conf=.8, shape="ride", velo=86),
                   e.Pitch("Slider", "SL", grade=3, command=3, conf=.75, shape="tight", velo=78),
                   e.Pitch("Changeup", "CH", grade=3, command=3, conf=.65, shape="fade", velo=78)]
            p = next(x for x in ars if x.name == nm)
            for q in ("up-in", "up-away", "down-in", "down-away", "middle"):
                s = e.Situation(1, 1, 1, (False,) * 3, level=lvl)
                pr = lambda wt: 1 - sum(e.outcome_probs(p, q, e.replace(s, wild_true={p.name: wt} if wt else {"__none__": 0.0}), ars)[k]
                                        for k in ("ball", "wp_ball", "hbp"))
                base = pr(0.0)
                curve = {wt: pr(wt) - base for wt in (-0.3, -0.15, 0.15, 0.3, 0.6)}
                slopes.append(-(pr(0.02) - pr(-0.02)) / 0.04)
                out.append((lvl, kind, q, base, curve))
    return float(np.mean(slopes)), out


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = [r for r in S.load() if r["desc"] not in ("hit_by_pitch", "pitchout")]
    y_all = np.array([0.0 if r["desc"] in BALL else 1.0 for r in rows])
    # leave-this-game-out season rate per (year, pitcher, pitch type)
    tot = defaultdict(lambda: [0.0, 0]); gam = defaultdict(lambda: [0.0, 0])
    for r, y in zip(rows, y_all):
        k = (r["yr"], r["pit"], r["pt"])
        tot[k][0] += y; tot[k][1] += 1
        gk = k + (r["g"],)
        gam[gk][0] += y; gam[gk][1] += 1
    LEAGUE = {yv: float(np.mean([y for r, y in zip(rows, y_all) if r["yr"] == yv])) for yv in (2024, 2025)}
    PRIOR_N = 30.0         # shrink thin pitcher x type rates toward the league rate
    rate = np.zeros(len(rows))
    for i, r in enumerate(rows):
        k = (r["yr"], r["pit"], r["pt"])
        st, n = tot[k][0] - gam[k + (r["g"],)][0], tot[k][1] - gam[k + (r["g"],)][1]
        rate[i] = (st + PRIOR_N * LEAGUE[r["yr"]]) / (n + PRIOR_N)
    yr = np.array([r["yr"] for r in rows])
    cnt = np.array([r["b"] * 3 + r["k"] for r in rows])
    gid = np.array([r["g"] for r in rows])
    base_off = np.log(rate / (1 - rate))
    tr, te = yr == 2024, yr == 2025
    a = newton_offsets(y_all[tr], base_off[tr], cnt[tr], 12)
    off = base_off + a[cnt]
    exp_p = 1 / (1 + np.exp(-off))
    say(f"Statcast pitches {len(rows)} (train {int(tr.sum())}, test {int(te.sum())}); strike rate 2024 {LEAGUE[2024]:.3f}, "
        f"2025 {LEAGUE[2025]:.3f}; count offsets (logit) " + ", ".join(f"{b}-{k} {a[b * 3 + k]:+.2f}" for b in range(4) for k in range(3)))
    # in-game record per (game, pitcher, pitch type), before this pitch
    st_ = np.zeros(len(rows)); ex_ = np.zeros(len(rows)); n_ = np.zeros(len(rows))
    rec = defaultdict(lambda: [0.0, 0.0, 0])
    for i, r in enumerate(rows):
        k = (r["g"], r["pit"], r["pt"])
        st_[i], ex_[i], n_[i] = rec[k]
        rec[k][0] += y_all[i]; rec[k][1] += exp_p[i]; rec[k][2] += 1
    has = n_ >= 1
    say(f"pitches with an earlier same-type pitch today: {int(has.sum())} ({has.mean():.0%})")
    # check the expectation is calibrated where there's no history
    for m, nm in ((tr & ~has, "train, first of type"), (te & ~has, "test, first of type"), (te & has, "test, with history")):
        say(f"  calibration {nm}: observed {y_all[m].mean():.4f} vs expected {exp_p[m].mean():.4f}")
    res = {}
    grid = (0.0, 1.0, 2.0, 5.0, 10.0, 20.0, 40.0, 80.0)
    best = None
    say("\nK grid (2024 log likelihood gain over beta = 0, pitches with history)")
    m = tr & has
    ll0 = ll(y_all[m], exp_p[m])
    for K in grid:
        x = (st_ - ex_) / (K + n_)
        b = fit_beta(y_all[m], off[m], x[m])
        g = ll(y_all[m], 1 / (1 + np.exp(-(off[m] + b * x[m])))) - ll0
        say(f"  K {K:5.1f}: beta {b:+.3f}, train gain {g:.2f}")
        res[f"K{K}"] = dict(beta=b, train_gain=g)
        if best is None or g > best[2]:
            best = (K, b, g)
    K, b, _ = best
    x = (st_ - ex_) / (K + n_)
    mt = te & has
    p0 = exp_p[mt]
    p1 = 1 / (1 + np.exp(-(off[mt] + b * x[mt])))
    gain, sd = S.boot_gain(y_all[mt], p0, p1, gid[mt])
    ship = bool(gain > 2 * sd)
    say(f"\nchosen K {K} (train), beta {b:+.4f}; 2025 held-out gain {gain:.2e} (boot sd {sd:.2e}, {gain / sd:+.1f} sd) -> "
        f"{'SHIP' if ship else 'no ship'}")
    # beta's game-clustered bootstrap interval on train
    rng = np.random.default_rng(3)
    gm = gid[m]; ug = np.unique(gm); pos = defaultdict(list)
    for j, g_ in enumerate(gm):
        pos[g_].append(j)
    xm, ym, om = x[m], y_all[m], off[m]
    bs = []
    for _ in range(200):
        pick = np.concatenate([pos[g_] for g_ in rng.choice(ug, len(ug))])
        bs.append(fit_beta(ym[pick], om[pick], xm[pick]))
    lo, hi = np.percentile(bs, [2.5, 97.5])
    say(f"beta 95% game-clustered bootstrap (train): {lo:+.3f} to {hi:+.3f}")
    # binned held-out deviations by the engine's est
    say("\n2025 by the record's est (K chosen): observed minus expected strike rate, and the model's")
    bins = [-1, -0.25, -0.15, -0.08, -0.03, 0.03, 0.08, 0.15, 0.25, 1]
    tab = []
    for lo_, hi_ in zip(bins[:-1], bins[1:]):
        mm = mt.copy(); mm[mt] = (x[mt] >= lo_) & (x[mt] < hi_)
        if mm.sum() < 200:
            continue
        o = float(y_all[mm].mean() - exp_p[mm].mean())
        pm = float((1 / (1 + np.exp(-(off[mm] + b * x[mm])))).mean() - exp_p[mm].mean())
        tab.append(dict(lo=lo_, hi=hi_, n=int(mm.sum()), est=float(x[mm].mean()), obs=o, model=pm))
        say(f"  est {lo_:+.2f}..{hi_:+.2f}: n {int(mm.sum()):6d}, mean est {x[mm].mean():+.3f}, observed {o:+.4f}, model {pm:+.4f}")
    # report only: two slopes (landing better vs missing), same K; held-out gain over the one-slope model
    xp, xn = np.maximum(x, 0), np.minimum(x, 0)
    bp, bn = 0.0, 0.0
    for _ in range(60):
        pp = 1 / (1 + np.exp(-(off[m] + bp * xp[m] + bn * xn[m])))
        g = np.array([np.sum((y_all[m] - pp) * xp[m]), np.sum((y_all[m] - pp) * xn[m])])
        w_ = pp * (1 - pp)
        H = np.array([[np.sum(w_ * xp[m] ** 2), 0.0], [0.0, np.sum(w_ * xn[m] ** 2)]]) + 1e-12
        st = np.linalg.solve(H, g); bp += st[0]; bn += st[1]
        if np.max(np.abs(st)) < 1e-10:
            break
    p2 = 1 / (1 + np.exp(-(off[mt] + bp * xp[mt] + bn * xn[mt])))
    g2, sd2 = S.boot_gain(y_all[mt], p1, p2, gid[mt])
    say(f"\nreport only, two slopes: landing better {bp:+.3f}, missing {bn:+.3f}; held-out gain over one slope {g2:.2e} "
        f"(boot sd {sd2:.2e}, {g2 / sd2:+.1f} sd)")
    res["two_slopes"] = dict(better=bp, missing=bn, gain_over_one=float(g2), sd=float(sd2))
    e_ = float(exp_p[mt].mean())
    c, curve = engine_c()
    gain_eng = e_ * (1 - e_) * b / c
    say(f"\nengine: strike-chance slope c = {c:.3f} per unit wt at wt 0 (average over 45 cells); league e = {e_:.3f}")
    say(f"implied LAND_GAIN = e(1-e) * beta / c = {gain_eng:.2f} (shipped 4.0); LAND_K = {K} (shipped 5.0)")
    mc = {wt: float(np.mean([cv[wt] for *_, cv in curve])) for wt in (-0.3, -0.15, 0.15, 0.3, 0.6)}
    say("engine strike-chance change by wt (mean of cells): " + ", ".join(f"wt {k:+.2f}: {v:+.4f}" for k, v in mc.items()))
    res.update(chosen=dict(K=K, beta=b, beta_ci=[float(lo), float(hi)], test_gain=float(gain), test_sd=float(sd), ship=ship,
                           engine_c=c, league_e=e_, implied_gain=gain_eng, engine_curve=mc), bins=tab, count_offsets=a.tolist())
    json.dump(res, open(os.path.join(OUT, "landing_fit.json"), "w"), indent=1)
    open(os.path.join(OUT, "landing_fit.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
