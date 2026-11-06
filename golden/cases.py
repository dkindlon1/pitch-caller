"""The 500 golden input cases and the outputs computed for each (shared by golden_v09.py). Made for the v0.8 golden
(Nov 5) and kept when the engine became one flag-free v0.9 engine (Nov 6); the inputs and outputs are unchanged."""
import json, os, random, sys
from dataclasses import replace
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import engine as e
import fuzz_lib as F

N, SEED = 500, 20261105
LEVELS = ["hs", "travel", "college_d3", "college_d1", "mlb"]
K = lambda a: f"{a[0]}|{a[1]}"


class Half:
    def random(self):
        return 0.5


def pdict(p):
    return dict(name=p.name, kind=p.kind, grade=p.grade, command=p.command, conf=p.conf, shape=p.shape, velo=p.velo, slot=p.slot)


def sdict(s):
    return dict(balls=s.balls, strikes=s.strikes, outs=s.outs, bases=list(s.bases), inning=s.inning, margin=s.margin,
                pitch_count=s.pitch_count, batters_faced=s.batters_faced, level=s.level, same_side=s.same_side,
                last=list(s.last) if s.last else None, usage_this_count=s.usage_this_count, timing=s.timing,
                hitter_damage={k: list(v) for k, v in s.hitter_damage.items()},
                landing_today={k: list(v) for k, v in s.landing_today.items()},
                look=list(s.look) if s.look else None, familiar=s.familiar, crowding=s.crowding, grades=s.grades,
                ump_u=s.ump_u, radar=s.radar, infield_in=s.infield_in,
                usage_by_call={K(a): v for a, v in s.usage_by_call.items()}, b_h={K(a): v for a, v in s.b_h.items()},
                steal=s.steal, pitch_cap=s.pitch_cap, home=s.home, sched_innings=s.sched_innings,
                extras_runner=s.extras_runner)


def from_dicts(c):
    ars = [e.Pitch(**d) for d in c["arsenal"]]
    d = dict(c["s"])
    d["bases"] = tuple(d["bases"])
    d["last"] = tuple(d["last"]) if d["last"] else None
    d["look"] = tuple(d["look"]) if d["look"] else None
    d["hitter_damage"] = {k: tuple(v) for k, v in d["hitter_damage"].items()}
    d["landing_today"] = {k: tuple(v) for k, v in d["landing_today"].items()}
    d["usage_by_call"] = {tuple(k.split("|")): v for k, v in d["usage_by_call"].items()}
    d["b_h"] = {tuple(k.split("|")): v for k, v in d["b_h"].items()}
    return ars, e.Situation(**d)


def inputs():
    """The 500 input cases (no outputs). Deterministic: own RNGs, fixed seed."""
    F.rng.seed(SEED)
    rng = random.Random(SEED + 1)
    out = []
    for i in range(N):
        ars = F.rand_arsenal()
        s = F.rand_situation(ars)
        vfb = max(x.mph() for x in ars if x.kind == "FB")
        s = replace(s, level=rng.choice(LEVELS),
                    look=(round(rng.uniform(0.86, 1.02) * vfb, 2), round(rng.uniform(1.8, 3.2), 2)) if rng.random() < 0.7 else None,
                    familiar={c: rng.randint(0, 12) for c in ("FB", "OS") if rng.random() < 0.6},
                    crowding=rng.random() < 0.2, grades={g: rng.randint(1, 5) for g in "cwd" if rng.random() < 0.5} or None,
                    ump_u=round(rng.uniform(-0.8, 0.8), 2) if rng.random() < 0.5 else 0.0,
                    radar={x.name: round(x.mph() - rng.uniform(0, 3), 1) for x in ars if rng.random() < 0.2},
                    infield_in=rng.random() < 0.15, pitch_cap=rng.choice([85, 105]),
                    home=rng.choice([True, False, None]), sched_innings=rng.choice([None, 7, 9]),
                    extras_runner=rng.random() < 0.3)
        s = replace(s, usage_by_call={(p.name, q): rng.randint(0, 2) for p in ars for q in e.targets(s.balls, s.strikes)
                                      if rng.random() < 0.08},
                    b_h=e.lean_b_h(ars, s, tuple(rng.choice(["FB", "OS"]) for _ in range(rng.randint(0, 2)))),
                    steal={"a": rng.choice([0.04, 0.10]), "runner": 1 if s.bases[0] else 2, "t": rng.choice([None, 1.3, 1.6])}
                    if (s.bases[0] or s.bases[1]) and rng.random() < 0.5 else None)
        ks = e.sit_options(ars)
        pure = [list(rng.choice(ks)) for _ in ars]
        takes = [[rng.randint(0, 1), rng.uniform(0.2, 0.8), rng.uniform(0.01, 0.2)] for _ in range(rng.randint(5, 40))]
        out.append(dict(arsenal=[pdict(p) for p in ars], s=sdict(s), pure=pure, takes=takes, full=(i % 2 == 0)))
    return out


def compute(c):
    ars, s = from_dicts(c)
    s_w = replace(s, win=e.win_constants(s)) if s.home is not None else s
    r = {"probs": {}}
    for p, kk in zip(ars, c["pure"]):
        for q in e.QUADS:
            for sit in (None, ("pure",) + tuple(kk)):
                key = f"{p.name}|{q}|{'mix' if sit is None else sit[1] + '|' + sit[2]}"
                r["probs"][key] = e.outcome_probs(p, q, s_w, ars, sit=sit)
    if s_w.win:
        r["win"] = {k: s_w.win[k] for k in ("omega", "WE0", "m0", "LI")}
    if c["full"]:
        tab = e.solve_table(ars, replace(s_w, balls=0, strikes=0, last=None))
        bk = lambda bn: "none" if bn is None else f"{bn[0]},{bn[1]}"
        r["table"] = dict(h0=list(tab.h0), sweeps=tab.sweeps,
                          V={f"{b}-{k}": {bk(bn): v for bn, v in d.items()} for (b, k), d in tab.V.items()},
                          N={f"{b}-{k}": {bk(bn): v for bn, v in d.items()} for (b, k), d in tab.N.items()},
                          sigma={f"{b}-{k}": {K(a): v for a, v in d.items()} for (b, k), d in tab.sigma.items()})
        pick, dist, tab, info = e.call_v08(ars, s_w, rng=Half(), tab=tab)
        r["call"] = dict(pick=[pick[0].name, pick[1]], prob=pick[2], cost=pick[3],
                         dist={f"{d[2].name}|{d[3]}": [d[0], d[1]] for d in dist},
                         sigma={K(a): v for a, v in info["sigma"].items()}, residual=info["residual"])
        line, deltas, _ = e.why_line(ars, s_w, tab, pick, info)
        r["why"] = dict(line=line, deltas=deltas)
        p0, q0 = ars[0], e.targets(s.balls, s.strikes)[0]
        r["take"] = list(e.take_stats(p0, q0, s_w, ars))
        r["grade"] = {g: list(v) for g, v in e.grade_stats(p0, q0, s_w, ars, grades=s.grades).items()}
        tk = [tuple(t) for t in c["takes"]]
        r["ump"] = dict(u=e.ump_estimate(tk, s.level), g=list(e.grade_estimate(tk, 3, 2.5, 3.0, len(tk) + 20)))
    return r


def flat(r, pre=""):
    if isinstance(r, dict):
        for k, v in r.items():
            yield from flat(v, pre + k + ".")
    elif isinstance(r, (list, tuple)):
        for i, v in enumerate(r):
            yield from flat(v, f"{pre}{i}.")
    else:
        yield pre.rstrip("."), r
