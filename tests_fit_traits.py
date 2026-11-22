"""v1.3 Part 3.3 / 3.4 tests: situation-effect fits (hitter_data.fit_situation) and hitter-trait fits
(hitter_data.fit_traits) on a synthetic SQLite fixture. No archive data, no real names.
Checks: hitter keys and the ambiguous-name rule, the MNL (count-only = per-count frequencies; a planted effect is
recovered and scored as a validation gain; a null effect is not), per-hitter trait recovery, split-half reliability,
priors, presets, prefill files, and that 2026 trips the held-out guard in every path.
usage: python3 tests_fit_traits.py"""
import json
import os
import shutil
import sqlite3
import sys
import tempfile

import numpy as np

from hitter_data import HeldOutSeasonError
from hitter_data import fit_situation as FS
from hitter_data import fit_traits as FT
from hitter_data import fit_traits_data as FD

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


SCHEMA = """
CREATE TABLE games(id TEXT PRIMARY KEY, date_iso TEXT, season INTEGER, level TEXT, canonical INTEGER, home TEXT,
  away TEXT, home_runs TEXT, away_runs TEXT);
CREATE TABLE game_qc(game_id TEXT PRIMARY KEY, pas INTEGER, pas_full INTEGER, pas_zero_count INTEGER);
CREATE TABLE pa(game_id TEXT, idx INTEGER, inning INTEGER, half TEXT, bat_side TEXT, batter TEXT, pitcher TEXT,
  slot INTEGER, outs_before INTEGER, bases_before TEXT, bat_score_before INTEGER, fld_score_before INTEGER,
  balls INTEGER, strikes INTEGER, pitches TEXT, count_ok INTEGER, result TEXT, in_play INTEGER, bip_type TEXT,
  bip_dir TEXT, bats TEXT, throws TEXT, bat_school TEXT, PRIMARY KEY(game_id, idx));
"""
LAST = ["Alder", "Birch", "Cedar", "Dogwood", "Elm", "Fir", "Gum", "Hazel", "Ivy"]
TEAMS = [f"Team {c}" for c in "ABCDEFGHIJ"]
RISP_SWING = 0.8          # planted: logit(swing) + 0.8 with a runner on second or third (no late-and-close effect)


def sg(x):
    return 1 / (1 + np.exp(-x))


def truth(rng):
    """true traits (logits) for 10 teams x 9 hitters; the same players both seasons"""
    return {k: rng.normal(0, s, size=(10, 9)) for k, s in (("early", 0.6), ("contact", 0.5), ("power", 0.6),
                                                            ("spray", 0.5), ("two", 0.5))}


def sim_pa(rng, tr, t, s, risp):
    """one PA's letters and result for team t, slot s"""
    b = k = 0
    letters = ""
    while True:
        early = (b, k) in ((0, 0), (1, 0), (0, 1))
        a = -0.3 + 0.5 * k - 0.2 * (b == 3) + (tr["early"][t, s] if early else 0) + (RISP_SWING if risp else 0) + (tr["two"][t, s] if k == 2 else 0)
        if rng.random() < sg(a):
            if rng.random() < sg(-1.1 - tr["contact"][t, s]):
                letters += "S"; k += 1
                if k == 3:
                    return letters, "K_S", 0, b, 2
            elif rng.random() < sg(-0.2 + (tr["two"][t, s] if k == 2 else 0)):
                letters += "F"; k = min(k + 1, 2)
            else:
                return letters, None, 1, b, k
        else:
            if rng.random() < 0.62:
                letters += "B"; b += 1
                if b == 4:
                    return letters, "BB", 0, 3, k
            else:
                letters += "K"; k += 1
                if k == 3:
                    return letters, "K_L", 0, b, 2


