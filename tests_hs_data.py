"""v1.3 Part 1 (HS / travel) tests: the Perfect Game pitch-log parser, quality checks, snapshot checks and the
incremental ingest on short invented rows (no archive, no real names). usage: python3 tests_hs_data.py"""
import csv, json, os, shutil, sys, tempfile
from hitter_data import hs_parse, hs_quality, hs_snapshot, hs_ingest

FAILS = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else f"  ({detail})"))
    if not cond:
        FAILS.append(name)


PBP_COLS = ("game_id sequence batter_group inning inning_half batting_side batting_team batter batter_number pitcher "
            "pitcher_number record_type source_pitch_number pitch_outcome pitch_type velocity_mph count_shown "
            "balls_after strikes_after outs_shown play_text source_url batter_id pitcher_id play_notes").split()
GAME_COLS = ("game_id level event_id event game_date game_number scheduled_time venue away_team home_team away_runs "
             "home_runs away_hits home_hits away_errors home_errors number_of_pitch_rows number_of_other_events "
             "pitches_with_velocity box_pitch_total pitch_count_difference inning_scores_match complete_lineups "
             "roster_team_count source_url series age_group game_status").split()


class G:
    """builds one invented game: G().pa('top', 1, 'Al Avery', ['Ball', ...]) ..."""

    def __init__(self, gid="900001"):
        self.gid, self.rows, self.group, self.seq = gid, [], 0, 0

    def pa(self, half, inning, batter, pitches, pitcher=None, bid="", pid="", group=None):
        """pitches: list of (outcome, text, count_after, outs_shown, type, velo) or outcome strings; an item
        ('event', text) adds an event row."""
        self.group += 1
        side = "away" if half == "top" else "home"
        pitcher = pitcher or ("Hal Home" if side == "away" else "Vic Visit")
        b = s = 0
        for i, p in enumerate(pitches, 1):
            self.seq += 1
            if isinstance(p, str):
                p = (p,)
            if p[0] == "event":
                self.rows.append(self._row(group or self.group, inning, half, side, batter, pitcher, "event", "", "",
                                           "", "", p[1], "", "", bid, pid))
                continue
            outc = p[0]
            text = p[1] if len(p) > 1 and p[1] else outc
            cnt = p[2] if len(p) > 2 else None
            outs = p[3] if len(p) > 3 else ""
            pt = p[4] if len(p) > 4 else "Fastball"
            velo = p[5] if len(p) > 5 else "80"
            if cnt is None:
                if outc == "Ball":
                    b += 1
                elif outc in ("Strike Called", "Strike Swinging"):
                    s += 1
                elif outc == "Foul":
                    s += s < 2
                else:
                    cnt = ""
                if cnt is None:
                    cnt = f"{b}-{s}"
            self.rows.append(self._row(group or self.group, inning, half, side, batter, pitcher, "pitch", str(i), outc,
                                       pt, velo, text, cnt, outs, bid, pid))
        return self

    def _row(self, grp, inning, half, side, batter, pitcher, rt, num, outc, pt, velo, text, cnt, outs, bid, pid):
        ba, sa = (cnt.split("-") if cnt and rt == "pitch" else ("", ""))
        return dict(zip(PBP_COLS, (self.gid, str(self.seq), str(grp), str(inning), half, side,
                                   "Away Club" if side == "away" else "Home Club", batter, "", pitcher, "", rt, num,
                                   outc, pt, velo, cnt, ba, sa, outs, text, "", bid, pid, "")))

    def game(self, ar, hr, box=None, **kw):
        d = dict.fromkeys(GAME_COLS, "")
        d.update(game_id=self.gid, level="travel_ball", event_id="1", event="Invented Cup 16U", game_date="2025-07-01",
                 game_number="3", away_team="Away Club", home_team="Home Club", away_runs=str(ar), home_runs=str(hr),
                 number_of_pitch_rows=str(sum(r["record_type"] == "pitch" for r in self.rows)),
                 box_pitch_total="" if box is None else str(box), series="Invented Series", age_group="16U",
                 game_status="final", inning_scores_match="1", roster_team_count="2")
        d.update(kw)
        return d


