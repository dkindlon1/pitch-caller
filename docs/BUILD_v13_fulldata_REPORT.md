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

---

# Part 2 (Nov 24–25): per-count mean preservation, then the full-data run

Prompt: `docs/PROMPT_hitter_v13_meanpreserve_2026-11-24.md`. Rulings 12–15 in `docs/DECISIONS_refit_v13.md`.

| commit | what |
|---|---|
| 5045018 | rulings 12–15 recorded |
| 0831ffe | target fix: K / BB / HBP on the chain's PA definition (`pa_targets_v13.json`) |
| bd71234 | ruling 12: `mp_v13.json`, both engines, parity-tested |
| 2adf88e | ruling 14: the window outranks the floor; the coach's pitch floored too |
| 510e617 | task 2: pitcher keys fit BB, HBP and command only; mp re-solved |
| cf697a8 | sim speedup merged from `feat/sim-speed` (fast-forward); proof on this tip in section 7 |

**Stopped at task 3 (ruling 13): the calling edge is above +1.5 at D1, D2, D3 and HS.** Task 5 was not run. Step 6 stays
locked.

## 1. Target fix

Each target × the scored / all ratio from the level's own play-by-play (no sacrifices / bunt PAs, intentional walks or
interference, the harness's definition). K: MLB 22.42 → 22.64, D1 19.30 → 19.73, D2 17.05 → 17.46, D3 16.21 → 16.63,
HS 21.01 → 21.32. BB and HBP get the same treatment.

## 2. The scalar table and the proof

- `data_tables/mp_v13.json` (sha256 `bd9422cd…2e6f13`): per level and count, one logit shift each on swing,
  whiff | swing, foul | contact, called strike | take and ground ball | in play. The engines add it to the count table's
  row as they read it (`count_cells` / `countCells`). It is the same shift on every band, zone cell, kind and speed, and
  the count table is unchanged. `mp_v0.json` is all zeros (the engine before the ruling).
- Computed by `hitter_data/mean_preserve.py`, not tuned: a per-count Newton solve with a 5 × 5 Jacobian, no cap. The
  first per-term secant oscillated at HS 0-2 / 1-2, where the terms interact. Every file the solve read is hashed in the
  table, and the test fails if one changes.
- Reference worlds:
  - **College:** the harness's h3 (Single-A landing) and the weighted ship candidates.
  - **HS:** D3's h3 rows at real HS speeds, with kind groups set to real HS usage by count from hs.sqlite3, using the HS
    fit's games and weights.
  - **MLB:** D1's frozen rows with the MLB Statcast class × band landing and MLB Statcast per-count targets, 2021–25,
    half-life 2. The MLB count table was never calibrated to any world before.
- Shift sizes: college 0 (to 1e-6; the count table was already calibrated in exactly this world); HS up to +0.31 whiff,
  ±0.2 called strike; MLB up to +0.89 called strike, ±0.5 swing / whiff.
- **Proof** (`tests_v13_meanpreserve.py` 13/13, fresh process, shipped file): at all 12 counts × 5 outcomes the engine
  gives back the fitted count layer to ≤ 7e-12 (≤ 1e-8 sampling SE) at every level. Python = JS within 9e-14 on 300 cases
  and 24 calls.

## 3. Landing under the reference world (the gate, after recalibration): passes

| points, chain − target | MLB | D1 | D2 | D3 | HS |
|---|---|---|---|---|---|
| K | +0.12 | +0.03 | +0.27 | +0.36 | −0.90 |
| BB | +0.13 | +0.41 | −0.07 | −0.86 | +0.25 |
| HBP | −0.38 | +0.74 | +0.55 | +0.83 | +0.26 |

