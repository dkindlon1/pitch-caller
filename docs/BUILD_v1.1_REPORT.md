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

## Step 1: six kinds and profiles, no behavior change (Nov 12)

### What changed
- **Both engines** (`engine.py`, `app/engine.js`, copied to `web/lib/engine.js`):
  - six kinds: `KINDS = (FB, SI, FC, SL, CB, CH)`;
  - helpers `is_fastball` / `pclass` / `key_kind` (JS `isFastball` / `pclass` / `keyKind`);
  - every class decision moved to them: 19 lines in `engine.py` and 14 in `engine.js` now call a helper (counted from the
    diff: confidence, targets and heights, coach reads, sit prior, eye level, timing, damage keys, matchup keys,
    `mashed`, `v_fb`, `loc_quad`, `lean_b_h`, `shape_fit`), plus the per-kind lookups (`KIND_W`, `DEFAULT_VELO`,
    `SHAPES`, `gb_rate`, `KINDS`, validation). The plan's earlier estimate of 29 / 28 counted `is_offspeed` sites,
    which were already correct for SI / FC and needed no change.
- **One migration point and table:** `migrate_pitch(kind, shape, type)` runs inside `Pitch` creation in both engines,
  with the plan's table:
  - 13 stored types, used only while a pitch still carries that type's v1.0 tags, so a coach's later edit is never undone;
  - 14 v1.0 kind/tags;
  - 6 rows for a v1.0 fastball tag reaching a v1.1 sinker or cutter (a v1.0 portal proposal).

  It is idempotent. `check_inputs` validates kind **and** tag after migration.
- **No behavior change:**
  - each migrated pitch carries its v1.0 numbers (movement, `shape_fit` line, `KIND_W`, grounder rate, default velocity);
  - SI / FC entries equal the FB values;
  - stored situation keys (damage, matchup memory, coach reads, learner hitter keys) use `key_kind`, so a sinker reads the
    fastball's stored memory as before.
- **App:**
  - stored pitchers migrate when loaded (boot and every reload after sync), through the engine's table and the stored
    type, once per record (`kindsV = 11`). Each change is written back and logged in `meta.v11_migration`.
  - `PITCH_TYPES` (`db.js`) is now the table's types.
  - six kinds in the UI (labels, sinker / cutter colours in both themes, signs 5 and 6 as card numbers on the sign card,
    v1.1 tags in the shape list).
  - a migrated sinker or cutter keeps its v1.0 sign in its own `sign` field (O1) until the coach changes its type.
  - matchup keys are logged by fastball class.
  - the learner's change-point check reads old snapshots in v1.1 terms, so the migration alone is not a change of pitch.
  - the importer maps names to the six kinds.
- **Outside the engines:**
  - `golden/cases.py`, `fuzz.py`, `simulate.py` (matchup keys by class; the old-engine fallback), `tests.py`;
  - `readthrough/scenarios.py` (an "FB" row matches any fastball-class pitch; matchup keys by class), `readthrough/read.py`;
  - the simulated-log report scripts (`review.py`, `metrics.py`, `regrade.py`, `compare_sims.py`, `batch.py`,
    `matrix/report.py`, `readthrough/step7_compare.py`).

### Proof (run in this session, final code)

| Check | Result |
|---|---|
| `python3 golden/golden_v10.py check` | **PASS**, 500 cases, largest difference **0.00e+00** (the inputs include 108 FB/sink, 96 FB/run, 95 FB/cut, 82 CB/loopy and 116 CB/sharp pitches, all migrated on the way in) |
| `golden_v10.js` (JS against the frozen v1.0 reference) | **PASS** |
| `golden/fast.py 40` (live Python vs JS) | **0 mismatches** |
| `tests.py` | **45/45** |
| Read-through (v10 suite) | **71/71**; every call share identical to the Step 0 baseline (largest difference 0) |
| `tests_v11.py` (new, 13 checks) | **13/13**. Highlights: 33 table rows map as listed; idempotent with or without a type; a type never undoes a coach's edit; engine.py, engine.js and db.js hold one table; **against the real v1.0 engine** (`git archive v1.0`): sinkers, two-seamers, cutters, cut / run four-seamers, 12-6s, knuckle curves, splitters and slurves, typed and untyped, give the same call mix (96 situations at 4 levels, largest difference 0); sinker-only, cutter and all-six arsenals run in every count at every level; validation rejects unknown kinds and cross-kind tags; no class decision left on the bare "FB" string |
| `app/kinds_test.js` (new, 17 checks) | **17/17**: JS migration; the app's types = the engine's table; a stored v1.0 pitcher migrates once, logged, with sinker / two-seam / cutter keeping sign 1; an already-migrated pitcher is left alone; a seven-pitch arsenal with a sinker and cutter calls |
| `scripts/test-app.sh` | **exit 0**, no errors. Every check from Step 0 still passes, plus `tests_v11` 13 and `kinds_test` 17 (331 counted checks + smoke). The browser tests, the smoke test, the website demo and the `web/lib` copy check all pass |

### Written down, not hidden
- **One deliberate number change:** a stored generic "Curveball" (v1.0 stored it as CB/loopy) becomes CB/typical. Only
  its tunnel movement moves (−14/−5 → −10/−7). Every other stored type keeps its exact v1.0 numbers. `tests_v11.py`
  checks this is the only difference.
- **Open for Step 1b:** old event snapshots carry v1.0 kinds and no type, so the engine reads a typed two-seamer in an
  old snapshot as FB/runs rather than SI/two-seam. The numbers are identical now; from 1b on, the learner and replay must
  read old snapshot pitches through the roster's type (added to the plan's Step 1b).
- **The portal is still v1.0 until Step 5:** its importer copy (`web/lib/pc_import.js`), its shape proposer and the
  Supabase shape whitelist. The six extra table rows keep an accepted v1.0 proposal from breaking a v1.1 pitch in the
  meantime.
- **Release (plan Step 6):** a v1.0 app can't read SI / FC pitchers, so every device updates together.
