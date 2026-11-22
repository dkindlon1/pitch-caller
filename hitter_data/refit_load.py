"""v1.3 shared refits (plan section 4): loaders for the new data layout.

The v1.0-v1.2 fit scripts glob the old `data/statcast/sc_<date>.csv` (MLB, every 4th day) and
`data/statcast_minors/A_*.csv`. The v1.3 pulls write one Savant day file per level and date instead:

    {DATA}/statcast/{MLB,AAA,A}/<year>/<YYYY-MM-DD>.csv.gz   (a `.empty` file marks a day with no games)
    {DATA}/statsapi/<LEVEL>/pitches_<season>_<k>.csv.gz      (only seasons with done_<season>.txt are complete)

This module reads those files without moving them. Each Savant level-season is read once into a column subset and
cached as parquet under {DATA}/refit/cache (keyed on the day files' names and sizes, so new days rebuild it). Only
completed `.csv.gz` day files are read; `.part` files from the running pulls are skipped.

Every season-loading path calls `assert_not_heldout`: 2026 is never read for a fit.

Weights (stated in docs/REFIT_v13.md): a pitch's weight is `recency(season)`, which halves every 2 seasons back from
2025 (the zone seed's rule): w = 0.5 ** ((2025 - season) / 2). Levels are pooled with equal per-pitch weight unless a
fit says otherwise (MLB-level quantities use MLB only).
"""
import glob
import json
import os

import numpy as np
import pandas as pd

from . import DATA, HELDOUT_SEASON, assert_not_heldout, fit_seasons

LEVELS = ("MLB", "AAA", "A")
LATEST_FIT_SEASON = HELDOUT_SEASON - 1          # 2025
HALF_LIFE = 2.0                                  # seasons
CACHE = os.path.join(DATA, "refit", "cache")

# superset of the Savant columns the refit fits read
COLS = ["pitch_type", "game_date", "release_speed", "release_pos_x", "release_pos_z", "batter", "pitcher", "events",
        "description", "zone", "des", "game_type", "stand", "p_throws", "home_team", "away_team", "bb_type", "balls",
        "strikes", "game_year", "pfx_x", "pfx_z", "plate_x", "plate_z", "on_3b", "on_2b", "on_1b", "outs_when_up",
        "inning", "inning_topbot", "vx0", "vy0", "vz0", "ax", "ay", "az", "sz_top", "sz_bot", "launch_speed",
        "launch_angle", "release_spin_rate", "release_extension", "game_pk", "at_bat_number", "pitch_number",
        "bat_score", "fld_score", "post_bat_score", "home_score", "away_score", "n_thruorder_pitcher", "arm_angle",
        "woba_value", "hit_location"]
STR_COLS = ("pitch_type", "game_date", "events", "description", "des", "game_type", "stand", "p_throws", "home_team",
            "away_team", "bb_type", "inning_topbot")


def recency_weight(season, latest=LATEST_FIT_SEASON, half_life=HALF_LIFE):
    """Halves every `half_life` seasons back from `latest`. Guards the season."""
    s = assert_not_heldout(season)
    return 0.5 ** ((latest - s) / half_life)


# ------------------------------------------------------------------------------------------------ Savant day files
def day_files(level, season, root=None):
    d = os.path.join(root or DATA, "statcast", level, str(season))
    return sorted(f for f in glob.glob(os.path.join(d, "*.csv.gz")) if not f.endswith((".part", ".empty")))


def seasons_on_disk(level, root=None):
    """Seasons with at least one day file (counting only: may include the held-out season)."""
    out = []
    for d in glob.glob(os.path.join(root or DATA, "statcast", level, "*")):
        b = os.path.basename(d)
        if b.isdigit() and day_files(level, int(b), root):
            out.append(int(b))
    return sorted(out)


def fit_seasons_on_disk(level, root=None):
    """Seasons on disk that a fit may use (<= 2025)."""
    return [s for s in seasons_on_disk(level, root) if s < HELDOUT_SEASON]


def read_day(path, cols=COLS):
    df = pd.read_csv(path, usecols=lambda c: c in cols, encoding="utf-8-sig", low_memory=False)
    for c in cols:
        if c not in df.columns:
            df[c] = np.nan
    df = df[list(cols)]
    for c in STR_COLS:
        if c in df.columns:
            df[c] = df[c].astype("string")
    return df


def _key(files):
    return [[os.path.basename(f), os.path.getsize(f)] for f in files]