LINEUPS = [dict(game_id="900001", side="away", player=n, batting_order=str(i)) for i, n in
           enumerate(["Al Avery", "Bo Brook", "Cy Cole", "Di Dale"], 1)] + \
          [dict(game_id="900001", side="home", player=n, batting_order=str(i)) for i, n in
           enumerate(["Ed Ely", "Fa Finn", "Gus Gray"], 1)]
ROSTERS = [dict(game_id="900001", side="away", player_id="11", player="Al Avery", bats="L", throws="R"),
           dict(game_id="900001", side="away", player_id="12", player="Bo Brook", bats="S", throws="R"),
           dict(game_id="900001", side="away", player_id="", player="Cy Cole", bats="R", throws="R"),
           dict(game_id="900001", side="home", player_id="21", player="Hal Home", bats="R", throws="L"),
           dict(game_id="900001", side="away", player_id="13", player="Vic Visit", bats="R", throws="R"),
           dict(game_id="900001", side="home", player_id="22", player="Ed Ely", bats="R", throws="R")]


def t_letters_and_counts():
    g = G()
    g.pa("top", 1, "Al Avery", ["Strike Called", "Ball", "Foul", "Ball", "Foul", "Foul",
                                "Ball", ("Walk", "Walk", "")], bid="11", pid="21")
    g.pa("top", 1, "Bo Brook", ["Strike Swinging", "Foul", ("Strike Out Looking", "", "", "1")], bid="12")
    g.pa("top", 1, "Cy Cole", ["Ball", ("Single", "Single Line to RF Al Avery advanced to 3rd Base", "", "", "Slider", "")])
    g.pa("top", 1, "Di Dale", [("Out", "Out Fly to CF SF-8 Al Avery scored", "", "2", "Change-Up", "70")])
    g.pa("top", 1, "Al Avery", [("Out", "Out Ground ball to SS 6-3", "", "3", "Curveball", "65")])
    pas, pitches, info = hs_parse.parse_game(g.game(1, 0), g.rows, LINEUPS, ROSTERS)
    check("walk: letters, terminal B, count before 3-2", pas[0]["pitches"] == "KBFBFFBB" and pas[0]["result"] == "BB"
          and (pas[0]["balls"], pas[0]["strikes"]) == (3, 2), pas[0])
    check("strikeout looking ends in K", pas[1]["pitches"] == "SFK" and pas[1]["result"] == "K_L")
    check("in-play pitch lettered X per pitch, left out of the PA string",
          pitches[-1]["letter"] == "X" and pas[2]["pitches"] == "B" and pas[2]["n_pitches"] == 2)
    check("sac fly result, run counted, runs rest of inning",
          pas[3]["result"] == "SF" and pas[3]["runs_on_play"] == 1 and pas[0]["runs_rest_inning"] == 1
          and pas[4]["runs_rest_inning"] == 0)
    check("bases replayed (walk, single moves runner to 3rd)",
          [p["bases_before"] for p in pas] == ["000", "100", "100", "101", "100"], [p["bases_before"] for p in pas])
    check("outs replayed", [p["outs_before"] for p in pas] == [0, 0, 1, 1, 2] and info["halves"][0]["outs_final"] == 3)
    check("count before each pitch", [(p["balls"], p["strikes"]) for p in pitches[:8]] ==
          [(0, 0), (0, 1), (1, 1), (1, 2), (2, 2), (2, 2), (2, 2), (3, 2)])
    check("count replay consistent on every pitch", all(p["count_ok"] in (1, None) for p in pitches)
          and sum(p["count_ok"] == 1 for p in pitches) >= 10)
    check("pitch class", [pitches[i]["pitch_class"] for i in (0, -1)] == ["fastball", "breaking"]
          and pitches[-2]["pitch_class"] == "offspeed")
    check("velocity kept / missing", pitches[0]["velo"] == 80.0 and pitches[-3]["velo"] is None)
    check("lineup slot", [p["slot"] for p in pas] == [1, 2, 3, 4, 1])
    check("handedness by id, by name, switch", pas[0]["bats"] == "L" and pas[1]["bats"] == "S" and pas[2]["bats"] == "R"
          and pas[0]["throws"] == "L", [(p["bats"], p["throws"]) for p in pas])
    check("bip type / direction", pas[2]["bip_type"] == "line" and pas[2]["bip_dir"] == "R"
          and pas[4]["bip_type"] == "ground" and pas[4]["bip_dir"] == "L")
    qc = hs_quality.game_qc(g.game(1, 0, box=15), pas, pitches, info, {"away": ["1"], "home": ["0"]})
    check("qc: 3-out half, line and final match, box diff 0", qc["halves_3out"] == 1 and qc["halves_runs_match"] == 1
          and qc["final_match"] == 1 and qc["box_diff"] == 0 and qc["full_log"] == 1, qc)


