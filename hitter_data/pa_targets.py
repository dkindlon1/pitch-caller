"""v1.3 (Drew's Nov 24 ruling 12, last point): the K / BB / HBP targets on the count chain's PA definition.

The real targets (college_run_values.json: conference team totals for college, Savant for MLB, the national average for
HS) count every PA. The count chain (and the count layer it chains) never sees sacrifices, bunt PAs, intentional walks or
interference: the harness drops bunt PAs (bip_type bunt, SAC / SH) and EXCLUDED_RESULTS (IBB, CI, BINT) before the pitch
events are read. So each target is put on the chain's definition with the ratio its level's own play-by-play shows:

    target_chain[stat] = target_all[stat] x rate_scored[stat] / rate_all[stat]

  college  the weighted full games the count layer is fit on (chain_check A -> B: its fit seasons, recency weights and
           full-game weights)
  HS       hs.sqlite3 full-log games over the HS count fit's seasons and recency weights (hs_sep_thru2025 fit_seasons)
  MLB      Statcast regular season 2021-2025 (recency weights halving every 2 seasons back from 2025, as the h3 landing);
           all PAs = rows with an event (truncated PAs dropped); scored = without sac_bunt / sac_bunt_double_play /
           intent_walk / catcher_interf and bunted balls in play

BB on the scored definition excludes intentional walks (A counts BB + IBB, as the target does). 2026 is never read.

    python -m hitter_data.pa_targets          # -> pa_targets_v13.json (repo root; calib.PA_TARGETS reads it)
"""
import json
import os
import sqlite3
from collections import defaultdict

from . import DATA, assert_not_heldout
from .harness_adapters import ROOT

OUT = os.path.join(ROOT, "pa_targets_v13.json")
RV_KEY = {"mlb": "mlb_check", "college_d1": "college_d1", "college_d2": "college_d2", "college_d3": "college_d3", "hs": "hs"}
STATS = ("K", "BB", "HBP")
MLB_SEASONS = (2021, 2022, 2023, 2024, 2025)
MLB_HALF_LIFE = 2.0


def college(chain_check_path=None):
    """{level: (rates_all, rates_scored, source)} from chain_check.json (A_all_PAs, B_scored_PAs)"""
    p = chain_check_path or os.path.join(DATA, "fits", "count_layer", "chain_check.json")
    lv = {"D1": "college_d1", "D2": "college_d2", "D3": "college_d3"}
    out = {}
    for r in json.load(open(p, encoding="utf-8")):
        out[lv[r["level"]]] = (r["A_all_PAs"], r["B_scored_PAs"],
                               f"chain_check A -> B ({r['candidate']}, weighted={r['weighted']}, B/A PA share {r['shares']['B_of_A']:.4f})")
    return out


def hs():
    from . import harness as H
    j = json.load(open(os.path.join(DATA, "fits", "count_layer", "hs_sep_thru2025.json"), encoding="utf-8"))
    con = sqlite3.connect(f"file:{os.path.join(DATA, 'hs', 'hs.sqlite3')}?mode=ro", uri=True)
    acc = {x: defaultdict(float) for x in "AB"}
    for s, w in j["fit_seasons"].items():
        s = assert_not_heldout(int(s))
        q = """SELECT p.result, p.in_play, p.bip_type FROM hs_pa p JOIN hs_games g USING(game_id) JOIN hs_game_qc c USING(game_id)
               WHERE g.season = ? AND c.full_log = 1 AND g.parsed IS NOT NULL AND p.result IS NOT NULL"""
        for res, ip, bt in con.execute(q, (s,)):
            kk, bb, hp = res.startswith("K"), res in ("BB", "IBB"), res == "HBP"
            a = acc["A"]
            a["PA"] += w; a["K"] += w * kk; a["BB"] += w * bb; a["HBP"] += w * hp
            if bt == "bunt" or res in H.BUNT_RESULTS or H.pa_class(res, bool(ip)) < 0:
                continue
            b = acc["B"]
            b["PA"] += w; b["K"] += w * kk; b["BB"] += w * bb; b["HBP"] += w * hp
    r = lambda d: {k: d[k] / d["PA"] for k in STATS}
    return r(acc["A"]), r(acc["B"]), (f"hs.sqlite3 full-log games {sorted(j['fit_seasons'])} (hs_sep fit weights), "
                                      f"B/A PA share {acc['B']['PA'] / acc['A']['PA']:.4f}")


