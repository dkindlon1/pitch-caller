"""v1.3 Part 2 pulls: resumable, one request at a time per host, polite pacing. Everything lands under PITCHIQ_DATA.

  python -m hitter_data.pulls savant      # MiLB Statcast (A, AAA) then MLB Statcast 2026->2008, one .csv.gz per day
  python -m hitter_data.pulls statsapi    # MLB Stats API pitch-by-pitch, minor levels (sportId 11-14, 16), newest first
  python -m hitter_data.pulls retrosheet  # Retrosheet event files 1988-2026 (zip per season)
  python -m hitter_data.pulls counts      # rows per level x season, which levels carry location -> pulls_counts.csv

Re-running skips finished units (a day file or .empty marker, a game in done_<season>.txt, a season zip).
2026 is pulled and counted only (hitter_data.assert_not_heldout guards the fits)."""
import csv, datetime as dt, glob, gzip, io, json, os, sys, time, urllib.error, urllib.request, zipfile
from . import DATA

UA = {"User-Agent": "Mozilla/5.0 (research data pull; low rate)"}


def get(url, timeout=240, tries=4, pause=1.5):
    """bytes on success, None on 404, b"" when every try failed (the caller leaves the unit for the next run)."""
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
            time.sleep(pause)
            return body
        except urllib.error.HTTPError as e:
            if e.code == 404:
                time.sleep(pause)
                return None
            time.sleep(15 * (a + 1))
        except Exception:
            time.sleep(15 * (a + 1))
    return b""


# ---------- Baseball Savant ----------
SAV_MLB = ("https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7C&hfSea={y}%7C&player_type=pitcher"
           "&game_date_gt={d}&game_date_lt={d}&type=details")
SAV_MIN = ("https://baseballsavant.mlb.com/statcast-search-minors/csv?all=true&hfGT=R%7C&hfSea={y}%7C&player_type=pitcher"
           "&hfLevel={lv}%7C&game_date_gt={d}&game_date_lt={d}&type=details&minors=true")


def savant_plan():
    for lv, years in (("A", range(2026, 2020, -1)), ("AAA", range(2026, 2022, -1))):   # zone seed first
        for y in years:
            yield lv, y
    for y in range(2026, 2007, -1):
        yield "MLB", y


def savant():
    for lv, y in savant_plan():
        out = os.path.join(DATA, "statcast", lv, str(y)); os.makedirs(out, exist_ok=True)
        d, end = dt.date(y, 3, 1), min(dt.date(y, 11, 10), dt.date.today() - dt.timedelta(days=1))
        while d <= end:
            path = os.path.join(out, f"{d}.csv.gz"); empty = path + ".empty"
            if not (os.path.exists(path) or os.path.exists(empty)):
                url = SAV_MLB.format(y=y, d=d) if lv == "MLB" else SAV_MIN.format(y=y, d=d, lv=lv)
                body = get(url, pause=2.0)
                if body:
                    lines = body.count(b"\n")
                    if lines <= 1:
                        open(empty, "w").close()
                    else:
                        tmp = path + ".part"
                        with gzip.open(tmp, "wb") as f:
                            f.write(body)
                        os.replace(tmp, path)
                    print(lv, d, lines, flush=True)
            d += dt.timedelta(days=1)
    print("savant done", flush=True)


# ---------- MLB Stats API ----------
LEVELS = {11: "AAA", 12: "AA", 13: "A+", 14: "A", 16: "ROK"}
PITCH_COLS = ["game_pk", "date", "level", "season", "venue", "at_bat", "inning", "top", "batter", "bat_side",
              "pitcher", "pitch_hand", "pitch_number", "balls_before", "strikes_before", "outs_after_pitch", "call", "pitch_type", "speed",
              "px", "pz", "sz_top", "sz_bot", "in_play", "event", "launch_speed", "launch_angle", "trajectory", "hardness",
              "away_score", "home_score"]


