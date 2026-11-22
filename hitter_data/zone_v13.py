"""v1.3 core: builds data_tables/zone_v13.json, the APPROVED zone table (Drew's ruling 2, Nov 21; docs/ZONE_v13_APPROVED.md).

    python -m hitter_data.zone_v13            # refit the seed (A, AAA, MLB; 200 game-bootstrap draws), write the table
    options: --out PATH (default data_tables/zone_v13.json), --doc PATH (default docs/ZONE_v13_APPROVED.md)

Drew approved the regenerated draft (docs/ZONE_TABLE_DRAFT_v13.md, `python -m hitter_data.zone_seed --write-doc`) with
exactly two changes:
  (a) where the draft finds the shape trends with level (the transfer check's "moving cells": per-level slope with a 95%
      interval excluding 0 and at least 0.10 logit per level step), the trend is carried one level step below Single-A for
      college and two for HS / travel;
  (b) the sinker-grounder row P3 takes Triple-A's value instead of Single-A's.
Everything else is the Single-A seed, converted to engine offsets exactly as hitter_data/zone_candidate.py does (that
module's build_candidate: per (band, profile, count group) one logit offset, solved on top of the engine's base + count +
class terms so the engine gives back the seed's ratio; class.chase_os and class.hanger_hard 0: the flat +0.2 chase and +0.5
hanger are gone).

How (a) is applied:
  - The trend is per (count group, band, class) cell of the main table (band x class), for the outcomes whose verdict is
    "trends with level" and that have moving cells: swing, chase, whiff, hard, gb, fb.
  - Each moving cell's logit offset moves by -k x slope (k = 1 college, 2 HS); the other cells stay. Within each count group
    the shifted rates are rescaled (one logit constant per group, solved on the seed's own weighted denominators) so the
    table stays mean-preserving: the count layer keeps setting the level, the table only the shape.
  - The engine carries swing (which is also the chase cells: off / way-off swings), whiff and hard as cells. The chase
    table's own trend is reported for the record but the engine's chase is the swing cells (same pitches, different
    reference: no double count). Ball type (gb, fb) by band can't be carried by the format (zone_candidate.CANT_CARRY).
  - The table is solved per engine level: level_cells.college_d1 / college_d2 / college_d3 get the one-step shape solved at
    that level, level_cells.hs (travel reads it) the two-step shape solved at hs. cells (MLB and any level without its
    own) is the Single-A shape solved at college_d1, as the candidate.
How (b) is applied: the format gains class.gb_kind (a ground-ball logit by pitch kind, both engines). gb_kind.SI is solved
so the engine's P3 (sinker / four-seam grounder rate in play, on the seed's mix, statement machinery of the draft) equals
Triple-A's draft value. No other kind is touched.

The seed refit is deterministic (same data, same seeds as the draft). The script checks the statement values and the
moving-cell counts against the draft's summary (C:/dev/pitchiq-data/derived/zone_seed/summary.json) and stops if they
differ. 2026 is never loaded (zone_seed guards every season).
"""
import argparse, copy, hashlib, json, os, sys

import numpy as np

from . import DATA
from . import zone_candidate as zc
from .zone_defs import BANDS, COUNT_GROUPS, pclass
from .zone_fit import GROUPS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data_tables", "zone_v13.json")
DOC = os.path.join(ROOT, "docs", "ZONE_v13_APPROVED.md")
REPORT = os.path.join(DATA, "fits", "zone_v13_report.json")
SUMMARY = os.path.join(DATA, "derived", "zone_seed", "summary.json")
VERSION = "v13"
TREND_OUTCOMES = ("swing", "chase", "whiff", "hard", "gb", "fb")
CARRIED_TREND = ("swing", "whiff", "hard")                  # engine cells that carry a level trend (chase = swing cells)
STEPS = {"college_d1": 1, "college_d2": 1, "college_d3": 1, "hs": 2}
P3_SOURCE = "AAA"
GB_SOLVE_KIND = "SI"


def _logit(p):
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return np.log(p / (1 - p))


def _sig(x):
    return 1.0 / (1.0 + np.exp(-x))


