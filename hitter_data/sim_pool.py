"""Seed-paired simulated games for any engine tree, over a pool of worker processes (Drew's Nov 23 ruling 5).

Each game is simulate.run(seed) inside the given tree (its own engine and simulator: the world each release plays in, as
results/v13core_recal/run_sims.sh did with batch.py, one game at a time). A game depends only on its seed, so games are
spread over up to cores - 2 workers, none started above the 48 GB memory guard; output per game is a small JSON (runs,
PA, K, BB, HBP, H, HR, pitches) written atomically, so a rerun skips finished games and pooled = serial byte for byte
(`prove`). The read-through explanations and the regret pricing are log-only and stubbed when the tree has them
(why_line, intent_label, root_costs), as in kgap_diag; `prove --nostub` checks the stub changes no game.

  python -m hitter_data.sim_pool run TREE LEVEL FIRST N OUTDIR
  python -m hitter_data.sim_pool prove TREE LEVEL FIRST N OUTDIR
  python -m hitter_data.sim_pool paired DIR_A DIR_B           # runs per game b - a with paired SE, K / BB / HBP / H / HR
"""
import json
import math
import os
import subprocess
import sys
import time

from .kgap_diag import MEM_GUARD_GB, default_workers, mem_used_gb

WORKER = r"""
import contextlib, csv, io, json, os, sys
tree, level, seeds, outdir, stub = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(",")], sys.argv[4], sys.argv[5] == "1"
os.environ["LEVEL"] = level
sys.path.insert(0, tree)
os.chdir(tree)
sys.argv = ["sim"]
import engine, simulate
class P:
    def __init__(self, m, **o): self._m, self._o = m, o
    def __getattr__(self, k): return self._o[k] if k in self._o else getattr(self._m, k)
class Z(dict):
    def get(self, k, d=None): return 0.0
    def values(self): return [0.0]
if stub:
    over = {k: v for k, v in (("why_line", lambda *a, **k: ("",)), ("intent_label", lambda *a, **k: ("",))) if hasattr(engine, k)}
    simulate.CALLER = P(simulate.CALLER, **over)
    if hasattr(engine, "root_costs"):
        simulate.engine = P(engine, root_costs=lambda *a, **k: Z())
for seed in seeds:
    fp = os.path.join(outdir, f"game_{seed}.json")
    if os.path.exists(fp):
        continue
    tmp = os.path.join(outdir, f"_g{seed}_{os.getpid()}.csv")
    with contextlib.redirect_stdout(io.StringIO()):
        _, _, (them, us, runs, ur), _ = simulate.run(seed, tmp)
    rows = list(csv.DictReader(open(tmp, encoding="utf-8")))
    if os.environ.get("SIMPOOL_KEEP_CSV"):
        os.replace(tmp, os.path.join(outdir, f"game_{seed}.csv"))
    else:
        os.remove(tmp)
    g = dict(seed=seed, level=level, runs=runs, pitches=len(rows), PA=0, K=0, BB=0, HBP=0, H=0, HR=0, BIP=0)
    for r in rows:
        d = r["detail"]
        if "STRIKEOUT" in d: g["PA"] += 1; g["K"] += 1
        elif "WALK" in d: g["PA"] += 1; g["BB"] += 1
        elif "HIT BY PITCH" in d: g["PA"] += 1; g["HBP"] += 1
        elif "contact:" in d:
            g["PA"] += 1; g["BIP"] += 1
            if any(x in d for x in ("SINGLE", "DOUBLE", "TRIPLE", "HOME RUN")): g["H"] += 1
            if "HOME RUN" in d: g["HR"] += 1
    with open(fp + ".tmp", "w", encoding="utf-8") as f:
        json.dump(g, f, sort_keys=True)
    os.replace(fp + ".tmp", fp)
"""


