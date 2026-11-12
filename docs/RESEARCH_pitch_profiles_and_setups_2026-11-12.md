# Research: the six pitches, their profiles, and how they set each other up (Nov 12, 2026)

Follows `RESEARCH_pitch_types_sequencing_2026-11-12.md`. Drew's decisions for this round (Nov 12):

- **Six pitches:** fastball (four-seam), sinker, cutter, slider, curveball, changeup. Each has several **profiles**
  (a running fastball, a bullet slider, a 12-6 curve vs a slurve, ...). This replaces the earlier idea of adding
  separate kinds for sweeper and splitter: the sweeper is a slider profile, and the splitter is a changeup profile.
- **Input:** a short tag list per pitch is the default; measured numbers (TrackMan / Rapsodo) override the tags.
- **Setups are at-bat based** (they reset each plate appearance).
- **No giving up value to set up later.** The engine shouldn't try to set up every time. A setup counts only when it
  applies and will work.
- Drew has no setup list of his own; the rules below are put together from research and coaching sources and checked for
  logic.

Nothing here is built or fitted. MLB numbers are MLB; amateur notes are called out where the sources have them.

---

## Part 1. The six pitches and their profiles

### 1.0 Two things shape every profile: arm slot and hand action

**Arm slot.** A higher slot puts more backspin on the fastball (more "ride", i.e. induced vertical break) and lets the
curveball break straight down. A lower slot adds side spin: more arm-side run on the fastball and more sweep on breaking
balls. The Red Sox director of pitching put it as: arm slot is the thing most tied to spin direction, and spin direction
is the thing most tied to lift. Statcast now measures arm angle (about 0° sidearm to about 60° over the top).

| Slot | Natural fastball | Natural breaking ball | Natural changeup |
|---|---|---|---|
| Over the top / high ¾ | Ride (backspin, 15–20 in. IVB in MLB) | 12-6 curve, gyro slider | Drop / split |
| ¾ | Ride + run ("carry", about equal ride and run) | Slider, 1-7 curve | Fade or drop |
| Low ¾ / sidearm | Sinker / heavy run (little ride, 15–20 in. run) | Sweeper, slurve | Fade |

Exceptions matter: a low-slot pitcher whose four-seamer still rides (more than his slot predicts) has a very flat
approach angle, which plays up at the top of the zone. So the engine should judge ride **relative to slot**, not raw.

**Hand action (motor preference)** groups pitchers into three types that come with natural arsenals:

| Type | Natural pitches | Struggles with |
|---|---|---|
| Supinator ("outside the ball") | Cutting fastball, big-spin breaking balls, sweeper | Arm-side run, a changeup |
| Backspin-dominant ("behind the ball") | Riding four-seamer, any breaking ball, splitter | Normal changeup floats |
| Pronator ("inside the ball") | Running fastball, sinker, fading changeup, gyro slider | Glove-side sweep |

The pronator's fastball / changeup / gyro slider set is a well-known "triangle" (Castillo, Alcantara, Gausman).

### 1.1 Fastball (four-seam)

| Profile tag | Shape (vs a straight fastball) | Typical slot | Plays best | Pairs with |
|---|---|---|---|---|
| **Rides** | High ride, little run | High | Top of the zone: whiffs and pop-ups | 12-6 / power curve, drop changeup or split, gyro slider, hard cutter |
| **Runs** (ride + run, "carry") | Ride and arm-side run in similar amounts | ¾ | Up, and in to same-side hitters | Slider or sweeper (opposite direction), vertical curve, fade changeup |
| **Cuts** (natural cut) | Ride with a little glove-side movement | Any; supinators | Up; in to opposite-side hitters | Sweeper, curve; changeup is hard (use split/drop) |
| **Straight / dead zone** | Average for his slot | Any | Edges, not low; needs location and secondaries to carry it | A second fastball shape (sinker or cutter), good secondaries |

Notes: MLB four-seamers averaged 94.0 mph in 2025. College right-handers on Rapsodo average 85 mph with about 8 in. of
run and 16 in. of vertical break. A dead-zone fastball is defined relative to slot, not as a fixed number.

