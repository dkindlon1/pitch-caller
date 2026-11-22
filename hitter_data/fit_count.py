"""v1.3 count layer fit, per college level (plan 3.1; buildout Part 3.1). PROVISIONAL: see docs/FITS_COUNT_v13.md.

What it fits, per level (D1, D2, D3; D2 / D3 labelled THIN while their full-game coverage is low):
  - per count x outs x bases (x side x late, the harness contexts): ball, HBP, called strike, whiff, foul, in play;
    equivalently swing / take, called strike given take, whiff / foul / in play given swing;
  - ball in play: result (out, 1B, 2B, 3B, HR, E) by count x outs x bases, and type given result by count;
  - platoon (same / opposite hand) and late-and-close as per-count multiplicative offsets.

Model (a shrinkage chain; every alpha is a pseudo-count in pitches):
    p_c        = per-count frequencies (after borrowing)
    p_cbo      = count x outs x bases, shrunk to p_c (A_bo)
    f_sd, f_lt = per-count side / late offsets, shrunk to 1 (A_sd, A_lt)
    p_full     = (count x base-out x side x late cell) shrunk to normalise(p_cbo * f_sd * f_lt) (A_cell)
  Recency: season weight 0.5 ** ((target - 1 - season) / half_life), seasons in the 8 before the target.
  Borrowing (variant "borrow"): a cell with fewer than K weighted pitches is topped up to K with the neighbouring
  levels' data (D1 <-> D2 <-> D3, by data weight), shifted to this level's per-count rates (the level offset).
  The printed share borrowed is the borrowed pseudo-pitches over (own + borrowed), weighted by the level's own pitches.
  Variants for the level-split check: "sep" (each level alone), "shared" (one pooled pattern for all levels + a
  per-level 6-outcome offset, raked), "borrow" (sep + neighbour borrowing).

Tuning: every hyper-parameter (half-life, alphas, K) is chosen on the 2025 validation season with the fit on <= 2024
(coordinate descent on the harness's primary metric, pitch_5way, computed from counts). The tables written for scoring
are fit on <= 2024; the "ship" tables refit the same choices on <= 2025 (2026, the held-out test, is never used).

usage:
  python -m hitter_data.fit_count                 # tune on 2025, write candidates + report to {DATA}/fits
  python -m hitter_data.fit_count --no-cache      # rebuild the per-season counts first"""
import argparse
import csv
import json
import os
import time

import numpy as np

from . import assert_not_heldout, fit_seasons
from . import fit_count_data as FD
from .harness_adapters import BIP_RESULTS, BIP_TYPES, COUNTS, P6_NAMES

LEVELS = ("D1", "D2", "D3")
NEIGHBOURS = {"D1": ("D2",), "D2": ("D1", "D3"), "D3": ("D2",)}
THIN = {"D2", "D3"}               # full-game share < 0.5 in 2025 (coverage.csv): provisional AND thin
VALID = 2025                      # validation season (NOT the held-out test; that is 2026, never touched)
WINDOW = 8
INF = 1e9
DEFAULTS = dict(half_life=2.0, A_bo=50.0, A_sd=1000.0, A_lt=1000.0, A_cell=INF, K=500.0, B_bo=50.0)
GRID = dict(half_life=[0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, INF],
            A_bo=[10.0, 25.0, 50.0, 100.0, 200.0, 400.0, 800.0, 1600.0, 3200.0, INF],
            A_sd=[50.0, 200.0, 1000.0, 5000.0, INF],
            A_lt=[50.0, 200.0, 1000.0, 5000.0, INF],
            A_cell=[50.0, 200.0, 1000.0, 5000.0, INF],
            K=[0.0, 100.0, 500.0, 2000.0, 5000.0, 20000.0],
            B_bo=[10.0, 50.0, 200.0, 1000.0, INF])
EPS = 1e-12
CK = [f"{b}-{k}" for b, k in COUNTS]
BASES = ["000", "100", "020", "120", "003", "103", "023", "123"]      # bi = on1 + 2 on2 + 4 on3


# ----------------------------------------------------------------------------------------------------------------------
def norm(x, axis=-1):
    return x / np.maximum(x.sum(axis=axis, keepdims=True), EPS)


def shrink(n, prior, alpha):
    """(n + alpha * prior) / (sum n + alpha), last axis = outcomes."""
    if alpha >= INF:
        return np.broadcast_to(prior, n.shape).copy()
    return (n + alpha * prior) / (n.sum(axis=-1, keepdims=True) + alpha)


