"""v1.3 zone seed fit (plan 3.2): zone band x pitch class (or profile) x count group, relative to each count's average.

The model per outcome is saturated in its cells: each cell's rate is its recency-weighted rate, shrunk by K_SHRINK
pseudo-pitches toward the same cell pooled over all counts (scaled to its count's average), then rescaled so the cells average exactly to the count group's own rate over
the level's location mix (the outcome's own denominators: pitches for swing, swings for whiff, balls in play for contact
quality and ball type). That is the plan's mean-preserving shape: a count layer supplies the level, the table only the
shape. Each cell is reported as a ratio to the count average (x1.30 = 30% more often) and as a logit offset
d = logit(p_g * ratio) - logit(p_g); applying d to the count's own rate reproduces the cell exactly, and the cells average
back to the count's rate.

Uncertainty: Poisson(1) bootstrap over games (game_pk), the same resampled games for every cell, so ratios between
cells carry their correlation. Every season used in a fit or a score passes hitter_data.assert_not_heldout.
"""
import numpy as np
import pandas as pd

from . import assert_not_heldout
from .zone_defs import BANDS, CLASSES, COUNT_GROUPS, HEIGHTS, OUT_BANDS, PROFILES, count_group, pclass

K_SHRINK = 20.0            # pseudo-pitches pulling a thin cell toward its count average
HALF_LIFE = 2.0            # plan 3.1 default: each season's weight halves every 2 seasons back
N_BOOT = 200
GROUPS = COUNT_GROUPS + ("all",)

OUTCOMES = {
    "swing": dict(num="sw", den="n", bands=BANDS),
    "chase": dict(num="sw", den="n", bands=OUT_BANDS),     # swing on a pitch out of the zone (off + way-off bands)
    "whiff": dict(num="wh", den="sw", bands=BANDS),         # per swing
    "foul": dict(num="ft", den="con", bands=BANDS),         # per contact (swing without a whiff)
    "hard": dict(num="hard", den="evn", bands=BANDS),       # launch_speed >= 95 per ball in play with a speed
    "gb": dict(num="gb", den="btn", bands=BANDS),
    "ld": dict(num="ld", den="btn", bands=BANDS),
    "fb": dict(num="fb", den="btn", bands=BANDS),
    "pu": dict(num="pu", den="btn", bands=BANDS),
}
DIM_VALUES = {"band": BANDS, "cls": CLASSES, "prof": PROFILES, "ht": HEIGHTS, "same": (0, 1)}

# (outcome, dims) tables fitted for every level
TABLES = ([(o, ("band", "cls")) for o in OUTCOMES]
          + [(o, ("ht", "cls")) for o in ("hard", "gb", "ld", "fb", "pu")]
          + [(o, ("band", "prof")) for o in ("swing", "chase", "whiff", "hard", "gb")]
          + [(o, ("prof",)) for o in ("whiff", "hard", "gb", "pu")])


def recency_weight(season, ref):
    return 0.5 ** ((ref - season) / HALF_LIFE)


def prepare(agg, ref_season):
    """Adds class, count group, contact count and the recency weight. Guards every season present."""
    a = agg.copy()
    for s in a["season"].unique():
        assert_not_heldout(s)
    a["cls"] = a["prof"].map(pclass)
    cg_map = {(b, s): count_group(b, s) for b in range(4) for s in range(3)}
    a["cg"] = [cg_map[(b, s)] for b, s in zip(a["b"].astype(int), a["s"].astype(int))]
    a["con"] = a["sw"] - a["wh"]
    a["w"] = recency_weight(a["season"].astype(float), float(ref_season))
    return a


def cell_index(dims, bands):
    vals = [bands if d == "band" else DIM_VALUES[d] for d in dims]
    cells = [()]
    for v in vals:
        cells = [c + (x,) for c in cells for x in v]
    keys = [(g,) + c for g in GROUPS for c in cells]
    return keys


