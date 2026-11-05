"""v0.8 step 3 (spec 7.0): the corrected, calibrated base-out chain for each level -> we_rates.json.
- Rates: college from college_rates.rates_v08 (steal fix), HS/travel from hs_rates.rates(NAT_2026), MLB from MLB.
- Calibration: one common factor on walk, HBP and hit rates until the chain's RE(0, empty) matches RE_BY_LEVEL within
  0.5%; calibrate_out_rates and solve_re rerun inside each iteration.
- Gate: D1 and D3 within max(5%, 0.035 runs) in every base-out state; HS/travel/MLB report-only.
- Targets for the typed batted-ball tables: T_L (runner on 3rd scores on a ball-in-play out, visit-weighted) and the
  double-play rate per opportunity.
Never touches college_run_values.json or run_tables.py. usage: python3 chain_v08.py"""
import json, os
import college_rates as cr
import hs_rates as hr
from run_tables import RE_BY_LEVEL

HIT = ("BB", "HBP", "1B", "2B", "3B", "HR")


def base_rates(level):
    if level == "college_d1":
        return cr.rates_v08(cr.D1)
    if level == "college_d3":
        return cr.rates_v08(cr.D3)
    if level == "hs":
        return hr.rates(hr.NAT_2026)
    return dict(cr.MLB)


def chain_re(r):
    cr.calibrate_out_rates(r)
    return cr.solve_re(r, iters=300)


def calibrate(level):
    raw = base_rates(level)
    target = RE_BY_LEVEL[level][(0, "000")]
    lo, hi = 0.7, 1.4
    for _ in range(40):
        f = (lo + hi) / 2
        r = dict(raw)
        for k in HIT:
            r[k] = raw[k] * f
        RE = chain_re(r)
        if RE[(0, 0)] < target:
            lo = f
        else:
            hi = f
        if abs(RE[(0, 0)] / target - 1) < 0.001:
            break
    return r, RE, f


def t_l(r):
    """Visit-weighted chance the runner on 3rd scores on a ball-in-play out with < 2 outs (pa_transitions' rules)."""
    visits, _ = cr.state_freq_and_pa(r)
    num = den = 0.0
    for (o, b), v in visits.items():
        r1, r2, r3 = cr.bits(b)
        if not r3 or o >= 2:
            continue
        g = r["_gdp_rate"] if r1 else 0.0
        sf = r["_sf_rate"]
        rate = sf + 0.25 * (1 - g - sf) + (g if o == 0 else 0.0)
        num += v * rate; den += v
    return num / den, visits


def main():
    out = {}
    for level in ("college_d1", "college_d3", "hs", "mlb"):
        r, RE, f = calibrate(level)
        tl, visits = t_l(r)
        gaps = []
        for (o, b), v in RE.items():
            want = RE_BY_LEVEL[level][(o, cr.key(b))]
            gaps.append((abs(v - want), abs(v / want - 1), f"{o}|{cr.key(b)}"))
        worst = max(gaps, key=lambda x: min(x[0] / 0.035, x[1] / 0.05))
        over = [g for g in gaps if g[0] > 0.035 and g[1] > 0.05]
        gate = level in ("college_d1", "college_d3")
        ok = (not over) if gate else None
        sb, cs = r["SB"], r["CS"]
        out[level] = dict(rates={k: v for k, v in r.items() if not k.startswith("_") or k in ("_gdp_rate", "_sf_rate", "_sh_rate")},
                          factor=f, RE={f"{o}|{cr.key(b)}": v for (o, b), v in RE.items()}, T_L=tl,
                          gdp_rate=r["_gdp_rate"], sf_rate=r["_sf_rate"], steal_success=sb / (sb + cs) if sb + cs else None,
                          gate="pass" if ok else ("FAIL" if gate else "report-only"),
                          over=[g[2] for g in over], worst=dict(state=worst[2], runs=worst[0], rel=worst[1]))
        print(f"{level:11} factor {f:.4f}  RE00 {RE[(0, 0)]:.3f} (table {RE_BY_LEVEL[level][(0, '000')]:.3f})  "
              f"worst {worst[2]} {worst[0]:.3f} runs {worst[1]:.1%}  gate {out[level]['gate']} {out[level]['over']}  "
              f"T_L {tl:.3f}  DP/opp {r['_gdp_rate']:.3f}  SB% {out[level]['steal_success']:.3f}")
    out["travel"] = out["hs"]; out["college"] = out["college_d1"]
    json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "we_rates.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
