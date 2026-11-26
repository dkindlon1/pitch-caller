"""v1.3 K-gap fixes (Drew's Nov 23 rulings 8-10): checks.

  ruling 8   the HS / travel fastball-share floor (count_v13core levels.hs.fb_floor): Python = JS on HS / travel calls,
             the floor holds at every count, other levels and the v12 / v13refit tables are untouched, the format check,
             the table is the fit's export; HS is calibrated with the pitch kind x velocity table on (flag in the row)
  ruling 9   the simulated hitters are centered (simulate.OS_HOLE 0; calib's population means exactly 0)
  ruling 10  the full-game weights match the whole level's K / BB / HBP (fits/fullgame_weights/summary.json)

    python tests_v13_kgapfix.py
"""
import copy
import json
import os
import random
import sys

import tests_v13_tables as TT

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("PITCHIQ_DATA", "C:/dev/pitchiq-data")
FAIL = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))
    if not ok:
        FAIL.append(name)


HS_ARS = [[dict(name="Fastball", kind="FB", grade=3, command=4, conf=0.8, shape="ride", velo=77.2),
           dict(name="Slider", kind="SL", grade=4, command=3, conf=0.75, shape="tight", velo=71.4),
           dict(name="Changeup", kind="CH", grade=3, command=2, conf=0.6, shape="fade", velo=72.2)],
          [dict(name="Fastball", kind="FB", grade=4, command=3, conf=0.8, shape="ride", velo=82.0),
           dict(name="Curveball", kind="CB", grade=3, command=3, conf=0.7, shape="loopy", velo=71.2),
           dict(name="Changeup", kind="CH", grade=2, command=3, conf=0.55, shape="fade", velo=76.1)]]


