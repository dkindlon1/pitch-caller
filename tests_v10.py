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

# ---------------------------------------------------------------------------
print("3.2 fallback when nothing is trusted")
low = {"Fastball": {"conf": 0.40}, "Curveball": {"conf": 0.42}}           # D3 cutoff 0.45: nothing trusted, CB the higher
a2 = ars("two_pitch", low)
lt = {"Curveball": (2, 12), "Fastball": (7, 12)}
fb_share, lines = [], set()
for (b, k) in e.COUNTS:
    sh, info, pick, tab, s_ = dist(a2, sit(b, k, landing_today=lt))
    fb_share.append(by_pitch(sh).get("Fastball", 0.0))
    lines.add(e.why_line(a2, s_, tab, pick, info)[0])
check(min(fb_share) == 1.0, "curveball 2 for 12, fastball 7 for 12, nothing trusted, curveball more trusted: fastball 100% (all 12 counts)",
      f"smallest fastball share {min(fb_share):.3f}")
check(lines == {"Nothing's working. Going with what's landing. Think about a change."}, "the why line says nothing is trusted",
      "; ".join(sorted(lines)))
a3 = ars("slider_best", {"Fastball": {"conf": 0.40}, "Slider": {"conf": 0.42}, "Changeup": {"conf": 0.35}})
lt3 = {"Fastball": (1, 12), "Slider": (2, 12), "Changeup": (3, 10)}       # none landing; changeup has the best estimate
est = {p.name: e.landing_estimate(p, sit(1, 1, landing_today=lt3))[0] for p in a3}
sh, *_ = dist(a3, sit(1, 1, landing_today=lt3))
check(by_pitch(sh).get("Changeup", 0.0) == 1.0, "every pitch not landing: the best shrunk strike estimate (changeup) 100%",
      f"estimates { {k: round(v, 3) for k, v in est.items()} }")
sh, *_ = dist(a3, sit(1, 1))
check(by_pitch(sh).get("Slider", 0.0) == 1.0, "nothing trusted, no landing record: the most trusted pitch (slider) 100%")
a_ok = ars("two_pitch")
check("fallback" not in e.call_rules(a_ok, sit(1, 1, landing_today=lt))[1], "no fallback note when a pitch is trusted")

# ---------------------------------------------------------------------------
print("3.3 landing filter with a runner on 3rd")
a = ars("slider_best")
R3 = (False, False, True)
sh3, info3, pick3, tab3, s3 = dist(a, sit(0, 2, bases=R3, landing_today={"Slider": (0, 4)}))
sh0, *_ = dist(a, sit(0, 2, bases=E3, landing_today={"Slider": (0, 4)}))
check(by_pitch(sh3).get("Slider", 0.0) == 0.0, "0-2, runner on 3rd, slider 0 for 4: slider 0%", f"{by_pitch(sh3)}")
check(("Slider", "chase") in e.allowed_calls(a, sit(0, 2, bases=E3, landing_today={"Slider": (0, 4)})),
      "the same with 3rd empty may still chase (slider chase stays allowed)", f"slider share with 3rd empty {by_pitch(sh0).get('Slider', 0):.1%}")
check(e.why_line(a, s3, tab3, pick3, info3)[0] == "Runner on 3rd: no dirt ball with a pitch that isn't landing.",
      "landing-filter why line", e.why_line(a, s3, tab3, pick3, info3)[0])
worst = 0.0
for lv in ("hs", "college_d3", "college_d1"):
    for bo in (R3, (True, False, True), (True, True, True), (False, True, True)):
        for (b, k) in ((0, 2), (1, 2)):
            for lt in ((0, 4), (2, 12)):
                sh, *_ = dist(a, sit(b, k, level=lv, bases=bo, landing_today={"Slider": lt}))
                worst = max(worst, by_pitch(sh).get("Slider", 0.0))
check(worst == 0.0, "every runner-on-3rd state, 0-2 and 1-2, three levels, 0/4 and 2/12: the slider gets 0%", f"largest {worst:.4f}")

