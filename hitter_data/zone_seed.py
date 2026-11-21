"""v1.3 prework Part 2.2-2.4: zone seed, transfer check, draft zone table (plan 3.2). STOP POINT: Drew approves the table;
nothing here is wired into the engine.

  python -m hitter_data.zone_seed                 # fit every level on disk, print the summary
  python -m hitter_data.zone_seed --write-doc     # ... and write docs/ZONE_TABLE_DRAFT_v13.md
  options: --boot N (default 200), --levels A,AAA,MLB

Per level (A, AAA, MLB), from the non-held-out seasons on disk:
- two or more seasons: the latest is held out for the seed's own check and the rest are fit (recency weights halve every
  2 seasons back from the latest fit season);
- one season: 1 game in 5 (game_pk % 5 == 0) is held out for the check and the other 4 are fit;
- 2026 (hitter_data.HELDOUT_SEASON) is only counted.
Outputs: the markdown draft, and a JSON summary under {DATA}/derived/zone_seed/summary.json.
"""
import argparse
import datetime as dt
import json
import os
import zlib

import numpy as np
import pandas as pd

from .zone_fit import (N_BOOT, OUTCOMES, TABLES, check_table, fit_table, level_plan, prepare, split_games, transfer)
from .zone_load import CACHE, LEVELS, inventory, load_season
from .zone_report import STATEMENTS, biggest, render, stmt_value, v12_value
from .zone_v12 import v12_cells, v12_table

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC = os.path.join(ROOT, "docs", "ZONE_TABLE_DRAFT_v13.md")
MAIN = ("band", "cls")
KEY_OUTCOMES = ("swing", "chase", "whiff", "hard", "gb")


def mean_deviation(t):
    """Largest |mix-weighted mean of the ratios - 1| over the count groups (0 = mean-preserving)."""
    worst = 0.0
    for g in range(len(t["pg"])):
        m = (t["gidx"] == g) & (t["N"] > 0)
        if m.any() and np.isfinite(t["pg"][g]):
            worst = max(worst, abs((t["N"][m] * t["ratio"][m]).sum() / t["N"][m].sum() - 1.0))
    return worst


def fit_level(lv, seasons, n_boot, verbose=True):
    fit_s, chk_s, split = level_plan(seasons)
    if not fit_s:
        return None
    frames = {y: load_season(lv, y, verbose=verbose) for y in sorted(set(fit_s + [chk_s]))}
    kept = {y: int(f["n"].sum()) for y, f in frames.items()}
    if split == "games":
        fit_a, chk_a = split_games(frames[chk_s], check=False), split_games(frames[chk_s], check=True)
        plan_text = (f"only {chk_s} is on disk below the held-out season, so it is both fit and checked: 4 games in 5 fit, "
                     f"1 in 5 (game_pk % 5 == 0) held out for the check. Recency weights don't apply (one season).")
        check_text = f"{chk_s}, 1 game in 5"
    else:
        fit_a = pd.concat([frames[y] for y in fit_s], ignore_index=True)
        chk_a = frames[chk_s]
        wts = ", ".join(f"{y}: {0.5 ** ((max(fit_s) - y) / 2):.2f}" for y in fit_s)
        plan_text = f"fit on {', '.join(map(str, fit_s))} (recency weights {wts}); {chk_s} held out for the check."
        check_text = f"{chk_s} season"
    ref = max(fit_s)
    P = prepare(fit_a, ref)
    C = prepare(chk_a, ref)
    tables = {}
    for o, dims in TABLES:
        tables[(o, dims)] = fit_table(P, o, dims, n_boot=n_boot, seed=zlib.crc32(f"{lv}|{o}|{dims}".encode()))
    checks = [check_table(tables[(o, MAIN)], C, o, MAIN) for o in OUTCOMES]
    return dict(fit_seasons=fit_s, check_season=chk_s, split=split, kept=kept, tables=tables, checks=checks,
                prepared=P, plan_text=plan_text, check_text=check_text, games=int(P["game_pk"].nunique()))


