# Handoff to the hitting-model work ("Hitting simulation fix")

From the v1.0 calling-logic run (`docs/PLAN_v1.0.md`, log in `docs/V1.0_LOG.md`, branch `v1.0-work`). Written Nov 6, 2026.

**Status: v1.0 is paused, by Drew's call.** Phases 0-4 and 6-8 are built and tested. Phase 5's tuning found no setting that
passes the call-sheet bands and the v1.0 scenario gate (`results/tune_v10.md`). Nothing is on `main` yet.

> **Read "Final state, Nov 7 2026" at the bottom before you act on this document.** This section used to say the
> remaining Phase 5 gaps come from the engine's cost differences, i.e. your work. That was only partly right. The
> stall is three separate problems: the usage prior (B1/B2/B5, ours, now fixed), the location window (B13 and part
> of B7, ours, deliberately left alone by Drew), and genuinely cost-shaped bands (B6, B8a, B3, rest of B7 - the
> only part that is yours). Phase 5 has since been re-tuned and still passes 0 of 96 points.

## What v1.0 changed that the hitter work must keep

None of these touch the hitter lines (section 2 of the plan); please keep them as they are:
- **The operator and the usage table.** `policy_from_costs(costs, s, temp, u)` with `mix_weights(arsenal, s)` from
  `mix_prior.json` (`fit_mix_prior.py`, Statcast 2024-25); `KAPPA_T` / `KAPPA_L` (now at the starting 3 / 1). Used by the
  sit game, the table and the root call. JS: `policyArr`, `mixWeights`, `usageArrays` in `app/engine.js`.
- **The guards.** `guard_keep`: location guard `GUARD_DELTA` 0.010 within a pitch type, pitch-type guard `GUARD_TYPE`
  (now 0.030; tuning range [0.020, 0.060]).
