# v1.2.2 build report (confidence band under the cutoff)

Branch `v1.2.2` from `main @ cb64db1` (v1.2.1). Plan: `docs/PLAN_v1.2.2_2026-11-14.md`. Everything below was run in this
session and is as printed. **CI hasn't run on the branch**: this session didn't push (each release step waits for Drew).

## What Drew decided (Nov 14)
- **D1** band width **0.10** (HS 0.40-0.50, D3 0.35-0.45, D1 / MLB 0.30-0.40).
- **D2** when nothing clears the cutoff: **mix** (the band handles it; v1.2.1's 100%-one-pitch fallback stays only when
  nothing is in the band either).
- **D3** the band applies in **every count**.

## What changed
- **Both engines** (`engine.py`, `app/engine.js`, copied to `web/lib/engine.js`):
  - `RAMP_W` 0.10, `band_weight` / `bandWeight` (0 at the bottom of the band, 1 at the cutoff), `band_pitches`.
  - `root_call` / `rootCall`: with band pitches, the call is the blend over every with / without combination of them,
    weighted by the product of the weights (combinations under 0.001 skipped). No band pitch: one solve, the v1.2.1 code
    path. The v1.2.1 body is now `_root_solve` / `rootSolve`, which takes the band pitches it may add.
  - The combinations share one cost per call (a call's sit costs don't depend on which pitches are allowed). Checked bit
    for bit against solving each combination on its own (25 random band cases, 0 differ).
  - `candidates` / `allowed_calls` take the extra (band) pitches; everything else calls them as before, so the PA table,
    setup payoffs (check 3), the setup tie-break and the coach-override path keep the trusted set.
  - Engine `VERSION` 1.2.2.
- **App:** `APP_VERSION` 1.2.2; the setup screen reads "PitchIQ 1.2.2 · engine 1.2.2".
- **Tests:**
  - `tests_v122.py` added to `scripts/test-app.sh`.
  - `tests_v121.py` keeps testing the v1.2.1 shake rule. Its "other pitches" now sit under the band (0.30 / 0.28 instead
    of 0.40 / 0.38), and its exact-v1.2 check skips random cases with a band pitch.
  - Version checks in `v121_shake_e2e`, `v08_e2e`, `v09_matchup_e2e` read 1.2.2.
  - **`golden_v122` frozen** as the release reference; `golden_v12` stays as history (below).
- No database change.

