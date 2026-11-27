# PitchIQ V1.3 audit — Baseball analytics & sabermetrics

Auditor role: baseball analytics / sabermetrics. Tree read: `/home/claude/pitch-caller` (c602f1c). No repo edits; all
experiments monkeypatch the engine in memory. Scripts and raw outputs: `/home/claude/audit/saber_work/`
(`check_runs.py`, `check_stakes.py`, `exp_adv.py` + `exp_adv_out.txt`, `exp_whiff.py` + `exp_whiff_out.txt`, `check_pv.py`,
`exp_pv.py`, `realism.py`, `re_consistency.py` + `re_cons_out.txt`, `we_check.py`, `we_rebuild.py`).

## 1. Verdict

**C+.** The per-pitch run math is built right: the RE and count tables are monotone, MLB count values match published
values, and walk/HBP forcing, terminal states and wild pitches have no double counting. But V1.3 joins tables from three
different run environments (play-by-play RE/CV; conference/MaxPreps in-play, walk/strikeout and win-expectancy tables).
The HS run environment does not hold together, and the HS pitch-kind table counts pitch class twice. These are real
errors, but each moves calls by a modest, measured amount (≤0.16 TVD, ≤2 mruns/pitch). None is a deploy blocker. An
elite standard needs them fixed or ruled on.

## 2. Findings

