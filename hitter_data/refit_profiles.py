"""v1.3 shared refits (plan section 4), inventory rows 7, 8, 9, B5, B6, B11: the profile table, tag thresholds and
profile terms, refit on every fit season (<= 2025) in the new data layout.

    python3 -m hitter_data.refit_profiles [--frac 0.35] [--boot 100] [--out C:/dev/pitchiq-data/refit]

Keeps the shipped forms and only refits the numbers:
- profiles_fit.py (rows 7, 8): MLB only, 2021-2025, recency weights (hitter_data.refit_load.recency_weight). The
  medians are weighted medians; the label check runs the shipped rule (start at profiles_fit.T, move each gated label's
  one threshold by the smallest whole number of steps, at most 6, that reaches 80% weighted agreement). College / HS rows
  keep their construction (profiles_fit.level_tables): they move only through the refit MLB differences.
- profile_terms_fit.py + profile_terms_tables.py (rows 9, B5, B6, B11): MLB + AAA + A pooled, recency weighted. The
  model structure that shipped (which blocks ship, results/v11/step2_fit.json) is held fixed: the final joint fits are
  refit with weights on a game sample (--frac of each level-season's games, for memory), the priors' rate tables are
  recomputed on all fit seasons and kept at their shipped no-harm scale (no held-out check is rerun, so 2026 is never
  needed and 2025 stays in the fit). GB_PROFILE, SLOT_ANGLE and SLOT_MOVE are weighted descriptive values.
- The engine literals are written by the scripts' own write_engines into a scratch copy (never this checkout) and
  returned as a patch.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from . import fit_seasons
from . import refit_load as RL

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO not in sys.path:
    sys.path.insert(0, REPO)


# ------------------------------------------------------------------------------------------------ weighted statistics
def wquantile(x, w, q=0.5):
    """Weighted quantile (lower median convention: the smallest x whose cumulative weight reaches q of the total).
    With equal weights and an odd count this is the ordinary median."""
    x = np.asarray(x, float)
    w = np.asarray(w, float)
    ok = ~np.isnan(x) & (w > 0)
    x, w = x[ok], w[ok]
    if len(x) == 0:
        return float("nan")
    o = np.argsort(x, kind="mergesort")
    x, w = x[o], w[o]
    c = np.cumsum(w)
    t = q * c[-1]
    i = int(np.searchsorted(c, t - 1e-12 * c[-1]))
    # an exact tie at the half way point averages the two middle values (the ordinary even-count median)
    if i + 1 < len(x) and abs(c[i] - t) <= 1e-12 * c[-1]:
        return float((x[i] + x[i + 1]) / 2)
    return float(x[i])


def wmedian(x, w):
    return wquantile(x, w, 0.5)


def wmean(x, w):
    x = np.asarray(x, float)
    w = np.asarray(w, float)
    return float((x * w).sum() / w.sum())


def poisson_weights(games, B, seed=0):
    """Game-clustered Poisson bootstrap: one Poisson(1) multiplicity per game per replicate -> (B, n_rows) multipliers."""
    g, inv = np.unique(np.asarray(games), return_inverse=True)
    rng = np.random.default_rng(seed)
    m = rng.poisson(1.0, (B, len(g))).astype(float)
    return m[:, inv]


def sample_games(df, frac, seed=11):
    """Keep `frac` of each level-season's games (a fixed hash of game_pk, so reruns keep the same games)."""
    if frac >= 1.0:
        return df
    h = (pd.util.hash_pandas_object(df["game_pk"].astype("int64"), index=False).values % 10000) / 10000.0
    rng = np.random.default_rng(seed)
    off = rng.random()
    return df[((h + off) % 1.0) < frac]


# ------------------------------------------------------------------------------------------------ frames
def movement_frame(d, kind_map, fastball=("FB", "SI", "FC"), main_how="inner"):
    """profiles_fit.load / profile_terms_fit.load's shared part on a Savant frame: kind, IVB / HB (right-hander
    normalized), each pitcher-game's main fastball and the speed / movement gaps off it."""
    d = d[d.pitch_type.isin(list(kind_map))].copy()
    for c in ("release_speed", "pfx_x", "pfx_z"):
        d[c] = pd.to_numeric(d[c], errors="coerce")
    d = d.dropna(subset=["release_speed", "pfx_x", "pfx_z", "p_throws"])
    d["pitch_type"] = d["pitch_type"].astype(str)
    d["p_throws"] = d["p_throws"].astype(str)
    d["kind"] = d.pitch_type.map(kind_map)
    d["ivb"] = d.pfx_z * 12.0
    d["hb"] = np.where(d.p_throws == "R", -d.pfx_x, d.pfx_x) * 12.0
    d["mph"] = d.release_speed
    fb = d[d.kind.isin(fastball)]
    cnt = fb.groupby(["game_pk", "pitcher", "pitch_type"]).size().rename("n").reset_index()
    main = cnt.sort_values("n", ascending=False, kind="mergesort").drop_duplicates(["game_pk", "pitcher"])
    m = fb.merge(main[["game_pk", "pitcher", "pitch_type"]], on=["game_pk", "pitcher", "pitch_type"])
    ms = m.groupby(["game_pk", "pitcher"]).agg(fb_mph=("mph", "mean"), fb_ivb=("ivb", "mean"), fb_hb=("hb", "mean"),
                                               fb_type=("pitch_type", "first")).reset_index()
    d = d.merge(ms, on=["game_pk", "pitcher"], how=main_how)
    d = d.dropna(subset=["fb_mph"])
    d["dmph"] = d.fb_mph - d.mph
    d["divb"] = d.ivb - d.fb_ivb
    d["dhb"] = d.hb - d.fb_hb
    return d


