# PitchIQ site v2: build report (Nov 16, 2026, after round 2)

Branch `site/v2-alive`. Nothing was pushed to `main`, deployed, or changed in Supabase. Decisions and readings taken along the way are in `docs/SITE_V2_PROGRESS.md`.

## What was built
- **The film**, re-rendered three times (the last to put the strap back to rubber). 150 frames per set at 1920x1200 and 1080x1680, same keyframes, camera path and timing as the original 72-frame film.
- **The film's story, stops 1 to 6**, the hand-off (words slide off, panels come out from behind the watch) and the **playground**, all fed by one build-time engine run.
- **The at-bat** (four watch faces joined by a thread), **two wrists** (the split, Accept, one long or two short buzzes), **for programs** (three big numbers and three lanes that fill pitch by pitch).
- **Questions, contact, nav, footer.** Five reads, Inside the call, the old demo and the 3D field are removed.
- **Reduced motion** is a still, stacked version of every section. **Phone** (390 wide) is recomposed, not shrunk.

## Round 2 (the seven items)
1. **Film quality pass.** Titanium case instead of near-black, wider case and crystal bevels to catch the rim lights, soft gradient cards for reflections, stronger rim light, cleaner foil and screen. Test frames were tuned over four passes. **The strap is rubber**: my first pass of this round turned it into a metal bracelet, which was wrong; Drew corrected it and the film was rendered again with a matte dark rubber band (no polished links, gold pins or pin heads). It still flies in as segments and closes into one ribbed band. Old vs new at the same moments: `docs/site-v2-shots/rerender/rubber-*.jpg` (final) and `v3-*.jpg` (the metal-strap pass, superseded).
2. **Playground strap.** The strap now fades into the ground over the bottom of the frame as the playground comes up, so there is no hard edge when the scene scrolls away.
3. **Two wrists.** Both faces carry the film's call from the start. The old call stays up until the pulse arrives, then the new one replaces it; the e2e checks the faces are never blank. Three plain facts fill the space under the watches (one long buzz, two short, no link).
4. **Wording.** "He's sitting slider (47%)" now reads "He's probably looking for a slider. The engine's read of him: 47% likely." (`plainWhy` in `lib/story.ts`, tested). The same rewrite applies to the at-bat lines.
5. **Programs.** Seven cards became three big numbers and three lanes. One motion moment: the pitch count runs to 412 while pitches drop into the lanes one at a time. Coach / Player changes what sits beside each lane and whether the staff row shows.
6. **References.** Seen in Chrome in the Windows browser, which was logged into Instagram (you picked Browser 2 when I asked). All seven reels, Apple's watch pages and Linear. Notes and screenshots: `docs/site-v2-shots/references/`.
7. **Mobile LCP.** 4.2 s down to 2.8 s. GSAP and Lenis now load after the first paint, the engine after that; the fonts are cut to the glyphs, weights and widths the page uses (124 KB to 54 KB); the first film frame is no longer preloaded.

## Checks run (final code)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm test` | 54 tests, 54 pass |
| `npm run build` | compiled |
| `npm run e2e` (`node tests/site_e2e.js`) | 49 checks, all pass |

## Lighthouse (production build, localhost)
| Run | Performance | Accessibility | LCP | TBT | CLS |
|---|---|---|---|---|---|
| Mobile 1 to 5 | 95, 96, 95, 96, 95 | 100 | 2.8 s each | 60 to 80 ms | 0 |
| Mobile, final build (3 runs) | 95, 96, 96 | 100 | 2.8 s each | 60 to 70 ms | 0 |
| Desktop | 100 | 100 | 0.6 s | | 0 |

- The last row is the final build with the rubber-strap film.
- Before the last two fixes, one run in eight spiked to 4.1 s or 6.3 s when a script download landed just ahead of the recorded first paint. Both causes were fixed, and the five runs above came after. Five clean runs is the evidence; I would not promise it never recurs.
- LCP here is Lighthouse's simulated slow-4G figure. The observed first paint in those runs was about 0.33 s.

