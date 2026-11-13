"""v1.1 Step 2: turn the Step 2 fits (results/v11/step2_fit.json, profile_terms_fit.py) into the engines' profile terms.

  python3 profile_terms_tables.py                 -> results/v11/step2_terms.json, results/v11/step2_terms.txt (offsets by profile)
  python3 profile_terms_tables.py --write-engines -> also writes the PROFILE_TERMS block into engine.py and app/engine.js

What goes in (plan 2.3; every number below comes from the fit file, nothing is set by hand):
  PT_C       2a model C, shipped on whiff, chase, called strike and hard: per class, per unit of (mph off his main fastball,
             vertical inches, HB inches arm side +, arm angle degrees). The engine adds beta . (x - x_typical), x_typical
             being the typical pitch of the class at his level (engine pt_ref), so every level's typical pitch keeps its
             v1.0 value (KIND_W etc.) and other shapes move off it. PT_REF (the MLB typical) is kept for the report only.
  PT_B       2a model B on top of C (shipped on whiff and chase): what a profile adds beyond its shape. 0 for the typical
             four-seam, slider (tight), curve and changeup; sinker and cutter carry their kind term.
  Coefficients come from one joint fit per target with every shipped block ("final" in step2_fit.json), so blocks
  tested one on top of another aren't added twice.
  PT_FBZ_W   2b, shipped on whiff: fastball-class profile x up / down / inside, as differences from the typical four-seam.
  PT_FBZ_H   prior (2b hard didn't ship): fastball profile x up / middle / down vs the four-seam, at its no-harm scale.
  PT_PLAT    priors (2c whiff and hard didn't ship): a profile's same / opposite gap beyond its group's (SIDE's fastball /
             off-speed split), at its no-harm scale.
  PT_CHASE_OPP 2c, shipped on chase: per class, opposite-side hitter x (slider / changeup class term, HB, vertical),
             centered on the mean of its SIDE group (fastball / off-speed) in the 2024 data, so SIDE keeps the group gap.
  GB_PROFILE 2e grounder rates (descriptive, 2024); a profile with fewer than 200 balls in play uses its kind's rate.
  SLOT_ANGLE arm angle (deg) by the engine's slots: 2024 medians of the Statcast arm-angle buckets.
At HS and travel the engine scales every term except GB_PROFILE by RHO_L (0.6), and reads movement on the MLB scale
(divided by MOVE_RATIO) so the HS movement ratio doesn't shrink the terms a second time.
"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as E

OUT = os.path.join(HERE, "results", "v11")
CLS = ("FB", "SL", "CB", "CH")
SCALE = (5.0, 5.0, 5.0, 15.0)            # the fit's units: dmph/5, vert/5, hb/5, (arm - 40)/15
ARM_REF = None                           # set from the fit's three-quarter median


def r4(x):
    return round(float(x), 4)


def build(fit, chase_means):
    global ARM_REF
    slot = dict(fit["slot_angle"])
    slot["submarine"] = 0.0             # no Statcast bucket; below sidearm
    ARM_REF = slot["three-quarter"]
    fin = {t: dict(zip(fit["final"][t]["names"], fit["final"][t]["beta"])) for t in fit["final"]}
    pc = {}
    for tgt in ("whiff", "chase", "cstrike", "hard"):
        assert fit["2a"][tgt]["C_over_A"]["ship"], tgt
        nm = fit["C_names"]
        pc[tgt] = {c: tuple(r4(fin[tgt][nm[4 * i + j]] / SCALE[j]) for j in range(4)) for i, c in enumerate(CLS)}
    fbi = E.PROFILES["mlb"][("FB", "")][1]
    ref = {}
    for c in CLS:
        dm, ivb, hb = E.PROFILES["mlb"][(c, "")]
        ref[c] = (r4(dm), r4(ivb - fbi), r4(hb), r4(ARM_REF))       # fastball class: vert = IVB - typical four-seam = 0
    pb = {}
    for tgt in ("whiff", "chase", "cstrike", "hard"):
        if not fit["2a"][tgt]["B_over_C"]["ship"]:
            continue
        m = {k[2:]: v for k, v in fin[tgt].items() if k.startswith("B:")}
        tab = {}
        for kind, tags in E.SHAPE_TAGS.items():
            for t in tags:
                key = f"{kind}|{t}"
                t2 = "tight" if (kind, t) == ("SL", "") else t
                v = m.get(kind, 0.0) + m.get(f"{kind}|{t2}", 0.0)
                tab[key] = r4(v)
        pb[tgt] = tab
    # 2b whiff (shipped): differences from the typical four-seam's own lines: (up, down, inside vs same-side, inside vs
    # opposite-side). The riding cutter has lines only if its own test shipped; otherwise it uses the typical cutter's.
    assert fit["2b"]["whiff"]["ship"]
    m = {k[3:]: v for k, v in fin["whiff"].items() if k.startswith("2b:")}
    m_fbz = dict(m)
    H4 = ("up", "down", "in_same", "in_opp")
    fbz_w = {}
    for kind in E.FASTBALL_KINDS:
        for t in E.SHAPE_TAGS[kind]:
            key = f"{kind}|{t}"
            fbz_w[key] = tuple(r4(m.get(f"{key}@{h}", m[f"{kind}|@{h}"]) - m[f"FB|@{h}"]) for h in H4)
    # priors: by side and early / two-strike (plan 2.3), at their no-harm scale
    pr = fit["priors"]
    SS = [(sd, st) for sd in ("same", "opp") for st in ("early", "2k")]
    fbz_h = {}
    if "fbzone_hard" in pr:
        tb, sc = pr["fbzone_hard"]["table"], pr["fbzone_hard"]["scale"]
        for kind in E.FASTBALL_KINDS:
            for t in E.SHAPE_TAGS[kind]:
                key = f"{kind}|{t}"
                row = []
                for h in ("up", "mid", "down"):
                    for sd, st in SS:
                        v = tb.get(f"{key}@{h}|{sd}|{st}", tb.get(f"{kind}|@{h}|{sd}|{st}", 0.0)) - tb.get(f"FB|@{h}|{sd}|{st}", 0.0)
                        row.append(r4(sc * v))
                fbz_h[key] = tuple(row)                    # (up: same-early, same-2k, opp-early, opp-2k; mid ...; down ...)
    plat = {}
    for tgt in ("whiff", "hard", "chase", "cstrike"):
        k = f"platoon_{tgt}"
        if k not in pr:
            continue
        tb, sc = pr[k]["table"], pr[k]["scale"]
        tab = {}
        for kind, tags in E.SHAPE_TAGS.items():
            for t in tags:
                key = f"{kind}|{t}"
                t2 = "tight" if (kind, t) == ("SL", "") else t
                tab[key] = tuple(r4(sc * tb.get(f"{kind}|{t2}|{sd}|{st}", 0.0)) for sd, st in SS)
        plat[tgt] = tab
    # 2c chase (shipped, full model): per class (class term, per HB inch, per vertical inch), and the group means
    c2 = fit["2c"]["chase"]
    assert c2["ship"] and c2["model"] == "full"
    m = {k[3:]: v for k, v in fin["chase"].items() if k.startswith("2c:")}
    copp = {c: (r4(m.get(f"{c}:opp", 0.0)), r4(m[f"{c}:opp*hb/5"] / 5), r4(m[f"{c}:opp*vert/5"] / 5)) for c in CLS}
    # 2e grounders
    g = fit["2e"]
    kind_rate = {}
    for kind in E.KINDS:
        rows = [(v["gb"], v["n"]) for p, v in g.items() if p.split("|")[0] == kind]
        kind_rate[kind] = sum(a * n for a, n in rows) / sum(n for _, n in rows)
    gbp = {}
    for kind, tags in E.SHAPE_TAGS.items():
        for t in tags:
            t2 = "tight" if (kind, t) == ("SL", "") else t
            v = g.get(f"{kind}|{t2}")
            gbp[f"{kind}|{t}"] = r4(v["gb"] if v and v["n"] >= 200 else kind_rate[kind])
    # 2a's class terms, taken from the same joint fits: what an off-speed class adds over the typical four-seam at the
    # spot it's aimed at, both at their typical pitch (class dummy + class x location + C at the class's typical shape,
    # less the four-seam's own C at its typical shape and, on whiff, its own 2b lines). Aimed spots are read on a median
    # zone (bottom 1.6 ft, top 3.42 ft) at the engine's target points (target_xy).
    SPOTS = {"up-in": (7, 38), "up-away": (-7, 38), "down-in": (7, 22), "down-away": (-7, 22), "middle": (0, 30),
             "down-middle": (0, 22), "chase": (-10, 14)}
    ZB, ZT = 1.6, 3.42
    cls_t = {}
    for tgt in ("whiff", "chase", "cstrike", "hard"):
        cb = dict(zip(fit["final"][tgt]["class_names"], fit["final"][tgt]["class_beta"]))
        # C at a typical shape, in the fit's own units (arm angle centered at 40 degrees, as in profile_terms_fit)
        cx = lambda c_: sum(b * x for b, x in zip(pc[tgt][c_], (ref[c_][0], ref[c_][1], ref[c_][2], ref[c_][3] - 40.0)))
        fbC = cx("FB")
        out = {}
        for c in ("SL", "CB", "CH"):
            cC = cx(c)
            out[c] = {}
            for q, (xin, zin) in SPOTS.items():
                xs_, zn_ = xin / 12.0, (zin / 12.0 - ZB) / (ZT - ZB)
                base = cb[f"cls:{c}"] + cb[f"loc:{c}:xs"] * xs_ + cb[f"loc:{c}:zn"] * zn_ + cb[f"loc:{c}:zn2"] * zn_ * zn_ + cC - fbC
                vals = []
                for sd in ("same", "opp"):
                    v = base
                    if tgt == "whiff":
                        h = "up" if zn_ > 0.67 else ("down" if zn_ < 0.33 else None)
                        if h:
                            v -= m_fbz.get(f"FB|@{h}", 0.0)
                        if xin > 0:
                            v -= m_fbz.get(f"FB|@in_{sd}", 0.0)
                    vals.append(r4(v))
                out[c][q] = tuple(vals)
        cls_t[tgt] = out
    # slot adjustment of default movement (E10; plan 2.2): inches per degree of arm angle from the kind's median
    slot_mv = {k: (v["ivb"], v["hb"], v["ref_angle"]) for k, v in fit["slot"].items()}
    return dict(PT_C=pc, PT_REF=ref, PT_B=pb, PT_FBZ_W=fbz_w, PT_FBZ_H=fbz_h, PT_PLAT=plat, PT_CHASE_OPP=copp,
                PT_CHASE_MEAN={k: r4(v) for k, v in chase_means.items()}, GB_PROFILE=gbp, SLOT_ANGLE=slot,
                PT_FB_IVB=r4(fbi), CLASS_TERMS=cls_t, SLOT_MOVE=slot_mv)


def chase_group_means(fit):
    """the 2c chase term's mean over 2024 opposite-side pitches of each SIDE group (fastball / off-speed)"""
    import profile_terms_fit as F
    d = F.load()
    d = d[(d.game_year == 2024) & (d.stand != d.p_throws)]
    m = {k[3:]: v for k, v in zip(fit["final"]["chase"]["names"], fit["final"]["chase"]["beta"]) if k.startswith("2c:")}
    fbi = E.PROFILES["mlb"][("FB", "")][1]
    vert = np.where(d.cls == "FB", d.ivb - fbi, d.divb)
    g = np.zeros(len(d))
    for c in CLS:
        on = (d.cls == c).values
        g[on] = m.get(f"{c}:opp", 0.0) + m[f"{c}:opp*hb/5"] * d.hb.values[on] / 5 + m[f"{c}:opp*vert/5"] * vert[on] / 5
    fb = (d.cls == "FB").values
    return {"FB": float(g[fb].mean()), "OS": float(g[~fb].mean())}


