# PitchIQ Foundation Implementation Plan (Plan 1 of 6)

> **For agentic workers:** Execute with the subagent-driven-development skill (recommended) or inline in one session; implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace program-wide roles with organizations → teams → per-team members and permissions, enforced by row-level security (RLS) and team-scoped sync, plus a signed-in Next.js shell that lists a user's teams.

**Architecture:**
- One forward migration on top of `20261103000000_pitch_caller.sql`. All 13 public tables had 0 rows on Nov 5, so the old program-scoped objects are replaced outright.
- Every access decision goes through four helpers: `pc_team_active`, `pc_can`, `pc_my_pitchers` and `pc_check_row`.
- The existing jsonb doc tables keep their shape and gain a generated `team_id`.
- A new `web/` Next.js app reads data only through Supabase, using the publishable key.

**Tech Stack:**
- Postgres 17 (local, for tests; matches Supabase, which runs 17) and the Supabase dev project `fpoiqnswdmyprbyhgukq`.
- Node with `pg` for SQL tests, the same pattern as `supabase/test/sync_test.js`.
- Next.js App Router with TypeScript and `@supabase/ssr`.
- Playwright.

**Spec:** `docs/specs/2026-11-05-pitchiq-platform.md` (approved). This plan covers D1, D2, D3 and D4. It depends on amendments A1 and A2 in the spec, which are proposed and need Drew's approval.

