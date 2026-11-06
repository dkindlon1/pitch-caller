"""v0.8 parity cases: random situations (every v0.8 input) -> Python engine outputs in v0.8 mode.
usage (repo root): python3 app/make_parity_v08.py [N] [seed]  -> app/parity_v08_cases.json; then node app/parity_v08.js
v0.9: PARITY_FLAGS=v09 runs in FLAGS_V09 and writes app/parity_v09_cases.json (some pitches given a bad landing record
so the item 9 filter is exercised, and some an earlier-trip matchup record for item 6); check it with PARITY_FLAGS=v09 node app/parity_v08.js"""
import os
import json, random, sys
sys.path.insert(0, ".")
import engine as e
import fuzz_lib as F

N = int(sys.argv[1]) if len(sys.argv) > 1 else 150
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 808
F.rng.seed(seed)
rng = random.Random(seed + 1)
MODE = os.environ.get("PARITY_FLAGS", "v08")
# v09 parity sets inside_v09 explicitly (it has been on in FLAGS_V09 since Drew's STEP4b call; kept so the check holds either way)
e.set_flags(**{"v08": e.FLAGS_V08, "v09": dict(e.FLAGS_V09, inside_v09=True)}[MODE])
OUT = f"app/parity_{MODE}_cases.json"


class Half:
    def random(self):
        return 0.5


def pd(p):
    return dict(name=p.name, kind=p.kind, grade=p.grade, command=p.command, conf=p.conf, shape=p.shape, velo=p.velo, slot=p.slot)


def sd(s):
    d = dict(balls=s.balls, strikes=s.strikes, outs=s.outs, bases=list(s.bases), inning=s.inning, margin=s.margin,
             pitch_count=s.pitch_count, batters_faced=s.batters_faced, level=s.level, same_side=s.same_side,
             last=list(s.last) if s.last else None, usage_this_count=s.usage_this_count, timing=s.timing,
             hitter_damage={k: list(v) for k, v in s.hitter_damage.items()},
             landing_today={k: list(v) for k, v in s.landing_today.items()},
             look=list(s.look) if s.look else None, familiar=s.familiar, crowding=s.crowding, grades=s.grades, ump_u=s.ump_u,
             radar=s.radar, infield_in=s.infield_in, usage_by_call={f"{a[0]}|{a[1]}": v for a, v in s.usage_by_call.items()},
             b_h={f"{a[0]}|{a[1]}": v for a, v in s.b_h.items()}, steal=s.steal, pitch_cap=s.pitch_cap, home=s.home,
             sched_innings=s.sched_innings, extras_runner=s.extras_runner)
    if s.matchup:
        d["matchup"] = dict(s.matchup)
    return d


