"""v1.3 (Drew's Nov 24 ruling 12): the per-count mean-preservation scalars (data_tables/mp_v13.json).

    python tests_v13_meanpreserve.py
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("PYTHONUTF8", "1")
import engine as e
import tests_v13_tables as TT
from hitter_data import mean_preserve as MP

RES = []


def check(name, ok, detail=""):
    RES.append(ok)
    print(("  ok   " if ok else "  FAIL ") + name + (f"  ({detail})" if detail else ""), flush=True)


def main():
    t = json.load(open(MP.MP_PATH, encoding="utf-8"))
    check("mp_v13.json passes the format check (every level, outcome and count) and is the engine's default",
          bool(e.check_table(t)) and e.TABLE_VERSIONS["mp"] == "v13")
    now = MP.inputs()
    stale = [k for k, v in t["inputs"].items() if now.get(k, {}).get("sha256") != v["sha256"]]
    check("mp_v13.json was computed from the files in this tree (count / zone tables, outcome_params, fits, reference data: sha256)",
          not stale, f"changed since: {stale}" if stale else f"{len(now)} inputs")

    # the scalars are a level shift: every band, zone cell, kind and speed in a count moves by the same logit
    v0 = e.load_table("mp", "v0")
    rows13 = {(lv, b, k): e.count_cells(lv, b, k) for lv in MP.LEVELS for b in range(4) for k in range(3)}
    old = e.use_mp_table(v0)
    rows0 = {key: e.count_cells(*key) for key in rows13}
    e.use_mp_table(old)
    worst = 0.0
    for key, (c13, k13, g13) in rows13.items():
        m = e.mp_cells(*key)
        for z in e.T_BANDS:
            for i in range(3):
                worst = max(worst, abs((c13[z][i] - rows0[key][0][z][i]) - m[i]))
            worst = max(worst, abs(c13[z][3] - rows0[key][0][z][3]))
        worst = max(worst, abs((k13 - rows0[key][1]) - m[3]), abs((g13 - rows0[key][2]) - m[4]))
    check("count_cells = the count table + the scalars, the same shift on every band (hard and base-out untouched)", worst < 1e-12,
          f"largest deviation {worst:.1e}")
    check("travel reads hs's scalars, 'college' reads D1's", e.mp_cells("travel", 3, 2) == e.mp_cells("hs", 3, 2)
          and e.mp_cells("college", 1, 1) == e.mp_cells("college_d1", 1, 1))

    # Python = JS with the shipped scalars
    tmp = tempfile.mkdtemp()
    dpath = os.path.join(tmp, "engine_data.json")
    TT.export({}, dpath)
    D = json.load(open(dpath, encoding="utf-8"))
    check("app/export_data.py ships the scalars to the JS engine (TABLES.mp, version v13)",
          D["TABLES"]["versions"].get("mp") == "v13" and D["TABLES"]["mp"]["levels"] == e.TABLES["mp"]["levels"])
    shipped = json.load(open(os.path.join(HERE, "app", "engine_data.json"), encoding="utf-8"))
    check("app/engine_data.json and web/lib/engine_data.json are the current export",
          shipped == D and shipped == json.load(open(os.path.join(HERE, "web", "lib", "engine_data.json"), encoding="utf-8")))
    inp = {"ars": TT.ARS, "cases": TT.cases(300, 31), "calls": TT.calls(24, 32), "levels": TT.LEVELS}
    py = json.loads(TT.run_py(HERE, inp))
    js = json.loads(TT.run_js(HERE, inp, dpath))
    w = TT.worst(py, js)
    check("Python = JS with mp_v13: 300 outcome cases, 24 full calls, run scale and stakes at 6 levels (within 1e-9)", w <= 1e-9,
          f"largest difference {w:.1e}")
    py0 = json.loads(TT.run_py(HERE, inp, {"PITCH_MP_TABLE": "v0"}))
    check("the scalars change the outcome model (mp_v13 vs mp_v0)", TT.worst(py["cases"], py0["cases"]) > 1e-4)

    # the proof: the reference world reproduces the fitted count layer at every count (fresh process, shipped file)
    p = subprocess.run([sys.executable, "-m", "hitter_data.mean_preserve", "verify"], cwd=HERE, capture_output=True, text=True,
                       env=dict(os.environ, PITCH_MP_TABLE="v13"))
    vr = json.load(open(os.path.join(MP.OUT_DIR, "verify_v13.json"), encoding="utf-8")) if p.returncode == 0 else {}
    for lv in MP.LEVELS:
        r = vr.get(lv)
        check(f"{lv}: the reference world gives back the fitted count layer at all 12 counts x 5 outcomes (within 1e-9)",
              bool(r) and r["max_abs_diff"] < 1e-9, f"max |engine - fitted| {r['max_abs_diff']:.1e}, {r['worst_diff_over_se']:.1e} sampling SE"
              if r else p.stderr[-300:])
    print(f"\n{sum(RES)}/{len(RES)} checks passed")
    return all(RES)


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
