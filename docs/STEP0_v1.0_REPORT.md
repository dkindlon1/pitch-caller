# v1.0 Step 0 report: preflight, parity harness, realism gate and yardstick

Date: 2026-11-09. Branch `v1.0-work`, from `main` at `3b9d645` (one engine, v0.9, no flags).
Everything below was run in this session on Windows 11 / Python 3.13.14 / Node v24.18.0; results are as printed.

Two environment notes, because they explain two failures that were **not** code regressions:

- `python3` is not on PATH on this machine (only `python`). `scripts/test-app.sh` hardcodes `python3`, so it was run
  with a `python3` shim on PATH rather than by editing the script.
- `numpy` was present but `scipy` was not, so `tests.py` aborted at `import calib`. `pip install -r
  requirements-dev.txt` installed `numpy 2.5.3` and `scipy 1.18.1`. The engine itself imports neither (it is pure
  Python `math.exp`/`log`), so this changed no engine output.

## Gate result

| Check | Before Step 0 | After Step 0 |
|---|---|---|
| `python3 tests.py` | **FAIL** - `ModuleNotFoundError: scipy`; 19/19 once installed | **19/19**, and now exits non-zero on failure |
| `python3 golden/golden_v09.py` | **FAIL** - 33,834 diffs, largest 7.86e-14 | **PASS** within 1e-9 (see 1.1); superseded as the gate by v1.0 (3.5) |
| `(cd app && node ../golden/golden_v09.js)` | **PASS**, largest diff 1.71e-13 | stale by design; replaced by `golden_v10.js` (3.5) |
| `golden/golden_v10.py` / `golden_v10.js` | did not exist | **PASS** — Python 0.00e+00, JS reproduces v1.0 (3.5) |
| `scripts/test-app.sh` | **FAIL** - `app/dist` out of date | **PASS end to end, exit 0** — 224 checks + smoke (3.5) |
| `golden/fast.py 40` / `golden/fast.js 40` | did not exist | **PASS, 0 mismatches** (see 2) |
| Realism: `hs` / `college_d3` / `college_d1` | fitted to the v0.7c mix | **within 0.08 pt of real** (see 3) |
| Yardstick baseline + `step7_regret.py` self-check | did not exist | **108 games, 0 regret**, post-refit world (see 4) |
| `data/statcast/` 2024 + 2025 | present | **88 files, 340,378 pitches** (see 5) |

## 1. Two pre-existing failures that were environmental, not regressions

### 1.1 `golden/golden_v09.py check` could not pass off Linux

The check required **bit-exact** equality (`if d != 0`). Every difference it reported was about 1e-14. The diagnosis:
`golden_v09.json` was generated on Linux. CI is `ubuntu-24.04` (`.github/workflows/ci.yml`), and the v0.9 Step 0
report records that the data work was done in a cloud workspace. The engine is pure Python `math.exp`/`log`, so those
come from the platform C library; MSVC's libm and glibc differ by about 1 ULP per call, and the at-bat table solve
accumulates that to ~1e-13.

Three facts confirm float noise rather than a behaviour change:

- Python-vs-golden was 7.86e-14, but **JS-vs-Python live parity was 1.03e-14**. The two live engines agree with each
  other more closely than either agrees with the frozen file.
- `golden_v09.js` absorbs the same drift (up to 1.71e-13) through its own tolerance and passes.
- `golden_v09.json` and the current `engine.py` come from the **same commit** (`7df54e9`), so this is not a case of a
  golden left behind by a code change.

CI never ran the Python golden, only the JS one, which is why this was never hit. Per Drew's decision the check now
allows `TOL = 1e-9`, documented in the file, matching what the JS golden already does. It then passes: **500 cases,
largest difference 7.86e-14**. A real engine change moves these numbers by far more; section 3.4 shows 1e+0.

### 1.2 `app/build.py` wrote CRLF, so the `app/dist` freshness gate could not pass on Windows

`scripts/test-app.sh` rebuilds `app/dist/pitch-caller.html` and fails if it differs from the committed copy. It
reported all 9,111 lines changed. The content was **byte-identical**: the committed blob is LF, and `build.py` opened
the output in text mode, so Python translated every newline to CRLF on Windows. Stripping CR and hashing both gave
`c91ae4bd...` for each.