def ev5(p6):
    return np.concatenate([p6[..., :1] + p6[..., 1:2], p6[..., 2:]], axis=-1)


def loss_pitch(P6, V6):
    """pitch_5way mean log loss of tables P6 [12,3,8,3,2,6] on validation counts V6 (same shape)."""
    v = ev5(V6)
    return float(-(v * np.log(np.clip(ev5(P6), EPS, 1))).sum() / max(v.sum(), EPS))


def loss_bip_result(R, Vbip):
    """bip_result mean log loss: R [12,3,8,6] (P(result | in play)) vs validation bip counts [12,3,8,3,2,5,6]."""
    v = Vbip.sum(axis=(3, 4, 5))
    return float(-(v * np.log(np.clip(R, EPS, 1))).sum() / max(v.sum(), EPS))


# ----------------------------------------------------------------------------------------------------------------------
def borrow(own, nbrs, own_parent, nbr_parent, K):
    """Top up cells of `own` [..., m] (counts, the first axis is the count) with fewer than K pitches, from the
    neighbours' pooled counts shifted to this level's per-count rates. -> (augmented counts, borrowed weight)."""
    if K <= 0 or not nbrs:
        return own, np.zeros(own.shape[:-1])
    pool = sum(nbrs)
    q = norm(pool + 1e-9)
    shift = own_parent / np.maximum(nbr_parent, EPS)                   # [12, m]
    q = norm(q * shift.reshape((12,) + (1,) * (own.ndim - 2) + (own.shape[-1],)))
    n = own.sum(axis=-1)
    m = np.maximum(K - n, 0.0) * (pool.sum(axis=-1) > 0)
    return own + m[..., None] * q, m


def count_marg(ev):
    return ev.sum(axis=(1, 2, 3, 4))


def fit_p6(own, nbrs, prm, variant):
    """own / nbrs: weighted ev6 counts [12,3,8,3,2,6]. -> (P6 tables, diagnostics)."""
    diag = {}
    pc_own = norm(count_marg(own) + 0.5)
    if variant == "borrow" and nbrs:
        pc_nbr = norm(sum(count_marg(x) for x in nbrs) + 0.5)
        K = prm["K"]
        aug_c, m_c = borrow(count_marg(own), [count_marg(x) for x in nbrs], pc_own, pc_nbr, K)
        aug_bo, m_bo = borrow(own.sum(axis=(3, 4)), [x.sum(axis=(3, 4)) for x in nbrs], pc_own, pc_nbr, K)
        aug_sd, _ = borrow(own.sum(axis=(1, 2, 4)), [x.sum(axis=(1, 2, 4)) for x in nbrs], pc_own, pc_nbr, K)
        aug_lt, _ = borrow(own.sum(axis=(1, 2, 3)), [x.sum(axis=(1, 2, 3)) for x in nbrs], pc_own, pc_nbr, K)
        aug_full, m_full = borrow(own, nbrs, pc_own, pc_nbr, K)
        n_bo = own.sum(axis=(3, 4, 5))
        n_full = own.sum(axis=-1)
        diag["borrowed_share_count_bo"] = float((n_bo * m_bo / np.maximum(n_bo + m_bo, EPS)).sum() / max(n_bo.sum(), EPS))
        diag["borrowed_share_cell"] = float((n_full * m_full / np.maximum(n_full + m_full, EPS)).sum() / max(n_full.sum(), EPS))
        diag["cells_borrowing_count_bo"] = f"{int((m_bo > 0).sum())}/{m_bo.size}"
        diag["borrowed_share_count"] = float((count_marg(own).sum(-1) * m_c / np.maximum(count_marg(own).sum(-1) + m_c, EPS)).sum()
                                             / max(own.sum(), EPS))
        diag["borrowed_by_count_bo"] = m_bo / np.maximum(n_bo + m_bo, EPS)
    else:
        aug_c, aug_bo = count_marg(own), own.sum(axis=(3, 4))
        aug_sd, aug_lt, aug_full = own.sum(axis=(1, 2, 4)), own.sum(axis=(1, 2, 3)), own
    pc = norm(aug_c + 0.5)
    p_bo = shrink(aug_bo, pc[:, None, None, :], prm["A_bo"])
    f_sd = shrink(aug_sd, pc[:, None, :], prm["A_sd"]) / pc[:, None, :]
    f_lt = shrink(aug_lt, pc[:, None, :], prm["A_lt"]) / pc[:, None, :]
    prior = norm(p_bo[:, :, :, None, None, :] * f_sd[:, None, None, :, None, :] * f_lt[:, None, None, None, :, :])
    P6 = shrink(aug_full, prior, prm["A_cell"])
    diag.update(pc=pc, p_bo=p_bo, f_sd=f_sd, f_lt=f_lt)
    return norm(P6), diag


