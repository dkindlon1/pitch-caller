"""v1.3 Part 3 (plan 3.3 / 3.4): one level-season of college plate appearances as flat numpy arrays, for the situation
fits (fit_situation.py) and the hitter-trait fits (fit_traits.py). PROVISIONAL machinery: it runs on the data in hand.

Hitter key (docs/FITS_TRAITS_v13.md section 1): level | season | team id | last name | first initial.
- team id = pa.bat_school (the school directory id from update.py's team_school map) when present, else
  "n:" + the printed batting team name normalised (update.norm_team).
- name = parse.name_key(batter) = (last, first initial or "").
- Within one team-season, a last name printed bare ("DOE") is merged into the single initial seen with it ("J. Doe").
  When two or more initials share the last name, the bare-name PAs are AMBIGUOUS: they get hitter -1 and are counted.
- Undetectable: two players with the same last name and initial on one team, and one school printed two ways
  (two team ids).

2026 is never loaded: load_season calls assert_not_heldout first."""
import re
from collections import Counter, defaultdict

import numpy as np

from . import assert_not_heldout
from .harness import BUNT_RESULTS, EXCLUDED_RESULTS, HITS, is_full, pitch_events, scheduled_innings, team_key
from .harness_adapters import CI, bases_index
from .parse import name_key

PREV = ("none", "take", "whiff", "foul")       # the previous pitch in the PA (take = ball or called strike)
BF_CAP = 36                                     # pitcher batters faced before this PA, capped (4 times through)
DIRS = {"L": -2, "LC": -1, "C": 0, "RC": 1, "R": 2}


def norm_team(t):
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\(.*?\)", "", (t or "").lower()))


def team_id(bat_school, printed):
    if bat_school not in (None, ""):
        return "s:" + str(bat_school)
    return "n:" + (norm_team(printed) or "?")


def _int(x):
    try:
        return int(str(x).strip())
    except (TypeError, ValueError):
        return None


GAME_SQL = """SELECT g.id, g.date_iso, g.home, g.away, g.home_runs, g.away_runs, q.pas, q.pas_full, q.pas_zero_count
              FROM games g JOIN game_qc q ON q.game_id = g.id
              WHERE g.canonical = 1 AND g.level = ? AND g.season = ? ORDER BY g.date_iso, g.id"""
PA_COLS = ("game_id", "idx", "inning", "half", "bat_side", "batter", "pitcher", "slot", "outs_before", "bases_before",
           "bat_score_before", "fld_score_before", "balls", "strikes", "pitches", "count_ok", "result", "in_play",
           "bip_type", "bip_dir", "bats", "throws", "bat_school")


class SeasonData:
    """Arrays for one level-season. pit_* per usable pitch, bip_* per non-bunt ball in play, pa_* per PA with a
    hitter. g = game index, h = hitter index (-1 ambiguous)."""


def _arr(d, dtypes):
    return {k: np.asarray(v, dtype=dtypes.get(k, np.int16)) for k, v in d.items()}


def load_season(con, level, season, max_games=None):
    """-> SeasonData. Every canonical game of the level-season; S.g_full marks the harness's full games."""
    season = assert_not_heldout(season)
    games = con.execute(GAME_SQL, (level, season)).fetchall()
    if max_games:
        games = games[:max_games]
    S = SeasonData()
    S.level, S.season = level, season
    S.g_id = [g[0] for g in games]
    S.g_date = [g[1] or "" for g in games]
    S.g_full = np.array([is_full(g[6], g[7], g[8]) for g in games], dtype=bool)
    S.g_home = [team_key(g[2]) for g in games]
    S.g_away = [team_key(g[3]) for g in games]
    gidx = {g[0]: i for i, g in enumerate(games)}
    printed = {g[0]: (g[2], g[3]) for g in games}
    runs = {g[0]: (_int(g[4]), _int(g[5])) for g in games}
    rows = []
    q = f"SELECT {', '.join(PA_COLS)} FROM pa WHERE game_id IN ({{}}) ORDER BY game_id, idx"
    ids = S.g_id
    for i in range(0, len(ids), 400):
        part = ids[i:i + 400]
        rows.extend(con.execute(q.format(",".join("?" * len(part))), part).fetchall())
    reasons = Counter()

    # pass 1: team ids, name keys; initials per (team, last)
    max_inn = defaultdict(int)
    recs = []
    inits = defaultdict(set)
    for r in rows:
        d = dict(zip(PA_COLS, r))
        home, away = printed[d["game_id"]]
        tid = team_id(d["bat_school"], home if d["bat_side"] == "home" else away)
        nk = name_key(d["batter"])
        d["tid"], d["nk"] = tid, nk
        if nk[0] and nk[1]:
            inits[(tid, nk[0])].add(nk[1])
        max_inn[d["game_id"]] = max(max_inn[d["game_id"]], d["inning"] or 0)
        recs.append(d)

    # team runs per game (team strength): the side's team id = the most common id among its PAs
    side_tid = defaultdict(Counter)
    for d in recs:
        side_tid[(d["game_id"], d["bat_side"])][d["tid"]] += 1
    team_games = []
    for (gid, side), c in side_tid.items():
        hr, ar = runs[gid]
        rr = hr if side == "home" else ar
        if rr is not None:
            team_games.append((c.most_common(1)[0][0], gidx[gid], rr))
    S.team_games = team_games

    sched = {}
    for gid, i in gidx.items():
        hr, ar = runs[gid]
        sched[gid] = scheduled_innings(max_inn[gid], None if hr is None or ar is None else abs(hr - ar))
    n_amb = 0
    amb_groups = set()
    for d in recs:
        tid, (last, ini) = d["tid"], d["nk"]
        d["pk"] = (d["game_id"], d["bat_side"], name_key(d["pitcher"])) if d["pitcher"] else None
        d["hname"] = (last, ini)
        d["cat"] = ""
        if not last:
            d["hkey"] = None
            reasons["no_name"] += 1
            continue
        I = inits.get((tid, last), set())
        key_ini = ini if ini else (next(iter(I)) if len(I) == 1 else ("" if not I else None))
        if key_ini is None:
            d["hkey"] = None
            n_amb += 1
            amb_groups.add((tid, last))
        else:
            d["hkey"] = f"{level}|{season}|{tid}|{last}|{key_ini}"
            d["hname"] = (last, key_ini)
    S.n_pa_ambiguous, S.n_ambiguous_groups = n_amb, len(amb_groups)
    return _build(S, recs, gidx, sched, reasons)


