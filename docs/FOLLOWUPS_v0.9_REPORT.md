# v0.9 follow-ups: merge, landing calls, the power world, a wider guardrail

Date: 2026-11-05/06 (overnight). Branch `v0.9-work`. Everything below was run in this session; each result names its
command and output file. Nothing was merged or pushed to main, and nothing was applied to Supabase.

## Bottom line

- **Merge.** main is merged into v0.9-work, conflicts resolved keeping both sides, and the two Pitch Caller migrations
  are renamed so they sort after prod's latest. Everything passes on the merged tree. main can fast-forward on your word.
- **A: landing calls with a runner on 3rd.** The filter does what it was built to do. v0.9's extra flagged calls are
  pitches landing 31–49% (shrunk estimate above 0.40), two-strike chases, and one "trusts nothing" fallback.
  __A_RESULT__
- **B: the power home-run effect.** It was **inert in every simulated game**, not just in the batted-ball draw: no
  simulated situation ever carried hitter grades. The new off-by-default `TRUE_POWER` world fixes that.
  __B_RESULT__
- **C: a wider guardrail.** 0.020 is the narrowest window that passes your changeup gate; 0.030 is the same as off.
  __C_RESULT__

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
- **Migrations renamed** (prod `pitchiq-prod` is at `20261109000000`; `supabase db push` refuses older unapplied ones):
  `20261104000000_v08_inputs` → `20261110000000_v08_inputs`, `20261105000000_v09_intent` → `20261110000100_v09_intent`.
  SQL unchanged. They reach prod only through your promote workflow.
- main gained two commits from another session during the night (sign-up email link, spec sign-off); both are merged in.
  `web/` and the spec are byte-identical to main's.
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

__A_TABLE__

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

__B_SEEN__

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

__C_TABLE__

## Open questions for you

__QUESTIONS__
