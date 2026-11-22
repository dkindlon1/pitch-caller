# v1.3 college count layer and run values: PROVISIONAL fits (buildout Part 3.1, 3.2, 3.5)

**PROVISIONAL.** These fits use the college data on disk on Nov 21, while the scrapes are still running. The numbers will
move as data lands. Nothing here is graded or approved, and nothing is wired as the engine default. D2 and D3 are
**THIN**: their 2025 full-game shares are about 0.34 and 0.14, under the plan's 0.5 rule. They are run and labelled, but
not held to anything.

**2026 was not touched.** It was never loaded, fit, tuned or scored. Every season passes `hitter_data.assert_not_heldout`.
Tuning used fits on seasons up to 2024, with 2025 as the validation season. The tables written for scoring are fit on
seasons up to 2024. The "ship" refits add 2025.

Branch `feat/hitter-v13-fits-count`, stacked on `feat/hitter-v13-prework` at 90fca9b. Data and outputs are in
`C:/dev/pitchiq-data/fits/`, not in git.

## 1. Entry points (each one can be called by a later `refit_all`)

| Command | Function | Writes |
|---|---|---|
| `python -m hitter_data.fit_count` | `fit_count.run()` | `fits/count_layer/{level}_{variant}_thru{2024,2025}.json`, `summary.json`, `report_tuning.csv`, `report_tables.md` |
| `python -m hitter_data.fit_runs` | `fit_runs.run()` | `fits/run_values/{level}_thru{2024,2025}.json`, `compare_2025.json` |
| `python -m hitter_data.fit_count_proxy` | `fit_count_proxy.run()` | `fits/count_layer/proxy_check.json` |
| `python -m hitter_data.score_candidates` | `score_candidates.main()` | `fits/score_2025/scores.json`, `scores.md` (needs `fit_count` first) |

- Per-season sufficient counts are cached in `fits/cache/`. The cache key is a hash of each season's full-game id list,
  so newly scraped games trigger a rebuild. `fit_count --no-cache` forces one.
- Run times: building the caches took about 5 minutes the first time. After that, fit_count takes 12 s, fit_runs 18 s,
  the proxy check 13 s (Single-A cached) and score_candidates 70 s (B = 1,000). Logs are in `fits/logs/`.
- Tests: `python3 tests_fit_count.py` runs 57 checks on synthetic counts and a synthetic SQLite fixture. It is wired
  into `scripts/test-app.sh`.

Code:
- `hitter_data/fit_count_data.py`: the counts. They are built from `harness.build_season`, so the fits see exactly the
  harness's pitches, filters and contexts. One extra text pass reads the proxy and handedness.
- `hitter_data/fit_count.py`: the model, the tuning and the candidate JSON.
- `hitter_data/fit_runs.py`: the run values.
- `hitter_data/fit_count_proxy.py`: the proxy check.
- `hitter_data/score_candidates.py`: harness scoring.

## 2. Model

The model is a shrinkage chain, fit per level. Every alpha is a pseudo-count in pitches.
- Per count: the 6 pitch outcomes (ball, HBP, called strike, whiff, foul, in play). These map to the engine's chain:
  swing / take, called strike given take, and whiff / foul / in play given swing.
- Count × outs × bases is shrunk toward the count (`A_bo`).
- Side (same / opposite / unknown) and late-and-close are per-count multiplicative offsets (`A_sd`, `A_lt`).
- The full harness cell is shrunk toward the product (`A_cell`).
- Ball in play: the result by count × base-out is shrunk toward the count (`B_bo`). Type given result is by count,
  shrunk toward the pooled value. This is the harness's imputation, because hits are mostly untyped.
- Recency: a season's weight is 0.5^((target − 1 − season) / half-life). Only the 8 seasons before the target count.
- Variants:
  - `sep`: each level alone.
  - `borrow`: `sep`, plus any cell with fewer than K weighted pitches is topped up to K from the neighbouring levels
    (D1 ↔ D2 ↔ D3, by data weight), shifted to this level's per-count rates.
  - `shared`: one pattern pooled over all levels, plus a per-level offset (one 6-outcome multiplier, raked).
  - `borrow_noplatoon`: `borrow` with the side offsets off, used for the platoon check.
- Tuning: coordinate descent (2 passes) over the half-life, `A_bo`, `A_sd`, `A_lt`, `A_cell`, K and `B_bo`. It
  optimises the harness's primary metric (pitch_5way) on 2025, computed from counts, with the fit on seasons up to 2024.
  `B_bo` is tuned on bip_result.

