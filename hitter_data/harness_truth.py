"""Known-truth check for the harness (review decision Nov 21). On Single-A Statcast, where location is known, does the
mean-preserving per-count recalibration a v1.3 count layer would apply under the frozen pitcher assumption move the
hitter's ZONE-conditional rates toward the truth, or away from it (absorbing the landing assumption's error)?

  1. real per-count 5-way frequencies (take-ball, take-strike, whiff, foul, in play) and real zone-conditional
     (count x class x band) outcomes, Single-A 2025 (a fit season, never 2026);
  2. v1.2's zone responses (D1 settings, 0 outs, bases empty, side mixed as frozen) weighted by the frozen D1 mix;
  3. recalibrate v1.2 per count to the real per-count frequencies over the frozen landing (harness_adapters.rake);
  4. score raw and recalibrated v1.2 on the real pitches given count only (what the college harness can see) and given
     count + class + band (what the live engine needs). Also compares the frozen landing with Single-A's real bands.

usage: python -m hitter_data.harness_truth [--season 2025]"""
import argparse

import numpy as np

from . import assert_not_heldout
from . import harness_frozen as FZ
from .harness_adapters import CI, COUNTS, FASTBALLS, EngineV12Adapter, rake
from .zone_defs import BANDS, FASTBALL_PROFILES
from .zone_load import load_season

CLS = ("FB", "OS")


def real_cells(season):
    season = assert_not_heldout(season)
    df = load_season("A", season)
    y = np.zeros((12, 2, 4, 5))
    for (b, s, prof, band), g in df.groupby(["b", "s", "prof", "band"]):
        ci, c, z = CI[(int(b), int(s))], 0 if prof in FASTBALL_PROFILES else 1, BANDS.index(band)
        n, sw, wh, ft, bip, cs = (g[k].sum() for k in ("n", "sw", "wh", "ft", "bip", "cs"))
        take = n - sw
        y[ci, c, z] += [take - cs, cs, wh, ft, bip]
    return y


def model_cells(level="D1"):
    """-> P[12, 2, 4, 5] v1.2 zone-conditional 5-way, W[12, 2, 4] frozen landing weight of each cell per count."""
    ad = EngineV12Adapter("college_d1")
    P = np.zeros((12, 2, 4, 6))
    W = np.zeros((12, 2, 4))
    for (b, k) in COUNTS:
        ci = CI[(b, k)]
        for side, same in (("same", True), ("opp", False)):
            ws = FZ.SAME_SHARE[level][(b, k)] if same else 1 - FZ.SAME_SHARE[level][(b, k)]
            mix = ad.assumption.mix(level, side, b, k)
            resp = ad.zone_responses(level, b, k, 0, 0, same, False, {r[:4] for r in mix})
            for a, j, q, z, w in mix:
                c = 0 if ad.assumption.arsenals[a][j]["kind"] in FASTBALLS else 1
                zi = BANDS.index(z)
                P[ci, c, zi] += ws * w * resp[(a, j, q, z)][0]
                W[ci, c, zi] += ws * w
    P = P / np.maximum(W[..., None], 1e-300)
    P5 = np.stack([P[..., 0] + P[..., 1], P[..., 2], P[..., 3], P[..., 4], P[..., 5]], axis=-1)
    return P5, W


def ll(y, p):
    p = np.clip(p, 1e-12, 1)
    return float(-(y * np.log(p)).sum() / y.sum())


def run(season=2025, out=print):
    y = real_cells(season)
    P, W = model_cells()
    real_c = y.sum(axis=(1, 2))
    real_c = real_c / real_c.sum(axis=1, keepdims=True)
    Pr = rake(P.reshape(12, 8, 5), W.reshape(12, 8), real_c, None).reshape(P.shape)
    marg = lambda Q: (Q * W[..., None]).sum(axis=(1, 2)) / W.sum(axis=(1, 2))[:, None]
    yc = y.sum(axis=(1, 2))
    ok = W > 0
    res = {
        "pitches": int(y.sum()),
        "count_only": {"v1.2": ll(yc, marg(P)), "v1.2_recal": ll(yc, marg(Pr)), "truth_count_freq": ll(yc, real_c)},
        "zone_conditional": {"v1.2": ll(y[ok], P[ok]), "v1.2_recal": ll(y[ok], Pr[ok])},
    }
    tz = y / np.maximum(y.sum(-1, keepdims=True), 1)
    res["zone_conditional"]["truth_cell_freq"] = ll(y[ok], np.where(y[ok].sum(-1, keepdims=True) > 0, tz[ok], 0.2))
    out(f"Single-A {season}: {res['pitches']:,} pitches (bunts / pitchouts / intentional dropped)")
    out("log loss per pitch          v1.2    v1.2_recal   truth (in-sample frequencies)")
    out(f"  given count only          {res['count_only']['v1.2']:.4f}  {res['count_only']['v1.2_recal']:.4f}       {res['count_only']['truth_count_freq']:.4f}")
    out(f"  given count+class+band    {res['zone_conditional']['v1.2']:.4f}  {res['zone_conditional']['v1.2_recal']:.4f}       {res['zone_conditional']['truth_cell_freq']:.4f}")
    # rates by band (pooled over counts and classes, weighted by the real pitches)
    out("\nby band (pooled over count and class, real pitch weights): swing% / whiff per swing% / called strike per take%")
    rows = {}
    for zi, z in enumerate(BANDS):
        yy = y[:, :, zi].reshape(-1, 5)
        n = yy.sum(1)
        def rates(Q):
            q = (Q[:, :, zi].reshape(-1, 5) * n[:, None]).sum(0) / n.sum()
            return q[2:].sum(), q[2] / q[2:].sum(), q[1] / q[:2].sum()
        tr = yy.sum(0) / yy.sum()
        real = (tr[2:].sum(), tr[2] / tr[2:].sum(), tr[1] / tr[:2].sum())
        rows[z] = {"real": real, "v1.2": rates(P), "v1.2_recal": rates(Pr)}
        out(f"  {z:8s} real {real[0]:.3f}/{real[1]:.3f}/{real[2]:.3f}   v1.2 " + "/".join(f"{x:.3f}" for x in rows[z]["v1.2"])
            + "   recal " + "/".join(f"{x:.3f}" for x in rows[z]["v1.2_recal"]))
    res["by_band"] = rows
    # landing: frozen D1 band shares vs Single-A real, per count
    out("\nlanded band shares, frozen D1 calib world vs Single-A real (heart / edge / off / noncomp):")
    land = {}
    for (b, k) in COUNTS:
        ci = CI[(b, k)]
        f = W[ci].sum(0) / W[ci].sum()
        r = y[ci].sum(axis=(0, 2)) / y[ci].sum()
        land[f"{b}-{k}"] = (f.tolist(), r.tolist())
        out(f"  {b}-{k}: frozen " + " ".join(f"{x:.2f}" for x in f) + "   real " + " ".join(f"{x:.2f}" for x in r))
    res["landing"] = land
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2025)
    run(ap.parse_args().season)
