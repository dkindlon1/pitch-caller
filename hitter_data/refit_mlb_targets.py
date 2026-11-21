"""v1.3 shared refits (plan section 4), MLB-level targets: inventory rows 10, 13, B4, B14, B15 (inputs), B22.

From Savant MLB pitches, regular season, fit seasons only (2021 partial .. 2025; never 2026), each season weighted
w = 0.5 ** ((2025 - season) / 2) (hitter_data.refit_load.recency_weight). A pooled rate is sum_s w_s x_s / sum_s w_s n_s.
Uncertainty: game-clustered bootstrap (games resampled with replacement within each season), B = 200.

Outputs (C:/dev/pitchiq-data/refit/mlbt.json and .txt):
- per-PA rates in college_rates.MLB's format (K, BB, HBP, 1B, 2B, 3B, HR, SF, SH, GDP, E, R_per_PA). E = errors per PA
  as the chain uses it: the chain puts the batter on for 0.55 x E, so E = (reached on error per PA) / 0.55. WPPB, SB, CS
  are NOT in Savant's MLB rows (no baserunning events), so they keep the 2010-15 values;
- pitch-level targets in calib.MLB_PITCH's format (Savant zone 1-9 = in zone);
- RE24 (runs to the end of the half-inning from each PA's start state, innings 1-8 only: no walk-off truncation and no
  extra-inning runner) and count values CV(b, k) = mean(runs to end of inning - RE(PA start state)) over pitches thrown
  at that count, centred so CV(0, 0) = 0;
- AVG / OBP / SLG / K / BB (learner pro baselines);
- HARD_SD: the SD of hitters' shrunk hard-hit share (launch_speed >= 95 among batted balls with a speed; shrunk 50 balls
  toward the league rate), weighted by each hitter-season's hard balls in play, as results/step4b/power_hr.json
  power_sd_raw (step4b_power_hr.py) but per season and pooled with the recency weights. Also reported: the plain SD among
  hitter-seasons with 100+ batted balls.

usage: python3 -m hitter_data.refit_mlb_targets [--boot 200]
"""
import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

from . import DATA, assert_not_heldout
from . import refit_load as RL

OUT_DIR = os.path.join(DATA, "refit")
PA_EVENTS = {"strikeout", "strikeout_double_play", "walk", "intent_walk", "hit_by_pitch", "single", "double", "triple",
             "home_run", "field_out", "force_out", "grounded_into_double_play", "double_play", "triple_play",
             "fielders_choice", "fielders_choice_out", "field_error", "sac_fly", "sac_bunt", "sac_fly_double_play",
             "sac_bunt_double_play", "catcher_interf", "other_out"}
EV_MAP = {"K": ("strikeout", "strikeout_double_play"), "BB": ("walk", "intent_walk"), "HBP": ("hit_by_pitch",),
          "1B": ("single",), "2B": ("double",), "3B": ("triple",), "HR": ("home_run",),
          "SF": ("sac_fly", "sac_fly_double_play"), "SH": ("sac_bunt", "sac_bunt_double_play"),
          "GDP": ("grounded_into_double_play",), "ROE": ("field_error",), "CI": ("catcher_interf",)}
STRIKE_DESC = {"called_strike", "swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play",
               "foul_bunt", "missed_bunt", "bunt_foul_tip", "automatic_strike"}
NOT_PITCH = {"automatic_ball", "automatic_strike", "pitchout"}
CONTACT_DESC = RL.SWING - RL.WHIFF
STATES = [(o, b) for o in range(3) for b in ("000", "100", "020", "120", "003", "103", "023", "123")]
COUNTS = [(b, k) for b in range(4) for k in range(3)]
OLD = {
    "rates": {"K": 0.200, "BB": 0.079, "HBP": 0.009, "1B": 0.154, "2B": 0.045, "3B": 0.005, "HR": 0.026,
              "SF": 0.007, "SH": 0.008, "GDP": 0.019, "E": 0.016, "WPPB": 0.0095, "SB": 0.0130, "CS": 0.0050,
              "R_per_PA": 0.112},
    "pitch": {"zone": 0.45, "z_swing": 0.65, "o_swing": 0.30, "z_contact": 0.87, "o_contact": 0.66, "f_strike": 0.59},
    "baseline": {"AVG": 0.255, "OBP": 0.320, "SLG": 0.405, "K": 0.200, "BB": 0.079},
    "HARD_SD": 0.0518,
}


