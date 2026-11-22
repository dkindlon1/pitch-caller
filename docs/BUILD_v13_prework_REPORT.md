# v1.3 hitter prework: build report (2026-11-21)

Branch `feat/hitter-v13-prework`, cut from `main` at 8bcf909 (builds 1-4 are merged there). Nothing is on main, nothing
was deployed, no behavior ships: every engine change stays on the branch. 2026 is held out: it is parsed and counted,
but no fit, tuning or score uses it (`hitter_data.assert_not_heldout`, tested in `tests_hitter_data.py`). Data lives in
`C:/dev/pitchiq-data` (not in git). The college archive was opened read-only (`mode=ro`) and copied, never written.

Environment for every command below (Git Bash, Windows):
`export PATH=/c/dev/pitch-caller-logs/py3/Scripts:/c/dev/pitch-caller-logs/shim:$PATH PYTHONUTF8=1`

## Part 0: baseline and inventory
- `bash scripts/test-sql.sh` at main 8bcf909: all 15 pass. `bash scripts/test-app.sh`: exit 0 (3,459 s). Logs in
  `/c/dev/pitch-caller-logs/v13/base/`.
- `docs/HITTER_V13_INVENTORY.md`: 36 shipped numbers from Statcast / MLB-only fits, with file:line in both engines,
  provenance and a refit route. Findings: STUFF_CHASE 0.33 isn't in the code; the +0.012 per-batter-faced term was
  replaced by familiarity in v0.8; the MLB K/BB/HBP targets are hand-typed 2010-15 averages; MLB's empty-bases RE 0.481
  scales every level; the kappa ship flag is inconsistent.

## Part 1: college archive intake
- `python -m hitter_data.update` copies new games by digest, dedupes, parses (parser v3) and writes the reports.
  Result: 89,696 games parsed in 182 s with 0 errors.
  - Lines parsed: 99.85%.
  - Half-innings ending at exactly 3 outs: 99.07%.
  - Half-inning runs equal the site score: 99.74%.
  - Final runs equal the box score: 97.95%.
  - Count replay consistent: 99.18% of 2.84 M strings.
  - Strikeouts looking end in K: 98.84%. Swinging end in S: 98.39%.
- Dedupe: 502 groups with the same text, 1,480 that disagree (kept, flagged), 3,944 pairs judged to be separate games.
- Roster match: batters 18.1%, pitchers 16.4%. The ceiling is ~0.31-0.45, because only ~60 D1 / 35 D2 / 30 D3 schools
  per season have rosters.
- Coverage, the share of distinct games with full pitch strings (counting a first-pitch "(0-0)" in play as complete):

  | Level | 2025 | 2026 |
  |---|---|---|
  | D1 | 0.69 | 0.86 |
  | D2 | 0.35 | 0.73 |
  | D3 | 0.17 | 0.74 |

  The strict shares are lower. Under the plan rule, only D1 is fit-eligible today. Reports are in
  `C:/dev/pitchiq-data/college/reports/` (quality, coverage, letters, last_letter, unparsed_top20, dupes, summary).
- `python tests_hitter_data.py`: all passed (synthetic lines; includes the held-out guard tripping).

## Part 2: pulls, zone seed, shared refits
- The pulls are resumable and still running: `bash /c/dev/pitch-caller-logs/v13/pulls/start_pulls.sh`. Rows per level ×
  season are in `C:/dev/pitchiq-data/pulls_counts.csv` (`python -m hitter_data.pulls counts`). As of this report:

  | Source | Seasons on disk | Pitches per full season | Location |
  |---|---|---|---|
  | Statcast MLB | 2021 (through July), 2022-25 | ~711 k | yes |
  | Statcast AAA | 2024 (partial), 2025, 2026 | ~655 k | yes |
  | Statcast A | 2021-26 | ~190 k | yes, ~89% (Florida State League parks) |
  | Stats API AAA | 2019, 2021-26 (2018 in progress) | ~695 k | 2023 on; partly 2022 |
  | Stats API AA, A+ | 2018-19, 2021-26 | ~600 k | no |
  | Stats API A | 2018-19, 2021-26 | ~600 k | the ~30% that Statcast covers |
  | Stats API ROK | 2019, 2021-26 | 345-650 k | almost none |
  | Retrosheet MLB | 1988-2025 | ~189 k PAs | pitch strings, no location |

  MLB Statcast 2008-20 and 2026, and AAA 2023, are still downloading.
- Zone seed: `python -m hitter_data.zone_seed --write-doc` writes `docs/ZONE_TABLE_DRAFT_v13.md`
  (`python tests_zone_seed.py`: 27 checks pass). It was fit on a 4/5 games split of the 2025 data available then.
  - The biggest disagreement with v1.2 is the two-strike hanger. The seed says it is hit hard ×0.88 as often as a
    fastball there; v1.2 says ×1.52. C4 chase way off is ×0.56 vs v1.2's ×0.29.
  - Transfer check: MLB is sharper on swing, chase and hard contact (scale 1.13-1.22). **Not wired into the engine.**
