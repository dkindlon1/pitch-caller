# Decision sheet: the v1.3 refit (Nov 21, 2026)

For Drew. Tasks A and C of `docs/PROMPT_hitter_v13_next_2026-11-21.md`. **Every grade and recommendation here is
PROPOSED (Claude). Nothing is decided until you rule.** No engine code, test or number was changed.

**Nov 22 update (ruling 12):** section 2 is refreshed on the full-data refit with rulings 5, 8 and 10 applied
(`feat/hitter-v13-refit`, commit 33fa6cf); it marks the six rows Drew grades. Everything else below is as of Nov 21.

The refit is on `feat/hitter-v13-refit` (numbers commit 1dfc81e; "before" = d14115b). The refit itself is written up in
`docs/REFIT_v13.md` and the moved calls are listed in `docs/REFIT_v13_CHANGED_CALLS.md`, both on that branch.

**How "what moved it" was found.** I made a scratch copy of the refit engine and put one group of refit numbers back to
its old value, then reran the check, one group at a time (about 40 runs, nothing committed). If putting a group back
restores the old result, that group moved it.

## Drew's ruling (Nov 26): DECIDED

Source: `docs/PROMPT_hitter_v13_floor_step_2026-11-26.md` (after Part 8 of `docs/BUILD_v13_fulldata_REPORT.md`, tip
bb63e33 on `feat/hitter-v13-final`).

33. **Fix the HS floor step now, separately from the weight.** (Revises the last sentence of ruling 32: the floor step is
    no longer left as is.) Drew also accepted the D1 K flag (+2.0) as judged by runs (ruling 17 stands) and chose to grade
    the changed calls before the `golden_v13core` re-pin. Applied in report Part 9: when the eligible fastball calls'
    share is above 0 and below the floor, the shortfall is added by the location softmax the share-0 branch already
    used, instead of scaling the existing fastball calls up (W = 32, the floor table, the count layers, the zone table,
    the per-count scalars and the 10-point limit unchanged; no re-pin applied).

## Drew's rulings (Nov 25, night): DECIDED

Source: `docs/PROMPT_hitter_v13_learning_weight_2026-11-25.md` (after Part 5 of `docs/BUILD_v13_fulldata_REPORT.md`).

28. **Weaken the within-game learning term.** The prior weight W in the hitter's belief about the pitcher's mix,
    `(W * p + n_call) / (W + n)` in `solve_sit_game` (W = 4 until now), goes up. Drew's range: about 16 to 32. **Not applied yet:** no W from 8 to 48 passes the check in every cell (report Part 6).
29. **The 10-point robustness limit covers repeated-call anticipation.** The check stays as written
    (`readthrough/hard_checks_v13.py` H13-16, n = 0 to 6 repeats); the model has to meet it.
30. **The ground-ball test is re-pointed** (`tests.py`): rule on >= 70% and the rule adds at least 5 points, replacing
    "rule off < 70%". Proposed grade of the call: Acceptable.
31. **Bisect the 2-2 jump, report only** (default 2-2 move 6.5 on the recalibrated core, 20.8 / 21.7 now).
32. **W = 32, and the cells that still exceed the limit are accepted** (Drew, Nov 25 night, after report Part 6 showed no W from 8 to 48 passes
    every cell). 13 of 100 sweep cells (2-2 and 3-2, 5 levels x 10 arsenals) exceed 10 points at W = 32: 12 by 0 to 7.5 points (mostly at n = 5 or 6)
    and one HS cell (four_cut at 3-2, 30 points) that is a step from the HS fastball floor, not from the learning weight. Applied as
    `LEARN_PRIOR_W = 32` (report Part 7). The floor step is left as is.

## Drew's rulings (Nov 25, evening): DECIDED

Source: `docs/PROMPT_hitter_v13_robustness_2026-11-25.md` (after Part 4 of `docs/BUILD_v13_fulldata_REPORT.md`, tip
5731b39 on `feat/hitter-v13-final`).

25. **D3 walk gap accepted as is.** D3 keeps the fitted count layer with its 4-season half-life. The reference-world walk
    gap stays at **-1.17** points (the frozen-archive run had -0.86); this is an accepted exception to ruling 12. Cause: the
    long half-life leans on 2018-23 D3 data, when D3 walks ran 10.0-10.7% against the 11.4 target. D3 is not retuned.
26. **D1 engine runs treated as noise.** +0.30 +/- 0.22 runs per game against the reference staff (1.4 SE; the frozen run
    had -0.15) is accepted, with no rerun. Drew grades the D1 two-strike rows, including E-4b, as written.
27. **Robustness is diagnosed before any go for 2026.** Report only; no model, limit or check changes in that task
    (report Part 5).

## Drew's rulings (Nov 25, final archive): DECIDED

Source: `docs/PROMPT_hitter_v13_final_archive_2026-11-25.md`. The edge-rulings run is preserved as tag
`frozen-archive-run-2026-11-25` (2cf56d9, `feat/hitter-v13-fulldata`); this work is on `feat/hitter-v13-final`.

20. **The final archive is the single college source**: `C:/Users/kindl/Downloads/college-baseball-final/archive.sqlite3`
    (11,015,741,440 bytes, mtime 2026-11-25 08:40; 251,281 games, 24,224,745 plays, 7,286,803 lineup rows, 413,847 roster
    rows, 432,788 roster_sources rows, 940 schools, 28,745 seasons), opened read-only. The old `college-baseball-data` copy
    and its `derived/` folder are not sources. Undated games take their season from the source URL (`/stats/YYYY/`,
    `/YYYY/`, Presto `/YYYY-YY/`); a game whose season can't be determined is excluded from fit and scoring and counted.
21. **Re-freeze the game list**: college from the final archive, HS unchanged at 21,707 games, the same lock.
22. **The pass bar, the 2025 scoring set and the 2026 holdout are redefined on the final data** (every eligible 2025 game
    in the final archive; 2026 stays held out).
23. **Rulings 16 to 19 stand unchanged.**
24. **All rulings of `PROMPT_hitter_v13_fulldata_2026-11-22.md` (1 to 3) and its addendum still stand.**

## Drew's rulings (Nov 25): DECIDED

Source: `docs/PROMPT_hitter_v13_edge_rulings_2026-11-25.md` (after Part 2 of `docs/BUILD_v13_fulldata_REPORT.md`, tip
1f4c928). Carried out on `feat/hitter-v13-fulldata` (report Part 3). The count layer and the per-count scalars are never
changed.

16. **The floor beats exclusions the engine makes itself** (revises ruling 14). The HS fastball floor is outranked only by
    hard rules: coach bans, hitter-specific damage rules ("mashed"), fatigue or injury limits, and Drew's standing hard
    checks. Exclusions derived from the engine's own pitch values, such as the never-pick window, do not outrank it.
    The classification of each rule is listed below, **proposed**, for Drew to check.
