# v0.9 engine review — 2026-11-08

Tree: `dkindlon1/pitch-caller` main @ `3b9d645` (Nov 6, "retune the safety switch for the single v0.9 engine").
Baseline before review: `tests.py` 19/19, `golden/golden_v09.py` 500/500 exact, `golden/golden_v09.js` exact.

Method: ten independent reviewers, each with one lens (5 coaching: counts & rules, location & landing, at-bat planning &
hitter memory, game situation, matchup/stuff/power; 5 quantitative: probability model, game-theory solver, fit
provenance, Python correctness, JS parity & app integration). Each was required to cite `file:line` and reproduce the
behavior by running the engine. Findings were then de-duplicated and the top items re-run independently (marked ✔).
Decisions Drew has already made (middle shares, chase rate, guardrail on at 0.010 as a concept, power term on,
"trusts nothing" fallback, tunneling skipped, eye-level sign) were not re-flagged.

Nothing in the repo was modified.

## Verification pass (Nov 8, 21:48 — every item re-run independently of the reviewer who found it)

| # | Status | How |
|---|---|---|
| 1 | **Confirmed** | `call_v08` grid: 3-1 FB-mid 100% (n=1) at hs/D3/D1; guardrail δ 0.0198 < window 0.056; FB up-in +0.0229 and SL mid +0.0258 cut |
| 2 | **Confirmed** | `needs_resolve` → False after R1→R2; stale vs fresh 1-1 mix differ (CH d-a 25% vs SL mid 34%) |
| 3 | **Confirmed** (all four parts) | Case 20: eye-level dist 0.32 (call) < 0.38 (alt), line "Changes his eye level". Case 38: "Sets up FB down-away" vs actual next top call FB chase 62%, intent "Get ahead". 3-2: seven inert terms tie at −0.0001, look value forced 0, picked reason is one of the tied inert terms |
| 4 | **Confirmed** | Engine's own expected strike rate (outcome_probs, 0-0, non-chase targets): hs FB 0.48 / OS 0.44, D3 FB 0.50 / OS 0.45, D1 FB 0.51 / OS 0.46 vs centers 0.66 / 0.58 — gap is larger than the reviewers estimated. hs FB 7/12 → `wild_today` 0.216. SL 1/4 on chase takes → `wild_today` 0.587. `simulate.py:535-536` and `index.src.html:866-868` count every pitch; `simulate.py:550` and `index.src.html:889` debit "ball" for every ball and HBP. Absolute-0.40 filter: strike_rate 0.30 @ 2/4 → blocked with wild 0.0; 0.72 @ 2/4 → kept with wild 0.39 |
| 5 | **Confirmed** | Hitter σ entropy ratio ≥ 0.998 at 0-0…3-1; 2-2 0.977; 3-2 0.853 |
| 6 | **Confirmed** | FB share 41% after excluding ("Fastball","middle") at 2-2 |
| 7 | **Confirmed** | `simulate.py:531` + `:601` both fire on "hard". `matchup={"hard\|FB\|middle":2}`: whiff 0.041→0.026 but share 0.199→0.191 at 1-1 and 0.144→0.145 at 0-0. `fam_cap` 0.5 vs MM hard×cap −0.692 |
| 8 | **Confirmed** | `:334` `inning >= 7`; `sched()` returns 7 for hs/travel |
| 9 | **Confirmed** | `call_v08` with `outs=3` returns Slider down-away; `check_inputs` would raise "impossible number of outs 3" |
| 10 | **Confirmed** | `EV_ADJ["chase"] = -3.0`, `HBP_LOC["chase"] = 0.8`; `y_target("chase","FB") = 3.8` |
| 11 | **Confirmed** | `fit_hitter_spread.py:30` `tg = {"g_c": sd_k, "g_d": sd_walk, "g_w": 0.03}` |
| 12 | **Confirmed** | 1-1, R3, 1 out: low-target share 0.179 → 0.258 with `infield_in` |
| 13 | **Confirmed** | Repeat FB up-away: whiff 0.0418 fresh → 0.0319 for last=ball, cstrike and foul alike |
| 14 | **Confirmed** | `landing()` returns identical dicts for up-in/up-away/down-in/down-away |
| 15 | **Confirmed** | grep count 0 in `golden/cases.py` and `app/make_parity.py`; `fuzz_lib.py:62` only FB/OS keys |
| 16 | **Confirmed** | `fit_v08.json results.gb_types` vs `gb_rate()` values |
| 17 | **Confirmed** | `results.tun_chase` β 0.310 SE 0.034 ship=true; `seq_fit.py:539` reads `tun_whiff` only |
| 18 | **Confirmed** | Zero non-def callers for `expectation`, `in_play_value_ev`, `call_costs`, `sit_matrix`; `in_play_value` reached only from `in_play_value_ev`; `pairing` only from tests. `T_unc` max 0.0020 vs live T ≥ ~0.0055 — floor never binds |
| 19 | **Confirmed** | RHO_L at `:81, :90, :101, :756` only |
| 20 | **Confirmed** | `index.src.html:696` `seedDamage(m, 8, true)`; `hitterGrades()` returns null when all grades are 3/absent |
| 21 | **Confirmed** | `learner.js:688` `add(ev.quad, …)` with no kind |
| 22 | **Confirmed** | `shape_fit` −0.3 (`:628-629`) + `outcome_probs` +0.2 (`:828-829`); 2-1 CH share 0.223 opp-side → 0.000 same-side |
| 23 | **Confirmed** (code) | `:981-986` `after()` keeps `b1`; `:992-994` single moves R1 to 2nd only |
| 24 | **Confirmed** (code) | `simulate.py:539` `look_update(look, p, q, s)` with the called target |
| 25 | **Confirmed** (code) | `:1716` `policy_from_costs` without the guardrail cut `root_call` applies |
| 26 | **Partly confirmed — downgraded** | Mechanism real: `familiar={"OS":4}` raises SL hard-contact 0.023→0.032 with no result conditioning. But the slider's share went **up** (0.298→0.366), not to zero, in my setup; the "erases the pitch" outcome did not reproduce. Treat as "unconditional familiarity" only |
| 27 | **Confirmed** | `engine.py:259` `"college"` vs `engine.js:58` `"college_d3"` |
| 28 | **Confirmed** | `results/step4b/power_hr.json` `power_sd_raw` 0.0518 vs 0.053 in `POWER_HR` |

