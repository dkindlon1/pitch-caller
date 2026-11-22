"""v1.3 Part 2.5 tests: the shared-refit loaders and refit math on short synthetic data (no data folder needed).
The new-layout loader reads only finished day files, caches, guards 2026 and weights by recency; statsapi seasons need
their done file; the weighted fits recover planted values; the landing record, HBP bands, approach tags and zone bands
match the old scripts' definitions.
usage: python3 tests_refit_v13.py"""
import gzip
import math
import os
import shutil
import sys
import tempfile

import numpy as np
import pandas as pd

from hitter_data import HeldOutSeasonError
from hitter_data import refit as R
from hitter_data import refit_load as L

FAILS = []


def check(name, cond, detail=""):
    print(("[PASS] " if cond else "[FAIL] ") + name + ("" if cond else f"  ({detail})"))
    if not cond:
        FAILS.append(name)


def raises(fn, exc):
    try:
        fn()
    except exc:
        return True
    except Exception:
        return False
    return False


def day_frame(n, season, game0, seed, gtype="R"):
    rng = np.random.default_rng(seed)
    return pd.DataFrame(dict(
        pitch_type=rng.choice(["FF", "SL", "CH"], n), game_date=f"{season}-05-01", game_type=gtype,
        description=rng.choice(["ball", "called_strike", "swinging_strike", "foul", "hit_into_play"], n),
        plate_x=rng.normal(0, 0.8, n), plate_z=rng.normal(2.5, 0.8, n), sz_top=3.4, sz_bot=1.6,
        balls=rng.integers(0, 4, n), strikes=rng.integers(0, 3, n), stand=rng.choice(["R", "L"], n),
        p_throws=rng.choice(["R", "L"], n), game_pk=game0 + rng.integers(0, 3, n), pitcher=rng.integers(1, 5, n),
        batter=rng.integers(10, 20, n), at_bat_number=rng.integers(1, 40, n), pitch_number=rng.integers(1, 6, n),
        game_year=season, unused_column=1))


# ------------------------------------------------------------------------------------------------ loader
root = tempfile.mkdtemp(prefix="refit_test_")
try:
    d24 = os.path.join(root, "statcast", "MLB", "2024")
    d26 = os.path.join(root, "statcast", "MLB", "2026")
    os.makedirs(d24); os.makedirs(d26)
    day_frame(50, 2024, 1000, 1).to_csv(os.path.join(d24, "2024-05-01.csv.gz"), index=False)
    day_frame(40, 2024, 2000, 2, gtype="S").to_csv(os.path.join(d24, "2024-03-01.csv.gz"), index=False)
    with gzip.open(os.path.join(d24, "2024-05-02.csv.gz.part"), "wt") as fh:
        fh.write("partial")
    open(os.path.join(d24, "2024-05-03.empty"), "w").close()
    day_frame(30, 2026, 3000, 3).to_csv(os.path.join(d26, "2026-05-01.csv.gz"), index=False)
    check("day files: finished .csv.gz only (no .part / .empty)", len(L.day_files("MLB", 2024, root)) == 2)
    check("seasons on disk counts 2026; fit seasons do not",
          L.seasons_on_disk("MLB", root) == [2024, 2026] and L.fit_seasons_on_disk("MLB", root) == [2024])
    df = L.load_savant("MLB", 2024, root)
    check("load_savant keeps regular season only and the column subset",
          len(df) == 50 and "unused_column" not in df.columns and set(L.COLS) <= set(df.columns), len(df))
    check("load_savant cached as parquet with its key", os.path.exists(os.path.join(root, "refit", "cache", "MLB_2024.parquet")))
    df2 = L.load_savant("MLB", 2024, root)
    check("cached reread is identical", df2.drop(columns=["level", "season"]).equals(df.drop(columns=["level", "season"])))
    check("load_savant refuses 2026", raises(lambda: L.load_savant("MLB", 2026, root), HeldOutSeasonError))
    s = L.savant(levels=("MLB",), root=root)
    check("savant() pools fit seasons with level, season and recency weight",
          len(s) == 50 and set(s["season"]) == {2024} and abs(s["w"].iloc[0] - 2 ** -0.5) < 1e-12)
    check("savant() with seasons=[2026] raises", raises(lambda: L.savant(levels=("MLB",), seasons=[2026], root=root),
                                                        HeldOutSeasonError))
    sa = os.path.join(root, "statsapi", "AA")
    os.makedirs(sa)
    pd.DataFrame(dict(a=[1, 2])).to_csv(os.path.join(sa, "pitches_2024_0000.csv.gz"), index=False)
    pd.DataFrame(dict(a=[3])).to_csv(os.path.join(sa, "pitches_2023_0000.csv.gz"), index=False)
    open(os.path.join(sa, "done_2024.txt"), "w").close()
    open(os.path.join(sa, "done_2026.txt"), "w").close()
    check("statsapi seasons: done file required, 2026 left out", L.statsapi_seasons("AA", root) == [2024])
    check("statsapi incomplete season refused", raises(lambda: L.load_statsapi("AA", 2023, root), FileNotFoundError))
    check("statsapi 2026 refused", raises(lambda: L.load_statsapi("AA", 2026, root), HeldOutSeasonError))
    check("statsapi chunks read", len(L.load_statsapi("AA", 2024, root)) == 2)
