# v1.3 buildout: build report (2026-11-21)

Branch `feat/hitter-v13-prework` (each part was built on its own branch, stacked on it, then merged). Nothing is on
main, nothing was deployed, and no default behavior changed. **2026 was never fit, tuned or scored**: every fit goes
through `hitter_data.assert_not_heldout` / `fit_seasons`, and each part has a test that trips the guard. The archives
were read-only (the HS CSVs are copied to a snapshot first), and data stays in `C:/dev/pitchiq-data`.

**Every fit number below is PROVISIONAL.** The college and HS scrapes are still running (D2 / D3 2025 coverage is 0.34 /
0.14; Perfect Game is ~45% collected). Settings were tuned on 2025 and scored on 2025, so the scores lean optimistic.
Nothing here is graded, approved or wired as the default.

Environment: `export PATH=/c/dev/pitch-caller-logs/py3/Scripts:/c/dev/pitch-caller-logs/shim:$PATH PYTHONUTF8=1`.

## Part 1: HS / travel archive (Perfect Game)
- The archive is `~/.codex/.chatgpt-projects/<project>/diamondkast/`: the DiamondKast CSVs (games, pitch_by_pitch,
  lineups, rosters, coverage) and per-game scorecard JSON. It covers the WWBA 15U-18U, the WWBA World / Underclass and
  the PG HS Showdowns, 2022-26. Schema and method are in `docs/HS_ARCHIVE_v13.md`.
- `python -m hitter_data.update` now also snapshots and parses HS games (`--no-hs` / `--hs-only`). Code is in
  `hitter_data/hs_{snapshot,parse,ingest,quality}.py`; data in `hs/hs.sqlite3`.
- Run on 9,748 games: 2.07 M pitches and 553 k PAs, with 0 parser errors.
  - Half-innings at exactly 3 outs: 97.6%.
  - Half-inning runs = line score: 99.3%.
  - Count replay: 99.9%.
  - Velocity on 93.9% of pitches; pitch type on 96.6%.
  - Handedness matched: 95%. Lineup slot found: 98.8%.
- The fit-eligible seasons 2022-25 hold 7,462 games (~1.6 M pitches).
- Not in the archive: pool vs bracket (inferred from the schedule; "unknown" for the Showdowns), time limits and pitch
  limits (left blank), and pitch location. Bat type isn't used, per Drew.
- `python3 tests_hs_data.py`: 48 pass. The college reports regenerate byte-identical.

## Part 2: engine plumbing that reads tables (no behavior change)
- Both engines now read three versioned files in `data_tables/` (formats in `docs/TABLES_v13.md`):
  - `zone_v12.json`: base band rates, the class terms (including the +0.5 hanger) and empty zone cells.
  - `count_v12.json`: per-level count, base-out and called-strike terms, the ground-ball offset by count, and the
    in-play tables.
  - `run_v12.json`: RE / CV / LW per level. D2 is still absent, so the release guard still trips.
- Files are picked with `PITCH_ZONE_TABLE` / `PITCH_COUNT_TABLE` / `PITCH_RUN_TABLE` (a version name or a path).
- Proof:
  - `python3 tests_v13_tables.py`: 39 pass. It includes Python and JS bit for bit vs 90fca9b on 400 outcome cases and
    10 calls, Python = JS, and single-value perturbations that move exactly their target.
  - `node golden/golden_v11.js v123`: pass, with output identical.
  - `fast.py 40`: 0 mismatches.
  - Full `scripts/test-app.sh` on the tables branch: exit 0 (58 suites).
- The format can't yet carry ball type by zone band, a called-strike shape on heart / way-off, or the HS pitch kind ×
  velocity terms. Each of those needs an engine change, not just a new file.

## Part 3: the fits, run provisionally
Commands: `fit_count`, `fit_runs`, `fit_count_proxy`, `score_candidates`, `fit_count_hs`, `fit_situation`,
`fit_traits`, `export_candidates` and `zone_candidate` (all `python -m hitter_data.<name>`). Write-ups:
`docs/FITS_COUNT_v13.md` and `docs/FITS_TRAITS_v13.md`. Outputs are under `fits/`. Candidate engine files are in
`fits/candidates/`: `count_v13prov.json`, `run_v13prov.json` and `zone_v13prov.json`.

