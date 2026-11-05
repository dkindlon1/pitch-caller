"""v0.9 Step 7: decision quality of two engines on the same games, in runs per game, paired by game.
regret_* columns: each call scored against the calling engine's own table (its own hitter sits and later-count values).
regret_w_* columns (TRUTH_TAB=world runs only): scored against one table solved in the world's model, the same for both
engines. exp = the engine's whole mix, pick = the call actually made, info = the engine's own best call.
Also prints the regret_w_pick by call (pitch class x spot) and by count, so the source of a difference is visible.
usage (repo root): python3 readthrough/step7_regret.py DIR_A DIR_B [--out results/step7/regret_A_vs_B.txt]"""
import csv, glob, math, os, sys
from collections import defaultdict

COLS = ["regret_exp", "regret_pick", "regret_info", "regret_w_exp", "regret_w_pick", "regret_w_info"]


def spot(r):
    q = r["quad"]
    return "inside" if q in ("up-in", "down-in") else q if q in ("middle", "chase") else "edge-away"


def game(fn):
    g, by_call, by_count, n = defaultdict(float), defaultdict(lambda: [0, 0.0]), defaultdict(lambda: [0, 0.0]), 0
    for r in csv.DictReader(open(fn)):
        if not r.get("quad"):
            continue
        n += 1
        g["runs"] += float(r["runs"] or 0)
        for c in COLS:
            if r.get(c) not in (None, ""):
                g[c] += float(r[c])
        w = float(r.get("regret_w_pick") or 0)
        for d, k in ((by_call, f"{r['kind']} {spot(r)}"), (by_count, r["count"])):
            d[k][0] += 1
            d[k][1] += w
    g["pitches"] = n
    return g, by_call, by_count


def paired(a, b):
    d = [y - x for x, y in zip(a, b)]
    m = sum(d) / len(d)
    se = math.sqrt(sum((x - m) ** 2 for x in d) / (len(d) - 1) / len(d)) if len(d) > 1 else float("nan")
    return sum(a) / len(a), sum(b) / len(b), m, se


def main():
    A, B = sys.argv[1], sys.argv[2]
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    ta, tb = os.path.basename(A.rstrip("/")), os.path.basename(B.rstrip("/"))
    names = sorted(set(os.listdir(A)) & set(os.listdir(B)))
    names = [n for n in names if n.endswith(".csv")]
    L = [f"{ta} vs {tb}: {len(names)} paired games; runs per game, B minus A, SE over games"]
    GA = {n: game(os.path.join(A, n)) for n in names}
    GB = {n: game(os.path.join(B, n)) for n in names}
    for lvl in ("", "hs", "college_d3", "college_d1"):
        ns = [n for n in names if n.startswith(lvl)] if lvl else names
        if not ns:
            continue
        L.append(f"\n[{lvl or 'all'}] {len(ns)} games")
        L.append(f"  {'':16s}{ta[:17]:>18s}{tb[:17]:>18s}{'diff':>9s}{'SE':>8s}")
        for c in ["runs", "pitches"] + COLS:
            if not any(c in GA[n][0] for n in ns) and c not in ("runs", "pitches"):
                continue
            a, b, m, se = paired([GA[n][0][c] for n in ns], [GB[n][0][c] for n in ns])
            L.append(f"  {c:16s}{a:18.3f}{b:18.3f}{m:+9.3f}{se:8.3f}")
    if any("regret_w_pick" in GA[n][0] for n in names):
        for title, idx in (("call", 1), ("count", 2)):
            agg = {}
            for side, G in (("a", GA), ("b", GB)):
                for n in names:
                    for k, (c, v) in G[n][idx].items():
                        e = agg.setdefault(k, {"a": [0, 0.0], "b": [0, 0.0]})
                        e[side][0] += c
                        e[side][1] += v
            L.append(f"\nregret_w_pick by {title}, totals over all games (pitches, runs): {ta} | {tb} | B minus A")
            for k, e in sorted(agg.items(), key=lambda kv: -(kv[1]["b"][1] - kv[1]["a"][1])):
                L.append(f"  {k:16s}{e['a'][0]:6d}{e['a'][1]:8.2f} |{e['b'][0]:6d}{e['b'][1]:8.2f} |{e['b'][1] - e['a'][1]:+8.2f}")
    txt = "\n".join(L) + "\n"
    print(txt)
    if out:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, "w").write(txt)


if __name__ == "__main__":
    main()
