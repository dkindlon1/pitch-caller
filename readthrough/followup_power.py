"""v0.9 follow-up B (Nov 5 night): does the TRUE_POWER world behave the way item 8 says?
Reads TRUE_POWER game logs (they carry true_w) and, for comparison, the same seeds without true power.
Prints home runs per hard-contact ball in play by true power grade, hard contact per ball in play by grade, and the
totals against the no-power world.
usage (repo root): python3 readthrough/followup_power.py runs/readthrough/v09_in_v09w_tw_tp [more TP dirs] --base DIR [--out FILE]"""
import csv, glob, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BIP = ("weak", "solid", "hard")


def rows(d):
    for f in sorted(glob.glob(os.path.join(d, "*.csv"))):
        for r in csv.DictReader(open(f)):
            yield os.path.basename(f), r


def tally(d, by_w=True):
    t = defaultdict(lambda: [0, 0, 0, 0])      # bucket -> [balls in play, hard, home runs off hard contact, home runs]
    for _, r in rows(d):
        if r["result"] not in BIP:
            continue
        w = float(r["true_w"]) if by_w and r.get("true_w") else None
        b = "all" if w is None else ("w <= 2.5" if w <= 2.5 else "w >= 3.5" if w >= 3.5 else "2.5 < w < 3.5")
        hr = "HOME RUN" in r["detail"].upper()
        for k in {b, "all"}:
            t[k][0] += 1
            t[k][1] += r["result"] == "hard"
            t[k][2] += hr and r["result"] == "hard"
            t[k][3] += hr
    return t


def model_table():
    """The world's own model, grade by grade: hard contact per ball in play (8.2) and HR per hard contact (item 8), for a
    fastball middle at 1-1, an average hitter otherwise. This is the mechanism check; the game samples below are not
    (3 seeds = about 27 distinct hitters, whose skill spread swamps the grade effect)."""
    os.environ.update(STAFF="default", TRUE_POWER="1")
    import engine as e, simulate
    ars = simulate.our_staff()[0]["arsenal"]
    fb = ars[0]
    L = ["World model by true power grade (fastball middle, 1-1; hard/BIP | HR per hard contact | HR per BIP):"]
    for lv in ("hs", "college_d3", "college_d1"):
        cells = []
        for w in (1, 2, 3, 4, 5):
            ts = simulate.true_situation(e.Situation(1, 1, 1, (False,) * 3, inning=4, level=lv, same_side=True),
                                         {"name": "x", "hand": "R", "fb": 0.0, "os": 0.0, "timing": 0.0, "w": w})
            P = e.outcome_probs(fb, "middle", ts, ars)
            dh = e.power_hr_shift(ts, ts.grades)
            bip = P["weak"] + P["solid"] + P["hard"]
            hr = 0.0
            for t, pt in e.type_mix(fb, "middle", "hard").items():
                phr = e.OUT_TABLE[lv]["hard"][t][4]
                hr += pt * (e.sig(e.logit(phr) + dh) if 0 < phr < 1 else phr)
            cells.append(f"w{w} {P['hard'] / bip:5.1%} {hr:5.2%} {P['hard'] / bip * hr:5.2%}")
        L.append(f"  {lv:11s} " + " | ".join(cells))
    return L


def main():
    args = [a for a in sys.argv[1:]]
    out = args[args.index("--out") + 1] if "--out" in args else None
    base = args[args.index("--base") + 1] if "--base" in args else None
    dirs = [a for a in args if not a.startswith("--") and a not in (out, base)]
    L = ["v0.9 follow-up B: the TRUE_POWER world (hidden power grade w ~ N(3,1))", ""] + model_table() + [
        "", "Game samples (descriptive only: confounded by hitter skill, see model_table's note):"]
    L.append(f"{'dir':34s} {'bucket':14s} {'BIP':>6s} {'hard/BIP':>9s} {'HR/hard':>8s} {'HR/BIP':>7s}")
    for d in dirs + ([base] if base else []):
        t = tally(d, by_w=d != base)
        for b in ("w <= 2.5", "2.5 < w < 3.5", "w >= 3.5", "all"):
            if b not in t:
                continue
            n, h, hh, hr = t[b]
            L.append(f"{os.path.basename(d.rstrip('/')):34s} {b:14s} {n:6d} {h / n:9.1%} {hh / max(1, h):8.1%} {hr / n:7.2%}")
        L.append("")
    txt = "\n".join(L)
    print(txt)
    if out:
        open(out, "w").write(txt + "\n")


if __name__ == "__main__":
    main()
