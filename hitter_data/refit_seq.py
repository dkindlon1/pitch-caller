"""v1.3 shared refit (plan section 4), inventory rows 2, 3, 4, B7, B8, B9, B10: the v0.8 sequencing numbers that
seq_fit.py writes to fit_v08.json, refit on every fit season on disk (MLB + AAA + A, <= 2025) with recency weights.

Same features, controls, penalized logistic model and grids as seq_fit.py (its functions are reused); what changes:
- data: hitter_data.refit_load (new Savant day-file layout), MLB + AAA + A pooled, seasons <= 2025 (assert_not_heldout);
- a fixed-seed fraction of whole games per level-season (SAMPLE_FRAC, about the old "every 4th day" density);
- the likelihood is weighted by w = 0.5 ** ((2025 - season) / 2) (seq_fit.Fit's optional per-row weight);
- one pooled fit, no held-out season. Pitcher / batter random intercepts are indexed by (level, id) over all seasons;
  season tables (usage, speed) are keyed by (level, season, pitcher);
- the ship decisions of v1.0 are kept: terms that shipped as fitted take the refit value; terms held at the spec or 0
  (gamma_T, phi_OS, beta_tun_whiff) go through seq_fit.decide()'s A3 rule on the new pooled interval.

usage: python3 -m hitter_data.refit_seq [--frac 0.25]
  -> {DATA}/refit/seq.json, seq.txt, and a proposed fit_v08.json at {DATA}/refit/fit_v08.json (not the tracked file)
"""
import argparse
import json
import math
import os
import sys
import time
from collections import defaultdict

import numpy as np
import pandas as pd

from . import DATA, assert_not_heldout
from . import refit_load as RL

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import seq_fit as SF  # noqa: E402

OUT_DIR = os.path.join(DATA, "refit")
SAMPLE_FRAC = 0.25
SEED = 13
LEVEL_CODE = {"MLB": 0, "AAA": 1, "A": 2}
NEED = ["pitch_type", "description", "game_pk", "at_bat_number", "pitch_number", "pitcher", "batter", "balls", "strikes",
        "outs_when_up", "on_1b", "on_2b", "on_3b", "fld_score", "bat_score", "n_thruorder_pitcher", "release_speed",
        "release_spin_rate", "pfx_x", "pfx_z", "release_extension", "plate_x", "plate_z", "sz_top", "sz_bot", "stand",
        "p_throws", "zone", "vx0", "vy0", "vz0", "ax", "ay", "az", "release_pos_x", "release_pos_z", "launch_speed",
        "bb_type", "level", "season", "w"]
lines = []


def say(*a):
    t = " ".join(str(x) for x in a)
    print(t, flush=True)
    lines.append(t)


def sample_games(df, frac=SAMPLE_FRAC, seed=SEED):
    """A fixed-seed fraction of whole games within each level-season."""
    if frac >= 1:
        return df
    keep = []
    for (lv, s), g in df.groupby(["level", "season"], observed=True)["game_pk"]:
        games = np.sort(g.unique())
        rng = np.random.default_rng([seed, LEVEL_CODE.get(str(lv), 9), int(s)])
        n = max(1, int(round(frac * len(games))))
        keep.append(rng.choice(games, n, replace=False))
    keep = np.concatenate(keep) if keep else np.array([], dtype=np.int64)
    return df[df["game_pk"].isin(keep)]


