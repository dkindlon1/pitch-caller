"""v1.3 shared refits (plan section 4, prework Part 2.5): the inventory rows that are refit here.

Each fit keeps the shipped functional form (docs/HITTER_V13_INVENTORY.md) and refits only its number(s), on every fit
season on disk (<= 2025; hitter_data.assert_not_heldout on each), MLB + AAA + A pooled unless said otherwise, with the
recency weight of hitter_data.refit_load (halves every 2 seasons back from 2025). Uncertainty is a game-clustered
bootstrap (each game drawn with replacement; a row's weight is its recency weight times its game's draw count) or the
cluster-robust SE of the random-intercept fit.

  row 1   HIT_FIT["approach"]       research_v12/hitter_fits.py approach channel (prior-season tag -> next season's pitches)
  row 5   LAND_K, LAND_GAIN          readthrough/v10_landing_fit.py
  row 6   GEO_HBP_BANDS              research_v12/location_proxies.py band table
  B1      MM succ / hard             readthrough/step3_fits.py M1 / M2 (as in v10_memory_fit's no-damage rows)
  B2      SIDE                       readthrough/step5_inside_fit.py
  B3      POWER_HR                   readthrough/step4b_power_hr.py
  B12     HBP_LOC (check)            research_v12/fit_hbp_loc.py, target ratio on Single-A all seasons

usage (repo root): python3 -m hitter_data.refit [names...]   -> {DATA}/refit/<name>.json, refit/refit.txt
"""
import json
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from . import DATA, assert_not_heldout
from . import refit_load as L

OUT = os.path.join(DATA, "refit")
CLASS = {"FF": "FB", "SI": "FB", "FC": "FB", "SL": "SL", "ST": "SL", "SV": "SL", "CU": "CB", "KC": "CB", "CS": "CB",
         "CH": "CH", "FS": "CH", "FO": "CH"}
SWING = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play"}
WHIFF = {"swinging_strike", "swinging_strike_blocked"}
LEVEL_CODE = {"MLB": 1, "AAA": 2, "A": 3}
LOG = []


def say(*a):
    t = " ".join(str(x) for x in a)
    print(t, flush=True)
    LOG.append(t)


def check_seasons(df):
    for s in sorted(set(int(x) for x in df["season"].unique())):
        assert_not_heldout(s)
    return df


def describe(df):
    g = df.groupby(["level", "season"], observed=True).size()
    return {f"{lv} {s}": int(n) for (lv, s), n in g.items()}


# ------------------------------------------------------------------------------------------------ fitting helpers
def wlogit(X, y, w, l2=1e-6, it=60):
    """Weighted logistic MLE by Newton (no random effects)."""
    b = np.zeros(X.shape[1])
    for _ in range(it):
        p = 1 / (1 + np.exp(-(X @ b)))
        g = X.T @ (w * (y - p)) - l2 * b
        H = (X * (w * p * (1 - p))[:, None]).T @ X + l2 * np.eye(X.shape[1])
        st = np.linalg.solve(H, g)
        b += st
        if np.max(np.abs(st)) < 1e-9:
            break
    return b


def game_draws(gid, rng):
    """Bootstrap multiplicities per row: games drawn with replacement (gid = 0..G-1)."""
    G = int(gid.max()) + 1
    cnt = np.bincount(rng.integers(0, G, G), minlength=G).astype(float)
    return cnt[gid]


def wfit_re(X, y, w, pid, bid, gid, re_sd=0.25, maxiter=3000):
    """seq_fit.Fit.run with a per-row weight: logistic with pitcher and batter intercepts as MAP-penalized intercepts
    (prior SD re_sd), standardized fixed effects with a tiny ridge, cluster-robust (by game) SE in raw units.
    With w = 1 it is seq_fit.Fit.run exactly."""
    n, d = X.shape
    mu = np.average(X, axis=0, weights=w)
    sd = np.sqrt(np.average((X - mu) ** 2, axis=0, weights=w))
    sd[sd == 0] = 1
    Z = np.hstack([np.ones((n, 1)), (X - mu) / sd])
    npit, nbat = int(pid.max()) + 1, int(bid.max()) + 1
    lam = 1 / re_sd ** 2
    D = d + 1

    def fg(v):
        beta, up, ub = v[:D], v[D:D + npit], v[D + npit:]
        eta = Z @ beta + up[pid] + ub[bid]
        p = 1 / (1 + np.exp(-eta))
        ll = np.sum(w * (y * eta - np.logaddexp(0, eta)))
        res = w * (y - p)
        gb = Z.T @ res - 1e-4 * np.r_[0, beta[1:]]
        gp = np.bincount(pid, res, npit) - lam * up
        gu = np.bincount(bid, res, nbat) - lam * ub
        obj = -(ll - 0.5e-4 * beta[1:] @ beta[1:] - 0.5 * lam * (up @ up + ub @ ub))
        return obj, -np.r_[gb, gp, gu]

    v0 = np.zeros(D + npit + nbat)
    ym = np.average(y, weights=w)
    v0[0] = math.log(ym / (1 - ym))
    r = minimize(fg, v0, jac=True, method="L-BFGS-B", options=dict(maxiter=maxiter))
    beta, up, ub = r.x[:D], r.x[D:D + npit], r.x[D + npit:]
    eta = Z @ beta + up[pid] + ub[bid]
    p = 1 / (1 + np.exp(-eta))
    H = (Z * (w * p * (1 - p))[:, None]).T @ Z + 1e-4 * np.diag(np.r_[0, np.ones(D - 1)])
    S = Z * (w * (y - p))[:, None]
    Gm = np.zeros((int(gid.max()) + 1, D))
    np.add.at(Gm, gid, S)
    Hi = np.linalg.pinv(H)
    cov = Hi @ (Gm.T @ Gm) @ Hi
    return dict(b=beta[1:] / sd, se=np.sqrt(np.diag(cov)[1:]) / sd, n=n, converged=bool(r.success))


