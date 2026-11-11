# PitchIQ web

The public site, and the signed-in shell: sign-in, your teams, and joining a
team by invite link (Plan 1, Task 9). Next.js 16 App Router on the Pitch Caller design system (Barlow, Barlow
Condensed, JetBrains Mono), no tracking.

- `app/(marketing)/`: the public site, with its own layout and styles (`marketing.css`): black and white with seam red,
  glass over the 3D field, Instrument Sans. The hero (`_components/heroScene.ts`, Three.js) throws a real engine at-bat
  (`content/at-bat.ts`) while the glass call panel shows each call; GSAP + Lenis drive the scroll; `ContactForm.tsx`
  posts to `app/api/contact` (email through Resend to `CONTACT_TO`). Checked by `tests/site_e2e.js`.
- `app/api/waitlist/route.ts` + `lib/waitlist.ts`: the sign-up API. It writes only through `public.pc_join_waitlist` with the service key.
- `app/privacy/page.tsx`: what the waitlist keeps.
- `proxy.ts`: refreshes the Supabase session and sends signed-out visitors from `/app` to `/login`.
- `app/login`: sign in, or make an account (asks the birth month and year first; under 13, no account is made).
- `app/app`: one card per team from `pc_my_teams()` (teams waiting for billing say "Not active"), and the organizations you own.
- `app/join/[token]`: an invite link. Signed out, it asks the age question before anything else; a player under 13 gives a
  parent's email and the invite moves to that parent (`pc_invite_to_parent`, called with the service key in
  `lib/supabase/admin.ts`), with nothing of the child's kept. Signed in, it shows the team and role and accepts; a parent
  accepting for a child gives consent in the same step. The age and consent wording is for the lawyer before launch.
- `lib/supabase/server.ts`: the per-request client acting as the signed-in user (row level security decides what it sees).

Settings are listed in `.env.example`. The signed-in pages read `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` at request time.

## Commands (from `web/`)

    npm ci
    npm run dev          # http://localhost:3000
    npm run typecheck
    npm test             # waitlist and age logic (node's test runner)
    npm run build

End to end, from the repo root after a build (the root `npm ci` too):

    PGURL=postgresql://postgres@localhost:5432/postgres node web/tests/landing_e2e.js    # a local Postgres
    npx -y supabase@2.122.1 start && node web/tests/shell_e2e.js                         # a real local Supabase (Docker)

`shell_e2e.js` resets the local Supabase database before it runs and refuses to run against anything but a local stack.
