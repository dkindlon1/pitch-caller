"""K-gap diagnosis, PROPOSED fix sizing (report only; nothing here is wired into the engine or its tables).

Question (Drew, Nov 23): how fast does whiff per swing on a pitch kind fall as that kind becomes more predictable,
i.e. as its usage share in that count, for that pitcher, rises?

Data
  HS / travel ball: hs.sqlite3 hs_pitch (pitch_type Fastball / Curveball / Slider / Change-Up), rows with count_ok not 0 (in-play rows carry count_ok NULL: no after-count).
  Statcast Single-A and AAA (2021-25 / 2023-25 from the refit parquet cache), MLB 2023-25 as a control.
  Kinds: FB (FF FA SI FT FC; the engine's fastball kinds), SL (SL ST SV), CB (CU KC CS SC), CH (CH FS FO).
  Swings exclude bunts (Statcast). Whiff = swinging strike / blocked / foul tip (kgap_diag's convention).

Unit: pitcher-season. Usage share u(p,k,c) = n(p,k,c) / n(p,c), leave-one-out for the pitch itself.

Model (linear probability on swings, at cell level, weighted by swings):
  whiff = beta * u + a[pitcher, kind] + g[kind, count] + e
  a[pitcher, kind] absorbs pitch quality (a good-slider pitcher throwing more sliders cannot mask the effect);
  g[kind, count] absorbs the average count pattern. beta is identified by the same pitcher using the same pitch more
  or less than average in a count, relative to his own average. SE clustered by pitcher-season.
Robustness: (i) split-half IV: u from the other half of the pitcher's games instruments u (corrects attenuation from
  noisy shares and removes same-game feedback); (ii) minimum count sample per cell; (iii) by kind group and count group.

Usage: python -m hitter_data.kgap_predict run [OUT.json]
"""
import json
import os
import sqlite3
import sys
import zlib

import numpy as np
import pandas as pd

DATA = "C:/dev/pitchiq-data"
OUT = os.path.join(DATA, "kgap_diag", "predict.json")
KIND = {**{k: "FB" for k in ("FF", "FA", "SI", "FT", "FC")}, **{k: "SL" for k in ("SL", "ST", "SV")},
        **{k: "CB" for k in ("CU", "KC", "CS", "SC")}, **{k: "CH" for k in ("CH", "FS", "FO")}}
HS_KIND = {"Fastball": "FB", "Slider": "SL", "Curveball": "CB", "Change-Up": "CH"}
WHIFF_SC = {"swinging_strike", "swinging_strike_blocked", "foul_tip"}
SWING_SC = WHIFF_SC | {"foul", "hit_into_play"}


def _half(keys):
    return np.array([zlib.crc32(str(k).encode()) & 1 for k in keys], dtype=np.int8)


def load_hs(level):
    c = sqlite3.connect(f"file:{DATA}/hs/hs.sqlite3?mode=ro", uri=True)
    q = """select p.game_id, p.pitcher_id, g.season, p.pitch_type, p.balls, p.strikes, p.letter
           from hs_pitch p join hs_games g using(game_id)
           where g.level = ? and coalesce(p.count_ok, 1) = 1 and p.pitcher_id is not null and p.pitcher_id <> ''"""
    d = pd.read_sql_query(q, c, params=(level,))
    d["kind"] = d.pitch_type.map(HS_KIND)
    d = d[d.kind.notna() & d.balls.between(0, 3) & d.strikes.between(0, 2)]
    d["swing"] = d.letter.isin(["S", "F", "X"])
    d["whiff"] = d.letter.eq("S")
    d["pid"] = d.pitcher_id.astype(str) + "_" + d.season.astype(str)
    d["gkey"] = d.game_id
    return d[["pid", "gkey", "kind", "balls", "strikes", "swing", "whiff"]]


def load_sc(level, seasons):
    fr = []
    for s in seasons:
        p = f"{DATA}/refit/cache/{level}_{s}.parquet"
        if not os.path.exists(p):
            continue
        d = pd.read_parquet(p, columns=["pitch_type", "description", "des", "game_type", "balls", "strikes",
                                        "pitcher", "game_pk"])
        d = d[d.game_type.fillna("R") == "R"]
        d["season"] = s
        fr.append(d)
    d = pd.concat(fr, ignore_index=True)
    d["kind"] = d.pitch_type.astype(str).map(KIND)
    desc = d.description.fillna("").astype(str)
    bunt = desc.str.contains("bunt") | d.des.fillna("").astype(str).str.contains("bunt", case=False)
    d = d[d.kind.notna() & ~bunt & d.balls.between(0, 3) & d.strikes.between(0, 2) & d.pitcher.notna()]
    desc = d.description.astype(str)
    d["swing"] = desc.isin(SWING_SC)
    d["whiff"] = desc.isin(WHIFF_SC)
    d["pid"] = d.pitcher.astype("int64").astype(str) + "_" + d.season.astype(str)
    d["gkey"] = d.game_pk
    return d[["pid", "gkey", "kind", "balls", "strikes", "swing", "whiff"]]


