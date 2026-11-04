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
   password) with **Auto Confirm User** ticked. The app has no sign-up screen of its own yet.
4. **Copy two values** from the project's API keys page (**Project Settings → API Keys**): the **Project URL**
   (`https://<something>.supabase.co`) and the **publishable key** (`sb_publishable_…`). The older **anon** key works
   too. **Never** use the secret or service_role key in the app, and never commit either key to the repo.
5. **On the head coach's iPad:** go to **Setup → Sync with Supabase**, paste the URL and the key, and sign in. Then
   tap **Start a program for this team**. Your team, roster and games go up, and you become the program's head coach.
6. **Add the staff:** still in Setup, type each person's email, choose a role, and tap **Add**. They need an account
   from step 3 first.
   - **Charter:** charts games and plans them, and reads everything. He can't change the pitcher records (grades,
     arsenals).
   - **Pitcher:** sees his own pitcher record and what's been learned about him, and logs his own check-ins,
     bullpens and velo. Pick which roster pitcher he is.
   - **Head coach:** everything, including adding staff.
7. **On every other iPad:** go to Setup, paste the same URL and key, sign in, and tap the program's name. The iPad
   pulls the program first. Its own placeholder "Our team" and default pitchers are dropped. Any pitchers that
   already have work on that iPad are kept and moved onto the program's team (check the roster for doubles).

## What the rules are

- Each program sees only its own data. Row level security checks every request against the signed-in user's role.
- Nothing is ever deleted on the server. A delete on an iPad is sent up as a deleted marker, the same as on the device.
- When two iPads changed the same record, the newer change (by the iPad's clock) wins. Keep the iPads' clocks on
  automatic.
- If someone tries a change their role doesn't allow, the server refuses just that record. Setup says how many were
  refused, and those changes stay on that iPad only.

## What has and hasn't been tested

Tested here (all passing) against a real local Postgres 16 with this migration applied:

- `supabase/test/sync_test.js`: the row rules for each role and across programs, no deletes, newest-wins pushes, a
  pull that never skips a late-committing write, two iPads syncing with a conflict, a refused charter edit, offline,
  and the app's REST calls.
- `supabase/test/app_sync_e2e.js`: the real app in a browser, on two iPads (head coach and charter), covering sign-in,
  starting a program, adding staff, End game syncing on its own, joining, offline, a mid-game re-grade arriving on
  the other iPad, and an expired sign-in.
- `app/sync_auth_test.js`: sign-in and token refresh.

**Not tested:** Supabase's own servers. Both browser tests use a small stand-in for Supabase's REST API and Auth
that calls the same database functions as the signed-in user. Supabase's real servers do that job when it counts.
The first time you sync against the real project, check that the program's pitches show up in the Supabase Table
Editor (`events`). If anything fails, the message shows in Setup.

Run the tests (needs a local Postgres; nothing here touches a real Supabase project):

```
PGURL="postgresql://postgres@localhost:5432/postgres" node supabase/test/sync_test.js
PGURL="postgresql://postgres@localhost:5432/postgres" node supabase/test/app_sync_e2e.js   # needs Playwright
node app/sync_auth_test.js
```
