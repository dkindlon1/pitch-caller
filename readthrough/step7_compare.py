"""v0.9 Step 7: v0.9 vs v0.8 on paired seeds (same lineup, same off-days, same seed per game). Per game: runs allowed,
walks + HBP, strikeouts, pitches per PA, and the call mix (changeup share, inside share, chase share at two strikes,
fastball share). Paired differences with a standard error over games.
usage (repo root): python3 readthrough/step7_compare.py runs/readthrough/v08 runs/readthrough/v09 -> results/step7/compare.txt/.json"""
import csv, glob, json, math, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def game_stats(fn):
    st = defaultdict(float)
    for r in csv.DictReader(open(fn)):
        if not r.get("quad"):
            continue
        st["pitches"] += 1
        st["runs"] += float(r["runs"] or 0)
        d = r["detail"] or ""
        st["bb"] += ("WALK" in d) + (r["result"] == "hbp")
        st["k"] += "STRIKEOUT" in d
        st["pa"] += ("WALK" in d) or ("STRIKEOUT" in d) or r["result"] == "hbp" or r["result"] in ("weak", "solid", "hard")
        st["ch"] += r["kind"] == "CH"
        st["os"] += r["kind"] in ("SL", "CB", "CH")
        st["fb"] += r["kind"] in ("FB", "SI", "FC")
        st["inside"] += r["quad"] in ("up-in", "down-in")
        st["middle"] += r["quad"] == "middle"
        if r["count"].endswith("-2"):
            st["two_k"] += 1
            st["two_k_chase"] += r["quad"] == "chase"
        st["hard"] += r["result"] == "hard"
        st["hr"] += "HOME RUN" in d.upper()
    return st


def main():
    a, b = sys.argv[1], sys.argv[2]
    ta, tb = os.path.basename(os.path.normpath(a)), os.path.basename(os.path.normpath(b))
    A = {os.path.basename(f): game_stats(f) for f in glob.glob(os.path.join(a, "*.csv"))}
    B = {os.path.basename(f): game_stats(f) for f in glob.glob(os.path.join(b, "*.csv"))}
    keys = sorted(set(A) & set(B))
    out, lines = {}, [f"{ta} vs {tb}: {len(keys)} paired games (same file name = same level, staff and seed)"]
    metrics = [("runs allowed per game", lambda s: s["runs"]), ("walks + HBP per PA", lambda s: s["bb"] / s["pa"]),
               ("strikeouts per PA", lambda s: s["k"] / s["pa"]), ("pitches per PA", lambda s: s["pitches"] / s["pa"]),
               ("hard contact per PA", lambda s: s["hard"] / s["pa"]),
               ("fastball share", lambda s: s["fb"] / s["pitches"]), ("changeup share", lambda s: s["ch"] / s["pitches"]),
               ("inside share", lambda s: s["inside"] / s["pitches"]), ("middle share", lambda s: s["middle"] / s["pitches"]),
               ("chase share with two strikes", lambda s: s["two_k_chase"] / max(1, s["two_k"]))]
    groups = {"all": keys}
    for lv in ("hs", "college_d3", "college_d1"):
        groups[lv] = [k for k in keys if k.startswith(lv + "_")]
    for g, ks in groups.items():
        lines.append(f"\n[{g}] {len(ks)} games")
        lines.append(f"  {'':30s} {ta:>9s} {tb:>9s} {'diff':>9s} {'SE':>8s}")
        for name, f in metrics:
            xa = [f(A[k]) for k in ks]; xb = [f(B[k]) for k in ks]
            d = [y - x for x, y in zip(xa, xb)]
            m = sum(d) / len(d)
            se = math.sqrt(sum((v - m) ** 2 for v in d) / (len(d) - 1) / len(d)) if len(d) > 1 else float("nan")
            ma, mb = sum(xa) / len(xa), sum(xb) / len(xb)
            out[f"{g}|{name}"] = dict(a=ma, b=mb, diff=m, se=se, n=len(d))
            pct = "pitches" not in name and "runs" not in name
            fmt = (lambda v: f"{v:9.1%}") if pct else (lambda v: f"{v:9.2f}")
            fse = (lambda v: f"{v:8.1%}") if pct else (lambda v: f"{v:8.2f}")
            lines.append(f"  {name:30s} {fmt(ma)} {fmt(mb)} {fmt(m)} {fse(se)}")
    os.makedirs(os.path.join(ROOT, "results", "step7"), exist_ok=True)
    open(os.path.join(ROOT, "results", "step7", "compare.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(out, open(os.path.join(ROOT, "results", "step7", "compare.json"), "w"), indent=1)
    print("\n".join(lines))


if __name__ == "__main__":
    main()