---

## HIGH

### 1. ✔ The setup guardrail doubles as the never-pick window, so hitter's counts collapse to one call
`engine.py:1750-1756` (`root_call`). `keep = [a if cmy[a]-best <= GUARD_DELTA*run_scale]` is applied at **every**
count, then `solve_sit_game` mixes only inside `keep`. δ = 0.010·k is count-blind and is always narrower than the
stakes-scaled never-pick window from `windows()` (`:1459-1462`): at D3, δ = 0.0198 vs window 0.030–0.056 in all 12
counts. Over 100 golden inputs the window cut something the guardrail had kept in 0/100 cases — the designed
"randomness scales with the stakes of the count" rule survives only through temperature; the window half is dead.
At 3-ball counts the engine already ranks by myopic cost (`:1753`, `M = Mmy`), so there is no setup to guard — the
guardrail there is just a tighter window the spec never asked for.

Reproduced (`call_v08`, average 3-pitch arsenal, 1 out, bases empty; `n` = calls surviving the guardrail):

| level | 2-0 | 2-1 | 3-0 | **3-1** |
|---|---|---|---|---|
| hs | FB-mid 62% (n=3) | FB-mid 67% (n=2) | FB-mid 62% (n=3) | **FB-mid 100% (n=1)** |
| college_d3 | FB-mid 80% (n=2) | FB-mid 67% (n=3) | FB-mid 67% (n=3) | **FB-mid 100% (n=1)** |
| college_d1 | FB-mid 82% (n=2) | FB-mid 64% (n=3) | FB-mid 71% (n=3) | **FB-mid 100% (n=1)** |

At D3 3-1 the cut calls were FB up-in (+0.0229 myopic) and SL middle (+0.0258) — both inside the 0.056 window, both
would carry ~15–20% at temperature 0.0187, both removed by δ = 0.0198. A 2-pitch arsenal is 100% FB-middle at both
3-0 and 3-1 at every level. Across golden inputs the guardrail leaves exactly one call 9% of the time, two 12%.

