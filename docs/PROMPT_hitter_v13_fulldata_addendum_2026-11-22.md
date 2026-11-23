# Addendum to PROMPT_hitter_v13_fulldata: Drew's rulings after the core report (Nov 22, night)

Tell Claude Code: "Read docs/PROMPT_hitter_v13_fulldata_addendum_2026-11-22.md and apply it to the full-data run."

This follows `docs/BUILD_v13_core_REPORT.md` (core tip f0c326e). Record these in `docs/DECISIONS_refit_v13.md` as decided. They apply inside Tasks C and E of `PROMPT_hitter_v13_fulldata_2026-11-22.md`. The standing rules there still hold: 2026 untouched, heavy jobs one at a time, nothing called done unless it was run.

## Rulings
4. **HS calibration staff matches the data.** The 86/89 mph staff goes.
   - Draw staff fastball speeds from the real HS / travel distribution of pitcher season-average fastball speed, fit seasons only.
   - Claude's numbers from the 2022–25 Perfect Game data: median 78.7 mph, 10th–90th percentile 71.9–85.2. Compute the full distribution from the HS database yourself.
   - Draw off-speed speeds by pitch kind from the data the same way.
   - Then recalibrate HS and rescore it.
5. **Recalibration holds the count layer to the data.**
   - `fit_all.py` moves only pitcher-side keys. The fitted count-layer tables are not changed.
   - If a level's K / BB / HBP can't land within 1 point that way, stop that level and report the gap. Don't bend the count numbers to close it.
   - Before recalibrating, diagnose the edge called-strike gap: the engine gives .324 against a real .630.
     - Say where the .630 comes from.
     - Say which landing or zone piece drives the engine's number.
     - Say what fixing it would change.
     - Report only. Zone numbers are Drew's to rule on.
6. **Sims: 400 paired games per level**, one level at a time, before the +0.25 runs-per-game flag is judged. Report runs per game with SE.
7. **Grading waits for the full-data core.** HG-1 to HG-4, the 6 HS rows and the 35 scenarios are graded once, on the full-data core.
   - Keep H = 0 for now.
   - On the full-data core, report the read-through three ways: as built, with the refit zone table swapped back, and with the flat hanger restored, as the core report did.

## Also
- **The 12 failing suites:** list each one with the old pinned value, the new value, and whether an approved change explains the move.
  - Re-pin only the explained ones.
  - Keep `stage2 D5` (2 of 40 learner seasons switched off, against a limit of 1) as an open item for Drew. Don't re-pin it.
- **Cross-check, Task B step 2:** Claude's numbers come from the 119,021-game snapshot. Compare like-for-like: either run the counts on the snapshot (read-only), or restrict the live archive to the snapshot's games. Fit on the live archive as ruling 2 says.
- **D2 / D3:** the core report traced their failure to shared offsets refit on MLB while they still ran v1.2's count layer. In the full-data run they get their own fitted count layers (ruling 1), so rescore them and say whether that explanation held.

## Report additions
`docs/BUILD_v13_fulldata_REPORT.md` also covers:
- the HS staff distribution used;
- the edge called-strike diagnosis;
- the K / BB / HBP landing per level with the count layer held fixed;
- the 400-game sims;
- the three-way read-through;
- the suite re-pin table.
