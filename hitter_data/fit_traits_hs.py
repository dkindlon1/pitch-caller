"""v1.3 Part 3.3 / 3.4, HS / travel (Perfect Game): the level "hs" loader for fit_situation and fit_traits.
One model for HS and travel (plan section 11, Drew Nov 21); bat type is not read. PROVISIONAL.

Hitter key = hs | season | Perfect Game player id (hs_pa.batter_id): one key per player per season across teams, and
the same id across seasons (prefill and the season-to-season check link players by id, across teams).
Team id = n:<printed team name>; PG team names are event-specific ("... 17U ..."), so team strength is per event team.
Late and close uses 7 scheduled innings for every game (pool games often stop early on the time limit, so "late" is
often never reached: a format confound reported next to the situation fits).
2026 is never loaded."""
import os
from collections import Counter

import numpy as np

from . import DATA, assert_not_heldout
from .fit_traits_data import SeasonData, _build, _int, norm_team
from .harness import team_key

HS_LEVEL = "hs"
HS_DB = os.path.join(DATA, "hs", "hs.sqlite3")
HS_SCHED = 7
HS_GAME_SQL = """SELECT g.game_id, g.game_date, g.home_team, g.away_team, g.home_runs, g.away_runs, q.full_log,
                        g.ended_before_7, g.phase, g.age_group, g.level
                 FROM hs_games g JOIN hs_game_qc q ON q.game_id = g.game_id
                 WHERE g.season = ? ORDER BY g.game_date, g.game_id"""
HS_PA_COLS = ("game_id", "idx", "inning", "half", "bat_side", "batter", "batter_id", "pitcher", "pitcher_id", "slot",
              "outs_before", "bases_before", "bat_score_before", "fld_score_before", "balls", "strikes", "pitches",
              "result", "in_play", "bip_type", "bip_dir", "bats", "throws")


def load_hs_season(con, season, max_games=None, full_length_only=False):
    """-> SeasonData (same arrays as the college loader). S.g_full = full_log (pitch log within 2 of the box); with
    full_length_only, also only games that reached the 7th (ended_before_7 = 0)."""
    season = assert_not_heldout(season)
    games = con.execute(HS_GAME_SQL, (season,)).fetchall()
    if max_games:
        games = games[:max_games]
    S = SeasonData()
    S.level, S.season = HS_LEVEL, season
    S.g_id = [g[0] for g in games]
    S.g_date = [g[1] or "" for g in games]
    S.g_full = np.array([bool(g[6]) and not (full_length_only and g[7]) for g in games], dtype=bool)
    S.g_early_end = np.array([bool(g[7]) for g in games], dtype=bool)
    S.g_phase = [g[8] or "unknown" for g in games]
    S.g_home = [team_key(g[2]) for g in games]
    S.g_away = [team_key(g[3]) for g in games]
    gidx = {g[0]: i for i, g in enumerate(games)}
    printed = {g[0]: (g[2], g[3]) for g in games}
    runs = {g[0]: (_int(g[4]), _int(g[5])) for g in games}
    age = {g[0]: (g[9] or "") for g in games}
    rows = []
    q = f"SELECT {', '.join(HS_PA_COLS)} FROM hs_pa WHERE game_id IN ({{}}) ORDER BY game_id, idx"
    for i in range(0, len(S.g_id), 400):
        part = S.g_id[i:i + 400]
        rows.extend(con.execute(q.format(",".join("?" * len(part))), part).fetchall())
    reasons = Counter()
    recs = []
    team_runs = {}
    for r in rows:
        d = dict(zip(HS_PA_COLS, r))
        home, away = printed[d["game_id"]]
        d["tid"] = "n:" + (norm_team(home if d["bat_side"] == "home" else away) or "?")
        pid = str(d["batter_id"] or "").strip()
        d["hkey"] = f"{HS_LEVEL}|{season}|{pid}" if pid else None
        if not pid:
            reasons["no_player_id"] += 1
        d["hname"] = ("", "")
        pk = str(d["pitcher_id"] or "").strip() or d["pitcher"]
        d["pk"] = (d["game_id"], d["bat_side"], pk) if pk else None
        d["cat"] = age[d["game_id"]]
        hr, ar = runs[d["game_id"]]
        team_runs[(d["game_id"], d["bat_side"])] = (d["tid"], hr if d["bat_side"] == "home" else ar)
        recs.append(d)
    S.team_games = [(tid, gidx[gid], rr) for (gid, _), (tid, rr) in team_runs.items() if rr is not None]
    S.n_pa_ambiguous, S.n_ambiguous_groups = sum(1 for d in recs if d["hkey"] is None), 0
    return _build(S, recs, gidx, {gid: HS_SCHED for gid in gidx}, reasons)


def connect_hs(path=HS_DB):
    import sqlite3
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def load_any(cons, level, season, max_games=None, **kw):
    """cons: a connection (college levels) or {"college": con, "hs": con}; level "hs" reads the HS archive copy"""
    if isinstance(cons, dict):
        con = cons.get(HS_LEVEL if level == HS_LEVEL else "college")
    else:
        con = cons
    if level == HS_LEVEL:
        return load_hs_season(con, season, max_games=max_games, **kw)
    from .fit_traits_data import load_season
    return load_season(con, level, season, max_games=max_games)
