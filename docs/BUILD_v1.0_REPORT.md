# v1.0 build report

Plan: `docs/PLAN_v1.0_2026-11-09.md` (Drew's Nov 9 decisions D1–D11). Evidence: `docs/REVIEW_v0.9_2026-11-08.md`.
Every step appends its proof commands and the captured output here.

## Branch reset (Nov 10)

`v1.0-work` was rebuilt from `dc7cd2f` (end of Step 0). Step 0 had not found the Nov 9 plan in the repo and restored
the scrapped Nov 6 plan (`docs/PLAN_v1.0.md`) instead (`docs/STEP0_v1.0_REPORT.md` item 7), so the 16 commits after
Step 0 (Phases 1–4: RP1–RP3, CR1/CR2, guard split, usage-weighted operator, at-bat plan, pitcher-side fits) followed
the wrong plan. They are parked unchanged on branch `v1.0-nov6-line` (`48fae8b`). The Nov 6 plan file is removed here;
it remains in that branch's history.

## Step 0 — Freeze the start line

Done before the reset and kept: see `docs/STEP0_v1.0_REPORT.md` (commits `5d1ce86`, `0fc7d6f`, `dc7cd2f`).
Re-verified in a fresh checkout below before Step 1.

Re-verified at `5a68240` (`dc7cd2f` + docs only), Linux, Python 3.13, Node 22:

```
$ python3 tests.py | tail -1
19/19 checks passed
$ python3 golden/fast.py 40
40 cases (20 with full solves), 18174 values compared, tolerance 1e-09
  python 17.74s   js 2.38s
PASS: 0 mismatches
$ (cd app && node ../golden/golden_v10.js) | tail -1
PASS: JS engine reproduces v1.0
```

## Step 1 — Mechanical correctness (#2, #9, #6, #10, #8, #16, #27)

| Item | Change (Python, mirrored in `app/engine.js` → `web/lib/engine.js`) | Proof |
|---|---|---|
| #2 re-solve | `frozen_inputs` records `outs`, `bases`, `infield_in`; `needs_resolve` re-solves when any changes. App and simulator already call `needs_resolve`, so both pick it up. | `tests.py` #2: R1→R2 and an added out both flip `needs_resolve` True; unchanged state stays False; the stale-table 1-1 mix differs from the fresh one by **41%** (total variation). Browser: solve #1 → #2 (runner on 1st) → #3 (to 2nd) → #4 (an out); no change → same table. |
| #9 input check | `call_v08` and `solve_table` call `check_inputs` first (JS `solveTable` too; `callV08` already did). | `outs=3` → `ValueError: impossible number of outs 3` from both; `balls=4` → `impossible count 4-0`. |
| #6 shake-off (D2) | `allowed_calls` excludes by pitch name (`shaken_names`; older `(pitch, spot)` pairs are read as the pitch). Simulator: `shaken` holds names and lives for the whole at-bat. App: the at-bat's shake-offs live on `g.pa.shaken` (kept by undo and reload); the per-pitch `shaken` log field is unchanged, so the learner and the event schema are untouched. | `tests.py` #6: fastball 45% at 2-2 fresh → **0.000** after a shake by name and after a `(pitch, spot)` shake. Browser: shook off the Slider; the next three calls in the at-bat never include it; the next hitter starts clean. |
| #10 chase by class | `ev_adj(p, q)`: chase **+3** for a fastball (up), −3 for off-speed (low). `hbp_loc(p, q)`: chase **0.3** for a fastball, 0.8 for off-speed. **Drew, Nov 10:** the plan's 0.5 failed the plan's own proof (FB chase HBP 1.3–1.4× middle, because a chase target misses off the plate more); 0.3 (the away spots' value) chosen. | P(HBP) FB chase / FB middle at 0-2: hs 0.0080/0.0103, D3 0.0083/0.0101, D1 0.0066/0.0077. |
| #8 late and close | `is_big_spot`: `inning >= sched(s) - 2`. | HS 5th of 7 tie R2 → True; HS 4th → False; D3 6th of 9 → False; 7th → True. |
| #16 GB rates | `TYPED["gb"]` from `fit_v08.json results.gb_types` (loaded in `_apply_fit`, exported to JS with `TYPED`); `gb_rate` reads it. `inplay_fit.py`'s reference mix now uses the same rates; re-run once. | Rates match the json to 1e-12 (4-seam 0.340, sink 0.556, cut 0.412, SL 0.397, CB 0.434, CH 0.494). Re-fit hits its targets exactly at every level (T_L typed = chain); OUT_TABLE moved at most 0.023. Note the re-run also absorbs v0.7c→v0.9 drift the file's header already warned about. |
| #27 default level | Python `Situation.level` default `"college"` → `"college_d3"`, same as JS. | Every engine caller (simulator, fuzz, golden, scenarios, app) already passes a level. One `tests.py` check (R1, which exercises the retired `mixed_policy`) relied on the old default and went 94% → 100% slider; it now pins `level="college"`, the level it always ran at. Its threshold is unchanged. |

Realism gate (not due until Step 3; measured because #10 moves HBP). Percent per PA, `calib.evaluate` on `call_v08`:

| Level | K | BB | HBP | Δ K vs Step 0 | Δ BB | Δ HBP |
|---|---|---|---|---|---|---|
| `hs` | 21.05 | 14.12 | 4.13 | +0.00 | +0.07 | +0.03 |
| `college_d3` | 16.27 | 11.55 | 4.26 | -0.01 | +0.17 | +0.04 |
| `college_d1` | 19.28 | 10.98 | 3.42 | -0.07 | +0.20 | +0.06 |
| `mlb` | 19.05 | 7.09 | 0.89 | -0.07 | +0.03 | -0.01 |

All within 0.2 points of the Step 0 baseline (gate: 1 point).

New browser test `app/v10_step1_e2e.js` (added to `scripts/test-app.sh`). Run against the Step 0 build it fails three
checks (fastball re-called after its shake-off, no at-bat memory, no re-solve), so it tests the fix, not the harness.

Full checks after the re-freeze:

```
$ python3 golden/golden_v10.py check
500 cases, largest difference 0.00e+00
PASS: v1.0 reproduced within 1e-09
$ (cd app && node ../golden/golden_v10.js) | tail -1
PASS: JS engine reproduces v1.0
$ python3 golden/fast.py 40 | tail -1 ; (cd app && node ../golden/fast.js 40) | tail -1
PASS: 0 mismatches
PASS: 0 mismatches
$ python3 tests.py | tail -1
25/25 checks passed
$ cmp app/engine.js web/lib/engine.js && echo "ports identical"
ports identical
```

`scripts/test-app.sh`: **exit 1, one check red.** tests.py 25, parity, golden_v10, dist build, learn_test 27, db_test 18,
import_test 11, rails_test 31, schema_test 24, stage2_test 21 all pass; `worlds_test` 30/31. The red check is
`worlds_test` 8 ("population honesty: truth within ±1 sd between 60% and 90%"), which read 35 of 60 (58%).
It is a 10-season statistic (6 correlated readings per season) and any engine change re-rolls those seasons:

| | `worlds_test` 8 in the suite, seasons 0–9 | same code standalone, seasons 0–9 | standalone, 60 fresh seasons (100–159) |
|---|---|---|---|
| Step 0 engine | 44/60 (73%) | 46/60 (76.7% ± 5.5) | 287/360 (**79.7% ± 2.1**) |
| Step 1 engine | 35/60 (58%) | 40/60 (66.7% ± 6.1) | 290/360 (**80.6% ± 2.1**) |

Step 1 does not move the learner's coverage (79.7% vs 80.6%). The suite and standalone counts differ on the same seeds
because earlier checks in `worlds_test.js` leave shared state behind. Not changed: the check, its seasons or its band
are Drew's call (raised with him). Steps 3 and 5 change `outcome_probs` and Step 7 re-runs `worlds_test` anyway.
`v10_step1_e2e`, smoke and `rules_e2e` run after `worlds_test` in the script, so they were also run directly: all pass.

**Drew, Nov 10: `worlds_test` 8 measured on at least 40 seasons, band unchanged (60–90%).** Result on the Step 1
engine: `truth within ±1 sd: 173 of 240 (72%)` → ok; `all worlds checks passed` (31/31). That file is the only change
since the full `test-app.sh` run above, in which every other check passed, so the suite is green.
