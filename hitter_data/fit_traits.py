"""v1.3 Part 3.4 (plan 3.4): per-hitter traits, their reliability, slot x team-strength priors, the six presets sized
from real hitters, and per-hitter prefill files. COLLEGE levels. PROVISIONAL: run on the data in hand; nothing wired.

Traits (logit effects relative to the level-season's per-count average; then divided by the trait's talent SD, so the
final units are the simulator's "hitter SD" units, simulate.py HITTER_TRAITS):
- early       swing at 0-0 / 1-0 / 0-1                         (sim: logit(swing) += early * TRAIT_SIZE early_swing)
- two_strike  composite of ts_swing (swing at two strikes) and ts_foul (foul share of contact at two strikes), each
              standardised, summed and divided by sqrt(2 + 2 max(rho, 0)), rho = their true-score correlation (SD 1
              when rho >= 0; the parts are also written separately, since the data puts rho below 0)
- contact     MINUS the whiff-per-swing effect (contact +1 = fewer whiffs; sim: contact_whiff < 0)
- power       extra-base hits (2B / 3B / HR) per ball in play, bunts out (sim: power_xbh)
- spray       pull share of balls in play with a direction (L / LC pulled by a right-handed hitter; R / RC by a lefty;
              a switch hitter bats opposite the pitcher). Only hitters whose hand is printed (roster) get it.

Per hitter-season, each trait is a penalised one-parameter logit MLE with the per-count average as offset (prior SD 2
logits, negligible at real sample sizes) and its SE from the Fisher information.
- talent SD tau: the covariance of odd-game and even-game estimates across hitters (unbiased for the true variance);
  the moment estimate var(b) - mean(SE^2) is reported next to it.
- split-half reliability: corr(odd, even), Spearman-Brown corrected.
- prior: weighted least squares on lineup slot (modal slot, 1-9) + team strength x slot group (1-3 / 4-6 / 7-9).
  Team strength = the team's runs scored per game in the level-season, z-scored over teams, times n / (n + 10) for n
  games (so thin teams are pulled to 0). Runs scored, not a rating: no opponent adjustment.
- shrinkage: shrunk = prior + R (b - prior), R = tau_res^2 / (tau_res^2 + SE^2) (the hitter's own reliability).

Tuning (tau, priors, presets) uses the training seasons (default 2022-2024). 2025 is validation (reliability, prior R^2,
2024 -> 2025 stability) and the prefill season (a hitter's own 2023-2025 PAs, recency weight 0.5^(age / 2)). 2026 is
never loaded.

Presets: hitters with >= 100 PAs in a training season, grouped by their shrunk traits (top 15% of the trait or
composite named in PRESET_RULES). A group's mean shrunk trait vector estimates the group's true mean (posterior means
are unbiased for group means under selection on the data). Compared with simulate.py's PLACEHOLDER values.

usage: python -m hitter_data.fit_traits [--levels D1,D2,D3] [--train 2022-2024] [--prefill 2025] [--out DIR]"""
import argparse
import datetime
import json
import os
import sqlite3
import sys
import time
from collections import Counter, defaultdict

import numpy as np

from . import DATA, assert_not_heldout, fit_seasons
from . import harness as H
from .fit_traits_data import load_season

