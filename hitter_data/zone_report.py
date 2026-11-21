"""v1.3 zone seed: the coach-language statements and docs/ZONE_TABLE_DRAFT_v13.md.

Each statement names one table cell and what it is compared with: "avg" = the count group's own average over the level's
location mix (the table's mean-preserving reference), or another cell (a ratio between two cells). Values are ratios of
rates (x1.30 = 30% more often), 95% intervals from the game bootstrap.
"""
import numpy as np

from .zone_fit import GROUPS, HALF_LIFE, K_SHRINK, ci

BC, HC, BP, P = ("band", "cls"), ("ht", "cls"), ("band", "prof"), ("prof",)

# (id, topic, outcome, dims, cell, ref, text). {x} is the seed's ratio.
STATEMENTS = [
    ("S1", "Swing", "swing", BC, ("first", "heart", "FB"), "avg",
     "On the first pitch, a fastball over the heart is swung at {x} as often as the average 0-0 pitch."),
    ("S2", "Swing", "swing", BC, ("ahead", "heart", "FB"), "avg",
     "In hitter's counts, a fastball over the heart is swung at {x} as often as the average pitch in those counts."),
    ("S3", "Swing", "swing", BC, ("two", "heart", "FB"), "avg",
     "With two strikes, a fastball over the heart is swung at {x} as often as the average two-strike pitch."),
    ("S4", "Swing", "swing", BC, ("first", "edge", "FB"), "avg",
     "On the first pitch, a fastball on the edge is swung at {x} as often as the average 0-0 pitch."),
    ("S5", "Swing", "swing", BC, ("two", "edge", "OS"), "avg",
     "With two strikes, an off-speed pitch on the edge is swung at {x} as often as the average two-strike pitch."),
    ("C1", "Chase", "chase", BC, ("two", "off", "OS"), "avg",
     "With two strikes, an off-speed pitch just off the plate is chased {x} as often as the average two-strike pitch out of the zone."),
    ("C2", "Chase", "chase", BC, ("ahead", "off", "OS"), "avg",
     "In hitter's counts, an off-speed pitch just off the plate is chased {x} as often as the average out-of-zone pitch in those counts."),
    ("C3", "Chase", "chase", BC, ("two", "off", "FB"), "avg",
     "With two strikes, a fastball just off the plate is chased {x} as often as the average two-strike pitch out of the zone."),
    ("C4", "Chase", "chase", BC, ("two", "noncomp", "OS"), "avg",
     "With two strikes, an off-speed pitch way off (waste) is chased {x} as often as the average two-strike pitch out of the zone."),
    ("C5", "Chase", "chase", BC, ("first", "off", "OS"), ("first", "off", "FB"),
     "On the first pitch, an off-speed pitch just off the plate is chased {x} as often as a fastball just off the plate."),
    ("W1", "Whiff", "whiff", BC, ("two", "off", "OS"), "avg",
     "With two strikes, a swing at an off-speed pitch just off the plate misses {x} as often as the average two-strike swing."),
    ("W2", "Whiff", "whiff", BC, ("first", "heart", "FB"), "avg",
     "On the first pitch, a swing at a fastball over the heart misses {x} as often as the average 0-0 swing."),
    ("W3", "Whiff", "whiff", BC, ("two", "heart", "OS"), ("two", "heart", "FB"),
     "With two strikes, a swing at off-speed over the heart misses {x} as often as a swing at a fastball there."),
    ("W4", "Whiff", "whiff", BC, ("behind", "edge", "FB"), "avg",
     "At 0-1, a swing at a fastball on the edge misses {x} as often as the average 0-1 swing."),
    ("W5", "Whiff", "whiff", BC, ("two", "noncomp", "OS"), "avg",
     "With two strikes, a swing at an off-speed pitch way off misses {x} as often as the average two-strike swing."),
    ("H1", "Hard contact", "hard", BC, ("two", "heart", "OS"), ("two", "heart", "FB"),
     "Hung off-speed over the heart with two strikes is hit hard (95+ mph) {x} as often as a fastball there."),
    ("H2", "Hard contact", "hard", BC, ("ahead", "heart", "FB"), "avg",
     "In hitter's counts, a fastball over the heart put in play is hit hard {x} as often as the average ball in play in those counts."),
    ("H3", "Hard contact", "hard", BC, ("two", "off", "OS"), "avg",
     "With two strikes, an off-speed pitch just off the plate put in play is hit hard {x} as often as the average two-strike ball in play."),
    ("H4", "Hard contact", "hard", BC, ("behind", "edge", "FB"), "avg",
     "At 0-1, a fastball on the edge put in play is hit hard {x} as often as the average 0-1 ball in play."),
    ("H5", "Hard contact", "hard", BC, ("first", "heart", "OS"), "avg",
     "On the first pitch, off-speed over the heart put in play is hit hard {x} as often as the average 0-0 ball in play."),
    ("B1", "Ball type", "pu", HC, ("all", "up", "FB"), "avg",
     "A fastball in the top third of the zone or above, put in play, is a pop-up {x} as often as the average ball in play."),
    ("B2", "Ball type", "gb", HC, ("all", "down", "OS"), "avg",
     "An off-speed pitch in the bottom third or below, put in play, is a ground ball {x} as often as the average ball in play."),
    ("B3", "Ball type", "fb", HC, ("all", "up", "FB"), "avg",
     "A fastball up, put in play, is a fly ball {x} as often as the average ball in play."),
    ("B4", "Ball type", "ld", BC, ("all", "heart", "FB"), "avg",
     "A fastball over the heart, put in play, is a line drive {x} as often as the average ball in play."),
    ("B5", "Ball type", "gb", BC, ("all", "off", "OS"), "avg",
     "An off-speed pitch just off the plate, put in play, is a ground ball {x} as often as the average ball in play."),
    ("P1", "Profiles", "chase", BP, ("two", "off", "SW"), ("two", "off", "SL"),
     "With two strikes, a sweeper just off the plate is chased {x} as often as a slider there."),
    ("P2", "Profiles", "whiff", BP, ("all", "off", "SP"), ("all", "off", "CH"),
     "A swing at a splitter just off the plate misses {x} as often as a swing at a changeup there."),
    ("P3", "Profiles", "gb", P, ("all", "SI"), ("all", "FB"),
     "A sinker put in play is a ground ball {x} as often as a four-seam fastball put in play."),
    ("P4", "Profiles", "hard", BP, ("all", "heart", "CB"), ("all", "heart", "SL"),
     "A curveball over the heart put in play is hit hard {x} as often as a slider over the heart."),
    ("F1", "Foul", "foul", BC, ("two", "edge", "FB"), "avg",
     "With two strikes, contact on a fastball on the edge is fouled off {x} as often as the average two-strike contact."),
]