def t_results_and_runners():
    g = G()
    g.pa("top", 1, "Al Avery", [("Double", "Double Line to LF")])
    g.pa("top", 1, "Bo Brook", [("Hit by Pitch", "Hit by Pitch")])
    g.pa("top", 1, "Cy Cole", [("Double", "Double Play Ground ball to SS 6-4-3 Al Avery advanced to 3rd Base", "",
                                "2")])
    g.pa("top", 1, "Di Dale", [("Homerun", "Homerun Fly HR Al Avery scored Di Dale scored")])
    g.pa("top", 1, "Al Avery", [("Dropped Third Strike", "Dropped Third Strike (Swinging) K-2-3", "", "3")])
    g.pa("bottom", 1, "Ed Ely", ["Ball", ("Strikeout Swinging",
                                          "Strikeout Swinging Dropped Wild Pitch (Swinging) Ed Ely reached 1st base")])
    g.pa("bottom", 1, "Fa Finn", [("event", "Courtesy Substitution Zed Zoom running for Ed Ely on 1st base."),
                                  ("Ball", "Ball Zed Zoom steals 2nd Base"),
                                  ("Fielder's Choice", "Fielder's Choice Ground ball to 3B FC-5-4", "", "1")])
    g.pa("bottom", 1, "Gus Gray", [("Reached on Error", "Reached on Error Ground ball to SS EF-6 Fa Finn advanced to "
                                                        "3rd Base")])
    g.pa("bottom", 1, "Ed Ely", [("event", "Fa Finn was picked off 2-5"), ("Ball", "Ball", "1-0", "")])
    pas, pitches, info = hs_parse.parse_game(g.game(2, 0), g.rows + [], LINEUPS, ROSTERS)
    # the picked-off row shows no outs here: inferred from the text
    r = [p["result"] for p in pas]
    check("Double Play is not a double", r[2] == "DP" and r[0] == "2B", r)
    check("DP removes the forced runner from first, lead runner moves", pas[3]["bases_before"] == "001"
          and pas[3]["outs_before"] == 2, (pas[3]["bases_before"], pas[3]["outs_before"]))
    check("homer: batter's own 'scored' counted once", pas[3]["runs_on_play"] == 2 and info["halves"][0]["runs"] == 2)
    check("dropped third strike thrown out = strikeout", r[4] == "K_S")
    check("dropped third strike, reached", r[5] == "K_S_reached" and pas[6]["bases_before"] == "100")
    check("courtesy runner takes the base; steal moves him; FC-5-4 puts out a runner, batter on first",
          pas[6]["result"] == "FC" and pas[7]["bases_before"] == "100" and pas[7]["outs_before"] == 1,
          (pas[7]["bases_before"], pas[7]["outs_before"]))
    check("error puts the batter on first", r[7] == "E" and pas[8]["bases_before"] == "101")
    check("pickoff (no outs shown) inferred from text", pitches[-1]["outs_before"] == 2
          and pitches[-1]["bases_before"] == "100", (pitches[-1]["outs_before"], pitches[-1]["bases_before"]))
    check("PA cut short by the game ending is flagged", "no_result" in pas[8]["flags"])


