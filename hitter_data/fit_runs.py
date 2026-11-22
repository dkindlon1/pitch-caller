"""v1.3 run values per college level: count x base-out, from runs in the rest of the inning (plan 3.1; buildout Part 3.2).
PROVISIONAL: see docs/FITS_COUNT_v13.md. 2026 is never used.

Fit, per level (D1; D2 and D3 THIN):
    RE[o, bi]          expected runs from the PA start to the end of the inning (shrunk to the level mean, 20 PAs)
    CV[count]          count value: mean (runs from the pitch state - RE) per count
    RV[count, o, bi]   the full count x base-out table, each cell shrunk toward RE + CV (A pitch states); cells with
                       fewer than K pitch states are topped up from the neighbouring levels' interaction term
                       (cell - additive), i.e. the same borrowing as the count layer, the level offset being the level's
                       own additive table. The share borrowed is printed.
Recency: the count layer's half-life and window (tuned here again on 2025 squared error).

Compared on 2025 (validation; fit <= 2024) with today's tables (engine.RE_BY_LEVEL / CV_BY_LEVEL, from run_tables.py;
D2 against both the D1 and the D3 tables, as the plan asks): mean squared error of runs in the rest of the inning,
  - from the PA start (RE only), and
  - from each pitch state (PAs without a mid-PA runner event), RE + CV vs the count x base-out RV,
with game / home-team / two-team bootstrap SEs (B = 1000) and paired differences.

usage:
  python -m hitter_data.fit_runs                  # fit, compare on 2025, write {DATA}/fits/run_values/*"""
import argparse
import json
import os
import time

import numpy as np

from . import assert_not_heldout
from . import fit_count as FC
from . import fit_count_data as FD
from . import harness as H
from .harness_adapters import COUNTS, _import_engine, bases_key

LEVELS = FC.LEVELS
INF = FC.INF
GRID = dict(half_life=[1.0, 2.0, 3.0, 4.0, 6.0, INF], A=[50.0, 200.0, 1000.0, 5000.0, 20000.0, INF],
            K=[0.0, 200.0, 1000.0, 5000.0])
DEFAULTS = dict(half_life=2.0, A=1000.0, K=1000.0)
OUT = os.path.join(FD.FITS, "run_values")


def additive(c):
    overall = c["runs_sum"].sum() / max(c["runs_n"].sum(), 1e-9)
    RE = (c["runs_sum"] + 20 * overall) / (c["runs_n"] + 20)
    CV = (c["cv_sum"] - c["cv_n"] * RE[None]).sum(axis=(1, 2)) / np.maximum(c["cv_n"].sum(axis=(1, 2)), 1e-9)
    return RE, CV


def fit_level(W, level, prm):
    """-> dict(RE[3,8], CV[12], RV[12,3,8], borrowed_share)."""
    own = W[level]
    RE, CV = additive(own)
    add = RE[None] + CV[:, None, None]
    n = own["cv_n"]
    mean = own["cv_sum"] / np.maximum(n, 1e-9)
    inter_num = n * (mean - add)                                           # own interaction, summed
    m = np.zeros_like(n)
    nb = [W[l] for l in FC.NEIGHBOURS[level] if l in W]
    if prm["K"] > 0 and nb:
        nb_n = sum(x["cv_n"] for x in nb)
        nb_inter = sum(x["cv_sum"] - x["cv_n"] * (lambda r, c: r[None] + c[:, None, None])(*additive(x)) for x in nb)
        nb_rate = nb_inter / np.maximum(nb_n, 1e-9)
        m = np.maximum(prm["K"] - n, 0) * (nb_n > 0)
        inter_num = inter_num + m * nb_rate
    A = prm["A"]
    RV = add + (inter_num / (n + m + A) if A < INF else 0.0)
    share = float((n * m / np.maximum(n + m, 1e-9)).sum() / max(n.sum(), 1e-9))
    return dict(RE=RE, CV=CV, RV=RV, borrowed_share=share, n=n)


