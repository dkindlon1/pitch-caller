"""v1.0 scenario suite (PLAN_v1.0.md 1.2). Builds readthrough/scenarios_v10.json and its checksum from the frozen v0.9
file (all 64 rows, ids carried) plus: the F5 input fix, the label changes Drew approved, the new rows, and the tracked
flags Drew approved. The v0.9 file stays frozen and untouched.
  python3 readthrough/make_scenarios_v10.py --draft   -> readthrough/scenarios_v10_draft.json (not frozen, for review)
  python3 readthrough/make_scenarios_v10.py           -> scenarios_v10.json + scenarios_v10.sha256 (once, after approval)
Row format and pattern language are v0.9's (see make_scenarios_v09.py). New inputs: `history` (this at-bat's pitches,
oldest first, each [pitch, target, result, read]) and a four-field `last` ([pitch, target, result, read]); the grader
turns both into the engine's `history` and `last`. `tracked: true` rows depend on the hitter model: they are graded and
reported but don't count toward the v1.0 gate."""
import copy, hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
V09 = os.path.join(HERE, "scenarios_v09.json")
OUT = os.path.join(HERE, "scenarios_v10.json")
SHA = os.path.join(HERE, "scenarios_v10.sha256")
DRAFT = os.path.join(HERE, "scenarios_v10_draft.json")
GATE = {"not_max": 0.05, "not_max_hard": 0.0, "acc_min": 0.70, "max_acc_only_fails": 6}

NEW_ARSENALS = {
    "plus_ch": [dict(name="Fastball", kind="FB", grade=3, command=3, conf=0.70, shape="ride", velo=85),
                dict(name="Slider", kind="SL", grade=3, command=3, conf=0.65, shape="tight", velo=77),
                dict(name="Changeup", kind="CH", grade=5, command=4, conf=0.85, shape="fade", velo=77)],
    "sinker": [dict(name="Fastball", kind="FB", grade=3, command=3, conf=0.70, shape="sink", velo=85),
               dict(name="Slider", kind="SL", grade=3, command=3, conf=0.65, shape="tight", velo=77),
               dict(name="Changeup", kind="CH", grade=3, command=3, conf=0.60, shape="fade", velo=77)],
}

# F5: the input now says what the description says (hit hard foul = fouled straight back)
F5_LAST = ["Changeup", "down-away", "foul", "back"]

# Label changes: only where the v0.9 label contradicts a rule Drew already made. Each: row id -> new bins + reason.
MID11 = 'Drew\'s Nov 5 rule "middle at 1-1 is Arguable"; the v0.9 pattern counted middle at 1-1 as Acceptable'
LABEL_CHANGES = {
    "A7": dict(acceptable=["FB:corners", "FB:chase", "CH:corners", "CH:chase"], arguable=["SL:any", "ANY:middle"],
               reason="FB:any / CH:any -> corners + chase; " + MID11),
    "B9": dict(acceptable=["SL:corners"], arguable=["FB:zone", "SL:chase", "ANY:middle"],
               reason="SL:zone -> SL:corners; " + MID11),
    "D3": dict(acceptable=["FB:corners", "CH:corners"], arguable=["SL:down", "SL:chase", "ANY:middle"],
               reason="CH:zone -> CH:corners; " + MID11),
    "E4": dict(acceptable=["SL:corners", "SL:chase"], arguable=["FB:zone", "ANY:middle"],
               reason="SL:zone -> SL:corners; " + MID11),
    "F8": dict(acceptable=["FB:corners"], arguable=["SL:any", "ANY:middle"],
               reason="FB:zone -> FB:corners; " + MID11),
    "H3": dict(acceptable=["FB:away", "OS:corners", "OS:chase"], arguable=["FB:up-in", "FB:down-in", "ANY:middle"],
               reason="OS:any -> OS:corners + OS:chase; " + MID11),
}

# Rows whose pass depends on the hitter model (section 2). Each needs a reason; Drew approves the list.
TRACKED = {
    "H2": "contact grade's effect on two-strike calls is hitter math (band T1)",
    "H4": "crowding's effect on inside value is hitter math (band T2)",
    "F6": "the late-on-fastball read acts only through the hitter timing terms (P08 / timing_B)",
    "F7": "the out-front-on-soft-stuff read acts only through the hitter timing terms",
    "N2": "crowding (band T2)",
    "N3": "crowding (band T2); the middle part is CR2 and stays enforced in B12",
}


