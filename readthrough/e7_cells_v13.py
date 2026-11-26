"""Part 11 (ruling 41): dump the call menus of the e7_blast_v13.py cells (HS / travel x (10 robustness arsenals + 6 HS
data-staff pitchers) x 12 counts x same / opposite side, default situation, no history) in THIS engine, plus, for the
data-staff pitchers at 2-2 and 3-2 on both sides, the no-history top call's move at n = 1..6 repeats (usage_by_call; the
robustness grid's measure, which the grid itself only takes same side). Run in each snapshot and compare.
    python readthrough/e7_cells_v13.py --out PATH"""
import json
import os
import sys
from dataclasses import replace

a = sys.argv[1:]
OUT = a[a.index("--out") + 1]
sys.argv = [sys.argv[0], "--suite", "v12"]
sys.path.insert(0, os.path.join(os.getcwd(), "readthrough"))
sys.path.insert(0, os.getcwd())
import scenarios as R  # noqa: E402
import simulate as sim  # noqa: E402
e = R.e
DOC, _ = R.load()
ARS = ["cut_ch", "deadzone", "fd", "four", "four_cut", "hs_two", "ride126", "sink_sweep", "three", "two"]
STAFF = sim.hs_data_staff()


def build(lv, ak, b, k, same, usage=None):
    if ak.startswith("staff"):
        ars = [replace(x) for x in STAFF[int(ak[5:])]["arsenal"]]
        s = e.Situation(b, k, 1, (False, False, False), level=lv, same_side=same, pitch_count=40, inning=3, margin=0,
                        batters_faced=10)
        ex = None
    else:
        inp = {"level": lv, "arsenal": ak, "balls": b, "strikes": k, "batters_faced": 19, "pitch_count": 70, "same_side": same}
        ars, s, ex = R.build(DOC, {"inputs": inp, "pitch_edits": {}, "exclude": [], "matchup": []})
    if usage:
        s = replace(s, usage_by_call=usage)
    return ars, s, ex


def menu(*c, usage=None):
    ars, s, ex = build(*c, usage=usage)
    m = {}
    for pr, name, kind, q in R.call_dist("v09", ars, s, ex):
        m[(name, q)] = m.get((name, q), 0.0) + pr
    return m


cells, rob = {}, {}
for lv in ("hs", "travel"):
    for ak in ARS + [f"staff{i}" for i in range(len(STAFF))]:
        for b in range(4):
            for k in range(3):
                for same in (True, False):
                    m = menu(lv, ak, b, k, same)
                    key = f"{lv}|{ak}|{b}-{k}|{'same' if same else 'opp'}"
                    cells[key] = {f"{x[0]} {x[1]}": v for x, v in m.items()}
                    if ak.startswith("staff") and (b, k) in ((2, 2), (3, 2)):
                        top = max(m, key=m.get)
                        mv = [m[top] - menu(lv, ak, b, k, same, usage={top: n}).get(top, 0.0) for n in range(1, 7)]
                        rob[key] = {"top": f"{top[0]} {top[1]}", "top_share": m[top], "moves_n1_6": mv,
                                    "max_move": max(abs(x) for x in mv)}
json.dump({"cells": cells, "rob": rob}, open(OUT, "w"), indent=1)
print("ok", len(cells), len(rob))
