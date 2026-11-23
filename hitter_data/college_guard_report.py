"""v1.3 (Drew's Nov 23 ruling 8, college part): REPORT ONLY, nothing wired. What the HS fastball-share guard would change
at the college levels if Single-A's real range were the floor.

In this process only, levels.college_d{1,2,3}.fb_floor = Single-A's 10th percentile of pitcher-season fastball share by
count (Statcast 2021-25, pitcher-seasons with >= 25 pitches in that count; fits/hs/college_fb_guard_report.json), and
calib.evaluate (the exact count chain of the calibration: the engine's own calls against the centered hidden hitters,
the calibration staff) is run with and without it. Reports K / BB / HBP and the calls' fastball share by count. AAA's
range is shown beside it. The engine file is never written.

    python -m hitter_data.college_guard_report
"""
import json
import os
import sys

from . import DATA

CK = [f"{b}-{k}" for k in range(3) for b in range(4)]


def fb_share(level, calib, e):
    """fastball share of the calibration staff's calls by count (staff-weighted, both sides)"""
    out = {}
    staff, sw = calib.staff_for(level)
    for ck in CK:
        b, k = int(ck[0]), int(ck[2])
        num = den = 0.0
        for who, w in zip(staff, sw):
            for same in (True, False):
                s = e.Situation(b, k, 0, (False, False, False), level=level, same_side=same, pitch_count=40, batters_faced=9)
                from dataclasses import replace
                tab = e.solve_table(who["arsenal"], replace(s, balls=0, strikes=0, last=None))
                import random
                _, dist, _, _ = e.call_v08(who["arsenal"], s, rng=random.Random(0), tab=tab)
                num += w * sum(pr for pr, _, p, q in dist if e.is_fastball(p.kind))
                den += w
        out[ck] = num / den
    return out


def main():
    sys.path.insert(0, os.getcwd())
    import engine as e
    import calib
    rep = json.load(open(os.path.join(DATA, "fits", "hs", "college_fb_guard_report.json"), encoding="utf-8"))
    floorA = rep["real"]["A"]["p10_min25"]
    res = {"floor_singleA_p10": floorA, "floor_AAA_p10": rep["real"]["AAA"]["p10_min25"], "levels": {}}
    for lv in ("college_d1", "college_d2", "college_d3"):
        r0 = calib.evaluate(lv)
        f0 = fb_share(lv, calib, e)
        e._CT[lv]["fb_floor"] = dict(floorA)
        try:
            r1 = calib.evaluate(lv)
            f1 = fb_share(lv, calib, e)
        finally:
            e._CT[lv].pop("fb_floor")
        res["levels"][lv] = {"without": {k: r0[k] for k in ("K", "BB", "HBP")}, "with": {k: r1[k] for k in ("K", "BB", "HBP")},
                             "fb_without": f0, "fb_with": f1,
                             "counts_below_floor": [ck for ck in CK if f0[ck] < floorA[ck] - 1e-9]}
        print(lv, "K %.2f -> %.2f  BB %.2f -> %.2f" % (100 * r0["K"], 100 * r1["K"], 100 * r0["BB"], 100 * r1["BB"]),
              " ".join(f"{ck}:{f0[ck]:.2f}/{floorA[ck]:.2f}" for ck in CK), flush=True)
    with open(os.path.join(DATA, "fits", "hs", "college_guard_effect.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(res, f, indent=1)


if __name__ == "__main__":
    main()
