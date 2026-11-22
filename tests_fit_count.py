"""v1.3 buildout Part 3.1 / 3.2 / 3.5 tests: the count-layer fit, run values and candidate scoring, on synthetic counts
and a tiny synthetic SQLite fixture (no real data). Checks the shrinkage and borrowing math, recency weights, the level
offset, recovery of known probabilities, the candidate JSON round trip into harness tables, the weak-contact text rule,
the run-value fit, and that the held-out guard (2026) trips in every fit / scoring path.
usage: python3 tests_fit_count.py"""
import json
import math
import os
import sqlite3
import tempfile

import numpy as np

from hitter_data import HeldOutSeasonError
from hitter_data import fit_count as FC
from hitter_data import fit_count_data as FD
from hitter_data import fit_count_proxy as FP
from hitter_data import fit_runs as FR
from hitter_data import harness as H
from hitter_data import score_candidates as SCN
from hitter_data.harness_adapters import CI, check_tables

FAILS = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else f"  ({detail})"))
    if not cond:
        FAILS.append(name)


def trips(f, *a, **k):
    try:
        f(*a, **k)
    except HeldOutSeasonError:
        return True
    return False


RNG = np.random.default_rng(7)
TRUE_P6 = np.array([0.36, 0.01, 0.17, 0.11, 0.17, 0.18])


def synth_counts(n_per_cell, p6=TRUE_P6, shift=None, seed=0):
    """Synthetic weighted counts: ev6 drawn from p6 (optionally a per-count multiplier), bip uniform-ish, runs."""
    rng = np.random.default_rng(seed)
    c = FD.empty()
    for ci in range(12):
        p = p6 * (shift[ci] if shift is not None else 1)
        p = p / p.sum()
        c["ev6"][ci] = rng.multinomial(n_per_cell, p, size=(3, 8, 3, 2))
    c["bip"][..., :4, :] = rng.poisson(5, size=c["bip"][..., :4, :].shape)
    c["runs_n"][:] = 100
    c["runs_sum"][:] = 100 * (0.3 + 0.2 * np.arange(8)[None, :] - 0.15 * np.arange(3)[:, None])
    c["cv_n"][:] = 50
    c["cv_sum"][:] = 50 * (c["runs_sum"] / c["runs_n"])[None]
    c["cv_sq"][:] = c["cv_sum"] ** 2 / 50 + 50
    return c


# ---------- math ----------
def t_math():
    n = np.array([[30.0, 10.0, 0.0]])
    prior = np.array([[0.2, 0.3, 0.5]])
    check("shrink alpha 0 = raw frequencies", np.allclose(FC.shrink(n, prior, 0.0), [[0.75, 0.25, 0.0]]))
    check("shrink alpha inf = prior", np.allclose(FC.shrink(n, prior, FC.INF), prior))
    check("shrink alpha 40 = halfway", np.allclose(FC.shrink(n, prior, 40.0), (n + 40 * prior) / 80))
    p6 = np.array([0.3, 0.02, 0.18, 0.1, 0.2, 0.2])
    check("ev5 folds HBP into ball", np.allclose(FC.ev5(p6), [0.32, 0.18, 0.1, 0.2, 0.2]))
    V = np.zeros((12, 3, 8, 3, 2, 6))
    V[0, 0, 0, 2, 0] = [3, 1, 2, 1, 2, 1]
    P = np.broadcast_to(p6, V.shape).copy()
    manual = -(4 * math.log(0.32) + 2 * math.log(0.18) + 1 * math.log(0.1) + 2 * math.log(0.2) + 1 * math.log(0.2)) / 10
    check("loss_pitch = harness 5-way mean log loss", abs(FC.loss_pitch(P, V) - manual) < 1e-12, (FC.loss_pitch(P, V), manual))
    t = FC.chain_terms(p6)
    check("chain terms: swing, cs|take, whiff|swing add up", abs(t["swing"] - 0.5) < 1e-9 and abs(t["cstrike_given_take"] - 0.36) < 1e-4
          and abs(t["whiff_given_swing"] + t["foul_given_swing"] + t["inplay_given_swing"] - 1) < 1e-4, t)


def t_recency():
    per = {s: synth_counts(1, seed=s) for s in range(2014, 2025)}
    _, w = FD.weighted(per, 2025, 2.0, 8)
    check("recency: window 8 = 2017-2024", sorted(w) == list(range(2017, 2025)), sorted(w))
    check("recency: half-life 2 -> 2024 1.0, 2022 0.5, 2020 0.25", (w[2024], w[2022], w[2020]) == (1.0, 0.5, 0.25), w)
    _, w = FD.weighted(per, 2025, FC.INF, 8)
    check("recency: half-life inf = equal weights", set(w.values()) == {1.0}, w)
    acc, w = FD.weighted({2023: per[2023], 2024: per[2024]}, 2025, 1.0, 8)
    check("recency: weighted sum of counts", np.allclose(acc["ev6"], per[2024]["ev6"] + 0.5 * per[2023]["ev6"]))


