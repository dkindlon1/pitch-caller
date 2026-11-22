"""v1.3 Part 2: the engines read the zone table, the count layer and the run values from versioned files (docs/TABLES_v13.md).

- Each shipped file (data_tables/zone_v12.json, count_v12.json, run_v12.json) loads, passes the format check, is the
  default version, and equals what data_tables/build_v12.py builds from the v1.2 sources; app/engine_data.json (and the
  web copy) carry the same tables. A broken file is refused with a message naming the missing piece.
- The shipped files reproduce v1.2 bit for bit: outcome probabilities (every band), ball-in-play values, count kappas, run
  scale, count stakes and full calls are identical to `git archive 90fca9b` (the v1.3 prework tip, tables still literals),
  in Python and in JS.
  v1.3 core (feat/hitter-v13-core, the shared refit merged in): the v12 files are still built from the v1.2 sources (git
  90fca9b, build_v12.V12_SOURCE); the refit's numbers live in the *_v13refit.json files (data_tables/build_v13refit.py),
  and with those selected the merged engines are bit for bit the refit tip 21f44ac (numbers as literals). That is the
  bit-for-bit check here now; the v1.2 engine itself no longer exists on this branch (the refit changed its literals).
- The engines read the files: a scratch copy with one value changed (a zone cell, a zone class term, a per-level zone
  override, a count term, a called-strike kappa, a base-out swing offset, a ground-ball-by-count offset, an in-play table,
  a run expectancy, a walk value), picked by PITCH_ZONE_TABLE / PITCH_COUNT_TABLE / PITCH_RUN_TABLE, moves exactly the
  numbers it should and changes a call; the rest stay put.
- Python = JS on the shipped tables and on a perturbed set (app/export_data.py --out writes the scratch engine data).
- College D2: the run values and in-play tables stay D3's placeholders (release_guard_d2.py still trips).

  python3 tests_v13_tables.py      -> runs every check, exits non-zero on a failure
"""
import copy, io, json, os, random, subprocess, sys, tarfile, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as e
sys.path.insert(0, os.path.join(HERE, "data_tables"))
import build_v12
import build_v13refit

BASE = "21f44ac"            # feat/hitter-v13-refit tip: the shared refit's numbers as literals in both engines
REFIT_ENV = {"PITCH_ZONE_TABLE": "v13refit", "PITCH_COUNT_TABLE": "v13refit", "PITCH_RUN_TABLE": "v13refit"}
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok)))
    print(f"  {'ok  ' if ok else 'FAIL'} {name}" + (f"  ({detail})" if detail else ""), flush=True)


LEVELS = ["mlb", "college_d1", "college_d2", "college_d3", "hs", "travel"]
QUADS = ["up-in", "up-away", "down-in", "down-away", "chase", "middle", "down-middle"]
ARS = [[dict(name="Fastball", kind="FB", grade=3, command=4, conf=0.8, shape="rides", velo=90),
        dict(name="Sweeper", kind="SL", grade=4, command=3, conf=0.72, shape="sweeper", velo=80),
        dict(name="Splitter", kind="CH", grade=3, command=3, conf=0.65, shape="split", velo=82),
        dict(name="Curve", kind="CB", grade=3, command=2, conf=0.6, shape="", velo=76)],
       [dict(name="Sinker", kind="SI", grade=3, command=3, conf=0.75, shape="run", velo=89),
        dict(name="Cutter", kind="FC", grade=3, command=3, conf=0.7, shape="", velo=86),
        dict(name="Slider", kind="SL", grade=3, command=3, conf=0.7, shape="tight", velo=81),
        dict(name="Changeup", kind="CH", grade=3, command=3, conf=0.62, shape="fade", velo=80)]]

