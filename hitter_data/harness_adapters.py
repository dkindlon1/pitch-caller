"""v1.3 scoring harness, part 1: the frozen pitcher assumption, the engine-adapter interface, the v1.2 adapter, the
per-count recalibration (the pass-rule reference) and the empirical baselines. Scoring is in harness.py; the design and
the review are in docs/HARNESS_v13.md.

Every adapter is reduced to the same tables, indexed by the context the box scores carry:

    count   ci = balls * 3 + strikes                  (12)
    outs    0..2                                      (3)
    bases   bi = on1 + 2 * on2 + 4 * on3              (8)
    side    0 same hand, 1 opposite, 2 unknown        (3)   (pitcher's throws vs batter's bats; switch hitter = opposite)
    late    1 if inning >= scheduled - 2 and |margin| <= 2   (2)

    P6[ci, o, bi, sd, lt, 6]       per pitch: ball (incl. wild-pitch ball), HBP, called strike, whiff, foul, in play
    BIP[ci, o, bi, sd, lt, 4, 6]   given in play: type (ground, line, fly, pop) x result (out, 1B, 2B, 3B, HR, E)
    RE[o, bi]                      expected runs from the start of a PA to the end of the inning
    CV[ci]                         count value added to RE for a pitch state

Every metric is derived from these, so two versions differ only in what they put in them."""
import hashlib
import json
import os
import sys
from math import isfinite

import numpy as np

from . import harness_frozen as FZ
from .harness_landing import LANDING as LANDING_H1, ZONES

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

COUNTS = [(b, k) for b in range(4) for k in range(3)]
CI = {bk: i for i, bk in enumerate(COUNTS)}
P6_NAMES = ("ball", "hbp", "cstrike", "whiff", "foul", "inplay")
EV5 = ("take_ball", "take_strike", "whiff", "foul", "in_play")     # the scored pitch event (HBP folds into take_ball)
BIP_TYPES = ("ground", "line", "fly", "pop")
BIP_RESULTS = ("out", "1B", "2B", "3B", "HR", "E")
PA5 = ("K", "BB", "HBP", "hit", "out")
SIDES = ("same", "opp", "unknown")
SHAPE = (12, 3, 8, 3, 2)
FASTBALLS = ("FB", "SI", "FC")


def bases_index(b1, b2, b3):
    return int(bool(b1)) + 2 * int(bool(b2)) + 4 * int(bool(b3))


def bases_tuple(bi):
    return (bool(bi & 1), bool(bi & 2), bool(bi & 4))


def bases_key(bi):
    b1, b2, b3 = bases_tuple(bi)
    return ("1" if b1 else "0") + ("2" if b2 else "0") + ("3" if b3 else "0")


# =====================================================================================================================
# THE PITCHER ASSUMPTION (docs/HARNESS_v13.md section 3). Identical for every engine version.
# Primary ("calib_world", review decision Nov 21): v1.2's calib.py world, frozen in harness_frozen.py by
# harness_freeze.py: the simulator's default staff, the engine's own calls and their landing, weighted by count visits;
# per level x side x count a list of (arsenal, pitch, target, landed zone, weight). Variants are for sensitivity only.
# =====================================================================================================================
HARNESS_ASSUMPTION_VERSION = "h2-calibworld-2026-11-21"

# --- the retired hand-set assumption (h1), kept as the "handset" variant -------------------------------------------
HANDSET_ARSENAL = [dict(name=k, kind=k, grade=3, command=3, conf=0.6, shape="", velo=0, slot="three-quarter")
                   for k in ("FB", "SL", "CB", "CH")]
HANDSET_OS_SPLIT = {"SL": 0.45, "CB": 0.25, "CH": 0.30}
HANDSET_FB_SHARE = {(0, 0): 0.62, (1, 0): 0.66, (2, 0): 0.74, (3, 0): 0.90,
                    (0, 1): 0.55, (1, 1): 0.58, (2, 1): 0.66, (3, 1): 0.80,
                    (0, 2): 0.48, (1, 2): 0.48, (2, 2): 0.53, (3, 2): 0.64}
_CORNERS = ("up-in", "up-away", "down-in", "down-away")


def _targets(middle, down_middle, chase):
    rest = (1.0 - middle - down_middle - chase) / 4
    t = {q: rest for q in _CORNERS}
    t.update({"middle": middle, "down-middle": down_middle, "chase": chase})
    return t


