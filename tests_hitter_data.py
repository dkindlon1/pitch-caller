"""v1.3 Part 1 tests: the college play-by-play parser on short synthetic lines (no archive needed), the held-out guard,
and ingest helpers. usage: python3 tests_hitter_data.py"""
import sys
from hitter_data import parse, ingest, assert_not_heldout, fit_seasons, HeldOutSeasonError

FAILS = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else f"  ({detail})"))
    if not cond:
        FAILS.append(name)


def game(lines, away="Away U", home="Home U", lineups=()):
    """lines: [(label, text, away_score, home_score)] -> parse_game output"""
    plays = [(i + 1, lab, txt, a, h) for i, (lab, txt, a, h) in enumerate(lines)]
    return parse.parse_game(plays, lineups, away, home)


T1, B1 = "Away U - Top of 1st", "Home U - Bottom of 1st"


def L(label, text, a="", h=""):
    return (label, text, a, h)


# ---------- pitch strings ----------
def t_pitch_strings():
    pas, _, _ = game([L(T1, "A. Able walked (3-2 BBFBKB)."), L(T1, "B. Baker struck out looking (1-2 BKFK)."),
                      L(T1, "C. Cole struck out swinging (2-2 BSBFS)."), L(T1, "D. Dunn grounded out to ss (0-1 K)."),
                      L(T1, "E. Ely flied out to cf (0-0).")])
    check("walk letters kept", pas[0]["pitches"] == "BBFBKB" and pas[0]["balls"] == 3 and pas[0]["strikes"] == 2)
    check("struck out looking ends in K", pas[1]["result"] == "K_L" and pas[1]["pitches"][-1] == "K")
    check("struck out swinging ends in S", pas[2]["result"] == "K_S" and pas[2]["pitches"][-1] == "S")
    check("count replay: walk (count before the last B)", pas[0]["count_ok"] is True, pas[0])
    check("count replay: in play (string reaches count)", pas[3]["count_ok"] is True)
    check("count only: no letters, count kept", pas[4]["pitches"] is None and pas[4]["balls"] == 0)
    check("replay rule: fouls stop at two strikes", parse.replay("FFFFB") == (1, 2))
    check("inconsistent string flagged", parse.count_consistent(2, 1, "BK", "GO") is False)


# ---------- results ----------
def t_results():
    cases = {
        "X. Xu hit by pitch (0-1 K).": "HBP", "X. Xu intentionally walked.": "IBB", "X. Xu singled to left field.": "1B",
        "X. Xu doubled down the lf line.": "2B", "X. Xu tripled to right center.": "3B", "X. Xu homered to left field, RBI.": "HR",
        "X. Xu reached first on an error by ss.": "E", "X. Xu reached on a fielding error by 3b.": "E",
        "X. Xu reached on a fielder's choice.": "FC", "X. Xu reached on catcher's interference.": "CI",
        "X. Xu popped up to 2b.": "PO", "X. Xu lined out to cf.": "LO", "X. Xu fouled out to c.": "FOUL_O",
        "X. Xu out at first p to 2b, SAC, bunt.": "SH", "X. Xu flied out to rf, SF, RBI.": "SF",
        "X. Xu sacrifice fly to right center putout by cf, RBI.": "SF", "X. Xu struck out.": "K",
        "X. Xu grounded into double play ss to 2b to 1b.": "GDP", "X. Xu infield singled to short.": "1B",
    }
    for text, want in cases.items():
        pas, _, _ = game([L(T1, text)])
        got = pas[0]["result"] if pas else None
        check(f"result {want}: {text}", got == want, got)
    pas, _, _ = game([L(T1, "X. Xu infield singled to short.")])
    check("batter name strips 'infield'", pas[0]["batter"] == "X. Xu", pas[0]["batter"])
    pas, _, _ = game([L(T1, "X. Xu struck out swinging, reached first on a wild pitch (1-2 BSKS).")])
    check("dropped third strike reaches", pas[0]["result"] == "K_S_reached" and pas[0]["outs_on_play"] == 0)
    pas, _, _ = game([L(T1, "X. Xu struck out swinging, out at first c to 1b (1-2 BKFS).")])
    check("dropped third strike thrown out = one out", pas[0]["outs_on_play"] == 1, pas[0]["outs_on_play"])


