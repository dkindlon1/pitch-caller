# Research: pitch types, movement and sequencing (Nov 12, 2026)

Question from Drew after the v1.0 sign-off: v1.0 only ever calls fastball / slider / changeup. It never thinks about
a cutter, sinker, curveball, a bullet (gyro) slider vs a sweeper, or a fastball that rides vs one that runs. How do these
pitches and movements interact, and how should that change sequencing?

This doc is research and hypotheses only. Nothing here is built or fitted yet. Each hypothesis says how we would test it
with the Statcast pipeline we already have (`seq_fit.py` rules: 2024 train, 2025 held out, ship only on held-out gain
> 2 bootstrap SD).

---

## 1. Bottom line

1. **The research is clear that pitch type alone is too coarse.** Public pitch models (FanGraphs Stuff+, Baseball
   Prospectus StuffPro, aStuff+) all judge a secondary pitch by its velocity and movement *relative to the pitcher's
   own primary fastball*, and handedness interacts with movement direction. A "slider" covers two pitches that play
   opposite platoon games (gyro vs sweeper).
2. **Where the big, reliable effects are:** fastball shape decides which part of the zone it plays in; break direction
   relative to the hitter decides the platoon split; hitters catch up to a specific pitch the more they see it (breaking
   balls fastest). These are large and replicated.
3. **Sequencing and setup work (Drew, from playing; corrected Nov 12).** An earlier draft of this doc called order
   effects "small or mixed". That over-read the data. MLB pitch-by-pitch studies measure *average* differences in
   pitchers who already sequence well. When everyone mixes near the balance point, each option looks about equally good
   in observational data, even though throwing the setup pitch is exactly what makes the next pitch work. On top of
   that, studies average over all fastballs and all off-speed, so a real effect for one shape pair (ride fastball up →
   curve down; sinker in → sweeper away) cancels against pairs where it doesn't apply. Our own v0.8 eye-level fit
   (slightly negative) has both problems. So weak averages in the data are not evidence that sequencing doesn't work.
4. **v1.0's own setup layer is effectively dead.** The build report found look value moves calls by about ±0.0004 runs
   and "Sets up" almost never fires. So the engine doesn't really plan setups today.