def ids(df):
    """Pitcher / batter / game indices; players keyed by (level, id) so a player's intercept is per level."""
    lc = df["level"].astype(str).map(LEVEL_CODE).values.astype(np.int64)
    pid = pd.factorize(df["pitcher"].values.astype(np.int64) * 10 + lc)[0]
    bid = pd.factorize(df["batter"].values.astype(np.int64) * 10 + lc)[0]
    gid = pd.factorize(df["game_pk"].values.astype(np.int64))[0]
    return pid, bid, gid


def sig3(x):
    if x == 0 or not np.isfinite(x):
        return x
    return float(f"{x:.3g}")


# ------------------------------------------------------------------------------------------------ row 6: HBP bands
HBP_BANDS_OLD = ((12.0, 0.003), (15.0, 0.0165), (18.0, 0.041), (21.0, 0.104), (24.0, 0.20), (27.0, 0.345), (30.0, 0.57))


def hbp_band_table(df, mult=None):
    """location_proxies.py's band table: HBP per pitch by where the pitch crossed (in. toward the batter from plate
    centre, 3-in. bands, +30 = 30 and beyond), recency-weighted. Returns {band: rate}."""
    w = df["w"].values * (1.0 if mult is None else mult)
    xb = df["xb"].values
    b = np.clip(np.floor(xb / 3) * 3, -30, 30)
    hit = df["hit"].values
    out = {}
    for lo, _ in HBP_BANDS_OLD:
        m = b == lo
        out[lo] = float(np.sum(w[m] * hit[m]) / max(np.sum(w[m]), 1e-12))
    return out


def hbp_frame(df):
    d = df[df["pitch_type"].isin(list(CLASS)) & df["plate_x"].notna() & df["stand"].isin(["R", "L"])]
    x = d["plate_x"].values.astype(float) * 12
    return pd.DataFrame(dict(xb=np.where(d["stand"].values == "L", x, -x), hit=(d["description"].fillna("") == "hit_by_pitch").values
                             .astype(float), w=d["w"].values, g=d["game_pk"].values, level=d["level"].astype(str).values))


def refit_hbp_bands(df, B=200, seed=6):
    f = hbp_frame(df)
    gid = pd.factorize(f["g"])[0]
    rng = np.random.default_rng(seed)
    pooled = hbp_band_table(f)
    boots = np.array([[v for v in hbp_band_table(f, game_draws(gid, rng)).values()] for _ in range(B)])
    se = boots.std(0)
    per_level = {lv: hbp_band_table(f[f["level"] == lv]) for lv in L.LEVELS}
    n_band = {lo: int(((np.clip(np.floor(f["xb"] / 3) * 3, -30, 30)) == lo).sum()) for lo, _ in HBP_BANDS_OLD}
    new = tuple((lo, sig3(pooled[lo])) for lo, _ in HBP_BANDS_OLD)
    say("\n== row 6 GEO_HBP_BANDS (HBP per pitch by crossing band; pooled MLB+AAA+A, recency-weighted)")
    say(f"  pitches {len(f):,}")
    for (lo, old), (_, nv), s in zip(HBP_BANDS_OLD, new, se):
        say(f"  +{lo:.0f} in: old {old}  new {nv}  (boot SE {s:.4f}; n {n_band[lo]:,})  by level " +
            ", ".join(f"{lv} {per_level[lv][lo]:.4f}" for lv in L.LEVELS))
    # shape check: each level's curve relative to its own +24 band
    shape = {lv: {lo: per_level[lv][lo] / max(per_level[lv][24.0], 1e-9) for lo, _ in HBP_BANDS_OLD} for lv in L.LEVELS}
    say("  shape (rate / rate at +24): " + " | ".join(lv + " " + " ".join(f"{shape[lv][lo]:.2f}" for lo, _ in HBP_BANDS_OLD)
                                                   for lv in L.LEVELS))
    return dict(old=[list(x) for x in HBP_BANDS_OLD], new=[list(x) for x in new], se=se.tolist(),
                per_level={lv: list(v.values()) for lv, v in per_level.items()}, pitches=len(f), data=describe(df))


# ------------------------------------------------------------------------------------------------ row 5: landing today
BALL = {"ball", "blocked_ball", "pitchout", "automatic_ball"}
LAND_OLD = dict(K=20.0, GAIN=2.0)
K_GRID = (0.0, 1.0, 2.0, 5.0, 10.0, 20.0, 40.0, 80.0)


def newton_offsets(y, off, groups, ng, w, iters=40):
    a = np.zeros(ng)
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(off + a[groups])))
        st = np.bincount(groups, w * (y - p), ng) / (np.bincount(groups, w * p * (1 - p), ng) + 1e-9)
        a += st
        if np.max(np.abs(st)) < 1e-9:
            break
    return a


def fit_beta(y, off, x, w, iters=60):
    b = 0.0
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(off + b * x)))
        st = np.sum(w * (y - p) * x) / (np.sum(w * p * (1 - p) * x * x) + 1e-12)
        b += st
        if abs(st) < 1e-10:
            break
    return b


