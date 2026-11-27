# PitchIQ V1.3: data integrity and validation audit

Auditor: data integrity and validation engineer. Tree: `/home/claude/pitch-caller` at c602f1c (read only). Probes and
outputs are in `/home/claude/audit/data_probe/`. The raw archives aren't on this box, so nothing below re-parses real games.

## 1. Verdict
**B−.** The shipped artifacts are clean and reproducible:
- the sha256 values match;
- `app/engine_data.json` regenerates byte for byte;
- no table has a NaN, an inf, a negative probability or a missing count;
- the code-level 2026 guards are sound.

The grade comes down for three reasons:
- **Dedupe misses duplicates.** The text comparison counts the same game as two games when the two copies use
  different formats or name styles. It judged 24,384 pairs to be separate games, and nobody checked them.
- **D2 still runs on D3's numbers in 13 engine tables.** The release guard fails, but the build log calls those tests
  "obsolete".
- **Reconstruction quality never gates the college fits.** The parser's outs, bases and score errors are computed and
  reported, then ignored.

## 2. Findings

| ID | Sev | Title | Evidence | Impact | Proposed fix | Class |
|---|---|---|---|---|---|---|
| D1 | MAJOR | **Dedupe counts one game twice when its two published copies differ in format or name style** | `hitter_data/ingest.py:237-253`: `difflib.SequenceMatcher` over lists of whole normalised lines, and `ratio < 0.5` means separate games (`continue`). `data_probe/dedupe_probe.py` takes one 4-PA game and writes it (a) Sidearm per play vs StatCrew paragraph and (b) `A. Able` vs `Able, A.`. Output both times: `1 pairs judged separate games` and `[('sidearm_copy', None, 1), ('presto_copy', None, 1)]`, so both copies stay canonical. Final archive: **24,384** same-date, same-teams, same-score pairs judged separate (BUILD_v13_fulldata_REPORT.md:573), never validated. Same-score doubleheaders can't plausibly explain that many; my rough ceiling is about 6k pairs. Also: undated games (2,025) are never deduped (`dedupe` keys on `date_iso<>''`, ingest.py:211), and the docstring (ingest.py:9) says disagreeing copies are "both kept", while the code keeps one (`canonical=int(k==0)`, :266). | Duplicate full games count double in every college fit (count layer, run values) and inflate N. The game-clustered SE is understated. Step 6's SE takes the max with the team-clustered SEs, which absorb same-team copies, so the verdicts (z −11 to −44) are not at risk. The fitted numbers are slightly over-weighted toward games published by two schools. | Compare parsed content, not raw text: per-PA (result, balls, strikes, inning, half) sequences from `pa`. If ≥ 80% align, call it a duplicate. Re-run dedupe on the frozen archive and report how many of the 24,384 pairs flip. Any refit is the owner's call. | NEEDS-DATA (count); the fix CHANGES-CALLS if refit |
| D2 | MAJOR | **D2 ships on D3's numbers in 13 tables, and the release guard fails** | `nice python3 release_guard_d2.py` exits 1 with `FAIL: college D2 still runs on D3's numbers (17 places)`. `engine.D2_PLACEHOLDERS = ['LEVEL','PROFILES','MOVE_RATIO','A_BAR','I_BAR_UMP','SIM.A_BAR','SIM.I_BAR_UMP','SIM.I0_GRADE','OUT_TABLE','RUNNER_FIT','RUN_GAME','HITTER_SPREAD','WE']`. `engine.OUT_TABLE['college_d2'] is engine.OUT_TABLE['college_d3']` gives True; `count_v13core.json` has no D2 `out_table`/`runner`. The guard's docstring says "The release checklist runs it". The build log calls tests_v13_d2 / d2_e2e "obsolete: D2 has its own count layer and run values" (BUILD:499, :907). That covers 2 of the D2 tables, not the 13 above. The level picker still says "Uses the D3 numbers until there's D2 data" (`app/index.src.html:1573`). | The D2 count layer and run values are fitted. D2's in-play outcomes (out_table), DP/runner rules, steal model, win tables (WE), hitter spread, cutoff and fatigue (LEVEL) are D3's. Step 6's D2 pass scored only the pitch_5way count layer, so it says nothing about these. The deploy checklist gate fails. | Owner ruling: either accept D2 = D3 for these 13 and record it (then update the guard and the UI copy), or fit them. Don't call the guard obsolete without one. | NEEDS-OWNER-RULING |
| D3 | MAJOR | **College game QC never gates fits: parser state errors flow silently into base-out state, runs and slot** | Fits select games only by `canonical=1` and the letters rule `is_full` (`harness.py:79-93`, `fit_traits_data.py:47`). `game_qc.halves_bad`, `final_match`, `unparsed_lines` and the PA `flags` (`outs_differ_from_stated`, `runner_not_on_base`, `base_collision`) are written (`update.py:128-172`) and read only by reports. A grep of every `hitter_data/*.py` finds no fit that filters on them. Synthetic proof (`data_probe/parse_probe.py`): `"B. Baker hit into a fielder's choice (1-0 B); A. Able out at second ss to 2b."` is **unparsed**: no `PA_VERBS` entry for "hit into a fielder's choice" (parse.py:19-45). The PA vanishes, and the out isn't recorded. The next PAs are charged 0 outs instead of 1 and 1 instead of 2, the half ends with `outs_final [2]`, and every later batter's `slot` shifts by one (`slot = pa_count % 9 + 1`, parse.py:562). Nothing is flagged on those PAs. HS is partly protected: `full_log` needs the pitch count within 2 of the box total (`hs_quality.py:79-82`). | Some fraction of college PAs carry the wrong outs, bases or slot. That reaches the swing_base_out cells, runs-rest-of-inning (RE/CV in `run_v13core`) and the slot nuisance in the situation fit. The harness drops only halves ending short of 3 outs and outs outside 0-2, not over-counted outs or misplaced runners. Size unknown: lines parsed 99.78% (BUILD:574). The 3-out share for the final college archive isn't reported. | (a) Add `halves_bad == 0 AND final_match IS NOT 0` (or ≤ 1 bad half) to `games_for`, and report how many full games drop. (b) Add the FC variants ("hit into a fielder's choice", "grounded into a fielder's choice", "hit into fielders choice"). (c) Check `unparsed_top20.csv` on the desktop for other PA verbs. | NEEDS-DATA; CHANGES-CALLS if refit |
| D4 | MINOR | Step 6's "scored once" lock depends on the data path | `final_test.py:41-42`: `MARKER = os.path.join(DATA, "final_test", "RAN.json")`, and `DATA` comes from `PITCHIQ_DATA` (default `C:/dev/pitchiq-data`, `hitter_data/__init__.py:5`). Step 6 ran under `C:/dev/pitchiq-data-final` (BUILD Step 6). With the default path, or on another machine, the marker is absent, so `--drew-go` would score 2026 again. The committed copy `results/v13step6/RAN.json` is never checked. | A careless second run of the held-out test (process integrity). | In `main()`, also refuse if `ROOT/results/v13step6/RAN.json` exists. This doesn't change calls. | SAFE-NOW |
| D5 | MINOR | Step 6's frozen-file list doesn't match what the engine reads | `final_test.py:44-45` hashes `fit_mlb.json` and `inplay_typed_params.py`, which engine.py never loads. It omits `data_tables/mp_v13.json` (`TABLE_DEFAULT` mp, engine.py:35), `spread_params.py` (:705), `sim_constants.json` (:2378) and `fit_v08.json` (:2397). **Mitigated:** `gh api .../compare/af7b441...c602f1c` lists only docs/ and results/v13step6/ files, so every engine input at tip equals what was scored. | A later edit to mp_v13 or spread_params would pass the "frozen" check unnoticed. | Make the deploy gate `git diff af7b441 -- engine.py data_tables/ outcome_params.py spread_params.py hitter_spread_params.py sim_constants.json fit_v08.json we_tables.json we_rates.json app/engine_data.json` empty, and add the missing files to `FROZEN`. | SAFE-NOW |
| D6 | MINOR | Python and JS diverge on malformed inputs; non-integer counts crash with unclear errors | Probe of 43 cases (§3): 39 agree. Divergences: NaN velocity: Python `TypeError` (engine.py:2620 via `Pitch.mph`: `if self.velo:` treats NaN as set, :771), JS treats NaN as unset (`p.velo \|\| ...`, engine.js:189) and calls. NaN inning with `home` set: Python calls, JS `Cannot read properties of undefined (reading 'L')` (engine.js:1812). `level:"college"`: Python accepts (alias), JS rejects. `balls:1.5` crashes both (Py `KeyError: (1.5, 1)`, JS `reading 'heart'`); `balls:"2"` crashes both. `check_inputs` (engine.py:2460) doesn't validate integer counts, grade/command range (grade 0 or 9 accepted), velocity range (−5 or 200 accepted) or conf NaN (the pitch drops out silently in both). | Low in the shipped app: it sanitises (`velo: +d.velo \|\| 0`, index.src.html:217) and never sends "college". It matters for sims, the portal and imports. | Add integer and range checks for balls/strikes/outs/inning, finite velo/conf, and grade/command 1-5 to both `check_inputs` and `checkInputs`. Rejecting garbage doesn't change any valid call. | SAFE-NOW |
| D7 | MINOR | When every pitch is shaken off, the fallback can re-call the pitch *just* shaken, and twice-shaken pitches return without a flag | `exclude=["Fastball","Slider"]` (D1, 1-1) returns the unshaken mix (Slider 50%). `["Fastball","Slider","Fastball","Slider"]` returns the same. A one-pitch arsenal shaken twice still calls Fastball. Python = JS. Code: engine.py:3108-3115 ("Only if every pitch is shaken twice are the shake-offs set aside"). | Conflicts at the edge with the hard rules "never re-call a pitch just shaken off" and "a second shake = out until next batter". Most likely with a 2-pitch HS arm. | Owner ruling: in the fallback, at least drop the most recent shake, and return a flag so the UI can say "everything's been shaken: your call". | NEEDS-OWNER-RULING |
| D8 | MINOR | `app/export_data.py --check` reports a false failure on identical data | `python3 app/export_data.py --check` gives `3 differences ... (0.45, 0.45, 0.1) vs [0.45, 0.45, 0.1]`, exit 1. A fresh `--out` is **byte-identical** (`cmp` OK, sha `bafd2003…`). Tuple vs list in `diff()` (export_data.py:51-59). | A real check can't be gated on this tool. | Round-trip `data` through `json.loads(json.dumps(data))` before `diff`. | SAFE-NOW |
| D9 | MINOR | Leakage at the decision level only: `kgap_predict.load_hs` reads every HS season, including 2026 | `hitter_data/kgap_predict.py:46-50`: the SQL has no season filter and no `assert_not_heldout`. HS 2026 is in hs.sqlite3 (3,774 games scored at Step 6). Report-only (DECISIONS:249). Its "no within-pitcher adaptation" result informed the K-gap decision; no fitted number comes from it. Same for `crosscheck.py:72` (report). | A 2026 look influenced one modelling choice. Fitted tables are unaffected. | Add `WHERE g.season < 2026` with the guard. Note it in the decisions log. | SAFE-NOW |
| D10 | MINOR | The freeze lock can be bypassed for HS | `update.py:251-253` honours `LOCK.json`. `python -m hitter_data.hs_ingest` (:276) and `hs_snapshot` (:107) don't check it. | HS games can change under a "frozen" manifest. `freeze --check` would catch it afterwards. | Check `LOCK` in `hs_ingest.main` and `hs_snapshot`. | SAFE-NOW |
| D11 | MINOR | The level picker's data provenance is out of date | `app/index.src.html:1572-1574`: HS "MaxPreps 2026 national averages", D3 "2026 Liberty League…", D1 "2026 Big East…", D2 "Uses the D3 numbers". V1.3 is fit on college seasons ≤ 2025 (238k games) and HS 2022-2025. | The coach-facing claim no longer describes the model. | Rewrite after the D2 ruling. | SAFE-NOW (copy) |
| D12 | MINOR | Mid-PA steals and pickoffs: every pitch in the PA carries the PA-start base-out state | `harness.py:244-289`: `o`/`bi` come from `outs_before`/`bases_before` for every pitch; `run_ok` excludes them only from run values. | Small mislabelling in the base-out swing cells. | Split the PA at mid-PA events (the parser already counts them in `mid_pa_events`). | CHANGES-CALLS if refit |

**Correction to the lead's known item:** at c602f1c, `web/lib/engine_data.json` is **byte-identical** to
`app/engine_data.json` (`git show HEAD:web/lib/engine_data.json | cmp - app/engine_data.json` passes; version
`c756860d96`, `TABLES` has versions/zone/mp/count). Only `web/lib/engine_data_d3.json` is stale (version `051dcfaf48`, no
`TABLES.mp`, and RE/CV/OUTCOME_ADJ/V08/TABLES differ). That fits the crash on `MP[level]` being undefined. The working
tree already has the regenerated d3 file; it differs from app only in `WE`, cut to college_d3 by
`web/scripts/trim-engine-data.cjs`.

## 3. What I ran and the results

**Unit tests that don't need the archive** (each completes in seconds; none needs data):
- `python3 tests_hitter_data.py`: exit 0, **131 ok / 0 FAIL**.
- `python3 tests_hs_data.py`: exit 0, **48 ok / 0 FAIL**.
- `python3 tests_zone_seed.py`: exit 0, **27 ok / 0 FAIL**. This includes the held-out guard tripping on
  `aggregate_frame(2026)`, `load_season('A', 2026)` and `level_plan([...2026])`.

**sha256 on the Part 12 readiness page (BUILD:1813-1827)** against the files at tip, via `sha256sum`: **all 11 match**
(engine.py `adaa6290…`, outcome_params `087b62b0…`, fit_mlb `1d53d09b…`, hitter_spread_params `d256f539…`,
inplay_typed_params `09267def…`, zone_v13 `4c9f98ef…`, count_v13core `966a35b8…`, run_v13core `23857e0e…`, mp_v13
`2f0713bb…`, app/engine_data `bafd2003…`, golden_v13core `99c37b63…`). The tip is one commit after the scored commit
af7b441, and the GitHub compare shows only docs and results files changed between them.

**Is `app/engine_data.json` exactly what the Python tables produce?** The exporter is `app/export_data.py`.
`python3 app/export_data.py --out /tmp/.../engine_data_regen.json` then `cmp` gives **BYTE-IDENTICAL**, same sha. The app
bundle `app/dist/pitch-caller.html` embeds data version `c756860d96` and `app/engine.js` verbatim. `web/lib/engine.js`
is identical to `app/engine.js` (`cmp`).

**Table validator** (`data_probe/validate_tables.py`) over `data_tables/*.json`, the three engine_data files and
`fit_mlb.json`, plus the three param modules. Results:
- No NaN or Infinity tokens; no non-finite floats in 699 param floats or in any table.
- Every count table has all 12 counts and 24 base-out cells at all 5 levels.
- Every `out_table` / `OUT_TABLE` row is in [0,1] and sums to 1 (within 1e-6). The 223,200 WE values are all in [0,1].
- In every run table, RE strictly decreases with outs, CV(0-0) = 0, and CV is monotone in balls and in strikes.
- mp shifts: none over 1 logit.
- `inplay_typed_params.OUT_TABLE` equals `count_v13core` out_table exactly (max diff 0.0); runner p_GB, p_FB and S_DP
  are equal.
- Only flags: `S_DP > 1` in some files. That's a capped multiplier (engine.py:2270 `min(0.95, …)`), not a probability.
- D2 has no `out_table` (D2, above). `run_v12` / `run_v13refit` have no D2, but they aren't shipped.
- Level coverage: mlb, d1, d2, d3, hs everywhere. Travel is an alias of hs in both engines; `college` is an alias of
  d1 (Python only, see D6). HITTER_SPREAD and WE have no D2 (placeholder).

**`python3 release_guard_d2.py`**: exit 1 with 17 places (D2).

**Runtime edge probe**, 43 cases, the same input fed to `engine.call_v08` (Python) and `callV08` (node, `app/engine.js`
plus `app/engine_data.json`), rng 0.5, table at 0-0. Files: `data_probe/probe.py`, `probe.js`, `cases.json`,
`py_out.json`, `js_out.json`. **39 agree to 1e-6 on pick, size and top 4; 4 diverge (D6).**
- **Graceful, both engines:**
  - one-pitch arsenal (5-way mix);
  - one pitch, or all pitches, at low confidence: a single call at 100%;
  - grades `None` / `{}` / partial;
  - unknown hitter (no tags or grades);
  - travel; D2; MLB; level missing (defaults to college_d3);
  - inning 15 at HS; margin −40;
  - D2 bases loaded 3-2 9th, home: a mix with no NaN;
  - six-pitch HS 3-2;
  - shake-off of an unknown name;
  - shake-offs: see D7.
- **Clean rejection, both engines:** empty arsenal, unknown kind, duplicate names, balls 4, strikes 3, outs 3, outs −1,
  2-element bases, bad hitter tag, level "D1" or "".
- **Crash with an unclear error, both engines:** non-integer or string counts.
- **Silent acceptance:** grade 0 or 9, velocity −5 or 200, conf NaN (that pitch drops out).
- Every successful call had a finite distribution summing to 1.0.
- An extra check: Python's default `call_v08` path (table solved at the live count) vs the JS path (table at 0-0, no
  last pitch) gave a max probability difference of **0.0**.

**Parser edge probe** (`data_probe/parse_probe.py`, pure parse functions):
- "struck out swinging, reached first on a wild pitch": `K_S_reached`, 4 pitch events.
- Catcher's interference: `CI`, excluded from pitch events. The runner is forced correctly.
- Pinch hitter: a `sub` line, and the slot carries over.
- "sacrificed …, bunt": `SAC`, bunt (the harness drops all of that PA's pitches).
- GDP: 2 outs.
- Extra-inning runner "placed on second": on base before the first pitch.
- Unknown letters `N` and `T`: the whole PA is dropped (`odd_letter`).
- A PA with no count: dropped from pitch events (`no_letters`).
- "Game suspended.": unparsed. The half is left short and excluded from runs rows.
- "hit into a fielder's choice": unparsed, and the state is corrupted (D3).

**Pipeline code read** (parse.py, hs_parse.py, ingest.py, hs_ingest.py, quality.py, hs_quality.py, freeze.py, pulls.py,
represent.py, harness_truth.py, harness.py, final_test.py, update.py). Bad rows are mostly **dropped**, not imputed:
- excluded results: IBB, CI, BINT;
- bunt-ending PAs;
- odd letters, a count replay mismatch, or no letters;
- outs outside 0-2;
- truncated halves, dropped from runs rows only.

Two things are imputed, with flags: DP outs that aren't written (`dp_outs_inferred`), and forced runners
(`forced_implicit`). Ball-in-play type is imputed within each result (`bip_count`). Silent miscounting is limited to
the unparsed-line and state cases in D3.

7-inning games: `scheduled_innings` takes max inning 7, or 8 with margin < 10, as 7. A 9-inning game called after 7
for weather lands in the 7-inning bucket, which only affects the late-and-close flag. HS season = calendar year of
`game_date`. College season = date year, else a strict URL rule; undated games with no URL season get NULL and are
excluded.

**Leakage and freeze, code level:**
- `assert_not_heldout` (`hitter_data/__init__.py:28-38`) refuses ≥ 2026 unless `_final_test_unlock` was called. Only
  `final_test.score()` calls it, after both engines' tables are built in separate subprocesses (final_test.py:121-131).
- Every fit loader goes through the guard: `harness.games_for`/`build_season`, `fit_count_hs.hs_games`/`load_season`,
  `fit_traits_*`, `hs_fb_floor`, `mean_preserve`, `pa_targets`, `refit*`, `refit_mlb_targets`, `zone_load`, and
  `refit_load.fit_seasons_on_disk` (`< HELDOUT_SEASON`).
- The 2026 HS load uses `cache=False`. College `build_season` doesn't cache.
- `core_fit_seasons` checks that `count_v13core.about` contains "thru2025".
- Only report or diagnostic code reads 2026 without the guard: crosscheck, represent, kgap_predict, freeze (D9).
- I found no path by which 2026 enters a fit cache.

## 4. What I couldn't check
- **Anything that needs the archives:** how many of the 24,384 "separate" pairs are duplicates (D1); how often
  unparsed PA verbs and reconstruction errors occur in full games (D3); `freeze --check`; the unparsed-pattern table; and
  whether HS has duplicates across PG events. Those games are on the owner's desktop.
- **The scored-run record:** `scores.json`, with Step 6's own sha256 record, isn't in the repo (only `scores.md`,
  `RAN.json` and logs). I confirmed tip = scored commit for engine files only through the GitHub compare API, not from
  Step 6's hash record.
- **Parity at scale:** I didn't run `golden/fast.py` or the golden suites. The 43-case probe is a spot check of edge
  inputs, not a parity proof.
- **Coach-facing inputs:** I didn't audit how the app builds Situation, so it's unchecked whether a live game can send
  a NaN inning (the JS crash in D6).
