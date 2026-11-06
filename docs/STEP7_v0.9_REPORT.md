# v0.9 Step 7 report: v0.9 vs v0.8 on paired games

Date: 2026-11-05. Branch `v0.9-work`. Everything below was run in this session; each result names its command and output file.

## Bottom line

- **No hard-rule breaks.** v0.9 breaks no hard rule in 90 games. Its call mix moves the way the plan wanted: fewer fastballs, about twice as many changeups, more chases with two strikes and slightly more inside pitches.
- **Its calls cost more runs.** Both engines played the same simulated world and were scored against the same yardstick. On that basis v0.9's calls cost **+0.40 runs per game more than v0.8's** (SE 0.08, 27 games). Per pitch that is 0.0103 vs 0.0087 runs, about 19% more.
- **The guardrail change (item 10) causes almost all of it.** v0.9 with v0.8's guardrail put back costs +0.04 runs per game against v0.8 (SE 0.06). That is indistinguishable from zero. The other four terms together cost nothing measurable. The extra cost sits in changeups and curveballs in the zone, which are the calls item 10 turned back on.
- **Runs allowed agree on direction, but they are noisy.** In the same world over 90 games, v0.9 allows +0.71 runs per game (SE 0.54). D1 is +1.9 (SE 0.75) and about a third of that is one 18-run game. HS is +1.0 (SE 1.0) and D3 is −0.8 (SE 1.0).
- **Recommendation: don't switch the app to v0.9 as built.** Item 10 needs a decision (below). The other four terms can ship.

## What was run

| Run | Games | Folder | Command |
|---|---|---|---|
| v0.8 in its own world | 90 (3 levels × 3 staffs × seeds 101–110) | `runs/readthrough/v08` | `run_games.py --engines v08` |
| v0.9 in its own world (= the v0.9 world) | 90 | `runs/readthrough/v09` | `run_games.py --engines v09` |
| v0.8 calls in the v0.9 world | 90 | `runs/readthrough/v08_in_v09w` | `run_games.py --engines v08@v09w` |
| Both, scored on one fixed yardstick | 27 each (seeds 101–103) | `…/v08_in_v09w_tw`, `…/v09_in_v09w_tw` | `TRUTH_TAB=world run_games.py --engines v08@v09w,v09@v09w --seeds 101-103 --suffix _tw` |
| v0.9 with the guardrail put back, same yardstick | 27 | `…/v09-guardrail_v09_in_v09w_tw` | `TRUTH_TAB=world run_games.py --engines "v09-guardrail_v09@v09w" --seeds 101-103 --suffix _tw` |

**The "v0.9 world."** It is the outcome model with the three fitted v0.9 world terms on: the inside effect, matchup memory and the power home-run effect. Landing and the guardrail are calling rules, not part of the world.

**Why the runs were needed.** In the first two runs each engine played in its own world, so they were not a fair comparison. In the third run v0.8 calls inside the v0.9 world.

**Two yardsticks.**
- `regret_*` scores each call against the true best call, using the *calling engine's own* table: its own hitter sits and later-count values. Those tables differ between engines, so this is not one scale.
- `regret_w_*` (new; `TRUTH_TAB=world` in `simulate.py`) scores every call against one table solved in the world's model. It is the same for both engines.

It is log only: no random draw and no change to any call or outcome. All 54 yardstick replays reproduced the stored games cell for cell (0 of 54 differ). `tests.py` still passes 19/19 after the change.

## Same world, 90 paired games (`readthrough/step7_compare.py`, `results/step7/compare_v08_vs_v09_same_world.txt`)

| Per game / per PA | v0.8 | v0.9 | Difference | SE |
|---|---|---|---|---|
| Runs allowed per game | 6.93 | 7.64 | +0.71 | 0.54 |
| Walks + HBP per PA | 18.1% | 18.2% | +0.1% | 0.7% |
| Strikeouts per PA | 16.4% | 16.7% | +0.3% | 0.8% |
| Hard contact per PA | 19.5% | 17.9% | −1.6% | 0.8% |
| Fastball share | 64.0% | 59.2% | −4.8% | 1.2% |
| Changeup share | 3.8% | 7.2% | +3.4% | 0.5% |
| Inside share | 6.8% | 8.2% | +1.4% | 0.5% |
| Chase share with two strikes | 4.3% | 5.5% | +1.2% | 0.6% |