# ---------- ball in play ----------
def t_bip():
    t = lambda s: game([L(T1, s)])[0][0]
    check("grounder to ss: ground, left", (t("X. Xu grounded out to ss.")["bip_type"], t("X. Xu grounded out to ss.")["bip_dir"]) == ("ground", "L"))
    check("single through the right side: ground, right", (t("X. Xu singled through the right side.")["bip_type"],
                                                            t("X. Xu singled through the right side.")["bip_dir"]) == ("ground", "R"))
    check("double down the lf line: left", t("X. Xu doubled down the lf line.")["bip_dir"] == "L")
    check("single up the middle: center ground", (t("X. Xu singled up the middle.")["bip_type"], t("X. Xu singled up the middle.")["bip_dir"]) == ("ground", "C"))
    check("to right center: RC", t("X. Xu tripled to right center.")["bip_dir"] == "RC")
    check("bunt", t("X. Xu singled to third base, bunt.")["bip_type"] == "bunt")
    check("popped up: pop", t("X. Xu popped up to 2b.")["bip_type"] == "pop")
    check("fouled out to lf: fly", t("X. Xu fouled out to lf.")["bip_type"] == "fly")
    check("liner", t("X. Xu lined out to 3b.")["bip_type"] == "line")
    check("walk: no ball in play", t("X. Xu walked.")["in_play"] == 0 and t("X. Xu walked.")["bip_type"] is None)


# ---------- game state ----------
def t_state():
    pas, lines, info = game([
        L(T1, "A. Able singled to left field."),
        L(T1, "B. Baker walked; A. Able advanced to second."),
        L(T1, "C. Cole doubled to left center, 2 RBI; B. Baker scored; A. Able scored."),     # two runners score
        L(T1, "D. Dunn grounded out to 2b; C. Cole advanced to third."),
        L(T1, "C. Cole scored on a wild pitch."),                                                # mid-PA runner event
        L(T1, "E. Ely struck out swinging (1-2 KBSS)."),
        L(T1, "F. Fox flied out to cf."),
        L(B1, "G. Gee reached first on a throwing error by 3b, advanced to second."),           # error on the throw
        L(B1, "H. Hall pinch hit for I. Ivy."),                                                  # substitution mid-inning
        L(B1, "H. Hall singled to center field, RBI; G. Gee scored, unearned."),
        L(B1, "H. Hall stole second."),                                                          # steal during next PA
        L(B1, "J. Jones walked (3-1 BKBBB)."),
        L(B1, "K. King grounded into double play ss to 2b to 1b; J. Jones out on the play."),
        L(B1, "L. Lee popped up to ss."),
    ])
    p = {x["batter"]: x for x in pas}
    check("bases before: runner on first", p["B. Baker"]["bases_before"] == "100")
    check("bases before: first and second", p["C. Cole"]["bases_before"] == "110")
    check("two runners score on one play", p["C. Cole"]["runs_on_play"] == 2)
    check("runner to third on a ground out (the wild pitch comes during the next PA)",
          p["E. Ely"]["bases_before"] == "001" and p["E. Ely"]["outs_before"] == 1,
          (p["E. Ely"]["bases_before"], p["E. Ely"]["outs_before"]))
    check("wild-pitch run counted during E. Ely's PA", p["E. Ely"]["mid_pa_events"] == 1)
    check("top 1st: 3 runs total", info["halves"][0]["runs"] == 3 and info["halves"][0]["outs_final"] == 3)
    check("runs rest of inning from A. Able's PA = 3", p["A. Able"]["runs_rest_inning"] == 3)
    check("error on throw: batter to second", p["H. Hall"]["bases_before"] == "010", p["H. Hall"]["bases_before"])
    check("pinch hitter takes the batting slot", p["H. Hall"]["slot"] == 2)
    check("steal interrupts J. Jones's PA: bases before the PA = first", p["J. Jones"]["bases_before"] == "100",
          p["J. Jones"]["bases_before"])
    check("double play: two outs", p["K. King"]["outs_on_play"] == 2, p["K. King"]["outs_on_play"])
    check("bottom 1st ends with 3 outs", info["halves"][1]["outs_final"] == 3, info["halves"][1]["outs_final"])
    check("final score parsed", info["final_parsed"] == [3, 1], info["final_parsed"])