def rake_level(P, n, target, iters=30):
    """One 6-outcome multiplier for the whole level (the "level offset"): mean over the level's contexts = target."""
    for _ in range(iters):
        m = (P * n[..., None]).reshape(-1, P.shape[-1]).sum(axis=0) / max(n.sum(), EPS)
        P = norm(P * (target / np.maximum(m, EPS)))
    return P


def fit_bip(own_bip, nbr_bips, prm, variant):
    """-> (R [12,3,8,6] P(result | in play), TGR [12,4,6] P(type | result, count))."""
    R_own = own_bip.sum(axis=(3, 4, 5))                                   # [12,3,8,6]
    rc_own = norm(R_own.sum(axis=(1, 2)) + 0.5)
    if variant == "borrow" and nbr_bips:
        R_n = [x.sum(axis=(3, 4, 5)) for x in nbr_bips]
        rc_n = norm(sum(r.sum(axis=(1, 2)) for r in R_n) + 0.5)
        Rc, _ = borrow(R_own.sum(axis=(1, 2)), [r.sum(axis=(1, 2)) for r in R_n], rc_own, rc_n, prm["K"] / 4)
        Rbo, _ = borrow(R_own, R_n, rc_own, rc_n, prm["K"] / 4)
    else:
        Rc, Rbo = R_own.sum(axis=(1, 2)), R_own
    rc = norm(Rc + 0.5)
    R = norm(shrink(Rbo, rc[:, None, None, :], prm["B_bo"]))
    known = own_bip[..., :4, :].sum(axis=(1, 2, 3, 4))                    # [12,4,6]
    if variant == "borrow" and nbr_bips:
        known = known + 0.25 * sum(x[..., :4, :].sum(axis=(1, 2, 3, 4)) for x in nbr_bips) * \
            (known.sum() / max(sum(x[..., :4, :].sum() for x in nbr_bips), EPS))
    pooled = norm(known.sum(axis=0) + 0.5, axis=0)                         # [4,6] P(type | result)
    TGR = (known + 20 * pooled[None]) / (known.sum(axis=1, keepdims=True) + 20)
    return R, TGR


def fit_level(W, level, prm, variant):
    """W: {level: weighted counts}. -> dict of fitted arrays for one level."""
    own = W[level]
    if variant == "shared":
        pooled_ev = sum(W[l]["ev6"] for l in W)
        P6, diag = fit_p6(pooled_ev, [], prm, "sep")
        n = own["ev6"].sum(axis=-1)
        tgt = norm(own["ev6"].sum(axis=(0, 1, 2, 3, 4)) + 0.5)
        P6 = rake_level(P6, n, tgt)
        R, TGR = fit_bip(sum(W[l]["bip"] for l in W), [], prm, "sep")
        nR = own["bip"].sum(axis=(3, 4, 5, 6))
        R = rake_level(R, nR, norm(own["bip"].sum(axis=(0, 1, 2, 3, 4, 5)) + 0.5))
        diag["pc"] = norm((P6 * n[..., None]).sum(axis=(1, 2, 3, 4)) + EPS)
    else:
        nb = [W[l]["ev6"] for l in NEIGHBOURS[level] if l in W]
        P6, diag = fit_p6(own["ev6"], nb, prm, variant)
        R, TGR = fit_bip(own["bip"], [W[l]["bip"] for l in NEIGHBOURS[level] if l in W], prm, variant)
    return dict(P6=P6, R=R, TGR=TGR, diag=diag)


# ----------------------------------------------------------------------------------------------------------------------
def weighted_all(data, target, half_life):
    W, wts = {}, {}
    for lv, per in data.items():
        W[lv], wts[lv] = FD.weighted(per, target, half_life, WINDOW)
    return W, wts


def evaluate(data, level, prm, variant, target, cache):
    hl = prm["half_life"]
    if hl not in cache:
        cache[hl] = weighted_all(data, target, hl)[0]
    f = fit_level(cache[hl], level, prm, variant)
    V = data[level][target]
    return loss_pitch(f["P6"], V["ev6"]), loss_bip_result(f["R"], V["bip"])


