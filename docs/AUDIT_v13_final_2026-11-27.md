# V1.3 final audit and deployment decision (2026-11-27)

Audited: `feat/hitter-v13-final` at c602f1c, the commit that records the Step 6 pass. Nine independent specialist agents
(pitching coach, statistics, sabermetrics, game theory, data integrity, architecture, adversarial, integration/deploy,
game-day operations) drove the real engines. A separate cross-examiner then re-ran each headline claim with its own commands
and graded it. The lead checked the engineering claims directly. Fixes are on branch `audit/v13-final-audit`. Nothing touched
main, production or Supabase. Each agent's full report, with its commands and outputs, is in `docs/audit_v13/`; this is the consolidated
version.

## Verdict

**NO. V1.3 is not ready for deployment.**

The new hitter model is careful work, and it beats raw v1.2 on held-out 2026 pitches at all four levels. But four things block
deployment:
- The **call policy got worse** against Drew's own standard. His graded read-through fell from **94/98 to 85/98**.
- Two of his stated calling rules (3-1, the hitter's-count floor) now fail.
- The **release machinery** couldn't ship it safely: CI never ran most suites on this branch, the web build was broken, and
  old iPads break on D2 plans.
- **Step 6 can't see the call regressions.** It scores outcome prediction, and about 99% of its college gain comes from
  per-count re-levelling.

## Grades by discipline (elite standard)

| Discipline | Grade | One line |
|---|---|---|
| Pitching intelligence (coach) | C− | Most reads, times through the order, shake-offs and 3-0 are right. College 3-1 and the hitter's counts regressed, and one "landing hot" read collapses the mix to a single pitch |
| Statistical rigor | D+ | Step 6 was run carefully, but it tests per-count outcome levels, not calls. No calibration diagnostics exist |
| Probabilistic reasoning / game theory | C− | The fixed point is real and converged, but the hitter's guess is almost uniform and its coefficients were never fit. Late post-hoc rules (HS fastball floor) override the optimizer |
| Sabermetrics | C+ | RE24 and count values are monotone and MLB-correct. Win tables and some in-play values come from a different run environment. The HS table counts pitch class twice |
| Data integrity | B− | Shipped artifacts verified byte for byte. Dedupe and parse-quality gaps can't be sized without the archives |
| Software architecture | C+ | Python = JS parity holds and speed is fine. CI was blind on this branch, and an engine error froze the game screen (fixed) |
| Integration / deploy | C | Subsystems work together. D2 is still half on placeholders, version labels never changed, old apps break on D2 |
| Game-day operations | C | Fast, and cold start is good. Single reads and single landing counts flip whole at-bats; the why line describes old logic |

## Critical findings (verified, ranked by impact)

**Blockers**

1. **Drew's graded read-through regressed: 94/98 (v1.2.3) → 85/98 (V1.3).**
   - Newly failing rows: A2, A6, C5, D6, E2, F5, F6, H4, I2, J7. All ten were graded by Drew in v1.0.
   - Acceptable shares fell, for example H4 89→62, J7 86→66, F6 85→67, A2 73→54.
   - No ruling covers these rows: ruling 44 covers test suites, not graded rows. The Part 12 readiness page omits them.
   - *Cross-exam: CONFIRMED.* Same scenario file, same grader, both engines.
2. **College hitter's counts.**
   - The average three-pitch starter's 3-1 fastball is **42–44%** at D1/D3 (v1.2.3: 55–71%). The top pitch type is under 50%
     in **11 of 18** college 2-0/2-1/3-1 cells, lowest 37%.
   - The D1 3-1 mix is FB middle 37 / **CH middle 31** / SL middle 26, so his least-trusted pitch outranks the slider.
   - HS passes only because the fastball floor props up every cell.
   - *Cross-exam: numbers CONFIRMED.* Whether this is a "hard rule" is Drew's call; no ruling relaxed it.
3. **CI didn't test this branch.**
   - `scripts/test-app.sh` runs under `set -e`, and `tests.py` (red by ruling 44) is its first line. Every v1.3 CI run stopped
     there: parity, goldens, dist/web-lib checks and about 30 app e2e suites never ran in CI. The "52/67" figure comes from
     local keep-going runs.
   - 3 of 4 CI jobs were red. `main` has no branch protection.
   - The web build was broken: a stale `web/lib/engine_data_d3.json` crashed `next build` and unit tests. **Fixed** (below).
   - `site_e2e` still pins 5 film candidates where V1.3 now gives 4. That is test-only, but Drew should approve it in case the
     film design needs 5.
4. **Old iPads and rollback break on D2.** The v1.3 site can plan `college_d2` games. Main's app (cached offline on iPads, or
   after a Vercel rollback) throws `unknown level "college_d2"` and shows a blank page that survives reloads. Reproduced in a
   browser.