## 3. Half-life

pitch_5way on 2025 by half-life, with the other parameters at their tuned values. The curve is very flat.

| Level | Variant | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 6 | ∞ | chosen |
|---|---|---|---|---|---|---|---|---|---|---|
| D1 | shared | 1.44542 | 1.44532 | **1.44531** | 1.44531 | 1.44533 | 1.44534 | 1.44537 | 1.44544 | 1.5 |
| D1 | borrow | 1.44548 | 1.44537 | **1.44535** | 1.44536 | 1.44537 | 1.44539 | 1.44542 | 1.44549 | 1.5 |
| D2 (THIN) | shared | 1.44286 | **1.44283** | 1.44285 | 1.44287 | 1.44289 | 1.44290 | 1.44292 | 1.44296 | 1 |
| D2 (THIN) | borrow | 1.44300 | 1.44288 | 1.44284 | 1.44281 | 1.44278 | 1.44277 | 1.44276 | **1.44276** | ∞ |
| D3 (THIN) | shared | 1.44340 | 1.44334 | **1.44333** | 1.44334 | 1.44338 | 1.44341 | 1.44345 | 1.44359 | 1.5 |
| D3 (THIN) | borrow | 1.44411 | 1.44378 | 1.44364 | 1.44358 | **1.44356** | 1.44359 | 1.44365 | 1.44391 | 3 |

- **Chosen for D1: 1.5 seasons.** It is within 0.00001 nats of the plan's default of 2.
- Stability check, tuned on 2024 with the fit on seasons up to 2023: D1 picks 3, D2 picks 4, D3 picks 6.
- So the half-life is not well identified: anything from 1.5 to 3 is within 0.0001 nats. **The plan's default of 2
  costs nothing measurable.**

## 4. Borrowing (variant `borrow`, K tuned on 2025)

The share is the borrowed pseudo-pitches over (own + borrowed), weighted by the level's own pitches.

| Level | K | count | count × base-out | full cell | cells borrowing (count × base-out) |
|---|---|---|---|---|---|
| D1 | 100 | 0.000 | 0.000 | 0.006 | 3 / 288 |
| D2 (THIN) | 5000 | 0.000 | 0.243 | 0.458 | 250 / 288 |
| D3 (THIN) | 5000 | 0.037 | 0.744 | 0.824 | 287 / 288 |

The data asks for heavy borrowing at D2 and D3, and K landed at the top of the plan's range. Per count, D2's
count × base-out share runs from 0.06 at 0-0 to 0.76 at 3-0 (`count[*].borrowed_share` in the JSON). The run values
borrow D2 0.23 and D3 0.58, and D1 essentially nothing.

## 5. Level split (plan 3.1: keep separate only if better by more than 2 SE)

pitch_5way on 2025, sep − shared, paired. The SE is the largest of the game / home-team / two-team bootstrap SEs
(B = 1,000).

| Level | sep − shared | SE | Result |
|---|---|---|---|
| D1 | +0.00005 | 0.00002 | shared is better (1.9 SE): **ship shared + level offset** |
| D2 (THIN) | +0.00017 | 0.00015 | **shared + offset** |
| D3 (THIN) | +0.00049 | 0.00034 | **shared + offset** |

- Separate patterns never win.
- Under the rule, the candidate per level is **`shared`** (`{level}_shared_thru2025.json` to ship,
  `_thru2024` as scored).
- `borrow` is statistically tied with `shared` at every level (D2: borrow − shared −0.00008, SE 0.00013).

## 6. Hard-contact proxy vs Single-A Statcast (2021-2025, 144,035 non-bunt balls in play, 126,228 with exit velocity)

Definitions:
- Proxy: hard = a line drive or an extra-base hit, per ball in play. Weak = a pop-up, or a grounder / single to the
  pitcher or catcher.
- On Statcast, the "as scored" version counts only line-drive **outs**, since college scorers rarely call a hit a liner.
- Truth: hard-hit = exit velocity of at least 95 mph; soft = under 80 mph.

| Check | Spearman over the 12 counts |
|---|---|
| Single-A: hard proxy (full) vs hard-hit | +0.895 |
| Single-A: hard proxy (as scored) vs hard-hit | +0.916 |
| Single-A: weak proxy vs soft | **−0.140** |
| College D1 hard proxy (2015-25, 1.25 M balls in play) vs Single-A hard-hit | +0.972 |
| College D2 / D3 hard proxy vs Single-A hard-hit | +0.930 / +0.923 |
| College D1 / D2 / D3 weak proxy vs Single-A soft | +0.22 / +0.64 / +0.47 |

