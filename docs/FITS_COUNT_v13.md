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
| `python -m hitter_data.fit_count_hs` | `fit_count_hs.run()` | HS / travel, everything in one run (section 12): `fits/count_layer/hs_*.json`, `fits/run_values/hs_thru{2024,2025}.json`, `fits/hs/hs_summary.json`, `hs_report.md` |

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
| `n_count_bo`, `late_share` | Weighted pitches per count × outs × bases, and the late-and-close share per count (the export's calibration weights) |
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
  - walk / strikeout linear weights (`_lw_bb`, `_lw_k`);
  - the Single-A zone-by-zone check of a v1.3 count layer (HARNESS_v13 section 10, required before v1.3 ships).

## 12. HS / travel (level `hs`: one model for both, Drew Nov 21; travel keeps HS's numbers; no bat type)

**PROVISIONAL.** The Perfect Game data is about 40% collected: the Atlanta 15U-17U events are 20-40% captured. 2026
was not touched.

The numbers below come from the first run, at 7,235 games. The HS ingest kept running, and a rerun later the same
evening, at 7,645 games, moved every figure by 0.0003 nats or less. The candidates exported in section 13 come from
that rerun. Rerun values:
- kind + velocity terms: +0.0103 (SE 0.0005);
- `sep` − recal: −0.00096 (SE 0.00013);
- platoon on known-hand pitches: −0.00021 (SE 0.00005);
- run values vs today, pitch state: −0.050 (SE 0.012).

Command: `python -m hitter_data.fit_count_hs [--boot 1000] [--no-cache]`. It takes about 35 s once the seasons are
cached (`fits/cache/hs_season_*.pkl`, keyed on the games' content hashes). Code: `hitter_data/fit_count_hs.py`.

**Data:**
- `hs.sqlite3`, read-only. Games with a full pitch log, 2022-2025: 7,235 games and 1.52 M pitch events.
- Fit seasons 2022-2024; 2025 is the validation season (1,921 games, 404,959 pitches).
- The season build mirrors the college harness: the same replay (`harness.pitch_events` on the letter string plus the
  in-play pitch), the same filters and the same contexts. Late = inning 5 or later of 7 with a margin of 2 or less.

### 12.1 Count layer

All variants were tuned on 2025 with the fit on seasons up to 2024.

| Variant | Half-life | A_bo | A_sd | K | pitch_5way 2025 |
|---|---|---|---|---|---|
| `sep` (HS / travel alone) | 2 | 3200 | 5000 | n/a | 1.44305 |
| `borrow` (from D3) | 3 | 3200 | 5000 | **0** | 1.44308 |
| `shared` (HS + D3 + HS offset) | 1.5 | 3200 | ∞ | n/a | 1.44324 |

- **There is no borrowing from D3.** The tuned K is 0 and the borrowed share is 0.000. HS has 1.1 M fit pitches, and
  D3's pattern doesn't help.
- The half-life curve is flat: 1.5-6 are within 0.00001 nats.
- **The candidate is `hs_sep_thru2025.json`.** The paired 2025 harness differences:
  - shared − sep = +0.00018 (SE 0.00007);
  - borrow − sep = +0.00003 (SE 0.00003).

Per-count tables (`sep`, ship refit, weights 2022 .35 / 2023 .50 / 2024 .71 / 2025 1.0):

| Count | n | swing | cs/take | whiff/sw | foul/sw | inplay/sw |
|---|---|---|---|---|---|---|
| 0-0 | 261,135 | .311 | .341 | .236 | .358 | .406 |
| 0-1 | 109,539 | .405 | .271 | .266 | .347 | .387 |
| 0-2 | 53,402 | .481 | .157 | .301 | .334 | .365 |
| 1-0 | 116,196 | .375 | .327 | .218 | .359 | .423 |
| 1-1 | 95,407 | .431 | .273 | .248 | .352 | .400 |
| 1-2 | 74,843 | .505 | .169 | .288 | .331 | .381 |
| 2-0 | 47,965 | .349 | .359 | .214 | .362 | .424 |
| 2-1 | 59,470 | .454 | .280 | .229 | .367 | .404 |
| 2-2 | 67,288 | .530 | .178 | .269 | .340 | .391 |
| 3-0 | 19,626 | .117 | .499 | .221 | .361 | .417 |
| 3-1 | 32,832 | .431 | .310 | .210 | .371 | .419 |
| 3-2 | 49,232 | .559 | .196 | .231 | .361 | .408 |

The hard proxy is not comparable with college: PG labels hits as liners too, so it reads about .27 vs college's .17.

### 12.2 Format terms and pitch terms

Each term is a multiplicative offset per count × term level, shrunk to 1 with 200 pseudo-pitches. It is fit on seasons
up to 2024 on top of `sep`, and scored on 2025 as a paired difference. The SE is the largest of the game / home-team /
two-team bootstrap SEs (B = 1,000).

| Term | 2025 gain (nats / pitch) | SE | Kept (> 2 SE) | ≥ 0.002 |
|---|---|---|---|---|
| HS vs travel | −0.00002 | 0.00005 | no | no |
| age group | +0.00048 | 0.00015 | yes | no |
| pool / bracket | −0.00003 | 0.00007 | no | no |
| series | +0.00036 | 0.00013 | yes | no |
| all four format terms together | +0.00046 | 0.00016 | yes | no |
| pitch class (FB / breaking / offspeed) | +0.00677 | 0.00043 | yes | **yes** |
| pitch kind (FB / CB / SL / CH) | +0.00697 | 0.00044 | yes | **yes** |
| velocity vs his own mean, per class | +0.00829 | 0.00044 | yes | **yes** |
| absolute velocity, per class | +0.00916 | 0.00048 | yes | **yes** |
| kind + relative + absolute velocity | **+0.01040** | 0.00052 | yes | **yes** |
| kind + velocity + all format terms | +0.01024 | 0.00053 | no gain over the line above | |

- HS vs travel and pool vs bracket don't matter. Age group and series are real but tiny (under 0.0005). Once pitch kind
  and velocity are in, they add nothing (the last row). So one HS / travel model is supported.
- Pitch kind and velocity are the first terms in this buildout to clear the proposed 0.002 minimum effect, by about
  5×.
- Missing information gets no adjustment. Blank pitch types (2.4% of 2025 pitches) and missing velocities (5.0%) are concentrated on the
  in-play pitch (in play .26-.28 vs .16), a scorecard artefact. A "missing" level would learn the outcome, so those
  pitches get no term adjustment (tested). The engine always knows the pitch.

Effects (2022-2025, game-bootstrap SE ≈ 0.001-0.004). The first numbers are raw rates; Δ is against what the count
layer expects at that count and state. The full tables, including velocity bins and age groups, are in
`fits/hs/hs_report.md`.

| Pitch | swing | whiff / swing | in play / swing | Δ swing | Δ whiff / swing | Δ in play / swing |
|---|---|---|---|---|---|---|
| Fastball | .422 | .221 | .411 | +.025 | −.024 | +.011 |
| Curveball | .332 | .331 | .359 | −.085 | +.071 | −.035 |
| Slider | .364 | .378 | .325 | −.053 | +.117 | −.069 |
| Change-up | .410 | .348 | .342 | −.003 | +.090 | −.049 |
| FB < 70 mph | .403 | .180 | .479 | +.017 | −.059 | +.075 |
| FB 80-85 | .421 | .227 | .393 | +.022 | −.018 | −.007 |
| FB ≥ 85 | .427 | .275 | .337 | +.023 | +.025 | −.061 |
| FB ≥ 3 mph under his mean | .395 | .200 | .451 | +.009 | −.043 | +.050 |
| FB ≥ 3 mph over his mean | .419 | .262 | .375 | +.006 | +.005 | −.019 |
| Breaking ≥ 75 mph | .376 | .415 | .295 | −.045 | +.153 | −.098 |
| Breaking ≥ 3 under his mean | .277 | .293 | .382 | −.130 | +.037 | −.014 |

Velocity mostly moves whiff and contact, not swing. Within a pitcher, the gradient is about −0.025 whiff and +0.03 in
play per swing for each 2 mph below his mean. Swing changes only on breaking balls: slow breaking balls are taken more.

### 12.3 Platoon (the first real test: hands matched for 87-94% of PAs, 2022-2025)

- Both hands known: 94.0% / 88.3% / 89.2% / 86.7% of PAs by season; 351,074 of 404,959 pitches in 2025.
- On the known-hand pitches, `sep` − `sep_noplatoon` = **−0.00022 (SE 0.00005), about 4.4 SE**: platoon is real. Over
  all pitches it is −0.00016 (SE 0.00006).
- It is small in nats. The visible effect is on called strikes: opposite-hand takes are called strikes 2-3 points less
  often (0-0 .324 vs .350; 0-2 .139 vs .166). Swing and whiff move by under a point.

### 12.4 Run values vs today's HS table (2025; 101,193 PAs, 364,554 pitch states)

| Table | PA-start MSE | Pitch-state MSE | vs today (PA-start) | vs today (pitch-state) |
|---|---|---|---|---|
| today `hs` (MaxPreps, ×1.111) | 1.9185 | 1.9131 | | |
| fit RE + CV | 1.8710 | 1.8675 | −0.0475 (SE 0.0131) | −0.0455 (SE 0.0134) |
| fit count × base-out | 1.8710 | 1.8648 | −0.0475 (SE 0.0131) | **−0.0482 (SE 0.0130)** |

- **Today's HS table is too high for PG play.** Runs from 0 outs, bases empty are 0.777 here vs 1.069 today; bases
  loaded with 2 outs is 1.034 vs 1.282. Count values are close (3-0 +0.420 vs +0.415).
- Tuned: half-life 1, A 1000, K 1000. 4% is borrowed from D3.
- Caveat: halves cut short by the time limit or run rule are excluded, as in college. PG showcase play may not
  represent HS varsity play generally.

### 12.5 Scores on 2025 (harness, pitch_5way; v1.2 at HS settings is asked about the D3 frozen pitcher world)

| Version | pitch_5way (SE) | − v1.2_recal (SE) |
|---|---|---|
| v1.2 [hs, D3 world] | 1.4552 (0.0023) | +0.0112 |
| v1.2_recal (pass reference) | 1.4440 (0.0022) | |
| base_count / base_count_bo | 1.4439 / 1.4437 | |
| **v13 `sep`** | **1.4431 (0.0022)** | **−0.00094 (0.00013), 7 SE** |
| v13 `borrow` / `shared` | 1.4431 / 1.4432 | −0.00091 / −0.00075 |

- **The count layer alone gains about 0.001 nats over per-count frequencies, as in college.** The harness can't see
  pitch type or velocity, because it scores the table without the pitch.
- On top of that table, the pitch-kind + velocity terms (12.2) add 0.0104 on the same 2025 pitches. That gain is the
  one that matters for HS. It needs the engine to read per-pitch-class count terms, which is not in the table format
  yet.
- The frozen calib world has no HS mix. So raw v1.2 at HS is approximate; `v1.2_recal` doesn't depend on the mix.

### 12.6 Candidate files

- `fits/count_layer/hs_{sep,borrow,shared}_thru{2024,2025}.json`, plus `hs_{sep,borrow}_noplatoon_thru2024.json`.
  The format is the same as section 8, with level `hs`.
- `fits/run_values/hs_thru{2024,2025}.json`.
- The term offsets are not written as an engine table yet. They live in `fits/hs/hs_summary.json` (`terms`,
  `effects`). The format can't carry them: section 13 lists the new table they need.

## 13. Candidate engine tables (docs/TABLES_v13.md format), PROVISIONAL

Command: `python -m hitter_data.export_candidates`, about 7 minutes. It is the `export` step in `refit_all`, after
`fit_count_hs`. Output goes to `C:/dev/pitchiq-data/fits/candidates/`. Nothing in `data_tables/` changes, and nothing is
the default.

**Files:**
- `count_v13prov.json`: `data_tables/count_v12.json` with version `v13prov`.
  - college_d1, college_d2 (THIN) and college_d3 (THIN) come from the `shared` candidates (the level-split rule). hs
    comes from `sep`. All are `*_thru2025`.
  - The numbers the fit owns are replaced: `swing`, `whiff`, `foul`, `cstrike`, `bip_gb` and `swing_base_out`.
  - `hard`, `out_table`, `runner` and mlb stay v12's.
- `run_v13prov.json`: `run_v12.json` with `re` and `cv` replaced for college_d1, college_d3 and hs. `cv` is shifted so
  that 0-0 = 0. `lw` and mlb stay v12's.
  - **There is no college_d2 entry.** The engine therefore lists RE / CV / LW in `D2_PLACEHOLDERS`, and
    `release_guard_d2.py` exits 1 with both candidates loaded.
- `export_report.json` and `export_report.md`: the errors, the proof, and what isn't carried.

### How the fit maps onto the format

The fit gives probabilities; the engine's count terms are logit offsets on top of its base + zone + class terms.
- The engine is asked for its per-count rates through the harness's frozen calib-world pitcher (HS: the D3 mix). The
  rates are averaged over the level's own count × base-out × side × late mix.
- One offset per count per term is iterated (secant steps, at most ±4 logit) until the engine gives back the fitted
  swing, whiff | swing, foul | contact, called strike | take and ground ball | in play.
- Each count's offset is added to every band, so v1.2's band shape is kept.
- `swing_base_out` gets one offset per state, shared by all counts.
- The check runs in a fresh process with `PITCH_COUNT_TABLE=<path>` set and no in-memory edits.

**Max |engine − fit| per level:**

| Level | Per-count terms (swing, whiff/sw, foul/contact, cs/take, GB/BIP) | Swing by count × base-out: max over cells with ≥ 500 pitches / weighted RMS |
|---|---|---|
| college_d1 | 0.00000 | 0.041 / 0.009 |
| college_d2 (THIN) | 0.00000 | 0.027 / 0.009 |
| college_d3 (THIN) | 0.00000 | 0.026 / 0.008 |
| hs | 0.0050: only cs/take at 3-2 (offset at the −4 cap); everything else 0.00000 | 0.020 / 0.005 |

- **HS 3-2:** the engine's called strike moves only on edge / off takes, because heart and way-off use the fixed base
  rate. Under the frozen landing, the fitted 3-2 rate is out of reach.
- **Count × base-out:** the residual is the format's limit, since one base-out offset is shared by all 12 counts.

### Caveats

- These offsets are fit **under the harness's frozen calib-world landing**, which is heart-heavy against Single-A
  (HARNESS_v13 section 10). The count offsets absorb that landing's error: the R1 / E7 trap. Expect large moves vs v12,
  for example D1 0-0 swing −0.66 vs −0.40 and 3-0 swing −3.17 vs −2.0. The Single-A zone-by-zone check stays required
  before anything ships.
- **`bip_gb` +1.0 to +1.4 logit at college** (hs +0.4 to +0.7): the scorer's "ground" share (D1 0-0: .59 of balls in
  play, with types imputed on hits) is far above the engine's Statcast-based ground-ball rate. Scorer words are not
  Statcast types (risk R9), so treat `bip_gb` as the least trustworthy number here.

### Proof (the export runs it)

| Check | Result |
|---|---|
| Python with the env override | `TABLE_VERSIONS` = zone v12, count v13prov, run v13prov; `check_table` passes |
| JS | `app/export_data.py --out fits/candidates/engine_data_v13prov.json` and `node` with `app/engine.js` load it (versions recorded) |
| Python vs JS, 300 outcome cases + 40 full calls (tests_v13_tables runners) | worst difference 2.9e-14 |
| Calls vs v12 | 10 of 40 top calls change, as expected |
| `release_guard_d2.py` with both candidates | exit 1 (D2 placeholders remain: RE, CV, LW, OUT_TABLE, …) |

### What the format can't carry (needed tables, listed, engine unchanged)

1. **HS pitch kind × velocity**: 2025 gain +0.0103 nats per pitch. Proposed:
   `count_<v>.levels.hs.pitch[count][kind FB/CB/SL/CH][velo bin]`, logit offsets on swing / whiff / foul / cstrike,
   with velocity relative to the pitcher's own mean and absolute (bins as `fit_count_hs.VREL_EDGES` / `VABS_EDGES`).
2. **Platoon**: per-count same / opposite offsets. At HS it is real: −0.0002 nats, about 4 SE.
3. Whiff, foul, called strike and in play by base-out. Only swing has a base-out term.
4. Late-and-close per-count offsets.
5. Ball-in-play result by count (and count × base-out). `out_table` is by contact quality × type.
6. A per-band shape for the count terms. The fit has no zone.
7. Run values by count × base-out. The run file is additive `re` + `cv`.
8. `lw` (walk / strikeout run values) is not refit.

## 14. v1.3 core (Nov 22, `feat/hitter-v13-core`): the D1 and HS candidates recalibrated under the h3 landing

What depends on the landing: only the conversion to engine offsets (`export_candidates`) and the harness scores. The fits
themselves (`fit_count`, `fit_runs`, `fit_count_hs`) are per-count frequencies from the data and were not rerun (same
candidates as section 13: D1 `shared`, HS `sep`, thru 2025). Command:
`PITCH_ZONE_TABLE=v13 PITCH_COUNT_TABLE=v13refit PITCH_RUN_TABLE=v13refit python -m hitter_data.export_candidates --core`
(78 s), which writes `data_tables/count_v13core.json` / `run_v13core.json` (the core defaults, docs/TABLES_v13.md) and
`fits/candidates/core_export_report.json`.
- Calibrated under the harness's **h3 landing (Single-A)**, the **approved zone table (zone_v13)**, on top of the refit's
  count layer (count_v13refit). D2 / D3 keep v1.2's count layer (not recalibrated; pending the coverage rule).
- HS: calibrated with the pitch kind x velocity table off (the count layer is the average pitch), then the table is added
  (section 12.2's stack, now carried: `levels.hs.pitch_velo`). The HS 3-2 called strike, out of reach at the -4 cap under
  the old landing, is now reached: max per-count error 0.00002 (D1 0.00000) in a fresh process.

Before / after (D1; HS alike). "h2 row" = the section-13 export's row (fit under the h2 calib-world landing, zone_v12),
asked under the h3 landing and zone_v13; "fit" = the fitted rate, which the new row reproduces exactly:

| Count | swing fit / h2 row | whiff per swing fit / h2 row | called strike per take fit / h2 row | swing offset (heart) h2 → core | cstrike offset h2 → core |
|---|---|---|---|---|---|
| 0-0 | .292 / .268 | .245 / .309 | .395 / .400 | -0.66 → -0.52 | 1.25 → 1.27 |
| 1-0 | .377 / .338 | .227 / .316 | .387 / .413 | -0.21 → -0.01 | 1.39 → 1.26 |
| 3-0 | .050 / .037 | .247 / .431 | .579 / .496 | -3.17 → -2.85 | 1.26 → 2.04 |
| 0-2 | .490 / .432 | .283 / .339 | .092 / .077 | 0.74 → 1.03 | -2.44 → -1.15 |
| 3-2 | .640 / .593 | .187 / .249 | .193 / .159 | 1.03 → 1.27 | -0.93 → -0.15 |

- The old rows miss by up to .074 in swing, .184 in whiff per swing and .083 in called strike per take (HS .064 / .133 /
  .084): the h2 landing's heart-heavy mix and v1.2's zone shape were absorbed into them.
- The core's D1 3-0 swing offset (-2.85) is still beyond v1.2's -2.0, now relative to the Single-A zone shape.
- The section-13 candidates (`count_v13prov` / `run_v13prov`, all four levels) are now also calibrated on count_v13refit
  under zone_v13 when `export_candidates` (or `refit_all`'s export step, which sets the overrides) is rerun; they were not
  rerun here.
