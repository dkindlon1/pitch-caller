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

## Step 2 — One window (#1, #25, D1, D7, then D5)

### 2a. Guardrail removed, 3-1 setting, recalibration (tunneling off)

- `root_call` / `rootCall`: the `GUARD_DELTA` cut is deleted (constant removed from both engines). The root now costs
  every allowed call and `policy_from_costs`' stakes-scaled never-pick window is the only rule that drops one, the same
  operator `solve_table` uses (#1, #25). `tests_v09_followups.py` now asserts the constant is gone and the root covers
  every allowed call.
- **D1, Drew's calls (Nov 10):** one 3-1 setting at every level (stakes factor **1.3**, see below); the floor is by
  pitch type ("the fastball as a pitch >= 50%"), not the exact spot; cells where the window leaves one pitch are the
  engine's call and are reported, not gated (no new variety rule; the plan adds no new terms).
- **Walks rose 1.2-1.3 points at every level** with the guardrail gone (more off-speed in 2-0/2-1/3-1); the 3-1 setting
  added 0.02. **Drew: recalibrate to the v1.0 mix.** `fit_all.py college_d1 college_d3 hs` (187 s, converged, max
  weighted relative error 0.005), mlb left as is, as in Step 0. Only the four pitcher-side keys moved:

| key | Step 1 | Step 2 | change |
|---|---|---|---|
| `hs.hbp` | 0.1318 | 0.1292 | -0.0026 |
| `hs.wild` | 0.2679 | 0.2384 | -0.0295 |
| `hs.wz` | -0.3140 | -0.3267 | -0.0127 |
| `hs.wo` | 0.1288 | 0.1162 | -0.0126 |
| `college_d3.hbp` | 0.1402 | 0.1462 | +0.0060 |
| `college_d3.wild` | 0.2259 | 0.1880 | -0.0379 |
| `college_d3.wz` | -0.8645 | -0.9031 | -0.0386 |
| `college_d3.wo` | -0.4217 | -0.4603 | -0.0386 |
| `college_d1.hbp` | 0.1141 | 0.1177 | +0.0036 |
| `college_d1.wild` | 0.1993 | 0.1601 | -0.0392 |
| `college_d1.wz` | -0.4267 | -0.4831 | -0.0564 |
| `college_d1.wo` | 0.0162 | -0.0403 | -0.0565 |

  Wildness came back down 0.03-0.04 at each level, part of the rise Step 0 needed for v0.9's fastball-heavy mix.
- The recalibration moved the 3-1 mix (less wild pitchers make the fastball-middle strike worth more): at 1.2 D1 with a
  runner on 1st went to 81.3%. Re-running Drew's rule (one value at every level, best fit) in the recalibrated world:
  1.2 -> 7/9 in 55-70% (D1/R1 81.3%), **1.3 -> 8/9** (D1/R1 78.9%), 1.4 -> 7/9, 1.5 -> 6/9. Set to 1.3. Before the
  recalibration the best single value was 1.2 (6/9).

`tests.py` (grid gates as Drew settled them; the v0.7c "3-0 / 3-1" check on the retired `call_mixed` is replaced):

```
[PASS] v0.6 realism (mlb): K 19.5% vs 20.0%, BB 7.9% vs 7.9%, HBP 0.8% vs 0.9%
[PASS] v0.6 realism (college_d3): K 16.3% vs 16.2%, BB 11.4% vs 11.4%, HBP 4.2% vs 4.2%
[PASS] v0.6 realism (hs): K 21.0% vs 21.0%, BB 14.0% vs 14.1%, HBP 4.1% vs 4.1%
[PASS] v1.0 grid: AVG3, every count but 3-0: top call <= 85% and >= 2 calls survive the window   0 of 99 cells fail
[PASS] v1.0 grid: D1 3-1, AVG3: top call inside 50-80% in all 9 situations (target 55-70%), two pitch types > 10%
       8 of 9 in 55-70%; D1/R1 78.9%, D1/R3 57.3%, D1/empty 61.1%, D3/R1 68.5%, D3/R3 57.5%, D3/empty 59.1%,
       hs/R1 67.2%, hs/R3 61.6%, hs/empty 55.2%
[PASS] v1.0 grid: floor: AVG3's top pitch type >= 50% at 2-0, 2-1, 3-1   lowest 51%
[PASS] v1.0 grid: race to two strikes: AVG3 first-pitch strike-target share >= 85%   lowest 100%
[PASS] v1.0 grid: no chase as the top call at 3-0, 3-1, 2-2 (every arsenal)   0 cells
[INFO] 3-0 AVG3 fastball: hs/empty 61%, hs/R1 74%, hs/R3 71%, D3 66/77/77%, D1 69/90/82%
[INFO] all arsenals: cells where the window leaves a call over 85% or one call: 19 of 495
[INFO] Medium variety: cells with a pitch type over 85%: 22
[INFO] Medium variety: trusted secondaries under 5%: 100 pitch-cells (power changeup 53, four-pitch changeup 26, ...)
29/29 checks passed
```

The 3-0 line: v0.7c's "60%+ fastball at 3-0" was only ever measured on the retired path. On the live engine HS with
the bases empty read 58.9% at Step 1 (guardrail on) and 58.8% with it off before the recalibration; 61% now. Reported,
not gated; the plan leaves 3-0 untouched.

Full grid (all five arsenals, top-call share per count): `results/v10/step2_grid_tunneling_off.txt`.
Parity: `golden/fast.py 40` and `fast.js 40`, 0 mismatches. `golden_v10` is re-frozen once, at the end of Step 2.


### 2b. Tunneling on chase swings wired (D5)

- `seq_fit.py --decide` ships `beta_tun_whiff` and `beta_tun_chase` from their own fits (previously one `beta_tun`
  from `tun_whiff` only): whiff **0** (interval includes 0, excludes the spec 0.15), chase **+0.310** (SE 0.034, ships).
  `fit_v08.json ship`: those two keys replace `beta_tun`; nothing else in `ship` changed. `pair_terms` / JS twin use
  whiff on the whiff shift and chase on the off-zone swing shift; the why-line "tunneling" term zeroes both.
- What it does to calls (AVG3, 54 situations after a previous pitch, hs/D3/D1 x 0-1/0-2/1-2/2-2/3-2/1-1 x three last
  pitches): calls shift by **4.4%** on average (total variation), at most 15.9% (HS 2-2 after a fastball up-in);
  the chase share is unchanged (3.9% -> 3.8%): the shift is toward pitches that tunnel off the last one. The
  predictability grid is identical with it on (its cells have no previous pitch). HS is not yet scaled by `RHO_L`
  (Step 5 #19).
- Two v0.6 checks in `tests.py` still measured the retired `call_mixed`, which shares `pair_terms`, so wiring tunneling
  moved them. **Drew, Nov 10:** both now measure the live `call_v08`:
  - "Get it over": on the live engine at Step 1 the guardrail cut slider-middle at 2-1 to **0%** even when landing,
    so the rule had never acted there; Step 2 revives it. A 3-for-9 slider loses 47% of those calls with tunneling
    off, 44% on. "About half" = 40% or more (bar `b < 0.60 a`).
  - "R1 mixing": "mostly slider" (50%+) only ever held on the retired path; the live engine calls slider 42-48% there
    (Step 1 too). New bar: slider is the top pitch, nothing at 95%+. Now slider 42%, fastball 41%, changeup 17%:
    on top by one point, so a later step can flip it.
- Realism unchanged by tunneling (D3 K 16.3 / BB 11.4 / HBP 4.2 vs real 16.2 / 11.4 / 4.2; HS 21.0 / 14.0 / 4.1 vs
  21.0 / 14.1 / 4.1; mlb 19.5 / 7.9 / 0.8 vs 20.0 / 7.9 / 0.9). `tests.py` **29/29**.
- Simulator, for the yardstick: a frozen pre-v1.0 caller (`CALL_ENGINE`) gets shake-offs as it took them, a
  (pitch, spot) pair for that pitch only; v1.0 gets pitch names for the whole at-bat (Step 1, D2). Without this the
  v0.9 baseline would have ignored every shake-off. Smoke test: one v0.9-caller game in this tree, then
  `step7_regret.py` on it: 132 pitches, regret read, 0 difference against itself.

### Yardstick (D5 order, D7 budget): runs on Drew's PC

One simulated game takes ~2.5 min on this workspace's 2 cores, so the four 108-game runs (~7 h here) run on Drew's PC at
10 jobs (~25 min each, as in Step 0): `scripts/yardstick_step2.ps1`. It builds a worktree per commit and, in each
tree's own world, plays the frozen v0.9 engine and that tree's v1.0 engine on seeds 101-112:
2a = `b50f02f` (tunneling off), 2b = the Step 2 head (tunneling on). Output: `results/v10/yardstick_step2a.txt` and
`yardstick_step2b.txt`. **Not yet run.** D7: under 0.25 runs/game the step ships; over it, stop and show Drew.

### Step 2 checks

- **`stage2_test` D5 (learner safety switch), Drew Nov 10: 40 seasons, same bars.** On 5 seasons it read 2/5 caught
  on Step 2 (4/5 on Step 1); on 40 fresh seasons (600-639) 37/40 on the Step 1 engine and 38/40 on Step 2, with 1
  false switch-off each (pre-existing). Now caught in >= 80% of seasons 500-539 and at most 1 false switch-off:
  **34/40 caught, 1/40 false** -> ok.

```
$ python3 golden/golden_v10.py check          (after `make --force` for Step 2)
500 cases, largest difference 0.00e+00
PASS: v1.0 reproduced within 1e-09
$ python3 golden/fast.py 40 ; (cd app && node ../golden/fast.js 40)
PASS: 0 mismatches
PASS: 0 mismatches
$ python3 tests_v09_followups.py | tail -1
all follow-up checks passed
$ bash scripts/test-app.sh ; echo exit=$?
tests.py: 29 checks passed        parity: 1      golden_v10: 1      build: app/dist matches the source
learn_test: 27   db_test: 18   import_test: 11   rails_test: 31   schema_test: 24   stage2_test: 21
worlds_test: 31 (check 8: 176 of 240, 73%)   pitch_rules_test: 41   smoke: passed   rules_e2e: 20   v10_step1_e2e: 6
exit=0
```

**Step 2 status: built and checked here; the yardstick (D5 keep/drop of tunneling, D7 runs budget) is the one open
item, run on Drew's PC with `scripts/yardstick_step2.ps1`.**

### Yardstick results (Drew's PC, Nov 10): **over the D7 budget, stopped**

`scripts/yardstick_step2.ps1`, 108 paired games per comparison, seeds 101-112, 3 levels x 3 staffs, each tree's own
world. Files: `results/v10/yardstick_step2a.txt`, `yardstick_step2b.txt` (commit `b2437df`). The measure is world
regret (`regret_w_*`: every call scored against one table solved in the world's model, the same for both engines),
runs per game, v1.0 minus v0.9:

| | world regret, whole mix | world regret, call made | runs allowed |
|---|---|---|---|
| 2a, tunneling off | **+0.313 ± 0.043** | +0.305 ± 0.047 | +0.74 ± 0.54 |
| 2b, tunneling on | **+0.352 ± 0.060** | +0.335 ± 0.063 | +0.35 ± 0.58 |

- **D7 (0.25 runs/game): over.** Tunneling off reads 0.31, 1.5 SE above the budget; on, 0.35. Runs allowed point the
  same way but are noise at this sample (SE ~0.55), as the plan expected.
- **Where the cost is (2a):** 0-0 and 1-0 carry +0.168 of the +0.305 (55%); the hitter's counts 2-0/2-1/3-1 +0.079
  (26%); the rest +0.058. By call it is off-speed in the zone (middle and edge-away): +0.32/game; fastball middle and
  edge-away calls got cheaper. Removing the guardrail loosened every count, and the early counts are where most
  pitches are.
- **D5, tunneling:** 2b's cost is 0.03-0.04 higher than 2a's, inside the noise (the two use different worlds, so they
  are not paired against each other). The yardstick shows no measurable gain from tunneling and no clear harm.

Per D7 nothing was tuned. Waiting on Drew's call.

### 2c. Over budget: 0-0 and 1-0 tightened (Drew, Nov 10); tunneling kept

**Drew's calls:** tighten 0-0 and 1-0 only (keep the hitter's-count variety), aiming at ~0.2 runs/game; **keep
tunneling on chase** (real-data fit +0.310, 9 SE; the yardstick showed no measurable gain or harm).

- Both counts sat at the formula's cap (stakes factor 1.5). Set to **0.9** in both engines (`stakes_factor`).
- Chosen with a regret proxy, so the PC isn't burned on guesses: per-pitch expected regret against the engine's own
  costs (sum of mix x cost minus the best call's cost), over AVG3 / two-pitch / four-pitch x hs/D3/D1 x bases empty /
  R1 x three last pitches. Checked against the yardstick: the proxy puts the 0-0 excess over the guardrail engine at
  0.0018 runs/pitch, the yardstick 0.0020; at 1-0 the proxy reads about twice the yardstick, so it is scaled.

  | 0-0 / 1-0 setting | proxy regret/pitch, 0-0 | 1-0 | AVG3 top call (max) |
  |---|---|---|---|
  | Step 1 engine (guardrail) | 0.0107 | 0.0076 | 100% |
  | 1.5 (Step 2b as run) | 0.0125 | 0.0140 | 55% |
  | 1.0 | 0.0112 | 0.0117 | 65% |
  | **0.9** | **0.0102** | **0.0102** | 68% |
  | 0.8 | 0.0091 | 0.0086 | 71% |
  | 0.6 | 0.0067 | 0.0049 | 80% |

  Projection at 0.9: the 0-0 excess goes to about zero and 1-0 keeps ~40% of it, so 0-0 + 1-0 drop from +0.168 to
  ~+0.03 runs/game: **~0.20 with tunneling on** (~0.17 off). A projection, not a measurement: the yardstick re-run
  (`scripts/yardstick.ps1 -Tag 2c`) decides.
- First pitches still mix: AVG3 at 0-0 throws the fastball 47-60% (top single call 17-37%); 1-0 fastball 54-69%.
  Grid at 0.9: every hard check passes (0 of 99 AVG3 cells over 85%; 3-1 8 of 9 in band, unchanged; floor 51%;
  first-pitch strike target 100%; no chase at 3-0/3-1/2-2).
- Realism after the change, no recalibration (inside the 1-point gate): D3 K 16.3 / BB 11.0 / HBP 4.1 vs real
  16.2 / 11.4 / 4.2; HS 21.1 / 13.7 / 4.0 vs 21.0 / 14.1 / 4.1; mlb 19.4 / 7.7 / 0.9 vs 20.0 / 7.9 / 0.9.
  `tests.py` 29/29; `golden/fast.py 40` 0 mismatches.
- Step 2c checks: `golden_v10` re-frozen, `golden_v10.py check` 500 cases, largest difference 0 -> PASS;
  `scripts/test-app.sh` **exit 0** (tests.py 29, parity, golden_v10, dist build, learn 27, db 18, import 11,
  rails 31, schema 24, stage2 21, worlds 31, pitch_rules 41, smoke, rules_e2e 20, v10_step1_e2e 6).
- **Open: the yardstick re-run on Drew's PC** (`scripts/yardstick.ps1 -Tag 2c -Commit dd1be1e`). Under 0.25 runs/game,
  Step 2 is done; over it, back to Drew.

### Yardstick re-run, Step 2c (`dd1be1e`, tunneling on): **under budget, Step 2 ships**

Drew's PC, 108 paired games, seeds 101-112. `results/v10/yardstick_step2c.txt` is copied from his terminal output.

| | world regret, whole mix | world regret, call made | runs allowed | pitches |
|---|---|---|---|---|
| 2b (0-0/1-0 at 1.5) | +0.352 ± 0.060 | +0.335 ± 0.063 | +0.35 ± 0.58 | +1.7 |
| **2c (0-0/1-0 at 0.9)** | **+0.158 ± 0.050** | **+0.141 ± 0.052** | -0.60 ± 0.49 | -4.3 |

- **D7: 0.16 runs/game, under 0.25** (1.8 SE below). The projection was ~0.20. 0-0 and 1-0 went from +0.168 to
  +0.004; what's left sits in the hitter's counts (2-0/2-1/3-1 +0.066) and 0-1/1-1 (+0.064), as intended.
  Runs allowed and pitches per game both point the right way but are inside the noise.
- **By level, D3 stands out:** world regret hs +0.050 ± 0.086, **D3 +0.369 ± 0.090**, D1 +0.054 ± 0.077. The budget is
  per game over all levels, which passes, but D3 alone would sit above 0.25. Flagged for Drew; worth a look when Step 3
  (landing) and Step 5 (fits) change D3's numbers again.

**Step 2 done:** #1, #25, D1, D5 (kept), D7 closed.

## Step 3 — Landing, confidence, repeats (#4 all parts, #13, D1 acceptance, D8)

**One landing anchor.** `landing_today[pitch] = (strikes, expected strikes, pitches)`; `expected_strike(p, q, s, ars)`
is the model's own chance the call is a strike (1 - ball - wild-pitch ball - HBP) with no landing news, taken before
the result. `landing_estimate` returns his deviation from his own expectation, shrunk toward 0 (`(strikes - expected)
/ (LAND_K + n)`); `LAND_CENTER` is deleted; `not_landing` = 4+ pitches and deviation <= -0.15. Both engines, the
simulator, the app, the learner's worlds and both replay checks build the same record.

Two places where the plan had to be read, both settled in favour of its intent:
- **Chase targets stay out of the record.** The plan's formula charges a taken chase as a 0.42-strike miss; four
  chase takes would then read -0.19, past the -0.15 block, which is bug #4 itself, while the plan's own test says
  four chase takes leave it unchanged. Followed the test and the review's fix: a chase is a ball by design.
- **Confidence scaling (v0.7) needed a reference on the new scale.** `update_confidence` used `LAND_CENTER` to
  compare a learned pitcher's strike rate with an average one. The learner now serves `strike_rate` as the model's
  own rate (drops ~0.1, as the plan expected) and the app passes `strike_ref`, the same model rate for a 3/3 pitch of
  that kind at his level; the scaling uses the two. Plumbing, no new term; with no `strike_ref` there is no scaling.

**Drew, Nov 10 (D1): landing is two-sided.** With the honest expectation the fastball (4/10) took a wildness penalty
but the slider (8/10) got nothing for beating expectations, so the fastball stayed the top 3-1 pitch (35-40% vs
32-34%). Now a pitch landing better than expected sharpens, capped at `LAND_SHARP_MAX = 0.3` (the landing shift run
backwards; mass is conserved). Slider on top at every level: hs 44 / D3 47 / D1 49%.

- Old-format records (open games in the app, golden inputs, fuzzers, offline tools) are read once as expected =
  pitches x the old class rate (`landing_triple`, the plan's compat rule), in the engine so every reader agrees.
- Confidence: a ball on a chase target is no debit unless it went way off (no location logged counts as just off);
  an HBP is no longer a "ball" (simulator, app, learner's script and worlds).
- D8: `rep_same_spot` applies after a foul or contact only, not after a ball or called strike.
- Get-it-over: a slider 3-for-9 at 2-1 (5.2 expected) now loses all its get-it-over calls: 3 against 5.2 crosses the
  not-landing line. Drew's bar was "about half or more"; reported so it isn't a surprise. 7-for-9 gains (26% -> 34%).

`tests.py` **34/34** (5 new):
```
[PASS] v1.0 #4 landing: at his own expected strike rate after 12 pitches, wild-today < 0.03 at every level
       hs -0.000, college_d3 -0.000, college_d1 -0.000; HS fastball 6/12 with 6.2 expected reads 0.056 (the old fixed center read 0.45)
[PASS] v1.0 #4 chase takes: a ball on a chase target is no confidence debit (just off, or no location logged); way off is
[PASS] v1.0 #4 landing filter: a 0.30-strike-rate pitch going 2/4 is not blocked or wild; a 0.72 pitch going 2/4 is flagged
       0.30 pitch 2/4: wild -0.30, blocked False; 0.72 pitch 2/4: wild +0.39, blocked False
[PASS] v1.0 D8 repeat: fastball up-away again after a take whiffs within 0.002 of fresh; after a foul the penalty applies
       fresh 0.0428, ball 0.0428, cstrike 0.0428, foul 0.0328
[PASS] v1.0 D1 3-1: with the slider 8-for-10 and the fastball 4-for-10 today, the slider is the top 3-1 pitch at every level
       hs: Slider 44%, Fastball 33%, Changeup 23%; college_d3: Slider 47%, Fastball 30%, Changeup 23%; college_d1: Slider 49%, Fastball 27%, Changeup 24%
```
New browser test `app/v10_step3_e2e.js` (in `test-app.sh`): chase balls (no location / just off) leave confidence
and the record alone, a zone ball adds one pitch and his expectation, an HBP changes confidence only by the usual
between-hitters drift, an old-format game calls and converts. On the Step 0 build it fails 5 checks.
`replay_e2e` / `replay_check`: landing records compared with strikes and pitches exact and the expectation to 1e-9
(the logged snapshot differs from the live situation in the 16th digit).

Realism gate against the Step 0 baseline (gate: 1 point), `calib.evaluate` on `call_v08`:

| Level | K | BB | HBP | Δ K | Δ BB | Δ HBP |
|---|---|---|---|---|---|---|
| `hs` | 21.10 | 13.67 | 3.99 | +0.05 | -0.38 | -0.11 |
| `college_d3` | 16.29 | 10.99 | 4.13 | +0.01 | -0.39 | -0.09 |
| `college_d1` | 19.30 | 10.45 | 3.30 | -0.05 | -0.33 | -0.06 |

Limit: `calib` plays at-bats one at a time from a fresh state, so in-game landing and confidence don't reach it; only
full simulated games (the yardstick) exercise them.

Learner checks after Step 3 (the learner now serves the model's own strike rate and replays confidence by the new
rules):
- `stage2_test` D5 false switch-offs: **2 of 40, red** (bar at most 1). On 80 fresh seasons (700-779) the Step 2 engine
  reads 1/80 false and 78% caught, Step 3 2/80 and 81%: Step 3 didn't change the switch; its false rate (~2%) sits at
  the bar. **Drew, Nov 10: leave it red until Step 7 retunes the switch.**
- `worlds_test` 3 (v2 at least as close as v1) flipped on 5 seasons (v1 2.01, v2 2.06; truth 2). On 40 (seeds 30-69)
  v2 is closer: mean error 0.085 vs 0.090 (Step 2 engine 0.131 vs 0.157, so both learners got more accurate). Per
  Drew's standing rule for noisy learner checks, now 40 seasons, bar unchanged: v1 2.06, v2 2.05 -> ok; 31/31.
- `fuzz.py` "big counts mix tighter than 0-0" was encoded as "2-2 below 1, 0-0 above 1"; Step 2c set 0-0 to 0.9, so it
  had failed since 2c (the fuzzer isn't in `test-app.sh`). Rewritten as its title says (2-2 and 3-2 below 0-0: 0.59-0.63
  and 0.50 vs 0.90): 29/29.

Checks run (`test-app.sh` stops at the first red suite, so everything after `stage2_test` was run on its own):
```
tests.py 34/34   tests_v09_followups: all passed   parity (make_parity + parity.js): PASS   fuzz.py 300 50: 29/29
golden_v10 re-frozen; golden_v10.py check: 500 cases, largest difference 0 -> PASS; golden_v10.js: PASS
golden/fast.py 40 / fast.js 40: 0 mismatches
learn_test, db_test, import_test, rails_test, schema_test, pitch_rules_test: all passed
stage2_test: 20/21 (D5 false switch-offs, left red by Drew)      worlds_test: 31/31
smoke, rules_e2e, gameday_e2e, replay_e2e, v08_e2e, v09_matchup_e2e, v09_labels_e2e, v10_step1_e2e, v10_step3_e2e: all passed
```
**Step 3 done:** #4 (all parts), #13, D1 acceptance, D8 closed; one known red (stage2 D5, until Step 7).

### Independent review of Steps 0-3 (Nov 11): SOUND WITH ISSUES

Full findings and status: `docs/REVIEW_v1.0_steps0-3_2026-11-11.md`. Fixed here: (1, High) the website demo's
`web/lib/engine_data.json` was stale since Step 0c and crashed every call; synced, and `test-app.sh` now `cmp`s both
web files and runs `web/lib/demo.test.ts` (0/2 before, 2/2 after); (4) the learner's worlds truth pitcher now carries
`strike_ref` (`worlds_test` 31/31 after; `stage2_test` D5 still 2/40, so that was not its cause); (6) the 0.72-pitch
check title now says what it asserts; (12) the simulator logs `engine.is_big_spot`. Open for Drew: (2) landing estimate
noise and sharpen-cap saturation, (3) a yardstick run on Step 3, (7) sharpening a chase target shifts it toward the zone.
`tests.py` 34/34; fast parity 0 mismatches.

**Drew, Nov 11, on the review's open items:**
- (2) Landing noise / saturation: **fit LAND_K, LAND_GAIN and the two caps to real data in Step 5** (added to Step 5's
  list: within-game strike-rate persistence from Statcast, 2024 train / 2025 held-out, ship only on held-out gain).
- (7) **No sharpening on chase targets**, both engines. Slider 9-for-10 (4.5 expected): chase landing unchanged
  (off 0.646 -> 0.646), down-away still sharper (off 0.361 -> 0.316). New `tests.py` check: 35/35.
- (3) Yardstick on Step 3 running on Drew's PC at `03c7cf2` (before this chase fix; the fix only touches chase calls
  for a pitch landing better than expected).
- Checks after the chase fix: `tests.py` 35/35; fast parity 0 mismatches; `golden_v10` re-frozen (17,395 chase values
  moved), `golden_v10.py check` PASS, `golden_v10.js` PASS; worlds_test 31/31; learn_test passed; stage2_test D5 2/40
  (known red, until Step 7); v10_step1/v10_step3/rules/v08/v09_matchup/replay e2e and smoke passed; web demo 2/2.

## Step 4 — Explanations (#3)

The why line and the intent label used different comparisons, so they could contradict each other (case 0 of the golden:
why "Sets up the slider middle", intent "Best strike here: slider down-away"). Both engines, display only:

- **One comparison** (`_explain` in `engine.py`, `explain` in `app/engine.js`), read by both `why_line` and
  `intent_label` and cached on the call's `info`. Comparator: **b\***, the allowed call with the lowest myopic cost; when the
  drawn call is b\* itself, the next-lowest myopic cost.
- **Three-ball counts:** `root_call` ranks them by myopic cost, so the term re-costs are now myopic too and look value is
  not a term there (before, every term's Δ silently included look value at 3 balls).
- **"Sets up" ⇔ Setup:** the why line names look value exactly when the intent is Setup; otherwise look value is not
  eligible. The named pitch is the engine's own top call at the count a strike leads to (`next_count_top`): (b, k+1), the
  look moved by `look_update`, this pitch as the last one (its most likely count-keeping strike), one more sighting, and
  one more strike in its landing record on a non-chase target. Per-count usage at the new count isn't known there and is
  left empty.
- **Eye level** by the sign of the fitted `beta_E` (−0.142): "Stays at his eye level — a change costs here"; the
  "after the {last}" suffix is gone. The intent mechanism had the same wording bug ("because it changes his eye level");
  it now follows the same sign ("because it stays at his eye level").
- **Not in the plan, added (flag for Drew):** when no term favors the call and it costs more than the comparator (drawn
  for mixing), the line was "Best call on its own merits", which is false. It now reads "Mixed in so he can't sit on one
  pitch" (1 of 250 golden cases, 7 of 139 pitches in one simulated game).
- `why_line` takes the shaken-off pitches (`exclude`) like `intent_label`; the app and the simulator pass them.

**Golden re-frozen.** Only `why.line` (69 of 250 full cases) and `why.deltas` (704 values) moved. No call, probability,
table value or intent label changed in any of the 500 cases.

| On the 250 golden calls | Before | After |
|---|---|---|
| "Sets up …" why lines | 15 (all 15 beside a non-Setup intent) | 0 |
| "Changes his eye level" (wrong sign) | 47 | 0 ("Stays at his eye level": 46) |
| Three-ball lines that changed | — | 20 |
| Intent labels changed | — | 0 |

**Finding: Setup is effectively unreachable at the shipped noise margin.** In 681 calls scanned (every call in every
distribution, golden cases with 0-1 strikes and fewer than 3 balls), look value reversed the myopic order in only 4, and
by at most 0.74 × `INTENT_E`. So the app will no longer say "Sets up". The plan expected this ("the honest state of v0.8's
planning term").

Ten examples (golden case: count, call | why before → why after | intent):

| # | Count, call | Why before | Why after | Intent |
|---|---|---|---|---|
| 0 | 2-0 slider down-away | Sets up the slider middle | He's looking up (33%) | Best strike here: slider down-away |
| 10 | 2-1 fastball down-in | Changes his eye level | Stays at his eye level — a change costs here | Best strike here: fastball down-in |
| 13 | 0-2 slider down-away | Changes his eye level after the curveball | Stays at his eye level — a change costs here | Put-away: slider down-away |
| 15 | 0-0 curveball down-away | Sets up the changeup down-away | He's looking middle (34%) | Best strike here: curveball down-away |
| 19 | 1-1 fastball up-away | Sets up the changeup middle | He's looking down (35%) | Best strike here: fastball up-away |
| 29 | 3-0 slider middle | Changes his eye level after the slider | Stays at his eye level — a change costs here | Need a strike: slider middle is the safest one |
| 70 | 1-2 slider down-in | Best call on its own merits | Mixed in so he can't sit on one pitch | Put-away: slider down-in |
| 92 | 3-1 slider middle | Best call on its own merits | He's timed for 82 mph; this plays 5 mph slower | Need a strike: slider middle is the safest one |
| 93 | 3-0 changeup middle | Best call on its own merits | He's seen the changeup 5 times today | Need a strike: changeup middle is the safest one |
| 128 | 1-2 curveball down-away | Sets up the slider down-away | Stays at his eye level — a change costs here | Put-away: curveball down-away |

**New `tests_v10_explain.py`** (in `test-app.sh`), on 60 golden cases, 7/7:
1. the named term has the smallest eligible Δ, and it is negative;
2. the comparator is b\* (recomputed from `cost08`);
3. three-ball counts: no look value, and the timing Δ equals a myopic re-cost done in the test (12 cases);
4. "Sets up" exactly when the intent is Setup, never beside "Best strike here";
5. the eye-level line and the mechanism text follow sign(`beta_E`) (10 eye-level lines);
6. the setup line names the engine's actual next-count top call, computed in the test with `call_v08` on a situation it
   builds itself. Setup never occurs at the shipped margin, so this check sets `INTENT_E = 0` on the three golden cases
   where look value reverses the myopic order, and requires at least 3 Setup calls (4 found);
7. Python and JS agree on the why line, intent and next-count top call on 20 cases, both as called and with the drawn
   pitch shaken off (`golden/explain_twin.js`).

`golden/fast.py`/`fast.js` now compare the intent label live as well.

App/DB: text only; `doc.v08.intent`/`.mechanism` unchanged; old event docs keep their old text.

Checks run:
```
tests.py 35/35   tests_v10_explain 7/7   tests_v09_followups: all passed   fuzz.py 300 50: 29/29
golden_v10 re-frozen; golden_v10.py check: 500 cases, largest difference 0 -> PASS; golden_v10.js: PASS
golden/fast.py 40: 0 mismatches (intent included)   parity (make_parity + parity.js): PASS
build: app/dist matches the source; web/lib matches the app; web demo 2/2
learn_test, db_test, import_test, rails_test, schema_test, pitch_rules_test: all passed
stage2_test: D5 2/40 (known red, until Step 7)   worlds_test: 31/31
smoke, rules_e2e, v10_step1_e2e, v10_step3_e2e, v08_e2e, v09_labels_e2e, v09_matchup_e2e, gameday_e2e, replay_e2e: all passed
one simulated game (simulate.py): 139 pitches, why and intent logged, 0 "Sets up"
```

## Step 5 — Fits and model changes (#7, #11/#28, #12, #19, #20, #21, #22, #24, D3; landing fit)

The Statcast data (`fetch_statcast.py`: every 4th day, Apr 5–Sep 25, 2024 and 2025; 88 files, 336k usable pitches) was
downloaded in this session. Every fit uses `seq_fit.py`'s rule: 2024 train, 2025 held out, game-clustered bootstrap, ship
only on held-out gain > 2 boot SD (plus a 95% cluster-robust interval excluding 0 where a coefficient is tested).
Drew's Nov 11 decisions are marked **(Drew)**.

### Landing fit (Drew's Step 5 addition; review #2) — `readthrough/v10_landing_fit.py`, `results/v10/landing_fit.txt`
Does a pitcher's strike rate on a pitch type earlier in this game, against his own expectation (his season rate for the
type leaving this game out, moved by league count offsets), predict his next pitch of that type?

| | Step 3 (guess) | Fit |
|---|---|---|
| `LAND_K` (shrinkage, pitches) | 5 | **20** (train likelihood flat 10–40) |
| `LAND_GAIN` | 4.0 | **2.0** (beta 1.05 logits per unit est, 95% 0.80–1.28; the engine's strike-chance slope is 0.119 per unit wild-today) |
| held-out gain | — | **+5.6 SD → ship** |
| separate slope for landing better vs missing | — | +1.24 vs +0.88, +1.8 SD → not shipped |

Binned 2025 data: est −0.10 → strike rate −3.0 points, +0.10 → +3.6 points. The caps (+0.6 / −0.3) stay; the data never
reaches them. The landing **block** is a coaching rule, so it keeps its own shrinkage (`LAND_BLOCK_K` = 5) and doesn't
move with the fit.

**(Drew) ship the fit over the Step 3 D1 acceptance.** With the fitted values, slider 8-for-10 / fastball 4-for-10 at 3-1
gives fastball 47% / slider 32% (neutral day 58% / 21%). The slider no longer tops it until the fastball is clearly off
(3+ strikes under expectation: slider 63–64%). The D1 check now reads: the slider gains 8+ points at every level, and
takes the top once the fastball is clearly off. The landing-filter check keeps its direction (a 0.72 pitch at 2/4 reads
wild +0.07, was +0.30 or more).

### #7 one owner of in-game hitter memory — `readthrough/v10_memory_fit.py`, `results/v10/memory_fit.txt`
R5 in-game damage (as the engine computes it) and the matchup memory (M1 earlier-trip successes, M2 earlier-trip hard
hits at the spot, actual plate location) refit together:

| Test | beta | held-out | ship |
|---|---|---|---|
| R5 damage alone, whiff | −1.66 | +3.4 SD | (report) |
| M1 whiff, with damage control | +0.079 | +4.4 SD | **yes** |
| M2 whiff, with damage control | −0.240 | +2.6 SD | **yes** |
| M1 / M2 hard | −0.004 / +0.145 | +1.6 / +2.0 SD | no |
| R5 damage on top of M1+M2, whiff / hard | −1.33 / +0.21 | +1.9 / +2.4 SD (interval includes 0) | no |

M1 and M2 survive, so per the plan the matchup memory owns in-game memory. R5 `damage()` now reads only the cross-game
seed: the app passes `know().seed` (tonight's running read stays on the hitter card only), and the simulator passes none
(the frozen v0.9 caller keeps its old input). MM keeps its no-control values (0.107 / −0.346): with in-game damage gone,
that is the effect MM carries alone. Each part has its own cap and the shared ±0.5 clip is gone (two hard hits = −0.692).
The app keys a hard hit on the logged landing cell (`locQuad`) when the catcher logged one, else the called target.

### D3 mashed twice — `MASHED_PENALTY` 0.015 × run scale, in `cost08`
A named soft cost on (pitch type, height) after two hard hits there in earlier trips, read from the same `s.matchup`
counts but separate from the fitted logits. Sized as the smallest round value meeting the plan: the swept 0.010 left 13
cells cut by less than half; 0.015 cuts every cell (2%+ to start, every count but 3-0, 5 arsenals × 3 levels) by 63% or
more. At 3-0 it is still called in some cells (four-pitch 8–20%, finesse 7–13%).
**(Drew) accept the fitted one-hit effect:** one hard hit moves fastball-middle share more than 5 points in 28 of 180
cells, almost all at 2-2/3-2 (worst 65% → 40% at 3-2); median move 0.9 points.

### #11/#28 power scale
`fit_hitter_spread.py`: the power target is now one SD of raw hard-hit share (0.0518), and `POWER_HR` = 0.112 per grade
point (was 0.112 × 0.03/0.053 = 0.063). **The script was broken:** it set `P08`, but the engine reads the per-level
`HITTER_SPREAD` first, so its iterations changed nothing and ran away (g_w 0.45 → 1.49). Fixed to set the values the
engine reads; it converges in two passes with every slope on target (K per contact point = sd_k, walks per discipline
point = sd_walk, hard share per power point 0.0518):

| Level | g_c | g_w | g_d |
|---|---|---|---|
| hs | 0.589 → 0.573 | 0.168 → 0.304 | 0.985 → 0.993 |
| college_d3 | 0.650 → 0.630 | 0.173 → 0.318 | 1.003 → 1.029 |
| college_d1 | 0.492 → 0.477 | 0.171 → 0.310 | 0.848 → 0.856 |

### #12 infield in
**Statcast 2024–25 has no infield-in alignment** (`if_fielding_alignment` is only Standard / Infield shade /
Strategic), so nothing can be fitted. **(Drew) keep the plan's fallback:** +0.08 hit rate on ground balls with the infield
in (outs → singles, `TYPED["gb_babip_in"]`). The pull toward low targets shrinks from at most 12.0 to at most 8.9 points
(D3 AVG3 1-1 R3: 28.0% → 31.8%, 34.8% with no hit cost). That misses the plan's under-3 bar; pitching down for a grounder
with the infield in is real logic.

### #19 one RHO_L rule
Every MLB-fitted behavioral term now scales by `RHO_L` (HS / travel 0.6): timing, MM, SIDE and POWER_HR already did; eye
level, tunneling and familiarity now do too. Structural terms (count kappa, beta_y, GB rates) and the unfitted repeat
guesses don't. **Testing 0.6:** HS strikeout spread barely moves with it (implied SD 0.0589 / 0.0602 / 0.0609 at RHO_L
0.3 / 0.6 / 1.0, vs an *estimated* HS target of 0.056), so the data can't pin it down. 0.6 stays as the stated
assumption, not a fit.

### #20, #21, #22, #24, notes
- **#20** the cross-game seed is centered only when the hitter has grades on (`hitterGrades(b) !== null`, both call sites).
- **#21** the cross-game spot damage is keyed per pitch kind (`"SL|down-away"`, learner v2 and both engines).
- **#22** `outcome_probs`' duplicate +0.2 same-side-changeup hard term deleted (`shape_fit`'s −0.3 stays). Same-side vs
  opposite-side CH share at 2-1 is now 21–22% vs 22–23% (ratio ≥ 0.95; it was 0.86–0.92 here, above the 60% bar either way).
- **#24** `look_update(…, y)`: the hitter's look follows the logged landing row (`LOC_ROW_Y`: 3.8 / 3.2 / 2.5 / 1.8 /
  1.2 ft), else the called target. The simulator logs no landing spot, so it keeps the target.
- README: tunneling line fixed (ships on chase swings); known limits for #23 runner rules (skipped, D10), D6 side-blind
  misses (deferred), #26 familiarity (dropped). D5 tunneling was done in Step 2.

### Checks
New `tests.py` checks (42 in all): #22, D3, #7/#21, #12, #19, #24, the landing fit constants, plus the rewritten D1 and
landing-filter checks. New browser test `app/v10_step5_e2e.js` (in `test-app.sh`): look from the logged row, hard hit keyed
on the logged spot, engine reads the seed only, seed centering. Against the Step 4 build it fails 3 checks and crashes on
the 4th.

Realism gate vs the Step 0 baseline (`calib.evaluate`, percent per PA; gate 1 point):

| Level | K | BB | HBP | Δ K | Δ BB | Δ HBP |
|---|---|---|---|---|---|---|
| `hs` | 21.27 | 13.82 | 4.02 | +0.22 | −0.23 | −0.08 |
| `college_d3` | 16.29 | 11.00 | 4.14 | +0.01 | −0.38 | −0.08 |
| `college_d1` | 19.29 | 10.46 | 3.30 | −0.06 | −0.32 | −0.06 |
| `mlb` | 19.40 | 7.72 | 0.86 | | | |

`spread_test.py` (not in CI): walk+HBP spread is 11–14% under the real one at D3 (0.0438 vs 0.0491) and D1 (0.0340 vs
0.0394), outside its 10% tolerance. **The Step 4 commit reads exactly the same**, so Step 5 didn't cause it; it dates from
the Step 2 recalibration. A `fit_spread.py` refit would fix it. Open for Drew.

`tests_v10_explain.py` check 6 had hard-coded the three golden cases where look value reversed the myopic order; Step 5
moved them (Setup is even rarer now). It now scans for a Setup line and also checks the next-count helper on every
eligible drawn call (33).

Golden re-frozen: 75 of 250 picks and 75 intent labels moved (familiarity, matchup memory, landing, power and grade
values all feed the outcome probabilities).

Checks run:
```
tests.py 42/42   tests_v10_explain 7/7   tests_v09_followups: all passed   fuzz.py 300 50: 29/29
golden_v10 re-frozen; golden_v10.py check: 500 cases, largest difference 0 -> PASS; golden_v10.js: PASS
golden/fast.py 40: 0 mismatches (after each sub-item)   parity (make_parity + parity.js): PASS
build: app/dist rebuilt; web/lib engine.js and engine_data.json match the app; web demo 2/2
learn_test, db_test, import_test, rails_test, schema_test, pitch_rules_test: all passed   worlds_test: 31/31
stage2_test: D5 2/40 (known red, until Step 7)
smoke, rules_e2e, v10_step1_e2e, v10_step3_e2e, v10_step5_e2e (10/10), v08_e2e, v09_labels_e2e, v09_matchup_e2e,
replay_e2e: all passed; gameday_e2e 13/13 (its 200 ms timing check read 213 ms while the golden and worlds runs shared
the CPU; 157 ms re-run alone)
one simulated game (simulate.py): 116 pitches, no errors
spread_test.py: walk+HBP spread low at D3/D1 (same as Step 4, open)
```
Yardstick for Step 5 (Drew's PC): `scripts/yardstick.ps1 -Tag step5 -Commit <this commit>`.
