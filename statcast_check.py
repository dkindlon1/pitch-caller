"""Compare the engine's hitter-vs-pitch model (MLB level) with Statcast pitch data, by attack zone and count.
Data: one CSV per day from Baseball Savant's public search, e.g. for each date D (regular season):
  curl -o sc_D.csv "https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&hfSea=2025%7C&player_type=pitcher&game_date_gt=D&game_date_lt=D&type=details"
The 2026-11-03 run used 20 days of 2025 (Apr 8 - Sep 23). Raw files are not kept in the repo.
Attack zones are approximated from plate_x/plate_z and the batter's zone (heart < 67%, shadow < 133%, chase < 200%,
waste beyond), mapped to the engine's heart / edge / off / noncomp. Contact-quality categories aren't comparable
(the engine's "hard" is its own category); run values and the swing, take and whiff rates are.
usage: python3 -I statcast_check.py <raw_dir> <engine_dir>   (output: results/statcast_check.txt)"""
import sys, csv, glob, os
from collections import defaultdict
RAW, ENG = sys.argv[1], sys.argv[2]
sys.path.insert(0, ENG)
import engine as e

FB = {"FF", "SI", "FC"}; OS = {"SL", "ST", "CU", "KC", "CH", "FS", "SV", "SC", "FO"}
SWING = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play"}
WHIFF = {"swinging_strike", "swinging_strike_blocked", "foul_tip"}
TAKE = {"ball", "called_strike", "blocked_ball"}
SKIP = {"foul_bunt", "missed_bunt", "bunt_foul_tip", "pitchout", "automatic_ball", "hit_by_pitch", "automatic_strike"}

def zone(r):
    try:
        x, z, top, bot = float(r["plate_x"]), float(r["plate_z"]), float(r["sz_top"]), float(r["sz_bot"])
    except ValueError:
        return None
    nx = x / 0.83
    nz = (z - (top + bot) / 2) / ((top - bot) / 2 + 0.121)
    m = max(abs(nx), abs(nz))
    return "heart" if m < 0.67 else "edge" if m < 1.33 else "off" if m < 2.0 else "noncomp"

real = defaultdict(lambda: defaultdict(float))     # (cls, zone, b, k) -> sums
for f in sorted(glob.glob(os.path.join(RAW, "sc_*.csv"))):
    for r in csv.DictReader(open(f, encoding="utf-8-sig")):
        d = r["description"]
        if d in SKIP: continue
        cls = "FB" if r["pitch_type"] in FB else "OS" if r["pitch_type"] in OS else None
        z = zone(r)
        if not cls or not z: continue
        b, k = int(r["balls"]), int(r["strikes"])
        if b > 3 or k > 2: continue
        a = real[(cls, z, b, k)]
        a["n"] += 1
        sw = d in SWING
        a["swing"] += sw; a["take"] += d in TAKE; a["cs"] += d == "called_strike"
        a["whiff"] += d in WHIFF; a["foul"] += d == "foul"; a["bip"] += d == "hit_into_play"
        if d == "hit_into_play":
            lsa = r["launch_speed_angle"]
            a["hard"] += lsa in ("5", "6"); a["lsa_n"] += lsa != ""
            if r["estimated_woba_using_speedangle"]: a["xw"] += float(r["estimated_woba_using_speedangle"]); a["xw_n"] += 1
        empty = not (r["on_1b"] or r["on_2b"] or r["on_3b"])
        if empty and r["delta_run_exp"]:
            a["rv"] += float(r["delta_run_exp"]); a["rv_n"] += 1

