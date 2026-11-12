"""
v0.6 outcome-model calibration.

Plays out a plate appearance EXACTLY (no dice): the engine's own call in each count, against
the simulator's hidden hitters, through the count Markov chain (fouls with 2 strikes loop).
v1.0 Step 0c: the calls come from call_v08 -- the shipped engine's call path -- not the old v0.7c call path, so
the level fits are made against the mix the engine actually throws. The table is solved once per
(level, pitcher, side) at 0-0 and reused for every count, exactly as the app and the simulator do inside a PA.
Returns per-PA rates (K, BB, HBP, ball-in-play mix) and pitch-level rates (zone, swing, contact).
Then fits the level's OUTCOME_ADJ logit shifts so those match real league rates.

usage: python3 calib.py            -> fit all levels, write outcome_params.py
"""
import json
import random
import sys
from collections import defaultdict
from dataclasses import replace

import numpy as np
from scipy.optimize import least_squares

import engine
from engine import Situation, call_v08, solve_table, outcome_probs, OUTCOME_ADJ, IN_PLAY_BY_LEVEL
import simulate

KEYS = ["cmd", "zsw", "osw", "wz", "wo", "cs", "hbp"]   # MLB fit; college/HS add "wild"
COUNTS = [(b, k) for b in range(4) for k in range(3)]


def population(n_lineups=4, seed=7):
    simulate.rng = random.Random(seed)
    return [h for _ in range(n_lineups) for h in simulate.their_lineup()]


HITTERS = population()
STAFF = simulate.our_staff()
_orng = random.Random(99)
for _h in HITTERS:                    # each sampled matchup gets its own random day (v0.6f off days)
    _h["_off"] = {w["name"]: simulate.draw_off(_orng, w["arsenal"]) for w in STAFF}
STAFF_W = (0.65, 0.35)     # share of pitches: starter ~95 of ~145


_LAST_RAW = {}


def evaluate_raw(level):
    evaluate(level)
    return dict(_LAST_RAW)


