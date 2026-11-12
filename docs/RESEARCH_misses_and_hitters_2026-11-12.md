# Research: miss direction and the hitter model (Nov 12, 2026)

Follows `RESEARCH_pitch_profiles_and_setups_2026-11-12.md`. Drew's calls (Nov 12): arm-side vs glove-side misses
"definitely matter for setups and sequencing and everything"; do real work on the hitter model. Both are built in v1.2,
right after v1.1 (Drew's split, Nov 12; plan section 8);
fixed scripts stay out; familiarity carry-over and slot adjustments stay conditional on the first fit. Research and
design only; nothing built or fitted.

---

## Part 1. Miss direction

### 1.1 What v1.0 does today (code at `b318098`)

`landing(p, q, s)` (`engine.py:559`) gives the chance a pitch aimed at target `q` lands in the heart, on the edge, just
off, or way off. It depends on command, confidence, level wildness, today's landing and fatigue, but **not on which way
the pitch misses**. The one per-pitcher miss trait, `miss_heart` (`:541`), moves misses toward or away from the heart
without a side. Hit-by-pitch risk is a fixed multiplier per target (`HBP_LOC`, `:301`: inside 1.6, away 0.3). So a righty
whose fastball leaks arm side is priced the same whether he aims in or away to a right-handed hitter.

### 1.2 What the research says

- **Where a pitch misses matters as much as how much.** Pitching coaches and catchers coach a "good miss": if the target
  is inside, miss inside; set up away, missing off the plate beats leaking back over the heart. Teams that measure
  command care less about on-target percentage than about the direction and size of the miss.
- **Typical patterns (coaching and analyst consensus, not measured averages):**
  - Fastballs leak **arm side and up** when the delivery breaks down. Glove-side "yanks" are the other common miss.
  - Breaking balls miss **along the arm path**: a hung one (not enough snap) misses high, an overcooked one misses low or
    in the dirt.
  - Running fastballs and sinkers: the miss follows the run. Stroman sets an extreme target so a sinker that runs less
    than planned misses off the plate, not over it.
  - Big breaking balls have bigger misses than tight ones; low-run changeups and splitters are harder to command than
    other off-speed.
- **Size of misses:** MLB starters land within two baseballs of the intended spot about 58% of the time. One pitching
  coach put the average miss at about 11 inches, which is why many catchers set up middle. Harder throwers miss more:
  about 10% less on-target for every 2 mph.
- **Data with a target exists, with a catch.** Statcast records where the ball went, not where it was aimed; v1.0's
  attempt to fit landing from Statcast was rejected for exactly that reason (`HITTER_FOUNDATION_REPORT.md`, item 8).
  **OpenCommand** publishes MLB catcher targets inferred from broadcast video (2024–2026, per pitch) and miss distances,
  but under a **non-commercial license (CC BY-NC-SA 4.0)**, and PitchIQ is a paid product. Commercial providers (SIS,
  Stats Perform) chart catcher targets but aren't free.
- **Our own best source is already being collected:** the app logs the called target and, when the catcher enters it,
  the landing cell on a 5×5 grid. That is a target-vs-landing record per pitcher and pitch, which is exactly what
  miss direction needs.

### 1.3 Design for v1.1

- **Each pitch gets a miss tendency:** side `mx` (−1 glove side … +1 arm side) and height `mz` (−1 down … +1 up).
- **Default lean is zero (Drew, Nov 12).** The patterns above (fastballs leak arm side and up, cutters glove side) are
  what the app offers the coach as choices; a lean applies only once the coach sets it ("misses arm side", "misses up")
  or the learner earns it. Measured data overrides.
- **In the landing model:** the side of a target relative to the pitcher (an inside target to a same-side hitter is on
  his arm side; an away target to a same-side hitter is on his glove side; mirrored for opposite-side hitters) decides
  what a lean does. Leaning toward the side the target is already on pushes misses further off the plate (more balls,
  and for an inside target more hit batters). Leaning the other way pulls misses back over the heart (more damage).
  Height works the same way for up and down targets: a down target with an up lean leaves the pitch in the zone, while
  a down lean adds dirt balls and wild pitches. The moves are not mean-preserving (every fastball has a lean, and the
  engine will choose targets where the miss is safe), so the outcome model is refit afterwards (plan 2.3b, 2g).
- **Hit-by-pitch** becomes side-aware: `HBP_LOC` scales with how far the target's misses lean toward the batter, for
  inside and middle targets; wild pitches rise only with down targets or a down lean.
- **Learning:** the learner estimates each pitch's `mx` / `mz` from the logged target vs landing cell in pitcher-relative
  terms, through the existing trait gate (learnable within a season at the logging tier, and it changes calls by a
  measurable amount). A learned lean is served only when the coach hasn't set one, otherwise it's a flag; if the gate
  fails, it stays a flag. `miss_heart` has no side, so it stays as an inactive trait rather than folding in.
- **Effects that follow without new rules:** the engine prefers targets where his miss is safe; a front-door sinker for a
  pitcher whose misses run toward the batter costs more (hit batters); a hung-breaking-ball risk shows in down targets;
  setup check 1 ("landed near the target") becomes side-aware.
- **MLB numbers for the defaults:** OpenCommand is used only as a research check on the defaults (Drew, Nov 12); it
  doesn't feed shipped numbers.

---

## Part 2. The hitter model

### 2.1 What v1.0 knows about a hitter

Grades for contact, power and eye (1–5, coach-set, learned across games); a crowds-the-plate flag; in-game timing reads
(late on the fastball, out front on soft stuff); fouled straight back; damage and success memory by pitch and spot
(earlier at-bats and across games); handedness. It does **not** know swing type, bat speed, where he hits the ball, or
how well he picks up spin, so a riding fastball up plays the same against every hitter. (The Nov 6–7 hitter foundation
work, Statcast hitter cells by pitch class × zone × count, lives on an unmerged branch; it is reference here, not a base.)

### 2.2 What the research says

- **Swing path.** Statcast now measures swing path tilt (the plane of the bat in the last 40 ms), attack angle (the bat's
  vertical direction at contact) and attack direction (pull vs oppo). League-average tilt is about 32°; flattest swings
  are near 20°, steepest about 43°+. Tilt also depends on pitch height (MLB 2024: about 37° on low pitches, 32° middle,
  25° high). (Statcast calls a high-tilt swing "steep"; the app's tag says "uppercut / lift" because many coaches
  use "steep" to mean chopping down.) Steep vs flat is a style, not good or bad: too flat costs power, too steep costs contact.
- **Swing path vs location (coaching and team practice).** Lift hitters prefer the ball down; keep the fastball above the
  waist and the breaking ball down and out of the zone (ABCA, *Gold Glove Baseball*). The Brewers steer flat-path hitters
  away from high pitches and low-and-inside ones. Hitters with steep paths and high hands can cover more heights
  (FanGraphs, Freeman vs Julien). Pitches that match the swing's plane get hit; pitches off it don't.
- **Bat speed and swing length.** Longer, faster swings do damage on slower fastballs; hitters slow their swing slightly
  against harder fastballs; up-and-in and down-and-away force a longer swing even for short-swing hitters (Arraez).
  Slow bats: fastballs in, breaking balls low and away.
- **Spray / pull.** Dead-pull hitters cheat on fastballs and like the inner half; pitch them away (fastballs, breaking
  balls, changeups) so they roll over; inside-out hitters get hard stuff in.
- **Spin recognition.** Poor breaking-ball hitters struggle to read spin or can't wait long enough; they chase and miss
  more on breaking balls. MLB timing data (2026): hitters are late on fastballs 23% of the time and early 3%; on
  secondaries, early 43% and late 5%. Most hitters are geared to the fastball.
- **Stance cues coaches use:** upright stance → better low-ball hitter (pitch up); crouched → pitch low; closed stance →
  pitch in; open → away. These are rules of thumb, useful as defaults for unknown hitters.
- **Data:** Statcast pitch-level CSVs include `bat_speed`, `swing_length`, `swing_path_tilt`, `attack_angle`,
  `attack_direction` per swing (bat speed and length from 2024; path metrics published from 2025). Amateur programs
  widely use Blast Motion (bat speed, attack angle, vertical bat angle) for their own hitters, not opponents. Driveline
  reported in-house average attack angles of about 1° for high school and 10° for college.

### 2.3 Design for v1.1

**Hitter tags** (Drew, Nov 12; optional; unknown = average; measured numbers override where they exist):

| Tag | Options | Measured override |
|---|---|---|
| Swing path | uppercut / lift · average · flat / level | swing path tilt or attack angle (Blast or Statcast) |
| Early-count approach | aggressive early · average · patient early | first-pitch / early-count swing rate |
| Off-speed hitter | struggles with it · average · hits it hard | damage (hard contact) on off-speed |
| Spray | pull-heavy · all fields · oppo / inside-out | spray chart or attack direction |

Drew's reasoning: swing path matters because it exposes holes; the early-count approach is important; "spin recognition"
means whether he hits off-speed hard, not whether he chases it; height preference doesn't matter much; bat speed matters
less. Height preference and bat speed are dropped as tags (the existing timing reads and damage memory still cover what
shows up in a game). The existing contact / power / eye grades and the crowding flag stay.

**Engine effects** (each fitted on Statcast if the data supports it, otherwise a named coach rule like v1.0's reads):

1. Swing path × pitch height × pitch shape (ride / drop) on whiff and hard contact: the holes each swing shape leaves.
2. Early-count approach (in-zone swing rate at 0-0 / 1-0 / 0-1 minus his overall rate) on in-zone swings in those counts
   (it interacts with the steal-strike setup S6 and first-pitch strikes).
3. Off-speed hitter: a prior on the existing off-speed damage memory (one channel, no separate term), so a hitter who
   mashes off-speed sees fewer hittable ones and one who can't handle it sees more.
4. Spray × inside / away on hard contact and grounders (pull hitter rolling over away).

Each effect is sized net of the v1.0 terms it overlaps (shape fits, platoon, damage memory, eye, crowding), and its weight
shrinks as in-game memory on that hitter builds. Ground-ball vs fly-ball effects are left out of v1.1.

**Fitting:** hitter traits measured in one period and the interaction tested on the next (2024 traits → 2025 pitches
for training; 2025 traits → 2026 pitches held out; if 2024 lacks the path metrics, 2025 first half → second half for
training), so a trait is never fitted on the same pitches it explains. Per-batter traits need every game, not the current
every-4th-day pull, or Savant's season leaderboards. The off-speed skill is checked for persistence first. Same ship
rule as every v1.1 fit. MLB-fitted behavioral effects scale by `RHO_L` at HS. Tags map to the top / bottom third of
each trait at the level.

**Learning:** the learner proposes approach (early-count swings; the most learnable), off-speed (the existing off-speed
damage residual) and swing path (whiffs / weak contact by pitch height and shape), with evidence minimums, caps, and flags
when it disagrees with the coach. Spray stays coach-set: the app logs no ball-in-play direction, and pulled / opposite
fouls already feed the timing reads.

**Simulator:** hidden hitters get the same traits so the engine is tested against them; the learner's worlds tests need
a hitter world first, then check that approach, off-speed and swing path are recoverable.

## Part 3. Drew's answers (Nov 12)

1. **OpenCommand:** research check only; it doesn't feed shipped numbers.
2. **Hitter tags:** swing path, early-count approach, off-speed hitter (does he hit off-speed hard), and spray (kept; Drew
   didn't flag it). Height preference and bat speed dropped.

## Sources

- Miss direction: [FanGraphs: The Importance of "The Good Miss"](https://blogs.fangraphs.com/the-importance-of-the-good-miss);
  [Marquee: intended zone primer](https://www.marqueesportsnetwork.com/intended-zone-primer-what-is-it-and-how-does-it-impact-the-cubs/);
  [Baseball Prospectus: Stroman's extreme targets](https://www.baseballprospectus.com/?p=90451);
  [SIS: catcher mitt location and fastball command](https://www.sportsinfosolutions.com/2021/07/12/using-catcher-mitt-location-to-evaluate-fastball-command);
  [Iowa Baseball Managers: quantifying command](https://medium.com/iowabaseballmanagers/quantifying-command-to-enhance-pitcher-development-9bb00a2a0b61);
  [The Analyst: command+](https://theanalyst.com/na/2021/05/measuring-which-pitchers-have-the-best-command-in-mlb/);
  [ABC7: hit batters and average miss](https://abc7chicago.com/post/mlb-hitters-are-being-hit-pitches-more/19589826/);
  [OpenCommand dataset](https://huggingface.co/datasets/tomdoyo/open-command);
  [Florida Baseball ARMory: arm-side and glove-side misses](https://floridabaseballarmory.com/?p=47961)
- Hitter model: [MLB glossary: swing path (tilt)](https://www.mlb.com/glossary/statcast/swing-path-tilt);
  [MLB.com: four new swing metrics](https://www.mlb.com/news/new-statcast-swing-metrics-2025);
  [Baseball Savant: swing path / attack angle leaderboard](https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-path-attack-angle);
  [Brewer Fanatic: flat swings](https://brewerfanatic.com/forums/topic/45200-new-statcast-metrics-show-that-brewers-hitters-have-some-of-baseballs-flattest-swings/);
  [FanGraphs: Not All Steep Swings Are Created Equal](https://blogs.fangraphs.com/not-all-steep-swings-are-created-equal);
  [FanGraphs: Faster Fastballs Produce Worse Swings](https://blogs.fangraphs.com/faster-fastballs-produce-worse-swings/);
  [FanGraphs: launch angle and swing length](https://blogs.fangraphs.com/maybe-the-launch-angle-revolution-wasnt-really-about-launch-angle);
  [Coaches Insider: pitch selection (Gold Glove Baseball)](https://coachesinsider.com/baseball/pitch-selection-article);
  [Coaches Insider: hitting breaking balls](https://coachesinsider.com/baseball/the-keys-to-hitting-off-speed-and-breaking-ball-pitches/);
  [Rounding Third: handling different hitters](https://roundingthirdleadershipandbaseball.blogspot.com/2022/06/handling-different-hitters-on-mound.html);
  [Fancy Stats: how much hitters sit fastball](https://fancystats.substack.com/p/how-much-do-mlb-hitters-sit-on-the);
  [DEV: Statcast bat tracking columns](https://dev.to/yasumorishima/mlb-statcast-bat-tracking-dataset-2024-2025-26fj);
  [RPP: attack angles by level](https://rocklandpeakperformance.com/attack-angles-and-pitch-descent-angles-any-relation-yes/);
  [Blast Motion: vertical bat angle](https://blastmotion.com/blog/what-is-vertical-bat-angle-in-a-baseball-swing/)