- **History.** `Situation.history` (pitch, target, result, read); `call_rules` RP1 (no third straight exact call), RP2
  (not back after a foul straight back); RP3 in `lean_b_h` (fouls lean the hitter's sit).
- **The coach rules.** CR1 (hit hard twice: that pitch type at that spot out for the game), CR2 (power grade 4+: no
  middle); the fallback when nothing is trusted (3.2); no dirt ball with a pitch that isn't landing when a runner is on 3rd
  (3.3); re-solve when runners or outs change (3.4); the at-bat plan (3.8).
- **`pitcher_side_params.py`** (`fit_pitcher_side.py`): the level `hbp` scale (fit at real inside usage, HBP_LOC ratios
  kept), the level `wild`, and the per-level wild-pitch chances. MLB unchanged.

## Commands to rerun after any hitter-model change

```
python3 fit_pitcher_side.py --round N      # Phase 4 refit at the current mix (about 50 min; 4c simulates 60 games x 3)
python3 tune_v10.py --grid                 # Phase 5 grid on the call sheet's CI tier (about 40 min)
python3 tune_v10.py --confirm KT,KL,G ...  # full tier + the 90-game simulator floor for the best candidates
scripts/v10_gates.sh                       # Phase 9 gate script (written when Phase 5 has a passing candidate)
```
Also: `python3 callsheet.py --tier full --jobs 4 --tag <tag>`, `python3 readthrough/scenarios_v10.py`,
`python3 tools/exploit.py --tag <tag> --compare results/exploit_v09.json`, `node app/learner_tune.js` (Drew: rerun the
learner switch when Phase 5 resumes), and the Phase 4 fixed point (Phase 4 -> 5 -> 4 until fitted values move < 0.01).

## Tracked bands to make enforced once the hitter model supports them

| band | check | v1.0 now (CI tier, starting kappas) |
|---|---|---|
| T1 | contact grade 5 vs 1 moves two-strike chase share by >= 5 points | 8/24 |
| T2 | crowding raises the inside share of fastballs by >= 5 points | 18/96 |
| T3 | power grade 5 vs 3 moves calls beyond CR2's middle rule | 84/96 |
| T4 | engine whiff per swing on heart / edge fastballs within 3 points of Statcast (13.6-15.8% / 21-24%) | 0/2: heart 6.4%, edge 13.4% |

Tracked scenario rows (graded, not gated): H2, H4, F6, F7, N2, N3.

## Where Phase 5 stalls, and why it points at the hitter model

From `results/tune_v10.md` (all 96 KAPPA_T x KAPPA_L x GUARD_TYPE points fail):
- **Runner on 1st at 1-1 (D3, HS): every corner is 0.0127+ runs behind fastball middle** in the engine's own costs, past the
  location window, so the call is 100% middle (B6) and nothing goes down (B8a, down 0% vs 45% with the bases empty).
  Corners lose mainly through takes called balls; the engine's edge called-strike rate (30.8% of edge takes vs 49.2% for
  Statcast's shadow zone, `cs` / `C0`) and edge swing rates drive that.
- **Three-ball counts collapse to one call** (3-2 middle 100%; B1, B3, B6, B13): the temperature there is tiny and the
  cost gaps between middle and corners are larger than it.
- **The sit game barely moves costs** (R2: 0.006 runs across every sit at 2-0), so the hitter can't force mixing, and a
  hitter's damage record barely moves the mix: `app/learn_test.js` check 8 ("fewer fastballs to the masher") fails on v1.0,
  38% unknown vs 41% masher; it passed on v0.9 only because the single guardrail cut the fastball. Drew: record it, keep it
  failing until Phase 5 resumes.
- **B5's grade-5 changeup band** can't be met to a same-side hitter (9-11% overall; the engine prices a same-side changeup
  as hittable, `p.kind == "CH" and s.same_side` -> +0.2 hard).
- Diagnostics with the location guard removed and the window quadrupled still fail 7 bands, so the guards are not the
  binding constraint; the costs are.

## Open items that belong to the hitter work

- **Issue 13: whiffs.** Heart fastball whiff per swing 6.4% in the engine vs 13.6% real (T4); edge 13.4% vs 21-24%.
- **Issue 14: how much sitting on a pitch matters** (R2: 0.006 runs at 2-0 across every sit).
- **Issue 15: level scaling `RHO_L`.**
- **Issue 17: the simulated hitters have no grades.**
- **Issue 18: an independent simulator world**, so the engine isn't judged by its own model.
- **Power and contact effect sizes** (T1, T3), the **crowding effect** (T2), the **damage effect size** (learn_test check 8).
- **Edge called strikes:** 30.8% of edge takes vs 49.2% for Statcast's shadow zone; the band definitions differ, so
  check them before changing anything.
- **Strikeouts.** Phase 4 round 1 at the v1.0 mix: hs 19.94% vs 21.01% target (**-1.07 points**, over the plan's 1.0;
  Drew: recorded, continue), D3 15.91% vs 16.21% (-0.29), D1 18.62% vs 19.30% (-0.68).
- **HBP at the engine's own mix** is 2.1-2.6% vs 3.4-4.2% real after the refit (the fit is at real inside usage; the
  engine still goes inside less). Drew's ruling: the HBP tolerance applies at the real-world mix.

## Merge order (plan section 2)

- If the hitter work merges while v1.0 is paused (expected): rebase `v1.0-work` onto it, then rerun Phase 4 (fits),
  Phase 5 (tuning), and every Phase 9 gate.
- If it merged after v1.0 were on main: the hitter chat reruns `fit_pitcher_side.py`, `tune_v10.py` and
  `scripts/v10_gates.sh`, and must pass them.

---

## Correction (Nov 7, 2026): two calling-side defects in the usage prior

From the Phase 9.3 independent review, each re-verified here against `mix_prior.json` and both engines. **Items 1 and 2
are ours (the calling side), not yours.** They need Drew's decision before Phase 5 is re-run, because fixing either one
means changing a method the plan specifies, which plan rule 11 reserves to him.