def stmt_value(t, cellk, ref):
    """(point, (lo, hi), n cell) for a statement on one fitted table, or None if the cell is missing."""
    keys = t["keys"]
    if cellk not in keys or (ref != "avg" and ref not in keys):
        return None
    i = keys.index(cellk)
    if ref == "avg":
        pt = t["ratio"][i]
        reps = t["ratio_reps"][:, i] if "ratio_reps" in t else np.array([])
    else:
        j = keys.index(ref)
        pt = t["rate"][i] / t["rate"][j]
        reps = t["rate_reps"][:, i] / t["rate_reps"][:, j] if "rate_reps" in t else np.array([])
    n = t["Nraw"][i] if ref == "avg" else min(t["Nraw"][i], t["Nraw"][keys.index(ref)])
    return float(pt), ci(reps), float(n)


def v12_value(v12, cellk, ref):
    cells, groups = v12
    if cellk not in cells:
        return None
    if ref == "avg":
        g = groups.get(cellk[0])
        return cells[cellk] / g if g else None
    return cells[cellk] / cells[ref] if ref in cells and cells[ref] else None


def fmt(v):
    if v is None:
        return "no data yet"
    pt, (lo, hi), n = v
    if not np.isfinite(pt):
        return "n/a"
    s = f"x{pt:.2f}"
    if np.isfinite(lo):
        s += f" ({lo:.2f}-{hi:.2f})"
    return s


def _ratio_word(pt):
    return f"x{pt:.2f}"


def biggest(values, k=5):
    """Statements with the largest |log ratio| whose interval excludes 1."""
    rows = []
    for sid, v in values.items():
        if v is None or not np.isfinite(v[0]):
            continue
        lo, hi = v[1]
        if np.isfinite(lo) and lo <= 1.0 <= hi:
            continue
        rows.append((abs(np.log(v[0])), sid))
    return [sid for _, sid in sorted(rows, reverse=True)[:k]]


def disagreements(vals, seed, k=8):
    rows = []
    for sid, v in vals.items():
        sv, v12 = v.get(seed), v.get("v12")
        if not sv or v12 is None or not np.isfinite(sv[0]):
            continue
        lo, hi = sv[1]
        if np.isfinite(lo) and not (lo <= v12 <= hi):
            rows.append((abs(np.log(sv[0] / v12)), sid))
    return [sid for _, sid in sorted(rows, reverse=True)[:k]]


