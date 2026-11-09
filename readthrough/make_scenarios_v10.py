"""v1.0 Phase 1.2: build the v1.0 scenario suite. Writes readthrough/scenarios_v10.json and its checksum.

The v0.9 file stays frozen; this is a new file, as Drew approved. It starts from all 64 v0.9 rows, keeping their ids
and their Not-acceptable lists untouched, and makes three kinds of change (see docs/PLAN_v1.0.md 1.2):

  1. The F5 input fix. F5's text says the hitter fouled a changeup straight back, but its input only said "foul", so
     the row could never pass. Its last pitch becomes ["Changeup", "down-away", "foul", "back"].
  2. Label review. The plan allows a label change only where a v0.9 label contradicts a decision Drew has already
     made. CHANGES below records the outcome of that review; see the note there.
  3. 39 new rows, in the groups the plan lists.

Rows whose passing depends on the hitter model may be marked "tracked": true with a reason. Tracked rows are graded
and printed but do not count toward the pass gate, because the calling side cannot fix them.

usage (repo root): python3 readthrough/make_scenarios_v10.py [--force]
The grader (readthrough/scenarios_v10.py) refuses to run once the sha256 no longer matches, so the file is frozen
after Drew approves it.
"""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "scenarios_v09.json")
OUT = os.path.join(HERE, "scenarios_v10.json")
SHA = os.path.join(HERE, "scenarios_v10.sha256")

L = lambda s, t: [s, t]          # landing_today: (strikes, thrown)

# ---------------------------------------------------------------------------------------------------------------
# 1. the F5 input fix
# ---------------------------------------------------------------------------------------------------------------
F5_FIX = {"id": "F5", "inputs": {"last": ["Changeup", "down-away", "foul", "back"]},
          "reason": "The row's text says he fouled the changeup straight back, but the input only said 'foul', so the "
                    "read never reached the engine and the row could not pass. The fourth element is the read."}

# ---------------------------------------------------------------------------------------------------------------
# 2. label review: the outcome
# ---------------------------------------------------------------------------------------------------------------
# 32 rows fail on the Acceptable share alone on the current engine (A7 B1 B2 B5 B6 B9 C2 C3 C4 C5 C9 C10 D1 D2 D3 D9
# D10 E4 E5 E7 E8 F2 F6 F7 F8 G1 G2 G3 H3 H4 I2 I3). Every one was read against the decisions on record: Variety
# Medium, v0.6d (lean on what is landing), v0.7c 3-0, v0.9's no-chase and attack-the-zone rules, and the repeat and
# coach rules in this plan.
#
# No label contradicts any of them, so CHANGES is empty, deliberately. The common thread in all 32 is that
# `ANY:middle` is Arguable while the engine puts 54.8% of its calls there (results/callsheet_v09.md, band B6). That
# is the engine being wrong, not the label: Phase 3 is what fixes it, and relabelling middle as Acceptable would
# delete the evidence. Three rows depend on the hitter model instead and are marked tracked below.
CHANGES = []

# ---------------------------------------------------------------------------------------------------------------
# tracked rows: passing depends on the hitter model (docs/PLAN_v1.0.md section 2), so the calling side cannot fix them
# ---------------------------------------------------------------------------------------------------------------
TRACKED = {
    "F6": "Wants more fastballs because the hitter is late on them. The size of that effect is timing_B in the hitter "
          "model, which this plan may not touch; band T1 tracks the same thing.",
    "F7": "Wants soft stuff because the hitter is out in front of it. Same timing_B term as F6.",
    "H4": "Wants inside fastballs to a hitter who crowds the plate. The crowding term is hitter math; band T2 tracks "
          "the same effect and is also tracked.",
}

# ---------------------------------------------------------------------------------------------------------------
# 3. new rows
# ---------------------------------------------------------------------------------------------------------------
ARS_NEW = {
    "plus_ch": [dict(name="Fastball", kind="FB", grade=3, command=3, conf=0.70, shape="ride", velo=85),
                dict(name="Slider", kind="SL", grade=3, command=3, conf=0.65, shape="tight", velo=77),
                dict(name="Changeup", kind="CH", grade=5, command=4, conf=0.90, shape="fade", velo=77)],
    "sinker": [dict(name="Fastball", kind="FB", grade=3, command=3, conf=0.70, shape="sink", velo=85),
               dict(name="Slider", kind="SL", grade=3, command=3, conf=0.65, shape="tight", velo=77),
               dict(name="Changeup", kind="CH", grade=3, command=3, conf=0.60, shape="fade", velo=77)],
}


