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
| `scripts/test-app.sh` | Started on the Step 1 commit; 13 suites passed (tests.py 45, explain 7, tests_v11 41, fast parity, tests_v12, lean parity, golden JS, build, web copies, web demo, learn, db, import, rails, schema, stage2) before I stopped it for CPU. The full suite was run on the Part A freeze instead (below) |

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

## Step 3: each pitch's miss lean from his own log (Nov 13, flag only)
- `learner.js` `leanModel`: each logged pitch with a landing cell and a non-chase target gives an offset (landed minus
  target) in the pitcher's frame. The lean is the mean over arm-side and glove-side targets, which cancels the pull
  toward the middle and a catcher who sets up middle-ish. It needs 10 targets on each side and is shrunk with K = 30.
  It's served only through the trait gate, which is empty, so it's a flag on the arsenal card.
- Hidden leans in `worlds.js` and in `simulate.py` (`TRUE_MISS`). Setup check 1 reads a directional way-off cell
  outside the grid as way off, in both engines.
- `lean_test.js` (8 checks): unbiased over 20 seasons, honest standard errors, shrinkage, today's log is biased, LHP.

## Step 4: logging and bullpen mode (Nov 13)
- **Bullpen screen:** pitcher, then per pitch: the pitch, the catcher's spot (5x5), where it ended up (5x5 or a way-off
  arrow), optional radar. Saved as a `sessions` doc (`type: "charted"`, with `source` / `n` / `byType`, so a v1.1 roster
  lists it). It feeds only the lean estimate.
- **Game logging:**
  - "Way off" has four arrows, stored as a cell one ring outside the grid.
  - Events carry `ph` / `bs`.
  - An optional glove grid (setup option, off by default).
  - Location logging is on for new setups (Q3).
- **Found and fixed:** a v1.1 location fix always wiped the cell, and the game log rows didn't carry it. Both fix editors
  (this game, earlier games) now correct the cell itself, and its zone follows. A zone that contradicts the cell clears it.

| Check | Result |
|---|---|
| `app/v12_step4_e2e.js` | **35/35**: 40 charted pitches save, carry id + numeric updatedAt + byType, give an arm-side lean (3.27 in.) flagged and not served, survive a reload and a relearn, list on the roster; events carry ph / bs / glove / a [2,-1] cell; the at-bat log reads it as "way"; fixes at cell resolution; no page errors |
| `app/v12_oldapp_test.js` (the v1.1 build, `git show 14e0ad2`, on the same IndexedDB) | **all pass**: opens without errors; keeps the lean fields; calls as v1.1; lists the charted session; shows the way-off pitch as way off; keeps calling a game in progress whose at-bat log holds "way". **Drops:** a v1.1 event has no ph / bs and its arsenal snapshot drops the lean; a v1.1 relearn rewrites the learned doc without the lean estimate (the next v1.2 relearn rebuilds it, checked) |
| `supabase/test/v12_sessions_test.js` | **11/11**: the charted session (40 pitches, way-off cells), the event (ph / bs / glove / way-off cell) and the pitcher's lean fields push and pull back unchanged; a caller and the pitcher himself can save a charted session, a viewer can't; a doc without a numeric updatedAt is refused. No migration |
| `scripts/test-sql.sh` | **exit 0** on local Postgres 16 with `PC_MIGRATIONS` pointing at a copy without Postgres 17's `MAINTAIN` revokes (the CI database is 17). app_sync_e2e 37 with the v1.2 build |
| `app/stage2_e2e.js` (not in the suite) | passes after two selectors were made exact ("Edge", "Way off"; location logging now on by default puts grid buttons with those words on the page) |

## Step 5: follow-ups (Nov 13)

