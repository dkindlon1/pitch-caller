"""v1.3 full data, Drew's Nov 22 late ruling 1: diagnose the strikeout gap. REPORT ONLY: nothing here changes an engine,
table, offset or test; every variant is applied inside this diagnostic's own processes.

After the pitcher-side-only recalibration (99b22fb) K lands high at D1 / D2 / D3 / HS. This measures, in simulated
games (simulate.play_game, the engine calling against the hidden hitters), how much of the gap each piece explains:

  a  per-pitch rates vs count mix: per-count swing / whiff / foul / called strike / in play against the fitted count layer;
     share of PAs reaching two strikes and pitches per PA against real; a count-chain split of the K gap
  b  landswap: the world's landing (engine.landing at the chosen pitch and target) replaced by the real class x band shares
     for that count and side (Single-A Statcast, recency weighted 2021-25 = what the count layer is normalized to through
     the harness's h3 landing; MLB: MLB Statcast). The caller is untouched (same calls); only where the pitches land moves.
     Every pitch also records the world's probabilities under both landings (no extra dice), the per-count check.
  c  trendoff: zone table copy without level_cells (the college / HS trend extension off; Single-A shape as is)
  d  HS only: velooff (count table copy without levels.hs.pitch_velo); hsmedian (every staff pitch at the median HS speed)
  e  edgereal: the engine's edge-band called strike set to real by count (Single-A 2025, MLB 2025 for MLB), whole engine
     (a hook in the scratch snapshot, KGAP_EDGE_CS, empty by default)

HS / travel sims use the data staff (ruling 4's six pitchers, simulate.hs_data_staff): seed % 3 picks the pair (q1, q3),
(q5, q7) or (q9, q11) as starter / reliever, so the sims face the staff the calibration (and its +6.9 gap) uses.
Speed: the read-through explanations (why_line, intent_label) and the regret pricing (engine.root_costs on the truth) are
log-only; they are stubbed (checked: identical games, see `--check`).

  python -m hitter_data.kgap_diag real                     # real tables -> {OUT}/real.json   (Statcast + count-layer fits)
  python -m hitter_data.kgap_diag run LEVEL VARIANT N [W]  # N games over W worker processes (seeds 2001..), resumable
  python -m hitter_data.kgap_diag report                   # aggregate -> {OUT}/kgap_table.json / .md
Run from the scratch engine snapshot ({OUT}/engine: git archive 99b22fb + the edge hook + this file)."""
import json
import math
import os
import subprocess
import sys
import time
from collections import defaultdict

OUT = os.environ.get("KGAP_OUT", "C:/dev/pitchiq-data/kgap_diag")     # KGAP_OUT: the fixed core's K-gap table (Nov 23)
LEVELS = ("mlb", "college_d1", "college_d2", "college_d3", "hs")
VARIANTS = ("base", "landswap", "trendoff", "velooff", "hsmedian", "edgereal", "probe", "hsbal", "oscenter", "refstaff")
CK = [f"{b}-{k}" for k in range(3) for b in range(4)]
COUNTS = [(b, k) for k in range(3) for b in range(4)]
BANDS = ("heart", "edge", "off", "noncomp")
E6 = ("ball", "hbp", "cs", "whiff", "foul", "inplay")
FIRST_SEED = 2001
CORE_COUNT = {"college_d1": "D1_shared_thru2025.json", "college_d2": "D2_borrow_thru2025.json",
              "college_d3": "D3_borrow_thru2025.json", "hs": "hs_sep_thru2025.json"}
if os.environ.get("KGAP_WEIGHTED") == "1":     # v1.3 ruling 10: the weighted college candidates the fixed core ships
    CORE_COUNT.update({lv: fn.replace("_thru", "_w_thru") for lv, fn in CORE_COUNT.items() if lv != "hs"})
RV_KEY = {"mlb": "mlb_check", "college_d1": "college_d1", "college_d2": "college_d2", "college_d3": "college_d3", "hs": "hs"}
HS_MEDIAN = {"FB": 78.4, "CB": 68.1, "SL": 72.2, "CH": 73.0}     # hs/staff_velo_distribution_2022-25.json, 0.5 quantiles


def landing_group(level):
    return "MLB" if level == "mlb" else "A"


# ======================================================================================================================
# real tables
# ======================================================================================================================
def chain(p6):
    """p6 {(b, k): [ball, hbp, cs, whiff, foul, inplay]} -> PA rates through the count chain (two-strike fouls loop)."""
    reach = defaultdict(float)
    reach[(0, 0)] = 1.0
    o = dict(K=0.0, BB=0.0, HBP=0.0, BIP=0.0, pitches=0.0, reach2=0.0)
    for c in sorted(COUNTS, key=lambda c: c[0] + c[1]):
        r = reach[c]
        if r <= 0:
            continue
        b, k = c
        ball, hbp, cs, wh, fo, ip = p6[c]
        v = r / (1 - (fo if k == 2 else 0.0))
        o["pitches"] += v
        o["HBP"] += v * hbp
        o["BIP"] += v * ip
        if b == 3:
            o["BB"] += v * ball
        else:
            reach[(b + 1, k)] += v * ball
        if k == 2:
            o["K"] += v * (cs + wh)
        else:
            reach[(b, k + 1)] += v * (cs + wh + fo)
            if k == 1:
                o["reach2"] += v * (cs + wh + fo)
    o["finish2"] = o["K"] / o["reach2"] if o["reach2"] > 0 else float("nan")
    return o


def rates_from_p6(p):
    ball, hbp, cs, wh, fo, ip = p
    sw = wh + fo + ip
    take = ball + hbp + cs
    return dict(swing=sw, whiff_sw=wh / sw, foul_ct=fo / (fo + ip), cs_take=cs / take, inplay=ip, hbp_take=hbp / take)


def p6_from_rates(r):
    sw, take = r["swing"], 1 - r["swing"]
    wh = sw * r["whiff_sw"]
    fo = (sw - wh) * r["foul_ct"]
    cs = take * r["cs_take"]
    hbp = take * r["hbp_take"]
    return [take - cs - hbp, hbp, cs, wh, fo, sw - wh - fo]


def real_counts_fit(level):
    with open(os.path.join("C:/dev/pitchiq-data/fits/count_layer", CORE_COUNT[level]), encoding="utf-8") as f:
        j = json.load(f)
    p6 = {c: j["count"][f"{c[0]}-{c[1]}"]["p6"] for c in COUNTS}
    n = {c: j["count"][f"{c[0]}-{c[1]}"]["n_weighted"] for c in COUNTS}
    return p6, n, f"count-layer fit {CORE_COUNT[level]} (recency-weighted seasons <= 2025)"


def real_counts_statcast(level, season=2025):
    """MLB (or Single-A) per-count six-way split from raw Statcast rows, the zone_load filters (no bunts / pitchouts /
    intentional or automatic balls). A caught foul tip is a strike that can end the PA, so it goes with whiff here."""
    sys.path.insert(0, os.getcwd())
    from hitter_data.zone_defs import CALLED, DROP, IN_PLAY, SWING
    from hitter_data.zone_load import day_files, read_day
    acc = defaultdict(lambda: [0] * 6)
    for f in day_files(level, season):
        d = read_day(f)
        desc = d["description"].astype(str)
        bunt = d["des"].astype(str).str.contains("bunt", case=False, na=False) & desc.isin(IN_PLAY)
        d = d[~desc.isin(DROP) & ~bunt & d["balls"].between(0, 3) & d["strikes"].between(0, 2)]
        desc = d["description"].astype(str).values
        for b, k, x in zip(d["balls"].astype(int).values, d["strikes"].astype(int).values, desc):
            a = acc[(b, k)]
            if x == "hit_by_pitch":
                a[1] += 1
            elif x in CALLED:
                a[2] += 1
            elif x in ("swinging_strike", "swinging_strike_blocked", "foul_tip"):
                a[3] += 1
            elif x == "foul":
                a[4] += 1
            elif x in IN_PLAY:
                a[5] += 1
            elif x in SWING:
                a[4] += 1
            else:
                a[0] += 1
    n = {c: float(sum(acc[c])) for c in COUNTS}
    p6 = {c: [v / n[c] for v in acc[c]] for c in COUNTS}
    return p6, n, f"Statcast {level} {season} (raw rows, zone_load filters; foul tips with whiffs)"


