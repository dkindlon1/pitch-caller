"""v1.1 Step 2 call-change checks (docs/PLAN_v1.1_2026-11-12.md, Step 2): do profiles change the calls the way the
plan's proposed bands say? Matched arsenals that differ in one profile only, D3, bases empty, one out, inning 3, tied,
every count, same-side and opposite-side hitters. Each number is shown for this engine ("now") and for the same engine
with Step 2's changes set back to Step 1b ("1b": profile_terms off, v1.0 shape_fit lines, v1.0 grounder table, the level
shifts before the realism refit),
so the move Step 2 makes is visible. The bands are proposals; Drew confirms or changes them at Step 4.

  python3 readthrough/v11_call_changes.py   -> prints the table, writes results/v11/call_changes_step2.json
"""
import json, os, random, sys
from dataclasses import replace

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import engine as e

LEVEL = "college_d3"
COUNTS = [(b, k) for b in range(4) for k in range(3)]
UP = ("up-in", "up-away")


def P(n, k, sh, g=3, c=3, cf=0.75, v=None):
    return e.Pitch(n, k, grade=g, command=c, conf=cf, shape=sh, velo=v)


def base3(fb="rides", sl="tight", ch="fade", fbk="FB"):
    return [P("Fastball", fbk, fb, cf=0.8, v=88), P("Slider", "SL", sl, v=None), P("Changeup", "CH", ch, cf=0.65, v=None)]


def calls(ars, same, counts=COUNTS):
    """{count: {(pitch, target): share}}"""
    s0 = e.Situation(0, 0, 1, (False, False, False), inning=3, margin=0, level=LEVEL, same_side=same)
    tab = e.solve_table(ars, s0)
    out = {}
    for (b, k) in counts:
        _, dist, _, _ = e.call_v08(ars, replace(s0, balls=b, strikes=k), rng=random.Random(0), tab=tab)
        d = {}
        for pr, _, p, q in dist:
            d[(p.name, q)] = d.get((p.name, q), 0.0) + pr
        out[(b, k)] = d
    return out


def share(cs, pitch, counts=COUNTS, targets=None):
    tot = 0.0
    for c in counts:
        tot += sum(v for (n, q), v in cs[c].items() if n == pitch and (targets is None or q in targets))
    return tot / len(counts)


def within(cs, pitch, targets, counts=COUNTS):
    """share of this pitch's calls that go to these targets"""
    a = sum(v for c in counts for (n, q), v in cs[c].items() if n == pitch and q in targets)
    b = sum(v for c in counts for (n, q), v in cs[c].items() if n == pitch)
    return a / b if b else 0.0


TWO_K = [c for c in COUNTS if c[1] == 2]
EARLY = [(0, 0), (1, 0), (0, 1)]


def measure():
    r = {}
    # 1. sweeper vs gyro slider: slider share by side
    for tag in ("sweeper", "gyro"):
        for same in (True, False):
            r[f"slider share, {tag}, {'same' if same else 'opp'}"] = share(calls(base3(sl=tag), same), "Slider")
    # 2. riding vs dead-zone (straight) fastball: share of fastball calls aimed up
    for tag in ("rides", "straight"):
        r[f"fastball up-target share, {tag}"] = sum(within(calls(base3(fb=tag), sm), "Fastball", UP) for sm in (True, False)) / 2
    # 3. split vs fade changeup: two-strike changeup share; 4. firm vs fade: two-strike changeup chase share
    for tag in ("split", "fade", "firm"):
        cs = [calls(base3(ch=tag), sm, TWO_K) for sm in (True, False)]
        r[f"changeup two-strike share, {tag}"] = sum(share(c, "Changeup", TWO_K) for c in cs) / 2
        r[f"changeup two-strike chase share, {tag}"] = sum(share(c, "Changeup", TWO_K, ("chase",)) for c in cs) / 2
    # 5. 12-6 vs sweeping curve: early-count curve use vs opposite-side hitters
    for tag in ("12-6", "sweeping"):
        ars = [P("Fastball", "FB", "", cf=0.8, v=88), P("Curve", "CB", tag), P("Changeup", "CH", "fade", cf=0.65)]
        r[f"curve early-count share vs opp, {tag}"] = share(calls(ars, False, EARLY), "Curve", EARLY)
    # 6. a sinker / cutter in the arsenal: overall share, and where
    for k, tag, nm in (("SI", "run", "Sinker"), ("FC", "hard", "Cutter")):
        ars = [P("Fastball", "FB", "rides", cf=0.8, v=90), P(nm, k, tag, cf=0.75), P("Slider", "SL", "tight"), P("Changeup", "CH", "fade", cf=0.65)]
        cs = {sm: calls(ars, sm) for sm in (True, False)}
        r[f"{nm.lower()} share overall"] = (share(cs[True], nm) + share(cs[False], nm)) / 2
        r[f"{nm.lower()} share, same"] = share(cs[True], nm)
        r[f"{nm.lower()} share, opp"] = share(cs[False], nm)
        r[f"{nm.lower()} inside share of its calls, same"] = within(cs[True], nm, ("up-in", "down-in"))
    return r


