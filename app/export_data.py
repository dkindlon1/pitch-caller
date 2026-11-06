"""Export the Python engine's tables to app/engine_data.json for the JavaScript engine.
The Python engine is the reference; run this after any change to its tables, then app/make_parity_v10.py + parity_v10.js.
Usage (from the repo root): python3 app/export_data.py [--check]   (--check: compare to the current file, write nothing)"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
os.chdir(os.path.join(HERE, ".."))
import engine as e

LEVELS = ["mlb", "college_d1", "college_d3", "hs"]
bk = lambda b: ("1" if b[0] else "0") + ("2" if b[1] else "0") + ("3" if b[2] else "0")
data = {
    "RE": {l: {f"{o}|{b}": v for (o, b), v in e.RE_BY_LEVEL[l].items()} for l in LEVELS},
    "CV": {l: {f"{b}-{k}": v for (b, k), v in e.CV_BY_LEVEL[l].items()} for l in LEVELS},
    "IN_PLAY": {l: {c: list(v) for c, v in e.IN_PLAY_BY_LEVEL[l].items()} for l in LEVELS},
    "OUTCOME_ADJ": {l: dict(e.OUTCOME_ADJ[l]) for l in LEVELS},
    "LW": {l: list(e.LW_BY_LEVEL[l]) for l in LEVELS if l in e.LW_BY_LEVEL},
    "LEVEL": {l: dict(e.LEVEL[l]) for l in LEVELS},
}
# v0.8 tables (docs/SPEC_v0.8.md): fitted parameters, typed batted balls, shared simulation constants, win tables
import inplay_typed_params as itp
from hitter_spread_params import HITTER_SPREAD
data["V08"] = {
    "P08": dict(e.P08), "TYPED": e.TYPED, "RHO_L": e.RHO_L,
    "KAPPA_FIT": {f"{b}-{k}": v for (b, k), v in e.KAPPA_FIT.items()},
    "SIM": {k: v for k, v in e.SIM_CONST.items() if k in ("A_BAR", "I_BAR_UMP", "T_unc", "I0_GRADE", "TAKE_W", "PITCHES_PER_PA")},
    "OUT_TABLE": itp.OUT_TABLE, "RUNNER_FIT": itp.RUNNER_FIT, "HITTER_SPREAD": HITTER_SPREAD, "RUN_GAME": dict(e.RUN_GAME),
}
data["WE"] = json.load(open(os.path.join(HERE, "..", "we_tables.json")))
# v1.0 3.7: real usage by count and platoon (fit_mix_prior.py), the operator's baseline; both engines read these numbers
data["MIX_PRIOR"] = {"u_T": e.MIX_PRIOR["u_T"], "u_L": e.MIX_PRIOR["u_L"]}
import hashlib
# a fingerprint of the tables, logged with every pitch so a replay knows which numbers made the call
data["version"] = hashlib.sha1(json.dumps({k: v for k, v in data.items() if k != "version"}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:10]
path = os.path.join(HERE, "engine_data.json")
if "--check" in sys.argv:
    cur = json.load(open(path))
    def diff(a, b, p=""):
        if isinstance(a, dict):
            ks = set(a) | set(b) if isinstance(b, dict) else set(a)
            return [x for k in ks for x in diff(a.get(k), b.get(k) if isinstance(b, dict) else None, p + "." + str(k))]
        if isinstance(a, list):
            return [x for i, (u, v) in enumerate(zip(a, b or [])) for x in diff(u, v, f"{p}[{i}]")] + ([p + " length"] if len(a) != len(b or []) else [])
        return [] if (a == b or (isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) < 1e-12)) else [f"{p}: {a} vs {b}"]
    d = diff(data, cur)
    print("identical to the current engine_data.json" if not d else f"{len(d)} differences, e.g. {d[:5]}")
    sys.exit(1 if d else 0)
json.dump(data, open(path, "w"), separators=(",", ":"))
print("wrote", path)
