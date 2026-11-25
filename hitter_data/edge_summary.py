"""v1.3 Part 3 (Drew's Nov 25 rulings 16-17): the calling edge judged by runs, against a paired reference staff.

Reads the kgap_diag worker games of {EDGE16}/sims/{level}__base (the engine calling, ruling 16 built in) and
{level}__refstaff (the same staff, hitters and seeds throwing the level's reference-world mix: kgap_diag.ref_mix) and
reports per level:

  K / BB / HBP per PA and runs per game     each world with its game-clustered SE, and engine - reference paired by seed
  ruling 17's runs test                     engine runs per game not higher than the reference staff's
  the +1.5 K flag (kept)                    engine K - the chain-definition target (pa_targets_v13.json)
  where the edge sits                       the count chain on the engines' expected per-count rates (field P): the
                                            engine's rates at one count put to the reference staff's, the K and BB that
                                            moves (one count at a time), and the per-count swing / whiff | swing /
                                            called strike | take beside each other
  zone rate (ruling 19, reported only)      share of pitches in the rulebook zone (landing x engine.ZONE_IN) vs the
                                            reference-world command target (command_targets_v13.json)
  HS (ruling 16)                            thrown fastball share by count vs the floor, and the paired change vs Part 2's
                                            HS engine sims (ruling 14 build, {KGAP_MP}/sims/hs__base, same seeds)

    python -m hitter_data.edge_summary     # -> {EDGE16}/edge_summary.json / .md
"""
import json
import os
import sys

from .kgapfix_summary import load, ratio, pdiff, rdiff
from .kgap_diag import count_p6, chain_from, rates_from_p6, CK
from .mp_summary import fb_share

EDGE16 = os.environ.get("EDGE16", "C:/dev/pitchiq-data/edge16")
MP = os.environ.get("KGAP_MP", "C:/dev/pitchiq-data/kgap_mp")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVELS = ("mlb", "college_d1", "college_d2", "college_d3", "hs")
NAME = {"mlb": "MLB (control)", "college_d1": "D1", "college_d2": "D2", "college_d3": "D3", "hs": "HS"}
K_FLAG = 0.015


def zone_rate(G, zin):
    n = sum(g["counts"][ck]["n"] for g in G.values() for ck in g["counts"])
    z = sum(g["counts"][ck]["land"][c][i] * zin[b]
            for g in G.values() for ck in g["counts"] for c in ("FB", "OS") for i, b in enumerate(("heart", "edge", "off", "noncomp")))
    return z / n


def by_count(Pe, Pr):
    """one count at a time: the engine's expected rates at that count put to the reference staff's -> K / BB change of the
    chain (positive = that count adds to the engine's edge)"""
    ce = chain_from(Pe)
    out = {}
    for ck in CK:
        p = dict(Pe)
        p[ck] = Pr[ck]
        c = chain_from(p)
        re_, rr = rates_from_p6(Pe[ck]), rates_from_p6(Pr[ck])
        out[ck] = dict(dK=ce["K"] - c["K"], dBB=ce["BB"] - c["BB"],
                       eng={k: re_[k] for k in ("swing", "whiff_sw", "foul_ct", "cs_take")},
                       ref={k: rr[k] for k in ("swing", "whiff_sw", "foul_ct", "cs_take")})
    return ce, chain_from(Pr), out


