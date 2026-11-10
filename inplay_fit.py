"""v0.8 step 3 (spec 7.3): typed batted balls. For each level, writes inplay_typed_params.py with
- OUT_TABLE[level][contact][type] = (out, 1B, 2B, 3B, HR, E): iterative proportional fit of the starting shapes so the
  type-weighted marginal at the reference mix equals the engine's current IN_PLAY_BY_LEVEL[level][contact];
- S_G, S_F (runner on 3rd scores on GB / FB outs) solved so the typed rate equals the chain's T_L (we_rates.json);
- S_DP so the typed double-play rate per opportunity equals the chain's DP rate.
Reads the current engine tables; never reruns fit_all.py. usage: python3 inplay_fit.py"""
# Nov 6: the engine is now one flag-free v0.9 engine. This script ran under the v0.7c settings when its data was made;
# those settings no longer exist, so a rerun computes v0.9-based values.

import json, os
from math import exp, log
import engine as e
import college_rates as cr
import chain_v08

TYPES = ("GB", "LD", "FB", "PU")
SHAPE = {"GB": (0.75, 0.225, 0.02, 0.002, 0.0, 0.03), "LD": (0.32, 0.48, 0.16, 0.02, 0.02, 0.005),
         "FB": (0.78, 0.04, 0.06, 0.01, 0.11, 0.005), "PU": (0.98, 0.015, 0.003, 0.0, 0.0, 0.005)}
REF_GB = (e.TYPED["gb"]["4-seam"], e.TYPED["gb"]["SL"], e.TYPED["gb"]["CH"])   # reference mix: four-seam, slider,
# changeup at 2.5 ft (v1.0 #16: the fitted rates, previously the spec guesses 0.379 / 0.439 / 0.478)


def type_mix(gb_p, y, c):
    """P(type | pitch GB rate, target height, contact): spec 7.3."""
    g = e.sig(e.logit(gb_p) + e.TYPED["beta_y"] * (y - 2.5) + e.TYPED["gamma"][c])
    lfp = e.TYPED["nongb"][c]
    return {"GB": g, "LD": (1 - g) * lfp[0], "FB": (1 - g) * lfp[1], "PU": (1 - g) * lfp[2]}


def ref_type_mix(c):
    ms = [type_mix(g, 2.5, c) for g in REF_GB]
    return {t: sum(m[t] for m in ms) / len(ms) for t in TYPES}


def ipf(c, target):
    w = ref_type_mix(c)
    X = {t: list(SHAPE[t]) for t in TYPES}
    for t in TYPES:
        s_ = sum(X[t]); X[t] = [v / s_ for v in X[t]]
    for _ in range(5000):
        for o in range(6):
            col = sum(w[t] * X[t][o] for t in TYPES)
            if col > 0:
                f = target[o] / col
                for t in TYPES:
                    X[t][o] *= f
        for t in TYPES:
            s_ = sum(X[t]); X[t] = [v / s_ for v in X[t]]
    err = max(abs(sum(w[t] * X[t][o] for t in TYPES) - target[o]) for o in range(6))
    return X, err


def ref_contact_mix(level):
    """Share of weak/solid/hard among balls in play for a three-pitch average arsenal, all targets, 0-0, bases empty."""
    from metrics import ref_arsenals
    ars = ref_arsenals()["three"]; s = e.Situation(0, 0, 0, (False, False, False), level=level)
    tot = {"weak": 0.0, "solid": 0.0, "hard": 0.0}
    for p in ars:
        for q in e.QUADS:
            P = e.outcome_probs(p, q, s, ars)
            for c in tot:
                tot[c] += P[c]
    t = sum(tot.values())
    return {c: v / t for c, v in tot.items()}


def main():
    we = json.load(open("we_rates.json"))
    table, fit = {}, {}
    for level in ("college_d1", "college_d3", "hs", "mlb"):
        table[level] = {}
        worst = 0
        for c in ("weak", "solid", "hard"):
            X, err = ipf(c, e.IN_PLAY_BY_LEVEL[level][c])
            table[level][c] = {t: tuple(X[t]) for t in TYPES}
            worst = max(worst, err)
        cm = ref_contact_mix(level)
        # out shares by type at the reference mix, and DP weighting among GB outs
        outs = {t: 0.0 for t in TYPES}; dpw = 0.0
        for c, pc in cm.items():
            tm = ref_type_mix(c)
            for t in TYPES:
                o = pc * tm[t] * table[level][c][t][0]
                outs[t] += o
                if t == "GB":
                    dpw += o * e.TYPED["dp"][c]
        tot = sum(outs.values()); share = {t: v / tot for t, v in outs.items()}
        d_bar = dpw / outs["GB"]
        s_dp = we[level]["gdp_rate"] / (share["GB"] * d_bar)
        d = min(0.95, d_bar * s_dp)                       # DP chance given a GB out with runner on 1st, < 2 outs
        # T_L by the same visit weighting as the chain
        r, RE, f = chain_v08.calibrate(level)
        visits, _ = cr.state_freq_and_pa(r)
        states = [(o, b, v) for (o, b), v in visits.items() if cr.bits(b)[2] and o < 2]
        def typed_rate(pg, pf):
            num = den = 0.0
            for o, b, v in states:
                r1 = cr.bits(b)[0]
                dd = d if r1 else 0.0
                rate = share["GB"] * (dd * (1.0 if o == 0 else 0.0) + (1 - dd) * pg) + share["FB"] * pf + (share["LD"] + share["PU"]) * 0.01
                num += v * rate; den += v
            return num / den
        target = we[level]["T_L"]
        lo, hi = 0.0, 5.0
        for _ in range(80):                                # common multiplier first
            sm = (lo + hi) / 2
            pg, pf = min(0.95, 0.35 * sm), min(0.85, 0.60 * sm)
            if typed_rate(pg, pf) < target: lo = sm
            else: hi = sm
        s_G = s_F = (lo + hi) / 2
        if 0.60 * s_F > 0.85:                              # fly-ball outs capped at 0.85: raise ground balls alone
            s_F = 0.85 / 0.60
            lo, hi = 0.0, 0.95 / 0.35
            for _ in range(80):
                sm = (lo + hi) / 2
                if typed_rate(min(0.95, 0.35 * sm), 0.85) < target: lo = sm
                else: hi = sm
            s_G = (lo + hi) / 2
        pg, pf = min(0.95, 0.35 * s_G), min(0.85, 0.60 * s_F)
        got = typed_rate(pg, pf)
        fit[level] = dict(S_G=s_G, S_F=s_F, S_DP=s_dp, p_GB=pg, p_FB=pf, T_L=target, typed_rate=got,
                          shortfall=target - got, out_share=share, contact_mix=cm, ipf_err=worst)
        print(f"{level:11} IPF err {worst:.1e}  out shares GB {share['GB']:.2f} FB {share['FB']:.2f} LD+PU {share['LD']+share['PU']:.2f}  "
              f"T_L {target:.3f} typed {got:.3f}  p_GB {pg:.2f} p_FB {pf:.2f}  s_dp {s_dp:.2f}")
    for t in (table, fit):
        t["travel"] = t["hs"]; t["college"] = t["college_d1"]
    with open("inplay_typed_params.py", "w") as fh:
        fh.write('"""Generated by inplay_fit.py (v0.8 step 3, spec 7.3). Loaded only when the inplay_typed flag is on."""\n')
        fh.write(f"OUT_TABLE = {json.dumps(table, indent=1)}\n")
        fh.write(f"RUNNER_FIT = {json.dumps(fit, indent=1)}\n")


if __name__ == "__main__":
    main()
