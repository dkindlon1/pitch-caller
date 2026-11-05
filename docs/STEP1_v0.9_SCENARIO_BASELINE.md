# v0.9 Step 1: scenario baseline, v0.7c and v0.8 (no engine change)

Date: 2026-11-05. Branch `v0.9-work`. Scenario suite `readthrough/scenarios_v09.json`, sha256 `8c2721624d11…`, frozen and
pushed (fa57d07) before either engine was graded. Command: `python3 readthrough/scenarios.py v07c v08 --out
results/scenarios_baseline_v07c_v08.json` (full output in `results/scenarios_baseline_v07c_v08.txt`). Grader self-tests:
`readthrough/test_scenarios.py`, 11/11.

Pass rule (Drew, Nov 5): Not-acceptable share at most 5% (0% on hard-rule rows) and Acceptable share at least 70% of
the engine's call spread.

## Headline

| | v0.7c | v0.8 |
|---|---|---|
| Rows passing (of 64) | 24 | 26 |
| Hard-rule rows with any Not-acceptable call | 1 (C6: chase at 2-2, before that rule existed) | **0** |
| Rows failing on a Not-acceptable call | 8 | 6 |
| Rows failing only on Acceptable share (< 70%) | 32 | 32 |
| Average share of calls aimed at **middle** | 60% | 63% |
| Chase share in 0-2 and 1-2 counts (14 rows) | 9.7% | **1.3%** |
| Inside calls (up-in, down-in), all rows | 1.1% | 1.8% |

v0.8 fixed 7 rows (A1, B8, C6, D5, E2, F3, G4) and broke 5 (A7, C3, C9, H2, H3; H3 misses by 0.5%).

## What the failures say

**1. Middle dominates.** About 63% of v0.8's calls aim at the middle. Under Drew's rules middle is Acceptable only at
2-2 and neutral at 1-1 and with two strikes, so it doesn't count toward the 70% elsewhere. 25 of v0.8's 32
Acceptable-share failures would pass if those middle calls counted. This is the single biggest driver of the score, and
it is a judgment for Drew: whether a call aimed at the middle (which the engine's command model scatters) is what a coach
means by "attack the zone", or whether the engine should aim at corners more. This report does not change the frozen
grading.

**2. v0.8 almost never expands with two strikes.** Chase calls fell from 9.7% (v0.7c) to 1.3% of the spread in 0-2 and
1-2 counts. With two strikes v0.8 aims down-away corners and middle instead. This is what fails C2 (0% Acceptable: after
a fastball up-in whiff at 0-2 it never goes back up-in or chases), F2, G1, I2 and C9. It runs against "expand, don't
waste". None of the six v0.9 items targets it.

**3. v0.8 almost never pitches inside** (1.8% of calls). H4 (hitter crowds the plate) gets 0% inside fastballs; F6 (late
on the fastball) gets 16% Acceptable. Item 3 (side to side) is the v0.9 item closest to this, but it changes what follows
an inside pitch, not how often the engine goes inside.

**4. Six rows where v0.8 makes a call Drew marked Not acceptable:**

| Row | Not-acceptable share | What the engine did | Closest v0.9 item |
|---|---|---|---|
| H1 | 100% | 2-0 to a power hitter (power grade 5): fastball middle every time | none (scouting weight) |
| E6 | 26% | 3-2, curveball landing 1 of 6: curveball middle 26% | none (landing) |
| E8 | 26% | 1-2, high school curveball landing 0 of 4: curveball to a corner 26% | none (landing) |
| I4 | 16% | Hitter mashed FB middle twice this game: FB middle again 16% | items 5-6 (matchup memory) |
| F5 | 12% | Changeup down-away squared up last pitch: same pitch, same spot 12% | items 5-6 / repeat logic |
| C7 | 10% | 3-2, changeup landing 2 of 8: changeup middle 10% | none (landing) |

**5. Hard rules hold.** v0.8 makes no chase call at 3-0, 3-1 or 2-2 in any row, and never re-calls a shaken-off pitch.

## What this means for v0.9

The v0.9 items as planned touch only part of this: matchup memory (I4, F5) and side to side (inside). The three largest
patterns (middle share, two-strike chase rate, and scouting and landing reads that don't move the call enough at H1, E6,
E8 and C7) are not v0.9 items. Whether to add any of them is Drew's decision; this report changes nothing in the engine.

## Not done yet in Step 1

The full-game read-through (games printed call by call with the automatic checks) and the four baseline reports (usage
by count, arsenal balance, predictability by count, platoon audit) are the rest of Step 1.
