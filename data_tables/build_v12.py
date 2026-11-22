"""v1.3 Part 2: writes the v1.2-equivalent table files (zone_v12.json, count_v12.json, run_v12.json) that the engines read.

The engines read their zone effects, count layer and run values from versioned files in data_tables/ (docs/TABLES_v13.md).
This script is the provenance of the v12 files: it restates v1.2's numbers in the file formats.
  - zone: the band base rates S0 / C0 / W0 / F0 / Q0 / ZONE_IN and the hand class terms (W_FB, KIND_W_OS, the off-speed
    location line, the +0.2 off-speed chase, the +0.5 hanger) that were literals in engine.py / app/engine.js; the fitted
    cells are all 0 (v1.2 has no fitted zone table).
  - count: v1.2's count terms in outcome_probs (swing: +0.9 at two strikes, -0.4 at 0-0, -2.0 at 3-0, hitter's counts +0.3
    in the zone / -0.4 out; foul: +0.3 at two strikes), the called-strike count kappas (fit_v08.json ship.kappa centred on
    sim_constants.json TAKE_W, exactly as engine.py's _apply_fit did), and the typed ball-in-play tables
    (inplay_typed_params.py: OUT_TABLE, RUNNER_FIT p_GB / p_FB / S_DP). Every other count cell is 0.
  - run: RE24 and count values (run_tables.py) and the walk / strikeout run values (college_run_values.json _lw_bb / _lw_k).
College D2 is left out of every per-level table that was D3's (run values, in-play tables), so engine.py's
_fill_d2_placeholders still marks them and release_guard_d2.py still trips. The count terms are the same at every level
in v1.2, so D2 has them too.

v1.3 core (feat/hitter-v13-core): the v1.2 sources are read from git at V12_SOURCE (90fca9b, the prework tip, where
fit_v08.json / sim_constants.json / inplay_typed_params.py / run_tables.py / college_run_values.json are still v1.2's), so
the v12 files stay v1.2 bit for bit after the shared refit replaced those sources in the working tree.
data_tables/build_v13refit.py builds the same three tables from the working-tree (refit) sources.

  python3 data_tables/build_v12.py           -> (re)write the three files
  python3 data_tables/build_v12.py --check   -> exit 1 if a shipped file differs from what this script builds
"""
import json, os, subprocess, sys, types

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

BANDS = ("heart", "edge", "off", "noncomp")
PROFILES = ("FB", "SI", "FC", "SL", "SW", "CB", "CH", "SP")      # hitter_data/zone_defs.py PROFILES
COUNT_GROUPS = ("first", "ahead", "even", "behind", "two")       # hitter_data/zone_defs.py COUNT_GROUPS
HEIGHTS = ("up", "mid", "down")                                  # hitter_data/zone_defs.py HEIGHTS
COUNTS = tuple(f"{b}-{k}" for k in range(3) for b in range(4))  # 0-0, 1-0, 2-0, 3-0, 0-1, ... 3-2
BASES = ("000", "100", "020", "120", "003", "103", "023", "123")
BASE_OUT = tuple(f"{o}|{b}" for o in range(3) for b in BASES)
ZONE_OUTCOMES = ("swing", "cstrike", "whiff", "foul", "hard")
COUNT_BAND_OUTCOMES = ("swing", "whiff", "foul", "hard")
COUNT_LEVELS = ("mlb", "college_d1", "college_d2", "college_d3", "hs")
FIT_LEVELS = ("mlb", "college_d1", "college_d3", "hs")           # levels with their own in-play / run tables (D2 = D3's)
V12_SOURCE = "90fca9b"                                           # git commit holding v1.2's source files


