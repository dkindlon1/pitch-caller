"""v1.3 Part 1 (HS / travel): incremental ingest of the Perfect Game archive snapshot into PITCHIQ_DATA/hs/hs.sqlite3.

  python -m hitter_data.hs_ingest            # snapshot (if the archive changed), parse new / changed games, reports
  python -m hitter_data.hs_ingest --reparse  # re-parse every game (after a parser change)
  python -m hitter_data.hs_ingest --report   # reports only

Reads only the snapshot copy (hitter_data.hs_snapshot), plus each new game's scorecard JSON in the archive for its
inning-by-inning line score (the CSVs carry only the final score); the archive is never written. A game is parsed
when it is new, its content hash changed (its games / pitch / lineup / roster rows), or the parser version changed.

Event and format fields per game:
- event, event_id, series, age_group (blank in the archive for the WWBA World Championship: stored as "Open");
- phase pool / bracket / unknown, inferred from the event's schedule (event_index.json: games listed per day). PG
  events run pool play first and the playoff bracket on the last days, when the daily game count drops: the trailing
  run of days with fewer than half the event's busiest day are "bracket", the days before are "pool". An event with
  no such drop (the HS Showdowns mostly) is "unknown". The archive has no pool / bracket field and no game type.
- innings played, whether the game ended before 7 innings, whether the international tie-breaker (runners placed,
  "Tie Breaker Automatic Out") was used. Time limits and pitch limits are not in the archive: those columns stay
  blank (NULL) on purpose. No bat-type field."""
import csv, hashlib, json, os, re, sqlite3, sys, time
from collections import defaultdict
from . import hs_parse, hs_snapshot
from .hs_snapshot import HS_ARCHIVE, HS_DIR, SNAP

DB = os.path.join(HS_DIR, "hs.sqlite3")
PARSER_VERSION = "1"     # bump when hs_parse changes: every game re-parses on the next update

SCHEMA = """
CREATE TABLE IF NOT EXISTS hs_games(game_id TEXT PRIMARY KEY, content_hash TEXT, parsed TEXT, level TEXT,
  event_id TEXT, event TEXT, series TEXT, age_group TEXT, game_date TEXT, season INTEGER, game_number INTEGER,
  scheduled_time TEXT, venue TEXT, away_team TEXT, home_team TEXT, away_runs INTEGER, home_runs INTEGER,
  pitch_rows INTEGER, other_rows INTEGER, pitches_with_velocity INTEGER, box_pitch_total INTEGER,
  pitch_count_difference INTEGER, inning_scores_match INTEGER, roster_team_count INTEGER, game_status TEXT,
  line_away TEXT, line_home TEXT, phase TEXT, phase_day_games INTEGER, phase_peak_games INTEGER,
  innings_played INTEGER, ended_before_7 INTEGER, tie_breaker INTEGER, time_limit_min INTEGER,
  pitch_limit INTEGER, copied_at REAL);
CREATE TABLE IF NOT EXISTS hs_pa(game_id TEXT, idx INTEGER, seq0 INTEGER, inning INTEGER, half TEXT,
  bat_side TEXT, batter TEXT, batter_id TEXT, pitcher TEXT, pitcher_id TEXT, slot INTEGER, bats TEXT, throws TEXT,
  outs_before INTEGER, bases_before TEXT, bat_score_before INTEGER, fld_score_before INTEGER, balls INTEGER,
  strikes INTEGER, pitches TEXT, n_pitches INTEGER, result TEXT, in_play INTEGER, bip_type TEXT, bip_dir TEXT,
  outs_on_play INTEGER, runs_on_play INTEGER, runs_rest_inning INTEGER, last_pitch_type TEXT, last_velo REAL,
  flags TEXT, text TEXT, PRIMARY KEY(game_id, idx));
CREATE TABLE IF NOT EXISTS hs_pitch(game_id TEXT, seq INTEGER, pa_idx INTEGER, pitch_no INTEGER, inning INTEGER,
  half TEXT, bat_side TEXT, batter TEXT, batter_id TEXT, pitcher TEXT, pitcher_id TEXT, slot INTEGER, bats TEXT,
  throws TEXT, outs_before INTEGER, bases_before TEXT, bat_score_before INTEGER, fld_score_before INTEGER,
  balls INTEGER, strikes INTEGER, letter TEXT, outcome TEXT, result TEXT, pitch_type TEXT, pitch_class TEXT,
  velo REAL, balls_after INTEGER, strikes_after INTEGER, count_ok INTEGER, runs_on_row INTEGER,
  runs_rest_inning INTEGER, PRIMARY KEY(game_id, seq));
CREATE TABLE IF NOT EXISTS hs_game_qc(game_id TEXT PRIMARY KEY, rows INTEGER, pas INTEGER, pas_with_result INTEGER,
  pas_with_pitches INTEGER, pitches INTEGER, pitches_velo INTEGER, pitches_type INTEGER, halves INTEGER,
  halves_3out INTEGER, halves_last_short INTEGER, halves_bad INTEGER, halves_line INTEGER, halves_runs_match INTEGER,
  line_halves INTEGER, halves_missing INTEGER,
  final_match INTEGER, count_checked INTEGER, count_ok INTEGER, term_checked INTEGER, term_ok INTEGER,
  outs_checked INTEGER, outs_agree INTEGER, bat_total INTEGER, bat_matched INTEGER, pit_total INTEGER,
  pit_matched INTEGER, slot_total INTEGER, slot_matched INTEGER, box_diff INTEGER, unparsed INTEGER,
  orphans_dropped INTEGER, full_log INTEGER, error TEXT);
CREATE TABLE IF NOT EXISTS hs_unparsed(game_id TEXT, pattern TEXT, text TEXT);
CREATE INDEX IF NOT EXISTS hs_unparsed_game ON hs_unparsed(game_id);
CREATE INDEX IF NOT EXISTS hs_pitch_pa ON hs_pitch(game_id, pa_idx);
CREATE TABLE IF NOT EXISTS hs_runs(at REAL, snapshot_changed INTEGER, games INTEGER, new_games INTEGER,
  changed_games INTEGER, removed_games INTEGER, parsed INTEGER, errors INTEGER, seconds REAL);
"""

