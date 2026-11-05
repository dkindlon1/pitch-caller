# PitchIQ Operate Implementation Plan (Plan 0)

> **For agentic workers:** Execute with the subagent-driven-development skill (recommended) or inline in one session; implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before any product code changes: a prod database, CI that runs every test on every push, a safe path to promote migrations, error tracking, working email, and a live landing page that collects spring sign-ups.

**Architecture:**
- Two Supabase projects: dev (`fpoiqnswdmyprbyhgukq`) and a new prod project.
- A private GitHub repo with Actions.
- One Next.js app on Vercel: `web/`, scaffolded here at its smallest. Plan 1 Task 9 adds auth to it.
- Resend handles all email, including Supabase Auth's email over custom SMTP.

**Tech Stack:**
- GitHub Actions
- Supabase CLI
- Vercel
- Sentry (free tier)
- Resend
- Plausible, or self-hosted Umami (cookieless analytics)

**Spec:** `docs/specs/2026-11-05-pitchiq-platform.md`, amendments A9 and A10 (landing-page part).

## Global Constraints

**Secrets**
- No secrets in the repo.
- CI secrets live in GitHub encrypted secrets.
- Runtime secrets live in Vercel env vars and Supabase function secrets.

**Prod**
- Prod is changed only by the "promote" workflow, never by hand or by an agent applying a migration directly.
- Prod starts on the Supabase free tier. Upgrade to Pro, which brings daily backups, before the first paying customer.

**Landing page**
- Analytics are cookieless.
- There is no tracking script under `/app`.
- No testimonials, logos or numbers that aren't real.

**Domain and trademark**
- The domain is bought only after Drew has run the trademark clearance (Task 1).
- The trademark check is Drew's or a lawyer's. Claude doesn't give legal advice.

## Review Focus

1. **A migration that passes on dev but fails on prod.**
   - Expected: the promote workflow stops, and prod is unchanged.
   - Pinned by: Task 3, `promote_dry_run`.
2. **Bot spam on the waitlist form.**
   - Expected: the form rate-limits by IP hash, requires a honeypot field to be empty, and stores no IP in plain text.
   - Pinned by: Task 6, `waitlist_rate_limit`.
3. **Signup or invite emails landing in spam.**
   - Expected: SPF, DKIM and DMARC all pass on a real Gmail delivery.
   - Pinned by: Task 5, step 3.
4. **A CI run green while SQL tests silently skip.**
   - Expected: each test script exits non-zero on 0 checks run.
   - Pinned by: Task 2, `ci_fails_on_empty`.
5. **The landing page slow on a phone over LTE.**
   - Expected: mobile Lighthouse performance ≥ 90 and LCP ≤ 2.5 s. This page has no 3D.
   - Pinned by: Task 6, step 4.

---

### Task 1: Name and domain (Drew)

- [ ] **Step 1:** Run a clearance search for "PitchIQ" in classes 9 and 42 (software).
  - Do it yourself in USPTO search, or with a trademark lawyer.
  - Known hits: an abandoned 2025 PITCHIQ filing for baseball software, a soccer prediction app, and a Showpad feature.
  - Record the result in `docs/plans/2026-11-05-pitchiq-operate.status.md`.
- [ ] **Step 2:** If the name is clear, buy a domain. Candidates, in order: `pitchiq.com`, `pitchiqbaseball.com`, `getpitchiq.com`. If it isn't clear, stop and pick a name before going further.

### Task 2: Private GitHub repo and CI

**Files:**
- `.github/workflows/ci.yml`
- `scripts/test-sql.sh`

- [ ] **Step 1:** Create a private repo and push `main`. **Needs Drew's yes**, since he earlier said no GitHub push yet.
- [ ] **Step 2:** Make the SQL test scripts fail on zero checks. Every `supabase/test/*_test.js` exits 1 when its check count is 0 (`ci_fails_on_empty`). Verify by running one with an empty filter. Expected: exit code 1.
- [ ] **Step 3:** Write `ci.yml`, which runs on push and pull requests:
  - a Postgres 16 service, then `scripts/test-sql.sh` (applies the auth stub plus every migration, then runs every SQL test)
  - Node: `app/smoke.js` and `app/parity.js`
  - Python: `tests.py`
  - `web/`: `npm ci`, `npm run typecheck`, `npm run build`
