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
- That's the rule as set, so I left it alone and left that game out of the regression test. The open question: should a
  not-landing pitch get "comeback" calls sooner (for example, the hold lifts after a run of pitches without it, or a
  small guaranteed share in up counts)?

### Proof (this session, final code)

| Check | Result |
|---|---|
| `app/game_mix_e2e.js` (new) | **10/10**: five whole games, top pitch 48 / 49 / 52 / 49 / 55%. The same games on the unfixed build: 93 / 84 / 85 / 94 / 87%, all FAIL |
| `tests_v11.py` | **23/23** (adds: the fade's size at 10, 17, 25, 34 of 50 and 33 of 39 sliders, identical in both engines) |
| `tests.py` | **45/45** |
| Read-through | **71/71**; the 15 rows with a landing record give the same shares as before the fix |
| `golden_v11a` | re-frozen with the fix; Python check 500 cases, largest difference **0.00e+00**; JS reproduces it; `fast.py 40` 0 mismatches |
| `scripts/test-app.sh` | **exit 0**, no errors: 354 counted checks + smoke, browser tests, website demo, built-app and `web/lib` copy checks |

**The live app (`main`, v1.0) still has this bug.** The fix is two small functions plus one changed line in each engine,
and it could ship to `main` as v1.0.1 on its own, ahead of v1.1, if Drew wants it there.
