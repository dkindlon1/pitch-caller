# v1.3 full data: K-gap fixes 8–10 (Nov 23–24, 2026)

Carries out `docs/PROMPT_hitter_v13_kgap_fixes_2026-11-23.md` on `feat/hitter-v13-fulldata` (worktree `C:/dev/pc-fulldata`;
not pushed). Rulings 8–11 are recorded as DECIDED in `docs/DECISIONS_refit_v13.md`. Local only; 2026 never read; the
archives are read-only and the game list frozen; the count layer was held fixed in recalibration (ruling 5). Nothing here is
graded. **The run stopped at task 2:** after the pitcher-side recalibration every non-MLB level still misses K by more than
1 point, so tasks 3–4 were not run as such (the trend / edge re-measure is in the K-gap table below, as "what's left").

| Commit | What |
|---|---|
| a08cfb7 | rulings 8–11 recorded, prompt added |
| 15ef1c6 | fix 9: centered sim hitters, centered calibration population |
| 24d4f66 | fix 8: HS fastball floor (both engines), HS count layer calibrated with the velocity table on |
| c393047 | fix 10: weighted college full games, refit college count layers, chain check |
| c3e21be | combined pitcher-side recalibration (first) |
| e00cfe5 | **fix 8 correction**: the floor also binds when the fastball is outside the never-pick window (found in the fixed-core sims) |
| 938fc4e | combined pitcher-side recalibration after the correction (HS only moved) |

Sims: seed-paired kgap_diag games, 480 per level (HS 900), 22 workers, 48 GB guard (never held back; peak ~33 GB); every game
fixed by its seed (pooled = serial was proved again for the new pooled runner `hitter_data/sim_pool.py`: 4 games, serial =
pooled byte for byte, and the log-only stubs change no game; its games equal the old serial `batch.py` games). Data:
`C:/dev/pitchiq-data/kgap_diag` (fix-alone runs), `C:/dev/pitchiq-data/kgap_fixed` (fixed core: `kgap_table.md`,
`kgapfix_summary.md`).

## 1. Each fix alone, and the combined landing (K, points)

| K, points | MLB (control) | D1 | D2 | D3 | HS |
|---|---|---|---|---|---|
| K target | 22.4 | 19.3 | 17.0 | 16.2 | 21.0 |
| sims as built (99b22fb) | 23.7 | 23.2 | 20.8 | 20.6 | 28.7 |
| fix 8 alone (HS floor + table-on calibration) | – | – | – | – | −5.2 ± 0.3 |
| fix 9 alone (centered hitters) | −1.8 ± 0.3 | −1.3 ± 0.3 | −1.1 ± 0.3 | −1.1 ± 0.3 | −1.0 ± 0.2 |
| fix 10 alone (weighted college count layers) | – | −0.1 ± 0.3 | +0.1 ± 0.3 | −0.9 ± 0.3 | – |
| **calibration chain after recal: K gap** (pitcher keys only) | **−0.8** | **+1.5** | **+1.8** | **+1.7** | **+2.5** |
| was, at 99b22fb | +0.0 | +2.4 | +2.3 | +2.5 | +6.9 |
| fixed core sims: K | 21.5 ± 0.3 | 21.6 ± 0.3 | 19.8 ± 0.3 | 18.3 ± 0.3 | 23.0 ± 0.3 |
| **fixed core sims: K gap** | **−0.9** | **+2.3** | **+2.8** | **+2.1** | **+2.0** |
| fixed core sims: BB (target) | 10.7 (8.4) | 13.0 (10.8) | 14.0 (11.2) | 13.6 (11.4) | 15.4 (14.1) |

- BB / HBP land within 1 point in the calibration chain at every level. The sims run about 1 point higher in K than the chain
  (as at 99b22fb: +3.9 sims vs +2.4 chain at D1) and their BB is 1.4–2.8 points high at every level; neither is new.
- Fix 8 alone uses the corrected floor (first wiring: −2.9 ± 0.3; its sims are kept as `hs__fix8_first`).
- Runs per game, fixed core − as built (paired): MLB +0.23 ± 0.17, D1 +0.28 ± 0.22, D2 +1.01 ± 0.25, D3 +0.59 ± 0.26,
  HS +1.37 ± 0.20. Fewer strikeouts mean more balls in play; not judged here (the 400-game sims vs v1.2 are task 4, not run).