5. **Next engine step:** give the engine a real description of each pitch (shape relative to his fastball, which way it
   breaks relative to the hitter), then build sequencing and setup on top of that description as named coaching rules
   keyed on shape pairs (the same way v1.0's coach reads work), with the Statcast data used to size and sanity-check
   them, not to veto them.

## 2. What v1.0 actually does today (checked in the code, `b318098`)

| Area | v1.0 | Effect |
|---|---|---|
| Pitch kinds | `KINDS = ("FB", "SL", "CB", "CH")`. No splitter, no cutter or sinker as its own kind (only as a fastball `shape` tag: ride / run / sink / cut). | A splitter can't be entered. A cutter and a four-seamer are both "the fastball". |
| Shape tags | `SHAPES` has ride / run / sink / cut, slider tight / sweeper, curve loopy / sharp, change fade / drop, with placeholder movement. Optional measured `ivb`/`hb` override them. | Good scaffolding. |
| Where shape is used | Only 3 places: (1) `shape_fit`: hand-set nudges (ride +0.5 up, sink +0.5 down, any off-speed up −1.0, slider to same-side away +0.3, changeup to same-side −0.3); (2) `movement()` feeds `tunnel_score`, used only on chase swings; (3) ground-ball rate for sink / cut. | A sweeper and a tight slider get the same whiff, swing and hard-hit model. Only the tunnel score and nothing else tells them apart. |
| Platoon | `SIDE` table is fitted, but by class only (FB vs off-speed × up/down × same/opposite). | No sweeper platoon penalty, no curveball reverse split, no cutter-is-platoon-neutral. |
| Familiarity | Keyed by class (`FB` / `OS`). | Seeing three curveballs counts the same as seeing three sweepers against a sweeper. |
| Timing / eye level | Timing uses speed only; eye level uses height only. | Lateral movement and break direction never enter sequencing. |
| Fits | `seq_fit.py` maps Statcast `SI`, `FC` → FB; `ST` (sweeper), `SV` (slurve) → SL; `KC` → CB; `FS` (splitter) → CH. | Every fitted v1.0 term is an average over those shapes. |
| Test arsenals | Every simulator preset and `tests.py` arsenal is FB + 1–2 secondaries (one `four_pitch` with FB/SL/CB/CH). None has two fastballs, a cutter, a splitter, or both slider types. | Part of what Drew saw: the engine is never even asked about these arsenals. |

So the engine *can* hold a curveball or a sinker-shaped fastball, but it treats shapes as cosmetic and was never tested
on richer arsenals.

## 3. What the research says

### 3.1 Fastball shape decides where the fastball plays

- **Ride (high induced vertical break, flat approach angle):** plays at the top of the zone. Flat approach up gets swings
  and misses and pop-ups; steep approach is better down. One study found approach angle correlates with fastball carry
  through release angle, so they trade off.
- **Sinker / run:** modern usage has moved hard toward same-side hitters and inside. In 2025, 70% of right-handed sinkers
  went to right-handed hitters (47% in 2013), only 30% of righty-on-righty sinkers crossed at 2 ft or lower (lowest in
  15+ years), and the pitch is valued as a contrast to sliders and sweepers. FanGraphs found sinkers in or around the zone
  up high were *not* bad (they beat four-seamers up in the zone, righty-on-righty); they fail when they miss high off
  the plate.
- **"Dead zone" fastball** (average movement for his arm slot): does worse low in the zone; hitters see it well, so the
  secondaries and location have to carry it. Dead zone is relative to arm slot.
- **Cutter:** fills the movement gap between fastball and slider, platoon-neutral, used in on opposite-side hitters.
- **Front-door / back-door sinkers** steal called strikes but need fine command; umpires miss them more than average.

### 3.2 Breaking balls are not one pitch

| | Gyro / "bullet" slider | Sweeper | Curveball (12-6 / sharp) |
|---|---|---|---|
| Shape | Hard, little break (spins like a football) | Big glove-side break, little drop | Big drop |
| Best use | Strikes and whiffs to both sides; can go up and in to opposite hitters | Same-side chase and weak contact (pop-ups) | Off a ride fastball (north-south); early-count called strikes, especially vs opposite side |
| Platoon | Moderate | Very large: second-biggest gap of any pitch type in 2021–22; pitchers cut usage in half vs opposite side | Reverse split, driven by called strikes (+2.6 pts called strike, −2.0 pts whiff vs opposite side) |

One case study: sliders with 0–5 in. of horizontal break had a 16.5% swinging-strike rate; sweepers had the highest
called-strike rate in that dataset. The same writer's takeaway: no slider type is better by default; location in the
"shadow" of the zone matters most.

### 3.3 Off-speed: changeup vs splitter

- Changeup whiffs come mostly from getting the hitter out front, which tracks the velocity gap off the fastball. Studies
  put the useful band around 5–12% slower (roughly 8–12 mph at college/pro speeds); one perceived-velocity study found
  the peak near 13–14% perceived. Changeup speed by itself barely relates to whiffs.
- Extra drop relative to the fastball relates to changeup whiffs about as strongly as anything measured.
- **Splitter** pairs with a ride four-seamer (opposite vertical action) and is the usual fix for a right-hander who can't
  get lefties out.
- A **changeup off a sinker** is easier to hide out of the hand than a changeup off a four-seamer (Baseball Prospectus
  tunnel data). One older study found the best changeup results came from a straight, low-spin fastball with a running,
  high-spin changeup: separation helps.

### 3.4 Pitches are judged relative to his fastball: separation has a sweet spot

- Every major public stuff model includes velocity and movement differences from the pitcher's primary fastball.
- One analysis of fastball / slider pairs that got chases: 6–14 in. horizontal separation, 8–16 in. vertical, 6–11 mph.
  Over ~18 in. was "borderline unusable" (the slider is recognizable early). Examples where a stuff model loved the slider
  but a huge gap killed its chase rate, and the reverse.
- The **cutter as a bridge**: when the fastball–slider gap is too big, a cutter in between makes both harder to identify;
  much of its value comes from just existing.
- A two-fastball look (four-seam + sinker / cutter) keeps the pitcher in the zone and controls contact.

### 3.5 Platoon by pitch type (MLB)

| Pitch | Platoon gap | Note |
|---|---|---|
| Sinker / two-seam | Large | wOBA vs opposite 0.365 vs same 0.333 (RHP, 2021–22) |
| Sweeper | Very large | 0.277 vs 0.247 |
| Slider (gyro / regular) | Medium | 0.290 vs 0.266 |
| Cutter | Small | 0.328 vs 0.318 |
| Four-seam | Small | 0.343 vs 0.339 |
| Changeup, splitter, curveball | Reverse or small | They move down and/or away from opposite hitters |

Rule of thumb from the literature: horizontal movers work best on same-side hitters; vertical movers (curve, changeup,
splitter) work best on opposite-side hitters. Break *away* from the hitter is good; break *toward* his barrel is bad.

### 3.6 Sequencing evidence

- **Tunnel, then split:** every pitch type got more swinging strikes as the second pitch when the two shared a path to
  the decision point and then moved differently (Roegele, 2014).
- **Predictability costs strikeouts:** a pitcher's K rate falls as his fastball share and pitch-to-pitch correlation in
  location, speed and movement rise (Journal of Sports Analytics).
- **Same off-speed twice:** on average not a good choice (Glaser 2010). Pitchers do repeat after a whiff, but after
  controls the repeat didn't clearly help, except an odd fastball result (Rowan, SABR 2021). v1.0 already allows the
  repeat after a whiff.
- **Familiarity is per pitch and fastest for breaking balls:** wOBA per pitch rises each time a hitter sees the same
  pitch type in a game: curveball +0.009, slider +0.006, changeup +0.006, sinker +0.004, cutter +0.003, four-seam +0.002
  (2011–13). BP's arsenal metrics count sightings of the *specific* pitch. Pitchers with more than one breaking-ball shape
  hold up better through a game.
- **Eye level:** descriptive data (no controls) shows the best whiff and wOBA sequences mix off-speed and breaking pitches
  with a height change, and umpires call fewer strikes right after the pitcher switches height. Our own controlled v0.8
  fit found a small cost on average. The two are reconcilable if the benefit lives in particular shape pairs.
- **Hard in, soft away:** the data supports soft away more than hard in. Inside fastballs limit damage on contact but let
  the hitter start early (fewer whiffs). Best supported: same-side hitters get fastballs in plus breaking balls away;
  opposite-side hitters get fastballs away plus changeups away.
- **Pitchers change *where*, not *what*** after a hitter succeeds against them (BP).
- **Order effects in the averages are mixed:** a careful series ("Defining the Pitch Sequencing Question") found some
  changes help and some hurt, with no clean rule. Read with the caveat in section 1, point 3: observational averages
  from pitchers who already sequence well understate what sequencing is worth.

### 3.7 Caveats for our levels

- Almost all of this is MLB. Amateur pitchers have less movement and velocity, and hitters chase more. v1.0's `RHO_L`
  rule (HS 0.6) would scale behavioral terms; physical ones (movement → ground balls) may transfer more fully.
- Measured movement differs by device: Baseball America flagged college TrackMan vertical break as likely "overheated".
  Rapsodo's college average for a right-handed four-seamer is about 8 in. horizontal / 16 in. vertical, cutter about
  2 / 10. **Using each pitch's difference from the same pitcher's fastball, measured on the same device, cancels most
  of that bias.** This is a strong reason for relative features.

## 4. Hypotheses

Ranked by expected size × how sure the research is. Each one has the engine change it implies and the test.

### Tier 1: large, well supported

**H1. Describe every pitch by shape relative to his fastball, not by name.**
- Claim: whiff, chase, called-strike and hard-hit chances depend on Δvelocity, Δvertical break and Δhorizontal break from
  his primary fastball (plus arm slot), more than on the pitch's name.
- Engine: add kinds `FC` (cutter), `SI` (sinker as its own fastball), `FS` (splitter), `SW` (sweeper) and keep `SL` as
  the tight/gyro slider (slurve as a tag). Each kind gets default movement by level and arm slot; measured movement from
  TrackMan / Rapsodo replaces it. The outcome model reads the three Δs instead of `KIND_W`.
- Test: in `seq_fit.py`, compare (a) today's class model, (b) + Statcast pitch-type dummies (FF, SI, FC, SL, ST, CU, KC,
  CH, FS), (c) + continuous Δ features. Targets: whiff | swing, chase | out of zone, called strike | take, hard | contact.
  Primary fastball = his most-thrown fastball in that game (BP's definition). Ship (b) or (c) only on held-out gain.

**H2. Fastball shape changes which zone it wins.**
- Claim: ride/flat fastballs gain most up; sinker/run gains in to same-side hitters and holds up in the zone more than
  the old "keep it down" rule says; a cutter gains in to opposite-side hitters; a dead-zone fastball loses most low.
- Engine: replace the hand-set `shape_fit` fastball lines with fitted shape × height × side terms.
- Test: interactions of fastball Δ shape (or SI / FC / FF) with plate height and inside/away (by batter side) on whiff,
  hard hit and called strike.

**H3. Platoon comes from break direction, not from "off-speed".**
- Claim: a pitch breaking away from the hitter gains, breaking toward him loses; size grows with how much it breaks.
  Predicts: sweeper large platoon cost, gyro slider/cutter small, curveball reverse split mostly through called strikes,
  changeup/splitter strong vs opposite side.
- Engine: replace `SIDE`'s FB/OS split and the two hand-set platoon patches with one fitted term on signed horizontal
  break relative to the batter (and drop size), by height.
- Test: same fit; check against the platoon table in 3.5.

**H4. Familiarity is per pitch, with partial carry-over to similar shapes.**
- Claim: seeing sweepers helps a hitter against the sweeper much more than seeing curveballs does; breaking balls wear
  out fastest; two breaking shapes hold up better than one.
- Engine: key `familiar` by pitch name; a sighting of pitch j counts toward pitch i by a similarity weight from their
  shape and speed distance.
- Test: class-keyed (today) vs pitch-keyed vs similarity-weighted familiarity on held-out data. Starter games only, per
  the existing survivor-bias check.

### Tier 2: real but smaller or less certain

**H5. Separation has a sweet spot (inverted U).**
- Claim: a secondary's chase and whiff rates rise with separation from his fastball up to a band (roughly 6–14 in.
  horizontal, 8–16 in. vertical, 6–11 mph for sliders; 8–12 mph for changeups), then fall.