Recalibration (`core_recal --pitcher-only`, 3 passes): wild / cmd / hbp fit BB, HBP and command. **Proposed reading:**
"command" = the share of pitches in the rulebook zone, taken from the reference world (`command_targets_v13.json`:
44.9 / 38.8 / 38.9 / 38.8 / 40.3 %). In the engine's own calls BB and HBP land within 0.2. Zone stays high at college
(41.6 / 40.6 / 40.2 %) and MLB (46.8 %): cmd can't take it lower while BB is held.

## 4. Calling edge (ruling 13): engine-called sims, 480 games per level, 900 at HS (`docs/MP_v13_SIMS.md`)

| | MLB | D1 | D2 | D3 | HS |
|---|---|---|---|---|---|
| K sims (target) | 22.3 (22.6) | 21.3 (19.7) | 19.9 (17.5) | 18.3 (16.6) | 28.5 (21.3) |
| **calling edge** | **−0.3 ± 0.3** | **+1.6 ± 0.3** | **+2.5 ± 0.3** | **+1.7 ± 0.3** | **+7.2 ± 0.3** |
| BB − target | **+2.4** | **+2.1** | **+2.3** | **+1.9** | +0.6 |
| HBP − target | +0.0 | +0.4 | +0.4 | +0.8 | +0.4 |
| K vs the fixed core (paired) | +0.8 | −0.3 | +0.1 | −0.0 | +5.5 |

- **Above +1.5: D1, D2, D3, HS → stop for Drew's review.** Sim BB misses by 1.9–2.4 points at MLB and college. The exact
  calibration chain has BB on target, so the extra walks come from what only the sims carry (as before Part 2).