GAME_INT = ("away_runs", "home_runs", "number_of_pitch_rows", "number_of_other_events", "pitches_with_velocity",
            "box_pitch_total", "pitch_count_difference", "inning_scores_match", "roster_team_count", "game_number")

csv.field_size_limit(10 ** 8)


def connect(path=None):
    p = path or DB
    os.makedirs(os.path.dirname(p), exist_ok=True)
    con = sqlite3.connect(p)
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    return con


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)


def by_game(path):
    out = defaultdict(list)
    for r in read_csv(path):
        out[r["game_id"]].append(r)
    return out


def stream_games(path):
    """pitch_by_pitch rows grouped by game_id (the export writes each game's rows together; a game_id that comes
    back later is merged, so order doesn't matter for correctness)."""
    cur, rows, seen = None, [], set()
    late = defaultdict(list)
    for r in read_csv(path):
        g = r["game_id"]
        if g != cur:
            if cur is not None:
                yield cur, rows
                seen.add(cur)
            cur, rows = g, []
        if g in seen:
            late[g].append(r)
            continue
        rows.append(r)
    if cur is not None and cur not in seen:
        yield cur, rows
    if late:
        raise RuntimeError(f"pitch_by_pitch rows of {len(late)} games are not contiguous; ingest refuses to guess")


def content_hash(game, rows, lineups, rosters):
    h = hashlib.sha1()
    skip = {"source_url"}
    for part in ([game], rows, lineups, rosters):
        for r in part:
            h.update(json.dumps([v for k, v in r.items() if k not in skip], ensure_ascii=False).encode("utf-8"))
        h.update(b"|")
    return h.hexdigest()


def line_score(game_id, archive=None):
    """inning-by-inning runs from the scorecard JSON (read-only): {'away': [...], 'home': [...]} or None."""
    p = os.path.join(archive or HS_ARCHIVE, "scorecards", f"{game_id}.json")
    try:
        with open(p, encoding="utf-8") as f:
            box = json.load(f)["box"]
        head, away, home = box["scores"][0], box["scores"][1], box["scores"][2]
        n = sum(1 for x in head[1:] if x.isdigit())
        return {"away": away[1:1 + n], "home": home[1:1 + n]}
    except (OSError, ValueError, KeyError, IndexError):
        return None


