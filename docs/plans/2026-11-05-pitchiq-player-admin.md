# Plan 3b: the player portal and the super admin

Spec: `docs/specs/2026-11-05-pitchiq-platform.md` ("Account and permission model": players, super admin, grade
edits; Screens: Player portal, Super admin; D9, D13). Build order step 6, after billing (Plan 2). Uploads, proposals
and full stats are Plan 4.

**Goal.** A player signs in and sees only himself: when he can pitch next, his outings, his arsenal and grades (which
he can change, with history), his profile, and what the engine has learned about him. A coach sees a player's grade
changes marked "changed by player" and puts one back in one tap. Drew, as super admin, sees organizations, teams,
head counts, billing state and sign-ups, can hand an organization to one of its coaches, and every page and action is
in an audit log. He never sees pitch data.

## Decisions

- **The player portal is its own place** (`/app/me/[team]/[pitcher]`). The coach portal sends a player there. A parent
  with two children on a team picks which child at the top.
- **A player reads nothing from the team's tables.** His pitcher record comes through `pc_pull` (without the coaches'
  notes, as on the iPad). His outings come through `pc_my_outings`: per game, his pitches, strikes and pitch mix, the
  last 365 days, with no opponent, hitters or calls. What the engine learned comes through `pc_my_learned`: per pitch,
  entered and fitted values and how many pitches they rest on, without the evidence.
- **Grade history is a trigger on `pitchers`**, so every path is logged: the website, the iPad's sync and a coach's
  revert. It records who, their role, the old and new value, and when. A system change (a minor's record stripped, a
  purge, a database fix) is not an edit. A child's history goes when his data does (deleted by a parent, or held while
  no parent has consented).
- **Reverting** (`pc_revert_grade`) needs `edit_grades` or the roster toggle, and only puts a value back if nobody has
  changed it since.
- **Super admin** is a row in `platform_admins`, added by hand in the database (never through the API). Each
  `pc_admin_` function checks the caller, writes an `admin_audit` row and returns organizations, teams, counts,
  staff emails and billing events. None of them touches a pitch, game, event or player record, and an admin who is on
  no team can't read those tables either. The one support action is transferring ownership, with a required reason,
  under the owner's own rule (the new owner coaches one of its teams). There's no impersonation.
- **Not an admin: a 404**, the same page as any unknown address.

> **Status, Nov 5.** Done on `pitchiq-platform`: migration `20261109000000_players_admin.sql` (checks in
> `rls_matrix_test.js` sections 18 and 19), the player portal, grade history and revert on the coach's pitcher page,
> `/admin`, and `web/tests/player_admin_e2e.js` against a real local Supabase. The migration needs a PROMOTE.

## Making Drew the super admin (once, in production)

After the migration is promoted and Drew has an account on the site, he runs this in the Supabase SQL editor, with
his own sign-in email:

```sql
insert into public.platform_admins (user_id, note)
select id, 'Drew' from auth.users where email = '<your sign-in email>' and email_confirmed_at is not null;
```

Then `/admin` opens for him. Recommended before launch: turn on multi-factor sign-in for that account.

## Tasks

1. **Migration**: `grade_history` (+ trigger, read policy), `pc_revert_grade`, `pc_my_outings`, `pc_my_learned`,
   `platform_admins`, `admin_audit`, `pc_is_admin`, `pc_admin_orgs`, `pc_admin_org`, `pc_admin_audit`,
   `pc_admin_transfer_owner`.
2. **Player portal**: Home (can pitch, last outing, strikes, outings), Arsenal (edit, history), Profile (name, number,
   throws, grad year, height, arm slot), What the engine learned.
3. **Coach side**: grade changes on the pitcher page, "changed by player", put back.
4. **Super admin**: Organizations (search, sign-ups), one organization (teams, staff, billing events, transfer),
   Audit log.
5. **Tests**: rls_matrix sections 18 and 19; `web/tests/player_admin_e2e.js` (in CI).

## Not in this plan

- Uploads, proposals and the stats module (Plan 4).
- An iPad view of a player's changes (the coach portal has it; the game app could show the badge later).
