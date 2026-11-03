"""
Rebuild run values for college levels from public 2026 conference stats.

Data: overall 2026 team totals from conference stat pages (Sidearm format), fetched Nov 2, 2026.
  D3: Liberty League (11 teams), Empire 8 (9), NESCAC (10), UAA (6)        = 36 teams
  D1: Big East (8), America East (7), Ivy League (8)                      = 23 teams (mid/low major only)
Method:
  1. Per-PA event rates for each division.
  2. Exact base-out Markov model of an inning -> run expectancy RE(outs, bases).
  3. Validate: (a) MLB-era rates reproduce the MLB RE24 the engine used; (b) each division's
     model runs per PA match its actual runs per PA.
  4. Linear weights from RE -> scale count values.
"""
import json

# columns: G, AB, R, H, 2B, 3B, HR, BB, HBP, SO, SF, SH, GDP, SB, SBATT, E, PB, WP  (None = not shown)
D3 = {
 # Liberty League (no PB/WP shown)
 "Ithaca": (35,1204,314,392,69,8,34,188,85,239,25,8,17,85,None,59,None,None),
 "Union": (37,1283,287,400,90,10,20,178,63,245,21,20,16,57,None,61,None,None),
 "St. Lawrence": (36,1251,258,384,73,9,21,118,45,187,20,14,14,59,None,49,None,None),
 "Hobart": (47,1540,383,464,94,24,14,228,104,306,29,20,17,124,None,35,None,None),
 "RIT": (39,1385,324,415,91,11,52,176,62,267,16,14,9,40,None,43,None,None),
 "Skidmore": (33,1106,247,329,66,15,19,171,55,210,18,19,19,84,None,48,None,None),
 "RPI": (40,1343,287,383,80,7,25,183,71,269,24,34,5,108,None,53,None,None),
 "Rochester": (35,1139,191,313,55,8,7,107,45,239,19,38,17,39,None,63,None,None),
 "Clarkson": (34,1133,215,308,69,8,9,126,46,211,18,15,11,32,None,62,None,None),
 "Bard": (33,966,197,262,40,10,9,115,63,203,14,15,10,63,None,68,None,None),
 "Vassar": (33,1026,203,276,55,18,10,163,43,259,15,23,12,20,None,66,None,None),
 # Empire 8
 "Russell Sage": (42,1392,449,479,105,15,27,248,101,238,39,18,2,190,219,82,12,46),
 "St. John Fisher": (42,1480,417,469,110,20,40,264,74,293,21,10,11,81,92,65,25,32),
 "Utica": (40,1351,367,420,89,17,37,180,85,288,28,18,13,57,67,73,9,41),
 "Brockport": (43,1502,378,460,87,12,40,201,73,242,23,33,17,94,111,54,18,39),
 "Poly": (32,1065,231,311,73,9,18,134,50,235,19,29,10,37,44,63,13,31),
 "Houghton": (36,1167,250,334,85,17,17,150,91,304,15,16,12,76,89,81,13,67),
 "Elmira": (35,1099,238,308,57,5,23,155,73,266,20,10,6,45,60,69,18,53),
 "Keuka": (35,1123,198,293,49,12,6,168,46,219,16,18,12,41,55,66,13,27),
 "Alfred": (40,1110,156,261,58,5,7,135,47,297,10,3,3,18,21,92,29,88),
 # NESCAC
 "Middlebury": (36,1244,290,401,89,17,29,150,59,265,19,15,7,87,106,54,9,38),
 "Amherst": (40,1352,329,429,86,7,10,191,48,172,24,11,35,62,69,44,14,35),
 "Tufts": (42,1367,318,427,87,17,24,189,63,206,30,21,13,89,106,38,6,17),
 "Trinity": (43,1452,355,452,98,19,41,229,43,291,33,8,15,115,138,61,17,26),
 "Bates": (30,949,254,290,55,5,21,138,60,166,27,21,10,102,111,36,7,17),
 "Colby": (35,1080,190,308,53,5,17,142,37,194,19,23,6,49,56,54,14,25),
 "Williams": (32,1002,207,282,66,10,7,147,57,204,11,19,16,64,79,62,12,51),
 "Wesleyan": (37,1164,216,313,64,6,13,176,68,277,10,17,25,69,86,70,12,43),
 "Hamilton": (33,1043,198,275,51,8,10,145,42,220,13,10,1,51,63,59,16,36),
 "Bowdoin": (36,1108,217,285,57,10,21,136,48,208,7,14,9,70,85,51,11,24),
 # UAA
 "WashU": (43,1429,375,456,97,20,16,213,113,224,35,20,17,140,172,55,2,41),
 "Chicago": (45,1548,351,477,102,9,37,220,84,280,14,7,32,71,83,56,3,49),
 "NYU": (34,1125,282,338,66,12,29,169,85,233,14,9,9,46,56,43,16,50),
 "Brandeis": (36,1186,267,340,60,16,15,169,66,274,20,21,16,67,76,31,5,31),
 "Emory": (39,1325,291,376,76,9,24,214,52,281,26,18,18,54,66,81,10,60),
 "Case Western": (39,1331,229,370,75,19,9,148,41,267,15,16,25,86,105,68,10,48),
}
D1 = {
 # Big East
 "UConn": (58,1967,390,550,116,10,61,277,69,462,27,23,35,71,101,62,15,36),
 "Creighton": (54,1858,356,515,97,7,55,252,86,432,24,17,36,80,95,43,10,42),
 "St. John's": (53,1816,323,503,88,9,45,226,61,374,19,28,30,80,103,42,18,32),
 "Georgetown": (55,1829,370,505,83,12,46,302,71,429,19,37,33,89,108,74,12,54),
 "Xavier": (56,1926,312,511,94,5,70,206,89,501,21,20,21,44,58,56,2,36),
 "Villanova": (50,1671,297,438,85,10,34,212,64,382,25,12,16,92,112,56,13,41),
 "Butler": (53,1748,322,445,67,8,60,211,68,510,13,21,15,68,84,65,4,60),
 "Seton Hall": (46,1481,204,367,67,17,10,198,47,374,23,28,21,61,79,62,13,41),
 # America East
 "UMBC": (53,1806,391,528,107,9,33,283,84,322,37,34,26,73,92,70,11,32),
 "Bryant": (52,1684,344,471,97,19,48,223,67,386,31,31,17,147,167,55,11,45),
 "UMass Lowell": (52,1807,317,499,88,8,28,197,56,310,18,25,37,70,86,68,7,42),
 "Binghamton": (53,1730,366,460,75,9,49,270,68,395,28,33,28,43,54,50,13,43),
 "Maine": (56,1868,334,485,77,7,75,224,62,413,26,19,36,64,80,51,7,56),
 "UAlbany": (49,1633,247,416,69,9,20,211,36,409,11,9,35,54,74,81,12,37),
 "NJIT": (48,1609,267,395,66,6,34,222,71,382,26,27,25,48,63,60,18,24),
 # Ivy
 "Yale": (46,1534,350,432,98,11,25,211,112,334,27,44,18,126,153,45,12,48),
 "Columbia": (42,1452,250,402,82,4,35,172,48,282,15,9,33,31,45,47,4,39),
 "Penn": (42,1435,264,381,82,9,29,188,55,327,22,6,23,105,115,40,6,44),
 "Brown": (43,1438,262,380,69,9,30,183,78,322,16,14,16,68,86,55,7,34),
 "Cornell": (37,1245,161,318,47,1,24,106,55,300,11,28,21,32,51,40,18,47),
 "Princeton": (42,1393,203,334,56,4,27,147,43,356,8,10,17,50,64,50,6,52),
 "Harvard": (37,1258,190,301,56,7,31,147,44,364,11,9,24,33,47,55,10,36),
 "Dartmouth": (40,1278,167,300,51,8,13,162,72,277,12,24,22,71,92,54,10,35),
}
COLS = ["G","AB","R","H","2B","3B","HR","BB","HBP","SO","SF","SH","GDP","SB","SBATT","E","PB","WP"]


