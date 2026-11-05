"""v0.9 Step 2 (item 7): does v0.8's fitted eye-level penalty on chase swings hold with two strikes?
Same data, controls, model and ship rule as seq_fit.py (2024 train, 2025 held out; pitcher and batter random intercepts;
held-out log-loss gain vs 2 bootstrap SDs clustered on game; 95% cluster-robust interval), at the shipped settings
(look memory 0.8, alpha 0.6, d* 2.0). The only change is the subset: E_y on swing | pitch outside the zone, split by
strikes and by above / below the zone. Writes results/step2/eye_chase_by_count.json. No engine change."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import seq_fit as S

LAM, ALPHA, DSTAR = 0.8, 0.6, 2.0


def main():
    rows = S.load()
    print(f"rows {len(rows)}", flush=True)
    tabs = S.season_tables(rows)
    from collections import defaultdict
    pc = defaultdict(int)
    pcs, prev_rows = [], []
    last_pa, last_i = None, None
    for i, r in enumerate(rows):
        key = (r["g"], r["pit"])
        pcs.append(pc[key]); pc[key] += 1
        pa = (r["g"], r["ab"])
        prev_rows.append(rows[last_i] if (last_pa == pa and last_i is not None) else None)
        last_pa, last_i = pa, i
    pits = {p: j for j, p in enumerate(sorted({r["pit"] for r in rows if r["yr"] == 2024}))}
    bats = {p: j for j, p in enumerate(sorted({r["bat"] for r in rows if r["yr"] == 2024}))}
    gmap = {g: j for j, g in enumerate(sorted({r["g"] for r in rows}))}
    base_seq = S.sequence(rows, 0.6, 0.4, tabs)
    for i, s in enumerate(base_seq):
        s["pc"] = pcs[i]
    ok = [all(v == v for v in (r["v"], r["x"], r["z"], r["top"], r["bot"])) for r in rows]
    idx = np.array([i for i in range(len(rows)) if ok[i]])
    Xc = np.nan_to_num(np.array([S.controls(rows[i], base_seq[i], tabs, prev_rows[i]) for i in idx]))
    yr = np.array([rows[i]["yr"] for i in idx])
    pid = np.array([pits.get(rows[i]["pit"], len(pits)) for i in idx])
    bid = np.array([bats.get(rows[i]["bat"], len(bats)) for i in idx])
    gid = np.array([gmap[rows[i]["g"]] for i in idx])
    desc = [rows[i]["desc"] for i in idx]
    sw = np.array([1.0 if d in S.SWING else 0.0 for d in desc])
    zone = np.array([rows[i]["zone"] for i in idx])
    k = np.array([rows[i]["k"] for i in idx])
    sq = S.sequence(rows, LAM, ALPHA, tabs)
    E = np.array([[S.g_mod((1 if rows[i]["c"] == "FB" else -1) * (rows[i]["z"] - sq[i]["yh"]), DSTAR) if sq[i]["prev"] is not None else 0.0]
                  for i in idx])
    out_z = np.isin(zone, (11, 12, 13, 14))
    below, above = np.isin(zone, (13, 14)), np.isin(zone, (11, 12))
    masks = {"all counts (as shipped)": out_z, "two strikes": out_z & (k == 2), "fewer than two strikes": out_z & (k < 2),
             "two strikes, below the zone": below & (k == 2), "two strikes, above the zone": above & (k == 2),
             "fewer than two strikes, below the zone": below & (k < 2)}
    res = {}
    for name, m in masks.items():
        tr, te = m & (yr == 2024), m & (yr == 2025)
        fit = S.Fit(Xc[tr], sw[tr], pid[tr], bid[tr], gid[tr], len(pits) + 1, len(bats) + 1)
        m0, m1 = fit.run(), fit.run(E[tr])
        p0 = S.Fit.predict(m0, Xc[te], pid[te], bid[te])
        p1 = S.Fit.predict(m1, Xc[te], pid[te], bid[te], E[te])
        gain, sd = S.boot_gain(sw[te], p0, p1, gid[te])
        b, se = float(m1["b_raw"][-1]), float(m1["se_raw"][-1])
        ship = gain > 2 * sd and abs(b) > 1.96 * se
        res[name] = dict(n_train=int(tr.sum()), n_test=int(te.sum()), beta=b, se=se, ci=[b - 1.96 * se, b + 1.96 * se],
                         heldout_gain=float(gain), boot_sd=float(sd), passes_ship_rule=bool(ship),
                         share_with_eye_change=float((E[tr][:, 0] > 0).mean()))
        print(f"{name}: n train {int(tr.sum())}, beta {b:+.3f} (se {se:.3f}, 95% {b - 1.96 * se:+.3f} to {b + 1.96 * se:+.3f}); "
              f"held-out gain {gain:.2e} (sd {sd:.2e}) -> {'passes' if ship else 'does not pass'} the ship rule", flush=True)
    os.makedirs(os.path.join(ROOT, "results", "step2"), exist_ok=True)
    json.dump(res, open(os.path.join(ROOT, "results", "step2", "eye_chase_by_count.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
