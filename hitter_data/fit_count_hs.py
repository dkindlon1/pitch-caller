"""v1.3 count layer, run values and 2025 scores for the HS / travel level (one model, Drew Nov 21; travel keeps HS's
numbers; no bat type). PROVISIONAL: see docs/FITS_COUNT_v13.md section 12. 2026 is never loaded.

Data: C:/dev/pitchiq-data/hs/hs.sqlite3 (Perfect Game WWBA / Showdown, read-only; docs/HS_ARCHIVE_v13.md), games with a
full pitch log (hs_game_qc.full_log = 1), seasons 2022-2025. The season build mirrors the college harness: the same
pitch-event replay (harness.pitch_events on the PA's letter string + the in-play pitch), the same filters (IBB, CI,
BINT, bunts, count mismatches, U / I letters), the same contexts (count, outs, bases at the PA start, side, late =
inning >= 5 of 7 and |margin| <= 2), the same arrays, so the harness scores it unchanged. Per pitch it also keeps the
pitch class, kind and velocity (absolute, and relative to the pitcher's own season mean for that class).

What it does (python -m hitter_data.fit_count_hs):
  1. count layer "hs": variants sep (HS / travel alone), borrow (cells topped up from D3), shared (HS + D3 pooled + an HS
     offset), and the *_noplatoon checks; hyper-parameters tuned on 2025 with the fit on <= 2024;
  2. fit terms tested on 2025 (fit <= 2024, multiplicative per count x term offsets on top of the base candidate):
     HS vs travel, age group, pool / bracket, series; pitch class, pitch kind; velocity relative to the pitcher's own
     mean and absolute, per class; each with the paired 2025 gain and the clustered SE; kept when the gain > 2 SE;
  3. effects by pitch class / kind / velocity bin on swing, whiff per swing, in play per swing (observed - expected
     from the base table, game-bootstrap SE);
  4. run values (count x base-out) vs today's engine RE_BY_LEVEL['hs'] / CV_BY_LEVEL['hs'];
  5. harness scores on 2025: v1.2 at HS settings, v1.2_recal, base_count, base_count_bo, the candidates; platoon on the
     known-hand pitches.
v1.2's pitcher assumption: the harness's frozen calib world has no HS mix, so v1.2 at HS settings is asked about the
D3 frozen mix (labelled "[D3 world]"). This only moves raw v1.2; v1.2_recal (the pass reference) does not depend on
the assumption (HARNESS_v13 section 12)."""
import argparse
import hashlib
import json
import os
import pickle
import re
import sqlite3
import sys
import time
from collections import Counter, defaultdict

import numpy as np

from . import DATA, assert_not_heldout, fit_seasons
from . import fit_count as FC
from . import fit_count_data as FD
from . import fit_runs as FR
from . import harness as H
from .harness_adapters import (BIP_TYPES, CI, PRIMARY_ASSUMPTION, ROOT, Assumption, EmpiricalAdapter, EngineV12Adapter, RecalAdapter,
                               bases_index)

HS_DB = os.path.join(DATA, "hs", "hs.sqlite3")
LEVEL = "hs"
DL = "HS"                        # the harness data level (engine level 'hs' through V12_LEVEL)
SEASONS = (2022, 2023, 2024, 2025)
VALID = 2025
CACHE_VERSION = "hs4"      # hs4 (full data): the season keeps per-pitch vday (today's fastball vs his season norm)
OUT = os.path.join(FD.FITS, "hs")
CLASSES = ("fastball", "breaking", "offspeed", "other", "unknown")
KINDS = ("Fastball", "Curveball", "Slider", "Change-Up", "other")
HSLEV = ("high_school", "travel_ball")
AGES = ("15U", "16U", "17U", "18U", "Open", "Underclass", "Varsity", "Academies", "other")
PHASES = ("pool", "bracket", "unknown")
SERIES = ("Atlanta WWBA", "WWBA World Championship", "High School Showdown", "other")
VREL_EDGES = (-3.0, -1.0, 1.0, 3.0)                    # mph vs his own mean for the class: 5 bins (+ 1 for missing)
VABS_EDGES = {0: (70.0, 75.0, 80.0, 85.0), 1: (60.0, 65.0, 70.0, 75.0), 2: (65.0, 70.0, 75.0, 80.0)}
TERM_ALPHA = 200.0               # pseudo-pitches shrinking each count x term offset to 1
RUNNER_ROWS = {"Stolen Base", "Wild Pitch", "Passed Ball", "Caught Stealing"}
WEAK_RE = re.compile(r"\bto (Pitcher|Catcher)\b")
XBH_R = (2, 3, 4)


def connect(path=HS_DB):
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def _idx(v, names):
    return names.index(v) if v in names else len(names) - 1


def kind_index(pt):
    """0-3 the four named kinds, 4 other / knuckle, -1 blank (missing: no adjustment)."""
    if not pt:
        return -1
    return KINDS.index(pt) if pt in KINDS[:4] else 4


def class_index(pc):
    return CLASSES.index(pc) if pc in CLASSES else 4


# ----------------------------------------------------------------------------------------------------------------------
def hs_games(con, season):
    assert_not_heldout(season)
    rows = con.execute("""SELECT g.game_id, g.level, g.series, g.age_group, g.phase, g.home_team, g.away_team,
                                 g.home_runs, g.away_runs, g.content_hash
                          FROM hs_games g JOIN hs_game_qc q ON q.game_id = g.game_id
                          WHERE g.season = ? AND q.full_log = 1 AND g.parsed IS NOT NULL ORDER BY g.game_id""",
                       (int(season),)).fetchall()
    out = []
    for gid, lev, ser, age, ph, home, away, hr, ar, ch in rows:
        out.append(dict(id=gid, lev=_idx(lev, HSLEV), series=_idx(ser, SERIES), age=_idx(age or "other", AGES),
                        phase=_idx(ph or "unknown", PHASES), home=H.team_key(home), away=H.team_key(away),
                        series_name=ser or "other", hash=ch or ""))
    return out