Related: `count_stakes` (`:1137-1156`) is ball-value minus strike-value only, so 3-1 is rated an *average*-stakes count
(D3 f = 0.94, looser than 2-2's 0.59) — the design says "mix freely at 3-1" while #1 makes it the most deterministic
count in the engine. And `tests.py:157-165` ("3-1 still mixes", 82% FB) tests the retired `call_mixed` path, not
`call_v08`, so the suite gives false assurance.

**Fix direction.** One window. Skip the δ filter when `s.balls == 3` (nothing to guard), and elsewhere apply δ to
*look value* (full cost − myopic cost ≤ δ: "don't let a setup lift a clearly worse pitch") instead of to raw myopic
cost, so the stakes-scaled window is the only never-pick rule. Port the predictability test to `call_v08` and assert
top-call share < ~0.85 in every count except 3-0. Consider adding in-play damage to `count_stakes` or hand-setting 3-1.

### 2. ✔ The at-bat table is never re-solved when outs or bases change mid-PA
`engine.py:1814-1824` (`needs_resolve`) checks arsenal names, confidence > 0.10, wild-today > 0.10, umpire > 0.20 —
not outs, not bases. `simulate.py:420/452` and `app/index.src.html:765` reuse the table through wild pitches, steals,
caught stealings and pickoffs. `Table.V` was solved at the old base-out state (`:1692`), but `cost08` values every
PA-ending outcome at the live state (`:1568-1587`). So non-terminal outcomes (ball/strike/foul) carry the old run
environment and terminal ones the new — the engine compares two different states on one pitch.

Reproduced (D3, avg 3-pitch, 1 out, R1 → R2 on a wild pitch, now 1-1): `needs_resolve` → False.
Stale table mix: CH down-away 25%, SL down-away 17%, FB middle 14%. Fresh table: SL middle 34%, FB middle 24%,
FB down-away 16%, FB up-in 15%. The reviewer's probes also show 0-2 after a WP: stale 30–37% chase vs fresh 0%;
after a caught stealing: stale FB-middle 44–54% at 0-2/1-2/1-1 vs a fresh down-away mix. Direction is systematic:
runner advances → non-terminal looks too cheap → engine avoids contact; out added → terminal looks too cheap → engine
attacks the heart. Both are wrong coaching logic. The gap (0.09–0.21 runs) is 10–20× the guardrail.

**Fix.** Add `(outs, bases, infield_in)` to `frozen_inputs`/`needs_resolve` in Python and `app/engine.js:1278-1287`.
The table is ~1 s to solve.

### 3. ✔ The "why" line and intent label misreport the reasoning
- **Eye level is inverted.** `fit_v08.json` ships `beta_E = −0.142`, `beta_E_S = −0.253` (a change of eye level
  *hurts* — accepted). `why_line` (`engine.py:2052-2053`) picks the term whose removal most weakens the call and prints
  "Changes his eye level". With a negative coefficient, eye level is the deciding term exactly when the call has *less*
  change than the alternative. Golden cases 3, 17, 20: call's eye-level score 0.00, alternative 0.36–0.54, line reads
  "Changes his eye level." Same inversion reaches `intent_label` via `INTENT_MECH["eye level"]` (`:2090`). The
  "after the {last}" suffix is also wrong-headed: the term compares to the look ŷ (`:720-721`), not the last pitch.
- **"Sets up the X" names the wrong pitch.** `:2050-2051` and `:2152-2154`: `nxt = min(x for x in full if x[0] != p.name)`
  is the runner-up call *at the current count*, not what this pitch sets up. Golden case 38 (1-1, FB up-away): line
  says "Sets up the fastball down-away"; the engine's own top next-count call after a strike is FB chase (0.62).
  Case 42: "Sets up the changeup middle"; actual next is CH chase (0.54).
- **Why and intent contradict.** `why_line` compares to the best other call by *full* cost; `intent_label` to the best
  by *myopic* cost. In every "Sets up" case above the intent was "Get ahead — Best strike here". Both are shown
  together (`app/index.src.html:792-795`).
- **Three-ball-count deltas are contaminated.** `root_call` stores the *myopic* matrix as `info["M"]` when
  `s.balls == 3` (`:1753-1756`); `why_line` builds `base` from it but re-costs each term with `myopic=False`
  (`:2017-2034`). Every term's Δ picks up a constant offset and "look value" is forced to 0. At 3-2 seven inert terms
  tie at −0.00028 and `min()` returns the first in dict order — the displayed reason contributed nothing.

**Fix.** Branch the eye-level template on the sign of the fitted coefficient (or drop it from the vocabulary while
negative); compute the setup line by evaluating the policy at (b, k+1) with `look_update(look, p, q)`; use one
comparator (the myopic best) for both lines; pass `myopic=True` to the term-off re-costs at 3-ball counts.

### 4. ✔ "Is it landing today" is measured against a center the model itself never reaches
`engine.py:345` `LAND_CENTER = {"FB": 0.66, "OS": 0.58}` ("simulated college games"), used by `landing_estimate`,
`wild_today`, `update_confidence`, `not_landing`. The engine's own expected strike rate for a grade-3 arsenal is
well below it at every level (reviewer estimates D3 FB ~0.52–0.60, HS FB ~0.50–0.57; OS ~0.47–0.56). HS shares the
college center even though the HS fit deliberately makes HS pitchers wilder (`outcome_params` hs wild 0.22). So a
pitcher doing exactly what the model predicts (HS fastball 7/12) reads as `wild_today = 0.22`, zone share on
down-away drops 0.51→0.46, cost rises +0.005–0.0065 runs/pitch — half the guardrail window, applied all game, and it
hits the fastball harder than off-speed, nudging an ordinary pitcher toward off-speed as the game goes on.
**Correction (Nov 9, fresh-context review):** the original claim that "the simulator always passes `wild_true` so this
path was never exercised" was wrong. `wild_true` is set only on the truth-world situation (`simulate.py:163`); the
engine's own situation (`simulate.py:437-448`) carries `landing_today` and no `wild_true`, so the estimate path runs in
every simulated game. The center mismatch stands; the "never exercised" part does not. Separately, the K/BB/HBP
realism checks in `tests.py:132-140` go through `calib.evaluate` → `call_mixed` (`calib.py:69`), i.e. the retired
v0.7c call path — the live engine has never been the one measured against real rates.

Two things feed the same record wrongly:
- **Chase pitches poison it.** `simulate.py:535-536` and `app/index.src.html:866-868` count every pitch as
  strike/thrown regardless of target. The model's own expected strike rate on a `chase` target is ~0.42. A slider
  called as a 2-strike chase and taken four times did exactly what was asked, yet 1/4 → est 0.433, `wild_today` 0.59
  (near `LAND_MAX`). `allowed_calls` (`:1554`) then permits the blocked pitch *only* as a chase — the call that got it
  blocked.
- **Intended balls debit confidence.** `CONF_DELTA["ball"] = −0.02` (`:294`) is applied to every ball
  (`simulate.py:550`, `index.src.html:889`) regardless of target. Three chase takes drop conf 0.75→0.69, which lowers
  command and whiff, and the engine stops reaching for the chase pitch it just executed well. (HBP maps to the same
  "ball" debit.)

Also (Q4): the landing *filter* uses an absolute 0.40 (`:1539`) while `landing_estimate` shrinks toward
`p.strike_rate` when learned, so a learned low-strike-rate curveball (0.30 normal, 2/4 today = *above* normal) is
removed after 4 pitches with `wild_today = 0.0`, while a 0.72 pitch at 2/4 (well below normal, `wild_today` 0.39) is
kept.

**Fix.** Derive the center per level and class from the engine's own call-weighted strike expectation (or
`p.strike_rate` priors by level); exclude chase-target pitches from the landing record and the confidence "ball"
debit (or score them against their own expected rate); define `not_landing` relative to the center. ~~Run one
calibration pass with `wild_true` off~~ (withdrawn — see correction above). Add a `tests.py` check that `wild_today ≈ 0`
for a pitcher at the model-expected rate.

