"""v0.9 Step 2, item 2 Part A: win the race to two strikes (measurement only, no engine change).
usage (repo root): python3 readthrough/race_check.py runs/readthrough/v07 runs/readthrough/v08 [--out results/step2]
Per level (HS, D3, D1; all three staffs pooled), v0.7c against v0.8 on the same seeds:
  metrics from the plan (pitcher's-count rate, hitter's-count rate, first-pitch strike, after-two-pitches shares,
  1-1 conversion, early-ball rate), walks and strikeouts for context only (walk rate is not a criterion, Drew Nov 5),
  first two calls of every PA that reaches three balls, and the plan's decision rule:
    no engine change if v0.8's pitcher's-count rate is no more than 1 point below v0.7c, its first-pitch strike rate no
    more than 2 points below, and its early-ball rate no more than 3 points above.
Also: the engine's own count values against the MLB wOBA ordering, and the why lines behind v0.8's early-count calls."""
import json, os, sys
from collections import Counter, defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]
import glob
import read as R

STRIKE = {"cstrike", "whiff", "foul", "weak", "solid", "hard"}
MLB_WOBA = {"0-0": .393, "1-0": .396, "0-1": .357, "1-1": .373, "2-1": .389, "2-0": .421, "1-2": .179}


def pa_list(ps):
    pas = defaultdict(list)
    for p in ps:
        pas[(p["game"], p["pa"])].append(p)
    return list(pas.values())


def metrics(ps):
    pas = pa_list(ps)
    n = len(pas)
    reach = lambda S: sum(any(x["count"] in S for x in v) for v in pas) / n
    alive2 = [v for v in pas if len(v) >= 2]
    after2 = Counter()
    for v in alive2:
        b, k = v[1]["balls"], v[1]["strikes"]
        r = v[1]["result"]
        b2, k2 = b + (r == "ball"), k + (r in ("cstrike", "whiff") or (r == "foul" and k < 2))
        if r in ("weak", "solid", "hard", "hbp") or v[1]["detail"]:
            after2["ended"] += 1
        else:
            after2[f"{b2}-{k2}"] += 1
    ended2 = sum(len(v) <= 2 and (v[-1]["result"] in ("weak", "solid", "hard", "hbp") or "STRIKEOUT" in v[-1]["detail"]) for v in pas)
    at11 = [x for v in pas for x in v if x["count"] == "1-1"]
    to12 = sum(x["result"] in ("cstrike", "whiff", "foul") for x in at11)
    to21 = sum(x["result"] == "ball" for x in at11)
    three = [v for v in pas if any(x["balls"] == 3 for x in v)]
    off2 = Counter(sum(x["quad"] == "chase" for x in v[:2]) for v in three)
    k = sum("STRIKEOUT" in v[-1]["detail"] for v in pas)
    bb = sum("WALK" in v[-1]["detail"] for v in pas)
    alive_n = len(alive2) - after2["ended"]
    return dict(pas=n, pitchers_count=reach({"0-2", "1-2", "2-2"}), hitters_count=reach({"2-0", "3-0", "3-1"}),
                first_pitch_strike=sum(v[0]["result"] in STRIKE for v in pas) / n,
                early_ball=sum(len(v) >= 2 and v[0]["quad"] == "chase" and v[1]["quad"] == "chase" for v in pas) / n,
                after_two={c: after2[c] / max(1, alive_n) for c in ("0-2", "1-1", "2-0")}, ended_within_two=ended2 / n,
                one_one_to_one_two=to12 / max(1, to12 + to21),
                three_ball_pas=len(three), three_ball_first_two_off={str(i): off2[i] / max(1, len(three)) for i in range(3)},
                k_rate=k / n, bb_rate=bb / n)


def decide(m7, m8):
    a = m8["pitchers_count"] >= m7["pitchers_count"] - 0.01
    b = m8["first_pitch_strike"] >= m7["first_pitch_strike"] - 0.02
    c = m8["early_ball"] <= m7["early_ball"] + 0.03
    return dict(pitchers_count_ok=a, first_pitch_strike_ok=b, early_ball_ok=c, no_engine_change=a and b and c)