## Proof
| Check | Result |
|---|---|
| `tests_v122.py` | **12/12** (details below) |
| Read-through `scenarios_v12.json` (98 graded rows), v1.2.1 vs v1.2.2 | **0 rows moved** (every row's call spread identical); 94/98 on both (P2, P3, P5, P7, as before) |
| `golden_v12` (JS) | Fails on v1.2.2, as it should: **1286 differences, all in the 54 cases with a pitch in the band**, none in tables. Main calls of the 172 full cases without a band pitch: largest difference 1.2e-13 |
| `golden_v122` | Made from the Python engine (same 500 inputs); the JS engine reproduces it (**PASS**). Identical to `golden_v12` in every case without a band pitch |
| Realism (tests.py) | Unchanged: D3 K 16.2% / BB 11.6% / HBP 4.3%, HS 21.0 / 14.2 / 4.1, MLB 19.8 / 8.0 / 0.9 |
| `scripts/test-app.sh` | **Every suite passes.** Run in two parts. The first part ran on `53324ca` through tests_v122, then stopped at `golden_v12` (above). The rest ran on `d36db67`, where only the golden file and the suite's golden line changed. Results: tests.py 45, explain 7, tests_v11 41, fast parity, tests_v12 22, lean parity, tests_v12b 12, tag parity, tests_v121 11, **tests_v122 12**, golden_v122 (JS), build matches source, web copies, web demo 2, learn 27, db 18, import 14, rails 31, schema 24, stage2 21, worlds 31, pitch_rules 41, kinds 23, v11_fixture 8, lean 8, hitter_tags 3, smoke, rules 20, v10 step 1/3/5 e2e 6/7/10, v11_step5 14, v12_step4 35, v12_oldapp 15, v12_tags 9, v121_shake 9, **game_mix 44 (average top pitch 49.5%, one game over 70%; v1.2.1 on this box: 49.6%)** |
| `v09_matchup_e2e` / `v08_e2e` (not in CI) | v09 passes (engine 1.2.2). v08: version check passes; its only failure is the known phone width (441 px at 390), as v1.2.1 |

### tests_v122 in detail
- **Exactly v1.2.1 with no band pitch:** 60 random cases (every level, count and kind, some with shake-offs) vs
  `git archive cb64db1`: dist, costs and pick identical, bit for bit.
- **The edges:** at the bottom of the band, v1.2.1 with the pitch out (2e-16). At the top, v1.2.1 with it trusted
  **within 0.6 points**: the PA table keeps the trusted set, so it gains the pitch only at the cutoff (plan risk 3).
- **Smooth:** 468 calls (HS / D3 / D1, 4 arsenals, 0-0 / 1-2 / 3-1, 0.01 steps). Largest single step **6.2 points**: a
  fastball inside the band at D3 3-1, where its full share is 53%. The band adds a pitch in a straight line, so a pitch
  worth X% moves about X/10 per 0.01.
  - The plan's proposed "5 points per 0.01" bar was the wrong test for a pitch with a big share. The check is now: each
    step is at most a tenth of that pitch's with / without difference plus 1.5 points. The 1.5 covers the pitch's own
    landing improving as its confidence rises, and the table step at the cutoff.
  - **One step over that bar** (D1, four pitches, 0-0, curveball 0.35 → 0.36: the slider moves 3.5 points). It's the
    **v1.1 setup tie-break**, not the band: with the tie-break off, the same step is 0.5 points. The tie-break moves up to
    5 points between near-tied calls and can switch which call it takes from on a small change. It does that in v1.2.1
    too, to trusted pitches. Not touched here (below).
- **Rules:** never a chase at 3-0 / 3-1 (60 random states with band pitches); a band pitch shaken off is out for the
  at-bat; a band pitch is never a setup payoff; the v1.2.1 second-shake rule holds.
- **Nothing trusted (D2):** D3, fastball 0.41 / slider 0.40 → **67 / 33** (v1.2.1: 100% fastball); slider 0.42 →
  **44 / 56** (v1.2.1: 100% slider). Nothing in the band either (0.30 / 0.29): 100% fastball, as v1.2.1.
- **Python = JS:** 40 random band cases, every level and count: same calls, largest difference 2.7e-14 (shares and costs).
- **Speed** (a call on a solved table, worst case: all six pitches in the band = 64 combinations):

| | None in the band | Six in the band |
|---|---|---|
| JS, this box, alone | 4.2 ms | 10.6 ms |
| JS, this box, during the full suite | 6.2 ms | 24.1 ms |
| Python | 45 ms | 95 ms |

  Before sharing costs across combinations, the six-pitch case took 99 ms in JS, over the 50 ms budget. **The iPad isn't
  measured.** The table solve (180-535 ms in the review) is unchanged and still the big cost.

## For Drew
- **The game-mix tail isn't fixed by this.** Of `game_mix_e2e`'s 21 app games, one moved (by one point); the 71% game
  (tier 2, seed 45) is unchanged. In those simulated games a pitch rarely sits inside the band, so the band changes calls
  mostly in the states the review probed. The tail has a different cause.
- **What changes in a game:** a pitch under the cutoff but inside the band now gets part of its share instead of none.
  The biggest change: a pitcher with only his fastball trusted and secondaries at 0.40-0.44 (D3) no longer throws 100%
  fastballs.
- **Not touched, worth knowing:** the setup tie-break (v1.1 Step 3) can move up to 5 points on a small input change. It
  isn't new and it's capped.
- **Release** (each step needs Drew):
  1. Push branch `v1.2.2` (bundle `pitch-caller-v1.2.2.bundle`) and let CI run.
  2. Fast-forward `main` (`cb64db1` → the branch). No migration.
  3. Open the game app on each iPad and check "PitchIQ 1.2.2 · engine 1.2.2".
  4. Tag `v1.2.2`.
