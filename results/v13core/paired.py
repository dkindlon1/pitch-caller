"""Seed-paired runs per game, core vs v1.2.3, from batch.py outputs (run_sims.sh). Prints a markdown table."""
import math
import re
import sys

OUT = "C:/dev/pitchiq-data/sims_v13core"
LEVELS = ("hs", "college_d3", "college_d2", "college_d1", "mlb")


def read(path):
    txt = open(path, encoding="utf8", errors="replace").read()
    runs = {int(m.group(1)): int(m.group(2)) for m in re.finditer(r"seed (\d+): .*?runs allowed (\d+),", txt)}
    wrong = re.search(r"clean ([\d.]+)%\s+questionable ([\d.]+)%\s+wrong ([\d.]+)%", txt)
    pa = re.search(r"per PA: K ([\d.]+)%\s+BB ([\d.]+)%\s+HBP ([\d.]+)%\s+H ([\d.]+)%\s+HR ([\d.]+)%", txt)
    return runs, wrong.groups() if wrong else None, pa.groups() if pa else None


rows = ["| Level | games | v1.2.3 runs / game | core runs / game | core - v1.2.3 (paired SE) | flag (> +0.25) | wrong calls v1.2.3 / core | K% v1.2.3 / core | BB% v1.2.3 / core | HR% v1.2.3 / core |",
        "|---|---|---|---|---|---|---|---|---|---|"]
for lv in LEVELS:
    try:
        a, wa, pa_a = read(f"{OUT}/v123_{lv}.txt")
        b, wb, pa_b = read(f"{OUT}/core_{lv}.txt")
    except OSError:
        continue
    seeds = sorted(set(a) & set(b))
    if not seeds:
        continue
    d = [b[s] - a[s] for s in seeds]
    n = len(d)
    m = sum(d) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in d) / (n - 1)) if n > 1 else float("nan")
    se = sd / math.sqrt(n)
    ra, rb = sum(a[s] for s in seeds) / n, sum(b[s] for s in seeds) / n
    flag = "**FLAG**" if m > 0.25 else "-"
    rows.append(f"| {lv}{' (v1.2.3 at D3)' if lv == 'college_d2' else ''} | {n} | {ra:.2f} | {rb:.2f} | {m:+.2f} ({se:.2f}) | {flag} | "
                f"{wa[2] if wa else '?'}% / {wb[2] if wb else '?'}% | {pa_a[0]} / {pa_b[0]} | {pa_a[1]} / {pa_b[1]} | {pa_a[4]} / {pa_b[4]} |")
print("\n".join(rows))
