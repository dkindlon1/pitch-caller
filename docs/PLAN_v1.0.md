# Pitch Caller v1.0: execution plan

Written Nov 6, 2026 for Claude Code to run end to end. These are the last big engine changes.
Start: `main` at `3b9d645` (one engine, v0.9, no flags). Work branch: `v1.0-work`.

Drew's decisions for this plan (Nov 6):
- **Hitter math is owned by the other chat** ("Hitting simulation fix"). That covers both the engine's hitter math and the simulator's hitters. This plan does not edit it; section 2 lists exactly what is off limits.
- **Variety: Medium.**
  - No pitch type over 85% in a situation.
  - Every allowed secondary gets at least 5%.
  - Exempt: 3-0, and situations where only one pitch type is allowed.
- **Run budget for variety: 0.25 runs per game.** This is measured in the simulator, which can't see the benefit of being unpredictable.
- **Approved:**
  - a new v1.0 scenario file (the v0.9 file stays frozen)
  - focused pitcher-side fits (HBP, wild pitch, level wildness) into a new params file
  - deleting dead code and the old golden files

---

## 0. Why each fix is what it is (root causes found Nov 6)

These were measured on the shipped engine before this plan was written. Claude Code should re-measure them in Phase 0 and stop if any is badly off. "Badly off" means the direction is wrong, or the size differs by more than 2x.

**R1. The mixing operator shuts pitches out.**
- `policy_from_costs` gives a pitch type zero weight once its best cost is more than `0.030 × run scale` behind the best pitch. The guardrail (`root_call`) also drops any call more than `0.010 × run scale` worse on this pitch alone.
- Cost differences between pitches are usually 0.005–0.03 runs. That is smaller than the engine's own model error, so pitches go to 0% or near 100% on differences the engine can't really resolve.
- This causes issues 1, 5 and 6: one pitch at 95%+ in 34% of situations, an average changeup at 0% in hitter's counts, a plus changeup at 74%.

**R2. Hitter "sitting" barely changes costs, so the sit game can't force mixing.**
- At 2-0 (D3, three-pitch arsenal), a middle fastball's cost changes by only 0.0055 runs across every possible sit, so the hitter's sit mix stays flat.
- The outcome probabilities do move: hard contact is 11.9% when he sits fastball vs 3.6% when he sits slider. The costs barely move because at 2-0 hard contact (0.648) is worth almost the same as the 2-0 count itself (0.61).
- The size of this effect belongs to the hitter model (other chat). The calling side can't depend on it, so v1.0 adds its own protection against being predictable (Phase 3.7).

**R3. Inside pitches are priced at about double the real hit-by-pitch risk.**
- A D3 inside fastball carries a 4.8% HBP chance per pitch in the engine; away is 0.9%. The inside:away ratio (`HBP_LOC`, about 5:1) is reasonable, but the level scale (`OUTCOME_ADJ['college_d3']['hbp'] = 0.17`) is too high.
- That scale was fitted to real HBP per batter (D3 4.32%, D1 3.57% in `data/pitcher_lines_2026.csv`) using a call mix that almost never went inside. So the few inside pitches had to carry every HBP. This is circular: rare inside pitches make inside look dangerous, which keeps them rare.
- Result: inside targets get 3.5% of calls, and 1,345 of 1,800 situations have none.

**R4. Level calibration was fitted to the old v0.7c call mix.**
- `calib.py` plays plate appearances with `call_mixed` (v0.7c), not the shipped engine's call. Level wildness, HBP and walk rates were tuned to how v0.7c called pitches.
- v1.0 changes the mix, so the pitcher-side terms must be refit to the v1.0 mix.

**R5. Wild-pitch risk is a hand-set guess.**
- Off-speed in the dirt carries 12%, fastballs 4% (`outcome_probs`, wild-pitch line). Real D3 is 2.74% WP per batter and D1 2.09%.
- The engine's overall rate is in the right range, so off-speed being called less with runners on may be partly correct. It must be fit, not assumed.

**R6. Ground-ball logic is weaker than coaches expect, not broken.**
- A down target raises ground-ball odds, and double plays are valued. But a weak ground ball costs slightly more than a weak fly (fewer popups), so going down gains little.
- Down calls drop with a runner on 1st mostly because off-speed drops (wild-pitch risk). This plan fits the wild-pitch risk (R5) and checks the result. It does not add an invented ground-ball bonus.

**R7. Small findings:**
- Repeats only use the last pitch, and only through a small whiff term. A foul "straight back" read (the app already records it) does nothing.
- The fallback when nothing is trusted picks by bullpen confidence and ignores today's strike rate.
- The two-strike chase exemption lets a pitch that isn't landing go in the dirt with a runner on 3rd.
- The plan for an at-bat isn't rebuilt when runners or outs change mid at-bat.
- Scenario F5 can't pass, because its input only says "foul", not "hard foul".

**R8. The JS parity test checks the old v0.7c functions.**
- `app/make_parity.py` uses `call_mixed`. Only `golden_v09.js` checks the shipped call path, so a new Python/JS check is needed.

---

## 1. Rules for this run

Carried over from Drew, plus this plan's own:

1. **Ask decisions with AskUserQuestion.** Drew doesn't care how many questions; he doesn't want to type.
2. **Never call anything done unless you ran it and captured the output.** "I couldn't verify this, here's why" beats a confident claim.
3. **Never push to main, and never apply anything to Supabase, without Drew's go-ahead.** Pushing `v1.0-work` is fine.
4. **Never run `fit_all.py` or `calib.py`'s main block.** Never import `fit_all.py`: it rewrites `outcome_params.py` on import.
5. **Never overwrite these:**
   - `spread_params.py`
   - `college_run_values.json`
   - `run_tables.py`
   - `outcome_params.py`
   - `golden/golden_v09.*`
   - `readthrough/scenarios_v09.json` and its `.sha256`
