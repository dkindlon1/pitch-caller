# Build 3: outcome tracking + peak profile: report

Branch `feat/outcome-tracking` (from `feat/opponent-db`, with Build 2's final commits merged in), pushed. Spec:
`docs/PLAN_outcome_tracking_2026-11-18.md`. **No trait goes into the engine and no engine file changed**: drift notes and
findings are read-only views (proved below). Local Supabase only; nothing on `main`, nothing deployed, no production
migration. Working notes: `docs/BUILD3_PROGRESS.md`.

## What was built
- **`app/peak.js`**: one module shared by the game app (inlined by `build.py`) and the site (`web/lib/peak.js`, an
  identical copy; `test-app.sh` checks they match).
  - **Baseline ("his normal")** per pitch: whiffs per swing, strike rate, hard contact per logged ball in play, velocity.
    The newest 5 outings count fully, then 0.8, 0.64 and so on. An outing from another season counts half. Each rate
    starts from a level prior worth 15 observations, so early numbers aren't wild.
  - **Findings**: each pitch × situation (time through the order, pitch count, runners, hitter side, hitter approach)
    × metric, with cells of 8 or more tested against his normal. Benjamini–Hochberg runs across every cell tested in
    that report: "clear" at q 0.05, "early sign" at q 0.2, noise hidden. At most 5 are shown.
  - **One finding per pitch, metric and direction.** When a pitch is off all night, it shows once, with "The same in
    N other situations: most of the outing". A pitch good in one situation and bad in another still gets two findings
    (plan proof 4).
  - **Sentence and chart** for each finding: the metric across that situation's buckets, with his normal as a dashed
    line. The flagged bucket is marked by outline and words, never by colour alone. Faded bars have under 8 and
    aren't tested.
  - **Drift**: tonight, per pitch, against his normal. Details under "Readings" 1.
  - **Archetype**: a plain label from his normal, using only pitches with 30 or more thrown. Examples: "Strike
    thrower, slider for whiffs"; "Effectively wild, pitches to weak contact with the slider".
- **Outing report**: the "Outcome tracking" section replaces Build 1's placeholder. It shows "At his best", the
  findings and the explanation. Staff also see "Drift notes in the game" (each note at the pitch it first fired) in
  the staff section. A pitcher's own report has the findings but never the drift notes.
- **Recap**: season findings against his own season normal, on the season-so-far and final recaps for the coach and
  the pitcher. **Never on a public link.** The final recap computes it live from that season's events; it isn't
  frozen.
- **Profile**: "At his best: …" on the coach's pitcher page and "At your best: …" on the player's home.
- **Game app**: after every pitch, the drift check runs on the device's own history, so it works with no signal. A
  **Notes button in the game bar with a count badge only.** No sound, no vibration, and nothing opens on its own.
  Tapping it lists the notes in plain words. Undo takes a note back off, and a reload works it out again. On a phone,
  the bar gains a second row while the button is there, so nothing overflows.
- **Storage**: migration `20261119010000_outcome_tracking.sql`.
  - Tables: `peak_baselines` and `outcome_findings`.
  - Access: coaches on the team (and staff viewers) read; the report job writes with the service key. Players,
    other teams and signed-out visitors read nothing; nobody signed in writes.
  - The report job (`storeOutcomes`) works every outing out again on each run and writes a row only when it is new or
    has changed. A fix to an earlier game changes his normal for every game after it.

## Commands and results
Full proof run on the final code: `C:/dev/pitch-caller-logs/run_b3_full.sh` (build, a fresh 13-game season seeded through the game app, then everything). Then `run_b3_recheck.sh`: a fresh seed again, because `test-app.sh` and the portal e2es wipe the season. Logs are in `C:/dev/pitch-caller-logs/b3full/`.

| Check | Result |
|---|---|
| **Plan 5.1** Findings on simulated seasons: `app/peak_sim.js` (200 seasons each) | **No planted effect: 0% of seasons with a false "clear"** (target 5% or less), 0.06 false early signs a season. Planted slider-whiff drop the 3rd time through: 25 points over 24 outings flagged clear 68% (+20% early); 15 points over 12 outings, 1% clear (+3% early). The false-alarm targets pass as checks (3/3). Detection is reported as measured. |
| **Plan 5.2** Drift on simulated outings (same script) | **Steady outings: 0.18 false notes per outing** (target under 0.2). Slider whiffs to 8% all night: caught in 28% of outings (median 13 slider swings in); a drop starting at pitch 30: caught in 12%. See "Readings" 1. |
| **Plan 5.3** Every number recomputed by an independent script: `scripts/outcome_check.js --site` | **266/266 agree** (full run; 19 outings, 19 stored rows, 4 season views, 30 pages); **167/167** on the recheck season. It shares no code with `peak.js` / `outcome.ts`: it reads Postgres directly, uses a different p-value (erfc), a different beta CDF (Simpson integration), and step-up BH. It also checks the stored rows match the pages. |
| **Plan 5.4** Situational rule: `app/peak_test.js` | a slider good the 1st time through and bad the 3rd gets two findings, not one; a pitch off all night shows once ("the same in N other situations"). **22/22** |
| **Plan 5.5** Drift notes don't change calls: `app/drift_exact_test.js` | **12/12: 475 pitches identical**, every logged event field for field (the engine's full mix included). The old build (3e4660b, before outcome tracking) vs the new one with the drift check running after every pitch; the new build run twice first for determinism. |
| Game app Notes button: `app/drift_e2e.js` | **7/7**: count badge after a flat slider, nothing opens on its own, no sound or vibration, plain-words note, Undo removes it, a reload works it out again |
| Outcome tables permissions: `supabase/test/outcome_rls_test.js` | **9/9** (the runner's summary says "1 FAIL" because it counts the text "0 FAIL"; rc 0) |
| Build 1's every-number check: `scripts/report_check.js --site` | **23,318/23,318 agree** (recheck). In the full run it stopped on one item: the new outcome keys weren't on its list of known keys. They are now handed to `outcome_check.js`. |
| Build 2 opponents e2e / Build 1 reports e2e | 28/28, 33/33 |
| Web chain: tsc, `npm test`, `next build`, site e2e | all pass |
| SQL tests, each alone | sync 38, client_review 37, sync_auth 9, app_sync_e2e 37, rls_matrix 347, waitlist 22, v12_sessions 11, logging_sync 10, reports_rls 67, opp_rls 26, outcome_rls 9: pass. `review_test` 28/29 (the baseline's known failure). **`v11_kinds_test` fails** "the v1.1 migration runs last" by construction (now naming `20261119010000_outcome_tracking.sql`); same open item as Builds 1 and 2. |
| Portal e2es | shell 43, offline_game 22, portal 30, billing 52, player_admin 24, uploads 33, retention 10: pass. `gameplan_e2e` timed out once in the full run ("element is not stable" on the game setup form, a page this build doesn't touch); **38/38 when run alone** in the recheck. |
| `scripts/test-app.sh` | every suite passes. In the full run it stopped at `peak_sim` because the runner needs counted checks and the script printed none. Fixed (the targets print as checks); `peak_sim` 3/3, `drift_exact_test` 12/12 and `drift_e2e` 7/7 were then run through the same runner. |
| Visual loop: `web/tests/outcome_shots.js` r1-r5, game app shots | all pages 200, no horizontal overflow at 1440 / 1180 / 820 / 390. Shots: `C:/dev/pitch-caller-shots/build3/` |

No engine file changed: `git diff 3e4660b -- app/engine.js app/engine_data.json` is empty.

## Readings and proposals (decisions Drew may want to revisit)
1. **The drift line had to be stricter than the plan's default.** The plan puts the line a quarter of the way from his
   normal toward the bad end. On simulated outings that gave about 0.3 false notes per outing, over the target of under
   1 per 5. Chosen settings:
   - The line sits 35% of the way, measured from the cautious edge of his normal (half a standard error).
   - Tonight's rate is judged with his normal worth 4 pitches.
   - The note needs a 90% chance, more on early looks.

   Result on 200 steady outings: **0.18 false notes per outing.** Detection is modest:
   - A slider whose whiffs fall to 8% all night is caught in 28% of outings (median 13 slider swings in).
   - When the drop starts at pitch 30, it is caught in 12%.

   A looser line catches more but alarms more often; the sweep is in `BUILD3_PROGRESS.md`. **Drew's call:** keep
   "rarely wrong, often silent", or accept about 1 false note in 3 outings for roughly twice the catches.
2. **Archetype wording.** "Effectively wild" shows on the player's own home. That's accurate, but a player may read it
   as a criticism. Suggestion: show players a softer wording ("Misses bats more than he fills the zone"), or show the
   label to staff only.
3. **The level priors are starting points** (typical college rates by pitch kind, in `LEVEL`). They only matter for the
   first few outings of a pitch, but they should be refit on real data once there's a season of it.
4. **Approach (aggressive / patient)** comes from the hitter's scouting tags on each pitch. Most seeded hitters have
   none, so that situation rarely reaches 8. It fills in as Build 2's scouting gets used.
5. **Not built:** the plan's 3.5 gate (a trait reaching the engine). Excluded by the instructions.

## Not verified
- **Real iPad and real games.** Drift and the Notes button are proved in Chromium (desktop and phone sizes) with
  simulated and seeded games. The badge was not looked at on a physical iPad in sunlight.
- **How real pitchers drift.** The simulations plant clean drops. Real nights (fatigue curves, mixed effects) may be
  caught more or less often than the measured rates.
