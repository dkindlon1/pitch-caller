"""
v1.3 Part 5 (plan 3.4, Step 5 scaffolding): hidden hitter traits in the simulator.

1. No traits = bitwise the reference simulator: simulate.py from git 9ad0b81 and today's simulate.py play the same seeded
   games, compared byte for byte (stdout and the pitch-by-pitch CSV) and every pitch event field for field, with HITTERS
   unset and empty. The reference was e202169 (the Part 5 branch point) until ruling 11 split `two_strike` into
   `two_strike_swing` / `two_strike_foul`. It moved to 9ad0b81 (feat/hitter-v13-core before the split) because the core
   work (bca5f6a calibration plumbing, then the level recalibration) changed the engine numbers the games are played on
   and simulate.py's own calibration plumbing, so e202169's games no longer match; that is the recalibration, not the
   hitter traits. 9ad0b81 is the last tree with the one `two_strike` trait.
2. The traits are hidden: the engine's code never names them and the world's Situation is the same with or without them.
3. The trait math: all traits 0 returns the mix unchanged; each trait moves its outcome the right way and only it; mixes
   stay summing to 1; presets and the HITTERS parser.
4. Python = JS: simulate.py's apply_hitter_traits / power_row against app/worlds.js's applyHitterTraits / powerRow.
5. A traited game runs and logs the hidden traits (column true_traits) only when HITTERS is set.
Run: python3 tests_v13_sim.py [seed ...]      (default one seed, 11; about a minute per seed)
"""
import csv, io, json, os, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
BASE = "9ad0b81"       # was e202169; see the docstring (moved for the core recalibration, before the two-strike split)
SEEDS = [int(a) for a in sys.argv[1:] if a.isdigit()] or [11, 23, 37]
fails = 0


def check(ok, msg):
    global fails
    print(("  ok   " if ok else "  FAIL ") + msg)
    if not ok:
        fails += 1


print(f"1. No traits: today's simulate.py plays exactly the {BASE} games (seeds {SEEDS})")


def events(csv_bytes):
    return list(csv.DictReader(io.StringIO(csv_bytes.decode("utf-8"))))


def field_diffs(a, b):
    """pitch events compared field for field: (events, fields compared, differences)"""
    ea, eb = events(a), events(b)
    nf = sum(len(r) for r in ea)
    bad = abs(len(ea) - len(eb)) + sum(1 for ra, rb in zip(ea, eb) for k in set(ra) | set(rb) if ra.get(k) != rb.get(k))
    return len(ea), nf, bad


n_ev = n_fd = 0
base_src = subprocess.run(["git", "show", f"{BASE}:simulate.py"], cwd=HERE, capture_output=True, check=True).stdout
tmp = tempfile.mkdtemp(prefix="v13sim_")
base_py = os.path.join(tmp, "simulate_base.py")
with open(base_py, "wb") as f:
    f.write(base_src)
# the old file runs as if it sat in this tree (its data files and engine are read beside __file__)
RUNNER = ("import os, sys; sys.path.insert(0, {here!r}); src = open({src!r}, encoding='utf-8').read(); sys.argv = ['simulate.py', {seed!r}]; "
          "exec(compile(src, {name!r}, 'exec'), {{'__name__': '__main__', '__file__': os.path.join({here!r}, 'simulate.py')}})")


def play(which, seed, env_extra):
    d = tempfile.mkdtemp(prefix=f"{which}_{seed}_", dir=tmp)
    src = base_py if which == "base" else os.path.join(HERE, "simulate.py")
    env = {k: v for k, v in os.environ.items() if k != "HITTERS"}
    env.update(env_extra)
    env["PYTHONUTF8"] = "1"
    r = subprocess.run([sys.executable, "-c", RUNNER.format(here=HERE, src=src, seed=str(seed), name=src)], cwd=d, env=env, capture_output=True)
    csv = open(os.path.join(d, f"game_{seed}.csv"), "rb").read() if os.path.exists(os.path.join(d, f"game_{seed}.csv")) else b""
    return r.returncode, r.stdout, csv, r.stderr


