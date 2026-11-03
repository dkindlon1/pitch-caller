"""
Reason-check every call in a simulated game.

Each pitch gets OK / QUESTIONABLE / WRONG from baseball rules a good pitching coach would apply.
The engine never sees these rules; they are an outside check on its calls.

WRONG (a good coach wouldn't call it):
  W1  chase pitch at 3-0 or 3-1 (walk risk, no reason to expand)
  W2  "middle" at 0-2 or 1-2 (grooving when ahead). 2-2 is not flagged: attack the zone (Drew, v0.6)
  W3  called a pitch below the confidence cutoff (engine bug)
  W4  re-called the exact pitch the pitcher just shook off
  W5  picked an option worse than the "never pick" window (engine bug)
  W6  off-speed "middle" with 3 balls and fewer than 2 strikes... see Q2 (kept as questionable)
QUESTIONABLE (defensible, but a good coach would usually do something else):
  Q1  off-speed up in the zone (hanger risk)
  Q2  off-speed "middle" (get it over) when that pitch is NOT landing for strikes today
      (Drew's rule, v0.6: "if the off-speed gets it over, then get it over").
      Landing = estimated strike rate 55%+ for that pitch today: (0.60 x 5 + strikes) / (5 + thrown),
      i.e. a typical 60% until today's results say otherwise.
  Q3  off-speed at 3-0
  Q4  chase at 3-2
  Q5  chase off-speed with a runner on 3rd, fewer than 2 outs, and fewer than 2 strikes (dirt ball scores a run)
  Q6  fastball in the zone to a hitter the engine has already seen crush fastballs (est. damage > 0.4, 3+ looks)
  Q7  4th straight pitch of the same type to the same hitter (readable)
Predictability is graded separately in predictability().
"""
import csv
import sys
from collections import Counter, defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else "game_2026.csv"
rows = list(csv.DictReader(open(path)))

OS = {"SL", "CB", "CH"}
verdicts = []
prev = None
streak = 0
landing_today = defaultdict(lambda: [0, 0])     # (pitcher, pitch) -> [strikes, thrown] before this pitch
STRIKE_RESULTS = {"cstrike", "whiff", "foul", "weak", "solid", "hard"}


def gets_it_over(r):
    s, n = landing_today[(r["pitcher"], r["call"].rsplit(" ", 1)[0])]
    est = (0.60 * 5 + s) / (5 + n)        # shrink toward a typical 60% strike rate, worth 5 pitches
    return est >= 0.55, s, n


for r in rows:
    b, k = map(int, r["count"].split("-"))
    kind, quad = r["kind"], r["quad"]
    flags = []
    if quad == "chase" and (b, k) in ((3, 0), (3, 1)):
        flags.append(("WRONG", "W1 chase at " + r["count"]))
    if quad == "middle" and k == 2 and b < 2:      # v0.6: Drew -- attack the zone at 2-2
        flags.append(("WRONG", "W2 grooved at " + r["count"]))
    if float(r["conf"]) < float(r["cutoff"]) - 1e-9 and not r["shakeoffs"] and int(r.get("trusted") or 1) > 0:
        flags.append(("WRONG", f"W3 called below confidence cutoff ({r['conf']})"))
    if r["shakeoffs"]:
        last_shake = r["shakeoffs"].split(" | ")[-1]
        if last_shake == r["call"]:
            flags.append(("WRONG", "W4 re-called the pitch he just shook off"))
    try:
        from engine import run_scale
        _k = run_scale(r["level"]) if r.get("level") else 1.0
    except Exception:
        _k = 1.0
    if float(r["runs_vs_best"]) > 0.0301 * _k:
        flags.append(("WRONG", f"W5 outside pick window (+{r['runs_vs_best']})"))
    if kind in OS and quad.startswith("up"):
        flags.append(("QUESTIONABLE", "Q1 off-speed up (hanger risk)"))
    over, s_, n_ = gets_it_over(r)
    if kind in OS and quad == "middle" and not over:
        flags.append(("QUESTIONABLE", f"Q2 off-speed get-it-over, not landing today ({s_}/{n_} strikes)"))
    if kind in OS and (b, k) == (3, 0):
        flags.append(("QUESTIONABLE", "Q3 off-speed at 3-0"))
    if quad == "chase" and (b, k) == (3, 2):
        flags.append(("QUESTIONABLE", "Q4 chase at 3-2"))
    if kind in OS and quad == "chase" and "3" in r["bases"] and int(r["outs"]) < 2 and k < 2:
        flags.append(("QUESTIONABLE", "Q5 dirt-ball risk, runner on 3rd"))
    if kind == "FB" and quad != "chase" and float(r["est_dmg"]) > 0.4 and int(r.get("est_n", 0)) >= 3:
        flags.append(("QUESTIONABLE", f"Q6 fastball in zone to a fastball masher (est {r['est_dmg']})"))
    if quad == "chase" and (b, k) in ((0, 0), (1, 0), (2, 0), (2, 1)):
        flags.append(("QUESTIONABLE", f"Q8 chase pitch at {r['count']}"))
    if kind in OS and quad == "middle" and (b, k) == (3, 2) and not over:
        flags.append(("QUESTIONABLE", "Q9 off-speed get-it-over at 3-2, not landing today"))
    same_hitter = prev is not None and prev["batter"] == r["batter"] and prev["inning"] == r["inning"]
    streak = streak + 1 if (same_hitter and prev["kind"] == kind) else 1
    if streak >= 4:
        flags.append(("QUESTIONABLE", f"Q7 {streak} straight {kind} to {r['batter']}"))
    prev = r
    key_ = (r["pitcher"], r["call"].rsplit(" ", 1)[0])
    landing_today[key_][1] += 1
    landing_today[key_][0] += r["result"] in STRIKE_RESULTS
    if r.get("override") == "1":
        flags = []        # the coach's own call, not the engine's: not graded
    level = "WRONG" if any(f[0] == "WRONG" for f in flags) else ("QUESTIONABLE" if flags else "OK")
    verdicts.append((r, level, flags))


