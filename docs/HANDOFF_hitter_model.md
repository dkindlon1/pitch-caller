# Handoff to the hitting-model work ("Hitting simulation fix")

From the v1.0 calling-logic run (`docs/PLAN_v1.0.md`, log in `docs/V1.0_LOG.md`, branch `v1.0-work`). Written Nov 6, 2026.

**Status: v1.0 is paused, by Drew's call.** Phases 0-4 and 6-8 are built and tested. Phase 5's tuning found no setting that
passes the call-sheet bands and the v1.0 scenario gate (`results/tune_v10.md`). Nothing is on `main` yet.

> **Read "Correction (Nov 7)" at the bottom before you act on this document.** This section used to say the remaining
> gaps come from the engine's cost differences, i.e. the hitter model. An independent review on Nov 7 found two
> *calling-side* defects in the usage prior that account for a large share of the B1/B2/B5 failures. Part of what was
> handed to you is ours, not yours, and the Phase 5 grid should be re-run after those are settled.

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
