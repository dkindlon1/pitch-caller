"""v1.3 scoring harness (plan 5.1, prework Part 4). Scores engine versions on real college games: pitch events by count
(the pre-registered primary metric), ball-in-play type and result, plate-appearance outcomes, and runs in the rest of
the inning (reported only), with bootstrap SEs clustered by game, by home team and by both teams. Design, filters,
assumptions, yardstick risks and the fresh-context review: docs/HARNESS_v13.md.

usage:
  python -m hitter_data.harness --levels D1,D2,D3 --seasons 2006-2025 --boot 1000 --out C:/dev/pitchiq-data/harness/x.json
  python -m hitter_data.harness --levels D1 --seasons 2025 --max-games 5 --max-fit-games 40 --boot 200   (smoke)

2026 is held out: every season loaded for fitting or scoring passes hitter_data.assert_not_heldout."""
import argparse
import csv
import json
import os
import re
import sqlite3
import time
from collections import Counter, defaultdict

import numpy as np

from . import DATA, assert_not_heldout
from .harness_adapters import (BIP_TYPES, CI, HARNESS_ASSUMPTION_VERSION, PA5, SHAPE, EmpiricalAdapter,
                               EngineV12Adapter, RecalAdapter, bases_index, check_tables, engine_fingerprint)
from . import harness_frozen
from . import harness_frozen_a

DB = os.path.join(DATA, "college", "college.sqlite3")
COVERAGE_CSV = os.path.join(DATA, "college", "reports", "coverage.csv")
LEVELS = ("D1", "D2", "D3")

# --- coverage rule (docs/HARNESS_v13.md 2.1) ---------------------------------------------------------------------------
FULL_GAME_SHARE = 0.90       # a game is "full" when >= 90% of its PAs carry letters, counting a lettered game's 0-0 PAs
MIN_FULL_GAMES = 100         # a level-season is scored only with >= 100 full games ...
MIN_PITCH_PAS = 5000         # ... and >= 5,000 PAs whose pitch events pass every filter (checked after the build)
PLAN_RULE_SHARE = 0.50       # plan section 6: a level is fit (and held to "beat v1.2") with >= 50% full games in 2025 and 2026
FIT_WINDOW = 8               # baseline / recalibration fit seasons: up to 8 seasons before the scored one
HALF_LIFE = 2.0              # recency weight halves every 2 seasons back (plan 3.1 default)
MIN_EFFECT = 0.002           # PROPOSED (Drew decides): a pass also needs >= 0.002 nats per pitch on pitch_5way
PRIMARY = "pitch_5way"
HITTER_METRICS = ("pitch_5way", "pitch_swing_take", "pitch_cstrike_given_take", "pitch_result_given_swing", "pa_5way",
                  "bip_type_outs", "bip_type_known", "bip_result")

# --- result classes ---------------------------------------------------------------------------------------------------
HITS = {"1B": 1, "2B": 2, "3B": 3, "HR": 4}
EXCLUDED_RESULTS = {"IBB", "CI", "BINT"}
BUNT_RESULTS = {"SAC", "SH"}
LETTERS = set("BKSFH")
EPS = 1e-12


def connect(path=DB):
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def is_full(pas, pas_full, pas_zero):
    adj = (pas_full or 0) + ((pas_zero or 0) if pas_full else 0)
    return bool(pas) and adj >= FULL_GAME_SHARE * pas


_STOP = {"university", "of", "the", "college", "univ", "u", "at", "and"}


def team_key(name):
    """cluster key for a team name: lower-case word set without filler words (same school, different spellings, may
    still split; a split only makes the team-clustered SE slightly smaller)"""
    t = re.sub(r"\(.*?\)", " ", (name or "").lower())
    t = re.sub(r"[^a-z0-9 ]", " ", t.replace("&", " "))
    return " ".join(sorted(w for w in t.split() if w not in _STOP)) or "?"


def _int(x):
    try:
        return int(str(x).strip())
    except (TypeError, ValueError):
        return None


def games_for(con, level, season, full_only=True):
    """Canonical games of a level-season: [dict]. Calls the held-out guard."""
    assert_not_heldout(season)
    rows = con.execute("""SELECT g.id, g.adapter, g.home, g.away, g.home_runs, g.away_runs, q.pas, q.pas_full,
                                 q.pas_zero_count FROM games g JOIN game_qc q ON q.game_id = g.id
                          WHERE g.canonical = 1 AND g.level = ? AND g.season = ? ORDER BY g.id""",
                       (level, int(season))).fetchall()
    out = []
    for gid, plat, home, away, hr, ar, n, nf, nz in rows:
        if full_only and not is_full(n, nf, nz):
            continue
        h, a = _int(hr), _int(ar)
        out.append(dict(id=gid, platform=plat, home=team_key(home), away=team_key(away),
                        margin=None if h is None or a is None else abs(h - a)))
    return out


