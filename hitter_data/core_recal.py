"""v1.3 core: the level recalibration (the pitcher-side calibration chain) for a table-driven engine.

The core's zone table and count layer change what the engine's own calls do to K / BB / HBP, so the level offsets and the
in-play tables must be refit after them (HARNESS_v13 section 5: the build to score is the one after it). This runs the
same steps as hitter_data.refit_chain after its targets are applied (refit_mlb.py -> fit_all.py -> chain_v08.py ->
inplay_fit.py -> fit_hitter_spread.py -> we_tables.py), in a repo directory, with the engine's table versions picked by
the environment (PITCH_ZONE_TABLE / PITCH_COUNT_TABLE / PITCH_RUN_TABLE) so each step calibrates the engine as it runs.
No target is changed.

Plumbing the table-driven engine needs (the chain itself was written before the tables):
- the engine reads the typed in-play tables (OUT_TABLE / RUNNER_FIT) from the count table, not from inplay_typed_params.py,
  so after inplay_fit.py they are copied into each given count file (every level that has out_table; runner = the three
  fields the engines read). The engine's calls depend on those tables, so the chain runs again (passes, default 2) until
  the level offsets stop moving;
- outcome_params.py, fit_mlb.json and hitter_spread_params.py are read by the engine directly (no copy needed);
- chain_v08.py and we_tables.py are pure rate models (run_tables.py RE, college_rates); they do not read the engine.

usage: python -m hitter_data.core_recal <repo_dir> --count data_tables/count_v13core.json [--count ...]
           [--env PITCH_COUNT_TABLE=...] [--passes 2] [--log FILE]
"""
import argparse
import json
import os
import subprocess
import sys
import time
import types

from . import DATA
from .refit_chain import STEPS, _run, lf

RUNNER_KEYS = ("p_GB", "p_FB", "S_DP")
REALISM = (("mlb", "mlb_check"), ("college_d1", "college_d1"), ("college_d2", "college_d2"), ("college_d3", "college_d3"),
           ("hs", "hs"))


def typed_tables(repo):
    m = types.ModuleType("inplay_typed_params")
    with open(os.path.join(repo, "inplay_typed_params.py"), encoding="utf-8") as f:
        exec(compile(f.read(), "inplay_typed_params.py", "exec"), m.__dict__)
    return m.OUT_TABLE, m.RUNNER_FIT


def copy_inplay(repo, count_path, note):
    """OUT_TABLE / RUNNER_FIT (inplay_typed_params.py) -> the count file's out_table / runner, every level that has them."""
    out_t, run_f = typed_tables(repo)
    with open(count_path, encoding="utf-8") as f:
        C = json.load(f)
    moved = []
    for lv, L in C["levels"].items():
        if "out_table" not in L:
            continue
        new_t = {c: {t: list(v) for t, v in out_t[lv][c].items()} for c in L["out_table"]}
        new_r = {k: run_f[lv][k] for k in RUNNER_KEYS}
        if new_t != L["out_table"] or new_r != L["runner"]:
            moved.append(lv)
        L["out_table"], L["runner"] = new_t, new_r
    if note and note not in C["about"]:
        C["about"] = C["about"].rstrip() + " " + note
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data_tables"))
    import build_v12                     # the table files' own layout (export_candidates.run_core writes them so)
    with open(count_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(build_v12.dumps(C) + "\n")
    return moved


def realism(repo, env):
    code = ("import json, calib\n"
            f"out = {{}}\n"
            f"for lvl, key in {REALISM!r}:\n"
            "    m = calib.evaluate(lvl)\n"
            "    out[lvl] = {k: [m[k], calib.RV[key][k]] for k in ('K', 'BB', 'HBP')}\n"
            "    out[lvl].update({k: m[k] for k in ('H', 'HR', 'pitches_per_PA', 'zone', 'z_swing', 'o_swing', 'z_contact', 'o_contact', 'f_strike')})\n"
            "print('REALISM ' + json.dumps(out))\n")
    p = subprocess.run([sys.executable, "-c", code], cwd=repo, env=env, capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr[-2000:])
    line = [x for x in p.stdout.splitlines() if x.startswith("REALISM ")][-1]
    return json.loads(line[len("REALISM "):])


def offsets(repo):
    m = types.ModuleType("outcome_params")
    with open(os.path.join(repo, "outcome_params.py"), encoding="utf-8") as f:
        exec(compile(f.read(), "outcome_params.py", "exec"), m.__dict__)
    return m.OUTCOME_FIT


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("repo")
    ap.add_argument("--count", action="append", default=[], help="count file(s) that receive the in-play tables")
    ap.add_argument("--env", action="append", default=[], help="KEY=VALUE for the engine's table selection")
    ap.add_argument("--passes", type=int, default=2)
    ap.add_argument("--note", default="In-play tables (out_table / runner): the core's level recalibration "
                                      "(hitter_data.core_recal: inplay_fit.py on the recalibrated engine).")
    ap.add_argument("--log", default=os.path.join(DATA, "core_recal", "chain_run.log"))
    ap.add_argument("--pitcher-only", action="store_true",
                    help="addendum ruling 5: skip refit_mlb.py; fit_all moves only wild / cmd / hbp at every level")
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    for kv in a.env:
        k, v = kv.split("=", 1)
        os.environ[k] = v
    os.environ["PYTHONUTF8"] = "1"
    steps = STEPS
    if a.pitcher_only:
        os.environ["PITCH_RECAL_PITCHER_ONLY"] = "1"
        steps = tuple(s for s in STEPS if s != "refit_mlb.py")
    env = dict(os.environ)
    os.makedirs(os.path.dirname(a.log), exist_ok=True)
    t0 = time.time()
    hist = []
    with open(a.log, "a", encoding="utf-8") as log:
        log.write(f"\n##### core_recal in {repo} at {time.ctime()} env {a.env} count {a.count}\n")
        if not hist:
            hist.append({"pass": 0, "offsets": offsets(repo), "realism": realism(repo, env)})
            log.write("pass 0 (before) " + json.dumps(hist[-1]) + "\n")
            print("before:", json.dumps(hist[-1]["realism"]), flush=True)
        for n in range(1, a.passes + 1):
            for step in steps:
                _run(repo, [step], f"pass {n} {step}", log)
                lf(repo)
            for cp in a.count:
                moved = copy_inplay(repo, cp, a.note)
                print(f"  pass {n}: in-play tables -> {cp} (levels moved: {moved})", flush=True)
            hist.append({"pass": n, "offsets": offsets(repo), "realism": realism(repo, env)})
            log.write(f"pass {n} " + json.dumps(hist[-1]) + "\n")
            log.flush()
            prev = hist[-2]["offsets"]
            dmax = max(abs(v - prev.get(lv, {}).get(k, 0.0)) for lv, d in hist[-1]["offsets"].items() for k, v in d.items())
            print(f"pass {n}: largest offset move {dmax:.4f}; realism " + json.dumps(hist[-1]["realism"]), flush=True)
    out = os.path.join(os.path.dirname(a.log), f"recal_{os.path.basename(repo.rstrip(os.sep))}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"repo": repo, "env": a.env, "count": a.count, "passes": hist}, f, indent=1)
    print(f"core_recal done in {time.time() - t0:.0f}s -> {out}")


if __name__ == "__main__":
    main()