- [ ] **Step 4:** Push. Expected: the Actions run is green, and the log shows non-zero check counts for each SQL test. Paste the run URL into the status file.

### Task 3: Prod project and migration promotion

**Files:**
- `.github/workflows/promote.yml`
- `supabase/config.toml` (via `supabase init`)

- [ ] **Step 1:** Create the Supabase project `pitchiq-prod` (us-east-1, free tier for now). **Drew confirms the org and the cost.**
- [ ] **Step 2:** `promote.yml`:
  - Manual trigger, guarded by GitHub's `production` environment protection rule, so Drew approves each run.
  - `supabase link` to prod, then `supabase db push --dry-run`, then `supabase db push`.
  - Fails if the dry run reports anything unexpected.
- [ ] **Step 3:** Run it with the current migrations. Expected: prod's `list_tables` matches dev, and the security advisors on prod show no RLS warnings (`promote_dry_run`).
- [ ] **Step 4:** In both projects, set Auth "Confirm email" on and the site URL to the domain. Record it in the status file.

### Task 4: Error tracking

- [ ] **Step 1:** Create Sentry projects for `web` and `ipad-app`.
- [ ] **Step 2:** Wire up `@sentry/nextjs` in `web/`, and the browser SDK in the iPad app with offline event buffering. Strip PII: no player names and no email addresses in events (`beforeSend` scrubs the `name`, `email` and `doc` fields).
- [ ] **Step 3:** Throw a test error from each. Expected: both errors show up in Sentry, and neither payload contains a name or email.

### Task 5: Email

- [ ] **Step 1:** Add the domain to Resend and create the SPF, DKIM and DMARC (`p=quarantine`) DNS records.
- [ ] **Step 2:** Point Supabase Auth custom SMTP at Resend in both projects.
- [ ] **Step 3:** Send a signup confirmation to a Gmail address. Expected: it lands in the inbox, and "Show original" shows SPF, DKIM and DMARC as `PASS`.

### Task 6: Landing page with spring sign-up

**Files:**
- `web/app/(marketing)/page.tsx`
- `web/app/api/waitlist/route.ts`
- `supabase/migrations/<ts>_waitlist.sql`
- `web/tests/landing.spec.ts`

**Interfaces:**
- Table: `waitlist(id, email citext unique, role text check in ('coach','player','parent','other'), level text, created_at, ip_hash text)`. RLS on, no client grants.
- Function: `pc_join_waitlist(email text, role text, level text, ip_hash text) returns text`, executable only by the service role. It returns `'ok' | 'duplicate' | 'rate_limited'`, and allows at most 5 submissions per `ip_hash` per hour.

**Content (from the A10 messaging brief):**
- Headline promise: every call comes with its reason.
- One live example call with its reason.
- Who it's for: high school, travel, college.
- The founder line: a college pitcher built it.
- A "Get notified for spring" form.
- Links to About and FAQ pages, which can be stubs.

**Steps:**
- [ ] **Step 1:** Write a failing Playwright test with these cases:
  - Submit an email: the page shows "You're on the list".
  - The same email again: shows "You're already on the list".
  - A sixth submission from the same IP within the hour: shows "Try again later" (`waitlist_rate_limit`).
  - Honeypot field filled: nothing is stored.
- [ ] **Step 2:** Implement. The route hashes the IP with a server secret and calls the function with the service key, on the server side only.
- [ ] **Step 3:** Run the tests. Expected: PASS.
- [ ] **Step 4:** Deploy to Vercel on the domain. Run mobile Lighthouse. Expected: performance ≥ 90, LCP ≤ 2.5 s, CLS < 0.1. Add cookieless analytics, and confirm in the browser network tab that no analytics request fires under `/app`.

## End of Plan 0 check

Report each item as **Verified** (with output) or **Not verified** (with the reason):
- CI green on a fresh push
- Promote run applied to prod, with clean advisors
- Sentry test events arrived with no PII
- Gmail shows SPF, DKIM and DMARC all passing
- Landing page live, with Lighthouse numbers and a test sign-up stored in prod
