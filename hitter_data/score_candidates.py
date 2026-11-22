"""Score the v1.3 count-layer candidates on the 2025 validation season with the prework harness (buildout Part 3.5).
PROVISIONAL: numbers will move as data lands. 2025 is the validation season; 2026 (the held-out test) is never loaded.

Per level (D1; D2 and D3 THIN): the harness's v1.2 (raw), v1.2_recal (the pass reference = per-count frequencies),
base_count, base_count_bo, and the candidates written by `python -m hitter_data.fit_count` (fit <= 2024; each
candidate's fit_seasons guard makes the harness refuse an in-sample score). B = 1000 bootstrap resamples, SE = the largest
of the game / home-team / two-team SEs (docs/HARNESS_v13.md section 7).

Also:
  - the level-split check (plan 3.1): "sep" vs "shared" (+ level offset); keep separate only if better by > 2 SE;
  - the platoon check: pitch_5way on the known-hand pitches only, "borrow" vs "borrow_noplatoon".

Note: the candidates' hyper-parameters were chosen on this same 2025 season (by design: 2025 is the tuning /
validation season). Their 2025 scores are therefore slightly optimistic; only the 2026 test, run once, is clean.

usage:
  python -m hitter_data.score_candidates                     # all levels, B = 1000
  python -m hitter_data.score_candidates --levels D1 --boot 200"""
import argparse
import json
import os
import time

import numpy as np

from . import assert_not_heldout, fit_seasons
from . import fit_count as FC
from . import fit_count_data as FD
from . import harness as H
from .harness_adapters import Adapter, EmpiricalAdapter, EngineV12Adapter, RecalAdapter

VARIANTS = ("sep", "borrow", "shared", "borrow_noplatoon")
OUT = os.path.join(FD.FITS, "score_2025")


class CandidateAdapter(Adapter):
    """A count-layer candidate JSON (fit_count output) as a harness adapter. data_level must match the file's level."""

    def __init__(self, path):
        with open(path, encoding="utf-8") as f:
            self.j = json.load(f)
        self.name = "v13_" + self.j["variant"]
        self.fit_seasons = tuple(fit_seasons([int(s) for s in self.j["fit_seasons"]]))
        self._t = None

    def tables(self, data_level):
        if data_level.lower() != self.j["level"].lower():
            raise ValueError(f"{self.name} is a {self.j['level']} table, asked for {data_level}")
        if self._t is None:
            self._t = FC.tables_from_json(self.j)
            self._t.name = self.name
        return self._t


def known_side_view(S):
    """A shallow copy of a harness Season keeping only pitches with both hands known (side 0 / 1)."""
    T = H.Season()
    T.__dict__.update(S.__dict__)
    m = S.pit["sd"] < 2
    T.pit = {k: v[m] for k, v in S.pit.items()}
    T.pa = {}
    return T


def score_level(con, level, season=FC.VALID, B=1000, seed=1, log=print, cand_dir=None):
    assert_not_heldout(season)
    S = H.build_season(con, level, season)
    pre = {s: H.prequalify(con, level, s) for s in range(1990, season)}
    with_games = [s for s, q in pre.items() if q["full_games"] > 0]
    fs = H.fit_seasons_for(con, level, season, with_games)
    fc = H.FitCounts()
    for s in fs:
        fc.add_scaled(H.FitCounts.from_season(H.build_season(con, level, s)), H.recency_weight(s, season))
    fit = {level: fc}
    v12 = EngineV12Adapter("college_d1" if level != "D3" else "college_d3")
    adapters = [v12, RecalAdapter(v12, fit, fs)]
    refs = [v12.name + "_recal"]
    if level == "D2":
        v3 = EngineV12Adapter("college_d3")
        adapters += [v3, RecalAdapter(v3, fit, fs)]
        refs.append(v3.name + "_recal")
    adapters += [EmpiricalAdapter(k, fit, fs) for k in ("count", "count_bo")]
    cands = {}
    for var in VARIANTS:
        p = FC.out_path(level, var, season - 1) if cand_dir is None else os.path.join(cand_dir, f"{level}_{var}_thru{season - 1}.json")
        if os.path.exists(p):
            cands[var] = CandidateAdapter(p)
    adapters += list(cands.values())
    refs += ["base_count"] + (["v13_shared"] if "shared" in cands else [])
    res = H.score_season(S, adapters, refs, B=B, seed=seed)
    known = None
    if (S.pit["sd"] < 2).sum() > 0 and "borrow" in cands:
        Sk = known_side_view(S)
        ka = [a for a in adapters if a.name in ("base_count", "v13_borrow", "v13_borrow_noplatoon")]
        known = H.score_season(Sk, ka, ["v13_borrow_noplatoon"] if "borrow_noplatoon" in cands else ["base_count"], B=B, seed=seed)
        known = {"pitch_5way": known["pitch_5way"], "n_known": int((S.pit["sd"] < 2).sum()), "n_all": int(len(S.pit["sd"]))}
    log(H.fmt_report(level, season, S, {k: v for k, v in res.items() if k in ("pitch_5way", "bip_result", "bip_type_outs",
                                                                               "pa_5way", "runs_pitch_state_sq")}, refs))
    return dict(level=level, season=season, thin=level in FC.THIN, n_games=S.n_games, n_teams=S.n_teams,
                n_pitches=int(len(S.pit.get("y", []))), fit_seasons=fs, refs=refs, scores=res, known_side=known,
                candidate_fit_seasons={k: list(a.fit_seasons) for k, a in cands.items()})


