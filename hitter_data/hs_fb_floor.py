"""v1.3 (Drew's Nov 23 ruling 8): the HS / travel fastball-share floor by count, and the college report-only comparison.

HS (wired): for every pitcher-season in the HS / travel fit seasons (hs.sqlite3, 2022-25: the games the HS count fit reads,
full_log = 1 and parsed), the share of his typed pitches in a count that are fastballs ("Fastball"; the engine's FB / SI /
FC all map to it). Pitcher-seasons with at least MIN_N typed pitches in that count count; the floor is the 10th percentile
of their shares (each pitcher-season once). Untyped pitches are left out of both sides; "Other" / knuckle count as
not-fastball. The table goes into count_<v>.json levels.hs.fb_floor (engine.fb_floor; travel reads hs).

College (report only, never wired): the same statistic on Statcast Single-A and AAA pitcher usage (2021-25 / 2023-25,
regular season; FF / FA / SI / FT / FC = fastball), beside the college engines' fastball share by count in the as-built
sims, and what the same guard would change.

    python -m hitter_data.hs_fb_floor            # -> {DATA}/fits/hs/fb_floor_thru2025.json (+ college report)
"""
import json
import os
import sqlite3
import sys
from collections import defaultdict

import numpy as np

from . import DATA, assert_not_heldout

HS_DB = os.path.join(DATA, "hs", "hs.sqlite3")
OUT = os.path.join(DATA, "fits", "hs", "fb_floor_thru2025.json")
SEASONS = (2022, 2023, 2024, 2025)
CK = [f"{b}-{k}" for k in range(3) for b in range(4)]
Q = 10.0              # the percentile (ruling 8: the most off-speed-heavy real pitchers)
MIN_N = 10            # typed pitches in that count for a pitcher-season to count (every count then has >= 30 pitchers)
SENS = (8, 15, 25)    # sensitivity: the floor at other minimums
SC_FB = ("FF", "FA", "SI", "FT", "FC")


def hs_shares(thru=2025):
    """{count: [(fastballs, typed pitches)] per pitcher-season}, fit seasons <= thru"""
    seasons = tuple(x for x in SEASONS if x <= thru)
    for s in seasons:
        assert_not_heldout(s)
    con = sqlite3.connect(f"file:{HS_DB}?mode=ro", uri=True)
    q = f"""SELECT p.pitcher_id, g.season, p.balls, p.strikes, SUM(p.pitch_type = 'Fastball'), COUNT(*)
            FROM hs_pitch p JOIN hs_games g USING(game_id) JOIN hs_game_qc q USING(game_id)
            WHERE g.season IN ({','.join('?' * len(seasons))}) AND q.full_log = 1 AND g.parsed IS NOT NULL
              AND COALESCE(p.count_ok, 1) = 1 AND p.balls BETWEEN 0 AND 3 AND p.strikes BETWEEN 0 AND 2
              AND p.pitch_type IS NOT NULL AND p.pitcher_id IS NOT NULL AND p.pitcher_id != ''
            GROUP BY 1, 2, 3, 4"""
    D = defaultdict(list)
    for pid, s, b, k, fb, n in con.execute(q, seasons):
        D[f"{b}-{k}"].append((int(fb), int(n)))
    return D


def floor_from(D, min_n=MIN_N, q=Q):
    out = {}
    for ck in CK:
        sh = [fb / n for fb, n in D[ck] if n >= min_n]
        out[ck] = dict(floor=round(float(np.percentile(sh, q)), 4) if sh else None, n_pitchers=len(sh),
                       median=round(float(np.median(sh)), 4) if sh else None,
                       pooled=round(sum(fb for fb, n in D[ck]) / max(1, sum(n for fb, n in D[ck])), 4))
    return out


def floor_table(thru=2025):
    """the engine table {count: floor} from the fit seasons <= thru (score_core's thru2024 copy stays out of sample)"""
    t = floor_from(hs_shares(thru))
    return {ck: t[ck]["floor"] for ck in CK}


