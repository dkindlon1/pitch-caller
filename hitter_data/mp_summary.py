"""v1.3 (Drew's Nov 24 rulings 12-14), tasks 3-4: the engine-called sims on the mean-preserved core.

Reads the kgap_diag worker games of {KGAP_MP}/sims/{level}__{variant} (seeds paired across variants and with the fixed
core's {KGAP_FIXED}/sims/{level}__base) and reports, against the chain-definition targets (pa_targets_v13.json):

  calling edge (ruling 13)   K (sims) - K target, per level, game-clustered SE; > +1.5 points = stop for Drew
  BB / HBP                   sims - target (must land within 1 point)
  runs per game              and the paired change vs the fixed core (52be85b)
  HS fastball floor          thrown fastball share by count: all pitches, and where the final call allowed a fastball
                             (ruling 14), beside the floor
  trend / edge (task 4)      paired K / BB / HBP / runs change when the zone trend extension is off and when the edge
                             called strike is set to real; and how much they reshape the calls (pitch-class share and
                             landing-band change by count)

    python -m hitter_data.mp_summary     # -> {KGAP_MP}/mp_summary.json / .md
"""
import json
import math
import os

from .kgapfix_summary import load, ratio, pdiff, rdiff

NEW = os.environ.get("KGAP_MP", "C:/dev/pitchiq-data/kgap_mp")
FIXED = "C:/dev/pitchiq-data/kgap_fixed"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVELS = ("mlb", "college_d1", "college_d2", "college_d3", "hs")
NAME = {"mlb": "MLB (control)", "college_d1": "D1", "college_d2": "D2", "college_d3": "D3", "hs": "HS"}
CK = [f"{b}-{k}" for k in range(3) for b in range(4)]
EDGE_STOP = 0.015


def fb_share(G):
    out = {}
    for ck in CK:
        n = sum(g["counts"].get(ck, {}).get("n", 0) for g in G.values())
        fb = sum(g["counts"].get(ck, {}).get("n_cls", {}).get("FB", 0) for g in G.values())
        al = [g["counts"].get(ck, {}).get("fb_allowed") for g in G.values()]
        an = sum(a["n"] for a in al if a)
        afb = sum(a["FB"] for a in al if a)
        acall = sum(a["call_fb"] for a in al if a)
        out[ck] = dict(all=fb / n if n else None, n=n, allowed=afb / an if an else None, allowed_n=an,
                       allowed_share_of_pitches=an / n if n else None, call_fb_where_allowed=acall / an if an else None)
    return out


def class_band(G):
    """pitch-class share and landing-band mix by count (to show how a variant reshapes the calls)"""
    out = {}
    for ck in CK:
        n = sum(g["counts"].get(ck, {}).get("n", 0) for g in G.values())
        if not n:
            continue
        fb = sum(g["counts"][ck]["n_cls"]["FB"] for g in G.values() if ck in g["counts"])
        land = [sum(g["counts"][ck]["land"][c][i] for g in G.values() if ck in g["counts"] for c in ("FB", "OS")) / n for i in range(4)]
        out[ck] = dict(fb=fb / n, land=land)
    return out


