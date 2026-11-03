# Pitch Caller: how the system learns over time

Design spec v4 (Nov 2, 2026). v4 adds section 17: what Phase 1 built and measured, and the engine finding that now
comes first. v1 was reviewed by a separate agent, and each finding was either fixed here or proven
wrong (section 15 lists them). v3 adds the main goal below, the server architecture (section 16), and personal traits
(section 5.7). Each part is marked **Built**, **Tested in prototype**, or **Planned**.

**The main goal:** the engine learns each pitcher specifically. Out of the box, it treats every pitcher with a given
grade and pitch shape the same way. Over time, it should replace those one-size-fits-all assumptions with **his own
traits and tendencies**: where he actually misses, which spots each of his pitches works in, how he holds up from the
stretch, deep in counts, deep in games and under pressure. All of it stays bounded, with certainty attached, and
anchored to the default engine until his data earns the change.

## 1. Rules this design keeps

1. **Raw pitches are the only truth, and learning is a replay.** Every learned number is rebuilt by replaying the raw
   logged pitches in order. The learner never trusts anything derived and frozen at the time (section 4).
2. **Each layer learns only what the layer above it didn't already expect.** This is how nothing gets counted twice.
   It's enforced in code, not assumed (section 3).
3. **The coach's grades are the starting point and are never overwritten.** Learned values can't move more than 1.0
   grade point from his grade without his OK (a flag).
4. **Nothing goes crazy.** Every number the engine receives is capped per game and in total (section 11).
5. **Every number carries a certainty,** and certainty drives flags, variety and what the coach is shown.
6. **Shared data is per-level numbers only,** never anything about a team, player, game or date (section 10).
7. **Prove it, game by game.** If learning predicts worse than the coach's grades for a pitcher, it switches itself off
   for him and says so (section 12).

## 2. What's been measured

From `learn_test.js` (built), a talent-drift prototype, and an in-game leak test, all simulated against the engine's
own outcome model:

| Finding | Number |
| --- | --- |
| Stuff learned from results alone | about a quarter of the error gone at 500 pitches of a pitch type, 60%+ at 1,500 |
| Stuff can't be pinned tighter than | about ±0.4 even at 2,000 pitches |
| Command from results alone | doesn't move (entry of 4 stayed at 3.97 when the truth was 2) |
| Command with "where it ended up" logged | within about 0.4 of the truth at 500 pitches |
| One game (about 25 pitches of a pitch type) | almost no information; game-to-game form is invisible in results |
| Talent allowed to drift 0.1 per game, instead of the fixed 6-month fade | mid-season injury tracked better (command error 0.63 vs 0.86 over the last 8 games); costs a steady pitcher about 0.03 |
| Drift plus change detection from results | caught 3 of 6 simulated injuries, about 8 games late; false-alarmed on 2 of 6 stable pitchers at that sensitivity |
| Reported certainty | about right or cautious when coaches' errors are typical (truth inside ±1 sd 86-96% of the time); overconfident right after a real change (about 50%) |
| In-game state frozen into logged pitches (the leak in 3.2) | pulls learned command 0.1-0.15 back toward the entered grade, and drags a correctly graded pitcher down about 0.15 |

What this means:
- **Results are slow evidence.** For one pitcher, learning works on the scale of a season. Fast learning has to come
  from **direct measurements** (location, velo, TrackMan, check-ins) and from **borrowing from similar pitchers and hitters**.
- **Short-term form can't be learned from results.** It comes from the in-game layer and direct signals only.
- **Automatic change detection from results is low-power.** It can only flag; real changes come in through direct
  signals and the coach.

## 3. How it fits together: five layers, five clocks

| Layer | Clock | What it holds | Status |
| --- | --- | --- | --- |
| **L1 Level** | seasons, all teams | how hitters at a level swing, chase and make contact; run values | Built (fixed); learning Planned |
| **L2 Population** | your whole database | similar pitches (shape → stuff, bullpen → game command), hitter types, opponent teams, tuning settings | Planned |
| **L3 Talent** | weeks to seasons | each pitch's stuff and command with certainty and splits; fatigue curve; each hitter's tendencies | Partly built |
| **L4 Day** | one game | check-in, velo today, rest, catcher | Partly built |
| **L5 In-game** | pitch to pitch | confidence, "is it landing today", hitter read tonight, our usage this game | Built (engine) |

The call, top to bottom: level tables → population prior → his talent for this pitch in this split → today's
adjustments → tonight's in-game state → engine cost and mixed strategy → the call.

Learning, bottom to top after each game: raw pitches → L3 replay for every pitcher and hitter involved → L2 refit → L1
shared numbers (end of season, opt-in).

### 3.1 The rule that keeps layers from double counting
Each layer measures **surprise relative to the layer above**, not relative to a fixed league number:
- **L5 in-game.** "Is it landing today" compares today's strike rate to the strike rate **his learned command
  predicts**, not the fixed 66% / 58% the engine uses now. Confidence moves on surprise too: a ball from a pitcher
  expected to be wild moves it less. This is an **engine change** (`landingEstimate`, `updateConfidence`), and it gets
  verified with the parity and regression tests.
- **L4 day.** Check-in and velo today are offsets from *his own* norms.
- **L3 talent.** Learns from what the engine expected given L2 and L1.
- **L2 population.** Fitted on the evidence itself, not on L3 values that were already pulled toward L2 (that would
  make shrinkage feed on itself).
- **L1 level.** A new level-table version triggers a full replay of L2 and L3, so level mistakes aren't absorbed into players.

### 3.2 The leak this fixes (found in review, confirmed by test)
Today, each logged pitch freezes tonight's "landing today" and confidence. Both are measured against league-fixed
targets, so a pitcher with poor command looks "wild today" every game. The season learner then sees the wildness as
already expected and doesn't lower his command, while the live call counts his wildness twice. Measured effect: 0.1-0.15
of a grade (section 2). The fix is 3.1 plus section 4: in replay, the in-game state is **recomputed for each candidate
talent value** from the raw results, never read from the frozen snapshot.

## 4. Raw data and replay