LEVELS = ("D1", "D2", "D3")
FIT_LEVEL = {"D1": "fit-eligible", "D2": "THIN", "D3": "THIN"}
VALID = 2025
PARTS = ("early", "ts_swing", "ts_foul", "contact", "power", "spray")
SIGN = {"early": 1, "ts_swing": 1, "ts_foul": 1, "contact": -1, "power": 1, "spray": 1}   # contact = minus whiff
TRAITS = ("early", "two_strike", "contact", "power", "spray")
PRIOR_SD = 2.0
MIN_PA = 60            # hitters used for tau / reliability / priors (about 30 PAs per half)
PRESET_MIN_PA = 100
PRESET_SHARE = 0.15
# simulate.py PLACEHOLDER values, copied for the comparison only (simulate.py is not imported or changed)
SIM_TRAIT_SIZE = {"early": 0.35, "ts_swing": 0.30, "ts_foul": 0.30, "contact": 0.35, "power": 0.30}
SIM_PRESETS = {"aggressive_early": {"early": 1.5}, "patient": {"early": -1.5, "two_strike": -0.5},
               "power": {"power": 1.5, "contact": -1.0}, "contact": {"contact": 1.5, "power": -0.5},
               "free_swinger": {"early": 1.5, "contact": -1.0, "power": 0.5},
               "two_strike_battler": {"two_strike": 1.5, "contact": 0.5}}
PRESET_RULES = {"aggressive_early": ("early", 1), "patient": ("early", -1), "power": ("power", 1),
                "contact": ("contact", 1), "free_swinger": ("early-contact", 1), "two_strike_battler": ("two_strike", 1)}
OUT_DIR = os.path.join(DATA, "fits")
EARLY = {0, 1, 3}          # count index of 0-0, 0-1, 1-0 (harness CI: b * 3 + k)
STRIKES = np.array([k for b in range(4) for k in range(3)])


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def sig(x):
    return 1.0 / (1.0 + np.exp(-x))


# --- observations -----------------------------------------------------------------------------------------------------
def per_count_rate(ci, y, K=12):
    n = np.bincount(ci, minlength=K).astype(float)
    s = np.bincount(ci, weights=y.astype(float), minlength=K)
    tot = s.sum() / max(n.sum(), 1)
    return np.where(n > 0, (s + 5 * tot) / (n + 5), tot)


def hitter_hand(S):
    """per hitter: 0 R, 1 L, 2 switch, 3 unknown (the most common printed hand over his balls in play)"""
    b = S.bip
    hand = np.full(len(S.hitters), 3, dtype=np.int64)
    m = (b["h"] >= 0) & (b["bats"] < 3)
    c = np.zeros((len(S.hitters), 3))
    np.add.at(c, (b["h"][m], b["bats"][m]), 1)
    known = c.sum(axis=1) > 0
    hand[known] = c[known].argmax(axis=1)
    return hand


def observations(S):
    """-> {part: (h, g, offset, y)} for one level-season; offsets are the season's per-count logits"""
    p, b = S.pit, S.bip
    out = {}
    m = p["h"] >= 0
    h, g, ci, y6 = p["h"][m], p["g"][m], p["ci"][m].astype(np.int64), p["y"][m]
    swing = (y6 >= 3).astype(np.int64)
    ps = per_count_rate(ci, swing)
    e = np.isin(ci, list(EARLY))
    out["early"] = (h[e], g[e], logit(ps[ci[e]]), swing[e])
    t2 = STRIKES[ci] == 2
    out["ts_swing"] = (h[t2], g[t2], logit(ps[ci[t2]]), swing[t2])
    con = t2 & (y6 >= 4)
    foul = (y6 == 4).astype(np.int64)
    pf = per_count_rate(ci[con], foul[con])
    out["ts_foul"] = (h[con], g[con], logit(pf[ci[con]]), foul[con])
    sw = swing == 1
    wh = (y6 == 3).astype(np.int64)
    pw = per_count_rate(ci[sw], wh[sw])
    out["contact"] = (h[sw], g[sw], logit(pw[ci[sw]]), wh[sw])
    mb = b["h"] >= 0
    bh, bg, bci, br = b["h"][mb], b["g"][mb], b["ci"][mb].astype(np.int64), b["r"][mb]
    xbh = np.isin(br, (2, 3, 4)).astype(np.int64)
    cix = np.where(bci >= 0, bci, 12)
    px = per_count_rate(cix, xbh, K=13)
    out["power"] = (bh, bg, logit(px[cix]), xbh)
    hand = hitter_hand(S)[bh]
    thr = b["thr"][mb]
    side = np.where(hand == 2, np.where(thr == 0, 1, np.where(thr == 1, 0, 3)), hand)   # switch: opposite the pitcher
    d = b["dir"][mb]
    ok = (side < 2) & (d != 9)
    pull = np.where(side == 0, d < 0, d > 0).astype(np.int64)
    off = np.zeros(len(bh))
    for s_ in (0, 1):
        k = ok & (side == s_)
        if k.any():
            off[k] = logit(pull[k].mean())
    out["spray"] = (bh[ok], bg[ok], off[ok], pull[ok])
    return out


