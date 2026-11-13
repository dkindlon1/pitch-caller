# PitchIQ v1.1 release notes (six pitches, profiles, setups)

Branch `v1.1-work` → `main`. Build report: `docs/BUILD_v1.1_REPORT.md`. Plan: `docs/PLAN_v1.1_2026-11-12.md` (Step 6).

## What's new for coaches
- **Six pitch kinds:** four-seam, sinker, cutter, slider, curveball, changeup. Sinkers and cutters are no longer copies of
  the fastball. Signs 5 (sinker) and 6 (cutter) are card / wristband numbers; a pitch that was migrated keeps its old sign
  until you change its type.
- **Pitch profiles change the calls.** Each pitch has a shape (for example a riding or dead-zone four-seam, a run or drop
  sinker, a gyro / tight / sweeper / slurve slider, a 12-6 or sweeping curve, a fade / split / firm changeup), and the
  engine treats them differently. The numbers come from two seasons of MLB pitch tracking. Uploaded TrackMan / Rapsodo
  pitches get their shape from their measured movement.
- **Stuff grades are relative to the profile:** a 3 sweeper is an average sweeper.
- **Main fastball:** mark which fastball every pitch's speed and shape is measured against. If you don't, it's the one he
  throws most.
- **At-bat setups:** small credits for a payoff pitch after a real setup earlier in the same at-bat (for example climbing
  the ladder, or a slower pitch in the same lane), only when the setup pitch landed and wasn't squared up. They never give
  up value now to set up later.
- **The high riding fastball with two strikes** is treated as a strikeout pitch, without leaning on it.
- **Sinkers inside** to same-side hitters get credit for the softer contact they produce.
- **Fixed:** the in-game pitch mix could collapse onto one pitch over a long game (a v1.0 bug); saving a grade on the
  portal no longer wipes a shape accepted from uploads.

## Release order (each step needs Drew)
1. **Merge `v1.1-work` into `main`** (a fast-forward of `main @ ad12c46`). Vercel deploys the portal and the game app.
2. **Straight away, apply the database migration** `supabase/migrations/20261115000000_v11_kinds.sql`: Actions →
   "Promote migrations to prod" on `main` (the workflow runs only from `main`, so it can't go first), type PROMOTE,
   approve on the production environment. It widens `upload_pitches.kind` to six kinds, moves shape proposals to v1.1
   tags, and remaps pending proposals.
   - Until it's applied, the v1.1 portal's sinker / cutter upload rows are refused by the old database, so keep the gap
     to minutes.
3. **Every iPad updates the same day.** A v1.0 game app can't read a pitcher stored with a sinker or cutter (the v1.0
   engine refuses the kind). The game app picks up the update after the current game; open it once on each device and
   check the version.
4. **Tag `v1.1`** on the merged commit and push the tag (the remote also still lacks `v1.0`; push it from Drew's PC or tag
   `b318098`).

## Rollback
- **Portal / game app:** redeploy the previous Vercel production deployment (ad12c46). Devices that already migrated a
  pitcher to SI / FC can't be read by v1.0, so a rollback after iPads update needs those pitchers' types changed back, or
  a forward fix instead.
- **Database:** the migration is additive (wider check, remapped rows). Rolling it back means narrowing the kind check
  after remapping SI / FC rows to FB, and restoring v1.0's `pc_proposals_set`. Prefer a forward fix.

## Known limits (in the build report)
- At college levels the engine still rarely throws any fastball inside (3–6% for sinkers): the price of hit batters at
  amateur levels. MLB-level calls do go inside (sinker 23%, four-seam 19%). A v1.2 question, with miss direction.
- Five proposed profile read-through rows fail narrowly or by design (P1 sinker inside, P2, P3, P5, P7); 53 of the 71 v1.0
  rows moved and are listed for regrading.
- At half size, the S2, S4 and S5 setups no longer move their own test rows.
- High school: the riding fastball up reaches 44% of two-strike calls in one power-arsenal spot (college at most 35%).
- `site_e2e`'s scroll-driven at-bat scene check fails intermittently in CI; it predates v1.1.