def wll(y, p, w):
    p = np.clip(p, 1e-12, 1 - 1e-12)
    return float(np.sum(w * (y * np.log(p) + (1 - y) * np.log(1 - p))))


def landing_frame(df, prior_n=30.0):
    """v10_landing_fit's expectation and in-game record, vectorized; per level-season league rates, per level count
    offsets."""
    d = df[df["pitch_type"].isin(list(CLASS)) & ~df["description"].isin(["hit_by_pitch", "pitchout"])
           & ~df["description"].fillna("").str.contains("bunt") & df["balls"].between(0, 3) & df["strikes"].between(0, 2)]
    d = d.sort_values(["game_pk", "at_bat_number", "pitch_number"], kind="mergesort")
    out = pd.DataFrame(dict(level=d["level"].astype(str).values, season=d["season"].values, g=d["game_pk"].values,
                            pit=d["pitcher"].values, pt=d["pitch_type"].astype(str).values, w=d["w"].values,
                            cnt=(d["balls"] * 3 + d["strikes"]).astype(int).values))
    out["y"] = (~d["description"].isin(list(BALL))).values.astype(float)
    k = ["level", "season", "pit", "pt"]
    tot = out.groupby(k)["y"].transform("sum"); totn = out.groupby(k)["y"].transform("size")
    gs = out.groupby(k + ["g"])["y"].transform("sum"); gn = out.groupby(k + ["g"])["y"].transform("size")
    league = out.groupby(["level", "season"])["y"].transform("mean")
    rate = ((tot - gs) + prior_n * league) / ((totn - gn) + prior_n)
    out["base_off"] = np.log(rate / (1 - rate))
    off = np.zeros(len(out))
    offsets = {}
    for lv in out["level"].unique():
        m = (out["level"] == lv).values
        a = newton_offsets(out["y"].values[m], out["base_off"].values[m], out["cnt"].values[m], 12, out["w"].values[m])
        offsets[lv] = a.round(3).tolist()
        off[m] = out["base_off"].values[m] + a[out["cnt"].values[m]]
    out["off"] = off
    out["exp"] = 1 / (1 + np.exp(-off))
    grp = out.groupby(["g", "pit", "pt"], sort=False)
    out["st"] = grp["y"].cumsum() - out["y"]
    out["ex"] = grp["exp"].cumsum() - out["exp"]
    out["n"] = grp.cumcount().astype(float)
    return out, offsets


def engine_c():
    """The engine's strike-chance slope in wild-today at 0 (v10_landing_fit.engine_c)."""
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from readthrough.v10_landing_fit import engine_c as ec
    return ec()


def refit_landing(df, B=100, seed=5):
    f, offsets = landing_frame(df)
    has = (f["n"] >= 1).values
    h = f[has]
    y, off, w = h["y"].values, h["off"].values, h["w"].values
    ll0 = wll(y, 1 / (1 + np.exp(-off)), w)
    say("\n== row 5 LAND_K / LAND_GAIN (pooled MLB+AAA+A, recency-weighted)")
    say(f"  pitches {len(f):,}; with an earlier same-type pitch today {int(has.sum()):,}")
    for lv, a in offsets.items():
        say(f"  {lv} count offsets (logit, 0-0..3-2): {a}")
    best, grid = None, {}
    for K in K_GRID:
        x = ((h["st"] - h["ex"]) / (K + h["n"])).values
        b = fit_beta(y, off, x, w)
        gain = wll(y, 1 / (1 + np.exp(-(off + b * x))), w) - ll0
        grid[K] = dict(beta=b, gain=gain)
        say(f"  K {K:5.1f}: beta {b:+.3f}, weighted train gain {gain:.1f}")
        if best is None or gain > best[2]:
            best = (K, b, gain)
    K, b, _ = best
    x = ((h["st"] - h["ex"]) / (K + h["n"])).values
    gid = pd.factorize(h["g"])[0]
    rng = np.random.default_rng(seed)
    bs = np.array([fit_beta(y, off, x, w * game_draws(gid, rng)) for _ in range(B)])
    # K's own bootstrap: the grid choice re-run on a few resamples
    kb = []
    for _ in range(20):
        mm = w * game_draws(gid, rng)
        ll0b = wll(y, 1 / (1 + np.exp(-off)), mm)
        gains = {}
        for KK in K_GRID:
            xx = ((h["st"] - h["ex"]) / (KK + h["n"])).values
            bb = fit_beta(y, off, xx, mm)
            gains[KK] = wll(y, 1 / (1 + np.exp(-(off + bb * xx))), mm) - ll0b
        kb.append(max(gains, key=gains.get))
    per_level = {}
    for lv in L.LEVELS:
        m = (h["level"] == lv).values
        if m.sum() > 1000:
            per_level[lv] = fit_beta(y[m], off[m], x[m], w[m])
    e = float(np.average(h["exp"].values, weights=w))
    c, _ = engine_c()
    gain_raw = e * (1 - e) * b / c
    gain_se = e * (1 - e) * bs.std() / c
    new_gain = round(gain_raw, 1)
    say(f"  chosen K {K} (grid, weighted likelihood; bootstrap picks {dict((k, kb.count(k)) for k in sorted(set(kb)))}), "
        f"beta {b:+.4f} (boot SE {bs.std():.4f}); by level " + ", ".join(f"{k} {v:+.3f}" for k, v in per_level.items()))
    say(f"  engine c {c:.4f}, league e {e:.3f} -> LAND_GAIN = e(1-e) beta / c = {gain_raw:.3f} (SE {gain_se:.3f}) -> {new_gain}")
    return dict(old=LAND_OLD, new=dict(K=K, GAIN=new_gain), gain_raw=gain_raw, gain_se=gain_se, beta=b, beta_se=float(bs.std()),
                K_boot=kb, beta_by_level=per_level, engine_c=c, league_e=e, grid={str(k): v for k, v in grid.items()},
                data=describe(df))


