"""v1.3 Step 6 (plan 5.1): the final held-out test. The frozen core vs raw v1.2, scored ONCE on 2026, per level.

PREPARED, NOT RUN. It refuses to do anything without Drew's go:

    python -m hitter_data.final_test                 # prints the plan and what is frozen; exits 2; reads no 2026 data
    python -m hitter_data.final_test --drew-go       # the one run (Drew's explicit go only)

What it does on --drew-go, in order:
  1. Refuses if it already ran (marker {DATA}/final_test/RAN.json): the test is scored once.
  2. Freezes and records what is scored: git HEAD, a clean tree for the engine and its tables, sha256 of
     data_tables/{zone_v13, count_v13core, run_v13core}.json, engine.py, outcome_params.py, and the harness version.
  3. Builds the harness tables of each engine in its own process (two engines can't share one: both are `engine`):
       raw v1.2 = the v1.2.3 release engine (`git archive main`), at its D1 and D3 settings;
       core     = this tree's engine at its defaults (the frozen ship tables, fit on seasons <= 2025).
     Landing: the h3 (Single-A) primary assumption, as every 2025 score. HS / travel: the D3 Single-A mix (as 2025).
  4. Opens 2026 (hitter_data._final_test_unlock), builds each level's 2026 season and scores pitch_5way paired, SE =
     the largest of the game / home-team / two-team bootstrap SEs (B = 1000), as score_core.
  5. Verdict per level (ruling 1): core - raw v1.2 < -2 SE. D2 against the better of v1.2's D1 / D3 settings ON 2026
     (the harder of the two). A level whose count layer fell back to v1.2's (the 2025 pass bar) is still scored and labelled.
  6. Writes {DATA}/final_test/scores.json + scores.md and the marker. Nothing is fit, tuned or changed afterwards.

2026 is never used to fit anything: the core's tables were written before this runs (their seasons are checked), and
the recalibrated v1.2 reference is not computed here (it would be a fit on seasons before 2026; ruling 1's bar is raw v1.2).
"""
import argparse, hashlib, json, os, subprocess, sys, time

import numpy as np

from . import DATA, HELDOUT_SEASON, _final_test_unlock, assert_not_heldout
from . import harness as H
from .harness_adapters import ROOT

OUT = os.path.join(DATA, "final_test")
MARKER = os.path.join(OUT, "RAN.json")
LEVELS = ("D1", "D2", "D3", "HS")
FROZEN = ("engine.py", "outcome_params.py", "fit_mlb.json", "hitter_spread_params.py", "inplay_typed_params.py",
          "data_tables/zone_v13.json", "data_tables/count_v13core.json", "data_tables/run_v13core.json")
SPECS = {   # cfg -> [(adapter name, data level, engine level for D2)]
    "v123": [("v1.2", lv, "college_d1") for lv in LEVELS] + [("v1.2@D3", "D2", "college_d3")],
    "core": [("core", lv, "college_d2") for lv in LEVELS],
}


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def frozen_record():
    git = lambda *a: subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    dirty = [l for l in git("status", "--porcelain", "--", *FROZEN).splitlines() if l.strip()]
    return {"git_head": git("rev-parse", "HEAD"), "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
            "dirty_frozen_files": dirty, "sha256": {f: sha(os.path.join(ROOT, f)) for f in FROZEN},
            "harness": getattr(H, "HARNESS_VERSION", None)}


