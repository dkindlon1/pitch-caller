"""v1.2 Step B1 (plan 2.8): the hitter channels on public Statcast data, each tested the way every v1.1 fit was shipped:
traits from one season, the interaction fitted on the next season's pitches, then held out on the season after
(2024 traits -> 2025 pitches to fit; 2025 traits -> 2026 pitches to test). Ship rule: the held-out log-likelihood gain over
the same model without the channel is more than 2 bootstrap SD (bootstrap by game). Tags are what a coach would set: the
top / bottom third of the trait among MLB hitters (+1 / -1), unknown = 0.

Channels (each net of the controls that stand for what the engine already has: the pitch's height and ride, in-zone, the
count, and the hitter's own general rate, which the grades / damage memory carry):
  path      swing path tilt (height-adjusted) x pitch height (fastballs, x ride) and x off-speed down: whiff | swing, hard | contact
  approach  early-count (0-0, 1-0, 0-1) in-zone swing rate minus his other in-zone swing rate: swing | in-zone pitch, early counts
  offspeed  off-speed hard % minus fastball hard % (on contact): hard | contact on off-speed pitches
  spray     pull % (balls in play): hard | contact and ground ball | in play, by inside / away
Also each trait's year-to-year persistence on the pitch sample (every 4th day, about a quarter season), with the
Spearman-Brown step-up to a full season shown as an estimate, not a measurement.
usage (repo root): python3 -I research_v12/hitter_fits.py  -> results/v12/hitter_fits.json and .txt"""
import glob, json, os, sys
import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "results", "v12")
FB = {"FF", "SI", "FC"}
OS = {"SL", "ST", "SV", "CU", "KC", "CS", "CH", "FS", "FO", "SC"}
SW = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play", "foul_bunt", "missed_bunt"}
WH = {"swinging_strike", "swinging_strike_blocked", "missed_bunt"}
COLS = ["game_pk", "game_date", "game_type", "batter", "stand", "p_throws", "pitch_type", "balls", "strikes", "plate_x", "plate_z",
        "sz_top", "sz_bot", "description", "launch_speed", "bb_type", "pfx_z", "zone"]
B = 200
rng = np.random.default_rng(20261113)
LOG = []


def say(s=""):
    print(s, flush=True)
    LOG.append(s)


def load_year(y):
    fs = sorted(glob.glob(os.path.join(ROOT, "data", "statcast", f"sc_{y}-*.csv")))
    df = pd.concat([pd.read_csv(f, usecols=lambda c: c in COLS, low_memory=False) for f in fs], ignore_index=True)
    df = df[(df.game_type == "R") & df.plate_z.notna() & df.sz_top.notna() & df.pitch_type.isin(FB | OS)].copy()
    df["fb"] = df.pitch_type.isin(FB)
    df["swing"] = df.description.isin(SW)
    df["whiff"] = df.description.isin(WH)
    df["contact"] = df.swing & ~df.whiff & ~df.description.isin({"foul_bunt", "missed_bunt"})
    df["inplay"] = df.description == "hit_into_play"
    df["hard"] = df.inplay & (df.launch_speed >= 95)
    df["gb"] = df.inplay & (df.bb_type == "ground_ball")
    df["hz"] = ((df.plate_z - df.sz_bot) / (df.sz_top - df.sz_bot)).clip(-1, 2) - 0.5      # 0 = the zone's middle height
    df["iz"] = df.zone.between(1, 9)
    df["xin"] = np.where(df.stand == "R", -df.plate_x, df.plate_x)                         # + = inside to this hitter
    df["inside"] = df.xin > 0.28
    df["away"] = df.xin < -0.28
    df["early"] = ((df.balls == 0) & (df.strikes == 0)) | ((df.balls == 1) & (df.strikes == 0)) | ((df.balls == 0) & (df.strikes == 1))
    ride = df.pfx_z * 12
    df["ride"] = (ride - ride.groupby(df.pitch_type).transform("mean")) / ride.groupby(df.pitch_type).transform("std")
    df["year"] = y
    say(f"  {y}: {len(df):,} pitches, {len(fs)} days, {df.game_pk.nunique():,} games")
    return df


def lb(name, y, key):
    p = os.path.join(ROOT, "data", "leaderboards", f"{name}_{y}.csv")
    d = pd.read_csv(p, encoding="utf-8-sig")
    return d.set_index(key)