def main():
    tg = json.load(open(os.path.join(ROOT, "pa_targets_v13.json"), encoding="utf-8"))["levels"]
    floor = json.load(open(os.path.join(ROOT, "data_tables", "count_v13core.json"), encoding="utf-8"))["levels"]["hs"]["fb_floor"]
    res = {"levels": {}, "targets": {lv: {k: tg[lv][k] for k in ("K", "BB", "HBP")} for lv in LEVELS}}
    for lv in LEVELS:
        base = load(NEW, lv, "base")
        if not base:
            continue
        L = {"games": len(base)}
        for k in ("K", "BB", "HBP"):
            r, se = ratio(base, k)
            L[k] = dict(sims=r, se=se, target=tg[lv][k], gap=r - tg[lv][k])
        L["calling_edge"] = L["K"]["gap"]
        L["calling_edge_stop"] = L["K"]["gap"] > EDGE_STOP
        L["bb_hbp_within_1"] = abs(L["BB"]["gap"]) <= 0.01 and abs(L["HBP"]["gap"]) <= 0.01
        L["runs"] = sum(g["runs"] for g in base.values()) / len(base)
        L["reach2"] = ratio(base, "reach2")[0]
        L["ppa"] = ratio(base, "pitches")[0]
        fx = load(FIXED, lv, "base")
        if fx:
            L["vs_fixed"] = {k: pdiff(fx, base, k) for k in ("K", "BB", "HBP")}
            L["vs_fixed"]["runs"] = rdiff(fx, base)
        if lv == "hs":
            L["fb_share"] = fb_share(base)
            L["floor"] = floor
        cb0 = class_band(base)
        L["variants"] = {}
        for v in ("trendoff", "edgereal"):
            g = load(NEW, lv, v)
            if len(g) < 20:
                continue
            d = {k: pdiff(base, g, k) for k in ("K", "BB", "HBP")}
            d["runs"] = rdiff(base, g)
            cb1 = class_band(g)
            d["reshape"] = {ck: dict(fb=cb1[ck]["fb"] - cb0[ck]["fb"], land=[a - b for a, b in zip(cb1[ck]["land"], cb0[ck]["land"])])
                            for ck in cb0 if ck in cb1}
            d["reshape_max_fb"] = max(abs(x["fb"]) for x in d["reshape"].values())
            d["reshape_max_land"] = max(abs(y) for x in d["reshape"].values() for y in x["land"])
            d["games"] = len(g)
            L["variants"][v] = d
        res["levels"][lv] = L
    json.dump(res, open(os.path.join(NEW, "mp_summary.json"), "w", encoding="utf-8"), indent=1)
    R = res["levels"]
    lv_ = [l for l in LEVELS if l in R]
    pt = lambda x: "–" if not x else f"{100 * x[0]:+.1f} ± {100 * x[1]:.1f}"
    lines = ["| engine-called sims | " + " | ".join(NAME[l] for l in lv_) + " |", "|---|" + "---|" * len(lv_)]
    lines.append("| games | " + " | ".join(str(R[l]["games"]) for l in lv_) + " |")
    for k in ("K", "BB", "HBP"):
        lines.append(f"| {k}: sims (target) | " + " | ".join(f"{100 * R[l][k]['sims']:.1f} ± {100 * R[l][k]['se']:.1f} ({100 * R[l][k]['target']:.1f})" for l in lv_) + " |")
    lines.append("| **calling edge (K − target)** | " + " | ".join(
        f"**{100 * R[l]['K']['gap']:+.1f} ± {100 * R[l]['K']['se']:.1f}**" + (" STOP" if R[l]["calling_edge_stop"] else "") for l in lv_) + " |")
    lines.append("| BB − target / HBP − target | " + " | ".join(f"{100 * R[l]['BB']['gap']:+.1f} / {100 * R[l]['HBP']['gap']:+.1f}" for l in lv_) + " |")
    lines.append("| runs per game | " + " | ".join(f"{R[l]['runs']:.2f}" for l in lv_) + " |")
    lines.append("| K vs the fixed core (paired) | " + " | ".join(pt(R[l].get("vs_fixed", {}).get("K")) for l in lv_) + " |")
    lines.append("| runs vs the fixed core (paired) | " + " | ".join(
        (f"{R[l]['vs_fixed']['runs'][0]:+.2f} ± {R[l]['vs_fixed']['runs'][1]:.2f}" if R[l].get("vs_fixed") else "–") for l in lv_) + " |")
    for v, lab in (("trendoff", "zone trend extension off"), ("edgereal", "edge called strike set to real")):
        for k in ("K", "BB", "runs"):
            cell = lambda l: (pt(R[l]["variants"][v][k]) if k != "runs" else
                              f"{R[l]['variants'][v]['runs'][0]:+.2f} ± {R[l]['variants'][v]['runs'][1]:.2f}") if v in R[l]["variants"] else "–"
            lines.append(f"| {lab}: {k} change | " + " | ".join(cell(l) for l in lv_) + " |")
        lines.append(f"| {lab}: largest fastball-share / landing-band change in a count | " + " | ".join(
            (f"{100 * R[l]['variants'][v]['reshape_max_fb']:.1f} / {100 * R[l]['variants'][v]['reshape_max_land']:.1f} pts"
             if v in R[l]["variants"] else "–") for l in lv_) + " |")
    if "hs" in R:
        F = R["hs"]["fb_share"]
        lines += ["", "HS thrown fastball share by count (ruling 14):", "",
                  "| count | " + " | ".join(CK) + " |", "|---|" + "---|" * 12,
                  "| floor | " + " | ".join(f"{floor[c]:.3f}" for c in CK) + " |",
                  "| all pitches | " + " | ".join(f"{F[c]['all']:.3f}" for c in CK) + " |",
                  "| where the final call allowed a fastball | " + " | ".join(f"{F[c]['allowed']:.3f}" if F[c]["allowed"] is not None else "–" for c in CK) + " |",
                  "| share of pitches where allowed | " + " | ".join(f"{F[c]['allowed_share_of_pitches']:.3f}" if F[c]["allowed_share_of_pitches"] is not None else "–" for c in CK) + " |"]
    open(os.path.join(NEW, "mp_summary.md"), "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