# ------------------------------------------------------------------------------------------------ per-game sums
def prep(df):
    """Adds pa ids, PA-start state and runs to the end of the half-inning. df: one season (or a synthetic frame)."""
    d = df.copy()
    d["desc"] = d["description"].fillna("").astype(str)
    d["ev"] = d["events"].fillna("").astype(str)
    d["half"] = d["game_pk"].astype(np.int64) * 100 + d["inning"].astype(int) * 2 + \
        (d["inning_topbot"].astype(str) == "Bot").astype(int)
    d["pa"] = d["game_pk"].astype(np.int64) * 1000 + d["at_bat_number"].astype(int)
    d = d.sort_values(["game_pk", "at_bat_number", "pitch_number"], kind="stable")
    # runs to the end of the half-inning from each PA's start: end score of the half minus the score at the PA start
    end = d.groupby("half")["post_bat_score"].transform("max")
    first = d.groupby("pa").cumcount() == 0
    d["first"] = first
    d["rest"] = end - d.groupby("pa")["bat_score"].transform("first")
    on = lambda c: d[c].notna()
    d["bases"] = np.where(on("on_1b"), "1", "0")
    d["bases"] = d["bases"] + np.where(on("on_2b"), "2", "0") + np.where(on("on_3b"), "3", "0")
    d["outs"] = d["outs_when_up"].astype(int)
    # the PA start state: the first pitch's state
    d["st_o"] = d.groupby("pa")["outs"].transform("first")
    d["st_b"] = d.groupby("pa")["bases"].transform("first")
    return d


def pa_sums(d):
    """Per game: PA counts by event and the batting-line pieces."""
    end = d[d["ev"].isin(PA_EVENTS)]
    g = pd.DataFrame({"game_pk": end["game_pk"].astype(np.int64)})
    g["PA"] = 1
    for k, evs in EV_MAP.items():
        g[k] = end["ev"].isin(evs).astype(int).values
    g["runs"] = 0
    out = g.groupby("game_pk").sum()
    # runs scored in the game (all innings): final scores
    fin = d.groupby(["game_pk", "inning_topbot"])["post_bat_score"].max().groupby("game_pk").sum()
    out["runs"] = fin.reindex(out.index).fillna(0).values
    return out


def pitch_sums(d):
    p = d[~d["desc"].isin(NOT_PITCH)]
    z = p["zone"].between(1, 9)
    sw = p["desc"].isin(RL.SWING)
    ct = p["desc"].isin(CONTACT_DESC)
    g = pd.DataFrame({"game_pk": p["game_pk"].astype(np.int64).values,
                      "pitches": 1, "zone": z.astype(int).values,
                      "zsw": (z & sw).astype(int).values, "osw": (~z & sw).astype(int).values,
                      "zct": (z & ct).astype(int).values, "oct": (~z & ct).astype(int).values,
                      "fp": p["first"].astype(int).values,
                      "fs": (p["first"] & p["desc"].isin(STRIKE_DESC)).astype(int).values})
    return g.groupby("game_pk").sum()


def re_sums(d):
    """Per game: (runs to end, n) for each PA start state, innings 1-8, plus the same per count for the count values."""
    m = d[(d["inning"] <= 8)]
    starts = m[m["first"]]
    key = starts["st_o"].astype(str) + "|" + starts["st_b"]
    a = pd.DataFrame({"game_pk": starts["game_pk"].astype(np.int64).values, "k": key.values,
                      "r": starts["rest"].values})
    re_r = a.pivot_table(index="game_pk", columns="k", values="r", aggfunc="sum", fill_value=0)
    re_n = a.pivot_table(index="game_pk", columns="k", values="r", aggfunc="count", fill_value=0)
    return re_r, re_n, m


