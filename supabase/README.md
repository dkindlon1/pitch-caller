# Supabase for Pitch Caller

Every pitch is saved on the iPad first. Supabase is the shared copy: sync sends each iPad's changes up and brings
back what other iPads charted. It runs after every End game and whenever someone taps **Sync now** in Setup. A game
never waits on it, and charting with no signal is fine.

## One-time setup (head coach, about 10 minutes)

1. **Create the project.** Sign up at supabase.com and create a new project. The free tier is enough for a season.
   Pick the region closest to you and save the database password somewhere safe; the app never needs it.
2. **Run the migration.** In the project, open **SQL Editor**, paste all of
   `supabase/migrations/20261103000000_pitch_caller.sql`, and click **Run**. It creates the tables, the row rules and
   the sync functions. Run it once only, on a new project. (If you use the Supabase CLI, `supabase db push` does the same.)
3. **Make the accounts.** Open **Authentication → Users → Add user**, and create one user per person (email and
   password) with **Auto Confirm User** ticked. The app has no sign-up screen of its own yet. An account counts only
   once its email is confirmed.
4. **Copy two values** from the project's API keys page (**Project Settings → API Keys**): the **Project URL**
   (`https://<something>.supabase.co`) and the **publishable key** (`sb_publishable_…`). The older **anon** key works
   too. **Never** use the secret or service_role key in the app, and never commit either key to the repo.
5. **On the head coach's iPad:** go to **Setup → Sync with Supabase**, paste the URL and the key, and sign in. Then
   tap **Start a program for this team**. Your team, roster and games go up, and you become the program's head coach.
6. **Invite the staff:** still in Setup, type each person's email, choose a role, and tap **Invite**. Nobody joins
   without accepting: they sign in on their iPad with that email and tap **Accept**. (An invite looks the same whether
   or not the email has an account yet, so it can't be used to find out who's signed up.) The staff list there shows
   members and pending invites; the head coach can change a role, remove someone, or cancel an invite. A program
   always keeps at least one head coach.
   - **Charter:** charts games and plans them, and reads everything. He can't change the pitcher records (grades,
     arsenals).
   - **Pitcher:** sees his own pitcher record and what's been learned about him, and logs his own check-ins,
     bullpens and velo. Pick which roster pitcher he is.
   - **Head coach:** everything, including adding staff.
7. **On every other iPad:** go to Setup, paste the same URL and key, sign in, and accept the invite (or tap the
   program's name). The iPad pulls the program first. Its own placeholder "Our team" and default pitchers are
   dropped. Any pitchers that already have work on that iPad are kept and moved onto the program's team (check the
   roster for doubles). If there's no signal, nothing is joined and nothing goes up.

**One iPad holds one program.** The first program an iPad syncs with is the only one it syncs with, so one program's
records can never go up into another. To use an iPad for a different program, tap **Back up and start this iPad
fresh** in Setup: it saves a backup file, then clears the iPad.

**Backups** never carry the sign-in session, the device's id or its sync position, and a restore never takes them
from a file. A restored record goes up at the next sync even if it's older than the iPad's last one.

**After restoring the database into a new Supabase project** (dump and restore), run `select public.pc_restamp();`
once in the SQL editor. Until then the iPads see the old rows as "still being saved".

## What the rules are

- Each program sees only its own data. Row level security checks every request against the signed-in user's role.
- Nothing is ever deleted on the server. A delete on an iPad is sent up as a deleted marker, the same as on the device.
- The tables can only be written through the sync function (`pc_push`), never directly through Supabase's REST API,
  so its rules can't be gone around.
- When two iPads changed the same record, the newer change wins. An edit is always stamped later than the version it
  was made from, so an iPad whose clock is behind still can't lose a later edit to an earlier one. A record stamped
  more than a day ahead of the server's clock is refused (a broken iPad clock). Keep the iPads' clocks on automatic.
- When the server keeps its own copy (it's as new or newer), it sends that copy back and the iPad takes it.
- If someone tries a change their role doesn't allow, the server refuses just that record, and says nothing about a
  record that caller can't read. Setup says how many were refused. They stay on that iPad and are tried again at every
  sync, so a head coach signing in on it later sends them.
- One bad record (a broken character, an id that's too long) never stops a sync: bad characters are cleaned before
  sending, and anything the server still can't take is refused on its own.
- When someone's role changes, their iPad starts its pulls over, so it gets what it couldn't see before. Someone
  removed or demoted keeps what was already on their iPad (it's an offline app); what changes is everything after.
- If a long-running operation on the server is holding newer rows back, Setup says so; they come at the next sync.

## What has and hasn't been tested

Tested here (all passing) against a real local Postgres 16 with this migration applied:

- `supabase/test/sync_test.js`: the row rules for each role and across programs, no deletes, newest-wins pushes, a
  pull that never skips a late-committing write, two iPads syncing with a conflict, a refused charter edit, offline,
  and the app's REST calls.
- `supabase/test/app_sync_e2e.js`: the real app in a browser, on two iPads (head coach and charter), covering sign-in,
  starting a program, adding staff, End game syncing on its own, joining, offline, a mid-game re-grade arriving on
  the other iPad, and an expired sign-in.
- `supabase/test/review_test.js`: everything the code review found on the server side (invites and consent, no
  direct writes, the member list, no probing other pitchers' records, bad records in a batch, server copies coming
  back, role changes, restores, the head-coach race, removing staff, a pitcher's pull speed on 100k pitches).
- `supabase/test/client_review_test.js`: the iPad side of those (a wrong clock, a refused change kept for the next
  account, a restored record going up, bad characters, one program per iPad, held rows).
- `app/sync_auth_test.js`: sign-in, token refresh, and one refresh at a time.

**Not tested:** Supabase's own servers. Both browser tests use a small stand-in for Supabase's REST API and Auth
that calls the same database functions as the signed-in user. Supabase's real servers do that job when it counts.
The first time you sync against the real project, check that the program's pitches show up in the Supabase Table
Editor (`events`). If anything fails, the message shows in Setup.

Run the tests (needs a local Postgres; nothing here touches a real Supabase project):

```
PGURL="postgresql://postgres@localhost:5432/postgres" node supabase/test/sync_test.js
PGURL="postgresql://postgres@localhost:5432/postgres" node supabase/test/app_sync_e2e.js   # needs Playwright
PGURL="postgresql://postgres@localhost:5432/postgres" node supabase/test/review_test.js
PGURL="postgresql://postgres@localhost:5432/postgres" node supabase/test/client_review_test.js
node app/sync_auth_test.js
```
