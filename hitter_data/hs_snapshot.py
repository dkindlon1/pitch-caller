"""v1.3 Part 1 (HS): copy a consistent snapshot of the Perfect Game (DiamondKast) archive CSVs.

The archive is read-only to us: a collector is still writing scorecards and export_csv.py rewrites the CSVs now and
then (each CSV is written to <name>.csv.tmp and renamed into place at the end of an export). So we only ever read:
copy each CSV to PITCHIQ_DATA/hs/snapshot/<name>.csv.part, check the copy (source size and mtime unchanged during the
copy, every row parses with the header's column count, the last line is complete, and the game_id sets of the files
agree), and only then rename the parts into place. If an export lands while we copy, the copy is retried.

  python -m hitter_data.hs_snapshot     # copy if the archive's CSVs changed since the last snapshot"""
import csv, json, os, shutil, sys, time
from . import DATA

HS_ARCHIVE = os.environ.get("PITCHIQ_HS_ARCHIVE", os.path.expanduser(
    "~/.codex/.chatgpt-projects/g-p-6afe5c22285081919c8aea9c52b5f187/diamondkast"))
HS_DIR = os.path.join(DATA, "hs")
SNAP = os.path.join(HS_DIR, "snapshot")
FILES = ("games", "pitch_by_pitch", "lineups", "rosters", "coverage")
EXTRA = ("event_catalog.json", "event_index.json")
MANIFEST = "manifest.json"

csv.field_size_limit(10 ** 8)


def _stat(path):
    st = os.stat(path)
    return st.st_size, int(st.st_mtime)


def check_csv(path, want_ids=None):
    """-> (rows, game_ids, problems). Reads the whole file with the csv module."""
    problems = []
    with open(path, "rb") as f:
        f.seek(0, 2)
        size = f.tell()
        if size:
            f.seek(size - 1)
            if f.read(1) not in (b"\n", b"\r"):
                problems.append("last line has no newline (truncated?)")
    ids, rows = set(), 0
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.reader(f)
        head = next(r, None)
        if not head:
            return 0, ids, ["empty file"]
        gi = head.index("game_id") if "game_id" in head else None
        for row in r:
            rows += 1
            if len(row) != len(head):
                problems.append(f"row {rows} has {len(row)} fields, header {len(head)}")
                if len(problems) > 5:
                    break
                continue
            if gi is not None:
                ids.add(row[gi])
    return rows, ids, problems


def snapshot(src=None, dst=None, log=print, force=False, tries=3):
    """Returns dict(changed=bool, rows={file: n}, games=n, problems=[...]). Raises if no consistent copy was possible."""
    src, dst = src or HS_ARCHIVE, dst or SNAP
    os.makedirs(dst, exist_ok=True)
    man_path = os.path.join(dst, MANIFEST)
    old = {}
    if os.path.exists(man_path):
        old = json.load(open(man_path, encoding="utf-8"))
    names = [f + ".csv" for f in FILES] + [e for e in EXTRA if os.path.exists(os.path.join(src, e))]
    for attempt in range(tries):
        before = {n: _stat(os.path.join(src, n)) for n in names}
        if not force and old.get("source") == {n: list(v) for n, v in before.items()} and all(
                os.path.exists(os.path.join(dst, n)) for n in names):
            log("hs snapshot: archive CSVs unchanged since the last snapshot")
            return dict(changed=False, rows=old.get("rows", {}), games=old.get("games", 0), problems=[])
        t0 = time.time()
        for n in names:
            shutil.copyfile(os.path.join(src, n), os.path.join(dst, n + ".part"))
        after = {n: _stat(os.path.join(src, n)) for n in names}
        if after != before:
            log(f"hs snapshot: the archive changed while copying (attempt {attempt + 1}); retrying")
            time.sleep(5 * (attempt + 1))
            continue
        rows, ids, problems = {}, {}, []
        for f in FILES:
            n, i, p = check_csv(os.path.join(dst, f + ".csv.part"))
            rows[f], ids[f] = n, i
            problems += [f"{f}: {x}" for x in p]
        g = ids["games"]
        if ids["pitch_by_pitch"] != g:
            problems.append(f"pitch_by_pitch game_ids != games ({len(ids['pitch_by_pitch'] - g)} extra, "
                            f"{len(g - ids['pitch_by_pitch'])} missing)")
        for f in ("lineups", "rosters"):
            if not ids[f] <= g:
                problems.append(f"{f} has {len(ids[f] - g)} game_ids not in games")
        if problems:
            log("hs snapshot: copy failed checks: " + "; ".join(problems[:6]) + f" (attempt {attempt + 1})")
            time.sleep(5 * (attempt + 1))
            continue
        for n in names:
            os.replace(os.path.join(dst, n + ".part"), os.path.join(dst, n))
        man = dict(at=time.time(), source={n: list(v) for n, v in before.items()}, rows=rows, games=len(g))
        with open(man_path, "w", newline="", encoding="utf-8") as f:
            json.dump(man, f, indent=1)
        log(f"hs snapshot: copied {len(names)} files in {time.time() - t0:.0f}s; games {len(g)}; rows {rows}")
        return dict(changed=True, rows=rows, games=len(g), problems=[])
    raise RuntimeError("hs snapshot: no consistent copy after %d tries" % tries)


if __name__ == "__main__":
    snapshot(force="--force" in sys.argv)