- **What drives the edge** (the sims' per-count rates put back to the count layer one count at a time): it sits in the
  two-strike counts.
  - **College:** 1-2, 0-2 and 2-2 carry 1.5–1.7 of the 1.5–1.9 chain gap. Whiff | swing runs 0.30 / 0.33 / 0.26
    against real 0.26 / 0.28 / 0.23 at D1; called strike | take runs ~0.01 high.
  - **HS:** 0-2 to 3-2 carry 6.2 of 7.9 points. Whiff | swing runs 0.40–0.44 against 0.27–0.30, and at 2-2 / 3-2 called
    strike | take runs 0.24 / 0.32 against 0.18 / 0.19. The HS jump vs the fixed core (+5.5) is ruling 14 (section 5)
    plus the HS scalars, which raise whiff by up to 0.31 because the real HS mix is fastball-heavy.

## 5. The floor after the never-pick fix (ruling 14)

| HS count | 0-0 | 1-0 | 2-0 | 3-0 | 0-1 | 1-1 | 2-1 | 3-1 | 0-2 | 1-2 | 2-2 | 3-2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| floor | .536 | .636 | .667 | .837 | .385 | .455 | .583 | .667 | .364 | .333 | .400 | .545 |
| thrown, where the final call allowed a fastball | .603 | .683 | .718 | .897 | .551 | .565 | .667 | .724 | .531 | .518 | .539 | .641 |
| thrown, all pitches | .553 | .618 | .638 | .761 | .534 | .544 | .591 | .625 | .407 | .326 | .284 | .257 |
| pitches where a fastball was allowed | .92 | .91 | .89 | .85 | .97 | .96 | .89 | .86 | .77 | .63 | .53 | .40 |

Where a fastball is allowed, the floor is met in every count. The window keeps it out on 47–60% of 2-2 / 3-2 pitches, so
the overall share there is .28 / .26. This is the main reason HS K rose. Coach overrides are floored too (`OVERRIDE` is 0
in these sims).

## 6. Trend / edge, for Drew's ruling (task 4, mean-preserved: scalars re-solved for each variant)

| K change (paired) | MLB | D1 | D2 | D3 | HS |
|---|---|---|---|---|---|
| zone trend extension off | – | +0.1 ± 0.3 | +0.1 ± 0.3 | +0.1 ± 0.3 | −0.7 ± 0.3 |
| … largest fastball-share / landing change in a count | – | 5.8 / 2.3 pts | 4.4 / 2.9 | 4.0 / 2.7 | 5.0 / 3.3 |
| edge called strike set to real | +1.3 ± 0.4 | +2.3 ± 0.4 | +1.2 ± 0.3 | +1.5 ± 0.3 | +2.8 ± 0.3 |

- **Trend:** as expected, it now reshapes calls without shifting K at college (HS −0.7).
- **Edge real can't be mean-preserved.** With the edge called strike fixed to real by count, called strike | take can
  only move on the off band, and the count layer's rate is out of reach (the solve overflows). With the other four
  outcomes pinned, called strike | take sits about 2 points above the count layer at college / MLB and 5.4 at HS. That is
  where its K comes from. (Scratch snapshot `C:/dev/pitchiq-data/kgap_mp/engine`; nothing in the tree.)

## 7. Sim speedup (merged; proof on this tip)

`feat/sim-speed` (1bc1cca engine.py, cf697a8 tools / tests) fast-forwarded onto 510e617, with no conflict. Proof: 20
seeded base games per level, before (510e617) vs after (cf697a8). **All 200 files (game JSON + pitch log) are
byte-identical.** 3.43× (MLB 3.28, D1 3.32, D2 3.27, D3 3.30, HS 4.13; `docs/SIM_SPEED_PROOF_mp.json`).
`tests_sim_speed.py` passes, `golden/fast.py 60` and `FAST_LEVEL=hs golden/fast.py 40` pass, and the v1.3 suites are
unchanged (table tests: the same 4 failures as before Part 2). Every run from here uses it. The Part 2 sims above ran
before the merge, on 510e617.

## 8. Task 5: not run (gate failed at task 3)

## Stop points for Drew (Part 2)

1. **Calling edge over +1.5 at D1 / D2 / D3 / HS** (+1.6 / +2.5 / +1.7 / +7.2), driven by two-strike whiff (and at HS,
   the window keeping fastballs out at 2-2 / 3-2). The graded rows to review are the two-strike HS / college calls.
2. **Sim BB 1.9–2.4 points high** at MLB / college (outside the 1-point bar).
3. **The trend / edge ruling** (section 6). Edge real isn't mean-preservable as built.
4. **"Command" read as the reference zone rate** (proposed). The zone can't reach it at college.
5. Still pending, unchanged: the pass bar per level, the graded rows, the changed-call list, `stage2 D5`, the go for 2026.

## Summary (Part 2)
- Mean preservation is built and proven: the reference world reproduces every level's count layer to 7e-12, both engines
  match, and the reference-world gate passes (K / BB / HBP within 1 point everywhere after the BB / HBP / command recal).
- In the engine's own calls K is above target by +1.6 / +2.5 / +1.7 at D1 / D2 / D3 and +7.2 at HS (two-strike whiff; at
  HS the never-pick window now beats the floor at 2-2 / 3-2), and sim BB is ~2 points high, so the run stopped at task 3.
- Trend off now reshapes calls without moving K; edge real still adds 1.2–2.8 and can't be mean-preserved. The 3.43×
  sim speedup is merged with 200 byte-identical games and used from here on.

---

# Part 3 (Nov 25): calling-edge rulings 16–19, then the held items

Prompt: `docs/PROMPT_hitter_v13_edge_rulings_2026-11-25.md`. Rulings 16–19 are recorded in `docs/DECISIONS_refit_v13.md`
as decided, with the rule classification. The count layer and the per-count scalars (`mp_v13.json`) are unchanged. 2026
was never read. The Step 6 script still refuses without `--drew-go` (exit 2; it has never run). Every grade here is
**proposed**.

| commit | what |
|---|---|
| 7b72080 | rulings 16–19 recorded; ruling 16 in both engines; the `refstaff` sim variant |
| cd1d530 | engine vs reference-staff summary, two-strike menus, goldens, changed-call list, task-4 checks |
| 75cccc7 | app/dist rebuilt, engine copied to web/lib |
| (this commit) | this section, 400-game sims, suite results |