def tune(data, level, variant, target=VALID, passes=2, log=None):
    """Coordinate descent over GRID on the target season's pitch_5way (B_bo on bip_result). -> (params, trace)."""
    fit_seasons([target])
    prm = dict(DEFAULTS)
    if variant != "borrow":
        prm["K"] = 0.0
    keys = [k for k in GRID if not (k == "K" and variant != "borrow")]
    cache, trace = {}, []
    for _ in range(passes):
        for k in keys:
            best = None
            for v in GRID[k]:
                trial = dict(prm, **{k: v})
                lp, lb = evaluate(data, level, trial, variant, target, cache)
                score = lb if k == "B_bo" else lp
                trace.append((k, v, lp, lb))
                if best is None or score < best[0] - 1e-9:
                    best = (score, v)
            prm[k] = best[1]
    lp, lb = evaluate(data, level, prm, variant, target, cache)
    if log:
        log(f"  {level} {variant}: tuned on {target}: {fmt_prm(prm)} -> pitch_5way {lp:.5f}, bip_result {lb:.5f}")
    return prm, trace, (lp, lb)


def fmt_prm(p):
    return ", ".join(f"{k}={'inf' if v >= INF else (f'{v:g}')}" for k, v in p.items())


# ----------------------------------------------------------------------------------------------------------------------
def chain_terms(p6):
    """6-way pitch probabilities -> the engine's chain terms."""
    ball, hbp, cs, wh, fo, ip = (float(x) for x in p6)
    take, swing = ball + hbp + cs, wh + fo + ip
    return dict(swing=round(swing, 5), cstrike_given_take=round(cs / max(take, EPS), 5),
                hbp_given_take=round(hbp / max(take, EPS), 5), whiff_given_swing=round(wh / max(swing, EPS), 5),
                foul_given_swing=round(fo / max(swing, EPS), 5), inplay_given_swing=round(ip / max(swing, EPS), 5))


def r5(a):
    return np.round(np.asarray(a, float), 6).tolist()


def proxy_rates(c):
    n = np.maximum(c["bipn"], EPS)
    return {CK[i]: dict(n_bip=round(float(c["bipn"][i]), 1), hard=round(float(c["hard"][i] / n[i]), 4),
                        weak=round(float(c["weak"][i] / n[i]), 4)) for i in range(12)}


def runs_simple(c):
    """additive RE[o, bi] (shrunk to the overall mean, 20 PAs) and CV[count] from weighted counts."""
    overall = c["runs_sum"].sum() / max(c["runs_n"].sum(), EPS)
    RE = (c["runs_sum"] + 20 * overall) / (c["runs_n"] + 20)
    CV = (c["cv_sum"] - c["cv_n"] * RE[None]).sum(axis=(1, 2)) / np.maximum(c["cv_n"].sum(axis=(1, 2)), EPS)
    return RE, CV