def row(id_, hard, text, why, inp, acc, arg=(), nok=(), pitch_edits=None, exclude=None, matchup=None, history=None):
    r = dict(id=id_, hard=hard, situation=text, why=why, inputs=inp, pitch_edits=pitch_edits or {},
             exclude=exclude or [], matchup=matchup or [], acceptable=list(acc), arguable=list(arg),
             not_acceptable=list(nok), new_in="v1.0")
    if history:
        r["inputs"] = dict(inp, history=history)
    return r


L = lambda s, t: [s, t]
B1, B2, B3, B12, B13, B23, BL = ([True, False, False], [False, True, False], [False, False, True], [True, True, False],
                                  [True, False, True], [False, True, True], [True, True, True])
COR2 = ["ANY:chase", "ANY:corners"]
NEW_ROWS = [
    # P. Plus changeup (FB 3, SL 3, CH grade 5 command 4 confidence 0.85)
    row("P1", False, "0-0, plus changeup, opposite-side hitter", "Get ahead; the plus changeup is a strike pitch to opposite-side hitters",
        dict(arsenal="plus_ch", same_side=False), ["FB:corners", "CH:down"], ["ANY:middle", "SL:corners", "CH:up"], ["ANY:chase"]),
    row("P2", False, "2-0, plus changeup, opposite-side hitter", "A trusted plus changeup is a fine pitch in a hitter's count",
        dict(arsenal="plus_ch", balls=2, same_side=False), ["FB:zone", "CH:down"], ["CH:up", "CH:middle", "SL:zone", "ANY:chase"]),
    row("P3", False, "1-2, plus changeup, opposite-side hitter", "Put him away with the plus changeup",
        dict(arsenal="plus_ch", balls=1, strikes=2, same_side=False), ["CH:down", "CH:chase", "FB:chase", "FB:up"],
        ["SL:any", "ANY:middle", "FB:down"]),
    row("P4", False, "1-2, plus changeup, same-side hitter", "Same side: the slider away, the high fastball, and the changeup still play",
        dict(arsenal="plus_ch", balls=1, strikes=2), ["SL:chase", "SL:down-away", "CH:chase", "CH:down", "FB:chase", "FB:up"],
        ["ANY:middle", "FB:down", "SL:down-in"]),
    row("P5", True, "3-1, plus changeup, opposite-side hitter", "No chase at 3-1; the plus changeup can get it over",
        dict(arsenal="plus_ch", balls=3, strikes=1, same_side=False), ["FB:zone", "CH:zone"], ["SL:zone"], ["ANY:chase"]),
    row("P6", False, "0-2, plus changeup landing 8 of 10, runner on 3rd, 1 out", "A changeup that's landing is still the put-away pitch with a runner on 3rd",
        dict(arsenal="plus_ch", strikes=2, outs=1, bases=B3, landing_today={"Changeup": L(8, 10)}),
        ["CH:chase", "CH:down", "FB:up", "FB:chase"], ["SL:any", "ANY:middle", "FB:down"]),
    # S. Sinker / ground-ball pitcher, runner on 1st, fewer than 2 outs
    row("S1", False, "0-0, sinker, runner on 1st, 0 outs", "Sinker down for a double-play ball",
        dict(arsenal="sinker", bases=B1), ["ANY:down"], ["ANY:up", "ANY:middle"], ["ANY:chase"]),
    row("S2", False, "1-1, sinker, runner on 1st, 1 out", "Get the ground ball",
        dict(arsenal="sinker", balls=1, strikes=1, outs=1, bases=B1), ["ANY:down"], ["ANY:up", "ANY:middle", "ANY:chase"]),
    row("S3", False, "2-1, sinker, runner on 1st, 0 outs", "Behind in the count, the sinker down still gets a ground ball",
        dict(arsenal="sinker", balls=2, strikes=1, bases=B1), ["FB:down", "FB:middle", "OS:down"],
        ["FB:up", "OS:up", "OS:middle", "ANY:chase"]),
    row("S4", False, "0-2, sinker, runner on 1st, 1 out", "Two strikes: expand, or down for a ground ball",
        dict(arsenal="sinker", strikes=2, outs=1, bases=B1), ["ANY:chase", "ANY:down", "FB:up"], ["ANY:middle", "OS:up"]),
    # L. Late and close
    row("L1", False, "0-0, 8th, up 1, bases empty, 1 out", "Late and close: get ahead with a good strike",
        dict(inning=8, margin=1, outs=1), ["ANY:corners"], ["ANY:middle"], ["ANY:chase"]),
    row("L2", False, "1-1, 9th, up 1, runner on 2nd, 2 outs", "The pivotal pitch with the tying run on 2nd",
        dict(balls=1, strikes=1, inning=9, margin=1, outs=2, bases=B2), ["ANY:corners"], ["SL:chase", "ANY:middle"]),
    row("L3", False, "3-2, 8th, tied, runner on 1st, 2 outs", "Full count late: a strike with a pitch that's landing",
        dict(balls=3, strikes=2, inning=8, outs=2, bases=B1), ["FB:zone", "SL:zone"], ["CH:zone"], ["ANY:chase"]),
    row("L4", False, "0-2, 9th, up 1, runners on 1st and 2nd, 2 outs", "Expand or finish to end it",
        dict(strikes=2, inning=9, margin=1, outs=2, bases=B12), COR2, ["ANY:middle"]),
    row("L5", False, "2-0, top 8th, we're away, down 1, bases empty, 0 outs", "Don't walk the leadoff man late",
        dict(balls=2, inning=8, margin=-1, home=False), ["FB:zone", "SL:zone"], ["CH:zone"], ["ANY:chase"]),
    row("L6", False, "1-2, bottom 9th, tied, runner on 3rd, 1 out", "Strikeout pitch with the winning run on 3rd",
        dict(balls=1, strikes=2, inning=9, home=False, outs=1, bases=B3), ["FB:up", "FB:chase", "SL:chase", "SL:down-away", "CH:down"],
        ["ANY:middle", "CH:chase", "FB:down"]),
    # R. Runners in scoring position
    row("R1", False, "0-0, runner on 2nd, 1 out", "Get ahead with a good strike", dict(bases=B2, outs=1), ["ANY:corners"],
        ["ANY:middle"], ["ANY:chase"]),
    row("R2", False, "1-1, runner on 2nd, 0 outs", "Pivotal pitch with a runner in scoring position",
        dict(balls=1, strikes=1, bases=B2), ["ANY:corners"], ["SL:chase", "ANY:middle"]),
    row("R3", False, "2-1, runner on 3rd, 1 out, infield in", "Behind with the infield in: a ground ball holds him",
        dict(balls=2, strikes=1, outs=1, bases=B3, infield_in=True), ["ANY:down", "FB:corners"], ["ANY:middle", "OS:up", "ANY:chase"]),
    row("R4", False, "0-2, runners on 2nd and 3rd, 1 out", "Expand or finish", dict(strikes=2, outs=1, bases=B23), COR2,
        ["ANY:middle"]),
    row("R5", True, "3-1, runner on 2nd, 2 outs", "No chase at 3-1", dict(balls=3, strikes=1, outs=2, bases=B2),
        ["FB:zone", "SL:zone"], ["CH:zone"], ["ANY:chase"]),
    row("R6", False, "1-2, runner on 2nd, 2 outs", "Expand or finish", dict(balls=1, strikes=2, outs=2, bases=B2), COR2,
        ["ANY:middle"]),
    # K. Two- and four-pitch arsenals
    row("K1", False, "0-0, two-pitch (FB, SL)", "Get ahead; a slider up hangs", dict(arsenal="two"), ["FB:corners", "SL:down"],
        ["ANY:middle", "SL:up"], ["ANY:chase"]),
    row("K2", False, "2-1, two-pitch (FB, SL)", "Behind: a strike with either pitch, the slider down", dict(arsenal="two", balls=2, strikes=1),
        ["FB:zone", "SL:down"], ["SL:up", "SL:middle", "ANY:chase"]),
    row("K3", False, "1-2, two-pitch (FB, SL)", "Put-away: slider off the zone or the high fastball", dict(arsenal="two", balls=1, strikes=2),
        ["SL:chase", "SL:down", "FB:chase", "FB:up"], ["ANY:middle", "FB:down", "SL:up"]),
    row("K4", False, "0-0, four-pitch, opposite-side hitter", "Get ahead with a good strike", dict(arsenal="four", same_side=False),
        ["ANY:corners"], ["ANY:middle"], ["ANY:chase"]),
    row("K5", False, "2-0, four-pitch", "A hitter's count: fastball strike, or a trusted off-speed down", dict(arsenal="four", balls=2),
        ["FB:zone", "OS:down"], ["OS:up", "OS:middle", "ANY:chase"]),
    row("K6", False, "1-2, four-pitch, same-side hitter", "Put-away: off-speed off the zone or down, or the high fastball",
        dict(arsenal="four", balls=1, strikes=2), ["OS:chase", "OS:down", "FB:up", "FB:chase"], ["ANY:middle", "FB:down", "OS:up"]),
    # Q. Repeats with foul reads (this at-bat's history)
    row("Q1", False, "0-2, FB up-away called strike, then FB up-away fouled straight back", "He was right on it: don't go back there yet",
        dict(strikes=2), ["SL:chase", "SL:corners", "CH:chase", "CH:corners", "FB:up-in", "FB:down", "FB:chase"], ["ANY:middle"],
        ["FB:up-away"], history=[["Fastball", "up-away", "cstrike", None], ["Fastball", "up-away", "foul", "back"]]),
    row("Q2", False, "0-1, FB up-in pulled foul", "He's early on the inside fastball", dict(strikes=1),
        ["FB:away", "SL:corners", "SL:chase", "CH:corners", "CH:chase"], ["FB:up-in", "FB:down-in", "ANY:middle"],
        history=[["Fastball", "up-in", "foul", "pull"]]),
    row("Q3", False, "1-1, SL down-away ball, then FB up-away fouled the other way", "An away pitch fouled the other way is normal contact",
        dict(balls=1, strikes=1), ["ANY:corners"], ["ANY:middle", "ANY:chase"],
        history=[["Slider", "down-away", "ball", None], ["Fastball", "up-away", "foul", "opposite"]]),
    row("Q4", False, "1-2, FB up-away called strike, SL down-away ball, CH down-away foul (no read)", "A plain foul: nothing learned",
        dict(balls=1, strikes=2), COR2, ["ANY:middle"],
        history=[["Fastball", "up-away", "cstrike", None], ["Slider", "down-away", "ball", None], ["Changeup", "down-away", "foul", None]]),
    # N. Inside and crowding
    row("N1", False, "0-2, FB up-away called strike, SL down-away swinging strike", "After two away pitches the inside fastball is a fine third",
        dict(strikes=2), ["FB:in", "FB:up-away", "FB:chase", "OS:chase", "OS:down"], ["ANY:middle", "FB:down-away"],
        history=[["Fastball", "up-away", "cstrike", None], ["Slider", "down-away", "whiff", None]]),
    row("N2", False, "1-1, hitter crowds the plate, opposite-side hitter", "Pitch inside to a hitter who crowds",
        dict(balls=1, strikes=1, crowding=True, same_side=False), ["FB:in"], ["FB:away", "OS:any", "ANY:middle"]),
    row("N3", False, "0-0, hitter crowds the plate, power grade 4", "Crowds the plate and has power: in, and off the middle",
        dict(crowding=True, grades={"w": 4}), ["FB:in", "OS:down"], ["FB:away", "OS:up"], ["ANY:middle", "ANY:chase"]),
    # T. Nothing trusted (fallback); D3 cutoff 0.45
    row("T1", False, "1-1, nothing trusted (FB 0.40, SL 0.42, CH 0.35), no landing record", "Nothing trusted: his most trusted pitch",
        dict(balls=1, strikes=1), ["SL:corners", "SL:chase"], ["SL:middle", "FB:any", "CH:any"],
        pitch_edits={"Fastball": {"conf": 0.40}, "Slider": {"conf": 0.42}, "Changeup": {"conf": 0.35}}),
    row("T2", False, "2-1, nothing trusted (FB 0.40, SL 0.42, CH 0.35); slider landing 2 of 12, fastball 7 of 12",
        "Nothing trusted and the slider isn't landing: go with what's landing",
        dict(balls=2, strikes=1, landing_today={"Slider": L(2, 12), "Fastball": L(7, 12)}), ["FB:zone"], ["CH:any", "FB:chase"],
        ["SL:any"], pitch_edits={"Fastball": {"conf": 0.40}, "Slider": {"conf": 0.42}, "Changeup": {"conf": 0.35}}),
    # W. Two strikes, a pitch that isn't landing, runner on 3rd
    row("W1", True, "0-2, runner on 3rd, 1 out, slider landing 0 of 4", "Runner on 3rd: no dirt ball with a pitch that isn't landing",
        dict(strikes=2, outs=1, bases=B3, landing_today={"Slider": L(0, 4)}),
        ["FB:up", "FB:chase", "FB:corners", "CH:chase", "CH:down"], ["ANY:middle", "CH:up"], ["SL:any"]),
    row("W2", True, "1-2, high school, two-pitch (FB, CB), runner on 3rd, 0 outs, curveball landing 2 of 12",
        "Runner on 3rd: no dirt ball with a pitch that isn't landing",
        dict(arsenal="hs_two", level="hs", balls=1, strikes=2, bases=B3, landing_today={"Curveball": L(2, 12)}),
        ["FB:corners", "FB:chase"], ["FB:middle"], ["CB:any"]),
]


