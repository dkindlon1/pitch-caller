# v1.2 build report (location model and hitter model)

Plan: `docs/PLAN_v1.2_2026-11-13.md`. Branch `v1.2-work` from `v1.2-plan` (the plan and research on top of
`main @ 14e0ad2`). Every result below was run in this session and is as printed; logs are summarized, not edited.
**This session can read the GitHub repo but not push to it**, so the branch is local and CI hasn't run on it.

## Step 0: start line (Nov 13)

Environment: Linux cloud workspace, 2 CPUs, Python 3.13, Node 22. `npm ci` (repo lockfile) exit 0.

| Check (v1.1 code, worktree at the branch point) | Result |
|---|---|
| `scripts/test-app.sh` | **exit 0**. tests.py 45, explain 7, tests_v11 41, fast_parity, golden_v11 (JS), build matches source, web/lib copies match, web demo 2, learn 27, db 18, import 14, rails 31, schema 24, stage2 21, worlds 31, pitch_rules 41, kinds 23, v11_fixture 8, smoke, rules_e2e 20, v10 step 1 / 3 / 5 e2e 6 / 7 / 10, v11_step5_e2e 14, game_mix_e2e 44 (the same counts as v1.1's release candidate) |
| CI on `14e0ad2` | every job passed (push run #193 and PR run #195, `success` at 16:33 UTC; see the plan's start-line facts) |
| Statcast | MLB 2024 / 2025 (88 files, 340,378 pitches) and Single-A 2024 / 2025 (88 files) pulled for the research; uncommitted (`.gitignore`) |

## Step 1: the lean structure, no behavior change (Nov 13)

### What changed
- **Both engines** (`engine.py`, `app/engine.js`, copied to `web/lib/engine.js`):
  - `Pitch` gains `lean_x` (inches, + = his arm side), `lean_z` (inches, + = up) and `spread` (1 = as his command
    says). Defaults 0 / 0 / 1. In JS they're simply absent unless set, so v1.1 snapshots don't change.
  - `landing()` is split into `landing_pre()` (v1.1's arithmetic, unchanged) and the final 0.01 floor and divide. With a
    lean or spread, the lean's *difference* is added between them; at lean 0 / spread 1 that block doesn't run.
  - **The miss model** (`geo_*`): a 2-D normal around the target in inches, batter frame. Its size is solved per call
    from `landing_pre()`'s own non-competitive share (bisection), so it carries command, confidence, traits, level
    wildness, wild-today and fatigue. One CDF in both engines (Abramowitz & Stegun 7.1.26).
  - **HBP counted once:** a conditional factor (body share per unit of way-off mass) multiplies the hit rate on the
    way-off and just-off mass; the landing delta already moved the mass. The HBP curve by crossing point is MLB
    2024-25's (`results/v12/proxies_mlb_*`). Wild pitches: the same rule, for down targets with a down lean.
  - **Validation:** lean within ±6 in., spread 0.5-2.
  - **Re-solve:** `frozen_inputs` carries each pitch's lean; changing one re-solves the at-bat table. A frozen table
    from before leans existed counts as lean 0.
- **App:** both pitch builders pass `lean_x` / `lean_z` / `spread` only when the stored pitch has them (`leanOf`);
  `learn.js` `PITCH_KEYS` carries them, so snapshots keep them (only when set). The chips that set them come in Step 4.
- **Parity harness:** `FAST_LEANS=1 golden/fast.py 40` runs the 40 golden inputs with a lean and spread on every pitch
  (the same deterministic leans on both sides).
- **Suite:** `tests_v12.py` and the lean parity run added to `scripts/test-app.sh`.

### A deviation from the plan, for Drew
- **The plan's zone geometry didn't fit.** Plan 2.2 defined heart as the middle third and "off" as a 6-in. ring. Against
  `landing()`'s own shares that's wrong: `landing()` gives a corner target 27% heart, far more than a middle-third box
  can. The engine's four zones read as **Baseball Savant's attack zones** (heart inside 67% of the zone, shadow to 133%,
  chase to 200%, waste beyond), and a corner target fits them far better. The chase target sits in the chase band.
- **The plan's 0.03 fit tolerance can't be met** by a normal miss model: the largest share error is 0.29 at a corner
  (command extremes; about 0.07 for an average pitcher) and 0.34 at the middle target, where `landing()` is more
  peaked than any normal. **Exactness never depends on it** (only the difference is used), and the size is solved from
  the way-off share, so the tail that drives hit batters and wild pitches is matched exactly. What's approximate: how
  much a lean moves a middle target's heart share, and corner targets at command extremes.
- **The solved miss size** for an average fastball aimed at a corner: MLB 9.1 in., D1 10.2, D3 10.4, HS 10.7. That's
  the range the research measured independently (8-11 in.).
- A two-component miss model would fit the middle target; not built (more parameters, and the build doesn't need it
  for exactness). Drew's call whether it's worth it.

### Proof (this session, final Step 1 code)

| Check | Result |
|---|---|
| `tests_v12.py` | **16/16**. Bitwise vs the real v1.1 engine (`git archive 14e0ad2`): `landing()` and `outcome_probs()` identical on 2,000 random pitches / situations / targets (0 differ). Directions: a lean toward the target's side moves misses off the plate (off + non-competitive 0.477 → 0.536 for a D3 sinker up-in); toward the plate raises the heart (0.217 → 0.239); lean_x is in the pitcher's frame (the same lean pulls toward the plate to an opposite-side hitter); up lean on an up target; spread. HBP curve reproduces the research doc (×1.944 at σ 8, ×1.559 at σ 11). **HBP counted once:** the engine's HBP change matches the geometry's at the solved size within 10% on 4 levels × both sides × 3 leans (worst 3.0%). Re-solve on a lean change; old frozen tables count as lean 0. Validation. **Python = JS** on 600 random pitches with leans and spreads (landing, factors, outcome_probs): largest difference 6.9e-15. One CDF in both engines |
| `FAST_LEANS=1 python3 golden/fast.py 40` | **0 mismatches**: full calls, tables, grades and why lines with a lean and spread on every pitch; largest difference 7.5e-14 (call) |
| `python3 golden/golden_v11.py check --tag v11` | **PASS, 500 cases, largest difference 0.00e+00** (and the same on the v1.1 base worktree). Note: without `--tag v11` the script checks the older Step 1b reference `golden_v11a`, which the v1.1 engine no longer matches either |
| `node golden/golden_v11.js v11` | **PASS: JS engine reproduces v11** (run on the Step 1 engine code before the zone-geometry change; the geometry runs only with a lean, so it can't touch the golden inputs, which have none) |
| `scripts/test-app.sh` | SUITE |

## Step 2: inside pitching and the hit-batter price (Nov 13)

### What the plan's reference mix found
`calib.evaluate` was given the reference mix (same-side fastball calls reweighted to the inside aim that puts 27% across
the inside third), as plan 2.4 specified. Before any refit:

| Same-side fastballs, miss model | aimed inside | crossing the inside third |
|---|---|---|
| MLB, calib's staff (the conversion check) | 18.4% | **40.3%** (real: four-seam 28%, sinker 48%) |
| D3, calib's staff | 10.1% | **39.2%** |
| Row P1 (D3, sink_sweep, 1-0): the sinker, as a share of all calls | 6% | **30%** (43% of sinker calls); floor 25% |

The engine's own D3 calls already cross the inside third more often than the 27% reference, so fitting the price on
it would have **raised** the hit-batter price, the opposite of the plan's intent. With about 10 in. of miss at D3, a
lot of pitches cross inside from any target. **Stopped and asked Drew (a decision that's his).**

**Drew's answer (Nov 13, Q9):** judge "inside" by where the pitch crosses (his v1.1 rule); keep v1.1's HBP price; no
refit.

### What changed
- `calib.py` and the refit driver: not changed (the reference-mix code was backed out, never committed).
- `readthrough/scenarios.py`: a pattern ending `:inx` (for example `SI:inx`) counts each call of that pitch class by
  its chance of crossing the inside third under the miss model (`p_cross_inside`, size solved from `landing()`'s own
  shares, a lean included). Floors and ceilings use it; every other pattern counts as before.
- The v1.2 read-through suite (Step 6) grades P1 as `SI:inx`.

### Crossing shares by level (`research_v12/step2_crossing.py` → `results/v12/step2_crossing.txt`; same-side, counts 0-0 to 2-2)

| Level | sink_sweep sinker | deadzone sinker | deadzone four-seam | AVG3 four-seam |
|---|---|---|---|---|
| HS | aimed 13% / crossing 37% | 19% / 39% | 7% / 35% | 11% / 34% |
| D3 | 18% / 39% | 18% / 39% | 2% / 35% | 15% / 36% |
| D1 | 19% / 39% | 22% / 40% | 3% / 35% | 18% / 37% |
| MLB | 36% / 44% | 38% / 45% | 22% / 39% | 28% / 39% |

Against Drew's D3 20-35%, Single-A's 34% (four-seam) / 41% (sinker) and MLB's 28% / 48%: college fastballs cross inside
35-40% by the model, inside or just above Drew's range and close to Single-A.

### For Drew
- **The miss model is probably too wide side to side.** Even a four-seam aimed inside under 2% of the time crosses
  inside 35%, and at MLB the model's four-seams cross 38.5% against the real 28%. The size is solved from `landing()`'s
  hand-set way-off share and is the same both ways. A narrower side-to-side miss (fit to MLB's 28% / 48%) would lower
  every crossing share and the size of lean effects. Not built (your Q9 answer didn't need it); it's the option C you
  passed on, still open.
- **The four-seam diagnosis** (plan 2.4) is moot under Q9: by crossing, college four-seams aren't off the inside.
- No calibration checkpoint: nothing was refit, so `golden_v11` stays the gate.