def totals(teams):
    t = {c: 0 for c in COLS}
    have = {c: 0 for c in COLS}     # PA of teams that report this column (for rates of partial columns)
    for row in teams.values():
        d = dict(zip(COLS, row))
        pa = d["AB"] + d["BB"] + d["HBP"] + d["SF"] + d["SH"]
        for c in COLS:
            if d[c] is not None:
                t[c] += d[c]
                have[c] += pa
    t["PA"] = sum(d[1] + d[7] + d[8] + d[10] + d[11] for d in teams.values())
    return t, have


def rates(teams):
    t, have = totals(teams)
    PA = t["PA"]
    one_b = t["H"] - t["2B"] - t["3B"] - t["HR"]
    r = {
        "PA": PA, "teams": len(teams),
        "K": t["SO"] / PA, "BB": t["BB"] / PA, "HBP": t["HBP"] / PA,
        "1B": one_b / PA, "2B": t["2B"] / PA, "3B": t["3B"] / PA, "HR": t["HR"] / PA,
        "SF": t["SF"] / PA, "SH": t["SH"] / PA, "GDP": t["GDP"] / PA,
        "E": t["E"] / PA,                                   # errors per PA (defense)
        "WPPB": (t["WP"] + t["PB"]) / have["WP"],           # per PA, from teams that report both
        "SB": t["SB"] / PA,
        "CS": (t["SBATT"] - t["SB"]) / have["SBATT"] if have["SBATT"] else 0.0,
        "R_per_PA": t["R"] / PA,
        "AVG": t["H"] / t["AB"],
        "OBP": (t["H"] + t["BB"] + t["HBP"]) / (t["AB"] + t["BB"] + t["HBP"] + t["SF"]),
        "SLG": (one_b + 2 * t["2B"] + 3 * t["3B"] + 4 * t["HR"]) / t["AB"],
        "R_per_G": t["R"] / t["G"],
    }
    return r