**1. Every arsenal whose composition has under 40 pitcher-seasons gets a mis-derived pitch-type prior.**
`mix_prior.json`'s `u_T` holds only three tables: `FB+SL+CB+CH` (139 seasons), `FB+SL+CH` (118) and `all`. Everything
else falls back to `u_T["all"]` - the **all-pitcher kind shares** - renormalized over the arsenal's kinds. That is
exactly what plan 3.7 prescribes ("Otherwise use the all-pitcher kind shares renormalized over the arsenal's kinds"), so
the code is right and the specified method is the problem.

For `two_pitch` (FB+CB, only 5 pitcher-seasons) the curveball therefore inherits a *four-pitch MLB pitcher's* curveball
share. Verified at D3, `two_pitch`, runner on 1st / 0 outs, same side, inning 4:

| count | u_T renormalized | engine share | flat prior, same costs/guards/kappas |
|---|---|---|---|
| 3-1 | FB 98.2% / CB 1.8% | FB **99.24%** / CB 0.76% | FB 70.9% / CB 29.1% |
| 2-0 | FB 96.9% / CB 3.1% | FB 98.2% / CB 1.8% | FB 64.3% / CB 35.7% |
| 1-1 | - | FB 93.9% / CB 6.2% | FB 63.7% / CB 36.4% |

B1 needs <= 85% and B2 needs >= 5%: with a flat prior both pass, with this prior both fail by the margins the call sheet
reports. Scope, counting cells with at least two types in the mix and one type over 85%: **`two_pitch` 112/164**,
`slider_best` 11/176, `plus_changeup` 10/150 - about 84% of B1's failures are the one arsenal whose prior is wrong. B5's
recorded "two-pitch hs fastball 91-92% (band 50-78%)" is the same cause.

**The hitter model cannot fix these cells.** `pi_n ∝ u_T(n) · exp(-(c_n - min)/lam_T)` and `exp(...) <= 1` for every
non-best type, so a 1.8% anchor can only clear a 5% floor if every other type's cost gap blows up. Changing hitter costs
moves the exponential, not the anchor.

Candidate fixes (Drew's call, not applied): pool the two-kind pitcher-seasons (FB+SL 29 + FB+CH 11 + FB+CB 5 = 45, over
MIN_COMP 40) into a "FB + one secondary" table and map the secondary role onto the arsenal; or floor `u_T` so the prior
alone can never put an allowed secondary under B2's floor.

**2. A `u_T` cell of exactly 0 deletes a pitch type silently, with no why line.**
Verified: `u_T["FB+SL+CB+CH"]["3-0"]["same"]["CB"] = 0.0` - no four-pitch pitcher in the sample threw a same-side
curveball at 3-0. At D3, `four_pitch` with CB grade 5 / command 5, 3-0, same side, the curveball is **the engine's
cheapest call by 0.027 runs**, survives both guards (it is in `info["M"]` and in `root_costs`), and still gets 0.00% with
an empty rules dict, so nothing explains it to the coach. That contradicts plan 3.7's own promise: "An average pitch
can't go to 0% unless a guard removes it, and the guard gives a reason." B1/B2 cannot catch it because 3-0 is exempt.

Cause in `fit_mix_prior.py`: the thin-cell test is on the cell's **total** pitches across kinds, so a cell with 200+
pitches but none of one kind is stored as 0.0. The per-kind pooling that `u_L` gets is never applied to `u_T`. The log's
note ("the operator falls back to flat if every surviving type has weight 0") covers the all-zero case; a *single* zero
is the one that bites. Fix would be to pool per-kind zeros to the count group as `u_L` already does, or floor each stored
kind share.

**What this means for you:** re-run the Phase 5 grid once Drew settles items 1 and 2, before concluding the bands are
blocked on hitter costs. Issues 13-18 and the tracked bands T1-T4 below are unaffected - those are still yours.

