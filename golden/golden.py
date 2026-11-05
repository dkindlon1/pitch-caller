"""v0.8 step 0: the v0.7c golden test.
  python3 golden/golden.py make   -> writes golden/golden_v07c.json from the CURRENT engine (run once, on v0.7c)
  python3 golden/golden.py check  -> recomputes with every v0.8 flag in its v0.7c position; must match to 1e-12
Covers outcome probabilities, costs, the pitch-type policy, solved count values and the full call distribution on 500
seeded random situations (all levels, traits, landing, damage, timing, usage, last pitch, bases)."""
import json, random, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import engine as e
from simulate import our_staff

N = 500
LEVELS = ["mlb", "college_d1", "college_d3", "hs", "travel"]
SH = {"FB": ["ride", "sink", "run", "cut", ""], "SL": ["tight", "sweeper", ""], "CB": ["loopy", "sharp"], "CH": ["fade", "drop"]}


def cases():
    rng = random.Random(20261104)
    staff = our_staff()
    out = []
    for i in range(N):
        base = rng.choice(staff)["arsenal"]
        ars_d = []
        for p in base:
            d = dict(name=p.name, kind=p.kind, grade=rng.randint(1, 5), command=rng.randint(1, 5),
                     conf=round(rng.uniform(0.3, 0.95), 3), shape=rng.choice(SH[p.kind]),
                     velo=rng.choice([0, p.velo, p.velo - 4]), slot=rng.choice(["three-quarter", "over the top", "sidearm"]),
                     height_ft=rng.choice([5.9, 6.1, 6.4]))
            if rng.random() < 0.3:
                d["ivb"], d["hb"] = round(rng.uniform(-15, 20), 1), round(rng.uniform(-15, 16), 1)
            if rng.random() < 0.15:
                d["release_offset_in"] = [rng.choice([-3, 0, 2]), rng.choice([0, 4])]
            if rng.random() < 0.35:
                d["traits"] = {k: round(rng.uniform(-0.8, 0.8), 2) for k in e.TRAIT_KEYS if rng.random() < 0.7}
            if rng.random() < 0.35:
                d["strike_rate"] = round(rng.uniform(0.4, 0.8), 3)
            ars_d.append(d)
        names = [d["name"] for d in ars_d]
        last = None
        if rng.random() < 0.7:
            last = [rng.choice(names), rng.choice(e.QUADS)] + ([rng.choice(["whiff", "foul", "ball", "cstrike"])] if rng.random() < 0.7 else [])
        s_d = dict(balls=rng.randint(0, 3), strikes=rng.randint(0, 2), outs=rng.randint(0, 2),
                   bases=[rng.random() < 0.35 for _ in range(3)], inning=rng.randint(1, 9), margin=rng.randint(-3, 3),
                   pitch_count=rng.randint(0, 115), batters_faced=rng.randint(0, 30), level=rng.choice(LEVELS),
                   same_side=rng.random() < 0.6, last=last,
                   usage_this_count={n: rng.randint(0, 3) for n in names if rng.random() < 0.5},
                   timing={"FB": round(rng.uniform(-0.8, 0.8), 2), "OS": round(rng.uniform(-0.8, 0.8), 2)} if rng.random() < 0.6 else {},
                   hitter_damage={k: [round(rng.uniform(-0.8, 0.9), 2), rng.randint(1, 40)]
                                  for k in ("FB", "OS", "up-in", "down-away") if rng.random() < 0.4},
                   catcher_block=rng.randint(2, 4),
                   landing_today={n: [rng.randint(0, 6), rng.randint(6, 14)] for n in names if rng.random() < 0.5})
        out.append(dict(arsenal=ars_d, s=s_d, full=(i % 5 == 0)))
    return out


def mk(c):
    ars = []
    for d in c["arsenal"]:
        d = dict(d)
        if "release_offset_in" in d:
            d["release_offset_in"] = tuple(d["release_offset_in"])
        ars.append(e.Pitch(**d))
    sd = dict(c["s"])
    sd["bases"] = tuple(sd["bases"]); sd["last"] = tuple(sd["last"]) if sd["last"] else None
    sd["hitter_damage"] = {k: tuple(v) for k, v in sd["hitter_damage"].items()}
    sd["landing_today"] = {k: tuple(v) for k, v in sd["landing_today"].items()}
    return ars, e.Situation(**sd)


def compute(c):
    ars, s = mk(c)
    r = {"probs": {f"{p.name}|{q}": e.outcome_probs(p, q, s, ars) for p in ars for q in e.QUADS},
         "costs": {f"{p.name}|{q}": e.cost(p, q, s, ars)[0] for p in ars for q in e.QUADS}}
    pol, _, temp = e.mixed_policy(ars, s)
    r["policy"], r["temp"] = pol, temp
    if c["full"]:
        rel, _ = e.at_bat_values(ars, s)
        r["atbat"] = {f"{b}-{k}": v for (b, k), v in rel.items()}
        _, dist = e.call_mixed(ars, s, rng=random.Random(0))
        r["dist"] = {f"{p.name}|{q}": pr for pr, _, p, q in dist}
    return r


def flat(r, pre=""):
    for k, v in r.items():
        if isinstance(v, dict):
            yield from flat(v, pre + k + ".")
        else:
            yield pre + k, v


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    path = os.path.join(HERE, "golden_v07c.json")
    if mode == "make":
        cs = cases()
        for c in cs:
            c["out"] = compute(c)
        json.dump(cs, open(path, "w"))
        print(f"wrote {len(cs)} golden cases ({sum(c['full'] for c in cs)} with full calls)")
        return
    e.set_flags(**e.FLAGS_V07)
    cs = json.load(open(path))
    worst, bad = 0.0, 0
    for i, c in enumerate(cs):
        got = dict(flat(compute(c)))
        want = dict(flat(c["out"]))
        if set(got) != set(want):
            bad += 1
            print("case", i, "keys differ:", sorted(set(got) ^ set(want))[:5])
            continue
        for k, v in want.items():
            d = abs(got[k] - v)
            worst = max(worst, d)
            if d > 1e-12:
                bad += 1
                if bad < 6:
                    print(f"case {i} {k}: golden {v!r} now {got[k]!r}")
    print(f"{len(cs)} cases, largest difference {worst:.2e}")
    print("PASS: v0.7c reproduced exactly" if not bad else f"FAIL: {bad} differences")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
