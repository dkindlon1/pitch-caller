"""Part 10 (Nov 26, task 1): E-7 opposite side explained. Report only. The cell is hitter_data/edge_rows.py's row
"1-2|starter (HS q5, FB / SL / CH)|opp" (HS data staff q5, bases empty, 1 out, inning 3, tied, pitch count 40, BF 10).
For the root call: the allowed calls vs every target (which hard rule removed what), each call's full cost (at the sit
mix), the gap to the best call and to its pitch's best, the pitch-type and location softmax weights and tapers, the
pre-floor share (the sit game's policy, before tie-break and floor), the floor's inputs and the final share; each
call's outcome probabilities at the sit mix (the zone / take tables' part). Then n = 0..6 repeats of the no-history top
call (usage_by_call), and the same-side cell for contrast.
    python readthrough/e7_diag_v13.py [--count 1-2] [--side opp] [--staff 2] [--n 6] [--out PATH]
Optional --soft-loc X: scratch only (the proposal): multiply the location window by X in this process."""
import json
import os
import sys
from dataclasses import replace

a = sys.argv[1:]


def opt(k, d=None):
    return a[a.index(k) + 1] if k in a else d


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.environ["LEVEL"] = "hs"
import engine as e  # noqa: E402
import simulate as sim  # noqa: E402

CNT = opt("--count", "1-2")
SIDE = opt("--side", "opp")
STAFF = int(opt("--staff", "2"))
N = int(opt("--n", "6"))
OUT = opt("--out")
B, K = map(int, CNT.split("-"))

cap = {}
orig_root = e._root_solve


def root_hook(arsenal, s, tab, exclude=None, look_value=True, extra=(), cache=None):
    """_root_solve with its intermediate values kept (same operations; the floor and tie-break are the engine's own)"""
    e.resolve_speeds(arsenal)
    by = {x.name: x for x in arsenal}
    ks = e.sit_options(arsenal)
    look = s.look or tab.h0
    temp = e.temperature(arsenal, s)
    calls = e.allowed_calls(arsenal, s, exclude, extra)
    sL = replace(s, look=look)
    my = s.balls == 3 or not look_value
    pre = {}
    M = {c: {kk: e.cost08(by[c[0]], c[1], sL, arsenal, tab, look, ("pure",) + kk, myopic=my, _pre=pre)[0] for kk in ks}
         for c in calls}
    fb = e.fb_names(arsenal, s)
    pi0, sg, res = e.solve_sit_game(M, ks, s, temp, s.b_h, s.usage_by_call)
    full = {c: sum(sg[kk] * M[c][kk] for kk in ks) for c in M}
    tb = e.tie_break(pi0, full, arsenal, s, exclude, M)
    pi = e.apply_fb_floor(tb, s, fb, full, temp)
    out_ref = orig_root(arsenal, s, tab, exclude, look_value, extra, cache)
    assert max(abs(out_ref[0].get(c, 0) - pi.get(c, 0)) for c in set(pi) | set(out_ref[0])) < 1e-12, "hook != engine"
    P = {c: e.outcome_probs(by[c[0]], c[1], sL, arsenal, sit=("mix", sg)) for c in calls}
    cap.update(calls=calls, temp=temp, win=e.windows(s), sg=sg, res=res, full=full, pi0=pi0, tb=tb, pi=pi, fb=fb,
               f=e.fb_floor(s), P=P)
    return out_ref


e._root_solve = root_hook

PO = opt("--plus-opp-scale")       # scratch only (the proposal): plus_opp x X in this HS-only process (X = RHO_L = 0.6)
if PO:
    e.COACH_RULE["plus_opp"] = e.COACH_RULE["plus_opp"] * float(PO)
SOFT = opt("--soft-loc")
if SOFT:
    _w = e.windows
    e.windows = lambda s: (_w(s)[0], _w(s)[1] * float(SOFT))


def sit(usage=None, same=None):
    sd = (SIDE == "same") if same is None else same
    s = e.Situation(B, K, 1, (False, False, False), level="hs", same_side=sd, pitch_count=40, inning=3, margin=0,
                    batters_faced=10)
    if usage:
        s = replace(s, usage_by_call=usage)
    return s


