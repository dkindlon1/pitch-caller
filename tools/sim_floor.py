"""v1.0 Phase 1.4: the simulator floor. Compares two run folders game by game -- the v0.9 baseline from Phase 0d and
v1.0 run the same way -- and prints the paired mean difference and SE for the measures v1.0 must not sink.

usage (repo root): python3 tools/sim_floor.py DIR_A DIR_B [--out results/sim_floor_A_vs_B.txt]
  e.g. python3 tools/sim_floor.py runs/yardstick/v09 runs/yardstick/v10

Pairing is by file name, so both folders must be the same grid and seeds. The paired SE math is imported from
readthrough/step7_regret.py rather than copied, so the regret numbers here and in Step 7 are computed identically.

A plate appearance is a row whose count column is 0-0 (every PA's first pitch), which gives the per-batter rates.
The run budget Drew set for variety is 0.25 runs per game, so the `runs` row is the one that spends it.
"""
import argparse, csv, glob, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0] = [os.path.join(ROOT, "readthrough"), ROOT]
from step7_regret import paired                                    # noqa: E402  the same paired mean/SE as Step 7

# label -> (per-game value, "higher is better"?). None = no direction, just report.
MEASURES = [
    ("regret_w_exp", "runs of regret per game, world table"),
    ("regret_w_pick", "runs of regret per game, the call made"),
    ("runs", "runs allowed per game"),
    ("pitches", "pitches per game"),
    ("pa", "batters faced per game"),
    ("walks", "walks per game"),
    ("strikeouts", "strikeouts per game"),
    ("hbp", "hit by pitch per game"),
    ("wild_pitches", "wild pitches per game"),
    ("bb_rate", "walk rate per batter"),
    ("k_rate", "strikeout rate per batter"),
    ("hbp_rate", "hit-by-pitch rate per batter"),
    ("wp_rate", "wild pitches per batter"),
    ("middle_share", "share of calls to the middle"),
    ("inside_share", "share of calls inside"),
]


def game(fn):
    g = defaultdict(float)
    with open(fn, newline="") as fh:
        rows = [r for r in csv.DictReader(fh) if r.get("quad")]
    pa = sum(1 for r in rows if r["count"] == "0-0")
    g["pitches"] = len(rows)
    g["pa"] = pa
    for r in rows:
        g["runs"] += float(r["runs"] or 0)
        for c in ("regret_w_exp", "regret_w_pick"):
            if r.get(c) not in (None, ""):
                g[c] += float(r[c])
        d = r["detail"]
        g["walks"] += "WALK" in d
        g["strikeouts"] += "STRIKEOUT" in d
        g["hbp"] += r["result"] == "hbp"
        g["wild_pitches"] += "wild pitch" in d
        g["middle_share"] += r["quad"] == "middle"
        g["inside_share"] += r["quad"] in ("up-in", "down-in")
    for k in ("middle_share", "inside_share"):
        g[k] = g[k] / len(rows) if rows else 0.0
    for k, src in (("bb_rate", "walks"), ("k_rate", "strikeouts"), ("hbp_rate", "hbp"), ("wp_rate", "wild_pitches")):
        g[k] = g[src] / pa if pa else 0.0
    return g


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir_a")
    ap.add_argument("dir_b")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    A, B = a.dir_a, a.dir_b
    ta, tb = os.path.basename(A.rstrip("/\\")), os.path.basename(B.rstrip("/\\"))
    names = sorted(n for n in set(os.listdir(A)) & set(os.listdir(B)) if n.endswith(".csv"))
    if not names:
        sys.exit(f"no game files common to {A} and {B}")
    only_a = sorted(n for n in set(os.listdir(A)) - set(os.listdir(B)) if n.endswith(".csv"))
    only_b = sorted(n for n in set(os.listdir(B)) - set(os.listdir(A)) if n.endswith(".csv"))
    GA = {n: game(os.path.join(A, n)) for n in names}
    GB = {n: game(os.path.join(B, n)) for n in names}
    L = [f"{ta} vs {tb}: {len(names)} paired games; B minus A, SE over games"]
    if only_a or only_b:
        L.append(f"  (ignored: {len(only_a)} only in {ta}, {len(only_b)} only in {tb})")
    # explicit prefixes, as step7_regret.py uses: splitting on "_" would merge college_d1 and college_d3
    levels = [lv for lv in ("hs", "college_d3", "college_d1") if any(n.startswith(lv) for n in names)]
    for lvl in [""] + (levels if len(levels) > 1 else []):
        ns = [n for n in names if n.startswith(lvl)] if lvl else names
        if not ns:
            continue
        L.append(f"\n[{lvl or 'all'}] {len(ns)} games")
        L.append(f"  {'':16s}{ta[:17]:>18s}{tb[:17]:>18s}{'diff':>10s}{'SE':>9s}{'':>5s}")
        for key, what in MEASURES:
            va, vb, m, se = paired([GA[n][key] for n in ns], [GB[n][key] for n in ns])
            flag = ""
            if se == se and se > 0:                      # not NaN
                if abs(m) > 2 * se:
                    flag = "  *"                          # outside 2 SE: a real move, not noise
            fmt = ".4f" if key.endswith(("_rate", "_share")) else ".3f"
            L.append(f"  {key:16s}{va:18{fmt}}{vb:18{fmt}}{m:+10{fmt}}{se:9{fmt}}{flag}")
    L += ["", "* = the paired difference is more than 2 SE from zero.",
          "Drew's variety budget is 0.25 runs per game, measured on the `runs` row."]
    txt = "\n".join(L) + "\n"
    print(txt)
    if a.out:
        os.makedirs(os.path.dirname(a.out), exist_ok=True)
        open(a.out, "w", newline="\n", encoding="utf-8").write(txt)
        print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
