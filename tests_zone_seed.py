"""v1.3 Part 2.2-2.4 tests: the zone seed on short synthetic Savant rows (no data folder needed). A planted zone effect is
recovered, the table is mean-preserving, the held-out guard trips on 2026, and the bands / count groups are the engine's.
usage: python3 tests_zone_seed.py"""
import sys

import numpy as np
import pandas as pd

from hitter_data import HeldOutSeasonError
from hitter_data import zone_fit as F
from hitter_data.zone_defs import bands_from_location, count_group
from hitter_data.zone_load import aggregate_frame, load_season

FAILS = []


def check(name, cond, detail=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  ({detail})"))
    if not cond:
        FAILS.append(name)


def sig(x):
    return 1 / (1 + np.exp(-x))


# planted truth: swing logit by count group + band offset (+ off-speed chase bump off the plate); whiff by band x class
CG_BASE = {"first": -0.6, "ahead": -0.1, "even": 0.0, "behind": 0.1, "two": 0.7}
BAND_SW = {"heart": 1.2, "edge": 0.2, "off": -0.9, "noncomp": -2.5}
WH = {("heart", "FB"): -2.2, ("edge", "FB"): -1.6, ("off", "FB"): -1.0, ("noncomp", "FB"): -0.4,
      ("heart", "OS"): -1.4, ("edge", "OS"): -0.9, ("off", "OS"): 0.0, ("noncomp", "OS"): 0.5}
LOC = {"heart": (0.0, 2.5), "edge": (0.75, 2.5), "off": (1.30, 2.5), "noncomp": (2.0, 2.5)}   # zone 1.5-3.5 ft


def synth(n_games=300, per_game=150, season=2024, seed=1):
    """Savant-like rows drawn from the planted model."""
    rng = np.random.default_rng(seed)
    n = n_games * per_game
    band = rng.choice(list(LOC), size=n, p=[0.25, 0.35, 0.25, 0.15])
    pt = rng.choice(["FF", "SI", "SL", "CH", "CU"], size=n, p=[0.4, 0.15, 0.2, 0.15, 0.1])
    cls = np.where(np.isin(pt, ["FF", "SI"]), "FB", "OS")
    b = rng.integers(0, 4, n)
    s = rng.integers(0, 3, n)
    cg = np.array([count_group(x, y) for x, y in zip(b, s)])
    px = np.array([LOC[z][0] for z in band]) * rng.choice([-1, 1], n)
    pz = np.array([LOC[z][1] for z in band])
    lsw = np.array([CG_BASE[g] for g in cg]) + np.array([BAND_SW[z] for z in band]) + \
        np.where((cls == "OS") & (band == "off"), 0.4, 0.0)
    swing = rng.random(n) < sig(lsw)
    whiff = swing & (rng.random(n) < sig(np.array([WH[(z, c)] for z, c in zip(band, cls)])))
    contact = swing & ~whiff
    foul = contact & (rng.random(n) < 0.5)
    bip = contact & ~foul
    hard = bip & (rng.random(n) < np.where(band == "heart", 0.5, 0.25))
    desc = np.where(~swing, np.where(np.isin(band, ["heart"]), "called_strike", "ball"),
                    np.where(whiff, "swinging_strike", np.where(foul, "foul", "hit_into_play")))
    bt = np.where(bip, rng.choice(["ground_ball", "line_drive", "fly_ball", "popup"], n), None)
    return pd.DataFrame(dict(pitch_type=pt, plate_x=px, plate_z=pz, sz_top=3.5, sz_bot=1.5, balls=b, strikes=s,
                             description=desc, bb_type=bt, launch_speed=np.where(bip, np.where(hard, 100.0, 80.0), np.nan),
                             stand="R", p_throws=rng.choice(["R", "L"], n), game_pk=np.repeat(np.arange(n_games) + 1000 * season, per_game),
                             game_year=season, des=""))


def t_engine_defs():
    import engine as E
    from hitter_data import zone_defs as Z
    check("heart band = engine GEO_HEART", np.allclose((Z.GEO_HEART_FRAC * 10, Z.GEO_HEART_FRAC * 12), E.GEO_HEART))
    check("edge band = engine GEO_ZONE", np.allclose((Z.GEO_ZONE_FRAC * 10, Z.GEO_ZONE_FRAC * 12), E.GEO_ZONE))
    check("way-off line = engine GEO_EXT", np.allclose((Z.GEO_EXT_FRAC * 10, Z.GEO_EXT_FRAC * 12), E.GEO_EXT))
    check("bands are engine ZONES", tuple(E.ZONES) == Z.BANDS)
    check("fastball profiles = engine FASTBALL_KINDS", set(Z.FASTBALL_PROFILES) == set(E.FASTBALL_KINDS))
    check("every profile maps to an engine kind", all(k in E.KINDS for k, _ in Z.PROFILE_ENGINE.values()))
    ok = True
    for b in range(4):
        for s in range(3):
            g = count_group(b, s)
            hitters_count = b > s and s < 2          # engine.py outcome_probs
            ok &= (g == "two") == (s == 2) and (g == "first") == (b == 0 and s == 0) and \
                (g == "ahead") == (hitters_count and not (b == 0 and s == 0))
    check("count groups follow the engine's count terms", ok)
    band, ht = bands_from_location(np.array([0.0, 0.6, 1.2, 1.8, 0.0, 0.0]), np.array([2.5, 2.5, 2.5, 2.5, 3.4, 1.6]),
                                   np.full(6, 3.5), np.full(6, 1.5))
    check("bands from location", list(band) == ["heart", "edge", "off", "noncomp", "edge", "edge"], list(band))
    check("height thirds", list(ht) == ["mid", "mid", "mid", "mid", "up", "down"], list(ht))


def t_recovery():
    df = synth()
    agg = aggregate_frame(df, 2024)
    check("aggregate keeps every synthetic pitch", int(agg["n"].sum()) == len(df), (int(agg["n"].sum()), len(df)))
    P = F.prepare(agg, 2024)
    t = F.fit_table(P, "swing", ("band", "cls"), n_boot=100)
    for g, bd in (("two", "heart"), ("first", "noncomp"), ("ahead", "off")):
        i = F.cell(t, g, bd, "FB")
        # planted FB rate in that band / planted count average over the synthetic mix
        cg = np.array([count_group(x, y) for x, y in zip(df["balls"], df["strikes"])])
        p_cell = sig(CG_BASE[g] + BAND_SW[bd])
        bands_all, _ = bands_from_location(df["plate_x"].values, df["plate_z"].values, df["sz_top"].values, df["sz_bot"].values)
        clsv = np.where(np.isin(df["pitch_type"], ["FF", "SI"]), "FB", "OS")
        m = cg == g
        p_avg = sig(CG_BASE[g] + np.array([BAND_SW[z] for z in bands_all[m]]) +
                    np.where((clsv[m] == "OS") & (bands_all[m] == "off"), 0.4, 0.0)).mean()
        want = p_cell / p_avg
        lo, hi = F.ci(t["ratio_reps"][:, i], 0.5, 99.5)
        check(f"planted swing ratio recovered: {g} {bd} FB (want {want:.3f}, got {t['ratio'][i]:.3f})",
              abs(t["ratio"][i] - want) < max(0.06 * want, 3 * np.std(t["ratio_reps"][:, i])) and lo <= want <= hi, (lo, hi))
    # the planted off-speed chase bump: OS off / FB off swing, same count = exp-ish 0.4 logit
    c = F.fit_table(P, "chase", ("band", "cls"), n_boot=0)
    i, j = F.cell(c, "all", "off", "OS"), F.cell(c, "all", "off", "FB")
    dl = np.log(c["rate"][i] / (1 - c["rate"][i])) - np.log(c["rate"][j] / (1 - c["rate"][j]))
    check(f"planted off-speed chase bump recovered (+0.40 logit, got {dl:+.2f})", abs(dl - 0.4) < 0.12)
    w = F.fit_table(P, "whiff", ("band", "cls"), n_boot=0)
    i, j = F.cell(w, "all", "off", "OS"), F.cell(w, "all", "heart", "FB")
    got = np.log(w["rate"][i] / (1 - w["rate"][i])) - np.log(w["rate"][j] / (1 - w["rate"][j]))
    check(f"planted whiff gap recovered (off OS vs heart FB +2.20 logit, got {got:+.2f})", abs(got - 2.2) < 0.25)
    # the held-out check sees the shape: fresh games from the same model gain over the count average, slope near 1
    C = F.prepare(aggregate_frame(synth(n_games=150, seed=2, season=2025), 2025), 2024)
    r = F.check_table(t, C, "swing", ("band", "cls"))
    check(f"held-out check: zone beats count average (gain {r['gain']:+.4f}, SE {r['gain_se']:.4f})",
          r["gain"] > 5 * r["gain_se"] > 0)
    check(f"held-out calibration slope near 1 ({r['cal_slope']:.2f})", 0.9 < r["cal_slope"] < 1.1)


def t_mean_preserving():
    a1 = aggregate_frame(synth(n_games=80, seed=3, season=2022), 2022)
    a2 = aggregate_frame(synth(n_games=80, seed=4, season=2024), 2024)
    P = F.prepare(pd.concat([a1, a2]), 2024)
    check("recency weight halves every 2 seasons", np.isclose(F.recency_weight(2022, 2024), 0.5) and
          np.isclose(F.recency_weight(2020, 2024), 0.25))
    worst = 0.0
    for o, dims in F.TABLES:
        t = F.fit_table(P, o, dims, n_boot=10)
        for g in range(len(F.GROUPS)):
            m = (t["gidx"] == g) & (t["N"] > 0)
            if m.any():
                worst = max(worst, abs((t["N"][m] * t["ratio"][m]).sum() / t["N"][m].sum() - 1))
                # applying the logit offsets to the count's rate gives back the count's rate over the mix
                p = sig(np.log(t["pg"][g] / (1 - t["pg"][g])) + t["d"][m])
                worst = max(worst, abs((t["N"][m] * p).sum() / t["N"][m].sum() / t["pg"][g] - 1))
    check(f"every table is mean-preserving over the mix (worst {worst:.1e})", worst < 1e-9)


def t_heldout():
    df = synth(n_games=5)
    for name, fn in (("aggregate_frame(2026)", lambda: aggregate_frame(df.assign(game_year=2026), 2026)),
                     ("prepare with a 2026 row", lambda: F.prepare(aggregate_frame(df, 2024).assign(season=2026), 2025)),
                     ("level_plan([2024, 2025, 2026])", lambda: F.level_plan([2024, 2025, 2026])),
                     ("load_season('A', 2026)", lambda: load_season("A", 2026)),
                     ("aggregate_frame(2027)", lambda: aggregate_frame(df, 2027))):
        try:
            fn()
            tripped = False
        except HeldOutSeasonError:
            tripped = True
        check(f"held-out guard trips: {name}", tripped)
    check("level_plan: two seasons -> latest is the check", F.level_plan([2023, 2024, 2025]) == ([2023, 2024], 2025, "season"))
    check("level_plan: one season -> game split", F.level_plan([2025]) == ([2025], 2025, "games"))
    a = aggregate_frame(synth(n_games=50), 2024)
    chk, fit = F.split_games(a, True), F.split_games(a, False)
    check("game split is disjoint and complete", set(chk["game_pk"]).isdisjoint(fit["game_pk"]) and
          len(chk) + len(fit) == len(a))


for t in (t_engine_defs, t_recovery, t_mean_preserving, t_heldout):
    t()
print(f"\n{'FAILED ' + str(len(FAILS)) if FAILS else 'all passed'}")
sys.exit(1 if FAILS else 0)
