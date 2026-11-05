"""v0.9 Step 1: the scenario suite, as approved by Drew on 2026-11-05 (plan doc tab "Step 1 scenarios").
Run once to write readthrough/scenarios_v09.json and its checksum. After that the JSON is frozen: the grader refuses to
run if the file's sha256 no longer matches readthrough/scenarios_v09.sha256.

Each row: id, hard (R: 0% of the spread allowed on Not acceptable), the situation in words, the engine inputs that
differ from DEFAULTS, and three bins of call patterns. A pattern is PITCH:TARGET.
  PITCH:  ANY, OS (any off-speed), FB, SL, CH, CB
  TARGET: one engine target (up-in, up-away, down-in, down-away, middle, chase) or a group:
          zone (4 corners + middle), corners, down, up, away, in, any
A call is graded Not acceptable if it matches a Not pattern, else Acceptable if it matches an Acceptable pattern, else
Arguable. Drew's grading rules (Nov 5): middle with two strikes is Arguable (never penalized, not counted); middle at
1-1 is Arguable; middle at 2-2 is Acceptable; a fourth straight pitch of one type is fine; a high fastball with two
strikes and a runner on third is Acceptable; one hard-hit at-bat makes that pitch Arguable, two in a game Not acceptable.
Pass: Not-acceptable share <= 5% (0% on hard rows) and Acceptable share >= 70%."""
import hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "scenarios_v09.json")
PASS = {"not_max": 0.05, "not_max_hard": 0.0, "acc_min": 0.70}

ARSENALS = {
    "three": [dict(name="Fastball", kind="FB", grade=3, command=3, conf=0.70, shape="ride", velo=85),
              dict(name="Slider", kind="SL", grade=3, command=3, conf=0.65, shape="tight", velo=77),
              dict(name="Changeup", kind="CH", grade=3, command=3, conf=0.60, shape="fade", velo=77)],
    "two": [dict(name="Fastball", kind="FB", grade=3, command=3, conf=0.70, shape="ride", velo=85),
            dict(name="Slider", kind="SL", grade=3, command=3, conf=0.65, shape="tight", velo=77)],
    "four": [dict(name="Fastball", kind="FB", grade=3, command=3, conf=0.70, shape="ride", velo=85),
             dict(name="Slider", kind="SL", grade=3, command=3, conf=0.65, shape="tight", velo=77),
             dict(name="Curveball", kind="CB", grade=3, command=3, conf=0.62, shape="loopy", velo=71),
             dict(name="Changeup", kind="CH", grade=3, command=3, conf=0.60, shape="fade", velo=77)],
    "hs_two": [dict(name="Fastball", kind="FB", grade=3, command=3, conf=0.70, shape="ride", velo=82),
               dict(name="Curveball", kind="CB", grade=3, command=3, conf=0.62, shape="loopy", velo=70)],
}
DEFAULTS = dict(arsenal="three", level="college_d3", balls=0, strikes=0, outs=0, bases=[False, False, False], inning=4,
                margin=0, pitch_count=50, batters_faced=4, same_side=True, catcher_block=3, home=True)
DEFAULTS_TEXT = ("College D3. Three-pitch arsenal: fastball 85 (ride), slider 77, changeup 77, all grade 3 and command 3, "
                 "all landing normally. Hitter grades 3 (no scouting), same-side hitter. Bases empty, no outs, 4th "
                 "inning, tied, pitch count 50, first time through, catcher blocks at 3.")


def row(id_, hard, text, why, inp, acc, arg=(), nok=(), pitch_edits=None, exclude=None, matchup=None):
    return dict(id=id_, hard=hard, situation=text, why=why, inputs=inp, pitch_edits=pitch_edits or {},
                exclude=exclude or [], matchup=matchup or [], acceptable=list(acc), arguable=list(arg), not_acceptable=list(nok))