# ------------------------------------------------------------------------------------------------ row 1: approach
FBK = {"FF", "SI", "FC"}
OSK = {"SL", "ST", "SV", "CU", "KC", "CS", "CH", "FS", "FO", "SC"}
SW_H = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play", "foul_bunt", "missed_bunt"}
APPROACH_OLD = 0.2077


def approach_frame(df):
    d = df[df["plate_z"].notna() & df["sz_top"].notna() & df["pitch_type"].isin(list(FBK | OSK))]
    f = pd.DataFrame(dict(level=d["level"].astype(str).values, season=d["season"].values, g=d["game_pk"].values,
                          bat=d["batter"].values, w=d["w"].values, b=d["balls"].values, s=d["strikes"].values))
    f["swing"] = d["description"].isin(list(SW_H)).values.astype(float)
    f["iz"] = d["zone"].between(1, 9).values
    hz = ((d["plate_z"] - d["sz_bot"]) / (d["sz_top"] - d["sz_bot"])).clip(-1, 2).values - 0.5
    f["hz2"] = hz ** 2
    f["early"] = (((f.b == 0) & (f.s == 0)) | ((f.b == 1) & (f.s == 0)) | ((f.b == 0) & (f.s == 1))).values
    return f


def approach_traits(f):
    """hitter_fits.traits' approach trait and general z-swing, per (level, season, batter)."""
    iz = f[f["iz"]]
    g = iz.groupby(["level", "season", "bat", "early"])["swing"].agg(["sum", "count"]).unstack()
    ok = (g[("count", True)] >= 40) & (g[("count", False)] >= 60)
    appr = (g[("sum", True)] / g[("count", True)] - g[("sum", False)] / g[("count", False)])[ok].rename("approach")
    zsw = iz.groupby(["level", "season", "bat"])["swing"].mean().rename("g_zsw")
    t = pd.concat([appr, zsw], axis=1)
    # tags: top / bottom third among the level-season's hitters with the trait
    def tagit(s):
        v = s.values
        lo, hi = np.nanpercentile(v, [100 / 3, 200 / 3]) if np.isfinite(v).any() else (np.nan, np.nan)
        return pd.Series(np.where(np.isnan(v), 0.0, np.where(v >= hi, 1.0, np.where(v <= lo, -1.0, 0.0))), index=s.index)
    t["tag"] = t.groupby(level=[0, 1], group_keys=False)["approach"].apply(tagit)
    zm = t.groupby(level=[0, 1])["g_zsw"].transform("mean")
    p = t["g_zsw"].fillna(zm).clip(1e-4, 1 - 1e-4)
    t["Lg_zsw"] = np.log(p / (1 - p))
    return t


def approach_design(f, t):
    """The previous season's traits on this season's early in-zone pitches."""
    prev = t.reset_index()
    prev["season"] = prev["season"] + 1
    x = f[f["iz"] & f["early"]].merge(prev[["level", "season", "bat", "tag", "Lg_zsw"]], on=["level", "season", "bat"],
                                      how="inner")
    X = np.c_[np.ones(len(x)), ((x.b == 1) & (x.s == 0)).astype(float), ((x.b == 0) & (x.s == 1)).astype(float),
              x["hz2"].values, x["Lg_zsw"].values, x["tag"].values]
    return x, X


def refit_approach(df, B=100, seed=1):
    f = approach_frame(df)
    t = approach_traits(f)
    x, X = approach_design(f, t)
    check_seasons(x)
    y, w = x["swing"].values, x["w"].values
    b = wlogit(X, y, w)
    gid = pd.factorize(x["g"])[0]
    rng = np.random.default_rng(seed)
    bs = np.array([wlogit(X, y, w * game_draws(gid, rng))[-1] for _ in range(B)])
    pairs = x.groupby(["level", "season"]).size()
    per = {}
    for (lv, s), _ in pairs.items():
        m = ((x["level"] == lv) & (x["season"] == s)).values
        per[f"{lv} {s - 1}->{s}"] = float(wlogit(X[m], y[m], np.ones(m.sum()))[-1])
    say("\n== row 1 HIT_FIT approach (prior-season tag -> early in-zone swing; pooled MLB+AAA+A pairs, recency-weighted "
        "by the pitch season)")
    say(f"  pitches {len(x):,}; pairs " + ", ".join(f"{k} {v:+.3f}" for k, v in per.items()))
    say(f"  coef per tag step {b[-1]:+.4f} (boot SE {bs.std():.4f}); old {APPROACH_OLD}")
    return dict(old=APPROACH_OLD, new=round(float(b[-1]), 4), se=float(bs.std()), per_pair=per, pitches=len(x),
                data={f"{lv} {s}": int(n) for (lv, s), n in pairs.items()})