def schedule(sport, season):
    url = (f"https://statsapi.mlb.com/api/v1/schedule?sportId={sport}&season={season}&gameType=R"
           f"&startDate={season}-01-01&endDate={season}-12-31")
    body = get(url, pause=1.0)
    if not body:
        return None
    games = []
    for day in json.loads(body).get("dates", []):
        for g in day["games"]:
            if g.get("status", {}).get("abstractGameState") == "Final":
                games.append((g["gamePk"], day["date"], (g.get("venue") or {}).get("name", "")))
    return games


def pbp_rows(pk, date, level, season, venue, data):
    rows = []
    for p in data.get("allPlays", []):
        ab, m, res = p.get("about", {}), p.get("matchup", {}), p.get("result", {})
        evs = p.get("playEvents", [])
        last_pitch = max([i for i, e in enumerate(evs) if e.get("isPitch")], default=-1)
        b = s = 0
        for i, e in enumerate(evs):
            c = e.get("count", {})
            if not e.get("isPitch"):
                b, s = c.get("balls", b), c.get("strikes", s)
                continue
            d, pd, hd = e.get("details", {}), e.get("pitchData", {}) or {}, e.get("hitData", {}) or {}
            co = pd.get("coordinates", {}) or {}
            rows.append([pk, date, level, season, venue, ab.get("atBatIndex"), ab.get("inning"), int(bool(ab.get("isTopInning"))),
                         m.get("batter", {}).get("id"), m.get("batSide", {}).get("code"), m.get("pitcher", {}).get("id"),
                         m.get("pitchHand", {}).get("code"), e.get("pitchNumber"), b, s, c.get("outs", ""),
                         (d.get("call") or {}).get("code", d.get("code")), (d.get("type") or {}).get("code", ""),
                         pd.get("startSpeed", ""), co.get("pX", ""), co.get("pZ", ""),
                         pd.get("strikeZoneTop", ""), pd.get("strikeZoneBottom", ""), int(bool(d.get("isInPlay"))),
                         res.get("eventType", "") if i == last_pitch else "",
                         hd.get("launchSpeed", ""), hd.get("launchAngle", ""), hd.get("trajectory", ""), hd.get("hardness", ""),
                         res.get("awayScore", ""), res.get("homeScore", "")])
            b, s = c.get("balls", b), c.get("strikes", s)
    return rows


def statsapi(seasons=range(2026, 2004, -1)):
    root = os.path.join(DATA, "statsapi"); os.makedirs(root, exist_ok=True)
    for season in seasons:
        for sport, level in LEVELS.items():
            d = os.path.join(root, level); os.makedirs(d, exist_ok=True)
            if os.path.exists(os.path.join(d, f"nopitch_{season}.txt")):
                continue
            sched_path = os.path.join(d, f"schedule_{season}.json")
            if os.path.exists(sched_path):
                games = json.load(open(sched_path))
            else:
                games = schedule(sport, season)
                if games is None:
                    continue
                json.dump(games, open(sched_path, "w"))
            done_path = os.path.join(d, f"done_{season}.txt")
            done = set(open(done_path).read().split()) if os.path.exists(done_path) else set()
            todo = [g for g in games if str(g[0]) not in done]
            print(level, season, len(games), "games,", len(todo), "to fetch", flush=True)
            out_path = os.path.join(d, f"pitches_{season}.csv.gz")
            new = not os.path.exists(out_path)
            nopitch = 0
            for i, (pk, date, venue) in enumerate(todo):
                body = get(f"https://statsapi.mlb.com/api/v1/game/{pk}/playByPlay", pause=0.7)
                if body == b"":
                    continue
                rows = pbp_rows(pk, date, level, season, venue, json.loads(body)) if body else []
                nopitch += not rows
                # one gzip member per game: a crash mid-write loses at most that game (it isn't in done yet)
                with gzip.open(out_path, "at", newline="", encoding="utf-8") as f:
                    w = csv.writer(f)
                    if new:
                        w.writerow(PITCH_COLS); new = False
                    w.writerows(rows)
                with open(done_path, "a") as f:
                    f.write(f"{pk}\n")
                if i % 250 == 0:
                    print(level, season, i, "/", len(todo), "games with no pitch events so far:", nopitch, flush=True)
                if nopitch >= 60 and nopitch == i + 1:
                    print(level, season, "first 60 games carry no pitch events; skipping this level-season", flush=True)
                    open(os.path.join(d, f"nopitch_{season}.txt"), "w").write("first 60 games had no pitch events\n")
                    break
    print("statsapi done", flush=True)