17. **Judge the calling edge by runs and graded rows.** The reference-world gate stays (it passed). For engine-called sims,
    report K, BB, HBP and runs per game against a paired staff throwing the reference mix (same hitters, same seeds), per
    level, with SE. The edge is accepted at a level when engine-called runs per game are not higher than the reference
    staff's **and** Drew passes the two-strike graded rows behind it. Draft those rows (the two-strike situations that
    contribute most to the K and BB edge, with call menus and **proposed** grades). Keep the +1.5 K flag in the report.
18. **Trend extension and edge called strike stay as they are.** The edge called strike stays mean-preserved (setting it to
    the real rate contradicts each level's own called-strike data). The trend extension stays as approved; the three-way
    read-through can still reverse it.
19. **Command:** each level's reference-world zone rate (`command_targets_v13.json`), as proposed in Part 2. The zone-rate
    gap is reported, not a gate.

### Ruling 16: how each rule is classified (PROPOSED, Claude; Drew checks the split)

| rule (where) | what it removes | class | vs the floor |
|---|---|---|---|
| shake-off / coach's "not that pitch" (`allowed_calls`, `shaken_names`; twice = `hard_shaken`) | the pitch, every spot | **hard** (coach ban) | outranks: a shaken-off fastball is never brought back |
| confidence cutoff and band (`candidates`, `band_weight`) | a pitch he doesn't trust today (feel / logged results) | **hard** (pitcher's state today, an input, not a pitch value) | outranks |
| not landing today (`LAND_BLOCK_*`, `not_landing`) | a pitch missing today, when behind or on 0-0 | **hard** (named coach rule, Nov 11) | outranks |
| no chase at 3-0 / 3-1, zone at 2-2 (`targets`, `NO_CHASE`) | the chase target | **hard** (coach rules A1 / A2 / A3) | outranks: the floor never adds a chase there |
| mashed (`mashed`, `MASHED_PENALTY`) | a pitch type's target height he hit hard twice today | **hard** (hitter-specific damage rule). In the costs it is a penalty, so for the floor it is now an explicit block (`fb_names().block`) | outranks: a mashed fastball spot is never raised or brought back |
| fatigue / injury limits | none exist as exclusions: fatigue lowers speed and grade inside the costs (`LEVEL.fatigue`, the app's fatigue point); injury is the app's "mark changed" (history weight) | **hard if one is added**; nothing to apply now | – |
| Drew's standing hard checks (`readthrough/hard_checks_v13.py`: hard foul = foul, hit hard once / twice, no chase 3-0 / 3-1, no scouting, robustness) | checks, not exclusions; "hit hard twice" is the mashed rule, "no chase" is `targets` | **hard** (via the rules above) | rerun on every change (task 4) |
| pitch-type never-pick window and its taper (`policy_from_costs`, `windows`, `TAPER`) | a pitch whose best cost is 0.030 × run scale × stakes behind | **model-made** | **the floor outranks it**: the fastball comes back at the floor |
| location window (`LOC_WINDOW`) | spots far behind that pitch's best spot | model-made | chooses WHICH fastball spot gets the floor's share; doesn't keep the fastball out |
| tie-break (`tie_break`), the 0.5% display cut (`call_v08` keep_n) | small shifts / tiny shares | model-made | the floor applies after both |
| soft coaching credits (ground-ball rule, late_fb, squared_up, …) | nothing (cost terms) | not exclusions | – |
| the coach's own pitch in the sims (`OVERRIDE`, 0 in these sims) | – | coach's call (ruling 14 floors it; unchanged) | – |

## Drew's rulings (Nov 24): DECIDED

Source: `docs/PROMPT_hitter_v13_meanpreserve_2026-11-24.md` (after `docs/BUILD_v13_fulldata_REPORT.md` and
`docs/KGAP_v13_TABLE_fixed.md`, commit 52be85b). Carried out on `feat/hitter-v13-fulldata` (report Part 2). The fitted
count layer is never changed.

12. **Per-count mean preservation (plan 3.2, enforced exactly).** Replaces chasing K with pitcher-side keys.
    - Per level and count, per-outcome scalars (swing, whiff | swing, foul | contact, called strike | take, in play) on the
      zone table and pitch-kind effects (and the HS velocity table), set so that under the **reference world** (the real
      pitch mix by count + the average-pitcher landing model, harness h3; HS: the real HS mix from the HS data; college /
      MLB: the reference mix the count layer is calibrated to) the world reproduces the fitted count layer's rates exactly.
    - Computed, not tuned; stored in a table with a sha, wired into both engines, parity-tested.
    - Relative effects between zones, kinds and speeds unchanged; only their per-count level is pinned to the data.
    - Pitcher-side keys then fit BB, HBP and command only.
    - **Gate:** under the reference world each level's K / BB / HBP lands within 1 point of target, or stop and report.
    - The K target counts sacrifices, intentional walks and interference the same way the chain does (the ~0.4 college piece).
13. **Calling-edge limit.** In engine-called sims, K above target is the engine's calling edge: reported per level with SE;
    above **+1.5 points**, stop for Drew's review of the graded rows that drive it. BB / HBP in engine-called sims must still
    land within 1 point, or that is reported.
14. **Fastball floor vs never-pick.** The never-pick window and every other safety / hitter rule outrank the HS fastball
    floor; the floor applies only among allowed pitches. In sims it is applied after shake-offs and coach overrides too, so
    the thrown share meets it where allowed.
15. **HS keeps the floor**; it does not move to the real HS pitch mix.

## Drew's rulings (Nov 23): DECIDED

Source: `docs/PROMPT_hitter_v13_kgap_fixes_2026-11-23.md` (after `docs/KGAP_v13_DIAGNOSIS.md`, commit deea124). Carried
out on `feat/hitter-v13-fulldata` (`docs/BUILD_v13_fulldata_REPORT.md`). The count layer stays fixed in recalibration
(addendum ruling 5).

8. **HS pitch mix: real-range guard.**
   - The HS pitch kind × velocity table stays as fit on real HS data, and HS is calibrated with the table on.
   - The HS engine's fastball share in each count can't go below what the most off-speed-heavy real HS pitchers throw in
     that count: the 10th percentile of pitcher-season fastball share in that count, fit seasons only, among pitchers with
     enough pitches in that count to count (the minimum used is reported).
   - The floor table is built from the HS data and wired into both engines, parity-tested.
   - **College (default, report only):** with Single-A / AAA Statcast pitcher usage as the reference, show how far the
     college engines' mix sits outside the same real range and what the same guard would change. Not wired for college.
9. **Simulated hitters: center, then calibrate.**
   - The hidden hitter traits are centered so the average sim hitter equals the level average, including the lineup's
     built-in off-speed weakness.
   - Calibration runs against that same hitter population.
   - Report what centering does to the MLB control (the diagnosis put it at −0.6 below target).
10. **College K: reweight the full games.**
    - Full games are weighted (by conference / team, or whatever matches best) so their K / BB / HBP match the whole level.
    - The college count layers are refit on the weighted data; the real all-games target stays.
    - If the chained count layer still misses its own data afterwards, that is reported as a chaining bug and found.
11. **Zone trend extension and edge called strike: ruled later.** After fixes 8–10, both pieces are re-measured on the
    fixed core and reported for Drew's ruling. Neither changes before then.

## Drew's rulings (Nov 22, late): DECIDED

Context: after the pitcher-side-only recalibration (commit 99b22fb) K lands high at every non-MLB level (D1 +2.4, D2 +2.3,
D3 +2.5, HS +6.9 points; BB / HBP within 1). These rulings set what happens next. Carried out in
`docs/KGAP_v13_DIAGNOSIS.md` (feat/hitter-v13-fulldata).

1. **K gap: diagnose first, no tuning.** Nothing gets wired; report only. For D1, D2, D3 and HS (MLB as the control),
   measure how much of the strikeout gap each piece explains, as a K change with SE, in one table:
   - a. **Per-pitch rates vs count mix.** In sims: per-count swing / whiff / foul / called strike / in play against the
     fitted count layer, plus the share of PAs reaching two strikes and pitches per PA against real. Does the extra K come
     from per-pitch rates or from reaching two strikes more often?
   - b. **Engine-chosen spots.** K when the engine's chosen locations are swapped for the average-pitcher landing mix the
     count layer is normalized to. Also check that the zone table averages back to the count layer over the landing mix
     the sims actually use. This splits the "calling advantage" from model error.
   - c. **Zone trend.** K with the college / HS trend extension turned off (Single-A shape as is).
   - d. **HS only.** K with the velocity table off, and with the whole staff at the median speed.
   - e. **Edge called strike.** Engine vs real on the inner and outer half of the edge (real .922 / .410), and K with the
     engine's edge called strike set to real, as a diagnostic run only.
   - f. **v1.2.** Which settings v1.2's recalibration moved to land K, for comparison.
   - Enough games per run for a K SE of about 0.3 points. One heavy job at a time.
   - Then stop and report, with a proposed fix marked PROPOSED. Don't wire it.
2. **Hold** the 400-game sims, the three-way read-through, the suite re-pin table and the D2 / D3 rescore until Drew rules
   on the fix.
3. **The edge called-strike ruling waits for this diagnosis.**
4. **(Nov 23) Size any adaptation fix from real data.** If the probes confirm the gap is pitch choice against a hitter who
   never adapts, the PROPOSED fix is sized from data, not by tuning K: measure how whiff per swing on a pitch kind falls
   as it becomes more predictable (its usage share in that count, for that pitcher). HS / travel pitch-type data for HS;
   Statcast (Single-A / AAA) for college. Compare within each pitcher where possible, so good-slider pitchers throwing
   more sliders don't mask the effect. Report the size with SE beside the proposed fix. Still report only; nothing wired.
   (Tool: `hitter_data/kgap_predict.py`.)
5. **(Nov 23) Parallel runs replace "one heavy job at a time".**
   - The desktop has 24 cores and 64 GB. Independent games and bootstrap replicas run across worker processes, up to
     cores − 2, and no worker is added above about 48 GB used.
   - Every game keeps its fixed seed, so results are byte-identical to a serial run (proved on a small batch).
   - Two fits or suites that write the same files never run at once.
   - Nothing uses the GPU.

## Drew's rulings (Nov 22, night, addendum): DECIDED

Source: `docs/PROMPT_hitter_v13_fulldata_addendum_2026-11-22.md` (after `docs/BUILD_v13_core_REPORT.md`, core tip f0c326e).
Applied inside Tasks C and E of the full-data run.

4. **HS calibration staff matches the data.** The 86 / 89 mph staff goes. Staff fastball speeds are drawn from the real
   HS / travel distribution of pitcher season-average fastball speed (fit seasons only); off-speed speeds by pitch kind
   the same way. Then HS is recalibrated and rescored.
5. **Recalibration holds the count layer to the data.** `fit_all.py` moves only pitcher-side keys; the fitted count-layer
   tables are not changed. A level whose K / BB / HBP can't land within 1 point that way stops and its gap is reported;
   the count numbers are not bent to close it. Before recalibrating, the edge called-strike gap (engine .324 vs real
   .630) is diagnosed: where .630 comes from, which landing or zone piece drives the engine's number, what fixing it would
   change. Report only: zone numbers are Drew's.
6. **Sims: 400 paired games per level**, one level at a time, before the +0.25 runs-per-game flag is judged; runs per game
   with SE.
7. **Grading waits for the full-data core.** HG-1 to HG-4, the 6 HS rows and the 35 scenarios are graded once, on the
   full-data core. H stays 0 for now. The read-through is reported three ways on the full-data core: as built, with the
   refit zone table swapped back, and with the flat hanger restored.
- **Also:** the failing suites are listed with old pinned value, new value and whether an approved change explains the
  move; only explained ones are re-pinned; `stage2 D5` stays open for Drew. The cross-check is like-for-like on the
  snapshot's games. D2 / D3 are rescored with their own count layers and the core report's explanation is checked.
- **Clarified by Drew (Nov 22, night):** ruling 10 means college levels whose run values are fit on their own
  play-by-play take no scale from MLB at all; the .481 pin applies only until those values exist. The live archive keeps
  growing, so the full-data fit's game-id list is frozen and recorded.
  Recorded: `C:/dev/pitchiq-data/freeze/manifest_2026-11-22_2134.json` (per level-season hashes, sha256
  d2c143db8faacfa9) and the explicit list `game_ids_2026-11-22_2134.json.gz` (131,581 canonical college games, 21,707
  HS; it hashes to the lock). Archive at last ingest 137,692 games; `hitter_data.update` refuses to pull while frozen.

## Drew's rulings (Nov 22): DECIDED

Source: `docs/PROMPT_hitter_v13_fulldata_2026-11-22.md`. Carried out on `feat/hitter-v13-fulldata`
(`docs/BUILD_v13_fulldata_REPORT.md`). These supersede the Nov 21 rulings below wherever they differ.

1. **Coverage rule: the 50% full-game share rule is dropped** (supersedes Nov 21 ruling 13).
   - D2 and D3 get fitted count layers using `borrow` (and `shared` + offset in the level-split check).
   - Their full games must pass the full-vs-rest check: K, BB and HBP per PA within 1 point of the level's other
     games (the plan's default threshold), with game-clustered SEs reported.
   - The pass bar decides: a level that doesn't beat raw v1.2 by more than 2 SE on 2025 keeps v1.2's count numbers,
     labelled as such.
2. **Data copy:** for each archive, the copy holding more games, opened read-only.
   - College: the live ChatGPT archive (122,767 games at the Nov 22 14:10 check; 123,110 later) over the packaged
     snapshot `Downloads/college-baseball-data/archive.sqlite3` (119,021 games, 11,460,098 plays). The snapshot is a
     strict subset of the live archive with identical digests. Its `derived/` folder is not a source.
   - HS / travel: the live DiamondKast archive. `Downloads/DiamondKast_2022-2026.zip` holds the same export (identical
     CSVs, 21,707 games); the live folder has 21,712 scorecards.
   - The cross-check against Claude's independent numbers is compared like-for-like on the snapshot's 119,021 games
     (Drew, Nov 22); fits use the live archive.
3. The Nov 21 rulings (pass bar, zone table, hanger gate, HS kind x velocity, ride-up 0.003, R1 / S5, HARD_SD,
   harness landing, MLB run-value scale, simulator split, HS changed calls) all stand. **Ruling 10 now takes effect:**
   once college run values are fit on the full data, college levels take no scale from MLB.

## Drew's rulings (Nov 21, night): DECIDED

These supersede the PROPOSED recommendations below wherever they differ (source:
`docs/PROMPT_hitter_v13_apply_2026-11-21.md`).

1. **Pass bar: Drew's original rule stands.** v1.3 must beat **raw v1.2** by more than 2 SE at each level (D2 against
   the better of v1.2's D1 / D3 settings). Each extra term beyond the count layer (base-out, times through the order,
   scoring position, late and close, in-at-bat, platoon) ships only if it clears 2 SE on 2025 **and** its call changes
   pass Drew's graded rows. **No fixed 0.002 floor** (the proposal below is not adopted). Recalibrated v1.2 stays as a
   reported comparison, not the pass reference.
2. **Zone table approved:** the regenerated draft (`docs/ZONE_TABLE_DRAFT_v13.md`), with two changes: the plan's trend
   is carried one level step down for college and two for HS / travel; the sinker-grounder row (P3) comes from Triple-A
   instead of Single-A (Single-A 1.28× vs AAA / MLB ~1.65×; likely labeling). Frozen with a sha as
   `data_tables/zone_v13.json`, with a statement-by-statement record of what was approved.
3. **Hanger gate approved as designed (section 4):** the flat +0.5 goes; an off-speed pitch over the heart gets
   H × min(1, wild_today / 0.30) only when `wild_today > 0`; H is sized by graded rows (HG-1 to HG-4 plus the existing
   gated and control rows) and stays 0 if the rows pass without it.
4. **HS pitch kind × velocity:** an engine table for HS / travel covering swing, whiff and contact by pitch kind and
   velocity, defined exactly as in the +0.010 fit, fed from each pitch's arsenal speed. Both engines, parity-tested.
5. **Ride-up credit:** keep the 36% cap; `ride_up_2k` 0.008 → 0.003 (Q4 option 1).
6. **R1** rewritten to its intent: slider at least 30%, no pitch over 60% (option 2).
7. **S5** tests the gate's direction: leaning toward the hitter drops the inside sinker to ~0 (≤ 1%, never above the
   base); leaning away raises it 3+ points (option 2).