def cv_sums(m, re):
    if not re:
        return pd.DataFrame(index=pd.Index([], name="game_pk")), pd.DataFrame(index=pd.Index([], name="game_pk"))
    """Per game: sum and count of (runs to end of inning - RE(PA start)) for pitches at each count."""
    p = m[~m["desc"].isin(NOT_PITCH) & m["balls"].between(0, 3) & m["strikes"].between(0, 2)]
    base = (p["st_o"].astype(str) + "|" + p["st_b"]).map(re)
    v = p["rest"] - base
    k = p["balls"].astype(int).astype(str) + "-" + p["strikes"].astype(int).astype(str)
    a = pd.DataFrame({"game_pk": p["game_pk"].astype(np.int64).values, "k": k.values, "v": v.values})
    return (a.pivot_table(index="game_pk", columns="k", values="v", aggfunc="sum", fill_value=0),
            a.pivot_table(index="game_pk", columns="k", values="v", aggfunc="count", fill_value=0))


def hard_sums(d):
    """Hitter-season hard counts (batted balls with a launch speed)."""
    b = d[(d["desc"] == "hit_into_play") & d["launch_speed"].notna()]
    b = b[~RL.is_bunt(b)]
    g = pd.DataFrame({"bat": b["batter"].astype(np.int64).values, "n": 1,
                      "h": (b["launch_speed"].astype(float) >= 95).astype(int).values})
    return g.groupby("bat").sum()


# ------------------------------------------------------------------------------------------------ pooled stats
def rates_from(S, keys):
    """S: dict of summed per-season columns already weighted. Returns the per-PA rate dict."""
    pa = S["PA"]
    r = {k: S[k] / pa for k in ("K", "BB", "HBP", "1B", "2B", "3B", "HR", "SF", "SH", "GDP")}
    r["E"] = S["ROE"] / pa / 0.55
    r["R_per_PA"] = S["runs"] / pa
    ab = pa - S["BB"] - S["HBP"] - S["SF"] - S["SH"] - S["CI"]
    h = S["1B"] + S["2B"] + S["3B"] + S["HR"]
    base = {"AVG": h / ab, "OBP": (h + S["BB"] + S["HBP"]) / (ab + S["BB"] + S["HBP"] + S["SF"]),
            "SLG": (S["1B"] + 2 * S["2B"] + 3 * S["3B"] + 4 * S["HR"]) / ab, "K": r["K"], "BB": r["BB"]}
    pt = {"zone": S["zone"] / S["pitches"], "z_swing": S["zsw"] / S["zone"],
          "o_swing": S["osw"] / (S["pitches"] - S["zone"]), "z_contact": S["zct"] / S["zsw"],
          "o_contact": S["oct"] / S["osw"], "f_strike": S["fs"] / S["fp"]}
    return r, pt, base


def hard_sd(hs_by_season, weights):
    """Recency-pooled, hard-ball-weighted SD of shrunk hitter hard-hit shares (step4b_power_hr's power_sd_raw), and the
    plain SD among hitter-seasons with 100+ batted balls."""
    vals, wts, raw, rw = [], [], [], []
    for s, h in hs_by_season.items():
        if h.empty:
            continue
        lg = h["h"].sum() / h["n"].sum()
        shr = (h["h"] + 50 * lg) / (h["n"] + 50)
        vals.append(shr.values); wts.append(h["h"].values * weights[s])
        big = h[h["n"] >= 100]
        raw.append((big["h"] / big["n"]).values); rw.append(np.full(len(big), weights[s]))
    v, w = np.concatenate(vals), np.concatenate(wts)
    mu = np.sum(v * w) / np.sum(w)
    sd = float(np.sqrt(np.sum(w * (v - mu) ** 2) / np.sum(w)))
    rv, rww = np.concatenate(raw), np.concatenate(rw)
    if rww.sum() == 0:
        return sd, float("nan")
    rmu = np.sum(rv * rww) / np.sum(rww)
    return sd, float(np.sqrt(np.sum(rww * (rv - rmu) ** 2) / np.sum(rww)))