PA_Q = """SELECT game_id, idx, inning, half, outs_before, bases_before, bat_score_before, fld_score_before, balls, strikes,
                 pitches, result, in_play, bip_type, outs_on_play, runs_rest_inning, bats, throws, text
          FROM hs_pa WHERE game_id IN ({}) ORDER BY game_id, idx"""
PI_Q = """SELECT game_id, pa_idx, seq, letter, outcome, pitch_type, pitch_class, velo, pitcher_id, count_ok
          FROM hs_pitch WHERE game_id IN ({}) ORDER BY game_id, pa_idx, pitch_no, seq"""


def build_hs_season(con, season, keep_extra=False):
    """-> a harness Season for HS / travel (S.level = 'HS'), plus per-pitch cls / kind / velo / vrel and per-game lev /
    age / phase / series arrays. keep_extra (hs_hanger_cv task B; not cached by load_season): also keep per pitch the
    pitcher (pid, a hash of pitcher_id; 0 = unknown) and, on the in-play pitch of a scored ball in play, its harness
    result (br, H.bip_result; -1 on every other pitch)."""
    assert_not_heldout(season)
    games = hs_games(con, season)
    gidx = {g["id"]: i for i, g in enumerate(games)}
    ids = [g["id"] for g in games]
    pas, pitches = [], defaultdict(list)
    for i in range(0, len(ids), 400):
        part = ids[i:i + 400]
        pas.extend(con.execute(PA_Q.format(",".join("?" * len(part))), part).fetchall())
        for r in con.execute(PI_Q.format(",".join("?" * len(part))), part):
            pitches[(r[0], r[1])].append(r)
    S = H.Season()
    S.level, S.season = DL, int(season)
    S.games = ids
    S.platform = [g["series_name"] for g in games]
    teams = sorted({g["home"] for g in games} | {g["away"] for g in games})
    tix = {t: i for i, t in enumerate(teams)}
    S.home = np.array([tix[g["home"]] for g in games], dtype=np.int32)
    S.away = np.array([tix[g["away"]] for g in games], dtype=np.int32)
    S.n_teams = len(teams)
    for k in ("lev", "age", "phase", "series"):
        setattr(S, "g_" + k, np.array([g[k] for g in games], dtype=np.int8))
    reasons = Counter()
    last = {}
    for r in pas:
        last[(r[0], r[2], r[3])] = (r[4] or 0) + (r[14] or 0)
    short = {k for k, o in last.items() if o < 3}
    pa, pit = defaultdict(list), defaultdict(list)
    hand = np.zeros(4)
    weak, hard, bipn = np.zeros(12), np.zeros(12), np.zeros(12)
    lettered = 0
    for (gid, idx, inn, half, o, bb, bs, fs, balls, strikes, letters, res, ip, bt, oo, rr, bats, throws, text) in pas:
        g = gidx[gid]
        if res is None:
            reasons["no_result"] += 1
            continue
        bb = bb or ""
        if len(bb) != 3 or o is None or not (0 <= o <= 2):
            reasons["bad_state"] += 1
            continue
        bi = bases_index(bb[0] == "1", bb[1] == "1", bb[2] == "1")
        sd = H.side_of(bats, throws)
        margin = (bs or 0) - (fs or 0)
        lt = int((inn or 0) >= 5 and abs(margin) <= 2)
        ip = bool(ip)
        truncated = (gid, inn, half) in short
        if res not in H.EXCLUDED_RESULTS:
            hb, ht = bats in ("R", "L", "S", "B"), throws in ("R", "L")
            hand[0 if hb and ht else 1 if hb else 2 if ht else 3] += 1
        if rr is not None and not truncated:
            for k_, v in (("g", g), ("o", o), ("bi", bi), ("y", rr)):
                pa["r_" + k_].append(v)
        elif truncated:
            reasons["runs_rows_short_half"] += 1
        bunt = bt == "bunt" or res in H.BUNT_RESULTS
        if bunt:
            reasons["bunt_pa"] += 1
            continue
        c5 = H.pa_class(res, ip)
        if c5 >= 0:
            for k_, v in (("g", g), ("o", o), ("bi", bi), ("sd", sd), ("lt", lt), ("y", c5)):
                pa["p_" + k_].append(v)
        br = -1
        if ip and (balls, strikes) in CI:
            t = BIP_TYPES.index(bt) if bt in BIP_TYPES else -1
            br = H.bip_result(res)
            ci0 = CI[(balls, strikes)]
            for k_, v in (("g", g), ("ci", ci0), ("o", o), ("bi", bi), ("sd", sd), ("lt", lt), ("t", t), ("r", br)):
                pa["b_" + k_].append(v)
            bipn[ci0] += 1
            hard[ci0] += bt == "line" or br in XBH_R
            weak[ci0] += bt == "pop" or (bt == "ground" and bool(WEAK_RE.search(text or "")))
        rows = pitches.get((gid, idx), [])
        if any(r[9] == 0 for r in rows):
            reasons["pitches:count_not_ok"] += 1
            continue
        ev, why = H.pitch_events(letters or "", balls, strikes, res, ip, 1)
        reasons["pitches:" + why] += 1
        if ev is None:
            continue
        if len(rows) != len(ev):
            reasons["pitches:row_mismatch"] += 1
            continue
        lettered += 1
        seqs = [r[2] for r in rows]
        mid = any(b - a != 1 for a, b in zip(seqs, seqs[1:])) or any(r[4] in RUNNER_ROWS for r in rows)
        for (ci, e6), r in zip(ev, rows):
            for k_, v in (("g", g), ("ci", ci), ("o", o), ("bi", bi), ("sd", sd), ("lt", lt), ("y", e6)):
                pit[k_].append(v)
            pit["run_ok"].append(int(not mid and rr is not None and not truncated))
            pit["rr"].append(rr if rr is not None else 0)
            pit["cls"].append(class_index(r[6]))
            pit["kind"].append(kind_index(r[5]))
            pit["velo"].append(r[7] if r[7] is not None else np.nan)
            pit["pid"].append(hash(r[8]) if r[8] else 0)
            if keep_extra:
                pit["br"].append(br if e6 == 5 else -1)
    small = {"g": np.int32, "rr": np.int16, "r_y": np.int16, "velo": np.float32, "pid": np.int64}
    S.pa = {k: np.asarray(v, dtype=np.int32 if k.endswith("_g") else small.get(k, np.int16)) for k, v in pa.items()}
    S.pit = {k: np.asarray(v, dtype=small.get(k, np.int8)) for k, v in pit.items()}
    S.pit["vrel"] = relative_velo(S.pit)
    S.pit["vday"] = day_velo(S.pit)
    if not keep_extra:
        del S.pit["pid"]
    S.reasons, S.lettered_pas, S.n_pa_rows, S.n_games = reasons, lettered, len(pas), len(games)
    S.extra = dict(hand=hand, weak=weak, hard=hard, bipn=bipn)
    return S


