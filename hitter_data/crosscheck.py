"""v1.3 full data, Task B step 2: the repo's numbers next to Claude's independent cross-check (claude.ai, Nov 22).

Like-for-like (Drew, Nov 22): Claude's college numbers come from the packaged snapshot (119,021 games), so the college
rows here are computed on those games only (ids in {DATA}/college/crosscheck/snapshot_game_ids.json; the snapshot is a
strict subset of the live archive with identical digests). The HS zip and the live DiamondKast export are the same
21,707 games. The fits use the full live archive; this only counts. 2026 is never read (seasons <= 2025 only).

Definitions follow Claude's notes (docs/RESEARCH_college_data_analysis_2026-11-22.md, RESEARCH_hs_...):
- full game: at least 90% of PAs have a consistent string, a first-pitch "(0-0)" ball in play counting (the repo's
  quality.py / represent.is_full rule, canonical games only).
- count replay (college): PAs whose letters replay to the box score's count, over PAs with letters (pa.count_ok; the
  same share the update's quality summary prints).
- PA rates: K (incl. dropped third strike reached), BB (incl. IBB), HBP per PA, all canonical games of the season.
- whiff per swing (college): full games, fit seasons (<= 2025); swing = S + F letters + the ball in play; whiff = S.
- HS: seasons 2022-25; PA rates over PAs with a result; per pitch swing = S / F / X, whiff = S.

    python -m hitter_data.crosscheck [--all-games]   # --all-games: also the live archive's numbers (no restriction)
"""
import argparse, json, os, sqlite3, sys
from collections import defaultdict
from . import DATA
from .represent import is_full, K_CODES, BB_CODES

COLLEGE = os.path.join(DATA, "college", "college.sqlite3")
HS = os.path.join(DATA, "hs", "hs.sqlite3")
IDS = os.path.join(DATA, "college", "crosscheck", "snapshot_game_ids.json")
OUT = os.path.join(DATA, "college", "crosscheck")

# check -> (Claude's number, tolerance, unit); numbers in percent / games
CLAUDE = {
    "count_replay": (98.5, 1.0, "pt"),
    "full_share_2025": ({"D1": 0.657, "D2": 0.295, "D3": 0.101}, 0.03, "abs"),
    "full_games_2025": ({"D1": 6226, "D2": 1880, "D3": 689}, 0.05, "rel"),
    "pa_2025": ({"D1": (19.3, 11.4, 3.5), "D2": (17.3, 11.2, 3.7), "D3": (16.4, 11.1, 4.1)}, 0.5, "pt"),
    "whiff_sw": ({"D1": 22.4, "D2": 21.6, "D3": 20.1}, 0.5, "pt"),
    "hs_pa": ((20.33, 14.54, 3.55), 0.3, "pt"),
    "hs_pitch": ((40.7, 24.6), 0.3, "pt"),
    "hs_replay": (99.6, 0.3, "pt"),
}
K_ALL = set(K_CODES) | {"K_S_reached", "K_L_reached"}


def ro(p):
    return sqlite3.connect("file:" + p.replace("\\", "/") + "?mode=ro", uri=True, timeout=60)