L = lambda s, t: [s, t]          # landing_today: (strikes, thrown)
ROWS = [
    # A. Hard rules
    row("A1", True, "3-0", "No chase at 3-0", dict(balls=3), ["FB:zone"], ["OS:zone"], ["ANY:chase"]),
    row("A2", True, "3-1, runner on 1st", "No chase at 3-1", dict(balls=3, strikes=1, bases=[True, False, False]),
        ["FB:zone"], ["OS:zone"], ["ANY:chase"]),
    row("A3", True, "2-2, bases loaded, 2 outs", "Attack the zone at 2-2",
        dict(balls=2, strikes=2, outs=2, bases=[True, True, True]), ["ANY:zone"], [], ["ANY:chase"]),
    row("A4", True, "2-2, slider landing 8 of 10 today", "Attack the zone at 2-2",
        dict(balls=2, strikes=2, landing_today={"Slider": L(8, 10)}), ["FB:zone", "SL:zone"], ["CH:zone"], ["ANY:chase"]),
    row("A5", True, "3-0, changeup landing 1 of 8 today", "No chase at 3-0; don't call a pitch that isn't landing",
        dict(balls=3, landing_today={"Changeup": L(1, 8)}), ["FB:zone"], ["SL:zone"], ["ANY:chase", "CH:any"]),
    row("A6", True, "3-1, high school, two-pitch (FB, CB)", "No chase at 3-1 at every level",
        dict(arsenal="hs_two", level="hs", balls=3, strikes=1), ["FB:zone"], ["CB:zone"], ["ANY:chase"]),
    row("A7", True, "1-1, the coach just shook off SL down-away", "A shaken-off call is not called again",
        dict(balls=1, strikes=1), ["FB:any", "CH:any"], ["SL:any"], ["SL:down-away"], exclude=[["Slider", "down-away"]]),
    # B. Early count
    row("B1", False, "0-0", "Get ahead with a good strike", {}, ["ANY:corners"], ["ANY:middle"], ["ANY:chase"]),
    row("B2", False, "0-0, FB command 2, SL command 4", "Get ahead with the pitch he commands", {},
        ["FB:corners", "SL:corners"], ["ANY:middle"], ["ANY:chase"], pitch_edits={"Fastball": {"command": 2}, "Slider": {"command": 4}}),
    row("B3", False, "1-0, first pitch was FB chase (ball)", "Two off-zone calls to start is waste",
        dict(balls=1, last=["Fastball", "chase", "ball"]), ["ANY:zone"], [], ["ANY:chase"]),
    row("B4", False, "0-1, last pitch FB up-in, called strike", "Change something after a called strike",
        dict(strikes=1, last=["Fastball", "up-in", "cstrike"]), ["SL:any", "CH:any", "FB:away"], ["FB:up-in", "ANY:chase"]),
    row("B5", False, "1-1", "1-1 is the pivotal pitch", dict(balls=1, strikes=1), ["ANY:corners"], ["SL:chase", "ANY:middle"]),
    row("B6", False, "1-1, 8th inning, down 1, runner on 2nd, 1 out", "Pivotal pitch in a big spot",
        dict(balls=1, strikes=1, inning=8, margin=-1, outs=1, bases=[False, True, False]), ["ANY:corners"], ["SL:chase", "ANY:middle"]),
    row("B7", False, "2-0, changeup landing 2 of 8", "Don't fall to 3-0 with a pitch that isn't landing",
        dict(balls=2, landing_today={"Changeup": L(2, 8)}), ["FB:zone", "SL:zone"], ["ANY:chase"], ["CH:any"]),
    row("B8", False, "0-0, high school, two-pitch (FB, CB), curveball landing 3 of 10", "Get ahead with the pitch that's landing",
        dict(arsenal="hs_two", level="hs", landing_today={"Curveball": L(3, 10)}), ["FB:zone"], ["CB:zone"], ["ANY:chase"]),
    row("B9", False, "1-1, FB confidence 0.50, SL confidence 0.85", "Pitch confidence counts more than reading the hitter",
        dict(balls=1, strikes=1), ["SL:zone"], ["FB:zone", "SL:chase"], ["FB:chase"],
        pitch_edits={"Fastball": {"conf": 0.50}, "Slider": {"conf": 0.85}}),
    # C. Two strikes
    row("C1", False, "0-2, 1 out", "Expand or finish", dict(strikes=2, outs=1), ["ANY:chase", "ANY:corners"], ["ANY:middle"]),
    row("C2", False, "0-2, last pitch FB up-in, swinging strike", "Go back to a pitch he just missed",
        dict(strikes=2, last=["Fastball", "up-in", "whiff"]), ["FB:up-in", "FB:chase", "SL:chase"], ["CH:chase", "ANY:corners", "ANY:middle"]),
    row("C3", False, "1-2", "Expand or finish", dict(balls=1, strikes=2), ["ANY:chase", "ANY:corners"], ["ANY:middle"]),
    row("C4", False, "1-2, runner on 3rd, 1 out, slider landing 2 of 9", "A high fastball is a strikeout pitch with two strikes; a wild slider is defensible",
        dict(balls=1, strikes=2, outs=1, bases=[False, False, True], landing_today={"Slider": L(2, 9)}),
        ["FB:away", "FB:up-in", "FB:chase", "CH:down"], ["SL:down", "SL:chase", "ANY:middle"]),
    row("C5", False, "1-2, runner on 3rd, 1 out, four-pitch, curveball landing 8 of 10, catcher blocks 4",
        "With two strikes the high fastball is a strikeout pitch",
        dict(arsenal="four", balls=1, strikes=2, outs=1, bases=[False, False, True], catcher_block=4, landing_today={"Curveball": L(8, 10)}),
        ["CB:chase", "CB:down", "CH:down", "FB:chase", "FB:up"], ["ANY:middle"]),
    row("C6", True, "2-2, runner on 2nd, 2 outs", "Attack the zone at 2-2",
        dict(balls=2, strikes=2, outs=2, bases=[False, True, False]), ["ANY:zone"], [], ["ANY:chase"]),
    row("C7", False, "3-2, 2 outs, changeup landing 2 of 8", "Full count: throw a strike with a pitch that's landing",
        dict(balls=3, strikes=2, outs=2, landing_today={"Changeup": L(2, 8)}), ["FB:zone", "SL:zone"], [], ["ANY:chase", "CH:any"]),
    row("C8", False, "3-2, bases loaded, 2 outs", "A walk forces in a run",
        dict(balls=3, strikes=2, outs=2, bases=[True, True, True]), ["FB:zone", "SL:zone"], ["CH:zone"], ["ANY:chase"]),
    row("C9", False, "0-2, last two pitches FB, FB", "Change speeds after two fastballs",
        dict(strikes=2, last=["Fastball", "up-away", "foul"]), ["SL:chase", "CH:chase", "SL:down", "CH:down"], ["FB:chase", "ANY:middle"]),
    row("C10", False, "1-2, opposite-side hitter", "The changeup is the weapon against opposite-side hitters",
        dict(balls=1, strikes=2, same_side=False), ["CH:down-away", "CH:chase", "FB:corners", "SL:chase"], ["SL:down-in", "ANY:middle"]),
    # D. Game situation
    row("D1", False, "1-1, bottom 9th, tied, runner on 3rd, 1 out, infield in", "A grounder holds him; a fly ball scores him",
        dict(balls=1, strikes=1, inning=9, home=False, outs=1, bases=[False, False, True], infield_in=True),
        ["ANY:down", "SL:chase", "CH:chase"], ["ANY:middle", "FB:up"]),
    row("D2", False, "0-0, runner on 3rd, 0 outs", "Keep the ball down with the run on third",
        dict(bases=[False, False, True]), ["ANY:down"], ["ANY:middle", "FB:up"]),
    row("D3", False, "1-1, runner on 3rd, 1 out, slider landing 2 of 9, catcher blocks 2", "A wild pitch scores the run",
        dict(balls=1, strikes=1, outs=1, bases=[False, False, True], catcher_block=2, landing_today={"Slider": L(2, 9)}),
        ["FB:corners", "CH:zone"], ["SL:down", "SL:chase"]),
    row("D4", False, "2-1, bases loaded, 0 outs", "Can't fall behind with the bases loaded",
        dict(balls=2, strikes=1, bases=[True, True, True]), ["FB:zone", "SL:zone"], ["CH:zone", "SL:chase"], ["FB:chase"]),
    row("D5", False, "2-0, 7th inning, up 6", "Big lead: throw strikes", dict(balls=2, inning=7, margin=6),
        ["FB:zone"], ["OS:zone"], ["ANY:chase"]),
    row("D6", False, "1-1, 9th, down 1, runner on 1st, 2 outs, high steal threat", "A ball in the dirt moves him into scoring position",
        dict(balls=1, strikes=1, inning=9, margin=-1, outs=2, bases=[True, False, False], steal={"a": 0.10, "runner": 1, "t": None}),
        ["FB:zone", "SL:zone"], ["CH:zone"], ["SL:chase", "CH:chase"]),
    row("D7", False, "1-1, 8th, tied, runners on 2nd and 3rd, 2 outs", "The biggest pitch of the game",
        dict(balls=1, strikes=1, inning=8, outs=2, bases=[False, True, True]), ["ANY:corners"], ["SL:chase", "ANY:middle"]),
    row("D8", True, "3-1, 9th, up 7", "No chase at 3-1; big lead", dict(balls=3, strikes=1, inning=9, margin=7),
        ["FB:zone"], ["OS:zone"], ["ANY:chase"]),
    row("D9", False, "1-1, runner on 1st, 0 outs", "Double-play ball", dict(balls=1, strikes=1, bases=[True, False, False]),
        ["ANY:down"], ["ANY:up", "ANY:middle"]),
    row("D10", False, "0-0, high school, runner on 3rd, 2 outs", "With 2 outs a fly ball doesn't score him",
        dict(level="hs", outs=2, bases=[False, False, True]), ["ANY:corners"], ["ANY:middle"], ["ANY:chase"]),
    # E. Confidence and landing
    row("E1", False, "2-0, slider landing 7 of 9", "If the off-speed gets it over, get it over",
        dict(balls=2, landing_today={"Slider": L(7, 9)}), ["SL:zone", "FB:zone"], ["CH:zone"], ["ANY:chase"]),
    row("E2", False, "2-0, slider landing 2 of 9", "Not the pitch that isn't landing in a hitter's count",
        dict(balls=2, landing_today={"Slider": L(2, 9)}), ["FB:zone"], ["CH:zone"], ["SL:any", "ANY:chase"]),
    row("E3", True, "3-1, changeup landing 6 of 8", "Get it over with the off-speed that's landing",
        dict(balls=3, strikes=1, landing_today={"Changeup": L(6, 8)}), ["FB:zone", "CH:zone"], ["SL:zone"], ["ANY:chase"]),
    row("E4", False, "1-1, FB command 2 and landing 3 of 10; SL landing 8 of 10", "Lean on what's working today",
        dict(balls=1, strikes=1, landing_today={"Fastball": L(3, 10), "Slider": L(8, 10)}), ["SL:zone", "SL:chase"], ["FB:zone"],
        ["FB:chase"], pitch_edits={"Fastball": {"command": 2}}),
    row("E5", False, "0-0, coach just shook off a fastball (FB confidence down 0.20 to 0.50)", "Respect the shake-off", {},
        ["SL:zone", "CH:zone"], ["FB:zone"], ["ANY:chase"], pitch_edits={"Fastball": {"conf": 0.50}}),
    row("E6", False, "3-2, 2 outs, four-pitch, curveball (grade 4) landing 1 of 6", "The best pitch is no good if it isn't landing",
        dict(arsenal="four", balls=3, strikes=2, outs=2, landing_today={"Curveball": L(1, 6)}), ["FB:zone", "SL:zone"], ["CH:zone"],
        ["CB:any", "ANY:chase"], pitch_edits={"Curveball": {"grade": 4}}),
    row("E7", False, "0-2, pitch count 100, fastball 3 mph below normal", "Tired arm: lean on the off-speed",
        dict(strikes=2, pitch_count=100, batters_faced=24, radar={"Fastball": 82.0}),
        ["SL:chase", "CH:chase", "SL:down", "CH:down"], ["FB:chase", "ANY:middle"]),
    row("E8", False, "1-2, high school, two-pitch (FB, CB), curveball landing 0 of 4", "Off the zone a bad curveball can still get a chase; in it, it hangs",
        dict(arsenal="hs_two", level="hs", balls=1, strikes=2, landing_today={"Curveball": L(0, 4)}),
        ["FB:corners", "FB:chase"], ["CB:chase", "ANY:middle"], ["CB:corners"]),
    # F. Sequencing
    row("F1", False, "0-1, last pitch FB up-in, pulled foul (out front)", "He's early after the inside fastball",
        dict(strikes=1, last=["Fastball", "up-in", "foul"], timing={"FB": -0.5}), ["FB:away", "SL:any", "CH:any"], [], ["FB:up-in"]),
    row("F2", False, "1-2, last pitch SL down-away, swinging strike", "Repeat a pitch after a whiff",
        dict(balls=1, strikes=2, last=["Slider", "down-away", "whiff"]), ["SL:down-away", "SL:chase", "FB:chase"], ["CH:chase", "ANY:middle"]),
    row("F3", False, "2-0, last two pitches FB away, both balls", "A third off-zone call in a row is waste",
        dict(balls=2, last=["Fastball", "down-away", "ball"]), ["FB:zone"], ["OS:zone"], ["ANY:chase"]),
    row("F4", False, "1-1, last three pitches all FB", "A fourth fastball is fine if it's the best call",
        dict(balls=1, strikes=1, last=["Fastball", "up-away", "foul"]), ["ANY:any"]),
    row("F5", False, "0-1, last pitch CH down-away, hit hard foul", "He squared it up",
        dict(strikes=1, last=["Changeup", "down-away", "foul"], timing={"OS": 0.0}), ["FB:any", "SL:any"], ["CH:any"], ["CH:down-away"]),
    row("F6", False, "1-1, hitter late on the fastball twice (fouled late)", "He can't catch up to the fastball",
        dict(balls=1, strikes=1, timing={"FB": 0.6}), ["FB:up", "FB:in"], ["OS:any", "ANY:middle"]),
    row("F7", False, "1-1, hitter out front on the slider", "He's early on soft stuff: stay soft",
        dict(balls=1, strikes=1, timing={"OS": -0.6}), ["SL:down", "SL:chase", "CH:any"], ["FB:corners", "ANY:middle"]),
    row("F8", False, "1-1, two-pitch (FB, SL), last three pitches all SL", "A fourth slider is fine if it's the best call",
        dict(arsenal="two", balls=1, strikes=1, last=["Slider", "down-away", "foul"]), ["FB:zone"], ["SL:any"]),
    # G. Platoon and arsenal
    row("G1", False, "1-2, same-side hitter", "The slider away is the same-side weapon", dict(balls=1, strikes=2),
        ["SL:chase", "SL:down-away", "FB:chase"], ["CH:chase", "ANY:middle"]),
    row("G2", False, "0-0, four-pitch, curveball grade 4 (his best)", "Get ahead with the best pitch", dict(arsenal="four"),
        ["CB:zone", "FB:zone"], ["SL:zone", "CH:zone"], ["ANY:chase"], pitch_edits={"Curveball": {"grade": 4}}),
    row("G3", False, "1-2, two-pitch (FB, SL), slider grade 2", "A weak slider still works off the zone",
        dict(arsenal="two", balls=1, strikes=2), ["FB:chase", "FB:corners", "SL:chase"], ["SL:corners", "ANY:middle"],
        pitch_edits={"Slider": {"grade": 2}}),
    row("G4", False, "1-1, high school, FB 92 grade 5", "Ride a dominant fastball", dict(level="hs", balls=1, strikes=1),
        ["FB:zone"], ["OS:zone"], pitch_edits={"Fastball": {"velo": 92, "grade": 5}}),
    # H. With scouting
    row("H1", False, "2-0, power hitter (power grade 5)", "Don't feed a power hitter his pitch",
        dict(balls=2, grades={"d": 5}), ["FB:down", "OS:zone"], ["FB:up"], ["FB:middle"]),
    row("H2", False, "0-2, contact hitter (contact grade 5)", "He'll put the middle in play",
        dict(strikes=2, grades={"c": 5}), ["ANY:chase", "ANY:corners"], ["ANY:middle"]),
    row("H3", False, "1-1, he hit FB up-in hard once earlier this game", "One hard-hit ball: avoid it, but it's not banned",
        dict(balls=1, strikes=1, batters_faced=10, hitter_damage={"up-in": [0.8, 4]}),
        ["FB:away", "OS:any"], ["FB:up-in", "FB:down-in", "ANY:middle"],
        matchup=[dict(trip=1, pitch="Fastball", target="up-in", result="hard")]),
    row("H4", False, "1-1, hitter crowds the plate", "Pitch inside to a hitter who crowds",
        dict(balls=1, strikes=1, crowding=True), ["FB:in"], ["FB:away", "OS:any", "ANY:middle"]),
    # I. Matchup memory
    row("I1", False, "0-0, second trip, last trip FB middle was hit hard", "One at-bat isn't enough to ban it",
        dict(batters_faced=10, familiar={"FB": 3, "OS": 2}, hitter_damage={"middle": [0.8, 4]}),
        ["FB:corners", "OS:any"], ["FB:middle", "FB:chase"],
        matchup=[dict(trip=1, pitch="Fastball", target="middle", result="hard")]),
    row("I2", False, "1-2, second trip, last trip CH down-away got 2 swinging strikes", "It worked; still a good pitch",
        dict(balls=1, strikes=2, batters_faced=10, familiar={"FB": 2, "OS": 3}),
        ["CH:down-away", "CH:chase", "SL:chase", "FB:chase"], ["ANY:middle"],
        matchup=[dict(trip=1, pitch="Changeup", target="down-away", result="whiff"),
                 dict(trip=1, pitch="Changeup", target="down-away", result="whiff")]),
    row("I3", False, "0-0, third trip, pitch count 85", "No third-time cliff: same logic as the first trip",
        dict(batters_faced=19, pitch_count=85, familiar={"FB": 6, "OS": 4}), ["ANY:corners"], ["ANY:middle"], ["ANY:chase"]),
    row("I4", False, "0-0, third trip, he hit FB middle hard on both earlier trips", "Mashed it twice: don't go back",
        dict(batters_faced=19, pitch_count=85, familiar={"FB": 6, "OS": 4}, hitter_damage={"middle": [0.9, 8]}),
        ["FB:corners", "OS:zone"], ["ANY:chase"], ["FB:middle"],
        matchup=[dict(trip=1, pitch="Fastball", target="middle", result="hard"),
                 dict(trip=2, pitch="Fastball", target="middle", result="hard")]),
]


def main():
    ids = [r["id"] for r in ROWS]
    assert len(ids) == len(set(ids)), "duplicate ids"
    doc = dict(version="v0.9-step1", approved="2026-11-05 by Drew", pass_rule=PASS, defaults=DEFAULTS,
               defaults_text=DEFAULTS_TEXT, arsenals=ARSENALS, rows=ROWS)
    if os.path.exists(OUT):
        raise SystemExit(f"{OUT} exists and is frozen. Delete it only with Drew's approval of a new list.")
    blob = json.dumps(doc, indent=1, sort_keys=True).encode()
    open(OUT, "wb").write(blob)
    h = hashlib.sha256(blob).hexdigest()
    open(os.path.join(HERE, "scenarios_v09.sha256"), "w").write(h + "\n")
    print(f"wrote {len(ROWS)} scenarios; sha256 {h}")


if __name__ == "__main__":
    main()
