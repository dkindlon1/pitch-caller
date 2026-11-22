# Hitter v1.3: apply Drew's rulings, assemble the core (Nov 21, 2026, night)

Tell Claude Code: "Read docs/PROMPT_hitter_v13_apply_2026-11-21.md and carry it out."

Follows `docs/DECISIONS_refit_v13.md`, `docs/BUILD_v13_buildout_REPORT.md` and the plan's section 11. Same rules:
- local only; never `main`; nothing ships;
- commit as Claude; push feature branches only;
- nothing called done unless it was run and the output read;
- 2026 held out; archives read-only; data outside git;
- anything you grade is marked proposed.

**Memory:** the last full suite was cut off at ~98% memory. Run heavy jobs **one at a time**: no parallel suites or fits
while `test-app.sh` runs. If memory gets tight, stop and report rather than half-run.

## Drew's rulings (Nov 21, night); record them in `docs/DECISIONS_refit_v13.md` as decided
1. **Pass bar:** Drew's original rule stands.
   - v1.3 must beat **raw v1.2** by more than 2 SE at each level (D2 against the better of v1.2's D1 / D3 settings).
   - Each extra term beyond the count layer (base-out, times through the order, scoring position, late and close,
     in-at-bat, platoon) ships only if it clears 2 SE on 2025 **and** its call changes pass Drew's graded rows.
   - **No fixed 0.002 floor.** Recalibrated v1.2 stays as a reported comparison, not the pass reference.
2. **Zone table approved:** the regenerated draft. Two changes:
   - the plan's trend is carried one level step down for college and two for HS / travel;
   - the sinker-grounder row (P3) comes from Triple-A instead of Single-A (Single-A 1.28× vs AAA / MLB ~1.65×; likely
     labeling).
   - Freeze it with a sha as `data_tables/zone_v13.json`, with a statement-by-statement record of what was approved.
3. **Hanger gate approved** as designed (sheet section 4):
   - the flat +0.5 goes;
   - an off-speed pitch over the heart gets H × min(1, wild_today / 0.30) only when `wild_today > 0`;
   - H is sized by graded rows (HG-1 to HG-4 plus the existing gated and control rows) and stays 0 if the rows pass
     without it.
4. **HS pitch kind × velocity:** build an engine table for HS / travel. It covers swing, whiff and contact by pitch kind
   and velocity, defined exactly as in the +0.010 fit, fed from each pitch's arsenal speed. Both engines, parity-tested.
5. **Ride-up credit:** keep the 36% cap; shrink `ride_up_2k` from 0.008 to 0.003.
6. **R1** is rewritten to its intent: slider at least 30%, no pitch over 60%.
7. **S5** tests the gate's direction: leaning toward the hitter drops the inside sinker to ~0 (≤ 1%, never above the
   base); leaning away raises it 3+ points.
8. **HARD_SD:** the hitter talent SD with luck removed, computed properly the way `talent_spread.py` does it (not the
   ~.070 estimate); restate POWER_HR on it.
9. **Harness landing:** re-freeze it from Single-A before any v1.3 score. Keep the calib-world scores as a side report
   and bump the harness version.
10. **MLB run-value scale:** pin the denominator at v1.2's .481 until college run values exist. After that, college
    levels take no scale from MLB.
11. **Simulator:** split `two_strike` into `two_strike_swing` and `two_strike_foul`, sized from the D1 fits.
12. **HS / travel changed calls:** refresh the list to the full-data refit with rulings 5, 8 and 10 applied.
    - Drew grades only the **arguable** rows and **flagged** rows (e.g. #410, middle at 3-2 halved; #100; #154).
    - Every other row takes its proposed grade.
13. **Coverage rule:** still open. D2 / D3 2025 is still being collected.

## Tasks

### A. Finish the open verification first
Run the full `scripts/test-app.sh` and `scripts/test-sql.sh` on the current `feat/hitter-v13-prework` tip, alone, and
report the results.

### B. Refit branch (`feat/hitter-v13-refit`)
1. Apply rulings 5, 8 and 10.
2. Rewrite R1 and S5 (rulings 6 and 7).
3. Rerun the rule checks that were skipped for memory: fuzz 3000 (better stuff never worse), get-it-over, the 2-for-10
   rule (report only), hard-rule rows and the read-through.
4. Regenerate goldens and the changed-call list.
5. Update the HS / travel section of `docs/DECISIONS_refit_v13.md` (ruling 12): mark the rows Drew must grade, with the
   menus.

### C. Core assembly branch (`feat/hitter-v13-core`, stacked on the refit branch)
Wire into this branch's engine defaults (not `main`):
- the approved zone table (ruling 2) with the flat hanger removed;
- the hanger gate (ruling 3);
- the HS pitch kind × velocity table (ruling 4);
- the provisional count and run candidates for D1 and HS / travel.
D2 / D3 keep v1.2's count numbers until the coverage rule is decided, and are labeled so.

Then:
1. Re-freeze the harness landing (ruling 9) and score raw v1.2, recalibrated v1.2 and the core on 2025 per level, with
   the pass verdict under ruling 1. 2026 is untouched.
2. For each extra term: its 2025 gain with SE, whether it clears 2 SE, and which graded rows its calls touch.
3. Size H on the gated and control rows plus HG-1 to HG-4 (drafted as **proposed** rows for Drew to grade); report the
   smallest passing H, or 0.
4. Run the standing hard checks (hard foul = foul, better stuff never worse, hit hard twice small, no chase at 3-0 / 3-1,
   no-scouting full games) and the 10-point adaptation robustness check. Report the numbers. The current engine moves
   the 2-2 top call 18.6 points; show the core's number.
5. Sims: paired-game runs per game by level vs v1.2. Flag anything over +0.25.
6. Write the changed-call list for the core vs v1.2.3, HS separate. This is the "full regrade after the core" list, but
   say clearly that D2 / D3 will move again once their count layer lands.

### D. Simulator (ruling 11)
Split the trait. With no traits set, games stay byte-identical; the hitter world still recovers each trait.

### E. Coverage
Keep refreshing D2 / D3 2025 coverage and the representativeness check as games arrive (`python -m hitter_data.update`).

## Report
Write `docs/BUILD_v13_core_REPORT.md`, short, covering every task with what was run and the result. Stop points for
Drew:
- the arguable and flagged HS rows;
- HG-1 to HG-4;
- the 35 draft scenarios;
- the core's changed-call list;
- the coverage rule once D2 / D3 lands.

Finish with a three-line summary.