def load_savant(level, season, root=None, cache=True, regular_only=True, cols=None, sample=False):
    """One level-season of Savant pitches (column subset COLS, or `cols` of it). Refuses the held-out season.
    sample=True keeps a weight-proportional share of its games (see game_keep_prob)."""
    season = assert_not_heldout(season)
    files = day_files(level, season, root)
    cdir = os.path.join(root or DATA, "refit", "cache") if root else CACHE
    cp = os.path.join(cdir, f"{level}_{season}.parquet")
    kp = cp + ".json"
    key = _key(files)
    df = None
    if cache and os.path.exists(cp) and os.path.exists(kp):
        try:
            with open(kp) as fh:
                if json.load(fh) == key:
                    df = pd.read_parquet(cp, columns=None if cols is None else _with_keys(cols))
        except (OSError, ValueError):
            df = None
    if df is None:
        parts = [read_day(f) for f in files]
        df = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=COLS)
        for c in STR_COLS:
            df[c] = df[c].astype("string")
        if cache:
            os.makedirs(cdir, exist_ok=True)
            df.to_parquet(cp, index=False)
            with open(kp, "w") as fh:
                json.dump(key, fh)
        if cols is not None:
            df = df[_with_keys(cols)]
    if sample:
        df = df[keep_games(df["game_pk"], game_keep_prob(season))]
    if regular_only and "game_type" in df.columns:
        df = df[df["game_type"].fillna("R") == "R"]
    df = df.copy()
    df["level"] = level
    df["season"] = season
    return df


def _with_keys(cols):
    return list(dict.fromkeys(list(cols) + ["game_pk", "game_type"]))


# Weight-proportional game sampling (the full-data rerun, MLB back to 2008). A level-season whose recency weight is at
# least FULL_WEIGHT (2021 on) keeps every game; an older one keeps each game with probability w / FULL_WEIGHT (a fixed
# hash of game_pk, so reruns keep the same games), and its kept pitches carry weight FULL_WEIGHT. In expectation that is
# the same recency-weighted sum over every game, at a fraction of the memory: the old seasons' weight is tiny.
FULL_WEIGHT = 0.25


def game_keep_prob(season):
    return min(1.0, recency_weight(season) / FULL_WEIGHT)


def keep_games(game_pk, p):
    if p >= 1.0:
        return np.ones(len(game_pk), bool)
    g = np.asarray(game_pk, dtype=np.int64)
    u = ((g * 2654435761) % 4294967296) / 4294967296.0
    return u < p


def sample_weight(season):
    """The recency weight a kept pitch carries under sample=True: w / P(keep its game)."""
    return recency_weight(season) / game_keep_prob(season)


def savant(levels=LEVELS, seasons=None, root=None, weighted=True, cols=None, sample=False):
    """Pooled Savant pitches for the fit seasons of each level, with `level`, `season` and recency weight `w`.
    seasons=None takes every fit season on disk (<= 2025). cols: a subset of COLS to read. sample=True: the
    weight-proportional game sample (older seasons thinned in proportion to their weight; w = weight / keep prob)."""
    frames = []
    for lv in levels:
        ss = fit_seasons(seasons) if seasons is not None else fit_seasons_on_disk(lv, root)
        for s in ss:
            if not day_files(lv, s, root):
                continue
            d = load_savant(lv, s, root, cols=cols, sample=sample)
            d["w"] = (sample_weight(s) if sample else recency_weight(s)) if weighted else 1.0
            frames.append(d)
    if not frames:
        return pd.DataFrame(columns=COLS + ["level", "season", "w"])
    out = pd.concat(frames, ignore_index=True)
    out["level"] = out["level"].astype("category")
    return out


def coverage(root=None):
    """(level, season) -> rows actually loadable for a fit (reads the cache)."""
    rows = []
    for lv in LEVELS:
        for s in fit_seasons_on_disk(lv, root):
            d = load_savant(lv, s, root)
            rows.append(dict(level=lv, season=s, days=len(day_files(lv, s, root)), pitches=len(d),
                             games=int(d["game_pk"].nunique()), w=round(recency_weight(s), 3)))
    return rows


# ------------------------------------------------------------------------------------------------ statsapi chunks
def statsapi_seasons(level, root=None):
    """Seasons whose pull finished (done_<season>.txt), fit seasons only."""
    d = os.path.join(root or DATA, "statsapi", level)
    out = []
    for f in glob.glob(os.path.join(d, "done_*.txt")):
        b = os.path.basename(f)[5:-4]
        if b.isdigit() and int(b) < HELDOUT_SEASON:
            out.append(int(b))
    return sorted(out)


def load_statsapi(level, season, root=None, usecols=None):
    season = assert_not_heldout(season)
    d = os.path.join(root or DATA, "statsapi", level)
    if not os.path.exists(os.path.join(d, f"done_{season}.txt")):
        raise FileNotFoundError(f"statsapi {level} {season} is not complete (no done_{season}.txt)")
    fs = sorted(glob.glob(os.path.join(d, f"pitches_{season}_*.csv.gz")))
    parts = [pd.read_csv(f, usecols=usecols, low_memory=False) for f in fs]
    df = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()
    df["level"] = level
    df["season"] = season
    return df


# ------------------------------------------------------------------------------------------------ shared derived columns
SWING = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play", "foul_bunt",
         "missed_bunt", "bunt_foul_tip"}
WHIFF = {"swinging_strike", "swinging_strike_blocked", "missed_bunt"}
TAKE = {"ball", "called_strike", "blocked_ball", "hit_by_pitch", "pitchout"}


def is_bunt(df):
    desc = df["description"].fillna("").astype(str)
    return desc.str.contains("bunt") | df["des"].fillna("").astype(str).str.contains("bunt", case=False)
