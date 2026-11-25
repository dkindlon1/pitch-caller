"""Sim speed work (feat/sim-speed). Outputs only under C:/dev/pitchiq-data/speed (SPEED_OUT).

  python -m hitter_data.sim_speed profile LEVEL SEED      # cProfile one kgap_diag base game -> prof/LEVEL_SEED.{pstats,txt}
  python -m hitter_data.sim_speed capture LEVEL SEED      # every solve_table input of one game -> capture/LEVEL_SEED.pkl
  python -m hitter_data.sim_speed bench LEVEL SEED [K]    # time K captured solves; hash of the solved tables
  python -m hitter_data.sim_speed compare A B             # proof: byte-compare two engines' games (A, B = KGAP_OUT dirs)

The proof (proof.sh): the same 20 seeds per level played by the engine before (git archive of the base commit) and after,
through kgap_diag's worker with KGAP_KEEP_CSV=1, then every game's JSON and pitch log compared byte for byte.
"""
import cProfile
import io
import json
import os
import pstats
import sys
import time

SPEED_OUT = os.environ.get("SPEED_OUT", "C:/dev/pitchiq-data/speed")
os.environ.setdefault("KGAP_OUT", SPEED_OUT)           # kgap_diag reads real.json from here
os.environ.setdefault("KGAP_WEIGHTED", "1")            # the fixed core's weighted college count layers (as the live queue)


def profile(level, seed):
    from hitter_data import kgap_diag
    out = os.path.join(SPEED_OUT, "prof")
    gdir = os.path.join(out, f"games_{level}")
    os.makedirs(gdir, exist_ok=True)
    fp = os.path.join(gdir, f"game_{seed}.json")
    if os.path.exists(fp):
        os.remove(fp)
    pr = cProfile.Profile()
    t = time.perf_counter()
    pr.enable()
    kgap_diag.worker(level, "base", [int(seed)], gdir)
    pr.disable()
    wall = time.perf_counter() - t
    g = json.load(open(fp, encoding="utf-8"))
    pr.dump_stats(os.path.join(out, f"{level}_{seed}.pstats"))
    s = io.StringIO()
    st = pstats.Stats(pr, stream=s)
    s.write(f"{level} seed {seed}: {wall:.1f} s, {g['pitches']} pitches, {1000 * wall / g['pitches']:.1f} ms/pitch\n")
    st.sort_stats("tottime").print_stats(40)
    st.sort_stats("cumulative").print_stats(60)
    open(os.path.join(out, f"{level}_{seed}.txt"), "w", encoding="utf-8").write(s.getvalue())
    print(s.getvalue().splitlines()[0], flush=True)




def capture(level, seed, n_max=40):
    """record the (arsenal, situation) of every solve_table call in one base game -> capture/LEVEL_SEED.pkl"""
    import pickle
    from dataclasses import replace
    os.environ["LEVEL"] = level
    import engine
    from hitter_data import kgap_diag
    rec = []
    orig = engine.solve_table

    def spy(arsenal, s, *a, **k):
        if len(rec) < n_max:
            w = s.win and {kk: v for kk, v in s.win.items() if kk != "we"}     # the win lambda is rebuilt on load
            rec.append(pickle.dumps((arsenal, replace(s, win=w), a, k)))
        return orig(arsenal, s, *a, **k)
    engine.solve_table = spy
    gdir = os.path.join(SPEED_OUT, "capture", f"games_{level}")
    os.makedirs(gdir, exist_ok=True)
    fp = os.path.join(gdir, f"game_{seed}.json")
    if os.path.exists(fp):
        os.remove(fp)
    kgap_diag.worker(level, "base", [int(seed)], gdir)
    pickle.dump(rec, open(os.path.join(SPEED_OUT, "capture", f"{level}_{seed}.pkl"), "wb"))
    print(level, len(rec), "solves captured", flush=True)


def tab_fingerprint(tab):
    """every number a solved table holds, as exact float reprs"""
    return repr((tab.h0, tab.sweeps, sorted(tab.V.items()), sorted(tab.N.items()),
                 sorted((k, sorted(v.items())) for k, v in tab.sigma.items()), tab.residuals))


def load_solve(engine, blob):
    import pickle
    from dataclasses import replace
    arsenal, s, a, kw = pickle.loads(blob)
    if s.win:
        s0 = replace(s, win=None)
        s = replace(s, win=dict(s.win, we=lambda o, bases, m: engine.we_pitch(s0, o, bases, m)))
    return arsenal, s, a, kw


def bench(level, seed, k=6):
    """time the first k captured solves; print seconds per solve and a hash of the solved tables"""
    import hashlib
    import pickle
    os.environ["LEVEL"] = level
    import engine
    rec = pickle.load(open(os.path.join(SPEED_OUT, "capture", f"{level}_{seed}.pkl"), "rb"))[:k]
    h = hashlib.sha256()
    t = time.perf_counter()
    for blob in rec:
        arsenal, s, a, kw = load_solve(engine, blob)
        h.update(tab_fingerprint(engine.solve_table(arsenal, s, *a, **kw)).encode())
    dt = time.perf_counter() - t
    print(f"{level}: {dt / len(rec):.3f} s/solve over {len(rec)} solves, tables {h.hexdigest()[:16]}", flush=True)