### 1.2 Sinker (two-seam)

| Profile tag | Shape | Plays best | Pairs with |
|---|---|---|---|
| **Run** | Heavy arm-side run (MLB: 73% of sinkers now have 14+ in.) | In to same-side hitters; front door to opposite-side hitters for called strikes | Sweeper / slider (opposite direction), fade changeup |
| **Drop** (heavy) | Little ride, sinks | Bottom of the zone for ground balls (double-play spots) | Slider, cutter |
| **Two-seam** (from a four-seam pitcher) | Some ride left, less run than a true sinker | Variation off the four-seamer, bridge toward the changeup | Changeup, four-seamer |

How modern sinkers are used (MLB 2025): 70% of righty sinkers go to righty hitters (47% in 2013); only 30% of
righty-vs-righty sinkers cross at 2 ft or lower; more than half have under 8 in. of vertical break; pitchers value it as
the opposite of their slider ("keeps hitters from diving for sliders"). In or around the zone up high it held up fine.
Off the plate up, it gets hit. The sinker had the largest platoon gap in the 2021–22 table in the earlier doc (wOBA
0.365 vs opposite-side hitters, 0.333 vs same-side; the sweeper was right behind), so the default is same-side.

College average two-seam: about 1 mph off the four-seam, about 2.5 in. less ride (Rapsodo).

### 1.3 Cutter

| Profile tag | Shape | Speed off fastball | Plays best | Pairs with |
|---|---|---|---|---|
| **Hard / short** | About 2–4 in. glove side, keeps most of its ride | About 2–4 mph | In on opposite-side hitters' hands (jams, broken bats); a strike pitch | Sinker (its mirror), four-seamer, changeup |
| **Big / "slutter"** | 4–8 in. glove side, less ride | 5–8 mph | Bridge between fastball and a big slider; some whiffs | Four-seamer, sweeper |
| **Ride cutter** | High ride with cut | 1–3 mph | Up in the zone like a riding fastball that moves | Curve, changeup |

The ranges in this table are approximate (sources describe cutters as about 2–6 in. of glove-side break and roughly 5%
slower than the four-seamer). Hard cutters are about 3 mph faster with more backspin than soft ones (BP). A hard cutter and a sinker get similar drop
at similar speed and break opposite ways, so to a hitter they are mirror images. Classification note: under about
87 mph with more than about 6 in. of cut, tracking systems often call it a slider.

**Level caution:** coaches warn that youth cutters are usually just a fastball losing speed. At HS, a cutter tag should
need at least 2 in. of measured cut or a coach's confirmation that it's a real pitch.

### 1.4 Slider

| Profile tag | Shape | Speed off fastball | Plays best | Platoon |
|---|---|---|---|---|
| **Gyro / bullet** | 0–5 in. glove side, little ride; late, tight drop | ~5–8 mph | Strikes and whiffs to both sides; can go up and in to opposite-side hitters | Moderate |
| **Tight / standard** | 3–8 in. glove side, some drop | ~6–10 mph | Down and away to same-side hitters | Medium |
| **Sweeper** | 12+ in. glove side, almost no drop | ~8–12 mph | Same-side chase, weak contact | Very large (second-biggest of any pitch) |
| **Slurve** | Horizontal about equal to drop | ~10–13 mph | Between slider and curve; common in amateurs | Medium |

- Gyro sliders with 0–5 in. of break had a 16.5% swinging-strike rate in one sample; sweepers had the highest called-strike
  rate there. No slider type is better by default; the best ones live just off the edges.
- Sweepers in MLB: .255 BABIP, 27% hard-hit, 12% pop-up, vs regular sliders .280 / 34% / 7% (MLB.com). Pitchers cut
  sweeper usage in half vs opposite-side hitters.
- v1.0 already has Drew's rule that a **plus** slider to an opposite-side hitter is a back-foot slider. That fits the
  research only for plus sliders with command; a below-average sweeper to an opposite-side hitter should stay rare.
