"""v1.3 (Drew's Nov 24 ruling 12): per-count mean preservation, computed exactly.

For each level and count, one logit level shift per outcome (swing, whiff | swing, foul | contact, called strike | take,
and in play's ground-ball share) is added on top of the zone table, the pitch-kind effects and (HS) the pitch kind x
velocity table, the same in every band / zone cell / kind / speed (engine.mp_cells, folded into engine.count_cells), so
relative effects between zones, kinds and speeds are unchanged. The shifts are solved (Newton / secant to machine-level
agreement, no cap) so that under the REFERENCE WORLD the engine gives back the fitted count layer's per-count rates:

  reference world = the real pitch mix by count + the average-pitcher landing model (harness h3): the harness's frozen
  pitchers, pitches and targets, each pitch landing in a given band (EngineV12Adapter: the engine's own calls and landing
  never enter), the hitter the engine's unknown average hitter, averaged over the level's own count x base-out x side x
  late mix (export_candidates.engine_rates)
    college D1 / D2 / D3  the harness's h3 world (Assumption "single_a": Single-A class x band landing), the mix the count
                          layer is calibrated to; targets = the weighted ship candidates (export_candidates.CORE_COUNT)
    HS                    the HS world the count layer is calibrated in (D3's h3 rows, the two arsenals at real HS speeds,
                          fit_count_hs.HSVeloAssumption) with each count's pitch-kind group shares (fastball / curve /
                          slider / change) set to real HS usage from hs.sqlite3 (the HS count fit's games, seasons and
                          recency weights); targets = hs_sep_thru2025
    MLB (control)         the same frozen pitchers / pitches / targets (D1's rows) with the landed band reweighted per side x
                          count to MLB Statcast's class x band shares (2021-25, recency half-life 2, exactly as h3 does for
                          Single-A); targets = MLB Statcast per-count rates over the same seasons and weights (zone_load
                          filters: no bunts / pitchouts / intentional or automatic balls), base-out and late mix from the
                          same rows. The MLB count table (count_v13refit = v1.2's terms) was never calibrated to a world;
                          this is its reference.

The count table (the fitted count layer) is never changed. Output: data_tables/mp_v13.json (format docs/TABLES_v13.md;
its inputs' sha256 are in the file) and {DATA}/mean_preserve/<level>.json (solve log, rates vs targets per count).

    python -m hitter_data.mean_preserve solve [levels]     # one process per level (pool), then writes mp_v13.json
    python -m hitter_data.mean_preserve verify             # fresh process, PITCH_MP_TABLE=v13: rates vs targets, the chain
"""
import copy
import hashlib
import json
import math
import os
import sqlite3
import subprocess
import sys
import time
from collections import defaultdict

import numpy as np

from . import DATA, assert_not_heldout
from .harness_adapters import ROOT, COUNTS, PRIMARY_ASSUMPTION, Assumption, HARNESS_ASSUMPTION_VERSION

OUT_DIR = os.path.join(DATA, "mean_preserve")
# v1.3 Part 3: MP_AS_SCORED=2024 solves the scalars of score_core's "as scored" copy (fit <= 2024: the *_thru2024 candidates,
# with PITCH_COUNT_TABLE / PITCH_RUN_TABLE set to fits/candidates/{count,run}_v13core_s2024.json) into
# fits/candidates/mp_v13_s2024.json, so the 2025 score sees the same mean preservation as the ship build. Not the default.
AS_SCORED = os.environ.get("MP_AS_SCORED")
if AS_SCORED:
    OUT_DIR = os.path.join(OUT_DIR, f"s{AS_SCORED}")
COMMAND_PATH = os.path.join(ROOT, "command_targets_v13.json")
MP_PATH = os.path.join(ROOT, "data_tables", "mp_v13.json")
if AS_SCORED:
    MP_PATH = os.path.join(DATA, "fits", "candidates", f"mp_v13_s{AS_SCORED}.json")


def core_count(lv):
    """the level's count-layer candidate file name (the as-scored copy's *_thru<year> under MP_AS_SCORED)"""
    from . import export_candidates as X
    fn = X.CORE_COUNT[lv]
    return fn.replace("thru2025", f"thru{AS_SCORED}") if AS_SCORED else fn