---

## MEDIUM

### 5. The sit game (game theory) is inert outside two-strike counts
`solve_sit_game` (`:1503`), `sit_response` (`:1336`). For the standard D3 arsenal the hitter's solved σ is uniform to
within rounding in every count without two strikes (H(σ)/H(uniform) ≥ 0.994 at 0-0, 1-0, 1-1, 2-0, 2-1, 3-0, 3-1);
only 2-2 (0.88) and 3-2 (0.70) show a real sit. Cause: the pure-sit payoff spread is tiny relative to T — at 3-1 a
hitter sitting *exactly* on the 100%-called FB middle costs the pitcher 0.006 runs more than sitting the wrong pitch
(0.33·T). So in hitter's counts the "balance point" collapses and π is just a stakes-scaled softmax over
window-trimmed costs. The README's "hard to read" justification is not what produces the mix. Either the sit payoffs
need to reflect what a hitter who *knows* the pitch does (not the correlational Statcast fit), or describe the mix as
window/temperature-driven and tune those for predictability directly. (Also: `exploitability()` at 3-1 reports 0.0032
runs for a 100%-predictable call.)

### 6. ✔ Shake-off excludes the pitch *and spot*, not the pitch
`allowed_calls` `:1549` excludes `(p.name, q)`; app and simulator build `shaken` as `[pitch, quad]`
(`index.src.html:997`, `simulate.py:467`). Reproduced: shook off FB-middle at D3 2-2 → FB is still 41% of the re-call;
SL down-away at 1-2 → slider 22%. At HS/college a shake means "not that pitch". Fix: exclude by pitch name; keep
spot-only as an optional toggle.

