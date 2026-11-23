# v1.3 K gap: diagnosis (REPORT ONLY; nothing wired)

Nov 23, 2026. Per Drew's Nov 22 (late) rulings and the Nov 23 follow-ups (DECISIONS_refit_v13.md items 1–5).
Nothing here changes the engine, tables or tests. The fixes at the end are **PROPOSED, not wired**. Still on hold:
the 400-game sims, the three-way read-through, the suite re-pin table, the D2 / D3 rescore and the edge called-strike
ruling.

Tools: `hitter_data/kgap_diag.py` (sims, probes, report, md, realkind, prove), `hitter_data/kgap_predict.py`
(real-data adaptation slope), `hitter_data/kgap_hsmix.py` (HS count layer rebuilt under the real HS mix). Outputs:
`C:/dev/pitchiq-data/kgap_diag/` (kgap_table.md / .json is the full generated table, copied to docs/KGAP_v13_TABLE.md, including the per-count
appendix).

Sizes: 480 paired games per level and variant (K SE about 0.3), and 900 for every HS variant. Variant rows are
variant − as built over the same seeds, with game-clustered SE.

## Bottom line

1. **The sims' K gap is almost entirely whiff per swing.** If whiff / swing goes back to the count layer in every
   count, K falls 3.3–3.5 points (MLB, college) and 6.2 (HS). Most of that is in two-strike counts. Swing rate, foul
   rate and called strikes barely contribute. Reaching two strikes is about right; finishing is not (K given two
   strikes: D1 .458 sim vs .404 real, HS .561 vs .442).
2. **College (D1 / D2 / D3, gap +3.8 to +4.4).** About 1 point is a target mismatch: the count layer's own K on
   full-game data is already above target (row 0, +0.9 / +0.9 / +1.5). The other ~3 points come from sim-only inputs
   the harness calibration never saw (row a5, −2.3 to −3.0). Most of that is the hidden hitters' skill and timing
   (−1.5 to −2.1), and within it the lineup's built-in −0.2 off-speed hole (row i: D1 −1.5). Engine pitch choice
   is **not** the college cause: replacing it with the harness mix moves K by +0.4 to +0.6, the wrong way.
3. **HS (gap +7.7).** The pitch_velo table applied after calibration is the dominant piece. Turning it off removes
   7.2 ± 0.3 points. Putting every pitcher at median speed removes only 0.5, so the cause is the table's **kind**
   multipliers, not the velocity spread. Those multipliers are neutral only over the real HS mix (81% fastballs at
   3-2), but the engine throws 21% fastballs at 3-2. Moving to the real HS mix removes 4.5 ± 0.5 (row a6‴).
   Rebalancing the count layer itself to the HS mix does nothing (row h, +0.3 ± 0.3), so the layer isn't the problem;
   applying the table on top of a different mix is.
4. **Hitter adaptation is about zero in real data.** Within each pitcher, whiff per swing does not fall as a pitch
   gets more predictable (slopes −0.006 to +0.008 per +1.0 usage share, SE 0.005–0.009). An adaptation term sized
   from data moves K by 0.0 at every level, even at its 95% bound. It can't be the fix.
5. **Off-speed command passes.** The world lands curves and sliders at 3-2 about as well as real HS pitchers do
   (CB .370 vs .371 ball, SL .341 vs .345). The low HS fastball share isn't being punished with extra balls.

## The table (K change in points; MLB is the control)