**Count layer (3.1), PROVISIONAL, 2025 `pitch_5way` log loss per pitch:**

| Level | v1.2 | v1.2_recal (pass reference) | Best v1.3 | v1.3 minus recal (SE) |
|---|---|---|---|---|
| D1 | 1.4668 | 1.4464 | 1.4453 (shared) | -0.00110 (0.00008) |
| D2 (thin) | 1.4627 | 1.4438 | 1.4428 (borrow) | -0.00104 (0.00028) |
| D3 (thin) | 1.4699 | 1.4440 | 1.4433 (shared) | -0.00069 (0.00033) |
| HS / travel | 1.4538 [D3 world] | 1.4428 | 1.4418 (sep) | -0.00101 (0.00012) |

- Every level beats the per-count reference by about 0.001, half the proposed 0.002 minimum. On D1 the whole gain is
  base-out context.
- **HS pitch kind + velocity add +0.0103 (SE 0.0005)**, the only gain above 0.002. The table format can't carry it yet.
- Half-life: flat from 1.5 to 3 (the default of 2 costs nothing).
- Borrowing share: D2 0.24-0.46, D3 0.74-0.82, HS 0 from D3.
- Level split: shared + offset never loses to separate patterns by 2 SE.
- Hard-contact proxy (line drive or extra-base hit): ranks counts like Single-A hard-hit rate (Spearman 0.90-0.97). The
  weak-contact proxy fails.
- Platoon: real only where hands are known, which is HS (87-94% of PAs): -0.0002 nats, 4 SE. College has hands for 5-15%
  of PAs.
- HS format terms (HS vs travel, pool vs bracket): no gain, which supports one model for both. Age group and series are
  tiny and add nothing once pitch kind and velocity are in.

**Run values (3.1).** Count × base-out beats today's tables on 2025:
- D1: by 0.0056 per pitch state (SE 0.0013).
- HS: by 0.048 (SE 0.013). Today's HS table is too high: runs from 0 outs, bases empty are 0.78 vs 1.07.
- D2 and D3: better in point estimate, inside the noise.

**Situation effects (3.3), 2025 gain in nats per pitch.** No single effect clears 0.002 at any level.

| Level | Times through order | Previous pitch | RISP | Late and close | All four |
|---|---|---|---|---|---|
| D1 | +0.00067 | +0.00086 | +0.00029 | +0.00004 | +0.00187 |
| D2 | +0.00091 | +0.00078 | +0.00031 | -0.00001 | +0.00198 |
| D3 | +0.00066 | +0.00056 | +0.00002 | +0.00008 | +0.00131 |
| HS | +0.00066 | +0.00132 | +0.00011 | +0.00003 | +0.00209 |

- Times through the order is a smooth concave curve with no third-time jump.
- The previous-pitch effect is probably mostly the batter-pitcher matchup carrying through the at-bat.

**Traits (3.4).**
- D1 fitted sizes, logit per hitter SD (placeholder in brackets): early 0.36 (0.35), contact 0.38 (0.35), power 0.39
  (0.30), two-strike swing 0.23 (0.30), two-strike foul 0.14 (0.30).
- D1 split-half reliability: 0.45-0.77, except two-strike foul (0.17-0.28).
- Two-strike swing and two-strike foul are anti-correlated, so the simulator's one `two_strike` trait should split.
- HS reliability is low because player-seasons are small (median 6 PAs). Traits follow the player id across teams.
- Prior: only power has a useful slot × team prior (R² 0.26-0.31 at D1).
- Presets were sized from the top 15% of real hitters: college is near the placeholders and HS is smaller. Tables are
  in `FITS_TRAITS_v13.md`.
- Prefill files: D1 9,049 hitters, D2 4,463, D3 5,517, HS 15,180 (keyed by Perfect Game id).

**Candidate engine files.**
- `count_v13prov`: with it loaded, the engine reproduces the fitted per-count rates exactly at college and within 0.005
  at HS.
