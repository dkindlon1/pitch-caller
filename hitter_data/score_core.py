"""v1.3 core, Task C step 1 (Drew's ruling 1): raw v1.2, recalibrated v1.2 and the core scored on 2025 per level with the
h3 harness (landing re-frozen from Single-A), plus the calib-world (h2) side report. 2026 is never loaded.

Pass rule (ruling 1): the core must beat RAW v1.2 by more than 2 SE on pitch_5way at each level (D2: against the better
of v1.2's D1 / D3 settings, the one with the lower 2025 pitch_5way). No 0.002 floor. Recalibrated v1.2 is reported only.
SE = the largest of the harness's game / home-team / two-team bootstrap SEs (B = 1000).

Out of sample: the core's D1 and HS count layers ship from the *_thru2025 candidates, which contain 2025. The harness
refuses to score an adapter on a season it was fit on, so the core is scored as its "as scored" copy: the same build
(export_candidates.run_core) from the *_thru2024 candidates, the HS pitch kind x velocity table refit through 2024, and
the run values through 2024 (fits/candidates/count_v13core_s2024.json, run_v13core_s2024.json). D2 / D3 run v1.2's count
layer (pending the coverage rule): no college fit enters them.

Two engines cannot share one Python process (both are the module `engine`), so each engine's harness tables are built in
its own process (`--tables`) and saved; the scoring process loads them as fixed tables and scores them paired.
  raw v1.2 = the v1.2.3 release engine (git archive of main) at its own defaults;
  core     = this branch's engine with the as-scored count / run copies.

HS / travel: the harness has no HS pitcher world; every engine at HS is asked about the D3 Single-A mix (as
fit_count_hs). The harness cannot see pitch kind or speed, so the HS core score is the table score; the pitch kind x
velocity table's own gain is measured per pitch on top of the core's HS table without it (fit <= 2024, scored on 2025),
as fit_count_hs.test_terms does.

usage:
  python -m hitter_data.score_core --build-s2024          # the as-scored count / run copies (about 2 min)
  python -m hitter_data.score_core --all [--boot 1000]    # tables for every engine (subprocesses) + scores + report
"""
import argparse
import inspect
import json
import os
import subprocess
import sys
import time

import numpy as np

from . import assert_not_heldout, fit_seasons
from . import fit_count_data as FD
from . import harness as H
from .harness_adapters import (ROOT, SHAPE, Adapter, EngineV12Adapter, RecalAdapter, EmpiricalAdapter, Tables,
                               bases_tuple)

SEASON = 2025
OUT = os.path.join(FD.FITS, "score_core")
CAND = os.path.join(FD.FITS, "candidates")
S2024 = {"count": os.path.join(CAND, "count_v13core_s2024.json"), "run": os.path.join(CAND, "run_v13core_s2024.json")}
S2024_NOPV = os.path.join(CAND, "count_v13core_s2024_nopv.json")
S2024_NOBO = os.path.join(CAND, "count_v13core_s2024_nobo.json")      # step 2: swing_base_out zeroed at college_d1 / hs
DEFAULT_V123 = os.path.join(os.environ.get("TEMP", "/tmp"), "v123_engine")
LEVELS = ("D1", "D2", "D3", "HS")
CFGS = ("v123", "core", "core_nopv", "core_nobo")

# engine configs: name -> (engine dir key, env, [(adapter name, data level, d2_as, assumption)])
def configs(v123_dir):
    core_env = {"PITCH_ZONE_TABLE": "v13", "PITCH_COUNT_TABLE": S2024["count"], "PITCH_RUN_TABLE": S2024["run"]}
    nopv_env = dict(core_env, PITCH_COUNT_TABLE=S2024_NOPV)
    nobo_env = dict(core_env, PITCH_COUNT_TABLE=S2024_NOBO)
    v12 = [("v1.2", lv, "college_d1", a) for lv in LEVELS for a in ("single_a", "calib_world")]
    v12 += [("v1.2@D3", "D2", "college_d3", a) for a in ("single_a", "calib_world")]
    core = [("core", lv, "college_d2", a) for lv in LEVELS for a in ("single_a", "calib_world")]
    return {"v123": (v123_dir, {"PITCH_ZONE_TABLE": "", "PITCH_COUNT_TABLE": "", "PITCH_RUN_TABLE": ""}, v12),
            "core": (ROOT, core_env, core),
            "core_nopv": (ROOT, nopv_env, [("core_nopv", "HS", "college_d2", "single_a")]),
            "core_nobo": (ROOT, nobo_env, [("core_nobo", lv, "college_d2", "single_a") for lv in ("D1", "HS")])}


