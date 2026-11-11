# Independent review: v1.0 Steps 0-3 (Nov 11, at `7fe6e42`)

A fresh-context reviewer with no history of the build checked Steps 0-3 against `docs/PLAN_v1.0_2026-11-09.md` and
`docs/REVIEW_v0.9_2026-11-08.md`, read-only, reproducing each claim by running the engine.

**Verdict: SOUND WITH ISSUES.** The Step 1-3 engine code does what the plan says; Python and JS agree (fast parity 0
mismatches, largest difference 4.3e-14). One hard crash outside the tablet engine; the landing estimate is noisy and
its new sharpening side saturates; Step 3 has not been measured in full games.

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | High | `web/lib/engine_data.json` last synced at Step 0c while `web/lib/engine.js` is v1.0: the website demo crashed on every call (`Cannot read properties of undefined (reading '4-seam')`); CI never compared the data file and didn't run `web/lib/demo.test.ts`. | **Fixed** (data copied; `test-app.sh` now `cmp`s both web files and runs the demo test: 0/2 before, 2/2 after). |
| 2 | Med | Landing estimate is mostly noise at in-game sample sizes: a pitcher exactly at his expected rate sits at the -0.3 sharpen cap 23-41% of the time and at wild >= +0.3 16-26%, falsely blocked ~5%; the unequal caps (0.6 / 0.3) bias the mean toward wild (+0.03-0.05). Saturation means a 6/10 and a 7/10 slider get identical 3-1 calls. LAND_K, LAND_GAIN inherited; 0.3 chosen so the D1 test passes. The plan's "< 0.03 at expectation" check passes by construction (non-integer strikes = expectation). | **Drew, Nov 11: fit LAND_K / LAND_GAIN / the caps to real data in Step 5** (how much a pitcher's early-game strike rate predicts the rest of the game, Statcast; 2024 train / 2025 held-out, the plan's fit hygiene). Unchanged until then. |
| 3 | Med | Nothing measures Step 3 in full games: `calib` plays fresh at-bats; the last yardstick (2c) predates Step 3. | **Open:** yardstick re-run on `7fe6e42` (Drew's PC). |
| 4 | Med | `app/worlds.js` truth pitcher had `strike_rate` but no `strike_ref`, so the learner's test world lost v0.7 confidence scaling while the learner assumed it. | **Fixed.** The reviewer's guess that this caused the red `stage2_test` D5 did not hold: still 2/40 false switch-offs after the fix (33/40 caught). |
| 5 | Med/Low | D1 acceptance depends on two-sided landing and covers one extreme point: at slider 7/10 vs fastball 5/10 the fastball stays on top (43-46% vs 35-38%); the engine ranks by myopic cost, not by "expected strike". | Reported to Drew. |
| 6 | Low | The "0.72 pitch going 2/4 IS flagged" check asserted it is kept (wild +0.39): the plan's -0.15 rule can't block it at n=4 (needs 1/4). | **Fixed** (check title says what it tests: read as wild, not blocked). |
| 7 | Low | Sharpening a chase target moves mass from off to edge (slider chase D3: edge 0.097 -> 0.122): a sharper chase should land just off more. The wild side had the mirror mismatch before v1.0. | **Fixed (Drew, Nov 11):** no sharpening on chase targets (both engines; new `tests.py` check). |
| 8 | Low | "Mass conserved" only up to the 0.01 floor (HS command-5 fastball up-away: heart goes to -0.0185 before the floor). Rare, small. | Noted. |
| 9 | Low | Shaking off every pitch silently brings them all back; the coach gets no notice. | Noted (app UX). |
| 10 | Low | Goldens never exercise the new landing format (all 554 records are old pairs read through `landing_triple`); `expected_strike`, `landing_record`, `ball_conf_event`, sharpened outcomes not in `cases.compute`. Ad-hoc parity: 2.8e-16, 0 mismatches. | Step 7 (golden coverage). |
| 11 | Low | Some `tests.py` checks still run the retired path (R2, R5, R6 repeat, Learning mode). | Step 6 (callers rewritten). |
| 12 | Low | `simulate.py` logged `big_spot` with its own hard-coded `inning >= 7`; `sched_innings=9` at every level. | **Fixed** (logs `engine.is_big_spot(s)`); the 9-inning simulated game is unchanged and noted. |
| 13 | Low | Several plan §5 acceptance checks are reported, not enforced (every-arsenal cells 21/495; variety 26 cells / 104 pitch-cells); 3-1 gate widened to 50-80%. | Drew-approved and disclosed. |
| 14 | Low | Fastball-chase HBP 0.3 is a tuned guess; "away from the body" is an assumption (the chase target has no side). | Drew-approved; noted. |

**Checked and found correct:** fast parity both ways; `tests.py` 34/34 and realism numbers; #2 re-solve (stale vs fresh
1-1 mix now differ by 20%, the report's 41% was measured at Step 1); #9 input checks in both engines; #6/D2 shake-off
(fastball 46% -> 0.000; simulator keeps shaken pitches for the at-bat and hands the frozen v0.9 caller pairs); #10
(`seq_fit.py`'s chase label means below the zone for every class, so -3 there is consistent with how beta_T was fit);
#8; #16 (to 1e-12, JS data has it); #27; Step 2 guardrail deleted, stakes 0.9 / 1.3 identical in both engines; D5
wiring; Step 3 landing algebra (the old shrinkage with a zero center; the backwards shift sums to zero before the
floor); strike definitions agree between expected strike, simulator and app; excluding chase from the record is the
right call (it does discard real command misses on chase targets); app compat read, readouts, D8, HBP, chase-ball
rule; `app/dist` matches a fresh build.

**Could not verify (too long or on Drew's PC):** yardstick numbers (the 2c file matches the report, and its D3 figure
+0.369 ± 0.090 is over budget on its own); the 40/60/80-season learner numbers; "fails N checks on the Step 0 build"
for the two new browser tests; the `fit_all` recalibration values and the regret-proxy table.
