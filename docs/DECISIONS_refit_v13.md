# Decision sheet: the v1.3 refit (Nov 21, 2026)

For Drew. Tasks A and C of `docs/PROMPT_hitter_v13_next_2026-11-21.md`. **Every grade and recommendation here is
PROPOSED (Claude). Nothing is decided until you rule.** No engine code, test or number was changed.

The refit is on `feat/hitter-v13-refit` (numbers commit 1dfc81e; "before" = d14115b). The refit itself is written up in
`docs/REFIT_v13.md` and the moved calls are listed in `docs/REFIT_v13_CHANGED_CALLS.md`, both on that branch.

**How "what moved it" was found.** I made a scratch copy of the refit engine and put one group of refit numbers back to
its old value, then reran the check, one group at a time (about 40 runs, nothing committed). If putting a group back
restores the old result, that group moved it.

## Your rulings at a glance (all PROPOSED)

| Item | Recommendation |
|---|---|
| R1 mixing (1-2, runner on 3rd) | **Rewrite the limit to its intent:** slider at least 30%, no pitch over 60%. Stop chasing a points gap. |
| Q4 riding fastball up, two strikes | **Keep the 36% cap. Shrink the coach credit from 0.008 to 0.003.** The refit data now does most of that work. |
| S5 sinker lean gate | **Test the gate's direction, not a 3-point drop.** S5 is switched off anyway. |
| 25 HS / travel calls | 20 acceptable, 5 arguable, 0 not acceptable. Only 2 got a worse grade, and in both the menu barely moved. |
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

## 2. The 25 HS / travel changed calls

**Read this first.** The golden list's "call" is the **middle draw of the menu** (the engine sorts its menu and the test
takes the call at the 50% mark). When two spots are near-tied, a 1-point shift swaps the call shown even though the menu
barely moved. Most of these 25 are that. So each row below shows the top of the menu, and the grade is on the menu.

