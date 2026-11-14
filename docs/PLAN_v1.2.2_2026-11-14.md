# Pitch Caller engine v1.2.2 plan: smooth the confidence cutoff

Date: 2026-11-14. Start line: `main @ cb64db1` (v1.2.1). Source: `docs/REVIEW_v1.2_game_readiness_2026-11-14.md`,
problem 2 (and problem 3). **Status: decided (Drew, Nov 14: D1 0.10, D2 mix, D3 every count); built, see `docs/BUILD_v1.2.2_REPORT.md`.** Every number below comes from a scratch prototype run
this session (Python engine, not committed). With the band at width 0, the prototype reproduces v1.2.1's calls on every
probe.

## 1. The problem, in the code

- `candidates()` (`engine.py:1909`, JS `engine.js:678`) is a hard filter: a pitch at or over the level's cutoff (HS 0.50,
  D3 0.45, D1/MLB 0.40) can be called; under it, it can't. If nothing clears it, 100% of his most-trusted pitch.
- Over the cutoff, confidence barely moves the mix. Slider share at D3, 1-2 (FB 4/0.70, SL 4, CH 3/0.60):

| Slider conf | 0.30-0.44 | 0.45 | 0.48 | 0.50 | 0.60 | 0.70 |
|---|---|---|---|---|---|---|
| v1.2.1 slider share | **0%** | **27%** | 28% | 28% | 31% | 35% |

- So almost all of a pitch's confidence effect is one step at the cutoff. With +0.03 for a called strike and −0.02 for a
  ball, a so-so pitch sitting near the cutoff goes 0 → 27 → 0 → 27 over a few pitches. (The review's arsenal showed
  0 → 49.)
- It also goes against Drew's Nov 11 rule: a pitch he isn't sure of can still be used in an up count or as a setup pitch.
  At 1-2, a slider at 0.44 gets 0%.

## 2. The fix: a band under the cutoff, calls blended

- **Band:** from `cutoff − W` to the cutoff. A pitch in the band gets a weight `r = (conf − (cutoff − W)) / W` (0 at the
  bottom, 1 at the cutoff).
- **Blend, not scale.** Root call = `r` × (v1.2.1's call with that pitch allowed) + (1 − r) × (v1.2.1's call without
  it). With two or more band pitches, every with/without combination is weighted the same way (skipping combos under
  0.001 weight).
  - Why blend: the prototype first tried solving with the pitch in and scaling its share down. That left a jump on the
    *other* pitches: at 2-2 the changeup fell from 22% to 12% the moment the slider entered the band. Blending is smooth
    for every pitch, and at r = 0 / r = 1 it is exactly v1.2.1.
- **Unchanged:**
  - Pitches at or over the cutoff, and pitches under the band: v1.2.1's calls exactly (when no pitch is in the band, no
    code path changes).
  - The PA table (future values) stays trusted-only.
  - Setup payoffs still need a trusted pitch (`setup_payoff` check 3).
  - The landing-today block, the 3-0/3-1 no-chase rule and the never-pick window: every blended call is one v1.2.1 would
    make for some allowed set.
  - Shake-offs: a shaken band pitch is out of the band; the v1.2.1 shake rules run inside each blended solve.
  - The "Time for a change?" flag.

## 3. What the calls look like (W = 0.10, D3, cutoff 0.45)

Slider share as its confidence climbs (FB / CH shares move to match):

| Slider conf | 0.33 | 0.35 | 0.37 | 0.39 | 0.41 | 0.43 | 0.44 | 0.45 |
|---|---|---|---|---|---|---|---|---|
| 0-0 | 0 | 0 | 6 | 12 | 19 | 25 | 28 | 31 |
| 1-2 | 0 | 0 | 5 | 10 | 15 | 21 | 24 | 27 |
| 2-2 | 0 | 0 | 6 | 12 | 19 | 25 | 29 | 32 |
| 3-1 | 0 | 0 | 5 | 10 | 16 | 21 | 24 | 26 |

- The biggest move per 0.02 of confidence is about 6 points (one called strike ≈ 8 points).
- 2-2 example: FB 78 / CH 22 → (0.41) FB 67 / SL 19 / CH 14 → (0.45) FB 60 / SL 32 / CH 8. No jumps.