`app/build.py` now passes `newline="\n"`, so it writes LF on every platform. CI on Linux is unaffected (it already
wrote LF); Windows now matches. The gate passes.

## 2. Step 0b: the fast parity harness

`golden/fast.py N` and `golden/fast.js N` run `golden/cases.py`'s `compute()` (and its JS twin, modeled on
`golden/golden_v09.js`) on the first N cases of `golden_v09.json`, and diff **live Python against live JS** at 1e-9.

- Each side computes its own results and spawns the other in an `--emit` mode, so there is no stale intermediate file
  and either entry point is a complete gate. Both print the same diff and exit non-zero on any mismatch.
- Because it compares the two **current** engines rather than a frozen file, it is immune to the libm drift in 1.1.
  This is the parity gate that works on any platform, and it stays valid after the engine changes.
- v0.9's `matchup` input is applied only when non-empty, exactly as `golden_v09.py` applies it, so item 6 is covered.

Proof at N=40 (both directions, 20 of the 40 cases with full table solves, **18,174 values compared**):

```
40 cases (20 with full solves), 18174 values compared, tolerance 1e-09
  python 10.91s   js 1.23s
Largest Python-vs-JS differences:
  table 2.84e-14   call 1.34e-14   why 4.44e-16   ump 4.44e-16
  probs 2.22e-16   grade 1.11e-16  take 5.55e-17
PASS: 0 mismatches
```

`node golden/fast.js 40` reports the identical numbers (js 1.12s / python 11.08s).

The harness was proved to bite rather than assumed to: tightening the tolerance to 0 made both sides report
**1409 mismatches and exit 1**. The default tolerance was then restored.

## 3. Step 0c: the realism gate on the live engine

`calib.evaluate` (`calib.py:69`) played its plate appearances with `call_mixed`, the v0.7c call, so every level's
`OUTCOME_ADJ` was fitted to a mix the shipped engine does not throw. It now calls **`call_v08`**, the shipped path,
with the same `random.Random(0)` seeding.

One fidelity improvement went in with it: the PA table is solved **once per (level, pitcher, side) at 0-0 and reused
for every count**, which is exactly what the app and the simulator do inside a plate appearance (`simulate.py` passes
`tab=tab`). Solving a fresh table per count would have been both unfaithful and 12x more expensive; as written the
port made `evaluate` about 4x faster (15s to 4s per level).

### 3.1 The port's effect before refitting

Walk rates fell 1.6-2.2 points at every amateur level: the real call path works the zone differently from v0.7c's.
`tests.py` went to **17/19**, failing exactly the two realism checks. Expected consequence, not a bug.

### 3.2 The recalibration

`fit_all.py` was run for `college_d1`, `college_d3`, `hs` (105s, converged, max weighted relative error 0.005).

It rewrites `outcome_params.py`, so the previous file was saved first as `docs/outcome_params_v09_prerecalib.py.txt`.
That backup is not optional: `fit_mlb.json` holds **only** the mlb fit, and `fit_all.py` calls `save()` at import
time, so it writes an `outcome_params.py` containing just mlb before refilling the amateur levels one pass at a time.
An interrupted run would have lost all three amateur fits.

Only the four pitcher-side keys `fit_all.py` fits moved. `cmd`, `cs`, `osw` and `zsw` are copied from the mlb fit and
are unchanged, and **no hitter-model key was touched**:

| key | v0.9 | v1.0 | change |
|---|---|---|---|
| `hs.hbp` | 0.1430 | 0.1318 | -0.0112 |
| `hs.wild` | 0.2216 | 0.2679 | +0.0463 |
| `hs.wz` / `hs.wo` | -0.3846 / 0.0582 | -0.3140 / 0.1288 | +0.0706 |
| `college_d3.hbp` | 0.1703 | 0.1402 | **-0.0301** |
| `college_d3.wild` | 0.1838 | 0.2259 | +0.0421 |
| `college_d3.wz` / `.wo` | -0.9344 / -0.4916 | -0.8645 / -0.4217 | +0.0699 |
| `college_d1.hbp` | 0.1352 | 0.1141 | -0.0211 |
| `college_d1.wild` | 0.1549 | 0.1993 | +0.0444 |
| `college_d1.wz` / `.wo` | -0.5141 / -0.0713 | -0.4267 / 0.0162 | +0.0874 |

