"""v1.3 Part 1: incremental copy of the college archive into our own database, plus game dedupe, level and season.

The archive (ChatGPT's collector, still running) is opened read-only (SQLite URI mode=ro) and never written.
Our copy lives at PITCHIQ_DATA/college/college.sqlite3. A game is (re)copied when it is new or its source digest
changed (the collector's digest covers date, published line score and ordered play text), so re-running is cheap.

Dedupe: the collector already merges byte-identical copies. Copies of one game published by both schools with
different text survive as two archive games; we group them by date + final runs + matching team names and compare
their play text. Same text after normalising -> 'dup_same' (one canonical). Similar but different -> 'dup_disagree'
(both kept and flagged; canonical = the copy with more pitch strings). Very different text with the same date and
score = a same-score doubleheader -> separate games."""
import difflib, json, os, re, sqlite3, time
from . import ARCHIVE, DATA

DB = os.path.join(DATA, "college", "college.sqlite3")

SCHEMA = """
CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, digest TEXT, adapter TEXT, game_date TEXT, date_iso TEXT,
  season INTEGER, level TEXT, divisions TEXT, away TEXT, home TEXT, away_runs TEXT, home_runs TEXT, anomaly TEXT,
  source_url TEXT, n_plays INTEGER, n_full INTEGER, dup_group TEXT, dup_status TEXT, canonical INTEGER DEFAULT 1,
  parsed_digest TEXT, copied_at REAL);
CREATE TABLE IF NOT EXISTS plays(game_id TEXT, sequence INTEGER, inning_label TEXT, play_text TEXT, away_score TEXT,
  home_score TEXT, PRIMARY KEY(game_id, sequence));
CREATE TABLE IF NOT EXISTS lineups(game_id TEXT, side TEXT, team TEXT, source_order INTEGER, player TEXT, position TEXT,
  PRIMARY KEY(game_id, side, source_order));
CREATE TABLE IF NOT EXISTS schools(id TEXT PRIMARY KEY, name TEXT, division INTEGER, conference TEXT, athletics_url TEXT);
CREATE TABLE IF NOT EXISTS rosters(school TEXT, season TEXT, source_order INTEGER, player TEXT, number TEXT, position TEXT,
  bats TEXT, throws TEXT, class_year TEXT, PRIMARY KEY(school, season, source_order));
CREATE TABLE IF NOT EXISTS ingest_runs(at REAL, new_games INTEGER, changed_games INTEGER, removed_games INTEGER,
  archive_games INTEGER, seconds REAL);
"""

LEVEL = {1: "D1", 2: "D2", 3: "D3"}
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
FULL_RE = re.compile(r"\(\s*\d\s*-\s*\d\s+[A-Z]+\s*\)")


def date_iso(s):
    s = (s or "").strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})", s)
    if m:
        mo, d, y = int(m[1]), int(m[2]), int(m[3])
        y += 2000 if y < 100 else 0
        return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.match(r"^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})", s)
    if m and m[1].lower() in MONTHS:
        return f"{int(m[3]):04d}-{MONTHS[m[1].lower()]:02d}-{int(m[2]):02d}"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return m[0]
    return ""


def season_of(iso, url):
    if iso:
        return int(iso[:4])
    m = re.search(r"/(20\d\d|19\d\d)-(\d\d)/", url or "")        # PrestoSports 2023-24 -> 2024 (spring)
    if m:
        return int(m[1]) + 1
    # v1.3 final archive (Drew's Nov 25 ruling 20): no looser fallback (a year anywhere in the URL). An undated game whose
    # URL names no season path gets season NULL and is left out of every fit and score (never a guess that could be 2026).
    m = re.search(r"/(20\d\d|19\d\d)/", url or "")          # Sidearm /stats/YYYY/, StatCrew /YYYY/
    return int(m[1]) if m else None


def connect():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    con.execute("PRAGMA journal_mode=WAL")
    return con


def archive_con(path=None):
    uri = "file:" + (path or ARCHIVE).replace("\\", "/") + "?mode=ro"
    return sqlite3.connect(uri, uri=True, timeout=60)


