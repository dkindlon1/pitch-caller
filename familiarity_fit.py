"""v1.1 Step 2d: familiarity per pitch with carry-over by shape (docs/PLAN_v1.1_2026-11-12.md, Step 2, item 2d; built
because 2a shipped). Same data and hygiene as profile_terms_fit.py: 2024 train, 2025 held out, pitcher and batter
random intercepts, ship on held-out gain > 2 game-clustered bootstrap SDs.

  python3 familiarity_fit.py   -> results/v11/step2d_report.txt, results/v11/step2d_fit.json

Target: hard (EV >= 95) | ball in play, as v1.0's familiarity term (seq_fit.py item 4: phi_FB 0.058, phi_OS 0.116 per
pitch of that class the hitter saw from this pitcher in earlier plate appearances today, capped at 0.5).
  base  controls (profile_terms_fit.features, times-through kept) + class dummies + v1.0's class counts (capped as v1.0)
  D     + per-pitch familiarity: f = sum over the pitch types he saw earlier today of n_type x exp(-d / delta), d the
          shape distance between that type and this pitch (speed / 2 mph, IVB / 4 in., HB / 4 in.; same type d = 0),
          split by class and capped like v1.0. delta is chosen on the training year only (grid 0.5, 1, 2, 4); 0 = the
          same pitch type only.
Starter games: pitchers who faced 18+ batters in the game (v0.8's "long" sample), plus all games as a second sample.
"""
import json, math, os, sys
from collections import defaultdict
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import seq_fit as SF
import profile_terms_fit as PT

OUT = os.path.join(HERE, "results", "v11")
lines = []
CAP = {"FB": 0.5 / 0.058, "OS": 0.5 / 0.116}


def say(*a):
    t = " ".join(str(x) for x in a)
    print(t, flush=True)
    lines.append(t)


def familiarity(d, deltas):
    """per pitch: v1.0's class counts and, for each delta, the carry-over familiarity, from earlier PAs today"""
    shape = d.groupby(["game_pk", "pitcher", "pitch_type"]).agg(m=("mph", "mean"), i=("ivb", "mean"), h=("hb", "mean"))
    shp = {k: (r.m, r.i, r.h) for k, r in shape.iterrows()}
    g, p, b, ab, pt = d.game_pk.values, d.pitcher.values, d.batter.values, d.at_bat_number.values, d.pitch_type.values
    cls = np.where(d.cls.values == "FB", "FB", "OS")
    n = len(d)
    nc = np.zeros(n)
    fam = {dl: np.zeros(n) for dl in deltas}
    seen = defaultdict(lambda: defaultdict(int))        # (g, p, b) -> pitch type -> n, earlier PAs only
    pend, cur = [], None
    for i in range(n):
        key = (g[i], p[i], b[i])
        pa = (g[i], ab[i])
        if pa != cur:
            for (k_, t_) in pend:
                seen[k_][t_] += 1
            pend, cur = [], pa
        s = seen.get(key)
        if s:
            ci = cls[i]
            nc[i] = sum(v for t, v in s.items() if (("FB" if t in ("FF", "SI", "FC") else "OS") == ci))
            me = shp[(g[i], p[i], pt[i])]
            for t, v in s.items():
                o = shp[(g[i], p[i], t)]
                dist = math.sqrt(((me[0] - o[0]) / 2) ** 2 + ((me[1] - o[1]) / 4) ** 2 + ((me[2] - o[2]) / 4) ** 2)
                for dl in deltas:
                    fam[dl][i] += v * (1.0 if t == pt[i] else (math.exp(-dist / dl) if dl > 0 else 0.0))
        pend.append((key, pt[i]))
    return nc, fam, cls


