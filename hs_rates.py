"""
High school run values from MaxPreps' national averages (2026 season, varsity).

Source: the "National Avg" column on MaxPreps team stats pages (Team Stats tab), read in a browser
on Nov 2, 2026. The column is identical on schools in different states (checked: Newsome, FL and
Mater Dei, CA, 2025-26), so it is a national per-team season average, not a team or state figure.
It is an average of TEAM SEASON TOTALS for teams that enter stats on MaxPreps (method not documented
on the page). Batting and pitching sides agree closely, which suggests the main counts are sound:
  PA 632 vs batters faced 628, K 133 vs 133, BB 89 vs 88, HBP 26 vs 26, R 131 vs 128.

Rarely-entered fields are less trustworthy (e.g. "Stolen Base Attempts" 28 < "Stolen Base" 64, so
attempts are entered by fewer teams). Caught stealing comes from the catcher success rate instead.
Games are 7 innings; run expectancy per inning does not depend on game length.

Same method as college_rates.py: per-PA rates -> exact base-out inning model -> RE, linear weights,
count values; RE scaled to match actual runs per PA.
"""
import json
import college_rates as cr

NAT_2026 = {   # MaxPreps national average per varsity team, 2025-26 season
    # batting
    "PA": 632, "AB": 507, "R": 131, "H": 145, "2B": 27, "3B": 5, "HR": 4, "SF": 5, "SH": 6,
    "BB": 89, "SO": 133, "HBP": 26, "ROE": 23, "FC": 15, "SB": 64,
    # fielding / catching
    "E": 45, "DP": 8, "PB": 8, "C_SBA": 22, "C_SB": 18,
    # pitching
    "IP": 123.4, "R_against": 128, "BF": 628, "WP": 20, "PITCHES": 2297,
}
NAT_2025 = {   # same column, 2024-25 season (for a year-to-year check)
    "PA": 621, "AB": 500, "R": 124, "H": 140, "2B": 25, "3B": 5, "HR": 4, "SF": 5, "SH": 6,
    "BB": 86, "SO": 132, "HBP": 25, "ROE": 23, "SB": 62, "E": 45, "DP": 8, "PB": 9, "WP": 19,
    "IP": 122.9, "R_against": 121, "BF": 616, "PITCHES": 2256,
}


def rates(t):
    PA = t["AB"] + t["BB"] + t["HBP"] + t["SF"] + t["SH"]
    one_b = t["H"] - t["2B"] - t["3B"] - t["HR"]
    sb_success = t.get("C_SB", 18) / t.get("C_SBA", 22)
    cs = t["SB"] * (1 - sb_success) / sb_success
    return {
        "PA": PA, "teams": "national avg",
        "K": t["SO"] / PA, "BB": t["BB"] / PA, "HBP": t["HBP"] / PA,
        "1B": one_b / PA, "2B": t["2B"] / PA, "3B": t["3B"] / PA, "HR": t["HR"] / PA,
        "SF": t["SF"] / PA, "SH": t["SH"] / PA, "GDP": t["DP"] / PA,
        "E": t["E"] / PA, "WPPB": (t["WP"] + t["PB"]) / t["BF"],
        "SB": t["SB"] / PA, "CS": cs / PA,
        "R_per_PA": t["R"] / PA,
        "AVG": t["H"] / t["AB"],
        "OBP": (t["H"] + t["BB"] + t["HBP"]) / (t["AB"] + t["BB"] + t["HBP"] + t["SF"]),
        "SLG": (one_b + 2 * t["2B"] + 3 * t["3B"] + 4 * t["HR"]) / t["AB"],
        "R_per_G": 7 * t["R_against"] / t["IP"],       # per 7-inning game, from the pitching side
        "ROE_check": t["ROE"] / PA, "pitches_per_PA": t["PITCHES"] / t["BF"],
    }


if __name__ == "__main__":
    out = json.load(open("college_run_values.json"))
    mlb = out["mlb_check"]
    mlb_spread = mlb["_lw_bb"] - mlb["_lw_k"]
    for tag, t in (("hs_2025", NAT_2025), ("hs", NAT_2026)):
        r = rates(t)
        cr.calibrate_out_rates(r)
        RE = cr.solve_re(r)
        visits, pa_inn = cr.state_freq_and_pa(r)
        model = RE[(0, 0)] / pa_inn
        scale = r["R_per_PA"] / model
        RE = {k: v * scale for k, v in RE.items()}
        lw_bb, lw_k = cr.linear_weights(r, RE)
        r["_RE"] = {f"{o}|{cr.key(b)}": round(v, 3) for (o, b), v in RE.items()}
        r["_model_R_per_PA"], r["_re_scale"] = model, scale
        r["_lw_bb"], r["_lw_k"] = lw_bb, lw_k
        spread = lw_bb - lw_k
        r["_CV"] = {f"{b}-{k}": round(v * spread / mlb_spread, 3) for (b, k), v in cr.CV_MLB.items()}
        r["_cv_scale"] = spread / mlb_spread
        print(f"\n== {tag}: AVG {r['AVG']:.3f} OBP {r['OBP']:.3f} SLG {r['SLG']:.3f}  R per 7 inn {r['R_per_G']:.2f}  "
              f"pitches/PA {r['pitches_per_PA']:.2f}")
        print(f"   per PA: K {r['K']:.1%}  BB {r['BB']:.1%}  HBP {r['HBP']:.1%}  1B {r['1B']:.1%}  2B {r['2B']:.1%}  "
              f"3B {r['3B']:.1%}  HR {r['HR']:.1%}  E {r['E']:.1%} (ROE seen {r['ROE_check']:.1%}, model 0.55xE "
              f"{0.55*r['E']:.1%})  WP+PB {r['WPPB']:.1%}  SB {r['SB']:.1%}  CS {r['CS']:.1%}")
        print(f"   runs/PA actual {r['R_per_PA']:.3f}, model {model:.3f} ({model/r['R_per_PA']-1:+.1%}) -> RE scaled x{scale:.3f}")
        print(f"   RE(0 out, empty) {RE[(0, 0)]:.3f}   walk {lw_bb:+.3f}  strikeout {lw_k:+.3f}  count values x{spread/mlb_spread:.2f}")
        out[tag] = r
    json.dump(out, open("college_run_values.json", "w"), indent=1)
    print("\nRE by state (outs|bases):  MLB   D1    D3    HS")
    for o in range(3):
        for b in ("000", "100", "020", "003", "120", "103", "023", "123"):
            k = f"{o}|{b}"
            print(f"  {k:7} " + "  ".join(f"{out[l]['_RE'][k]:.2f}" for l in ("mlb_check", "college_d1", "college_d3", "hs")))