> **Status, Nov 5 (end of day).** Built per spec amendment A11 (a team is the `programs` row; doc tables stay scoped
> by `program_id`; `members` holds presets and toggles; `player_links` holds a player's pitcher records), not the
> `team_members` / `doc->>'teamId'` design in Tasks 2 to 6 below, because `teamId` on a hitter already names the
> opponent team. On the `pitchiq-platform` branch:
> - Tasks 0-7: migration `20261106000000_pitchiq_teams.sql`; `rls_matrix_test.js` (149 checks); the ported sync,
>   review and client tests; `app/sync.js` 2.1.0 (team transport, shared-iPad hand-over, locked state, purge); the
>   iPad's sync panel (start a team, invite codes, presets with an Advanced toggle view, approving parent emails).
> - An independent review found 3 high, 5 medium and 7 low issues (a spare player link could pose as a parent and
>   delete the player's data; deleted data came back with the next sync; an unconsented child's data still went in).
>   All are fixed and each has a check in `rls_matrix_test.js` sections 12-13. A second review of the fixes is
>   running. Additions this caused: one open invite per pitcher; a parent's email typed by a player waits for a
>   coach's approval (`pc_approve_invite`); the `purged` table and the iPad purge.
> - Task 9: `web/` sign-in, `/app` and `/join/[token]`, asking the age question before any account
>   (`pc_invite_to_parent`). Tested against a real local Supabase (`supabase start`, `web/tests/shell_e2e.js`, CI job
>   `web-shell`) rather than the stand-in.
> - Task 8 (apply to the dev project) is replaced by the promote workflow to prod, which needs Drew to type PROMOTE.

## Roadmap (build order per spec A9/A10)

| Order | Plan | Covers |
| --- | --- | --- |
| 1 | 0 Operate: prod project, CI, migration promotion, Sentry, Storage export, landing page + email capture | A9, part of A10 |
| 2 | 1 Foundation (this) | D1–D4, A3, A4 (database part), A6 (client part) |
| 3 | 5 Offline game under `/app/game`, plus A7 game-day pieces. S8 (a real iPad) goes first. | D12, A7 |
| 4 | 3a Minimal coach portal + A8 onboarding | D8 (core), A8 |
| 5 | 2 Billing, lockout, exports, retention purge | D5–D7, A5, A4 (exports) |
| 6 | 3b Player portal, owner screens, super admin | D9, D13, rest of D8 |
| 7 | 4 Uploads and stats | D10, D11 |
| 8 | 6 Full 3D site, demo, legal pages | D14, D15, rest of A10 |

Under A2, each later plan adds its own tables in its own migration, and those tables follow the same RLS rules.

## Global Constraints

**Access**
- The publishable key is public, so RLS is the only protection. **Every table in `public` has RLS enabled.**
- Tables that only the server reads, such as `pc_table_rules`, also have every privilege revoked from `anon` and `authenticated`.
- Coaches see only their own team. Players see only themselves. No one sees another team.
- The owner is **not** a team member unless added. The owner's extra powers apply **only** inside membership functions, never to data reads or writes. Ownership is transferable.
- Coach presets and toggles match the spec table exactly. A head coach can add coaches (`manage_staff`).

**Functions and keys**
- Every `security definer` function sets `search_path = ''` and schema-qualifies every name.
- Internal helpers (`pc_can_read`, `pc_can_write`, `pc_check_row`, `pc_preset_perms`, `pc_team_active`, `pc_can`, `pc_my_pitchers`, `pc_owner_can_manage`) live in a `private` schema that the Supabase API doesn't expose, so they can't be called through `/rest/v1/rpc`. `authenticated` keeps `usage` on `private` and `execute` on the helpers, because RLS policies run as the signed-in user and need to call them. Only the intended RPC entry points stay in `public`. Found by the Supabase security advisor on prod (Nov 5): 16 security-definer functions in `public`, including the permission helpers, were callable by signed-in users. Test: `rls_on_every_table` also asserts that no function named in this list exists in `public`, and Task 8 re-runs the advisor and expects no `authenticated_security_definer_function_executable` finding for a helper.
- The service-role key lives only in gitignored `.env` files and Edge Function secrets.
- Only the service role sets `billing_status` and team activation; Plan 2 drives both from Stripe.

**Data**
- No deletes on data tables. Use soft deletes: `deletedAt` in the doc, or `removed_at` on membership rows.
- Under-13 players must be linked to a parent's account. Until consent is recorded, an under-13 roster spot is a placeholder holding only `id, teamId, updatedAt, deletedAt` plus jersey number.

**Server trust (A3)**
- The server clamps any `updatedAt` later than `now() + 2 minutes` down to `now()`. It also stores its own `server_updated_at`.
- Player writes to `pitchers` merge only `PLAYER_KEYS` into the existing doc. All other keys keep their server values.

**Minors (A4)**
- Only `pc_delete_minor` may hard-delete, and it logs every deletion to `deletion_log`. The log stores no personal fields.

**Shared iPads (A6)**
- Outbox rows carry `userId` and only sync for that user.
- When a different user signs in, the local store is cleared.

**Time**
- `teams.timezone` (an IANA name) is the source for every date and rest-day calculation.

**Environments**
- The dev project `fpoiqnswdmyprbyhgukq` is dev only. Prod and CI come from Plan 0.
- Playwright runs against local `supabase start`. It never runs against the shared dev project.

**Process**
- Commit messages end with the session attribution lines.

## Review Focus

Each item names the risk, the expected behavior, and the test that pins it.

1. **Row overwrite across teams or pitchers.**
   - Risk: a push carries the `id` of an existing row from another team, or another pitcher's row.
   - Expected: rejected; the existing row is unchanged and stays where it was.
   - Test: Task 4, `push_overwrite_rejected`.
2. **A table left without RLS, or one the client can reach directly.**
   - Expected: the build fails.
   - Test: Task 2, `rls_on_every_table`.
3. **Under-13 link forwarded to the child.**
   - Risk: the child creates their own account and joins.
   - Expected: denied. Only the parent's email can consent and accept.
   - Test: Task 5, `under13_consent_bypass_denied`.
4. **Queued offline events.**
   - Risk: a team locks or a member is removed while their iPad still holds unsent game events.
   - Expected: the server returns `team_locked` or `not_allowed`. The client keeps the rows and retries them on each sync, so after an unlock they go through.
   - Test: Task 7, `blocked_rows_retry_after_unlock`.
5. **Member-management escalation.**
   - Risk: a coach tries to escalate, manage another team, or claim a pitcher who is already linked.
   - Expected: denied.
   - Test: Task 5, `set_member_escalation_denied` and `pitcher_claim_rules`.
6. **Far-future timestamps.**
   - Risk: a player or coach pushes `updatedAt` set to 2099 to win every future conflict.
   - Expected: clamped to now. A later coach edit still wins.
   - Test: Task 4, `future_updatedAt_clamped`.
7. **Shared dugout iPad.**
   - Risk: coach B signs in on coach A's iPad.
   - Expected: coach B sees none of A's cached data, and A's queued rows are never pushed as B.
   - Test: Task 7, `shared_ipad_user_switch`.

---

### Task 0: Baseline, read-through, grants

**Files:**
- Read: `supabase/migrations/20261103000000_pitch_caller.sql`, `app/sync.js`, `app/roster.js` (sync section), `supabase/test/*`
- Modify: `supabase/test/auth_stub.sql`

- [ ] **Step 1:** Start local Postgres 17 (Supabase runs 17; the existing tests were written against a local 16, so note any difference). Run `sync_test.js`, `review_test.js` and `app_sync_e2e.js`.
  - Expected: all pass.
  - Record the pass counts in `docs/plans/2026-11-05-pitchiq-foundation.status.md`.
  - If any test fails, stop and use systematic-debugging.
- [ ] **Step 2:** Record in the status file:
  - the as-user helper that sets `auth.uid()`
  - how `pc_push` reports rejections, and whether it returns server rows on a conflict
  - the IndexedDB stores and the program field in `sync.js`
  - every caller of `pc_role`, `pc_staff` and `pc_my_programs`
- [ ] **Step 2b:** Record the actual key names in a `pitchers` doc. From them, write `PLAYER_KEYS`: profile fields (name, number, hand, slot, height, weight, grad year, school) plus the arsenal array. Every other key is coach-only.
- [ ] **Step 3:** Make `auth_stub.sql` match Supabase.
  - Create roles `anon`, `authenticated` and `service_role` if they are missing.
  - Grant them `usage` on `public`.
  - `alter default privileges in schema public grant all on tables to anon, authenticated, service_role`.
  - `create extension if not exists pgcrypto with schema extensions`.

  Re-run the Step 1 tests. Expected: still pass.
- [ ] **Step 4:** Commit `test: stub mirrors Supabase default grants`.

---

### Task 1: Spike S1, the cost of team-scoped RLS

**Files:**
- Create: `supabase/spike/s1_rls_cost.sql` (throwaway)
- Record the result in the status file

- [ ] **Step 1:** Load 200,000 `events` rows across 20 teams, using a prototype `pc_can_read` with Task 3's logic as a `stable security definer` function.
- [ ] **Step 2:** As a coach and as a player, run `explain analyze` on `pc_pull`'s query for one team, page size 500.

**Decision rule:**
- Under 50 ms per page: keep the per-row function.
- Over 50 ms: switch the policies to `team_id in (select pc_my_team_ids())`, an `initplan`, plus a check on player pitchers. Record the switch as a plan note before Task 3.

---

### Task 2: Organizations, teams, members

**Files:**
- Create: `supabase/migrations/20261106000000_pitchiq_teams.sql`
- Create: `supabase/test/rls_matrix_test.js`

**Interfaces — tables**

```
organizations(
  id uuid pk, name text, level text,
  owner_id uuid not null,
  billing_status text not null default 'pending'
    check in ('pending','active','locked'),
  stripe_customer_id text, stripe_subscription_id text,
  created_at
)  -- renames programs

teams(
  id uuid pk, org_id uuid fk, name text, level text, season text,
  timezone text not null default 'America/New_York',
  status text not null default 'pending'
    check in ('pending','active','ending','removed'),
  ends_at timestamptz, created_at
)
-- A5: removal changes only teams.status; a lapse changes only
-- organizations.billing_status. An unlock never revives a 'removed' team.

-- organizations also gets: billing_changed_at timestamptz
-- (the last applied Stripe event time, used by Plan 2 to ignore stale events)

team_members(
  id uuid pk default gen_random_uuid(),
  team_id uuid fk, user_id uuid fk auth.users,
  kind text check in ('coach','player'),
  preset text null check in ('head','pitching','caller','viewer'),
  perms jsonb not null default '{}',
  pitcher_id text null,
  removed_at timestamptz, added_at,
  check ((kind = 'coach') = (pitcher_id is null)),
  check ((kind = 'coach') = (preset is not null))
)
-- unique (team_id, user_id) where kind = 'coach' and removed_at is null
-- unique (team_id, pitcher_id) where kind = 'player' and removed_at is null
-- Amendment A1: one account may hold several player links on a team

minors(
  team_id uuid, pitcher_id text, flagged_by uuid, flagged_at,
  pk (team_id, pitcher_id)
)

guardian_consents(
  team_id uuid, pitcher_id text, guardian_user_id uuid,
  method text, consented_at,
  pk (team_id, pitcher_id)
)
```

**Interfaces — functions**

```
pc_preset_perms(preset text) returns jsonb
pc_team_active(team uuid) returns boolean
pc_can(team uuid, perm text) returns boolean         -- members only, never the owner shortcut
pc_my_pitchers(team uuid) returns setof text
pc_is_owner(org uuid) returns boolean
pc_owner_can_manage(team uuid) returns boolean       -- used only by Task 5 functions
pc_create_org(name text, level text) returns uuid
pc_create_team(org uuid, name text, level text, season text) returns uuid   -- creates status 'pending'
pc_my_teams() returns table(
  team_id uuid, team_name text, org_id uuid, org_name text,
  kind text, preset text, pitcher_ids text[], is_owner boolean, active boolean
)
```

Drops: `members`, `pc_role`, `pc_staff`, `pc_my_programs`, `pc_set_role`, `pc_my_pitcher`.

**Fixed values**

| Preset | Toggles |
| --- | --- |
| `head` | all seven |
| `pitching` | `view_team, call_games, edit_grades, review_uploads, manage_opponents` |
| `caller` | `view_team, call_games, manage_opponents` |
| `viewer` | `view_team` |

- `perms` overrides the preset key by key. Keys other than the seven toggles are rejected.
- `pc_team_active` means all three of: `teams.status in ('active','ending')`, `(ends_at is null or ends_at > now())`, and `organizations.billing_status = 'active'`.
- `pc_can` is true only when the team is active, the caller is a non-removed coach member, and the effective toggle is on.

**Steps**

- [ ] **Step 1:** Write failing tests using fixture `seed()`. It builds 2 orgs and 3 teams, activated as superuser, with an owner, the four coach presets, two players, a parent linked to two siblings, a non-member and anon.
  - `presets_match_spec`: `pc_preset_perms('caller')` deep-equals `{"view_team":true,"call_games":true,"manage_opponents":true}`.
  - `owner_not_member_denied`: the owner calls `pc_can(teamA, perm)` and gets false for every toggle.
  - `toggle_override`: the viewer with `perms={"call_games":true}` gets `pc_can(teamA,'call_games')` = true.
  - `inactive_states_deny`:
    - Each of these makes `pc_can` false for the head coach on every toggle: team `pending`; team `removed`; team `ending` with `ends_at` in the past; org `pending`; org `locked`.
    - Unlocking the org (`billing_status` back to `active`) leaves a `removed` team inactive.
    - A team that is `ending` with a future `ends_at` still allows.
  - `create_team_is_pending`: `pc_create_team` returns a team with `status='pending'`. An `update teams set status='active'` as `authenticated` changes 0 rows; re-read and confirm it is still `pending`.
  - `my_teams_scoped`:
    - A coach on teams A and C gets exactly 2 rows.
    - The parent gets 1 row with `pitcher_ids` of length 2.
    - The non-member gets 0.
  - `rls_on_every_table`: every table in `pg_class` for schema `public` with `relkind='r'` has `relrowsecurity = true`. Write this test now; it also covers later tasks. The privilege check on `pc_table_rules` is added in Task 3, where that table is created.
- [ ] **Step 2:** Run `node supabase/test/rls_matrix_test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - Enable RLS on all five tables.
  - `organizations`: readable by its owner and by active members of its teams.
  - `team_members`: own rows readable, and rows of the caller's team readable with `view_team`.
  - `minors` and `guardian_consents`: readable by the owner and by `manage_roster` coaches.
  - All writes on these five tables go through functions; no write policies.
- [ ] **Step 4:** Run. Expected: Task 2 checks pass. `sync_test.js` now fails until Task 6; note that in the status file.
- [ ] **Step 5:** Commit `feat(db): organizations, teams, per-team members, permission helpers`.

---

### Task 3: Team-scoped read policies on the doc tables

**Files:** Append to the migration. Tests go in `rls_matrix_test.js`.

**Interfaces**

Consumes `pc_can`, `pc_my_pitchers` and `pc_team_active`.

Produces:
- Every `program_id` column is renamed to `org_id`.
- A generated column `team_id uuid` on every doc table. It casts `doc->>'teamId'` only when it matches the uuid pattern, otherwise null.
- A new `opponents` doc table with the same column pattern.
- The table `pc_table_rules(tbl text pk, read_perm text, insert_perm text, write_perm text, player_read text, player_write boolean)`, with RLS enabled, no policies, and every privilege revoked from `anon` and `authenticated`.
- `pc_can_read(tbl text, team uuid, row_id text, row_pitcher text) returns boolean`.
- `pc_can_write(tbl text, team uuid, row_id text, row_pitcher text, is_insert boolean, touches_deleted boolean) returns boolean`.
- For `pitchers`, the row's pitcher is `row_id`.

**Fixed values (`pc_table_rules`)**

| tbl | insert_perm | write_perm | player_read | player_write |
| --- | --- | --- | --- | --- |
| pitchers | manage_roster | edit_grades | own | true (update only, never `deletedAt`) |
| catchers | manage_roster | manage_roster | none | false |
| hitters | manage_opponents | manage_opponents | none | false |
| opponents | manage_opponents | manage_opponents | none | false |
| games | call_games | call_games | none | false |
| events | call_games | call_games | none | false |
| checkins | call_games | call_games | own | true |
| sessions | call_games | call_games | own | true |
| readings | call_games | call_games | own | true |
| packs | call_games | call_games | none | false |
| learned | call_games | call_games | none | false |

- `read_perm` is `view_team` for every row.
- A change to `deletedAt` on `pitchers` requires `manage_roster`.
- `own` means `pitcher ∈ pc_my_pitchers(team)`.
- Players get their own game events and learned values only through redacted functions in Plan 3, because the raw docs carry hitters, calls and game plans.
- Under-13 placeholder rule: a `pitchers` row in `minors` with no `guardian_consents` row is readable only by coaches.

**Steps**

- [ ] **Step 1:** Write failing tests.
  - `matrix_select`: for each user, table and seeded row, the visible count equals the expected count in a fixture table inside the test. Users: four presets, two players, parent, owner, non-member, other-team coach and anon. Tables: the 11 doc tables plus `opponents`, `organizations`, `teams`, `team_members`, `minors` and `guardian_consents`.
  - `matrix_direct_writes`: for each user and table, try a direct `insert`, a direct `update ... set doc = doc || '{"x":1}'` and an attempted `delete`. Expected: each raises an error or affects 0 rows, and a re-read shows the row unchanged.
  - `locked_team_hidden`: after locking team A's org, every user sees 0 rows of team A.
  - `rls_on_every_table`: passes with the new tables included. Also checks that `has_table_privilege('anon','public.pc_table_rules','select')` and the same check for `authenticated` are both false.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Add one `for select` policy per table calling `pc_can_read('<table name as a literal>', team_id, id, pitcher_id)`. Drop the old policies. Add no insert, update or delete policies; all writes go through `pc_push`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): team- and permission-scoped reads on all data tables`.

---

### Task 4: Write checks, including the row being overwritten

**Files:** Append to the migration. Tests go in `rls_matrix_test.js`.

**Interfaces**

Produces `pc_check_row(team uuid, tbl text, row jsonb, existing jsonb) returns text`, which returns null or one of `'team_locked' | 'bad_team' | 'team_mismatch' | 'id_mismatch' | 'not_allowed'`.

`pc_push` (Task 6) locks the existing row with `select … for update` on `(org_id, id)` and passes its `doc`, or null if there is none.

**Fixed rules, in this order**

1. If `pc_team_active(team)` is false, return `team_locked`.
2. If `doc->>'teamId'` is not a uuid, return `bad_team`. If it is not equal to `team`, return `team_mismatch`.
3. If `doc->>'id'` is present and differs from the row id, return `id_mismatch`.
4. If `existing` is not null and `existing->>'teamId'` is not equal to `team`, return `team_mismatch`.
5. Call `pc_can_write` for the new pitcher. If `existing` is not null and its pitcher differs, `pc_can_write` must also pass for the existing pitcher. Otherwise return `not_allowed`.
6. Placeholder rule: a `pitchers` row for an unconsented minor may only carry `id, teamId, updatedAt, deletedAt, jersey`. Otherwise return `not_allowed`.

**Normalization by `pc_push` before a row is written:**
- Clamp `doc.updatedAt` to `now()` (epoch milliseconds) if it is later than `now() + 120000`.
- When the writer is a player (no coach toggle grants the write), build the doc that will be stored as `existing.doc` overlaid with only the `PLAYER_KEYS` from the incoming doc.

**Steps**

- [ ] **Step 1:** Write failing tests.
  - `push_spoofed_ids_rejected`:
    - P1 sends a session with `pitcherId=P2`: `not_allowed`.
    - `teamId` = team C while pushing to team A: `team_mismatch`.
    - `teamId='abc'`: `bad_team`, and the other rows in the same batch still apply.
  - `push_overwrite_rejected`:
    - A coach on team C pushes the id of an existing team A row with `teamId=C`: `team_mismatch`. The team A row is unchanged and still in team A.
    - P1 pushes P2's session id with `pitcherId=P1`: `not_allowed`. P2's row is unchanged.
  - `roster_vs_grades`:
    - The pitching coach inserts a new pitcher: `not_allowed`. The pitching coach edits a grade on an existing pitcher: OK.
    - A player sets `deletedAt` on their own pitcher row: `not_allowed`.
    - The head coach inserts a pitcher and soft-deletes one: OK.
  - `minor_placeholder`: before consent, a pitcher row in `minors` that carries a `name` gets `not_allowed`, and one with only the placeholder keys is OK. After consent, `name` is OK.
  - `owner_nonmember_push`: the owner pushes to every table and gets `not_allowed`.
  - `future_updatedAt_clamped`:
    1. A player pushes their own pitcher row with `updatedAt = 4102444800000` (year 2100). The stored value is ≤ now + 2 minutes.
    2. A coach edit made 1 second later wins.
  - `player_nongrade_write_denied`: a player pushes their own pitcher row that changes a coach-only key (from Task 0 Step 2b) and a grade. The grade is stored and the coach-only key is unchanged.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `pc_check_row` and the extended `pc_can_write`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): write checks against the incoming and the existing row`.

---

### Task 5: Invites, members, ownership, guardian consent

**Files:** Append to the migration. Tests go in `rls_matrix_test.js`.

**Interfaces — table**

```
invites(
  token text pk default encode(extensions.gen_random_bytes(24),'hex'),
  team_id uuid, kind text, preset text, pitcher_id text,
  email text null, under13 boolean not null default false,
  created_by uuid, created_at, used_at timestamptz, cancelled_at timestamptz,
  check (not under13 or email is not null)
)  -- RLS on, readable by the invite's creator and by coaches with
   -- manage_roster (player invites) or manage_staff (coach invites)
