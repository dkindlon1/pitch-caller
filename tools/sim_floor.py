"""v1.0 simulator floor (PLAN_v1.0.md 1.4): two folders of simulated games, paired game by game (same file names = same
level, staff and seed). Prints the paired mean difference (B minus A) and its SE for regret_w_exp, runs, pitches, and
walks / strikeouts / HBP / wild pitches per batter, overall and by level, plus the one-sided 95% upper bound on the
regret difference and the 0.25-run budget check (Phase 5).
usage (repo root): python3 tools/sim_floor.py DIR_A DIR_B [--out results/sim_floor_<tag>.txt] [--budget 0.25]
Reuses readthrough/step7_regret.py's per-game sums and pairing."""
import csv, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "readthrough"))
import step7_regret as R

EVENTS = {"walks": "WALK", "strikeouts": "STRIKEOUT", "hbp": "HIT BY PITCH", "wild_pitches": "wild pitch"}
IN_PLAY = ("weak", "solid", "hard")


def batters(fn):
    """Plate appearances that ended in the log, and the counted events."""
    n, ev = 0, {k: 0 for k in EVENTS}
    for r in csv.DictReader(open(fn)):
        if not r.get("quad"):
            continue
        d = r.get("detail", "")
        for k, tag in EVENTS.items():
            ev[k] += tag in d
        n += ("WALK" in d) or ("STRIKEOUT" in d) or ("HIT BY PITCH" in d) or r["result"] in IN_PLAY
    return n, ev


def game(fn):
    g, _, _ = R.game(fn)
    n, ev = batters(fn)
    out = dict(regret_w_exp=g.get("regret_w_exp", float("nan")), runs=g["runs"], pitches=g["pitches"], batters=n)
    for k, v in ev.items():
        out[k + "_per_batter"] = v / n if n else 0.0
    return out


METRICS = ["regret_w_exp", "runs", "pitches", "batters", "walks_per_batter", "strikeouts_per_batter", "hbp_per_batter",
           "wild_pitches_per_batter"]


def main():
    A, B = sys.argv[1], sys.argv[2]
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    budget = float(sys.argv[sys.argv.index("--budget") + 1]) if "--budget" in sys.argv else 0.25
    names = sorted(n for n in set(os.listdir(A)) & set(os.listdir(B)) if n.endswith(".csv"))
    if not names:
        raise SystemExit("no paired games")
    GA = {n: game(os.path.join(A, n)) for n in names}
    GB = {n: game(os.path.join(B, n)) for n in names}
    L = [f"sim floor: {A} (A) vs {B} (B): {len(names)} paired games; B minus A, SE over games"]
    summary = {}
    for lvl in ("", "hs", "college_d3", "college_d1"):
        ns = [n for n in names if n.startswith(lvl)] if lvl else names
        if not ns:
            continue
        L.append(f"\n[{lvl or 'all'}] {len(ns)} games")
        L.append(f"  {'':26s}{'A':>10s}{'B':>10s}{'diff':>10s}{'SE':>9s}")
        for m in METRICS:
            a, b, d, se = R.paired([GA[n][m] for n in ns], [GB[n][m] for n in ns])
            pct = m.endswith("_per_batter")
            f = (lambda x: f"{100 * x:10.2f}") if pct else (lambda x: f"{x:10.3f}")
            L.append(f"  {m + (' (%)' if pct else ''):26s}{f(a)}{f(b)}{f(d)}{(f(se))[1:]}")
            if not lvl:
                summary[m] = (a, b, d, se)
    a, b, d, se = summary["regret_w_exp"]
    ub = d + 1.645 * se
    L.append(f"\nregret_w_exp per game: paired increase {d:+.3f} (SE {se:.3f}), one-sided 95% upper bound {ub:+.3f}; "
             f"budget +{budget:.2f}: {'PASS' if d <= budget else 'FAIL'}")
    txt = "\n".join(L) + "\n"
    print(txt)
    if out:
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        open(out, "w").write(txt)
    sys.exit(0 if d <= budget else 1)


if __name__ == "__main__":
    main()
