"""Part 10 (task 1): blast radius of the proposed E-7 spreading change. Scratch only: the variant is set in this process,
nothing in the engine is edited. Cells: HS / travel x (the robustness arsenals (10) + the HS data staff (6)) x 12 counts
x same / opposite side, default situation, no history. Prints, per variant, every cell whose menu moves (max share move,
top before / after, top share before / after).
    python readthrough/e7_blast_v13.py --variant rho|loc15 --out PATH
rho:   COACH_RULE plus_opp x RHO_L (0.6) at HS / travel (the J7 credit scaled like every other MLB-sized coaching term)
loc15: the location window x 1.5 at HS / travel (contrast: a general change)"""
import json
import os
import sys
from dataclasses import replace

a = sys.argv[1:]
VAR = a[a.index("--variant") + 1]
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


def cells():
    for lv in ("hs", "travel"):
        for ak in ARS + [f"staff{i}" for i in range(len(STAFF))]:
            for b in range(4):
                for k in range(3):
                    for same in (True, False):
                        yield lv, ak, b, k, same


def dist(lv, ak, b, k, same):
    if ak.startswith("staff"):
        ars = [replace(x) for x in STAFF[int(ak[5:])]["arsenal"]]
        s = e.Situation(b, k, 1, (False, False, False), level=lv, same_side=same, pitch_count=40, inning=3, margin=0,
                        batters_faced=10)
        ex = None
    else:
        inp = {"level": lv, "arsenal": ak, "balls": b, "strikes": k, "batters_faced": 19, "pitch_count": 70, "same_side": same}
        ars, s, ex = R.build(DOC, {"inputs": inp, "pitch_edits": {}, "exclude": [], "matchup": []})
    m = {}
    for pr, name, kind, q in R.call_dist("v09", ars, s, ex):
        m[f"{name} {q}"] = m.get(f"{name} {q}", 0.0) + pr
    return m


def run():
    return {"|".join(map(str, c)): dist(*c) for c in cells()}


base = run()
if VAR == "rho":
    orig = e.coach_credit

    def cc(p, q, s, arsenal=None):
        c = orig(p, q, s, arsenal)
        if s.level in ("hs", "travel") and not s.same_side and p.grade >= 4 and (
                (p.kind == "CH" and q in ("down-away", "chase")) or (p.kind == "SL" and q == "down-in")):
            c -= e.COACH_RULE["plus_opp"] * (1.0 - e.RHO_L.get(s.level, 1.0))
        return c
    e.coach_credit = cc
elif VAR == "loc15":
    _w = e.windows
    e.windows = lambda s: (_w(s)[0], _w(s)[1] * (1.5 if s.level in ("hs", "travel") else 1.0))
new = run()
ch = {}
for c in base:
    m0, m1 = base[c], new[c]
    mv = max(abs(m0.get(x, 0) - m1.get(x, 0)) for x in set(m0) | set(m1))
    if mv >= 0.0005:
        t0, t1 = max(m0, key=m0.get), max(m1, key=m1.get)
        ch[c] = {"max_move": round(mv, 4), "top_before": [t0, round(m0[t0], 4)], "top_after": [t1, round(m1[t1], 4)],
                 "before": sorted([[x, round(v, 4)] for x, v in m0.items()], key=lambda r: -r[1]),
                 "after": sorted([[x, round(v, 4)] for x, v in m1.items()], key=lambda r: -r[1])}
summ = {"variant": VAR, "cells": len(base), "changed": len(ch),
        "changed_same_side": sum(1 for c in ch if c.endswith("True")),
        "top_changed": sum(1 for v in ch.values() if v["top_before"][0] != v["top_after"][0]),
        "cells_top_over_60_before": sum(1 for m in base.values() if max(m.values()) > 0.60),
        "cells_top_over_60_after": sum(1 for m in new.values() if max(m.values()) > 0.60)}
json.dump({"summary": summ, "changed": ch}, open(OUT, "w"), indent=1)
print(json.dumps(summ))
for c, v in sorted(ch.items(), key=lambda kv: -kv[1]["max_move"])[:60]:
    print(c, v["max_move"], v["top_before"], v["top_after"])
