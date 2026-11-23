"""Seed-paired runs per game, recalibrated core vs v1.2.3 (run_sims.sh). v1.2.3 seeds 401-412 come from sims_v13core
(byte-identical replay checked on seed 401), 413-440 from this run. Per-PA rates and the checker's wrong share are
recounted from the game CSVs / batch lines over the paired seeds. Prints a markdown table."""
import csv
import glob
import math
import os
import re

NEW = "C:/dev/pitchiq-data/sims_v13core_recal"
OLD = "C:/dev/pitchiq-data/sims_v13core"
LEVELS = ("hs", "college_d3", "college_d1", "mlb")


def seeds_from(txt):
    out = {}
    for m in re.finditer(r"seed (\d+): (\d+) pitches, wrong (\d+), questionable \d+, runs allowed (\d+),", txt):
        out[int(m.group(1))] = dict(pitches=int(m.group(2)), wrong=int(m.group(3)), runs=int(m.group(4)))
    return out


def read(paths_dirs):
    games = {}
    for txt, d in paths_dirs:
        if not os.path.exists(txt):
            continue
        for s, g in seeds_from(open(txt, encoding="utf8", errors="replace").read()).items():
            g["csv"] = os.path.join(d, f"game_{s}.csv")
            games[s] = g
    return games


def pa_rates(games, seeds):
    c = dict(PA=0, K=0, BB=0, HBP=0, H=0, HR=0)
    for s in seeds:
        for r in csv.DictReader(open(games[s]["csv"], encoding="utf8")):
            d = r["detail"]
            if "STRIKEOUT" in d: c["PA"] += 1; c["K"] += 1
            elif "WALK" in d: c["PA"] += 1; c["BB"] += 1
            elif "HIT BY PITCH" in d: c["PA"] += 1; c["HBP"] += 1
            elif "contact:" in d:
                c["PA"] += 1
                if any(x in d for x in ("SINGLE", "DOUBLE", "TRIPLE", "HOME RUN")): c["H"] += 1
                if "HOME RUN" in d: c["HR"] += 1
    return {k: 100.0 * v / c["PA"] for k, v in c.items() if k != "PA"}, c["PA"]


rows = ["| Level | games | v1.2.3 runs / game | core runs / game | core - v1.2.3 (paired SE) | flag (> +0.25) | "
        "wrong calls v1.2.3 / core | K% v1.2.3 / core | BB% v1.2.3 / core | H% v1.2.3 / core | HR% v1.2.3 / core |",
        "|---|---|---|---|---|---|---|---|---|---|---|"]
for lv in LEVELS:
    a = read([(f"{OLD}/v123_{lv}.txt", f"{OLD}/v123_{lv}"), (f"{NEW}/v123_{lv}.txt", f"{NEW}/v123_{lv}")])
    b = read([(f"{NEW}/core_{lv}.txt", f"{NEW}/core_{lv}")])
    seeds = sorted(set(a) & set(b))
    if not seeds:
        continue
    d = [b[s]["runs"] - a[s]["runs"] for s in seeds]
    n = len(d)
    m = sum(d) / n
    se = math.sqrt(sum((x - m) ** 2 for x in d) / (n - 1)) / math.sqrt(n)
    ra, rb = sum(a[s]["runs"] for s in seeds) / n, sum(b[s]["runs"] for s in seeds) / n
    wa = 100.0 * sum(a[s]["wrong"] for s in seeds) / sum(a[s]["pitches"] for s in seeds)
    wb = 100.0 * sum(b[s]["wrong"] for s in seeds) / sum(b[s]["pitches"] for s in seeds)
    pa, _ = pa_rates(a, seeds)
    pb, _ = pa_rates(b, seeds)
    rows.append(f"| {lv} | {n} | {ra:.2f} | {rb:.2f} | {m:+.2f} ({se:.2f}) | {'**FLAG**' if m > 0.25 else '-'} | "
                f"{wa:.1f}% / {wb:.1f}% | {pa['K']:.1f} / {pb['K']:.1f} | {pa['BB']:.1f} / {pb['BB']:.1f} | "
                f"{pa['H']:.1f} / {pb['H']:.1f} | {pa['HR']:.1f} / {pb['HR']:.1f} |")
print("\n".join(rows))
d2 = sorted(glob.glob(f"{NEW}/core_college_d2/game_*.csv"))
strip = lambda r: {k: v for k, v in r.items() if k != "level"}
same = [[strip(r) for r in csv.DictReader(open(p, encoding="utf8"))] == [strip(r) for r in csv.DictReader(open(p.replace("core_college_d2", "core_college_d3"), encoding="utf8"))] for p in d2]
print(f"\nD2 core games identical to D3's except the level column (same seeds): {sum(same)} / {len(same)}")