def relative_velo(p, min_n=10):
    """velocity minus the pitcher's own season mean for that class (NaN with fewer than min_n readings)."""
    v = p["velo"].astype(float)
    out = np.full(len(v), np.nan)
    if not len(v):
        return out.astype(np.float32)
    key = p["pid"].astype(np.int64) * 8 + p["cls"].astype(np.int64)
    ok = ~np.isnan(v) & (p["pid"] != 0)
    u, inv = np.unique(key[ok], return_inverse=True)
    s = np.bincount(inv, weights=v[ok], minlength=len(u))
    n = np.bincount(inv, minlength=len(u))
    m = np.where(n >= min_n, s / np.maximum(n, 1), np.nan)
    out[ok] = v[ok] - m[inv]
    return out.astype(np.float32)


def day_velo(p, min_prior=3, min_season=10):
    """Today's fastball vs his own norm (Nov 22 candidate term): for each pitch, the mean speed of the pitcher's EARLIER
    fastballs in this game (at least min_prior readings, so nothing after the pitch is used) minus his season fastball
    mean (at least min_season readings). Applies to every pitch he throws (any class). NaN when either is missing."""
    v = p["velo"].astype(float)
    n_p = len(v)
    out = np.full(n_p, np.nan)
    if not n_p:
        return out.astype(np.float32)
    pid = p["pid"].astype(np.int64)
    g = p["g"].astype(np.int64)
    fb = (p["cls"].astype(np.int64) == 0) & ~np.isnan(v) & (pid != 0)
    u, inv = np.unique(pid[fb], return_inverse=True)
    s_sum = np.bincount(inv, weights=v[fb], minlength=len(u))
    s_n = np.bincount(inv, minlength=len(u))
    season_mean = dict(zip(u.tolist(), np.where(s_n >= min_season, s_sum / np.maximum(s_n, 1), np.nan).tolist()))
    run = {}
    for i in range(n_p):                       # pitches are in game order within each game
        if pid[i] == 0:
            continue
        key = (g[i], pid[i])
        tot, cnt = run.get(key, (0.0, 0))
        m = season_mean.get(int(pid[i]), np.nan)
        if cnt >= min_prior and not np.isnan(m):
            out[i] = tot / cnt - m
        if fb[i]:
            run[key] = (tot + v[i], cnt + 1)
    return out.astype(np.float32)


def season_key(con, season):
    gs = hs_games(con, season)
    return hashlib.sha1(("|".join(g["id"] + g["hash"] for g in gs) + CACHE_VERSION).encode()).hexdigest()[:16]


def load_season(con, season, cache=True):
    assert_not_heldout(season)
    key = season_key(con, season)
    path = os.path.join(FD.CACHE, f"hs_season_{int(season)}_{key}.pkl")
    if cache and os.path.exists(path):
        with open(path, "rb") as f:
            return pickle.load(f)
    S = build_hs_season(con, season)
    if cache:
        os.makedirs(FD.CACHE, exist_ok=True)
        for old in os.listdir(FD.CACHE):
            if old.startswith(f"hs_season_{int(season)}_"):
                os.remove(os.path.join(FD.CACHE, old))
        with open(path, "wb") as f:
            pickle.dump(S, f)
    return S


def counts_from_hs_season(S):
    """fit_count_data-style sufficient counts from an HS Season."""
    c = FD.empty()
    p, a = S.pit, S.pa
    if len(p.get("y", [])):
        np.add.at(c["ev6"], (p["ci"], p["o"], p["bi"], p["sd"], p["lt"], p["y"]), 1)
        m = p["run_ok"] == 1
        idx = (p["ci"][m], p["o"][m], p["bi"][m])
        rr = p["rr"][m].astype(float)
        np.add.at(c["cv_sum"], idx, rr)
        np.add.at(c["cv_n"], idx, 1)
        np.add.at(c["cv_sq"], idx, rr * rr)
    if len(a.get("b_g", [])):
        t = np.where(a["b_t"] >= 0, a["b_t"], 4)
        np.add.at(c["bip"], (a["b_ci"], a["b_o"], a["b_bi"], a["b_sd"], a["b_lt"], t, a["b_r"]), 1)
    if len(a.get("r_g", [])):
        y = a["r_y"].astype(float)
        np.add.at(c["runs_sum"], (a["r_o"], a["r_bi"]), y)
        np.add.at(c["runs_n"], (a["r_o"], a["r_bi"]), 1)
        np.add.at(c["pa_sq"], (a["r_o"], a["r_bi"]), y * y)
    for k in ("hand", "weak", "hard", "bipn"):
        c[k] = np.asarray(S.extra[k], float)
    return c


# ----------------------------------------------------------------------------------------------------------------------
# fit terms on top of a base table
def base_p6(t, S):
    p = S.pit
    return t.P6[p["ci"], p["o"], p["bi"], p["sd"], p["lt"]]