def se(d):
    return max(d[1].values())


def summarise(r):
    """Pass-style rows on pitch_5way: candidate - reference (SE) and the level-split rule."""
    pm = r["scores"]["pitch_5way"]
    out = {"means": {k: (v[0], se(v)) for k, v in pm["adapters"].items()}, "diffs": {}, "level_split": None}
    for ref, dd in pm["diff"].items():
        for nm, v in dd.items():
            out["diffs"][f"{nm} - {ref}"] = (v[0], se(v))
    d = pm["diff"].get("v13_shared", {}).get("v13_sep")
    if d:
        keep_sep = d[0] < -2 * se(d)
        out["level_split"] = dict(sep_minus_shared=d[0], se=se(d), keep_separate=bool(keep_sep),
                                  rule="keep separate only if sep - shared < -2 SE; else ship shared + offset")
    return out


def write_md(results, path):
    L = ["# Count-layer candidates scored on 2025 (PROVISIONAL)", "", FD.PROVISIONAL, "",
         "2025 is the validation season (the candidates' hyper-parameters were tuned on it, so their scores are slightly "
         "optimistic). **2026 was not loaded.** pitch_5way log loss per pitch, mean (SE = max of game / home / two-team).", ""]
    for r in results:
        s = summarise(r)
        L.append(f"## {r['level']}{' (THIN)' if r['thin'] else ''}: {r['n_games']} full games, {r['n_pitches']:,} pitches, "
                 f"reference fit seasons {r['fit_seasons']}")
        L.append("")
        L.append("| version | pitch_5way | bip_result | bip_type_outs | pa_5way |")
        L.append("|---|---|---|---|---|")
        sc = r["scores"]
        for nm, (m, e) in s["means"].items():
            L.append(f"| {nm} | {m:.4f} ({e:.4f}) | " + " | ".join(
                f"{sc[k]['adapters'][nm][0]:.4f}" for k in ("bip_result", "bip_type_outs", "pa_5way")) + " |")
        L.append("")
        L.append("| difference (pitch_5way) | mean | SE | z |")
        L.append("|---|---|---|---|")
        for k, (m, e) in s["diffs"].items():
            if k.startswith("v13_"):
                L.append(f"| {k} | {m:+.5f} | {e:.5f} | {m / e if e else float('nan'):+.1f} |")
        if s["level_split"]:
            ls = s["level_split"]
            L.append(f"\nLevel split: sep - shared = {ls['sep_minus_shared']:+.5f} (SE {ls['se']:.5f}) -> "
                     f"{'keep separate' if ls['keep_separate'] else 'ship shared + level offset'}.")
        if r["known_side"]:
            k = r["known_side"]
            pk = k["pitch_5way"]
            L.append(f"\nPlatoon (known-hand pitches only, {k['n_known']:,} of {k['n_all']:,} = {k['n_known'] / k['n_all']:.1%}): " +
                     ", ".join(f"{nm} {v[0]:.4f}" for nm, v in pk["adapters"].items()) +
                     "; " + ", ".join(f"{nm} - {ref} {v[0]:+.5f} (SE {se(v):.5f})" for ref, dd in pk["diff"].items() for nm, v in dd.items()))
        L.append("")
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write("\n".join(L) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--levels", default="D1,D2,D3")
    ap.add_argument("--season", type=int, default=FC.VALID)
    ap.add_argument("--boot", type=int, default=1000)
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args(argv)
    assert_not_heldout(a.season)
    t0 = time.time()
    con = H.connect()
    results = [score_level(con, lv, a.season, a.boot) for lv in a.levels.split(",")]
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "scores.json"), "w", encoding="utf-8") as f:
        json.dump({"provisional": FD.PROVISIONAL, "heldout_touched": False, "results": results,
                   "summary": {r["level"]: summarise(r) for r in results}}, f, indent=1,
                  default=lambda o: o.item() if isinstance(o, np.generic) else str(o))
    write_md(results, os.path.join(a.out, "scores.md"))
    print(f"\nwrote {a.out}/scores.json, scores.md ({time.time() - t0:.0f} s). 2026 was not loaded.")


if __name__ == "__main__":
    main()