def candidate_json(level, variant, prm, wts, f, Wl, target):
    d = f["diag"]
    P6 = f["P6"]
    n_ctx = Wl["ev6"].sum(axis=-1)
    n_c = n_ctx.sum(axis=(1, 2, 3, 4))
    count = {}
    for i, ck in enumerate(CK):
        e = dict(n_weighted=round(float(n_c[i]), 1), p6=r5(d["pc"][i]), **chain_terms(d["pc"][i]))
        if "borrowed_by_count_bo" in d:
            nbo = n_ctx.sum(axis=(3, 4))[i]
            e["borrowed_share"] = round(float((nbo * d["borrowed_by_count_bo"][i]).sum() / max(nbo.sum(), EPS)), 4)
        count[ck] = e
    platoon = {}
    if variant != "shared":
        for i, ck in enumerate(CK):
            platoon[ck] = {sd: chain_terms(norm(d["pc"][i] * d["f_sd"][i, j])) for j, sd in enumerate(("same", "opp"))}
    tc = f["TGR"]
    rc = norm((f["R"] * Wl["bip"].sum(axis=(3, 4, 5, 6))[..., None]).sum(axis=(1, 2)) + EPS)
    bip = {}
    for i, ck in enumerate(CK):
        joint = rc[i][None, :] * tc[i]                                    # [4 types, 6 results]
        bip[ck] = dict(result={r: round(float(rc[i][j]), 5) for j, r in enumerate(BIP_RESULTS)},
                       type={t: round(float(joint[a].sum()), 5) for a, t in enumerate(BIP_TYPES)},
                       result_given_type={t: {r: round(float(joint[a, j] / max(joint[a].sum(), EPS)), 5)
                                              for j, r in enumerate(BIP_RESULTS)} for a, t in enumerate(BIP_TYPES)})
    RE, CV = runs_simple(Wl)
    scalar_diag = {k: (round(v, 5) if isinstance(v, float) else v) for k, v in d.items() if isinstance(v, (float, str))}
    return {
        "provisional": FD.PROVISIONAL, "format": "count-layer-candidate/1 (docs/FITS_COUNT_v13.md section 8)",
        "level": level, "thin": level in THIN, "variant": variant, "predicts_season": target,
        "fit_seasons": {str(s): w for s, w in sorted(wts.items())}, "params": {k: (None if v >= INF else v) for k, v in prm.items()},
        "diagnostics": scalar_diag,
        "axes": {"count": CK, "outs": [0, 1, 2], "bases": BASES, "side": ["same", "opp", "unknown"], "late": [0, 1],
                 "p6": list(P6_NAMES), "bip_type": list(BIP_TYPES), "bip_result": list(BIP_RESULTS)},
        "count": count,
        "p6_count_bo": r5(d["p_bo"]),
        "n_count_bo": np.round(n_ctx.sum(axis=(3, 4)), 1).tolist(),          # weighted pitches per count x outs x bases
        "late_share": np.round(n_ctx.sum(axis=(1, 2, 3))[:, 1] / np.maximum(n_c, EPS), 5).tolist(),   # per count
        "p6_ctx": r5(P6),
        "platoon": platoon,
        "late_offset": r5(d["f_lt"]) if variant != "shared" else None,
        "bip": bip,
        "bip_result_count_bo": r5(f["R"]),
        "bip_type_given_result_count": r5(tc),
        "hard_proxy": proxy_rates(Wl),
        "runs": {"RE": r5(RE), "CV": r5(CV)},
    }


def tables_from_json(j):
    """Candidate JSON -> harness Tables (exactly what score_candidates scores)."""
    from .harness_adapters import SHAPE, Tables
    P6 = norm(np.asarray(j["p6_ctx"], float))
    R = norm(np.asarray(j["bip_result_count_bo"], float))
    TGR = np.asarray(j["bip_type_given_result_count"], float)
    joint = R[:, :, :, None, :] * TGR[:, None, None, :, :]                # [12,3,8,4,6]
    joint = joint / joint.sum(axis=(-2, -1), keepdims=True)
    BIP = np.broadcast_to(joint[:, :, :, None, None], SHAPE + (4, 6)).copy()
    return Tables(P6, BIP, np.asarray(j["runs"]["RE"]), np.asarray(j["runs"]["CV"]), name=j["variant"], level=j["level"])


# ----------------------------------------------------------------------------------------------------------------------
def out_path(level, variant, thru):
    return os.path.join(FD.FITS, "count_layer", f"{level}_{variant}_thru{thru}.json")


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=None, separators=(",", ":"))