def term_index(S, term):
    """-> (index per pitch, number of levels). -1 = information missing: the term leaves that pitch alone. Blank pitch
    types and missing velocities are -1 on purpose: they are concentrated on the in-play pitch (a scorecard artefact:
    in play .26-.28 vs .16), so a "missing" level would learn the outcome, and the engine always knows the pitch."""
    p = S.pit
    g = p["g"].astype(np.int64)
    if term in ("hs_vs_travel", "age", "phase", "series"):
        arr = {"hs_vs_travel": S.g_lev, "age": S.g_age, "phase": S.g_phase, "series": S.g_series}[term]
        n = {"hs_vs_travel": len(HSLEV), "age": len(AGES), "phase": len(PHASES), "series": len(SERIES)}[term]
        return arr[g].astype(np.int64), n
    cls = p["cls"].astype(np.int64)
    if term == "class":
        return np.where(cls == 4, -1, cls), len(CLASSES) - 1
    if term == "kind":
        return p["kind"].astype(np.int64), len(KINDS)
    v = p["velo"].astype(float)
    bad = np.isnan(v) | (cls == 4)
    if term == "velo_rel":
        b = np.digitize(np.nan_to_num(p["vrel"], nan=0.0), VREL_EDGES)
        b = np.where(np.isnan(p["vrel"]), 5, b)               # 5 = velocity read, but < 10 readings for his mean
        return np.where(bad, -1, cls * 6 + b), 4 * 6
    if term == "velo_day":                    # every pitch of a pitcher whose fastball is up / down today; not class-gated
        vd = p["vday"].astype(float)
        b = np.digitize(np.nan_to_num(vd, nan=0.0), VREL_EDGES)
        return np.where(np.isnan(vd), -1, b), 5
    if term == "velo_abs":
        b = np.full(len(v), 0)
        for c, edges in VABS_EDGES.items():
            m = (cls == c) & ~np.isnan(v)
            b[m] = np.digitize(v[m], edges)
        b = np.where(cls == 3, 5, b)                          # other / knuckle: one bin
        return np.where(bad, -1, cls * 6 + b), 4 * 6
    raise ValueError(term)


def fit_term(P, S_list, term, alpha=TERM_ALPHA):
    """Offsets r[count, level, 6] from the fit seasons: (O + alpha q) / (E + alpha q), q = E / n."""
    nT = None
    O = E = None
    for Pf, S in zip(P, S_list):
        ti, nT = term_index(S, term)
        if O is None:
            O, E = np.zeros((12, nT, 6)), np.zeros((12, nT, 6))
        ok = ti >= 0
        ci = S.pit["ci"].astype(np.int64)
        np.add.at(O, (ci[ok], ti[ok], S.pit["y"].astype(np.int64)[ok]), 1)
        np.add.at(E, (ci[ok], ti[ok]), Pf[ok])
    n = E.sum(axis=-1, keepdims=True)
    q = E / np.maximum(n, 1e-12)
    r = (O + alpha * q) / np.maximum(E + alpha * q, 1e-12)
    return np.where(n > 0, r, 1.0)                         # a count x level never seen in the fit seasons: no change


def apply_term(Pv, S, term, r):
    ti, _ = term_index(S, term)
    f = r[S.pit["ci"].astype(np.int64), np.maximum(ti, 0)]
    out = Pv * np.where((ti >= 0)[:, None], f, 1.0)
    return out / out.sum(axis=-1, keepdims=True)


def loss5(P, y):
    y5 = np.where(y <= 1, 0, y - 1).astype(np.int64)
    E = np.concatenate([P[:, :1] + P[:, 1:2], P[:, 2:]], axis=1)
    return -np.log(np.clip(E[np.arange(len(y5)), y5], 1e-12, 1))


def paired(S, l_new, l_base, Ws):
    g = S.pit["g"].astype(np.int64)
    a = H.per_game(l_new - l_base, g, S.n_games)
    m, se = H.boot_all(a[0], a[1], Ws)
    return m, max(se.values())


TERMS = ("hs_vs_travel", "age", "phase", "series", "class", "kind", "velo_rel", "velo_abs")
STACKS = {"kind+velo_rel+velo_abs": ("kind", "velo_rel", "velo_abs"),
          "format (hs_vs_travel+age+phase+series)": ("hs_vs_travel", "age", "phase", "series"),
          "all": ("hs_vs_travel", "age", "phase", "series", "kind", "velo_rel", "velo_abs")}


def test_terms(t, fit_S, S25, B=1000, log=print):
    Ws = H.boot_weights(S25, B, 1)
    Pf = [base_p6(t, S) for S in fit_S]
    Pv = base_p6(t, S25)
    y = S25.pit["y"]
    lb = loss5(Pv, y)
    res = {"base_pitch_5way": float(lb.mean()), "terms": {}, "stacks": {}}
    for term in TERMS:
        r = fit_term(Pf, fit_S, term)
        m, se = paired(S25, loss5(apply_term(Pv, S25, term, r), y), lb, Ws)
        res["terms"][term] = dict(gain=-m, se=se, kept=bool(-m > 2 * se), clears_min_effect=bool(-m >= H.MIN_EFFECT))
        log(f"   term {term:14s} 2025 gain {-m:+.5f} (SE {se:.5f}) {'KEPT' if -m > 2 * se else 'dropped'}")
    for nm, terms in STACKS.items():
        Pf_s, Pv_s = [x.copy() for x in Pf], Pv.copy()
        for term in terms:
            r = fit_term(Pf_s, fit_S, term)
            Pf_s = [apply_term(P, S, term, r) for P, S in zip(Pf_s, fit_S)]
            Pv_s = apply_term(Pv_s, S25, term, r)
        m, se = paired(S25, loss5(Pv_s, y), lb, Ws)
        res["stacks"][nm] = dict(gain=-m, se=se, kept=bool(-m > 2 * se), clears_min_effect=bool(-m >= H.MIN_EFFECT))
        log(f"   stack {nm:38s} 2025 gain {-m:+.5f} (SE {se:.5f})")
    return res