def report(T):
    """offsets (logit) the engine gives each MLB profile, in an arsenal with a typical four-seam, three-quarter slot"""
    lines = ["Profile terms at MLB (logit, vs the typical pitch of its class; typical four-seam as his main fastball, 3/4 slot)",
             "zone lines: whiff up / down / inside vs same-side / inside vs opposite-side; platoon priors: early counts, same / opposite",
             f"{'profile':14s} {'whiff':>6s} {'chase':>6s} {'cstr':>6s} {'hard':>6s} | {'W up':>5s} {'W dn':>5s} {'Wins':>5s} {'Wino':>5s} | "
             f"{'Wsame':>5s} {'Wopp':>5s} {'Hsame':>5s} {'Hopp':>5s} | {'GB':>5s}"]
    fbi = T["PT_FB_IVB"]
    for kind, tags in E.SHAPE_TAGS.items():
        c = "FB" if kind in E.FASTBALL_KINDS else kind
        for t in tags:
            key = f"{kind}|{t}"
            dm, ivb, hb = E.PROFILES["mlb"][(kind, t)]
            x = (dm, ivb - fbi, hb, T["SLOT_ANGLE"]["three-quarter"])
            row = []
            for tgt in ("whiff", "chase", "cstrike", "hard"):
                v = sum(b * (xi - ri) for b, xi, ri in zip(T["PT_C"][tgt][c], x, T["PT_REF"][c]))
                v += T["PT_B"].get(tgt, {}).get(key, 0.0)
                row.append(v)
            z = T["PT_FBZ_W"].get(key, (0, 0, 0, 0))
            pw = T["PT_PLAT"].get("whiff", {}).get(key, (0, 0, 0, 0))
            ph = T["PT_PLAT"].get("hard", {}).get(key, (0, 0, 0, 0))
            lines.append(f"{key:14s} " + " ".join(f"{v:+6.2f}" for v in row) + " | " + " ".join(f"{v:+5.2f}" for v in z) +
                         " | " + " ".join(f"{v:+5.2f}" for v in (pw[0], pw[2], ph[0], ph[2])) + f" | {T['GB_PROFILE'][key]:5.3f}")
    lines += ["", "Class terms (2a's fitted class values; NOT in the engines: held for Drew, see BUILD_v1.1_REPORT): off-speed "
              "class vs the typical four-seam at the aimed spot, same-side hitter", f"{'class spot':16s} {'whiff':>6s} {'chase':>6s} {'cstr':>6s} {'hard':>6s}"]
    for c in ("SL", "CB", "CH"):
        for q in ("up-in", "up-away", "middle", "down-in", "down-away", "down-middle", "chase"):
            lines.append(f"{c + ' ' + q:16s} " + " ".join(f"{T['CLASS_TERMS'][g][c][q][0]:+6.2f}" for g in ("whiff", "chase", "cstrike", "hard")))
    lines += ["", "Slot adjustment of an untagged pitch's default movement (in. per degree of arm angle, from the kind's median)"]
    for k, (si, sh, ref) in T["SLOT_MOVE"].items():
        lines.append(f"  {k}: IVB {si:+.3f}, HB {sh:+.3f} (median {ref})")
    return lines