HANDSET_TARGETS = {
    (3, 0): _targets(0.40, 0.20, 0.00),
    (2, 0): _targets(0.20, 0.15, 0.05), (3, 1): _targets(0.20, 0.15, 0.00), (2, 1): _targets(0.15, 0.15, 0.05),
    (1, 0): _targets(0.15, 0.15, 0.05),
    (0, 0): _targets(0.10, 0.15, 0.05), (1, 1): _targets(0.10, 0.15, 0.10), (3, 2): _targets(0.15, 0.15, 0.05),
    (0, 1): _targets(0.08, 0.12, 0.15),
    (0, 2): _targets(0.03, 0.10, 0.35), (1, 2): _targets(0.05, 0.10, 0.30), (2, 2): _targets(0.08, 0.12, 0.20),
}


class Assumption:
    """mix(level, side, b, k) -> [(arsenal id, pitch index, target, landed zone, weight)] (weights sum to 1);
    same_share(level, b, k); arsenals[id] -> [pitch spec dict]."""

    def __init__(self, name="calib_world"):
        if name not in ASSUMPTIONS:
            raise ValueError(f"unknown assumption {name!r}; known: {sorted(ASSUMPTIONS)}")
        self.name = name
        self.arsenals = {0: FZ.ARSENALS[0], 1: FZ.ARSENALS[1], "H": HANDSET_ARSENAL}

    def mix(self, level, side, b, k):
        if self.name == "handset":
            fb = HANDSET_FB_SHARE[(b, k)]
            out = []
            for j, p in enumerate(HANDSET_ARSENAL):
                wk = fb if p["kind"] == "FB" else (1 - fb) * HANDSET_OS_SPLIT[p["kind"]]
                for q, wq in HANDSET_TARGETS[(b, k)].items():
                    for zi, z in enumerate(ZONES):
                        w = wk * wq * LANDING_H1[level][p["kind"]][q][zi]
                        if w > 0:
                            out.append(("H", j, q, z, w))
        else:
            out = list(FZ.MIX[level][(side, (b, k))])
            if self.name in ("calib_more_fb", "calib_less_fb"):
                isfb = [self.arsenals[a][j]["kind"] in FASTBALLS for a, j, _, _, _ in out]
                f = sum(w for (a, j, q, z, w), x in zip(out, isfb) if x)
                f2 = min(0.95, f + 0.10) if self.name == "calib_more_fb" else max(0.05, f - 0.10)
                out = [(a, j, q, z, w * (f2 / f if x else (1 - f2) / (1 - f))) for (a, j, q, z, w), x in zip(out, isfb)]
        s = sum(r[4] for r in out)
        return [r[:4] + (r[4] / s,) for r in out]

    def same_share(self, level, b, k):
        return 0.5 if self.name == "handset" else FZ.SAME_SHARE[level][(b, k)]


ASSUMPTIONS = ("calib_world", "handset", "calib_more_fb", "calib_less_fb")


# =====================================================================================================================
# Tables and the count chain
# =====================================================================================================================
class Tables:
    def __init__(self, P6, BIP, RE, CV, name="", level=""):
        self.P6, self.BIP, self.RE, self.CV = P6, BIP, np.asarray(RE, float), np.asarray(CV, float)
        self.name, self.level = name, level
        P6 = self.P6
        self.EV5 = np.stack([P6[..., 0] + P6[..., 1], P6[..., 2], P6[..., 3], P6[..., 4], P6[..., 5]], axis=-1)
        self.BIPT = self.BIP.sum(axis=-1)                               # P(type | in play)
        out = self.BIP[..., 0]
        self.OUTT = out / np.maximum(out.sum(axis=-1, keepdims=True), 1e-300)   # P(type | out)
        self.RES = self.BIP.sum(axis=-2)                                # P(result | in play)
        self.PHIT = self.RES[..., 1:5].sum(axis=-1)
        self.PA5 = pa_chain(P6, self.PHIT)                              # [o, bi, sd, lt, 5]


def pa_chain(P6, PHIT):
    """PA outcome (K, BB, HBP, hit, out) from 0-0 through the count chain; a two-strike foul loops."""
    rest = P6.shape[1:-1]
    reach = np.zeros((12,) + rest)
    reach[CI[(0, 0)]] = 1.0
    out = np.zeros(rest + (5,))
    for b in range(4):
        for k in range(3):
            i = CI[(b, k)]
            r = reach[i]
            p = P6[i]
            ball, hbp, cs, wh, fo, ip = (p[..., j] for j in range(6))
            if k == 2:
                r = r / (1 - np.minimum(fo, 1 - 1e-12))
                fo = np.zeros_like(fo)
            out[..., 2] += r * hbp
            out[..., 3] += r * ip * PHIT[i]
            out[..., 4] += r * ip * (1 - PHIT[i])
            strike = cs + wh + fo
            if k == 2:
                out[..., 0] += r * strike
            else:
                reach[CI[(b, k + 1)]] += r * strike
            if b == 3:
                out[..., 1] += r * ball
            else:
                reach[CI[(b + 1, k)]] += r * ball
    return out


