# v1.1 build report (six pitches, profiles, setups)

Plan: `docs/PLAN_v1.1_2026-11-12.md`. Branch `v1.1-work` from `main @ b318098` (tag `v1.0`). Every result below was run
in this session and is as printed; logs are summarized, not edited.

## Step 0: start line (Nov 12)

Environment: Linux 6.18 cloud workspace, Python 3.13.18, Node v22.23.4, Playwright Chromium 153 (preinstalled).

### Repo state
- Local tag `v1.0` → `b318098`, which is also `origin/main`. **The remote has no `v1.0` tag** (`git ls-remote` lists only
  `archive/v1.0-nov6-line` and `archive/v1.0-work`), although the plan's header says it was pushed from Drew's PC. Not a
  blocker for the build; worth a `git push origin v1.0` from that PC.
- Branch `v1.1-work` created; the three research docs and the plan committed into `docs/`.

### Baseline checks

| Check | Result |
|---|---|
| `scripts/test-app.sh` | **exit 0**, 31 min. tests.py 45/45, explain 7/7, `fast.py 40` 0 mismatches (live Python vs JS), `golden_v10.js` PASS, `app/dist` matches source, `web/lib` copies match, web demo 2/2, learn 27, db 18, import 11, rails 31, schema 24, stage2 21, worlds 31, pitch rules 41, smoke, rules_e2e 20, v10_step1_e2e 6, v10_step3_e2e 7, v10_step5_e2e 10 (301 counted checks + smoke) |
| `python3 golden/golden_v10.py check` | **PASS**, 500 cases, largest difference 0.00e+00 |
| Read-through `readthrough/scenarios.py` (v10 suite, sha256 `3bda5063…`) | **71/71**; no hard-rule row with a Not-acceptable share (`results/v11/scenarios_v10_baseline.json`) |
| Predictability grid (`grid_v10.py`, 540 cells) | every check PASS (same as v1.0); pitch-type shares saved as the call-change baseline, `results/v11/grid_v10_baseline.json` |

Environment note: the first `test-app.sh` run stopped at `db_test` with `Cannot find module 'fake-indexeddb/auto'`
because the Node dev dependencies weren't installed in this workspace. `npm ci` (the repo's `package-lock.json`)
installed them; no file changed. The re-run above is the result. `scripts/test-sql.sh` (needs a Postgres) was not run
in Step 0; it runs at Step 5, when the Supabase migration changes.

### Statcast data
`python3 fetch_statcast.py` (unchanged: 2024 and 2025, every 4th day, Apr 5–Sep 25): **88 files, 340,378 pitches**
(2024: 173,856; 2025: 166,522), the same totals as v1.0's Step 0. Two files are empty, 2024-07-18 and 2025-07-14, both
All-Star breaks. `arm_angle` is filled on 99.2% (2024) and 99.6% (2025) of pitches. The CSVs stay uncommitted
(`.gitignore:18`).

### What the baseline already shows (the plan's premise, checked Nov 12)
- v1.0 calls curveballs when the arsenal has one: 15–27% of calls in the grid arsenals at D3.
- Shape tags are close to cosmetic: on the average three-pitch arsenal at D3 (bases empty), a sweeper and a tight slider
  give identical pitch-type shares in every count (slider 27.7% either way), and riding vs running fastball moves the
  fastball share from 49.2% to 49.9%. v1.1's call-change checks measure against this baseline.

Step 0 complete. Next: Step 1 (six kinds, one migration table, exact v1.0 reproduction).

## Step 1: six kinds and profiles, no behavior change (Nov 12)

### What changed
- **Both engines** (`engine.py`, `app/engine.js`, copied to `web/lib/engine.js`):
  - six kinds: `KINDS = (FB, SI, FC, SL, CB, CH)`;
  - helpers `is_fastball` / `pclass` / `key_kind` (JS `isFastball` / `pclass` / `keyKind`);
  - every class decision moved to them: 19 lines in `engine.py` and 14 in `engine.js` now call a helper (counted from the
    diff: confidence, targets and heights, coach reads, sit prior, eye level, timing, damage keys, matchup keys,
    `mashed`, `v_fb`, `loc_quad`, `lean_b_h`, `shape_fit`), plus the per-kind lookups (`KIND_W`, `DEFAULT_VELO`,
    `SHAPES`, `gb_rate`, `KINDS`, validation). The plan's earlier estimate of 29 / 28 counted `is_offspeed` sites,
    which were already correct for SI / FC and needed no change.
- **One migration point and table:** `migrate_pitch(kind, shape, type)` runs inside `Pitch` creation in both engines,
  with the plan's table:
  - 13 stored types, used only while a pitch still carries that type's v1.0 tags, so a coach's later edit is never undone;
  - 14 v1.0 kind/tags;
  - 6 rows for a v1.0 fastball tag reaching a v1.1 sinker or cutter (a v1.0 portal proposal).

  It is idempotent. `check_inputs` validates kind **and** tag after migration.
- **No behavior change:**
  - each migrated pitch carries its v1.0 numbers (movement, `shape_fit` line, `KIND_W`, grounder rate, default velocity);
  - SI / FC entries equal the FB values;
  - stored situation keys (damage, matchup memory, coach reads, learner hitter keys) use `key_kind`, so a sinker reads the
    fastball's stored memory as before.
- **App:**
  - stored pitchers migrate when loaded (boot and every reload after sync), through the engine's table and the stored
    type, once per record (`kindsV = 11`). Each change is written back and logged in `meta.v11_migration`.
  - `PITCH_TYPES` (`db.js`) is now the table's types.
  - six kinds in the UI (labels, sinker / cutter colours in both themes, signs 5 and 6 as card numbers on the sign card,
    v1.1 tags in the shape list).
  - a migrated sinker or cutter keeps its v1.0 sign in its own `sign` field (O1) until the coach changes its type.
  - matchup keys are logged by fastball class.
  - the learner's change-point check reads old snapshots in v1.1 terms, so the migration alone is not a change of pitch.
  - the importer maps names to the six kinds.
- **Outside the engines:**
  - `golden/cases.py`, `fuzz.py`, `simulate.py` (matchup keys by class; the old-engine fallback), `tests.py`;
  - `readthrough/scenarios.py` (an "FB" row matches any fastball-class pitch; matchup keys by class), `readthrough/read.py`;
  - the simulated-log report scripts (`review.py`, `metrics.py`, `regrade.py`, `compare_sims.py`, `batch.py`,
    `matrix/report.py`, `readthrough/step7_compare.py`).

### Proof (run in this session, final code)

| Check | Result |
|---|---|
| `python3 golden/golden_v10.py check` | **PASS**, 500 cases, largest difference **0.00e+00** (the inputs include 108 FB/sink, 96 FB/run, 95 FB/cut, 82 CB/loopy and 116 CB/sharp pitches, all migrated on the way in) |
| `golden_v10.js` (JS against the frozen v1.0 reference) | **PASS** |
| `golden/fast.py 40` (live Python vs JS) | **0 mismatches** |
| `tests.py` | **45/45** |
| Read-through (v10 suite) | **71/71**; every call share identical to the Step 0 baseline (largest difference 0) |
| `tests_v11.py` (new, 13 checks) | **13/13**. Highlights: 33 table rows map as listed; idempotent with or without a type; a type never undoes a coach's edit; engine.py, engine.js and db.js hold one table; **against the real v1.0 engine** (`git archive v1.0`): sinkers, two-seamers, cutters, cut / run four-seamers, 12-6s, knuckle curves, splitters and slurves, typed and untyped, give the same call mix (96 situations at 4 levels, largest difference 0); sinker-only, cutter and all-six arsenals run in every count at every level; validation rejects unknown kinds and cross-kind tags; no class decision left on the bare "FB" string |
| `app/kinds_test.js` (new, 17 checks) | **17/17**: JS migration; the app's types = the engine's table; a stored v1.0 pitcher migrates once, logged, with sinker / two-seam / cutter keeping sign 1; an already-migrated pitcher is left alone; a seven-pitch arsenal with a sinker and cutter calls |
| `scripts/test-app.sh` | **exit 0**, no errors. Every check from Step 0 still passes, plus `tests_v11` 13 and `kinds_test` 17 (331 counted checks + smoke). The browser tests, the smoke test, the website demo and the `web/lib` copy check all pass |