**Nothing trusted (review problem 3), D3, 1-1:**

| FB / SL / CH conf | v1.2.1 | Blend, D2 = mix | Blend, D2 = keep fallback |
|---|---|---|---|
| 0.41 / 0.40 / 0.30 | FB 100 | FB 68, SL 32 | FB 100 |
| 0.41 / 0.42 / 0.30 | **SL 100** | FB 44, SL 56 | SL 100 |
| 0.44 / 0.42 / 0.40 | FB 100 | FB 58, SL 28, CH 15 | FB 100 |
| 0.46 / 0.42 / 0.40 (FB only trusted) | FB 100 | FB 63, SL 24, CH 13 | FB 63, SL 24, CH 13 |

- The last row matters most: today a pitcher with only his fastball over the cutoff throws 100% fastballs. With the band,
  secondaries just under the cutoff get some share.

## 4. Decisions (Drew, Nov 14: all three as recommended)

| # | Question | Options | Recommended |
|---|---|---|---|
| D1 | Band width | 0.05 (2 strikes to come all the way in) · **0.10** (about 3-4) · 0.15 (5; at 0.33 a slider already gets 5-8%) | **0.10**: smooth, and a pitch well under the cutoff still stays out |
| D2 | When nothing clears the cutoff | **Mix** (the blend also handles it: no more 100% one pitch that flips on 0.01) · Keep v1.2.1's fallback (you kept it Nov 6) | **Mix**. It fixes review problem 3 with the same rule, and the "Time for a change?" flag still shows |
| D3 | Behind in the count (3-0, 3-1, 2-0, 2-1, 3-2?) | **Band in every count** (today's landing already prices the walk risk; 3-1 numbers above) · Trusted only when behind | **Every count.** 3-0's tight randomness still leans on the cheapest pitch |

## 5. Steps (about 2 days)

1. **Python engine:** `ramp_r`, the band in `root_call` (blend), `RAMP_W`; `VERSION` 1.2.2. (½ day)
2. **JS engine** (`app/engine.js` `rootCall` `:1516`, copied to `web/lib/engine.js`); `APP_VERSION` 1.2.2. (½ day)
3. **Checks** (`tests_v122.py`, added to `scripts/test-app.sh`): (1 day)
   - **Exactness:** no pitch in the band → bit for bit v1.2.1 (`git archive cb64db1`), 200 random states. Each band
     pitch at r = 0 and r = 1 → exactly the matching v1.2.1 call.
   - **Smoothness:** confidence swept in 0.01 steps through the band on the grid arsenals at every level and count; no
     pitch's share moves more than 5 points per 0.01 (proposed bar).
   - **Rules:** never a chase at 3-0/3-1; second shake still a hard switch; a band pitch is never a setup payoff.
   - **Python = JS** on 40 band cases (1e-9).
   - **Speed:** worst case (every pitch in the band), Python and JS. Budget: a call on a solved table under 50 ms in JS.
     If the worst case misses the budget, stop and report.
   - **Game mix:** `game_mix_e2e` 21 games (today: average top pitch 49.5%, one over 70%). Report how the 70%+ game moves.
   - **Read-through:** none of the 98 graded rows should move (all their confidences are at least 0.05 over the
     cutoff); any row that moves is listed for regrading.
   - `scripts/test-app.sh` passes in full.
4. **Report** in `docs/BUILD_v1.2.2_REPORT.md`. Push, merge and tag only on Drew's go.

## 6. Risks

- **More off-speed when he's shaky.** A secondary he barely trusts now shows up 5-25% of the time. That is the point,
  but it means more balls in the simulation. The game-mix and K/BB numbers get reported, not gated.
- **Speed:** blending runs the root solve once per combination (Python: 4-8 ms → up to 64 ms with three band pitches).
  JS on the iPad is unmeasured; step 3 checks it.
- **The PA table assumes band pitches are out,** so future counts are priced a little pessimistically. It's small, and
  it keeps the table identical to v1.2.1's.

## Not in v1.2.2

- How much confidence moves the mix *above* the cutoff (27% → 35% from 0.45 to 0.70). Worth revisiting after real games.
- Per-level band widths.
