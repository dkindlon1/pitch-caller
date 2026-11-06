# Invite emails and the 12-month retention sweep

Spec: "Billing and lockout" (data kept 12 months after a lapse, then deleted) and the invite flows of Plans 3 and 3b.
Built Nov 6, 2026, on main after the lapse/terms promote.

## Invite emails

- An invite made with an email address is now emailed as well as shown on the page:
  - a player invite (to the player, or for a player under 13 to the parent, worded for the parent);
  - a coach invite with an email;
  - the parent's email the coach approves on the staff page.
- The page says what happened: "We emailed it too", "Email isn't set up yet, so send this link yourself", or that
  the email didn't go through. The link on the page always works, so email is a convenience, not a dependency.
- Without `RESEND_API_KEY` nothing is sent (Drew's Resend setup is still to do).
- Tests: portal_e2e 4b and 6, shell_e2e 6, against a fake Resend.

## Retention sweep

- `public.pc_retention_sweep(dry)` (server key only) finds organizations locked more than 12 months (by
  `billing_changed_at`, the last billing change) and every lapse export older than 12 months. A dry run only
  reports. A real run deletes the exports, the teams (their records cascade) and the organization. Every run goes
  in `private.retention_log`.
- `GET /api/cron/retention` runs it. Vercel Cron calls it daily at 09:17 UTC (`web/vercel.json`) with
  `Authorization: Bearer $CRON_SECRET`.
  - Without `CRON_SECRET` it answers 503. A wrong secret gets 401.
  - **It deletes nothing until `RETENTION_DELETE=on`.** Until then it reports what's due in the response and logs.
  - When on, it removes the export files from storage first, then the rows. A storage failure leaves everything in
    place for the next day.
- A later billing event for a locked organization moves `billing_changed_at` forward, which only delays deletion.
- An organization that never paid (`pending`) isn't touched.
- Tests: rls_matrix section 23 (dry vs real, the one-month-locked organization untouched, logged); retention_e2e
  (503/401, report-only, then deleting rows and storage files). Both run in CI.

## For Drew

1. In Vercel, set `CRON_SECRET` to a long random string (Vercel sends it to the cron route itself). Leave
   `RETENTION_DELETE` unset until the Terms say 12 months and a lawyer has read them.
2. PROMOTE the `20261113000000_retention` migration once this is merged. The cron route answers 500 until then.
3. Resend (still deferred): until it's set up, invites show "send this link yourself".
