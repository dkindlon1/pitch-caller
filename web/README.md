# PitchIQ web

The public landing page and spring waitlist (Plan 0, Task 6 in `docs/plans/2026-11-05-pitchiq-operate.md`).
Next.js 16 App Router, one typeface (Saira, the app's own), no tracking.

- `app/page.tsx`: the page. The hero's call panel plays a real at-bat from the engine (`content/at-bat.ts` says where it came from).
- `app/api/waitlist/route.ts` + `lib/waitlist.ts`: the sign-up API. It writes only through `public.pc_join_waitlist`
  (`supabase/migrations/20261105180000_waitlist.sql`) with the service key; settings are in `.env.example`.
- `app/privacy/page.tsx`: what the waitlist keeps.

## Commands (from `web/`)

    npm ci
    npm run dev          # http://localhost:3000; the form says sign-ups aren't open unless .env.local has the three settings
    npm run typecheck
    npm test             # waitlist logic (node's test runner)
    npm run build

End to end, from the repo root after a build (needs a local Postgres and the root `npm ci`):

    PGURL=postgresql://postgres@localhost:5432/postgres node web/tests/landing_e2e.js
