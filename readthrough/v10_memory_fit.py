"""v1.0 Step 5, #7: one owner of in-game hitter memory. Statcast, same data, controls, model and ship rule as
readthrough/step3_fits.py (2024 train, 2025 held out; pitcher and batter random intercepts; ship = held-out log-loss gain
> 2 game-clustered bootstrap SDs AND the coefficient's 95% cluster-robust interval excludes 0). On top of the shipped v0.8
terms (timing B, eye level, familiarity), as in v0.9 Step 3.

The question: the engine reads a hitter's in-game history twice. R5 `damage()` (a running damage score on the pitch class
from his earlier swings today, unfitted, v0.6) and the fitted matchup memory MM (M1: earlier-trip whiffs and called strikes
on the class, cap 4; M2: earlier-trip hard-hit balls on the class and spot, cap 2) both consume the same events.

  D   report: R5's in-game class damage, as the engine computes it, on its own (does it predict anything?)
  M1, M2 refit WITH R5 damage as a control column. If they still pass the ship rule, MM owns in-game memory and R5
      keeps only the cross-game seed; if damage absorbs them, MM is dropped.
  M2 is keyed on actual plate location, both for the earlier hard hits and for the pitch being predicted (as originally
  fitted). Each of M1, M2 keeps its own cap (4, 2); there is no shared clip on their sum.

R5 damage here: for this batter in this game, every earlier swing on the class (any PA, any pitcher, the way the
simulator's K.damage and the app's know().damage accumulate): whiff -0.6, foul 0, ball in play by exit speed (>= 95 hard
1.0, 80-95 solid 0.3, < 80 weak -0.3); score = running mean, eff = score * n / (n + 10), a negative eff halved while
n < 20 (engine.damage()).
usage (repo root): python3 readthrough/v10_memory_fit.py -> results/v10/memory_fit.json and .txt"""
import json, os, sys
from collections import defaultdict
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import seq_fit as S

LAM, ALPHA, DSTAR = 0.8, 0.6, 2.0
OUT = os.path.join(ROOT, "results", "v10")
lines = []


def say(*a):
    t = " ".join(str(x) for x in a)
    print(t, flush=True)
    lines.append(t)


def dmg_val(r):
    d = r["desc"]
    if d in S.WHIFF:
        return -0.6
    if d.startswith("foul"):
        return 0.0
    if d == "hit_into_play" and r["ls"] == r["ls"]:
        return 1.0 if r["ls"] >= 95 else (0.3 if r["ls"] >= 80 else -0.3)
    return None