def make_db(path, seed=3):
    rng = np.random.default_rng(seed)
    tr = truth(rng)
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    gn = 0
    for season in (2023, 2024, 2025, 2026):
        n_games = 8 if season == 2026 else 220
        for gi in range(n_games):
            ht, at = rng.choice(10, size=2, replace=False)
            gid = f"g{season}_{gi}"
            gn += 1
            rows = []
            score = {"home": 0, "away": 0}
            nxt = {"home": 0, "away": 0}
            for inn in range(1, 10):
                for half, side, t in (("top", "away", at), ("bottom", "home", ht)):
                    outs = 0
                    while outs < 3:
                        s = nxt[side] % 9
                        nxt[side] += 1
                        bases = "".join("1" if rng.random() < 0.25 else "0" for _ in range(3))
                        risp = bases[1] == "1" or bases[2] == "1"
                        letters, res, ip, bl, st = sim_pa(rng, tr, t, s, risp)
                        bip_dir = None
                        if ip:
                            u = rng.random()
                            ph = sg(-2.0 + tr["power"][t, s])
                            res = "2B" if u < ph else ("1B" if u < ph + 0.2 else "GO")
                            pull = rng.random() < sg(tr["spray"][t, s])
                            bip_dir = ("L" if s % 2 == 0 else "R") if pull else ("R" if s % 2 == 0 else "L")
                            letters = letters
                        name = f"{'ABCDEFGHI'[s]}. {LAST[s]}"
                        if t == 0 and s == 1:
                            name = f"Q. {LAST[0]}"            # two players share a last name on team 0 ...
                        if t == 0 and s == 2 and gi % 10 == 0:
                            name = LAST[0].upper()            # ... and a bare-name line is ambiguous between them
                        if t == 1 and s == 3 and gi % 3 == 0:
                            name = LAST[3].upper()            # a bare name with one initial on the team: merged
                        if res in ("K_S", "K_L", "GO"):
                            outs += 1
                        if res == "2B" and rng.random() < 0.5:
                            score[side] += 1
                        rows.append((gid, len(rows), inn, half, side, name, f"P{t}", s + 1, min(outs, 2), bases,
                                     score[side], score["home" if side == "away" else "away"], bl, st, letters or None,
                                     1, res, ip, "ground" if res == "GO" else ("line" if ip else None), bip_dir,
                                     "R" if s % 2 == 0 else "L", "R", str(t) if t < 5 else None))
            for r in rows:
                con.execute("INSERT INTO pa VALUES (" + ",".join("?" * 23) + ")", r)
            con.execute("INSERT INTO games VALUES (?,?,?,?,?,?,?,?,?)",
                        (gid, f"{season}-03-{1 + gi % 28:02d}", season, "D1", 1, TEAMS[ht], TEAMS[at],
                         str(score["home"]), str(score["away"])))
            con.execute("INSERT INTO game_qc VALUES (?,?,?,?)", (gid, len(rows), len(rows), 0))
    con.commit()
    con.close()
    return tr


def t_units():
    rng = np.random.default_rng(1)
    nH = 200
    true = rng.normal(0, 0.5, nH)
    h = np.repeat(np.arange(nH), 400)
    off = rng.normal(-0.2, 0.5, len(h))
    y = (rng.random(len(h)) < sg(off + true[h])).astype(int)
    b, se, n = FT.estimate(h, off, y, nH)
    check("estimate: per-hitter offsets recovered (corr > 0.9)", np.corrcoef(b, true)[0, 1] > 0.9, np.corrcoef(b, true)[0, 1])
    z = (b - true) / se
    check("estimate: SEs calibrated (sd of z in 0.85-1.15)", 0.85 < z.std() < 1.15, z.std())
    check("estimate: a hitter with no data stays at 0 with a huge SE", FT.estimate(np.array([0]), np.array([0.]), np.array([1]), 2)[1][1] > 100)
    sh, sse, R = FT.shrink(np.array([1.0, 1.0]), np.array([0.1, 1.0]), np.array([0.0, 0.0]), 0.25)
    check("shrink: a precise estimate moves less", sh[0] > sh[1] and abs(R[0] - 0.25 / 0.26) < 1e-12, (sh, R))
    # MNL: count-only reproduces per-count frequencies; a planted feature effect is recovered
    ci = np.repeat(np.arange(12), 2)
    x = np.tile([0.0, 1.0], 12)
    beta_true = np.array([0.0, 0.7, -0.4, 0.2])
    eta = np.zeros((24, 5))
    eta[:, 1:] = rng.normal(0, 0.3, (12, 4))[ci] + x[:, None] * beta_true
    P = np.exp(eta) / np.exp(eta).sum(axis=1, keepdims=True)
    N = P * 1e6
    m0 = FS.MNL([], 5).fit(ci, np.zeros((24, 0)), N)
    lp0 = m0.logp(ci, np.zeros((24, 0)))
    freq = np.array([N[ci == c].sum(axis=0) / N[ci == c].sum() for c in range(12)])
    check("MNL with no features = per-count frequencies", np.abs(np.exp(lp0) - freq[ci]).max() < 1e-5,
          np.abs(np.exp(lp0) - freq[ci]).max())
    m1 = FS.MNL(["x"], 5).fit(ci, x[:, None], N)
    check("MNL recovers a planted feature effect (small ridge)", np.abs(m1.beta[0] - beta_true).max() < 1e-2, m1.beta)
    # cells round-trip
    c = FS.pitch_cells(np.array([7]), np.array([20]), np.array([1]), np.array([0]), np.array([3]), np.array([5]))
    d = [v[c][0] for v in FS.decode_pitch_cells()]
    check("pitch cell encode / decode round-trip", d == [7, 20, 1, 0, 3, 5], d)
    f = FS.features(np.array([2, 2]), np.array([0, 18]), np.array([0, 0]), np.array([0, 0]), np.array([2, 3]))
    check("tto is a smooth quadratic in bf / 9 (no step)", list(f["tto_x"]) == [0, 2] and list(f["tto_x2"]) == [0, 4])
    check("prev terms split by two strikes (count 0-2)", f["prev_whiff_2s"][0] == 1 and f["prev_foul_2s"][1] == 1
          and f["prev_whiff_lt2"].sum() == 0)
    Z = {"early": rng.normal(0, 1, 1000), "contact": rng.normal(0, 1, 1000), "power": rng.normal(0, 1, 1000),
         "two_strike": rng.normal(0, 1, 1000), "spray": rng.normal(0, 1, 1000), "pa": np.full(1000, 200)}
    pr = FT.presets(Z)
    check("presets: six groups of 15%", set(pr) == set(FT.SIM_PRESETS) and all(abs(v["n"] - 150) <= 1 for v in pr.values()),
          {k: v["n"] for k, v in pr.items()})
    check("presets: aggressive_early mean early > 1.3, patient < -1.3",
          pr["aggressive_early"]["fit"]["early"] > 1.3 and pr["patient"]["fit"]["early"] < -1.3)