### Written down, not hidden
- **One deliberate number change:** a stored generic "Curveball" (v1.0 stored it as CB/loopy) becomes CB/typical. Only
  its tunnel movement moves (−14/−5 → −10/−7). Every other stored type keeps its exact v1.0 numbers. `tests_v11.py`
  checks this is the only difference.
- **Open for Step 1b:** old event snapshots carry v1.0 kinds and no type, so the engine reads a typed two-seamer in an
  old snapshot as FB/runs rather than SI/two-seam. The numbers are identical now; from 1b on, the learner and replay must
  read old snapshot pitches through the roster's type (added to the plan's Step 1b).
- **The portal is still v1.0 until Step 5:** its importer copy (`web/lib/pc_import.js`), its shape proposer and the
  Supabase shape whitelist. The six extra table rows keep an accepted v1.0 proposal from breaking a v1.1 pitch in the
  meantime.
- **Release (plan Step 6):** a v1.0 app can't read SI / FC pitchers, so every device updates together.

## Step 1b: profile table and thresholds (Nov 12)

### The data (`profiles_fit.py`, `results/v11/profiles.txt` / `profiles.json`)
- 2024 Statcast, 172,292 pitches (fit), and 2025, 165,129 (held-out check).
- Pitch types are mapped to the six kinds, and movement is normalized to a right-hander. Check: four-seam arm-side run
  is 7.6 in. for righties and 8.0 for lefties after the flip; sweepers sweep −14.2 in.
- Each pitcher-game's main fastball is his most-thrown fastball-class pitch that game.
- Every tag has a row: 28 rows (6 typical + 22 profiles).
- MLB highlights:
  - riding four-seam 19.0 in. IVB;
  - drop sinker 2.4 in. IVB with 15.8 in. run;
  - cutter 5.0 mph off the four-seam (the plan guessed about 4);
  - sweeper 11.5 mph off with 13.8 in. of sweep, gyro 7.9 off with 1.4;
  - 12-6 curve −11.8 in. IVB / −3.4 in. side;
  - slow curve 17.2 mph off;
  - fade changeup 8.8 in. IVB, split 1.9.
- College rows are Rapsodo's college averages plus each profile's MLB difference. HS rows are college × 0.85 movement,
  same speed gaps. D1 = D3 = college; travel = HS.

### What the label check settled (plan 2.2 updated)

| Statcast label | Thresholds alone, 2024 → 2025 | Decision |
|---|---|---|
| Sweeper (ST, 12,693) | 70.8% at HB ≤ −12 → **84.1%** at −10 (precision 79.8%); 2025 **81.6%** | one move, −12 → −10 |
| Splitter (FS, 5,204) | 27.4%; the best movement or spin rule reaches 62% at 43% precision | the pitch name sets the tag |
| Slurve (SV, 1,014) | 22.9%; best 71% at 17% precision | the pitch name sets the tag |
| Forkball (FO, 28), slow curve (CS, 2) | too few to gate; reported | the name sets split; slow by speed |

- **A pitch name that names a profile sets the tag**, in the fits (ST / SV / FS / FO) and in the app (Sweeper, Slurve,
  Splitter, Forkball, Two-seam, 12-6 curve). The thresholds tag everything no such name covers. Those labels carry
  grip information that movement can't see.
- **A grip name (knuckle curve) is tagged by its movement.** A stored "Knuckle curve" now migrates to a typical curve
  instead of "power": MLB knuckle curves are 12.3 mph off the fastball, and the power profile is 7.9.
- **Ride cutter is judged against the typical cutter**, like every fastball tag. The first draft compared it with the
  game's main fastball and tagged flat cutters from sinker pitchers as "ride".

### What changed in the engines
- `PROFILES` (by level), `PROFILE_T` (thresholds) and `MOVE_RATIO` are generated into both engines
  (`profiles_fit.py --write-engines`). `SHAPES` and `DEFAULT_VELO` are gone; `profile()`, `default_mph()` and
  `movement(p, level)` read the table. Tunneling uses his level's movement.
- **Default speed off his own fastball:** a pitch with no speed is his main fastball's entered speed less the profile's
  gap (`resolve_speeds`); with none entered, 85 less the gap. Under v1.0's fixed defaults a 72-mph fastball got a 77-mph
  slider and a 94-mph fastball a 71-mph curve; they now get 63.9 and 87.8. Measured speed and movement always win.
- **New helpers (plan 2.1 / 2.2), both engines:** `primary_fb` (coach's mark, else FB > SI > FC, else fastest),
  `rel_shape`, and `tag_for`, which the importer (Step 5) and the fits (Step 2) use.
- **Old games read through the roster's type:** the learner (pitcher and hitter models) and the offline tools
  (`shadow.js`, `replay_check.js`) read a pre-v1.1 snapshot pitch through its roster type, so an old two-seamer is a
  sinker, not a running four-seam.
- **Simulator:** the hidden "true movement" starts from his level's profile.

### Proof (this session, final code)

| Check | Result |
|---|---|
| `tests_v11.py` | **22/22**. New in 1b: the table, thresholds, ratios, names and default speeds are identical in both engines; every tag has a row at every level; MLB rows = the Statcast medians; sweeper ≥ 80% in 2024 and 2025; **both engines' `tag_for` reproduce the fit script's tags on 4,200 real 2024 pitches (0 misses)**; Python = JS on 3,000 random pitches at every level; names set tags, grips don't; default speeds follow the profiles; main fastball and relative shape; speeds read off the main fastball in both engines. The Step 1 check against git `v1.0` now gives every pitch v1.0's own entered speed and movement: **still identical (96 situations, difference 0)**, so 1b changed only the defaults |
| `app/kinds_test.js` | **20/20** (adds: old snapshots read through the roster type; a v1.1 snapshot is never changed by it; the table in the app) |
| `tests.py` | **45/45**. One check (HS tunneling = 0.6 × college) now holds movement fixed with measured numbers, because HS profiles move 15% less by design |
| `golden_v11a` | frozen (500 cases, 225 rewritten into v1.1 terms); Python check **500 cases, largest difference 0.00e+00**; **JS reproduces it**; `golden/fast.py 40` 0 mismatches. It replaces `golden_v10` as the gate in `scripts/test-app.sh` (`golden_v10` stays as history) |
| `scripts/test-app.sh` | **exit 0**, no errors: 343 counted checks + smoke, browser tests, website demo, built-app and `web/lib` copy checks |
| Read-through | **71/71**; 110 of 705 numbers moved, the largest by 0.65 points of one call's share |
| Predictability grid | every check passes; **0 of 540 cells changed** (every grid arsenal has speeds entered, and the root calls have no previous pitch, so tunneling doesn't enter) |
| Golden cases still in v1.0 terms (149 with full calls) vs v1.0 | median largest share change 0.8 points, 90th percentile 9.3, max 78; drawn call changed in 21. Six of the eight biggest movers are the default-speed correction above (an entered fastball speed with an off-speed pitch that had none); the other two have no speeds and move from the sinker and sweeper profiles |

## Before Step 2: the in-game mix collapse (FINDING_v1.0_game_mix_collapse_2026-11-12, Nov 12)

The finding: in the v1.0 app, an 82-pitch game of random results collapses onto one pitch (75–95%), while one-off
calls look normal. I fixed it before the fits, because the fits and the read-through test single situations and can't
see a game-long effect.

### Diagnosis (run in this session on `v1.1-work`, same script as the finding)
- **Reproduced:** by pitch 10 the mix is 100% slider and stays there.
- **Re-solving the app's own state at pitches 1–40 with one input removed at a time** isolates today's landing record,
  and within it the hot pitch's record. Removing the fastball's record changes nothing. Removing the slider's restores
  about 50 / 25 / 25.
- **The cause is the v1.0 Step 7 coach read "landing better than normal → lean on it".** It fires once a pitch lands
  0.10 better than expected (shrunk with K = 5): the slider went 4-for-5 (0.098, off), then 5-for-6 (0.13, on). It then
  adds a flat 0.03-run credit to every spot of that pitch, about 3× the mixing temperature, which pushes every other
  pitch outside the mix. The hot pitch is then the only one thrown, so it keeps the evidence that keeps it hot.
- **Only that read's credit at 0 → every test game spreads** (as is → credit off): tier 2 seeded 76/3/3 → 43/26/13; tier 3
  seeded 70/9/3 → 44/28/10; tier 3 every whiff "Fooled" 62/17/3 → 41/25/16; plus two unseeded runs. The fitted landing
  model alone leans a little (slider 35% instead of 29% at pitch 20), which is the right size.

### Fix (both engines)
- **"Lean on it" wears off once he has leaned:** `hot_fade` keeps the read at full size until the pitch's share of
  today's pitches is 10 points over its normal share, then fades to nothing at 40 over.
  - Normal share: its class's half of the pitches, split evenly (the count prior's shape).
  - Today's pitches: the larger of the pitch count and the landing record.
  - With fastball, slider and changeup, a hot slider leans at full strength up to 35% of his pitches and stops at 65%.
- **Drew's graded rows are unchanged:** all 15 read-through rows with a landing record give the same shares (each has
  at most 10 throws of the pitch at a pitch count of 50, so the read is at full size). Row C5 is still 76%; E4 and J5,
  which Drew graded acceptable at 100% slider in that single situation, still give it.