def t_runner_rows_and_tiebreaker():
    g = G()
    g.pa("top", 8, "Al Avery", [("event", "Tie Breaker Automatic Out Bo Brook at 1st base Cy Cole at 2nd base Di "
                                          "Dale at 3rd base"),
                                "Ball", ("Wild Pitch", "Wild Pitch Di Dale scored Cy Cole advanced to 3rd Base. Bo Brook "
                                                       "advanced to 2nd Base", "2-0", "", "", ""),
                                ("Stolen Base", "Stolen Base Bo Brook steals 3rd Base", "2-0", ""),
                                ("Single", "Single Line to CF Cy Cole scored")])
    g.pa("top", 8, "Bo Brook", [("event", "Intentional Walk IBB")])
    g.pa("top", 8, "Cy Cole", [("Walk", "Walk 1 run scored Al Avery advanced to 2nd Base. Bo Brook advanced to 3rd "
                                        "Base", "")], group=None)
    pas, pitches, info = hs_parse.parse_game(g.game(3, 0), g.rows, LINEUPS, ROSTERS)
    check("tie-breaker: bases loaded, one out, flagged per game", info["tie_breaker"] and pitches[0]["bases_before"] == "111"
          and pitches[0]["outs_before"] == 1)
    check("wild-pitch row whose count moved is a ball", pitches[1]["letter"] == "B" and pitches[1]["balls"] == 1)
    check("stolen-base row with the count unchanged is not a pitch", len(pas[0]["pitches"]) == 2)
    check("runs from 'scored' mentions", info["halves"][0]["runs"] == 3, info["halves"][0]["runs"])
    check("IBB without a pitch ends the PA", pas[1]["result"] == "IBB" and pas[1]["n_pitches"] == 0)
    check("anonymous '1 run scored' counts a run", pas[2]["runs_on_play"] == 1)
    check("score before the PA", pas[2]["bat_score_before"] == 2 and pas[2]["fld_score_before"] == 0)


def t_orphans_and_pitching_change():
    g = G()
    g.pa("top", 1, "Al Avery", [("event", "Jo Jet P entered the game for Hal Home P"), "Ball",
                                ("Out", "Out Pop to SS Pop Out-6", "", "1")], pitcher="Jo Jet")
    # an unlabeled group (no inning) before the next batter: merged into the next group
    g.pa("top", 1, "", ["Strike Called"])
    for r in g.rows[-1:]:
        r["inning"], r["inning_half"], r["batter"] = "", "", ""
    g.pa("top", 1, "Bo Brook", [("Out", "Out Fly to LF Fly Out-7", "", "2")], pitcher="Jo Jet")
    pas, pitches, info = hs_parse.parse_game(g.game(0, 0), g.rows, LINEUPS, ROSTERS)
    check("pitcher per pitch after a mid-group change", pas[0]["pitcher"] == "Jo Jet")
    check("unlabeled group merged into the next batter", len(pas) == 2 and pas[1]["pitches"] == "K"
          and "orphan_rows_merged" in pas[1]["flags"], [(p["batter"], p["pitches"]) for p in pas])
    check("pitch counter / count after the merged strike", pitches[-1]["strikes"] == 1)


def t_helpers():
    check("pitch class map", hs_parse.pitch_class("Change-Up") == "offspeed" and hs_parse.pitch_class("") == "unknown"
          and hs_parse.pitch_class("Knuckle") == "other")
    check("name resolve: suffix match, last name fallback",
          hs_parse.resolve(" Line to RF Al Avery", ["Al Avery", "Bo Brook"]) == "Al Avery"
          and hs_parse.resolve(" Brook", ["Al Avery", "Bo Brook"]) == "Bo Brook")
    check("tagged up is not part of a name", hs_parse.resolve(" Fly Out-8 Al Avery tagged up and", ["Al Avery"]) == "Al Avery")
    check("seg_name strips the descriptor", hs_parse.seg_name(" Ground ball to SS 6-4 Zed Zoom") == "Zed Zoom")
    check("fielding chain -> runner out preference", hs_parse.out_preference("FC-1-5") == [2]
          and hs_parse.out_preference("FC-5-4") == [1]
          and hs_parse.out_preference("6-4-3") == [1] and hs_parse.out_preference("9-2") == [3, 2, 1])
    check("no bat-type field anywhere", not any("bat_type" in c or "bbcor" in c.lower() for c in
                                                hs_ingest.SCHEMA.split()))


