"""v1.0 parity cases (PLAN_v1.0.md 1.3): random situations through the shipped Python call path, for app/parity_v10.js.
  python3 app/make_parity_v10.py [N=200]  -> app/parity_v10_cases.json (gitignored)
Covers levels, arsenals, counts, bases, at-bat history, landing, hitter grades and coach-rule inputs (matchup, power).
Per case: the full call distribution (share and cost per call), the root costs, the root sigma, the table's values and
sigma at 0-0 and 1-1, and the at-bat plan once the engine has one."""
import json, os, random, sys
from dataclasses import fields, replace

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import engine as e

OUT = os.path.join(HERE, "parity_v10_cases.json")
HAS_HISTORY = "history" in {f.name for f in fields(e.Situation)}
LEVELS = ["mlb", "college_d1", "college_d3", "hs", "travel"]
ARS = json.load(open(os.path.join(ROOT, "callsheet_arsenals.json")))
ARS.pop("_note", None)
RESULTS = ["ball", "cstrike", "whiff", "foul"]
READS = [None, "back", "pull", "opposite", "front", "late", "fooled"]


def rand_case(rng):
    an = rng.choice(list(ARS))
    ars_d = []
    for d in ARS[an]:
        d = dict(d)
        if rng.random() < 0.5:
            d["grade"] = rng.randint(1, 5)
        if rng.random() < 0.4:
            d["command"] = rng.randint(1, 5)
        d["conf"] = round(rng.uniform(0.3, 0.95), 3) if rng.random() < 0.7 else d["conf"]
        if rng.random() < 0.2:
            d["strike_rate"] = round(rng.uniform(0.45, 0.75), 3)
        ars_d.append(d)
    names = [d["name"] for d in ars_d]
    kinds = {d["name"]: d["kind"] for d in ars_d}
    b, k = rng.randint(0, 3), rng.randint(0, 2)
    hist = []
    if b + k > 0 and rng.random() < 0.7:          # history consistent with the count: balls, then strikes (fouls/whiffs)
        res = ["ball"] * b + [rng.choice(["cstrike", "whiff", "foul"]) for _ in range(k)]
        rng.shuffle(res)
        if k == 2 and rng.random() < 0.4:
            res.append("foul")                     # a two-strike foul keeps the count
        for r in res:
            n, q = rng.choice(names), rng.choice(e.QUADS)
            if hist and rng.random() < 0.35:
                n, q = hist[-1][0], hist[-1][1]   # repeats, so RP1/RP2 get exercised
            rd = rng.choice(READS) if r in ("foul", "whiff") else None
            hist.append([n, q, r, rd])
    level = rng.choice(LEVELS)
    s = dict(balls=b, strikes=k, outs=rng.randint(0, 2), bases=[rng.random() < 0.35 for _ in range(3)],
             inning=rng.randint(1, 9), margin=rng.randint(-3, 3), pitch_count=rng.randint(0, 110),
             batters_faced=rng.randint(0, 27), level=level, same_side=rng.random() < 0.6,
             catcher_block=rng.randint(2, 4), home=rng.choice([True, False, None]))
    if rng.random() < 0.5:
        s["landing_today"] = {n: [st, st + rng.randint(0, 10)] for n in names if rng.random() < 0.6
                              for st in [rng.randint(0, 6)]}
    if rng.random() < 0.4:
        s["grades"] = {g: rng.randint(1, 5) for g in ("w", "c", "d") if rng.random() < 0.7} or {"w": 4}
    if rng.random() < 0.35:
        mm = {}
        for n in names:
            if rng.random() < 0.5:
                mm[f"succ|{kinds[n]}"] = rng.randint(1, 4)
            if rng.random() < 0.5:
                mm[f"hard|{kinds[n]}|{rng.choice(e.QUADS)}"] = rng.randint(1, 3)
        s["matchup"] = mm
    if rng.random() < 0.2:
        s["crowding"] = True
    if rng.random() < 0.25:
        s["hitter_damage"] = {key: [round(rng.uniform(-0.8, 0.9), 2), rng.randint(1, 20)]
                              for key in ("FB", "OS", "middle", "up-in") if rng.random() < 0.5}
    if rng.random() < 0.2 and s["bases"][0]:
        s["steal"] = {"a": round(rng.uniform(0.02, 0.12), 3), "runner": 1, "t": rng.choice([None, 1.3, 1.5])}
    if rng.random() < 0.2:
        s["infield_in"] = True
    exclude = [[rng.choice(names), rng.choice(e.QUADS)]] if rng.random() < 0.15 else []
    return dict(arsenal=ars_d, s=s, history=hist, exclude=exclude)


def situation(c):
    sd = dict(c["s"])
    sd["bases"] = tuple(sd["bases"])
    for key in ("landing_today", "hitter_damage"):
        if key in sd:
            sd[key] = {a: tuple(v) for a, v in sd[key].items()}
    if c["history"]:
        sd["last"] = tuple(c["history"][-1][:3])
        if HAS_HISTORY:
            sd["history"] = tuple(tuple(h) for h in c["history"])
    return e.Situation(**sd)


def compute(c):
    ars = [e.Pitch(**d) for d in c["arsenal"]]
    s = situation(c)
    if s.home is not None:
        s = replace(s, win=e.win_constants(s))
    tab = e.solve_table(ars, replace(s, balls=0, strikes=0, last=None, **({"history": ()} if HAS_HISTORY else {})))
    s = replace(s, look=tab.h0)
    s = replace(s, b_h=e.lean_b_h(ars, s))
    ex = {tuple(x) for x in c["exclude"]} or None
    (p, q, prob, cst), dist, tab, info = e.call_v08(ars, s, rng=_Half(), exclude=ex, tab=tab)
    out = dict(dist={f"{d[2].name}|{d[3]}": [d[0], d[1]] for d in dist},
               sigma={f"{n}|{j}": v for (n, j), v in info["sigma"].items()},
               root_costs={f"{n}|{q_}": v for (n, q_), v in e.root_costs(ars, s, tab).items()},
               table={}, h0=list(tab.h0), sweeps=tab.sweeps, b_h={f"{n}|{j}": v for (n, j), v in s.b_h.items()})
    for (b, k) in ((0, 0), (1, 1)):
        out["table"][f"{b}-{k}"] = dict(V={f"{iv},{iy}": v for (iv, iy), v in tab.V[(b, k)].items()},
                                        sigma={f"{n}|{j}": v for (n, j), v in tab.sigma[(b, k)].items()})
    if hasattr(e, "at_bat_plan"):
        plan = e.at_bat_plan(tab)
        out["plan"] = dict(reach={f"{b}-{k}": v for (b, k), v in plan["reach"].items()},
                           visits={f"{b}-{k}": v for (b, k), v in plan["visits"].items()},
                           ends={k_: v for k_, v in plan["ends"].items()},
                           opener=[[n, q_, v] for (n, q_), v in plan["opener"]], putaway=plan["putaway"],
                           behind={f"{b}-{k}": [[n, q_, v] for (n, q_), v in calls] for (b, k), calls in plan["behind"].items()})
    return out


class _Half:
    def random(self):
        return 0.5


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    rng = random.Random(1010)
    cases = []
    for i in range(n):
        c = rand_case(rng)
        c["out"] = compute(c)
        cases.append(c)
        if (i + 1) % 50 == 0:
            print(i + 1, file=sys.stderr, flush=True)
    json.dump(dict(has_history=HAS_HISTORY, cases=cases), open(OUT, "w"))
    print(f"wrote {OUT}: {len(cases)} cases (history input: {HAS_HISTORY})")


if __name__ == "__main__":
    main()