def t_guard(con, out):
    check("held-out: load_season(2026) trips", trips(FD.load_season, con, "D1", 2026))
    check("held-out: fit_situation.run_level with a 2026 fit season trips", trips(FS.run_level, con, "D1", [2025, 2026], B=5, log=lambda *a: None))
    check("held-out: fit_traits.run_level training on 2026 trips", trips(FT.run_level, con, "D1", [2026], [2025], log=lambda *a: None, out_dir=out))
    check("held-out: fit_traits.run_level prefilling 2026 trips", trips(FT.run_level, con, "D1", [2024], [2026], log=lambda *a: None, out_dir=out))
    check("held-out: fit_traits main --prefill 2026 trips", trips(FT.main, ["--prefill", "2026", "--levels", "D1", "--out", out]))
    check("held-out: fit_situation.fit_years_for never reaches 2026", max(FS.fit_years_for("D1")) == 2024)


def t_keys(con):
    S = FD.load_season(con, "D1", 2025)
    keys = S.hitters
    t0 = [k for k in keys if k.startswith("D1|2025|s:0|" + LAST[0].lower())]
    check("two players with one last name keep two keys (initials)", len(t0) == 2, t0)
    check("bare name with two initials on the team is ambiguous (-1)", S.n_pa_ambiguous > 0 and S.n_ambiguous_groups == 1,
          (S.n_pa_ambiguous, S.n_ambiguous_groups))
    t1 = [k for k in keys if k.startswith("D1|2025|s:1|" + LAST[3].lower())]
    check("bare name with one initial on the team is merged into it", t1 == ["D1|2025|s:1|dogwood|d"], t1)
    check("teams without a school id are keyed by printed name", any(k.startswith("D1|2025|n:teamj|") for k in keys))
    check("key format level|season|team|last|initial", all(len(k.split("|")) == 5 for k in keys))
    check("pitcher batters faced starts at 0 and grows", S.pit["bf"].min() == 0 and S.pit["bf"].max() == FD.BF_CAP)
    check("previous pitch: none only at 0-0", set(np.unique(S.pit["ci"][S.pit["prev"] == 0])) == {0})
    return S