The HBP level scale **fell at every level** (college_d3 by 18%) while wildness rose. That is the direction root cause
R3 in `docs/PLAN_v1.0.md` predicted: the old scale was fitted with a call mix that almost never went inside, so the
few inside pitches had to carry every hit batsman. Feeding the fit the real mix prices inside pitches lower. R3's
remaining claim, that the scale is still about double the real risk, is a Phase 4 question and is not settled here.

### 3.3 The per-level K/BB/HBP baseline (Steps 3 and 5 gate on these)

Percent per plate appearance from `calib.evaluate`. "Real" is `college_run_values.json`.

| Level | Metric | Real | v0.9 as shipped (`call_mixed`) | v0.9 call path, before refit | **v1.0 Step 0c (final)** |
|---|---|---|---|---|---|
| `hs` | K | 21.01 | 21.38 | 20.99 | **21.05** |
| `hs` | BB | 14.06 | 13.64 | 11.88 | **14.05** |
| `hs` | HBP | 4.11 | 4.53 | 4.06 | **4.10** |
| `college_d3` | K | 16.21 | 16.67 | 16.13 | **16.28** |
| `college_d3` | BB | 11.38 | 11.18 | 9.75 | **11.38** |
| `college_d3` | HBP | 4.22 | 4.88 | 4.49 | **4.22** |
| `college_d1` | K | 19.30 | 19.75 | 19.04 | **19.35** |
| `college_d1` | BB | 10.79 | 10.52 | 9.25 | **10.78** |
| `college_d1` | HBP | 3.36 | 3.82 | 3.52 | **3.36** |
| `mlb` (not refit) | K | 20.00 | 19.99 | 19.12 | **19.12** |
| `mlb` (not refit) | BB | 7.90 | 7.79 | 7.06 | **7.06** |
| `mlb` (not refit) | HBP | 0.90 | 0.91 | 0.90 | **0.90** |

Every amateur level is now within **0.08 points** of real, and `tests.py` is back to **19/19**, so the realism checks
pass on the ported path.

**One flag on mlb.** `fit_all.py` does not refit mlb; it loads the stored fit from `fit_mlb.json` (refitting needs
`--mlb`). On the ported call path mlb drifted to K 19.12 vs 20.00 and BB 7.06 vs 7.90. Both are still inside the
check's 1-point tolerance, so it passes, but it now sits near the edge where it used to be nearly exact. Worth
refitting deliberately rather than discovering it later.

### 3.4 What the recalibration made stale

`outcome_params.py` feeds `engine.py` (lines 28 and 198), so every engine output moved. Reported, not re-frozen, per
Drew's decision:

| Reference | State |
|---|---|
| `app/engine_data.json`, `web/lib/engine_data.json` | **regenerated** (`app/export_data.py`) and synced byte-identical, so Python/JS parity still holds (`golden/fast.py 40`: 0 mismatches) |
| `app/dist/pitch-caller.html` | **rebuilt**; one line changed, the embedded data |
| `golden/golden_v09.json`, Python check | **stale**: 155,257 differences, largest 1.00e+0 |
| `golden/golden_v09.json`, JS check | **stale**: 174,871 differences, largest 5.05e-1 (`h0`). Example: a fastball up-in ball probability moved 32.76% to 35.89%, consistent with the higher fitted wildness |
| `readthrough/scenarios_v09.json` + `.sha256` | **file untouched**, sha still `5b5b4b80...`. The grade moved **30/64 to 29/64**, measured against the frozen engine in the `../pitch-caller-v09` worktree for a true before/after |
| `golden/labels_parity.json` | referenced by no script; dead file |

### 3.5 A new v1.0 golden, replacing v0.9 as the gate

Per Drew's decision the v0.9 golden stays frozen as history and a **v1.0 golden was frozen alongside it**:

- `golden/golden_v10.py` (make / check) imports `inputs()` and `compute()` from `golden_v09.py` instead of copying
  them, so the two goldens are provably the **same 500 cases** and the only difference is which engine produced the
  stored numbers. Verified: inputs compare equal, outputs do not.
- `golden/golden_v10.js` is `golden_v09.js` with the path and two messages changed; the diff is 5 lines.
- `scripts/test-app.sh` now gates on `golden_v10`. `golden_v09.*` stays in the tree, simply no longer run by CI.

Both checks pass: JS `PASS: JS engine reproduces v1.0`; Python `500 cases, largest difference 0.00e+00`. That zero is
itself a confirmation of 1.1 — generated and checked on the same machine it is bit-exact, where the cross-platform
v0.9 file drifts 7.86e-14.

**`scripts/test-app.sh` now passes end to end (exit 0)**, which matters more than the golden itself: the eight checks
sequenced after it had not been running at all. They all pass — `learn_test` 27, `db_test` 18, `import_test` 11,
`rails_test` 31, `schema_test` 24, `stage2_test` 21, `worlds_test` 31, `pitch_rules_test` 41, the browser smoke test,
and `rules_e2e` 20, plus `tests.py` 19/19 and parity. 224 checks and the smoke test.

## 4. Step 0d: the yardstick

`simulate.py` takes **`CALL_ENGINE=<path to an engine.py>`**. That engine makes the calls; this tree stays the world.

- The caller supplies the table, the policy, the call and its explanation: `solve_table`, `needs_resolve`,
  `frozen_inputs`, `lean_b_h`, `call_v08`, `candidates`, `root_costs` for its own best-guess estimate, `why_line`,
  `intent_label`, `win_constants`, `ump_estimate`, `take_stats`, `look_update`.
- The **world and the judge stay this tree's**: `outcome_probs`, the hitters, the in-play draw, and critically the
  `regret_*` columns, which score every call against a table solved on the hidden truth. Two callers are therefore
  measured by one ruler, which is the whole point of a yardstick.
- The frozen engine is loaded with its **own** sibling data modules (`run_tables`, `outcome_params`, `spread_params`,
  `inplay_typed_params`, `hitter_spread_params`), and the loader fails loudly if any of them resolved to this tree.
- Constraint worth knowing: the frozen caller is handed this tree's `Situation` and `Pitch` objects, so it must still
  read the fields it knows about. That holds today and should be re-checked when v1.0 adds `Situation` fields.

Isolation was verified **after** the recalibration, which is the first moment the two trees' parameters differ:

```
level/key             world (v1.0)  caller (v0.9)  isolated?
hs.hbp                      0.1318         0.1430  yes
college_d3.hbp              0.1402         0.1703  yes
college_d1.wild             0.1993         0.1549  yes
   ... 12 of 12 keys isolated
VERDICT: frozen caller reads its own v0.9 parameters
```

### 4.1 The baseline and the pipeline proof

`readthrough/run_games.py` gained `--dest` for the `runs/` subfolder. Run as:

```
CALL_ENGINE=../pitch-caller-v09/engine.py TRUTH_TAB=world python3 readthrough/run_games.py \
    --seeds 101-112 --jobs 10 --dest yardstick
```

**108 games, 0 failures, 17,750 pitch rows** in `runs/yardstick/v09/`, 36 per level. `TRUTH_TAB=world` was used so the
`regret_w_*` columns exist, which is what makes two engines comparable on a single table.

On the count: the grid is 3 levels x 3 staffs x N seeds, so it only yields multiples of 9 and 110 is unreachable.
Drew chose 108 (seeds 101-112).

`readthrough/step7_regret.py runs/yardstick/v09 runs/yardstick/v09` reports **every difference as +0.000 with SE
0.000**, across all 108 games and within each level, proving the pipeline end to end:

```
v09 vs v09: 108 paired games; runs per game, B minus A, SE over games
[all] 108 games             v09       v09      diff      SE
  runs                    7.259     7.259   +0.000   0.000
  pitches               166.130   166.130   +0.000   0.000
  regret_w_exp            1.369     1.369   +0.000   0.000
  regret_w_pick           1.379     1.379   +0.000   0.000
  regret_w_info           0.463     0.463   +0.000   0.000
```