8. **HARD_SD:** the hitter talent SD with luck removed, computed properly the way `talent_spread.py` does it (not the
   ~.070 estimate); POWER_HR restated on it.
9. **Harness landing:** re-frozen from Single-A before any v1.3 score. Calib-world scores kept as a side report;
   harness version bumped.
10. **MLB run-value scale:** the denominator pinned at v1.2's .481 until college run values exist. After that, college
    levels take no scale from MLB.
11. **Simulator:** `two_strike` split into `two_strike_swing` and `two_strike_foul`, sized from the D1 fits.
12. **HS / travel changed calls:** the list is refreshed to the full-data refit with rulings 5, 8 and 10 applied. Drew
    grades only the **arguable** and **flagged** rows (e.g. #410, middle at 3-2 halved; #100; #154); every other row
    takes its proposed grade.
13. **Coverage rule:** still open; D2 / D3 2025 is still being collected.

Not ruled on and left as stated below: R12 (state it, don't refit).

## Your rulings at a glance (all PROPOSED; see the decided list above)

| Item | Recommendation |
|---|---|
| R1 mixing (1-2, runner on 3rd) | **Rewrite the limit to its intent:** slider at least 30%, no pitch over 60%. Stop chasing a points gap. |
| Q4 riding fastball up, two strikes | **Keep the 36% cap. Shrink the coach credit from 0.008 to 0.003.** The refit data now does most of that work. |
| S5 sinker lean gate | **Test the gate's direction, not a 3-point drop.** S5 is switched off anyway. |
| 25 HS / travel calls | 20 acceptable, 5 arguable, 0 not acceptable. Only 2 got a worse grade, and in both the menu barely moved. *(Nov 21, first refit; superseded by the refreshed section 2: 16 rows, Drew grades 6.)* |
| HARD_SD | Use the talent spread with luck taken out (about .070), the same rule as pitchers' grades. |
| 0.002 minimum effect | Adopt it. |
| Re-freeze harness landing from Single-A | Yes, before any v1.3 score exists, and report the old world alongside. |
| R12 (2026 in v1.2's targets) | State it; don't refit. The pass/fail reference doesn't carry it. |
| MLB run values shrinking every level 3.8% | Pin the scale to v1.2's MLB base now. College levels stop using MLB's scale once college run values exist. |
| Hanger | Gate the penalty on "not landing today," up to +0.5 at full strength. Size it by the landing rows (section 4). |

---

## 1. The three broken limits

### R1 mixing: 1-2, runner on 3rd, 1 out, after a fastball up-in (`tests.py`)

- **What it checks.** The call mixes and doesn't script, and the slider stays within 6 points of the top pitch.
- **Who set it, and when.**
  - It began as one of v0.2's eight philosophy checks, "mix, don't script," and then said "mostly slider (50%+)".
  - Nov 10, you, v1.0 Step 2: slider on top, nothing at 95% (`BUILD_v1.0_REPORT.md`).
  - v1.1 Step 2: slider within 5 points (`BUILD_v1.1_REPORT.md`).
  - Nov 13, you, v1.1 Q4: within 6 points, to make room for the ride-up credit (comment in `tests.py`).
  - So it has moved three times, each time following the engine.
- **Before → after.** Fastball 40.7 / slider 35.1 / changeup 24.1 (a 5.6-point gap) → **42.5 / 35.5 / 22.0 (a 7.0-point gap)**.
- **What moved it.** Several fitted terms, each worth about a point. No single culprit.

  | Put back | Gap |
  |---|---|
  | shape-by-pitch-type terms (`PT_C`) | 5.7 (the only one that passes alone) |
  | eye-level terms (`beta_E`, `beta_E_S`) | 6.2 |
  | grounders by pitch height (`beta_y`) | 6.3 |
  | tunneling | 6.4 |
  | all the sequence fits (`fit_v08.json`) | 4.7 |
  | ride-up credit at 0 | 6.7 |

- **Does the data support it?** Yes. Each term is a fit on about 5.5M pitches with a tight error bar (eye level ±.017,
  height ±.04, tunneling ±.015). The data says that after a fastball up, staying at his eye level keeps working, and that
  changing his eye level draws fewer chases than v1.2 assumed. That favors the fastball a little.
- **Options.**
  1. Keep 6 points and force the engine: put `PT_C` back. That throws away fitted data to pass a gap test.
  2. **Rewrite the limit to what it always meant:** slider is a real part of the mix (at least 30%) and nothing is
     scripted (no pitch over 60%). It passes today and passed before.
  3. Widen to 8 points: a fourth move of the same kind.
- **Recommendation: option 2 (PROPOSED).**

### Q4: the riding four-seam up with two strikes, at most 36% of two-strike calls (`tests_v11.py`)

- **What it checks.** The ride-up coach credit makes the high riding fastball a strikeout pitch, but the engine
  doesn't lean on it. It's capped at 36% on every grid arsenal.
- **Who set it, and when.**
  - Nov 13, you, v1.1 Step 4: "strikeout pitch, small credit, don't lean on it." The credit got the smallest size that
    passed row C5, which was 0.008.
  - The cap was proposed at 36% college and 45% HS (`BUILD_v1.1_REPORT.md`, "Q4").
  - Nov 13, you, v1.2 Q5: the credit is scaled ×0.6 at HS, so the cap became 36% everywhere (`PLAN_v1.2_2026-11-13.md`;
    `BUILD_v1.2_REPORT.md`: HS 34.7, D3 35.1, D1 28.4).
- **Before → after (worst case).** HS 34.7 → **41.4**, D3 35.1 → **42.5**, D1 28.4 → 33.6. The worst case is 0-2 on
  the power arsenal.
- **What moved it.** The data now values the high riding fastball on its own. On top of that, the credit is still sized
  for an engine that undervalued it. Putting one group back at a time:

  | Put back | HS | D3 |
  |---|---|---|
  | riding fastball whiff by location (`PT_FBZ_W`) | 38.6 | 36.0 |
  | eye level | 36.8 | 40.0 |
  | grounders by height (`beta_y`) | 39.4 | 41.8 |
  | level calibration (`outcome_params.py`) | 38.5 | 42.7 |
  | the ride-up credit set to 0 | 27.0 | 22.3 |

- **Does the data support it?** Yes, on three counts.
  - The refit says riding fastballs up miss more bats relative to down: the up-vs-down gap went from -0.32 to -0.15.
  - Pitches up get far fewer grounders: `beta_y` went from -0.36 to -0.62.
  - The zone seed agrees (`ZONE_TABLE_DRAFT_v13.md`, B1). A high fastball put in play is a pop-up **1.63×** as often
    (MLB 1.71×), where v1.2 had 1.26×.
- **What does the credit still need to do?** Row C5 is why the credit exists. On the refit engine, C5 passes with no
  credit at all: 76% acceptable against a 70% bar (before the refit it was 50%). I ran the full read-through (98 rows) at
  each size:

  | Credit | Q4 worst (HS / D3 / D1) | C5 acceptable | E7 | S7f (climb-the-ladder floor) | Rows passing |
  |---|---|---|---|---|---|
  | 0.008 (today) | 41.4 / 42.5 / 33.6 | 96% | **fail** 65% | pass | 94/98 |
  | 0.006 | | 91% | **fail** 69.8% | pass | 94/98 |
  | 0.005 | 33.0 / 31.5 / 25.6 | 87% | pass 72% | pass | 95/98 |
  | **0.003** | **30.5 / 27.5 / 23.0** | **78%** | **pass 77%** | **pass** | **95/98** |
  | 0 | 27.0 / 22.3 / 19.3 | 76% | pass | **fail** (fastball chase 0.2% < 5%) | 94/98 |

  At 95/98, only the old P2, P3 and P7 still fail.
- **Options.**
  1. **Keep 36%. Re-size the credit by the rule you used in v1.1, the smallest size that passes every graded row: 0.003.**
     That also fixes E7, the one scenario row the refit broke.
  2. Keep 36% and use 0.005: a bigger coach nudge, still under the cap.
  3. Raise the cap to 43% and keep 0.008. E7 stays failed.
- **Recommendation: option 1 (PROPOSED).** The credit was sized to make up for an engine that undervalued the high
  fastball. The data now does most of that.

### S5: the sinker lean gate (`tests_v12.py`)

- **What it checks.** On S5's fire row (1-2, opposite-side hitter, front-door sinker), the sinker inside should:
  - drop by 3+ points when it leans toward the hitter (the hit-batter cost);
  - rise when it leans away.
- **Who set it, and when.**
  - v1.2 plan L7 (Nov 13): re-gate S5 by the lean (`PLAN_v1.2_2026-11-13.md` 2.7). It measured 6.7% → 0% toward and
    13.7% away (`BUILD_v1.2_REPORT.md`).
  - Nov 13 evening, you: **S5 dropped to size 0**, code kept. The test now checks only the gate's logic, at a test size
    of 0.004.
- **Before → after.** Base 6.7%, toward 0.0%, away 13.7% → **base 1.0%**, toward 0.0%, away 12.1%. The gate still works
  in both directions. The base is just too small to drop 3 points from.
- **What moved it.** The sinker's inside lane against opposite-side hitters (`PT_FBL_H`, inside / opposite). It went from
  no effect (0) to **+0.32 hard contact**. Putting it back alone gives a base of 9.2%. The MLB run tables (base back to
  3.4%) and the platoon terms (2.5%) add a little.
- **Does the data support it?** Yes. The pooled fit (MLB + AAA + A) says a run sinker inside to an opposite-side hitter
  gets hit clearly harder. So fewer front-door sinkers is the data talking, not a bug. Live calls are unaffected because
  S5 is off.
- **Options.**
  1. Keep the 3-point drop and put the inside lane back to 0. That goes against the data.
  2. **Test the direction:** leaning toward him drops the sinker inside to about 0 (at most 1%, and never above the base),
     and leaning away raises it by 3+ points.
  3. Delete the check, since S5 is off.
- **Recommendation: option 2 (PROPOSED).** It keeps the gate's code honest for the day S5 comes back.

---

## 2. HS / travel changed calls, refreshed (ruling 12): full-data refit + rulings 5, 8 and 10

**Refreshed Nov 22** on `feat/hitter-v13-refit` (rulings applied in commit 33fa6cf; list
`docs/REFIT_v13_CHANGED_CALLS.md`, golden_v123 -> golden_v13refit). It replaces the 25-row table of Nov 21, which was
on the first refit. **Every grade below is PROPOSED.** Under ruling 12, Drew grades only the rows marked **Drew
grades**; every other row takes its proposed grade.

**Read this first.** The golden list's "call" is the **middle draw of the menu** (the engine sorts its menu and the test
takes the call at the 50% mark). When two spots are near-tied, a 1-point shift swaps the call shown even though the menu
barely moved. So each row shows the top of the menu (golden dist), and the grade is on the menu. Grading words and
rules are the read-through's (`readthrough/scenarios_v12.json`): 0-0 B1 (B8: a curve not landing at 0-0 is arguable),
1-0 B3, 2-0 D5/F3, 3-0 and 3-1 A1/A2 (hard rule), 2-2 A3 (hard rule), 0-2 C1, 1-2 C3, 3-2 C7/C8, a runner on 3rd with
fewer than 2 outs D2.

**How "why it moved" was found (lighter than Nov 21).** For the 14 rows that also moved in the earlier refit lists, the
Nov 21 swap-back reason stands (shown in brief). For the change from the previous full-data list to this one, I
recomputed every HS case on the current Python engine with one ruling put back at a time (ride_up_2k 0.008; run-scale
denominator = the refit MLB RE[0|000] .503; POWER_HR 0.172 with the previous hitter_spread_params), then all three
(= the previous full-data refit, which reproduces its golden). Scratch script, nothing committed.

**What changed vs the earlier lists.**
- **16 HS / travel rows move now** (7 hs, 9 travel) vs v1.2.3; the previous full-data list had 23, the Nov 21 table 25.
- **Of the Nov 21 table's 25 rows, 11 no longer move:** #4, 100, 186, 238, 336, 366, 464 (already dropped by the
  full-data refit) and **#46, 202, 222, 360** (back to v1.2.3's call with the rulings: 46, 222 and 360 by the run-scale
  pin, ruling 10, alone; 202 by the three together). **14 still move:** #58, 92, 138, 154, 182, 264, 266, 314, 320, 338,
  358, 410, 476, 478.
