# Pitch Caller engine v1.1: build plan (six pitches, profiles, setups)

Date: 2026-11-12. Start line: `main @ b318098` (v1.0, signed off Nov 12; tag `v1.0` pushed from Drew's PC).
Inputs: `docs/RESEARCH_pitch_types_sequencing_2026-11-12.md` (gap analysis, Tier-1 hypotheses H1–H4),
`docs/RESEARCH_pitch_profiles_and_setups_2026-11-12.md` (six pitches, profiles, setup rules S1–S10, N1–N2) and
`docs/RESEARCH_misses_and_hitters_2026-11-12.md` (miss direction and hitter model; built in v1.2, section 8).
Code references are to `b318098`. This version follows three fresh-context reviews (section 7) and Drew's Nov 12 call to
split the work: **v1.1 = six pitches, profiles and setups; v1.2 = miss direction and the hitter model, right after.**

## 0. What v1.1 is

v1.0 knows four kinds (`KINDS = ("FB", "SL", "CB", "CH")`), and shape tags are almost cosmetic: checked Nov 12 on the
average three-pitch arsenal at D3, a sweeper and a tight slider give **identical** calls in every count, and a riding vs
running fastball moves the fastball share by under 1 point. Setup logic doesn't work (look value moves calls by about
±0.0004 runs; "Sets up" almost never fires). v1.0 does call curveballs when an arsenal has one (15–27% of calls in the
grid arsenals); the "only three pitches" look came from no sinker or cutter kinds and an FB / SL / CH test arsenal.

v1.1 does three things:

1. **Six pitches with profiles** (fastball, sinker, cutter, slider, curveball, changeup), each described by its speed and
   movement relative to his own main fastball. Tags by default, measured numbers override.
2. **Profiles that change calls**, from real data: Statcast fits where they pass the held-out test, and labeled MLB
   per-profile rates where they don't (so a v1.1 sweeper never plays like a tight slider).
3. **At-bat setup rules**: named payoff credits that fire after a real setup pitch in the same at-bat, under five
   "will it work" checks, applied at the current pitch only, so they never cost value now.

Standing rules carry over: baseball logic and real data above simulation (the hitting sim is one input, not a gate);
one engine, no flags; nothing is "done" until its check ran and the output is in `docs/BUILD_v1.1_REPORT.md`; don't
over-build; Drew grades the read-through.

## 1. Decisions

Settled (Drew, Nov 12):

| # | Decision |
|---|---|
| E1 | **Six kinds:** `FB` (four-seam), `SI` (sinker), `FC` (cutter), `SL`, `CB`, `CH`. The sweeper is a slider profile and the splitter is a changeup profile; no separate kinds. A splitter (vertical) and a sweeper (horizontal) are very different profiles. |
| E2 | **Profiles:** FB rides / runs / cuts / straight; SI run / drop / two-seam; FC hard / big / ride; SL gyro / tight / sweeper / slurve; CB 12-6 / sweeping / power / slow; CH fade / drop / split / firm. Pitcher slot: over the top / high ¾ / ¾ / low ¾ / sidearm. |
| E3 | **Tags are the default; measured numbers (TrackMan / Rapsodo) override.** |
| E4 | **Setups are at-bat based** (reset each plate appearance and on a pitching change). |
| E5 | **Never give up value to set up later.** Only the payoff pitch gets credit, after the setup pitch was actually thrown. **Tie-break:** when two calls cost exactly the same, prefer the one that enables a live payoff (2.4). |
| E6 | **Front door / back door stays on at HS and D3**, small and gated: command and strikes come first. |
| E9 | **No fixed pitch scripts.** Setups stay probability-based payoff credits. |
| E10 | **Familiarity carry-over and slot adjustments are built only if fit 2a ships.** |
| O1 | **Catcher signs:** SI = 5, FC = 6 (`SIGN = {FB:1, CB:2, SL:3, CH:4}` today, `index.src.html:590`, `web/lib/docs.ts:5`, `roster.js:936`). A migrated pitch keeps the sign it had until the coach changes it. Six can't be flashed with one hand, so the app labels 5 and 6 as card / wristband numbers and every sign stays editable. |
| O2 | **"Up, then down" (S1) stays.** The shipped eye-level fit says changing eye level slightly lowers whiffs and chases on average (`beta_E` −0.142, `beta_E_S` −0.253); S1 is measured within its shape pair on top of that term and sized net of it; if the data doesn't support more, it stays at its smallest size. |
| O3 | **OpenCommand** (non-commercial license): research check only (v1.2). |
| S1 | **Split (Nov 12):** miss direction (E7) and the hitter model (E8) move to v1.2, built right after v1.1 signs off (section 8). |
| S2 | **Default miss lean is zero (Nov 12):** in v1.2 a pitch's miss lean applies only once the coach sets it or the learner earns it. |

## 2. Design

### 2.1 Pitch record and class logic

- `kind ∈ KINDS = ("FB", "SI", "FC", "SL", "CB", "CH")`; `shape` = one of E2's tags for that kind, or `""` (typical).
- Helpers in both engines: `is_fastball(kind)` (FB, SI, FC) and `pclass(kind)` → `"FB"` / `"OS"`. Every class-logic site
  moves to them. At `b318098` that is **29 sites in `engine.py` and 28 in `app/engine.js`** by the first review's count
  (`kind == "FB"`, `kind != "FB"`, `"FB"` / `"OS"` keys; `is_offspeed` sites are already correct); Step 1 recounts and
  records the list. Outside the engines: `golden/cases.py:55`, `fuzz.py:96-100`, `simulate.py:389` and the finesse preset
  (`:118`), `grid_v10.py:24`, `tests.py:402, :496`, `readthrough/scenarios.py:39` (grades off-speed as `kind != "FB"`,
  which would grade a sinker as off-speed), `readthrough/read.py:30, :152, :161, :202`, `review.py:80, :113`,
  `app/learn.js:245`, `app/import.js:155, :175`.
