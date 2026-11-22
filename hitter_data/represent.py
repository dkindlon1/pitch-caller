"""v1.3 task D: are full-pitch-string games representative of all games?

Per level x season, canonical games only (one copy per game). A game is "full" by the corrected coverage rule of
quality.py (at least 90% of its plate appearances have letters, a first-pitch "(0-0)" in play counting as complete).
For full games, the rest, and all games: K%, BB% (incl. intentional), HBP% per plate appearance, runs per game (box
score; the parsed runs when the box is missing) and home runs per game. Standard errors treat the game as the unit
(ratio estimator, delta method), so the per-PA rates are clustered by game. The difference is full minus the rest,
with its SE and z. This only counts: no fit or tuning, so 2026 may appear (it stays held out of every fit).

    python -m hitter_data.represent        # writes reports/representativeness.csv and prints the summary
"""
import csv, math, os, sqlite3, sys
from collections import defaultdict
from . import DATA
from .quality import OUT

DB = os.path.join(DATA, "college", "college.sqlite3")
K_CODES = ("K", "K_S", "K_L", "K_reached", "K_S_reached", "K_L_reached")
BB_CODES = ("BB", "IBB")


def is_full(pas, pas_full, pas_zero):
    adj = (pas_full or 0) + ((pas_zero or 0) if pas_full else 0)
    return bool(pas) and adj >= 0.9 * pas


def ratio(num, den):
    """Ratio of sums with a game-clustered SE (delta method). num, den: per-game lists."""
    n = len(num)
    if n < 2 or sum(den) == 0:
        return None, None
    r = sum(num) / sum(den)
    dbar = sum(den) / n
    var = sum((a - r * b) ** 2 for a, b in zip(num, den)) / (n - 1) / n / dbar ** 2
    return r, math.sqrt(var)


def games(con):
    """One row per canonical, parsed game: (level, season, full, pa, k, bb, hbp, runs, hr)."""
    per = defaultdict(lambda: [0, 0, 0, 0, 0, 0])
    q = ("SELECT p.game_id, p.result, p.runs_on_play FROM pa p JOIN games g ON g.id=p.game_id "
         "WHERE g.canonical=1")
    for gid, res, runs in con.execute(q):
        c = per[gid]
        c[0] += 1
        c[1] += res in K_CODES
        c[2] += res in BB_CODES
        c[3] += res == "HBP"
        c[4] += res == "HR"
        c[5] += runs or 0
    out = []
    for gid, lv, season, ar, hr_, pas, pf, pz in con.execute(
            "SELECT g.id, g.level, g.season, g.away_runs, g.home_runs, q.pas, q.pas_full, q.pas_zero_count "
            "FROM games g JOIN game_qc q ON q.game_id=g.id WHERE g.canonical=1"):
        c = per.get(gid)
        if not c or not c[0]:
            continue
        try:
            runs = int(ar) + int(hr_)   # the box score; some sites store it as text
        except (TypeError, ValueError):
            runs = c[5]
        out.append((lv or "Unknown", season or "Unknown", is_full(pas, pf, pz), c[0], c[1], c[2], c[3], runs, c[4]))
    return out


METRICS = [("K%", 4, 3), ("BB%", 5, 3), ("HBP%", 6, 3), ("runs/game", 7, None), ("HR/game", 8, None)]


def summarize(rows):
    groups = defaultdict(list)
    for r in rows:
        groups[(r[0], r[1])].append(r)
    out = []
    for (lv, season), gs in sorted(groups.items(), key=lambda kv: (str(kv[0][0]), str(kv[0][1]))):
        full = [g for g in gs if g[2]]
        rest = [g for g in gs if not g[2]]
        line = [lv, season, len(gs), len(full), f"{len(full) / len(gs):.3f}"]
        for name, i, d in METRICS:
            stats = []
            for part in (full, gs, rest):
                num = [g[i] for g in part]
                den = [g[d] if d is not None else 1 for g in part]
                stats.append(ratio(num, den))
            (rf, sf), (ra, sa), (rr, sr) = stats
            if rf is not None and rr is not None:
                diff = rf - rr; sd = math.sqrt(sf ** 2 + sr ** 2); z = diff / sd if sd else float("nan")
            else:
                diff = sd = z = None
            fmt = (lambda x: "" if x is None else f"{x:.4f}")
            line += [fmt(rf), fmt(sf), fmt(ra), fmt(sa), fmt(diff), fmt(sd), "" if z is None else f"{z:.1f}"]
        out.append(line)
    return out


def header():
    h = ["level", "season", "distinct_games", "full_games", "full_share"]
    for name, _, _ in METRICS:
        h += [f"{name} full", f"{name} full SE", f"{name} all", f"{name} all SE", f"{name} full-rest",
              f"{name} diff SE", f"{name} z"]
    return h


def main(argv=()):
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    table = summarize(games(con))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "representativeness.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header()); w.writerows(table)
    for r in table:
        if r[0] in ("D1", "D2", "D3") and str(r[1]) >= "2015":
            zs = [r[5 + 7 * k + 6] for k in range(len(METRICS))]
            print(r[0], r[1], "games", r[2], "full", r[3], r[4], "z(full-rest) K,BB,HBP,R,HR:", " ".join(zs))
    print("wrote", path)


if __name__ == "__main__":
    main(sys.argv[1:])
