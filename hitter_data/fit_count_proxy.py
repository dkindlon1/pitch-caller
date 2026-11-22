"""The hard-contact proxy check (plan 3.1): does the box-score proxy rank counts the way Statcast hard-hit rate does?
PROVISIONAL: see docs/FITS_COUNT_v13.md. Single-A Statcast seasons 2021-2025 only; 2026 is never read.

College text gives a ball's type in the scorer's words (outs nearly always typed, hits rarely "line") and its result.
  college proxy  hard = a line drive or an extra-base hit, per non-bunt ball in play
                 weak = a pop-up, or a grounder / single to the pitcher or catcher
On Single-A Statcast both the proxy and the truth are visible:
  proxy (full)        hard = bb_type line_drive or 2B / 3B / HR;  weak = popup or a grounder fielded by p / c (hit_location 1, 2)
  proxy (as scored)   hard = a line-drive OUT or 2B / 3B / HR (college scorers rarely call a hit a liner)
  truth               hard-hit = exit velocity >= 95 mph; soft = exit velocity < 80 mph (balls in play with a reading)
Checks: Spearman rank correlation over the 12 counts (proxy vs truth within Single-A; college proxy vs Single-A truth);
per-ball lift (hard-hit rate when the proxy says hard vs not).

usage: python -m hitter_data.fit_count_proxy"""
import glob
import json
import os

import numpy as np

from . import DATA, assert_not_heldout
from . import fit_count_data as FD
from .harness_adapters import CI, COUNTS

SC = os.path.join(DATA, "statcast", "A")
COLS = ["type", "balls", "strikes", "bb_type", "events", "hit_location", "launch_speed", "des"]
XBH = {"double", "triple", "home_run"}
OUTS = {"field_out", "force_out", "grounded_into_double_play", "double_play", "sac_fly", "fielders_choice_out",
        "triple_play", "sac_fly_double_play"}
FIELDS = ("n", "n_ev", "hard_ev", "soft_ev", "proxy_full", "proxy_scored", "weak", "both_hard", "proxy_ev")


def season_cells(season):
    """[12, fields] counts for one Single-A season (cached)."""
    import pandas as pd
    assert_not_heldout(season)
    files = sorted(f for f in glob.glob(os.path.join(SC, str(season), "*.csv.gz")))
    key = f"{len(files)}_{sum(os.path.getsize(f) for f in files)}"
    cp = os.path.join(FD.CACHE, f"proxyA_{season}_{key}.npy")
    if os.path.exists(cp):
        return np.load(cp)
    acc = np.zeros((12, len(FIELDS)))
    for f in files:
        try:
            d = pd.read_csv(f, usecols=COLS, low_memory=False)
        except Exception:
            continue
        d = d[(d["type"] == "X") & d["balls"].between(0, 3) & d["strikes"].between(0, 2)]
        d = d[~d["des"].fillna("").str.contains("bunt", case=False)]
        if d.empty:
            continue
        ci = (d["balls"].astype(int) * 3 + d["strikes"].astype(int)).to_numpy()
        ev = d["events"].fillna("")
        bt = d["bb_type"].fillna("")
        ls = d["launch_speed"]
        has = ls.notna().to_numpy()
        hard = (ls >= 95).to_numpy() & has
        soft = (ls < 80).to_numpy() & has
        pfull = ((bt == "line_drive") | ev.isin(XBH)).to_numpy()
        pscored = (((bt == "line_drive") & ev.isin(OUTS)) | ev.isin(XBH)).to_numpy()
        weak = ((bt == "popup") | ((bt == "ground_ball") & d["hit_location"].isin([1, 2, 1.0, 2.0]))).to_numpy()
        cols = [np.ones(len(d)), has, hard, soft, pfull, pscored, weak, hard & pfull, pfull & has]
        for j, v in enumerate(cols):
            np.add.at(acc[:, j], ci, v.astype(float))
    os.makedirs(FD.CACHE, exist_ok=True)
    np.save(cp, acc)
    return acc


def spearman(a, b):
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def college_proxy(levels=("D1", "D2", "D3"), lo=2015, hi=2025):
    from . import harness as H
    con = H.connect()
    out = {}
    for lv in levels:
        acc = {k: np.zeros(12) for k in ("bipn", "hard", "weak")}
        for s in FD.seasons_with_games(con, lv, lo, hi):
            c = FD.season_counts(con, lv, s)
            for k in acc:
                acc[k] += c[k]
        out[lv] = acc
    return out


