# HS kind × velocity refit and hanger H from data: report (2026-11-27)

Branch `feat/v13-hs-hanger-cv` from `audit/v13-final-audit` @ fff8bca. Every fit and score below used seasons through 2025 only. No 2026 data was read, `--drew-go` stayed locked, and Step 6 was not run.

**Outcome:**
- **A stops for Drew.** The refit wins easily on the data, but it drops read-through v12 from 96/98 to 95/98 (A6). Under the standing constraints it can't ship.
- **B keeps H = 0.** The fitted H is 0.
- **No shipped table changed.** `count_v13core.json`, `mp_v13.json`, `zone_v13.json`, the golden files, `app/` and `web/lib` are byte-identical to fff8bca. The readiness page's frozen hashes stay valid.

Code: `hitter_data/hs_hanger_cv{,_a,_b}.py` and `fit_count_hs.pitch_table_engine_base`.
Outputs (outside git): `PITCHIQ_DATA/fits/hs_hanger_cv/`
- `a_scores.json`, `b_scores.json`
- `checks/`, `sims/`
- `proposed/{refit,none}/`: ready-to-apply tables.

## A. HS pitch kind × velocity on the engine's real base

**Base.** For each pitch, the base is what the engine produces before `pitch_velo`, through the harness adapter:
- EngineV12Adapter on zone_v13, the HS count row without `pitch_velo`, and the mp scalars;
- under the HS calibration world (`HSVeloAssumption`), restricted to the pitch's kind group.

There are no slider rows at 3-0 or 3-1, so for those counts the slider takes its own target and landed-zone shares from one ball fewer. The stack is the same as before (kind → velo_rel → velo_abs, sequential, `TERM_ALPHA` = 200).

**Validation.** Harness `pitch_5way`, nats per pitch. SEs are the maximum of the game, home-team and two-team bootstraps, B = 1000, fixed seed.

**Primary result.** Fit on 2022–24, scored on 2025, on the as-scored engine copy. 815,375 pitches, 3,897 games.

| version | pitch_5way | vs shipped |
|---|---|---|
| (i) shipped (fit on the count-only `hs_sep` base) | 1.44350 | — |
| (ii) no table | 1.43923 | −0.00427 (SE 0.00044) |
| (iii) refit on the engine base | 1.43110 | **−0.01240 (SE 0.00045, z 27.6)** |
| (iii) + HS mp scalars re-solved with it on (what would ship) | 1.43110 | −0.01240 (SE 0.00044) |

- The literal as-scored file (`count_v13core_s2024.json`) scores the same as (i), to within 1e-6.
- The shipped thru-2025 table doesn't reproduce from today's season caches. It matches `fits/hs/pitch_velo_thru2025.json`, made from an older cache.

**Leave one season out.** These folds ran on the shipped engine base. Its count layer saw every season. That base is common to all three versions; the term fits are not.

| held out | refit − shipped | none − shipped |
|---|---|---|
| 2022 | −0.00848 (0.00038) | −0.00053 (0.00035) |
| 2023 | −0.00933 (0.00038) | −0.00183 (0.00037) |
| 2024 | −0.01082 (0.00038) | −0.00344 (0.00038) |
| 2025 | −0.01246 (0.00046) | −0.00440 (0.00044) |
| pooled | −0.01020 (season+game SE 0.00072) | −0.00248 (0.00071) |

**Whiff and HBP on 2025's real pitches** (model-implied vs data):

| | 0-2 SL/FB whiff per pitch | per swing | SL whiff per swing at 2 strikes | HBP per pitch |
|---|---|---|---|---|
| data | **1.45** | 1.47 | 0.360 | 0.96% |
| shipped | 1.72 | 1.93 | 0.514 | 1.28% |
| no table | 1.20 | 1.33 | 0.383 | 1.36% |
| refit (+ mp) | **1.46** | 1.54 | 0.406 | 0.93% |

**HS K / BB / HBP against real (21.0 / 14.1 / 4.1).** Re-solving the HS mp scalars is required by the frozen input hash in `mp_v13`, and by ruling 12. It starts from only 4.8e-4 off target, so the refit nearly keeps the per-count means.

| | tests.py exact-math row | sim, 400 seed-paired games |
|---|---|---|
| shipped (fff8bca) | K 26.2, BB 14.2, HBP 4.2: FAIL (K) | K 34.0, BB 14.5, HBP 4.0; runs 5.41 |
| refit + mp | K 24.8, BB 13.3, HBP 3.1: FAIL (K) | K 32.7, BB 14.0, HBP 2.9; runs 5.47 (Δ +0.06, SE 0.22) |
| no table + mp | K 22.1, BB 14.1, HBP 4.9: FAIL (K +1.1) | not run |

The refit gets per-pitch HBP right on real pitches. The fall in the sim's HBP shows the sim's own pitch world produces too few HBP. The shipped table's HBP overprediction had been hiding that.