def check_tables(t):
    bad = []
    for nm, arr, ax in (("P6", t.P6, (-1,)), ("BIP", t.BIP, (-2, -1)), ("PA5", t.PA5, (-1,))):
        if not np.all(np.isfinite(arr)) or arr.min() < -1e-12:
            bad.append(f"{nm} has negative or non-finite entries")
        s = arr.sum(axis=ax)
        if np.abs(s - 1).max() > 1e-6:
            bad.append(f"{nm} not normalised (max |sum-1| = {np.abs(s - 1).max():.2e})")
    if not all(isfinite(x) for x in np.ravel(t.RE)):
        bad.append("RE non-finite")
    return bad


# =====================================================================================================================
# Adapter interface
# =====================================================================================================================
class Adapter:
    """Anything the harness can score: tables(data_level) -> Tables. fit_seasons: the college seasons its numbers were
    fit on; score_season refuses to score any of them (review finding 6)."""
    name = "adapter"
    fit_seasons = ()

    def tables(self, data_level):
        raise NotImplementedError


class EngineAdapter(Adapter):
    """An engine version. The harness owns the pitcher: for each context it asks the engine how the hitter responds to
    a given pitch (spec from the assumption's arsenal), aimed at a target, that LANDED in a given zone, and weights the
    answers by the assumption's mix. An engine's own call policy and landing never enter the score.

    Subclasses implement
      zone_responses(data_level, b, k, o, bi, same, late, needs) -> {(arsenal, pitch, target, zone): (p6[6], bip[4, 6])}
          for every key in `needs`; p6 = ball (incl. wild-pitch ball), HBP, called strike, whiff, foul, in play;
          bip = P(type, result | in play), summing to 1
      run_tables(data_level) -> (RE[3, 8], CV[12])"""

    def __init__(self, assumption="calib_world"):
        self.assumption = Assumption(assumption) if isinstance(assumption, str) else assumption
        self._cache = {}

    def cell(self, data_level, b, k, o, bi, same, late):
        mix = self.assumption.mix(data_level, "same" if same else "opp", b, k)
        resp = self.zone_responses(data_level, b, k, o, bi, same, late, {r[:4] for r in mix})
        p6 = np.zeros(6)
        bip = np.zeros((4, 6))
        for a, j, q, z, w in mix:
            r6, rb = resp[(a, j, q, z)]
            p6 += w * r6
            bip += w * r6[5] * rb
        tot = bip.sum()
        return p6 / p6.sum(), (bip / tot if tot > 0 else np.full((4, 6), 1 / 24))

    def tables(self, data_level):
        if data_level in self._cache:
            return self._cache[data_level]
        P6 = np.zeros(SHAPE + (6,))
        BIP = np.zeros(SHAPE + (4, 6))
        for (b, k) in COUNTS:
            ci = CI[(b, k)]
            w = self.assumption.same_share(data_level, b, k)
            for o in range(3):
                for bi in range(8):
                    for lt in range(2):
                        for sd, same in ((0, True), (1, False)):
                            P6[ci, o, bi, sd, lt], BIP[ci, o, bi, sd, lt] = self.cell(data_level, b, k, o, bi, same, lt == 1)
                        P6[ci, o, bi, 2, lt] = w * P6[ci, o, bi, 0, lt] + (1 - w) * P6[ci, o, bi, 1, lt]
                        j = (w * P6[ci, o, bi, 0, lt, 5] * BIP[ci, o, bi, 0, lt]
                             + (1 - w) * P6[ci, o, bi, 1, lt, 5] * BIP[ci, o, bi, 1, lt])
                        BIP[ci, o, bi, 2, lt] = j / j.sum() if j.sum() > 0 else BIP[ci, o, bi, 0, lt]
        RE, CV = self.run_tables(data_level)
        t = Tables(P6, BIP, RE, CV, name=self.name, level=data_level)
        self._cache[data_level] = t
        return t


# =====================================================================================================================
# v1.2 adapter
# =====================================================================================================================
V12_LEVEL = {"D1": "college_d1", "D3": "college_d3", "HS": "hs", "MLB": "mlb"}