# ------------------------------------------------------------------------------------------------ rows 7, 8
def w_typical(d, PF):
    return {k: (wmedian(d.ivb[d.kind == k], d.w[d.kind == k]), wmedian(d.hb[d.kind == k], d.w[d.kind == k]))
            for k in PF.FASTBALL}


def w_agreement(d, tags, PF):
    """profiles_fit.agreement with weighted shares (n stays the raw count, which gates a label)."""
    res = {}
    want_of = {"ST": "sweeper", "FS": "split", "FO": "split", "SV": "slurve", "CS": "slow"}
    for lab, kind in PF.LABEL_KIND.items():
        sel = (d.pitch_type == lab).values
        if not sel.any():
            continue
        want = want_of[lab]
        got = tags.values[sel]
        w = d.w.values[sel]
        ps = ((tags == want) & (d.kind == kind)).values
        res[lab] = dict(n=int(sel.sum()), tag=want, agree=round(float((w * (got == want)).sum() / w.sum()), 4),
                        precision=(round(float((d.w.values[ps] * (d.pitch_type.values[ps] == lab)).sum() / d.w.values[ps].sum()), 4)
                                   if ps.any() else None))
    return res


def fit_profile_table(d, PF, lines):
    """profiles_fit.main on pooled weighted MLB seasons. Returns the profiles.json-shaped dict."""
    typ = w_typical(d, PF)
    lines.append("typical fastball-class pitch, MLB pooled (IVB, HB arm side +): " +
                 ", ".join(f"{k} {v[0]:.2f}/{v[1]:.2f}" for k, v in typ.items()))
    t = dict(PF.T)
    tags = PF.tag(d, typ, t)
    first = w_agreement(d, tags, PF)
    moved = {}
    for lab, (want, knob, step) in PF.LABEL_KNOB.items():
        if lab not in first or first[lab]["agree"] >= 0.80 or first[lab]["n"] < PF.GATE_N:
            continue
        for i in range(1, 7):
            t2 = dict(t)
            t2[knob] = PF.T[knob] + i * step
            a = w_agreement(d, PF.tag(d, typ, t2), PF)[lab]["agree"]
            if a >= 0.80:
                moved[knob] = (PF.T[knob], t2[knob], first[lab]["agree"], a)
                t[knob] = t2[knob]
                break
        else:
            moved[knob] = (PF.T[knob], PF.T[knob], first[lab]["agree"], None)
    tags = PF.tag(d, typ, t)
    agree = w_agreement(d, tags, PF)
    by_season = {}
    for s in sorted(d.season.unique()):
        ds = d[d.season == s]
        by_season[int(s)] = {k: v["agree"] for k, v in w_agreement(ds, tags[ds.index], PF).items()}
    d = d.copy()
    d["tag"] = np.where(d.pitch_type.isin(list(PF.LABEL_TAG)), d.pitch_type.map(PF.LABEL_TAG), tags)
    lines.append("label agreement (weighted): " + ", ".join(
        f"{k} start {first[k]['agree']:.1%} final {agree[k]['agree']:.1%} (n {agree[k]['n']:,})" for k in agree))
    lines.append("agreement by season: " + json.dumps(by_season))
    lines.append("threshold moves: " + (", ".join(f"{k} {v[0]} -> {v[1]}" for k, v in moved.items()) or "none"))
    prof = profile_medians(d, PF)
    return dict(thresholds=t, moved={k: list(v) for k, v in moved.items()}, typical={k: list(v) for k, v in typ.items()},
                agreement_2024=agree, agreement_2025=agree, agreement_start=first, agreement_by_season=by_season, mlb=prof,
                n_train=int(len(d)), n_check=0,
                note="v1.3 refit: MLB 2021-2025 pooled, recency weighted (w = 0.5**((2025 - season)/2)); weighted medians "
                     "and weighted label agreement. agreement_2024 / agreement_2025 both hold the pooled agreement "
                     "(no held-out season in the refit)."), d


def profile_medians(d, PF, wcol="w"):
    prof = {}
    for kind in ("FB", "SI", "FC", "SL", "CB", "CH"):
        dk = d[d.kind == kind]
        if kind in ("SI", "FC"):
            ref = dk[(dk.fb_type == "FF") & (dk.pitch_type != "FF")]
        else:
            ref = dk[dk.fb_type == "FF"] if kind != "FB" else dk
        for tg in ("",) + PF.TAGS[kind]:
            s = dk if tg == "" else dk[dk.tag == tg]
            r = ref if tg == "" else ref[ref.tag == tg]
            if len(s) < 200:
                continue
            if kind == "FB":
                dm = 0.0
            elif len(r) >= 100:
                dm = wmedian(r.dmph, r[wcol])
            else:
                dm = wmedian(s.dmph, s[wcol])
            prof[f"{kind}|{tg}"] = dict(dmph=round(dm, 1), ivb=round(wmedian(s.ivb, s[wcol]), 1),
                                        hb=round(wmedian(s.hb, s[wcol]), 1), n=int(len(s)),
                                        share=round(float(s[wcol].sum() / dk[wcol].sum()), 3))
    return prof


