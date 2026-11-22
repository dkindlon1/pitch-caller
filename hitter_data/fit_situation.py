"""v1.3 Part 3.3 (plan 3.3): situation effects on the hitter, fit per college level. PROVISIONAL: run on the data in
hand; the numbers move as the scrapes land. Nothing here is wired into either engine.

Effects tested (each "ships only on validation gain", plan 1.3):
- tto         times through the order as a SMOOTH curve: a quadratic in x = pitcher batters faced before the PA / 9
              (capped at 36 = four times through). No step at the third time by construction.
- risp        a runner on second or third.
- late_close  the harness / engine rule: inning >= scheduled innings - 2 and |margin| <= 2.
- prev        the previous pitch of the PA: whiff or foul vs a take (ball or called strike), split by whether the
              current count has two strikes (4 terms).

Model, per pitch (the harness's pitch_5way: take-ball incl. HBP / take-strike / whiff / foul / in play):
  log P(y) = alpha[count, y] + x . beta[:, y]   (y = take-ball is the reference; multinomial logit)
alpha alone reproduces the per-count frequencies (the harness's base_count = v1.2_recal bar), so each effect's gain is
measured against exactly the harness's bar. Secondary, per ball in play (out incl. error / 1B / 2B / 3B / HR), with
tto, risp and late_close.

Fit seasons: up to 8 seasons <= 2024 with recency weights (half-life 2 seasons, harness.recency_weight).
Validation: 2025, full games only (as the harness), log loss per pitch vs the count-only model, with SEs from the
harness's game / home-team / two-team bootstraps (the largest is used). Each effect is scored alone (count + effect vs
count) and dropped from the full model (full vs full without it).
The bar: gain > 2 SE AND gain >= harness.MIN_EFFECT (0.002 nats per pitch, the harness's PROPOSED minimum effect; the
plan sets no size, so this is the bar used here).

2026 is never loaded (fit_seasons / assert_not_heldout on every season).
HS / travel (level "hs", Perfect Game, HS and travel pooled): late and close uses 7 scheduled innings; pool games often
stop early on the time limit, so the hs fit is also rerun on games that reached the 7th ("hs_full_length") to show the
format confound.
usage: python -m hitter_data.fit_situation [--levels D1,D2,D3,hs] [--boot 300] [--out DIR] [--max-games N]"""
import argparse
import datetime
import json
import os
import sqlite3
import sys
import time

import numpy as np
from scipy.optimize import minimize

from . import DATA, assert_not_heldout, fit_seasons
from . import harness as H
from .fit_traits_data import BF_CAP
from .fit_traits_hs import HS_DB, HS_LEVEL, connect_hs, load_any

VALID = 2025
LEVELS = ("D1", "D2", "D3", "hs")
FIT_LEVEL = {"D1": "fit-eligible", "D2": "THIN", "D3": "THIN", "hs": "fit-eligible (HS + travel pooled)"}
NB = BF_CAP + 1
K5 = ("take_ball", "take_strike", "whiff", "foul", "in_play")
KB = ("out", "1B", "2B", "3B", "HR")
EFFECTS = {"tto": ["tto_x", "tto_x2"], "risp": ["risp"], "late_close": ["late_close"],
           "prev": ["prev_whiff_lt2", "prev_foul_lt2", "prev_whiff_2s", "prev_foul_2s"]}
BIP_EFFECTS = {k: v for k, v in EFFECTS.items() if k != "prev"}
SLOT = [f"slot_{k}" for k in range(10) if k != 1]       # nuisance: lineup slot (batter quality), slot 1 = reference
STRIKES = np.array([k for b in range(4) for k in range(3)])
OUT_DIR = os.path.join(DATA, "fits")


# --- cells ----------------------------------------------------------------------------------------------------------
NP = 12 * NB * 16 * 10           # pitch cells: count x bf x risp x late x prev x slot (0 = unknown)
NBC = 12 * NB * 4 * 10           # ball-in-play cells: count x bf x risp x late x slot


def pitch_cells(ci, bf, risp, lc, prev, slot):
    return ((((ci.astype(np.int64) * NB + bf) * 2 + risp) * 2 + lc) * 4 + prev) * 10 + slot


