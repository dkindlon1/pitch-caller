"""v1.2's current values for the zone table's cells, read from engine.py itself (read-only; nothing is changed).

For each count, landing band, height and profile, engine.outcome_probs(..., zout=...) gives v1.2's per-band swing, whiff,
foul and hard-contact probabilities for a neutral pitch (grade 3, command 3, confidence 0.6, same side, no hitter tags,
no game history) aimed at the target that matches the height (up = mean of up-in / up-away, middle, down = mean of
down-in / down-away), from a typical arsenal (four-seam, slider, changeup, plus the pitch itself). Ball type mixes
engine.type_mix over v1.2's own weak / solid / hard split in that band. Those per-row values are then averaged with the
seed level's own data counts, exactly as the fitted table is, so v1.2's ratio and the fitted ratio answer the same question.
"""
import os
import sys

import numpy as np

from .zone_defs import BANDS, HEIGHTS, PROFILE_ENGINE, PROFILES, count_group, pclass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V12_LEVEL = "college_d1"          # the level the table would serve first; v1.2's swing offsets are the same at every level
Q_BY_HT = {"up": ("up-in", "up-away"), "mid": ("middle",), "down": ("down-in", "down-away")}


def _engine():
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    import engine
    return engine


def v12_table(level=V12_LEVEL):
    """{(b, s, band, ht, prof): {swing, whiff, foul, hard, gb, ld, fb, pu}} from engine.py."""
    E = _engine()
    out = {}
    for prof in PROFILES:
        kind, shape = PROFILE_ENGINE[prof]
        p = E.Pitch("x", kind, 3, 3, 0.6, shape=shape)
        ars = [E.Pitch("FB", "FB", 3, 3, 0.6), E.Pitch("SL", "SL", 3, 3, 0.6), E.Pitch("CH", "CH", 3, 3, 0.6)]
        ars = [x for x in ars if x.kind != p.kind] + [p]
        for b in range(4):
            for s in range(3):
                st = E.Situation(b, s, 0, (False, False, False), level=level)
                for ht in HEIGHTS:
                    acc = {}
                    for q in Q_BY_HT[ht]:
                        z = {}
                        E.outcome_probs(p, q, st, ars, zout=z)
                        for band in BANDS:
                            v = z[band]
                            weak, solid, _ = E.Q0[band]
                            H = v["H"]
                            mix = {"hard": H, "weak": weak * (1 - H) / (weak + solid), "solid": solid * (1 - H) / (weak + solid)}
                            bt = {k: 0.0 for k in ("GB", "LD", "FB", "PU")}
                            for c, pc in mix.items():
                                tm = E.type_mix(p, q, c)
                                for k in bt:
                                    bt[k] += pc * tm[k]
                            row = dict(swing=v["S"], whiff=v["W"], foul=v["F"], hard=H, gb=bt["GB"], ld=bt["LD"],
                                       fb=bt["FB"], pu=bt["PU"])
                            a = acc.setdefault(band, {k: 0.0 for k in row})
                            for k, x in row.items():
                                a[k] += x / len(Q_BY_HT[ht])
                    for band, row in acc.items():
                        row["chase"] = row["swing"]
                        out[(b, s, band, ht, prof)] = row
    return out


def v12_cells(tab, prepared, outcome, dims):
    """v1.2's rate per table cell and per count group, averaged with the data's own denominators (recency weighted).
    Returns ({cell key: rate}, {group: rate}) with the same keys as zone_fit tables."""
    from .zone_fit import OUTCOMES
    spec = OUTCOMES[outcome]
    d = prepared[prepared["band"].isin(spec["bands"])]
    w = (d[spec["den"]] * d["w"]).values
    keep = w > 0
    d, w = d[keep], w[keep]
    p = np.array([tab[(b, s, bd, h, pr)][outcome] for b, s, bd, h, pr in
                  zip(d["b"].astype(int), d["s"].astype(int), d["band"], d["ht"], d["prof"])])
    t = d.assign(_wp=w * p, _w=w)
    cells, groups = {}, {}
    for pooled in (False, True):
        gcol = [] if pooled else ["cg"]
        s = t.groupby(gcol + list(dims))[["_wp", "_w"]].sum()
        for idx, r in s.iterrows():
            idx = idx if isinstance(idx, tuple) else (idx,)
            key = (("all",) + idx) if pooled else idx
            cells[key] = r["_wp"] / r["_w"]
        if pooled:
            groups["all"] = t["_wp"].sum() / t["_w"].sum()
        else:
            g = t.groupby("cg")[["_wp", "_w"]].sum()
            for k, r in g.iterrows():
                groups[k] = r["_wp"] / r["_w"]
    return cells, groups
