"""v1.0 Phase 5: tune the mixing. Free values KAPPA_T in {1, 1.5, 2, 3, 4, 6}, KAPPA_L in {1, 1.5, 2, 3}, GUARD_TYPE in
{0.020, 0.030, 0.040, 0.060}.
  python3 tune_v10.py --grid [--jobs 4]       grid search on the call sheet's CI tier: every enforced band, the v1.0
                                              scenario gate (non-tracked rows) and mean exploitability X at or below
                                              v0.9's (results/exploit_v09.json). Tables don't depend on GUARD_TYPE (the
                                              guards act at the root), so each (KAPPA_T, KAPPA_L) solves its tables once.
                                              Writes results/tune_v10_grid.json and results/tune_v10.md.
  python3 tune_v10.py --confirm KT,KL,G [...]  for the best candidates: the full-tier call sheet, and the 90-game simulator
                                              comparison against the v0.9 baseline (paired regret_w_exp, +0.25 budget).
Pick: passes every enforced band and the scenario gate, X at or below v0.9's, and the smallest regret increase; ties go
to smaller kappa, then smaller GUARD_TYPE. Candidate values reach subprocesses through PC_TUNE="KT,KL,G" (engine.py)."""
import argparse, concurrent.futures as cf, json, os, subprocess, sys, time
from dataclasses import replace

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "readthrough"))
os.chdir(ROOT)
import engine as e
import callsheet as C
import scenarios_v10 as S10

KT = (1.0, 1.5, 2.0, 3.0, 4.0, 6.0)
KL = (1.0, 1.5, 2.0, 3.0)
GT = (0.020, 0.030, 0.040, 0.060)
X09 = json.load(open(os.path.join(ROOT, "results", "exploit_v09.json")))["mean_X"]
BASE = os.path.join(os.path.dirname(ROOT), "pc-v09", "runs", "readthrough", "v09_tw")


class Half:
    def random(self):
        return 0.5


def ctx_task(args):
    job, kt, kl = args
    e.KAPPA_T, e.KAPPA_L = kt, kl
    ars, s0, tab = C.solve_context(job)
    out = {}
    for g in GT:
        e.GUARD_TYPE = g
        out[g] = C.count_records(job, ars, s0, tab, with_x=(job["group"] == "main"))
    return out


def scen_task(args):
    i, kt, kl = args
    e.KAPPA_T, e.KAPPA_L = kt, kl
    doc, _ = S10.load()
    row = doc["rows"][i]
    ars, s, exclude = S10.build(doc, row)
    s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
    tab = e.solve_table(ars, s_w)          # exactly what call_v08 solves when the grader passes no table
    out = {}
    for g in GT:
        e.GUARD_TYPE = g
        _, dist, _, _ = e.call_v08(ars, s_w, rng=Half(), exclude=exclude or None, tab=tab)
        out[g] = S10.grade_dist(doc, row, [(pr, p.name, p.kind, q) for pr, _, p, q in dist])
    return out


def summarize(bands, gate, xs):
    fails = {k: b for k, b in bands.items() if b["enforced"] and b["passed"] is False}
    mx = sum(xs) / len(xs)
    return dict(passed=not fails and gate["passed"] and mx <= X09 + 1e-12,
                band_fails={k: dict(rate=round(b["rate"], 4), max_miss=round(b["max_miss"], 4)) for k, b in fails.items()},
                bands={k: dict(passed=b["passed"], rate=b["rate"], max_miss=b["max_miss"]) for k, b in bands.items()},
                gate=dict(passed=gate["passed"], not_fails=gate["not_fails"], acc_only=gate["acc_only_fails"]),
                mean_X=mx, X_ok=mx <= X09 + 1e-12)


def grid(jobs):
    t0 = time.time()
    freq = C.mlb_count_freq()
    cjobs = C.jobs_for("ci")
    doc, _ = S10.load()
    res = {}
    with cf.ProcessPoolExecutor(jobs) as ex:
        for kt in KT:
            for kl in KL:
                t1 = time.time()
                recs = list(ex.map(ctx_task, [(j, kt, kl) for j in cjobs], chunksize=2))
                scen = list(ex.map(scen_task, [(i, kt, kl) for i in range(len(doc["rows"]))], chunksize=2))
                for g in GT:
                    rg = [r[g] for r in recs]
                    bands = C.evaluate(rg, freq)
                    sres = [x[g] for x in scen]
                    gate = S10.gate(doc, sres)
                    xs = [row["X"] for r in rg if r["group"] == "main" for row in r["counts"].values()]
                    res[f"{kt},{kl},{g}"] = summarize(bands, gate, xs)
                    sm = res[f"{kt},{kl},{g}"]
                    print(f"KAPPA_T {kt} KAPPA_L {kl} GUARD_TYPE {g}: {'PASS' if sm['passed'] else 'fail'} | bands failing "
                          f"{sorted(sm['band_fails']) or 'none'} | scenarios {'pass' if gate['passed'] else 'fail'} "
                          f"(Not cap {len(gate['not_fails'])}, acc-only {len(gate['acc_only_fails'])}) | X {sm['mean_X']:.5f}"
                          f"{'' if sm['X_ok'] else ' > v0.9'}", flush=True)
                print(f"  ({time.time() - t1:.0f}s)", flush=True)
    json.dump(dict(X09=X09, seconds=round(time.time() - t0), points=res),
              open(os.path.join(ROOT, "results", "tune_v10_grid.json"), "w"), indent=1)
    report(res)
    return res


