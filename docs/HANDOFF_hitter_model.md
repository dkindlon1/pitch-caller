# Handoff to the hitting-model work ("Hitting simulation fix")

From the v1.0 calling-logic run (`docs/PLAN_v1.0.md`, log in `docs/V1.0_LOG.md`, branch `v1.0-work`). Written Nov 6, 2026.

**Status: v1.0 is paused, by Drew's call.** Phases 0-4 and 6-8 are built and tested. Phase 5's tuning found no setting that
passes the call-sheet bands and the v1.0 scenario gate (`results/tune_v10.md`). The remaining gaps come from the engine's
cost differences, i.e. the hitter model, so v1.0 resumes after your changes merge. Nothing is on `main` yet.

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