# --- one runner per engine: the same cases in, every number out (json floats are exact) -------------------------------
PY_RUN = r"""
import json, sys
from dataclasses import replace
import engine as e
inp = json.load(sys.stdin)
def ars(i):
    a = [e.Pitch(d["name"], d["kind"], d["grade"], d["command"], d["conf"], shape=d["shape"], velo=d["velo"]) for d in inp["ars"][i]]
    e.resolve_speeds(a)
    return a
def sit(c):
    return e.Situation(c["b"], c["k"], c["o"], tuple(c["bases"]), level=c["lv"], same_side=c["same"], pitch_count=c["pc"],
                       inning=c.get("inning", 1), margin=c.get("margin", 0))
out = {"cases": [], "calls": [], "extras": {}}
for c in inp["cases"]:
    a = ars(c["a"]); p = a[c["i"]]; s = sit(c); z = {}
    op = e.outcome_probs(p, c["q"], s, a, zout=z)
    ipv = [e.in_play_value_typed(cc, p, c["q"], s) for cc in ("weak", "solid", "hard")]
    out["cases"].append({"op": op, "z": {k: {f: v[f] for f in ("L", "S", "C", "W", "F", "H")} for k, v in z.items()},
                         "ipv": ipv, "kap": e.count_kappa(c["b"], c["k"], c["lv"])})
for c in inp["calls"]:
    a = ars(c["a"]); s = sit(c)
    tab = e.solve_table(a, replace(s, balls=0, strikes=0, last=None))
    pick, dist = e.call_v08(a, s, rng=None, tab=tab)[:2]
    out["calls"].append([[pr, x.name, q] for pr, _, x, q in dist])
for lv in inp["levels"]:
    out["extras"][lv] = {"run_scale": e.run_scale(lv), "stakes": [e.count_stakes(b, k, lv) for k in range(3) for b in range(4)]}
print(json.dumps(out))
"""
JS_RUN = r"""
const E = require('./app/engine.js'); E.init(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')));
const inp = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const ars = (i) => { const a = inp.ars[i].map((d) => E.Pitch(Object.assign({}, d))); E.resolveSpeeds(a); return a; };
const sit = (c) => E.Situation({ balls: c.b, strikes: c.k, outs: c.o, bases: c.bases, level: c.lv, same_side: c.same, pitch_count: c.pc, inning: c.inning || 1, margin: c.margin || 0 });
const out = { cases: [], calls: [], extras: {} };
for (const c of inp.cases) {
  const a = ars(c.a), p = a[c.i], s = sit(c), z = {};
  const op = E.outcomeProbs(p, c.q, s, a, null, null, null, z);
  const zz = {}; for (const k in z) { zz[k] = {}; for (const f of ["L", "S", "C", "W", "F", "H"]) zz[k][f] = z[k][f]; }
  out.cases.push({ op, z: zz, ipv: ["weak", "solid", "hard"].map((cc) => E.v08.inPlayValueTyped(cc, p, c.q, s)), kap: E.v08.countKappa(c.b, c.k, c.lv) });
}
for (const c of inp.calls) {
  const a = ars(c.a), s = sit(c);
  const tab = E.v08.solveTable(a, Object.assign({}, s, { balls: 0, strikes: 0, last: null }));
  const r = E.v08.callV08(a, s, { rng: () => 0.5, tab });
  out.calls.push(r.dist.map((d) => [d.prob, d.pitch.name, d.quad]));
}
for (const lv of inp.levels) {
  const st = []; for (let k = 0; k < 3; k++) for (let b = 0; b < 4; b++) st.push(E.countStakes(b, k, lv));
  out.extras[lv] = { run_scale: E.runScale(lv), stakes: st };
}
process.stdout.write(JSON.stringify(out));
"""


def run_py(tree, inp, env=None):
    r = subprocess.run([sys.executable, "-c", PY_RUN], cwd=tree, input=json.dumps(inp), capture_output=True, text=True,
                       env=dict(os.environ, PYTHONUTF8="1", **(env or {})))
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-3000:])
    return r.stdout.strip()


def run_js(tree, inp, data_path=None):
    r = subprocess.run(["node", "-e", JS_RUN, data_path or os.path.join(tree, "app", "engine_data.json")], cwd=tree,
                       input=json.dumps(inp), capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-3000:])
    return r.stdout


def export(env, path):
    r = subprocess.run([sys.executable, "app/export_data.py", "--out", path], cwd=HERE, capture_output=True, text=True,
                       env=dict(os.environ, PYTHONUTF8="1", **env))
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-3000:])


def cases(n, seed):
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        out.append(dict(lv=rng.choice(LEVELS), b=rng.randint(0, 3), k=rng.randint(0, 2), o=rng.randint(0, 2),
                        bases=[rng.random() < 0.35, rng.random() < 0.3, rng.random() < 0.25], same=rng.random() < 0.5,
                        pc=rng.randint(0, 110), a=rng.randrange(2), i=rng.randrange(4), q=rng.choice(QUADS)))
    return out


