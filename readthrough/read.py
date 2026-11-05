"""v0.9 Step 1: the read-through. Reads simulated game logs and prints every call so it can be judged the way a pitching
coach reads a sequence.
usage (repo root): python3 readthrough/read.py runs/readthrough/v07 runs/readthrough/v08 [--out results/readthrough]

For each engine directory it writes:
  <tag>_summary.json   automatic-check counts, report-only shares, count-path and predictability metrics
  <tag>_pack.md        the review pack: every flagged call, a fixed-seed sample (20% of high-stakes calls, 5% of the rest),
                       and six complete games told plate appearance by plate appearance

Automatic checks (plan Item 1, with Drew's Nov 5 grading rules):
  FLAGGED  R1 chase at 3-0 or 3-1          R2 chase at 2-2 (rule added in v0.8)   R3 re-called a shaken-off call
           E1 first two calls of a PA both off the zone                            E2 chase at 3-2 with the bases loaded
           S1 same pitch to the same spot twice in a row when the first was not a whiff
  REPORTED two-strike middle share; elevated call before two strikes with a runner on 3rd and < 2 outs; a low breaking
           ball that isn't landing (under half strikes after 4+ thrown) with a runner on 3rd and < 2 outs
The simulator has no steal-threat input, so the plan's steal check cannot run on these games."""
import csv, glob, json, os, random, sys
from collections import Counter, defaultdict

STRIKEISH = {"cstrike", "whiff", "foul", "weak", "solid", "hard"}
PA_END = ("STRIKEOUT", "WALK", "HIT BY PITCH")
FLAGS = {"R1": "chase at 3-0/3-1", "R2": "chase at 2-2", "R3": "re-called a shaken-off call",
         "E1": "first two calls off the zone", "E2": "chase at 3-2, bases loaded", "S1": "same pitch, same spot, no whiff"}
HARD = ("R1", "R2", "R3")
PITCHERS_COUNT = {"0-2", "1-2", "2-2"}
HITTERS_COUNT = {"2-0", "3-0", "3-1"}


def cls(kind):
    return "FB" if kind == "FB" else "OS"


def load(path):
    """One game -> list of pitch dicts with PA structure, history and landing-so-far added."""
    rows = list(csv.DictReader(open(path)))
    name = os.path.basename(path)[:-4]
    level, rest = name.split("_", 1) if not name.startswith("college") else ("_".join(name.split("_")[:2]), "_".join(name.split("_")[2:]))
    staff, seed = rest.rsplit("_s", 1)
    land = defaultdict(lambda: [0, 0])
    pa, out = -1, []
    for r in rows:
        if r["count"] == "0-0":
            pa += 1
            hist = []
        b, k = (int(x) for x in r["count"].split("-"))
        key = (r["pitcher"], r["call"].rsplit(" ", 1)[0])
        st, th = land[key]
        p = dict(r, game=name, level=level, staff=staff, seed=int(seed), pa=pa, n_in_pa=len(hist) + 1, balls=b, strikes=k,
                 hist=list(hist), land_strikes=st, land_thrown=th, pitch_name=key[1],
                 r3=r["bases"][2] == "3", outs=int(r["outs"]), same_side=(r["hand"] == r["pitcher"][-2]))
        land[key][1] += 1
        land[key][0] += r["result"] in STRIKEISH
        hist.append((key[1], r["kind"], r["quad"], r["result"]))
        out.append(p)
    return out


def checks(p):
    f = []
    q, c = p["quad"], p["count"]
    if q == "chase" and c in ("3-0", "3-1"):
        f.append("R1")
    if q == "chase" and c == "2-2":
        f.append("R2")
    if p["shakeoffs"] and p["call"] in [x.strip() for x in p["shakeoffs"].split("|")]:
        f.append("R3")
    if p["n_in_pa"] == 2 and q == "chase" and p["hist"][0][2] == "chase":
        f.append("E1")
    if q == "chase" and c == "3-2" and p["bases"] == "123":
        f.append("E2")
    if p["hist"]:
        ln, lk, lq, lr = p["hist"][-1]
        if ln == p["pitch_name"] and lq == q and lr != "whiff":
            f.append("S1")
    return f