def js_vs_py(level="college_d1", k=12, engine_dir=None):
    """option (a), measurement only: the same golden full-solve cases (golden_v10.json set to LEVEL) solved by this
    Python engine (or the one in engine_dir) and by app/engine.js under Node; seconds per solve and how many table
    values agree exactly / within the parity tolerance (1e-9)."""
    import subprocess
    from dataclasses import replace
    root = engine_dir or os.getcwd()
    sys.path[:0] = [root, os.path.join(root, "golden")]
    os.environ["LEVEL"] = level
    import engine as e
    import cases as G
    cs = [c for c in json.load(open(os.path.join(root, "golden", "golden_v10.json"), encoding="utf-8")) if c["full"]][:k]
    py_t, py_tabs = [], []
    for c in cs:
        c["s"]["level"] = level
        ars, s = G.from_dicts(c)
        s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
        t = time.perf_counter()
        tab = e.solve_table(ars, replace(s_w, balls=0, strikes=0, last=None))
        py_t.append(time.perf_counter() - t)
        py_tabs.append(tab)
    js = json.loads(subprocess.run(["node", os.path.join(os.getcwd(), "hitter_data", "sim_speed_js.js"), level, str(k)],
                                   capture_output=True, text=True, check=True, cwd=os.getcwd()).stdout)
    n = same = within = 0
    worst = 0.0
    for tab, jt in zip(py_tabs, js["tables"]):
        for which in ("V", "N"):
            for (b, kk), d in getattr(tab, which).items():
                for bn, v in d.items():
                    w = jt[which][f"{b}-{kk}"][f"{bn[0]},{bn[1]}"] if f"{b}-{kk}" in jt[which] else None
                    if w is None:
                        continue
                    n += 1
                    same += v == w
                    within += abs(v - w) <= 1e-9
                    worst = max(worst, abs(v - w))
    res = dict(level=level, cases=len(cs), py_s_per_solve=sum(py_t) / len(py_t), js_s_per_solve=sum(js["secs"]) / len(js["secs"]),
               values=n, exactly_equal=same, within_1e9=within, max_abs_diff=worst, engine_dir=root)
    res["js_speedup"] = res["py_s_per_solve"] / res["js_s_per_solve"]
    print(json.dumps(res), flush=True)
    return res


def compare(a, b, levels=("mlb", "college_d1", "college_d2", "college_d3", "hs")):
    """byte-compare every game JSON / pitch CSV under A/sims and B/sims; per-game wall time from each pool log"""
    import filecmp
    import re
    res = {"levels": {}}
    for lv in levels:
        da, db = (os.path.join(x, "sims", f"{lv}__base") for x in (a, b))
        names = sorted(f for f in os.listdir(da) if f.startswith("game_") and f.endswith((".json", ".csv")))
        diff = [f for f in names if not os.path.exists(os.path.join(db, f))
                or not filecmp.cmp(os.path.join(da, f), os.path.join(db, f), shallow=False)]

        def secs(d):
            t = {}           # first time each seed was played (two runners may share a pool log)
            for sd, p_, x in re.findall(r"seed (\d+): .*? pitches (\d+) ([\d.]+) s",
                                        open(os.path.join(d, "_pool.log"), encoding="utf-8").read()):
                t.setdefault(sd, (int(p_), float(x)))
            return sum(p_ for p_, _ in t.values()), sum(x for _, x in t.values()), len(t)
        pa, ta, na = secs(da)
        pb, tb, nb = secs(db)
        res["levels"][lv] = dict(games=na, files=len(names), identical=not diff, differing=diff, pitches=pa,
                                 s_per_game_before=round(ta / na, 1), s_per_game_after=round(tb / nb, 1),
                                 ms_per_pitch_before=round(1000 * ta / pa), ms_per_pitch_after=round(1000 * tb / pb),
                                 speedup=round(ta / tb, 2))
    res["identical"] = all(v["identical"] for v in res["levels"].values())
    ta = sum(v["s_per_game_before"] * v["games"] for v in res["levels"].values())
    tb = sum(v["s_per_game_after"] * v["games"] for v in res["levels"].values())
    res["speedup_all"] = round(ta / tb, 2)
    json.dump(res, open(os.path.join(SPEED_OUT, "proof", "proof.json"), "w"), indent=1)
    print(json.dumps(res, indent=1))
    return res["identical"]


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "profile":
        profile(sys.argv[2], sys.argv[3])
    elif cmd == "capture":
        capture(sys.argv[2], sys.argv[3])
    elif cmd == "bench":
        bench(sys.argv[2], sys.argv[3], *(int(x) for x in sys.argv[4:5]))
    elif cmd == "jsvspy":
        js_vs_py(sys.argv[2], int(sys.argv[3]), *(sys.argv[4:5]))
    elif cmd == "compare":
        sys.exit(0 if compare(sys.argv[2], sys.argv[3]) else 1)
