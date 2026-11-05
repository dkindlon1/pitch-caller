# Plan 5: Offline game day

Spec: `docs/specs/2026-11-05-pitchiq-platform.md` (D12, A6, A7, spikes S7 and S8). Build order step 3, after Plan 1.

**Goal.** A coach preps a game on Wi-Fi, calls it with no signal on an installed app, and it syncs afterwards. The
game-day pieces coaches need are there: pitch-count rules with rest days and an "eligible on" date per pitcher, a live
count with warnings, a printable pitching log, a catcher sign card, and dates in the team's time zone.

**What already exists (checked Nov 5).** The iPad app (`app/`, built to `app/dist/pitch-caller.html`) keeps every
pitch in IndexedDB and syncs in the background (`sync.js` 2.1.0). Undo is one tap (the Undo button on the Game screen,
or U). The engine has a fatigue point per pitcher, which is not a rest rule. No installable app, no service worker, no
rest rules, no log or sign card, and dates use the device's time zone.

## Decisions

- **S7: wrap, don't port.** The built single-file app is served as-is at `/app/game/` by the website (`web/public/app/game/`),
  with a manifest and a service worker that caches it for offline use. The Next.js proxy leaves `/app/game` alone: the
  game app signs in on its own, because it must work offline. The site serves `/app/game/config.json`, which holds
  the project URL and publishable key (both public), so coaches never type them.
- **The service worker never updates mid-game (A6).** A new version waits. The app takes it only when no game is
  live, and says so.
- **Rules are data.** `app/pitch_rules.js` holds the presets, each with its source and the date it was checked. The
  coach picks one per team and can change any number. Presets, from the official pages:
  - MLB Pitch Smart, by age band (7-8 through 19-22). Source: mlb.com/pitch-smart, checked Nov 5, 2026.
  - Little League regular season, by league age (6-8 through 15-16). Source: littleleague.org/playing-rules/pitch-count.
  - New York (NYSPHSAA): varsity by month (March, April, May/June); JV/freshman; modified. "Nights of rest". Source: the
    association's pitch count document revised for 2022, the latest found.
  - New Jersey (NJSIAA), revised Dec 5, 2025: 110 a game, 150 in any 5 days, 3 consecutive days not allowed.
  - Georgia (GHSA), varsity and sub-varsity: 110/90 a game and over two days, not more than 2 consecutive days.
  - College and pro: NCAA has no pitch-count rule; "Custom" lets the coach set every value.
  More states are added the same way: one entry each, with its source.
- **Rest arithmetic.** "N days of rest" means N full calendar days off, so the pitcher is eligible on the day plus
  N + 1. "N nights of rest" (New York) means eligible on the day plus N. Days are the team's days (its time zone, A7).
- **Only game pitches count.** Bullpens, live BP and warmups don't (they're tracked, not counted). A pitcher's day is
  the sum over every game that day.

## Tasks

1. **Rules module and tests** (`app/pitch_rules.js`, `app/pitch_rules_test.js`). `restFor(rule, pitches, date)`,
   `eligibleOn(rule, outings, today)` (rest, consecutive days, multi-day caps), `liveStatus(rule, count)` (next tier,
   the limit, finish-the-batter). Tests from each source's own table, every boundary.
2. **Team time zone.** `PCDB.today(tz)` and the day of a game in the team's zone. The zone comes from `pc_my_teams`
   when the iPad is on a team, otherwise from the device.
3. **Team rule setting** (Setup): pick a preset, see its table, change any number. Stored on our team's record, so it
   syncs to the staff.
4. **Live count with warnings** (Game screen): the count, the next rest tier ("2 more: 2 days' rest"), amber in the last
   10 before the limit, and at the limit "Finish this batter, then he's done".
5. **Eligible on** (Roster cards and the staff picker): "Eligible today", or "Eligible Sat, Nov 8 (66 pitches Tue)".
6. **Pitching log**: per game, each pitcher's pitches, batters faced, rest required and eligible date. Print view and CSV.
7. **Catcher sign card**: each pitcher's arsenal with its sign (the standard 1 FB, 2 CB, 3 SL, 4 CH, then 5 and up), printable.
8. **Installable app**: manifest, icons, service worker, `/app/game/` in `web/`, `config.json`, proxy exclusion, the
   update rule.
9. **Prep game**: one step on Wi-Fi: sync, check the staff, opponent and rule are on the iPad, record "ready offline as
   of", and warn on the Game screen when there's no prep for today.
10. **D12 end to end** (`web/tests/offline_game_e2e.js`): real local Supabase plus the built site. Install, prep,
    `setOffline(true)`, reload offline (the service worker serves the app), call a full inning, back online → the
    pitches are in the server's `events` table.
11. **S8 checklist** for Drew's iPad (needs the site deployed over HTTPS: Vercel, his account).

## Done when

Every task's test passes locally and in CI, and the S8 checklist is ready. S8 itself is run on Drew's iPad once the site
is deployed.
