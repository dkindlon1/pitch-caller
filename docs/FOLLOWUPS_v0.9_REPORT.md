# v0.9 follow-ups: merge, landing calls, the power world, a wider guardrail

Date: 2026-11-05/06 (overnight). Branch `v0.9-work`. Everything below was run in this session; each result names its
command and output file. Nothing was merged or pushed to main, and nothing was applied to Supabase.

## Bottom line

- **Merge.** main is merged into v0.9-work, conflicts resolved keeping both sides, and the two Pitch Caller migrations
  are renamed so they sort after prod's latest. Everything passes on the merged tree. main can fast-forward on your word.
- **A: landing calls with a runner on 3rd.** The filter does what it was built to do. v0.9's extra flagged calls are
  pitches landing 31–49% (shrunk estimate above 0.40), two-strike chases, and one "trusts nothing" fallback.
  The driver is the guardrail being off, not the filter: with the guardrail back these calls drop toward v0.8's level. A stricter filter doesn't help and costs good calls. **No change recommended to the filter.**
- **B: the power home-run effect.** It was **inert in every simulated game**, not just in the batted-ball draw: no
  simulated situation ever carried hitter grades. The new off-by-default `TRUE_POWER` world fixes that.
  With power real in the world, v0.9 still costs about +0.32 runs/game more than v0.8, the same conclusion as Step 7. With grades known, item 8 on vs off is +0.08 runs/game (SE 0.06): no sign it helps. The world change is kept behind settings; your call whether it becomes the default for future comparisons.
- **C: a wider guardrail.** 0.020 is the narrowest window that passes your changeup gate; 0.030 is the same as off.
  A 0.020 window saves about 0.09 runs/game against guardrail-off (SE 0.05, 90 paired games) and keeps 6.3% changeups vs 7.1%. That's a modest hedge, not a clear win; it still costs about +0.31 vs v0.8. **Your call; nothing changed.**

## The merge (Nov 5, evening)

