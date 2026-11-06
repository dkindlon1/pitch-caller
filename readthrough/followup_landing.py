"""v0.9 follow-up A (Nov 5 night): why v0.9 calls more low breaking balls that aren't landing with a runner on 3rd and
< 2 outs than v0.8 does in the same world (Step 7: 35 vs 14).

For each engine's games it counts, with runner on 3rd and < 2 outs:
  - every low breaking-ball call (SL/CB to down-in, down-away or chase): the denominator
  - the ones the read-through flags (read.py wild_low_breaker_r3: 4+ thrown today, raw strike rate under 50%)
  - for each flagged call, what the engine's landing filter (landing_v09, engine.not_landing) saw: thrown, strikes, the
    shrunk estimate, and whether the filter would block it. The simulator's pitches carry no strike_rate, so the shrink
    centre is engine.LAND_CENTER (0.58 for off-speed), exactly what the engine used.
  - the same calls under alternative filter thresholds (counting only; a threshold change needs new games to measure).
usage (repo root): python3 readthrough/followup_landing.py runs/readthrough/v08_in_v09w runs/readthrough/v09 [--out FILE]"""
import glob, os, sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine as e
from read import load, reported

LOW = ("down-in", "down-away", "chase")


def est(st, th, center=e.LAND_CENTER["OS"]):
    return (center * e.LAND_K + st) / (e.LAND_K + th)


def blocked(p, n_min, est_max):
    """Would a landing filter with these thresholds leave this call out? (chase still allowed with 2 strikes, < 3 balls)"""
    if p["land_thrown"] < n_min or est(p["land_strikes"], p["land_thrown"]) > est_max:
        return False
    return not (p["strikes"] == 2 and p["balls"] < 3 and p["quad"] == "chase")


_GAMES = {}


def standdown(p):
    """The filter stands down when every pitch he has is not landing. Lists his other pitches' landing at that moment
    (pitches he has thrown today in this game; one he hasn't thrown counts as landing)."""
    rows = _GAMES[p["game"]]
    land = defaultdict(lambda: [0, 0])
    for r in rows:
        if r is p:
            break
        if r["pitcher"] == p["pitcher"]:
            land[r["pitch_name"]][1] += 1
            land[r["pitch_name"]][0] += r["result"] in ("cstrike", "whiff", "foul", "weak", "solid", "hard")
    others = {n: v for n, v in land.items() if n != p["pitch_name"]}
    bad = {n: e.LAND_CENTER["FB" if "Fastball" in n or "Sinker" in n else "OS"] for n in others}
    txt = ", ".join(f"{n} {st}/{th} est {est(st, th, bad[n]):.2f}" for n, (st, th) in others.items())
    allbad = others and all(th >= e.LAND_BLOCK_N and est(st, th, bad[n]) <= e.LAND_BLOCK_EST for n, (st, th) in others.items())
    return ("all his pitches not landing (" if allbad else "NOT explained (") + txt + ")"


def analyse(d):
    pitches = []
    for f in sorted(glob.glob(os.path.join(d, "*.csv"))):
        g = load(f)
        _GAMES[g[0]["game"]] = g
        pitches += g
    r3 = [p for p in pitches if p["r3"] and p["outs"] < 2]
    low = [p for p in r3 if p["kind"] in ("SL", "CB") and p["quad"] in LOW]
    flag = [p for p in low if "wild_low_breaker_r3" in reported(p)]
    brk = [p for p in pitches if p["kind"] in ("SL", "CB")]
    games = len({p["game"] for p in pitches})
    return dict(dir=d, games=games, pitches=len(pitches), r3_pitches=len(r3), low_brk_r3=len(low), flagged=flag,
                brk_share=len(brk) / len(pitches), brk_low_share=sum(p["quad"] in LOW for p in brk) / max(1, len(brk)),
                r3_low_share=len(low) / max(1, len(r3)),
                land_dist=Counter((p["land_thrown"] >= 4, p["land_thrown"] and p["land_strikes"] / p["land_thrown"] < 0.5) for p in low))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    if out in args:
        args.remove(out)
    L = ["v0.9 follow-up A: low breaking balls not landing, runner on 3rd, < 2 outs", ""]
    R = [analyse(d) for d in args]
    L.append(f"{'':34s}" + "".join(f"{os.path.basename(r['dir'].rstrip('/')):>16s}" for r in R))
    rows = [("games", "games", "{:d}"), ("pitches", "pitches", "{:d}"), ("R3 < 2 outs pitches", "r3_pitches", "{:d}"),
            ("  low SL/CB calls there", "low_brk_r3", "{:d}"), ("  share of R3 pitches", "r3_low_share", "{:.1%}"),
            ("breaking-ball share, all pitches", "brk_share", "{:.1%}"), ("  share of them low", "brk_low_share", "{:.1%}")]
    for lab, k, fmt in rows:
        L.append(f"{lab:34s}" + "".join(f"{fmt.format(r[k]):>16s}" for r in R))
    L.append(f"{'flagged (read.py rule)':34s}" + "".join(f"{len(r['flagged']):>16d}" for r in R))
    L.append(f"{'  share of low R3 breakers':34s}" + "".join(f"{len(r['flagged']) / max(1, r['low_brk_r3']):>16.1%}" for r in R))
    L.append("")
    L.append("Landing record behind the low R3 breaking-ball calls (4+ thrown today, raw strike rate under 50%):")
    for r in R:
        dd = r["land_dist"]
        L.append(f"  {os.path.basename(r['dir'].rstrip('/')):16s} under 4 thrown {dd[(False, True)] + dd[(False, False)] + dd.get((False, 0), 0):4d}"
                 f" | 4+ and >= 50% {dd[(True, False)]:4d} | 4+ and < 50% (flagged) {dd[(True, True)]:4d}")
    L.append("")
    alts = [("as built: 4+ thrown, shrunk est <= 0.40", 4, 0.40), ("shrunk est <= 0.45", 4, 0.45),
            ("shrunk est <= 0.48", 4, 0.48), ("shrunk est <= 0.50", 4, 0.50)]
    L.append("How many flagged calls each filter threshold would have left out (counting only, games not replayed):")
    for lab, n, x in alts:
        L.append(f"  {lab:42s}" + "".join(f"{sum(blocked(p, n, x) for p in r['flagged']):>8d} of {len(r['flagged']):<4d}" for r in R))
    L.append("")
    for r in R:
        L.append(f"Flagged calls, {os.path.basename(r['dir'].rstrip('/'))} ({len(r['flagged'])}):")
        L.append(f"  {'game':28s} {'pa':>3s} {'count':>5s} {'call':24s} {'landing':>8s} {'raw':>5s} {'est':>5s} filter")
        for p in r["flagged"]:
            st, th = p["land_strikes"], p["land_thrown"]
            why = ("blocks, unless: " + standdown(p)) if blocked(p, e.LAND_BLOCK_N, e.LAND_BLOCK_EST) else "allows (est > 0.40)" if est(st, th) > e.LAND_BLOCK_EST else "allows (2-strike chase)"
            L.append(f"  {p['game']:28s} {p['pa']:3d} {p['count']:>5s} {p['call']:24s} {st:3d}/{th:<4d} {st / th:5.0%} {est(st, th):5.2f} {why}")
        L.append("")
    txt = "\n".join(L)
    print(txt)
    if out:
        open(out, "w").write(txt + "\n")


if __name__ == "__main__":
    main()
