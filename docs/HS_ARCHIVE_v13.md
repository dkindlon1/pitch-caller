# HS / travel archive (Perfect Game): format, parser, quality (v1.3 Part 1, 2026-11-21)

Branch `feat/hitter-v13-hs` (stacked on `feat/hitter-v13-prework` at 90fca9b). Numbers below are from the snapshot taken
on Nov 21 at about 21:00, while the collector was still running: 9,748 games. They will grow. 2026 is held out: it is
parsed and counted here, never fit.

## Where it is and how we read it
- The archive is `~/.codex/.chatgpt-projects/g-p-6afe5c22285081919c8aea9c52b5f187/diamondkast/` (env
  `PITCHIQ_HS_ARCHIVE` overrides). ChatGPT's collector writes one JSON per game to `scorecards/`, and `export_csv.py`
  rewrites the CSVs from them now and then (each CSV goes to `.csv.tmp`, then is renamed into place).
- We never write there. `hitter_data.hs_snapshot` copies the five CSVs plus `event_catalog.json` and `event_index.json`
  to `C:/dev/pitchiq-data/hs/snapshot/`. A copy is kept only if:
  - the source size and mtime didn't change during the copy;
  - every row parses with the header's field count and the last line is complete;
  - the game_id set of `pitch_by_pitch` equals that of `games`, and the lineups' and rosters' sets are inside it.
  Otherwise it retries. An unchanged archive is not copied again.
- `hitter_data.hs_ingest` parses from the snapshot into `C:/dev/pitchiq-data/hs/hs.sqlite3`. A game is parsed when it is
  new, its content hash changed, or the parser version changed. The hash covers the game's games / pitch / lineup /
  roster rows. The only other read is each parsed game's `scorecards/<id>.json`, for the inning-by-inning line score
  (the CSVs carry only the final score).
- `python -m hitter_data.update` now runs this HS step after the college steps. `--no-hs` runs college only and
  `--hs-only` runs HS only; `--report` and `--reparse` apply to both. College behavior is unchanged.

## Files and columns (CSV, all fields quoted, joined on `game_id` = Perfect Game's game ID)
| File | Rows | Columns |
|---|---|---|
| games.csv | 9,748 | game_id, level (`travel_ball` / `high_school`), event_id, event, game_date, game_number, scheduled_time, venue, away/home_team, away/home_runs, hits, errors, number_of_pitch_rows, number_of_other_events, pitches_with_velocity, box_pitch_total, pitch_count_difference, inning_scores_match, complete_lineups, roster_team_count, source_url, series, age_group, game_status |
| pitch_by_pitch.csv | 2,151,113 | game_id, sequence, batter_group, inning, inning_half, batting_side, batting_team, batter, batter_number, pitcher, pitcher_number, record_type, source_pitch_number, pitch_outcome, pitch_type, velocity_mph, count_shown, balls_after, strikes_after, outs_shown, play_text, source_url, batter_id, pitcher_id, play_notes |
| lineups.csv | 211,050 | game_id, side, team, source_order, batting_order (1-9, 10-11 for EH, blank for non-batting subs), player, number, position, source_url |
| rosters.csv | 388,089 | game_id, side, team, source_order, player_id, player, number, position, bats (R/L/S), throws (R/L/B), graduation_year, source_url |
| coverage.csv | 40 events | level, event, listed_games, indexed_games, scheduled_finals, games_saved, finals_attempted_without_log, finals_pending, pitches, pitches_with_velocity, event_id, event_year, series, age_group, host, schedule_status, source_url, nonfinal counts |

`scorecards/<game_id>.json` holds `box` (headline, line score `scores`, lineups, per-pitcher `pitchTotals`, schedule),
`pitch` (groups by batter, with rows of number, text and details), `rosters`, `rosterSources` and `finalListed`.

### What a pitch row says
- `record_type`:
  - `pitch` (2,072,797 rows) has a pitch number, a pitch result or a velocity;
  - `event` (78,316 rows) covers substitutions, courtesy runners, position swaps, pickoffs, balks, "Advanced On Throw",
    intentional walks and the tie-breaker placement.
- `count_shown` / `balls_after` / `strikes_after` give the count **after** the pitch. They are blank on the pitch that
  ends the plate appearance. Present on 1,520,892 pitch rows.
- `outs_shown` gives the outs after the play. It appears only on rows where an out was made (329,357 rows).
- `play_text` is the outcome, then the play, then runner moves by name. Example: "Single Line to RF *A* scored *B*
  advanced to 2nd Base".
