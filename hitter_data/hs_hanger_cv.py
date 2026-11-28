"""HS pitch kind x velocity refit on the engine's real base, and the hanger gate H from data (V1.3 audit items 9 and 10;
docs/REPORT_hs_hanger_cv_2026-11-27.md). Seasons through 2025 only: 2026 is never loaded (assert_not_heldout on every
season), --drew-go is never unlocked, Step 6 is not run.

A. The shipped HS table (count_v13core levels.hs.pitch_velo) was fit as residuals on hs_sep, a count-only base with no pitch
   kind or location terms, and the engine applies it on top of the zone table's class terms, so pitch class counts twice.
   Here the base is what the engine produces before pitch_velo, per pitch kind, through the harness adapter:
   EngineV12Adapter on the engine's own tables (zone_v13 class and location terms, the HS count row, the mean-preservation
   scalars) with levels.hs.pitch_velo removed, under the HS calibration world (fit_count_hs.HSVeloAssumption: the frozen
   Single-A mix at real HS speeds) restricted to the pitch's kind group (fastball / curve / slider / change; target and
   landed-zone shares within the kind are the harness's). A pitch with a blank kind gets the whole mix. The kind, velo_rel
   and velo_abs multipliers are then fit on that base exactly as fit_count_hs.pitch_table fits them (same sequential stack,
   same shrinkage TERM_ALPHA). Three versions are scored on the same per-pitch base with pitch_5way (nats per pitch):
     (i) shipped: the table as shipped is made (pitch_table: fit on hs_sep_thru<thru>), applied on the engine base;
     (ii) none: the engine base alone;
     (iii) refit: the stack fit on the engine base.
   Primary: fit <= 2024, score 2025, on the as-scored engine copy (count / run / mp from the *_thru2024 fits). Robustness:
   leave-one-season-out over 2022-2025 on the shipped engine (its count layer saw every season: the base is common to
   the three versions, the term fits are not).

B. The hanger gate: off-speed over the heart gets H x min(1, wild_today / HANGER_GATE_FULL) more hard-contact logit when
   wild_today > 0. Neither archive logs pitch location, and the college archive logs no pitch types, so "in the heart" is
   never observed and college pitches cannot say which pitch was thrown. H is fit on HS through the engine: per in-play
   off-speed pitch, P(result | in play) from the engine's per-kind tables with the gate applied to the heart band at a grid
   of gate values (interpolated), at the pitch's data wild_today (the engine's definition on the data: his strikes on that
   kind earlier in this game vs his normal, shrunk by LAND_K, times LAND_GAIN, capped). Scored with the harness's
   bip_result (nats per ball in play) on 2025 after a fit on <= 2024.

usage:
  python -m hitter_data.hs_hanger_cv tables [--workers N]   # per-kind engine tables (subprocesses, one per config)
  python -m hitter_data.hs_hanger_cv a [--boot 1000]        # task A scores
  python -m hitter_data.hs_hanger_cv b [--boot 1000]        # task B fit and scores
  python -m hitter_data.hs_hanger_cv ship                   # A's ship: the refit (<= 2025, shipped engine base) into
                                                            # data_tables/count_v13core.json levels.hs.pitch_velo
"""
import argparse
import copy
import json
import os
import pickle
import subprocess
import sys
import time

import numpy as np

from . import assert_not_heldout
from . import fit_count_data as FD
from . import fit_count_hs as HS
from . import harness as H
from .harness_adapters import CI, PRIMARY_ASSUMPTION, ROOT, EngineV12Adapter

OUT = os.environ.get("HS_HANGER_CV_OUT") or os.path.join(FD.FITS, "hs_hanger_cv")
CAND = os.path.join(FD.FITS, "candidates")
GROUPS = ("Fastball", "Curveball", "Slider", "Change-Up")          # = HS.KINDS[:4]
GROUP = {"FB": "Fastball", "SI": "Fastball", "FC": "Fastball", "SL": "Slider", "CB": "Curveball", "CH": "Change-Up"}
OFFSPEED = ("Curveball", "Slider", "Change-Up")
GATES = (-2.0, -1.0, -0.5, 0.0, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0)   # < 0 only to see the unconstrained optimum
SEED = 20261127
MEM_GUARD_GB = 48.0


def nopv_copy(src, dst, write=True):
    if not write:
        return dst
    C = json.load(open(src, encoding="utf-8"))
    C["levels"]["hs"].pop("pitch_velo", None)
    C["version"] = C.get("version", "") + "_nopv"
    C["about"] = "hs_hanger_cv scratch copy: levels.hs.pitch_velo removed. " + C.get("about", "")
    with open(dst, "w", encoding="utf-8", newline="\n") as f:
        json.dump(C, f, indent=1)
    return dst