```

**Interfaces — functions**

```
pc_invite(team uuid, kind text, preset text, pitcher_id text,
          email text default null, under13 boolean default false) returns text
pc_cancel_invite(token text)
pc_invite_info(token text) returns table(team_name text, kind text, under13 boolean, needs_consent boolean)
    -- safe preview for the join page
pc_record_guardian_consent(token text, method text)
pc_accept_invite(token text, declares_under13 boolean, parent_email text default null)
    returns jsonb  -- {status: 'joined', team_id} | {status: 'parent_invite_sent'} | {status: 'parent_email_required'}
pc_delete_minor(team uuid, pitcher_id text)   -- hard delete, A4
deletion_log(id, team_id, pitcher_hash text, requested_by uuid, deleted_at)  -- no names
pc_set_member(member_row uuid, preset text, perms jsonb)
pc_remove_member(member_row uuid)
pc_transfer_owner(org uuid, new_owner uuid)
```

**Fixed rules**

*Who may invite*
- A coach invite needs `pc_can(team,'manage_staff')` or `pc_owner_can_manage(team)`.
- A player invite needs `pc_can(team,'manage_roster')` or `pc_owner_can_manage(team)`.

*Player invites*
- The `pitcher_id` must exist in that team and must not be linked to an active player row.

*Token validity, for both consent and accept*
- The token is unused, not cancelled, and less than 14 days old.
- If `email` is set, it equals the caller's confirmed email.

*Under-13*
- `under13` on the invite inserts a `minors` row.
- If the person accepting sets `declares_under13`, a `minors` row is also inserted.
- Accept fails for a pitcher in `minors` unless `guardian_consents` has a row by this same user.
- Consent can only be recorded by the account whose confirmed email matches the invite's.
- On an invite with no email, a caller who declares under 13 is never linked. The call returns `parent_email_required`. When it is called again with `parent_email`, it creates a new `under13` invite to that email, returns `parent_invite_sent`, and the original token is marked used.
- Inserting a `minors` row strips that pitcher's doc to the placeholder keys, unless consent already exists.
- `pc_delete_minor`:
  - Callable by the consenting guardian or the service role.
  - Hard-deletes every row for that pitcher across the doc tables, `team_members` links, `minors`, `guardian_consents` and `invites`.
  - Writes one `deletion_log` row containing a sha256 of the pitcher id.

*Member changes*
- `pc_set_member` applies to coach rows only. It accepts the four presets and the seven toggle keys.
- `pc_set_member` and `pc_remove_member` on a coach require `manage_staff` on that team, or the owner. On a player they require `manage_roster`, or the owner. A player may remove their own link.
- No one can edit a member of another team.

*Ownership*
- `pc_transfer_owner` requires the current owner, and the new owner must be an active coach member somewhere in the org.

**Steps**

- [ ] **Step 1:** Write failing tests.
  - `invite_token_misuse_denied`: each of these is denied — second use, use after cancel, wrong email, use after 14 days (backdate `created_at`), and a coach invite from a caller-preset coach.
  - `under13_consent_bypass_denied`:
    - The child's own account (different email) cannot consent or accept.
    - An invite created without `under13`, where the accepter declares under 13, is blocked until consent exists.
    - The parent's account consents, then accepts: OK. After that, `name` is writable (Task 4 rule).
    - `pc_invite(..., under13 => true, email => null)` raises.
    - No-email invite path:
      1. A child's account uses a no-email link and declares under 13: `parent_email_required`, and there is no `team_members` row.
      2. The child calls again with a parent email: `parent_invite_sent`, a new under-13 invite exists for that email, and the old token is rejected.
  - `minor_flag_strips_profile`: a pitcher with a `name` is flagged under 13 before consent. The stored doc now holds only the placeholder keys.
  - `minor_hard_delete`:
    1. The guardian calls `pc_delete_minor`. Every table has 0 rows for that pitcher, and `deletion_log` has 1 row with no name.
    2. A coach calling it gets an error.
  - `pitcher_claim_rules`:
    - An invite for a pitcher id not in the team is denied.
    - A second active link to the same pitcher is denied.
    - The parent links two sibling pitchers on one team: OK. `pc_my_pitchers` returns both.
  - `set_member_escalation_denied`:
    - Setting the toggle `is_owner` raises.
    - Setting a preset on a player row raises.
    - The head coach edits a team C member and gets an error.
    - The pitching coach removes a coach and gets an error.
    - The head coach adds a coach with `manage_staff`: OK.
    - A player removes their own link: OK.
  - `transfer_owner`:
    - The new owner's `pc_is_owner` is true and the old owner's is false.
    - A transfer to a non-member raises.
    - A transfer attempted by a non-owner raises.
  - `removed_member_denied`: after removal, the user's `pc_can` and selects return nothing.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): invites, member changes, ownership transfer, guardian consent`.