def college(restrict=True):
    con = ro(COLLEGE)
    keep = set(json.load(open(IDS))) if restrict else None
    games = {}
    for gid, lv, season, pas, pf, pz, cc, cok in con.execute(
            "SELECT g.id, g.level, g.season, q.pas, q.pas_full, q.pas_zero_count, q.count_checked, q.count_ok "
            "FROM games g JOIN game_qc q ON q.game_id=g.id WHERE g.canonical=1 AND g.season<=2025"):
        if keep is not None and gid not in keep:
            continue
        if lv not in ("D1", "D2", "D3"):
            continue
        games[gid] = (lv, int(season), is_full(pas, pf, pz), cc or 0, cok or 0)
    r = {"games": len(games)}
    tot, full = defaultdict(int), defaultdict(int)
    for lv, s, f, *_ in games.values():
        if s == 2025:
            tot[lv] += 1
            full[lv] += f
    r["games_2025"] = dict(tot)
    r["full_games_2025"] = dict(full)
    r["full_share_2025"] = {lv: full[lv] / tot[lv] for lv in tot if tot[lv]}
    pa = defaultdict(lambda: [0, 0, 0, 0])
    sw = defaultdict(lambda: [0, 0])
    cc = cok = 0
    for gid, res, letters, ip, b, k, ok in con.execute(
            "SELECT game_id, result, pitches, in_play, balls, strikes, count_ok FROM pa"):
        g = games.get(gid)
        if not g:
            continue
        lv, s, f = g[0], g[1], g[2]
        if ok is not None:
            cc += 1
            cok += ok == 1
        if s == 2025:
            c = pa[lv]
            c[0] += 1
            c[1] += res in K_ALL
            c[2] += res in BB_CODES
            c[3] += res == "HBP"
        if f and letters is None and b == 0 and k == 0 and ip:
            sw[lv][1] += 1                      # first-pitch ball in play: "(0-0)", no letters, one swing
        elif f and letters:
            w = letters.count("S")
            sw[lv][0] += w
            sw[lv][1] += w + letters.count("F") + (1 if ip else 0)
    r["count_replay"] = 100 * cok / cc if cc else None
    r["count_replay_n"] = cc
    # the same share over every season incl. 2026 (counted only, like the update's quality summary and Claude's 98.5%)
    a_ok = a_n = 0
    for gid, ok in con.execute("SELECT p.game_id, p.count_ok FROM pa p JOIN games g ON g.id=p.game_id "
                               "WHERE g.canonical=1 AND p.count_ok IS NOT NULL"):
        if keep is None or gid in keep:
            a_n += 1
            a_ok += ok == 1
    r["count_replay_all_seasons"] = 100 * a_ok / a_n
    r["pa_2025"] = {lv: (100 * c[1] / c[0], 100 * c[2] / c[0], 100 * c[3] / c[0], c[0]) for lv, c in pa.items()}
    r["whiff_sw"] = {lv: (100 * a / b, b) for lv, (a, b) in sw.items()}
    return r


def hs():
    con = ro(HS)
    seasons = "season BETWEEN 2022 AND 2025"
    k = bb = hbp = n = 0
    for (res,) in con.execute(f"SELECT p.result FROM hs_pa p JOIN hs_games g USING(game_id) WHERE g.{seasons} "
                              "AND p.result IS NOT NULL"):
        n += 1
        k += res in K_ALL
        bb += res in BB_CODES
        hbp += res == "HBP"
    pitches = swings = whiffs = hbp_p = 0
    for letter, cnt in con.execute(f"SELECT p.letter, count(*) FROM hs_pitch p JOIN hs_games g USING(game_id) "
                                   f"WHERE g.{seasons} AND p.letter IN ('B','K','S','F','X','H') GROUP BY 1"):
        pitches += cnt
        if letter in "SFX":
            swings += cnt
        if letter == "S":
            whiffs += cnt
        if letter == "H":
            hbp_p += cnt
    cc, cok = con.execute(f"SELECT sum(q.count_checked), sum(q.count_ok) FROM hs_game_qc q JOIN hs_games g USING(game_id) "
                          f"WHERE g.{seasons}").fetchone()
    ng = con.execute(f"SELECT count(*) FROM hs_games WHERE {seasons}").fetchone()[0]
    return {"games": ng, "pa": n, "pa_rates": (100 * k / n, 100 * bb / n, 100 * hbp / n), "pitches": pitches,
            "swing": 100 * swings / pitches, "swing_no_hbp": 100 * swings / (pitches - hbp_p), "whiff_sw": 100 * whiffs / swings, "replay": 100 * cok / cc, "replay_n": cc}


