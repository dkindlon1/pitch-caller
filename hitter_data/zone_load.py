"""v1.3 zone seed loader: streams the Savant day files one at a time and keeps only per-game cell counts.

Files: {DATA}/statcast/{A,AAA,MLB}/<year>/<YYYY-MM-DD>.csv.gz. Skips *.part and *.empty. Each day file becomes a small
aggregate (season, game_pk, balls, strikes, band, height, profile, same side -> counts), cached under
{DATA}/derived/zone_seed/agg keyed on the source size, so a rerun reads only new days. The held-out season (2026) is
never aggregated: its rows are only counted (hitter_data.HELDOUT_SEASON).
"""
import glob
import json
import os

import numpy as np
import pandas as pd

from . import DATA, HELDOUT_SEASON, assert_not_heldout
from .zone_defs import (BB_TYPES, CALLED, DROP, FOUL, HARD_EV, IN_PLAY, KEY_COLS, PITCH_PROFILE, STAT_COLS, SWING, WHIFF,
                        bands_from_location)

LEVELS = ("A", "AAA", "MLB")
USECOLS = ["pitch_type", "plate_x", "plate_z", "sz_top", "sz_bot", "balls", "strikes", "description", "bb_type",
           "launch_speed", "stand", "p_throws", "game_pk", "game_year", "des"]
CACHE = os.path.join(DATA, "derived", "zone_seed")


def day_files(level, season):
    d = os.path.join(DATA, "statcast", level, str(season))
    return sorted(f for f in glob.glob(os.path.join(d, "*.csv.gz")) if not f.endswith((".part", ".empty")))


def seasons_on_disk(level):
    out = []
    for d in glob.glob(os.path.join(DATA, "statcast", level, "*")):
        b = os.path.basename(d)
        if b.isdigit() and day_files(level, int(b)):
            out.append(int(b))
    return sorted(out)


def read_day(path):
    df = pd.read_csv(path, usecols=lambda c: c in USECOLS, encoding="utf-8-sig", low_memory=False)
    for c in USECOLS:
        if c not in df.columns:
            df[c] = np.nan
    return df


def aggregate_frame(df, season):
    """Savant rows of one season -> per-game cell counts (KEY_COLS + STAT_COLS). Fit paths only: guards the season."""
    season = assert_not_heldout(season)
    d = df.copy()
    desc = d["description"].astype(str)
    bunt = d["des"].astype(str).str.contains("bunt", case=False, na=False) & desc.isin(IN_PLAY)
    d["prof"] = d["pitch_type"].map(PITCH_PROFILE)
    keep = (~desc.isin(DROP) & ~bunt & d["prof"].notna() & d["plate_x"].notna() & d["plate_z"].notna()
            & d["balls"].between(0, 3) & d["strikes"].between(0, 2) & d["game_pk"].notna())
    d = d[keep].copy()
    desc = d["description"].astype(str)
    # a missing or broken batter zone takes the typical one (1.6 to 3.4 ft)
    top = d["sz_top"].astype(float)
    bot = d["sz_bot"].astype(float)
    bad = top.isna() | bot.isna() | (top - bot < 1.0) | (top - bot > 3.0)
    top = top.where(~bad, 3.4)
    bot = bot.where(~bad, 1.6)
    band, ht = bands_from_location(d["plate_x"].astype(float).values, d["plate_z"].astype(float).values,
                                   top.values, bot.values)
    d["band"], d["ht"] = band, ht
    d["season"] = season
    d["b"] = d["balls"].astype(int)
    d["s"] = d["strikes"].astype(int)
    d["game_pk"] = d["game_pk"].astype(np.int64)
    d["same"] = (d["stand"].astype(str) == d["p_throws"].astype(str)).astype(int)
    sw = desc.isin(SWING)
    bip = desc.isin(IN_PLAY)
    ev = pd.to_numeric(d["launch_speed"], errors="coerce")
    bt = d["bb_type"].map(BB_TYPES)
    d["n"] = 1
    d["sw"] = sw.astype(int)
    d["wh"] = desc.isin(WHIFF).astype(int)
    d["ft"] = desc.isin(FOUL).astype(int)
    d["bip"] = bip.astype(int)
    d["evn"] = (bip & ev.notna()).astype(int)
    d["hard"] = (bip & (ev >= HARD_EV)).astype(int)
    d["btn"] = (bip & bt.notna()).astype(int)
    for k in ("gb", "ld", "fb", "pu"):
        d[k] = (bip & (bt == k)).astype(int)
    d["take"] = (~sw).astype(int)
    d["cs"] = desc.isin(CALLED).astype(int)
    return d.groupby(list(KEY_COLS), as_index=False)[list(STAT_COLS)].sum()


def _count_rows(path):
    import gzip
    with gzip.open(path, "rb") as f:
        return max(0, sum(1 for _ in f) - 1)


def _manifest():
    p = os.path.join(CACHE, "row_counts.json")
    try:
        with open(p) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _save_manifest(m):
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, "row_counts.json"), "w") as f:
        json.dump(m, f, indent=0, sort_keys=True)


def count_rows(level, season):
    """(day files, raw rows) for a level-season. Counting only: allowed for the held-out season too."""
    m = _manifest()
    n, files = 0, day_files(level, season)
    changed = False
    for f in files:
        k = f"{level}/{season}/{os.path.basename(f)}|{os.path.getsize(f)}"
        if k not in m:
            m[k] = _count_rows(f)
            changed = True
        n += m[k]
    if changed:
        _save_manifest(m)
    return len(files), n


def load_season(level, season, verbose=False):
    """Per-game cell counts for one fit season (cached per day file). Refuses the held-out season."""
    season = assert_not_heldout(season)
    out, kept_rows = [], 0
    m = _manifest()
    changed = False
    for f in day_files(level, season):
        size = os.path.getsize(f)
        cdir = os.path.join(CACHE, "agg", level, str(season))
        cp = os.path.join(cdir, os.path.basename(f).replace(".csv.gz", f"_{size}.pkl"))
        if os.path.exists(cp):
            a = pd.read_pickle(cp)
        else:
            df = read_day(f)
            k = f"{level}/{season}/{os.path.basename(f)}|{size}"
            m[k] = len(df)
            changed = True
            a = aggregate_frame(df, season)
            os.makedirs(cdir, exist_ok=True)
            a.to_pickle(cp)
            if verbose:
                print(level, season, os.path.basename(f), len(df), "rows ->", int(a["n"].sum()), "kept", flush=True)
        out.append(a)
    if changed:
        _save_manifest(m)
    if not out:
        return pd.DataFrame(columns=list(KEY_COLS) + list(STAT_COLS))
    return pd.concat(out, ignore_index=True)


def inventory():
    """Rows per level x season on disk (held-out season counted, never loaded)."""
    rows = []
    for lv in LEVELS:
        for y in seasons_on_disk(lv):
            files, n = count_rows(lv, y)
            rows.append(dict(level=lv, season=y, days=files, rows=n, heldout=y >= HELDOUT_SEASON))
    return rows
