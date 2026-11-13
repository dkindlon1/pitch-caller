"""v1.1 Steps 3-4: build the coaching read-through readthrough/scenarios_v11.json (+ .sha256).
usage (repo root): python3 readthrough/make_scenarios_v11.py

- v1.0's 71 rows, as Drew graded them (scenarios_v10.json); at Step 4 he regrades only rows whose calls changed.
- Step 3: one fire row and one no-fire row per built setup rule (S1-S7, S9, N2), on the v1.1 arsenals below. Their grades
  are PROPOSED (Claude, Nov 12, overnight) and marked "status": "proposed" until Drew grades them; sizes are tuned to them
  provisionally. They follow Drew's v1.0 second-pass style (row F2): any strike, middle included, and the chase are
  acceptable, and a fire row's "floor" asks that the rule's payoff stays on the table (at least this share of calls). A
  no-fire row is graded the same way without the floor, and the rule must not move it. N2 (an anti-setup) asks the
  opposite: its fire row caps the sinker ("ceiling").
- Step 4 adds the profile rows.
"""
import copy, hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, OUT, SHA = (os.path.join(HERE, f) for f in ("scenarios_v10.json", "scenarios_v11.json", "scenarios_v11.sha256"))
PROPOSED = "proposed (Claude, 2026-11-12, overnight); Drew grades at Step 4"

ARSENALS = {   # v1.1 kinds and profiles (the plan's Step 4 test arsenals where they fit)
    "ride126": [dict(name="Fastball", kind="FB", shape="rides", grade=3, command=3, conf=0.7, velo=88, slot="over the top"),
                dict(name="Curve", kind="CB", shape="12-6", grade=3, command=3, conf=0.65, velo=74, slot="over the top"),
                dict(name="Changeup", kind="CH", shape="split", grade=3, command=3, conf=0.62, velo=80, slot="over the top")],
    "sink_sweep": [dict(name="Sinker", kind="SI", shape="run", grade=3, command=3, conf=0.7, velo=87, slot="low three-quarter"),
                   dict(name="Slider", kind="SL", shape="sweeper", grade=3, command=3, conf=0.65, velo=76, slot="low three-quarter"),
                   dict(name="Changeup", kind="CH", shape="fade", grade=3, command=3, conf=0.62, velo=79, slot="low three-quarter")],
    "cut_ch": [dict(name="Fastball", kind="FB", shape="", grade=3, command=3, conf=0.7, velo=88),
               dict(name="Cutter", kind="FC", shape="hard", grade=3, command=3, conf=0.66, velo=85),
               dict(name="Changeup", kind="CH", shape="fade", grade=3, command=3, conf=0.62, velo=80)],
    "four_cut": [dict(name="Fastball", kind="FB", shape="", grade=3, command=3, conf=0.7, velo=88),
                 dict(name="Cutter", kind="FC", shape="hard", grade=3, command=3, conf=0.66, velo=85),
                 dict(name="Slider", kind="SL", shape="gyro", grade=3, command=3, conf=0.65, velo=80),
                 dict(name="Curve", kind="CB", shape="", grade=3, command=3, conf=0.62, velo=74)],
    "fd": [dict(name="Sinker", kind="SI", shape="run", grade=3, command=4, conf=0.7, velo=87),
           dict(name="Curve", kind="CB", shape="", grade=3, command=3, conf=0.65, velo=74),
           dict(name="Changeup", kind="CH", shape="fade", grade=3, command=3, conf=0.62, velo=79)],
}
E = lambda n, q, r, landed=None, contact=None, read=None: [n, q, r, landed, contact, read]


def row(rid, rule, fire, situation, why, inputs, acc, arg=(), nota=(), floor=None, edits=None, ceiling=None):
    r = {"id": rid, "rule": rule, "fires": fire, "status": PROPOSED, "situation": situation, "why": why, "inputs": inputs,
         "acceptable": list(acc), "arguable": list(arg), "not_acceptable": list(nota), "exclude": [], "matchup": [],
         "pitch_edits": edits or {}, "hard": False}
    if floor:
        r["floor"] = floor
    if ceiling:
        r["ceiling"] = ceiling
    return r