def calls(n, seed):
    rng = random.Random(seed)
    return [dict(lv=rng.choice(LEVELS), b=rng.randint(0, 3), k=rng.randint(0, 2), o=rng.randint(0, 2),
                 bases=[rng.random() < 0.35, rng.random() < 0.3, rng.random() < 0.25], same=rng.random() < 0.5,
                 pc=rng.randint(0, 100), a=rng.randrange(2), inning=rng.randint(1, 9), margin=rng.randint(-3, 3)) for _ in range(n)]


def worst(a, b):
    """largest |difference| between two runner outputs (inf when the structure or a call's order differs)"""
    w = 0.0
    def walk(x, y):
        nonlocal w
        if isinstance(x, dict):
            if set(x) != set(y):
                w = float("inf"); return
            for k in x:
                walk(x[k], y[k])
        elif isinstance(x, list):
            if len(x) != len(y):
                w = float("inf"); return
            for u, v in zip(x, y):
                walk(u, v)
        elif isinstance(x, str):
            if x != y:
                w = float("inf")
        else:
            w = max(w, abs(x - y))
    walk(a, b)
    return w


def zone_candidate_checks(tmp, js_ship_inp, js_ship):
    """hitter_data/zone_candidate.py on a synthetic seed (planted ratios, synthetic location mix): the conversion reproduces
    the planted ratios in the engine, follows plan section 11 (no flat chase / hanger, no gated hanger), leaves the default
    untouched, and the written file loads in both engines (Python = JS) and moves calls. The real candidate
    (C:/dev/pitchiq-data/fits/candidates/zone_v13prov.json) gets the load / parity checks too when it is on disk."""
    import numpy as np
    import pandas as pd
    from hitter_data import zone_candidate as zc
    from hitter_data.zone_defs import BANDS, COUNT_GROUPS, HEIGHTS, PROFILES, count_group
    rng = np.random.default_rng(5)
    rows = [dict(b=b, s=s, band=z, ht=h, prof=p, w=1.0, n=float(rng.integers(1, 60)), sw=float(rng.integers(1, 30)),
                 con=float(rng.integers(1, 20)), evn=float(rng.integers(1, 10)))
            for s in range(3) for b in range(4) for z in BANDS for h in HEIGHTS for p in PROFILES]
    P = pd.DataFrame(rows)
    import zlib
    planted = lambda o, g, z, p: float(np.exp(0.25 * np.sin(zlib.crc32(f"{o}{g}{z}{p}".encode()) % 1000)))   # x0.78 to x1.28
    base = json.load(open(os.path.join(HERE, "data_tables", "zone_v12.json"), encoding="utf8"))
    W = {o: zc.weights(P, o) for o in zc.CARRIED}
    before = zc.rows_with(e, base, "college_d1")
    l0 = zc.rows_with(e, zc.stage0_table(base), "college_d1")
    cand, info = zc.build_candidate(planted, W, before, l0, base, version="synthetic")
    after = zc.rows_with(e, cand, "college_d1")
    try:
        e.check_table(cand, "candidate"); ok_fmt = True
    except ValueError:
        ok_fmt = False
    check("zone candidate: the file passes the format check, version set, level_cells empty", ok_fmt and cand["version"] == "synthetic" and cand["level_cells"] == {})
    check("zone candidate follows plan section 11: class.chase_os and class.hanger_hard are 0, no other class term changed, no gated-hanger key",
          cand["class"]["chase_os"] == {"off": 0.0, "noncomp": 0.0} and cand["class"]["hanger_hard"] == 0.0
          and {k: v for k, v in cand["class"].items() if k not in ("chase_os", "hanger_hard")} == {k: v for k, v in base["class"].items() if k not in ("chase_os", "hanger_hard")}
          and set(cand) == set(base))
    cs0 = all(v == 0.0 for z in cand["cells"]["cstrike"].values() for p in z.values() for g in p.values() for v in g.values())
    same_h = all(len(set(cand["cells"][o][z][p][g].values())) == 1 for o in zc.CARRIED for z in BANDS for p in PROFILES for g in COUNT_GROUPS)
    check("zone candidate: called-strike cells stay 0 (no seed table), each (band, profile, count group) offset is the same at every height",
          cs0 and same_h)
    # reproduction: the engine with the candidate gives pbar(count) x planted ratio, data-weighted over the group's counts
    worst_r = 0.0
    for o in zc.CARRIED:
        w = W[o]
        pbar = {}
        for b, s in [(b, s) for s in range(3) for b in range(4)]:
            ks = [k for k in w if k[0] == b and k[1] == s]
            pbar[(b, s)] = sum(w[k] * before[k][o] for k in ks) / sum(w[k] for k in ks)
        for g in COUNT_GROUPS:
            for z in BANDS:
                for p in PROFILES:
                    ks = [k for k in w if count_group(k[0], k[1]) == g and k[2] == z and k[4] == p]
                    eng = sum(w[k] * after[k][o] for k in ks) / sum(w[k] for k in ks)
                    tgt = sum(w[k] * pbar[(k[0], k[1])] * planted(o, g, z, p) for k in ks) / sum(w[k] for k in ks)
                    worst_r = max(worst_r, abs(eng / tgt - 1))
    check("zone candidate reproduces the planted ratios in the engine (swing, whiff, foul, hard; every band x profile x count group; within 10%)",
          worst_r < 0.10, f"largest relative error {worst_r:.3f}")
    again = zc.rows_with(e, base, "college_d1")
    check("zone candidate: swapping the candidate in and out leaves the default engine bit for bit (use_zone_table restores the default)",
          again == before and e.TABLE_VERSIONS["zone"] == e.TABLE_DEFAULT["zone"])
    import types
    from hitter_data import refit_all as ra
    names = [n for n, _, _, _ in ra.STEPS]
    args = types.SimpleNamespace(skip_ingest=False, skip_zone=False, force_zone=False)
    same = {n: r for n, _, _, r in ra.plan(args, {"statcast_fingerprint": "a"}, "a")}
    new = {n: r for n, _, _, r in ra.plan(args, {"statcast_fingerprint": "a"}, "b")}
    check("refit_all: zone_candidate runs right after the zone step, and only when it runs",
          names.index("zone_candidate") == names.index("zone") + 1 and same["zone_candidate"] is not None and new["zone_candidate"] is None)
    # the written file in both engines
    targets =[("synthetic candidate", os.path.join(tmp, "zone_synthetic.json"))]
    with open(targets[0][1], "w", encoding="utf8", newline="\n") as f:
        json.dump(cand, f)
    if os.path.exists(zc.OUT):
        targets.append(("real candidate zone_v13prov.json", zc.OUT))
    for name, path in targets:
        env = dict(REFIT_ENV, **{e.TABLE_ENV["zone"]: path})
        dpath = os.path.join(tmp, f"engine_data_{len(results)}.json")
        export(env, dpath)
        pz, jz = json.loads(run_py(HERE, js_ship_inp, env)), json.loads(run_js(HERE, js_ship_inp, dpath))
        w = worst(pz, jz)
        check(f"{name}: loads in Python (PITCH_ZONE_TABLE) and JS (export_data --out); Python = JS on 300 cases and 8 calls (within 1e-9)",
              w <= 1e-9 and json.load(open(dpath, encoding="utf8"))["TABLES"]["versions"]["zone"] == json.load(open(path, encoding="utf8"))["version"],
              f"largest difference {w:.1e}")
        check(f"{name}: calls change vs v12 (expected: a new zone table)", worst(jz["calls"], js_ship["calls"]) > 1e-6)


