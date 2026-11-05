"""v0.9 Step 3: Statcast tests for side to side (item 3: T1-T4) and matchup memory (items 5-6: M1-M3). No engine change.
Same data, controls, model and ship rule as seq_fit.py: 2024 train, 2025 held out; pitcher and batter random intercepts;
ship = held-out log-loss gain > 2 game-clustered bootstrap SDs AND every tested coefficient's 95% cluster-robust interval
excludes 0. Every test sits ON TOP of the shipped v0.8 terms (timing B at look memory 0.8 / alpha 0.6, eye level at
d* 2.0, familiarity), so a gain is beyond what v0.8 already has.
usage (repo root): python3 readthrough/step3_fits.py  -> results/step3/step3_fits.json and .txt

Side: x = inches from plate center toward the batter (inside +), plate_x flipped by batter side. One engine side unit =
7 in (middle to the inside target center in engine.target_xy), so s = clip(|dx| / 14, 0, 1).
T1  last-pitch side change, same PA, split by direction (inside-to-away, away-to-inside); whiff | swing and hard | ball in
    play; each direction fitted and judged on its own.
T2  one-pitch or decaying: side memory x_look <- lam * x_look + (1 - lam) * x_prev (lam 0 = last pitch only; 0.8, 0.9,
    0.95); held-out gain on whiff | swing for each; report which is best.
T3  report only: T1 split by speed change (drop of 5+ mph vs not).
T4  report only: contact depth (intercept_ball_minus_batter_pos_y_inches) on swings at away fastballs after an inside
    fastball vs after an away fastball, same PA; game-clustered bootstrap interval.
M1  earlier-trip whiffs and called strikes on this pitch class (this pitcher vs this batter, this game, earlier PAs; capped
    at 4) -> whiff | swing and hard | ball in play on that class, beyond familiarity.
M2  earlier-trip hard-hit balls on this class AND spot (capped at 2) -> hard | ball in play and whiff | swing.
M3  report only: M1's effect the third time through (interaction with times-through >= 3)."""
import csv, glob, json, os, sys
from collections import defaultdict
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import seq_fit as S

LAM, ALPHA, DSTAR = 0.8, 0.6, 2.0
UNIT_IN = 7.0
OUT = os.path.join(ROOT, "results", "step3")
lines = []