def t_more_state():
    pas, _, info = game([
        L(T1, "A. Able walked."), L(T1, "B. Baker walked."), L(T1, "C. Cole walked."),
        L(T1, "D. Dunn walked."),            # bases loaded walk with silent runners: forced run
        L(T1, "E. Ely grounded into double play 3b to c to 1b."),   # runner out not written: inferred
        L(T1, "F. Fox singled to third base, bunt; B. Baker advanced to third."),
        L(T1, "G. Gee out at second c to ss, caught stealing."),     # not on base: still an out
    ])
    p = {x["batter"]: x for x in pas}
    check("bases-loaded walk forces in a run", p["D. Dunn"]["runs_on_play"] == 1, p["D. Dunn"]["runs_on_play"])
    check("double play with a silent runner: two outs", p["E. Ely"]["outs_on_play"] == 2)
    check("comma names don't move the batter ('to third base' is the ball, not him)",
          parse.batter_dest_of("1B", " to third base, bunt") == 1)
    pas, _, info = game([L(T1, "Potvin, C. doubled to right center."),
                         L(T1, "Smith, J. singled to third base, bunt; Potvin, C. advanced to third.")])
    check("'Last, F.' names: batter on first, runner on third, no run", info["final_parsed"] == [0, 0] and
          pas[1]["runs_on_play"] == 0, (info["final_parsed"], pas[1]["runs_on_play"]))
    # Presto "(n out)" corrects the state
    pas, _, info = game([L("Away U Top of 1st Inning", "Able flied out to cf. (1 out)"),
                         L("Away U Top of 1st Inning", "Baker reached on a fielder's choice. (1 out)"),
                         L("Away U Top of 1st Inning", "Cole lined out to ss. (2 out)"),
                         L("Away U Top of 1st Inning", "Dunn grounded out to 3b. (3 out)")])
    check("Presto inning label and (n out)", info["halves"][0]["half"] == "top" and info["halves"][0]["outs_final"] == 3)
    pas, _, info = game([L(T1, "Larson,Colin walked."), L(T1, "Gallo,Luke walked; Larson,Colin advanced to second base."),
                         L(T1, "Solier,Julio singled, RBI; Larson,Colin scored from second base; "
                               "Gallo,Luke advanced from first base to third base."),
                         L(T1, "Wang,Nick walked.")])
    check("'advanced from first base to third base'", pas[3]["bases_before"] == "101" and info["final_parsed"] == [1, 0],
          (pas[3]["bases_before"], info["final_parsed"]))
    pas, _, _ = game([L(T1, "A. Able placed on second."), L(T1, "B. Baker singled to left field; A. Able scored.")])
    check("extra-inning runner placed on second", pas[0]["bases_before"] == "010" and pas[0]["runs_on_play"] == 1,
          (pas[0]["bases_before"], pas[0]["runs_on_play"]))


# ---------- people ----------
def t_people():
    lu = [("away", "Away U", 1, "Able, Al", "cf"), ("away", "Away U", 2, "Ross, Ray", "p"),
          ("home", "Home U", 1, "Gee, Gus", "ss"), ("home", "Home U", 2, "Park, Pat", "p"),
          ("home", "Home U", 3, "p Quinn, Quin", "p")]
    pas, _, _ = game([L(T1, "A. Able singled."), L(T1, "Q. Quinn to p for P. Park."), L(T1, "B. Baker walked."),
                      L(B1, "G. Gee grounded out to ss.")], lineups=lu)
    check("starter from the lineup pitches first", pas[0]["pitcher"] == "Park, Pat", pas[0]["pitcher"])
    check("pitching change by the fielding team", pas[1]["pitcher"] == "Q. Quinn", pas[1]["pitcher"])
    check("other side's starter", pas[2]["pitcher"] == "Ross, Ray", pas[2]["pitcher"])
    pas, _, _ = game([L(T1, "A. Able singled."), L(T1, "M. McKenzie to p."), L(T1, "/ for L. Lincoln."),
                      L(T1, "B. Baker walked.")])
    check("'/ for' continuation names the replaced starter", pas[0]["pitcher"] == "L. Lincoln" and
          pas[1]["pitcher"] == "M. McKenzie", (pas[0]["pitcher"], pas[1]["pitcher"]))
    pas, _, _ = game([L(T1, "Able,Al singled."), L(T1, "ME pitching change: Donlin,Jack replaces Stabley,Thomas."),
                      L(T1, "Baker,Bo walked.")])
    check("'pitching change: X replaces Y' changes the pitcher and names the starter",
          pas[0]["pitcher"] == "Stabley,Thomas" and pas[1]["pitcher"] == "Donlin,Jack", (pas[0]["pitcher"], pas[1]["pitcher"]))
    check("name keys: 'S. Pace' = 'Pace, Sawyer'", parse.same_person("S. Pace", "Pace, Sawyer"))
    check("name keys: 'PACE' = 'Sawyer Pace'", parse.same_person("PACE", "Sawyer Pace"))
    check("name keys: different initials differ", not parse.same_person("S. Pace", "T. Pace"))