def effects(t, S_list, term, B=200, seed=3):
    """Observed - expected (base table) swing, whiff per swing, in play per swing by term level, pooled over S_list,
    with a game-bootstrap SE. -> {level: dict}."""
    rows = []
    goff = 0
    for S in S_list:
        P = base_p6(t, S)
        ti, nT = term_index(S, term)
        y = S.pit["y"].astype(np.int64)
        rows.append((ti, y, P, S.pit["g"].astype(np.int64) + goff))
        goff += S.n_games
    ti = np.concatenate([r[0] for r in rows]); y = np.concatenate([r[1] for r in rows])
    P = np.concatenate([r[2] for r in rows]); g = np.concatenate([r[3] for r in rows])
    G = goff
    sw_o = (y >= 3).astype(float); sw_e = P[:, 3:].sum(1)
    wh_o = (y == 3).astype(float); wh_e = P[:, 3]
    ip_o = (y == 5).astype(float); ip_e = P[:, 5]
    rng = np.random.default_rng(seed)
    W = rng.multinomial(G, np.full(G, 1.0 / G), size=B).astype(float)
    out = {}
    for lv in range(nT):
        m = ti == lv
        if m.sum() < 200:
            continue
        sums = {}
        for nm, arr in (("n", np.ones(m.sum())), ("sw_o", sw_o[m]), ("sw_e", sw_e[m]), ("wh_o", wh_o[m]),
                        ("wh_e", wh_e[m]), ("ip_o", ip_o[m]), ("ip_e", ip_e[m])):
            sums[nm] = np.bincount(g[m], weights=arr, minlength=G)

        def stat(wt):
            s = {k: (wt * v).sum(-1) for k, v in sums.items()}
            return np.array([(s["sw_o"] - s["sw_e"]) / s["n"],
                             s["wh_o"] / s["sw_o"] - s["wh_e"] / s["sw_e"],
                             s["ip_o"] / s["sw_o"] - s["ip_e"] / s["sw_e"],
                             s["sw_o"] / s["n"], s["wh_o"] / s["sw_o"], s["ip_o"] / s["sw_o"]])
        pt = stat(np.ones(G))
        bs = np.stack([stat(W[b]) for b in range(B)])
        se = bs.std(axis=0, ddof=1)
        out[str(lv)] = dict(n=int(m.sum()), swing=round(float(pt[3]), 4), whiff_per_swing=round(float(pt[4]), 4),
                            inplay_per_swing=round(float(pt[5]), 4),
                            d_swing=(round(float(pt[0]), 4), round(float(se[0]), 4)),
                            d_whiff_per_swing=(round(float(pt[1]), 4), round(float(se[1]), 4)),
                            d_inplay_per_swing=(round(float(pt[2]), 4), round(float(se[2]), 4)))
    return out


def term_labels(term):
    if term == "class":
        return list(CLASSES[:4])
    if term == "kind":
        return list(KINDS)
    if term == "velo_rel":
        b = ["< -3", "-3..-1", "-1..+1", "+1..+3", "> +3", "few readings"]
        return [f"{c} {x}" for c in CLASSES[:4] for x in b]
    if term == "velo_abs":
        out = []
        for c in range(4):
            e = VABS_EDGES.get(c)
            b = ([f"<{e[0]:.0f}"] + [f"{e[i]:.0f}-{e[i + 1]:.0f}" for i in range(3)] + [f">={e[3]:.0f}"]) if e else ["all"] * 5
            out += [f"{CLASSES[c]} {x}" for x in b + ["all" if c == 3 else "-"]]
        return out
    return {"hs_vs_travel": list(HSLEV), "age": list(AGES), "phase": list(PHASES), "series": list(SERIES)}[term]


# ----------------------------------------------------------------------------------------------------------------------
class AliasAssumption(Assumption):
    """The frozen calib world has no HS mix: v1.2 at HS settings is asked about the D3 mix."""

    def mix(self, level, side, b, k):
        return super().mix("D3" if level == DL else level, side, b, k)

    def same_share(self, level, b, k):
        return super().same_share("D3" if level == DL else level, b, k)


class HSVeloAssumption(AliasAssumption):
    """v1.3 (Drew's Nov 23 ruling 8: HS is calibrated with the pitch kind x velocity table on). The D3 mix as AliasAssumption,
    but the frozen world's two arsenals throw at real HS / travel speeds: they are the default starter (FB / SL / CH) and
    reliever (FB / CB / CH) templates, which are exactly the templates of simulate.hs_data_staff (addendum ruling 4), so
    arsenal 0 is played at that staff's speed quantiles 1/12, 5/12, 9/12 and arsenal 1 at 3/12, 7/12, 11/12
    (simulate.HS_STAFF_VELO), each a third of its arsenal's weight. The count layer is then calibrated against the same six
    pitchers calib.py and the sims use. Levels other than HS: unchanged."""

    def __init__(self, name=PRIMARY_ASSUMPTION):
        super().__init__(name)
        if ROOT not in sys.path:
            sys.path.insert(0, ROOT)
        from simulate import HS_STAFF_VELO
        self.vmap = {0: (0, 2, 4), 1: (1, 3, 5)}
        for a, qs in self.vmap.items():
            for i in qs:
                self.arsenals[f"{a}v{i}"] = [dict(sp, velo=HS_STAFF_VELO[sp["kind"]][i]) for sp in self.arsenals[a]]

    def mix(self, level, side, b, k):
        out = super().mix(level, side, b, k)
        if level != DL:
            return out
        res = []
        for a, j, q, z, w in out:
            if a in self.vmap:
                res += [(f"{a}v{i}", j, q, z, w / len(self.vmap[a])) for i in self.vmap[a]]
            else:
                res.append((a, j, q, z, w))
        return res


def v12_hs():
    ad = EngineV12Adapter("college_d1", assumption=AliasAssumption(PRIMARY_ASSUMPTION))
    ad.name = "v1.2[hs, D3 world]"
    return ad