- **Shared refits** are on branch `feat/hitter-v13-refit`, stacked on this branch at d14115b. The branch has a code
  commit (adfbaba), then the numbers in **one separate commit (1dfc81e)**, then the new golden and the changed-call list
  (961a571). The refit isn't merged here, so this branch stays at v1.2.3 numbers until Drew regrades.
  - Data: MLB 2021-25, AAA 2024-25 and A 2021-25, ~5.5 M pitches, recency weight 0.5^((2025-season)/2). 2026 was not
    used. Behavior terms pool the three levels; the MLB descriptions use MLB only.
  - Of the 36 inventory rows: 26 refit and applied, 2 refit with no change, 1 moves only through other rows, and 7 not
    refit (reasons in `docs/REFIT_v13.md`).
  - Biggest moves:
    - POWER_HR .112 → .165; HARD_SD .0518 → .0627.
    - gamma_T .30 → .15; beta_E_S -.25 → -.05; beta_y -.36 → -.62.
    - MLB RE 0|000 .481 → .500, so every level's run scale drops ~3.8%.
    - MLB targets: K .200 → .225, zone .45 → .50.
  - Rule checks, before → after:
    - better stuff never a worse call: 3000/3000 → 3000/3000;
    - get it over loses about half: pass → pass;
    - the 2-for-10 rule: 144/150 → 146/150, failing before and after;
    - hard-rule rows: none flagged before or after;
    - read-through scenarios: 94/98 → 94/98 (E7 newly fails, P5 newly passes).
  - Changed calls: 63 of 250 golden cases changed top call (38 college/MLB, 25 HS/travel, listed separately), and 29 of
    98 read-through rows (none HS). They are listed in `docs/REFIT_v13_CHANGED_CALLS.md`. **Stop point.**
  - Checks on that branch:
    - `python3 golden/fast.py 40`: 0 mismatches. `node golden/golden_v11.js v13refit`: pass.
    - test-app.sh: all four parity runs, the refit tests, the build and the e2e runs pass.
  - Failing on that branch only because the numbers moved: golden_v123, tests_v11/v12/v121/v122/v123 (their old-ref
    exact checks), tests.py's landing check, tests_v12b, tests_harness's frozen v1.2 and logging/drift_exact.
  - Behavior rows that moved, for Drew:
    - tests.py R1 mixing: fastball 43% vs slider 35%, wider than the 6-point limit;
    - tests_v11 Q4: the riding four-seam up is 41-43% of two-strike calls, over the 36% limit;
    - tests_v12 S5 re-gate: sinker 12.1% when leaning away.
  - Open:
    - HARD_SD's definition (a full-season sample vs a talent SD).
    - The MLB calibration misses first-pitch strike (56% vs .619) and zone contact (82% vs .846).
    - sim_constants, hs_rates and the college/HS count values were not rerun.

## Part 3: D2 plumbing
- `college_d2` is in both engines, the app, the portal and the simulator. It uses D3's numbers through one placeholder
  list (`engine.D2_PLACEHOLDERS`, and `PLACEHOLDER_D2` in `engine_data.json`).
- `python3 release_guard_d2.py` exits 1 while any placeholder remains (16 findings today). The release checklist must
  run it; it is not in test-app.sh.
- No migration was needed: the only level check constraint is the waitlist's coarse list, and game levels are free
  text.
- Proof:
  - `python3 tests_v13_d2.py`: 13/13. D2 calls equal D3 calls; Python = JS to 3e-15; the guard trips.
  - `FAST_LEVEL=college_d2 python3 golden/fast.py 40`: 0 mismatches.
  - `python3 golden/fast.py 40` and `node golden/golden_v11.js v123`: pass. The existing goldens are unchanged.
  - `node app/d2_e2e.js`: 12/12. A seeded D2 game charts 120 pitches and saves as D2.
  - `node web/tests/gameplan_e2e.js`: 39/39.
- One test change to review: `logging_exact_test.js` and `drift_exact_test.js` now skip the data fingerprint
  (`v.data`), as they already skipped `v.app`. Adding D2 rows changes the fingerprint; every call and probability is
  still compared.

## Part 4: scoring harness
- `docs/HARNESS_v13.md`, `hitter_data/harness*.py`. `python tests_harness.py`: 72 checks pass. A fresh-context reviewer
  ran and its fixes are in (section 11).