**Compute.** Sims ran on 22 workers under the 48 GB guard (peak 36 GB), with fixed seeds, on the faster engine
(snapshot `C:/dev/pitchiq-data/edge16/engine` = 7b72080).

**Orphaned workers.** The 12 Python workers from 6:45 PM yesterday are orphans: their parent (PID 44792) is gone, and
they are idle at about 1.4 GB. **I couldn't end them**, because the permission check blocked `Stop-Process`. To end them:
`Stop-Process -Id (Get-CimInstance Win32_Process -Filter "ParentProcessId=44792").ProcessId`.

## 1. Ruling 16: how each rule is classified (proposed; full table in DECISIONS)

- **Hard: these outrank the floor.**
  - Shake-offs and the coach's "not that pitch".
  - The confidence cutoff and band (his trust in the pitch today).
  - The not-landing block.
  - The no-chase targets at 3-0, 3-1 and 2-2.
  - **Mashed** (a fastball target height he has hit hard twice today). In the engine it is a cost penalty, so for the floor
    it is now an explicit block: those calls are never counted toward the floor, raised or brought back.
  - Fatigue and injury limits don't exist as exclusions: fatigue lowers speed and grade inside the costs. Either would be
    hard if one is added.
- **Model-made: the floor outranks these.**
  - The pitch-type never-pick window and its taper.
  - The location window, which only picks *which* fastball spot gets the floor's share.
  - The tie-break and the 0.5% display cut, which both run before the floor.
- **How it works:** when the eligible fastball share is 0, the floor brings the fastball back at the floor share. This is
  e00cfe5's method, minus the hard rules.
- **Tests:** `tests_v13_kgapfix.py` all pass.
  - Python = JS on 44 floored calls and on 12 two-strike calls with mashed heights.
  - Every HS / travel call meets the floor.

## 2. HS after ruling 16 (900 engine-called games, seeds paired with Part 2)

| HS count | 0-0 | 1-0 | 2-0 | 3-0 | 0-1 | 1-1 | 2-1 | 3-1 | 0-2 | 1-2 | 2-2 | 3-2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| floor | .536 | .636 | .667 | .837 | .385 | .455 | .583 | .667 | .364 | .333 | .400 | .545 |
| thrown, all pitches | .566 | .622 | .645 | .755 | .550 | .568 | .604 | .629 | .491 | .449 | .475 | .521 |
| Part 2 (ruling 14) | .553 | .618 | .638 | .761 | .534 | .544 | .591 | .625 | .407 | .326 | .284 | .257 |
| pitches whose call allowed a fastball | .93 | .91 | .88 | .84 | 1.00 | .99 | .89 | .85 | .99 | .99 | .99 | .88 |

- **The floor now holds at two strikes:** 2-2 goes from .28 to .48 and 3-2 from .26 to .52.
  - The share stays under the floor only where a hard rule kept the fastball out (7–16% of pitches at 0-0 and the
    three-ball counts).
- **Paired vs Part 2:** K **−2.4 ± 0.3**, BB +0.3 ± 0.2, HBP −0.2 ± 0.1, runs per game +0.74 ± 0.19.
- **HS edge vs target:** K 26.1 against 21.3, so **+4.8** (it was +7.2). BB is 15.1 against 14.5.

## 3. Ruling 17: the engine against a paired reference staff (`docs/EDGE_v13_SIMS.md`)

How the reference staff works:
- Same staff, hitters, seeds and game loop (shake-offs included). 480 games per level, 900 at HS.
- Each pitch is drawn from the level's reference-world mix (kind group, target, landed band) for that count and side,
  and lands in the drawn band. This is the same world the gate and the scalars use.

