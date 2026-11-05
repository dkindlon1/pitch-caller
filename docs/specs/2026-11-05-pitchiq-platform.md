# PitchIQ platform spec: accounts, portals, billing, uploads, marketing site

Status: **approved (Drew, Nov 5, 10:23), frozen under change control** · 2026-11-05 · Engine work (v0.9) is out of scope and runs in parallel.

## Goal

Turn the pitch caller into PitchIQ, a paid product. A coach or program finds it on a public website, pays per team per year, builds teams, and calls games offline. Players log in to their own team, manage their own profile and arsenal, upload TrackMan/Rapsodo data, and see their own stats.

## Non-goals (v1)

- Any change to engine logic. The engine keeps reading the fields it reads today: velo, shape, slot, grades, and hitter grades (default 3).
- Messaging between coaches and players. "Send stuff" was undecided, so it is cut.
- Wristbands or electronic senders. NCAA Rule 5-16 is settled later.
- Sharing data across teams or organizations, including the anonymous averages from the learning spec.
- A stuff/pitch-quality model that grades pitches from shape. Uploads describe pitches; they don't grade them.
- Native iOS apps. Everything is web; live calling runs in the iPad browser.
- Fabricated testimonials, logos, user counts or results on the website. Only real ones, once they exist.
- Legal advice. Terms and Privacy get drafted for a lawyer to review.

## Decisions already made (Drew, Nov 5)

| Area | Decision |
| --- | --- |
| Buyer | A program or a single coach. Price is **per team, per year**, charged to a card through Stripe, with an invoice emailed each year. This changed from monthly on Nov 5 at 11:44. |
| Pricing | A first-term discount (one-time coupon). Amount not set (the Stripe price is a config value). |
| College | Live in-game calling is built for college now, the same as high school. The NCAA question (S9) is settled later, and the feature can be removed then if needed. The site makes no claim that in-game use is allowed in NCAA play. |
| Seats | Unlimited players. |
| Lapse | Locks the moment a payment fails. Before locking, every player is emailed their own data and every coach is emailed their team's data. Then everyone is locked out entirely. |
| Under 13 | Allowed. An under-13 account is created and owned by a parent (see Minors). |
| Removing a team mid-term | The charge stands (no refund). The team stays usable until the end of the paid year, then locks. |
| Ownership | The owner holds billing and adds coaches to teams with permissions. The owner is not automatically a coach on any team. Ownership can transfer. |
| Coach permissions | Presets, with an advanced toggle view underneath. |
| Multi-team | One coach can be on many teams, with a role per team. |
| Visibility | Coaches see only their own team. Players see only themselves. No one sees other teams. Opponent profiles are private to the team. |
| Players | Each player has one account (shared with a parent if they want). They edit their own profile, arsenal and grades, and upload data. Values pulled from uploads must be confirmed by the pitcher or coach before they take effect. |
| Uploads | Velocity, pitch shape and release slot. Pitches can be excluded, with an optional reason (including "developing"). Coaches can see and edit exclusions. Sessions are tagged and weighted by type. |
| Scouting | A bonus input. With no scouting, hitter grades stay at 3. Verified: SPEC_v0.8 §8.2, and `hitterGrades()` in the app drops grades equal to 3. |
| Offline | Download a game plan on Wi-Fi, call the game offline, sync afterward. |
| Super admin | Required (for Drew). |
| Website | Full service website with 3D effects and animation. Blue and orange, with white and black accents. Includes a product demo. |
| Signup | Create an organization, pick a number of teams (default 1), then pay. |

## Constraints and stack

- **Database and auth:** Supabase project `pitch-caller` (`fpoiqnswdmyprbyhgukq`). Verified today: all 13 public tables have 0 rows, so the schema can be redesigned without migrating data. The free tier pauses inactive projects; launch needs the Pro tier.
- **Web:** Next.js (App Router, TypeScript), with versions pinned at scaffold. One app serves the marketing site at `/` and the portal at `/app`. Hosted on Vercel Pro, because the Hobby tier is for non-commercial use.
- **Live calling:** keeps the existing `engine.js` and IndexedDB offline store. It moves under `/app/game/*` as an installable PWA route. The engine is unchanged.
- **Payments:** Stripe Checkout, Billing Portal and webhooks, received by a Supabase Edge Function. Test mode only until launch.
- **Email:** Resend, for invites and export links. Supabase's built-in email is rate-limited and meant for testing.
- **3D:** React Three Fiber with drei, plus GSAP ScrollTrigger and Lenis for scroll motion. 3D loads after the main content appears.
- **Security:** the publishable key is public, so row-level security is the only thing protecting data. No deletes (soft deletes, as today). Every security-definer function sets `search_path`.
- **Design:** screens are designed in Claude Design first, then built using the taste, frontend-design, web-design-guidelines and awesome-design-md skills. Nothing generic.