- **Situation keys that contain a kind** use `key_kind(p)` = `"FB"` for any fastball-class pitch, else the kind:
  `damage()` (`engine.py:753`), matchup memory `succ|KIND` / `hard|KIND|q` (`:108-109`), `mashed` (`:131`), the coach
  reads' `away` / `went_back` keys (`:188, :190`) and the learner's `hitterModel` keys (`learner.js:704-705`). Stored keys
  stay valid, v1.0 reproduces exactly, and it matches how matchup memory was fitted (by class,
  `readthrough/v10_memory_fit.py:107-120`).
- Lookups that need SI and FC entries: `DEFAULT_VELO` (`engine.py:319/370`, `engine.js:17/70`), `KIND_W` (`:642`),
  `SHAPES` fallbacks (`:666`), `TYPED["gb"]` (`:1000, :1162`, `engine_data.json`), `shape_fit` and `gb_rate`, which test
  old tag strings directly (`:731-733`, `:1000`; JS `:244-246`, `:590`). In Step 1 every SI / FC entry equals the FB
  value (so nothing moves); Step 1b and Step 2 give them their own values.
- **Main fastball** `primary_fb(arsenal)`: the coach's "main" mark; else the fastball-class pitch he has thrown most in his
  records; else the first of FB, SI, FC; else the fastest pitch. The fits use the same idea (most-thrown fastball-class
  pitch per pitcher-game). `v_fb` (`engine.py:1296`) uses fastball class.
- **Default speed off his own fastball (Step 1b):** a pitch with no speed entered is his main fastball's entered speed
  less the profile's college speed gap (`resolve_speeds`, called where a call is solved); with no fastball speed entered,
  the default fastball (85) less the gap. v1.0 used fixed defaults (a 72-mph fastball got a 77-mph slider).
- **Relative shape** `rel_shape(p, arsenal)`: (Δmph = main FB − pitch, ΔIVB = pitch − main FB, HB with arm side +), from
  measured numbers when present, else the tag defaults for his level (2.2). Speed and vertical are relative because the
  hitter judges them against the fastball; horizontal break stays absolute because the hitter sees the ball's sideways
  movement directly and MLB's own pitch labels (sweeper, gyro) are drawn on it. Lefties are mirrored.
- **Stuff grade is relative to the profile:** the coach's 1–5 grade means "how good is this pitch compared with others of
  its kind and profile", so a grade doesn't double count what the profile already says (app hint text, Step 5).

### 2.2 Profile table and tag thresholds (filled in Step 1b)

`PROFILES[level][(kind, tag)] = (Δmph, IVB, HB)` for a right-hander (mirrored for lefties), with a typical row per kind.
- `mlb`: medians by profile from the Statcast pull (2.5), using the thresholds below.
- `college_d1` / `college_d3`: Rapsodo college averages (four-seam about 85 mph, 8 in. run, 16 in. ride; slider 9 mph
  off, little sweep; curve 12 mph off, about −1 in.; changeup 7 mph off), profile spreads proportional to the MLB table.
  An estimate.
- `hs` / travel: college movement shrunk 15%, same speed gaps. An assumption until we have HS data.
- Slot adjustment (higher slot: more ride and curve drop; lower: more run and sweep) only if 2a ships (E10); otherwise
  slot feeds only the tunnel model (`SLOTS`, `:658`) as today.

**Tag thresholds** (MLB inches and mph; movement thresholds scale by each level's movement ratio, 0.85 at HS). Fastball-
class pitches are compared with the level's typical pitch of the same kind; off-speed with his main fastball. First
match wins, in the order listed; nothing matched = typical (`""`).

| Kind | Tags, in order |
|---|---|
| FB | **rides:** IVB ≥ typical + 2. **runs:** HB ≥ typical + 3. **cuts:** HB ≤ typical − 5. **straight** (dead zone): IVB ≤ typical − 2 and HB within typical ± 3. |
| SI | **two-seam:** IVB ≥ typical + 3. **drop:** IVB ≤ typical − 3. **run:** HB ≥ typical + 2. |
| FC | **big:** HB ≤ −7 or Δmph ≥ 7. **hard:** Δmph ≤ 4 and HB ≥ −4. **ride:** IVB ≥ typical + 3 (Step 1b; was ΔIVB ≥ −4). |
| SL | **sweeper:** HB ≤ −10 (Step 1b; was −12). **slurve:** IVB ≤ −3 and HB ≤ −6. **gyro:** \|HB\| ≤ 3. **tight:** otherwise. |
| CB | **12-6:** drop (−IVB) ≥ 2 × \|HB\|. **sweeping:** \|HB\| ≥ drop. **power:** Δmph ≤ 9. **slow:** Δmph ≥ 15. |
| CH | **firm:** Δmph ≤ 5. **split:** ΔIVB ≤ −12 and \|HB − main FB HB\| ≤ 4. **drop:** ΔIVB ≤ −11. **fade:** HB ≥ main FB HB + 4. |

These were the starting values; Step 1b checked them against Statcast's own labels (2024 fit, 2025 held out;
`results/v11/profiles.txt`):
- **Sweeper:** one move (HB ≤ −12 → −10) reaches 84% (2024) and 82% (2025) agreement, precision 80%.
- **Splitter and slurve:** no movement threshold reaches 80% without tagging mostly other pitches (best 62% of splitters
  at 43% precision, 71% of slurves at 17%). Those labels come from the grip, which movement can't see. So **a pitch name
  that names a profile sets the tag**: Statcast ST / SV / FS / FO in the fits, and Sweeper / Slurve / Splitter /
  Forkball / Two-seam / 12-6 curve in the app. The thresholds tag everything no such name covers.