def reported(p):
    r = []
    if p["strikes"] == 2 and p["quad"] == "middle":
        r.append("two_strike_middle")
    if p["r3"] and p["outs"] < 2 and p["strikes"] < 2 and p["quad"] in ("up-in", "up-away"):
        r.append("elevated_r3")
    if (p["r3"] and p["outs"] < 2 and p["kind"] in ("SL", "CB") and p["quad"] in ("down-in", "down-away", "chase")
            and p["land_thrown"] >= 4 and p["land_strikes"] / p["land_thrown"] < 0.5):
        r.append("wild_low_breaker_r3")
    return r


def high_stakes(p):
    return p["big_spot"] == "1" or p["balls"] == 3 or p["strikes"] == 2 or p["n_in_pa"] == 1


def phi(pairs):
    n = len(pairs)
    if n < 2:
        return float("nan")
    a = sum(x for x, _ in pairs) / n
    b = sum(y for _, y in pairs) / n
    cov = sum((x - a) * (y - b) for x, y in pairs) / n
    va, vb = a * (1 - a), b * (1 - b)
    return cov / (va * vb) ** 0.5 if va > 0 and vb > 0 else float("nan")


def predictability(pitches):
    """Next-pitch-type predictor that sees only what a hitter sees (count, last pitch class, last result), trained
    leave-one-game-out; compared with always guessing fastball. Also consecutive-fastball correlations."""
    feat = lambda p: (p["count"], cls(p["hist"][-1][1]) if p["hist"] else "-", p["hist"][-1][3] if p["hist"] else "-")
    tab = defaultdict(Counter)
    per_game = defaultdict(lambda: defaultdict(Counter))
    for p in pitches:
        tab[feat(p)][cls(p["kind"])] += 1
        per_game[p["game"]][feat(p)][cls(p["kind"])] += 1
    by_count = defaultdict(lambda: [0, 0, 0])      # n, predictor hits, always-FB hits
    for p in pitches:
        f, y = feat(p), cls(p["kind"])
        c = tab[f] - per_game[p["game"]][f]
        guess = "FB" if c["FB"] >= c["OS"] else "OS"
        row = by_count[p["count"]]
        row[0] += 1
        row[1] += guess == y
        row[2] += y == "FB"
    tot = [sum(v[i] for v in by_count.values()) for i in range(3)]
    behind = [sum(v[i] for c, v in by_count.items() if int(c[0]) > int(c[2])) for i in range(3)]
    within = [(int(cls(p["hist"][-1][1]) == "FB"), int(cls(p["kind"]) == "FB")) for p in pitches if p["hist"]]
    seq = defaultdict(list)
    for p in pitches:
        seq[(p["game"], p["pitcher"])].append(int(cls(p["kind"]) == "FB"))
    across = [(s[i - 1], s[i]) for s in seq.values() for i in range(1, len(s))]
    after = lambda prev: (sum(y for x, y in within if x == prev) / max(1, sum(1 for x, _ in within if x == prev)))
    return dict(
        predictor_acc=tot[1] / tot[0], always_fb_acc=tot[2] / tot[0], edge=(tot[1] - tot[2]) / tot[0],
        behind_predictor_acc=behind[1] / max(1, behind[0]), behind_always_fb_acc=behind[2] / max(1, behind[0]), behind_n=behind[0],
        by_count={c: dict(n=v[0], predictor=round(v[1] / v[0], 3), always_fb=round(v[2] / v[0], 3), edge=round((v[1] - v[2]) / v[0], 3))
                  for c, v in sorted(by_count.items())},
        rho_consecutive_fb=phi(across), rho_within_pa=phi(within),
        fb_after_fb=after(1), fb_after_os=after(0))