### 4.1 What every pitch must log (extends the built `events` store)
Raw inputs only, enough to rebuild everything:
- Game id, pitch number, date, device id, app version, engine version, learner version.
- Pitcher id, pitch id, pitch kind at the time; hitter id (or slot plus opponent team when unnamed); catcher id.
- Count, outs, bases, inning, score, pitch count, batters faced.
- Target (pitch and spot); who chose it (engine, engine with variety, coach's own call, re-call after a shake-off);
  the probability of the chosen call; the random draw.
- **What was actually thrown, if it differs** (cross-up), and where it ended up: the exact grid cell, not only the
  zone. A miss arm side and a miss glove side both count as "edge" today but mean different things.
- Result, contact quality, swing read, foul direction.
- Check-in id in effect.
- Logging completeness for the game (share of balls in play with contact logged, share of pitches with location logged).

The built `sit` and `ars` snapshots stay, but **only as an audit record** of what the app predicted at the time. The
learner never reads them.

### 4.2 Replay
- Replay sorts by date, then game, then pitch number, and uses the game date as its clock (not "now"). Run twice, it
  gives the same answer on any device.
- Triggered after each game for the pitchers and hitters involved, after any edit, after a learner or level-table
  version change (everyone), and on a nightly background schedule.
- **Where it runs:** on the server (section 16). The iPad never replays history; it only runs the in-game layer and
  makes calls from the pitcher profile it downloaded before the game.

### 4.3 Data lifecycle
- **Undo and delete:** soft delete (built). Replay skips deleted pitches; deletions sync. The undo stack is in memory
  and lost on reload, so an **edit-past-pitch** screen is needed (Phase 1). Editing a result forces a replay of that
  game, because every later pitch's count, bases and in-game state changes.
- **Renames:** history follows pitch ids (built). Migrated old events without a pitch id are matched once, at
  migration, to a pitch id. Never matched by name again.
- **Kind change** (the same pitch id moved from slider to curve): automatic change point.
- **Multi-device:** events are append-only with a device id. Two devices charting the same game is detected (same
  date, opponent and overlapping pitch numbers) and the coach picks one.
- **Versions:** every learned record stores the learner and level-table versions it came from.

## 5. Layer 3: talent (the core flywheel)

### 5.1 What's learned per pitch
Stuff and command (1-5), each with a certainty. One **joint** fit includes his overall value plus side effects (same vs
opposite hitter) and count effects (ahead, even, behind), with priors on the effects only. This replaces the built
separate slice fits, which reused the same pitches twice and double-counted when side and count overlap.

### 5.2 How it updates
- **Fit on an unbounded scale** (mapped to 1-5 only for display and the engine), so certainty is right near 1 and 5.
  The built fit clamps at the bounds, which bends both the value and the certainty there.
- **Start:** the coach's grade ±0.7 (an assumption, measured from your data in Phase 2). For a new pitch with both a
  coach grade and a population prior, they're combined by how reliable each has proven to be (both count equally
  until measured).
- **Drift between games:** 0.06-0.1 per game (final value from the Phase 1 tests), more over long gaps like the
  off-season.
- **After each game:** the replay updates value and certainty (the prototype uses a Laplace/Kalman filter over the
  engine's own likelihood).
- **Change points** widen certainty so new games move it fast:
  1. a coach mark ("new grip", "back from injury"),
  2. a TrackMan session showing velo ±2 mph or break ±3 in,
  3. a pitch kind change,
  4. a season boundary (partial).

  Results-based detection over the last ~8 games only **suggests** a change mark, since it's low-power.

### 5.3 What counts as evidence

| Input | Teaches | Notes |
| --- | --- | --- |
| Result | stuff, a little command | slow |
| Where it ended up (cell) | command, and his miss direction | the only real command signal from charting |
| Contact quality | stuff | only from games with 90%+ of balls in play logged |
| Hit or out without contact | nothing beyond "in play" | defense and luck |
| Swing read, foul direction | the hitter | L5 and hitter talent |
| TrackMan / Rapsodo | shape → stuff prior (L2); bullpen → command prior (L2); change points | direct |
| Check-in | today's feel (L4); over time, how reliable his self-report is | direct |
| Cross-up logged | that pitch is scored as what was thrown at the target it was thrown to, or dropped if unknown | |

### 5.4 Which pitches the learner uses
- **Engine calls (with or without variety): used.** The engine's choice depends only on logged information, so it
  doesn't bias the fit.
- **Coach's own calls and re-calls after a shake-off: kept out of the fit by default.** They can depend on things that
  aren't logged (he's feeling the curve), and that would bias it. They're scored separately, and that score is shown.
  If they're more than 30% of a pitcher's pitches, they come in at half weight with a note.
- **Selective logging:** contact quality and location detail are used only from games where they were logged on 90%+
  of the pitches they apply to. "Missing at random" isn't assumed beyond that. A world test checks the rule.

### 5.5 What the data can't separate, and the rule for each
- **Command vs feel.** The engine adds his confidence to his command. So check-in feel is a day offset with a learned
  weight (starting at half), and command is learned net of it.
- **Stuff vs the hitters he faced.** Hitter memory switches to "what he did against what the engine expected" (section
  7) **in Phase 1, before the pitcher fit uses it**. Until then, hitter memory is left out of the pitcher likelihood.
  Hitters with no name get their team's effect (L2), so a tough schedule is still credited.
- **Command vs umpire vs catcher framing.** Only your own staff's pitches are charted, so a per-game umpire term would
  be mixed up with your staff's day and your catcher's framing. **There's no umpire term until both teams are charted.**
  Catcher framing is a possible later catcher variable.
- **Level-table errors.** Absorbed into players until L1 is refit, and then a full replay fixes it (3.1).

### 5.6 Other per-pitcher learning
- **Fatigue curve** (Phase 2): where his command and stuff actually start to slip by pitch count, plus rest days and
  his last outing's load. Needs location logging. It replaces the level default and the manual field once certain enough.
- **Check-in reliability** (Phase 2): how well his self-rating predicts how the pitch plays. That sets its weight.
- **Composure** (Phase 3): a per-pitcher multiplier, held to 0.5-1.5, on how much results move his confidence. It
  needs its own world test first.