LEVELS = ("mlb", "college_d1", "college_d2", "college_d3", "hs")
DL = {"mlb": "MLB", "college_d1": "D1", "college_d2": "D2", "college_d3": "D3", "hs": "HS"}
CK = [f"{b}-{k}" for b, k in COUNTS]                 # harness order (balls-major)
TERMS = ("swing", "whiff_sw", "foul_ct", "cs_take", "gb")
MP_OUT = {"swing": "swing", "whiff_sw": "whiff", "foul_ct": "foul", "cs_take": "cstrike", "gb": "bip_gb"}
MLB_SEASONS = (2021, 2022, 2023, 2024, 2025)
HALF_LIFE = 2.0
TOL = 1e-10                                          # max |engine rate - fitted rate| (probability) to stop
GROUP = {"FB": "Fastball", "SI": "Fastball", "FC": "Fastball", "SL": "Slider", "CB": "Curveball", "CH": "Change-Up"}
FASTBALL_KINDS = ("FB", "SI", "FC")


def sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def logit(p):
    p = min(max(float(p), 1e-15), 1 - 1e-15)
    return math.log(p / (1 - p))


# ======================================================================================================================
# real data the reference worlds need
# ======================================================================================================================
def hs_kind_usage():
    """{ck: {group: share}} real HS / travel typed pitches by count, over the HS count fit's games (full_log, parsed),
    seasons and recency weights (hs_sep_thru2025 fit_seasons). Cached in {DATA}/mean_preserve/hs_kind_usage.json."""
    p = os.path.join(OUT_DIR, "hs_kind_usage.json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))["usage"]
    j = json.load(open(os.path.join(DATA, "fits", "count_layer", core_count("hs")), encoding="utf-8"))
    con = sqlite3.connect(f"file:{os.path.join(DATA, 'hs', 'hs.sqlite3')}?mode=ro", uri=True)
    acc = defaultdict(float)
    for s, w in j["fit_seasons"].items():
        s = assert_not_heldout(int(s))
        q = """SELECT p.balls, p.strikes, p.pitch_type, COUNT(*) FROM hs_pitch p JOIN hs_games g USING(game_id)
               JOIN hs_game_qc c USING(game_id)
               WHERE g.season = ? AND c.full_log = 1 AND g.parsed IS NOT NULL AND COALESCE(p.count_ok, 1) = 1
                 AND p.balls BETWEEN 0 AND 3 AND p.strikes BETWEEN 0 AND 2 AND p.pitch_type IS NOT NULL
               GROUP BY 1, 2, 3"""
        for b, k, pt, n in con.execute(q, (s,)):
            acc[(f"{b}-{k}", pt)] += w * n
    usage, other = {}, {}
    for ck in CK:
        tot = sum(v for (c, _), v in acc.items() if c == ck)
        usage[ck] = {g: acc.get((ck, g), 0.0) / tot for g in ("Fastball", "Curveball", "Slider", "Change-Up")}
        other[ck] = 1 - sum(usage[ck].values())
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump({"usage": usage, "other_share": other, "fit_seasons": j["fit_seasons"],
               "source": "hs.sqlite3 hs_pitch, full_log games, typed pitches (Other / knuckle etc. left out of the groups)"},
              open(p, "w", encoding="utf-8"), indent=1)
    return usage


def mlb_statcast():
    """MLB Statcast 2021-25 (half-life 2): (per-count targets {ck: {term: rate}}, n_bo [12, 3, 8], late share [12],
    class x band shares {(side, (b, k)): {(class, band): share}}). Cached in {DATA}/mean_preserve/mlb_statcast.json."""
    p = os.path.join(OUT_DIR, "mlb_statcast.json")
    if os.path.exists(p):
        d = json.load(open(p, encoding="utf-8"))
        cb = {(sd, (int(c[0]), int(c[2]))): {(x.split("|")[0], x.split("|")[1]): v for x, v in m.items()}
              for key, m in d["class_band"].items() for sd, c in [key.split("/")]}
        return d["targets"], np.array(d["n_bo"]), np.array(d["late_share"]), cb
    import pandas as pd
    sys.path.insert(0, ROOT)
    from hitter_data.zone_defs import CALLED, DROP, IN_PLAY, SWING, FASTBALL_PROFILES
    from hitter_data.zone_load import load_season
    ev = np.zeros((12, 6))
    gb = np.zeros(12)
    n_bo = np.zeros((12, 3, 8))
    late = np.zeros(12)
    cb_acc = defaultdict(float)
    for s in MLB_SEASONS:
        s = assert_not_heldout(s)
        w = 0.5 ** ((2025 - s) / HALF_LIFE)
        d = pd.read_parquet(os.path.join(DATA, "refit", "cache", f"MLB_{s}.parquet"),
                            columns=["description", "des", "bb_type", "game_type", "balls", "strikes", "outs_when_up",
                                     "on_1b", "on_2b", "on_3b", "inning", "bat_score", "fld_score"])
        desc = d.description.astype(str)
        bunt = d.des.astype(str).str.contains("bunt", case=False, na=False) & desc.isin(IN_PLAY)
        d = d[(d.game_type.fillna("R") == "R") & ~desc.isin(DROP) & ~bunt & d.balls.between(0, 3) & d.strikes.between(0, 2)
              & d.outs_when_up.between(0, 2)]
        desc = d.description.astype(str)
        y = np.full(len(d), 0)
        y[desc.eq("hit_by_pitch").values] = 1
        y[desc.isin(CALLED).values] = 2
        y[desc.isin(["swinging_strike", "swinging_strike_blocked", "foul_tip"]).values] = 3
        y[(desc.eq("foul") | (desc.isin(SWING) & ~desc.isin(IN_PLAY) & ~desc.isin(
            ["swinging_strike", "swinging_strike_blocked", "foul_tip", "foul"]))).values] = 4
        y[desc.isin(IN_PLAY).values] = 5
        ci = (d.balls.astype(int) * 3 + d.strikes.astype(int)).values
        bi = (d.on_1b.notna().astype(int) + 2 * d.on_2b.notna().astype(int) + 4 * d.on_3b.notna().astype(int)).values
        o = d.outs_when_up.astype(int).values
        lt = ((d.inning >= 7) & ((d.bat_score - d.fld_score).abs() <= 2)).values
        g = (d.bb_type.astype(str) == "ground_ball").values & (y == 5)
        np.add.at(ev, (ci, y), w)
        np.add.at(gb, ci, w * g)
        np.add.at(n_bo, (ci, o, bi), w)
        np.add.at(late, ci, w * lt)
        del d
        df = load_season("MLB", s)
        df = df.assign(cls=df["prof"].map(lambda p_: "FB" if p_ in FASTBALL_PROFILES else "OS"))
        for (same, b, k, c, z), n in df.groupby(["same", "b", "s", "cls", "band"])["n"].sum().items():
            cb_acc[("same" if bool(same) else "opp", (int(b), int(k)), c, z)] += w * float(n)
        del df
    targets = {}
    for i, ck in enumerate(CK):
        ball, hbp, cs, wh, fo, ip = ev[i] / ev[i].sum()
        targets[ck] = dict(swing=wh + fo + ip, whiff_sw=wh / (wh + fo + ip), foul_ct=fo / (fo + ip),
                           cs_take=cs / (ball + hbp + cs), gb=gb[i] / ev[i, 5], p6=list(ev[i] / ev[i].sum()), n=float(ev[i].sum()))
    late_share = late / n_bo.sum(axis=(1, 2))
    cb = defaultdict(dict)
    for (sd, c, cl, z), v in cb_acc.items():
        cb[(sd, c)][(cl, z)] = v
    for key, m in cb.items():
        t = sum(m.values())
        cb[key] = {k_: v / t for k_, v in m.items()}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump({"targets": targets, "n_bo": n_bo.tolist(), "late_share": late_share.tolist(),
               "class_band": {f"{sd}/{c[0]}-{c[1]}": {f"{a}|{b}": v for (a, b), v in m.items()} for (sd, c), m in cb.items()},
               "seasons": MLB_SEASONS, "half_life": HALF_LIFE,
               "source": "Statcast MLB regular season (refit cache), zone_load filters, bunts dropped; class x band from the zone-seed cache"},
              open(p, "w", encoding="utf-8"), indent=1)
    return targets, n_bo, late_share, dict(cb)


# ======================================================================================================================
# the reference worlds (harness assumptions)
# ======================================================================================================================
def _hs_ref_class():
    from .fit_count_hs import HSVeloAssumption, DL as HSDL

    class HSRefAssumption(HSVeloAssumption):
        """HSVeloAssumption (D3's h3 rows, real HS speeds) with each count's kind-group shares set to real HS usage;
        target / landed-band shares within a kind are the harness's (as kgap_hsmix.HSMixAssumption, at HS speeds)."""
        REAL = None

        def mix(self, level, side, b, k):
            out = super().mix(level, side, b, k)
            if level != HSDL:
                return out
            if HSRefAssumption.REAL is None:
                HSRefAssumption.REAL = hs_kind_usage()
            real = HSRefAssumption.REAL[f"{b}-{k}"]
            g = [GROUP[self.arsenals[a][j]["kind"]] for a, j, _, _, _ in out]
            have = defaultdict(float)
            for (a, j, q, z, w), gg in zip(out, g):
                have[gg] += w
            tot_real = sum(real.get(gg, 0.0) for gg in have)
            out = [(a, j, q, z, w * real[gg] / tot_real / have[gg]) for (a, j, q, z, w), gg in zip(out, g)]
            s = sum(r[4] for r in out)
            return [r[:4] + (r[4] / s,) for r in out]
    return HSRefAssumption


class MLBRefAssumption(Assumption):
    """'MLB': D1's frozen calib-world pitchers / pitches / targets with each landed band reweighted (per side x count) to
    MLB Statcast's class x band shares, exactly as harness_freeze.freeze_single_a does with Single-A; same-side share D1's."""

    def __init__(self):
        super().__init__(PRIMARY_ASSUMPTION)
        self._mix = None

    def _build(self):
        from . import harness_frozen as FZ
        from .harness_freeze import reweight
        _, _, _, cb = mlb_statcast()
        cls_of = lambda a, j: "FB" if FZ.ARSENALS[a][j]["kind"] in FASTBALL_KINDS else "OS"
        self._mix, self.lost = {}, 0.0
        for key, rows in FZ.MIX["D1"].items():
            new, lost = reweight(rows, cls_of, cb[key])
            self.lost = max(self.lost, lost)
            self._mix[key] = new

    def mix(self, level, side, b, k):
        if level != "MLB":
            return super().mix(level, side, b, k)
        if self._mix is None:
            self._build()
        return list(self._mix[(side, (b, k))])

    def same_share(self, level, b, k):
        return super().same_share("D1" if level == "MLB" else level, b, k)


def reference(e, lv):
    """(probe, targets {ck: {term: rate}}, n_bo, late_share, target counts n per count, description) for a level"""
    from . import export_candidates as X
    if lv == "mlb":
        t, n_bo, late, _ = mlb_statcast()
        probe = X.Probe("mlb", "MLB", assumption=MLBRefAssumption())
        n = {ck: t[ck]["n"] for ck in CK}
        return probe, t, n_bo, late, n, "MLB: D1 frozen rows, landing reweighted to MLB Statcast class x band (2021-25, hl 2)"
    j = X.load_cand(core_count(lv))
    t, _, n_bo, late = X.targets(j)
    n = {ck: float(np.asarray(j["n_count_bo"])[i].sum()) for i, ck in enumerate(CK)}
    if lv == "hs":
        probe = X.Probe("hs", "HS", assumption=_hs_ref_class()(PRIMARY_ASSUMPTION))
        return probe, t, n_bo, late, n, "HS: D3 h3 rows at real HS speeds, kind groups set to real HS usage by count"
    return probe_college(X, lv), t, n_bo, late, n, f"{DL[lv]}: harness h3 (single_a), {core_count(lv)}"


def probe_college(X, lv):
    return X.Probe(lv, DL[lv])


# ======================================================================================================================
# the solve
# ======================================================================================================================
def zero_mp(e):
    t = copy.deepcopy(e.load_table("mp", "v0"))
    t["version"] = "solve"
    return t


def solve_level(lv, iters=30, log=print, h=1e-4):
    """-> dict(shifts {outcome: {ck: x}}, rates, targets, log rows). Newton in logit space, per count: the five terms of a
    count interact (more swings change whiff | swing's band mix, ...), so each iteration measures the count's 5 x 5
    Jacobian by finite differences (each term moved by h at every count at once: counts are independent in the reference
    world) and steps Delta = J^-1 (logit target - logit rate), halved while the count's worst error grows. Runs in its own
    process (the engine's tables are swapped in memory there only)."""
    sys.path.insert(0, ROOT)
    import engine as e
    from . import export_candidates as X
    probe, t, n_bo, late, n, desc = reference(e, lv)
    mp = zero_mp(e)
    d = {ck: np.zeros(len(TERMS)) for ck in CK}

    def rates_at(dd):
        for ck in CK:
            for i, k in enumerate(TERMS):
                mp["levels"][lv][MP_OUT[k]][ck] = float(dd[ck][i])
        e.use_mp_table(mp)
        r, _ = X.engine_rates(probe, n_bo, late)
        return {ck: np.array([logit(r[ck][k]) for k in TERMS]) for ck in CK}, r

    tl = {ck: np.array([logit(t[ck][k]) for k in TERMS]) for ck in CK}
    cerr = lambda r, ck: max(abs(r[ck][k] - t[ck][k]) for k in TERMS)
    rows = []
    t0 = time.time()
    L, R = rates_at(d)
    for it in range(iters):
        err = max(cerr(R, ck) for ck in CK)
        rows.append(dict(it=it, max_err=err, secs=round(time.time() - t0, 1)))
        log(f"  {lv} iter {it}: max |rate - target| {err:.3e} ({time.time() - t0:.0f}s)")
        if err < TOL:
            break
        J = {ck: np.zeros((len(TERMS), len(TERMS))) for ck in CK}
        for i in range(len(TERMS)):
            dp = {ck: d[ck] + h * np.eye(len(TERMS))[i] for ck in CK}
            Lp, _ = rates_at(dp)
            for ck in CK:
                J[ck][:, i] = (Lp[ck] - L[ck]) / h
        step = {ck: np.linalg.solve(J[ck], tl[ck] - L[ck]) for ck in CK}
        lam = {ck: 1.0 for ck in CK}
        for _ in range(8):                       # per-count step halving (counts are independent)
            dn = {ck: d[ck] + lam[ck] * step[ck] for ck in CK}
            Ln, Rn = rates_at(dn)
            worse = [ck for ck in CK if cerr(Rn, ck) > cerr(R, ck) and cerr(R, ck) > TOL]
            if not worse:
                break
            for ck in worse:
                lam[ck] *= 0.5
        d, L, R = dn, Ln, Rn
    err = max(cerr(R, ck) for ck in CK)
    shifts = {MP_OUT[k]: {ck: float(d[ck][i]) for ck in CK} for i, k in enumerate(TERMS)}
    return dict(level=lv, reference=desc, shifts=shifts, rates=R, targets={ck: {k: t[ck][k] for k in TERMS} for ck in CK},
                n=n, iterations=rows, max_err=err)


def _solve_worker(lv):
    os.environ["PITCH_MP_TABLE"] = "v0"
    r = solve_level(lv, log=lambda m: print(m, flush=True))
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, f"{lv}.json"), "w", encoding="utf-8") as f:
        json.dump(r, f, indent=1)
    return lv, r["max_err"]