- **New vs the Nov 21 table: 2 rows**, #246 (new in the full-data refit; its shown call changed again with ruling 10)
  and **#460** (new now: the ride-up shrink, ruling 5, moved it; putting 0.008 back restores v1.2.3's call).
- The full-data list's other new rows (#42, 206, 298, 456) are back to v1.2.3's call: the run-scale pin alone restores
  each one.
- Ruling 8 (HARD_SD / POWER_HR) moves no HS shown call: the power effect is zero at power grade 3, and only #460 carries
  a contact grade off 3.
- **#100 no longer moves**, so its flag is dropped. **#410 still moves** and keeps its flag; **#154** keeps its flag.

**Tally (PROPOSED): 16 rows. Drew grades 6** (3 arguable: #92, 154, 476; 3 flagged: #410 kept, #246 and #460 new).
**10 rows take their proposed grade (Acceptable) under ruling 12.** No row is proposed Not acceptable.

| # | Situation | Before (v1.2.3): shown call (menu top) | After: shown call (menu top) | Why it moved | Grade (PROPOSED) |
|---|---|---|---|---|---|
| 58 | HS 3-0, 0 out, runner 3rd, down 2; cutter command 1, slider landing 1/13 | FB down-in 20% (FB middle 25, up-in 25) | FB middle 23% (up-in 27, middle 23, down-in 21) | Level calibration and run values (Nov 21); unchanged by the rulings | Acceptable (A1: FB zone at 3-0). Takes its proposed grade (ruling 12) |
| 92 | travel 0-0, 2 out, runner 2nd, pitch 118; FC g5, curve landing 3/14; he has hit the FB hard | FB down-away 7% (curve-heavy, top 12%) | CB chase 7% (same menu within 1 point; curve 60% before and after) | Sequence fits (Nov 21); unchanged by the rulings | **Arguable. Drew grades** (see below) |
| 138 | travel 2-0, bases loaded, 1 out, disciplined hitter; 4 pitches | SL down-middle 17% (four off-speed strikes ~17 each) | SL middle 17% (SL down-middle 18, CB down-middle 17) | Several small together (Nov 21); unchanged by the rulings | Acceptable (off-speed strikes; the curve's corner dropped out, good with bases loaded). Takes its proposed grade (ruling 12) |
| 154 | HS 3-0, bases loaded, 2 out; FB landing 4/10, SL 3/11, changeup command 1 | CH up-in 20% (FB middle 30, CH up-in 20, CH up-away 20) | CH up-away 18% (FB middle 29, CH up-in 20, CH up-away 18) | Sequence fits (Nov 21); unchanged by the rulings | **Arguable, flagged. Drew grades** (see below) |
| 182 | HS 1-2, empty, pitch 116; SL g5, CH g5 (curve and changeup landing 3/13) | SL down-away 14% (CH down-away 33, CH up-away 16) | CH up-away 17% (CH down-away 34, CH up-away 17, SL down-away 15) | Same menu. Level calibration or `PT_C` (Nov 21) | Acceptable (anything at 1-2). Takes its proposed grade (ruling 12) |
| 246 | travel 0-0, 2 out, runner 3rd, up 4; FB g1 command 5 (72), curve g1 command 4; he has hit the FB hard (+0.72 over 21 looks) | CB chase 8% (CB down-away 12, FB up-in 11, CB down-in 10) | FB down-away 9% (CB down-away 14, FB up-in 14, FB chase 10, FB up-away 10) | Near-tied spots. The refit raised the fastball share (52% -> 60%); ruling 10 then swapped the shown spot (put back alone: CB down-in, the previous list's call) | **Flagged (new). Drew grades** (see below) |
| 264 | HS 0-2, bases loaded, 2 out; everything landing so-so | FB down-away 13% (CH middle 16, CH down-middle 15) | CH down-middle 12% (CH down-away 13, CH chase 13, CH middle 12) | Eye level; shape whiff `PT_B` (Nov 21) | Acceptable (C1: middle went down and chase went up). Takes its proposed grade (ruling 12) |
| 266 | travel 0-1, runner 3rd, 0 out; sinker g5 command 1, slider g1 landing 4/10 | SL down-away 17% (SI down-away 21, SI down-middle 17) | SL down-middle 18% (SL down-away 20, SI down-away 20, SL down-middle 18) | Several small together (Nov 21) | Acceptable (D2: down with a runner on 3rd). Note: the grade-1 slider's share rose 32% -> 39%. Takes its proposed grade (ruling 12) |
| 314 | HS 1-2, 1st & 3rd, 2 out; he's late on the sinker | SI up-away 26% (SI middle 42) | SI down-away 20% (SI middle 47, down-away 20, down-middle 18) | Level calibration plus shape terms (Nov 21) | Acceptable (C3). Takes its proposed grade (ruling 12) |
| 320 | HS 3-2, empty, 1 out; FB cutter command 1 | FB middle 27% (FB down-away 31) | FB down-away 31% (FB middle 32, down-away 31) | Level calibration; eye level (Nov 21) | Acceptable (C7: FB zone at 3-2). Takes its proposed grade (ruling 12) |
| 338 | travel 1-0, empty; FB landing 0/12, changeup landing well | CH middle 12% (CH down-away 19) | CH down-middle 14% (CH down-away 20, CH up-away 17) | Level calibration with run values or shape terms (Nov 21) | Acceptable (B3). Takes its proposed grade (ruling 12) |
| 358 | travel 1-0, runner 3rd, 1 out; power hitter, late on the FB | CB down-away 16% (CB down-middle 22) | CB down-middle 25% (SI down-away 27, CB down-middle 25) | Level calibration plus shape terms (Nov 21) | Acceptable (F6: more fastballs, 15 -> 27%, to a hitter late on it). Takes its proposed grade (ruling 12) |
| 410 | travel 3-2, 1st & 3rd, 0 out, new pitcher; curve g4 command 5, slider landing well | CB middle 54% (CB middle 54, SL middle 21) | SL down-away 23% (CB middle 36, SL down-away 23, SL down-in 21) | Level calibration plus shape terms (Nov 21); the rulings move it 1-2 points | **Flagged (kept). Drew grades** (see below) |
| 460 | HS 2-2, 2 out, 1st & 2nd; riding FB g1 command 1 (88), slow curve g2 command 1 landing 7/14 | FB down-away 41% (FB middle 42, down-away 41, up-away 17) | FB middle 52% (FB middle 52, down-away 38, up-away 10) | **Ruling 5:** the smaller ride-up credit takes FB up-away 18% -> 10%; putting 0.008 back restores the old call. The refit had already raised the middle (42 -> 48%) | **Flagged (new). Drew grades** (see below) |
| 476 | travel 3-1, runner 3rd, 2 out, tied 8th; sinker g1 command 4, curve g4 command 2 | CB down-middle 11% (CB middle 18, SI up-in 16) | SI down-away 10% (SI up-in 20, SI up-away 14, CB middle 13) | Level calibration (Nov 21); unchanged by the rulings | **Arguable. Drew grades** (see below) |
| 478 | travel 0-1, runner 2nd; riding FB g4 command 5 landing well | FB chase 20% (FB up-away 24, FB down-away 22) | FB down-away 25% (FB up-away 28, FB down-away 25, FB chase 23) | Level calibration (Nov 21) | Acceptable. Takes its proposed grade (ruling 12) |

### The six rows Drew grades (menus: golden dist, top spots with shares)

Options for each: **Acceptable / Arguable / Not acceptable**.

- **#92 (arguable, as on Nov 21).** travel 0-0, 2 out, runner 2nd, pitch 118, up 4 in the 9th; cutter g5, curve g3
  landing 3/14; the hitter has hit the fastball hard (+0.83 over 3 looks, thin).
  - Before: CB down-away 12, CB middle 10, CB down-middle 10, CB up-away 8, CB down-in 8 (curve 60% in all).
  - After: CB down-away 12, CB middle 10, CB down-middle 10, CB up-away 8, CB down-in 7 (curve 60%).
  - Rule: **B8** (a curve not landing at 0-0 is arguable). Proposed: Arguable; the menu is the same as before, only
    the shown spot moved.
- **#154 (arguable, flagged; as on Nov 21).** HS 3-0, bases loaded, 2 out, down 2; sinker g2 landing 4/10, slider g4
  landing 3/11, changeup g2 command 1.
  - Before: FB middle 30, CH up-in 20, CH up-away 20, CH down-in 15, CH down-away 15 (changeup 70%).
  - After: FB middle 29, CH up-in 20, CH up-away 18, CH down-in 16, CH down-away 15 (changeup 70%).
  - Rule: **A1** (3-0 hard rule: get a strike; off-speed at 3-0 is arguable at best). **Flag:** about 70% changeups,
    command 1, at 3-0 with the bases loaded, in both engines and before the refit too. Proposed: Arguable.
- **#246 (new, flagged).** travel 0-0, 2 out, runner 3rd, up 4 in the 1st; fastball g1 command 5 (72 mph), curve g1
  command 4; the hitter has hit the fastball hard (+0.72 over 21 looks).
  - Before: CB down-away 12, FB up-in 11, CB down-in 10, FB chase 9, CB chase 8 (fastball 52%).
  - After: CB down-away 14, FB up-in 14, FB chase 10, FB up-away 10, FB down-away 9 (fastball 60%).
  - Rule: **B1** (0-0, any strike) and the hitter read (hit hard -> fewer of that pitch). **Why flagged:** the
    fastball share rose 8 points against a hitter with a well-sampled hard-contact read on it. The rise came with the
    full-data refit; ruling 10 only swapped the shown spot. Proposed: Arguable.
- **#410 (flag kept).** travel 3-2, 1st & 3rd, 0 out, up 4 in the 7th, new pitcher; sinker g1 command 1, slider g3
  command 5 landing 9/5 (landing well), curve g4 command 5, changeup g1.
  - Before: CB middle 54, SL middle 21, SL down-middle 15, SL down-in 7, SL down-away 3 (middle 75%).
  - After: CB middle 36, SL down-away 23, SL down-in 21, SL down-middle 15, SL middle 6 (middle 42%).
  - Rule: **C7/C8** (3-2: a strike he can't do much with; zone is acceptable). **Why flagged:** the middle fell from
    about 75% to 42% at 3-2 with runners on and 0 outs, toward slider corners. Proposed: Acceptable (every top spot is
    a landing pitch in or at the zone).
- **#460 (new, flagged).** HS 2-2, 2 out, 1st & 2nd, up 2 in the 7th; riding fastball g1 command 1 (88), slow curve g2
  command 1 landing 7/14; contact grade 3.
  - Before: FB middle 42, FB down-away 41, FB up-away 17.
  - After: FB middle 52, FB down-away 38, FB up-away 10.
  - Rule: **A3** (2-2 hard rule: zone pitches are acceptable). **Why flagged:** ruling 5 moved it directly (the
    smaller ride-up credit gives back 8 points of FB up-away, mostly to the middle), so a middle-middle fastball from a
    grade-1 / command-1 arm is now over half the 2-2 calls with two on. Proposed: Acceptable (command 1 aims at the
    middle so the pitch lands; no curve at 2-2 for a command-1 curve).
- **#476 (arguable, as on Nov 21).** travel 3-1, runner 3rd, 2 out, tied 8th; sinker g1 command 4 (72), curve g4
  command 2.
  - Before: CB middle 18, SI up-in 16, SI up-away 12, CB down-middle 11, CB down-in 10 (curve 62%).
  - After: SI up-in 20, SI up-away 14, CB middle 13, SI down-away 10, CB down-middle 9 (curve 48%).
  - Rule: **A2** (3-1 hard rule: get a strike; off-speed at 3-1 is arguable). The menu moved toward the sinker, as A2
    wants, but the curve is still about half. Proposed: Arguable.

---

## 3. Open items: one recommendation each (PROPOSED)

- **HARD_SD (how big one power point is). Use the talent spread with luck taken out, about .070.**
  - Pitchers' grades already work this way: `talent_spread.py` takes each pitcher's luck out and calls one grade point
    one SD of true talent. Hitters should match. That's your "one grade point = one SD of real players."
  - The refit's .0627 is the spread of shrunk estimates, which squeezes hitters together. The old .0526 came from an
    every-4th-day sample. The plain full-season spread (.0765) still has luck in it.
  - Before shipping: compute it properly, the way `talent_spread.py` does. The ~.070 is the refit agent's estimate; I
    didn't recompute it. Then restate POWER_HR on it (0.178 per fitted SD → about 0.184).
- **The 0.002 minimum effect: adopt it.**
  - For v1.3 to pass, it must beat the recalibrated v1.2 by more than noise **and** by at least 0.002 per pitch.
  - On D1, 2 SE alone would accept 0.0015, and knowing the base-out state is worth only about 0.001. A 0.002 floor
    means v1.3 has to beat that and more.
  - On D2 and D3, the error bars are bigger, so the 2-SE rule decides there anyway.
- **Re-freeze the harness landing from Single-A: yes, before any v1.3 score exists.**
  - The current frozen world puts too many pitches over the heart when the hitter is ahead. For example, at 3-0 it has
    44% in the heart where Single-A has 24% (`HARNESS_v13.md` section 10). That would score a v1.3 with a correct zone
    table against the wrong pitch locations.
  - The pass/fail reference (recalibrated v1.2) doesn't depend on the landing, so this changes no rule.
  - Keep the calib-world scores as a side report and bump the harness version.
- **R12 (v1.2's targets came from 2026 conference stats): state it, don't refit.**
  - Pass/fail is judged against the recalibrated v1.2, which is fit only on seasons before the scored one. It matches
    the count-only baseline to 4 decimals, so the 2026 leak doesn't reach it.
  - Only raw v1.2 carries the leak, and raw v1.2 is information only. Say so wherever raw v1.2 is quoted.
- **MLB run values shrinking every level ~3.8% (MLB's empty-bases, 0-out run value went .481 → .500, and that number
  divides every level's run scale).** Agree with your default: once college run values exist, college levels stop taking
  any scale from MLB.
  - **Until then, pin the denominator at v1.2's .481.** A higher-scoring MLB in 2021-25 isn't a reason for HS or college
    credits and randomness to get 3.8% smaller.
  - Putting the whole run-value change back restores 6 of the 25 HS calls (#4, 46, 100, 186, 222, 464), so it's not
    nothing.

---

## 4. Task C: a quality-gated hanger (design only, no engine change)

**Today.** The engine adds a flat +0.5 to the hard-contact odds (in logits) whenever an off-speed pitch lands over the
heart (`engine.py`, `hl += 0.5  # hanger`, in `outcome_probs`; the same in `app/engine.js`). It hits every off-speed
pitch, good or bad. The data says that's wrong on average. Off-speed over the heart is hit hard **0.88×** as often as a
fastball there with two strikes (MLB 0.90×), and **1.00×** on the first pitch. v1.2's flat term makes those 1.52× and
1.56× (zone seed H1, H5). Your rule (Nov 21): once the zone table carries the average, the flat term goes, and a penalty
applies only when this pitch is below his normal today.

**The signal: "not landing today," which the engine already has.**
- `wild_today(p, s)` compares his strikes on this pitch today with what the model expected for his grades, shrunk by 20
  pitches (`LAND_K` 20, `LAND_GAIN` 1.9, fitted on Statcast). It's 0 when he's normal, up to 0.6 when he's missing, and
  negative when he's sharper than usual.
- For an average slider: 3 for 9 reads about 0.16, 2 for 9 about 0.22, 0 for 4 about 0.19. In the 2025 data it never
  went past ~0.35.

**Proposed rule.**
- Extra hard-contact odds for an off-speed pitch landing over the heart = **H × min(1, wild_today / 0.30)**.
- It only applies when `wild_today` is above 0: zero when he's landing normally or better, full at 0.30 or worse.
- **Proposed H = 0.5**, the old flat size, now only at full strength. So a 2-for-9 slider gets about +0.37 and a 3-for-9
  about +0.27.
- It needs no new inputs, works in every game the coach logs, and is the same in both engines.

**Signals I'd leave out for now.**
- The app's drift notes (`app/peak.js`: whiffs per swing, strike rate and velocity vs his own past outings) are the
  better "below his normal" read. But by design they're **notes only**, and `drift_exact_test` proves they change no
  call. Using them would need you to lift that line. They also need 8+ pitches tonight and a history.
- Radar on a breaking ball is a weak "flat today" signal.
- Revisit both after v1.3.

**How to size H (by graded rows, your default).** Use the smallest H that passes every gated row while every control row
keeps its off-speed share, the same rule used for the ride-up credit.
- **Existing gated rows** (off-speed not landing; it shouldn't be the call):
  - A5 (3-0, changeup 1 of 8);
  - B7 (2-0, changeup 2 of 8);
  - E2 (2-0, slider 2 of 9);
  - C7 (3-2, changeup 2 of 8);
  - D3 (1-1, slider 2 of 9);
  - B8 (HS 0-0, curve 3 of 10);
  - E8 (HS 1-2, curve 0 of 4).
- **Existing controls** (landing well; no penalty): E1 (2-0, slider 7 of 9), E3 (3-1, changeup 6 of 8), A4 (2-2, slider
  8 of 10).
- **New rows to add** (each graded by you):
  - **HG-1:** 1-1, the same slider landing normally vs 2 of 9. Slider middle falls by at least half when it isn't landing.
    When it is landing, slider middle stays acceptable at no less than the zone-table-only share.
  - **HG-2:** 0-2, curve 1 of 8. Curve middle not acceptable; curve chase and down acceptable.
  - **HG-3:** 0-0, changeup landing normally. Changeup middle acceptable (data 1.00×). A control: the gate must not touch
    it.
  - **HG-4:** HS two-pitch, 3-2, curve 3 of 10. Curve middle not acceptable, fastball zone acceptable.
- **Watch for double counting.** "Not landing" already makes the pitch wilder. If the gated rows pass with H = 0 once the
  zone table is in, H stays 0.

---

## Checks behind this sheet (read-only; scratch copies, nothing committed)

- Refit engine = `git archive bee4c46`, and before = `git archive d14115b`, unpacked into a scratch folder.
  - Each check (R1 shares, Q4's worst share, S5's three shares, the 25 HS picks) was reproduced exactly as the tests and
    `golden/golden_v11.py` compute them.
  - The refit numbers match `REFIT_v13.md` exactly: R1 42.5 / 35.5, Q4 41.4 / 42.5, S5 1.0 / 0.0 / 12.1, and all 25 HS
    picks.
- Swap-backs: one group at a time (engine.py literal lines, `fit_v08.json` keys, data files), then combinations for the 7
  HS calls no single group explained (58, 138, 266, 314, 338, 358, 410).
- Ride-up sizes: `readthrough/scenarios.py --suite v12` on scratch copies with `COACH_RULE["ride_up_2k"]` at 0, 0.003,
  0.005 and 0.006, plus the Q4 / C5 / R1 probe at each size.