def season_parts(df):
    d = prep(df)
    pa = pa_sums(d)
    pi = pitch_sums(d)
    re_r, re_n, m = re_sums(d)
    return dict(pa=pa, pi=pi, re_r=re_r, re_n=re_n, m=m, hard=hard_sums(d))


def _arrays(P, re):
    """Aligns one season's per-game tables to its game list as numpy arrays (the bootstrap resamples rows)."""
    g = P["games"]
    tab = pd.concat([P["pa"], P["pi"]], axis=1).reindex(g).fillna(0)
    rr = P["re_r"].reindex(g).fillna(0)
    rn = P["re_n"].reindex(g).fillna(0)
    a, n = cv_sums(P["m"], re)
    a, n = a.reindex(g).fillna(0), n.reindex(g).fillna(0)
    return dict(cols=list(tab.columns), tab=tab.values, rek=list(rr.columns), rr=rr.values, rn=rn.values,
                cvk=list(a.columns), ca=a.values, cn=n.values)


def combine(A, weights, idx=None):
    """A: season -> _arrays; idx: season -> resampled game rows (bootstrap) or None.
    Returns summed weighted columns, RE and CV (CV deviations measured from the point-estimate RE)."""
    S, re_r, re_n, cs, cn = {}, {}, {}, {}, {}
    for s, X in A.items():
        w = weights[s]
        sel = (lambda m: m[idx[s]]) if idx is not None else (lambda m: m)
        for c, v in zip(X["cols"], sel(X["tab"]).sum(0)):
            S[c] = S.get(c, 0.0) + w * v
        for k, r_, n_ in zip(X["rek"], sel(X["rr"]).sum(0), sel(X["rn"]).sum(0)):
            re_r[k] = re_r.get(k, 0.0) + w * r_
            re_n[k] = re_n.get(k, 0.0) + w * n_
        for k, a_, n_ in zip(X["cvk"], sel(X["ca"]).sum(0), sel(X["cn"]).sum(0)):
            cs[k] = cs.get(k, 0.0) + w * a_
            cn[k] = cn.get(k, 0.0) + w * n_
    re = {k: re_r[k] / re_n[k] for k in re_r if re_n[k] > 0}
    cv = {k: cs[k] / cn[k] for k in cs if cn[k] > 0}
    c0 = cv.get("0-0", 0.0)
    return S, re, {k: v - c0 for k, v in cv.items()}


def compute(frames, boot=200, seed=0):
    """frames: season -> Savant frame. Returns the point estimates and bootstrap SEs."""
    weights = {s: RL.recency_weight(assert_not_heldout(s)) for s in frames}
    parts = {}
    for s, df in frames.items():
        P = season_parts(df)
        P["games"] = np.array(sorted(set(P["pa"].index) | set(P["pi"].index)))
        parts[s] = P
    # RE first (CV needs it), then the aligned arrays
    A0 = {s: _arrays(P, {}) for s, P in parts.items()}
    _, re, _ = combine(A0, weights)
    A = {s: _arrays(P, re) for s, P in parts.items()}
    S, re, cv = combine(A, weights)
    rates, pitch, base = rates_from(S, None)
    hsd, hsd100 = hard_sd({s: P["hard"] for s, P in parts.items()}, weights)
    rng = np.random.default_rng(seed)
    bs = {"rates": [], "pitch": [], "base": [], "re": [], "cv": [], "hsd": []}
    for _ in range(boot):
        idx = {s: rng.integers(0, len(P["games"]), len(P["games"])) for s, P in parts.items()}
        Sb, reb, cvb = combine(A, weights, idx)
        rb, pb, bb = rates_from(Sb, None)
        bs["rates"].append(rb); bs["pitch"].append(pb); bs["base"].append(bb); bs["re"].append(reb); bs["cv"].append(cvb)
        hb = {}
        for s, P in parts.items():
            h = P["hard"]
            hb[s] = h.iloc[rng.integers(0, len(h), len(h))] if len(h) else h
        bs["hsd"].append(hard_sd(hb, weights)[0])

    def se(lst, d):
        return {k: float(np.std([x.get(k, np.nan) for x in lst])) if lst else None for k in d}
    return dict(
        weights=weights,
        rates=rates, rates_se=se(bs["rates"], rates),
        pitch=pitch, pitch_se=se(bs["pitch"], pitch),
        baseline=base, baseline_se=se(bs["base"], base),
        RE=re, RE_se=se(bs["re"], re), CV=cv, CV_se=se(bs["cv"], cv),
        HARD_SD=hsd, HARD_SD_se=float(np.std(bs["hsd"])) if bs["hsd"] else None, HARD_SD_100bip=hsd100,
        n={str(s): dict(games=int(len(P["games"])), PA=int(P["pa"]["PA"].sum()), pitches=int(P["pi"]["pitches"].sum()),
                        hitters=int(len(P["hard"])))
           for s, P in parts.items()})