def run(data=None, con=None, levels=LEVELS, variants=("sep", "borrow", "shared"), valid=VALID, passes=2,
        write=True, stability=True, log=print):
    """Tune every variant per level on `valid` (fit <= valid-1), write the scoring candidates (thru valid-1) and the
    ship refit (thru valid) for every variant, and return a summary dict."""
    fit_seasons([valid])
    t0 = time.time()
    if data is None:
        from . import harness as H
        data = FD.load_all(con or H.connect(), levels=levels, hi=valid, verbose=True)
    summary = {"provisional": FD.PROVISIONAL, "valid": valid, "levels": {}, "half_life_curve": {}, "stability": {}}
    for lv in levels:
        if valid not in data.get(lv, {}):
            log(f"  {lv}: no {valid} games; skipped")
            continue
        summary["levels"][lv] = {}
        for var in variants:
            prm, trace, (lp, lb) = tune(data, lv, var, valid, passes, log)
            Wv, wts = weighted_all(data, valid, prm["half_life"])
            f = fit_level(Wv, lv, prm, var)
            js = candidate_json(lv, var, prm, wts[lv], f, Wv[lv], valid)
            Ws, wts_s = weighted_all(data, valid + 1, prm["half_life"])         # ship refit: <= valid (never 2026)
            fs = fit_level(Ws, lv, prm, var)
            jss = candidate_json(lv, var, prm, wts_s[lv], fs, Ws[lv], valid + 1)
            if write:
                write_json(out_path(lv, var, valid - 1), js)
                write_json(out_path(lv, var, valid), jss)
                if var == "borrow":                       # the platoon check: same fit with the side offsets off
                    p0 = dict(prm, A_sd=INF)
                    j0 = candidate_json(lv, "borrow_noplatoon", p0, wts[lv], fit_level(Wv, lv, p0, var), Wv[lv], valid)
                    write_json(out_path(lv, "borrow_noplatoon", valid - 1), j0)
            hl_curve = {}
            for v in GRID["half_life"]:
                hl_curve["inf" if v >= INF else v] = round(min(t[2] for t in trace if t[0] == "half_life" and t[1] == v), 5)
            summary["levels"][lv][var] = dict(params=prm, pitch_5way=lp, bip_result=lb, fit_seasons=wts[lv],
                                              diagnostics=js["diagnostics"], half_life_curve=hl_curve)
        if stability and (valid - 1) in data[lv] and len([s for s in data[lv] if s < valid - 1]) >= 2:
            prm1, _, (lp1, _) = tune(data, lv, "borrow", valid - 1, 1, None)
            summary["stability"][lv] = dict(half_life_tuned_on_prev=prm1["half_life"], params=prm1, pitch_5way=lp1)
            log(f"  {lv} stability: tuned on {valid - 1} (fit <= {valid - 2}): {fmt_prm(prm1)}")
    summary["seconds"] = round(time.time() - t0, 1)
    if write:
        write_json(os.path.join(FD.FITS, "count_layer", "summary.json"),
                   json.loads(json.dumps(summary, default=lambda o: None if isinstance(o, np.ndarray) else str(o))))
        write_report(summary, data)
    return summary


def write_report(summary, data):
    """CSV + markdown tables of the ship candidates ({DATA}/fits/count_layer/report_*.{csv,md})."""
    d = os.path.join(FD.FITS, "count_layer")
    rows = []
    for lv in summary["levels"]:
        for var, s in summary["levels"][lv].items():
            rows.append(dict(level=lv, variant=var, thin=lv in THIN, pitch_5way_2025=round(s["pitch_5way"], 5),
                             bip_result_2025=round(s["bip_result"], 5), **{k: s["params"][k] for k in DEFAULTS},
                             **{k: v for k, v in s["diagnostics"].items() if k.startswith("borrowed_share")}))
    keys = sorted({k for r in rows for k in r}, key=lambda k: (k not in ("level", "variant"), k))
    with open(os.path.join(d, "report_tuning.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)
    L = [f"# Count layer candidates (PROVISIONAL)\n\n{FD.PROVISIONAL}\n"]
    for lv, best in [(lv, v) for lv in summary["levels"] for v in ("shared", "borrow") if v in summary["levels"][lv]]:
        with open(out_path(lv, best, summary["valid"]), encoding="utf-8") as fh:
            j = json.load(fh)
        L.append(f"\n## {lv}{' (THIN)' if lv in THIN else ''}: {best}, ship refit, fit seasons (weights) {j['fit_seasons']}\n")
        L.append("| count | n | swing | cs/take | whiff/sw | foul/sw | inplay/sw | borrowed | hard/BIP | weak/BIP |")
        L.append("|---|---|---|---|---|---|---|---|---|---|")
        for ck in CK:
            c, h = j["count"][ck], j["hard_proxy"][ck]
            L.append(f"| {ck} | {c['n_weighted']:.0f} | {c['swing']:.3f} | {c['cstrike_given_take']:.3f} | "
                     f"{c['whiff_given_swing']:.3f} | {c['foul_given_swing']:.3f} | {c['inplay_given_swing']:.3f} | "
                     f"{c.get('borrowed_share', 0):.3f} | {h['hard']:.3f} | {h['weak']:.3f} |")
    with open(os.path.join(d, "report_tables.md"), "w", encoding="utf-8", newline="") as f:
        f.write("\n".join(L) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--levels", default="D1,D2,D3")
    ap.add_argument("--valid", type=int, default=VALID)
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--passes", type=int, default=2)
    a = ap.parse_args(argv)
    assert_not_heldout(a.valid)
    from . import harness as H
    levels = tuple(a.levels.split(","))
    data = FD.load_all(H.connect(), levels=LEVELS, hi=a.valid, cache=not a.no_cache, verbose=True)
    s = run(data=data, levels=levels, valid=a.valid, passes=a.passes)
    print(f"wrote {FD.FITS}/count_layer ({s['seconds']} s). 2026 not touched.")
    return s


if __name__ == "__main__":
    main()
