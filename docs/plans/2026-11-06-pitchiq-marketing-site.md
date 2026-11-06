# Plan 6: the 3D marketing site

Spec: `docs/specs/2026-11-05-pitchiq-platform.md` ("Marketing site direction", "Screens: Marketing site", D14) and
amendment A13. Build order: last, after Plan 4.

**Goal.** The home page shows the product the way it works: a real-seam ball flies the called pitch into the zone, a
visitor calls a game with the app's own engine, the iPad's live screen, and a movement plot as a 3D cloud. Everything
3D has a flat version that the server renders first and that reduced motion, Data Saver and no-WebGL visitors keep.

## Decisions

- **three.js directly** (A13), two scenes, each its own module:
  - `app/components/pitch3d.ts`, the hero. Catcher's view (a right-handed hitter on the left, as the app draws the
    zone). A right-hander's release point, with flights bent by the movement in inches and gravity. Each earlier
    pitch of the at-bat stays as a trail, and the called spot is ringed in the pitch's color. The canvas is half
    again as big as the flat zone, and the field of view puts the 3D zone where the flat one was, so the swap
    doesn't jump. It stops drawing when off screen or in a background tab.
  - `app/components/cloud3d.ts`, the movement cloud. 120 sample pitches, with Break and Velocity views to turn
    between, drag to turn, and tick labels projected from 3D.
- **When 3D loads** (`can3d.ts`): after the window's load event and an idle callback; only with WebGL, without
  `prefers-reduced-motion` and without Data Saver. The cloud also waits until its section is within 400 px of the
  screen.
- **The live demo** (`LiveDemo.tsx`, `lib/demo.ts`):
  - `lib/engine.js` and `engine_data.json` are byte-for-byte copies of the app's (checked in `docs.test.ts`),
    loaded when the section nears the screen.
  - The pitcher is the app's sample starter, against the app's nine-man sample lineup at college D3.
  - The game rules are the app's: walks, hit by pitch, fouls with two strikes, strikeouts, outs and innings. The
    reason uses the app's wording ("Picked at random from the mix…"), plus the next two options in the mix and the
    3-0/3-1 rule.
  - Left-handed hitters get the mirrored zone. The result buttons stay in place from call to call.
- **The iPad** is a screenshot of the real live screen (`public/marketing/ipad-live.png`) in CSS 3D. It settles as it
  scrolls in where `animation-timeline: view()` is supported, and stays still otherwise.
- **New sections**:
  - The problem.
  - How it works (before, during and after the game).
  - The demo.
  - The dugout and iPad section.
  - Who uses it (coaches; pitchers and parents).
  - TrackMan and Rapsodo files, with the cloud.
  - A pricing teaser that publishes no price. Its button goes to the waitlist.

  Every claim describes something already built (Plans 1–4).
- **Speed**:
  - The portal's CSS moved to `app/portal.css`, loaded only on the signed-in routes, so the home page inlines only
    its own CSS.
  - The sections below the first screen use `content-visibility: auto`.

## Verified (run on Nov 6, output captured)

- `node web/tests/landing_e2e.js` passes every check, including the new section 2, which runs with SwiftShader
  WebGL:
  - The 3D pitch takes over and draws (frames counted), the HUD names the call on screen, and drawing stops off
    screen.
  - The demo runs `engine.js` 0.7c, walks, strikes out, mirrors for a lefty, and refuses a chase pitch at 3-0 with
    the reason saying so. Its buttons don't move, and Start over works.
  - The iPad image loads.
  - The cloud turns to Velocity.
  - There is no sideways scroll at 390 px with the 3D on.
  - With reduced motion, no canvas loads anywhere and the flat zone and plot stay.
- `npm test` passes all 39 tests, including the `demo.test.ts` engine and game-rule tests, and `npm run typecheck`
  is clean.
- After the CSS split, `shell_e2e`, `portal_e2e`, `billing_e2e`, `player_admin_e2e`, `uploads_e2e` and
  `offline_game_e2e` all pass against local Supabase, and the portal screenshots still show their styles.
- **Lighthouse, mobile**, local `next start`, 5 runs each:
  - **This branch, simulated throttling (the default):**

    | Metric | Result |
    | --- | --- |
    | Performance | 86 to 93 |
    | Accessibility, best practices, SEO | 100 |
    | CLS | 0 |
    | TBT | 230 to 420 ms |
    | LCP (the h1) | 2.0 to 3.0 s, median 2.9 s |

  - **This branch, applied throttling:** LCP 1.0 s, CLS 0.044 (the waitlist form moves when the condensed font
    arrives), and performance 92 to 93.
  - **The live site's code (origin/main), same simulated setup:** LCP 2.9 to 3.0 s in all 5 runs, so the 2.3 s
    baseline recorded earlier was a single lucky run. Plan 6 didn't make LCP worse. TBT went up by about 150 ms, from
    the 3D and the larger page.

## Not verified yet

- **LCP ≤ 2.5 s under simulated throttling.** Neither this branch nor main meets it reliably. Locally the
  JavaScript arrives before the first paint, so Lighthouse counts all of it (about 150 KB, mostly React and Next)
  and all six web fonts (about 100 KB) toward the h1. Options for Drew:
  - Drop one or two font weights (Barlow 600, Barlow Condensed 700). That saves roughly 15 KB each. Measured with
    both dropped, 5 runs: LCP 2.1 to 2.8 s, median 2.6 s. That helps but doesn't settle it, and it changes the type,
    so it's left as it is.
  - Accept the applied-throttling and field numbers.

  The real check is PageSpeed Insights on the deployed site, once this is merged.
- **Real devices** (spike S5): frame rate on an iPad and a mid-range phone.
- **Visual sign-off is Drew's** (D14). Open items:
  - Done Nov 6: the app is PitchIQ, and the iPad screenshot was retaken with the new header.
  - The hero's at-bat reasons come from v0.8, while the demo's come from v0.7c (A13).

## Done when

The checks above pass in CI, Drew signs off the look, and Lighthouse on the deployed site meets the thresholds.