5. **D2 isn't a full level yet.** `release_guard_d2.py` exits 1 with 17 findings. D2 has its own count, mp and run tables, but
   still uses D3's fatigue point, confidence cutoff, profiles, win tables, steal model and league averages. Step 6's D2 pass
   tests none of these. The app's D2 description ("Uses the D3 numbers") is now wrong.

**Major**

6. **Step 6 proves less than it appears to.**
   - A 60-number per-count recalibration of v1.2 reproduces **98.8% / 98.8% / 99.2%** of the D1 / D2 / D3 gain. Core beats it
     by only about 0.0004 nats per pitch.
   - At HS, core is **worse** than recalibrated v1.2 by 0.012. Under the older landing world, HS fails.
   - Raw v1.2 was Drew's chosen bar (ruling 1), so the pass is legitimate. It just isn't evidence about calls.
   - *Cross-exam: CONFIRMED, interpretation fair.*
7. **"Landing hot" cliff.**
   - Slider 7 strikes in 10 → about 30%. 8 in 10 → **94–100% slider in nearly every count**, 3-0 included, at D1/D3.
   - One 8-for-10 read makes him readable for about 10 pitches.
   - The same cliff is **already live in production on v1.2.3**. V1.3 is 5–15 points worse at college.
   - At HS only the fastball floor hides it, so **cap the hot read before touching the floor**.
8. **The HS fastball floor decides the fastball share on about 63% of HS pitches.**
   - For two-pitch arsenals it ignores landing completely: a curve landing hot moves +0.0 at two-strike counts.
   - At 3-1 a struggling fastball stays at 67% until one more ball drops it to 0%.
   - The engine's own costs put this at about +0.4 HS runs/game for a fastball/cutter/curve arsenal. That is an estimate, not a
     paired sim.
9. **The HS pitch-kind × velocity table counts pitch class twice.**
   - It was fit on a base with no kind or location terms, then applied on top of the zone table's class terms.
   - HS 0-2 slider/fastball whiff ratio: 1.82 in the engine vs 1.46 in the data. This is the main driver of HS K% 26 vs 21
     real.
   - The gain cited for ruling 4 was measured on the other base, not on the version that ships.
   - *Cross-exam: mechanism CONFIRMED.*
10. **The hanger gate shipped at H = 0.**
    - A slider that isn't landing gets aimed at the middle more: D3 2-2 39→54%. An HS curve 2-for-9 is thrown middle at 0-2
      with nothing in the dirt.
    - No H on the grid passes every row (E2 fails at all H; HG-2 still fails at H = 1). The rows conflict, and that was never
      taken back to Drew.
    - The adversarial agent's "set H = 1" fix was REFUTED in cross-exam.
11. **Some coaching reads are broken, others are too strong.**
    - "Fouled straight back → not that pitch there again": the same pitch and spot is still called 9.6% of the time (v1.2.3:
      0%). This is row F5.
    - One logged "late" read flips a 0-0 at-bat to 92% fastball, so a single mis-tap decides the at-bat.
    - Reads behave as on/off switches at READ_T 0.2.
12. **Run environments don't match.**
    - Win/leverage tables were built from the old chain: HS runs per half ×1.33 vs the shipped RE; D3 ×1.17.
    - HS RE00 0.803 is below D3's in 15 of 24 states.
    - Late-and-close calls move by up to 13 points when rebuilt.