def game_parity(S):
    """-> function (h, g) -> 0/1: the hitter's games in date order (load_season sorts games by date), alternately"""
    G = S.n_games
    keys = []
    for arr in (S.pit, S.bip, S.pa):
        m = arr["h"] >= 0
        keys.append(arr["h"][m].astype(np.int64) * G + arr["g"][m])
    pairs = np.unique(np.concatenate(keys)) if keys else np.zeros(0, np.int64)
    hh = pairs // G
    first = np.r_[0, np.flatnonzero(np.diff(hh)) + 1]
    start = np.repeat(first, np.diff(np.r_[first, len(pairs)]))
    par = (np.arange(len(pairs)) - start) % 2

    def f(h, g):
        return par[np.searchsorted(pairs, h.astype(np.int64) * G + g)]
    return f


def estimate(h, off, y, nH, w=None, prior_sd=PRIOR_SD, iters=40):
    """penalised per-hitter logit offset: -> b, se (data information only), n (weighted opportunities)"""
    w = np.ones(len(h)) if w is None else w
    b = np.zeros(nH)
    n = np.bincount(h, weights=w, minlength=nH)
    for _ in range(iters):
        p = sig(off + b[h])
        grad = np.bincount(h, weights=w * (y - p), minlength=nH) - b / prior_sd ** 2
        hess = np.bincount(h, weights=w * p * (1 - p), minlength=nH) + 1 / prior_sd ** 2
        step = grad / hess
        b += np.clip(step, -1, 1)
        if np.abs(step).max() < 1e-9:
            break
    p = sig(off + b[h])
    info = np.bincount(h, weights=w * p * (1 - p), minlength=nH)
    se = 1 / np.sqrt(info + 1e-9)
    return b, se, n


def season_table(S):
    """per hitter: each part's estimate on all games and on odd / even games; PAs, modal slot, team"""
    nH = len(S.hitters)
    obs = observations(S)
    par = game_parity(S)
    T = dict(key=list(S.hitters), team=list(S.h_team), name=list(S.h_name))
    T["pa"] = np.bincount(S.pa["h"], minlength=nH)
    slots = np.zeros((nH, 10))
    np.add.at(slots, (S.pa["h"], np.clip(S.pa["slot"], 0, 9)), 1)
    slots[:, 0] = 0
    T["slot"] = np.where(slots.sum(axis=1) > 0, slots.argmax(axis=1), 0)
    T["hand"] = hitter_hand(S)
    for part, (h, g, off, y) in obs.items():
        b, se, n = estimate(h, off, y, nH)
        T[part] = (b, se, n)
        pp = par(h, g)
        for k, lab in ((0, "odd"), (1, "even")):
            m = pp == k
            T[part + "_" + lab] = estimate(h[m], off[m], y[m], nH)
    T["team_z"] = team_strength(S)
    return T