| engine − reference, paired (per PA; runs per game) | MLB (control) | D1 | D2 | D3 | HS |
|---|---|---|---|---|---|
| K | −2.3 ± 0.4 | −0.2 ± 0.4 | +1.0 ± 0.4 | +0.5 ± 0.4 | **+6.3 ± 0.3** |
| BB | +2.9 ± 0.3 | +2.6 ± 0.3 | +2.9 ± 0.3 | +3.4 ± 0.3 | +1.3 ± 0.2 |
| HBP | +0.3 ± 0.1 | −0.3 ± 0.2 | +0.2 ± 0.2 | +0.3 ± 0.2 | +0.1 ± 0.1 |
| **runs per game** | **+0.00 ± 0.19** | **−0.15 ± 0.21** | **−0.18 ± 0.30** | **+0.20 ± 0.29** | **−1.55 ± 0.20** |
| runs, engine / reference | 4.54 / 4.54 | 5.90 / 6.05 | 7.65 / 7.83 | 8.34 / 8.14 | 7.41 / 8.96 |
| runs test (engine not higher) | **higher by 0.002** | pass | pass | **higher (+0.20, 0.7 SE)** | pass |
| K − target (the +1.5 flag, kept) | −0.3 | **+1.6** | **+2.5** | **+1.7** | **+4.8** |
| zone %: engine / reference / command target | 43.9 / 45.6 / 44.9 | 38.6 / 39.2 / 38.8 | 38.0 / 39.5 / 38.9 | 37.2 / 39.4 / 38.8 | 39.1 / 40.4 / 40.3 |

- **The reference staff also strikes out above target** against these hitters: D1 21.5, D2 18.9, D3 17.8 (about +2 at
  college); MLB 24.6 vs 22.6.
  - So most of college's old +1.5 edge is the sim world, not the calls. Against the reference staff the college K edge is
    −0.2 to +1.0.
- **The engine's real cost is walks:** +2.6 to +3.4 points at college / MLB.
  - The chain splits it over 0-0, 2-0, 3-1 and 3-2.
  - The engine's zone rate runs 1–2 points under the reference staff's, and swings are lower (3-2: .60–.67 vs .64–.71).
- **Runs:** level at MLB, D1 and D2 (all within 1 SE), 0.20 higher at D3 (0.7 SE), and 1.55 lower at HS, where the extra
  strikeouts outweigh the walks.
- **Where the K edge sits** (chain; the engine's rates put to the reference staff's one count at a time):
  - College: 0-2 and 1-2, +0.3 to +0.5 each. Whiff per swing there is .30–.33 vs .26–.31.
  - HS: the four two-strike counts carry +4.8 of +6.6. Whiff per swing is .33–.41 vs .27–.29, and called strike per take
    at 2-2 / 3-2 is .23 / .29 vs .16 / .18.

## 4. The two-strike rows behind the edge (DRAFT; grades proposed)

Menus come from `hitter_data/edge_rows.py` (`C:/dev/pitchiq-data/edge16/edge_rows.json`). Each one is the level's sim
starter in this spot:
- bases empty, 1 out, 3rd inning, tied, pitch 40;
- first look at the count, same-side hitter unless noted;
- college / MLB arsenal FB / SL / CH; HS = the data staff's q5 starter (FB 77 mph / SL / CH).

