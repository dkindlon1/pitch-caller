"""v1.3: a PROVISIONAL zone-table candidate file from the zone seed (docs/ZONE_TABLE_DRAFT_v13.md). NOT approved, NOT default.

    python -m hitter_data.zone_candidate            # fit the seed level, write the candidate + its error report
    options: --level college_d1 (engine level the offsets are solved on), --out PATH

Writes C:/dev/pitchiq-data/fits/candidates/zone_v13prov.json, in the data_tables zone format (docs/TABLES_v13.md), plus
zone_v13prov_report.md beside it. Both live outside git. Selecting the candidate is PITCH_ZONE_TABLE=<that path>. Approving
the table later means copying an approved file into data_tables/, changing engine.TABLE_DEFAULT and diffing the goldens.

How the seed's ratios become engine offsets:
- The seed (zone_seed.fit_level on the seed level, Single-A) gives, per count group, band and profile, the ratio r of the
  cell's rate to its count group's average over the seed's location mix. Swing, whiff and hard use the band x profile
  table; foul has only band x class. A profile cell the seed can't size falls back to its class.
- Plan section 11 (Drew's hanger principle): zone effects follow the data by location. So the candidate sets
  class.chase_os and class.hanger_hard to 0 (the flat +0.2 chase and +0.5 hanger go). It adds no quality-gated hanger,
  because that design isn't approved.
- The level stays v1.2's. pbar(count) is v1.2's average rate at that count over the seed's mix (data denominators: pitches
  for swing, swings for whiff, contact for foul, balls in play with a speed for hard), so the count layer still sets the
  level and the table only the shape. The target for a cell is logit(pbar(count) x r).
- L0 is the engine's logit for a neutral pitch (zone_v12.v12_table: grade 3, command 3, same side, no reads) with the
  candidate's class terms and every cell at 0. The cell's offset is the data-weighted mean of (target - L0) over the
  counts in the group and the three heights. One offset per (band, profile, count group) is used at every height: the
  seed's tables carry no height, so the engine keeps its own height terms (SIDE, profile terms) around that average.
- Every number is relative to the engine at --level (D1 by default). level_cells stays empty. The transfer check says the
  shape differs by level (sharper at MLB), but the plan's rule for carrying it down to college / HS is Drew's call, and
  MLB isn't a product level. The report shows the residual this leaves at D3 and HS.

What the format can't carry (listed in the report): ball type by band and by height (the B rows: in-play values are per
contact quality, not per band); called strike on heart / way-off (the engine uses the base rate there), and no
called-strike table exists in the draft; the hard / ball-type height tables; per-count shape inside a count group.
"""
import argparse, copy, importlib.util, json, os, sys

import numpy as np

from . import DATA
from .zone_defs import BANDS, CLASSES, COUNT_GROUPS, HEIGHTS, PROFILES, count_group, pclass
from .zone_fit import OUTCOMES

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(DATA, "fits", "candidates")
OUT = os.path.join(OUT_DIR, "zone_v13prov.json")
VERSION = "v13prov"
REF_LEVEL = "college_d1"
CARRIED = ("swing", "whiff", "foul", "hard")                    # engine cell outcomes filled from the seed (cstrike stays 0)
SEED_DIMS = {"swing": (("band", "prof"), ("band", "cls")), "whiff": (("band", "prof"), ("band", "cls")),
             "foul": (("band", "cls"),), "hard": (("band", "prof"), ("band", "cls"))}
HANGER_ROWS = ("H1", "H5", "P4")
CANT_CARRY = [
    "Ball type by band (B4, B5) and by height (B1-B3): the engine prices a ball in play by contact quality, not by band, so "
    "a band or height term on ground ball / line drive / fly / pop-up needs an engine change, not a table "
    "(count_<v>.json bip_gb carries ball type by count only).",
    "Called strike on heart and way-off: the engine uses the base rate there (C0), so cstrike cells act on edge / off only. "
    "The draft also has no called-strike table, so every cstrike cell is 0.",
    "The seed's height tables (hard and ball type by height x class): the cells carry height, but the seed has no "
    "band x profile x height table to fill them; each (band, profile, count group) offset is used at all three heights.",
    "Shape inside a count group: one offset per count group, so the counts within 'ahead' (1-0, 2-0, 3-0, 2-1, 3-1) and "
    "'two' (0-2 ... 3-2) share it. The count layer carries the per-count level.",
    "Per-level shape (level_cells): left empty (see the docstring); the offsets are solved at one engine level.",
]