def traits(df, y):
    """one season's traits per hitter (from the leaderboards and that season's pitch sample)"""
    path = lb("path", y, "id")[["swing_tilt"]].rename(columns={"swing_tilt": "tilt"})
    cust = lb("custom", y, "player_id")[["pull_percent"]].rename(columns={"pull_percent": "pull"})
    sw = df[df.swing]
    zh = sw.groupby("batter").hz.mean().rename("swing_hz")
    t = path.join(zh, how="inner")
    # tilt adjusted for the height he swings at: the residual of tilt on his mean swing height across hitters
    t = t.astype(float)
    A = np.c_[np.ones(len(t)), t.swing_hz.values]
    beta = np.linalg.lstsq(A, t.tilt.values, rcond=None)[0]
    t["tilt_adj"] = t.tilt - A @ beta
    iz = df[df.iz]
    g = iz.groupby(["batter", "early"]).swing.agg(["sum", "count"]).unstack()
    ok = (g[("count", True)] >= 40) & (g[("count", False)] >= 60)
    appr = (g[("sum", True)] / g[("count", True)] - g[("sum", False)] / g[("count", False)])[ok].rename("approach")
    c = df[df.contact & df.inplay]
    h = c.groupby(["batter", "fb"]).hard.agg(["sum", "count"]).unstack()
    ok = (h[("count", True)] >= 25) & (h[("count", False)] >= 15)
    osh = (h[("sum", False)] / h[("count", False)] - h[("sum", True)] / h[("count", True)])[ok].rename("offspeed")
    # the general rates the engine already carries (grades / memory): his whiff, z-swing and hard rates
    gen = pd.DataFrame({"g_whiff": (sw.groupby("batter").whiff.mean()), "g_zsw": iz.groupby("batter").swing.mean(),
                        "g_hard": c.groupby("batter").hard.mean(), "g_gb": c.groupby("batter").gb.mean()})
    out = t[["tilt", "tilt_adj"]].join([cust, appr, osh], how="outer").join(gen, how="outer")
    return out


def tag(v):
    """top / bottom third among MLB hitters with the trait: +1 / -1; middle and unknown 0"""
    lo, hi = np.nanpercentile(v, [100 / 3, 200 / 3])
    return np.where(np.isnan(v), 0.0, np.where(v >= hi, 1.0, np.where(v <= lo, -1.0, 0.0)))


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def fit_logit(X, y, l2=1e-6, it=50):
    w = np.zeros(X.shape[1])
    for _ in range(it):
        z = X @ w
        p = 1 / (1 + np.exp(-z))
        g = X.T @ (y - p) - l2 * w
        H = (X * (p * (1 - p))[:, None]).T @ X + l2 * np.eye(X.shape[1])
        step = np.linalg.solve(H, g)
        w += step
        if np.max(np.abs(step)) < 1e-9:
            break
    return w


def ll(X, y, w):
    p = np.clip(1 / (1 + np.exp(-(X @ w))), 1e-9, 1 - 1e-9)
    return y * np.log(p) + (1 - y) * np.log(1 - p)


def test(name, train, test_, base_cols, add_cols, outcome):
    """fit base and base+channel on train; held-out per-pitch log-lik gain on test, bootstrap SD by game"""
    Xb, Xf = train[base_cols].values.astype(float), train[base_cols + add_cols].values.astype(float)
    y = train[outcome].values.astype(float)
    wb, wf = fit_logit(Xb, y), fit_logit(Xf, y)
    Tb, Tf = test_[base_cols].values.astype(float), test_[base_cols + add_cols].values.astype(float)
    yt = test_[outcome].values.astype(float)
    d = ll(Tf, yt, wf) - ll(Tb, yt, wb)
    by = pd.Series(d).groupby(test_.game_pk.values).sum()
    gain = by.sum()
    boots = [by.sample(len(by), replace=True, random_state=int(rng.integers(1 << 31))).sum() for _ in range(B)]
    sd = float(np.std(boots))
    coefs = {c: round(float(v), 4) for c, v in zip(base_cols + add_cols, wf)}
    ship = gain > 2 * sd
    say(f"  {name:34} train n {len(train):>7,}  test n {len(test_):>7,}  held-out gain {gain:8.1f} (boot SD {sd:6.1f}) "
        f"{'SHIPS' if ship else 'no'}; channel coef " + ", ".join(f"{c} {coefs[c]:+.3f}" for c in add_cols))
    return dict(name=name, n_train=int(len(train)), n_test=int(len(test_)), gain=round(float(gain), 2), boot_sd=round(sd, 2),
                ships=bool(ship), coefs=coefs, base_rate_test=round(float(yt.mean()), 4))


def frame(df, T):
    """attach the previous season's traits (as tags) and general rates to this season's pitches"""
    t = T.copy()
    for c in ("tilt_adj", "approach", "offspeed", "pull"):
        t["tag_" + c] = tag(t[c].values) if c in t else 0.0
    for c in ("g_whiff", "g_zsw", "g_hard", "g_gb"):
        t["L" + c] = logit(t[c].fillna(t[c].mean()).values)
    keep = [c for c in t.columns if c.startswith("tag_") or c.startswith("Lg_")]
    f = df.join(t[keep], on="batter", how="inner")
    f["one"] = 1.0
    f["hz2"] = f.hz ** 2
    f["hz_ride"] = f.hz * f.ride
    f["izf"] = f.iz.astype(float)
    f["c10"] = ((f.balls == 1) & (f.strikes == 0)).astype(float)
    f["c01"] = ((f.balls == 0) & (f.strikes == 1)).astype(float)
    f["down"] = (f.hz < 0).astype(float)
    f["insf"] = f.inside.astype(float)
    f["awf"] = f.away.astype(float)
    # the channel interactions
    f["path_hz"] = f.tag_tilt_adj * f.hz
    f["path_hz_ride"] = f.tag_tilt_adj * f.hz * f.ride
    f["path_down"] = f.tag_tilt_adj * f.down
    f["appr"] = f.tag_approach
    f["osh"] = f.tag_offspeed
    f["pull_in"] = f.tag_pull * f.insf
    f["pull_aw"] = f.tag_pull * f.awf
    return f