def boot_profile_medians(d, PF, B=100, seed=0):
    """Game-clustered Poisson bootstrap SD of each MLB profile median (tags held at the point fit)."""
    reps = {}
    games = d.game_pk.values
    g, inv = np.unique(games, return_inverse=True)
    rng = np.random.default_rng(seed)
    base_w = d.w.values
    for b in range(B):
        m = rng.poisson(1.0, len(g)).astype(float)[inv]
        dd = d.assign(wb=base_w * m)
        p = profile_medians(dd, PF, wcol="wb")
        for k, v in p.items():
            reps.setdefault(k, []).append((v["dmph"], v["ivb"], v["hb"]))
    return {k: [round(float(x), 2) for x in np.std(np.array(v), axis=0)] for k, v in reps.items()}


# ------------------------------------------------------------------------------------------------ weighted MAP logistic
class WFit:
    """seq_fit.Fit with case weights: logistic with pitcher and batter random intercepts as MAP penalized intercepts
    (prior SD 0.25) and a game-clustered robust covariance for the fixed effects. w=None reproduces seq_fit.Fit."""
    RE_SD = 0.25

    def __init__(self, X, y, pid, bid, games, npit, nbat, w=None):
        self.X, self.y, self.pid, self.bid, self.g = X, y, pid, bid, games
        self.np_, self.nb = npit, nbat
        self.w = np.ones(len(y)) if w is None else np.asarray(w, float)

    def run(self, extra=None):
        X = self.X if extra is None else np.hstack([self.X, extra])
        n, d = X.shape
        w = self.w
        mu = X.mean(0)
        sd = X.std(0)
        sd[sd == 0] = 1
        Z = np.hstack([np.ones((n, 1)), (X - mu) / sd])
        y, pid, bid = self.y, self.pid, self.bid
        lam_re = 1 / self.RE_SD ** 2
        D = d + 1
        npit, nb = self.np_, self.nb

        def fg(par):
            beta, up, ub = par[:D], par[D:D + npit], par[D + npit:]
            eta = Z @ beta + up[pid] + ub[bid]
            p = 1 / (1 + np.exp(-eta))
            ll = np.sum(w * (y * eta - np.logaddexp(0, eta)))
            res = w * (y - p)
            gb = Z.T @ res - 1e-4 * np.r_[0, beta[1:]]
            gp = np.bincount(pid, res, npit) - lam_re * up
            gu = np.bincount(bid, res, nb) - lam_re * ub
            obj = -(ll - 0.5e-4 * beta[1:] @ beta[1:] - 0.5 * lam_re * (up @ up + ub @ ub))
            return obj, -np.r_[gb, gp, gu]

        p0 = np.zeros(D + npit + nb)
        ybar = float((w * y).sum() / w.sum())
        p0[0] = np.log(ybar / (1 - ybar))
        r = minimize(fg, p0, jac=True, method="L-BFGS-B", options=dict(maxiter=3000))
        par = r.x
        beta, up, ub = par[:D], par[D:D + npit], par[D + npit:]
        eta = Z @ beta + up[pid] + ub[bid]
        p = 1 / (1 + np.exp(-eta))
        H = (Z * (w * p * (1 - p))[:, None]).T @ Z + 1e-4 * np.diag(np.r_[0, np.ones(D - 1)])
        S = Z * (w * (y - p))[:, None]
        G = np.zeros((self.g.max() + 1, D))
        np.add.at(G, self.g, S)
        Hi = np.linalg.pinv(H)
        cov = Hi @ (G.T @ G) @ Hi
        b_raw = beta[1:] / sd
        se_raw = np.sqrt(np.diag(cov)[1:]) / sd
        return dict(b_raw=b_raw, se_raw=se_raw, n=n, converged=bool(r.success), nit=int(r.nit))


# ------------------------------------------------------------------------------------------------ rows 9, B5, B6, B11
def terms_frame(df, PF, typ_rows, thresholds):
    """profile_terms_fit.load on a Savant frame (all levels), tagged with the refit thresholds and typical rows."""
    num = ("release_spin_rate", "plate_x", "plate_z", "sz_top", "sz_bot", "launch_speed", "arm_angle", "balls", "strikes",
           "outs_when_up", "zone", "n_thruorder_pitcher", "fld_score", "bat_score")
    d = df.copy()
    for c in num:
        d[c] = pd.to_numeric(d[c], errors="coerce")
    d["description"] = d["description"].astype(str)
    d = d[~d.description.str.contains("bunt", na=False)]
    d = movement_frame(d, PF.KIND, main_how="left")
    d = d.dropna(subset=["plate_x", "plate_z", "sz_top", "sz_bot", "balls", "strikes", "outs_when_up"])
    d["stand"] = d["stand"].astype(str)
    d["cls"] = np.where(d.kind.isin(["FB", "SI", "FC"]), "FB", d.kind)
    d["spin"] = d.release_spin_rate
    d["game_year"] = d["season"].astype(int)
    d = d.sort_values(["game_pk", "at_bat_number", "pitch_number"], kind="mergesort").reset_index(drop=True)
    t = PF.tag(d, typ_rows, thresholds)
    d["tag"] = np.where(d.pitch_type.isin(list(PF.LABEL_TAG)), d.pitch_type.map(PF.LABEL_TAG), t)
    d["prof"] = d.kind + "|" + d.tag
    return d


