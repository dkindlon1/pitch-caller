"""v1.2.3 checks (Drew, Nov 14): the umpire prior.

The end-to-end check (docs/REVIEW_e2e_v1.2.2_2026-11-14.md, item E) found one called strike on a "get it over" fastball
moving today's umpire shift u to +0.82 (cap +-1.5). SPEC v0.8 7.5's prior, a0 = 20 typical takes, is almost flat. Drew
chose a tighter prior: UMP_A0 = 200 typical takes, so one take moves u by at most ~0.1.

- The e2e case: one called strike (p 0.316, d 0.095, D3) moves u by under 0.1 (was 0.82).
- Real takes (3 simulated D3 games, neutral umpire): one take moves u under 0.1 at the 95th percentile, under 0.25 at
  most; u stays under 0.5 all game (at a0 20 it hit the 1.5 cap).
- Direction and seed: a strike moves u up, a ball down; no takes returns the coach's seed (wide 0.4, tight -0.4).
- A run of evidence still moves it: 120 borderline strikes in a row reach at least +0.4.
- Nothing else changed: with ump_u given, calls are exactly v1.2.2's (`git archive ca6905e`), bit for bit.
- Python = JS on random takes.

  python3 tests_v123.py           -> runs every check, exits non-zero on a failure
"""
import io, json, os, random, subprocess, sys, tarfile, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as e
from simulate import _load_call_engine

V122 = "ca6905e"
LEVELS = ("hs", "college_d3", "college_d1", "mlb")
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""), flush=True)


def v122_engine():
    blob = subprocess.run(["git", "archive", V122], cwd=HERE, capture_output=True, check=True).stdout
    d = tempfile.mkdtemp(prefix="v122tree_")
    tarfile.open(fileobj=io.BytesIO(blob)).extractall(d, filter="data")
    return _load_call_engine(os.path.join(d, "engine.py"))


def random_takes(rng, n):   # d <= min(p, 1 - p): a take's d can't exceed it (edge bands' C(1-C) <= C, 1 - C)
    out = []
    for _ in range(n):
        p = rng.uniform(0.05, 0.95)
        out.append((1 if rng.random() < 0.5 else 0, p, rng.uniform(0.0, min(p, 1 - p, 0.25))))
    return out


def main():
    # 1. the e2e case
    tk = [(1, 0.3164015272084983, 0.09505929094167184)]
    u = e.ump_estimate(tk, "college_d3")
    check("e2e case: one called strike moves u under 0.1", 0 < u < 0.1, f"u {u:.3f} (v1.2.2: 0.823)")

    # 2. real takes: 3 simulated D3 games with a neutral umpire (golden/ump_takes_d3.json, 325 takes)
    games = json.load(open(os.path.join(HERE, "golden", "ump_takes_d3.json")))
    one = sorted(abs(e.ump_estimate([tuple(t)], "college_d3")) for g in games for t in g)
    p95, worst = one[int(0.95 * len(one))], one[-1]
    check("one simulated take moves u by under 0.1 (95th percentile), under 0.25 at most", p95 < 0.1 and worst < 0.25,
          f"median {one[len(one) // 2]:.3f}, 95th {p95:.3f}, largest {worst:.3f}")
    peak = max(max(abs(e.ump_estimate([tuple(t) for t in g[:i]], "college_d3")) for i in range(1, len(g) + 1)) for g in games)
    peak20 = max(max(abs(e.ump_estimate([tuple(t) for t in g[:i]], "college_d3", a0=20.0)) for i in range(1, len(g) + 1)) for g in games)
    check("a neutral umpire's game stays under 0.5 all game (v1.2.2 hit the 1.5 cap)", peak < 0.5,
          f"largest |u| during a game {peak:.2f} (a0 20: {peak20:.2f})")

    # 3. direction and seed
    up = e.ump_estimate([(1, 0.5, 0.1)], "college_d3")
    dn = e.ump_estimate([(0, 0.5, 0.1)], "college_d3")
    seeds = [e.ump_estimate([], "college_d3", u0=x) for x in (0.4, 0.0, -0.4)]
    check("a strike moves u up, a ball down; no takes returns the seed", up > 0 > dn and seeds == [0.4, 0.0, -0.4],
          f"strike {up:+.3f}, ball {dn:+.3f}, seeds {seeds}")

    # 4. a run of evidence still moves it
    run = e.ump_estimate([(1, 0.5, 0.12)] * 120, "college_d3")
    check("120 borderline strikes in a row reach +0.4", run >= 0.4, f"u {run:.3f}")

    # 5. nothing else changed: calls with a given ump_u are v1.2.2's
    old = v122_engine()
    rng = random.Random(7)
    kinds = [("FB", "rides"), ("SL", "sweeper"), ("CH", ""), ("CB", "12-6")]
    diffs = 0
    n = 40
    for i in range(n):
        lv = rng.choice(LEVELS)
        k = rng.randint(2, 4)
        spec = [dict(name=f"P{j}", kind=kinds[j][0], shape=kinds[j][1], grade=rng.randint(2, 5), command=rng.randint(2, 5),
                     conf=rng.uniform(0.5, 0.95), velo=90 - 6 * j) for j in range(k)]
        b, s_ = rng.randint(0, 3), rng.randint(0, 2)
        ump = rng.uniform(-0.6, 0.6)
        outs = rng.randint(0, 2)
        out = []
        for eng in (e, old):
            ars = [eng.Pitch(**dict(d)) for d in spec]
            st = eng.Situation(b, s_, outs, (False, False, False), level=lv, same_side=True, ump_u=ump)
            pick, dist, tab, info = eng.call_v08(ars, st, rng=random.Random(1))
            out.append(([(round(d[0], 15), d[1], d[2].name) for d in dist], pick[1], pick[0].name))
        if out[0] != out[1]:
            diffs += 1
    check("calls with ump_u given are exactly v1.2.2's", diffs == 0, f"{n} random cases, {diffs} differ")

    # 6. Python = JS
    rng = random.Random(99)
    cases = []
    for _ in range(60):
        lv = rng.choice(LEVELS)
        tk = random_takes(rng, rng.randint(0, 40))
        u0 = rng.choice((0.4, 0.0, -0.4))
        cases.append(dict(level=lv, takes=tk, u0=u0, py=e.ump_estimate(tk, lv, u0=u0)))
    js = """
const E=require('./app/engine.js');E.init(JSON.parse(require('fs').readFileSync('app/engine_data.json')));
const cs=JSON.parse(require('fs').readFileSync(0,'utf8'));
console.log(JSON.stringify(cs.map(c=>E.v08.umpEstimate(c.takes,c.level,c.u0))));"""
    r = subprocess.run(["node", "-e", js], cwd=HERE, input=json.dumps(cases), capture_output=True, text=True, check=True)
    got = json.loads(r.stdout)
    worst = max(abs(a - c["py"]) for a, c in zip(got, cases))
    check("Python = JS on 60 random take sets", worst < 1e-12, f"largest difference {worst:.1e}")

    bad = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