---

### Task 6: Team-scoped `pc_push` / `pc_pull`

**Files:**
- Modify: the migration, replacing both functions
- Port: `supabase/test/sync_test.js` and `review_test.js`

**Interfaces**

Consumes `pc_check_row` (Task 4) and `pc_can_read` (Task 3).

Produces:
- `pc_push(team uuid, tbl text, rows jsonb) returns jsonb`
  - It keeps today's contract: newer `updatedAt` wins, rejected rows come back as `{id, reason}`, and the rest still apply.
  - It sets `org_id` from the team.
  - It never returns a server doc the caller can't read.
- `pc_pull(team uuid, tbl text, after_xid bigint, after_id text, lim int)` keeps the same cursor semantics.

**Steps**

- [ ] **Step 1:** Port every existing check, keeping its assertions. Add:
  - `pull_two_teams_isolated`: a coach on A and C pulls both. No ids cross, and team A's cursor is unaffected by writes to C.
  - `push_locked_team`: every row comes back `team_locked`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Replace both functions, keeping the xid-snapshot cursor logic.
- [ ] **Step 4:** Run all SQL tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(db): team-scoped push and pull`.

---

### Task 7: Client sync on teams

**Files:**
- Modify: `app/sync.js` and `app/roster.js` (sync section)
- Modify: `app/build.py`, only if the bundle list changes
- Test: `supabase/test/app_sync_e2e.js`

**Interfaces**

Produces:
- `PCSync.setTeam(teamId)`
- `PCSync.myTeams()`, which returns `pc_my_teams` rows
- `PCSync.joinByToken(token, declaresUnder13)`
- `PCSync.status()`, which returns `{pending, blocked: {team_locked, not_allowed}}`

Behavior:
- Every record written carries `teamId`.
- Cursors are stored per team, as `cursor:<teamId>:<tbl>`.
- Rows rejected with `team_locked` or `not_allowed` stay in the outbox, marked with their reason, and are retried on every sync.
- Every outbox row carries `userId`. Only rows whose `userId` matches the signed-in user are pushed.
- When a different user signs in, the local data stores and cursors are cleared. Another user's unsent rows stay, labeled with that user, until they sign in again.
- A pull that returns `not_allowed` for a team drops that team's cached rows.
- On startup the app calls `navigator.storage.persist()`. It syncs on `online`, and on `visibilitychange` when the app returns to the foreground.
- `bad_team`, `team_mismatch` and `id_mismatch` are client bugs: logged and kept, never retried.

**Steps**

- [ ] **Step 1:** Write failing checks.
  - `two_team_switch`: write on A, switch to C, pull. Team C's IndexedDB has none of team A's rows.
  - `removed_member_queue_kept`: queue 5 events, then remove the member. All 5 stay in the outbox, and `status().blocked.not_allowed === 5`.
  - `blocked_rows_retry_after_unlock`:
    1. Queue 5 events while the team is locked; `blocked.team_locked === 5`.
    2. Unlock as superuser and sync.
    3. All 5 are in `events` and the outbox is empty.
  - `shared_ipad_user_switch`:
    1. Coach A caches team A and queues 3 events while offline.
    2. Coach B signs in. B's IndexedDB holds no team A rows, and a sync pushes 0 rows.
    3. Coach A signs back in. A's 3 events sync.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Change `sync.js` and the roster sync panel. Replace "join program" with "join by link". Remove the dropped-function callers from the Task 0 list.
- [ ] **Step 4:** Run, in order: `app_sync_e2e.js`, `python app/build.py`, `smoke.js`, `parity.js`. Expected: all pass, and engine parity is unchanged.
- [ ] **Step 5:** Commit `feat(app): per-team sync, join by link, keep and retry blocked rows`.

---

### Task 8: Apply to the dev project and audit

- [ ] **Step 1:** Re-check that all public tables have 0 rows on `fpoiqnswdmyprbyhgukq`. If any has rows, stop and ask Drew.
- [ ] **Step 2:** Apply the migration.
- [ ] **Step 3:** Run the Supabase security advisors.
  - Expected: no RLS-disabled tables and no mutable-`search_path` warnings.
  - Also run the `rls_on_every_table` query against the project.
  - Paste both outputs into the status file.
  - Drew confirms in the Supabase dashboard that Auth "Confirm email" is on, and the status file records that. The consent rules depend on it.
- [ ] **Step 4:** Commit the status file.

---

### Task 9: Next.js shell with sign-in and team list

**Files**

Create `web/` (Next.js App Router, TypeScript strict), including:
- `web/lib/supabase/{browser.ts,server.ts}`
- `web/proxy.ts` (Next.js 16 renamed `middleware.ts` to `proxy.ts`; if the pinned version is older, use `middleware.ts`)
- `web/app/(marketing)/page.tsx` (placeholder)
- `web/app/login/page.tsx`
- `web/app/app/page.tsx`
- `web/app/join/[token]/page.tsx`
- `web/tests/{setup.ts,shell.spec.ts}`
- `web/.env.example`, listing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

`.env.local` and `.env.test.local` are gitignored.

**Interfaces**

Produces `getServerSupabase()`, `getBrowserSupabase()` and these routes:
- `/app` requires a session; without one it redirects to `/login?next=/app`. It shows one card per `pc_my_teams()` row, marking inactive teams as "Not active", plus an "Organizations you own" list.
- `/join/[token]` shows `pc_invite_info`. If consent is needed, it says the invite must be accepted from the parent's account. It asks "Is this player under 13?", calls `pc_accept_invite`, then redirects to `/app`.

UI here is functional only. The visual design comes in Plan 3.

**Steps**

- [ ] **Step 1:** Write the failing Playwright test against local `supabase start`, with the migrations applied fresh on each run. `setup.ts` creates test users with the local service key. If Docker isn't available on Drew's Mac, stop and ask; don't fall back to the dev project. The test covers:
  - Signed out, `/app` redirects to `/login`.
  - Signed in, `/app` shows exactly the `pc_my_teams` team names.
  - Following `/join/<token>` makes a new team appear.
- [ ] **Step 2:** Run `npx playwright test`. Expected: FAIL.
- [ ] **Step 3:** Scaffold with `create-next-app`, pin versions in `package.json`, and add `@supabase/ssr` and `"typecheck": "tsc --noEmit"`. Implement the routes.
- [ ] **Step 4:** Run `npm run typecheck`, `npm run build` and `npx playwright test`. Expected: all exit 0.
- [ ] **Step 5:** Commit `feat(web): Next.js shell with sign-in, team list, join by link`.

---

## End of Plan 1 check

From a fresh clone, run every SQL test, `app_sync_e2e.js`, `smoke.js`/`parity.js`, `npm run typecheck`, `npm run build` and the Playwright shell test. Report **Verified** (with output) or **Not verified** (with the reason) for each deliverable.

| Deliverable | Status |
| --- | --- |
| D1 Migration | built; local PG17 and local Supabase; not on prod (needs PROMOTE) |
| D2 RLS matrix | 149 checks pass; second review pending |
| D3 Team-scoped sync | sync, review, client and browser sync tests pass |
| D4 Web shell | 29 checks pass against local Supabase |
