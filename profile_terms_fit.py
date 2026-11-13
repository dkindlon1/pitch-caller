"""v1.1 Step 2: the shape-aware fits (docs/PLAN_v1.1_2026-11-12.md, Step 2 and 2.3).

  python3 profile_terms_fit.py      -> results/v11/step2_report.txt, results/v11/step2_fit.json

Data and hygiene as seq_fit.py (v0.8 step 2): 2024 train, 2025 held out; logistic with pitcher and batter random
intercepts (MAP, prior SD 0.25); ship on held-out log-loss gain > 2 game-clustered bootstrap SDs (1,000 resamples).
Pitches are tagged with the Step 1b rule (profiles_fit.tag on the thresholds, a label that names a profile wins).

Controls: count, outs, runners, margin, times through, pitch-count bucket, previous pitch, usage share, location splines
and class x location (seq_fit.controls) WITHOUT seq_fit's per-class pitch-quality block (speed, spin, movement,
extension): in the engine a profile IS its movement and the stuff grade is relative to the profile (plan 2.1), so the
profile terms must carry the movement effect rather than have it controlled away.

Targets: whiff | swing; chase = swing | pitch outside the zone; called strike | take; hard (EV >= 95) | ball in play;
ground ball | ball in play (2e, descriptive).

  2a  A: v1.0 classes (FB incl. SI/FC, SL, CB, CH);  B: kind and profile (28 levels);  C: A + continuous shape by class
      (dmph off his main fastball, vertical (fastball class: IVB vs the typical pitch of its kind; off-speed: dIVB off the
      main fastball), HB arm side +, arm angle). C ships if it beats A; else B if it beats A.
  2b  fastball-class profile x height (up / down vs middle) x inside, on whiff, hard, called strike, on top of 2a.
  2c  profile x opposite-side hitter, on whiff, hard, chase, called strike, on top of 2a.
  2e  ground-ball rate by kind and profile (2024), the descriptive table.
  priors (plan 2.3) for every term that doesn't ship: the per-profile raw rate differences, checked for no harm on 2025.
"""
import glob, json, math, os, sys
from collections import defaultdict
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import seq_fit as SF                    # Fit, boot_gain, hinge
import profiles_fit as PF               # tag(), the Step 1b thresholds
import engine as E

OUT = os.path.join(HERE, "results", "v11")
lines = []


def say(*a):
    t = " ".join(str(x) for x in a)
    print(t, flush=True)
    lines.append(t)


SWING = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play"}
WHIFF = {"swinging_strike", "swinging_strike_blocked"}
TAKE = {"ball", "called_strike", "blocked_ball"}
LABEL_TAG = {"ST": "sweeper", "SV": "slurve", "FS": "split", "FO": "split"}


