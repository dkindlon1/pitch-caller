"""v0.9 Step 5 (item 3 widened, inside frequency): do inside pitches play differently from away pitches at the same
height, on the plate and near it? Same data, model and ship rule as seq_fit.py / step3_fits.py: 2024 train, 2025 held
out; pitcher and batter random intercepts; ship = held-out log-loss gain > 2 game-clustered bootstrap SDs AND each kept
coefficient's 95% cluster-robust interval excludes 0.

Pitches: heart and edge (Statcast attack zones, as step4b_power_fit.zone), so pitches at the batter or far off the plate
are left out. Inside = toward the batter (plate_x flipped for right-handed batters), away = the other half. Up/down = above
or below the middle of his zone.
Outcomes: hard | ball in play (launch speed >= 95), whiff | swing, swing.
Base: heart vs edge, up vs down, same side, pitch class, balls, strikes. Test (I1-I3): inside x {FB, OS} x {up, down} x
{same side, opposite side}, eight coefficients per outcome: the inside-vs-away difference the engine's outcome model would
need, split by platoon because an inside breaking ball means a different pitch to a same-side and an opposite-side hitter.
usage (repo root): python3 readthrough/step5_inside_fit.py -> results/step5/inside_fit.json and .txt"""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[:0] = [HERE, ROOT]
import seq_fit as S
from step4b_power_fit import zone

OUT = os.path.join(ROOT, "results", "step5")
CELLS = [f"{c} {h} {sd}" for c in ("FB", "OS") for h in ("up", "down") for sd in ("same", "opp")]
lines = []


def say(*a):
    t = " ".join(str(x) for x in a); print(t, flush=True); lines.append(t)


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = [r for r in S.load() if all(v == v for v in (r["x"], r["z"], r["top"], r["bot"])) and zone(r) in ("heart", "edge")]
    say(f"heart + edge pitches: {len(rows)}")
    inside = np.array([1.0 if ((-r["x"] if r["stand"] == "R" else r["x"]) > 0) else 0.0 for r in rows])
    up = np.array([1.0 if r["z"] > (r["top"] + r["bot"]) / 2 else 0.0 for r in rows])
    fb = np.array([1.0 if r["c"] == "FB" else 0.0 for r in rows])
    heart = np.array([1.0 if zone(r) == "heart" else 0.0 for r in rows])
    cls = np.array([[1.0 if r["c"] == c else 0.0 for c in ("SL", "CB", "CH")] for r in rows])
    cnt = np.array([[r["b"], r["k"], 1.0 if r["k"] == 2 else 0.0] for r in rows], float)
    same = np.array([1.0 if r["stand"] == r["thr"] else 0.0 for r in rows])
    X0all = np.hstack([heart[:, None], up[:, None], same[:, None], cls, cnt])
    cell = np.stack([cf * hf * sf for cf in (fb, 1 - fb) for hf in (up, 1 - up) for sf in (same, 1 - same)], 1)
    T = cell * inside[:, None]
    yr = np.array([r["yr"] for r in rows])
    desc = [r["desc"] for r in rows]
    sw = np.array([1.0 if d in S.SWING else 0.0 for d in desc])
    wh = np.array([1.0 if d in S.WHIFF else 0.0 for d in desc])
    bip = np.array([1.0 if (d == "hit_into_play" and r["ls"] == r["ls"]) else 0.0 for d, r in zip(desc, rows)])
    hard = np.array([1.0 if (b and r["ls"] >= 95) else 0.0 for b, r in zip(bip, rows)])
    gmap = {g: j for j, g in enumerate(sorted({r["g"] for r in rows}))}
    gid_all = np.array([gmap[r["g"]] for r in rows])
    res = {}
    for name, mask, y in (("hard | ball in play", bip == 1, hard), ("whiff | swing", sw == 1, wh), ("swing", np.ones(len(rows), bool), sw)):
        tr, te = mask & (yr == 2024), mask & (yr == 2025)
        pits = {p: j for j, p in enumerate(sorted({rows[i]["pit"] for i in np.where(tr)[0]}))}
        bats = {p: j for j, p in enumerate(sorted({rows[i]["bat"] for i in np.where(tr)[0]}))}
        pid = np.array([pits.get(r["pit"], len(pits)) for r in rows]); bid = np.array([bats.get(r["bat"], len(bats)) for r in rows])
        F = S.Fit(X0all[tr], y[tr], pid[tr], bid[tr], gid_all[tr], len(pits), len(bats))
        m0 = F.run(); m1 = F.run(extra=T[tr])
        p0 = S.Fit.predict(m0, X0all[te], pid[te], bid[te]); p1 = S.Fit.predict(m1, X0all[te], pid[te], bid[te], extra=T[te])
        gain, sd = S.boot_gain(y[te], p0, p1, gid_all[te])
        b, se = m1["b_raw"][-len(CELLS):], m1["se_raw"][-len(CELLS):]
        passes = gain > 2 * sd
        say(f"\n{name}: train n={int(tr.sum())}, test n={int(te.sum())}; held-out gain {gain * 1e4:+.2f} x1e-4 (SD {sd * 1e4:.2f}) "
            f"-> {'passes' if passes else 'fails'} the gain test")
        cells = {}
        for c, bb, ss in zip(CELLS, b, se):
            ex = (bb - 1.96 * ss > 0) or (bb + 1.96 * ss < 0)
            ship = bool(passes and ex)
            cells[c] = dict(b=float(bb), se=float(ss), ships=ship)
            raw_in = y[mask & (cell[:, CELLS.index(c)] == 1) & (inside == 1)].mean()
            raw_aw = y[mask & (cell[:, CELLS.index(c)] == 1) & (inside == 0)].mean()
            say(f"   inside, {c:13s} {bb:+.3f} logits (95% {bb - 1.96 * ss:+.3f} to {bb + 1.96 * ss:+.3f})  raw {raw_in:.1%} in vs {raw_aw:.1%} away"
                f"  {'SHIP' if ship else 'no ship'}")
        res[name] = dict(gain=gain, sd=sd, cells=cells)
    json.dump(res, open(os.path.join(OUT, "inside_fit.json"), "w"), indent=1)
    open(os.path.join(OUT, "inside_fit.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
