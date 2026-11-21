"""Generates hitter_data/harness_frozen.py: the harness's FROZEN pitcher assumption (docs/HARNESS_v13.md section 3,
review decision Nov 21, option (d)). It is the v1.2 calib.py world: the simulator's default staff (starter 0.65 /
reliever 0.35 of pitches), the engine's own calls (call_v08, table solved once at 0-0 per pitcher and side, 0 outs,
bases empty, pitch 40, 9th batter faced, exactly as calib.evaluate), each call's landing in that world (the hidden
hitter's off-day wildness included), weighted by how often each count is reached (calib's visits). Frozen per level x
side x count as (arsenal, pitch, target, landed zone, weight), plus the pitch specs. D2 = mean of D1 and D3.

Run once from the repo root:  python -m hitter_data.harness_freeze   (needs engine.py, calib.py, simulate.py)
Regenerating changes every score: bump harness_adapters.HARNESS_ASSUMPTION_VERSION when you do."""
import os
import random
import subprocess
import sys
from collections import defaultdict
from dataclasses import replace

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "hitter_data", "harness_frozen.py")
SPEC_FIELDS = ("name", "kind", "grade", "command", "conf", "shape", "velo", "slot")


def freeze():
    os.chdir(ROOT)
    sys.path.insert(0, ROOT)
    import calib
    import engine
    import simulate
    from engine import Situation, call_v08, solve_table, outcome_probs

    staff = calib.STAFF
    arsenals = [[{f: getattr(p, f) for f in SPEC_FIELDS} for p in who["arsenal"]] for who in staff]
    mix, side_share = {}, {}
    for lvl, L in (("D1", "college_d1"), ("D3", "college_d3")):
        mass = defaultdict(lambda: defaultdict(float))      # (side, count) -> (ai, pj, q, zone) -> weight
        for ai, (who, w) in enumerate(zip(staff, calib.STAFF_W)):
            ars = who["arsenal"]
            idx = {id(p): j for j, p in enumerate(ars)}
            for same in (True, False):
                hs = [h for h in calib.HITTERS if (h["hand"] == who["hand"]) == same]
                if not hs:
                    continue
                ws = w * len(hs) / len(calib.HITTERS)
                dists, tab0 = {}, None
                for c in calib.COUNTS:
                    s = Situation(c[0], c[1], 0, (False, False, False), level=L, same_side=same, pitch_count=40,
                                  batters_faced=9)
                    if tab0 is None:
                        tab0 = solve_table(ars, replace(s, balls=0, strikes=0, last=None))
                    _, dist, _, _ = call_v08(ars, s, rng=random.Random(0), tab=tab0)
                    dists[c] = [(pr, p, q) for pr, _, p, q in dist]
                for h in hs:
                    reach = defaultdict(float)
                    reach[(0, 0)] = 1.0
                    for c in sorted(calib.COUNTS, key=lambda c: c[0] + c[1]):
                        r = reach[c]
                        if r <= 0:
                            continue
                        s = Situation(c[0], c[1], 0, (False, False, False), level=L, same_side=same, pitch_count=40,
                                      batters_faced=9)
                        simulate.CURRENT_OFF.clear(); simulate.CURRENT_OFF.update(h["_off"][who["name"]])
                        ts = simulate.true_situation(s, h)
                        P = defaultdict(float)
                        land_mass = []
                        for pr, p, q in dists[c]:
                            o = outcome_probs(p, q, ts, ars)
                            for k_, v in o.items():
                                P[k_] += pr * v
                            land_mass.append((pr, p, q, engine.landing(p, q, ts)))
                        b, k = c
                        loop = P["foul"] if k == 2 else 0.0
                        visits = r / (1 - loop)
                        for pr, p, q, land in land_mass:
                            for z, sh in land.items():
                                mass[(same, c)][(ai, idx[id(p)], q, z)] += ws / len(hs) * visits * pr * sh
                        balls = visits * (P["ball"] + P["wp_ball"])
                        strikes = visits * (P["cstrike"] + P["whiff"])
                        fouls = visits * P["foul"] if k < 2 else 0.0
                        if b < 3:
                            reach[(b + 1, k)] += balls
                        if k < 2:
                            reach[(b, k + 1)] += strikes + fouls
        mix[lvl], side_share[lvl] = {}, {}
        for c in calib.COUNTS:
            tot = {sd: sum(mass[(sd, c)].values()) for sd in (True, False)}
            side_share[lvl][c] = round(tot[True] / (tot[True] + tot[False]), 6)
            for sd in (True, False):
                mix[lvl][("same" if sd else "opp", c)] = sorted(
                    (k_[0], k_[1], k_[2], k_[3], round(v / tot[sd], 7)) for k_, v in mass[(sd, c)].items()
                    if v / tot[sd] >= 1e-7)
    # D2: mean of the two distributions
    mix["D2"], side_share["D2"] = {}, {}
    for key in mix["D1"]:
        acc = defaultdict(float)
        for lv in ("D1", "D3"):
            for ai, pj, q, z, w in mix[lv][key]:
                acc[(ai, pj, q, z)] += w / 2
        mix["D2"][key] = sorted(k_ + (round(v, 7),) for k_, v in acc.items())
    for c in calib.COUNTS:
        side_share["D2"][c] = round((side_share["D1"][c] + side_share["D3"][c]) / 2, 6)
    sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    lines = ['"""FROZEN pitcher assumption for the v1.3 scoring harness. GENERATED by hitter_data/harness_freeze.py from the',
             f'v1.2 calib.py world at commit {sha} (simulator default staff, call_v08 calls, their landing, count visits).',
             'Do not edit by hand; regenerating changes every score (bump HARNESS_ASSUMPTION_VERSION)."""', '',
             f'SOURCE_COMMIT = "{sha}"', 'ZONES = ("heart", "edge", "off", "noncomp")', '',
             '# arsenals[a][j]: pitch specs (the pitcher whose calls these are)', 'ARSENALS = [']
    for a in arsenals:
        lines.append("    [")
        for p in a:
            lines.append(f"        {p!r},")
        lines.append("    ],")
    lines += [']', '', '# MIX[level][(side, (balls, strikes))] = [(arsenal, pitch, target, landed zone, weight)], weights sum to 1',
              'MIX = {']
    for lv in ("D1", "D2", "D3"):
        lines.append(f'    "{lv}": {{')
        for key, rows in mix[lv].items():
            lines.append(f"        {key!r}: [")
            for r in rows:
                lines.append(f"            {r!r},")
            lines.append("        ],")
        lines.append("    },")
    lines += ['}', '', '# SAME_SHARE[level][(balls, strikes)]: share of that count\'s pitches thrown to same-side hitters', 'SAME_SHARE = {']
    for lv in ("D1", "D2", "D3"):
        lines.append(f'    "{lv}": {side_share[lv]!r},')
    lines.append('}')
    with open(OUT, "w", newline="\n", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("wrote", OUT)


if __name__ == "__main__":
    freeze()