- **Pass bar: missed at D1, D2, D3 and HS** (K more than 1 point high after recalibration). Stop point.

## 2. Fix 8: the HS fastball floor

Floor = 10th percentile of pitcher-season fastball share in that count (hs.sqlite3 2022–25, full-log parsed games, typed
pitches). **Minimum used: 10 typed pitches in that count per pitcher-season** (every count then has ≥ 32 pitcher-seasons;
`hitter_data/hs_fb_floor.py`, `fits/hs/fb_floor_thru2025.json`).

| count | 0-0 | 1-0 | 2-0 | 3-0 | 0-1 | 1-1 | 2-1 | 3-1 | 0-2 | 1-2 | 2-2 | 3-2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| floor | .536 | .636 | .667 | .837 | .385 | .455 | .583 | .667 | .364 | .333 | .400 | .545 |
| pitcher-seasons | 37,769 | 17,898 | 1,570 | 32 | 15,818 | 12,039 | 3,363 | 330 | 3,700 | 7,561 | 5,644 | 2,318 |
| at min 8 / 15 | .536 / .533 | .625 / .650 | .667 / .722 | .750 / .873 | .375 / .400 | .444 / .457 | .556 / .588 | .700 / .873 | .364 / .379 | .333 / .353 | .375 / .412 | .545 / .563 |
| engine before (sims) | .46 | .49 | .55 | .65 | .51 | .48 | .49 | .53 | .33 | .29 | .25 | .20 |
| fixed core (sims) | .57 | .63 | .63 | .75 | .56 | .57 | .61 | .64 | .48 | .43 | .45 | .52 |

- Wired in both engines as `levels.hs.fb_floor` (format-checked, hs only; travel reads it). It applies to the PA table's
  per-count policy and to the root call after the tie-break: fastball calls × f / w, the rest × (1 − f) / (1 − w).
- **Not inside the hitter's sit game.** With the floor inside the quantal-response map the solve cycled (2-2 residual 0.17
  after 3,000 steps), and Python / JS drifted 3e-7. On the output it is deterministic; Python = JS within 1e-9 (2e-13).
- **Correction (e00cfe5).** The first wiring only scaled fastball calls already in the policy. At HS 2-2 / 3-2 the data
  staff's starter template has the fastball outside the never-pick window (share 0), so the guard never bound there (fixed
  sims: 3-2 .26 vs .545). Now, at share 0 with fastball calls allowed, f goes to the fastball calls by the engine's own
  location softmax. **The floor overrides the never-pick window for the fastball**; a shaken-off fastball isn't forced back.
- **HS calibrated with the table on.** The harness's HS world asked the count layer about the 86 / 89 mph college staff,
  which the velocity table reads as elite (the core build's HS failure). It now plays its two arsenals at the HS data staff's
  six speeds (`fit_count_hs.HSVeloAssumption`; the same templates as `simulate.hs_data_staff`). HS offsets moved little
  (whiff −0.02 to −0.09 logit, 3-2 called strike −0.34); fresh-process per-count error 0.00001.
- The HS changed calls move with the floor; they are not listed (task 4 not run).

## 3. College guard (report only, not wired)

Real range = Statcast pitcher usage, pitcher-seasons with ≥ 25 pitches in that count (`fits/hs/college_fb_guard_report.json`).

| count | 0-0 | 1-0 | 2-0 | 3-0 | 0-1 | 1-1 | 2-1 | 3-1 | 0-2 | 1-2 | 2-2 | 3-2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Single-A p10 | .43 | .49 | .61 | .86 | .29 | .32 | .45 | .66 | .22 | .23 | .27 | .41 |
| AAA p10 | .44 | .42 | .52 | .83 | .33 | .33 | .39 | .58 | .24 | .27 | .29 | .36 |
| D1 engine (fixed-core sims) | .54 | .54 | .64 | .74 | .50 | .51 | .56 | .65 | .34 | .33 | .36 | .39 |
| D2 engine | .59 | .59 | .66 | .75 | .55 | .56 | .59 | .68 | .38 | .37 | .38 | .42 |
| D3 engine | .61 | .60 | .67 | .77 | .56 | .57 | .60 | .69 | .38 | .36 | .37 | .42 |

- In aggregate the college engines sit inside the real range except at 3-0 (.74–.77 vs .86), D1 3-1 (.65 vs .66) and D1 3-2
  (.39 vs .41).
- What the guard would change: in the calibration chain, nothing (K 20.82 → 20.82 at D1; every count there is already above
  the range). In D1 sims with the guard on: K **+0.0 ± 0.4**; the fastball share rises 1–4 points at 2-0, 3-0, 3-1, 3-2.

## 4. Fix 9: centered hitters, and the MLB control

- `simulate.OS_HOLE = 0` (no built-in −0.2 off-speed hole). Population means of skill / fb / os / timing are 0 (20,000 lineups:
  ±0.002). The calibration's 36 hitters are drawn from the same simulator and their sample means set to exactly 0 (were fb
  +0.065, os +0.030, timing +0.010).
