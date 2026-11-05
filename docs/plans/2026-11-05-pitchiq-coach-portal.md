# Plan 3a: the coach portal (minimal) and fast onboarding

Spec: `docs/specs/2026-11-05-pitchiq-platform.md` (Screens: Coach portal; A7; A8; D8). Build order step 4, before
billing (Plan 2). The player portal and super admin are Plan 3b.

**Goal.** A coach signs in on the website and runs his team: sees who's available today, preps the next game,
builds the roster in a minute (paste names, enter arsenals himself, grades default to 3), invites players and staff,
keeps opponent hitters, and sets the team's pitch-count rule and time zone. The iPad and the website are two views of
the same team data: anything done on one syncs to the other.

## Decisions

- **Same records as the iPad.** The portal reads the team's rows through row level security (as the signed-in coach)
  and writes only through `pc_push`, so every permission and conflict rule from Plan 1 applies unchanged. New
  records use the iPad's shapes (`PCDB.newPitcher`, `newHitter`); `web/lib/docs.test.ts` checks they match.
- **One rules module.** The pitch-count rules (`app/pitch_rules.js`) are copied into the web build by the same step
  that builds the game app, so the portal's eligible-on is the iPad's.
- **Screens on the design system.** Built in the real app on the Pitch Caller tokens (`web/app/globals.css`), and
  sent to Drew as screenshots for sign-off (instead of designing on a canvas first: Drew can say if he wants that).
- **Workload in one query.** A new function `pc_team_workload(team)` (security invoker, so row level security
  applies) returns each pitcher's game pitches per day for the last 30 days, which feeds availability and eligible-on.
  The same migration adds the five indexes the prod performance advisor asked for.
- **Demo team: with billing (Plan 2).** A team only syncs once it's switched on, and switching on is billing's job;
  the demo comes with it.

> **Status, Nov 5.** Tasks 1 to 8 are done on `pitchiq-platform`. Migration `20261107000000_portal.sql` (checks in
> `rls_matrix_test.js` section 16), the portal at `/app/t/[team]`, `web/lib/docs.test.ts` (the iPad's shapes),
> `web/tests/portal_e2e.js` (every screen, two teams, a viewer, the website and the iPad both ways) against a real
> local Supabase. Screenshots for Drew are written to `web/tests/screens/` by the test. The migration needs a PROMOTE.
> Still to come: the demo team (with billing, Plan 2), the dashboard's upload and learner cards (Plan 4).

## Tasks

1. **Migration** `20261107000000_portal.sql`: `pc_team_workload`, `pc_set_team` (name, time zone; manage_roster),
   the advisor's indexes. Checks in `rls_matrix_test.js`.
2. **Portal shell**: `/app` lists teams (as now) and opens `/app/t/[team]`, with a team switcher and the sections
   Home, Roster, Opponents, Staff, Settings, shown by permission.
3. **Home**: the next game (with "Prep game", which opens the game app), pitcher availability (last outing, last 7
   days, eligible on), recent games.
4. **Roster**: the pitchers; paste a list of names (A8) to add them; edit a pitcher's arsenal (grades 1-5, default 3);
   an invite link per pitcher (and the under-13 parent email).
5. **Staff**: coaches and pending invites; invite by preset; change a preset or its toggles; remove; approve a
   parent's email a player gave.
6. **Opponents**: their teams and hitters; type nine hitters with how they bat in under a minute (A8's target), one
   line each ("12 Smith R").
7. **Settings**: the team's name, time zone and pitch-count rule.
8. **Tests**: `web/tests/portal_e2e.js` against a real local Supabase: each screen's flow, a coach on two teams sees
   each team separately, a viewer gets no edit controls (and the server refuses him anyway), an edit on the website
   arrives on the iPad and the other way round.

## Done when

Every task's test passes locally and in CI, and Drew has the screenshots.
