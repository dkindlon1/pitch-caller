"""v1.2 Step 6 (Drew, Nov 13: option C for row L6): fit the side-to-side miss ratio GEO_RX (sigma_x = GEO_RX x sigma, sigma_z
= sigma, the size still solved from landing()'s waste-band share) so the model's MLB same-side fastballs cross the inside
third about as often as MLB's do: four-seam 28%, sinker 48% (results/v12/proxies_mlb_*). The call mix at lean 0 doesn't
depend on GEO_RX (landing is unchanged at lean 0), so the calls are solved once and only the crossing chance is recomputed.
One parameter, two targets: least squares. Same arsenals and counts as research_v12/step2_crossing.py.
usage (repo root): python3 research_v12/fit_geo_rx.py  -> results/v12/fit_geo_rx.txt"""
import os, random, sys
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:0] = [HERE, os.path.join(HERE, "readthrough")]
import engine as e
from grid_v10 import ARSENALS
from scenarios import p_cross_inside

COUNTS = [(0, 0), (1, 0), (0, 1), (1, 1), (2, 1), (0, 2), (1, 2), (2, 2)]
REAL = {"FB": 0.28, "SI": 0.48}
OUT = []


def say(x):
    print(x, flush=True)
    OUT.append(x)


def calls(level):
    rows = []      # (prob, pitch, target, situation)
    for an in ("sink_sweep", "deadzone", "AVG3"):
        ars = ARSENALS[an]
        for b, k in COUNTS:
            s = e.Situation(b, k, 1, (False, False, False), inning=3, level=level, same_side=True)
            _, dist, _, _ = e.call_v08(ars, s, rng=random.Random(0))
            rows += [(pr, p, q, s) for pr, _, p, q in dist if p.kind in REAL]
    return rows


def crossing(rows):
    out = {}
    for k in REAL:
        t = sum(pr for pr, p, q, s in rows if p.kind == k)
        out[k] = sum(pr * p_cross_inside(p, q, s) for pr, p, q, s in rows if p.kind == k) / t
    return out


def main():
    rows = {lv: calls(lv) for lv in ("mlb", "college_d3", "hs")}
    best = None
    say("GEO_RX   MLB four-seam  MLB sinker   (real 28% / 48%)   D3 four-seam / sinker   HS four-seam / sinker")
    for i in range(40, 101, 5):
        rx = i / 100
        e.GEO_RX = rx
        m, d3, hs = crossing(rows["mlb"]), crossing(rows["college_d3"]), crossing(rows["hs"])
        err = sum((m[k] - REAL[k]) ** 2 for k in REAL)
        say(f"  {rx:.2f}     {m['FB']:6.1%}       {m['SI']:6.1%}     err {err:.4f}        {d3['FB']:6.1%} / {d3['SI']:6.1%}       {hs['FB']:6.1%} / {hs['SI']:6.1%}")
        if best is None or err < best[1]:
            best = (rx, err)
    lo = max(0.40, best[0] - 0.05)
    for i in range(int(lo * 100), int(min(1.0, best[0] + 0.05) * 100) + 1):
        rx = i / 100
        e.GEO_RX = rx
        m = crossing(rows["mlb"])
        err = sum((m[k] - REAL[k]) ** 2 for k in REAL)
        if err < best[1]:
            best = (rx, err)
    e.GEO_RX = best[0]
    m = crossing(rows["mlb"])
    say(f"best GEO_RX {best[0]:.2f}: MLB four-seam {m['FB']:.1%}, sinker {m['SI']:.1%} (real 28% / 48%)")
    open(os.path.join(HERE, "results", "v12", "fit_geo_rx.txt"), "w").write("\n".join(OUT) + "\n")


if __name__ == "__main__":
    main()
