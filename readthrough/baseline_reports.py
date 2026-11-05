"""v0.9 Step 1: the four baseline reports (plan Item 1). Ranges, not pass/fail.
usage (repo root): python3 readthrough/baseline_reports.py [--out results/readthrough]
  1 Usage by count        from the read-through game logs (results/readthrough/<engine>_summary.json, made by read.py)
  2 Arsenal balance       engine queried directly: every count, both sides, each level and staff; per pitch, how often it
                          is called against how close its best call is to the best call overall (cost gap, runs)
  3 Predictability        from the game logs: next-pitch predictor vs always-fastball, by count
  4 Platoon audit         engine queried directly: changeup share vs opposite-side hitters, breaking-ball share and
                          away share vs same-side hitters
No hitter scouting anywhere: default hitter, grades 3. MLB references are benchmarks, not college targets."""
import json, os, sys
from collections import defaultdict
from dataclasses import replace
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import engine as e
import simulate

COUNTS = [(0, 0), (1, 0), (0, 1), (1, 1), (2, 0), (2, 1), (1, 2), (0, 2), (3, 0), (3, 1), (2, 2), (3, 2)]
LEVELS = ["hs", "college_d3", "college_d1"]
STAFFS = ["two_pitch", "default", "four_pitch"]
MODES = {"v07": e.FLAGS_V07, "v08": e.FLAGS_V08, "v09": e.FLAGS_V09, "v09_no_inside": dict(e.FLAGS_V09, inside_v09=False)}
MLB = dict(first_pitch_fb=0.58, first_pitch_strike=0.62, pitchers_count=(0.449, 0.510), hitters_count=(0.168, 0.200))


class Half:
    def random(self):
        return 0.5


def starter(staff):
    simulate.STAFF = staff
    return simulate.our_staff()[0]["arsenal"]


def grid(mode, level, staff):
    """dist and per-pitch cost gaps for every count and side. Returns {(b,k,same): {"dist": {(name,q): p}, "gap": {name: runs}}}"""
    e.set_flags(**MODES[mode])
    ars = starter(staff)
    out = {}
    for same in (True, False):
        s0 = e.Situation(0, 0, 0, (False, False, False), inning=4, margin=0, pitch_count=40, batters_faced=4, level=level,
                         same_side=same, home=True, sched_innings=9)
        if mode != "v07":
            s0 = replace(s0, win=e.win_constants(s0))
            tab = e.solve_table(ars, s0)
        for b, k in COUNTS:
            s = replace(s0, balls=b, strikes=k)
            if mode != "v07":
                s = replace(s, look=tab.h0)
                _, dist, _, info = e.call_v08(ars, s, rng=Half(), tab=tab)
                full = {a: sum(info["sigma"][kk] * info["M"][a][kk] for kk in info["M"][a]) for a in info["M"]}
            else:
                _, dist = e.call_mixed(ars, s, rng=Half())
                _, costs, _ = e.mixed_policy(ars, s)
                full = {a: v for a, v in costs.items() if a[1] in e.targets(b, k)}
            best = min(full.values())
            gap = {}
            for x in ars:
                cs = [v for a, v in full.items() if a[0] == x.name]
                gap[x.name] = (min(cs) - best) if cs else None      # None: not allowed (below cutoff or guardrail)
            out[(b, k, same)] = {"dist": {(d[2].name, d[3]): d[0] for d in dist}, "gap": gap,
                                 "kind": {x.name: x.kind for x in ars}}
    return out


def balance(G, scale):
    use, gaps = defaultdict(float), defaultdict(list)
    for v in G.values():
        for (n, q), p in v["dist"].items():
            use[n] += p / len(G)
        for n, g in v["gap"].items():
            gaps[n].append(g)
    rows = []
    for n in gaps:
        gs = [g for g in gaps[n] if g is not None]
        mean_gap = sum(gs) / len(gs) if gs else None
        flag = ""
        if mean_gap is not None and mean_gap < 0.005 * scale and use[n] < 0.05:
            flag = "under-called: close to the best call but rarely called"
        elif use[n] > 0.60 and len(gaps) >= 3:
            flag = "over-called: more than 60% of calls"
        rows.append(dict(pitch=n, usage=round(use[n], 3), mean_gap_runs=None if mean_gap is None else round(mean_gap, 4),
                         allowed_in=f"{len(gs)}/{len(gaps[n])}", flag=flag))
    return rows


