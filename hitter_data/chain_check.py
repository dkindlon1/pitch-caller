"""v1.3 (Drew's Nov 23 ruling 10): does the chained count layer reproduce its own data's K / BB / HBP?

For a college count candidate (default: the weighted ship candidates the core uses), over exactly its fit seasons and
recency weights (j["fit_seasons"]) and the full-game weights (fullgame_weights; 1 when the candidate is unweighted), K / BB /
HBP per PA step by step from the target population to the fitted chain:

  A  every PA of the full games (K = result K*, BB = BB / IBB, HBP)         -> = all games after weighting, by construction
  B  the harness's scored PAs (bunts and EXCLUDED_RESULTS dropped)
  C  B with usable pitch letters (harness.pitch_events not None): the PAs whose pitches the count layer is fit on
  D  the count chain (two-strike fouls loop) on C's raw pitch events by count
  E  the count chain on the candidate's fitted per-count p6 (what kgap_diag row 0 chains)

A -> B and B -> C are population steps (who is in the pitch data); C -> D is the chain itself (a PA-level outcome vs its
replayed pitch events: should be ~0); D -> E is the fit (shrinkage / borrowing / pooling, and for "shared" the pooled
pattern raked to the level's 6-way margin). A gap in C -> D or D -> E is the "chaining bug" ruling 10 asks for.

    python -m hitter_data.chain_check [--candidates D1_shared_w_thru2025.json,...]
"""
import argparse
import json
import os
from collections import defaultdict

import numpy as np

from . import DATA, assert_not_heldout
from . import fit_count_data as FD
from . import fullgame_weights as FW
from . import harness as H
from .harness_adapters import COUNTS, CI

DEFAULT = ("D1_shared_w_thru2025.json", "D2_borrow_w_thru2025.json", "D3_borrow_w_thru2025.json")
CIDX = {i: c for c, i in CI.items()}


def chain(p6):
    """p6 [12 counts in COUNTS order, 6] -> dict(K, BB, HBP) per PA"""
    P = {COUNTS[i]: p6[i] for i in range(12)}
    reach = defaultdict(float)
    reach[(0, 0)] = 1.0
    o = dict(K=0.0, BB=0.0, HBP=0.0)
    for c in sorted(COUNTS, key=lambda c: c[0] + c[1]):
        r = reach[c]
        if r <= 0:
            continue
        b, k = c
        ball, hbp, cs, wh, fo, ip = P[c] / P[c].sum()
        v = r / (1 - (fo if k == 2 else 0.0))
        o["HBP"] += v * hbp
        if b == 3:
            o["BB"] += v * ball
        else:
            reach[(b + 1, k)] += v * ball
        if k == 2:
            o["K"] += v * (cs + wh)
        else:
            reach[(b, k + 1)] += v * (cs + wh + fo)
    return o


def rates(acc):
    return {k: acc[k] / acc["PA"] for k in ("K", "BB", "HBP")}


def check(con, cand):
    j = json.load(open(os.path.join(FD.FITS, "count_layer", cand), encoding="utf-8"))
    level = j["level"]
    weighted = bool(j.get("weighted"))
    acc = {x: defaultdict(float) for x in "ABC"}
    ev = np.zeros((12, 6))
    for s, rw in j["fit_seasons"].items():
        s = int(s)
        assert_not_heldout(s)
        wmap = FW.load(level, s) if weighted else None
        games = H.games_for(con, level, s)
        ids = [g["id"] for g in games]
        for d in (dict(zip(H.PA_COLS, r)) for r in H.load_pas(con, ids)):
            w = rw * ((wmap or {}).get(d["game_id"], 1.0) if weighted else 1.0)
            res, ip = d["result"], bool(d["in_play"])
            kk, bb, hp = bool(res) and res.startswith("K"), res in ("BB", "IBB"), res == "HBP"
            a = acc["A"]
            a["PA"] += w; a["K"] += w * kk; a["BB"] += w * bb; a["HBP"] += w * hp
            bunt = d["bip_type"] == "bunt" or res in H.BUNT_RESULTS
            if bunt or H.pa_class(res, ip) < 0:
                continue
            b_ = acc["B"]
            b_["PA"] += w; b_["K"] += w * kk; b_["BB"] += w * bb; b_["HBP"] += w * hp
            e, _ = H.pitch_events(d["pitches"], d["balls"], d["strikes"], res, ip, d["count_ok"])
            if e is None:
                continue
            c_ = acc["C"]
            c_["PA"] += w; c_["K"] += w * kk; c_["BB"] += w * bb; c_["HBP"] += w * hp
            for ci, y in e:
                ev[ci, y] += w
    p6_raw = np.array([ev[CI[c]] for c in COUNTS])
    p6_fit = np.array([j["count"][f"{b}-{k}"]["p6"] for b, k in COUNTS])
    out = dict(candidate=cand, level=level, weighted=weighted, fit_seasons=j["fit_seasons"],
               A_all_PAs=rates(acc["A"]), B_scored_PAs=rates(acc["B"]), C_lettered_PAs=rates(acc["C"]),
               D_chain_raw_events=chain(p6_raw), E_chain_fitted=chain(p6_fit),
               shares=dict(B_of_A=acc["B"]["PA"] / acc["A"]["PA"], C_of_B=acc["C"]["PA"] / acc["B"]["PA"]))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", default=",".join(DEFAULT))
    a = ap.parse_args(argv)
    con = H.connect()
    res = [check(con, c) for c in a.candidates.split(",")]
    for r in res:
        f = lambda d: " ".join(f"{k} {v * 100:.2f}" for k, v in d.items())
        print(f"{r['candidate']}: A {f(r['A_all_PAs'])} | B {f(r['B_scored_PAs'])} | C {f(r['C_lettered_PAs'])} | "
              f"D {f(r['D_chain_raw_events'])} | E {f(r['E_chain_fitted'])} | B/A {r['shares']['B_of_A']:.3f} C/B {r['shares']['C_of_B']:.3f}")
    out = os.path.join(FD.FITS, "count_layer", "chain_check" + ("" if a.candidates == ",".join(DEFAULT) else "_custom") + ".json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=1)
    print("wrote", out)


if __name__ == "__main__":
    main()