Per level: hs 9.083 runs per game and `regret_w_pick` 1.602, college_d3 7.278 / 1.432, college_d1 5.417 / 1.103.

### 4.2 The baseline was regenerated after the recalibration

The grid was first run *before* the refit and then re-run after it, which incidentally measures how far the
recalibration moved the world. The pre-refit games are kept in `runs/yardstick/v09_prefit_world/` rather than deleted:

| | pre-refit world | post-refit world (current baseline) |
|---|---|---|
| runs per game | 7.037 | **7.259** |
| pitches per game | 164.352 | **166.130** |
| `regret_w_pick` | 1.414 | **1.379** |
| `regret_w_exp` | 1.403 | **1.369** |
| pitch rows | 17,750 | **17,942** |

Higher fitted wildness shows up as about a fifth of a run more per game and two more pitches per game, while decision
quality improves slightly (regret is a cost, so 1.379 is better than 1.414).

Note the grid was run in one consistent world both times. Generating part of it pre-refit and part post-refit would
have produced a silently mixed baseline, which is worse than an openly stale one, so the first run was finished before
`fit_all.py` was started. **This baseline will go stale again** whenever Phases 3-5 change the engine; regenerate it
immediately before each v1.0-vs-v0.9 comparison (about 25 minutes at `--jobs 10`). The 0-regret self-check proves the
plumbing, which does not depend on the world.

## 5. Step 0e: Statcast data

`python3 fetch_statcast.py` completed in 67s. `data/statcast/` holds **88 CSVs, 340,378 pitches**: 2024 is 44 files /
173,856 pitches, 2025 is 44 files / 166,522 pitches. 233 MB, gitignored.

Two files are 1,825 bytes, header only, and the script re-fetches them on every run: `sc_2024-07-18.csv` and
`sc_2025-07-14.csv`. Those are **All-Star break dates with no regular-season games**, so Savant correctly returns zero
rows. The script's "is it larger than 100 KB" test cannot tell "no games" from "download failed", so it retries three
times and prints the size. Harmless; not worth a code change unless the noise is annoying.

## 6. Decisions Drew made during Step 0, and what is left

Settled in this session:

1. **A new v1.0 golden was frozen** (3.5), leaving `golden_v09.*` as history. `scripts/test-app.sh` gates on it and
   now passes end to end, which restored eight checks that had silently stopped running.
2. **The yardstick baseline was regenerated** in the post-recalibration world (4.2); the pre-refit games are kept in
   `runs/yardstick/v09_prefit_world/`.
3. **`tests.py` now exits non-zero when a check fails.** It previously returned 0 even at 17/19, so the pass/fail
   signal existed only in text that `scripts/run-check.sh` parses, and any direct caller read success while checks
   failed. CI is unaffected because `run-check.sh` still parses the same line.
4. **mlb was deliberately left unrefit** (3.3). Two consequences to keep in mind: mlb sits at K 19.12 vs 20.00 instead
   of near-exact, and because `fit_all.py` copies mlb's `cmd`, `zsw`, `osw` and `cs` into every amateur level,
   hs/college_d3/college_d1 still inherit four shifts fitted to the old v0.7c mix. The three amateur levels reproduce
   their real K/BB/HBP regardless, since the four refitted keys absorb it. Revisit with the Phase 4 pitcher-side fits
   if those inherited shifts start to bind.

Still open:

5. **The v0.9 scenario grade moved 30/64 to 29/64** (3.4). The scenario file itself is untouched and its sha still
   matches, so nothing is broken; Phase 1.2 builds `scenarios_v10` anyway. Worth a look only if that one row matters.
6. **Regenerate the yardstick baseline again** whenever Phases 3-5 change the engine (4.2).
7. **`docs/PLAN_v1.0_2026-11-09.md` does not exist.** The plan is `docs/PLAN_v1.0.md`, which lived in commit `d0c7d62`
   on **no branch**, reachable only through the reflog and one `git gc` from being lost. It has been restored onto
   `v1.0-work`. Its rules 4 and 5 forbid running `fit_all.py` and overwriting `outcome_params.py`; Drew overrode both
   for Step 0c, with the backup in 3.2 as the safety net.