def game_matrix(a, outcome, dims):
    """(game ids, cell keys, Yw [G x C], Nw [G x C], Nraw [C]) for one table; 'all' pools the count groups."""
    spec = OUTCOMES[outcome]
    keys = cell_index(dims, spec["bands"])
    kpos = {k: i for i, k in enumerate(keys)}
    d = a[a["band"].isin(spec["bands"])] if "band" in a.columns else a
    d = d[d[spec["den"]] > 0]
    games = np.sort(d["game_pk"].unique())
    gpos = {g: i for i, g in enumerate(games)}
    G, C = len(games), len(keys)
    Y = np.zeros((G, C))
    N = np.zeros((G, C))
    Nraw = np.zeros(C)
    if G == 0:
        return games, keys, Y, N, Nraw
    t = d.assign(yw=d[spec["num"]] * d["w"], nw=d[spec["den"]] * d["w"], nr=d[spec["den"]])
    for pooled in (False, True):
        cols = ["game_pk"] + ([] if pooled else ["cg"]) + list(dims)
        s = t.groupby(cols, as_index=False)[["yw", "nw", "nr"]].sum()
        gi = s["game_pk"].map(gpos).values
        if pooled:
            ci = np.array([kpos[("all",) + tuple(r)] for r in s[list(dims)].itertuples(index=False, name=None)])
        else:
            ci = np.array([kpos[tuple(r)] for r in s[["cg"] + list(dims)].itertuples(index=False, name=None)])
        np.add.at(Y, (gi, ci), s["yw"].values)
        np.add.at(N, (gi, ci), s["nw"].values)
        np.add.at(Nraw, ci, s["nr"].values)
    return games, keys, Y, N, Nraw


def _fit_sums(Y, N, gidx, aidx, ng, k=K_SHRINK):
    """Y, N: [..., C] weighted sums. Returns (p_g [..., ng], rate, ratio, d) with the mean-preserving rescale.
    A cell is shrunk toward the same cell pooled over all counts (aidx), scaled to its count's average: a thin cell keeps
    the location shape and borrows only the count interaction."""
    C = Y.shape[-1]
    M = np.zeros((C, ng))
    M[np.arange(C), gidx] = 1.0
    Yg, Ng = Y @ M, N @ M
    with np.errstate(divide="ignore", invalid="ignore"):
        pg = np.where(Ng > 0, Yg / np.where(Ng > 0, Ng, 1), np.nan)
    pgc = np.nan_to_num(pg[..., gidx])
    pall = pg[..., [GROUPS.index("all")]]
    with np.errstate(divide="ignore", invalid="ignore"):
        rall = (Y[..., aidx] + k * np.nan_to_num(pall)) / (N[..., aidx] + k) / pall
    prior = np.clip(pgc * np.nan_to_num(rall, nan=1.0), 1e-6, 1 - 1e-6)
    rate = (Y + k * prior) / (N + k)
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = rate / pgc
        norm = ((N * np.nan_to_num(ratio)) @ M) / np.where(Ng > 0, Ng, 1)
        ratio = ratio / norm[..., gidx]
        p = np.clip(pgc * ratio, 1e-6, 1 - 1e-6)
        q = np.clip(pgc, 1e-6, 1 - 1e-6)
        d = np.log(p / (1 - p)) - np.log(q / (1 - q))
        ratio = np.where(np.isfinite(pg[..., gidx]), ratio, np.nan)
    return pg, pgc * ratio, ratio, d


def fit_table(a, outcome, dims, n_boot=N_BOOT, seed=7):
    """Fits one table on prepared rows. Returns a dict of numpy arrays keyed by cell (count group first)."""
    games, keys, Yg, Ng, Nraw = game_matrix(a, outcome, dims)
    gidx = np.array([GROUPS.index(k[0]) for k in keys])
    aidx = np.array([keys.index(("all",) + k[1:]) for k in keys])
    Y, N = Yg.sum(0), Ng.sum(0)
    pg, rate, ratio, d = _fit_sums(Y, N, gidx, aidx, len(GROUPS))
    out = dict(outcome=outcome, dims=dims, keys=keys, gidx=gidx, aidx=aidx, Y=Y, N=N, Nraw=Nraw, pg=pg, rate=rate, ratio=ratio,
               d=d, games=len(games))
    if n_boot and len(games):
        rng = np.random.default_rng(seed)
        W = rng.poisson(1.0, size=(n_boot, len(games))).astype(float)
        _, rr, ra, dd = _fit_sums(W @ Yg, W @ Ng, gidx, aidx, len(GROUPS))
        out.update(rate_reps=rr, ratio_reps=ra, d_reps=dd)
    return out


