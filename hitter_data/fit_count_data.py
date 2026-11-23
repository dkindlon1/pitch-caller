"""v1.3 count-layer fits, part 1: sufficient counts per level-season (PROVISIONAL inputs; docs/FITS_COUNT_v13.md).

Every count is built from the scoring harness's own season build (hitter_data.harness.build_season), so the fits see
exactly the pitches, filters, contexts and full-game rule the harness scores. One extra pass over the same games reads
what the harness doesn't keep: the weak-contact text ("grounded out to p", "to c"), handedness coverage.

Per level-season (axes as in harness_adapters: count ci 12, outs 3, bases 8, side 3, late 2):
    ev6[12,3,8,3,2,6]       pitch events: ball, HBP, called strike, whiff, foul, in play
    bip[12,3,8,3,2,5,6]     non-bunt balls in play: type (ground, line, fly, pop, unknown) x result (out,1B,2B,3B,HR,E)
    weak[12], hard[12], bipn[12]   hard-contact proxy by count (hard = line drive or extra-base hit; weak = pop-up or a
                            grounder / single to the pitcher or catcher), per non-bunt ball in play
    runs_sum/runs_n[3,8]    runs in the rest of the inning from the PA start (halves that reach 3 outs)
    cv_sum/cv_n/cv_sq[12,3,8]  the same from each pitch state (PAs without a mid-PA runner event)
    pa_sum/pa_sq[3,8]       squared sums for the PA-start runs
    hand[4]                 PAs: both hands known, batter only, pitcher only, neither

Cached as .npz under {DATA}/fits/cache, keyed on a hash of the season's full-game id list (new games -> rebuilt).
2026 is held out: every season passes hitter_data.assert_not_heldout."""
import hashlib
import os
import re

import numpy as np

from . import DATA, assert_not_heldout
from . import harness as H
from .harness_adapters import BIP_TYPES, CI

FITS = os.path.join(DATA, "fits")
CACHE = os.path.join(FITS, "cache")
CACHE_VERSION = "c1"
PROVISIONAL = ("PROVISIONAL (v1.3 buildout, Nov 21 2026): fit on the college data in hand while the scrapes run; "
               "numbers will move as data lands. Not wired as the engine default. 2026 never used.")

KEYS = ("ev6", "bip", "weak", "hard", "bipn", "runs_sum", "runs_n", "cv_sum", "cv_n", "cv_sq", "pa_sq", "hand")
WEAK_RE = re.compile(r"\b(grounded out|singled|grounded into (?:a )?double play|reached)[^,.;(]*?\bto (p|c|pitcher|catcher)\b"
                     r"|\bout at first (p|c) to\b|\bunassisted\b.*\bto (p|c)\b", re.I)
XBH = (2, 3, 4)                    # result index 2B, 3B, HR


def empty():
    return dict(ev6=np.zeros((12, 3, 8, 3, 2, 6)), bip=np.zeros((12, 3, 8, 3, 2, 5, 6)), weak=np.zeros(12),
                hard=np.zeros(12), bipn=np.zeros(12), runs_sum=np.zeros((3, 8)), runs_n=np.zeros((3, 8)),
                cv_sum=np.zeros((12, 3, 8)), cv_n=np.zeros((12, 3, 8)), cv_sq=np.zeros((12, 3, 8)),
                pa_sq=np.zeros((3, 8)), hand=np.zeros(4))


def is_weak(bip_type, text):
    if bip_type == "pop":
        return True
    return bip_type in ("ground", "unknown") and bool(WEAK_RE.search(text or ""))