- Engine: a pair term on the Δs (spline), which would also give the cutter "bridge" value without a special rule.
- Test: spline on Δ features for chase | out of zone and whiff | swing, controlling for the pitch's own stuff.

**H6. Sequencing works through shape contrast, not height alone.**
- Claim: the eye-level and side changes help when the two pitches move in opposite directions (ride fastball up →
  curve / splitter down; sinker in → sweeper away) and don't help or hurt when they don't (sinker down → curveball down
  from the same height). This would explain why our class-level eye-level fit came out slightly negative.
- Engine: generalize the eye-level term into a "last pitch vs this pitch" contrast on movement direction and spot.
- Test: add previous-pitch Δ-shape × location-change features to `seq_fit.py`; check whether the eye-level coefficient
  flips sign within shape pairs.

**H7. Each shape has a role: strike pitch vs chase pitch.**
- Claim: gyro slider, cutter, front-door / back-door sinker and the curveball vs opposite hitters steal called strikes
  early; sweeper and splitter are chase / put-away pitches. A coach would call them differently by count.
- Engine: should mostly fall out of H1–H3 if the called-strike model reads shape and side. No hand rule unless the fit
  misses it.
- Test: called-strike-on-take and chase rates by shape × count × side.

### Tier 3: likely don't build

- **Arsenal "bridge" bonus on its own:** better captured by H4/H5 than as a separate term.
- **Spin mirroring:** a public analysis found mirroring alone isn't decisive, and coaches can't enter spin axis reliably.
- **Fixed A-then-B scripts:** a script is predictable. Setup belongs in the engine as shape-pair coaching rules that
  raise the follow-up pitch's value after the setup pitch, still drawn from a mix (see section 1, point 5).

