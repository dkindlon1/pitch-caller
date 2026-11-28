"""Task B of hitter_data.hs_hanger_cv: the hanger gate H from data (HS; see hs_hanger_cv's docstring for why college can't
enter). 2026 is never loaded.

Per pitch, wild_today on the engine's definition (engine.wild_today / landing_estimate) applied to the data: for the pitcher
and pitch kind, his strikes earlier in this game minus his expected strikes, over LAND_K + pitches, times -LAND_GAIN,
capped at [-LAND_SHARP_MAX, LAND_MAX]; 0 before his first pitch of that kind today. A strike is anything but a ball or HBP.
His expected strike chance on a pitch is the level's rate at that count for that kind, shifted (logit) by his own strike
rate on that kind in his OTHER games this season, shrunk to the level with NORMAL_K pseudo-pitches. (The engine's
expectation is per called target and leaves chase targets out; the archives log no targets.)

The gate on a pitch: H x min(1, wild_today / HANGER_GATE_FULL) when wild_today > 0 and the pitch is off-speed, else 0. Its
P(result | in play) is the engine's per-kind table (as-scored copy, fit <= 2024) with that much extra hard-contact logit
on the heart band, interpolated between the gate grid's tables. H is fit by likelihood on <= 2024 balls in play and scored
on 2025 with the harness's bip_result (out / 1B / 2B / 3B / HR / E), paired against H = 0, game-clustered SE."""
import json
import os
import pickle
import time

import numpy as np

from . import assert_not_heldout, fit_seasons
from . import fit_count_hs as HS
from . import harness as H
from .harness_adapters import CI, _import_engine
from .hs_hanger_cv import GATES, GROUPS, OFFSPEED, OUT, SEED, envs, load_tables

SEASONS = HS.SEASONS
NORMAL_K = 50.0
H_GRID = np.round(np.arange(-2.0, 4.0001, 0.05), 4)