ANY = ["ANY:zone", "ANY:chase"]
SETUP_ROWS = [
    row("S1f", "S1", True, "0-1, riding fastball up-away taken for a strike; ride fastball, 12-6 curve, split change",
        "Up, then down: the curve or split low after the fastball up", dict(arsenal="ride126", strikes=1,
        pa_log=[E("Fastball", "up-away", "cstrike")]), ANY, floor=[["CB:down", "CH:down", "OS:chase"], 0.42]),
    row("S1n", "S1", False, "Same, but the fastball is a dead-zone (straight) fastball", "No vertical contrast: no setup",
        dict(arsenal="ride126", strikes=1, pa_log=[E("Fastball", "up-away", "cstrike")]), ANY, edits={"Fastball": {"shape": "straight"}}),
    row("S2f", "S2", True, "1-1, same-side hitter, sinker in taken for a strike; sinker, sweeper, changeup",
        "In, then away: slider down and away after the sinker in", dict(arsenal="sink_sweep", balls=1, strikes=1,
        pa_log=[E("Sinker", "down-away", "ball", [3, 4, True]), E("Sinker", "up-in", "cstrike")]), ANY,
        floor=[["SL:down-away", "SL:chase"], 0.05]),
    row("S2n", "S2", False, "Same, but he pulled the sinker in foul (on time)", "He was on the inside pitch: no setup",
        dict(arsenal="sink_sweep", balls=1, strikes=1, pa_log=[E("Sinker", "down-away", "ball", [3, 4, True]),
        E("Sinker", "up-in", "foul", read="pull")]), ANY),
    row("S3f", "S3", True, "0-1, opposite-side hitter, hard cutter in taken for a strike; fastball, cutter, changeup",
        "Hard in, soft away: changeup down and away", dict(arsenal="cut_ch", strikes=1, same_side=False,
        pa_log=[E("Cutter", "down-in", "cstrike")]), ANY, floor=[["CH:down-away", "CH:chase"], 0.13]),
    row("S3n", "S3", False, "Same, but he pulled the cutter foul (on time)", "He was on the inside pitch: no setup",
        dict(arsenal="cut_ch", strikes=1, same_side=False, pa_log=[E("Cutter", "down-in", "foul", read="pull")]), ANY),
    row("S4f", "S4", True, "1-1, fastball on the outer third, fouled the opposite way; three-pitch arsenal (changeup 8 mph slower)",
        "Same lane, slower: changeup away and down", dict(arsenal="three", balls=1, strikes=1,
        pa_log=[E("Fastball", "down-away", "ball", [3, 4, True]), E("Fastball", "up-away", "foul", read="opposite")]), ANY,
        floor=[["CH:down-away", "CH:chase"], 0.05]),
    row("S4n", "S4", False, "Same, but a firm changeup (82, 3 mph off)", "No speed gap: no setup", dict(arsenal="three", balls=1,
        strikes=1, pa_log=[E("Fastball", "down-away", "ball", [3, 4, True]), E("Fastball", "up-away", "foul", read="opposite")]),
        ANY, edits={"Changeup": {"shape": "firm", "velo": 82}}),
    row("S5f", "S5", True, "1-2, opposite-side hitter, worked away with soft stuff; sinker (command 4), curve, changeup",
        "Front door: the run sinker starting at his hip, back over the inner edge", dict(arsenal="fd", balls=1, strikes=2,
        same_side=False, pa_log=[E("Changeup", "down-away", "whiff"), E("Curve", "down-away", "cstrike"),
        E("Sinker", "up-away", "ball", [1, 4, False])]), ANY, floor=[["SI:in"], 0.05]),
    row("S5n", "S5", False, "Same, but sinker command 3", "Command below 4: no front door",
        dict(arsenal="fd", balls=1, strikes=2, same_side=False, pa_log=[E("Changeup", "down-away", "whiff"),
        E("Curve", "down-away", "cstrike"), E("Sinker", "up-away", "ball", [1, 4, False])]), ANY, edits={"Sinker": {"command": 3}}),
    row("S6f", "S6", True, "0-1, first-pitch curve taken for a strike; four-pitch arsenal",
        "Stole strike one with the curve: attack with the fastball", dict(arsenal="four", strikes=1,
        pa_log=[E("Curveball", "down-away", "cstrike")]), ANY, floor=[["FB:zone"], 0.44]),
    row("S6n", "S6", False, "1-0, the first-pitch curve missed for a ball", "No stolen strike: no setup",
        dict(arsenal="four", balls=1, pa_log=[E("Curveball", "down-away", "ball")]), ANY),
    row("S7f", "S7", True, "1-2, riding fastball up got a late swing-and-miss; ride fastball, 12-6 curve, split change",
        "Climb the ladder: the ride fastball just above the zone", dict(arsenal="ride126", balls=1, strikes=2,
        pa_log=[E("Fastball", "up-in", "cstrike"), E("Fastball", "up-away", "whiff", read="late"), E("Curve", "chase", "ball")]),
        ANY, floor=[["FB:chase"], 0.05]),
    row("S7n", "S7", False, "Same, but he was out in front of the fastball up", "He was early: no ladder",
        dict(arsenal="ride126", balls=1, strikes=2, pa_log=[E("Fastball", "up-in", "cstrike"),
        E("Fastball", "up-away", "whiff", read="front"), E("Curve", "chase", "ball")]), ANY),
    row("S9f", "S9", True, "1-2, early fastball on the outside edge; fastball, hard cutter, gyro slider, curve",
        "Work the edge, then expand off it: the slider away / chase", dict(arsenal="four_cut", balls=1, strikes=2,
        pa_log=[E("Fastball", "down-away", "cstrike"), E("Slider", "middle", "foul"), E("Cutter", "up-in", "ball", [0, 0, True])]),
        ANY, floor=[["SL:chase", "SL:down-away"], 0.12]),
    row("S9n", "S9", False, "Same, but the edge fastball was fouled straight back", "He was on the edge pitch: no setup",
        dict(arsenal="four_cut", balls=1, strikes=2, pa_log=[E("Fastball", "down-away", "foul", read="back"),
        E("Slider", "middle", "cstrike"), E("Cutter", "up-in", "ball", [0, 0, True])]), ANY),
    row("N2f", "N2", True, "0-1, changeup down-away taken for a strike; sinker (command 4), curve, changeup",
        "Don't follow a changeup with a sinker (both move arm side)", dict(arsenal="fd", strikes=1,
        pa_log=[E("Changeup", "down-away", "cstrike")]), ANY, ceiling=[["SI:any"], 0.46]),
    row("N2n", "N2", False, "0-1, the curve down-away taken for a strike", "No changeup before it: no anti-setup",
        dict(arsenal="fd", strikes=1, pa_log=[E("Curve", "down-away", "cstrike")]), ANY),
]


def main():
    doc = json.load(open(SRC))
    out = copy.deepcopy(doc)
    out["version"] = "v1.1"
    out["approved"] = doc["approved"] + "; v1.1 Step 3 setup rows PROPOSED (Claude, 2026-11-12), Drew grades at Step 4"
    for r in out["rows"]:
        r.setdefault("status", "graded (Drew, v1.0)")
    out["arsenals"].update(ARSENALS)
    out["rows"] += SETUP_ROWS
    blob = json.dumps(out, indent=1, sort_keys=True).encode()
    open(OUT, "wb").write(blob)
    open(SHA, "w").write(hashlib.sha256(blob).hexdigest() + "\n")
    print(f"wrote {OUT}: {len(out['rows'])} rows ({len(SETUP_ROWS)} setup rows, proposed)")


if __name__ == "__main__":
    main()