def t_borrow():
    own = np.zeros((12, 2, 3))
    own[:, 0] = [600, 300, 100]                                           # cell 0: 1000 pitches, no borrowing at K=500
    own[:, 1] = [20, 10, 10]                                              # cell 1: 40 pitches, borrows 460
    nb = np.zeros((12, 2, 3))
    nb[:, :] = [500, 300, 200]
    own_p = np.tile([0.6, 0.3, 0.1], (12, 1))
    nb_p = np.tile([0.5, 0.3, 0.2], (12, 1))
    aug, m = FC.borrow(own, [nb], own_p, nb_p, 500.0)
    check("borrow: a cell with >= K pitches borrows nothing", m[0, 0] == 0 and np.allclose(aug[:, 0], own[:, 0]))
    check("borrow: a thin cell is topped up to K", np.allclose(m[:, 1], 460) and np.allclose(aug[:, 1].sum(-1), 500))
    check("borrow: neighbour data shifted to this level's per-count rates (the level offset)",
          np.allclose((aug[0, 1] - own[0, 1]) / 460, [0.6, 0.3, 0.1]))
    aug0, m0 = FC.borrow(own, [nb], own_p, nb_p, 0.0)
    check("borrow: K = 0 is no borrowing", np.allclose(aug0, own) and m0.sum() == 0)


def t_recovery():
    shift = np.ones((12, 6))
    shift[CI[(3, 0)]] = [2.0, 1, 0.5, 0.2, 0.5, 0.8]                       # a 3-0 pattern
    shift[CI[(0, 2)]] = [0.8, 1, 0.3, 2.0, 1.6, 1.0]                       # an 0-2 pattern
    W = {"D1": synth_counts(400, shift=shift, seed=1), "D2": synth_counts(40, shift=shift, seed=2),
         "D3": synth_counts(20, shift=shift, seed=3)}
    prm = dict(FC.DEFAULTS)
    f = FC.fit_level(W, "D1", prm, "sep")
    truth = TRUE_P6 * shift
    truth = truth / truth.sum(-1, keepdims=True)
    check("recovery: D1 per-count rates within 0.01 of the truth", np.abs(f["diag"]["pc"] - truth).max() < 0.01,
          np.abs(f["diag"]["pc"] - truth).max())
    check("recovery: tables normalised", np.allclose(f["P6"].sum(-1), 1) and f["P6"].min() >= 0)
    fb = FC.fit_level(W, "D3", dict(prm, K=5000.0), "borrow")
    fs = FC.fit_level(W, "D3", dict(prm, K=0.0), "sep")
    err_b = np.abs(fb["P6"] - truth[:, None, None, None, None]).mean()
    err_s = np.abs(fs["P6"] - truth[:, None, None, None, None]).mean()
    check("borrowing helps a thin level when the pattern is shared (D3 cell error lower)", err_b <= err_s, (err_b, err_s))
    check("borrowed share printed and in (0, 1]", 0 < fb["diag"]["borrowed_share_cell"] <= 1, fb["diag"])
    fsh = FC.fit_level(W, "D2", prm, "shared")
    n = W["D2"]["ev6"].sum(-1)
    m = (fsh["P6"] * n[..., None]).reshape(-1, 6).sum(0) / n.sum()
    tgt = FC.norm(W["D2"]["ev6"].sum(axis=(0, 1, 2, 3, 4)) + 0.5)
    check("shared + level offset: the level's mean equals its own outcome mix", np.allclose(m, tgt, atol=1e-6), (m, tgt))
    return W


def t_json(W):
    prm = dict(FC.DEFAULTS)
    f = FC.fit_level(W, "D1", prm, "borrow")
    j = FC.candidate_json("D1", "borrow", prm, {2024: 1.0, 2023: 0.71}, f, W["D1"], 2025)
    check("candidate JSON is labelled PROVISIONAL", j["provisional"].startswith("PROVISIONAL"))
    check("candidate JSON keeps every count and the chain terms", len(j["count"]) == 12 and "whiff_given_swing" in j["count"]["0-2"])
    s = json.dumps(j)
    j2 = json.loads(s)
    t = FC.tables_from_json(j2)
    check("candidate JSON -> harness tables pass check_tables", check_tables(t) == [], check_tables(t))
    check("round trip keeps the probabilities (6 decimals)", np.abs(t.P6 - f["P6"]).max() < 2e-6, np.abs(t.P6 - f["P6"]).max())
    d = tempfile.mkdtemp()
    p = os.path.join(d, "D1_borrow_thru2024.json")
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(j2, fh)
    ad = SCN.CandidateAdapter(p)
    check("candidate adapter carries its fit seasons (in-sample guard)", set(ad.fit_seasons) == {2023, 2024}, ad.fit_seasons)
    try:
        ad.tables("D2")
        check("candidate adapter refuses another level", False)
    except ValueError:
        check("candidate adapter refuses another level", True)
    bad = dict(j2, fit_seasons={"2026": 1.0})
    p2 = os.path.join(d, "bad.json")
    with open(p2, "w", encoding="utf-8") as fh:
        json.dump(bad, fh)
    check("held-out: a candidate fit on 2026 is refused", trips(SCN.CandidateAdapter, p2))


