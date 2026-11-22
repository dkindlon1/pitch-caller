"""v1.3 core: writes the shared refit's table files (zone_v13refit.json, count_v13refit.json, run_v13refit.json).

The shared refit (feat/hitter-v13-refit, docs/REFIT_v13.md) changed numbers that the tables branch had moved out of the
engines into data_tables/: the called-strike count kappas (fit_v08.json ship.kappa), the typed in-play tables
(inplay_typed_params.py OUT_TABLE / RUNNER_FIT), RE24 and count values (run_tables.py) and the walk / strikeout values
(college_run_values.json). This script restates them in the table formats exactly as data_tables/build_v12.py does for
v1.2, reading the working-tree (refit) sources instead of git 90fca9b. The refit left the zone terms alone, so the zone
file is v12's with a new version name.

With these three files loaded the merged engine reproduces the refit tip (21f44ac, numbers as literals) bit for bit:
golden/golden_v11.js v13refit, golden/fast.py and tests_v13_tables.py check it.

  python3 data_tables/build_v13refit.py           -> (re)write the three files
  python3 data_tables/build_v13refit.py --check   -> exit 1 if a shipped file differs from what this script builds
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_v12 as B

VERSION = "v13refit"
TREE = B.Source(None)


def zone_v13refit():
    t = B.zone_v12()
    t["version"] = VERSION
    t["about"] = ("The shared refit's zone effects (data_tables/build_v13refit.py): the refit did not touch the zone terms, so "
                  "this is zone_v12 under a new name (flat +0.5 hanger, +0.2 off-speed chase, every cell 0). Format: docs/TABLES_v13.md.")
    return t


def count_v13refit():
    t = B.count_v12(TREE)
    t["version"] = VERSION
    t["about"] = ("The shared refit's count layer (data_tables/build_v13refit.py): v1.2's count terms, the refit's called-strike "
                  "kappas (fit_v08.json ship.kappa centred on sim_constants.json TAKE_W) and the refit's typed in-play tables "
                  "(inplay_typed_params.py). Format: docs/TABLES_v13.md.")
    return t


def run_v13refit():
    t = B.run_v12(TREE)
    t["version"] = VERSION
    t["about"] = ("The shared refit's run values (data_tables/build_v13refit.py): RE24 and count values from run_tables.py, walk / "
                  "strikeout values from college_run_values.json. The run-scale denominator is pinned at v1.2's MLB RE[0|000] = "
                  "0.481 in the engines (ruling 10), not read from re.mlb. College D2 has none yet (D3's: PLACEHOLDER). Format: "
                  "docs/TABLES_v13.md.")
    return t


BUILD = {"zone": zone_v13refit, "count": count_v13refit, "run": run_v13refit}


def main():
    check = "--check" in sys.argv
    bad = []
    for kind, fn in BUILD.items():
        path = os.path.join(HERE, f"{kind}_{VERSION}.json")
        text = B.dumps(fn()) + "\n"
        if check:
            cur = open(path, encoding="utf8", newline="").read() if os.path.exists(path) else None
            same = cur is not None and json.loads(cur) == json.loads(text)
            print(f"  {'ok  ' if same else 'FAIL'} {kind}_{VERSION}.json matches what build_v13refit.py builds from the refit sources")
            if not same:
                bad.append(kind)
        else:
            with open(path, "w", encoding="utf8", newline="\n") as f:
                f.write(text)
            print("wrote", path)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