### 7. ✔ In-game hitter memory is counted twice, and still barely moves the call
Both `damage()` (R5, `:638-649`) and `matchup_whiff` (v0.9 item 6, `:93-101`) consume the same event: a hard hit
calls `K.update_damage` (`simulate.py:601`) *and* increments `mm["hard|KIND|target"]` (`:531`); the app does the same
(`index.src.html:816-819`, `:878-879`). Step 3 fitted M2 = −0.346 as the *total* whiff effect with no damage control,
and `:60` says the hard-contact effects "did not ship" — yet `damage()` adds whiff −0.087 and hard +0.175 on top after
one hard-hit slider at D3. Separately, MM only moves the whiff logit: `matchup={"hard|FB|middle": 2}` changes
FB-middle share 0.555→0.538 at 1-1 (+0.0002 runs); at 0-0 the mashed call's share *rises* 0.224→0.229. `hard_cap=2`
is moot because 2×−0.346 = −0.69 is clipped at `fam_cap` 0.5 (`:100`) — the second mashing adds −0.15. M2 is keyed on
the called target (`:99`) but was fitted on actual plate location (`step3_fits.py:159,166`). Net: "mashed twice,
don't go back" is not what happens, and README/why-lines imply it is. Fix: one owner of in-game memory (drop R5's
class/spot damage when `s.matchup` is present, or refit M1/M2 with damage active); key M2 on logged location when
present; cap the two MM parts separately; if the coach rule is wanted, add it explicitly (hard-contact shift or
candidate exclusion after two hard hits, keyed by pitch and height half).

### 8. `is_big_spot` hard-codes inning ≥ 7
`:334-335` vs `sched()` `:1858` (7 innings for hs/travel). In a 7-inning HS game only the last inning gets big-spot
treatment (confidence ×1.5 at `:751`, pair/timing ×0.5 at `:742/756`, temperature ×0.5 at `:1450`); a 9-inning game
gets three. Meanwhile the WE blend already rates HS 5th-inning tie R2 as ω 0.6. Two leverage systems disagree. Fix:
`s.inning >= sched(s) − 2`, or drive the three multipliers from ω.

### 9. ✔ `call_v08` — the only live Python entry point — never runs `check_inputs`
`:1763`. `check_inputs` is called only from `call_mixed`/`call` (v0.7c). `outs=3` silently returns a call; duplicate
pitch names silently drop one; `balls=4` is a `KeyError`. (JS `callV08` does call `checkInputs` — `engine.js:558-567`.)

