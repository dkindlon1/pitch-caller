# Plan: hitter model revamp (v1.3), Nov 18, 2026

Status: **plan only. Nothing was built, fitted or run in this chat.** Every number below comes from earlier project docs.
Decisions are Drew's, from nine question rounds on Nov 18. Items marked **(default)** are Claude's suggestion where Drew
didn't decide. Data collection (scraping) is out of scope: it runs in a separate chat, and this plan only states what it
needs from that chat (section 6). Companion docs: `RESEARCH_hitter_data_sources_2026-11-18.md`,
`PROMPT_chatgpt_boxscore_collect_2026-11-18.md` (pilot collection).

## 0. Why a revamp

What the docs say about today's hitter side (check each in the repo at Step 0; none was re-run here):
- **Level-fit outcome model, assumed MLB-like.** Swing, whiff, called strike, foul and contact come from per-level
  tables tuned so simulated games hit each level's real K / BB / HBP. Amateur hitters are assumed to swing like MLB
  hitters (README, "Open").
- **Measured gaps (README Statcast check, v0.7c era):** about half the real whiff rate in every zone, strikeouts made up
  with too many chase swings, and off-speed over the heart in pitcher's counts charged about a third of what real hitters
  do. Not re-measured on v1.2.3.
- **Earlier attempts:** E7 (Nov 3) made the hitter side data-accurate on MLB, then shelved it. Deep-count calls swung
  wildly with one unproven setting, how much hitters adapt to this pitcher (3-2 fastball share 26% to 57%). The Nov 6–7
  Statcast hitter cells were never merged.
- **v1.2 Part B tags:** early-count approach ships (Statcast fit, +0.2077 logit per tag step). Swing path is a 0.003 coach
  rule. Off-speed is a small coach-set prior. Spray was dropped.
- **Hitter knowledge:** contact / power / eye grades, crowding flag, in-game reads (late, out front, squared up), damage
  and spot memory, the sit/guess game, handedness. Every unknown hitter is treated the same.
- **Levels today:** HS (travel ball uses HS), D3, D1, MLB for comparison. **No D2.**

## 1. Drew's decisions (Nov 18)

### 1.1 Scope and levels
| Topic | Decision |
|---|---|
| Scope | All three, **core first**, each proven before the next: (1) core: swing, chase, whiff, foul, contact by zone / count / pitch; (2) in-game and in-at-bat adjustment; (3) hitter types and per-hitter differences. |
| Levels | **HS, D3, D2 and D1 each get their own numbers, one shared structure.** Travel ball keeps using HS. MLB stays a comparison level. Minor leagues are a data bridge, not a product level. |
| D2 | **New full level in PitchIQ** (engine, app, portal, simulator, run values, calibration), with its own model borrowing from D1 / D3 where thin. |
| HS | **Gets its own model once HS data arrives** (same structure and proof as college). Until then it stays on today's model. Calls that move only because of the shared-number refit (section 4) are listed for Drew to regrade. |
| Borrowing | Thin cells pull toward neighboring levels by data weight (D2 ↔ D1 / D3; HS ↔ D3, **default**), **shown in the report**. |
| Level-split check | Separate count patterns per level must beat "one shared pattern + a level offset" on the validation season, or the model collapses to shared + offset (3.1). |
| Run values | **Refit run values for every level that has play-by-play** (D1, D2, D3, HS when it arrives), checked on the held-out season. |
| Order | Lands **before** the style layer, game plan preview and opponent database. |

### 1.2 Data
| Topic | Decision |
|---|---|
| Volume | **No limit. The more data, the better.** Every season available, **recent seasons weighted more**; the latest season is always held out for the final test. |
| Rules | **Drew (Nov 18): the scrape may ignore site terms, and all collected data may feed shipped numbers, MLB / MiLB data included.** This reverses the earlier "Statcast check-only" call. |
| Sources | College box-score play-by-play (D1, D2, D3); HS game data; minor league data (MLB Stats API pitch-by-pitch for every level it covers; Statcast for Triple-A and Single-A); MLB Statcast; Retrosheet; customers' opted-in logs once they exist. |
| Zone data | **Single-A Statcast zone × count × pitch effects seed the zone table** (closest hitters to college with location and pitch type). Drew still approves the table (3.2). Customers' opted-in logs, which record landing cells, refine it over time. |
| Thin data | If a level's coverage is too thin (section 6), that level keeps today's count numbers and gets only the structure, traits as coach inputs and the zone table. Its fitted pieces wait for more data. |