- College average slider (Rapsodo): 76 mph, 9 mph off, only about 1.5 in. of sweep and 4 in. of vertical break. Most
  amateur sliders are closer to gyro than sweeper, so the defaults by level must differ.

### 1.5 Curveball

| Profile tag | Shape | Speed off fastball | Plays best |
|---|---|---|---|
| **12-6** | Straight down (drop much bigger than side break) | ~10–14 mph | Off a riding fastball (north-south); early-count called strikes; below the zone with two strikes |
| **Sweeping / 1-7** | Down and to the glove side | ~10–14 mph | Like a slower slider-curve; more platoon gap than a 12-6 |
| **Power / knuckle curve** | Tighter, harder, sharp drop | ~8–11 mph | Whiff pitch |
| **Slow / loopy** | Big, slow arc | 13+ mph | Steal a strike, change timing; dangerous when hung |

- Rule of thumb from coaching sources: drop > side break = curve, equal = slurve, side break > drop = slider.
- The 12-6 needs a high slot; lower slots turn curves sideways.
- First-pitch curveballs in MLB: 56% called strikes, 0.4% whiffs (hitters sit fastball early and take it). High
  curveballs early in the count drew swings only 26% of the time vs 65% for other pitches.
- Curveballs have a reverse platoon split, mostly through called strikes vs opposite-side hitters.
- College average curve (Rapsodo): 73 mph, 12 mph off, and only about −1 in. of vertical break. Amateur curves are much
  less vertical than MLB curves (roughly −10 in. in MLB; the engine's current placeholder uses −10), so "12-6" at HS
  means "more drop than sweep", not MLB depth.

### 1.6 Changeup

| Profile tag | Shape | Plays best | Pairs with |
|---|---|---|---|
| **Fade** (circle) | Arm-side run plus some drop | Away from opposite-side hitters | Run fastball, sinker (hides best out of the hand) |
| **Drop** (tumble) | Less run, more depth | Both sides; under a riding fastball | Riding four-seamer |
| **Split** (splitter, split-change, Vulcan) | Low spin, tumbles; firmer than most changeups | Two-strike put-away; righty vs lefty fix | Riding four-seamer (opposite vertical action) |
| **Firm / straight** | Small speed gap (about 6 mph or less) | Contact and ground balls, not whiffs | Any; flag it as a weak whiff pitch |

- Speed gap: studies put the useful band at about 5–12% slower (roughly 5–12 mph at college/pro speeds), with whiffs
  better toward the larger gaps (earlier research doc, 3.3). A pitcher who switched grips
  said that at 6–7 mph off, his changeup was "basically a bad fastball". College average: 78 mph, 7 mph off (Rapsodo).
- The changeup should match his fastball type: run/sinker pitchers want more run, ride pitchers want more drop.
- Changeups and splitters are strongest vs opposite-side hitters. v1.0's rule: with a plus changeup, go away.

### 1.7 Tag list for coaches (default input)

| Pitch | Tags | Measured numbers that override |
|---|---|---|
| Fastball | rides · runs · cuts · straight | velo, IVB, HB, release height, arm angle |
| Sinker | run · drop · two-seam | velo, IVB, HB |
| Cutter | hard · big · ride | velo, HB, IVB |
| Slider | gyro · tight · sweeper · slurve | velo, HB, IVB |
| Curveball | 12-6 · sweeping · power · slow | velo, IVB, HB |
| Changeup | fade · drop · split · firm | velo, IVB, HB |
| Pitcher | slot: over the top · high ¾ · ¾ · low ¾ · sidearm | arm angle / release height |

Each tag gets default numbers by level (MLB from Statcast, college from Rapsodo/TrackMan averages, HS estimated lower
until we have data). The engine should always use each pitch **relative to his own fastball** (speed gap and movement
difference), which also cancels device bias between TrackMan and Rapsodo.

---

## Part 2. How the pitches play off each other (the arsenal)

### 2.1 Principles

1. **Everything is judged off his main fastball, out of the same release.** Public pitch models grade secondaries by
   speed and movement differences from the fastball. A pitch that changes slot tips itself.
2. **Opposite directions pair best.** East-west: run/sinker vs glove-side (cutter, slider, sweeper). North-south: riding
   fastball vs drop (12-6 curve, drop changeup, split).
3. **Separation has a sweet spot.** For fastball/slider pairs that got chases: about 6–14 in. side-to-side difference,
   8–16 in. up-down, 6–11 mph. Past about 18 in. the slider gets recognized early. (Earlier research doc, 3.4.)
4. **Bridges.** A cutter fills the gap between a fastball and a big slider; a two-seamer fills the gap toward a changeup.
5. **Mirrors.** Hard cutter and sinker: same speed and drop, opposite directions.
6. **Fastball-like speed, different shapes ("two-fastball look").** Four-seam + sinker and/or cutter controls contact and
   steals strikes; it gives up some whiffs by design.

### 2.2 Which secondaries fit which fastball

| Main fastball | Best partners | Weaker fits |
|---|---|---|
| Rides (high slot) | 12-6 / power curve, split or drop changeup, gyro slider, hard cutter | Run sinker as a main pitch (opposite physics) |
| Runs / carry (¾) | Slider or sweeper, vertical curve, fade changeup | — |
| Sinker (low slot) | Sweeper, fade changeup (vs opposite side), cutter (vs opposite side) | 12-6 curve (slot) |
| Cuts (supinator) | Sweeper, curve, split | Fade changeup |
| Straight / dead zone | Sinker or cutter for a second shape, plus whichever breaking ball he commands | Relying on the fastball low |

This table is for the engine's **defaults and explanations**, not to stop a coach from entering any arsenal. A pitcher
whose arsenal doesn't "fit" still gets called; the fit only changes how much the pair terms below help.

### 2.3 What the data says about pitch-to-pitch order (two-pitch studies)

- **Same path, different finish works for every pitch type.** As the second pitch of a pair that looked alike at the
  decision point and then split, every pitch type got more swinging strikes: knuckle curve +3.8 pts, curve +3.1,
  slider +2.7, splitter +2.6, two-seam +2.5, changeup +2.2, sinker +2.0, cutter +1.2, four-seam +1.2 (Roegele,
  2013–14). The most common such pairs: four-seam ↔ slider, two-seam ↔ slider, four-seam → curve, four-seam ↔ changeup,
  sinker ↔ slider.
- **Follow-ups by first pitch** (Kalk 2009, PITCHf/x, count-adjusted run value; small samples marked, no significance
  tests, so medium-low confidence):
  - After a **four-seamer**, every pitch type did better. Best: splitter, sinker, curve, slider.
  - After a **sinker**: four-seam, slider and cutter better; curve and changeup worse.
  - After a **cutter**: changeup best by far, cutter again good; curve and four-seam worse.
  - After a **curve**: curve again and changeup better; slider, sinker, cutter worse.
  - After a **slider**: slider again, sinker, cutter better; curve much worse.
  - After a **changeup**: changeup again good; sinker much worse.
  - Back-to-back of the same off-speed pitch was usually fine; **switching between two different breaking balls** was the
    worst combination.
- **The setup pitch changes the umpire too.** After an edge fastball, a "toss-up" fastball on the same edge became a
  called strike far more often (BP), so working an edge can widen it.
- **Hard in only works if it knocks him off his A swing.** Late contact on inside fastballs is about 50 points of wOBA
  worse; early or on-time contact there does big damage (FanGraphs).
- **Mixed evidence, not built on:** a high inside fastball did not clearly help the pitch after it, and itself did best
  after another fastball (THT). So "fastball up and in, then anything" is not a rule on its own.

---

## Part 3. At-bat setup rules

### 3.1 How a setup rule works (built to Drew's constraints)

- **Only the payoff pitch gets credit.** A rule fires after the setup pitch has **actually been thrown in this at-bat**
  and its conditions hold. Then the payoff pitch gets a small, named credit, like v1.0's coach reads. The setup pitch
  itself never gets a bonus and is never forced, so the engine never gives up value now to set up later. It throws the
  setup pitch only when that pitch was a good call on its own.
- **At-bat scope.** Everything resets at the next plate appearance.
- **"Will it work" checks, common to every rule:**
  1. The setup pitch landed close to its spot (logged location, or no "way off" result). A wild miss sets nothing up.
  2. The hitter didn't square it up (no hard contact or hard foul on the setup pitch).
  3. The payoff pitch is one he's trusting and landing today (v1.0's landing and confidence logic).
  4. The count allows it: v1.0's hard rules still win (no chase pitch at 3-0 or 3-1; attack at 2-2).
  5. The arsenal actually has the profiles the rule needs (e.g. a riding fastball, not a sinker).
