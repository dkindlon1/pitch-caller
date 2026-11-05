"""Tests of the read-through reader (no engine calls). python3 readthrough/test_read.py"""
import csv, os, shutil, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import read as R

fails = 0


def check(ok, msg):
    global fails
    print(("  ok   " if ok else "  FAIL ") + msg)
    fails += not ok


COLS = ["pitch", "inning", "pitcher", "pc", "batter", "hand", "count", "outs", "bases", "score", "call", "kind", "quad", "top3",
        "shakeoffs", "guess", "why", "result", "detail", "big_spot"]


def game(rows):
    """rows: (count, call, kind, quad, result, bases, outs, shakeoffs)"""
    out = []
    for i, (c, call, kind, q, res, bases, outs, sh) in enumerate(rows):
        out.append(dict(pitch=i + 1, inning=1, pitcher="Starter (R)", pc=i + 1, batter="#1", hand="R", count=c, outs=outs,
                        bases=bases, score="0-0", call=call, kind=kind, quad=q, top3="", shakeoffs=sh, guess="", why="",
                        result=res, detail="", big_spot="0"))
    return out


tmp = tempfile.mkdtemp()
try:
    path = os.path.join(tmp, "college_d3_default_s1.csv")
    rows = game([
        ("0-0", "Fastball chase", "FB", "chase", "ball", "---", 0, ""),          # PA 1
        ("1-0", "Slider chase", "SL", "chase", "ball", "---", 0, ""),            # E1
        ("2-0", "Fastball middle", "FB", "middle", "ball", "---", 0, ""),
        ("3-0", "Fastball chase", "FB", "chase", "ball", "---", 0, ""),          # R1
        ("0-0", "Slider down-away", "SL", "down-away", "cstrike", "1--", 0, ""), # PA 2
        ("0-1", "Slider down-away", "SL", "down-away", "foul", "1--", 0, ""),    # S1 (prev was a called strike)
        ("0-2", "Slider down-away", "SL", "down-away", "whiff", "1--", 0, ""),   # S1 again (prev was a foul)
        ("0-0", "Fastball up-in", "FB", "up-in", "whiff", "--3", 1, ""),         # PA 3, elevated with R3 (reported)
        ("0-1", "Fastball up-in", "FB", "up-in", "ball", "--3", 1, "Slider down-away"),   # after a whiff: no S1
        ("1-1", "Changeup middle", "CH", "middle", "ball", "--3", 1, "Changeup middle"),  # R3 re-called shaken-off
        ("2-1", "Fastball up-away", "FB", "up-away", "foul", "--3", 1, ""),
        ("2-2", "Slider chase", "SL", "chase", "foul", "--3", 1, ""),           # R2
        ("2-2", "Fastball middle", "FB", "middle", "ball", "--3", 1, ""),       # two-strike middle (reported)
        ("3-2", "Slider chase", "SL", "chase", "ball", "123", 1, ""),           # E2 (bases loaded label in this row)
    ])
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        w.writerows(rows)
    ps = R.load(path)
    for p in ps:
        p["flags"], p["reported"] = R.checks(p), R.reported(p)
    fl = [p["flags"] for p in ps]
    check([p["pa"] for p in ps] == [0] * 4 + [1] * 3 + [2] * 7, "plate appearances split at each 0-0")
    check(fl[1] == ["E1"], "E1: the first two calls of a PA both off the zone")
    check(fl[3] == ["R1"], "R1: chase at 3-0")
    check(fl[5] == ["S1"] and fl[6] == ["S1"], "S1: same pitch, same spot after a called strike and after a foul")
    check(fl[8] == [], "no S1 after a whiff")
    check("R3" in fl[9], "R3: the call matches one the pitcher shook off")
    check(fl[11] == ["R2"], "R2: chase at 2-2")
    check("E2" in fl[13], "E2: chase at 3-2 with the bases loaded")
    check("elevated_r3" in ps[7]["reported"] and "elevated_r3" not in ps[11]["reported"], "elevated with R3 is reported before two strikes only")
    check("two_strike_middle" in ps[12]["reported"], "two-strike middle is reported, not flagged")
    check(ps[6]["land_thrown"] == 3 and ps[6]["land_strikes"] == 2,
          "landing so far: 3 earlier sliders this game (chase ball, called strike, foul) = 2 strikes of 3")
    check(ps[0]["level"] == "college_d3" and ps[0]["staff"] == "default" and ps[0]["seed"] == 1, "file name parsed into level, staff, seed")
    # the whole pipeline on this file
    d = os.path.join(tmp, "eng")
    os.makedirs(d)
    shutil.copy(path, d)
    s, _ = R.analyze(d, "eng", os.path.join(tmp, "out"))
    check(s["flags"]["R1"] == 1 and s["hard_rule_violations"] == 3, "summary counts the hard-rule flags (R1, R2, R3)")
    check(os.path.exists(os.path.join(tmp, "out", "eng_pack.md")), "review pack written")
    cp = s["count_paths"]
    check(cp["pas"] == 3 and abs(cp["first_pitch_fb"] - 2 / 3) < 1e-9, "count paths: 3 PAs, first-pitch fastball 2 of 3")
finally:
    shutil.rmtree(tmp)

print("all reader checks passed" if not fails else f"{fails} FAILED")
sys.exit(1 if fails else 0)