def say(*a):
    t = " ".join(str(x) for x in a)
    print(t, flush=True)
    lines.append(t)


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = S.load()
    tabs = S.season_tables(rows)
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
    is_sw = np.array([d in S.SWING for d in desc])
    whiff = np.array([1.0 if d in S.WHIFF else 0.0 for d in desc])
    ls = np.array([rows[i]["ls"] for i in idx])
    hard = np.where(ls >= 95, 1.0, 0.0)
    bipv = np.array([d == "hit_into_play" for d in desc]) & (ls == ls)
    say(f"Statcast rows {len(rows)}, usable {len(idx)} (train {int((yr == 2024).sum())}, test {int((yr == 2025).sum())})")

    # shipped v0.8 terms as base columns
    sq = S.sequence(rows, LAM, ALPHA, tabs)
    SH = np.array([[sq[i]["B"],
                    S.g_mod((1 if rows[i]["c"] == "FB" else -1) * (rows[i]["z"] - sq[i]["yh"]), DSTAR) if sq[i]["prev"] is not None else 0.0,
                    min(sq[i]["n_fb"], 0.5 / 0.058) * (rows[i]["c"] == "FB"),
                    min(sq[i]["n_os"], 0.5 / 0.116) * (rows[i]["c"] != "FB")] for i in idx])
    res = {}

    def test(name, mask, yv, feats, label, report_only=False):
        tr, te = mask & (yr == 2024), mask & (yr == 2025)
        fit = S.Fit(Xc[tr], yv[tr], pid[tr], bid[tr], gid[tr], len(pits) + 1, len(bats) + 1)
        m0 = fit.run(SH[tr])
        full = np.hstack([SH, feats])
        m1 = fit.run(full[tr])
        p0 = S.Fit.predict(m0, Xc[te], pid[te], bid[te], SH[te])
        p1 = S.Fit.predict(m1, Xc[te], pid[te], bid[te], full[te])
        gain, sd = S.boot_gain(yv[te], p0, p1, gid[te])
        k = feats.shape[1]
        b, se = m1["b_raw"][-k:], m1["se_raw"][-k:]
        excl = bool(all(abs(bb) > 1.96 * ss for bb, ss in zip(b, se)))
        ship = bool(gain > 2 * sd and excl) and not report_only
        nz = int((feats[tr] != 0).any(1).sum())
        say(f"  [{name}] {label}: train n={m1['n']} (feature non-zero {nz}), test n={int(te.sum())}; beta={np.round(b, 4).tolist()} "
            f"se={np.round(se, 4).tolist()}; held-out gain {gain:.2e} (boot sd {sd:.2e}) -> "
            f"{'report only' if report_only else ('SHIP' if ship else 'no ship')}")
        res[name] = dict(label=label, beta=b.tolist(), se=se.tolist(), gain=float(gain), sd=float(sd), ship=ship,
                         ci_excludes_zero=excl, report_only=report_only, n_train=int(m1["n"]), n_feature_nonzero=nz)
        return res[name]

    # ---- side
    xin = np.array([((-rows[i]["x"] if rows[i]["stand"] == "R" else rows[i]["x"]) * 12.0) for i in idx])
    pos = {int(i): j for j, i in enumerate(idx)}
    prev_j = np.array([pos.get(sq[i]["prev"], -1) if sq[i]["prev"] is not None else -1 for i in idx])
    has_prev = prev_j >= 0
    dx = np.where(has_prev, xin - xin[np.maximum(prev_j, 0)], 0.0)
    s = np.clip(np.abs(dx) / (2 * UNIT_IN), 0, 1)
    in2away = np.where(has_prev & (dx < 0), s, 0.0)[:, None]
    away2in = np.where(has_prev & (dx > 0), s, 0.0)[:, None]
    say("\nT1. Last-pitch side change (each direction judged on its own)")
    test("T1_in2away_whiff", is_sw, whiff, in2away, "inside-to-away, whiff | swing")
    test("T1_away2in_whiff", is_sw, whiff, away2in, "away-to-inside, whiff | swing")
    test("T1_in2away_hard", bipv, hard, in2away, "inside-to-away, hard | ball in play (expected negative)")
    test("T1_away2in_hard", bipv, hard, away2in, "away-to-inside, hard | ball in play (expected negative)")

    say("\nT2. One pitch or decaying side memory (both directions, whiff | swing)")
    pa_key = [(rows[i]["g"], rows[i]["ab"]) for i in idx]
    for lam in (0.0, 0.8, 0.9, 0.95):
        look = np.zeros(len(idx))
        cur, xl = None, 0.0
        for j in range(len(idx)):
            if pa_key[j] != cur:
                cur, xl, started = pa_key[j], 0.0, False
            look[j] = xl if started else np.nan
            xl = (lam * xl + (1 - lam) * xin[j]) if started else xin[j]
            started = True
        d = np.where(np.isnan(look), 0.0, xin - np.nan_to_num(look))
        sl = np.clip(np.abs(d) / (2 * UNIT_IN), 0, 1)
        F = np.c_[np.where(d < 0, sl, 0.0), np.where(d > 0, sl, 0.0)]
        test(f"T2_lam{lam}", is_sw, whiff, F, f"side memory lam {lam} ({'last pitch only' if lam == 0 else 'decaying'})", report_only=True)
    best = max((k for k in res if k.startswith("T2_")), key=lambda k: res[k]["gain"])
    say(f"  best held-out gain: {best}")
    res["T2_best"] = best

    say("\nT3. Report only: T1 by speed change (drop of 5+ mph vs not)")
    vv = np.array([rows[i]["v"] for i in idx])
    drop5 = has_prev & ((vv[np.maximum(prev_j, 0)] - vv) >= 5)
    F = np.c_[in2away[:, 0] * drop5, in2away[:, 0] * ~drop5, away2in[:, 0] * drop5, away2in[:, 0] * ~drop5]
    test("T3_speed", is_sw, whiff, F, "[in2away x drop5, in2away x no drop, away2in x drop5, away2in x no drop], whiff | swing", report_only=True)

    # ---- matchup memory: earlier PAs of this pitcher vs this batter in this game
    succ = defaultdict(lambda: defaultdict(int))
    hardspot = defaultdict(lambda: defaultdict(int))
    m1f = np.zeros(len(idx)); m2f = np.zeros(len(idx)); tto3 = np.zeros(len(idx))
    cur, pa_rows = None, []
    jpos = {int(i): j for j, i in enumerate(idx)}
    for i, r in enumerate(rows):
        pa = (r["g"], r["ab"])
        if pa != cur:
            for pr in pa_rows:          # close the previous PA
                key = (pr["g"], pr["pit"], pr["bat"])
                cls = "FB" if pr["c"] == "FB" else "OS"
                if pr["desc"] in S.WHIFF or pr["desc"] == "called_strike":
                    succ[key][cls] += 1
                if pr["desc"] == "hit_into_play" and pr["ls"] == pr["ls"] and pr["ls"] >= 95 and pr["x"] == pr["x"] and pr["z"] == pr["z"]:
                    hardspot[key][(cls, S.quad(pr))] += 1
            cur, pa_rows = pa, []
        j = jpos.get(i)
        if j is not None:
            key = (r["g"], r["pit"], r["bat"])
            cls = "FB" if r["c"] == "FB" else "OS"
            m1f[j] = min(succ[key][cls], 4)
            m2f[j] = min(hardspot[key][(cls, S.quad(r))], 2)
            tto3[j] = float(r["tto"] >= 3)
        pa_rows.append(r)
    say(f"\nMatchup memory: pitches with an earlier-trip success on the class {int((m1f > 0).sum())}; "
        f"with an earlier-trip hard-hit ball on the class and spot {int((m2f > 0).sum())}")
    say("M1. Earlier-trip whiffs + called strikes on this class (beyond familiarity)")
    test("M1_whiff", is_sw, whiff, m1f[:, None], "whiff | swing")
    test("M1_hard", bipv, hard, m1f[:, None], "hard | ball in play")
    say("M2. Earlier-trip hard-hit balls on this class and spot")
    test("M2_hard", bipv, hard, m2f[:, None], "hard | ball in play")
    test("M2_whiff", is_sw, whiff, m2f[:, None], "whiff | swing")
    say("M3. Report only: M1 the third time through")
    test("M3_tto3", is_sw, whiff, np.c_[m1f, m1f * tto3], "[M1, M1 x third time through], whiff | swing", report_only=True)

    # ---- T4: contact depth (report only), read straight from the CSVs
    say("\nT4. Report only: contact depth on swings at away fastballs, after an inside vs an away fastball (same PA)")
    depth = {}
    for fn in sorted(glob.glob(os.path.join(ROOT, "data", "statcast", "sc_*.csv"))):
        with open(fn, encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                v = r.get("intercept_ball_minus_batter_pos_y_inches", "")
                if v not in ("", "NA"):
                    depth[(int(r["game_pk"]), int(r["at_bat_number"]), int(r["pitch_number"]))] = float(v)
    after_in, after_away = [], []
    for j, i in enumerate(idx):
        r = rows[i]
        if not is_sw[j] or r["c"] != "FB" or xin[j] >= 0 or prev_j[j] < 0:
            continue
        pr = rows[idx[prev_j[j]]]
        if pr["c"] != "FB":
            continue
        dv = depth.get((r["g"], r["ab"], r["pn"]))
        if dv is None:
            continue
        (after_in if xin[prev_j[j]] > 0 else after_away).append((gid[j], dv))
    def boot_diff(a, b, B=1000, seed=1):
        ga, gb = defaultdict(list), defaultdict(list)
        for g, v in a: ga[g].append(v)
        for g, v in b: gb[g].append(v)
        games = sorted(set(ga) | set(gb))
        rng = np.random.default_rng(seed)
        diffs = []
        for _ in range(B):
            pick = rng.choice(games, len(games))
            xa = [v for g in pick for v in ga.get(g, [])]
            xb = [v for g in pick for v in gb.get(g, [])]
            if xa and xb:
                diffs.append(np.mean(xa) - np.mean(xb))
        return float(np.mean([v for _, v in a]) - np.mean([v for _, v in b])), float(np.percentile(diffs, 2.5)), float(np.percentile(diffs, 97.5))
    if after_in and after_away:
        d, lo, hi = boot_diff(after_in, after_away)
        say(f"  n after inside {len(after_in)}, after away {len(after_away)}; mean depth after inside minus after away "
            f"{d:+.2f} in (95% {lo:+.2f} to {hi:+.2f}); positive = contact further out in front")
        res["T4_depth"] = dict(n_after_inside=len(after_in), n_after_away=len(after_away), diff_in=d, ci=[lo, hi], report_only=True)
    else:
        say("  no contact-depth data matched")
    json.dump(res, open(os.path.join(OUT, "step3_fits.json"), "w"), indent=1)
    open(os.path.join(OUT, "step3_fits.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