def t_runs():
    W = {"D1": synth_counts(10, seed=4), "D2": synth_counts(10, seed=5)}
    f = FR.fit_level(W, "D1", dict(half_life=2.0, A=FC.INF, K=0.0))
    RE_true = W["D1"]["runs_sum"] / W["D1"]["runs_n"]
    check("runs: RE recovers the PA-start means (20-PA shrink)", np.abs(f["RE"] - RE_true).max() < 0.2, np.abs(f["RE"] - RE_true).max())
    check("runs: A = inf -> RV = RE + CV (additive)", np.allclose(f["RV"], f["RE"][None] + f["CV"][:, None, None]))
    V = W["D1"]
    direct = float((V["cv_sq"] - 2 * f["RV"] * V["cv_sum"] + f["RV"] ** 2 * V["cv_n"]).sum() / V["cv_n"].sum())
    check("runs: squared-error-from-counts identity", abs(FR.sq_loss_counts(f, V) - direct) < 1e-9)
    fb = FR.fit_level(W, "D1", dict(half_life=2.0, A=100.0, K=500.0))
    check("runs: borrowed share in [0, 1]", 0 <= fb["borrowed_share"] <= 1, fb["borrowed_share"])


def t_text():
    check("weak: pop-up", FD.is_weak("pop", "x popped up to ss (0-0)."))
    check("weak: grounder to the pitcher", FD.is_weak("ground", "Smith grounded out to p (1-1 BK)."))
    check("weak: single to the catcher", FD.is_weak("ground", "Smith singled to catcher (0-0)."))
    check("weak: not a grounder to short", not FD.is_weak("ground", "Smith grounded out to ss (1-1 BK)."))
    check("weak: not a fly ball", not FD.is_weak("fly", "Smith flied out to cf (0-0)."))
    check("spearman: identical ranks = 1, reversed = -1", FP.spearman([1, 2, 3], [4, 5, 9]) == 1.0 and
          abs(FP.spearman([1, 2, 3], [3, 2, 1]) + 1) < 1e-12)


# ---------- fixture: counts_from_season on a synthetic archive ----------
SCHEMA = """
CREATE TABLE games(id TEXT PRIMARY KEY, season INTEGER, level TEXT, canonical INTEGER, adapter TEXT,
  home TEXT, away TEXT, home_runs TEXT, away_runs TEXT);
CREATE TABLE game_qc(game_id TEXT PRIMARY KEY, pas INTEGER, pas_full INTEGER, pas_zero_count INTEGER);
CREATE TABLE pa(game_id TEXT, idx INTEGER, inning INTEGER, half TEXT, outs_before INTEGER, bases_before TEXT,
  bat_score_before INTEGER, fld_score_before INTEGER, balls INTEGER, strikes INTEGER, pitches TEXT, count_ok INTEGER,
  result TEXT, in_play INTEGER, bip_type TEXT, outs_on_play INTEGER, runs_rest_inning INTEGER, mid_pa_events INTEGER,
  bats TEXT, throws TEXT, text TEXT, PRIMARY KEY(game_id, idx));
"""
HALF = [  # outs, bases, balls, strikes, pitches, ok, result, in_play, bip, outs_on_play, runs_rest, mid, bats, throws, text
    (0, "000", 1, 2, "BKFS", 1, "K_S", 0, None, 1, 1, 0, "R", "R", "A struck out swinging (1-2 BKFS)."),
    (1, "000", 0, 1, "K", 1, "2B", 1, "unknown", 0, 1, 0, "L", "R", "B doubled to left field (0-1 K)."),
    (1, "020", 1, 0, "B", 1, "GO", 1, "ground", 1, 1, 0, None, "R", "C grounded out to p (1-0 B)."),
    (2, "003", 0, 0, None, None, "PO", 1, "pop", 1, 0, 0, None, None, "D popped up to 2b (0-0)."),
]