13. **The "balance point" is mostly decorative.**
    - The hitter's guess is uniform within 1 point below two strikes. The `sit_*` coefficients are the spec's starting
      guesses, never fit.
    - The iPad's why line says "He's sitting fastball (34%)" on about 40% of D3 calls. It can't name any V1.3 driver (count
      layer, zone, landing, coach rules).
    - The README still claims the quantal-response balance point and a 0.010-run guardrail that v1.0 removed.
14. **Missing owner rule: unknown hitter = lineup-slot average × team strength.** It isn't implemented (also missing on main),
    so the 9-hole hitter is pitched like the cleanup hitter. The prior is already fit (FITS_TRAITS_v13 §3.1).
15. **No calibration diagnostics anywhere.**
    - The last zone truth check (Nov 22 core, Single-A) was off (chase whiff .365 vs .499 real) and was never rerun on the
      tip.
    - Top-two call cost gaps at 2-2 and 1-2 are 0.001–0.002 runs, inside plausible model noise. Pitch type is robust; the
      spot within a type is not.
16. **Data pipeline (can't be sized without the archives).**
    - Dedupe compares exact text, so differently formatted copies of one game both stay in. 24,384 pairs were never checked.
    - Parse-quality flags don't filter college fit games. For example, an unparsed fielder's choice shifts the lineup slot of
      every later batter in the half-inning.

**Minor**
- `outcome_params.py` is fit to `college_run_values.json`, which uses 2026 conference totals. That contradicts the "2026 never
  used" note; the effect on the Step 6 score is likely near zero.
- Step 6's run-once lock is tied to the `PITCHIQ_DATA` path. Its frozen-file list misses `mp_v13.json`, `spread_params.py`,
  `sim_constants.json` and `fit_v08.json`.
- On NaN or out-of-range inputs, Python and JS diverge. `check_inputs` doesn't range-check grade, command, conf or pitch count.
- `batters_faced` is an inert input. Fatigue constants are hand-set.

**Contested or withdrawn after cross-examination**
- "Re-calls the pitch just shaken off" was found by three agents. It **matches Drew's Nov 14 ruling** ("a pitch shaken once may
  come back if it's strong"), and golden case 70 encodes it. A fix was tried and reverted when the golden caught it.
  **Owner question:** does "may come back" include the very next sign?
- The game-theory agent's D3 hot-read numbers were 4–6× too small because its test never switched the read on. Disregard them.
- The brief's claim that `web/lib/engine_data.json` was stale was wrong: only the `_d3` copy was. Two agents corrected it.

## What holds up (verified)

- Python = JS parity: 500-case golden PASS (worst 1.7e-13), `fast.py 40` 0 mismatches, 28 new random states 0 mismatches.
- Numerics: 4,000 fuzz cases, worst probability-sum error 4e-16, no NaN on valid inputs.
- RE24 and count values have zero monotonicity violations at 5 levels. MLB count values match published ones (3-0 +.221,
  0-2 −.103). The per-pitch cost has no double counting.
- All 11 frozen sha256 values match. `app/engine_data.json` regenerates byte for byte. Data suites 131/48/27 pass.
- Step 6 ran once, locked, with no leakage path found in code. 2026 scored only through the guarded unlock.
- Hard rules: no chase at 3-0/3-1/2-2 in any run, fallbacks included. A second shake is a hard switch.
- No third-time-through cliff. Irrelevant perturbations move nothing. Learner and matchup caps hold.
- Pace: about 2 ms per call and 150–300 ms per at-bat solve in node. Estimated under 2 s on an older iPad (not measured on a
  device). Cold start doesn't depend on inputs coaches won't have.
- `logging_exact_test` and `drift_exact_test` pass field for field when re-pointed at the V1.3 engine, so they aren't hiding
  breakage. A D2 game plays 9 innings and saves end to end.
- Merge mechanics: fast-forward (135 ahead, 0 behind), no Supabase migrations needed.

## Improvements implemented during the audit (branch `audit/v13-final-audit`)

| Commit | Change | Verified by |
|---|---|---|
| 8ba943f | Regenerated `web/lib/engine_data_d3.json` for the V1.3 tables. It fixes the web build crash. | web `npm test` 109/109, `tsc` clean, `next build` OK (twice, the second time with the new app build) |
| a2898b2 | **Game app: an engine error no longer freezes the screen on a stale call.** The stale call clears, the coach is told, the pick box opens for his own sign (ungraded if the engine can't grade it), pitches save, and the engine retries on the next pitch. New `app/engine_down_e2e.js`, added to `test-app.sh`. Also affects production v1.2.3. | engine_down_e2e modes 1 and 2 PASS. Before the fix: stale "FASTBALL" at 1-0 while the game was at 2-1, pitches lost on reload. smoke, rules_e2e, v10_step1_e2e, v121_shake_e2e, v123_fixes_e2e, fold_e2e pass |
| 77160fa | Game app refuses a plan with an unknown level, with a message. Previously it went blank. Guards future levels only. | In-page check: `college_d9` refused, `college_d2` starts; smoke pass |
| bd8ebda | `export_data.py --check` no longer reports false differences. | Says "identical"; a planted change is still caught |

No engine code, table or call changed: golden v13core still PASS after all commits. **Proposed, not applied:** a CI patch that
reports the 16 ruling-44 suites as warnings so the other gates run. The permission system blocked it because it weakens a gate,
so it needs Drew's go (`docs/audit_v13/ci_known_red.patch`).

## Tests performed (headline)
- Read-through `--suite v12`, both engines: 94/98 vs 85/98.
- 70 hand-built coaching situations, both engines.
- Hard-rule and perturbation fuzz (seeded).
- Exploitability on 24 states. Small seeded sims at HS/D3/D1 with NOISE and INPUTS settings.
- RE24/count monotonicity scripts. Calibration and noise flip test.
- Parity (golden, fast, random). Data suites. sha256 check.
- Runtime edge-case probe, 43 cases in Python and JS.
- Web unit, typecheck and build. App e2e (smoke, rules, shake, fixes, fold, engine-down).
- Old-app D2 browser test. Re-pointed logging/drift exact tests. `release_guard_d2`.

## Not verified (and why)
- Anything needing the archives on Drew's desktop: refits, dedupe and parse-error rates, real calibration.
- Real iPad Safari timing.
- The web-shell e2e suites (they need Supabase in Docker), Vercel settings, production DB state.
- The full `test-app.sh` in one run (too slow on the audit box; CI has never run it either).
- Whether every call-policy fix leaves Step 6 intact. By code reading, Step 6 scores outcome tables (P6/BIP/RE/CV) on observed
  pitches, so pure policy terms (fastball floor, hot credit, coaching-rule costs, temperature, read thresholds) can't move it.
  Changes to the hanger or the HS kind × velocity table change outcome probabilities, so they would.

## Path to YES (ordered)
1. **Drew rules on the 13 failing read-through rows and the college 3-1/floor bar.** Then fix the call policy, likely a college
   hitter's-count guard plus finding why off-speed middle got cheap. Policy-only changes don't touch Step 6.
2. **Bound the "landing hot" read** (cap the share gain or scale it by count temperature) *before* softening the HS floor.
   Then make the floor yield smoothly to landing.
3. **Rule on the hanger rows conflict, and on HS kind × velocity** (refit on the engine's class-term base, or halve it). Either
   one changes outcome tables, so it needs a fresh holdout plan.
4. **Rule on D2:** ship it as an explicitly labelled placeholder level, or hold D2 off the website.
5. **Release safety:**
   - Bump the engine and app versions (and the two test pins).
   - Ship an alias hotfix for `college_d2` on main first, or keep D2 plans off until devices report V1.3.
   - Split CI into must-pass and known-red jobs, fix the `site_e2e` pin, and turn on branch protection for main.
6. **Why line:** only name terms worth ≥0.0005 runs, and let it name V1.3 drivers. Fix the README overclaims.
7. Then rerun the read-through, the cheap gates and a full CI pass, and re-decide.
