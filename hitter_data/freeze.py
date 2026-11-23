"""v1.3 full data: freeze and record the game-id list the fit uses (Drew, Nov 22 night).

The live college archive keeps growing while the collector runs. Our copy (college.sqlite3, hs.sqlite3) only changes
when `hitter_data.update` pulls, so the freeze is: (1) a manifest of every game the fits and scores read, with a sha256
per level-season, and (2) a lock file that makes `hitter_data.update` refuse to pull while it exists.

    python -m hitter_data.freeze            # write the manifest + lock (refuses if a lock with a different hash exists)
    python -m hitter_data.freeze --check    # recompute and compare with the manifest; exit 1 on any difference
    python -m hitter_data.freeze --unfreeze # remove the lock (Drew's call, after the run)

Recorded (seasons <= 2025 for fitting / scoring; 2026 counted only, never fit): college canonical games per level and
season, all and full (the harness's full-game rule), each game's source digest; HS games per season with their content
hash. The manifest lives at {DATA}/freeze/manifest_<date>.json; the lock at {DATA}/freeze/LOCK.json.
"""
import argparse, hashlib, json, os, sqlite3, sys, time
from . import DATA
from .represent import is_full

FREEZE = os.path.join(DATA, "freeze")
LOCK = os.path.join(FREEZE, "LOCK.json")
COLLEGE = os.path.join(DATA, "college", "college.sqlite3")
HS = os.path.join(DATA, "hs", "hs.sqlite3")


def ro(p):
    return sqlite3.connect("file:" + p.replace("\\", "/") + "?mode=ro", uri=True, timeout=60)


def h(items):
    return hashlib.sha256("\n".join(items).encode()).hexdigest()


def snapshot():
    c = ro(COLLEGE)
    per = {}
    for gid, lv, season, dig, pas, pf, pz in c.execute(
            "SELECT g.id, g.level, g.season, g.digest, q.pas, q.pas_full, q.pas_zero_count FROM games g "
            "LEFT JOIN game_qc q ON q.game_id=g.id WHERE g.canonical=1 ORDER BY g.id"):
        k = f"{lv}|{season}"
        d = per.setdefault(k, {"all": [], "full": []})
        d["all"].append(f"{gid}:{dig}")
        if is_full(pas, pf, pz):
            d["full"].append(gid)
    college = {k: dict(games=len(v["all"]), full_games=len(v["full"]), sha256_all=h(v["all"]), sha256_full=h(v["full"]))
               for k, v in sorted(per.items())}
    hc = ro(HS)
    hper = {}
    for gid, season, ch in hc.execute("SELECT game_id, season, content_hash FROM hs_games ORDER BY game_id"):
        hper.setdefault(str(season), []).append(f"{gid}:{ch}")
    hs = {k: dict(games=len(v), sha256=h(v)) for k, v in sorted(hper.items())}
    total = h([f"{k}:{v['sha256_all']}" for k, v in college.items()] + [f"hs{k}:{v['sha256']}" for k, v in hs.items()])
    archive_games = c.execute("SELECT archive_games FROM ingest_runs ORDER BY at DESC LIMIT 1").fetchone()
    return dict(college=college, hs=hs, sha256=total, archive_games_at_last_ingest=archive_games[0] if archive_games else None)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--unfreeze", action="store_true")
    a = ap.parse_args(argv)
    os.makedirs(FREEZE, exist_ok=True)
    if a.unfreeze:
        if os.path.exists(LOCK):
            os.remove(LOCK)
        print("unfrozen: hitter_data.update may pull again")
        return 0
    snap = snapshot()
    if a.check:
        lock = json.load(open(LOCK, encoding="utf-8"))
        man = json.load(open(lock["manifest"], encoding="utf-8"))
        diff = [k for k in set(man["college"]) | set(snap["college"]) if man["college"].get(k) != snap["college"].get(k)]
        diff += [f"hs {k}" for k in set(man["hs"]) | set(snap["hs"]) if man["hs"].get(k) != snap["hs"].get(k)]
        print("freeze check:", "OK, identical to " + lock["manifest"] if not diff else f"CHANGED: {sorted(diff)}")
        return 1 if diff else 0
    if os.path.exists(LOCK):
        lock = json.load(open(LOCK, encoding="utf-8"))
        if lock["sha256"] != snap["sha256"]:
            print("REFUSING: a freeze with a different game list exists:", lock)
            return 1
        print("already frozen:", lock["manifest"])
        return 0
    path = os.path.join(FREEZE, f"manifest_{time.strftime('%Y-%m-%d_%H%M')}.json")
    snap["frozen_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=1)
    with open(LOCK, "w", encoding="utf-8") as f:
        json.dump(dict(manifest=path, sha256=snap["sha256"], frozen_at=snap["frozen_at"]), f, indent=1)
    print(f"frozen: {path} (sha256 {snap['sha256'][:16]})")
    for k, v in snap["college"].items():
        if k.split("|")[1] >= "2022":
            print(f"  {k}: {v['games']} games, {v['full_games']} full")
    for k, v in snap["hs"].items():
        print(f"  hs {k}: {v['games']} games")
    return 0


if __name__ == "__main__":
    sys.exit(main())
