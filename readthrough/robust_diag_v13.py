"""Robustness diagnosis (Nov 25 evening, ruling 27). Report only; imports the repo's own hard_checks machinery.
Run from a repo root with PITCHIQ_DATA set.  usage: robust_diag_v13.py --mode menu|sweep|grid [--levels a,b] [--arsenals a,b] [--counts 2-2,3-2] --out PATH
menu : at the default 2-2 row, the whole call menu at n = 0..6 times the no-history top call was used (usage_by_call)
sweep: for each (level, arsenal, count) the no-history top call and its move at n = 3 and the max over n = 0..6"""
import json, os, sys, time
a = sys.argv[1:]
def opt(k, d=None):
    return a[a.index(k) + 1] if k in a else d
OUT, MODE = opt("--out"), opt("--mode")
levels = opt("--levels", "college_d3").split(",")
arsenals = opt("--arsenals", "three").split(",")
counts = opt("--counts", "2-2,3-2").split(",")
sys.argv = [sys.argv[0], "--suite", "v12"]
sys.path.insert(0, os.path.join(os.getcwd(), "readthrough"))
import scenarios as R   # noqa: E402
from dataclasses import replace  # noqa: E402
DOC, _ = R.load()

def dist_of(inputs, s_edit=None):
    ars, s, ex = R.build(DOC, {"inputs": inputs, "pitch_edits": {}, "exclude": [], "matchup": []})
    if s_edit:
        s = replace(s, **s_edit)
    d = R.call_dist("v09", ars, s, ex)
    m = {}
    for pr, name, kind, q in d:
        m[(name, q)] = m.get((name, q), 0.0) + pr
    return m

def tv(x, y):
    return 0.5 * sum(abs(x.get(k, 0) - y.get(k, 0)) for k in set(x) | set(y))

out = {"engine": getattr(R.e, "TABLE_VERSIONS", "v1.2.3 (no tables)")}
t0 = time.time()
if MODE == "menu":
    for lv in levels:
        for b, k in [tuple(map(int, c.split("-"))) for c in counts]:
            inp = {"level": lv, "arsenal": arsenals[0], "balls": b, "strikes": k, "batters_faced": 19, "pitch_count": 70}
            m0 = dist_of(inp)
            k0 = max(m0, key=m0.get)
            rows = []
            for n in range(0, 7):
                m = m0 if n == 0 else dist_of(inp, {"usage_by_call": {k0: n}})
                rows.append({"n": n, "top": [f"{x[0]} {x[1]}" for x, _ in sorted(m.items(), key=lambda kv: -kv[1])[:1]],
                             "tv_vs_n0": round(tv(m0, m), 4), "call_share": round(m.get(k0, 0), 4),
                             "menu": {f"{x[0]} {x[1]}": round(v, 4) for x, v in sorted(m.items(), key=lambda kv: -kv[1]) if v >= 0.005}})
            srt = sorted(m0.values(), reverse=True)
            out[f"{lv}|{arsenals[0]}|{b}-{k}"] = {"no_history_top": f"{k0[0]} {k0[1]}", "gap_top_to_second": round(srt[0] - (srt[1] if len(srt) > 1 else 0.0), 4),
                                                  "calls_at_n0": len([v for v in srt if v > 0.005]), "rows": rows}
elif MODE == "sweep":
    res = []
    for lv in levels:
        for ak in arsenals:
            for c in counts:
                b, k = map(int, c.split("-"))
                inp = {"level": lv, "arsenal": ak, "balls": b, "strikes": k, "batters_faced": 19, "pitch_count": 70}
                m0 = dist_of(inp)
                k0 = max(m0, key=m0.get)
                mv = []
                for n in (1, 2, 3, 6):
                    m = dist_of(inp, {"usage_by_call": {k0: n}})
                    mv.append(round(m0[k0] - m.get(k0, 0), 4))
                srt = sorted(m0.values(), reverse=True)
                res.append({"level": lv, "arsenal": ak, "count": c, "top": f"{k0[0]} {k0[1]}", "top_share": round(m0[k0], 4),
                            "gap_to_second": round(srt[0] - (srt[1] if len(srt) > 1 else 0.0), 4), "move_n1": mv[0], "move_n2": mv[1], "move_n3": mv[2], "move_n6": mv[3]})
    out["rows"] = res
else:   # grid: the full check, n = 0..6, per cell (ruling 29: the 10-point limit covers repeated calls)
    res = []
    for lv in levels:
        for ak in arsenals:
            for c in counts:
                b, k = map(int, c.split("-"))
                inp = {"level": lv, "arsenal": ak, "balls": b, "strikes": k, "batters_faced": 19, "pitch_count": 70}
                m0 = dist_of(inp)
                k0 = max(m0, key=m0.get)
                mv = [round(m0[k0] - dist_of(inp, {"usage_by_call": {k0: n}}).get(k0, 0), 4) for n in range(1, 7)]
                res.append({"level": lv, "arsenal": ak, "count": c, "top": f"{k0[0]} {k0[1]}", "top_share": round(m0[k0], 4),
                            "moves_n1_6": mv, "max_move": max(mv)})
    out["rows"] = res
out["seconds"] = round(time.time() - t0, 1)
json.dump(out, open(OUT, "w"), indent=1)
print("ok", OUT, out["seconds"], "s")
