"""v1.0 Step 4 (#3): the why line and the intent label say what the engine actually did.
  python3 tests_v10_explain.py [N]     (N full-solve golden cases, default 60)

Checks, over the first N full-solve cases of golden/golden_v10.json:
  1. The named term's Delta is the minimum of the eligible terms (look value is eligible only for a Setup), and negative;
     a no-term line only when no eligible term is negative.
  2. Comparator: b*, the allowed call with the lowest myopic cost (computed here from cost08), or, when the drawn call is
     b*, the next-lowest myopic cost.
  3. Three-ball counts: no look value term, and a term's Delta is re-priced myopically (recomputed here from cost08).
  4. "Sets up" in the why line exactly when the intent label is Setup; never "Sets up" beside "Best strike here".
  5. The eye-level line agrees with the sign of the fitted coefficient beta_E (and so does the intent mechanism text).
  6. The setup line names the engine's actual top call at the next count, computed here independently with call_v08.
     Setup is rare at the shipped noise margin (INTENT_E), so this check sets INTENT_E = 0, scans golden cases for calls
     where look value reverses the myopic order and requires at least one Setup line; the next-count helper itself is also
     checked on every drawn call with fewer than two strikes and three balls.
  7. Python and JS agree on the why line, intent and next-count top call, as called and with the drawn pitch shaken off.
"""
import json, os, subprocess, sys
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "golden")]
import engine as e                                   # noqa: E402
import cases as G8                                   # noqa: E402
import golden_v09 as G9                              # noqa: E402  (from_dicts with the matchup applied)

N = int(sys.argv[1]) if len(sys.argv) > 1 else 60
SETUP_SCAN = 250                     # check 6 scans this many full-solve cases for calls where look value reverses the
SETUP_NEED = 1                       # myopic order (Setup at INTENT_E = 0), stopping once it has this many
FAILS = []


def check(name, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""))
    if not ok:
        FAILS.append(name)


TEMPLATES = (("He's timed", "timing"), ("Sets up", "look value"), ("Stays at his eye level", "eye level"),
             ("Changes his eye level", "eye level"), ("He's seen", "familiarity"), ("He's sitting", "sit"),
             ("He's looking", "sit"), ("Tying run", "situation"), ("Game situation", "situation"),
             ("Today's umpire", "umpire"), ("Runner may go", "running game"), ("Matches this hitter", "grades"),
             ("Back to what", "repeat"), ("Tunnels off", "tunneling"), ("Best call", None), ("Mixed in", None),
             ("Only call", None))


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


def setup_case(c):
    ars, s = G9.from_dicts(c)
    s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
    tab = e.solve_table(ars, replace(s_w, balls=0, strikes=0, last=None))
    return ars, s_w, tab


def next_situation(ars, s, tab, p, q, sigma):
    """Written out here rather than imported: the count after a count-keeping strike on (p, q)."""
    look = s.look or tab.h0
    P = e.outcome_probs(p, q, replace(s, look=look), ars, sit=("mix", sigma))
    res = max(("cstrike", "whiff", "foul"), key=lambda r: P[r])
    seen = dict(s.hitter_seen or {})
    seen[p.name] = seen.get(p.name, 0) + 1
    land = dict(s.landing_today or {})
    if q != "chase":
        st, ex, n = e.landing_triple(p, land.get(p.name)) or (0, 0.0, 0)
        land[p.name] = (st + 1, ex + e.expected_strike(p, q, s, ars), n + 1)
    return replace(s, strikes=s.strikes + 1, look=e.look_update(look, p, q, s), last=(p.name, q, res), hitter_seen=seen,
                   landing_today=land, usage_this_count={}, usage_by_call={})


