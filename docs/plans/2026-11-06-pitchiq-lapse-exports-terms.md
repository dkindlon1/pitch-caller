# Plan 2b and D15: lapse exports, and Terms acceptance

Spec: `docs/specs/2026-11-05-pitchiq-platform.md` ("Billing and lockout", D7, D15; A8 for children's data). Plan 2
(billing) left the lapse's exports and emails for this plan because they need an email service.

## Decisions

- **When.** A lapse is a webhook event that locks the organization (`invoice.payment_failed` on a renewal, or
  `customer.subscription.deleted`). The webhook answers Stripe first. The exports run straight after, through Next's
  `after()` (the route allows 300 s).
- **Who gets what** (`pc_lapse_plan`):
  - Each team's staff and the owner get the team file.
  - Each account linked to a pitcher gets his own. For a child under 13, that account is a parent's.
  - Removed teams are left out.
- **What's in it** (`pc_export_rows`):
  - **Player file:** his pitcher record, every record that names him, the games he pitched in, his uploads with their
    pitches, and his grade history.
  - **Team file:** the whole team, without any under-13 player's rows (A8). That includes the stand-in id his game
    pitches are kept under while he's held.
  - **Format:** one CSV per table (nested values as JSON; a value that starts like a spreadsheet formula gets a leading
    apostrophe so a spreadsheet won't run it), a README, and a one-page summary PDF for players. Zipped.
- **Where it's kept.** A private Supabase Storage bucket, `exports`. Only the service key reads it.
  - The email carries a 30-day signed link.
  - `/app/exports` lists a member's own exports and gives a fresh 10-minute link. Row-level security on `exports`
    lets a locked member read his own rows and nothing else.
- **Email.** Resend, through its HTTP API (`web/lib/email.ts`).
  - With no `RESEND_API_KEY`, nothing is sent and the export is marked `no_provider`. People can still download theirs
    from the site.
  - Until a domain is verified, Resend only sends from `onboarding@resend.dev`, and only to the Resend account's
    owner.
- **Once per lapse.** Exports are keyed by (team, lapse time, person, kind, pitcher). A replayed event does nothing,
  and a second run only fills gaps.
- **Retrying.** The super admin's organization page lists each lapse's files and emails. "Send the exports again"
  sends to anyone who was missed and retries failed or unsent emails with a fresh link. Both the view and the resend go
  in the audit log.
- **Unlock.** Unchanged from Plan 2: `invoice.paid` unlocks.
- **Terms (D15).**
  - `/terms` is a working draft (version `2026-11-06-draft`, shown on the page) that a lawyer reviews before launch.
    `/privacy` now covers the app as well as the waitlist.
  - Signing up needs the box ticked. The browser checks it, and so does the server.
  - The agreement is stored with the version and time (`legal_acceptances`, recorded with the server key, because a
    new account has no session until its email is confirmed).
  - Accounts made earlier are asked in the portal, and paying for an organization needs it first.
- **Local stack.** Supabase's storage service now runs in CI and in local tests (it was excluded before).

## Verified (Nov 6, output captured)

- **`rls_matrix_test.js`, sections 21 and 22: 329 checks pass.** They cover:
  - who gets what;
  - that a player's rows are only his, with a count that equals the database's;
  - that the team file leaves out children's rows;
  - server-only functions;
  - each person reading only his own exports, even while locked;
  - the admin view and resend, both audited;
  - Terms acceptance, which only the server or the account itself can record, and each account reads only its own.
- **`billing_e2e.js`: 52 checks pass**, against the real local Supabase, a fake Stripe and a fake Resend.
  - A failed renewal builds and records five exports: three coaches' team files and one player file on Varsity, plus
    the owner's for each of the other two teams.
  - All five are emailed.
  - The player's zip has exactly his 15 rows, matching the database, plus a PDF and nothing of a teammate's.
  - The coach's zip has the whole team.
  - Row-level security denies both of them the team's data while locked.
  - The player downloads his file from `/app/exports`; another person's export id gets nothing.
  - A replayed failure sends nothing twice.
  - The admin's resend retries just the one failed email.
  - Cancelling is a new lapse and sends everything again.
- **`shell_e2e.js`, section 11.** Sign-up without the box makes no account. With it, the agreement is stored as
  sign-up with its version. An older account is asked in the portal, and agreeing stores it.
- **`export_files.test.ts`** (CSV quoting and formula guard, summary arithmetic, zip contents and row counts), with
  `npm test` at 47 passing, a clean typecheck, and the build passing.
- **The other end-to-end tests:** portal, player/admin, uploads and landing pass.

## Not verified yet / not built

- **Real emails.** There's no Resend account yet, so the lapse emails have only gone to the fake inbox. Drew creates
  the account, verifies a domain, and sets `RESEND_API_KEY` and `EMAIL_FROM` in Vercel.
- **Deleting after 12 months.** The Privacy Policy says locked data and exports are deleted after 12 months, but there
  is no deletion job yet. It needs Drew's go-ahead, since it deletes teams' data.
- **A real Stripe lapse in the sandbox** (test clock or declined card `4000000000000341`) has not been run. The
  fake-Stripe test covers the same events.
- **Legal text.** The Terms and Privacy wording is a draft for the lawyer, and the pages give no contact email yet.
- **`offline_game_e2e` flake.** Its "update takes over once the game is over" check fails about 1 run in 3 locally.
  The waiting service worker sometimes isn't activated within a minute even after it's told to skip waiting. The page
  now asks again every 3 seconds, which hasn't fixed it. CI has passed this check. Not caused by this plan.

## Done when

Every check above passes in CI, both migrations are promoted, and a real lapse email has arrived through Resend.
