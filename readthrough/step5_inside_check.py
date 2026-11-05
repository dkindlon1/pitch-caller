"""v0.9 Step 5 (item 3 widened, inside frequency): what MLB fastballs and off-speed do inside vs away, by height, against
what the engine's outcome model gives for the same targets. Report only (no ship rule): it says whether the engine's
in/away difference is in its swing-and-contact model or only in hit-by-pitch risk.
Statcast side uses seq_fit.quad() on the actual location (in = toward the batter). Engine side: MLB level, each count's
own outcome probabilities at every quad target, default hitter, opposite and same side averaged, weighted by how often
MLB pitches arrive in that quad in that count.
usage (repo root): python3 readthrough/step5_inside_check.py -> results/step5/inside_check.txt and .json"""
import json, os, sys
from collections import defaultdict
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[:0] = [HERE, ROOT]
import seq_fit as S
import engine as e
import simulate

OUT = os.path.join(ROOT, "results", "step5")
Q4 = ["up-in", "up-away", "down-in", "down-away"]
lines = []


def say(*a):
    t = " ".join(str(x) for x in a); print(t, flush=True); lines.append(t)


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = [r for r in S.load() if all(v == v for v in (r["x"], r["z"], r["top"], r["bot"]))]
    st = defaultdict(lambda: defaultdict(float))
    cnt_w = defaultdict(lambda: defaultdict(float))
    for r in rows:
        q = S.quad(r)
        if q not in Q4:
            continue
        c = "FB" if r["c"] == "FB" else "OS"
        a = st[(c, q)]
        a["n"] += 1
        sw = r["desc"] in S.SWING
        a["sw"] += sw
        a["wh"] += r["desc"] in S.WHIFF
        a["cs"] += r["desc"] == "called_strike"
        a["hbp"] += r["desc"] == "hit_by_pitch"
        if r["desc"] == "hit_into_play" and r["ls"] == r["ls"]:
            a["bip"] += 1; a["hard"] += r["ls"] >= 95
        cnt_w[c][(r["b"], r["k"], q)] += 1
    say("MLB Statcast (2024-25 sample), by where the pitch arrived:")
    say(f"  {'':10s} {'n':>7s} {'swing':>6s} {'whiff/sw':>9s} {'called K':>9s} {'hard/BIP':>9s} {'HBP':>7s}")
    out = {}
    for c in ("FB", "OS"):
        for q in Q4:
            a = st[(c, q)]
            v = dict(n=a["n"], swing=a["sw"] / a["n"], whiff_sw=a["wh"] / a["sw"], cstrike=a["cs"] / a["n"],
                     hard_bip=a["hard"] / max(1, a["bip"]), hbp=a["hbp"] / a["n"])
            out[f"mlb|{c}|{q}"] = v
            say(f"  {c} {q:9s}{v['n']:7.0f} {v['swing']:6.1%} {v['whiff_sw']:9.1%} {v['cstrike']:9.1%} {v['hard_bip']:9.1%} {v['hbp']:7.2%}")
    e.set_flags(**e.FLAGS_V08)
    simulate.STAFF = "default"
    ars = simulate.our_staff()[0]["arsenal"]
    say("\nEngine v0.8 (MLB level, 3-pitch starter, called at that target, both sides averaged, MLB count mix):")
    say(f"  {'':10s} {'swing':>6s} {'whiff/sw':>9s} {'called K':>9s} {'hard/BIP':>9s} {'HBP':>7s}")
    for c in ("FB", "OS"):
        pits = [x for x in ars if (x.kind == "FB") == (c == "FB")]
        for q in Q4:
            tot = defaultdict(float); wsum = 0.0
            for (b, k, qq), w in cnt_w[c].items():
                if qq != q or b > 3 or k > 2:
                    continue
                for same in (True, False):
                    s = e.Situation(b, k, 0, (False, False, False), level="mlb", same_side=same, inning=4, batters_faced=4)
                    for p in pits:
                        stats = defaultdict(float)
                        P = e.outcome_probs(p, q, s, ars, stats=stats)
                        ww = w / (2 * len(pits))
                        contact = P["weak"] + P["solid"] + P["hard"]
                        swing = P["whiff"] + P["foul"] + contact
                        tot["sw"] += ww * swing; tot["wh"] += ww * P["whiff"]; tot["cs"] += ww * P["cstrike"]
                        tot["bip"] += ww * contact; tot["hard"] += ww * P["hard"]; tot["hbp"] += ww * P["hbp"]
                        wsum += ww
            v = dict(swing=tot["sw"] / wsum, whiff_sw=tot["wh"] / tot["sw"], cstrike=tot["cs"] / wsum, hard_bip=tot["hard"] / tot["bip"],
                     hbp=tot["hbp"] / wsum)
            out[f"engine|{c}|{q}"] = v
            say(f"  {c} {q:9s} {v['swing']:6.1%} {v['whiff_sw']:9.1%} {v['cstrike']:9.1%} {v['hard_bip']:9.1%} {v['hbp']:7.2%}")
    say("\nInside minus away (same height), MLB vs engine:")
    for c in ("FB", "OS"):
        for h in ("up", "down"):
            m = {k: out[f"mlb|{c}|{h}-in"][k] - out[f"mlb|{c}|{h}-away"][k] for k in ("swing", "whiff_sw", "cstrike", "hard_bip", "hbp")}
            g = {k: out[f"engine|{c}|{h}-in"][k] - out[f"engine|{c}|{h}-away"][k] for k in m}
            say(f"  {c} {h:4s} " + "  ".join(f"{k} {m[k]:+.1%} vs {g[k]:+.1%}" for k in m))
    json.dump(out, open(os.path.join(OUT, "inside_check.json"), "w"), indent=1)
    open(os.path.join(OUT, "inside_check.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
