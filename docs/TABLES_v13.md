# v1.3 engine tables: file formats (buildout Part 2)

Both engines read the zone effects, the count layer and the run values from versioned JSON files in `data_tables/`.
The shipped `*_v12.json` files reproduce v1.2 bit for bit (`tests_v13_tables.py`). Approving a fit means adding a new
file, selecting it and diffing the goldens. The engine code does not change.

## Selecting a version

- `engine.py` loads `data_tables/<kind>_<version>.json` for each kind (`zone`, `count`, `run`) at import.
  - Default: `engine.TABLE_DEFAULT` (all `v12`).
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

- Required levels: `mlb`, `college_d1`, `college_d3`, `hs`.
- College D2:
  - `college_d2` has v1.2's count terms. They are the same at every level in v1.2, so this is not a D3 copy.
  - It has no `out_table` / `runner`, so `_fill_d2_placeholders` still gives it D3's and lists `OUT_TABLE` / `RUNNER_FIT`.
- The level offsets `zsw osw wz wo cs hbp cmd wild` stay in `outcome_params.py` (written by `fit_all.py`, the pitcher-side
  recalibration that follows the core fit).

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