PA_COLS = ("game_id", "idx", "inning", "half", "outs_before", "bases_before", "bat_score_before", "fld_score_before",
           "balls", "strikes", "pitches", "count_ok", "result", "in_play", "bip_type", "outs_on_play",
           "runs_rest_inning", "mid_pa_events", "bats", "throws")


def load_pas(con, game_ids, chunk=400):
    out = []
    q = f"SELECT {', '.join(PA_COLS)} FROM pa WHERE game_id IN ({{}}) ORDER BY game_id, idx"
    for i in range(0, len(game_ids), chunk):
        part = game_ids[i:i + chunk]
        out.extend(con.execute(q.format(",".join("?" * len(part))), part).fetchall())
    return out


# --- per-PA classification ---------------------------------------------------------------------------------------------
def side_of(bats, throws):
    if throws not in ("R", "L") or not bats:
        return 2
    if bats in ("S", "B"):
        return 1
    if bats not in ("R", "L"):
        return 2
    return 0 if bats == throws else 1


def scheduled_innings(max_inning, final_margin):
    """Review finding 13: the engine's "late" is scheduled innings - 2. A game whose last inning is 7, or 8 without a
    run-rule margin (an extra-inning 7-inning game), is taken as a 7-inning game; anything else as 9."""
    if max_inning in (7, 8) and (final_margin is None or final_margin < 10):
        return 7
    return 9


def pitch_events(letters, balls, strikes, result, in_play, count_ok):
    """-> (events, reason). events = [(count index, 6-way outcome)], 6-way = ball, hbp, cstrike, whiff, foul, inplay;
    None when the PA's pitches can't be used. The caller has already checked the game is lettered."""
    if result in EXCLUDED_RESULTS:
        return None, "excluded_result"
    if not letters:
        if balls == 0 and strikes == 0 and (in_play or result == "HBP"):
            letters = ""
        else:
            return None, "no_letters"
    elif count_ok != 1:
        return None, "count_not_ok"
    if set(letters) - LETTERS:
        return None, "odd_letter"
    is_k = bool(result) and result.startswith("K")
    b = k = 0
    ev = []
    hbp_seen = foul_tip = False
    for i, ch in enumerate(letters):
        if b >= 4 or k >= 3 or hbp_seen:
            return None, "past_terminal"
        last = i == len(letters) - 1
        ci = CI[(b, k)]
        if ch == "B":
            ev.append((ci, 0)); b += 1
        elif ch == "H":
            ev.append((ci, 1)); hbp_seen = True
        elif ch == "K":
            ev.append((ci, 2)); k += 1
        elif ch == "S":
            ev.append((ci, 3)); k += 1
        else:
            if k == 2 and last and is_k:
                ev.append((ci, 3)); k = 3; foul_tip = True
            else:
                ev.append((ci, 4)); k = min(k + 1, 2)
    if in_play:
        if hbp_seen or b >= 4 or k >= 3 or (b, k) != (balls, strikes):
            return None, "replay_mismatch"
        ev.append((CI[(b, k)], 5))
    elif is_k:
        if k != 3 or b >= 4:
            return None, "replay_mismatch"
    elif result == "BB":
        if b != 4:
            return None, "replay_mismatch"
    elif result == "HBP":
        if not hbp_seen:
            if b >= 4 or k >= 3 or (b, k) != (balls, strikes):
                return None, "replay_mismatch"
            ev.append((CI[(b, k)], 1))
    else:
        return None, "other_result"
    if hbp_seen and result != "HBP":
        return None, "replay_mismatch"
    return ev, ("foul_tip" if foul_tip else "ok")


def pa_class(result, in_play):
    if not result or result in EXCLUDED_RESULTS:
        return -1
    if result.startswith("K"):
        return 0
    if result == "BB":
        return 1
    if result == "HBP":
        return 2
    if in_play:
        return 3 if result in HITS else 4
    return -1


def bip_result(result):
    return HITS.get(result, 5 if result == "E" else 0)


class Season:
    """One level-season's scored events as flat numpy arrays (build_season)."""


