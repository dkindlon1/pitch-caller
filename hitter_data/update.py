"""v1.3 Part 1: the one command that keeps the college data current.

  python -m hitter_data.update            # copy new/changed games from the archive, dedupe, parse, reports
  python -m hitter_data.update --reparse  # also re-parse every game (after a parser change)
  python -m hitter_data.update --report   # reports only

Safe to re-run any time while ChatGPT's collector keeps adding games: the archive is opened read-only, a game is
copied only when new or its source digest changed, and parsed only when its parsed digest differs (or --reparse).
Reports land in PITCHIQ_DATA/college/reports/ (quality.csv, coverage.csv, letters.csv, last_letter.csv,
unparsed_top20.csv, dupes.csv, summary.txt)."""
import json, multiprocessing as mp, os, re, sqlite3, sys, time
from . import ingest, parse, quality

PARSER_VERSION = "3"   # bump when the parser changes: every game re-parses on the next update

PA_SCHEMA = """
CREATE TABLE IF NOT EXISTS pa(game_id TEXT, idx INTEGER, seq REAL, inning INTEGER, half TEXT, bat_side TEXT,
  batter TEXT, pitcher TEXT, slot INTEGER, outs_before INTEGER, bases_before TEXT, bat_score_before INTEGER,
  fld_score_before INTEGER, balls INTEGER, strikes INTEGER, pitches TEXT, count_ok INTEGER, result TEXT,
  in_play INTEGER, bip_type TEXT, bip_dir TEXT, outs_on_play INTEGER, runs_on_play INTEGER, runs_rest_inning INTEGER,
  mid_pa_events INTEGER, flags TEXT, text TEXT, bats TEXT, throws TEXT, bat_school TEXT, fld_school TEXT,
  PRIMARY KEY(game_id, idx));
CREATE TABLE IF NOT EXISTS game_qc(game_id TEXT PRIMARY KEY, lines INTEGER, parsed_lines INTEGER, unparsed_lines INTEGER,
  pas INTEGER, pas_full INTEGER, pas_count_only INTEGER, halves INTEGER, halves_3out INTEGER, halves_last_short INTEGER,
  halves_bad INTEGER, halves_scored INTEGER, halves_runs_match INTEGER, final_match INTEGER, count_checked INTEGER,
  count_ok INTEGER, bat_total INTEGER, bat_matched INTEGER, pit_total INTEGER, pit_matched INTEGER, letters TEXT,
  bat_rostered INTEGER, pas_zero_count INTEGER);
CREATE TABLE IF NOT EXISTS unparsed(game_id TEXT, seq REAL, pattern TEXT, text TEXT);
CREATE INDEX IF NOT EXISTS unparsed_game ON unparsed(game_id);
CREATE TABLE IF NOT EXISTS team_school(team_norm TEXT PRIMARY KEY, school TEXT, n INTEGER);
"""


def domain(url):
    m = re.match(r"https?://([^/]+)", url or "")
    d = (m[1] if m else "").lower()
    return d[4:] if d.startswith("www.") else d


def build_team_school(con):
    """team name as printed -> school id. A game's own site (its URL's domain = the school's athletics domain) names
    that school as one of the two teams; the better token match of away/home is that school's printed name."""
    dom = {}
    for sid, url in con.execute("SELECT id, athletics_url FROM schools"):
        if url:
            dom[domain(url)] = sid
    names = dict(con.execute("SELECT id, name FROM schools"))
    votes = {}
    for url, away, home in con.execute("SELECT source_url, away, home FROM games"):
        d = domain(url)
        sid = dom.get(d) or next((v for k, v in dom.items() if d.endswith("." + k) or k.endswith("." + d)), None)
        if not sid:
            continue
        st = ingest.team_tokens(names.get(sid, ""))
        sa, sh = len(ingest.team_tokens(away) & st), len(ingest.team_tokens(home) & st)
        team = away if sa > sh else home if sh > sa else None
        if team is None:
            continue
        k = norm_team(team)
        votes.setdefault(k, {}).setdefault(sid, 0)
        votes[k][sid] += 1
    con.execute("DELETE FROM team_school")
    mapped = {}
    for k, v in votes.items():
        sid, n = max(v.items(), key=lambda x: x[1])
        mapped[k] = (sid, n)
    # opponents (names other sites print): unique best token match against the school directory
    tok = {sid: ingest.team_tokens(nm) for sid, nm in names.items()}
    for (t,) in con.execute("SELECT away FROM games UNION SELECT home FROM games"):
        k = norm_team(t)
        if k in mapped or not k:
            continue
        tt = ingest.team_tokens(t)
        if not tt:
            continue
        scored = sorted(((len(tt & s) / len(tt | s), sid) for sid, s in tok.items() if tt & s), reverse=True)
        if scored and scored[0][0] >= 0.5 and (len(scored) == 1 or scored[1][0] < scored[0][0]):
            mapped[k] = (scored[0][1], 0)
    for k, (sid, n) in mapped.items():
        con.execute("INSERT INTO team_school VALUES (?,?,?)", (k, sid, n))
    con.commit()
    return len(votes)