| Check on the merged tree | Result |
|---|---|
| Goldens v0.8 and v0.7c, Python and JS | exact |
| Parity v0.8 and v0.9 (150 cases each) | pass |
| `scripts/test-app.sh` (main's CI: tests.py, parity, reproducible build, Node suites, pitch_rules 41/41, smoke, rules_e2e 20/20) | exit 0 |
| `scripts/test-sql.sh` on Postgres 17.11 (sync, review, client review, auth, app sync e2e, RLS matrix 266, waitlist) | 438 checks, 0 failures |
| d6, gate and 10 browser suites (v09_matchup, v09_labels, v08, gameday, replay, d0, db, stage2, travel, security) | all pass |
| v0.8 / v0.9 migrations applied after main's five later ones, on a scratch Postgres 17 database, then re-run | apply cleanly; idempotent |

- **Conflicts:** `.gitignore` (both kept), `app/dist` (rebuilt), and one hunk in `app/index.src.html`: main's pitch-count
  line and v0.9's infield-in / steal controls share the scoreboard cell. Both kept.
- **Migrations renamed** (prod `pitchiq-prod` is at `20261110000000_uploads` as of Nov 6, 10 a.m.; `supabase db push` refuses older unapplied ones):
  `20261104000000_v08_inputs` → `20261112120000_v08_inputs`, `20261105000000_v09_intent` → `20261112120100_v09_intent`.
  They had to move three times, because another session kept adding migrations to main overnight (`uploads`, applied to
  prod; `lapse` and `terms`, not yet). It numbers them a day apart at midnight, so these use 12:00 to stay clear.
  **Re-check at fast-forward time:** if main has a migration dated after 20261112120100 that prod applies first, these
  must move again. `tests_v09_followups.py` now fails on any duplicate version (a duplicate silently never runs on prod).
  SQL unchanged. They reach prod only through your promote workflow.
- main kept moving during the night (another session: sign-up fixes, Plans 4 and 6, billing test mode, uploads); all of it
  is merged in, up to 6edb8dc (Nov 6, 9:43 a.m.), with no conflicts after the first merge. `web/` matches main's exactly.
- **Not run:** the `web/` browser suites (they need a local Supabase stack). v0.9 doesn't touch `web/`.

**Step 7 reproduces exactly after the merge.** The 180 regenerated read-through games give byte-identical summaries and
packs (`results/step7/*_summary.json`, `*_pack.md`), and the 54 fixed-yardstick games give the same +0.398 runs/game.

## A: low breaking balls not landing, runner on 3rd

`python3 readthrough/followup_landing.py runs/readthrough/v08_in_v09w runs/readthrough/v09` →
`results/followups/landing_r3.txt` (90 paired games each, the Step 7 games).

| Runner on 3rd, < 2 outs | v0.8 (v0.9 world) | v0.9 |
|---|---|---|
| Pitches in that spot | 860 | 1,176 |
| Low SL/CB calls there | 70 (8.1%) | 117 (9.9%) |
| Flagged by the read-through (4+ thrown, raw strikes < 50%) | 14 (20.0%) | 35 (29.9%) |
| Breaking-ball strike rate, all pitches | 52.5% | 52.9% |

- **Where the gap comes from.** 35 ≈ 14 × 1.37 (more runner-on-3rd spots, because v0.9 allows more baserunners) × 1.22
  (a few more low breaking balls there) × 1.5 (more of them flagged). Paired by game, the gap is +21 flagged calls in
  90 games (SE 8). It's spread over 23 games, not one blowup.
- **v0.9's breaking balls don't land worse** (52.9% vs 52.5% strikes; 46.4% vs 46.0% to low targets).
- **The filter works as specified.** Of the 35: 28 were pitches at 31–49% raw strikes whose shrunk estimate is above
  the 0.40 block line. The read-through flags anything under 50% raw, but the engine shrinks toward 0.58 over 5 pitches,
  so it blocks only at about 0/4, 1/6 or 3/10. 6 were two-strike chases, which the filter allows on purpose. 1 was a
  starter who trusted none of his pitches. `candidates()` then falls back to his single most-trusted pitch, which here was
  the one not landing (curveball 31% vs fastball 46%), and the filter had nothing to give way to.
- v0.8 has no landing filter at all, yet a lower flagged share. So the filter isn't the binding constraint; the call mix is.

**What changes the count, in the 27 fixed-yardstick games** (`results/followups/landing_threshold_games.txt`; costs from
`results/followups/regret_v09_vs_l45.txt`, `regret_v09_vs_l48.txt`, vs v0.9 as built, runs per game):

| Engine (seeds 101–103, v0.9 world) | Flagged | Per 100 R3, < 2-out pitches | Cost of the mix vs v0.9 | Cost of its own best call vs v0.9 |
|---|---|---|---|---|
| v0.8 | 4 | 1.8 | | |
| v0.9, guardrail on at 0.010 | 8 | 2.4 | | |
| v0.9, guardrail on at 0.020 | 6 | 1.9 | | |
| v0.9 as built (guardrail off, landing ≤ 0.40) | 14 | 3.7 | — | — |
| v0.9, landing ≤ 0.45 | 11 | 3.3 | −0.031 (SE 0.069) | +0.043 (SE 0.046) |
| v0.9, landing ≤ 0.48 | 13 | 3.9 | +0.105 (SE 0.092) | **+0.202 (SE 0.071)** |

- The counts are small (27 games), but they all point the same way: the guardrail decides how many of these calls happen.
  Turning it off lets close-to-best low breaking balls back in, the same mechanism behind item 10's run cost.
- A stricter landing threshold barely moves the count, and at 0.48 it makes the engine's own best call clearly worse
  (+0.20 runs/game, 2.8 SE): it starts removing good pitches.
- **Design question, not changed:** when a pitcher trusts none of his pitches, `candidates()` falls back to his single
  most-trusted pitch even if it's the one not landing. Falling back to the pitch landing best instead is a one-line
  change, but it's a v0.4 rule, so it's your call.

## B: the power home-run effect in the world

**What was wrong.** Item 8 only acts when a situation carries a power grade (`s.grades`). `simulate.py` never sets one.
One full v0.9 D1 game in the v0.9 world makes 1.29 million outcome-model calls and none carries grades. So
`power_hr_shift` was never called, and `power_avoid` was inert in every simulated game: the engine's calls, the
outcomes *and* the truth values. The Step 7 caveat said it changed truth values; that was wrong, and is corrected there.

**What was added** (`simulate.py`, all off by default; a game made before the edit replays byte-identical):
- `TRUE_POWER=1`: each opposing hitter gets a hidden true power grade w ~ N(3, 1), clipped to 1–5. Spec 8.2 assumes
  hitters spread like pitchers: one grade point = one SD. It is drawn from its own random stream, so lineups and every
  other draw match the runs without it. The world's model uses it the way the engine's model would: the 8.2
  hard-contact term, and item 8's HR effect in the truth values and in `run_ball_in_play_typed`. The draw applies
  exactly the transform `in_play_value_typed` uses (`tests_v09_followups.py` checks this).
- `SEE_POWER=1`: the engine is also told a coach's grade, the true grade rounded.

**The world now behaves as item 8 says** (`results/followups/power_world.txt`, the model grade by grade):

| D3, fastball middle | w = 1 | w = 3 | w = 5 |
|---|---|---|---|
| Hard contact per ball in play | 21.4% | 27.7% | 34.8% |
| HR per hard contact | 5.53% | 6.17% | 6.88% |
| HR per ball in play | 1.19% | 1.71% | 2.40% |

Most of the spread is the 8.2 hard-contact term; item 8 adds about 5% relative per grade on top. The per-game samples
can't check this: 3 seeds give only about 27 distinct hitters, and their skill spread swamps the grade effect.

**Fixed yardstick, 27 paired games each** (`results/followups/regret_*`), cost of the engine's mix, runs per game:

| Comparison | Difference | SE |
|---|---|---|
| v0.9 minus v0.8, power world, engines blind | +0.318 | 0.091 |
| v0.9 minus v0.8, no power (Step 7) | +0.398 | 0.078 |
| v0.8: power world minus no power | +0.044 | 0.025 |
| v0.9: power world minus no power | −0.036 | 0.025 |

**With the engines told a coach's grade** (`SEE_POWER=1`, the true grade rounded; `regret_tps_v08_vs_v09.txt`,
`regret_v09_blind_vs_seen.txt`, `regret_v08_blind_vs_seen.txt`):