def _build(S, recs, gidx, sched, reasons):
    """the shared per-PA pass: records carry game_id, tid, hkey (None = no hitter), hname, pk (pitcher key or None),
    cat (a hitter group for the prior, '' at college) and the pa columns"""
    hitters, hix = [], {}
    h_team, h_cat = defaultdict(Counter), defaultdict(Counter)
    S.h_name = []
    bf = Counter()
    pit = defaultdict(list)
    bip = defaultdict(list)
    pa = defaultdict(list)
    n_pa = 0
    for d in recs:
        g = gidx[d["game_id"]]
        # pitcher batters faced before this PA (all PAs count, lettered or not)
        pk = d["pk"]
        b_f = min(bf[pk], BF_CAP) if pk else -1
        if pk:
            bf[pk] += 1
        n_pa += 1
        key = d["hkey"]
        if key is None:
            h = -1
        else:
            h = hix.get(key)
            if h is None:
                h = hix[key] = len(hitters)
                hitters.append(key)
                S.h_name.append(d["hname"])
            h_team[h][d["tid"]] += 1
            h_cat[h][d["cat"]] += 1
        bb = d["bases_before"] or ""
        o = d["outs_before"]
        if len(bb) != 3 or o is None or not 0 <= o <= 2:
            reasons["bad_state"] += 1
            continue
        risp = int(bb[1] == "1" or bb[2] == "1")
        bi = bases_index(bb[0] == "1", bb[1] == "1", bb[2] == "1")
        margin = (d["bat_score_before"] or 0) - (d["fld_score_before"] or 0)
        lc = int((d["inning"] or 0) >= sched[d["game_id"]] - 2 and abs(margin) <= 2)
        res, ip = d["result"], bool(d["in_play"])
        bunt = d["bip_type"] == "bunt" or res in BUNT_RESULTS
        slot = d["slot"] if d["slot"] in range(1, 10) else 0
        bats = {"R": 0, "L": 1, "S": 2, "B": 2}.get(d["bats"], 3)
        thr = {"R": 0, "L": 1}.get(d["throws"], 2)
        if h >= 0 and res not in EXCLUDED_RESULTS:
            for k, v in (("g", g), ("h", h), ("slot", slot)):
                pa[k].append(v)
        if bunt:
            reasons["bunt_pa"] += 1
            continue
        if ip and res:
            br = HITS.get(res, 5 if res == "E" else 0)
            ci = CI.get((d["balls"], d["strikes"]), -1)
            for k, v in (("g", g), ("h", h), ("ci", ci), ("r", br), ("dir", DIRS.get(d["bip_dir"], 9)),
                         ("bats", bats), ("thr", thr), ("bf", b_f), ("risp", risp), ("lc", lc), ("slot", slot)):
                bip[k].append(v)
        ev, why = pitch_events(d["pitches"], d["balls"], d["strikes"], res, ip, d.get("count_ok", 1))
        reasons["pitches:" + why] += 1
        if ev is None:
            continue
        prev = 0
        for ci, e6 in ev:
            for k, v in (("g", g), ("h", h), ("ci", ci), ("y", e6), ("bf", b_f), ("risp", risp), ("lc", lc),
                         ("prev", prev), ("o", o), ("bi", bi), ("slot", slot)):
                pit[k].append(v)
            prev = 1 if e6 <= 2 else (2 if e6 == 3 else 3)
    dt = {"g": np.int32, "h": np.int32}
    S.pit, S.bip, S.pa = _arr(pit, dt), _arr(bip, dt), _arr(pa, dt)
    S.hitters = hitters
    S.h_team = [h_team[h].most_common(1)[0][0] for h in range(len(hitters))]     # modal team
    S.h_cat = [h_cat[h].most_common(1)[0][0] for h in range(len(hitters))]
    S.n_games = len(S.g_id)
    S.n_pa_rows = n_pa
    S.reasons = reasons
    return S