def build():
    doc09 = json.load(open(V09))
    rows = []
    changes = []
    for r in doc09["rows"]:
        r = copy.deepcopy(r)
        if r["id"] == "F5":
            r["inputs"]["last"] = F5_LAST
            changes.append(dict(row="F5", change="last -> " + json.dumps(F5_LAST), reason="the row says 'hit hard foul'; the "
                                "input only said 'foul' (PLAN_v1.0.md R7)"))
        if r["id"] in LABEL_CHANGES:
            lc = LABEL_CHANGES[r["id"]]
            old = dict(acceptable=r["acceptable"], arguable=r["arguable"])
            r["acceptable"], r["arguable"] = list(lc["acceptable"]), list(lc["arguable"])
            changes.append(dict(row=r["id"], change=f"acceptable {old['acceptable']} -> {r['acceptable']}; arguable "
                                f"{old['arguable']} -> {r['arguable']}", reason=lc["reason"]))
        rows.append(r)
    rows += copy.deepcopy(NEW_ROWS)
    for r in rows:
        r["tracked"] = r["id"] in TRACKED
        if r["tracked"]:
            r["tracked_reason"] = TRACKED[r["id"]]
    ids = [r["id"] for r in rows]
    assert len(ids) == len(set(ids)), "duplicate ids"
    ars = dict(doc09["arsenals"], **NEW_ARSENALS)
    return dict(version="v1.0", based_on=dict(file="scenarios_v09.json", sha256=open(V09.replace(".json", ".sha256")).read().strip()),
                approved=None, pass_rule=doc09["pass_rule"], gate=GATE, defaults=doc09["defaults"],
                defaults_text=doc09["defaults_text"], arsenals=ars, rows=rows, changes_v09=doc09.get("changes", []),
                changes_v10=changes)


