"""v1.3 refit (rows 7, 8, 9, B5, B6, B11): synthetic checks of hitter_data/refit_profiles.py. No real data.

  python3 tests_refit_profiles.py
"""
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from hitter_data import refit_profiles as RP          # noqa: E402
import profiles_fit as PF                              # noqa: E402

fails = []


def check(name, ok, detail=""):
    print(("[PASS] " if ok else "[FAIL] ") + name + (f"  [{detail}]" if detail else ""))
    if not ok:
        fails.append(name)


# weighted median: equal weights = ordinary median (odd and even counts); weights pull it; zero weight ignored; NaN dropped
check("weighted median with equal weights is the ordinary median (odd / even counts)",
      RP.wmedian([3, 1, 2], [1, 1, 1]) == 2.0 and RP.wmedian([4, 1, 3, 2], [1, 1, 1, 1]) == 2.5)
check("weights move the median; zero weights and NaN are ignored",
      RP.wmedian([1, 2, 3], [1, 1, 5]) == 3.0 and RP.wmedian([1, 2, 100], [1, 1, 0]) == 1.5
      and RP.wmedian([1, np.nan, 3], [1, 1, 1]) == 2.0)
check("weighted mean", abs(RP.wmean([0, 1], [1, 3]) - 0.75) < 1e-12)

# Poisson bootstrap multipliers are constant within a game
pw = RP.poisson_weights([7, 7, 9, 9, 9, 11], B=50, seed=1)
check("game-clustered bootstrap: one multiplicity per game per replicate",
      pw.shape == (50, 6) and (pw[:, 0] == pw[:, 1]).all() and (pw[:, 2] == pw[:, 4]).all())

# game sampling keeps whole games and roughly the share asked
df = pd.DataFrame({"game_pk": np.repeat(np.arange(1000), 5)})
s = RP.sample_games(df, 0.3)
per = s.groupby("game_pk").size()
check("game sample keeps whole games, about the share asked", (per == 5).all() and 0.25 < per.size / 1000 < 0.35,
      f"{per.size} of 1000 games")

# movement frame: right-hander normalization and the main fastball off which gaps are read
rows = []
for i in range(6):
    rows.append(dict(pitch_type="FF", release_speed=95.0, pfx_x=-0.6, pfx_z=1.3, p_throws="R", pitcher=1, game_pk=10))
rows.append(dict(pitch_type="SI", release_speed=94.0, pfx_x=-1.2, pfx_z=0.7, p_throws="R", pitcher=1, game_pk=10))
rows.append(dict(pitch_type="SL", release_speed=86.0, pfx_x=0.5, pfx_z=0.1, p_throws="R", pitcher=1, game_pk=10))
rows.append(dict(pitch_type="FF", release_speed=92.0, pfx_x=0.6, pfx_z=1.3, p_throws="L", pitcher=2, game_pk=10))
rows.append(dict(pitch_type="XX", release_speed=50.0, pfx_x=0.0, pfx_z=0.0, p_throws="L", pitcher=2, game_pk=10))
m = RP.movement_frame(pd.DataFrame(rows), PF.KIND)
sl = m[m.pitch_type == "SL"].iloc[0]
lf = m[(m.pitcher == 2)].iloc[0]
check("movement frame: arm-side HB positive for both hands, unknown pitch types dropped",
      abs(m[m.pitch_type == "FF"].hb.iloc[0] - 7.2) < 1e-9 and abs(lf.hb - 7.2) < 1e-9 and len(m) == 9)
check("gaps are read off the pitcher-game's most-thrown fastball type (the four-seam, not the sinker)",
      sl.fb_type == "FF" and abs(sl.dmph - 9.0) < 1e-9 and abs(sl.divb - (1.2 - 15.6)) < 1e-9)

# weighted profile medians: a season's weight moves the median between the two seasons' values
rng = np.random.default_rng(0)
n = 400
d = pd.DataFrame({"kind": "FB", "pitch_type": "FF", "fb_type": "FF", "tag": "", "dmph": 0.0,
                  "ivb": np.r_[np.full(n, 15.0), np.full(n, 17.0)], "hb": 8.0,
                  "w": np.r_[np.full(n, 0.5), np.full(n, 1.0)], "game_pk": np.arange(2 * n)})
p = RP.profile_medians(d, PF)
check("profile medians are recency-weighted (the recent season's 17 in. wins against an older 15 in.)",
      p["FB|"]["ivb"] == 17.0 and p["FB|"]["n"] == 2 * n and abs(p["FB|"]["share"] - 1.0) < 1e-9)

# weighted logistic: w=None equals unit weights; duplicating rows = weight 2
n = 3000
X = rng.normal(size=(n, 2))
eta = -0.3 + 0.8 * X[:, 0] - 0.5 * X[:, 1]
y = (rng.random(n) < 1 / (1 + np.exp(-eta))).astype(float)
pid = rng.integers(0, 20, n)
bid = rng.integers(0, 30, n)
g = np.arange(n) // 10
a = RP.WFit(X, y, pid, bid, g, 20, 30).run()
b = RP.WFit(X, y, pid, bid, g, 20, 30, w=np.ones(n)).run()
c = RP.WFit(np.vstack([X, X]), np.r_[y, y], np.r_[pid, pid], np.r_[bid, bid], np.r_[g, g], 20, 30).run()
dd = RP.WFit(X, y, pid, bid, g, 20, 30, w=np.full(n, 2.0)).run()
check("weighted logistic: no weights = unit weights; weight 2 = each row twice; recovers the slopes",
      np.allclose(a["b_raw"], b["b_raw"]) and np.allclose(c["b_raw"], dd["b_raw"], atol=2e-3)
      and abs(a["b_raw"][0] - 0.8) < 0.15 and abs(a["b_raw"][1] + 0.5) < 0.15,
      f"{np.round(a['b_raw'], 3).tolist()} / {np.round(dd['b_raw'], 3).tolist()}")

# held-out guard: the refit's season list refuses 2026
from hitter_data import HeldOutSeasonError, fit_seasons   # noqa: E402
try:
    fit_seasons([2025, 2026])
    tripped = False
except HeldOutSeasonError:
    tripped = True
check("the refit's season list refuses the held-out season", tripped)

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAIL'}")
sys.exit(1 if fails else 0)
