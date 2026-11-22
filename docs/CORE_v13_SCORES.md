# v1.3 core: scores, extra terms, hanger gate, hard checks and sims (Task C steps 1-5, Nov 22)

Task C of `docs/PROMPT_hitter_v13_apply_2026-11-21.md` on `feat/hitter-v13-core`. **Everything graded here is PROPOSED
(Claude). Nothing ships. 2026 was never loaded.** Data and raw outputs are outside git (`C:/dev/pitchiq-data/`).

The core = this branch's engine at its defaults: `zone_v13` (approved, ruling 2; hanger gate H = 0), `count_v13core` /
`run_v13core` (D1 and HS / travel: the PROVISIONAL count / run candidates; **D2 / D3: v1.2's count layer, pending the
coverage rule**), the HS pitch kind x velocity table (ruling 4). Raw v1.2 = the v1.2.3 release engine (`git archive main`).

## 1. Scores on 2025 (ruling 1)

Command: `python -m hitter_data.score_core --build-s2024` then `python -m hitter_data.score_core --all --v123-dir <dir>`
(139 s after the season caches; output `C:/dev/pitchiq-data/fits/score_core/scores.{json,md}`, log `run.log`).

**How it is scored.**
- Harness h3 (`h3-singleA-2026-11-22`: the calib world's pitchers, pitches and targets, landing re-frozen to Single-A's
  class x band shares). Primary metric `pitch_5way`, log loss per pitch. SE = the largest of the game / home-team /
  two-team bootstrap SEs (B = 1,000). HS / travel: every engine is asked about the D3 Single-A mix (the harness has no HS
  pitcher world), as `fit_count_hs` does.
- **Out of sample.** The core's D1 and HS count layers ship from candidates fit through 2025. The harness refuses to score
  a table on a season it was fit on, so the core is scored as its **"as scored" copy**: the identical build
  (`export_candidates.run_core`, now with `thru=2024`) from the `*_thru2024` candidates, the HS pitch table refit through
  2024 and run values through 2024 (`fits/candidates/count_v13core_s2024.json`, `run_v13core_s2024.json`; fresh-process
  calibration error 0.00000 D1 / 0.00001 HS). D2 / D3 contain no college fit.
- Two engines can't share a Python process, so each engine's harness tables are built in its own process and scored
  paired in one (`hitter_data/score_core.py`). Check: raw v1.2 under the calib world scores D1 2025 at 1.4668, the same as
  the harness baseline in FITS_COUNT_v13 section 10.

| Level | 2025 games / pitches | raw v1.2 | recalibrated v1.2 (reported only) | core | core - raw v1.2 (SE) | z | ruling 1 |
|---|---|---|---|---|---|---|---|
| D1 | 6,210 / 1,870,362 | 1.4765 | 1.4464 | **1.4461** | **-0.03046 (0.00081)** | -37.6 | **PASS** |
| D2 (v1.2 count layer) | 736 / 196,302 | 1.4730 (v1.2@D3, the better setting; @D1 1.4731) | 1.4438 | **1.4661** | **-0.00685 (0.00089)** | -7.7 | **PASS** |
| D3 (v1.2 count layer) | 220 / 63,488 | 1.4785 | 1.4440 | **1.4704** | **-0.00816 (0.00105)** | -7.8 | **PASS** |
| HS / travel | 2,456 / 515,407 | 1.4596 | 1.4427 | **1.4502** | **-0.00937 (0.00088)** | -10.7 | **PASS** |

- **Build caveat:** this is the core before any pitcher-side level recalibration (`fit_all.py` was not rerun after the
  zone table and count layer; section 6: K realism fails at every level). HARNESS_v13 section 5 says the build to score
  is the one after it, so these numbers will move when it is done.
- D2 vs v1.2 at D1 settings: -0.00701 (0.00061), also a pass.
- Core vs recalibrated v1.2 (reported, not the bar): D1 -0.00032 (0.00004); D2 +0.0223, D3 +0.0264 (v1.2's count layer
  is not recalibrated to college); HS +0.0075 (see the HS note).