def row(id_, hard, text, why, inp, acc, arg=(), nok=(), pitch_edits=None, exclude=None, matchup=None, tracked=False,
        tracked_why=""):
    d = dict(id=id_, hard=hard, situation=text, why=why, inputs=inp, pitch_edits=pitch_edits or {},
             exclude=exclude or [], matchup=matchup or [], acceptable=list(acc), arguable=list(arg),
             not_acceptable=list(nok))
    if tracked:
        d["tracked"] = True
        d["tracked_why"] = tracked_why
    return d


NEW = [
    # --- J. plus changeup (6): the changeup is his best pitch and must be used like one ------------------------
    row("J1", False, "0-0, changeup grade 5 command 4 (his best pitch)",
        "Get ahead with the best pitch, the same rule as G2", dict(arsenal="plus_ch"),
        ["CH:zone", "FB:zone"], ["SL:zone", "ANY:middle"], ["ANY:chase"]),
    row("J2", False, "2-0, changeup grade 5, opposite-side hitter",
        "A hitter's count is not a reason to abandon a trusted off-speed",
        dict(arsenal="plus_ch", balls=2, same_side=False), ["CH:zone", "FB:zone"], ["SL:zone", "ANY:middle"],
        ["ANY:chase"]),
    row("J3", False, "1-2, changeup grade 5, opposite-side hitter",
        "With two strikes the plus changeup is the put-away pitch",
        dict(arsenal="plus_ch", balls=1, strikes=2, same_side=False),
        ["CH:down-away", "CH:chase", "SL:chase", "FB:chase", "FB:up"], ["ANY:middle"]),
    row("J4", False, "0-1, changeup grade 5, same-side hitter",
        "Even same-side the plus changeup is in the mix, just not the first choice",
        dict(arsenal="plus_ch", strikes=1), ["FB:corners", "SL:corners", "CH:down"], ["ANY:middle", "CH:chase"]),
    row("J5", False, "2-2, changeup grade 5, runner on 2nd, 1 out",
        "Attack the zone at 2-2, and the changeup is a zone pitch for him",
        dict(arsenal="plus_ch", balls=2, strikes=2, outs=1, bases=[False, True, False]),
        ["CH:zone", "FB:zone", "SL:zone"], [], ["ANY:chase"]),
    row("J6", False, "1-1, changeup grade 5, fastball landing 3 of 10 today",
        "Lean on what is working: the changeup carries the at-bat",
        dict(arsenal="plus_ch", balls=1, strikes=1, landing_today={"Fastball": L(3, 10)}),
        ["CH:zone", "CH:chase", "SL:zone"], ["FB:zone"], ["FB:chase"]),
    # --- K. sinker / ground ball, runner on 1st, fewer than 2 outs (4) ----------------------------------------
    row("K1", False, "0-0, sinker, runner on 1st, 0 outs",
        "Double-play ball: keep the sinker down", dict(arsenal="sinker", bases=[True, False, False]),
        ["ANY:down"], ["ANY:middle", "ANY:up"]),
    row("K2", False, "1-1, sinker, runner on 1st, 0 outs",
        "Still hunting the double play at 1-1",
        dict(arsenal="sinker", balls=1, strikes=1, bases=[True, False, False]), ["ANY:down"],
        ["ANY:middle", "ANY:up"]),
    row("K3", False, "0-1, sinker, runner on 1st, 1 out",
        "One out: a grounder still ends the inning",
        dict(arsenal="sinker", strikes=1, outs=1, bases=[True, False, False]), ["ANY:down"],
        ["ANY:middle", "ANY:up"]),
    row("K4", False, "2-1, sinker, runner on 1st, 0 outs",
        "A hitter's count does not turn off the double-play plan",
        dict(arsenal="sinker", balls=2, strikes=1, bases=[True, False, False]), ["ANY:down", "FB:corners"],
        ["ANY:middle", "ANY:up"]),
    # --- M. late and close (6) --------------------------------------------------------------------------------
    row("M1", False, "0-0, 8th inning, up 1, runner on 2nd, 1 out",
        "Big spot: no free bases, no middle", dict(balls=0, inning=8, margin=1, outs=1, bases=[False, True, False]),
        ["ANY:corners"], ["ANY:middle"], ["ANY:chase"]),
    row("M2", False, "1-2, 8th inning, up 1, runner on 3rd, 1 out",
        "Two strikes in a big spot, but the run on 3rd rules out the dirt",
        dict(balls=1, strikes=2, inning=8, margin=1, outs=1, bases=[False, False, True]),
        ["FB:up", "FB:away", "CH:down-away", "SL:down-away"], ["ANY:middle", "SL:chase", "CH:chase"]),
    row("M3", False, "3-2, 9th inning, tied, bases loaded, 2 outs",
        "Full count, forced to throw a strike", dict(balls=3, strikes=2, inning=9, outs=2, bases=[True, True, True]),
        ["ANY:zone"], [], ["ANY:chase"]),
    row("M4", False, "0-2, 9th inning, up 2, bases empty, 2 outs",
        "Two strikes, two outs, a two-run lead: expand freely",
        dict(strikes=2, inning=9, margin=2, outs=2), ["ANY:chase", "ANY:corners"], ["ANY:middle"]),
    row("M5", False, "1-1, high school, 6th inning, up 1, runner on 1st, 1 out",
        "Late and close at high school is the 6th, not the 8th",
        dict(level="hs", arsenal="hs_two", balls=1, strikes=1, inning=6, margin=1, outs=1,
             bases=[True, False, False]), ["ANY:corners", "ANY:down"], ["ANY:middle"], ["ANY:chase"]),
    row("M6", False, "2-1, 8th inning, tied, runner on 2nd, 2 outs",
        "A hitter's count in a big spot still has to mix",
        dict(balls=2, strikes=1, inning=8, outs=2, bases=[False, True, False]), ["ANY:corners"],
        ["ANY:middle"], ["ANY:chase"]),
    # --- N. runners in scoring position (6) -------------------------------------------------------------------
    row("N1", False, "0-0, runner on 2nd, 0 outs",
        "A single scores him: work the corners", dict(bases=[False, True, False]), ["ANY:corners"],
        ["ANY:middle"], ["ANY:chase"]),
    row("N2", False, "0-1, runner on 2nd, 1 out, slider landing 2 of 8 today",
        "A wild slider lets him take 3rd", dict(strikes=1, outs=1, bases=[False, True, False],
                                                landing_today={"Slider": L(2, 8)}),
        ["FB:corners", "CH:zone"], ["SL:zone", "ANY:middle"], ["SL:chase"]),
    row("N3", False, "1-1, runners on 2nd and 3rd, 1 out",
        "Two runs in scoring position: nothing in the dirt, nothing over the middle",
        dict(balls=1, strikes=1, outs=1, bases=[False, True, True]), ["ANY:corners"], ["ANY:middle"],
        ["ANY:chase"]),
    row("N4", False, "0-2, runner on 3rd, 1 out, changeup landing 1 of 6 today",
        "Two strikes would normally allow the chase, but not with a run on 3rd and a pitch that isn't landing",
        dict(strikes=2, outs=1, bases=[False, False, True], landing_today={"Changeup": L(1, 6)}),
        ["FB:up", "FB:away", "SL:down-away"], ["ANY:middle", "SL:chase"], ["CH:any"]),
    row("N5", False, "2-2, runners on 1st and 3rd, 1 out",
        "Attack the zone at 2-2 even with the run on 3rd",
        dict(balls=2, strikes=2, outs=1, bases=[True, False, True]), ["ANY:zone"], [], ["ANY:chase"]),
    row("N6", False, "1-0, runner on 3rd, 0 outs, infield in",
        "Infield in: a grounder is an out, so stay down", dict(balls=1, bases=[False, False, True], infield_in=True),
        ["ANY:down"], ["ANY:middle", "FB:up"]),
    # --- P. two-pitch and four-pitch arsenals (3 + 3) ---------------------------------------------------------
    row("P1", False, "0-0, two-pitch (FB, SL)",
        "Two pitches still have to mix off each other", dict(arsenal="two"), ["ANY:corners"], ["ANY:middle"],
        ["ANY:chase"]),
    row("P2", False, "2-0, two-pitch (FB, SL)",
        "A hitter's count with two pitches is where predictability bites hardest",
        dict(arsenal="two", balls=2), ["ANY:corners"], ["ANY:middle"], ["ANY:chase"]),
    row("P3", False, "1-2, two-pitch (FB, SL), runner on 1st, 1 out",
        "Put him away without giving up the double play",
        dict(arsenal="two", balls=1, strikes=2, outs=1, bases=[True, False, False]),
        ["ANY:chase", "ANY:corners", "ANY:down"], ["ANY:middle"]),
    row("P4", False, "0-0, four-pitch", "Four pitches: no reason for one to carry the count",
        dict(arsenal="four"), ["ANY:corners"], ["ANY:middle"], ["ANY:chase"]),
    row("P5", False, "2-1, four-pitch", "Four pitches in a hitter's count: mix",
        dict(arsenal="four", balls=2, strikes=1), ["ANY:corners"], ["ANY:middle"], ["ANY:chase"]),
    row("P6", False, "1-2, four-pitch, opposite-side hitter",
        "Four put-away options against an opposite-side hitter",
        dict(arsenal="four", balls=1, strikes=2, same_side=False),
        ["ANY:chase", "CH:down-away", "CB:down", "FB:up", "FB:away"], ["ANY:middle"]),
    # --- Q. repeats with foul reads (4): Phase 3.1 RP1/RP2 ----------------------------------------------------
    # hard, with FB:middle Not acceptable: RP2 must drop that exact pitch and spot for the next pitch only
    row("Q1", True, "1-1, he fouled the last fastball middle straight back",
        "Fouled straight back means he is on it: not that pitch and spot again right now",
        dict(balls=1, strikes=1, last=["Fastball", "middle", "foul", "back"]),
        ["SL:any", "CH:any", "FB:corners"], ["ANY:middle"], ["FB:middle"]),
    row("Q2", False, "1-1, he fouled the last fastball middle to the pull side",
        "Pulled foul is early, not on it: the fastball is still fine",
        dict(balls=1, strikes=1, last=["Fastball", "middle", "foul", "pull"]),
        ["FB:any", "SL:any", "CH:any"], ["ANY:middle"], []),
    row("Q3", False, "1-1, he fouled the last fastball middle to the opposite side",
        "Opposite-field foul is late: the fastball is working",
        dict(balls=1, strikes=1, last=["Fastball", "middle", "foul", "opposite"]),
        ["FB:any", "SL:any", "CH:any"], ["ANY:middle"], []),
    row("Q4", False, "1-1, he fouled the last fastball middle, no read recorded",
        "With no read the foul carries no extra information",
        dict(balls=1, strikes=1, last=["Fastball", "middle", "foul"]),
        ["FB:any", "SL:any", "CH:any"], ["ANY:middle"], []),
    # --- R. nothing trusted, the fallback (2): Phase 3.2 ------------------------------------------------------
    # the plan's own Phase 3.2 test: curveball 2 of 12, fastball 7 of 12, everything below the cutoff, and the
    # CURVEBALL holding the higher confidence. The fallback must still pick the fastball, not the bullpen feel.
    row("R1", True, "1-1, high school, two-pitch (FB, CB), every pitch below the confidence cutoff; "
                    "fastball landing 7 of 12, curveball 2 of 12, curveball the more confident pitch",
        "Nothing is trusted, so go with what is landing, not with bullpen feel",
        dict(arsenal="hs_two", level="hs", balls=1, strikes=1,
             landing_today={"Fastball": L(7, 12), "Curveball": L(2, 12)}),
        ["FB:zone"], ["FB:chase"], ["CB:any"],
        pitch_edits={"Fastball": {"conf": 0.30}, "Curveball": {"conf": 0.40}}),
    row("R2", True, "0-1, every pitch below the confidence cutoff, all three landing badly",
        "When nothing is landing either, go with the best strike estimate and tell the coach",
        dict(strikes=1, landing_today={"Fastball": L(4, 12), "Slider": L(3, 12), "Changeup": L(2, 12)}),
        ["FB:zone"], ["SL:zone", "CH:zone", "ANY:middle"], ["ANY:chase"],
        pitch_edits={"Fastball": {"conf": 0.30}, "Slider": {"conf": 0.32}, "Changeup": {"conf": 0.35}}),
    # --- S. inside and crowding (3) ---------------------------------------------------------------------------
    row("S1", False, "1-1, hitter crowds the plate, fastball command 4",
        "A pitcher who can command it should go in on a hitter who crowds",
        dict(balls=1, strikes=1, crowding=True), ["FB:in"], ["FB:away", "OS:any", "ANY:middle"], [],
        pitch_edits={"Fastball": {"command": 4}}, tracked=True,
        tracked_why="How much crowding moves the call is hitter math, like H4 and band T2."),
    row("S2", False, "0-0, opposite-side hitter, fastball command 4",
        "Inside to an opposite-side hitter is a real target, not a mistake",
        dict(same_side=False), ["FB:corners", "SL:corners", "CH:down-away"], ["ANY:middle"], ["ANY:chase"],
        pitch_edits={"Fastball": {"command": 4}}),
    row("S3", False, "2-1, fastball command 4, bases empty",
        "In a hitter's count the inside corner is a strike he does not want",
        dict(balls=2, strikes=1), ["FB:corners", "ANY:corners"], ["ANY:middle"], ["ANY:chase"],
        pitch_edits={"Fastball": {"command": 4}}),
    # --- T. two strikes, a pitch that isn't landing, runner on 3rd (2): Phase 3.3 ------------------------------
    row("T1x", True, "0-2, runner on 3rd, 0 outs, slider landing 0 of 4 today",
        "Runner on 3rd: no dirt ball with a pitch that isn't landing, two strikes or not",
        dict(strikes=2, bases=[False, False, True], landing_today={"Slider": L(0, 4)}),
        ["FB:up", "FB:away", "CH:down-away", "CH:chase"], ["ANY:middle", "FB:chase"], ["SL:any"]),
    row("T2x", True, "1-2, runner on 3rd, 1 out, changeup landing 1 of 5 today",
        "Same rule with one out: the changeup in the dirt scores him",
        dict(balls=1, strikes=2, outs=1, bases=[False, False, True], landing_today={"Changeup": L(1, 5)}),
        ["FB:up", "FB:away", "SL:down-away"], ["ANY:middle", "SL:chase", "FB:chase"], ["CH:any"]),
]