def count_values():
    """The engine's count values (runs, v0.8 table at the starting look; v0.7c count values), D3, default starter,
    bases empty, 0 outs, against the MLB wOBA ordering."""
    import engine as e
    import simulate
    from dataclasses import replace
    simulate.STAFF = "default"
    ars = simulate.our_staff()[0]["arsenal"]
    out = {}
    for mode, flags in (("v07", e.FLAGS_V07), ("v08", e.FLAGS_V08)):
        e.set_flags(**flags)
        s = e.Situation(0, 0, 0, (False, False, False), inning=4, level="college_d3", same_side=True, home=True, sched_innings=9)
        if mode == "v08":
            s = replace(s, win=e.win_constants(s))
            tab = e.solve_table(ars, s)
            vals = {f"{b}-{k}": tab.value(b, k, tab.h0, "V") for (b, k) in e.COUNTS}      # value at the starting look
        else:
            rel, _ = e.at_bat_values(ars, s)
            vals = {f"{b}-{k}": v for (b, k), v in rel.items()}
        out[mode] = vals
    return out


def spearman(xs, ys):
    rk = lambda v: {k: i for i, k in enumerate(sorted(v, key=v.get))}
    rx, ry = rk(xs), rk(ys)
    n = len(xs)
    return 1 - 6 * sum((rx[k] - ry[k]) ** 2 for k in xs) / (n * (n * n - 1))


def main():
    argv = sys.argv[1:]
    outdir = argv[argv.index("--out") + 1] if "--out" in argv else "results/step2"
    dirs = [a for a in argv if not a.startswith("--") and a != outdir]
    os.makedirs(outdir, exist_ok=True)
    data = {os.path.basename(os.path.normpath(d)): [p for f in sorted(glob.glob(os.path.join(d, "*.csv"))) for p in R.load(f)] for d in dirs}
    res = {"levels": {}}
    for lv in ("hs", "college_d3", "college_d1"):
        row = {}
        for tag, ps in data.items():
            sub = [p for p in ps if p["level"] == lv]
            row[tag] = dict(games=len({p["game"] for p in sub}), **metrics(sub))
        if "v07" in row and "v08" in row:
            row["decision"] = decide(row["v07"], row["v08"])
        res["levels"][lv] = row
    if "v08" in data:
        why = Counter()
        tot = Counter()
        for p in data["v08"]:
            if p["count"] in ("0-0", "1-0", "0-1", "1-1") and p["why"]:
                head = p["why"].split(":")[0].split("(")[0].strip()
                for key in ("He's sitting", "He's looking", "He's timed", "Changes his eye", "Sets up", "Back to what",
                            "Game situation", "Tying run", "Today's umpire", "He's seen", "Best call", "Only call"):
                    if head.startswith(key):
                        head = key
                        break
                why[(p["count"], head)] += 1
                tot[p["count"]] += 1
        res["early_count_why"] = {c: {h: round(v / tot[c], 3) for (cc, h), v in sorted(why.items(), key=lambda t: -t[1]) if cc == c}
                                  for c in ("0-0", "1-0", "0-1", "1-1")}
    try:
        cv = count_values()
        res["count_values"] = cv
        res["count_value_rank_vs_mlb"] = {m: round(spearman({c: cv[m][c] for c in MLB_WOBA}, MLB_WOBA), 3) for m in cv}
    except Exception as ex:          # reported, never hidden
        res["count_values_error"] = repr(ex)
    json.dump(res, open(os.path.join(outdir, "race_check.json"), "w"), indent=1)
    for lv, row in res["levels"].items():
        print(f"== {lv}: games " + ", ".join(f"{t} {row[t]['games']}" for t in data))
        for t in data:
            m = row[t]
            print(f"   {t}: pitcher's count {m['pitchers_count']:.1%}, hitter's {m['hitters_count']:.1%}, first-pitch strike "
                  f"{m['first_pitch_strike']:.1%}, early-ball {m['early_ball']:.1%}, 1-1 to 1-2 {m['one_one_to_one_two']:.1%}, "
                  f"K {m['k_rate']:.1%}, BB {m['bb_rate']:.1%}; 3-ball PAs whose first two calls were both off the zone "
                  f"{m['three_ball_first_two_off']['2']:.1%}")
        if "decision" in row:
            print(f"   decision rule: {row['decision']}")
    if "count_value_rank_vs_mlb" in res:
        print("count values: rank correlation with MLB wOBA ordering", res["count_value_rank_vs_mlb"])
    elif "count_values_error" in res:
        print("count values not computed:", res["count_values_error"])
    print("v0.8 early-count why lines:", json.dumps(res.get("early_count_why"), indent=0)[:900])


if __name__ == "__main__":
    main()