# ---------------------------------------------------------------------------
print("3.4 rebuild the plan when runners or outs change")
a = ars("slider_best")
s0 = sit(0, 0, bases=(True, False, False), outs=1)
fz = e.frozen_inputs(a, s0)
check(not e.needs_resolve(fz, a, replace(s0, balls=1, strikes=1)), "same runners and outs, new count: no re-solve")
check(e.needs_resolve(fz, a, replace(s0, balls=1, strikes=1, bases=(False, True, False))), "stolen base mid at-bat: re-solve")
check(e.needs_resolve(fz, a, replace(s0, balls=1, strikes=1, bases=(False, False, False), outs=2)), "caught stealing (runner gone, out added): re-solve")
check(e.needs_resolve(fz, a, replace(s0, outs=2)), "outs change alone: re-solve")

# ---------------------------------------------------------------------------
print("3.5 coach rules")
sys.path.insert(0, os.path.join(HERE, "readthrough"))
import scenarios_v10 as S10
doc10, _ = S10.load()
rows = {r["id"]: r for r in doc10["rows"]}
for rid, what in (("I4", "FB middle"), ("H1", "middle (every pitch)")):
    a_, s_, ex_ = S10.build(doc10, rows[rid])
    s_ = replace(s_, win=e.win_constants(s_)) if s_.home is not None else s_
    tab_ = e.solve_table(a_, replace(s_, balls=0, strikes=0, last=None, history=()))
    sh, info, pick, tab_, sx = dist(a_, s_, tab=tab_)
    v = sh.get(("Fastball", "middle"), 0.0) if rid == "I4" else sum(x for (n, q), x in sh.items() if q == "middle")
    check(v == 0.0, f"{rid}: {what} 0%", f"{v:.4f}; why: {e.why_line(a_, sx, tab_, pick, info)[0]}")
a = ars("slider_best")
mm = {"hard|FB|middle": 2}
worst = 0.0
for (b, k) in e.COUNTS:
    sh, *_ = dist(a, sit(b, k, matchup=mm))
    worst = max(worst, sh.get(("Fastball", "middle"), 0.0))
check(worst == 0.0, "CR1: hit hard twice at FB middle -> FB middle 0% in all 12 counts", f"largest {worst:.4f}")
check(("Fastball", "middle") in e.allowed_calls(a, sit(1, 1, matchup={"hard|FB|middle": 1})), "CR1: once is not enough")
worst = 0.0
for g in (4, 5):
    for (b, k) in e.COUNTS:
        sh, *_ = dist(a, sit(b, k, grades={"w": g}))
        worst = max(worst, sum(x for (n, q), x in sh.items() if q == "middle"))
check(worst == 0.0, "CR2: power 4 and 5 -> no middle for any pitch in any count", f"largest {worst:.4f}")
check(any(q == "middle" for _, q in e.allowed_calls(a, sit(3, 0, grades={"w": 3}))), "CR2: power 3 keeps the middle")
sh, info, pick, tab, s_ = dist(a, sit(1, 1, grades={"w": 5}))
check(e.why_line(a, s_, tab, pick, info)[0] == "Power hitter: stay off the middle.", "CR2 why line", e.why_line(a, s_, tab, pick, info)[0])
sh, info, pick, tab, s_ = dist(a, sit(1, 1, matchup=mm))
check(e.why_line(a, s_, tab, pick, info)[0] == "He's hit this hard twice today.", "CR1 why line", e.why_line(a, s_, tab, pick, info)[0])
# stand-downs: fallback mode, and nothing left
low = ars("slider_best", {n: {"conf": 0.30} for n in ("Fastball", "Slider", "Changeup")})
calls, notes = e.call_rules(low, sit(1, 1, grades={"w": 5}))
sh, info, pick, tab, s_ = dist(low, sit(1, 1, grades={"w": 5}))
check(any(q == "middle" for _, q in calls) and notes.get("CR2_stood_down") == "fallback" and
      e.why_line(low, s_, tab, pick, info)[0].endswith("Power-hitter rule standing down."),
      "CR2 stands down in fallback mode and the why line says so", e.why_line(low, s_, tab, pick, info)[0])
calls, notes = e.call_rules(low, sit(1, 1, matchup=mm))
check(notes.get("CR1_stood_down") == "fallback" and e.rule_line(notes).endswith("Hit-hard-twice rule standing down."),
      "CR1 stands down in fallback mode and says so", e.rule_line(notes))