def py_block(T):
    o = ["# --- PROFILE_TERMS: generated by profile_terms_tables.py --write-engines from the Step 2 fits (results/v11/step2_fit.json,",
         "# step2_terms.json); do not edit. Fitted: PT_C (2a model C), PT_B (2a model B over C), PT_FBZ_W (2b), PT_CHASE_OPP (2c).",
         "# Priors (plan 2.3, at their 2025 no-harm scale): PT_FBZ_H, PT_PLAT. Descriptive: GB_PROFILE (2e), SLOT_ANGLE,",
         "# SLOT_MOVE (slot adjustment, E10). The fitted class values (CLASS_TERMS) are held for Drew and not written here. ---"]
    for k in ("PT_C", "PT_B", "PT_FBZ_W", "PT_FBZ_H", "PT_PLAT", "PT_CHASE_OPP", "PT_CHASE_MEAN", "GB_PROFILE", "SLOT_ANGLE", "PT_FB_IVB",
              "SLOT_MOVE"):         # CLASS_TERMS stays in step2_terms.json: held for Drew (BUILD_v1.1_REPORT)
        o.append(f"{k} = {json.dumps(T[k], separators=(', ', ': '))}".replace("[", "(").replace("]", ")"))
    o.append("# --- end PROFILE_TERMS ---")
    return o


