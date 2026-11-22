"""v1.3, Drew's ruling 8 (Nov 21): HARD_SD as the hitter hard-hit-share TALENT SD, with luck removed the way
talent_spread.py does it for pitchers.

HARD_SD is what one power-grade point means (fit_hitter_spread.py's g_w target; POWER_HR is stated per point). The refit
(hitter_data/refit_mlb_targets.py) measured it as the SD of shrunk hitter rates (0.0636): shrinking squeezes hitters
together, and the plain SD among 100+ batted-ball hitter-seasons (0.0775) still carries luck. Here a hitter-season's
hard-hit count is treated as true talent plus binomial noise, and the spread of TRUE rates is estimated two ways that
must agree, exactly as talent_spread.py does for pitchers' walk / strikeout / home-run rates:
  1. method of moments: the batted-ball-weighted variance of observed rates minus each hitter's binomial noise;
  2. a beta-binomial fit with each hitter's likelihood weighted by his batted balls.
The reported value is the beta-binomial SD (talent_spread.py's "true_sd"); method of moments is the cross-check.

Same data and definition as the refit's HARD_SD: Savant MLB, regular season, a batted ball = hit_into_play with a
launch speed (bunts out), hard = launch_speed >= 95; seasons 2015-2025 (launch speed starts in 2015; every season on
disk <= 2025 is read, the earlier ones contribute no batted balls with a speed), all games (no game sample). 2026 is
never read (assert_not_heldout on every season).

Pooling: the league hard-hit rate moves between seasons (about .33 in 2015 to .40 in 2025), so each season is fit on
its own (true spread around that season's mean, like talent_spread.py's one-season fit) and the seasons' true
variances are pooled with weight = the refit's recency weight x the season's batted balls (equivalently each
hitter-season weighted by batted balls x recency weight, the refit's weighting with batted balls in place of hard balls,
which is talent_spread.py's weighting by trials). Pooling all hitter-seasons around one common mean is reported too:
it adds the season-to-season drift of the league rate, which is not hitter talent.
SE: bootstrap over hitters within each season (B = 200 by default), refitting both estimates.

Writes {DATA}/refit/hard_talent_sd.json and .txt.  usage: python3 -m hitter_data.hard_talent_sd [--boot 200]
"""
import argparse
import json
import math
import os

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import betaln, gammaln

from . import DATA, assert_not_heldout
from . import refit_load as RL

OUT_DIR = os.path.join(DATA, "refit")
HARD_MPH = 95.0
FIRST_SPEED_SEASON = 2015
COLS = ["description", "des", "launch_speed", "batter"]


# ------------------------------------------------------------------------------------------------ talent_spread.py's two estimates
def mom(k, n):
    """Trials-weighted method of moments (talent_spread.mom): true variance = observed variance - binomial noise.
    Returns (mean, true variance); the variance may come out negative on tiny samples (not clipped here, so pooled
    and bootstrapped values stay unbiased; clip at the end)."""
    k, n = np.asarray(k, float), np.asarray(n, float)
    p, w = k / n, n / n.sum()
    m = (w * p).sum()
    var = (w * (p - m) ** 2).sum() - (w * p * (1 - p) / np.maximum(n - 1, 1)).sum()
    return float(m), float(var)


def _nll(x, k, n, W):
    """talent_spread.nll_sub: the beta-binomial negative log-likelihood, each unit's term weighted by W."""
    mu, phi = 1 / (1 + np.exp(-x[0])), np.exp(x[1])
    a, b = mu * phi, (1 - mu) * phi
    return -np.sum(W * (gammaln(n + 1) - gammaln(k + 1) - gammaln(n - k + 1) + betaln(k + a, n - k + b) - betaln(a, b)))