K = lambda a: f"{a[0]}|{a[1]}"
cases = []
for i in range(N):
    ars = F.rand_arsenal()
    s = F.rand_situation(ars)
    lv = rng.choice(["hs", "college_d3", "college_d1", "mlb"])
    vfb = max(x.mph() for x in ars if x.kind == "FB")
    from dataclasses import replace
    s = replace(s, level=lv, look=(round(rng.uniform(0.86, 1.02) * vfb, 2), round(rng.uniform(1.8, 3.2), 2)) if rng.random() < 0.7 else None,
                familiar={c: rng.randint(0, 12) for c in ("FB", "OS") if rng.random() < 0.6},
                crowding=rng.random() < 0.2, grades={g: rng.randint(1, 5) for g in "cwd" if rng.random() < 0.5} or None,
                ump_u=round(rng.uniform(-0.8, 0.8), 2) if rng.random() < 0.5 else 0.0,
                radar={x.name: round(x.mph() - rng.uniform(0, 3), 1) for x in ars if rng.random() < 0.2},
                infield_in=rng.random() < 0.15, pitch_cap=rng.choice([85, 105]),
                home=rng.choice([True, False, None]), sched_innings=rng.choice([None, 7, 9]), extras_runner=rng.random() < 0.3)
    s = replace(s, usage_by_call={(p.name, q): rng.randint(0, 2) for p in ars for q in e.targets(s.balls, s.strikes) if rng.random() < 0.08},
                b_h=e.lean_b_h(ars, s, tuple(rng.choice(["FB", "OS"]) for _ in range(rng.randint(0, 2)))),
                steal={"a": rng.choice([0.04, 0.10]), "runner": 1 if s.bases[0] else 2, "t": rng.choice([None, 1.3, 1.6])}
                if (s.bases[0] or s.bases[1]) and rng.random() < 0.5 else None)
    if MODE == "v09" and rng.random() < 0.4:        # a pitch that isn't landing today (item 9)
        bad = rng.choice(ars).name
        s = replace(s, landing_today=dict(s.landing_today, **{bad: (rng.randint(0, 2), rng.randint(4, 10))}))
    if MODE == "v09" and rng.random() < 0.5:        # earlier trips today (item 6)
        mm = {}
        for _ in range(rng.randint(1, 6)):
            x = rng.choice(ars)
            key = "succ|" + x.kind if rng.random() < 0.7 else "hard|" + x.kind + "|" + rng.choice(e.QUADS)
            mm[key] = mm.get(key, 0) + 1
        s = replace(s, matchup=mm)
    s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
    c = dict(arsenal=[pd(p) for p in ars], s=sd(s))
    ks = e.sit_options(ars)
    probs = {}
    for p in ars:
        for q in e.QUADS:
            for sit in (None, ("pure",) + rng.choice(ks)):
                key = f"{p.name}|{q}|{'mix' if sit is None else sit[1] + '|' + sit[2]}"
                probs[key] = e.outcome_probs(p, q, s_w, ars, sit=sit)
    c["probs"] = probs
    if s.home is not None:
        w = s_w.win
        c["win"] = dict(omega=w["omega"], WE0=w["WE0"], m0=w["m0"], LI=w["LI"]) if w else None
    if i % 2 == 0:
        tab = e.solve_table(ars, replace(s_w, balls=0, strikes=0, last=None))
        c["table"] = dict(h0=list(tab.h0), sweeps=tab.sweeps,
                          V={f"{b}-{k}": {("none" if bn is None else f"{bn[0]},{bn[1]}"): v for bn, v in d.items()} for (b, k), d in tab.V.items()},
                          N={f"{b}-{k}": {("none" if bn is None else f"{bn[0]},{bn[1]}"): v for bn, v in d.items()} for (b, k), d in tab.N.items()},
                          sigma={f"{b}-{k}": {K(a): v for a, v in d.items()} for (b, k), d in tab.sigma.items()})
        pick, dist, tab, info = e.call_v08(ars, s_w, rng=Half(), tab=tab)
        c["call"] = dict(pick=[pick[0].name, pick[1], pick[2], pick[3]], dist=[[d[2].name, d[3], d[0], d[1]] for d in dist],
                         sigma={K(a): v for a, v in info["sigma"].items()}, residual=info["residual"])
        line, deltas, b2 = e.why_line(ars, s_w, tab, pick, info)
        c["why"] = dict(line=line, deltas=deltas)
        p0 = ars[0]; q0 = e.targets(s.balls, s.strikes)[0]
        c["take"] = list(e.take_stats(p0, q0, s_w, ars))
        c["grade"] = {g: list(v) for g, v in e.grade_stats(p0, q0, s_w, ars, grades=s.grades).items()}
        takes = [(rng.randint(0, 1), rng.uniform(0.2, 0.8), rng.uniform(0.01, 0.2)) for _ in range(rng.randint(5, 40))]
        c["ump"] = dict(takes=takes, u=e.ump_estimate(takes, s.level), g=e.grade_estimate(takes, 3, 2.5, 3.0, len(takes) + 20))
    cases.append(c)
    print(i, flush=True) if i % 25 == 0 else None
json.dump(cases, open(OUT, "w"))
print(len(cases), "cases")