def evaluate(level, adj=None, policy_cache=None):
    if adj is not None:
        OUTCOME_ADJ[level].update(adj)
    tot = defaultdict(float)
    pa_tot = defaultdict(float)
    for (who, w) in zip(STAFF, STAFF_W):
        ars = who["arsenal"]
        for same in (True, False):
            hs = [h for h in HITTERS if (h["hand"] == who["hand"]) == same]
            if not hs:
                continue
            ws = w * len(hs) / len(HITTERS)
            dists = {}
            tab0 = None                        # one PA table per (level, pitcher, side), solved at 0-0 and reused
            for c in COUNTS:
                key = (level, who["name"], same, c)
                if policy_cache is not None and key in policy_cache:
                    dists[c] = policy_cache[key]
                    continue
                s = Situation(c[0], c[1], 0, (False, False, False), level=level, same_side=same,
                              pitch_count=40, batters_faced=9)
                if tab0 is None:
                    tab0 = solve_table(ars, replace(s, balls=0, strikes=0, last=None))
                _, dist, _, _ = call_v08(ars, s, rng=random.Random(0), tab=tab0)
                dists[c] = [(pr, p, q) for pr, _, p, q in dist]
                if policy_cache is not None:
                    policy_cache[key] = dists[c]
            for h in hs:
                reach = defaultdict(float)
                reach[(0, 0)] = 1.0
                pa = defaultdict(float)
                st = defaultdict(float)
                for c in sorted(COUNTS, key=lambda c: c[0] + c[1]):
                    r = reach[c]
                    if r <= 0:
                        continue
                    s = Situation(c[0], c[1], 0, (False, False, False), level=level, same_side=same,
                                  pitch_count=40, batters_faced=9)
                    simulate.CURRENT_OFF.clear(); simulate.CURRENT_OFF.update(h["_off"][who["name"]])
                    ts = simulate.true_situation(s, h)
                    P = defaultdict(float)
                    zs = defaultdict(float)
                    for pr, p, q in dists[c]:
                        s1 = defaultdict(float)
                        o = outcome_probs(p, q, ts, ars, stats=s1)
                        for k_, v in o.items():
                            P[k_] += pr * v
                        for k_, v in s1.items():
                            zs[k_] += pr * v
                    b, k = c
                    loop = P["foul"] if k == 2 else 0.0
                    visits = r / (1 - loop)
                    for k_, v in zs.items():
                        st[k_] += visits * v
                    st["cstrike"] += visits * P["cstrike"]
                    st["ball"] += visits * (P["ball"] + P["wp_ball"] + P["hbp"])
                    if c == (0, 0):
                        st["fstrike"] += 1 - P["ball"] - P["wp_ball"] - P["hbp"]
                    balls = visits * (P["ball"] + P["wp_ball"])
                    strikes = visits * (P["cstrike"] + P["whiff"])
                    fouls = visits * P["foul"] if k < 2 else 0.0
                    pa["hbp"] += visits * P["hbp"]
                    for ct in ("weak", "solid", "hard"):
                        pa[ct] += visits * P[ct]
                    if b == 3:
                        pa["bb"] += balls
                    else:
                        reach[(b + 1, k)] += balls
                    if k == 2:
                        pa["k"] += strikes
                    else:
                        reach[(b, k + 1)] += strikes + fouls
                for k_, v in pa.items():
                    pa_tot[k_] += ws / len(hs) * v
                for k_, v in st.items():
                    tot[k_] += ws / len(hs) * v
    # hits from the level's in-play table
    hits = hr = 0.0
    for ct in ("weak", "solid", "hard"):
        po, p1, p2, p3, phr, pe = IN_PLAY_BY_LEVEL[level][ct]
        hits += pa_tot[ct] * (p1 + p2 + p3 + phr)
        hr += pa_tot[ct] * phr
    P_ = tot["pitches"]
    out_zone = P_ - tot["zone"]
    _LAST_RAW.clear(); _LAST_RAW.update(pa_tot)
    return {
        "K": pa_tot["k"], "BB": pa_tot["bb"], "HBP": pa_tot["hbp"],
        "BIP": pa_tot["weak"] + pa_tot["solid"] + pa_tot["hard"], "H": hits, "HR": hr,
        "pitches_per_PA": P_,
        "zone": tot["zone"] / P_, "swing": (tot["zswing"] + tot["oswing"]) / P_,
        "z_swing": tot["zswing"] / tot["zone"], "o_swing": tot["oswing"] / out_zone,
        "z_contact": tot["zcontact"] / tot["zswing"], "o_contact": tot["ocontact"] / tot["oswing"],
        "contact": (tot["zcontact"] + tot["ocontact"]) / (tot["zswing"] + tot["oswing"]),
        "swstr": (tot["zswing"] + tot["oswing"] - tot["zcontact"] - tot["ocontact"]) / P_,
        "cstr": tot["cstrike"] / P_, "ball_rate": tot["ball"] / P_, "f_strike": tot["fstrike"],
    }


# --- targets ------------------------------------------------------------------
# MLB pitch-level: FanGraphs Library league-average guide (O-Swing 30, Z-Swing 65, Swing 46,
#   O-Contact 66, Z-Contact 87, Contact 80, Zone 45, F-Strike 59, SwStr 9.5).
# MLB PA rates: the 2010-15 rates used to validate the run tables (college_rates.MLB).
# College PA rates: 2026 conference team totals (college_rates.py).
RV = json.load(open("college_run_values.json"))
MLB_PITCH = {"zone": 0.45, "z_swing": 0.65, "o_swing": 0.30, "z_contact": 0.87, "o_contact": 0.66,
             "f_strike": 0.59}
PA_TARGETS = {
    "mlb": {k: RV["mlb_check"][kk] for k, kk in (("K", "K"), ("BB", "BB"), ("HBP", "HBP"))},
    "college_d1": {k: RV["college_d1"][kk] for k, kk in (("K", "K"), ("BB", "BB"), ("HBP", "HBP"))},
    "college_d3": {k: RV["college_d3"][kk] for k, kk in (("K", "K"), ("BB", "BB"), ("HBP", "HBP"))},
}


PRIOR_W = 0.05
PRIOR_SD = {"cmd": 0.5, "hbp": 10.0, "wild": 0.4}