# ------------------------------------------------------------------------------------------------ B2: SIDE
SIDE_OLD = {"hard": {"FB|up|same": -0.818, "FB|up|opp": -0.989, "FB|down|same": 0.0, "FB|down|opp": 0.0,
                     "OS|up|same": -0.212, "OS|up|opp": -0.465, "OS|down|same": 0.596, "OS|down|opp": 0.388},
            "whiff": {"FB|up|same": -0.435, "FB|up|opp": -0.329, "FB|down|same": -0.852, "FB|down|opp": -0.635,
                      "OS|up|same": -0.856, "OS|up|opp": -0.853, "OS|down|same": -0.251, "OS|down|opp": 0.276},
            "swing": {"FB|up|same": 1.077, "FB|up|opp": 0.56, "FB|down|same": 0.551, "FB|down|opp": -0.128,
                      "OS|up|same": -0.394, "OS|up|opp": -0.436, "OS|down|same": 0.257, "OS|down|opp": 0.343}}
CELLS = [f"{c}|{h}|{sd}" for c in ("FB", "OS") for h in ("up", "down") for sd in ("same", "opp")]


def zone_band(x, z, top, bot):
    """step4b_power_fit.zone, vectorized."""
    half = np.maximum(0.25, (top - bot) / 2)
    mid = (top + bot) / 2
    m = np.maximum(np.abs(x) / 0.83, np.abs(z - mid) / half)
    return np.where(m < 0.67, "heart", np.where(m < 1.33, "edge", np.where(m < 2.0, "off", "noncomp")))


def side_frame(df):
    d = df[df["pitch_type"].isin(list(CLASS)) & df["plate_x"].notna() & df["plate_z"].notna() & df["sz_top"].notna()
           & df["sz_bot"].notna() & ~df["description"].fillna("").str.contains("bunt")]
    x, z = d["plate_x"].values.astype(float), d["plate_z"].values.astype(float)
    top, bot = d["sz_top"].values.astype(float), d["sz_bot"].values.astype(float)
    zb = zone_band(x, z, top, bot)
    keep = np.isin(zb, ["heart", "edge"])
    d, x, z, top, bot, zb = d[keep], x[keep], z[keep], top[keep], bot[keep], zb[keep]
    return d, x, z, top, bot, zb


def refit_side(df):
    d, x, z, top, bot, zb = side_frame(df)
    stand = d["stand"].astype(str).values
    inside = ((np.where(stand == "R", -x, x)) > 0).astype(float)
    up = (z > (top + bot) / 2).astype(float)
    c = d["pitch_type"].astype(str).map(CLASS).values
    fb = (c == "FB").astype(float)
    heart = (zb == "heart").astype(float)
    cls = np.c_[[(c == k).astype(float) for k in ("SL", "CB", "CH")]].T
    b, s = d["balls"].values.astype(float), d["strikes"].values.astype(float)
    same = (stand == d["p_throws"].astype(str).values).astype(float)
    X0 = np.c_[heart, up, same, cls, b, s, (s == 2).astype(float)]
    cell = np.stack([cf * hf * sf for cf in (fb, 1 - fb) for hf in (up, 1 - up) for sf in (same, 1 - same)], 1)
    T = cell * inside[:, None]
    desc = d["description"].astype(str).values
    sw = np.isin(desc, list(SWING)).astype(float)
    wh = np.isin(desc, list(WHIFF)).astype(float)
    ls = pd.to_numeric(d["launch_speed"], errors="coerce").values
    bip = ((desc == "hit_into_play") & ~np.isnan(ls)).astype(float)
    hard = ((bip == 1) & (np.nan_to_num(ls) >= 95)).astype(float)
    pid, bid, gid = ids(d)
    w = d["w"].values
    say("\n== B2 SIDE (inside minus away, heart + edge; pooled MLB+AAA+A, recency-weighted, pitcher/batter intercepts)")
    say(f"  heart + edge pitches {len(d):,}")
    out, se_out = {}, {}
    for name, mask, y in (("hard", bip == 1, hard), ("whiff", sw == 1, wh), ("swing", np.ones(len(d), bool), sw)):
        m = mask
        r = wfit_re(np.hstack([X0[m], T[m]]), y[m], w[m], pd.factorize(pid[m])[0], pd.factorize(bid[m])[0],
                    pd.factorize(gid[m])[0])
        bb, ss = r["b"][-len(CELLS):], r["se"][-len(CELLS):]
        out[name], se_out[name] = {}, {}
        for cn, v, e in zip(CELLS, bb, ss):
            excl = (v - 1.96 * e > 0) or (v + 1.96 * e < 0)
            out[name][cn] = round(float(v), 3) if excl else 0.0
            se_out[name][cn] = float(e)
            say(f"  {name:5s} {cn:13s} old {SIDE_OLD[name][cn]:+.3f}  fit {v:+.3f} (SE {e:.3f}) -> {out[name][cn]:+.3f}"
                f"{'' if excl else '  (interval includes 0: 0)'}")
        say(f"  {name}: n {r['n']:,}, converged {r['converged']}")
    return dict(old=SIDE_OLD, new=out, se=se_out, pitches=len(d), data=describe(df),
                rule="cell = fitted value where its 95% cluster-robust interval excludes 0, else 0")


# ------------------------------------------------------------------------------------------------ B3: POWER_HR
POWER_HR_OLD = 0.112