ex = {(n, q) for n in ("Fastball", "Slider", "Changeup") for q in e.QUADS if q != "middle"}
calls, notes = e.call_rules(a, sit(1, 1, grades={"w": 5}), exclude=ex)
check(calls and all(q == "middle" for _, q in calls) and notes.get("CR2_stood_down") == "nothing",
      "CR2 stands down when it would leave nothing", f"{calls} {notes}")
check(e.rule_line(notes) == "Power hitter: stay off the middle. Standing down: nothing else left to call.", "stand-down why line",
      e.rule_line(notes))

# ---------------------------------------------------------------------------
print("3.6 location guard and pitch-type guard")
n_ctx, n_sup, n_more = 0, 0, 0
saved = e.GUARD_TYPE
try:
    for lv in ("hs", "college_d3", "college_d1"):
        for an in ("slider_best", "avg_changeup", "plus_changeup", "four_pitch"):
            a = ars(an)
            for bo, outs in ((E3, 1), ((True, False, False), 0)):
                for same in (True, False):
                    s0 = sit(0, 0, level=lv, bases=bo, outs=outs, same_side=same)
                    tab = table(a, s0)
                    for (b, k) in e.COUNTS:
                        s_ = replace(s0, balls=b, strikes=k, look=tab.h0)
                        calls = e.allowed_calls(a, s_)
                        _, cmy = e.root_myopic(a, s_, tab, calls, tab.h0, e.sit_options(a))
                        best = min(cmy.values())
                        old = {x for x in calls if cmy[x] - best <= e.GUARD_DELTA * e.run_scale(lv)}
                        e.GUARD_TYPE = e.GUARD_DELTA
                        new = set(e.guard_keep(calls, cmy, s_))
                        e.GUARD_TYPE = saved
                        n_ctx += 1
                        n_sup += old <= new
                        n_more += len(new - old) > 0
finally:
    e.GUARD_TYPE = saved
check(n_sup == n_ctx, "at GUARD_TYPE = GUARD_DELTA every call v0.9's guard keeps is still kept (Drew: the plan's subset flipped)",
      f"{n_sup}/{n_ctx} situations; the split keeps more in {n_more}")
ok_all, notes_ = True, []
for lv in ("hs", "college_d3", "college_d1"):
    a = ars("avg_changeup")
    pi, sg, full, res, M = e.root_call(a, replace(sit(2, 0, level=lv, same_side=False), look=table(a, sit(0, 0, level=lv, same_side=False)).h0),
                                       table(a, sit(0, 0, level=lv, same_side=False)))
    kept = any(x[0] == "Changeup" for x in M)
    ok_all &= kept
    notes_.append(f"{lv} {'kept' if kept else 'dropped'}")
check(ok_all, f"default GUARD_TYPE {e.GUARD_TYPE}: an average changeup to an opposite-side hitter at 2-0 survives the guard",
      ", ".join(notes_))
a = ars("slider_best")
tab = table(a, sit(0, 0))
s31 = replace(sit(3, 1), look=tab.h0)
pi, sg, full, res, M = e.root_call(a, s31, tab)
Mmy, _ = e.root_myopic(a, s31, tab, e.allowed_calls(a, s31), tab.h0, e.sit_options(a))
check(all(M[x] == Mmy[x] for x in M), "three-ball counts still rank by myopic cost")

# ---------------------------------------------------------------------------
print("3.7 mixing operator weighted by real usage")


def pfc_v09(costs, s, temp):
    """v0.9's policy_from_costs (reference for the flat-usage test)."""
    win, lwin = e.windows(s)
    names = []
    for (n, q) in costs:
        if n not in names:
            names.append(n)
    best_by = {n: min(c for (m, q), c in costs.items() if m == n) for n in names}
    overall = min(best_by.values())
    pp = e._soft(best_by, temp, win, overall)
    pi = {}
    for n, pn in pp.items():
        lw = max(e.TAPER * lwin, lwin - (best_by[n] - overall))
        loc = e._soft({q: c for (m, q), c in costs.items() if m == n}, temp, lw, best_by[n])
        for q, pq in loc.items():
            pi[(n, q)] = pn * pq
    return pi


