"""Part 9 (Nov 26): the HS floor step, explained by numbers. Report only. For one (level, arsenal, count) cell, at n = 0..N
repeats of the no-history top call: the root call's pre-floor shares of every fastball-class call, w, t, the floor f, the
floor's branch and its allocation (from apply_fb_floor's own inputs at _root_solve), and the final top calls.
Run from a repo root with PITCHIQ_DATA set.  usage: floor_step_diag_v13.py [--call NAME] [--level hs] [--arsenal four_cut] [--count 3-2] [--n 2] --out PATH"""
import json, os, sys
a = sys.argv[1:]
def opt(k, d=None):
    return a[a.index(k) + 1] if k in a else d
OUT = opt("--out"); LV = opt("--level", "hs"); AK = opt("--arsenal", "four_cut"); CNT = opt("--count", "3-2"); N = int(opt("--n", "2")); CALL = opt("--call")   # --call "Curve middle": repeat that call instead of the top one
sys.argv = [sys.argv[0], "--suite", "v12"]
sys.path.insert(0, os.path.join(os.getcwd(), "readthrough"))
import scenarios as R   # noqa: E402
from dataclasses import replace  # noqa: E402
e = R.e
DOC, _ = R.load()
orig = e.apply_fb_floor
log = []
def wrapped(pi, s, fb, costs=None, temp=None):
    out = orig(pi, s, fb, costs, temp)
    if sys._getframe(1).f_code.co_name == "_root_solve" and fb:
        f = e.fb_floor(s); blk = getattr(fb, "block", ())
        t = sum(pi.values()); w = sum(v for k, v in pi.items() if k[0] in fb and k not in blk)
        br = "none (fb >= floor)" if w >= f * t else ("w == 0" if w == 0 else "0 < w < f*t")
        log.append({"f": f, "t": round(t, 6), "w": w, "branch": br,
                    "kf": (f * t / w) if 0 < w < f * t else None,
                    "fb_pre": {f"{k[0]} {k[1]}": v for k, v in pi.items() if k[0] in fb},
                    "fb_costs": ({f"{k[0]} {k[1]}": round(c, 5) for k, c in costs.items() if k[0] in fb} if costs else None),
                    "fb_post": {f"{k[0]} {k[1]}": round(v, 4) for k, v in out.items() if k[0] in fb and v > 1e-6},
                    "pre_top": {f"{k[0]} {k[1]}": round(v, 4) for k, v in sorted(pi.items(), key=lambda kv: -kv[1])[:5]},
                    "post_top": {f"{k[0]} {k[1]}": round(v, 4) for k, v in sorted(out.items(), key=lambda kv: -kv[1])[:5]}})
    return out
e.apply_fb_floor = wrapped
b, k = map(int, CNT.split("-"))
inp = {"level": LV, "arsenal": AK, "balls": b, "strikes": k, "batters_faced": 19, "pitch_count": 70}
def dist(s_edit=None):
    ars, s, ex = R.build(DOC, {"inputs": inp, "pitch_edits": {}, "exclude": [], "matchup": []})
    if s_edit:
        s = replace(s, **s_edit)
    m = {}
    for pr, name, kind, q in R.call_dist("v09", ars, s, ex):
        m[(name, q)] = m.get((name, q), 0.0) + pr
    return m
res = {"cell": f"{LV}|{AK}|{CNT}", "rows": []}
del log[:]
m0 = dist(); k0 = max(m0, key=m0.get)
if CALL:
    k0 = next(k for k in m0 if f'{k[0]} {k[1]}' == CALL)
res["rows"].append({"n": 0, "root_floor_calls": list(log), "final": {f"{x[0]} {x[1]}": round(v, 4) for x, v in sorted(m0.items(), key=lambda kv: -kv[1]) if v >= 0.005}})
for n in range(1, N + 1):
    del log[:]
    m = dist({"usage_by_call": {k0: n}})
    res["rows"].append({"n": n, "root_floor_calls": list(log), "move_of_top": round(m0[k0] - m.get(k0, 0), 4),
                        "final": {f"{x[0]} {x[1]}": round(v, 4) for x, v in sorted(m.items(), key=lambda kv: -kv[1]) if v >= 0.005}})
res["top_call_n0"] = f"{k0[0]} {k0[1]}"
json.dump(res, open(OUT, "w"), indent=1)
print(json.dumps(res, indent=1)[:12000])
