"""Compare input levels: decision quality vs a perfect-knowledge caller, runs, call grades, predictability.
usage: python3 inputs_report.py"""
import csv, glob, math, re, subprocess
from collections import Counter, defaultdict

import sys
PREFIX = sys.argv[1] if len(sys.argv) > 1 else ""
CONFIGS = [("in1_n0", "1  results only"), ("in2_n0", "2  + contact quality"), ("in3_n0", "3  + hitter reads"),
           ("in4_n0", "4  + measured movement"), ("in3_n0.15", "3  + reads, 15% logged wrong")]


def mean_se(xs):
    n = len(xs)
    m = sum(xs) / n
    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1)) if n > 1 else 0
    return m, sd / math.sqrt(n)


print(f"{'input level':32}{'games':>6}{'runs lost/100 pitches':>23}{'not knowing hitter':>20}{'staying unpredictable':>23}"
      f"{'runs/game':>14}{'clean':>8}{'wrong':>7}{'FB guess':>9}")
for tag, label in CONFIGS:
    files = sorted(glob.glob(f"{PREFIX}{tag}/game_*.csv"))
    if not files:
        print(f"{label:32}  (not run yet)")
        continue
    per_game, runs, by_inn = [], [], defaultdict(list)
    tot = Counter()
    guess = []
    for f in files:
        rows = list(csv.DictReader(open(f)))
        reg = [float(r["regret_exp"]) for r in rows]
        per_game.append(100 * sum(reg) / len(reg))
        runs.append(sum(int(r["runs"]) for r in rows))
        for r in rows:
            i = int(r["inning"])
            by_inn["1-3" if i <= 3 else ("4-6" if i <= 6 else "7-9")].append(float(r["regret_exp"]))
        out = subprocess.run(["python3", "review.py", f], capture_output=True, text=True).stdout
        t, ok, q, w = map(int, re.search(r"(\d+) pitches: OK (\d+), QUESTIONABLE (\d+), WRONG (\d+)", out).groups())
        tot.update(p=t, ok=ok, w=w)
        guess.append(int(re.search(r"always-fastball (\d+)%", out).group(1)))
    m, se = mean_se(per_game)
    if "regret_info" in rows[0]:
        info_g = [100 * sum(float(r["regret_info"]) for r in list(csv.DictReader(open(f)))) /
                  len(list(csv.DictReader(open(f)))) for f in files]
        im, ise = mean_se(info_g)
        info_txt = f"{im:>12.2f} \u00b1 {ise:.2f}{m - im:>19.2f}"
    else:
        info_txt = f"{'n/a':>20}{'n/a':>23}"
    rm, rse = mean_se(runs)
    inn = " / ".join(f"{100 * sum(v) / len(v):.2f}" for k, v in sorted(by_inn.items()))
    print(f"{label:32}{len(files):>6}{m:>15.2f} ± {se:.2f}{info_txt}{rm:>9.2f} ± {rse:.2f}"
          f"{tot['ok'] / tot['p']:>8.1%}{tot['w'] / tot['p']:>7.1%}{sum(guess) / len(guess):>8.0f}%")
print("\nruns lost = expected runs the engine's mix gave up vs a caller who knows every hitter's hidden"
      " strengths, timing and each pitch's true movement (same pitchers, same confidence, same count).")