def phases(snap=None):
    """(event_id, 'YYYY-MM-DD') -> (phase, day_games, peak_games). See the module docstring."""
    p = os.path.join(snap or SNAP, "event_index.json")
    if not os.path.exists(p):
        return {}
    idx = json.load(open(p, encoding="utf-8"))
    days = defaultdict(dict)
    for d in idx.get("days", []):
        m = re.search(r"event=(\d+)&Date=(\d+)/(\d+)/(\d+)", d.get("url", ""), re.I)
        if not m:
            continue
        iso = f"{int(m[4]):04d}-{int(m[2]):02d}-{int(m[3]):02d}"
        days[m[1]][iso] = days[m[1]].get(iso, 0) + int(d.get("listed") or 0)
    out = {}
    for ev, dd in days.items():
        order = sorted(dd)
        peak = max(dd.values()) if dd else 0
        trail = []
        for iso in reversed(order):
            if dd[iso] < 0.5 * peak:
                trail.append(iso)
            else:
                break
        for iso in order:
            ph = "unknown" if not trail else ("bracket" if iso in trail else "pool")
            out[(ev, iso)] = (ph, dd[iso], peak)
    return out


def catalog_age_groups(snap=None):
    p = os.path.join(snap or SNAP, "event_catalog.json")
    if not os.path.exists(p):
        return {}
    return {e["id"]: e.get("age_group") or "" for e in json.load(open(p, encoding="utf-8"))}


def store_game(con, g, h, pas, pitches, info, qc, unparsed, ph, line, err=None):
    gid = g["game_id"]
    for t in ("hs_pa", "hs_pitch", "hs_unparsed", "hs_game_qc"):
        con.execute(f"DELETE FROM {t} WHERE game_id=?", (gid,))
    age = g["age_group"] or "Open"
    innings = info["innings"] if info else None
    con.execute("INSERT OR REPLACE INTO hs_games VALUES (" + ",".join("?" * 36) + ")", (
        gid, h, PARSER_VERSION + ":" + h, g["level"], g["event_id"], g["event"], g["series"], age, g["game_date"],
        _int(g["game_date"][:4]), _int(g["game_number"]), g["scheduled_time"], g["venue"], g["away_team"],
        g["home_team"], _int(g["away_runs"]), _int(g["home_runs"]), _int(g["number_of_pitch_rows"]),
        _int(g["number_of_other_events"]), _int(g["pitches_with_velocity"]), _int(g["box_pitch_total"]),
        _int(g["pitch_count_difference"]), _int(g["inning_scores_match"]), _int(g["roster_team_count"]),
        g["game_status"], json.dumps(line["away"]) if line else None, json.dumps(line["home"]) if line else None,
        ph[0], ph[1], ph[2], innings, None if innings is None else int(innings < 7),
        int(info["tie_breaker"]) if info else None, None, None, time.time()))
    if err:
        con.execute("INSERT INTO hs_game_qc(game_id, error) VALUES (?,?)", (gid, err[:300]))
        return
    con.executemany("INSERT INTO hs_pa VALUES (" + ",".join("?" * 32) + ")", [(
        p["game_id"], p["idx"], p["seq0"], p["inning"], p["half"], p["bat_side"], p["batter"], p["batter_id"],
        p["pitcher"], p["pitcher_id"], p["slot"], p["bats"], p["throws"], p["outs_before"], p["bases_before"],
        p["bat_score_before"], p["fld_score_before"], p["balls"], p["strikes"], p["pitches"], p["n_pitches"],
        p["result"], p["in_play"], p["bip_type"], p["bip_dir"], p["outs_on_play"], p["runs_on_play"],
        p["runs_rest_inning"], p["last_pitch_type"], p["last_velo"], ",".join(dict.fromkeys(p["flags"])), p["text"])
        for p in pas])
    con.executemany("INSERT INTO hs_pitch VALUES (" + ",".join("?" * 31) + ")", [(
        q["game_id"], q["seq"], q["pa_idx"], q["pitch_no"], q["inning"], q["half"], q["bat_side"], q["batter"],
        q["batter_id"], q["pitcher"], q["pitcher_id"], q["slot"], q["bats"], q["throws"], q["outs_before"],
        q["bases_before"], q["bat_score_before"], q["fld_score_before"], q["balls"], q["strikes"], q["letter"],
        q["outcome"], q["result"], q["pitch_type"], q["pitch_class"], q["velo"], q["balls_after"],
        q["strikes_after"], q["count_ok"], q["runs_on_row"], q["runs_rest_inning"]) for q in pitches])
    cols = list(qc)
    con.execute(f"INSERT INTO hs_game_qc(game_id,{','.join(cols)}) VALUES (?{',?' * len(cols)})",
                [gid] + [qc[c] for c in cols])
    con.executemany("INSERT INTO hs_unparsed VALUES (?,?,?)", [(gid, pat, txt[:300]) for pat, txt in unparsed])


