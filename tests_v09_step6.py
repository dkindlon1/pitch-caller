"""v0.9 Step 6 checks: item 6, the matchup-memory term (matchup_memory). usage (repo root): python3 tests_v09_step6.py
Goldens cover flags off; Python/JS parity (PARITY_FLAGS=v09) covers the JS twin. These cover what the term does."""
from dataclasses import replace
import engine as e
import simulate

fails = 0


def check(ok, msg):
    global fails
    print(("  ok   " if ok else "  FAIL ") + msg)
    fails += not ok


simulate.STAFF = "default"
ARS = simulate.our_staff()[0]["arsenal"]
FB = next(x for x in ARS if x.kind == "FB"); CH = next(x for x in ARS if x.kind == "CH")


def sit(mm=None, level="college_d3", b=1, k=1):
    return e.Situation(b, k, 0, (False, False, False), inning=5, margin=0, pitch_count=50, batters_faced=10, level=level,
                       same_side=False, matchup=mm or {})


print("1. The term")
cases = [({"succ|CH": 2}, CH, "down-away", 0.214), ({"succ|CH": 9}, CH, "middle", 0.428), ({"hard|FB|middle": 1}, FB, "middle", -0.346),
         ({"hard|FB|middle": 1}, FB, "up-in", 0.0), ({"hard|FB|middle": 2}, FB, "middle", -0.5), ({"succ|CH": 2}, FB, "middle", 0.0),
         ({"succ|FB": 3, "hard|FB|up-away": 1}, FB, "up-away", 0.321 - 0.346), ({"succ|CH": 6, "hard|CH|chase": 1}, CH, "chase", 0.428 - 0.346)]
for mm, p, q, want in cases:
    got = e.matchup_whiff(p, q, sit(mm))
    check(abs(got - want) < 1e-12, f"{mm} on {p.kind} {q}: {got:+.3f} (want {want:+.3f})")
for lv, scale in (("hs", 0.6), ("travel", 0.6), ("college_d1", 1.0), ("mlb", 1.0)):
    got = e.matchup_whiff(CH, "down-away", sit({"succ|CH": 2}, level=lv))
    check(abs(got - 0.214 * scale) < 1e-12, f"{lv}: two earlier CH whiffs {got:+.4f} (x{scale})")

print("2. Through the outcome model")
with e.flags(**e.FLAGS_V08):
    P8 = e.outcome_probs(CH, "down-away", sit({"succ|CH": 2}), ARS)
    P0 = e.outcome_probs(CH, "down-away", sit(), ARS)
    check(P8 == P0, "flag off: a matchup record changes nothing")
with e.flags(**e.FLAGS_V09):
    P0 = e.outcome_probs(CH, "down-away", sit(), ARS)
    P1 = e.outcome_probs(CH, "down-away", sit({"succ|CH": 2}), ARS)
    P2 = e.outcome_probs(FB, "middle", sit({"hard|FB|middle": 1}), ARS)
    P2b = e.outcome_probs(FB, "middle", sit(), ARS)
    check(P1["whiff"] > P0["whiff"], f"two earlier CH whiffs: CH down-away whiff {P0['whiff']:.4f} -> {P1['whiff']:.4f}")
    check(P2["whiff"] < P2b["whiff"], f"FB middle hit hard earlier: FB middle whiff {P2b['whiff']:.4f} -> {P2['whiff']:.4f}")
    check(abs(sum(P1.values()) - 1) < 1e-12 and abs(sum(P2.values()) - 1) < 1e-12, "probabilities still sum to 1")

print("3. Through a full call (I2: 1-2, CH down-away got two whiffs last trip)")
s = sit({"succ|CH": 2}, b=1, k=2)
with e.flags(**e.FLAGS_V09):
    _, d1, _, _ = e.call_v08(ARS, s)
    _, d0, _, _ = e.call_v08(ARS, replace(s, matchup={}))
ch1 = sum(x[0] for x in d1 if x[2].kind == "CH"); ch0 = sum(x[0] for x in d0 if x[2].kind == "CH")
check(ch1 >= ch0, f"changeup share at 1-2 {ch0:.0%} -> {ch1:.0%} with the earlier whiffs")

print("all step 6 checks passed" if not fails else f"{fails} FAILED")
raise SystemExit(1 if fails else 0)