| Change | Result |
|---|---|
| **HS ride-up** x RHO_L (Q5) | worst two-strike share of the riding four-seam up: **HS 34.7%**, D3 35.1%, D1 28.4%. `tests_v11` ceiling now 36% at every level |
| **Hot fade by ratio** (L6) | full size to 1.2x the normal share, gone at 1.6x (slider at 25%: 30% to 40%; a lone fastball: 60% to 80%). The same in both engines (`tests_v11`) |
| **S4 narrowed** (L7) | the fastball away went for a strike; the payoff is 8+ mph slower. Both engines, 7 cases (`tests_v12`) |
| **S2 / S4 / S5 resized** (`research_v12/step5_setups.py`) | smallest size lifting each fire row 5+ points: S2 0.004 (+9.8), S4 0.005 (+8.8), S5 0.004 (+6.7) |
| **Change band** (`setup_game_check.py`, 10 games per staff, credits alone) | with all three: **17.2% / 22.2% / 18.0%**, outside 2-10% (S4 and S2 drove it). **S2 and S4 dropped** (size 0, code kept). With S5 alone: **4.9% / 3.5% / 10.0%** (default / sink_sweep / sink_sweep_cmd4; the last is at the edge, N2 is its main source) |
| **S5's lean gate** | on S5's fire row the front-door sinker goes 6.7% to **0%** leaning toward the hitter, 13.7% leaning away |
| `game_mix_e2e.js` | First run on the Step 5 engine: 21 games passed (average top pitch 50.6%, one game over 70%, seed 31337 46%, was 83%). **Later runs on the same frozen build fail the gate: 2 games over 70%** (see the Part A freeze) |
| Read-through (v11 suite, 98 rows) | **92/98** (v1.1: 93/98). P1, P2, P3, P5, P7 failed before and still do. **New fail: S1f** (S1's payoff 38.9% against its 40% floor) |

**Rows whose calls moved, for your regrading** (all pass except S1f):
- E8 (HS 1-2): fastball up-away 20% to 14% (the ride-up scaling).
- S1f: dropping S4 took away the tie-break boost the fastball away had, and S1's own lift is now only 2.6 points (its
  floor was set at the Step 3 size, before your halving). Lower the floor, or resize S1? Not changed: S1 isn't in L7.
- About 5 points of tie-break moved on B1, B2, E5, I1, I3, P2p, P8 (calls that used to enable S4).
- Under 1 point: B8, G4, J3. About 2 points: D10, N2f.

## Part A freeze (Nov 13)
- `golden_v12a` frozen from the Step 5 engine (same 500 inputs as golden_v11; Python made it, JS reproduces it). Against
  the old `golden_v11`, the Step 5 engine differs on 3,606 values, as expected from the ride-up, fade and setup changes.
- **`scripts/test-app.sh` on the freeze (`5a8efa9`): exit 1. Every suite passes except `game_mix_e2e` (43/44).**
  - Passing: tests.py 45, explain 7, tests_v11 41, fast parity, tests_v12 21, lean parity, golden_v12a (JS), build,
    web copies, web demo 2, learn 27, db 18, import 14, rails 31, schema 24, stage2 21, worlds 31, pitch_rules 41,
    kinds 23, v11_fixture 8, lean 8, smoke, rules 20, v10 step 1/3/5 e2e 6/7/10, v11_step5 14, v12_step4 35, v12_oldapp 14.
  - **game_mix_e2e: 2 games over 70% (the gate allows 1).** Average top pitch 51.0% (limit 60%), none over 85%.
    Seed 31337: 46%.
- **What the game-mix failure is:**
  - Tier 2 seed 45 throws 71-72% fastballs in every run on the freeze. On the Step 4 build the same seed threw 46%.
  - Zeroing S5 gives 50%, and zeroing the ride-up credit gives 39%. Putting the old fade end back does nothing (72%).
  - So it's a knife-edge game: any small change re-routes it, which is the path-dependence v1.1 named.
  - The second game over 70% (tier 3 seed 33, 72%) depends on the games before it in the same run (learning carries
    across games). Run alone it's 59%, and it was 59% in my first full run.
  - **With S5 also at 0, the full 21 games pass:** average 48.8%, one game over 70%
    (`results/v12/partA_game_mix_S5_zero.txt`; run alongside another job, and the games are load-sensitive).
  - I didn't change anything to pass it. Your call: drop S5 (then S2 / S4 / S5 are all off), accept 2 games over 70%,
    or loosen the gate.
- Part A can ship alone from here (Q8) once you decide the game-mix gate and S1f. Also open: the miss model's width
  (Step 2) and the proposed rows.

## Part B: hitter tags (Nov 13; branch `v1.2-partb` on top of Part A)

### B1: fits (`research_v12/hitter_fits.py` -> `results/v12/hitter_fits.txt`)
- Data: 2026 pitches pulled (every 4th day, 44 days); 2024 / 2025 / 2026 pitch samples, about 165-173k pitches each.
- Method: traits from one season, fit on the next (2024 -> 2025), held out on the one after (2025 -> 2026). The bootstrap
  is by game. Each model is net of the hitter's own general rate and the pitch's height, zone and count.

| Channel | Held-out gain (boot SD) | Verdict |
|---|---|---|
| Swing path (tilt, height-adjusted) on fastball whiff / hard, off-speed whiff | -1.3 (0.8), -0.3 (2.6), +0.3 (0.6) | **doesn't ship** -> a named coach rule |
| Early-count approach | **+91.7 (14.0)** | **ships**: +0.2077 logit on in-zone swings at 0-0 / 1-0 / 0-1 per tag step |
| Off-speed hitter (OS hard% minus FB hard%) | -0.1 (0.0) | doesn't ship -> Q7's small coach-set prior |
| Spray (pull %): hard contact / grounders | **+8.5 (4.1)** / **+21.6 (5.2)** | **ships**: a pull-heavy hitter hits pitches **away harder** (+0.094) and inside softer (-0.096), and fewer grounders both sides |