def _write_csv(path, cols, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(cols)
        for r in rows:
            w.writerow([r.get(c, "") for c in cols])


def t_snapshot_and_ingest():
    tmp = tempfile.mkdtemp(prefix="hs_test_")
    try:
        arc, snap = os.path.join(tmp, "arc"), os.path.join(tmp, "snap")
        os.makedirs(os.path.join(arc, "scorecards"))
        g1 = G("900001").pa("top", 1, "Al Avery", [("Out", "Out Ground ball to 2B 4-3", "", "1")])
        g2 = G("900002").pa("top", 1, "Bo Brook", [("Single", "Single Line to LF")])
        games = [g1.game(0, 0, box=1), g2.game(0, 0, box=1, game_id="900002")]
        _write_csv(os.path.join(arc, "games.csv"), GAME_COLS, games)
        _write_csv(os.path.join(arc, "pitch_by_pitch.csv"), PBP_COLS, g1.rows + g2.rows)
        _write_csv(os.path.join(arc, "lineups.csv"), ["game_id", "side", "player", "batting_order"], LINEUPS)
        _write_csv(os.path.join(arc, "rosters.csv"), ["game_id", "side", "player_id", "player", "bats", "throws"], ROSTERS)
        _write_csv(os.path.join(arc, "coverage.csv"), ["level", "event_year", "age_group", "scheduled_finals"],
                   [dict(level="travel_ball", event_year="2025", age_group="16U", scheduled_finals="5")])
        json.dump({"box": {"scores": [["Final", "1", "", "R", "H", "E"], ["Away Club", "0", "0", "1", "0"],
                                      ["Home Club", "0", "0", "0", "0"]]}},
                  open(os.path.join(arc, "scorecards", "900001.json"), "w", encoding="utf-8"))
        logs = []
        r = hs_snapshot.snapshot(src=arc, dst=snap, log=logs.append)
        check("snapshot copies and checks", r["changed"] and r["games"] == 2 and r["rows"]["pitch_by_pitch"] == 2, r)
        r2 = hs_snapshot.snapshot(src=arc, dst=snap, log=logs.append)
        check("snapshot skips an unchanged archive", r2["changed"] is False)
        # a truncated copy fails the checks
        bad = os.path.join(tmp, "bad.csv")
        with open(bad, "w", newline="", encoding="utf-8") as f:
            f.write('"game_id","x"\n"1","a"\n"2"')
        n, ids, probs = hs_snapshot.check_csv(bad)
        check("truncated last line detected", any("truncated" in p for p in probs) and any("fields" in p for p in probs),
              probs)
        con = hs_ingest.connect(os.path.join(tmp, "hs.sqlite3"))
        a = hs_ingest.ingest(con, snap=snap, archive=arc, take_snapshot=False, log=logs.append)
        check("first ingest parses both games", a["new"] == 2 and a["parsed"] == 2 and a["errors"] == 0, a)
        b = hs_ingest.ingest(con, snap=snap, archive=arc, take_snapshot=False, log=logs.append)
        check("second ingest parses nothing", b["parsed"] == 0, b)
        # change one game's content: only it re-parses; add a third game
        g2.rows[0]["velocity_mph"] = "77"
        g3 = G("900003").pa("bottom", 1, "Ed Ely", [("Walk", "Walk", "")])
        games.append(g3.game(0, 0, game_id="900003"))
        _write_csv(os.path.join(arc, "games.csv"), GAME_COLS, games)
        _write_csv(os.path.join(arc, "pitch_by_pitch.csv"), PBP_COLS, g1.rows + g2.rows + g3.rows)
        hs_snapshot.snapshot(src=arc, dst=snap, log=logs.append)
        c = hs_ingest.ingest(con, snap=snap, archive=arc, take_snapshot=False, log=logs.append)
        check("incremental: one new, one changed", c["new"] == 1 and c["changed"] == 1 and c["parsed"] == 2, c)
        line = con.execute("SELECT line_away FROM hs_games WHERE game_id='900001'").fetchone()[0]
        check("line score read from the scorecard", json.loads(line) == ["0"], line)
        out = os.path.join(tmp, "reports")
        t = hs_quality.report(con, log=logs.append, out=out, snap=snap)
        check("reports written", all(os.path.exists(os.path.join(out, f)) for f in
                                     ("quality.csv", "coverage.csv", "summary.txt", "unparsed_top20.csv")) and t["games"] == 3)
        cov = list(csv.reader(open(os.path.join(out, "coverage.csv"), encoding="utf-8")))
        check("coverage joins the archive's scheduled finals", any(r[:4] == ["2025", "travel_ball", "16U", "5"]
                                                                   for r in cov), cov)
        con.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    for t in (t_letters_and_counts, t_results_and_runners, t_runner_rows_and_tiebreaker, t_orphans_and_pitching_change,
              t_helpers, t_snapshot_and_ingest):
        t()
    print(f"\n{'FAILED: ' + ', '.join(FAILS) if FAILS else 'all passed'}")
    sys.exit(1 if FAILS else 0)