def norm_team(t):
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\(.*?\)", "", (t or "").lower()))


def roster_index(con):
    idx = {}
    for school, season, player, bats, throws in con.execute(
            "SELECT school, season, player, bats, throws FROM rosters"):
        k = parse.name_key(player)
        if not k[0]:
            continue
        s = str(season)
        if len(s) == 7 and s[4] == "-":                   # '2025-26' = the spring 2026 season
            s = str(int(s[:4]) + 1)
        idx.setdefault((school, s), []).append((k, (bats or "").strip()[:1].upper(), (throws or "").strip()[:1].upper()))
    return idx


def roster_lookup(rows, name):
    if not rows or not name:
        return None
    k = parse.name_key(name)
    hits = [r for r in rows if r[0][0] == k[0] and (not k[1] or not r[0][1] or r[0][1] == k[1])]
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1 and k[1]:
        exact = [r for r in hits if r[0][1] == k[1]]
        if len(exact) == 1:
            return exact[0]
    return None


def _parse_one(args):
    gid, away, home, ar, hr, plays, lineups = args
    try:
        pas, lines, info = parse.parse_game(plays, lineups, away, home)
        return gid, pas, lines, info, None
    except Exception as e:                                    # a parser crash on one game never stops the run
        return gid, [], [], None, f"{type(e).__name__}: {e}"


def qc_of(pas, lines, info, ar, hr, plays):
    halves = info["halves"]
    n = len(halves)
    h3 = sum(1 for h in halves if h["outs_final"] == 3)
    last_short = 1 if n and halves[-1]["outs_final"] != 3 else 0
    bad = n - h3 - last_short
    # the site's running score per half (Sidearm columns): runs = score at the half's last row - score at its start
    scored = match = 0
    rows = sorted(plays, key=lambda r: r[0])
    by_label = []
    for r in rows:
        if by_label and by_label[-1][0] == r[1]:
            by_label[-1][1].append(r)
        else:
            by_label.append((r[1], [r]))
    prev = (0, 0)
    for (label, rs), h in zip(by_label, halves):
        try:
            last = (int(rs[-1][3]), int(rs[-1][4]))
        except (TypeError, ValueError):
            continue
        if h["half"] not in ("top", "bottom"):
            prev = last
            continue
        col = 0 if h["half"] == "top" else 1
        scored += 1
        match += (last[col] - prev[col]) == h["runs"]
        prev = last
    try:
        final = int(info["final_parsed"] == [int(ar), int(hr)])
    except (TypeError, ValueError):
        final = None
    full = sum(1 for p in pas if p["pitches"])
    conly = sum(1 for p in pas if p["balls"] is not None and not p["pitches"])
    letters = {}
    for p in pas:
        for ch in p["pitches"] or "":
            letters[ch] = letters.get(ch, 0) + 1
    checked = sum(1 for p in pas if p["count_ok"] is not None)
    ok = sum(1 for p in pas if p["count_ok"])
    unp = sum(1 for l in lines if l["kind"] == "unparsed")
    return dict(lines=info["lines"], parsed_lines=info["lines"] - unp, unparsed_lines=unp, pas=len(pas), pas_full=full,
                pas_count_only=conly, halves=n, halves_3out=h3, halves_last_short=last_short, halves_bad=bad,
                halves_scored=scored, halves_runs_match=match, final_match=final, count_checked=checked, count_ok=ok,
                letters=json.dumps(letters))


