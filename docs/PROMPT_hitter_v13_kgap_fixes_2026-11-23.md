# Hitter v1.3: K-gap fixes, then finish the full-data run (Nov 23, 2026)

Tell Claude Code: "Read C:/dev/pitch-caller/docs/PROMPT_hitter_v13_kgap_fixes_2026-11-23.md and carry it out."

This follows `docs/KGAP_v13_DIAGNOSIS.md` and `docs/KGAP_v13_TABLE.md` (commit deea124 on `feat/hitter-v13-fulldata`). Work on that branch.

All earlier rules stand:
- local only, never `main`, push feature branches only;
- commit as Claude;
- 2026 untouched;
- archives read-only, game list frozen;
- nothing called done unless it was run and the output read;
- anything you grade is marked **proposed**;
- the count layer stays fixed in recalibration (ruling 5).

**Compute:** this desktop has 64 GB of RAM. Run independent work in parallel across worker processes (about cores minus 2), with the ~48 GB memory guard. Keep every seed fixed so results match a serial run. Don't run two jobs at the same time if they write the same files.

## Drew's rulings (Nov 23). Record them in `docs/DECISIONS_refit_v13.md` as decided.
8. **HS pitch mix: real-range guard.**
   - The HS pitch kind × velocity table stays as fit on real HS data, and HS is calibrated with the table on.
   - The HS engine's fastball share in each count can't go below what the most off-speed-heavy real HS pitchers throw in that count. That floor is the 10th percentile of pitcher-season fastball share in that count, fit seasons only, among pitchers with enough pitches in that count to count (report the minimum you use).
   - Build the floor table from the HS data and wire it into both engines, parity-tested.
   - **College (default, report only):** using Single-A / AAA Statcast pitcher usage as the reference, show how far the college engines' mix sits outside the same real range, and what the same guard would change. Don't wire it for college.
9. **Simulated hitters: center, then calibrate.**
   - Center the hidden hitter traits so the average sim hitter equals the level average. That includes the lineup's built-in off-speed weakness.
   - Calibrate against that same hitter population.
   - Report what centering does to the MLB control, which the diagnosis put at −0.6 below target.
10. **College K: reweight the full games.**
    - Weight full games (by conference / team, or whatever matches best) so their K / BB / HBP match the whole level.
    - Refit the college count layers on the weighted data and keep the real all-games target.
    - If the chained count layer still misses its own data afterwards, report that as a chaining bug and find it.
11. **Zone trend extension and edge called strike: rule later.** After fixes 8–10, re-measure both pieces on the fixed core and report them for Drew's ruling. Don't change either before then.

## Tasks
1. Build fixes 8, 9 and 10, each as its own commit. Give each one a paired sim to size it alone before they're combined, 480 games per level (HS 900), in parallel.
2. Recalibrate with all three in place, moving pitcher-side keys only.
   - If every level's K / BB / HBP lands within 1 point, go on.
   - If any level still misses, stop and report the gap and what's left in the K-gap table.
3. Re-measure the zone trend and edge called-strike pieces on the fixed core (ruling 11).
4. Run what was on hold, on the fixed core:
   - score 2025 per level vs raw v1.2, with the pass verdict (D2 against the better of v1.2's D1 / D3 settings);
   - the candidate terms (gain, SE, clears 2 SE, rows touched);
   - the hanger-gate grid with H = 0 kept;
   - the hard checks, fuzz 3000 and the 10-point robustness check;
   - the 400-game sims per level with SE;
   - the three-way read-through (as built, refit zone table swapped back, flat hanger restored);
   - the suite re-pin table, with `stage2 D5` kept open;
   - goldens and the full changed-call list vs v1.2.3, HS separate. The mix guard will move HS calls, so mark those.
   - Then `scripts/test-app.sh` and `scripts/test-sql.sh`.
5. Leave the Step 6 script locked (`--drew-go`).

## Report
Write `docs/BUILD_v13_fulldata_REPORT.md`, short. It covers:
- each fix's own size and the combined landing per level;
- the HS fastball-floor table;
- the college guard numbers (report only);
- the MLB control after centering;
- the reweighting result;
- the trend / edge re-measure;
- every item from task 4.

Stop points for Drew:
- the trend / edge ruling;
- any level that misses the pass bar;
- the 6 HS rows, HG-1 to HG-4 and the 35 scenarios;
- the changed-call list;
- `stage2 D5`;
- the go for 2026.

Finish with a three-line summary.