def season_b(con, s):
    assert_not_heldout(s)
    path = os.path.join(OUT, f"b_season_{s}_{HS.season_key(con, s)}.pkl")
    if os.path.exists(path):
        with open(path, "rb") as f:
            return pickle.load(f)
    S = HS.build_hs_season(con, s, keep_extra=True)
    os.makedirs(OUT, exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump(S, f)
    return S


def wild_today(S, e):
    """per pitch: the engine's wild_today on the data (see the module docstring)"""
    p = S.pit
    n = len(p["y"])
    kind = p["kind"].astype(np.int64)
    pid = p["pid"].astype(np.int64)
    g = p["g"].astype(np.int64)
    ci = p["ci"].astype(np.int64)
    strike = (p["y"] >= 2).astype(float)
    ok = (kind >= 0) & (kind < 4) & (pid != 0)
    # level strike rate by count x kind
    base = np.zeros((12, 4))
    for k in range(4):
        for c in range(12):
            m = ok & (kind == k) & (ci == c)
            base[c, k] = (strike[m].sum() + 1) / (m.sum() + 2)
    lev = np.array([strike[ok & (kind == k)].mean() for k in range(4)])
    # his season and per-game strike totals by kind -> his rate in his other games, shrunk
    key_s = pid * 8 + kind
    key_g = (pid * 8 + kind) * 100000 + g
    def tot(key):
        u, inv = np.unique(key[ok], return_inverse=True)
        return u, inv, np.bincount(inv, weights=strike[ok]), np.bincount(inv).astype(float)
    us, invs, sts, ns = tot(key_s)
    ug, invg, stg, ng = tot(key_g)
    st_o = sts[invs] - stg[invg]
    n_o = ns[invs] - ng[invg]
    kk = kind[ok]
    r_p = (st_o + NORMAL_K * lev[kk]) / (n_o + NORMAL_K)
    lg = lambda x: np.log(x / (1 - x))
    ex = np.zeros(n)
    ex[ok] = 1 / (1 + np.exp(-(lg(base[ci[ok], kk]) + lg(r_p) - lg(lev[kk]))))
    # running in-game record (pitches are in game order within each game)
    wt = np.zeros(n)
    run = {}
    idx = np.nonzero(ok)[0]
    for i in idx:
        k_ = (g[i], pid[i], kind[i])
        st, e_, m = run.get(k_, (0.0, 0.0, 0))
        if m:
            est = (st - e_) / (e.LAND_K + m)
            wt[i] = max(-e.LAND_SHARP_MAX, min(e.LAND_MAX, -e.LAND_GAIN * est))
        run[k_] = (st + strike[i], e_ + ex[i], m + 1)
    return wt


def res_tables(T_by_gate):
    """{gate: {group: RES [12, 3, 8, 3, 2, 6]}}"""
    return {x: {g: T[g][1].sum(axis=-2) for g in T} for x, T in T_by_gate.items()}


def bip_rows(S, wt):
    p = S.pit
    br = p["br"].astype(np.int64)
    kind = p["kind"].astype(np.int64)
    m = br >= 0
    return dict(g=p["g"][m].astype(np.int64), idx=tuple(p[k][m].astype(np.int64) for k in ("ci", "o", "bi", "sd", "lt")),
                kind=kind[m], br=br[m], wt=wt[m], n_all=int(m.sum()))


def probs_at(R, rows, Hh, e):
    """P(observed result) per ball in play at gate scale Hh (only off-speed pitches move)"""
    out = np.zeros(len(rows["br"]))
    gates = sorted(R)
    G = np.array(gates)
    base_all = R[0.0][None]
    out[:] = base_all[rows["idx"] + (rows["br"],)]
    for gi, g in enumerate(GROUPS):
        m = rows["kind"] == gi
        if not m.any():
            continue
        idx = tuple(a[m] for a in rows["idx"]) + (rows["br"][m],)
        if g not in OFFSPEED:
            out[m] = R[0.0][g][idx]
            continue
        wt = rows["wt"][m]
        x = np.where(wt > 0, Hh * np.minimum(1.0, wt / e.HANGER_GATE_FULL), 0.0)
        vals = np.stack([R[gg][g][idx] for gg in gates], axis=0)          # [n_gates, n]
        j = np.clip(np.searchsorted(G, x, side="right") - 1, 0, len(G) - 2)
        w = (x - G[j]) / (G[j + 1] - G[j])
        cols = np.arange(len(x))
        out[m] = vals[j, cols] * (1 - w) + vals[j + 1, cols] * w
    return out


def hard_rate_table(S_list, wt_list):
    """data: line drive or extra-base hit share of off-speed / fastball balls in play by wild_today bin"""
    bins = (-1, 0.0, 0.1, 0.2, 0.3, 0.6001)
    out = {}
    for cls, groups in (("offspeed", [GROUPS.index(g) for g in OFFSPEED]), ("fastball", [0])):
        rows = []
        for lo, hi in zip(bins, bins[1:]):
            n = h = 0
            for S, wt in zip(S_list, wt_list):
                p = S.pit
                br = p["br"].astype(np.int64)
                m = (br >= 0) & np.isin(p["kind"], groups) & (wt > lo) & (wt <= hi)
                n += int(m.sum())
                h += int(np.isin(br[m], (2, 3, 4)).sum())
            rows.append(dict(wt=f"({lo:g}, {hi:g}]", bip=n, xbh_share=h / n if n else None))
        out[cls] = rows
    return out


def run_b(B=1000, log=print):
    fit_seasons(SEASONS)
    for s in SEASONS:
        assert_not_heldout(s)
    t0 = time.time()
    os.environ.update(envs()["s2024"])
    e = _import_engine()
    con = HS.connect()
    Ss = {s: season_b(con, s) for s in SEASONS}
    wts = {s: wild_today(Ss[s], e) for s in SEASONS}
    T = {x: load_tables("s2024", x, groups=(None,) + GROUPS if x == 0 else OFFSPEED) for x in GATES}
    for x in GATES:
        if x != 0:
            T[x].update({g: T[0.0][g] for g in (None,) + GROUPS if g not in T[x]})
    R = res_tables(T)
    res = {"heldout_touched": False, "level": "HS", "boot": B, "seed": SEED, "normal_k": NORMAL_K,
           "engine": dict(LAND_K=e.LAND_K, LAND_GAIN=e.LAND_GAIN, LAND_MAX=e.LAND_MAX, LAND_SHARP_MAX=e.LAND_SHARP_MAX,
                          HANGER_GATE_FULL=e.HANGER_GATE_FULL, hanger_hard=e.HANGER),
           "college": "not estimable: the college archive logs no pitch types (so neither 'off-speed' nor 'that pitch' "
                      "today) and no locations"}
    rows = {s: bip_rows(Ss[s], wts[s]) for s in SEASONS}
    os_ids = [GROUPS.index(g) for g in OFFSPEED]
    for s in SEASONS:
        r = rows[s]
        os_m = np.isin(r["kind"], os_ids)
        res.setdefault("bip", {})[str(s)] = dict(all=r["n_all"], offspeed=int(os_m.sum()),
                                                 offspeed_wt_pos=int((os_m & (r["wt"] > 0)).sum()),
                                                 offspeed_wt_full=int((os_m & (r["wt"] >= e.HANGER_GATE_FULL)).sum()))
    res["data_xbh_by_wild_today"] = hard_rate_table([Ss[s] for s in SEASONS if s < 2025], [wts[s] for s in SEASONS if s < 2025])
    # fit on <= 2024
    fit = [rows[s] for s in SEASONS if s < 2025]
    ll = []
    for h in H_GRID:
        ll.append(sum(float(np.log(np.clip(probs_at(R, r, h, e), 1e-12, 1)).sum()) for r in fit))
    ll = np.array(ll)
    h_un = float(H_GRID[int(np.argmax(ll))])
    pos = H_GRID >= 0
    h_fit = float(H_GRID[pos][int(np.argmax(ll[pos]))])
    nfit = sum(len(r["br"]) for r in fit)
    res["fit"] = dict(seasons=[s for s in SEASONS if s < 2025], n_bip=nfit, H_unconstrained=h_un, H=h_fit,
                      loglik_gain_vs_0_per_bip=float((ll[pos].max() - ll[H_GRID == 0][0]) / nfit),
                      curve={f"{h:g}": float((v - ll[H_GRID == 0][0]) / nfit) for h, v in zip(H_GRID, ll) if abs(h * 4 - round(h * 4)) < 1e-9})
    log(f"B fit (HS <= 2024, {nfit:,} balls in play): H = {h_fit:g} (unconstrained {h_un:g}); "
        f"curve {json.dumps(res['fit']['curve'])}")
    # score 2025: bip_result, paired vs H = 0
    S25 = Ss[2025]
    r = rows[2025]
    Ws = H.boot_weights(S25, B, SEED)
    l0 = -np.log(np.clip(probs_at(R, r, 0.0, e), 1e-12, 1))
    sc = {}
    for nm, h in (("fit", h_fit), ("unconstrained", h_un), ("H=1", 1.0)):
        lh = -np.log(np.clip(probs_at(R, r, h, e), 1e-12, 1))
        a1 = H.per_game(lh - l0, r["g"], S25.n_games)
        m, se = H.boot_all(a1[0], a1[1], Ws)
        os_m = np.isin(r["kind"], os_ids)
        sc[nm] = dict(H=h, gain_per_bip=-m, se=max(se.values()), se_by=se, mean_loss_H0=float(l0.mean()),
                      gain_per_offspeed_bip=float(-(lh - l0)[os_m].mean()), n_bip=len(l0), n_offspeed=int(os_m.sum()))
        log(f"   2025 bip_result at H = {h:g} ({nm}): gain {-m:+.6f} nats per ball in play (SE {max(se.values()):.6f}); "
            f"{len(l0):,} balls in play, {int(os_m.sum()):,} off-speed")
    res["score_2025"] = sc
    g = sc["fit"]
    res["ship_rule_data"] = dict(H=h_fit, gain=g["gain_per_bip"], se=g["se"],
                                 passes=bool(h_fit > 0 and g["gain_per_bip"] > 2 * g["se"]))
    log(f"B data rule: {json.dumps(res['ship_rule_data'])}")
    res["seconds"] = round(time.time() - t0, 1)
    with open(os.path.join(OUT, "b_scores.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(res, f, indent=1, default=lambda o: o.item() if isinstance(o, np.generic) else str(o))
    log(f"wrote {os.path.join(OUT, 'b_scores.json')} ({res['seconds']} s). 2026 was not loaded.")
    return res
