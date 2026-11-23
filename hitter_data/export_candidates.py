"""Turn the PROVISIONAL count-layer and run-value fits into candidate engine tables in the docs/TABLES_v13.md format.

    python -m hitter_data.export_candidates            # write, calibrate, verify (fresh process, env override), prove JS
    python -m hitter_data.export_candidates --verify C:/dev/pitchiq-data/fits/candidates/count_v13prov.json   (internal)

Writes to C:/dev/pitchiq-data/fits/candidates/ (never into data_tables/; nothing tracked changes; nothing is the default):
  count_v13prov.json   copy of data_tables/count_v13refit.json (core: the shared refit's count layer), version "v13prov"; per level college_d1 / college_d2 (THIN) /
                       college_d3 (THIN) / hs, the numbers the fit owns replaced; mlb unchanged
  run_v13prov.json     copy of data_tables/run_v13refit.json; re / cv for college_d1, college_d3, hs from fit_runs /
                       fit_count_hs; lw and mlb unchanged; NO college_d2 entry (the engine then fills D2 from D3 and lists it
                       in D2_PLACEHOLDERS, so release_guard_d2.py still trips, as the doc requires until D2 is approved)
  export_report.json / export_report.md   the calibration errors, what the format can't carry, the load / parity proof

Mapping (the fit gives probabilities; the engine's count terms are logit offsets on top of its base + zone + class terms):
  - The fitted per-count rates are matched by calibration: the engine (Python, this tree) is asked, through the scoring
    harness's frozen calib-world pitcher (HS: the D3 mix; harness_adapters / fit_count_hs.AliasAssumption), for its
    per-count rates averaged over the level's own count x base-out x side x late mix; per count, one offset each is moved
    (added to every band, so v1.2's band shape is kept) until the engine gives back the fitted
        swing          -> swing[count][band]
        whiff | swing  -> whiff[count][band]
        foul | contact -> foul[count][band]
        called strike | take -> cstrike[count]
        ground ball | in play -> bip_gb[count]
    and swing by base-out -> swing_base_out[outs|bases] (one offset per state, shared by every count).
  - hard[count][band], out_table, runner: not owned by these fits (the college hard proxy is not Statcast hard contact);
    kept at v12.
  - Caveat (HARNESS_v13 R1, section 10): matching per-count rates under the frozen calib-world landing lets the count
    offsets absorb that landing's error. The Single-A zone-by-zone check stays required before any of this ships.
2026 is never used (the inputs are fit on <= 2025)."""
import argparse
import copy
import json
import math
import os
import subprocess
import sys
import time

import numpy as np

from . import fit_count_data as FD
from .harness_adapters import ROOT, COUNTS, PRIMARY_ASSUMPTION, EngineV12Adapter, bases_key

OUT = os.path.join(FD.FITS, "candidates")
VERSION = "v13prov"
# engine level -> (harness data level, candidate file, thin)
LEVELS = {"college_d1": ("D1", "D1_shared_thru2025.json", False),
          "college_d2": ("D2", "D2_shared_thru2025.json", True),
          "college_d3": ("D3", "D3_shared_thru2025.json", True),
          "hs": ("HS", "hs_sep_thru2025.json", False)}
RUN_LEVELS = {"college_d1": "D1_thru2025.json", "college_d3": "D3_thru2025.json", "hs": "hs_thru2025.json"}
CK = [f"{b}-{k}" for b, k in COUNTS]
BANDS = ("heart", "edge", "off", "noncomp")
BO = [f"{o}|{bases_key(bi)}" for o in range(3) for bi in range(8)]
TERMS = ("swing", "whiff_sw", "foul_ct", "cs_take", "gb")
MAX_OFFSET = 4.0     # cap on a calibrated delta (logit): the called strike moves only on edge / off takes, so some targets
                     # (HS 3-2) are out of the format's reach under the frozen landing; they stop here and are reported