def platoon(G):
    def share(same, pred):
        vs = [v for (b, k, s), v in G.items() if s == same]
        return sum(p for v in vs for (n, q), p in v["dist"].items() if pred(v["kind"][n], q)) / len(vs)
    ch = lambda kind, q: kind == "CH"
    brk = lambda kind, q: kind in ("SL", "CB")
    brk_away = lambda kind, q: kind in ("SL", "CB") and q in ("up-away", "down-away", "chase")
    has = lambda kinds: any(any(v["kind"][n] in kinds for n in v["kind"]) for v in G.values())
    r = {}
    if has(("CH",)):
        r["changeup_share"] = dict(opposite=round(share(False, ch), 3), same=round(share(True, ch), 3))
        r["changeup_more_vs_opposite"] = r["changeup_share"]["opposite"] > r["changeup_share"]["same"]
    if has(("SL", "CB")):
        r["breaking_share"] = dict(same=round(share(True, brk), 3), opposite=round(share(False, brk), 3))
        r["breaking_more_vs_same"] = r["breaking_share"]["same"] > r["breaking_share"]["opposite"]
        r["breaking_away_share_same_side"] = round(share(True, brk_away) / max(1e-9, share(True, brk)), 3)
    return r


def pct(x):
    return "—" if x is None else f"{x:.1%}"


