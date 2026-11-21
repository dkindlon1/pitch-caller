# v1.3 shared refits (plan section 4, prework Part 2.5), Nov 21, 2026

Every inventory row (`docs/HITTER_V13_INVENTORY.md`, 36 rows) whose refit route runs on the data on disk was refit,
keeping the shipped functional form; the numbers are applied to both engines in one commit ("v1.3 refit numbers").
**Stop point:** Drew regrades the moved calls (`docs/REFIT_v13_CHANGED_CALLS.md`). No call was tuned back.

## Data, weighting, guards

- **Savant** (`hitter_data/refit_load.py`): `C:/dev/pitchiq-data/statcast/{MLB,AAA,A}/<year>/*.csv.gz`, finished day
  files only, regular season, cached per level-season as parquet under `refit/cache`. Fit seasons: MLB 2021 (partial;
  the pull was still adding 2021 days during the run, 447k -> 712k pitches) - 2025, AAA 2024 (partial, still growing) -
  2025, A 2021-2025. About 5.4-5.7M pitches. The fits ran over about two hours while the pulls wrote, so the MLB 2021 /
  AAA 2024 counts differ slightly between groups.
- **2026 is never read for a fit.** Every season-loading path calls `assert_not_heldout` (`refit_load.load_savant`,
  `savant`, `load_statsapi`, `recency_weight`, `refit.check_seasons`; the group modules call `fit_seasons`). Tested in
  `tests_refit_v13.py` and the group tests.
- **Weight:** w = 0.5 ** ((2025 - season) / 2) per pitch (2025 1.0, 2024 .707, 2023 .5, 2022 .354, 2021 .25), the zone
  seed's rule. Levels pooled with equal per-pitch weight.
- **Which levels:** behavioral terms (rows 1-6, 9, B1-B3, B5, B6, B8-B11) pool MLB + AAA + A; MLB-level descriptions
  (row 7 medians, row 8 label check, row 10 / 13 targets, B4, B14, B15, B22) use MLB only.
- **Samples:** sequence fits use a fixed-seed sample of whole games per level-season: rows 2-4 / B7-B10 25%, B1 35%,
  rows 9 / B5 / B6 / B11 35%. Everything else uses all games.
- **Uncertainty:** "boot" = game-clustered bootstrap (games drawn with replacement); "SE" = cluster-robust (by game)
  SE of the random-intercept fit, same model as `seq_fit.Fit` (pitcher / batter intercepts, keyed per level).
- **statsapi** pitch files were not needed by any runnable route (they carry no location; the MLB Stats API was not
  pulled for MLB). Loader: `refit_load.load_statsapi` (done-file seasons only).