- The pass reference is `v1.2_recal`, the per-count baseline. On D1 2025 `pitch_5way`, v1.2 scores 1.4678 vs 1.4470
  (+0.021, SE 0.0008); D2 +0.019; D3 +0.026. v1.2 beats the flat baseline everywhere.
- The Single-A known-truth check shows the frozen calib-world landing puts too many pitches over the heart. A
  pre-v1.3 check is written down for this.
- Baseline: 33 level-seasons (D1 2006-25, D2 2015-25, D3 2024-25), raw output in
  `C:/dev/pitchiq-data/harness/v12_baseline_2026-11-21.json`. 2026 was never loaded.

## Part 5: simulator hitters
- `simulate.py` has hidden traits (early, two_strike, contact, power; spray is recorded only) and six presets, set with
  the `HITTERS` environment variable. The sizes are `PLACEHOLDER_TRAIT_SIZES`. The engine never sees the traits.
- `app/worlds.js` has a hitter world. At 400 PAs the traits are recovered (e.g. early 1.5 → 1.52, SE 0.22); 2-SE
  coverage is 95.6%; an average hitter isn't moved.
- `python3 tests_v13_sim.py`: with no traits, three seeds plus an HS seed are byte-identical to e202169; Python = JS to
  6e-17.
- Open: the regret judge doesn't see the traits (fixing it is an engine change), and the power trait reads a bit high
  (+1.84 for 1.5).

## Part 6: draft scenarios
- `docs/SCENARIOS_v13_DRAFT.md`: 35 rows with proposed grades and v1.2.3's current calls. Not frozen.
- Flags:
  - H13-16: v1.2's anti-predictability moves the 2-2 top call 18.6 points, over the 10-point limit.
  - H13-05: the aggressive tag is weak.

## Merged branch check
The D2 and simulator branches were merged into `feat/hitter-v13-prework`. The only conflict was two test lines in
test-app.sh; both were kept, and the zone-seed and harness tests were added. On 2213bd9:
- `bash scripts/test-app.sh`: exit 0 (3,915 s). It now includes tests_hitter_data (92 checks), tests_zone_seed (27),
  tests_harness (72), tests_v13_d2, fast_parity_d2, tests_v13_sim, d2_e2e and golden_v123.
- `bash scripts/test-sql.sh`: exit 0.
- Logs: `/c/dev/pitch-caller-logs/v13/merged/`.

The first full run stopped at tests_hitter_data with "ran 0 checks": scripts/run-check.sh only counts indented `ok`
lines. The three new test files now indent them (2213bd9).