- **MLB control:** centering alone takes MLB sims from 23.7 to 21.9 (−1.8 ± 0.3: 0.5 below target, close to the diagnosis's
  −0.6). After the pitcher-side recalibration against the centered population: chain 21.6 (−0.8), sims 21.5 (−0.9). The
  pitcher keys can't lift it (cmd / wild trade K for BB); MLB BB in the chain is on target.

## 5. Fix 10: reweighting the college full games

- **Weights** (`hitter_data/fullgame_weights.py`): per level-season an exponential tilt on each full game's K / BB / HBP per PA
  (entropy balancing) so the weighted full games equal all games exactly (50 level-seasons, gap < 1e-6). Conference and
  home-team post-stratification were tried as bases; after the tilt all match exactly, and the tilt alone keeps the most
  effective games in every level-season, so it is used (largest weight 2.8; D1 2025 ESS 6,188 of 6,209 games).
- The raw gaps were small in recent seasons: K full − all, 2025: D1 +0.33, D2 −0.01, D3 +0.02; 2024: +0.38, +0.06, +0.60.
- Refit: `fit_count --weighted` → `*_w_thru{2024,2025}.json` (unweighted files untouched); the core's college rows
  re-exported (fresh-process error 0.00000; in-play tables kept).
- **Chain check** (`hitter_data/chain_check.py`, K per PA over the candidate's own fit seasons and recency weights):

| | D1 | D2 | D3 |
|---|---|---|---|
| target (all games) | 19.30 | 17.05 | 16.21 |
| A. every PA of the weighted full games | 19.41 | 17.37 | 16.74 |
| B. scored PAs (no SAC / SH, IBB, CI, BINT) | 19.84 | 17.79 | 17.17 |
| C. B with usable pitch letters | 19.89 | 17.88 | 17.26 |
| D. count chain on C's raw pitch events | 19.89 | 17.88 | 17.26 |
| E. count chain on the fitted layer | 19.93 | 17.88 | 17.26 |
| unweighted E (before) | 20.23 | 17.95 | 17.67 |

- **The chain itself has no bug**: C = D exactly at every level, and the fit adds ≤ 0.04.
- **What's left is two definitions:**
  - **A → B, +0.42 to +0.43 at every level:** the target counts sacrifice bunts, intentional walks and interference as plate
    appearances; the count layer is fit without them and the sims never have them. So the sims' K is compared to a target on
    a bigger denominator. **For Drew:** state the target on the same PA population (K / (PA − SAC − IBB − CI)), or add those
    PAs to the sims. Not changed (targets are Drew's).
  - **target → A, +0.1 / +0.3 / +0.5:** the count layer's recency weighting includes 2021–24, which struck out more than the
    target season (D1 2021 20.2, 2022 20.1).

## 6. What's left of the K gap (the fixed core; full table `C:/dev/pitchiq-data/kgap_fixed/kgap_table.md`)

| K, points | MLB | D1 | D2 | D3 | HS |
|---|---|---|---|---|---|
| fixed core sims: gap to target | −0.9 | +2.3 | +2.8 | +2.1 | +2.0 |
| 0. count layer's own K − target | −0.0 | +0.6 | +0.8 | +1.1 | −0.4 |
| a2. two-strike counts put back to the count layer | −3.2 | −1.6 | −1.8 | −1.5 | −2.2 |
| a3. whiff / swing put back, every count | −1.7 | −2.1 | −2.4 | −2.2 | −1.5 |
| a5. hidden hitter skill / timing (was −2.5 / −2.1 / −1.5 / −1.5 / −0.9) | −0.9 | −0.9 | −0.7 | −0.6 | −0.2 |
| a5. previous pitch + familiarity | −0.7 | −1.0 | −0.9 | −0.9 | −0.5 |
| K given two strikes, sims vs real | .483 / .421 | .433 / .400 | .412 / .379 | .390 / .365 | .481 / .442 |
| **(c) zone trend extension off** | – | −0.8 ± 0.4 | −1.2 ± 0.3 | −0.4 ± 0.3 | −2.3 ± 0.3 |
| **(d1) HS velocity table off** | – | – | – | – | −3.4 ± 0.3 |
| **(e) edge called strike set to real** | +2.7 ± 0.4 | +1.6 ± 0.4 | +1.7 ± 0.4 | +1.9 ± 0.4 | +2.9 ± 0.3 |

- **College:** about 0.4–0.6 of the gap is the PA definition (section 5), 0.1–0.5 recency, and the rest is still two-strike
  whiff per swing in the sims (K given two strikes 3–3.5 points high), of which the sim-only inputs (hitter spread, previous
  pitch, familiarity) carry about 1.5. Centering removed most of the hitter part.
- **HS:** the count layer is fine (row 0: −0.4); the miss is the sims' per-count rates (+2.6), mostly two-strike finishing (a2 −2.2; K given two strikes .481 vs .442) and whiff per swing (a3 −1.5). Still the biggest single lever is pitch choice: the real HS kind mix by count would take K down 3.2 (a6‴), and turning the velocity table off 3.4. The floor now binds in the calls, but the thrown fastball share sits .01–.09 under it at 1-0 / 2-0 / 3-0 / 3-1 / 3-2. The likely cause, not verified, is the shake-offs and coach overrides in simulate.py, which re-pick after the call. The hidden hitters now matter little at HS (a5 −0.3 in all).
- **Trend / edge re-measure (ruling 11, for Drew's ruling):** trend off would take K down 0.4–1.2 (college) and −2.3 ± 0.3 (HS);
  edge called strike at its real value would add 1.6–2.7 everywhere, so it still can't go in on its own.

## 7. Task 4: not run

Stopped by task 2's rule (a level missed). Not run: the 2025 scores vs raw v1.2 and the pass verdict, the candidate terms,
the hanger-gate grid, the hard checks / fuzz 3000 / robustness, the 400-game sims vs v1.2 (the pooled runner and its proof are
ready), the three-way read-through, the suite re-pin table (`stage2 D5` open), the goldens and changed-call list, and
`scripts/test-app.sh` / `test-sql.sh`. Checks that did run: `tests_v13_kgapfix.py` all pass (floor table / format /
arithmetic, Python = JS, every HS call meets the floor, other levels bit for bit, centered populations, weights exact).
`tests_v13_core.py` fails 6 checks, all pinned to earlier files or the pre-full-data core (file hashes, the app copy, D2 / D3
"v1.2 count layer", run file contents); 8 failed before these fixes too. The Step 6 script stays locked (`--drew-go`).

## Stop points for Drew
1. **K misses at D1 / D2 / D3 / HS after the fixes** (chain +1.5 / +1.8 / +1.7 / +2.5; sims +2.3 / +2.8 / +2.1 / +2.0).
   Candidates, from the table: the target's PA definition (≈ +0.4 college), the trend extension, and two-strike whiff.
2. **The PA-definition finding** (section 5): target on scored PAs, or bunts / IBB in the sims?
3. **The floor overriding the never-pick window** for the HS fastball (section 2): confirm that's the intent.
4. The trend / edge ruling (section 6).
5. Still waiting, unchanged: the 6 HS rows, HG-1 to HG-4, the 35 scenarios, the changed-call list, `stage2 D5`, the go for 2026.

## Summary
- Fixes 8–10 are built, each its own commit with its own paired sim: the HS floor (corrected so it binds at 2-2 / 3-2) takes HS
  K down 5.2 ± 0.3, centering 1.0–1.8 everywhere, the college reweighting 0.1–0.9 (D3 most).
- After pitcher-side recalibration K still misses by more than 1 point at D1 / D2 / D3 / HS (chain +1.5 / +1.8 / +1.7 / +2.5),
  so the run stopped before scoring; MLB sits 0.8 below.
- The chain itself is exact; part of the college gap is the target counting bunts / IBB / interference that the model never
  sees (+0.4), and the rest is two-strike whiff — Drew's calls on that, the trend / edge pieces and the floor's window override.
