# PitchIQ v1.2 release notes (where misses go, hitter tags)

Branch `v1.2-partb` (Part B on top of Part A, `v1.2-work`) → `main`. Build report: `docs/BUILD_v1.2_REPORT.md`. Plan:
`docs/PLAN_v1.2_2026-11-13.md`.

## What's new for coaches
- **Where each pitch misses.** On a pitch's card, set where his misses go side to side (glove side / even / arm side, "a
  little" or "a lot"), up and down, and whether his misses are tighter or wider than his command says. A hint shows
  the usual direction for the pitch type ("sinkers usually miss arm side"). With nothing set, calls are exactly v1.1's.
  - A sinker that runs arm side is called inside less to a same-side hitter. A curve that misses down is called in the dirt
    less with a runner on third. A pitch whose misses run at the hitter pays the hit-batter cost.
  - With two strikes, a riding fastball that misses high counts as a chase pitch, not a waste pitch.
- **Bullpen charting** (new Bullpen tab): pick the pitcher, then three taps per pitch: the pitch, where the catcher set up,
  where it ended up (or a "Way off" arrow). Optional radar.
- **The app learns each pitch's miss direction** from charted bullpens and game location logs. It shows what the logs say on
  the arsenal card ("logs say he misses arm side, 3.3 in."). It's a flag: what you set is what the calls use.
- **Game logging:**
  - "Way off" now says which way (four arrows).
  - Logging where each pitch ended up is on by default for new setups.
  - Optionally log where the catcher set up.
  - Fixing a pitch's location after the fact now corrects the grid cell itself, instead of erasing it (a v1.1 bug).
- **Hitter tags** on each opposing hitter (Unknown by default), also read from a hitters sheet:
  - **Early counts: aggressive / patient.** Fitted on three seasons of MLB data: an aggressive hitter swings more at
    strikes on 0-0, 1-0 and 0-1, so fewer grooved first pitches. A patient one swings less, so more first-pitch strikes.
  - **Swing path: lift / flat.** A coaching rule, because the public data don't show a measurable effect. A flat swing
    makes the riding fastball up costlier. A lift swing makes the breaking ball down costlier.
  - **Off-speed: hits it hard.** A small starting lean on his off-speed damage that his real at-bats outweigh.
  - The app doesn't learn these tags from the logs. At high school and college pitch counts it can't (checked). They're
    yours to set.
- **Fewer one-pitch games:** the game that threw 83% of one pitch at v1.1 now throws 46%. The high-school ride-up limit
  and the "lean on what's landing" fade were tightened.
- **Removed:** the S2, S4 and S5 setup credits (they changed the call too often, or tipped some games onto one pitch).

## Release order (each step needs Drew)
1. **Merge `v1.2-partb` into `main`.** Vercel deploys the portal and the game app. **No database migration:** the new
   data (bullpen sessions, miss leans, hitter tags) lives in the existing record tables. Checked: `v12_sessions_test`
   and `scripts/test-sql.sh`.
2. **Every iPad updates the same day.** A v1.1 iPad opens a v1.2 database without errors and keeps the new fields when
   it saves a pitcher or hitter (checked). But it calls without the leans and tags, and its game events lack the new
   pitcher-hand / batter-side fields. Open the game app once on each device after the deploy and check the version.
3. **Tag `v1.2`** on the merged commit and push the tag.

## Rollback
- **Portal / game app:** redeploy the previous Vercel production deployment. A v1.1 app reads v1.2 data (checked), so a
  rollback loses only the new features, not data.
- **Database:** nothing to roll back.

## Known limits (in the build report)
- **The miss model** is one size both ways. The side-to-side width isn't fitted (one ratio can't match MLB's
  four-seam and sinker crossing rates), so how far a lean moves a call is approximate. Hit-batter pricing by location
  matches Single-A data (inside / overall 3.06 vs 3.05).
- **Read-through:** 94/98. P2, P3, P5 and P7 fail, as at v1.1.
- **Proposed rows:** L3 (the back-foot slider) can't be tested: the engine never calls that pitch. Spray was fitted but
  dropped (it pointed the wrong way); it's not a tag.
- **CI:** the build ran in a workspace that can't push to GitHub, so CI hasn't run on the branch. The full local suites
  are green (build report, last section).
