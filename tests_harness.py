"""v1.3 Part 4 tests: the scoring harness on a tiny synthetic SQLite fixture (no archive needed). Checks the pitch-event
replay, log-loss math and its exact decomposition, the count chain, the bootstrap, coverage / filters, the v1.2 adapter's
frozen-landing integration, and that the held-out guard trips on 2026 in every scoring and fitting path.
usage: python3 tests_harness.py"""
import math
import os
import sqlite3
import sys
import tempfile

import numpy as np

from hitter_data import HeldOutSeasonError
from hitter_data import harness as H
from hitter_data.harness_adapters import (ASSUMPTIONS, CI, COUNTS, SHAPE, Adapter, Assumption, EmpiricalAdapter,
                                          EngineV12Adapter, RecalAdapter, Tables, check_tables, engine_fingerprint, pa_chain)
from hitter_data import harness_frozen as FZ
from hitter_data import harness_frozen_a as FZA
from hitter_data import harness_freeze as HF
from hitter_data.harness_adapters import HARNESS_ASSUMPTION_VERSION, PRIMARY_ASSUMPTION

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


# ---------- fixture ----------
SCHEMA = """
CREATE TABLE games(id TEXT PRIMARY KEY, season INTEGER, level TEXT, canonical INTEGER, dup_status TEXT, adapter TEXT,
  home TEXT, away TEXT, home_runs TEXT, away_runs TEXT);
CREATE TABLE game_qc(game_id TEXT PRIMARY KEY, pas INTEGER, pas_full INTEGER, pas_zero_count INTEGER);
CREATE TABLE pa(game_id TEXT, idx INTEGER, inning INTEGER, half TEXT, outs_before INTEGER, bases_before TEXT,
  bat_score_before INTEGER, fld_score_before INTEGER, balls INTEGER, strikes INTEGER, pitches TEXT, count_ok INTEGER,
  result TEXT, in_play INTEGER, bip_type TEXT, outs_on_play INTEGER, runs_rest_inning INTEGER, mid_pa_events INTEGER,
  bats TEXT, throws TEXT, PRIMARY KEY(game_id, idx));
"""

# one half-inning template: (outs, bases, balls, strikes, pitches, count_ok, result, in_play, bip, outs_on_play, runs_rest, mid)
HALF = [
    (0, "000", 1, 2, "BKFS", 1, "K_S", 0, None, 1, 1, 0),
    (1, "000", 0, 0, None, None, "1B", 1, "unknown", 0, 1, 0),        # first-pitch single, zero-count in a lettered game
    (1, "100", 2, 1, "BBK", 1, "HR", 1, "fly", 0, 1, 1),              # mid-PA event: no pitch-state runs
    (1, "000", 3, 1, "BKBBB", 1, "BB", 0, None, 0, 0, 0),
    (1, "100", 0, 0, None, None, "SAC", 1, "bunt", 1, 0, 0),          # bunt: excluded from pitch / PA / BIP metrics
    (2, "010", 1, 1, "BS", 1, "GO", 1, "ground", 1, 0, 0),
]


TEAMS = {"g24a": ("Alpha U", "Beta College"), "g24b": ("Beta College", "Alpha U"), "g25a": ("Alpha U", "Gamma State"),
         "g25b": ("University of Gamma State", "Beta College"), "g25dup": ("Gamma State", "Alpha U"),
         "g25partial": ("Beta College", "Gamma State"), "g26a": ("Alpha U", "Beta College")}