def score(fit_S, S25, cand_paths, B=1000, log=print):
    from .score_candidates import CandidateAdapter, known_side_view
    fs = [S.season for S in fit_S]
    fc = H.FitCounts()
    for S in fit_S:
        fc.add_scaled(H.FitCounts.from_season(S), H.recency_weight(S.season, VALID))
    fit = {DL: fc}
    v12 = v12_hs()
    adapters = [v12, RecalAdapter(v12, fit, fs)] + [EmpiricalAdapter(k, fit, fs) for k in ("count", "count_bo")]
    cands = {k: CandidateAdapter(p) for k, p in cand_paths.items() if os.path.exists(p)}
    adapters += list(cands.values())
    refs = [v12.name + "_recal", "base_count"] + (["v13_sep"] if "sep" in cands else [])
    res = H.score_season(S25, adapters, refs, B=B, seed=1)
    log(H.fmt_report(DL, VALID, S25, {k: v for k, v in res.items() if k in ("pitch_5way", "bip_result", "pa_5way")}, refs))
    known = None
    if "borrow" in cands or "sep" in cands:
        Sk = known_side_view(S25)
        names = [n for n in ("base_count", "v13_sep", "v13_sep_noplatoon", "v13_borrow", "v13_borrow_noplatoon")
                 if n in [a.name for a in adapters]]
        ka = [a for a in adapters if a.name in names]
        kr = [n for n in ("v13_sep_noplatoon", "v13_borrow_noplatoon") if n in names] or ["base_count"]
        known = H.score_season(Sk, ka, kr, B=B, seed=1)
        known = {"pitch_5way": known["pitch_5way"], "n_known": int((S25.pit["sd"] < 2).sum()), "n_all": int(len(S25.pit["sd"]))}
    return dict(level=LEVEL, season=VALID, n_games=S25.n_games, n_teams=S25.n_teams, n_pitches=int(len(S25.pit["y"])),
                fit_seasons=fs, refs=refs, scores=res, known_side=known,
                candidate_fit_seasons={k: list(a.fit_seasons) for k, a in cands.items()})


# ----------------------------------------------------------------------------------------------------------------------
def run(con=None, B=1000, write=True, log=print, cache=True):
    fit_seasons(SEASONS)
    t0 = time.time()
    con = con or connect()
    Ss = {s: load_season(con, s, cache=cache) for s in SEASONS}
    for s, S in Ss.items():
        log(f"  HS {s}: {S.n_games} full-log games, {len(S.pit['y']):,} pitch events, {S.lettered_pas:,} PAs")
    cc = H.connect()
    data = {LEVEL: {s: counts_from_hs_season(S) for s, S in Ss.items()},
            "D3": {s: FD.season_counts(cc, "D3", s) for s in FD.seasons_with_games(cc, "D3", 2000, VALID)}}
    FC.NEIGHBOURS.setdefault(LEVEL, ("D3",))
    summary = {"provisional": FD.PROVISIONAL, "heldout_touched": False, "level": LEVEL, "valid": VALID, "variants": {}}
    paths = {}
    for var in ("sep", "borrow", "shared"):
        prm, trace, (lp, lb) = FC.tune(data, LEVEL, var, VALID, 2, log)
        Wv, wts = FC.weighted_all(data, VALID, prm["half_life"])
        f = FC.fit_level(Wv, LEVEL, prm, var)
        js = FC.candidate_json(LEVEL, var, prm, wts[LEVEL], f, Wv[LEVEL], VALID)
        Ws_, wts_s = FC.weighted_all(data, VALID + 1, prm["half_life"])
        jss = FC.candidate_json(LEVEL, var, prm, wts_s[LEVEL], FC.fit_level(Ws_, LEVEL, prm, var), Ws_[LEVEL], VALID + 1)
        hl = {("inf" if v >= FC.INF else v): round(min(x[2] for x in trace if x[0] == "half_life" and x[1] == v), 5)
              for v in FC.GRID["half_life"]}
        summary["variants"][var] = dict(params=prm, pitch_5way=lp, bip_result=lb, fit_seasons=wts[LEVEL],
                                        diagnostics=js["diagnostics"], half_life_curve=hl)
        if write:
            FC.write_json(FC.out_path(LEVEL, var, VALID - 1), js)
            FC.write_json(FC.out_path(LEVEL, var, VALID), jss)
            paths[var] = FC.out_path(LEVEL, var, VALID - 1)
            if var in ("sep", "borrow"):
                p0 = dict(prm, A_sd=FC.INF)
                j0 = FC.candidate_json(LEVEL, var + "_noplatoon", p0, wts[LEVEL], FC.fit_level(Wv, LEVEL, p0, var), Wv[LEVEL], VALID)
                FC.write_json(FC.out_path(LEVEL, var + "_noplatoon", VALID - 1), j0)
                paths[var + "_noplatoon"] = FC.out_path(LEVEL, var + "_noplatoon", VALID - 1)
    fit_S = [Ss[s] for s in SEASONS if s < VALID]
    S25 = Ss[VALID]
    # fit terms on top of the HS-alone candidate (fit <= 2024)
    with open(FC.out_path(LEVEL, "sep", VALID - 1), encoding="utf-8") as fh:
        t = FC.tables_from_json(json.load(fh))
    log("  fit terms (on v13_sep, fit <= 2024, scored on 2025):")
    summary["terms"] = test_terms(t, fit_S, S25, B=B, log=log)
    summary["effects"] = {term: {"labels": term_labels(term), "by_level": effects(t, [Ss[s] for s in SEASONS], term)}
                          for term in ("class", "kind", "velo_rel", "velo_abs", "hs_vs_travel", "age", "phase")}
    summary["hand"] = {str(s): (S.extra["hand"] / max(S.extra["hand"].sum(), 1)).round(4).tolist() for s, S in Ss.items()}
    # run values
    e = FR._import_engine()
    prm = FR.tune(data, LEVEL, VALID)
    Wv, wts = FC.weighted_all(data, VALID, prm["half_life"])
    fr = FR.fit_level(Wv, LEVEL, prm)
    Ws_, wts_s = FC.weighted_all(data, VALID + 1, prm["half_life"])
    frs = FR.fit_level(Ws_, LEVEL, prm)
    RE0, CV0 = FR.today_tables(e, "hs")
    fits = {"today_hs": (RE0, CV0, None), "fit_additive": (fr["RE"], fr["CV"], None), "fit_count_bo": (fr["RE"], fr["CV"], fr["RV"])}
    cmp_ = FR.compare_season(S25, fits, B=B)
    summary["run_values"] = dict(params=prm, borrowed_share=fr["borrowed_share"], compare=cmp_)
    log(f"  run values: tuned {FC.fmt_prm(prm)}; borrowed share from D3 {fr['borrowed_share']:.3f}")
    for nm in fits:
        log(f"   {nm:14s} PA-start MSE {cmp_['pa_start'][nm][0]:.4f}  pitch-state MSE {cmp_['pitch_state'][nm][0]:.4f}")
    for k, d in cmp_["diff"].items():
        log(f"   {k:30s} PA-start {d['pa_start'][0]:+.5f} (SE {max(d['pa_start'][1].values()):.5f})  "
            f"pitch-state {d['pitch_state'][0]:+.5f} (SE {max(d['pitch_state'][1].values()):.5f})")
    if write:
        os.makedirs(FR.OUT, exist_ok=True)
        for obj, thru in ((FR.table_json(LEVEL, prm, wts[LEVEL], fr, VALID - 1), VALID - 1),
                          (FR.table_json(LEVEL, prm, wts_s[LEVEL], frs, VALID), VALID)):
            obj["thin"] = False
            with open(os.path.join(FR.OUT, f"{LEVEL}_thru{thru}.json"), "w", encoding="utf-8") as fh:
                json.dump(obj, fh, indent=1)
    # harness scores
    log("  harness scores on 2025:")
    summary["scores"] = score(fit_S, S25, paths, B=B, log=log)
    summary["seconds"] = round(time.time() - t0, 1)
    if write:
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, "hs_summary.json"), "w", encoding="utf-8") as fh:
            json.dump(summary, fh, indent=1, default=lambda o: o.item() if isinstance(o, np.generic) else
                      (o.tolist() if isinstance(o, np.ndarray) else str(o)))
        write_md(summary, os.path.join(OUT, "hs_report.md"))
    log(f"wrote {OUT} ({summary['seconds']} s). 2026 was not loaded.")
    return summary