def refit_power_hr(df, prior=50.0):
    d = df[df["pitch_type"].isin(list(CLASS)) & (df["description"] == "hit_into_play") & df["launch_speed"].notna()
           & df["plate_x"].notna() & df["plate_z"].notna() & df["sz_top"].notna() & df["sz_bot"].notna()].copy()
    d["hard"] = (d["launch_speed"] >= 95).astype(float)
    lv = d["level"].astype(str)
    d["lv"] = lv
    # power = the batter's hard-hit share in his OTHER fit seasons at this level, shrunk 50 BIP toward the level rate
    tot = d.groupby(["lv", "batter"])["hard"].agg(["sum", "count"])
    sea = d.groupby(["lv", "batter", "season"])["hard"].agg(["sum", "count"])
    league = d.groupby("lv")["hard"].mean()
    j = sea.join(tot, rsuffix="_t")
    j["os"], j["on"] = j["sum_t"] - j["sum"], j["count_t"] - j["count"]
    j = j[j["on"] > 0]
    lg = league.reindex(j.index.get_level_values(0)).values
    j["pw_raw"] = (j["os"] + prior * lg) / (j["on"] + prior)
    d = d.join(j["pw_raw"], on=["lv", "batter", "season"], how="inner")
    d = d[d["hard"] == 1]
    w = d["w"].values
    mu = np.average(d["pw_raw"], weights=w)
    sd = math.sqrt(np.average((d["pw_raw"] - mu) ** 2, weights=w))
    pw = ((d["pw_raw"] - mu) / sd).values
    hr = (d["events"].astype(str) == "home_run").values.astype(float)
    c = d["pitch_type"].astype(str).map(CLASS).values
    zb = zone_band(d["plate_x"].values.astype(float), d["plate_z"].values.astype(float), d["sz_top"].values.astype(float),
                   d["sz_bot"].values.astype(float))
    X = np.c_[(zb == "heart").astype(float), (c == "SL"), (c == "CB"), (c == "CH"), d["balls"].values, d["strikes"].values,
              pw].astype(float)
    pid, bid, gid = ids(d)
    r = wfit_re(X, hr, w, pid, bid, gid)
    per = {}
    for l_ in L.LEVELS:
        m = (d["lv"] == l_).values
        if m.sum() > 2000:
            rr = wfit_re(X[m], hr[m], w[m], pd.factorize(pid[m])[0], pd.factorize(bid[m])[0], pd.factorize(gid[m])[0])
            per[l_] = (float(rr["b"][-1]), float(rr["se"][-1]))
    say("\n== B3 POWER_HR (HR | hard ball in play per SD of other-season power; pooled, recency-weighted)")
    say(f"  hard balls in play {len(d):,}; HR rate {np.average(hr, weights=w):.3f}; power SD (raw share) {sd:.4f}")
    say(f"  coef {r['b'][-1]:+.4f} (SE {r['se'][-1]:.4f}); by level " +
        ", ".join(f"{k} {v[0]:+.3f} ({v[1]:.3f})" for k, v in per.items()) + f"; old {POWER_HR_OLD}")
    return dict(old=POWER_HR_OLD, new=round(float(r["b"][-1]), 3), coef_raw=float(r["b"][-1]), se=float(r["se"][-1]),
                by_level=per, power_sd_raw=sd,
                n=len(d), data=describe(df))


# ------------------------------------------------------------------------------------------------ B1: MM
MM_OLD = dict(succ=0.107, hard=-0.346)


def seq_rows(df):
    """seq_fit.load()'s row dicts from a Savant frame (classified pitches, no bunts), players keyed per level."""
    d = df[df["pitch_type"].isin(list(CLASS)) & ~df["description"].fillna("").str.contains("bunt")
           & df["at_bat_number"].notna() & df["pitch_number"].notna()].copy()
    d = d.sort_values(["game_pk", "at_bat_number", "pitch_number"], kind="mergesort")
    lc = d["level"].astype(str).map(LEVEL_CODE).values.astype(np.int64)
    num = lambda c: pd.to_numeric(d[c], errors="coerce").values.astype(float)
    cols = dict(
        yr=d["season"].values.astype(int), g=d["game_pk"].values.astype(np.int64),
        ab=d["at_bat_number"].values.astype(int), pn=d["pitch_number"].values.astype(int),
        pit=d["pitcher"].values.astype(np.int64) * 10 + lc, bat=d["batter"].values.astype(np.int64) * 10 + lc,
        pt=d["pitch_type"].astype(str).values, c=d["pitch_type"].astype(str).map(CLASS).values,
        desc=d["description"].astype(str).values, b=d["balls"].values.astype(int), k=d["strikes"].values.astype(int),
        o=d["outs_when_up"].fillna(0).values.astype(int), r1=d["on_1b"].notna().values, r2=d["on_2b"].notna().values,
        r3=d["on_3b"].notna().values,
        marg=np.nan_to_num(num("fld_score") - num("bat_score")).astype(int),
        tto=np.nan_to_num(num("n_thruorder_pitcher"), nan=1.0).astype(int),
        v=num("release_speed"), spin=num("release_spin_rate"), px=num("pfx_x"), pz=num("pfx_z"), ext=num("release_extension"),
        x=num("plate_x"), z=num("plate_z"), top=num("sz_top"), bot=num("sz_bot"), stand=d["stand"].astype(str).values,
        thr=d["p_throws"].astype(str).values, zone=np.nan_to_num(num("zone")).astype(int),
        vx0=num("vx0"), vy0=num("vy0"), vz0=num("vz0"), ax=num("ax"), ay=num("ay"), az=num("az"),
        rx=num("release_pos_x"), rz=num("release_pos_z"), ls=num("launch_speed"),
        bb=d["bb_type"].fillna("").astype(str).values, w=d["w"].values.astype(float))
    keys = list(cols)
    rows = [dict(zip(keys, vals)) for vals in zip(*[cols[k_] for k_ in keys])]
    for r in rows:
        r["shape_sink"] = r["pt"] == "SI"
        r["shape_cut"] = r["pt"] == "FC"
    return rows