def _f(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return float("nan")
    return x


def _na(v):
    return v is None or v is pd.NA or (isinstance(v, float) and v != v)


def rows_from_frame(df):
    """Savant rows -> seq_fit.load()'s row dicts (plus weight 'w' and 'lv'), sorted by game, PA, pitch.
    Same filters as seq_fit.load(): a classified pitch type, no bunts (game_type R is applied by the loader).
    yr is a (level, season) key and pit / bat are (level, id) so season tables and random intercepts never mix levels."""
    for s in df["season"].unique():
        assert_not_heldout(s)
    d = df[[c for c in NEED if c in df.columns]]
    d = d[d["pitch_type"].isin(list(SF.CLASS)) & ~d["description"].fillna("").str.contains("bunt")]
    rows = []
    for t in d.itertuples(index=False):
        lv = LEVEL_CODE[str(t.level)]
        pt = str(t.pitch_type)
        desc = str(t.description)
        fs, bs = _f(t.fld_score), _f(t.bat_score)
        tto = _f(t.n_thruorder_pitcher)
        zone = _f(t.zone)
        rows.append(dict(
            yr=(lv, int(t.season)), season=int(t.season), lv=lv, w=float(t.w),
            g=int(t.game_pk), ab=int(t.at_bat_number), pn=int(t.pitch_number),
            pit=(lv, int(t.pitcher)), bat=(lv, int(t.batter)), pt=pt, c=SF.CLASS[pt], desc=desc,
            b=int(t.balls), k=int(t.strikes), o=int(t.outs_when_up),
            r1=not _na(t.on_1b), r2=not _na(t.on_2b), r3=not _na(t.on_3b),
            marg=int(fs - bs) if fs == fs and bs == bs else 0,
            tto=int(tto) if tto == tto else 1,
            v=_f(t.release_speed), spin=_f(t.release_spin_rate), px=_f(t.pfx_x), pz=_f(t.pfx_z),
            ext=_f(t.release_extension), x=_f(t.plate_x), z=_f(t.plate_z), top=_f(t.sz_top), bot=_f(t.sz_bot),
            stand=str(t.stand), thr=str(t.p_throws), zone=int(zone) if zone == zone else 0,
            vx0=_f(t.vx0), vy0=_f(t.vy0), vz0=_f(t.vz0), ax=_f(t.ax), ay=_f(t.ay), az=_f(t.az),
            rx=_f(t.release_pos_x), rz=_f(t.release_pos_z), ls=_f(t.launch_speed),
            bb="" if _na(t.bb_type) else str(t.bb_type),
            shape_sink=pt == "SI", shape_cut=pt == "FC"))
    rows.sort(key=lambda r: (r["g"], r["ab"], r["pn"]))
    return rows


def gb_types(rows, mask_idx, gb, w):
    """Recency-weighted ground-ball share per v1.0 type (4-seam, sink, cut, SL, CB, CH) on typed balls in play."""
    num, den = defaultdict(float), defaultdict(float)
    for j, i in mask_idx:
        r = rows[i]
        key = "sink" if r["pt"] == "SI" else ("cut" if r["pt"] == "FC" else ("4-seam" if r["pt"] == "FF" else r["c"]))
        if key == "FB":       # other fastball labels (FA) have no v1.0 type
            continue
        num[key] += w[j] * gb[j]
        den[key] += w[j]
    return {k: num[k] / den[k] for k in den if den[k] > 0}


def a3(b, se, held):
    """seq_fit.decide()'s rule for a term that did not ship."""
    lo, hi = b - 1.96 * se, b + 1.96 * se
    if lo <= held <= hi:
        return held, f"interval {lo:+.3f}..{hi:+.3f} includes the held value {held:+.3f} -> keep"
    if lo > 0 or hi < 0:
        return b, f"interval {lo:+.3f}..{hi:+.3f} excludes the held value {held:+.3f} and 0 -> fitted {b:+.3f}"
    return 0.0, f"interval {lo:+.3f}..{hi:+.3f} excludes the held value {held:+.3f}, includes 0 -> off (0)"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--frac", type=float, default=SAMPLE_FRAC)
    ap.add_argument("--levels", default="MLB,AAA,A")
    args = ap.parse_args(argv)
    t0 = time.time()
    levels = tuple(args.levels.split(","))
    df = RL.savant(levels=levels)
    seasons = sorted({(str(l), int(s)) for l, s in zip(df["level"], df["season"])})
    for _, s in seasons:
        assert_not_heldout(s)
    df = sample_games(df, args.frac)
    rows = rows_from_frame(df)
    del df
    say(f"refit_seq: levels {levels}, level-seasons {seasons}, game fraction {args.frac} (seed {SEED})")
    say(f"rows (classified, no bunts): {len(rows)}; games {len({r['g'] for r in rows})} [{time.time() - t0:.0f}s]")
    tabs = SF.season_tables(rows)
    pc = defaultdict(int)
    pcs, prev_rows = [], []
    last_pa, last_i = None, None
    for i, r in enumerate(rows):
        key = (r["g"], r["pit"])
        pcs.append(pc[key]); pc[key] += 1
        pa = (r["g"], r["ab"])
        prev_rows.append(rows[last_i] if (last_pa == pa and last_i is not None) else None)
        last_pa, last_i = pa, i
    pits = {p: j for j, p in enumerate(sorted({r["pit"] for r in rows}))}
    bats = {p: j for j, p in enumerate(sorted({r["bat"] for r in rows}))}
    gmap = {g: j for j, g in enumerate(sorted({r["g"] for r in rows}))}
    base_seq = SF.sequence(rows, 0.6, 0.4, tabs)
    for i, s in enumerate(base_seq):
        s["pc"] = pcs[i]
    idx = np.array([i for i, r in enumerate(rows) if all(v == v for v in (r["v"], r["x"], r["z"], r["top"], r["bot"]))])
    d0 = len(SF.controls(rows[idx[0]], base_seq[idx[0]], tabs, prev_rows[idx[0]]))
    Xc = np.empty((len(idx), d0))
    for j, i in enumerate(idx):
        Xc[j] = SF.controls(rows[i], base_seq[i], tabs, prev_rows[i])
    Xc = np.nan_to_num(Xc)
    del base_seq
    W = np.array([rows[i]["w"] for i in idx])
    pid = np.array([pits[rows[i]["pit"]] for i in idx])
    bid = np.array([bats[rows[i]["bat"]] for i in idx])
    gid = np.array([gmap[rows[i]["g"]] for i in idx])
    desc = [rows[i]["desc"] for i in idx]
    by_ls = defaultdict(int)
    for i in idx:
        by_ls[(rows[i]["lv"], rows[i]["season"])] += 1
    inv = {v: k for k, v in LEVEL_CODE.items()}
    used = {f"{inv[l]} {s}": n for (l, s), n in sorted(by_ls.items())}
    say(f"usable pitches {len(idx)}; controls {Xc.shape[1]} columns; pitchers {len(pits)}, batters {len(bats)}; "
        f"by level-season {used} [{time.time() - t0:.0f}s]")
    NP, NB = len(pits) + 1, len(bats) + 1

    def fit(mask, yv, feats=None, X=None):
        X = Xc if X is None else X
        m = SF.Fit(X[mask], yv[mask], pid[mask], bid[mask], gid[mask], NP, NB, w=W[mask])
        return m.run(None if feats is None else feats[mask])

    def model(name, mask, yv, feats, label, X=None):
        m1 = fit(mask, yv, feats, X)
        k = feats.shape[1]
        b = m1["b_raw"][-k:]; se = m1["se_raw"][-k:]
        say(f"  [{name}] {label}: n={m1['n']}; beta={np.round(b, 4).tolist()} se={np.round(se, 4).tolist()} "
            f"[{time.time() - t0:.0f}s]")
        return dict(beta=b.tolist(), se=se.tolist(), ll_train=m1["ll"], n=int(m1["n"]),
                    corr=m1["corr"][-k:, -k:].tolist())

    is_sw = np.array([d in SF.SWING for d in desc])
    whiff = np.array([1.0 if d in SF.WHIFF else 0.0 for d in desc])
    bip = np.array([d == "hit_into_play" for d in desc])
    ls = np.array([rows[i]["ls"] for i in idx])
    hard = np.where(ls >= 95, 1.0, 0.0)
    bipv = bip & (ls == ls)
    zone_out = np.array([rows[i]["zone"] in (11, 12, 13, 14) for i in idx])
    swing_v = is_sw.astype(float)
    res = {}

    say("\n1. Timing B(r) on whiff | swing, grid lambda x alpha, chosen on the pooled weighted likelihood")
    best, grid = None, {}
    for lam in (0.4, 0.5, 0.6, 0.7, 0.8):
        for alpha in (0.2, 0.4, 0.6):
            sq = SF.sequence(rows, lam, alpha, tabs)
            Bv = np.array([[sq[i]["B"]] for i in idx])
            del sq
            m = fit(is_sw, whiff, Bv)
            grid[(lam, alpha)] = (m["ll"], m["b_raw"][-1], m["se_raw"][-1])
            say(f"    lambda {lam} alpha {alpha}: ll {m['ll']:.1f} beta_T {m['b_raw'][-1]:+.3f} "
                f"(se {m['se_raw'][-1]:.3f}) [{time.time() - t0:.0f}s]")
            if best is None or m["ll"] > best[0]:
                best = (m["ll"], lam, alpha, Bv)
    _, lam_b, alpha_b, Bbest = best
    say(f"  best: lambda {lam_b}, alpha {alpha_b}")
    res["B_whiff"] = model("B", is_sw, whiff, Bbest, f"beta_T at lambda {lam_b}, alpha {alpha_b}")
    res["B_hard"] = model("B", bipv, hard, Bbest, "gamma_T on hard | ball in play (enters with a minus sign)")
    del Bbest

    say("\n2. Eye level E_y on whiff | swing, d* grid; also on swing | outside the zone")
    sq = SF.sequence(rows, lam_b, alpha_b, tabs)
    best = None
    for ds in (1.0, 1.5, 2.0):
        E = np.array([[SF.g_mod((1 if rows[i]["c"] == "FB" else -1) * (rows[i]["z"] - sq[i]["yh"]), ds)
                       if sq[i]["prev"] is not None else 0.0] for i in idx])
        m = fit(is_sw, whiff, E)
        say(f"    d* {ds}: ll {m['ll']:.1f} beta_E {m['b_raw'][-1]:+.3f} (se {m['se_raw'][-1]:.3f}) [{time.time() - t0:.0f}s]")
        if best is None or m["ll"] > best[0]:
            best = (m["ll"], ds, E)
    _, ds_b, Ebest = best
    res["E_whiff"] = model("E_y", is_sw, whiff, Ebest, f"beta_E at d* {ds_b}")
    res["E_chase"] = model("E_y", zone_out, swing_v, Ebest, "beta_E on swing | pitch outside the zone")
    del Ebest

    say("\n3. Tunneling tau_tun (trajectories from Savant's fit)")
    T = np.zeros((len(idx), 1))
    n_t = 0
    for j, i in enumerate(idx):
        pv = sq[i]["prev"]
        if pv is None or rows[pv]["pt"] == rows[i]["pt"]:
            continue
        a, b_ = SF.traj(rows[i]), SF.traj(rows[pv])
        if a is None or b_ is None:
            continue
        dist = lambda u, v: 12 * math.hypot(u[0] - v[0], u[1] - v[1])  # noqa: E731
        d_rel, d_tun, d_pl = dist(a[0], b_[0]), dist(a[1], b_[1]), dist(a[2], b_[2])
        tau = max(-1.0, min(1.0, math.exp(-d_tun / 6) * SF.g_mod(d_pl, 18) - d_rel / 8))
        T[j, 0] = tau * (1.5 if rows[i]["c"] in ("SL", "CB") else 1.0)
        n_t += 1
    say(f"  pitches with a different previous pitch and both trajectories: {n_t}")
    res["tun_whiff"] = model("tau_tun", is_sw, whiff, T, "beta_tun on whiff | swing")
    res["tun_chase"] = model("tau_tun", zone_out, swing_v, T, "beta_tun on swing | outside the zone")

    say("\n4. Familiarity on hard | ball in play (features clipped at the spec cap's n)")
    Fm = np.array([[min(sq[i]["n_fb"], 0.5 / 0.058) * (rows[i]["c"] == "FB"),
                    min(sq[i]["n_os"], 0.5 / 0.116) * (rows[i]["c"] != "FB")] for i in idx])
    res["fam_all"] = model("familiarity", bipv, hard, Fm, "phi_FB, phi_OS, all starts (TTO control kept)")
    del sq

    say("\n5. Ground ball | ball in play: beta_y; GB rate by type (weighted)")
    gb = np.array([1.0 if rows[i]["bb"] == "ground_ball" else 0.0 for i in idx])
    bipt = bip & np.array([rows[i]["bb"] != "" for i in idx])
    Yh = np.array([[rows[i]["z"] - 2.5] for i in idx])
    res["gb_y"] = model("beta_y", bipt, gb, Yh, "beta_y (plate height - 2.5 ft)")
    res["gb_types"] = gb_types(rows, [(j, i) for j, i in enumerate(idx) if bipt[j]], gb, W)
    # MLB-only GB rates, for reference (TYPED gb is an MLB table in v1.0)
    mlb = np.array([rows[i]["lv"] == 0 for i in idx])
    res["gb_types_mlb"] = gb_types(rows, [(j, i) for j, i in enumerate(idx) if bipt[j] and mlb[j]], gb, W)
    say("  GB by type, pooled: " + ", ".join(f"{k} {v:.4f}" for k, v in res["gb_types"].items()))
    say("  GB by type, MLB only: " + ", ".join(f"{k} {v:.4f}" for k, v in res["gb_types_mlb"].items()))

    say("\n6. Count zone kappa(b,k): called strike | take, edge pitches")
    take = np.array([d in SF.TAKE for d in desc])
    cs = np.array([1.0 if d == "called_strike" else 0.0 for d in desc])
    nc = 11
    m_loc = fit(take, cs, X=Xc[:, nc:])
    pl = SF.Fit.predict(m_loc, Xc[:, nc:], pid, bid)
    edge = take & (pl > 0.1) & (pl < 0.9)
    res["kappa"] = model("kappa", edge, cs, Xc[:, :nc], "count dummies (vs 0-0) on edge takes", X=Xc[:, nc:])
    res["shape"] = dict(lam=lam_b, alpha=alpha_b, dstar_E=ds_b)
    res["grid"] = {f"{a},{b}": list(v[:2]) for (a, b), v in grid.items()}
    meta = dict(levels=list(levels), level_seasons=used, frac=args.frac, seed=SEED, half_life=RL.HALF_LIFE,
                weight="w = 0.5 ** ((2025 - season) / 2), levels pooled with equal per-pitch weight",
                pitches=int(len(idx)), seconds=round(time.time() - t0))
    os.makedirs(OUT_DIR, exist_ok=True)
    raw_p = os.path.join(OUT_DIR, "seq_raw.json")
    with open(raw_p, "w") as fh:
        json.dump(dict(meta=meta, results=res), fh, indent=1, default=float)
    decide(res, meta)


OLD_FIT = os.path.join(HERE, "fit_v08.json")
COUNTS = [(b, k) for b in range(4) for k in range(3)][1:]


def decide(res, meta):
    """v1.0's ship decisions kept: shipped terms take the refit value; held terms go through the A3 rule."""
    old = json.load(open(OLD_FIT))
    osh = old["ship"]
    ship, why, table = dict(osh), {}, []

    def row(name, line, oldv, newv, se, applied, note):
        table.append(dict(name=name, where=line, old=oldv, new=newv, se=se, applied=applied, note=note))

    def fitted(key, j=0):
        return res[key]["beta"][j], res[key]["se"][j]

    b, se = fitted("B_whiff"); ship["beta_T"] = b
    row("beta_T", "fit_v08.json ship.beta_T", osh["beta_T"], b, se, True, "shipped as fitted -> refit")
    b, se = fitted("B_hard")
    v, why["gamma_T"] = a3(b, se, -osh["gamma_T"])
    ship["gamma_T"] = -v
    row("gamma_T", "fit_v08.json ship.gamma_T", osh["gamma_T"], -v, se, -v != osh["gamma_T"],
        f"held at spec; A3 on fitted {-b:+.4f} (as gamma_T): " + why["gamma_T"])
    ship["lam"], ship["alpha"] = res["shape"]["lam"], res["shape"]["alpha"]
    row("lam", "fit_v08.json ship.lam", osh["lam"], ship["lam"], None, True, "grid best (weighted pooled ll)")
    row("alpha", "fit_v08.json ship.alpha", osh["alpha"], ship["alpha"], None, True, "grid best (weighted pooled ll)")
    for nm, key in (("beta_E", "E_whiff"), ("beta_E_S", "E_chase")):
        b, se = fitted(key); ship[nm] = b
        row(nm, f"fit_v08.json ship.{nm}", osh[nm], b, se, True, "shipped as fitted -> refit")
    ship["dstar_E"] = res["shape"]["dstar_E"]
    row("dstar_E", "fit_v08.json ship.dstar_E", osh["dstar_E"], ship["dstar_E"], None, True, "grid best")
    b, se = fitted("tun_chase"); ship["beta_tun_chase"] = b
    row("beta_tun_chase", "fit_v08.json ship.beta_tun_chase", osh["beta_tun_chase"], b, se, True,
        "shipped as fitted -> refit")
    b, se = fitted("tun_whiff")
    v, why["beta_tun_whiff"] = a3(b, se, osh["beta_tun_whiff"])
    if v == 0.0 and osh["beta_tun_whiff"] == 0.0:
        lo, hi = b - 1.96 * se, b + 1.96 * se
        why["beta_tun_whiff"] = (f"interval {lo:+.3f}..{hi:+.3f} " + ("includes 0 -> stays 0" if lo <= 0 <= hi
                                 else f"excludes 0 -> fitted {b:+.3f}"))
        if not lo <= 0 <= hi:
            v = b
    ship["beta_tun_whiff"] = v
    row("beta_tun_whiff", "fit_v08.json ship.beta_tun_whiff", osh["beta_tun_whiff"], v, se,
        v != osh["beta_tun_whiff"], f"held at 0; fitted {b:+.4f}: " + why["beta_tun_whiff"])
    b, se = fitted("fam_all", 0); ship["phi_FB"] = max(0.0, b)
    row("phi_FB", "fit_v08.json ship.phi_FB", osh["phi_FB"], ship["phi_FB"], se, True,
        "v1.0 used the fitted value (A3: interval excluded spec and 0) -> refit (floored at 0)")
    b, se = fitted("fam_all", 1)
    v, why["phi_OS"] = a3(b, se, osh["phi_OS"])
    ship["phi_OS"] = max(0.0, v)
    row("phi_OS", "fit_v08.json ship.phi_OS", osh["phi_OS"], ship["phi_OS"], se, ship["phi_OS"] != osh["phi_OS"],
        f"held at spec; fitted {b:+.4f}: " + why["phi_OS"])
    b, se = fitted("gb_y"); ship["beta_y"] = b
    row("beta_y", "fit_v08.json ship.beta_y", osh["beta_y"], b, se, True, "shipped as fitted -> refit")
    ship["kappa"] = {f"{bb}-{kk}": res["kappa"]["beta"][j] for j, (bb, kk) in enumerate(COUNTS)}
    for j, (bb, kk) in enumerate(COUNTS):
        c = f"{bb}-{kk}"
        row(f"kappa {c}", f"fit_v08.json ship.kappa.{c}", osh["kappa"][c], ship["kappa"][c], res["kappa"]["se"][j],
            True, "shipped as fitted -> refit (engine centres on sim_constants TAKE_W)")
    gbo = old["results"]["gb_types"]
    for k in ("4-seam", "sink", "cut", "SL", "CB", "CH"):
        row(f"TYPED gb {k}", f"fit_v08.json results.gb_types.{k}", gbo[k], res["gb_types"][k], None, True,
            "weighted pooled share (MLB-only: %.4f)" % res["gb_types_mlb"].get(k, float("nan")))
    new = dict(old)
    results = dict(old["results"])
    for k in ("B_whiff", "B_hard", "E_whiff", "E_chase", "tun_whiff", "tun_chase", "fam_all", "gb_y", "kappa"):
        results[k] = res[k]
    results["gb_types"] = res["gb_types"]
    results["shape"] = res["shape"]
    results["refit_v13"] = meta
    new["results"] = results
    new["grid"] = res["grid"]
    new["ship"] = ship
    new_why = dict(old.get("why", {}))
    new_why["refit_v13"] = ("v1.3 shared refit (hitter_data/refit_seq.py): v1.0's ship decisions kept; shipped terms "
                            "refit on MLB + AAA + A <= 2025, recency weighted; held terms by the A3 rule")
    for k, v in why.items():
        new_why[k + " (v1.3)"] = v
    new["why"] = new_why
    with open(os.path.join(OUT_DIR, "fit_v08.json"), "w", newline="\n") as fh:
        json.dump(new, fh, indent=1, default=float)
    with open(os.path.join(OUT_DIR, "seq.json"), "w") as fh:
        json.dump(dict(meta=meta, rows=table), fh, indent=1, default=float)
    say("\nRefit table")
    for t in table:
        se = "" if t["se"] is None else f" se {t['se']:.4f}"
        say(f"  {t['name']}: {t['old']:+.4f} -> {t['new']:+.4f}{se}  applied={t['applied']}  ({t['note']})")
    with open(os.path.join(OUT_DIR, "seq.txt"), "w") as fh:
        fh.write("\n".join(lines) + "\n")
    return table


if __name__ == "__main__":
    main()