def team_strength(S, k=10.0):
    """per hitter: his team's runs per game, z-scored over the level-season's teams, x n / (n + k)"""
    runs = defaultdict(list)
    for tid, g, r in S.team_games:
        runs[tid].append(r)
    teams = list(runs)
    rpg = np.array([np.mean(runs[t]) for t in teams]) if teams else np.zeros(0)
    n = np.array([len(runs[t]) for t in teams], dtype=float)
    ok = n >= 5
    mu, sd = (rpg[ok].mean(), rpg[ok].std()) if ok.sum() > 2 else (0.0, 1.0)
    z = {t: (rpg[i] - mu) / (sd or 1.0) * n[i] / (n[i] + k) for i, t in enumerate(teams)}
    return np.array([z.get(t, 0.0) for t in S.h_team])


# --- tuning across hitter-seasons ---------------------------------------------------------------------------------------
def stack(tables, part, min_pa=MIN_PA, min_n=5):
    rows = defaultdict(list)
    for T in tables:
        b, se, n = T[part]
        m = (T["pa"] >= min_pa) & (n >= min_n)
        bo, seo, no = T[part + "_odd"]
        be, see, ne = T[part + "_even"]
        for k, v in (("b", b), ("se", se), ("n", n), ("bo", bo), ("no", no), ("be", be), ("ne", ne),
                     ("slot", T["slot"]), ("z", T["team_z"])):
            rows[k].append(v[m])
    return {k: np.concatenate(v) for k, v in rows.items()}


def reliability(X, min_half=10):
    """talent variance and split-half reliability from odd / even game estimates"""
    m = (X["no"] >= min_half) & (X["ne"] >= min_half)
    if m.sum() < 20:
        return dict(n_hitters=int(m.sum()))
    bo, be = X["bo"][m], X["be"][m]
    cov = float(np.cov(bo, be)[0, 1])
    r = float(np.corrcoef(bo, be)[0, 1])
    sb = 2 * r / (1 + r) if r > -1 else float("nan")
    full = (X["n"] > 0)
    mom = float(np.var(X["b"][full]) - np.mean(X["se"][full] ** 2))
    return dict(n_hitters=int(m.sum()), tau2_splithalf=cov, tau_splithalf=float(np.sqrt(max(cov, 0))),
                tau2_moment=mom, r_half=r, spearman_brown=sb, median_n=float(np.median(X["n"][full])))


