"""v1.3 core, Task C step 4: the standing hard checks and the 10-point adaptation robustness check, on whatever engine
`import engine` finds (run from the repo root; copy this file and scenarios.py into a `git archive` of another engine to
compare). Rows are built the way docs/SCENARIOS_v13_DRAFT.md built them (readthrough/scenarios.build on the
scenarios_v12.json arsenals and defaults). Prints JSON.

  hard foul = foul   H13-11: 1-2 after FB up-away cstrike, SL down-away ball, FB up-in foul tagged "hard" vs untagged:
                     total variation of the call mix (limit 1 point)
  hit hard           H13-15: 2-0, power hitter (w5); FB up-in hit hard once on an earlier trip (10 faced) / twice
                     (19 faced): once = small (FB up-in drops <= 5 points, no other call moves > 5), twice = large
                     (FB up-in <= 2%)
  no chase 3-0/3-1   the chase share of the call at 3-0 and 3-1 over every scenario arsenal x level (hs, D3, D1), plus
                     H13-30 (D1, 3-1, runner on 1st)
  no scouting        H13-28 (D3 0-0, first batter) and H13-29 (HS 1-1 two-pitch): top call and chase share
  robustness         H13-16: 2-2 (19 faced, pitch count 70) with the no-history top call (pitch, target) called n times in
                     this count today (usage_by_call), n = 0..6; also 3-2. The plan's limit: no 2-2 / 3-2 top call moves
                     more than 10 points across the adaptation range.
usage: python3 readthrough/hard_checks_v13.py [--out PATH]"""
import json
import os
import sys
from dataclasses import replace

sys.argv = [sys.argv[0]] + [a for a in sys.argv[1:]]
_out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
sys.argv = [sys.argv[0], "--suite", "v12"]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scenarios as R  # noqa: E402

e = R.e
DOC, _ = R.load()


def row(inputs, matchup=()):
    return {"inputs": inputs, "pitch_edits": {}, "exclude": [], "matchup": list(matchup)}


def dist_of(inputs, matchup=(), s_edit=None):
    ars, s, ex = R.build(DOC, row(inputs, matchup))
    if s_edit:
        s = replace(s, **s_edit)
    d = R.call_dist("v09", ars, s, ex)
    m = {}
    for pr, name, kind, q in d:
        m[(name, q)] = m.get((name, q), 0.0) + pr
    return m, ars


def tv(a, b):
    return 0.5 * sum(abs(a.get(k, 0) - b.get(k, 0)) for k in set(a) | set(b))


def top(m):
    k = max(m, key=m.get)
    return f"{k[0]} {k[1]}", round(m[k], 4)


def chase(m):
    return sum(v for (n, q), v in m.items() if q == "chase")


out = {"engine": getattr(e, "TABLE_VERSIONS", "v1.2.3 (no tables)"), "hanger_gate": getattr(e, "HANGER_GATE", None)}

# hard foul = foul (H13-11)
base_log = [["Fastball", "up-away", "cstrike", None, None, None], ["Slider", "down-away", "ball", [3, 4, True], None, None]]
a, _ = dist_of({"balls": 1, "strikes": 2, "pa_log": base_log + [["Fastball", "up-in", "foul", None, "hard", None]]})
b, _ = dist_of({"balls": 1, "strikes": 2, "pa_log": base_log + [["Fastball", "up-in", "foul", None, None, None]]})
out["hard_foul"] = dict(tv=round(tv(a, b), 4), limit=0.01, ok=tv(a, b) <= 0.01, top_hard=top(a), top_plain=top(b))

# hit hard once / twice (H13-15)
pw = {"balls": 2, "grades": {"w": 5}}
m0, _ = dist_of(dict(pw, batters_faced=10))
m1, _ = dist_of(dict(pw, batters_faced=10), [{"pitch": "Fastball", "result": "hard", "target": "up-in", "trip": 1}])
m2, _ = dist_of(dict(pw, batters_faced=19, familiar={"FB": 6, "OS": 4}),
                [{"pitch": "Fastball", "result": "hard", "target": "up-in", "trip": t} for t in (1, 2)])
k = ("Fastball", "up-in")
other1 = max(abs(m1.get(x, 0) - m0.get(x, 0)) for x in set(m0) | set(m1) if x != k)
out["hit_hard"] = dict(base_fb_upin=round(m0.get(k, 0), 4), once_fb_upin=round(m1.get(k, 0), 4),
                       twice_fb_upin=round(m2.get(k, 0), 4), once_drop=round(m0.get(k, 0) - m1.get(k, 0), 4),
                       once_max_other_move=round(other1, 4), tv_once=round(tv(m0, m1), 4),
                       once_ok=(m0.get(k, 0) - m1.get(k, 0) <= 0.05 and other1 <= 0.05), twice_ok=m2.get(k, 0) <= 0.02,
                       top_base=top(m0), top_once=top(m1), top_twice=top(m2))

# no chase at 3-0 / 3-1
worst, n = 0.0, 0
for ak in DOC["arsenals"]:
    for lv in ("hs", "college_d3", "college_d1"):
        for b_, k_ in ((3, 0), (3, 1)):
            for bases in ([False, False, False], [True, False, False], [False, False, True]):
                m, _ = dist_of({"arsenal": ak, "level": lv, "balls": b_, "strikes": k_, "bases": bases})
                n += 1
                worst = max(worst, chase(m))
m30, _ = dist_of({"level": "college_d1", "balls": 3, "strikes": 1, "bases": [True, False, False]})
out["no_chase_30_31"] = dict(cells=n, worst_chase=round(worst, 6), ok=worst == 0.0, h13_30_top=top(m30), h13_30_chase=chase(m30))

# no-scouting spot checks
m28, _ = dist_of({"inning": 1, "batters_faced": 0, "pitch_count": 0})
m29, _ = dist_of({"level": "hs", "arsenal": "hs_two", "balls": 1, "strikes": 1})
out["no_scouting"] = dict(h13_28_top=top(m28), h13_28_chase=round(chase(m28), 4), h13_29_top=top(m29),
                          h13_29_chase=round(chase(m29), 4))

# robustness (H13-16 and 3-2)
rob = {}
for b_, k_ in ((2, 2), (3, 2)):
    inp = {"balls": b_, "strikes": k_, "batters_faced": 19, "pitch_count": 70}
    m0, _ = dist_of(inp)
    k0 = max(m0, key=m0.get)
    rows = []
    for nc in range(0, 7):
        m, _ = dist_of(inp, s_edit={"usage_by_call": {k0: nc}} if nc else None)
        rows.append(dict(n=nc, share=round(m.get(k0, 0), 4), move=round(m0[k0] - m.get(k0, 0), 4), top=top(m)))
    rob[f"{b_}-{k_}"] = dict(no_history_top=f"{k0[0]} {k0[1]}", no_history_share=round(m0[k0], 4), by_n=rows,
                             move_at_3=rows[3]["move"], max_move=max(r["move"] for r in rows),
                             ok_at_3=rows[3]["move"] <= 0.10, ok_all=max(r["move"] for r in rows) <= 0.10)
out["robustness"] = rob
print(json.dumps(out, indent=1))
if _out:
    with open(_out, "w", encoding="utf8", newline="\n") as f:
        json.dump(out, f, indent=1)
