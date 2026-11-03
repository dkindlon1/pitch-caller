"""
How much do pitchers really differ at each level? Measured from data/pitcher_lines_2026.csv (pitcher_lines.py).

A pitcher's rate over a few batters is mostly luck, so the observed spread overstates the real one. For each rate
(walk+HBP, strikeout, home run per batter faced) this estimates the spread of TRUE rates, two ways that must agree:
  1. method of moments: the batters-faced-weighted variance of observed rates minus each pitcher's binomial noise;
  2. a beta-binomial fit with each pitcher's likelihood weighted by his batters faced.
Weighting by batters faced matters: counting pitchers equally lets mop-up arms who throw a few wild innings set the
average and spread (tested: unweighted, the walk mean is 18.3% vs the league's 16.0% and the "true" SD comes out larger
than the raw spread, which is impossible). The population that matters is the pitches actually thrown.
The true-talent SD is what one grade point means (3 = level average, one point = one SD).

The walk/strikeout correlation of true rates comes from a method-of-moments estimate with the within-pitcher
(multinomial) noise taken out.

High school has no per-pitcher lines in our sources: it is estimated from D3 with the same spread relative to each
level's average rate (coefficient of variation), and marked as estimated.

Writes data/talent_spread.json.  Usage: python3 talent_spread.py
"""
import csv, json, math, os
import numpy as np
from scipy.optimize import minimize
from scipy.special import betaln, gammaln

HERE = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(HERE, "data", "pitcher_lines_2026.csv"))))
RV = json.load(open(os.path.join(HERE, "college_run_values.json")))


def mom(k, n):
    """Batters-faced-weighted method of moments: true variance = observed variance - binomial noise."""
    k, n = np.asarray(k, float), np.asarray(n, float)
    p, w = k / n, n / n.sum()
    m = (w * p).sum()
    var = (w * (p - m) ** 2).sum() - (w * p * (1 - p) / np.maximum(n - 1, 1)).sum()
    return m, math.sqrt(max(var, 0.0))


def bb_fit(k, n):
    """Beta-binomial MLE with each pitcher's likelihood weighted by batters faced. Returns mean, true SD, bootstrap SE."""
    k, n = np.asarray(k, float), np.asarray(n, float)
    W = n / n.mean()
    def nll(x):
        return nll_sub(x, k, n, W)
    m0 = k.sum() / n.sum()
    r = minimize(nll, [math.log(m0 / (1 - m0)), math.log(50)], method="Nelder-Mead", options={"xatol": 1e-7, "fatol": 1e-9, "maxiter": 4000})
    mu, phi = 1 / (1 + math.exp(-r.x[0])), math.exp(r.x[1])
    sd = math.sqrt(mu * (1 - mu) / (phi + 1))
    # uncertainty in the SD: refit on resampled pitchers
    rng = np.random.default_rng(1)
    sds = []
    for _ in range(60):
        i = rng.integers(0, len(k), len(k))
        rr = minimize(lambda x: nll_sub(x, k[i], n[i], W[i]), r.x, method="Nelder-Mead", options={"xatol": 1e-6, "fatol": 1e-8, "maxiter": 2000})
        m_, p_ = 1 / (1 + math.exp(-rr.x[0])), math.exp(rr.x[1])
        sds.append(math.sqrt(m_ * (1 - m_) / (p_ + 1)))
    return mu, sd, float(np.std(sds))


def nll_sub(x, k, n, W):
    mu, phi = 1 / (1 + np.exp(-x[0])), np.exp(x[1])
    a, b = mu * phi, (1 - mu) * phi
    return -np.sum(W * (gammaln(n + 1) - gammaln(k + 1) - gammaln(n - k + 1) + betaln(k + a, n - k + b) - betaln(a, b)))


def true_corr(b, s, n, min_bf=40):
    """Correlation of true walk+HBP and strikeout rates: weighted moments minus the multinomial noise."""
    b, s, n = np.asarray(b, float), np.asarray(s, float), np.asarray(n, float)
    m = n >= min_bf
    b, s, n = b[m], s[m], n[m]
    pb, ps = b / n, s / n
    w = n / n.sum()
    mb, ms = (w * pb).sum(), (w * ps).sum()
    cov = (w * (pb - mb) * (ps - ms)).sum() + (w * mb * ms / n).sum()          # noise covariance is -pb*ps/n
    vb = (w * (pb - mb) ** 2).sum() - (w * mb * (1 - mb) / n).sum()
    vs = (w * (ps - ms) ** 2).sum() - (w * ms * (1 - ms) / n).sum()
    return cov / math.sqrt(max(vb, 1e-9) * max(vs, 1e-9))


out = {"source": "data/pitcher_lines_2026.csv (2026 seasons, team stats pages)", "levels": {}}
for lvl in ("college_d3", "college_d1"):
    rs = [r for r in rows if r["level"] == lvl and int(r["bf"]) > 0]
    n = [int(r["bf"]) for r in rs]
    res = {"pitchers": len(rs), "teams": len({r["team"] for r in rs}), "bf": sum(n)}
    for name, k in (("walk_hbp", [int(r["bb"]) + int(r["hbp"]) for r in rs]), ("k", [int(r["so"]) for r in rs]), ("hr", [int(r["hr"]) for r in rs])):
        mu, sd, se = bb_fit(k, n)
        mm, msd = mom(k, n)
        obs = [ki / ni for ki, ni in zip(k, n) if ni >= 100]
        res[name] = {"mean": round(mu, 4), "true_sd": round(sd, 4), "sd_se": round(se, 4), "mom_mean": round(mm, 4), "mom_sd": round(msd, 4),
                     "observed_sd_100bf": round(float(np.std(obs)), 4)}
    res["corr_walk_k"] = round(true_corr([int(r["bb"]) + int(r["hbp"]) for r in rs], [int(r["so"]) for r in rs], n), 3)
    out["levels"][lvl] = res
# high school: same coefficient of variation as D3, around HS averages (estimated)
d3 = out["levels"]["college_d3"]
hs_avg = {"walk_hbp": RV["hs"]["BB"] + RV["hs"]["HBP"], "k": RV["hs"]["K"], "hr": RV["hs"]["HR"]}
d3_avg = {"walk_hbp": d3["walk_hbp"]["mean"], "k": d3["k"]["mean"], "hr": d3["hr"]["mean"]}
out["levels"]["hs"] = {"estimated": True, "how": "D3 true SD scaled by HS average / D3 average (same coefficient of variation)",
                       **{k: {"mean": round(hs_avg[k], 4), "true_sd": round(d3[k]["true_sd"] * hs_avg[k] / d3_avg[k], 4)} for k in hs_avg},
                       "corr_walk_k": d3["corr_walk_k"]}
json.dump(out, open(os.path.join(HERE, "data", "talent_spread.json"), "w"), indent=1)
for lvl, r in out["levels"].items():
    print(lvl, json.dumps(r))