| K, points | MLB | D1 | D2 | D3 | HS |
|---|---|---|---|---|---|
| K target (real) | 22.4 | 19.3 | 17.0 | 16.2 | 21.0 |
| sims as built: K | 23.7 | 23.2 | 20.8 | 20.6 | 28.7 |
| **sims: gap to target** | **+1.3** | **+3.9** | **+3.8** | **+4.4** | **+7.7** |
| 0. count layer's own K (full-game data) − target | −0.0 | +0.9 | +0.9 | +1.5 | −0.4 |
| a. sims' per-count rates − count layer (chained) | +0.8 | +2.7 | +2.8 | +2.4 | +7.9 |
| a4. mixing over hitters / pitchers | +0.5 | +0.3 | +0.1 | +0.5 | +0.2 |
| a3. whiff / swing put back, every count | −3.3 | −3.4 | −3.5 | −3.4 | −6.2 |
| a2. two-strike counts put back | −4.4 | −2.6 | −2.6 | −2.4 | −6.1 |
| a5. sim-only inputs neutral, all at once | −3.2 | −3.0 | −2.3 | −2.3 | −1.5 |
| a5 of which: hidden hitter skill / timing | −2.5 | −2.1 | −1.5 | −1.5 | −0.9 |
| **i. lineup's off-speed hole centered** | **−1.9 ± 0.3** | **−1.5 ± 0.3** | – | – | **−1.0 ± 0.3** |
| **(a) a6. harness kind × target mix, real landing** | +1.3 ± 0.3 | +0.5 ± 0.2 | +0.4 ± 0.2 | +0.6 ± 0.2 | −2.6 ± 0.5 |
| a6‴. HS: real HS kind mix by count | – | – | – | – | −4.5 ± 0.5 |
| **h. HS count layer balanced to the real HS mix** | – | – | – | – | +0.3 ± 0.3 |
| a7. adaptation sized from real data (β; 95% bound) | 0.0; 0.0 | 0.0; 0.0 | 0.0; 0.0 | 0.0; 0.0 | 0.0; 0.0 |
| **(b) spots: real landing mix** | +0.0 ± 0.4 | +1.1 ± 0.4 | +0.7 ± 0.3 | +0.8 ± 0.3 | +1.1 ± 0.3 |
| **(c) zone trend extension off** | – | −1.1 ± 0.4 | −1.0 ± 0.3 | −1.4 ± 0.3 | −3.0 ± 0.3 |
| **(d1) HS velocity table off** | – | – | – | – | −7.2 ± 0.3 |
| **(d2) HS staff all at median speed** | – | – | – | – | −0.5 ± 0.3 |
| **(e) edge called strike set to real** | +2.9 ± 0.4 | +1.8 ± 0.4 | +1.5 ± 0.4 | +0.7 ± 0.3 | +2.0 ± 0.3 |

Rows 0 + a + a4 add up to the gap. Every other row replaces one piece. Those rows overlap, so they don't add up.

### Reading each piece

- **(a) Per-pitch rates vs the count mix.** The engine throws fewer fastballs than the harness at every level
  (D1 at 3-2: .39 vs .67; HS: .21 vs .67 harness and .81 real). For college this doesn't raise K: the harness mix
  would raise it a little. For HS it does, but only through the pitch_velo multipliers (see d).
- **(b) Engine spots vs the average landing.** The engine's spots *lower* K by about 1 point compared with the real
  landing mix (MLB 0). Spots aren't a cause; the gap would be about 1 point larger without them.
- **(c) Zone trend.** Turning the extension off removes 1.0–1.4 points (college) and 3.0 (HS). This is real, and it
  overlaps with (d) for HS.
- **(d) HS velocity.** The table, not the velocity spread (d1 −7.2 vs d2 −0.5). See the bottom line, item 3.
- **(e) Edge called strike.** The engine has one edge rate. Real Single-A 2025 is .922 inner half, .410 outer half,
  .630 overall (inner share of edge takes .43). The sims call .59–.60 (college), .50 (HS) and .32 (MLB, real .499).
  Setting it to real *raises* K by 0.7 to 2.9. So "edge to real" can't happen on its own: it would widen the gap
  unless the whiff fix lands first. This is input for the held edge ruling, not a ruling.
- **(f) v1.2's recalibration.** v1.2 landed K through hitter-side settings that ruling 5 now freezes. Resetting each
  to 0 raises K by 4.9–5.5 points for whiff in zone (`wz` / `wo`), 4.1–4.2 for called strike (`cs`), and 9.6–9.8 for
  all of them together, at MLB and D1. Its pitcher-side `wild` holds K down by 5.8 at HS and 2.1 at D1. v1.2.3 values:
  cmd −.64, cs −1.018, D1 wz −.78. In other words, v1.2 also paid for excess whiff with a whiff offset. v1.3 forbids
  that lever, which is why the gap shows here.

## Adaptation (Drew, Nov 23): sized from real data

Linear probability model of whiff per swing on the pitch's leave-one-out usage share (that pitcher × count), with
pitcher × kind and kind × count fixed effects. SE clustered by pitcher. Split-half IV uses pitcher × kind × half
fixed effects. Units: change in whiff per swing per +1.0 usage share.

| data | within pitcher | split-half IV | no pitcher FE (masked) |
|---|---|---|---|
| HS + travel (hs.sqlite3) | +0.008 ± 0.005 | +0.12 ± 0.08 | +0.11 to +0.13 |
| HS only | −0.027 ± 0.033 | weak instrument | |
| Statcast Single-A | +0.004 ± 0.009 | +0.004 ± 0.021 | |
| Statcast AAA | −0.002 ± 0.006 | −0.006 ± 0.012 | |
| Statcast MLB (control) | −0.006 ± 0.006 | −0.012 ± 0.011 | |

