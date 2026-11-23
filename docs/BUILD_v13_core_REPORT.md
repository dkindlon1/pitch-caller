# v1.3 core: build report (Nov 21-22, 2026)

Carries out `docs/PROMPT_hitter_v13_apply_2026-11-21.md`. Drew's 13 rulings are recorded as DECIDED at the top of
`docs/DECISIONS_refit_v13.md`. Local only: nothing is on `main` and nothing shipped. 2026 was never read, fit or
scored. Every grade is **PROPOSED**. Heavy jobs ran one at a time.

| Branch | Tip | What |
|---|---|---|
| `feat/hitter-v13-prework` | fc85992 | rulings recorded (DECISIONS, plan section 12) |
| `feat/hitter-v13-refit` | 21f44ac | Task B |
| `feat/hitter-v13-core` (worktree `C:/dev/pc-core`, stacked on refit) | see `git log` | Tasks C and D, this report |

Detail: `docs/REFIT_v13.md` ("Rulings 5, 8, 10 applied"), `docs/CORE_v13_SCORES.md` (section 7 = after
recalibration), `docs/CORE_v13_CHANGED_CALLS.md`, `docs/ZONE_v13_APPROVED.md`, `docs/HARNESS_v13.md` 10a,
`docs/TABLES_v13.md`, `docs/FITS_TRAITS_v13.md`.

## A. Open verification (prework tip 4d257a5)
- **`scripts/test-app.sh`:** exit 0, 61 suites, 0 failed (75 min, alone).
- **`scripts/test-sql.sh`:** exit 0, 15 suites, 0 failed.
  - The first attempt failed only at `v11_kinds_test`, because Node found the Windows Store `python3` alias.
  - Fix: put the venv's `Scripts` first on PATH, as `run_sql_each.sh` does.

## B. Refit branch: rulings 5-8, 10, 12
**Numbers applied:**
- `ride_up_2k` 0.008 → **0.003** (ruling 5).
- **HARD_SD = 0.0728 (SE 0.0017)** (ruling 8).
  - Method: the beta-binomial talent spread with luck removed, as `talent_spread.py` does it. Data: MLB 2015-2025, hard = 95+ mph, per season, pooled by recency × batted balls. Code: `hitter_data/hard_talent_sd.py`.
  - Comparison values: method of moments .0727; the refit's shrunk-estimate SD .0636; the plain SD .0775.
  - POWER_HR restated on it: 0.172 → **0.196**.
- Run-scale denominator pinned at **0.481** (`RUN_SCALE_MLB_RE00`, ruling 10).

**Tests rewritten:**
- R1: slider ≥ 30%, no pitch > 60% (ruling 6).
- S5: the gate's direction (ruling 7).

**Checks on the refit branch:**