def fit_terms(d, shipped, fb_typ_ivb, lines, frac_note):
    """The shipped Step 2 structure refit on the pooled weighted frame. Returns a step2_fit.json-shaped dict with the
    keys profile_terms_tables.build reads."""
    import profile_terms_fit as PTF
    Xc, xs, zn = PTF.features(d)
    w = d.w.values.astype(float)
    pid = pd.factorize(d.pitcher)[0]
    bid = pd.factorize(d.batter)[0]
    npit, nbat = pid.max() + 1, bid.max() + 1
    gid = pd.factorize(d.game_pk)[0]
    desc = d.description.values.astype(str)
    is_sw = np.isin(desc, list(PTF.SWING))
    whiff = np.isin(desc, list(PTF.WHIFF)).astype(float)
    take = np.isin(desc, list(PTF.TAKE))
    cs = (desc == "called_strike").astype(float)
    zone_out = d.zone.isin([11, 12, 13, 14]).values
    bip = desc == "hit_into_play"
    ls = d.launch_speed.values.astype(float)
    bipv = bip & ~np.isnan(ls)
    hard = (np.nan_to_num(ls) >= 95).astype(float)
    TARGETS = {"whiff": (is_sw, whiff), "chase": (zone_out, is_sw.astype(float)), "cstrike": (take, cs), "hard": (bipv, hard)}
    REF = shipped["ref"]
    kinds_lv = ["SI", "FC"]
    prof_lv = [p for p in sorted(set(d.prof)) if p not in REF.values()]
    cls_lv = ["SL", "CB", "CH"]
    Dcls = PTF.dummies(d.cls.values, cls_lv)
    Dprof = np.hstack([PTF.dummies(d.kind.values, kinds_lv), PTF.dummies(d.prof.values, prof_lv)])
    prof_names = kinds_lv + prof_lv
    vert = np.where(d.cls.values == "FB", d.ivb.values - fb_typ_ivb, d.divb.values)
    am = d.arm_angle
    aa = (am.fillna(am.median()).values - 40.0) / 15.0
    C_NAMES, cont = [], []
    for c in ("FB", "SL", "CB", "CH"):
        on = (d.cls.values == c).astype(float)
        cont += [on * d.dmph.values / 5.0, on * vert / 5.0, on * d.hb.values / 5.0, on * aa]
        C_NAMES += [f"{c}:dmph/5", f"{c}:vert/5", f"{c}:hb/5", f"{c}:(arm-40)/15"]
    Ccont = np.column_stack(cont).astype(float)
    up, down, inside = (zn > 0.67).astype(float), (zn < 0.33).astype(float), (xs > 0).astype(float)
    opp = (d.stand.values != d.p_throws.values).astype(float)
    fbp = sorted(p for p in set(d.prof) if p.split("|")[0] in ("FB", "SI", "FC"))
    gated = ["FC|ride"]

    def zcols(plist):
        cols, names = [], []
        for p in plist:
            on = (d.prof.values == p).astype(float)
            for hn, h in (("up", up), ("down", down)):
                cols.append(on * h)
                names.append(f"{p}@{hn}")
            cols.append(on * inside * (1 - opp))
            names.append(f"{p}@in_same")
            cols.append(on * inside * opp)
            names.append(f"{p}@in_opp")
        return np.column_stack(cols), names

    Z2b, names2b = zcols([p for p in fbp if p not in gated])
    os_ = (d.cls.values != "FB").astype(float)
    side_base = np.column_stack([(1 - os_) * opp, os_ * opp])
    cls_side = np.column_stack([(d.cls.values == c).astype(float) * opp for c in ("SL", "CH")])
    cols, names2c = [], []
    for c in ("FB", "SL", "CB", "CH"):
        on = (d.cls.values == c).astype(float)
        cols += [on * opp * d.hb.values / 5.0, on * opp * vert / 5.0]
        names2c += [f"{c}:opp*hb/5", f"{c}:opp*vert/5"]
    Z2c = np.hstack([cls_side, np.column_stack(cols)])
    names2c = ["SL:opp", "CH:opp"] + names2c

    res = {"levels": prof_names, "ref": REF, "C_names": C_NAMES,
           "n_by_prof": d.prof.value_counts().to_dict(), "refit_note": frac_note}
    # the shipped decisions, held fixed (the form)
    res["2a"] = {t: {k: {"ship": v["ship"]} for k, v in shipped["2a"][t].items()} for t in shipped["2a"]}
    res["2b"] = {"names": names2b}
    for k, v in shipped["2b"].items():
        if isinstance(v, dict) and "ship" in v:
            res["2b"][k] = {"ship": v["ship"]}
    res["2c"] = {"names": names2c, "class_names": ["SL:opp", "CH:opp"]}
    for t in ("whiff", "hard", "chase", "cstrike"):
        res["2c"][t] = {"ship": shipped["2c"][t]["ship"], "model": shipped["2c"][t]["model"]}
    ship_b = {t: shipped["2a"][t]["B_over_C"]["ship"] for t in TARGETS}

    # final joint fits
    res["final"] = {}
    nb = Xc.shape[1]
    cls_names = [f"loc:{c}:{v}" for c in ("SL", "CB", "CH") for v in ("xs", "zn", "zn2")] + ["cls:SL", "cls:CB", "cls:CH"]
    for tgt, (mask, y) in TARGETS.items():
        blocks, names = [Ccont], list(C_NAMES)
        if ship_b[tgt]:
            blocks.append(Dprof)
            names += [f"B:{n}" for n in prof_names]
        if tgt in shipped["2b"] and isinstance(shipped["2b"][tgt], dict) and shipped["2b"][tgt].get("ship"):
            blocks.append(Z2b)
            names += [f"2b:{n}" for n in names2b]
            for p in gated:
                g_ = shipped["2b"].get(f"gate:{p}:{tgt}")
                if g_ and g_.get("ship"):
                    zc, nn = zcols([p])
                    blocks.append(zc)
                    names += [f"2b:{n}" for n in nn]
        if shipped["2c"][tgt]["ship"]:
            full = shipped["2c"][tgt]["model"] == "full"
            blocks += [side_base, Z2c if full else cls_side]
            names += ["side:FB:opp", "side:OS:opp"] + [f"2c:{n}" for n in (names2c if full else ["SL:opp", "CH:opp"])]
        m = mask
        ex = np.hstack([b_[m] for b_ in blocks])
        Xb = np.hstack([Xc[m], Dcls[m], ex])
        # drop all-zero columns (a profile absent from the subset) for the fit; they get 0
        live = Xb.std(0) > 0
        pid_m, bid_m = pd.factorize(pid[m])[0], pd.factorize(bid[m])[0]
        gid_m = pd.factorize(gid[m])[0]
        F = WFit(Xb[:, live], y[m], pid_m, bid_m, gid_m, pid_m.max() + 1, bid_m.max() + 1, w=w[m])
        r = F.run()
        b = np.zeros(Xb.shape[1])
        se = np.zeros(Xb.shape[1])
        b[live], se[live] = r["b_raw"], r["se_raw"]
        k = ex.shape[1]
        res["final"][tgt] = dict(names=names, beta=b[-k:].tolist(), se=se[-k:].tolist(), class_names=cls_names,
                                 class_beta=b[nb - 9:nb + 3].tolist(), class_se=se[nb - 9:nb + 3].tolist(),
                                 n=int(m.sum()), converged=r["converged"], nit=r["nit"])
        lines.append(f"final {tgt}: n {int(m.sum()):,}, {k} terms, converged {r['converged']} ({r['nit']} it)")
        del Xb
    # priors at their shipped scale, rate tables on all fit seasons (weighted)
    stage = np.where(d.strikes.values == 2, "2k", "early")
    side = np.where(opp > 0, "opp", "same")
    hgt = np.where(zn > 0.67, "up", np.where(zn < 0.33, "down", "mid"))
    prof, cls = d.prof.values.astype(str), d.cls.values.astype(str)

    def lg(r):
        r = np.clip(r, 1e-3, 1 - 1e-3)
        return np.log(r / (1 - r))

    def rate_table(mask, y, keys):
        t = pd.DataFrame({"k": keys[mask], "y": y[mask] * w[mask], "w": w[mask]}).groupby("k").agg(
            y=("y", "sum"), w=("w", "sum"), n=("w", "size"))
        return {k: (float(v["y"] / v["w"]), int(v["n"])) for k, v in t.iterrows()}

    def prior(name, tgt, kp, kc, kp0=None, kc0=None, n_min=200, keep=None):
        mask, y = TARGETS[tgt]
        P, Cc = rate_table(mask, y, kp), rate_table(mask, y, kc)
        P0 = rate_table(mask, y, kp0) if kp0 is not None else None
        C0 = rate_table(mask, y, kc0) if kc0 is not None else None
        first = pd.Series(np.arange(len(kp))).groupby(kp).first().to_dict()
        tab = {}
        for k, (r, n) in P.items():
            j = int(first[k])
            if n < n_min:
                continue
            v = lg(r) - lg(Cc[kc[j]][0])
            if P0 is not None:
                v -= lg(P0[kp0[j]][0]) - lg(C0[kc0[j]][0])
            tab[k] = float(v)
        if keep is not None:
            tab = {k: v for k, v in tab.items() if keep(k)}
        sc = shipped["priors"][name]["scale"]
        lines.append(f"prior {name}: {len(tab)} cells, shipped scale {sc:g}")
        return dict(table=tab, scale=sc, gain=None, sd=None, note="scale held at the shipped no-harm value")

    def J(*xs):
        out = xs[0]
        for x in xs[1:]:
            out = np.char.add(np.char.add(out, "|"), x)
        return out

    res["priors"] = {}
    grp = np.where(cls == "FB", "FB", "OS")
    pri = shipped["priors"]
    if "cstrike_profile" in pri:
        res["priors"]["cstrike_profile"] = prior("cstrike_profile", "cstrike", J(prof, side, stage), J(cls, side, stage))
    for tgt in ("whiff", "hard", "chase", "cstrike"):
        if f"platoon_{tgt}" in pri:
            res["priors"][f"platoon_{tgt}"] = prior(f"platoon_{tgt}", tgt, J(prof, side, stage), J(grp, side, stage),
                                                    J(prof, stage), J(grp, stage))
    fbm = cls == "FB"
    for tgt in ("whiff", "hard", "cstrike"):
        if f"fbzone_{tgt}" in pri:
            kp = np.where(fbm, J(np.char.add(np.char.add(prof, "@"), hgt), side, stage), "x")
            kc = np.where(fbm, J(np.char.add("FB@", hgt), side, stage), "x")
            res["priors"][f"fbzone_{tgt}"] = prior(f"fbzone_{tgt}", tgt, kp, kc, np.where(fbm, J(prof, side, stage), "x"),
                                                   np.where(fbm, J(np.full(len(prof), "FB"), side, stage), "x"))
    if "fblane_hard" in pri:
        lane = np.where(xs > 0.28, "in", np.where(xs < -0.28, "away", "mid"))
        kp = np.where(fbm, J(np.char.add(np.char.add(prof, "@"), lane), side), "x")
        kc = np.where(fbm, J(np.char.add("FB@", lane), side), "x")
        res["priors"]["fblane_hard"] = prior("fblane_hard", "hard", kp, kc, np.where(fbm, J(prof, side), "x"),
                                             np.where(fbm, J(np.full(len(prof), "FB"), side), "x"),
                                             keep=lambda k: k.startswith("SI|"))
    # slot angle buckets and slot adjustment (B11), weighted
    bins = [("sidearm", -90, 20), ("low three-quarter", 20, 35), ("three-quarter", 35, 45), ("high three-quarter", 45, 55),
            ("over the top", 55, 91)]
    amv = am.values.astype(float)
    res["slot_angle"] = {nm: round(wmedian(amv[(amv >= lo) & (amv < hi)], w[(amv >= lo) & (amv < hi)]), 1)
                         for nm, lo, hi in bins}
    res["slot"] = {}
    ok = ~np.isnan(amv)
    for kind in ("FB", "SI", "FC", "SL", "CB", "CH"):
        sel = ok & (d.kind.values == kind)
        if sel.sum() < 500:
            continue
        tags_k = sorted(set(d.tag.values[sel]))
        X = np.column_stack([np.ones(sel.sum()), amv[sel]] + [(d.tag.values[sel] == t).astype(float) for t in tags_k[1:]])
        sw = np.sqrt(w[sel])
        out = {}
        for col in ("ivb", "hb"):
            bcoef, *_ = np.linalg.lstsq(X * sw[:, None], d[col].values[sel] * sw, rcond=None)
            out[col] = round(float(bcoef[1]), 4)
        out["ref_angle"] = round(wmedian(amv[sel], w[sel]), 1)
        out["n"] = int(sel.sum())
        res["slot"][kind] = out
    # 2e grounders (B6): weighted rate; n = the effective (weighted) count, so a kind's n-weighted average is its
    # weighted rate (profile_terms_tables.build and tests.py #16 average the profiles by n)
    bt = bip & d.bb_type.notna().values
    gb = (d.bb_type.astype(str).values == "ground_ball")
    g = pd.DataFrame({"prof": d.prof.values[bt], "gb": gb[bt] * w[bt], "w": w[bt]}).groupby("prof").agg(
        gb=("gb", "sum"), w=("w", "sum"), raw=("w", "size"))
    res["2e"] = {p: dict(gb=round(float(r["gb"] / r["w"]), 4), n=int(round(r["w"])), n_raw=int(r["raw"])) for p, r in g.iterrows()}
    # GB_PROFILE uncertainty: game-clustered Poisson bootstrap
    gid_bt = gid[bt]
    gg, inv = np.unique(gid_bt, return_inverse=True)
    rng = np.random.default_rng(3)
    pk = d.prof.values[bt]
    reps = []
    gbw, ww = gb[bt] * w[bt], w[bt]
    codes, uniq = pd.factorize(pk)
    for _ in range(100):
        m = rng.poisson(1.0, len(gg)).astype(float)[inv]
        reps.append(np.bincount(codes, gbw * m, len(uniq)) / np.maximum(np.bincount(codes, ww * m, len(uniq)), 1e-9))
    sdv = np.std(np.array(reps), axis=0)
    res["2e_se"] = {p: round(float(s), 4) for p, s in zip(uniq, sdv)}
    # chase group means (profile_terms_tables.chase_group_means), weighted, all fit seasons
    mfin = {k[3:]: v for k, v in zip(res["final"]["chase"]["names"], res["final"]["chase"]["beta"]) if k.startswith("2c:")}
    o = opp > 0
    gch = np.zeros(len(d))
    for c in ("FB", "SL", "CB", "CH"):
        on = (d.cls.values == c)
        gch[on] = (mfin.get(f"{c}:opp", 0.0) + mfin[f"{c}:opp*hb/5"] * d.hb.values[on] / 5
                   + mfin[f"{c}:opp*vert/5"] * vert[on] / 5)
    fb = d.cls.values == "FB"
    chase_means = {"FB": wmean(gch[o & fb], w[o & fb]), "OS": wmean(gch[o & ~fb], w[o & ~fb])}
    return res, chase_means