def _logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def _engine():
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    import engine
    return engine


def _dumps(obj):
    spec = importlib.util.spec_from_file_location("_build_v12", os.path.join(ROOT, "data_tables", "build_v12.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.dumps(obj) + "\n"


def weights(prepared, outcome):
    """{(b, s, band, ht, prof): recency-weighted data denominator} for an outcome (the seed's own denominators)"""
    den = OUTCOMES[outcome]["den"]
    d = prepared.assign(_w=prepared[den] * prepared["w"])
    g = d.groupby(["b", "s", "band", "ht", "prof"])["_w"].sum()
    return {(int(b), int(s), z, h, p): float(v) for (b, s, z, h, p), v in g.items() if v > 0}


def seed_ratio_fn(tables):
    """ratio(outcome, cg, band, prof) from the seed's fitted tables (band x profile, else band x class; None if neither)"""
    idx = {}
    for (o, dims), t in tables.items():
        idx[(o, dims)] = {k: (float(r), float(n)) for k, r, n in zip(t["keys"], t["ratio"], t["Nraw"])}

    def ratio(o, cg, band, prof):
        for dims in SEED_DIMS[o]:
            tab = idx.get((o, dims))
            if tab is None:
                continue
            key = (cg, band, prof) if dims == ("band", "prof") else (cg, band, pclass(prof))
            v = tab.get(key)
            if v is not None and np.isfinite(v[0]) and v[0] > 0:
                return v[0]
        return None
    return ratio


def stage0_table(base):
    """the shipped v12 zone table with the candidate's class terms (chase and hanger 0) and every cell 0"""
    t = copy.deepcopy(base)
    t["class"]["chase_os"] = {"off": 0.0, "noncomp": 0.0}
    t["class"]["hanger_hard"] = 0.0
    for o in t["cells"]:
        for z in t["cells"][o]:
            for p in t["cells"][o][z]:
                for g in t["cells"][o][z][p]:
                    for h in t["cells"][o][z][p][g]:
                        t["cells"][o][z][p][g][h] = 0.0
    t["level_cells"] = {}
    return t


def rows_with(E, table, level):
    """zone_v12.v12_table (the engine's neutral-pitch rows) computed with a zone table swapped in, then restored"""
    from .zone_v12 import v12_table
    old = E.use_zone_table(table)
    try:
        return v12_table(level)
    finally:
        E.use_zone_table(old)


def build_candidate(ratio, W, v12_rows, l0_rows, base, version=VERSION, about=None):
    """Pure conversion. ratio(o, cg, band, prof); W[o] = weights(); v12_rows / l0_rows: v12_table outputs with v1.2's table
    and with stage0_table. Returns (candidate table, {(o, cg, band, prof): (offset, source)})."""
    cand = stage0_table(base)
    cand["version"] = version
    cand["about"] = about or ("PROVISIONAL zone-table candidate from the zone seed (hitter_data/zone_candidate.py); NOT approved, "
                              "NOT default. Cells: logit offsets solved so the engine reproduces the seed's ratios on top of "
                              "v1.2's base + count terms, class chase / hanger set to 0 (plan section 11).")
    info = {}
    counts_in = {g: [(b, s) for s in range(3) for b in range(4) if count_group(b, s) == g] for g in COUNT_GROUPS}
    for o in CARRIED:
        w = W[o]
        pbar = {}
        for (b, s) in [(b, s) for s in range(3) for b in range(4)]:
            num = den = 0.0
            for z in BANDS:
                for h in HEIGHTS:
                    for p in PROFILES:
                        x = w.get((b, s, z, h, p), 0.0)
                        if x:
                            num += x * v12_rows[(b, s, z, h, p)][o]
                            den += x
            pbar[(b, s)] = num / den if den else float(np.mean([v12_rows[(b, s, z, h, p)][o] for z in BANDS for h in HEIGHTS for p in PROFILES]))
        for g in COUNT_GROUPS:
            for z in BANDS:
                for p in PROFILES:
                    r = ratio(o, g, z, p)
                    if r is None:
                        info[(o, g, z, p)] = (0.0, "no seed value: 0")
                        continue
                    num = den = 0.0
                    for (b, s) in counts_in[g]:
                        tgt = _logit(pbar[(b, s)] * r)
                        for h in HEIGHTS:
                            x = w.get((b, s, z, h, p), 0.0)
                            num += x * (tgt - _logit(l0_rows[(b, s, z, h, p)][o]))
                            den += x
                    if den == 0:              # no data weight in this cell: counts and heights equally
                        vals = [_logit(pbar[(b, s)] * r) - _logit(l0_rows[(b, s, z, h, p)][o]) for (b, s) in counts_in[g] for h in HEIGHTS]
                        off = float(np.mean(vals))
                    else:
                        off = float(num / den)
                    for h in HEIGHTS:
                        cand["cells"][o][z][p][g][h] = round(off, 6)
                    info[(o, g, z, p)] = (off, "weighted" if den else "unweighted")
    return cand, info


def statement_errors(res_tables, prepared, rows_by_name):
    """per draft statement: (seed value, {name: engine value}) using the doc's own v1.2 comparison (zone_v12.v12_cells)"""
    from .zone_report import STATEMENTS, stmt_value, v12_value
    from .zone_v12 import v12_cells
    out = {}
    cache = {}
    for sid, tp, o, dims, cellk, ref, text in STATEMENTS:
        t = res_tables.get((o, dims))
        sv = stmt_value(t, cellk, ref) if t else None
        ev = {}
        for name, rows in rows_by_name.items():
            k = (name, o, dims)
            if k not in cache:
                cache[k] = v12_cells(rows, prepared, o, dims)
            ev[name] = v12_value(cache[k], cellk, ref)
        out[sid] = (o, sv[0] if sv else None, ev, text)
    return out


def cell_errors(res_tables, prepared, rows, o):
    """seed vs engine ratio on every (count group, band, profile) cell of the band x profile (or class) table"""
    from .zone_v12 import v12_cells
    dims = SEED_DIMS[o][0]
    t = res_tables[(o, dims)]
    cells, groups = v12_cells(rows, prepared, o, dims)
    errs = []
    for k, r, n in zip(t["keys"], t["ratio"], t["Nraw"]):
        if k[0] == "all" or not np.isfinite(r) or n <= 0 or k not in cells or not groups.get(k[0]):
            continue
        errs.append((abs(cells[k] / groups[k[0]] - r), n, k, float(r), cells[k] / groups[k[0]]))
    if not errs:
        return None
    e = np.array([x[0] for x in errs]); n = np.array([x[1] for x in errs])
    worst = max(errs)
    big = [x for x in errs if x[1] >= 200]
    wbig = max(big) if big else None
    return dict(n_cells=len(errs), mean_abs=float((e * n).sum() / n.sum()), max_abs=worst[0], max_cell=worst[2],
                max_seed=worst[3], max_engine=worst[4], max_n=worst[1],
                max_abs_200=wbig[0] if wbig else None, max_cell_200=wbig[2] if wbig else None)


def run(level=REF_LEVEL, out=OUT, n_boot=0, verbose=True):
    from .zone_load import inventory
    from .zone_seed import fit_level
    E = _engine()
    inv = inventory()
    seed = "A"
    seasons = [r["season"] for r in inv if r["level"] == seed and not r["heldout"]]
    info = fit_level(seed, seasons, n_boot, verbose=verbose)
    if info is None:
        raise SystemExit("no Single-A Statcast on disk: nothing to seed the candidate from")
    P, tables = info["prepared"], info["tables"]
    base = json.load(open(os.path.join(ROOT, "data_tables", "zone_v12.json"), encoding="utf8"))
    W = {o: weights(P, o) for o in CARRIED}
    v12_rows = rows_with(E, base, level)
    l0_rows = rows_with(E, stage0_table(base), level)
    cand, cinfo = build_candidate(seed_ratio_fn(tables), W, v12_rows, l0_rows, base)
    E.check_table(cand, out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf8", newline="\n") as f:
        f.write(_dumps(cand))
    # errors: the candidate in the engine vs the seed, at the solve level and at D3 / HS
    rows = {"v1.2": v12_rows, "candidate": rows_with(E, cand, level)}
    other = {lv: rows_with(E, cand, lv) for lv in ("college_d3", "hs") if lv != level}
    st = statement_errors(tables, P, dict(rows, **{f"candidate@{lv}": r for lv, r in other.items()}))
    ce = {o: cell_errors(tables, P, rows["candidate"], o) for o in CARRIED}
    ce_v12 = {o: cell_errors(tables, P, rows["v1.2"], o) for o in CARRIED}
    rep = report(info, level, st, ce, ce_v12, cinfo, out, list(other))
    with open(os.path.splitext(out)[0] + "_report.md", "w", encoding="utf8", newline="\n") as f:
        f.write(rep)
    if verbose:
        print(rep)
        print("wrote", out)
    return dict(candidate=cand, statements=st, cells=ce, cells_v12=ce_v12, info=cinfo, out=out)


def _f(x, d=2):
    return "-" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f"x{x:.{d}f}"


def report(info, level, st, ce, ce_v12, cinfo, out, others):
    L = ["# Zone candidate v13prov (PROVISIONAL, NOT approved, NOT default)", "",
         f"File: `{out}` (data_tables zone format, docs/TABLES_v13.md). Select with `PITCH_ZONE_TABLE=<path>`.",
         f"Seed: Single-A, fit on {info['fit_seasons']} (check {info['check_season']}), the same fit as the zone draft. "
         f"Offsets solved at engine level `{level}`; class.chase_os and class.hanger_hard = 0 (plan section 11); no "
         "quality-gated hanger.", "",
         "## Per statement: seed vs the engine with the candidate", "",
         "| # | outcome | seed (A) | v1.2 | candidate | error (cand. - seed) | " + " | ".join(f"cand. @{lv}" for lv in others) + " |",
         "|---|---|---|---|---|---|" + "---|" * len(others)]
    worst = {}
    for sid, (o, sv, ev, text) in st.items():
        c = ev.get("candidate")
        err = (c - sv) if (c is not None and sv is not None) else None
        carried = o in CARRIED
        tag = "" if carried else " (not carried)"
        if carried and err is not None:
            worst[o] = max(worst.get(o, (0, "")), (abs(err), sid))
        L.append(f"| {sid} | {o}{tag} | {_f(sv)} | {_f(ev.get('v1.2'))} | {_f(c)} | "
                 f"{'-' if err is None else f'{err:+.3f}'} | " + " | ".join(_f(ev.get(f'candidate@{lv}')) for lv in others) + " |")
    L += ["", "Largest statement error per carried outcome: " +
          ", ".join(f"{o} {w[0]:.3f} ({w[1]})" for o, w in worst.items()) + ".", "",
          "## Per cell (band x profile; foul: band x class), count groups only, ratio units", "",
          "| outcome | cells | weighted mean abs error | max abs error (cell, seed -> candidate, n) | max abs error, cells with n >= 200 | v1.2's weighted mean abs error |",
          "|---|---|---|---|---|---|"]
    for o in CARRIED:
        e, v = ce.get(o), ce_v12.get(o)
        if not e:
            continue
        big = "-" if e["max_abs_200"] is None else "%.3f (%s)" % (e["max_abs_200"], "/".join(map(str, e["max_cell_200"])))
        L.append(f"| {o} | {e['n_cells']} | {e['mean_abs']:.3f} | {e['max_abs']:.3f} ({'/'.join(map(str, e['max_cell']))}, "
                 f"{e['max_seed']:.2f} -> {e['max_engine']:.2f}, n={e['max_n']:.0f}) | {big} | {v['mean_abs']:.3f} |")
    nofill = sorted(k for k, v in cinfo.items() if v[1].startswith("no seed"))
    L += ["", f"Cells with no seed value (left 0): {len(nofill)}" + (f", e.g. {nofill[:5]}" if nofill else "") + ".", "",
          "## Hanger rows (off-speed over the heart)", "",
          "| # | statement | seed (A) | v1.2 | candidate |", "|---|---|---|---|---|"]
    for sid in HANGER_ROWS:
        o, sv, ev, text = st[sid]
        L.append(f"| {sid} | {text.replace('{x}', 'xN')} | {_f(sv)} | {_f(ev.get('v1.2'))} | {_f(ev.get('candidate'))} |")
    L += ["", "## What the format can't carry", ""] + [f"- {x}" for x in CANT_CARRY]
    L += ["", "Errors come from: one offset per count group (counts within a group differ in v1.2's count terms), one offset "
          "across heights (the engine's own height terms stay), averaging over two aims per height, and statements "
          "measured on a different reference (chase = out-of-zone average; the cells are solved on swing)."]
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--level", default=REF_LEVEL)
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)
    run(level=a.level, out=a.out, verbose=not a.quiet)
    return 0


if __name__ == "__main__":
    sys.exit(main())