- **`tests.py` coaching-read check:** its hot situation had ten changeups thrown at a pitch count of 0, which can't
  happen; it now carries the read-through's pitch count of 50. Still moves its calls 20+ points.

### Regression check: `app/game_mix_e2e.js` (new, in `scripts/test-app.sh`)
- Five 82-pitch games through the real app. Each one collapsed on the unfixed v1.1 app; the test asserts no pitch over
  70% of a game (v0.9 threw 61% fastballs on this script).
- Before the fix: 93%, 84%, 85%, 94%, 87% → **5 FAIL**. After: 48%, 49%, 52%, 49%, 55% → **5 pass**.

### For Drew: a residual pattern from the not-landing rule
- In one more game (tier 3, seed 11) the slider still reached 79%, and the cause is different. On random results the
  fastball went 1-for-5, then 5-for-12, so it reads as not landing.
- Your v1.0 Step 7 rule holds a not-landing pitch back at 0-0 and when he's behind, and still calls it in up counts so
  he can regain confidence. Here it got 12 throws in 60 pitches, not enough to recover, so the slider got most of the
  game.
- Drew's answer (Nov 12): yes, the hold lifts after a run of pitches without it. Done, below.

### Comeback for a cold pitch (Drew, Nov 12; both engines)
- `Situation.since_thrown`: pitch name → his pitches since he last threw it today. The app builds it from the game log
  for the current pitcher (`sinceThrown(g)` in `index.src.html`, counting the pitch actually thrown when he shook off);
  `simulate.py` keeps it too.
- `comeback(p, s)`: true once `since_thrown[p] >= COMEBACK_N` (8). `allowed_calls` holds a not-landing pitch back at 0-0
  and behind in the count only while it is not on a comeback. The first throw resets the count, so a pitch that still
  doesn't land goes back on hold for another 8.
- Nothing changes for a pitch without a landing record, or when `since_thrown` is empty (the golden inputs, the
  read-through rows). `golden_v11a` is unchanged.
- The tier 3, seed 11 game is now in `game_mix_e2e.js` as a sixth game: top pitch 79% before the comeback, **56%** after.

### Proof (this session, final code)