def make_db(path):
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    for gid, s in (("g24", 2024), ("g25", 2025), ("g26", 2026)):
        con.execute("INSERT INTO games VALUES (?,?,?,?,?,?,?,?,?)", (gid, s, "D1", 1, "Sidearm", "Alpha U", "Beta U", "3", "2"))
        rows = [(inn, half) + r for inn in (1, 2) for half in ("top", "bottom") for r in HALF]
        for i, r in enumerate(rows):
            inn, half, o, b, bl, st, p, ok, res, ip, bip, oo, rr, mid, bats, thr, text = r
            con.execute("INSERT INTO pa VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (gid, i, inn, half, o, b, 0, 0, bl, st, p, ok, res, ip, bip, oo, rr, mid, bats, thr, text))
        con.execute("INSERT INTO game_qc VALUES (?,?,?,?)", (gid, len(rows), 12, 4))
    con.commit()
    con.close()


def t_fixture():
    d = tempfile.mkdtemp()
    path = os.path.join(d, "fx.sqlite3")
    make_db(path)
    con = H.connect(path)
    S = H.build_season(con, "D1", 2025)
    c = FD.counts_from_season(con, S)
    check("fixture: 4 half-innings x (4 + 2 + 2 + 1) pitch events", c["ev6"].sum() == 4 * 9, c["ev6"].sum())
    check("fixture: 3 non-bunt balls in play per half", c["bip"].sum() == 12 and c["bipn"].sum() == 12, (c["bip"].sum(), c["bipn"].sum()))
    check("fixture: hard proxy = the double (XBH), 1 per half", c["hard"].sum() == 4, c["hard"])
    check("fixture: weak proxy = grounder to p + pop-up, 2 per half", c["weak"].sum() == 8, c["weak"])
    check("fixture: handedness both / batter-only / pitcher-only / neither", list(c["hand"]) == [8, 0, 4, 4], c["hand"])
    check("fixture: side same (R-R) / opposite (L-R) / unknown = 4 / 2 / 3 pitches per half",
          list(c["ev6"].sum(axis=(0, 1, 2, 4, 5))) == [16, 8, 12], c["ev6"].sum(axis=(0, 1, 2, 4, 5)))
    check("fixture: runs from the PA start counted", c["runs_n"].sum() == 16 and c["runs_sum"].sum() == 12, (c["runs_n"].sum(), c["runs_sum"].sum()))
    Sk = SCN.known_side_view(S)
    check("known-side view keeps only side 0 / 1 pitches", (Sk.pit["sd"] < 2).all() and len(Sk.pit["sd"]) == 4 * 6, len(Sk.pit["sd"]))
    check("held-out: harness season build on 2026 trips", trips(H.build_season, con, "D1", 2026))
    check("held-out: season_counts(2026) trips", trips(FD.season_counts, con, "D1", 2026, cache=False))
    check("held-out: seasons_with_games up to 2026 trips", trips(FD.seasons_with_games, con, "D1", 2024, 2026))
    check("held-out: load_all hi=2026 trips", trips(FD.load_all, con, ("D1",), 2024, 2026, False))
    check("held-out: score_level on 2026 trips", trips(SCN.score_level, con, "D1", 2026, 10))
    check("held-out: run-value comparison on 2026 trips", trips(FR.compare, con, "D1", 2026, {}))
    con.close()


def t_guards():
    per = {2024: synth_counts(1)}
    check("held-out: weighting toward 2027 (uses 2026) trips", trips(FD.weighted, per, 2027, 2.0))
    check("held-out: weighted() refuses a 2026 season in the data", trips(FD.weighted, {2026: synth_counts(1)}, 2026, 2.0) or
          trips(FD.weighted, {2026: synth_counts(1)}, 2027, 2.0))
    check("held-out: tuning on 2026 trips", trips(FC.tune, {"D1": per}, "D1", "sep", 2026))
    check("held-out: fit_count.run(valid=2026) trips", trips(FC.run, {"D1": per}, None, ("D1",), ("sep",), 2026, 1, False, False))
    check("held-out: fit_runs.run(valid=2026) trips", trips(FR.run, None, {"D1": per}, ("D1",), 2026, 10, False))
    check("held-out: Single-A proxy season 2026 trips", trips(FP.season_cells, 2026))
    check("held-out: proxy run over 2026 trips", trips(FP.run, (2025, 2026), False))


if __name__ == "__main__":
    t_math()
    t_recency()
    t_borrow()
    W = t_recovery()
    t_json(W)
    t_runs()
    t_text()
    t_fixture()
    t_guards()
    print(f"\n{'FAILED: ' + ', '.join(FAILS) if FAILS else 'all passed'}")
    raise SystemExit(1 if FAILS else 0)