# MLB 2010-15 era per-PA rates (approximate public league averages) -- used only to validate the method
# against the MLB RE24 table the engine already uses.
MLB = {"K": 0.200, "BB": 0.079, "HBP": 0.009, "1B": 0.154, "2B": 0.045, "3B": 0.005, "HR": 0.026,
       "SF": 0.007, "SH": 0.008, "GDP": 0.019, "E": 0.016, "WPPB": 0.0095, "SB": 0.0130, "CS": 0.0050,
       "R_per_PA": 0.112}


# ---------------------------------------------------------------------------
# Exact base-out Markov model of an inning
# ---------------------------------------------------------------------------
STATES = [(o, b) for o in range(3) for b in range(8)]   # b bits: 1 = runner on 1st, 2 = 2nd, 4 = 3rd


def bits(b):
    return bool(b & 1), bool(b & 2), bool(b & 4)


def mk(r1, r2, r3):
    return (1 if r1 else 0) | (2 if r2 else 0) | (4 if r3 else 0)


def transitions(r, o, b):
    """List of (prob, runs, new_outs, new_bases) for one plate appearance from state (o, b).
    Event probabilities are per PA; steals and wild pitches happen before the PA."""
    r1, r2, r3 = bits(b)
    out = []
    # --- before the pitch: wild pitch / passed ball (all runners up one), steal of 2nd
    pre = []
    p_wp = (r["WPPB"] + 0.45 * r["E"]) if b else 0.0      # wild pitch, passed ball, or a fielding error on a runner
    if b:
        nr = mk(False, r1, r2)
        pre.append((p_wp, 1 if r3 else 0, o, nr))
    p_att = 0.0
    if r1 and not r2:
        p_att = (r["SB"] + r["CS"]) / 0.22          # attempts concentrate in the ~22% of PAs with 2nd open, runner on 1st
        p_att = min(p_att, 0.6)
        p_sb = r["SB"] / (r["SB"] + r["CS"]) if (r["SB"] + r["CS"]) else 0.0
        pre.append((p_att * p_sb, 0, o, mk(False, True, r3)))
        pre.append((p_att * (1 - p_sb), 0, o + 1, mk(False, False, r3)))
    p_none = 1 - sum(p for p, *_ in pre)
    starts = [(p_none, 0, o, b)] + pre
    for ps, rs, so, sb in starts:
        if so >= 3:
            out.append((ps, rs, 3, 0))
            continue
        for p, runs, no, nb in pa_transitions(r, so, sb):
            out.append((ps * p, rs + runs, no, nb))
    return out


