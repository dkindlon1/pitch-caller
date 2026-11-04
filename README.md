# Pitch Caller

A pitch-calling engine for baseball coaches who don't know sequencing well. Each pitch it puts down a sign and a
spot (pitch type plus one of six targets), chosen at random from a mix weighted toward the calls that give up the
fewest expected runs. The mix keeps it hard to read. It tracks the pitcher's confidence in each pitch, learns each
hitter during the game, and flags when the pitcher may be done.

Levels: high school, college D3, college D1, and pro tables for comparison.

## How it decides

    Cost(pitch, spot | situation) = sum over outcomes  P(outcome) x [runs now + run value of the next state]

- **Run values** by level from real data: MLB 2010-15, 2026 NCAA conference team stats (D1, D3), MaxPreps 2026
  national varsity averages (high school). See `college_rates.py`, `hs_rates.py`, `run_tables.py`.
- **Outcome model**: where the pitch lands (command, confidence, level wildness, whether it's landing today), then
  swing, whiff, called strike, foul, contact quality, hit by pitch, wild pitch. Fitted so simulated games
  reproduce each level's real strikeout, walk, HBP and hit rates (`calib.py`, `fit_all.py`, `outcome_params.py`).
- **Calls** come from a mixed strategy at a game-theory balance point: count values are solved for this matchup, and
  randomness scales with the stakes of the count.
- **Coach rules built in**: get it over with off-speed only when that pitch is landing today; attack the zone at
  2-2; never re-call what he just shook off; nothing below the pitcher's trust line while he trusts something.

## Files

| File | What it is |
| --- | --- |
| `engine.py` | The engine (v0.7c: per-pitcher traits; command and stuff spread and the walk/strikeout link calibrated to real pitchers, one grade point = one SD at the level; no chase target at 3-0 or 3-1; 3-0 mixes as tightly as 3-2; travel ball uses the high school tables; clear errors on impossible input) |
| `pitcher_lines.py`, `talent_spread.py`, `fit_spread.py`, `spread_params.py`, `spread_test.py` | Spread calibration: real 2026 per-pitcher lines, the true spread between pitchers, the fitted scales, and the check |
| `flags.py` | "Time for a change" flag |
| `simulate.py` | Full-game simulator with hidden hitter traits and pitch off-days; presets for pitcher and lineup types |
| `review.py` | Grades every call against coaching rules (wrong / questionable) and measures predictability |
| `batch.py`, `regrade.py`, `inputs_report.py` | Run many games and summarize them |
| `college_rates.py`, `hs_rates.py`, `run_tables.py` | Run values from real stats |
| `calib.py`, `fit_all.py`, `refit_mlb.py` | Fit the outcome model to real rates |
| `tests.py` | 19 regression checks |
| `statcast_check.py` | The hitter-vs-pitch model against MLB Statcast pitches, by attack zone and count (`results/statcast_check.txt`) |
| `fuzz.py` | 29 logic and learning checks on thousands of random situations |
| `matrix/` | 21-setup test matrix: levels, pitcher types, lineups, input levels, shake-offs, coach overrides |
| `results/` | Latest logic-check and matrix reports |
| `app/` | Tablet prototype: `engine.js` (JavaScript port, verified against Python), `index.src.html`, built page in `dist/` |

## Run it

Python 3.11+ with `numpy` and `scipy`. Node 18+ for the app checks (Playwright for the browser test).

    python3 tests.py                                     # 19 regression checks
    python3 spread_test.py                               # calibrated spread between pitchers (about 2 minutes)
    python3 fuzz.py 3000 300                             # logic and learning checks
    LEVEL=college_d3 python3 batch.py runs/d3 1 10        # 10 simulated D3 games, graded
    STAFF=power LINEUP=fb_mashers LEVEL=hs python3 batch.py runs/x 1 10
    ./matrix/run.sh && python3 matrix/report.py           # the full matrix (about an hour)

    python3 app/make_parity.py 150 && node app/parity.js   # JS engine must match Python exactly
    cd app && python3 build.py                             # builds dist/pitch-caller.html
    node app/smoke.js                                      # drives the page in a browser (from the repo root)

Simulator settings (environment variables): `LEVEL` (hs, college_d3, college_d1, mlb), `STAFF` (default, power,
finesse, two_pitch, lefty, four_pitch, shaky), `LINEUP` (default, strong, weak, lefty_heavy, switch, fb_mashers,
os_killers, late), `INPUTS` (1 results only, 2 plus contact, 3 plus hitter reads, 4 plus measured movement),
`NOISE` (share of optional entries logged wrong), `TRUE_MOVE`, `SHAKE`, `OVERRIDE`.

## Database and learning (app/)

Everything lives on the device in IndexedDB (`app/db.js`): our team, pitchers with their arsenals, catchers, opponents
and their hitters, pre-game check-ins, TrackMan/Rapsodo sessions, games, every pitch thrown, and the learned models.
Records carry ids and timestamps and are soft-deleted, so a sync service (Supabase or similar) can be added later
without changing the data. Back up and Restore on the Roster screen write and merge a JSON file (newer edits win).

**Every logged pitch stores** the pitcher, pitch, hitter, catcher, target, result, where it ended up (if logged), the
exact situation and inputs the engine used, and what the engine expected to happen.

**The flywheel** (`app/learner.js`, learner v2, spec in `docs/LEARNING_SPEC.md`): after End game, every pitch he has
thrown is replayed against what the engine expected, and each pitch's command and stuff are tracked game by game
(starting from the coach's grades, allowing for drift, a new season and changes the coach marks). The calls move toward
what's learned at most 0.15 a game and never more than 1.0 from the coach's grade unless he accepts a flag. Big
disagreements are flagged, not applied. A scoreboard compares learning with the coach's grades and switches learning off
if it predicts worse. Only the engine's own calls teach it. Hitters carry what they did against what the engine expected
across games. Check-ins set the day's starting feel per pitch and can lower his fatigue point.

**Imports** (`app/import.js`): TrackMan CSVs by its documented column names; Rapsodo by loose name matching (check the
first real file). Break and release side are normalised to arm side positive using his fastballs. Opponent hitter sheets.

| File | What it is |
| --- | --- |
| `app/db.js` | Database: stores, backup/restore, migration from the old saved state |
| `app/learn.js` | Learner v1 (now only check-ins, predictions and logging helpers in the app; its limits fixed in 1.1.0) |
| `app/import.js` | TrackMan, Rapsodo and hitter-sheet import |
| `app/grade_all.js`, `grade_all_test.js` | Grades every pitch and spot at once for the game screen's "Call my own" picker; the test checks it matches `gradeCall` call by call |
| `app/roster.js` | Database glue and the Roster screen (inlined into the page by `build.py`) |
| `app/learn_test.js`, `db_test.js`, `import_test.js` | Node checks (`db_test.js` needs `npm i fake-indexeddb`) |
| `app/db_e2e.js` | Browser test of the whole loop, served over http; screenshots in `app/e2e_shots/` |
| `app/learner.js`, `app/worker.js` | Learner v2 (spec in `docs/LEARNING_SPEC.md`): replay, talent filter, traits, caps, flags, scoreboard. Drives the calls; runs after End game in a background worker. No trait passes the gate on v0.7b/c, so traits are off |
| `app/travel_e2e.js` | Browser check: travel ball in Setup, calls at that level, a coach's chase call at 3-1 graded against the rule |
| `app/replay_e2e.js`, `app/replay_check.js` | Proof that a charted game replays exactly from the raw log (browser game, then any backup) |
| `app/shadow.js`, `app/sim_backup.js` | Learner v2 scored against the coach's grades and what the app served, on a backup; seasons charted through the app from a hidden true pitcher |
| `app/worlds.js`, `app/worlds_test.js` | Simulated seasons played pitch by pitch, and the 13 worlds checks for learner v2 |
| `app/gate_test.js`, `app/gate_result.json` | The trait gate and its latest result |
| `app/same_engine_test.py` | Proves engine v0.7 with no traits and spread scales at 1 is identical to v0.6f (needs the old engine file as an argument) |

    cd app && node learn_test.js && node db_test.js && node import_test.js && node grade_all_test.js
    python3 build.py && node db_e2e.js

## Status

Engine v0.7c (2026-11-03): 3-0 gets the tightest mix (an average arsenal throws about two fastballs in three there),
learning mode is scored the way calls are made, travel ball is a level (high school tables), impossible input gets a clear
error. Regression 19 of 19, logic 27 of 29 (same two explained), parity, spread, worlds 13 of 13, app tests all pass.

**Statcast check** (`statcast_check.py`, 2025 MLB, about 86,000 pitches): the engine's run values per zone are close in
many spots, but its hitter model is too flat. It has about half the real swing-and-miss rate in every zone and makes up
the strikeouts with too many chase swings, and in pitcher's counts it charges off-speed over the heart about a third of
what real hitters do (0.016 runs more than the edge, real 0.045). That's why "middle" stays in the two-strike mix.
Not yet refit.

Tested in simulation only. Engine v0.7b (spec section 18): command and stuff spread and the walk/strikeout link match
real 2026 pitchers; no chase target at 3-0 or 3-1. Regression checks 17 of 17, logic checks 27 of 29 (the two failures
are explained in the spec), learner worlds 13 of 13, spread checks all pass; reduced matrix (6 setups × 4 games) wrong
calls 0.3-4.9%. Open: amateur hitters' swing and chase behavior
is assumed MLB-like until real pitch-by-pitch data is available; HS spread is estimated from D3.