- **D2 / D3** gain only from the refit's called-strike kappas and zone_v13 (all of it is in called strike given a take:
  D2 -0.0148, D3 -0.0162). Their score will move when their count layer lands.
- **HS note.** The harness asks the HS engine about the frozen college arsenal (fastballs 86 / 89 mph), so the pitch kind
  x velocity table fires on velocities HS pitchers rarely throw and lands the harness's "average pitch" off the count
  layer. Without the table the HS core scores 1.4427 (core - raw v1.2 = **-0.01689 (0.00063)**). The table's real test is
  per pitch, with the data's own kind and speed: fit through 2024 on top of the core's HS table and scored on 2025 it
  gains **+0.01066 (0.00051)** nats per pitch; core + table per pitch - raw v1.2 = **-0.02755 (0.00079)**.
- Secondary metrics, core - raw v1.2 (SE): pa_5way D1 -0.0101 (0.0010), D2 +0.0003, D3 +0.0008, HS +0.0168 (0.0016, the
  HS note); **bip_type_outs D1 +0.0351 (0.0036)** and bip_result D1 +0.0184 (0.0008) are worse. Probable cause (not isolated):
  the D1 candidate's `bip_gb` (+1.0 to +1.4 logit, from scorer words with imputed hit types, FITS_COUNT 13 "least
  trustworthy") is wired in the core.
  HS bip_type_outs improves (-0.0543).