sys.path.insert(0, HERE)
import callsheet as CS
ci_main = [j for j in CS.jobs_for("ci") if j["group"] == "main"]
kt, kl = e.KAPPA_T, e.KAPPA_L
loc_err, order_bad, order_n, sum_err, outside, beyond, n_sit = 0.0, 0, 0, 0.0, 0, 0, 0
res_max = 0.0
for j in ci_main:
    a = CS.arsenal(j["arsenal"])
    s0 = CS.base_situation(j["level"], j["bo"], j["same"], j["state"], {})
    tab = e.solve_table(a, replace(s0, balls=0, strikes=0, last=None))
    res_max = max(res_max, max(tab.residuals))
    for (b, k) in e.COUNTS:
        s_ = replace(s0, balls=b, strikes=k, look=tab.h0)
        temp = e.temperature(a, s_)
        cs = e.root_costs(a, s_, tab)
        # flat usage, kappa 1: within-pitch target mix = v0.9's; pitch order = v0.9's best-cost order past T
        e.KAPPA_T, e.KAPPA_L = 1.0, 1.0
        new = e.policy_from_costs(cs, s_, temp, None)
        e.KAPPA_T, e.KAPPA_L = kt, kl
        old = pfc_v09(cs, s_, temp)
        for n in {x[0] for x in old} & {x[0] for x in new}:
            tn, to = sum(v for x, v in new.items() if x[0] == n), sum(v for x, v in old.items() if x[0] == n)
            for x in set(k_ for k_ in list(new) + list(old) if k_[0] == n):
                loc_err = max(loc_err, abs(new.get(x, 0.0) / tn - old.get(x, 0.0) / to))
        best = {}
        for (n, q), c in cs.items():
            best[n] = min(best.get(n, c), c)
        pn = {}
        for (n, q), v in new.items():
            pn[n] = pn.get(n, 0.0) + v
        for x in best:
            for y in best:
                if best[x] < best[y] - temp:
                    order_n += 1
                    order_bad += not (pn.get(x, 0.0) > pn.get(y, 0.0))
        # real operator at the root: sums to 1, only kept calls, nothing past a location window
        sx = replace(s_, b_h=e.lean_b_h(a, s_))
        pi, sg, full, res, M = e.root_call(a, sx, tab)
        res_max = max(res_max, res)
        n_sit += 1
        sum_err = max(sum_err, abs(sum(pi.values()) - 1.0))
        outside += any(x not in M for x in pi)
        win, lwin = e.windows(sx)
        cfull = {x: sum(sg[kk] * M[x][kk] for kk in M[x]) for x in M}
        bb = {}
        for (n, q), c in cfull.items():
            bb[n] = min(bb.get(n, c), c)
        ov = min(bb.values())
        for (n, q), v in pi.items():
            lw = max(e.TAPER * lwin, lwin - (bb[n] - ov))
            beyond += v > 0 and cfull[(n, q)] - bb[n] >= lw
check(loc_err < 1e-12, f"flat usage, kappa 1: the target mix within each pitch equals v0.9's ({n_sit} situations)", f"largest gap {loc_err:.1e}")
check(order_bad == 0, "flat usage, kappa 1: pitch-type order follows v0.9's best costs wherever they differ by more than T",
      f"{order_bad} of {order_n} pairs out of order")
check(sum_err < 1e-12 and outside == 0 and beyond == 0, "shares sum to 1; nothing outside the guards or past a location window is picked",
      f"sum error {sum_err:.1e}, outside {outside}, past window {beyond}")
check(res_max < e.QRE_TOL, f"the sit game converges on the whole CI grid (tables and root, {len(ci_main)} plate appearances)",
      f"largest residual {res_max:.2e} (QRE_TOL {e.QRE_TOL})")
mw = e.mix_weights(ars("slider_best"), sit(1, 1, same_side=False))
check(mw is not None and 0.95 < sum(mw[0].values()) <= 1.0 + 1e-9 and min(mw[0].values()) > 0,
      "mix_prior.json loads; u_T for a three-pitch arsenal is positive and sums to just under 1 (kinds under 5% take the rest)",
      f"{ {k: round(v, 3) for k, v in mw[0].items()} } sum {sum(mw[0].values()):.3f}")
