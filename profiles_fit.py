"""v1.1 Step 1b: the profile table and tag thresholds from Statcast (docs/PLAN_v1.1_2026-11-12.md, 2.2 and Step 1b).

  python3 profiles_fit.py            -> results/v11/profiles.json and results/v11/profiles.txt

What it does, in order:
  1. Reads the 2024 (train) and 2025 (check) pitch CSVs in data/statcast/ (fetch_statcast.py).
  2. Maps Statcast pitch types to the six kinds (FF FB, SI SI, FC FC, SL/ST/SV SL, CU/KC/CS CB, CH/FS/FO CH). Movement is
     normalized to a right-hander: IVB = pfx_z x 12, HB (arm side +) = -pfx_x x 12 for a righty, +pfx_x x 12 for a lefty.
  3. Finds each pitcher-game's main fastball: his most-thrown fastball-class pitch type that game (plan 2.1).
  4. Tags every pitch with the plan's thresholds (2.2): fastball-class pitches against the typical (median) pitch of their
     kind, off-speed against his main fastball (dmph = main FB speed - pitch speed, dIVB = pitch IVB - main FB IVB,
     HB absolute). First match wins; nothing matched = typical ("").
  5. Checks the thresholds against Statcast's own labels where one exists (ST -> sweeper, FS/FO -> split,
     SV -> slurve, CS -> slow) on 2024; any label under 80% agreement gets its one threshold adjustment (the smallest
     round step that reaches 80%), and the final agreement is reported for 2024 and 2025.
  6. Writes the MLB profile table (median dmph, IVB, HB per kind and tag; fastball-class dmph against a four-seam main
     fastball) and, from it, the college and HS tables (plan 2.2).
"""
import glob, json, os, sys
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "statcast")
OUT = os.path.join(HERE, "results", "v11")
KIND = {"FF": "FB", "SI": "SI", "FC": "FC", "SL": "SL", "ST": "SL", "SV": "SL", "CU": "CB", "KC": "CB", "CS": "CB",
        "CH": "CH", "FS": "CH", "FO": "CH"}
FASTBALL = ("FB", "SI", "FC")
TAGS = {"FB": ("rides", "runs", "cuts", "straight"), "SI": ("two-seam", "drop", "run"), "FC": ("big", "hard", "ride"),
        "SL": ("sweeper", "slurve", "gyro", "tight"), "CB": ("12-6", "sweeping", "power", "slow"),
        "CH": ("firm", "split", "drop", "fade")}

# the plan's starting thresholds (2.2), MLB inches and mph; Step 1b may move each label's one threshold once
T = {"fb_rides_ivb": 2.0, "fb_runs_hb": 3.0, "fb_cuts_hb": -5.0, "fb_straight_ivb": -2.0, "fb_straight_hb": 3.0,
     "si_twoseam_ivb": 3.0, "si_drop_ivb": -3.0, "si_run_hb": 2.0,
     "fc_big_hb": -7.0, "fc_big_dmph": 7.0, "fc_hard_dmph": 4.0, "fc_hard_hb": -4.0, "fc_ride_ivb": 3.0,
     "sl_sweeper_hb": -12.0, "sl_slurve_ivb": -3.0, "sl_slurve_hb": -6.0, "sl_gyro_abshb": 3.0,
     "cb_power_dmph": 9.0, "cb_slow_dmph": 15.0,
     "ch_firm_dmph": 5.0, "ch_split_divb": -12.0, "ch_split_dhb": 4.0, "ch_drop_divb": -11.0, "ch_fade_dhb": 4.0}
# Two things the label check settled (Step 1b, written down in the build report):
#  - A label that NAMES A PROFILE sets the tag: Statcast ST -> sweeper, SV -> slurve, FS/FO -> split (and in the app the
#    pitch names Sweeper, Slurve, Splitter, 12-6 curve). Those labels carry grip information movement can't see: the best
#    movement rule reaches 62% of splitters (precision 43%) and 71% of slurves (precision 17%), MLB 2024. The thresholds
#    tag everything a label doesn't name. A label that names only a grip (KC knuckle curve) is tagged by its movement.
#  - The ride cutter is judged against the typical cutter (IVB >= typical + 3), like every fastball-class tag; judged
#    against the game's main fastball (the plan's first draft) it tagged flat cutters from sinker pitchers as "ride".
# which threshold each Statcast label's check may move, the direction that makes the tag wider, and the step
LABEL_KNOB = {"ST": ("sweeper", "sl_sweeper_hb", +1.0), "FS": ("split", "ch_split_divb", +1.0),
              "SV": ("slurve", "sl_slurve_ivb", +1.0), "CS": ("slow", "cb_slow_dmph", -1.0)}