def t_situation(con):
    res = FS.run_level(con, "D1", [2023, 2024], B=60, log=lambda *a: None)
    p = res["pitch"]
    r = p["effects"]["risp"]["gain_alone"]
    check("planted risp effect: validation gain > 0 and > 2 SE", r["gain"] > 0 and r["gain"] > 2 * r["se_max"], r)
    check("planted risp effect: swing rate higher with RISP", p["effect_sizes"]["risp"]["swing"] > 0.05,
          p["effect_sizes"]["risp"])
    lc = p["effects"]["late_close"]["gain_alone"]
    check("null late_close effect: no gain beyond 2 SE", lc["gain"] < 2 * lc["se_max"] + 1e-4, lc)
    check("bar uses the harness minimum effect", res["bar"]["min_effect"] == 0.002)
    check("every effect reports alone and drop-one gains and slot-adjusted gains",
          all({"gain_alone", "gain_drop_one"} <= set(v) for v in p["effects"].values()) and set(p["given_slot"]) == set(FS.EFFECTS))
    check("fit seasons recorded, 2025 validation only", set(res["fit_seasons"]) == {2023, 2024} and res["valid_season"] == 2025)


def t_traits(con, tr, out):
    res = FT.run_level(con, "D1", [2023, 2024], [2025], log=lambda *a: None, out_dir=out)
    pr = res["params"]
    check("early: positive talent SD and split-half reliability", pr["early"]["tau"] > 0.2 and
          pr["early"]["reliability_train"]["spearman_brown"] > 0.3, pr["early"].get("reliability_train"))
    check("early: talent SD near the planted 0.6 (0.4-0.8)", 0.4 < pr["early"]["tau"] < 0.8, pr["early"]["tau"])
    check("power: positive reliability", pr["power"]["reliability_train"]["spearman_brown"] > 0.2, pr["power"]["reliability_train"])
    check("prior has slots 1-9 and three team-strength slopes", len(pr["early"]["prior"]["slot"]) == 9
          and len(pr["early"]["prior"]["team_z_slope"]) == 3)
    pf = res["prefill"]["2025"]
    check("prefill written", os.path.exists(pf["path"]) and pf["hitters"] > 80, pf)
    d = json.load(open(pf["path"], encoding="utf-8"))
    check("prefill meta: provisional, units, pooled seasons <= 2025", d["meta"]["provisional"] is True
          and max(d["meta"]["pooled_seasons"]) == 2025 and "hitter SD" in d["meta"]["units"])
    # recovery: shrunk early value vs planted truth for hitters keyed with initials
    est, tru = [], []
    for k, v in d["hitters"].items():
        _, _, tid, last, ini = k.split("|")
        if not tid.startswith("s:") or v["pa_season"] < 60 or last not in [x.lower() for x in LAST]:
            continue
        t, s = int(tid[2:]), "abcdefghi".index(ini) if ini in "abcdefghi" else None
        if s is None or (t == 0 and s in (0, 1, 2)):
            continue
        est.append((v["traits"]["early"]["value"], v["traits"]["contact"]["value"], v["traits"]["power"]["value"]))
        tru.append((tr["early"][t, s], tr["contact"][t, s], tr["power"][t, s]))
    est, tru = np.array(est), np.array(tru)
    c = [np.corrcoef(est[:, j], tru[:, j])[0, 1] for j in range(3)]
    check("prefill recovers planted early / contact / power (corr > 0.6 each)", min(c) > 0.6, c)
    check("trait units: early SD across hitters near 1 x reliability", 0.5 < est[:, 0].std() < 1.3, est[:, 0].std())
    one = next(iter(d["hitters"].values()))
    check("prefill record has value / se / prior for each trait", all({"value", "se", "prior"} <= set(one["traits"][t])
                                                                      for t in FT.TRAITS if t in one["traits"]))
    check("two-strike composite: swing and foul parts both carry talent", pr["ts_swing"].get("tau", 0) > 0.2
          and pr["ts_foul"].get("tau", 0) > 0.2, (pr["ts_swing"].get("tau"), pr["ts_foul"].get("tau")))
    check("presets sized from fixture hitters (six groups)", res["presets"] and set(res["presets"]) == set(FT.SIM_PRESETS))
    check("trait sizes compared with the placeholders", res["trait_size_vs_placeholder"]["early"]["placeholder"] == 0.35)


def main():
    tmp = tempfile.mkdtemp(prefix="fit_traits_test_")
    try:
        db = os.path.join(tmp, "fixture.sqlite3")
        tr = make_db(db)
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        out = os.path.join(tmp, "fits")
        t_units()
        t_guard(con, out)
        t_keys(con)
        t_situation(con)
        t_traits(con, tr, out)
        con.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"{len(FAILS)} failed" if FAILS else "all passed")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