def sq_loss_counts(fit, V):
    """mean squared error on the validation season from sufficient counts (cv_sum, cv_sq, cv_n): RV table."""
    RV, n = fit["RV"], V["cv_n"]
    return float((V["cv_sq"] - 2 * RV * V["cv_sum"] + RV * RV * n).sum() / max(n.sum(), 1e-9))


def tune(data, level, valid):
    prm, cache = dict(DEFAULTS), {}
    for _ in range(2):
        for k, vals in GRID.items():
            best = None
            for v in vals:
                t = dict(prm, **{k: v})
                hl = t["half_life"]
                if hl not in cache:
                    cache[hl] = FC.weighted_all(data, valid, hl)[0]
                s = sq_loss_counts(fit_level(cache[hl], level, t), data[level][valid])
                if best is None or s < best[0] - 1e-12:
                    best = (s, v)
            prm[k] = best[1]
    return prm


def today_tables(e, lv):
    RE = np.array([[e.RE_BY_LEVEL[lv][(o, bases_key(bi))] for bi in range(8)] for o in range(3)])
    CV = np.array([e.CV_BY_LEVEL[lv][bk] for bk in COUNTS])
    return RE, CV


def compare(con, level, season, fits, B=1000, seed=1):
    """Squared-error comparison on the real 2025 events with clustered bootstrap SEs. fits: {name: (RE, CV, RV|None)}."""
    assert_not_heldout(season)
    return compare_season(H.build_season(con, level, season), fits, B, seed)


def compare_season(S, fits, B=1000, seed=1):
    """compare() on an already built harness Season (college or HS)."""
    assert_not_heldout(S.season)
    Ws = H.boot_weights(S, B, seed)
    a, p = S.pa, S.pit
    m = p["run_ok"] == 1
    pg, pc = p["g"][m].astype(np.int64), p["ci"][m].astype(np.int64)
    po, pb, py = p["o"][m].astype(np.int64), p["bi"][m].astype(np.int64), p["rr"][m].astype(float)
    ag, ao, ab, ay = (a["r_g"].astype(np.int64), a["r_o"].astype(np.int64), a["r_bi"].astype(np.int64),
                      a["r_y"].astype(float))
    out = {"n_pa": int(len(ay)), "n_pitch_states": int(len(py)), "pa_start": {}, "pitch_state": {}, "diff": {}}
    per = {}
    for nm, (RE, CV, RV) in fits.items():
        lpa = (ay - RE[ao, ab]) ** 2
        pred = RV[pc, po, pb] if RV is not None else RE[po, pb] + CV[pc]
        lps = (py - pred) ** 2
        per[nm] = (H.per_game(lpa, ag, S.n_games), H.per_game(lps, pg, S.n_games))
        out["pa_start"][nm] = H.boot_all(*per[nm][0], Ws)
        out["pitch_state"][nm] = H.boot_all(*per[nm][1], Ws)
    names = list(fits)
    for ref in [n for n in names if n.startswith("today")]:
        for nm in names:
            if nm == ref:
                continue
            out["diff"][f"{nm} - {ref}"] = {
                "pa_start": H.boot_all(per[nm][0][0] - per[ref][0][0], per[nm][0][1], Ws),
                "pitch_state": H.boot_all(per[nm][1][0] - per[ref][1][0], per[nm][1][1], Ws)}
    return out


def table_json(level, prm, wts, f, thru):
    return {"provisional": FD.PROVISIONAL, "format": "run-values-candidate/1 (docs/FITS_COUNT_v13.md section 8)",
            "level": level, "thin": level in FC.THIN, "predicts_season": thru + 1,
            "fit_seasons": {str(s): w for s, w in sorted(wts.items())},
            "params": {k: (None if v >= INF else v) for k, v in prm.items()},
            "borrowed_share": round(f["borrowed_share"], 4),
            "RE": {f"{o}|{bases_key(bi)}": round(float(f["RE"][o, bi]), 4) for o in range(3) for bi in range(8)},
            "CV": {f"{b}-{k}": round(float(f["CV"][i]), 4) for i, (b, k) in enumerate(COUNTS)},
            "RV": {f"{b}-{k}|{o}|{bases_key(bi)}": round(float(f["RV"][i, o, bi]), 4)
                   for i, (b, k) in enumerate(COUNTS) for o in range(3) for bi in range(8)},
            "n_pitch_states": {f"{b}-{k}|{o}|{bases_key(bi)}": round(float(f["n"][i, o, bi]), 1)
                               for i, (b, k) in enumerate(COUNTS) for o in range(3) for bi in range(8)}}