def build_season(con, level, season, max_games=None, full_only=True):
    assert_not_heldout(season)
    games = games_for(con, level, season, full_only=full_only)
    if max_games:
        games = games[:max_games]
    gidx = {g["id"]: i for i, g in enumerate(games)}
    rows = [dict(zip(PA_COLS, r)) for r in load_pas(con, [g["id"] for g in games])]
    S = Season()
    S.level, S.season = level, int(season)
    S.games = [g["id"] for g in games]
    S.platform = [g["platform"] for g in games]
    teams = sorted({g["home"] for g in games} | {g["away"] for g in games})
    tix = {t: i for i, t in enumerate(teams)}
    S.home = np.array([tix[g["home"]] for g in games], dtype=np.int32)
    S.away = np.array([tix[g["away"]] for g in games], dtype=np.int32)
    S.n_teams = len(teams)
    reasons = Counter()
    # half-innings whose last PA doesn't reach 3 outs: runs-rest-of-inning may be cut short (review finding 15)
    last = {}
    max_inn = defaultdict(int)
    for d in rows:
        last[(d["game_id"], d["inning"], d["half"])] = (d["outs_before"] or 0) + (d["outs_on_play"] or 0)
        max_inn[d["game_id"]] = max(max_inn[d["game_id"]], d["inning"] or 0)
    final_half = {}
    for (gid, inn, h) in last:
        final_half[gid] = max(final_half.get(gid, (0, 0)), (inn or 0, h == "bottom"))
    short = {key for key, o in last.items() if o < 3}
    reasons["halves_short_final"] = sum(1 for (g, i, h) in short if final_half[g] == (i or 0, h == "bottom"))
    reasons["halves_short_other"] = len(short) - reasons["halves_short_final"]
    sched = {g["id"]: scheduled_innings(max_inn[g["id"]], g["margin"]) for g in games}
    reasons["games_7_inning"] = sum(1 for v in sched.values() if v == 7)
    pa, pit = defaultdict(list), defaultdict(list)
    lettered_pas = 0
    for d in rows:
        g = gidx[d["game_id"]]
        bb = d["bases_before"] or ""
        o = d["outs_before"]
        if len(bb) != 3 or o is None or not (0 <= o <= 2):
            reasons["bad_state"] += 1
            continue
        bi = bases_index(bb[0] == "1", bb[1] == "1", bb[2] == "1")
        sd = side_of(d["bats"], d["throws"])
        margin = (d["bat_score_before"] or 0) - (d["fld_score_before"] or 0)
        lt = int((d["inning"] or 0) >= sched[d["game_id"]] - 2 and abs(margin) <= 2)
        res, ip = d["result"], bool(d["in_play"])
        bunt = d["bip_type"] == "bunt" or res in BUNT_RESULTS
        truncated = (d["game_id"], d["inning"], d["half"]) in short
        rr = d["runs_rest_inning"]
        if rr is not None and not truncated:
            for k_, v in (("g", g), ("o", o), ("bi", bi), ("y", rr)):
                pa["r_" + k_].append(v)
        elif truncated:
            reasons["runs_rows_short_half"] += 1
        if bunt:
            reasons["bunt_pa"] += 1
            continue
        c5 = pa_class(res, ip)
        if c5 >= 0:
            for k_, v in (("g", g), ("o", o), ("bi", bi), ("sd", sd), ("lt", lt), ("y", c5)):
                pa["p_" + k_].append(v)
        else:
            reasons["pa_not_scored:" + str(res)] += 1
        if ip and (d["balls"], d["strikes"]) in CI:
            bt = d["bip_type"]
            t = BIP_TYPES.index(bt) if bt in BIP_TYPES else -1
            br = bip_result(res)
            if t < 0 and br == 0:
                reasons["out_type_unknown:" + str(res)] += 1        # e.g. FC: an out with no written type
            for k_, v in (("g", g), ("ci", CI[(d["balls"], d["strikes"])]), ("o", o), ("bi", bi), ("sd", sd),
                          ("lt", lt), ("t", t), ("r", br)):
                pa["b_" + k_].append(v)
        ev, why = pitch_events(d["pitches"], d["balls"], d["strikes"], res, ip, d["count_ok"])
        reasons["pitches:" + why] += 1
        if ev is None:
            continue
        lettered_pas += 1
        mid = bool(d["mid_pa_events"])
        for ci, e6 in ev:
            for k_, v in (("g", g), ("ci", ci), ("o", o), ("bi", bi), ("sd", sd), ("lt", lt), ("y", e6)):
                pit[k_].append(v)
            pit["run_ok"].append(int(not mid and rr is not None and not truncated))
            pit["rr"].append(rr if rr is not None else 0)
    small = {"g": np.int32, "rr": np.int16, "r_y": np.int16}
    S.pa = {k: np.asarray(v, dtype=np.int32 if k.endswith("_g") else small.get(k, np.int16)) for k, v in pa.items()}
    S.pit = {k: np.asarray(v, dtype=small.get(k, np.int8)) for k, v in pit.items()}
    S.reasons, S.lettered_pas, S.n_pa_rows, S.n_games = reasons, lettered_pas, len(rows), len(games)
    return S


