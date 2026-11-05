# v0.9 Step 0 report: preflight (no engine change)

Date: 2026-11-05. Branch `v0.9-work`, from `v0.8-build` at 2caaa23. `engine.py` and `app/engine.js` are unchanged.
Plan: "Pitch Caller v0.9: Plan and Spec" (Claude Doc). Everything below was run in this session; results are as printed.

## Gate result: PASS

| Check | Result |
|---|---|
| `tests.py` | 19/19 |
| v0.7c golden, Python (`golden/golden.py check`) | exact |
| v0.7c golden, JS (`golden/golden.js`) | pass |
| **v0.8 golden, Python (`golden/golden_v08.py check`)** | **new; exact (0 difference) on 500 cases** |
| **v0.8 golden, JS (`golden/golden_v08.js`)** | **new; pass, largest difference 3.7e-13 (tolerance 1e-12)** |
| `tests_v08.py` | 6/6 |
| `tests_v08_step6.py` | 6/7, matching v0.8's recorded result: "1a setup" fails at the fitted values (on 0.1277 vs off 0.1285) |
| `tests_v08_step7.py` | 13/13 |
| `tests_v08_step8.py` | 6/6 |
| `tests_v08_solve.py 75 20 11` | 1,500 root calls: residual < 1e-3 on all, deterministic on all, 0 guardrail breaks, 0 chase calls at 3-0/3-1 |
| Python/JS parity (`make_parity_v08.py 150 9051` + `parity_v08.js`) | pass, largest difference 1.1e-13 |

## 1. The v0.8 golden test (new)

`golden/golden_v08.py` (make / check) and `golden/golden_v08.js` freeze v0.8 on 500 seeded situations that use every
v0.8 input: the hitter's look, the swing-read lean, usage by call, familiarity, crowding, hitter grades, umpire, radar,
infield in, steal threat, pitch cap and the win objective. Every case pins outcome probabilities under the hitter's mix
and one pure sit per pitch. Every other case (250) also pins the solved at-bat table (V, N, sigma), the root call (full
distribution, pick, sit mix, residual), the why line, take and grade stats, and the umpire and grade estimates.

- Inputs are stored, rebuilt from the stored copy and then computed, so make, check and the JS run the identical path.
- `make` refuses to overwrite `golden_v08.json` without `--force`, since it is the frozen reference.
- Sensitivity check: raising one fitted weight (beta_T) by 1e-6 produced 10,751 differences in the first 40 cases, so
  the test catches small changes.
- Run time on this machine: Python check about 4 min, JS about 25 s.

## 2. Statcast data (for Step 3)

- The 2024-25 CSVs are gitignored, so they are not in the repo. Baseball Savant is reachable from the cloud workspace,
  so Step 3 re-downloads them with the existing `fetch_statcast.py`; the copy on Drew's Mac is not needed.
- One day from each year (2024-06-01, 2025-06-01) was downloaded to check columns: 119 columns.
- **Contact-point fields exist** for test T4: `intercept_ball_minus_batter_pos_x_inches` and `_y_inches`, plus
  `attack_angle`, `attack_direction`, `swing_path_tilt`, `bat_speed` and `swing_length`. Filled on 97% of swings in 2024
  and 95-98% in 2025.
- **Matchup memory (M1-M3) inputs exist:** `game_pk`, `at_bat_number`, `pitch_number`, `n_thruorder_pitcher` and
  `n_priorpa_thisgame_player_at_bat`, filled on 100% of pitches.

## 3. The 200 ms app check

`app/gameday_e2e.js` check 6 (the next call after a synced re-grade, limit 200 ms), run five times in headless Chrome:
132, 112, 161, 107 and 139 ms. All game-day checks passed each time. This is a 2-core cloud machine, not Drew's desktop
(197 ms in the v0.8 report) or an iPad, so it shows the check passes here, not how much margin there is on his hardware.
v0.9's in-app terms (side, labels, matchup memory) are root-only or frozen per plate appearance, so the plan expects
negligible added time; Step 5 re-measures it.

## 4. Settled before Step 0 (Nov 5)

- Branch state: `main` already contains learner-v2; v0.9 branches from `v0.8-build`; `live-screen-redesign` stays separate.
- Batter side: the engine's `same_side` input; `target_xy` turns inside and away into plate positions from it.
- Chase targets: off-speed chase is placed away; fastball chase is up in the middle.
- Side in v0.8: run on the engine. Only up-in fastballs ever score timing surprise; the 0-1 call mix after a down-in and
  after a down-away fastball differs by about 0.001.

## Not run

Anything on a real iPad; the full Statcast download (Step 3); any v0.9 engine change (none exists yet).

## Next: Step 1

The read-through tool and the frozen scenario suite. It starts with Drew writing and approving the acceptable-call
lists for about 60 scenarios.