- Per ball, the hard-hit rate is 0.518 when the proxy says hard and 0.239 otherwise (0.320 overall).
- **The hard proxy ranks counts the way hard-hit rate does.** Both peak at 3-0 / 3-1 / 2-0 and are lowest at 0-2 / 1-2.
- **The weak proxy does not rank counts.** Treat it as a ball-type label only, not a contact-quality signal by count.

## 7. Platoon (handedness match rate)

- Both hands known: D1 10.6% of 2025 PAs, D2 14.4%, D3 5.4%.
- Batter only: 22.5% / 18.0% / 19.5%. Pitcher only: 20.1% / 12.3% / 8.8%.
- So 89% / 85% / 95% of pitches have side "unknown" (harness R13).
- Effect (D1 borrow ship tables): opposite-hand takes are called strikes about 1.5-2 points less often (0-0: .382 vs
  .402), and full-count whiffs are lower (.172 vs .187). Swing rates barely move.
- Gain on the known-hand pitches only, borrow − borrow_noplatoon:
  - D1: −0.00010 (SE 0.00007), 197,584 pitches;
  - D2: −0.00105 (SE 0.00056);
  - D3: −0.00045 (SE 0.00114).
- That is real in direction but not yet 2 SE anywhere. It is worth keeping as a per-count offset. The tables are in
  `platoon` in each JSON.

## 8. Candidate file format (plain per-level JSON; to be converted to `docs/TABLES_v13.md` once that format exists)

The files are `fits/count_layer/{D1,D2,D3}_{sep,borrow,shared}_thru{2024,2025}.json`, plus `_borrow_noplatoon_thru2024`.

| Key | Content |
|---|---|
| `provisional`, `format`, `level`, `thin`, `variant`, `predicts_season` | Labels. `format` = `count-layer-candidate/1` |
| `fit_seasons` | {season: recency weight} |
| `params`, `diagnostics` | Tuned hyper-parameters (null = ∞) and the borrowed shares |
| `axes` | count `"b-k"` ×12, outs 0-2, bases `"000"…"123"` (bi = on1 + 2·on2 + 4·on3), side same/opp/unknown, late 0/1, p6 / bip names |
| `count[ck]` | `p6` (ball, hbp, cstrike, whiff, foul, inplay), `swing`, `cstrike_given_take`, `hbp_given_take`, `whiff_given_swing`, `foul_given_swing`, `inplay_given_swing`, `n_weighted`, `borrowed_share` |
| `p6_count_bo` | [12][3][8][6]: count × outs × bases |
| `p6_ctx` | [12][3][8][3][2][6]: the full harness cell (what is scored) |
| `platoon[ck].same/opp` | Chain terms with the side offset |
| `late_offset` | [12][2][6] multipliers |
| `bip[ck]` | `result` (out 1B 2B 3B HR E), `type` (ground line fly pop), `result_given_type` |
| `bip_result_count_bo`, `bip_type_given_result_count` | [12][3][8][6] and [12][4][6]: the in-play tables that are scored |
| `hard_proxy[ck]` | `n_bip`, `hard`, `weak` per ball in play (data, recency-weighted) |
| `runs` | Additive `RE` [3][8] and `CV` [12] (the harness needs them; the run-value candidate is the file below) |

Run values: `fits/run_values/{level}_thru{2024,2025}.json`:
- `RE["o|bases"]`;
- `CV["b-k"]`;
- `RV["b-k|o|bases"]` (count × base-out);
- `n_pitch_states`, `params`, `borrowed_share`.

`fit_count.tables_from_json` turns a count file into the harness's `Tables`.

## 9. Run values (2025, fit on seasons up to 2024) vs today's tables

The comparison is the mean squared error of runs in the rest of the inning, with SE = the largest of the three
bootstrap SEs.