def pa_transitions(r, o, b):
    r1, r2, r3 = bits(b)
    t = []
    roe = 0.55 * r["E"]                            # share of errors that put the batter on
    p = {"K": r["K"], "BB": r["BB"] + r["HBP"], "1B": r["1B"], "2B": r["2B"], "3B": r["3B"],
         "HR": r["HR"], "ROE": roe}
    p["OUT"] = max(0.0, 1 - sum(p.values()))
    # walk / HBP: forced advances
    nb = mk(True, r1 or r2, r3 or (r1 and r2))
    t.append((p["BB"], 1 if (r1 and r2 and r3) else 0, o, nb))
    t.append((p["K"], 0, o + 1, b))
    t.append((p["HR"], 1 + r1 + r2 + r3, o, 0))
    t.append((p["3B"], r1 + r2 + r3, o, mk(False, False, True)))
    # double: R2, R3 score; R1 scores 45%
    base2 = r2 + r3
    if r1:
        t.append((p["2B"] * 0.45, base2 + 1, o, mk(False, True, False)))
        t.append((p["2B"] * 0.55, base2, o, mk(False, True, True)))
    else:
        t.append((p["2B"], base2, o, mk(False, True, False)))
    # single / reached on error: R3 scores, R2 scores 60%, R1 to 2nd (to 3rd 25% if 3rd open after)
    for key in ("1B", "ROE"):
        pk = p[key]
        for p2, s2 in (((0.60, True), (0.40, False)) if r2 else ((1.0, False),)):
            runs = (1 if r3 else 0) + (1 if s2 else 0)
            third = (r2 and not s2)
            if r1 and not third:
                t.append((pk * p2 * 0.25, runs, o, mk(True, False, True)))
                t.append((pk * p2 * 0.75, runs, o, mk(True, True, False)))
            else:
                t.append((pk * p2, runs, o, mk(True, r1, third)))
    # ball-in-play out: double play, sac fly, sacrifice bunt, productive out, plain out
    po = p["OUT"]
    if o + 1 >= 3:
        t.append((po, 0, 3, 0))
        return t
    g = r["_gdp_rate"] if (r1 and o < 2) else 0.0
    sf = r["_sf_rate"] if (r3 and o < 2) else 0.0
    sh = r["_sh_rate"] if ((r1 or r2) and o == 0 and not r3) else 0.0
    rest = max(0.0, 1 - g - sf - sh)
    if g:
        if o + 2 >= 3:
            t.append((po * g, 0, 3, 0))
        else:
            # o == 0 here (o == 1 ends the inning above): R3 scores, R2 moves to 3rd
            t.append((po * g, 1 if r3 else 0, o + 2, mk(False, False, r2)))
    if sf:
        t.append((po * sf, 1, o + 1, mk(r1, r2, False)))
    if sh:
        t.append((po * sh, 0, o + 1, mk(False, r1, r2)))
    # other outs: runner on 3rd scores 25% of the time with <2 outs (grounder, infield back);
    # runner on 2nd moves to 3rd 30% of the time (grounder to the right side)
    if r3 and o < 2:
        t.append((po * rest * 0.25, 1, o + 1, mk(r1, r2, False)))
        rest *= 0.75
    if r2 and not r3:
        t.append((po * rest * 0.30, 0, o + 1, mk(r1, False, True)))
        t.append((po * rest * 0.70, 0, o + 1, b))
    else:
        t.append((po * rest, 0, o + 1, b))
    return t