6. **No flags.** v1.0 is one straight engine, as Drew asked on Nov 6.
7. **Python and JS must match exactly.** The tolerance is 1e-9 on probabilities and costs, using the new parity test from Phase 1. `web/lib/engine.js` must be byte-identical to `app/engine.js`, and `web/lib/engine_data.json` must match `app/engine_data.json`.
8. **Hitter math is off limits** (section 2). If a fix seems to need it, stop and ask.
9. **Commit after each sub-step** with a message that says what changed and what was run. End each commit with the attribution lines your harness asks for.
10. **Keep a running log** in `docs/V1.0_LOG.md`: each step, the command, the key output lines, and pass/fail.
11. **If a gate can't pass, stop.** Report the numbers and ask Drew. Don't loosen a gate, add a rule, or retune outside the stated ranges to make it pass.

---

## 2. The boundary with the hitting-model work

**Off limits for this plan.** These belong to the other chat:
- **Hitter tables and terms in `engine.py` and `app/engine.js`:**
  - tables: `S0, C0, W0, F0, Q0, KIND_W, SIDE, MM, RHO_L, POWER_HR, DMG_SCALE`
  - parameters: every `P08` entry
  - functions: `side_shift, matchup_whiff, power_hr_shift, damage, shape_fit, timing_B, pair_terms, sit_shift, gval`
- **The swing, whiff, foul, contact-quality and called-strike lines of `outcome_probs`.**
- **These `OUTCOME_ADJ` keys:** `cmd, zsw, osw, wz, wo, cs`
- **These files:**
  - `simulate.py` (hitter behavior)
  - `hitter_spread_params.py`
  - `fit_hitter_spread.py`
  - `inplay_typed_params.py`
  - `inplay_fit.py`
  - `sim_constants.*`

**This plan may edit:**
- **Calling logic:** `candidates`, `allowed_calls`, `not_landing`, `policy_from_costs`, `solve_sit_game` (operator only), `root_call`, `call_v08`, `lean_b_h`, `frozen_inputs`, `needs_resolve`, `temperature`/`windows` (by wrapping, not changing their math), `solve_table` (to store the plan data), the `Situation` fields it adds, and the app's calling UI.
- **Pitcher-side terms, through a new file `pitcher_side_params.py` loaded after `outcome_params`:**
  - the HBP lines of `outcome_probs` (`HBP_LOC` and the level `hbp` scale)
  - the wild-pitch line (the 0.12 and 0.04 constants)
  - the level `wild` value

**Merge order with the other chat:**
- **The hitter work merged to main before Phase 0:** branch from that main instead.
- **It merges while this plan is running:** rebase `v1.0-work` onto it, then rerun Phase 4 (fits), Phase 5 (tuning) and every gate in Phase 9.
- **It merges after v1.0 is on main:** the other chat reruns `python3 fit_pitcher_side.py`, `python3 tune_v10.py` and `scripts/v10_gates.sh`, and must pass them.
- **Write `docs/HANDOFF_hitter_model.md`** (Phase 9). It tells the other chat this, and lists the tracked checks it must turn into enforced checks.

---

## 3. Phases

Create a task list with one task per phase, and tick each off as it finishes.

### Phase 0: Set up and record the baseline

1. **Clone `dkindlon1/pitch-caller` fresh and check out branch `v1.0-work`.** This plan is committed there, on top of `main` `3b9d645`. Confirm it is exactly one commit ahead of main (this plan) and record the hashes.
2. **Tag the starting point:** `git tag v0.9 3b9d645` and `git push origin v0.9`. Make a read-only worktree for side-by-side runs: `git worktree add ../pc-v09 v0.9`.
3. **Install:** `pip install -r requirements-dev.txt`, `npm ci`, and `npx playwright install chromium`.
4. **Fetch Statcast data if `data/statcast/sc_*.csv` is missing:** `python3 fetch_statcast.py`. Record the file count and pitch count.
5. **Run the current suite and record the output:**
   - `python3 tests.py`
   - `python3 tests_v09_followups.py`
   - `scripts/test-app.sh`
   - `node golden/golden_v09.js`
   - `python3 golden/golden_v09.py check`
6. **Re-measure the root causes in section 0** with a short script, `tools/v10_probe.py`, kept in the repo:
   - R2: the cost range across sits at 2-0, 1-1 and 0-2
   - R3: HBP per pitch for inside and away fastballs at D3
   - R5: wild-pitch chance per off-speed and fastball pitch with runners on
   - R6: the weak/solid/hard in-play values for up vs down targets, bases empty and with a runner on 1st
   Write the numbers to the log. Stop and ask if any is badly off, as defined in section 0.
7. **Baseline simulator numbers**, needed for the run budget. In the v0.9 worktree, run `TRUTH_TAB=world python3 readthrough/run_games.py --seeds 101-110 --jobs 4 --suffix _tw`. That is 90 paired games: 3 levels × 3 staffs × 10 seeds. Keep the CSVs; Phase 9 compares against them.

### Phase 1: Build the tests first

**1.1 The call-sheet test: `callsheet.py`** (issues 20 and 21)
- **What it does:** sweeps the shipped engine across a grid of situations, checks the bands in section 4, and writes `results/callsheet_<tag>.json` and `.md`. The `.md` has one table per band: eligible situations, passes, the worst five violations, and the share each pitch and target got.
- **Grid, full tier** (run with `--tier full --jobs 4`; about 960 table solves, about 15 minutes):
  - **Levels:** `hs`, `college_d3`, `college_d1`.
  - **Arsenals**, each in a new file `callsheet_arsenals.json`:
    - `two_pitch`: FB grade 4, CB grade 3
    - `slider_best`: FB 3, SL 4, CH 3
    - `avg_changeup`: FB 3, SL 3, CH 3 with command 2 and confidence 0.60
    - `plus_changeup`: FB 3, SL 3, CH grade 5, command 4, confidence 0.90
    - `four_pitch`: FB, SL, CB, CH, all grade 3
    - `sinker_gb`: FB shape "sink" grade 3, SL 3, CH 3
    - `low_command`: three pitches, every command 2
    - `changeup_first`: FB grade 2, CH grade 5, SL grade 3
    Speeds and confidences match `/tmp/sweep.py` from the Nov 6 check; that script is copied into the plan appendix.
  - **Base-out states:**
    - empty with 0 outs, empty with 2 outs
    - runner on 1st with 0 outs, runner on 1st with 1 out
    - runner on 2nd with 1 out
    - runner on 3rd with 0 outs, runner on 3rd with 1 out
    - 1st and 3rd with 1 out
    - bases loaded with 1 out
    - 2nd and 3rd with 2 outs
  - **Side:** same and opposite.
  - **Game state:** inning 4 tied; late and close (inning 8, or inning 6 for hs/travel, up by 1, `home=True`, with `win` filled in by `e.win_constants(s)` the same way the app does it).
  - **All 12 counts**, reusing one table per plate appearance, with `look` set to the table's starting look.