### 1.3 Behavior
| Topic | Decision |
|---|---|
| Adaptation | Fit the league-wide count effect; keep within-game learning **capped**. **Robustness check:** sweeping the cap over its full range moves no 2-2 / 3-2 top call by more than **10 points**. |
| Contact | Hard / weak contact **and ball type** (grounder / liner / fly). Count and ball-type parts are fit per level; zone and shape parts come from the approved table. |
| Platoon | **Fit per level** (same vs opposite side: swing, whiff, power by count), only on validation gain. |
| Situation effects to test | **Times through the order, runners in scoring position, late and close, in-at-bat (after a whiff, foul, take).** Each ships only on validation gain. |
| Times through order | **Smooth curve, no cliff.** Hitters may improve each time through, but by a smooth amount, with no jump at the third time. |

### 1.4 Hitters
| Topic | Decision |
|---|---|
| Representation | **A few traits per hitter, types as labels.** Each hitter is a small set of numbers pulled toward a prior; named types are presets coaches pick. |
| Type presets | **All of them:** aggressive early, patient, power, contact, free swinger, two-strike battler. A preset sets traits; the coach can adjust them. |
| Unknown hitter | **His lineup slot's average at the level, adjusted by his team's strength.** The team adjustment is pulled toward zero when its data is thin. |
| Per-hitter values | **Prefill from collected game data, then learn from at-bats vs us.** Coach tags override. |

### 1.5 Proof and rollout
| Topic | Decision |
|---|---|
| Proof 1: real data | On a held-out season, beat v1.2 by **more than 2 SE at each level**, predicting take / swing / whiff / foul / in-play by count and ball-in-play type. D2 has no v1.2 model: it's compared with v1.2 run at its D1 and D3 settings and must beat the better of the two **(default)**. HS is tested once its data arrives. |
| Proof 2: logic | Drew's rules as **hard automatic checks**, plus a **new hitter scenario file of about 30 rows that Drew grades** (plus D2 rows, 3.5), plus every v1.2 row whose calls moved. |
| Proof 3: sims | Reported. **Stop and ask Drew** if simulated runs move more than 0.25 per game at any level. |
| Rollout | Branch. Frozen goldens list every call that moved, Drew regrades changed rows, every suite is green. Ships as **v1.3** with Drew's go. One engine, no flags. |

**Standing calls carried as hard checks:**
- A hard foul counts like a normal foul.
- Better stuff never makes a pitch a worse call.
- A ball hit hard twice at a spot moves the odds there a small amount.
- The engine calls a proper game with no hitter scouting.
- No chase target at 3-0 / 3-1.

**Standing calls the graded rows must respect:**
- Fastball middle at 2-0 vs a power hitter is acceptable.
- Middle is fine early and at 1-2, and edges are fine with two strikes.
- Mashed twice = large soft penalty.
- Hitter reads move the call.

## 2. What each data type can teach

| Data | Has | Teaches |
|---|---|---|
| **College box-score play-by-play** (D1 / D2 / D3) | Per pitch: ball (B), called strike (K, to verify), swinging strike (S, to verify), foul (F), ball in play; count, outs, bases, inning, score, lineup slot, batter, pitcher, result text | Swing / take, whiff, foul, called-strike share by count and situation; two-strike and early-count behavior; in-at-bat adjustment; times through; slot and team averages; platoon (with rosters); ball-in-play type, direction and power per hitter; run values; per-pitcher lines for D2 spread calibration |
| **HS game data** | Depends on what the scrape finds (box scores with or without pitch strings) | The same, to whatever depth the data reaches |
| **Minor leagues, MLB Stats API** | Pitch-by-pitch calls for every level it covers; location and pitch type where tracked | Count behavior by level from rookie ball up: a ladder between college and MLB |
| **Single-A / Triple-A Statcast** | Location, pitch type, movement, swing, exit velocity, launch angle | Zone × count × pitch effects and contact quality for young pro hitters: the zone table's seed |
| **MLB Statcast** | Same, plus bat tracking | Comparison; shape stability check across levels |
| **Retrosheet** | MLB pitch sequences | Long MLB count history; comparison |