def main():
    d = PT.load()
    Xc, xs, zn = PT.features(d)
    yr = d.game_year.values
    pits = {q: j for j, q in enumerate(sorted(set(d.pitcher[yr == 2024])))}
    bats = {q: j for j, q in enumerate(sorted(set(d.batter[yr == 2024])))}
    pid = np.array([pits.get(q, len(pits)) for q in d.pitcher])
    bid = np.array([bats.get(q, len(bats)) for q in d.batter])
    gid = pd.factorize(d.game_pk)[0]
    ls = pd.to_numeric(d.launch_speed, errors="coerce").values.astype(float)
    bipv = (d.description.values == "hit_into_play") & ~np.isnan(ls)
    hard = (np.nan_to_num(ls) >= 95).astype(float)
    deltas = (0.0, 0.5, 1.0, 2.0, 4.0)
    nc, fam, cls = familiarity(d, deltas)
    isfb = (cls == "FB").astype(float)
    base_f = np.column_stack([np.minimum(nc, CAP["FB"]) * isfb, np.minimum(nc, CAP["OS"]) * (1 - isfb)])
    Dcls = np.column_stack([(d.cls.values == c).astype(float) for c in ("SL", "CB", "CH")])
    bf = d.groupby(["game_pk", "pitcher"]).at_bat_number.transform("nunique").values      # batters faced = plate appearances
    res = {}
    say(f"v1.1 Step 2d familiarity: {len(d):,} pitches; balls in play with EV: 2024 {int((bipv & (yr == 2024)).sum()):,}, "
        f"2025 {int((bipv & (yr == 2025)).sum()):,}")
    for sample, smask in (("starts (18+ batters)", bf >= 18), ("all games", np.ones(len(d), bool))):
        mask = bipv & smask
        tr, te = mask & (yr == 2024), mask & (yr == 2025)
        Xb = np.hstack([Xc, Dcls, base_f])
        F = SF.Fit(Xb[tr], hard[tr], pid[tr], bid[tr], gid[tr], len(pits) + 1, len(bats) + 1)
        m0 = F.run()
        p0 = SF.Fit.predict(m0, Xb[te], pid[te], bid[te])
        say(f"\n{sample}: train {int(tr.sum()):,}, held out {int(te.sum()):,}; v1.0 class-count coefficients in the base: "
            f"FB {m0['b_raw'][-2]:+.4f} (se {m0['se_raw'][-2]:.4f}), OS {m0['b_raw'][-1]:+.4f} (se {m0['se_raw'][-1]:.4f}) "
            f"[v1.0 engine: +0.058, +0.116]")
        best = None
        fits = {}
        for dl in deltas:
            f = fam[dl]
            ex = np.column_stack([np.minimum(f, CAP["FB"]) * isfb, np.minimum(f, CAP["OS"]) * (1 - isfb)])
            m1 = F.run(ex[tr])
            fits[dl] = (m1, ex)
            say(f"  delta {dl:>3}: train log-lik {m1['ll']:.1f} (base {m0['ll']:.1f}); per-pitch FB {m1['b_raw'][-2]:+.4f}, "
                f"OS {m1['b_raw'][-1]:+.4f}")
            if best is None or m1["ll"] > fits[best][0]["ll"]:
                best = dl
        m1, ex = fits[best]
        p1 = SF.Fit.predict(m1, Xb[te], pid[te], bid[te], ex[te])
        gain, sd = SF.boot_gain(hard[te], p0, p1, gid[te])
        ship = bool(gain > 2 * sd)
        res[sample] = dict(delta=best, gain=float(gain), sd=float(sd), ship=ship, beta=m1["b_raw"][-2:].tolist(),
                           se=m1["se_raw"][-2:].tolist(), base_beta=m0["b_raw"][-2:].tolist(), base_se=m0["se_raw"][-2:].tolist(),
                           base_with_D=m1["b_raw"][-4:-2].tolist())
        say(f"  -> delta {best} (chosen on 2024): held-out gain {gain:.2e} ({gain / sd:.1f} SD) -> {'SHIP' if ship else 'no ship'}; "
            f"with it, the class counts are FB {m1['b_raw'][-4]:+.4f}, OS {m1['b_raw'][-3]:+.4f}")
    os.makedirs(OUT, exist_ok=True)
    json.dump(res, open(os.path.join(OUT, "step2d_fit.json"), "w"), indent=1)
    open(os.path.join(OUT, "step2d_report.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