def main():
    outdir = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(ROOT, "results", "readthrough")
    os.makedirs(outdir, exist_ok=True)
    res = {"balance": {}, "platoon": {}}
    for mode in MODES:
        for lv in LEVELS:
            for st in STAFFS:
                G = grid(mode, lv, st)
                key = f"{mode}|{lv}|{st}"
                res["balance"][key] = balance(G, e.run_scale(lv))
                res["platoon"][key] = platoon(G)
                print("done", key, flush=True)
    json.dump(res, open(os.path.join(outdir, "baseline_engine.json"), "w"), indent=1)
    S = {m: json.load(open(os.path.join(outdir, f"{m}_summary.json"))) for m in MODES
         if os.path.exists(os.path.join(outdir, f"{m}_summary.json"))}
    L = ["# v0.9 Step 1 baseline reports: v0.7c and v0.8\n",
         "No scouting anywhere (every hitter at the default). Ranges and comparisons, not pass/fail. MLB figures are benchmarks, "
         "not college targets.\n"]
    # 1 usage by count + count paths
    L.append("## 1. Usage by count (from the read-through games)\n")
    if S:
        L.append("| | " + " | ".join(S) + " | MLB reference |\n|---|" + "---|" * (len(S) + 1))
        cp = {m: S[m]["count_paths"] for m in S}
        L.append("| First-pitch fastball | " + " | ".join(pct(cp[m]["first_pitch_fb"]) for m in S) + f" | about {MLB['first_pitch_fb']:.0%} |")
        L.append("| First-pitch strike | " + " | ".join(pct(cp[m]["first_pitch_strike"]) for m in S) + f" | just under {MLB['first_pitch_strike']:.0%} |")
        L.append("| Reach a pitcher's count (0-2, 1-2, 2-2) | " + " | ".join(pct(cp[m]["pitchers_count_rate"]) for m in S) + " | 44.9% to 51.0% |")
        L.append("| Reach a hitter's count (2-0, 3-0, 3-1) | " + " | ".join(pct(cp[m]["hitters_count_rate"]) for m in S) + " | 16.8% to 20.0% |")
        L.append("| First two calls both off the zone | " + " | ".join(pct(cp[m]["early_ball_rate"]) for m in S) + " | — |")
        L.append("| 1-1 goes to 1-2 (not 2-1) | " + " | ".join(pct(cp[m]["one_one_to_one_two"]) for m in S) + " | — |\n")
        L.append("Fastball / chase / middle / inside share of calls, by count:\n")
        L.append("| Count | " + " | ".join(f"{m} FB · chase · middle · in" for m in S) + " |\n|---|" + "---|" * len(S))
        for b, k in COUNTS:
            c = f"{b}-{k}"
            cells = []
            for m in S:
                u = S[m]["usage_by_count"].get(c)
                cells.append("—" if not u else f"{u['fb']:.0%} · {u['chase']:.0%} · {u['middle']:.0%} · {u['inside']:.0%} (n {u['n']})")
            L.append(f"| {c} | " + " | ".join(cells) + " |")
    # 2 balance
    L.append("\n## 2. Arsenal balance (engine queried in every count, both sides)\n")
    L.append("Usage = average share of calls over the 12 counts and both sides. Gap = how much worse the pitch's best call is than "
             "the best call overall, in runs, averaged over the counts where it is allowed. Flags: under-called (gap under "
             "0.005 runs at the level's scale but under 5% of calls), over-called (over 60% of calls with 3+ pitches).\n")
    L.append("| Engine | Level | Staff | Pitch | Usage | Mean gap (runs) | Allowed in | Flag |\n|---|---|---|---|---|---|---|---|")
    for key, rows in res["balance"].items():
        m, lv, st = key.split("|")
        for r in rows:
            L.append(f"| {m} | {lv} | {st} | {r['pitch']} | {r['usage']:.1%} | {r['mean_gap_runs']} | {r['allowed_in']} | {r['flag']} |")
    # 3 predictability
    L.append("\n## 3. Predictability by count (from the read-through games)\n")
    L.append("A predictor that sees only what a hitter sees (count, last pitch type, last result), trained on the other games, "
             "guesses fastball or off-speed. Edge = its accuracy minus always guessing fastball. Higher edge = more predictable.\n")
    if S:
        L.append("| Count | " + " | ".join(f"{m} edge (n)" for m in S) + " |\n|---|" + "---|" * len(S))
        for b, k in COUNTS:
            c = f"{b}-{k}"
            L.append(f"| {c} | " + " | ".join(
                (lambda v: "—" if not v else f"{v['edge']:+.1%} ({v['n']})")(S[m]["predictability"]["by_count"].get(c)) for m in S) + " |")
        L.append("| **All** | " + " | ".join(f"{S[m]['predictability']['edge']:+.1%}" for m in S) + " |")
        L.append("| Behind in the count | " + " | ".join(
            f"{S[m]['predictability']['behind_predictor_acc'] - S[m]['predictability']['behind_always_fb_acc']:+.1%}" for m in S) + " |")
        L.append("\nConsecutive fastballs (reported, not a gate, decision 7):\n")
        L.append("| | " + " | ".join(S) + " |\n|---|" + "---|" * len(S))
        for lbl, k in (("Correlation, consecutive pitches by a pitcher", "rho_consecutive_fb"), ("Correlation within a PA", "rho_within_pa")):
            L.append(f"| {lbl} | " + " | ".join(f"{S[m]['predictability'][k]:+.2f}" for m in S) + " |")
        L.append("| Fastball after a fastball (within a PA) | " + " | ".join(pct(S[m]['predictability']['fb_after_fb']) for m in S) + " |")
        L.append("| Fastball after an off-speed pitch | " + " | ".join(pct(S[m]['predictability']['fb_after_os']) for m in S) + " |")
    # 4 platoon
    L.append("\n## 4. Platoon audit (engine queried in every count)\n")
    L.append("Expected by coaches: more changeups to opposite-side hitters; more breaking balls to same-side hitters, mostly away.\n")
    L.append("| Engine | Level | Staff | Changeup opp / same | More CH vs opposite? | Breaking same / opp | More breaking vs same? | Breaking away share (same side) |\n|---|---|---|---|---|---|---|---|")
    for key, r in res["platoon"].items():
        m, lv, st = key.split("|")
        chs = r.get("changeup_share")
        brs = r.get("breaking_share")
        L.append(f"| {m} | {lv} | {st} | " + (f"{chs['opposite']:.1%} / {chs['same']:.1%}" if chs else "—") + " | " +
                 ("yes" if r.get("changeup_more_vs_opposite") else ("no" if chs else "—")) + " | " +
                 (f"{brs['same']:.1%} / {brs['opposite']:.1%}" if brs else "—") + " | " +
                 ("yes" if r.get("breaking_more_vs_same") else ("no" if brs else "—")) + " | " +
                 (pct(r.get("breaking_away_share_same_side")) if brs else "—") + " |")
    open(os.path.join(outdir, "baseline_reports.md"), "w").write("\n".join(L) + "\n")
    print("wrote", os.path.join(outdir, "baseline_reports.md"))


if __name__ == "__main__":
    main()