**Ship rule.**
- The statistical rule picks the refit: 2025 gain > 2 SE (27.6 SE), and it doesn't lose on the leave-one-season-out average.
- **But the refit breaks the standing read-through constraint:** v12 goes 96/98 → 95/98 with A6 as a new fail (HS 3-1, FB/CB: fastball 72% → 50%).
- It also turns tests.py's "D1 3-1 slider 8-for-10" row red. At HS, the slider is already 50% on a neutral day.

**Mechanism.** At HS 3-1 the refit makes the curve or slider the cheapest call. The data say HS curves at 3-1 are balls ×0.75, whiffs ×1.67 and fouls ×1.81 relative to the engine base. So Nov 27's `hitters_count_floor` takes its off-speed branch: the best pitch gets ≥ 50%. That scales the fastball down to 50%, under the HS fastball floor of 0.667.

The kind multipliers come from pitches pitchers chose to throw, so they likely carry selection: an HS pitcher who throws a 3-1 curve trusts it.

"No table" keeps the read-through at 96/98 with the same fails (D6, P7). It still fails the same tests.py row, overshoots HBP, and loses 0.008 nats per pitch to the refit. The rule's "no table" branch applies only when the refit fails the statistical rule, so per "otherwise stop and report", nothing ships.

**For Drew:**
1. Ship the refit and accept A6 and the tests.py row.
2. Ship the refit with a policy guard at HS 3-1, so the off-speed branch can't take the fastball under the HS floor. That's a call-policy change, and not one this task was allowed to make.
3. Ship no table.
4. Keep the shipped table.

The tables for 1 and 3 are in `proposed/`.

## B. Hanger gate H from data

- **College can't be estimated.** The college archive logs no pitch types, so neither "off-speed" nor "that pitch today" exists there.
- **Neither archive logs location,** so "in the heart" is never observed.
- **HS: H is fit through the engine.** For each in-play off-speed pitch, P(result | in play) comes from the engine's per-kind tables. The gate is applied to the heart band over a grid of gate values (−2 to 4), interpolated, at the pitch's data `wild_today`.
  - `wild_today` uses the engine's definition: his strikes on that kind earlier in this game vs his normal, shrunk by LAND_K = 20, × LAND_GAIN 1.8, capped.
  - "His normal" is the level's count × kind rate, shifted by his own other-game rate (50 pseudo-pitches).
  - The archives log no targets, so chase targets can't be left out as the engine does.
- **Fit** on 450,094 HS balls in play from 2022–24, by likelihood:
  - H ≥ 0 gives **H = 0**; the unconstrained optimum is −0.4.
  - The likelihood curve is flat: within 1e-6 nats per ball in play over [−0.75, 0.25].
  - wild_today rarely gets near full: 5 of 27,620 off-speed balls in play in 2025 reach 0.30.
- **2025 score:** `bip_result`, 133,198 balls in play.
  - H = 0: gain 0.
  - H = 1: +0.000002 nats (SE 0.000020).
  - H = −0.4: −0.000004 (SE 0.000007).
- **What the data show:** the extra-base-hit share rises with wild_today for off-speed (7.7% → 10.2%), but just as much for fastballs (8.8% → 10.7%). That is "he's off today", not a hanger.
- **Ship rule:** no held-out gain, so H stays 0. Read-through and `hanger_gate_size.py` didn't need to gate.
- **HG rows (proposed, not gated), H = 0:**
  - every gated and control row passes;
  - HG-1b fails (SL middle 0.100 vs 0.056);
  - HG-2 fails (9.8%, not > 5%).
  - No H in {0, 0.5, 1} passes every HG row.

## C. Checks on this branch

Every engine table is unchanged. The suites below ran on the A refit candidate, against the fff8bca baseline.

| suite | fff8bca | with the refit | notes |
|---|---|---|---|
| tests.py | 42/45 | 41/45 | new: D1 3-1 slider row. HS realism fails either way, K 26.2 → 24.8 |
| read-through v12 | 96/98 (D6, P7) | **95/98** (+A6) | |
| tests_v13_core | 21/28 | 20/28 | + the provenance pin of `pitch_velo` (expected) |
| tests_v13_tables | 40/43 | 40/43 | same rows |
| tests_v13_meanpreserve | — | 13/13 | |
| tests_v13_kgapfix | 1 failed | 1 failed | more HS calls under the floor: 4 vs 2 |

With the refit candidate in place, the golden checks passed:
- `golden_v11.py make v13core` → `node golden_v11.js v13core` PASS;
- `golden/fast.py 40`: 0 mismatches;
- `export_data.py --check` identical.

Those files were then reverted with the tables. On this branch, where the engine is the shipped one:
- game_mix_e2e: passed, **3 of 21 games over 70%** (the limit is 3);
- rules_e2e, v121_shake_e2e and smoke: passed;
- web `npm test`: 110/110; `npm run typecheck` and `npm run build`: OK.

**On this branch** (code only): tests_fit_count, tests_hs_data, tests_harness and tests_hitter_data all pass. `pitch_table` after the refactor reproduces the pre-refactor function exactly.

**Step 6:** the Step 6 2026 result was scored on c602f1c's outcome tables. Nothing here changed an outcome table. If Drew adopts option 1, 2 or 3, that change is validated only by the 2025 and leave-one-season-out evidence above.