finally:
    shutil.rmtree(root, ignore_errors=True)

check("recency weight halves every 2 seasons", L.recency_weight(2025) == 1.0 and abs(L.recency_weight(2023) - 0.5) < 1e-12
      and abs(L.recency_weight(2021) - 0.25) < 1e-12)
check("recency weight refuses 2026", raises(lambda: L.recency_weight(2026), HeldOutSeasonError))
gp = np.arange(1, 200001)
kp = L.keep_games(gp, L.game_keep_prob(2015))
check("weight-proportional sample: 2021+ keeps every game; an older season keeps about w / 0.25 of them",
      L.game_keep_prob(2021) == 1.0 and L.keep_games(gp, 1.0).all() and abs(kp.mean() - 0.125) < 0.005, kp.mean())
check("weight-proportional sample: a kept pitch carries w / keep prob (= 0.25 before 2021, its own weight after)",
      abs(L.sample_weight(2015) - 0.25) < 1e-12 and L.sample_weight(2024) == L.recency_weight(2024)
      and (L.keep_games(gp, 0.3) == L.keep_games(gp, 0.3)).all())
check("check_seasons refuses a frame with 2026", raises(lambda: R.check_seasons(pd.DataFrame(dict(season=[2025, 2026]))),
                                                         HeldOutSeasonError))

# ------------------------------------------------------------------------------------------------ fitting helpers
rng = np.random.default_rng(4)
n = 20000
X = np.c_[np.ones(n), rng.normal(size=n)]
y = (rng.random(n) < 1 / (1 + np.exp(-(-0.3 + 0.8 * X[:, 1])))).astype(float)
b = R.wlogit(X, y, np.ones(n))
check("wlogit recovers a planted slope", abs(b[1] - 0.8) < 0.06, b)
# duplicated rows = weight 2
b2 = R.wlogit(np.vstack([X, X[:5000]]), np.r_[y, y[:5000]], np.ones(n + 5000))
w2 = np.ones(n); w2[:5000] = 2
check("wlogit weights = duplicated rows", np.allclose(R.wlogit(X, y, w2), b2, atol=1e-8))
gid = rng.integers(0, 50, n)
dr = R.game_draws(gid, np.random.default_rng(0))
check("game draws: whole games, same multiplicity within a game, 50 draws in all",
      all(len(set(dr[gid == g])) == 1 for g in range(50)) and int(sum(dr[np.unique(gid, return_index=True)[1]])) == 50)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seq_fit as S   # noqa: E402
