"""v1.3 Part 3 (plan 3.5): college D2 as a level, in both engines, on D3's numbers until D2 is fitted.

- Every level table in the Python engine has college_d2, and the exported data (app/engine_data.json) carries it; the
  web copy is the app's.
- Validation: college_d2 is accepted by both engines; an unknown level is still refused by both.
- PLACEHOLDER_D2: until D2's own fits exist, a D2 call is exactly the D3 call (Python and JS, full calls with win tables).
- Python = JS at D2 on random spots (FAST_LEVEL=college_d2 python3 golden/fast.py 40 checks the 40 golden inputs).
- The release guard (release_guard_d2.py) trips today, naming the placeholders; on a tree with none it passes, and a
  single marker or a non-empty data list trips it. The release checklist runs it; scripts/test-app.sh does not.
- Other levels are untouched: golden/golden_v11.js v123 and golden/fast.py (unchanged goldens) check that.

  python3 tests_v13_d2.py      -> runs every check, exits non-zero on a failure
"""
import json, os, random, subprocess, sys, tempfile
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as e
import release_guard_d2 as guard

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""), flush=True)


def js(code, data=None):
    r = subprocess.run(["node", "-e", "const E=require('./app/engine.js');E.init(require('./app/engine_data.json'));"
                        "const inp=JSON.parse(require('fs').readFileSync(0,'utf8')||'null');" + code],
                       cwd=HERE, input=json.dumps(data), capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-2000:])
    return json.loads(r.stdout)


TABLES = {"LEVEL": e.LEVEL, "OUTCOME_ADJ": e.OUTCOME_ADJ, "RE": e.RE_BY_LEVEL, "CV": e.CV_BY_LEVEL,
          "IN_PLAY": e.IN_PLAY_BY_LEVEL, "LW": e.LW_BY_LEVEL, "PROFILES": e.PROFILES, "MOVE_RATIO": e.MOVE_RATIO,
          "A_BAR": e.A_BAR, "I_BAR_UMP": e.I_BAR_UMP, "I0_GRADE": e.I0_GRADE, "OUT_TABLE": e.OUT_TABLE,
          "RUNNER_FIT": e.RUNNER_FIT, "RUN_GAME": e.RUN_GAME, "HITTER_SPREAD": e.HITTER_SPREAD}
ARS = [dict(name="Fastball", kind="FB", grade=3, command=4, conf=0.8, shape="rides", velo=88),
       dict(name="Slider", kind="SL", grade=4, command=3, conf=0.72, shape="tight", velo=79),
       dict(name="Changeup", kind="CH", grade=3, command=2, conf=0.6, shape="fade", velo=79)]


def py_ars():
    a = [e.Pitch(d["name"], d["kind"], d["grade"], d["command"], d["conf"], shape=d["shape"], velo=d["velo"]) for d in ARS]
    e.resolve_speeds(a)
    return a


def spots(n, seed):
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        out.append(dict(balls=rng.randint(0, 3), strikes=rng.randint(0, 2), outs=rng.randint(0, 2),
                        bases=[rng.random() < 0.3, rng.random() < 0.25, rng.random() < 0.2], inning=rng.randint(1, 9),
                        margin=rng.randint(-3, 3), pitch_count=rng.randint(0, 110), batters_faced=rng.randint(0, 30),
                        same_side=rng.random() < 0.5, home=rng.choice([True, False, None])))
    return out


def py_call(sp, level):
    a = py_ars()
    s = e.Situation(sp["balls"], sp["strikes"], sp["outs"], tuple(sp["bases"]), inning=sp["inning"], margin=sp["margin"],
                    pitch_count=sp["pitch_count"], batters_faced=sp["batters_faced"], level=level,
                    same_side=sp["same_side"], home=sp["home"])
    if s.home is not None:
        s = replace(s, win=e.win_constants(s))
    tab = e.solve_table(a, replace(s, balls=0, strikes=0, last=None))
    pick, dist = e.call_v08(a, s, rng=None, tab=tab)[:2]
    return [[pr, x.name, q] for pr, _, x, q in dist]