def js_block(T):
    o = ["  // --- PROFILE_TERMS: generated by profile_terms_tables.py --write-engines from the Step 2 fits; do not edit ---"]
    for k in ("PT_C", "PT_B", "PT_FBZ_W", "PT_FBZ_H", "PT_PLAT", "PT_CHASE_OPP", "PT_CHASE_MEAN", "GB_PROFILE", "SLOT_ANGLE", "PT_FB_IVB",
              "SLOT_MOVE"):         # CLASS_TERMS stays in step2_terms.json: held for Drew (BUILD_v1.1_REPORT)
        o.append(f"  const {k} = {json.dumps(T[k], separators=(', ', ': '))};")
    o.append("  // --- end PROFILE_TERMS ---")
    return o


def write_engines(T):
    for path, block, start, end in (("engine.py", py_block(T), "# --- PROFILE_TERMS:", "# --- end PROFILE_TERMS ---"),
                                    ("app/engine.js", js_block(T), "  // --- PROFILE_TERMS:", "  // --- end PROFILE_TERMS ---")):
        full = os.path.join(HERE, path)
        s = open(full, encoding="utf-8").read()
        i, j = s.index(start), s.index(end) + len(end)
        open(full, "w", encoding="utf-8").write(s[:i] + "\n".join(block) + s[j:])


if __name__ == "__main__":
    fit = json.load(open(os.path.join(OUT, "step2_fit.json")))
    T = build(fit, chase_group_means(fit))
    json.dump(T, open(os.path.join(OUT, "step2_terms.json"), "w"), indent=1)
    lines = report(T)
    open(os.path.join(OUT, "step2_terms.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))
    if "--write-engines" in sys.argv:
        write_engines(T)
        print("wrote PROFILE_TERMS into engine.py and app/engine.js")
