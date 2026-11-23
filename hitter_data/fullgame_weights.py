"""v1.3 (Drew's Nov 23 ruling 10): weight the college full games so their K / BB / HBP match the whole level.

Per level x season (D1 / D2 / D3, every season the count fit can read, <= 2025): every canonical parsed game counts for the
level's all-games rates (per PA: K incl. dropped-third-strike reaches, BB incl. intentional, HBP; the codes of
hitter_data.represent). The full games (the harness's own list, harness.games_for) get a weight:

  1. a base weight, one of
       conference:  post-stratified on the home school's conference (team_school -> schools.conference; unmapped = its
                    own cell): w = (cell's share of all-games PAs) / (cell's share of full-game PAs); cells with no full
                    game drop out (their PAs are spread over the rest by the normalisation);
       team:        the same on the home team (harness.team_key);
       none:        1;
  2. an exponential tilt w * exp(l . r_g) (r_g = the game's K, BB, HBP per PA; entropy balancing), l solved so the
     weighted full games' K / BB / HBP per PA equal the all-games values exactly.
  Every base matches exactly after the tilt, so "what matches best" is the one that distorts the full games least: the
  base with the largest effective sample size (sum w)^2 / sum w^2 after the tilt. The gaps after each base alone are
  reported too.

Weights are normalised to mean 1 over a level-season's full games (the counts' scale is unchanged). Output:
{DATA}/fits/fullgame_weights/{level}_{season}.json ({game id: weight}) and summary.json (per level-season: games, the
gaps before / after each step, the base chosen, the largest and the effective sample size). 2026 is never read.

    python -m hitter_data.fullgame_weights
"""
import json
import math
import os
import re
import sqlite3
import sys
from collections import defaultdict

import numpy as np
from scipy.optimize import minimize

from . import DATA, assert_not_heldout
from . import harness as H

OUT = os.path.join(DATA, "fits", "fullgame_weights")
LEVELS = ("D1", "D2", "D3")
K_CODES = ("K", "K_S", "K_L", "K_reached", "K_S_reached", "K_L_reached")
BB_CODES = ("BB", "IBB")
VERSION = "w1"


def _norm(n):
    return re.sub(r"[^a-z0-9]", "", (n or "").lower())


def level_season_games(con, level, season):
    """[(game id, home team name, pa, k, bb, hbp)] for every canonical parsed game of the level-season"""
    assert_not_heldout(season)
    rows = con.execute("""SELECT g.id, g.home, COUNT(p.idx), SUM(p.result IN (%s)), SUM(p.result IN (%s)), SUM(p.result = 'HBP')
                          FROM games g JOIN pa p ON p.game_id = g.id
                          WHERE g.canonical = 1 AND g.level = ? AND g.season = ? GROUP BY g.id""" %
                       (",".join("?" * len(K_CODES)), ",".join("?" * len(BB_CODES))),
                       K_CODES + BB_CODES + (level, int(season))).fetchall()
    return [r for r in rows if r[2]]


def rates(w, X, pa):
    tw = (w * pa).sum()
    return (w[:, None] * X).sum(axis=0) / tw


def poststrat(cells_full, pa_full, cells_all, pa_all):
    tot_all = defaultdict(float)
    for c, p in zip(cells_all, pa_all):
        tot_all[c] += p
    tot_full = defaultdict(float)
    for c, p in zip(cells_full, pa_full):
        tot_full[c] += p
    A, F = sum(tot_all.values()), sum(tot_full.values())
    return np.array([(tot_all[c] / A) / (tot_full[c] / F) for c in cells_full])


def tilt(b, X, pa, T):
    """entropy balancing: w = b exp(l . r), r = X / pa, so that sum w X / sum w pa = T. -> (w, l, converged)"""
    r = X / pa[:, None]
    bp = b * pa

    def F(l):
        z = r @ l
        m = z.max()
        e = bp * np.exp(z - m)
        s = e.sum()
        g = (e[:, None] * r).sum(axis=0) / s - T
        return math.log(s) + m - l @ T, g
    res = minimize(F, np.zeros(len(T)), jac=True, method="BFGS", options=dict(gtol=1e-12, maxiter=500))
    z = r @ res.x
    w = b * np.exp(z - z.max())
    return w, res.x, bool(np.abs(rates(w, X, pa) - T).max() < 1e-7)


def season_weights(con, level, season, ts, conf):
    games = level_season_games(con, level, season)
    full_ids = {g["id"] for g in H.games_for(con, level, season)}
    allX = np.array([[g[3], g[4], g[5]] for g in games], float)
    allpa = np.array([g[2] for g in games], float)
    T = allX.sum(axis=0) / allpa.sum()
    fi = [i for i, g in enumerate(games) if g[0] in full_ids]
    if len(fi) < 20:
        return None
    X, pa = allX[fi], allpa[fi]
    home_all = [games[i][1] for i in range(len(games))]
    cells = {"conference": [conf.get(ts.get(_norm(h)), "unmapped") for h in home_all],
             "team": [H.team_key(h) for h in home_all]}
    out = dict(games=len(games), full_games=len(fi), target=T.tolist(), raw=rates(np.ones(len(fi)), X, pa).tolist())
    best = None
    bases = {nm: poststrat([cl[i] for i in fi], pa, cl, allpa) for nm, cl in cells.items()}
    bases["none"] = np.ones(len(fi))
    out["ess_by_base"] = {}
    for nm, b in bases.items():
        out[f"after_{nm}"] = rates(b, X, pa).tolist()
        w, lam, ok = tilt(b, X, pa, T)
        w = w / w.mean()
        ess = float(w.sum() ** 2 / (w ** 2).sum())
        out["ess_by_base"][nm] = round(ess, 1)
        if best is None or ess > best[0]:
            best = (ess, nm, w, lam, ok)
    ess, base_nm, w, lam, ok = best
    out.update(base=base_nm, tilt=lam.tolist(), converged=ok, after_tilt=rates(w, X, pa).tolist(),
               w_max=float(w.max()), w_min=float(w.min()), ess=ess)
    return {games[i][0]: float(wi) for i, wi in zip(fi, w)}, out


def main(argv=()):
    con = H.connect()
    ts = dict(con.execute("SELECT team_norm, school FROM team_school"))
    conf = dict(con.execute("SELECT id, conference FROM schools"))
    os.makedirs(OUT, exist_ok=True)
    summary = {"version": VERSION, "levels": {}}
    for lv in LEVELS:
        summary["levels"][lv] = {}
        for s in range(2000, 2026):
            assert_not_heldout(s)
            if H.prequalify(con, lv, s)["full_games"] <= 0:
                continue
            r = season_weights(con, lv, s, ts, conf)
            if r is None:
                continue
            wmap, info = r
            with open(os.path.join(OUT, f"{lv}_{s}.json"), "w", encoding="utf-8") as f:
                json.dump(wmap, f)
            summary["levels"][lv][s] = info
            g = lambda k: " ".join(f"{x * 100:.2f}" for x in info[k])
            print(f"{lv} {s}: games {info['games']} full {info['full_games']} target {g('target')} raw {g('raw')} "
                  f"conf {g('after_conference')} team {g('after_team')} ess {info['ess_by_base']} base={info['base']} tilt {g('after_tilt')} "
                  f"ess {info['ess']:.0f} wmax {info['w_max']:.2f}", flush=True)
    with open(os.path.join(OUT, "summary.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(summary, f, indent=1)


def load(level, season):
    """{game id: weight} or None (season not weighted)"""
    p = os.path.join(OUT, f"{level}_{int(season)}.json")
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    main(sys.argv[1:])
