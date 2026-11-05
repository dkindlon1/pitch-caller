# S8: the game app on a real iPad (Drew)

What it settles: whether the installed app keeps its data through a long offline game, an app update and a sync, and
whether the home-screen app and Safari share storage (spec, Unknowns and spikes, S8). The automated test
(`web/tests/offline_game_e2e.js`) covers the same flow in Chromium; Safari on iPadOS is what this adds.

**Before:** the site deployed over HTTPS (Vercel; service workers need HTTPS), the prod promote done (it is), and a
team switched on in prod for testing. Write the time next to each step.

1. **Open in Safari** `https://<site>/app/game/` on Wi-Fi. Setup, Sync: it asks only for an email and password (no
   project URL). Sign in, pick the team.
2. **Add to Home Screen** (Share, Add to Home Screen). Open it from the home screen. Is the team still picked and
   signed in? (If not: the home-screen app has its own storage, so prep has to happen inside it. Note which.)
3. In the home-screen app: Setup, Pitch counts: pick the rule. Today's staff, the opponent. **Get ready for offline**.
   Write down each check it shows.
4. **Airplane mode.** Close the app fully (swipe it away), reopen it. Does it open? Is everything there?
5. **Call for real for 3 hours**: a full scrimmage, or 3 hours of charting. Let the screen lock and unlock a few times,
   switch to another app and back. Note anything slow, any toast, the battery at start and end.
6. **Mid-game update:** tell Claude when you're in the middle; Claude deploys a small change. The app should keep
   calling and show "An update is ready. It installs after this game." End the game: it should reload once.
7. **Back online:** turn airplane mode off. Within a minute (or Setup, Sync now) the pitches go up. Claude checks the
   server's `events` table against the app's pitch count.
8. **Storage:** Settings, Safari, Advanced, Website Data: is the site's data there, and how big?

**Results to send back:** which steps passed, the times, anything that looked wrong (a screenshot helps), and
the answer to step 2.
