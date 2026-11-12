# v1.1 build report (six pitches, profiles, setups)

Plan: `docs/PLAN_v1.1_2026-11-12.md`. Branch `v1.1-work` from `main @ b318098` (tag `v1.0`). Every result below was run
in this session and is as printed; logs are summarized, not edited.

## Step 0: start line (Nov 12)

Environment: Linux 6.18 cloud workspace, Python 3.13.18, Node v22.23.4, Playwright Chromium 153 (preinstalled).

### Repo state
- Local tag `v1.0` → `b318098`, which is also `origin/main`. **The remote has no `v1.0` tag** (`git ls-remote` lists only
  `archive/v1.0-nov6-line` and `archive/v1.0-work`), although the plan's header says it was pushed from Drew's PC. Not a
  blocker for the build; worth a `git push origin v1.0` from that PC.
- Branch `v1.1-work` created; the three research docs and the plan committed into `docs/`.

### Baseline checks

| Check | Result |
|---|---|
| `scripts/test-app.sh` | **exit 0**, 31 min. tests.py 45/45, explain 7/7, `fast.py 40` 0 mismatches (live Python vs JS), `golden_v10.js` PASS, `app/dist` matches source, `web/lib` copies match, web demo 2/2, learn 27, db 18, import 11, rails 31, schema 24, stage2 21, worlds 31, pitch rules 41, smoke, rules_e2e 20, v10_step1_e2e 6, v10_step3_e2e 7, v10_step5_e2e 10 (301 counted checks + smoke) |
| `python3 golden/golden_v10.py check` | **PASS**, 500 cases, largest difference 0.00e+00 |
| Read-through `readthrough/scenarios.py` (v10 suite, sha256 `3bda5063…`) | **71/71**; no hard-rule row with a Not-acceptable share (`results/v11/scenarios_v10_baseline.json`) |
| Predictability grid (`grid_v10.py`, 540 cells) | every check PASS (same as v1.0); pitch-type shares saved as the call-change baseline, `results/v11/grid_v10_baseline.json` |

Environment note: the first `test-app.sh` run stopped at `db_test` with `Cannot find module 'fake-indexeddb/auto'`
because the Node dev dependencies weren't installed in this workspace. `npm ci` (the repo's `package-lock.json`)
installed them; no file changed. The re-run above is the result. `scripts/test-sql.sh` (needs a Postgres) was not run
in Step 0; it runs at Step 5, when the Supabase migration changes.

### Statcast data
`python3 fetch_statcast.py` (unchanged: 2024 and 2025, every 4th day, Apr 5–Sep 25): **88 files, 340,378 pitches**
(2024: 173,856; 2025: 166,522), the same totals as v1.0's Step 0. Two files are empty, 2024-07-18 and 2025-07-14, both
All-Star breaks. `arm_angle` is filled on 99.2% (2024) and 99.6% (2025) of pitches. The CSVs stay uncommitted
(`.gitignore:18`).

### What the baseline already shows (the plan's premise, checked Nov 12)
- v1.0 calls curveballs when the arsenal has one: 15–27% of calls in the grid arsenals at D3.
- Shape tags are close to cosmetic: on the average three-pitch arsenal at D3 (bases empty), a sweeper and a tight slider
  give identical pitch-type shares in every count (slider 27.7% either way), and riding vs running fastball moves the
  fastball share from 49.2% to 49.9%. v1.1's call-change checks measure against this baseline.

Step 0 complete. Next: Step 1 (six kinds, one migration table, exact v1.0 reproduction).