# --- fit counts (baselines and recalibration) --------------------------------------------------------------------------
class FitCounts:
    """Sufficient counts of one or more fit seasons (weights allowed). Combine with add_scaled."""

    def __init__(self):
        self.ev6_ctx = np.zeros(SHAPE + (6,))
        self.ip_ctx = np.zeros(SHAPE)
        self.bip_r = np.zeros((12, 6))
        self.bip_tr_c = np.zeros((12, 4, 6))
        self.runs_sum = np.zeros((3, 8)); self.runs_n = np.zeros((3, 8))
        self.cv_sum = np.zeros((12, 3, 8)); self.cv_n = np.zeros((12, 3, 8))
        self.seasons = {}

    @classmethod
    def from_season(cls, S):
        f = cls()
        p, b = S.pit, S.pa
        if len(p.get("y", [])):
            np.add.at(f.ev6_ctx, (p["ci"], p["o"], p["bi"], p["sd"], p["lt"], p["y"]), 1)
            m = p["run_ok"] == 1
            np.add.at(f.cv_sum, (p["ci"][m], p["o"][m], p["bi"][m]), p["rr"][m])
            np.add.at(f.cv_n, (p["ci"][m], p["o"][m], p["bi"][m]), 1)
        if len(b.get("b_g", [])):
            np.add.at(f.ip_ctx, (b["b_ci"], b["b_o"], b["b_bi"], b["b_sd"], b["b_lt"]), 1)
            np.add.at(f.bip_r, (b["b_ci"], b["b_r"]), 1)
            k = b["b_t"] >= 0
            np.add.at(f.bip_tr_c, (b["b_ci"][k], b["b_t"][k], b["b_r"][k]), 1)
        if len(b.get("r_g", [])):
            np.add.at(f.runs_sum, (b["r_o"], b["r_bi"]), b["r_y"])
            np.add.at(f.runs_n, (b["r_o"], b["r_bi"]), 1)
        f.seasons = {S.season: 1.0}
        return f

    def add_scaled(self, other, w):
        for k in ("ev6_ctx", "ip_ctx", "bip_r", "bip_tr_c", "runs_sum", "runs_n", "cv_sum", "cv_n"):
            setattr(self, k, getattr(self, k) + w * getattr(other, k))
        for s in other.seasons:
            self.seasons[s] = w

    # views used by the adapters
    def _t_given_r(self):
        pooled = self.bip_tr_c.sum(axis=0) + 0.5
        return pooled / pooled.sum(axis=0, keepdims=True)                 # [4, 6]

    def bip_count(self):
        """P(type, result | in play, count) = P(result | count) x P(type | result, count), the latter shrunk toward
        the pooled P(type | result) (weight 20). Types are missing mostly on hits, so type is imputed within result."""
        pr = (self.bip_r + 0.5) / (self.bip_r + 0.5).sum(axis=1, keepdims=True)
        pool = self._t_given_r()
        tc = (self.bip_tr_c + 20 * pool[None]) / (self.bip_tr_c.sum(axis=1, keepdims=True) + 20)
        return pr[:, None, :] * tc

    def bip_flat(self):
        r = self.bip_r.sum(axis=0) + 0.5
        return (r / r.sum())[None, :] * self._t_given_r()

    def re(self):
        overall = self.runs_sum.sum() / max(self.runs_n.sum(), 1e-9)
        return (self.runs_sum + 20 * overall) / (self.runs_n + 20)

    def cv(self):
        re = self.re()
        s = (self.cv_sum - self.cv_n * re[None]).sum(axis=(1, 2))
        return s / np.maximum(self.cv_n.sum(axis=(1, 2)), 1e-9)


def recency_weight(season, scored):
    return 0.5 ** ((scored - 1 - season) / HALF_LIFE)


# --- scoring -----------------------------------------------------------------------------------------------------------
def nll(p):
    return -np.log(np.clip(p, EPS, 1.0))