def sample_games(df, frac, seed=11):
    """A fixed-seed fraction of games in every level-season (whole games)."""
    if frac >= 1:
        return df
    g = pd.Series(df["game_pk"].unique())
    keep = set(g.sample(frac=frac, random_state=seed).values)
    return df[df["game_pk"].isin(keep)]


def refit_mm(df, frac=0.35, lam=0.8, alpha=0.6, dstar=2.0):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, root)
    import seq_fit as S
    d = sample_games(df, frac)
    t0 = time.time()
    rows = seq_rows(d)
    tabs = S.season_tables(rows)
    pc = defaultdict(int)
    pcs, prev_rows = [], []
    last_pa, last_i = None, None
    for i, r in enumerate(rows):
        key = (r["g"], r["pit"])
        pcs.append(pc[key]); pc[key] += 1
        pa = (r["g"], r["ab"])
        prev_rows.append(rows[last_i] if (last_pa == pa and last_i is not None) else None)
        last_pa, last_i = pa, i
    base_seq = S.sequence(rows, 0.6, 0.4, tabs)
    for i, s in enumerate(base_seq):
        s["pc"] = pcs[i]
    ok = np.array([all(v == v for v in (r["v"], r["x"], r["z"], r["top"], r["bot"])) for r in rows])
    idx = np.where(ok)[0]
    Xc = np.nan_to_num(np.array([S.controls(rows[i], base_seq[i], tabs, prev_rows[i]) for i in idx]))
    sq = S.sequence(rows, lam, alpha, tabs)
    SH = np.array([[sq[i]["B"],
                    S.g_mod((1 if rows[i]["c"] == "FB" else -1) * (rows[i]["z"] - sq[i]["yh"]), dstar) if sq[i]["prev"] is not None else 0.0,
                    min(sq[i]["n_fb"], 0.5 / 0.058) * (rows[i]["c"] == "FB"),
                    min(sq[i]["n_os"], 0.5 / 0.116) * (rows[i]["c"] != "FB")] for i in idx])
    # M1 / M2 walked in pitch order (step3_fits / v10_memory_fit)
    jpos = {int(i): j for j, i in enumerate(idx)}
    succ = defaultdict(lambda: defaultdict(int))
    hardspot = defaultdict(lambda: defaultdict(int))
    m1f = np.zeros(len(idx)); m2f = np.zeros(len(idx))
    cur, pa_rows = None, []
    for i, r in enumerate(rows):
        pa = (r["g"], r["ab"])
        if pa != cur:
            for pr in pa_rows:
                key = (pr["g"], pr["pit"], pr["bat"])
                cls = "FB" if pr["c"] == "FB" else "OS"
                if pr["desc"] in WHIFF or pr["desc"] == "called_strike":
                    succ[key][cls] += 1
                if pr["desc"] == "hit_into_play" and pr["ls"] == pr["ls"] and pr["ls"] >= 95 and pr["x"] == pr["x"] and pr["z"] == pr["z"]:
                    hardspot[key][(cls, S.quad(pr))] += 1
            cur, pa_rows = pa, []
        j = jpos.get(i)
        if j is not None:
            cls = "FB" if r["c"] == "FB" else "OS"
            key = (r["g"], r["pit"], r["bat"])
            m1f[j] = min(succ[key][cls], 4)
            m2f[j] = min(hardspot[key][(cls, S.quad(r))], 2)
        pa_rows.append(r)
    desc = np.array([rows[i]["desc"] for i in idx])
    is_sw = np.isin(desc, list(SWING))
    whiff = np.isin(desc, list(WHIFF)).astype(float)
    w = np.array([rows[i]["w"] for i in idx])
    pid = pd.factorize(np.array([rows[i]["pit"] for i in idx]))[0]
    bid = pd.factorize(np.array([rows[i]["bat"] for i in idx]))[0]
    gid = pd.factorize(np.array([rows[i]["g"] for i in idx]))[0]
    say("\n== B1 MM (M1 earlier-trip whiffs + called strikes, M2 earlier-trip hard hits on class and spot; whiff | swing; "
        f"seq_fit controls + shipped v0.8 terms; {frac:.0%} of games per level-season, recency-weighted)")
    say(f"  rows {len(rows):,}, usable {len(idx):,}, swings {int(is_sw.sum()):,}; built in {time.time() - t0:.0f}s")
    out = {}
    for nm, feat in (("succ", m1f), ("hard", m2f)):
        m = is_sw
        X = np.hstack([Xc[m], SH[m], feat[m][:, None]])
        r = wfit_re(X, whiff[m], w[m], pd.factorize(pid[m])[0], pd.factorize(bid[m])[0], pd.factorize(gid[m])[0])
        out[nm] = (float(r["b"][-1]), float(r["se"][-1]))
        say(f"  {nm}: coef {r['b'][-1]:+.4f} (SE {r['se'][-1]:.4f}); old {MM_OLD[nm]}; converged {r['converged']}")
    return dict(old=MM_OLD, new={k: round(v[0], 3) for k, v in out.items()}, se={k: v[1] for k, v in out.items()},
                frac=frac, rows=len(idx), data=describe(d))