## Stop points waiting for Drew
1. Approve the zone table (`docs/ZONE_TABLE_DRAFT_v13.md`), above all the two-strike hanger (×0.88 vs v1.2's ×1.52).
2. Regrade the refit's changed calls (`docs/REFIT_v13_CHANGED_CALLS.md` on `feat/hitter-v13-refit`, HS separate),
   plus the three behavior rows it moved (R1, Q4, S5) and the HARD_SD definition, before the refit is merged. After
   that, the old exact-comparison tests need new references.
3. Grade the 35 draft scenarios. Decide on H13-16 (2-2 adaptation over the 10-point limit).
4. Harness decisions (`docs/HARNESS_v13.md`):
   - the 0.002-nat minimum effect;
   - whether to re-freeze the landing from Single-A;
   - the D1-only fit-eligibility rule;
   - R12 (the v1.2 targets were set from 2026 stats).
5. Release: `release_guard_d2.py` blocks release until the real D2 numbers replace the placeholders.

The archive path didn't need a decision; it was found and opened read-only.

## Still needs the finished college data
- Count-layer fits (swing / take, called strike, result given swing) per level.
- College run values and run tables. D2 needs its own; it uses D1's today.
- The level-split check (D1 vs D2 vs D3, and whether D2 sits nearer D1 or D3).
- Trait fits: real trait sizes, presets and spray, plus the unknown-hitter prior by slot and team.
- Prefill from the opponent database.
- The final held-out test on 2026, run once.

## Refresh as more games arrive
```
cd /c/dev/pitch-caller && export PATH=/c/dev/pitch-caller-logs/py3/Scripts:$PATH PYTHONUTF8=1
python -m hitter_data.update            # copy new archive games, dedupe, parse, rewrite quality + coverage reports
python -m hitter_data.update --report   # reports only
python -m hitter_data.pulls counts      # pulls: rows per level x season
python -m hitter_data.zone_seed --write-doc   # refresh the zone draft
bash /c/dev/pitch-caller-logs/v13/pulls/start_pulls.sh   # resume the MLB / MiLB pulls
```

## Summary
- Archive intake and parser v3 are done: 89,696 games parsed at ≥98% on every quality check. Only D1 has enough full pitch strings to fit on today; 2026 stays held out.
- The zone seed, scoring harness with v1.2 baseline, D2 plumbing, simulator hitter traits and draft scenarios are built and tested; the merged branch passes test-app and test-sql.
- The shared refit is on `feat/hitter-v13-refit` (63 golden calls moved). It waits on Drew's regrade, as do the zone table, the scenarios and the harness decisions.

## Nov 21 follow-up (docs/PROMPT_hitter_v13_next_2026-11-21.md)
- **A + C, the decision sheet:** `docs/DECISIONS_refit_v13.md`. Every grade and recommendation in it is PROPOSED.
  - R1: rewrite the limit as slider at least 30%, nothing over 60%.
  - Q4: keep the 36% cap and shrink the ride-up credit 0.008 → 0.003. The read-through then goes to 95/98 and E7 passes
    again.
  - S5: test the gate's direction.
  - The 25 HS calls: 20 acceptable, 5 arguable, 0 not acceptable.
  - HARD_SD: use the talent SD (~.070). Adopt the 0.002 minimum effect. Re-freeze the landing from Single-A. State R12.
    Pin the run scale at .481 until college run values exist.
  - Hanger gate: H × min(1, wild_today / 0.30), proposed H = 0.5, sized by the landing rows.
  - The sheet was written against the first refit. The full-data refit moves 23 HS golden calls: 7 of the sheet's 25
    no longer move and 5 new ones do, so those 5 need adding.
- **B, the 2-for-10 rule: it never passed on main's line against the engine that makes calls.**
  - The recorded 150/150 (`results/logic_checks.txt`, Nov 3, v0.7c) tested the old `call_mixed`. The check kept testing
    it until Step 6 (6c5eb3d, Nov 11).
  - The live `call_v08` scores 147/150 at v0.9, 146 at Step 5 and Step 6, 145 at v1.0, and 144 at v1.2 and main (some of
    that drift is a different case set).
  - All 6 failures today are fastballs, none behind in the count or at 0-0. The likely link is Step 7 part 3 (05b3a9e),
    but that's unproven: the fixed-case split was stopped by low memory. Its tools are in the session scratchpad.
  - Not fixed (Drew).
- **D, coverage + representativeness:** `python -m hitter_data.update` picked up 9,323 new games (99,019 total, 0 parser
  errors). `python -m hitter_data.represent` writes `college/reports/representativeness.csv` (game-clustered SEs).
  - D1 2025: 6,210 of 9,399 games are full (0.66). Full games strike out more: K% 19.5 vs 19.2 for all games (+0.96 ±
    0.13 against the rest). Runs per game are 13.3 vs 13.5; HR per game 2.19 vs 2.12.
  - D2 2025: 736 of 2,144 full (0.34). BB% -0.64 ± 0.21 and runs per game -0.91 ± 0.32 against the rest; K% is within 2
    SE.
  - D3 2025: 220 of 1,589 full (0.14). Every difference is within 2 SE (thin).
  - 2026 (counted only): D1 0.85, D2 0.73, D3 0.74 full.
  - D2 / D3 2025 coverage hasn't grown yet, so the rule stays Drew's open decision.
- **E, pulls and zone:** every pull finished: Statcast MLB 2008-26, AAA 2023-26, A 2021-26; Stats API AAA/AA/A+/A
  2005-26 (Rookie was finishing its last seasons).
  - `python -m hitter_data.zone_seed --write-doc` was rerun on the full data: fit on the earlier seasons with recency
    weights, 2025 held out per level for the check (every check gain is positive), and Triple-A in the transfer check.
  - The hanger row is now ×0.78 (A) / ×0.81 (AAA) / ×0.85 (MLB) vs v1.2's ×1.48. **The zone table is ready for Drew's
    approval**; it is not approved and not wired.
  - The shared refit was rerun on the full data on `feat/hitter-v13-refit`, as a new numbers commit (5b3901a). The
    refreshed changed-call list is in 8555bb4.
    - 7 numbers in 6 rows moved materially vs the first refit, for example approach .196 → .224 and beta_y -.62 → -.49.
    - 64 golden calls change vs v1.2.3 (41 college/MLB, 23 HS).
    - The read-through is 93/98.
    - Parity and golden_v13refit pass.
  - **Not rerun:** the fuzz checks on the full-data refit (stopped by low memory). The first refit's 3000/3000 and
    146/150 stand until they're rerun.

**Follow-up summary**
- The decision sheet is ready for Drew. The 2-for-10 rule never passed on main's line against the live engine (only against an old call it was testing by mistake).
- All pulls are done. The zone table is regenerated on the full data and ready for approval; the full-data refit and its changed-call list are on `feat/hitter-v13-refit`.
- D2 / D3 2025 coverage hasn't grown yet; the representativeness numbers are in place for Drew's coverage decision.