| Runs per game by level | v0.8 | v0.9 | Difference | SE |
|---|---|---|---|---|
| HS | 7.87 | 8.83 | +0.97 | 1.01 |
| D3 | 8.20 | 7.43 | −0.77 | 0.99 |
| D1 | 4.73 | 6.67 | +1.93 | 0.75 |

**D1.** v0.9 allows less hard contact (−2.6%) and gets more strikeouts (+2.7%), yet gives up more runs. In the counts, more of its balls in play fall for hits: D1 hits on balls in play rise from 29.7% to 32.9%, mostly solid-contact singles (61 to 80). One game, `college_d1_default_s106`, is 1 run vs 18; without it D1 is +1.4.

This lines up with the decision-quality result below, but realized runs swing a lot game to game. Once calls diverge, the random draws diverge too, so the pairing helps less than it seems.

## Decision quality (`readthrough/step7_regret.py`)

**One yardstick, 27 paired games** (`results/step7/regret_world_*.txt`), runs per game:

| | v0.8 | v0.9 with guardrail back | v0.9 |
|---|---|---|---|
| Cost of the engine's mix (`regret_w_exp`) | 1.296 | 1.337 | 1.694 |
| Per pitch | 0.0087 | 0.0088 | 0.0103 |
| Cost of the engine's own top call (`regret_w_info`) | 0.380 | 0.436 | 0.442 |
| Changeup share | 3.4% | 3.4% | 7.3% |

| Paired difference (cost of the mix, runs per game) | Difference | SE |
|---|---|---|
| v0.9 minus v0.8 | +0.398 | 0.078 |
| v0.9 minus v0.9 with guardrail back | +0.358 | 0.090 |
| v0.9 with guardrail back minus v0.8 | +0.040 | 0.055 |

By level, v0.9 minus v0.8: HS +0.56 (SE 0.16), D3 +0.32 (0.13), D1 +0.31 (0.11).

**Each engine's own table, all 90 games** (`results/step7/regret_v08_vs_v09_same_world.txt`): v0.9 minus v0.8 is +0.45 runs per game (SE 0.09). That is the same direction and about the same size, so the result doesn't depend on the yardstick.

**Where the extra cost is.** Comparing v0.9 with v0.9 with the guardrail back, the extra cost of the call actually made comes from:

| Call | Extra runs over 27 games |
|---|---|
| Curveball middle | +3.1 |
| Changeup middle | +2.6 |
| Changeup away (up-away or down-away) | +2.5 |
| Slider middle | +1.9 |
| Everything else | about +1.3 |

By count it is spread out: 0-0, 1-0 and 2-0 carry the most.

**How to read it.**
- Each engine's best single call is about as good as the other's (top-call cost +0.005 between v0.9 and v0.9 with the guardrail).
- The extra cost is in the *spread*. Without the guardrail, calls that the engine scores as close to its best are allowed into the mix even when they cost noticeably more one pitch at a time. In the world's truth those calls are worse than the engine thinks.
- The v0.8 guardrail was acting as protection against the engine's own estimation error on off-speed in the zone.

## Read-through checks (`readthrough/read.py`, `results/step7/*_summary.json`, `*_pack.md`)

| | v0.8 (own world) | v0.8 in v0.9 world | v0.9 |
|---|---|---|---|
| Hard-rule violations (R1 chase at 3-0/3-1, R2 chase at 2-2, R3 re-called shake-off) | 0 | 0 | 0 |
| E1, first two calls off the zone | 0 | 0 | 1 |
| S1, same pitch same spot after no whiff, per 100 | 16.8 | 17.4 | 16.1 |
| Two-strike middle share | 47.8% | 47.8% | 42.1% |
| Low breaking ball not landing, runner on 3rd, < 2 outs (count) | 30 | 14 | 35 |
| First-pitch fastball | 66.7% | 67.4% | 58.8% |
| Predictor edge over "always fastball" | +2.3% | +3.6% | +3.3% |

v0.9 is a little less predictable at the first pitch and less likely to throw the middle with two strikes. It calls more low breaking balls that aren't landing with a runner on third, although the landing filter is on. That filter needs at least 4 thrown and a strike rate of 40% or less; the check flags under 50%. These calls are worth a look in `results/step7/v09_pack.md`.

## Caveats