# ------------------------------------------------------------------------------------------------ engines (scratch)
def scratch_copy(scratch):
    """A copy of the tracked files at HEAD plus the working tree's versions (git archive of HEAD, then the files the
    write steps touch copied from the checkout)."""
    if os.path.exists(scratch):
        shutil.rmtree(scratch)
    os.makedirs(scratch)
    for f in ("engine.py", "app/engine.js", "results/v11/profiles.json", "results/v11/profiles_levels.json",
              "results/v11/step2_fit.json", "results/v11/step2_terms.json", "results/v11/step2_terms.txt",
              "results/v11/tag_sample.json"):
        dst = os.path.join(scratch, f)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(REPO, f), dst)


def to_lf(path):
    with open(path, "rb") as fh:
        b = fh.read()
    nb = b.replace(b"\r\n", b"\n")
    if nb != b:
        with open(path, "wb") as fh:
            fh.write(nb)


def make_patch(scratch, files, out):
    chunks = []
    for f in files:
        r = subprocess.run(["git", "diff", "--no-index", "--", os.path.join(REPO, f).replace("\\", "/"),
                            os.path.join(scratch, f).replace("\\", "/")], capture_output=True, text=True, encoding="utf-8")
        if not r.stdout:
            continue
        lines = r.stdout.splitlines(keepends=True)
        fixed = []
        for ln in lines:
            if ln.startswith("diff --git "):
                ln = f"diff --git a/{f} b/{f}\n"
            elif ln.startswith("--- "):
                ln = f"--- a/{f}\n"
            elif ln.startswith("+++ "):
                ln = f"+++ b/{f}\n"
            fixed.append(ln)
        chunks.append("".join(fixed))
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("".join(chunks))
    return [f for f, c in zip(files, chunks) if c]


