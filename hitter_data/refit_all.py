"""v1.3 buildout Part 4: one command that refreshes everything as the scrapes land.

    python -m hitter_data.refit_all            # every step
    python -m hitter_data.refit_all --skip-ingest --skip-zone   # reuse the ingested games / zone draft
    python -m hitter_data.refit_all --dry-run  # print the steps only

Steps (each runs as its own `python -m hitter_data.<module>` so one failure doesn't stop the rest; logs in
C:/dev/pitchiq-data/fits/logs/refit_all_<step>.log):
  1. ingest      update: copy new college games and snapshot + parse new HS (Perfect Game) games, quality + coverage
  2. represent   full-string games vs all games (K%, BB%, HBP%, runs and HR per game)
  3. fit_count   count layer per level (half-life tuned on 2025, borrowing, level split, platoon)
  4. fit_runs    run values, count x base-out per level, vs today's tables on 2025
  5. proxy       the hard-contact proxy against Single-A Statcast
  6. situation   times through the order, RISP, late and close, previous pitch: 2025 gain vs the bar
  7. traits      per-hitter traits, priors, presets, prefill files
  8. score       candidates scored on 2025 vs v1.2 and the per-count baseline
  8b. fit_count_hs  HS / travel (one level): count layer, format terms, pitch kind + velocity, run values, 2025 scores
  9. zone        zone draft (docs/ZONE_TABLE_DRAFT_v13.md), only when the Statcast files changed since the last run
Then one summary: C:/dev/pitchiq-data/fits/refit_all_summary.md (and printed).

Everything it produces is PROVISIONAL until Drew reviews it. 2026 stays held out: every fit step goes through
hitter_data.assert_not_heldout / fit_seasons itself; this driver never passes a season >= 2026.
"""
import argparse, csv, glob, hashlib, json, os, subprocess, sys, time
from . import DATA, HELDOUT_SEASON

FITS = os.path.join(DATA, "fits")
LOGS = os.path.join(FITS, "logs")
STATE = os.path.join(FITS, "refit_all_state.json")
SUMMARY = os.path.join(FITS, "refit_all_summary.md")
REPORTS = os.path.join(DATA, "college", "reports")

# (name, module, args, skip flag)
STEPS = [
    ("ingest", "update", [], "ingest"),
    ("represent", "represent", [], None),
    ("fit_count", "fit_count", [], None),
    ("fit_runs", "fit_runs", [], None),
    ("proxy", "fit_count_proxy", [], None),
    ("situation", "fit_situation", [], None),
    ("traits", "fit_traits", [], None),
    ("score", "score_candidates", [], None),
    ("fit_count_hs", "fit_count_hs", [], None),
    ("zone", "zone_seed", ["--write-doc", "--quiet"], "zone"),
]
ORDER_NOTE = "score runs after fit_count (it scores fit_count's candidates)"


def statcast_fingerprint(root=None):
    """Hash of the Statcast day files' names and sizes: changes when new Statcast lands."""
    root = root or os.path.join(DATA, "statcast")
    h = hashlib.sha256()
    for f in sorted(glob.glob(os.path.join(root, "*", "*", "*"))):
        try:
            h.update(f"{os.path.relpath(f, root)}:{os.path.getsize(f)}\n".encode())
        except OSError:
            pass
    return h.hexdigest()


def load_state(path=STATE):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def plan(args, state, fingerprint):
    """-> [(name, module, argv, reason_or_None)]; reason set = skipped."""
    out = []
    for name, mod, argv, flag in STEPS:
        reason = None
        if flag == "ingest" and args.skip_ingest:
            reason = "--skip-ingest"
        if flag == "zone":
            if args.skip_zone:
                reason = "--skip-zone"
            elif not args.force_zone and state.get("statcast_fingerprint") == fingerprint:
                reason = "no new Statcast since the last run"
        out.append((name, mod, list(argv), reason))
    return out


def run_step(name, mod, argv, python=sys.executable):
    os.makedirs(LOGS, exist_ok=True)
    log = os.path.join(LOGS, f"refit_all_{name}.log")
    t0 = time.time()
    env = dict(os.environ, PYTHONUTF8="1")
    with open(log, "w", encoding="utf-8") as f:
        rc = subprocess.call([python, "-u", "-m", f"hitter_data.{mod}", *argv], stdout=f, stderr=subprocess.STDOUT,
                             cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))), env=env)
    return rc, time.time() - t0, log


def _tail(path, n=1):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            lines = [l.rstrip() for l in f if l.strip()]
        return lines[-n:]
    except (OSError, TypeError):
        return []


