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
    check("no fastball in the policy (outside the window or shaken off): unchanged", e.apply_fb_floor(zero, s, frozenset({"Fastball"})) is zero)
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
    raised = 0
    for c, dist in zip(calls, py["calls"]):
        if c["lv"] == "college_d1":
            continue
        ars_kinds = {d["name"]: d["kind"] for d in inp["ars"][c["a"]]}
        w = sum(pr for pr, n, q in dist if ars_kinds[n] in ("FB", "SI", "FC"))
        f = F[f"{c['b']}-{c['k']}"]
        if w > 0 and w < f - 1e-6:
            below.append((c["b"], c["k"], round(w, 4), f))
        raised += abs(w - f) < 1e-6
    check("every HS / travel call's fastball share >= the floor (call_v08's dist)", not below, str(below[:5]))
    print(f"     ({raised} of {len(calls) - 8} calls sit exactly at the floor)")
    nof = copy.deepcopy(C)
    nof["levels"]["hs"].pop("fb_floor")
    path = os.path.join(DATA, "kgapfix", "count_v13core_nofloor.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(nof, open(path, "w", encoding="utf8"))
    py0 = json.loads(TT.run_py(HERE, inp, {"PITCH_COUNT_TABLE": path}))
    check("college_d1 calls bit for bit with or without the hs floor", py0["calls"][-8:] == py["calls"][-8:])
    check("the floor changes HS calls (it binds)", py0["calls"][:-8] != py["calls"][:-8])

    # --- ruling 9 ------------------------------------------------------------------------------------------------------
    import simulate
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