def main():
    sys.path.insert(0, HERE)
    import engine as e
    C = json.load(open(os.path.join(HERE, "data_tables", "count_v13core.json"), encoding="utf8"))
    F = C["levels"]["hs"].get("fb_floor")
    ck = [f"{b}-{k}" for k in range(3) for b in range(4)]

    # --- ruling 8: table and format -----------------------------------------------------------------------------------
    src = os.path.join(DATA, "fits", "hs", "fb_floor_thru2025.json")
    check("count_v13core levels.hs.fb_floor: one share per count", isinstance(F, dict) and all(0 <= F[c] < 1 for c in ck))
    if os.path.exists(src):
        check("fb_floor is the fit's export (fits/hs/fb_floor_thru2025.json floor)", F == json.load(open(src, encoding="utf8"))["floor"])
    check("only hs carries fb_floor", all("fb_floor" not in L for lv, L in C["levels"].items() if lv != "hs"))
    bad = copy.deepcopy(C)
    bad["levels"]["college_d1"]["fb_floor"] = F
    try:
        e.check_table(bad, "bad")
        refused = False
    except ValueError:
        refused = True
    check("an fb_floor at a level other than hs is refused by the format check", refused)
    bad2 = copy.deepcopy(C)
    bad2["levels"]["hs"]["fb_floor"] = dict(F, **{"3-2": 1.2})
    try:
        e.check_table(bad2, "bad2")
        refused = False
    except ValueError:
        refused = True
    check("an fb_floor share outside [0, 1) is refused", refused)
    check("HS row is flagged calibrated with the pitch kind x velocity table on (ruling 8)",
          C["levels"]["hs"].get("calibrated_with_pitch_velo") is True and "pitch_velo" in C["levels"]["hs"])
    for v in ("v12", "v13refit"):
        T = json.load(open(os.path.join(HERE, "data_tables", f"count_{v}.json"), encoding="utf8"))
        check(f"count_{v}: no fb_floor (the floor is off there)", all("fb_floor" not in L for L in T["levels"].values()))

    # --- apply_fb_floor arithmetic --------------------------------------------------------------------------------------
    s = e.Situation(3, 2, 0, (False, False, False), level="hs")
    f32 = e.fb_floor(s)
    pi = {("Fastball", "middle"): 0.1, ("Fastball", "down-away"): 0.05, ("Slider", "chase"): 0.6, ("Changeup", "down-away"): 0.25}
    out = e.apply_fb_floor(pi, s, frozenset({"Fastball"}))
    fb = out[("Fastball", "middle")] + out[("Fastball", "down-away")]
    check("apply_fb_floor raises the fastball share to the floor, keeps the total and the ratios inside each class",
          abs(fb - f32) < 1e-12 and abs(sum(out.values()) - 1) < 1e-12
          and abs(out[("Fastball", "middle")] / out[("Fastball", "down-away")] - 2) < 1e-12
          and abs(out[("Slider", "chase")] / out[("Changeup", "down-away")] - 2.4) < 1e-12)
    hi = {("Fastball", "middle"): 0.9, ("Slider", "chase"): 0.1}
    check("above the floor: unchanged", e.apply_fb_floor(hi, s, frozenset({"Fastball"})) is hi)
    zero = {("Slider", "chase"): 1.0}
    check("no fastball in the policy and no costs given (shaken off): unchanged", e.apply_fb_floor(zero, s, frozenset({"Fastball"})) is zero)
    costs = {("Slider", "chase"): 0.10, ("Fastball", "middle"): 0.30, ("Fastball", "down-away"): 0.3005}
    back = e.apply_fb_floor(zero, s, frozenset({"Fastball"}), costs, 0.01)
    check("ruling 16: fastball outside the never-pick window (share 0, costs given): brought back at the floor, split by the "
          "location softmax (the floor outranks the model-made window)",
          abs(back[("Fastball", "middle")] + back[("Fastball", "down-away")] - f32) < 1e-12 and abs(sum(back.values()) - 1) < 1e-12
          and back[("Fastball", "middle")] > back[("Fastball", "down-away")] and abs(back[("Slider", "chase")] - (1 - f32)) < 1e-12)
    fbm = e._FbSet({"Fastball"})
    fbm.block = frozenset({("Fastball", "middle")})
    backm = e.apply_fb_floor(zero, s, fbm, costs, 0.01)
    check("ruling 16: a mashed fastball call (hard rule) is never brought back; the floor goes to the eligible calls only",
          ("Fastball", "middle") not in backm and abs(backm[("Fastball", "down-away")] - f32) < 1e-12)
    fbm2 = e._FbSet({"Fastball"})
    fbm2.block = frozenset({("Fastball", "middle"), ("Fastball", "down-away")})
    check("ruling 16: every fastball call mashed: unchanged", e.apply_fb_floor(zero, s, fbm2, costs, 0.01) is zero)
    pim = {("Fastball", "middle"): 0.1, ("Fastball", "down-away"): 0.05, ("Slider", "chase"): 0.85}
    outm = e.apply_fb_floor(pim, s, fbm, costs, 0.01)
    check("ruling 16: a mashed call in the policy is neither counted toward the floor nor raised",
          abs(outm[("Fastball", "down-away")] - f32) < 1e-12 and outm[("Fastball", "middle")] < 0.1)
    # ruling 33 (Nov 26): with costs, a fastball share above 0 keeps its own calls and ADDS the shortfall by the same
    # location softmax as the share-0 branch, so the allocation is continuous in the costs (no step when a call enters)
    pw = {("Fastball", "down-away"): 0.004, ("Slider", "chase"): 0.996}
    o33 = e.apply_fb_floor(pw, s, frozenset({"Fastball"}), costs, 0.01)
    loc = e._soft({a: c for a, c in costs.items() if a[0] == "Fastball"}, 0.01, e.windows(s)[1], 0.30)
    check("ruling 33: share above 0 and below the floor: fastball share = floor, its calls keep their share plus the "
          "shortfall by the location softmax, the rest x (1 - f) / (1 - w)",
          abs(o33[("Fastball", "middle")] + o33[("Fastball", "down-away")] - f32) < 1e-12 and abs(sum(o33.values()) - 1) < 1e-12
          and abs(o33[("Fastball", "middle")] - (f32 - 0.004) * loc[("Fastball", "middle")]) < 1e-12
          and abs(o33[("Fastball", "down-away")] - (0.004 + (f32 - 0.004) * loc[("Fastball", "down-away")])) < 1e-12
          and abs(o33[("Slider", "chase")] - (1 - f32)) < 1e-12)

    def _gap(eps):
        p1 = {("Fastball", "down-away"): eps, ("Slider", "chase"): 1.0 - eps}
        a1 = e.apply_fb_floor(p1, s, frozenset({"Fastball"}), costs, 0.01)
        return max(abs(a1.get(k, 0.0) - back.get(k, 0.0)) for k in set(a1) | set(back))
    check("ruling 33: continuous at share 0: a share of 1e-9 gives the share-0 allocation within 1e-8 (before: the whole "
          "floor on that one call)", _gap(1e-9) < 1e-8, f"gap {_gap(1e-9):.1e}")
    pt = {("Fastball", "down-away"): f32 - 1e-9, ("Slider", "chase"): 1.0 - f32 + 1e-9}
    at = e.apply_fb_floor(pt, s, frozenset({"Fastball"}), costs, 0.01)
    check("ruling 33: continuous at the floor: a share 1e-9 under it changes nothing by more than 1e-8",
          max(abs(at.get(k, 0.0) - pt.get(k, 0.0)) for k in set(at) | set(pt)) < 1e-8)
    mu = {"hard|FB|middle": 1, "hard|FB|up-in": 1, "hard|FB|down-away": 2}
    sm = e.Situation(3, 2, 0, (False, False, False), level="hs", matchup=mu)
    ars_m = [e.Pitch("Fastball", "FB", 3, 3, 0.8), e.Pitch("Curve", "CB", 3, 3, 0.8)]
    blk = e.fb_names(ars_m, sm).block
    check("fb_names' block = the mashed fastball calls (engine.mashed): down targets blocked, up / middle not",
          blk == frozenset(("Fastball", q) for q in e.QUADS if e.mashed(ars_m[0], q, sm)) and ("Fastball", "down-away") in blk
          and ("Fastball", "up-in") not in blk, str(sorted(blk)))
    check("no matchup: empty block (bit for bit the unblocked floor)", e.fb_names(ars_m, s).block == frozenset())
    check("fb_floor is None off HS / travel; travel reads hs",
          all(e.fb_floor(e.Situation(1, 1, 0, (False, False, False), level=lv)) is None for lv in ("mlb", "college_d1", "college_d2", "college_d3"))
          and e.fb_floor(e.Situation(1, 1, 0, (False, False, False), level="travel")) == F["1-1"])

    # --- Python = JS, and the floor holds on whole calls ----------------------------------------------------------------
    rng = random.Random(23)
    calls = [dict(lv=rng.choice(["hs", "travel"]), b=b, k=k, o=rng.randint(0, 2),
                  bases=[rng.random() < 0.35, rng.random() < 0.3, rng.random() < 0.25], same=rng.random() < 0.5,
                  pc=rng.randint(0, 100), a=rng.randrange(4), inning=rng.randint(1, 7), margin=rng.randint(-3, 3))
             for b in range(4) for k in range(3) for _ in range(3)]
    calls += [dict(c, lv="college_d1") for c in calls[:8]]
    inp = {"ars": TT.ARS + HS_ARS, "cases": [], "calls": calls, "levels": ["hs", "travel"]}
    py = json.loads(TT.run_py(HERE, inp))
    js = json.loads(TT.run_js(HERE, inp))
    w = TT.worst(py["calls"], js["calls"])
    check(f"Python = JS on {len(calls)} calls with the floor (HS / travel, 4 arsenals, every count; 8 college_d1; within 1e-9, "
          "the parity tolerance)", w <= 1e-9, f"largest difference {w:.1e}")
    kinds = {d["name"]: d["kind"] for a in inp["ars"] for d in a}
    below = []
    raised = zero_share = 0
    for c, dist in zip(calls, py["calls"]):
        if c["lv"] == "college_d1":
            continue
        ars_kinds = {d["name"]: d["kind"] for d in inp["ars"][c["a"]]}
        w = sum(pr for pr, n, q in dist if ars_kinds[n] in ("FB", "SI", "FC"))
        f = F[f"{c['b']}-{c['k']}"]
        if w < f - 1e-6:          # ruling 16: the floor holds on every call (only hard rules beat it; none set here)
            below.append((c["b"], c["k"], round(w, 4), f))
        zero_share += w == 0
        raised += abs(w - f) < 1e-6
    check("ruling 16: every HS / travel call has fastball share >= the floor (call_v08's dist; no hard rule set)", not below, str(below[:5]))
    # ruling 16, Python = JS with a mashed fastball height (the hard rule) on HS calls
    callsm = [dict(c, mu={"hard|FB|down-away": 1, "hard|FB|down-in": 1, "hard|SI|down-away": 2, "hard|FC|up-in": 2})
              for c in calls[:-8] if c["k"] == 2][:12]
    inpm = dict(inp, calls=callsm)
    pym = json.loads(TT.run_py(HERE, inpm))
    jsm = json.loads(TT.run_js(HERE, inpm))
    wm = TT.worst(pym["calls"], jsm["calls"])
    check(f"ruling 16: Python = JS on {len(callsm)} two-strike HS / travel calls with mashed fastball heights (within 1e-9)",
          wm <= 1e-9, f"largest difference {wm:.1e}")
    print(f"     ({raised} of {len(calls) - 8} calls sit exactly at the floor; {zero_share} allow no fastball call)")
    nof = copy.deepcopy(C)
    nof["levels"]["hs"].pop("fb_floor")
    path = os.path.join(DATA, "kgapfix", "count_v13core_nofloor.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(nof, open(path, "w", encoding="utf8"))
    py0 = json.loads(TT.run_py(HERE, inp, {"PITCH_COUNT_TABLE": path}))
    check("college_d1 calls bit for bit with or without the hs floor", py0["calls"][-8:] == py["calls"][-8:])
    check("the floor changes HS calls (it binds)", py0["calls"][:-8] != py["calls"][:-8])

    # --- ruling 14: the coach's own pitch is floored too ---------------------------------------------------------------
    import simulate
    cands = [e.Pitch(n, k, 3, 3, 0.6) for n, k in (("Fastball", "FB"), ("Slider", "SL"), ("Curve", "CB"), ("Change", "CH"))]
    s00 = e.Situation(0, 0, 0, (False, False, False), level="hs")
    r1 = random.Random(5)
    share = sum(simulate.coach_pitch(r1, cands, s00).kind == "FB" for _ in range(20000)) / 20000
    check("ruling 14: the coach's own pitch (OVERRIDE) meets the floor at HS (uniform share 0.25 -> the 0-0 floor)",
          abs(share - F["0-0"]) < 0.015, f"{share:.3f} vs {F['0-0']}")
    r2, r3 = random.Random(9), random.Random(9)
    sc = e.Situation(0, 0, 0, (False, False, False), level="college_d1")
    check("off HS / travel the coach's pitch is exactly the old rng.choice draw",
          all(simulate.coach_pitch(r2, cands, sc) is r3.choice(cands) for _ in range(200)))

    # --- ruling 9 ------------------------------------------------------------------------------------------------------
    import calib
    check("simulate.OS_HOLE = 0 (no built-in off-speed hole)", simulate.OS_HOLE == 0.0)
    check("calib's hidden hitters: fb / os / timing means exactly 0",
          all(abs(sum(h[k] for h in calib.HITTERS) / len(calib.HITTERS)) < 1e-8 for k in ("fb", "os", "timing")))
    simulate.rng = random.Random(5)
    H = [h for _ in range(3000) for h in simulate.their_lineup()]
    check("default lineup population means within 0.01 of 0 (27,000 hitters)",
          all(abs(sum(h[k] for h in H) / len(H)) < 0.01 for k in ("fb", "os", "timing")))

    # --- ruling 10 -----------------------------------------------------------------------------------------------------
    sp = os.path.join(DATA, "fits", "fullgame_weights", "summary.json")
    if os.path.exists(sp):
        S = json.load(open(sp, encoding="utf8"))
        gaps = [max(abs(a - b) for a, b in zip(v["after_tilt"], v["target"])) for lv in S["levels"].values() for v in lv.values()]
        check(f"full-game weights: weighted K / BB / HBP = all games in every level-season ({len(gaps)})", max(gaps) < 1e-6)
    print(f"\n{'ALL PASS' if not FAIL else str(len(FAIL)) + ' FAILED'}")
    return not FAIL


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