jobs = []
for seed in SEEDS:
    jobs += [("base", seed, {}), ("new", seed, {}), ("new", seed, {"HITTERS": ""})]
WORLD = {"LEVEL": "hs", "TRUE_POWER": "1", "TRUE_TAGS": "1", "STAFF": "power"}    # the other world settings that touch the hitter
jobs += [("base", SEEDS[0], WORLD), ("new", SEEDS[0], WORLD)]
jobs.append(("new", 11, {"HITTERS": "3:power,4:two_strike_battler"}))     # part 5, run alongside
with ThreadPoolExecutor(max_workers=min(8, len(jobs))) as ex:
    outs = list(ex.map(lambda j: play(*j), jobs))
for i, seed in enumerate(SEEDS):
    b, n, n2 = outs[3 * i:3 * i + 3]
    ev, nf, bad = field_diffs(b[2], n[2]) if b[2] and n[2] else (0, 0, 1)
    ev2, _, bad2 = field_diffs(b[2], n2[2]) if b[2] and n2[2] else (0, 0, 1)
    n_ev += ev
    n_fd += nf
    ok = b[0] == 0 and b[2] and n == b and n2 == b and bad == 0 and bad2 == 0 and ev > 0
    check(ok, f"seed {seed}: exit 0, stdout ({len(b[1])} bytes) and CSV ({len(b[2])} bytes) identical; {ev} pitch events, "
              f"{nf} fields equal field for field ({bad} / {bad2} differences), HITTERS unset and empty")
    if not ok:
        print(b[3].decode()[-800:], n[3].decode()[-800:])
b, n = outs[3 * len(SEEDS)], outs[3 * len(SEEDS) + 1]
ev, nf, bad = field_diffs(b[2], n[2]) if b[2] and n[2] else (0, 0, 1)
n_ev += ev
n_fd += nf
check(b[0] == 0 and b[2] and n == b and bad == 0, f"seed {SEEDS[0]} with {' '.join(f'{k}={v}' for k, v in WORLD.items())}: identical "
      f"({len(b[2])} CSV bytes, {ev} pitch events, {bad} field differences)")
print(f"     {len(SEEDS) + 1} games, {n_ev} pitch events, {n_fd} fields compared against {BASE}")
if not (b[0] == 0 and n == b):
    print(b[3].decode()[-800:], n[3].decode()[-800:])

print("2. Hidden: the engine never reads the traits")
import engine
import simulate as S
from engine import Situation
for f in ("engine.py", os.path.join("app", "engine.js")):
    txt = open(os.path.join(HERE, f), encoding="utf-8").read()
    check(not any(w in txt for w in ("apply_hitter_traits", "applyHitterTraits", "HITTER_PRESETS", "two_strike", "power_row", "HITTERS")),
          f"{f} names none of the trait code")
s0 = Situation(1, 2, 1, (True, False, False), level="college_d3")
h = {"name": "#3", "hand": "R", "fb": 0.2, "os": -0.1, "timing": 0.3}
check(S.true_situation(s0, h) == S.true_situation(s0, dict(h, traits=dict(S.HITTER_PRESETS["free_swinger"]))),
      "the world's Situation (what outcome_probs sees) is the same with or without traits")

print("3. The trait math")
STAFF = S.our_staff()[0]["arsenal"]
mixes = []
for p in STAFF:
    for q in ("up-in", "down-away", "middle", "chase"):
        for (b, k) in ((0, 0), (1, 0), (0, 1), (2, 1), (1, 2), (3, 2)):
            for bases in ((False, False, False), (True, True, True)):
                s = Situation(b, k, 0, bases, level="college_d3")
                mixes.append(((b, k), engine.outcome_probs(p, q, s, STAFF)))