- **Grid, CI tier** (`--tier ci`, under 4 minutes): `college_d3` and `hs` only; arsenals `slider_best`, `plus_changeup` and `two_pitch`; 4 base-out states (empty 1 out, 1st 0 outs, 3rd 1 out, loaded 1 out); both sides; inning 4 only.
- **Extra variant groups** (both tiers; D3, `slider_best` and `plus_changeup`, bases empty 1 out and runner on 1st 0 outs, both sides):
  - **hitter grades:** power (`w`), contact (`c`) and eye (`d`) each at 1, 3 and 5
  - **crowding** on and off
  - **in-game reads:** a matchup of "hit hard twice" at FB middle; `hitter_damage` on middle
  - **at-bat history** (for the repeat bands)
  - **landing:** one pitch at 0 for 4 and at 2 for 12
  - **trust:** every pitch below the confidence cutoff
- **Weighting:** sweep-level shares (band B5) weight each count by the chance of reaching it from 0-0 under the engine's own policy. The chain comes from Phase 3.8. Until that exists, weight by real MLB count frequency, computed from Statcast in this tool.
- **Exit code:** non-zero if any enforced band fails. Tracked bands print but never fail.
- **Run it on v0.9 now** and save `results/callsheet_v09.*`. Many bands will fail; that is the baseline.

**1.2 The v1.0 scenario file** (issues 10 and 21; Drew approved)
- **Create the new files:**
  - `readthrough/make_scenarios_v10.py`, which builds `readthrough/scenarios_v10.json` and `scenarios_v10.sha256`
  - `readthrough/scenarios_v10.py`, the grader: same pass rule, same output format