def copy(con, arc, log=print, chunk=1500):
    t0 = time.time()
    src = dict(arc.execute("SELECT id, digest FROM games"))
    have = dict(con.execute("SELECT id, digest FROM games"))
    new = [g for g in src if g not in have]
    changed = [g for g in src if g in have and have[g] != src[g]]
    removed = [g for g in have if g not in src]
    for g in removed + changed:
        for t in ("games", "plays", "lineups"):
            con.execute(f"DELETE FROM {t} WHERE {'id' if t == 'games' else 'game_id'}=?", (g,))
    todo = new + changed
    log(f"archive games {len(src)}; local {len(have)}; new {len(new)}, changed {len(changed)}, removed {len(removed)}")
    for i in range(0, len(todo), chunk):
        ids = todo[i:i + chunk]
        q = ",".join("?" * len(ids))
        divs = {}
        for gid, div in arc.execute(f"SELECT s.game_id, j.division FROM game_sources s JOIN jobs j ON j.id=s.job_id "
                                    f"WHERE s.game_id IN ({q})", ids):
            divs.setdefault(gid, set()).add(div)
        rows = arc.execute(f"SELECT id, digest, adapter, game_date, away, home, away_runs, home_runs, anomaly, source_url "
                           f"FROM games WHERE id IN ({q})", ids).fetchall()
        plays = arc.execute(f"SELECT game_id, sequence, inning_label, play_text, away_score, home_score FROM plays "
                            f"WHERE game_id IN ({q})", ids).fetchall()
        lineups = arc.execute(f"SELECT game_id, side, team, source_order, player, position FROM lineups "
                              f"WHERE game_id IN ({q})", ids).fetchall()
        nplays, nfull = {}, {}
        for p in plays:
            nplays[p[0]] = nplays.get(p[0], 0) + 1
            if FULL_RE.search(p[3] or ""):
                nfull[p[0]] = nfull.get(p[0], 0) + 1
        out = []
        for (gid, dig, ad, gd, away, home, ar, hr, an, url) in rows:
            iso = date_iso(gd)
            d = sorted(divs.get(gid, []))
            level = LEVEL.get(min(d)) if d else None          # a cross-division game counts at the higher level
            out.append((gid, dig, ad, gd, iso, season_of(iso, url), level, json.dumps(d), away, home, ar, hr, an, url,
                        nplays.get(gid, 0), nfull.get(gid, 0), time.time()))
        con.executemany("INSERT INTO games(id, digest, adapter, game_date, date_iso, season, level, divisions, away, home, "
                        "away_runs, home_runs, anomaly, source_url, n_plays, n_full, copied_at) "
                        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", out)
        con.executemany("INSERT OR REPLACE INTO plays VALUES (?,?,?,?,?,?)", plays)
        con.executemany("INSERT OR REPLACE INTO lineups VALUES (?,?,?,?,?,?)", lineups)
        con.commit()
        log(f"  copied {min(i + chunk, len(todo))}/{len(todo)}")
    # schools and rosters are small: refresh whole
    con.execute("DELETE FROM schools")
    con.executemany("INSERT INTO schools VALUES (?,?,?,?,?)",
                    arc.execute("SELECT id, name, division, institution_conference, athletics_url FROM schools"))
    con.execute("DELETE FROM rosters")
    con.executemany("INSERT OR REPLACE INTO rosters VALUES (?,?,?,?,?,?,?,?,?)",
                    arc.execute("SELECT school, season, source_order, player, number, position, bats, throws, class_year "
                                "FROM rosters"))
    roster_supplement(con, arc, log)
    # ruling 20: every undated game's season from its URL by season_of's rule (rows copied earlier used a looser one)
    und = con.execute("SELECT id, source_url, season FROM games WHERE COALESCE(date_iso,'')=''").fetchall()
    fix = [(season_of("", u), g) for g, u, s0 in und if season_of("", u) != s0]
    con.executemany("UPDATE games SET season=? WHERE id=?", fix)
    con.commit()
    log(f"undated games {len(und)}: season from the URL; {sum(1 for g, u, s0 in und if season_of('', u) is None)} "
        f"without one (excluded); {len(fix)} re-derived")
    con.execute("INSERT INTO ingest_runs VALUES (?,?,?,?,?,?)",
                (time.time(), len(new), len(changed), len(removed), len(src), time.time() - t0))
    con.commit()
    return len(new), len(changed), len(removed)


def roster_supplement(con, arc, log=print):
    """v1.3 final archive (Nov 25 prompt): rebuild the roster join on rosters PLUS roster_sources. The final archive keeps
    every roster page it read in roster_sources; rosters holds one row per (school, season, source_order). A player in
    roster_sources but not in rosters for that school-season is added (source_order 100000+), and a rosters row with an
    empty bats / throws takes the value roster_sources has for the same player. Returns (added, filled)."""
    try:
        rs = arc.execute("SELECT school, season, player, number, position, bats, throws, class_year FROM roster_sources "
                         "ORDER BY school, season, source_order").fetchall()
    except sqlite3.OperationalError:
        return 0, 0                                  # an archive without roster_sources (the older copy)
    have = {}
    for school, season, player, bats, throws in con.execute("SELECT school, season, player, bats, throws FROM rosters"):
        have[(school, str(season), (player or "").strip())] = ((bats or "").strip(), (throws or "").strip())
    nxt = {}
    added = filled = 0
    for school, season, player, num, pos, bats, throws, cy in rs:
        k = (school, str(season), (player or "").strip())
        b, t = (bats or "").strip(), (throws or "").strip()
        if k not in have:
            o = nxt.get(k[:2], 100000)
            nxt[k[:2]] = o + 1
            con.execute("INSERT OR REPLACE INTO rosters VALUES (?,?,?,?,?,?,?,?,?)", (school, season, o, player, num, pos,
                                                                                    bats, throws, cy))
            have[k] = (b, t)
            added += 1
        else:
            hb, ht = have[k]
            if (not hb and b) or (not ht and t):
                con.execute("UPDATE rosters SET bats=COALESCE(NULLIF(TRIM(bats),''), ?), throws=COALESCE(NULLIF(TRIM(throws),''), ?) "
                            "WHERE school=? AND season=? AND TRIM(player)=?", (b or None, t or None, school, season, k[2]))
                have[k] = (hb or b, ht or t)
                filled += 1
    con.commit()
    log(f"rosters + roster_sources: {added} players added, {filled} rows' bats / throws filled")
    return added, filled


# ---------- dedupe ----------
STOP = {"university", "of", "the", "college", "univ", "u", "at", "state", "st", "and"}


def team_tokens(name):
    t = re.sub(r"\(.*?\)", " ", (name or "").lower())
    t = re.sub(r"[^a-z0-9 ]", " ", t.replace("&", " "))
    return {w for w in t.split() if w not in STOP and len(w) > 1}


def same_team(a, b):
    ta, tb = team_tokens(a), team_tokens(b)
    if not ta or not tb:
        return False
    if ta & tb:
        return True
    ja, jb = "".join(sorted(ta)), "".join(sorted(tb))
    return ja[:4] == jb[:4]


def norm_line(s):
    s = re.sub(r"\s+", " ", (s or "").lower())
    return re.sub(r"[^a-z0-9() -]", "", s).strip()


def dedupe(con, log=print):
    con.execute("UPDATE games SET dup_group=NULL, dup_status=NULL, canonical=1")
    by_key = {}
    for gid, iso, ar, hr, away, home, nf in con.execute(
            "SELECT id, date_iso, away_runs, home_runs, away, home, n_full FROM games WHERE date_iso<>''"):
        by_key.setdefault((iso, ar, hr), []).append((gid, away, home, nf))
        by_key.setdefault((iso, hr, ar), []).append((gid, away, home, nf)) if ar != hr else None
    seen, groups = set(), []
    for key, gs in by_key.items():
        if len(gs) < 2:
            continue
        for i in range(len(gs)):
            for j in range(i + 1, len(gs)):
                a, b = gs[i], gs[j]
                if (a[0], b[0]) in seen or a[0] == b[0]:
                    continue
                seen.add((a[0], b[0])); seen.add((b[0], a[0]))
                straight = same_team(a[1], b[1]) and same_team(a[2], b[2])
                swapped = same_team(a[1], b[2]) and same_team(a[2], b[1])
                if straight or swapped:
                    groups.append((a, b))
    # union-find over candidate pairs, then compare texts
    parent = {}

    def find(x):
        while parent.get(x, x) != x:
            x = parent[x]
        return x
    texts = {}

    def text(gid):
        if gid not in texts:
            texts[gid] = [norm_line(t) for (t,) in con.execute(
                "SELECT play_text FROM plays WHERE game_id=? ORDER BY sequence", (gid,))]
        return texts[gid]
    n_same = n_dis = n_dh = 0
    status = {}
    for a, b in groups:
        ta, tb = text(a[0]), text(b[0])
        if ta == tb:
            st = "dup_same"
        else:
            ratio = difflib.SequenceMatcher(None, ta, tb, autojunk=False).ratio() if (ta and tb) else 0.0
            if ratio < 0.5:
                n_dh += 1
                continue                                    # different games (same-score doubleheader, or no text)
            st = "dup_disagree"
        parent[find(a[0])] = find(b[0])
        for g in (a[0], b[0]):
            status[g] = "dup_disagree" if (status.get(g) == "dup_disagree" or st == "dup_disagree") else st
    comp = {}
    for g in status:
        comp.setdefault(find(g), []).append(g)
    nf = dict(con.execute("SELECT id, n_full FROM games"))
    for root, members in comp.items():
        members.sort(key=lambda g: (-nf.get(g, 0), g))
        st = "dup_disagree" if any(status[g] == "dup_disagree" for g in members) else "dup_same"
        n_same += st == "dup_same"; n_dis += st == "dup_disagree"
        for k, g in enumerate(members):
            con.execute("UPDATE games SET dup_group=?, dup_status=?, canonical=? WHERE id=?", (root[:16], st, int(k == 0), g))
    con.commit()
    log(f"dedupe: {len(groups)} candidate pairs; groups same-text {n_same}, disagreeing {n_dis}; "
        f"{n_dh} pairs judged separate games (same date and score, different text)")
    return n_same, n_dis, n_dh
