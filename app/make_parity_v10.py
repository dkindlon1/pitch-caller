"""v1.0 Phase 1.3: generate Python/JS parity cases for the SHIPPED call path.

The old app/make_parity.py checks the v0.7c functions (mixed_policy, at_bat_values, call_mixed), which Phase 2
deletes. This one checks what the app actually runs: the solved at-bat table, the root policy, the root costs and the
hitter's sit mix.

usage (repo root): python3 app/make_parity_v10.py [N]   -> writes app/parity_v10_cases.json (gitignored)
then:              node app/parity_v10.js               -> recomputes in JS and compares at 1e-9

Situations are generated and serialized through golden/cases.py (fuzz_lib arsenals and situations, plus v0.9's
matchup records), so the JSON shape is the one app/engine.js already reads in golden_v09.js. Coverage per the plan:
levels, arsenals, counts, bases, landing, grades, crowding and the coach-rule inputs (matchup, hitter damage).
`history` joins this list in Phase 3.1, and the at-bat plan in Phase 3.8; both are noted below.
"""
import json, os, random, sys
from dataclasses import replace

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path[:0] = [os.path.join(ROOT, "golden"), ROOT]
import engine as e                                            # noqa: E402
import cases as G                                             # noqa: E402
import fuzz_lib as F                                          # noqa: E402

OUT = os.path.join(HERE, "parity_v10_cases.json")
SEED = 20261109                                               # different from the golden's 20261105
LEVELS = ["hs", "travel", "college_d3", "college_d1", "mlb"]
K = lambda a: f"{a[0]}|{a[1]}"


def inputs(n):
    F.rng.seed(SEED)
    rng = random.Random(SEED + 1)
    out = []
    for i in range(n):
        ars = F.rand_arsenal()
        s = F.rand_situation(ars)
        vfb = max(x.mph() for x in ars if x.kind == "FB")
        s = replace(
            s, level=rng.choice(LEVELS),
            look=(round(rng.uniform(0.86, 1.02) * vfb, 2), round(rng.uniform(1.8, 3.2), 2)) if rng.random() < 0.7 else None,
            familiar={c: rng.randint(0, 12) for c in ("FB", "OS") if rng.random() < 0.6},
            crowding=rng.random() < 0.25,
            grades={g: rng.randint(1, 5) for g in "cwd" if rng.random() < 0.6} or None,
            ump_u=round(rng.uniform(-0.8, 0.8), 2) if rng.random() < 0.5 else 0.0,
            radar={x.name: round(x.mph() - rng.uniform(0, 3), 1) for x in ars if rng.random() < 0.2},
            infield_in=rng.random() < 0.15, pitch_cap=rng.choice([85, 105]),
            home=rng.choice([True, False, None]), sched_innings=rng.choice([None, 7, 9]),
            extras_runner=rng.random() < 0.3,
            catcher_block=rng.randint(2, 4))
        s = replace(
            s,
            usage_by_call={(p.name, q): rng.randint(0, 2) for p in ars for q in e.targets(s.balls, s.strikes)
                           if rng.random() < 0.10},
            b_h=e.lean_b_h(ars, s, tuple(rng.choice(["FB", "OS"]) for _ in range(rng.randint(0, 2)))),
            steal={"a": rng.choice([0.04, 0.10]), "runner": 1 if s.bases[0] else 2,
                   "t": rng.choice([None, 1.3, 1.6])} if (s.bases[0] or s.bases[1]) and rng.random() < 0.5 else None)
        # v1.0 3.1: this at-bat's history, with `last` kept equal to history[-1][:3] as the plan requires.
        # Exercises RP1 (the same exact call twice already), RP2 (a foul read "back") and RP3 (fouls leaning the
        # hitter), including the stand-down paths.
        hist = ()
        if rng.random() < 0.55:
            rows = []
            for _ in range(rng.randint(1, 3)):
                hp = rng.choice(ars)
                rows.append([hp.name, rng.choice(e.QUADS), rng.choice(["ball", "cstrike", "whiff", "foul"]),
                             rng.choice([None, "back", "pull", "opposite", "front", "late", "fooled"])])
            if rng.random() < 0.35 and rows:                 # make an exact repeat likely enough to hit RP1
                rows.append(list(rows[-1]))
            hist = tuple(tuple(r) for r in rows)
            s = replace(s, history=hist, last=tuple(hist[-1][:3]))
        d = dict(arsenal=[G.pdict(p) for p in ars], s=G.sdict(s))
        d["s"]["history"] = [list(r) for r in hist]
        # v0.9 item 6, the coach-rule input CR1 reads in Phase 3.5
        mm = {}
        if rng.random() < 0.6:
            for kk in sorted({p["kind"] for p in d["arsenal"]}):
                if rng.random() < 0.6:
                    mm[f"succ|{kk}"] = rng.randint(1, 4)
                if rng.random() < 0.5:
                    mm[f"hard|{kk}|{rng.choice(e.QUADS)}"] = rng.randint(1, 3)
        d["s"]["matchup"] = mm or None
        out.append(d)
    return out


def from_dicts(c):
    """Same split golden_v09.py uses: matchup is applied only when non-empty."""
    d = dict(c)
    s = dict(c["s"])
    mm = s.pop("matchup", None)
    d["s"] = s
    ars, sit = G.from_dicts(d)
    if sit.history:
        sit = replace(sit, history=tuple(tuple(r) for r in sit.history))
    return ars, (replace(sit, matchup=mm) if mm else sit)


def bk(bn):
    return "none" if bn is None else f"{bn[0]},{bn[1]}"


def compute(c):
    ars, s = from_dicts(c)
    s = replace(s, win=e.win_constants(s)) if s.home is not None else s
    tab = e.solve_table(ars, replace(s, balls=0, strikes=0, last=None))
    s = replace(s, look=s.look or tab.h0)
    pi, sg, full, res, M = e.root_call(ars, s, tab)
    r = {
        "h0": list(tab.h0),
        "sweeps": tab.sweeps,
        "policy": {K(a): v for a, v in pi.items()},
        "full": {K(a): v for a, v in full.items()},
        "root_costs": {K(a): v for a, v in e.root_costs(ars, s, tab).items()},
        "sigma": {K(a): v for a, v in sg.items()},
        "residual": res,
        "allowed": sorted(K(a) for a in e.allowed_calls(ars, s)),
        # the plan asks for the table at 0-0 and 1-1
        "tableV": {f"{b}-{k}": {bk(bn): v for bn, v in tab.V[(b, k)].items()} for (b, k) in ((0, 0), (1, 1))},
        "tableN": {f"{b}-{k}": {bk(bn): v for bn, v in tab.N[(b, k)].items()} for (b, k) in ((0, 0), (1, 1))},
    }
    return r


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    cs = inputs(n)
    for i, c in enumerate(cs):
        c["out"] = compute(c)
        if (i + 1) % 50 == 0:
            print(i + 1, flush=True)
    json.dump(cs, open(OUT, "w", encoding="utf-8"))
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(cs)} cases")


if __name__ == "__main__":
    main()
