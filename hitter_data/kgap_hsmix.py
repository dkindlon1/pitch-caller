"""K-gap diagnosis (report only; nothing here is wired): the HS count layer balanced against the real HS pitch mix.

The shipped HS count layer (count_v13core levels.hs) is calibrated in the harness under the D3 / Single-A mix
(AliasAssumption: the frozen world has no HS mix). Real HS pitchers throw many more fastballs at every count
(hs_real_kind_usage.json, from hs.sqlite3 2022-25). This rebuilds the HS row exactly as export_candidates.run_core does,
but with each count's mix rows reweighted so the pitch-kind group shares (fastball = FB / SI / FC, curve, slider, change)
match real HS usage at that count; target / landed-zone shares within a kind are the harness's. Output is a scratch
count table (kgap_diag/tables/count_v13core_hsmix.json: the shipped table with levels.hs replaced, pitch_velo kept)
for the diagnostic sim variant "hsbal", plus a report of how the offsets move.

Run with the core's calibration env: PITCH_ZONE_TABLE=v13 PITCH_COUNT_TABLE=v13refit PITCH_RUN_TABLE=v13refit
Usage: python -m hitter_data.kgap_hsmix [check]   (check: rebuild under the shipped mix first, to prove the path)
"""
import copy
import json
import os
import sys

from . import export_candidates as X
from . import fit_count_hs as HS

DIAG = "C:/dev/pitchiq-data/kgap_diag"
GROUP = {"FB": "Fastball", "SI": "Fastball", "FC": "Fastball", "SL": "Slider", "CB": "Curveball", "CH": "Change-Up"}


class HSMixAssumption(HS.AliasAssumption):
    REAL = json.load(open(os.path.join(DIAG, "hs_real_kind_usage.json"), encoding="utf-8"))

    def mix(self, level, side, b, k):
        out = super().mix(level, side, b, k)
        if level != HS.DL:
            return out
        real = self.REAL[f"{b}-{k}"]
        g = [GROUP[self.arsenals[a][j]["kind"]] for a, j, _, _, _ in out]
        have = {}
        for (a, j, q, z, w), gg in zip(out, g):
            have[gg] = have.get(gg, 0.0) + w
        tot_real = sum(real.get(gg, 0.0) for gg in have)          # groups the harness arsenals can throw
        out = [(a, j, q, z, w * real.get(gg, 0.0) / tot_real / have[gg]) for (a, j, q, z, w), gg in zip(out, g)]
        s = sum(r[4] for r in out)
        return [r[:4] + (r[4] / s,) for r in out]


def rebuild(assumption_cls, log=print):
    sys.path.insert(0, X.ROOT)
    import engine as e
    if dict(e.TABLE_VERSIONS) != X.CORE_BASE:
        raise RuntimeError(f"run with {X.CORE_ENV} (loaded {e.TABLE_VERSIONS})")
    keep = HS.AliasAssumption
    HS.AliasAssumption = assumption_cls
    try:
        lv, dl = "hs", X.LEVELS["hs"][0]
        j = X.load_cand(X.CORE_COUNT[lv])
        base = copy.deepcopy(e._CT[lv])
        L, err = X.calibrate(e, lv, dl, j, log=log)
        L = copy.deepcopy(L)
        e._CT[lv] = base
        e._CNT.clear()
        e._GBV.clear()
    finally:
        HS.AliasAssumption = keep
    return L, err


def main():
    shipped = json.load(open(os.path.join(X.ROOT, "data_tables", "count_v13core.json"), encoding="utf-8"))
    S = shipped["levels"]["hs"]
    rep = {}
    if "check" in sys.argv[1:]:
        L0, e0 = rebuild(HS.AliasAssumption)
        rep["check_max_abs_diff_vs_shipped"] = max(
            max(abs(L0["swing"][ck][z] - S["swing"][ck][z]) for ck in X.CK for z in X.BANDS),
            max(abs(L0["whiff"][ck][z] - S["whiff"][ck][z]) for ck in X.CK for z in X.BANDS),
            max(abs(L0["cstrike"][ck] - S["cstrike"][ck]) for ck in X.CK))
        print("check", rep["check_max_abs_diff_vs_shipped"], flush=True)
    L, err = rebuild(HSMixAssumption)
    rep["errors"] = {k: v for k, v in err.items() if k != "per_count"}
    rep["offset_change_hsmix_minus_shipped"] = {
        ck: dict(swing=L["swing"][ck]["heart"] - S["swing"][ck]["heart"], whiff=L["whiff"][ck]["heart"] - S["whiff"][ck]["heart"],
                 foul=L["foul"][ck]["heart"] - S["foul"][ck]["heart"], cstrike=L["cstrike"][ck] - S["cstrike"][ck])
        for ck in X.CK}
    C = copy.deepcopy(shipped)
    pv = C["levels"]["hs"].get("pitch_velo")
    C["levels"]["hs"] = L
    if pv is not None:
        C["levels"]["hs"]["pitch_velo"] = pv
    C["about"] = "SCRATCH (kgap diagnosis, not the default): count_v13core with levels.hs recalibrated under the real HS kind mix. " + C["about"]
    os.makedirs(os.path.join(DIAG, "tables"), exist_ok=True)
    with open(os.path.join(DIAG, "tables", "count_v13core_hsmix.json"), "w", encoding="utf-8") as f:
        json.dump(C, f, indent=1)
    with open(os.path.join(DIAG, "hsmix_report.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, indent=1)
    print(json.dumps(rep["errors"]), flush=True)
    for ck, v in rep["offset_change_hsmix_minus_shipped"].items():
        print(ck, {k: round(x, 3) for k, x in v.items()})


if __name__ == "__main__":
    main()