def build_tables(cfg, engine_dir):
    """In THIS process (env set by the parent): the adapter tables for one engine -> OUT/tables_<cfg>.npz."""
    from .fit_count_hs import AliasAssumption
    from .harness_adapters import PRIMARY_ASSUMPTION
    from .score_core import SitAdapter
    arrs, meta = {}, {}
    for name, lv, d2_as in SPECS[cfg]:
        ad = SitAdapter(d2_as if lv == "D2" else "college_d1", assumption=AliasAssumption(PRIMARY_ASSUMPTION),
                        engine_dir=engine_dir)
        t = ad.tables(lv)
        for nm in ("P6", "BIP", "RE", "CV"):
            arrs[f"{name}|{lv}|{nm}"] = getattr(t, nm)
        meta[f"{name}|{lv}"] = dict(engine_level=ad.engine_level(lv))
    e = ad.e
    meta["_engine"] = dict(dir=engine_dir, table_versions=str(getattr(e, "TABLE_VERSIONS", "v1.2.3 (no tables)")))
    os.makedirs(OUT, exist_ok=True)
    np.savez_compressed(os.path.join(OUT, f"tables_{cfg}.npz"), **arrs)
    with open(os.path.join(OUT, f"tables_{cfg}.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)


def tables_subprocess(cfg, engine_dir, env_tables):
    env = dict(os.environ, PYTHONUTF8="1")
    for k in ("PITCH_ZONE_TABLE", "PITCH_COUNT_TABLE", "PITCH_RUN_TABLE"):
        env.pop(k, None)               # core: this tree's defaults (the frozen tables); v1.2.3 has no tables
    env.update(env_tables)
    r = subprocess.run([sys.executable, "-m", "hitter_data.final_test", "--tables", cfg, "--engine-dir", engine_dir],
                       cwd=ROOT, env=env)
    if r.returncode:
        raise SystemExit(f"tables for {cfg} failed")


def core_fit_seasons():
    """Every season the frozen core's count / run layers were fit on (all <= 2025; checked)."""
    with open(os.path.join(ROOT, "data_tables", "count_v13core.json"), encoding="utf-8") as f:
        about = json.load(f)["about"]
    if "thru2025" not in about:
        raise SystemExit("count_v13core.json is not the thru-2025 ship build; refusing")
    return tuple(range(2000, HELDOUT_SEASON))


def score(v123_dir, B=1000, log=print):
    from .score_core import FixedAdapter
    from .harness import Tables
    fixed = {}
    for cfg in SPECS:
        z = np.load(os.path.join(OUT, f"tables_{cfg}.npz"))
        for key in sorted({k.rsplit("|", 1)[0] for k in z.files}):
            name, lv = key.split("|")
            fixed.setdefault(name, {})[lv] = Tables(z[f"{key}|P6"], z[f"{key}|BIP"], z[f"{key}|RE"], z[f"{key}|CV"],
                                                    name=name, level=lv)
    _final_test_unlock(HELDOUT_SEASON, "--drew-go")
    season = assert_not_heldout(HELDOUT_SEASON)
    con = H.connect()
    res = {}
    for lv in LEVELS:
        if lv == "HS":
            from . import fit_count_hs as HS
            S = HS.load_season(HS.connect(), season)
        else:
            S = H.build_season(con, lv, season)
        ads = [FixedAdapter("v1.2", fixed["v1.2"])]
        if lv == "D2":
            ads.append(FixedAdapter("v1.2@D3", fixed["v1.2@D3"]))
        ads.append(FixedAdapter("core", fixed["core"], core_fit_seasons()))
        refs = [a.name for a in ads if a.name != "core"]
        r = H.score_season(S, ads, refs, B=B, seed=1)
        pm = r["pitch_5way"]
        A = {k: (v[0], max(v[1].values())) for k, v in pm["adapters"].items()}
        ref = "v1.2"
        if lv == "D2" and A["v1.2@D3"][0] < A["v1.2"][0]:
            ref = "v1.2@D3"
        d = pm["diff"][ref]["core"]
        diff, se = d[0], max(d[1].values())
        res[lv] = dict(n_games=S.n_games, n_pitches=int(len(S.pit["y"])), means=A, reference=ref, core_minus_ref=diff,
                       se=se, z=diff / se if se else None, verdict="PASS" if diff < -2 * se else "FAIL")
        log(f"  {lv}: core - {ref} = {diff:+.5f} (SE {se:.5f}) -> {res[lv]['verdict']}")
        del S
    return res


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--drew-go", action="store_true", help="Drew's explicit go for the one 2026 run")
    ap.add_argument("--v123-dir", default=os.path.join(os.environ.get("TEMP", "/tmp"), "v123_engine_final"))
    ap.add_argument("--tables", default=None, help="(internal) build one engine's tables in this process")
    ap.add_argument("--engine-dir", default=None)
    ap.add_argument("--boot", type=int, default=1000)
    a = ap.parse_args(argv)
    if a.tables:
        build_tables(a.tables, a.engine_dir)
        return 0
    rec = frozen_record()
    if not a.drew_go:
        print("Step 6 final test: PREPARED, NOT RUN. It needs Drew's explicit go: --drew-go.")
        print("It would score, once, on 2026: the frozen core vs raw v1.2 (git archive main), per level", LEVELS)
        print("Frozen now:", json.dumps(rec, indent=1))
        if os.path.exists(MARKER):
            print("NOTE: it has already run:", open(MARKER, encoding="utf-8").read())
        return 2
    if os.path.exists(MARKER):
        print("REFUSING: the final test already ran (scored once):", open(MARKER, encoding="utf-8").read())
        return 3
    if rec["dirty_frozen_files"]:
        print("REFUSING: the frozen engine / tables have uncommitted changes:", rec["dirty_frozen_files"])
        return 4
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(os.path.join(a.v123_dir, "engine.py")):
        os.makedirs(a.v123_dir, exist_ok=True)
        subprocess.run(f'git archive main | tar -x -C "{a.v123_dir}"', cwd=ROOT, shell=True, check=True)
    tables_subprocess("v123", a.v123_dir, {})
    tables_subprocess("core", ROOT, {})
    res = score(a.v123_dir, B=a.boot)
    out = dict(run_at=time.strftime("%Y-%m-%d %H:%M:%S"), season=HELDOUT_SEASON, frozen=rec, boot=a.boot, levels=res,
               seconds=round(time.time() - t0, 1))
    with open(os.path.join(OUT, "scores.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, default=str)
    L = [f"# Step 6: the frozen core vs raw v1.2 on {HELDOUT_SEASON} (scored once)", "",
         f"Run {out['run_at']}; git {rec['git_head']}; pitch_5way log loss per pitch; SE = largest of the game / home / "
         f"two-team bootstrap SEs (B = {a.boot}).", "",
         "| Level | games / pitches | reference | core - reference (SE) | z | verdict |", "|---|---|---|---|---|---|"]
    for lv, r in res.items():
        L.append(f"| {lv} | {r['n_games']:,} / {r['n_pitches']:,} | {r['reference']} | {r['core_minus_ref']:+.5f} "
                 f"({r['se']:.5f}) | {r['z']:+.1f} | {r['verdict']} |")
    with open(os.path.join(OUT, "scores.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(L) + "\n")
    with open(MARKER, "w", encoding="utf-8") as f:
        json.dump(dict(run_at=out["run_at"], git_head=rec["git_head"]), f)
    print("\n".join(L))
    return 0


if __name__ == "__main__":
    sys.exit(main())
