"""v1.3 shared refit, seq_fit rows (hitter_data/refit_seq.py): synthetic checks, no real data.
usage: python3 tests_refit_seq.py"""
import numpy as np
import pandas as pd

import seq_fit as SF
from hitter_data import HeldOutSeasonError
from hitter_data import refit_seq as RS

fails = 0


def check(name, ok):
    global fails
    print(("[PASS] " if ok else "[FAIL] ") + name)
    fails += 0 if ok else 1


def frame(season=2025, level="MLB", games=(1, 2, 3, 4)):
    rows = []
    for g in games:
        for ab in (1, 2):
            for pn, (pt, desc, bb) in enumerate((("FF", "ball", None), ("SL", "swinging_strike", None),
                                                 ("CH", "hit_into_play", "ground_ball"), ("KN", "ball", None),
                                                 ("FF", "foul_bunt", None)), start=1):
                rows.append(dict(pitch_type=pt, description=desc, game_pk=g, at_bat_number=ab, pitch_number=pn,
                                 pitcher=10, batter=20 + ab, balls=0, strikes=min(pn - 1, 2), outs_when_up=1,
                                 on_1b=np.nan if ab == 1 else 555.0, on_2b=np.nan, on_3b=np.nan, fld_score=3,
                                 bat_score=1, n_thruorder_pitcher=1, release_speed=92.0, release_spin_rate=2300.0,
                                 pfx_x=0.5, pfx_z=1.2, release_extension=6.3, plate_x=0.1, plate_z=2.4, sz_top=3.4,
                                 sz_bot=1.6, stand="R", p_throws="R", zone=5, vx0=5.0, vy0=-130.0, vz0=-5.0, ax=-8.0,
                                 ay=28.0, az=-15.0, release_pos_x=-2.0, release_pos_z=5.8, launch_speed=99.0,
                                 bb_type=bb, level=level, season=season, w=0.5 ** ((2025 - season) / 2)))
    d = pd.DataFrame(rows)
    d["bb_type"] = d["bb_type"].astype("string")
    d["description"] = d["description"].astype("string")
    return d


rows = RS.rows_from_frame(pd.concat([frame(2025, "MLB"), frame(2023, "A", games=(5, 6))], ignore_index=True))
check("row building drops unclassified pitch types and bunts (3 kept of 5 per PA)", len(rows) == 6 * 2 * 3)
check("rows sorted by game, PA, pitch", [(r["g"], r["ab"], r["pn"]) for r in rows] == sorted((r["g"], r["ab"], r["pn"]) for r in rows))
r0 = rows[0]
check("seq_fit row format: margin, runners, class, typed ball", r0["marg"] == 2 and r0["r1"] is False and r0["c"] == "FB"
      and rows[1]["r1"] is False and any(r["bb"] == "ground_ball" for r in rows) and all(r["bb"] in ("", "ground_ball") for r in rows))
check("runner on first read from a player id", any(r["r1"] for r in rows if r["ab"] == 2))
check("pitcher keyed by (level, id) so levels never share an intercept",
      {r["pit"] for r in rows} == {(0, 10), (2, 10)})
check("recency weight: 2025 -> 1, 2023 -> 0.5", {r["season"]: r["w"] for r in rows} == {2025: 1.0, 2023: 0.5})
try:
    RS.rows_from_frame(frame(2026))
    check("held-out season refused", False)
except HeldOutSeasonError:
    check("held-out season refused", True)

big = pd.concat([frame(2025, "MLB", games=range(1, 101))], ignore_index=True)
s1, s2 = RS.sample_games(big, 0.25), RS.sample_games(big, 0.25)
check("game sample: fixed seed, whole games, 25 of 100", s1["game_pk"].nunique() == 25
      and set(s1["game_pk"]) == set(s2["game_pk"]) and (s1.groupby("game_pk").size() == 10).all())

# weighted Fit: weight 2 on every row == duplicating every row; weight None == original
rng = np.random.default_rng(0)
n = 2000
X = rng.normal(size=(n, 2))
y = (rng.random(n) < 1 / (1 + np.exp(-(0.3 + 0.8 * X[:, 0])))).astype(float)
pid = rng.integers(0, 5, n); bid = rng.integers(0, 7, n); g = np.arange(n) // 10
a = SF.Fit(X, y, pid, bid, g, 5, 7).run()
b = SF.Fit(X, y, pid, bid, g, 5, 7, w=np.ones(n)).run()
c = SF.Fit(np.vstack([X, X]), np.r_[y, y], np.r_[pid, pid], np.r_[bid, bid], np.r_[g, g], 5, 7).run()
d = SF.Fit(X, y, pid, bid, g, 5, 7, w=np.full(n, 2.0)).run()
check("Fit with unit weights == unweighted", np.allclose(a["b_raw"], b["b_raw"], atol=1e-5))
check("Fit with weight 2 == every row twice", np.allclose(c["b_raw"], d["b_raw"], atol=1e-3))
check("Fit recovers the slope", abs(a["b_raw"][0] - 0.8) < 0.15)

# A3 rule
check("A3: interval includes held -> keep", RS.a3(0.1, 0.1, 0.116)[0] == 0.116)
check("A3: excludes held and 0 -> fitted", RS.a3(0.5, 0.05, 0.116)[0] == 0.5)
check("A3: excludes held, includes 0 -> 0", RS.a3(0.0, 0.03, 0.116)[0] == 0.0)

wts = np.ones(4)
gbt = RS.gb_types([dict(pt="FF", c="FB"), dict(pt="SI", c="FB"), dict(pt="FF", c="FB"), dict(pt="SL", c="SL")],
                  [(0, 0), (1, 1), (2, 2), (3, 3)], np.array([1.0, 1.0, 0.0, 1.0]), np.array([1.0, 1.0, 3.0, 1.0]))
check("GB by type is weight-averaged", abs(gbt["4-seam"] - 0.25) < 1e-12 and gbt["sink"] == 1.0 and gbt["SL"] == 1.0)

print(f"\n{fails} failures")
raise SystemExit(1 if fails else 0)
