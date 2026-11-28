"""Task A of hitter_data.hs_hanger_cv: the HS pitch kind x velocity table fit on the engine's real base, scored against the
shipped table (double count) and no table. See hs_hanger_cv's docstring. 2026 is never loaded."""
import json
import os
import time

import numpy as np

from . import assert_not_heldout, fit_seasons
from . import fit_count as FC
from . import fit_count_hs as HS
from . import harness as H
from .harness_adapters import CI
from .hs_hanger_cv import CAND, GROUPS, OUT, SEED, load_tables

SEASONS = HS.SEASONS          # 2022-2025
VERSIONS = ("shipped", "none", "refit")
C02 = CI[(0, 2)]
TWO = [CI[(b, 2)] for b in range(4)]


def engine_base(T, S):
    """per pitch: the engine's six event probabilities before pitch_velo, for the pitch's kind (blank / other: all kinds)"""
    p = S.pit
    idx = (p["ci"], p["o"], p["bi"], p["sd"], p["lt"])
    out = T[None][0][idx].copy()
    kind = p["kind"].astype(np.int64)
    for gi, g in enumerate(GROUPS):
        m = kind == gi
        out[m] = T[g][0][tuple(a[m] for a in idx)]
    return out


def fit_stack(P_list, S_list, alpha=HS.TERM_ALPHA):
    """fit_count_hs.pitch_table's stack (kind, velo_rel, velo_abs; sequential; shrunk with alpha) on the given base"""
    r = {}
    P = [x.copy() for x in P_list]
    for term in HS.PV_TERMS:
        r[term] = HS.fit_term(P, S_list, term, alpha=alpha)
        P = [HS.apply_term(x, S, term, r[term]) for x, S in zip(P, S_list)]
    return r


def apply_stack(P, S, r):
    for term in HS.PV_TERMS:
        P = HS.apply_term(P, S, term, r[term])
    return P


def sep_base(thru, S):
    with open(FC.out_path(HS.LEVEL, "sep", thru), encoding="utf-8") as fh:
        t = FC.tables_from_json(json.load(fh))
    return HS.base_p6(t, S)


def versions(T, fit_S, S_te, sep_thru):
    """-> {version: per-pitch P6 on S_te}, plus the fitted stacks"""
    Pb_te = engine_base(T, S_te)
    r_ship = fit_stack([sep_base(sep_thru, S) for S in fit_S], fit_S)
    r_ref = fit_stack([engine_base(T, S) for S in fit_S], fit_S)
    return {"shipped": apply_stack(Pb_te, S_te, r_ship), "none": Pb_te, "refit": apply_stack(Pb_te, S_te, r_ref)}, \
        {"shipped": r_ship, "refit": r_ref}


def stack_from_table(tab):
    """an engine pitch_velo dict -> the r arrays apply_stack takes"""
    r = {"kind": np.ones((12, len(HS.KINDS), 6)), "velo_rel": np.ones((12, 24, 6)), "velo_abs": np.ones((12, 24, 6))}
    for (b, k), ci in CI.items():
        c = f"{b}-{k}"
        for i, kn in enumerate(HS.KINDS):
            r["kind"][ci, i] = tab["kind"][c][kn]
        for term in ("velo_rel", "velo_abs"):
            for cl, cls in enumerate(HS.CLASSES[:4]):
                for j in range(6):
                    r[term][ci, cl * 6 + j] = tab[term][c][cls][j]
    return r


def whiff_stats(P, S):
    """model-implied (P given) or data (P None) whiff stats on S's pitches: 0-2 slider / fastball whiff ratio per pitch and
    per swing, slider whiff per swing at two strikes"""
    p = S.pit
    kind = p["kind"].astype(np.int64)
    ci = p["ci"].astype(np.int64)
    if P is None:
        y = p["y"].astype(np.int64)
        P = np.eye(6)[y]
    wh, sw = P[:, 3], P[:, 3] + P[:, 4] + P[:, 5]
    out = {}
    m02 = ci == C02
    sl, fb = kind == GROUPS.index("Slider"), kind == GROUPS.index("Fastball")
    out["sl_fb_whiff_per_pitch_0_2"] = float(wh[m02 & sl].mean() / wh[m02 & fb].mean())
    out["sl_fb_whiff_per_swing_0_2"] = float((wh[m02 & sl].sum() / sw[m02 & sl].sum()) / (wh[m02 & fb].sum() / sw[m02 & fb].sum()))
    two = np.isin(ci, TWO)
    out["sl_whiff_per_swing_two_strikes"] = float(wh[two & sl].sum() / sw[two & sl].sum())
    out["fb_whiff_per_swing_two_strikes"] = float(wh[two & fb].sum() / sw[two & fb].sum())
    return out


