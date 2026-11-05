"""v0.9 Step 4b, item 8 (power-hitter avoidance): does a hitter's power show up more on some pitch locations than others?
No engine change. Same data, model and ship rule as seq_fit.py / step3_fits.py: 2024 train, 2025 held out; pitcher and
batter random intercepts; ship = held-out log-loss gain > 2 game-clustered bootstrap SDs AND the 95% cluster-robust
interval of every tested coefficient excludes 0.

Event: hard contact (launch speed >= 95 mph) given a ball in play, the event the engine's power grade moves.
Power: the hitter's hard-hit rate on balls in play in the OTHER season (2024 rows use his 2025 rate and the reverse), so
the measure never shares a ball in play with the rows it predicts. Shrunk toward the league rate (worth 50 balls in play)
and standardized. Hitters need balls in play in both seasons.
Zone (Statcast attack zones, as the engine's heart / edge / off / noncomp): m = max(|x| / 0.83 ft, |height - mid| / half
height of his zone); heart m < 0.67, edge (shadow) 0.67-1.33, off (chase) 1.33-2, noncomp beyond.

Base: zone, pitch class, count, power (one slope everywhere = the v0.8 power grade).
P1 (test): power x zone (edge is the reference) -> is power's slope steeper in the heart?
P2 (report only): the slope by zone, from one fit with a power slope per zone.
usage (repo root): python3 readthrough/step4b_power_fit.py -> results/step4b/power_fit.json and .txt"""
import json, math, os, sys
from collections import defaultdict
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import seq_fit as S

OUT = os.path.join(ROOT, "results", "step4b")
ZONES = ["heart", "edge", "off", "noncomp"]
lines = []


def say(*a):
    t = " ".join(str(x) for x in a)
    print(t, flush=True)
    lines.append(t)