def envs(write=False):
    """engine table configs: name -> env. s2024 = the as-scored copy (fit <= 2024); ship = the shipped default tables."""
    os.makedirs(OUT, exist_ok=True)
    ship_nopv = nopv_copy(os.path.join(ROOT, "data_tables", "count_v13core.json"), os.path.join(OUT, "count_v13core_nopv.json"), write)
    return {"s2024": {"PITCH_ZONE_TABLE": "v13", "PITCH_COUNT_TABLE": os.path.join(CAND, "count_v13core_s2024_nopv.json"),
                      "PITCH_RUN_TABLE": os.path.join(CAND, "run_v13core_s2024.json"),
                      "PITCH_MP_TABLE": os.path.join(CAND, "mp_v13_s2024.json")},
            "ship": {"PITCH_ZONE_TABLE": "v13", "PITCH_COUNT_TABLE": ship_nopv, "PITCH_RUN_TABLE": "v13core",
                     "PITCH_MP_TABLE": "v13"},
            # the as-scored copy with HS's mean-preservation scalars re-solved with the refit table on (what ships, fit <= 2024)
            "s2024cv": {"PITCH_ZONE_TABLE": "v13", "PITCH_COUNT_TABLE": os.path.join(CAND, "count_v13core_s2024_nopv.json"),
                        "PITCH_RUN_TABLE": os.path.join(CAND, "run_v13core_s2024.json"),
                        "PITCH_MP_TABLE": os.path.join(OUT, "mp_v13_s2024_hscv.json")}}


class KindAssumption(HS.HSVeloAssumption):
    """The HS calibration world (HSVeloAssumption) restricted to one pitch kind group (None = the whole mix)."""

    def __init__(self, group=None):
        super().__init__(PRIMARY_ASSUMPTION)
        self.group = group
        self.empty = []

    def mix(self, level, side, b, k):
        out = super().mix(level, side, b, k)
        if self.group is None or level != HS.DL:
            return out
        keep = [r for r in out if GROUP[self.arsenals[r[0]][r[1]]["kind"]] == self.group]
        bb = b
        while not keep and bb > 0:      # no row of this kind at this count (sliders at 3-0 / 3-1): the kind's own target and
            bb -= 1                     # landed-zone shares from one ball fewer; the engine is still asked at (b, k)
            keep = [r for r in super().mix(level, side, bb, k) if GROUP[self.arsenals[r[0]][r[1]]["kind"]] == self.group]
        if bb != b:
            self.empty.append((side, b, k, bb))
        if not keep:
            return out
        s = sum(r[4] for r in keep)
        return [r[:4] + (r[4] / s,) for r in keep]


def jobs():
    """(env, group, gate): every group at gate 0 on both configs; the off-speed groups at every gate on s2024 (task B)."""
    out = [(env, g, 0.0) for env in ("s2024", "ship") for g in (None,) + GROUPS]
    if os.path.exists(os.path.join(OUT, "mp_v13_s2024_hscv.json")):
        out += [("s2024cv", g, 0.0) for g in (None,) + GROUPS]
    out += [("s2024", g, x) for g in OFFSPEED for x in GATES if x != 0]
    return out


def job_name(env, group, gate):
    return f"{env}|{group or 'all'}|{gate:g}"