def event_losses(S, t):
    """-> dict metric -> (per-event loss, game index, count index or None)."""
    out = {}
    p = S.pit
    if len(p.get("y", [])):
        ctx = (p["ci"], p["o"], p["bi"], p["sd"], p["lt"])
        y5 = np.where(p["y"] <= 1, 0, p["y"] - 1).astype(np.int64)
        g, ci = p["g"].astype(np.int64), p["ci"].astype(np.int64)
        E = t.EV5[ctx]
        out["pitch_5way"] = (nll(E[np.arange(len(y5)), y5]), g, ci)
        psw = E[:, 2:].sum(axis=1)
        sw = y5 >= 2
        out["pitch_swing_take"] = (nll(np.where(sw, psw, 1 - psw)), g, ci)
        tk = ~sw
        pcs = E[tk, 1] / np.maximum(E[tk, 0] + E[tk, 1], EPS)
        out["pitch_cstrike_given_take"] = (nll(np.where(y5[tk] == 1, pcs, 1 - pcs)), g[tk], ci[tk])
        Es = E[sw, 2:] / np.maximum(psw[sw, None], EPS)
        out["pitch_result_given_swing"] = (nll(Es[np.arange(sw.sum()), y5[sw] - 2]), g[sw], ci[sw])
        m = p["run_ok"] == 1
        pred = t.RE[p["o"][m], p["bi"][m]] + t.CV[p["ci"][m]]
        out["runs_pitch_state_sq"] = ((p["rr"][m] - pred) ** 2, g[m], ci[m])
    a = S.pa
    if len(a.get("p_y", [])):
        ctx = (a["p_o"], a["p_bi"], a["p_sd"], a["p_lt"])
        out["pa_5way"] = (nll(t.PA5[ctx][np.arange(len(a["p_y"])), a["p_y"]]), a["p_g"].astype(np.int64), None)
    if len(a.get("b_g", [])):
        ctx = (a["b_ci"], a["b_o"], a["b_bi"], a["b_sd"], a["b_lt"])
        g, ci, tt, rr = a["b_g"].astype(np.int64), a["b_ci"].astype(np.int64), a["b_t"].astype(np.int64), a["b_r"].astype(np.int64)
        known = tt >= 0
        m = known & (rr == 0)
        O = t.OUTT[tuple(x[m] for x in ctx)]
        out["bip_type_outs"] = (nll(O[np.arange(m.sum()), tt[m]]), g[m], ci[m])
        K = t.BIPT[tuple(x[known] for x in ctx)]
        out["bip_type_known"] = (nll(K[np.arange(known.sum()), tt[known]]), g[known], ci[known])
        R = t.RES[ctx]
        out["bip_result"] = (nll(R[np.arange(len(rr)), rr]), g, ci)
    if len(a.get("r_g", [])):
        pred = t.RE[a["r_o"], a["r_bi"]]
        out["runs_pa_sq"] = ((a["r_y"] - pred) ** 2, a["r_g"].astype(np.int64), None)
    return out


def boot_weights(S, B, seed):
    """-> {scheme: [B, G] game weights}. game: resample games. home: resample home teams (a game's weight = its home
    team's draw count). team2: resample teams once, a game's weight = draw(home) x draw(away) (pigeonhole bootstrap,
    clusters on both teams; conservative)."""
    rng = np.random.default_rng(seed)
    G = S.n_games
    if G == 0:
        return {k: np.zeros((B, 0)) for k in ("game", "home", "team2")}
    out = {"game": rng.multinomial(G, np.full(G, 1.0 / G), size=B).astype(float)}
    T = S.n_teams
    wt = rng.multinomial(T, np.full(T, 1.0 / T), size=B).astype(float)
    homes = np.unique(S.home)
    wh = np.zeros((B, T))
    wh[:, homes] = rng.multinomial(len(homes), np.full(len(homes), 1.0 / len(homes)), size=B)
    out["home"] = wh[:, S.home]
    out["team2"] = wt[:, S.home] * wt[:, S.away]
    return out


def per_game(loss, g, G):
    return np.bincount(g, weights=loss, minlength=G), np.bincount(g, minlength=G).astype(float)


def boot_mean(loss_g, n_g, W):
    """-> (mean, bootstrap SE) of the event-weighted mean loss under one weight matrix W [B, G]."""
    mean = loss_g.sum() / max(n_g.sum(), 1)
    if W.shape[0] == 0 or n_g.sum() == 0:
        return mean, float("nan")
    num, den = W @ loss_g, W @ n_g
    ok = den > 0
    return mean, float(np.std(num[ok] / den[ok], ddof=1))