def eff(score, n):
    e = score * n / (n + 10.0)
    return e * 0.5 if (e < 0 and n < 20) else e


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
    sq = S.sequence(rows, LAM, ALPHA, tabs)
    SH = np.array([[sq[i]["B"],
                    S.g_mod((1 if rows[i]["c"] == "FB" else -1) * (rows[i]["z"] - sq[i]["yh"]), DSTAR) if sq[i]["prev"] is not None else 0.0,
                    min(sq[i]["n_fb"], 0.5 / 0.058) * (rows[i]["c"] == "FB"),
                    min(sq[i]["n_os"], 0.5 / 0.116) * (rows[i]["c"] != "FB")] for i in idx])

    # in-game features, walked in pitch order: R5 class damage (before this pitch), M1, M2 (earlier PAs only)
    jpos = {int(i): j for j, i in enumerate(idx)}
    dmg = defaultdict(lambda: [0.0, 0])                      # (game, batter, class) -> [score, n]
    succ = defaultdict(lambda: defaultdict(int))
    hardspot = defaultdict(lambda: defaultdict(int))
    dmgf = np.zeros(len(idx)); m1f = np.zeros(len(idx)); m2f = np.zeros(len(idx))
    cur, pa_rows = None, []
    for i, r in enumerate(rows):
        pa = (r["g"], r["ab"])
        if pa != cur:
            for pr in pa_rows:
                key = (pr["g"], pr["pit"], pr["bat"])
                cls = "FB" if pr["c"] == "FB" else "OS"
                if pr["desc"] in S.WHIFF or pr["desc"] == "called_strike":
                    succ[key][cls] += 1
                if pr["desc"] == "hit_into_play" and pr["ls"] == pr["ls"] and pr["ls"] >= 95 and pr["x"] == pr["x"] and pr["z"] == pr["z"]:
                    hardspot[key][(cls, S.quad(pr))] += 1
            cur, pa_rows = pa, []
        cls = "FB" if r["c"] == "FB" else "OS"
        dk = (r["g"], r["bat"], cls)
        j = jpos.get(i)
        if j is not None:
            key = (r["g"], r["pit"], r["bat"])
            sc, n = dmg[dk]
            dmgf[j] = eff(sc, n) if n else 0.0
            m1f[j] = min(succ[key][cls], 4)
            m2f[j] = min(hardspot[key][(cls, S.quad(r))], 2)
        v = dmg_val(r)
        if v is not None:
            sc, n = dmg[dk]
            dmg[dk] = [(sc * n + v) / (n + 1), n + 1]
        pa_rows.append(r)
    say(f"pitches with in-game class damage {int((dmgf != 0).sum())}; with an M1 success {int((m1f > 0).sum())}; "
        f"with an M2 hard hit on the class and spot {int((m2f > 0).sum())}")
    res = {}

    def test(name, mask, yv, base, feats, label, report_only=False):
        tr, te = mask & (yr == 2024), mask & (yr == 2025)
        fit = S.Fit(Xc[tr], yv[tr], pid[tr], bid[tr], gid[tr], len(pits) + 1, len(bats) + 1)
        m0 = fit.run(base[tr])
        full = np.hstack([base, feats])
        m1 = fit.run(full[tr])
        p0 = S.Fit.predict(m0, Xc[te], pid[te], bid[te], base[te])
        p1 = S.Fit.predict(m1, Xc[te], pid[te], bid[te], full[te])
        gain, sd = S.boot_gain(yv[te], p0, p1, gid[te])
        k = feats.shape[1]
        b, se = m1["b_raw"][-k:], m1["se_raw"][-k:]
        excl = bool(all(abs(bb) > 1.96 * ss for bb, ss in zip(b, se)))
        ship = bool(gain > 2 * sd and excl) and not report_only
        say(f"  [{name}] {label}: train n={m1['n']}, test n={int(te.sum())}; beta={np.round(b, 4).tolist()} "
            f"se={np.round(se, 4).tolist()}; held-out gain {gain:.2e} (boot sd {sd:.2e}, {gain / sd if sd else 0:+.1f} sd) -> "
            f"{'report only' if report_only else ('SHIP' if ship else 'no ship')}")
        res[name] = dict(label=label, beta=b.tolist(), se=se.tolist(), gain=float(gain), sd=float(sd), ship=ship,
                         ci_excludes_zero=excl, report_only=report_only, n_train=int(m1["n"]))
        return res[name]

    D = dmgf[:, None]
    SHD = np.hstack([SH, D])
    say("\nD. R5 in-game class damage on its own (on top of the shipped v0.8 terms)")
    test("D_whiff", is_sw, whiff, SH, D, "whiff | swing", report_only=True)
    test("D_hard", bipv, hard, SH, D, "hard | ball in play", report_only=True)
    say("\nM1/M2 without the damage control (v0.9 Step 3 as shipped, for comparison)")
    test("M1_whiff_nodmg", is_sw, whiff, SH, m1f[:, None], "M1 whiff | swing", report_only=True)
    test("M2_whiff_nodmg", is_sw, whiff, SH, m2f[:, None], "M2 whiff | swing", report_only=True)
    say("\nM1/M2 WITH R5 damage as a control (the #7 decision)")
    test("M1_whiff", is_sw, whiff, SHD, m1f[:, None], "M1 whiff | swing")
    test("M1_hard", bipv, hard, SHD, m1f[:, None], "M1 hard | ball in play")
    test("M2_whiff", is_sw, whiff, SHD, m2f[:, None], "M2 whiff | swing")
    test("M2_hard", bipv, hard, SHD, m2f[:, None], "M2 hard | ball in play")
    say("\nDamage on top of M1+M2 (does R5 add anything once MM is in?)")
    MM2 = np.c_[m1f, m2f]
    test("D_whiff_given_MM", is_sw, whiff, np.hstack([SH, MM2]), D, "R5 damage, whiff | swing, given M1+M2", report_only=True)
    test("D_hard_given_MM", bipv, hard, np.hstack([SH, MM2]), D, "R5 damage, hard | ball in play, given M1+M2", report_only=True)
    json.dump(res, open(os.path.join(OUT, "memory_fit.json"), "w"), indent=1)
    open(os.path.join(OUT, "memory_fit.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