def solve_re(r, iters=400):
    RE = {s: 0.0 for s in STATES}
    for _ in range(iters):
        new = {}
        for (o, b) in STATES:
            v = 0.0
            for p, runs, no, nb in transitions(r, o, b):
                v += p * (runs + (0.0 if no >= 3 else RE[(no, nb)]))
            new[(o, b)] = v
        RE = new
    return RE


def state_freq_and_pa(r):
    """Expected visits to each state per inning starting from (0, empty), and PA per inning."""
    visits = {s: 0.0 for s in STATES}
    dist = {s: 0.0 for s in STATES}
    dist[(0, 0)] = 1.0
    for _ in range(60):
        nd = {s: 0.0 for s in STATES}
        for s, m in dist.items():
            if m < 1e-12:
                continue
            visits[s] += m
            for p, runs, no, nb in transitions(r, *s):
                if no < 3:
                    nd[(no, nb)] += m * p
        dist = nd
    return visits, sum(visits.values())


def calibrate_out_rates(r):
    """Pick double-play / sac-fly / bunt rates on outs so the model's per-PA counts match the data."""
    r["_gdp_rate"], r["_sf_rate"], r["_sh_rate"] = 0.12, 0.35, 0.25
    for _ in range(25):
        visits, pa = state_freq_and_pa(r)
        out_share = max(1e-6, 1 - (r["K"] + r["BB"] + r["HBP"] + r["1B"] + r["2B"] + r["3B"] + r["HR"] + 0.55 * r["E"]))
        def opp(cond):
            return sum(v for (o, b), v in visits.items() if cond(o, b)) / pa * out_share
        g_opp = opp(lambda o, b: (b & 1) and o < 2)
        s_opp = opp(lambda o, b: (b & 4) and o < 2)
        h_opp = opp(lambda o, b: o == 0 and (b & 3) and not (b & 4))
        r["_gdp_rate"] = min(0.6, r["GDP"] / g_opp) if g_opp else 0
        r["_sf_rate"] = min(0.8, r["SF"] / s_opp) if s_opp else 0
        r["_sh_rate"] = min(0.8, r["SH"] / h_opp) if h_opp else 0
    return r


def linear_weights(r, RE):
    """Average run value of a walk and a strikeout across the states they happen in."""
    visits, pa = state_freq_and_pa(r)
    tot = sum(visits.values())
    def lw(kind):
        v = 0.0
        for (o, b), w in visits.items():
            r1, r2, r3 = bits(b)
            if kind == "BB":
                nb = mk(True, r1 or r2, r3 or (r1 and r2))
                runs = 1 if (r1 and r2 and r3) else 0
                v += w * (runs + RE[(o, nb)] - RE[(o, b)])
            else:
                nxt = 0.0 if o + 1 >= 3 else RE[(o + 1, b)]
                v += w * (nxt - RE[(o, b)])
        return v / tot
    return lw("BB"), lw("K")


ENGINE_RE24_MLB = {  # what the engine used (MLB 2010-15), outs -> bases "123"
    (0, "000"): 0.481, (0, "100"): 0.859, (0, "020"): 1.100, (0, "120"): 1.437, (0, "003"): 1.350,
    (0, "103"): 1.784, (0, "023"): 1.964, (0, "123"): 2.292, (1, "000"): 0.254, (1, "100"): 0.509,
    (1, "020"): 0.664, (1, "120"): 0.884, (1, "003"): 0.950, (1, "103"): 1.130, (1, "023"): 1.376,
    (1, "123"): 1.541, (2, "000"): 0.098, (2, "100"): 0.224, (2, "020"): 0.319, (2, "120"): 0.429,
    (2, "003"): 0.353, (2, "103"): 0.478, (2, "023"): 0.580, (2, "123"): 0.752}
