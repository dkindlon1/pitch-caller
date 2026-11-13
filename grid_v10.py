"""v1.0 predictability grid (docs/PLAN_v1.0_2026-11-09.md, Step 2): the live call (call_v08) in every count, at hs / D3 /
D1, for every arsenal (v1.1 Step 4 adds the plan's five test arsenals; the finesse fastball is a sinker), with bases empty /
runner on 1st / runner on 3rd. One at-bat table per (level, arsenal, bases),
solved at 0-0 the way the app and the simulator solve it, then the root call at each count.

  python3 grid_v10.py            -> prints the table (top call share and pitch-type shares per cell) and the checks
  import grid_v10; grid_v10.grid() -> {(level, arsenal, bases, count): cell}
"""
import random
import sys
from dataclasses import replace

import engine as e

P = lambda n, k, g, c, cf, sh, v: e.Pitch(n, k, grade=g, command=c, conf=cf, shape=sh, velo=v)
S = lambda p, slot: (setattr(p, "slot", slot), p)[1]
# AVG3 is tests.py's average three-pitch starter; the rest are simulate.py's starter presets
ARSENALS = {
    "AVG3": [P("Fastball", "FB", 3, 3, .80, "ride", 86), P("Slider", "SL", 3, 3, .75, "tight", 78),
             P("Changeup", "CH", 3, 3, .65, "fade", 78)],
    "two_pitch": [P("Fastball", "FB", 3, 3, .75, "", 80), P("Curveball", "CB", 3, 2, .60, "loopy", 66)],
    "four_pitch": [P("Fastball", "FB", 3, 4, .80, "ride", 86), P("Slider", "SL", 4, 3, .70, "tight", 79),
                   P("Curveball", "CB", 3, 3, .65, "loopy", 73), P("Changeup", "CH", 3, 3, .60, "fade", 78)],
    "power": [P("Fastball", "FB", 5, 2, .80, "ride", 93), P("Slider", "SL", 4, 2, .70, "sweeper", 82),
              P("Changeup", "CH", 2, 2, .50, "fade", 84)],
    "finesse": [P("Fastball", "SI", 2, 5, .80, "run", 82), P("Curveball", "CB", 3, 4, .75, "loopy", 70),     # v1.1 Step 4: SI/run
                P("Changeup", "CH", 4, 5, .80, "fade", 74)],
    # v1.1 Step 4: the plan's test arsenals (six kinds, profiles, slots)
    "ride126": [S(P("Fastball", "FB", 3, 3, .80, "rides", 89), "over the top"), S(P("Curve", "CB", 3, 3, .70, "12-6", 75), "over the top"),
                S(P("Splitter", "CH", 3, 3, .65, "split", 81), "over the top")],
    "sink_sweep": [S(P("Sinker", "SI", 3, 3, .80, "run", 88), "low three-quarter"), S(P("Sweeper", "SL", 3, 3, .70, "sweeper", 77), "low three-quarter"),
                   S(P("Changeup", "CH", 3, 3, .65, "fade", 80), "low three-quarter")],
    "cut4": [P("Fastball", "FB", 3, 3, .80, "", 89), P("Cutter", "FC", 3, 3, .72, "hard", 86), P("Slider", "SL", 3, 3, .70, "gyro", 81),
             P("Curve", "CB", 3, 3, .65, "", 75)],
    "deadzone": [P("Fastball", "FB", 3, 3, .80, "straight", 87), P("Sinker", "SI", 3, 3, .75, "run", 86), P("Slider", "SL", 3, 3, .70, "tight", 79)],
    "hs_slurve": [P("Fastball", "FB", 3, 3, .75, "", 78), P("Slurve", "SL", 3, 3, .65, "slurve", 67)],
}
LEVELS = ("hs", "college_d3", "college_d1")
BASES = {"empty": (False, False, False), "R1": (True, False, False), "R3": (False, False, True)}
COUNTS = [(b, k) for b in range(4) for k in range(3)]


def cell(ars, s, tab):
    _, dist, _, _ = e.call_v08(ars, s, rng=random.Random(0), tab=tab)
    calls, types = {}, {}
    for pr, _, p, q in dist:
        calls[(p.name, q)] = calls.get((p.name, q), 0.0) + pr
        types[p.name] = types.get(p.name, 0.0) + pr
    top = max(calls.items(), key=lambda kv: kv[1])
    trusted = [p.name for p in e.candidates(ars, s)]
    return dict(top=top[0], top_share=top[1], n_calls=sum(1 for v in calls.values() if v > 0), types=types,
                strike_target=sum(v for (n, q), v in calls.items() if q != "chase"), trusted=trusted)


def grid(levels=LEVELS, arsenals=None, bases=None):
    out = {}
    for lvl in levels:
        for an, ars in (arsenals or ARSENALS).items():
            for bn, bs in (bases or BASES).items():
                s0 = e.Situation(0, 0, 1, bs, inning=3, margin=0, level=lvl)
                tab = e.solve_table(ars, s0)
                for (b, k) in COUNTS:
                    out[(lvl, an, bn, (b, k))] = cell(ars, replace(s0, balls=b, strikes=k), tab)
    return out