Box scores have no pitch location or pitch type, so a true chase rate comes from the Statcast-seeded zone table, not
from amateur data.

## 3. The model

Same cost equation and outcome chain as today (land → swing → whiff → foul → contact quality and type). What changes
is where each probability comes from, per level L (HS, D3, D2, D1; MLB = comparison):

    P(event | count, situation, zone, pitch class, hitter, in-game state)
      = count layer_L (fit)  ×  zone table (Single-A seeded, approved, relative)  ×  hitter traits  ×  situation and in-game terms (fit, capped)

### 3.1 Core (phase 1)
- **Count layer, fit per level:**
  - swing given count and base-out; whiff given swing; foul given contact; called strike given take;
  - ball-in-play type; out / hit / extra-base given type.
- **Thin cells (default rule):** a cell with fewer than about 500 pitches borrows from neighboring levels by data weight;
  the report prints the share borrowed.
- **Recency weighting (default):** each season's weight halves every 2 seasons back. The half-life is tuned on the
  validation season (shorter or longer only if it predicts better), and the report shows the chosen weights.
- **Level-split check:** fit both "separate count patterns per level" and "one shared pattern + level offset".
  - Score both on the validation season.
  - Keep separate only if it's better by more than 2 SE; otherwise ship shared + offset.
  - The report shows both scores.
- **Hard contact:** where Statcast exists, exit velocity / launch angle. For box-score levels, the default proxy is line
  drives plus extra-base hits per ball in play (hard) and pop-ups plus weak grounders where the text says so, e.g.
  "to p", "to c" (weak). The proxy is checked against Single-A, where both are visible.
- **Platoon:** same vs opposite side by count, per level, with handedness from rosters.
- **Run values:** count × base-out run values per level from the play-by-play (runs scored in the rest of the inning),
  with the same borrowing. On the held-out season they must predict runs in the rest of the inning at least as well as
  today's tables (D2: as well as the D1 and D3 tables).
- **Recalibrate:** after the core lands, refit pitcher-side keys (`fit_all.py`) so each level's K / BB / HBP stay on
  real, as every version has.

### 3.2 Zone table (Single-A seeded, Drew approves)
- **What it covers:** how each zone band (heart, edge, off, way-off) shifts swing, chase, whiff, contact quality and ball
  type, for fastball vs off-speed (profiles where they matter), in early, ahead, even, behind and two-strike counts.
- **Seed:** fit on Single-A Statcast, every season available, recent weighted. Triple-A and MLB are fit the same way.
- **Transfer check (default):** compare the shape across Single-A → Triple-A → MLB.
  - If it's stable, the Single-A shape is used for college.
  - If it trends with level, the trend is carried one step down for college and two for HS, and the report says so.
- **Format (default):** about 20–30 plain statements, each with its fitted relative size. For example: "hung off-speed
  over the heart with two strikes is hit hard ×N as often as a fastball there". Drew approves or edits; the table is
  frozen with a sha and versioned like the scenario files.
- **Mean-preserving (default):** the table averages to each level's count layer over the location mix an average
  pitcher's landing model produces, so each level's data sets the level and the table sets the shape.
- **After freezing:** changes come only through graded rows or a new table version.

### 3.3 In-game, in-at-bat and situation effects (phase 2)
- **Count effect (fit):** the hitter's guess centers on his level's real count behavior.
- **Within-game learning (capped):** today's "what he's seen in this count" prior stays, under the 10-point robustness
  check.
- **Tested per level, each ships only on validation gain:**
  - times through the order, as a smooth curve with no third-time jump (replaces the fixed +0.012 hard-contact logit per
    batter faced);
  - runners in scoring position;
  - late and close;
  - in-at-bat: swing and contact changes after a whiff, a foul or a take.

### 3.4 Hitter traits and types (phase 3)
- **Traits (default list):**
  - early-count aggressiveness (swing rate at 0-0 / 1-0 / 0-1);
  - two-strike approach (two-strike swing and foul rates);
  - contact (whiff per swing);
  - power (extra-base hits and HR per ball in play);
  - spray (pull / oppo share from ball-in-play direction).
  - Coach-set: off-speed hitter and swing path. Their effects are sized from Single-A Statcast and approved with the zone
    table.