A predictable pitch would show a negative slope; none does. Without the pitcher fixed effect the slope is +0.11 to
+0.13: good-pitch pitchers throw their good pitch more, which is the masking Drew flagged. Two-strike-only slopes are
+0.03 to +0.05, and 0–1 strike slopes are slightly negative. Neither is large enough to matter: applied to the
engine's usage shift, it moves K by 0.0. HS min_pc_25 is not estimable (too few cells).

## HS mix and off-speed command (Drew, Nov 23)

- **a6 with the real HS mix:** −4.5 ± 0.5. That's 1.9 points more than the Single-A mix gives (−2.6), because real
  HS throws even more fastballs.
- **HS count layer balanced to the HS mix** (`kgap_hsmix.py`; the path reproduces the shipped row to 2.7e-14): the
  whiff offsets rise 0.05–0.14 logit, while swing and called strike fall. In the sims it nets to +0.3 ± 0.3 (row h).
  The layer's mix assumption isn't what's driving the gap.
- **Off-speed command** (full per-kind tables in kgap_table.md). World vs real ball rate per pitch:
  - HS 3-2: FB .329 vs .342, CB .370 vs .371, SL .341 vs .345.
  - HS overall: FB .404 vs .403, CB .466 vs .454, SL .434 vs .435, CH .507 vs .452 (CH is 2% of engine use).
  - Your measured figures (3-2: FB 35.1 / CB 38.6 / SL 36.0; overall FB 41.1 / CB 46.7 / SL 44.5 / CH 46.0) run
    about 1 point above mine. My denominator includes HBP rows and ball four. The world matches either within 1–2
    points.
  - In play is off in two places: HS breaking balls are low (.09 vs .12 overall), and college breaking balls at 3-2
    are high (.24–.26 vs .18–.20).

## PROPOSED fixes (not wired; sizes from the table)

1. **HS: make the pitch_velo table neutral over the mix the engine actually throws.** Either calibrate the HS count
   layer with the table on (fold it into calibration instead of applying it after), or renormalise its kind
   multipliers per count to the engine's realised kind mix. Size: up to the d1 row, −7.2 ± 0.3. Separately, the
   engine's HS fastball share (.21 at 3-2 vs .81 real) is a pitch-calling question for Drew; a6‴ sizes it at
   −4.5 ± 0.5. These two overlap and are not additive.
2. **All levels: calibrate against the population the sims play.** Run the harness calibration with the hidden-hitter
   skill / timing distribution and the centered off-speed hole, instead of a fixed subtraction. Size: a5 (MLB −3.2,
   D1 −3.0, D2 / D3 −2.3, HS −1.5), of which row i is the off-speed hole alone (MLB −1.9, D1 −1.5, HS −1.0).
   Centering the hole alone would overshoot the MLB control (+1.3 − 1.9 = −0.6), which is why the proposal is to
   recalibrate rather than subtract. That self-adjusts per level and keeps the ruling-5 hitter settings frozen.
3. **College: align the K target with the full-game population** (row 0: +0.9 / +0.9 / +1.5). The count layer
   already lands above target on its own data, before any sim input.
4. **Zone trend extension:** review it alongside fix 1 (c: −1.0 to −1.4 college, −3.0 HS; it overlaps with d).
5. **Not a fix:** an adaptation term (a7 = 0.0 from data) and the engine's spots (b: they lower K).
6. **Edge called strike:** sequence it after fixes 1–2. On its own, real edge rates add 0.7–2.9 points of K.

Expected residual if fixes 1–3 land as sized: college ≈ 0 to +1 (overlap makes this approximate), HS a point or two
either side. Each fix gets its own paired sim before anything is wired.

## Parallelism (Drew, Nov 23)

- **Machine:** Intel Core Ultra 9 275HX (24 cores), 63.4 GB RAM.
- **Pool:** dynamic, 22 workers (cores − 2), CHUNK 2. Memory guard at 48 GB used; it never had to hold back a worker
  (peak 35.6 GB, of which about 29 GB is background).
- **Worker cost:** about 40 MB each.
- **Determinism:** every game keeps its fixed seed.
  - `prove`: 6 games serial (454 s) vs pooled (103 s), 12 / 12 output files byte-identical.
  - Report: serial vs pooled output identical.
- **No overlap:** jobs ran back to back, with no two writing the same folder.
- **GPU:** RTX 5070 Ti at 0% and 14 MiB. The repo imports no torch, cuda or cupy.