def run(con=None, data=None, levels=LEVELS, valid=FC.VALID, B=1000, write=True, log=print):
    assert_not_heldout(valid)
    t0 = time.time()
    con = con or H.connect()
    if data is None:
        data = FD.load_all(con, levels=LEVELS, hi=valid)
    e = _import_engine()
    res = {"provisional": FD.PROVISIONAL, "heldout_touched": False, "levels": {}}
    for lv in levels:
        if valid not in data.get(lv, {}):
            continue
        prm = tune(data, lv, valid)
        Wv, wts = FC.weighted_all(data, valid, prm["half_life"])
        f = fit_level(Wv, lv, prm)
        Ws, wts_s = FC.weighted_all(data, valid + 1, prm["half_life"])     # ship refit through 2025
        fs = fit_level(Ws, lv, prm)
        fits = {}
        today = {"D1": ["college_d1"], "D2": ["college_d1", "college_d3"], "D3": ["college_d3"]}[lv]
        for t in today:
            RE0, CV0 = today_tables(e, t)
            fits["today_" + t] = (RE0, CV0, None)
        fits["fit_additive"] = (f["RE"], f["CV"], None)
        fits["fit_count_bo"] = (f["RE"], f["CV"], f["RV"])
        cmp_ = compare(con, lv, valid, fits, B=B)
        res["levels"][lv] = dict(params=prm, borrowed_share=f["borrowed_share"], fit_seasons=wts[lv], compare=cmp_)
        log(f"\n{lv}{' (THIN)' if lv in FC.THIN else ''}: tuned {FC.fmt_prm(prm)}; borrowed share {f['borrowed_share']:.3f}; "
            f"{cmp_['n_pa']} PAs, {cmp_['n_pitch_states']} pitch states (2025, fit <= {valid - 1})")
        for nm in fits:
            mp, sp = cmp_["pa_start"][nm]
            ms, ss = cmp_["pitch_state"][nm]
            log(f"   {nm:20s} PA-start MSE {mp:.4f} (SE {max(sp.values()):.4f})   pitch-state MSE {ms:.4f} (SE {max(ss.values()):.4f})")
        for k, d in cmp_["diff"].items():
            log(f"   {k:38s} PA-start {d['pa_start'][0]:+.5f} (SE {max(d['pa_start'][1].values()):.5f})   "
                f"pitch-state {d['pitch_state'][0]:+.5f} (SE {max(d['pitch_state'][1].values()):.5f})")
        if write:
            os.makedirs(OUT, exist_ok=True)
            for obj, thru in ((table_json(lv, prm, wts[lv], f, valid - 1), valid - 1), (table_json(lv, prm, wts_s[lv], fs, valid), valid)):
                with open(os.path.join(OUT, f"{lv}_thru{thru}.json"), "w", encoding="utf-8") as fh:
                    json.dump(obj, fh, indent=1)
    if write:
        with open(os.path.join(OUT, "compare_2025.json"), "w", encoding="utf-8") as fh:
            json.dump(res, fh, indent=1, default=lambda o: o.item() if isinstance(o, np.generic) else str(o))
    log(f"\n({time.time() - t0:.0f} s). 2026 was not loaded.")
    return res


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--levels", default="D1,D2,D3")
    ap.add_argument("--boot", type=int, default=1000)
    a = ap.parse_args(argv)
    run(levels=tuple(a.levels.split(",")), B=a.boot)


if __name__ == "__main__":
    main()