def main():
    os.makedirs(OUT, exist_ok=True)
    say("== v1.2 Step B1: hitter channels (plan 2.8)")
    cache = "/tmp/pc_hitter_fits_frames.pkl"      # the parsed pitch frames (rebuilt if missing)
    if os.path.exists(cache):
        D = pd.read_pickle(cache)
        for y, d in D.items():
            say(f"  {y}: {len(d):,} pitches (cached parse)")
    else:
        D = {y: load_year(y) for y in (2024, 2025, 2026)}
        pd.to_pickle(D, cache)
    T = {y: traits(D[y], y) for y in (2024, 2025, 2026)}
    res = {"persistence": {}, "channels": {}}
    say("\n== persistence on the pitch sample (hitters in both seasons; r, n; full season by Spearman-Brown x4, an estimate)")
    for c in ("tilt", "tilt_adj", "pull", "approach", "offspeed"):
        row = {}
        for a, b in ((2024, 2025), (2025, 2026)):
            j = T[a][[c]].join(T[b][[c]], lsuffix="_a", rsuffix="_b", how="inner").dropna()
            if len(j) > 30:
                r = float(np.corrcoef(j[c + "_a"], j[c + "_b"])[0, 1])
                full = 4 * r / (1 + 3 * r) if c in ("approach", "offspeed") and r > 0 else None
                row[f"{a}-{b}"] = dict(r=round(r, 3), n=int(len(j)), full_season_est=None if full is None else round(full, 3))
        res["persistence"][c] = row
        say(f"  {c:10} " + " | ".join(f"{k} r {v['r']:.2f} (n {v['n']})" + (f", full-season est {v['full_season_est']:.2f}" if v['full_season_est'] else "")
                                     for k, v in row.items()))
    F = {y: frame(D[y], T[y - 1]) for y in (2025, 2026)}
    tr, te = F[2025], F[2026]
    say("\n== channels: fitted on 2024 traits -> 2025 pitches, held out on 2025 traits -> 2026 pitches")
    C = res["channels"]
    fbsw = lambda f: f[f.fb & f.swing]
    ossw = lambda f: f[~f.fb & f.swing]
    C["path_fb_whiff"] = test("path: fastball whiff | swing", fbsw(tr), fbsw(te), ["one", "hz", "hz2", "ride", "hz_ride", "izf", "Lg_whiff"],
                              ["path_hz", "path_hz_ride"], "whiff")
    fbc = lambda f: f[f.fb & f.inplay]
    C["path_fb_hard"] = test("path: fastball hard | in play", fbc(tr), fbc(te), ["one", "hz", "hz2", "ride", "hz_ride", "izf", "Lg_hard"],
                             ["path_hz", "path_hz_ride"], "hard")
    C["path_os_whiff"] = test("path: off-speed whiff | swing (down)", ossw(tr), ossw(te), ["one", "hz", "hz2", "down", "izf", "Lg_whiff"],
                              ["path_down"], "whiff")
    ez = lambda f: f[f.iz & f.early]
    C["approach_swing"] = test("approach: early in-zone swing", ez(tr), ez(te), ["one", "c10", "c01", "hz2", "Lg_zsw"], ["appr"], "swing")
    osc = lambda f: f[~f.fb & f.inplay]
    C["offspeed_hard"] = test("offspeed: off-speed hard | in play", osc(tr), osc(te), ["one", "hz", "hz2", "izf", "Lg_hard"], ["osh"], "hard")
    ip = lambda f: f[f.inplay]
    C["spray_hard"] = test("spray: hard | in play, in / away", ip(tr), ip(te), ["one", "insf", "awf", "hz", "hz2", "Lg_hard"],
                           ["pull_in", "pull_aw"], "hard")
    C["spray_gb"] = test("spray: ground ball | in play, in / away", ip(tr), ip(te), ["one", "insf", "awf", "hz", "hz2", "Lg_gb"],
                         ["pull_in", "pull_aw"], "gb")
    # effect sizes a tag step buys, on the test season, from the fitted coefficients (for sizing the engine terms)
    say("\n== what one tag step means on the test season (top third vs unknown), for the channels that ship")
    for k, v in C.items():
        if v["ships"]:
            say(f"  {k}: " + ", ".join(f"{c} {v['coefs'][c]:+.3f}" for c in v["coefs"] if c.startswith(("path", "appr", "osh", "pull"))))
    json.dump(res, open(os.path.join(OUT, "hitter_fits.json"), "w"), indent=1)
    open(os.path.join(OUT, "hitter_fits.txt"), "w").write("\n".join(LOG) + "\n")


if __name__ == "__main__":
    main()