def counts_from_season(con, S, gw=None):
    """Sufficient counts from a harness Season plus one text pass over the same games. gw: per-game weights in S.games
    order (v1.3 ruling 10: full games weighted to the whole level's K / BB / HBP), or None (every game 1)."""
    c = empty()
    p, a = S.pit, S.pa
    gw = np.ones(len(S.games)) if gw is None else np.asarray(gw, float)
    if len(p.get("y", [])):
        wp = gw[p["g"]]
        np.add.at(c["ev6"], (p["ci"], p["o"], p["bi"], p["sd"], p["lt"], p["y"]), wp)
        m = p["run_ok"] == 1
        idx = (p["ci"][m], p["o"][m], p["bi"][m])
        rr = p["rr"][m].astype(float)
        np.add.at(c["cv_sum"], idx, wp[m] * rr)
        np.add.at(c["cv_n"], idx, wp[m])
        np.add.at(c["cv_sq"], idx, wp[m] * rr * rr)
    if len(a.get("b_g", [])):
        t = np.where(a["b_t"] >= 0, a["b_t"], 4)
        np.add.at(c["bip"], (a["b_ci"], a["b_o"], a["b_bi"], a["b_sd"], a["b_lt"], t, a["b_r"]), gw[a["b_g"]])
    if len(a.get("r_g", [])):
        y = a["r_y"].astype(float)
        wr = gw[a["r_g"]]
        np.add.at(c["runs_sum"], (a["r_o"], a["r_bi"]), wr * y)
        np.add.at(c["runs_n"], (a["r_o"], a["r_bi"]), wr)
        np.add.at(c["pa_sq"], (a["r_o"], a["r_bi"]), wr * y * y)
    # text pass: proxy and handedness (same games, same bunt / count rules as the harness BIP arrays)
    ids = list(S.games)
    gwd = dict(zip(ids, gw.tolist()))
    for i in range(0, len(ids), 400):
        part = ids[i:i + 400]
        q = (f"SELECT game_id, balls, strikes, in_play, bip_type, result, text, bats, throws FROM pa "
             f"WHERE game_id IN ({','.join('?' * len(part))})")
        for gid, b, k, ip, bt, res, text, bats, throws in con.execute(q, part):
            if res in H.EXCLUDED_RESULTS:
                continue
            w = gwd[gid]
            hb, ht = bats in ("R", "L", "S", "B"), throws in ("R", "L")
            c["hand"][0 if hb and ht else 1 if hb else 2 if ht else 3] += w
            if not ip or bt == "bunt" or res in H.BUNT_RESULTS or (b, k) not in CI:
                continue
            ci = CI[(b, k)]
            c["bipn"][ci] += w
            r = H.bip_result(res)
            if bt == "line" or r in XBH:
                c["hard"][ci] += w
            if is_weak(bt, text):
                c["weak"][ci] += w
    return c


# v1.3 (Drew's Nov 23 ruling 10): WEIGHTED = True makes every college season's counts weighted (hitter_data.fullgame_weights:
# the full games tilted so their K / BB / HBP per PA equal the whole level's). Off by default: the unweighted counts and
# their caches are untouched.
WEIGHTED = False


def _weights(level, season):
    if not WEIGHTED or level not in ("D1", "D2", "D3"):
        return None
    from . import fullgame_weights as FW
    return FW.load(level, season)


def _key(con, level, season, wmap=None):
    ids = [g["id"] for g in H.games_for(con, level, season)]
    tag = CACHE_VERSION
    if wmap is not None:
        tag += "|w|" + "|".join(f"{wmap.get(i, 1.0):.12g}" for i in ids)
    return hashlib.sha1(("|".join(ids) + tag).encode()).hexdigest()[:16], len(ids)


def season_counts(con, level, season, cache=True, verbose=False):
    """Counts for one level-season (full games only). Cached on disk unless cache=False. WEIGHTED: game-weighted
    (ruling 10), cached under their own name."""
    assert_not_heldout(season)
    wmap = _weights(level, season)
    key, n = _key(con, level, season, wmap)
    pre = f"count_{level}_{int(season)}_" + ("w_" if wmap is not None else "")
    path = os.path.join(CACHE, f"{pre}{key}.npz")
    if cache and os.path.exists(path):
        z = np.load(path)
        return {k: z[k] for k in KEYS}
    S = H.build_season(con, level, season)
    gw = None if wmap is None else [wmap.get(g, 1.0) for g in S.games]
    c = counts_from_season(con, S, gw)
    if verbose:
        print(f"  built {level} {season}: {S.n_games} full games, {int(c['ev6'].sum())} pitch events")
    if cache:
        os.makedirs(CACHE, exist_ok=True)
        for old in os.listdir(CACHE):
            if old.startswith(pre) and old.endswith(".npz") and (wmap is not None or not old.startswith(pre + "w_")):
                os.remove(os.path.join(CACHE, old))
        np.savez_compressed(path, **c)
    return c


def seasons_with_games(con, level, lo=2000, hi=2025):
    out = []
    for s in range(lo, hi + 1):
        assert_not_heldout(s)
        if H.prequalify(con, level, s)["full_games"] > 0:
            out.append(s)
    return out


def load_all(con, levels=("D1", "D2", "D3"), lo=2000, hi=2025, cache=True, verbose=False):
    """{level: {season: counts}} for every season with any full game, lo..hi (hi < 2026 enforced)."""
    out = {}
    for lv in levels:
        out[lv] = {s: season_counts(con, lv, s, cache=cache, verbose=verbose) for s in seasons_with_games(con, lv, lo, hi)}
    return out


def weighted(per_season, target, half_life, window=8):
    """Recency-weighted sum of counts for predicting `target`: seasons in [target - window, target - 1], weight
    0.5 ** ((target - 1 - s) / half_life). Returns (counts, {season: weight})."""
    assert_not_heldout(target - 1)
    acc, wts = empty(), {}
    for s, c in per_season.items():
        if target - window <= s < target:
            assert_not_heldout(s)
            w = 0.5 ** ((target - 1 - s) / half_life) if half_life < 1e8 else 1.0
            wts[s] = round(w, 4)
            for k in KEYS:
                acc[k] = acc[k] + w * c[k]
    return acc, wts