def bb_fit(k, n, x0=None):
    """talent_spread.bb_fit's point fit: beta-binomial MLE with each unit's likelihood weighted by its trials (W = n /
    mean n). Returns (mean, true variance, fitted (logit mu, log phi))."""
    k, n = np.asarray(k, float), np.asarray(n, float)
    W = n / n.mean()
    if x0 is None:
        m0 = k.sum() / n.sum()
        x0 = [math.log(m0 / (1 - m0)), math.log(50)]
    r = minimize(lambda x: _nll(x, k, n, W), x0, method="Nelder-Mead",
                 options={"xatol": 1e-7, "fatol": 1e-9, "maxiter": 4000})
    mu, phi = 1 / (1 + math.exp(-r.x[0])), math.exp(r.x[1])
    return mu, mu * (1 - mu) / (phi + 1), list(r.x)


# ------------------------------------------------------------------------------------------------ data
def hitter_seasons(level="MLB", seasons=None, loader=None):
    """season -> DataFrame indexed by batter with n (batted balls with a launch speed, bunts out) and h (>= 95 mph),
    the refit's definition (refit_mlb_targets.hard_sums). Seasons without any launch speed are dropped."""
    loader = loader or (lambda s: RL.load_savant(level, s, cols=COLS))
    ss = RL.fit_seasons_on_disk(level) if seasons is None else [assert_not_heldout(s) for s in seasons]
    out = {}
    for s in ss:
        assert_not_heldout(s)
        if s < FIRST_SPEED_SEASON:
            continue
        d = loader(s)
        b = d[(d["description"].fillna("").astype(str) == "hit_into_play") & d["launch_speed"].notna()]
        b = b[~RL.is_bunt(b)]
        if b.empty:
            continue
        g = pd.DataFrame({"bat": b["batter"].astype(np.int64).values, "n": 1,
                          "h": (b["launch_speed"].astype(float) >= HARD_MPH).astype(int).values})
        out[s] = g.groupby("bat").sum()
        del d, b
    return out


# ------------------------------------------------------------------------------------------------ pooled estimate
def pooled(hs, weights, x0=None):
    """hs: season -> (h, n) frame; weights: season -> recency weight. Returns per-season and pooled estimates."""
    per, x_out = {}, {}
    num_m = num_b = num_h = den = 0.0
    allk, alln, allw = [], [], []
    for s, t in hs.items():
        k, n = t["h"].values, t["n"].values
        mm, mv = mom(k, n)
        bm, bv, x = bb_fit(k, n, None if x0 is None else x0.get(s))
        x_out[s] = x
        # sensitivity: method of moments with hard-ball weights (the refit's per-hitter weight)
        p, wh = k / n, k / max(k.sum(), 1)
        mh = (wh * p).sum()
        hv = (wh * (p - mh) ** 2).sum() - (wh * p * (1 - p) / np.maximum(n - 1, 1)).sum()
        W = weights[s] * n.sum()
        per[s] = dict(hitters=int(len(t)), bip=int(n.sum()), mean=bm, bb_sd=math.sqrt(max(bv, 0)),
                      mom_sd=math.sqrt(max(mv, 0)), w=weights[s])
        num_b += W * bv
        num_m += W * mv
        num_h += W * hv
        den += W
        allk.append(k); alln.append(n); allw.append(np.full(len(k), weights[s]))
    # one common mean over every hitter-season (adds the league-rate drift between seasons)
    k, n, w = np.concatenate(allk), np.concatenate(alln), np.concatenate(allw)
    p = k / n
    ww = w * n / np.sum(w * n)
    m = np.sum(ww * p)
    common = np.sum(ww * (p - m) ** 2) - np.sum(ww * p * (1 - p) / np.maximum(n - 1, 1))
    return dict(per=per, bb_var=num_b / den, mom_var=num_m / den, momh_var=num_h / den, common_var=float(common)), x_out