def write_tag_sample(d_mlb, fit, PF, path, n_per_kind=700, seed=20261112):
    """profiles_fit.write_sample on the pooled MLB frame (thresholds' own tags, no label override)."""
    tabs = PF.level_tables(fit["mlb"])["mlb"]
    tr = d_mlb.copy()
    typ = {k: (tabs[f"{k}|"][1], tabs[f"{k}|"][2]) for k in PF.FASTBALL}
    for c, nd in (("ivb", 2), ("hb", 2), ("mph", 2), ("fb_mph", 3), ("fb_ivb", 3), ("fb_hb", 3)):
        tr[c] = tr[c].round(nd)
    tr["dmph"], tr["divb"], tr["dhb"] = tr.fb_mph - tr.mph, tr.ivb - tr.fb_ivb, tr.hb - tr.fb_hb
    tr["tag"] = PF.tag(tr, typ, fit["thresholds"])
    rows = []
    for kind in ("FB", "SI", "FC", "SL", "CB", "CH"):
        dd = tr[tr.kind == kind].sample(n=n_per_kind, random_state=seed)
        for r in dd.itertuples():
            rows.append([kind, round(r.ivb, 2), round(r.hb, 2), round(r.mph, 2), round(r.fb_mph, 3), round(r.fb_ivb, 3),
                         round(r.fb_hb, 3), r.tag])
    with open(path, "w", newline="\n") as fh:
        json.dump(dict(level="mlb", note="kind, IVB, HB (arm side +), mph, main FB mph / IVB / HB, tag from profiles_fit.tag "
                                         "(v1.3 refit sample: MLB 2021-2025)", rows=rows), fh)