Persistence (pitch sample, about a quarter season): tilt 0.92 / 0.93, pull 0.69 / 0.69, **approach 0.52 / 0.58**
(about 0.81 / 0.84 for a full season by Spearman-Brown, an estimate: I didn't pull full seasons), off-speed 0.03 / 0.10.

### B2: engine and app
- **Both engines:** `hitter_tags` on the situation; unknown = no effect.
  - Approach and spray use the fitted coefficients x RHO_L.
  - Path is a coach rule of 0.003, sized on proposed rows H1 / H2 (`research_v12/hitter_sizes.py`). It shrinks with his spot memory and is x RHO_L.
  - Off-speed is a prior of 3 pseudo-pitches at damage 0.3.
  - Tags join the re-solve inputs (only when set) and the in-play cache key.
- **App:**
  - Four tag rows on the opponent hitter card and the lineup scouting row, Unknown by default.
  - Stored as `scoutTags`: the hitter doc's existing `tags: []` is an unused placeholder, so a separate field avoids colliding with it.
  - Passed to the engine and the event snapshot only when set.
  - The hitter importer reads Approach / Spray / Path / Offspeed columns.
- `tests_v12b.py` **13/13**:
  - unknown is bitwise untagged (720 comparisons and a full call);
  - each direction checked, x RHO_L at HS, the path rule's shrink;
  - re-solve and validation;
  - **Python = JS on 600 random tagged hitters, largest difference 2.2e-16**;
  - the sizes are the fits' own coefficients.
- `FAST_TAGS=1 golden/fast.py 40`: **0 mismatches** (full calls with tags).
- `app/v12_tags_e2e.js`: **9/9**. The old-app check now also gives a v1.1 build a tagged hitter; a v1.1 edit keeps his tags (v12_oldapp_test 15/15 on Part B).
- Every tag unknown: **golden_v12a largest difference 0** (Python, 500 cases) and the JS engine reproduces it.
- **`scripts/test-app.sh` on Part B (`fd758bc`): exit 1, the same single failure as Part A** (game_mix_e2e: 2 games over 70%,
  average 51.7%). Everything else passes, including tests_v12b 13, tag parity, hitter_tags_test 3, v12_tags_e2e 9 and
  v12_oldapp 15 (`results/v12/partB_suite.log`). One fix on the way: `web/lib/engine.js` hadn't been recopied.

### B3: learner and simulator
- `learner.js` `approachModel`: early-count swings against the engine's own untagged swing chance. It's a z score, 25-pitch
  minimum, flag at |z| >= 2. It's a flag, not served.
- Swing path isn't learned, because the data show no outcome effect to learn from. Spray stays coach-set, as planned.
- `simulate.py`: `TRUE_TAGS` (hidden tags) and `SEE_TAGS` (the coach knows them).
- `app/hitter_tags_test.js` (hitter world): the learner finds the right tag **at most 4% of the time at 15-30 early-count
  pitches** (a real HS / D3 season against one hitter), 13-14% even at 400. Untagged hitters are flagged 4.9% pooled (4.6% by
  design). **So approach stays the coach's tag**; the learner's read is only a check.

### B4 / Step 6: proposed rows (`research_v12/step6_rows.py` -> `results/v12/step6_rows.txt`; **PROPOSED, you grade**)
- **Go the stated way:** L1 (arm-leaning sinker inside -10.5), L4 (down-leaning curve, fewer dirt chases, 6.9% to 0%),
  H1 (-7.1), H2 (fastball up holds +0.8; curve down -6.9), H3 (-0.9), H4 (+1.0).
- **Untestable:** L3, because the engine calls no back-foot slider to an opposite-side hitter, with or without the lean.
- **The engine goes the other way:**
  - L2: the arm-leaning sinker *away* is called more (+4.8), because its misses drift back over the plate as strikes.
  - L5: the up-leaning riding four-seam's up target falls (-6.8) and its down target rises (+3.5), because more of the up target's misses sail out of the zone.
  - L6: the glove-leaning cutter in on an opposite-side hitter drops to 0, because of the hit-batter cost.
  - H6: pull-heavy means fewer away (-3.5), as the MLB fit says.
  - H5: moves only -0.3, as Q7's small size means.
- I didn't tune anything to make a row pass: each is your call.

### Not done
- The grid check at the research-check leans (Step 6's last bullet).
- `scenarios_v12.json` as a graded suite: the rows above are a script until you grade them.
- Step 7 (release): no merge, tag, migration or production change. Those wait for your go.