- `zone_v13prov` is built from the regenerated zone draft. The hanger row comes out at ×0.79 (seed ×0.78, v1.2 ×1.48).
  `chase_os` and `hanger_hard` are 0, per Drew's principle, and there is no quality gate.
- Both load in Python and JS (Python = JS to 3e-14), and both change calls vs v12, as expected. Neither is the default.
- Caveat: the count offsets were fit under the harness's heart-heavy frozen landing. The Single-A zone-by-zone check is
  required before anything ships.

## Part 4: one refresh command
`python -m hitter_data.refit_all` runs 12 steps:
1. ingest college + HS;
2. coverage and the representativeness check;
3. the college fits;
4. the 2025 scores;
5. the HS fits;
6. the candidate export;
7. the zone draft and zone candidate, only when new Statcast has landed.

It writes `fits/refit_all_summary.md`. Flags: `--skip-ingest`, `--force-zone`, `--only`, `--dry-run`.
- First full run: all 10 steps it had then ok, 872 s.
- The second run, with all 12 steps, was stopped by the system for low memory after its 10th step (the export); all 10
  were ok.
- The zone draft regenerated byte-identical.
- The driver's tests are in `tests_hitter_data.py` (110 pass).

## Part 5: quality-gated hanger
**Skipped.** Drew hasn't approved the design in `docs/DECISIONS_refit_v13.md` section 4. The zone candidate already drops
the flat hanger, per his principle; the gate waits for his approval.

## Merged branch check
All parts are merged into `feat/hitter-v13-prework` (0830ca3).
- **The full `scripts/test-app.sh` on this tip did not finish.** The system was near 98% memory, and the run was cut
  off. Every check up to tests_v12 passed; then `fast_parity_leans`' JS side couldn't start (exit 0xC0000142, a Windows
  process-start failure). I didn't restart it.
- Targeted checks run on this tip afterwards, all passing:

  | Check | Result |
  |---|---|
  | tests_v13_tables | 39 |
  | golden_v123 | pass |
  | fast.py 40 | 0 mismatches |
  | tests_v13_d2 | 13 |
  | tests_fit_count | 85 |
  | tests_v13_sim | 16 |
  | app/dist matches the source | yes |
  | web/lib copies match | yes |

- Earlier on the merged tree: tests_hitter_data 110, tests_hs_data 48, tests_fit_traits 58.
- The tables branch alone passed the full suite (exit 0).
- **To do when memory allows:** run the full suite once on this tip.

## Waiting on Drew
1. The zone table is regenerated on the finished pulls and ready for approval (`docs/ZONE_TABLE_DRAFT_v13.md`).
2. The decision sheet (`docs/DECISIONS_refit_v13.md`): R1 / Q4 / S5, the 25 HS calls, HARD_SD, the 0.002 minimum, the
   landing re-freeze, R12 and the run-value scale.
3. Approve the quality-gated hanger design (Part 5).
4. Whether a group of situation effects may clear the bar together (HS all-four +0.0021).
5. Splitting the simulator's `two_strike` trait into swing and foul.
6. An engine table for HS pitch kind × velocity, the one fit above the bar that the format can't carry.
7. The coverage rule, once D2 / D3 2025 lands (task D numbers are in the prework report).

## Refresh command
```
cd /c/dev/pitch-caller && export PATH=/c/dev/pitch-caller-logs/py3/Scripts:$PATH PYTHONUTF8=1
python -m hitter_data.refit_all          # everything; summary in C:/dev/pitchiq-data/fits/refit_all_summary.md
```

## Summary
- HS / travel intake, table-driven engines (v12 files = v1.2 bit for bit) and every fit are built and running on the data in hand, along with candidate engine files and one refresh command (`python -m hitter_data.refit_all`).
- Provisional result: every level's count layer beats the per-count reference by ~0.001 nats, under the 0.002 bar. Only HS pitch kind + velocity (+0.010) clears it, and it needs a new engine table.
- Nothing is approved or wired, and 2026 is untouched. The full suite on the merged tip waits for free memory (targeted checks pass); the hanger gate waits for Drew.