def make_db(path):
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    games = [("g24a", 2024, "D1", 1, "Sidearm"), ("g24b", 2024, "D1", 1, "Presto"),
             ("g25a", 2025, "D1", 1, "Sidearm"), ("g25b", 2025, "D1", 1, "Sidearm"),
             ("g25dup", 2025, "D1", 0, "Sidearm"),                     # non-canonical duplicate: never loaded
             ("g25partial", 2025, "D1", 1, "Sidearm"),                 # under 90% lettered: not a full game
             ("g26a", 2026, "D1", 1, "Sidearm")]                       # held out
    for gid, s, lvl, can, plat in games:
        home, away = TEAMS[gid]
        con.execute("INSERT INTO games VALUES (?,?,?,?,?,?,?,?,?,?)", (gid, s, lvl, can, None, plat, home, away, "5", "3"))
        rows = []
        for inn in (1, 2):
            for half in ("top", "bottom"):
                rows += [(inn, half) + r for r in HALF]
        # the game's last half-inning stops after 2 outs (walk-off): drop its final out
        rows = rows[:-1]
        pas = len(rows)
        if gid == "g25partial":
            rows = [r[:6] + (None, None) + r[8:] if i % 2 == 0 else r for i, r in enumerate(rows)]
        for i, r in enumerate(rows):
            inn, half, o, b, bl, st, p, ok, res, ip, bip, oo, rr, mid = r
            con.execute("INSERT INTO pa VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (gid, i, inn, half, o, b, 0, 0, bl, st, p, ok, res, ip, bip, oo, rr, mid, "R", "R"))
        full = sum(1 for r in rows if r[6] is not None)                      # r[6] = pitches
        zero = sum(1 for r in rows if r[6] is None and r[4] == 0 and r[5] == 0)
        con.execute("INSERT INTO game_qc VALUES (?,?,?,?)", (gid, pas, full, zero))
    con.commit()
    con.close()


# ---------- pitch-event replay ----------
def t_replay():
    ev, why = H.pitch_events("BKFS", 1, 2, "K_S", 0, 1)
    check("BKFS strikeout: 4 events, whiff last", ev == [(CI[(0, 0)], 0), (CI[(1, 0)], 2), (CI[(1, 1)], 4), (CI[(1, 2)], 3)], ev)
    ev, why = H.pitch_events(None, 0, 0, "GO", 1, None)
    check("zero-count in play = one in-play pitch at 0-0", ev == [(0, 5)], ev)
    ev, why = H.pitch_events(None, 0, 0, "HBP", 0, None)
    check("zero-count HBP = one HBP pitch at 0-0", ev == [(0, 1)], ev)
    ev, why = H.pitch_events("BKSF", 1, 2, "K_S", 0, 1)
    check("strike three on a foul = foul tip, scored as a whiff", why == "foul_tip" and ev[-1] == (CI[(1, 2)], 3), (ev, why))
    check("a two-strike foul that isn't the last pitch stays a foul", H.pitch_events("BKSFS", 1, 2, "K_S", 0, 1)[0][3] ==
          (CI[(1, 2)], 4))
    ev, why = H.pitch_events("FFFFB", 1, 2, "GO", 1, 1)
    check("fouls stop at two strikes; in play at 1-2", ev and ev[-1] == (CI[(1, 2)], 5) and len(ev) == 6, ev)
    check("replay mismatch dropped", H.pitch_events("BK", 2, 1, "GO", 1, 1)[0] is None)
    check("count_ok=0 dropped", H.pitch_events("BK", 1, 1, "GO", 1, 0)[0] is None)
    check("IBB excluded", H.pitch_events("BBBB", 3, 0, "IBB", 0, 1) == (None, "excluded_result"))
    check("odd letter (N/P) dropped", H.pitch_events("BNK", 1, 1, "GO", 1, 1)[1] == "odd_letter")
    check("walk needs four balls", H.pitch_events("BBB", 2, 0, "BB", 0, 1)[0] is None)
    check("count-only PA (no letters, not 0-0) dropped", H.pitch_events(None, 1, 1, "GO", 1, None)[1] == "no_letters")
    check("side: R vs R same, S vs R opposite, unknown", (H.side_of("R", "R"), H.side_of("S", "R"), H.side_of(None, "R")) == (0, 1, 2))


# ---------- log-loss math and decomposition ----------
class Const(Adapter):
    def __init__(self, p6, name="const"):
        self.p6, self.name = np.asarray(p6, float), name

    def tables(self, lvl):
        P6 = np.broadcast_to(self.p6, SHAPE + (6,)).copy()
        BIP = np.full(SHAPE + (4, 6), 1 / 24)
        return Tables(P6, BIP, np.zeros((3, 8)), np.zeros(12), name=self.name, level=lvl)


def t_logloss(con):
    S = H.build_season(con, "D1", 2025)
    t = Const([0.1, 0.1, 0.2, 0.2, 0.2, 0.2]).tables("D1")      # 5-way: take_ball .2 (ball + HBP), 4 x .2
    L = H.event_losses(S, t)
    check("uniform 5-way -> log loss = log 5 for every pitch", np.allclose(L["pitch_5way"][0], math.log(5)))
    check("uniform out-type -> log 4", np.allclose(L["bip_type_outs"][0], math.log(4)))
    check("runs squared error vs a zero table = mean y^2",
          np.isclose(L["runs_pa_sq"][0].mean(), (S.pa["r_y"] ** 2).mean()))
    t2 = Const([0.30, 0.02, 0.18, 0.12, 0.18, 0.20]).tables("D1")
    L2 = H.event_losses(S, t2)
    tot = L2["pitch_swing_take"][0].sum() + L2["pitch_cstrike_given_take"][0].sum() + L2["pitch_result_given_swing"][0].sum()
    check("decomposition sums exactly to the 5-way loss", np.isclose(tot, L2["pitch_5way"][0].sum()),
          (tot, L2["pitch_5way"][0].sum()))
    check("nll clips zero probability (no inf)", np.isfinite(H.nll(np.array([0.0]))).all())


# ---------- count chain ----------
def chain_ref(p6, b=0, k=0):
    """plain recursion: P(K, BB, HBP, in play) from count (b, k) with per-count p6 = [ball, hbp, cs, whiff, foul, ip]"""
    p = p6[CI[(b, k)]]
    out = np.zeros(4)
    out[1 if b == 3 else 3] += 0  # placeholder for clarity
    if k == 2:
        p = p.copy(); p[4] = 0; p = p / p.sum()
    out[2] += p[1]; out[3] += p[5]
    st = p[2] + p[3] + p[4]
    out += st * (np.array([1, 0, 0, 0]) if k == 2 else chain_ref(p6, b, k + 1))
    out += p[0] * (np.array([0, 1, 0, 0]) if b == 3 else chain_ref(p6, b + 1, k))
    return out


def t_chain():
    rng = np.random.default_rng(3)
    p6 = rng.dirichlet(np.ones(6), size=12)
    P6 = p6.reshape(12, 1, 6)
    phit = np.full((12, 1), 0.3)
    got = pa_chain(P6, phit)[0]
    ref = chain_ref(p6)
    check("count chain = recursion (K, BB, HBP)", np.allclose(got[:3], ref[:3]), (got, ref))
    check("count chain: hit + out = in play", np.isclose(got[3] + got[4], ref[3]))
    check("count chain sums to 1", np.isclose(got.sum(), 1.0))
    allball = np.zeros((12, 1, 6)); allball[..., 0] = 1
    check("always a ball -> walk", np.allclose(pa_chain(allball, phit)[0], [0, 1, 0, 0, 0]))


# ---------- bootstrap ----------
def t_bootstrap(con):
    G = 400
    rng = np.random.default_rng(7)
    W = rng.multinomial(G, np.full(G, 1 / G), size=500).astype(float)
    loss = np.random.default_rng(1).normal(1.0, 0.5, size=G)
    m, se = H.boot_mean(loss, np.ones(G), W)
    check("bootstrap SE ~ sd / sqrt(G) for one event per game", abs(se - 0.5 / math.sqrt(G)) < 0.005, (se, 0.5 / math.sqrt(G)))
    check("bootstrap mean = plain mean", np.isclose(m, loss.mean()))
    m2, se2 = H.boot_mean(loss * 10, np.full(G, 10.0), W)
    check("clustered events: SE by game, not by event", abs(se2 - se) < 1e-9, (se, se2))
    m3, se3 = H.boot_mean(loss - loss, np.ones(G), W)
    check("paired difference of identical adapters: 0 with SE 0", m3 == 0 and se3 == 0)
    S = H.build_season(con, "D1", 2025)
    Ws = H.boot_weights(S, 300, seed=3)
    check("three bootstrap schemes (game, home team, both teams)", set(Ws) == {"game", "home", "team2"} and
          all(w.shape == (300, S.n_games) for w in Ws.values()))
    check("team-name spellings cluster together (University of Gamma State = Gamma State)",
          H.team_key("University of Gamma State") == H.team_key("Gamma State"))
    check("home-team weights are whole draw counts", np.all(Ws["home"] == np.round(Ws["home"])))
    # when every game of a team moves together, the team-clustered SE must be well above the game SE
    Sx = H.Season()
    Sx.n_games, Sx.n_teams = 200, 10
    r = np.random.default_rng(5)
    Sx.home = r.integers(0, 10, 200).astype(np.int32)
    Sx.away = ((Sx.home + 1 + r.integers(0, 9, 200)) % 10).astype(np.int32)
    eff = r.normal(0, 1, 10)
    lg = eff[Sx.home] + eff[Sx.away] + r.normal(0, 0.3, 200)
    Wx = H.boot_weights(Sx, 400, seed=9)
    seg = H.boot_mean(lg, np.ones(200), Wx["game"])[1]
    set2 = H.boot_mean(lg, np.ones(200), Wx["team2"])[1]
    check("team effects: team-clustered SE well above the game SE", set2 > 1.5 * seg, (seg, set2))


# ---------- season build, filters, coverage ----------
def t_build(con):
    S = H.build_season(con, "D1", 2025)
    check("full canonical games only (dup and partial out)", S.games == ["g25a", "g25b"], S.games)
    check("bunt PAs excluded and counted", S.reasons["bunt_pa"] == 8, S.reasons)
    n_pa = len(S.pa["p_y"])
    check("PA metric rows (non-bunt, scored)", n_pa == 2 * (4 * 5 - 1), n_pa)
    check("short half (last PA < 3 outs) excluded from runs (5 PAs per game)", S.reasons["runs_rows_short_half"] == 2 * 5
          and S.reasons["halves_short_final"] == 2 and S.reasons["halves_short_other"] == 0, S.reasons)
    pit = len(S.pit["y"])
    per_half = 4 + 1 + 4 + 5 + 3          # BKFS, zero-count 1B, BBK+inplay, BKBBB, BS+inplay
    check("pitch events counted", pit == 2 * (4 * per_half - 3), pit)
    ok = S.pit["run_ok"]
    check("pitch-state runs: mid-PA and truncated rows excluded", ok.sum() == 2 * (3 * (per_half - 4)), ok.sum())
    q = H.prequalify(con, "D1", 2025)
    check("coverage rule: 2 full games is not enough", q["full_games"] == 2 and not q["maybe"], q)
    check("scheduled innings: 7 -> 7; 8 -> 7; 8 with a 10-run margin -> 9; 9 -> 9",
          (H.scheduled_innings(7, 2), H.scheduled_innings(8, 1), H.scheduled_innings(8, 11), H.scheduled_innings(9, 0)) == (7, 7, 9, 9))
    fc = H.FitCounts.from_season(H.build_season(con, "D1", 2024))
    check("baseline BIP joint normalised per count", np.allclose(fc.bip_count().sum(axis=(1, 2)), 1))
    check("recency weight halves every 2 seasons", np.isclose(H.recency_weight(2022, 2025), 0.5)
          and np.isclose(H.recency_weight(2024, 2025), 1.0))
    fit = {"D1": fc}
    const = Const([0.1, 0.1, 0.2, 0.2, 0.2, 0.2])
    rec = RecalAdapter(const, fit, [2024])
    t = rec.tables("D1")
    n = fc.ev6_ctx.sum(-1)
    mean = (t.P6 * n[..., None]).reshape(12, -1, 6).sum(1) / np.maximum(n.reshape(12, -1).sum(1)[:, None], 1e-12)
    tgt = fc.ev6_ctx.reshape(12, -1, 6).sum(1) + 0.5
    tgt = tgt / tgt.sum(1, keepdims=True)
    seen = n.reshape(12, -1).sum(1) > 0
    check("recalibration is mean-preserving per count on the fit contexts", np.allclose(mean[seen], tgt[seen], atol=1e-6))
    ads = [const, rec] + [EmpiricalAdapter(k, fit, [2024]) for k in ("flat", "count", "count_bo")]
    res = H.score_season(S, ads, ["const_recal", "base_count"], B=50, seed=2)
    check("score_season returns every metric", set(res) >= {"pitch_5way", "pa_5way", "bip_type_outs", "bip_result",
                                                            "runs_pa_sq", "runs_pitch_state_sq", "pitch_swing_take"}, list(res))
    check("differences against every reference", set(res["pitch_5way"]["diff"]) == {"const_recal", "base_count"} and
          "const" in res["pitch_5way"]["diff"]["base_count"])
    check("by-count differences carry an SE", all(len(v) == 2 for v in res["pitch_5way"]["by_count_diff"]["const"].values()))
    check("baseline fit on the same pattern beats uniform", res["pitch_5way"]["adapters"]["base_count"][0] <
          res["pitch_5way"]["adapters"]["const"][0])
    for a in ads:
        check(f"tables sane: {a.name}", not check_tables(a.tables("D1")), check_tables(a.tables("D1")))
    bad = EmpiricalAdapter("count", fit, [2024, 2025])
    try:
        H.score_season(S, [bad], ["base_count"], B=5)
        refused = False
    except ValueError:
        refused = True
    check("in-sample scoring refused (adapter fit on the scored season)", refused)


# ---------- held-out guard ----------
def t_heldout(con, dbpath):
    check("games_for trips on 2026", trips(H.games_for, con, "D1", 2026))
    check("build_season trips on 2026", trips(H.build_season, con, "D1", 2026))
    check("prequalify trips on 2026", trips(H.prequalify, con, "D1", 2026))
    check("selection_check trips on 2026", trips(H.selection_check, con, "D1", 2026))
    check("fit_seasons_for: never the scored season or later (D3 2024 never fits on 2025)",
          H.fit_seasons_for(con, "D3", 2024, [2016, 2023, 2024, 2025]) == [2016, 2023])
    check("fit_seasons_for trips if 2026 is in range", trips(H.fit_seasons_for, con, "D1", 2027, [2025, 2026]))
    check("CLI trips on --seasons 2026", trips(H.main, ["--db", dbpath, "--levels", "D1", "--seasons", "2026"]))
    check("CLI trips on a range reaching 2026", trips(H.main, ["--db", dbpath, "--levels", "D1", "--seasons", "2024-2026"]))
    check("CLI trips on --fit-seasons 2026", trips(H.main, ["--db", dbpath, "--levels", "D1", "--seasons", "2025",
                                                             "--fit-seasons", "2026", "--ignore-coverage", "--boot", "5"]))
    check("unknown season refused", trips(H.build_season, con, "D1", None))


# ---------- assumptions and the v1.2 adapter ----------
def t_mix_and_v12():
    for an in ASSUMPTIONS:
        A = Assumption(an)
        sums = [sum(r[4] for r in A.mix(lv, sd, b, k)) for lv in ("D1", "D2", "D3") for sd in ("same", "opp")
                for b, k in COUNTS]
        check(f"assumption {an}: mix sums to 1 everywhere", np.allclose(sums, 1))
    check("frozen calib world: every (arsenal, pitch) exists",
          all(r[1] < len(FZ.ARSENALS[r[0]]) for v in FZ.MIX.values() for rows in v.values() for r in rows))
    check("frozen calib world: no chase target at 3-0 (the engine's own calls)",
          all(r[2] != "chase" for r in FZ.MIX["D1"][("same", (3, 0))]))
    ad = EngineV12Adapter("college_d1", assumption="handset")
    e = ad.e
    p6, bip = ad.cell("D1", 1, 1, 0, 1, True, False)
    ars = ad.arsenal("H")
    s = e.Situation(1, 1, 0, (True, False, False), level="college_d1", same_side=True)
    agg = {}
    for a, j, q, z, w in Assumption("handset").mix("D1", "same", 1, 1):
        agg[(j, q)] = agg.get((j, q), 0) + w
    ref = np.zeros(6)
    # the handset assumption lands each (kind, target) on the frozen h1 shares (harness_landing.py), not on today's
    # engine.landing (the v1.3 refit changed the landing model): integrate outcome_probs over those same shares
    from hitter_data.harness_landing import LANDING as LANDING_H1, ZONES as LZ
    orig_landing = e.landing
    try:
        e.landing = lambda p_, q_, s_: dict(zip(LZ, LANDING_H1["D1"][p_.kind][q_]))
        Ps = {(j, q): e.outcome_probs(ars[j], q, s, ars) for (j, q) in agg}
    finally:
        e.landing = orig_landing
    for (j, q), w in agg.items():
        P = Ps[(j, q)]
        ref += w * np.array([P["ball"] + P["wp_ball"], P["hbp"], P["cstrike"], P["whiff"], P["foul"],
                             P["weak"] + P["solid"] + P["hard"]])
    check("one-zone integration reproduces v1.2's own outcome_probs (handset, D1, 1-1)",
          np.allclose(p6, ref / ref.sum(), atol=1e-5), (p6, ref))
    check("engine.landing restored after the adapter", e.landing.__name__ == "landing")
    check("v1.2 BIP joint normalised", np.isclose(bip.sum(), 1))
    a1 = EngineV12Adapter("college_d1")
    a3 = EngineV12Adapter("college_d3")
    p6d2, _ = a3.cell("D2", 1, 1, 0, 1, True, False)
    p6d1, _ = a1.cell("D2", 1, 1, 0, 1, True, False)
    check("D2 scored at D1 and at D3 settings gives different answers", not np.allclose(p6d2, p6d1))
    fp = engine_fingerprint()
    check("engine fingerprint: sha and OUTCOME_ADJ hash", bool(fp["engine_sha"]) and len(fp["outcome_adj_sha256"]) == 16, fp)


# ---------- ruling 9: the landing re-frozen from Single-A (harness h3) ----------
def t_single_a():
    check("harness version bumped to h3 (Single-A landing) and single_a is the primary assumption",
          HARNESS_ASSUMPTION_VERSION.startswith("h3-singleA") and PRIMARY_ASSUMPTION == "single_a" and ASSUMPTIONS[0] == "single_a"
          and Assumption().name == "single_a" and EngineV12Adapter("college_d1").assumption.name == "single_a")
    check("the calib-world landing stays available (side report): calib_world in ASSUMPTIONS, v1.2 named v1.2[calib_world]",
          "calib_world" in ASSUMPTIONS and EngineV12Adapter("college_d1", assumption="calib_world").name == "v1.2[calib_world]")
    check("Single-A landing built from seasons 2021-2025 only (2026 never loaded)",
          sorted(FZA.SINGLE_A_SEASONS) == [2021, 2022, 2023, 2024, 2025])
    check("single_a_targets trips on 2026", trips(HF.single_a_targets, seasons=(2025, 2026)))
    cls_of = lambda a, j: "FB" if FZ.ARSENALS[a][j]["kind"] in HF.FASTBALL_KINDS else "OS"
    worst = 0.0
    for lv in ("D1", "D2", "D3"):
        for key, rows in FZA.MIX[lv].items():
            m = {}
            for a, j, q, z, w in rows:
                m[(cls_of(a, j), z)] = m.get((cls_of(a, j), z), 0.0) + w
            tgt = FZA.TARGETS[key]
            worst = max(worst, max(abs(m.get(k_, 0.0) - tgt.get(k_, 0.0)) for k_ in set(m) | set(tgt)))
    check("re-frozen landing: per level x side x count the class x band shares equal Single-A's (within 1e-5)", worst < 1e-5, worst)
    same_rows = all({r[:3] for r in FZA.MIX[lv][key]} <= {r[:3] for r in FZ.MIX[lv][key]} for lv in FZA.MIX for key in FZA.MIX[lv])
    check("re-frozen landing keeps the calib world's pitchers, pitches and targets (only the landed-zone weights move)", same_rows)
    heart30 = sum(w for a, j, q, z, w in Assumption("single_a").mix("D1", "same", 3, 0) if z == "heart")
    heart30c = sum(w for a, j, q, z, w in Assumption("calib_world").mix("D1", "same", 3, 0) if z == "heart")
    check("3-0 heart share: Single-A-like (about .24) under single_a, heart-heavy (about .44) under calib_world",
          0.18 < heart30 < 0.30 and heart30c > 0.38, (heart30, heart30c))
    # reweight on a synthetic mix: cells hit their targets, composition kept within a cell, unreachable mass reported
    rows = [(0, 0, "middle", "heart", 0.3), (0, 0, "up-in", "heart", 0.1), (0, 0, "middle", "edge", 0.2), (0, 1, "chase", "off", 0.4)]
    cl = lambda a, j: "FB" if j == 0 else "OS"
    out, lost = HF.reweight(rows, cl, {("FB", "heart"): 0.5, ("FB", "edge"): 0.3, ("OS", "off"): 0.15, ("OS", "heart"): 0.05})
    d = {r[:4]: r[4] for r in out}
    check("reweight: synthetic cells scaled to their targets, within-cell composition kept, unreachable share reported",
          np.isclose(lost, 0.05) and np.isclose(sum(d.values()), 1) and np.isclose(d[(0, 0, "middle", "heart")] / d[(0, 0, "up-in", "heart")], 3)
          and np.isclose(d[(0, 0, "middle", "edge")], 0.3 / 0.95), d)


if __name__ == "__main__":
    tmp = tempfile.mkdtemp()
    dbpath = os.path.join(tmp, "fixture.sqlite3")
    make_db(dbpath)
    con = H.connect(dbpath)
    t_replay()
    t_logloss(con)
    t_chain()
    t_bootstrap(con)
    t_build(con)
    t_heldout(con, dbpath)
    t_mix_and_v12()
    t_single_a()
    con.close()
    print(f"\n{'FAILED ' + str(len(FAILS)) if FAILS else 'all passed'}")
    sys.exit(1 if FAILS else 0)