## The re-render
Commands (from `web/scripts/watch-render/`, Blender 5.3):
```
python make_screens.py
blender -b -P build_watch.py -- --set wide --out frames/wide --frames 150 --samples 768
blender -b -P build_watch.py -- --set wide --out frames/cut-wide --frames 150 --samples 768 --only 149 --alpha
blender -b -P build_watch.py -- --set tall --out frames/tall --frames 150 --samples 768
blender -b -P build_watch.py -- --set tall --out frames/cut-tall --frames 150 --samples 768 --only 149 --alpha
python encode.py --quality 84
```
- **Time** on this PC's RTX 5070 Ti (OptiX): 946 s for the wide set and 982 s for the tall set (final, rubber strap), about 6.5 s a frame. Encoding takes about a minute.
- **Weight:** wide 3.2 MB, tall 3.4 MB. Only every 8th frame loads with the page; the rest wait for load or the first scroll.
- **Ground color: still not exact in the shipped files.** The master frames are exactly `#0c0b0e` wherever nothing is drawn. Lossy WebP cannot hold that everywhere: of the edge points sampled on every frame, about 86% decode as exactly `#0c0b0e`, about 13% as `#0c0c0c`, and a handful next to a passing part are further off. The film fills the viewport, so no seam shows.
- Blender's pip module (`bpy`) is blocked by this PC's app-control policy, so the renders used the official Blender 5.3 portable build in `C:\Users\kindl\tools\blender`.
- How far it got: a titanium case with bright bevels on a matte rubber strap, with crisp screen text. It is not yet at Apple's level. The model is still simple shapes (a plain case, a strap made of flat segments), and that, more than light or materials, is what separates it from product photography.

## Scores after round 2 (my own, against the references)
| Section | Type | Color | Motion | Interactivity | Craft | Story | Phone |
|---|---|---|---|---|---|---|---|
| Film, stops 1 to 6 | 9 | 9 | 9 | n/a | 9 | 9 | 9 |
| Hand-off and playground | 9 | 9 | 9 | 9 | 9 | 9 | 9 |
| The at-bat | 9 | 9 | 9 | 8 | 9 | 9 | 9 |
| Two wrists | 9 | 9 | 9 | 9 | 9 | 9 | 8 |
| For programs | 9 | 9 | 9 | 8 | 9 | 9 | 9 |
| Questions, contact, footer | 9 | 9 | 8 | 8 | 9 | n/a | 9 |

Still under 9, so the "9 on every axis" bar is not fully met:
- **At-bat interactivity:** the mix chip opens low in the pinned view and can crowd the fine print.
- **Two wrists on a phone:** the two stacked watches need more than one screen, so the pulse and both faces are not all visible at once.
- **Programs interactivity:** hovering a lane only dims the others; there is nothing to open.
- **Questions and contact:** correct and tidy, but their only motion is the shared rise.
- Against Apple's pages the film is the gap, for the modelling reason above.

## Not verified
- **Safari, Firefox, a real phone, touch, real frame rate.** Everything ran in headless Chromium, plus the reference browsing in desktop Chrome. The glass refraction is Chromium-only by design; the blurred fallback was not looked at in another browser.
- **Vibration** on the Accept press: the call is made only on a press, but no device was there to feel it.
- **The reels** were sampled (a few frames each, no sound), with captions and the first screen of comments. Awwwards and Codrops were not opened.
- **The white dot** in the prototype recording: it sits at one fixed spot in every frame and nothing in the prototype's code draws it, so I read it as the recorder's cursor marker. I did not re-run the old recording script to prove it; the new recordings have no dot.
- **Screen readers** were not run; roles, labels and live regions are in place and Lighthouse accessibility is 100.
- **Three docs the first prompt listed are not in the repo** (color research, watch direction, the earlier site report), so they were not read.

## Look at these first
1. `docs/site-v2-shots/final/site-v2-desktop-scroll.mp4` and `site-v2-phone-scroll.mp4` (full scroll, new film)
2. `docs/site-v2-shots/rerender/rubber-wide-t71-old-vs-new.jpg` and `rubber-wide-t39-old-vs-new.jpg` (the film against the original)
3. `docs/site-v2-shots/build/round2/desktop-film-074.jpg` and `desktop-film-100.jpg` (the call; the playground with the strap fading out)
4. `docs/site-v2-shots/build/round2-states/desktop-wrists-1-one-watch.jpg`, `desktop-wrists-3-sent.jpg`, `desktop-wrists-4-changed-buzz.jpg`
5. `docs/site-v2-shots/build/round2-states/desktop-programs-filling.jpg` and `desktop-programs-player.jpg`
6. `docs/site-v2-shots/build/round2-states/desktop-pg-2-landed-3-2.jpg` (the reworded hitter line after a change)
7. `docs/site-v2-shots/build/round2/phone-film-074.jpg` and `round2-states/phone-programs-coach.jpg`
8. `docs/site-v2-shots/references/BOARD.md` (round 2 section)

## Left on this PC, not in the repo
- Rendered PNG masters: `web/scripts/watch-render/frames/` (final, rubber strap), `frames_metal/` (the superseded metal-strap pass) and `frames_v2/` (round 1). All gitignored; the last two can be deleted.
- An empty `C:\frames` folder from a mis-pathed render in round 1. Safe to delete.
- Blender portable in `C:\Users\kindl\tools\blender` and an Inter font copy in `C:\Users\kindl\tools\fonts`. The `fonttools` and `brotli` Python packages were installed to subset the fonts.
