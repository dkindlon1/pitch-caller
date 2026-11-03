"""Summarize the test matrix: one row per setup. usage: python3 matrix/report.py"""
import csv, glob, json, os, re, subprocess, sys
from collections import Counter, defaultdict

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
RV = json.load(open("college_run_values.json"))
REAL = {"mlb": "mlb_check", "college_d1": "college_d1", "college_d3": "college_d3", "hs": "hs"}
S = {"cstrike", "whiff", "foul", "weak", "solid", "hard"}
tags = [l.split()[0] for l in open("matrix/configs.txt") if l.strip()]
rows_out = []
print(f"{'setup':20}{'games':>6}{'clean':>7}{'wrong':>7}  {'top flags /100':24}{'K':>6}{'BB':>6}{'H':>6}{'R/PA':>7}{'real':>7}{'FB?':>5}{'mem?':>5}{'info':>6}{'mix':>6}  masher gap 1st->3rd")
for tag in tags:
    files = sorted(glob.glob(f"matrix/{tag}/game_*.csv"))
    if not files:
        print(f"{tag:20}  (no games)"); continue
    tot, rules, pa = Counter(), Counter(), Counter()
    guess_fb, guess_mem, info, mix, npitch = [], [], 0.0, 0.0, 0
    masher = defaultdict(lambda: [0, 0])
    level = None
    for f in files:
        out = subprocess.run(["python3", "review.py", f], capture_output=True, text=True).stdout
        t, ok, q, w = map(int, re.search(r"(\d+) pitches: OK (\d+), QUESTIONABLE (\d+), WRONG (\d+)", out).groups())
        tot.update(p=t, ok=ok, q=q, w=w)
        rules.update(eval(re.search(r"flags by rule: (.*)", out).group(1)))
        g = re.search(r"by-count memory (\d+)%, always-fastball (\d+)%", out)
        guess_mem.append(int(g.group(1))); guess_fb.append(int(g.group(2)))
        rows = list(csv.DictReader(open(f)))
        level = rows[0]["level"]
        mash = {r["batter"] for r in rows if r["kind"] == "FB" and float(r["true_dmg"]) > 0.4}
        trip = Counter()
        for r in rows:
            npitch += 1
            info += float(r.get("regret_info") or 0); mix += float(r.get("regret_mix") or 0)
            d = r["detail"]
            ended = True
            if "STRIKEOUT" in d: pa.update(PA=1, K=1)
            elif "WALK" in d: pa.update(PA=1, BB=1)
            elif "HIT BY PITCH" in d: pa.update(PA=1, HBP=1)
            elif "contact:" in d:
                pa.update(PA=1)
                if any(x in d for x in ("SINGLE", "DOUBLE", "TRIPLE", "HOME RUN")): pa["H"] += 1
            else:
                ended = False
            pa["R"] += int(r["runs"])
            key = (r["batter"] in mash, min(trip[r["batter"]] + 1, 3))   # fastball share: mashers vs everyone else, by time up
            masher[key][0] += r["kind"] == "FB"; masher[key][1] += 1
            if ended:
                trip[r["batter"]] += 1
    # fastball share to mashers, 1st trip vs 3rd+ trip (pooled over games is fine: same hitter ids differ by game, so key by file)
    P, N = tot["p"], pa["PA"]
    real = RV[REAL[level]]
    real_h = real["1B"] + real["2B"] + real["3B"] + real["HR"]
    def gap(tr):
        (a, b), (c, d) = masher[(True, tr)], masher[(False, tr)]
        return f"{100 * (a / b - c / d):+.0f}" if b and d else "-"
    top = ", ".join(f"{k} {v / P * 100:.1f}" for k, v in rules.most_common(3))
    print(f"{tag:20}{len(files):>6}{tot['ok'] / P:>7.1%}{tot['w'] / P:>7.1%}  {top:24}{pa['K'] / N:>6.1%}{pa['BB'] / N:>6.1%}{pa['H'] / N:>6.1%}"
          f"{pa['R'] / N:>7.3f}{real['R_per_PA']:>7.3f}{sum(guess_fb) / len(guess_fb):>4.0f}%{sum(guess_mem) / len(guess_mem):>4.0f}%"
          f"{100 * info / npitch:>6.2f}{100 * mix / npitch:>6.2f}  {gap(1)} -> {gap(3)}")
print("\nclean/wrong: share of the engine's calls the checker passes or marks wrong (coach overrides not graded)")
print("K, BB, H, R/PA: simulated per plate appearance; real = the level's real runs per PA")
print("FB?: how often 'always fastball' guesses the pitch type; mem?: how often a by-count memory guess is right")
print("info / mix: runs lost per 100 pitches to not knowing the hitter / paid for staying unpredictable")
print("masher gap: fastball share to true fastball mashers minus share to everyone else, in points, first vs third time up")