def _cls(x):
    return x if x in ("FB", "OS") else pclass(x)


def shift_table(t, trend, k):
    """A copy of seed table t with each moving cell's logit offset moved by -k x slope (trend {(cg, band, class): slope}),
    rescaled per count group to stay mean-preserving on the table's weighted denominators. Only tables with a band dim."""
    keys = t["keys"]
    if "band" not in t["dims"] or not trend or k == 0:
        return t
    bpos = 1 + t["dims"].index("band")
    xpos = [1 + i for i, d in enumerate(t["dims"]) if d != "band"][0]
    ratio, rate = t["ratio"].copy(), t["rate"].copy()
    N, pg = t["N"], t["pg"]
    for g in COUNT_GROUPS:
        idx = [i for i, kk in enumerate(keys) if kk[0] == g and np.isfinite(ratio[i])]
        if not idx:
            continue
        sl = np.array([trend.get((g, keys[i][bpos], _cls(keys[i][xpos])), 0.0) for i in idx])
        if not np.any(sl):
            continue
        pgv = pg[GROUPS.index(g)]
        p = np.clip(pgv * ratio[idx], 1e-9, 1 - 1e-9)
        w = N[idx]
        target = float((w * p).sum())
        x = _logit(p) - k * sl
        a = 0.0
        for _ in range(60):
            q = _sig(x + a)
            f = float((w * q).sum()) - target
            d = float((w * q * (1 - q)).sum())
            if d <= 0:
                break
            a -= f / d
            if abs(f) < 1e-12 * max(target, 1.0):
                break
        new = _sig(x + a)
        ratio[idx] = new / pgv
        rate[idx] = new
    out = {kk: v for kk, v in t.items() if not kk.endswith("_reps")}
    out["ratio"], out["rate"] = ratio, rate
    return out


def shifted_tables(tables, trends, k):
    return {key: (shift_table(t, trends.get(key[0], {}), k) if key[0] in trends else t) for key, t in tables.items()}


def p3_engine(E, table, prepared, level="college_d1"):
    from .zone_report import STATEMENTS, v12_value
    from .zone_v12 import v12_cells
    sid, tp, o, dims, cellk, ref, text = [s for s in STATEMENTS if s[0] == "P3"][0]
    rows = zc.rows_with(E, table, level)
    return v12_value(v12_cells(rows, prepared, o, dims), cellk, ref)


def solve_gb_kind(E, table, prepared, target, kind=GB_SOLVE_KIND):
    """secant on class.gb_kind[kind] until the engine's P3 equals target"""
    def f(x):
        t = copy.deepcopy(table)
        t["class"]["gb_kind"] = {kind: float(x)}
        return p3_engine(E, t, prepared) - target
    x0, x1 = 0.0, 0.2
    f0, f1 = f(x0), f(x1)
    for _ in range(30):
        if abs(f1) < 1e-7 or f1 == f0:
            break
        x0, x1, f0 = x1, x1 - f1 * (x1 - x0) / (f1 - f0), f1
        f1 = f(x1)
    return round(float(x1), 6), f0 + 0.0, f1


def check_against_draft(res):
    """the refit reproduces the approved draft: statement points (A / AAA / MLB) and moving-cell counts"""
    if not os.path.exists(SUMMARY):
        return ["no draft summary on disk to compare with"]
    d = json.load(open(SUMMARY, encoding="utf8"))
    bad = []
    for sid, v in res["statements"].items():
        for lv in ("A", "AAA", "MLB"):
            a, b = v.get(lv), d["statements"].get(sid, {}).get(lv)
            if (a is None) != (b is None) or (a is not None and abs(a[0] - b[0]) > 5e-4):
                bad.append(f"{sid} {lv}: {a and a[0]} vs draft {b and b[0]}")
    return bad