ars = sim.hs_data_staff()[STAFF]["arsenal"]
e.resolve_speeds(ars)


def menu(s):
    tab = e.solve_table(ars, e.replace(s, balls=0, strikes=0, last=None))
    cap.clear()
    _, dist, _, _ = e.call_v08(ars, s, rng=None, tab=tab)
    m = {}
    for pr, _, p, q in dist:
        m[(p.name, q)] = m.get((p.name, q), 0.0) + pr
    return m, dict(cap)


def lbl(c):
    return f"{c[0]} {c[1]}"


def detail(s):
    m, c = menu(s)
    full, temp, (win, lwin) = c["full"], c["temp"], c["win"]
    names = []
    for (n, q) in full:
        if n not in names:
            names.append(n)
    best_by = {n: min(v for (mm, q), v in full.items() if mm == n) for n in names}
    overall = min(best_by.values())
    pt = e._soft(best_by, temp, win, overall)
    rows = []
    for cl in sorted(full, key=lambda x: full[x]):
        n = cl[0]
        lw = max(e.TAPER * lwin, lwin - (best_by[n] - overall))
        g = full[cl] - best_by[n]
        P = c["P"][cl]
        rows.append({"call": lbl(cl), "cost": round(full[cl], 5), "gap_best": round(full[cl] - overall, 5),
                     "gap_pitch_best": round(g, 5), "loc_window": round(lw, 5),
                     "loc_taper": round(e._taper(g, lw), 3), "type_share": round(pt.get(n, 0.0), 4),
                     "pre_floor": round(c["pi0"].get(cl, 0.0), 4), "after_tiebreak": round(c["tb"].get(cl, 0.0), 4),
                     "final_root": round(c["pi"].get(cl, 0.0), 4), "menu": round(m.get(cl, 0.0), 4),
                     "P": {k: round(P[k], 4) for k in ("ball", "cstrike", "whiff", "foul", "weak", "solid", "hard", "hbp")}})
    all_calls = [(x.name, q) for x in ars for q in e.QUADS]
    removed = [lbl(x) for x in all_calls if x not in c["calls"]]
    fbw = sum(v for k_, v in c["pi0"].items() if c["fb"] and k_[0] in c["fb"])
    return {"temp": temp, "type_window": win, "loc_window": lwin, "sit_mix": {f"{k_[0]} {k_[1]}": round(v, 4) for k_, v in c["sg"].items()},
            "residual": c["res"], "floor": c["f"], "pre_floor_fastball": round(fbw, 4),
            "type_softmax": {k_: round(v, 4) for k_, v in pt.items()}, "pitch_best_cost": {k_: round(v, 5) for k_, v in best_by.items()},
            "removed_before_solve": removed, "rows": rows,
            "menu": [[lbl(k_), round(v, 4)] for k_, v in sorted(m.items(), key=lambda kv: -kv[1])]}, m


res = {"cell": f"hs|staff{STAFF}|{CNT}|{SIDE}", "soft_loc": SOFT, "plus_opp_scale": PO}
d0, m0 = detail(sit())
res["n0"] = d0
top = max(m0, key=m0.get)
res["top_call_n0"] = lbl(top)
res["repeats"] = []
for n in range(1, N + 1):
    m, _ = menu(sit({top: n}))
    res["repeats"].append({"n": n, "top_share": round(m.get(top, 0.0), 4), "move": round(m0[top] - m.get(top, 0.0), 4),
                           "top": lbl(max(m, key=m.get)),
                           "menu": [[lbl(k_), round(v, 4)] for k_, v in sorted(m.items(), key=lambda kv: -kv[1]) if v >= 0.005]})
other = "same" if SIDE == "opp" else "opp"
d1, _ = detail(sit(same=(other == "same")))
res["other_side"] = {"side": other, "menu": d1["menu"], "rows": d1["rows"], "pre_floor_fastball": d1["pre_floor_fastball"]}
txt = json.dumps(res, indent=1)
if OUT:
    open(OUT, "w", encoding="utf-8").write(txt)
print(txt[:20000])