def coverage_rows(seasons=(2024, 2025, 2026)):
    out = []
    try:
        with open(os.path.join(REPORTS, "coverage.csv"), encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["season"].isdigit() and int(r["season"]) in seasons:
                    out.append((r["level"], r["season"], r["distinct_games"], r["full_games_counting_0-0_in_play"],
                                r["full_share_counting_0-0"]))
    except OSError:
        pass
    return out


def score_rows():
    try:
        with open(os.path.join(FITS, "score_2025", "scores.json"), encoding="utf-8") as f:
            d = json.load(f)["summary"]
    except (OSError, ValueError, KeyError):
        return []
    out = []
    for lv, s in d.items():
        m, df = s.get("means", {}), s.get("diffs", {})
        best = min((k for k in m if k.startswith("v13_")), key=lambda k: m[k][0], default=None)
        if not best:
            continue
        v12 = "v1.2" if "v1.2" in m else "v1.2@D3"          # D3 scores v1.2 at its own (D3) settings
        diff = df.get(f"{best} - {v12}_recal", [None, None])
        out.append((lv, m.get(v12, [None])[0], m.get(f"{v12}_recal", [None])[0], best, m[best][0], diff[0], diff[1]))
    return out


def situation_rows():
    try:
        with open(os.path.join(FITS, "situation_effects.json"), encoding="utf-8") as f:
            d = json.load(f)["levels"]
    except (OSError, ValueError, KeyError):
        return []
    out = []
    for lv, s in d.items():
        p = s.get("pitch", {})
        for eff, e in p.get("effects", {}).items():
            g = e.get("gain_alone", {})
            if "gain" in g:
                se = g.get("se_max") or max((g.get("se") or {0: 0}).values())
                out.append((lv, eff, g["gain"], se))
        fg = p.get("full_gain", {})
        if "gain" in fg:
            out.append((lv, "all together", fg["gain"], fg.get("se_max", 0)))
    return out


def f4(x):
    return "" if x is None else f"{x:.4f}"


def f5(x):
    return "" if x is None else f"{x:+.5f}"


def summarize(results, started):
    L = ["# refit_all summary (PROVISIONAL)", "",
         f"Run {time.strftime('%Y-%m-%d %H:%M', time.localtime(started))}. Everything here is provisional: fit on the "
         f"data in hand, not reviewed, not wired. {HELDOUT_SEASON} was never fit or scored (coverage counts only).", "",
         "| step | result | seconds | last line |", "|---|---|---|---|"]
    for name, rc, secs, log, reason in results:
        res = f"skipped ({reason})" if reason else ("ok" if rc == 0 else f"FAILED rc={rc}")
        last = "" if reason else (_tail(log) or [""])[0][:120].replace("|", "/")
        L.append(f"| {name} | {res} | {'' if reason else f'{secs:.0f}'} | {last} |")
    cov = coverage_rows()
    if cov:
        L += ["", "## Coverage (full-string games, first-pitch 0-0 in play counted complete)", "",
              "| level | season | distinct games | full games | full share |", "|---|---|---|---|---|"]
        L += [f"| {a} | {b} | {c} | {d} | {e} |" for a, b, c, d, e in cov]
    sc = score_rows()
    if sc:
        L += ["", "## Count layer on 2025 (pitch_5way log loss per pitch; lower is better)", "",
              "| level | v1.2 | v1.2_recal (pass ref.) | best v1.3 candidate | its loss | minus recal | SE |",
              "|---|---|---|---|---|---|---|"]
        L += [f"| {a} | {f4(b)} | {f4(c)} | {d} | {f4(e)} | {f5(g)} | {'' if h is None else f'{h:.5f}'} |"
              for a, b, c, d, e, g, h in sc]
    si = situation_rows()
    if si:
        L += ["", "## Situation effects, 2025 gain alone (nats per pitch; bar: > 2 SE and >= 0.002)", "",
              "| level | effect | gain | SE | clears bar |", "|---|---|---|---|---|"]
        L += [f"| {a} | {b} | {f5(c)} | {d:.5f} | {'yes' if c > 2 * d and c >= 0.002 else 'no'} |" for a, b, c, d in si]
    L += ["", "Details: docs/FITS_COUNT_v13.md (HS: section 12, fits/hs/hs_report.md), docs/FITS_TRAITS_v13.md, docs/ZONE_TABLE_DRAFT_v13.md, docs/HS_ARCHIVE_v13.md; raw outputs under "
          f"{FITS}; quality and coverage under {REPORTS}."]
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--skip-ingest", action="store_true")
    ap.add_argument("--skip-zone", action="store_true")
    ap.add_argument("--force-zone", action="store_true")
    ap.add_argument("--only", default="", help="comma-separated step names to run (others skipped)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    state = load_state()
    fp = statcast_fingerprint()
    steps = plan(a, state, fp)
    if a.only:
        keep = set(a.only.split(","))
        steps = [(n, m, v, r if n in keep else (r or "not in --only")) for n, m, v, r in steps]
    started = time.time()
    results = []
    for name, mod, argv_, reason in steps:
        if a.dry_run:
            print(f"{name:10} python -m hitter_data.{mod} {' '.join(argv_)}" + (f"   [skip: {reason}]" if reason else ""))
            continue
        if reason:
            results.append((name, None, 0, None, reason)); print(f"{name}: skipped ({reason})"); continue
        print(f"{name}: running python -m hitter_data.{mod} {' '.join(argv_)}", flush=True)
        rc, secs, log = run_step(name, mod, argv_)
        print(f"{name}: {'ok' if rc == 0 else f'FAILED rc={rc}'} in {secs:.0f}s (log {log})", flush=True)
        results.append((name, rc, secs, log, None))
        if name == "zone" and rc == 0:
            state["statcast_fingerprint"] = fp
    if a.dry_run:
        return 0
    state["last_run"] = time.strftime("%Y-%m-%d %H:%M")
    os.makedirs(FITS, exist_ok=True)
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=1)
    text = summarize(results, started)
    with open(SUMMARY, "w", encoding="utf-8") as f:
        f.write(text)
    print(text)
    print("wrote", SUMMARY)
    return 1 if any(rc not in (0, None) for _, rc, _, _, _ in results) else 0


if __name__ == "__main__":
    sys.exit(main())