NOT_CARRIED = [
    "count x base-out for anything but swing (whiff / foul / called strike / in play by base-out; the fit has them in p6_count_bo)",
    "platoon: per-count same / opposite-hand offsets (fit 'platoon'; real at HS: -0.0002 nats, 4 SE). The count table has no side term",
    "late-and-close per-count offsets (fit 'late_offset')",
    "ball-in-play result by count (and by count x base-out): the format's out_table is by contact quality x type, not count; only the ground-ball share by count (bip_gb) is carried",
    "the per-band shape of the fitted count terms (the fit has no zone; each count's offset is added to every band)",
    "run values by count x base-out (fit RV[count|outs|bases]); the run file carries additive re + cv only",
    "walk / strikeout linear weights (lw): not refit, kept at v12",
    "HS pitch class / kind x count multipliers and velocity terms (2025 gain +0.0103 nats per pitch): NEEDED NEW TABLE, "
    "e.g. count_<v>.json levels.hs.pitch[count][kind in FB CB SL CH][velo bin] as logit offsets on swing / whiff / foul / "
    "cstrike, with velocity both relative to the pitcher's own mean and absolute (bins as fit_count_hs.VREL_EDGES / VABS_EDGES)",
]


def logit(p):
    p = min(max(float(p), 1e-9), 1 - 1e-9)
    return math.log(p / (1 - p))


def load_cand(name):
    with open(os.path.join(FD.FITS, "count_layer", name), encoding="utf-8") as f:
        return json.load(f)


def targets(j):
    """fitted per-count rates (the level's own context mix) + swing by count x base-out."""
    t = {}
    for i, ck in enumerate(CK):
        c = j["count"][ck]
        p6 = c["p6"]
        take = p6[0] + p6[1] + p6[2]
        t[ck] = dict(swing=c["swing"], whiff_sw=c["whiff_given_swing"],
                     foul_ct=c["foul_given_swing"] / max(c["foul_given_swing"] + c["inplay_given_swing"], 1e-12),
                     cs_take=p6[2] / max(take, 1e-12), gb=j["bip"][ck]["type"]["ground"])
    pbo = np.asarray(j["p6_count_bo"])
    sw_bo = pbo[..., 3:].sum(axis=-1)                                     # [12, 3, 8]
    return t, sw_bo, np.asarray(j["n_count_bo"], float), np.asarray(j["late_share"], float)


# ----------------------------------------------------------------------------------------------------------------------
class Probe(EngineV12Adapter):
    """v1.2's harness adapter, at a given engine level, with the situation passed to type_mix (so bip_gb is seen)."""

    def __init__(self, engine_level, data_level):
        from .fit_count_hs import AliasAssumption
        super().__init__("college_d1", assumption=AliasAssumption(PRIMARY_ASSUMPTION))
        self.lv, self.dl = engine_level, data_level

    def engine_level(self, data_level):
        return self.lv

    def zone_responses(self, data_level, b, k, o, bi, same, late, needs):
        e = self.e
        orig = e.type_mix
        try:
            s_holder = {}
            out = {}

            def tm(p, q, c, s=None):
                return orig(p, q, c, s_holder["s"])
            e.type_mix = tm
            from .harness_adapters import bases_tuple
            s_holder["s"] = e.Situation(b, k, o, bases_tuple(bi), inning=9 if late else 1, margin=0, level=self.lv,
                                        same_side=same)
            out = super().zone_responses(data_level, b, k, o, bi, same, late, needs)
        finally:
            e.type_mix = orig
        return out


def engine_rates(probe, n_bo, late_share):
    """-> (per-count rates {ck: {term: value}}, swing [12, 3, 8]) averaged over the level's count x base-out x side x
    late mix (side by the frozen world's same-side share)."""
    probe._cache = {}
    T = probe.tables(probe.dl)
    P6, BIP = T.P6, T.BIP                                                # [12,3,8,3,2,6], [...,4,6]
    rates, sw_bo = {}, np.zeros((12, 3, 8))
    for i, (b, k) in enumerate(COUNTS):
        w_same = probe.assumption.same_share(probe.dl, b, k)
        ws = np.array([w_same, 1 - w_same])
        wl = np.array([1 - late_share[i], late_share[i]])
        w = n_bo[i][:, :, None, None] * ws[None, None, :, None] * wl[None, None, None, :]   # [3,8,2,2]
        p = P6[i][:, :, :2, :, :]                                        # sides same / opp
        agg = (p * w[..., None]).sum(axis=(0, 1, 2, 3)) / w.sum()
        ball, hbp, cs, wh, fo, ip = agg
        g = (BIP[i][:, :, :2, :, 0, :].sum(-1) * p[..., 5] * w).sum() / max((p[..., 5] * w).sum(), 1e-12)
        rates[CK[i]] = dict(swing=wh + fo + ip, whiff_sw=wh / (wh + fo + ip), foul_ct=fo / (fo + ip),
                            cs_take=cs / (ball + hbp + cs), gb=g)
        wsl = ws[None, None, :, None] * wl[None, None, None, :]
        sw_bo[i] = (p[..., 3:].sum(-1) * wsl).sum(axis=(2, 3)) / wsl.sum()
    return rates, sw_bo