| Comparison, power world | Cost of the mix | SE | Cost of its own best call | SE |
|---|---|---|---|---|
| v0.9 minus v0.8, both told the grade | +0.334 | 0.078 | −0.058 | 0.062 |
| v0.9: told minus blind | +0.090 | 0.084 | −0.015 | 0.059 |
| v0.8: told minus blind | +0.075 | 0.051 | +0.061 | 0.050 |

**Item 8 by itself** (v0.9 told the grade, `power_avoid` on minus off, power world, 27 games;
`regret_item8_off_vs_on_seen.txt`): cost of the mix **+0.077 (SE 0.063)**, its own best call +0.014 (SE 0.045). By level:
HS −0.046 (0.103), D3 +0.221 (0.129), D1 +0.057 (0.081). Not significant, and no sign that item 8 helps.

- **Reading.** Making the world honest about power doesn't change Step 7's conclusion: v0.9's calls still cost about
  0.3–0.4 runs/game more than v0.8's on the fixed yardstick, blind or told. Knowing a hitter's power grade doesn't
  measurably help either engine in 27 games. Item 8 is a small term (about 5% relative on HR per hard contact per grade).

## C: a wider guardrail window

`python3 readthrough/followup_gate_window.py` → `results/followups/gate_window.txt` (the item 10 changeup gate:
3-pitch starter's changeup in 11+ of 24 cells and 5%+, every level):

| Guardrail | HS | D3 | D1 | Gate |
|---|---|---|---|---|
| on, 0.010 (v0.8) | 0/24, 0.0% | 2/24, 1.6% | 7/24, 5.6% | fail |
| on, 0.015 | 9/24, 5.6% | 10/24, 6.9% | 10/24, 8.2% | fail |
| on, 0.0175 | 11/24, 7.0% | 10/24, 6.9% | 11/24, 8.9% | fail |
| on, 0.020 | 12/24, 7.7% | 12/24, 8.1% | 12/24, 9.5% | **pass** |
| on, 0.030 | 14/24, 8.8% | 14/24, 9.2% | 14/24, 10.7% | pass |
| off (v0.9 as built) | 14/24, 8.8% | 14/24, 9.2% | 14/24, 10.7% | pass |

**Paired games on the fixed yardstick** (cost of the engine's mix, runs per game; `results/followups/regret_*`):

| Comparison | Games | Difference | SE | Changeups |
|---|---|---|---|---|
| guardrail on 0.010 minus v0.8 (Step 7) | 27 | +0.040 | 0.055 | 3.4% |
| 0.020 minus v0.8 | 27 | +0.314 | 0.060 | 6.2% |
| 0.030 minus v0.8 | 27 | +0.387 | 0.075 | |
| guardrail off minus v0.8 (Step 7) | 27 | +0.398 | 0.078 | 7.3% |
| 0.020 minus 0.010 | 27 | +0.273 | 0.073 | |
| **guardrail off minus 0.020** | **90** | **+0.090** | **0.047** | 7.1% vs 6.3% |
| guardrail off minus 0.030 | 27 | +0.012 | 0.014 | |

By level (90 games), guardrail off minus 0.020: HS +0.074 (SE 0.055), D3 +0.041 (0.071), D1 +0.155 (0.108).

- **The cost and the changeups come together.** Almost all of item 10's cost arrives between 0.010 and 0.020, the same step
  where the gate goes from fail to pass. By this yardstick the changeups the gate asks for are the costly calls.
- **0.030 is the same as off**, on the gate and in games. Don't bother with it.
- **0.020 is the one real middle option.** It's the narrowest window that passes the gate (0.0175 fails at D3), keeps most
  of the extra changeups, and saves an estimated 0.09 runs/game against off.
- Realized runs show nothing either way (0.020 vs off: −0.06 runs/game, SE 0.42), as in Step 7.
- Shipping 0.020 would need a new flag (off in FLAGS_V07 and FLAGS_V08), Python and JS matching, and parity, goldens and
  the app suites rerun. Not built; waiting on your decision.

## Open questions for you

1. **Fast-forward main to v0.9-work?** It contains all of main up to 6edb8dc, and everything passes on it. Another session is
   still committing to main, so I'll do a final catch-up merge (and migration check) right before the fast-forward.
2. **Guardrail: keep it off, or ship a 0.020 window behind a new flag?** 0.020 passes the gate and saves an estimated 0.09
   runs/game (SE 0.05) for slightly fewer changeups (6.3% vs 7.1%).
3. **"Trusts nothing" fallback:** fall back to the pitch landing best instead of the most-trusted one?
4. **TRUE_POWER world:** make it the default world for future comparisons (it changes every future run's numbers), or
   keep it behind the setting?
5. **Item 8:** keep it on? The simulator shows no benefit, though 27 games can't rule out a small one.
6. Still open from before: the HBP inside/away refit (left as is, per your call), and the 15 ms recording gap (not done).