## 5. What a coach-level check would look like

New read-through rows (graded by Drew, like `scenarios_v10.json`):

1. Ride fastball + 12-6 curve, 0-2: fastball up and curve down should both be live; curve below the zone.
2. Sinker / sweeper righty vs right-handed hitter: sinker in, sweeper away. Same pitcher vs left-handed hitter: sweeper
   usage drops sharply; changeup or cutter takes over.
3. Four-seam / cutter / sweeper vs left-handed hitter: cutter in for strikes.
4. Righty with a splitter vs left-handed hitter, two strikes: splitter is the main put-away.
5. Gyro slider and sweeper in one arsenal: gyro shows up early and for strikes, sweeper for chase.
6. Dead-zone fastball: fewer low fastballs, more secondaries.
7. Changeup only 4 mph off: used for contact (ground balls), not as the main whiff pitch.

And the test grid gets arsenals with two fastballs, a cutter, a splitter, and both slider types, at every level.

## 6. Proposed order (for a plan, not built)

1. Re-download Statcast (`fetch_statcast.py`; the loader already keeps `pfx_x`, `pfx_z`, speed, release, plate location,
   `stand`, `p_throws`, `pitch_type`).
2. Run the H1 comparison first. It decides whether pitch-type dummies are enough or continuous shape is needed, and every
   other hypothesis builds on it.
