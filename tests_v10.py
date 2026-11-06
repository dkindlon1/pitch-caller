"""v1.0 unit tests (PLAN_v1.0.md Phase 3), one block per sub-step. python3 tests_v10.py
Each check prints ok/FAIL with the numbers; exit 1 if any fails."""
import json, math, os, sys
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as e

FAILS = []


def check(ok, name, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'} {name}" + (f"  [{detail}]" if detail else ""))
    if not ok:
        FAILS.append(name)


ARS = json.load(open(os.path.join(HERE, "callsheet_arsenals.json")))


def ars(name, edits=None):
    return [e.Pitch(**dict(d, **((edits or {}).get(d["name"], {})))) for d in ARS[name]]


class Half:
    def random(self):
        return 0.5


E3 = (False, False, False)


def sit(b, k, level="college_d3", bases=E3, outs=1, history=(), **kw):
    s = e.Situation(b, k, outs, bases, inning=4, level=level, **kw)
    if history:
        s = replace(s, history=tuple(tuple(h) for h in history), last=tuple(history[-1][:3]))
    return s


_TABS = {}


def table(a, s):
    key = (id(a), s.level, s.outs, s.bases, s.same_side, json.dumps(s.landing_today, sort_keys=True), s.crowding,
           json.dumps(s.grades, sort_keys=True), json.dumps(s.matchup, sort_keys=True))
    if key not in _TABS:
        _TABS[key] = e.solve_table(a, replace(s, balls=0, strikes=0, last=None, history=()))
    return _TABS[key]


def dist(a, s, exclude=None, tab=None):
    tab = tab or table(a, s)
    s = replace(s, look=tab.h0)
    s = replace(s, b_h=e.lean_b_h(a, s))
    pick, d, tab, info = e.call_v08(a, s, rng=Half(), exclude=exclude, tab=tab)
    sh = {}
    for pr, _c, p, q in d:
        sh[(p.name, q)] = sh.get((p.name, q), 0.0) + pr
    return sh, info, pick, tab, s


def by_pitch(sh):
    out = {}
    for (n, q), v in sh.items():
        out[n] = out.get(n, 0.0) + v
    return out


def top(sh):
    return max(sh, key=sh.get)


# ---------------------------------------------------------------------------
print("3.1 at-bat history and repeats")
CTX = [(lv, an, same) for lv in ("hs", "college_d3", "college_d1") for an in ("slider_best", "plus_changeup") for same in (True, False)]
worst = {"rp1": 0.0, "rp2": 0.0, "foul": -1.0, "whiff": 9.0}
for lv, an, same in CTX:
    a = ars(an)
    base02, _, _, _, _ = dist(a, sit(0, 2, lv, same_side=same))
    x = top(base02)
    sh, info, _, _, _ = dist(a, sit(0, 2, lv, same_side=same, history=[x + ("cstrike", None), x + ("cstrike", None)]))
    worst["rp1"] = max(worst["rp1"], sh.get(x, 0.0))
    base01, _, _, _, _ = dist(a, sit(0, 1, lv, same_side=same))
    x1 = top(base01)
    sh2, info2, _, _, _ = dist(a, sit(0, 1, lv, same_side=same, history=[x1 + ("foul", "back")]))
    worst["rp2"] = max(worst["rp2"], sh2.get(x1, 0.0))
    sh3, _, _, _, _ = dist(a, sit(0, 1, lv, same_side=same, history=[x1 + ("foul", None)]))
    worst["foul"] = max(worst["foul"], sh3.get(x1, 0.0) - base01.get(x1, 0.0))
    sh4, _, _, _, _ = dist(a, sit(0, 1, lv, same_side=same, history=[x1 + ("whiff", None)]))
    b0, b1 = by_pitch(base01).get(x1[0], 0.0), by_pitch(sh4).get(x1[0], 0.0)
    worst["whiff"] = min(worst["whiff"], b1 / b0 if b0 else 9.0)
n = len(CTX)
check(worst["rp1"] == 0.0, f"RP1: a third straight exact repeat gets 0% ({n} contexts, 0-2)", f"largest share {worst['rp1']:.4f}")
check(worst["rp2"] == 0.0, f"RP2: after a foul straight back the exact repeat gets 0% next pitch ({n} contexts, 0-1)",
      f"largest share {worst['rp2']:.4f}")
check(worst["foul"] <= 1e-12, "after a plain foul the exact repeat is not called more than with no history",
      f"largest change {worst['foul']:+.4f}")
check(worst["whiff"] >= 0.9, "after a whiff the same pitch type is called at least 90% as often as with no history",
      f"smallest ratio {worst['whiff']:.3f}")
# the same pitch elsewhere is still allowed after a foul straight back
a = ars("slider_best")
x1 = top(dist(a, sit(0, 1))[0])
calls = e.allowed_calls(a, sit(0, 1, history=[x1 + ("foul", "back")]))
check(x1 not in calls and any(c[0] == x1[0] for c in calls), "RP2 drops only the exact call; the pitch elsewhere stays",
      f"{x1} out, {sum(c[0] == x1[0] for c in calls)} other {x1[0]} spots in")
# stands down if it would leave nothing
only = [("Fastball", q) for q in e.targets(0, 2) if q != "up-away"] + [(p, q) for p in ("Slider", "Changeup") for q in e.targets(0, 2)]
calls, notes = e.call_rules(a, sit(0, 2, history=[("Fastball", "up-away", "cstrike", None)] * 2), exclude=set(only))
check(calls == [("Fastball", "up-away")] and notes.get("RP1_stood_down"), "RP1 stands down when it would leave nothing",
      f"calls {calls}, notes {notes}")
# RP3: each of the last two fouls on P adds log 1.3 to the sit on P at that height
s_h = sit(1, 2, history=[("Slider", "down-away", "foul", None), ("Fastball", "up-in", "foul", "pull"),
                         ("Slider", "chase", "foul", None)])
bh = e.lean_b_h(a, s_h)
check(abs(bh.get(("Fastball", "up"), 0) - math.log(1.3)) < 1e-12 and abs(bh.get(("Slider", "down"), 0) - math.log(1.3)) < 1e-12
      and len(bh) == 2, "RP3: the last two fouls lean the hitter to that pitch at that height (the oldest foul drops out)",
      f"{ {k: round(v, 4) for k, v in bh.items()} }")
check(e.lean_b_h(a, sit(1, 2)) == {}, "RP3: no history, no lean")
# why lines
x02 = top(dist(a, sit(0, 2))[0])
sh, info, pick, tab, s_ = dist(a, sit(0, 2, history=[x02 + ("cstrike", None)] * 2))
check(e.why_line(a, s_, tab, pick, info)[0] == "Not the same pitch and spot a third time.", "RP1 why line",
      e.why_line(a, s_, tab, pick, info)[0])
sh, info, pick, tab, s_ = dist(a, sit(0, 1, history=[x1 + ("foul", "back")]))
check(e.why_line(a, s_, tab, pick, info)[0] == "He fouled it straight back. Don't go back there yet.", "RP2 why line",
      e.why_line(a, s_, tab, pick, info)[0])
# the plan table ignores in-at-bat history (like last)
t1 = e.solve_table(a, sit(0, 0))
t2 = e.solve_table(a, replace(sit(0, 0), history=(("Slider", "chase", "foul", "back"),) * 2))
check(t1.V == t2.V and t1.sigma == t2.sigma, "solve_table is the same with or without an at-bat history")

print()
if FAILS:
    print(f"{len(FAILS)} v1.0 check(s) FAILED: " + "; ".join(FAILS))
    sys.exit(1)
print("all v1.0 checks passed")
