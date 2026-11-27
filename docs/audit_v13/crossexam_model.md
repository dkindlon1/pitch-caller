# Cross-examination: baseball and model claims (PitchIQ V1.3 audit)

I re-ran or rebuilt every claim myself. Engines: V1.3 = `/home/claude/pitch-caller` (HEAD 8ba943f, which is c602f1c plus a
web JSON regeneration, so engine.py is unchanged). v1.2.3 = `/home/claude/audit/coach/main` (main 8bcf909). My scripts are in
`/home/claude/audit/cx/` (grid31.py, hot.py, nl.py, floor.py, floor2.py, sit.py). Each takes the repo path where it matters.
Nothing in the lead's checkout was edited, and the one script that writes (`hanger_gate_size.py`) wrote to `/tmp`.

## Verdicts

| # | Claim | Verdict | What is actually true |
|---|---|---|---|
| 1 | coach C3: read-through 94/98 drops to 85/98; A2 A6 C5 D6 E2 F5 F6 H4 I2 J7 newly fail; not ruled on | **CONFIRMED** (one correction) | Reproduced exactly, apples to apples. Correction: the build report *does* list the 85/98 and all 13 failing rows (Parts 3/4/6/9/11, e.g. l.471-473). Only the Part 12 readiness page leaves them out. No ruling grades or waives any of the 10 Drew-graded rows |
| 2 | coach C1: college 3-1 top type <50% (FB 42-44% vs 55-71%), breaking an owner HARD rule | **CONFIRMED numbers; "HARD rule" OVERSTATED as a v1.3 classification** | 4 of 6 college 3-1 cells read 42.3-43.5%. The R3 cells read 53.6 / 55.1, and HS sits pinned at 66.7 by the floor. The floor check fails in 11/18 college cells (lowest 37.4%). No v1.3 ruling relaxed the 55-70 / ≥50% bar, but none classes it as hard either: ruling 37's hard list is coach bans, mashed, fatigue/injury and A1/A2/A3 (A2 = no chase at 3-1). Ruling 44 filed all of tests.py as "history" without naming the grid. So this is an **unresolved owner question**, not a documented waiver and not a ruled hard rule |
| 3 | coach C2 / gameday G1: one "landing hot" step makes one pitch 94-100% in nearly every count at D1/D3, 3-0 included; new or worse in V1.3 | **CONFIRMED; "new" REFUTED; "worse" CONFIRMED at college only** | It is a cliff: slider 7/10 → about 30%, 8/10 → 94-100% at 0-0/1-1/2-0/2-1/3-0/3-1 (D1 and D3). **v1.2.3 does the same** (3-0 = 100%, 0-0 = 98-99%, mid counts 83-89%). V1.3 is 5-15 points worse in college mid counts and *better* at HS (33-55% vs 85-99%) only because the HS fastball floor caps it |
| 4 | stats S1: ≥98% of the college gain over raw v1.2 is reproduced by per-count recal; HS core is worse than recal by 0.012 | **CONFIRMED; the interpretation is fair, with two caveats** | Recal reproduces 98.8% (D1), 98.8% (D2) and 99.2% (D3) of the gain. HS core − recal = +0.01214 (SE 0.0005). Recal sees nothing the core doesn't: same fit seasons, same recency weights, same h3 world, raking to per-count margins only. Caveats: (a) Drew *knowingly* made raw v1.2 the bar and recal "reported only" (Nov 21 ruling 1, "No fixed 0.002 floor"), so "the pre-registered rule would have failed" is true but was overruled with open eyes. (b) At HS, recal is raked inside the harness world while the core's HS scalars were solved for a different world (real HS mix vs the harness's D3 Single-A mix; build l.431-433), so part of the +0.012 is world mismatch, not purely a worse model |
| 5 | saber S3: the HS pitch kind × velocity table double counts pitch class (fit on a count-only base, applied on top of the zone table's class terms) | **CONFIRMED (mechanism); the K-gap attribution is loosely stated** | `fit_count_hs.base_p6` (l.312-314) indexes `P6[count, outs, bases, side, late]`, with no kind or location. The multipliers are fit on that base (l.649-668). The engine applies them after the outcome bands, which already carry `whiff_os` SL/CB/CH +0.25/+0.20/+0.25 vs `whiff_fb` −0.2 (engine.py:1749, 2188-2197). Measured at HS 0-2: SL/FB whiff-per-pitch is 1.23 with pv off and 1.82 with pv on; the data multiplier ratio is 1.31/0.90 = 1.46, and 1.23 × 1.46 = 1.80. "26 vs 21" is tests.py's calib-chain K, while the "−3.4 K with the table off" is from sims. Both point the same way, but they are not one number. See the extra finding below |
| 6 | adversarial A1: hanger shipped at H=0 despite ruling 3; the not-landing slider gets aimed at the middle more | **Behaviour CONFIRMED (pre-existing in part); "despite ruling 3" OVERSTATED; A1's fix claim REFUTED** | Ruling 3: "H is sized by graded rows … and stays 0 if the rows pass without it." They don't pass at H=0 (HG-1b, HG-2 fail), and **no H passes**, so ruling 3 has no solution as written. H=0 rests on ruling 7's interim "H stays 0 for now", and this was never put back to Drew. My run of `hanger_gate_size.py --grid 0,1.0`: H=0 fails HG-1b and HG-2 (9.8%); **H=1 still fails HG-2 (7.4% > 5%), plus E2 and HG-1a**. So "H≈1 passes every row that depends on H" is false. Slider-middle when not landing, D3 2-2: 39 → 54% (V1.3), but v1.2.3, *with* its flat 0.5 hanger, also goes 27 → 39% |
| 7 | GT-2: the HS floor sets the FB share on about 63% of HS pitches and overrides landing (curve landing hot → 0.0-point move at two strikes) | **CONFIRMED for 63% and for 2-pitch arsenals; the "0.0" test was broken; OVERSTATED for 3-pitch** | 63% reproduced from GT's logs (316/503). The build's own grid agrees: 156/240 cells sit exactly at the floor (build l.1229). **GT's `hot_floor.py` never turned the read on.** It passes pitch_count 0 and a record holding only the off-speed pitch, so `hot_fade` = 0.00 and `coach_credit` = 0.0 (checked). With the read actually on (pitch 45, full record, fade 1.00): HS FB/CB curve moves +0.0 at 0-0/3-1/0-2/1-2/2-2/3-2 (pinned at 1 − floor), +8-10 at 1-1/2-1. HS AVG3 slider moves +12-20 at most counts and 0 at 3-2. Same input at D3 (no floor): +26 to +71 |
| 8 | GT-3: hitter's guess about uniform with <2 strikes; sit_* unfitted; exploitability about 0.35-0.5 runs/game | **CONFIRMED (spot-check); runs/game UNVERIFIED by me, and not new in V1.3** | `fit_v08.json` "ship" has no sit_* keys, so P08 keeps the spec guesses (engine.py:172). D1 and HS AVG3 at 0-0/1-1/2-0: H/Hmax 0.997-1.000, sit payoff spread 0.0014-0.0041 vs T 0.009-0.025. At 0-2: 0.98. At 3-2: 0.70-0.79. Per-pitch X is 0.0008-0.0076 runs, which matches GT's range. I did not redo the count-weighted runs/game. GT's own main-branch run gives v1.2.3 X ≈ 0.35-0.56, so this is not a V1.3 regression. And X is measured inside a model whose hitter coefficients are guesses, so it is not a real-world exploitability |

## Evidence (commands and key output)

**1. Read-through.** `diff -rq readthrough` between the two trees: only new v13 helper files differ. `scenarios.py`,
`scenarios_v12.json` and the .sha256 are identical, so same file and same grader. Then:
`python3 readthrough/scenarios.py --suite v12 --out /tmp/cx_rt_*.json` in each tree:
```
V1.3:   == v09: 85/98 scenarios pass   FAIL A2 53.5 | A6 66.7 | C5 61.2 | D6 65.5 | E2 66.4 | F5 not 10.3 | F6 66.8 | H4 62.0 | I2 60.8 | J7 65.5 | S6f | S7f | P7
v1.2.3: == v09: 94/98 scenarios pass   FAIL P2 P3 P5 P7 (all "proposed")
```
Row status from the JSON: the 10 rows read `graded (Drew, v1.0)`, and S6f/S7f/P7 read `proposed`. Every row ID I grepped in
DECISIONS_refit_v13.md belongs to another context (A2 as the 3-1 hard-rule name, C5 sizing the ride-up credit, J7 the E-7 credit). None grades or waives a failing row.

**2. 3-1 grid** (`cx/grid31.py <repo>`, through the repo's own `grid_v10.grid`/`checks`, AVG3):
```
V1.3  D3 empty 46.2/37.4/43.5  D3 R1 53.5/40.2/43.2  D3 R3 53.6/48.4/53.6  D1 empty 47.8/39.0/43.3  D1 R1 54.0/39.7/42.3  D1 R3 58.2/51.0/55.1
      HS all bases 66.7/58.3/66.7 (= fb_floor table)    FAIL 3-1 band (4 of 9 in 55-70)   FAIL floor: lowest 37%
v1.2.3 college 3-1 57.1-71.2, HS 55.3-66.0              PASS both
```
(Columns are 2-0 / 2-1 / 3-1, FB = the top type in every cell.) Note the build's college-guard table (build l.79-88) shows D1
*sim* 3-1 FB share at .65. That is an aggregate over sim staffs, and it hides the AVG3 failure.

**3. Hot read** (`cx/hot.py <repo> college_d1,college_d3,hs`, AVG3, pitch 45, FB 10/15; counts 0-0 1-1 2-0 2-1 3-0 3-1 0-2 1-2 3-2):
```
V1.3  D1 SL7/10 hot=False 34.8 30.7 27.4 36.2 12.2 29.9 38.6 40.5 49.3
V1.3  D1 SL8/10 hot=True  100  94.5 94.9 98.6 100  95.1 76.0 77.2 82.7   (hot=0: 36.4 33.1 30.8 39.2 16.2 33.9 ...)
V1.3  D3 SL8/10           100  96.6 94.1 100  100  95.1 80.2 84.3 91.5
V1.3  HS SL8/10           46.4 54.5 33.3 41.7 16.3 33.3 63.6 66.7 45.5
v1.2.3 D1 SL8/10          98.4 83.3 85.2 88.6 100  83.2 75.3 82.0 68.7
v1.2.3 D3 SL8/10          99.5 83.2 84.3 88.2 100  83.6 83.8 89.1 80.9
v1.2.3 HS SL8/10          99.1 86.1 84.8 89.0 100  84.1 90.0 96.6 95.2
```

**4. Recal** (`results/v13p13/scores_2025_tip.md`): D1 raw 1.4765 / recal 1.4464 / core 1.4460, core − recal −0.00037. D2 −0.00035.
D3 −0.00027. HS raw 1.4577 / recal 1.4416 / core 1.4537, core − recal +0.01214. `RecalAdapter` (harness_adapters.py:375-400) rakes the
base version's P6 and BIP to the fit seasons' per-count frequencies (`f.ev6_ctx`, the same `fs` as the core, the same
`recency_weight`). Run tables stay the base's.

**5. pv table** (`saber_work/check_pv.py`, re-run): `hs 0-2 pv=on … SL/FB 1.82` and `pv=off … 1.23`. 0-0 CH/FB is 1.71 with pv on and 1.20 with it off.
Kind multipliers at 0-2: Fastball whiff 0.90, Slider 1.31.

**6. Hanger** (`readthrough/hanger_gate_size.py --grid 0,1.0 --out /tmp/cx_hg.json`):
```
H=0: HG-1b NO (SL mid 0.100 vs 0.056), HG-2 NO (not 9.8% > 5%); E2 fails       H=1.0: fails E2, HG-1a (0.109 vs 0.111), HG-2 (7.4%)
smallest passing H on the grid: None
```
`cx/nl.py` (adversarial's arsenal, slider 0 of 12 vs 6 expected): V1.3 D3 2-2 mid 39.0 → 54.0, 1-1 14.7 → 32.3, D1 2-2 30.0 → 40.4.
v1.2.3: D3 2-2 26.6 → 39.3, D1 2-2 19.8 → 27.7. H=1 monkeypatch: D3 2-2 → 32.4 and 1-1 → 7.8, **but HS 1-1 goes 22.5 → 34.7 (the gate
raises slider-middle there)**.

**7. Floor** (`cx/floor2.py`): `hs FB/CB hot=True fade=1.00 … 0-2 Cu 63.6 -> 63.6, 1-2 66.7 -> 66.7, 2-2 60.0 -> 60.0, 3-2 45.5 -> 45.5`.
`hs AVG3 … 0-2 Sl 52.0 -> 63.6 (+11.7), 3-2 +0.0`. GT's setup: `0 {'Curveball': (7, 4.6, 8)} hot True fade 0.0 credit 0.0`.

**8. Sit game** (`cx/sit.py`): `college_d1 1-1: H/Hmax 0.999 spread 0.0041 T 0.0148 X 0.0021`, `hs 2-0: 1.000 … X 0.0010`, `hs 3-2: 0.695 … X 0.0076`.

## Important things every agent missed

1. **Fix ordering hazard: the HS floor is currently the only thing hiding the hot-read collapse at HS.** On v1.2.3 (no floor), HS
   goes to 85-100% slider on one 8/10 read. On V1.3, HS stays at 33-67%. Several agents propose softening or removing the floor
   (coach C5, GT-2 options a-c). Any of those, applied before C2/G1's cap on the hot read, would bring back 94-100% single-pitch mixes at HS.
   The fixes have to be sequenced: bound the hot read first.
2. **GT's landing-vs-floor numbers come from a test where the read was off** (`hot_fade` = 0). The HS conclusion survives (my
   corrected run), but GT's "D3 reaches 12 pts" is wrong by a factor of 4-6. With the read on, D3 moves +26 to +71, which is
   C2/G1's collapse. Don't quote GT's D3 numbers as evidence that the hot read is weak.
3. **The evidence for ruling 4 (the HS pv table, "+0.0123 nats") was measured on a kind-blind base.** `score_core.hs_pitch_terms`
   stacks the multipliers on `base_p6(core_nopv)`, which has no pitch-kind or location terms. So the reported gain never tested
   the table *on top of the engine's own class terms*, which is exactly the stack that ships. Saber's double count is a modelling
   error, and the number that justified the table is also not evidence for the engine as built.
4. **The "landing hot" behaviour, 3-0 = 100% slider, and most of the not-landing-middle effect are v1.2.3 behaviour that is live in
   production today.** Before the merge they are V1.3 regressions only in degree (college +5-15 pts hot; D3 2-2 middle 39 → 54 vs
   27 → 39). That changes the deploy argument: holding V1.3 does not protect coaches from these. Fixing them needs its own ruling on either branch.
5. **The 3-1 / hitter's-count failure is arsenal-specific, and the build's reassurance is an aggregate.** Build §3's college guard
   shows D1 sim 3-1 FB share at .65 ("inside the real range"). The AVG3 starter (changeup confidence .65) gets 42-43%, with the
   changeup middle out-ranking the slider. A coach's cold-start D3 arsenal hits it too (gameday G10). The aggregate number shouldn't be
   read as "college 3-1 is fine".
6. **Ruling 3 is unsatisfiable on this engine, and nobody told Drew.** No H on the grid passes all rows (E2 fails at every H, and it
   doesn't depend on H at all). The gate is also non-monotone at HS 1-1 (it *raises* slider-middle at H=1). The honest framing for Drew:
   "your rows conflict; pick which row gives way," not "size H to ~1".
7. **The proof bar mixes two different things.** Step 6's PASS is about the count layer (claim 4: about 99% per-count re-levelling). Every
   coaching regression above sits in the *call policy*: hot-read cliff, 3-1, the pv double count, hanger, floor. Step 6 is blind to all of them, and the
   graded read-through (the only call-level gate) went 94 → 85 with no ruling. The readiness page shows only the first.

## What I could not verify
- Count-weighted runs/game for GT-3's exploitability (I checked per-pitch X only), and GT-2's +0.42 runs/game floor cost.
- Whether a policy-layer fix (a hot-read cap, a college floor) leaves Step 6 untouched. I believe it does, because Step 6 scores h3
  tables built from adapters where "the engine's own calls and landing never enter" (mean_preserve.py:9-10), but I did not run it (it can't be re-run).
- The JS twin. All of my numbers come from the Python engine.