Code: `hitter_data/refit_load.py`, `refit.py` (rows 1, 5, 6, B1, B2, B3, B12), `refit_seq.py` (rows 2-4, B7-B10),
`refit_profiles.py` (rows 7-9, B5, B6, B11), `refit_mlb_targets.py` + `refit_chain.py` (rows 10-13, B4, B14, B15,
B22), `refit_apply.py` (writes refit.py's numbers into both engines). Results and logs: `C:/dev/pitchiq-data/refit/`.

## Refit table

Applied = in the numbers commit. File:line = before the change (inventory commit lines; JS in brackets).

| # | Number | engine.py [engine.js / ED] | Old | New | Uncertainty | Data | Applied |
|---|---|---|---|---|---|---|---|
| 1 | `HIT_FIT` approach | :181 [:501] | 0.2077 | **0.1961** | boot 0.0055 | prior-season tag -> next season, all 9 level pairs (MLB 21-25, AAA 24-25, A 21-25) | yes |
| 2 | `beta_T` | fit_v08 ship [ED P08] | 0.2409 | **0.2842** | SE 0.016 | pooled, 25% games | yes |
| 2 | `gamma_T` | fit_v08 ship | 0.30 (spec) | **0.1518** | SE 0.022 | as above; A3 rule: interval excludes spec and 0 -> fitted | yes |
| 2 | `lam`, `alpha` | fit_v08 ship | 0.8, 0.6 | 0.8, 0.6 | grid | weighted likelihood grid | yes (same) |
| 3 | `beta_E` / `beta_E_S` / `dstar_E` | fit_v08 ship | -0.1425 / -0.2526 / 2.0 | **-0.1827 / -0.0469 / 1.5** | SE 0.017 / 0.017 / grid | pooled, 25% games | yes |
| 4 | `beta_tun_chase` / `beta_tun_whiff` | fit_v08 ship | 0.3103 / 0 | **0.3179 / 0.0598** | SE 0.014 / 0.015 | pooled; whiff by A3 (interval excludes 0) | yes |
| 5 | `LAND_K` / `LAND_GAIN` | :809-810 [:167] | 20 / 2.0 | 20 / **1.9** | K: boot picks 20 (12/20), 40 (8/20); GAIN 1.921, SE 0.044 (beta 0.958, boot 0.022; c = 0.1155) | pooled, all games | yes |
| 6 | `GEO_HBP_BANDS` 12..30 in. | :904 [:218] | .003 .0165 .041 .104 .20 .345 .57 | **.00385 .0152 .0423 .103 .203 .344 .525** | boot .0001-.0074 | pooled; shape shared by MLB / AAA / A (rate / rate at 24 in. within 0.05 to 27 in.; +30 band A .51, AAA .49, MLB .56) | yes |
| 7 | `PROFILES` mlb (28 rows; college / HS through the MLB differences) | :1108-1258 [:34-40] | e.g. FB\| (0, 16.0, 7.7) | e.g. (0, 16.2, 7.7); largest CB\|12-6 IVB -11.8 -> -12.7, CB\|power, FC\|big HB -7.0 -> -6.2 | boot <= 0.15 in./mph | MLB, weighted medians | yes |
| 8 | `PROFILE_T` | :1260 [:41] | 24 thresholds | unchanged (the label check again moves only sl_sweeper_hb -12 -> -10) | - | MLB | no change |
| 9 | `PT_FBZ_H`, `PT_FBL_H`, `PT_PLAT` | :1270-1272 [:48-50] | tables | refit; largest FC\| up-same early -0.105 -> +0.229, PT_PLAT hard CH\|fade 0 -> +0.436 | SE ~0.001-0.005 on slopes | pooled, 35% games | yes |
| 10 | MLB K / BB / HBP per PA | `college_rates.py` MLB, `college_run_values.json` mlb_check | .200 / .079 / .009 | **.2251 / .0837 / .0110** | boot .0005 / .0003 / .0001 | MLB | yes |
| 10 | MLB zone / z-sw / o-sw / z-ct / o-ct / f-str | `calib.py:156` | .45 .65 .30 .87 .66 .59 | **.496 .674 .285 .846 .582 .619** | boot <= .001 | MLB (zone = Savant 1-9) | yes |
| 11 | `fit_mlb.json` OUT.mlb | outcome_params.py [ED OUTCOME_ADJ.mlb] | cmd -.643 zsw -.246 osw -.151 wz -.802 wo -.313 cs -1.018 hbp .0265 | refit by `refit_mlb.py` on the new targets and the refit engine (values in the numbers commit) | sim fit (max weighted rel. err ~0.10: f-strike and z-contact not reached) | simulated | yes |
| 12 | MLB command copied into levels | `fit_all.py` -> outcome_params.py | MLB's cmd / zsw / osw / cs | MLB's new values copied; level wild / wz / hbp refit to the level K/BB/HBP | sim fit | simulated | yes |
| 13 | IN_PLAY mlb + typed tables | fit_mlb.json, inplay_typed_params.py | 2010-15 hit mix | 1B .1418 2B .0430 3B .0036 HR .0307 E .0108 per PA; tables regenerated | boot <= .0004 | MLB | yes |
| 14 | Platoon sizes | no single constant | - | move through rows 9, B2, B6 | - | - | via those rows |
| B1 | `MM` succ / hard | :72 [:534] | 0.107 / -0.346 | **0.105 / -0.328** | SE 0.0074 / 0.033 | pooled, 35% games, seq_fit controls + shipped v0.8 terms | yes |
| B2 | `SIDE` (24 cells) | :80 [:541] | e.g. hard FB\|up\|opp -0.989 | e.g. -0.979; largest hard OS\|up\|same -0.212 -> -0.073, whiff OS\|up\|opp -0.853 -> -0.738, swing OS\|up\|opp -0.436 -> -0.341; hard FB\|down same / opp 0 -> +0.045 / -0.088 (interval now excludes 0) | SE 0.007-0.020 | pooled, all heart + edge pitches (3.46M) | yes |
| B3 | `POWER_HR` | :88 [:543] | 0.112 | **0.165** | SE 0.006 | pooled; fitted 0.178 per SD of the fit's own power measure (0.0676), restated per HARD_SD (0.0627) since one power point = one HARD_SD | yes |
| B4 | `HARD_SD` | fit_hitter_spread.py:9 | 0.0518 | **0.0627** | boot 0.0012 | MLB hitters 100+ BIP. Mostly less shrinkage from full seasons (every-4th-day sample gives 0.0526); needs Drew's call | yes |
| B5 | `PT_C`, `PT_B`, `PT_FBZ_W`, `PT_CHASE_OPP`, `PT_CHASE_MEAN`, `PT_FB_IVB` | :1267-1277 [:45-55] | tables; PT_FB_IVB 16.0 | refit; max PT_C move 0.052; PT_B chase CB\|power 0.280 -> -0.001; PT_FB_IVB **16.2** | SE ~0.001-0.005 | pooled 35% / MLB (IVB) | yes |
| B6 | `GB_PROFILE` | :1275 [:53] | e.g. FB\|rides .2642 | refit; largest CB\|power .434 -> .583, FC\|ride .412 -> .345, others within .03 | boot <= .022 | pooled 35% | yes |
| B7 | `TYPED["gb"]` (fit_v08 gb_types) | fit_v08 results | .3400 .5558 .4124 .3969 .4343 .4940 | **.3416 .5487 .4138 .4040 .4671 .5110** | < .002 | the kind averages of the B6 refit (same definition and data, so tests.py #16's agreement holds; refit_seq's own 25% sample gave .3405 .5521 .4163 .4060 .4688 .5085) | yes |
| B8 | `beta_y` | fit_v08 ship | -0.3634 | **-0.6207** | SE 0.040 | pooled 25% | yes |
| B9 | `KAPPA_FIT` (11 counts) | fit_v08 kappa | e.g. 3-0 +.588, 0-2 -.994 | e.g. 3-0 +.484, 0-2 -.952, 3-1 +.092 -> -.113 | SE .055-.070 | pooled 25% (centred on sim_constants TAKE_W as before; sim_constants.py not rerun) | yes |
| B10 | `phi_FB` / `phi_OS` | fit_v08 ship | 0.0295 / 0.116 (spec) | **0.0179 / 0.0435** | SE 0.0053 / 0.0080 | pooled 25%; phi_OS by A3 | yes |
| B11 | `SLOT_ANGLE`, `SLOT_MOVE` | :1276, :1278 [:54, :56] | e.g. low 3/4 29.1 | 29.5; FC reference 41.1 -> 39.8, CH 38.6 -> 37.8 | - | pooled 35% | yes |
| B12 | `HBP_LOC` | :543 [:18] | in 1.6 ... | unchanged | inside-crossing HBP ratio A 3.06, AAA 3.01, MLB 3.26 (boot <= .01) vs the 3.05 the shipped values match | A (v1.2's target level), all seasons | no change (check passes) |
| B13 | `GEO_HEART/ZONE/EXT` | :896 | | unchanged | | definitional (Savant attack zones) | no |
| B14 | RE24 / CV / LW mlb | run_tables.py:8, :13; college_run_values.json | RE 0\|000 .481; e.g. CV 3-0 .214 | **RE 0\|000 .500** (SE .003), most states +.01-.12; CV 3-0 .223, 2-1 .037; LW recomputed | boot | MLB innings 1-8 | yes. **RE.mlb[0,"000"] is run_scale's denominator: every level's run scale drops ~3.8%** |
| B15 | we_tables mlb | we_tables.json | 2010-15 chain | regenerated from the new rates (8 WE checks pass) | - | MLB | yes |
| B16 | MLB steal success 0.72 | :2797-2802 | 0.72 | unchanged | - | Savant MLB has no SB / CS events; MLB Stats API not pulled for MLB | no (source missing) |
| B17 | `DECISION_S` | :1302 [:99] | 0.175 s | unchanged | - | literature value | no |
| B18 | `DMG_SCALE` | :1540 [:166] | 3.0 | unchanged | - | sized to FanGraphs pitch values; plan 3.4 (hitter traits) | no |
| B19 | `SETUP_RULE["N2"]` | :250 [:1153] | 0.001 | unchanged | - | the size is simulation-sized (setup_sizes.py, then halved); the data only gave its direction | no (form doesn't refit) |
| B20 | `S0 C0 W0 F0 Q0` | :1091-1096 [:24-28] | | unchanged | - | provenance unclear; superseded by the zone table (waits on approval) | no |
| B21 | `zone_area` fallback | :1962 | | unchanged | - | dormant | no |
| B22 | pro AVG / OBP / SLG / K / BB | learner.js:752, learn.js:218, web/lib/report_data.ts | .255 .320 .405 .200 .079 | **.245 .315 .404 .225 .084** | boot <= .0013 | MLB | yes |

Count: 36 rows. **Refit and applied: 26** (1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, B1, B2, B3, B4, B5, B6, B7, B8, B9,
B10, B11, B14, B15, B22). **Refit, no change: 2** (8 thresholds, B12 HBP_LOC check). **Moves through other rows: 1**
(14). **Not refit: 7** (B13 definitional, B16 source missing, B17 literature, B18 plan 3.4, B19 simulation-sized,
B20 superseded by the zone table, B21 dormant). The college-data routes (per-level command, amateur early-count
approach, per-level platoon) wait for the college archive.

## Notes for Drew

- **Biggest moves:** POWER_HR +47%; the A3 flips (gamma_T 0.30 -> 0.15, phi_OS 0.116 -> 0.044, tunneling on whiffs
  0 -> 0.06); beta_E_S -0.25 -> -0.05; beta_y -0.36 -> -0.62; RE 0|000 (run scale at every level); HARD_SD (sizes every
  level's power spread).
- **HARD_SD** rises mostly because full seasons shrink hitters' rates less, not because hitters spread more. Applied as
  computed; a talent-SD definition would give ~0.070, the old every-4th-day sample 0.0526.
- **MLB calibration can't hit every new target**: the refit engine lands near f-strike 56% vs 61.9% and z-contact 82%
  vs 84.6% (rows 10-11). Some of the inplay_typed_params / hitter_spread_params change is rerun drift (rerunning
  inplay_fit.py / fit_hitter_spread.py on the unchanged branch already moves them, e.g. D1 g_d .856 -> .752).
- **Not rerun:** sim_constants.py (TAKE_W; kappa still centred on it), hs_rates.py, college / HS count values.

## Rule checks on the refit engine (before -> after, same scripts)

| Check | Script | v1.2.3 numbers | Refit numbers |
|---|---|---|---|
| Better stuff never makes a pitch cost more (fuzz, outside 2-0 / 3-0 / 3-1) | `fuzz.py` | 3000/3000 (3 tiny reversals < 0.002 runs) | **3000/3000** (4 tiny) |
| A pitch 2-for-10 is never called more than at 8-for-10 | `fuzz.py` | 144/150 (FAIL) | **146/150 (FAIL, as before)** |
| Get it over loses about half when not landing (slider 3-for-9 at 2-1) | `tests.py` | PASS | **PASS**: 26% fresh, 0% at 3 of 9, 29% at 7 of 9 |
| Hard rules: hard-rule scenario rows with any Not-acceptable share | `readthrough/scenarios.py --suite v12` | none | **none** |
| Scenario pass rule | same | 94/98 (P2, P3, P5, P7 fail) | 94/98 (E7, P2, P3, P7 fail: E7 new, P5 now passes) |
| No chase at 3-0 / 3-1; probabilities; windows; run tables; counts | `fuzz.py` Part A | same pass / fail set | same pass / fail set (the three window / trust / 2-for-10 fails exist before and after) |
| Fuzz learning rows | `fuzz.py` Part B | hs "crushes fastballs" FAIL, rest pass except the changeup confidence row | hs row now PASS; **college_d3 "fastball hole barely moves the call on thin evidence" now FAIL** (56 -> 63% at 3 looks); changeup confidence row FAIL as before |

## scripts/test-app.sh (Nov 21, lock held, run with `set -e` dropped so every check runs)

Pass: every suite except the ones below (refit tests, hitter_data, zone_seed, explain, all four fast_parity runs
= Python = JS, tests_v13_d2, tests_v13_sim, **golden_v13refit**, build matches source, web/lib copies, web demo, all Node
tests and e2e runs including game_mix_e2e, opponent_exact_test, peak_sim).

Fail, all from the moved numbers:
- **Exact-vs-old-numbers checks:** golden_v123 (240,501 differences); tests_v12 "exact at lean 0 vs 14e0ad2" (2);
  tests_v121 "identical to 504aaa8"; tests_v122 "identical to cb64db1" and its band-edge check against cb64db1;
  tests_v123 "exactly v1.2.2's"; tests_v11 "exactly v1.0 with Step 2 set back"; tests.py "LAND_K / LAND_GAIN are the
  results/v10 Statcast fit" (GAIN 1.9 vs that file's 2.02); tests_v12b "the fitted size is results/v12/hitter_fits.json's
  coefficient" (0.1961 vs 0.2077); tests_harness "one-zone integration reproduces v1.2's own outcome_probs" (the frozen
  v1.2 integration vs the live engine); logging_exact_test and drift_exact_test (old build = a git ref's app/dist with
  the old numbers, so the seeded games diverge; drift_exact_test's "drift notes really showed" precondition also fails
  because the refit games of seed 3 raised no note).
- **Behavior rows that moved (for Drew's regrade, nothing tuned back):** tests.py R1 mixing (1-2, runner on 3rd, after
  a fastball up-in: fastball 43%, slider 35%, wants within 6 points); tests_v11 Q4 (riding four-seam up at most 36% of
  two-strike calls: hs 41.4%, college_d3 42.5%); tests_v12 S5 re-gate row (sinker in 1.0%, toward 0.0%, away 12.1%);
  plus fuzz's college_d3 fastball-hole row and scenario E7 above.