def load():
    cols = ["pitch_type", "game_type", "description", "game_year", "game_pk", "at_bat_number", "pitch_number", "pitcher",
            "batter", "balls", "strikes", "outs_when_up", "on_1b", "on_2b", "on_3b", "fld_score", "bat_score",
            "n_thruorder_pitcher", "release_speed", "release_spin_rate", "pfx_x", "pfx_z", "plate_x", "plate_z", "sz_top",
            "sz_bot", "stand", "p_throws", "zone", "launch_speed", "bb_type", "arm_angle"]
    fr = []
    for fn in sorted(glob.glob(os.path.join(HERE, "data", "statcast", "sc_*.csv"))):
        if os.path.getsize(fn) < 1000:
            continue
        fr.append(pd.read_csv(fn, usecols=cols, encoding="utf-8-sig", low_memory=False))
    d = pd.concat(fr, ignore_index=True)
    for c in ("release_speed", "release_spin_rate", "pfx_x", "pfx_z", "plate_x", "plate_z", "sz_top", "sz_bot", "launch_speed",
              "arm_angle", "balls", "strikes", "outs_when_up", "zone", "n_thruorder_pitcher", "fld_score", "bat_score"):
        d[c] = pd.to_numeric(d[c], errors="coerce")
    d = d[(d.game_type == "R") & d.pitch_type.isin(PF.KIND) & ~d.description.str.contains("bunt", na=False)].copy()
    d = d.dropna(subset=["release_speed", "pfx_x", "pfx_z", "plate_x", "plate_z", "sz_top", "sz_bot"])
    d = d.sort_values(["game_pk", "at_bat_number", "pitch_number"]).reset_index(drop=True)
    d["kind"] = d.pitch_type.map(PF.KIND)
    d["cls"] = np.where(d.kind.isin(["FB", "SI", "FC"]), "FB", d.kind)
    d["ivb"] = d.pfx_z * 12.0
    d["hb"] = np.where(d.p_throws == "R", -d.pfx_x, d.pfx_x) * 12.0
    d["mph"] = d.release_speed
    d["spin"] = d.release_spin_rate
    fb = d[d.kind.isin(["FB", "SI", "FC"])]
    cnt = fb.groupby(["game_pk", "pitcher", "pitch_type"]).size().rename("n").reset_index()
    main = cnt.sort_values("n", ascending=False).drop_duplicates(["game_pk", "pitcher"])
    m = fb.merge(main[["game_pk", "pitcher", "pitch_type"]], on=["game_pk", "pitcher", "pitch_type"])
    ms = m.groupby(["game_pk", "pitcher"]).agg(fb_mph=("mph", "mean"), fb_ivb=("ivb", "mean"), fb_hb=("hb", "mean")).reset_index()
    d = d.merge(ms, on=["game_pk", "pitcher"], how="left")
    d = d.dropna(subset=["fb_mph"]).sort_values(["game_pk", "at_bat_number", "pitch_number"]).reset_index(drop=True)
    d["dmph"], d["divb"], d["dhb"] = d.fb_mph - d.mph, d.ivb - d.fb_ivb, d.hb - d.fb_hb
    # the Step 1b tag: thresholds against the engine's MLB typical rows; a label that names a profile wins
    typ = {k: (E.PROFILES["mlb"][(k, "")][1], E.PROFILES["mlb"][(k, "")][2]) for k in ("FB", "SI", "FC")}
    t = PF.tag(d, typ, json.load(open(os.path.join(OUT, "profiles.json")))["thresholds"])
    d["tag"] = np.where(d.pitch_type.isin(LABEL_TAG), d.pitch_type.map(LABEL_TAG), t)
    d["prof"] = d.kind + "|" + d.tag
    return d


def features(d):
    """the control matrix (seq_fit.controls without the per-class pitch-quality block)"""
    yr = d.game_year.values
    pc = d.groupby(["game_pk", "pitcher"]).cumcount().values
    same_pa = (d.game_pk.values[1:] == d.game_pk.values[:-1]) & (d.at_bat_number.values[1:] == d.at_bat_number.values[:-1])
    prev = np.r_[["none"], np.where(same_pa, d.description.values[:-1], "none")]
    use = d.groupby(["game_year", "pitcher", "pitch_type"]).size()
    tot = d.groupby(["game_year", "pitcher"]).size()
    share = (use.reindex(pd.MultiIndex.from_arrays([d.game_year, d.pitcher, d.pitch_type])).values /
             tot.reindex(pd.MultiIndex.from_arrays([d.game_year, d.pitcher])).values)
    X = []
    b, k = d.balls.values, d.strikes.values
    for (bb, kk) in [(bb, kk) for bb in range(4) for kk in range(3)][1:]:
        X.append((b == bb) & (k == kk))
    o = d.outs_when_up.values
    X += [o == 1, o == 2, d.on_1b.notna().values, d.on_2b.notna().values, d.on_3b.notna().values]
    mg = np.clip((d.fld_score - d.bat_score).fillna(0).values, -3, 3)
    X += [mg == j for j in (-3, -2, -1, 1, 2, 3)]
    tto = d.n_thruorder_pitcher.fillna(1).values
    X += [tto == 2, tto >= 3]
    X += [(26 <= pc) & (pc < 51), (51 <= pc) & (pc < 76), (76 <= pc) & (pc < 101), pc >= 101]
    X += [prev == "ball", prev == "called_strike", np.isin(prev, list(WHIFF)), np.char.startswith(prev.astype(str), "foul")]
    X += [share]
    xs = np.where(d.stand.values == "R", -d.plate_x.values, d.plate_x.values)
    zn = (d.plate_z.values - d.sz_bot.values) / np.maximum(0.5, d.sz_top.values - d.sz_bot.values)
    hx = [xs] + [np.maximum(0, xs - kk) for kk in (-1.0, -0.5, 0.0, 0.5, 1.0)]
    hz = [zn] + [np.maximum(0, zn - kk) for kk in (-0.25, 0.25, 0.5, 0.75, 1.25)]
    X += hx + hz + [a * bb for a in hx[:3] for bb in hz[:3]]
    for c in ("SL", "CB", "CH"):
        on = (d.cls.values == c).astype(float)
        X += [on * xs, on * zn, on * zn * zn]
    return np.column_stack([np.asarray(v, dtype=float) for v in X]), xs, zn