def build_one(env, group, gate):
    """In THIS process (env vars already set): the HS Tables for one kind group at one hanger gate value."""
    ad = EngineV12Adapter("college_d1", assumption=KindAssumption(group))
    e = ad.e
    want = envs()[env]
    for k, v in want.items():
        if os.environ.get(k) != v:
            raise RuntimeError(f"{k} is {os.environ.get(k)!r}, want {v!r}")
    if e.HANGER_GATE:
        raise RuntimeError("the zone table's hanger gate is not 0: these tables assume the gate only where set here")
    if gate:
        e.hanger_gate = lambda p, s, G=gate: G if e.is_offspeed(p.kind) else 0.0
    t0 = time.time()
    t = ad.tables(HS.DL)
    path = os.path.join(OUT, "tables", job_name(env, group, gate).replace("|", "_") + ".npz")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    np.savez_compressed(path, P6=t.P6, BIP=t.BIP)
    meta = dict(env=env, group=group, gate=gate, seconds=round(time.time() - t0, 1), empty=sorted(set(ad.assumption.empty)),
                table_versions=dict(e.TABLE_VERSIONS), has_pitch_velo=bool((e._CT.get("hs") or {}).get("pitch_velo")))
    with open(path[:-4] + ".json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, default=str)
    print(f"  {job_name(env, group, gate)}: {meta['seconds']} s, empty {meta['empty']}", flush=True)


def tables_path(env, group, gate):
    return os.path.join(OUT, "tables", job_name(env, group, gate).replace("|", "_") + ".npz")


def run_tables(workers=None, only=None):
    from .kgap_diag import mem_used_gb
    workers = workers or max(1, (os.cpu_count() or 4) - 2)
    E = envs(write=True)
    todo = [j for j in jobs() if (only is None or j[0] == only) and not os.path.exists(tables_path(*j))]
    running = []
    t0 = time.time()
    while todo or running:
        running = [(j, p) for j, p in running if p.poll() is None or _check(j, p)]
        while todo and len(running) < workers and (mem_used_gb() or 0) < MEM_GUARD_GB:
            j = todo.pop(0)
            env = dict(os.environ, PYTHONUTF8="1", **E[j[0]])
            cmd = [sys.executable, "-m", "hitter_data.hs_hanger_cv", "one", j[0], j[1] or "all", str(j[2])]
            running.append((j, subprocess.Popen(cmd, cwd=ROOT, env=env)))
        time.sleep(2)
    print(f"tables done in {time.time() - t0:.0f} s", flush=True)


def _check(j, p):
    if p.returncode:
        raise SystemExit(f"table job {job_name(*j)} failed ({p.returncode})")
    return False


def load_tables(env, gate=0.0, groups=(None,) + GROUPS):
    out = {}
    for g in groups:
        z = np.load(tables_path(env, g, gate))
        out[g] = (z["P6"], z["BIP"])
    return out


def ship(log=print):
    """Write the refit table (every season <= 2025, on the shipped engine before pitch_velo) into count_v13core.json."""
    from .hs_hanger_cv_a import engine_base
    sys.path.insert(0, os.path.join(ROOT, "data_tables"))
    import build_v12
    con = HS.connect()
    Ss = {s: HS.load_season(con, s) for s in HS.SEASONS}
    T = load_tables("ship")
    tab = HS.pitch_table_engine_base(Ss, lambda S: engine_base(T, S), thru=2025,
                                     base_label="the shipped engine before pitch_velo (zone_v13, count_v13core's HS row "
                                                "without pitch_velo, mp_v13; per pitch kind in the HS calibration world)")
    path = os.path.join(ROOT, "data_tables", "count_v13core.json")
    C = json.load(open(path, encoding="utf-8"))
    old = C["levels"]["hs"]["pitch_velo"]
    C["levels"]["hs"]["pitch_velo"] = tab
    with open(path, "w", encoding="utf-8", newline=chr(10)) as f:
        f.write(build_v12.dumps(C) + chr(10))
    log(f"wrote {path}: levels.hs.pitch_velo refit on {tab['seasons']} (0-2 kind multipliers, old -> new):")
    for k in HS.KINDS:
        log(f"   {k:10s} {old['kind']['0-2'][k]} -> {tab['kind']['0-2'][k]}")
    return tab


S2024_CV = os.path.join(OUT, "count_v13core_s2024_hscv.json")      # the as-scored copy with the refit (fit <= 2024)
MP_S2024_CV = os.path.join(OUT, "mp_v13_s2024_hscv.json")


def as_scored_count(log=print):
    """count_v13core_s2024.json with levels.hs.pitch_velo = the refit fit <= 2024 on the as-scored engine base (the table
    task A's primary scores), for MP_AS_SCORED=2024 mean_preserve solve hs."""
    from .hs_hanger_cv_a import engine_base
    con = HS.connect()
    Ss = {s: HS.load_season(con, s) for s in HS.SEASONS if s <= 2024}
    T = load_tables("s2024")
    tab = HS.pitch_table_engine_base(Ss, lambda S: engine_base(T, S), thru=2024,
                                     base_label="the as-scored engine copy before pitch_velo (fit <= 2024)")
    C = json.load(open(os.path.join(CAND, "count_v13core_s2024.json"), encoding="utf-8"))
    C["levels"]["hs"]["pitch_velo"] = tab
    C["version"] = "v13core_s2024_hscv"
    C["about"] = "hs_hanger_cv: as count_v13core_s2024 with the HS pitch_velo refit on the engine base (fit <= 2024). " + C["about"]
    with open(S2024_CV, "w", encoding="utf-8", newline=chr(10)) as f:
        json.dump(C, f, indent=1)
    log(f"wrote {S2024_CV}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=("tables", "one", "a", "b", "ship", "as-scored-count"))
    ap.add_argument("args", nargs="*")
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--only", default=None)
    ap.add_argument("--boot", type=int, default=1000)
    a = ap.parse_args(argv)
    if a.cmd == "one":
        env, g, gate = a.args
        build_one(env, None if g == "all" else g, float(gate))
    elif a.cmd == "tables":
        run_tables(a.workers, a.only)
    elif a.cmd == "a":
        from .hs_hanger_cv_a import run_a
        run_a(B=a.boot)
    elif a.cmd == "as-scored-count":
        as_scored_count()
    elif a.cmd == "ship":
        ship()
    elif a.cmd == "b":
        from .hs_hanger_cv_b import run_b
        run_b(B=a.boot)


if __name__ == "__main__":
    main()