- **Size:** the smallest round value that passes the rule's own scenario rows (same method as v1.0's coach reads), and
  the why line names it ("Set up by the fastball up: curve down").

### 3.2 The rules

Confidence: **High** = coaching consensus plus data; **Medium** = coaching consensus plus partial or older data;
**Low** = plausible, thin evidence (kept out of the first build).

**S1. Up, then down (vertical tunnel). High.**
- Setup: riding fastball (or ride cutter) at the top of the zone, taken for a strike, fouled, or swung through.
- Payoff: 12-6 / power curve, or drop / split changeup, at the bottom of the zone or just below.
- Why: the two share the early path and finish far apart vertically; four-seam → curve is one of the most common
  "same path, different finish" pairs, and curves gain the most there. Gallen's bottom-edge changeup and curve tunnel
  with his riding fastball.
- Doesn't fire: fastball is run / sinker / dead zone (no vertical contrast); payoff pitch is a sweeper or slurve (it
  separates sideways, not down).
- Best counts: 0-1, 1-1, 0-2, 1-2, 2-2.

**S2. In, then away, same-side hitter (east-west). High.**
- Setup: sinker or running fastball inside to a same-side hitter.
- Payoff: slider / sweeper down and away (back of the zone or off it).
- Why: opposite movement; slider was the best follow-up to a sinker; sinker ↔ slider is a top tunnel pair; the
  sinker's modern job is to keep hitters from diving out over the plate for sliders.
