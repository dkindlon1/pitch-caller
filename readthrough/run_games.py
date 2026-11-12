"""Play the read-through games with the engine (one engine, v0.9). Seeds fix the opposing lineup and the world.
usage (repo root): python3 readthrough/run_games.py [--seeds 101-104] [--jobs 2] [--suffix _tw] [--dest yardstick]
Writes runs/<dest>/v09<suffix>/<level>_<staff>_s<seed>.csv (dest defaults to "readthrough"; runs/ is gitignored).
Existing files are kept, so a stopped run resumes. Every hitter starts with no scouting: the engine only learns what
the game's log tells it. CALL_ENGINE (simulate.py) is inherited by each game, so a frozen engine can make the calls."""
import concurrent.futures as cf, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVELS = ["hs", "college_d3", "college_d1"]
STAFFS = ["two_pitch", "default", "four_pitch"]        # 2-, 3- and 4-pitch starters (simulate.py presets)


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def one(level, staff, seed):
    tag = "v09" + SUFFIX
    out = os.path.join(ROOT, "runs", DEST, tag, f"{level}_{staff}_s{seed}.csv")
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return out, "kept", 0.0
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tmp = out + ".part"
    code = ("import simulate, io, contextlib, os\n"
            "with contextlib.redirect_stdout(io.StringIO()): simulate.run(%d, %r)\n" % (seed, tmp))
    t0 = time.time()
    env = dict(os.environ, LEVEL=level, STAFF=staff)
    r = subprocess.run([sys.executable, "-c", code], cwd=ROOT, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        return out, "FAILED: " + r.stderr.strip().splitlines()[-1], time.time() - t0
    os.replace(tmp, out)
    return out, "ok", time.time() - t0


SUFFIX = ""
DEST = "readthrough"


def main():
    global SUFFIX, DEST
    SUFFIX = arg("--suffix", "")      # e.g. "_tw" with TRUTH_TAB=world in the environment, so those runs get their own folder
    DEST = arg("--dest", "readthrough")   # subfolder of runs/ (e.g. "yardstick" for the frozen-engine baselines)
    a, b = (int(x) for x in arg("--seeds", "101-104").split("-"))
    jobs = int(arg("--jobs", "2"))
    todo = [(lv, st, sd) for lv in LEVELS for st in STAFFS for sd in range(a, b + 1)]
    print(f"{len(todo)} games ({len(LEVELS)} levels x {len(STAFFS)} staffs x {b - a + 1} seeds)", flush=True)
    bad = 0
    with cf.ThreadPoolExecutor(jobs) as ex:
        for out, status, secs in ex.map(lambda t: one(*t), todo):
            bad += status.startswith("FAILED")
            print(f"{status:6s} {secs:5.0f}s {os.path.relpath(out, ROOT)}", flush=True)
    print("done" if not bad else f"done with {bad} failures", flush=True)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