### 10. ✔ `EV_ADJ["chase"] = −3` is applied to the fastball chase, which is *high*
`:217-218` vs `y_target` `:109` (FB chase 3.8 ft) and `target_xy` `:532` (z = 46 in). The file's own rule says up plays
fastest; `seq_fit.py:71-73` labels "chase" only below the zone, so β_T was fitted with −3 meaning *low*. A high FB
chase enters `timing_B`/`look_update` ~1.5 mph slower instead of faster. Same for `HBP_LOC["chase"] = 0.8` applied to
a FB aimed over the plate above the zone (HS P(HBP) 0.025, 3× up-away). Fix: class-aware chase in both tables.

### 11. Power grade is on half the scale of contact and eye
`fit_hitter_spread.py:30`: g_c and g_d target one SD; g_w is a fixed 0.03 hard-share = 0.566 SD by the engine's own
comment (`:74-75`). A coach's "5 power" is a +1.1 SD hitter while "5 contact" is +2 SD; `gval("g_w")` (`:825`) and
`POWER_HR` inherit it. Shipped values were also fit under v0.7c settings (stale). Fix: power target = one SD of hard-hit
share (0.053), refit g_w and POWER_HR.

### 12. Infield-in is modeled one-sided
`:970` only lowers the R3 scoring chance on a GB out to 0.10; GB hit rate in `OUT_TABLE` is unchanged. At D3 1-1, R3,
1 out: low-target share 0.31→0.42 with the flag on — the engine gets the trade for free. Fix: shift GB p1 up / po down
under infield-in by a fitted amount.

### 13. Same-pitch-same-spot repeat penalty treats a take like contact
`:729-733` `rep_same_spot = −0.32` (spec 4.3, not fitted). Repeating FB up-away: whiff shift −0.416 vs −0.096 fresh,
identically for last result `ball`, `cstrike`, `foul`. Coaches go right back after a freeze or a take. Apply on
`foul`/contact only, or fit it.

### 14. Landing shares are blind to arm side vs glove side
`landing()` `:389-453` branches only on chase/middle/else: up-in, up-away, down-in, down-away produce identical
heart/edge/off/noncomp shares (verified). The engine has `p.hb` but never uses it here, so now that v0.9 spends calls
on the inner half (SIDE term), misses are modeled the same both directions. Fix direction: sign `miss_heart` by
break side × target side; fit from Statcast like SIDE.

### 15. Golden/parity harness doesn't cover the v0.9 paths
`golden/cases.py:27-37` never serialises `matchup`; `compute()` never calls `intent_label`, `walk_suggestion`, or
passes `exclude`; `hitter_damage` only has `FB`/`OS` keys, never quadrant keys. `grep -c "matchup\|intent_label\|
walk_suggestion\|exclude" golden/cases.py` → 0. Differential probes (60 + 40 cases on these paths) show Python and JS
match today (worst diff 3.5e-11), so this is a coverage gap, not a parity bug. Re-freeze with these in.

---

## LOW

16. ✔ `gb_rate()` (`:928-932`) keeps spec guesses; `fit_v08.json results.gb_types` (2024 Statcast) has 4-seam 0.340 (vs
    0.379), sink 0.556 (vs 0.495), cut 0.412, SL 0.397 (vs 0.439), CB 0.434 (vs 0.487), CH 0.494. Feeds DP/R3 logic.
17. ✔ `fit_v08.json results.tun_chase`: β = +0.310, SE 0.034, ship = true — but `seq_fit.py:539` sets the single
    `beta_tun` from `tun_whiff` only, so 0 ships for both. README's "the tunnel score showed no effect" is wrong for
    chase swings. Informational (tunneling is skipped by decision) — fix the wording.