def run(tree, level, first, n, outdir, workers=None, chunk=2, stub=True):
    tree, outdir = os.path.abspath(tree), os.path.abspath(outdir)
    os.makedirs(outdir, exist_ok=True)
    w_max = workers or default_workers()
    seeds = list(range(first, first + n))
    todo = [s for s in seeds if not os.path.exists(os.path.join(outdir, f"game_{s}.json"))]
    chunks = [todo[i:i + chunk] for i in range(0, len(todo), chunk)]
    env = dict(os.environ, PYTHONUTF8="1")
    log = open(os.path.join(outdir, "_pool.log"), "a", encoding="utf-8")
    running, bad, peak = [], [], 0.0
    t0 = time.time()
    while chunks or running:
        for p in [p for p in running if p.poll() is not None]:
            bad.append(p.returncode)
            running.remove(p)
        mu = mem_used_gb()
        peak = max(peak, mu or 0.0)
        while chunks and len(running) < w_max and (mu is None or mu < MEM_GUARD_GB):
            sl = chunks.pop(0)
            running.append(subprocess.Popen([sys.executable, "-c", WORKER, tree, level, ",".join(map(str, sl)), outdir,
                                             "1" if stub else "0"], cwd=tree, env=env, stdout=log, stderr=log))
            mu = mem_used_gb()
        time.sleep(0.5)
    done = sum(os.path.exists(os.path.join(outdir, f"game_{s}.json")) for s in seeds)
    print(f"done {tree} {level}: {done}/{n} games, {time.time() - t0:.0f} s, peak RAM {peak:.1f} GB, exits {sorted(set(bad))}",
          flush=True)
    return done == n


def prove(tree, level, first, n, outdir):
    """pooled (one seed per process) vs serial (one process, in order) vs unstubbed: every game JSON and pitch log equal"""
    import filecmp
    import shutil
    shutil.rmtree(outdir, ignore_errors=True)
    os.environ["SIMPOOL_KEEP_CSV"] = "1"
    run(tree, level, first, n, os.path.join(outdir, "serial"), workers=1, chunk=n)
    run(tree, level, first, n, os.path.join(outdir, "pool"), workers=n, chunk=1)
    run(tree, level, first, n, os.path.join(outdir, "nostub"), workers=n, chunk=1, stub=False)
    names = [f"game_{s}.{x}" for s in range(first, first + n) for x in ("json", "csv")]
    res = {}
    for other in ("pool", "nostub"):
        res[other] = all(filecmp.cmp(os.path.join(outdir, "serial", nm), os.path.join(outdir, other, nm), shallow=False)
                         for nm in names if not (other == "nostub" and nm.endswith(".csv")))
    # the stub blanks the log-only explanation / regret columns, so only the game JSON is compared for nostub
    print(json.dumps(dict(tree=tree, level=level, seeds=[first, first + n - 1], serial_eq_pool=res["pool"],
                          stub_eq_nostub_games=res["nostub"])), flush=True)
    return all(res.values())


def load(d):
    out = {}
    for fn in os.listdir(d):
        if fn.startswith("game_") and fn.endswith(".json"):
            g = json.load(open(os.path.join(d, fn), encoding="utf-8"))
            out[g["seed"]] = g
    return out


def paired(da, db):
    A, B = load(da), load(db)
    seeds = sorted(set(A) & set(B))
    n = len(seeds)
    d = [B[s]["runs"] - A[s]["runs"] for s in seeds]
    m = sum(d) / n
    se = math.sqrt(sum((x - m) ** 2 for x in d) / (n - 1) / n)

    def rate(G, k):
        num = [G[s][k] for s in seeds]
        den = [G[s]["PA"] for s in seeds]
        R = sum(num) / sum(den)
        md = sum(den) / n
        v = sum((x - R * y) ** 2 for x, y in zip(num, den)) / (n - 1)
        return R, math.sqrt(v / n) / md
    res = dict(games=n, runs_a=sum(A[s]["runs"] for s in seeds) / n, runs_b=sum(B[s]["runs"] for s in seeds) / n,
               diff=m, se=se, rates={k: (rate(A, k), rate(B, k)) for k in ("K", "BB", "HBP", "H", "HR")},
               pitches_per_pa=(sum(A[s]["pitches"] for s in seeds) / sum(A[s]["PA"] for s in seeds),
                               sum(B[s]["pitches"] for s in seeds) / sum(B[s]["PA"] for s in seeds)))
    print(json.dumps(res), flush=True)
    return res


if __name__ == "__main__":
    c = sys.argv[1]
    if c == "run":
        sys.exit(0 if run(sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]) else 1)
    if c == "prove":
        sys.exit(0 if prove(sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]) else 1)
    if c == "paired":
        paired(sys.argv[2], sys.argv[3])