def checks(g):
    """The plan's Step 2 assertions as Drew settled them on Nov 10. Returns [(name, ok, detail, hard)]; hard checks gate
    tests.py, the rest are reported (Drew: where the never-pick window leaves one pitch, that is the engine's call)."""
    res = []
    avg = {k: c for k, c in g.items() if k[1] == "AVG3"}
    bad = [(k, c["top_share"], c["n_calls"]) for k, c in avg.items() if k[3] != (3, 0)
           and (c["top_share"] > 0.85 + 1e-9 or c["n_calls"] < 2)]
    res.append(("AVG3, every count but 3-0: top call <= 85% and >= 2 calls survive the window", not bad,
                f"{len(bad)} of {sum(1 for k in avg if k[3] != (3, 0))} cells fail" + (f"; {fmt(bad[:4])}" if bad else ""), True))
    a31 = sorted((k, c) for k, c in avg.items() if k[3] == (3, 1))
    # v1.0 Step 7: measured by pitch type (the top pitch's share), as Drew set the floor on Nov 10: the down-middle target
    # (Nov 11) splits the fastball's strikes between two spots, so the top single (pitch, spot) no longer measures the mix
    top_t = lambda c: max(c["types"].values())
    inb = [k for k, c in a31 if 0.55 - 1e-9 <= top_t(c) <= 0.70 + 1e-9]
    # Drew, Nov 10: one 3-1 setting at every level (1.3 after Step 2's recalibration). Runners move the 3-1 stakes and the
    # setting can't see them, so the gate is every situation inside 50-80% with two pitch types > 10%; how many sit in
    # 55-70% is printed (8 of 9 at 1.3: D1 with a runner on 1st reads 78.9%).
    ok31 = (all(0.50 - 1e-9 <= top_t(c) <= 0.80 + 1e-9 for _, c in a31)
            and all(sum(1 for v in c["types"].values() if v > 0.10) >= 2 for _, c in a31))
    res.append(("D1 3-1, AVG3: top pitch type inside 50-80% in all 9 situations (target 55-70%), two pitch types > 10%",
                ok31, f"{len(inb)} of 9 in 55-70%; " + ", ".join(f"{k[0]}/{k[2]} {top_t(c):.1%}" for k, c in a31), True))
    fl = [(k, max(c["types"].values())) for k, c in avg.items() if k[3] in ((2, 0), (2, 1), (3, 1))]
    res.append(("floor: AVG3's top pitch type >= 50% at 2-0, 2-1, 3-1 (Drew: by pitch, not exact spot)",
                all(v >= 0.50 - 1e-9 for _, v in fl), f"lowest {min(v for _, v in fl):.0%}", True))
    fp = [c["strike_target"] for k, c in avg.items() if k[3] == (0, 0)]
    res.append(("race to two strikes: AVG3 first-pitch strike-target share >= 85%", min(fp) >= 0.85 - 1e-9,
                f"lowest {min(fp):.0%}", True))
    nc = [k for k, c in g.items() if k[3] in ((3, 0), (3, 1), (2, 2)) and c["top"][1] == "chase"]
    res.append(("no chase as the top call at 3-0, 3-1, 2-2 (every arsenal)", not nc, f"{len(nc)} cells", True))
    # reported, not gated (Drew, Nov 10)
    f30 = sorted((k, c["types"].get("Fastball", 0.0)) for k, c in avg.items() if k[3] == (3, 0))
    res.append(("3-0, AVG3 fastball share (v0.7c asked 60%+; measured on the retired path only, the live engine read 58.9%"
                " at HS bases empty before Step 2 too)", True, ", ".join(f"{k[0]}/{k[2]} {v:.0%}" for k, v in f30), False))
    over = [(k, c["top_share"], c["n_calls"]) for k, c in g.items() if k[3] != (3, 0)
            and (c["top_share"] > 0.85 + 1e-9 or c["n_calls"] < 2)]
    res.append(("all arsenals: cells where the window leaves a call over 85% or one call", True,
                f"{len(over)} of {sum(1 for k in g if k[3] != (3, 0))}" + (f"; e.g. {fmt(over[:3])}" if over else ""), False))
    badt = [k for k, c in g.items() if k[3] != (3, 0) and len(c["trusted"]) > 1 and max(c["types"].values()) > 0.85 + 1e-9]
    res.append(("Medium variety: cells with a pitch type over 85% (3-0 exempt)", True, f"{len(badt)} cells", False))
    bads = [(k, n) for k, c in g.items() if k[3] != (3, 0) and len(c["trusted"]) > 1 for n in c["trusted"]
            if c["types"].get(n, 0.0) < 0.05 - 1e-9]
    by = {}
    for k, n in bads:
        by[(k[1], n)] = by.get((k[1], n), 0) + 1
    res.append(("Medium variety: trusted secondaries under 5% (3-0 exempt)", True,
                f"{len(bads)} pitch-cells: " + ", ".join(f"{a} {n} {v}" for (a, n), v in sorted(by.items(), key=lambda x: -x[1])), False))
    return res


def fmt(xs):
    return "; ".join(f"{k[0]}/{k[1]}/{k[2]}/{k[3][0]}-{k[3][1]} " + ("/".join(f"{v:.2f}" if isinstance(v, float) else str(v)
                                                                     for v in (rest if isinstance(rest, tuple) else (rest,))))
                     for k, *r in xs for rest in [tuple(r) if len(r) > 1 else r[0]])


def table(g, arsenal="AVG3"):
    lines = []
    for lvl in LEVELS:
        for bn in BASES:
            row = [f"{lvl:<10} {bn:<5}"]
            for c_ in COUNTS:
                c = g.get((lvl, arsenal, bn, c_))
                if c:
                    row.append(f"{c['top_share']:.2f}")
            lines.append(" ".join(row))
    head = " " * 16 + " ".join(f"{b}-{k} " for b, k in COUNTS)
    return head + "\n" + "\n".join(lines)


if __name__ == "__main__":
    g = grid()
    for an in ARSENALS:
        print(f"\ntop-call share, {an}\n" + table(g, an))
    print()
    for name, ok, det, hard in checks(g):
        print(f"[{('PASS' if ok else 'FAIL') if hard else 'INFO'}] {name}\n       {det}")
    sys.exit(0)