def cell(t, group, *vals):
    return t["keys"].index((group,) + tuple(vals))


def ci(reps, lo=2.5, hi=97.5):
    r = reps[np.isfinite(reps)]
    if r.size == 0:
        return (np.nan, np.nan)
    return (float(np.percentile(r, lo)), float(np.percentile(r, hi)))


# ---------------- held-out check ----------------

def _logistic_slope(x, Y, N, iters=30):
    """Calibration slope: logistic regression of the outcome on logit(pred), aggregated (N trials, Y events per row)."""
    b = np.array([0.0, 1.0])
    X = np.column_stack([np.ones_like(x), x])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ b)))
        g = X.T @ (Y - N * p)
        H = (X * (N * p * (1 - p))[:, None]).T @ X
        try:
            step = np.linalg.solve(H, g)
        except np.linalg.LinAlgError:
            break
        b = b + step
        if np.max(np.abs(step)) < 1e-9:
            break
    return float(b[1])


def check_table(t, check_a, outcome, dims):
    """Scores the fitted shape on held-out rows. The count layer is the check rows' own count average (the table's job
    is the shape only), so 'base' = count average alone and 'zone' = count average + the fitted offsets d.
    Returns log loss per decision for both, the gain with a game-clustered SE, and the calibration slope."""
    games, keys, Yg, Ng, _ = game_matrix(check_a.assign(w=1.0), outcome, dims)
    real = np.array([k[0] != "all" for k in keys])
    gidx = t["gidx"]
    Y, N = Yg.sum(0), Ng.sum(0)
    M = np.zeros((len(keys), len(GROUPS)))
    M[np.arange(len(keys)), gidx] = 1.0
    with np.errstate(divide="ignore", invalid="ignore"):
        pg = (Y @ M) / (N @ M)
    q = np.clip(pg[gidx], 1e-6, 1 - 1e-6)
    lq = np.log(q / (1 - q))
    pz = 1 / (1 + np.exp(-(lq + np.nan_to_num(t["d"]))))
    pz = np.clip(pz, 1e-6, 1 - 1e-6)
    sel = real & (N > 0) & np.isfinite(q)

    def ll(p, Yv, Nv):
        return -(Yv * np.log(p) + (Nv - Yv) * np.log(1 - p))

    base = ll(q[sel], Y[sel], N[sel]).sum() / N[sel].sum()
    zone = ll(pz[sel], Y[sel], N[sel]).sum() / N[sel].sum()
    per_game = (ll(q, Yg, Ng) - ll(pz, Yg, Ng))[:, sel].sum(1)
    G = len(per_game)
    se = float(np.sqrt(G) * per_game.std(ddof=1) / N[sel].sum()) if G > 1 else np.nan
    slope = _logistic_slope(np.log(pz[sel] / (1 - pz[sel])), Y[sel], N[sel])
    big = sel & (N >= 200)
    gap = float(np.max(np.abs(Y[big] / N[big] - pz[big]))) if big.any() else np.nan
    return dict(outcome=outcome, dims=dims, n=float(N[sel].sum()), games=G, ll_base=float(base), ll_zone=float(zone),
                gain=float(base - zone), gain_se=se, cal_slope=slope, max_gap_200=gap)


# ---------------- transfer check ----------------