JS_CALL = """
const out = inp.spots.map((sp) => {
  const ars = inp.ars.map((d) => E.Pitch(Object.assign({}, d)));
  let s = E.Situation(Object.assign({}, sp, { level: inp.level }));
  if (s.home !== null && s.home !== undefined) s = Object.assign({}, s, { win: E.v08.winConstants(s) });
  const tab = E.v08.solveTable(ars, Object.assign({}, s, { balls: 0, strikes: 0, last: null }));
  const r = E.v08.callV08(ars, s, { rng: () => 0.5, tab });
  return r.dist.map((d) => [d.prob, d.pitch.name, d.quad]);
});
process.stdout.write(JSON.stringify(out));
"""


def main():
    # 1. the tables
    miss = [k for k, t in TABLES.items() if "college_d2" not in t]
    check("every level table in the Python engine has college_d2", not miss, f"missing: {miss}" if miss else f"{len(TABLES)} tables")
    same_obj = [k for k, t in TABLES.items() if "college_d2" in t and t["college_d2"] is not t["college_d3"]]
    check("PLACEHOLDER_D2: each D2 entry is D3's own (the same object), and D2_PLACEHOLDERS names them",
          not same_obj and set(TABLES) - {"I0_GRADE"} <= set(e.D2_PLACEHOLDERS) and "WE" in e.D2_PLACEHOLDERS,
          f"D2_PLACEHOLDERS {e.D2_PLACEHOLDERS}")
    check("win tables: D2 reads D3's (WE_LEVEL alias) in both engines", e._we_tab("college_d2", 9, 0) is e._we_tab("college_d3", 9, 0)
          and e._we_tab("college_d2", 9, 0) is not None)
    D = json.load(open(os.path.join(HERE, "app", "engine_data.json"), encoding="utf8"))
    V8 = D["V08"]
    have = {"RE": D["RE"], "CV": D["CV"], "OUTCOME_ADJ": D["OUTCOME_ADJ"], "LW": D["LW"], "LEVEL": D["LEVEL"],
            "OUT_TABLE": V8["OUT_TABLE"], "RUNNER_FIT": V8["RUNNER_FIT"], "HITTER_SPREAD": V8["HITTER_SPREAD"],
            "RUN_GAME": V8["RUN_GAME"], "SIM.A_BAR": V8["SIM"]["A_BAR"], "SIM.I_BAR_UMP": V8["SIM"]["I_BAR_UMP"],
            "SIM.I0_GRADE": V8["SIM"]["I0_GRADE"]}
    bad = [k for k, t in have.items() if t.get("college_d2") != t.get("college_d3") or "college_d2" not in t]
    check("app/engine_data.json carries college_d2 in every level table, equal to D3's", not bad, f"bad: {bad}" if bad else f"{len(have)} tables")
    check("app/engine_data.json lists its placeholder tables (PLACEHOLDER_D2), the engine's list",
          D.get("PLACEHOLDER_D2") == e.D2_PLACEHOLDERS, f"{D.get('PLACEHOLDER_D2')}")
    webd = [f for f in ("engine.js", "engine_data.json") if open(os.path.join(HERE, "app", f), "rb").read() != open(os.path.join(HERE, "web", "lib", f), "rb").read()]
    check("web/lib has the app's engine.js and engine_data.json", not webd, f"differ: {webd}")

    # 2. validation
    a = py_ars()
    try:
        e.check_inputs(a, e.Situation(0, 0, 0, (False,) * 3, level="college_d2")); ok_py = True
    except ValueError as ex:
        ok_py = str(ex)
    try:
        e.check_inputs(a, e.Situation(0, 0, 0, (False,) * 3, level="college_d4")); bad_py = False
    except ValueError:
        bad_py = True
    jv = js("""const ars = inp.map((d) => E.Pitch(Object.assign({}, d))); const res = {};
for (const lv of ["college_d2", "college_d4"]) { try { E.callV08(ars, E.Situation({ balls: 0, strikes: 0, outs: 0, bases: [false, false, false], level: lv }), { rng: () => 0.5 }); res[lv] = "ok"; } catch (err) { res[lv] = String(err.message || err); } }
process.stdout.write(JSON.stringify(res));""", ARS)
    check("validation: both engines take college_d2 and still refuse an unknown level",
          ok_py is True and bad_py and jv["college_d2"] == "ok" and "unknown level" in jv["college_d4"], f"Python {ok_py}/{bad_py}, JS {jv}")

    # 3. D2 = D3 (placeholder) and Python = JS at D2
    sp = spots(12, 2026)
    p2 = [py_call(x, "college_d2") for x in sp]
    p3 = [py_call(x, "college_d3") for x in sp]
    check("PLACEHOLDER_D2: Python's D2 calls are exactly its D3 calls (12 random spots, full calls, win tables)", p2 == p3)
    j2 = js(JS_CALL, {"spots": sp, "ars": ARS, "level": "college_d2"})
    j3 = js(JS_CALL, {"spots": sp, "ars": ARS, "level": "college_d3"})
    check("PLACEHOLDER_D2: the JS engine's D2 calls are exactly its D3 calls", j2 == j3)
    worst, same_pick = 0.0, True
    for a_, b_ in zip(p2, j2):
        if [x[1:] for x in a_] != [x[1:] for x in b_]:
            same_pick = False
        for x, y in zip(a_, b_):
            worst = max(worst, abs(x[0] - y[0]))
    check("Python = JS at D2: the same calls in the same order, probabilities within 1e-9", same_pick and worst <= 1e-9, f"largest difference {worst:.2e}")
    u2, u3 = e.ump_estimate([(1, 0.4, 0.1), (0, 0.6, 0.12)], "college_d2"), e.ump_estimate([(1, 0.4, 0.1), (0, 0.6, 0.12)], "college_d3")
    check("umpire estimate and run scale at D2 are D3's", u2 == u3 and e.run_scale("college_d2") == e.run_scale("college_d3"))

    # 4. the release guard
    r = subprocess.run([sys.executable, "release_guard_d2.py"], cwd=HERE, capture_output=True, text=True)
    out = r.stdout
    check("release_guard_d2.py trips today (exit 1) and names the engine tables, the data list and the code markers",
          r.returncode == 1 and "D2_PLACEHOLDERS" in out and "app/engine_data.json" in out and "app/engine.js" in out,
          f"exit {r.returncode}, {len(out.splitlines()) - 1} findings")
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, "app"))
        open(os.path.join(d, "app", "engine_data.json"), "w", encoding="utf8").write(json.dumps({"RE": {}}))
        open(os.path.join(d, "engine.py"), "w", encoding="utf8").write("x = 1\n")
        clean = guard.findings(d, [])
        open(os.path.join(d, "app", "engine_data.json"), "w", encoding="utf8").write(json.dumps({guard.MARK: ["RE"]}))
        data_hit = guard.findings(d, [])
        open(os.path.join(d, "app", "engine_data.json"), "w", encoding="utf8").write(json.dumps({"RE": {}}))
        open(os.path.join(d, "engine.py"), "w", encoding="utf8").write("x = 1   # " + guard.MARK + "\n")
        code_hit = guard.findings(d, [])
        eng_hit = guard.findings(os.path.join(d, "app"), ["RE"])
    check("the guard itself: a tree with no placeholders passes; a data list, one code marker or an engine list each trip it",
          clean == [] and len(data_hit) == 1 and len(code_hit) == 1 and len(eng_hit) == 1, f"{clean} / {data_hit} / {code_hit} / {eng_hit}")

    n_bad = sum(1 for _, ok in results if not ok)
    print(f"\n{len(results) - n_bad}/{len(results)} checks passed")
    sys.exit(1 if n_bad else 0)


if __name__ == "__main__":
    main()
