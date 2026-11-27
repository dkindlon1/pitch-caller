# Game-day operations & field use: PitchIQ V1.3 (c602f1c), audit by the game-day specialist

## 1. Verdict
**Grade C.** Pace, offline updates and cold-start quality hold up. But a coach will see the call collapse to one pitch
(90-100% in every count, 3-0 included) after one extra strike or one logged read. The "why" line names reasons that
didn't decide the call, and never mentions the V1.3 model. Unknown hitters ignore lineup slot, which the owner asked for.
Pitches are still stamped "engine 1.2.3".

All scripts and outputs: `/home/claude/audit/gd/` (scripts/, js/, runs/). Everything ran with `nice -n 10`, fixed seeds, Python
`engine.py` at c602f1c and `app/engine.js` + `app/engine_data.json` (data fingerprint c756860d96). "v1.2 tables" =
`PITCH_ZONE_TABLE=v12 PITCH_COUNT_TABLE=v12 PITCH_RUN_TABLE=v12 PITCH_MP_TABLE=v0` (engine.py:30 says these reproduce v1.2;
the v1.3 code changes such as the HS floor stay on), used to tell V1.3 regressions from older behaviour.

## 2. Findings

| ID | Sev | Title | Evidence | Impact | Proposed fix | Class |
|---|---|---|---|---|---|---|
| G1 | MAJOR | **"Landing hot" cliff: one more strike turns the mix into one pitch, 3-0 included.** V1.3 makes it worse at D1/D3 | `scripts/hot.py` (D3, all three pitches logged, pc 35). Slider share with 7/10 strikes (6 expected): 0-0 36%, 3-0 15%, 3-2 57%. With **8/10**: 0-0 **100%**, 1-0 100%, 2-0 95%, **3-0 100%**, 2-1 100%, 3-1 97%, 3-2 98%. D1 is the same. v1.2 tables: D3 0-0 93%, 3-1 77%, 3-2 59%. HS: v1.3 46% (the floor holds the fastball), v1.2 tables 100%. Cause: `landing_hot` is a step at HOT_EST 0.10 (engine.py:356) and adds COACH_RULE hot 0.03 runs (engine.py:296, 544). Cost gaps are about 0.01, so the softmax goes to ~1. Sims (`scripts/mixconc.py`, `streaks.py`): D3 reliever threw **17 fastballs in a row**, with 0-0 / 0-1 / 1-0 mixes "Fastball 100%" (runs/college_d3_in1_n0/game_101.csv, pc 37-44). HS reliever pc 48-62 were all fastballs. In 4-12% of all pitches one pitch held ≥90% of the mix (not counting 3-0) | Every coach feeds this: landing comes from ball/strike results alone (index.src.html:467). The opposing dugout sees 8+ straight of one pitch, in every count. This breaks "never predictable" and "no cliff". HS is masked only by the fastball floor | Make the hot credit continuous (ramp it from the landing estimate, like the 0.10 confidence band), or cap it so no single pitch passes about 70% outside 3-0 | CHANGES-CALLS, NEEDS-OWNER-RULING |
| G2 | MAJOR | **One logged read makes the call nearly fixed, so one mis-tap does too** (older than V1.3) | `scripts/readmove.py`. App update is `t += 0.35*(signal - t)` (index.src.html:392, 510, 518); the rule fires at READ_T 0.2 (engine.py:300). One "late" whiff gives 0.28, and **one opposite-field foul on a non-away pitch gives 0.21**: both fire `late_fb`. 0-0 fastball share by timing: 0.00 → 54% HS / 40% D3; 0.14 → 54 / 42; **0.20 → 91 / 91; 0.28 → 92 / 92** (D3: FB up-away alone 92%). Three reads give the same result as one. The opposite read ("early") moves the mix only 1-8 points. v1.2 tables: 100% at 0.20 | The owner said "nothing fires on a weak read", and one foul is close to that. At 10-20% mis-logging, a coach who taps the wrong foul direction gets an at-bat of 90%+ fastball up-away. The asymmetry is a design smell | Make it a ramp instead of a threshold, or require 2 reads, or cap the move at about +30 points | NEEDS-OWNER-RULING (CHANGES-CALLS) |
| G3 | MAJOR | **The "why" line is wrong for V1.3: it names terms that didn't decide the call and never names what did** | `scripts/why_sample.py`, 20 calls, HS + D3, default inputs. Every one of the 20 names an old sequencing or situation term (sit / timing / eye level / tunneling / situation / setup). The candidate list is fixed: `_WHY_PARAMS` + situation / umpire / running / grades (engine.py:3458, 3537). The count layer, zone table, landing, confidence and the hot / late_fb coach rules can never be named. In 15 of 20, the drawn call costs more than its comparator, yet gets a specific reason. Often the named Δ is under 10% of the gap: #4 HS 1-1 "He's sitting fastball (38%)" Δ −0.0001 vs gap +0.0151; #1 Δ −0.0006 vs +0.0090; #18 D3 3-1 "He's timed for 80 mph…" Δ ≈ −0.00001. In sims the 100%-fastball stretches (G1) are explained as **"Game situation: protect the lead"** (runs/hs_in1_n0/game_101.csv, reliever pc 49-58) | The coach reads a reason that is false or trivial on most pitches. When the engine is really "leaning on his best pitch today", it gives a game-situation line instead | Display only: name a term only if \|Δ\| ≥ ~25% of the gap (otherwise "Mixed in so he can't sit on one pitch"). Add lines for landing / hot / not landing, the coach rules and first-pitch strike. Run whyLine in the same place (it already runs after the call, index.src.html:376) | SAFE-NOW (no call changes; it changes logged why text, so the owner OKs the wording) |
| G4 | MAJOR | **Unknown hitter is not "his lineup slot's average adjusted by team strength"** (owner decision) | `Situation` has no slot or team field (engine.py:781-839). The app logs `evBase.strength = null` (index.src.html:453). The plan (PLAN_hitter_model_revamp:64, 168) and the fit (FITS_TRAITS_v13.md §3.1) exist: the power prior has R² 0.31 train / 0.26 on 2025, with slot 3-4 +0.15-0.19 and slot 9 −0.28 logits of XBH, and a team-z slope of +0.24. SCENARIOS_v13_DRAFT §4 rows H13-17..20 are unbuilt | A coach with no scouting (the main user) gets the same call for his 3-hole and 9-hole hitters. That is the exact case the owner said the engine must handle | Add `slot` / `team_strength` inputs to the count/zone layer from the fitted prior (power only, as §3.1 found) | CHANGES-CALLS, NEEDS-OWNER-RULING |
| G5 | MAJOR (deploy) | **V1.3 still calls itself engine 1.2.3** | `app/engine.js:159` `VERSION = "1.2.3"`. It is stamped on every logged pitch (`v: {app, engine: E.VERSION, data, learn}`, index.src.html:443), on packs (roster.js:318), on the About line (index.src.html:1665) and on site demos (web/lib/story.ts:72). engine.py has no version string. Only `data: c756860d96` tells a V1.3 pitch from a v1.2 one. APP_VERSION is 1.4.0, and app "1.3.0" was the watch release | Mid-season data from mixed versions, the owner's graded rows, reports and support ("which engine called this?") can't separate v1.2 from V1.3 by label | Bump to "1.3.0" in engine.js and add the same to engine.py. First grep the goldens and tests that assert "1.2.3" | SAFE-NOW (string only; re-run any test that pins it) |
| G6 | MINOR | **Learned values from v1.2 carry into the first V1.3 game, and nothing triggers a relearn** | Served grade / command come from the stored model (index.src.html:197-216). A relearn happens only at End game or by hand (roster.js:226, 423, 695). The model stores `learner` 2.1.0 but no data fingerprint. Mitigated: strike_rate / strike_ref are **recomputed on the live engine** (index.src.html:209-213), the served step is capped at 0.15/game and ±1.0 from the coach (learner.js CFG.caps), and the learner replays every past game on the current engine. The service worker never swaps versions during a live game (web/scripts/game-shell.mjs `live()`). `learned` syncs newest-wins (sync.js:26), so two iPads on different versions overwrite each other's model | Small and bounded. The first V1.3 game for a learned pitcher uses v1.2-fit talent | Save `E.dataVersion()` in the model and relearn on load when it differs | SAFE-NOW (moves only served values of learned pitchers; owner aware) |
| G7 | MINOR | **"Timed for about 78 mph" on an HS kid who throws 72** | With no speed entered, mph() falls back to BASE_FB_MPH 85, "college scale" (engine.py:1563, 1576), at every level. why_sample #7 HS: "He's timed for 78 mph; this plays 7 mph slower". The app only adds "about" (index.src.html:1111-1116). The HS FB median is 78.4 (simulate.py:281), so a typical HS mix is about 74 | A coach who knows his kid's speed sees numbers that are made up | Drop the mph numbers from the why line when no speed is entered (display only). A level-default FB speed would change calls (timing / flight) | SAFE-NOW (display) |
| G8 | MINOR | **HS fatigue flag says "watch" for the last 40 pitches of every normal start and never escalates on pitch count** | `flags.py`; run: HS clean outing → ok at 59, **watch at 60-110**, never "change" from count alone (max fatigue score 2 < 3). "Change" needs 3+ walks / HBP / hard contact in his last 6 (a soft "hit" doesn't count). The default fatigue point is HS 60 / D3 75 / D1 80 (engine.py:681-686). Nothing ties it to `pitch_cap` 105 or state limits. The coach's "pitch limit" box actually moves the fatigue start (index.src.html:224-228) | A yellow flag that never changes trains the coach to ignore it. A cruising kid at 105 still shows only "watch" | Escalate near pitch_cap. Label the box as the fatigue point, or derive the fatigue point as a share of the limit | NEEDS-OWNER-RULING |
| G9 | MINOR | **Fastball "not landing" → 0% fastball at 3-0 and 100% curveball at HS 3-2** | `scripts/fb_offday.py`: FB 4 of 14 (8.5 expected) → HS fastball 0% at 0-0 / 2-0 / 3-0 / 2-1 / 3-1 / 3-2, curveball 100% at 3-2. D3 the same (slider 71% at 3-2). The changeup (conf 0.6) also disappears at 3-2. This is the v1.0 Step 7 landing block (engine.py:2867-2876), not V1.3 | Predictable at 3-2. The owner's rule is about not "getting it over" with a pitch that isn't landing, and G1's cliff makes the remaining pitch dominate | Owner to confirm the rule should also cover the main fastball at 3-0 / 3-2 | NEEDS-OWNER-RULING |
| G10 | INFO (known) | D3 hitter's-count floor shows up at cold start with app-default inputs | `scripts/coldstart.py`, D3 default (Four-seam / Slider / Changeup, 3/3, feel .75/.7/.6): FB 1-0 47%, 2-0 55%, **2-1 43%**, 3-1 52%. v1.2 tables: 85 / 90 / 89 / 100%. Already in the lead's tests.py list | This is the first thing a D3 coach sees: changeup 25-27% at 2-0 / 3-1 | (lead's existing item) | CHANGES-CALLS |

## 3. Scenarios run and results

**Q1 cold start (default vs rich inputs), `scripts/coldstart.py`, v1.3:** the engine does *not* lean on inputs coaches lack.
For the same HS pitcher (default tags, 3/3), adding radar speeds moves at most ~9 points per count: 0-1 FB 48→39%, 1-2 CH
8→17%, 2-2 CH 1→9%. Adding measured movement on top changes ≤2 points. D3 adding speeds + movement: ≤7 points (2-1 slider
33→40%). The HS default looks sound: 0-0 FB 54%, 3-0 84% (no chase), 3-1 67% (owner's 55-70 band), 2-2 curveball 59%. Two caveats:
the HS fastball share **equals the floor in 8 of 12 counts** for this arsenal (0-0 .54/.536, 2-1 .58/.583, 3-1 .67/.667, 3-2 .55/.545…),
so the floor sets HS cold-start FB share more than the model does. Chase at 1-2 is ~0% at D3 and 2% at HS (v1.2 tables had
the same at D3). Missing input that matters: lineup slot (G4).

**Q2 sparse / noisy logging (`simrun.py`, seeds 101-103, 3 games per cell, `regret_exp` = run cost of the engine's mix vs a caller
who knows the hidden truth):**

| level | INPUTS=1 (results only) | INPUTS=3 clean | INPUTS=3 NOISE=0.2 |
|---|---|---|---|
| HS regret / pitch (± game-to-game se) | 0.0205 ± 0.0019 | 0.0229 ± 0.0023 | 0.0205 ± 0.0024 |
| HS runs / game | 3.7 [3,3,5] | 2.7 [1,4,3] | 2.3 [3,2,2] |
| D3 regret / pitch | 0.0162 ± 0.0027 | 0.0175 ± 0.0028 | 0.0160 ± 0.0019 |
| D3 runs / game | 3.3 [1,8,1] | 3.7 [1,3,7] | 6.7 [10,7,3] |
| one pitch ≥90% of mix (not 3-0) | HS 8% / D3 7% | 4% / 12% | 7% / 10% |

Nothing separates: bad logging is **not measurably worse** than clean or results-only logging, and reads are not measurably
better. At this size the detectable difference is about ±0.005 regret/pitch (~0.8 runs/game). The D3 noisy runs gap rests on one
10-run game. Note `NOISE` only acts at INPUTS ≥ 2 (simulate.py:618-620, 887-920): at INPUTS=1 there are no optional entries.
NOISE>0 also draws from the main rng, so games can't be paired. Per-entry sensitivity (`readmove.py`) explains the risk better
than the sims do. One wrong "late"/"opposite" entry moves the at-bat 40-50 points (G2). One wrong "hard" contact (−0.08 confidence)
moves FB 1-1 share 0 points at HS and 1 point at D3, and even three of them (.75→.51) move it ≤4 points. Contact noise is harmless.
Read noise is not.

**Q3 pace (`js/pace.js`, node 22, Xeon 2.1 GHz, CPU time via process.cpuUsage, box load 12-20):**

| arsenal | per-pitch call (table reused) | at-bat solve, warm | first solve (cold JIT) | why + intent (after the call) |
|---|---|---|---|---|
| HS 3-pitch | 1.9 ms (max 6) | 146 ms (max 297) | 534 ms | 7 ms (max 13) |
| D3 3-pitch | 1.7 ms (max 7) | 149 ms (max 247) | 364 ms | 6 ms (max 11) |
| HS 4 / D3 5-pitch | 2.6 / 3.9 ms | 174 / 224 ms | 189 / 298 ms | 10 / 16 ms (max 23) |

Engine data parse + init: 36 ms (3.1 MB JSON). A solve runs once per batter and again mid-at-bat when outs, bases, infield-in, a
confidence or wild-today value (>0.10), the umpire read (>0.20) or tags change (engine.py:3250-3268). Each costs one full solve.
V1.3 tables do not slow the solve: Python `scripts/solvetime.py` HS 0.31 s (3 sweeps) vs 0.48 s (6) on v1.2 tables, D3 0.40 vs 0.42.
**Extrapolation:** the app_v2 Chromium trace put this same at-bat solve at 62-103 ms normal and **385-545 ms with 4× CPU throttle**
("stand-in for an older iPad", docs/BUILD_app_v2_REPORT.md:7-18). Scaling node CPU by 2-4× for an A10/A12 Safari gives a warm
solve of ~0.3-1.2 s. The very first call of a game is ~1-2 s. The pitch-to-pitch call is ~10-30 ms. **So ~2 s holds**, with the first
batter as the edge case. A runner moving or a confidence swing costs one more solve (≤ ~1 s) at the moment the coach needs the call.
Moving the solve off the main thread is already listed as the top perf item (BUILD_app_v2_REPORT.md:213). Not measured on
a real iPad.

**Q4 offline / versions:** read only (no browser run). Service worker update waits for no live game (game-shell.mjs).
Events carry `v.data`. The learner replays all events on the current engine. strike_rate is recomputed live. Gaps: G5, G6.
Reports use stored mixes and results only, with no recompute (web/lib/report_data.ts), so mixed-version seasons don't corrupt them.

**Q5 explainability:** 20 sampled calls (`scripts/why_sample.py`) plus why columns from the 18 sim games. See G3, G7.

**Q6 flags / learner:** flags table in G8. With V1.3, HS fatigue past 60 lowers grade (0.25 / 20 pitches) and speed (0.5 / 10). The
HS middle-target share moves up to 18 points from pc 30 to 110 (0-0: 78% → 60% at pc 80 → 72% at pc 100; `scripts/fatigue_mix.py`).
FB share doesn't move at all (pinned to the floor at 54 / 58 / 33 / 55%). `node app/learn_test.js quick` (learn.js, the old v1 learner, on V1.3 engine_data): sections 1-5 all ok. Command
recovered with location (error 0.13 from 2.0); 15 pitches move a correct grade 0.16 in the calls. The run was cut by the 8-min
timeout in section 6 (`gd/learn_test_quick.txt`). learner.js (v2) was not run: stage2 is the lead's (bar lowered to 65%, ruling 46).

## 4. What would embarrass it in game 1 (ranked)
1. A good-feel slider (8 strikes of 10) turns into 8+ straight sliders, including 3-0 (G1, D1/D3). The other dugout notices.
2. A coach taps "opposite" on one foul and gets an at-bat of 90%+ fastball up-away (G2).
3. The why line says "Game situation: protect the lead" during a run of 100% fastballs, or "He's sitting fastball" on a 2% curveball (G3).
4. "Timed for about 78 mph" on a pitcher with no speeds entered (G7). "Watch" the whole second half of every start (G8).
5. The 9-hole hitter gets pitched exactly like the cleanup hitter (G4). The About screen says engine 1.2.3 (G5).

## 5. Could not verify
- Real iPad timing, Safari JIT, or the Playwright perf trace (box load 12-20; Chromium too heavy here). Numbers are node CPU time
  plus the earlier trace's 4× figure.
- The service-worker update path and the cached-v1.2-to-V1.3 hand-off were read in code, not run (web node_modules not installed).
- The sims are 3 games per cell, too few to detect < ~0.8 runs/game. Their world is the engine's own model plus hidden traits
  (circular for "are calls good"). Real-data quality of cold-start calls can't be checked here (data on the owner's desktop).
- learner.js v2 on V1.3 under noisy logging (stage2, owned by the lead).
- Housekeeping: my first sim launch wrote its CSVs to `/home/claude/pitch-caller/runs/` (relative path). I moved them to
  `/home/claude/audit/gd/runs/` and removed the folder. `git status` in the main checkout is clean, and nothing tracked was touched.
