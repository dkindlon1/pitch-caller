"""Step 8 X check in one world: exploitability of v0.7c's call mix and of v0.8's call mix, both priced by the v0.8
model at the root (pure-sit costs C(a|k) at the PA's starting look, the hitter's soft best response to each mix).
usage: python3 x_same_world.py -> results/v08_step8_X_same_world.txt"""
from collections import defaultdict
import engine as e
from metrics import ref_arsenals, LEVELS

rows = []
for lvl in LEVELS:
    for an, ars in ref_arsenals().items():
        s0 = e.Situation(0, 0, 0, (False, False, False), level=lvl)
        e.set_flags(**e.FLAGS_V08)
        tab = e.solve_table(ars, s0)
        for (b, k) in sorted(e.COUNTS):
            s = e.Situation(b, k, 0, (False, False, False), level=lvl)
            e.set_flags(**e.FLAGS_V07)
            _, dist = e.call_mixed(ars, s)
            pi7 = defaultdict(float)
            for pr, _, p, q in dist:
                pi7[(p.name, q)] += pr
            e.set_flags(**e.FLAGS_V08)
            pi8, sg8, full, res, M8 = e.root_call(ars, s, tab)
            ks = e.sit_options(ars)
            by = {x.name: x for x in ars}
            calls = sorted(set(pi7) | set(M8))
            M = {a: {kk: e.cost08(by[a[0]], a[1], s, ars, tab, tab.h0, ("pure",) + kk)[0] for kk in ks} for a in calls}
            T = e.temperature(ars, s)
            X, C = {}, {}
            for name, pi in (("v07", pi7), ("v08", pi8)):
                sg = e.sit_response(M, ks, pi, T)
                X[name] = e.exploitability(M, ks, pi, sg)
                pay = e.sit_payoff(M, ks, pi)
                C[name] = (sum(sg[kk] * pay[kk] for kk in ks), max(pay.values()))   # vs his soft response; vs his best guess
            rows.append((lvl, an, f"{b}-{k}", X["v07"], X["v08"], C["v07"], C["v08"]))
worse = [r for r in rows if r[4] - r[3] > 0.002]
lines = [f"{len(rows)} cells; v0.8 mix more exploitable than v0.7c's mix by > 0.002 runs (same v0.8 world): {len(worse)}",
         f"mean X v0.7c mix {sum(r[3] for r in rows) / len(rows):.4f}, v0.8 mix {sum(r[4] for r in rows) / len(rows):.4f}; "
         f"max difference {max(r[4] - r[3] for r in rows):+.4f}"]
lines.append("Total runs per pitch against the hitter (v0.8 minus v0.7c mix; negative = v0.8 better): against his soft response "
             f"mean {sum(r[6][0] - r[5][0] for r in rows) / len(rows):+.4f}, max {max(r[6][0] - r[5][0] for r in rows):+.4f}; "
             f"against his single best guess mean {sum(r[6][1] - r[5][1] for r in rows) / len(rows):+.4f}, "
             f"max {max(r[6][1] - r[5][1] for r in rows):+.4f}; cells where v0.8 is worse against his best guess: "
             f"{sum(1 for r in rows if r[6][1] - r[5][1] > 0)}")
lines += [f"  {l} {a} {c}: X v0.7c {x7:.4f} v0.8 {x8:.4f} ({x8 - x7:+.4f}); runs vs best guess v0.7c {c7[1]:.4f} v0.8 {c8[1]:.4f} "
          f"({c8[1] - c7[1]:+.4f})" for l, a, c, x7, x8, c7, c8 in rows if x8 - x7 > 0.002]
open("results/v08_step8_X_same_world.txt", "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