### 5.7 Personal traits: his own version of the engine's assumptions (Planned, the core of the goal)
Stuff and command are two numbers per pitch. Everything else the engine believes about a pitcher is currently a
constant, the same for everyone. Each constant below becomes a **trait** with:
- a default equal to today's constant, so a new pitcher behaves exactly like the default engine;
- a per-pitcher offset learned in the same replay as talent, pulled toward zero by a prior, with a certainty;
- a cap on the value handed to the engine (section 11), and a flag when a confident trait differs a lot from the default.

| Trait | Engine assumption today (engine.js) | What his data reveals | Evidence it needs |
| --- | --- | --- | --- |
| **Miss pattern** per pitch | misses spread the same way for everyone (`landing`) | where he misses: arm side, glove side, up, in the dirt | location cell; likely a few hundred pitches of that pitch (an estimate, measured by the gate) |
| **Spot accuracy** per pitch | command is the same at every target | he hits down-away but not up-in | location cell; data per target spot, so slow |
| **Where each pitch plays** | fixed rules: riding fastball +0.5 up, off-speed -1.0 up, slider +0.3 away to same-side, change -0.3 to same-side (`shapeFit`) | his change works up; his slider works to opposite-side hitters | results + contact by spot and hitter side |
| **Platoon split** per pitch | changeup to same-side hitters gives up harder contact (`hl += 0.2`) for everyone | his real split by pitch | results by hitter side (the side split in 5.1, extended per pitch) |
| **From the stretch** | runners on base don't change his command | many amateurs lose command from the stretch | location and results with runners on vs empty |
| **Fatigue** | command slides from edge to heart after a fixed level pitch count (`over` in `landing`) | his own point, slope, and whether velo, command or stuff goes first | location, velo readings, pitch count (5.6) |
| **Times through the order** | +0.012 hard-contact logit per batter faced (`hl`) for everyone | whether hitters catch up to him faster or slower | contact quality by trip through the order |
| **First inning** | none | slow starters who settle in | location and results in the 1st vs later |
| **Sequencing** | fixed pairing values: off-speed after a high fastball +1.0, repeat after a whiff, and so on (`pairing`) | which of his pairs actually play | a lot of data (2+ seasons); last to come |
| **Composure** | the same confidence reaction for everyone (`CONF_DELTA`) | how much a walk or hard hit rattles him | results after bad events (5.6) |
| **Big spots** | confidence counts 1.5x in big spots for everyone (`isBigSpot`) | whether he rises or shrinks | very little data per season; flag-only until there's plenty |
| **Wild pitches** | 12% of off-speed in the dirt get by with runners on (`wp`) | his real rate with your catcher | wild pitches logged (a new tap) |

The evidence column is an expectation, not a measurement; only stuff and command have been tested so far (section 2).

**Gate before any trait ships.** Each trait must pass two tests in the simulated worlds:
1. **Learnable:** a pitcher whose trait truly differs is recovered within one season of realistic data at his logging
   tier, and a pitcher whose trait doesn't differ isn't moved.
2. **Matters:** a realistic difference changes his calls by a measurable amount of runs.

Traits that fail either test stay at the default and aren't shown, so the profile never fills up with noise. The order
above is the expected order, but the gate decides.

**What this needs from the engine:** each constant above has to be overridable per pitcher through his profile.
Defaults must reproduce today's engine exactly: the parity and regression tests prove it.

**What this needs from charting:** location (the grid cell) is behind more than half of these traits. That makes it
the single most valuable optional input; the app should say so where the coach turns it on.

## 6. Layer 4: the day

Built: check-in feel per pitch, arm and sleep fatigue shift, personal fatigue point, catcher blocking.

Planned:
- **Velo today:** optional radar or TrackMan readings of his first fastballs. The gap from his own norm moves today's
  stuff by at most ±0.5. It's the most direct form signal available.
- **Rest:** days since his last outing and that outing's pitch count, computed from the database.
- **Check-in weight:** comes from 5.6.

## 7. Hitters

- **Phase 1 fix:** hitter memory scores what he did **against what the engine expected**, not raw outcomes, so a hitter
  who only faced your ace doesn't look weak. Pitchers and hitters are refit alternately until they settle.
- **Teams (L2):** an opponent-team effect for unnamed hitters and as a starting point for new ones.
- **Types (L2, Phase 2):** aggressive, patient, fastball hitter, chases off-speed, contact. New hitters start from a
  mix of types.
- **Engine change (Phase 2):** per-hitter swing and chase offsets, which the engine has only per level today.
  Verified by parity and regression tests.
- **Across seasons:** the same drift idea as pitchers (hitters develop), and a merge tool for the same hitter listed
  twice or on a new team.

## 8. Layer 2: borrowing from your whole database (Phase 2)

- **Shape → stuff** and **bullpen zone rate → game command**: fitted on game evidence directly, across every pitch with
  enough data.
- **Hitter types, team effects, and the tuning settings:** how far coaches' grades are off, how fast talent drifts, how
  big splits are. All measured rather than assumed.
- **Not enough data yet:** each one starts from the prototype values and shows "not measured yet".

## 9. Variety for learning (decision 1: OK, within limits)

- **What it does:** in qualifying counts, the mix leans slightly toward the call whose value is least certain.
- **Only among calls already in the engine's mix.** Never adds a call.
- **Only in low-stakes counts.** Never in a big spot, a 3-ball count, 2-2 or 3-2.
- **Limits:** +10 percentage points at most to one call; at most 1 in 8 calls in a game.
- **Cost cap:** 0.03 runs per game in expected cost. That cost is computed with the current model, so it's an estimate;
  the scoreboard tracks how it actually turned out.
- **Never overrides** the trust line, a shake-off, or the coach.
- **Logged on every affected pitch,** with an off switch in Setup.
- **Pitches below his trust line get no calls, so variety can't reach them.** Instead a **"starved pitch" flag** tells
  the coach the pitch hasn't been seen in game situations. The coach decides whether to use it in a low-leverage spot
  or a bullpen session.

## 10. Shared numbers per level (decision 2)