# ------------------------------------------------------------------------------------------------ main
def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--frac", type=float, default=0.35, help="share of each level-season's games in the term fits")
    ap.add_argument("--boot", type=int, default=100)
    ap.add_argument("--out", default=os.path.join(RL.DATA, "refit"))
    ap.add_argument("--skip-terms", action="store_true")
    a = ap.parse_args(argv)
    import profiles_fit as PF
    import profile_terms_tables as PTT
    import engine as E
    out = a.out
    os.makedirs(out, exist_ok=True)
    lines = []
    say = lambda s: (print(s, flush=True), lines.append(s))
    shipped_prof = json.load(open(os.path.join(REPO, "results", "v11", "profiles.json")))
    shipped_fit = json.load(open(os.path.join(REPO, "results", "v11", "step2_fit.json")))

    # ---- rows 7, 8: MLB only
    seasons = fit_seasons(RL.fit_seasons_on_disk("MLB"))
    say(f"rows 7/8: MLB seasons {seasons}, weights " + ", ".join(f"{s}: {RL.recency_weight(s):.3f}" for s in seasons))
    cols = ["pitch_type", "release_speed", "pfx_x", "pfx_z", "p_throws", "pitcher", "game_pk", "season", "w"]
    raw = RL.savant(levels=("MLB",), seasons=seasons)
    mlb = movement_frame(raw[cols], PF.KIND)
    del raw
    say(f"MLB pitches with a main fastball: {len(mlb):,}")
    fit, mlb = fit_profile_table(mlb, PF, lines)
    for l_ in lines[-4:]:
        print(l_)
    say("bootstrap of the medians ...")
    boot = boot_profile_medians(mlb, PF, B=a.boot)
    old_mlb = shipped_prof["mlb"]
    for k, v in fit["mlb"].items():
        o = old_mlb.get(k)
        say(f"  {k:14s} old {tuple(o[c] for c in ('dmph', 'ivb', 'hb')) if o else None} new {(v['dmph'], v['ivb'], v['hb'])} "
            f"boot sd {boot.get(k)} n {v['n']:,}")
    fit["boot_sd"] = boot

    scratch = os.path.join(out, "prof_scratch")
    scratch_copy(scratch)
    with open(os.path.join(scratch, "results/v11/profiles.json"), "w", newline="\n") as fh:
        json.dump(fit, fh, indent=1)
    PF.HERE = scratch
    tabs = PF.write_engines(fit)
    with open(os.path.join(scratch, "results/v11/profiles_levels.json"), "w", newline="\n") as fh:
        json.dump({lv: {k: list(v) for k, v in tab.items()} for lv, tab in tabs.items()}, fh, indent=1)
    write_tag_sample(mlb, fit, PF, os.path.join(scratch, "results/v11/tag_sample.json"))
    new_mlb_rows = {tuple(k.split("|")): v for k, v in tabs["mlb"].items()}
    del mlb

    result = dict(rows78=dict(seasons=seasons, levels=["MLB"], thresholds_old={k: v for k, v in shipped_prof["thresholds"].items()},
                              thresholds_new=fit["thresholds"], moved=fit["moved"], agreement=fit["agreement_2024"],
                              agreement_by_season=fit["agreement_by_season"],
                              mlb_old={k: [v["dmph"], v["ivb"], v["hb"]] for k, v in old_mlb.items()},
                              mlb_new={k: [v["dmph"], v["ivb"], v["hb"]] for k, v in fit["mlb"].items()}, boot_sd=boot))

    if not a.skip_terms:
        # ---- rows 9, B5, B6, B11: MLB + AAA + A pooled
        frames = []
        for lv in RL.LEVELS:
            for s in fit_seasons(RL.fit_seasons_on_disk(lv)):
                x = RL.load_savant(lv, s)
                x = sample_games(x, a.frac)
                x["w"] = RL.recency_weight(s)
                frames.append(x)
        df = pd.concat(frames, ignore_index=True)
        del frames
        say(f"rows 9/B5/B6/B11: pooled MLB+AAA+A sample ({a.frac:.0%} of games): {len(df):,} pitches; by level-season "
            + json.dumps({f"{lv}{s}": int(n) for (lv, s), n in df.groupby(['level', 'season'], observed=True).size().items()}))
        typ_rows = {k: (new_mlb_rows[(k, "")][1], new_mlb_rows[(k, "")][2]) for k in ("FB", "SI", "FC")}
        d = terms_frame(df, PF, typ_rows, fit["thresholds"])
        del df
        say(f"usable pitches: {len(d):,}")
        fb_typ_ivb = new_mlb_rows[("FB", "")][1]
        note = (f"v1.3 refit: MLB+AAA+A <= 2025, {a.frac:.0%} game sample, recency weights; shipped structure held; "
                "priors at shipped scale")
        res, chase_means = fit_terms(d, shipped_fit, fb_typ_ivb, lines, note)
        del d
        # build with the refit MLB rows (the engine's typical rows move with row 7)
        old_prof = E.PROFILES
        E.PROFILES = dict(old_prof)
        E.PROFILES["mlb"] = new_mlb_rows
        PTT.E = E
        T = PTT.build(res, chase_means)
        rep = PTT.report(T)
        E.PROFILES = old_prof
        with open(os.path.join(scratch, "results/v11/step2_fit.json"), "w", newline="\n") as fh:
            json.dump(res, fh, indent=1, default=float)
        with open(os.path.join(scratch, "results/v11/step2_terms.json"), "w", newline="\n") as fh:
            json.dump(T, fh, indent=1)
        with open(os.path.join(scratch, "results/v11/step2_terms.txt"), "w", newline="\n") as fh:
            fh.write("\n".join(rep) + "\n")
        PTT.HERE = scratch
        PTT.write_engines(T)
        old_T = json.load(open(os.path.join(REPO, "results", "v11", "step2_terms.json")))
        se_c = {t: dict(zip(res["final"][t]["names"], res["final"][t]["se"])) for t in res["final"]}
        result["terms"] = dict(levels=list(RL.LEVELS), frac=a.frac, old={k: old_T[k] for k in T if k in old_T and k != "CLASS_TERMS"},
                               new={k: T[k] for k in T if k != "CLASS_TERMS"},
                               PT_C_se={t: {c: [round(se_c[t][f"{c}:{u}"] / s, 4) for u, s in
                                                zip(("dmph/5", "vert/5", "hb/5", "(arm-40)/15"), PTT.SCALE)]
                                            for c in PTT.CLS} for t in se_c},
                               GB_PROFILE_se=res["2e_se"], final_meta={t: {k: v for k, v in res["final"][t].items()
                                                                           if k in ("n", "converged", "nit")} for t in res["final"]})
        say("terms: " + json.dumps(result["terms"]["final_meta"]))
    for f in ("engine.py", "app/engine.js"):
        to_lf(os.path.join(scratch, f))
    files = ["engine.py", "app/engine.js", "results/v11/profiles.json", "results/v11/profiles_levels.json",
             "results/v11/tag_sample.json", "results/v11/step2_fit.json", "results/v11/step2_terms.json",
             "results/v11/step2_terms.txt"]
    touched = make_patch(scratch, files, os.path.join(out, "prof.patch"))
    say(f"patch {os.path.join(out, 'prof.patch')} touches {touched}")
    with open(os.path.join(out, "prof.json"), "w", newline="\n") as fh:
        json.dump(result, fh, indent=1, default=float)
    with open(os.path.join(out, "prof.txt"), "w", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
