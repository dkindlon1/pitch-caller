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
        out["rows"].append(dict(n, exclude=[], matchup=[], pitch_edits={}))
        changes.append(dict(row=n["id"], date="2026-11-11", approved=WHO, change="new v1.0 row: " + n["why"]))
    out["changes"] = changes
    blob = json.dumps(out, indent=1, sort_keys=True).encode()
    open(OUT, "wb").write(blob)
    open(SHA, "w").write(hashlib.sha256(blob).hexdigest() + "\n")
    print(f"wrote {OUT}: {len(out['rows'])} rows, sha256 {hashlib.sha256(blob).hexdigest()[:12]}")


if __name__ == "__main__":
    main()
