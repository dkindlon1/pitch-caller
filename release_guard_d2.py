"""Release guard for college D2 (v1.3 Part 3, plan 3.5): D2 can't ship on D3's numbers.

D2 is a product level in both engines, the app and the portal, but until its own fits exist every D2 table is D3's,
marked PLACEHOLDER_D2 (engine.py _fill_d2_placeholders, engine.js, app/engine_data.json's "PLACEHOLDER_D2" list). This
guard exits non-zero while any placeholder remains:
  - engine.D2_PLACEHOLDERS (the tables the Python engine filled from D3) is not empty;
  - app/engine_data.json or web/lib/engine_data.json still lists placeholder tables;
  - the marker PLACEHOLDER_D2 appears in any tracked code or data file (other than this guard and its test).
It is deliberately NOT part of scripts/test-app.sh (the suite stays green while D2 is plumbing only). The release
checklist runs it; tests_v13_d2.py checks that it trips today.

  python3 release_guard_d2.py      -> lists every placeholder, exits 1 while any remain, 0 when D2 is fitted
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MARK = "PLACEHOLDER_" + "D2"          # split so this file's own text isn't a hit
EXTS = (".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".sql", ".html", ".sh")
SKIP = {"release_guard_d2.py", "tests_v13_d2.py"}
DATA = ("app/engine_data.json", "web/lib/engine_data.json", "web/lib/engine_data_d3.json")


def tracked(root):
    try:
        out = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True).stdout.split("\n")
    except Exception:          # not a git tree (the guard's own test): every file under root
        out = [os.path.relpath(os.path.join(d, f), root).replace(os.sep, "/") for d, _, fs in os.walk(root) for f in fs]
    return [f for f in out if f and f.endswith(EXTS) and os.path.basename(f) not in SKIP
            and not f.startswith(("docs/", "hitter_data/")) and "node_modules/" not in f]


def findings(root, engine_placeholders=None):
    """Every placeholder still in the tree at root, as readable lines (empty = D2 is fitted)."""
    out = []
    if engine_placeholders:
        out.append(f"engine.py: D2_PLACEHOLDERS = {list(engine_placeholders)}")
    for rel in DATA:
        p = os.path.join(root, rel)
        if os.path.exists(p):
            try:
                lst = json.load(open(p, encoding="utf8")).get(MARK) or []
            except Exception as ex:
                lst = [f"unreadable: {ex}"]
            if lst:
                out.append(f"{rel}: {MARK} = {lst}")
    for rel in tracked(root):
        if rel in DATA:
            continue
        try:
            text = open(os.path.join(root, rel), encoding="utf8", errors="replace").read()
        except OSError:
            continue
        n = text.count(MARK)
        if n:
            out.append(f"{rel}: {n} {MARK} marker{'s' if n > 1 else ''}")
    return out


def main():
    sys.path.insert(0, HERE)
    import engine
    f = findings(HERE, engine.D2_PLACEHOLDERS)
    if f:
        print(f"FAIL: college D2 still runs on D3's numbers ({len(f)} places). Fit D2 and remove every {MARK} before release:")
        for x in f:
            print("  " + x)
        sys.exit(1)
    print("PASS: no D2 placeholders remain")


if __name__ == "__main__":
    main()