- **Shared, only with opt-in:** season totals per level. Swing rate by zone, chase rate, whiff rate by pitch family,
  called-strike rate on the edge, contact mix, run values, count values. Counts and sums only.
- **Never shared:** names or ids of teams, pitchers or hitters; games; dates finer than the season; lineups;
  pitch-by-pitch data; anyone's learned values.

Protections:
- **Who can contribute:** only signed-in, verified programs, so fake accounts can't meet the thresholds.
- **Minimum size:** a level's number is published only with 10+ programs and 20,000+ pitches.
- **No sub-levels** smaller than a whole level (no conference-level numbers) until each sub-level clears the same bar.
- **Added noise and rounding** (differential privacy), so no single team can be backed out of a total.
- **Fixed membership per release:** a team that joins or leaves mid-season shows up only in the next season's release.
  Otherwise, comparing two releases would reveal that team's numbers.
- **Capped weight and outlier trimming:** one program counts at most 10%. Programs far out of line are set aside.
- **Scored on devices:** a new level-table version is scored on each opted-in device, against its own held-out games.
  Only the scores go back, and the version is released only if it wins overall.
- **High school:** sharing needs the program's opt-in (the school's call). No names ever leave the device anyway.
  Retention: each program decides how long raw pitches stay on its device; learned values can be kept after raw data is removed.

## 11. Limits (decision 1: nothing goes crazy)

Each limit applies to the **value handed to the engine**. The learner keeps its uncapped estimate internally, so flags
still fire.

| Quantity | Per game | Total |
| --- | --- | --- |
| Stuff, command | ±0.15 normally; ±0.5 for 5 games after a change mark | ±1.0 from the coach's grade until he accepts the flag |
| Accepting a flag | the jump is phased in over 3 games | |
| Splits (side, count) | ±0.1 | ±0.5 |
| Check-in feel | none | feel kept in 0.30-0.95 |
| Velo today | none | ±0.5 stuff |
| Fatigue point | ±5 pitches | ±25 from the level default or coach's number |
| Composure | ±0.1 | 0.5 to 1.5 |
| Hitter memory | seeded at most 8 swings' worth | score within ±1 |
| Variety | +10 points per call, 1 in 8 calls | 0.03 runs per game |
| Level tables | only by versioned release | must win the on-device scoring |

## 12. Flags and the scoreboard

### Flags (decision 3: flag, don't apply)
Thresholds come from the measured numbers in section 2:

| Flag | When | Choices |
| --- | --- | --- |
| Grade disagreement | uncapped learned value more than 1.0 from his grade, and the certainty excludes his grade by a wide margin. Stuff: needs about 400+ pitches. Command: only with location logged. | Accept (phased in) / Keep mine / Remind me in 5 games |
| Possible change | the last ~8 games disagree clearly. Low-power, so phrased as a question. | Mark changed / Ignore |
| Shape change | a TrackMan session moved velo or break past the thresholds | Mark changed / Ignore |
| Starved pitch | a pitch with few game pitches because he doesn't trust it | Info |
| Fatigue point | learned point more than 10 pitches from the one in use, with confidence | Use learned / Keep |
| Check-in reliability | his self-rating hasn't predicted anything over 10+ check-ins | Count it less / Keep |
| Learning off | the scoreboard switched learning off for him | Shown automatically |
| Command can't be learned | no location logged for this pitcher | Info: turn on location logging |

**Coach edits after seeing a flag:** the app logs whether the coach had seen the learned value. An edit made without
seeing it counts as independent evidence. An edit made right after seeing it doesn't, because that would count the
same pitches twice.

### Scoreboard
- **Scored before seeing the game.** Each game is scored with the values learned *before* it. Scoring with values that
  already include it would make learning look better than it is.
- **The comparison:** the same replay with the coach's grades swapped in. Both run on each pitcher's last 300 pitches.
- **Calibration:** of pitches it called 30% likely strikes, were about 30% strikes? A simple chart per pitcher and overall.
- **Safety switch:** if learning loses to the coach's grades by a clear margin, calls go back to his grades for that
  pitcher, with a flag. Learning keeps running in the background.
- **Also tracked:** what variety cost in practice, and how the coach's own calls scored separately.

## 13. Proving it before trusting it

Each layer ships with simulated worlds where the truth is known, with pass criteria written down before the code. Games
are played pitch by pitch with the real in-game updates, which is the gap that hid the leak in 3.2. They run at every
level and every logging tier.

| World | Pass |
| --- | --- |
| Steady pitcher, right grades | no drift beyond ±0.15 on average; no grade flags; change suggestions in at most 1 of 10 seasons |
| Wrong grades | moves toward the truth at the rates in section 2; flags fire once certain |
| Low-command pitcher, in-game state live (the leak) | learned command within 0.1 of the no-leak result |
| Gradual improvement | tracks within its reported certainty |
| Sudden change with a coach mark | caught within 3 games |
| Sudden change without a mark | suggested within about 8 games, at least half the time |
| Hot and cold weeks | doesn't chase them |
| Freshman, no history | starts from similar pitchers (Phase 2) |
| Rarely called pitch | variety gets it data within the cost cap; a pitch below the trust line raises the starved flag |
| Charter mistakes (10% wrong) | stays within limits; no false flags |
| Selective logging | the 90% rule keeps it unbiased |
| Coach calls driven by unlogged feel | excluding them keeps the fit unbiased |
| Tough schedule | not marked down |
| Level change | carries over; certainty widens |
| Population (typical coach errors) | truth inside ±1 sd 65-85% of the time |
| Replay | identical results on two runs and two devices |