def apply_offsets(L12, d, bo):
    """v12 level row + per-count deltas (added to every band) + base-out swing offsets -> new level row."""
    L = copy.deepcopy(L12)
    for ck in CK:
        for z in BANDS:
            L["swing"][ck][z] = L12["swing"][ck][z] + d[ck]["swing"]
            L["whiff"][ck][z] = L12["whiff"][ck][z] + d[ck]["whiff_sw"]
            L["foul"][ck][z] = L12["foul"][ck][z] + d[ck]["foul_ct"]
        L["cstrike"][ck] = L12["cstrike"][ck] + d[ck]["cs_take"]
        L["bip_gb"][ck] = L12["bip_gb"][ck] + d[ck]["gb"]
    for key in BO:
        L["swing_base_out"][key] = L12["swing_base_out"][key] + bo[key]
    return L


def errors(rates, sw_bo, t, t_bo, n_bo, min_n=500.0):
    per = {ck: {k: rates[ck][k] - t[ck][k] for k in TERMS} for ck in CK}
    mx = {k: max(abs(per[ck][k]) for ck in CK) for k in TERMS}
    m = n_bo >= min_n
    bo_err = np.abs(sw_bo - t_bo)
    return dict(max_by_term=mx, max_all_count_terms=max(mx.values()),
                swing_count_bo_max=float(bo_err[m].max()) if m.any() else None,
                swing_count_bo_wrms=float(np.sqrt((bo_err ** 2 * n_bo).sum() / n_bo.sum())), per_count=per)


def calibrate(e, lv, dl, j, iters=12, log=print, rates_fn=None):
    """Calibrate one level in memory (engine._CT[lv] is replaced, caches cleared). -> (new level row, errors).
    rates_fn(level row) -> (rates, swing [12,3,8]) replaces the engine probe (tests)."""
    t, t_bo, n_bo, late = targets(j)
    L12 = copy.deepcopy(e._CT[lv])
    d = {ck: {k: 0.0 for k in TERMS} for ck in CK}
    bo = {key: 0.0 for key in BO}
    probe = Probe(lv, dl) if rates_fn is None else None
    prev_d = {ck: {k: 0.0 for k in TERMS} for ck in CK}
    prev_lr = {ck: {k: 0.0 for k in TERMS} for ck in CK}
    for it in range(iters):
        e._CT[lv] = apply_offsets(L12, d, bo)
        if rates_fn is None:
            e._CNT.clear()
            e._GBV.clear()
            rates, sw_bo = engine_rates(probe, n_bo, late)
        else:
            rates, sw_bo = rates_fn(e._CT[lv])
        err = errors(rates, sw_bo, t, t_bo, n_bo)
        log(f"    {lv} iter {it}: max count-term error {err['max_all_count_terms']:.5f}, count x base-out swing max "
            f"{err['swing_count_bo_max']:.4f} (cells >= 500 pitches), wRMS {err['swing_count_bo_wrms']:.4f}")
        if err["max_all_count_terms"] < 2e-5 and it > 2:
            break
        for ck in CK:
            for k in TERMS:
                # secant step: the called strike responds only on edge / off (heart and way-off are fixed), so a
                # plain logit step under-shoots; the slope is measured from the last step (clipped)
                lr = logit(rates[ck][k])
                slope = 1.0
                if it > 0 and abs(d[ck][k] - prev_d[ck][k]) > 1e-9:
                    slope = min(1.5, max(0.05, (lr - prev_lr[ck][k]) / (d[ck][k] - prev_d[ck][k])))
                prev_lr[ck][k], prev_d[ck][k] = lr, d[ck][k]
                d[ck][k] += (logit(t[ck][k]) - lr) / slope
                d[ck][k] = min(MAX_OFFSET, max(-MAX_OFFSET, d[ck][k]))   # an unreachable target stops at the cap
        # base-out swing: the n-weighted mean logit gap per state across counts, centred (counts absorb the mean)
        gap = np.vectorize(logit)(np.clip(t_bo, 1e-6, 1 - 1e-6)) - np.vectorize(logit)(np.clip(sw_bo, 1e-6, 1 - 1e-6))
        per_state = (gap * n_bo).sum(axis=0) / np.maximum(n_bo.sum(axis=0), 1e-9)          # [3, 8]
        wst = n_bo.sum(axis=0)
        per_state -= (per_state * wst).sum() / wst.sum()
        for o in range(3):
            for bi in range(8):
                bo[f"{o}|{bases_key(bi)}"] += float(per_state[o, bi])
    return e._CT[lv], err


