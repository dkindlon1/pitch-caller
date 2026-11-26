import json, os, math, glob
P, Q = "C:/dev/pitchiq-data-final/p8/sims", "C:/dev/pitchiq-data-final/edge/sims"
def load(d): return {json.load(open(f))["seed"]: json.load(open(f)) for f in glob.glob(d + "/game_*.json")}
print("| W=32 − W=4, engine-called (paired seeds) | runs / game | K | BB | HBP |"); print("|---|---|---|---|---|")
for lv in ("mlb", "college_d1", "college_d2", "college_d3", "hs"):
    A, B = load(f"{Q}/{lv}__base"), load(f"{P}/{lv}__base")
    s = sorted(set(A) & set(B)); n = len(s)
    d = [B[x]["runs"] - A[x]["runs"] for x in s]; m = sum(d) / n
    se = math.sqrt(sum((v - m) ** 2 for v in d) / (n - 1) / n)
    def rd(k):
        # paired ratio difference, linearized, game-clustered
        ra = sum(A[x][k] for x in s) / sum(A[x]["PA"] for x in s); rb = sum(B[x][k] for x in s) / sum(B[x]["PA"] for x in s)
        mp = sum(A[x]["PA"] + B[x]["PA"] for x in s) / (2 * n)
        z = [(B[x][k] - rb * B[x]["PA"]) - (A[x][k] - ra * A[x]["PA"]) for x in s]
        mz = sum(z) / n
        return f"{100*(rb-ra):+.1f} ± {100*math.sqrt(sum((v-mz)**2 for v in z)/(n-1)/n)/mp:.1f}"
    print(f"| {lv} ({n}) | {m:+.2f} ± {se:.2f} | {rd('K')} | {rd('BB')} | {rd('HBP')} |")