Grading words and rules are the read-through's (`readthrough/scenarios_v12.json`). For example: 0-0 B1, 1-0 B3, 2-0
D5/F3, 3-0 and 3-1 A1/A2 (hard rule), 2-2 A3 (hard rule), 0-2 C1, 1-2 C3, 3-2 C7/C8, a runner on 3rd with fewer than 2
outs D2. "Why" names the groups whose put-back restores the old call:
- **level calibration** = `outcome_params.py` (MLB's command and swing numbers copied into the levels);
- **run values** = MLB RE24 / count values;
- **sequence fits** = `fit_v08.json`, split into eye level, grounders by height, familiarity and the count effect;
- **shape terms** = the `PT_*` tables.

| # | Situation | Before: shown call (menu top) | After: shown call (menu top) | Why it moved | Grade (PROPOSED) |
|---|---|---|---|---|---|
| 4 | travel 1-1, 1 out, runner 2nd, opp. hitter; FB 94 + SL (landing 4/6) | FB up-away 31% (SL down-away 36, FB up-away 31) | SL down-away 32% (FB up-away 34, SL down-away 32) | Same menu, top two swapped. Grounders by height, familiarity, run values | Acceptable |
| 46 | travel 2-1, 0 out, 2nd & 3rd, 9th, up 4; sinker 94 g5 | SI down-in 53% (down-in 53, up-in 47) | SI up-in 44% (down-in 46, up-in 44, middle 10) | Riding / sinker zone whiff, grounders by height, run values, count effect | **Arguable** (D2: keep it down with a runner on 3rd and 0 outs; up 4 in the 9th softens it). Up-in was 47% before too |
| 58 | HS 3-0, 0 out, runner 3rd, down 2; cutter command 1, slider landing 1/13 | FB down-in 20% (middle 25, up-in 25) | FB middle 23% (up-in 28, middle 23) | Level calibration and run values together | Acceptable (FB zone at 3-0) |
| 92 | travel 0-0, 2 out, runner 2nd, pitch 118; FC g5, curve landing 3/14; he has hit the FB hard | FB down-away 7% (curve-heavy, top 12%) | CB down-in 7% (same menu within 1 point) | Sequence fits | **Arguable** (B8: curve not landing at 0-0 → curve arguable). The curve-heavy menu is the same as before |
| 100 | travel 2-0, 1 out, runner 2nd; curve g5 landing 7/10; hitter discipline 1 | CB down-middle 10% (FB chase 19, FB up-in 17) | CB middle 13% (FB chase 21, FB up-in 16) | Many small: shape terms, run values, in-play tables, grounders by height | Acceptable. **Flag:** FB chase tops the 2-0 menu (19 → 21%), in both engines; defensible only because he chases |
| 138 | travel 2-0, bases loaded, 1 out, disciplined hitter; 4 pitches | SL down-middle 17% (four off-speed strikes ~17 each) | SL middle 17% (SL down-middle 18, CB down-middle 17) | Several small together | Acceptable (off-speed strikes; the curve's corner dropped out, good with bases loaded) |
| 154 | HS 3-0, bases loaded, 2 out; FB landing 4/10, SL 3/11, changeup command 1 | CH up-in 20% (FB middle 30, CH up-in 20, CH up-away 20) | CH up-away 18% (FB middle 30, CH up-in 19, CH up-away 18) | Sequence fits | **Arguable** (off-speed at 3-0), the same as before. **Flag:** about 70% changeups at 3-0 bases loaded, in both engines |
| 182 | HS 1-2, empty, pitch 116; SL g5, CH g5 (both off-speed landing 3/13) | SL down-away 14% (CH down-away 33, CH up-away 16) | CH up-away 17% (CH down-away 34, CH up-away 17) | Same menu. Level calibration, or `PT_C` | Acceptable (anything at 1-2) |
| 186 | HS 3-0, bases loaded, 1 out, up 4; FC g1 80, firm CH g4 | CH down-in 16% (FB middle 30, CH down-middle 19) | CH down-middle 21% (FB middle 30, CH down-middle 21) | Level calibration, run values, in-play tables | **Arguable** (off-speed at 3-0), the same as before; down-middle is the better strike |
| 202 | HS 3-1, 2 out, runner 2nd; slider landing 4/5 | SL down-in 19% (all-slider menu 18-20 each) | SL middle 19% (same) | Same menu. Level calibration | Acceptable (E3: an off-speed pitch that's landing at 3-1) |
| 222 | travel 2-2, 1st & 3rd, 1 out; sinker command 1, he crushes the FB | CH down-away 28% (CH down-in 29, CH down-away 28, SL down-away 21) | SL down-away 36% (CH down-away 37, SL down-away 36, CH down-in 28) | Run values; the side-by-location table | Acceptable (zone at 2-2; every call on a corner) |
| 238 | HS 1-0, empty, up 4; cutter landing well | FB down-away 19% (FB middle 40) | FB up-away 19% (FB middle 42) | Eye level, grounders by height | Acceptable |
| 264 | HS 0-2, bases loaded, 2 out; everything landing so-so | FB down-away 13% (CH middle 16, CH down-middle 15) | CH down-middle 12% (CH chase 14, CH down-away 13, CH middle 12) | Eye level; shape whiff (`PT_B`) | Acceptable. Middle went down and chase went up, the way C1 wants |
| 266 | travel 0-1, runner 3rd, 0 out; sinker g5, slider g1 landing 4/10 | SL down-away 17% (SI down-away 21, SI down-middle 17) | SL down-middle 19% (SL down-away 20, SI down-away 19, SL down-middle 19) | Several small together | Acceptable (down with a runner on 3rd). Note: a grade-1 slider's share rose |
| 314 | HS 1-2, 1st & 3rd, 2 out; he's late on the sinker | SI up-away 26% (SI middle 42) | SI down-away 19% (SI middle 48) | Level calibration plus shape terms | Acceptable. Sinker up-away fell from 26% to 16% |
| 320 | HS 3-2, empty, 1 out; FB cutter command 1 | FB middle 27% (FB down-away 31) | FB down-away 31% (FB middle 39) | Level calibration; eye level | Acceptable (FB zone at 3-2) |
| 336 | travel 3-1, 2nd & 3rd, 1 out; sinker 94 landing 2/10 | SI down-in 16% (SI middle 25, up-in 20) | SI up-away 15% (SI middle 22, up-in 21) | Eye level, grounders by height, sinker zone / lane terms | Acceptable (FB zone at 3-1) |
| 338 | travel 1-0, empty; FB landing 0/12, changeup landing well | CH middle 12% (CH down-away 19) | CH down-middle 14% (CH down-away 20, CH up-away 17) | Level calibration with run values or shape terms | Acceptable (B3) |
| 358 | travel 1-0, runner 3rd, 1 out; power hitter, late on the FB | CB down-away 16% (CB down-middle 22) | SI down-away 25% (CB down-middle 26, SI down-away 25) | Level calibration plus shape terms | Acceptable. More fastballs (15 → 25%) to a hitter who's late on it, as in F6 |
| 360 | travel 1-1, runner 2nd, 2 out; slider command 1 | SL middle 15% (CH down-away 24) | SL down-away 13% (CH down-away 28) | Level calibration; side table; eye level | Acceptable. Away from the middle for a command-1 slider |
| 366 | travel 0-0, empty; FB command 5 | FB up-in 17% (FB middle 22) | FB down-middle 18% (FB middle 21) | Same menu. Level calibration; grounders by height | Acceptable |
| 410 | travel 3-2, 1st & 3rd, 0 out, new pitcher; curve g4 command 5, slider landing well | CB middle 54% (CB middle 54, SL middle 21) | SL down-away 20% (CB middle 38, SL down-away 20, SL down-in 19) | Level calibration plus shape terms | Acceptable (zone at 3-2). **Worth your look:** the middle went from ~75% to ~38% at 3-2 with runners on and 0 outs |
| 464 | travel 2-2, runner 2nd, 0 out; split CH g4, sinker command 1 | CH down-away 61% | SI up-away 33% (CH down-away 50, SI up-away 33, SI middle 10) | Many: shape terms, run values, hitter spread, grounders by height | Acceptable by A3 (any zone at 2-2). Note: a command-1 sinker aimed up |
| 476 | travel 3-1, runner 3rd, 2 out, tied 8th; curve g4 command 2 | CB down-middle 11% (CB middle 18, SI up-in 16) | CB middle 13% (SI up-in 23, SI up-away 16, CB middle 13) | Level calibration | **Arguable** (off-speed at 3-1), the same as before. The menu moved toward the sinker, as A2 wants |
| 478 | travel 0-1, runner 2nd; riding FB g4 command 5 landing well | FB chase 20% (FB up-away 24, FB down-away 22) | FB down-away 25% (FB up-away 29, FB down-away 25) | Level calibration | Acceptable |

**Tally (PROPOSED):**
- **20 acceptable, 5 arguable** (46, 92, 154, 186, 476), **0 not acceptable**.
- 3 of the 5 arguable were arguable before. Only #46 and #92 drop a grade, and in both the menu is nearly what it was.
- Worth a look: **#410** (the middle at 3-2 fell by half), plus the pre-existing flags on #100 and #154.

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