def zone(r):
    half = max(0.25, (r["top"] - r["bot"]) / 2)
    mid = (r["top"] + r["bot"]) / 2
    m = max(abs(r["x"]) / 0.83, abs(r["z"] - mid) / half)
    return "heart" if m < 0.67 else "edge" if m < 1.33 else "off" if m < 2.0 else "noncomp"


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = [r for r in S.load() if r["desc"] == "hit_into_play" and r["ls"] == r["ls"]
            and all(v == v for v in (r["x"], r["z"], r["top"], r["bot"]))]
    say(f"balls in play with launch speed and location: {len(rows)}")
    hard = np.array([1.0 if r["ls"] >= 95 else 0.0 for r in rows])
    yr = np.array([r["yr"] for r in rows])
    # power by hitter-season, shrunk
    cnt = defaultdict(lambda: [0.0, 0])
    for r, h in zip(rows, hard):
        c = cnt[(r["bat"], r["yr"])]; c[0] += h; c[1] += 1
    league = {y: hard[yr == y].mean() for y in (2024, 2025)}
    K = 50.0
    rate = {k: (v[0] + K * league[k[1]]) / (v[1] + K) for k, v in cnt.items()}
    keep = np.array([(r["bat"], 2025 if r["yr"] == 2024 else 2024) in rate for r in rows])
    rows = [r for r, k in zip(rows, keep) if k]; hard = hard[keep]; yr = yr[keep]
    pw_raw = np.array([rate[(r["bat"], 2025 if r["yr"] == 2024 else 2024)] for r in rows])
    pw = (pw_raw - pw_raw[yr == 2024].mean()) / pw_raw[yr == 2024].std()
    say(f"hitters in both seasons: {len({r['bat'] for r in rows})}; rows kept {len(rows)}; league hard rate "
        f"2024 {league[2024]:.3f} 2025 {league[2025]:.3f}; power SD (raw hard rate) {pw_raw[yr == 2024].std():.3f}")
    zn = [zone(r) for r in rows]
    zcount = {z: sum(1 for x in zn if x == z) for z in ZONES}
    say("balls in play by zone: " + ", ".join(f"{z} {zcount[z]} ({zcount[z] / len(zn):.0%}), hard "
                                               f"{hard[np.array([x == z for x in zn])].mean():.3f}" for z in ZONES))
    Zd = np.array([[1.0 if z == q else 0.0 for q in ("heart", "off", "noncomp")] for z in zn])
    cls = np.array([[1.0 if r["c"] == c else 0.0 for c in ("SL", "CB", "CH")] for r in rows])
    cnt_ = np.array([[r["b"], r["k"], 1.0 if r["k"] == 2 else 0.0] for r in rows], dtype=float)
    X0 = np.hstack([Zd, cls, cnt_, pw[:, None]])
    inter = Zd * pw[:, None]                          # power x heart, power x off, power x noncomp (edge reference)
    tr, te = yr == 2024, yr == 2025
    pits = {p: j for j, p in enumerate(sorted({r["pit"] for r, t in zip(rows, tr) if t}))}
    bats = {p: j for j, p in enumerate(sorted({r["bat"] for r, t in zip(rows, tr) if t}))}
    gmap = {g: j for j, g in enumerate(sorted({r["g"] for r in rows}))}
    pid = np.array([pits.get(r["pit"], len(pits)) for r in rows])
    bid = np.array([bats.get(r["bat"], len(bats)) for r in rows])
    gid = np.array([gmap[r["g"]] for r in rows])
    F = S.Fit(X0[tr], hard[tr], pid[tr], bid[tr], gid[tr], len(pits), len(bats))
    m0 = F.run()
    m1 = F.run(extra=inter[tr])
    p0 = S.Fit.predict(m0, X0[te], pid[te], bid[te])
    p1 = S.Fit.predict(m1, X0[te], pid[te], bid[te], extra=inter[te])
    gain, sd = S.boot_gain(hard[te], p0, p1, gid[te])
    b_pw0, se_pw0 = m0["b_raw"][-1], m0["se_raw"][-1]
    names = ["power x heart", "power x off", "power x noncomp"]
    b, se = m1["b_raw"][-3:], m1["se_raw"][-3:]
    b_edge, se_edge = m1["b_raw"][-4], m1["se_raw"][-4]
    say(f"\nBase: one power slope {b_pw0:+.3f} logits per SD (95% {b_pw0 - 1.96 * se_pw0:+.3f} to {b_pw0 + 1.96 * se_pw0:+.3f})")
    say(f"P1: power slope on the edge (reference) {b_edge:+.3f} (+/- {1.96 * se_edge:.3f})")
    ex = {}
    for n_, bb, ss in zip(names, b, se):
        ex[n_] = (bb - 1.96 * ss > 0) or (bb + 1.96 * ss < 0)
        say(f"    {n_:16s} {bb:+.3f} (95% {bb - 1.96 * ss:+.3f} to {bb + 1.96 * ss:+.3f}){'' if ex[n_] else '  interval includes 0'}")
    ships = gain > 2 * sd and ex["power x heart"]
    say(f"    held-out gain {gain * 1e4:+.2f} x1e-4 per ball in play, bootstrap SD {sd * 1e4:.2f}; "
        f"ship rule (gain > 2 SD and power x heart interval excludes 0): {'SHIPS' if ships else 'does not ship'}")
    slope = {"edge": b_edge}
    for z, bb in zip(("heart", "off", "noncomp"), b):
        slope[z] = b_edge + bb
    share = {z: zcount[z] / len(zn) for z in ZONES}
    avg = sum(share[z] * slope[z] for z in ZONES)
    mult = {z: slope[z] / avg for z in ZONES}
    say("P2 (report only): power slope by zone, logits per SD: " + ", ".join(f"{z} {slope[z]:+.3f}" for z in ZONES))
    say("    as multipliers of the ball-in-play-weighted average slope: " + ", ".join(f"{z} {mult[z]:.2f}" for z in ZONES))
    res = dict(n=len(rows), base_slope=[b_pw0, se_pw0], edge_slope=[b_edge, se_edge],
               inter={n_: [float(bb), float(ss)] for n_, bb, ss in zip(names, b, se)},
               gain=gain, gain_sd=sd, ships=bool(ships), slope=slope, multiplier=mult, zone_share=share,
               power_sd_raw=float(pw_raw[yr == 2024].std()))
    json.dump(res, open(os.path.join(OUT, "power_fit.json"), "w"), indent=1)
    open(os.path.join(OUT, "power_fit.txt"), "w").write("\n".join(lines) + "\n")
    say("wrote results/step4b/power_fit.json and .txt")


if __name__ == "__main__":
    main()