- `pitch_outcome` values (pitch rows):

  | Value | Rows |
  |---|---|
  | Ball | 777,386 |
  | Strike Called | 318,648 |
  | Foul | 291,409 |
  | Out | 181,027 |
  | Strike Swinging | 134,926 |
  | Single | 85,925 |
  | Walk | 80,078 |
  | Strike Out Swinging | 68,094 |
  | Strike Out Looking | 42,249 |
  | Double (includes "Double Play ...": 7,952 are double plays) | 30,217 |
  | Hit by Pitch | 19,078 |
  | Reached on Error | 14,085 |
  | Fielder's Choice | 11,789 |
  | Homerun | 4,752 |
  | Triple | 4,075 |
  | Dropped Third Strike | 3,601 |
  | Strikeout Swinging (dropped, reached) | 945 |
  | Stolen Base | 926 |
  | Ground Rule Double | 681 |
  | Caught Stealing | 301 |
  | Wild Pitch | 293 |
  | Infield Fly | 253 |
  | Passed Ball | 169 |
  | Batter's / Catcher's / other interference | 339 |
  | Runner text or blank | ~300 |
- `pitch_type` values:

  | Value | Rows |
  |---|---|
  | Fastball | 1,441,134 |
  | Curveball | 299,636 |
  | Slider | 162,728 |
  | Change-Up | 94,971 |
  | blank | 72,244 |
  | Other | 1,630 |
  | Knuckle | 454 |

  The export's regex also knows Sinker, Cutter, Splitter, Sweeper, Slurve, Forkball and Screwball, but none occur.
- `velocity_mph` is present on 1,944,471 pitch rows (93.8%), ranging 30-101.
- `batter_id` / `pitcher_id` (PG player IDs) are on 99.5% of rows.

### Levels, events, seasons, completeness
- **Series:** Atlanta WWBA national championships (15U-18U), WWBA World Championship (Jupiter, open age, and the
  Underclass event), and the PG High School Showdown (Varsity and Academies). That is 40 events, 2022-2026
  (`scope.json`: minimum event year 2022). Games by season: 2022 1,696; 2023 1,933; 2024 1,809; 2025 2,024; 2026 2,286.
  Of these, `high_school` = 757 games and `travel_ball` = 8,991.