def run_candidate(e):
    with open(os.path.join(ROOT, "data_tables", "run_v13refit.json"), encoding="utf8") as f:
        R = json.load(f)
    R["version"] = VERSION
    R["about"] = ("PROVISIONAL v1.3 candidate (" + FD.PROVISIONAL + ") re / cv for college_d1, college_d3 and hs from "
                  "hitter_data.fit_runs / fit_count_hs (fit <= 2025, recency-weighted; count x base-out values are not "
                  "carried: the format is additive). lw and mlb are the refit's (run_v13refit). college_d2 deliberately absent (D3's by the "
                  "engine's placeholder rule; release_guard_d2.py still trips). Not the default.")
    for lv, fn in RUN_LEVELS.items():
        with open(os.path.join(FD.FITS, "run_values", fn), encoding="utf-8") as f:
            r = json.load(f)
        R["levels"][lv]["re"] = {bo: round(r["RE"][bo], 4) for bo in BO}
        c0 = r["CV"]["0-0"]
        R["levels"][lv]["cv"] = {ck: round(r["CV"][ck] - c0, 4) for ck in CK}
    R["levels"].pop("college_d2", None)
    e.check_table(R, "run_v13prov.json")
    return R


def write(obj, name):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, indent=1)
        f.write("\n")
    return p


# ----------------------------------------------------------------------------------------------------------------------
def verify(count_path, levels=None, thru=2025):
    """Fresh process with PITCH_COUNT_TABLE=count_path: the engine's per-count rates vs the fits, no in-memory edits."""
    import engine as e
    out = {"versions": e.TABLE_VERSIONS, "levels": {}}
    with open(count_path, encoding="utf8") as f:
        core = str(json.load(f).get("version", "")).startswith(CORE_VERSION)
    for lv, (dl, fn, thin) in LEVELS.items():
        if levels and lv not in levels:
            continue
        if core:                                  # a core file ships the candidates named in CORE_COUNT (D2 / D3: borrow)
            fn = CORE_COUNT[lv]
        j = load_cand(fn.replace("thru2025", f"thru{thru}"))
        t, t_bo, n_bo, late = targets(j)
        rates, sw_bo = engine_rates(Probe(lv, dl), n_bo, late)
        err = errors(rates, sw_bo, t, t_bo, n_bo)
        err.pop("per_count")
        out["levels"][lv] = err
    print(json.dumps(out))