class Source:
    """where the source files are read from: git commit `rev`, or the working tree (rev None)"""

    def __init__(self, rev=None):
        self.rev = rev

    def text(self, name):
        if self.rev is None:
            return open(os.path.join(ROOT, name), encoding="utf8").read()
        return subprocess.run(["git", "show", f"{self.rev}:{name}"], cwd=ROOT, capture_output=True, check=True).stdout.decode("utf8")

    def json(self, name):
        return json.loads(self.text(name))

    def module(self, name):
        mod = types.ModuleType(name[:-3])
        exec(compile(self.text(name), name, "exec"), mod.__dict__)
        return mod


V12 = Source(V12_SOURCE)


def zone_v12():
    cells = {o: {z: {p: {g: {h: 0.0 for h in HEIGHTS} for g in COUNT_GROUPS} for p in PROFILES} for z in BANDS}
             for o in ZONE_OUTCOMES}
    return {
        "kind": "zone", "version": "v12",
        "about": "v1.2's zone effects restated (data_tables/build_v12.py). base: per landing band; class: v1.0's hand class "
                 "terms; cells: logit offsets by band x profile x count group x height (all 0: v1.2 has no fitted zone table). "
                 "Format: docs/TABLES_v13.md.",
        "bands": list(BANDS), "profiles": list(PROFILES), "count_groups": list(COUNT_GROUPS), "heights": list(HEIGHTS),
        "base": {
            "swing": {"heart": 0.72, "edge": 0.50, "off": 0.28, "noncomp": 0.05},
            "cstrike": {"heart": 0.98, "edge": 0.55, "off": 0.08, "noncomp": 0.0},
            "whiff": {"heart": 0.12, "edge": 0.20, "off": 0.34, "noncomp": 0.50},
            "foul": {"heart": 0.40, "edge": 0.50, "off": 0.50, "noncomp": 0.45},
            "quality": {"heart": [0.30, 0.38, 0.32], "edge": [0.48, 0.34, 0.18], "off": [0.60, 0.30, 0.10],
                        "noncomp": [0.75, 0.20, 0.05]},
            "zone_in": {"heart": 1.0, "edge": 0.5, "off": 0.0, "noncomp": 0.0},
        },
        "class": {
            "whiff_fb": -0.20,
            "whiff_os": {"SL": 0.25, "CB": 0.20, "CH": 0.25},
            "line_low": 0.4, "line_up": -1.0, "line_whiff": 0.25, "line_hard": -0.3, "up_mid_hard": 0.4,
            "chase_os": {"off": 0.2, "noncomp": 0.0},
            "hanger_hard": 0.5,
        },
        "cells": cells,
        "level_cells": {},
    }


def _count_swing(b, k, z):
    if k == 2:
        return 0.9
    if (b, k) == (0, 0):
        return -0.4
    if (b, k) == (3, 0):
        return -2.0
    if b > k:
        return 0.3 if z in ("heart", "edge") else -0.4
    return 0.0


def _kappa(src=V12):
    """engine.py _apply_fit (v1.2), term for term: fit_v08.json ship.kappa with 0-0 = 0, centred on the simulated take mix"""
    sh = src.json("fit_v08.json")["ship"]
    sim = src.json("sim_constants.json")
    raw = {(0, 0): 0.0}
    raw.update({tuple(int(x) for x in c.split("-")): v for c, v in sh["kappa"].items()})
    w = sim.get("TAKE_W")
    if w:
        mean = sum(w.get(f"{b}-{k}", 0.0) * v for (b, k), v in raw.items()) / sum(w.values())
    else:
        mean = sum(raw.values()) / len(raw)
    return {f"{b}-{k}": v - mean for (b, k), v in raw.items()}