def cells(d):
    """Cell table (pid, kind, count): swings, whiffs, LOO usage share; plus split-half shares."""
    d = d.copy()
    d["c"] = d.balls.astype(str) + "-" + d.strikes.astype(str)
    d["h"] = _half(d.gkey.values) if d.gkey.dtype == object else (
        ((d.gkey.astype("int64").values * 2654435761) % 4294967296) >> 31).astype(np.int8)
    n_pkc = d.groupby(["pid", "kind", "c"]).size().rename("n_pkc")
    n_pc = d.groupby(["pid", "c"]).size().rename("n_pc")
    sw = d[d.swing].groupby(["pid", "kind", "c"]).agg(sw=("whiff", "size"), wh=("whiff", "sum"))
    t = sw.join(n_pkc).reset_index().merge(n_pc.reset_index(), on=["pid", "c"])
    # leave-one-out: each swing's own pitch is removed from the share it sees
    t["u"] = (t.n_pkc - 1) / (t.n_pc - 1).clip(lower=1)
    # split halves: outcome in half h, share from half 1-h
    hp = d.groupby(["pid", "kind", "c", "h"]).size().rename("n").reset_index()
    hc = d.groupby(["pid", "c", "h"]).size().rename("m").reset_index()
    hp = hp.merge(hc, on=["pid", "c", "h"])
    hp["uh"] = hp.n / hp.m
    swh = d[d.swing].groupby(["pid", "kind", "c", "h"]).agg(sw=("whiff", "size"), wh=("whiff", "sum")).reset_index()
    oth = hp[["pid", "kind", "c", "h", "uh", "m"]].copy()
    oth["h"] = 1 - oth.h
    oth = oth.rename(columns={"uh": "u_other", "m": "m_other"})
    own = hp[["pid", "kind", "c", "h", "uh", "n", "m"]]
    hh = swh.merge(own, on=["pid", "kind", "c", "h"]).merge(oth, on=["pid", "kind", "c", "h"], how="left")
    # a kind never thrown in the other half in that count, though the count was seen there: share 0
    hh["u_other"] = hh.u_other.fillna(0.0)
    hh["u_loo"] = (hh.n - 1) / (hh.m - 1).clip(lower=1)
    return t, hh


def demean(cols, w, groups, tol=1e-10, it=500):
    """Weighted alternating projections: residualise each column on the fixed-effect groups."""
    X = np.column_stack(cols).astype(float)
    codes = [pd.factorize(g)[0] for g in groups]
    for _ in range(it):
        mx = 0.0
        for cd in codes:
            sw = np.bincount(cd, weights=w)
            for j in range(X.shape[1]):
                m = np.bincount(cd, weights=w * X[:, j]) / np.where(sw > 0, sw, 1)
                X[:, j] -= m[cd]
                mx = max(mx, np.abs(m).max())
        if mx < tol:
            break
    return X


def fe_ols(y, x, w, groups, cluster):
    Y, Xd = demean([y, x], w, groups).T
    b = (w * Xd * Y).sum() / (w * Xd * Xd).sum()
    e = Y - b * Xd
    g = pd.factorize(cluster)[0]
    s = np.bincount(g, weights=w * Xd * e)
    v = (s ** 2).sum() / (w * Xd * Xd).sum() ** 2
    G = g.max() + 1
    v *= G / max(G - 1, 1)
    return float(b), float(np.sqrt(v))


def fe_iv(y, x, z, w, groups, cluster):
    Y, Xd, Zd = demean([y, x, z], w, groups).T
    fs = (w * Zd * Xd).sum() / (w * Zd * Zd).sum()
    b = (w * Zd * Y).sum() / (w * Zd * Xd).sum()
    e = Y - b * Xd
    g = pd.factorize(cluster)[0]
    s = np.bincount(g, weights=w * Zd * e)
    v = (s ** 2).sum() / (w * Zd * Xd).sum() ** 2
    G = g.max() + 1
    v *= G / max(G - 1, 1)
    # first-stage strength: t on z
    ex = Xd - fs * Zd
    sf = np.bincount(g, weights=w * Zd * ex)
    vf = (sf ** 2).sum() / (w * Zd * Zd).sum() ** 2
    return float(b), float(np.sqrt(v)), float(fs), float(fs / np.sqrt(vf))


