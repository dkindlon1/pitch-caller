"""v1.3 shared refits: put the refit MLB targets (hitter_data.refit_mlb_targets -> mlbt.json) into a repo checkout and rerun
the calibration chain that consumes them.

Edits (number literals only, form unchanged):
- college_rates.py `MLB` (per-PA rates; WPPB / SB / CS kept: Savant's MLB rows carry no baserunning events);
- college_run_values.json `mlb_check` (the same Markov model rerun on the new rates: RE, LW walk / strikeout, out rates);
  the other levels' entries are left as they are;
- calib.py `MLB_PITCH` (pitch-level targets);
- run_tables.py RE_BY_LEVEL['mlb'] and CV_BY_LEVEL['mlb'] (RE['mlb'][0, '000'] is engine.run_scale's denominator);
- fit_hitter_spread.py HARD_SD;
- the pro (mlb) baselines in app/learner.js, app/learn.js, web/lib/report_data.ts.
Then runs, in the repo directory: refit_mlb.py -> fit_all.py -> chain_v08.py -> inplay_fit.py -> fit_hitter_spread.py ->
we_tables.py. It does not run app/export_data.py or app/build.py. Generated files are rewritten with LF line endings.

usage: python3 -m hitter_data.refit_chain <repo_dir> [--targets C:/dev/pitchiq-data/refit/mlbt.json] [--no-run]
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time

from . import DATA

STATES = [(o, b) for o in range(3) for b in ("000", "100", "020", "120", "003", "103", "023", "123")]
COUNTS_ORDER = [(0, 0), (1, 0), (2, 0), (3, 0), (0, 1), (1, 1), (2, 1), (3, 1), (0, 2), (1, 2), (2, 2), (3, 2)]
RATE_KEYS = ("K", "BB", "HBP", "1B", "2B", "3B", "HR", "SF", "SH", "GDP", "E")
STEPS = ("refit_mlb.py", "fit_all.py", "chain_v08.py", "inplay_fit.py", "fit_hitter_spread.py", "we_tables.py")
GENERATED = ("college_run_values.json", "fit_mlb.json", "outcome_params.py", "we_rates.json", "inplay_typed_params.py",
             "hitter_spread_params.py", "we_tables.json", "results/v08_step7_we_checks.txt")


def _rw(path, fn):
    with open(path, encoding="utf-8", newline="") as f:
        s = f.read()
    t = fn(s)
    if t == s:
        raise RuntimeError(f"no change made in {path}")
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(t)


def _sub1(pattern, repl, s, flags=0):
    t, n = re.subn(pattern, repl, s, count=1, flags=flags)
    if n != 1:
        raise RuntimeError(f"pattern not found: {pattern[:60]}")
    return t


def apply_targets(repo, T):
    r, p, base = T["rates"], T["pitch"], T["baseline"]
    # college_rates.MLB
    def cr(s):
        m = re.search(r"MLB = \{.*?\}\n", s, flags=re.S)
        old = eval(m.group(0)[len("MLB = "):])
        new = dict(old)
        for k in RATE_KEYS + ("R_per_PA",):
            new[k] = round(r[k], 4)
        body = ", ".join(f'"{k}": {v}' for k, v in new.items())
        lines, cur = [], "MLB = {"
        for part in body.split(", "):
            if len(cur) + len(part) > 110:
                lines.append(cur.rstrip())
                cur = "       "
            cur += part + ", "
        lines.append(cur.rstrip(", ") + "}")
        s = s[:m.start()] + "\n".join(lines) + "\n" + s[m.end():]
        s = s.replace("# MLB 2010-15 era per-PA rates (approximate public league averages) -- used only to validate the method\n"
                      "# against the MLB RE24 table the engine already uses.",
                      "# MLB per-PA rates: v1.3 refit from Savant MLB 2021-2025, recency weighted (hitter_data/refit_mlb_targets.py).\n"
                      "# WPPB, SB, CS keep the 2010-15 values (Savant's MLB rows carry no baserunning events).")
        return s
    _rw(os.path.join(repo, "college_rates.py"), cr)

    # calib.MLB_PITCH
    def cal(s):
        new = (f'MLB_PITCH = {{"zone": {p["zone"]:.3f}, "z_swing": {p["z_swing"]:.3f}, "o_swing": {p["o_swing"]:.3f}, '
               f'"z_contact": {p["z_contact"]:.3f}, "o_contact": {p["o_contact"]:.3f},\n'
               f'             "f_strike": {p["f_strike"]:.3f}}}')
        s = _sub1(r'MLB_PITCH = \{[^}]*\}', new.replace("\\", "\\\\"), s, flags=re.S)
        return s.replace("# MLB pitch-level: FanGraphs Library league-average guide (O-Swing 30, Z-Swing 65, Swing 46,\n"
                         "#   O-Contact 66, Z-Contact 87, Contact 80, Zone 45, F-Strike 59, SwStr 9.5).",
                         "# MLB pitch-level: v1.3 refit from Savant MLB 2021-2025, recency weighted, zone = Savant zones 1-9\n"
                         "#   (hitter_data/refit_mlb_targets.py; was the FanGraphs Library league-average guide).").replace(
            "# MLB PA rates: the 2010-15 rates used to validate the run tables (college_rates.MLB).",
            "# MLB PA rates: college_rates.MLB (v1.3 refit, Savant MLB 2021-2025).")
    _rw(os.path.join(repo, "calib.py"), cal)

    # run_tables mlb RE / CV
    def rt(s):
        re_ = ", ".join(f"({o}, '{b}'): {round(T['RE'][f'{o}|{b}'], 3)}" for o, b in STATES)
        cv_ = ", ".join(f"({b}, {k}): {round(T['CV'][f'{b}-{k}'], 3) + 0.0}" for b, k in COUNTS_ORDER)
        s = _sub1(r"  'mlb': \{\(0, '000'\).*?\},\n", "  'mlb': {" + re_ + "},\n", s, flags=re.S)
        s = _sub1(r"  'mlb': \{\(0, 0\).*?\},\n", "  'mlb': {" + cv_ + "},\n", s, flags=re.S)
        return s.replace("MLB = 2010-15 MLB averages (the engine's original table).",
                         "MLB = v1.3 refit: Savant MLB 2021-2025, innings 1-8, recency weighted (hitter_data/refit_mlb_targets.py).")
    _rw(os.path.join(repo, "run_tables.py"), rt)

    _rw(os.path.join(repo, "fit_hitter_spread.py"),
        lambda s: _sub1(r"\nHARD_SD = [0-9.]+", f"\nHARD_SD = {T['HARD_SD']:.4f}   # v1.3 refit (hitter_data/refit_mlb_targets.py)", s))

    # pro baselines
    js = (f"mlb: {{ AVG: {base['AVG']:.3f}, OBP: {base['OBP']:.3f}, SLG: {base['SLG']:.3f}, K: {base['K']:.3f}, "
          f"BB: {base['BB']:.3f} }},")
    for f in ("app/learner.js", "app/learn.js"):
        _rw(os.path.join(repo, f), lambda s: _sub1(r"mlb: \{ AVG: [^}]*\},", js, s))
    _rw(os.path.join(repo, "web/lib/report_data.ts"),
        lambda s: _sub1(r'mlb: \{ AVG: [0-9.]+, K: [0-9.]+, BB: [0-9.]+, label: "pro" \},',
                        f'mlb: {{ AVG: {base["AVG"]:.3f}, K: {base["K"]:.3f}, BB: {base["BB"]:.3f}, label: "pro" }},', s))


def update_mlb_check(repo):
    """Reruns college_rates' model for mlb_check on the (edited) college_rates.MLB; other levels untouched."""
    code = (
        "import json, college_rates as cr\n"
        "out = json.load(open('college_run_values.json'))\n"
        "r = dict(cr.MLB)\n"
        "cr.calibrate_out_rates(r)\n"
        "RE = cr.solve_re(r)\n"
        "visits, pa_inn = cr.state_freq_and_pa(r)\n"
        "r['_RE'] = {f'{o}|{cr.key(b)}': round(v, 3) for (o, b), v in RE.items()}\n"
        "r['_model_R_per_PA'] = RE[(0, 0)] / pa_inn\n"
        "r['_lw_bb'], r['_lw_k'] = cr.linear_weights(r, RE)\n"
        "out['mlb_check'] = r\n"
        "json.dump(out, open('college_run_values.json', 'w', newline=''), indent=1)\n"
        "print('mlb_check: RE00', r['_RE']['0|000'], 'model R/PA', round(r['_model_R_per_PA'], 4), 'actual', r['R_per_PA'],"
        " 'LW BB', round(r['_lw_bb'], 4), 'K', round(r['_lw_k'], 4))\n")
    _run(repo, ["-c", code], "mlb_check")


