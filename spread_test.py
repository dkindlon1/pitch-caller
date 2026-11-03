"""
v0.7 spread check: the engine must reproduce, at each calibrated level,
  1. the real league averages (strikeout, walk, HBP per plate appearance) with the calibration staff, and
  2. the real spread between pitchers: one grade point of command and of stuff together give the true-talent SD of
     walk+HBP and strikeout rates measured from 2026 pitcher lines (talent_spread.py).
Usage: python3 spread_test.py      (about 2 minutes)
"""
import json, sys
import calib, fit_spread

TOL_AVG, TOL_SD = 0.006, 0.10      # averages within 0.6 points; spreads within 10% of the real SD
fails = 0
for lvl in ("college_d3", "college_d1", "hs"):
    r = calib.evaluate(lvl)
    tg = calib.RV[lvl]
    J, sw, sk, corr = fit_spread.implied(lvl)
    t = fit_spread.TARGET[lvl]
    checks = [
        (abs(r["K"] - tg["K"]) < TOL_AVG, f"strikeouts {r['K']:.3f} vs real {tg['K']:.3f}"),
        (abs(r["BB"] - tg["BB"]) < TOL_AVG, f"walks {r['BB']:.3f} vs real {tg['BB']:.3f}"),
        (abs(r["HBP"] - tg["HBP"]) < TOL_AVG, f"HBP {r['HBP']:.3f} vs real {tg['HBP']:.3f}"),
        (abs(sw / t["walk_hbp"]["true_sd"] - 1) < TOL_SD, f"walk+HBP spread {sw:.4f} vs real {t['walk_hbp']['true_sd']:.4f}"),
        (abs(sk / t["k"]["true_sd"] - 1) < TOL_SD, f"strikeout spread {sk:.4f} vs real {t['k']['true_sd']:.4f}"),
    ]
    print(lvl + (" (high school spread is estimated)" if t.get("estimated") else ""))
    for ok, msg in checks:
        print(("  ok   " if ok else "  FAIL ") + msg)
        fails += 0 if ok else 1
    print(f"  (walk/strikeout correlation {corr:+.2f}, real {t['corr_walk_k']:+.2f}: an open question, not checked, spec 17)")
print(f"\n{fails} check(s) failed" if fails else "\nall spread checks passed")
sys.exit(1 if fails else 0)