def estimate(t, hh, min_pc=10):
    out = {}
    T = t[t.n_pc >= min_pc]
    y = (T.wh / T.sw).values
    w = T.sw.values.astype(float)
    grp = [T.pid + "|" + T.kind, T.kind + "|" + T.c]
    b, se = fe_ols(y, T.u.values, w, grp, T.pid.values)
    out["main"] = dict(beta=b, se=se, swings=int(w.sum()), cells=len(T), pitchers=int(T.pid.nunique()),
                       whiff_per_swing=float((T.wh.sum()) / w.sum()), mean_u=float((w * T.u).sum() / w.sum()))
    # no pitcher fixed effect: the masked (between-pitcher) slope, for contrast
    b0, se0 = fe_ols(y, T.u.values, w, [T.kind + "|" + T.c], T.pid.values)
    out["no_pitcher_fe"] = dict(beta=b0, se=se0)
    for name, m in (("FB", T.kind == "FB"), ("OS", T.kind != "FB"), ("two_strikes", T.c.str.endswith("2")),
                    ("0_1_strikes", ~T.c.str.endswith("2"))):
        Tm = T[m]
        bb, ss = fe_ols((Tm.wh / Tm.sw).values, Tm.u.values, Tm.sw.values.astype(float),
                        [Tm.pid + "|" + Tm.kind, Tm.kind + "|" + Tm.c], Tm.pid.values)
        out[name] = dict(beta=bb, se=ss, swings=int(Tm.sw.sum()))
    for mp in (5, 25):
        Tm = t[t.n_pc >= mp]
        bb, ss = fe_ols((Tm.wh / Tm.sw).values, Tm.u.values, Tm.sw.values.astype(float),
                        [Tm.pid + "|" + Tm.kind, Tm.kind + "|" + Tm.c], Tm.pid.values)
        out[f"min_pc_{mp}"] = dict(beta=bb, se=ss, swings=int(Tm.sw.sum()))
    H = hh[(hh.m >= min_pc / 2) & hh.m_other.fillna(0).ge(min_pc / 2)]
    # pitcher x kind x half effects: compare counts within a half (a pitcher x kind effect pooled over halves
    # makes own-half and other-half shares mechanically negatively related)
    gi = [H.pid + "|" + H.kind + "|" + H.h.astype(str), H.kind + "|" + H.c]
    yh = (H.wh / H.sw).values
    wh = H.sw.values.astype(float)
    bi, sei, fs, fst = fe_iv(yh, H.u_loo.values, H.u_other.values, wh, gi, H.pid.values)
    br, ser = fe_ols(yh, H.u_other.values, wh, gi, H.pid.values)
    out["split_half_iv"] = dict(beta=bi, se=sei, first_stage=fs, first_stage_t=fst, swings=int(wh.sum()))
    out["split_half_reduced_form"] = dict(beta=br, se=ser)
    return out


def run(path=OUT):
    res = {"note": "report only; beta = change in whiff per swing per +1.0 usage share (so +0.10 share -> beta/10)"}
    sets = [("hs_high_school", lambda: load_hs("high_school")), ("hs_travel_ball", lambda: load_hs("travel_ball")),
            ("statcast_A", lambda: load_sc("A", range(2021, 2026))),
            ("statcast_AAA", lambda: load_sc("AAA", range(2023, 2026))),
            ("statcast_MLB_control", lambda: load_sc("MLB", range(2023, 2026)))]
    only = set(sys.argv[3:])
    for name, f in sets:
        if only and name not in only:
            continue
        d = f()
        t, hh = cells(d)
        res[name] = estimate(t, hh)
        res[name]["pitches"] = len(d)
        print(name, json.dumps(res[name]["main"]), "iv", json.dumps(res[name]["split_half_iv"]), flush=True)
        del d, t, hh
    with open(path, "w") as fh:
        json.dump(res, fh, indent=1)


if __name__ == "__main__":
    if sys.argv[1] == "run":
        run(sys.argv[2] if len(sys.argv) > 2 else OUT)