- Doesn't fire: hitter was on time or early on the inside pitch (hard-in failed); opposite-side hitter (use S3).

**S3. Hard in, soft away, opposite-side hitter. High.**
- Setup: hard cutter or fastball inside to an opposite-side hitter.
- Payoff: fade / split changeup down and away.
- Why: after a cutter the changeup was the best follow-up by a wide margin; the changeup moves away from opposite-side
  hitters; coaching "classic follow-up to busting a hitter inside".
- Doesn't fire: no changeup he trusts today; hitter was on time on the inside pitch.

**S4. Same lane, slower (speed change on one line). Medium-high.**
- Setup: fastball to a spot on the outer third.
- Payoff: changeup (or curve) starting on the same line and finishing lower / off the plate.
- Why: the path matches long enough that the hitter commits to fastball speed; the changeup's value is the speed gap
  only if he thinks fastball. Opposite-side hitters: fastball away then changeup away is the best-supported pair there.
- Doesn't fire: firm changeup (speed gap under about 6 mph); hitter showed he was sitting soft (v1.0's "out front"
  read already covers the reverse case).

**S5. Front door / back door for a called strike. Medium.**
- Setup: the hitter has been worked away with soft stuff or expanded off the plate earlier in the at-bat, so he expects
  something away or off the plate.
- Payoff, two forms:
  - Run sinker that starts at an opposite-side hitter's front hip and runs back over the inside corner (front door).
  - Breaking ball or cutter that starts off the outside edge and comes back over it to an opposite-side hitter (back door).
- Why: Michael King had 16 called strikeouts with his sinker by mid-2025 (11 front door to lefties, 5 back door to
  righties), mostly with two strikes when the hitter expected a chase pitch. Back-door breaking balls are classic called
  third strikes after something hard inside.