LABEL_TAG = {"ST": "sweeper", "SV": "slurve", "FS": "split", "FO": "split"}     # labels that name a profile
GATE_N = 500          # a label is gated only with this many pitches in the training year; smaller ones are reported
LABEL_KIND = {"ST": "SL", "FS": "CH", "FO": "CH", "SV": "SL", "CS": "CB"}


def load(year):
    cols = ["pitch_type", "release_speed", "pfx_x", "pfx_z", "p_throws", "pitcher", "game_pk", "arm_angle", "release_spin_rate"]
    fr = []
    for f in sorted(glob.glob(os.path.join(DATA, f"sc_{year}-*.csv"))):
        if os.path.getsize(f) < 1000:
            continue
        fr.append(pd.read_csv(f, usecols=cols, encoding="utf-8-sig"))
    d = pd.concat(fr, ignore_index=True)
    d = d[d.pitch_type.isin(KIND)].dropna(subset=["release_speed", "pfx_x", "pfx_z", "p_throws"]).copy()
    d["kind"] = d.pitch_type.map(KIND)
    d["ivb"] = d.pfx_z * 12.0
    d["hb"] = np.where(d.p_throws == "R", -d.pfx_x, d.pfx_x) * 12.0
    d["mph"] = d.release_speed
    d["spin"] = d.release_spin_rate
    # main fastball per pitcher-game: his most-thrown fastball-class pitch type that game
    fb = d[d.kind.isin(FASTBALL)]
    cnt = fb.groupby(["game_pk", "pitcher", "pitch_type"]).size().rename("n").reset_index()
    main = cnt.sort_values("n", ascending=False).drop_duplicates(["game_pk", "pitcher"])
    m = fb.merge(main[["game_pk", "pitcher", "pitch_type"]], on=["game_pk", "pitcher", "pitch_type"])
    mstat = m.groupby(["game_pk", "pitcher"]).agg(fb_mph=("mph", "mean"), fb_ivb=("ivb", "mean"), fb_hb=("hb", "mean"),
                                                  fb_type=("pitch_type", "first")).reset_index()
    d = d.merge(mstat, on=["game_pk", "pitcher"], how="inner")
    d["dmph"] = d.fb_mph - d.mph
    d["divb"] = d.ivb - d.fb_ivb
    d["dhb"] = d.hb - d.fb_hb
    return d


def typical(d):
    """the typical (median) pitch of each fastball-class kind: what fastball tags are judged against"""
    return {k: (float(d[d.kind == k].ivb.median()), float(d[d.kind == k].hb.median())) for k in FASTBALL}


def tag(d, typ, t):
    out = pd.Series("", index=d.index, dtype=object)
    done = pd.Series(False, index=d.index)

    def put(mask, name):
        nonlocal done
        mm = mask & ~done
        out[mm] = name
        done = done | mm

    k = d.kind
    for kk in FASTBALL:
        ti, th = typ[kk]
        sel = k == kk
        if kk == "FB":
            put(sel & (d.ivb >= ti + t["fb_rides_ivb"]), "rides")
            put(sel & (d.hb >= th + t["fb_runs_hb"]), "runs")
            put(sel & (d.hb <= th + t["fb_cuts_hb"]), "cuts")
            put(sel & (d.ivb <= ti + t["fb_straight_ivb"]) & ((d.hb - th).abs() <= t["fb_straight_hb"]), "straight")
        elif kk == "SI":
            put(sel & (d.ivb >= ti + t["si_twoseam_ivb"]), "two-seam")
            put(sel & (d.ivb <= ti + t["si_drop_ivb"]), "drop")
            put(sel & (d.hb >= th + t["si_run_hb"]), "run")
        else:
            put(sel & ((d.hb <= t["fc_big_hb"]) | (d.dmph >= t["fc_big_dmph"])), "big")
            put(sel & (d.dmph <= t["fc_hard_dmph"]) & (d.hb >= t["fc_hard_hb"]), "hard")
            put(sel & (d.ivb >= ti + t["fc_ride_ivb"]), "ride")
    sel = k == "SL"
    put(sel & (d.hb <= t["sl_sweeper_hb"]), "sweeper")
    put(sel & (d.ivb <= t["sl_slurve_ivb"]) & (d.hb <= t["sl_slurve_hb"]), "slurve")
    put(sel & (d.hb.abs() <= t["sl_gyro_abshb"]), "gyro")
    put(sel, "tight")
    sel = k == "CB"
    drop = -d.ivb
    put(sel & (drop >= 2 * d.hb.abs()), "12-6")
    put(sel & (d.hb.abs() >= drop), "sweeping")
    put(sel & (d.dmph <= t["cb_power_dmph"]), "power")
    put(sel & (d.dmph >= t["cb_slow_dmph"]), "slow")
    sel = k == "CH"
    put(sel & (d.dmph <= t["ch_firm_dmph"]), "firm")
    put(sel & (d.divb <= t["ch_split_divb"]) & (d.dhb.abs() <= t["ch_split_dhb"]), "split")
    put(sel & (d.divb <= t["ch_drop_divb"]), "drop")
    put(sel & (d.dhb >= t["ch_fade_dhb"]), "fade")
    return out