def class_band_shares(level, seasons=(2021, 2022, 2023, 2024, 2025), ref=2025, half_life=2.0):
    """{side: {ck: {cls: {band: share}}}} (band shares within class) from the zone-seed cache, recency weighted as
    harness_freeze.single_a_targets (the count layer's h3 landing)."""
    sys.path.insert(0, os.getcwd())
    from hitter_data.zone_load import load_season
    from hitter_data.zone_defs import FASTBALL_PROFILES
    try:
        from hitter_data.harness_freeze import SINGLE_A_HALF_LIFE as hl
    except Exception:
        hl = half_life
    acc = defaultdict(float)
    edge = defaultdict(float)
    for season in seasons:
        w = 0.5 ** ((ref - season) / hl)
        df = load_season(level, season)
        df = df.assign(cls=df["prof"].map(lambda p_: "FB" if p_ in FASTBALL_PROFILES else "OS"))
        g = df.groupby(["same", "b", "s", "cls", "band"])["n"].sum()
        for (same, b, k, c, z), n in g.items():
            acc[("same" if bool(same) else "opp", f"{int(b)}-{int(k)}", c, z)] += w * float(n)
        if season == ref:
            ge = df[df["band"] == "edge"].groupby(["b", "s"])[["take", "cs"]].sum()
            for (b, k), r in ge.iterrows():
                edge[(f"{int(b)}-{int(k)}", "take")] += float(r["take"])
                edge[(f"{int(b)}-{int(k)}", "cs")] += float(r["cs"])
        del df
    out = {sd: {ck: {c: {} for c in ("FB", "OS")} for ck in CK} for sd in ("same", "opp")}
    for (sd, ck, c, z), v in acc.items():
        out[sd][ck][c][z] = v
    for sd in out:
        for ck in CK:
            for c in ("FB", "OS"):
                t = sum(out[sd][ck][c].values())
                out[sd][ck][c] = {z: out[sd][ck][c].get(z, 0.0) / t for z in BANDS}
    edge_cs = {ck: edge[(ck, "cs")] / edge[(ck, "take")] for ck in CK}
    tot = sum(edge[(ck, "cs")] for ck in CK) / sum(edge[(ck, "take")] for ck in CK)
    return out, edge_cs, tot, hl


def real():
    rv = json.load(open("college_run_values.json", encoding="utf-8"))
    res = {"levels": {}, "landing": {}, "edge_cs": {}}
    for lv in LEVELS:
        p6, n, src = real_counts_statcast("MLB") if lv == "mlb" else real_counts_fit(lv)
        ch = chain(p6)
        n00 = n[(0, 0)]
        emp_reach2 = sum(n[(b, 1)] * (p6[(b, 1)][2] + p6[(b, 1)][3] + p6[(b, 1)][4]) for b in range(4)) / n00
        res["levels"][lv] = dict(source=src, p6={f"{b}-{k}": p6[(b, k)] for b, k in COUNTS},
                                 rates={f"{b}-{k}": rates_from_p6(p6[(b, k)]) for b, k in COUNTS},
                                 chain=ch, reach2_counts=emp_reach2, pitches_per_pa_counts=sum(n.values()) / n00,
                                 K_target=rv[RV_KEY[lv]]["K"], BB_target=rv[RV_KEY[lv]]["BB"], HBP_target=rv[RV_KEY[lv]]["HBP"])
        print(lv, json.dumps({k: round(v, 4) for k, v in ch.items()}), "K target", rv[RV_KEY[lv]]["K"], flush=True)
    for grp in ("A", "MLB"):
        sh, ecs, tot, hl = class_band_shares(grp)
        res["landing"][grp] = sh
        res["edge_cs"][grp] = dict(by_count=ecs, all=tot, season=2025)
        res["landing_half_life"] = hl
        print(grp, "edge cs/take 2025", round(tot, 3), flush=True)
    diag = os.path.join("C:/dev/pitchiq-data/fits", "edge_cs_diag.json")
    if os.path.exists(diag):
        r = json.load(open(diag, encoding="utf-8"))["real"]
        res["edge_inner_outer_A2025"] = {k: r[k] for k in ("inner", "outer", "edge")}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "real.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)


# ======================================================================================================================
# simulated games
# ======================================================================================================================
def variant_env(level, variant):
    env = {}
    if variant == "trendoff":
        env["PITCH_ZONE_TABLE"] = os.path.join(OUT, "tables", "zone_v13_notrend.json")
    if variant == "velooff":
        env["PITCH_COUNT_TABLE"] = os.path.join(OUT, "tables", "count_v13core_novelo.json")
    if variant == "hsbal":          # HS count layer recalibrated under the real HS kind mix (kgap_hsmix.py); diagnostic
        env["PITCH_COUNT_TABLE"] = os.path.join(OUT, "tables", "count_v13core_hsmix.json")
    return env


def make_tables():
    os.makedirs(os.path.join(OUT, "tables"), exist_ok=True)
    z = json.load(open("data_tables/zone_v13.json", encoding="utf-8"))
    z.pop("level_cells")
    z["about"] = "K-gap diagnosis only: zone_v13 with level_cells removed (no college / HS trend extension). " + z["about"]
    json.dump(z, open(os.path.join(OUT, "tables", "zone_v13_notrend.json"), "w", encoding="utf-8"))
    c = json.load(open("data_tables/count_v13core.json", encoding="utf-8"))
    c["levels"]["hs"].pop("pitch_velo")
    c["about"] = "K-gap diagnosis only: count_v13core with levels.hs.pitch_velo removed. " + c["about"]
    json.dump(c, open(os.path.join(OUT, "tables", "count_v13core_novelo.json"), "w", encoding="utf-8"))


class _Proxy:
    def __init__(self, mod, **over):
        self._m, self._o = mod, over

    def __getattr__(self, k):
        return self._o[k] if k in self._o else getattr(self._m, k)


class _ZeroCosts(dict):
    def get(self, k, d=None):
        return 0.0

    def values(self):
        return [0.0]


def _six(P):
    return (P["ball"] + P["wp_ball"], P["hbp"], P["cstrike"], P["whiff"], P["foul"], P["weak"] + P["solid"] + P["hard"])


REF_DL = {"mlb": "MLB", "college_d1": "D1", "college_d2": "D2", "college_d3": "D3", "hs": "HS"}
REF_GROUP = {"FB": "Fastball", "SI": "Fastball", "FC": "Fastball", "SL": "Slider", "CB": "Curveball", "CH": "Change-Up"}


def ref_mix(level):
    """v1.3 ruling 17: the level's REFERENCE WORLD mix (hitter_data.mean_preserve.reference: the world the gate and the
    mean-preservation scalars use) as {(side, (b, k)): {group: [(target, landed band, weight), ...]}}: college the
    harness h3 (single_a), HS D3's h3 rows with real HS kind-group usage by count, MLB D1's rows with MLB Statcast
    landing. Each row is a (pitch kind, target, landed band) with its weight; only the kind's group is kept."""
    from hitter_data import mean_preserve as MP
    from hitter_data import export_candidates as X
    if level == "mlb":
        A = MP.MLBRefAssumption()
    elif level == "hs":
        A = MP._hs_ref_class()(MP.PRIMARY_ASSUMPTION)
    else:
        A = MP.probe_college(X, level).assumption
    dl = REF_DL[level]
    out = {}
    for side in ("same", "opp"):
        for b, k in COUNTS:
            g = defaultdict(list)
            for a, j, q, z, w in A.mix(dl, side, b, k):
                if w > 0:
                    g[REF_GROUP[A.arsenals[a][j]["kind"]]].append((q, z, w))
            out[(side, (b, k))] = dict(g)
    return out