def strat_weights(S_list, B, seed):
    """game-clustered bootstrap within each season (stratified) and a two-stage season + game bootstrap, over the pooled
    games of S_list: -> {"game": [B, G], "season_game": [B, G]}"""
    rng = np.random.default_rng(seed)
    sizes = [S.n_games for S in S_list]
    G = sum(sizes)
    off = np.cumsum([0] + sizes)
    wg = np.zeros((B, G))
    for i, n in enumerate(sizes):
        wg[:, off[i]:off[i + 1]] = rng.multinomial(n, np.full(n, 1.0 / n), size=B)
    ws = np.zeros((B, G))
    K = len(S_list)
    for b in range(B):
        draw = rng.multinomial(K, np.full(K, 1.0 / K))
        for i, c in enumerate(draw):
            n = sizes[i]
            for _ in range(c):
                ws[b, off[i]:off[i + 1]] += rng.multinomial(n, np.full(n, 1.0 / n))
    return {"game": wg, "season_game": ws}


def pooled_diff(S_list, d_list, Ws):
    """pitch-weighted mean of the per-pitch differences pooled over seasons, with each bootstrap scheme's SE"""
    loss_g, n_g = [], []
    for S, d in zip(S_list, d_list):
        a, n = H.per_game(d, S.pit["g"].astype(np.int64), S.n_games)
        loss_g.append(a)
        n_g.append(n)
    loss_g, n_g = np.concatenate(loss_g), np.concatenate(n_g)
    m, se = H.boot_all(loss_g, n_g, Ws)
    return m, se


