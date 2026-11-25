"""v1.3 final archive, task 3: the full-vs-rest check per level (Nov 22 ruling 1: K, BB and HBP per PA of the full games
within 1 point of the level's other games), pooled from reports/representativeness.csv (per level-season full - rest
with game-clustered SEs) over the fit seasons (<= 2025) with the count fits' recency weights (half-life 2 seasons back from
2025) times the season's full games; SE = sqrt(sum w^2 SE^2) / sum w (seasons independent).

    python -m hitter_data.fullrest_summary [CSV ...]     # default: {DATA}/college/reports/representativeness.csv
"""
import csv
import math
import os
import sys

from . import DATA, assert_not_heldout


def pooled(path, first=2015, last=2025, hl=2.0):
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    out = {}
    for lv in ("D1", "D2", "D3"):
        res = {}
        for st in ("K%", "BB%", "HBP%"):
            sw = s = v = 0.0
            for r in rows:
                if r["level"] != lv or not r[f"{st} full-rest"]:
                    continue
                y = int(r["season"])
                if y < first or y > last:
                    continue
                assert_not_heldout(y)
                w = 0.5 ** ((last - y) / hl) * int(r["full_games"])
                sw += w
                s += w * float(r[f"{st} full-rest"])
                v += (w * float(r[f"{st} diff SE"])) ** 2
            res[st] = (100 * s / sw, 100 * math.sqrt(v) / sw)
        out[lv] = res
    return out


def main(argv):
    paths = argv or [os.path.join(DATA, "college", "reports", "representativeness.csv")]
    for p in paths:
        print(p)
        for lv, r in pooled(p).items():
            ok = all(abs(d) <= 1.0 for d, _ in r.values())
            print(f"  {lv}: " + ", ".join(f"{k[:-1]} {d:+.2f} ({se:.2f})" for k, (d, se) in r.items())
                  + f"  -> {'PASS' if ok else 'FAIL'} (each within 1 point)")


if __name__ == "__main__":
    main(sys.argv[1:])
