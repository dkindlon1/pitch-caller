# Finding: in the v1.0 app, the call mix collapses onto one pitch over a game (Nov 12, 2026)

Found while re-capturing the website's app screens on engine v1.0 (`main @ b318098`, merged into `website`). **Diagnosed and fixed on `v1.1-work` the same day (see "Diagnosis and fix" below).**

## What happens
The same 82-pitch game was played through the real app (`app/dist/pitch-caller.html`) with `web/scripts/capture-app-views.cjs`: the sample staff at college D3, random results logged through the app's own buttons, and every pitch the app's own call ("Your calls 0 of 82"). The pitch counts come from each run's Data screen.

| App | Logging tier | Draws | Fastball | Slider | Changeup |
|---|---|---|---|---|---|
| v0.9 (`website @ 7ae6c45`) | 2, plus contact | unseeded | 50 (61%) | 26 (32%) | 6 (7%) |
| v1.0 | 2, plus contact | seeded (the script's default) | 3 (4%) | 78 (95%) | 1 (1%) |
| v1.0 | 2, plus contact | unseeded | 79 (96%) | 3 (4%) | 0 |
| v1.0 | 3, plus hitter reads (the default), random reads | seeded | 6 (7%) | 75 (91%) | 1 (1%) |
| v1.0 | 3, random reads | unseeded | 6 (7%) | 72 (88%) | 4 (5%) |
| v1.0 | 3, every whiff "Fooled", every foul "Straight back" | unseeded | 70 (85%) | 11 (13%) | 1 (1%) |

Which pitch it collapses onto varies from run to run (fastball in one run, slider in another), so it looks like a runaway on early results, not a fixed preference.

**Per-call log** (v1.0, tier 2, seeded; `MIXLOG=1`): pitch 1 at 0-0 is fastball 50% / slider 11% (the top five calls). By pitch 11 the mix is a single slider entry at 100%. It stays at 94–100% slider at 0-0, 0-1, 1-1, 0-2 and 2-1 for the rest of the game.

**One-off calls look normal.** The website's fixed spot (1-2, runner on second, one out, fifth, tied, 61 pitches; `capture-candidates.cjs`) gives a spread mix on v1.0: slider down-away 34%, fastball down-away 21%, slider middle 15%, fastball up-away 14%, two changeups at about 7% each, slider up-away 2%. So the collapse comes from state that builds up during a game in the app, not from the one-situation solve.

## How to reproduce
From `web/`:
```
INPUTS=2 MIXLOG=1 OUT=/tmp/mix node scripts/capture-app-views.cjs
DIST=<a v0.9 pitch-caller.html> INPUTS=2 OUT=/tmp/mix09 node scripts/capture-app-views.cjs
```
`MIXLOG=1` prints each call's mix by pitch. `OUT/app-data.png` has the pitch counts. The script seeds its own results and the app's `Math.random`, so a run is repeatable. (A v0.9 copy: `git show 7ae6c45:app/dist/pitch-caller.html`.)

## Diagnosis and fix (Nov 12, `v1.1-work`; details in `docs/BUILD_v1.1_REPORT.md`, "Before Step 2")
- **Still happened on `v1.1-work`** (same script): 100% slider from pitch 10.
- **Cause: the v1.0 Step 7 coach read "landing better than normal → lean on it".** It fires once a pitch lands 0.10 better than expected (4-for-5 just misses, 5-for-6 fires) and then adds a flat 0.03-run credit to every spot of that pitch, about 3× the mixing temperature, so every other pitch falls out of the mix. The hot pitch is then the only one thrown, which keeps it hot. Re-solving the app's own state with one input removed at a time pinned it to the hot pitch's landing record, and to that credit alone. With only that credit at 0, every game above spreads out (for example 76/3/3 → 43/26/13).
- **Fix:** the read keeps its full size until the pitch's share of today's pitches is 10 points over its normal share, then fades to nothing at 40 over (`hot_fade`, both engines). All 15 read-through rows with a landing record give the same shares as before (C5 still 76%).
- **Regression check:** `app/game_mix_e2e.js`, five 82-pitch games through the app that each collapsed before the fix. Before: 84–94% one pitch, 5 FAIL. After: 48–55%, 5 pass. It runs in `scripts/test-app.sh`.
- **Residual, settled by Drew (Nov 12):** a pitch that goes cold early on random results (the fastball 5-for-12 in one game) was held back at 0-0 and when behind by his not-landing rule long enough that the other pitch got most of the game (79%). Drew chose a comeback: the hold lifts once he has gone 8 pitches without it. That game is now 56% (BUILD_v1.1_REPORT, "Comeback for a cold pitch").

## Not checked
- Whether a coach logging real results (not random ones) sees the same thing. Random results are a harsh test, but v0.9 stayed spread under the same script.

## What the website does meanwhile
"A game with PitchIQ" keeps its v0.9 Data and Roster screens. The other captures are single situations and are on v1.0: the at-bat, the mix, the "During" call screen and Inside the call.