def _import_engine(engine_dir=None):
    d = engine_dir or ROOT
    if d not in sys.path:
        sys.path.insert(0, d)
    import engine  # noqa: E402
    return engine


def engine_fingerprint(engine_dir=None):
    """(git sha of the engine tree, sha256 of OUTCOME_ADJ): pins which build was scored (review finding 8)."""
    import subprocess
    e = _import_engine(engine_dir)
    d = engine_dir or ROOT
    sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=d).stdout.strip()
    dirty = subprocess.run(["git", "status", "--porcelain", "--", "engine.py", "outcome_params.py", "run_tables.py",
                            "inplay_typed_params.py", "fit_v08.json"], capture_output=True, text=True, cwd=d).stdout.strip()
    adj = hashlib.sha256(json.dumps(e.OUTCOME_ADJ, sort_keys=True).encode()).hexdigest()[:16]
    return {"engine_sha": sha + ("+dirty" if dirty else ""), "outcome_adj_sha256": adj}


class EngineV12Adapter(EngineAdapter):
    """v1.2: engine.outcome_probs with engine.landing swapped for a one-zone landing (restored after), the typed
    batted-ball mix (type_mix) x in-play table (OUT_TABLE), and RE_BY_LEVEL / CV_BY_LEVEL. The hitter is the engine's
    unknown average hitter (no grades, tags, reads or history). d2_as: v1.2 level standing in for D2 (plan 1.5)."""

    def __init__(self, d2_as="college_d1", assumption="calib_world", engine_dir=None):
        super().__init__(assumption)
        self.e = _import_engine(engine_dir)
        self.d2_as = d2_as
        an = self.assumption.name
        self.name = "v1.2" + ("" if d2_as == "college_d1" else "@D3") + ("" if an == "calib_world" else f"[{an}]")
        self._ars = {}

    def engine_level(self, data_level):
        return self.d2_as if data_level == "D2" else V12_LEVEL[data_level]

    def arsenal(self, aid):
        if aid not in self._ars:
            e = self.e
            ars = []
            for sp in self.assumption.arsenals[aid]:
                p = e.Pitch(sp["name"], sp["kind"], grade=sp["grade"], command=sp["command"], conf=sp["conf"],
                            shape=sp["shape"], velo=sp["velo"])
                p.slot = sp["slot"]
                ars.append(p)
            e.resolve_speeds(ars)
            self._ars[aid] = ars
        return self._ars[aid]

    def zone_responses(self, data_level, b, k, o, bi, same, late, needs):
        e = self.e
        L = self.engine_level(data_level)
        s = e.Situation(b, k, o, bases_tuple(bi), inning=9 if late else 1, margin=0, level=L, same_side=same)
        tab = e.OUT_TABLE[L]
        out = {}
        by_zone = {}
        for a, j, q, z in needs:
            by_zone.setdefault(z, set()).add((a, j, q))
        orig = e.landing
        try:
            for z, calls in by_zone.items():
                one = {zz: (1.0 if zz == z else 0.0) for zz in e.ZONES}
                e.landing = lambda p_, q_, s_, one=one: dict(one)
                for a, j, q in calls:
                    ars = self.arsenal(a)
                    p = ars[j]
                    P = e.outcome_probs(p, q, s, ars)
                    r6 = np.array([P["ball"] + P["wp_ball"], P["hbp"], P["cstrike"], P["whiff"], P["foul"],
                                   P["weak"] + P["solid"] + P["hard"]])
                    bip = np.zeros((4, 6))
                    for c in ("weak", "solid", "hard"):
                        if P[c] <= 0:
                            continue
                        tm = e.type_mix(p, q, c)
                        for ti, t in enumerate(("GB", "LD", "FB", "PU")):
                            bip[ti] += P[c] * tm[t] * np.asarray(tab[c][t], dtype=float)
                    tot = bip.sum()
                    out[(a, j, q, z)] = (r6, bip / tot if tot > 0 else np.full((4, 6), 1 / 24))
        finally:
            e.landing = orig
        return out

    def run_tables(self, data_level):
        e = self.e
        L = self.engine_level(data_level)
        RE = [[e.RE_BY_LEVEL[L][(o, bases_key(bi))] for bi in range(8)] for o in range(3)]
        CV = [e.CV_BY_LEVEL[L][bk] for bk in COUNTS]
        return RE, CV


