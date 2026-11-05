"""v0.9 Step 4b checks: item 10 (guardrail_v09) and item 9 (landing_v09). usage (repo root): python3 tests_v09_step4b.py
The goldens (golden/golden_v08.py check, golden/golden.py check and their JS twins) cover "flags off changes nothing";
these cover what each flag does when it is on."""
from dataclasses import replace
import engine as e
import simulate

fails = 0


def check(ok, msg):
    global fails
    print(("  ok   " if ok else "  FAIL ") + msg)
    fails += not ok


simulate.STAFF = "default"
ARS = simulate.our_staff()[0]["arsenal"]                       # FB, SL, CH
simulate.STAFF = "two_pitch"
ARS2 = simulate.our_staff()[0]["arsenal"]
simulate.STAFF = "default"
names = [x.name for x in ARS]


def sit(b, k, land=None, level="college_d3"):
    return e.Situation(b, k, 0, (False, False, False), inning=4, margin=0, pitch_count=40, batters_faced=4, level=level,
                       same_side=False, landing_today=land or {})


print("1. Item 9: who counts as not landing")
ch = next(x for x in ARS if x.name == "Changeup")
for land, want in (((0, 4), True), ((1, 3), False), ((2, 8), True), ((3, 10), True), ((4, 10), False), ((6, 8), False)):
    est, _, n = e.landing_estimate(ch, sit(0, 0, {"Changeup": land}))
    check(e.not_landing(ch, sit(0, 0, {"Changeup": land})) == want, f"changeup {land[0]} of {land[1]}: estimate {est:.3f} -> not landing {want}")

print("2. Item 9: what is allowed")
with e.flags(**e.FLAGS_V09):
    for (b, k), want in (((0, 0), "gone"), ((3, 1), "gone"), ((3, 2), "gone"), ((1, 2), "chase only"), ((0, 2), "chase only"),
                         ((2, 2), "gone")):            # 2-2 has no chase target (zone_22), so the pitch goes
        calls = e.allowed_calls(ARS, sit(b, k, {"Changeup": (1, 6)}))
        chq = sorted(q for n, q in calls if n == "Changeup")
        got = "gone" if not chq else ("chase only" if chq == ["chase"] else str(chq))
        others = {n for n, q in calls if n != "Changeup"}
        check(got == want and others == {"Fastball", "Slider"}, f"{b}-{k}, changeup 1 of 6: changeup {got} (want {want}); others kept")
    # nothing landing: the filter would empty the list, so it stands down
    allbad = {n: (0, 6) for n in names}
    check(e.allowed_calls(ARS, sit(0, 0, allbad)) == e.allowed_calls(ARS, sit(0, 0)), "nothing landing at 0-0: all calls kept")
    check(e.allowed_calls(ARS, sit(1, 2, allbad)) == e.allowed_calls(ARS, sit(1, 2)), "nothing landing at 1-2: all calls kept")
    # two not landing, one landing: the landing pitch carries the zone
    c = e.allowed_calls(ARS, sit(1, 1, {"Slider": (1, 6), "Changeup": (0, 5)}))
    check({n for n, q in c} == {"Fastball"}, "1-1, slider and changeup not landing: fastball only")
    # an exclusion and the filter together
    c = e.allowed_calls(ARS, sit(1, 2, {"Changeup": (0, 5)}), exclude={("Changeup", "chase")})
    check(not any(n == "Changeup" for n, q in c), "1-2, changeup not landing and its chase shaken off: no changeup")
    # a pitch with little evidence is not blocked
    check(any(n == "Changeup" and q != "chase" for n, q in e.allowed_calls(ARS, sit(1, 2, {"Changeup": (0, 3)}))),
          "changeup 0 of 3 (too few to tell): still called in the zone")
with e.flags(**e.FLAGS_V08):
    check(any(n == "Changeup" and q == "middle" for n, q in e.allowed_calls(ARS, sit(3, 2, {"Changeup": (1, 6)}))),
          "flag off: v0.8 still allows the changeup")

print("3. Item 9 through a full call")
with e.flags(**e.FLAGS_V09):
    s = sit(1, 2, {"Curveball": (0, 4)}, level="hs")
    _, dist, _, _ = e.call_v08(ARS2, s, rng=simulate.Half() if hasattr(simulate, "Half") else None)
    cb = [(d[3], d[0]) for d in dist if d[2].name == "Curveball"]
    check(all(q == "chase" for q, p in cb), f"HS 1-2, curveball 0 of 4: curveball calls {cb or 'none'} are chases only")
    s = sit(3, 2, {"Changeup": (2, 8)})
    _, dist, _, _ = e.call_v08(ARS, s)
    check(not any(d[2].name == "Changeup" for d in dist), "3-2, changeup 2 of 8: no changeup in the call")

print("4. Item 10: the guardrail is off")
tabs = {}
n_more = 0
for b, k in ((0, 0), (1, 0), (0, 1), (1, 1), (2, 1), (1, 2)):
    s0 = replace(sit(0, 0), home=True, sched_innings=9)
    with e.flags(**e.FLAGS_V08):
        s0w = replace(s0, win=e.win_constants(s0))
        tab = e.solve_table(ARS, s0w)
        s = replace(s0w, balls=b, strikes=k, look=tab.h0)
        M8 = e.root_call(ARS, s, tab)[4]
    with e.flags(**dict(e.FLAGS_V08, guardrail_v09=True)):
        M9 = e.root_call(ARS, s, tab)[4]
        allc = e.allowed_calls(ARS, s)
    check(set(M9) == set(allc) and set(M8) <= set(M9), f"{b}-{k}: root considers all {len(allc)} calls (v0.8 kept {len(M8)})")
    n_more += len(M9) > len(M8)
check(n_more > 0, f"the guardrail was binding somewhere in these counts ({n_more} of 6)")
with e.flags(**e.FLAGS_V09):
    s = replace(sit(3, 1), home=True, sched_innings=9)
    s = replace(s, win=e.win_constants(s))
    tab = e.solve_table(ARS, replace(s, balls=0, strikes=0))
    s = replace(s, look=tab.h0)
    M = e.root_call(ARS, s, tab)[4]
    Mmy = {a: {kk: e.cost08(next(x for x in ARS if x.name == a[0]), a[1], s, ARS, tab, tab.h0, ("pure",) + kk, myopic=True)[0]
               for kk in e.sit_options(ARS)} for a in M}
    check(all(M[a] == Mmy[a] for a in M), "3-1: three-ball counts still rank by myopic cost (no setups)")

print("all step 4b checks passed" if not fails else f"{fails} FAILED")
raise SystemExit(1 if fails else 0)