- **Priors:**
  - Known hitter: pulled toward his slot-and-team prior by each trait's reliability (split-half).
  - Unknown hitter: his lineup slot's average at the level, adjusted by his team's strength (team adjustment shrunk
    toward zero when thin).
  - No slot known: level average.
- **Presets (Drew's list):** aggressive early, patient, power, contact, free swinger, two-strike battler. Each sets trait
  values (sized from real hitters in that group at the level, **default**); the coach can adjust them.
- **Per-hitter values:**
  - Prefill from his collected game data, across seasons with recency weighting.
  - Then the existing learner's hitter memory ("what he did vs what the engine expected") moves them, within its caps.
  - Coach tags override; a big disagreement is a flag, not an overwrite.
- **Opponent database hook:**
  - power 1–3, contact 1–3, spray and approach map onto these traits;
  - contact becomes engine-facing once fit;
  - the engine's Unknown is the slot / team prior. The opponent plan's "Unknown = 2" text gets updated to match when
    that plan is built.

### 3.5 D2 as a product level (new)
The engine, the app and the database must all learn the level. Check each location in the repo; this list comes from
the docs.
- **Engine (both engines):** a `college_d2` level key, D2 run tables (3.1), outcome fit (`fit_all.py`), spread
  calibration (`fit_spread.py` on D2 per-pitcher lines from the collected games), win-expectancy tables, and every level
  list (validation, `RHO_L`, landing defaults). Parity, Python = JS.
- **App and portal:** level pickers in setup and game launch, level labels, the simulator presets (`LEVEL=college_d2`),
  and the matrix.
- **Data:** any level enum or check constraint in Supabase gets a migration (dev first, production with Drew's go);
  existing games are untouched.
- **Rows:** D2 gets its own graded rows (about 5, **default**) on top of the ~30.

## 4. Refitting shared numbers (was "Statcast swap")

With MLB data back as a shipped source, no Statcast number is removed. Each is **refit on the much larger data** (every
season, MLB + MiLB, recent weighted). Where it describes amateur behavior, it's refit per level on the collected
amateur data. **Inventory from the docs, to be confirmed in code at Step 0:**

| Number (where it came from) | Refit (default) |
|---|---|
| Early-count approach coefficient +0.2077 (v1.2 B1) | Replaced by the early-count trait fit per level (3.4) |
| Better-stuff chase `STUFF_CHASE` 0.33 | Refit on all Statcast seasons (MLB, AAA, A); still must keep "better stuff never a worse call" |
| v0.8 sequencing fits (`fit_v08.json`: timing surprise, eye level, tunnel-on-chase) | Refit on all seasons; count-level parts per level from box scores |
| "Is it landing today" settings (v1.0 Step 5) | Refit on all seasons; must keep "get it over loses about half" and the 2-for-10 rule |
| HBP curve by crossing point (MLB 2024–25) | Refit on all MLB / MiLB seasons; level totals from collected games |
| Profile priors, profile medians and tag thresholds (v1.1) | Refit on all seasons; priors move into the zone table |
| MLB K / BB / HBP targets; MLB command copied into levels by `fit_all.py` | MLB targets from all seasons; level command refit on level data |
| Platoon sizes | Fit per level (3.1) |
| Unmerged Nov 6–7 items (hitter cells, usage prior) | Superseded by the zone table and count layer; not merged |

HS calls that move from these refits before HS gets its own model are listed separately for Drew.

## 5. Proof

### 5.1 Real data (first)
- **Seasons (default):** the latest season (2026) is held out and scored **once** at Step 6. The season before (2025) is
  validation, used for every phase gate, the level-split check and the recency half-life. Everything older is for
  fitting, recent weighted.
- **One harness for both models:** same pitch-mix and landing assumptions for v1.2 and v1.3, reviewed before any scoring
  (E7 found a yardstick artifact; this guards against a repeat).
- **Metrics per level:**
  - log loss per pitch event (take-ball, take-strike, whiff, foul, in play) by count;
  - ball-in-play type;
  - plate-appearance K / BB / HBP / hit;
  - run values: runs in the rest of the inning.
  - Single-A also gets zone-level checks (the seed's own held-out fit).
- **Bootstrap:** by game.
- **Pass:** v1.3 beats v1.2 by **more than 2 SE at each level** (D2 against the better of v1.2's D1 / D3 settings).

### 5.2 Logic
- **Hard checks, automatic:**
  - hard foul = foul (scenario F5);
  - better stuff never a worse call (fuzz);
  - hit hard twice = a small shift (bounded);
  - no chase at 3-0 / 3-1;
  - full games with every hitter Unknown call cleanly at every level: matrix wrong-call rate in the usual range, grid
    checks pass.
- **Robustness:** across the full adaptation cap range, no 2-2 / 3-2 top call moves more than 10 points.
- **Graded:** `scenarios_v13.json`, about 30 new rows plus about 5 D2 rows plus every v1.2 row whose calls moved. Drew
  grades; anything Claude grades is marked proposed. **Rough split (default):**

  | Area | Rows |
  |---|---|
  | Traits and presets | 6 |
  | Two-strike | 5 |
  | Adaptation and in-at-bat | 5 |
  | Unknown hitters by slot / team | 4 |
  | Platoon | 3 |
  | Situation (scoring position, late and close, times through) | 4 |
  | No-scouting full-game spot checks | 3 |
  | D2 | about 5 |

### 5.3 Sims
- Paired-game regret and runs per game are reported per level.
- Over +0.25 runs per game, stop and ask Drew.

### 5.4 Suites
- `scripts/test-app.sh` and `scripts/test-sql.sh` green.
- Python = JS parity on new terms and the D2 level.
- Goldens regenerated, with the changed-call list.

## 6. What this plan needs from the scrape chat
- **College (D1, D2, D3), per plate appearance:** date, game id, level, conference, both teams, inning / half, outs and
  bases before, score, lineup slot, batter and pitcher (name, team, handedness from rosters), pitch string, final count,
  result text. Also runs scored in the rest of the inning, derivable from the play-by-play. Rosters per team-season.
- **HS:** the same fields as far as the source carries them, plus which fields are missing.
- **Minor leagues:** MLB Stats API game feeds for every level available (pitch calls, counts, batter / pitcher,
  locations where tracked); Statcast CSVs for Triple-A and Single-A; every season available.
- **MLB:** Statcast every season available; Retrosheet event files.
- **Coverage report:** per level, conference and season, the share of games with full pitch strings.
- **Enough data (default):** a level is fit when at least half its games carry full pitch strings in the validation and
  held-out seasons. Otherwise the thin-data path in 1.2 applies for that level.
- **Pilot first:** a handful of team-seasons per platform (the ChatGPT prompt) to build and test the parser before the
  bulk pull.

## 7. Steps

| Step | What | Proof (captured output; nothing called done until run) |
|---|---|---|
| 0 | Start line: tag current main, run `test-app.sh` and `test-sql.sh`. Grep code for every Statcast / MLB-derived number (confirm section 4). Re-measure v1.2's hitter gaps on Statcast. | Suite logs; inventory; gap report |
| 1 | Data intake: parsers per source (college platforms, HS source, MLB Stats API, Statcast); verify pitch letters (strikeouts looking should end in K, swinging in S); coverage by level and season. Build the shared scoring harness and get it reviewed. Score v1.2 on validation. | Parser tests on pilot files; letter check; coverage table; harness review; v1.2 baseline |
| 2 | Zone table: fit Single-A (and AAA / MLB for the transfer check), draft the statements, Drew approves, freeze. Refit shared numbers (section 4) on the old model. | Seed fit with held-out Single-A score; transfer check; approved table + sha; every changed call listed (HS separate); Drew regrades moved rows |
| 3 | D2 plumbing (3.5) with D2 numbers from collected data; core per level (3.1): count layer, recency weights, borrowing, level-split check, hard-contact proxy check, platoon, run values, slot / team priors; refit pitcher-side keys. | D2 parity and app checks; validation beats v1.2 per level; split-check scores; K / BB / HBP within 1 point per level; borrowed-share report |
| 4 | Adjustment and situation effects (3.3). | Validation gain per term (dropped terms listed); smooth times-through curve; 10-point robustness check |
| 5 | Traits, presets, prefill, learner and simulator hitters (3.4). Hidden traits in `simulate.py`; a hitter world in `worlds.js` checks traits are recovered and average hitters aren't moved. | Validation gain; worlds checks; slot / team Unknown behaves as specified |
| 6 | Final proof: 2026 held out once at each level; hard checks; sims. HS joins whenever its data clears coverage (its own pass of steps 3–6). | Held-out table per level; check logs; sim report |
| 7 | Read-through: Drew grades `scenarios_v13.json`; release notes; any D2 migration to production with Drew's go; v1.3 with Drew's go. | Graded file + sha; goldens; release notes |

## 8. Effects on other plans
- **Style layer:** its ~0.01-run cost cap and bound checks use the hitter model; build on v1.3. D2 coaches get style
  cards too.
- **Game plan preview:** simulated at-bats use the new traits, presets and slot / team priors.
- **Opponent database:** ratings map onto traits (3.4); collected game data can pre-fill opponent hitter pages (with
  coach confirmation, as that plan's suggestions already require); the Unknown wording changes.
- **Learning v3:** the program layer's "conference hitters" shrink toward the v1.3 level model.
- **Website / pricing copy:** add D2 wherever levels are listed.
- **Outcome tracking / reports:** level averages for recaps come from the new per-level data (D2 included).

## 9. Not in this plan
Scraping and data collection (separate chat). New location logging. The hitter-side product.

## 10. Open items for Drew
1. **Data rules (Drew, Nov 18):** the scrape ignores site terms, and all collected data ships, MLB / MiLB included.
   Claude suggested a legal read before launch; Drew's call.
2. **Zone table approval** (Step 2): the first concrete thing Drew reviews.
3. **D2 in production:** any database migration for the new level waits for Drew's go.

## 11. Decisions after the prework (Nov 21)
- **Hanger:** zone effects follow the data by location (off-speed over the heart ≈ a fastball there). An extra hanger
  penalty applies only when that pitch is below his normal today; v1.2's flat +0.5 hanger term goes when the zone table
  is wired.
- **Zone numbers:** approved only after the MLB / MiLB pulls finish and the table is regenerated (multiple seasons,
  Triple-A in the transfer check).
- **Refit regrading:** Drew rules now on the three broken limits (R1, Q4, S5) and the 25 HS / travel changes; every
  other moved row is graded once, after the college core lands. `feat/hitter-v13-refit` stays unmerged until then.
- **Coverage rule:** undecided; more D2 / D3 2025 games are being collected. Decided from the coverage +
  representativeness numbers once they land.
- **HS data:** the HS source is Perfect Game WWBA and Showdown games (about 4,700 games and 1M pitches so far; ~16,900
  WWBA finals still being collected). **Drew: one model for HS and travel**, fit on this data; travel keeps using the
  HS numbers.
  - **No bat-type split (Drew, Nov 21):** wood and BBCOR games are treated the same.
  - (default) Event format (pitch limits, time limits, pool vs bracket) is recorded per game and tested as a fit term,
    reported so its effect is visible.
  - **The archive records pitch type and velocity per pitch (Drew, Nov 21).** At HS / travel this allows count-layer
    fits split by pitch class (fastball vs off-speed, and kinds where data supports), velocity effects on swing / whiff
    / contact, and per-pitcher stuff checks. No location, so zone shape still comes from the Single-A seeded table.

## 12. Drew's rulings on the decision sheet (Nov 21, night)
- **Pass bar:** v1.3 must beat raw v1.2 by more than 2 SE at each level. Extra terms ship only if they clear 2 SE on
  2025 and their call changes pass Drew's graded rows. No fixed 0.002 floor; recalibrated v1.2 is reported only.
- **Zone table approved** (regenerated on full Single-A / Triple-A / MLB data), trend carried one step down for college
  and two for HS / travel. The sinker-grounder row is taken from Triple-A.
- **Hanger gate approved:** the flat +0.5 goes; penalty H × min(1, wild_today / 0.30) only when the pitch isn't landing
  today, H sized by graded rows (0 if rows pass without it).
- **HS / travel pitch kind × velocity:** new engine table (biggest single gain found, +0.010 nats per pitch).
- **Ride-up credit** 0.008 → 0.003, 36% cap kept. **R1** rewritten (slider ≥ 30%, nothing over 60%). **S5** tests the
  gate's direction.
- **HARD_SD** = hitter talent SD with luck removed. **Harness landing** re-frozen from Single-A. **MLB run-value scale**
  pinned at v1.2's .481 until college run values exist. **Simulator** two-strike trait split into swing and foul.
- **HS / travel changed calls:** list refreshed to the full-data refit; Drew grades only arguable and flagged rows.
- **Coverage rule:** still open pending D2 / D3 2025 data.