def prior_design(slot, z):
    D = np.zeros((len(slot), 13))
    D[np.arange(len(slot)), np.clip(slot, 0, 9)] = 1
    grp = np.where(slot <= 0, -1, (np.clip(slot, 1, 9) - 1) // 3)
    for k in range(3):
        D[:, 10 + k] = z * (grp == k)
    return D


def fit_prior(X, tau2):
    D = prior_design(X["slot"], X["z"])
    w = 1.0 / (tau2 + X["se"] ** 2)
    keep = D.sum(axis=0) > 0
    keep[10:] = True
    Dk = D[:, keep]
    A = Dk.T @ (Dk * w[:, None]) + 1e-6 * np.eye(Dk.shape[1])
    coef = np.zeros(13)
    coef[keep] = np.linalg.solve(A, Dk.T @ (w * X["b"]))
    # slots never seen fall back to the weighted mean
    mean = float((w * X["b"]).sum() / w.sum())
    for j in range(10):
        if not keep[j]:
            coef[j] = mean
    fitted = D @ coef
    var_fit = float(np.average((fitted - np.average(fitted, weights=w)) ** 2, weights=w))
    tau2_res = max(tau2 - var_fit, 0.1 * tau2)
    return dict(coef=coef, mean=mean, var_fitted=var_fit, tau2_res=tau2_res)


def prior_of(P, slot, z):
    return prior_design(slot, z) @ P["coef"]


def prior_r2(X, P, tau2):
    """share of the true (noise-corrected) between-hitter variance the prior explains"""
    pr = prior_of(P, X["slot"], X["z"])
    noise = np.mean(X["se"] ** 2)
    tot = np.mean((X["b"] - X["b"].mean()) ** 2) - noise
    res = np.mean((X["b"] - pr) ** 2) - noise
    return float(1 - res / tot) if tot > 0.1 * tau2 else None     # None: too little true variance to say


def _f(x):
    return "n/a" if x is None or x != x else f"{x:.2f}"


def shrink(b, se, prior, tau2_res):
    R = tau2_res / (tau2_res + se ** 2)
    return prior + R * (b - prior), np.sqrt(R) * se, R


# --- one level ------------------------------------------------------------------------------------------------------------
def run_level(con, level, train, prefill_seasons, max_games=None, log=print, out_dir=OUT_DIR):
    train = fit_seasons(train)
    prefill_seasons = fit_seasons(prefill_seasons)
    need = sorted(set(train) | {VALID} | {s - k for s in prefill_seasons for k in (0, 1, 2)})
    need = fit_seasons([s for s in need if s >= 2000])
    data, tables = {}, {}
    for s in need:
        t = time.time()
        S = load_season(con, level, s, max_games=max_games)
        if S.n_games == 0:
            continue
        data[s] = S
        tables[s] = season_table(S)
        log(f"  {level} {s}: {S.n_games} games, {len(S.hitters)} hitter keys, {len(S.pit['y'])} pitches,"
            f" {len(S.bip['g'])} balls in play; ambiguous PAs {S.n_pa_ambiguous} of {S.n_pa_rows}"
            f" ({S.n_ambiguous_groups} name groups) ({time.time() - t:.0f}s)")
    tr = [tables[s] for s in train if s in tables]
    out = dict(level=level, label=FIT_LEVEL[level], train=[s for s in train if s in tables], valid=VALID,
               keys={str(s): dict(hitter_keys=len(data[s].hitters), pa_rows=data[s].n_pa_rows,
                                  pa_ambiguous=data[s].n_pa_ambiguous, ambiguous_name_groups=data[s].n_ambiguous_groups,
                                  hitters_min_pa=int((tables[s]["pa"] >= MIN_PA).sum()))
                     for s in data})
    if not tr:
        out["status"] = "no training data"
        return out
    params = {}
    for part in PARTS:
        X = stack(tr, part)
        rel = reliability(X)
        if "tau2_splithalf" not in rel or rel["tau2_splithalf"] <= 0:
            params[part] = dict(reliability_train=rel, status="no usable talent variance")
            continue
        tau2 = rel["tau2_splithalf"]
        P = fit_prior(X, tau2)
        e = dict(reliability_train=rel, tau=float(np.sqrt(tau2)), tau_res=float(np.sqrt(P["tau2_res"])),
                 prior=dict(slot={str(k): round(float(P["coef"][k]), 4) for k in range(1, 10)},
                            slot_unknown=round(float(P["coef"][0]), 4),
                            team_z_slope={"1-3": round(float(P["coef"][10]), 4), "4-6": round(float(P["coef"][11]), 4),
                                          "7-9": round(float(P["coef"][12]), 4)},
                            r2_train=prior_r2(X, P, tau2)),
                 _P=P)
        if VALID in tables:
            V = stack([tables[VALID]], part)
            e["reliability_2025"] = reliability(V)
            e["prior"]["r2_2025"] = prior_r2(V, P, tau2) if len(V["b"]) > 20 else None
        params[part] = e
        rv = e.get("reliability_2025", {})
        log(f"    {part:9s} tau {e['tau']:.3f} (res {e['tau_res']:.3f})  split-half r {rel['r_half']:.2f} -> SB"
            f" {rel['spearman_brown']:.2f} (n {rel['n_hitters']}); 2025 SB {rv.get('spearman_brown', float('nan')):.2f};"
            f" prior R2 train {_f(e['prior']['r2_train'])} / 2025 {_f(e['prior'].get('r2_2025'))}")
    # two-strike composite: true-score correlation of ts_swing and ts_foul (cross-half covariances)
    rho = two_strike_rho(tr, params)
    out["two_strike_true_corr"] = rho
    log(f"    two-strike swing vs foul true-score correlation {rho}")
    out["stability_2024_2025"] = stability(tables, params) if 2024 in tables and VALID in tables else None
    if out["stability_2024_2025"]:
        log("    2024 shrunk -> 2025 raw: " + ", ".join(f"{k} r {v['corr']:.2f} slope {v['slope']:.2f}"
                                                         for k, v in out["stability_2024_2025"].items()))
    # presets from the training hitter-seasons
    Z = []
    for s in out["train"]:
        Z.append(shrunk_z(tables[s], params, rho, min_pa=PRESET_MIN_PA))
    Zc = {k: np.concatenate([z[k] for z in Z]) for k in Z[0]} if Z else {}
    out["presets"] = presets(Zc)
    out["presets_2025"] = presets(shrunk_z(tables[VALID], params, rho, min_pa=PRESET_MIN_PA)) if VALID in tables else None
    out["trait_size_vs_placeholder"] = {p: dict(fit_tau_logit=params[p].get("tau"), placeholder=SIM_TRAIT_SIZE.get(p))
                                        for p in PARTS}
    # prefill
    out["prefill"] = {}
    for s in prefill_seasons:
        if s not in data:
            continue
        path, n = write_prefill(level, s, data, params, rho, out_dir)
        out["prefill"][str(s)] = dict(path=path, hitters=n)
        log(f"    prefill {level} {s}: {n} hitters -> {path}")
    out["params"] = {p: {k: v for k, v in e.items() if not k.startswith("_")} for p, e in params.items()}
    return out


def two_strike_rho(tables, params):
    if "tau" not in params.get("ts_swing", {}) or "tau" not in params.get("ts_foul", {}):
        return None
    a, b = stack(tables, "ts_swing", min_n=0), stack(tables, "ts_foul", min_n=0)
    m = (a["no"] >= 10) & (a["ne"] >= 10) & (b["no"] >= 10) & (b["ne"] >= 10)
    if m.sum() < 20:
        return None
    c = 0.5 * (np.cov(a["bo"][m], b["be"][m])[0, 1] + np.cov(b["bo"][m], a["be"][m])[0, 1])
    return float(np.clip(c / (params["ts_swing"]["tau"] * params["ts_foul"]["tau"]), -0.9, 1.0))


def hitter_traits(T, params, rho, idx=None):
    """shrunk traits per hitter in SD units (and logits) -> dict part -> arrays"""
    idx = np.arange(len(T["key"])) if idx is None else idx
    res = {}
    for part in PARTS:
        e = params.get(part, {})
        if "tau" not in e:
            continue
        b, se, n = (x[idx] for x in T[part])
        pr = prior_of(e["_P"], T["slot"][idx], T["team_z"][idx])
        has = n > 0
        sh, sse, R = shrink(b, se, pr, e["_P"]["tau2_res"])
        sh = np.where(has, sh, pr)
        sse = np.where(has, sse, np.sqrt(e["_P"]["tau2_res"]))
        R = np.where(has, R, 0.0)
        mean = e["_P"]["mean"]
        res[part] = dict(z=SIGN[part] * (sh - mean) / e["tau"], se_z=sse / e["tau"], logit=sh - mean, se_logit=sse,
                         raw=b - mean, raw_se=se, n=n, R=R, prior_z=SIGN[part] * (pr - mean) / e["tau"])
    if "ts_swing" in res and "ts_foul" in res:
        k = np.sqrt(2 + 2 * max(rho or 0.0, 0.0))      # rho floored at 0: anti-correlated parts aren't inflated
        z = (res["ts_swing"]["z"] + res["ts_foul"]["z"]) / k
        se = np.sqrt(res["ts_swing"]["se_z"] ** 2 + res["ts_foul"]["se_z"] ** 2) / k
        res["two_strike"] = dict(z=z, se_z=se, prior_z=(res["ts_swing"]["prior_z"] + res["ts_foul"]["prior_z"]) / k)
    return res


def shrunk_z(T, params, rho, min_pa):
    idx = np.flatnonzero(T["pa"] >= min_pa)
    r = hitter_traits(T, params, rho, idx)
    out = {t: r[t]["z"] for t in TRAITS if t in r}
    out["pa"] = T["pa"][idx]
    return out


def presets(Z):
    if not Z or len(Z.get("pa", [])) < 50:
        return None
    res = {}
    for name, (rule, sgn) in PRESET_RULES.items():
        if rule == "early-contact":
            if "early" not in Z or "contact" not in Z:
                continue
            score = (Z["early"] - Z["contact"]) / np.sqrt(2)
        else:
            if rule not in Z:
                continue
            score = sgn * Z[rule]
        cut = np.quantile(score, 1 - PRESET_SHARE)
        m = score >= cut
        res[name] = dict(n=int(m.sum()), of=int(len(m)), rule=f"top {int(PRESET_SHARE * 100)}% of "
                         + ("-" if sgn < 0 else "") + rule,
                         fit={t: round(float(Z[t][m].mean()), 2) for t in TRAITS if t in Z},
                         placeholder=SIM_PRESETS[name])
    return res


def stability(tables, params):
    """2024 shrunk value vs 2025 raw estimate for the same team + name key (logit units). Slope ~1 = calibrated
    shrinkage if talent were stable; < 1 also reflects real year-to-year change."""
    A, B = tables[2024], tables[VALID]
    ka = {k.split("|", 2)[2]: i for i, k in enumerate(A["key"])}
    pairs = [(ka[k.split("|", 2)[2]], j) for j, k in enumerate(B["key"]) if k.split("|", 2)[2] in ka]
    if len(pairs) < 30:
        return None
    ia, ib = np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs])
    m = (A["pa"][ia] >= MIN_PA) & (B["pa"][ib] >= MIN_PA)
    ia, ib = ia[m], ib[m]
    out = {}
    for part in PARTS:
        e = params.get(part, {})
        if "tau" not in e or len(ia) < 30:
            continue
        b, se, n = (x[ia] for x in A[part])
        pr = prior_of(e["_P"], A["slot"][ia], A["team_z"][ia])
        sh = shrink(b, se, pr, e["_P"]["tau2_res"])[0]
        y = B[part][0][ib]
        ok = (n > 0) & (B[part][2][ib] > 0)
        if ok.sum() < 30:
            continue
        x_, y_ = sh[ok], y[ok]
        slope = float(np.cov(x_, y_)[0, 1] / np.var(x_, ddof=1))
        out[part] = dict(n=int(ok.sum()), corr=float(np.corrcoef(x_, y_)[0, 1]), slope=slope)
    return out


