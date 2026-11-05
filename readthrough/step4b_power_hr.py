"""v0.9 Step 4b, item 8, second test (P3): given hard contact, does a power hitter do more damage (home runs, run value)?
And is that extra damage bigger in the heart? Same hitters and power measure as step4b_power_fit.py (other-season hard-hit
rate, shrunk, per SD). Event: home run given a hard ball in play; report: delta_run_exp per hard ball in play.
Logistic with pitcher and batter random intercepts, 2024 train / 2025 held out, same ship rule.
usage (repo root): python3 readthrough/step4b_power_hr.py -> results/step4b/power_hr.json and .txt"""
import csv, glob, json, os, sys
from collections import defaultdict
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[:0] = [HERE, ROOT]
import seq_fit as S
from step4b_power_fit import zone

OUT = os.path.join(ROOT, "results", "step4b")
lines = []


def say(*a):
    t = " ".join(str(x) for x in a); print(t, flush=True); lines.append(t)


def extra():
    ev = {}
    for fn in sorted(glob.glob(os.path.join(ROOT, "data", "statcast", "sc_*.csv"))):
        with open(fn, encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                if r["description"] == "hit_into_play":
                    ev[(int(r["game_pk"]), int(r["at_bat_number"]), int(r["pitch_number"]))] = (r["events"], S.f(r["delta_run_exp"]))
    return ev


def main():
    os.makedirs(OUT, exist_ok=True)
    EV = extra()
    rows = [r for r in S.load() if r["desc"] == "hit_into_play" and r["ls"] == r["ls"]
            and all(v == v for v in (r["x"], r["z"], r["top"], r["bot"]))]
    hard_all = np.array([1.0 if r["ls"] >= 95 else 0.0 for r in rows])
    cnt = defaultdict(lambda: [0.0, 0])
    for r, h in zip(rows, hard_all):
        c = cnt[(r["bat"], r["yr"])]; c[0] += h; c[1] += 1
    yr_all = np.array([r["yr"] for r in rows])
    league = {y: hard_all[yr_all == y].mean() for y in (2024, 2025)}
    rate = {k: (v[0] + 50 * league[k[1]]) / (v[1] + 50) for k, v in cnt.items()}
    other = lambda r: (r["bat"], 2025 if r["yr"] == 2024 else 2024)
    rows = [r for r in rows if r["ls"] >= 95 and other(r) in rate]
    yr = np.array([r["yr"] for r in rows])
    pw_raw = np.array([rate[other(r)] for r in rows])
    pw = (pw_raw - pw_raw[yr == 2024].mean()) / pw_raw[yr == 2024].std()
    hr = np.array([1.0 if EV.get((r["g"], r["ab"], r["pn"]), ("", 0))[0] == "home_run" else 0.0 for r in rows])
    rv = np.array([EV.get((r["g"], r["ab"], r["pn"]), ("", float("nan")))[1] for r in rows])
    zn = [zone(r) for r in rows]
    heart = np.array([1.0 if z == "heart" else 0.0 for z in zn])
    say(f"hard balls in play: {len(rows)}; HR rate {hr.mean():.3f}; heart share {heart.mean():.0%}")
    for lab, m in (("bottom third of power", pw < np.quantile(pw, 1 / 3)), ("middle third", (pw >= np.quantile(pw, 1 / 3)) & (pw < np.quantile(pw, 2 / 3))),
                   ("top third", pw >= np.quantile(pw, 2 / 3))):
        ok = m & (rv == rv)
        say(f"  {lab:22s}: HR per hard ball {hr[m].mean():.3f}, run value per hard ball {rv[ok].mean():+.3f}; "
            f"heart {hr[m & (heart == 1)].mean():.3f} / edge+ {hr[m & (heart == 0)].mean():.3f}")
    cls = np.array([[1.0 if r["c"] == c else 0.0 for c in ("SL", "CB", "CH")] for r in rows])
    X0 = np.hstack([heart[:, None], cls, np.array([[r["b"], r["k"]] for r in rows], float), pw[:, None]])
    tr, te = yr == 2024, yr == 2025
    pits = {p: j for j, p in enumerate(sorted({r["pit"] for r, t in zip(rows, tr) if t}))}
    bats = {p: j for j, p in enumerate(sorted({r["bat"] for r, t in zip(rows, tr) if t}))}
    gmap = {g: j for j, g in enumerate(sorted({r["g"] for r in rows}))}
    pid = np.array([pits.get(r["pit"], len(pits)) for r in rows]); bid = np.array([bats.get(r["bat"], len(bats)) for r in rows])
    gid = np.array([gmap[r["g"]] for r in rows])
    F = S.Fit(X0[tr], hr[tr], pid[tr], bid[tr], gid[tr], len(pits), len(bats))
    base = S.Fit(X0[tr][:, :-1], hr[tr], pid[tr], bid[tr], gid[tr], len(pits), len(bats))
    mb, m0 = base.run(), F.run()
    inter = (heart * pw)[:, None]
    m1 = F.run(extra=inter[tr])
    pb = S.Fit.predict(mb, X0[te][:, :-1], pid[te], bid[te])
    p0 = S.Fit.predict(m0, X0[te], pid[te], bid[te])
    p1 = S.Fit.predict(m1, X0[te], pid[te], bid[te], extra=inter[te])
    g0, s0 = S.boot_gain(hr[te], pb, p0, gid[te])
    g1, s1 = S.boot_gain(hr[te], p0, p1, gid[te])
    b, se = m0["b_raw"][-1], m0["se_raw"][-1]
    bi, sei = m1["b_raw"][-1], m1["se_raw"][-1]
    p3 = g0 > 2 * s0 and (b - 1.96 * se > 0)
    p4 = g1 > 2 * s1 and ((bi - 1.96 * sei > 0) or (bi + 1.96 * sei < 0))
    say(f"P3 power -> HR given hard contact: {b:+.3f} logits per SD (95% {b - 1.96 * se:+.3f} to {b + 1.96 * se:+.3f}); "
        f"held-out gain {g0 * 1e4:+.1f} x1e-4 (SD {s0 * 1e4:.1f}): {'SHIPS' if p3 else 'does not ship'}")
    say(f"P4 power x heart on HR given hard: {bi:+.3f} (95% {bi - 1.96 * sei:+.3f} to {bi + 1.96 * sei:+.3f}); "
        f"held-out gain {g1 * 1e4:+.1f} x1e-4 (SD {s1 * 1e4:.1f}): {'SHIPS' if p4 else 'does not ship'}")
    res = dict(n=len(rows), hr_rate=float(hr.mean()), p3=dict(b=b, se=se, gain=g0, sd=s0, ships=bool(p3)),
               p4=dict(b=bi, se=sei, gain=g1, sd=s1, ships=bool(p4)), power_sd_raw=float(pw_raw[yr == 2024].std()))
    json.dump(res, open(os.path.join(OUT, "power_hr.json"), "w"), indent=1)
    open(os.path.join(OUT, "power_hr.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