def run(n_boot=N_BOOT, levels=LEVELS, verbose=True):
    inv = inventory()
    res = dict(run_date=str(dt.date.today()), n_boot=n_boot, levels_fit={}, inventory=[])
    for lv in levels:
        seasons = [r["season"] for r in inv if r["level"] == lv and not r["heldout"]]
        info = fit_level(lv, seasons, n_boot, verbose)
        if info:
            res["levels_fit"][lv] = info
    for r in inv:
        info = res["levels_fit"].get(r["level"])
        r = dict(r)
        if r["heldout"]:
            r["use"], r["kept"] = "held out: counted only, never fit or scored", None
        elif info and r["season"] in info["kept"]:
            r["kept"] = info["kept"][r["season"]]
            if info["split"] == "games":
                r["use"] = "fit (4 games in 5) + check (1 in 5)"
            else:
                r["use"] = "check (held out from the fit)" if r["season"] == info["check_season"] else "fit"
        else:
            r["use"], r["kept"] = "not used", None
        res["inventory"].append(r)
    if not res["levels_fit"]:
        raise SystemExit("no Savant data on disk under statcast/{A,AAA,MLB}")

    seed = "A" if "A" in res["levels_fit"] else next(iter(res["levels_fit"]))
    res["seed_level"] = seed
    if seed != "A":
        res["seed_note"] = f"**Single-A has no data yet, so {seed} stands in as the seed until it lands.**"
    res["mean_dev"] = max(mean_deviation(t) for info in res["levels_fit"].values() for t in info["tables"].values())

    # v1.2's values on the seed level's mix
    v12 = v12_table()
    sp = res["levels_fit"][seed]["prepared"]
    v12c = {}
    vals = {}
    for sid, tp, o, dims, cellk, ref, text in STATEMENTS:
        vals[sid] = {}
        for lv, info in res["levels_fit"].items():
            t = info["tables"].get((o, dims))
            vals[sid][lv] = stmt_value(t, cellk, ref) if t else None
        if (o, dims) not in v12c:
            v12c[(o, dims)] = v12_cells(v12, sp, o, dims)
        vals[sid]["v12"] = v12_value(v12c[(o, dims)], cellk, ref)
    res["statements"] = vals
    res["biggest"] = biggest({sid: v.get(seed) for sid, v in vals.items()})

    # transfer
    tr = {}
    if len(res["levels_fit"]) >= 2:
        for o in OUTCOMES:
            tr[o] = transfer({lv: info["tables"][(o, MAIN)] for lv, info in res["levels_fit"].items()}, o, MAIN)
    res["transfer"] = tr
    res["transfer_verdict"] = verdict_text(tr, res["levels_fit"])
    res["waiting"] = waiting(res, inv)
    return res


def verdict_text(tr, fits):
    if not tr:
        return "not run (one level)."
    lv = [x for x in ("A", "AAA", "MLB") if x in fits]
    key = {o: tr.get(o) for o in KEY_OUTCOMES}
    stable = [o for o, t in key.items() if t and t["verdict"] == "stable"]
    trend = [o for o, t in key.items() if t and t["verdict"] != "stable"]
    s = f"levels compared: {' -> '.join(lv)}. "
    if not trend:
        s += ("the shape is stable for " + ", ".join(stable) + ". Plan 3.2: use the Single-A shape for college as is.")
    else:
        s += ("stable for " + (", ".join(stable) if stable else "none") + "; **not stable for " + "; ".join(
            f"{o} ({key[o]['verdict']})" for o in trend) + "**.")
        if "AAA" in fits:
            s += (" Plan 3.2: where it trends with level, carry the trend one step down for college and two for HS (and "
                  "say so in the table).")
        else:
            s += (" Triple-A has no data yet, so this is Single-A vs MLB only: two points can't separate a trend from a "
                  "jump between the minors and MLB. Provisional reading for college: use the Single-A shape (the closest "
                  "hitters); if Triple-A lands between Single-A and MLB, plan 3.2 says carry the trend one step down for "
                  "college and two for HS, which would make the college shape a little flatter than Single-A's for the "
                  "outcomes that are sharper at MLB.")
    return s