| Check | Result |
|---|---|
| tests.py | 44/45. R1 passes (41 / 35 / 24); get-it-over passes. The landing reference (LAND_GAIN 2.02 vs the refit's 1.8) is stale. |
| Fuzz, better stuff never worse | 3000/3000 |
| 2-for-10 (report only) | 146/150, fails as always |
| Read-through | **95/98** (P2, P3, P7 fail). D3 and E7 pass again. No hard-rule row is Not acceptable. |
| Q4 worst case (cap 36%) | HS 29.8 / D3 26.6 / D1 22.6 |
| C5, E7, S7f | pass |
| S5 | passes (base 4.8, toward 0.0, away 12.6) |

**Changed calls vs v1.2.3:** golden 60/250 (44 college / MLB, **16 HS**); read-through rows 31/98. The run-scale pin
alone puts 7 HS calls back on v1.2.3's call.

**Ruling 12:** DECISIONS section 2 is rewritten on the refreshed list. 6 HS rows go to Drew; the other 10 take their
proposed grade (all Acceptable).

**test-app.sh:** 51 of 63 suites pass. The failures are:
- 11 checks pinned to old numbers;
- stage2 D5: the learner is off in 2/40 seasons. This comes from the full-data refit, not the rulings.

## C. Core assembly (`feat/hitter-v13-core`)
### Build
- **Merge with no behavior change.** Prework's table-driven engines are merged. The refit numbers live in `data_tables/*_v13refit.json`; golden v13refit stays identical and `fast.py 40` shows 0 mismatches.
- **Harness h3 (ruling 9):** the landing is re-frozen from Single-A 2021-25 (813,681 pitches). D1 heart share at 3-0: .24, against .44 before. The calib world is kept as a side report.
- **`zone_v13.json`** (ruling 2), sha256 `4c9f98ef…3323`, record in `ZONE_v13_APPROVED.md`.
  - The level trend is carried −1 step for college and −2 for HS on swing / whiff / hard. The gb / fb trends are recorded but can't be carried: the format has no ball type by zone band.
  - P3 takes Triple-A's value (×1.658).
  - The flat hanger is gone.
- **Hanger gate (ruling 3):** `class.hanger_gate` = H × min(1, wild_today / 0.30), applied only when wild_today > 0. Python = JS on 432 cases.
- **HS pitch kind × velocity (ruling 4):** the exact `fit_count_hs` stack, +0.0107 nats per pitch (SE 0.0005).
  - Inputs: kind, speed relative to his own class mean, and absolute speed bins, fed from the entered arsenal speed.
  - A pitch with no speed keeps only the kind term.
- **Count / run defaults:** `count_v13core` / `run_v13core` carry the D1 and HS fits. D2 / D3 run on v1.2's count layer, labeled as such.

### Level recalibration (an addition, flagged)
The first scoring of the core found the level calibration had never been rerun after the new tables:
- K was MLB 28%, HS 38% against 22% / 21% real;
- sims gave HS −6 runs per game;
- the read-through was 79/98.

HARNESS_v13 says the build to score is the one after recalibration. So the standard chain was rerun with targets
unchanged; only the plumbing was fixed (`hitter_data/core_recal.py`; commits bca5f6a, 6eed79c). K / BB / HBP are now
within 1 point at every level. The pre-recalibration numbers are kept in `CORE_v13_SCORES.md`.

### 1. 2025 scores vs raw v1.2 (ruling 1; h3 harness, the as-scored thru-2024 build)

| Level | core − raw v1.2, before recal (SE) | after recal (SE) | Verdict after recal |
|---|---|---|---|
| D1 | −0.0305 (0.0008) | **−0.0290 (0.0007)** | **PASS** |
| D2 (v1.2 count layer; ref v1.2@D3) | −0.0069 | +0.0019 (0.0003) | FAIL |
| D3 (v1.2 count layer) | −0.0082 | +0.0018 (0.0005) | FAIL |
| HS / travel | −0.0094 | +0.0056 (0.0011) | FAIL |

Switch-offs pin down the failures:
- **D2 / D3:** the shared MLB offsets, recalibrated under zone_v13, erase their gain. Their count layer is still v1.2's.
- **HS:** `calib.py` fits every level with an 86 / 89 mph staff, which the HS velocity table reads as elite. The HS whiff offsets sink to compensate. With a staff 4-8 mph slower, the same engine gives K 17-19%.

The HS table itself still gains −0.028 per pitch. Recalibrated v1.2 and the calib-world scores are in the doc as
side reports.

### 2. Extra terms (2025 gain, nats per pitch; "clears" = more than 2 SE)
- **Base-out** (the only extra term wired): D1 +0.0003 clears, HS +0.00004 clears. It touches HS read-through rows D10 and J3 (≤ 1.2 points).
- **Not wired, fit-only gains:**
  - Times through the order clears at every level (+0.0007 to +0.0009).
  - Previous pitch clears at D1, D2 and HS.
  - Scoring position clears at D1, D2 and HS.
  - Platoon clears at HS only.
  - Late and close never clears.
- None of the unwired terms ships until Drew grades the rows their calls touch.

### 3. Hanger gate size
- **H = 0.** No H on the grid 0-5 passes all gated and control rows.
- E2 fails at every H: it's a changeup that is landing normally.
- HG-1b needs H ≈ 3 and HG-2 needs H = 5, while HG-1a fails from H = 0.3.
- HG-1 to HG-4 are drafted as **PROPOSED** rows: `readthrough/scenarios_hg_v13.json`. 4 of 5 pass at H = 0; HG-2 fails (0-2 curve middle 8.9%).

### 4. Hard checks on the recalibrated core
| Check | Result |
|---|---|
| Hard foul = foul | 0.0, pass |
| Better stuff never worse | 3000/3000 |
| Hit hard twice | 0%, pass |
| Hit hard once | another call moves 10.2 points against a 5-point limit (v1.2.3 13.4, also fails as written) |
| No chase at 3-0 / 3-1 | 0 of 180 cells, pass |
| No-scouting games | chase 0 |
| **Robustness: 2-2 top call at three calls** | **6.5 points** (v1.2.3 18.6). The largest move over 0-6 calls is 15.7. At 3-2 the move is 22.1. |
| Read-through | **86/98** (v1.2.3 94; refit 95) |
| R1 | pass |
| Q4 worst case | HS 21.7 / D3 23.3 / D1 18.1 (pass) |
| S5 | **fails**: the core never calls the inside sinker there |
| stage2 | passes |
| 2-for-10 (report only) | 145/150 |

Read-through failures: A1, A2, A6, C5, D6, E2, F2, S7f, S9f, P1, P2, P7, mostly off-speed middle shares. Switching
back to the refit zone table gives 92; putting the flat hanger back gives 90.

### 5. Sims (40 paired games per level vs v1.2.3; SE ≤ 0.25 would need 230-800 games per level)

| Level | Core − v1.2.3, runs per game (SE) |
|---|---|
| HS | −0.07 (1.12) |
| D3 | +0.15 (0.82) |
| D1 | **+0.82 (0.90), flagged** |
| MLB | **+1.07 (0.60), flagged** |

- MLB's home runs per PA went from 1.9% to 3.5%, in line with the refit's MLB targets. So part of the rise is probably the refit's world, not the core's calls. Not diagnosed further.
- D2 games equal D3's.

### 6. Changed calls (`docs/CORE_v13_CHANGED_CALLS.md`)
This is the "full regrade after the core" list. **D2 / D3 will move again once their count layer lands.**

**Counts vs v1.2.3:** golden 109/250 (59 college / MLB, **50 HS / travel**); read-through rows 48/98.

**Attribution by switch-off, golden college / MLB / HS:**

| Component | College / MLB | HS |
|---|---|---|
| Zone table | 41 | 36 |
| Count / run layer | 13 | 29 |
| HS table | 0 | 18 |
| Recalibration | 19 | 28 |
| Refit | 15 | 3 |

### test-app.sh on the recalibrated core
Build, web/lib, smoke, every e2e, golden_v13core, tests_v13_core 28/28 and stage2 all pass.

**Failing, old-number references (expected):**
- golden_v123;
- the exact v1.0 / v1.1 / v1.2.x checks in tests_v11 / v12 / v12b / v121 / v122 / v123;
- LAND_GAIN;
- logging_exact and drift_exact;
- tests_v13_tables "v13refit bit for bit".

**Caused by the core (for Drew, not tuned):**
- the tests.py v1.0 grid (3 checks);
- infield in (low targets rise);
- the coaching read "squared up" (moves 0%);
- tests_v12 S5.

## D. Simulator (ruling 11)
- `two_strike` is split into `two_strike_swing` 0.23 and `two_strike_foul` 0.14 (D1 fits), in Python and JS. The traits stay independent; the simulator never draws them. The fitted rho −0.22 is noted.
- **No traits:** byte-identical to the pre-split tip 9ad0b81. 13 games, 1,913 pitch events, 0 differences.
- **Recovery:** both traits are recovered (2-SE coverage 96%). The foul trait is weak: it needs ~2,600 PAs for SE 0.5.

## E. Coverage
**Superseded.** Drew's Nov 22 prompt (`docs/PROMPT_hitter_v13_fulldata_2026-11-22.md`, ruling 1) drops the 50% coverage
rule and says to skip this task and the "D2 / D3 keep v1.2's count numbers" part. D2 / D3 get fitted count layers on
`feat/hitter-v13-fulldata`, whose session runs `hitter_data.update` on the full archives.

## Stop points for Drew
1. **The arguable and flagged HS rows** (DECISIONS section 2, refreshed list): #92, #154, #476, #410, #246, #460. The other 10 HS rows take their proposed grade.
2. **HG-1 to HG-4** (`readthrough/scenarios_hg_v13.json`, PROPOSED). Also: should H stay 0 when no size passes?
3. **The 35 draft scenarios** (`docs/SCENARIOS_v13_DRAFT.md`): untouched, still waiting.
4. **The core's changed-call list** (`docs/CORE_v13_CHANGED_CALLS.md`): 109 golden cases, 48 read-through rows.
5. **New, from the build:**
   - the HS calibration staff's speed (a target choice);
   - whether to re-export the count layer after recalibration (the D1 / HS per-count fit drifted up to 3.3 points; HS whiff per swing 16.6);
   - the read-through drop to 86/98 (zone cells plus the removed hanger);
   - S5;
   - the MLB / D1 sim flags.
6. **The coverage rule:** settled by the Nov 22 ruling; the full-data branch carries it.

## Summary
- Rulings 5-8 and 10-12 are applied on the refit branch (95/98, fuzz 3000/3000). The core carries the approved zone table, the hanger gate (H sized to 0), the HS kind × velocity table, the D1 / HS count and run layers, harness h3 and the simulator split, with both engines in parity.
- After level recalibration (K realism within 1 point everywhere), only **D1 passes** ruling 1 on 2025 (−0.029, 43 SE). D2 / D3 fail on v1.2's count layer under the new shared offsets, and HS fails because the calibration staff is too fast for its velocity table.
- Waiting on Drew: 6 HS rows, HG-1 to HG-4, the 35 scenarios, the core changed-call list (109 golden, 48 rows), and the new calibration-staff / count re-export questions. Task E is superseded by the Nov 22 prompt.
