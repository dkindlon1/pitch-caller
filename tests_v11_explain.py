"""v1.1 Step 3: the why line and the intent label say what the engine actually did (replaces tests_v10_explain.py).
  python3 tests_v11_explain.py [N]     (N full-solve golden cases, default 60)

Over the first N full-solve cases of golden/golden_v10.json, plus setup cases built here (one per built rule):
  1. The named term's Delta is the minimum of the eligible terms (look value and the setup term are not eligible; a call
     credited by a setup rule names its setup instead), and negative; a no-term line only when no eligible term is negative.
  2. Comparator: b*, the allowed call with the lowest myopic cost, or, when the drawn call is b*, the next-lowest.
  3. Three-ball counts: no look value term, and a term's Delta is re-priced myopically.
  4. "Set up by" exactly when a setup rule credits the drawn call; the intent is "Payoff" exactly when that holds under
     two strikes (at two strikes Finish / Expand keep their label); no "Setup" label or "Sets up" line is left anywhere.
  5. The eye-level line agrees with the sign of beta_E (and so does the intent mechanism text).
  6. Each built rule fires on its own setup case and names that setup ("Set up by the X spot: Y spot"); the setup term's
     Delta is what zeroing SETUP_RULE takes away; the same case without the setup (or failing a check) gives no credit.
  7. Python and JS agree on the why line and intent, as called and with the drawn pitch shaken off, on golden and setup
     cases.
"""
import json, os, subprocess, sys
from dataclasses import replace, asdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "golden")]
import engine as e                                   # noqa: E402
import cases as G8                                   # noqa: E402
import golden_v09 as G9                              # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 60
FAILS = []


def check(name, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""))
    if not ok:
        FAILS.append(name)


TEMPLATES = (("He's timed", "timing"), ("Stays at his eye level", "eye level"), ("Changes his eye level", "eye level"),
             ("He's seen", "familiarity"), ("He's sitting", "sit"), ("He's looking", "sit"), ("Tying run", "situation"),
             ("Game situation", "situation"), ("Today's umpire", "umpire"), ("Runner may go", "running game"),
             ("Matches this hitter", "grades"), ("Back to what", "repeat"), ("Tunnels off", "tunneling"),
             ("Set up by", "setup"), ("Best call", None), ("Mixed in", None), ("Only call", None))


def term_of(line):
    for pre, t in TEMPLATES:
        if line.startswith(pre):
            return t
    raise ValueError(f"unknown why template: {line}")


def cost(ars, s, tab, x, sigma, myopic):
    by = {p.name: p for p in ars}
    look = s.look or tab.h0
    return sum(sigma[k] * e.cost08(by[x[0]], x[1], s, ars, tab, look, ("pure",) + k, myopic=myopic)[0]
               for k in e.sit_options(ars) if sigma[k] > 1e-4)


def solve(ars, s):
    s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
    return s_w, e.solve_table(ars, replace(s_w, balls=0, strikes=0, last=None, pa_log=()))


P = lambda n, k, sh, cmd=3, v=None: e.Pitch(n, k, 3, cmd, 0.75, shape=sh, velo=v)
E0 = (False, False, False)
# one setup case per built rule: (rule, arsenal, situation, the payoff call to check, the case without the setup)
SETUP_CASES = [
    ("S1", [P("Fastball", "FB", "rides", v=90), P("Curve", "CB", "12-6"), P("Changeup", "CH", "split")],
     e.Situation(0, 1, 1, E0, level="college_d3", pa_log=(("Fastball", "up-in", "cstrike", None, None, None),)), ("Curve", "down-away")),
    ("S2", [P("Sinker", "SI", "run", v=89), P("Slider", "SL", "sweeper"), P("Changeup", "CH", "fade")],
     e.Situation(1, 1, 1, E0, level="college_d3", same_side=True, pa_log=(("Sinker", "down-in", "ball", (3, 0, True), None, None),
                                                                          ("Sinker", "up-in", "cstrike", None, None, None))), ("Slider", "down-away")),
    ("S3", [P("Fastball", "FB", "", v=89), P("Cutter", "FC", "hard"), P("Changeup", "CH", "fade")],
     e.Situation(0, 1, 1, E0, level="college_d3", same_side=False, pa_log=(("Cutter", "down-in", "cstrike", None, None, None),)),
     ("Changeup", "down-away")),
    ("S4", [P("Fastball", "FB", "", v=89), P("Slider", "SL", "tight"), P("Changeup", "CH", "fade", v=80)],
     e.Situation(1, 1, 1, E0, level="college_d3", pa_log=(("Fastball", "down-away", "ball", (3, 4, True), None, None),
                                                          ("Fastball", "up-away", "foul", None, None, "opposite"))), ("Changeup", "down-away")),
    ("S6", [P("Fastball", "FB", "", v=88), P("Curve", "CB", ""), P("Changeup", "CH", "fade")],
     e.Situation(0, 1, 1, E0, level="college_d3", pa_log=(("Curve", "down-away", "cstrike", None, None, None),)), ("Fastball", "up-in")),
    ("S7", [P("Fastball", "FB", "rides", v=91), P("Slider", "SL", "tight"), P("Changeup", "CH", "fade")],
     e.Situation(1, 2, 1, E0, level="college_d3", pa_log=(("Fastball", "up-in", "whiff", None, None, "late"),
                                                          ("Slider", "down-away", "ball", None, None, None))), ("Fastball", "chase")),
]