def predictability():
    """Could a smart dugout guess the next pitch type?
    Guesser A: most common type we've thrown in this exact count so far (game memory).
    Guesser B: always fastball.  Guesser C: same type as the last pitch to this hitter."""
    seen = defaultdict(Counter)
    hits_a = hits_b = hits_c = n = 0
    last_to = {}
    for r in rows:
        c, kind = r["count"], r["kind"]
        if seen[c]:
            n += 1
            guess = seen[c].most_common(1)[0][0]
            hits_a += guess == kind
            hits_b += kind == "FB"
            hits_c += last_to.get((r["batter"], r["inning"])) == kind
        seen[c][kind] += 1
        last_to[(r["batter"], r["inning"])] = kind
    by_bucket = defaultdict(Counter)
    for r in rows:
        b, k = map(int, r["count"].split("-"))
        bucket = "2 strikes" if k == 2 else ("behind (hitter's count)" if b > k else ("ahead" if k > b else "even"))
        by_bucket[bucket][r["kind"]] += 1
    return hits_a / n, hits_b / n, hits_c / n, n, by_bucket


if __name__ == "__main__":
    cnt = Counter(v[1] for v in verdicts)
    total = len(verdicts)
    print(f"{total} pitches: OK {cnt['OK']}, QUESTIONABLE {cnt['QUESTIONABLE']}, WRONG {cnt['WRONG']}")
    rule_counts = Counter(f[1].split()[0] for _, _, fl in verdicts for f in fl)
    print("flags by rule:", dict(rule_counts))
    a, b_, c_, n, buckets = predictability()
    print(f"guess next pitch type: by-count memory {a:.0%}, always-fastball {b_:.0%}, same-as-last {c_:.0%} (n={n})")
    for bk, c in buckets.items():
        tot = sum(c.values())
        print(f"  {bk:24} " + ", ".join(f"{k} {v/tot:.0%}" for k, v in c.most_common()) + f"  (n={tot})")
    print("\nPITCH LOG (every call)")
    for r, level, flags in verdicts:
        mark = {"OK": "  ", "QUESTIONABLE": "? ", "WRONG": "X "}[level]
        sh = f" [shook off {r['shakeoffs']}]" if r["shakeoffs"] else ""
        print(f"{mark}{r['pitch']:>3} i{r['inning']} {r['batter']}{r['hand']} {r['count']} o{r['outs']} {r['bases']:3} "
              f"{r['call']:<20} p={float(r['pick_prob']):.2f} conf={r['conf']}{sh} -> {r['detail'] or r['result']}"
              + (f"   <{'; '.join(f[1] for f in flags)}>" if flags else ""))