# ---------- grouped StatCrew paragraphs ----------
def t_grouped():
    txt = ("Arkansas 3rd - Spanberger C to dh. Spanberger C grounded out to 2b (1-0 B). Bernal, M. flied out to lf "
           "(0-1 K). Pennell, T. walked (3-0 BBBB). Cole, E. reached on a fielding error by 2b (3-2 KFBFFBFB); "
           "Pennell, T. advanced to third. Catron, A. flied out to lf (1-2 FFB). 0 runs, 0 hits, 1 error, 2 LOB.")
    pas, lines, info = game([("Arkansas 3rd -", txt, "", "")], away="Eastern Illinois", home="Arkansas")
    check("grouped paragraph split into plays", [p["batter"] for p in pas] ==
          ["Spanberger C", "Bernal, M.", "Pennell, T.", "Cole, E.", "Catron, A."], [p["batter"] for p in pas])
    check("grouped half is the home team's (bottom)", info["halves"][0]["half"] == "bottom")
    check("grouped: 3 outs", info["halves"][0]["outs_final"] == 3, info["halves"][0]["outs_final"])
    wrapped = [("FLORIDA 1st -", "FLORIDA 1st - Tucker walked (3-2). Kennedy grounded out to 3b, SAC, bunt", "", ""),
               ("FLORIDA 1st -", "(0-1); Tucker advanced to second. Smith flied out to rf (0-1). Lee", "", ""),
               ("FLORIDA 1st -", "struck out looking (1-2). 0 runs, 0 hits, 0 errors, 1 LOB.", "", "")]
    pas, _, info = game(wrapped, away="FLORIDA", home="Mississippi State")
    check("wrapped rows rejoined", [p["batter"] for p in pas] == ["Tucker", "Kennedy", "Smith", "Lee"],
          [p["batter"] for p in pas])
    check("wrapped: count carried across the row break", pas[1]["balls"] == 0 and pas[1]["strikes"] == 1)


# ---------- non-plays ----------
def t_nonplay():
    for s in ["Offensive timeout (ECU)", "UCI coach visits mound. Pitches: 59, 38 strikes.",
              "MIFL position change: Milano,Gabriel remains in the game at 3b", "Tommy Atkinson Failed pickoff attempt.",
              "Distance:402 Exit velo:104 mph.", "No play."]:
        k, _ = parse.classify(s, parse.State())
        check(f"non-play: {s[:40]}", k == "nonplay", k)
    k, _ = parse.classify("MIFL substitution: Milano,Gabriel pinch hitting for Torres,Michael.", parse.State())
    check("'substitution: ... pinch hitting for' is a sub", k == "sub", k)


# ---------- ingest helpers ----------
def t_ingest():
    check("dates: 4/19/2025", ingest.date_iso("4/19/2025") == "2025-04-19")
    check("dates: Mar 21, 2025", ingest.date_iso("Mar 21, 2025") == "2025-03-21")
    check("season from Presto url 2023-24 -> 2024", ingest.season_of("", "https://x.edu/sports/bsb/2023-24/boxscores/a.xml") == 2024)
    check("same team: Middle Tenn. ~ Middle Tennessee", ingest.same_team("Middle Tenn.", "Middle Tennessee"))
    check("different teams", not ingest.same_team("Florida", "Georgia"))


# ---------- held-out guard ----------
def t_heldout():
    check("2025 allowed", assert_not_heldout(2025) == 2025)
    for bad in (2026, "2026", 2027, None, "Unknown"):
        try:
            assert_not_heldout(bad); tripped = False
        except HeldOutSeasonError:
            tripped = True
        check(f"held-out guard trips on {bad!r}", tripped)
    try:
        fit_seasons([2023, 2024, 2025, 2026]); tripped = False
    except HeldOutSeasonError:
        tripped = True
    check("fit_seasons refuses a list containing 2026", tripped)


for t in (t_pitch_strings, t_results, t_bip, t_state, t_more_state, t_people, t_grouped, t_nonplay, t_ingest, t_heldout):
    t()
print(f"\n{'FAILED ' + str(len(FAILS)) if FAILS else 'all passed'}")
sys.exit(1 if FAILS else 0)
