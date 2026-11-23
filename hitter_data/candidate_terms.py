"""v1.3 full data, Task D: every candidate term beyond the count layer, its 2025 gain with SE, whether it clears 2 SE
(ruling 1: no 0.002 floor), and whether it is wired (a term that isn't wired moves no call, so it touches no graded row).

Sources (all fit <= 2024, scored on 2025, paired, SE = the largest clustered bootstrap SE):
  - times through the order (smooth curve), scoring position, late and close, previous pitch (in-at-bat): every level,
    fits/situation_effects.json (hitter_data.fit_situation; college pitcher tracking from the "X to p for Y" lines).
  - platoon (known-hand pitches): college fits/score_2025/scores.json (v13_borrow - v13_borrow_noplatoon), HS
    fits/hs/hs_summary.json (v13_sep - v13_sep_noplatoon via fit_count_hs scores).
  - HS event format: fit_count_hs stack "format (hs_vs_travel+age+phase+series)".
  - HS velocity vs his own norm (today's fastball vs his season average; NEW, this module): alone on the HS count table and
    on top of the ruling-4 pitch kind x velocity stack (the incremental gain is the one that would ship).
  - base-out (wired): the core vs the core with swing_base_out zeroed (hitter_data.score_core, config core_nobo).

    python -m hitter_data.candidate_terms     # writes fits/candidate_terms.json and .md
"""
import json, os, time

import numpy as np

from . import fit_seasons
from . import fit_count as FC
from . import fit_count_data as FD
from . import fit_count_hs as HS

OUT_JSON = os.path.join(FD.FITS, "candidate_terms.json")
OUT_MD = os.path.join(FD.FITS, "candidate_terms.md")


def hs_velo_day(B=1000, log=print):
    fit_seasons(HS.SEASONS)
    con = HS.connect()
    Ss = {s: HS.load_season(con, s) for s in HS.SEASONS}
    fit_S = [Ss[s] for s in HS.SEASONS if s < HS.VALID]
    S25 = Ss[HS.VALID]
    with open(FC.out_path(HS.LEVEL, "sep", HS.VALID - 1), encoding="utf-8") as fh:
        t = FC.tables_from_json(json.load(fh))
    Ws = HS.H.boot_weights(S25, B, 1)
    y = S25.pit["y"]
    Pf = [HS.base_p6(t, S) for S in fit_S]
    Pv = HS.base_p6(t, S25)
    lb = HS.loss5(Pv, y)
    cov = float(np.mean(~np.isnan(S25.pit["vday"])))
    r = HS.fit_term(Pf, fit_S, "velo_day")
    m, se = HS.paired(S25, HS.loss5(HS.apply_term(Pv, S25, "velo_day", r), y), lb, Ws)
    alone = dict(gain=-m, se=se)
    for term in HS.PV_TERMS:                                  # the shipped ruling-4 stack first
        rr = HS.fit_term(Pf, fit_S, term)
        Pf = [HS.apply_term(P, S, term, rr) for P, S in zip(Pf, fit_S)]
        Pv = HS.apply_term(Pv, S25, term, rr)
    lpv = HS.loss5(Pv, y)
    r = HS.fit_term(Pf, fit_S, "velo_day")
    m, se = HS.paired(S25, HS.loss5(HS.apply_term(Pv, S25, "velo_day", r), y), lpv, Ws)
    on_pv = dict(gain=-m, se=se)
    eff = HS.effects(t, [Ss[s] for s in HS.SEASONS], "velo_day")
    labels = ["< -3 mph", "-3..-1", "-1..+1", "+1..+3", "> +3"]
    log(f"  HS velo_day: coverage {cov:.3f} of 2025 pitches; alone {alone['gain']:+.5f} ({alone['se']:.5f}); "
        f"on top of the pitch kind x velocity stack {on_pv['gain']:+.5f} ({on_pv['se']:.5f})")
    return dict(coverage_2025=cov, alone=alone, on_pitch_stack=on_pv,
                effects={labels[int(k)]: v for k, v in eff.items()})


def clears(g, se):
    return bool(g > 2 * se)


def main():
    t0 = time.time()
    rows = []
    sit = json.load(open(os.path.join(FD.FITS, "situation_effects.json"), encoding="utf-8"))["levels"]
    names = {"tto": "times through the order (smooth)", "risp": "scoring position", "late_close": "late and close",
             "prev": "in-at-bat (previous pitch)"}
    for lv in ("D1", "D2", "D3", "hs"):
        eff = sit.get(lv, {}).get("pitch", {}).get("effects", {})
        for k, nm in names.items():
            v = eff.get(k, {}).get("gain_alone")
            if not v:
                continue
            g, se = v["gain"], v["se_max"]
            rows.append(dict(level="HS" if lv == "hs" else lv, term=nm, gain=g, se=se, clears=clears(g, se),
                             wired=False, source="situation_effects.json"))

    def platoon(res, with_, without):
        d = res["known_side"]["pitch_5way"]["diff"][without][with_]
        return -d[0], max(d[1].values())
    for res in json.load(open(os.path.join(FD.FITS, "score_2025", "scores.json"), encoding="utf-8"))["results"]:
        g, se = platoon(res, "v13_borrow", "v13_borrow_noplatoon")
        rows.append(dict(level=res["level"], term="platoon (known-hand pitches)", gain=g, se=se, clears=clears(g, se),
                         wired=False, source="score_2025"))
    hs = json.load(open(os.path.join(FD.FITS, "hs", "hs_summary.json"), encoding="utf-8"))
    try:
        g, se = platoon(hs["scores"], "v13_sep", "v13_sep_noplatoon")
        rows.append(dict(level="HS", term="platoon (known-hand pitches)", gain=g, se=se, clears=clears(g, se),
                         wired=False, source="fit_count_hs"))
    except KeyError:
        pass
    st = hs["terms"]["stacks"]["format (hs_vs_travel+age+phase+series)"]
    rows.append(dict(level="HS", term="event format (hs vs travel, age, phase, series)", gain=st["gain"], se=st["se"],
                     clears=clears(st["gain"], st["se"]), wired=False, source="fit_count_hs"))
    vd = hs_velo_day()
    rows.append(dict(level="HS", term="velocity vs his own norm, alone", gain=vd["alone"]["gain"], se=vd["alone"]["se"],
                     clears=clears(vd["alone"]["gain"], vd["alone"]["se"]), wired=False, source="candidate_terms"))
    rows.append(dict(level="HS", term="velocity vs his own norm, on top of the pitch kind x velocity table",
                     gain=vd["on_pitch_stack"]["gain"], se=vd["on_pitch_stack"]["se"],
                     clears=clears(vd["on_pitch_stack"]["gain"], vd["on_pitch_stack"]["se"]), wired=False,
                     source="candidate_terms"))
    out = dict(rows=rows, hs_velo_day=vd, seconds=round(time.time() - t0, 1), heldout_touched=False)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, default=float)
    L = ["| Level | Term | 2025 gain (nats / pitch) | SE | > 2 SE | wired |", "|---|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['level']} | {r['term']} | {r['gain']:+.5f} | {r['se']:.5f} | {'yes' if r['clears'] else 'no'} | "
                 f"{'yes' if r['wired'] else 'no'} |")
    with open(OUT_MD, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