def boot_all(loss_g, n_g, Ws):
    mean = float(loss_g.sum() / max(n_g.sum(), 1))
    se = {k: boot_mean(loss_g, n_g, W)[1] for k, W in Ws.items()}
    return mean, se


def score_season(S, adapters, refs, B=200, seed=1):
    """-> per metric: n; per adapter mean and SEs (game / home / team2); paired difference of every adapter against
    each reference, with SEs; by-count means and by-count differences vs the first reference (game SE)."""
    for ad in adapters:
        if S.season in tuple(getattr(ad, "fit_seasons", ()) or ()):
            raise ValueError(f"{ad.name} was fit on {S.season}: refusing to score it in-sample (review finding 6)")
    G = S.n_games
    Ws = boot_weights(S, B, seed)
    losses = {}
    for ad in adapters:
        t = ad.tables(S.level)
        prob = check_tables(t)
        if prob:
            raise ValueError(f"{ad.name} tables for {S.level}: {prob}")
        losses[ad.name] = event_losses(S, t)
    names = [a.name for a in adapters]
    res = {}
    for met in losses[names[0]]:
        r = {"n": 0, "adapters": {}, "diff": {ref: {} for ref in refs}, "by_count": {}, "by_count_diff": {}}
        pg = {}
        for nm in names:
            loss, g, grp = losses[nm][met]
            lg, ng = per_game(loss, g, G)
            pg[nm] = (lg, ng)
            r["n"] = int(ng.sum())
            r["adapters"][nm] = boot_all(lg, ng, Ws)
        for ref in refs:
            for nm in names:
                if nm != ref:
                    r["diff"][ref][nm] = boot_all(pg[nm][0] - pg[ref][0], pg[nm][1], Ws)
        grp = losses[names[0]][met][2]
        if grp is not None:
            g0 = losses[names[0]][met][1]
            cell = g0 * 12 + grp
            for nm in names:
                loss = losses[nm][met][0]
                bc = {}
                for ci in range(12):
                    m = grp == ci
                    if m.any():
                        bc[ci] = (int(m.sum()), float(loss[m].mean()))
                r["by_count"][nm] = bc
            ref0 = refs[0]
            l0 = np.bincount(cell, weights=losses[ref0][met][0], minlength=12 * G).reshape(G, 12)
            nn = np.bincount(cell, minlength=12 * G).reshape(G, 12).astype(float)
            for nm in names:
                if nm == ref0:
                    continue
                l1 = np.bincount(cell, weights=losses[nm][met][0], minlength=12 * G).reshape(G, 12)
                r["by_count_diff"][nm] = {ci: boot_mean(l1[:, ci] - l0[:, ci], nn[:, ci], Ws["game"])
                                          for ci in range(12) if nn[:, ci].sum() > 0}
        res[met] = r
    if PRIMARY in res:
        plat = np.asarray(S.platform)
        res[PRIMARY + "_by_platform"] = {}
        for nm in names:
            loss, g, _ = losses[nm][PRIMARY]
            res[PRIMARY + "_by_platform"][nm] = {pf: (int((plat[g] == pf).sum()), float(loss[plat[g] == pf].mean()))
                                                 for pf in sorted(set(S.platform)) if (plat[g] == pf).any()}
    return res


# --- coverage, plan rule, selection check ------------------------------------------------------------------------------
def prequalify(con, level, season):
    """Fast pre-check from game_qc (the binding check is post-filter, in main)."""
    assert_not_heldout(season)
    rows = con.execute("""SELECT q.pas, q.pas_full, q.pas_zero_count FROM games g JOIN game_qc q ON q.game_id = g.id
                          WHERE g.canonical = 1 AND g.level = ? AND g.season = ?""", (level, int(season))).fetchall()
    full = [r for r in rows if is_full(*r)]
    return dict(level=level, season=int(season), games=len(rows), full_games=len(full),
                maybe=len(full) >= MIN_FULL_GAMES)


qualify = prequalify


def plan_rule():
    """Plan section 6 (review finding 9): a level is held to "beat v1.2" only if >= 50% of its games are full in the
    validation and held-out seasons. Read from the coverage report (counting only; no 2026 game is loaded here)."""
    out = {}
    try:
        with open(COVERAGE_CSV, newline="", encoding="utf-8") as f:
            rows = {(r["level"], int(r["season"])): float(r["full_share_counting_0-0"] or 0) for r in csv.DictReader(f)}
    except OSError:
        return {}
    for lv in LEVELS:
        s25, s26 = rows.get((lv, 2025), 0.0), rows.get((lv, 2026), 0.0)
        out[lv] = dict(share_2025=s25, share_2026=s26, passes=s25 >= PLAN_RULE_SHARE and s26 >= PLAN_RULE_SHARE)
    return out