def build():
    src = json.load(open(SRC, encoding="utf-8"))
    rows = [dict(r) for r in src["rows"]]
    by_id = {r["id"]: r for r in rows}

    # 1. F5 input fix
    assert F5_FIX["id"] in by_id, "F5 missing from the v0.9 suite"
    by_id[F5_FIX["id"]]["inputs"] = {**by_id[F5_FIX["id"]]["inputs"], **F5_FIX["inputs"]}

    # 2. label changes (none; see CHANGES)
    for ch in CHANGES:
        r = by_id[ch["id"]]
        for k in ("acceptable", "arguable"):
            if k in ch:
                r[k] = list(ch[k])

    # tracked rows carried over from v0.9
    for rid, why in TRACKED.items():
        assert rid in by_id, rid
        by_id[rid]["tracked"] = True
        by_id[rid]["tracked_why"] = why

    # 3. new rows
    ids = {r["id"] for r in rows}
    for r in NEW:
        assert r["id"] not in ids, f"duplicate id {r['id']}"
        ids.add(r["id"])
    rows = rows + [dict(r) for r in NEW]

    out = {
        "approved": "PENDING Drew's approval (built 2026-11-09)",
        "from": {"file": "scenarios_v09.json", "sha256": hashlib.sha256(open(SRC, "rb").read()).hexdigest(),
                 "rows": len(src["rows"])},
        "pass_rule": dict(src["pass_rule"]),
        "defaults": dict(src["defaults"]),
        "defaults_text": src["defaults_text"],
        "arsenals": {**src["arsenals"], **ARS_NEW},
        "changes": {"f5_input_fix": F5_FIX, "label_changes": CHANGES,
                    "label_review_note": "32 rows fail on the Acceptable share alone; none of their labels "
                                         "contradicts a decision on record, so no label was changed. The shared cause "
                                         "is middle being Arguable while the engine calls it 54.8% of the time "
                                         "(callsheet band B6), which Phase 3 fixes.",
                    "tracked": TRACKED, "new_rows": [r["id"] for r in NEW]},
        "rows": rows,
    }
    return out


def main():
    if os.path.exists(OUT) and "--force" not in sys.argv:
        sys.exit(f"{OUT} exists; pass --force to rebuild it (it is frozen once Drew approves).")
    out = build()
    txt = json.dumps(out, indent=1, sort_keys=True)
    open(OUT, "w", newline="\n", encoding="utf-8").write(txt)
    sha = hashlib.sha256(open(OUT, "rb").read()).hexdigest()
    open(SHA, "w", newline="\n", encoding="utf-8").write(sha + "\n")
    n_tracked = sum(1 for r in out["rows"] if r.get("tracked"))
    print(f"wrote {os.path.relpath(OUT, os.path.dirname(HERE))}: {len(out['rows'])} rows "
          f"({len(out['changes']['new_rows'])} new, {n_tracked} tracked, {len(CHANGES)} label changes)")
    print(f"sha256 {sha}")


if __name__ == "__main__":
    main()