def main():
    full = [c for c in json.load(open(os.path.join(HERE, "golden", "golden_v10.json"))) if c["full"]]
    rows = []
    for c in full[:N]:
        ars, s = G9.from_dicts(c)
        s, tab = solve(ars, s)
        rows.append((ars, s, tab))
    for _, ars, s, _ in SETUP_CASES:
        s2, tab = solve(ars, s)
        rows.append((ars, s2, tab))
    R = []
    for ars, s, tab in rows:
        pick, dist, tab, info = e.call_v08(ars, s, rng=G8.Half(), tab=tab)
        line, deltas, comp = e.why_line(ars, s, tab, pick, info)
        lab = e.intent_label(ars, s, tab, pick, info)
        R.append(dict(ars=ars, s=s, tab=tab, pick=pick, info=info, line=line, deltas=deltas, comp=comp, lab=lab))
    print(f"{N} golden cases + {len(SETUP_CASES)} setup cases")

    bad = []
    for i, r in enumerate(R):
        t, d = term_of(r["line"]), r["deltas"]
        elig = {k: v for k, v in d.items() if k not in ("look value", "setup")}
        if t == "setup":
            continue
        if t is None:
            if elig and min(elig.values()) < -1e-6 and not r["line"].startswith("Only"):
                bad.append(f"case {i}: no-term line but {min(elig, key=elig.get)} = {min(elig.values()):.2e}")
        elif d[t] > min(elig.values()) or d[t] >= -1e-6:
            bad.append(f"case {i}: names {t} ({d[t]:.2e}) but min is {min(elig, key=elig.get)} ({min(elig.values()):.2e})")
    check("1. named term has the smallest eligible Delta (look value and setup not eligible)", not bad, "; ".join(bad[:3]) or f"{len(R)} lines")

    bad = []
    for i, r in enumerate(R):
        M, sg = r["info"]["M"], r["info"]["sigma"]
        a = (r["pick"][0].name, r["pick"][1])
        cmy = {x: cost(r["ars"], r["s"], r["tab"], x, sg, True) for x in M}
        bstar = min(M, key=lambda x: cmy[x])
        want = bstar if bstar != a else min((x for x in M if x != a), key=lambda x: cmy[x], default=None)
        if r["comp"] != want:
            bad.append(f"case {i}: comparator {r['comp']} want {want}")
    check("2. comparator is b* (or the next-lowest myopic cost when the call is b*)", not bad, "; ".join(bad[:3]))

    three = [r for r in R if r["s"].balls == 3 and r["comp"] is not None]
    bad = []
    for r in three:
        if "look value" in r["deltas"]:
            bad.append("look value present")
        a, b, sg = (r["pick"][0].name, r["pick"][1]), r["comp"], r["info"]["sigma"]
        base = cost(r["ars"], r["s"], r["tab"], a, sg, True) - cost(r["ars"], r["s"], r["tab"], b, sg, True)
        saved = {k: e.P08[k] for k in ("beta_T", "gamma_T")}
        try:
            e.P08.update(beta_T=0.0, gamma_T=0.0)
            off = cost(r["ars"], r["s"], r["tab"], a, sg, True) - cost(r["ars"], r["s"], r["tab"], b, sg, True)
        finally:
            e.P08.update(saved)
        if abs((base - off) - r["deltas"]["timing"]) > 1e-12:
            bad.append(f"timing Delta {r['deltas']['timing']:.3e} vs myopic {base - off:.3e}")
    check("3. three-ball counts: no look value, terms re-priced myopically", three and not bad,
          "; ".join(bad[:3]) or f"{len(three)} three-ball cases")

    bad, n_pay = [], 0
    for i, r in enumerate(R):
        sp = e.setup_payoff(r["pick"][0], r["pick"][1], r["s"], r["ars"]) if r["s"].pa_log else (0.0, None, None)
        credited = sp[0] > 0 and sp[1] != "N2"
        pay = r["lab"][0] == "Payoff"
        n_pay += pay
        if r["line"].startswith("Set up by") != credited:
            bad.append(f"case {i}: line '{r['line']}' credit {sp}")
        if pay != (credited and r["s"].strikes < 2 and r["s"].balls < 3):
            bad.append(f"case {i}: label {r['lab'][0]} credit {sp}")
        if credited and r["s"].strikes == 2 and r["lab"][0] not in ("Finish", "Expand"):
            bad.append(f"case {i}: two strikes, label {r['lab'][0]}")
        if r["lab"][0] == "Setup" or "Sets up" in r["line"] or "Sets up" in r["lab"][2]:
            bad.append(f"case {i}: dead Setup text")
    check("4. 'Set up by' exactly when a rule credits the call; 'Payoff' exactly then under two strikes; no 'Setup' left",
          not bad, "; ".join(bad[:3]) or f"{n_pay} Payoff labels")

    eye = [r["line"] for r in R if term_of(r["line"]) == "eye level"]
    want = "Stays at his eye level" if e.P08["beta_E"] < 0 else "Changes his eye level"
    check("5. eye-level line agrees with sign(beta_E)", eye and all(x.startswith(want) for x in eye)
          and e.intent_mech_text("eye level") == ("it stays at his eye level" if e.P08["beta_E"] < 0 else "it changes his eye level"),
          f"beta_E = {e.P08['beta_E']:.3f}, {len(eye)} eye-level lines")

    bad, fired, dropped = [], [], []
    for rule, ars, s, call in SETUP_CASES:
        s2, tab = solve(ars, s)
        p = next(x for x in ars if x.name == call[0])
        v, got, ent = e.setup_payoff(p, call[1], s2, ars)
        if e.SETUP_RULE.get(rule, 0.0) == 0.0:      # v1.2 Step 5 (L7): a dropped rule (size 0) credits nothing and names no setup
            pick, dist, tab, info = e.call_v08(ars, s2, rng=G8.Half(), tab=tab)
            line = e.why_line(ars, s2, tab, (p, call[1]), info)[0]
            if (got == rule and v != 0) or line.startswith("Set up by"):
                bad.append(f"{rule} (dropped): credit {v}, why '{line}'")
            dropped.append(rule)
            continue
        if got != rule or v <= 0:
            bad.append(f"{rule}: setup_payoff gave {got} {v}")
            continue
        fired.append(rule)
        pick, dist, tab, info = e.call_v08(ars, s2, rng=G8.Half(), tab=tab)
        line = e.why_line(ars, s2, tab, (p, call[1]), info)[0]
        want_line = f"Set up by the {ent[0].lower()} {ent[1]}: {p.name.lower()} {call[1]}"
        if line != want_line:
            bad.append(f"{rule}: why '{line}' want '{want_line}'")
        nope = e.setup_payoff(p, call[1], replace(s2, pa_log=()), ars)[0]
        squared = (ent[:4] + ("hard", ent[5]),)               # the same setup pitch, hit hard
        if nope != 0.0 or e.setup_payoff(p, call[1], replace(s2, pa_log=squared), ars)[1] == rule:
            bad.append(f"{rule}: fires without its setup or after hard contact")
        lab = e.intent_label(ars, s2, tab, (p, call[1]), info)[0]
        if lab != ("Payoff" if s2.strikes < 2 else ("Expand" if call[1] == "chase" else "Finish")):
            bad.append(f"{rule}: intent {lab}")
    check("6. each built rule fires on its setup case, names that setup and is labeled Payoff (Finish / Expand at two "
          "strikes); silent without it or when it was squared up (v1.2: a rule dropped to size 0 names no setup)",
          not bad and len(fired) + len(dropped) == len(SETUP_CASES), "; ".join(bad[:3]) or f"rules {fired}, dropped {dropped}")

    k = min(20, N)
    setup_in = [dict(arsenal=[asdict(x) for x in ars], s=dict(asdict(s), pa_log=[list(z) for z in s.pa_log]))
                for _, ars, s, _ in SETUP_CASES]
    bad = []
    for tag_in, idxs, extra in (("golden", range(k), []), ("setup", range(N, N + len(SETUP_CASES)), ["-"])):
        out = subprocess.run([os.environ.get("NODE", "node"), os.path.join(HERE, "golden", "explain_twin.js"), str(k)] + extra,
                             input=json.dumps(setup_in) if extra else None, capture_output=True, text=True, cwd=HERE)
        if out.returncode != 0:
            bad.append(out.stderr.strip()[:300])
            continue
        js = json.loads(out.stdout)
        for i, j in zip(idxs, js):
            r = R[i]
            for tag, ex in (("plain", None), ("shaken", {r["pick"][0].name})):
                if j[tag] is None:
                    continue
                if ex:
                    pick, _, _, info = e.call_v08(r["ars"], r["s"], rng=G8.Half(), exclude=ex, tab=r["tab"])
                else:
                    pick, info = r["pick"], r["info"]
                py = dict(pick=[pick[0].name, pick[1]], why=e.why_line(r["ars"], r["s"], r["tab"], pick, info, ex)[0],
                          intent=list(e.intent_label(r["ars"], r["s"], r["tab"], pick, info, ex)))
                for key in py:
                    if py[key] != j[tag][key]:
                        bad.append(f"{tag_in} case {i} {tag} {key}: py {py[key]} js {j[tag][key]}")
    check("7. Python and JS agree (why, intent; shaken-off path), golden and setup cases", not bad,
          "; ".join(bad[:3]) or f"{k} golden + {len(SETUP_CASES)} setup cases x 2")

    print(f"{7 - len(FAILS)}/7 checks pass")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