def waiting(res, inv):
    out = []
    for lv in LEVELS:
        if lv not in res["levels_fit"]:
            out.append(f"{lv}: no files yet; the fit, check and transfer pick it up on the next run.")
            continue
        info = res["levels_fit"][lv]
        if info["split"] == "games":
            out.append(f"{lv}: only {info['check_season']} so far, so the check is a 1-in-5 game split, not a held-out season; "
                       f"earlier seasons are still downloading.")
        partial = [r for r in inv if r["level"] == lv and not r["heldout"] and r["days"] < 120]
        for r in partial:
            out.append(f"{lv} {r['season']}: {r['days']} day files so far (a full season is about 150-190); still downloading.")
    if "AAA" not in res["levels_fit"]:
        out.append("The transfer verdict needs Triple-A for a three-point trend.")
    out.append("Rerun `python -m hitter_data.zone_seed --write-doc` when the pulls finish; the statements and intervals refresh.")
    return out


def summary_json(res):
    s = dict(run_date=res["run_date"], seed=res["seed_level"], mean_dev=res["mean_dev"], inventory=res["inventory"],
             biggest=res["biggest"], transfer_verdict=res["transfer_verdict"], levels={}, statements={})
    for lv, info in res["levels_fit"].items():
        s["levels"][lv] = dict(fit_seasons=info["fit_seasons"], check_season=info["check_season"], split=info["split"],
                               games=info["games"], checks=info["checks"],
                               tables={f"{o}|{'x'.join(d)}": dict(keys=[list(map(str, k)) for k in t["keys"]],
                                                                   ratio=np.nan_to_num(t["ratio"]).round(4).tolist(),
                                                                   d=np.nan_to_num(t["d"]).round(4).tolist(),
                                                                   n=t["Nraw"].tolist())
                                       for (o, d), t in info["tables"].items()})
    for sid, v in res["statements"].items():
        s["statements"][sid] = {k: (list(x) if isinstance(x, tuple) else x) for k, x in v.items()}
    return json.loads(json.dumps(s, default=lambda x: x if not isinstance(x, (np.floating, np.integer)) else x.item()))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--write-doc", action="store_true")
    ap.add_argument("--boot", type=int, default=N_BOOT)
    ap.add_argument("--levels", default=",".join(LEVELS))
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)
    res = run(n_boot=a.boot, levels=tuple(a.levels.split(",")), verbose=not a.quiet)
    for r in res["inventory"]:
        print(f"{r['level']:4} {r['season']} days={r['days']:4} rows={r['rows']:9,} kept={r['kept'] if r['kept'] is not None else '-'}  {r['use']}")
    for lv, info in res["levels_fit"].items():
        for c in info["checks"]:
            print(f"check {lv} {c['outcome']:6} n={int(c['n']):8,} base={c['ll_base']:.4f} zone={c['ll_zone']:.4f} "
                  f"gain={c['gain']:+.4f} se={c['gain_se']:.4f} slope={c['cal_slope']:.2f}")
    print("mean-preserving: max deviation", f"{res['mean_dev']:.2e}")
    print("biggest:", res["biggest"])
    print("transfer:", res["transfer_verdict"])
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, "summary.json"), "w") as f:
        json.dump(summary_json(res), f, indent=1)
    if a.write_doc:
        with open(DOC, "w", encoding="utf-8", newline="\n") as f:
            f.write(render(res))
        print("wrote", DOC)
    return res


if __name__ == "__main__":
    main()