def js_and_calls(count_path, run_path, log=print):
    """Load both candidates in Python (env) and JS (export_data --out + node), Python = JS, calls vs v12."""
    sys.path.insert(0, ROOT)
    import tests_v13_tables as TT
    env = {"PITCH_COUNT_TABLE": count_path, "PITCH_RUN_TABLE": run_path}
    scratch = os.path.join(OUT, "engine_data_v13prov.json")
    TT.export(env, scratch)
    with open(scratch, encoding="utf8") as f:
        D = json.load(f)
    inp = {"ars": TT.ARS, "cases": TT.cases(300, 21), "calls": TT.calls(40, 22), "levels": TT.LEVELS}
    py = json.loads(TT.run_py(ROOT, inp, env))
    js = json.loads(TT.run_js(ROOT, inp, scratch))
    v12 = json.loads(TT.run_py(ROOT, inp))
    top = lambda c: max(c, key=lambda x: x[0])[1:]
    changed = sum(top(a) != top(b) for a, b in zip(py["calls"], v12["calls"]))
    ver = subprocess.run([sys.executable, "-c", "import engine,json;print(json.dumps([engine.TABLE_VERSIONS, engine.D2_PLACEHOLDERS]))"],
                         cwd=ROOT, capture_output=True, text=True, env=dict(os.environ, PYTHONUTF8="1", **env))
    vers, d2p = json.loads(ver.stdout.strip()) if ver.returncode == 0 else (None, ver.stderr[-500:])
    guard = subprocess.run([sys.executable, "release_guard_d2.py"], cwd=ROOT, capture_output=True, text=True,
                           env=dict(os.environ, PYTHONUTF8="1", **env))
    res = dict(python_versions=vers, d2_placeholders=d2p, js_versions=D.get("TABLES", {}).get("versions"),
               py_vs_js_worst=TT.worst(py, js), outcome_cases=len(inp["cases"]),
               outcome_worst_vs_v12=TT.worst(py["cases"], v12["cases"]),
               calls=len(inp["calls"]), calls_top_changed_vs_v12=changed,
               release_guard_exit=guard.returncode)
    log(f"  JS / Python proof: {res}")
    return res


def run(write_files=True, log=print, prove=True):
    t0 = time.time()
    sys.path.insert(0, ROOT)
    import engine as e
    if dict(e.TABLE_VERSIONS) != CORE_BASE:     # v1.3 core: calibrated on the refit's count layer under zone_v13
        raise RuntimeError(f"run with {' '.join(f'{k}={v}' for k, v in CORE_ENV.items())} (loaded: {e.TABLE_VERSIONS})")
    with open(os.path.join(ROOT, "data_tables", "count_v13refit.json"), encoding="utf8") as f:
        C = json.load(f)
    C["version"] = VERSION
    C["about"] = ("PROVISIONAL v1.3 candidate (" + FD.PROVISIONAL + ") count layer for college_d1, college_d2 (THIN), "
                  "college_d3 (THIN) and hs (HS + travel, one model) from hitter_data.fit_count / fit_count_hs "
                  "(*_thru2025: D1/D2/D3 'shared + level offset', hs 'sep'), converted by hitter_data.export_candidates: "
                  "per-count offsets on swing / whiff / foul / cstrike / bip_gb and swing_base_out calibrated so the engine "
                  "gives back the fitted rates under the harness's frozen calib-world pitcher. hard, out_table, runner and "
                  "mlb are the refit's (count_v13refit). Not the default.")
    report = {"provisional": FD.PROVISIONAL, "version": VERSION, "levels": {}, "not_carried": NOT_CARRIED}
    for lv, (dl, fn, thin) in LEVELS.items():
        j = load_cand(fn)
        log(f"  {lv} ({fn}{', THIN' if thin else ''}):")
        L, err = calibrate(e, lv, dl, j, log=log)
        C["levels"][lv] = copy.deepcopy(L)
        report["levels"][lv] = dict(candidate=fn, thin=thin, calibration_errors={k: v for k, v in err.items() if k != "per_count"},
                                    per_count_errors=err["per_count"])
    e.check_table(C, "count_v13prov.json")
    R = run_candidate(e)
    if not write_files:
        return C, R, report
    cp, rp = write(C, "count_v13prov.json"), write(R, "run_v13prov.json")
    log(f"  wrote {cp}, {rp}")
    v = subprocess.run([sys.executable, "-m", "hitter_data.export_candidates", "--verify", cp], cwd=ROOT,
                       capture_output=True, text=True, env=dict(os.environ, PYTHONUTF8="1", PITCH_COUNT_TABLE=cp))
    if v.returncode != 0:
        raise RuntimeError(v.stderr[-3000:])
    report["fresh_process_check"] = json.loads(v.stdout.strip().splitlines()[-1])
    for lv, er in report["fresh_process_check"]["levels"].items():
        log(f"  fresh process, PITCH_COUNT_TABLE set: {lv}: max per-count error {er['max_all_count_terms']:.5f} "
            f"({', '.join(f'{k} {x:.5f}' for k, x in er['max_by_term'].items())}); count x base-out swing max "
            f"{er['swing_count_bo_max']:.4f}, wRMS {er['swing_count_bo_wrms']:.4f}")
    if prove:
        report["proof"] = js_and_calls(cp, rp, log)
    report["seconds"] = round(time.time() - t0, 1)
    write(report, "export_report.json")
    write_md(report)
    log(f"  done ({report['seconds']} s). Nothing in data_tables/ changed; nothing is the default.")
    return C, R, report