BANDS = [
    ("sweeper vs gyro: sweeper's slider share vs same-side >= gyro's + 5 pts",
     lambda r: r["slider share, sweeper, same"] - r["slider share, gyro, same"] >= 0.05,
     lambda r: f"sweeper {r['slider share, sweeper, same']:.1%} vs gyro {r['slider share, gyro, same']:.1%}"),
    ("sweeper vs gyro: sweeper's slider share vs opposite-side below gyro's",
     lambda r: r["slider share, sweeper, opp"] < r["slider share, gyro, opp"],
     lambda r: f"sweeper {r['slider share, sweeper, opp']:.1%} vs gyro {r['slider share, gyro, opp']:.1%}"),
    ("riding vs dead-zone fastball: up-target share >= 10 pts higher for riding",
     lambda r: r["fastball up-target share, rides"] - r["fastball up-target share, straight"] >= 0.10,
     lambda r: f"rides {r['fastball up-target share, rides']:.1%} vs straight {r['fastball up-target share, straight']:.1%}"),
    ("split vs fade changeup: higher two-strike share for split",
     lambda r: r["changeup two-strike share, split"] > r["changeup two-strike share, fade"],
     lambda r: f"split {r['changeup two-strike share, split']:.1%} vs fade {r['changeup two-strike share, fade']:.1%}"),
    ("firm vs fade changeup: lower two-strike chase share for firm",
     lambda r: r["changeup two-strike chase share, firm"] < r["changeup two-strike chase share, fade"],
     lambda r: f"firm {r['changeup two-strike chase share, firm']:.1%} vs fade {r['changeup two-strike chase share, fade']:.1%}"),
    ("12-6 vs sweeping curve: more early-count use vs opposite-side hitters for 12-6",
     lambda r: r["curve early-count share vs opp, 12-6"] > r["curve early-count share vs opp, sweeping"],
     lambda r: f"12-6 {r['curve early-count share vs opp, 12-6']:.1%} vs sweeping {r['curve early-count share vs opp, sweeping']:.1%}"),
    ("a sinker takes >= 10% of calls overall",
     lambda r: r["sinker share overall"] >= 0.10, lambda r: f"{r['sinker share overall']:.1%} (same {r['sinker share, same']:.1%}, opp {r['sinker share, opp']:.1%}; inside {r['sinker inside share of its calls, same']:.0%} of its same-side calls)"),
    ("a cutter takes >= 10% of calls overall",
     lambda r: r["cutter share overall"] >= 0.10, lambda r: f"{r['cutter share overall']:.1%} (same {r['cutter share, same']:.1%}, opp {r['cutter share, opp']:.1%})"),
    ("sinker mostly in to same-side hitters (more than half its same-side calls inside)",
     lambda r: r["sinker inside share of its calls, same"] > 0.5, lambda r: f"{r['sinker inside share of its calls, same']:.0%}"),
    ("cutter used more vs opposite-side hitters than same-side",
     lambda r: r["cutter share, opp"] > r["cutter share, same"], lambda r: f"opp {r['cutter share, opp']:.1%} vs same {r['cutter share, same']:.1%}"),
]


if __name__ == "__main__" and "--examples" not in sys.argv:
    sys.path.insert(0, os.path.join(HERE, "readthrough"))
    import step2_off as S
    now = measure()
    with S.step2_off(e, S.params_at("7b5ebbb")):
        before = measure()
    out = {"now": now, "step1b": before, "bands": []}
    print(f"{'band (proposed)':86s} {'1b':>4s} {'now':>4s}  now: detail")
    for name, ok, det in BANDS:
        b, n = ok(before), ok(now)
        out["bands"].append(dict(band=name, step1b=b, now=n, detail_now=det(now), detail_1b=det(before)))
        print(f"{name:86s} {'pass' if b else 'FAIL':>4s} {'pass' if n else 'FAIL':>4s}  {det(now)}   [1b: {det(before)}]")
    print(f"\n{sum(x['now'] for x in out['bands'])}/{len(BANDS)} bands pass now (Step 1b: {sum(x['step1b'] for x in out['bands'])}/{len(BANDS)})")
    json.dump(out, open(os.path.join(HERE, "results", "v11", "call_changes_step2.json"), "w"), indent=1)