# --- prefill ----------------------------------------------------------------------------------------------------------------
def write_prefill(level, season, data, params, rho, out_dir):
    """the season's hitters, with their own PAs from this season and the two before it (same team + name key),
    recency-weighted 0.5^(age / 2); priors from this season's slot and team strength"""
    S = data[season]
    T = season_table(S)
    nH = len(S.hitters)
    base = {k.split("|", 2)[2]: i for i, k in enumerate(S.hitters)}
    pooled = {}
    for part in PARTS:
        hs, offs, ys, ws = [], [], [], []
        for age in (0, 1, 2):
            s = season - age
            if s not in data:
                continue
            assert_not_heldout(s)
            D = data[s]
            h, g, off, y = observations(D)[part]
            mapto = np.array([base.get(k.split("|", 2)[2], -1) for k in D.hitters], dtype=np.int64)
            hh = mapto[h] if len(h) else h
            m = hh >= 0
            hs.append(hh[m]); offs.append(off[m]); ys.append(y[m]); ws.append(np.full(m.sum(), 0.5 ** (age / 2)))
        h, off, y, w = (np.concatenate(x) if x else np.zeros(0) for x in (hs, offs, ys, ws))
        pooled[part] = estimate(h.astype(np.int64), off, y, nH, w=w)
    T2 = dict(T)
    for part in PARTS:
        T2[part] = pooled[part]
    tr = hitter_traits(T2, params, rho)
    hitters = {}
    for i, key in enumerate(S.hitters):
        if T["pa"][i] == 0:
            continue
        rec = dict(team=T["team"][i], slot=int(T["slot"][i]), pa_season=int(T["pa"][i]),
                   hand="RLS?"[int(T["hand"][i])], team_strength_z=round(float(T["team_z"][i]), 3), traits={})
        for t in TRAITS:
            if t not in tr:
                continue
            r = tr[t]
            d = dict(value=round(float(r["z"][i]), 3), se=round(float(r["se_z"][i]), 3),
                     prior=round(float(r["prior_z"][i]), 3))
            if "n" in r:
                d.update(n=round(float(r["n"][i]), 1), reliability=round(float(r["R"][i]), 3),
                         logit=round(float(r["logit"][i]), 4), raw_logit=round(float(r["raw"][i]), 4))
            if t == "two_strike":
                d["parts"] = {p: dict(value=round(float(tr[p]["z"][i]), 3), se=round(float(tr[p]["se_z"][i]), 3),
                                      n=round(float(tr[p]["n"][i]), 1)) for p in ("ts_swing", "ts_foul") if p in tr}
            if t == "spray" and T["hand"][i] == 3:
                d["note"] = "hand not printed: prior only"
            rec["traits"][t] = d
        hitters[key] = rec
    meta = dict(provisional=True, level=level, season=season, label=FIT_LEVEL[level],
                generated=datetime.date.today().isoformat(),
                units="hitter SD (simulate.py trait units); value = shrunk estimate, se = posterior SD, prior = slot x team prior",
                key="level|season|team id|last name|first initial (team id s:<school id> or n:<printed name>)",
                pooled_seasons=[season - a for a in (0, 1, 2) if season - a in data],
                recency_weight="0.5^(age/2)", heldout_never_loaded=2026,
                note="PROVISIONAL: fit on the college data in hand; not wired into the engine or the app")
    d = os.path.join(out_dir, "prefill")
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, f"{level}_{season}.json")
    with open(path, "w", encoding="utf-8", newline="") as fh:
        json.dump(dict(meta=meta, hitters=hitters), fh, indent=0, sort_keys=True)
    return path.replace("\\", "/"), len(hitters)