# ----------------------------------------------------------------------------------------------------------------------
# v1.3 core (feat/hitter-v13-core): the default count / run tables data_tables/count_v13core.json and run_v13core.json
CORE_VERSION = "v13core"
CORE_LEVELS = ("college_d1", "college_d2", "college_d3", "hs")   # v1.3 full data (Nov 22 ruling 1): D2 / D3 fitted too
# the count candidate each core level ships (ruling 1: D2 / D3 use "borrow"; D1 "shared", HS "sep" as in the core)
CORE_COUNT = {"college_d1": "D1_shared_thru2025.json", "college_d2": "D2_borrow_thru2025.json",
              "college_d3": "D3_borrow_thru2025.json", "hs": "hs_sep_thru2025.json"}
# run values fit on each level's own play-by-play (ruling 10: college levels take no scale from MLB)
CORE_RUN = {"college_d1": "D1_thru2025.json", "college_d2": "D2_thru2025.json", "college_d3": "D3_thru2025.json",
            "hs": "hs_thru2025.json"}
CORE_BASE = {"zone": "v13", "count": "v13refit", "run": "v13refit"}
CORE_ENV = {"PITCH_ZONE_TABLE": "v13", "PITCH_COUNT_TABLE": "v13refit", "PITCH_RUN_TABLE": "v13refit"}
V12_PENDING = ("v1.2 count layer pending the coverage rule: count terms are v1.2's (swing / whiff / foul / hard by count and "
               "band, base-out swing, ground ball by count); the called-strike kappas and in-play tables are the shared "
               "refit's (as count_v13refit)")


def core_paths():
    return {k: os.path.join(ROOT, "data_tables", f"{k}_{CORE_VERSION}.json") for k in ("count", "run")}