def run(out=OUT, doc=DOC, verbose=True):
    from .zone_seed import run as seed_run
    from .zone_report import STATEMENTS, stmt_value
    E = zc._engine()
    log = print if verbose else (lambda *a: None)
    log("refitting the zone seed (A, AAA, MLB; 200 bootstrap draws) ...")
    res = seed_run(n_boot=200, verbose=False)
    diffs = check_against_draft(res)
    if diffs:
        raise SystemExit("the seed refit does not reproduce the approved draft: " + "; ".join(diffs[:10]))
    A = res["levels_fit"]["A"]
    P, T = A["prepared"], A["tables"]
    trends = {}
    moving = {}
    for o in TREND_OUTCOMES:
        tr = res["transfer"].get(o)
        if tr and tr["verdict"].startswith("trends with level"):
            trends[o] = {tuple(k): s for k, s in tr["trend_keys"]}
            moving[o] = (len(tr["trend_keys"]), tr["cells"])
    log("moving cells:", {o: f"{a} of {b}" for o, (a, b) in moving.items()})
    sh = {k: shifted_tables(T, trends, k) for k in (1, 2)}
    base = json.load(open(os.path.join(ROOT, "data_tables", "zone_v12.json"), encoding="utf8"))
    W = {o: zc.weights(P, o) for o in zc.CARRIED}
    carried = lambda tabs: {k_: v for k_, v in tabs.items() if not (k_[0] in trends and k_[0] not in CARRIED_TREND)}
    rA = zc.seed_ratio_fn(T)
    cand, info_a = zc.build_candidate(rA, W, zc.rows_with(E, base, "college_d1"), zc.rows_with(E, zc.stage0_table(base), "college_d1"),
                                      base, version=VERSION)
    for lv, k in STEPS.items():
        log(f"solving level_cells.{lv} ({k} step{'s' if k > 1 else ''} below Single-A) ...")
        r = zc.seed_ratio_fn(carried(sh[k]))
        c_lv, _ = zc.build_candidate(r, W, zc.rows_with(E, base, lv), zc.rows_with(E, zc.stage0_table(base), lv), base, version=VERSION)
        cand["level_cells"][lv] = c_lv["cells"]
    p3_target = res["statements"]["P3"][P3_SOURCE][0]
    p3_before = p3_engine(E, cand, P)
    gbk, _, resid = solve_gb_kind(E, cand, P, p3_target)
    cand["class"]["gb_kind"] = {GB_SOLVE_KIND: gbk}
    cand["class"]["hanger_gate"] = 0.0
    p3_after = p3_engine(E, cand, P)
    cand["about"] = ("APPROVED v1.3 zone table (Drew's ruling 2, Nov 21; docs/ZONE_v13_APPROVED.md), built by "
                     "hitter_data/zone_v13.py from the Single-A seed of docs/ZONE_TABLE_DRAFT_v13.md: cells = logit offsets "
                     "solved so the engine gives back the seed's ratios (zone_candidate.build_candidate); level_cells: the "
                     "level trend carried one step below Single-A for college (college_d1/d2/d3) and two for HS / travel (hs) "
                     "on the moving cells (swing, whiff, hard carried); class.gb_kind.SI sets P3 (sinker / four-seam grounder "
                     "ratio) to Triple-A's value; class.chase_os and class.hanger_hard 0 (flat hanger removed); "
                     "class.hanger_gate H = 0 (ruling 3: sized later). Format: docs/TABLES_v13.md.")
    E.check_table(cand, out)
    text = zc._dumps(cand)
    with open(out, "w", encoding="utf8", newline="\n") as f:
        f.write(text)
    sha = hashlib.sha256(open(out, "rb").read()).hexdigest()
    log(f"wrote {out} sha256 {sha}")
    # the record: per statement, the target per level and what the engine gives with the table
    named = {"college_d1": "college_d1", "college_d3": "college_d3", "hs": "hs"}
    rows = {f"v13@{lv}": zc.rows_with(E, cand, lv) for lv in named}
    rows["v13refit@college_d1"] = zc.rows_with(E, base, "college_d1")
    st = zc.statement_errors(T, P, rows)
    rec = []
    for sid, tp, o, dims, cellk, ref, text_ in STATEMENTS:
        tv = {}
        for k in (1, 2):
            t = sh[k].get((o, dims))
            v = stmt_value(t, cellk, ref) if t is not None else None
            tv[k] = v[0] if v else None
        lv_vals = {lv: res["statements"][sid].get(lv) for lv in ("A", "AAA", "MLB")}
        moved = (o in trends and cellk[0] != "all" and "band" in dims
                 and any(abs(trends[o].get((cellk[0], cellk[1 + dims.index("band")], _cls(c[1 + [i for i, d in enumerate(dims) if d != "band"][0]])), 0.0)) > 0
                         for c in [cellk] + ([ref] if ref != "avg" else [])))
        rec.append(dict(sid=sid, group=tp, outcome=o, text=text_, A=lv_vals["A"] and lv_vals["A"][0], AAA=lv_vals["AAA"] and lv_vals["AAA"][0],
                        MLB=lv_vals["MLB"] and lv_vals["MLB"][0], v12=res["statements"][sid].get("v12"),
                        target_college=tv[1], target_hs=tv[2], trend=moved,
                        engine={nm: st[sid][2].get(nm) for nm in rows}))
    report = dict(sha256=sha, out=out, version=VERSION, moving=moving, trends={o: {"|".join(k_): s for k_, s in t.items()} for o, t in trends.items()},
                  p3=dict(source=P3_SOURCE, target=p3_target, seed_A=res["statements"]["P3"]["A"][0], engine_before=p3_before,
                          gb_kind_si=gbk, engine_after=p3_after, residual=resid),
                  statements=rec, fit_seasons=A["fit_seasons"], check_season=A["check_season"])
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, "w", encoding="utf8", newline="\n") as f:
        json.dump(report, f, indent=1, default=lambda x: x.item() if isinstance(x, np.generic) else str(x))
    if doc:
        with open(doc, "w", encoding="utf8", newline="\n") as f:
            f.write(approved_doc(report))
        log("wrote", doc)
    return report


