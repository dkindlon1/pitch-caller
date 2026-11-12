# Pitch Caller engine v1.0 — build plan

Date: 2026-11-09. Start line: `main @ 3b9d645` (v0.9, one engine). Supersedes the Nov 6 v1.0 plan (scrapped Nov 8).
Input: `docs/REVIEW_v0.9_2026-11-08.md` — 27 confirmed issues (#26 downgraded). This plan was built by three panels
(pitching coaches, statisticians, software developers) working from that review and the code, then reconciled.

## 0. What v1.0 is

**v1.0 fixes what v0.9 already has so the reasoning holds. It adds no new terms.** The coaches' panel was unanimous
that nothing is *missing*: sequencing, timing, eye level, situation, running game, umpire, fatigue, confidence and hitter
memory are all present — the problems are wrong semantics (chase counted as a miss, shake-off by spot, repeat penalty on
takes, "late" by inning number), inert terms (hitter memory, the sit game outside two strikes), a guardrail doing the
window's job, and an explanation layer that misreports the math. Drew's standing rules apply throughout: baseball logic
and real data above simulation; one engine, no flags; nothing is "done" until the check ran and its output is in the
build report; don't over-build; this is the last big engine round.

Drew runs this himself in Claude Code on Windows (`C:\Users\kindl\OneDrive\Desktop\pitch-caller`). Each step ends with its
proof command and captured output appended to `docs/BUILD_v1.0_REPORT.md`.

## 1. Decisions (Drew, Nov 9 — these are settled)

| # | Decision |
|---|---|
| D1 | **3-1 is not automatically the fastball.** The 3-1 call is the best pitch that is *being controlled and thrown for a strike today* — rank by expected strike (command + today's landing), so a pitcher whose slider is landing better gets the slider. **Moderate mix:** top call ~55–70%, any pitch landing today is live. (3-0 stays as Drew set it: tightest, cheapest pitch.) |
| D2 | **Shake-off = the pitch, any spot.** Exclude by pitch name for the rest of the at-bat. No spot toggle. |
| D3 | **Mashed twice = large soft penalty**, not a hard exclusion. The engine can still call it when it's clearly the best pitch. |
| D4 | **Sit game stays as-is; drop the game-theory claim** in README/spec. The predictability grid is the guarantee. |
| D5 | **Wire tunneling on chase swings** (split `beta_tun` → whiff 0 / chase 0.310, default on); the Step 2/7 yardstick keeps or drops it. |
| D6 | **Arm-side vs glove-side misses: deferred.** Note in README that `landing()` is side-blind. |
| D7 | **Runs budget 0.25 runs/game.** Under that, Step 2 ships; over it, stop and show Drew the number. |
| D8 | **Repeat after a take: no penalty.** `rep_same_spot` applies only after a foul or contact. |
| D9 | **Cleanup: delete all of it** — v0.7c solver, dead functions, temperature floor, and the old v0.7c/v0.8 golden files. v0.9 golden kept frozen as history. |
| D10 | **Runner-advancement gaps (#23): skip for 1.0.** |
| D11 | **Drew runs the whole build in Claude Code.** |

## 2. Steps

### Step 0 — Freeze the start line (½ day)
- `git tag v0.9-final`. Run and capture: `python3 tests.py` (19/19), `python3 golden/golden_v09.py` (500 exact),
  `node golden/golden_v09.js` (exact), `scripts/test-app.sh` (exit 0).
- **Fast parity harness** (new): `golden/fast.py N` and `golden/fast.js N` run `cases.compute()` on the first N golden
  inputs in both languages and diff them *live* (not against the frozen file). N = 40 ≈ 40 s. This is the per-edit check;
  full goldens run only at step ends.
- Pull Statcast once: `python3 fetch_statcast.py` (CSVs are gitignored under `data/statcast/`; 2024 train, 2025 held-out).
- Windows: `git config core.autocrlf false` (goldens are LF); run Python with `-X utf8`.
- **Port the realism gate to the live engine (moved here from Step 6 by the fresh-context review).** `tests.py:132-140`
  → `calib.evaluate` → **`call_mixed`** (`calib.py:69`): every K/BB/HBP realism pass to date measured the retired v0.7c
  call path. Port `calib.evaluate` to `call_v08`, re-run `calib.py`/`fit_all.py` to recalibrate `OUTCOME_ADJ` against
  the real rates, and capture the baseline K/BB/HBP per level in the build report. Steps 3 and 5 gate on *this* number.
- **Yardstick plumbing.** `readthrough/step7_regret.py` diffs two CSV run directories and `run_games.py` runs only the
  checked-out engine; `runs/` is gitignored so no v0.9 baseline games exist on Drew's PC. Add an engine-module hook to
  `simulate.py` (`CALL_ENGINE=<path>` importing an `engine.py` from a `git worktree` of `v0.9-final`) so v0.9's calls can
  be scored in v1.0's world; generate the v0.9 baseline (110 games, seeds fixed) once here. Without this, "fixed-world
  v1.0 vs v0.9" cannot be run.

### Step 1 — Mechanical correctness (1 day) — review #2, #9, #6, #10, #8, #16, #27
| Item | Python | JS | Proof |
|---|---|---|---|
| #2 re-solve on outs/bases | `frozen_inputs`/`needs_resolve` `engine.py:1808-1824` add `outs, bases, infield_in` | `engine.js:1278-1287` | new test: solve at R1, move runner to R2: `needs_resolve` flips True, AND the stale-table dist differs from the fresh one (the old behavior) — not "call_v08 == fresh solve", which is tautological |
| #9 input validation | `call_v08` and `solve_table` call `check_inputs` first | already does (`:558-567`) | `outs=3` → `ValueError` |
| #6 shake-off (D2) | `allowed_calls` `:1549` exclude by name; `simulate.py:467` | `engine.js:1015`; `index.src.html:997` `shaken` | after excluding FB, FB share = 0.000 |
| #10 chase EV/HBP | `EV_ADJ` chase +3 FB / −3 OS; `HBP_LOC` chase FB 0.5 / OS 0.8 (`:196, :217`) | both tables | HS P(HBP) on FB chase ≤ P(HBP) on middle |
| #8 late-and-close | `is_big_spot` → `s.inning >= sched(s) - 2` (`:334`) | twin | HS 5th/7, tie, R2 → True |
| #16 gb_rate | constants ← `fit_v08.json results.gb_types` (`:928`) | twin | values match json; re-run `inplay_fit.py` once |
| #27 default level | `Situation.level` default: make both `"college_d3"` or require it | `engine.js:58` | grep |
- Goldens change (everything but #2/#9/#27). **Re-freeze once at step end as `golden/golden_v10.*`; v0.9 files stay frozen forever.**
- Proof: `fast 40` clean after each edit; `golden_v10.py` + `.js` exact; `tests.py` 22/22.

### Step 2 — One window: the guardrail redesign (1–2 days, highest blast radius) — #1, #25, D1, D7
- `root_call` `:1736-1760` / `rootCall`: **delete the δ cut** (`keep = …` at `:1752`) so `policy_from_costs`' stakes-scaled
  window is the only never-pick rule. (The draft said "apply δ to look value instead"; the fresh-context review measured
  look value at ±0.0004 runs vs δ = 0.02 across every count, so that operator would cut nothing — it is the same as
  deletion with extra compute. Say what it is.) #25 is then closed for free: table and root use the same operator.
  **Consequence to put in front of Drew:** this loosens every hitter's count, not only 3-1 — measured on AVG3 at D3,
  2-0 goes from FB-middle 100% to FB 54% / SL 24% / CH 21%; 3-1 to ~0.64–0.75 top share. The read-through
  (`scenarios_v10.json`) must grade 2-0 and 2-1 calls, and the grid gets a **floor** too (see below).
- Known limitation to record in README, not fix: because look value is ±0.0004, the "planning ahead" layer barely moves
  any call, and after Step 4 the why-line will rarely say "Sets up". That is the honest state of v0.8's planning term.
- D1 — **3-1 rule.** At 3-1 the candidate set is every pitch landing today (`not_landing` false) and the mix is
  **moderate**: top call ~55–70% for AVG3, every landing pitch live. Ranking stays the myopic cost (`root_call:1753`) —
  no new ranking is needed: with the guardrail gone, the fresh-context review measured that today's landing already
  drives the 3-1 top call (slider 8/10 vs fastball 4/10 → slider on top at all three levels). Implement the width as a
  3-1 entry in `count_stakes`/`stakes_factor` (`:1137-1156`) chosen to hit the band — not the 3-2 setting, not the
  fastball by default; 3-0 untouched.
  **The slider-vs-fastball check is a Step 3 acceptance item, not Step 2** (see Step 3): it passes today with the biased
  `LAND_CENTER`, and with Step 3's realistic centers `wild_today` for the 4/10 fastball drops from 0.6 to ~0.27 and the
  fastball can come back on top. Tune the 3-1 band in Step 2, confirm the landing-driven ranking after Step 3.
- **Predictability grid (replaces `tests.py:157-165`, which tests the retired path):** `call_v08`, 12 counts × {hs, d3, d1}
  × {AVG3, two-pitch, four-pitch, power, finesse} × bases {empty, R1, R3}. Assert: top-call share ≤ 0.85 and ≥ 2 calls
  survive the window in every cell except 3-0; at 3-1 for AVG3, top share 55–70% and two pitch *types* above 10%.
  **Floor:** in 2-0, 2-1, 3-1 the top call keeps ≥ 50% for AVG3 — a hitter's count still throws the best strike most of
  the time; if the floor fails, tighten `stakes_factor` for that count rather than restoring the guardrail.
  **D5 ordering:** run the grid and the yardstick **first with tunneling off** (Step 1 + guardrail only), record them,
  then wire `beta_tun_chase` and run both again. One wiring, one comparison, no toggle left in the engine (D9: one engine).
  Note `pair_terms` does not apply `RHO_L` to tunneling; Step 5 #19 will scale it by 0.6 at HS — re-run the HS grid then.
  Keep Drew's existing checks: no chase at 3-0/3-1/2-2; 2-2 attacks the zone; v0.8 chase rate.
- **Yardstick:** `readthrough/step7_regret.py` fixed-world regret, v1.0 vs v0.9, **~110 paired games** (SE ≈ 0.04
  runs/game — enough to bound the variety cost against D7 and to see a 0.10 change at 2.5 SE). Report runs-allowed too but
  don't gate on it (SE 0.5 at 90 games; ~1,700 games for the same precision). Report the number; Drew picks δ/window if
  it's over budget — no silent tuning.
- Re-freeze `golden_v10`.

### Step 3 — Landing, confidence, repeats (1 day) — #4 (all parts), #13
- **One landing anchor** (the draft had two incompatible ones — a scalar `p.strike_rate` center and a triple record;
  this is the single definition): `landing_today[pitch] = (strikes, expected_strikes, n)` where `expected_strikes` sums
  the model's expected strike probability *at each called target* (so a taken chase contributes ~0.42, not a charged
  miss). `landing_estimate` returns `est = shrink((strikes − expected_strikes)/n → 0, n, k=LAND_K)` — a *deviation from
  his own expectation*, centered on zero; `wild_today` is built from that deviation exactly as today but with 0 as the
  center. `p.strike_rate` (learned) is no longer a center — it is already inside the per-target expectation once the
  learner serves it. `LAND_CENTER` is deleted. `not_landing = n ≥ 4 and est ≤ −0.15`.
  The learner's served `strike_rate` is anchored to `landingEstimate(...)[1]` (`learner.js:210`); re-anchor it to the
  per-target expectation; expect served rates to drop ~0.1, which is correct.
  Call sites: `simulate.py:535-536`, `index.src.html:866-868`; `landing_estimate`'s `st, n = ev` unpack (`:351-358`).
  **Compat read:** in-progress games in localStorage hold the old `[strikes, n]` pairs (`index.src.html:634, :867,
  :1350`) — read a 2-tuple as `(strikes, n·old_center, n)` once, so an open game doesn't crash on upgrade.
- Confidence: skip the −0.02 "ball" debit when the target was chase and the ball was `off` (keep for noncomp). **When no
  location is logged** (location is optional in the app, `index.src.html:1327`): treat a ball on a chase target as `off`
  — the target was a ball by design. HBP no longer maps to "ball" (`simulate.py:550, :562`; `index.src.html:889, :892`).
- ~~Calibration pass with `wild_true` off~~ — **removed.** The review's claim that the simulator bypasses the estimate
  path was wrong: `wild_true` is set only on the truth-world situation (`simulate.py:163`); the engine's situation
  (`:437-448`) carries `landing_today` and no `wild_true`, so the estimate path already runs in every simulated game.
  Turning `wild_true` off would strip real off-day wildness from the world, not test anything.
- **D1 acceptance (moved here from Step 2):** AVG3, slider 8/10 and fastball 4/10 today, 3-1 → slider is the top call at
  hs/D3/D1 with the new centers.
- #13 / D8: `rep_same_spot` (`:729-733`) applies on `foul`/contact only; **no penalty after a take** (ball or called strike).
- Realism gate (ported in Step 0): K/BB/HBP within 1 point at hs/D3/D1 against the Step 0 baseline.
- Tests: `wild_today` < 0.03 after 12 pitches for a pitcher at the model-expected rate, every level; four chase takes
  leave `wild_today` and confidence unchanged; a learned 0.30-strike-rate curve going 2/4 is NOT blocked; a 0.72 pitch
  going 2/4 IS flagged; FB up-away *taken* then repeated → whiff within 0.002 of fresh; after a foul the penalty applies.
- Re-freeze.

### Step 4 — Explanations (1 day) — #3
- `why_line` `:2012-2087`, `intent_label` `:2113+`, JS twins:
  - 3-ball counts: pass `myopic=True` to the term re-costs when `info["M"]` is the myopic matrix (`:1753`).
  - Eye level: choose the template by `sign(P08["beta_E"])` ("Stays at his eye level — a change costs here" while
    negative); drop the "after the {last}" suffix (the term compares to the look, not the last pitch).
  - "Sets up the X": evaluate the policy at `(b, k+1)` with `look_update(look, p, q)` and name its top call.
  - One comparator (the myopic best `b*`) for both why and intent; why term "look value" ⇔ intent "Setup".
- New `tests_v10_explain.py` over ~60 golden inputs: the named term's Δ is the minimum; eye-level line agrees with the
  coefficient sign; setup line names the engine's actual next-count top call; no "Sets up" with "Best strike here".
  Add `intent_label` output to the golden.
- App/DB: text only; `doc.v08.intent/.mechanism` fields unchanged (migration `20261112120100_v09_intent.sql` needs
  nothing). Old event docs keep old text.
- Re-freeze.

### Step 5 — Fits and model changes (2–3 days; each sub-item gated on its own numbers) — #7, #11/#28, #12, #22, #19, #20, #21, #23, #24, D3, D5, (D6)
Every fit: `seq_fit.py`'s existing hygiene — 2024 train / 2025 held-out, game-clustered bootstrap, cluster-robust SE,
**ship only on held-out gain > 2 boot SD**. Never fit a parameter to the simulator except the two engine-vs-real
calibrations (K/BB/HBP rates; RHO_L).

| Item | Work | Engine change |
|---|---|---|
| #7 one owner of in-game memory | Re-run `readthrough/step3_fits.py` with R5 `damage` features as controls and M2 keyed on actual plate location (as originally fitted). If M1/M2 survive, `damage()` keeps only the cross-game seed and drops its class×spot term from whiff/hard; if damage absorbs them, drop MM. Cap M1 and M2 separately; remove the shared `fam_cap` clip on the sum. | `:93-101`, `:638-649`, `simulate.py:531/601`, `index.src.html:816-819/878-879`; M2 keyed on logged location with target fallback |
| D3 coach rule | Implement "mashed twice" as a **large soft cost penalty** on (pitch, height) — a separate, named constant added in `cost08`, not folded into the fitted MM logits (rules and fits don't share a parameter). Height buckets are `HEIGHTS` = up / middle / down (`:103`), so `middle` is its own bucket, not a half. **The `s.matchup` counts stay as data regardless of what #7 decides about the MM logit term** — the penalty reads them. Size it so the mashed pitch's share drops by at least half at every count but 3-0, yet it can still be called when it is clearly best. Test: `matchup={"hard\|FB\|middle":2}` → FB middle share ≤ half of baseline; one hard hit moves share < 5 points. | `cost08`, new `MASHED_PENALTY` |
| #11/#28 power scale | `fit_hitter_spread.py:30`: `g_w` target = one SD of unshrunk hard-hit share (`power_sd_raw` 0.0518, ≥100 BIP). Refit all three g's on v1.0 settings (header says they're v0.7c). `POWER_HR` → 0.112 per grade point. | `POWER_HR`, `P08` g's |
| #12 infield-in | Statcast `if_fielding_alignment == "Infield"`, R3, < 2 outs: GB BABIP and R3 scoring on GB outs vs standard. Two numbers into `TYPED`. Fallback +0.08 BABIP if the 2025 interval includes it. Test: low-target share rises < 3 points with the flag (today +8). | `:970`, `TYPED` |
| #22 same-side CH | Delete the `outcome_probs` +0.2 duplicate (`:828-829`); keep `shape_fit`'s −0.3 or fold into one fitted `CH\|same` coefficient. Test: same-side CH share at 2-1 ≥ 60% of opposite-side. | `:626-631`, `:826-830` |
| #19 RHO_L rule | Scale every MLB-fitted *behavioral* term (timing, eye level, familiarity, MM, SIDE, POWER_HR, tun) by `RHO_L`; leave structural terms (kappa, beta_y, gb) unscaled. Then test 0.6: simulated HS K% sensitivity to grades vs the real spread in `pitcher_lines.py`; fit it as one scalar if 0.6 is arbitrary (engine-vs-real, not circular). | `:721-723`, `:823` |
| D5 tunneling | **Wired (do this in Step 2 so the yardstick sees it):** split `beta_tun` → `beta_tun_whiff` (0) and `beta_tun_chase` (0.310); `seq_fit.py:539` ships each from its own fit; `fit_v08.json ship` gets both keys. Yardstick decides whether it stays. Fix README "no effect". | `:735-741`, `pair_terms`, JS twin |
| #20 app seed | `seedDamage(m, 8, center = hitterGrades() !== null)` — compute grades first | `index.src.html:696`, `roster.js:83` |
| #21 cross-game key | `learner.js:688` key by kind + quad | learner |
| #23 runner rules | **Skipped for 1.0 (D10).** Note in README. | — |
| #24 look from location | `look_update` with the logged location when present, target fallback | `simulate.py:539`, `index.src.html:873` |
| #26 familiarity | **Dropped** — fitted term; "erases the pitch" didn't reproduce; #7 covers the concern |
| D6 side-blind misses | **Deferred (D6).** README note. |
- Parity after each sub-item (`fast 40`); re-freeze once at step end.

### Step 6 — One engine: dead code (1 day) — #18, #17 wording
- Delete from `engine.py` and both `engine.js`: `call_mixed`, `mixed_policy`, `at_bat_values`, `grade_call` (v0.7c),
  `cost`, `call_costs`, `sit_matrix`, `pairing`, `expectation`, `in_play_value`, `in_play_value_ev`, `IN_PLAY`,
  `ETA_LEAN` branch (`:1788, 1799-1801`), `Table.looked` branch, `T_unc` floor + its `sim_constants.json` key +
  `perturb.py`. `tunnel_score` stays (D5 wires it); if the yardstick drops `beta_tun_chase`, delete it and the
  "tunneling" intent term here instead.
- Callers that must be rewritten first (verified by grep): `tests.py:5-6, 26, 31, 45, 50, 116-117, 147, 159`;
  `fuzz.py:150, 156, 177, 190, 216, 223`; `calib.py:21, 69`; `simulate.py:25, 663` (`pregame_plan` → `root_costs`);
  `app/make_parity.py:60-66` + `app/parity.js:19-25` (retire in favour of `fast`); `app/learn_test.js:195`; JS export
  object `engine.js:1517-1519`. `app/index.src.html:1269` already uses `v08.gradeCall`.
- Calibration debt was paid in Step 0 (`calib.evaluate` ported to `call_v08`); confirm the realism gate still passes
  after deletion and that nothing else imports the removed names (`grep -rn "call_mixed" --include=*.py --include=*.js .` → 0).
- Delete `golden/golden_v07c.json`, `golden_v08.json`, `labels_parity.json` (unreferenced outside `golden/` and old
  reports). Fix README (tunnel wording; "19 regression checks"; the Files table's v0.7c description of `engine.py`).
- Proof: `grep -c "call_mixed\|mixedPolicy\|ETA_LEAN\|T_unc" engine.py app/engine.js web/lib/engine.js` → 0;
  `tests_v09_followups.py` one-engine check passes; `golden_v10` exact.

### Step 7 — Coverage and release (1 day) — #15
- Extend `golden/cases.py` (`sdict`, `from_dicts`, `inputs`, `compute`): `matchup`, quad-keyed `hitter_damage`, an
  `exclude` list, `intent_label`, `walk_suggestion`. **Final re-freeze `golden_v10` (500 cases).**
- New frozen coaching read-through `readthrough/scenarios_v10.json`: Drew's graded v0.9 calls stay pass/fail; add one
  scenario per fixed issue (post-WP re-solve, shake-off, chase takes, HS 5th-inning big spot, infield-in, mashed twice,
  repeat after a take, 3-1 mix).
- Learner: `outcome_probs` changed in Steps 3 and 5, so the v0.9 safety-switch thresholds (`learner.js:489-495`,
  retuned in 3b9d645) are stale. Run `app/worlds_test.js`; retune only if it fails.
- Rebuild `app/dist`; `scripts/test-app.sh` and `scripts/test-sql.sh` exit 0; write `docs/BUILD_v1.0_REPORT.md`;
  `git tag v1.0`.

## 3. Evaluation suite (what "v1.0 works" means)
1. **Predictability grid** (Step 2) — deterministic, ~2 min, in `tests.py`.
2. **Fixed-yardstick regret** vs v0.9, ~110 paired games, SE reported; variety cost ≤ D7.
3. **Coaching read-through** `scenarios_v10.json` — Drew's grades are the pass/fail.
4. **Why-line audit** `tests_v10_explain.py`.
5. **Realism gate** — K/BB/HBP within 1 point at hs/D3/D1, measured on `call_v08` (ported in Step 0).
6. **Goldens** `golden_v10.*` with the Step 7 coverage; `fast 40` per edit; `fuzz.py` logic checks kept.

CI (`scripts/test-app.sh`): `tests.py` → `tests_v10_explain.py` → `golden/fast.py 40` + `fast.js 40` →
`node golden/golden_v10.js` → build-diff → Node suites → smoke → rules_e2e → `tests_v09_followups.py`.
`--full` adds `python3 golden/golden_v10.py` (8 min) and `worlds_test.js`.

Parity rule: edit Python first, mirror in `app/engine.js`, `cp` to `web/lib/engine.js` (CI asserts `cmp`), run `fast`.
Never edit a frozen golden; a new freeze is a new file plus a commit saying which step changed outputs and why.

## 4. Risks
1. Step 2 may cost runs on the yardstick — report, don't tune silently (D7). It loosens every hitter's count, not only
   3-1; 2-0/2-1 must be graded in the read-through.
2. Calibration debt (now Step 0) — the outcome model was fitted and the realism gate measured under the retired call path.
3. Learner safety switch stale after Steps 3/5 — worlds_test before trusting it.
4. App call sites (`shaken`, `land`, `confEvent`, `seedDamage`) each need `v09_matchup_e2e`/`rules_e2e` and a rebuilt dist.
5. Why/intent vocabulary changes only going forward; any dashboard grouping by `mechanism` sees new values.
6. Windows line endings and encoding (Step 0).

## 5. Not in v1.0
- New terms of any kind (side-to-side beyond the shipped SIDE term, outcome-based situational learning). The only
  "new" behavior is wiring an already-fitted tunneling-on-chase coefficient (D5), subject to the yardstick.
- The Nov 6 hitter-model redo (scrapped; `HITTER_FOUNDATION_REPORT.md` stays as reference).
- #26 familiarity conditioning, #14 side-aware misses (D6), #23 runner rules (D10), the sit-payoff refit (D4).
- "Race to two strikes" and "Medium variety" become **acceptance checks** in the predictability grid (first-pitch
  strike-target share ≥ 85% for AVG3; no type > 85% per cell; every trusted landing secondary ≥ 5%), not new terms —
  the coaches' view is that the count values already carry them; the grid proves it or exposes the gap.

Rough total: 8–10 working days of Claude Code sessions, Steps 1–4 first (they fix the four Highs), Step 5 sized by what
the fits return.

## 6. Fresh-context review (Nov 9, 08:05) — GO WITH CHANGES, applied above
An independent reviewer with no history of the panels checked the plan against the code. Verdict: GO with seven
changes, all applied in this version: (1) Step 2 is "delete the guardrail", not a look-value operator (measured no-op);
(2) a 2-0/2-1 floor and read-through grading; (3) D1's slider-vs-fastball check moved to Step 3; (4) one landing anchor
(deviation from per-target expectation), `wild_true`-off pass removed as based on a misreading; (5) realism gate ported
to `call_v08` and recalibration moved to Step 0; (6) engine-module hook + v0.9 baseline so the yardstick is actually
fixed-world, run once before wiring tunneling; (7) no-location confidence rule and a localStorage compat read.
Corrections to `REVIEW_v0.9_2026-11-08.md` item #4 recorded there.