def count_v12(src=V12):
    itp = src.module("inplay_typed_params.py")
    kap = _kappa(src)
    levels = {}
    for lv in COUNT_LEVELS:
        t = {}
        for o in COUNT_BAND_OUTCOMES:
            t[o] = {}
            for c in COUNTS:
                b, k = int(c[0]), int(c[2])
                if o == "swing":
                    t[o][c] = {z: _count_swing(b, k, z) for z in BANDS}
                elif o == "foul":
                    t[o][c] = {z: (0.3 if k == 2 else 0.0) for z in BANDS}
                else:
                    t[o][c] = {z: 0.0 for z in BANDS}
        t["swing_base_out"] = {bo: 0.0 for bo in BASE_OUT}
        t["cstrike"] = {c: kap[c] for c in COUNTS}
        t["bip_gb"] = {c: 0.0 for c in COUNTS}
        if lv in FIT_LEVELS:
            t["out_table"] = {q: {ty: list(v) for ty, v in itp.OUT_TABLE[lv][q].items()} for q in ("weak", "solid", "hard")}
            t["runner"] = {k_: itp.RUNNER_FIT[lv][k_] for k_ in ("p_GB", "p_FB", "S_DP")}
        levels[lv] = t
    return {
        "kind": "count", "version": "v12",
        "about": "v1.2's count layer restated (data_tables/build_v12.py): logit offsets by count (and band / base-out), "
                 "called-strike kappas, ball-in-play type offset and typed outcome tables per level. Format: docs/TABLES_v13.md.",
        "bands": list(BANDS), "counts": list(COUNTS), "base_out": list(BASE_OUT), "levels": levels,
    }


def run_v12(src=V12):
    rt = src.module("run_tables.py")
    rv = src.json("college_run_values.json")
    lw_src = {"mlb": "mlb_check", "college_d1": "college_d1", "college_d3": "college_d3", "hs": "hs"}
    levels = {}
    for lv in FIT_LEVELS:
        levels[lv] = {
            "re": {f"{o}|{b}": v for (o, b), v in rt.RE_BY_LEVEL[lv].items()},
            "cv": {f"{b}-{k}": v for (b, k), v in rt.CV_BY_LEVEL[lv].items()},
            "lw": {"bb": rv[lw_src[lv]]["_lw_bb"], "k": rv[lw_src[lv]]["_lw_k"]},
        }
    return {
        "kind": "run", "version": "v12",
        "about": "v1.2's run values restated (data_tables/build_v12.py): RE24 by outs|bases, count values by balls-strikes "
                 "(hitter's runs vs 0-0), walk / strikeout run values, per level. College D2 has none yet (it reads D3's: "
                 "PLACEHOLDER). Format: docs/TABLES_v13.md.",
        "levels": levels,
    }


def dumps(obj, ind=0):
    """JSON with one line per innermost table (a dict or list of numbers stays on one line); plain json.loads reads it."""
    sp = " " * ind
    if isinstance(obj, dict):
        if not obj:
            return "{}"
        if all(not isinstance(v, (dict, list)) or (isinstance(v, list) and all(not isinstance(x, (dict, list)) for x in v))
               for v in obj.values()) and len(obj) <= 32:
            return "{" + ", ".join(f"{json.dumps(k)}: {json.dumps(v)}" for k, v in obj.items()) + "}"
        inner = ",\n".join(f"{sp} {json.dumps(k)}: {dumps(v, ind + 1)}" for k, v in obj.items())
        return "{\n" + inner + "\n" + sp + "}"
    return json.dumps(obj)


BUILD = {"zone": zone_v12, "count": count_v12, "run": run_v12}


def main():
    check = "--check" in sys.argv
    bad = []
    for kind, fn in BUILD.items():
        path = os.path.join(HERE, f"{kind}_v12.json")
        text = dumps(fn()) + "\n"
        if check:
            cur = open(path, encoding="utf8", newline="").read() if os.path.exists(path) else None
            same = cur is not None and json.loads(cur) == json.loads(text)
            print(f"  {'ok  ' if same else 'FAIL'} {kind}_v12.json matches what build_v12.py builds from the v1.2 sources")
            if not same:
                bad.append(kind)
        else:
            with open(path, "w", encoding="utf8", newline="\n") as f:
                f.write(text)
            print("wrote", path)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