- **Completeness (the archive's own coverage.csv):** 21,604 scheduled finals, of which 9,748 have a saved log,
  11,847 are pending and 9 were attempted without a log. Most pending games are in the big Atlanta 15U-17U events
  (20-40% captured so far); 18U, the World Championships and the Showdowns are near complete.
- Every saved game is `final`, has both lineups and has a box pitch total (9,740 of 9,748). Rosters exist for both teams
  in 9,676 games. `inning_scores_match` (line sums to the final) holds in 9,743.

## Parser (`hitter_data/hs_parse.py`, parser v1)
- **Per pitch** (table `hs_pitch`, 2,070,608 pitches): the letter, with the same codes as college:
  - B ball, K called strike, S swinging strike, F foul, H hit by pitch;
  - X the ball in play (college leaves it unlettered; a PA's `pitches` string here leaves it out too);
  - U a strike of unknown kind, I interference.
  Each pitch also carries the outcome text, the PA result on the last pitch, the count **before** the pitch, the type,
  the class, the velocity, and the shown count after.
- **Pitch class:** fastball (Fastball; Sinker / Cutter if they ever appear), breaking (Curveball, Slider), offspeed
  (Change-Up; Splitter etc. if they appear), other (Other, Knuckle), unknown (blank).
- **Rows flagged as pitches only because they carry a number** (Stolen Base, Wild Pitch, Passed Ball, Caught Stealing):
  these count as a pitch only when the shown count moved. One more ball gives B, one more strike gives U. Otherwise they
  are runner events.
- **PA result** (`hs_pa`, 553,170 PAs), from the outcome and the play text:
  - hits: 1B / 2B / 3B / HR ("Ground Rule Double" is 2B);
  - non-contact: BB, IBB (an event row with no pitch), HBP, K_L / K_S, K_x_reached (dropped third strike reached);
  - outs in play: GO / FO / LO / PO by the batted-ball word, SF ("SacFly"), SH ("SacBunt"), IF, DP / TP ("Double Play",
    "Triple Play");
  - reached: E, FC; interference: CI, BINT.
  Ball in play type comes from Ground / Line / Fly / Pop / Bunt, and direction from "to LF / CF / RF / SS / 3B / 2B /
  1B / Pitcher / Catcher".
- **Game state per PA and per pitch:** outs, bases (`"101"` style, as in college), batting / fielding score, runs in the
  rest of the inning, batter, pitcher, lineup slot, bats / throws.
  - Outs: `outs_shown` when present. Otherwise the outs the text implies (strikeouts and outs, DP 2, TP 3, "FC-6-4",
    a hit with a throw-out chain, caught stealing, picked off, "Batter out on play", the tie-breaker's automatic out).
  - Bases are replayed from runner names in the text, matched to the batters who reached:
    - courtesy and pinch runners ("running for", "entered the game for") take over the base;
    - the tie-breaker line ("Tie Breaker Automatic Out A at 1st base B at 2nd base C at 3rd base") places runners;
    - outs no named runner explains go to the runner the fielding chain points at (a throw to SS / 2B = the runner from
      first, to 3B = from second, home = the lead runner), else the forced runner;
    - runners in the batter's way are forced along.
    - A name that matches no runner is applied to the lead runner who could make that move, and that runner takes the
      printed name (1,132 PAs flagged `runner_renamed`).
    - A batter whose log ends without a result but who later appears as a runner is put on base (`ghost_runner`, 263).
  - Score: every "scored" (and "N runs scored") adds a run to the batting team. A homer's batter is counted once.
  - Pitcher per pitch: the group's pitcher, or the replaced pitcher for rows before a mid-group "P entered the game for".
  - Slot: from lineups.csv `batting_order` by name. A substitute inherits the slot of the player he replaced.
  - Handedness: rosters.csv bats / throws by `player_id`, else by name when unique within that team's game roster.
- **Unlabeled groups:** the exporter could not read the inning on some groups (mostly substitution rows at the start of
  a half, sometimes one pitch). These are merged into the next batter's group (6,948 PAs flagged).

### Event and format fields per game (`hs_games`)
- **Event:** event, event_id, series, age_group. The archive leaves age_group blank for the WWBA World Championship;
  it is stored as `Open`.
- **Pool vs bracket (`phase`):** inferred, because the archive has no game-type field. `game_number` is a per-day
  schedule number and says nothing about it.
  - PG runs pool play first and the playoff bracket on the last days, when the daily game count drops (e.g. 2025 17U:
    188, 181, 175, 214, 199, 158, then 27 and 4).
  - From `event_index.json` (games listed per schedule day): the trailing run of days with fewer than half the event's
    busiest day is `bracket`, and the days before are `pool`.
  - Events without such a drop are `unknown`. That covers every High School Showdown since 2023.
  - Days that mix the last pool round and the first bracket round are labeled `pool`, so `bracket` is a conservative
    subset.
- **Game length:** `innings_played` (from the log) and `ended_before_7`, a game stopped before the 7th inning by the
  time limit or run rule. About half of pool games end early (2025 Atlanta pool: 609 of 1,114).
- `tie_breaker`: the international tie-breaker was used.
- **Time limits and pitch limits are not published in the archive.** The columns `time_limit_min` and `pitch_limit` exist
  and are blank on purpose. One hint: scheduled start times step by 2:20 at a venue in pool play (8:00, 10:20, 12:40 /
  9:00, 11:20, 1:40), which suggests a ~2-hour drop-dead limit, but nothing in the data states it.
- **No bat-type field** is read or stored (Drew, Nov 21: wood and BBCOR are treated the same). A test checks the schema
  has none.

## Quality (`C:/dev/pitchiq-data/hs/reports/`, 9,748 games, parser v1, 0 parser errors)
| Check | Result |
|---|---|
| Plate appearances with a result | 99.01% of 553,170 (the rest: inning or game ended mid-PA, or a log gap) |
| Half-innings ending at exactly 3 outs | 97.64% of 114,625. The last half of 2,307 games is short (walk-off, time limit, run rule); 394 other halves are off. |
| Half-inning runs = line score | 99.28% of 114,625 |
| Final runs = final score | 92.78% of games. A game fails on any one missed "scored". Only 59 line-score halves are true gaps in the logs: trailing "0" halves of games stopped early aren't counted as gaps. |
| Count replay (shown count after = count before + letter) | 99.92% of 1,517,682 pitches; the PA-ending pitch is at the right count (walk at 3 balls, K at 2 strikes) 99.92% of 195,005 |
| Outs read from the text vs shown outs | 99.48% of 329,357 rows |
| Velocity present / pitch type present | 93.9% / 96.6% of pitches (2026 Showdowns are lower: 84%) |
| Handedness matched | batters 95.4%, pitchers 95.0% (by id, else name) |
| Lineup slot found | 98.8% |
| Our pitch count vs the box score total | equal in 81.0% of games, within 2 in 96.5% (9,740 games); off by 5 or more in 271 |
| Games with a full pitch log (within 2 of the box) | 9,410 / 9,748 |
| Unparsed rows | 641: runner names we couldn't place after the fallbacks (530: 215 "scored" with no runner left on base to score, 298 advances, 17 outs), and 111 odd rows ("Illegal Pitch IA", blank rows, "Batted out of turn", substitutions printed as outcomes) |

Top PA flags:
- orphan_rows_merged 6,948;
- no_slot 6,462 (mostly courtesy / pinch players missing from lineups.csv);
- no_result 5,497;
- base_conflict 1,269;
- runner_renamed 1,132;
- runner_pushed 339;
- ghost_runner 263;
- count_jump 157.

## Coverage by season x level x age group (games parsed / games with full log, pitches, velocity share)
Scheduled finals are from the archive's coverage.csv. 2026 is counted only (held out).

| Season | Level | Age | Sched. finals | Parsed | Full log | Pitches | Velo | Type |
|---|---|---|---|---|---|---|---|---|
| 2022 | HS | Academies / Varsity | 76 / 87 | 76 / 87 | 75 / 84 | 34,896 | .956 | .975 |
| 2022 | travel | 15U / 16U / 17U / 18U | 1295 / 1218 / 1357 / 236 | 278 / 270 / 449 / 236 | 274 / 268 / 440 / 235 | 254,390 | .921 | .974 |
| 2022 | travel | Open / Underclass | 243 / 57 | 243 / 57 | 239 / 55 | 65,454 | .950 | .972 |
| 2023 | HS | Academies / Varsity | 73 / 87 | 73 / 87 | 73 / 84 | 35,982 | .953 | .980 |
| 2023 | travel | 15U / 16U / 17U / 18U | 1115 / 1354 / 1208 / 155 | 294 / 286 / 450 / 155 | 289 / 281 / 441 / 152 | 254,751 | .951 | .973 |
| 2023 | travel | Open / Underclass | 246 / 349 | 245 / 343 | 236 / 335 | 123,880 | .932 | .977 |
| 2024 | HS | Academies / Varsity | 59 / 115 | 59 / 115 | 58 / 109 | 38,344 | .973 | .994 |
| 2024 | travel | 15U / 16U / 17U / 18U | 985 / 1365 / 1259 / 161 | 302 / 300 / 439 / 161 | 296 / 290 / 422 / 155 | 257,030 | .954 | .973 |
| 2024 | travel | Open / Underclass | 171 / 264 | 171 / 262 | 166 / 257 | 91,111 | .921 | .971 |
| 2025 | HS | Academies / Varsity | 49 / 94 | 49 / 93 | 48 / 90 | 32,803 | .946 | .979 |
| 2025 | travel | 15U / 16U / 17U / 18U | 800 / 1139 / 1136 / 142 | 312 / 312 / 445 / 142 | 288 / 296 / 413 / 137 | 255,621 | .964 | .978 |
| 2025 | travel | Open / Underclass | 284 / 454 | 284 / 387 | 272 / 377 | 144,416 | .921 | .969 |
| 2026* | HS | Academies / Varsity | 42 / 77 | 42 / 76 | 41 / 75 | 26,753 | .841 | .845 |
| 2026* | travel | 15U / 16U / 17U / 18U | 784 / 1076 / 1134 / 107 | 327 / 321 / 730 / 107 | 310 / 304 / 693 / 105 | 312,696 | .929 | .938 |
| 2026* | travel | Open / Underclass | 287 / 464 | 287 / 396 | 267 / 380 | 142,481 | .930 | .955 |

The full per-cell table (with type share) is `reports/coverage.csv`. Fit-eligible today (2022-2025): 7,462 games and
about 1.59 M pitches. All of HS and travel feed one model (Drew, Nov 21).

## Open issues
- **Atlanta 15U-17U are 20-40% captured.** Captured games skew toward the order the collector walked the schedules.
  Re-check the pool / bracket mix and the per-event shares once the pending ~11,800 finals land.
- **Pool / bracket is inferred** from daily game counts. There is no published field for it. The Showdowns are
  `unknown`.
- **No time-limit or pitch-limit fields exist** in the archive. They would have to come from PG's event rule pages,
  outside this data.
- **No pitch location** (as expected). Zone shape stays with the Single-A seeded table.
- **Base state is reconstructed from names.** About 0.2% of PAs needed a fallback (renamed / pushed / conflict). Runs
  per half match the line score 99.3% of the time, so the score and runs-rest-of-inning are sound. Bases on the
  flagged PAs are best-effort.
- **"Knuckle" (454 pitches) is classed as other**: it could be knuckle-curves. Blank pitch types (3.4%) are class
  `unknown`.
- **About 1% of games are off by 5 or more pitches against the box** (missing or duplicated groups in the scorecard).
  `full_log=0` marks them, and a fit can drop them.

## Commands
```
export PATH=/c/dev/pitch-caller-logs/py3/Scripts:/c/dev/pitch-caller-logs/shim:$PATH PYTHONUTF8=1
python3 -m hitter_data.update --hs-only          # snapshot if changed, parse new / changed games, HS reports
python3 -m hitter_data.update --hs-only --reparse
python3 -m hitter_data.update                    # college steps, then the HS step
python3 tests_hs_data.py                         # synthetic fixtures (wired into scripts/test-app.sh)
```