A **season replay** of real games (each pitch predicted before it's seen) is added once real seasons exist.

## 14. Build order

- **Phase 1, talent done right, and the trait framework:**
  - the per-pitcher trait framework in the engine (defaults identical to today) and the trait gate tests
  - the first traits that pass the gate (expected: miss pattern, platoon split per pitch, from the stretch, fatigue)
  - server replay service and offline profile download (section 16)
  - logging raw inputs (4.1)
  - replay with in-game state recomputed (3.2)
  - the surprise-based in-game layer (engine change)
  - a joint fit on the unbounded scale
  - drift and change points
  - hitter memory against what the engine expected
  - pitch-selection and logging-completeness rules
  - limits and flags
  - the scoreboard and safety switch, scored before each game
  - the edit-past-pitch screen
  - cross-up and miss-cell logging
  - the worlds tests above
  - the replay cost budget
- **Phase 2, borrowing, the day, and more traits** (where each pitch plays, spot accuracy, times through the order,
  first inning, wild pitches): shape → stuff and bullpen → command priors, team effects and hitter types, velo
  today, rest, fatigue curve, check-in reliability, the per-hitter engine offsets, measured tuning settings.
- **Phase 3, variety and sharing:** bounded variety, composure, sequencing and big-spot traits, sync and per-level sharing, level-table versions,
  umpire terms once both teams are charted.

## 15. Review findings and how each was handled

| Finding | Handled in |
| --- | --- |
| Frozen in-game state hides command and double counts in calls | confirmed by test (0.1-0.15); fixed in 3.1, 3.2, 4 |
| Snapshots break replay | 4.1 (raw inputs; snapshots for audit only) |
| Split fits reuse data and double count | 5.1 (one joint fit) |
| Caps vs flags; caps vs change points; bounds; jumps on accepting | 11, 5.2 |
| Flag thresholds and test targets didn't match the measured numbers | 12, 13 |
| Scoreboard was in-sample; coach edits not independent | 12 |
| Coach calls and shake-offs bias the fit; variety can't reach below-trust pitches | 5.4, 9 |
| Hitter/pitcher loop in Phase 1; unnamed hitters | 5.5, 7 |
| Things that can't be separated (feel, umpire, framing, level, L2 feeding on itself, two priors) | 5.5, 3.1, 5.2, 8 |
| Undo said to hard-delete | **not correct:** `db.js` soft-deletes; the in-memory undo stack is real and handled in 4.3 |
| Edits, renames, kind changes, devices, determinism, versions | 4.2, 4.3 |
| Privacy: release comparisons, fake teams, small levels, server-side scoring, minors | 10 |
| Missing: cross-ups, miss direction, replay cost, defense / park / weather | 4.1, 4.2. Defense: only contact quality is used, so it doesn't count. Park and weather: left out. At amateur levels they matter less than charting quality; revisit with data. |

## 16. Server and iPad

| Runs on | What |
| --- | --- |
| **Server** | the database of record; replay and learning for every pitcher and hitter; L2 population models; L1 per-level numbers; the scoreboard; flags |
| **iPad** | the engine and the in-game layer (L5); charting; a local copy of today's data |

- **Before a game,** the iPad downloads a **game pack**: profiles for today's staff (talent, traits, certainty, limits),
  today's opponent's hitters, the level tables, and the engine version. The pack is the only thing calls depend on,
  so **the iPad calls a full game with no signal**.
- **During the game,** pitches are written locally first (the current IndexedDB store) and uploaded whenever there's
  a connection. Nothing in a call ever waits on the network.
- **After the game,** the server replays, updates profiles and flags, and the next game pack picks them up. Learning
  never changes a profile mid-game: the in-game layer handles tonight.
- **Versions:** each game pack carries the learner, engine and level-table versions, and each logged pitch records
  them (4.1). A mismatch between an old iPad engine and a newer pack is refused, not guessed at.
- **Accounts:** a program (team) owns its data. Coaches edit; pitchers can fill in their own check-ins and upload
  TrackMan/Rapsodo files from their phones. Per-level sharing (section 10) runs server-side, on opted-in programs only.
- **Engine everywhere:** the same engine code runs on the server (replay) and the iPad (calls). The Python engine stays
  the reference, and the parity tests keep them identical.

## 17. Phase 1: what was built, what was measured, and what has to come first

### Built and verified
| Piece | File | Proof |
| --- | --- | --- |
| Engine v0.7: per-pitcher traits (side, count, stretch, miss tendency) and his own strike rate for "landing today" and confidence | `engine.py`, `app/engine.js` | No traits = identical to v0.6f (`app/same_engine_test.py`: difference exactly 0 over 300 random situations, full calls included); 17/17 regression checks; Python and JS match to 1e-14 with traits on (`app/parity.js`, 150 cases) |
| Per-zone outcomes, so location and result are scored together | `app/engine.js` (`outcomeProbs(..., byZone)`) | zone mixes sum to 1 and recombine exactly |
| Learner v2: replay with in-game state rebuilt per candidate value, talent filter with drift and change points, joint traits, uncapped estimate vs capped serving, flags, pre-game scoreboard and safety switch, hitter memory against expectation, the 90% logging rule, coach-call exclusion, renames, cross-ups | `app/learner.js` | `app/worlds_test.js` (13 worlds, below) |
| Simulated seasons played pitch by pitch with live in-game state | `app/worlds.js` | |
| The trait gate | `app/gate_test.js` → `app/gate_result.json` | below |

Learner speed: about 3 seconds per pitcher-season in Node without the scoreboard; the scoreboard adds prefix refits.
Fine for a server.

### Worlds results (4 seasons each)
Passed (10 of 13): steady pitcher holds (average drift -0.14, no flags); wrong grades move and get flagged; charter
mistakes (no false flags); selective logging (stuff 3.00 with the 90% rule vs 2.04 without, truth 3); coach calls
excluded (3.10, truth 3); certainty honest (truth inside ±1 sd 75%); replay identical in any order; renames, cross-ups,
undo; every cap, step and phase-in; hitter facing only an ace stays near average (-0.04 vs v1's -0.09); scoreboard beats
wrong grades and doesn't switch off on right ones; strike-rate table within 0.004.

Failed (3), all for one reason:
- The in-game leak: v2 is closer than v1 (2.59 vs 2.70, truth 2) but not within 0.2.
- A coach-marked injury (command 3 → 1.8): three games later the estimate is still about 3. It reaches about 2 after six.

### Trait gate results
None of the six traits pass. One season moves stretch, count and side effects only 15-25% of the way to the truth (miss
tendency 70%). Ignoring any of them costs 0.00-0.02 runs per 100 pitches, against a yardstick of 0.055 for getting a
fastball's stuff wrong by a point. So `ACTIVE_TRAITS` is empty: the machinery is built and tested, but nothing is switched
on. (The first "worth it" measure compared mixed strategies and could go negative; it was replaced by regret, which can't.)

### The finding behind all of it: the engine's command is too flat
- In the engine, command 1 vs command 5 changes the ball rate at a corner target by about 3 points (49.6% vs 46.4% at
  D3), and walk-plus-HBP per plate appearance by about 6 points (28% vs 22%, fixed target mix). Real college staffs
  range from single-digit walk rates to 20%+. That spread hasn't been measured against real per-pitcher data yet.
- One game of 43 located fastballs separates command 1.8 from 3 by only 0.4 log-likelihood points, almost no evidence.
- Getting a fastball's command wrong by two full points costs 0.04 runs per 100 pitches in the engine's own calls.

The learner can only learn what the engine can tell apart, and a trait only matters if the engine's calls change with it.
Both are limited by how little the engine's outcomes move with a pitcher's grades.

### So the build order changes
- **Phase 0 (new, first):** calibrate the engine's spread between pitchers. Use real per-pitcher lines by level (walk,
  strikeout and hit rates for individual pitchers from the same public conference stat pages the run values came from),
  and set how much command and stuff move outcomes so the engine's spread across grades 1-5 matches the real spread
  across pitchers. Then refit the level averages (`fit_all.py`) so the average pitcher still matches. This changes every
  call, so it needs the owner's go-ahead. Then rerun the regression, logic, parity, worlds and gate tests.
- **Then** Phase 1's remaining piece: wire learner v2 into the app (raw logging fields, game pack, profile traits in the
  calls, flags and scoreboard on the Roster, the learning worker). Not started.
- **Then** rerun the gate. Traits that pass get switched on.

## 18. Phase 0: spread calibration (done, 2026-11-02)

### What a grade means now
3 = the level's average pitcher; one grade point = one standard deviation of real pitchers at that level (Drew's call).
High school ships as an estimate (decision: OK). MLB stays as it was (scale 1): it's only a comparison level and no
per-pitcher MLB lines were collected.