def count_paths(pitches):
    pas = defaultdict(list)
    for p in pitches:
        pas[(p["game"], p["pa"])].append(p)
    n = len(pas)
    reach = lambda S: sum(any(x["count"] in S for x in v) for v in pas.values()) / n
    first = [v[0] for v in pas.values()]
    early_ball = sum(len(v) >= 2 and v[0]["quad"] == "chase" and v[1]["quad"] == "chase" for v in pas.values()) / n
    at11 = [x for v in pas.values() for x in v if x["count"] == "1-1"]
    to12 = sum(x["result"] in ("cstrike", "whiff", "foul") for x in at11)     # 1-1 pitch went to 1-2
    to21 = sum(x["result"] == "ball" for x in at11)                         # went to 2-1 (in play ends the PA)
    return dict(pas=n, pitchers_count_rate=reach(PITCHERS_COUNT), hitters_count_rate=reach(HITTERS_COUNT),
                first_pitch_fb=sum(f["kind"] == "FB" for f in first) / n,
                first_pitch_strike=sum(f["result"] in STRIKEISH for f in first) / n,
                early_ball_rate=early_ball, one_one_to_one_two=to12 / max(1, to12 + to21))


def usage_by_count(pitches):
    by = defaultdict(Counter)
    for p in pitches:
        by[p["count"]]["n"] += 1
        by[p["count"]]["fb"] += p["kind"] == "FB"
        by[p["count"]]["chase"] += p["quad"] == "chase"
        by[p["count"]]["middle"] += p["quad"] == "middle"
        by[p["count"]]["inside"] += p["quad"] in ("up-in", "down-in")
    return {c: {k: round(v[k] / v["n"], 3) for k in ("fb", "chase", "middle", "inside")} | {"n": v["n"]} for c, v in sorted(by.items())}


def story_line(p, flags):
    last3 = ", ".join(f"{h[0]} {h[2]} ({h[3]})" for h in p["hist"][-3:]) or "first pitch"
    extra = f" | guess: {p['guess']} | why: {p['why']}" if p.get("why") else ""
    fl = f"  **⚑ {', '.join(f'{x} {FLAGS[x]}' for x in flags)}**" if flags else ""
    return (f"  - `{p['count']}` **{p['call']}** → {p['result']}{(' — ' + p['detail']) if p['detail'] else ''}"
            f" | top: {p['top3']}{extra} | before: {last3}{fl}")


def pa_header(p):
    side = "same side" if p["same_side"] else "opposite side"
    bases = p["bases"].replace("-", "") or "empty"
    return (f"- **{p['game']} · PA {p['pa'] + 1} · inning {p['inning']}, {p['outs']} out, bases {bases}, score {p['score']}"
            f" · {p['batter']} ({p['hand']}, {side}) vs {p['pitcher']}, pitch {p['pc']}**")


