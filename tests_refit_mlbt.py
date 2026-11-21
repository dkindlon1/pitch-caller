"""v1.3 refit: synthetic checks of hitter_data.refit_mlb_targets (MLB targets, RE24, count values, HARD_SD) and the
held-out guard. Made-up plate appearances only; no real data. usage: python3 tests_refit_mlbt.py"""
import numpy as np
import pandas as pd

from hitter_data import HeldOutSeasonError
from hitter_data import refit_mlb_targets as T

COLS = ["game_pk", "inning", "inning_topbot", "at_bat_number", "pitch_number", "description", "events", "zone",
        "balls", "strikes", "outs_when_up", "on_1b", "on_2b", "on_3b", "bat_score", "post_bat_score", "launch_speed",
        "batter", "des"]


def pitch(g, inn, ab, pn, desc, ev, zone, b, k, outs, bases, score, post, ls=np.nan, bat=1):
    score, post = score + 2 * (inn - 1), post + 2 * (inn - 1)     # the batting score carries over between innings
    return dict(game_pk=g, inning=inn, inning_topbot="Top", at_bat_number=ab, pitch_number=pn, description=desc,
                events=ev, zone=zone, balls=b, strikes=k, outs_when_up=outs,
                on_1b=11.0 if "1" in bases else np.nan, on_2b=12.0 if "2" in bases else np.nan,
                on_3b=13.0 if "3" in bases else np.nan, bat_score=score, post_bat_score=post, launch_speed=ls,
                batter=bat, des="")


def half_inning(g, inn, ab0):
    """walk, home run (2 runs), strikeout, ground out, fly out: 2 runs in the half."""
    P = []
    a = ab0
    P += [pitch(g, inn, a, 1, "ball", None, 12, 0, 0, 0, "000", 0, 0), pitch(g, inn, a, 2, "ball", None, 13, 1, 0, 0, "000", 0, 0),
          pitch(g, inn, a, 3, "ball", None, 14, 2, 0, 0, "000", 0, 0), pitch(g, inn, a, 4, "ball", "walk", 11, 3, 0, 0, "000", 0, 0)]
    a += 1
    P += [pitch(g, inn, a, 1, "called_strike", None, 5, 0, 0, 0, "100", 0, 0),
          pitch(g, inn, a, 2, "hit_into_play", "home_run", 5, 0, 1, 0, "100", 0, 2, ls=105.0, bat=2)]
    a += 1
    P += [pitch(g, inn, a, 1, "swinging_strike", None, 5, 0, 0, 0, "000", 2, 2), pitch(g, inn, a, 2, "foul", None, 1, 0, 1, 0, "000", 2, 2),
          pitch(g, inn, a, 3, "swinging_strike", "strikeout", 13, 0, 2, 0, "000", 2, 2)]
    a += 1
    P += [pitch(g, inn, a, 1, "hit_into_play", "field_out", 6, 0, 0, 1, "000", 2, 2, ls=80.0, bat=3)]
    a += 1
    P += [pitch(g, inn, a, 1, "hit_into_play", "field_out", 4, 0, 0, 2, "000", 2, 2, ls=96.0, bat=3)]
    return P, a + 1


def frame():
    rows, ab = [], 1
    for g in (1, 2):
        for inn in (1, 2):
            P, ab = half_inning(g, inn, ab)
            rows += P
    return pd.DataFrame(rows, columns=COLS)


def test_rates_re_cv():
    res = T.compute({2025: frame()}, boot=5)
    r, p = res["rates"], res["pitch"]
    assert abs(r["K"] - 0.2) < 1e-12 and abs(r["BB"] - 0.2) < 1e-12 and abs(r["HR"] - 0.2) < 1e-12, r
    assert abs(r["R_per_PA"] - 2 / 5) < 1e-12, r          # 2 runs per 5-PA half (both halves of 2 games counted)
    assert abs(res["baseline"]["AVG"] - 1 / 4) < 1e-12 and abs(res["baseline"]["SLG"] - 1.0) < 1e-12
    assert abs(res["baseline"]["OBP"] - 2 / 5) < 1e-12
    # 11 pitches per half; in zone: zone 1-9 -> 5, 5, 5, 1, 6, 4 = 6 of 11
    assert abs(p["zone"] - 6 / 11) < 1e-12, p
    assert abs(p["f_strike"] - 4 / 5) < 1e-12, p           # first pitches: ball, strike, swing, in play, in play
    assert abs(p["z_contact"] - 4 / 5) < 1e-12, p          # zone swings: HR, whiff, foul, out, out
    assert abs(p["o_swing"] - 1 / 5) < 1e-12, p
    # RE: from 0|000 the half scores 2 every time; after the walk (0|100) also 2; 0|000 after the HR scores 0
    re = res["RE"]
    assert abs(re["0|000"] - 1.0) < 1e-12 and abs(re["0|100"] - 2.0) < 1e-12, re
    assert abs(re["1|000"]) < 1e-12 and abs(re["2|000"]) < 1e-12
    cv = res["CV"]
    assert cv["0-0"] == 0.0 and abs(cv["3-0"] - 1.0) < 1e-12, cv      # 3-0 only in the walk PA (2 - RE 1.0) vs 0-0's +0.2 mean
    assert res["RE_se"]["0|000"] < 1e-12                               # identical games: no bootstrap spread


def test_hard_sd():
    h = pd.DataFrame({"n": [100, 100], "h": [50, 0]}, index=[1, 2])
    sd, sd100 = T.hard_sd({2025: h}, {2025: 1.0})
    # league 0.25; shrunk (50 + 12.5) / 150 and 12.5 / 150, weighted by hard balls (all on hitter 1) -> SD 0
    assert sd < 1e-12 and abs(sd100 - 0.25) < 1e-12


def test_heldout_guard():
    try:
        T.compute({2026: frame()}, boot=0)
    except HeldOutSeasonError:
        return
    raise AssertionError("2026 was not refused")


if __name__ == "__main__":
    for t in (test_rates_re_cv, test_hard_sd, test_heldout_guard):
        t()
        print("[PASS]", t.__name__)
    print("tests_refit_mlbt: all passed")