def inputs():
    sys.path.insert(0, ROOT)
    from . import export_candidates as X
    import engine as e
    files = {"count table": e.table_path("count"), "zone table": e.table_path("zone"),
             "outcome_params.py": os.path.join(ROOT, "outcome_params.py")}
    for lv in ("college_d1", "college_d2", "college_d3", "hs"):
        files[f"fit {lv}"] = os.path.join(DATA, "fits", "count_layer", core_count(lv))
    files["hs kind usage"] = os.path.join(OUT_DIR, "hs_kind_usage.json")
    if not AS_SCORED:
        files["mlb statcast"] = os.path.join(OUT_DIR, "mlb_statcast.json")
    files["harness_frozen_a.py"] = os.path.join(ROOT, "hitter_data", "harness_frozen_a.py")
    return {k: {"path": os.path.relpath(v, ROOT) if v.startswith(ROOT) else v.replace(DATA, "{DATA}"), "sha256": sha(v)}
            for k, v in files.items()}


def write_table(levels=LEVELS):
    import engine as e
    t = copy.deepcopy(e.load_table("mp", "v0"))
    t["version"] = f"v13_s{AS_SCORED}" if AS_SCORED else "v13"
    res = {lv: json.load(open(os.path.join(OUT_DIR, f"{lv}.json"), encoding="utf-8")) for lv in levels}
    if AS_SCORED:      # levels not solved for the as-scored copy keep the ship table's shifts (MLB: not scored on 2025)
        ship = json.load(open(os.path.join(ROOT, "data_tables", "mp_v13.json"), encoding="utf-8"))
        for lv in LEVELS:
            if lv not in levels:
                t["levels"][lv] = ship["levels"][lv]
    t["about"] = ("v1.3 (Drew's Nov 24 ruling 12): per-count mean-preservation scalars, computed by hitter_data/mean_preserve.py "
                  "(not tuned): per level and count one logit level shift per outcome (swing, whiff | swing, foul | contact, "
                  "called strike | take, ground ball | in play) on top of the zone table, the pitch-kind effects and the HS pitch "
                  "kind x velocity table, solved so the reference world (the real pitch mix by count + the harness's h3 "
                  "average-pitcher landing) gives back the fitted count layer's per-count rates. Format: docs/TABLES_v13.md.")
    t["reference"] = {lv: res[lv]["reference"] for lv in levels}
    t["harness_assumption"] = HARNESS_ASSUMPTION_VERSION
    t["inputs"] = inputs()
    t["max_abs_rate_error"] = {lv: res[lv]["max_err"] for lv in levels}
    for lv in levels:
        for o, m in res[lv]["shifts"].items():
            t["levels"][lv][o] = {ck: round(m[ck], 12) for ck in e.T_COUNTS}
    e.check_table(t, "mp_v13.json")
    with open(MP_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(t, f, indent=1)
        f.write("\n")
    print("wrote", MP_PATH, sha(MP_PATH))


# ======================================================================================================================
# the proof (fresh process, the shipped file)
# ======================================================================================================================
def chain(p6_by_ck):
    from .chain_check import chain as ch
    return ch(np.array([p6_by_ck[ck] for ck in CK]))


def verify_level(lv):
    """engine (PITCH_MP_TABLE as loaded) under the reference world vs the fitted count layer at every count, with the
    targets' sampling SE; plus the reference world's chained K / BB / HBP vs the chain-definition targets"""
    sys.path.insert(0, ROOT)
    import engine as e
    from . import export_candidates as X
    import calib
    probe, t, n_bo, late, n, desc = reference(e, lv)
    rates, _ = X.engine_rates(probe, n_bo, late)
    T = probe.tables(probe.dl)
    p6 = {}
    for i, (b, k) in enumerate(COUNTS):
        w_same = probe.assumption.same_share(probe.dl, b, k)
        ws = np.array([w_same, 1 - w_same])
        wl = np.array([1 - late[i], late[i]])
        w = n_bo[i][:, :, None, None] * ws[None, None, :, None] * wl[None, None, None, :]
        p6[CK[i]] = list((T.P6[i][:, :, :2, :, :] * w[..., None]).sum(axis=(0, 1, 2, 3)) / w.sum())
    per = {}
    worst_z = 0.0
    for ck in CK:
        row = {}
        for k in TERMS:
            den = {"swing": n[ck], "whiff_sw": n[ck] * t[ck]["swing"], "foul_ct": n[ck] * t[ck]["swing"] * (1 - t[ck]["whiff_sw"]),
                   "cs_take": n[ck] * (1 - t[ck]["swing"]),
                   "gb": n[ck] * t[ck]["swing"] * (1 - t[ck]["whiff_sw"]) * (1 - t[ck]["foul_ct"])}[k]
            se = math.sqrt(max(t[ck][k] * (1 - t[ck][k]), 1e-12) / max(den, 1.0))
            dlt = rates[ck][k] - t[ck][k]
            worst_z = max(worst_z, abs(dlt) / se)
            row[k] = dict(engine=rates[ck][k], fitted=t[ck][k], diff=dlt, sampling_se=se)
        per[ck] = row
    ch_ = chain(p6)
    tg = calib.PA_TARGETS[lv]
    # the reference world's zone rate (command target, ruling 12): each count's landed-band mix x the zone table's share of
    # the band inside the rulebook zone (engine.ZONE_IN, as calib.evaluate counts "zone"), weighted by the chain's visits to
    # the count (two-strike fouls loop), so it is per pitch exactly as calib.evaluate's zone
    vis = visits(p6)
    zc = {}
    for i, (b, k) in enumerate(COUNTS):
        ss = probe.assumption.same_share(probe.dl, b, k)
        zc[CK[i]] = sum(sw * sum(w * e.ZONE_IN[z] for _, _, _, z, w in probe.assumption.mix(probe.dl, side, b, k))
                        for side, sw in (("same", ss), ("opp", 1 - ss)))
    zone = sum(vis[ck] * zc[ck] for ck in CK) / sum(vis.values())
    return dict(level=lv, versions=dict(e.TABLE_VERSIONS), reference=desc, per_count=per, zone=zone, zone_by_count=zc,
                max_abs_diff=max(abs(per[ck][k]["diff"]) for ck in CK for k in TERMS), worst_diff_over_se=worst_z,
                chain=ch_, target=tg, gap={k: ch_[k] - tg[k] for k in ("K", "BB", "HBP")}, p6=p6)


def visits(p6_by_ck):
    """expected pitches thrown in each count per PA (the count chain from 0-0; two-strike fouls loop)"""
    reach = defaultdict(float)
    reach[(0, 0)] = 1.0
    out = {}
    for b, k in sorted(COUNTS, key=lambda c: c[0] + c[1]):
        ball, hbp, cs, wh, fo, ip = p6_by_ck[f"{b}-{k}"]
        v = reach[(b, k)] / (1 - (fo if k == 2 else 0.0))
        out[f"{b}-{k}"] = v
        if b < 3:
            reach[(b + 1, k)] += v * ball
        if k < 2:
            reach[(b, k + 1)] += v * (cs + wh + fo)
    return out


def write_command(res):
    out = {"about": ("v1.3 (Drew's Nov 24 ruling 12): the command target the pitcher-side keys fit with BB and HBP: the share of "
                     "pitches in the rulebook zone in each level's reference world (hitter_data/mean_preserve.py verify: the "
                     "real landing by count, engine.ZONE_IN per band, weighted by the count chain's visits)."),
           "levels": {lv: {"zone": r["zone"], "zone_by_count": r["zone_by_count"], "reference": r["reference"]} for lv, r in res.items()}}
    with open(COMMAND_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, indent=1)
        f.write("\n")


def _verify_worker(lv):
    return verify_level(lv)


def pool_run(fn, levels, env):
    """one process per level (levels are independent; each process loads its own engine and swaps tables in memory only)"""
    from concurrent.futures import ProcessPoolExecutor
    import multiprocessing as mp_
    for k, v in env.items():
        os.environ[k] = v
    with ProcessPoolExecutor(max_workers=min(len(levels), max(1, (os.cpu_count() or 4) - 2)),
                             mp_context=mp_.get_context("spawn")) as ex:
        return list(ex.map(fn, levels))


def main(argv=None):
    a = list(sys.argv[1:] if argv is None else argv)
    cmd = a.pop(0) if a else "solve"
    levels = tuple(x for x in a if not x.startswith("--")) or LEVELS
    if cmd == "data":
        hs_kind_usage()
        mlb_statcast()
        print("cached HS kind usage and MLB Statcast in", OUT_DIR)
    elif cmd == "solve":
        hs_kind_usage()
        if "mlb" in levels:
            mlb_statcast()
        for lv, err in pool_run(_solve_worker, levels, {"PITCH_MP_TABLE": "v0", "PYTHONUTF8": "1"}):
            print(f"{lv}: max |rate - target| {err:.2e}")
        if set(levels) == set(LEVELS) or AS_SCORED:
            write_table(levels)
    elif cmd == "verify":
        res = pool_run(_verify_worker, levels, {"PITCH_MP_TABLE": os.environ.get("PITCH_MP_TABLE", "v13"), "PYTHONUTF8": "1"})
        out = {r["level"]: r for r in res}
        os.makedirs(OUT_DIR, exist_ok=True)
        tag = os.environ.get("PITCH_MP_TABLE", "v13")
        with open(os.path.join(OUT_DIR, f"verify_{tag}.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1)
        if "--write-command" in sys.argv and set(out) == set(LEVELS):
            write_command(out)
        for r in res:
            print(f"{r['level']:11s} mp {r['versions']['mp']}: max |engine - fitted| {r['max_abs_diff']:.2e} "
                  f"(worst {r['worst_diff_over_se']:.4f} SE) | chain K {100 * r['chain']['K']:.2f} BB {100 * r['chain']['BB']:.2f} "
                  f"HBP {100 * r['chain']['HBP']:.2f} vs target {100 * r['target']['K']:.2f} / {100 * r['target']['BB']:.2f} / "
                  f"{100 * r['target']['HBP']:.2f}: gap " + " ".join(f"{k} {100 * v:+.2f}" for k, v in r["gap"].items())
                  + f" | zone {100 * r['zone']:.1f}")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