def transfer(fits, outcome, dims, min_n=100):
    """fits: {level: table} for the same (outcome, dims), levels ordered low to high (A, AAA, MLB).
    Shape scale: d_level = beta * d_A through the origin, weighted by the A cell counts (beta 1 = same shape; > 1 sharper
    at the higher level). Per-cell trend: least-squares slope of d over level steps (A = 0, AAA = 1, MLB = 2; missing
    levels skipped). Uncertainty from each level's own game bootstrap, paired rep by rep."""
    levels = [lv for lv in ("A", "AAA", "MLB") if lv in fits]
    if len(levels) < 2:
        return None
    step = {"A": 0.0, "AAA": 1.0, "MLB": 2.0}
    base = fits[levels[0]]
    keys = base["keys"]
    ok = np.array([k[0] != "all" for k in keys])
    for lv in levels:
        ok &= fits[lv]["Nraw"] >= min_n
    if ok.sum() < 3:
        return None
    w = base["Nraw"][ok] / base["Nraw"][ok].sum()
    dA, dAr = base["d"][ok], base["d_reps"][:, ok]
    res = dict(outcome=outcome, dims=dims, levels=levels, cells=int(ok.sum()), beta={}, beta_ci={}, mad={}, mad_noise={})
    for lv in levels[1:]:
        dL, dLr = fits[lv]["d"][ok], fits[lv]["d_reps"][:, ok]
        b = float((w * dA * dL).sum() / (w * dA * dA).sum())
        br = (w * dAr * dLr).sum(1) / (w * dAr * dAr).sum(1)
        q_lo, q_hi = ci(br)
        res["beta"][lv] = b
        res["beta_ci"][lv] = (2 * b - q_hi, 2 * b - q_lo)       # basic bootstrap: undoes the dilution from noise in d_A
        res["mad"][lv] = float((w * np.abs(dL - dA)).sum())
        # what mean |diff| sampling noise alone gives (mean over draws of the drawn differences' deviation)
        res["mad_noise"][lv] = float(np.mean((w * np.abs((dLr - dL) - (dAr - dA))).sum(1)))
    x = np.array([step[lv] for lv in levels])
    xc = x - x.mean()
    D = np.stack([fits[lv]["d"][ok] for lv in levels])               # L x cells
    Dr = np.stack([fits[lv]["d_reps"][:, ok] for lv in levels])      # L x B x cells
    slope = (xc[:, None] * D).sum(0) / (xc ** 2).sum()
    slope_r = (xc[:, None, None] * Dr).sum(0) / (xc ** 2).sum()
    lo, hi = np.percentile(slope_r, 2.5, axis=0), np.percentile(slope_r, 97.5, axis=0)
    sig = (lo > 0) | (hi < 0)
    big = sig & (np.abs(slope) >= 0.10)
    res.update(trend_cells_sig=int(sig.sum()), trend_cells_big=int(big.sum()),
               trend_keys=[(keys[i], float(slope[j])) for j, i in enumerate(np.where(ok)[0]) if big[j]])
    res["verdict"] = transfer_verdict(res)
    return res


def transfer_verdict(res):
    """stable = the top level's scale is within 0.10 of 1 (or its interval holds 1) and at most 20% of cells move by
    0.10+ logit per level step. Otherwise say how it differs; with Triple-A present, call it a trend only when Triple-A's
    scale sits between Single-A's (1.0) and MLB's."""
    levels = res["levels"]
    top = levels[-1]
    b, (lo, hi) = res["beta"][top], res["beta_ci"][top]
    same_scale = lo <= 1.0 <= hi or abs(b - 1.0) < 0.10
    frac = res["trend_cells_big"] / res["cells"]
    if same_scale and frac <= 0.2:
        return "stable"
    parts = []
    if not same_scale:
        parts.append(f"{'sharper' if b > 1 else 'flatter'} at {top} (scale {b:.2f})")
    if frac > 0.2:
        parts.append(f"{res['trend_cells_big']} of {res['cells']} cells move")
    if "AAA" in res["beta"] and top == "MLB":
        ba, bm = res["beta"]["AAA"], b
        mono = min(1.0, bm) - 0.05 <= ba <= max(1.0, bm) + 0.05
        head = "trends with level" if mono else "differs by level, not in order"
    else:
        head = "differs"            # two levels: a trend can't be told from a level jump
    return head + ": " + "; ".join(parts)


# ---------------- per-level plan ----------------

def level_plan(seasons):
    """(fit seasons, check season or None, split) for a level's non-held-out seasons on disk.
    Two or more seasons: the latest is the check season, the rest fit. One season: games split 80 / 20 by game_pk."""
    s = sorted(assert_not_heldout(x) for x in seasons)
    if not s:
        return [], None, None
    if len(s) == 1:
        return s, s[0], "games"
    return s[:-1], s[-1], "season"


def split_games(a, check=True):
    """The 1-in-5 games (game_pk % 5 == 0) kept out when a level has only one fit season."""
    m = (a["game_pk"].astype(np.int64) % 5) == 0
    return a[m] if check else a[~m]