def run_core(log=print, prove=True, thru=2025, out_paths=None):
    """thru / out_paths (score_core): thru=2024 builds the "as scored" copy from the *_thru2024 candidates (fit <= 2024,
    so the harness may score it on 2025) and writes it to out_paths {"count": ..., "run": ...} instead of data_tables/.
    Calibrate the D1 and HS count candidates on top of the shared refit's count layer, under the approved zone table
    (zone_v13) and the harness's primary landing (h3, Single-A), and write the core defaults. HS gets the pitch kind x
    velocity table (fit_count_hs.pitch_table) after calibration: the count layer is the average pitch, the table moves a
    pitch off that average, as in the fit. D2 / D3 keep v1.2's count terms (labelled). Run values: D1 and HS from the fits,
    everything else the refit's."""
    t0 = time.time()
    sys.path.insert(0, ROOT)
    import engine as e
    from . import fit_count_hs as HS
    sys.path.insert(0, os.path.join(ROOT, "data_tables"))
    import build_v12
    if dict(e.TABLE_VERSIONS) != CORE_BASE:
        raise RuntimeError(f"run with {' '.join(f'{k}={v}' for k, v in CORE_ENV.items())} (loaded: {e.TABLE_VERSIONS})")
    with open(os.path.join(ROOT, "data_tables", "count_v13refit.json"), encoding="utf8") as f:
        C = json.load(f)
    old_path = os.path.join(OUT, "count_v13prov.json")
    old = json.load(open(old_path, encoding="utf8")) if os.path.exists(old_path) and thru == 2025 else None
    report = {"provisional": FD.PROVISIONAL, "version": CORE_VERSION, "base": CORE_BASE, "landing": PRIMARY_ASSUMPTION,
              "levels": {}}
    for lv in CORE_LEVELS:
        dl, _, thin = LEVELS[lv]
        fn = CORE_COUNT[lv].replace("thru2025", f"thru{thru}")
        j = load_cand(fn)
        t, t_bo, n_bo, late = targets(j)
        base_row = copy.deepcopy(e._CT[lv])
        rec = dict(candidate=fn, targets={ck: t[ck] for ck in CK})
        if old is not None and lv in old["levels"]:   # before: the h2 export's row, asked under the new landing and zone table
            e._CT[lv] = copy.deepcopy(old["levels"][lv])
            e._CNT.clear()
            e._GBV.clear()
            rb, swb = engine_rates(Probe(lv, dl), n_bo, late)
            eb = errors(rb, swb, t, t_bo, n_bo)
            rec["before_h2_row_rates"] = {ck: rb[ck] for ck in CK}
            rec["before_h2_row_errors"] = {k: v for k, v in eb.items() if k != "per_count"}
            rec["before_h2_offsets"] = {ck: dict(swing=old["levels"][lv]["swing"][ck]["heart"], cstrike=old["levels"][lv]["cstrike"][ck])
                                        for ck in CK}
            e._CT[lv] = base_row
            e._CNT.clear()
            e._GBV.clear()
        log(f"  {lv} ({fn}):")
        L, err = calibrate(e, lv, dl, j, log=log)
        L["label"] = (f"v1.3 core: PROVISIONAL count candidate ({fn}), calibrated under zone_v13 and the harness's h3 landing "
                      "(Single-A) on top of count_v13refit")
        C["levels"][lv] = copy.deepcopy(L)
        rec["after_errors"] = {k: v for k, v in err.items() if k != "per_count"}
        rec["after_offsets"] = {ck: dict(swing=L["swing"][ck]["heart"], cstrike=L["cstrike"][ck]) for ck in CK}
        report["levels"][lv] = rec
    if thru == 2025:
        with open(HS.PITCH_TABLE_OUT, encoding="utf-8") as f:
            C["levels"]["hs"]["pitch_velo"] = json.load(f)
    else:
        hcon = HS.connect()
        C["levels"]["hs"]["pitch_velo"] = HS.pitch_table({x: HS.load_season(hcon, x) for x in HS.SEASONS if x <= thru}, thru=thru)
    C["version"] = CORE_VERSION
    C["about"] = ("v1.3 core default count layer, full data (hitter_data.export_candidates --core). college_d1, college_d2, "
                  "college_d3 and hs: the count candidates fit on the full archives (" + FD.PROVISIONAL + "; D1 'shared', "
                  "D2 / D3 'borrow' (Nov 22 ruling 1), hs 'sep', thru2025) calibrated under zone_v13 and the harness's h3 "
                  "(Single-A) landing on top of count_v13refit; hs also carries pitch_velo (HS / travel pitch kind x velocity, "
                  "ruling 4). mlb: count_v13refit. Format: docs/TABLES_v13.md.")
    e.check_table(C, "count_v13core.json")
    with open(os.path.join(ROOT, "data_tables", "run_v13refit.json"), encoding="utf8") as f:
        R = json.load(f)
    for lv in CORE_LEVELS:
        R["levels"].setdefault(lv, copy.deepcopy(R["levels"]["college_d3"]))     # college_d2: its own entry now
        with open(os.path.join(FD.FITS, "run_values", CORE_RUN[lv].replace("thru2025", f"thru{thru}")), encoding="utf-8") as f:
            r = json.load(f)
        R["levels"][lv]["re"] = {bo: round(r["RE"][bo], 4) for bo in BO}
        c0 = r["CV"]["0-0"]
        R["levels"][lv]["cv"] = {ck: round(r["CV"][ck] - c0, 4) for ck in CK}
    R["version"] = CORE_VERSION
    R["about"] = ("v1.3 core default run values, full data (hitter_data.export_candidates --core): re / cv for college_d1, "
                  "college_d2, college_d3 and hs from hitter_data.fit_runs / fit_count_hs on each level's own play-by-play "
                  "(PROVISIONAL, fit <= 2025, recency-weighted; cv relative to 0-0): ruling 10, college levels take no run "
                  "values from MLB. mlb the shared refit's (run_v13refit); lw the refit's (college_d2's lw = college_d3's). The "
                  "run scale (engine run_scale) is 1 for college_d1 / d2 / d3 (own run values, ruling 10); the 0.481 pin (v1.2's MLB RE00) "
                  "only for mlb and hs. Format: docs/TABLES_v13.md.")
    e.check_table(R, "run_v13core.json")
    paths = out_paths or core_paths()
    if thru != 2025:
        C["version"] = R["version"] = f"{CORE_VERSION}_s{thru}"
        for obj in (C, R):
            obj["about"] = (f"SCORING COPY (hitter_data.score_core): as {CORE_VERSION} but from the *_thru{thru} candidates "
                            f"(fit <= {thru}), so the harness can score it out of sample. Not the default. ") + obj["about"]
    NL = chr(10)
    for kind, obj in (("count", C), ("run", R)):
        with open(paths[kind], "w", encoding="utf8", newline=NL) as f:
            f.write(build_v12.dumps(obj) + NL)
        log(f"  wrote {paths[kind]}")
    # fresh process: the written count rows without pitch_velo reproduce the fitted per-count rates
    scratch = os.path.join(OUT, "count_v13core_nopv.json" if thru == 2025 else f"count_v13core_s{thru}_nopv.json")
    C0 = copy.deepcopy(C)
    C0["levels"]["hs"].pop("pitch_velo")
    write(C0, os.path.basename(scratch))
    v = subprocess.run([sys.executable, "-m", "hitter_data.export_candidates", "--verify", scratch, "--levels", ",".join(CORE_LEVELS),
                        "--thru", str(thru)],
                       cwd=ROOT, capture_output=True, text=True,
                       env=dict(os.environ, PYTHONUTF8="1", PITCH_ZONE_TABLE="v13", PITCH_COUNT_TABLE=scratch, PITCH_RUN_TABLE=paths["run"]))
    if v.returncode != 0:
        raise RuntimeError(v.stderr[-3000:])
    report["fresh_process_check"] = json.loads(v.stdout.strip().splitlines()[-1])
    for lv, er in report["fresh_process_check"]["levels"].items():
        log(f"  fresh process: {lv}: max per-count error {er['max_all_count_terms']:.5f}; count x base-out swing max "
            f"{er['swing_count_bo_max']:.4f}, wRMS {er['swing_count_bo_wrms']:.4f}")
    report["seconds"] = round(time.time() - t0, 1)
    write(report, "core_export_report.json" if thru == 2025 else f"core_s{thru}_export_report.json")
    log(f"  done ({report['seconds']} s)")
    return C, R, report