# =====================================================================================================================
# Per-count recalibration: the pass-rule reference (review finding 1)
# =====================================================================================================================
def rake(P, n, target, axis_groups, iters=25):
    """Multiply P [12, ..., m] by per-count factors (one per outcome) so that, averaged over the fit contexts with
    weights n [12, ...], each count's mean equals target [12, m]; renormalise per context; iterate."""
    P = P.copy()
    for _ in range(iters):
        wsum = n.reshape(12, -1).sum(axis=1)
        m = (P * n[..., None]).reshape(12, -1, P.shape[-1]).sum(axis=1) / np.maximum(wsum[:, None], 1e-12)
        r = np.where(m > 0, target / np.maximum(m, 1e-300), 1.0)
        r = np.where(wsum[:, None] > 0, r, 1.0)
        P = P * r.reshape((12,) + (1,) * (P.ndim - 2) + (P.shape[-1],))
        P = P / P.sum(axis=-1, keepdims=True)
    return P


class RecalAdapter(Adapter):
    """A version with the mean-preserving per-count recalibration a v1.3 count layer would apply, fit on the same
    seasons as the baselines: per count, the 6 pitch outcomes are raked so the fit contexts' mean equals the fit
    seasons' frequencies (72 numbers), and P(type, result | in play) likewise per count (12 x 24). Run tables are the
    base version's (runs are reported, not in the pass rule). fit: {data_level: FitView}."""

    def __init__(self, base, fit, fit_seasons):
        self.base, self.fit, self.fit_seasons = base, fit, tuple(fit_seasons)
        self.name = base.name + "_recal"
        self._cache = {}

    def tables(self, data_level):
        if data_level in self._cache:
            return self._cache[data_level]
        t = self.base.tables(data_level)
        f = self.fit[data_level]
        n = f.ev6_ctx.sum(axis=-1)                                     # pitches per context
        tgt = (f.ev6_ctx.reshape(12, -1, 6).sum(axis=1) + 0.5)
        tgt = tgt / tgt.sum(axis=1, keepdims=True)
        P6 = rake(t.P6, n, tgt, None)
        B = t.BIP.reshape(SHAPE + (24,))
        bt = f.bip_count().reshape(12, 24)
        BIP = rake(B, f.ip_ctx, bt, None).reshape(SHAPE + (4, 6))
        out = Tables(P6, BIP, t.RE, t.CV, name=self.name, level=data_level)
        self._cache[data_level] = out
        return out


# =====================================================================================================================
# Empirical baselines (recency-weighted fit seasons; review finding 7)
# =====================================================================================================================
class EmpiricalAdapter(Adapter):
    """kind='flat': one pitch-event mix, one BIP joint, one RE for everything (the floor).
    kind='count': per count (pitch events; BIP joint with P(type | result, count)); RE by base-out; empirical CV.
    kind='count_bo': per count x outs x bases, shrunk toward 'count' (prior weight alpha pitches).
    Every adapter sees only count / base-out / level / side / late, so 'count' and 'count_bo' approximate the best
    score any version can reach on the pitch metric."""

    def __init__(self, kind, fit, fit_seasons, alpha=50.0):
        self.kind, self.fit, self.alpha, self.fit_seasons = kind, fit, alpha, tuple(fit_seasons)
        self.name = f"base_{kind}"

    def tables(self, data_level):
        f = self.fit[data_level]
        ev = f.ev6_ctx.sum(axis=(3, 4))                               # [12, 3, 8, 6]
        if self.kind == "flat":
            p6 = (ev.sum(axis=(0, 1, 2)) + 0.5)
            p6 = np.broadcast_to(p6 / p6.sum(), (12, 3, 8, 6))
            bip = np.broadcast_to(f.bip_flat(), (12, 4, 6))
        else:
            pc = ev.sum(axis=(1, 2)) + 0.5
            pc = pc / pc.sum(axis=-1, keepdims=True)
            if self.kind == "count":
                p6 = np.broadcast_to(pc[:, None, None, :], (12, 3, 8, 6))
            else:
                p6 = (ev + self.alpha * pc[:, None, None, :]) / (ev.sum(-1, keepdims=True) + self.alpha)
            bip = f.bip_count()
        P6 = np.broadcast_to(np.asarray(p6)[:, :, :, None, None, :], SHAPE + (6,)).copy()
        BIP = np.broadcast_to(np.asarray(bip)[:, None, None, None, None, :, :], SHAPE + (4, 6)).copy()
        if self.kind == "flat":
            RE = np.full((3, 8), f.runs_sum.sum() / max(f.runs_n.sum(), 1e-9))
            CV = np.zeros(12)
        else:
            RE, CV = f.re(), f.cv()
        return Tables(P6, BIP, RE, CV, name=self.name, level=data_level)
