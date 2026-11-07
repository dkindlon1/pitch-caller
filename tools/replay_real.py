"""v1.0 Phase 8: replay charted games through the engine and compare what it predicted with what happened.
  python3 tools/replay_real.py BACKUP.json [--out results/replay_<tag>]
BACKUP is the app's backup export (db.js exportAll: {"stores": {"games", "events", "pitchers", ...}}) or a plain list of
event objects. Each logged pitch carries the situation and arsenal it was called in (`sit`, `ars`) and the hitter's sit
mix the engine used (`v08.sigma`), so its prediction is rebuilt exactly: engine.outcome_probs for the pitch thrown at the
target called. Reports, with binomial SEs:
  - balls (incl. wild pitches), called strikes, whiffs, fouls, contact and HBP: overall and by call (fastball / off-speed
    x corner, middle, chase)
  - walks, strikeouts and HBP per batter: actual, against the engine's expectation (sum over 3-ball pitches of P(ball),
    over 2-strike pitches of P(strike), over all pitches of P(hbp))
  - how the app's learner would have moved each grade (tools/replay_learner.js: learned value, SD, what it would serve)
Reads only the file it's given (no Supabase)."""
import json, math, os, subprocess, sys
from dataclasses import fields

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import engine as e

SIT_FIELDS = {f.name for f in fields(e.Situation)}
PITCH_FIELDS = {f.name for f in fields(e.Pitch)}
CATS = ("ball", "cstrike", "whiff", "foul", "contact", "hbp")


def to_situation(sd):
    d = {k: v for k, v in sd.items() if k in SIT_FIELDS and v is not None}
    d.pop("win", None)                     # outcome probabilities don't use the win objective
    d.pop("sit_sigma", None)
    d["bases"] = tuple(bool(x) for x in d.get("bases", (False, False, False)))
    for k in ("last", "look"):
        if d.get(k) is not None:
            d[k] = tuple(d[k])
    if "history" in d:
        d["history"] = tuple(tuple(h) for h in d["history"])
    for k in ("landing_today", "hitter_damage"):
        if k in d:
            d[k] = {a: tuple(v) for a, v in d[k].items()}
    return e.Situation(**d)


def to_arsenal(ars):
    out = []
    for x in ars:
        d = {k: v for k, v in x.items() if k in PITCH_FIELDS}
        if "release_offset_in" in d:
            d["release_offset_in"] = tuple(d["release_offset_in"])
        out.append(e.Pitch(**d))
    return out


def actual(ev):
    r = ev.get("res")
    if r == "play":
        return "contact"
    return r if r in CATS else None


def group(kind, q):
    return ("FB" if kind == "FB" else "OS") + " " + ("chase" if q == "chase" else "middle" if q == "middle" else "corner")


def load(path):
    doc = json.load(open(path))
    evs = doc if isinstance(doc, list) else (doc.get("stores") or {}).get("events", [])
    return [x for x in evs if not x.get("deletedAt") and x.get("type") != "play" and x.get("sit") and x.get("ars")]


