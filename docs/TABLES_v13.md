# v1.3 engine tables: file formats (buildout Part 2)

Both engines read the zone effects, the count layer and the run values from versioned JSON files in `data_tables/`.
The shipped `*_v12.json` files reproduce v1.2 bit for bit (`tests_v13_tables.py`). Approving a fit means adding a new
file, selecting it and diffing the goldens. The engine code does not change.

**v1.3 core branch (`feat/hitter-v13-core`, the shared refit merged with the tables):** the refit's numbers that live in
these files (called-strike kappas, typed in-play tables, RE / CV / LW) are in `*_v13refit.json`
(`data_tables/build_v13refit.py`, built from the working-tree sources). The `*_v12.json` files stay v1.2 bit for bit
(`build_v12.py` reads the v1.2 sources from git 90fca9b). With the v13refit files loaded the merged engines equal the refit
tip 21f44ac bit for bit (`tests_v13_tables.py`). The run-scale denominator is pinned at 0.481 (ruling 10,
`engine.RUN_SCALE_MLB_RE00`), not read from `re.mlb["0|000"]`.

## The core defaults (v1.3 core, Task C; PROPOSED, nothing ships)

`engine.TABLE_DEFAULT` on `feat/hitter-v13-core` is `zone v13`, `count v13core`, `run v13core`:

| File | sha256 | What it is |
|---|---|---|
| `zone_v13.json` | `4c9f98efb96a3e66a2f1367b6635caf451b2521efeb1169a707625643f253323` | The approved zone table (ruling 2; `docs/ZONE_v13_APPROVED.md`, built by `python -m hitter_data.zone_v13`): Single-A cells, per-level cells for college D1 / D2 / D3 (trend carried one step down) and HS (two steps), `class.gb_kind.SI` = -0.0221 (P3 from Triple-A), the flat hanger and flat chase removed, `class.hanger_gate` H = 0 (ruling 3, sized later) |
| `count_v13core.json` | `349f6a848fa5e4f5f5bc1579be5c3a4d92b766e366b0e7d9c02daa4cdf6e06ae` | college_d1 and hs: the PROVISIONAL count candidates (D1 `shared`, HS `sep`, thru 2025) calibrated under zone_v13 and the harness's h3 landing on top of count_v13refit; hs also carries `pitch_velo` (ruling 4). college_d2 / college_d3: **v1.2 count layer pending the coverage rule** (count terms v1.2's; kappas and in-play tables the refit's; labelled in the file). mlb: count_v13refit |
| `run_v13core.json` | `ea99383c9af5606462453a1024a5c00c934707a8fb0fd02e690fa2391bca2d98` | re / cv for college_d1 and hs from the fits (cv relative to 0-0); college_d3, mlb and every lw the refit's; no college_d2 (D3's: PLACEHOLDER) |
| `mp_v13.json` | see `tests_v13_meanpreserve.py` (inputs' sha256 in the file) | Drew's Nov 24 ruling 12: the per-count mean-preservation scalars, computed by `python -m hitter_data.mean_preserve solve` (not tuned). `mp_v0.json` = all 0 (the engine before the ruling) |

- Rebuild: `PITCH_ZONE_TABLE=v13 PITCH_COUNT_TABLE=v13refit PITCH_RUN_TABLE=v13refit python -m hitter_data.export_candidates --core`
  (needs `python -m hitter_data.fit_count_hs --pitch-table` first). It rewrites the two files, so their shas change:
  update `tests_v13_core.py` SHA256 and this table.
- `tests_v13_core.py` checks the shas, each component's switch-off and Python = JS.
- The previous stages stay selectable: `v13refit` for all three is the refit tip; `PITCH_ZONE_TABLE=v13` with count / run
  `v13refit` is "zone only".

## Selecting a version

- `engine.py` loads `data_tables/<kind>_<version>.json` for each kind (`zone`, `count`, `run`) at import.
  - Default: `engine.TABLE_DEFAULT` (all `v12` on the tables branch; on the core branch `v13` / `v13core` / `v13core`).
  - Override: `PITCH_ZONE_TABLE`, `PITCH_COUNT_TABLE` or `PITCH_RUN_TABLE`, set to a version (`v13`) or to a path ending
    in `.json`.
  - A missing or incomplete file is an import error. There is no silent fallback.
- `engine.TABLE_VERSIONS` records what was loaded. `engine.check_table(t)` is the format check.
- The JS engine reads the tables from `app/engine_data.json`. `python3 app/export_data.py` writes it with whatever
  versions the Python engine loaded (same environment variables). `--out PATH` writes a scratch copy instead.
  - `TABLES.versions` records the versions in the export.
  - `TABLES.zone` is the whole zone file.
  - `TABLES.count` is the count file without its in-play tables. Those go out as `V08.OUT_TABLE` / `V08.RUNNER_FIT`.
  - The run values go out as `RE` / `CV` / `LW`.
- After changing a default:
  1. Run `app/export_data.py`.
  2. Copy `engine.js` and `engine_data.json` to `web/lib`.
  3. Run `node web/scripts/trim-engine-data.cjs` (from `web/`).
  4. Run `cd app && python3 build.py`.
  5. Run the goldens.

## Shared vocabulary

Every number is a **logit offset** (added to a log-odds) unless marked as a probability or in runs.

| Key | Values |
|---|---|
| band | `heart`, `edge`, `off`, `noncomp`: the landing zones (`engine.ZONES`; Savant attack zones 67 / 133 / 200%) |
| profile | `FB SI FC SL SW CB CH SP` (SW = `SL` tagged `sweeper`, SP = `CH` tagged `split`; `hitter_data/zone_defs.py`) |
| count group | `first` (0-0), `ahead` (balls > strikes, < 2 strikes), `even` (1-1), `behind` (0-1), `two` (two strikes) |
| height | `up`, `mid`, `down`: the height of the aimed target (`engine.target_height`: fastball chase is up, off-speed chase is down) |
| count | `"b-s"`, e.g. `"3-1"` (all 12) |
| base-out | `"outs|bases"`, bases as `000 100 020 120 003 103 023 123` (24 states) |
| level | `mlb`, `college_d1`, `college_d2`, `college_d3`, `hs`. Travel uses `hs`'s table; `college` uses `college_d1`'s |

Each file also has `"kind"`, `"version"` (a string, recorded with the export) and a free-text `"about"`.

## `zone_<v>.json`: the zone table

| Key | Units | Replaces (v1.2 term) |
|---|---|---|
| `base.swing / cstrike / whiff / foul` `{band: p}` | probability | `S0`, `C0`, `W0`, `F0` (the logit of each is the starting point) |
| `base.quality` `{band: [weak, solid, hard]}` | probabilities (sum 1) | `Q0` |
| `base.zone_in` `{band: share}` | share inside the rulebook zone | `ZONE_IN` (weights the level's `zsw`/`osw`, `wz`/`wo`) |
| `class.whiff_fb`, `class.whiff_os {SL, CB, CH}` | logit | `W_FB`, `KIND_W_OS` |
| `class.line_low`, `line_up`, `line_whiff`, `line_hard`, `up_mid_hard` | logit | `class_terms`' off-speed location line (f = 0.4 low / -1.0 up; whiff 0.25 f; hard -0.3 f + 0.4 when aimed up or middle) |
| `class.chase_os {off, noncomp}` | logit, swing | the +0.2 off-speed chase just off the plate |
| `class.hanger_hard` | logit, hard contact | the +0.5 hanger (off-speed over the heart) |
| `class.hanger_gate` (optional, absent = 0) | logit, hard contact | v1.3 core, ruling 3: H. An off-speed pitch landing over the heart gets H x min(1, wild_today / 0.30) when `wild_today` > 0 (`engine.HANGER_GATE_FULL` = 0.30; `engine.hanger_gate`, `engine.js hangerGate`) |
| `class.gb_kind` (optional, absent = {}) | logit, ground ball given contact, by pitch kind | v1.3 core, ruling 2's P3 row: added in `type_mix` (zone_v13: SI only) |
| `cells.<outcome>[band][profile][count group][height]` | logit | new: the fitted zone table. Outcomes: `swing`, `cstrike`, `whiff`, `foul`, `hard` |
| `level_cells.<level>` | the same shape as `cells` | new: a level's own cells, replacing `cells` at that level (for the transfer check's "carry the trend down") |

- In `v12`, every cell is 0 and `level_cells` is `{}`.
- Where each cell enters `outcome_probs`:
  - `swing`: after the count term and the chase class term.
  - `cstrike`: inside the called-strike sum. This applies only on `edge` / `off`; heart and way-off use `base.cstrike` directly.
  - `whiff`: after the class whiff term.
  - `foul`: with the count foul term.
  - `hard`: after the hanger.
- The full composition is in the code comments (`engine.py outcome_probs`, `app/engine.js opPrep`).

## `count_<v>.json`: the count layer, per level (`levels.<level>`)

| Key | Units | Replaces (v1.2 term) |
|---|---|---|
| `swing[count][band]` | logit | the count terms in `outcome_probs`: +0.9 at two strikes, -0.4 at 0-0, -2.0 at 3-0, hitter's counts +0.3 in the zone / -0.4 out |
| `whiff[count][band]` | logit | new (0 in v12) |
| `foul[count][band]` | logit | the +0.3 at two strikes |
| `hard[count][band]` | logit | new (0 in v12) |
| `swing_base_out[base-out]` | logit | new (0 in v12) |
| `cstrike[count]` | logit | `KAPPA_FIT` (`fit_v08.json` ship.kappa centred on `sim_constants.json` TAKE_W, as `_apply_fit` did) |
| `bip_gb[count]` | logit, ground ball given contact | new (0 in v12). Added in `type_mix` when it is given the situation |
| `out_table[weak/solid/hard][GB/LD/FB/PU]` | probabilities `[out, 1B, 2B, 3B, HR, E]` | `inplay_typed_params.OUT_TABLE` |
| `runner {p_GB, p_FB, S_DP}` | probabilities / scale | `inplay_typed_params.RUNNER_FIT` (the three fields the engines use) |
| `pitch_velo` (hs only, optional) | multipliers on the six pitch events | v1.3 core, ruling 4: HS / travel pitch kind x velocity (below) |
| `fb_floor` (hs only, optional) | {count: share in [0, 1)} | v1.3, Drew's Nov 23 ruling 8: the HS / travel engine's fastball share in a count can't go below it (`engine.fb_floor` / `apply_fb_floor`, `app/engine.js` `fbFloor` / `applyFbFloor`): the 10th percentile of pitcher-season fastball share in that count (hs.sqlite3 2022-25, pitcher-seasons with >= 10 typed pitches in the count; `hitter_data/hs_fb_floor.py`). Applied to the PA table's per-count policy and to the root call after its tie-break; the hitter's sit game is solved without it. Absent = no floor |
| `calibrated_with_pitch_velo` (hs only, optional) | true | ruling 8: the hs row was calibrated with `pitch_velo` on, the frozen world at the HS data staff's speeds (`fit_count_hs.HSVeloAssumption`); `export_candidates.probe_for` reads it |
| `label` (optional) | text | what the level's row is (e.g. "v1.2 count layer pending the coverage rule"); the engines ignore it |

**`levels.hs.pitch_velo`** (Drew's ruling 4; exported by `python -m hitter_data.fit_count_hs --pitch-table` into
`fits/hs/pitch_velo_thru2025.json`, copied into the count file by `export_candidates --core`):
- Defined exactly as the fit that gained +0.0104 nats per pitch on 2025 (FITS_COUNT_v13 section 12.2, the stack
  kind + velo_rel + velo_abs): per count, multipliers on the six events `ball, hbp, cstrike, whiff, foul, inplay`, for
  - `kind[count][Fastball | Curveball | Slider | Change-Up | other]` (engine FB / SI / FC = Fastball, SL = Slider,
    CB = Curveball, CH = Change-Up: `engine_kind`);
  - `velo_rel[count][class][bin]`: speed minus his own mean for the class (class: FB / SI / FC fastball, SL / CB breaking,
    CH offspeed: `engine_class`), bins by `vrel_edges` -3 / -1 / 1 / 3 mph (bin 5 = "fewer than 10 readings", unused by the
    engine);
  - `velo_abs[count][class][bin]`: absolute speed, bins by `vabs_edges` per class (fastball 70 / 75 / 80 / 85, breaking
    60 / 65 / 70 / 75, offspeed 65 / 70 / 75 / 80). A speed on an edge goes to the bin above (np.digitize).
  - Reference: none; each level's multiplier is shrunk to 1 with 200 pseudo-pitches against the count layer's expectation.
  - Fit seasons 2022-2025 on top of `hs_sep_thru2025` (the HS count candidate). It does not depend on the harness landing.
- The engine: P(y) is the count layer's mix x kind x velo_rel x velo_abs, renormalised (`engine.pitch_velo_factors`,
  applied at the end of `outcome_probs`; `engine.js pitchVeloFactors`, at the end of `opEval`). The zone rows (`zout`) and
  JS `byZone` are left as the count layer gives them.
