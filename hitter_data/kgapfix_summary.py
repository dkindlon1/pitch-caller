"""v1.3 K-gap fixes (Drew's Nov 23 prompt, tasks 1-2): each fix's own size and the fixed core's landing, from the seed-paired
sims (kgap_diag worker games; K / BB / HBP per PA, runs per game, reach two strikes, pitches per PA).

  fix alone   {kgap_diag}/sims/{level}__fix8 / fix9 / fix10 vs {kgap_diag}/sims/{level}__base (99b22fb as built), same seeds
  fixed core  {kgap_fixed}/sims/{level}__base (c3e21be: fixes 8-10 + the pitcher-side recalibration) vs the as-built base
              and vs the target; and the fixed core's own variants (trendoff, edgereal, velooff, cguard) vs its base

    python -m hitter_data.kgapfix_summary      # -> {kgap_fixed}/kgapfix_summary.json / .md
"""
import json
import math
import os

OLD = "C:/dev/pitchiq-data/kgap_diag"
NEW = "C:/dev/pitchiq-data/kgap_fixed"
LEVELS = ("mlb", "college_d1", "college_d2", "college_d3", "hs")
NAME = {"mlb": "MLB (control)", "college_d1": "D1", "college_d2": "D2", "college_d3": "D3", "hs": "HS"}
RV_KEY = {"mlb": "mlb_check", "college_d1": "college_d1", "college_d2": "college_d2", "college_d3": "college_d3", "hs": "hs"}


def load(root, level, variant):
    d = os.path.join(root, "sims", f"{level}__{variant}")
    out = {}
    if not os.path.isdir(d):
        return out
    for fn in os.listdir(d):
        if fn.startswith("game_") and fn.endswith(".json"):
            g = json.load(open(os.path.join(d, fn), encoding="utf-8"))
            out[g["seed"]] = g
    return out


def ratio(G, key, den="PA"):
    s = sorted(G)
    n = len(s)
    num, dd = [G[x][key] for x in s], [G[x][den] for x in s]
    R = sum(num) / sum(dd)
    md = sum(dd) / n
    v = sum((a - R * b) ** 2 for a, b in zip(num, dd)) / (n - 1)
    return R, math.sqrt(v / n) / md


def pdiff(ga, gb, key, den="PA"):
    seeds = sorted(set(ga) & set(gb))
    if len(seeds) < 3:
        return None
    na, da = [ga[s][key] for s in seeds], [ga[s][den] for s in seeds]
    nb, db = [gb[s][key] for s in seeds], [gb[s][den] for s in seeds]
    Ra, Rb = sum(na) / sum(da), sum(nb) / sum(db)
    ma, mb = sum(da) / len(seeds), sum(db) / len(seeds)
    z = [(y - Rb * x) / mb - (u - Ra * w) / ma for y, x, u, w in zip(nb, db, na, da)]
    m = sum(z) / len(z)
    v = sum((t - m) ** 2 for t in z) / (len(z) - 1)
    return Rb - Ra, math.sqrt(v / len(z)), len(seeds)


def rdiff(ga, gb):
    seeds = sorted(set(ga) & set(gb))
    if len(seeds) < 3:
        return None
    d = [gb[s]["runs"] - ga[s]["runs"] for s in seeds]
    m = sum(d) / len(d)
    return m, math.sqrt(sum((x - m) ** 2 for x in d) / (len(d) - 1) / len(d)), len(seeds)