| Check | Result |
|---|---|
| `app/game_mix_e2e.js` (new) | five whole games, top pitch 48 / 49 / 52 / 49 / 55%. The same games on the unfixed build: 93 / 84 / 85 / 94 / 87%, all FAIL. With the comeback: a sixth game (tier 3, seed 11), 79% → 56% |
| `tests_v11.py` | **24/24** (adds: the fade's size at 10, 17, 25, 34 of 50 and 33 of 39 sliders, identical in both engines; the comeback: a fastball landing 5-for-12 is held at 0-0 at 7 pitches without it, called at 8, and called ahead in the count throughout, identical in both engines) |
| `tests.py` | **45/45** |
| Read-through | **71/71**; the 15 rows with a landing record give the same shares as before the fix |
| `golden_v11a` | re-frozen with the fix; Python check 500 cases, largest difference **0.00e+00**; JS reproduces it; `fast.py 40` 0 mismatches |
| `scripts/test-app.sh` | **exit 0**, no errors: 354 counted checks + smoke, browser tests, website demo, built-app and `web/lib` copy checks |
| With the comeback (`scripts/test-app.sh` components, final code) | all pass: **357** counted checks (19 components) + smoke, build and `web/lib` copy checks, website demo. Run in two parts because the session's background limit stopped the first run after `stage2_test`; the rest (`worlds_test` through `game_mix_e2e`) ran on the same code |

**The live app (`main`, v1.0) still has this bug** (Drew, Nov 12: it isn't live, so no hotfix). The fix is two small functions plus one changed line in each engine,
and it could ship to `main` as v1.0.1 on its own, ahead of v1.1, if Drew wants it there.

## Step 2: profile terms, fitted and priors (Nov 12)

### The fits (`profile_terms_fit.py` → `results/v11/step2_report.txt`, `step2_fit.json`)
- Statcast 2024 (171,965 pitches) to fit, 2025 (164,786) held out; `seq_fit.py`'s logistic with pitcher and batter random
  intercepts; ship on a held-out log-loss gain over 2 game-clustered bootstrap SDs.
- Each pitch is tagged with the Step 1b rule (thresholds; a Statcast label that names a profile wins).
- Controls: count, outs, runners, margin, times through, pitch count, previous pitch, usage share, location splines and
  class × location. Not the per-class speed / spin / movement block `seq_fit.py` used: in the engine a profile is its
  movement, so the profile terms must carry that effect.

| Item | whiff \| swing | chase \| out of zone | called strike \| take | hard \| contact |
|---|---|---|---|---|
| 2a C: shape (speed off his fastball, vertical, arm-side break, arm angle) by class, over A (v1.0 classes) | **ship** 7.6 SD | **ship** 7.9 SD | **ship** 3.1 SD | **ship** 6.5 SD |
| 2a B: kind and profile, over A | ship 4.3 SD | ship 7.6 SD | no (1.0) | ship 4.1 SD |
| 2a B over A + C (what a profile adds beyond its shape) | **ship** 2.3 SD | **ship** 3.6 SD | no (−1.4) | no (0.5) |
| 2b fastball profile × up / down / inside, over the shipped 2a | **ship** 5.3 SD | — | no (0.6) → prior at 0 | no (−0.9) → prior at ¼ |
| 2c slider / changeup × opposite side (v1.0's same-side patches) | no (0.0) | no (1.3) | no (−1.3) | no (−2.9) |
| 2c class + signed break and vertical × opposite side | no (−1.6) → prior at ½ | **ship** 2.6 SD | no | no (−0.4) → prior at 1 |

- **Priors** (plan 2.3) where nothing shipped: the 2024 per-profile rates as logit differences, checked on 2025 (must not
  lose more than 1 boot SD; halved until they pass). Platoon whiff passed at ½ (+1.0 SD), platoon hard at full (−0.2 SD),
  fastball-zone hard at ¼ (−0.6 SD). The fastball-zone called-strike prior cost 36 SD and stays at 0.
- **The engine's coefficients come from one joint fit per target** with every shipped block ("final" in the fit file),
  so blocks tested one on top of another aren't counted twice. (Adding B and 2b separately had given cutters a +0.86
  whiff term on top of +0.95 low; the joint fit gives +0.04 and +0.95.)
- **2e grounders by profile**: the same definition as v1.0's table; each kind's average equals v1.0's six numbers
  (four-seam 0.340, sinker 0.556, cutter 0.412 exactly; off-speed within 0.001). Profiles with under 200 balls in play use
  their kind's rate (power curve, ride cutter).
- **Arm angle by slot**: 2024 medians of the Statcast buckets: sidearm 14.7°, low ¾ 29.1°, ¾ 40.2°, high ¾ 48.8°,
  over the top 58.5°.

### What changed in the engines (`profile_terms_tables.py --write-engines`, both engines)
- `profile_terms(p, q, s, arsenal)`: four logit terms (whiff, chase, called strike, hard), added in the outcome model next
  to the side terms. Zero for the typical pitch of each class at his level (`pt_ref`), so `KIND_W` and the other class
  values stay; other shapes move off it. Movement is read on the MLB scale; at HS every term is × 0.6 (`RHO_L`).
- `shape_fit` keeps only the off-speed location line. Gone: v1.0's FB/ride up line, the sinker line, and the slider
  same-side +0.3 and changeup same-side −0.3 patches (2c found no held-out support for either).
- `gb_rate` reads the profile table.
- Offsets the engine gives each MLB profile: `results/v11/step2_terms.txt`. Examples (logit vs the typical pitch of its
  class): drop sinker whiff −0.85, chase +0.54, called strike +0.33, grounders 0.67; riding four-seam whiff +0.46
  (+0.17 when aimed up); sweeper hard −0.07 vs same-side and +0.21 vs opposite; fade changeup chase −0.43.

### Realism gate (plan: refit if K / BB / HBP move more than 1 point)
- With the terms on and the old level shifts: MLB K 21.6% vs 20.0% real, D3 18.0 vs 16.2, HS 22.3 vs 21.0. Over the line.
- Refit `refit_mlb.py` then `fit_all.py`. MLB: in-zone whiff shift −0.56 → −0.80, out-of-zone −0.12 → −0.31, swing
  shifts −0.16 / −0.20 → −0.25 / −0.15; called strike, command and HBP unchanged. Now: D1 K 19.4 / BB 10.8 / HBP 3.4
  (real 19.3 / 10.8 / 3.4), D3 16.3 / 11.4 / 4.2 (16.2 / 11.4 / 4.2), HS 21.1 / 14.1 / 4.1 (21.0 / 14.1 / 4.1), MLB 20.0
  / 7.9 / 0.9. `engine_data.json` re-exported for the app and the website.

### Call-change checks (`readthrough/v11_call_changes.py`; bands proposed, Drew confirms at Step 4)
"1b" = the same engine with Step 2's three functions and the old level shifts set back (`readthrough/step2_off.py`).

| Band | 1b | Now |
|---|---|---|
| sweeper's slider share vs same-side ≥ gyro's + 5 | FAIL 28.4 vs 27.6 | **pass** 31.2 vs 25.6 |
| sweeper below gyro vs opposite-side | FAIL 27.6 vs 26.8 | **pass** 21.3 vs 23.9 |
| riding fastball aimed up ≥ 10 points more than dead-zone | FAIL 14.4 vs 9.7 | **FAIL** 11.7 vs 11.9 |
| split changeup used more with two strikes than fade | FAIL 24.1 vs 24.4 | **pass** 25.5 vs 21.5 |
| firm changeup chased less with two strikes than fade | pass | pass 0.0 vs 0.6 |
| 12-6 curve used more early vs opposite-side than sweeping | FAIL 26.8 vs 26.8 | **pass** 26.0 vs 25.9 (barely) |
| a sinker / cutter takes ≥ 10% of calls | pass / pass | pass 38.1% / pass 43.7% |
| sinker mostly in to same-side hitters | FAIL 1% | **FAIL** 9% |
| cutter used more vs opposite-side | FAIL | **FAIL** 40.2 vs 47.3 |

7 of 10 pass now (3 at Step 1b). The three that fail are places where the 2024–25 data don't support the research doc's
claim at held-out strength (no riding-fastball-up edge beyond its shape, no inside edge for sinkers, no cutter platoon
edge).

### Other results (this session, final code)

| Check | Result |
|---|---|
| `tests_v11.py` | **30/30**. New: both engines' tables equal `step2_terms.json` and a fresh build from the fit file; ships as fitted; Python = JS `profile_terms` on 600 random pitches (largest difference 0); the typical pitch of each class keeps its v1.0 value at every level; HS = 0.6 × college (to 0.005, HS rows are rounded); grounders by profile. The v1.0 exactness check now sets Step 2's three functions and the old level shifts back, and is still exactly v1.0 (96 situations, difference 0) |
| `tests.py` | **45/45**. #16 now checks the profile grounder table against v1.0's. Two v0.x checks rescoped, reasons in the code: R1 (1-2, runner on 3rd) asked for the slider on top; it is now fastball 40%, slider 37%, so it asks for the slider within 5 points. Learning mode asked for the grooved 0-2 riding fastball under 2%; it is 3.4%, 0.017 runs worse, so it asks for under 5% |
| Predictability grid | every check passes; 169 of 540 cells change their top call; pitch-type shares move by a median of 2.4 points (95th percentile 10.3, largest 23) |
| Read-through (v10 suite) | **69/71**. 28 rows' call mixes moved more than 10 points (8 over 20). Fails: **C5** (1-2, four-pitch, curve landing 8-for-10): the up-away fastball you graded acceptable went 24% → 0 and a down-away fastball (arguable) took 29%, so acceptable is 49%. **F2** (1-2 after a slider whiff): the slider down-away / chase floor is 13.5% vs 15% |
| `scripts/test-app.sh` | **exit 0**, no errors: **363** counted checks (19 components) + smoke, build and `web/lib` copy checks, website demo. `game_mix_e2e` 12/12: top pitch per whole game 56 / 61 / 60 / 61 / 46 / 60% (Step 1b with comeback: 48–56%); the changeup gets only 1–3 of 82 pitches in four of the six games |
| `golden_v11` | frozen from this engine (500 cases, 250 full solves; `golden/golden_v11.py make --tag v11`); **JS reproduces it** (largest difference 1.3e-13). It replaces `golden_v11a` as the gate in `scripts/test-app.sh`; v11a (Step 1b) stays as history. 2d changed nothing, so this freeze stands until release |

### For Drew (Step 4 will ask these)
- **The high fastball with two strikes (C5).** The data give the riding four-seam a whiff edge everywhere (+0.46 logit)
  and less of it up (+0.17): no extra up-in-the-zone edge beyond its ride. With v1.0's hand line gone, the engine now
  elevates the riding fastball less with two strikes. Your read says it's the strikeout pitch. Keep the data, or keep a
  coach rule for it?
- **Cutters and sinkers get used a lot** once they're more than copies of the four-seam: 44% and 38% of calls in a
  four-pitch arsenal next to a riding four-seam (31% and 35% at Step 1b). Fewer hard-hit balls and more chases (cutter)
  and more called strikes and grounders (sinker) are what the data say. Is that share believable for your pitchers?
- The three bands above that fail.
- In whole app games the changeup gets 1–3 of 82 pitches in four of six games (it had 2–34 at Step 1b), and the top pitch
  is 56–61%. Still inside the 70% guard, but the mix is narrower.

### 2d familiarity (`familiarity_fit.py` → `results/v11/step2d_report.txt`)
- Built because 2a shipped. Target hard | ball in play; base = the controls plus v1.0's class counts (pitches of that class
  the hitter saw from this pitcher in earlier plate appearances today, capped as v1.0). Tested: per-pitch familiarity
  with carry-over to other pitches by shape distance (speed / 2 mph, IVB / 4 in., HB / 4 in.), the carry-over width
  picked on 2024 only.
- **No ship** in either sample: starts (18+ batters faced) +0.1 SD, all games +0.3 SD (width 2 chosen in both). So
  v1.0's class-count term stays (the plan's fallback), and nothing changes in the engines, app, simulator or goldens.
- Noted, not acted on: on this data the class-count coefficients come out at about half of v1.0's (FB +0.033 / OS +0.069
  per pitch vs the engine's +0.058 / +0.116, which came from v0.8's fit with the pitch-quality controls). No step of the
  plan refits them; I can if you want.

### Plan vs build audit and gap fixes (Nov 12, night; Drew asked for no gaps)
Read the plan's Step 2, 2.2, 2.3 and 2.5 line by line against the commit (7e46bca). Found and fixed:

| Gap | Fix | Result |
|---|---|---|
| 2a "replaces `KIND_W` and the off-speed lines of `shape_fit`": not done | Fitted the class values (class dummy + class × location, from the same joint fits) and built them in | **Held back for Drew.** They're much bigger than v1.0's: a changeup aimed down-away +1.02 whiff vs the four-seam (v1.0 +0.55); off-speed aimed up −0.56 hard (v1.0's hanger line gives +0.70). With them in, MLB K went 20% → 33% before the refit, and after it five of Drew's v1.0 checks failed (hitter's-count fastball share 36% vs his 50% floor; the 3-1 band; 3-2 at HS 89–98% one call; the repeat and coach-read checks). Likely cause: MLB data already carry the surprise value off-speed gets from being mixed, and the engine adds its own sit-and-mix game on top. `class_terms()` now holds v1.0's hand values in one place; the fitted table is in `results/v11/step2_terms.txt` ("Class terms") |
| E10 / 2.2 slot adjustment (built if 2a ships) missing | 2024 slopes of IVB and HB per degree of arm angle, within each kind and tag (four-seam +0.081 / −0.078 in. per degree; curve −0.073 IVB; changeup +0.190 / −0.111; …), applied to an **untagged** pitch's default movement in `movement()`, both engines | Over the top vs sidearm, an untagged four-seam: more ride, less run; a curve more drop. A tagged pitch keeps its profile (a "rides" fastball rides at any slot); measured numbers win |
| 2b inside / away by batter side; FC/ride line ungated; high-sinker finding unchecked | Inside lines split by same / opposite side; the ride cutter's lines tested on their own | 2b whiff ships 5.5 SD. Ride cutter +1.0 SD → no own lines, uses the cutter's. **High sinker:** hard contact up in the zone −0.08 (95% −0.24 to +0.07), up above the zone +0.25 (−0.20 to +0.70) vs a four-seam there: the finding's direction, not significant at 95% |
| 2.3 priors split by side **and** early / two-strike; called-strike platoon prior missing | All priors by side × early / two-strike; called-strike platoon prior added | Whiff platoon prior at full scale (−0.5 SD), hard at full (−0.3 SD), fastball-zone hard at ½ (+0.1 SD). Both called-strike priors cost 36–39 SD on 2025 and stay at 0 |
| Report: 5 example calls per item; coefficient intervals | `readthrough/v11_call_changes.py --examples` (each item turned back to Step 1b alone, the 5 spots that move most) → `results/v11/call_examples_step2.json`; intervals in `step2_fit.json` | Below |
| Plan text stale (2.5 "labels never set tags"; 2a "rel_shape") | Plan updated: 2.2 slot built, 2.5 labels that name a profile set the tag, 2a's C as built and the class-values decision | — |

Also: the coach read "away" (hit hard on one side → the other side) moved its calls 19.9 points under the new fastball inside / away lines, just short of Drew's 20; resized 0.01 → 0.012 (23 points).

**Per-item effect** (median call-mix move over 216 spots, D3, 9 arsenals × 12 counts × both sides; the 5 largest are in the json):
2a shape and profile 9.0 points (largest 32: finesse vs opposite-side 2-0, changeup 33% → 25% down-away, curve up);
2b fastball zone 0.4 (largest 42: the cutter arsenal, cutter goes down-away / down-middle instead of middle);
2c opposite-side chase 0.0 (largest 28: finesse 1-2 vs opposite-side, changeup chase 0 → 28%);
priors 3.1 (largest 24); 2e grounders 0.5; slot adjustment 0.2; removing v1.0's fastball lines and SL / CH same-side
patches 1.8 (largest 16).

**After the fixes** (this session, final code):

| Check | Result |
|---|---|
| `tests_v11.py` | **31/31** (adds the slot-adjustment check; the exactness check now also sets the slot movement and the "away" size back, still exactly v1.0) |
| `tests.py` | **45/45** |
| Realism | no refit needed: MLB K 20.1 / BB 8.0 / HBP 0.9; D3 16.4 / 11.5 / 4.2; HS 21.1 / 14.1 / 4.1 |
| Call-change bands | **6 of 10** (Step 1b 3): the 12-6 early-count band now misses (25.1 vs 25.8; it passed by 0.1 before) |
| Grid | every check passes; 179 of 540 cells change their top call |
| Read-through | **69/71** (C5, F2 as before) |
| `scripts/test-app.sh` (commit 9f33798, run in a separate worktree) | **exit 0**, 364 counted checks, no errors; whole app games top pitch 45–61% |

## Step 3: setup and payoff rules (Nov 12–13, overnight; Drew asleep, grades pending)

**Unattended calls, all marked for Drew.** He asked me to keep going through Steps 3–5 overnight. The plan has Drew
grade the rule rows before the sizes are set; I wrote the rows myself (proposed grades, marked `"status": "proposed"`),
sized each rule on them, and list every judgment below so he can overrule it at Step 4.

### Statcast direction checks first (`setup_checks.py` → `results/v11/step3_checks.txt`)
The payoff pitch after the rule's setup earlier in the at-bat vs the same payoff pitch after anything else, on the
Step 2 controls plus the previous pitch's class × height × side (a stand-in for the pair terms), 2024 + 2025, random
intercepts, game-clustered 95% intervals. The plan's decision rule, applied as written:

| Rule | What the data say | Decision |
|---|---|---|
| S1 up, then down | whiff +0.21 (−0.03 to +0.44); **chase −0.20 (−0.39 to −0.01)** | O2 keeps it: built at its smallest passing size |
| S2 in, then away (same side) | all intervals include 0 | built, smallest passing size |
| S3 hard in, soft away (opposite side) | all include 0 | built, smallest passing size |
| S4 same lane, slower | all include 0 | built, smallest passing size |
| S5 front / back door | no Statcast check (needs called-strike door detection) | built at the smallest size, gated (command 4+, landing, two strikes) |
| S6 steal strike one | all include 0 | built, smallest passing size |
| S7 climb the ladder | **whiff +0.62 (+0.07 to +1.17), chase −0.68 (−1.12 to −0.24)**: they disagree | built, smallest passing size, flagged |
| S8 strike, then bury | **chase −0.13 (−0.25 to −0.01)** | **not built** (dropped unless Drew keeps it) |
| S9 work the edge, expand | all include 0 | built, smallest passing size |
| S10 sinker, then cutter | **hard +0.34 (+0.13 to +0.56)** | **not built** (dropped unless Drew keeps it) |
| N1 two different breaking balls back to back | **whiff +0.16 (+0.05 to +0.28)**: the penalty points the wrong way | **not built** |
| N2 sinker right after a changeup | whiff −0.24 (−0.42 to −0.05), hard +0.17 (+0.00 to +0.34): right way | built (a cost) |

### What was built (both engines)
- `Situation.pa_log`: this at-bat's pitches, `(pitch, target, result, landed, contact, read)`. Landed is the app's grid cell
  with the hitter's side, `"way"` or nothing; reads are kept only at logging level 3+ (the app stores `None` below),
  contact at level 2+. The app keeps it on `g.pa.log` (undo, reload and event snapshots carry it; a new hitter or a
  pitching change clears it); the simulator keeps it; the golden inputs carry it.
- **Root only:** `solve_table` sets `pa_log = ()` in every count it solves (a test spies on 18,000 cost evaluations).
- `setup_payoff(p, q, s, arsenal)` → `(credit, rule, setup entry)`, with the five checks: landed near the target (a logged
  cell in or next to the target's area; way off fails; nothing logged: a strike passes, a ball fails); not squared up (no
  "straight back" foul, no hard contact); the payoff pitch live (trusted, not shaken off, not "not landing"); the count
  allows it (no credit at three balls; a chase payoff only where the count has a chase target); the profiles the rule
  names. The read rule for S2 / S3 / S7 as the plan writes it (a foul with no read is unknown: no fire; a whiff with no
  read passes).
- `SETUP_RULE` in `cost08` next to the coach reads, with the cap on the setup part only (setup ≤ 0.02 × run scale; coach +
  setup ≤ max(coach, 0.02)).
- **Tie-break (E5):** after the solve, a share `1 − gap / TIE_EPS` of a non-enabling call's probability moves to a
  setup-enabling call when their costs are within `INTENT_E × run scale`, at most 5 points; never at three balls (or two
  strikes, where no later payoff exists in the at-bat). **Added:** the shift is scaled back so the hitter's best response
  against the shifted mix gains no more than that same noise margin; the first version exceeded it in 4 of 123 grid cells
  (by up to 26%), and the plan says the gain should be within the solver's noise.
- **Explanations:** a "setup" term in the why-line deltas (it zeroes `SETUP_RULE`); a credited call's why line is "Set up by
  the X spot: Y spot"; its intent is "Payoff" under two strikes (Finish / Expand keep theirs at two strikes, with the setup
  in the why line). The dead look-value "Setup" label, the "Sets up" lines and `next_count_top` are gone (look value stays in
  the costs). `tests_v10_explain.py` → `tests_v11_explain.py` (moved the old one to `readthrough/history_tests_v10_explain.py`);
  `golden/explain_twin.js` updated.

### Sizes (`readthrough/setup_sizes.py` on the rule rows → `results/v11/step3_sizes.json`)
Rows (`readthrough/make_scenarios_v11.py` → `scenarios_v11.json`, its own sha256): v1.0's 71 graded rows plus one fire and
one no-fire row per built rule, **proposed**, in Drew's second-pass style (row F2): any strike and the chase acceptable,
and a fire row's floor keeps the payoff on the table. Each size is the smallest grid value that lifts the payoff 5+ points
on its fire row (N2: the sinker down 3+) with both rows passing; the floors were then set to what that size buys.

| Rule | Size (runs × run scale) | Payoff share without → with |
|---|---|---|
| S1 | 0.004 | curve / split low 37.5% → 44.2% |
| S2 | 0.004 | slider down-away / chase 0 → 14.8% |
| S3 | 0.006 | changeup away 8.2% → 13.8% |
| S4 | 0.006 | changeup away 0 → 7.7% |
| S5 | 0.004 | sinker in 0 → 8.1% |
| S6 | 0.008 | fastball strike 39.7% → 47.2% |
| S7 | 0.010 | fastball above the zone 0 → 6.4% |
| S9 | 0.002 | slider away / chase 7.7% → 16.1% |
| N2 | 0.002 (a cost) | sinker 48.6% → 45.4% |

### Proof (this session, final code)

| Check | Result |
|---|---|
| `tests_v11.py` | **36/36**. New for Step 3: 18 fire / no-fire cases (S2, S5, S7, S9, N2, the no-read cases, three balls, no chase at 2-2); the cap (with the went-back read on, a setup adds nothing; without it, the full credit); root only (every one of 18,225 table costs sees an empty `pa_log`); the tie-break (an exact tie moves 5 points, outside the margin nothing, nothing at three balls); Python = JS `setup_payoff` on the cases and 400 random at-bats. The v1.0 exactness check now also sets the setup credits and the tie-break off: still exactly v1.0 |
| `tests_v11_explain.py` | **7/7** on 60 golden cases + 6 setup cases (the full suite first caught check 6 failing: S1's case, a fastball up-away, also sets up S4, which is sized larger, so S4 took the credit. The engine is right; the case now uses a fastball up-in, commit 50be0e7): named term smallest eligible; comparator; three balls; "Set up by" exactly when a rule credits the call and "Payoff" exactly then under two strikes, no "Setup" left; eye level; each rule (S1, S2, S3, S4, S6, S7) fires on its case, names its setup, is silent without it or after hard contact; Python = JS |
| `tests.py` | **45/45**. R5 (holes) now holds the tie-break off while it measures the hitter-damage term: the tie-break fired on the thin-hole spot only and added its 5 points there |
| Read-through (`scenarios_v11.json`, 89 rows) | **87/89**: all 18 setup rows pass (proposed grades); C5 and F2 as after Step 2 |
| Tie-break report (`readthrough/tie_break_report.py`, 540 grid cells) | fires in **123 (23%)**; moves 4.2 points on average when it fires, at most 5.0; hitter's best-response gain at most **7.3e-4 runs**, at the noise margin (7.3e-4 to 1.1e-3 by level) |
| `scripts/test-app.sh` (worktree, commit 50be0e7, 48 min) | **exit 1: every gate passes except `game_mix_e2e`, 10/12.** tests.py 45, explain 7, tests_v11 36, fast_parity, golden_v11, learn 27, db 18, import 11, rails 31, schema 24, stage2 21, worlds 31, pitch_rules 41, kinds 20, rules_e2e 20, v10 step 1 / 3 / 5 e2e 6 / 7 / 10 all pass. `game_mix_e2e` (no pitch over 70% of an 82-pitch app game): tier 2 seed 7 went 71% fastball, tier 3 seed 31337 77% (Step 2: 45% and 61%). See Step 4, "Game mix" |
| Simulated games (`readthrough/setup_game_check.py`, 10 games, 1,300 pitches) | a setup credit or the tie-break changed the top call on **38 of 159** pitches after a qualifying setup = **23.9%, OUTSIDE the proposed 2–10% band**. By rule: S4 15, tie-break 9, S7 8, S3 3, S9 2, S6 1. The tie-break moved probability on 34 of the 159 |

### For Drew (Step 4)
- **The rows and the game band disagree.** Sized so each rule lifts its payoff 5+ points on its own row, the rules change the
  top call on 24% of qualifying pitches in simulated games, against the proposed 2–10%. S4 (fastball away, then a changeup
  or curve away and low) does most of it: its pattern (any fastball aimed away, the very next pitch) comes up a lot. Lower
  the sizes to the band, narrow S4, or widen the band?
- **Grades to confirm:** the 18 setup rows are my proposals (any strike and the chase acceptable; a floor on the payoff).
- **Not built, per the decision rule:** S8 and S10 (the data point the wrong way), N1 (the penalty points the wrong way).
  Each comes back if you keep it.
- **S1 and S7** are built at their smallest sizes although part of their checks point the wrong way (S1 kept by O2; S7's
  whiff and chase checks disagree).

## Step 4: read-through and test arsenals (Nov 13, overnight; Drew asleep, every grade below is proposed)

### Test arsenals (plan Step 4)
`grid_v10.py` (so `tests.py`'s grid checks too) and `simulate.py` presets now hold 10 arsenals: v1.0's AVG3, two_pitch,
four_pitch, power and finesse (its FB/sink is now SI/run), plus ride126 (ride FB + 12-6 + split, over the top),
sink_sweep (sinker + sweeper + fade CH, low three-quarter), cut4 (four-seam + hard cutter + gyro slider + curve), deadzone
(straight FB + sinker + slider) and hs_slurve (HS fastball + slurve). The simulator also has sink_sweep_cmd4 (the same
with a command-4 sinker), because S5 can't fire below command 4 and the S5 limit needs a pitcher it can fire for.

### Predictability grid, tie-break on (`readthrough/v11_grid_compare.py` → `results/v11/grid_v11_step4.json`)
Every check passes on all 10 arsenals:

| Check | Result |
|---|---|
| AVG3, every count but 3-0: top call ≤ 85%, 2+ calls survive | 0 of 99 cells fail |
| D1 3-1 band (50–80%, target 55–70%) | all 9 in band; 7 of 9 in 55–70% (D1 R1 71.2%, D1 R3 70.4%) |
| 3-1 / 2-1 / 2-0 floor (top pitch type ≥ 50%) | lowest 50% |
| First-pitch strike-target share ≥ 85% | lowest 100% |
| No chase as the top call at 3-0 / 3-1 / 2-2 | 0 cells |
| All arsenals: a call over 85% or a single call (reported) | 10 of 990 cells, e.g. HS two_pitch R1 3-1 (one call) |
| Pitch type over 85% (3-0 exempt; reported) | 22 cells |
| Trusted secondaries under 5% (reported) | 130 pitch-cells; power's changeup 54, four_pitch's changeup 19, sink_sweep's changeup 18 |

v1.0 vs v1.1 on v1.0's five arsenals (540 cells): pitch-type shares move by a median 2.7 points (95th percentile 11.0,
largest 19.4: D1 finesse R1 3-1, fastball 79% → 99%); the top call changes in 203 cells.

### S5 limits (plan: S5 credits ≤ 15% of two-strike calls on the low-slot sinker arsenal, none with command < 4)
| Staff (6 simulated games each) | S5 share of two-strike calls | With command < 4 |
|---|---|---|
| sink_sweep (sinker command 3) | 0% (S5 can't fire: the command gate) | 0 |
| sink_sweep_cmd4 | **1.2%** | **0** |
Both limits hold, and the second run shows they hold on a pitcher S5 can fire for.

### Fire and change rates per 100 pitches (`readthrough/setup_game_check.py`, now with `STAFF=`)
| Staff | Pitches | Fires per 100 (the drawn call carries the rule) | Top-call changes per 100 | Changed / qualifying |
|---|---|---|---|---|
| default | 763 | S9 1.31, S4 1.05, S3 0.26, S6 0.26 | S4 0.92, S7 0.79, tie-break 0.79 | 19 / 79 = **24.1%** |
| sink_sweep | 747 | N2 4.42, S4 1.47, S2 0.94, S6 0.27, S7 0.13 | tie-break 2.54, S4 1.20, N2 0.67, S2 0.54 | 37 / 168 = **22.0%** |
| sink_sweep_cmd4 | 796 | N2 4.27, S4 3.27, S2 0.75, S5 0.38, S6 0.25, S7 0.13 | S4 2.76, S2 1.38, tie-break 0.88, N2 0.75, S7 0.25 | 48 / 225 = **21.3%** |
All three are **outside the proposed 2–10% band**, as at Step 3. S4 is the largest rule-driven changer on every staff.

### Game mix (the one red gate)
`app/game_mix_e2e.js` (whole 82-pitch games through the app; no pitch over 70%) fails 2 of its 6 seeds since Step 3. A
single game is path-dependent (one changed call re-routes the rest), so I ran 20 seeds through the real app with the
setup sizes on and zeroed in the page (`SCAN=` / `SETUP_OFF=1`, test-only; the tie-break on in both):

| 20 app games | Mean top-pitch share | Tier 2 / tier 3 mean | Games over 70% | Over 60% |
|---|---|---|---|---|
| Setups on | 54.9% | 50.6% / **59.2%** | 2 (71%, 77%) | 5 |
| Setups off | 52.4% | 52.4% / 52.3% | 0 | 3 |

With the sizes zeroed, seed 7 replays Step 2's game exactly (45%), so the setup credits, not the tie-break, moved it.
It's not the v1.0 collapse (75–95% every game). It's a real narrowing of about 7 points at tier 3, where the coach logs
reads and more rules can fire. It points the same way as the 21–24% change rate, so the same decision fixes both. I
haven't tuned sizes or swapped seeds to get the gate green.

### Read-through (`scenarios_v11.json`, 98 rows, sha256 7900fa3c…; `results/v11/scenarios_step4.json`)
**92/98.** The 18 setup rows pass. C5 and F2 fail as after Step 2. Profile rows (P1–P8, proposed; floors and ceilings
come from the research, set before running them):

| Row | Claim (research section 1) | Value vs limit | |
|---|---|---|---|
| P1 | Sinker in to same-side hitters (1-0) | sinker in **2.6%** vs floor 25% | FAIL |
| P2 | Average sweeper rare vs opposite side (1-1) | sweeper 23.3% vs ceiling 20% | FAIL |
| P2p | …unless plus (grade 5) | sweeper 33.4% vs floor 10% | pass |
| P3 | Gyro slider for strikes (1-0) | slider in zone 8.0% vs floor 10%; chased 0% vs ceiling 5% | FAIL (floor) |
| P4 | 12-6 steals an early strike vs opposite side (0-0) | curve in zone 22.9% vs floor 10% | pass |
| P5 | Split is the two-strike pitch vs opposite side (1-2) | split down / chase 20.1% vs floor 20% | pass |
| P6 | Firm changeup not a whiff pitch (1-2) | changeup chase 0% vs ceiling 8% | pass |
| P7 | Dead-zone fastball: edges, not low (1-1) | four-seam down 14.5% vs ceiling 12% | FAIL |
| P8 | S5 not over-relied | sinker in 8.1% vs ceiling 30% | pass |

**P1 is a real gap, not a threshold call.** At every count the sinker is the top call vs same-side hitters (40–73%), and
it goes inside 0–3% of the time. The profile terms favor the inside lane (hard contact −0.49 up-in). But aimed in, the
sinker gets a called strike 8–10% of the time (away: 14–16%) and hits the batter 3.7% per pitch (away: 0.7%), so the
engine keeps it over the middle. The likely cause: the engine reads "in" as the aim point and adds the arm-side run as a
miss toward the hitter, while MLB's "sinker in" is where it crosses the plate. That's a modeling decision for you, so I
haven't changed it. Other counts (`readthrough/profile_counts.py`, all counts 0-0 to 2-2): sweeper vs opposite side 13–28%;
gyro slider never chased, 8–18% in the zone; dead-zone four-seam low 0–17%, up 0–12%.

### v1.0 rows to regrade (`readthrough/v10_rows_changed.py` → `results/v11/v10_rows_changed.json`)
Against v1.0's exact calls (the `step2_off` reset), **53 of 71** rows moved: their top call changed, 5+ points of their
call mix moved, or their verdict changed. Only C5 and F2 changed verdict. The most common move: the slider down-away top
call giving way to the fastball down-away (A3, C1, C3, C6, D7, F2, G1, G3, J2 and others), from Step 2's profile terms on
the "tight" slider. The list is ranked by how far each row moved, so you can regrade from the top and stop when the
changes get small.

### For Drew (Step 4 decisions)
1. **Setup sizes:** 21–24% change rate on three staffs (band 2–10%), and about 7 points narrower game mixes at tier 3. Lower the
   sizes to the band (fire rows' floors would come down with them), narrow S4, or widen the band?
2. **P1 sinker in:** treat "in" for a heavy-run sinker as where it crosses (aim inner-middle and let it run), lower its
   inside miss / HBP, or accept middle-heavy sinkers?
3. **Bands to confirm:** the Step 2 call-change bands (6 of 10 pass), the setup band, and the proposed grades on the 18
   setup rows and 9 profile rows.
4. **Regrade** the 53 changed v1.0 rows (ranked list above), C5 and F2 first.

## Step 5: app, portal and data (Nov 13, overnight)

### First: main had moved (merge, commit 396d966)
`main` got 42 commits while v1.1 was built: the website, the restyled portal (live on production) and the game app
in the portal's look, plus `20261114000000_game_plans.sql`, already applied on production. Doing Step 5's portal work on
v1.1-work's old `web/` would have thrown it away at merge time, so I merged `main` into v1.1-work first (pre-merge
commit f835dc5, so it can be undone). Only two files conflicted:
- `app/index.src.html`: the palette takes main's, plus the portal's sinker / cutter colours; the pitcher chip keeps
  v1.1's own sign with main's "1 pitch" wording;
- `app/roster.js`: the main-fastball mark sits next to main's tap-twice remove.

v1.1's migration was renamed so it sorts after `game_plans`. The game app plays whole games through the restyled
screens (game_mix_e2e, smoke, v11_step5_e2e).

### App
- **Profile names** in the shape list ("Rides (high ride)", "Straight (dead zone)", "Sweeper", "Firm (little speed
  off)", ...). The stored value stays the engine's tag.
- **Stuff grade hint:** "compared with other pitches of this profile: a 3 sweeper is an average sweeper", on the grade
  field, the column header and a line under each pitcher, and on the Roster screen.
- **Main fastball mark** (plan 2.1), in both pitch editors (Setup and Roster):
  - fastball-class pitches only, one per pitcher; changing the marked pitch to off-speed clears it;
  - the coach's mark wins, else his most-thrown fastball-class pitch in the learner's counts, else none (the engine takes
    the first fastball-class pitch);
  - it reaches the engine (`primaryFb`), and event snapshots carry it only when set, so unmarked snapshots don't change.
- The Roster note said "the engine models four families"; it now says six kinds.
- `app/v11_step5_e2e.js` (new, in the suite): 13 checks.

### Importer
Measured pitch types get their tag from the engine's thresholds (`tagFor`, passed in, so `import.js` stays engine-free),
measured against his most-thrown fastball-class pitch in the file. Named types keep their profile (Sweeper → sweeper,
Splitter → split). The tag shows in the preview and is applied ("Apply velo, break, spin and shape"). import_test: 3
new checks.

### Learner
The strike-rate specs now carry the pitch's type, and their caches are keyed in v1.1 terms. Before this, a record still
stored in v1.0 terms read a two-seamer as a four-seam "runs" (strike rate 0.511 instead of the sinker's 0.525). kinds_test
has 1 new check.

### Supabase (`supabase/migrations/20261115000000_v11_kinds.sql`): written and tested, **not applied anywhere remote**
1. `upload_pitches.kind` takes the six kinds. Stored rows are remapped by `pitch_type` (Two-seam and Sinker → SI,
   Cutter → FC).
2. `pc_proposals_set`: a shape proposal carries the pitch's own kind, read through the engine's migration table, and a
   v1.1 tag that kind has. A proposal can't change the kind; one without a shape is refused.
3. Pending v1.0 shape proposals are remapped through the table, or superseded when they'd change the kind or the tag
   doesn't exist for it.

The SQL copy of the migration table (`private.pc_migrate_pitch`, `pc_shape_ok`) is generated from engine.py
(`supabase/gen_v11_kinds_sql.py`). tests_v11 checks it, so the database, both engines and db.js hold one table.

`supabase/test/v11_kinds_test.js` (12 checks) seeds v1.0 data, then runs the migration. The RLS matrix test's fixtures
got real kinds (its pitches had none, so the new kind check refused their shape proposals), and its proposal uses the
v1.1 tag "runs".

**Proof:**
- CI's Postgres 17 job passed on the merge commit (all SQL tests, the new one included).
- Locally on Postgres 16 (17-only `MAINTAIN` grants stripped from a copy; the sandbox wouldn't run a downloaded
  Postgres 17), the whole SQL suite on the merged tree **exits 0**: sync 38, review 29, client review 37, sync auth 9,
  app sync e2e 37, RLS matrix **347** (main's game-plan section included), waitlist 22, v1.1 kinds **12**.

### Portal (on main's restyled portal)
- **`lib/docs.ts`:** six kinds, six signs, the engine's type table, profile names (docs.test checks them against the app),
  and `signOf` (a migrated pitch keeps its v1.0 sign).
- **`lib/uploads.ts`:**
  - six kinds;
  - the shape proposer drops its v1.0 rules for the engine's `tagFor`, passed in by the server callers through
    `lib/engine_server.ts` (server-only, so the upload form's browser bundle carries no engine);
  - proposals are `{kind, shape, ivb, hb}` in the pitch's own kind, at the team's level;
  - a record still in v1.0 terms is read through the table.
- **Bug fixed (it predates v1.1, but now matters):** saving the arsenal page (coach or player) reset every pitch's kind and
  shape to its type's default. That wiped any shape accepted from uploads whenever a grade was saved. Now the type sets
  kind and shape only when it changes. Otherwise the pitch is read in v1.1 terms the way the app reads it (`v11Pitch`),
  keeping its sign and main mark.
- **Pages:**
  - roster, pitcher and player-arsenal chips show the v1.1 kind and the kept sign;
  - the stuff hint;
  - proposals show profile names.
- **Six kinds in:** `engine.d.ts`, `pc_import.d.ts`, `demo.ts` signs, stats colours, and the marketing types (the
  marketing types change type only; their demo data is unchanged).
- **Copies:** `pc_import.js` synced; `engine_data_d3.json` regenerated.
- **Checks:** web typecheck clean; web unit tests **51/51**. `uploads_e2e` expects the engine's tag; it needs a local
  Supabase stack, so CI runs it.

### Replay and migration proof (`app/fixtures/v10_kinds_backup.json`, `app/v11_fixture_test.js`, 8 checks)
A backup made by the **real v1.0 app** (`git archive b318098`, `sim_backup.js` new `kinds` scenario):
- one pitcher with a four-seam, two-seam, sinker, cutter, 12-6 curve and splitter in v1.0's four kinds;
- 3 games, 287 pitches, every pitch type called, with kind-keyed matchup memory.

It replays exactly under v1.0 itself. Results:
- **Migration log:** all six changes, kind changes keeping sign 1 (Fastball FB/ride→FB/rides; Two-seam FB/run→SI/two-seam;
  Sinker FB/sink→SI/run; Cutter FB/cut→FC/typical; Curve CB/sharp→CB/12-6; Splitter CH/drop→CH/split). Running it again
  changes nothing.
- **Exact replay through Step 1's code** (commit 9e2f41e): confidence, landing today and pitch counts all identical.
- **Through this build:** confidence and pitch counts exact; landing-today keys and strike / pitch counts exact. Only the
  expected-strike sums move, by at most 1.08 strikes over a game (Step 1b on, sinkers and cutters have their own movement
  and location model).
- Kind-keyed matchup memory (FB, CB, CH keys) is read by a sinker or cutter through `keyKind`.
- No real roster backup from Drew yet; if one comes, it runs the same way.

### CI
- **tests_v11 has never run in CI:** it reads the v1.0 commit with `git archive`, and CI's checkout was shallow. The engine
  job now fetches full history.
- **Time limit:** the job had 30 minutes for a suite that runs about 50, so it's now 90.
- **Web jobs:** red since Step 1 (the portal was still v1.0, as the Step 1 report said). Step 5 part 2 is the fix; its CI
  run is pending at the time of writing.

### A fix CI found: an unknown stored tag (commit f034624)
CI's `gameplan_e2e` (main's portal test) stores a curveball with the shape "typical". That was never a real tag:
v1.0's app showed "" as "typical". v1.0's engine read any unknown tag exactly like "" (same calls, checked against
`git archive b318098`), but v1.1's engine rejects it, so the game app errored. The stored-record migration now maps a tag
that isn't one of its v1.1 kind's to "" (typical) and logs it; the engine's own validation stays strict. kinds_test has 2
new checks.

### Proof (this session)
| Check | Result |
|---|---|
| `scripts/test-app.sh` (worktree, commit e71c1b4, about 50 min) | **exit 1, only `game_mix_e2e`** (1 of 6 seeds, tier 3 seed 31337 at 76%: the held Step 3 setup-size issue). Everything else passes: the build and dist check, the web copies and the website demo, tests.py 45, explain 7, tests_v11 **37** (+ the SQL table check), fast_parity, golden_v11, learn 27, db 18, import **14**, rails 31, schema 24, stage2 21, worlds 31, pitch_rules 41, kinds 21 (23 after f034624), **v11_fixture_test 8**, rules_e2e 20, v10 step 1 / 3 / 5 e2e 6 / 7 / 10, **v11_step5_e2e 14** |
| `scripts/test-sql.sh`, local Postgres 16 (copy without `MAINTAIN`) | **exit 0**: RLS matrix 347, v11 kinds 12, all others |
| CI, commit 396d966 (merge) | Postgres 17 SQL **pass**; web jobs fail (the portal still v1.0 at that commit) |
| CI, commit e71c1b4 | Postgres 17 SQL **pass**; web app (typecheck, 51 unit tests, build, landing e2e) **pass**; portal e2e: `gameplan_e2e` fails on the unknown tag above (fixed in f034624) |
| CI, commit f034624 | Postgres 17 SQL **pass**; portal e2e (gameplan, uploads, offline game, portal, billing...) **pass**; web app: `site_e2e`'s scroll-driven at-bat scene failed 3 timing checks. This commit changed nothing the site uses, and the same job passed on e71c1b4. Locally on this tree, after a fresh `npm run build`, `site_e2e` passed **twice**. A CI rerun failed 2 of the same checks again. The same check also failed in CI on the portal branch (commit eb97589, run 43332302330) before any v1.1 code: **a timing flake that predates v1.1**, in main's scroll-driven WebGL scene test. Engine job: every gate passes except `game_mix_e2e` (tier 3 seed 31337, 76%), the same as the local run, with tests_v11 37 and v11_fixture_test 8 now running in CI |
| Web typecheck / unit tests (local) | clean / **51/51** |

### For Drew (Step 5)
- **Main was merged into v1.1-work** (not the other way round), to build the portal work on the live portal. `main` is
  untouched. When v1.1 ships, merging v1.1-work into main is a fast-forward of what's here.
- **The Supabase migration hasn't been applied anywhere.** It's `20261115000000_v11_kinds.sql`, after production's
  `game_plans`. Apply it with the release (plan Step 6), on the same day every iPad updates.
- **No real roster backup yet:** the replay proof uses a v1.0 backup made by the v1.0 app. If you send a real one, it
  runs the same way (`node app/v11_fixture_test.js` reads the fixture; `node app/replay_check.js <backup>` reads any).
- **Portal plan P3** ("six pitch kinds if v1.1 Step 5 has landed"): it has landed on v1.1-work, so new and restyled
  screens can use `lib/docs.ts` KINDS / SIGN / PROFILE_LABEL and `lib/engine_server.ts`.
