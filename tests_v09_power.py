"""v0.9 item 8 checks: power_avoid, more of a power hitter's hard contact leaves the park. usage: python3 tests_v09_power.py"""
import engine as e
import simulate

fails = 0


def check(ok, msg):
    global fails
    print(("  ok   " if ok else "  FAIL ") + msg)
    fails += not ok


simulate.STAFF = "default"
ARS = simulate.our_staff()[0]["arsenal"]
FB = ARS[0]


def sit(gr=None, level="college_d3", bases=(False, False, False)):
    return e.Situation(2, 0, 1, bases, inning=4, level=level, same_side=False, grades=gr)


check(abs(e.POWER_HR - 0.112 * 0.03 / 0.053) < 1e-15, f"per grade point {e.POWER_HR:.4f} logits")
check(e.power_hr_shift(sit(), {"w": 3}) == 0 and e.power_hr_shift(sit(), {}) == 0, "grade 3 or no power grade: no shift")
check(abs(e.power_hr_shift(sit(level="hs"), {"w": 5}) - 0.6 * 2 * e.POWER_HR) < 1e-15, "high school x0.6")
with e.flags(**e.FLAGS_V08):
    v8 = {w: e.in_play_value_typed("hard", FB, "middle", sit({"w": w})) for w in (1, 3, 5)}
with e.flags(**dict(e.FLAGS_V08, power_avoid=True)):
    v9 = {w: e.in_play_value_typed("hard", FB, "middle", sit({"w": w})) for w in (1, 3, 5)}
    sw = e.in_play_value_typed("solid", FB, "middle", sit({"w": 5})), e.in_play_value_typed("weak", FB, "middle", sit({"w": 5}))
with e.flags(**e.FLAGS_V08):
    s8 = e.in_play_value_typed("solid", FB, "middle", sit({"w": 5})), e.in_play_value_typed("weak", FB, "middle", sit({"w": 5}))
check(v8[1] == v8[3] == v8[5], "flag off: hard-contact value doesn't depend on power (v0.8)")
check(v9[3] == v8[3], "flag on, grade 3: unchanged")
check(v9[5] > v9[3] > v9[1], f"hard contact worth more to a power hitter: w1 {v9[1]:.4f}, w3 {v9[3]:.4f}, w5 {v9[5]:.4f} runs")
check(sw == s8, "weak and solid contact untouched")
# the cache keys on the power grade
with e.flags(**e.FLAGS_V09):
    s = e.Situation(0, 0, 0, (False, False, False), inning=4, level="college_d3", same_side=False)
    tab = e.solve_table(ARS, s)
    a = e._ipv_cached(tab, FB, "middle", sit({"w": 5}))
    b = e._ipv_cached(tab, FB, "middle", sit({"w": 3}))
check(a[2] > b[2], "cached in-play values are kept apart by power grade")
print("all power checks passed" if not fails else f"{fails} FAILED")
raise SystemExit(1 if fails else 0)