def _run(repo, args, label, log=None):
    t0 = time.time()
    env = dict(os.environ, PYTHONUTF8="1")
    p = subprocess.run([sys.executable] + args, cwd=repo, env=env, capture_output=True, text=True)
    msg = f"[{label}] exit {p.returncode} in {time.time() - t0:.0f}s"
    print(msg, flush=True)
    if log:
        log.write(f"\n===== {msg}\n{p.stdout}\n{p.stderr}\n")
        log.flush()
    if p.returncode != 0:
        print(p.stdout[-3000:], p.stderr[-3000:])
        raise RuntimeError(f"{label} failed")
    return p.stdout


def lf(repo, files=GENERATED):
    for f in files:
        path = os.path.join(repo, f)
        if not os.path.exists(path):
            continue
        with open(path, "rb") as fh:
            b = fh.read()
        if b"\r\n" in b:
            with open(path, "wb") as fh:
                fh.write(b.replace(b"\r\n", b"\n"))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("repo")
    ap.add_argument("--targets", default=os.path.join(DATA, "refit", "mlbt.json"))
    ap.add_argument("--no-run", action="store_true", help="edit the target sources only")
    ap.add_argument("--no-edit", action="store_true", help="run the chain only (targets already in place)")
    a = ap.parse_args(argv)
    repo = os.path.abspath(a.repo)
    T = json.load(open(a.targets))
    t0 = time.time()
    if not a.no_edit:
        apply_targets(repo, T)
        update_mlb_check(repo)
        lf(repo)
    if not a.no_run:
        with open(os.path.join(DATA, "refit", "chain_run.log"), "a", encoding="utf-8") as log:
            log.write(f"\n##### chain in {repo} at {time.ctime()}\n")
            for step in STEPS:
                _run(repo, [step], step, log)
                lf(repo)
    print(f"chain done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