- Doesn't fire: command grade below 4 or pitch not landing today (a miss is a hit batter or a cookie); low levels until
  we know amateur umpires call it (MLB umpires already miss these more than other pitches).

**S6. Steal strike one with a breaking ball, then attack with the fastball. Medium-high.**
- Setup: first-pitch curve (12-6 / slow / sweeping) or gyro slider for a called strike.
- Payoff: fastball at 0-1 (any strike spot).
- Why: hitters sit fastball at 0-0 and take early curves (56% called strikes, almost no whiffs in MLB); starting with a
  breaking ball led to more pitcher's counts and strikeouts. Maddux, demonstrating to a kid: breaking ball first, then
  the same fastball in got weak contact instead of hard contact. Fits Drew's "first-pitch strike is super important".
- Caution: an older study found off-speed-then-fastball rarely helped on average (Kalk 2009). The difference is the
  called strike: the rule only fires when the breaking ball was taken for a strike, not after a ball or a swing.
- Doesn't fire: the breaking ball isn't landing today (v1.0 holds it back at 0-0 anyway).

**S7. Climb the ladder (two strikes). Medium.**
- Setup: riding fastball at the top of the zone that got a late swing or a whiff (a late foul to the opposite field
  counts; a foul straight back means he was on it, so it doesn't).
- Payoff: riding fastball just above the zone (v1.0's fastball chase target), two strikes only.
- Why: the hitter's eyes and timing are set on the top of the zone; a ride fastball above it looks like the same pitch.
  Sinkers thrown high off the plate do poorly, so ride only.
- Doesn't fire: sinker / dead-zone fastball; hitter was on time or early; under two strikes. v1.0's "repeat after a
  whiff" already gives part of this.

**S8. Strike, then bury the same pitch. Medium-high.**
- Setup: curve or slider that landed for a strike at the bottom edge (called or swinging).
- Payoff: the same pitch a few inches lower, below the zone, with two strikes (or 1-2).
- Why: Gallen's curve sequence (bottom-of-zone curve, then one that drops further into the chase region); curve → curve
  and slider → slider both did better than average. The first one tells the hitter it's a strike; the second looks the
  same and isn't.
- Doesn't fire: the first one was hit hard or fouled squarely; 3-ball counts (hard rule).

**S9. Work the edge, then expand off it. Medium-high.**
- Setup: early-count fastball or cutter on one edge (inside edge to a lefty, outside edge to a righty).
- Payoff: a pitch that starts on that same edge and moves off it with two strikes: cutter in on the hands after an inside
  four-seamer; slider-cutter breaking away after a hard cutter on the outside edge.
- Why: Gallen led starters in early-count edge rate (51%) and in two-strike chase rate (33%); edges set up chases. The
  umpire effect (an edge pitch widens that edge) points the same way. This is Drew's "expand, don't waste" made
  concrete.
- Doesn't fire: the edge pitch missed badly; the payoff pitch would be a chase at 3-0 / 3-1.

**S10. Sinker, then cutter (mirror). Medium.**
- Setup: sinker.
- Payoff: hard cutter (opposite direction at the same speed), usually to the other side of the plate.
- Why: cutters did better after sinkers; cutter-sinker pitchers (Halladay, Carpenter) are the classic case; same speed and
  drop, opposite break.
- Doesn't fire: no real cutter (see the HS caution); the cutter is a "big" slutter (then it's S2's job).

### 3.3 Anti-setups (small penalties on the follow-up)

**N1. Don't switch between two different breaking balls back to back. Medium-low.** Curve right after slider, or slider
right after curve, was the worst follow-up in the 2009 study, while the same breaking ball twice did fine. Logic: the
hitter has already slowed down and the second one is in the same speed band. Validate on Statcast before building.

**N2. Don't follow a changeup with a sinker. Medium-low.** It was the worst follow-up after a changeup: both move arm side,
so the hitter's eye is already adjusted. Same validation requirement.

### 3.4 Not built (evidence too thin)

- "Fastball up and in, then anything": the high-inside-fastball study didn't support a general boost.
- "Fastball up after soft stuff down" as a rule on its own: already covered by v1.0's timing term and hitter reads.
- "Don't double up after fooling a good hitter": coaching advice conflicts with the data (repeats after a whiff did fine),
  and v1.0 already has Drew's repeat-after-a-whiff rule.

---

## Part 4. What this means for the engine (for the plan, not built)

1. **Kinds:** `FB`, `SI`, `FC`, `SL`, `CB`, `CH`, each with the profile tags in 1.7 and the pitcher's slot. Measured
   numbers override tag defaults. Defaults by level.
2. **Pitch model:** each pitch described by speed gap and movement difference from his main fastball, plus break direction
   relative to the hitter (the Tier-1 fits from the earlier doc: H1 shape, H2 fastball shape × zone, H3 platoon by break
   direction, H4 familiarity per pitch with carry-over to similar shapes).
3. **Setup rules S1–S10 and anti-setups N1–N2:** named payoff credits in `cost08`, at-bat scoped, with the five
   "will it work" checks. They replace v1.0's dead look-value "Sets up" line with something that actually fires.
4. **Checks:** each rule gets read-through rows where it should fire and where it shouldn't (for Drew to grade), and a
   Statcast check of its direction (report, not veto). S5 waits for an answer on amateur umpires.
5. **Test arsenals:** add at least ride FB + 12-6 + split; sinker + sweeper + fade CH (low slot); four-seam + hard cutter +
   gyro slider + curve; dead-zone FB + sinker + slider; HS two-pitch fastball + slurve.

## Part 5. Drew's answers (Nov 12)

1. **Tie-break:** if two calls are exactly the same on their own, take the one that sets up a payoff.
2. **Front door / back door (S5):** keep it at HS and D3, but don't get overly reliant on it: command still matters and
   strikes are big.
3. **Tag list (1.7):** approved as is.

The build plan is `docs/PLAN_v1.1_2026-11-12.md`.

## Sources

- Arm slot and profiles: [Rapsodo: three fastball movement profiles](https://rapsodo.com/blogs/baseball/understanding-the-three-fastball-movement-profiles-in-modern-pitching);
  [pitchLogic metrics e-book](https://issuu.com/selectgroup/docs/app_public_pitchlogic_ebook);
  [pitchLogic: about fastballs](https://pitchlogic.com/stuffpl/about-fastballs);
  [pitchLogic: curveball 101](https://pitchlogic.com/blogs/curveball-101-understanding-and-learning-how-to-throw-the-pitch);
  [FanGraphs: The Junk Box Is Full of Mystery](https://blogs.fangraphs.com/the-junk-box-is-full-of-mystery);
  [FanGraphs: Will Warren's One Weird Trick](https://blogs.fangraphs.com/will-warrens-one-weird-trick/);
  [TDA Baseball: Statcast arm angle](https://www.tdabaseball.com/post/how-important-is-the-new-statcast-arm-angle-data);
  [Baseball Prospectus: motor preference / the triangle](https://baseballprospectus.com/?p=87514)
- Sinker: [MLB.com sinker breakdown](https://www.mlb.com/news/statcast-sinker-pitch-breakdown-analysis);
  [FanGraphs: The High Sinker Paradox](https://blogs.fangraphs.com/the-high-sinker-paradox/);
  [Wikipedia: Fastball](https://en.wikipedia.org/wiki/Fastball)
- Cutter: [Baseball America: pitch classification](https://baseballamerica.com/?p=48730);
  [Baseball Prospectus: hard vs soft cutters](https://www.baseballprospectus.com/?p=26345);
  [Baseball Prospectus: sinker/cutter mirror](https://www.baseballprospectus.com/?p=26710);
  [Pitcher List: the cut fastball is back](https://pitcherlist.com/the-cut-fastball-is-back-in-style/);
  [MLB glossary: cutter](https://www.mlb.com/glossary/pitch-types/cutter);
  [Dan Blewett: natural cut](https://danblewett.com/natural-cut-pitching/)
- Slider: [Rockland Peak Performance: slider vs sweeper](https://rocklandpeakperformance.com/?p=11304);
  [MLB.com: the sweeper explained](https://www.mlb.com/news/sweeper-slider-latest-pitching-trend-explained);
  [Zone Coverage: gyro sliders](https://zonecoverage.com/?p=164979);
  [FanGraphs: sweeping sliders](https://blogs.fangraphs.com/the-secret-benefit-and-cost-of-sweeping-sliders/)
- Curveball: [Rockland Peak Performance: curveball types](https://rocklandpeakperformance.com/?p=11849);
  [Wikipedia: Curveball](https://en.wikipedia.org/wiki/Curveball);
  [Pitcher List: first-pitch breaking balls](https://pitcherlist.com/weve-been-thinking-about-breaking-balls-wrong/);
  [FanGraphs Community: curveballs underused early](https://community.fangraphs.com/curveballs-are-underutilized-early-in-the-count/);
  [Curveball reverse platoon](https://sphere-violet-aj87.squarespace.com/blog/why-do-curveballs-have-reverse-platoon-advantage)
- Changeup: [Rockland Peak Performance: changeups](https://rocklandpeakperformance.com/?p=27662);
  [FanGraphs: Crowe and Martinez on changeups](https://blogs.fangraphs.com/wil-crowe-and-nick-martinez-on-learning-and-developing-their-changeups);
  [Low Three Quarter: changeup vs splitter](https://lowthreequarter.com/2024/02/06/death-of-the-changeup-whats-wrong-with-baseballs-oldest-pitch-and-why-the-splitter-movement-might-be-to-blame/)
- Amateur averages: [Rapsodo college pitching averages](https://rapsodo.com/blogs/baseball/college-pitching-averages-and-how-to-reach-them);
  MLB speeds: [RotoWire pitch speed 2002–2025](https://www.rotowire.com/baseball/article/mlb-pitch-speed-and-usage-2002-to-2025-94262)
- Pairing and sequencing: [THT: The Effects of Pitch Sequencing](https://tht.fangraphs.com/the-effects-of-pitch-sequencing/) (Roegele);
  [THT: Pitch sequencing](https://tht.fangraphs.com/pitch-sequencing/) (Kalk 2009);
  [THT: All about the high inside fastball](https://tht.fangraphs.com/all-about-the-high-inside-fastball/);
  [MLB.com: Zac Gallen's command](https://www.mlb.com/news/zac-gallen-command-greg-maddux);
  [Baseball Prospectus: Maddux sequence](https://www.baseballprospectus.com/?p=19173);
  [Sports Illustrated: Maddux, "Heady Stuff"](https://vault.si.com/vault/2004/08/09/heady-stuff-as-remarkable-as-it-is-to-win-300-games-greg-madduxs-real-feat-has-been-to-thrive-as-a-finesse-pitcher-in-a-power-era);
  [MLB.com: Michael King's sinker](https://www.mlb.com/amp/news/michael-king-freezes-hitters-with-his-sinker.html);
  [Fox Sports: the backdoor pitch](https://www.foxsports.com/stories/other/the-downside-of-backdoor);
  [Baseball Prospectus: set-up fastball and the umpire](https://www.baseballprospectus.com/?p=23615);
  [FanGraphs: Too Much Math About an Old Adage](https://blogs.fangraphs.com/too-much-math-about-an-old-adage/);
  [FanGraphs: hard in and soft away](https://blogs.fangraphs.com/can-hard-in-and-soft-away-make-your-troubles-go-away);
  [Rapsodo: three fastball profiles](https://rapsodo.com/blogs/baseball/understanding-the-three-fastball-movement-profiles-in-modern-pitching);
  [Pitcher List: three fastballs](https://pitcherlist.com/the-cut-fastball-is-back-in-style/);
  [Coaches Insider: pitch selection](https://coachesinsider.com/baseball/pitch-selection-article)