def key_order(k):
    kt, kl, g = (float(x) for x in k.split(","))
    return (kt + kl, kt, kl, g)        # ties: smaller kappa, then smaller GUARD_TYPE


def report(res, extra=None):
    passing = sorted([k for k, v in res.items() if v["passed"]], key=key_order)
    L = ["# v1.0 Phase 5: tuning the mixing (tune_v10.py)", "",
         f"Grid on the call sheet's CI tier: {len(res)} points (KAPPA_T x KAPPA_L x GUARD_TYPE). A point passes when every "
         f"enforced band passes, the v1.0 scenario gate passes, and mean exploitability X is at or below v0.9's "
         f"({X09:.5f}).", "", f"Passing points: {len(passing)}" + (": " + ", ".join(passing) if passing else ""), "",
         "| KAPPA_T | KAPPA_L | GUARD_TYPE | result | enforced bands failing (rate, max miss) | scenarios | mean X |",
         "|---|---|---|---|---|---|---|"]
    for k in sorted(res, key=lambda k: tuple(float(x) for x in k.split(","))):
        v = res[k]
        kt, kl, g = k.split(",")
        bf = ", ".join(f"{b} ({x['rate']:.1%}, {100 * x['max_miss']:.1f})" for b, x in sorted(v["band_fails"].items())) or "none"
        sc = "pass" if v["gate"]["passed"] else f"fail (Not cap: {','.join(v['gate']['not_fails']) or '-'}; acc-only {len(v['gate']['acc_only'])})"
        L.append(f"| {kt} | {kl} | {g} | {'PASS' if v['passed'] else 'fail'} | {bf} | {sc} | {v['mean_X']:.5f} |")
    if extra:
        L += [""] + extra
    open(os.path.join(ROOT, "results", "tune_v10.md"), "w").write("\n".join(L) + "\n")


def confirm(cands, jobs):
    """Full-tier call sheet and the 90-game simulator comparison for each candidate."""
    out = {}
    for c in cands:
        tag = "tune_" + c.replace(",", "_")
        env = dict(os.environ, PC_TUNE=c)
        r1 = subprocess.run([sys.executable, "callsheet.py", "--tier", "full", "--jobs", str(jobs), "--tag", tag],
                            env=env, capture_output=True, text=True)
        cs = json.load(open(os.path.join(ROOT, "results", f"callsheet_{tag}.json")))
        fails = [k for k, b in cs["bands"].items() if b["enforced"] and b["passed"] is False]
        env_tw = dict(env, TRUTH_TAB="world")
        r2 = subprocess.run([sys.executable, "readthrough/run_games.py", "--seeds", "101-110", "--jobs", str(jobs),
                             "--suffix", "_tw", "--tag", tag], env=env_tw, capture_output=True, text=True)
        d = os.path.join(ROOT, "runs", "readthrough", tag + "_tw")
        r3 = subprocess.run([sys.executable, "tools/sim_floor.py", BASE, d, "--out", f"results/sim_floor_{tag}.txt"],
                            capture_output=True, text=True)
        line = [x for x in r3.stdout.splitlines() if x.startswith("regret_w_exp per game")]
        out[c] = dict(full_tier_fails=fails, callsheet_exit=r1.returncode, games_exit=r2.returncode, floor=line[0] if line else r3.stdout[-400:])
        print(f"{c}: full tier failing {fails or 'none'} | {out[c]['floor']}", flush=True)
    json.dump(out, open(os.path.join(ROOT, "results", "tune_v10_confirm.json"), "w"), indent=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", action="store_true")
    ap.add_argument("--confirm", nargs="*")
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    if a.grid:
        grid(a.jobs)
    if a.confirm:
        confirm(a.confirm, a.jobs)


if __name__ == "__main__":
    main()