def main():
    rv = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "college_run_values.json")))
    res = {"levels": {}}
    for lv in LEVELS:
        base = load(OLD, lv, "base")
        L = {"target": {k: rv[RV_KEY[lv]][k] for k in ("K", "BB", "HBP")}, "fix": {}, "fixed": {}, "fixed_variants": {}}
        if base:
            L["asbuilt"] = {k: ratio(base, k) for k in ("K", "BB", "HBP")}
        for fx in ("fix8", "fix9", "fix10"):
            g = load(OLD, lv, fx)
            if g and base:
                L["fix"][fx] = {k: pdiff(base, g, k) for k in ("K", "BB", "HBP")}
                L["fix"][fx]["runs"] = rdiff(base, g)
        fb = load(NEW, lv, "base")
        if fb:
            L["fixed"] = {k: ratio(fb, k) for k in ("K", "BB", "HBP")}
            L["fixed"]["reach2"] = ratio(fb, "reach2")
            L["fixed"]["ppa"] = ratio(fb, "pitches")
            L["fixed"]["runs"] = (sum(g["runs"] for g in fb.values()) / len(fb), None)
            L["fixed"]["games"] = len(fb)
            if base:
                L["fixed_vs_asbuilt"] = {k: pdiff(base, fb, k) for k in ("K", "BB", "HBP")}
                L["fixed_vs_asbuilt"]["runs"] = rdiff(base, fb)
            for v in ("trendoff", "edgereal", "velooff", "cguard", "landswap"):
                g = load(NEW, lv, v)
                if g:
                    L["fixed_variants"][v] = {k: pdiff(fb, g, k) for k in ("K", "BB", "HBP")}
        res["levels"][lv] = L
    os.makedirs(NEW, exist_ok=True)
    json.dump(res, open(os.path.join(NEW, "kgapfix_summary.json"), "w", encoding="utf-8"), indent=1)
    pt = lambda x: "–" if not x else f"{100 * x[0]:+.1f} ± {100 * x[1]:.1f}"
    lines = ["| K, points | " + " | ".join(NAME[l] for l in LEVELS) + " |", "|---|" + "---|" * len(LEVELS)]
    R = res["levels"]
    lines.append("| K target | " + " | ".join(f"{100 * R[l]['target']['K']:.1f}" for l in LEVELS) + " |")
    lines.append("| sims as built (99b22fb): K | " + " | ".join(f"{100 * R[l]['asbuilt']['K'][0]:.1f}" if "asbuilt" in R[l] else "–" for l in LEVELS) + " |")
    for fx, lab in (("fix8", "fix 8 alone (HS floor + table-on calibration)"), ("fix9", "fix 9 alone (centered hitters)"),
                    ("fix10", "fix 10 alone (weighted college count layers)")):
        lines.append(f"| {lab} | " + " | ".join(pt(R[l]["fix"].get(fx, {}).get("K")) for l in LEVELS) + " |")
    lines.append("| fixed core (all three + pitcher-side recal) − as built | " + " | ".join(pt(R[l].get("fixed_vs_asbuilt", {}).get("K")) for l in LEVELS) + " |")
    lines.append("| fixed core: K | " + " | ".join((f"{100 * R[l]['fixed']['K'][0]:.1f} ± {100 * R[l]['fixed']['K'][1]:.1f}" if R[l]["fixed"] else "–") for l in LEVELS) + " |")
    lines.append("| **fixed core: K gap to target** | " + " | ".join((f"**{100 * (R[l]['fixed']['K'][0] - R[l]['target']['K']):+.1f}**" if R[l]["fixed"] else "–") for l in LEVELS) + " |")
    lines.append("| fixed core: BB (target) | " + " | ".join((f"{100 * R[l]['fixed']['BB'][0]:.1f} ({100 * R[l]['target']['BB']:.1f})" if R[l]["fixed"] else "–") for l in LEVELS) + " |")
    lines.append("| fixed core: HBP (target) | " + " | ".join((f"{100 * R[l]['fixed']['HBP'][0]:.1f} ({100 * R[l]['target']['HBP']:.1f})" if R[l]["fixed"] else "–") for l in LEVELS) + " |")
    for v, lab in (("velooff", "fixed core: HS velocity table off"), ("trendoff", "fixed core: zone trend extension off"),
                   ("edgereal", "fixed core: edge called strike set to real"), ("cguard", "fixed core: college guard at Single-A's range (report only)")):
        lines.append(f"| {lab} | " + " | ".join(pt(R[l]["fixed_variants"].get(v, {}).get("K")) for l in LEVELS) + " |")
    lines += ["", "Runs per game, paired (fix − as built; fixed − as built):", ""]
    for l in LEVELS:
        parts = [f"{fx} {R[l]['fix'][fx]['runs'][0]:+.2f} ± {R[l]['fix'][fx]['runs'][1]:.2f}" for fx in ("fix8", "fix9", "fix10")
                 if fx in R[l]["fix"] and R[l]["fix"][fx].get("runs")]
        if R[l].get("fixed_vs_asbuilt", {}).get("runs"):
            r = R[l]["fixed_vs_asbuilt"]["runs"]
            parts.append(f"fixed {r[0]:+.2f} ± {r[1]:.2f}")
        lines.append(f"- {NAME[l]}: " + "; ".join(parts))
    open(os.path.join(NEW, "kgapfix_summary.md"), "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