def compute(hs, boot=200, seed=0):
    weights = {s: RL.recency_weight(assert_not_heldout(s)) for s in hs}
    est, x0 = pooled(hs, weights)
    rng = np.random.default_rng(seed)
    bs = {"bb": [], "mom": []}
    for _ in range(boot):
        hb = {s: t.iloc[rng.integers(0, len(t), len(t))] for s, t in hs.items()}
        e, _ = pooled(hb, weights, x0)
        bs["bb"].append(math.sqrt(max(e["bb_var"], 0)))
        bs["mom"].append(math.sqrt(max(e["mom_var"], 0)))
    sd = lambda v: math.sqrt(max(v, 0))
    # sensitivity: the universal-DH seasons only (2022 on: no pitchers batting, who widen the earlier seasons' spread)
    dh = {s: t for s, t in hs.items() if s >= 2022}
    dh_sd = sd(pooled(dh, weights, x0)[0]["bb_var"]) if dh and len(dh) < len(hs) else None
    return dict(
        HARD_SD=round(sd(est["bb_var"]), 4), HARD_SD_raw=sd(est["bb_var"]),
        HARD_SD_se=float(np.std(bs["bb"])) if bs["bb"] else None,
        mom_sd=sd(est["mom_var"]), mom_se=float(np.std(bs["mom"])) if bs["mom"] else None,
        mom_hardball_weighted_sd=sd(est["momh_var"]), common_mean_mom_sd=sd(est["common_var"]), dh_era_bb_sd=dh_sd,
        boot=boot, weights={str(s): w for s, w in weights.items()},
        per_season={str(s): v for s, v in est["per"].items()},
        method="per-season beta-binomial (BIP-weighted likelihood, talent_spread.bb_fit) true variance, pooled over "
               "seasons with weight recency x season BIP; SE = bootstrap over hitters within season")


def report(res, ref=None):
    L = ["HARD_SD as hitter TALENT SD (luck removed; talent_spread.py's method), Savant MLB, hard = launch_speed >= 95",
         f"per season (beta-binomial true SD / method-of-moments true SD; league mean; hitters; batted balls; weight):"]
    for s, v in res["per_season"].items():
        L.append(f"  {s}  bb {v['bb_sd']:.4f}  mom {v['mom_sd']:.4f}  mean {v['mean']:.3f}  hitters {v['hitters']}  "
                 f"BIP {v['bip']}  w {v['w']:.3f}")
    L.append(f"\npooled (weight = recency x season BIP): beta-binomial {res['HARD_SD_raw']:.4f} (boot SE "
             f"{res['HARD_SD_se']:.4f}, B = {res['boot']}); method of moments {res['mom_sd']:.4f} (SE {res['mom_se']:.4f})")
    L.append(f"sensitivity: method of moments with hard-ball weights {res['mom_hardball_weighted_sd']:.4f}; one common mean "
             f"over all hitter-seasons {res['common_mean_mom_sd']:.4f} (adds the league-rate drift)")
    if res.get("dh_era_bb_sd"):
        L.append(f"sensitivity: universal-DH seasons 2022-2025 only (no pitchers batting) beta-binomial {res['dh_era_bb_sd']:.4f}")
    if ref:
        L.append(f"\ncomparison: refit shrunk-estimate SD {ref.get('HARD_SD', float('nan')):.4f}; plain SD (100+ BIP) "
                 f"{ref.get('HARD_SD_100bip', float('nan')):.4f}; decision-sheet estimate ~0.070; v1.2.3 0.0518")
    L.append(f"\nHARD_SD = {res['HARD_SD']}")
    return "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--boot", type=int, default=200)
    ap.add_argument("--out", default=OUT_DIR)
    a = ap.parse_args(argv)
    hs = hitter_seasons("MLB")
    res = compute(hs, boot=a.boot)
    ref = None
    try:
        with open(os.path.join(a.out, "mlbt.json")) as fh:
            m = json.load(fh)
        ref = {"HARD_SD": m.get("HARD_SD"), "HARD_SD_100bip": m.get("HARD_SD_100bip")}
        res["refit_reference"] = ref
    except OSError:
        pass
    txt = report(res, ref)
    print(txt)
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "hard_talent_sd.json"), "w") as fh:
        json.dump(res, fh, indent=1)
    with open(os.path.join(a.out, "hard_talent_sd.txt"), "w", encoding="utf-8") as fh:
        fh.write(txt + "\n")


if __name__ == "__main__":
    main()