def dummies(values, levels):
    return np.column_stack([(values == lv).astype(float) for lv in levels])


def main():
    os.makedirs(OUT, exist_ok=True)
    d = load()
    Xc, xs, zn = features(d)
    yr = d.game_year.values
    pits = {p: j for j, p in enumerate(sorted(set(d.pitcher[yr == 2024])))}
    bats = {p: j for j, p in enumerate(sorted(set(d.batter[yr == 2024])))}
    pid = np.array([pits.get(p, len(pits)) for p in d.pitcher])
    bid = np.array([bats.get(p, len(bats)) for p in d.batter])
    gid = pd.factorize(d.game_pk)[0]
    desc = d.description.values
    is_sw = np.isin(desc, list(SWING)); whiff = np.isin(desc, list(WHIFF)).astype(float)
    take = np.isin(desc, list(TAKE)); cs = (desc == "called_strike").astype(float)
    zone_out = d.zone.isin([11, 12, 13, 14]).values
    bip = desc == "hit_into_play"; ls = pd.to_numeric(d.launch_speed, errors="coerce").values.astype(float)
    bipv = bip & ~np.isnan(ls); hard = np.nan_to_num(ls) >= 95; hard = hard.astype(float)
    say(f"v1.1 Step 2 fits: {len(d):,} pitches (2024 {int((yr == 2024).sum()):,} train, 2025 {int((yr == 2025).sum()):,} held out); "
        f"controls {Xc.shape[1]} columns; pitchers {len(pits)}, batters {len(bats)} in train")
    TARGETS = {"whiff": (is_sw, whiff), "chase": (zone_out, is_sw.astype(float)), "cstrike": (take, cs), "hard": (bipv, hard)}
    cls_lv = ["SL", "CB", "CH"]
    REF = {"FB": "FB|", "SI": "SI|", "FC": "FC|", "SL": "SL|tight", "CB": "CB|", "CH": "CH|"}   # one reference per kind
    kinds_lv = ["SI", "FC"]                                       # kind dummies inside the FB class (B = kind + profile)
    prof_lv = [p for p in sorted(set(d.prof)) if p not in REF.values()]
    Dcls = dummies(d.cls.values, cls_lv)
    Dprof = np.hstack([dummies(d.kind.values, kinds_lv), dummies(d.prof.values, prof_lv)])
    prof_names = kinds_lv + prof_lv
    res = {"levels": prof_names, "ref": REF, "n_by_prof": d[yr == 2024].prof.value_counts().to_dict()}

    cache = {}

    def fit(mask, y, extra, base_extra=None, key=None):
        tr, te = mask & (yr == 2024), mask & (yr == 2025)
        Xb = Xc if base_extra is None else np.hstack([Xc, base_extra])
        F = SF.Fit(Xb[tr], y[tr], pid[tr], bid[tr], gid[tr], len(pits) + 1, len(bats) + 1)
        if key is None or key not in cache:
            m0 = F.run()
            cache[key] = (m0, SF.Fit.predict(m0, Xb[te], pid[te], bid[te]))
        m0, p0 = cache[key]
        m1 = F.run(extra[tr])
        p1 = SF.Fit.predict(m1, Xb[te], pid[te], bid[te], extra[te])
        gain, sd = SF.boot_gain(y[te], p0, p1, gid[te])
        k = extra.shape[1]
        return dict(beta=m1["b_raw"][-k:].tolist(), se=m1["se_raw"][-k:].tolist(), gain=float(gain), sd=float(sd),
                    ship=bool(gain > 2 * sd), n_train=int(tr.sum()), n_test=int(te.sum()))

    # ---------------------------------------------------------------- 2a
    say("\n2a. Pitch model: A (v1.0 classes) vs B (kind and profile) vs C (A + continuous shape and slot by class)")
    fb_typ_ivb = E.PROFILES["mlb"][("FB", "")][1]
    # C's shape: dmph off his main fastball; vertical (fastball class: IVB vs the typical four-seam, so a sinker's sink
    # counts; off-speed: dIVB off his main fastball); HB arm side +; arm angle. Per class, raw units / 5 (deg / 15).
    vert = np.where(d.cls.values == "FB", d.ivb.values - fb_typ_ivb, d.divb.values)
    am = pd.to_numeric(d.arm_angle, errors="coerce")
    aa = (am.fillna(am.median()).values - 40.0) / 15.0
    C_NAMES, cont = [], []
    for c in ("FB", "SL", "CB", "CH"):
        on = (d.cls.values == c).astype(float)
        cont += [on * d.dmph.values / 5.0, on * vert / 5.0, on * d.hb.values / 5.0, on * aa]
        C_NAMES += [f"{c}:dmph/5", f"{c}:vert/5", f"{c}:hb/5", f"{c}:(arm-40)/15"]
    Ccont = np.column_stack(cont).astype(float)
    res["C_names"] = C_NAMES
    # arm angle by slot bucket (the engine's five slots), for the engine's slot -> angle table
    bins = [("sidearm", -90, 20), ("low three-quarter", 20, 35), ("three-quarter", 35, 45), ("high three-quarter", 45, 55),
            ("over the top", 55, 91)]
    a24 = am[(yr == 2024)]
    res["slot_angle"] = {nm: round(float(a24[(a24 >= lo) & (a24 < hi)].median()), 1) for nm, lo, hi in bins}
    say("  arm angle by slot bucket (2024 median): " + ", ".join(f"{k} {v}" for k, v in res["slot_angle"].items()))
    res["2a"] = {}
    for tgt, (mask, y) in TARGETS.items():
        rBA = fit(mask, y, Dprof, base_extra=Dcls, key=(tgt, "A"))
        rCA = fit(mask, y, Ccont, base_extra=Dcls, key=(tgt, "A"))
        rBC = fit(mask, y, Dprof, base_extra=np.hstack([Dcls, Ccont]), key=(tgt, "AC"))     # does B add beyond C?
        rBA["names"] = rBC["names"] = prof_names
        rCA["names"] = C_NAMES
        res["2a"][tgt] = dict(B_over_A=rBA, C_over_A=rCA, B_over_C=rBC)
        f = lambda r: f"{r['gain']:.2e} ({r['gain'] / r['sd']:.1f} SD) {'SHIP' if r['ship'] else 'no'}"
        say(f"  {tgt:7s} B over A: {f(rBA)} | C over A: {f(rCA)} | B over A+C: {f(rBC)}")
    # ---------------------------------------------------------------- 2b
    say("\n2b. Fastball zone: fastball-class profile x height (up / down vs middle) x inside, on top of the shipped 2a model")
    say("    (A + C, plus B where B over A+C shipped)")
    ship_b = {t: res["2a"][t]["B_over_C"]["ship"] for t in TARGETS}

    def base2a(tgt, *more):
        parts = [Dcls, Ccont] + ([Dprof] if ship_b[tgt] else []) + list(more)
        return np.hstack(parts), (tgt, "ACB" if ship_b[tgt] else "AC") + tuple(str(m.shape[1]) for m in more)
    fbp = sorted(p for p in set(d.prof) if p.split("|")[0] in ("FB", "SI", "FC"))
    up, down, inside = (zn > 0.67).astype(float), (zn < 0.33).astype(float), (xs > 0).astype(float)
    cols, names = [], []
    for p in fbp:
        on = (d.prof.values == p).astype(float)
        for hn, h in (("up", up), ("down", down)):
            cols.append(on * h); names.append(f"{p}@{hn}")
        cols.append(on * inside); names.append(f"{p}@in")
    Z2b = np.column_stack(cols)
    res["2b"] = {"names": names}
    for tgt in ("whiff", "hard", "cstrike"):
        mask, y = TARGETS[tgt]
        be, bk = base2a(tgt)
        r = fit(mask, y, Z2b, base_extra=be, key=bk)
        r["base"] = bk[1]
        r["names"] = names
        res["2b"][tgt] = r
        say(f"  {tgt:7s} gain {r['gain']:.2e} ({r['gain'] / r['sd']:.1f} SD) -> {'SHIP' if r['ship'] else 'no ship'}")
    # ---------------------------------------------------------------- 2c
    say("\n2c. Platoon, on top of the shipped 2a model and the engine's SIDE split (fastball / off-speed x opposite side):")
    say("    class: slider / changeup x opposite (the v1.0 SL and CH same-side patches); full: class + signed break and")
    say("    vertical x opposite, per class")
    opp = (d.stand.values != d.p_throws.values).astype(float)
    os_ = (d.cls.values != "FB").astype(float)
    side_base = np.column_stack([(1 - os_) * opp, os_ * opp])
    cls_side = np.column_stack([(d.cls.values == c).astype(float) * opp for c in ("SL", "CH")])
    cols, names = [], []
    for c in ("FB", "SL", "CB", "CH"):
        on = (d.cls.values == c).astype(float)
        cols += [on * opp * d.hb.values / 5.0, on * opp * vert / 5.0]
        names += [f"{c}:opp*hb/5", f"{c}:opp*vert/5"]
    Z2c = np.hstack([cls_side, np.column_stack(cols)])
    names = ["SL:opp", "CH:opp"] + names
    res["2c"] = {"names": names, "class_names": ["SL:opp", "CH:opp"]}
    for tgt in ("whiff", "hard", "chase", "cstrike"):
        mask, y = TARGETS[tgt]
        be, bk = base2a(tgt, side_base)
        rc = fit(mask, y, cls_side, base_extra=be, key=bk)
        rf = fit(mask, y, Z2c, base_extra=be, key=bk)
        base_key_2c = res.setdefault("_bk2c", {}); base_key_2c[tgt] = bk
        rc["names"], rf["names"] = ["SL:opp", "CH:opp"], names
        pick = rf if rf["ship"] and rf["gain"] > rc["gain"] else (rc if rc["ship"] else rf)
        res["2c"][tgt] = dict(rf, ship=pick["ship"], model=("full" if pick is rf else "class"), class_fit=rc, full_fit=rf)
        f = lambda r: f"{r['gain']:.2e} ({r['gain'] / r['sd']:.1f} SD) {'SHIP' if r['ship'] else 'no'}"
        say(f"  {tgt:7s} class: {f(rc)} | full: {f(rf)} -> {res['2c'][tgt]['model'] if pick['ship'] else 'prior'}")
    # ---------------------------------------------------------------- priors (plan 2.3)
    say("\n2.3 Profile priors for what didn't ship: 2024 per-profile rates as logit differences from the class value;")
    say("    no-harm check on 2025 (gain > -1 boot SD, halved until it passes)")
    opp = (d.stand.values != d.p_throws.values).astype(float)
    stage = np.where(d.strikes.values == 2, "2k", "early")
    side = np.where(opp > 0, "opp", "same")
    hgt = np.where(zn > 0.67, "up", np.where(zn < 0.33, "down", "mid"))
    prof, cls = d.prof.values.astype(str), d.cls.values.astype(str)

    def lg(r):
        r = np.clip(r, 1e-3, 1 - 1e-3)
        return np.log(r / (1 - r))

    def rate_table(mask, y, keys):
        t = pd.DataFrame({"k": keys[mask], "y": y[mask]}).groupby("k").y.agg(["mean", "size"])
        return {k: (float(v["mean"]), int(v["size"])) for k, v in t.iterrows()}

    def prior(tgt, base_key, kp, kc, kp0=None, kc0=None, n_min=200):
        """offset = [logit r(kp) - logit r(kc)] (- [logit r(kp0) - logit r(kc0)] for an interaction prior)"""
        mask, y = TARGETS[tgt]
        tr = mask & (yr == 2024)
        P, Cc = rate_table(tr, y, kp), rate_table(tr, y, kc)
        P0 = rate_table(tr, y, kp0) if kp0 is not None else None
        C0 = rate_table(tr, y, kc0) if kc0 is not None else None
        tab = {}
        for k, (r, n) in P.items():
            j = int(np.flatnonzero(kp == k)[0])
            if n < n_min:
                continue
            v = lg(r) - lg(Cc[kc[j]][0])
            if P0 is not None:
                v -= lg(P0[kp0[j]][0]) - lg(C0[kc0[j]][0])
            tab[k] = float(v)
        off = np.array([tab.get(k, 0.0) for k in kp])
        te = mask & (yr == 2025)
        m0, p0 = cache[base_key]
        sc = 1.0
        for _ in range(8):
            p1 = 1 / (1 + np.exp(-(lg(p0) + sc * off[te])))
            gain, sd = SF.boot_gain(y[te], p0, p1, gid[te])
            if gain > -sd:
                break
            sc /= 2
        else:
            sc = 0.0
        say(f"  {tgt:7s} {len(tab)} cells (n >= {n_min}); 2025 gain {gain:.2e} ({gain / sd:+.1f} SD) at scale {sc:g}")
        return dict(table=tab, scale=sc, gain=float(gain), sd=float(sd))

    res["priors"] = {}
    sh = res["2a"]
    if not (sh["cstrike"]["C_over_A"]["ship"] or sh["cstrike"]["B_over_A"]["ship"]):
        say("  called strike | take, by profile x side x early / two-strike (2a didn't ship):")
        res["priors"]["cstrike_profile"] = prior("cstrike", ("cstrike", "A"),
                                                 np.char.add(np.char.add(prof, "|"), np.char.add(np.char.add(side, "|"), stage)),
                                                 np.char.add(np.char.add(cls, "|"), np.char.add(np.char.add(side, "|"), stage)))
    for tgt in ("whiff", "hard", "chase"):
        if not res["2c"][tgt]["ship"]:
            say(f"  platoon {tgt}: profile x side, beyond the class's side gap (2c didn't ship):")
            grp = np.where(cls == "FB", "FB", "OS")
            res["priors"][f"platoon_{tgt}"] = prior(tgt, res["_bk2c"][tgt],
                                                    np.char.add(np.char.add(prof, "|"), side), np.char.add(np.char.add(grp, "|"), side),
                                                    prof, grp)
    for tgt in ("whiff", "hard", "cstrike"):
        if not res["2b"][tgt]["ship"]:
            fbm = cls == "FB"
            say(f"  fastball zone {tgt}: fastball profile x height, beyond the profile's overall difference (2b didn't ship):")
            kp = np.where(fbm, np.char.add(np.char.add(prof, "@"), hgt), "x")
            kc = np.where(fbm, np.char.add("FB@", hgt), "x")
            res["priors"][f"fbzone_{tgt}"] = prior(tgt, base2a(tgt)[1], kp, kc, np.where(fbm, prof, "x"), np.where(fbm, "FB", "x"))
    # ---------------------------------------------------------------- final joint fits (the engine's coefficients)
    say("\nFinal: one joint fit per target with every shipped block (A + C [+ B] [+ 2b] [+ SIDE split + 2c]);")
    say("the engine takes its coefficients from these, so blocks that were tested one on top of another are not added twice")
    res["final"] = {}
    for tgt, (mask, y) in TARGETS.items():
        blocks, names = [Ccont], list(C_NAMES)
        if ship_b[tgt]:
            blocks.append(Dprof); names += [f"B:{n}" for n in prof_names]
        if tgt in res["2b"] and res["2b"][tgt]["ship"]:
            blocks.append(Z2b); names += [f"2b:{n}" for n in res["2b"]["names"]]
        if res["2c"][tgt]["ship"]:
            zc = Z2c if res["2c"][tgt]["model"] == "full" else cls_side
            nc = res["2c"]["names"] if res["2c"][tgt]["model"] == "full" else ["SL:opp", "CH:opp"]
            blocks += [side_base, zc]; names += ["side:FB:opp", "side:OS:opp"] + [f"2c:{n}" for n in nc]
        tr = mask & (yr == 2024)
        F = SF.Fit(np.hstack([Xc, Dcls])[tr], y[tr], pid[tr], bid[tr], gid[tr], len(pits) + 1, len(bats) + 1)
        ex = np.hstack(blocks)
        m1 = F.run(ex[tr])
        k = ex.shape[1]
        res["final"][tgt] = dict(names=names, beta=m1["b_raw"][-k:].tolist(), se=m1["se_raw"][-k:].tolist())
        say(f"  {tgt:7s} {k} terms")

    # ---------------------------------------------------------------- 2e
    say("\n2e. Ground balls | ball in play by kind and profile (2024; descriptive)")
    bt = bip & d.bb_type.notna().values
    gb = (d.bb_type.values == "ground_ball")
    tr = bt & (yr == 2024)
    g = pd.DataFrame({"prof": d.prof.values[tr], "gb": gb[tr]}).groupby("prof").gb.agg(["mean", "size"])
    res["2e"] = {p: dict(gb=round(float(r["mean"]), 4), n=int(r["size"])) for p, r in g.iterrows()}
    say("  " + ", ".join(f"{p} {v['gb']:.3f} (n {v['n']})" for p, v in res["2e"].items()))
    res["_bk2c"] = {k: list(v) for k, v in res.get("_bk2c", {}).items()}
    json.dump(res, open(os.path.join(OUT, "step2_fit.json"), "w"), indent=1, default=float)
    open(os.path.join(OUT, "step2_report.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
