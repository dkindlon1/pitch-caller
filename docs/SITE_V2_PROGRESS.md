# Site v2 progress

Branch `site/v2-alive` (from `site/watch-redesign`, c6cb854). Plan: `docs/PLAN_site_v2_2026-11-16.md` (revision 2). Run ledger: `.claude/run-ledger.md` (gitignored).

## Done before the full build
- Phase 0 and 1 (Nov 16): film shots, three directions, palette board. `docs/site-v2-shots/phase0/`, `docs/site-v2-directions/`.
- Direction chosen: the film tells the call, liquid glass, Floodlight colors. Plan revision 2 with the motion prototype of stops 4 to 6 and the hand-off.
- Drew's decisions (Nov 16): prototype feel approved; Archivo headlines, Hanken Grotesk body; word match option A; remove Five reads and Inside the call; drop the 3D field from the at-bat.

## Full build (Nov 16)
Built, in the plan's order:
1. Lenis on the GSAP ticker (`_components/Smooth.tsx`). The film scrubs and rests with it running (e2e check).
2. Tokens and fonts: every color, type size, glass value, duration and easing is a CSS variable on `.pq` in `app/(marketing)/site.css`; the GSAP code reads the `--m-*` values through `_components/motion.ts`. Archivo and Hanken Grotesk self-hosted.
3. The film overlay, stops 1 to 6 (`_components/Film.tsx`), with the build-time engine run (`lib/story.ts`, `lib/story_server.ts`) and its test (`lib/story.test.ts`).
4. The hand-off and the playground (`_components/Playground.tsx`), amendments 1 to 4.
5. The at-bat, two wrists, programs (`AtBat.tsx`, `TwoWrists.tsx`, `Programs.tsx`, shared `Watch.tsx`).
6. Questions, contact, nav, footer.
7. Film re-rendered: 150 frames, 1920x1200 and 1080x1680 (`web/scripts/watch-render/`).

How each amendment was handled:
1. One source of truth: `weigh()` in `lib/story.ts` makes both the film's chips and the playground's rows. The page calls it once at build time; the build throws if the top group is no longer "Fastball, outside". The playground's rows are the same groups, and the top row opens into "low and outside 26%" and "high and outside 16%".
2. The white dot: it sits at the same viewport position (50% across, 80% down) in every prototype frame while the watch moves under it, and nothing in the prototype's code draws it. It is the recording script's cursor marker, not part of the page. The new recordings have none.
3. The hand-off: the small things leave, then FASTBALL slides off the left edge and OUTSIDE off the right, letter by letter at full opacity, and only then the panels come out from behind the watch (a cut-out of the last frame sits above them on wide screens).
4. Decision chips: distance from the watch tracks share, so the likeliest call sits closest, and the stop's copy says so.
5. Stops 1 to 3: ledger rows wait as faint slots and light up one at a time; the row before dims. Stop 3's statement sits lower left.
6. The bottom half: each section has its motion moment (the thread, the split and buzz, the outing filling in).

Readings I took without asking:
- The playground's watch shows the leading group at its most likely spot (the fine print says so). The single most likely exact call can sit in a different group, which read as a contradiction next to the rows.
- A hitter control ships as "Same side / Opposite": it drives the engine's real `same_side` input.
- The at-bat's per-pitch mixes are the captured at-bat replayed through the engine at build time (`atBat()` in `lib/story_server.ts`); the section's fine print says the results were picked by hand.
- Pitch types in the programs panel are told apart by blue, pale blue and chalk plus their names, not by a third hue.
- The old "Call a game yourself" demo is removed: the plan's page list has the playground in its place.
- `npm run e2e` was `playwright test` with no config and no tests; it now runs `node tests/site_e2e.js`, which was rewritten for the v2 page.
- `_components/field.ts` is kept only because `web/render/insideScene.ts` (old render tooling) imports it; the page does not load it. The old sections' media under `web/public/media/film/{inside,flyover,atbat}` is left in place and unused.

References: `docs/site-v2-shots/references/BOARD.md`. Chrome had two browsers connected and none selected, so the board is text only (web search), with no screenshots or read-off colors. Ideas taken: two quiet colors and one accent, the accent kept off headlines (reel comments); frames drawn to a canvas rather than swapped images (scroll-scrub examples); recompose for phones rather than shrink.

## Not in the repo
`docs/RESEARCH_color_schemes_2026-11-16.md`, `docs/WEBSITE_DIRECTION_watch_2026-11-15.md` and `docs/BUILD_site_watch_REPORT.md` were never committed on any branch. The plan and the prototype were the working spec.