def ingest(con=None, reparse=False, log=print, snap=None, archive=None, take_snapshot=True):
    """Snapshot, then parse new / changed games. Returns dict of counts."""
    from . import hs_quality
    t0 = time.time()
    con = con or connect()
    changed_snap = None
    if take_snapshot:
        changed_snap = hs_snapshot.snapshot(dst=snap, src=archive, log=log)["changed"]
    snap = snap or SNAP
    games = {r["game_id"]: r for r in read_csv(os.path.join(snap, "games.csv"))}
    lineups = by_game(os.path.join(snap, "lineups.csv"))
    rosters = by_game(os.path.join(snap, "rosters.csv"))
    have = dict(con.execute("SELECT game_id, parsed FROM hs_games"))
    removed = [g for g in have if g not in games]
    for g in removed:
        for t in ("hs_games", "hs_pa", "hs_pitch", "hs_unparsed", "hs_game_qc"):
            con.execute(f"DELETE FROM {t} WHERE game_id=?", (g,))
    ph = phases(snap)
    ages = catalog_age_groups(snap)
    new = changed = parsed = errs = 0
    for gid, rows in stream_games(os.path.join(snap, "pitch_by_pitch.csv")):
        g = games.get(gid)
        if g is None:
            continue
        if not g["age_group"]:
            g = dict(g, age_group=ages.get(g["event_id"], ""))
        h = content_hash(g, rows, lineups.get(gid, []), rosters.get(gid, []))
        want = PARSER_VERSION + ":" + h
        if not reparse and have.get(gid) == want:
            continue
        if gid not in have:
            new += 1
        elif not (have[gid] or "").endswith(":" + h):
            changed += 1
        line = line_score(gid, archive)
        p = ph.get((g["event_id"], g["game_date"]), (None, None, None))
        try:
            pas, pitches, info = hs_parse.parse_game(g, rows, lineups.get(gid, []), rosters.get(gid, []), line)
            qc = hs_quality.game_qc(g, pas, pitches, info, line)
            store_game(con, g, h, pas, pitches, info, qc, info["unparsed"], p, line)
        except Exception as e:                       # one bad game never stops the run
            errs += 1
            store_game(con, g, h, [], [], None, None, [], p, line, err=f"{type(e).__name__}: {e}")
        parsed += 1
        if parsed % 1000 == 0:
            con.commit()
            log(f"  parsed {parsed} ({time.time() - t0:.0f}s)")
    # phases can change as the index grows: refresh for every game
    for gid, ev, d in con.execute("SELECT game_id, event_id, game_date FROM hs_games").fetchall():
        p = ph.get((ev, d), (None, None, None))
        con.execute("UPDATE hs_games SET phase=?, phase_day_games=?, phase_peak_games=? WHERE game_id=?", (*p, gid))
    con.execute("INSERT INTO hs_runs VALUES (?,?,?,?,?,?,?,?,?)", (time.time(), changed_snap, len(games), new,
                                                                   changed, len(removed), parsed, errs,
                                                                   time.time() - t0))
    con.commit()
    log(f"hs: games in snapshot {len(games)}; new {new}, changed {changed}, removed {len(removed)}; parsed {parsed} "
        f"(parser v{PARSER_VERSION}) in {time.time() - t0:.0f}s; parser errors {errs}")
    return dict(games=len(games), new=new, changed=changed, removed=len(removed), parsed=parsed, errors=errs)


def main(argv):
    from . import hs_quality
    con = connect()
    if "--report" not in argv:
        ingest(con, reparse="--reparse" in argv)
    hs_quality.report(con)


if __name__ == "__main__":
    main(sys.argv[1:])