def main():
    doc = build()
    if "--draft" in sys.argv:
        doc["approved"] = "DRAFT (not approved)"
        json.dump(doc, open(DRAFT, "w"), indent=1, sort_keys=True)
        print(f"wrote draft {DRAFT}: {len(doc['rows'])} rows ({sum(r.get('new_in') == 'v1.0' for r in doc['rows'])} new, "
              f"{len(doc['changes_v10'])} changes, {sum(r['tracked'] for r in doc['rows'])} tracked)")
        return
    if os.path.exists(OUT):
        raise SystemExit(f"{OUT} exists and is frozen. Delete it only with Drew's approval of a new list.")
    doc["approved"] = APPROVED
    blob = json.dumps(doc, indent=1, sort_keys=True).encode()
    open(OUT, "wb").write(blob)
    h = hashlib.sha256(blob).hexdigest()
    open(SHA, "w").write(h + "\n")
    print(f"wrote {len(doc['rows'])} scenarios; sha256 {h}")


APPROVED = ("2026-11-06 by Drew (AskUserQuestion): F5 input fix and all 6 label changes, all 39 new rows, all 6 tracked rows")

if __name__ == "__main__":
    if "--draft" not in sys.argv and not APPROVED:
        raise SystemExit("not approved yet: run with --draft for review")
    main()