## Account and permission model

```
platform_admins ─ Drew
organizations (today's "programs") ─ owner_id, stripe_customer_id, billing_status
  └─ teams ─ name, level, season, status (active | ending | locked)
       └─ team_members ─ user, kind (coach | player), preset, perms, pitcher_id
```

Each **coach preset** is a fixed set of toggles. The advanced view shows the toggles themselves.

| Toggle | Head coach | Pitching coach | Game caller (today's "charter") | Viewer |
| --- | --- | --- | --- | --- |
| view_team (always on) | ✓ | ✓ | ✓ | ✓ |
| call_games | ✓ | ✓ | ✓ | |
| edit_grades | ✓ | ✓ | | |
| review_uploads | ✓ | ✓ | | |
| manage_opponents | ✓ | ✓ | ✓ | |
| manage_roster (add, remove, invite players) | ✓ | | | |
| manage_staff (add coaches to this team) | ✓ | | | |

The **owner** can do these things across the whole organization: billing, create and archive teams, add any coach to any team, and transfer ownership. The owner sees team data only if added to that team.

**Minors.**
- For a player under 13, the invite goes to a parent's email. The parent creates the account and gives consent before anything about the child is stored, as COPPA requires: notice to the parent plus verifiable parental consent. The account records the consent method and timestamp.
- Players 13 to 17 tick a box confirming a parent or guardian agrees to the Terms.
- Consent flow and wording are a lawyer's call before launch.

A **player** can read and write their own profile, arsenal, grades, uploads and exclusions. They can read their own outings, stats and learned values. They can see nothing about teammates, opponents, hitters or the game plan.

A **super admin** can read organizations, teams, member counts and billing status. Support actions go only through logged functions (written to `admin_audit`). Super admins never read pitch data, and there is no impersonation.

**Grade edits:** a player's edit applies immediately, as decided. Every change is written to `grade_history` (who, when, old value, new value). Coaches see a "changed by player" badge and can revert in one tap. Values proposed from uploads wait as `proposals` until the pitcher or a coach with `review_uploads` confirms them.

## Data model changes (one new migration)

- Rename `programs` to `organizations`, and add `owner_id`, `stripe_customer_id`, `stripe_subscription_id` and `billing_status` (mirrored from Stripe).
- `teams` becomes a real table with columns (not a jsonb doc): `id, org_id, name, level, season, status, ends_at`.
- `team_members(team_id, user_id, kind, preset, perms jsonb, pitcher_id)` replaces `members`. `invites` becomes team-scoped, with a token link and an optional email.
- The existing doc tables (pitchers, hitters, games, events, sessions, readings, learned, checkins, packs, catchers) get a generated `team_id` from `doc->>'teamId'`. Policies switch from program-scoped to team-scoped plus permission-scoped. `pc_push` and `pc_pull` take a `team_id`.
- New tables: `uploads` (file, source, session_type, date), `upload_pitches` (normalized row, `excluded`, `reason`, `developing`), `proposals`, `grade_history`, `opponents` (team-private; their hitters stay in `hitters` with `opponentId`), `exports`, `platform_admins`, `admin_audit`.
- Every policy goes through `pc_team_active(team_id)`, which returns false for a locked team. That single check is the lockout.

## Screens

**Marketing site**
- Home: 3D hero, the problem, how it works (engine, game, learning), coaches, pitchers, TrackMan/Rapsodo, pricing teaser, FAQ.
- Live demo.
- Pricing.
- Sign up and log in.
- Terms and Privacy.
- Contact.

**Coach portal**
- Home dashboard:
  - Next game card with "Prep game" (pick the opponent, scouting, available pitchers, download for offline).
  - Pitcher availability: days since last outing, pitches last outing, pitches in the last 7 days, and the team's pitch cap.
  - Recent outings.
  - Uploads and proposals waiting for review.
  - Learner flags.
  - Roster changes.
- Team switcher, for coaches on several teams.
- Roster: create player spots, then send invite links.
- Staff and permissions: presets, plus the advanced toggles.
- Pitcher detail: arsenal, grades with history, uploads, stats, learned values.
- Opponents: team-private profiles and hitters.
- Games list.
- Settings.

**Owner portal (inside the coach portal)**
- Organization settings, teams (add or remove), staff assignment, billing (opens the Stripe Billing Portal), transfer ownership.

**Player portal**
- Home: next outing and latest stats.
- Profile.
- Arsenal and grades: editable, with history.
- Uploads: drag and drop, tag the session, and review pitches with include, exclude, reason, or developing.
- Stats and graphs.
- What the engine has learned about me.

**Live calling (offline)**
- Today's screens, behind "Prep game". It pulls the bundle (roster, arsenal, grades, learned values, opponent hitters, engine config) into IndexedDB.
- Works with no network. Events queue and sync when back online.

**Super admin**
- Organizations, teams, billing status, recent signups, and the audit log.

## Upload pipeline

1. **Detect the source.**
   - **TrackMan:** headers match the V3 glossary (`RelSpeed`, `InducedVertBreak`, `HorzBreak`, `RelHeight`, `RelSide`, `Extension`, `SpinRate`, `TaggedPitchType`, `PitcherThrows`, `PitchCall`, `Balls`, `Strikes`).
   - **Rapsodo:** headers match a list of alternate names. Exact headers are unconfirmed, and CSV export needs a higher Rapsodo cloud tier.
   - **Anything else:** a one-time column-mapping screen, saved as a template per source.
2. **Normalize** to one row shape: `velo_mph, ivb_in, hb_in, spin_rpm, rel_height_ft, rel_side_ft, extension_ft, pitch_type, thrown_at`. Horizontal values are converted to arm-side positive using the pitcher's hand. Metric files are converted.
3. **Review.** The player (or a coach with `review_uploads`) sees every pitch.
   - **Exclude** a pitch, with an optional reason: warmup, testing a grip, mis-tag, or other. Excluded pitches are stored but counted nowhere.
   - **Developing** pitches are kept and shown in an "in development" view. They never feed the engine until promoted.
4. **Summarize** per pitch type, weighting each pitch by session type and recency. Starting weights are game 1.0, live BP 0.7, bullpen 0.4, with a 60-day recency half-life. All are config constants.
5. **Propose** values for the fields the engine already reads: `velo`, `shape` (from IVB/HB rules mapping to ride/run/sink/cut, tight/sweeper, loopy/sharp, fade/drop) and `slot` (from release height and side relative to the player's height). Each needs a confirmation before it takes effect.

**TrackMan game files** also carry `Balls`, `Strikes` and `PitchCall`. Those rows feed the player's stats, labeled by source.

## Player stats

Stats are computed from game events called in PitchIQ plus TrackMan game files. They are always labeled by source and always show the sample size.

- Usage by count.
- For each count and pitch type: strike %, whiff %, strikeout % (two-strike counts), and contact quality on balls in play.
- Results by hitter side.
- Outing log.
- Velocity trend.
- Movement plot (IVB vs HB).
- The engine's learned values next to the coach's grades.

**Minimum sample rule:** a rate based on fewer than 10 pitches shows the count only ("6 pitches — not enough yet"). A line like "2-2 sliders: 43% K" is only shown with its n.

## Billing and lockout

- **Stripe setup:** one product, "PitchIQ Team", with a yearly price per team, charged automatically to a card. Stripe emails the invoice and receipt. Each organization has one subscription whose quantity equals its active team count. A coupon with `duration: once` discounts the first year.
- **Signup flow:** create an account, name the organization and set its level, choose the number of teams (default 1), then Stripe Checkout. The Checkout return lands in the portal. The webhook (`checkout.session.completed`) sets `billing_status=active`. The portal shows "activating" until it does.
- **Adding a team:** quantity +1, prorated.
- **Removing a team:** quantity −1 with `proration_behavior=none`. The team stays usable until the period ends, then locks.
- **Lapse:** triggered by `invoice.payment_failed` or `customer.subscription.deleted`.
  1. Build the exports.
     - Each player gets their own data: CSV bundle plus a PDF summary.
     - Each coach gets their team's data: roster, arsenals, grades, games, opponents, uploads.
  2. Email each person a 30-day signed download link.
  3. Lock every team.

  The owner keeps access only to the billing page, so they can fix the card.
- **Resubscribe or successful retry:** `invoice.paid` unlocks the teams automatically.
- **Retention (confirmed):** locked data is kept 12 months so a returning team gets everything back, then deleted.
- **Webhook handling:** idempotent on the event id, and verified with Stripe's signature.

## Marketing site direction

- **Color:** dark-first. Near-black base, electric blue as the primary, signal orange as the "call" and CTA accent, white text, black and white contrast.
- **Type:** a sharp grotesk for display and a mono for data readouts, so it feels like a TrackMan or Rapsodo HUD.
- **Hero:** a real-seam baseball rendered in WebGL flies a pitch path into a 3×3 zone. The call appears as a HUD readout (`SL · DOWN-AWAY · 2-2`).
- **Scroll sections:**
  - The engine sequences a whole at-bat, shown as ball trails.
  - The live-calling iPad floats in 3D, showing the real screen.
  - A movement plot from upload data is shown as a 3D point cloud.
- **Live demo:** runs the real `engine.js` in the browser against a scripted lineup. The visitor taps outcomes and gets the next call with its reason. It is a working demo, not a video.
- **Performance:**
  - Mobile Lighthouse performance ≥ 80, LCP ≤ 2.5 s, CLS < 0.1.
  - 3D is lazy-loaded.
  - With `prefers-reduced-motion` or no WebGL, the site uses static renders.

## Deliverables

| ID | What exists when done | Acceptance check | Covers |
| --- | --- | --- | --- |
| D1 | New migration (model above) | Local Postgres: apply auth stub plus all migrations → `MIGRATION_OK` | Model, lockout |
| D2 | Row-level-security matrix test | `node supabase/test/rls_matrix_test.js`: every kind/preset × table × select/insert/update, plus other-team, other-org, locked team, anon, authenticated non-member → 0 fails | Visibility |
| D3 | Team-scoped `pc_push`/`pc_pull` and `sync.js` | Ported `sync_test.js` and `app_sync_e2e.js` pass | Offline sync |
| D4 | Next.js app scaffold, auth, `/` and `/app` | `npm run build` and `npm run typecheck` exit 0 | Stack |
| D5 | Signup → Checkout → webhook → active org | Playwright: test card 4242 → portal shows the organization as active. Replaying the same webhook event twice changes nothing. | Billing, signup |
| D6 | Add/remove team billing | Stripe test clock: remove a team mid-period → still usable before the period ends, locked after | Removal |
| D7 | Lockout, exports and unlock | Stripe test card that declines (`4000000000000341`) → exports are built and emailed (captured in a Resend test inbox). Each player export's row count equals that player's rows in the database; each coach export covers the whole team. Then RLS denies every member. A successful payment → unlocked. | Lapse |
| D8 | Coach portal, owner screens and invites | A Playwright flow per screen. A coach on 2 teams sees each team's data separately. An invite link joins the right roster spot. Ownership transfer moves billing rights and the old owner loses them. | Coach UX, ownership |
| D9 | Player portal and grade history | Playwright. An API test where a player reads a teammate's row → denied. Player edits a grade → history row exists and the coach can revert it. | Player UX |
| D10 | Upload pipeline | Unit tests on the public TrackMan V3 college dataset (Mendeley `Track_Combo.csv`): parses every row, signs are correct for left- and right-handers, the per-type summary matches a hand calculation. Excluded and developing pitches change the summary as specified. | Uploads |
| D11 | Stats module | Fixture events → rates equal hand-calculated values. n < 10 shows the count only. | Stats |
| D12 | Offline game | Playwright with `setOffline(true)`: prep, call a full inning, go back online → the events appear in the Supabase `events` table. This also settles the open Nov 4 item. | Offline |
| D13 | Super admin | Non-admin call → denied. Admin sees the org list. Every action writes to `admin_audit`. | Admin |
| D14 | Marketing site, 3D and demo | Lighthouse thresholds above. Reduced-motion path renders without WebGL. Demo calls come from `engine.js`. **Visual sign-off is Drew's call.** | Website |
| D15 | Terms, Privacy, signup acceptance | Pages exist. Acceptance is stored with a timestamp. **Content is a lawyer's call.** | Legal |

**End-to-end check:**
1. A new owner signs up and pays (test mode), creates a team, and invites a pitching coach and a player.
2. The player uploads a TrackMan file, excludes 3 warmups, tags 1 developing pitch, and confirms the velocity proposal.
3. The coach preps a game, calls an inning offline, and syncs.
4. The player sees the outing and stats but cannot see a teammate.
5. A test clock cancels the subscription. Everyone is locked out and the player receives the datasheet link.

## Interfaces

```sql
pc_team_active(team uuid) returns boolean                 -- false when locked
pc_can(team uuid, perm text) returns boolean              -- owner/coach toggle check
pc_my_pitcher(team uuid) returns text                     -- player's own pitcher id
pc_push(team uuid, tbl text, rows jsonb) returns jsonb    -- same rules as today, team-scoped
pc_pull(team uuid, tbl text, after_xid bigint, after_id text, lim int)
pc_invite(team uuid, kind text, preset text, pitcher_id text, email text default null) returns text  -- link token
pc_accept_invite(token text)
pc_set_member(team uuid, member uuid, preset text, perms jsonb)
pc_transfer_owner(org uuid, new_owner uuid)
```

```ts
type UploadPitch = { velo_mph: number; ivb_in: number|null; hb_in: number|null; spin_rpm: number|null;
  rel_height_ft: number|null; rel_side_ft: number|null; extension_ft: number|null;
  pitch_type: string; thrown_at: string; excluded: boolean; reason?: 'warmup'|'grip'|'mistag'|'other';
  developing: boolean; source: 'trackman'|'rapsodo'|'mapped'; session_type: 'game'|'live_bp'|'bullpen' };
type Proposal = { pitcher_id: string; pitch: string; field: 'velo'|'shape'|'slot'; value: number|string;
  from_upload: string; status: 'pending'|'accepted'|'rejected' };
```

## Unknowns and spikes (run first)

| Spike | What it settles | What would change the design |
| --- | --- | --- |
| S1: team-scoped RLS on the jsonb doc tables (local Postgres, like the Nov 4 review) | Correctness and query cost of permission checks per row | If slow: denormalize `team_id` plus permissions into a cached membership view |
| S2: a real Rapsodo CSV (from RIT's unit or a facility) | Exact headers | None. The mapping screen handles any file; this just adds an auto-detect entry. |
| S3: TrackMan sign conventions on the Mendeley data | Whether `HorzBreak`/`RelSide` need flipping by hand | Normalization rule only |
| S4: Stripe test clocks through the full lapse | Webhook timing and lockout | Grace-period handling |
| S5: 3D hero on an iPad and a mid-range phone | Frame rate and LCP | Lighter hero (pre-rendered video loop) on low-power devices |
| S6: engine defaults with no scouting | **Done.** Hitter grades default to 3 and are inert. | — |
| S7: moving the live-calling app into `/app/game` | Wrap the current build as-is vs port it | Lean: wrap first, port during the redesign |
| S8: a real iPad (Drew has one available) | Install the app, prep a game, airplane mode, 3 hours of calling, an app update mid-game, reconnect and sync. Also: whether the home-screen app shares storage with Safari. | If storage is evicted or split: prep has to happen inside the installed app, and the app warns when a plan is missing |
| S9: NCAA Rule 5-16 text and RIT compliance | Whether a coach can read calls on a tablet in the dugout during college games. The 2025 rules allow only a one-way device for relaying calls; the 2024 proposal named tablets as banned, with ejection. | If banned: college gets game prep, bullpens, scrimmages and fall ball only, and the site says so |

## Risks

- **Name:** another iOS sports app (a soccer prediction app) and a Showpad sales feature already use "PitchIQ". Run a trademark search before buying a domain or finalizing a logo.
- **Minors:** under-13 players are in scope, so COPPA applies. That means parental notice, verifiable consent, and limits on what is collected. A lawyer should review this before launch.
- **Lock on first failed payment:** an expired card locks a team mid-season and emails everyone a full export. `invoice.paid` unlocks automatically.
- **Renewal failures:** with yearly billing, off-season cancellations are mostly solved. The risk moves to the renewal date: an expired card at renewal locks the team immediately. Stripe's card account updater refreshes many expired cards automatically, and a renewal reminder email goes out 14 days before the renewal date.
- **NCAA electronic-device rules:** using a tablet in college games may get the coach ejected (see S9). This affects what can be promised to a third of the market, not just the wording on the site.
- **Running costs at launch:** Supabase Pro, Vercel Pro, Resend, plus Stripe fees.

## Resolved (Drew, Nov 5, 10:20)

1. Lapse: email data to players and coaches, then lock. This happens on any failed payment, exactly as written (Option B, confirmed 10:23). Server data is kept 12 months.
2. Lock on the first failed payment.
3. Players under 13 are allowed. Their account must be the parent's: created, owned and consented to by the parent.
4. Stack: Next.js + Vercel Pro + Resend + Stripe.
5. Head coaches can add coaches, through `manage_staff` (on in the Head coach preset).

## Definition of done

Every acceptance check passes in a fresh run. The full test suite is green. `npm run build` passes. The final report lists **Verified** (with command output) vs **Not verified** (with the reason). Nothing is called done without output.

## Amendments (A1–A10 accepted by Drew, Nov 5 11:44; A11 proposed)

**A1. One parent account, several children.**
- A parent can link one login to several player spots on a team, for example two under-13 siblings.
- Effect: `pc_my_pitcher` becomes `pc_my_pitchers`, which returns a set. The player portal gets a child switcher (Plan 3). Deliverables affected: D1, D9.

**A2. Tables arrive with the plan that uses them.**
- Billing, upload, admin and export tables are created in the migration of the plan that uses them, instead of all in one migration up front.
- Every new table still gets RLS on and a check in the RLS matrix test.
- Deliverables affected: D1 is now "Plan 1 migration"; D5–D13 each add their own.

**A3. Server-trusted timestamps and player field limits (security).**
- The server clamps any `updatedAt` later than now plus 2 minutes.
- Players can change only an allowlist of profile and arsenal keys, which is merged into the existing doc. A player can't overwrite coach-only fields, and can't win every future conflict with a far-future timestamp.
- Affects D1 and D2.

**A4. COPPA compliance (legal; the amended rule has applied since April 22, 2026).**
- A public written retention policy. Indefinite retention is banned.
- A logged hard delete of a child's data, which a parent can request.
- Soft-deleted rows are purged after 12 months.
- Under-13 data is left out of coach exports until a lawyer approves it.
- Export links are short-lived and require signing in.
- A child who declares under 13 on an invite with no email must give a parent's email. A new invite goes to that email, and the child's account is never linked.
- Flagging a spot as under 13 strips it back to the placeholder fields.
- Affects D1, D7, D15.

**A5. Billing state hygiene.**
- A lapse changes only `organizations.billing_status`. Removing a team changes only `teams.status`. Unlocking therefore can't revive a removed team.
- Webhook events older than the last applied billing change are ignored, because Stripe doesn't guarantee order.
- Exports are built once per lapse, keyed by organization and invoice, since `invoice.payment_failed` fires on every retry.
- Customers can't change quantity in the Billing Portal.
- The Stripe API version is pinned.
- Affects D5, D6, D7.

**A6. Shared iPads.**
- The offline store and outbox belong to the signed-in user. A different user signing in clears the store.
- Queued rows only sync for the user who wrote them.
- The app asks for persistent storage (`navigator.storage.persist()`) and syncs whenever it comes to the foreground.
- The service worker never updates during a live game.
- Affects D3 and D12.

**A7. Game day (the coach's must-haves).**
- Pitch-count rules per level: presets for state associations and MLB Pitch Smart by age. The coach picks one, and every value can be edited.
- A live count with tier warnings, and an "eligible on" date for each pitcher.
- A printable or exportable pitching log.
- One-tap undo of the last pitch.
- A catcher sign card.
- Each team has a time zone, used for dates and rest days.
- This replaces the single "team's pitch cap" line. Affects D8 and D12.

**A8. Fast onboarding.**
- Paste a roster as a list of names.
- The coach can enter arsenals directly, with every grade defaulting to 3. Players are never a dependency for calling a game.
- Target: an opponent's 9 hitters with handedness entered in under 60 seconds.
- A demo team to explore before paying.
- Affects D8.

**A9. Operations (new Plan 0, before Plan 1 Task 2).**
- A production Supabase project, separate from dev.
- CI on GitHub Actions running every SQL test and the build.
- Migrations promoted dev → prod with the Supabase CLI.
- Error tracking (Sentry).
- A scheduled export of Storage objects, which daily backups don't cover.
- A paid Resend plan, with SPF, DKIM and DMARC on the domain.
- Supabase Auth on custom SMTP, with email confirmation verified as on.
- Domain bought only after the trademark search.
- Affects every deliverable.

**A10. Go-to-market.**
- A one-page messaging brief:
  - The plain-English promise: every call comes with its reason, e.g. "Slider down and away: he's late on the fastball and you're ahead."
  - The wedge against Sequence.IQ: calls a whole at-bat from pitch one, with no logging or scouting needed first.
- Pages:
  - About, with the founder story as a college pitcher.
  - How the engine thinks.
  - Parents & players, with plain-language data handling for minors.
  - "Is this legal in my league?", citing NFHS and state rules plus NCAA Rule 5-16.
- A "notify me for spring" email capture on a simple landing page, live as soon as the domain exists.
- Privacy-light analytics with no tracking inside `/app`. Funnel: demo start → 5th demo call → pricing → checkout → paid → first game prepped → first game synced.
- "PitchIQ Baseball" in titles and metadata.
- Affects D14.

**A11. A team is the existing `programs` row (proposed Nov 5, built on the branch; awaiting Drew's approval).**
- Found while building Plan 1: the data model above scopes the doc tables by a `team_id` generated from `doc->>'teamId'`. That field already means something else: on a hitter it is the *opponent* team the hitter plays for. Scoping by it would file opponent hitters under the wrong team, or under none.
- Instead: a team **is** today's `programs` row, now under `organizations`. Every doc table keeps its `program_id` column, which already scopes every row to one team, so no doc changes and no backfill. `pc_push` / `pc_pull` keep their `p` argument (it is the team).
- `members` keeps its name and gains the presets (head, pitching, caller, viewer) with `perms` toggles on top, or `player`. A player's pitcher records move to `player_links (program_id, user_id, pitcher_id)`, so one account can hold more than one.
- Invites become 64-character link tokens, optionally tied to an email, one open invite per pitcher. An invite for a player under 13 needs a guardian's consent first. The team iPad takes staff invites only; players join from the link on their own (or a parent's) phone.
- The age question (birth month and year) comes before any account, on the join page and on sign-up. Under 13, no account is made and nothing of the child's is kept: he gives a parent's email, and the invite moves to that parent. A parent's email typed by a player waits for a coach with the roster toggle to approve it, and can never be the player's own. Wording for the lawyer before launch.
- While a player is held (a coach has marked him under 13 and no parent has agreed yet), the server keeps only a placeholder record. It deletes his check-ins, bullpens, velo and models. His game pitches stay under a random id that only the `minors` table links back to him: pseudonymised, not deleted. That is a question for the lawyer. Coaches' iPads keep their full copy and send it again when he's let go. Only a coach's approval marks a player under 13; a player's own claim changes nothing until then.
- A parent's deletion is final: the server refuses the child's records if an iPad sends them again, and coaches' iPads delete their copies at the next sync. The team's game pitches keep a stand-in id that leads back to nobody.
- `pc_team_active(team)` is the single lockout check, as specified.
- Opponents remain `teams` docs with `isOurs: false` (Plan 3 may promote them to a table).
- Affects D1, D2 and every later plan that names `team_members` or `team_id`.

**Build order (replaces the roadmap):**
1. Plan 0 Operate.
2. Plan 1 Foundation.
3. Plan 5 Offline game, with the A7 game-day pieces.
4. Plan 3, minimal coach portal and A8 onboarding.
5. Plan 2 Billing.
6. Plan 3 player portal and admin.
7. Plan 4 Uploads and stats.
8. Plan 6 Full 3D site.

The landing page and email capture ship with Plan 0.

## Change control

This spec is frozen once approved. New information becomes a numbered amendment stating which deliverables it affects, and Drew approves it. Checks are never weakened to make something pass.