def run(seasons=(2021, 2022, 2023, 2024, 2025), write=True, log=print):
    for s in seasons:
        assert_not_heldout(s)
    A = sum(season_cells(s) for s in seasons)
    F = {k: A[:, i] for i, k in enumerate(FIELDS)}
    hard_rate = F["hard_ev"] / np.maximum(F["n_ev"], 1)
    soft_rate = F["soft_ev"] / np.maximum(F["n_ev"], 1)
    pf, ps, wk = F["proxy_full"] / F["n"], F["proxy_scored"] / F["n"], F["weak"] / F["n"]
    lift_hit = F["both_hard"].sum() / max(F["proxy_ev"].sum(), 1)
    base_hit = F["hard_ev"].sum() / max(F["n_ev"].sum(), 1)
    nonp = (F["hard_ev"].sum() - F["both_hard"].sum()) / max(F["n_ev"].sum() - F["proxy_ev"].sum(), 1)
    res = {"provisional": FD.PROVISIONAL, "statcast_A_seasons": list(seasons), "n_bip": int(F["n"].sum()),
           "n_with_ev": int(F["n_ev"].sum()),
           "by_count": {f"{b}-{k}": dict(n=int(F["n"][CI[(b, k)]]), hard_hit=round(float(hard_rate[CI[(b, k)]]), 4),
                                         soft=round(float(soft_rate[CI[(b, k)]]), 4), proxy_full=round(float(pf[CI[(b, k)]]), 4),
                                         proxy_scored=round(float(ps[CI[(b, k)]]), 4), weak=round(float(wk[CI[(b, k)]]), 4))
                        for b, k in COUNTS},
           "spearman_A": dict(proxy_full_vs_hard_hit=spearman(pf, hard_rate), proxy_scored_vs_hard_hit=spearman(ps, hard_rate),
                              weak_vs_soft=spearman(wk, soft_rate)),
           "per_ball": dict(hard_hit_rate_overall=round(base_hit, 4), hard_hit_given_proxy_hard=round(lift_hit, 4),
                            hard_hit_given_not_proxy=round(nonp, 4))}
    col = college_proxy()
    res["college"] = {}
    for lv, c in col.items():
        h = c["hard"] / np.maximum(c["bipn"], 1)
        w = c["weak"] / np.maximum(c["bipn"], 1)
        res["college"][lv] = dict(n_bip=int(c["bipn"].sum()), hard_by_count={f"{b}-{k}": round(float(h[CI[(b, k)]]), 4) for b, k in COUNTS},
                                  weak_by_count={f"{b}-{k}": round(float(w[CI[(b, k)]]), 4) for b, k in COUNTS},
                                  spearman_hard_vs_A_hard_hit=spearman(h, hard_rate),
                                  spearman_hard_vs_A_proxy_scored=spearman(h, ps),
                                  spearman_weak_vs_A_soft=spearman(w, soft_rate))
    log(f"Single-A {list(seasons)}: {res['n_bip']:,} non-bunt balls in play, {res['n_with_ev']:,} with exit velocity")
    log("  count  n       hard-hit  soft   proxy_full proxy_scored weak")
    for ck, v in res["by_count"].items():
        log(f"  {ck}   {v['n']:6d}  {v['hard_hit']:.3f}    {v['soft']:.3f}  {v['proxy_full']:.3f}      {v['proxy_scored']:.3f}        {v['weak']:.3f}")
    log("  Spearman over counts (Single-A): " + ", ".join(f"{k} {v:+.3f}" for k, v in res["spearman_A"].items()))
    log(f"  per ball: hard-hit {base_hit:.3f} overall, {lift_hit:.3f} when proxy says hard, {nonp:.3f} otherwise")
    for lv, v in res["college"].items():
        log(f"  college {lv} ({v['n_bip']:,} BIP, 2015-2025): Spearman hard proxy vs Single-A hard-hit {v['spearman_hard_vs_A_hard_hit']:+.3f}, "
            f"vs Single-A scored proxy {v['spearman_hard_vs_A_proxy_scored']:+.3f}; weak vs Single-A soft {v['spearman_weak_vs_A_soft']:+.3f}")
    if write:
        d = os.path.join(FD.FITS, "count_layer")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "proxy_check.json"), "w", encoding="utf-8") as f:
            json.dump(res, f, indent=1)
    return res


if __name__ == "__main__":
    run()