18. "One engine" leftovers: `call_mixed`/`mixed_policy`/`at_bat_values`/`grade_call` (v0.7c solver; Python `grade_call`
    grades against an engine v0.9 doesn't run), `pairing()`, `expectation()`, `in_play_value`, `in_play_value_ev`,
    `IN_PLAY`, `call_costs`, `sit_matrix`, `ETA_LEAN` flag branch (`:1788, 1799-1801`), `Table.looked` dead branch,
    `INTENT_TERMS` "tunneling" unreachable with `beta_tun = 0`, `tunnel_score` computed on every call for nothing
    (`:735-741`). `temperature()` floor `T_unc` never binds (max `T_unc/T` = 0.257; `perturb.py` notes it was computed
    under old flags). Removal needs tests.py/fuzz.py/calib.py/make_parity.py updated.
19. `RHO_L` applied to timing, MM, SIDE, POWER_HR but not eye level (`:721-723`), familiarity (`:823`), kappa
    (`:1108`), beta_y (`:936`); comment at `:68` overstates. Pick one rule.
20. App: `seedDamage(m, 8, true)` always centers (`index.src.html:696`, `roster.js:83`) even when `hitterGrades()` is
    null, so a hitter with +0.6 cross-game damage but un-servable grades is served as average. Pass
    `center = hitterGrades() !== null`.
21. Cross-game damage keyed by quad alone (`learner.js:688`) — fastball damage down-away reads as slider damage there.
22. Same-side changeup gets two stacked unfitted penalties (`shape_fit` `:628-629` and `outcome_probs` `:828-829`,
    total hard +0.29 logits, larger than the fitted SIDE OS half-width 0.106); at 2-1 CH drops 23%→0% same-side.
23. Runner rules omit R1→2 on a non-DP groundout (`:981-986`) and R1→3 on a single (`:992-994`); the simulator uses
    the same rules so no sim can surface it.
24. `look_update` is fed the called target (`simulate.py:539`, `index.src.html:873`), not the logged location.
25. Table solved without the guardrail (`:1716`) but the root applies it — V(b,k) prices future counts ~0.0046
    runs/pitch above the executed mix.
26. Familiarity (`phi_OS = 0.116`, `:823`) is unconditional on results: `familiar={"OS":4}` raises slider hard-contact
    0.023→0.032 whether he whiffed or barreled those four. (The reviewer's claim that it drops the slider from the 1-1
    mix did **not** reproduce — share rose 0.298→0.366 — so only the unconditional-shift part stands.)
27. `Situation` default level differs: Python `"college"` vs JS `"college_d3"` (inert; every caller passes level).
28. `POWER_HR` divides by a shrunk SD (0.053 vs 0.0518 for fitted rows) — trivial overstatement.

---

## What came back clean
- `outcome_probs` sums to 1 in every branch (26,496 cases, max |Σp−1| = 3.3e-16); conditioning chain correct; HBP/WP
  peeled from take mass only; `OUT_TABLE` and `type_mix` normalized; power-HR shift can't drive `po` negative.
- Count transitions in `cost`/`cost08` (walk, K, 2-strike foul, WP-then-walk, HBP) correct; everything through `v_end`,
  so the WE blend is on one scale; `GUARD_DELTA`/`temperature`/`windows` all scale by `run_scale`.
- `_ipv_cached` key covers every input `in_play_value_typed` reads.
- RE24 monotone in runners and outs for all six level keys; `walk_value`/`walk_end` handle bases-loaded 3-2; WE blend
  sane (HS 5th/7 tie R2 → LI 1.6; 7th/7 → LI 2.9).
- Solver: `solve_table` never hit the sweep cap (0/100), residuals < 1e-3, A2 taper continuous (≤ 6.5e-5 across
  window edges), RNG sampling correct, `exploitability()` matches spec (diagnostic only).
- Stuff monotonicity: better stuff never worsened a call on the live path (18,630 checks). The legacy `cost()` path
  does violate it in hitter's counts (828 cases) but isn't used for calling.
- Platoon/handedness consistent across `target_xy`, SIDE, `HBP_LOC`, `EV_ADJ`, `shape_fit`, `effective`.
- SIDE fit→engine mapping, KAPPA_FIT centering, gamma_T sign chain, `grade_estimate`/`map_logit_shift`/`ump_estimate`
  units all verified.
- JS parity: `app/engine.js` and `web/lib/engine.js` byte-identical; 100 off-golden differential probes match (worst
  3.5e-14). Learner → engine scale (±1.0 total, 0.15/game) matches spec. The app passes every Situation field the
  engine reads, including grades — the "power term inert" hole from FOLLOWUPS report B does **not** exist in the
  tablet app.
