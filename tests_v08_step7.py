"""v0.8 step 7 checks (spec 11): WE tables (we_tables.py output), m0 > 0, objective blend reduces to v0.7c at omega 0,
running game cost sign, walk suggestion. usage: python3 tests_v08_step7.py"""
from dataclasses import replace
import engine as e
from metrics import ref_arsenals

ok_all = []


def check(name, ok, detail=""):
    ok_all.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f": {detail}" if detail else ""), flush=True)


for line in open("results/v08_step7_we_checks.txt"):
    check("WE table " + line.split(":")[0], line.count("FAIL") == 0, line.strip().split(": ", 1)[1][:120])

# m0 > 0 in every state (raw differences before the floor, reported)
raw_bad, n = 0, 0
for lvl in ("hs", "college_d3", "college_d1", "mlb"):
    for home in (True, False):
        for inn in range(1, 11):
            for o in range(3):
                for b in range(8):
                    for m in range(-6, 7):
                        s = e.Situation(0, 0, o, (bool(b & 1), bool(b & 2), bool(b & 4)), inning=inn, margin=m, level=lvl, home=home)
                        w = e.win_constants(s)
                        n += 1
                        raw_bad += (w["WE0"] - e.we_pitch(s, o, s.bases, m - 1)) <= 0
                        assert w["m0"] > 0
check("m0 > 0 in every state (after the 0.005 floor)", True, f"{n} states; raw difference <= 0 in {raw_bad} (floored)")

# omega = 0 -> v_end equals r + RE exactly
e.set_flags(**e.FLAGS_V08)
s = e.Situation(1, 1, 0, (False, False, False), inning=2, margin=6, level="college_d3", home=True)
w = e.win_constants(s)
s_w = replace(s, win=w)
same = all(abs(e.v_end(s_w, o, B, r) - (r + e.re(o, B, s.level))) < 1e-12 for o in range(4)
           for B in [(False, False, False), (True, False, True)] for r in range(3))
check("objective blend: omega 0 gives v0.7c's end value exactly", w["omega"] == 0 and same, f"LI {w['LI']:.3f}")

# big spot: blend on, a strikeout is worth more than in a blowout relative to a ball in play
ars = ref_arsenals()["three"]
s9 = e.Situation(0, 2, 1, (False, False, True), inning=9, margin=1, level="college_d3", home=True)
s9w = replace(s9, win=e.win_constants(s9))
tab_off = e.solve_table(ars, s9)
tab_on = e.solve_table(ars, s9w)
kshare = lambda pi: sum(v for (n_, q), v in pi.items() if q in ("chase", "down-away"))
p_off = e.root_call(ars, s9, tab_off)[0]
p_on = e.root_call(ars, s9w, tab_on)[0]
check("objective blend: tying run on 3rd, 1 out, 9th: omega 1", s9w.win["omega"] == 1.0, f"LI {s9w.win['LI']:.2f}")
print(f"       0-2 call mix, chase+down-away share: runs objective {kshare(p_off):.3f}, win objective {kshare(p_on):.3f}")

# running game: a threat on 1st makes a fastball up cheaper relative to a curveball down
s_r = e.Situation(1, 1, 0, (True, False, False), level="college_d3")
tab_r = e.solve_table(ars, s_r)
by = {x.name: x for x in ars}
c0 = {a: e.cost08(by[a[0]], a[1], s_r, ars, tab_r, tab_r.h0, ("mix", tab_r.sigma[(1, 1)]))[0] for a in [("Fastball", "up-away"), ("Changeup", "down-away")]}
s_t = replace(s_r, steal={"a": 0.10, "runner": 1, "t": None})
c1 = {a: e.cost08(by[a[0]], a[1], s_t, ars, tab_r, tab_r.h0, ("mix", tab_r.sigma[(1, 1)]))[0] for a in c0}
d_up = c1[("Fastball", "up-away")] - c0[("Fastball", "up-away")]
d_dn = c1[("Changeup", "down-away")] - c0[("Changeup", "down-away")]
check("running game: a high threat makes a low changeup worse relative to a high fastball", d_dn > d_up,
      f"added cost fastball up {d_up:+.4f}, changeup down {d_dn:+.4f} (both negative at D3: with RE(0,2nd) - RE(0,1st) = "
      f"{e.re(0, (False, True, False), 'college_d3') - e.re(0, (True, False, False), 'college_d3'):.3f} an attempt pays only above "
      f"{(e.re(0, (True, False, False), 'college_d3') - e.re(1, (False, False, False), 'college_d3')) / (e.re(0, (False, True, False), 'college_d3') - e.re(1, (False, False, False), 'college_d3')):.2f} success)")

# walk suggestion: first base open, runner on 2nd and 3rd, 9th, up 1, 2 outs: computed and reported
s_w2 = e.Situation(0, 0, 2, (False, True, True), inning=9, margin=1, level="college_d3", home=True)
s_w2 = replace(s_w2, win=e.win_constants(s_w2))
tab_w = e.solve_table(ars, s_w2)
sug, vw, vp = e.walk_suggestion(ars, s_w2, tab_w)
print(f"       walk suggestion (9th, up 1, 2 outs, 2nd and 3rd): suggested {sug}; V_end(walk) {vw:.4f} vs V(0-0) {vp:.4f}")
s_w3 = e.Situation(0, 0, 0, (False, False, False), inning=3, margin=0, level="college_d3", home=True)
tab_w3 = e.solve_table(ars, s_w3)
check("walk suggestion: never with the bases empty, 0 outs, early", not e.walk_suggestion(ars, s_w3, tab_w3)[0])
print(f"{sum(ok_all)}/{len(ok_all)} step 7 checks passed")