def load_frames(seasons=None):
    ss = RL.fit_seasons_on_disk("MLB") if seasons is None else [assert_not_heldout(s) for s in seasons]
    return {s: RL.load_savant("MLB", s) for s in ss}


def report(res):
    L = []
    L.append("v1.3 refit, MLB targets (Savant MLB, regular season, recency w = 0.5**((2025-s)/2)); SE = game bootstrap")
    L.append("seasons: " + ", ".join(f"{s} (w {w:.3f}, {res['n'][str(s)]['games']} games, {res['n'][str(s)]['PA']} PA)"
                                     for s, w in res["weights"].items()))
    L.append("\nper-PA rates (old = college_rates.MLB / college_run_values.json mlb_check):")
    for k, v in res["rates"].items():
        L.append(f"  {k:9s} old {OLD['rates'].get(k, float('nan')):.4f}  new {v:.4f}  se {res['rates_se'][k]:.4f}")
    L.append("\npitch-level (old = calib.MLB_PITCH):")
    for k, v in res["pitch"].items():
        L.append(f"  {k:9s} old {OLD['pitch'][k]:.3f}  new {v:.4f}  se {res['pitch_se'][k]:.4f}")
    L.append("\nbaselines (old = app/learner.js, app/learn.js, web/lib/report_data.ts mlb):")
    for k, v in res["baseline"].items():
        L.append(f"  {k:4s} old {OLD['baseline'][k]:.3f}  new {v:.4f}  se {res['baseline_se'][k]:.4f}")
    from run_tables import RE_BY_LEVEL, CV_BY_LEVEL
    L.append("\nRE24 innings 1-8 (old = run_tables.py RE_BY_LEVEL['mlb']):")
    for (o, b) in STATES:
        k = f"{o}|{b}"
        L.append(f"  {k}  old {RE_BY_LEVEL['mlb'][(o, b)]:.3f}  new {res['RE'][k]:.4f}  se {res['RE_se'][k]:.4f}")
    L.append("  ** RE[0|000] is the run_scale denominator for every level (engine.py run_scale) **")
    L.append("\ncount values (old = run_tables.py CV_BY_LEVEL['mlb']):")
    for (b, k) in COUNTS:
        kk = f"{b}-{k}"
        L.append(f"  {kk}  old {CV_BY_LEVEL['mlb'][(b, k)]:+.3f}  new {res['CV'][kk]:+.4f}  se {res['CV_se'][kk]:.4f}")
    L.append(f"\nHARD_SD old {OLD['HARD_SD']}  new {res['HARD_SD']:.4f}  se {res['HARD_SD_se']:.4f}  "
             f"(plain SD, hitter-seasons with 100+ BIP: {res['HARD_SD_100bip']:.4f})")
    return "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--boot", type=int, default=200)
    ap.add_argument("--out", default=OUT_DIR)
    a = ap.parse_args(argv)
    res = compute(load_frames(), boot=a.boot)
    res["old"] = OLD
    os.makedirs(a.out, exist_ok=True)
    txt = report(res)
    print(txt)
    with open(os.path.join(a.out, "mlbt.json"), "w") as f:
        json.dump(res, f, indent=1, default=float)
    with open(os.path.join(a.out, "mlbt.txt"), "w") as f:
        f.write(txt + "\n")


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    main()
