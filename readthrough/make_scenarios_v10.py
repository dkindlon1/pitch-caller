"""v1.0 Step 7: build the frozen coaching read-through readthrough/scenarios_v10.json (+ .sha256) from the v0.9 suite.
usage (repo root): python3 readthrough/make_scenarios_v10.py

- Drew's graded v0.9 rows stay pass/fail with the same pass rule (70% of calls Acceptable, at most 5% Not acceptable, 0%
  on hard-rule rows), except the regrades he approved on Nov 11 (listed in `changes`).
- Inputs carried into v1.0's meaning: a shake-off excludes the pitch at every spot (D2; the runner already reads pairs
  that way); a hitter_damage entry keyed by a bare spot described this game's earlier at-bats, which v1.0 reads only
  through the matchup memory (#7: the row's `matchup` events), so it is dropped. Landing records stay in the old
  (strikes, pitches) form; the engine reads them through landing_triple.
- One new row per v1.0 fix that no v0.9 row already covers (infield-in: D1, mashed twice: I4, shake-off: A7).
- down-middle (v1.0's knee-high target) counts as zone, down and any, but not as a corner (readthrough/scenarios.py
  GROUPS), so where a v0.9 row asks for corners it is arguable like middle (Drew), except in C1, H2 and D7 (DM_OK)."""
import copy, hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, OUT, SHA = (os.path.join(HERE, f) for f in ("scenarios_v09.json", "scenarios_v10.json", "scenarios_v10.sha256"))
WHO = "Drew, 2026-11-11 (v1.0 Step 7)"

REGRADES = {   # row -> (acceptable, arguable, not_acceptable, reason)
    "D5": (["FB:zone", "OS:zone"], [], ["ANY:chase"], "off-speed strikes in a hitter's count are acceptable (if the off-speed gets it over, get it over)"),
    "D8": (["FB:zone", "OS:zone"], [], ["ANY:chase"], "off-speed strikes at 3-1 are acceptable; no chase stays a hard rule"),
    "F3": (["FB:zone", "OS:zone"], [], ["ANY:chase"], "after two balls, any strike is acceptable, off-speed included"),
    "G4": (["FB:zone", "OS:zone"], [], [], "mixing off-speed strikes keeps even a dominant fastball from being sat on"),
    "I1": (["FB:corners", "FB:middle", "OS:any"], ["FB:chase"], [], "one hard-hit at-bat isn't enough to stay off the middle"),
    "H1": (["FB:down", "FB:middle", "OS:zone"], ["FB:up"], [], "a fastball down the middle at 2-0 is a good call even to a power hitter: you need a strike (also Drew, Nov 6)"),
}
# Drew, Nov 11: a knee-high strike over the plate ("down-middle", new in v1.0) is graded like middle (arguable) where a v0.9
# row asked for corners, except in these rows, where he graded it acceptable
DM_OK = {"C1": "a knee-high strike is a fine call at 0-2", "H2": "a knee-high strike is a fine call at 0-2, even to a contact hitter",
         "D7": "a knee-high strike is a fine call in the biggest pitch of the game"}

