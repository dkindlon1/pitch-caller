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
B3_RESULTS

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
