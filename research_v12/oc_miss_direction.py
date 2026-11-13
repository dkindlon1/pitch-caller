"""v1.2 research check (Drew, O3: OpenCommand is a research check only; nothing here feeds shipped numbers).
OpenCommand 2025 inferred catcher targets vs Statcast plate location: miss direction by pitch type, in the pitcher's
frame (arm side +) and the batter's frame (toward the batter +). Also how persistent each pitcher's lean is (split-half).
usage: python3 -I oc_miss_direction.py <opencommand_dir> <statcast_dir>"""
import csv, glob, gzip, os, sys, random, math
from collections import defaultdict
oc, sc = sys.argv[1], sys.argv[2]
# batter side from Statcast (majority stand; a switch hitter bats opposite the pitcher)
stand = defaultdict(lambda: defaultdict(int))
for f in glob.glob(os.path.join(sc, "sc_202*.csv")):
    with open(f, encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            if r["batter"]: stand[r["batter"]][r["stand"]] += 1
def side_of(bid, phand):
    d = stand.get(bid)
    if not d: return None
    if d.get("L", 0) and d.get("R", 0) and min(d["L"], d["R"]) / (d["L"] + d["R"]) > 0.1:
        return "L" if phand == "R" else "R"
    return max(d, key=d.get)
info = {}
with gzip.open(os.path.join(oc, "pbp_info.csv.gz"), "rt") as fh:
    for r in csv.DictReader(fh):
        info[r["play_id"]] = r
KIND = {"FF": "FB", "SI": "SI", "FC": "FC", "SL": "SL", "ST": "SL", "SV": "SL", "CU": "CB", "KC": "CB", "CS": "CB",
        "CH": "CH", "FS": "CH", "FO": "CH"}
rows = []
with gzip.open(os.path.join(oc, "targets.csv.gz"), "rt") as fh:
    for r in csv.DictReader(fh):
        if r["status"] != "ok" or r["plausible"] != "True" or not r[os.environ.get("OC_T", "inferred") + "_x_in"]: continue
        p = info.get(r["play_id"])
        if not p or p["game_type"] != "R" or p["pitch_type"] not in KIND: continue
        ph = "L" if float(p["x0"]) > 0 else "R"
        bs = side_of(str(int(float(p["batter_id"]))) if p["batter_id"] else "", ph)
        if bs is None: continue
        arm = 1 if ph == "L" else -1                     # catcher's-view x: RHP arm side is negative
        T = os.environ.get("OC_T", "inferred"); tx, tz = float(r[T + "_x_in"]), float(r[T + "_z_in"])
        dx, dz = float(r["plate_x_in"]) - tx, float(r["plate_z_in"]) - tz
        same = bs == ph
        inside = 1 if same else -1                       # arm side is inside to a same-side hitter
        # target's side in the pitcher's frame: + arm side of plate centre (x = 0) by > 3 in., - glove side, 0 middle
        ts = arm * tx
        tside = "arm" if ts > 3 else "glove" if ts < -3 else "mid"
        rows.append(dict(k=KIND[p["pitch_type"]], pt=p["pitch_type"], pid=p["pitcher_id"], same=same, mx=arm * dx, mz=dz,
                         tside=tside, tz=tz, tx_arm=ts, desc=p["description"], px_arm=arm * float(r["plate_x_in"])))
print("pitches", len(rows))
def mean(v): return sum(v) / len(v)
def sd(v): m = mean(v); return math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1))
def q(v, p): v = sorted(v); return v[int(p * (len(v) - 1))]
print("\nmiss vector (plate - inferred target), inches; mx + = arm side, mz + = up")
print(f"{'kind':5}{'n':>8}{'mean mx':>9}{'se':>6}{'mean mz':>9}{'sd mx':>7}{'sd mz':>7}{'p10 mx':>8}{'p90 mx':>8}  share of |mx|>6 that is arm side")
for k in ("FB", "SI", "FC", "SL", "CB", "CH"):
    v = [r for r in rows if r["k"] == k]
    mx = [r["mx"] for r in v]; mz = [r["mz"] for r in v]
    big = [x for x in mx if abs(x) > 6]
    print(f"{k:5}{len(v):8}{mean(mx):9.2f}{sd(mx)/math.sqrt(len(mx)):6.2f}{mean(mz):9.2f}{sd(mx):7.2f}{sd(mz):7.2f}{q(mx,.1):8.1f}{q(mx,.9):8.1f}  {sum(1 for x in big if x>0)/len(big):.3f}")
print("\nby target side (pitcher frame) x batter side: mean mx (arm +), mean mz, n")
for k in ("FB", "SI", "FC", "SL", "CB", "CH"):
    out = []
    for ts in ("arm", "mid", "glove"):
        for same in (True, False):
            v = [r for r in rows if r["k"] == k and r["tside"] == ts and r["same"] == same]
            if len(v) > 200: out.append(f"{ts}/{'same' if same else 'opp'} {mean([r['mx'] for r in v]):+.2f},{mean([r['mz'] for r in v]):+.2f} n{len(v)}")
    print(k, " | ".join(out))
print("\npersistence: per pitcher x kind (n >= 120), split-half (odd/even pitches) correlation of mean mx and mean mz")
for k in ("FB", "SI", "FC", "SL", "CB", "CH"):
    g = defaultdict(list)
    for r in rows:
        if r["k"] == k: g[r["pid"]].append(r)
    a, b, c, d, nn, means = [], [], [], [], [], []
    for pid, v in g.items():
        if len(v) < 120: continue
        o, e = v[0::2], v[1::2]
        a.append(mean([r["mx"] for r in o])); b.append(mean([r["mx"] for r in e]))
        c.append(mean([r["mz"] for r in o])); d.append(mean([r["mz"] for r in e])); nn.append(len(v))
        means.append(mean([r["mx"] for r in v]))
    def cor(x, y):
        mx_, my_ = mean(x), mean(y)
        return sum((i - mx_) * (j - my_) for i, j in zip(x, y)) / math.sqrt(sum((i - mx_) ** 2 for i in x) * sum((j - my_) ** 2 for j in y))
    if len(a) > 10:
        r1, r2 = cor(a, b), cor(c, d)
        half = mean(nn) / 2
        # Spearman-Brown: reliability of a half; K (pitches) at which shrinkage is 50%: n_half*(1-r)/r
        kx = half * (1 - r1) / r1 if r1 > 0 else float("inf"); kz = half * (1 - r2) / r2 if r2 > 0 else float("inf")
        print(f"{k}: pitchers {len(a)}, median n {sorted(nn)[len(nn)//2]}, r(mx) {r1:.2f}, r(mz) {r2:.2f}; "
              f"implied K mx {kx:.0f}, mz {kz:.0f} pitches; SD of pitcher mean mx {sd(means):.2f} in (p10 {q(means,.1):+.1f}, p90 {q(means,.9):+.1f})")