def tag(name, assumption):
    return name if assumption == "single_a" else f"{name}[{assumption}]"


class SitAdapter(EngineV12Adapter):
    """EngineV12Adapter that also hands the situation to type_mix when the engine takes it (the core's bip_gb by count;
    v1.2's type_mix takes no situation). Only the batted-ball metrics see it; pitch_5way does not."""

    def zone_responses(self, data_level, b, k, o, bi, same, late, needs):
        e = self.e
        if len(inspect.signature(e.type_mix).parameters) < 4:
            return super().zone_responses(data_level, b, k, o, bi, same, late, needs)
        orig = e.type_mix
        s = e.Situation(b, k, o, bases_tuple(bi), inning=9 if late else 1, margin=0, level=self.engine_level(data_level),
                        same_side=same)
        try:
            e.type_mix = lambda p, q, c, s_=None: orig(p, q, c, s)
            return super().zone_responses(data_level, b, k, o, bi, same, late, needs)
        finally:
            e.type_mix = orig


def build_tables(cfg_name, engine_dir, out_dir=OUT):
    """In THIS process (env already set): every adapter's Tables for this engine -> <out>/tables_<cfg>.npz."""
    from .fit_count_hs import AliasAssumption
    specs = configs(engine_dir)[cfg_name][2]
    arrs, meta = {}, {}
    for name, lv, d2_as, an in specs:
        ad = SitAdapter(d2_as if lv == "D2" else "college_d1", assumption=AliasAssumption(an), engine_dir=engine_dir)
        t0 = time.time()
        t = ad.tables(lv)
        key = f"{tag(name, an)}|{lv}"
        for nm in ("P6", "BIP", "RE", "CV"):
            arrs[f"{key}|{nm}"] = getattr(t, nm)
        meta[key] = dict(engine_level=ad.engine_level(lv), assumption=an, seconds=round(time.time() - t0, 1))
        print(f"  {cfg_name}: {key} ({ad.engine_level(lv)}) {time.time() - t0:.0f} s", flush=True)
    e = ad.e
    meta["_engine"] = dict(dir=engine_dir, file=e.__file__, table_versions=getattr(e, "TABLE_VERSIONS", "v1.2.3 (no tables)"),
                           fingerprint=H.engine_fingerprint(engine_dir) if engine_dir == ROOT else "git archive main (v1.2.3)")
    os.makedirs(out_dir, exist_ok=True)
    np.savez_compressed(os.path.join(out_dir, f"tables_{cfg_name}.npz"), **arrs)
    with open(os.path.join(out_dir, f"tables_{cfg_name}.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, default=str)


def run_tables_subprocess(cfg_name, v123_dir):
    engine_dir, env, _ = configs(v123_dir)[cfg_name]
    full = dict(os.environ, PYTHONUTF8="1")
    for k, v in env.items():
        if v:
            full[k] = v
        else:
            full.pop(k, None)
    cmd = [sys.executable, "-m", "hitter_data.score_core", "--tables", cfg_name, "--engine-dir", engine_dir]
    r = subprocess.run(cmd, cwd=ROOT, env=full)
    if r.returncode:
        raise SystemExit(f"tables for {cfg_name} failed")


class FixedAdapter(Adapter):
    def __init__(self, name, by_level, fit_seasons=()):
        self.name, self.by_level, self.fit_seasons = name, by_level, tuple(fit_seasons)

    def tables(self, data_level):
        return self.by_level[data_level]


def load_fixed(out_dir=OUT):
    """-> {adapter name: {data level: Tables}}"""
    res = {}
    for cfg in CFGS:
        p = os.path.join(out_dir, f"tables_{cfg}.npz")
        if not os.path.exists(p):
            continue
        z = np.load(p)
        keys = sorted({k.rsplit("|", 1)[0] for k in z.files})
        for key in keys:
            name, lv = key.split("|")
            t = Tables(z[f"{key}|P6"], z[f"{key}|BIP"], z[f"{key}|RE"], z[f"{key}|CV"], name=name, level=lv)
            res.setdefault(name, {})[lv] = t
    return res


def core_fit_seasons(level):
    """College / HS seasons the as-scored core's count layer was fit on (D2 / D3: none, v1.2's count layer)."""
    fn = {"D1": "D1_shared_thru2024.json", "HS": "hs_sep_thru2024.json"}.get(level)
    if not fn:
        return ()
    with open(os.path.join(FD.FITS, "count_layer", fn), encoding="utf-8") as f:
        return tuple(int(s) for s in json.load(f)["fit_seasons"])


def se(v):
    return max(v[1].values())


def college_level(con, level, fixed, B, log=print):
    assert_not_heldout(SEASON)
    S = H.build_season(con, level, SEASON)
    pre = {s: H.prequalify(con, level, s) for s in range(1990, SEASON)}
    fs = H.fit_seasons_for(con, level, SEASON, [s for s, q in pre.items() if q["full_games"] > 0])
    fc = H.FitCounts()
    for s in fs:
        fc.add_scaled(H.FitCounts.from_season(H.build_season(con, level, s)), H.recency_weight(s, SEASON))
    fit = {level: fc}
    return S, fs, fit


def hs_level(fixed):
    from . import fit_count_hs as HS
    con = HS.connect()
    Ss = {s: HS.load_season(con, s) for s in HS.SEASONS}
    fit_S = [Ss[s] for s in HS.SEASONS if s < SEASON]
    fc = H.FitCounts()
    for S in fit_S:
        fc.add_scaled(H.FitCounts.from_season(S), H.recency_weight(S.season, SEASON))
    return Ss[SEASON], [S.season for S in fit_S], {"HS": fc}, fit_S


def score_level(level, S, fs, fit, fixed, B, log=print):
    ad = {}
    names = ["v1.2", "v1.2@D3", "core", "v1.2[calib_world]", "v1.2@D3[calib_world]", "core[calib_world]", "core_nobo"]
    for nm in names:
        if nm in fixed and level in fixed[nm]:
            ad[nm] = FixedAdapter(nm, fixed[nm], core_fit_seasons(level) if nm.startswith("core") else ())
    adapters = [ad["v1.2"], RecalAdapter(ad["v1.2"], fit, fs)]
    if "v1.2@D3" in ad:
        adapters += [ad["v1.2@D3"], RecalAdapter(ad["v1.2@D3"], fit, fs)]
    adapters += [ad["core"], RecalAdapter(ad["core"], fit, fs)]
    for nm in ("v1.2[calib_world]", "v1.2@D3[calib_world]", "core[calib_world]", "core_nobo"):
        if nm in ad:
            adapters.append(ad[nm])
    adapters += [EmpiricalAdapter(k, fit, fs) for k in ("count", "count_bo")]
    refs = ["v1.2"] + (["v1.2@D3"] if "v1.2@D3" in ad else []) + ["v1.2_recal"]
    if "v1.2[calib_world]" in ad:
        refs.append("v1.2[calib_world]")
    if "v1.2@D3[calib_world]" in ad:
        refs.append("v1.2@D3[calib_world]")
    if "core_nobo" in ad:
        refs.append("core_nobo")
    res = H.score_season(S, adapters, refs, B=B, seed=1)
    log(H.fmt_report(level, SEASON, S, {k: v for k, v in res.items() if k in ("pitch_5way", "bip_result", "bip_type_outs",
                                                                               "pa_5way")}, refs))
    return res, refs


def hs_pitch_terms(S25, fit_S, fixed, B, log=print):
    """The HS pitch kind x velocity stack (fit <= 2024 on top of the core's HS table without it), scored per pitch on
    2025, and the core-with-it vs raw v1.2 paired difference."""
    from . import fit_count_hs as HS
    t0 = fixed["core_nopv"]["HS"]
    tv = fixed["v1.2"]["HS"]
    Ws = H.boot_weights(S25, B, 1)
    y = S25.pit["y"]
    Pf = [HS.base_p6(t0, S) for S in fit_S]
    Pv = HS.base_p6(t0, S25)
    lb = HS.loss5(Pv, y)
    for term in HS.PV_TERMS:
        r = HS.fit_term(Pf, fit_S, term)
        Pf = [HS.apply_term(P, S, term, r) for P, S in zip(Pf, fit_S)]
        Pv = HS.apply_term(Pv, S25, term, r)
    lp = HS.loss5(Pv, y)
    lv = HS.loss5(HS.base_p6(tv, S25), y)
    out = {}
    m, s_ = HS.paired(S25, lp, lb, Ws)
    out["stack_gain_on_core_nopv"] = dict(gain=-m, se=s_)
    m, s_ = HS.paired(S25, lb, lv, Ws)
    out["core_nopv_minus_v12"] = dict(diff=m, se=s_)
    m, s_ = HS.paired(S25, lp, lv, Ws)
    out["core_with_pitch_terms_minus_v12"] = dict(diff=m, se=s_)
    out["means"] = dict(v12=float(lv.mean()), core_nopv=float(lb.mean()), core_with_pitch_terms=float(lp.mean()))
    log(f"  HS pitch kind x velocity (fit <= 2024 on the core's HS table without it): {json.dumps(out)}")
    return out


def summarise(level, res, refs):
    pm = res["pitch_5way"]
    A = pm["adapters"]
    means = {k: (v[0], se(v)) for k, v in A.items()}
    D = pm["diff"]
    out = {"means": means, "diffs": {}}
    for ref in refs:
        for nm, v in D[ref].items():
            out["diffs"][f"{nm} - {ref}"] = (v[0], se(v))
    ref = "v1.2"
    if level == "D2" and "v1.2@D3" in A and A["v1.2@D3"][0] < A["v1.2"][0]:
        ref = "v1.2@D3"
    d = D[ref]["core"]
    out["pass_ref"] = ref
    out["core_minus_ref"] = (d[0], se(d))
    out["verdict"] = "PASS" if d[0] < -2 * se(d) else "FAIL"
    if "core_nobo" in D:
        b = D["core_nobo"]["core"]
        out["base_out_gain"] = dict(gain=-b[0], se=se(b), clears_2se=bool(-b[0] > 2 * se(b)))
    if "v1.2[calib_world]" in D:
        cref = "v1.2@D3[calib_world]" if (ref == "v1.2@D3" and "v1.2@D3[calib_world]" in D) else "v1.2[calib_world]"
        cd = D[cref].get("core[calib_world]")
        if cd:
            out["calib_world"] = dict(ref=cref, core_minus_ref=(cd[0], se(cd)),
                                      verdict="PASS" if cd[0] < -2 * se(cd) else "FAIL")
    return out


def write_md(allres, path):
    L = ["# v1.3 core scores on 2025 (h3 harness; generated by hitter_data.score_core)", "",
         "pitch_5way log loss per pitch. SE = the largest clustered SE (B = %d). Ruling 1: PASS = core - raw v1.2 < -2 SE "
         "(D2: the better raw v1.2 setting). 2026 was not loaded." % allres["boot"], "",
         "| Level | games / pitches | raw v1.2 | recal v1.2 | core | core - raw v1.2 (SE) | z | verdict | core - recal (SE) |",
         "|---|---|---|---|---|---|---|---|---|"]
    for lv, r in allres["levels"].items():
        s = r["summary"]
        m = s["means"]
        ref = s["pass_ref"]
        d, e = s["core_minus_ref"]
        dr = s["diffs"].get("core - v1.2_recal", (float("nan"), float("nan")))
        L.append(f"| {lv} | {r['n_games']} / {r['n_pitches']:,} | {m[ref][0]:.4f} ({ref}) | {m['v1.2_recal'][0]:.4f} | "
                 f"{m['core'][0]:.4f} | {d:+.5f} ({e:.5f}) | {d / e:+.1f} | {s['verdict']} | {dr[0]:+.5f} ({dr[1]:.5f}) |")
    L += ["", "Base-out swing term (core - core with swing_base_out zeroed, D1 / HS): " + "; ".join(
        f"{lv} gain {r['summary']['base_out_gain']['gain']:+.5f} (SE {r['summary']['base_out_gain']['se']:.5f})"
        for lv, r in allres["levels"].items() if "base_out_gain" in r["summary"])]
    L += ["", "Calib-world side report (h2 landing):", "", "| Level | ref | core - ref (SE) | verdict |", "|---|---|---|---|"]
    for lv, r in allres["levels"].items():
        c = r["summary"].get("calib_world")
        if c:
            L.append(f"| {lv} | {c['ref']} | {c['core_minus_ref'][0]:+.5f} ({c['core_minus_ref'][1]:.5f}) | {c['verdict']} |")
    if "hs_pitch_terms" in allres:
        L += ["", "HS pitch terms: " + json.dumps(allres["hs_pitch_terms"])]
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(L) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--build-s2024", action="store_true")
    ap.add_argument("--tables", default=None, help="(internal) build one engine config's tables in this process")
    ap.add_argument("--engine-dir", default=None)
    ap.add_argument("--v123-dir", default=DEFAULT_V123, help="the v1.2.3 engine: git archive main | tar -x -C DIR")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--skip-tables", action="store_true")
    ap.add_argument("--levels", default=",".join(LEVELS))
    ap.add_argument("--boot", type=int, default=1000)
    a = ap.parse_args(argv)
    if a.build_s2024:
        from . import export_candidates as X
        X.run_core(thru=2024, out_paths=S2024)
        C = json.load(open(S2024["count"], encoding="utf-8"))
        C["levels"]["hs"].pop("pitch_velo")
        with open(S2024_NOPV, "w", encoding="utf-8", newline="\n") as f:
            json.dump(C, f, indent=1)
        C = json.load(open(S2024["count"], encoding="utf-8"))
        for lv in ("college_d1", "hs"):
            C["levels"][lv]["swing_base_out"] = {k: 0.0 for k in C["levels"][lv]["swing_base_out"]}
        with open(S2024_NOBO, "w", encoding="utf-8", newline="\n") as f:
            json.dump(C, f, indent=1)
        print("wrote", S2024, S2024_NOPV)
        return
    if a.tables:
        build_tables(a.tables, a.engine_dir)
        return
    if not a.all:
        ap.error("--all, --build-s2024 or --tables")
    t0 = time.time()
    if not a.skip_tables:
        for cfg in CFGS:
            run_tables_subprocess(cfg, a.v123_dir)
    fixed = load_fixed()
    allres = {"season": SEASON, "boot": a.boot, "heldout_touched": False, "levels": {},
              "engines": {cfg: json.load(open(os.path.join(OUT, f"tables_{cfg}.json"), encoding="utf-8"))["_engine"]
                          for cfg in CFGS}}
    con = H.connect()
    for lv in a.levels.split(","):
        if lv == "HS":
            S, fs, fit, fit_S = hs_level(fixed)
        else:
            S, fs, fit = college_level(con, lv, fixed, a.boot)
        res, refs = score_level(lv, S, fs, fit, fixed, a.boot)
        allres["levels"][lv] = dict(n_games=S.n_games, n_pitches=int(len(S.pit["y"])), fit_seasons=fs, refs=refs,
                                    summary=summarise(lv, res, refs),
                                    scores={k: res[k] for k in ("pitch_5way", "bip_result", "bip_type_outs", "pa_5way",
                                                                "pitch_swing_take", "pitch_cstrike_given_take",
                                                                "pitch_result_given_swing") if k in res})
        print(f"  {lv}: {json.dumps(allres['levels'][lv]['summary'], default=str)}", flush=True)
        if lv == "HS":
            allres["hs_pitch_terms"] = hs_pitch_terms(S, fit_S, fixed, a.boot)
        del S
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "scores.json"), "w", encoding="utf-8") as f:
        json.dump(allres, f, indent=1, default=lambda o: o.item() if isinstance(o, np.generic) else str(o))
    write_md(allres, os.path.join(OUT, "scores.md"))
    print(f"wrote {OUT}/scores.json, scores.md ({time.time() - t0:.0f} s). 2026 was not loaded.")


if __name__ == "__main__":
    main()