- Speed: the pitch's entered arsenal speed (`Pitch.velo`). "His mean for the class" is the mean entered speed of his
  arsenal's pitches of that class (the pitch itself included).
- **Fallback when a pitch has no entered speed: both velocity terms are skipped and the kind term still applies**, the
  fit's own rule for missing velocity (5% of 2025 pitches had none). The speed the engine would derive off his fastball
  (`Pitch.mph`) is not used.
- Applies at hs and travel only (travel reads hs's table).

- Required levels: `mlb`, `college_d1`, `college_d3`, `hs`.
- College D2:
  - `college_d2` has v1.2's count terms. They are the same at every level in v1.2, so this is not a D3 copy.
  - It has no `out_table` / `runner`, so `_fill_d2_placeholders` still gives it D3's and lists `OUT_TABLE` / `RUNNER_FIT`.
- The level offsets `zsw osw wz wo cs hbp cmd wild` stay in `outcome_params.py` (written by `fit_all.py`, the pitcher-side
  recalibration that follows the core fit).

## `mp_<v>.json`: the per-count mean-preservation scalars (Drew's Nov 24 ruling 12)

```
{"kind": "mp", "version": "v13", "about": "...", "reference": {level: text}, "harness_assumption": "...",
 "inputs": {name: {"path", "sha256"}}, "max_abs_rate_error": {level: x},
 "levels": {level: {"swing" | "whiff" | "foul" | "cstrike" | "bip_gb": {count: logit shift}}}}
```

- Levels: `mlb`, `college_d1`, `college_d2`, `college_d3`, `hs` (all required; travel reads `hs`, `college` reads `college_d1`).
- The engines add each shift to the count table's row as they read it (`engine.count_cells` / engine.js `countCells`):
  `swing` / `whiff` / `foul` to every band's offset, `cstrike` to the kappa, `bip_gb` to the ground-ball offset. `hard` and
  `swing_base_out` are untouched. So in a count every band, zone cell, pitch kind and speed moves by the same logit:
  relative effects are unchanged and only the per-count level is pinned. The count table itself never changes.
- Computed by `hitter_data/mean_preserve.py`: per level and count, Newton in logit space (5 x 5 Jacobian per count) until
  the reference world (the real pitch mix by count + the harness's h3 average-pitcher landing; HS: real HS kind usage at
  real HS speeds; MLB: D1's frozen rows with MLB Statcast landing) gives back the fitted count layer's per-count swing,
  whiff | swing, foul | contact, called strike | take and ground ball | in play to < 1e-10. `inputs` records the sha256 of
  every file the solve read; `tests_v13_meanpreserve.py` fails if one changed (re-solve).
- Select with `PITCH_MP_TABLE` (`v0` = the engine before the ruling).

## `run_<v>.json`: run values, per level (`levels.<level>`)

| Key | Units | Replaces |
|---|---|---|
| `re[base-out]` | runs to the end of the inning | `run_tables.RE_BY_LEVEL` |
| `cv[count]` | hitter's runs vs 0-0 | `run_tables.CV_BY_LEVEL` |
| `lw {bb, k}` | runs of a walk / a strikeout vs a neutral PA | `college_run_values.json` `_lw_bb` / `_lw_k` |

- Required levels: `mlb`, `college_d1`, `college_d3`, `hs`.
- **Leave `college_d2` out until D2 has its own fit.** The engine then gives it D3's, lists `RE` / `CV` / `LW` in
  `D2_PLACEHOLDERS`, and `release_guard_d2.py` trips. Writing a D2 entry is what clears the guard for these tables.
- `re.mlb["0|000"]` is the denominator of `run_scale` at every level (inventory B14).

## How a fit writes a candidate file

1. Start from the shipped file: `json.load(open("data_tables/count_v12.json"))`.
2. Set `"version"` to a new name, e.g. `"v13-cand-2026-11-25"`. Replace only the numbers the fit owns, at the units
   above.
3. Keep every key. Use 0 for "no effect". The loader refuses a file with a missing level, count, band, base-out state or
   cell.
4. Write it as `data_tables/<kind>_<version>.json` (UTF-8, `\n` newlines).
5. Run `python3 -c "import engine"` with the override set; this runs the format check.
6. Score or simulate with the override set, e.g. `PITCH_COUNT_TABLE=v13-cand-2026-11-25 python3 golden/fast.py 40`. Run
   `app/export_data.py --out` for a JS copy.
7. To adopt it:
   1. Change `TABLE_DEFAULT`.
   2. Re-export.
   3. Regenerate the golden JSONs and review the diff.

The zone candidate already exists: `python -m hitter_data.zone_candidate` (also run by `refit_all` after the zone step)
writes `C:/dev/pitchiq-data/fits/candidates/zone_v13prov.json` plus `zone_v13prov_report.md` (per-statement and per-cell
error vs the seed, hanger rows, what the format can't carry). It is PROVISIONAL: Drew has not approved the zone numbers.
`engine.use_zone_table(t)` swaps a zone table in place in Python for fit code.

Fit-side notes:
- **Zone ratios.** The zone draft's fitted numbers are ratios of rates (mean-preserving per count group). The fit converts
  them to logit offsets relative to what the engine adds already (base + count + class terms). Once the zone table is
  wired, the candidate also zeroes `class.chase_os` and `class.hanger_hard` (plan section 11: the flat hanger goes).
- **v12 provenance.** `data_tables/build_v12.py` writes the v12 files from the v1.2 sources (`--check` compares).
  `tests_v13_tables.py` fails if `run_tables.py`, `college_run_values.json`, `fit_v08.json`, `sim_constants.json` or
  `inplay_typed_params.py` are regenerated without writing a new table version.