def decode_pitch_cells():
    c0 = np.arange(NP)
    slot = c0 % 10
    c = c0 // 10
    prev = c % 4
    lc = (c // 4) % 2
    risp = (c // 8) % 2
    bf = (c // 16) % NB
    ci = c // (16 * NB)
    return ci, bf, risp, lc, prev, slot


def bip_cells(ci, bf, risp, lc, slot):
    return (((ci.astype(np.int64) * NB + bf) * 2 + risp) * 2 + lc) * 10 + slot


def decode_bip_cells():
    c0 = np.arange(NBC)
    slot = c0 % 10
    c = c0 // 10
    lc = c % 2
    risp = (c // 2) % 2
    bf = (c // 4) % NB
    ci = c // (4 * NB)
    return ci, bf, risp, lc, slot


def features(ci, bf, risp, lc, prev=None, slot=None):
    x = bf / 9.0
    s2 = STRIKES[ci] == 2
    f = {"tto_x": x, "tto_x2": x * x, "risp": risp.astype(float), "late_close": lc.astype(float)}
    if slot is not None:
        for k in range(10):
            if k != 1:
                f[f"slot_{k}"] = (slot == k).astype(float)
    if prev is not None:
        f.update(prev_whiff_lt2=((prev == 2) & ~s2).astype(float), prev_foul_lt2=((prev == 3) & ~s2).astype(float),
                 prev_whiff_2s=((prev == 2) & s2).astype(float), prev_foul_2s=((prev == 3) & s2).astype(float))
    return f


def y5_of(y6):
    return np.where(y6 <= 1, 0, y6 - 1).astype(np.int64)


def yb_of(r):
    return np.where(r == 5, 0, r).astype(np.int64)


# --- the multinomial logit with per-count intercepts ------------------------------------------------------------------
class MNL:
    """log P(y | cell) = alpha[count(cell), y] + X[cell] . beta[:, y]; y = 0 is the reference (zeros)."""

    def __init__(self, names, K):
        self.names, self.K = list(names), K

    def logp(self, ci, X, alpha=None, beta=None):
        alpha = self.alpha if alpha is None else alpha
        beta = self.beta if beta is None else beta
        eta = np.zeros((len(ci), self.K))
        eta[:, 1:] = alpha[ci] + (X @ beta if X.shape[1] else 0.0)
        eta -= eta.max(axis=1, keepdims=True)
        return eta - np.log(np.exp(eta).sum(axis=1, keepdims=True))

    def fit(self, ci, X, N, ridge=1e-4):
        """ci [C], X [C, F], N [C, K] weighted counts."""
        K, F = self.K, X.shape[1]
        keep = N.sum(axis=1) > 0
        ci, X, N = ci[keep], X[keep], N[keep]
        n = N.sum(axis=1)
        tot = n.sum()

        def unpack(th):
            return th[:12 * (K - 1)].reshape(12, K - 1), th[12 * (K - 1):].reshape(F, K - 1)

        def f(th):
            a, b = unpack(th)
            lp = self.logp(ci, X, a, b)
            ll = (N * lp).sum()
            P = np.exp(lp)
            R = N[:, 1:] - n[:, None] * P[:, 1:]          # d ll / d eta
            ga = np.zeros((12, K - 1))
            np.add.at(ga, ci, R)
            gb = X.T @ R
            obj = -ll / tot + ridge * (b ** 2).sum()
            g = np.concatenate([-ga.ravel() / tot, (-gb / tot + 2 * ridge * b).ravel()])
            return obj, g

        # start alpha at the per-count log odds vs the reference
        a0 = np.zeros((12, K - 1))
        for c in range(12):
            m = ci == c
            s = N[m].sum(axis=0) + 0.5
            a0[c] = np.log(s[1:] / s[0])
        th0 = np.concatenate([a0.ravel(), np.zeros(F * (K - 1))])
        r = minimize(f, th0, jac=True, method="L-BFGS-B", options={"maxiter": 2000, "gtol": 1e-10, "ftol": 1e-14})
        self.alpha, self.beta = unpack(r.x)
        self.converged = bool(r.success)
        return self


def design(feat, names):
    return np.column_stack([feat[n] for n in names]) if names else np.zeros((len(next(iter(feat.values()))), 0))


# --- data -------------------------------------------------------------------------------------------------------------
def season_pitch_counts(S, full_only=True):
    p = S.pit
    m = p["bf"] >= 0
    if full_only:
        m &= S.g_full[p["g"]]
    cells = pitch_cells(p["ci"][m], p["bf"][m], p["risp"][m], p["lc"][m], p["prev"][m], p["slot"][m])
    y = y5_of(p["y"][m])
    N = np.zeros((NP, 5))
    np.add.at(N, (cells, y), 1.0)
    return N, dict(cells=cells, y=y, g=p["g"][m].astype(np.int64), dropped_no_pitcher=int((p["bf"] < 0).sum()))


def season_bip_counts(S, full_only=True):
    b = S.bip
    m = (b["bf"] >= 0) & (b["ci"] >= 0)
    if full_only:
        m &= S.g_full[b["g"]]
    cells = bip_cells(b["ci"][m], b["bf"][m], b["risp"][m], b["lc"][m], b["slot"][m])
    y = yb_of(b["r"][m])
    N = np.zeros((NBC, 5))
    np.add.at(N, (cells, y), 1.0)
    return N, dict(cells=cells, y=y, g=b["g"][m].astype(np.int64))


class _Boot:
    """the minimal Season-like object harness.boot_weights needs, restricted to the scored games"""

    def __init__(self, S, games):
        teams = sorted({S.g_home[i] for i in games} | {S.g_away[i] for i in games})
        tix = {t: i for i, t in enumerate(teams)}
        self.n_games, self.n_teams = len(games), len(teams)
        self.home = np.array([tix[S.g_home[i]] for i in games], dtype=np.int64)
        self.away = np.array([tix[S.g_away[i]] for i in games], dtype=np.int64)


def paired_gain(loss_ref, loss_new, g, Ws, G):
    """mean(loss_ref - loss_new) per event, with each bootstrap scheme's SE and the max"""
    d = loss_ref - loss_new
    dg = np.bincount(g, weights=d, minlength=G)
    ng = np.bincount(g, minlength=G).astype(float)
    mean, se = H.boot_all(dg, ng, Ws)
    return mean, se, max(v for v in se.values() if v == v)


# --- effect sizes on the validation mix -------------------------------------------------------------------------------
def pitch_rates(P, w):
    w = w / w.sum()
    sw = P[:, 2:].sum(axis=1)
    take = P[:, :2].sum(axis=1)
    return {"swing": float((w * sw).sum()),
            "cstrike_given_take": float((w * P[:, 1]).sum() / max((w * take).sum(), 1e-12)),
            "whiff_given_swing": float((w * P[:, 2]).sum() / max((w * sw).sum(), 1e-12)),
            "foul_given_swing": float((w * P[:, 3]).sum() / max((w * sw).sum(), 1e-12)),
            "inplay_given_swing": float((w * P[:, 4]).sum() / max((w * sw).sum(), 1e-12))}


def bip_rates(P, w):
    w = w / w.sum()
    return {"hit": float((w * P[:, 1:].sum(axis=1)).sum()), "xbh": float((w * P[:, 2:].sum(axis=1)).sum()),
            "hr": float((w * P[:, 4]).sum())}


def diff(a, b):
    return {k: round(a[k] - b[k], 5) for k in a}


def pitch_effects(model, names, w_cells):
    """average effects on the 2025 validation mix (w_cells = 2025 pitch counts per cell)"""
    ci, bf, risp, lc, prev, slot = decode_pitch_cells()
    m = w_cells > 0
    ci, bf, risp, lc, prev, slot, w = ci[m], bf[m], risp[m], lc[m], prev[m], slot[m], w_cells[m]

    def P(bf_=None, risp_=None, lc_=None, prev_=None, sel=None):
        s = np.ones(len(ci), bool) if sel is None else sel
        f = features(ci[s], bf[s] if bf_ is None else np.full(s.sum(), bf_), risp[s] if risp_ is None else np.full(s.sum(), risp_),
                     lc[s] if lc_ is None else np.full(s.sum(), lc_), prev[s] if prev_ is None else np.full(s.sum(), prev_),
                     slot[s])
        return np.exp(model.logp(ci[s], design(f, names))), w[s]

    out = {}
    if "tto_x" in names:
        base = pitch_rates(*P(bf_=0))
        out["tto"] = {f"bf{b}_minus_bf0": diff(pitch_rates(*P(bf_=b)), base) for b in (9, 18, 27, 36)}
        out["tto"]["note"] = "bf = pitcher batters faced before the PA (9 = start of the 2nd time through)"
    if "risp" in names:
        out["risp"] = diff(pitch_rates(*P(risp_=1)), pitch_rates(*P(risp_=0)))
    if "late_close" in names:
        out["late_close"] = diff(pitch_rates(*P(lc_=1)), pitch_rates(*P(lc_=0)))
    if "prev_whiff_lt2" in names:
        st = STRIKES[ci]
        e = {}
        for lab, sel in (("lt2", (st == 1)), ("2s", (st == 2))):
            take = pitch_rates(*P(prev_=1, sel=sel))
            e[f"after_whiff_minus_take_{lab}"] = diff(pitch_rates(*P(prev_=2, sel=sel)), take)
            e[f"after_foul_minus_take_{lab}"] = diff(pitch_rates(*P(prev_=3, sel=sel)), take)
        e["note"] = "lt2 = counts with one strike; 2s = two-strike counts; same counts, previous pitch changed"
        out["prev"] = e
    return out


def bip_effects(model, names, w_cells):
    ci, bf, risp, lc, slot = decode_bip_cells()
    m = w_cells > 0
    ci, bf, risp, lc, slot, w = ci[m], bf[m], risp[m], lc[m], slot[m], w_cells[m]

    def R(bf_=None, risp_=None, lc_=None):
        f = features(ci, bf if bf_ is None else np.full(len(ci), bf_), risp if risp_ is None else np.full(len(ci), risp_),
                     lc if lc_ is None else np.full(len(ci), lc_), None, slot)
        return bip_rates(np.exp(model.logp(ci, design(f, names))), w)

    out = {}
    if "tto_x" in names:
        out["tto"] = {f"bf{b}_minus_bf0": diff(R(bf_=b), R(bf_=0)) for b in (9, 18, 27, 36)}
    if "risp" in names:
        out["risp"] = diff(R(risp_=1), R(risp_=0))
    if "late_close" in names:
        out["late_close"] = diff(R(lc_=1), R(lc_=0))
    return out


# --- one level ----------------------------------------------------------------------------------------------------------
def run_level(con, level, fit_years, B=300, seed=7, max_games=None, log=print, load_kw=None):
    """con: a connection (college) or {"college": con, "hs": con}; load_kw goes to the hs loader"""
    load_kw = load_kw or {}
    fit_years = fit_seasons(fit_years)
    assert_not_heldout(VALID)
    Np = np.zeros((NP, 5))
    Nb = np.zeros((NBC, 5))
    used = {}
    for s in fit_years:
        t = time.time()
        S = load_any(con, level, s, max_games=max_games, **load_kw)
        if S.g_full.sum() == 0:
            continue
        w = H.recency_weight(s, VALID)
        n_p, _ = season_pitch_counts(S)
        n_b, _ = season_bip_counts(S)
        Np += w * n_p
        Nb += w * n_b
        used[s] = dict(weight=round(w, 4), full_games=int(S.g_full.sum()), pitches=int(n_p.sum()), bip=int(n_b.sum()))
        log(f"  {level} {s}: {int(S.g_full.sum())} full games, {int(n_p.sum())} pitches, weight {w:.3f} ({time.time() - t:.0f}s)")
    if not used:
        return dict(level=level, status="no fit data")
    V = load_any(con, level, VALID, max_games=max_games, **load_kw)
    vp_counts, vp = season_pitch_counts(V)
    vb_counts, vb = season_bip_counts(V)
    full_games = np.flatnonzero(V.g_full)
    remap = -np.ones(V.n_games, dtype=np.int64)
    remap[full_games] = np.arange(len(full_games))
    G = len(full_games)
    Ws = H.boot_weights(_Boot(V, full_games), B, seed)
    log(f"  {level} {VALID} (validation): {G} full games, {len(vp['y'])} pitches, {len(vb['y'])} balls in play")

    out = dict(level=level, label=FIT_LEVEL[level], fit_seasons=used, valid_season=VALID, valid_games=G,
               valid_pitches=int(len(vp["y"])), valid_bip=int(len(vb["y"])),
               valid_pitches_dropped_no_pitcher=vp["dropped_no_pitcher"], bar=dict(min_effect=H.MIN_EFFECT, se_mult=2))

    for kind, N, Vd, decode, effects, K in (("pitch", Np, vp, decode_pitch_cells, EFFECTS, 5),
                                           ("bip", Nb, vb, decode_bip_cells, BIP_EFFECTS, 5)):
        dec = decode()
        ci_all = dec[0]
        feat_all = features(*dec) if kind == "pitch" else features(*dec[:4], None, dec[4])
        gv = remap[Vd["g"]]

        def loss(names):
            m = MNL(names, K).fit(ci_all, design(feat_all, names), N)
            lp = m.logp(ci_all, design(feat_all, names))
            return m, -lp[Vd["cells"], Vd["y"]]

        base_m, base_l = loss([])
        all_names = [n for v in effects.values() for n in v]
        full_m, full_l = loss(all_names)
        res = dict(base_loss=float(base_l.mean()), full_loss=float(full_l.mean()))
        g, se, sem = paired_gain(base_l, full_l, gv, Ws, G)
        res["full_gain"] = dict(gain=g, se=se, se_max=sem)
        res["effects"] = {}
        for eff, names in effects.items():
            m1, l1 = loss(names)
            rest = [n for n in all_names if n not in names]
            m0, l0 = loss(rest)
            ga, sea, seam = paired_gain(base_l, l1, gv, Ws, G)
            gd, sed, sedm = paired_gain(l0, full_l, gv, Ws, G)
            clears = bool(ga > 2 * seam and ga >= H.MIN_EFFECT) if kind == "pitch" else None
            res["effects"][eff] = dict(
                terms=names, beta={n: [round(float(v), 4) for v in m1.beta[i]] for i, n in enumerate(names)},
                beta_classes=list((K5 if kind == "pitch" else KB)[1:]),
                gain_alone=dict(gain=ga, se=sea, se_max=seam, z=ga / seam if seam else None),
                gain_drop_one=dict(gain=gd, se=sed, se_max=sedm),
                clears_bar=clears, converged=bool(m1.converged and m0.converged))
            log(f"    {kind:5s} {eff:10s} gain alone {ga:+.5f} (SE {seam:.5f}, z {ga / seam if seam else 0:+.1f})"
                f"  drop-one {gd:+.5f} (SE {sedm:.5f})" + ("" if clears is None else f"  clears bar: {clears}"))
        w_cells = (vp_counts if kind == "pitch" else vb_counts).sum(axis=1)
        res["effect_sizes"] = (pitch_effects if kind == "pitch" else bip_effects)(full_m, all_names, w_cells)
        res["full_beta"] = {n: [round(float(v), 4) for v in full_m.beta[i]] for i, n in enumerate(all_names)}
        # lineup slot as a nuisance (batter quality): slot 1 bats at bf 0, 9, 18 ..., so tto alone partly measures slot
        slot_m, slot_l = loss(SLOT)
        gs, ses, sesm = paired_gain(base_l, slot_l, gv, Ws, G)
        res["slot_nuisance_gain"] = dict(gain=gs, se=ses, se_max=sesm)
        adj = {}
        for eff, names in effects.items():
            m1, l1 = loss(SLOT + names)
            ga, sea, seam = paired_gain(slot_l, l1, gv, Ws, G)
            adj[eff] = dict(gain=ga, se=sea, se_max=seam, z=ga / seam if seam else None,
                            clears_bar=bool(ga > 2 * seam and ga >= H.MIN_EFFECT) if kind == "pitch" else None)
            log(f"    {kind:5s} {eff:10s} given slot: gain {ga:+.5f} (SE {seam:.5f})")
        res["given_slot"] = adj
        fs_m, _ = loss(SLOT + all_names)
        res["effect_sizes_given_slot"] = (pitch_effects if kind == "pitch" else bip_effects)(fs_m, SLOT + all_names, w_cells)
        out[kind] = res
        log(f"    {kind:5s} all effects: gain {g:+.5f} (SE {sem:.5f}); count-only loss {res['base_loss']:.4f}")
    return out


def fit_years_for(level, valid=VALID, window=H.FIT_WINDOW):
    return fit_seasons(range(valid - window, valid))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--levels", default="D1,D2,D3,hs")
    ap.add_argument("--hs-db", default=HS_DB)
    ap.add_argument("--boot", type=int, default=300)
    ap.add_argument("--max-games", type=int, default=None, help="per season, for a quick run")
    ap.add_argument("--db", default=H.DB)
    ap.add_argument("--out", default=OUT_DIR)
    a = ap.parse_args(argv)
    con = {"college": sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)}
    if HS_LEVEL in a.levels.split(","):
        con[HS_LEVEL] = connect_hs(a.hs_db)
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    res = dict(provisional=True, generated=datetime.date.today().isoformat(), heldout_never_loaded=2026,
               note="PROVISIONAL: fit on the college data in hand; numbers move as the scrapes land. Not wired.",
               levels={})
    for lv in a.levels.split(","):
        print(f"[{lv}] {FIT_LEVEL[lv]}")
        res["levels"][lv] = run_level(con, lv, fit_years_for(lv), B=a.boot, max_games=a.max_games)
        if lv == HS_LEVEL:
            print(f"[{lv}] format check: only games that reached the 7th inning (fit and validation)")
            r = run_level(con, lv, fit_years_for(lv), B=a.boot, max_games=a.max_games,
                          load_kw=dict(full_length_only=True))
            r["label"] = "format check: games that reached the 7th only"
            res["levels"]["hs_full_length"] = r
    path = os.path.join(a.out, "situation_effects.json")
    with open(path, "w", encoding="utf-8", newline="") as fh:
        json.dump(res, fh, indent=1, default=float)
    print(f"wrote {path} ({time.time() - t0:.0f}s)")
    return res


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