def agreement(d, tags):
    res = {}
    for lab, kind in LABEL_KIND.items():
        sel = (d.pitch_type == lab)
        if not sel.any():
            continue
        want = {"ST": "sweeper", "FS": "split", "FO": "split", "SV": "slurve", "CS": "slow"}[lab]
        got = tags[sel]
        prec_sel = (tags == want) & (d.kind == kind)
        res[lab] = dict(n=int(sel.sum()), tag=want, agree=round(float((got == want).mean()), 4),
                        precision=round(float((d.pitch_type[prec_sel] == lab).mean()), 4) if prec_sel.any() else None,
                        got={k: round(float(v), 4) for k, v in got.value_counts(normalize=True).head(4).items()})
    return res


def main():
    os.makedirs(OUT, exist_ok=True)
    tr, te = load(2024), load(2025)
    lines = [f"v1.1 Step 1b profile fit: 2024 {len(tr):,} pitches (train), 2025 {len(te):,} pitches (check)"]
    typ = typical(tr)
    lines.append("typical fastball-class pitch, 2024 (IVB, HB arm side +): " + ", ".join(f"{k} {v[0]:.1f}/{v[1]:.1f}" for k, v in typ.items()))
    # sign check on the normalization: righty and lefty four-seams should agree after the flip
    ff = tr[tr.pitch_type == "FF"]
    lines.append(f"normalization check: four-seam HB median righties {ff[ff.p_throws == 'R'].hb.median():.1f}, lefties {ff[ff.p_throws == 'L'].hb.median():.1f}; "
                 f"sweeper HB median {tr[tr.pitch_type == 'ST'].hb.median():.1f} (glove side is negative)")
    t = dict(T)
    tags = tag(tr, typ, t)
    first = agreement(tr, tags)
    moved = {}
    for lab, (want, knob, step) in LABEL_KNOB.items():
        if lab not in first or first[lab]["agree"] >= 0.80 or first[lab]["n"] < GATE_N:
            continue
        # the one adjustment: the smallest number of whole steps (at most 6) that reaches 80%; kept only if it does
        for i in range(1, 7):
            t2 = dict(t); t2[knob] = T[knob] + i * step
            a = agreement(tr, tag(tr, typ, t2))[lab]["agree"]
            if a >= 0.80:
                moved[knob] = (T[knob], t2[knob], first[lab]["agree"], a)
                t[knob] = t2[knob]
                break
        else:
            moved[knob] = (T[knob], T[knob], first[lab]["agree"], None)     # not reachable by one move: reported
    tags = tag(tr, typ, t)
    te_tags = tag(te, typical(te), t)
    a_tr, a_te = agreement(tr, tags), agreement(te, te_tags)
    # the table: a label that names a profile sets the tag; the thresholds tag the rest
    tr["tag"] = np.where(tr.pitch_type.isin(LABEL_TAG), tr.pitch_type.map(LABEL_TAG), tags)
    te["tag"] = np.where(te.pitch_type.isin(LABEL_TAG), te.pitch_type.map(LABEL_TAG), te_tags)
    lines.append("\nagreement with Statcast labels (share of the label's pitches given the matching tag; precision = share of "
                 "that tag's pitches carrying the label):")
    for lab in a_tr:
        f = first.get(lab, {}).get("agree")
        lines.append(f"  {lab:2s} -> {a_tr[lab]['tag']:8s} start {f:.1%}  final 2024 {a_tr[lab]['agree']:.1%} (n {a_tr[lab]['n']:,}, precision "
                     f"{a_tr[lab]['precision']:.1%})  2025 {a_te[lab]['agree']:.1%}  [2024 tags {a_tr[lab]['got']}]")
    lines.append("threshold moves: " + (", ".join(f"{k} {v[0]} -> {v[1]} ({v[2]:.1%} -> " + (f"{v[3]:.1%})" if v[3] is not None else "80% not reachable by one move; kept)") for k, v in moved.items()) or "none"))
    lines.append("labels that name a profile set the tag in the table, the fits and the app (ST sweeper, SV slurve, FS/FO split); "
                 "the agreement above measures the thresholds alone, i.e. how a pitch with no such label is tagged")
    lines.append(f"gated labels: those with {GATE_N}+ pitches in 2024 ({', '.join(l for l in a_tr if a_tr[l]['n'] >= GATE_N)}); the rest are reported only")

    # the MLB table: medians per kind and tag; fastball-class speed gaps measured against a four-seam main fastball
    prof = {}
    for kind in ("FB", "SI", "FC", "SL", "CB", "CH"):
        dk = tr[tr.kind == kind]
        ref = dk[(dk.fb_type == "FF") & (dk.pitch_type != "FF")] if kind in ("SI", "FC") else (dk[dk.fb_type == "FF"] if kind != "FB" else dk)
        for tg in ("",) + TAGS[kind]:
            s = dk if tg == "" else dk[dk.tag == tg]
            r = ref if tg == "" else ref[ref.tag == tg]
            if len(s) < 200:
                continue
            dm = 0.0 if kind == "FB" else float(r.dmph.median()) if len(r) >= 100 else float(s.dmph.median())
            prof[f"{kind}|{tg}"] = dict(dmph=round(dm, 1), ivb=round(float(s.ivb.median()), 1), hb=round(float(s.hb.median()), 1),
                                        n=int(len(s)), share=round(len(s) / len(dk), 3))
    lines.append("\nMLB profile table, 2024 (dmph off a four-seam main fastball; IVB; HB arm side +; n; share of the kind):")
    for k, v in prof.items():
        lines.append(f"  {k:14s} dmph {v['dmph']:5.1f}  IVB {v['ivb']:6.1f}  HB {v['hb']:6.1f}  n {v['n']:7,}  {v['share']:.1%}")
    json.dump(dict(thresholds=t, moved={k: list(v) for k, v in moved.items()}, typical={k: list(v) for k, v in typ.items()},
                   agreement_2024=a_tr, agreement_2025=a_te, agreement_start=first, mlb=prof,
                   n_train=len(tr), n_check=len(te)), open(os.path.join(OUT, "profiles.json"), "w"), indent=1)
    open(os.path.join(OUT, "profiles.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__" and "--write-engines" not in sys.argv and "--sample" not in sys.argv:
    main()


# ------------------------------------------------------------------ the level tables and the engines' copies
# College typical rows from Rapsodo's college averages (research doc 1.1-1.6): four-seam about 8 in. run, 16 in. ride;
# slider 9 mph off, 1.5 in. sweep, 4 in. vertical; curve 12 mph off, about -1 in. vertical; changeup 7 mph off.
# Anything Rapsodo doesn't give stays at the MLB typical value. Each profile is its kind's college typical row plus that
# profile's difference from the MLB typical row (college and MLB fastballs move about the same, so the difference is
# added as is). HS is college movement shrunk 15%, same speed gaps (an assumption until there is HS data).
COLLEGE_TYP = {"FB": {"dmph": 0.0, "ivb": 16.0, "hb": 8.0}, "SL": {"dmph": 9.0, "ivb": 4.0, "hb": -1.5},
               "CB": {"dmph": 12.0, "ivb": -1.0}, "CH": {"dmph": 7.0}}
HS_MOVE = 0.85
MOVE_RATIO = {"mlb": 1.0, "college_d1": 1.0, "college_d3": 1.0, "hs": HS_MOVE, "travel": HS_MOVE}


def level_tables(mlb):
    out = {"mlb": {k: (v["dmph"], v["ivb"], v["hb"]) for k, v in mlb.items()}}
    col = {}
    for k, v in mlb.items():
        kind = k.split("|")[0]
        base = mlb[kind + "|"]
        typ = dict(dmph=base["dmph"], ivb=base["ivb"], hb=base["hb"]); typ.update(COLLEGE_TYP.get(kind, {}))
        col[k] = tuple(round(typ[c] + (v[c] - base[c]), 1) for c in ("dmph", "ivb", "hb"))
    out["college_d1"] = dict(col); out["college_d3"] = dict(col)
    hs = {k: (v[0], round(v[1] * HS_MOVE, 1), round(v[2] * HS_MOVE, 1)) for k, v in col.items()}
    out["hs"] = dict(hs); out["travel"] = dict(hs)
    return out


def write_engines(fit):
    """Write the profile table and thresholds into engine.py and app/engine.js between their GENERATED markers."""
    tabs = level_tables(fit["mlb"])
    t = fit["thresholds"]
    py = ["# --- PROFILES: generated by profiles_fit.py --write-engines from 2024 Statcast (results/v11/profiles.json); do not edit ---",
          "# (dmph off his main fastball, IVB, HB arm side +) for a right-hander, by level, kind and tag",
          "PROFILES = {"]
    for lv, tab in tabs.items():
        py.append(f'    "{lv}": {{')
        for k, v in tab.items():
            kd, tg = k.split("|")
            py.append(f'        ("{kd}", "{tg}"): ({v[0]}, {v[1]}, {v[2]}),')
        py.append("    },")
    py.append("}")
    py.append("PROFILE_T = {" + ", ".join(f'"{k}": {float(v)}' for k, v in t.items()) + "}")
    py.append("MOVE_RATIO = {" + ", ".join(f'"{k}": {v}' for k, v in MOVE_RATIO.items()) + "}")
    py.append("# --- end PROFILES ---")
    js = ["  // --- PROFILES: generated by profiles_fit.py --write-engines from 2024 Statcast (results/v11/profiles.json); do not edit ---",
          "  // [dmph off his main fastball, IVB, HB arm side +] for a right-hander, by level, \"kind|tag\"",
          "  const PROFILES = {"]
    for lv, tab in tabs.items():
        js.append(f'    {lv}: {{ ' + ", ".join(f'"{k}": [{v[0]}, {v[1]}, {v[2]}]' for k, v in tab.items()) + " },")
    js.append("  };")
    js.append("  const PROFILE_T = { " + ", ".join(f"{k}: {float(v)}" for k, v in t.items()) + " };")
    js.append("  const MOVE_RATIO = { " + ", ".join(f"{k}: {v}" for k, v in MOVE_RATIO.items()) + " };")
    js.append("  // --- end PROFILES ---")
    for path, block, start, end in (("engine.py", py, "# --- PROFILES:", "# --- end PROFILES ---"),
                                    ("app/engine.js", js, "  // --- PROFILES:", "  // --- end PROFILES ---")):
        full = os.path.join(HERE, path)
        s = open(full, encoding="utf-8").read()
        i, j = s.index(start), s.index(end) + len(end)
        open(full, "w", encoding="utf-8").write(s[:i] + "\n".join(block) + s[j:])
    return tabs


if __name__ == "__main__" and "--write-engines" in sys.argv:
    tabs = write_engines(json.load(open(os.path.join(OUT, "profiles.json"))))
    json.dump({lv: {k: list(v) for k, v in tab.items()} for lv, tab in tabs.items()}, open(os.path.join(OUT, "profiles_levels.json"), "w"), indent=1)
    print("wrote the profile tables into engine.py and app/engine.js")


def write_sample(n_per_kind=700, seed=20261112):
    """A frozen sample of real 2024 pitches with the tags this script's thresholds give them (no label override), so the
    engines' tag_for can be checked against the fit's own definition without the Statcast files (tests_v11.py)."""
    fit = json.load(open(os.path.join(OUT, "profiles.json")))
    tabs = level_tables(fit["mlb"])["mlb"]
    tr = load(2024)
    typ = {k: (tabs[f"{k}|"][1], tabs[f"{k}|"][2]) for k in FASTBALL}     # the engine's rounded typical rows
    # tag the numbers exactly as they are stored in the sample (rounded), so a pitch on a threshold reads the same
    for c, nd in (("ivb", 2), ("hb", 2), ("mph", 2), ("fb_mph", 3), ("fb_ivb", 3), ("fb_hb", 3)):
        tr[c] = tr[c].round(nd)
    tr["dmph"], tr["divb"], tr["dhb"] = tr.fb_mph - tr.mph, tr.ivb - tr.fb_ivb, tr.hb - tr.fb_hb
    tr["tag"] = tag(tr, typ, fit["thresholds"])
    rows = []
    for kind in ("FB", "SI", "FC", "SL", "CB", "CH"):
        d = tr[tr.kind == kind].sample(n=n_per_kind, random_state=seed)
        for r in d.itertuples():
            rows.append([kind, round(r.ivb, 2), round(r.hb, 2), round(r.mph, 2), round(r.fb_mph, 3), round(r.fb_ivb, 3), round(r.fb_hb, 3), r.tag])
    json.dump(dict(level="mlb", note="kind, IVB, HB (arm side +), mph, main FB mph / IVB / HB, tag from profiles_fit.tag", rows=rows),
              open(os.path.join(OUT, "tag_sample.json"), "w"))
    return len(rows)


if __name__ == "__main__" and "--sample" in sys.argv:
    print("wrote", write_sample(), "sample pitches")