def selection_check(con, level, season, max_games=None):
    assert_not_heldout(season)
    out = {}
    rows = con.execute("""SELECT g.id, q.pas, q.pas_full, q.pas_zero_count FROM games g JOIN game_qc q ON q.game_id=g.id
                          WHERE g.canonical=1 AND g.level=? AND g.season=? ORDER BY g.id""", (level, int(season))).fetchall()
    for full_flag in (True, False):
        ids = [r[0] for r in rows if is_full(*r[1:]) == full_flag][:max_games]
        c = Counter()
        for i in range(0, len(ids), 400):
            part = ids[i:i + 400]
            for res, ip in con.execute(f"SELECT result, in_play FROM pa WHERE game_id IN ({','.join('?' * len(part))})", part):
                k = pa_class(res, ip)
                if k >= 0:
                    c["pa"] += 1; c[PA5[k]] += 1
                c["HR"] += res == "HR"
        out["full" if full_flag else "other"] = {"games": len(ids), "pas": c["pa"],
                                                 **{k: round(c[k] / max(c["pa"], 1), 4) for k in ("K", "BB", "HBP", "hit", "HR")}}
    return out


# --- driver ------------------------------------------------------------------------------------------------------------
def fit_seasons_for(con, level, season, candidates):
    """Fit seasons for scoring `season`: candidate seasons within FIT_WINDOW strictly before it. Never the scored
    season, never a later one, never 2026 (review finding 14: D3 2024 must not use 2025)."""
    return [assert_not_heldout(s) for s in candidates if season - FIT_WINDOW <= s < season]


def parse_seasons(txt):
    out = []
    for part in txt.split(","):
        if "-" in part:
            lo, hi = part.split("-")
            out.extend(range(int(lo), int(hi) + 1))
        elif part:
            out.append(int(part))
    return [assert_not_heldout(s) for s in out]


