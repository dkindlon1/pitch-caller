"""v0.9 Step 5 checks: item 3 widened, the fitted inside/away term (inside_v09). usage (repo root): python3 tests_v09_step5.py
Goldens cover flags off; Python/JS parity (PARITY_FLAGS=v09) covers the JS twin. These cover what the term does."""
import engine as e
import simulate

fails = 0


def check(ok, msg):
    global fails
    print(("  ok   " if ok else "  FAIL ") + msg)
    fails += not ok


simulate.STAFF = "default"
ARS = simulate.our_staff()[0]["arsenal"]
FB = next(x for x in ARS if x.kind == "FB"); SL = next(x for x in ARS if x.kind == "SL")


def sit(same=False, level="college_d3", b=1, k=1):
    return e.Situation(b, k, 0, (False, False, False), inning=4, level=level, same_side=same, batters_faced=4)


print("1. The term")
s = sit()
for what in ("swing", "whiff", "hard"):
    for p in (FB, SL):
        for h in ("up", "down"):
            for z in ("heart", "edge"):
                a, b = e.side_shift(p, h + "-in", s, z, what), e.side_shift(p, h + "-away", s, z, what)
                want = e.SIDE[what][("OS" if p.kind != "FB" else "FB") + "|" + h + "|opp"]
                check(abs(a + b) < 1e-15 and abs((a - b) - want) < 1e-12,
                      f"{what} {p.kind} {h} {z}: inside {a:+.4f}, away {b:+.4f} (difference {want:+.3f}, centered)") if z == "heart" else None
ok = all(e.side_shift(FB, q, s, z, w) == 0.0 for q in ("middle", "chase") for z in e.ZONES for w in ("swing", "whiff", "hard")) and \
    all(e.side_shift(FB, q, s, z, w) == 0.0 for q in ("up-in", "down-away") for z in ("off", "noncomp") for w in ("swing", "whiff", "hard"))
check(ok, "no shift for middle and chase targets, or off the plate (off, noncomp)")
check(e.side_shift(FB, "up-in", sit(same=True), "heart", "hard") == 0.5 * e.SIDE["hard"]["FB|up|same"], "same-side hitters use the same-side value")
check(abs(e.side_shift(FB, "up-in", sit(level="hs"), "heart", "hard") - 0.6 * e.side_shift(FB, "up-in", s, "heart", "hard")) < 1e-15,
      "high school: x0.6")
check(e.SIDE["hard"]["FB|down|same"] == 0.0 and e.SIDE["hard"]["FB|down|opp"] == 0.0, "the fastball-down hard effect did not ship and is 0")

print("2. Through the outcome model")
with e.flags(**e.FLAGS_V08):
    a8 = e.outcome_probs(FB, "up-in", s, ARS)
with e.flags(**dict(e.FLAGS_V08, inside_v09=False)):
    a8b = e.outcome_probs(FB, "up-in", s, ARS)
check(a8 == a8b, "flag off: unchanged")
with e.flags(**dict(e.FLAGS_V08, inside_v09=True)):
    i9, w9 = e.outcome_probs(FB, "up-in", s, ARS), e.outcome_probs(FB, "up-away", s, ARS)
    m9 = e.outcome_probs(FB, "middle", s, ARS)
with e.flags(**e.FLAGS_V08):
    i8, w8, m8 = e.outcome_probs(FB, "up-in", s, ARS), e.outcome_probs(FB, "up-away", s, ARS), e.outcome_probs(FB, "middle", s, ARS)
bip = lambda P: P["weak"] + P["solid"] + P["hard"]
check(i9["hard"] / bip(i9) < i8["hard"] / bip(i8) and w9["hard"] / bip(w9) > w8["hard"] / bip(w8),
      f"FB up: hard share inside {i8['hard'] / bip(i8):.3f} -> {i9['hard'] / bip(i9):.3f}, away {w8['hard'] / bip(w8):.3f} -> {w9['hard'] / bip(w9):.3f}")
check(m9 == m8, "FB middle untouched")
check(abs(sum(i9.values()) - 1) < 1e-12, "probabilities sum to 1")
print("all step 5 checks passed" if not fails else f"{fails} FAILED")
raise SystemExit(1 if fails else 0)