pid = rng.integers(0, 30, n); bid = rng.integers(0, 40, n)
Xf = rng.normal(size=(n, 2))
yf = (rng.random(n) < 1 / (1 + np.exp(-(0.5 * Xf[:, 0] - 0.2 * Xf[:, 1] + 0.3 * (pid % 3 - 1))))).astype(float)
ref = S.Fit(Xf, yf, pid, bid, gid, 30, 40).run()
mine = R.wfit_re(Xf, yf, np.ones(n), pid, bid, gid)
check("wfit_re with unit weights = seq_fit.Fit.run (coefficients and SEs)",
      np.allclose(ref["b_raw"], mine["b"], atol=1e-4) and np.allclose(ref["se_raw"], mine["se"], rtol=1e-3),
      (ref["b_raw"], mine["b"]))

# ------------------------------------------------------------------------------------------------ fit definitions
# HBP bands: location_proxies.py's 3-in. bands toward the batter (+30 = 30 and beyond)
hb = pd.DataFrame(dict(xb=[12.5, 13.0, 14.9, 16.0, 31.0, 45.0, -20.0], hit=[1, 0, 0, 1, 1, 0, 1], w=[1, 1, 2, 1, 1, 1, 1]))
t = R.hbp_band_table(hb)
check("HBP band table: weighted rate per band, +30 open-ended, other side ignored",
      abs(t[12.0] - 0.25) < 1e-12 and abs(t[15.0] - 1.0) < 1e-12 and abs(t[30.0] - 0.5) < 1e-12 and t[18.0] == 0.0, t)

# landing record: earlier same-type pitches today, before this pitch (v10_landing_fit's walk)
lf = pd.DataFrame(dict(level="MLB", season=2025, game_pk=[1] * 5, at_bat_number=[1, 1, 1, 2, 2], pitch_number=[1, 2, 3, 1, 2],
                       pitcher=[7] * 5, pitch_type=["FF", "SL", "FF", "FF", "SL"],
                       description=["ball", "called_strike", "foul", "ball", "ball"], balls=[0, 0, 1, 0, 0],
                       strikes=[0, 0, 0, 0, 1], w=1.0))
f, _ = R.landing_frame(lf)
ff = f[f["pt"] == "FF"]
check("landing record: strikes / pitches before this pitch of this type today",
      ff["n"].tolist() == [0, 1, 2] and ff["st"].tolist() == [0, 0, 1] and f["y"].tolist() == [0, 1, 1, 0, 0],
      (ff["n"].tolist(), ff["st"].tolist()))
check("landing record: expected strikes accumulate the prior pitches' expectation",
      abs(ff["ex"].iloc[2] - ff["exp"].iloc[0] - ff["exp"].iloc[1]) < 1e-12)

# approach tags: top / bottom third among a level-season's qualifying hitters
rows = []
for bat, early_rate in enumerate([0.9, 0.8, 0.7, 0.6, 0.5, 0.4]):
    for i in range(60):
        rows.append(dict(level="A", season=2024, bat=bat, iz=True, early=True, swing=float(i < early_rate * 60)))
    for i in range(80):
        rows.append(dict(level="A", season=2024, bat=bat, iz=True, early=False, swing=float(i < 0.5 * 80)))
rows.append(dict(level="A", season=2024, bat=99, iz=True, early=True, swing=1.0))     # too few pitches: no trait, tag 0
tr = R.approach_traits(pd.DataFrame(rows))
tags = tr["tag"].xs(("A", 2024)).to_dict()
check("approach tags: top third +1, bottom third -1, unqualified 0",
      tags[0] == 1 and tags[1] == 1 and tags[4] == -1 and tags[5] == -1 and tags[2] == 0 and tags[99] == 0, tags)

# zone bands = step4b_power_fit.zone
from readthrough.step4b_power_fit import zone   # noqa: E402
pts = [(0.0, 2.5), (0.6, 2.5), (1.0, 2.5), (2.0, 2.5), (0.0, 3.3), (0.3, 1.0)]
check("zone bands = step4b_power_fit.zone", all(
    R.zone_band(np.array([x]), np.array([z]), np.array([3.4]), np.array([1.6]))[0] == zone(dict(x=x, z=z, top=3.4, bot=1.6))
    for x, z in pts))

print(f"\n{len(FAILS)} failing" if FAILS else "\nall refit checks passed")
sys.exit(1 if FAILS else 0)