def mlb():
    import pandas as pd
    acc = {x: defaultdict(float) for x in "AB"}
    drop = {"sac_bunt", "sac_bunt_double_play", "intent_walk", "catcher_interf"}
    for s in MLB_SEASONS:
        s = assert_not_heldout(s)
        w = 0.5 ** ((2025 - s) / MLB_HALF_LIFE)
        d = pd.read_parquet(os.path.join(DATA, "refit", "cache", f"MLB_{s}.parquet"),
                            columns=["events", "des", "description", "game_type"])
        d = d[(d.game_type.fillna("R") == "R") & d.events.notna() & (d.events.astype(str) != "truncated_pa")]
        ev = d.events.astype(str)
        bunt = d.des.astype(str).str.contains("bunt", case=False, na=False) & d.description.astype(str).str.startswith("hit_into_play")
        k = ev.isin(["strikeout", "strikeout_double_play"])
        bb_all, bb = ev.isin(["walk", "intent_walk"]), ev.eq("walk")
        hp = ev.eq("hit_by_pitch")
        keep = ~ev.isin(drop) & ~bunt
        a, b = acc["A"], acc["B"]
        a["PA"] += w * len(d); a["K"] += w * k.sum(); a["BB"] += w * bb_all.sum(); a["HBP"] += w * hp.sum()
        b["PA"] += w * keep.sum(); b["K"] += w * (k & keep).sum(); b["BB"] += w * (bb & keep).sum(); b["HBP"] += w * (hp & keep).sum()
        del d
    r = lambda d: {k_: float(d[k_] / d["PA"]) for k_ in STATS}
    return r(acc["A"]), r(acc["B"]), (f"Statcast MLB regular season {MLB_SEASONS[0]}-{MLB_SEASONS[-1]} (half-life "
                                      f"{MLB_HALF_LIFE:g}), B/A PA share {acc['B']['PA'] / acc['A']['PA']:.4f}")


def build():
    rv = json.load(open(os.path.join(ROOT, "college_run_values.json"), encoding="utf-8"))
    src = college()
    src["hs"] = hs()
    src["mlb"] = mlb()
    out = {"about": ("v1.3 K / BB / HBP targets on the count chain's PA definition (Drew's Nov 24 ruling 12): "
                     "target_all x rate_scored / rate_all, the ratio from each level's own play-by-play "
                     "(hitter_data/pa_targets.py). Scored PAs drop sacrifices / bunt PAs, intentional walks and interference, "
                     "exactly as the harness and the count layer do. target_all = college_run_values.json."),
           "levels": {}}
    for lv in ("mlb", "college_d1", "college_d2", "college_d3", "hs"):
        A, B, s = src[lv]
        ta = {k: rv[RV_KEY[lv]][k] for k in STATS}
        out["levels"][lv] = {"K": ta["K"] * B["K"] / A["K"], "BB": ta["BB"] * B["BB"] / A["BB"],
                             "HBP": ta["HBP"] * B["HBP"] / A["HBP"],
                             "target_all": ta, "ratio": {k: B[k] / A[k] for k in STATS}, "source": s}
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    for lv, L in out["levels"].items():
        print(f"{lv:11s} " + "  ".join(f"{k} {100 * L['target_all'][k]:.2f} -> {100 * L[k]:.2f} (x{L['ratio'][k]:.4f})" for k in STATS))
    return out


if __name__ == "__main__":
    build()
