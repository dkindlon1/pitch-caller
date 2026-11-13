"""v1.2 research (hitter model): which hitter traits carry from one season to the next?
Season leaderboards (data/leaderboards/, Savant): swing tilt, attack angle, attack direction, pull %, opposite %, zone and
chase swing %. Pitch sample (data/statcast/, every 4th day): early-count (0-0, 1-0, 0-1) in-zone swing rate minus his
other in-zone swing rate, and hard contact (95+ mph) on off-speed vs on fastballs. Year-to-year correlation, hitters in
both years. usage: python3 -I research_v12/hitter_persistence.py"""
import csv, glob, os, math
from collections import defaultdict
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def cor(x, y):
    mx, my = sum(x) / len(x), sum(y) / len(y)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y)); sx = sum((a - mx) ** 2 for a in x); sy = sum((b - my) ** 2 for b in y)
    return sxy / math.sqrt(sx * sy)
def load(name, y, key, cols):
    out = {}
    with open(os.path.join(ROOT, "data", "leaderboards", f"{name}_{y}.csv"), encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            try: out[r[key]] = {c: float(r[c]) for c in cols}
            except (ValueError, KeyError): pass
    return out
print("== season leaderboards (year-to-year r, n hitters)")
P = {y: load("path", y, "id", ["swing_tilt", "attack_angle", "attack_direction", "avg_bat_speed"]) for y in (2024, 2025, 2026)}
C = {y: load("custom", y, "player_id", ["pull_percent", "opposite_percent", "z_swing_percent", "oz_swing_percent"]) for y in (2024, 2025, 2026)}
for src, cols in ((P, ["swing_tilt", "attack_angle", "attack_direction", "avg_bat_speed"]), (C, ["pull_percent", "opposite_percent", "z_swing_percent", "oz_swing_percent"])):
    for c in cols:
        out = []
        for a, b in ((2024, 2025), (2025, 2026)):
            ids = [i for i in src[a] if i in src[b]]
            if len(ids) > 30:
                out.append(f"{a}->{b} r {cor([src[a][i][c] for i in ids], [src[b][i][c] for i in ids]):.2f} (n {len(ids)})")
        print(f"  {c:20} " + " | ".join(out))
print("== pitch sample (every 4th day), 2024 -> 2025")
FB = {"FF", "SI", "FC"}; OS = {"SL", "ST", "SV", "CU", "KC", "CS", "CH", "FS", "FO"}
SW = {"swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play", "foul_bunt", "missed_bunt"}
stat = {y: defaultdict(lambda: defaultdict(float)) for y in ("2024", "2025")}
for f in glob.glob(os.path.join(ROOT, "data", "statcast", "sc_*.csv")):
    with open(f, encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            y = r["game_date"][:4]
            if y not in stat or r["game_type"] != "R": continue
            d = stat[y][r["batter"]]
            if r["zone"] and r["zone"].isdigit() and int(r["zone"]) <= 9:
                early = (r["balls"], r["strikes"]) in (("0", "0"), ("1", "0"), ("0", "1"))
                k = "e" if early else "o"
                d[k + "n"] += 1; d[k + "s"] += r["description"] in SW
            if r["description"] == "hit_into_play" and r["launch_speed"]:
                cls = "fb" if r["pitch_type"] in FB else "os" if r["pitch_type"] in OS else None
                if cls:
                    d[cls + "n"] += 1; d[cls + "h"] += float(r["launch_speed"]) >= 95
def trait(d, which):
    if which == "approach" and d["en"] >= 40 and d["on"] >= 40: return d["es"] / d["en"] - d["os"] / d["on"]
    if which == "os_hard" and d["osn"] >= 15 and d["fbn"] >= 15: return d["osh"] / d["osn"] - d["fbh"] / d["fbn"]
    if which == "os_hard_abs" and d["osn"] >= 15: return d["osh"] / d["osn"]
    return None
for which, label in (("approach", "early-count zone swing minus other zone swing"), ("os_hard", "off-speed hard% minus fastball hard%"), ("os_hard_abs", "off-speed hard% (95+)")):
    a, b = [], []
    for bid, d in stat["2024"].items():
        if bid in stat["2025"]:
            x, z = trait(d, which), trait(stat["2025"][bid], which)
            if x is not None and z is not None: a.append(x); b.append(z)
    if len(a) > 30: print(f"  {label:48} r {cor(a, b):.2f} (n {len(a)})")