def parse_years(txt):
    a, _, b = txt.partition("-")
    return list(range(int(a), int(b or a) + 1))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--levels", default="D1,D2,D3")
    ap.add_argument("--train", default="2022-2024")
    ap.add_argument("--prefill", default="2025")
    ap.add_argument("--max-games", type=int, default=None)
    ap.add_argument("--db", default=H.DB)
    ap.add_argument("--out", default=OUT_DIR)
    a = ap.parse_args(argv)
    train = fit_seasons(parse_years(a.train))
    pre = fit_seasons(parse_years(a.prefill))
    con = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    res = dict(provisional=True, generated=datetime.date.today().isoformat(), heldout_never_loaded=2026,
               note="PROVISIONAL: fit on the college data in hand; numbers move as the scrapes land. Not wired.",
               levels={})
    for lv in a.levels.split(","):
        print(f"[{lv}] {FIT_LEVEL[lv]}")
        res["levels"][lv] = run_level(con, lv, train, pre, max_games=a.max_games, out_dir=a.out)
    path = os.path.join(a.out, "traits_summary.json")
    with open(path, "w", encoding="utf-8", newline="") as fh:
        json.dump(res, fh, indent=1, default=lambda o: o.tolist() if hasattr(o, "tolist") else float(o))
    print(f"wrote {path} ({time.time() - t0:.0f}s)")
    return res


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
