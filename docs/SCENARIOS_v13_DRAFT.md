# v1.3 hitter scenario rows: DRAFT (Nov 21, 2026)

**DRAFT. Drew grades these. Every grade below is proposed (Claude); none is final. This is not a frozen scenario file
(no JSON, no sha256).** `scenarios_v13.json` gets built from these rows after Drew grades them (plan 5.2).

35 rows, split the way plan 5.2 asks: traits and presets 6, two-strike 5, adaptation and in-at-bat 5, unknown hitters 4,
platoon 3, situation 4, no-scouting spot checks 3, D2 5.

## How to read a row

- **Default situation** (as in `readthrough/scenarios_v12.json`): college D3, three-pitch arsenal (fastball 85 ride,
  slider 77 tight, changeup 77 fade, all grade 3, command 3), same-side hitter, bases empty, no outs, 4th inning, tied,
  home team, pitch count 50, 4 batters faced, catcher blocks at 3, nothing landing unusually, no scouting. Each row lists
  only what differs from this.
- Rows use the same input fields as the v1.0-v1.2 rows: `level`, `balls`/`strikes`, `outs`, `bases`, `inning`/`margin`,
  `arsenal` plus `pitch_edits`, `same_side`, `grades`/`hitter_tags`, `pa_log` (this at-bat), `matchup` (earlier trips),
  `familiar`, `usage_by_call`, `landing_today`. The fields v1.3 adds are marked *new*: `hitter_preset`
  (aggressive_early / patient / power / contact / free_swinger / two_strike_battler), `traits`, `slot` (1-9),
  `team_strength`, `team_games`. Pattern names follow `readthrough/scenarios.py` (FB/OS/ANY with
  zone/corners/middle/down-middle/chase/any; "heart FB" = FB middle).
- **v1.2.3 now** = today's engine (`engine.call_v08`, the same path `readthrough/scenarios.py` grades), run on Nov 21.
  It shows the top call and its share, plus the shares the row judges. Where a row compares two situations, both runs
  are shown. v1.2 has no presets, slots or team strength. Those rows use the closest v1.2 input, labelled **proxy**
  (grades c/w/d, hitter tags), or run as Unknown. In v1.3 the traits exist only in the simulator and are hidden from the
  engine, so the proxy is only a rough guide to which way the call should move.
- D2 does not exist in this checkout (another branch adds `college_d2` on D3 placeholder numbers). D2 rows show v1.2 at
  D3 and at D1.
- Standing calls these grades respect (plan 1.5): a hard foul counts as a foul; better stuff never makes a worse call; a
  ball hit hard twice at a spot moves the odds there only a little; the engine calls a proper game with no scouting; no
  chase target at 3-0 / 3-1; a fastball middle at 2-0 to a power hitter is acceptable; the middle is fine early and at
  1-2, and edges are fine with two strikes; mashed twice = a large soft penalty; hitter reads move the call.