### The data
2026 individual pitching lines from public team stats pages (`pitcher_lines.py` → `data/pitcher_lines_2026.csv`):
D3 597 pitchers on 35 teams (52,054 batters faced), D1 361 pitchers on 22 teams (44,253 BF). 57 of 59 teams were
read; Russell Sage's page didn't load and Harvard's served a bot check, which was not worked around.

The real spread of true talent between pitchers (`talent_spread.py`: beta-binomial weighted by batters faced, checked
against method of moments; luck taken out):

| Level | walk+HBP per PA: average, true SD | strikeouts per PA: average, true SD | walk/K correlation |
| --- | --- | --- | --- |
| D3 | 15.2%, 4.9 points | 17.3%, 4.6 points | -0.10 |
| D1 | 13.9%, 3.9 points | 18.1%, 4.1 points | -0.14 |
| HS (estimated: D3's spread relative to its averages) | 18.2%, 5.9 points | 21.0%, 5.6 points | (D3's) |

Home run spread can't be pinned down from one season (too few home runs per pitcher), so it isn't a target.

### The change to the engine
Two numbers per level (`spread_params.py`, fitted by `fit_spread.py`): how strongly command moves where pitches land
(`cmd_scale`) and how strongly stuff moves whiffs and hard contact (`stuff_scale`).

| Level | command scale | stuff scale |
| --- | --- | --- |
| D1 | 3.11 | 1.46 |
| D3 | 4.11 | 1.94 |
| HS | 4.50 | 1.57 |

At scale 1 the engine is exactly v0.6f. Above 1, landing shares move exponentially instead of along straight lines
(the old lines ran into zero at large spreads), matched to the old slope around an average pitcher. Then `fit_all.py`
refit each level's averages so the average pitcher still matches the real league. This was iterated twice.

### Verified (all executed, output captured)
- **Spread and averages** (`spread_test.py`): at D3, D1 and HS, strikeouts, walks and HBP are within 0.6 points of
  real, and the walk+HBP and strikeout spreads between pitchers are within 10% of the real SDs. All pass.
- **Identical code path** (`app/same_engine_test.py`): at scale 1 with no traits, the difference from v0.6f is exactly
  0 over 200 random situations, full calls included.
- **Python vs JavaScript** (`app/parity.js`, 150 cases): match to 2e-14.
- **Regression checks** (`tests.py`): 16 of 17. The failing one is "a slider landing 3 of 9 today loses most of its
  get-it-over calls": it drops from 25% to 13%, a 47% cut against a bar of 50%. v0.6f was 26.8% to 13.3% (a 50.4% cut),
  so it was always at the edge. The share at 3-of-9 hasn't moved; the fresh share dropped a little. Left failing,
  pending Drew's call (below).
- **Logic fuzz** (`fuzz.py`, 3000 situations): 27 of 29.
  - Better stuff costing more (8 cases) and a crushing hitter making a pitch cheaper (1 case): every case was a
    0.002-0.003 run reversal at 2-0, 3-0 or 3-1, where a whiff leaves a hitter's count and replaces a likely out. That's
    the reason the timing check already excluded those counts. Both checks now exclude them too, and both pass.
  - Still failing (1): a fastball costs 0.0023 runs more against a hitter who's late on fastballs, chase target, 1-0.
  - Still failing (2): a chase pitch in the mix at 3-0 or 3-1 (1 of 60; 13 of 600 in a wider search). Every case is a
    very wild pitcher (mostly command 1) with a cheap walk (two outs, first base open or empty). For him "aim middle"
    and "aim chase" land almost the same, so chase falls inside the mix window. Review rule W1 calls it wrong. Pending
    Drew (below).
- **Reduced matrix** (6 setups × 4 games; the full matrix is 21 × 10):