# Drew, Nov 11 (second pass, after seeing the 30 failing rows): calls added to Acceptable (and dropped from Arguable).
# Group A ("acceptable here": middle means anywhere in the zone), group D ("it's leaning enough": the secondary choices
# are acceptable) and the two-strike rows he took one by one.
MID = ["ANY:middle", "ANY:down-middle"]
ADD = {
    "B1": (MID, "middle means anywhere in the zone: acceptable at 0-0"), "B5": (MID, "acceptable at 1-1"),
    "B6": (MID, "acceptable at 1-1, even in a big spot"), "D10": (MID, "acceptable at 0-0 with 2 outs"),
    "I3": (MID, "acceptable on the third trip"), "J3": (MID, "acceptable in the HS 5th-inning spot"),
    "B2": (MID, "the engine leans on command enough; middle strikes acceptable"),
    "B9": (["FB:zone", "SL:chase"], "the engine leans on confidence enough"),
    "E4": (["FB:zone", "CH:zone"], "the engine leans on today's landing enough; the changeup strikes are fine"),
    "E5": (["FB:zone"], "the shake-off moves the mix enough"),
    "E7": (["FB:chase"] + MID, "the engine leans off a tired fastball enough"),
    "G2": (["SL:zone", "CH:zone"], "the engine leans on the best pitch enough"),
    "F8": (["SL:any"], "a fourth slider is fine"),
    "C2": (["ANY:corners"] + MID, "edges are acceptable at 0-2 after a whiff; middle too (same rule as C3)"),
    "F2": (["ANY:corners"] + MID, "edges and middle are acceptable as long as the chase and the repeat stay on the table (floor)"),
    "G1": (["ANY:corners"] + MID, "edges are acceptable at 1-2 against a same-side hitter; middle too (same rule as C3)"),
    "C3": (MID, "middle is acceptable at 1-2"),
    "C9": (["FB:any"], "a third fastball is fine"),
    "J2": (MID, "middle is acceptable after a taken chase"),
    "C4": (["SL:zone"], "the slider for a strike is what you'd want with the runner on 3rd (not in the dirt)"),
    "E8": (["CB:any"], "call the curveball, for a strike or a chase (and a curveball corner is no longer not acceptable)"),
    "G3": (["SL:down-away"] + MID, "a weak slider down-away is acceptable; middle too (same rule as C3)"),
    "D3": (["SL:zone"], "after the landing rule changed (a pitch not landing is held back only when behind or at 0-0): the slider for a strike is OK here"),
    "C10": (["ANY:corners"] + MID, "with an average changeup and slider the edge calls are acceptable; middle at 1-2 as in C3 (the plus-pitch version is J7)"),
}
# Not-acceptable entries Drew withdrew (E8: "strike is fine")
NOT_CLEAR = {"E8": ["CB:corners"]}
# A share the row's calls must keep (Drew on F2: "as long as the chase and repeat are still on the table").
FLOOR = {"F2": [["SL:down-away", "ANY:chase"], 0.15, "the repeat (slider down-away) and chase stay at least 15% of calls"]}

NEW = [
    dict(id="J1", situation="1-1, runner just moved to 3rd on a wild pitch, 1 out (the at-bat re-solves for the new bases)",
         why="Runner on third, one out: a ground ball or a strikeout; a fly ball scores him",
         inputs={"balls": 1, "strikes": 1, "outs": 1, "bases": [False, False, True], "last": ["Slider", "chase", "ball"]},
         acceptable=["ANY:down", "OS:chase"], arguable=["ANY:middle", "FB:up"], not_acceptable=[], hard=False),
    dict(id="J2", situation="1-2, he just took a slider in the dirt (chase target) for a ball",
         why="A chase that's taken is what was asked for: keep expanding or finish",
         inputs={"balls": 1, "strikes": 2, "last": ["Slider", "chase", "ball"]},
         acceptable=["ANY:chase", "ANY:corners"], arguable=["ANY:middle"], not_acceptable=[], hard=False),
    dict(id="J3", situation="1-1, high school, 5th inning of 7, tied, runner on 2nd, 2 outs",
         why="Late and close in a seven-inning game: the biggest pitch so far",
         inputs={"balls": 1, "strikes": 1, "outs": 2, "level": "hs", "inning": 5, "bases": [False, True, False],
                 "arsenal": "hs_two"},
         acceptable=["ANY:corners"], arguable=["CB:chase", "ANY:middle"], not_acceptable=[], hard=False),
    dict(id="J4", situation="1-1, last pitch FB up-away, taken for a ball",
         why="A taken pitch is no reason to move off it",
         inputs={"balls": 1, "strikes": 1, "last": ["Fastball", "up-away", "ball"]},
         acceptable=["ANY:zone"], arguable=["ANY:chase"], not_acceptable=[], hard=False),
    dict(id="J5", situation="3-1, slider landing 9 of 10 today, fastball 2 of 10",
         why="3-1: the pitch he's landing today",
         inputs={"balls": 3, "strikes": 1, "landing_today": {"Slider": [9, 10], "Fastball": [2, 10]}},
         acceptable=["SL:zone", "CH:zone"], arguable=["FB:zone"], not_acceptable=["ANY:chase"], hard=True),   # Drew, Nov 11: a changeup strike is fine
    dict(id="J7", situation="1-2, opposite-side hitter, plus changeup and plus slider (grade 4)",
         why="Plus changeup: away. A plus slider to an opposite-side hitter is a back-foot slider (starts middle, breaks in at his back foot)",
         inputs={"balls": 1, "strikes": 2, "same_side": False},
         pitch_edits={"Changeup": {"grade": 4}, "Slider": {"grade": 4}},
         acceptable=["CH:down-away", "CH:chase", "SL:down-in", "FB:corners"], arguable=["SL:chase", "ANY:middle"],
         not_acceptable=[], hard=False),
    dict(id="J6", situation="3-1, everything landing normally",
         why="3-1: a strike, mixed moderately among the pitches he can land",
         inputs={"balls": 3, "strikes": 1},
         acceptable=["ANY:zone"], arguable=[], not_acceptable=["ANY:chase"], hard=True),
]