def worker(level, variant, seeds, outdir, stub=True):
    os.environ["LEVEL"] = level
    sys.argv = ["kgap"]
    sys.path.insert(0, os.getcwd())
    import engine
    import simulate
    real_ = json.load(open(os.path.join(OUT, "real.json"), encoding="utf-8"))
    LST = real_["landing"][landing_group(level)]
    if variant == "edgereal":
        ec = real_["edge_cs"][landing_group(level)]["by_count"]
        engine.KGAP_EDGE_CS.update({(int(k[0]), int(k[2])): v for k, v in ec.items()})
    LASTCALL = {"fb": None}

    def call_v08_tracked(ars, s, *a, **k):
        """engine.call_v08, remembering whether the call's distribution allowed a fastball (ruling 14's 'where allowed')"""
        r = engine.call_v08(ars, s, *a, **k)
        LASTCALL["fb"] = sum(pr for pr, _, p_, _ in r[1] if engine.is_fastball(p_.kind))
        return r
    REFZ = {"z": None}
    if variant == "refstaff":
        # v1.3 ruling 17: the paired REFERENCE STAFF. Same staff, hitters, seeds and game loop (shake-offs included); each
        # pitch is drawn from the level's reference-world mix in this count and side (ref_mix: kind group, target and
        # landed band) instead of the engine's call, and lands in the drawn band. A group the arsenal lacks (or that is
        # shaken off) is dropped and the rest renormalized; within a group the arsenal's pitches split evenly. One
        # rng.random() per call, as call_v08 draws.
        RM = ref_mix(level)

        def call_ref(ars, s, rng=None, exclude=None, tab=None, **k):
            ex = engine.shaken_names(exclude)
            byg = defaultdict(list)
            for x in ars:
                byg[REF_GROUP[x.kind]].append(x)
            live = {g: [x for x in xs if x.name not in ex] for g, xs in byg.items()}
            live = {g: xs for g, xs in live.items() if xs} or dict(byg)
            rows = []
            mix = RM[("same" if s.same_side else "opp", (s.balls, s.strikes))]
            if not any(g in live for g in mix):     # what is left after shake-offs is never thrown here: shakes set aside
                live = dict(byg)
            for g, lst in mix.items():
                if g in live:
                    for q, z, w in lst:
                        for x in live[g]:
                            rows.append((w / len(live[g]), x, q, z))
            t = sum(r_[0] for r_ in rows)
            u, acc, pick = rng.random() * t, 0.0, rows[-1]
            for r_ in rows:
                acc += r_[0]
                if u <= acc:
                    pick = r_
                    break
            REFZ["z"] = pick[3]
            sg = tab.sigma.get((s.balls, s.strikes)) if tab is not None else None
            info = dict(sigma=sg or {("ref", "ref"): 1.0}, residual=0.0, M={}, table=tab)
            return (pick[1], pick[2], pick[0] / t, 0.0), [(pick[0] / t, 0.0, pick[1], pick[2])], tab, info
    if stub:
        simulate.CALLER = _Proxy(engine, why_line=lambda *a, **k: ("",), intent_label=lambda *a, **k: ("",),
                                 call_v08=call_ref if variant == "refstaff" else call_v08_tracked)
        simulate.engine = _Proxy(engine, root_costs=lambda *a, **k: _ZeroCosts())
    if level == "hs":
        def hs_staff():
            st = simulate.hs_data_staff()
            i = simulate.SEED_FOR_MOVE[0] % 3
            a, b = st[2 * i], st[2 * i + 1]
            if variant == "hsmedian":
                for w in (a, b):
                    for x in w["arsenal"]:
                        x.velo = HS_MEDIAN[x.kind]
            return dict(a, name="Starter (R)"), dict(b, name="Reliever (R)")
        simulate.our_staff = hs_staff
    if variant == "cguard":
        # v1.3 ruling 8, college REPORT ONLY: the HS-style fastball-share floor at Single-A's real range (10th percentile of
        # pitcher-season fastball share by count, Statcast 2021-25, >= 25 pitches), in this process only
        fl = json.load(open("C:/dev/pitchiq-data/fits/hs/college_fb_guard_report.json", encoding="utf-8"))["real"]["A"]["p10_min25"]
        engine._CT[level]["fb_floor"] = dict(fl)
    if variant == "oscenter":
        # diagnostic: the hidden lineup's off-speed damage without its built-in -0.2 (os = skill - 0.2 + noise in
        # simulate.their_lineup); same draws, so games pair with base seed for seed
        _lineup = simulate.their_lineup

        def their_lineup_centered():
            hs_ = _lineup()
            for h in hs_:
                h["os"] = max(-1.0, min(1.0, h["os"] + 0.2))
            return hs_
        simulate.their_lineup = their_lineup_centered
    ORIG = engine.outcome_probs
    G = {}

    def wrapped(p, q, ts, ars, *a, **k):
        zo = {}
        if variant == "refstaff":       # the reference staff's pitch lands in its drawn band
            zb = REFZ["z"]
            saved = engine.landing
            engine.landing = lambda p_, q_, s_: {z_: (1.0 if z_ == zb else 0.0) for z_ in BANDS}
            try:
                P = ORIG(p, q, ts, ars, *a, zout=zo, **k)
            finally:
                engine.landing = saved
        else:
            P = ORIG(p, q, ts, ars, *a, zout=zo, **k)
        cls = "OS" if engine.is_offspeed(p.kind) else "FB"
        ck = f"{ts.balls}-{ts.strikes}"
        Ls = LST["same" if ts.same_side else "opp"][ck][cls]
        saved = engine.landing
        engine.landing = lambda p_, q_, s_: dict(Ls)
        try:
            Ps = ORIG(p, q, ts, ars, *a, **k)
        finally:
            engine.landing = saved
        r = G["counts"].setdefault(ck, dict(n=0, P=[0.0] * 6, Ps=[0.0] * 6, n_cls={"FB": 0, "OS": 0},
                                             land={"FB": [0.0] * 4, "OS": [0.0] * 4}, take=[0.0] * 4, csm=[0.0] * 4,
                                             real=[0] * 6))
        r["n"] += 1
        r["n_cls"][cls] += 1
        if LASTCALL["fb"] is not None:   # ruling 14: thrown class where the final call allowed a fastball / the call's own share
            al = r.setdefault("fb_allowed", {"n": 0, "FB": 0, "call_fb": 0.0})
            if LASTCALL["fb"] > 0:
                al["n"] += 1
                al["FB"] += cls == "FB"
                al["call_fb"] += LASTCALL["fb"]
        for i, v in enumerate(_six(P)):
            r["P"][i] += v
        for i, v in enumerate(_six(Ps)):
            r["Ps"][i] += v
        for i, z in enumerate(BANDS):
            d = zo[z]
            r["land"][cls][i] += d["L"]
            t = d["L"] * (1 - d["S"])
            r["take"][i] += t
            r["csm"][i] += t * d["C"]
        if variant == "probe":
            for nm, Pn in probe_terms(p, q, ts, ars, *a, **k):
                acc = r.setdefault("probe", {}).setdefault(nm, [0.0] * 6)
                for i, v in enumerate(_six(Pn)):
                    acc[i] += v
                if nm == "all":
                    Pall = Pn
            kt = r.setdefault("kt", {}).setdefault(f"{p.kind}|{q}|{'same' if ts.same_side else 'opp'}", [0.0] * 19)
            kt[0] += 1          # n, then P6 (as thrown), Ps6 (real landing), Pall6 (sim-only inputs as the harness)
            for i, v in enumerate(_six(P) + _six(Ps) + _six(Pall)):
                kt[1 + i] += v
        return Ps if variant == "landswap" else P

    from dataclasses import replace as _rep

    def probe_terms(p, q, ts, ars, *a, **k):
        """the world's probabilities at the chosen pitch with one sim-only input set the way the harness has it (the harness
        asks the engine with a bare Situation: no previous pitch or look, no hidden hitter, no familiarity, pitch count 0,
        the arsenal's starting confidence; the count-based sit prior is the same in both); no dice."""
        hit0 = dict(hitter_damage={}, timing={})
        seq0 = dict(last=None, look=None, pa_log=())
        fam0 = dict(familiar={}, matchup={})
        cases = (("sequence", dict(ts=seq0)), ("hidden_hitter", dict(ts=hit0)), ("confidence", dict(conf=True)),
                 ("familiar_matchup", dict(ts=fam0)), ("fatigue", dict(ts=dict(pitch_count=0))),
                 ("off_day", dict(ts=dict(wild_true={"__none__": 0.0}))),
                 ("all", dict(conf=True, ts=dict(seq0, **hit0, **fam0, pitch_count=0, wild_true={"__none__": 0.0}))))
        out = []
        for nm, c in cases:
            ts_ = _rep(ts, **c["ts"]) if "ts" in c else ts
            p_ = _rep(p, conf=p.base_conf) if c.get("conf") and p.base_conf >= 0 else p
            ars_ = [p_ if x is p else x for x in ars]
            out.append((nm, ORIG(p_, q, ts_, ars_, *a, **k)))
        return out

    simulate.outcome_probs = wrapped
    os.makedirs(outdir, exist_ok=True)
    import csv
    import io
    import contextlib
    for seed in seeds:
        fp = os.path.join(outdir, f"game_{seed}.json")
        if os.path.exists(fp):
            continue
        G.clear()
        G["counts"] = {}
        tmp = os.path.join(outdir, f"_g{seed}_{os.getpid()}.csv")
        t0 = time.time()
        with contextlib.redirect_stdout(io.StringIO()):
            _, _, (_, _, runs, _), _ = simulate.run(seed, tmp)
        with open(tmp, encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        if os.environ.get("KGAP_KEEP_CSV"):          # the serial-vs-parallel proof keeps each game's pitch log
            os.replace(tmp, os.path.join(outdir, f"game_{seed}.csv"))
        else:
            os.remove(tmp)
        # wall time goes to the log only, so a game's JSON depends on nothing but its seed (byte-identical reruns)
        secs = round(time.time() - t0, 1)
        g = dict(seed=seed, level=level, variant=variant, PA=0, K=0, BB=0, HBP=0, BIP=0, pitches=len(rows), reach2=0,
                 runs=runs)
        idx = {"ball": 0, "wp_ball": 0, "hbp": 1, "cstrike": 2, "whiff": 3, "foul": 4, "weak": 5, "solid": 5, "hard": 5}
        r2 = False
        for row in rows:
            ck = row["count"]
            G["counts"][ck]["real"][idx[row["result"]]] += 1
            r2 = r2 or ck.endswith("-2")
            d = row["detail"]
            end = ("STRIKEOUT" in d) or ("WALK" in d) or ("HIT BY PITCH" in d) or ("contact:" in d)
            if end:
                g["PA"] += 1
                g["reach2"] += r2
                g["K"] += "STRIKEOUT" in d
                g["BB"] += "WALK" in d
                g["HBP"] += "HIT BY PITCH" in d
                g["BIP"] += "contact:" in d
                r2 = False
        g["counts"] = G["counts"]
        with open(fp + ".tmp", "w", encoding="utf-8") as f:
            json.dump(g, f)
        os.replace(fp + ".tmp", fp)
        print(f"{level} {variant} seed {seed}: PA {g['PA']} K {g['K']} pitches {g['pitches']} {secs} s", flush=True)


MEM_GUARD_GB = 48.0      # stop adding workers while used RAM is above this (64 GB desktop)
CHUNK = 2                # seeds per worker process: small, so the pool drains evenly (no idle tail)


def mem_used_gb():
    """used physical RAM (GB), Windows GlobalMemoryStatusEx; elsewhere /proc/meminfo; None if unknown"""
    try:
        import ctypes

        class MS(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                        ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong),
                        ("ullAvailPageFile", ctypes.c_ulonglong), ("ullTotalVirtual", ctypes.c_ulonglong),
                        ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
        m = MS()
        m.dwLength = ctypes.sizeof(MS)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
            return (m.ullTotalPhys - m.ullAvailPhys) / 2 ** 30
    except (AttributeError, OSError):
        pass
    try:
        kv = dict(l.split(":", 1) for l in open("/proc/meminfo"))
        return (int(kv["MemTotal"].split()[0]) - int(kv["MemAvailable"].split()[0])) / 2 ** 20
    except (OSError, KeyError, ValueError):
        return None


def default_workers():
    """KGAP_WORKERS, else cores - 2"""
    w = os.environ.get("KGAP_WORKERS")
    return int(w) if w else max(1, (os.cpu_count() or 4) - 2)


def run(level, variant, n, workers=None, outdir=None, first=FIRST_SEED, chunk=CHUNK):
    """Play seeds first .. first+n-1 (resumable: finished games are skipped). Each game depends only on its seed, so the
    games are spread over a pool of worker processes: up to `workers` (default cores - 2) running at once, each given
    `chunk` seeds; a new worker starts only while used RAM is under MEM_GUARD_GB. The old positional worker count (20)
    in the queue scripts is ignored in favour of the default unless KGAP_WORKERS is set."""
    w_max = default_workers() if workers is None else workers
    outdir = outdir or os.path.join(OUT, "sims", f"{level}__{variant}")
    os.makedirs(outdir, exist_ok=True)
    seeds = list(range(first, first + n))
    todo = [s for s in seeds if not os.path.exists(os.path.join(outdir, f"game_{s}.json"))]
    chunks = [todo[i:i + chunk] for i in range(0, len(todo), chunk)]
    env = dict(os.environ, PYTHONUTF8="1", **variant_env(level, variant))
    log = open(os.path.join(outdir, "_pool.log"), "a", encoding="utf-8")
    running, bad, peak_w, peak_mem, held = [], [], 0, 0.0, 0
    t0 = time.time()
    while chunks or running:
        for p in [p for p in running if p.poll() is not None]:
            bad.append(p.returncode)
            running.remove(p)
        mu = mem_used_gb()
        peak_mem = max(peak_mem, mu or 0.0)
        while chunks and len(running) < w_max and (mu is None or mu < MEM_GUARD_GB):
            sl = chunks.pop(0)
            running.append(subprocess.Popen([sys.executable, "-m", "hitter_data.kgap_diag", "worker", level, variant,
                                             ",".join(map(str, sl)), outdir], cwd=os.getcwd(), env=env, stdout=log, stderr=log))
            mu = mem_used_gb()
        if chunks and len(running) < w_max and mu is not None and mu >= MEM_GUARD_GB:
            held += 1
        peak_w = max(peak_w, len(running))
        time.sleep(0.5)
    done = sum(os.path.exists(os.path.join(outdir, f"game_{s}.json")) for s in seeds)
    print(f"done {level} {variant}: {done}/{n} games, {time.time() - t0:.0f} s, workers max {w_max} (peak {peak_w}), "
          f"peak RAM used {peak_mem:.1f} GB, memory-guard holds {held}, worker exits {sorted(set(bad))}", flush=True)
    return done == n


def prove(level="college_d1", n=6, workers=6):
    """serial vs pooled on the same seeds -> byte-for-byte comparison of every game's JSON and pitch log"""
    import filecmp
    import shutil
    base = os.path.join(OUT, "proof")
    shutil.rmtree(base, ignore_errors=True)
    os.environ["KGAP_KEEP_CSV"] = "1"
    first = 9001
    t = time.time()
    run(level, "base", n, workers=1, outdir=os.path.join(base, "serial"), first=first, chunk=n)   # one process, in order
    ts = time.time() - t
    t = time.time()
    run(level, "base", n, workers=workers, outdir=os.path.join(base, "pool"), first=first, chunk=1)  # one seed per process
    tp = time.time() - t
    names = [f"game_{s}.{x}" for s in range(first, first + n) for x in ("json", "csv")]
    same = {nm: filecmp.cmp(os.path.join(base, "serial", nm), os.path.join(base, "pool", nm), shallow=False) for nm in names}
    res = dict(level=level, seeds=[first, first + n - 1], files=len(names), identical=all(same.values()),
               differing=[k for k, v in same.items() if not v], serial_s=round(ts), pool_s=round(tp), pool_workers=workers)
    json.dump(res, open(os.path.join(base, "proof.json"), "w"), indent=1)
    print(json.dumps(res), flush=True)
    return res["identical"]


# ======================================================================================================================
# report
# ======================================================================================================================
def load_games(level, variant):
    d = os.path.join(OUT, "sims", f"{level}__{variant}")
    if not os.path.isdir(d):
        return {}
    out = {}
    for fn in os.listdir(d):
        if fn.startswith("game_") and fn.endswith(".json"):
            g = json.load(open(os.path.join(d, fn), encoding="utf-8"))
            out[g["seed"]] = g
    return out


def ratio_se(num, den):
    """ratio of sums and its game-clustered SE (delta method)."""
    n = len(num)
    R = sum(num) / sum(den)
    mden = sum(den) / n
    v = sum((x - R * y) ** 2 for x, y in zip(num, den)) / (n - 1)
    return R, math.sqrt(v / n) / mden


def paired_diff(ga, gb, key, den="PA"):
    """K rate difference b - a over common seeds, game-clustered SE of the difference (linearized, paired)."""
    seeds = sorted(set(ga) & set(gb))
    if len(seeds) < 3:
        return None
    na = [ga[s][key] for s in seeds]
    da = [ga[s][den] for s in seeds]
    nb = [gb[s][key] for s in seeds]
    db = [gb[s][den] for s in seeds]
    Ra, Rb = sum(na) / sum(da), sum(nb) / sum(db)
    ma, mb = sum(da) / len(seeds), sum(db) / len(seeds)
    z = [(y - Rb * x) / mb - (u - Ra * w) / ma for y, x, u, w in zip(nb, db, na, da)]
    m = sum(z) / len(z)
    v = sum((t - m) ** 2 for t in z) / (len(z) - 1)
    return Rb - Ra, math.sqrt(v / len(z)), len(seeds)


def count_p6(games, field="P"):
    """per-count six-way split averaged over pitches (field P = the world's expected probabilities as thrown, Ps = under the
    real landing, real = realized)."""
    out = {}
    for ck in CK:
        n = sum(g["counts"].get(ck, {}).get("n", 0) for g in games)
        s = [sum(g["counts"].get(ck, {}).get(field, [0] * 6)[i] for g in games) for i in range(6)]
        out[ck] = [x / max(n, 1) for x in s] if field != "real" else [x / max(sum(s), 1) for x in s]
    return out


def chain_from(p6ck):
    return chain({(int(k[0]), int(k[2])): v for k, v in p6ck.items()})


def decompose(sim_p6, real_p6):
    """count-chain split of K: sim per-count rates with one family (or one count group) put back to real."""
    base = chain_from(sim_p6)["K"]
    out = {}
    fams = ("swing", "whiff_sw", "foul_ct", "cs_take", "hbp_take")
    for fam in fams:
        p = {}
        for ck in CK:
            r = rates_from_p6(sim_p6[ck])
            r[fam] = rates_from_p6(real_p6[ck])[fam]
            p[ck] = p6_from_rates(r)
        out["real " + fam] = base - chain_from(p)["K"]
    for grp, sel in (("0-1 strike counts", lambda ck: ck[2] != "2"), ("2-strike counts", lambda ck: ck[2] == "2")):
        p = {ck: (real_p6[ck] if sel(ck) else sim_p6[ck]) for ck in CK}
        out["real " + grp] = base - chain_from(p)["K"]
    return out


def boot(games, fn, B=200, seed=1):
    import random
    r = random.Random(seed)
    gl = list(games)
    vals = []
    for _ in range(B):
        vals.append(fn([gl[r.randrange(len(gl))] for _ in gl]))
    keys = vals[0].keys()
    return {k: math.sqrt(sum((v[k] - sum(w[k] for w in vals) / B) ** 2 for v in vals) / (B - 1)) for k in keys}


def harness_mix(level):
    """{ck: {"KIND|target|side": weight}} the harness's h3 (single_a) mix for this level (HS: D3's, as AliasAssumption),
    sides combined by the frozen world's same-side share."""
    sys.path.insert(0, "C:/dev/pitchiq-data/kgap_diag/engine")
    from hitter_data import harness_frozen as FZ, harness_frozen_a as FZA
    dl = {"college_d1": "D1", "college_d2": "D2", "college_d3": "D3", "hs": "D3", "mlb": "D1"}[level]
    out = {}
    for b, k in COUNTS:
        ss = FZ.SAME_SHARE[dl][(b, k)]
        w = defaultdict(float)
        for side, sw in (("same", ss), ("opp", 1 - ss)):
            rows = FZA.MIX[dl][(side, (b, k))]
            t = sum(r[4] for r in rows)
            for a, j, q, z, wt in rows:
                w[f"{FZ.ARSENALS[a][j]['kind']}|{q}|{side}"] += sw * wt / t
        out[f"{b}-{k}"] = dict(w)
    return out


def report_level(lv):
    """one level's report block (pure: reads the games, returns the dict; bootstrap seeds fixed)."""
    real_ = json.load(open(os.path.join(OUT, "real.json"), encoding="utf-8"))
    R = real_["levels"][lv]
    G = {v: load_games(lv, v) for v in VARIANTS}
    base = G["base"]
    if not base:
        return None
    gl = list(base.values())
    L = dict(real=dict(K_target=R["K_target"], K_chain=R["chain"]["K"], reach2=R["reach2_counts"],
                       pitches_per_pa=R["pitches_per_pa_counts"], finish2=R["chain"]["finish2"]))
    for v, gs in G.items():
        if len(gs) < 20:          # a run still in the queue (or only its smoke game)
            continue
        g = list(gs.values())
        K, Kse = ratio_se([x["K"] for x in g], [x["PA"] for x in g])
        BB, BBse = ratio_se([x["BB"] for x in g], [x["PA"] for x in g])
        r2, r2se = ratio_se([x["reach2"] for x in g], [x["PA"] for x in g])
        pp, ppse = ratio_se([x["pitches"] for x in g], [x["PA"] for x in g])
        e = dict(games=len(g), PA=sum(x["PA"] for x in g), K=K, K_se=Kse, BB=BB, BB_se=BBse, reach2=r2, reach2_se=r2se,
                 pitches_per_pa=pp, pitches_per_pa_se=ppse,
                 finish2=sum(x["K"] for x in g) / max(sum(x["reach2"] for x in g), 1))
        if v != "base":
            e["dK_vs_base"] = paired_diff(base, gs, "K")
        # edge called strike per take as the engine computed it (band level, before HS velocity multipliers)
        tk = [sum(x["counts"][ck]["take"][1] for x in g if ck in x["counts"]) for ck in CK]
        cm = [sum(x["counts"][ck]["csm"][1] for x in g if ck in x["counts"]) for ck in CK]
        e["edge_cs_per_take"] = sum(cm) / sum(tk)
        e["edge_cs_by_count"] = {ck: (c / t if t else None) for ck, c, t in zip(CK, cm, tk)}
        tko = sum(x["counts"][ck]["take"][2] for x in g for ck in x["counts"])
        e["off_cs_per_take"] = sum(x["counts"][ck]["csm"][2] for x in g for ck in x["counts"]) / tko
        for fld in ("P", "Ps"):
            p6 = count_p6(g, fld)
            e["count_p6_" + fld] = p6
            e["chain_" + fld] = chain_from(p6)
        lnd = {}
        for cls in ("FB", "OS"):
            for ck in CK:
                n = sum(x["counts"].get(ck, {}).get("n_cls", {}).get(cls, 0) for x in g)
                s = [sum(x["counts"].get(ck, {}).get("land", {}).get(cls, [0] * 4)[i] for x in g) for i in range(4)]
                lnd[f"{cls}|{ck}"] = [t / n if n else None for t in s]
        e["landing_sim"] = lnd
        L[v] = e
    if "base" not in L:
        return None
    b = L["base"]
    b["decomp_P"] = decompose(b["count_p6_P"], R["p6"])
    b["decomp_P_se"] = boot(gl, lambda gg: decompose(count_p6(gg, "P"), R["p6"]))
    pg = list(G["probe"].values()) if len(G["probe"]) >= 20 else []
    if pg:
        names = list(pg[0]["counts"]["0-0"]["probe"])

        def probe_fn(gg):
            base_k = chain_from(count_p6(gg, "P"))["K"]
            o = {}
            for nm in names:
                p6 = {}
                for ck in CK:
                    n = sum(x["counts"].get(ck, {}).get("n", 0) for x in gg)
                    p6[ck] = [sum(x["counts"].get(ck, {}).get("probe", {}).get(nm, [0] * 6)[i] for x in gg) / max(n, 1)
                              for i in range(6)]
                o[nm] = chain_from(p6)["K"] - base_k
                o["whiff_sw_" + nm] = sum(rates_from_p6(p6[ck])["whiff_sw"] for ck in CK) / 12
            return o
        mix = harness_mix(lv)

        def mix_fn(gg, mix=mix):
            """per-count rates reweighted to the harness's kind x target x side mix (the world the count layer is
            calibrated in), from Ps (real landing) and from Pall (real landing not applied; sim-only inputs neutral)"""
            o = {}
            for fld, off in (("P", 1), ("Ps", 7), ("Pall", 13)):
                p6 = {}
                for ck in CK:
                    cells = defaultdict(lambda: [0.0] * 19)
                    for x in gg:
                        for key, v in x["counts"].get(ck, {}).get("kt", {}).items():
                            c = cells[key]
                            for i in range(19):
                                c[i] += v[i]
                    w = {kk: ww for kk, ww in mix[ck].items() if cells.get(kk, [0])[0] > 0}
                    t = sum(w.values())
                    p6[ck] = [sum(ww / t * cells[kk][off + i] / cells[kk][0] for kk, ww in w.items()) for i in range(6)]
                    o.setdefault("lost_" + fld, 0.0)
                    o["lost_" + fld] = max(o["lost_" + fld], 1 - t)
                o["K_mix_" + fld] = chain_from(p6)["K"]
            return o
        def adapt_fn(gg, beta):
            """K change if whiff per swing on each kind moved by beta * (engine usage share - harness usage share)
            in that count (the real-data predictability slope, kgap_predict.py); swings held, foul / in play scaled
            down to make room. From P (as thrown)."""
            p0, p1 = {}, {}
            for ck in CK:
                cells = defaultdict(lambda: [0.0] * 19)
                for x in gg:
                    for key, v in x["counts"].get(ck, {}).get("kt", {}).items():
                        c = cells[key]
                        for i in range(19):
                            c[i] += v[i]
                n = sum(c[0] for c in cells.values())
                ue, uh = defaultdict(float), defaultdict(float)
                for key, c in cells.items():
                    ue[key.split("|")[0]] += c[0] / n
                th = sum(mix[ck].values())
                for key, ww in mix[ck].items():
                    uh[key.split("|")[0]] += ww / th
                a0, a1 = [0.0] * 6, [0.0] * 6
                for key, c in cells.items():
                    q = [c[1 + i] / c[0] for i in range(6)]
                    sw = q[3] + q[4] + q[5]
                    kd = key.split("|")[0]
                    dw = beta * (ue[kd] - uh[kd])
                    wps = min(max(q[3] / sw + dw, 0.0), 1.0) if sw > 0 else 0.0
                    rest = (q[4] + q[5]) or 1.0
                    r = q[:3] + [wps * sw] + [q[4] / rest * (1 - wps) * sw, q[5] / rest * (1 - wps) * sw]
                    for i in range(6):
                        a0[i] += c[0] / n * q[i]
                        a1[i] += c[0] / n * r[i]
                p0[ck], p1[ck] = a0, a1
            return {"dK": chain_from(p1)["K"] - chain_from(p0)["K"]}

        pred_p = os.path.join(OUT, "predict.json")
        if os.path.exists(pred_p):
            PR = json.load(open(pred_p, encoding="utf-8"))
            src = ["hs_travel_ball"] if lv == "hs" else (["statcast_MLB_control"] if lv == "mlb" else ["statcast_A", "statcast_AAA"])
            b["adapt"] = {}
            for s in src:
                m = PR[s]["main"]
                for tag, beta in (("beta", m["beta"]), ("beta_lo95", m["beta"] - 1.96 * m["se"])):
                    b["adapt"][f"{s}|{tag}"] = dict(beta=beta, dK=adapt_fn(pg, beta)["dK"],
                                                   dK_se=boot(pg, lambda gg: adapt_fn(gg, beta), B=50)["dK"])
        b["mix"] = mix_fn(pg)
        b["mix_se"] = boot(pg, mix_fn, B=100)
        if lv == "hs":
            # the same, with each count's kind-group shares set to real HS usage (hs.sqlite3 2022-25; target / side
            # shares within a kind are the harness's)
            RK = json.load(open(os.path.join(OUT, "real_kind.json"), encoding="utf-8"))["hs"]
            mix_hs = {}
            for ck in CK:
                tot_g = defaultdict(float)
                for kk, ww in mix[ck].items():
                    tot_g[GROUP4[kk.split("|")[0]]] += ww
                real_g = {g: RK[g][ck][0] for g in tot_g if ck in RK.get(g, {})}
                tr = sum(real_g.values())
                mix_hs[ck] = {kk: ww / tot_g[GROUP4[kk.split("|")[0]]] * real_g.get(GROUP4[kk.split("|")[0]], 0.0) / tr
                              for kk, ww in mix[ck].items()}
            b["mix_hsreal"] = mix_fn(pg, mix_hs)
            b["mix_hsreal_se"] = boot(pg, lambda gg: mix_fn(gg, mix_hs), B=100)

        def kind_fn(gg):
            """world ball / in-play rate per pitch by kind group x count, as thrown (P) and with real landing (Ps)"""
            o = {}
            for ck in CK:
                acc = defaultdict(lambda: [0.0] * 5)
                for x in gg:
                    for key, v in x["counts"].get(ck, {}).get("kt", {}).items():
                        a = acc[GROUP4[key.split("|")[0]]]
                        a[0] += v[0]; a[1] += v[1]; a[2] += v[6]; a[3] += v[7]; a[4] += v[12]
                for g, a in acc.items():
                    o[f"{g}|{ck}"] = dict(n=a[0], ball_P=a[1] / a[0], inplay_P=a[2] / a[0],
                                          ball_Ps=a[3] / a[0], inplay_Ps=a[4] / a[0])
            return o
        b["kind_cmd"] = kind_fn(pg)
        b["chain_P_probe_games"] = chain_from(count_p6(pg, "P"))["K"]
        b["probe"] = probe_fn(pg)
        b["probe_se"] = boot(pg, probe_fn, B=100)
        b["probe_games"] = len(pg)
    b["chain_landing_effect"] = b["chain_P"]["K"] - b["chain_Ps"]["K"]
    b["chain_landing_effect_se"] = boot(gl, lambda gg: {"d": chain_from(count_p6(gg, "P"))["K"] - chain_from(count_p6(gg, "Ps"))["K"]})["d"]
    return L


def report():
    """levels in parallel (one process each, up to cores - 2); identical to a serial pass: each level's bootstrap
    uses its own fixed seed and nothing is shared between levels."""
    from concurrent.futures import ProcessPoolExecutor
    res = {"levels": {}}
    with ProcessPoolExecutor(max_workers=min(len(LEVELS), default_workers())) as ex:
        for lv, L in zip(LEVELS, ex.map(report_level, LEVELS)):
            if L is not None:
                res["levels"][lv] = L
    with open(os.path.join(OUT, "kgap_table.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)
    print(json.dumps({lv: {v: (round(e["K"], 4), round(e["K_se"], 4)) for v, e in L.items() if v != "real" and isinstance(e, dict) and "K" in e}
                      for lv, L in res["levels"].items()}, indent=1))


def _pm(x, se=None, scale=100.0, sign=True):
    if x is None:
        return "–"
    s = f"{x * scale:+.1f}" if sign else f"{x * scale:.1f}"
    return s + (f" ± {se * scale:.1f}" if se is not None else "")


def md(recal_gaps="results/recal_pitcher_only_gaps.json"):
    """the one table (K change in points with SE) + the per-count appendix -> {OUT}/kgap_table.md"""
    T = json.load(open(os.path.join(OUT, "kgap_table.json"), encoding="utf-8"))["levels"]
    real_ = json.load(open(os.path.join(OUT, "real.json"), encoding="utf-8"))
    gaps = json.load(open(recal_gaps, encoding="utf-8")) if os.path.exists(recal_gaps) else {}
    lvs = [lv for lv in LEVELS if lv in T]
    name = {"mlb": "MLB (control)", "college_d1": "D1", "college_d2": "D2", "college_d3": "D3", "hs": "HS"}
    rows = []

    def row(label, f):
        rows.append("| " + label + " | " + " | ".join(f(lv, T[lv]) for lv in lvs) + " |")

    def dk(v):
        def f(lv, L):
            e = L.get(v)
            if not e or not e.get("dK_vs_base"):
                return "–"
            d, se, n = e["dK_vs_base"]
            return _pm(d, se)
        return f
    row("K target (real, calibration target)", lambda lv, L: _pm(L["real"]["K_target"], sign=False))
    row("gap in the exact calibration (99b22fb)", lambda lv, L: _pm(gaps.get(lv, {}).get("K")))
    row("sims as built: K", lambda lv, L: _pm(L["base"]["K"], L["base"]["K_se"], sign=False))
    row("**sims as built: gap to target**", lambda lv, L: "**" + _pm(L["base"]["K"] - L["real"]["K_target"], L["base"]["K_se"]) + "**")
    row("0. count layer's own K (full-game pitch data, chained) − target",
        lambda lv, L: _pm(L["real"]["K_chain"] - L["real"]["K_target"]))
    row("a. sims' per-count rates (chained) − count layer (chained)",
        lambda lv, L: _pm(L["base"]["chain_P"]["K"] - L["real"]["K_chain"]))
    b = lambda key: (lambda lv, L: _pm(-L["base"]["decomp_P"][key], L["base"]["decomp_P_se"][key]))
    row("a1. K change, 0–1 strike counts put back to the count layer (reaching two strikes)", b("real 0-1 strike counts"))
    row("a2. K change, two-strike counts put back (finishing)", b("real 2-strike counts"))
    for fam, lab in (("swing", "swing"), ("whiff_sw", "whiff / swing"), ("foul_ct", "foul / contact"),
                     ("cs_take", "called strike / take"), ("hbp_take", "HBP / take")):
        row(f"a3. K change, {lab} put back in every count", b("real " + fam))
    row("a4. sims' K − chain of their per-count rates (mixing over hitters / pitchers)",
        lambda lv, L: _pm(L["base"]["K"] - L["base"]["chain_P"]["K"]))
    def pr(key):
        def f(lv, L):
            b_ = L["base"]
            if "probe" not in b_:
                return "–"
            return _pm(b_["probe"][key], b_["probe_se"][key])
        return f
    row("a5. sim-only inputs set as the harness has them, all at once (K change, per-pitch, chained)", pr("all"))
    for nm, lab in (("sequence", "previous pitch / look (tunneling, repeats, timing)"), ("hidden_hitter", "hidden hitter skill / timing"),
                    ("confidence", "in-game confidence drift"), ("familiar_matchup", "familiarity / matchup memory"),
                    ("fatigue", "fatigue"), ("off_day", "off-day wildness")):
        row(f"a5. of which: {lab}", pr(nm))

    def mx(fld):
        def f(lv, L):
            b_ = L["base"]
            if "mix" not in b_:
                return "–"
            return _pm(b_["mix"]["K_mix_" + fld] - b_["chain_P_probe_games"], b_["mix_se"]["K_mix_" + fld])
        return f
    row("**a6. pitch choice: the harness's kind × target mix, real landing (K change, chained)**",
        lambda lv, L: "**" + mx("Ps")(lv, L) + "**")
    row("a6′. harness kind × target mix, engine landing (K change, chained)", mx("P"))
    row("a6″. harness mix, engine landing, sim-only inputs neutral: chained K − count layer",
        lambda lv, L: (_pm(L["base"]["mix"]["K_mix_Pall"] - L["real"]["K_chain"]) if "mix" in L["base"] else "–"))
    row("a6‴. HS: the real HS kind mix by count (hs.sqlite3 2022-25), harness targets within kind, real landing (K change, chained)",
        lambda lv, L: (_pm(L["base"]["mix_hsreal"]["K_mix_Ps"] - L["base"]["chain_P_probe_games"], L["base"]["mix_hsreal_se"]["K_mix_Ps"])
                       if "mix_hsreal" in L["base"] else "–"))
    row("**i. hidden lineup's off-speed hole centered (os damage +0.2: no built-in −0.2) (sims K change)**",
        lambda lv, L: "**" + dk("oscenter")(lv, L) + "**")
    row("**h. HS: count layer balanced against the real HS kind mix instead of Single-A's (sims K change)**",
        lambda lv, L: "**" + dk("hsbal")(lv, L) + "**")
    def ad(tag):
        def f(lv, L):
            a = L["base"].get("adapt")
            if not a:
                return "–"
            return " / ".join(_pm(v["dK"], v["dK_se"]) for k, v in a.items() if k.endswith("|" + tag))
        return f
    row("a7. hitter adaptation sized from real data: whiff/swing moved by β × (engine − harness kind usage), β within "
        "pitcher (HS: travel; college: Single-A / AAA; MLB: MLB) (K change)", ad("beta"))
    row("a7′. same at β's 95% bound toward more adaptation (K change)", ad("beta_lo95"))
    row("**b. spots: real landing mix in the world (K change)**", lambda lv, L: "**" + dk("landswap")(lv, L) + "**")
    row("b′. same, per-pitch probabilities chained (no extra dice)",
        lambda lv, L: _pm(-L["base"]["chain_landing_effect"], L["base"]["chain_landing_effect_se"]))
    row("**c. zone trend extension off (K change)**", lambda lv, L: "**" + dk("trendoff")(lv, L) + "**")
    row("**d1. HS velocity table off (K change)**", lambda lv, L: "**" + dk("velooff")(lv, L) + "**")
    row("**d2. HS staff all at median speed (K change)**", lambda lv, L: "**" + dk("hsmedian")(lv, L) + "**")
    row("**e. edge called strike set to real (K change)**", lambda lv, L: "**" + dk("edgereal")(lv, L) + "**")
    head = ["| K, points | " + " | ".join(name[lv] for lv in lvs) + " |", "|---" * (len(lvs) + 1) + "|"]
    out = ["# K-gap diagnosis: the table (report only; generated by hitter_data.kgap_diag md)", "",
           "K changes are percentage points. Variant rows = variant − as built over the same seeds (paired, game-clustered "
           "SE). Rows 0, a and a4 add up to the sims' gap (target -> count layer -> sims' per-count rates chained -> sims' K). "
           "Every other row is a K change when one piece is replaced (negative = that piece explains part of the gap); a-rows "
           "replace it in the per-count rates and chain (bootstrap SE over games). Replacement rows overlap; they are not additive.", ""]
    out += head + rows
    out += ["", "## Two-strike reach and pitches per PA", "",
            "| | " + " | ".join(name[lv] for lv in lvs) + " |", "|---" * (len(lvs) + 1) + "|"]
    out.append("| real: PAs reaching two strikes | " + " | ".join(f"{T[lv]['real']['reach2']:.3f}" for lv in lvs) + " |")
    out.append("| sims: PAs reaching two strikes | " + " | ".join(f"{T[lv]['base']['reach2']:.3f} ± {T[lv]['base']['reach2_se']:.3f}" for lv in lvs) + " |")
    out.append("| real: K given two strikes | " + " | ".join(f"{T[lv]['real']['finish2']:.3f}" for lv in lvs) + " |")
    out.append("| sims: K given two strikes | " + " | ".join(f"{T[lv]['base']['finish2']:.3f}" for lv in lvs) + " |")
    out.append("| real: pitches per PA | " + " | ".join(f"{T[lv]['real']['pitches_per_pa']:.2f}" for lv in lvs) + " |")
    out.append("| sims: pitches per PA | " + " | ".join(f"{T[lv]['base']['pitches_per_pa']:.2f} ± {T[lv]['base']['pitches_per_pa_se']:.2f}" for lv in lvs) + " |")
    out.append("| sims: BB | " + " | ".join(f"{T[lv]['base']['BB'] * 100:.1f} ± {T[lv]['base']['BB_se'] * 100:.1f} (target {real_['levels'][lv]['BB_target'] * 100:.1f})" for lv in lvs) + " |")
    RKJ = os.path.join(OUT, "real_kind.json")
    if os.path.exists(RKJ):
        RK = json.load(open(RKJ, encoding="utf-8"))
        out += ["", "## Off-speed command: ball and in-play rate per pitch by kind (world vs real)", "",
                "World = the probe games' per-pitch probabilities: as thrown (engine's targets and landing) / with the real "
                "landing mix (Ps). Overall = averaged over the real count mix of that kind, so world and real weight counts "
                "alike. Real: HS = hs.sqlite3 2022-25 (high school + travel; every pitch with a count, ball four included, HBP "
                "rows in the denominator); college = Statcast Single-A 2021-25 (the count layer's landing population; no "
                "college pitch-type data); MLB = Statcast MLB 2025. Engine usage share of the kind in parentheses.", ""]
        for lv in lvs:
            kc = T[lv]["base"].get("kind_cmd")
            if not kc:
                continue
            R = RK["hs" if lv == "hs" else ("mlb" if lv == "mlb" else "college")]
            out += [f"### {name[lv]}", "", "| kind | ball: world / world real landing / real | ball at 3-2 | ball at 0-2 | in play: world / real landing / real | in play at 3-2 |",
                    "|---|---|---|---|---|---|"]
            for g in ("FB", "CB", "SL", "CH"):
                if g not in R or not any(f"{g}|{ck}" in kc for ck in CK):
                    continue
                cks = [ck for ck in CK if f"{g}|{ck}" in kc and ck in R[g]]
                wr = {ck: R[g][ck][0] for ck in cks}
                tw = sum(wr.values())
                av = lambda fld: sum(wr[ck] * kc[f"{g}|{ck}"][fld] for ck in cks) / tw
                rb = sum(R[g][ck][1] for ck in cks) / tw
                rx = sum(R[g][ck][2] for ck in cks) / tw
                def at(ck, fld, ri):
                    k_ = f"{g}|{ck}"
                    if k_ not in kc or ck not in R[g]:
                        return "–"
                    tot = sum(kc[f"{gg}|{ck}"]["n"] for gg in ("FB", "CB", "SL", "CH") if f"{gg}|{ck}" in kc)
                    return (f"{kc[k_][fld + '_P']:.3f} / {kc[k_][fld + '_Ps']:.3f} / {R[g][ck][ri] / R[g][ck][0]:.3f} "
                            f"({kc[k_]['n'] / tot:.0%})")
                out.append(f"| {g} | {av('ball_P'):.3f} / {av('ball_Ps'):.3f} / {rb:.3f} | {at('3-2', 'ball', 1)} | "
                           f"{at('0-2', 'ball', 1)} | {av('inplay_P'):.3f} / {av('inplay_Ps'):.3f} / {rx:.3f} | {at('3-2', 'inplay', 2)} |")
            out.append("")
    out += ["", "## Edge called strike (per take)", "",
            "Real Single-A 2025, the engine's band geometry: inner half .922, outer half .410, all .630 (inner share of edge "
            "takes .43); MLB 2025 all " + f"{real_['edge_cs']['MLB']['all']:.3f}" + ". The engine has one rate for the "
            "whole edge band (no inner / outer split).", "",
            "| | " + " | ".join(name[lv] for lv in lvs) + " |", "|---" * (len(lvs) + 1) + "|"]
    for v in ("base", "landswap", "edgereal"):
        out.append(f"| sims {v}: edge cs / take | " + " | ".join(
            (f"{T[lv][v]['edge_cs_per_take']:.3f}" if v in T[lv] else "–") for lv in lvs) + " |")
    out.append("| sims base: off-band cs / take | " + " | ".join(f"{T[lv]['base']['off_cs_per_take']:.3f}" for lv in lvs) + " |")
    out += ["", "## Per count: sims as built vs the fitted count layer", ""]
    for lv in lvs:
        R = real_["levels"][lv]["rates"]
        S = {ck: rates_from_p6(p) for ck, p in T[lv]["base"]["count_p6_P"].items()}
        Sx = {ck: rates_from_p6(p) for ck, p in T[lv]["base"]["count_p6_Ps"].items()}
        out += [f"### {name[lv]}", "", "sim / sim with real landing / fitted. " + real_["levels"][lv]["source"], "",
                "| count | swing | whiff / swing | foul / contact | called strike / take | in play |", "|---|---|---|---|---|---|"]
        for ck in CK:
            out.append(f"| {ck} | " + " | ".join(f"{S[ck][k]:.3f} / {Sx[ck][k]:.3f} / {R[ck][k]:.3f}"
                                                for k in ("swing", "whiff_sw", "foul_ct", "cs_take", "inplay")) + " |")
        out.append("")
    with open(os.path.join(OUT, "kgap_table.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out) + "\n")
    print("\n".join(head + rows))


def check(level="college_d1", seed=401, ref=None):
    """stubbed run of one seed vs an unstubbed reference csv (same snapshot): calls and results must be identical."""
    import csv
    os.environ["LEVEL"] = level
    sys.argv = ["kgap"]
    sys.path.insert(0, os.getcwd())
    import engine
    import simulate
    simulate.CALLER = _Proxy(engine, why_line=lambda *a, **k: ("",), intent_label=lambda *a, **k: ("",))
    simulate.engine = _Proxy(engine, root_costs=lambda *a, **k: _ZeroCosts())
    tmp = os.path.join(OUT, f"_check_{seed}.csv")
    t0 = time.time()
    simulate.run(seed, tmp)
    a = [(r["count"], r["call"], r["result"], r["detail"]) for r in csv.DictReader(open(tmp, encoding="utf-8"))]
    b = [(r["count"], r["call"], r["result"], r["detail"]) for r in csv.DictReader(open(ref, encoding="utf-8"))]
    print(f"stubbed {time.time() - t0:.0f} s; {len(a)} vs {len(b)} pitches; identical: {a == b}")


GROUP4 = {"FB": "FB", "SI": "FB", "FC": "FB", "SL": "SL", "CB": "CB", "CH": "CH"}
SC_GROUP = {**{k: "FB" for k in ("FF", "FA", "SI", "FT", "FC")}, **{k: "SL" for k in ("SL", "ST", "SV")},
            **{k: "CB" for k in ("CU", "KC", "CS", "SC")}, **{k: "CH" for k in ("CH", "FS", "FO")}}
HS_GROUP = {"Fastball": "FB", "Slider": "SL", "Curveball": "CB", "Change-Up": "CH"}


def realkind():
    """real ball / in-play rate (per pitch) by pitch kind group x count -> {OUT}/real_kind.json.
    HS: hs.sqlite3 2022-25 (high school + travel; ball = B incl. ball four, in play = X); college: Statcast Single-A
    2021-25 (the count layer's landing population); MLB: Statcast MLB 2025. Statcast ball = ball / blocked / automatic /
    intent / pitchout; in play = hit_into_play; bunts dropped."""
    import sqlite3
    import pandas as pd
    out = {}
    con = sqlite3.connect("file:C:/dev/pitchiq-data/hs/hs.sqlite3?mode=ro", uri=True)
    q = """select p.balls || '-' || p.strikes ck, p.pitch_type, count(*) n, sum(p.letter = 'B') b, sum(p.letter = 'X') x
           from hs_pitch p join hs_games g using(game_id) where g.season between 2022 and 2025
           and coalesce(p.count_ok, 1) = 1 and p.balls between 0 and 3 and p.strikes between 0 and 2 group by 1, 2"""
    T = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))
    for ck, pt, n, b, x in con.execute(q):
        if pt in HS_GROUP:
            t = T[HS_GROUP[pt]][ck]
            t[0] += n; t[1] += b; t[2] += x
    out["hs"] = T
    BALL = {"ball", "blocked_ball", "automatic_ball", "intent_ball", "pitchout"}
    for key, lv, seasons in (("college", "A", range(2021, 2026)), ("mlb", "MLB", (2025,))):
        d = pd.concat([pd.read_parquet(f"C:/dev/pitchiq-data/refit/cache/{lv}_{s}.parquet",
                                       columns=["pitch_type", "description", "des", "game_type", "balls", "strikes"])
                       for s in seasons], ignore_index=True)
        d = d[d.game_type.fillna("R") == "R"]
        desc = d.description.fillna("").astype(str)
        d = d[~(desc.str.contains("bunt") | d.des.fillna("").astype(str).str.contains("bunt", case=False))]
        d["g"] = d.pitch_type.astype(str).map(SC_GROUP)
        d = d[d.g.notna() & d.balls.between(0, 3) & d.strikes.between(0, 2)]
        desc = d.description.astype(str)
        d["b"] = desc.isin(BALL)
        d["x"] = desc.eq("hit_into_play")
        d["ck"] = d.balls.astype(int).astype(str) + "-" + d.strikes.astype(int).astype(str)
        a = d.groupby(["g", "ck"]).agg(n=("b", "size"), b=("b", "sum"), x=("x", "sum"))
        T = defaultdict(dict)
        for (g, ck), r in a.iterrows():
            T[g][ck] = [int(r.n), int(r.b), int(r.x)]
        out[key] = T
    with open(os.path.join(OUT, "real_kind.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    for k, T in out.items():
        for g in ("FB", "CB", "SL", "CH"):
            n = sum(v[0] for v in T[g].values()); b = sum(v[1] for v in T[g].values())
            v32 = T[g].get("3-2", [1, 0, 0])
            print(k, g, f"ball {b / n:.3f}", f"3-2 ball {v32[1] / v32[0]:.3f}", n)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "realkind":
        realkind()
        sys.exit(0)
    if cmd == "real":
        real()
    elif cmd == "tables":
        make_tables()
    elif cmd == "worker":
        worker(sys.argv[2], sys.argv[3], [int(x) for x in sys.argv[4].split(",")], sys.argv[5])
    elif cmd == "run":
        ok = run(sys.argv[2], sys.argv[3], int(sys.argv[4]))     # argv[5] (old worker count) ignored: see run()
        sys.exit(0 if ok else 1)
    elif cmd == "prove":
        sys.exit(0 if prove(*(sys.argv[2:3])) else 1)
    elif cmd == "report":
        report()
    elif cmd == "md":
        md(*(sys.argv[2:3]))
    elif cmd == "check":
        check(sys.argv[2], int(sys.argv[3]), sys.argv[4])