two_sl = [e.Pitch("FB", "FB", 3, 3, 0.8), e.Pitch("SL1", "SL", 3, 3, 0.8), e.Pitch("SL2", "SL", 3, 3, 0.8), e.Pitch("CH", "CH", 3, 3, 0.8)]
mw2 = e.mix_weights(two_sl, sit(1, 1))
check(abs(mw2[0]["SL1"] - mw2[0]["SL2"]) < 1e-15 and abs(mw2[0]["SL1"] * 2 - e.MIX_PRIOR["u_T"]["FB+SL+CH"]["1-1"]["same"]["SL"]) < 1e-12,
      "two pitches of one kind split that kind's usage evenly")

# ---------------------------------------------------------------------------
print("3.8 the at-bat plan")
import random
flow_err, end_err, mc_err, lines = 0.0, 0.0, 0.0, []
EV = ("ball", "wp_ball", "hbp", "cstrike", "whiff", "foul", "weak", "solid", "hard")
for lv, an, bo, same in (("college_d3", "plus_changeup", E3, False), ("hs", "two_pitch", (True, False, False), True),
                         ("college_d1", "four_pitch", (False, False, True), True)):
    a = ars(an)
    tab = e.solve_table(a, sit(0, 0, level=lv, bases=bo, outs=1, same_side=same))
    plan = e.at_bat_plan(tab)
    lines.append(plan["line"])
    end_err = max(end_err, abs(sum(plan["ends"].values()) - 1.0))
    # in = out: each count's reach equals what flows into it; visits x (1 - stay) = reach
    inflow = {c: 0.0 for c in e.COUNTS}
    inflow[(0, 0)] = 1.0
    for (b, k) in e.COUNTS:
        P = {x: sum(pv * tab.plan_P[(b, k)][c_][x] for c_, pv in tab.plan_pol[(b, k)].items()) for x in EV}
        v = plan["visits"][(b, k)]
        if b < 3:
            inflow[(b + 1, k)] += v * (P["ball"] + P["wp_ball"])
        if k < 2:
            inflow[(b, k + 1)] += v * (P["cstrike"] + P["whiff"] + P["foul"])
        stay = P["foul"] if k == 2 else 0.0
        flow_err = max(flow_err, abs(v * (1 - stay) - plan["reach"][(b, k)]))
    flow_err = max(flow_err, max(abs(inflow[c] - plan["reach"][c]) for c in e.COUNTS))
    # Monte Carlo: 20,000 plate appearances drawn from the same policies
    rng = random.Random(38)
    hit = {c: 0 for c in e.COUNTS}
    N = 20000
    for _ in range(N):
        b, k, seen = 0, 0, set()
        while True:
            if (b, k) not in seen:
                hit[(b, k)] += 1
                seen.add((b, k))
            pol = tab.plan_pol[(b, k)]
            r, acc, call = rng.random(), 0.0, None
            for c_, pv in pol.items():
                acc += pv
                if r <= acc:
                    call = c_
                    break
            call = call or list(pol)[-1]
            P = tab.plan_P[(b, k)][call]
            r, acc, ev = rng.random() * sum(P[x] for x in EV), 0.0, EV[-1]
            for x in EV:
                acc += P[x]
                if r <= acc:
                    ev = x
                    break
            if ev in ("ball", "wp_ball"):
                if b == 3:
                    break
                b += 1
            elif ev in ("cstrike", "whiff"):
                if k == 2:
                    break
                k += 1
            elif ev == "foul":
                k = min(k + 1, 2)
            else:
                break
    mc_err = max(mc_err, max(abs(hit[c] / N - plan["reach"][c]) for c in e.COUNTS))
check(end_err < 1e-12, "the plate-appearance end chances sum to 1", f"largest error {end_err:.1e}")
check(flow_err < 1e-12, "the reach chances are consistent (each count's in = out)", f"largest error {flow_err:.1e}")
check(mc_err < 0.01, "they match a 20,000 plate-appearance Monte Carlo within 0.01", f"largest gap {mc_err:.4f}")
check(all(l.startswith("Plan: ") and ", put away with the " in l for l in lines), "the plan line", " | ".join(lines))

print()
if FAILS:
    print(f"{len(FAILS)} v1.0 check(s) FAILED: " + "; ".join(FAILS))
    sys.exit(1)
print("all v1.0 checks passed")