def main():
    doc = json.load(open(SRC))
    out = copy.deepcopy(doc)
    out["version"] = "v1.0"
    out["approved"] = f"{doc['approved']}; v1.0 regrades and new rows {WHO}"
    changes = list(doc.get("changes", []))
    for r in out["rows"]:
        if r["id"] in REGRADES:
            acc, arg, nt, why = REGRADES[r["id"]]
            changes.append(dict(row=r["id"], date="2026-11-11", approved=WHO,
                                change=f"acceptable {r['acceptable']} -> {acc}; arguable {r['arguable']} -> {arg}; "
                                       f"not {r['not_acceptable']} -> {nt}: {why}"))
            r["acceptable"], r["arguable"], r["not_acceptable"] = acc, arg, nt
        if r["id"] in DM_OK:
            changes.append(dict(row=r["id"], date="2026-11-11", approved=WHO,
                                change=f"acceptable {r['acceptable']} + ANY:down-middle: {DM_OK[r['id']]}"))
            r["acceptable"] = r["acceptable"] + ["ANY:down-middle"]
        hd = r["inputs"].get("hitter_damage")
        if hd and any(k not in ("FB", "OS") for k in hd):
            changes.append(dict(row=r["id"], date="2026-11-11", approved="v1.0 #7 (mechanical)",
                                change=f"hitter_damage {hd} dropped: it described this game's earlier at-bats, which v1.0 "
                                       "reads through the matchup memory (the row's matchup events) only"))
            del r["inputs"]["hitter_damage"]
    for n in NEW:
        out["rows"].append(dict(dict(exclude=[], matchup=[], pitch_edits={}), **n))
        changes.append(dict(row=n["id"], date="2026-11-11", approved=WHO, change="new v1.0 row: " + n["why"]))
    for r in out["rows"]:
        if r["id"] in ADD:
            add, why = ADD[r["id"]]
            changes.append(dict(row=r["id"], date="2026-11-11", approved=WHO + ", second pass",
                                change=f"acceptable {r['acceptable']} + {add}: {why}"))
            r["acceptable"] = r["acceptable"] + [a for a in add if a not in r["acceptable"]]
            r["arguable"] = [a for a in r["arguable"] if a not in add]
        if r["id"] in NOT_CLEAR:
            changes.append(dict(row=r["id"], date="2026-11-11", approved=WHO + ", second pass",
                                change=f"not acceptable {r['not_acceptable']} - {NOT_CLEAR[r['id']]}"))
            r["not_acceptable"] = [x for x in r["not_acceptable"] if x not in NOT_CLEAR[r["id"]]]
        if r["id"] in FLOOR:
            pats, mn, why = FLOOR[r["id"]]
            changes.append(dict(row=r["id"], date="2026-11-11", approved=WHO + ", second pass", change=f"floor {pats} >= {mn:.0%}: {why}"))
            r["floor"] = [pats, mn]
    out["changes"] = changes
    blob = json.dumps(out, indent=1, sort_keys=True).encode()
    open(OUT, "wb").write(blob)
    open(SHA, "w").write(hashlib.sha256(blob).hexdigest() + "\n")
    print(f"wrote {OUT}: {len(out['rows'])} rows, sha256 {hashlib.sha256(blob).hexdigest()[:12]}")


if __name__ == "__main__":
    main()