def write_md(r):
    L = [f"# Candidate tables {VERSION} (PROVISIONAL)", "", FD.PROVISIONAL, "",
         "| level | candidate | max per-count error | swing | whiff/sw | foul/contact | cs/take | GB/BIP | count x base-out swing max (>= 500) | wRMS |",
         "|---|---|---|---|---|---|---|---|---|---|"]
    for lv, er in r.get("fresh_process_check", {}).get("levels", {}).items():
        m = er["max_by_term"]
        L.append(f"| {lv} | {r['levels'][lv]['candidate']} | {er['max_all_count_terms']:.5f} | " +
                 " | ".join(f"{m[k]:.5f}" for k in TERMS) + f" | {er['swing_count_bo_max']:.4f} | {er['swing_count_bo_wrms']:.4f} |")
    L += ["", "Not carried by the format:", ""] + [f"- {x}" for x in r["not_carried"]]
    if "proof" in r:
        L += ["", "Proof: " + json.dumps(r["proof"])]
    with open(os.path.join(OUT, "export_report.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(L) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verify", default=None)
    ap.add_argument("--no-proof", action="store_true")
    ap.add_argument("--levels", default=None, help="--verify only these engine levels (comma list)")
    ap.add_argument("--core", action="store_true", help="v1.3 core: write data_tables/count_v13core.json and run_v13core.json")
    ap.add_argument("--thru", type=int, default=2025, help="--verify against the *_thru<N> candidates")
    a = ap.parse_args(argv)
    if a.verify:
        verify(a.verify, levels=a.levels.split(",") if a.levels else None, thru=a.thru)
        return
    if a.core:
        run_core(prove=not a.no_proof)
        return
    run(prove=not a.no_proof)


if __name__ == "__main__":
    main()