**Calib-world side report** (the h2 landing, v1.2's own world; core - raw v1.2 in the same world):

| Level | reference | core - reference (SE) | verdict |
|---|---|---|---|
| D1 | v1.2 | -0.01603 (0.00069) | PASS |
| D2 | v1.2@D3 | -0.00604 (0.00101) | PASS |
| D3 | v1.2 | -0.00773 (0.00120) | PASS |
| HS | v1.2 | -0.00002 (0.00084) | FAIL (the HS note applies doubly: college arsenal and calib landing) |

Part of the h3 margin is v1.2 being scored outside the world it was calibrated in: raw v1.2 D1 is 1.4765 under h3 vs
1.4668 under h2.

### The recalibration / zone-shape issue (reported, not tuned)

Known-truth check on Single-A 2025 (`python -m hitter_data.harness_truth`, D1 settings; rates by band, real pitch
weights; `C:/dev/pitchiq-data/harness/truth_h3_core_2026-11-22.txt`):

| Band (swing / whiff per swing / called strike per take) | real Single-A | refit engine (zone_v13refit) | zone_v13 + refit count | **core** | core, recalibrated per count |
|---|---|---|---|---|---|
| heart | .756 / .126 / .998 | .723 / .110 / .980 | .638 / .175 / .980 | **.645 / .142 / .980** | .685 / .159 / .977 |
| edge | .555 / .231 / .630 | .494 / .238 / .324 | .491 / .253 / .323 | **.505 / .205 / .532** | .542 / .226 / .502 |
| off | .284 / .499 / .022 | .256 / .498 / .033 | .292 / .438 / .033 | **.316 / .365 / .080** | .342 / .389 / .070 |
| way off | .090 / .856 / .001 | .046 / .663 / .000 | .115 / .639 / .000 | **.134 / .564 / .000** | .150 / .583 / .000 |
| log loss given count + class + band | 1.1109 (truth) | 1.1719 | 1.1770 | **1.1511** | 1.1453 |

- **Does it distort the scores? Not the verdicts.** Ruling 1's bar is raw v1.2, which is never recalibrated. The core's own
  count layer is calibrated per count (one offset per count, added to every band) to the fitted per-count rates under the
  same h3 landing, so its count-only score is close to per-count frequencies plus base-out (D1: core 1.4461 vs
  base_count 1.4464 / base_count_bo 1.4454). The harness can't see zone shape, so a zone-shape error neither helps nor
  hurts these numbers. **It is invisible to them, not absent.**
- **The zone shape itself.** With zone_v13 the engine's heart vs chase swing contrast is compressed at D1 settings: heart
  swing .645 (real .756; the refit's zone .723), chase .316 (.284), way-off .134 (.090), chase whiff per swing .365 (.499).
  Heart / off swing ratio 2.0 vs real 2.7 (refit zone 2.8). Even Single-A's own cells (level trend removed) give heart
  swing .652 at D1 settings, so it is not only the college trend step. The edge called strike moved toward real (.324 ->
  .532 vs .630) with the core's called-strike offsets.
- **Where it shows: the calls.** Fewer swings at heart pitches make the middle a cheap strike, and with the flat hanger
  gone nothing prices an off-speed pitch over the middle. The read-through drops from 95/98 (refit) to **79/98**; all 16
  lost rows fail on off-speed middle shares (e.g. C5 0-2 curve middle 5% -> 34%, A2 3-1 off-speed middle 27% -> 54%,
  E2 2-0 changeup middle 22% -> 41%). Switch-offs: zone_v13 -> zone_v13refit gives 95/98; zone_v13 with the flat +0.5
  hanger put back gives 86/98 (with the +0.2 chase too, 85/98); count / run off 80/98; HS table off 80/98. So about 7 of
  the 16 come from removing the flat hanger, the rest from the zone cells. Part of the lower heart swing may be the level
  (college vs Single-A truth), but the ratio is the shape.

## 2. Extra terms beyond the count layer (ruling 1: each ships only if > 2 SE on 2025 and Drew's graded rows pass)

Gains in nats per pitch on 2025 (positive = better), SE = the largest clustered SE. "Wired" = in the core engine.

| Term | Wired? | D1 | D2 (THIN) | D3 (THIN) | HS / travel | Read-through rows it touches |
|---|---|---|---|---|---|---|
| base-out (swing by base-out state, `swing_base_out`) | **yes** (D1, HS; D2 / D3 have v1.2's zeros) | **+0.00030 (0.00003)** clears | n/a | n/a | **+0.00004 (0.00001)** clears | D10, J3 (both HS; total variation 0.3 / 1.2 points; pass either way). The suite has no D1 rows |
| times through the order (smooth curve) | no (fit only) | +0.00067 (0.00005) clears | +0.00091 (0.00016) clears | +0.00066 (0.00030) clears | +0.00066 (0.00010) clears | not wired: none |
| scoring position | no | +0.00029 (0.00003) clears | +0.00031 (0.00008) clears | +0.00002 (0.00008) | +0.00011 (0.00004) clears | none |
| late and close | no | +0.00004 (0.00002) | -0.00001 (0.00003) | +0.00008 (0.00009) | +0.00003 (0.00002) | none |
| in-at-bat / previous pitch | no | +0.00086 (0.00006) clears | +0.00078 (0.00019) clears | +0.00056 (0.00029) (1.96 SE) | +0.00132 (0.00012) clears | none |
| platoon (known-hand pitches only) | no | +0.00010 (0.00007) | +0.00105 (0.00056) | +0.00045 (0.00114) | +0.00022 (0.00005) clears | none |
| HS pitch kind x velocity | **yes** (ruling 4, HS only) | | | | **+0.01066 (0.00051)** clears | every HS row moves: A6 (HS 3-1 two-pitch: total variation 34 points, fails with it, passes without), J3 25, E8 19, D10 19, G4 16 (top call changes), B8 1; 20 HS golden top calls |

- Base-out: core vs the core with `swing_base_out` zeroed, in the harness (`score_core`, config `core_nobo`). The engine
  carries only the swing part; the full count x base-out table is worth about 0.0010 at D1 (base_count_bo - base_count).
- Times through, scoring position, late and close, previous pitch: `C:/dev/pitchiq-data/fits/situation_effects.json`
  (FITS_TRAITS_v13 section 2, gain of count + term over count only; the JSON's current values). Platoon: FITS_COUNT_v13
  sections 7 and 12.3. These fitted terms are not in the engine (v1.2's own times-through, platoon and setup terms are
  unchanged), so no call moves with them. **None is wired, and none ships until Drew grades its rows.**
- HS pitch table: section 1's per-pitch test. The rows are from the switch-off read-through (count file without
  `pitch_velo`; total variation of the call mix in points).

## 3. Sizing the hanger gate H (ruling 3)

Rows: the gated rows A5, B7, E2, C7, D3, B8, E8 and controls E1, E3, A4 (`scenarios_v12.json`), plus HG-1 to HG-4,
**drafted PROPOSED** in `readthrough/scenarios_hg_v13.json` (sha256 in `scenarios_hg_v13.sha256`; same format, graded by
`scenarios.py --suite hg_v13`; the rules that compare two runs are each row's `relation`, checked by
`readthrough/hanger_gate_size.py`):

| Row (PROPOSED) | Situation | Rule (section 4) |
|---|---|---|
| HG-1a | 1-1, slider landing normally (5 of 9: wild_today +0.014) | slider middle stays acceptable, at no less than its H = 0 (zone-table-only) share |
| HG-1b | 1-1, the same slider 2 of 9 (wild_today +0.200) | slider middle at most half of HG-1a's at the same H |
| HG-2 | 0-2, four-pitch, curve 1 of 8 (+0.234) | curve middle not acceptable; curve chase and down acceptable |
| HG-3 | 0-0, changeup landing normally (5 of 8: -0.023) | changeup middle acceptable; a control: its share equal to H = 0 |
| HG-4 | HS two-pitch, 3-2, curve 3 of 10 (+0.168) | curve middle not acceptable; fastball zone acceptable |

Each H is run in a fresh process on a scratch copy of zone_v13 with `class.hanger_gate` = H
(`python3 readthrough/hanger_gate_size.py`; `results/v13core/hanger_gate_size.json`, `hanger_gate_size_wide.json`).

| H | gated rows failing | controls (off-speed share vs H = 0) | HG rows failing |
|---|---|---|---|
| 0 | E2 (acceptable 59.1%), D3 (66.3%) | E1 .926, E3 .924, A4 .899: kept | HG-1b (SL middle .280 vs half of .176), HG-2 (not 9.6%) |
| 0.1 / 0.2 | E2, D3 | kept | HG-1b (.277 / .274), HG-2 (9.4 / 9.2%) |
| 0.3 / 0.4 / 0.5 | E2, D3 (66.0 / 66.0 / 65.9%) | kept | HG-1a (.175 < .176), HG-1b (.270 / .267 / .263), HG-2 (9.0 / 8.9 / 8.7%) |
| 0.75 / 1.0 | E2, D3 (65.7 / 65.5%) | kept | HG-1a, HG-1b (.255 / .246), HG-2 (8.6 / 8.5%) |
| 1.5 / 2 / 3 / 5 | E2, D3 (65.1 / 64.7 / 64.2 / 63.8%) | kept | HG-1a, HG-1b (.230 / .216 / .154 / .118), HG-2 (8.3 / 7.7 / 6.7 / 7.8%) |

**Result: no H passes, at any size tried (up to 5). H stays 0** (the default is unchanged; no commit to the zone file).
- E2 and D3 fail for reasons the gate can't reach: E2's off-speed is a changeup landing normally (changeup middle 41% at
  2-0, wild_today 0); D3 fails on fastball middle / down-middle shares, and the gate makes it worse by taking slider
  middle (acceptable there) away.
- B8 and HG-4 (HS, curve 3 of 10) already pass at H = 0: the curve isn't called at all (HG-4 is 100% fastball middle).
  A5, B7, C7 pass at H = 0: the not-landing changeup is never called.
- HG-1b: the slider's middle share **rises** when it isn't landing (.176 -> .280): a pitch that isn't landing is aimed at
  the middle so it lands. H = 1 brings it to .246; it would need H of about 3-5 to reach half.
- HG-2: curve middle 9.6% at 0-2 barely responds (8.5% at H = 1, 7.8% at H = 5): at 0-2 the call is about strikes and
  whiffs, not hard contact.
- E8 (HS 1-2, curve 0 of 4) passes but carries 41% curve middle (38% at H = 1): the hanger case the gate was meant for.
- **Double counting.** "Not landing" already makes the pitch wilder (fewer strikes, more balls), and the engine answers by
  aiming it at the middle. The gate then prices the middle it was sent to. On these rows the wildness term moves calls far
  more than any H; the gate adds little at any size and costs HG-1a (the landing slider) from H = 0.3.
- Controls never move: their wild_today is negative (landing well), so the gate is exactly 0 there.

## 4. Standing hard checks, robustness and the read-through (the core)

`readthrough/hard_checks_v13.py` (rows built as in SCENARIOS_v13_DRAFT.md; run on the core and on `git archive main`):

| Check | v1.2.3 | core |
|---|---|---|
| Hard foul = foul (H13-11: total variation, limit 1 point) | 0.0 | **0.0** pass |
| Hit hard once (H13-15: FB up-in drop; largest other move; limit 5 / 5 points) | 0.7 / 13.4: other calls move | **-0.3 / 10.8**: FB up-in doesn't drop; other calls move 10.8 (fail as written) |
| Hit hard twice (H13-15: FB up-in at most 2%) | 0.0% | **0.0%** pass |
| No chase at 3-0 / 3-1 (180 cells: 10 arsenals x hs / D3 / D1 x empty / R1 / R3) | 0 | **0** pass; H13-30 (D1 3-1, R1): FB middle 50% (v1.2.3 88%) |
| No scouting, first pitch (H13-28, D3 0-0) / HS 1-1 (H13-29) | CH middle 23% / CB middle 26%; chase 0 | **FB middle 18% / CB middle 29%**; chase 0 |
| Better stuff never worse (fuzz 3000) | 3000/3000 (REFIT_v13) | **3000/3000** pass (4 tiny reversals under 0.002 runs) |
| 2-for-10 (fuzz, report only) | 144/150 (REFIT_v13) | **145/150** (FAIL as always; e.g. Fastball 1-2 mlb 42% landing vs 46% not) |
| No-scouting full games (12 simulated games per level, checker's wrong-call share; section 5) | HS 3.1 / D3 1.9 / D1 1.4 / MLB 0.6% | **HS 2.7 / D3 2.0 / D1 2.7 / MLB 1.7%** (inside the matrix's overall 0.8-4.5%) |

Other fuzz rows (`fuzz.py 3000 300`, `results/v13core/fuzz_core.txt`, 56 min): 24/29. The same failures as the refit:
never-pick windows 279/300, trust line 236/300, college_d3 "fastball hole barely moves on thin evidence" (48 -> 55%),
the changeup-confidence row; no chase at 3-0 / 3-1 60/60.

**10-point adaptation robustness** (plan 5.2; H13-16: 2-2, 19 faced, pitch count 70; the no-history top call called n
times in this count today):

| Count | engine | no-history top call | move at 3 calls | largest move, n = 0-6 |
|---|---|---|---|---|
| 2-2 | v1.2.3 | SL middle 25.6% | **18.6** (reproduces the draft) | 25.6 (gone at 5) |
| 2-2 | core | SL middle 29.1% | **9.3** (under 10) | 19.1 at 6 calls |
| 3-2 | v1.2.3 | FB middle 42.3% | 14.9 | 17.8 |
| 3-2 | core | SL middle 45.9% | **23.5** | 37.2 at 6 calls |

The core moves the 2-2 top call 9.3 points at three calls (v1.2.3: 18.6), but over the full range (up to six calls) and
at 3-2 it is over the 10-point limit.

**Read-through** (`readthrough/scenarios.py --suite v12`, 98 rows): **79/98** (v1.2.3 94, refit 95). Failing: A1, A2, A6,
C5, D3, D7, D9, E2, F2, F6, H4, J7, S1f, S6f, S7f, S9f, P1, P2, P7. Hard-rule rows with any Not-acceptable share: none.
HG rows (`--suite hg_v13`): 4/5 (HG-2 fails; v1.2.3 also 4/5, HG-2). With the relation rules: HG-1b fails too.

R1 / Q4 / S5 on the core (from the full `scripts/test-app.sh` run):
- **R1** (ruling 6: slider at least 30%, no pitch over 60%): **pass**.
- **Q4** (riding four-seam up at most 36% of two-strike calls): **pass**, worst hs 28.6%, D3 24.0%, D1 19.5%.
- **S5** (ruling 7: toward the hitter <= 1% and never above the base; away +3 points): **FAIL**: sinker inside 0.0% at
  the base, toward 0.0%, away 0.0%. On the core the S5 fire row calls changeup middle (28%); the inside sinker is never
  in the mix, so the gate can't show its direction (refit: base 1.0%, away 12.1%). A behavior row the core moved; not
  tuned.

## 5. Sims: seed-paired runs per game, core vs v1.2.3

Seed-paired simulated games (`batch.py`, seeds 401-412, default staff and lineup, every hitter unscouted), the core in
`C:/dev/pc-core` vs v1.2.3 in `git archive main`, one batch at a time (`C:/dev/pitchiq-data/sims_v13core/run_sims.sh`,
`paired.py`; about 1 minute per game, 120 games). "Runs / game" = runs allowed by the engine-called staff. The
simulator plays by each engine's own outcome model, so this is a sanity check of the engine's world, not evidence. 12
games per level was the time budget; the paired SE (1-2 runs) is far larger than the 0.25 flag.

| Level | games | v1.2.3 runs / game | core runs / game | core - v1.2.3 (paired SE) | flag (> +0.25) | wrong calls v1.2.3 / core | K% v1.2.3 / core | BB% v1.2.3 / core | HR% v1.2.3 / core |
|---|---|---|---|---|---|---|---|---|---|
| hs | 12 | 9.92 | 3.92 | -6.00 (2.06) | - | 3.1% / 2.7% | 21.5 / 38.9 | 19.0 / 14.2 | 1.4 / 0.2 |
| college_d3 | 12 | 8.42 | 5.33 | -3.08 (1.19) | - | 1.9% / 2.0% | 16.9 / 23.5 | 14.9 / 14.8 | 1.8 / 0.8 |
| college_d2 (v1.2.3 at D3) | 12 | 8.42 | 5.33 | -3.08 (1.19) | - | 1.9% / 2.0% | 16.9 / 23.5 | 14.9 / 14.8 | 1.8 / 0.8 |
| college_d1 | 12 | 6.50 | 4.83 | -1.67 (2.16) | - | 1.4% / 2.7% | 19.6 / 27.3 | 13.2 / 8.1 | 1.7 / 2.3 |
| mlb | 12 | 3.25 | 3.92 | +0.67 (0.99) | **FLAG** | 0.6% / 1.7% | 23.0 / 28.5 | 12.3 / 11.1 | 1.9 / 2.7 |

- **Flag (rule: over +0.25 runs per game): MLB, +0.67 (SE 0.99).** Within noise, but over the line as a point estimate.
- Every college / HS level runs **fewer** runs with the core, with many more strikeouts: HS K 21.5% -> 38.9%, D3 16.9 ->
  23.5%, D1 19.6 -> 27.3%. HS is the largest: the default staff throws 86-89 mph fastballs, which the HS pitch kind x
  velocity table treats as elite HS velocity (the same caveat as the harness's HS note).
- **College D2 is identical to D3 in the core's simulator** (same games, pitch for pitch): D2 runs entirely on D3's
  placeholders (v1.2 count layer for both, identical zone_v13 level cells, D3's per-PA rates). v1.2.3 has no D2 level; its
  D2 pair is v1.2.3 at D3.
- Checker's wrong-call share (the no-scouting full-game check): core 1.7-2.7% vs v1.2.3 0.6-3.1%; D1 doubles (1.4 -> 2.7%),
  MLB 0.6 -> 1.7%, HS 3.1 -> 2.7%. The old matrix (`results/matrix_report.txt`) had 0.8-1.6% for its level setups and
  0.8-4.5% over all setups, so the core is inside the overall range but above the old level setups at D1 and MLB.

## 6. scripts/test-app.sh on the core (step 7)

Run once, alone, from a temporary copy without `set -e` (deleted after): 57 min, log
`C:/dev/pitch-caller-logs/v13/core/testapp_coreC.log`. The worktree had no `node_modules`, so every Node suite needing
`playwright` / `fake-indexeddb` failed to load; after `npm ci` those suites were rerun one at a time
(`testapp_node_rerun.log`).

Pass: tests_hitter_data, hs_data, zone_seed, harness, every refit test, fit_count, fit_traits, explain, all four
fast_parity runs (Python = JS), tests_v13_d2, tests_v13_sim, **golden_v13core**, **tests_v13_core (28/28)**,
**tests_v13_tables (43/43)**, build matches source, web/lib copies, web demo, the Node unit tests, smoke, every e2e
(game_mix_e2e 44/44, d2_e2e, watch, fold, ...), opponent_exact_test, drift_e2e, peak_sim.

Fail:
- **Expected old-number / old-reference checks** (as on the refit): golden_v123; tests_v11 "exactly v1.0 with Step 2 set
  back"; tests_v12 "exact at lean 0 vs 14e0ad2" (2); tests_v12b "the fitted size is results/v12/hitter_fits.json's";
  tests_v121 / v122 (2) / v123 exact vs their git refs; tests.py "LAND_K / LAND_GAIN are the Statcast fit" (GAIN 1.8 vs
  2.02); logging_exact_test and drift_exact_test (old build = a git ref's app/dist).
- **Fixed (a test asymmetry the core exposed):** tests_v12b "Python = JS on 600 random hitters with tags" (0.31): the
  test called Python's `type_mix` without the situation while JS got it, so only JS applied the core's count `bip_gb`
  (zero in every earlier table). The Python call now passes the situation; the check passes.
- **New, moved by the core (not tuned; for Drew):**
  - tests.py realism, K / BB / HBP within 1 point of real: **mlb K 28.4% vs 22.4%, college_d3 23.1% vs 16.2%, hs 38.4% vs
    21.0%** (BB and HBP lower). The level calibration (`fit_all.py` -> `outcome_params.py` OUTCOME_ADJ) was not redone
    after the zone table and count layer went in; HARNESS_v13 section 5 says the build to score is the one after it. The
    sims' strikeout rise (section 5) is the same thing.
  - tests.py v1.0 grid (3): hs AVG3 3-2 top call 0.87-0.97 with 2 calls; D1 / D3 / HS 3-1 AVG3 top pitch type 42-55%
    (target 50-80%); floor: top pitch type 40% at 2-0 / 2-1 / 3-1 (>= 50%).
  - tests.py infield in: low targets rise 69 -> 74% with the infield in (should shrink); ground-ball rule: 66% down with
    the rule (>= 70%); coaching reads: "squared up" moves its calls 8 points (20+ wanted; the others 20-63).
  - tests_v12 S5 (ruling 7): sinker inside 0.0% at the base, toward and away (section 4).
  - stage2_test: the noise-chasing learner is switched off in 31 of 40 simulated seasons (80% wanted).

## Files

- `hitter_data/score_core.py` (step 1-2 scores), `export_candidates.run_core(thru=, out_paths=)` (the as-scored copy).
- `readthrough/scenarios_hg_v13.json` / `.sha256` (HG-1 to HG-4, PROPOSED), `readthrough/hanger_gate_size.py`,
  `readthrough/hard_checks_v13.py`; results in `results/v13core/`.
- `docs/CORE_v13_CHANGED_CALLS.md` (step 6).