# ----------------------------------------------------------------------------------------------------------------------
# v1.3 core (Drew's ruling 4): the pitch kind x velocity terms as an engine table (count_<v>.json levels.hs.pitch_velo)
PITCH_TABLE_OUT = os.path.join(OUT, "pitch_velo_thru2025.json")
PV_OUTCOMES = ("ball", "hbp", "cstrike", "whiff", "foul", "inplay")     # the harness's 6 pitch events, in fit order
PV_TERMS = ("kind", "velo_rel", "velo_abs")                             # the stack that gained +0.0104 on 2025 (12.2)
ENGINE_KIND = {"FB": "Fastball", "SI": "Fastball", "FC": "Fastball", "SL": "Slider", "CB": "Curveball", "CH": "Change-Up"}
ENGINE_CLASS = {"FB": "fastball", "SI": "fastball", "FC": "fastball", "SL": "breaking", "CB": "breaking", "CH": "offspeed"}


def pitch_table(Ss, thru=VALID, alpha=TERM_ALPHA):
    """The kind + relative-velocity + absolute-velocity terms exactly as test_terms' stack "kind+velo_rel+velo_abs" fits
    them (sequential, each a count x level x 6 multiplier shrunk to 1 with alpha pseudo-pitches, on top of the HS-alone
    count table), refit on every season through `thru` on top of hs_sep_thru{thru} (the candidate the engine's count layer
    comes from). Returns the engine table dict (count_<v>.json levels.hs.pitch_velo)."""
    seasons = fit_seasons([x for x in SEASONS if x <= thru])
    with open(FC.out_path(LEVEL, "sep", thru), encoding="utf-8") as fh:
        t = FC.tables_from_json(json.load(fh))
    S_list = [Ss[x] for x in seasons]
    r = _fit_pv_stack([base_p6(t, S) for S in S_list], S_list, alpha)
    about = ("HS / travel pitch kind x velocity (Drew's ruling 4), exported by hitter_data.fit_count_hs.pitch_table from the "
             "fit that gained +0.0104 nats per pitch on 2025 (FITS_COUNT_v13 12.2, stack kind + velo_rel + velo_abs), refit "
             f"on {seasons[0]}-{seasons[-1]} on top of hs_sep_thru{thru}. ")
    return _pv_dict(r, seasons, alpha, about)


def _fit_pv_stack(Pf, S_list, alpha):
    r = {}
    for term in PV_TERMS:
        r[term] = fit_term(Pf, S_list, term, alpha=alpha)
        Pf = [apply_term(P, S, term, r[term]) for P, S in zip(Pf, S_list)]
    return r


def pitch_table_engine_base(Ss, base_fn, thru=VALID, alpha=TERM_ALPHA, base_label="the engine before pitch_velo"):
    """V1.3 audit item 9: the same stack as pitch_table (kind, velo_rel, velo_abs; sequential; shrunk with alpha), but fit as
    residuals on the probabilities the engine itself produces before pitch_velo: base_fn(S) -> [n pitches, 6], the HS
    count row plus the zone table's class and location terms for each pitch's kind, through the harness adapter
    (hitter_data.hs_hanger_cv). pitch_table's base (hs_sep) has no kind or location terms, so on top of the engine's
    class terms it counted pitch class twice. Returns the engine table dict (count_<v>.json levels.hs.pitch_velo)."""
    seasons = fit_seasons([x for x in SEASONS if x <= thru])
    S_list = [Ss[x] for x in seasons]
    r = _fit_pv_stack([base_fn(S) for S in S_list], S_list, alpha)
    about = ("HS / travel pitch kind x velocity (Drew's ruling 4), refit for the V1.3 audit (item 9) by "
             "hitter_data.fit_count_hs.pitch_table_engine_base on " f"{seasons[0]}-{seasons[-1]}" " as residuals on top of "
             + base_label + ", so pitch class is no longer counted twice (docs/REPORT_hs_hanger_cv_2026-11-27.md: 2025 "
             "pitch_5way -0.0124 vs the shipped table, fit <= 2024). ")
    return _pv_dict(r, seasons, alpha, about)


