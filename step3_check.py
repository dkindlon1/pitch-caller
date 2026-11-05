"""v0.8 step 3 acceptance: with inplay_typed on, the engine reproduces each level's K, BB, HBP and hit rates.
Exact plate-appearance play-out from calib.evaluate (engine's own calls vs the simulator's hitters), flag off and on.
Hits with the flag on use each contact quality's typed outcome tables at the reference mix (inplay_fit.py)."""
import engine as e
import calib
from inplay_fit import ref_type_mix, TYPES

TARGET = {"college_d1": "college_d1", "college_d3": "college_d3", "mlb": "mlb_check"}
for level in ("college_d3", "college_d1", "mlb"):
    row = {}
    for flag in (False, True):
        e.set_flags(inplay_typed=flag)
        m = calib.evaluate(level)
        raw = dict(calib._LAST_RAW)
        if flag:
            h = sum(raw[c] * sum(ref_type_mix(c)[t] * sum(e.OUT_TABLE[level][c][t][1:5]) for t in TYPES) for c in ("weak", "solid", "hard"))
        else:
            h = m["H"]
        row[flag] = (m["K"], m["BB"], m["HBP"], h)
    real = calib.RV[TARGET[level]]
    rh = real["1B"] + real["2B"] + real["3B"] + real["HR"]
    d = [abs(a - b) for a, b in zip(row[True], row[False])]
    print(f"{level:11} off K {row[False][0]:.3f} BB {row[False][1]:.3f} HBP {row[False][2]:.3f} H {row[False][3]:.3f} | "
          f"on K {row[True][0]:.3f} BB {row[True][1]:.3f} HBP {row[True][2]:.3f} H {row[True][3]:.3f} | "
          f"real K {real['K']:.3f} BB {real['BB']:.3f} HBP {real['HBP']:.3f} H {rh:.3f} | max change {max(d):.4f}")
e.set_flags(**e.FLAGS_V07)