def parse_all(con, reparse=False, log=print, workers=None):
    con.executescript(PA_SCHEMA)
    n_ts = build_team_school(con)
    ts = dict(con.execute("SELECT team_norm, school FROM team_school"))
    ridx = roster_index(con)
    want = PARSER_VERSION + ":"
    q = "SELECT id, away, home, away_runs, home_runs, digest, season FROM games"
    todo = [r for r in con.execute(q) if reparse or (con.execute(
        "SELECT parsed_digest FROM games WHERE id=?", (r[0],)).fetchone()[0] != want + (r[5] or ""))]
    log(f"team->school names {n_ts}; games to parse {len(todo)}")
    t0 = time.time()

    rcon = sqlite3.connect(ingest.DB, check_same_thread=False)    # the pool feeds jobs from its own thread

    def jobs():
        for (gid, away, home, ar, hr, dig, season) in todo:
            plays = rcon.execute("SELECT sequence, inning_label, play_text, away_score, home_score FROM plays "
                                "WHERE game_id=?", (gid,)).fetchall()
            lu = rcon.execute("SELECT side, team, source_order, player, position FROM lineups WHERE game_id=?",
                             (gid,)).fetchall()
            yield gid, away, home, ar, hr, plays, lu
    meta = {r[0]: r for r in todo}
    done = errs = 0
    with mp.Pool(workers or max(1, (os.cpu_count() or 2) - 2)) as pool:
        for gid, pas, lines, info, err in pool.imap_unordered(_parse_one, jobs(), chunksize=20):
            _, away, home, ar, hr, dig, season = meta[gid]
            con.execute("DELETE FROM pa WHERE game_id=?", (gid,))
            con.execute("DELETE FROM unparsed WHERE game_id=?", (gid,))
            con.execute("DELETE FROM game_qc WHERE game_id=?", (gid,))
            if err:
                errs += 1
                con.execute("INSERT INTO unparsed VALUES (?,?,?,?)", (gid, -1, "PARSER_ERROR", err[:300]))
            else:
                plays = con.execute("SELECT sequence, inning_label, play_text, away_score, home_score FROM plays "
                                    "WHERE game_id=?", (gid,)).fetchall()
                qc = qc_of(pas, lines, info, ar, hr, plays)
                school = {"away": ts.get(norm_team(away)), "home": ts.get(norm_team(home))}
                bt = bm = pt = pm = bros = 0
                rows = []
                for i, p in enumerate(pas):
                    bs, fs = school.get(p["bat_side"]), school.get(p["fld_side"])
                    bros += bool(bs and ridx.get((bs, str(season))))
                    rb = roster_lookup(ridx.get((bs, str(season))), p["batter"]) if bs else None
                    rp = roster_lookup(ridx.get((fs, str(season))), p["pitcher"]) if fs and p["pitcher"] else None
                    bats = rb[1] if rb and rb[1] else None
                    throws = rp[2] if rp and rp[2] else None
                    bt += 1; bm += bats is not None
                    if p["pitcher"]:
                        pt += 1; pm += throws is not None
                    rows.append((gid, i, p["seq"], p["inning"], p["half"], p["bat_side"], p["batter"], p["pitcher"],
                                 p["slot"], p["outs_before"], p["bases_before"], p["bat_score_before"],
                                 p["fld_score_before"], p["balls"], p["strikes"], p["pitches"],
                                 None if p["count_ok"] is None else int(p["count_ok"]), p["result"], p["in_play"],
                                 p["bip_type"], p["bip_dir"], p["outs_on_play"], p["runs_on_play"],
                                 p.get("runs_rest_inning"), p["mid_pa_events"], ",".join(p["flags"]), p["text"],
                                 bats, throws, bs, fs))
                con.executemany("INSERT INTO pa VALUES (" + ",".join("?" * 31) + ")", rows)
                zero = sum(1 for p in pas if p["balls"] == 0 and p["strikes"] == 0 and not p["pitches"])
                qc.update(bat_total=bt, bat_matched=bm, pit_total=pt, pit_matched=pm, bat_rostered=bros, pas_zero_count=zero)
                cols = list(qc)
                con.execute(f"INSERT INTO game_qc(game_id,{','.join(cols)}) VALUES (?{',?' * len(cols)})",
                            [gid] + [qc[c] for c in cols])
                con.executemany("INSERT INTO unparsed VALUES (?,?,?,?)",
                                [(gid, l["seq"], l.get("pattern", ""), l["text"][:300]) for l in lines
                                 if l["kind"] == "unparsed"])
            con.execute("UPDATE games SET parsed_digest=? WHERE id=?", (want + (dig or ""), gid))
            done += 1
            if done % 5000 == 0:
                con.commit()
                log(f"  parsed {done}/{len(todo)} ({time.time() - t0:.0f}s)")
    con.commit()
    log(f"parsed {done} games in {time.time() - t0:.0f}s; parser errors {errs}")
    return done, errs


def main(argv):
    con = ingest.connect()
    con.executescript(PA_SCHEMA)
    if "--report" not in argv:
        arc = ingest.archive_con()
        new, changed, removed = ingest.copy(con, arc)
        arc.close()
        ingest.dedupe(con)
        parse_all(con, reparse="--reparse" in argv)
    quality.report(con)


if __name__ == "__main__":
    main(sys.argv[1:])