def compare(c, h):
    rows = []

    def add(name, repo, claude, tol, unit):
        gap = repo - claude
        lim = tol * claude if unit == "rel" else tol
        rows.append(dict(check=name, repo=repo, claude=claude, gap=gap, tolerance=lim, within=abs(gap) <= lim + 1e-12))
    v, tol, u = CLAUDE["count_replay"]
    add("college count replay consistent, all seasons incl. 2026 counted only (% of strings)", c["count_replay_all_seasons"], v, tol, u)
    add("college count replay consistent, seasons <= 2025 (% of strings)", c["count_replay"], v, tol, u)
    v, tol, u = CLAUDE["full_share_2025"]
    for lv in ("D1", "D2", "D3"):
        add(f"full-game share 2025 {lv}", c["full_share_2025"].get(lv, 0), v[lv], tol, u)
    v, tol, u = CLAUDE["full_games_2025"]
    for lv in ("D1", "D2", "D3"):
        add(f"full games 2025 {lv}", c["full_games_2025"].get(lv, 0), v[lv], tol, u)
    v, tol, u = CLAUDE["pa_2025"]
    for lv in ("D1", "D2", "D3"):
        for i, nm in enumerate(("K", "BB", "HBP")):
            add(f"PA rate 2025 {lv} {nm} %", c["pa_2025"][lv][i], v[lv][i], tol, u)
    v, tol, u = CLAUDE["whiff_sw"]
    for lv in ("D1", "D2", "D3"):
        add(f"whiff per swing, full games <= 2025, {lv} %", c["whiff_sw"][lv][0], v[lv], tol, u)
    v, tol, u = CLAUDE["hs_pa"]
    for i, nm in enumerate(("K", "BB", "HBP")):
        add(f"HS 2022-25 PA rate {nm} %", h["pa_rates"][i], v[i], tol, u)
    v, tol, u = CLAUDE["hs_pitch"]
    add("HS 2022-25 swing % (hit-by-pitch pitches in the denominator)", h["swing"], v[0], tol, u)
    add("HS 2022-25 swing % (hit-by-pitch pitches left out, as Claude's)", h["swing_no_hbp"], v[0], tol, u)
    add("HS 2022-25 whiff per swing %", h["whiff_sw"], v[1], tol, u)
    v, tol, u = CLAUDE["hs_replay"]
    add("HS count replay vs scorecard count %", h["replay"], v, tol, u)
    return rows


def md(rows, c, h, label):
    L = [f"### Cross-check ({label})", "", f"College games counted: {c['games']:,} (canonical, seasons <= 2025); "
         f"HS games 2022-25: {h['games']:,}.", "",
         "| Check | Repo | Claude | Gap | Tolerance | Within |", "|---|---|---|---|---|---|"]
    for r in rows:
        f = (lambda x: f"{x:,.0f}") if r["check"].startswith("full games") else (
            (lambda x: f"{x:.3f}") if "share" in r["check"] else (lambda x: f"{x:.2f}"))
        L.append(f"| {r['check']} | {f(r['repo'])} | {f(r['claude'])} | {r['gap']:+.3f} | {r['tolerance']:.3g} | "
                 f"{'yes' if r['within'] else '**no**'} |")
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--all-games", action="store_true")
    a = ap.parse_args(argv)
    h = hs()
    out = {}
    text = ""
    for label, restrict in [("snapshot's games: like-for-like", True)] + ([("live archive, all games", False)] if a.all_games else []):
        c = college(restrict)
        rows = compare(c, h)
        out[label] = dict(college=c, hs=h, rows=rows)
        text += md(rows, c, h, label) + "\n"
    os.makedirs(OUT, exist_ok=True)
    json.dump(out, open(os.path.join(OUT, "crosscheck.json"), "w"), indent=1, default=str)
    open(os.path.join(OUT, "crosscheck.md"), "w", encoding="utf-8", newline="\n").write(text)
    print(text)


if __name__ == "__main__":
    main()