- **Knuckle curve** names a grip, not a profile, so it is tagged by its movement like any curve (and a stored "Knuckle
  curve" migrates to a typical curve).
- **Ride cutter:** judged against the typical cutter, like every fastball-class tag. The first draft compared it with
  the game's main fastball, which tagged flat cutters from sinker pitchers as "ride".

The same thresholds classify measured pitches in the app (`import.js`, through the engines' `tag_for`) and the fits
(2.5), so a tag means one thing everywhere.

### 2.3 Profiles that change calls: fits, with a data-backed fallback

The pitch model reads profiles through four places: the whiff / chase weight per kind (`KIND_W`, `:642`), the zone lines
(`shape_fit`, `:727`), the platoon patches (`:737-740`; `SIDE` stays, `:72-78`) and grounder rates (`TYPED["gb"]`).
Step 2 gives each (kind, profile) its own values in two layers:

1. **Fitted terms** (2a–2c, `seq_fit.py` hygiene, ship on held-out gain > 2 boot SD). 2a tries model C (continuous
   `rel_shape` and slot); if C doesn't ship and B (kind / profile dummies) does, B ships.
2. **Profile priors** wherever a fitted term doesn't ship: the per-profile rates measured on the 2024 training data
   (whiff per swing, chase, called strike per take, hard per contact, grounders per ball in play, each split by same /
   opposite side and early / two-strike counts), expressed as the difference from the v1.0 class value. They are real
   MLB rates, labeled as priors in the code and the report. They must not make the 2025 held-out fit worse by more than
   one boot SD; if one does, it is halved until it passes, and the report says so. At HS only the difference from the
   v1.0 class value is scaled by `RHO_L` (0.6).

Either way the coach sees profiles change calls, and the report says which ones are fitted and which are priors.
Descriptive tables (2e grounder rates, 2f level defaults) aren't held-out tested; their sources are documented.

### 2.4 Setup rules (research doc, Part 3)

- `Situation.pa_log`: this at-bat's pitches so far, each `(pitch name, target, result, landed cell or None, contact or None,
  read or None)`. Simulator, app (on `g.pa`, kept by undo and reload like `shaken`) and replay append after every pitch;
  it clears at each new plate appearance and on a pitching change (`changePitcher` sets `g.pa = null`,
  `index.src.html:1046`). It goes into the event `sit` snapshot so replay can rebuild calls.
- **Root only, like the pair terms.** `solve_table` (`:1611`), `golden/cases.py compute` and `simulate.py:509, :568` set
  `pa_log = ()` exactly where they clear `last`. Count values never contain a setup credit, so the setup pitch can't gain
  from one: that is what makes E5 hold. `needs_resolve` (`:1709`) doesn't need to watch `pa_log`.
- **Three-ball counts get no setup credit and no tie-break**, matching v1.0's root rule (`root_call`, `:1645`: three-ball
  counts rank by myopic cost).
- `setup_payoff(p, q, s, arsenal)` → `(credit, rule)` for the candidate call. A rule needs its setup pattern in `pa_log`
  **and** five checks:
  1. **Landed near the target.** A logged cell in or next to the target's area passes; "Way off" fails; with no cell
     logged, a called strike, whiff or foul passes and a ball fails (a ball of unknown location may have been a wild
     miss).
  2. **Not squared up.** No foul read "straight back" (the app's "he was on it", `index.src.html:973`; `squared_up`,
     `engine.py:181`).
  3. **The payoff pitch is live:** not shaken off, not `not_landing`, trusted.
  4. **The count allows it:** v1.0's hard rules win; chase payoffs only where `targets()` has a chase target (`:281`).
  5. **The arsenal has the profiles the rule names.**
- **Reads count at logging level 3 ("Plus hitter reads") and up**, as v1.0's squared-up read does (it is kept only when
  `S.setup.inputs >= 3`, `index.src.html:973`); below that a read is treated as not logged, even though the form offers
  it (`:1329-1330`). Check 2 uses the same rule. A rule whose "doesn't fire" condition is "he was on time or early" (S2, S3, S7) reads it
  this way: a pulled foul, a "straight back" foul or an "out in front" whiff means on time or early (no fire); a foul with
  no read is unknown (no fire); a called strike, a whiff with no read or a "late" / "fooled" whiff passes.
- **S7's setup** is a riding fastball at the top of the zone that got a whiff (not "out in front") or a foul read "opposite
  way" (late). A foul "straight back" never sets it up (check 2), which resolves the research doc's "foul back" wording.
- S1–S10 are credits; N1–N2 are small costs, built only if their Statcast check supports them. Each is a named entry in a
  new `SETUP_RULE` dict (like `COACH_RULE`, `:157`), scaled by `run_scale(level)`, applied in `cost08` next to the coach
  reads (`:1536`).
- **Sized net of what the engine already gives the call.** Overlaps: S1 with eye level (`pair_terms` `:832-835`) and the
  2b fastball-zone term; S2, S3 and S10 with tunnel-chase (`:853`) and the `late_fb` / `early_os` reads (`:177-180`); S4
  with `timing_B` (`:810`) and tunnel-chase; S7 with the repeat-after-whiff term (`:843`) and the 2b zone term; S8 with
  `rep_same_spot` and `went_back`. Each credit is the smallest round value that passes its graded rows **on top of** those
  terms. Sizes are frozen only after Step 2's terms are final.
- **Stacking cap on the setup part only:** setup credit ≤ 0.02 × run scale, and coach + setup ≤ max(coach, 0.02 × run
  scale). v1.0's coach reads alone already reach 0.06 (e.g. went_back + hot) and stay as they are.
- **S5 (front / back door, E6):** command grade ≥ 4, the pitch landing today, the hitter worked away / expanded earlier in
  the at-bat, two strikes (0-2, 1-2, 2-2, 3-2; at 3-2 it can't fire, three balls) only; the smallest credit of all rules.
  Check: S5-credited calls ≤ 15% of two-strike calls in the low-slot sinker arsenal, and none with command < 4.
- **Tie-break (E5), exact ties only.** A cost credit can't break ties inside the mixed solver, and an on/off rule would
  make it jump, so it is a smooth shift after the solve. For a setup-enabling call A and a competing call B whose costs
  differ by `gap`, move a share `max(0, 1 − gap / TIE_EPS)` of B's probability to A, with `TIE_EPS = INTENT_E × run
  scale` (0.0005 × run scale, the engine's existing numerical-noise margin, `:2071`) and **at most 5 points moved per
  call in total**. Exactly equal costs get the full share up to the cap; outside the noise margin nothing moves. "Enables
  a payoff" means: A is a strike target, and a rule whose payoff would pass checks 3–5 at the count A leads to if it's a
  strike. No tie-break at three balls. Report: how often it fires, the largest shift, and the hitter's best-response gain
  against the shifted mix on the grid (it should be within the solver's own noise).
- **Decision rule for the Statcast direction checks** (written before running them): for each of S1, S2, S3, S8, S10, N1,
  N2, compare the payoff pitch's whiff / chase / called-strike / hard rates after the setup pattern vs the same pitch after
  anything else, same count, on top of the existing pair terms. If it points the right way, the rule is sized normally;
  if the 95% interval includes zero, smallest size that passes its rows; if it points the wrong way with the interval
  excluding zero, the rule is dropped unless Drew keeps it, and a kept rule stays at its smallest size (S1 is already kept
  by O2). N1 / N2 are built only if the check supports them. S4, S5, S6, S7, S9 are reported where the data allows.

### 2.5 Statcast mapping for the fits

`seq_fit.py` `CLASS` (`:19`) becomes a kind map: FF → FB, SI → SI, FC → FC, SL / ST / SV → SL, CU / KC / CS → CB, CH /
FS / FO → CH. Profiles come from the 2.2 thresholds on measured movement, not from the label (Statcast labels are used
only to check the thresholds). The loader keeps speed, `pfx_x` / `pfx_z`, release position and extension, plate
location, `stand`, `p_throws`, `pitch_type` (`seq_fit.py:52-64`) and adds `arm_angle` (present in the CSVs for 2024 and
2026; the second reviewer pulled one day of each on Nov 12). v1.1 uses the same seasons and sampling as v1.0: 2024
(train) and 2025 (held out), every 4th day (`fetch_statcast.py`). The CSVs aren't on disk (`data/statcast/` is not
committed), so Step 0 pulls them.

## 3. Steps

### Step 0: Start line (½ day)
- Confirm tag `v1.0`; branch `v1.1-work`; commit the three research docs and this plan into `docs/`.
- Re-run and capture: `scripts/test-app.sh` (exit 0), `golden_v10.py check`, `golden/fast.py 40` / `fast.js 40`,
  `tests.py` (45/45), v1.0 read-through (71/71), and the v1.0 predictability grid's pitch-type shares (the baseline for
  the call-change checks).
- `python3 fetch_statcast.py` for 2024 and 2025; confirm row counts and that `arm_angle` is filled.
- New `docs/BUILD_v1.1_REPORT.md` with the baseline.

### Step 1: Six kinds and profiles, no behavior change (2 days)
Pure refactor. Its proof is that v1.0's golden reproduces exactly.
- Both engines: `KINDS`, `is_fastball`, `pclass`, `key_kind`, `primary_fb`, every class site (recounted and listed in the
  report) and the outside sites in 2.1; SI / FC lookups equal to the FB values.
- **One migration point, one table.** `migrate_pitch` runs when a `Pitch` is created, in both engines, so every reader
  (golden and read-through inputs, fuzz, simulator, app roster load, replay, learner, Supabase reads, re-import) gets the
  same result. `check_inputs` (`:1221`) validates **after** migration. The table is keyed on the pitch's real name
  (`type`, stored by the app, `app/db.js:218-224`) when present, otherwise on the old kind and tag:

  | Stored `type` (v1.0 kind/tag) | v1.1 | | Old kind/tag, no `type` | v1.1 |
  |---|---|---|---|---|
  | Four-seam (FB/ride) | FB/rides | | FB/ride | FB/rides |
  | Two-seam (FB/run) | SI/two-seam | | FB/run | FB/runs |
  | Sinker (FB/sink) | SI/run | | FB/sink | SI/run |
  | Cutter (FB/cut) | FC/typical | | FB/cut | FB/cuts |
  | Slider (SL/tight) | SL/tight | | FB/"" | FB/typical |
  | Sweeper (SL/sweeper) | SL/sweeper | | SL/tight, SL/sweeper | same |
  | Slurve (SL/"") | SL/slurve | | CB/loopy | CB/slow |
  | Curveball (CB/loopy) | CB/typical | | CB/sharp | CB/power |
  | Knuckle curve (CB/sharp) | CB/typical (Step 1b: a grip, not a profile) | | CH/fade | CH/fade |
  | 12-6 curve (CB/sharp) | CB/12-6 | | CH/drop | CH/drop |
  | Changeup (CH/fade) | CH/fade | | | |
  | Splitter, Forkball (CH/drop) | CH/split | | | |

  Without a `type`, "cut" and "run" could be a four-seamer's movement, so those stay four-seam profiles; "sink" exists
  only for sinkers. A type migrates a pitch only while it still carries that type's v1.0 tags, so a coach's later edit is
  never undone. Six more rows cover a v1.0 fastball tag arriving on a v1.1 sinker or cutter (a shape accepted from the
  v1.0 portal before Step 5): SI/sink → SI/run, SI/ride → SI/two-seam, SI/cut → SI/typical, FC/cut, FC/run, FC/sink →
  FC/typical. The one deliberate number change: a stored generic "Curveball" (v1.0 CB/loopy) becomes CB/typical, which
  moves only its tunnel movement (−14/−5 → −10/−7). Migrated pitches keep their v1.0 sign in their own `sign` field (O1). Every change is logged with the pitch's name. A migration-only kind change is **not** a learner change
  point (`learner.js:421`); a real kind change still is. `roster.js:583` updates `kind` with `type` on re-import.
- In this step every migrated pitch carries exactly its old numbers: movement, `shape_fit` line, `KIND_W`, grounder rate,
  default velocity (a migrated cutter with no velocity entered keeps the FB default until Step 1b). `shape_fit` and
  `gb_rate` are rewritten to the new pairs with the old values.
- Proof: `golden_v10.py check` 500 cases largest difference 0 (the inputs include 108 FB/sink pitches), `golden_v10.js`
  PASS, `fast 40` 0 mismatches, `tests.py` 45/45, read-through 71/71, `test-app.sh` exit 0. New checks: every row of the
  table migrates as listed; an SI/run pitch costs exactly what FB/sink did; a migrated FC costs exactly what FB/cut did; an
  arsenal whose only fastball is SI runs (`cases.py`, `fuzz.py`); new kinds validate; a grep for any comparison of `kind`
  to a fastball string outside the helpers (`==`, `===`, `!=`, `!==`, single or double quotes) → 0.

### Step 1b: Profile table and thresholds (1 day)
- Fill `PROFILES` for every level (2.2) and the thresholds; agreement table against Statcast labels.
- SI / FC get their own default velocity and movement from the table (FC about 4 mph under the main FB at MLB, from the
  data). `SHAPES` (`:650`) and `DEFAULT_VELO` (`:319`) become views of `PROFILES`.
- This changes calls slightly (tunnel movement and default velocity only). Report: v1.0 vs Step 1b pitch-type shares on
  the grid arsenals; re-freeze `golden_v11a`.
- **Old event snapshots read through the roster's type** (open from Step 1): a game logged before v1.1 stored its pitches
  in v1.0 terms without a type, so a typed Two-seam in an old snapshot reads as FB/runs, not SI/two-seam. Identical
  numbers in Step 1; from 1b on they differ, so the learner and replay read old snapshot pitches through
  `migratePitch(kind, shape, roster type)` (the learner's change-point check already does).

### Step 2: Profiles that change calls (3 days; each fitted item ships only on its own numbers, priors fill the rest)
Fit hygiene: 2024 train, 2025 held out, game-clustered bootstrap, cluster-robust SE, ship on held-out gain > 2 boot SD
and a 95% interval excluding 0 where a coefficient is tested.

| Item | Fit | Fallback if it doesn't ship | Replaces |
|---|---|---|---|
| 2a (H1) pitch model | A: v1.0 class model; B: + kind / profile dummies; C: + continuous `rel_shape` and slot. Targets: whiff given swing, chase given out of zone, called strike given take, hard given contact. | profile priors (2.3) | `KIND_W` (`:642`), the off-speed lines of `shape_fit` (`:727`) |
| 2b (H2) fastball zone | Fastball-class profile × height × inside / away by batter side, on whiff, hard and called strike; the sinker line keys on kind SI (every tag); FC/ride gets a line only if the fit supports it. Checks the high-sinker finding (in-zone up fine, off the plate up bad). | priors by fastball profile and height | `shape_fit` fastball lines |
| 2c (H3) platoon | Signed horizontal break relative to the batter and drop size, by same / opposite side. **`SIDE` stays**, keyed on `pclass`. | per-profile platoon priors | the SL same-side +0.3 and CH same-side −0.3 patches (`:737-740`) |
| 2d (H4) familiarity | **Only if 2a ships.** Per pitch with carry-over by `rel_shape` distance vs v1.0's class count; starter games, both samples. If it ships, `familiar` moves from class keys to per pitch in `Situation`, the app's `fam` (`index.src.html:739`), the simulator's `fam` (`simulate.py:448`) and golden inputs. | v1.0 term stays | `familiar` (`:397`, `:935`) |
| 2e grounder rates | `TYPED["gb"]` by kind and profile (descriptive). | — | the six-entry table (`:57`) |

- `RHO_L` (HS 0.6) scales only each profile's difference from the v1.0 class value; physical terms (grounder rates)
  aren't scaled.
- Realism gate after Step 2: refit `fit_all.py` pitcher-side keys at hs / D3 / D1 if K / BB / HBP move more than 1 point.
- **Call-change checks** (the guard against "ships and looks like v1.0"): v1.0 vs v1.1 pitch-type shares on all grid
  arsenals, plus matched pairs that differ in one profile only. Proposed pass bands (Drew confirms or changes them at
  Step 4):
  - sweeper vs gyro slider: the sweeper's share vs same-side hitters at least 5 points above the gyro's, and below it vs
    opposite-side hitters;
  - riding vs dead-zone fastball: up-target share at least 10 points higher for the riding one;
  - split vs fade changeup: higher two-strike share for the split; firm vs fade: lower two-strike chase share for firm;
  - 12-6 vs sweeping curve: more early-count use vs opposite-side hitters for the 12-6;
  - a sinker or cutter in an arsenal takes at least 10% of calls overall, mostly where the research puts it (sinker in to
    same-side hitters, cutter vs opposite-side hitters).
- Re-freeze `golden_v11` at step end. Report per item: fitted or prior, held-out numbers, 5 example calls before / after.

### Step 3: Setup and payoff rules (2–3 days; plumbing can start after Step 1b, sizes frozen after Step 2)
- **First, the rows:** one fire row and one no-fire row per rule (S1–S10, N1–N2 if built) in
  `readthrough/scenarios_v11.json`, graded by Drew; sizes are tuned to these graded rows.
- `pa_log` in both engines, simulator, app, event snapshots, replay and golden inputs, root only (2.4).
- `setup_payoff`, the five checks, the read handling, `SETUP_RULE`, net-of sizing, the setup-only cap, S5 gates, the
  tie-break (2.4).
- **Explanations.** Add a "setup" term to `_WHY_PARAMS` (`:1911`) in both engines and `golden/explain_twin.js` (zero
  `SETUP_RULE`, recompute the delta). A payoff call's why line: "Set up by the {setup pitch} {spot}: {payoff pitch}
  {spot}". Intent: a credited call is labeled "Payoff", except at two strikes, where "Finish" / "Expand" keep their label
  and the why line names the setup (three balls never get a credit, so "Get it over" is untouched). The dead look-value "Setup" intent
  and "Sets up" why template are removed; look value stays in the costs. `tests_v10_explain.py` → `tests_v11_explain.py`.
- Statcast direction checks with the decision rule in 2.4.
- Proof: each rule fires on its pattern and stays silent on each "doesn't fire" case, including the no-read cases; the cap
  holds; `pa_log` is empty in every table solve (unit check); no credit or tie-break at three balls; tie-break report.
  **Call-change check:** in simulated games, how often a setup credit changed the top call, per rule and overall.
  Proposed band: 2–10% of pitches thrown after a qualifying setup (Drew confirms at Step 4).

### Step 4: Read-through and test arsenals (1–2 days, Drew grades)
- New test arsenals (simulator presets, `tests.py`, grid): ride FB + 12-6 + split CH (over the top); sinker + sweeper +
  fade CH (low slot); four-seam + hard cutter + gyro slider + curve (¾); dead-zone FB + sinker + slider; HS two-pitch
  fastball + slurve. The finesse preset's FB/sink becomes SI/run.
- Predictability grid over every arsenal: v1.0's checks still hold with the tie-break on (top call ≤ 85% except 3-0,
  first-pitch strike-target share ≥ 85%, no chase as the top call at 3-0 / 3-1 / 2-2, the 3-1 band), plus the S5 limits.
- `scenarios_v11.json` with its own `.sha256` (`scenarios.py:29-33` refuses a changed file): v1.0's 71 rows (regrade only
  rows whose calls changed), Step 3's rule rows, and profile rows (sinker in to same side, sweeper rare vs opposite side
  unless plus, gyro for strikes, 12-6 early-count strike vs opposite side, split as a two-strike pitch vs opposite side,
  firm changeup not a whiff pitch, dead-zone fastball not low, S5 not over-relied).
- Drew confirms the call-change bands (Step 2) and the setup band (Step 3). The report lists each rule's fire rate and
  top-call change rate per 100 pitches.

### Step 5: App, portal and data (2 days)
- App: `KINDS` (`index.src.html:589`), `SHAPE_OPTS` (`:592`), `SIGN` (`:590`, O1, with 5 / 6 labeled as card numbers),
  `KCOLOR` (`:591`), `PCOLOR` (`:1073`), CSS `.k-*` (`:146`), the "main fastball" mark, the new profile names, the stuff
  grade hint ("compared with other pitches of this profile"). The slot picker already exists.
- Importer (`app/import.js:102`, `:155`, `:175`): pitch names map through the same table as `migrate_pitch`; measured
  pitches get their tag from the 2.2 thresholds; arm-side flip and release reference use the fastball class.
- Supabase: a migration widening `upload_pitches.kind` (`20261110000000_uploads.sql:36`) to the six kinds and remapping
  rows by `pitch_type`; `pc_proposals_set`'s shape whitelist (`uploads.sql:249`) to the new tags plus a kind field;
  pending proposals with old tags remapped. `scripts/test-sql.sh`.
- Learner: specs keyed `kind|shape` (`:181, :210, :310`) read migrated specs; `learn_test`, `worlds_test` (40 seasons),
  `stage2_test`.
- Portal: `web/lib/docs.ts:3-8`, `uploads.ts:14, :124-126` (its shape proposer emits old tags), `:155`, `engine.d.ts:3`,
  `demo.ts:10`, `stats-panel.tsx:11`, `content/movement.ts:4`, the 3D views' kind lists; `web/lib/engine.js` and
  `engine_data.json` synced; `npm run typecheck`, web demo test.
- Replay and migration proof: a v1.0 backup fixture with Cutter / Two-seam / Sinker / 12-6 / Splitter pitches and
  kind-keyed hitter data replays exactly through Step 1's code, and the migration log lists every change. If Drew sends a
  real roster backup, it is run the same way and its before / after calls are captured.

### Step 6: Release (1 day)
- **Every device updates together:** a v1.0 app can't read a pitcher stored with SI / FC (its engine rejects the kind),
  so the release note tells the coach to update every iPad, and the portal (Step 5) ships the same day.
- Final `golden_v11` freeze; `scripts/test-app.sh` and `scripts/test-sql.sh` exit 0; GitHub CI green; read-through graded;
  build report complete; Drew signs off; tag `v1.1`.

Rough total: 12–14 working days.

## 4. Evaluation suite (what "v1.1 works" means)
1. **Coaching read-through** `scenarios_v11.json`, graded by Drew (main check).
2. **Call-change checks:** profile pairs inside Drew's bands; sinker / cutter used where the research puts them; setup
   credits change the top call at the agreed rate.
3. **Fits** shipped only on held-out gain; priors pass the no-harm check; the report labels each.
4. **Predictability grid** on all arsenals, tie-break on: v1.0's checks plus S5 limits.
5. **Rule unit checks** (fire / no-fire per rule, no-read cases), setup cap, three-ball exclusion, tie-break report,
   `pa_log` root-only check.
6. **Realism gate** K / BB / HBP within 1 point at hs / D3 / D1.
7. **Goldens:** Step 1 reproduces `golden_v10` exactly; `golden_v11a` after 1b; `golden_v11` after Step 2 and at release;
   `fast 40` per edit.
8. Yardstick (simulated games): reported only, not a gate (Drew, Nov 11).

## 5. Risks
1. **Fits may not ship.** The profile priors keep profiles real; the report says which terms are fitted and which are
   priors.
2. **Amateur transfer.** College defaults come from one device's averages; HS is an assumption; priors are MLB rates
   scaled at HS.
3. **Stored data.** Old rosters, open games, event docs, Supabase rows and proposals carry four kinds and old tags. One
   migration point and table, `key_kind`, the exact-golden proof and the backup fixture guard it.
4. **Coaching vs data** on eye level (O2): S1 kept, measured within its pair, sized net of the fitted term.
5. **Over-firing setups.** Five checks, at-bat scope, root-only credits, the setup cap, no three-ball credit, the no-fire
   rows, exact-tie-only tie-break capped at 5 points; fire and change rates reported.
6. **Threshold drift.** Tags are drawn from fixed thresholds; the Statcast label check bounds how wrong they can be.

## 6. Not in v1.1
- Miss direction and the hitter model (v1.2, section 8).
- Spin axis / mirroring inputs. Separate sweeper or splitter kinds (E1).
- Fixed A-then-B scripts (E9). Setups across at-bats (E4); cross-at-bat hitter memory already exists.
- Familiarity carry-over and slot adjustments unless 2a ships (E10).
- Aim-point coaching (Stroman-style extreme targets).

## 7. Reviews (Nov 12)

### First review: GO WITH CHANGES, applied
An independent reviewer checked the first draft against `b318098` (read only, no tests run). Applied: `key_kind` for
kind-built keys, SI / FC lookups, the class sites, one migration point validated after; setup credits root only; the
tie-break as a smooth shift after the solve; signs as Drew's call (O1); S1 / S7 / S8 sized net (O2); the stacking cap on
the setup part only; Payoff intent and a why-line term; the type-based migration; Supabase proposals, per-pitch
familiarity storage, a v1.0 replay fixture, `pa_log` in snapshots and reset on pitching changes; arm angle, one main-
fastball rule, `SIDE` kept, `RHO_L` on the difference only, matchup memory by class, N1 / N2 gated on data; graded rows
before sizing; familiarity carry-over and slot adjustments deferred unless 2a ships. I confirmed the golden inputs hold
108 FB/sink pitches.

### Second review (miss direction and hitter model): GO WITH CHANGES, carried into v1.2
Its fixes (refit and sizes for the miss model, a pitcher-relative cell estimator and logging changes, one channel for the
off-speed tag, tags fitted net of existing terms, Statcast columns and splits, learning limits, storage) are in section 8.

### Third review (whole plan): GO WITH CHANGES, applied
A third reviewer checked the whole plan against `b318098` (read only; it pulled one day of Savant data for 2024 and 2026
to check columns). Applied:
- **Tie-break:** the old margin (0.002 × run scale) covered about 80% of the solver's temperature in big 3-2 spots
  (0.010 × 0.5 × 0.5 × run scale, `engine.py:1375, :1193`; I checked), so it was a standing lean. Now exact ties only
  (`INTENT_E`), capped at 5 points, no three-ball counts, and a best-response report.
- **Profile fallback:** labeled MLB per-profile priors where fits don't ship, with a no-harm check; B ships if C fails.
- **Order:** the profile table moved to Step 1b, because the setup rules (S4's firm-changeup gate) need it; setup sizes
  frozen after Step 2.
- **Overlaps:** S2 / S3 / S4 / S10 / S1 / S7 overlap lists completed; sized net.
- **S7 and reads:** S7's setup is a whiff or a late foul, not "straight back"; no-read cases defined for every logging
  level.
- **Migration:** one table keyed on the stored pitch name (v1.0 stores Cutter as FB/cut and 12-6 as CB/sharp,
  `app/db.js:219-222`; I checked), so a cutter becomes a cutter and a 12-6 stays a 12-6; FC velocity unchanged in Step 1.
- **Thresholds** for every tag, on one stated basis, checked against Statcast labels.
- **Call-change checks** with proposed bands; a written decision rule for the direction checks.
- **Minor:** the "three things" count; the SI zone line on every sinker tag; a grep that catches `===` and quotes;
  descriptive tables not held-out tested; card numbers for 5 / 6; stuff grade relative to profile.
- **Scope:** split into v1.1 and v1.2 (Drew agreed); default miss lean zero (Drew agreed).

## 8. v1.2 (next, after v1.1 signs off): miss direction and the hitter model

Carried design, with the second and third reviews applied. v1.2 gets its own refreshed plan and a fresh review before it
starts; sizes are set net of v1.1's shipped terms. Rough size: 8–10 working days.

### 8.1 Miss direction (research doc, Part 1.3)
- Each pitch carries `mx` (−1 glove side … +1 arm side) and `mz` (−1 down … +1 up). **Default 0 (S2).** The coach's
  setting applies directly; a learned value is served as a capped offset only when the coach hasn't set one, otherwise
  it's a flag. If the trait gate fails, a learned lean is a flag only.
- `landing()` (`engine.py:559`): `target_side(q, s)` = +1 when the target is on the pitcher's arm side of the plate
  (inside to a same-side hitter, away to an opposite-side hitter), −1 glove side, 0 middle / down-middle; likewise up /
  down. Switch hitters bat opposite the pitcher (`sameSide`, `index.src.html:693`). The share moved is `k · |lean|` of the
  edge-and-heart mass (lean toward the target's side → off the plate) or of the off-plate mass (lean away → toward the
  heart), `k` = 0.25, capped at 0.10 of the zone mass; same for height. Labeled assumptions.
- Downstream: `hbp_loc` (`:335`, used `:955`) scales with the lean toward the batter for inside and middle targets; the
  wild-pitch rate (`:959`) rises only for down targets or a down lean. `hbp_loc`'s lean factor is normalized to average
  1 over calib's same / opposite-side mix (`calib.py:27, 166-180`). With default 0 nothing moves until a lean is set, so
  the `fit_all.py` refit is a check (it runs if K / BB / HBP move more than 1 point with the test arsenals' leans).
- `miss_heart` (`:541-542`, `:592-602`; JS `:135, :165`; `learner.js:25, :44, :188`; `gate_test.js:14`;
  `worlds_test.js:168, :217`) has no side: it stays an inactive key. `mx` / `mz` go into `PITCH_KEYS` (`learn.js:42`);
  golden / fuzz / parity inputs get random leans.
- Learning: add the landing cell to learner rows (`learner.js:272`); estimate each lean as the shrunk mean offset between
  target cell and landed cell in pitcher-relative terms, **per target side** (the 5×5 grid clips misses past the edge,
  which would bias edge targets toward the center); judge completeness per pitch, not per game (`:248`); "Way off" gets a
  direction (`index.src.html:1362`); editing a location keeps its cell (`:1406`, `roster.js:751`); a cell generator in
  `worlds.js` (`:88`) and trait-gate entries. No learned trait has passed the gate yet (`ACTIVE_TRAITS = []`,
  `learner.js:45`), so flag-only is the likely first outcome.
- Simulator: a `TRUE_MISS` switch like `TRUE_MOVE` (`simulate.py:423`), hidden leans, and the simulator logs a cell.
- Setup check 1 uses the same pitcher-relative cell mapping.

### 8.2 Hitter model (research doc, Part 2.3)
- Tags (Drew, O4): swing path (**uppercut / lift · average · flat / level**; "steep" is avoided because many coaches mean
  chopping down by it), early-count approach (aggressive · average · patient), off-speed hitter (struggles · average ·
  hits it hard), spray (pull · all fields · oppo). Unknown = average; measured numbers override.
- One channel each, sized net of what it overlaps:
  - off-speed: a prior on the existing off-speed damage seed (`damage()` key `OS`, `:918, :933`; centered like
    `seedDamage`, `learner.js:744`); the learned version is the existing OS residual (`:704`) past a threshold; the
    simulator maps it to `os` (`simulate.py:213`);
  - swing path: a term on height × ride / drop net of the 2b zone fit, `SIDE`, damage and matchup memory, and S1 / S7,
    inside the setup cap; its weight shrinks as that hitter's spot memory builds (10 / (n + 10));
  - approach: in-zone swing rate at 0-0, 1-0, 0-1 minus his overall rate, on in-zone swings in those counts only (the eye
    grade `:907`, the 0-0 shift `:893` and the sit term `:903` stay). Its test is about first-pitch swing rates, not
    "more first-pitch breaking balls", which this channel doesn't drive directly;
  - spray: inside / away hard contact and grounders net of `SIDE` and crowding (`:938`, `:181`); timing fouls aren't
    reused for it.
- Data: daily Statcast pulls (or Savant season leaderboards) for per-batter traits; 2024 → 2025 train, 2025 → 2026 held
  out (the third reviewer confirmed 2024 has the path metrics, so no fallback split is needed); the loader adds `hc_x` /
  `hc_y`, `launch_angle` and bat tracking; tilt adjusted for pitch height; a persistence check before the off-speed fit.
- Learning: approach (most learnable), off-speed, swing path; spray stays coach-set (no ball-in-play direction logged);
  evidence minimums tuned to how many pitches an opposing hitter actually sees at HS / D3 (30 per hitter is rarely
  reached), the grades' "keep mine" flow; a hitter world in `worlds.js` (`:52`) first.
- Storage: tags in the hitter JSON doc (RLS `manage_opponents`, `pitchiq_teams.sql:346`); no portal profile page; tags in
  the `_ipv_cached` key (`:1545`) if they enter it.
- Not in v1.2: ground-ball vs fly-ball tag effects; spray learning.
