"""v0.9 follow-up B (Nov 5 night): does the TRUE_POWER world behave the way item 8 says?
Reads TRUE_POWER game logs (they carry true_w) and, for comparison, the same seeds without true power.
Prints home runs per hard-contact ball in play by true power grade, hard contact per ball in play by grade, and the
totals against the no-power world.
usage (repo root): python3 readthrough/followup_power.py runs/readthrough/v09_in_v09w_tw_tp [more TP dirs] --base DIR [--out FILE]"""
import csv, glob, os, sys
from collections import defaultdict

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


def main():
    args = [a for a in sys.argv[1:]]
    out = args[args.index("--out") + 1] if "--out" in args else None
    base = args[args.index("--base") + 1] if "--base" in args else None
    dirs = [a for a in args if not a.startswith("--") and a not in (out, base)]
    L = ["v0.9 follow-up B: the TRUE_POWER world (hidden power grade w ~ N(3,1))", ""]
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