def statcast_shares(level, seasons):
    import pandas as pd
    d = pd.concat([pd.read_parquet(os.path.join(DATA, "refit", "cache", f"{level}_{s}.parquet"),
                                   columns=["pitcher", "game_year", "pitch_type", "game_type", "balls", "strikes"])
                   for s in seasons], ignore_index=True)
    d = d[(d.game_type.fillna("R") == "R") & d.pitch_type.notna() & d.balls.between(0, 3) & d.strikes.between(0, 2)]
    d["fb"] = d.pitch_type.astype(str).isin(SC_FB)
    g = d.groupby(["pitcher", "game_year", "balls", "strikes"]).agg(fb=("fb", "sum"), n=("fb", "size")).reset_index()
    D = defaultdict(list)
    for r in g.itertuples(index=False):
        D[f"{int(r.balls)}-{int(r.strikes)}"].append((int(r.fb), int(r.n)))
    return D


def engine_fb_share(level, variant="base"):
    """the as-built sims' fastball share of pitches by count (kgap_diag sims: n_cls per count)."""
    d = os.path.join(DATA, "kgap_diag", "sims", f"{level}__{variant}")
    acc = defaultdict(lambda: [0, 0])
    for fn in os.listdir(d):
        if fn.startswith("game_") and fn.endswith(".json"):
            g = json.load(open(os.path.join(d, fn), encoding="utf-8"))
            for ck, r in g["counts"].items():
                acc[ck][0] += r["n_cls"]["FB"]
                acc[ck][1] += r["n_cls"]["FB"] + r["n_cls"]["OS"]
    return {ck: (acc[ck][0] / acc[ck][1] if acc[ck][1] else None) for ck in CK}, {ck: acc[ck][1] for ck in CK}


def main(argv=()):
    D = hs_shares()
    main_t = floor_from(D)
    res = dict(about=("v1.3 ruling 8: HS / travel fastball-share floor by count = the 10th percentile of pitcher-season "
                      f"fastball share in that count (hs.sqlite3 {SEASONS[0]}-{SEASONS[-1]}, full-log parsed games, typed "
                      f"pitches; pitcher-seasons with >= {MIN_N} typed pitches in that count). hitter_data/hs_fb_floor.py"),
               min_n=MIN_N, percentile=Q, seasons=list(SEASONS),
               floor={ck: main_t[ck]["floor"] for ck in CK}, detail=main_t,
               sensitivity={str(m): {ck: v["floor"] for ck, v in floor_from(D, m).items()} for m in SENS})
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(res, f, indent=1)
    print("HS floor", json.dumps(res["floor"]))
    if "--hs-only" in argv:
        return
    # college report only (ruling 8): Single-A / AAA real range vs the college engines' as-built mix
    rep = {"real": {}, "engine": {}}
    for lv, seasons in (("A", range(2021, 2026)), ("AAA", range(2023, 2026))):
        Ds = statcast_shares(lv, seasons)
        rep["real"][lv] = {"p10_min25": {ck: v["floor"] for ck, v in floor_from(Ds, 25).items()},
                           "p10_min10": {ck: v["floor"] for ck, v in floor_from(Ds, MIN_N).items()},
                           "median_min25": {ck: v["median"] for ck, v in floor_from(Ds, 25).items()},
                           "pooled": {ck: v["pooled"] for ck, v in floor_from(Ds, 25).items()},
                           "n_min25": {ck: v["n_pitchers"] for ck, v in floor_from(Ds, 25).items()}}
    for lv in ("college_d1", "college_d2", "college_d3", "mlb", "hs"):
        sh, n = engine_fb_share(lv)
        rep["engine"][lv] = {"fb_share": sh, "pitches": n}
    with open(os.path.join(DATA, "fits", "hs", "college_fb_guard_report.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(rep, f, indent=1)
    for lv in ("college_d1", "college_d2", "college_d3"):
        print(lv, " ".join(f"{ck}:{rep['engine'][lv]['fb_share'][ck]:.2f}/{rep['real']['A']['p10_min25'][ck]:.2f}" for ck in CK))


if __name__ == "__main__":
    main(sys.argv[1:])
