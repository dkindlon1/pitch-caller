# Plan 2: billing (Stripe, per team per year)

Spec: `docs/specs/2026-11-05-pitchiq-platform.md` ("Billing and lockout", A5; A12 proposed below). Build order step 5,
after the coach portal (Plan 3a). The lapse exports and their emails (D7's first half) are Plan 2b: they need Resend.

**Goal.** An owner signs up, names his organization and its teams, pays by card in Stripe Checkout, and his teams switch
on. He adds a team (charged now for the rest of the year) or removes one (it stays until the paid year ends, no
refund). A failed renewal locks every team; paying unlocks them. Every state change comes from Stripe's webhook,
applied once, in order.

## Decisions

- **The webhook lives in the website** (`/api/stripe/webhook`), not a Supabase Edge Function: one deploy, the same
  Stripe library for the calls and the signature, and the database change is one service-role call
  (`pc_billing_event`) that records the event and applies it in one transaction. A12.
- **One function owns billing state.** `pc_billing_event(id, type, created, action)` (service role only):
  - Applied once: the event id goes in `private.stripe_events` in the same transaction; a replay answers `duplicate`.
  - In order (A5): a lapse or unlock changes only `organizations.billing_status`, and an event older than
    `billing_changed_at` is `stale`. The subscription's own state (quantity, the paid year's end, Stripe's status)
    has its own clock, so a late quantity can't undo a newer one either.
  - Seats: the paid quantity switches on pending teams, oldest first, never more than were paid for. An unlock never
    touches a removed team (A5).
  - The organization is found by the id we put in the metadata, else its subscription, else its customer. Events of
    another subscription are ignored, except a new subscription after the old one was cancelled (coming back). A
    second Checkout paid while the first subscription is live is logged as `second_subscription` (refund by hand).
- **Stripe's shapes in one place.** `web/lib/stripe_events.ts` turns a verified event into the action, for API version
  `2026-09-30.endive` (pinned, A5): the period end is on the subscription item, an invoice names its subscription
  under `parent.subscription_details`.
- **Adding a team** is charged now (`proration_behavior=always_invoice`) and only goes through if the card pays
  (`payment_behavior=pending_if_incomplete`). A declined card leaves that team waiting and the rest of the organization
  as it was: an `invoice.payment_failed` for a subscription update doesn't lock. Any other failed payment (the yearly
  renewal) locks, as the spec says. A12.
- **Removing a team** is the owner's own change (`pc_end_team`): a team never paid for goes at once; an active one is
  `ending` until the paid year ends, and Stripe's quantity drops with no proration. "Keep this team" undoes it before
  the year ends. The last active team can't be removed: to stop altogether the owner cancels in Stripe's billing
  portal. A12.
- **The billing portal** is for the card, invoices and cancelling. Its configuration must not allow quantity changes
  (A5): set in the Stripe dashboard, passed as `STRIPE_PORTAL_CONFIG`.
- **The first-year coupon** (`STRIPE_COUPON_ID`, duration `once`) goes on an organization's first Checkout only.
- **Tested without Stripe.** `web/tests/fake_stripe.js` answers the five API calls the website makes, serves a Checkout
  page, and signs its webhooks with the real library's test signer, so the website verifies them as it would Stripe's.
  It's only used with a `sk_test_` key and `STRIPE_FAKE_API` set. The same flows against Stripe's test mode (card
  4242, a test clock) need Drew's test keys: the checklist below.

> **Status, Nov 5.** Tasks 1 to 6 done on `pitchiq-platform`: migration `20261108000000_billing.sql` (checks in
> `rls_matrix_test.js` section 17), `web/lib/stripe_events.ts` (unit tests), `web/lib/billing.ts`, the webhook,
> `/app/new` and `/app/billing`, and `web/tests/billing_e2e.js` against a real local Supabase and the fake Stripe.
> The migration needs a PROMOTE. Not done: the real Stripe test-mode run (Drew's keys), the lapse exports and emails
> (Plan 2b, Resend), the demo team.

## Tasks

1. **Migration** `20261108000000_billing.sql`: the subscription columns on `organizations`, `private.stripe_events`,
   `pc_billing_event`, `pc_billing_ids` (service role), `pc_billing_info`, `pc_end_team`, `pc_keep_team` (owner).
2. **Event mapping** `web/lib/stripe_events.ts` + `stripe_events.test.ts`.
3. **Stripe calls** `web/lib/billing.ts`: Checkout, billing portal, set quantity; the pinned API version.
4. **Webhook** `web/app/api/stripe/webhook/route.ts`: signature on the raw body, 500 on a database failure so Stripe
   retries.
5. **Screens**: `/app/new` (organization, level, teams, the owner's role on the first team, then Checkout) and
   `/app/billing` (state, pay, card and invoices, teams: add, remove, keep, pay for a waiting team; "activating"
   after Checkout until the webhook lands). `/app` links to both.
6. **Tests**: section 17 of `rls_matrix_test.js` (who can call what, replays, stale events, seats, removal, lapse,
   other subscriptions, coming back) and `web/tests/billing_e2e.js` (the whole flow in a browser, D5 and D6's
   checks against the fake). In CI with the other real-Supabase checks.

## Drew's Stripe setup (test mode first)

1. A product "PitchIQ Team" with one yearly price per team (the amount is Drew's call) → `STRIPE_PRICE_ID`.
2. A coupon for the first year, duration "once" → `STRIPE_COUPON_ID`.
3. A webhook endpoint `https://<site>/api/stripe/webhook`, API version `2026-09-30.endive`, events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → its signing
   secret is `STRIPE_WEBHOOK_SECRET`.
4. A billing portal configuration: update the card, invoice history, cancel at the end of the period; no plan or
   quantity changes → `STRIPE_PORTAL_CONFIG`.
5. Retries: Smart Retries on; after the last retry fails, cancel the subscription.
6. In Vercel: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_COUPON_ID`, `STRIPE_PORTAL_CONFIG`,
   `SITE_URL`. Drew types the keys in; they never go in the repo or a chat.
   **Status, Nov 6 (test mode, Stripe sandbox "Frigate Cooling Company"):** steps 1–5 are done and read back from
   Stripe:
   - Price `price_1UYmKhIRKWnkcO8trXJP5FAx` ($299 a year).
   - Coupon `db0PGJUw` (25% off, once).
   - Portal `bpc_1UYmLjIRKWnkcO8tvUgBFDs8`.
   - Webhook "PitchIQ billing" to `https://pitchiq-rouge.vercel.app/api/stripe/webhook`: 7 events, `2026-09-30.endive`.
   - Smart Retries on (8 tries within 2 weeks), and the subscription is cancelled after the last failed retry. These
     were the account's defaults. Drew will revisit retries before real customers.

   Step 6 (the Vercel settings) is Drew's. Before taking real payments, the account's public business name should
   say PitchIQ.
7. Then run D5 and D6 for real: sign up and pay with 4242, replay the event from the dashboard, add and remove a team,
   and a test clock past the year's end.

## Known gaps

- Two Checkouts opened in two tabs and both paid make two subscriptions; the second is logged (`second_subscription`)
  and needs a refund by hand. Checkout sessions expire after 24 hours.
- After a lapse, exports and emails (D7) are Plan 2b. Until then a lapse only locks.

## Done when

Every task's test passes locally and in CI, and the real Stripe test-mode run (setup step 7) passes with Drew's keys.