def fmt_report(level, season, S, res, refs):
    L = [f"\n=== {level} {season}: {S.n_games} games, {S.n_teams} teams, {S.lettered_pas} PAs with usable pitches, "
         f"{len(S.pit.get('y', []))} pitch events ==="]
    for met, r in res.items():
        if met.endswith("_by_platform"):
            L.append(f"  {met}: " + "; ".join(f"{nm} " + ", ".join(f"{pf} n={n} {v:.4f}" for pf, (n, v) in d.items())
                                                for nm, d in r.items() if nm in refs))
            continue
        L.append(f"  {met:26s} n={r['n']}" + ("   (reported only: not a hitter metric)" if met not in HITTER_METRICS else ""))
        for nm, (m, se) in r["adapters"].items():
            line = f"      {nm:22s} {m:.4f} (SE game {se['game']:.4f} home {se['home']:.4f} team2 {se['team2']:.4f})"
            for ref in refs:
                dv = r["diff"][ref].get(nm)
                if dv:
                    line += f" | -{ref}: {dv[0]:+.4f} (SE {max(dv[1].values()):.4f})"
            L.append(line)
    top = sorted(S.reasons.items(), key=lambda kv: -kv[1])[:14]
    L.append("  filters: " + ", ".join(f"{k}={v}" for k, v in top))
    return "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DB)
    ap.add_argument("--levels", default="D1,D2,D3")
    ap.add_argument("--seasons", required=True, help="comma list / ranges, e.g. 2006-2025; 2026 refused")
    ap.add_argument("--fit-seasons", default="auto", help="'auto' = up to 8 seasons before each scored season")
    ap.add_argument("--max-games", type=int, default=None, help="smoke runs: first N full games per scored season")
    ap.add_argument("--max-fit-games", type=int, default=None)
    ap.add_argument("--boot", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--variants", action="store_true", help="also v1.2 (raw and recalibrated) under other assumptions")
    ap.add_argument("--selection-check", action="store_true")
    ap.add_argument("--ignore-coverage", action="store_true", help="smoke runs only")
    ap.add_argument("--out", default=None)
    a = ap.parse_args(argv)

    seasons = parse_seasons(a.seasons)
    fixed_fit = parse_seasons(a.fit_seasons) if a.fit_seasons != "auto" else None
    con = connect(a.db)
    t0 = time.time()
    fp = engine_fingerprint()
    meta = {"assumption": HARNESS_ASSUMPTION_VERSION, "frozen_source_commit": harness_frozen.SOURCE_COMMIT,
            "landing": "single_a", "landing_source_commit": harness_frozen_a.SOURCE_COMMIT,
            "landing_single_a_seasons": {str(k): v for k, v in harness_frozen_a.SINGLE_A_SEASONS.items()}, **fp,
            "boot": a.boot, "seed": a.seed, "fit_window": FIT_WINDOW, "half_life": HALF_LIFE, "min_effect": MIN_EFFECT,
            "primary": PRIMARY, "plan_rule": plan_rule(), "coverage_rule": dict(full_game_share=FULL_GAME_SHARE,
                                                                                min_full_games=MIN_FULL_GAMES,
                                                                                min_pitch_pas=MIN_PITCH_PAS)}
    print(f"harness {HARNESS_ASSUMPTION_VERSION}; engine {fp}; db {a.db}")
    raw = {"D1": EngineV12Adapter("college_d1"), "D3": EngineV12Adapter("college_d3")}
    variants = {}
    if a.variants:
        for an in ("calib_world", "handset", "calib_more_fb", "calib_less_fb"):   # calib_world: the h2 primary, a side report
            variants[an] = (EngineV12Adapter("college_d1", assumption=an), EngineV12Adapter("college_d3", assumption=an))
    allres = {"meta": meta, "results": {}}
    for level in a.levels.split(","):
        pre = {s: prequalify(con, level, s) for s in range(1990, 2026)}
        with_games = [s for s, q in pre.items() if q["full_games"] > 0]
        fc_cache = {}

        def fit_counts(s):
            if s not in fc_cache:
                fc_cache[s] = FitCounts.from_season(build_season(con, level, s, max_games=a.max_fit_games))
            return fc_cache[s]

        for season in seasons:
            q = pre[season]
            if not q["maybe"] and not a.ignore_coverage:
                print(f"\n{level} {season}: {q['full_games']} full games: not scored (coverage rule)")
                continue
            S = build_season(con, level, season, max_games=a.max_games)
            q.update(n_games=S.n_games, lettered_pas=S.lettered_pas,
                     scored=S.n_games >= MIN_FULL_GAMES and S.lettered_pas >= MIN_PITCH_PAS)
            if not q["scored"] and not a.ignore_coverage:
                print(f"\n{level} {season}: {q}: not scored (post-filter coverage rule)")
                continue
            fs = list(fixed_fit) if fixed_fit is not None else fit_seasons_for(con, level, season, with_games)
            fc = FitCounts()
            for s in fs:
                fc.add_scaled(fit_counts(s), recency_weight(s, season))
            if a.max_games is None and a.max_fit_games is None and season not in fc_cache:
                fc_cache[season] = FitCounts.from_season(S)          # reused as a fit season for later seasons
            fit = {level: fc}
            v12 = raw["D1"] if level != "D3" else raw["D3"]
            adapters = [v12, RecalAdapter(v12, fit, fs)]
            refs = [v12.name + "_recal"]
            if level == "D2":
                adapters += [raw["D3"], RecalAdapter(raw["D3"], fit, fs)]
                refs.append(raw["D3"].name + "_recal")
            for an, (vd1, vd3) in variants.items():
                vv = vd3 if level == "D3" else vd1
                adapters += [vv, RecalAdapter(vv, fit, fs)]
            adapters += [EmpiricalAdapter(k, fit, fs) for k in ("flat", "count", "count_bo")]
            res = score_season(S, adapters, refs, B=a.boot, seed=a.seed)
            print(f"\n{level} {season}: fit seasons {fs} (weights " +
                  ", ".join(f"{s}:{recency_weight(s, season):.2f}" for s in fs) + f"), {int(fc.ev6_ctx.sum())} weighted pitch events")
            print(fmt_report(level, season, S, res, refs))
            entry = {"coverage": q, "fit_seasons": fs, "refs": refs, "n_games": S.n_games, "n_teams": S.n_teams,
                     "reasons": dict(S.reasons), "scores": res}
            if a.selection_check:
                entry["selection"] = selection_check(con, level, season, max_games=a.max_games)
                print("  selection check:", entry["selection"])
            allres["results"][f"{level}_{season}"] = entry
            del S
    print(f"\n({time.time() - t0:.1f} s)")
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(allres, f, indent=1, default=lambda o: o.item() if isinstance(o, np.generic) else str(o))
        print("wrote", a.out)
    return allres


if __name__ == "__main__":
    main()