# engine, MLB level, landing forced to one zone
def eng(cls, z, b, k):
    orig = e.landing
    e.landing = lambda p, q, s: {zz: (1.0 if zz == z else 0.0) for zz in ("heart", "edge", "off", "noncomp")}
    out = defaultdict(float)
    try:
        for same in (True, False):
            p = e.Pitch("P", "FB" if cls == "FB" else "SL", grade=3, command=3, conf=0.6)
            s = e.Situation(b, k, 1, (False, False, False), level="mlb", same_side=same)
            # v1.0 #18: the live cost (cost08) against this one-pitch at-bat table, relative to the count's own value
            # there (was the retired v0.7c cost() against fixed MLB count values)
            tab = e.solve_table([p], e.replace(s, balls=0, strikes=0))
            c, P = e.cost08(p, "down-away", s, [p], tab, tab.h0, None)
            v0 = tab.value(b, k, tab.h0)
            sw = P["whiff"] + P["foul"] + P["weak"] + P["solid"] + P["hard"]
            tk = P["ball"] + P["cstrike"] + P["wp_ball"]
            bip = P["weak"] + P["solid"] + P["hard"]
            for key, v in (("swing", sw), ("cs_take", P["cstrike"] / tk if tk else 0), ("whiff_sw", P["whiff"] / sw if sw else 0),
                           ("foul_sw", P["foul"] / sw if sw else 0), ("hard_bip", P["hard"] / bip if bip else 0), ("rv", c - v0)):
                out[key] += 0.5 * v
    finally:
        e.landing = orig
    return out

BUCKETS = {"0-0": [(0, 0)], "ahead (0-1,0-2,1-2)": [(0, 1), (0, 2), (1, 2)], "even (1-1,2-2)": [(1, 1), (2, 2)],
           "behind (1-0,2-0,2-1,3-1)": [(1, 0), (2, 0), (2, 1), (3, 1)], "3-0": [(3, 0)], "3-2": [(3, 2)],
           "two strikes (all)": [(0, 2), (1, 2), (2, 2), (3, 2)]}
ZN = {"heart": "heart", "edge": "shadow", "off": "chase", "noncomp": "waste"}
cache = {}
lines = []
tot_n = sum(a["n"] for a in real.values())
lines.append(f"2025 Statcast, {tot_n:,} pitches (20 regular-season days); engine at MLB level, pitch grade 3, command 3, neutral confidence")
lines.append("rates: real / engine.  RV = runs per pitch for the hitter, bases empty (real: delta_run_exp; engine: cost minus count value)")
for cls in ("FB", "OS"):
    for bname, counts in BUCKETS.items():
        lines.append(f"\n{cls}  {bname}")
        lines.append(f"  {'zone':7} {'pitches':>8} {'swing':>13} {'called str/take':>16} {'whiff/swing':>13} {'foul/swing':>13} {'hard/in play':>13} {'RV per pitch':>16}")
        for z in ("heart", "edge", "off", "noncomp"):
            R = defaultdict(float); Eg = defaultdict(float); w = 0
            for (b, k) in counts:
                a = real.get((cls, z, b, k))
                if not a or not a["n"]: continue
                for kk, v in a.items(): R[kk] += v
                key = (cls, z, b, k)
                if key not in cache: cache[key] = eng(cls, z, b, k)
                for kk, v in cache[key].items(): Eg[kk] += a["n"] * v
                w += a["n"]
            if not w: continue
            f = lambda x, y: f"{x:6.1%} / {y:5.1%}"
            sw_r = R["swing"] / R["n"]; cs_r = R["cs"] / R["take"] if R["take"] else 0
            wh_r = R["whiff"] / R["swing"] if R["swing"] else 0; fo_r = R["foul"] / R["swing"] if R["swing"] else 0
            hd_r = R["hard"] / R["lsa_n"] if R["lsa_n"] else 0; rv_r = R["rv"] / R["rv_n"] if R["rv_n"] else 0
            lines.append(f"  {ZN[z]:7} {int(R['n']):8d} {f(sw_r, Eg['swing']/w):>13} {f(cs_r, Eg['cs_take']/w):>16} {f(wh_r, Eg['whiff_sw']/w):>13} "
                         f"{f(fo_r, Eg['foul_sw']/w):>13} {f(hd_r, Eg['hard_bip']/w):>13} {rv_r:+7.3f} / {Eg['rv']/w:+.3f}")
print("\n".join(lines))