## Other corrections to this document (Nov 7, 2026)

**3. Band pass rates are not comparable across tuning points, or against v0.9.** `callsheet.py` exempts a situation at
3-0 or when at most one pitch type is allowed, and "allowed" is the guard-kept set - so tightening `GUARD_TYPE` exempts
more cells, and `tune_v10.py` stores only `passed/rate/max_miss`, never `eligible/exempt`. The 96-point frontier
therefore compares rates over different denominators. Full tier, v0.9 vs v1.0: B1/B2 eligible rises 6754 -> 10202 as
exempt falls 4766 -> 1318. v0.9's B1 99.3% and B2 99.6% are mostly that exemption (its single guardrail left one pitch
type in a third of all situations), not better behavior - treat them as uninformative rather than as a regression in
v1.0.

**4. The plain-foul repeat figure here is stale.** "+0.56 points" was measured in Phase 3.7, before
`fit_pitcher_side.py` existed. On the current engine `tests_v10.py` reports **+1.23 points** (+0.0123). Phase 4 halved
HBP per pitch (golden diff on the same case: 0.02515 -> 0.01274), which moves inside-pitch costs and with them the
operator's weights. Quote "+0.56" as the Phase 3.7 value and re-measure when Phase 5 resumes. B9 stays a hard limit
either way.

**5. Python/JS parity is thinner than plan rule 7 implies.** `app/make_parity_v10.py` never passes `usage_by_call` and
never varies `ump_u` (always 0.0, though it enters the called-strike line of every cost), and the comparison omits
`info.rules`, the why/rule line, `plan.putaway_spot` and `plan.line`. The review reports 1 of 300 of its own random cases
(which do vary `ump_u`) exceeding 1e-9 at 1.13e-8, traced to `solve_sit_game` stopping at `QRE_TOL = 1e-3` on a
near-degenerate 3-2 fixed point, where 1-ulp `exp`/`log` differences amplify; v0.9's two engines agree to 1.1e-16 on the
same case because its tight pitch-type window collapsed those counts to one type. **Not reproduced here** with the
repo's own generator (400 cases still pass, largest 1.43e-10), so treat it as likely but unconfirmed - and do not read a
passing `parity_v10` as proof of 1e-9 everywhere.

Related trap for your reruns: the engines key `usage_by_call` differently - Python `(name, target)` tuples, JS
`"name|target"` strings - and `solve_sit_game` filters with `if a in M`, so Python code that passes the app's JSON
straight through loses the term **silently**.

**6. `pitcher_side_params.py` overwrites `OUTCOME_ADJ[level]["hbp"|"wild"]` at import.** If you refit
`outcome_params.py`, those two keys are silently overridden by the Phase 4 file. `engine.py`'s loader also wraps the
whole block in `except ImportError: pass`, so a malformed params file raises an uncaught `KeyError`, and
`PC_PITCHER_SIDE` is `exec`'d from an environment-named path.

## The full-tier board as it stands (KAPPA_T 3, KAPPA_L 1, GUARD_TYPE 0.030)

`results/callsheet_v10.{json,md}`, Nov 7. Rates with eligible and exempt counts, so they can be compared honestly:

| band | v0.9 rate (elig, exempt) | v1.0 rate (elig, exempt) | v1.0 max miss |
|---|---|---|---|
| B1 no pitch over 85% | 99.3% (6754, 4766) | 84.5% (10202, 1318) | 15.0 |
| B2 secondaries >= 5% | 99.6% (6754, 4766) | 89.3% (10202, 1318) | 5.0 |
| B3 no exact call over 60% | 72.9% (11520, 0) | 76.0% (11520, 0) | 40.0 |
| B5 overall usage | 27.9% (960, 0) | 42.6% (960, 0) | 15.9 |
| B6 middle share | 18.5% (10560, 0) | 39.0% (10560, 0) | 76.4 |
| B7 inside | 27.4% (840, 0) | 45.6% (840, 0) | 12.0 |
| B8a ground balls | 73.2% (1536, 0) | 70.3% (1536, 0) | 52.6 |
| B8b off-speed, runner on 3rd | 56.6% (288, 0) | 92.0% (288, 0) | 1.1 |
| B8c dirt ball, runner on 3rd | 83.3% (96, 0) | **100%** | 0.0 |
| B9 repeats | 47.7% (264, 0) | 95.8% (264, 0) | 0.3 |
| B10 fallback | 33.3% (288, 0) | **100%** | 0.0 |
| B11 hard rules | 100% | **100%** | 0.0 |
| B12 coach rules | 16.7% (192, 0) | **100%** | 0.0 |
| B13 eye grade | **100%** (24, 0) | 91.7% (24, 0) | 5.0 |
| T1 contact | 12.5% | 33.3% | 5.0 |
| T2 crowding | 10.4% | 18.8% | 5.0 |
| T3 power | 35.4% | 87.5% | 4.4 |
| T4 whiffs | 0/2 | 0/2 (heart 6.4%, edge 13.4%) | 4.6 |

T1-T4 are identical at the CI and full tiers, so the figures quoted earlier in this document are tier-independent.

**B13 is a real v1.0 regression**: v0.9 passed it 24/24 and v1.0 is 22/24. The plan added B13 explicitly to guard against
a regression. `results/tune_v10.md` attributes it to 3-2, where chase goes to 0% at both eye 1 and eye 3 because the
temperature there is about 0.005 x run scale. B8a also moves the wrong way (73.2% -> 70.3%, max miss 35.6 -> 52.6).

**Two gates now pass that did not before.** Exploitability: mean X **0.00591** vs v0.9's 0.00639, so the predictability
limit is met at the starting values. Scenarios: rows over the Not-acceptable cap fell from 7 on v0.9 (F5, H1, I4, Q1, T2,
W1, W2) to **1** (F1), and rows failing on acceptable share alone from 48 to 30 (cap 6) - still a gate failure, but a
large move.

**`scripts/v10_gates.sh`** now exists (Phase 9.2) and prints PASS/FAIL/SKIP per line, with `--strict` to turn SKIPs into
failures. `golden_v10` SKIPs until the engine is final, and `sim_floor` SKIPs without the v0.9 baseline games.

---

# Final state, Nov 7 2026 — read this section first

This supersedes the earlier "Correction" section below, which was written mid-investigation. Branch `v1.0-work`, HEAD
`84e7d9c`. Phase 5 has now been tuned **twice** and still passes 0 of 96 points, but the reason is no longer what the
first run concluded.

## The stall is three separate problems, and only the third is yours

| group | bands | whose | state |
|---|---|---|---|
| The usage prior was mis-derived | **B1, B2, B5** | ours (calling side) | **fixed** in `cd4297e`. Nothing for you to do |
| The location window is the binding constraint | **B13**, part of **B7** | ours, but a limit the plan fixes | **measured; Drew's call is to leave the window alone.** Not yours |
| Genuinely cost-shaped | **B6, B8a, B3**, rest of **B7** | the hitting model | open — **this is the part that is yours** |

**Please do not spend time on B1, B2 or B5.** They were an artifact of how `u_T` was built, not of hitter costs. After
the fix, B2 passes outright at 25 of 96 grid points, B1's best rate went 77.5% -> 96.8% with its worst miss more than
halved (13.7 -> 6.6 points), and B5's best went 37.5% -> 70.8%. The first run's claim that "the remaining gaps come from
the engine's cost differences" was wrong for these three.