3. Then H3 and H2 (platoon and zone), then H4 (familiarity), then H5/H6.
4. Engine changes only for what ships, with new kinds, defaults by level, and the read-through rows above.

## 7. Open questions for Drew

- Coaches without TrackMan / Rapsodo: is a shape tag from a short list (e.g. "rides / runs / sinks / cuts", "gyro /
  sweeper", "12-6 / slurve") acceptable as the default input, with measured numbers as an upgrade?
- Should the engine keep 4 pitch kinds with richer shape tags, or show the coach the real names (cutter, sinker,
  splitter, sweeper)? The fit can work either way; it is a UI and data question.

## Sources

- FanGraphs: [The Secret Benefit (And Cost) Of Sweeping Sliders](https://blogs.fangraphs.com/the-secret-benefit-and-cost-of-sweeping-sliders/);
  [Mathemadage: Hard In, Soft Away](https://blogs.fangraphs.com/mathemadage-hard-in-soft-away/);
  [The High Sinker Paradox](https://blogs.fangraphs.com/the-high-sinker-paradox/);
  [The Benefits of Changing a Hitter's Eye Level](https://blogs.fangraphs.com/the-benefits-of-changing-a-hitters-eye-level);
  [The Consequences of Changing an Umpire's Eye Level](https://blogs.fangraphs.com/the-measurable-effects-of-changing-an-umpires-eye-level);
  [Changeups Are Weird](https://blogs.fangraphs.com/changeups-are-weird/);
  [Stuff+ primer](https://library.fangraphs.com/pitching/stuff-location-and-pitching-primer);
  [Batter/Pitcher Splits Crib Sheet](https://blogs.fangraphs.com/batter-pitcher-splits-crib-sheet);
  [It's Release Angles All The Way Down](https://blogs.fangraphs.com/its-release-angles-all-the-way-down);
  [Why the Front-Door Sinker Isn't a Trend… Yet](https://blogs.fangraphs.com/why-the-front-door-sinker-isnt-a-trend-yet);
  [Wells and Kells: A Cutter Case Study](https://blogs.fangraphs.com/wells-and-kells-a-cutter-case-study);
  [On Pitch Sequences and Spin Mirroring](https://blogs.fangraphs.com/on-pitch-sequences-and-spin-mirroring)
- The Hardball Times: [The Effects of Pitch Sequencing](https://tht.fangraphs.com/the-effects-of-pitch-sequencing/) (Roegele);
  [The effect of seeing pitches](https://tht.fangraphs.com/the-effect-of-seeing-pitches/) (Roegele);
  [Defining the Pitch Sequencing Question, Part Two](https://tht.fangraphs.com/defining-the-pitch-sequencing-question-part-two/);
  [Forecasting Pitcher Platoon Splits](https://tht.fangraphs.com/forecasting-pitcher-platoon-splits/)
- Baseball Prospectus: [StuffPro / PitchPro](https://www.baseballprospectus.com/?p=89245);
  [arsenal metrics](https://www.baseballprospectus.com/?p=96026);
  [The sinker doesn't play well with others](https://baseballprospectus.com/?p=32798);
  [pitchers change where, not what](https://www.baseballprospectus.com/?p=28770);
  [Quick change artistry](https://www.baseballprospectus.com/news/article/9705/checking-the-numbers-quick-change-artistry)
- MLB.com: [sinker breakdown](https://www.mlb.com/news/statcast-sinker-pitch-breakdown-analysis);
  [Sweeper glossary](https://www.mlb.com/glossary/pitch-types/sweeper)
- [Using PITCHf/x to model strikeout rate vs pitch-sequence predictability](https://content.iospress.com:443/articles/journal-of-sports-analytics/jsa103) (Journal of Sports Analytics)
- [Using Clustering to Find Pitch Subtypes and Effective Pairings](https://sabr.org/journal/article/using-clustering-to-find-pitch-subtypes-and-effective-pairings/) (SABR BRJ 2020)
- [SABR 2021: The Whiff Effect](https://sabr.org/analytics/presentations/2021) (Rowan)
- ProspectsLive: [The Mystic Art of Pitch Tunneling](https://prospectslive.com/the-mystic-art-of-pitch-tunneling)
- Pitcher List: [Who Should Try Adding a Cutter?](https://pitcherlist.com/who-should-try-adding-a-cutter/);
  [Embrace the Sinker](https://pitcherlist.com/embrace-the-sinker/)
- [Why Do Curveballs Have a Reverse Platoon Advantage?](https://sphere-violet-aj87.squarespace.com/blog/why-do-curveballs-have-reverse-platoon-advantage)
- Zone Coverage: [gyro slider analysis](https://zonecoverage.com/?p=164979)
- [Optimal Fastball-Changeup Speed Separation](https://baseballanalysts.com/archives/2009/05/optimal_fastbal.php) (Dave Allen)
- Iowa Baseball Managers: [Dealing with Dead Zone](https://medium.com/iowabaseballmanagers/dealing-with-dead-zone-how-to-optimize-fastball-performance-d186e2bb07ef)
- Rapsodo: [College pitching averages](https://rapsodo.com/blogs/baseball/college-pitching-averages-and-how-to-reach-them);
  [Three fastball movement profiles](https://rapsodo.com/blogs/baseball/understanding-the-three-fastball-movement-profiles-in-modern-pitching)
- Baseball America: [Fastball quality of top 2025 college pitchers](https://www.baseballamerica.com/stories/mlb-draft-prospects-comparing-fastball-quality-of-top-2025-college-pitchers/)
- [Pitch Mix: How Variety and Repetition Impact…](https://downonthefarm.substack.com/p/how-variety-and-repetition-impact) (Down on the Farm; paywalled, headlines only)