CV_MLB = {(0, 0): 0.000, (1, 0): 0.038, (2, 0): 0.104, (3, 0): 0.214, (0, 1): -0.044, (1, 1): -0.011,
          (2, 1): 0.049, (3, 1): 0.162, (0, 2): -0.106, (1, 2): -0.077, (2, 2): -0.039, (3, 2): 0.059}


def key(b):
    r1, r2, r3 = bits(b)
    return ("1" if r1 else "0") + ("2" if r2 else "0") + ("3" if r3 else "0")


if __name__ == "__main__":
    out = {}
    levels = {"mlb_check": dict(MLB), "college_d1": rates(D1), "college_d3": rates(D3)}
    for name, r in levels.items():
        calibrate_out_rates(r)
        RE = solve_re(r)
        visits, pa_inn = state_freq_and_pa(r)
        model_r_per_pa = RE[(0, 0)] / pa_inn
        lw_bb, lw_k = linear_weights(r, RE)
        r["_RE"] = {f"{o}|{key(b)}": round(v, 3) for (o, b), v in RE.items()}
        r["_model_R_per_PA"] = model_r_per_pa
        r["_lw_bb"], r["_lw_k"] = lw_bb, lw_k
        out[name] = r
        extra = f"  AVG {r['AVG']:.3f} OBP {r['OBP']:.3f} SLG {r['SLG']:.3f}  R/G {r['R_per_G']:.2f}  ({r['teams']} teams, {r['PA']:,} PA)" if "AVG" in r else ""
        print(f"\n== {name}{extra}")
        print(f"   per PA: K {r['K']:.1%}  BB {r['BB']:.1%}  HBP {r['HBP']:.1%}  HR {r['HR']:.1%}  E {r['E']:.1%}  WP+PB {r['WPPB']:.1%}  SB {r['SB']:.1%}")
        print(f"   runs per PA: actual {r['R_per_PA']:.3f}  model {model_r_per_pa:.3f}  ({(model_r_per_pa/r['R_per_PA']-1):+.1%})")
        print(f"   RE bases empty, 0 out: {RE[(0,0)]:.3f} runs/inning   linear weights: walk {lw_bb:+.3f}, strikeout {lw_k:+.3f}")
    # validation (a): MLB rates vs the engine's MLB table
    m = out["mlb_check"]["_RE"]
    diffs = [m[f"{o}|{bb}"] - ENGINE_RE24_MLB[(o, bb)] for (o, bb) in ENGINE_RE24_MLB]
    print(f"\nVALIDATION vs engine's MLB RE24: mean diff {sum(diffs)/24:+.3f}, max |diff| {max(abs(d) for d in diffs):.3f}")
    # count values scaled by the walk-minus-strikeout spread
    mlb_spread = out["mlb_check"]["_lw_bb"] - out["mlb_check"]["_lw_k"]
    for name in ("college_d1", "college_d3"):
        spread = out[name]["_lw_bb"] - out[name]["_lw_k"]
        out[name]["_CV"] = {f"{b}-{k}": round(v * spread / mlb_spread, 3) for (b, k), v in CV_MLB.items()}
        out[name]["_cv_scale"] = spread / mlb_spread
        print(f"{name}: count values scaled x{spread/mlb_spread:.2f} vs MLB")
    json.dump(out, open("college_run_values.json", "w"), indent=1)
    print("\nRE tables (outs | bases 123):")
    print(f"{'state':10}{'MLB(engine)':>12}{'model MLB':>11}{'D1':>8}{'D3':>8}")
    for (o, bb), v in ENGINE_RE24_MLB.items():
        print(f"{o}|{bb:7}{v:12.3f}{out['mlb_check']['_RE'][f'{o}|{bb}']:11.3f}{out['college_d1']['_RE'][f'{o}|{bb}']:8.3f}{out['college_d3']['_RE'][f'{o}|{bb}']:8.3f}")