def fit(level, free, targets, weights, start=None, rounds=2, tie=None, verbose=True):
    """Least squares on the free logit shifts. The engine's calls are re-solved between rounds
    (it adapts to the new environment), held fixed within a round.
    tie: {key: (other_key, offset)} sets key = value(other_key) + offset (used to move wz and wo together)."""
    def to_adj(xv):
        d = dict(zip(free, xv))
        for k, (src_k, off) in (tie or {}).items():
            d[k] = d[src_k] + off
        return d
    x = np.array([(start or {}).get(k, OUTCOME_ADJ[level][k]) for k in free], dtype=float)
    lo = np.array([0.0 if k == "hbp" else (-0.5 if k == "wild" else -3.0) for k in free])
    hi = np.array([0.5 if k == "hbp" else (0.7 if k == "wild" else 3.0) for k in free])
    x = np.clip(x, lo + 1e-3, hi - 1e-3)
    for rnd in range(rounds):
        cache = {}
        evaluate(level, to_adj(x), cache)      # solve the engine's calls at the current point

        def resid(xv):
            m = evaluate(level, to_adj(xv), cache)
            fit_err = [(m[t] - v) / v * weights.get(t, 1.0) for t, v in targets.items()]
            # weak pull toward 0 (no change from baseline) so settings can't trade off into extremes
            prior = [PRIOR_W * v / PRIOR_SD.get(k, 1.0) for k, v in zip(free, xv)]
            return np.array(fit_err + prior)
        r = least_squares(resid, x, bounds=(lo, hi), diff_step=1e-2, x_scale=0.3, xtol=1e-5, ftol=1e-7)
        x = r.x
        if verbose:
            print(f"  {level} round {rnd + 1} ({r.nfev} evals): " + ", ".join(f"{k} {v:+.3f}" for k, v in to_adj(x).items()),
                  f" max weighted rel err {np.max(np.abs(r.fun[:len(targets)])):.3f}", flush=True)
    OUTCOME_ADJ[level].update(to_adj(x))
    return {k: float(v) for k, v in to_adj(x).items()}


def real_bip(level_key):
    """Real per-ball-in-play shares: out, 1B, 2B, 3B, HR, reached on error (0.55 x errors)."""
    r = RV[level_key]
    bip = 1 - r["K"] - r["BB"] - r["HBP"]
    roe = 0.55 * r["E"]
    hits = r["1B"] + r["2B"] + r["3B"] + r["HR"]
    return [(bip - hits - roe) / bip, r["1B"] / bip, r["2B"] / bip, r["3B"] / bip, r["HR"] / bip, roe / bip]


def fit_inplay(level, level_key, iters=200):
    """Tilt each outcome's odds (same factor for weak/solid/hard) until the engine's own contact mix
    reproduces the level's real hit mix per ball in play. Keeps weak < solid < hard in damage."""
    m = evaluate(level)
    mix = {c: m_ for c, m_ in (("weak", None), ("solid", None), ("hard", None))}
    cache_mix = contact_mix(level)
    base = {c: list(IN_PLAY_BY_LEVEL[level][c]) for c in ("weak", "solid", "hard")}
    target = real_bip(level_key)
    lam = [1.0] * 6
    for _ in range(iters):
        tab = {}
        for c in base:
            w = [b * l for b, l in zip(base[c], lam)]
            t = sum(w)
            tab[c] = [v / t for v in w]
        model = [sum(cache_mix[c] * tab[c][e] for c in tab) for e in range(6)]
        lam = [l * (tg / md if md > 0 else 1.0) for l, tg, md in zip(lam, target, model)]
    IN_PLAY_BY_LEVEL[level] = {c: tuple(round(float(v), 4) for v in tab[c]) for c in tab}
    return IN_PLAY_BY_LEVEL[level], cache_mix, target, model


def contact_mix(level):
    m = evaluate_raw(level)
    t = m["weak"] + m["solid"] + m["hard"]
    return {c: m[c] / t for c in ("weak", "solid", "hard")}


def show(level, label):
    m = evaluate(level)
    print(f"{label:>22}: K {m['K']:.1%}  BB {m['BB']:.1%}  HBP {m['HBP']:.1%}  H {m['H']:.1%}  HR {m['HR']:.1%}  "
          f"P/PA {m['pitches_per_PA']:.2f} | zone {m['zone']:.0%} zsw {m['z_swing']:.0%} osw {m['o_swing']:.0%} "
          f"zct {m['z_contact']:.0%} oct {m['o_contact']:.0%} swstr {m['swstr']:.1%} cstr {m['cstr']:.1%} "
          f"f-str {m['f_strike']:.0%}")
    return m


if __name__ == "__main__":
    print("BEFORE (all shifts 0)")
    for lvl in ("mlb", "college_d1", "college_d3"):
        show(lvl, lvl)