| Level | Table | PA-start MSE | Pitch-state MSE | vs today (PA-start) | vs today (pitch-state) |
|---|---|---|---|---|---|
| D1 | today `college_d1` | 1.7063 | 1.6541 | | |
| D1 | fit RE + CV | 1.7008 | 1.6510 | −0.0054 (SE 0.0015) | −0.0031 (SE 0.0012) |
| D1 | fit count × base-out | 1.7008 | 1.6485 | −0.0054 (SE 0.0015) | **−0.0056 (SE 0.0013)** |
| D2 (THIN) | today D1 / today D3 | 1.9195 / 1.9016 | 1.8470 / 1.8341 | | |
| D2 | fit count × base-out | 1.8963 | 1.8271 | −0.023 (0.014) vs D1; −0.005 (0.004) vs D3 | −0.020 (0.012) vs D1; −0.007 (0.005) vs D3 |
| D3 (THIN) | today `college_d3` | 2.0029 | 1.9177 | | |
| D3 | fit count × base-out | 1.9964 | 1.9075 | −0.006 (0.015) | −0.010 (0.015) |

- The fitted tables predict at least as well as today's at every level: about 4 SE better at D1, and inside the noise
  at D2 and D3. That meets the plan's bar for these candidates.
- For D2 the bar is both the D1 and the D3 table, and it is met in point estimate.
- Level shifts:
  - D1 RE(0 outs, empty) is 0.768 vs today's 0.700. Today's table comes from 2026 conference stats for mid / low
    majors, harness R12.
  - D2 is 0.868.
  - D3 is 0.785 vs today's 0.952. D3's full-game sample is small and selected.
- Tuned parameters: D1 half-life 1, A 200, K 200. D2 and D3: half-life ∞, K 5000.

## 10. Scores on 2025 (harness, B = 1,000; pitch_5way per pitch, SE = the largest clustered SE)

The candidates' hyper-parameters were chosen on 2025, so these scores are slightly optimistic. 2025 is the
validation season; the pass / fail test is 2026, once, at Step 6.

| Level | v1.2 | v1.2_recal (pass ref.) | base_count_bo | v13 shared | v13 borrow | shared − recal | borrow − recal |
|---|---|---|---|---|---|---|---|
| D1 (6,210 games, 1.87 M pitches) | 1.4668 | 1.4464 | 1.4454 | 1.4453 | 1.4454 | **−0.00110 (0.00008)** | −0.00105 (0.00007) |
| D2 THIN (736 g, 196 k) | 1.4627 (@D3 1.4644) | 1.4438 (both refs) | 1.4435 | 1.4428 | 1.4428 | −0.00096 (0.00029) | −0.00104 (0.00028) |
| D3 THIN (220 g, 63 k) | 1.4699 | 1.4440 | 1.4460 | 1.4433 | 1.4435 | −0.00069 (0.00033) | −0.00052 (0.00028) |

- **Every candidate beats raw v1.2 by about 0.02 nats, and beats the per-count reference** (D1 by 14 SE; D2 by 3-4 SE;
  D3 by 2.1 SE for shared and 1.8 SE for borrow).
- **The gain over per-count frequencies is about 0.001 nats per pitch, under the proposed 0.002 minimum effect**
  (`MIN_EFFECT`, for Drew). It is the base-out context. On D1 the candidate equals `base_count_bo`. The count layer
  alone can't buy more under this harness; the zone and pitch parts must (HARNESS_v13 section 6).
- Secondary metrics (D1): bip_result 1.0752 vs recal 1.0754, pa_5way 1.3878 vs 1.3891, bip_type_outs equal.
- The D1 2025 data has grown since the HARNESS_v13 baseline: 6,210 full games now vs 2,686 then. So v1.2 is 1.4668 now
  vs 1.4678 in that table.
- The full tables, with game / home / two-team SEs and every pairwise difference, are in `fits/score_2025/scores.md`.

## 11. Open

- All of this is provisional. Rerun the four commands when the scrapes finish. D2 and D3 stay thin until their 2025
  coverage reaches the plan rule.
- The level-split call (shared) and K = 5000 for D2 / D3 may change with more D2 / D3 games.
- Hyper-parameters were tuned on 2025 and scored on 2025. A cleaner choice would tune on 2024 and confirm on 2025 (the
  stability column in section 3 does this for the half-life). The 2026 test is the clean one.
- The weak-contact proxy fails the Single-A ranking check (section 6). Count tables should carry the hard proxy only.
- Side is unknown for about 90% of pitches. The platoon offsets rest on 5-15% of PAs.
- Not done here:
  - HS / travel (Part 1 intake and its pitch-class / velocity splits);
  - converting to the TABLES_v13 format;
  - walk / strikeout linear weights (`_lw_bb`, `_lw_k`);
  - the Single-A zone-by-zone check of a v1.3 count layer (HARNESS_v13 section 10, required before v1.3 ships).