def run_a(B=1000, log=print):
    fit_seasons(SEASONS)
    for s in SEASONS:
        assert_not_heldout(s)
    t0 = time.time()
    con = HS.connect()
    Ss = {s: HS.load_season(con, s) for s in SEASONS}
    res = {"heldout_touched": False, "boot": B, "seed": SEED, "alpha": HS.TERM_ALPHA, "terms": list(HS.PV_TERMS)}
    # ---- primary: fit <= 2024, score 2025, as-scored engine copy
    T24 = load_tables("s2024")
    fit_S = [Ss[s] for s in SEASONS if s < 2025]
    S25 = Ss[2025]
    P, stacks = versions(T24, fit_S, S25, 2024)
    # the literal as-scored file (count_v13core_s2024.json levels.hs.pitch_velo, fit <= 2024, built from older caches)
    with open(os.path.join(CAND, "count_v13core_s2024.json"), encoding="utf-8") as fh:
        P["shipped_file"] = apply_stack(engine_base(T24, S25), S25, stack_from_table(json.load(fh)["levels"]["hs"]["pitch_velo"]))
    # what ships, as scored: the refit on the as-scored base whose HS mean-preservation scalars are re-solved with it on
    if os.path.exists(os.path.join(OUT, "tables", "s2024cv_all_0.npz")):
        P["refit_mp"] = apply_stack(engine_base(load_tables("s2024cv"), S25), S25, stacks["refit"])
    y = S25.pit["y"]
    L = {v: HS.loss5(P[v], y) for v in P}
    Ws = H.boot_weights(S25, B, SEED)
    prim = {"season": 2025, "fit_seasons": [S.season for S in fit_S], "n_pitches": int(len(y)), "n_games": S25.n_games,
            "means": {v: float(L[v].mean()) for v in L}, "diffs": {}}
    for a_, b_ in (("refit", "shipped"), ("none", "shipped"), ("refit", "none"), ("shipped_file", "shipped"),
                   ("refit", "shipped_file"), ("none", "shipped_file"), ("refit_mp", "shipped"), ("refit_mp", "refit")):
        if a_ not in L:
            continue
        m, se = HS.paired(S25, L[a_], L[b_], Ws)
        prim["diffs"][f"{a_}_minus_{b_}"] = dict(diff=m, se=se, z=m / se if se else None)
    prim["whiff"] = {"data": whiff_stats(None, S25), **{v: whiff_stats(P[v], S25) for v in P}}
    prim["by_count"] = {}
    ci = S25.pit["ci"].astype(np.int64)
    for (b, k), i in sorted(CI.items(), key=lambda x: x[1]):
        m_ = ci == i
        prim["by_count"][f"{b}-{k}"] = {v: float(L[v][m_].mean()) for v in VERSIONS}
    res["primary"] = prim
    log(f"A primary (fit {prim['fit_seasons']}, score 2025, {prim['n_pitches']:,} pitches, {prim['n_games']} games):")
    for v in L:
        log(f"   {v:12s} pitch_5way {prim['means'][v]:.5f}")
    for k, d in prim["diffs"].items():
        log(f"   {k:22s} {d['diff']:+.5f} (SE {d['se']:.5f}, z {d['z']:+.1f})")
    log(f"   whiff: {json.dumps(prim['whiff'])}")
    # the refit table as it would ship (fit on every season <= 2025, engine base = the shipped tables)
    Tsh = load_tables("ship")
    r_ship_all = fit_stack([engine_base(Tsh, Ss[s]) for s in SEASONS], [Ss[s] for s in SEASONS])
    res["refit_thru2025_kind_0_2"] = {GROUPS[i] if i < 4 else "other": r_ship_all["kind"][C02, i].round(4).tolist()
                                      for i in range(5)}
    # ---- robustness: leave one season out, shipped engine base
    loso = {"folds": {}}
    d_rs, d_ns, S_list = [], [], []
    for s in SEASONS:
        fS = [Ss[x] for x in SEASONS if x != s]
        P_, _ = versions(Tsh, fS, Ss[s], 2025)
        yy = Ss[s].pit["y"]
        L_ = {v: HS.loss5(P_[v], yy) for v in VERSIONS}
        Wf = H.boot_weights(Ss[s], B, SEED + s)
        f = {"means": {v: float(L_[v].mean()) for v in VERSIONS}, "n_pitches": int(len(yy))}
        for a_, b_ in (("refit", "shipped"), ("none", "shipped"), ("refit", "none")):
            m, se = HS.paired(Ss[s], L_[a_], L_[b_], Wf)
            f[f"{a_}_minus_{b_}"] = dict(diff=m, se=se)
        f["whiff"] = {"data": whiff_stats(None, Ss[s]), **{v: whiff_stats(P_[v], Ss[s]) for v in VERSIONS}}
        loso["folds"][str(s)] = f
        d_rs.append(L_["refit"] - L_["shipped"])
        d_ns.append(L_["none"] - L_["shipped"])
        S_list.append(Ss[s])
        log(f"   LOSO {s}: refit-shipped {f['refit_minus_shipped']['diff']:+.5f} (SE {f['refit_minus_shipped']['se']:.5f}); "
            f"none-shipped {f['none_minus_shipped']['diff']:+.5f} (SE {f['none_minus_shipped']['se']:.5f})")
    Wp = strat_weights(S_list, B, SEED + 1)
    for nm, d in (("refit_minus_shipped", d_rs), ("none_minus_shipped", d_ns)):
        m, se = pooled_diff(S_list, d, Wp)
        fold_mean = float(np.mean([loso["folds"][str(s)][nm]["diff"] for s in SEASONS]))
        loso[nm] = dict(pooled=m, se=se, se_max=max(se.values()), mean_of_folds=fold_mean)
        log(f"   LOSO pooled {nm}: {m:+.5f} (SE game {se['game']:.5f}, season+game {se['season_game']:.5f}); "
            f"mean of folds {fold_mean:+.5f}")
    res["loso"] = loso
    # ---- ship rule
    pr = prim["diffs"]["refit_minus_shipped"]
    ns = prim["diffs"]["none_minus_shipped"]
    refit_wins = -pr["diff"] > 2 * pr["se"] and loso["refit_minus_shipped"]["pooled"] <= 0 \
        and loso["refit_minus_shipped"]["mean_of_folds"] <= 0
    if refit_wins:
        decision = "refit"
    elif -ns["diff"] > 2 * ns["se"]:
        decision = "none"
    else:
        decision = "stop"
    res["ship_rule"] = dict(decision=decision, refit_beats_shipped_2025_gain=-pr["diff"], refit_se=pr["se"],
                            refit_loso_pooled=loso["refit_minus_shipped"]["pooled"],
                            refit_loso_mean_of_folds=loso["refit_minus_shipped"]["mean_of_folds"],
                            none_beats_shipped_2025_gain=-ns["diff"], none_se=ns["se"])
    log(f"A ship rule: {decision} ({json.dumps(res['ship_rule'])})")
    res["seconds"] = round(time.time() - t0, 1)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "a_scores.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(res, f, indent=1, default=lambda o: o.item() if isinstance(o, np.generic) else str(o))
    log(f"wrote {os.path.join(OUT, 'a_scores.json')} ({res['seconds']} s). 2026 was not loaded.")
    return res