def main():
    full = [c for c in json.load(open(os.path.join(HERE, "golden", "golden_v10.json"))) if c["full"]]
    rows = []
    for c in full[:N]:
        ars, s, tab = setup_case(c)
        pick, dist, tab, info = e.call_v08(ars, s, rng=G8.Half(), tab=tab)
        line, deltas, comp = e.why_line(ars, s, tab, pick, info)
        lab = e.intent_label(ars, s, tab, pick, info)
        rows.append(dict(ars=ars, s=s, tab=tab, pick=pick, info=info, line=line, deltas=deltas, comp=comp, lab=lab))
    print(f"{len(rows)} golden cases")

    bad = []
    for i, r in enumerate(rows):
        t, d = term_of(r["line"]), r["deltas"]
        elig = {k: v for k, v in d.items() if k != "look value" or r["lab"][0] == "Setup"}
        if t is None:
            if elig and min(elig.values()) < -1e-6 and not r["line"].startswith("Only"):
                bad.append(f"case {i}: no-term line but {min(elig, key=elig.get)} = {min(elig.values()):.2e}")
        elif r["lab"][0] != "Setup" and (d[t] > min(elig.values()) or d[t] >= -1e-6):
            bad.append(f"case {i}: names {t} ({d[t]:.2e}) but min is {min(elig, key=elig.get)} ({min(elig.values()):.2e})")
    check("1. named term has the smallest eligible Delta", not bad, "; ".join(bad[:3]) or f"{len(rows)} lines")

    bad = []
    for i, r in enumerate(rows):
        M, sg = r["info"]["M"], r["info"]["sigma"]
        a = (r["pick"][0].name, r["pick"][1])
        cmy = {x: cost(r["ars"], r["s"], r["tab"], x, sg, True) for x in M}
        bstar = min(M, key=lambda x: cmy[x])
        want = bstar if bstar != a else min((x for x in M if x != a), key=lambda x: cmy[x], default=None)
        if r["comp"] != want:
            bad.append(f"case {i}: comparator {r['comp']} want {want}")
    check("2. comparator is b* (or the next-lowest myopic cost when the call is b*)", not bad, "; ".join(bad[:3]))

    three = [r for r in rows if r["s"].balls == 3 and r["comp"] is not None]
    bad = []
    for i, r in enumerate(three):
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

    bad = [i for i, r in enumerate(rows) if r["line"].startswith("Sets up") != (r["lab"][0] == "Setup")
           or (r["line"].startswith("Sets up") and r["lab"][2].startswith("Best strike here"))]
    n_setup = sum(r["lab"][0] == "Setup" for r in rows)
    check("4. 'Sets up' exactly when the intent is Setup; never beside 'Best strike here'", not bad,
          f"cases {bad[:5]}" if bad else f"{n_setup} Setup at the shipped margin")

    eye = [r["line"] for r in rows if term_of(r["line"]) == "eye level"]
    want = "Stays at his eye level" if e.P08["beta_E"] < 0 else "Changes his eye level"
    check("5. eye-level line agrees with sign(beta_E)", eye and all(x.startswith(want) for x in eye)
          and e.intent_mech_text("eye level") == ("it stays at his eye level" if e.P08["beta_E"] < 0 else "it changes his eye level"),
          f"beta_E = {e.P08['beta_E']:.3f}, {len(eye)} eye-level lines")

    saved_e = e.INTENT_E
    found, bad = 0, []
    try:
        e.INTENT_E = 0.0
        used = []
        for idx in range(min(SETUP_SCAN, len(full))):
            if found >= SETUP_NEED:
                break
            if full[idx]["s"]["balls"] == 3 or full[idx]["s"]["strikes"] == 2:
                continue
            ars, s, tab = setup_case(full[idx])
            _, dist, tab, info = e.call_v08(ars, s, rng=G8.Half(), tab=tab)
            sg = info["sigma"]
            cmy = {x: e._root_cost_one(ars, s, tab, x, sg, True) for x in info["M"]}
            cfu = {x: e._root_cost_one(ars, s, tab, x, sg) for x in info["M"]}
            bs = min(info["M"], key=lambda x: cmy[x])
            for d in dist:
                pick = (d[2], d[3])
                x = (d[2].name, d[3])
                if not (cmy[x] > cmy[bs] and cfu[x] < cfu[bs]):     # cheap pre-filter: only these can be Setup
                    continue
                lab = e.intent_label(ars, s, tab, pick, info)
                if lab[0] != "Setup":
                    continue
                found += 1
                used.append(idx)
                line = e.why_line(ars, s, tab, pick, info)[0]
                sn = next_situation(ars, s, tab, d[2], d[3], info["sigma"])
                top = e.call_v08(ars, sn, rng=G8.Half(), tab=tab)[1][0]
                want = f"Sets up the {top[2].name.lower()} {top[3]}"
                if line != want or not lab[2].startswith(want + ","):
                    bad.append(f"case {idx} {d[2].name} {d[3]}: why '{line}', intent '{lab[2]}', engine next top '{want}'")
    finally:
        e.INTENT_E = saved_e
    # and the helper itself, on the drawn call of every 0-1 strike, 0-2 ball case: next_count_top is the engine's own top
    # call at the next count (call_v08 on the situation built here)
    nct = 0
    for r in rows:
        if r["s"].balls == 3 or r["s"].strikes == 2:
            continue
        p_, q_ = r["pick"][0], r["pick"][1]
        sn = next_situation(r["ars"], r["s"], r["tab"], p_, q_, r["info"]["sigma"])
        top = e.call_v08(r["ars"], sn, rng=G8.Half(), tab=r["tab"])[1][0]
        got = e.next_count_top(r["ars"], r["s"], r["tab"], r["pick"], r["info"])
        nct += 1
        if got != (top[2].name, top[3]):
            bad.append(f"next_count_top {got} vs engine next top {(top[2].name, top[3])}")
    check("6. setup line names the engine's actual next-count top call", found >= 1 and nct >= 10 and not bad,
          "; ".join(bad[:3]) or f"{found} Setup line(s) at INTENT_E = 0 (golden full-solve cases {sorted(set(used))}); "
          f"next_count_top = the engine's next-count top on {nct} drawn calls")

    k = min(20, len(rows))
    out = subprocess.run([os.environ.get("NODE", "node"), os.path.join(HERE, "golden", "explain_twin.js"), str(k)],
                         capture_output=True, text=True, cwd=HERE)
    if out.returncode != 0:
        check("7. Python and JS agree (why, intent, next-count top; shaken-off path)", False, out.stderr.strip()[:300])
    else:
        js, bad = json.loads(out.stdout), []
        for i, (r, j) in enumerate(zip(rows[:k], js)):
            for tag, ex in (("plain", None), ("shaken", {r["pick"][0].name})):
                if j[tag] is None:
                    continue
                if ex:
                    pick, _, _, info = e.call_v08(r["ars"], r["s"], rng=G8.Half(), exclude=ex, tab=r["tab"])
                else:
                    pick, info = r["pick"], r["info"]
                py = dict(pick=[pick[0].name, pick[1]], why=e.why_line(r["ars"], r["s"], r["tab"], pick, info, ex)[0],
                          intent=list(e.intent_label(r["ars"], r["s"], r["tab"], pick, info, ex)),
                          next=list(e.next_count_top(r["ars"], r["s"], r["tab"], pick, info, ex)))
                for key in py:
                    if py[key] != j[tag][key]:
                        bad.append(f"case {i} {tag} {key}: py {py[key]} js {j[tag][key]}")
        check("7. Python and JS agree (why, intent, next-count top; shaken-off path)", not bad,
              "; ".join(bad[:3]) or f"{k} cases x 2")

    print(f"{7 - len(FAILS)}/7 checks pass" if not FAILS else f"FAIL: {len(FAILS)} of 7")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
