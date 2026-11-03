"""Run N simulated games with the current engine and summarize the checker's grades.
usage: python3 batch.py <tag> <first_seed> <n>"""
import csv, io, os, re, subprocess, sys, contextlib
from collections import Counter
import simulate

tag, first, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
os.makedirs(tag, exist_ok=True)
tot = Counter()
pa = Counter()
starter_sl, starter_n, runs, fb, fb_behind, nb, guess_fb, guess_mem = 0, 0, [], 0, 0, 0, [], []
for seed in range(first, first + n):
    path = f"{tag}/game_{seed}.csv"
    with contextlib.redirect_stdout(io.StringIO()):
        _, _, (them, us, tr, ur), _ = simulate.run(seed, path)
    out = subprocess.run(["python3", "review.py", path], capture_output=True, text=True).stdout
    m = re.search(r"(\d+) pitches: OK (\d+), QUESTIONABLE (\d+), WRONG (\d+)", out)
    t, ok, q, w = map(int, m.groups())
    tot.update(pitches=t, ok=ok, q=q, w=w)
    g = re.search(r"by-count memory (\d+)%, always-fastball (\d+)%", out)
    guess_mem.append(int(g.group(1))); guess_fb.append(int(g.group(2)))
    rows = list(csv.DictReader(open(path)))
    st = [r for r in rows if r["pitcher"].startswith("Starter")]
    starter_n += len(st); starter_sl += sum(r["kind"] == "SL" for r in st)
    fb += sum(r["kind"] == "FB" for r in rows)
    beh = [r for r in rows if int(r["count"][0]) > int(r["count"][2]) and r["count"][2] != "2"]
    nb += len(beh); fb_behind += sum(r["kind"] == "FB" for r in beh)
    runs.append(tr)
    for r in rows:
        d = r["detail"]
        if "STRIKEOUT" in d: pa.update(PA=1, K=1)
        elif "WALK" in d: pa.update(PA=1, BB=1)
        elif "HIT BY PITCH" in d: pa.update(PA=1, HBP=1)
        elif "contact:" in d:
            pa.update(PA=1, BIP=1)
            if any(x in d for x in ("SINGLE", "DOUBLE", "TRIPLE", "HOME RUN")): pa["H"] += 1
            if "HOME RUN" in d: pa["HR"] += 1
        pa["R"] += int(r["runs"])
    rules = re.search(r"flags by rule: (.*)", out).group(1)
    print(f"seed {seed}: {t} pitches, wrong {w}, questionable {q}, runs allowed {tr}, always-FB guess {g.group(2)}%  {rules}")
P = tot["pitches"]
print(f"\n{tag} over {n} games: {P} pitches")
print(f"  clean {tot['ok']/P:.1%}  questionable {tot['q']/P:.1%}  wrong {tot['w']/P:.1%}")
print(f"  fastball share {fb/P:.0%}  (in hitter's counts {fb_behind/nb:.0%})")
print(f"  starter slider share {starter_sl/starter_n:.0%}")
print(f"  'always fastball' guess right {sum(guess_fb)/n:.0f}% avg; by-count memory guess {sum(guess_mem)/n:.0f}% avg")
print(f"  runs allowed per game {sum(runs)/n:.1f}")
N = pa["PA"]
print(f"  per PA: K {pa['K']/N:.1%}  BB {pa['BB']/N:.1%}  HBP {pa['HBP']/N:.1%}  H {pa['H']/N:.1%}  HR {pa['HR']/N:.1%}  "
      f"runs {pa['R']/N:.3f}  pitches/PA {P/N:.2f}  (n={N} PA)")