**Please do not spend time on B13 either.** It is purely the location window: widening `LOC_WINDOW` from 0.010 to 0.020
takes B13 from 87.5% to **100%** at both kappas, with no hitter change at all. B13 is the band the plan added expressly
to catch a regression against v0.9 (which passed it 24/24), so the regression is real but it is ours, and Drew has
decided to leave the window at the value plan 3.7 fixes. It therefore stays failing on purpose.

**What is actually yours: B6 (middle share), B8a (ground balls), B3, and the rest of B7.** The diagnostics below show
these cannot be reached from the calling side.

## Why the calling side cannot fix the rest (diagnostics, Nov 7, on the corrected prior)

Through the `PC_TUNE` hook, CI tier, at (6, 1, 0.04); (4, 1, 0.04) behaves the same. "guard off" is `GUARD_DELTA` 999
with the window at 0.040. Nothing here is adopted.

| variant | B1 | B3 | B5 | B6 | B7 | B8a | B9 | B13 |
|---|---|---|---|---|---|---|---|---|
| as planned (window 0.010) | 96.5% | 67.0% | 68.8% | 24.1% | 33.3% | 80.2% | 95.8% | 87.5% |
| window 0.020 | 96.7% | 70.3% | 68.8% | 34.1% | 50.0% | 72.9% | 96.6% | **100%** |
| window 0.040 | 97.3% | 68.8% | 66.7% | 36.6% | 50.0% | 85.4% | 97.0% | **100%** |
| guard off + window 0.040 | 96.7% | **91.8%** | 66.7% | **66.5%** | **100%** | **58.3%** | 97.0% | **100%** |

- **B6 never gets near its 98% rule**: 66.5% even with the location guard fully off and the window quadrupled. Its worst
  miss at the shipped setting is 76.4 points. This is the middle-share problem and it is cost-shaped.
- **B8a moves the opposite way and collapses**: 80.2% -> 72.9% -> 58.3%. Whatever helps B3/B6/B7/B13 hurts ground balls,
  so there is no window or guard setting that satisfies both. Plan section 7 says to report this rather than invent a
  ground-ball bonus, and that still stands.
- **B7 is blocked by both knobs** — the window alone gets it to 50%, the guard off to 100% — so part of it is ours and
  part is the cost of going inside.

The specific cost facts behind these are unchanged from the first run and still the best description of what to fix:
runner on 1st at 1-1 where every corner is 0.0127+ runs behind fastball middle; three-ball counts collapsing to one call
because the temperature there is about 0.005 x run scale; the engine's edge called-strike rate 30.8% against Statcast's
49.2%; and the sit game moving costs by only 0.006 runs (R2).

## Where v1.0 stands now, full tier

`results/callsheet_v10.{json,md}`. Rates carry eligible and exempt counts: v0.9's single guardrail left one pitch type
standing in a third of situations, so **v0.9's B1/B2 are measured over 6754 eligible with 4766 exempt against v1.0's
10208 with 1312** and the two are not comparable.

| band | v0.9 | v1.0 pre-fix | v1.0 final | final max miss |
|---|---|---|---|---|
| B1 | 99.3% | 84.5% | **90.7%** | 15.0 |
| B2 | 99.6% | 89.3% | **92.7%** | 5.0 |
| B3 | 72.9% | 76.0% | **76.5%** | 40.0 |
| B5 | 27.9% | 42.6% | **53.5%** | 15.9 |
| B6 | 18.5% | 39.0% | **38.6%** | 76.4 |
| B7 | 27.4% | 45.6% | **45.8%** | 12.0 |
| B8a | 73.2% | 70.3% | **70.4%** | 52.8 |
| B8b | 56.6% | 92.0% | **91.3%** | 1.7 |
| B8c | 83.3% | 100% | **100%** | 0.0 |
| B9 | 47.7% | 95.8% | **95.8%** | 0.3 |
| B10 | 33.3% | 100% | **100%** | 0.0 |
| B11 | 100% | 100% | **100%** | 0.0 |
| B12 | 16.7% | 100% | **100%** | 0.0 |
| B13 | **100%** | 91.7% | **91.7%** | 5.0 |
| T1 / T2 / T3 / T4 | 12.5 / 10.4 / 35.4 / 0-of-2 | 33.3 / 18.8 / 87.5 / 0-of-2 | **33.3 / 18.8 / 88.5 / 0-of-2** | 5.0 / 5.0 / 4.3 / 4.6 |

