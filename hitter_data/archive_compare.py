"""v1.3 Part 4: frozen archive vs final archive, sim for sim. The engine-called (base) and reference-staff (refstaff) games
of the two runs share seeds (2001..), staff and hitters, so each level's change is paired by seed.

    python -m hitter_data.archive_compare [FROZEN_DIR FINAL_DIR]   # default C:/dev/pitchiq-data/edge16, {DATA}/edge
"""
import os
import sys

from . import DATA
from .kgapfix_summary import load, ratio, pdiff, rdiff

LEVELS = ("mlb", "college_d1", "college_d2", "college_d3", "hs")
NAME = {"mlb": "MLB", "college_d1": "D1", "college_d2": "D2", "college_d3": "D3", "hs": "HS"}


def main(argv):
    fz = argv[0] if argv else "C:/dev/pitchiq-data/edge16"
    fn = argv[1] if len(argv) > 1 else os.path.join(DATA, "edge")
    print("| final − frozen, paired by seed | " + " | ".join(NAME[l] for l in LEVELS) + " |")
    print("|---|" + "---|" * len(LEVELS))
    for v in ("base", "refstaff"):
        A = {l: load(fz, l, v) for l in LEVELS}
        B = {l: load(fn, l, v) for l in LEVELS}
        for k in ("K", "BB", "HBP"):
            cells = []
            for l in LEVELS:
                d = pdiff(A[l], B[l], k)
                cells.append(f"{100 * d[0]:+.2f} ± {100 * d[1]:.2f}" if d else "–")
            print(f"| {v}: {k} (points) | " + " | ".join(cells) + " |")
        cells = []
        for l in LEVELS:
            d = rdiff(A[l], B[l])
            cells.append(f"{d[0]:+.2f} ± {d[1]:.2f}" if d else "–")
        print(f"| {v}: runs / game | " + " | ".join(cells) + " |")


if __name__ == "__main__":
    main(sys.argv[1:])
