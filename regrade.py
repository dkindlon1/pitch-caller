"""Re-grade saved game logs with the current checker and summarize realism vs real rates.
usage: python3 regrade.py <dir> [<dir> ...]"""
import csv, glob, json, re, subprocess, sys
from collections import Counter

RV = json.load(open("college_run_values.json"))
REAL = {"mlb": "mlb_check", "college_d1": "college_d1", "college_d3": "college_d3", "hs": "hs"}
S = {"cstrike", "whiff", "foul", "weak", "solid", "hard"}

for d in sys.argv[1:]:
    files = sorted(glob.glob(f"{d}/game_*.csv"))
    tot, rules, pa, kinds = Counter(), Counter(), Counter(), Counter()
    level = None
    os_mid = os_mid_over = fb_mid_2k = 0
    for f in files:
        out = subprocess.run(["python3", "review.py", f], capture_output=True, text=True).stdout
        t, ok, q, w = map(int, re.search(r"(\d+) pitches: OK (\d+), QUESTIONABLE (\d+), WRONG (\d+)", out).groups())
        tot.update(pitches=t, ok=ok, q=q, w=w)
        rules.update(eval(re.search(r"flags by rule: (.*)", out).group(1)))
        rows = list(csv.DictReader(open(f)))
        level = rows[0].get("level", "mlb")
        for r in rows:
            kinds[r["kind"]] += 1
            if r["kind"] not in ("FB", "SI", "FC") and r["quad"] == "middle":
                os_mid += 1
            dd = r["detail"]
            if "STRIKEOUT" in dd: pa.update(PA=1, K=1)
            elif "WALK" in dd: pa.update(PA=1, BB=1)
            elif "HIT BY PITCH" in dd: pa.update(PA=1, HBP=1)
            elif "contact:" in dd:
                pa.update(PA=1)
                if any(x in dd for x in ("SINGLE", "DOUBLE", "TRIPLE", "HOME RUN")): pa["H"] += 1
                if "HOME RUN" in dd: pa["HR"] += 1
            pa["R"] += int(r["runs"])
            pa["strikes"] += r["result"] in S
    P, N = tot["pitches"], pa["PA"]
    real = RV[REAL.get(level, "mlb_check")]
    real_h = real["1B"] + real["2B"] + real["3B"] + real["HR"]
    print(f"\n== {d} ({level}, {len(files)} games, {P} pitches, {N} PA)")
    print(f"   calls: clean {tot['ok']/P:.1%}  questionable {tot['q']/P:.1%}  wrong {tot['w']/P:.1%}")
    print(f"   flags per 100 pitches: " + ", ".join(f"{k} {v/P*100:.1f}" for k, v in rules.most_common()))
    print(f"   mix: " + ", ".join(f"{k} {v/P:.0%}" for k, v in kinds.most_common()) + f";  off-speed get-it-over {os_mid/P:.1%} of pitches")
    print(f"   sim  per PA: K {pa['K']/N:.1%}  BB {pa['BB']/N:.1%}  HBP {pa['HBP']/N:.1%}  H {pa['H']/N:.1%}  HR {pa['HR']/N:.1%}  "
          f"runs {pa['R']/N:.3f}  P/PA {P/N:.2f}  strike% {pa['strikes']/P:.0%}")
    print(f"   real per PA: K {real['K']:.1%}  BB {real['BB']:.1%}  HBP {real['HBP']:.1%}  H {real_h:.1%}  HR {real['HR']:.1%}  "
          f"runs {real['R_per_PA']:.3f}" + (f"  P/PA {real['pitches_per_PA']:.2f}" if "pitches_per_PA" in real else ""))
