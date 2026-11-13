# Pitch Caller engine v1.2: build plan (location model and hitter model)

Date: 2026-11-13. Start line: `main @ 14e0ad2` (v1.1, shipped Nov 13: PR #1 fast-forwarded, migration
`20261115000000_v11_kinds.sql` applied to prod, Vercel deployed; not tagged `v1.1` yet, waiting on iPads).
Inputs: `docs/RESEARCH_location_proxies_2026-11-13.md` (new: public proxies, run this session),
`docs/RESEARCH_misses_and_hitters_2026-11-12.md` (Part 1), `docs/PLAN_v1.1_2026-11-12.md` section 8.1,
`docs/BUILD_v1.1_REPORT.md` ("Drew's Step 4 decisions", Step 6) and `docs/RELEASE_v1.1.md` ("Known limits").
Code references are to `14e0ad2`. **Status: draft for Drew; no fresh-context review yet (section 7).**

## Start-line facts (checked Nov 13)

- **CI on 14e0ad2: every job passed.** Push run #193 (43457814880) and PR run #195 (43457820342) both finished
  `success` at 16:33 UTC: engine / parity / build / app checks, Supabase SQL (Postgres 17), web app (public site),
  web shell / offline game / portal e2e. The `main` push run #194 was cancelled after 2 s (superseded), not failed.
- **The remote now has a `v1.0` tag** (annotated, → `b318098`), so `RELEASE_v1.1.md`'s "the remote also still lacks
  `v1.0`" is out of date. `v1.1` is still untagged.

## 0. What v1.2 is

v1.1's landing model knows how often a pitch lands in the heart, on the edge, just off, or way off, but not **which way**
it misses. A sinker that leaks toward a same-side hitter is priced the same aimed in or away. And at college levels the
engine almost never throws a fastball inside (sinker 3–6%, four-seam 0–1% vs same-side hitters; MLB-level calls 23% /
19%), because the college hit-by-pitch price is inflated by a circular calibration (research doc §4). Row P1 still
fails.

v1.2 does five things (Part A, items 1–4: the location model and follow-ups; Part B, item 5: the hitter model, added by
Drew on Nov 13):

1. **Location model structure:** per-pitch miss lean (side and height, inches) and spread, in the landing model and
   in hit-batter / wild-pitch risk. **Default even miss, so nothing changes until a coach sets a lean or the learner
   earns one** (S2, Nov 12).
2. **Level HBP calibration:** the college / HS hit-batter price is fit on a reference inside mix (what real pitchers
   throw), not the engine's own calls, and checked against Drew's "both equally" split.
3. **Logging to learn each pitcher's lean** before data collection starts: a direction on "Way off", hands on every
   event, an optional glove-spot tap, and a **bullpen charting mode** (pitch, glove spot, landed).
4. **Three v1.1 follow-ups** Drew kept in: HS ride-up ceiling, the one-fastball "lean on it" fade, and S2 / S4 / S5
   resized after the location model.
5. **The hitter model** (v1.1 plan section 8.2, carried with its reviews): coach tags for swing path, early-count
   approach, off-speed hitter and spray, each one channel in the engine, fitted on Statcast where the held-out test
   passes, learned where the logs allow (2.8).

Standing rules carry over: baseball logic and real data over simulation; one engine, no flags, Python and JS
identical; nothing "done" until its check ran and the output is in `docs/BUILD_v1.2_REPORT.md`; Drew grades the
read-through (anything Claude grades is marked proposed); nothing touches production without Drew's explicit go.

## 1. Decisions

Settled:

| # | Decision |
|---|---|
| S2 (Nov 12) | **Default lean zero.** A pitch's lean applies only once the coach sets it or the learner earns it. |
| O3 (Nov 12) | **OpenCommand is a research check only**; it doesn't feed shipped numbers. |
| L1 (Nov 13) | **Scope:** the location model, plus the HS ride-up cap, S2 / S4 / S5 at half size and the 83%-fastball game. **Out:** the familiarity refit, P2 / P3 / P5 / P7, the cutter usage table. Class values stay closed (v1.0's). |
| L2 (Nov 13) | **D3 inside:** a typical D3 pitcher throws a fastball across the inside third to a same-side hitter **"often (20–35%)"**. |
| L3 (Nov 13) | **College hit batters come from both causes, about equally:** wilder pitchers (more pitches near the body) and hitters who crowd / don't avoid (more of those hit). |
| L4 (Nov 13) | **The catcher shades the called spot / sets up middle-ish.** The called spot isn't the glove; a logged glove spot helps. |
| L5 (Nov 13) | **HBP price: fit on a reference inside mix, checked against L3's split.** |
| L6 (Nov 13) | **Hot fade by ratio:** "lean on it" fades from 1.2× the pitch's normal share and is gone at 1.6×. |
| L7 (Nov 13) | **Setups:** narrow S4, then resize S2 / S4 / S5 after the location model; drop any that still can't move its row inside the 2–10% change band. |
| L8 (Nov 13) | **Bullpen mode, three taps per pitch:** pitch, where the catcher set up (5×5), where it ended up (5×5 or a way-off arrow). |

| Q1 (Nov 13) | **Coach-set lean sizes: "a little" 1.5 in., "a lot" 3 in.** (MLB average leans by pitch type run 1–3.6 in. in the research check; labeled assumption.) |
| Q2 (Nov 13) | **Show a pitch-type hint** when a coach sets a lean ("sinkers usually miss arm side"), text only; the value stays even until he picks. |
| Q3 (Nov 13) | **Location logging on by default** for new setups. |
| Q4 (Nov 13) | **College reference inside mix: 27%** (the middle of Drew's 20–35%) of fastballs crossing the inside third to same-side hitters, D1 and D3; Single-A's measured shares (four-seam 34%, sinker 41%) are the check; HS uses D3's (assumption). |
| Q5 (Nov 13) | **HS ride-up: scale the rule by 0.6 at HS**, like every MLB-fitted term at HS. |
| Q6 (Nov 13) | **The hitter model is in v1.2** (Part B). |
| O4 (Nov 12, carried) | **Hitter tags:** swing path (uppercut / lift · average · flat / level), early-count approach (aggressive · average · patient), off-speed hitter (struggles · average · hits it hard), spray (pull · all fields · oppo). Height preference and bat speed dropped. Unknown = average; measured numbers override. |

| Q7 (Nov 13) | **Off-speed hitter tag: keep it, small, coach-set only.** A small prior on the existing off-speed damage seed; no learned version unless the logs pass the gate. (Its own-skill part barely persists in MLB data, r 0.06; 2.8.) |
| Q8 (Nov 13) | **One release, but Part A can ship alone** from its frozen checkpoint if Part B slips. |

Open: none. Grades on every proposed row stay with Drew.

## 2. Design

### 2.1 Pitch record

- Each pitch gains `lean_x` (inches, **arm side +**, glove side −), `lean_z` (inches, up +) and `spread` (multiplier on
  his miss size, 1.0). All default 0 / 0 / 1.0.
- Units are inches, not v1.1 plan 8.1's unitless −1…+1: the data, the grid and the HBP curve all speak inches.
- The coach sets them with chips per pitch: side (glove a lot · glove a little · even · arm a little · arm a lot), height
  (down a lot … up a lot), spread (tighter · normal · wider). "A little" = 1.5 in., "a lot" = 3 in. (Q1). Under the
  chips, a hint by pitch type (Q2): "Sinkers and changeups usually miss arm side; sliders glove side." Text only.
- A learned lean (2.5) is served as an offset only when the coach hasn't set one; otherwise it's a flag ("logs say he
  misses arm side").
- `lean_x`, `lean_z`, `spread` go into `PITCH_KEYS` (`learn.js:42`), validation (`check_inputs`), golden / fuzz / parity
  inputs (random leans), the roster editor, event snapshots (only when set, so unset snapshots don't change) and
  `snapArsenal`.

### 2.2 Landing with direction (`landing()`, `engine.py:819`, `engine.js:208`)

v1.1's four-zone shares stay the **lean-0 baseline, exactly**. A lean adds a geometric delta:

- **Target position** in the pitcher's frame: each spot (`QUADS`) has a lateral position relative to the batter (in /
  away corners ±6.7 in. from centre, middle and down-middle 0) and a height (up / down / middle; down-middle low;
  chase by class as `ev_adj` / `hbp_loc` already do). "In" is the arm side to a same-side hitter and the glove side to an
  opposite-side hitter (switch hitters bat opposite the pitcher).
- **A 2-D normal miss model** around that position, σ by level and command, generated into both engines as a table so
  the normal model reproduces `landing()`'s own heart / edge / off / non-competitive shares for each target at lean 0.
- **The delta** = zone shares of the normal model at (target + lean, σ × spread) minus at (target, σ), added to
  `landing()`'s shares, floored at 0 and renormalised. At lean 0 and spread 1 the delta is exactly 0.
- Effects that follow with no new rules: a lean toward the side the target is already on pushes misses off the plate;
  a lean toward the plate pulls misses over the heart; up / down work the same way for up / down targets; the engine
  prefers spots where his miss is safe.
- `miss_heart` (no side) stays an inactive trait.

### 2.3 Hit batters and wild pitches

- **HBP by geometry:** today it's `A_hbp(level) × HBP_LOC[target] × zone factor` (`engine.py:1560`, `hbp_loc` `:519`).
  v1.2 multiplies by `R = body(target + lean) / body(target)`: the chance the pitch crosses in the body zone, weighted by
  the measured MLB HBP-by-crossing-point curve, same / opposite side separately (research doc §3). `R` = 1 at lean 0.
  A lean toward the batter is counted in his frame (arm side = toward a same-side hitter).
- Research check (doc §5): a +2.7 in. arm-side lean on an inside target to a same-side hitter gives `R` ≈ 1.9 at MLB
  spread, 1.6 at amateur spread. The same lean pulls that pitcher's away target over the middle (23% → 29%).
- **Wild pitches** (`:1564`) rise only for down targets with a down lean, by the same delta on the non-competitive mass.

### 2.4 Level HBP calibration (L3, L5)

- **Today:** `calib.py` fits `OUTCOME_ADJ[level]["hbp"]` against the engine's own calls (`evaluate`, policy cached per
  level × pitcher × side). College throws almost nothing inside, so the price inflates until HBP per PA matches. D3
  charges 3.73% per inside fastball (7.3× MLB) while real HBP/PA is about 4× (doc §4).
- **v1.2:** the HBP price is fit on a **reference mix**:
  - the engine's own policy for everything else;
  - the fastball-class share aimed inside to same-side hitters set to the level's reference (MLB: measured, 28% four-seam
    / 48% sinker crossing the inside third; D1 / D3: 27%, Q4; HS: D3's). Single-A's 34% / 41% are reported as the
    check.
  - BB, K, swing and called-strike moments stay on the engine's own policy, as today.
- **Split check (L3):** decompose the fitted level's HBP excess over MLB into *reach* (pitches reaching the body zone,
  from the landing model and `wild`) and *hit given reach* (the price). Passes if each carries 35–65% of the log
  excess. Single-A measured about 45 / 55 (doc §3). Band proposed; Drew confirms.
- **Probe** (doc §4, no change kept): at the non-circular estimate (D3 price × 0.53), P1's sinker-in share at 1-0 goes
  6% → 23% (floor 25%).
- **Diagnosis step:** even at MLB's price, D3 four-seams go inside 0–11% (MLB-level calls 19%). Remove one input at a
  time (as v1.1 did for the game-mix collapse): level `wild`, `cmd`, whiff / swing shifts, the 2b fastball-zone lines,
  run values. Report what holds it back. **Fix only with Drew's decision**: it's a level-calibration question.
- **Realism gate:** refit `fit_all.py` after the change; K / BB / HBP within 1 point at HS / D3 / D1.

### 2.5 Learning each pitcher's lean (from his own log)

- **Estimator, per pitch, pitcher frame:** the mean of (landed − target) over his logged pitches, **averaged over
  arm-side and glove-side targets**. That cancels the pull toward the middle and the catcher's middle-ish setup (L4).
  The target is the glove spot when logged (bullpen mode or the optional game tap), else the called spot.
- Simulation (doc §6): unbiased only with a direction on "Way off" and both target sides; SD 1.0–1.4 in. at 60
  pitches. A 2.5 in. lean shows at about 60–110 charted pitches of that pitch.
- **Shrunk like the landing-today record:** estimate = sum of offsets / (K + n), K = 30 pitches per pitch (proposed,
  checked by the worlds test). Height the same way.
- **Through the trait gate** (`ACTIVE_TRAITS = []`, `learner.js:45`): served only if it's learnable within a season at
  realistic logging and changes calls measurably; otherwise a flag. Flag-only is the likely first outcome.
- Pieces:
  - learner rows carry the landed cell and the target (`learner.js:272`);
  - completeness judged per pitch, not per game (`:248`);
  - a cell generator in `worlds.js` (`:88`) with hidden leans;
  - a `TRUE_MISS` switch in `simulate.py` like `TRUE_MOVE` (`:423`);
  - setup check 1 ("landed near the target") reads the same pitcher-frame cell.

### 2.6 Logging changes (before data collection starts)

| Change | Where (`14e0ad2`) | Why |
|---|---|---|
| **"Way off" gets a direction:** four arrows (catcher's view: left, right, up, in the dirt), stored as a cell one ring outside the grid | `locPicker` `index.src.html:1430-1446`; `res.locCell`; `pa_log` landed `:967` | today way-off pitches drop out, biasing any lean 3–6 in. toward the middle (doc §6) |
| **Pitcher hand and batter side on every event** (`ph`, `bs`, the side the switch hitter batted) | `evBase` `:926`, event `:1027` | today they're joined from records; a lean is in the pitcher's frame |
| **Optional "Also log where the catcher set up"** (a second 5×5 tap, off by default) | setup row next to `logLoc` `:1800` | L4: the called spot isn't the glove |
| **Editing a location keeps its cell** | `:1471` clears `locCell` | a corrected pitch shouldn't lose its cell |
| **Location logging default on** for new setups (Q3, settled) | `S.setup.logLoc` | the learner needs it |
| **Bullpen mode (L8):** pick a pitcher; per pitch: pitch, glove spot (5×5), landed (5×5 or an arrow), optional radar. Saved as a `sessions` doc (`type: "charted"`), synced like other docs. No game state, no landing-today, no confidence. Feeds only the lean estimator. | new screen; `db.js` `sessions` store | the fastest way to get both target sides and real glove spots |

- **No Supabase migration expected:** `sessions` and `events` are generic `doc jsonb` tables
  (`20261103000000_pitch_caller.sql:125-128`). Step 4 confirms with `scripts/test-sql.sh`. If one turns out to be needed,
  it waits for Drew's go.
- TrackMan / Rapsodo uploads already store plate location (`upload_pitches.plate_x_ft` / `plate_z_ft`) but no target.
  Linking an upload to a charted bullpen by pitch order is **out of v1.2** (section 6).

### 2.7 The three follow-ups

- **HS ride-up (Q5, settled):** `COACH_RULE["ride_up_2k"]` (0.008, `engine.py:160`, `:376`; JS `:1262`) × `RHO_L` at HS (0.6),
  like every MLB-fitted term at HS. From v1.1's size table, 0.005 gave 35% at every level, so HS should land near 35%.
  `tests_v11`'s HS ceiling moves from 45% to 36%. C5 (D3) is unaffected.
- **Hot fade (L6):** `hot_fade` (`engine.py:174`, JS `:1243`) fades from 1.2× the pitch's normal share to nothing at
  1.6×. One fastball (normal 50%): 60% → 80% (today 60% → 90%). Slider in FB / SL / CH (normal 25%): **30% → 40%
  (today 35% → 65%)**, so a hot off-speed pitch also leans less than today. Checks: the 15 graded rows with a landing
  record (each has at most 10 of 50 pitches: 20%, under 1.2× for a pitch whose normal share is 1/6 or more, but not for
  an off-speed pitch in an arsenal with four or more off-speed pitches, where the fade would start); any row that moves
  is reported for regrading. Plus `game_mix_e2e`'s 21 games, and tier 3 seed 31337 (83% today) reported.
- **Setups (L7), after Steps 1–2:** S4 narrowed to a fastball away that went for a strike, with a payoff speed gap ≥
  8 mph. Then S2, S4 and S5 resized: each the smallest size that lifts its own fire row 5+ points, with the credit-only
  change rate inside 2–10% on all three staffs (`readthrough/setup_game_check.py`, `SETUP_SCALE=`). A rule that can't
  do both is dropped and listed. S5 (front door / back door) is re-gated by the lean: a sinker whose lean runs toward an
  opposite-side hitter's front hip pays the new HBP cost.

### 2.8 Hitter model (Part B; v1.1 plan 8.2 and research doc Part 2, with the second and third reviews applied)

**What persists (checked Nov 13, `research_v12/hitter_persistence.py` → `results/v12/hitter_persistence.txt`).** A tag
is only worth having if the trait carries from one season to the next. MLB hitters in both seasons:

| Trait | Source | 2024 → 2025 | 2025 → 2026 |
|---|---|---|---|
| Swing path tilt | Savant swing-path leaderboard (100+ swings) | **r 0.92** (n 402) | **0.93** (405) |
| Attack angle | same | 0.84 | 0.85 |
| Attack direction (pull / oppo at contact) | same | 0.79 | 0.79 |
| Pull % / opposite % (balls in play) | Savant custom leaderboard (150+ PA) | 0.69 / 0.56 | 0.69 / 0.51 |
| Early-count zone swing minus other zone swing | Statcast pitch sample (a quarter of the season) | 0.44 (≈ 0.76 for a full season) | (2026 not pulled) |
| Off-speed hard % (95+ mph) | same | 0.36 | — |
| **Off-speed hard % minus his fastball hard %** | same | **0.06** | — |

- Swing path, approach and spray are real, stable traits.
- **"Hits off-speed hard" as its own skill barely persists** (0.06). What persists in off-speed hard contact (0.36) is
  general power, which the power grade already carries. Hence Q7.
- Every public trait is MLB. Opponent college / HS traits come only from the coach's tag (Blast Motion data is a
  program's own hitters, not opponents).

**Tags (O4)** live in the hitter doc (RLS `manage_opponents`, `20261106000000_pitchiq_teams.sql:199-200`); no portal
page. Unknown = average. They map to the top / bottom third of each trait at the level.

**One channel each, sized net of what it overlaps** (the second review's rule):
- **Swing path:** a term on pitch height × fastball ride / drop (and off-speed down), on whiff and hard contact, net of
  the 2b fastball-zone fit, `SIDE`, damage and matchup memory, and S1 / S7. Inside the setup cap. Its weight shrinks as
  that hitter's spot memory builds (10 / (n + 10)). The location model's height leans enter through landing, not here.
- **Early-count approach:** in-zone swing rate at 0-0 / 1-0 / 0-1 minus his overall rate, on in-zone swings in those counts
  only. The eye grade, the 0-0 swing shift and the sit term stay. Its test is first-pitch swing rates, not "more
  first-pitch breaking balls" (this channel doesn't drive that directly).
- **Off-speed hitter (Q7, settled):** a prior on the existing off-speed damage seed (`damage()`, `engine.py:1347`, key `OS`),
  centred like `seedDamage` (`learner.js:767`); small size, per its persistence. The simulator maps it to `os`
  (`simulate.py:180`).
- **Spray:** inside / away hard contact and grounders, net of `SIDE` and crowding (`engine.py:356`, `:1544`). Pull fouls
  aren't reused (they already feed the timing reads).

**Fits** (same ship rule as every v1.1 fit: held-out gain > 2 boot SD, game-clustered bootstrap):
- **Traits from one season, the interaction tested on the next:** 2024 traits → 2025 pitches to fit; 2025 traits →
  2026 pitches held out. 2024 pitches carry the path metrics (checked: tilt and attack angle filled on every swing in
  `sc_2024-06-04.csv`), and the leaderboards have all three seasons.
- **Data to pull:** 2026 pitches (every 4th day, `fetch_statcast.py` extended to 2026; one 2026 day checked: 1,244 of
  2,714 pitches carry tilt, i.e. every swing) and the season leaderboards (`research_v12` pulls; `seasonStart` /
  `seasonEnd` are the working parameters, `season=` is ignored). The loader adds `hc_x` / `hc_y`, `launch_angle` and
  bat tracking; tilt adjusted for pitch height.
- **Behavioral effects × `RHO_L` at HS** (0.6). If a channel doesn't ship, it's a named coach rule sized by graded rows,
  like v1.0's reads, and labeled as such.

**Learning:**
- **Approach first** (most learnable).
- **Swing path** from whiffs / weak contact by pitch height and shape.
- **Off-speed** only if the logs pass the gate (Q7).
- **Spray stays coach-set:** no ball-in-play direction is logged.
- Evidence minimums are set for how many pitches an opposing hitter really sees at HS / D3 (30 per hitter is rarely
  reached). Coaches get the grades' "keep mine" flow. A hitter world in `worlds.js` comes first.

**Storage:** the tags go in `_ipv_cached`'s key (`engine.py:2164`) if they enter it.

**Not in v1.2:** ground-ball vs fly-ball tag effects; spray learning; height preference and bat speed tags (dropped, O4).

## 3. Steps

### Step 0: Start line (½ day)
- Branch `v1.2-work` from `main @ 14e0ad2`; commit this plan and the research doc.
- Re-run and capture: `scripts/test-app.sh` (exit 0), `golden_v11` check, `fast.py 40`, `tests.py`, `tests_v11.py`,
  read-through `scenarios_v11.json` (93/98), grid, `game_mix_e2e`.
- Statcast MLB (88 files) and Single-A (`research_v12/fetch_minors.py`, 88 files) pulled; row counts recorded.
- New `docs/BUILD_v1.2_REPORT.md`.

### Step 1: Structure, no behavior change (2 days)
- Both engines: `lean_x`, `lean_z`, `spread`; target positions; the σ table (generated, both engines); the landing delta;
  `R` for HBP; the wild-pitch delta. Inputs, validation, snapshots, `PITCH_KEYS`.
- **Proof:** `golden_v11` largest difference **0** with every lean 0; JS reproduces it; `fast.py 40` with random leans
  0 mismatches (new parity cases); `tests.py`, `tests_v11.py`, read-through unchanged.
- New checks:
  - the normal model reproduces `landing()` at lean 0 for every target / level / command;
  - a lean toward the target's side raises off + non-competitive; a lean toward the plate raises heart;
  - `R` = 1 at lean 0 and rises with a lean toward the batter;
  - Python = JS on 600 random pitches with leans.
- **Sensitivity report** (no gate): the call mix with every pitch at the research-check leans by type (sinker /
  changeup +2.7, four-seam +1.1, slider −2.1, other 0) vs even, on the grid arsenals. How far the inside share moves,
  each way.

### Step 2: Level HBP calibration (2 days)
- `calib.py`: the reference mix (2.4); refit HBP at D1 / D3 / HS (MLB checked); `fit_all.py` refit; realism gate.
- Split check (2.4).
- Four-seam-inside diagnosis (remove one input at a time). Report; any fix waits for Drew.
- Report: P1 at every count; four-seam / sinker inside shares by level vs Q4's reference and Single-A; HBP / BB / K by
  level; the grid's v1.1 checks; call changes on the 98 read-through rows.
- Freeze `golden_v12a`.

### Step 3: Learner (1½ days)
- Estimator, shrinkage, trait-gate entry, worlds cell generator, simulator `TRUE_MISS` (2.5).
- **Proof:** in the worlds test the estimator recovers hidden leans of ±1.5 / ±3 in. within 1 SE at 100 logged pitches
  per pitch, both target sides, directional way-off; and with today's log (way-off dropped, one side) it reports the
  bias the research doc predicts. Gate outcome recorded (likely flag-only).

### Step 4: Logging and bullpen mode (2 days)
- The 2.6 changes; bullpen mode; `db.js` and sync; `scripts/test-sql.sh` (no migration expected).
- **Proof:** new e2e:
  - a charted bullpen of 40 pitches saves, reloads, syncs and feeds the estimator;
  - game events carry `ph` / `bs`, a directional way-off cell, the glove spot when on;
  - editing a location keeps its cell;
  - `v11_fixture_test` (a v1.0 backup) still replays.

### Step 5: Follow-ups (1½ days)
- HS ride-up, hot fade, then S4 narrowed and S2 / S4 / S5 resized (2.7), in that order.
- **Proof:**
  - ride-up ≤ 36% of two-strike calls at every level (`tests_v11`);
  - C5 still passes;
  - the fade's sizes identical in both engines;
  - the 15 landing-record rows unchanged;
  - `game_mix_e2e` 21 games pass;
  - seed 31337 reported;
  - setup fire rows and change rates per rule;
  - dropped rules listed.

### Part A freeze (no extra time)
- Freeze `golden_v12a`; `scripts/test-app.sh` exit 0; Part A's report section complete. Part A can ship alone from here
  if Part B slips (Q8).

### Step B1: Hitter data and fits (3 days)
- Pull 2026 pitches and the 2024–2026 leaderboards; loader additions; a height-adjusted tilt.
- Fit each channel (2.8): 2024 traits → 2025 pitches, held out on 2025 traits → 2026 pitches; report per channel:
  fitted, coach rule, or dropped.
- Approach's full-season persistence on 2025 → 2026 (the quarter-season sample gave 0.44).

### Step B2: Engine and app (2½ days)
- Both engines: the four channels, net-of sizing, the shrink with spot memory, `RHO_L` at HS.
- App: four tag rows on the hitter card (unknown by default), carried in event snapshots only when set; the importer
  and the opponent screens.
- **Proof:** every tag unknown → `golden_v12a` largest difference 0; Python = JS on 600 random hitters; `tests.py`,
  `tests_v11.py` unchanged.

### Step B3: Learner and simulator (2 days)
- Hidden hitter traits in the simulator; a hitter world in `worlds.js`; approach and swing path learning with evidence
  minimums; off-speed per Q7; the "keep mine" flow.
- **Proof:** worlds test recovers approach and swing path at realistic HS / D3 pitch counts per opposing hitter, or
  reports that it can't (flag-only).

### Step B4: Hitter read-through rows (½ day, proposed; Drew grades in Step 6)
- One row per tag value that should move a call:
  - H1: flat / level swing: fewer riding fastballs up;
  - H2: uppercut / lift swing: the riding fastball up holds, the curve down gets riskier;
  - H3: aggressive early: fewer grooved first pitches;
  - H4: patient early: more first-pitch strikes in the zone;
  - H5: hits off-speed hard: fewer hittable off-speed pitches;
  - H6: pull-heavy: more away.
- Each with a no-move row (an unknown hitter).

### Step 6: Read-through and grid (1 day; Drew grades)
- `scenarios_v12.json` (own `.sha256`): v1.1's 98 rows plus location rows, **proposed**:
  - L1: arm-leaning sinker (+3) to a same-side hitter goes inside less than the same sinker at lean 0;
  - L2: that pitcher's away sinker to a same-side hitter is called less, or lower, than at lean 0;
  - L3: glove-leaning slider (−3) to an opposite-side hitter: back-foot slider holds or rises;
  - L4: down-leaning curve with a runner on 3rd: fewer dirt chases;
  - L5: up-leaning riding four-seam with two strikes: up target holds, down target falls;
  - L6: a glove-leaning cutter in on an opposite-side hitter's hands holds.
- Directions are from the geometry; floors and ceilings are set before running them.
- Regrade only rows whose calls moved (ranked list, like v1.1).
- Grid: v1.1's checks on all 10 arsenals at lean 0 and at the research-check leans.

### Step 7: Release (½ day)
- Final `golden_v12`; `scripts/test-app.sh` and `scripts/test-sql.sh` exit 0; CI green; build report and release notes.
- **Every device updates together** if snapshots carry lean fields a v1.1 app rejects (Step 1 checks whether v1.1's
  validation refuses unknown keys).
- Merge, any migration, the `v1.2` tag: **only on Drew's go.**

Rough total: Part A 11–12 working days, Part B 8 working days; about 19–20 in all.

## 4. Evaluation suite

1. **Coaching read-through** `scenarios_v12.json`, graded by Drew (main check). P1 and the location rows.
2. **Exactness:** lean 0 reproduces `golden_v11` exactly (Step 1).
3. **Calibration:** HBP split check; K / BB / HBP within 1 point; inside shares vs the reference and Single-A.
4. **Learner:** worlds recovery and the trait gate.
5. **Predictability grid** on all arsenals (v1.1's checks), at lean 0 and at the research-check leans.
6. **Game mix:** `game_mix_e2e` 21 games.
7. **App e2e:** logging, bullpen mode, sync, the v1.0 fixture.
8. Python = JS on every new function.
9. **Hitter fits** ship only on held-out gain (2025 traits → 2026 pitches); coach rules are labeled; every tag unknown
   reproduces Part A's golden exactly.

## 5. Risks

1. **No amateur location data.** The college reference mix comes from Drew's estimate and Single-A; HS is an assumption.
   The split check bounds it; P1 is graded, not tuned.
2. **The four-seam may stay off the inside at college** for a reason other than HBP. Step 2 diagnoses; Drew decides.
3. **Leans may not pass the trait gate in a season.** Then they're flags, and coach-set leans carry the feature.
4. **Coach-set leans without evidence** can move calls a lot (doc §5: ×1.9 HBP). Sizes per Q1, shown with the pitch.
5. **Called spot ≠ glove (L4).** Symmetrising over both target sides cancels the middle pull; the glove tap removes it.
6. **Bullpen ≠ game.** Bullpen leans feed only the lean estimator, not landing-today or confidence.
7. **Hitter traits are MLB-measured; opponents are tagged by coaches.** A wrong tag moves calls. Unknown is the default,
   sizes are net of existing terms, and the weight shrinks as in-game memory on that hitter builds.
8. **Opposing hitters are seen rarely at HS / D3**, so hitter learning may stay flag-only. The tags carry the feature.
9. **Size:** about 20 days in one release. The Part A freeze lets location ship alone (Q8).

## 6. Not in v1.2

- Hitter ground-ball vs fly-ball effects; spray learning; height-preference and bat-speed tags (2.8).
- The familiarity refit, P2 / P3 / P5 / P7, the cutter usage table (L1). Class values (closed).
- OpenCommand numbers in shipped code (O3).
- Linking TrackMan / Rapsodo uploads to charted bullpens.
- Aim-point coaching (Stroman-style extreme targets) as a call.
- Per-umpire zones; catcher framing.

## 7. Reviews

None yet. Before Step 0, a fresh-context reviewer checks this plan against `14e0ad2` (read only), as v1.1's three
reviews did. In particular: the σ-table exactness claim, the reference-mix calibration (does it reintroduce circularity
through `wild`?), and whether a v1.1 app refuses snapshots with lean fields.

## Research run this session (`research_v12/`, `results/v12/`)

| Script | What |
|---|---|
| `fetch_minors.py` | Single-A Statcast pull |
| `location_proxies.py` | inside shares, HBP by crossing point, P(HBP \| body), 3-0 split, per level |
| `oc_miss_direction.py` | OpenCommand check (research only) |
| `engine_inside_price.py` | v1.1's HBP per pitch by target and level |
| `probe_hbp_scale.py` | P1 / four-seam inside vs the D3 price |
| `lean_hbp_geometry.py` | HBP and heart share vs lean |
| `grid_lean_sim.py` | can the 5×5 grid show a lean |
| `hitter_persistence.py` | which hitter traits carry season to season (leaderboards 2024–2026, pitch sample) |