zero = {t: 0.0 for t in S.HITTER_TRAITS}
check(all(S.apply_hitter_traits(P, zero, *bk) == P and list(S.apply_hitter_traits(P, zero, *bk)) == list(P) for bk, P in mixes)
      and all(S.apply_hitter_traits(P, {}, *bk) == P for bk, P in mixes), f"all traits 0 (or none): every mix returned unchanged, same key order ({len(mixes)} mixes)")
SW = ("whiff", "foul", "weak", "solid", "hard")
sw = lambda P: sum(P[k] for k in SW)
wh = lambda P: P["whiff"] / sw(P)
fo = lambda P: P["foul"] / (sw(P) - P["whiff"])
ok_sum = ok_dir = True
for bk, P in mixes:
    for t in S.HITTER_TRAITS:
        for v in (-1.5, 1.5):
            Q = S.apply_hitter_traits(P, {t: v}, *bk)
            ok_sum &= abs(sum(Q.values()) - sum(P.values())) < 1e-12 and all(x >= 0 for x in Q.values())
            early, two = bk in ((0, 0), (1, 0), (0, 1)), bk[1] == 2
            d_sw, d_wh, d_fo = sw(Q) - sw(P), wh(Q) - wh(P), fo(Q) - fo(P)
            sgn = 1 if v > 0 else -1
            exp_sw = sgn if (t == "early" and early) or (t == "two_strike_swing" and two) else 0
            exp_wh = -sgn if t == "contact" else 0
            exp_fo = sgn if (t == "two_strike_foul" and two) else 0
            for d, e in ((d_sw, exp_sw), (d_wh, exp_wh), (d_fo, exp_fo)):
                ok_dir &= (d * e > 0) if e else abs(d) < 1e-12
            # the take outcomes keep their own mix
            tk = [P[k] for k in S._TAKE]
            tq = [Q[k] for k in S._TAKE]
            ok_dir &= all(abs(a * sum(tq) - c * sum(tk)) < 1e-12 for a, c in zip(tk, tq))
check(ok_sum, "mixes keep their total, no negative shares")
check(ok_dir, "early moves swings at 0-0 / 1-0 / 0-1 only; two_strike_swing moves two-strike swings only (contact mix kept); "
              "two_strike_foul moves the two-strike foul share of contact only (swing share kept); contact moves whiffs; "
              "power and spray leave the pitch mix alone; takes keep their own mix")
row = tuple(engine.OUT_TABLE["college_d3"]["hard"]["FB"])
up, dn = S.power_row(row, 1.5), S.power_row(row, -1.5)
check(S.power_row(row, 0.0) is row and abs(sum(up) - sum(row)) < 1e-12 and up[2] > row[2] and up[4] > row[4] and up[0] < row[0]
      and dn[4] < row[4] and dn[0] > row[0] and up[1] == row[1] and up[5] == row[5], "power: extra-base hits up out of the outs (down for < 0), 0 = the same row")
pu = tuple(engine.OUT_TABLE["college_d3"]["weak"]["PU"])
check(S.power_row(pu, 1.5)[3:5] == pu[3:5], "a share of 0 (no triples / HR on a weak pop-up) stays 0")
check(set(S.HITTER_PRESETS) == {"aggressive_early", "patient", "power", "contact", "free_swinger", "two_strike_battler"} and S.PLACEHOLDER_TRAIT_SIZES,
      "the six presets, sizes flagged PLACEHOLDER (all but the two-strike parts)")
check("two_strike" not in S.HITTER_TRAITS and all("two_strike" not in p for p in S.HITTER_PRESETS.values())
      and S.TRAIT_SIZE["two_strike_swing"] == 0.23 and S.TRAIT_SIZE["two_strike_foul"] == 0.14
      and S.HITTER_PRESETS["two_strike_battler"]["two_strike_swing"] == 0.93 and S.HITTER_PRESETS["two_strike_battler"]["two_strike_foul"] == 0.44,
      "two_strike is split (ruling 11): sizes 0.23 / 0.14 (D1 fit), battler +0.93 / +0.44, no preset names the old trait")