# ---------- Retrosheet ----------
def retrosheet(years=range(1988, 2027)):
    root = os.path.join(DATA, "retrosheet"); os.makedirs(root, exist_ok=True)
    for y in years:
        path = os.path.join(root, f"{y}eve.zip")
        if os.path.exists(path) or os.path.exists(path + ".missing"):
            continue
        body = get(f"https://www.retrosheet.org/events/{y}eve.zip", pause=3.0)
        if body is None:
            open(path + ".missing", "w").close(); print(y, "missing", flush=True); continue
        if body:
            open(path, "wb").write(body); print(y, len(body), flush=True)
    print("retrosheet done", flush=True)


# ---------- counts ----------
def _gz_rows(f):
    try:
        with gzip.open(f, "rt", encoding="utf-8", errors="replace") as fh:
            yield from csv.reader(fh)
    except (EOFError, gzip.BadGzipFile, OSError):
        return        # a file still being appended: count what's readable


def counts():
    out = []
    for lv in ("MLB", "AAA", "A"):
        for yd in sorted(glob.glob(os.path.join(DATA, "statcast", lv, "*"))):
            n = loc = days = 0
            for f in glob.glob(os.path.join(yd, "*.csv.gz")):
                days += 1
                it = _gz_rows(f); h = next(it, None)
                if not h:
                    continue
                ix = h.index("plate_x") if "plate_x" in h else None
                for row in it:
                    n += 1
                    if ix is not None and len(row) > ix and row[ix] not in ("", "NA", "null"):
                        loc += 1
            out.append(["statcast", lv, os.path.basename(yd), days, n, loc])
    for lv in LEVELS.values():
        for f in sorted(glob.glob(os.path.join(DATA, "statsapi", lv, "pitches_*.csv.gz"))):
            season = os.path.basename(f)[8:12]; n = loc = 0; games = set()
            it = _gz_rows(f); h = next(it, None)
            if not h:
                continue
            gi, xi = h.index("game_pk"), h.index("px")
            for row in it:
                if row == h:
                    continue
                n += 1; games.add(row[gi])
                if row[xi]:
                    loc += 1
            out.append(["statsapi", lv, season, len(games), n, loc])
    for f in sorted(glob.glob(os.path.join(DATA, "retrosheet", "*eve.zip"))):
        y = os.path.basename(f)[:4]; pa = with_pitches = 0
        with zipfile.ZipFile(f) as z:
            for name in z.namelist():
                if name[-4:].upper() not in (".EVA", ".EVN"):
                    continue
                for line in io.TextIOWrapper(z.open(name), encoding="latin-1"):
                    if line.startswith("play,"):
                        parts = line.rstrip("\r\n").split(",")
                        if len(parts) >= 7 and parts[6] != "NP":
                            pa += 1
                            if parts[5] not in ("", "??"):
                                with_pitches += 1
        out.append(["retrosheet", "MLB", y, "", pa, with_pitches])
    p = os.path.join(DATA, "pulls_counts.csv")
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["source", "level", "season", "days_or_games", "rows", "rows_with_location_or_pitch_string"])
        w.writerows(out)
    for r in out:
        print(*r)
    print("wrote", p)


if __name__ == "__main__":
    {"savant": savant, "statsapi": statsapi, "retrosheet": retrosheet, "counts": counts}[sys.argv[1]]()