**Two gates now pass** that did not before: exploitability, mean X **0.00584** against v0.9's 0.00639; and the scenarios
improved from 7 rows over the Not-acceptable cap on v0.9 (F5, H1, I4, Q1, T2, W1, W2) to **1** (F1), with
acceptable-only failures 48 -> 30 against a cap of 6. F1 (0-1 after a pulled foul on a fastball up-in) is over its cap
at all 96 grid points.

## What changed in the engine since this document was first written

Re-run `fit_pitcher_side.py`, `tune_v10.py` and `scripts/v10_gates.sh` after any hitter change, as before. Note:

- **`fit_mix_prior.py` changed** (`cd4297e`). A composition with fewer than 40 pitcher-seasons no longer falls back to
  all-pitcher kind shares; it gets a table pooled by **arsenal size** and mapped by role (fastball, then that pitcher's
  own secondaries ranked by usage), stored under its own composition name. The engines are untouched - their
  `u_T[composition]` lookup finds it unchanged. Pools: 2-kind 45 seasons, 3-kind 190, 4-kind 139.
- **A `u_T` kind share can no longer be exactly 0.** A zero deleted a pitch type in the operator with no why line; zeros
  are now pooled to the count group and then `behind`, as `u_L` already did. Smallest stored `u_T` is 0.0012, was 0.0000.
  Two substitutions fired, both at 3-0.
- **Phase 4 ran three rounds** (the plan's limit). 11 of 12 fitted values are inside the 0.01 fixed-point criterion;
  hbp and wild moved at most 0.0004 and walks are exactly on target. The twelfth, the **wild-pitch multiplier, cannot
  converge at the 30 games the plan fixes**: its sampling SE is about 0.4 points, larger than both the +-0.3 point
  tolerance and the 0.01 criterion. The over-threshold level even swapped between rounds (D1 in round 2, D3 in round 3)
  and the band verdict flipped with it. **Drew froze the round-3 values and made the wild-pitch band reported, not
  gated, like strikeouts.** Current: D1 hbp 0.0649 wild 0.1453, D3 hbp 0.0809 wild 0.1692, hs hbp 0.0721 wild 0.2192.
- **Strikeout drift is unchanged and inside Drew's rule**: hs **-1.23** points (his limit about 2), D3 -0.35, D1 -0.70.
- **`scripts/v10_gates.sh` exists** and prints PASS/FAIL/SKIP per line. On the frozen engine: 9 PASS, 5 FAIL, 3 SKIP.
  `golden_v10` SKIPs until the engine is final; `sim_floor` SKIPs without the v0.9 baseline games.
- **Parity is now genuinely exercised**: `ump_u` varies and `usage_by_call` is passed, and the comparison covers
  `info.rules`, the why line and the plan line. Beware - the engines key `usage_by_call` differently (Python
  `(name, target)` tuples, JS `"name|target"` strings) and `solve_sit_game` filters with `if a in M`, so Python code
  passing the app's JSON straight through loses the term **silently**. 4 seeds x 200 cases pass, worst margin 2.83e-11.
- **`pitcher_side_params.py` overwrites `OUTCOME_ADJ[level]["hbp"|"wild"]` at import.** If you refit
  `outcome_params.py`, those two keys are silently overridden by the Phase 4 file.

## Still open, and not yours

GitHub Actions is not running jobs on this account (billing), so no CI run can be shown green. The v0.9 baseline games
are not on this machine, so the 90-game simulator floor has never been measured for v1.0.
