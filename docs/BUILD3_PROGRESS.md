# Build 3 progress: outcome tracking + peak profile

Spec: docs/PLAN_outcome_tracking_2026-11-18.md. Branch feat/outcome-tracking (from feat/opponent-db 3e4660b). Worktree C:/dev/pc-b3.

## Done (committed)
1. `app/peak.js` (copied to `web/lib/peak.js`, test-app.sh checks they match): baseline (recency weights, half weight
   across seasons, level prior of 15), findings over tto / pitch count / runners / side / approach with
   Benjamini-Hochberg (clear q 0.05, early sign q 0.2, cells of 8+, at most 5 shown), sentence + chart data, drift
   (8+ of a pitch and of the metric's count; tuned on simulations, see below), drift log, peak archetype.
   `peak_test.js` (unit), `peak_sim.js` (simulated seasons; false-alarm targets pass/fail, detection reported).
2. Pages: outing report "Outcome tracking" section (replaces build 1's placeholder) + drift notes in the staff
   section; recap (season so far and final, coach and pitcher; never on public links) season findings; "At his best"
   on the coach's pitcher page and the player's home. `web/lib/outcome.ts`.
3. Game app: drift check after each pitch from the device's own history; Notes button in the game bar with a count
   badge only (no sound, no pop-up). `drift_exact_test.js` (calls identical before vs with), `drift_e2e.js`.
4. Storage: migration `20261119010000_outcome_tracking.sql` (peak_baselines, outcome_findings; coach read, service
   writes), `storeOutcomes` in the report job. `scripts/outcome_check.js` (independent recomputation).

## Drift tuning (peak_sim.js, 200 outings each)
Plan default line (a quarter of the way to the bad end) gave ~0.3 false notes per outing. Chosen: share 0.35, prior 4,
SE shift 0.5, extra certainty on early looks. Steady outings 0.18 false notes per outing (target < 0.2). Detection is
modest: slider whiffs to 8% all night caught 28%, dropping at pitch 30 caught 12%.

### The sweep (peak_sim.js, 200 outings each; "off all night" = slider whiffs to 8% from the first pitch)
| prior | SE shift | early | share | false notes / outing | caught: off all night | caught: drop at 30 |
|---|---|---|---|---|---|---|
| 8 | 1 | 0 | 0.25 | 0.120 | 17% | 6% |
| 4 | 0.5 | 0.08 | 0.25 | 0.227 | 33% | 16% |
| 2 | 0.5 | 0.08 | 0.25 | 0.307 | 51% | 27% |
| **4** | **0.5** | **0.08** | **0.35** | **0.147-0.180** | **24-28%** | **10-12%** |
| 4 | 0.5 | 0.08 | 0.5 | 0.057 | 12% | 5% |
| 2 | 0 | 0.08 | 0.5 | 0.197 | 33% | 16% |
| 0 | 0 | 0.08 | 0.5 | 0.427 | 56% | 29% |
(bold: chosen; the two figures are the sweep's seed and peak_sim.js's own run)

## Visual loop
r1 (5 findings all "fastball strikes down" across situations) -> one finding per pitch/metric/direction; r2 label over
bars, tiny-sample bars full height -> halo, faded under 8; r3/r4 phone game bar overflow with the Notes button -> the
bar wraps to a second row while the button is there. Shots: `C:/dev/pitch-caller-shots/build3/`.

## Next
- Full run `C:/dev/pitch-caller-logs/run_b3_full.sh` (-> logs/b3full/summary.txt), fill B3_RESULTS in BUILD3_REPORT.md, push.