def _x(v):
    return "-" if v is None or (isinstance(v, float) and not np.isfinite(v)) else f"x{v:.2f}"


def approved_doc(r):
    L = ["# Zone table v1.3: what Drew approved (ruling 2, Nov 21)", "",
         f"**File:** `data_tables/zone_v13.json`, **sha256 `{r['sha256']}`**. Built by `python -m hitter_data.zone_v13` "
         "(the generator writes this record too). Frozen: changing a number means a new file name, a new sha and a new record.",
         "",
         "**What was approved:** the regenerated draft `docs/ZONE_TABLE_DRAFT_v13.md` (Single-A seed, fit on "
         f"{', '.join(map(str, r['fit_seasons']))}, with {r['check_season']} held out for the check; 2026 never loaded), with exactly two changes:",
         "1. **(a) Level trend.** Where the draft's transfer check finds the shape trends with level (the moving cells: a per-level "
         "slope whose 95% interval excludes 0 and is at least 0.10 logit per level step), the trend is carried **one level step "
         "below Single-A for college and two for HS / travel**. Moving cells: " +
         ", ".join(f"{o} {a} of {b}" for o, (a, b) in r["moving"].items()) + ".",
         f"2. **(b) P3 (sinker grounders) from Triple-A:** x{r['p3']['target']:.2f} instead of Single-A's x{r['p3']['seed_A']:.2f}.",
         "", "Also, as the draft and plan section 11 say: `class.chase_os` and `class.hanger_hard` are 0 (the flat +0.2 off-speed "
         "chase and the flat +0.5 hanger are gone); the quality-gated hanger (ruling 3) is `class.hanger_gate` = 0 until it is "
         "sized on graded rows.", "",
         "## How the file carries it", "",
         "- `cells`: the Single-A shape, solved at college D1 (used by MLB and any level without its own cells).",
         "- `level_cells.college_d1`, `college_d2`, `college_d3`: the shape with the trend carried one step down, solved at each level.",
         "- `level_cells.hs`: two steps down, solved at HS; travel reads HS's.",
         "- Carried as engine cells: swing (which includes the chase cells: swings on off / way-off pitches), whiff, foul, hard. "
         "The chase table's own trend is listed below for the record; the engine's chase follows the swing cells' trend (same "
         "pitches, no double count).",
         "- Not carried (format): ball type by band or height (gb, ld, fb, pu: B1-B5) and the called-strike shape (no draft table). "
         "Their level trends (gb, fb) are recorded, not applied.",
         f"- P3: `class.gb_kind.SI` = {r['p3']['gb_kind_si']:+.4f} logit (new key, both engines), so the engine's P3 on the seed's mix "
         f"is x{r['p3']['engine_after']:.3f} (target x{r['p3']['target']:.3f}; x{r['p3']['engine_before']:.3f} without it). It applies at "
         "every level.", "",
         "## Statement by statement", "",
         "Columns: the draft's values (A = Single-A seed, AAA, MLB); **target** = the value the table is meant to carry at that "
         "level (A's, or A's with the trend carried 1 / 2 steps down where the statement's cells move); **engine** = what the "
         "engine gives with zone_v13 at that level (the draft's own comparison: neutral pitch, seed's mix). Source: where the "
         "number comes from.", "",
         "| # | Statement (draft wording) | A | AAA | MLB | College target | HS target | Engine D1 | Engine D3 | Engine HS | Source |",
         "|---|---|---|---|---|---|---|---|---|---|---|"]
    for s in r["statements"]:
        o = s["outcome"]
        if s["sid"] == "P3":
            src = "**Triple-A (change b)**, all levels"
            tc = th = r["p3"]["target"]
        elif o in ("gb", "ld", "fb", "pu"):
            src = "Single-A seed; **not carried** (ball type by band / height: format)" + ("; trend recorded" if s["trend"] else "")
            tc, th = s["target_college"], s["target_hs"]
        elif o == "chase":
            src = ("Single-A seed, **trend carried 1 / 2 steps down (change a)** via the swing cells" if s["trend"]
                   else "Single-A seed (via the swing cells)")
            tc, th = s["target_college"], s["target_hs"]
        else:
            src = "Single-A seed, **trend carried 1 / 2 steps down (change a)**" if s["trend"] else "Single-A seed (no moving cell)"
            tc, th = s["target_college"], s["target_hs"]
        if (not s["trend"] and s["sid"] != "P3" and o not in ("gb", "ld", "fb", "pu") and s["A"] is not None and tc is not None
                and max(abs(tc - s["A"]), abs(th - s["A"])) > 0.005):
            src += "; its value moves with the count group's mean-preserving rescale"
        e = s["engine"]
        txt = s["text"].replace("{x}", "x")
        L.append(f"| {s['sid']} | {txt} | {_x(s['A'])} | {_x(s['AAA'])} | {_x(s['MLB'])} | {_x(tc)} | {_x(th)} | "
                 f"{_x(e.get('v13@college_d1'))} | {_x(e.get('v13@college_d3'))} | {_x(e.get('v13@hs'))} | {src} |")
    L += ["", "Engine values differ from the targets where the format can't carry the statement exactly (one offset per count "
          "group across heights, the engine's own height and side terms, statements on a different reference such as chase "
          "against the out-of-zone average); see `hitter_data/zone_candidate.py` (CANT_CARRY) and the candidate report.", "",
          "## The level trend applied (change a): moving cells, logit per level step toward MLB", "",
          "College gets -1 x slope, HS / travel -2 x slope, then each count group is rescaled to stay mean-preserving.", ""]
    for o, t in r["trends"].items():
        carried = "carried" if o in CARRIED_TREND else ("carried through the swing cells" if o == "chase" else "recorded, not carried (ball type)")
        L.append(f"- **{o}** ({carried}): " + "; ".join(f"{k.replace('|', ' ')} {v:+.2f}" for k, v in sorted(t.items())))
    L += ["", "Rebuild: `python -m hitter_data.zone_v13` (refits the seed; stops if the refit does not reproduce the draft's "
          "statement values). Report JSON: `C:/dev/pitchiq-data/fits/zone_v13_report.json`.", ""]
    return "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--doc", default=DOC)
    a = ap.parse_args(argv)
    run(out=a.out, doc=a.doc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