def main():
    tmp = tempfile.mkdtemp(prefix="v13tables_")
    # 1. the files ------------------------------------------------------------------------------------------------------
    for kind in ("zone", "count", "run"):
        path = os.path.join(HERE, "data_tables", f"{kind}_v12.json")
        t = json.load(open(path, encoding="utf8"))
        try:
            e.check_table(t, path); ok = True; msg = f"version {t['version']}"
        except ValueError as ex:
            ok, msg = False, str(ex)
        check(f"data_tables/{kind}_v12.json loads and passes the format check", ok and t["kind"] == kind, msg)
        check(f"{kind}_v12.json equals what data_tables/build_v12.py builds from the v1.2 sources (git {build_v12.V12_SOURCE})", t == json.loads(build_v12.dumps(build_v12.BUILD[kind]())))
        tr = json.load(open(os.path.join(HERE, "data_tables", f"{kind}_v13refit.json"), encoding="utf8"))
        try:
            e.check_table(tr, kind); ok = True
        except ValueError:
            ok = False
        check(f"{kind}_v13refit.json passes the format check and equals what data_tables/build_v13refit.py builds from the refit sources",
              ok and tr == json.loads(build_v12.dumps(build_v13refit.BUILD[kind]())))
    check("the engine loads TABLE_DEFAULT's files when no override is set",
          e.TABLE_VERSIONS == e.TABLE_DEFAULT and not any(os.environ.get(v) for v in e.TABLE_ENV.values())
          and all(e.TABLES[k] == json.load(open(e.table_path(k), encoding="utf8")) for k in e.TABLES), f"{e.TABLE_VERSIONS}")
    D = json.load(open(os.path.join(HERE, "app", "engine_data.json"), encoding="utf8"))
    cnt_js = {lv: {k: v for k, v in L.items() if k not in ("out_table", "runner")} for lv, L in e.TABLES["count"]["levels"].items()}
    ok = (D.get("TABLES", {}).get("versions") == e.TABLE_VERSIONS and D["TABLES"]["zone"] == e.TABLES["zone"]
          and D["TABLES"]["count"]["levels"] == cnt_js
          and all(D["V08"]["OUT_TABLE"][lv] == L["out_table"] and D["V08"]["RUNNER_FIT"][lv] == L["runner"]
                  for lv, L in e.TABLES["count"]["levels"].items() if "out_table" in L)
          and all(D["RE"][lv] == L["re"] and D["CV"][lv] == L["cv"] and D["LW"][lv] == [L["lw"]["bb"], L["lw"]["k"]]
                  for lv, L in e.TABLES["run"]["levels"].items()))
    check("app/engine_data.json carries the same tables and their versions (zone, count layer, in-play, RE / CV / LW)", ok)
    same_web = open(os.path.join(HERE, "app", "engine_data.json"), "rb").read() == open(os.path.join(HERE, "web", "lib", "engine_data.json"), "rb").read()
    check("web/lib/engine_data.json is the app's copy", same_web)
    bad = []
    for kind, mutate in (("zone", lambda t: t["cells"]["whiff"]["edge"]["CB"].pop("ahead")),
                         ("count", lambda t: t["levels"]["hs"]["swing"].pop("2-1")),
                         ("run", lambda t: t["levels"]["mlb"]["re"].pop("2|123"))):
        t = copy.deepcopy(e.TABLES[kind]); mutate(t)
        try:
            e.check_table(t, f"{kind}_broken.json"); bad.append(f"{kind}: accepted")
        except ValueError as ex:
            if "docs/TABLES_v13.md" not in str(ex):
                bad.append(f"{kind}: {ex}")
    check("a file with a missing cell / count / base-out state is refused, naming what is missing", not bad, "; ".join(bad))
    r = subprocess.run([sys.executable, "-c", "import engine"], cwd=HERE, capture_output=True, text=True,
                       env=dict(os.environ, PITCH_ZONE_TABLE="v99"))
    check("an unknown version is an import error naming the file it looked for (no silent fallback)",
          r.returncode != 0 and "zone_v99.json" in r.stderr)

    # 2. the refit bit for bit: the refit tip (numbers as literals) vs the v13refit files, Python and JS -----------------
    base = os.path.join(tmp, "base")
    os.makedirs(base)
    blob = subprocess.run(["git", "archive", BASE], cwd=HERE, capture_output=True, check=True).stdout
    tarfile.open(fileobj=io.BytesIO(blob)).extractall(base, filter="data")
    inp = {"ars": ARS, "cases": cases(400, 13), "calls": calls(10, 14), "levels": LEVELS}
    py_new, py_old = run_py(HERE, inp, REFIT_ENV), run_py(base, inp)
    check(f"Python with the v13refit tables: {len(inp['cases'])} outcome cases (every band, in-play values, kappas), {len(inp['calls'])} full "
          f"calls, run scale and count stakes at {len(LEVELS)} levels are bit for bit {BASE}'s", py_new == py_old,
          "" if py_new == py_old else f"largest difference {worst(json.loads(py_new), json.loads(py_old)):.2e}")
    refit_data = os.path.join(tmp, "engine_data_v13refit.json")
    export(REFIT_ENV, refit_data)
    js_new, js_old = run_js(HERE, inp, refit_data), run_js(base, inp)
    check(f"JS with the v13refit tables: the same cases and calls are bit for bit {BASE}'s (engine.js + engine_data.json)", js_new == js_old,
          "" if js_new == js_old else f"largest difference {worst(json.loads(js_new), json.loads(js_old)):.2e}")
    w = worst(json.loads(py_new), json.loads(js_new))
    check("Python = JS on the v13refit tables (within 1e-9, the parity tolerance)", w <= 1e-9, f"largest difference {w:.1e}")
    w = worst(json.loads(run_py(HERE, inp)), json.loads(run_js(HERE, inp)))
    check("Python = JS on the default tables (app/engine_data.json; within 1e-9)", w <= 1e-9, f"largest difference {w:.1e}")

    # 3. the engines read the files: one value changed in a scratch copy --------------------------------------------------
    P = dict(lv="college_d1", o=0, bases=[False, False, False], same=True, pc=30, a=0)
    probes = [dict(P, b=0, k=0, i=0, q="up-in"),          # 0 four-seam up, first pitch
              dict(P, b=0, k=0, i=0, q="down-in"),        # 1 four-seam down, first pitch
              dict(P, b=1, k=1, i=1, q="middle"),         # 2 sweeper over the middle (hanger)
              dict(P, lv="college_d3", b=0, k=0, i=0, q="up-in"),   # 3 D3
              dict(P, b=1, k=1, i=2, q="down-away"),      # 4 splitter down (called strike on the edge)
              dict(P, lv="hs", b=0, k=0, i=0, q="up-in"),          # 5 HS
              dict(P, b=0, k=0, i=0, q="up-in", o=1, bases=[False, True, False]),   # 6 runner on second
              dict(P, b=1, k=1, i=0, q="up-in")]          # 7 four-seam up at 1-1
    spots = [dict(P, b=0, k=0, inning=3), dict(P, b=1, k=1, inning=3), dict(P, lv="hs", b=0, k=0, inning=3),
             dict(P, b=1, k=1, o=1, bases=[False, True, False], inning=3)]
    SPOT_TEXT = ["D1 0-0", "D1 1-1", "HS 0-0", "D1 1-1 with a runner on second"]
    pin = {"ars": ARS, "cases": probes, "calls": spots, "levels": ["college_d1", "college_d3"]}
    ref = json.loads(run_py(HERE, pin, REFIT_ENV))
    REFIT_T = {k: json.load(open(e.table_path(k, "v13refit"), encoding="utf8")) for k in ("zone", "count", "run")}

    def perturbed(kind, mutate, tag):
        # perturbations start from the v13refit files (whatever the default is), with the other two kinds on v13refit too
        t = copy.deepcopy(REFIT_T[kind]); t["version"] = f"scratch-{tag}"; mutate(t)
        path = os.path.join(tmp, f"{kind}_{tag}.json")
        with open(path, "w", encoding="utf8", newline="\n") as f:
            json.dump(t, f)
        return path

    def zcopy(t):
        t["level_cells"]["hs"] = copy.deepcopy(t["cells"]); t["level_cells"]["hs"]["swing"]["heart"]["FB"]["first"]["up"] += 1.0

    def gbk(t):
        t["levels"]["college_d1"]["bip_gb"]["1-1"] = 0.5

    def otab(t):
        g = t["levels"]["college_d1"]["out_table"]["hard"]["FB"]; g[0] -= 0.05; g[4] += 0.05

    S = lambda r, i, z="heart": r["cases"][i]["z"][z]["S"]
    tests = [
        ("zone", "cells.swing.heart.FB.first.up +1.0", lambda t: t["cells"]["swing"]["heart"]["FB"]["first"].__setitem__("up", 1.0),
         lambda r: S(r, 0) != S(ref, 0) and S(r, 3) != S(ref, 3) and S(r, 1) == S(ref, 1) and S(r, 0, "edge") == S(ref, 0, "edge"),
         "moves the four-seam-up first-pitch heart swing at D1 and D3; down and the edge band stay", 0),
        ("zone", "level_cells.hs (the cells with heart.FB.first.up +1.0)", zcopy,
         lambda r: S(r, 5) != S(ref, 5) and S(r, 0) == S(ref, 0), "moves HS only", 2),
        ("zone", "class.hanger_hard 0.5 -> 0", lambda t: t["class"].__setitem__("hanger_hard", 0.0),
         lambda r: r["cases"][2]["z"]["heart"]["H"] < ref["cases"][2]["z"]["heart"]["H"] and r["cases"][0]["z"]["heart"]["H"] == ref["cases"][0]["z"]["heart"]["H"],
         "off-speed over the heart is hit hard less; the four-seam is untouched", 1),
        ("count", "levels.college_d1.swing.0-0.heart -0.4 -> 0", lambda t: t["levels"]["college_d1"]["swing"]["0-0"].__setitem__("heart", 0.0),
         lambda r: S(r, 0) > S(ref, 0) and S(r, 3) == S(ref, 3) and S(r, 0, "edge") == S(ref, 0, "edge"), "D1's first-pitch heart swing up; D3 and the edge stay", 0),
        ("count", "levels.college_d1.cstrike.1-1 +0.5", lambda t: t["levels"]["college_d1"]["cstrike"].__setitem__("1-1", t["levels"]["college_d1"]["cstrike"]["1-1"] + 0.5),
         lambda r: r["cases"][4]["z"]["edge"]["C"] > ref["cases"][4]["z"]["edge"]["C"] and r["cases"][4]["kap"] == ref["cases"][4]["kap"] + 0.5
         and r["cases"][0]["kap"] == ref["cases"][0]["kap"], "the 1-1 called strike on the edge rises; 0-0 stays", 1),
        ("count", "levels.college_d1.swing_base_out.1|020 +0.5", lambda t: t["levels"]["college_d1"]["swing_base_out"].__setitem__("1|020", 0.5),
         lambda r: S(r, 6) > S(ref, 6) and S(r, 0) == S(ref, 0), "swings rise with one out and a runner on second only", 3),
        ("count", "levels.college_d1.bip_gb.1-1 +0.5 (varies by count)", gbk,
         lambda r: r["cases"][7]["ipv"] != ref["cases"][7]["ipv"] and r["cases"][0]["ipv"] == ref["cases"][0]["ipv"],
         "ball-in-play values move at 1-1, not at 0-0", 1),
        ("count", "levels.college_d1.out_table.hard.FB: .05 of outs -> home runs", otab,
         lambda r: r["cases"][0]["ipv"][2] > ref["cases"][0]["ipv"][2] and r["cases"][0]["ipv"][0] == ref["cases"][0]["ipv"][0]
         and r["cases"][3]["ipv"] == ref["cases"][3]["ipv"], "hard contact is worth more at D1; weak contact and D3 stay", 1),
        ("run", "levels.college_d1.re.0|000 0.7 -> 0.9", lambda t: t["levels"]["college_d1"]["re"].__setitem__("0|000", 0.9),
         lambda r: r["extras"]["college_d1"]["run_scale"] > ref["extras"]["college_d1"]["run_scale"] and r["extras"]["college_d3"] == ref["extras"]["college_d3"],
         "D1's run scale rises; D3's stays", 1),
        ("run", "levels.college_d1.lw.bb +0.1", lambda t: t["levels"]["college_d1"]["lw"].__setitem__("bb", t["levels"]["college_d1"]["lw"]["bb"] + 0.1),
         lambda r: r["extras"]["college_d1"]["stakes"][3] > ref["extras"]["college_d1"]["stakes"][3] and r["extras"]["college_d3"] == ref["extras"]["college_d3"],
         "the 3-0 stakes at D1 rise (a walk is worth more); D3 stays", 1),
    ]
    for kind, what, mutate, ok_fn, says, sp in tests:
        path = perturbed(kind, mutate, f"t{len(results)}")
        r = json.loads(run_py(HERE, pin, dict(REFIT_ENV, **{e.TABLE_ENV[kind]: path})))
        moved = worst(r["calls"][sp], ref["calls"][sp])
        check(f"{kind} file, {what}: {says}; the {SPOT_TEXT[sp]} call changes", ok_fn(r) and moved > 1e-12,
              "the call's ranking changed" if moved == float("inf") else f"call probabilities moved by up to {moved:.1e}")

    # 4. Python = JS on a perturbed set (all three files changed at once) ----------------------------------------------
    def zmix(t):
        c = t["cells"]
        c["swing"]["off"]["SW"]["two"]["down"] = 0.4; c["whiff"]["heart"]["CH"]["ahead"]["mid"] = -0.3
        c["hard"]["heart"]["SL"]["even"]["mid"] = -0.5; c["foul"]["edge"]["FB"]["two"]["up"] = 0.2
        c["cstrike"]["edge"]["SP"]["even"]["down"] = 0.3; t["class"]["hanger_hard"] = 0.0; t["base"]["swing"]["heart"] = 0.70
        zcopy(t)

    def cmix(t):
        for lv in ("college_d1", "hs", "college_d2", "mlb"):
            L = t["levels"][lv]
            L["swing"]["1-1"]["edge"] = 0.15; L["whiff"]["0-2"]["off"] = 0.2; L["foul"]["1-2"]["heart"] = 0.4
            L["hard"]["2-0"]["heart"] = 0.25; L["cstrike"]["0-0"] += 0.1; L["swing_base_out"]["0|100"] = -0.1
            L["bip_gb"]["0-1"] = 0.3; L["bip_gb"]["2-2"] = -0.2
        otab(t)

    def rmix(t):
        t["levels"]["college_d3"]["re"]["0|000"] = 1.0; t["levels"]["hs"]["cv"]["3-2"] = 0.13
        t["levels"]["mlb"]["lw"]["k"] = -0.3

    env = {e.TABLE_ENV["zone"]: perturbed("zone", zmix, "mix"), e.TABLE_ENV["count"]: perturbed("count", cmix, "mix"),
           e.TABLE_ENV["run"]: perturbed("run", rmix, "mix")}
    dpath = os.path.join(tmp, "engine_data_mix.json")
    export(env, dpath)
    Dm = json.load(open(dpath, encoding="utf8"))
    check("app/export_data.py --out writes the overridden tables (versions scratch-mix) for the JS engine",
          Dm["TABLES"]["versions"] == {"zone": "scratch-mix", "count": "scratch-mix", "run": "scratch-mix"})
    inp2 = {"ars": ARS, "cases": cases(300, 21), "calls": calls(8, 22), "levels": LEVELS}
    pm, jm = json.loads(run_py(HERE, inp2, env)), json.loads(run_js(HERE, inp2, dpath))
    js_ship = json.loads(run_js(HERE, inp2, refit_data))
    w = worst(pm, jm)
    check("Python = JS on the perturbed tables: 300 outcome cases, 8 full calls, run scale and stakes (within 1e-9)", w <= 1e-9, f"largest difference {w:.1e}")
    check("the JS engine reads them too: its numbers on the perturbed data differ from the shipped data's",
          worst(jm["cases"], js_ship["cases"]) > 1e-6 and worst(jm["calls"], js_ship["calls"]) > 1e-6)

    # 4b. the zone candidate (hitter_data/zone_candidate.py): synthetic seed -> candidate file -> both engines ---------------
    zone_candidate_checks(tmp, js_ship_inp=inp2, js_ship=js_ship)

    # 5. D2 keeps its placeholders --------------------------------------------------------------------------------------
    need = {"RE", "CV", "LW", "OUT_TABLE", "RUNNER_FIT"}
    check("college D2: run values and in-play tables are still D3's placeholders (D2_PLACEHOLDERS), the count layer is v1.2's shared one",
          need <= set(e.D2_PLACEHOLDERS) and "college_d2" not in e.TABLES["run"]["levels"]
          and "out_table" not in e.TABLES["count"]["levels"]["college_d2"]
          and e.TABLES["count"]["levels"]["college_d2"]["swing"] == e.TABLES["count"]["levels"]["college_d3"]["swing"],
          f"{sorted(need & set(e.D2_PLACEHOLDERS))}")
    r = subprocess.run([sys.executable, "release_guard_d2.py"], cwd=HERE, capture_output=True, text=True)
    check("release_guard_d2.py still trips (exit 1)", r.returncode == 1)

    n_bad = sum(1 for _, ok in results if not ok)
    print(f"\n{len(results) - n_bad}/{len(results)} checks passed")
    sys.exit(1 if n_bad else 0)


if __name__ == "__main__":
    main()