def analyze(d, tag, outdir):
    files = sorted(glob.glob(os.path.join(d, "*.csv")))
    pitches = [p for f in files for p in load(f)]
    for p in pitches:
        p["flags"], p["reported"] = checks(p), reported(p)
    n = len(pitches)
    fl = Counter(x for p in pitches for x in p["flags"])
    rep = Counter(x for p in pitches for x in p["reported"])
    two = sum(p["strikes"] == 2 for p in pitches)
    r3e = sum(p["r3"] and p["outs"] < 2 and p["strikes"] < 2 for p in pitches)
    summary = dict(engine=tag, games=len(files), pitches=n, pas=len({(p["game"], p["pa"]) for p in pitches}),
                   flags={k: fl.get(k, 0) for k in FLAGS}, flags_per_100={k: round(100 * fl.get(k, 0) / n, 2) for k in FLAGS},
                   hard_rule_violations=sum(fl[k] for k in HARD),
                   reported=dict(two_strike_middle_share=round(rep["two_strike_middle"] / max(1, two), 3),
                                 elevated_r3_share=round(rep["elevated_r3"] / max(1, r3e), 3),
                                 wild_low_breaker_r3=rep["wild_low_breaker_r3"]),
                   count_paths=count_paths(pitches), predictability=predictability(pitches),
                   usage_by_count=usage_by_count(pitches),
                   by_level={lv: dict(count_paths=count_paths([p for p in pitches if p["level"] == lv]),
                                      fb_share=round(sum(p["kind"] == "FB" for p in pitches if p["level"] == lv) /
                                                     max(1, sum(p["level"] == lv for p in pitches)), 3))
                             for lv in sorted({p["level"] for p in pitches})})
    os.makedirs(outdir, exist_ok=True)
    json.dump(summary, open(os.path.join(outdir, f"{tag}_summary.json"), "w"), indent=1, default=float)
    # review pack
    rng = random.Random(909)
    sample = [p for p in pitches if p["flags"] or rng.random() < (0.20 if high_stakes(p) else 0.05)]
    full_games = []
    for lv in ("hs", "college_d3", "college_d1"):
        for st, sd in (("default", 101), ("two_pitch", 102)):
            g = f"{lv}_{st}_s{sd}"
            if any(p["game"] == g for p in pitches):
                full_games.append(g)
    L = [f"# Read-through pack: {tag}\n",
         f"{len(files)} games, {n} pitches. Flags: " + ", ".join(f"{k} {FLAGS[k]} = {fl.get(k, 0)}" for k in FLAGS) + ".\n",
         f"## Sampled calls ({len(sample)}: every flagged call, 20% of high-stakes calls, 5% of the rest; seed 909)\n"]
    last_pa = None
    for p in sample:
        if (p["game"], p["pa"]) != last_pa:
            L.append(pa_header(p))
            last_pa = (p["game"], p["pa"])
        L.append(story_line(p, p["flags"]))
    L.append(f"\n## Complete games ({len(full_games)})\n")
    for g in full_games:
        L.append(f"\n### {g}\n")
        last_pa = None
        for p in (x for x in pitches if x["game"] == g):
            if p["pa"] != last_pa:
                L.append(pa_header(p))
                last_pa = p["pa"]
            L.append(story_line(p, p["flags"]))
    open(os.path.join(outdir, f"{tag}_pack.md"), "w").write("\n".join(L) + "\n")
    return summary, pitches


def main():
    argv = sys.argv[1:]
    outdir = argv[argv.index("--out") + 1] if "--out" in argv else "results/readthrough"
    dirs = [a for a in argv if not a.startswith("--") and a != outdir]
    for d in dirs:
        tag = os.path.basename(os.path.normpath(d))
        s, _ = analyze(d, tag, outdir)
        pr, cp = s["predictability"], s["count_paths"]
        print(f"== {tag}: {s['games']} games, {s['pitches']} pitches, {s['pas']} PAs; hard-rule violations {s['hard_rule_violations']}")
        print("   flags: " + ", ".join(f"{k} {v}" for k, v in s["flags"].items()))
        print(f"   reported: two-strike middle {s['reported']['two_strike_middle_share']:.0%}, elevated with R3 <2 outs before "
              f"2 strikes {s['reported']['elevated_r3_share']:.0%}, wild low breaker with R3 {s['reported']['wild_low_breaker_r3']}")
        print(f"   counts: pitcher's-count rate {cp['pitchers_count_rate']:.1%}, hitter's {cp['hitters_count_rate']:.1%}, first-pitch FB "
              f"{cp['first_pitch_fb']:.1%}, first-pitch strike {cp['first_pitch_strike']:.1%}, early-ball {cp['early_ball_rate']:.1%}, "
              f"1-1 to 1-2 {cp['one_one_to_one_two']:.1%}")
        print(f"   predictability: predictor {pr['predictor_acc']:.1%} vs always-FB {pr['always_fb_acc']:.1%} (edge "
              f"{pr['edge']:+.1%}); behind {pr['behind_predictor_acc']:.1%} vs {pr['behind_always_fb_acc']:.1%}; rho consecutive "
              f"{pr['rho_consecutive_fb']:+.2f}, within PA {pr['rho_within_pa']:+.2f}; FB after FB {pr['fb_after_fb']:.0%}, after OS {pr['fb_after_os']:.0%}")


if __name__ == "__main__":
    main()