def main():
    path = sys.argv[1]
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    evs = load(path)
    tot = {"all": {"n": 0, **{f"p_{c}": 0.0 for c in CATS}, **{f"a_{c}": 0 for c in CATS}}}
    pa = dict(batters=0, bb=0, k=0, hbp=0, e_bb=0.0, e_k=0.0, e_hbp=0.0)
    skipped = 0
    for ev in evs:
        a = actual(ev)
        if a is None:
            skipped += 1
            continue
        try:
            s = to_situation(ev["sit"])
            ars = to_arsenal(ev["ars"])
            name = ev.get("thrown") or ev.get("pitchName")
            p = next(x for x in ars if x.name == name)
            sg = (ev.get("v08") or {}).get("sigma")
            sit = ("mix", {tuple(k.rsplit("|", 1)): v for k, v in sg.items()}) if sg else None
            P = e.outcome_probs(p, ev["quad"], s, ars, sit=sit)
        except Exception:
            skipped += 1
            continue
        pr = {"ball": P["ball"] + P["wp_ball"], "cstrike": P["cstrike"], "whiff": P["whiff"], "foul": P["foul"],
              "contact": P["weak"] + P["solid"] + P["hard"], "hbp": P["hbp"]}
        for gk in ("all", group(p.kind, ev["quad"])):
            t = tot.setdefault(gk, {"n": 0, **{f"p_{c}": 0.0 for c in CATS}, **{f"a_{c}": 0 for c in CATS}})
            t["n"] += 1
            for c in CATS:
                t[f"p_{c}"] += pr[c]
            t[f"a_{a}"] += 1
        if s.balls == 3:
            pa["e_bb"] += pr["ball"]
        if s.strikes == 2:
            pa["e_k"] += pr["cstrike"] + pr["whiff"]
        pa["e_hbp"] += pr["hbp"]
        end = ev.get("paEnd")
        if end or ev.get("end"):
            pa["batters"] += 1
        if end in ("walk", "bb"):
            pa["bb"] += 1
        elif end in ("k", "strikeout"):
            pa["k"] += 1
        elif end == "hbp":
            pa["hbp"] += 1
    L = [f"Replay of {os.path.basename(path)}: {tot['all']['n']} pitches ({skipped} skipped: no usable result or snapshot), "
         f"{pa['batters']} batters", "",
         "Outcome rates per pitch, engine prediction vs what happened (actual - predicted, in SEs of a binomial at the prediction):",
         f"  {'call':12s}{'n':>6s}" + "".join(f"{c:>22s}" for c in CATS)]
    flags = []
    for gk in ["all"] + sorted(k for k in tot if k != "all"):
        t = tot[gk]
        n = t["n"]
        row = f"  {gk:12s}{n:6d}"
        for c in CATS:
            pp, aa = t[f"p_{c}"] / n, t[f"a_{c}"] / n
            se = math.sqrt(max(pp * (1 - pp), 1e-9) / n)
            z = (aa - pp) / se
            row += f"{100 * pp:9.1f}% {100 * aa:5.1f}% {z:+5.1f}"
            if abs(z) >= 3 and n >= 50:
                flags.append(f"{gk} {c}: engine {pp:.1%}, actual {aa:.1%} ({z:+.1f} SE, n {n})")
        L.append(row)
    b = max(1, pa["batters"])
    L += ["", f"Per batter ({pa['batters']} batters): walks {pa['bb'] / b:.1%} actual vs {pa['e_bb'] / b:.1%} expected, "
          f"strikeouts {pa['k'] / b:.1%} vs {pa['e_k'] / b:.1%}, HBP {pa['hbp'] / b:.1%} vs {pa['e_hbp'] / b:.1%}"]
    L += ["", "Gaps of 3+ SE (n >= 50): " + ("; ".join(flags) if flags else "none")]
    try:
        lr = json.loads(subprocess.run(["node", os.path.join(HERE, "replay_learner.js"), path], capture_output=True, text=True,
                                       check=True).stdout.strip().splitlines()[-1])
        L += ["", "What the app's learner would do with these games (coach's grade -> learned +- SD; what it would serve):"]
        for pt in lr:
            for x in pt["pitches"]:
                if not x["learned"]:
                    continue
                L.append(f"  {pt['pitcher']} {x['name']}: command {x['coach']['command']} -> {x['learned']['command']:.2f} "
                         f"+- {x['sd']['command']:.2f} (served {x['served']['command']:.2f}), stuff {x['coach']['grade']} -> "
                         f"{x['learned']['grade']:.2f} +- {x['sd']['grade']:.2f} (served {x['served']['grade']:.2f}); "
                         f"{x['n']} pitches, {x['nLoc']} located{'; SWITCHED OFF' if x['switchedOff'] else ''}")
    except Exception as ex:
        lr = None
        L += ["", f"Learner step failed: {ex}"]
    txt = "\n".join(L) + "\n"
    print(txt)
    if out:
        open(out + ".txt", "w").write(txt)
        json.dump(dict(totals=tot, per_batter=pa, flags=flags, learner=lr), open(out + ".json", "w"), indent=1)


if __name__ == "__main__":
    main()