| Setup | clean | wrong | K | BB | R/PA | real R/PA |
| --- | --- | --- | --- | --- | --- | --- |
| HS | 75.4% | 1.0% | 22.0% | 15.4% | 0.165 | 0.207 |
| D3 | 85.1% | 2.0% | 16.6% | 11.8% | 0.136 | 0.184 |
| D1 | 85.7% | 1.0% | 25.7% | 14.4% | 0.138 | 0.149 |
| MLB | 89.8% | 0.3% | 21.0% | 9.0% | 0.150 | 0.112 |
| shaky staff (D3) | 67.3% | 4.3% | 18.6% | 14.2% | 0.158 | 0.184 |
| finesse staff (D3) | 78.6% | 0.0% | 21.4% | 8.7% | 0.133 | 0.184 |

  Wrong calls stay in the old range (0.8-4.5% before). D3 walks in full games came down from 14.0% to 11.8% (real 11.4%),
  which closes most of the walk gap the status section listed. Runs per PA came out under real at HS and D3, but 4 games
  (about 150 plate appearances) carry a standard error near 0.03, so this needs the full matrix before anyone reads
  much into it.
- **Learner worlds** (`app/worlds_test.js`): 13 of 13. The two that failed before calibration now pass. The in-game leak:
  v2 learns 2.10 against a truth of 2 (was 2.59). An injury the coach marked: 1.90 three games later against a truth of
  1.8 (was about 3).
  - Two learner fixes were needed. The fast strike-rate table's trait slopes now depend on command: the old single
    slope was off by 0.016 for a command-1 pitcher; now the worst case is 0.007.
  - The scoreboard's safety switch now needs his grades to be better by the margin *and* by more than 2 standard
    errors. Any learned estimate pays a small, expected price for its own noise when the grades are already right
    (measured 0.00-0.01 per pitch over 6 seasons). Calibration made each pitch more informative, so that price was
    tripping the switch.
- **Trait gate** (`app/gate_test.js`, 12 seasons per trait). The yardstick, fastball stuff off by one point, now costs
  0.148 runs per 100 pitches (was 0.055).

| Trait | true → learned | when zero | runs/100 if ignored | result |
| --- | --- | --- | --- | --- |
| side_cmd | 0.8 → 0.77 | 0.03 | 0.05 | **on** |
| side_grade | 0.8 → 0.46 | -0.05 | 0.05 | **on** |
| ahead_cmd | -0.6 → -0.37 | -0.04 | 0.01 | off (not worth it) |
| behind_cmd | -0.6 → -0.42 | -0.03 | 0.08 | **on** |
| stretch_cmd | -0.8 → -0.50 | 0.04 | 0.10 | **on** |
| miss_heart | 0.6 → 0.47 | 0.00 | 0.00 | off (not worth it) |

  On v0.7 these four were switched on; on v0.7b none pass and all are off again (see v0.7b below).
- **App** (`app/learn.js`, the learner the app uses today): calibration made its raw fit move about 0.4 on 15 pitches. It
  now has the same limits as v2: at most 0.15 per game pitched, never more than 1.0 from his grade, situational slices at
  most 0.5 in total. The learning checks judge what the calls receive (0.17 on 15 pitches). App rebuilt; smoke,
  end-to-end, learning, database and import checks all pass.

### v0.7b: Drew's calls (2026-11-02) and the walk/strikeout link
Drew: (1) make W1 a hard rule, (2) "loses about half" is right, (3) "only show how the data shows it and lower the
correlation".
- **W1 is a hard rule** in both engines: no chase target at 3-0 or 3-1 (`targets()` in `engine.py` and `app/engine.js`).
  The fuzz check for it now holds by construction and stays as a guard.
- **The landing check** passes at "loses about half or more" (bar 55% of the fresh share).
- **The walk/strikeout link now matches the data.** One more number per level, `cmd_whiff`: how much better command
  lowers swing-and-miss (precise pitchers work in and around the zone, where hitters make contact). It's fitted together
  with the two scales, so the walk spread, the strikeout spread and the correlation all match. Hitters adjusting their
  swing rate to strike throwers was tried first: at any realistic size it barely moved the link (-0.58 to -0.52).