| row | count (level): why it's here | the engine's menu (top spots, %) | proposed grade |
|---|---|---|---|
| E-1 | 0-2 (D1): K +0.27 | CH down-away 26, FB down-away 19, SL down-away 15, SL middle 11, SL down-middle 10, SL chase 9 (chase 14, middle 11) | **Acceptable** (C1 expand; the slider middle is the arguable part) |
| E-2 | 1-2 (D1): K +0.38 | FB down-away 28, SL down-away 19, SL middle 14, SL down-middle 12, CH down-away 11, CH middle 10 (chase 0, middle 25) | **Arguable** (C3: no chase at all at 1-2; a quarter middle) |
| E-3 | 1-2 (D3): K +0.51, the largest college count | SL down-away 27, FB down-away 26, SL middle 17, SL down-middle 14, CH down-away 8, CH middle 7 (chase 0, middle 24) | **Arguable** (as E-2) |
| E-4 | 3-2 (D3): BB +0.45 | SL middle 64, FB down-middle 21, FB middle 15 | **Arguable** (C7 / C8: a strike, but a 64% slider-middle bet) |
| E-5 | 3-2 (MLB control): BB +0.65 | SL middle 27, SL down-middle 23, FB down-middle 19, CH middle 16, FB middle 14 | **Acceptable** (zone, mixed) |
| E-6 | 0-2 (HS): K +0.98 | FB chase 36 (the floor's share, all on one spot), SL down-away 16, SL down-middle 11, SL middle 11, SL chase 10 | **Acceptable** (C1: elevated fastball and the slider off the plate) |
| E-7 | 1-2 (HS): K +1.40, the largest HS count | same side: SL down-away 18, SL middle 16, SL down-middle 14, FB chase 12, FB down-away 11, FB up-away 10; opposite: **SL down-in 66**, FB chase 11 | **Acceptable** (same side); **Arguable** (opposite: two thirds on one spot) |
| E-8 | 2-2 (HS): K +1.28 | SL middle 35, SL down-middle 18, FB down-away 12, FB up-away 8, FB down-middle 7, FB middle 7 | **Acceptable** (A3 hard rule: zone pitches); the 35% slider middle is worth a look |
| E-9 | 3-2 (HS): K +1.10, BB −0.54 | **FB middle 55, SL middle 45** (both sides; the fastball sits exactly at the floor) | **Arguable** (every call middle; floor-driven) |

## 5. Task 4, run on this core

**2025 scores vs raw v1.2** (`C:/dev/pitchiq-data/fits/score_core_p3/scores.md`; h3 harness, B = 1000):
- The as-scored copy (fit ≤ 2024, fixes 8–10 in) was rebuilt and given its own scalars (`mp_v13_s2024.json`, solved to
  ≤ 7e-12).
- **All four levels pass:** D1 −0.0306 (SE 0.0008, z −39), D2 −0.0293 (0.0011, −27), D3 −0.0326 (0.0021, −16), HS −0.0040
  (0.0007, −5.5).
- **D2 / D3 now pass**, with their own count layers. So the Nov 22 explanation held: their failure was shared offsets on
  v1.2's count layer.
- **HS caveat:** HS scores 0.012 worse than recalibrated v1.2 on the table score. The HS scalars are solved for the real
  HS mix, but the harness asks every HS engine about D3's Single-A mix. The HS pitch kind × velocity terms add −0.0123
  on top (core with them vs v1.2: −0.0266 ± 0.0006).

**Candidate terms** (`fits/candidate_terms.md`; none wired, 2025 gain in nats per pitch):
- Times through the order, the previous pitch and scoring position clear 2 SE at every level.
- Platoon clears at D3 and HS.
- HS event format clears, and HS velocity vs his own norm clears (+0.00044 on top of the kind × velocity table).
- Late and close clears at D1 only.
- Base-out (the one wired term) gains +0.0003 at D1 / D2 / D3 and +0.00007 at HS.

**Hanger grid** (H = 0 to 5): no H passes, so H stays 0.
- E2 (a changeup that is landing) fails at every H.
- HG-1b and HG-2 fail up to H 0.75. From H 1 up, everything but E2 passes.
- The HG suite at H = 0 is 4/5 (HG-2: 0-2 curve middle 10%).

**Hard checks** (`results/v13p3/hard_checks_core.json`):
- Pass: hard foul = foul (0.0), hit hard twice (0%), no chase at 3-0 / 3-1 (0 of 180), no scouting (chase 0).
- Hit hard once: another call moves 11.5 points against the 5-point limit. It fails as written, as before.
- **Robustness fails.** The 2-2 top call moves **20.8** points at three calls (the recalibrated core moved 6.5, v1.2.3
  18.6). At 3-2 it moves 26.0 at three calls and 42.6 at six.

**Fuzz 3000** (`results/v13p3/fuzz_core.txt`):
- Better stuff is never worse: 3000/3000. The 2-for-10 rule: 145/150 (a number, not a gate).
- "Inside the never-pick windows" drops to 267/300 (from 279). That is ruling 16 by design.
- **New fail:** the HS fastball share against a hitter who crushes fastballs stays at 46→45% over 0–40 looks (the core
  went 49→36%). The floor holds it there, because that hitter read is soft, not a hard rule.

**400-game sims vs v1.2.3** (seeds 1001–1400, each release in its own sim world; `results/v13p3/sims400_paired.txt`):

| core − v1.2.3, runs per game (SE) | HS | D3 | D2 (vs v1.2.3 at D3) | D1 | MLB |
|---|---|---|---|---|---|
| runs | −3.83 (0.26) | −0.37 (0.33) | −0.85 (0.33) | −0.37 (0.25) | **+0.36 (0.21), flagged** |
| K / BB, v1.2.3 → core | 20.7 → 33.9 / 17.2 → 14.2 | 15.9 → 18.6 / 14.9 → 14.0 | 15.9 → 19.8 / 14.9 → 13.5 | 18.9 → 21.1 / 14.2 → 13.1 | 20.3 → 22.2 / 11.1 → 10.5 |

- MLB is flagged again, with HR per PA 2.4% → 3.3% (the refit's MLB world, as in the core report).
- At HS this runner uses the simulator's default 86 / 89 mph staff, not the HS data staff the sims in sections 2–3 use. So
  HS K 33.9 is that fast staff's number, not the HS calling edge.

**Three-way read-through:**
- As built **85/98**; refit zone table swapped back 91/98; flat hanger restored 86/98 (v1.2.3 94).
- Failing as built: A2, A6, C5, D6, E2, F5, F6, H4, I2, J7, S6f, S7f, P7. No hard-rule row has a Not-acceptable share.
- Switching off the floor alone, or the scalars alone, still gives 85.
- The swap-back gain is in the zone cells. The trend extension stays (ruling 18).

**Goldens and the changed-call list** (`docs/P3_v13_CHANGED_CALLS.md`):
- `golden_v13core` is regenerated on this engine.
- Against v1.2.3: golden **125/250** changed (65 college / MLB, **60 HS / travel**), and 55/98 read-through rows.
- **Floor-driven** (the floor off alone moves the call back): **24 HS golden cases** and 1 row. Mean preservation drives
  13 + 12 golden cases.

**Suites** (logs in `C:/dev/pitchiq-data/p3/suites/`). Each was run alone, in a keep-going copy (`set -uo` instead of
`set -euo`) so that every suite reports.
- **`scripts/test-sql.sh`:** 15/15 pass.
- **`scripts/test-app.sh`:** 50 of 68 suites pass. The build, `app/dist`, the `web/lib` copies, smoke, golden_v13core
  and every UI e2e except the two below all pass.

The re-pin table. **No re-pins are applied.** The explained ones would freeze calls that Drew hasn't graded yet, so they
wait for the grading (proposed).

| suite (failed checks) | what moved | explained by an approved change? |
|---|---|---|
| tests.py (7) | realism: D3 K 17.9 vs 16.2, HS K 26.3 vs 21.0; v1.0 grid D1 3-1 (2); the 3-1 slider landing row; LAND_GAIN; coaching read "squared up"; exact v1.0 | realism = the open calling edge (ruling 17). Grid / landing / squared-up as in the core report. Exact v1.0 is history. |
| tests_v11 (2) | exact v1.0; **Q4: HS riding four-seam up 36.4% of two-strike calls (cap 36)** | Q4 is **new and floor-driven** (ruling 16); for Drew |
| tests_v12 (3) | exact v1.1 (2); S5 | history; S5 as in the core report |
| tests_v12b (1) | the hitter-fit coefficient pin (results/v12) | pinned to the old fit: yes (refit) |
| tests_v121 / v122 / v123 (1 / 3 / 1) | bit for bit vs v1.2 / v1.2.1 / v1.2.2 commits | history (v1.3 numbers are in) |
| tests_v13_d2 (4), d2_e2e (1) | PLACEHOLDER_D2: D2 = D3 | obsolete: D2 has its own count layer and run values (Nov 22 rulings 1 and 10) |
| tests_v13_sim (4) | no traits = e202169's games byte for byte | pinned to an older engine: yes |
| tests_v13_core (7) | frozen shas / defaults (now with `mp` v13); D2 / D3 "v1.2 count layer"; run_v13core contents; count / run switch-off | yes: rulings 1, 10 and 12, fixes 8–10 |
| tests_v13_tables (4) | v13refit bit for bit (Python / JS, difference inf); run-file D1 1-1 ranking; D2 placeholders | yes: v13refit runs under the default `mp` v13 (needs `mp` v0, ruling 12); D2 obsolete. The D1 1-1 probe should be re-pointed. |
| golden_v123 (1) | the v1.2.3 reference | history (expected) |
| **stage2_test (2)** | noise-chasing learner off 27/40 (needs ≥ 32); **real learner off 2/40 = `stage2 D5`** | **D5 stays open**; 27/40 is new (the recalibrated core had 32), so **not explained** |
| **worlds_test (1)** | trait recovery: power biased at 400 PAs (3.49 vs 1.5) | **not explained**; new |
| **game_mix_e2e (1)** | 4 of 21 games have a top pitch over 70% (limit 3) | **not explained**; likely the floor (HS fastball share up) |
| logging_exact (1), drift_exact (5) | event counts vs an older build | pinned to an older engine's outputs (as before) |

## 6. Zone-rate gap (ruling 19; reported, not a gate)
Engine minus the command target: MLB −1.0, D1 −0.2, D2 −0.9, D3 −1.6, HS −1.2. It is now low everywhere; in Part 2,
college was high. The reference staff lands 0.4–0.7 over target, because its bands are drawn as real.

## Stop points for Drew (Part 3), all graded together
1. **The two-strike edge rows E-1 to E-9** (section 4), and the hard / model split in DECISIONS ruling 16.
2. The 6 HS rows, HG-1 to HG-4 and the 35 scenarios.
3. The changed-call list: 125 golden cases, 24 of them floor-driven.
4. **Runs higher than the reference staff:**
   - **D3: +0.20 ± 0.29** (0.7 SE), so the runs test fails on the point estimate;
   - MLB: +0.002 ± 0.19 (a tie).
5. Levels failing the pass bar: **none**. All four pass 2025.
6. `stage2 D5`.
7. **New findings:**
   - robustness at 2-2 / 3-2 (20.8 / 26.0 points);
   - the floor overrides the fastball-crusher read at HS (should a strong read count as a hard rule?);
   - sim walks run +2.6 to +3.4 points above the reference staff;
   - MLB +0.36 runs per game vs v1.2.3;
   - the unexplained suite moves: stage2 noise learner 27/40, worlds_test power bias, game_mix 4 games over 70%, and Q4
     HS 36.4%.
8. The go for 2026.

## Summary (Part 3)
- Ruling 16 is built and tested: only hard rules (shake-offs, trust, not landing, no-chase targets, mashed) beat the HS
  floor. The fastball now meets it at 2-2 / 3-2, and HS K drops 2.4 points (edge vs target +4.8).
- Against a paired reference staff, the engine allows the same runs at MLB / D1 / D2, 1.55 fewer at HS and 0.20 more at D3
  (0.7 SE). Its strikeout edge is real only at HS; college's +1.5 flag is mostly the sim world. Walks run about 3 points
  high.
- All four levels pass 2025. Waiting on Drew: rows E-1 to E-9 and the standing grading list, D3's runs, the robustness and
  fastball-crusher findings, and the go for 2026.