def main():
    sys.path.insert(0, ROOT)
    import engine as e
    tg = json.load(open(os.path.join(ROOT, "pa_targets_v13.json"), encoding="utf-8"))["levels"]
    cmd = json.load(open(os.path.join(ROOT, "command_targets_v13.json"), encoding="utf-8"))["levels"]
    floor = json.load(open(os.path.join(ROOT, "data_tables", "count_v13core.json"), encoding="utf-8"))["levels"]["hs"]["fb_floor"]
    res = {"levels": {}}
    for lv in LEVELS:
        E, R = load(EDGE16, lv, "base"), load(EDGE16, lv, "refstaff")
        if not E:
            continue
        L = {"games": len(E), "ref_games": len(R)}
        for k in ("K", "BB", "HBP"):
            L[k] = dict(eng=ratio(E, k), ref=ratio(R, k) if R else None, target=tg[lv][k],
                        diff=pdiff(R, E, k) if R else None)
        n = len(E)
        rm = sum(g["runs"] for g in E.values()) / n
        L["runs"] = dict(eng=(rm, (sum((g["runs"] - rm) ** 2 for g in E.values()) / (n - 1) / n) ** 0.5))
        if R:
            m = sum(g["runs"] for g in R.values()) / len(R)
            L["runs"]["ref"] = (m, (sum((g["runs"] - m) ** 2 for g in R.values()) / (len(R) - 1) / len(R)) ** 0.5)
            L["runs"]["diff"] = rdiff(R, E)
            L["runs_not_higher"] = L["runs"]["diff"][0] <= 0
        L["k_edge_vs_target"] = L["K"]["eng"][0] - tg[lv]["K"]
        L["k_flag"] = L["k_edge_vs_target"] > K_FLAG
        L["zone"] = dict(eng=zone_rate(E, e.ZONE_IN), ref=zone_rate(R, e.ZONE_IN) if R else None, target=cmd[lv]["zone"])
        L["zone"]["gap"] = L["zone"]["eng"] - L["zone"]["target"]
        if R:
            Pe, Pr = count_p6(list(E.values()), "P"), count_p6(list(R.values()), "P")
            ce, cr, bc = by_count(Pe, Pr)
            L["chain"] = dict(eng={k: ce[k] for k in ("K", "BB", "HBP")}, ref={k: cr[k] for k in ("K", "BB", "HBP")})
            L["by_count"] = bc
            L["two_strike_share_of_K_edge"] = sum(bc[ck]["dK"] for ck in CK if ck.endswith("-2"))
        if lv == "hs":
            L["fb_share"] = fb_share(E)
            L["floor"] = floor
            P2 = load(MP, "hs", "base")
            if P2:
                L["vs_part2"] = {k: pdiff(P2, E, k) for k in ("K", "BB", "HBP")}
                L["vs_part2"]["runs"] = rdiff(P2, E)
                L["part2_fb_share"] = fb_share(P2)
        res["levels"][lv] = L
    json.dump(res, open(os.path.join(EDGE16, "edge_summary.json"), "w", encoding="utf-8"), indent=1)

    RR = res["levels"]
    lv_ = [l for l in LEVELS if l in RR]
    f1 = lambda x: f"{100 * x[0]:.1f} ± {100 * x[1]:.1f}"
    fd = lambda x: f"{100 * x[0]:+.1f} ± {100 * x[1]:.1f}" if x else "–"
    lines = ["| per level | " + " | ".join(NAME[l] for l in lv_) + " |", "|---|" + "---|" * len(lv_),
             "| games (engine / reference) | " + " | ".join(f"{RR[l]['games']} / {RR[l]['ref_games']}" for l in lv_) + " |"]
    for k in ("K", "BB", "HBP"):
        lines.append(f"| {k} %: engine | " + " | ".join(f1(RR[l][k]["eng"]) for l in lv_) + " |")
        lines.append(f"| {k} %: reference staff | " + " | ".join(f1(RR[l][k]["ref"]) if RR[l][k]["ref"] else "–" for l in lv_) + " |")
        lines.append(f"| {k}: **engine − reference** (paired) | " + " | ".join(f"**{fd(RR[l][k]['diff'])}**" for l in lv_) + " |")
    lines.append("| runs / game: engine | " + " | ".join(f"{RR[l]['runs']['eng'][0]:.2f} ± {RR[l]['runs']['eng'][1]:.2f}" for l in lv_) + " |")
    lines.append("| runs / game: reference staff | " + " | ".join(
        f"{RR[l]['runs']['ref'][0]:.2f} ± {RR[l]['runs']['ref'][1]:.2f}" if "ref" in RR[l]["runs"] else "–" for l in lv_) + " |")
    lines.append("| runs: **engine − reference** (paired) | " + " | ".join(
        f"**{RR[l]['runs']['diff'][0]:+.2f} ± {RR[l]['runs']['diff'][1]:.2f}**" if "diff" in RR[l]["runs"] else "–" for l in lv_) + " |")
    lines.append("| ruling 17 runs test (engine not higher) | " + " | ".join(
        ("pass" if RR[l]["runs_not_higher"] else "**higher**") if "runs_not_higher" in RR[l] else "–" for l in lv_) + " |")
    lines.append("| K − target (the +1.5 flag) | " + " | ".join(
        f"{100 * RR[l]['k_edge_vs_target']:+.1f}" + (" **flag**" if RR[l]["k_flag"] else "") for l in lv_) + " |")
    lines.append("| two-strike counts' share of the K edge vs reference (chain) | " + " | ".join(
        f"{100 * RR[l]['two_strike_share_of_K_edge']:+.1f} of {100 * (RR[l]['chain']['eng']['K'] - RR[l]['chain']['ref']['K']):+.1f}"
        if "chain" in RR[l] else "–" for l in lv_) + " |")
    lines.append("| zone rate: engine / reference sims / command target (gap) | " + " | ".join(
        f"{100 * RR[l]['zone']['eng']:.1f} / {100 * RR[l]['zone']['ref']:.1f} / {100 * RR[l]['zone']['target']:.1f} ({100 * RR[l]['zone']['gap']:+.1f})"
        if RR[l]["zone"]["ref"] is not None else "–" for l in lv_) + " |")
    for l in lv_:
        if "by_count" not in RR[l]:
            continue
        bc = RR[l]["by_count"]
        lines += ["", f"{NAME[l]}: by count, engine rates put to the reference staff's one count at a time (chain points; "
                  "rates engine / reference)", "", "| count | ΔK | ΔBB | swing | whiff / swing | foul / contact | called strike / take |",
                  "|---|---|---|---|---|---|---|"]
        for ck in sorted(CK, key=lambda c: -abs(bc[c]["dK"]) - abs(bc[c]["dBB"])):
            b = bc[ck]
            lines.append(f"| {ck} | {100 * b['dK']:+.2f} | {100 * b['dBB']:+.2f} | " + " | ".join(
                f"{b['eng'][k]:.3f} / {b['ref'][k]:.3f}" for k in ("swing", "whiff_sw", "foul_ct", "cs_take")) + " |")
    if "hs" in RR:
        F, F2 = RR["hs"]["fb_share"], RR["hs"].get("part2_fb_share")
        lines += ["", "HS thrown fastball share by count (ruling 16):", "", "| count | " + " | ".join(CK) + " |", "|---|" + "---|" * 12,
                  "| floor | " + " | ".join(f"{floor[c]:.3f}" for c in CK) + " |",
                  "| thrown, all pitches (ruling 16) | " + " | ".join(f"{F[c]['all']:.3f}" for c in CK) + " |",
                  "| the final call's fastball share (where > 0) | " + " | ".join(
                      f"{F[c]['call_fb_where_allowed']:.3f}" if F[c]["call_fb_where_allowed"] is not None else "–" for c in CK) + " |",
                  "| share of pitches whose call allowed a fastball | " + " | ".join(
                      f"{F[c]['allowed_share_of_pitches']:.3f}" if F[c]["allowed_share_of_pitches"] is not None else "–" for c in CK) + " |"]
        if F2:
            lines.append("| thrown, all pitches (Part 2, ruling 14) | " + " | ".join(f"{F2[c]['all']:.3f}" for c in CK) + " |")
        v = RR["hs"].get("vs_part2")
        if v:
            lines += ["", "HS vs Part 2 (ruling 14 build), paired: " + ", ".join(f"{k} {fd(v[k])}" for k in ("K", "BB", "HBP"))
                      + f", runs {v['runs'][0]:+.2f} ± {v['runs'][1]:.2f}"]
    open(os.path.join(EDGE16, "edge_summary.md"), "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