| Level | command scale | stuff scale | cmd_whiff | walk/K link: engine vs real |
| --- | --- | --- | --- | --- |
| D1 | 3.04 | 1.85 | 0.18 | -0.16 vs -0.14 |
| D3 | 3.94 | 2.43 | 0.27 | -0.11 vs -0.10 |
| HS | 4.30 | 2.27 | 0.31 | -0.10 vs -0.10 (D3's, estimated) |

  Stuff now carries the strikeout spread almost alone (D3: 0.046 strikeouts per stuff point vs 0.004 per command point),
  and command carries walks (0.049 per point). Level averages refit; everything above was rerun on v0.7b.

**v0.7b results (all executed, output in `results/`):**
- Spread and averages: all pass (`spread_test.py`). Identical-engine test: exactly 0 at scale 1 and `cmd_whiff` 0 (full
  calls compared outside 3-0 and 3-1, where W1 is a deliberate change). Python vs JS: match.
- Regression checks: **17 of 17**.
- Logic fuzz: 27 of 29. Better stuff costing more: 3 of 3000 at 0.0022-0.0023 runs (chase breaking balls at 0-0 and 1-1
  at D3: more whiffs replace weak contact that's usually an out, the same mechanism as in hitter's counts, now just over
  the 0.002 tolerance because stuff moves outcomes more). Fastball vs a late hitter: 1 of 3000 at 0.0025. Left failing
  and explained rather than widening the checks again.
- Learner worlds: **13 of 13**. One more fix: the scoreboard now scores what the calls would have used (the fit within
  serve()'s limits), and its margin is 0.02 per pitch (was 0.01). Over 14 right-grade seasons the old margin switched
  learning off twice, the new one never. A wrong grade costs 0.12 per pitch, so a broken learner still trips it.
- **Trait gate: no trait passes now** (12 seasons each). All six are still learnable, but the yardstick rose to 0.255
  runs per 100 (stuff matters more), and command traits matter less, because command no longer buys strikeouts:
  stretch 0.06, behind 0.05, side stuff 0.04, side command 0.01 against a bar of 0.064. `ACTIVE_TRAITS` is empty again.
  Stretch is the near miss. Real charted data (Phase 2) is what would tell whether real trait sizes are bigger than the
  test sizes used here.
- Reduced matrix (6 × 4 games): wrong calls 0.3-4.9%, same range as before.

| Setup | clean | wrong | K | BB | R/PA | real R/PA |
| --- | --- | --- | --- | --- | --- | --- |
| HS | 74.1% | 2.3% | 24.6% | 14.2% | 0.164 | 0.207 |
| D3 | 76.8% | 0.8% | 19.1% | 11.0% | 0.145 | 0.184 |
| D1 | 79.6% | 1.4% | 19.9% | 12.0% | 0.168 | 0.149 |
| MLB | 89.8% | 0.3% | 21.0% | 9.0% | 0.150 | 0.112 |
| shaky staff (D3) | 66.9% | 4.9% | 14.2% | 13.1% | 0.142 | 0.184 |
| finesse staff (D3) | 79.3% | 0.5% | 16.6% | 8.6% | 0.117 | 0.184 |

  4 games per setup carry a run-rate standard error near 0.03; the full matrix is needed before reading the run rates.
- App: rebuilt; smoke, end-to-end, learning, database and import checks pass.

### Open questions
1. ~~**Walk/strikeout link.**~~ Resolved in v0.7b (above): the engine now shows the link the data shows.

2. **Heavy walk tail.** A real "1" can be wilder than one SD below average suggests. Command is clamped at ±8 internal
   steps, so anything below about 1 behaves like 1.
3. ~~Drew's two calls~~: answered, see v0.7b above.

## 19. Steps 1-3 and 5: the learner in the app (2026-11-03)

A fresh-context review recommended: fix the current learner's limits, make logging complete, run v2 in shadow, and
only then wire it in. Drew: do 1-3, then 5 if it's good (no real charting pilot, step 4).

### Step 1: the app's learner (v1) obeys the limits
It could serve 1.5 from the grade (slices on top of the ±1.0 cap), "per game" steps were 0.15 × games in history, it
served situational slices the gate had rejected, and it learned from coach calls. Now (`app/learn.js` 1.1.0): one 0.15
step per relearn that has a new game, never more than 1.0 from the grade in any spot, slices measured but not served,
coach calls and re-calls left out. New checks in `learn_test.js` (section 11) fail on the old code and pass now.

### Step 2: logging is complete enough to replay (spec 4)
Each pitch now logs who chose it (engine / coach / re-call after a shake-off), the pitch actually thrown on a cross-up,
wild pitches and passed balls, the raw pitch count and the fatigue shift separately, the check-in, the app, engine,
table and learner versions, the device, the served strike rate and traits, and how many between-hitter confidence
drifts came before it (an inning can end on a caught stealing with no last pitch). In-game state is keyed by pitcher id,
not staff position. Pitches charted before the database opens wait in the saved state instead of being dropped. New:
End game (saves completeness: share located, contact logged, engine calls), Fix on a logged pitch (location, contact,
cross-up, wild pitch; the original kept in an edit history), a re-grade log with whether he'd seen what was learned,
and Mark changed per pitch.
**Proof** (`app/replay_e2e.js`, a scripted 52-pitch game in a real browser with a coach call, shake-offs, a cross-up, a
wild pitch, an undo, an inning change, a pitching change and two pitches while the database was closed): from the
backup alone, learner v2's own replay rebuilds every pitch's confidence exactly (difference 0), "landing today" and the
pitch counts exactly, every pitch present 1..N, and the learner uses exactly the engine's own calls.

### Step 3: v2 in shadow (`app/shadow.js`, on seasons charted through the app by `app/sim_backup.js`)
Surprise per pitch from game 4 on, each game predicted from the games before it (lower is better):

| Season (14 games) | coach grades | v1 as served | v2 |
| --- | --- | --- | --- |
| wrong grades, seed 1 | 2.4560 | 2.4325 | 2.4326 |
| wrong grades, seed 2 | 2.4881 | 2.4639 | 2.4645 |
| right grades, seed 1 | 2.4827 | 2.4867 | 2.4874 |
| right grades, seed 2 | 2.5909 | 2.5956 | 2.5980 |
| injury at game 8, marked | 2.4110 | 2.4074 | 2.4011 |

v2 matched v1 on prediction, beat it when there was a change, and flagged the wrong fastball command every time (v1 has
no flags). Judged good enough to wire in.

### Step 5: v2 wired in
- **Calls** use v2's served values (`serve()`: one 0.15 step per new game, never more than 1.0 from the grade unless the
  coach accepts a flag, then phased in over 3 games; bigger steps for 5 games after a change mark; learning off when the
  scoreboard says so or the coach switches it off), with the served strike rate. `serve()` is now bound to games: a
  relearn, reload or re-grade with no new game moves nothing (new worlds check).
- **Learning** runs after End game in a background worker (main-thread fallback with the same code).
- **Roster**: learned value ± uncertainty, what the calls use, a scoreboard line per pitch, flags with Use / Keep mine
  (quiet until the learned value moves another 0.5) / Ask me in 5 games, and Mark changed.
- **Hitter memory** is one scale: tonight's swings are scored against what the engine expected (before knowing the
  hitter), the same as learned history.

**Proof**: five new seasons charted through the app with v2 serving the calls. Every game in every season replays
exactly (`app/replay_check.js`: 70 games, 8,501 pitches, confidence difference 0). The shadow's v2 matches what the app
served pitch for pitch.

| Season (14 games), v2 serving | coach grades | v2 |
| --- | --- | --- |
| wrong grades, seed 1 | 2.4286 | 2.4039 |
| wrong grades, seed 2 | 2.5205 | 2.4910 |
| right grades, seed 1 | 2.4952 | 2.4977 |
| right grades, seed 2 | 2.5297 | 2.5279 |
| injury at game 8, marked | 2.4127 | 2.4082 |

Worlds 13/13 (plus the per-game serving check), learning checks, database, import, smoke and end-to-end tests all pass.

### Still open
- Everything is simulated. Real games will show real trait sizes (for the gate) and real calibration.
- Only the 14 newest pitches can be fixed from the game screen.
- The trait gate keeps traits off; the machinery is wired (served traits reach the engine) for when one passes.
- Learning speed on an actual iPad hasn't been measured (Node: about 1-9 seconds per pitcher per relearn, growing with
  history; it runs in the background).