- **Start from all 64 v0.9 rows**, carrying their ids, and make three kinds of changes:
  - **F5 input fix:** the last pitch becomes `["Changeup", "down-away", "foul", "back"]`, so the row says what its description says.
  - **Label review:** among the 31 rows that fail only on the acceptable share, propose a change only where the v0.9 label contradicts a decision Drew has already made (for example, a trusted off-speed pitch called "arguable" in a hitter's count). Give each change a one-line reason. Don't touch the "not acceptable" lists.
  - **New rows:**
    - 6 plus-changeup pitcher
    - 4 sinker or ground-ball pitcher with a runner on 1st and fewer than 2 outs
    - 6 late and close
    - 6 runners in scoring position
    - 3 two-pitch and 3 four-pitch arsenals
    - 4 repeats with foul reads (back / pull / opposite / none)
    - 3 inside or crowding
    - 2 nothing trusted (fallback)
    - 2 two strikes with a pitch that isn't landing and a runner on 3rd
- **Tracked rows:** a row can be marked `"tracked": true` only if passing it depends on the hitter model. Each such row needs a reason, and Drew approves the list.
- **Pass gate for v1.0:**
  - No enforced row may have more than 5% of its calls in "not acceptable".
  - At most 6 enforced rows may fail on the acceptable share alone, and each one is listed in the report.
- **Stop and ask Drew for approval** with AskUserQuestion. Show the label changes and new rows as a compact table. Freeze the sha256 only after he approves. Keep working on Phases 2 and 3 while waiting; the scenario gate is first needed in Phase 5.
- **Run the v1.0 file on v0.9** (it grades any engine) and save `results/scenarios_v10_on_v09.*` as the baseline.

**1.3 New Python/JS parity: `app/make_parity_v10.py` and `app/parity_v10.js`**
- 200 random situations, covering levels, arsenals, counts, bases, history, landing, grades and coach rules.
- For each one, compare:
  - the full call distribution
  - the root costs
  - sigma
  - the table values at 0-0 and 1-1
  - the at-bat plan, once Phase 3.8 exists
- The maximum allowed difference is 1e-9. Add it to `scripts/test-app.sh`.

**1.4 The simulator floor: `tools/sim_floor.py`**
- Compares two run folders game by game: the v0.9 baseline from Phase 0.7, and v1.0 run the same way.
- Prints the paired mean difference and SE for: `regret_w_exp`, runs per game, walks, strikeouts, HBP, wild pitches per batter, and pitches per game.
- Reuse the regret code behind `results/followups/regret_*.txt`. Find it with `grep -rn regret_w_exp`.

**1.5 The predictability check: `tools/exploit.py`**
- Uses `metrics.py`'s `exploitability` (X = runs a hitter gains by always sitting on his best guess instead of his mix) on the CI-tier grid.
- Save `results/exploit_v09.json`.

### Phase 2: Housekeeping, with no change in behavior (issues 25 and 26)

1. Delete `golden/golden_v07c.json`, `golden/golden_v08.json` and `golden/labels_parity.json` (approved). First confirm with `grep` that nothing reads them.
2. Delete `expectation`, `pairing` and `in_play_value_ev` from both engines (approved). Rewrite or delete any test that uses them. `tests.py` uses `pairing`: rewrite that test against the shipped path, or delete it if it only covered v0.7c behavior, and give the reason in the commit message.
3. The v0.7c decision functions (`call_mixed`, `mixed_policy`, `at_bat_values`, `call`, `grade_call`, `call_costs`, `sit_matrix`, `_softmax`) are still used by `simulate.py`, `calib.py`, `sim_constants.py`, `fuzz.py`, `tests.py` and `app/make_parity.py`.
   - **Keep everything `simulate.py`, `calib.py` or `sim_constants.py` needs.** Those belong to the other chat or are frozen tools. Move those functions under a clear `# legacy v0.7c (used by the simulator and calibration only)` header in `engine.py`.
   - **Replace `fuzz.py`** with `callsheet.py`, then delete `fuzz.py` and `fuzz_lib.py` if nothing else imports them.
   - **Replace `app/make_parity.py` and `app/parity.js`** with the v1.0 parity test in CI. Delete them and their case file.
   - **Remove JS copies of legacy functions** that no app or web code calls (check with `grep`).
4. **Checkpoint:** `golden_v09` (Python and JS) must still pass with a difference of exactly 0. Then run `tests.py`, `scripts/test-app.sh` and the web build (`cd web && npm run build`). Stop on any difference.

### Phase 3: Calling-logic changes

Make each sub-step in Python first, with unit tests in a new `tests_v10.py`, and commit. JS follows in Phase 6. Every new behavior gets a "why" line for the coach (section 5).

**3.1 At-bat history and repeats** (issue 8)
- **New `Situation` field:** `history: tuple = ()`, with one `(pitch name, target, result, read)` per pitch already thrown in this at-bat, oldest first.
  - `result` is one of `ball, cstrike, whiff, foul`.
  - `read` is `None`, or one of `back`, `pull`, `opposite`, `front`, `late`, `fooled`.
  - `last` stays, and equals `history[-1][:3]` whenever history is given (keeps old callers working).
- **RP1, no third time:** in `allowed_calls`, drop `(pitch, target)` when the last two pitches of this at-bat were both that exact call. It stands down if it would leave nothing.
- **RP2, fouled straight back:** if the last pitch was a foul with read `back`, drop that exact `(pitch, target)` for the next pitch only. The same pitch elsewhere is still allowed. Stands down if it would leave nothing.
- **RP3, he's seen it:** in `lean_b_h`, each foul on pitch P in this at-bat (most recent 2 count) adds `log(1.3)` to the hitter's lean toward every sit on P at the height of that target. This mirrors the existing "fooled" term.
- **Tests:**
  - a third straight exact repeat gets 0%
  - after a foul straight back, the exact repeat gets 0% next pitch
  - after a plain foul, the exact repeat is not called more than with no history
  - after a whiff, the same pitch type is called at least 90% as often as with no history

**3.2 Fallback when nothing is trusted** (issue 9)
- Change `candidates`: when no pitch clears the confidence cutoff, take the pitches that pass `not_landing` (or have fewer than `LAND_BLOCK_N` thrown), and pick the highest confidence among them.
- If every pitch is not landing, pick the highest shrunk strike estimate (`landing_estimate`).
- Keep the existing coach flag. Make sure the app shows it (Phase 6).
- **Test:** curveball 2 for 12, fastball 7 for 12, everything below the cutoff, curveball with the higher confidence. The engine calls the fastball 100%, and the why line says nothing is trusted.

**3.3 Landing filter with a runner on 3rd** (issue 7)
- In `allowed_calls`, the two-strike chase exemption for a pitch that isn't landing applies only when 3rd base is empty. With a runner on 3rd, that pitch is left out.
- **Test:** 0-2, runner on 3rd, slider 0 for 4 gets 0%. The same with 3rd empty may still chase.

**3.4 Rebuild the plan when runners or outs change** (issue 11, part)
- `frozen_inputs` also stores `bases` and `outs`. `needs_resolve` returns true when either differs.
- **Tests:** in Python and in `app/v08_e2e.js` (or a new e2e test), a stolen base mid at-bat triggers a re-solve.

**3.5 Two coach rules** (issues 10 and 12; Drew can strike either one at plan review)
- **CR1, mashed it twice:** if `matchup['hard|KIND|target'] >= 2` for this hitter today, drop that pitch type at that target for the rest of the game. Fixes I4.
- **CR2, don't feed power:** if the hitter's power grade is 4 or higher (`grades['w']`), drop the `middle` target for every pitch in every count. Fixes H1.
- Both stand down if they would leave nothing, or in fallback mode (3.2), and both say so in the why line.
- **Tests:** I4 and H1 situations show 0% on the excluded calls.

**3.6 Split the guardrail into a location guard and a pitch-type guard** (issue 6)
- In `root_call`, replace the single guard on myopic cost (cost on this pitch alone) with two:
  - **Location guard:** within each pitch type, keep `(pitch, target)` only if its myopic cost is within `GUARD_DELTA × run scale` (0.010, unchanged) of that pitch type's best target. This keeps the guardrail Drew turned back on: no clearly worse spot for a setup.
  - **Pitch-type guard:** keep a pitch type only if its best myopic cost is within `GUARD_TYPE × run scale` of the overall best. `GUARD_TYPE` starts at 0.030 and is tuned in Phase 5 within [0.020, 0.060].
- Three-ball counts keep ranking by myopic cost, as now.
- **Tests:** at `GUARD_TYPE = GUARD_DELTA` the kept set is a subset of v0.9's (sanity check). With the default, an average changeup to an opposite-side hitter at 2-0 survives the guard.

**3.7 New mixing operator weighted by real usage** (issues 1, 2, 5, 6, and inside pitches)

- **Build the usage table:** a new script `fit_mix_prior.py` reads Statcast 2024 and 2025 regular season and writes `mix_prior.json` with two tables. Both are "what real pitchers do", used as a baseline that the engine's costs then move away from.
  - **Pitch-type usage** `u_T[composition][count][platoon][kind]`:
    - Kinds come from `seq_fit.CLASS` (FB, SL, CB, CH).
    - A pitcher's composition is the set of kinds he throws at least 5% of the time in that season (pitcher-seasons with at least 300 pitches).
    - The value is the average of each pitcher's own share of that kind in that count and platoon cell.
    - Use the composition-specific value when at least 40 pitcher-seasons have that composition. Otherwise use the all-pitcher kind shares renormalized over the arsenal's kinds.
    - Cells with fewer than 200 pitches pool their count into its group (ahead, even, behind, 3-0, full).
  - **Target usage** `u_L[kind][count][platoon][target]`, from actual pitch locations. Use the attack-zone function `zone(r)` in `statcast_check.py` (heart < 67%, shadow < 133%, chase < 200% of the half-zone, waste beyond) so the definitions match the earlier Statcast check:
    - Statcast zone 5 counts toward `middle`.
    - The other heart and shadow pitches count toward the four corners by quadrant: inside/away by `plate_x` flipped for right-handed batters, up/down by `plate_z` against the middle of that batter's zone.
    - Statcast's chase region counts toward `chase`.
    - Waste pitches are dropped, as misses.
    - Normalize over the targets allowed in that count (`targets()`, including no chase at 3-0 and 3-1). Pool counts the same way as above.
  - **Two pitches of the same kind** in one arsenal split that kind's usage evenly.
  - **Bundle the table into JS:** `app/export_data.py` puts `mix_prior.json` into `app/engine_data.json`. Both engines read the same numbers.
- **The operator.** In `policy_from_costs`, with `T = temperature(arsenal, s)` (unchanged):
  - **Notation:**
    - `best_n` is pitch n's lowest cost among its targets that survive the guards.
    - `lw` is the existing location window for pitch n (unchanged formula).
    - `u_L` is renormalized over pitch n's surviving targets, and `u_T` over the surviving pitch types.
  - **Per-pitch cost**, a soft minimum over its surviving targets, written so it is safe numerically:
    `c_n = best_n − λ_L · log Σ_q u_L(q) · exp(−(c(n,q) − best_n)/λ_L) · taper(c(n,q) − best_n, lw)`, with `λ_L = κ_L · T`.
  - **Pitch-type mix:**
    `π_n ∝ u_T(n) · exp(−(c_n − min_m c_m)/λ_T)`, with `λ_T = κ_T · T`. There is no fixed cutoff window on pitch type any more; the pitch-type guard from 3.6 does that job.
  - **Target mix within a pitch:**
    `π_{q|n} ∝ u_L(q) · exp(−(c(n,q) − best_n)/λ_L) · taper(c(n,q) − best_n, lw)`.
    The location window and taper stay exactly as now, so a clearly worse spot is still never picked. The same weights appear in `c_n`, so the two stages together are one consistent quantal response weighted by real usage.
  - **Starting values:** `κ_T = 3`, `κ_L = 1`. Phase 5 tunes them within κ_T ∈ [1, 6] and κ_L ∈ [1, 3].
  - **Scope:** `solve_sit_game` and `solve_table` use the same operator, so the plan values and the hitter's balance point are consistent with what is actually called. The big-spot and high-stakes tightening still works through `T`.
  - **Display cleanup:** `call_v08`'s 0.5% cutoff stays.
- **Why this design:**
  - The engine's cost differences are often smaller than its own model error. Leaning on what real pitchers do in that count and platoon is the hedge against that error.
  - The engine still moves the mix toward what it thinks is best, as far as `κ_T` and `κ_L` allow.
  - A plus pitch still gets used more, because its cost really is lower. An average pitch can't go to 0% unless a guard removes it, and the guard gives a reason.
- **Tests:**
  - With `u` flat and `κ_T = κ_L = 1`, the target mix within each pitch equals v0.9's exactly. The pitch-type order matches v0.9's best-cost order wherever two pitches' best costs differ by more than `T`.
  - Shares sum to 1, and nothing outside the guards is ever picked.
  - The sit game converges (residual below `QRE_TOL`) on the whole CI grid.

**3.8 The at-bat plan** (issue 11)
- **Stored in `solve_table`:** for each count, the policy at the starting look bin, and each call's outcome probabilities.
- **New function `at_bat_plan(tab)`:**
  - **The chain:** walk forward from 0-0 through the count Markov chain (balls, strikes, fouls looping at 2 strikes, plate-appearance ends) under the stored policies. Return the chance of reaching each count.
  - **Opener:** the top two calls at 0-0 with their shares.
  - **Put-away:** the pitch type with the biggest chance-weighted share across 0-2, 1-2 and 2-2.
  - **Behind:** the main calls at 2-0, 2-1 and 3-1.
- **Uses:**
  - The app shows one plan line under the call, for example "Plan: FB away to start, put away with the CH down".
  - `callsheet.py` uses the chain for count weighting.
  - The live call still draws from the same policies, so the plan and the calls agree by construction.
- **Tests:**
  - The reach chances are consistent (each count's in = out; the plate-appearance end chances sum to 1).
  - They match a 20,000 plate-appearance Monte Carlo within 0.01.

### Phase 4: Pitcher-side fits (issues 3, 4 and 16; Drew approved)

A new script, `fit_pitcher_side.py`, writes `pitcher_side_params.py`. `engine.py` loads it after `outcome_params`. Levels: `hs`, `college_d3`, `college_d1` (`travel` copies `hs`, and `college` copies `college_d1`, as now). MLB values don't change.

- **The evaluator:** copy `calib.evaluate` into this script with one change: plate appearances are played with the v1.0 call (`call_v08` with the Phase 3 operator), not `call_mixed`. Use the same lineups as `calib.population`. Don't edit `calib.py`.
- **4a. HBP, at a real-world target mix:**
  - Keep the `HBP_LOC` ratios.
  - Fit only the level scale `hbp` so that HBP per batter matches the real target used by `fit_all.py` (`calib.RV[level]['HBP']`). Fit it while the engine's targets within each pitch are replaced by the real target usage `u_L` from 3.7.
  - Fitting at the real mix breaks the loop in R3: it asks how risky inside is if college pitchers go inside as often as real pitchers do.
  - **Sensitivity:** refit with the inside shares × 0.7. The Phase 5 bands must still pass at that value. Record both.
- **4b. Level wildness and walks, at the engine's own v1.0 mix:** with `hbp` fixed, fit `wild` so walks per batter match `calib.RV[level]['BB']`.
- **4c. Wild pitches, from simulated games:**
  - Fit one multiplier per level on the wild-pitch constants (0.12 off-speed, 0.04 fastball, ratio kept). Wild pitches per batter must match `data/pitcher_lines_2026.csv` (D1 0.0209, D3 0.0274).
  - Use full simulated games (`simulate.py`, 30 games per level, fixed seeds), because wild pitches need runners on base. Rescale and repeat twice.
  - `hs` has no wild-pitch target, so keep its constants.
  - **Sensitivity:** off-speed:fastball ratios of 2:1 and 4:1 must still pass band B8b.
- **Tolerances:** walks ±0.3 points, HBP ±0.2 points, wild pitches ±0.3 points per batter.
- **Strikeouts:** report them but don't fit them, because they depend on the hitter model. If strikeouts per batter move more than 1.0 point from the target, record it for the handoff and stop and ask.
- **Fixed point:** the mix depends on these numbers, and the fit depends on the mix. Run Phase 4 → Phase 5 → Phase 4 until every fitted value moves less than 0.01 between rounds, at most 3 rounds. Report every round.

### Phase 5: Tune the mixing (`tune_v10.py`)

- **Free values:**
  - `κ_T` ∈ {1, 1.5, 2, 3, 4, 6}
  - `κ_L` ∈ {1, 1.5, 2, 3}
  - `GUARD_TYPE` ∈ {0.020, 0.030, 0.040, 0.060}
- **Search:** grid search on the CI tier (bands and scenarios only, about 2 minutes per point). Then confirm the best three candidates on the full tier, and run the 90-game simulator comparison only for those three (about 25 minutes each with `--jobs 4`).
- **Pick:** the candidate that passes every enforced band (section 4) and every non-tracked v1.0 scenario check, and has the smallest simulator regret increase vs v0.9. Ties go to smaller κ, then smaller `GUARD_TYPE`: closest to cost-optimal, and most protective.
- **Run budget, as a hard limit:** the paired `regret_w_exp` increase must be at most +0.25 runs per game, over 90 paired games, seeds 101–110. Also report the one-sided 95% upper bound.
- **Predictability:** mean exploitability X on the CI grid must be at or below v0.9's.
- **If nothing passes:** print the frontier (which bands conflict, and by how much, at the closest candidates), then stop and ask Drew. Don't add terms.
- **Write the chosen values** into both engines as named constants, with a comment that points to `results/tune_v10.md`.

### Phase 6: JS port, the app and the website

1. **Port every Phase 3 and 4 change to `app/engine.js`.** The operator, the at-bat plan, history, the rules and the new params all read from `app/engine_data.json`. Then:
   - Run `make_parity_v10.py` and `parity_v10.js` (maximum difference 1e-9).
   - Copy to `web/lib/engine.js` and `web/lib/engine_data.json`.
   - Update `web/lib/engine.d.ts` for any new exports.
2. **App changes in `app/index.src.html`**, then rebuild `app/dist`:
   - **History:** build `history` for the current at-bat from the pitch log, including each foul's read (`back`/`pull`/`opposite`) and each whiff's read.
   - **Plan line:** show it under the call. It refreshes when the plan is rebuilt.
   - **Why lines** for RP1, RP2, CR1, CR2, the fallback and the landing-filter change.
   - **Fallback flag:** show it ("Nothing's working — think about a change").
   - **Re-solve:** rebuild when runners or outs change (3.4).
3. **Speed:** `app/budget_v08.js` must stay within its existing budgets. The fresh call was 197 ms against a 200 ms limit before. If v1.0 exceeds it, profile and fix; don't raise the limit. If it can't fit, stop and ask.
4. **App suites:** run the app's e2e tests from `app/`, the full `scripts/test-app.sh`, and `scripts/test-sql.sh`. Then `cd web && npm run build`.

### Phase 7: Learner safety switch (issue 23)

- **The problem:** it caught 20 of 30 noise-chasing seasons, with 0 false switch-offs. It was tuned on those same 30 seasons, so that number is optimistic.
- **New tool `app/learner_tune.js`**, with fresh seeds:
  - tuning set: seeds 700–759
  - held-out set: seeds 800–829
  - false-switch-off set ("right grades" seasons): seeds 900–929
- **Search:** `scoreMargin` ∈ {0.008, 0.010, 0.012, 0.015}, `scoreZ` ∈ {1.282, 1.645}, `scoreWindow` ∈ {300, 450, 600}, on the tuning set only.
- **Pass:**
  - on the held-out set, catches at least 25 of 30
  - on the false-switch-off set, at most 1 of 30
- **If nothing passes:** report the best trade-off and ask Drew. Don't tune on the held-out seeds.
- **After a change:** update `app/learner.js`, the notes in `app/stage2_test.js`, and the expected counts in `app/worlds_test.js` and `app/stage2_test.js`. Rerun all learner suites.

### Phase 8: Real-game replay tool (issues 19 and 24, built now and run when games exist)

- **New script `tools/replay_real.py`:** takes a charted-game export (the app's JSON export, or an events dump), replays every pitch through the engine, and reports how the engine's predicted outcome rates compare with what happened:
  - balls, called strikes, whiffs, fouls and contact, by call
  - walks, strikeouts and HBP per batter
  - how the learner would have moved each grade
- **Test it on a synthetic export** made from simulated games, where the right answer is known.
- **No Supabase reads** without Drew's go-ahead at that moment. Ask him whether real charted games exist.

### Phase 9: Verify, write it up, and stop

1. **Freeze the new golden files** `golden/golden_v10.{py,js,json}` from `golden/cases.py`, generated once the engine is final. CI runs `golden_v10` (Python and JS) instead of `golden_v09`. The v0.9 golden files stay in the repo untouched, as history.
2. **One gate script, `scripts/v10_gates.sh`,** runs everything below and prints PASS/FAIL per line:
   - `tests.py`, `tests_v10.py`, `tests_v09_followups.py` (updated for v1.0)
   - `golden_v10` in Python and JS
   - parity v10
   - `callsheet.py --tier full`
   - `scenarios_v10.py`
   - `tools/exploit.py`
   - `tools/sim_floor.py` (v1.0 vs the v0.9 baseline)
   - the learner suites
   - `scripts/test-app.sh` and `scripts/test-sql.sh`
   - the web build
   Put the CI tier of the call-sheet test and the v1.0 scenarios into `scripts/test-app.sh`.
3. **Independent review:** a fresh-context agent that hasn't seen the work. Give it this plan, the diff against `v0.9`, and the gate outputs. Ask it to look for:
   - logic gaps
   - places Python and JS could drift
   - bands that pass for the wrong reason
   - whether any change touched the hitter boundary
   Fix what it confirms. Re-run the gates.
4. **Reports:**
   - **`docs/V1.0_REPORT.md`:**
     - each of the 28 issues plus inside pitches, with before and after numbers from `callsheet_v09` and `callsheet_v10`
     - scenarios before and after
     - the simulator floor result
     - exploitability before and after
     - the learner switch result
     - what was not fixed and why
   - **`docs/HANDOFF_hitter_model.md`** (section 6).
   - **README:** update the engine section.
5. **Push `v1.0-work`** and confirm CI is green on GitHub with `gh run list`.
6. **Stop.** Use AskUserQuestion to ask Drew whether to fast-forward `main`. Do nothing to main or Supabase until he says yes.

---

## 4. Bands checked by `callsheet.py`

**Definitions:**
- A **situation** is level × arsenal × base-out × side × game state × count.
- An **allowed pitch type** passes the confidence cutoff, the landing filter, the coach rules (CR1, CR2) and both guards.
- **Exempt from the variety bands:** 3-0, and situations with one allowed pitch type.

**Pass rule:** an enforced band passes when it holds in at least 98% of its eligible situations and no situation misses by more than 3 percentage points. Bands marked **100%** must hold everywhere.

| Band | What it checks | Enforced? |
|---|---|---|
| B1 | No pitch type above 85% | yes |
| B2 | Every allowed secondary at least 5%. One baseball carve-out: a changeup to a same-side hitter needs only 2%, because real pitchers rarely throw it there. | yes |
| B3 | No single exact call (pitch and target) above 60%, except 3-0 fastball | yes |
| B5 | Overall usage, chance-weighted over counts. Fastball: 40–70% for three- and four-pitch arsenals, 50–78% for `two_pitch`, 25–55% for `changeup_first`. A grade-3 allowed secondary: 10–35% (7–30% in `four_pitch`). A grade-5 secondary: 25–50%. | yes |
| B6 | Middle share, for command 3+ arsenals. Pitcher ahead (0-1, 0-2, 1-2): at most 10%. Even (0-0, 1-1, 2-2, 3-2): at most 35%. 1-0 and 2-1: at most 55%. 2-0 and 3-1: at most 70%. 3-0: no limit. Add 15 points to each limit for `low_command`. | yes |
| B7 | Inside, for command 3+ arsenals: inside share of fastball calls (chance-weighted) at least 12%; inside calls at 3% or more in at least half of the non-three-ball situations | yes |
| B8a | Ground balls: with a runner on 1st, fewer than 2 outs and fewer than 2 strikes, the share of down targets is no more than 2 points below bases-empty with the same outs | yes |
| B8b | With a runner on 3rd (catcher block 3), off-speed share is at least 60% of the bases-empty share, averaged per level, arsenal and count | yes |
| B8c | A pitch that isn't landing gets 0% with a runner on 3rd | yes, 100% |
| B9 | The repeat checks from 3.1 | yes, 100% |
| B10 | The fallback check from 3.2 | yes, 100% |
| B11 | Hard rules: no chase at 3-0 or 3-1; never re-call a shaken-off pitch; the existing 2-2 attack-the-zone checks in `tests.py` | yes, 100% |
| B12 | Coach rules CR1 and CR2 | yes, 100% |
| B13 | Eye grade: a low eye grade (chaser) raises two-strike chase share by at least 5 points over eye 3. This already works; it guards against a regression. | yes |
| T1 | Contact grade 5 vs 1 changes two-strike calls by at least 5 points of chase share | tracked (hitter model) |
| T2 | Crowding raises the inside share of fastballs by at least 5 points | tracked (hitter model) |
| T3 | Power grade 5 vs 3 moves calls beyond the CR2 middle rule (for example, fewer heart fastballs up) | tracked (hitter model) |
| T4 | Engine whiff per swing on heart and edge fastballs within 3 points of Statcast (13.6–15.8% and 21–24%) | tracked (hitter model) |

---

## 5. Why lines to add

They must be short and plain, matching the current style:
- **RP1:** "Not the same pitch and spot a third time."
- **RP2:** "He fouled it straight back. Don't go back there yet."
- **CR1:** "He's hit this hard twice today."
- **CR2:** "Power hitter: stay off the middle."
- **Fallback:** "Nothing's working. Going with what's landing. Think about a change."
- **Landing filter with a runner on 3rd:** "Runner on 3rd: no dirt ball with a pitch that isn't landing."
- **Plan line:** "Plan: {opener}, put away with {put-away}."

---

## 6. What goes in `docs/HANDOFF_hitter_model.md`

**What v1.0 changed that the hitter work must keep:**
- the operator and the usage table
- the guards
- history
- the coach rules
- `pitcher_side_params.py`

**Commands to rerun after any hitter-model change:**
- `python3 fit_pitcher_side.py`
- `python3 tune_v10.py`
- `scripts/v10_gates.sh`

**Tracked bands T1–T4, to make enforced once the hitter model supports them.**

**Open items that belong to the hitter work:**
- **Issue 13:** whiffs. Heart fastball whiff per swing is 6.0% in the engine vs 13.6% real.
- **Issue 14:** how much sitting on a pitch matters (R2: 0.0055 runs at 2-0).
- **Issue 15:** level scaling `RHO_L`.
- **Issue 17:** the simulated hitters have no grades.
- **Issue 18:** an independent simulator world, so the engine isn't judged by its own model.
- **Power and contact effect sizes** (T1, T3) and the **crowding effect** (T2).
- **Edge called strikes:** the engine calls 30.8% of edge takes strikes vs 49.2% for Statcast's shadow zone. The band definitions differ, so check them before changing anything.
- **Strikeouts:** any strikeout-rate drift found in Phase 4.

---

## 7. What this plan deliberately does not do

- **No hitter-math changes** (section 2).
- **No invented ground-ball bonus.** R6 shows the model's ground-ball value is small, not backwards. B8a checks that runners don't make the engine go up in the zone. If B8a fails after Phases 4–5, stop and report rather than add a term.
- **No forcing inside or variety with rules.** They come from fixing the HBP price and the operator. The only new hard rules are RP1, RP2, CR1, CR2 and the landing change: rules a coach would state out loud.
- **No committed pitch-by-pitch sequence.** Committing to a sequence makes the pitcher predictable. The plan is shown to the coach and comes from the same policies the calls are drawn from.
- **No Supabase schema change.** If one turns out to be needed, stop and ask.

---

## 8. Where each issue from the Nov 6 check is handled

| # | Issue | Handled by |
|---|---|---|
| 1 | Too predictable | 3.7 operator, 3.6 guards; B1, B3, exploitability |
| 2 | Too much middle | 3.7 target usage table; B6 |
| 3 | Scared of runners | 4c wild-pitch fit; B8b |
| 4 | Ground-ball logic | 4c, 3.7; B8a (no invented bonus, see section 7) |
| 5 | Pitch quality all or nothing | 3.7 with κ tuning; B5 |
| 6 | Off-speed shut out of hitter's counts | 3.6 pitch-type guard, 3.7; B2 |
| 7 | Dirt ball with a runner on 3rd | 3.3; B8c |
| 8 | Repeats | 3.1; B9 |
| 9 | Fallback | 3.2; B10 |
| 10 | Scenarios fail | 1.2 v1.0 file, 3.1 (F5), 3.5 (H1, I4) |
| 11 | No at-bat plan | 3.8, 3.4 |
| 12 | Coach inputs weak | 3.5 CR2, B13; T1–T3 handed off |
| 13 | Too few whiffs | Handoff (hitter model); T4 |
| 14 | Hitters don't adjust | 3.7 protects the calling side; the root cause is handed off |
| 15 | MLB numbers scaled down | Handoff |
| 16 | Old HBP guess | 4a |
| 17 | Simulated hitters have no grades | Handoff |
| 18 | Simulator tests the engine against itself | Simulator is a floor only (1.4, Phase 5); independent world handed off |
| 19 | No real game data | Phase 8 tool; ask Drew about charted games |
| 20 | No call-sheet test | 1.1 |
| 21 | Thin scenario coverage | 1.2 new rows; 1.1 arsenals |
| 22 | Simulator used as judge | Bands and scenarios decide; simulator is only the 0.25-run floor |
| 23 | Learner safety switch | Phase 7 |
| 24 | Learner unproven on real games | Phase 8 |
| 25 | Old code | Phase 2 |
| 26 | Unused golden files | Phase 2 |
| 27 | Plan doc stale | Repo docs in Phase 9. The claude.ai plan doc gets updated from claude.ai after the merge. |
| 28 | Project storage | Done Nov 6 (33 stale copies removed, now under the limit) |
| new | Inside pitches nearly absent | 4a HBP fit, 3.7 target usage; B7 |

---

## Appendix: the Nov 6 sweep arsenals (copied from `/tmp/sweep.py`)

```python
P = e.Pitch
ARS = {
 "slider_best": [P("Fastball","FB",grade=3,command=3,conf=0.80,shape="ride",velo=88), P("Slider","SL",grade=4,command=3,conf=0.80,shape="tight",velo=80), P("Changeup","CH",grade=3,command=3,conf=0.70,shape="fade",velo=80)],
 "avg_changeup": [P("Fastball","FB",grade=3,command=3,conf=0.80,shape="ride",velo=88), P("Slider","SL",grade=3,command=3,conf=0.75,shape="tight",velo=79), P("Changeup","CH",grade=3,command=2,conf=0.60,shape="fade",velo=80)],
 "plus_changeup": [P("Fastball","FB",grade=3,command=3,conf=0.80,shape="ride",velo=88), P("Slider","SL",grade=3,command=3,conf=0.75,shape="tight",velo=79), P("Changeup","CH",grade=5,command=4,conf=0.90,shape="fade",velo=79)],
 "two_pitch": [P("Fastball","FB",grade=4,command=3,conf=0.80,shape="ride",velo=90), P("Curveball","CB",grade=3,command=3,conf=0.70,shape="loopy",velo=74)],
 "four_pitch": [P("Fastball","FB",grade=3,command=3,conf=0.80,shape="ride",velo=88), P("Slider","SL",grade=3,command=3,conf=0.75,shape="tight",velo=79), P("Curveball","CB",grade=3,command=3,conf=0.70,shape="loopy",velo=74), P("Changeup","CH",grade=3,command=3,conf=0.65,shape="fade",velo=80)],
}
# New in v1.0: sinker_gb (FB shape "sink"), low_command (every command 2), changeup_first (FB grade 2, CH grade 5, SL 3).
```