| ID | Sev | Title | Evidence | Impact | Proposed fix | Class |
|---|---|---|---|---|---|---|
| S1 | MAJOR | Win-expectancy / leverage tables come from a different run environment than V1.3's RE | `we_check.py`: runs per half from the WE chain vs shipped RE00: **HS 1.070 vs 0.803 (x1.33), D3 0.951 vs 0.810 (x1.17), D1 0.700 vs 0.766 (x0.91)**, MLB 1.00. `we_tables.json` was built from `we_rates.json` (conference/MaxPreps chain), and `we_tables.py`'s own 2% check passes only against the stale `run_tables.py` RE (`results/v08_step7_we_checks.txt`). `we_rebuild.py` rebuilt D3/HS tables with offense scaled to the shipped RE00: m0 goes up 7–21%, and late-and-close calls move **TVD 0.01–0.13**. HS 7th, up 1, 2 out, bases loaded, 3-2: top call **FB middle 54% → SL middle 45%** (the type of row Drew grades). HS 6th, up 1, 1 out, R3, 2-1: ω 0.90→1.00, TVD 0.133 | Late-and-close calls (ω>0) are made on a run environment 17–33% too high at D3/HS (9% too low at D1) | Rebuild `we_tables.json` from a chain calibrated to `run_v13core` per level (and D2's own) | CHANGES-CALLS |
| S2 | MAJOR | HS run environment: play-by-play RE is below D3 and far below MaxPreps; HS gets 1.67x the run scale of D3 at the same RE | `check_runs.py`: HS RE00 **0.803 < D3 0.810**. HS < D3 in **15 of 24** base-out states (e.g. 1\|000 .381 vs .412, 2\|123 1.036 vs 1.084). MaxPreps national (`hs_rates.py`) is 7.26 R per 7 innings ≈ 1.04 per inning, which v1.2 used (1.069). HS K/BB targets are still MaxPreps (`pa_targets_v13.json` target_all). `run_scale`: HS 0.803/0.481 = **1.669**, D1/D2/D3 **1.0** (`engine.py:651-656`, `RUN_SCALE_OWN`). Ruling 10 as clarified ("levels whose run values are fit on their own play-by-play take no scale from MLB", `DECISIONS_refit_v13.md:278`) would also cover HS, whose RE is now own-play-by-play | Either HS scores like D3 (the DiamondKast sample may skew to stronger programs) or the RE is too low. HS coaching credits, temperature and windows are 1.67x D3's for the same run stakes | Owner: pick the HS run environment source; decide whether ruling 10 covers HS (would set HS run scale 1) | NEEDS-DATA + NEEDS-OWNER-RULING |
| S3 | MAJOR (HS) | HS pitch kind x velocity table counts pitch class twice | `fit_count_hs.py:651-664`: multipliers were fit "on top of the HS-alone count table" (count only, no class or location terms). The engine applies them on top of the zone table's class terms (`whiff_os` SL +0.25 etc.). `check_pv.py`, HS 0-2, same 5 targets: the data's SL/FB whiff-per-pitch ratio is 1.31/0.90 = **1.46**. Engine without the table: 1.23. **Engine shipped: 1.82** (≈1.23x1.46). 0-0 CH/FB: data 1.44, engine 1.71. Engine SL whiff/swing at 0-2 is **0.378**, against real HS two-strike 0.27–0.30 (build log l.253). In the engine's own calls (`realism.py`) HS OS whiff/swing is 0.35–0.43, FB 0.21–0.31 | Biggest single driver of the HS K gap (build log: table off −3.4 K). Calls: the HS FB floor binds, so pitch-type shares don't move. At half strength (`exp_pv.py`) the OS share stays the same at all 7 counts, locations move **TVD 0.06–0.14**, regret ≤0.8 mruns/pitch | Refit the kind/velocity multipliers on top of the engine's class+location prediction (or remove class terms where they apply) | NEEDS-DATA, CHANGES-CALLS |
| S4 | MINOR | Walk/strikeout run values don't match the RE table they sit beside | `check_runs.py`: walk/strikeout values recomputed from `run_v13core` RE (Markov state weights) against shipped `lw`: **HS k −0.611 vs −0.511 (x1.19), bb 0.571 vs 0.504; D1 k −0.379 vs −0.437 (x0.87); D3 k −0.537 vs −0.497**. Source: `run_v13core.json` about says "lw the refit's" (conference/MaxPreps Markov). Used only in `count_stakes` → `stakes_factor` → temperature/windows (`engine.py:2418-2451`). `check_stakes.py`: stakes factor changes at 2-0/2-1/0-2/1-2 by 0.07–0.15 (HS 2-0 1.28 vs 1.14, D1 0-2 1.28 vs 1.13) | Randomness at 2-0/2-1/0-2/1-2 is 10–13% off what the level's own run values imply | Compute lw from each level's own RE (play-by-play) | CHANGES-CALLS |
| S5 | MAJOR | In-play outcome tables come from a different run environment than RE (engine at-bat value ≠ RE) | `re_consistency.py`, average arsenal, 0-0, all 24 states: at bases empty / 0 out the engine's at-bat value is above RE by **HS +0.080 (+10%), D3 +0.042, D1 +0.003**. This ranks like (conference/MaxPreps RE − play-by-play RE): HS +0.27, D3 +0.14, D1 −0.07. In-play tables come from IN_PLAY_BY_LEVEL (conference/MaxPreps hit mix, `calib.real_bip`) and runner rates from `we_rates` (`inplay_fit.py` header). RE comes from play-by-play | Contact is valued in a higher-scoring world than the RE behind it (HS/D3): balls in play are over-penalized against K, which compounds S3/S6 | Recalibrate out_table / runner to the play-by-play level's hit mix and scoring | CHANGES-CALLS, NEEDS-DATA |
| S6 | MINOR | Known runner limits still present in V1.3, plus two more | `engine.py:2296-2299`: a single never takes R1 to 3rd. `2275-2287`: a non-DP grounder never moves R1. Also R2 scores on a single 55% and R1 on a double 40% **at every out count** (with 2 outs, runners go on contact). `exp_adv.py` added R1→3rd 28% on singles and R1→2nd 45% on non-DP GB outs (MLB-ish rates, my assumption) over **45 scenarios** (D1/D3/HS; R1 or R1R3; 0/1 out; 0-0,1-1,0-2,2-1,3-2): at-bat value **+0.011 to +0.044 runs (median +0.025)**; call-mix **TVD median 0.045, max 0.161**; down-target share **−12 to +15 points** (D3 0 out R1 0-2: 0.88→0.77, the GB rule alone 0.88→0.79). The missing GB advance gives down calls ≈+0.002 runs/pitch, ≈40% of `GB_RULE_BONUS` (0.005), which was sized with this bias already in. Separately, the at-bat value at R1R3 sits **0.13–0.14 below RE** at every level with <2 outs (D3 0\|103 2.320 vs 2.457; D1 1\|103 1.428 vs 1.554; HS 1\|103 1.528 vs 1.665): between-pitch events (double steal, WP/PB) and runner moves the at-bat model doesn't have | Small per pitch. Biases ground-ball calls with R1 | Add the two runner rules (and 2-out run-on-contact); resize the GB rule afterwards. The README "Known limits (v1.0)" section is still accurate | CHANGES-CALLS |
| S7 | MINOR | K over-prediction in the engine's own calls: right direction, small call cost | `realism.py` (exact chain, `calib.evaluate`): K **D1 20.8 vs 19.7, D3 17.9 vs 16.6, HS 26.2 vs 21.3**, MLB 21.6 vs 22.6; BB within 0.2 everywhere. `exp_whiff.py`: two-strike whiff logit shifted to real (HS −0.60, college −0.21, from build log .40–.44→.27–.30 and .30–.33→.26–.28). Chase at 0-2 with R1: **HS 14→6%, D1/D3 4→0%**; middle +2–6 pts. Regret of the shipped mix under the corrected model: **HS 0.3–2.0 mruns/pitch** at two-strike counts (≈0.04 runs/game), college ≤0.3 (<0.01 runs/game) | As feared, chase and whiff two-strike calls are over-valued, but well under the 0.25 runs/game budget. Acceptable at college. HS acceptable only once S3 is fixed or accepted | Accept for college; fix S3 for HS | NEEDS-OWNER-RULING |
| S8 | MINOR | Off-speed whiff edge over the FB disappears in the engine's own calls (MLB/college) | `realism.py`: whiff/swing in calls, MLB 0-0 OS .271 vs FB .262, 0-2 .280 vs .300; D1 0-2 .282 vs .308. Real Statcast: FB ~21%, SL ~34%, CH ~31% (≈1.5x). At neutral uniform targets the engine does give the edge (D3 0-0 SL .207, CH .182, FB .120), so it comes from where the engine puts pitches (OS in zone, elevated FB with two strikes), the "slider middle" rows in the build log | Less like a real pitch mix; a sign the zone table (hanger off, H1 0.78x) lets OS in the heart score well | Review on graded rows; size the hanger gate | NEEDS-OWNER-RULING |
| S9 | MINOR | Times through order / platoon / fatigue: smooth and mostly MLB-sourced; level fits not wired | `batters_faced` is an **inert input** (only `engine.py:789`). TTO = in-game familiarity: Statcast phi_FB 0.018, phi_OS 0.0395 logit per earlier pitch seen, cap 0.5, x0.6 HS (≈+0.08/+0.13 hard logit by the 3rd trip, plausible, no cliff). Platoon = MLB per-profile terms (up to ±0.25 whiff, ±0.4 hard logit). The v1.3 level-fit TTO (all levels) and platoon (D1, HS) candidates clear 2 SE and are **not wired** (build log l.436-438, 704-706). Fatigue: hand-set spec constants (−0.5 mph/10 pitches after 60/75/80/90, cap 4; −0.25 grade/20; 2% edge→heart per 10), not in `fit_v08.json` ship | Present and sensible; fatigue not data-grounded; real level effects left out | Wire the cleared TTO/platoon terms after graded rows; fit fatigue | NEEDS-DATA |
| S10 | MINOR | Zone level trends are extrapolated below Single-A | `ZONE_v13_APPROVED.md`: trend carried 1 step (college) / 2 steps (HS) below the Single-A seed; e.g. C5 HS first-pitch OS chase just off = 0.75x FB (MLB 1.75x, A 1.16x). Build log: trend off −2.3 K at HS, −0.4–1.2 college | An assumption, not a fit; it feeds S3/S7 | Validate against college TrackMan / HS data if any | NEEDS-DATA |
| S11 | MINOR | D2 runs on D3 placeholders | `engine.D2_PLACEHOLDERS` = LEVEL, PROFILES, OUT_TABLE, RUNNER_FIT, RUN_GAME, HITTER_SPREAD, **WE**, … `lw` D2 = D3 | D2 late-game and in-play values are D3's | Own D2 tables | NEEDS-DATA |

## 3. Checks and scenarios run (all passed unless noted)

- **RE24 monotonicity** (`check_runs.py`): 0 violations at all 5 levels, for "more runners" (every proper subset) and
  "more outs". RE00: MLB .503, D1 .766, D2 .807, D3 .810, HS .803. Level ordering: MLB < D1 everywhere. **HS < D3 in
  15/24 states (fail, S2).**
- **Count values**: monotone in balls and strikes, 0 violations. MLB 3-0 +.221, 0-2 −.103, 3-2 +.058 (published Book/Tango
  values ≈ +.20 / −.10 / +.06). The 3-0 minus 0-2 spread as a share of RE00 rises with lower level: MLB .64, D1 .71,
  D2 .73, D3 .75, HS .82 (plausible: walks matter more where steals and errors are common).
- **Per-pitch cost math** (read, `engine.py:2879-2960, 2237-2320`): cost = Σ P(outcome) x value(next count/terminal),
  with table values absolute (start at v_end + CV, then solved deepest count first, 10 sweeps). Walk/HBP force logic is
  correct (R2 or R3 alone don't move; loaded scores 1). A two-strike K → v_end(o+1). A two-strike foul loops on itself.
  A non-terminal wild pitch adds the base-state shift once. Ball four on a wild pitch = runners up one, then the walk
  forces. **No double counting found.** Not modeled: dropped third strike, WP on strike three, WP on a pitch that isn't
  noncompetitive.
- **CV only seeds the solve.** After the solve, counts are valued by the outcome model. CV/lw enter calls only through
  `stakes_factor` (temperature/windows), so CV errors matter less than the in-play and RE tables.
- **WE blend** (`we_check.py`): ω = clip(LI−1,0,1) is continuous in LI and saturates at LI≥2. m0 = WE drop per run
  (0.03–0.30). Across margins ω jumps as LI itself does (D1 9th, 1 out, R2: lead 2 ω 1.00 (LI 2.25), lead 3 ω 0.15
  (LI 1.15)), which is inherent, not a bug. Extras reuse inning N+1 (drift 0.0000 per the build checks).
- **Realism, engine's own calls** (`realism.py`, exact chain over calib hidden hitters, 0 out, empty):

| | zone | Z-swing | O-swing | Z-contact | O-contact | whiff/swing | F-strike | K | BB |
|---|---|---|---|---|---|---|---|---|---|
| MLB (target) | 46.8 (49.4) | 65.4 (67.2) | 30.7 (28.5) | 82.4 (84.6) | 61.4 (58.7) | 24.9 | 58.1 (61.7) | 21.6 (22.6) | 8.2 (8.2) |
| D1 | 41.6 | 62.8 | 27.5 | 83.9 | 62.4 | 24.3 (real 22.75) | 56.4 | 20.8 (19.7) | 11.0 (10.8) |
| D3 | 39.8 | 61.9 | 27.1 | 85.8 | 66.6 | 21.8 (real 20.16) | 55.9 | 17.9 (16.6) | 11.5 (11.4) |
| HS | 40.8 | 56.8 | 23.9 | 82.0 | 56.6 | 27.6 | 53.1 | 26.2 (21.3) | 14.2 (14.2) |

  By count (all levels): 3-0 Z-swing 9–21%, O-swing 2–5%. 0-2 O-swing 37–40%. 2-2 / 3-2 O-swing 34–48%. Z-swing rises
  0-0 (45%) → 3-2 (73–86%). These match Statcast patterns: chase 28–32% at MLB, lower at lower levels. College and HS
  chase and zone swing below MLB is the plausible direction (weaker out-of-zone stuff). HS called strike per take at
  2-2/3-2 is .252/.300 (build log real .16–.19), and the engine's HS calls at 3-2 are 97–100% "middle" for a grade-3
  arsenal. Part of the HS K gap is the engine's own zone-heavy two-strike calls, not only model error.
- **Runner-advancement experiment** (S6): 45 scenarios, 2 rule variants split on 2 scenarios (single rule: TVD .048/.051,
  GB rule: .096/.055).
- **Two-strike whiff sensitivity** (S7): 36 scenarios. **HS kind-table half strength** (S3): 7 counts.
  **WE rebuilt** (S1): 10 late-and-close scenarios.

## 4. Could not verify

- No play-by-play / HS data in the repo, so I could not re-fit RE, lw or in-play from the play-by-play, or settle whether
  DiamondKast or MaxPreps is the right HS environment (S2). Runner-advance rates in S6 (28%, 45%) are my MLB-based
  assumptions, not college/HS measurements.
- Regret numbers are model-internal (the engine scored under a perturbed copy of itself), not real outcomes. Scenarios
  use a neutral grade-3 FB/SL/CH arsenal, inning 3–4, average hitter; other arsenals and hitter reads weren't swept.
- Did not check `app/engine.js` parity for these code paths (another discipline). Did not run sims (machine limits).
- The 2025/2026 log-loss scores are pitch-outcome scores; they don't test RE, in-play or WE tables, so they don't vouch
  for S1/S4/S5.