def _pv_dict(r, seasons, alpha, about):
    cls_names = CLASSES[:4]
    out = {
        "about": about + "Each term multiplies the pitch's six event "
                 "probabilities (outcomes) at its count and renormalises: P(y) ~ P_engine(y) x kind[count][kind][y] x "
                 "velo_rel[count][class][bin][y] x velo_abs[count][class][bin][y]. A velocity term is skipped when the pitch has "
                 "no entered speed (the fit's missing-data rule).",
        "seasons": seasons, "alpha": alpha, "outcomes": list(PV_OUTCOMES), "kinds": list(KINDS), "classes": list(cls_names),
        "engine_kind": dict(ENGINE_KIND), "engine_class": dict(ENGINE_CLASS),
        "vrel_edges": list(VREL_EDGES),
        "vabs_edges": {cls_names[c]: list(e) for c, e in VABS_EDGES.items()},
        "kind": {}, "velo_rel": {}, "velo_abs": {},
    }
    for (b, k), ci in CI.items():
        c = f"{b}-{k}"
        out["kind"][c] = {KINDS[i]: [round(float(x), 6) for x in r["kind"][ci, i]] for i in range(len(KINDS))}
        for term in ("velo_rel", "velo_abs"):
            out[term][c] = {cls_names[ci_]: [[round(float(x), 6) for x in r[term][ci, ci_ * 6 + j]] for j in range(6)]
                            for ci_ in range(4)}
    return out


def export_pitch_table(con=None, cache=True, log=print):
    con = con or connect()
    Ss = {x: load_season(con, x, cache=cache) for x in SEASONS}
    tab = pitch_table(Ss)
    os.makedirs(OUT, exist_ok=True)
    with open(PITCH_TABLE_OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(tab, fh, indent=1)
    log(f"wrote {PITCH_TABLE_OUT} (seasons {tab['seasons']}). 2026 was not loaded.")
    return tab


def write_md(s, path):
    from .score_candidates import se as _se
    L = ["# HS / travel count layer, terms, run values, scores (PROVISIONAL)", "", FD.PROVISIONAL, "",
         "2025 = validation (hyper-parameters tuned on it); 2026 not loaded.", ""]
    L += ["| variant | params | pitch_5way 2025 (counts) | borrowed share (cell) |", "|---|---|---|---|"]
    for v, d in s["variants"].items():
        L.append(f"| {v} | {FC.fmt_prm(d['params'])} | {d['pitch_5way']:.5f} | {d['diagnostics'].get('borrowed_share_cell', '')} |")
    L += ["", "Half-life curves: " + "; ".join(f"{v}: {d['half_life_curve']}" for v, d in s["variants"].items()), ""]
    L += ["| fit term | 2025 gain | SE | kept (> 2 SE) | >= 0.002 |", "|---|---|---|---|---|"]
    for k, d in list(s["terms"]["terms"].items()) + list(s["terms"]["stacks"].items()):
        L.append(f"| {k} | {d['gain']:+.5f} | {d['se']:.5f} | {d['kept']} | {d['clears_min_effect']} |")
    for term, e in s["effects"].items():
        L += ["", f"Effects by {term} (2022-2025; observed, and observed - expected from v13_sep, game-bootstrap SE):", "",
              "| level | n | swing | whiff/sw | inplay/sw | d swing | d whiff/sw | d inplay/sw |", "|---|---|---|---|---|---|---|---|"]
        for lv, d in e["by_level"].items():
            L.append(f"| {e['labels'][int(lv)]} | {d['n']:,} | {d['swing']:.3f} | {d['whiff_per_swing']:.3f} | {d['inplay_per_swing']:.3f} | "
                     + " | ".join(f"{d[k][0]:+.3f} ({d[k][1]:.3f})" for k in ("d_swing", "d_whiff_per_swing", "d_inplay_per_swing")) + " |")
    sc = s["scores"]
    pm = sc["scores"]["pitch_5way"]
    L += ["", f"Harness, 2025: {sc['n_games']} games, {sc['n_pitches']:,} pitches", "", "| version | pitch_5way (SE) |", "|---|---|"]
    for nm, v in pm["adapters"].items():
        L.append(f"| {nm} | {v[0]:.4f} ({_se(v):.4f}) |")
    L += ["", "| difference | mean | SE |", "|---|---|---|"]
    for ref, dd in pm["diff"].items():
        for nm, v in dd.items():
            if nm.startswith("v13_"):
                L.append(f"| {nm} - {ref} | {v[0]:+.5f} | {_se(v):.5f} |")
    if sc["known_side"]:
        k = sc["known_side"]
        L.append(f"\nPlatoon (known-hand pitches {k['n_known']:,} / {k['n_all']:,}): " + "; ".join(
            f"{nm} - {ref} {v[0]:+.5f} (SE {_se(v):.5f})" for ref, dd in k["pitch_5way"]["diff"].items() for nm, v in dd.items()))
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write("\n".join(L) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--boot", type=int, default=1000)
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--pitch-table", action="store_true", help="only export the pitch kind x velocity engine table (ruling 4)")
    a = ap.parse_args(argv)
    if a.pitch_table:
        export_pitch_table(cache=not a.no_cache)
        return
    run(B=a.boot, cache=not a.no_cache)


if __name__ == "__main__":
    main()