def render(res):
    """res: the dict zone_seed.run() builds. Returns the markdown text."""
    seed = res["seed_level"]
    L = []
    w = L.append
    w("# Zone table draft, v1.3 (plan 3.2)")
    w("")
    w("**DRAFT. STOP POINT: Drew approves; not wired into the engine.** Nothing here changes a call. Generated by "
      "`python -m hitter_data.zone_seed --write-doc` on " + res["run_date"] + "; rerun it as more data lands and every number "
      "below refreshes.")
    w("")
    w(f"Seed level: **{seed}** (plan 1.2: Single-A Statcast seeds the table). Triple-A and MLB are fit the same way for the "
      "transfer check.")
    if res.get("seed_note"):
        w("")
        w(res["seed_note"])
    w("")
    w("## How to read it")
    w("")
    w("- Every number is a **ratio of rates**: x1.30 means 30% more often, x0.70 means 30% less often. In brackets: the 95% "
      "interval from resampling whole games (game_pk bootstrap, " + str(res["n_boot"]) + " draws).")
    w("- \"The average pitch in that count\" means the count group's own rate over that level's real location mix. The table "
      "is **mean-preserving**: averaged over that mix every count group comes back to its own rate exactly (checked: "
      f"largest deviation {res['mean_dev']:.1e}), so the count layer fit per level sets the level and this table only the shape.")
    w("- Zone bands, pitch classes and count groups are the engine's own: heart / edge / off / way-off are the engine's "
      "Savant attack zones (`engine.py` GEO_HEART / GEO_ZONE / GEO_EXT: inside 67%, 133%, 200% of the zone; the batter's "
      "own zone height); fastball = four-seam, sinker, cutter (`FASTBALL_KINDS`); off-speed = slider, curveball, changeup "
      "(sweeper = SL|sweeper, splitter = CH|split). Count groups follow the engine's count terms: first pitch (0-0), "
      "hitter's counts (1-0, 2-0, 3-0, 2-1, 3-1), 1-1, 0-1, two strikes. Height thirds (up / middle / down) are thirds of "
      "the zone height (`HEIGHTS`). Hard-hit = 95+ mph exit speed.")
    w("- **v1.2** is what today's engine implies for the same comparison: `engine.outcome_probs` per landing band for a "
      "neutral pitch (grade 3, command 3, same side, no hitter reads) at D1, averaged with the seed level's own counts the "
      "same way. \"v1.2 has no such term\" is written where the engine's value doesn't move with that cell.")
    w(f"- Fit: each cell's recency-weighted rate (weights halve every {HALF_LIFE:g} seasons back), shrunk by {K_SHRINK:g} "
      f"pitches toward the same cell pooled over all counts, then rescaled to be mean-preserving.")
    w("")

    # statements
    w("## Statements")
    w("")
    vals = res["statements"]
    lv_cols = [lv for lv in ("A", "AAA", "MLB") if lv in res["levels_fit"]]
    hdr = "| # | Statement | " + " | ".join(f"{lv}{' (seed)' if lv == seed else ''}" for lv in lv_cols) + " | v1.2 now |"
    sep = "|---|---|" + "---|" * len(lv_cols) + "---|"
    topic = None
    for sid, tp, o, dims, cellk, ref, text in STATEMENTS:
        if tp != topic:
            if topic is not None:
                w("")
            w(f"### {tp}")
            w("")
            w(hdr)
            w(sep)
            topic = tp
        sv = vals[sid].get(seed)
        x = _ratio_word(sv[0]) if sv else "xN"
        v12 = vals[sid].get("v12")
        v12s = (f"x{v12:.2f}" if v12 is not None and abs(v12 - 1) >= 0.005 else
                "x1.00 (v1.2 has no such term)") if v12 is not None else "v1.2 has no such term"
        n = f" (n={int(sv[2]):,})" if sv else ""
        w(f"| {sid} | {text.format(x='**' + x + '**')}{n} | " + " | ".join(fmt(vals[sid].get(lv)) for lv in lv_cols)
          + f" | {v12s} |")
    w("")
    big = res["biggest"]
    w("**Largest effects at the seed level** (interval excludes x1.00): " + ", ".join(
        f"{sid} {_ratio_word(vals[sid][seed][0])}" for sid in big) + ".")
    w("")
    dis = disagreements(vals, seed)
    if dis:
        w("**Where the seed and v1.2 disagree most** (v1.2's value outside the seed's 95% interval, largest gap first): "
          + "; ".join(f"{sid} data {_ratio_word(vals[sid][seed][0])} vs v1.2 x{vals[sid]['v12']:.2f}" for sid in dis) + ".")
        w("")

    # v1.2 terms
    w("Where v1.2's numbers come from (`engine.py`): swing = `S0` by band + the count terms in `outcome_probs` (+0.9 logit at "
      "two strikes for every band; -0.4 at 0-0; hitter's counts +0.3 in the zone and -0.4 out of it; 3-0 -2.0) + the level "
      "swing offsets `zsw` / `osw` + `class_terms` (+0.2 on an off-speed pitch just off the plate) + `profile_terms`; whiff = "
      "`W0` by band + `W_FB` / `KIND_W_OS` + `wz` / `wo`; foul = `F0` by band (+0.3 at two strikes); hard = `Q0` by band + "
      "the +0.5 hanger term (off-speed over the heart) + `class_terms` / `profile_terms`; ball type = `GB_PROFILE` + "
      "`TYPED.beta_y` (-0.36 logit per ft of aimed height) + the contact-quality shift, so the band moves ball type only "
      "through v1.2's weak / solid / hard split. The plan's inventory (`docs/HITTER_V13_INVENTORY.md` B20) lists `S0 C0 W0 "
      "F0 Q0` as provenance unclear and to be superseded by this table.")
    w("")

    # data
    w("## Data used")
    w("")
    w("Baseball Savant `details` day files, regular season, `C:/dev/pitchiq-data/statcast/<level>/<year>/`. Kept pitches drop "
      "pitchouts, intentional and automatic balls / strikes, bunts, pitches with no location and pitch types with no engine "
      "kind (knuckleball, eephus, and the untracked rows with no pitch type or location: about 10% of Single-A). **2026 is the held-out season: counted below, never loaded into a fit or a score** "
      "(`hitter_data.assert_not_heldout` runs on every season the fit and the check touch).")
    w("")
    w("| Level | Season | Day files | Raw rows | Kept pitches | Use |")
    w("|---|---|---|---|---|---|")
    for r in res["inventory"]:
        w(f"| {r['level']} | {r['season']} | {r['days']} | {r['rows']:,} | "
          f"{('{:,}'.format(r['kept']) if r.get('kept') is not None else '-')} | {r['use']} |")
    w("")
    for lv in ("A", "AAA", "MLB"):
        if lv not in res["levels_fit"]:
            w(f"- **{lv}: no data on disk yet.** The code runs on it as soon as files land (rerun the command above).")
    for lv, info in res["levels_fit"].items():
        w(f"- **{lv}**: {info['plan_text']}")
    w("")

    # held-out
    w("## Held-out check (the seed's own check)")
    w("")
    w("Each level's latest fit season is scored against the shape fitted without it. The count average is the check rows' own "
      "(the table's job is the shape, not the level), so \"base\" = count average alone and \"zone\" = count average plus the "
      "fitted offsets. Log loss per decision (lower is better); gain = base - zone with a game-clustered SE; calibration "
      "slope 1.00 = the fitted offsets are the right size (below 1 = too big, i.e. overfit); max gap = the largest |observed "
      "- predicted| rate among cells with 200+ decisions.")
    w("")
    w("| Level | Check set | Outcome | Decisions | Log loss base | Log loss zone | Gain (SE) | Gain / SE | Cal. slope | Max gap |")
    w("|---|---|---|---|---|---|---|---|---|---|")
    for lv, info in res["levels_fit"].items():
        for c in info["checks"]:
            z = c["gain"] / c["gain_se"] if c["gain_se"] and np.isfinite(c["gain_se"]) and c["gain_se"] > 0 else np.nan
            w(f"| {lv} | {info['check_text']} | {c['outcome']} | {int(c['n']):,} | {c['ll_base']:.4f} | {c['ll_zone']:.4f} | "
              f"{c['gain']:+.4f} ({c['gain_se']:.4f}) | {z:+.1f} | {c['cal_slope']:.2f} | {c['max_gap_200']:.3f} |")
    w("")
    sd_checks = res["levels_fit"][seed]["checks"]
    weak = [c["outcome"] for c in sd_checks if not (c["gain_se"] and c["gain"] > 2 * c["gain_se"])]
    good = [c["outcome"] for c in sd_checks if c["gain_se"] and c["gain"] > 2 * c["gain_se"]]
    w(f"**Read-out at the seed level:** the zone shape beats the count average by more than 2 SE for {', '.join(good)}"
      + (f"; it does **not** for {', '.join(weak)}, so those outcomes should get no zone term (they stay at the count "
         f"layer; a line-drive share can be the remainder after ground balls, fly balls and pop-ups)." if weak else ".")
      + " Calibration slopes near 1.00 mean the fitted offsets are about the right size on games they were not fit on.")
    w("")

    # transfer
    w("## Transfer check: Single-A -> Triple-A -> MLB")
    w("")
    w("Shape compared on the main table (band x class x count group) in logit offsets, cells with 100+ decisions at every "
      "level. **Scale** = the higher level's offsets regressed on Single-A's (1.00 = same shape; above 1 = sharper, below "
      "1 = flatter; 95% basic-bootstrap interval). **Mean abs diff** = average absolute logit difference from Single-A, "
      "beside what sampling noise alone would give. **Moving cells** = cells whose per-level slope has a 95% interval "
      "excluding 0 and is at least 0.10 logit per level step (A -> MLB counts as two steps).")
    w("")
    tr = res["transfer"]
    if not tr:
        w("Not run: only one level has data so far.")
    else:
        hi_lvls = [lv for lv in ("AAA", "MLB") if any(lv in (t or {}).get("beta", {}) for t in tr.values())]
        w("| Outcome | Cells | " + " | ".join(f"Scale {lv} vs A" for lv in hi_lvls) + " | " +
          " | ".join(f"Mean abs diff {lv}" for lv in hi_lvls) + " | Moving cells | Verdict |")
        w("|---|---|" + "---|" * (2 * len(hi_lvls)) + "---|---|")
        for o, t in tr.items():
            if t is None:
                w(f"| {o} | - | " + " | ".join("-" for _ in range(2 * len(hi_lvls))) + " | - | too few shared cells |")
                continue
            sc = " | ".join((f"{t['beta'][lv]:.2f} ({t['beta_ci'][lv][0]:.2f}-{t['beta_ci'][lv][1]:.2f})"
                             if lv in t["beta"] else "-") for lv in hi_lvls)
            md = " | ".join((f"{t['mad'][lv]:.3f} (noise {t['mad_noise'][lv]:.3f})"
                             if lv in t["mad"] else "-") for lv in hi_lvls)
            w(f"| {o} | {t['cells']} | {sc} | {md} | {t['trend_cells_big']} of {t['cells']} | {t['verdict']} |")
        w("")
        w("**Verdict:** " + res["transfer_verdict"])
        tk = [(o, t["trend_keys"]) for o, t in tr.items() if t and t["trend_keys"]]
        if tk:
            w("")
            w("Moving cells (change in the cell's logit offset per level step, Single-A towards MLB; + = the cell sits "
              "higher against its count's average at the higher level):")
            w("")
            for o, keys in tk:
                w(f"- {o}: " + "; ".join(f"{_cell_label(k)} {s:+.2f}" for k, s in keys[:8]) +
                  (f" (+{len(keys) - 8} more)" if len(keys) > 8 else ""))
    w("")

    # appendix
    w("## Appendix: the seed's main table (ratio to the count's average)")
    w("")
    sd = res["levels_fit"].get(seed)
    if sd:
        for o in ("swing", "chase", "whiff", "hard", "gb", "pu"):
            t = sd["tables"][(o, BC)]
            cells = [k[1:] for k in t["keys"] if k[0] == "first"]
            w(f"**{o}** (count averages: " + ", ".join(
                f"{g} {t['pg'][GROUPS.index(g)]:.3f}" for g in GROUPS if np.isfinite(t['pg'][GROUPS.index(g)])) + ")")
            w("")
            w("| Count | " + " | ".join(f"{c[0]} {c[1]}" for c in cells) + " |")
            w("|---|" + "---|" * len(cells))
            for g in GROUPS:
                row = []
                for c in cells:
                    i = t["keys"].index((g,) + c)
                    row.append(f"{t['ratio'][i]:.2f}" if np.isfinite(t["ratio"][i]) else "-")
                w(f"| {g} | " + " | ".join(row) + " |")
            w("")
    w("## Waiting on more data")
    w("")
    for line in res["waiting"]:
        w(f"- {line}")
    w("")
    return "\n".join(L)


def _cell_label(k):
    g, rest = k[0], k[1:]
    parts = []
    for x in rest:
        parts.append(str(x))
    return f"{g} {' '.join(parts)}"