# ------------------------------------------------------------------------------------------------ B12: HBP_LOC check
def refit_hbp_loc_ratio(df, B=200, seed=12):
    """fit_hbp_loc.single_a_ratio on every fit season, per level: HBP per pitch crossing the inside third or further in,
    over HBP per pitch overall."""
    d = df[df["plate_x"].notna() & df["stand"].isin(["R", "L"])]
    hbp = ((d["description"].fillna("") == "hit_by_pitch") | (d["events"].fillna("") == "hit_by_pitch")).values.astype(float)
    x = d["plate_x"].values.astype(float) * 12
    xin = np.where(d["stand"].values == "L", x, -x)
    ins = (xin >= 17.0 / 6.0).astype(float)
    w = d["w"].values
    lv = d["level"].astype(str).values
    gid = pd.factorize(d["game_pk"])[0]
    rng = np.random.default_rng(seed)

    def ratio(ww):
        return (np.sum(ww * hbp * ins) / np.sum(ww * ins)) / (np.sum(ww * hbp) / np.sum(ww))
    out = {}
    for l_ in L.LEVELS:
        m = lv == l_
        r0 = ratio(w * m)
        bs = [ratio(w * m * game_draws(gid, rng)) for _ in range(B // 4)]
        out[l_] = (float(r0), float(np.std(bs)))
    say("\n== B12 HBP_LOC check (inside-crossing HBP ratio; v1.2 matched Single-A 2024-25's 3.05 with the shipped values)")
    say("  " + ", ".join(f"{k} {v[0]:.2f} (boot SE {v[1]:.2f})" for k, v in out.items()))
    return dict(ratio=out, v12_target=3.05, data=describe(df))


# ------------------------------------------------------------------------------------------------ main
FITS = ("hbp_bands", "landing", "approach", "side", "power_hr", "hbp_loc", "mm")


MM_COLS = ["pitch_type", "description", "des", "at_bat_number", "pitch_number", "pitcher", "batter", "balls", "strikes",
           "outs_when_up", "on_1b", "on_2b", "on_3b", "fld_score", "bat_score", "n_thruorder_pitcher", "release_speed",
           "release_spin_rate", "pfx_x", "pfx_z", "release_extension", "plate_x", "plate_z", "sz_top", "sz_bot", "stand",
           "p_throws", "zone", "vx0", "vy0", "vz0", "ax", "ay", "az", "release_pos_x", "release_pos_z", "launch_speed",
           "bb_type"]
FIT_COLS = dict(
    hbp_bands=["pitch_type", "plate_x", "stand", "description"],
    hbp_loc=["plate_x", "stand", "description", "events"],
    approach=["plate_z", "sz_top", "sz_bot", "pitch_type", "batter", "balls", "strikes", "description", "zone"],
    landing=["pitch_type", "description", "balls", "strikes", "at_bat_number", "pitch_number", "pitcher"],
    side=["pitch_type", "plate_x", "plate_z", "sz_top", "sz_bot", "description", "stand", "p_throws", "balls", "strikes",
          "launch_speed", "pitcher", "batter"],
    power_hr=["pitch_type", "description", "launch_speed", "plate_x", "plate_z", "sz_top", "sz_bot", "batter", "events",
              "balls", "strikes", "pitcher"],
    mm=MM_COLS)


def load_for(nm):
    """The fit's columns only, on the weight-proportional game sample (refit_load.savant(sample=True)); MM's own game
    fraction is applied per level-season as it loads, so the full pooled frame never sits in memory."""
    if nm != "mm":
        return check_seasons(L.savant(cols=FIT_COLS[nm], sample=True))
    parts = []
    for lv in L.LEVELS:
        for s in L.fit_seasons_on_disk(lv):
            d = L.load_savant(lv, s, cols=MM_COLS, sample=True)
            d = d[L.keep_games(d["game_pk"], MM_FRAC)]
            d["w"] = L.sample_weight(s)
            parts.append(d)
    out = pd.concat(parts, ignore_index=True)
    out["level"] = out["level"].astype("category")
    return check_seasons(out)


MM_FRAC = 0.35


def run(names=FITS):
    os.makedirs(OUT, exist_ok=True)
    res = {}
    for nm in names:
        t0 = time.time()
        df = load_for(nm)
        say(f"\n[{nm}] Savant fit data (weight-proportional game sample): {len(df):,} pitches; " +
            ", ".join(f"{k} {v:,}" for k, v in describe(df).items()))
        fn = dict(hbp_bands=refit_hbp_bands, landing=refit_landing, approach=refit_approach, side=refit_side,
                  power_hr=refit_power_hr, hbp_loc=refit_hbp_loc_ratio,
                  mm=lambda d: refit_mm(d, frac=1.0))[nm]
        res[nm] = fn(df)
        if nm == "mm":
            res[nm]["frac"] = MM_FRAC
        del df
        say(f"  [{nm} {time.time() - t0:.0f}s]")
        with open(os.path.join(OUT, f"{nm}.json"), "w") as fh:
            json.dump(res[nm], fh, indent=1, default=float)
        with open(os.path.join(OUT, "refit.txt"), "a") as fh:
            fh.write("\n".join(LOG) + "\n")
        LOG.clear()
    return res


if __name__ == "__main__":
    run(tuple(sys.argv[1:]) or FITS)
