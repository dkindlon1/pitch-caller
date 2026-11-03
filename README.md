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
| `engine.py` | The engine (v0.6f) |
| `flags.py` | "Time for a change" flag |
| `simulate.py` | Full-game simulator with hidden hitter traits and pitch off-days; presets for pitcher and lineup types |
| `review.py` | Grades every call against coaching rules (wrong / questionable) and measures predictability |
| `batch.py`, `regrade.py`, `inputs_report.py` | Run many games and summarize them |
| `college_rates.py`, `hs_rates.py`, `run_tables.py` | Run values from real stats |
| `calib.py`, `fit_all.py`, `refit_mlb.py` | Fit the outcome model to real rates |
| `tests.py` | 17 regression checks |
| `fuzz.py` | 29 logic and learning checks on thousands of random situations |
| `matrix/` | 21-setup test matrix: levels, pitcher types, lineups, input levels, shake-offs, coach overrides |
| `results/` | Latest logic-check and matrix reports |
| `app/` | Tablet prototype: `engine.js` (JavaScript port, verified against Python), `index.src.html`, built page in `dist/` |

## Run it

Python 3.11+ with `numpy` and `scipy`. Node 18+ for the app checks (Playwright for the browser test).

    python3 tests.py                                     # 17 regression checks
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

## Status

Tested in simulation only. Logic checks: 28 of 29 hold. Game matrix: wrong calls 0.8-2.8% across 21 setups.
Open: full games run 1-3 walk points above real at D3 and D1; amateur hitters' swing and chase behavior is assumed
MLB-like until real pitch-by-pitch data is available.
