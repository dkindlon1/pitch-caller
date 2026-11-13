"""v1.2 research: what public pitch data (no catcher targets) can say about inside pitching, hit batters and miss lean.
Per level (MLB = data/statcast, A = data/statcast_minors A_*): inside shares by kind x batter side, HBP by where the pitch
crossed, P(HBP | pitch reached the body zone), and a pitcher-frame vs batter-frame split of mean location on 3-0
fastballs (a stand-in for a middle target). usage: python3 -I location_proxies.py <glob> <label> [year]"""
import csv, glob, sys, math
from collections import defaultdict
pat, label = sys.argv[1], sys.argv[2]
year = sys.argv[3] if len(sys.argv) > 3 else None
KIND = {"FF": "FB", "SI": "SI", "FC": "FC", "SL": "SL", "ST": "SL", "SV": "SL", "CU": "CB", "KC": "CB", "CS": "CB",
        "CH": "CH", "FS": "CH", "FO": "CH"}
EDGE = 17 / 6          # in.: the inside third starts 1/6 of the plate from centre
PLATE = 8.5 + 1.45     # in.: past here the ball misses the plate (ball radius)
BODY = 14.0            # in. toward the batter: "reached the body zone" (about 5.5 in. off the plate's edge)
n = defaultdict(int); ins = defaultdict(int); offin = defaultdict(int); body = defaultdict(int); hbp = defaultdict(int)
hbp_body = defaultdict(int); bands = defaultdict(lambda: [0, 0]); pa = 0; hbp_all = 0; pitches = 0
f30 = defaultdict(list)
for f in sorted(glob.glob(pat)):
    with open(f, encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            if year and not r["game_date"].startswith(year): continue
            if r.get("game_type") != "R": continue
            pitches += 1
            if r["events"]:
                pa += 1
                if r["events"] == "hit_by_pitch": hbp_all += 1
            k = KIND.get(r["pitch_type"])
            if not k or not r["plate_x"]: continue
            same = r["stand"] == r["p_throws"]
            x = float(r["plate_x"]) * 12
            xb = x if r["stand"] == "L" else -x              # catcher's view: an LHB stands on the + side
            arm = x if r["p_throws"] == "L" else -x           # arm side +
            key = (k, same)
            n[key] += 1
            hit = r["description"] == "hit_by_pitch"
            if xb > EDGE: ins[key] += 1
            if xb > PLATE: offin[key] += 1
            if xb > BODY:
                body[key] += 1
                hbp_body[key] += hit
            hbp[key] += hit
            b = min(30, max(-30, int(xb // 3) * 3))
            bands[b][0] += 1; bands[b][1] += hit
            if k in ("FB", "SI") and r["balls"] == "3" and r["strikes"] == "0":
                f30[(k, same)].append(arm)
print(f"== {label}{' ' + year if year else ''}: {pitches} pitches, {pa} PA, HBP/PA {hbp_all / max(pa, 1):.4f}, HBP/pitch {hbp_all / max(pitches, 1):.5f}")
print(f"{'kind':4} {'side':5}{'n':>8}{'inside 3rd':>11}{'off in':>8}{'body':>7}{'HBP/pitch':>10}{'P(HBP|body)':>12}{'share of HBP':>13}")
tot_h = sum(hbp.values())
for k in ("FB", "SI", "FC", "SL", "CB", "CH"):
    for same in (True, False):
        key = (k, same); m = n[key]
        if not m: continue
        print(f"{k:4} {'same' if same else 'opp':5}{m:8}{ins[key]/m:11.3f}{offin[key]/m:8.3f}{body[key]/m:7.3f}{hbp[key]/m:10.5f}"
              f"{hbp_body[key]/max(body[key],1):12.3f}{hbp[key]/max(tot_h,1):13.3f}")
B = sum(body.values()); HB = sum(hbp_body.values())
print(f"all kinds: body-zone share {B/sum(n.values()):.4f}, P(HBP | body zone) {HB/max(B,1):.3f}, share of HBPs from the body zone {HB/max(tot_h,1):.3f}")
print("HBP rate by where it crossed (in. toward the batter from plate centre; 3-in. bands):")
print("  " + "  ".join(f"{b:+d}:{v[1]/v[0]:.3f}({v[0]})" for b, v in sorted(bands.items()) if b >= 6 and v[0] > 50))
print("3-0 fastballs, mean crossing on the arm side (+) by batter side (pitcher frame = the part shared by both sides):")
for k in ("FB", "SI"):
    s, o = f30[(k, True)], f30[(k, False)]
    if len(s) > 30 and len(o) > 30:
        ms, mo = sum(s) / len(s), sum(o) / len(o)
        se = math.sqrt(sum((v - ms) ** 2 for v in s) / len(s) ** 2 + sum((v - mo) ** 2 for v in o) / len(o) ** 2)
        print(f"  {k}: same {ms:+.2f} (n {len(s)}), opp {mo:+.2f} (n {len(o)}); pitcher-frame (arm) part {(ms+mo)/2:+.2f} +- {se/2:.2f}; "
              f"batter-frame (inside) part {(ms-mo)/2:+.2f} +- {se/2:.2f}")