# ---------------------------------------------------------------- 5 example calls before / after, per Step 2 item
def example_calls(n=5):
    """For each Step 2 item, turn that item alone back to Step 1b and show the 5 spots whose call mix moves most."""
    import copy
    import grid_v10 as G
    sys.path.insert(0, os.path.join(HERE, "readthrough"))
    import step2_off as S
    ars = dict(G.ARSENALS)
    ars["sweeper trio"] = base3(sl="sweeper")
    ars["sinker four"] = [P("Fastball", "FB", "rides", cf=0.8, v=90), P("Sinker", "SI", "run", cf=0.75), P("Slider", "SL", "tight"), P("Changeup", "CH", "fade", cf=0.65)]
    ars["cutter four"] = [P("Fastball", "FB", "rides", cf=0.8, v=90), P("Cutter", "FC", "hard", cf=0.75), P("Slider", "SL", "tight"), P("Changeup", "CH", "fade", cf=0.65)]
    ars["12-6 trio"] = [P("Fastball", "FB", "", cf=0.8, v=88), P("Curve", "CB", "12-6"), P("Changeup", "CH", "split", cf=0.65)]

    def mixes():
        out = {}
        for an, a in ars.items():
            for same in (True, False):
                cs = calls(a, same)
                for c, d in cs.items():
                    out[(an, "same" if same else "opp", f"{c[0]}-{c[1]}")] = d
        return out

    def zero(tab):
        if isinstance(tab, dict):
            return {k: zero(v) for k, v in tab.items()}
        if isinstance(tab, (tuple, list)):
            return type(tab)(zero(v) for v in tab)
        return 0.0
    items = {
        "2a shape and profile (PT_C, PT_B)": ("PT_C", "PT_B"),
        "2b fastball zone (PT_FBZ_W)": ("PT_FBZ_W",),
        "2c opposite-side chase (PT_CHASE_OPP)": ("PT_CHASE_OPP", "PT_CHASE_MEAN"),
        "priors (PT_PLAT, PT_FBZ_H, PT_FBL_H)": ("PT_PLAT", "PT_FBZ_H", "PT_FBL_H"),
    }
    now = mixes()
    res = {}

    def top3(d):
        return ", ".join(f"{p} {q} {v:.0%}" for (p, q), v in sorted(d.items(), key=lambda kv: -kv[1])[:3])

    def report(name, off):
        mv = []
        for k in now:
            a, b = now[k], off[k]
            tv = 0.5 * sum(abs(a.get(x, 0) - b.get(x, 0)) for x in set(a) | set(b))
            mv.append((tv, k))
        mv.sort(reverse=True)
        res[name] = [dict(spot=" / ".join(k), moved=round(tv, 3), before=top3(off[k]), after=top3(now[k])) for tv, k in mv[:n]]
        print(f"\n{name}: median move {sorted(m[0] for m in mv)[len(mv) // 2]:.3f} over {len(mv)} spots")
        for r_ in res[name]:
            print(f"  {r_['spot']:34s} moved {r_['moved']:.2f} | 1b: {r_['before']} | now: {r_['after']}")
    for name, tabs in items.items():
        saved = {t: getattr(e, t) for t in tabs}
        try:
            for t in tabs:
                setattr(e, t, zero(copy.deepcopy(saved[t])))
            off = mixes()
        finally:
            for t, v in saved.items():
                setattr(e, t, v)
        report(name, off)
    for name, attr, maker in (("2e grounders by profile (gb_rate)", "gb_rate", S._gb_1b), ("slot adjustment (movement)", "movement", S._mv_1b),
                              ("v1.0 fastball lines and SL / CH same-side patches removed (class_terms)", "class_terms", S._ct_1b)):
        saved = getattr(e, attr)
        try:
            setattr(e, attr, maker(e))
            e._PT_REF.clear()                      # pt_ref is cached through movement()
            off = mixes()
        finally:
            setattr(e, attr, saved)
            e._PT_REF.clear()
        report(name, off)
    return res


if __name__ == "__main__" and "--examples" in sys.argv:
    ex = example_calls()
    json.dump(ex, open(os.path.join(HERE, "results", "v11", "call_examples_step2.json"), "w"), indent=1)