try:
    S.parse_hitters("3:two_strike=1")
    check(False, "the old trait name is rejected by HITTERS")
except SystemExit:
    check(True, "the old trait name is rejected by HITTERS")
check(S.parse_hitters("") == {} and len(S.parse_hitters("patient")) == 9 and S.parse_hitters("3:power,4:early=1/contact=-0.5")
      == {3: {"power": 1.5, "contact": -1.0}, 4: {"early": 1.0, "contact": -0.5}}, "HITTERS parser: unset, all nine, by spot, custom")
bad = 0
for spec in ("nope", "3:early=x", "10:power", "3:spin=1"):
    try:
        S.parse_hitters(spec)
    except (SystemExit, ValueError):
        bad += 1
check(bad == 4, "HITTERS parser rejects unknown presets, traits, spots and values")

print("4. Python = JS (app/worlds.js mirrors the trait math)")
cases = []
for i, (bk, P) in enumerate(mixes[::7]):
    t = dict(list(S.HITTER_PRESETS.values())[i % 6])
    if i % 5 == 0:
        t = {"early": 0.7, "two_strike_swing": -1.2, "two_strike_foul": 1.4, "contact": 0.9, "power": -0.4, "spray": 1.0}
    cases.append({"P": P, "t": t, "b": bk[0], "k": bk[1]})
rows = [{"row": list(engine.OUT_TABLE["college_d3"][c][ty]), "pw": pw} for c in ("weak", "solid", "hard") for ty in ("GB", "LD", "FB", "PU") for pw in (-1.5, 0.5, 2.0)]
js = json.loads(subprocess.run(["node", "-e", """
const W = require('./app/worlds.js'); const inp = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(JSON.stringify({ m: inp.cases.map((c) => W.applyHitterTraits(c.P, c.t, c.b, c.k)), r: inp.rows.map((x) => W.powerRow(x.row, x.pw)),
  sizes: W.TRAIT_SIZE, presets: W.HITTER_PRESETS, ph: W.PLACEHOLDER_TRAIT_SIZES }));
"""], cwd=HERE, input=json.dumps({"cases": cases, "rows": rows}), capture_output=True, text=True, check=True).stdout)
dm = max(abs(js["m"][i][k] - v) for i, c in enumerate(cases) for k, v in S.apply_hitter_traits(c["P"], c["t"], c["b"], c["k"]).items())
dr = max(abs(a - b) for x, jr in zip(rows, js["r"]) for a, b in zip(S.power_row(tuple(x["row"]), x["pw"]), jr))
check(dm < 1e-12 and dr < 1e-12, f"{len(cases)} mixes and {len(rows)} in-play rows agree (largest differences {dm:.1e}, {dr:.1e})")
check(js["sizes"] == S.TRAIT_SIZE and js["presets"] == S.HITTER_PRESETS and js["ph"] is True, "same sizes, presets and PLACEHOLDER flag")

print("5. A traited game (HITTERS=3:power,4:two_strike_battler, seed 11)")
rc, out, csvb, err = outs[-1]
hdr = csvb.decode().splitlines()[0].split(",") if csvb else []
lines = csvb.decode().splitlines()[1:] if csvb else []
traited = [ln for ln in lines if "power=+1.50" in ln or "two_strike_swing=+0.93" in ln]
check(rc == 0 and "true_traits" in hdr and traited and b"traits contact -1.00 power +1.50" in out
      and b"traits contact +0.50 two_strike_foul +0.44 two_strike_swing +0.93" in out,
      f"runs, logs true_traits ({len(traited)} of {len(lines)} pitches to the traited hitters) and prints them in the hidden truth")
if rc:
    print(err.decode()[-1500:])

print("all v1.3 simulator-hitter checks passed" if not fails else f"{fails} check(s) failed")
sys.exit(1 if fails else 0)