- **The yardstick isn't independent of the engine.** The world's "truth" is the same outcome model the engine uses, plus the hidden truth: true movement, the hitter's true grades and the true umpire. Regret measures how the engine does against its own model when it lacks those hidden inputs, not against real hitters.
- **The fixed yardstick favors v0.9 if anything.** Its hitter sits as if facing the v0.9-world equilibrium, which is closest to what v0.9 itself plays. v0.9 still comes out worse.
- **Only 27 games on the fixed yardstick.** The differences are 4–5 SE, so the conclusion holds. The by-level numbers are rougher (9 games each).
- **The world's power home-run effect only changes values, not outcomes.** It changes the truth costs (values), but the simulator's batted-ball draw (`run_ball_in_play_typed`) uses the plain out tables. In the simulated world, power hitters don't actually hit more home runs. This affects both engines the same way.
- **The own-world runs result** (v0.9 −0.07 vs v0.8, SE 0.58; `compare_v08_vs_v09_own_worlds.txt`) compares two different worlds, so it isn't a test of the engine.

## Decision: item 10 (the guardrail)

These were the options:

- **Guardrail off** (as built): changeup gate passes (8.8–10.7%). Costs +0.36 runs per game in the simulator.
- **Guardrail back on**: costs about the same as v0.8. The changeup falls back to 3.4%, so the gate fails.
- **A wider window, in between**: untested.

**Drew, Nov 5: keep it off as built, and switch the app to v0.9.** v0.9 keeps the extra changeups and accepts the simulator's cost
of about 0.36 runs per game. `FLAGS_V09` is unchanged.

## The app on v0.9

- **Engines and default.** The engine choices are v0.9 (default), v0.8 and v0.7c. Each runs exactly its own flags
  (`FLAGS_V09`, `FLAGS_V08`, `FLAGS_V07`). A setup saved on v0.8 moves to v0.9 once, because v0.8 was the default before
  v0.9 existed. Picking v0.8 again after that sticks. The engine logs version `0.9` (`app/engine.js`) and app version
  `2026.11.05`. Game records default to `v09`.
- **Matchup memory in the game state.** `g.mm[pitcher][hitter]` is kept the same way `simulate.py` keeps it:
  - each whiff or called strike counts under `succ|<pitch class>`;
  - each hard-hit ball counts under `hard|<pitch class>|<target>`; when no contact grade is logged, an extra-base hit
    counts as hard, the same rule the app uses for confidence;
  - the pitch class is the pitch thrown, so a cross-up counts for the pitch that was actually thrown.

  This trip's pitches are collected on the plate appearance and added to his record only when it ends. The engine
  sees earlier trips only, through `situation().matchup`. The record is saved with the game and logged with each pitch's
  situation, so a replay sees it.
- **One gap.** Like the familiarity count, a pitch recorded before the next call has been made (in the 15 ms after a plate
  appearance ends) isn't counted.

**Checks (all run after the switch):**

| Check | Result |
|---|---|
| New `app/v09_matchup_e2e.js` (default engine, record kept for the next trip only, hard contact, reaches the engine and moves whiff odds, logged with the pitch) | 11/11 pass |
| `smoke`, `v09_labels_e2e`, `v08_e2e` (default-engine check updated to v0.9), `gameday_e2e`, `replay_e2e`, `d0_e2e`, `db_e2e`, `stage2_e2e`, `travel_e2e`, `security_e2e` | all pass, no page errors |
| `d6_test`, `db_test`, `gate_test`, `import_test`, `learn_test`, `rails_test`, `schema_test`, `stage2_test` | all pass. `db_test` and `schema_test` needed `fake-indexeddb` reinstalled after the container restart |
| JS goldens, v0.8 and v0.7c; Python/JS parity, v0.8 and v0.9 (150 cases each) | exact / pass |

The Supabase migration (`20261105000000_v09_intent.sql`) is still not applied, and nothing is merged to main.

## Update (Nov 5, later): main merged into v0.9-work

On Drew's go-ahead, main (22 commits: Plans 0–5) was merged into v0.9-work so v0.9 can fast-forward main after review.

- Conflicts: `.gitignore` (both sides kept), `app/dist` (rebuilt), and one hunk in `app/index.src.html` where main's
  pitch-count line and v0.9's infield-in / steal controls share the scoreboard cell (both kept).
- The two Pitch Caller migrations were renamed so they sort after prod's latest (`20261109000000_players_admin`); the
  Supabase CLI's `db push` would otherwise refuse them as older than the last applied migration:
  `20261104000000_v08_inputs.sql` → `20261110000000_v08_inputs.sql`,
  `20261105000000_v09_intent.sql` → `20261110000100_v09_intent.sql`. SQL unchanged. Neither is applied anywhere; they
  reach prod only through the promote workflow.
- main itself is not changed yet.
