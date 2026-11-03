"""Generate parity cases: random situations -> Python engine outputs (costs, policy, at-bat values, call mix)."""
import json, random, sys
sys.path.insert(0, ".")
import engine as e
from simulate import our_staff

rng = random.Random(42)
levels = ["mlb", "college_d1", "college_d3", "hs"]
staff = our_staff()
SH = {"FB": ["ride", "sink", "run", ""], "SL": ["tight", "sweeper", ""], "CB": ["loopy", "sharp"], "CH": ["fade", "drop"]}


def rand_arsenal():
    base = rng.choice(staff)["arsenal"]
    out = []
    for p in base:
        d = dict(name=p.name, kind=p.kind, grade=rng.randint(1, 5), command=rng.randint(1, 5),
                 conf=round(rng.uniform(0.3, 0.95), 3), shape=rng.choice(SH[p.kind]), velo=rng.choice([0, p.velo, p.velo - 4]),
                 slot=rng.choice(["three-quarter", "over the top", "sidearm"]), height_ft=rng.choice([5.9, 6.1, 6.4]))
        if rng.random() < 0.3:
            d["ivb"], d["hb"] = round(rng.uniform(-15, 20), 1), round(rng.uniform(-15, 16), 1)
        if rng.random() < 0.15:
            d["release_offset_in"] = [rng.choice([-3, 0, 2]), rng.choice([0, 4])]
        if rng.random() < 0.35:   # v0.7 personal traits
            d["traits"] = {k: round(rng.uniform(-0.8, 0.8), 2) for k in e.TRAIT_KEYS if rng.random() < 0.7}
        if rng.random() < 0.35:
            d["strike_rate"] = round(rng.uniform(0.4, 0.8), 3)
        out.append(d)
    return out


def mk_pitch(d):
    d = dict(d)
    if "release_offset_in" in d:
        d["release_offset_in"] = tuple(d["release_offset_in"])
    return e.Pitch(**d)


cases = []
for i in range(int(sys.argv[1]) if len(sys.argv) > 1 else 120):
    ars_d = rand_arsenal()
    ars = [mk_pitch(d) for d in ars_d]
    b, k = rng.randint(0, 3), rng.randint(0, 2)
    last = None
    if rng.random() < 0.7:
        lp = rng.choice(ars)
        last = [lp.name, rng.choice(e.QUADS)] + ([rng.choice(["whiff", "foul", "ball", "cstrike"])] if rng.random() < 0.7 else [])
    s_d = dict(balls=b, strikes=k, outs=rng.randint(0, 2), bases=[rng.random() < 0.35 for _ in range(3)],
               inning=rng.randint(1, 9), margin=rng.randint(-3, 3), pitch_count=rng.randint(0, 110),
               batters_faced=rng.randint(0, 27), level=rng.choice(levels), same_side=rng.random() < 0.6, last=last,
               usage_this_count={p.name: rng.randint(0, 3) for p in ars if rng.random() < 0.5},
               timing={"FB": round(rng.uniform(-0.8, 0.8), 2), "OS": round(rng.uniform(-0.8, 0.8), 2)} if rng.random() < 0.6 else {},
               hitter_damage={key: (round(rng.uniform(-0.8, 0.9), 2), rng.randint(1, 40))
                              for key in ("FB", "OS", "up-in", "down-away") if rng.random() < 0.4},
               catcher_block=rng.randint(2, 4),
               landing_today={p.name: (rng.randint(0, 6), rng.randint(6, 14)) for p in ars if rng.random() < 0.5})
    s = e.Situation(**{**s_d, "bases": tuple(s_d["bases"]), "last": tuple(last) if last else None})
    probs = {f"{p.name}|{q}": e.outcome_probs(p, q, s, ars) for p in ars for q in e.QUADS}
    costs = {f"{p.name}|{q}": e.cost(p, q, s, ars)[0] for p in ars for q in e.QUADS}
    pol, pc, temp = e.mixed_policy(ars, s)
    case = dict(arsenal=ars_d, s={**s_d, "hitter_damage": {kk: list(v) for kk, v in s_d["hitter_damage"].items()},
                                  "landing_today": {kk: list(v) for kk, v in s_d["landing_today"].items()}},
                probs=probs, costs=costs, policy=pol, temp=temp)
    if i % 3 == 0:     # the full call (at-bat values + equilibrium) is slower; check a third of cases
        rel, _ = e.at_bat_values(ars, s)
        _, dist = e.call_mixed(ars, s, rng=random.Random(0))
        case["atbat"] = {f"{bb}-{kk}": v for (bb, kk), v in rel.items()}
        case["dist"] = [[pr, c, p.name, q] for pr, c, p, q in dist]
    conf = {}   # v0.7: confidence updates measured against his strike rate
    for d in ars_d:
        for ev in ("ball", "cstrike", "whiff", "hard"):
            p = mk_pitch(d); e.update_confidence(p, ev); conf[f"{d['name']}|{ev}"] = p.conf
    case["conf"] = conf
    cases.append(case)
json.dump(cases, open("app/parity_cases.json", "w"))
print(len(cases), "cases")