- Flag column: **ok** = v1.2 already meets the proposed grade; **FLAG** = v1.2 misses it (see "Rows where v1.2 already
  looks wrong" at the end); **n/a** = v1.2 can't express the input, so the run is only a baseline.

## 1. Traits and presets (6)

| ID | Situation (vs default) | Call judged | Proposed grade (Claude) | v1.2.3 now | Flag |
|---|---|---|---|---|---|
| H13-01 | 1-2; *new* `hitter_preset: free_swinger` | Chase share rises vs no preset | Chase share at least 10 points above the no-preset run. Any strike or chase is acceptable at 1-2 (C3). | none: FB up-away 15%, chase 5%. proxy (aggressive, d1): **FB chase 27%**, chase 53%, middle 0% | ok |
| H13-02 | 0-0; *new* `hitter_preset: patient` | Steal strike one: zone share holds or rises | Strike targets acceptable, chase not acceptable; zone share at least the no-preset share. | none: CH middle 23% (middle 60%). proxy (patient, d5): **FB middle 32%** (middle 80%) | ok |
| H13-03 | 2-0; *new* `hitter_preset: power` | Heart FB acceptable (standing call), but not called more than vs no preset | FB down / FB middle / OS zone acceptable, FB up arguable (H1); heart FB share no higher than the no-preset share. | none: FB middle 42%. proxy (w5, lift): **FB middle 29%**, FB up-in 12% | ok |
| H13-04 | 0-2; *new* `hitter_preset: contact` | He puts the middle in play: middle doesn't rise | Chase / corners / down-middle acceptable, middle arguable (H2); middle share no higher than the no-preset share. | none: SL down-away 25%, middle 11%, corners 74%. proxy (c5, flat): **SL down-away 19%**, middle 14%, corners 55% | FLAG (mild) |
| H13-05 | 0-0; *new* `hitter_preset: aggressive_early` | Top pitch is not a heart fastball; heart FB share falls | Strike targets acceptable, chase not acceptable (B1); heart FB share at least 3 points below the no-preset share; an off-speed or edge strike one is acceptable. | none: CH middle 23%, FB middle 23.1%. proxy (aggressive): **FB middle 23%** (FB middle 22.8%, all middle 60% to 52%) | FLAG |
| H13-06 | 1-2; *new* `hitter_preset: two_strike_battler` | Put-away pitches keep most of the mix; chase share below the free swinger's | Any strike or chase acceptable; corners + chase at least 40%; middle allowed (standing call) but not the majority. | none: FB up-away 15%, corners 55% + chase 5%. proxy (c5, d5): **CH middle 22%**, middle 61%, corners 28%, chase 0% | FLAG (arguable) |

## 2. Two-strike (5)

| ID | Situation | Call judged | Proposed grade (Claude) | v1.2.3 now | Flag |
|---|---|---|---|---|---|
| H13-07 | 0-2, Unknown | Edges and chase carry the call | Chase / corners / down-middle acceptable, middle arguable; middle 15% or less. | **SL down-away 25%**; chase 12%, corners 74%, middle 11% | ok |
| H13-08 | 1-2, Unknown | The middle stays allowed (standing call) | Any strike or chase acceptable, nothing not acceptable (C3); v1.3 must not push the middle out at 1-2. | **FB up-away 15%**; middle 32%, corners 55%, chase 5% | ok |
| H13-09 | 2-2, Unknown | No chase target (engine rule); edges fine | Any zone target acceptable; corners at least 20%. | **SL middle 26%**; middle 64%, corners 24%, chase 0% | ok |
| H13-10 | 3-2, 2 outs | His best strike pitch | Any zone target acceptable, chase arguable. | **FB middle 27%**; middle 71%, OS 44% | ok |
| H13-11 | 1-2; `pa_log`: FB up-away cstrike, SL down-away ball, FB up-in **foul (contact hard)** vs the same foul with no contact tag | Hard foul = foul (hard check, as F5) | Same call both ways: total variation 1 point or less. | both: **SL down-away 15%**, mixes identical | ok |

## 3. Adaptation and in-at-bat (5)

| ID | Situation | Call judged | Proposed grade (Claude) | v1.2.3 now | Flag |
|---|---|---|---|---|---|
| H13-12 | 1-2; `pa_log`: FB up-away ball, FB down-away cstrike, **SL down-away whiff** | It worked: SL down-away / SL chase stays in the mix | Any strike or chase acceptable; SL down-away + SL chase at least its share with no at-bat log. | log: **SL down-away 19%** (SL 28%). no log: FB up-away 15%, SL down-away 14% | ok |
| H13-13 | 0-1; `pa_log`: **FB middle taken** for a strike | In-at-bat take effect: a small move, no flip | Total variation 5 points or less vs no log; strike targets acceptable. | log: **FB middle 14%**, FB zone 49%. no log: FB middle 14%, FB zone 50% | ok |
| H13-14 | 0-0, 3rd trip (19 faced, pitch count 85, `familiar` FB 6 / OS 4); `matchup`: **FB middle hard, trips 1 and 2** | Mashed twice = large soft penalty | FB corners / OS zone acceptable, FB middle not acceptable (I4); FB middle 5% or less. | mashed: **FB down-middle 19%**, FB middle 0%. clean: FB middle 23% | ok |
| H13-15 | 2-0, power (w5), 10 faced; `matchup`: **FB up-in hard once**; variant: twice (19 faced) | Once = small shift at that spot, not banned; twice = large penalty | Once: FB up-in drops 5 points or less and stays available; other calls move 5 points or less. Twice: FB up-in 2% or less. | base: FB middle 29%, FB up-in 11.3%. once: **SL middle 22%**, FB up-in 10.6%, FB middle 22%. twice: FB middle 26%, FB up-in 0% | FLAG (mild) |
| H13-16 | 2-2, 19 faced, pitch count 70; `usage_by_call`: **SL middle called 3 times in this count today** (variant 6) | Within-game learning is capped: the 2-2 top call moves a limited amount (the spirit of the plan's 10-point check) | Any zone target acceptable; the no-history top call (SL middle) drops by 10 points or less at 3 calls. | none: **SL middle 26%**. 3 calls: **FB down-away 21%**, SL middle 7% (down 18.6), OS 49% to 25%. 6 calls: SL middle 0%, FB zone 88% | FLAG |

## 4. Unknown hitters by slot / team (4)

v1.2 has no slot or team input, so each row runs as Unknown (the level average). That is the "before" number.

| ID | Situation | Call judged | Proposed grade (Claude) | v1.2.3 now | Flag |
|---|---|---|---|---|---|
| H13-17 | D1, 0-0; *new* `slot: 1`, `team_strength: 0` (average) | The leadoff prior moves little at 0-0; still a strike | Strike targets acceptable, chase not acceptable; total variation 5 points or less vs the level average. | **FB middle 23%**; middle 49%, chase 0% | n/a |
| H13-18 | D1, 2-0; *new* `slot: 4`, `team_strength: +1` | Heart FB acceptable (standing call), but no more often than vs the level average | FB down / FB middle / OS zone acceptable; heart FB share no higher than the level-average share. | avg: **FB middle 51%**. proxy w4: FB middle 42% | n/a |
| H13-19 | D3, 1-2; *new* `slot: 9`, `team_strength: -1` | Weak hitter: attack; middle fine | Any strike or chase acceptable; zone share no more than 5 points below the level average. | avg: **FB up-away 15%**, chase 5.4%. proxy c2 w2: FB down-away 15%, chase 6.8% | ok |
| H13-20 | D3, 2-1; *new* `slot: 4`, `team_strength: +1`, `team_games: 2` | Thin team data: the team adjustment is pulled toward zero | Total variation 3 points or less vs the same row with no team input (slot only). | avg: **FB middle 42%**; middle 79% | n/a |

## 5. Platoon (3)

| ID | Situation | Call judged | Proposed grade (Claude) | v1.2.3 now | Flag |
|---|---|---|---|---|---|
| H13-21 | 1-2, opposite-side vs same-side | More changeup vs opposite-side hitters (C10) | Any strike or chase acceptable; CH share vs opposite higher than vs same side. | same: **FB up-away 15%**, CH 24%. opp: **FB up-away 12%**, CH 29% | ok |
| H13-22 | 0-0, sinker / sweeper / changeup (low three-quarter), same vs opposite | More sweeper vs same side, more changeup vs opposite | Strike targets acceptable, chase not acceptable; SL(same) > SL(opp) and CH(opp) > CH(same). | same: **SI middle 22%**, SL 25%, CH 16%. opp: **CH middle 18%**, SL 21%, CH 23% | ok |
| H13-23 | 2-0, power (w5), opposite vs same | A platoon edge doesn't push the call off the zone in a hitter's count | Zone 100%; FB middle acceptable either way; heart FB share vs opposite no more than 5 points above same side (he has the platoon edge). | opp: **FB middle 39%**. same: **FB middle 29%** (10 points more heart FB vs the hitter with the edge) | FLAG (mild) |

## 6. Situation: scoring position, late and close, times through (4)

| ID | Situation | Call judged | Proposed grade (Claude) | v1.2.3 now | Flag |
|---|---|---|---|---|---|
| H13-24 | 1-1, 6th, tied, 1 out, runner on 2nd vs bases empty | Runner in scoring position: a small effect, no chase spike | Strike targets acceptable, chase arguable (B5); total variation 10 points or less vs empty. | empty: **CH middle 15%**. runner on 2nd: **FB middle 13%**; chase 0% both | ok |
| H13-25 | 0-0, 9th, up 1, 1 out, empty vs 4th tied | Late and close: get strike one, no nibbling | Strike targets acceptable, chase not acceptable; zone share at least the 4th-inning share. | 9th: **FB middle 11%**. 4th: FB middle 13%; zone 100% both | ok |
| H13-26 | 0-0 at 9 / 17 / 18 / 19 / 27 faced (`familiar` growing with trips, pitch count up to 70) | Times through the order: a smooth curve, no third-time jump | Strike targets acceptable (I3); from 18 to 19 faced, no call moves more than 2 points; 9 to 27 changes smoothly. | FB middle 24.2 / 24.4 / 25.2 / 24.9 / 24.6%; OS 45.6 / 44.9 / 43.2 / 43.6 / 44.1%. Note: `batters_faced` alone changes nothing; only `familiar` and the pitch count do | ok |
| H13-27 | 2-2, 7th, tied, runner on 2nd, 2 outs | Two strikes and a runner in scoring position: edges fine, no chase (2-2) | Any zone target acceptable (C6); corners at least 30%. | **FB up-away 25%**; corners 70%, chase 0% | ok |

## 7. No-scouting spot checks (3)

The full-game version of this check (every hitter Unknown, matrix wrong-call rate, grid checks) is a hard automatic check
(plan 5.2). These rows are spot checks Drew can read.

| ID | Situation | Call judged | Proposed grade (Claude) | v1.2.3 now | Flag |
|---|---|---|---|---|---|
| H13-28 | D3, 0-0, 1st inning, first batter, 0 pitches | A proper first pitch with nothing scouted | Strike targets acceptable, chase not acceptable. | **CH middle 23%** (FB middle 23% just behind); chase 0% | ok |
| H13-29 | HS, 1-1, two-pitch (FB 82, CB 70) | Proper HS call with nothing scouted | Strike targets acceptable, chase arguable. | **CB middle 26%**; FB 61%, chase 0% | ok |
| H13-30 | D1, 3-1, runner on 1st | No chase at 3-1 (hard check) | FB zone acceptable, OS zone arguable, chase not acceptable (hard). | **FB middle 88%**; chase 0% | ok |

## 8. D2 (5)

Proposed for every D2 row: the hard rules hold, and each call's D2 share sits inside the span of the D3 and D1 runs, give
or take 3 points (D2 borrows from both, plan 1.1). The other branch starts D2 on D3 placeholder numbers, so D2 should
match the D3 column until D2 data is fit.

| ID | Situation (`level: college_d2`) | Call judged | Proposed grade (Claude) | v1.2.3 at D3 | v1.2.3 at D1 |
|---|---|---|---|---|---|
| H13-31 | 0-0, no scouting | Proper first pitch | Strike targets acceptable, chase not acceptable. | **CH middle 23%** (middle 60%) | **FB middle 23%** (middle 49%) |
| H13-32 | 3-0 | No chase at 3-0 (hard check) | FB zone acceptable, OS zone arguable, chase not acceptable (hard). | **FB middle 72%** | **FB middle 75%** |
| H13-33 | 1-2 | Expand or finish | Any strike or chase acceptable. | **FB up-away 15%**; chase 5.4%, OS 49% | **FB down-away 12%**; chase 5.8%, OS 55% |
| H13-34 | 2-0, power (w5) | Heart FB acceptable (standing call) | FB down / FB middle / OS zone acceptable, FB up arguable. | **FB middle 29%** | **FB middle 34%** |
| H13-35 | 1-1, runner on 3rd, 1 out, catcher blocks 2, slider landing 2 of 9 | No ball in the dirt with a runner on 3rd and a poor blocker | Strike targets acceptable, chase not acceptable. | **FB down-middle 16%**; chase 0%, SL 23% | **FB down-middle 16%**; chase 0%, SL 23% |

## Rows where v1.2 already looks wrong against the proposed grade

- **H13-16 (adaptation):** three earlier SL-middle calls in this count today move the 2-2 top call by 18.6 points
  (26% to 7%), and the top call flips to FB down-away. At six calls the slider middle is gone (FB zone 88%). This is
  v1.2's anti-predictability (`usage_by_call`, spec 2.3) working as built, but it's bigger than the 10-point limit the
  plan sets for the adaptation cap. Drew decides whether that limit should also cover this input.
- **H13-05 (aggressive early):** the aggressive tag barely touches the heart fastball at 0-0 (23.1% to 22.8%). The total
  middle share falls, but only through the changeup. "Hitter reads move the call" holds weakly.
- **H13-06 (two-strike battler proxy c5 d5):** at 1-2 the call goes to off-speed middle (61% middle, 28% corners, 0%
  chase). This one is arguable: the middle is allowed at 1-2, and the proxy isn't the preset.
- **H13-04 (contact proxy) and H13-23 (platoon, power):** small moves the wrong way. The middle goes up 3 points vs a
  contact hitter at 0-2. A power hitter with the platoon edge gets 10 points more heart fastball than a same-side one at
  2-0. Both are still acceptable under the standing calls.
- **H13-15 (hit hard once):** the spot he hit (FB up-in) barely moves (11.3% to 10.6%), but FB middle drops 7 points,
  so the shift lands on a spot he didn't hit. Twice behaves as the standing call asks (FB up-in 0%).
- Not flags, just notes: at D3 0-0 the top call is a changeup middle (H13-28 / H13-31), tied with the fastball middle;
  "middle fine early" allows it. In v1.2, `batters_faced` alone doesn't change the call; times through works only
  through `familiar` and the pitch count (H13-26).

Runs were made with a throwaway script outside the repo (`run_v13_draft.py` and `run_extra.py` in the session
scratchpad). They call `readthrough/scenarios.build` and `call_dist` on rows built from the `scenarios_v12.json` arsenals
and defaults.
