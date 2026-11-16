# PitchIQ site v2: build report (Nov 16, 2026)

Branch `site/v2-alive`. Nothing was pushed to `main`, deployed, or changed in Supabase. Decisions and readings taken along the way are in `docs/SITE_V2_PROGRESS.md`.

## What was built
- **The film, re-rendered.** 150 frames per set at 1920x1200 and 1080x1680 (was 72 at 1280 and 720), same keyframes, camera path and timing.
- **The film's story, stops 1 to 6**, over the frames: the ledger of inputs arriving row by row, the candidate calls leaving it (closer to the watch means more of the mix), four falling away, FASTBALL / OUTSIDE filling the width.
- **The hand-off and the playground.** The words slide off to the sides, then the panels come out from behind the watch. The playground opens on the film's exact engine run and re-weighs in the browser.
- **The at-bat** (four watch faces joined by a thread), **two wrists** (the split, Accept, one long or two short buzzes), **for programs** (the outing filling in, Coach / Player).
- **Questions, contact, nav, footer**, restyled. Five reads, Inside the call, the old demo and the 3D field are removed.
- **Reduced motion** is a still, stacked version of every section. **Phone** (390 wide) is recomposed: chips stack, the call words go above and below the watch, the at-bat becomes a stack with the thread down the left edge.

## Checks run (final code)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm test` | 54 tests, 54 pass (3 are the story/playground agreement tests in `lib/story.test.ts`) |
| `npm run build` | compiled; the page prerenders with the build-time engine run |
| `npm run e2e` (`node tests/site_e2e.js`) | 47 checks, all pass |

The agreement test and the e2e both confirm: the film's chip, the sentence under the call and the playground's first row all say Fastball, outside 42%, and that row opens into low and outside 26% plus high and outside 16%.

## Lighthouse (production build, localhost)
| Run | Performance | Accessibility | LCP | TBT | CLS |
|---|---|---|---|---|---|
| Mobile 1 | 85 | 100 | 4.2 s | 100 ms | 0 |
| Mobile 2 | 86 | 100 | 4.2 s | 100 ms | 0 |
| Mobile 3 | 86 | 100 | 4.2 s | 100 ms | 0 |
| Desktop | 99 | 100 | 0.8 s | 40 ms | 0 |

Mobile median 86 (budget 80), accessibility 100, no layout shift. These runs were on the build one CSS-only change before the final commit (the phone reduced-motion layout). The mobile LCP element is the headline; 4.2 s is the weak number here.

## The re-render
Commands (from `web/scripts/watch-render/`, Blender 5.3):
```
python make_screens.py
blender -b -P build_watch.py -- --set wide --out frames/wide --frames 150 --samples 768
blender -b -P build_watch.py -- --set tall --out frames/tall --frames 150 --samples 768
blender -b -P build_watch.py -- --set wide --out frames/cut-wide --frames 150 --samples 768 --only 149 --alpha
blender -b -P build_watch.py -- --set tall --out frames/cut-tall --frames 150 --samples 768 --only 149 --alpha
python encode.py --quality 84
```
- **Time** on this PC's RTX 5070 Ti (OptiX): wide about 18 minutes, tall about 15.5 minutes, roughly 6 to 7 seconds a frame. Encoding takes about a minute.
- **What changed:** GPU rendering at 768 samples with OpenImageDenoise; a studio HDRI (Poly Haven `studio_small_09`, CC0) for reflections on top of the key, rim and fill strips; brushed-metal materials with anisotropy and fine grain; real refracting glass for the crystal; strap links with a polished centre, shut lines and slotted pin heads; the screen texture drawn three times larger.
- **Old vs new, same moments:** `docs/site-v2-shots/rerender/` (six wide and two tall side-by-sides, rendered at 72 frames so the moments match exactly).
- **Weight:** wide 4.1 MB, tall 4.4 MB for 150 frames each. Only every 8th frame loads with the page; the rest wait for load or the first scroll.
- **Ground color: not exact in the shipped files.** The master frames are flattened to exactly `#0c0b0e` wherever nothing is drawn. Lossy WebP cannot hold that value everywhere: of the edge points sampled on every frame, about 86% decode as exactly `#0c0b0e` and about 13% as `#0c0c0c` (one or two levels off in one channel); a handful next to a passing part are further off. The film fills the whole viewport, so this does not show as a seam, but "exactly `#0c0b0e` on every frame" is not met. Lossless frames would meet it at several times the weight.
- Blender's pip module (`bpy`) is blocked by this PC's app-control policy, so the renders used the official Blender 5.3 portable build in `C:\Users\kindl\tools\blender`.

## Scores (my own, after five screenshot passes and two recordings)
| Section | Type | Color | Motion | Interactivity | Craft | Story | Phone |
|---|---|---|---|---|---|---|---|
| Film, stops 1 to 6 | 9 | 9 | 9 | n/a | 9 | 9 | 9 |
| Hand-off and playground | 9 | 9 | 9 | 9 | 9 | 9 | 8 |
| The at-bat | 9 | 9 | 9 | 8 | 8 | 9 | 9 |
| Two wrists | 9 | 9 | 9 | 9 | 8 | 9 | 8 |
| For programs | 8 | 8 | 8 | 8 | 8 | 8 | 8 |
| Questions, contact, footer | 9 | 9 | 8 | 8 | 8 | n/a | 9 |

Not every axis reached 9, so the bar in the prompt is not fully met. What a studio would still fix:
- **Programs** is the weakest section: a competent panel, but the fill-in is bars growing rather than pitches visibly dropping in one at a time, and the Coach / Player move is a plain re-layout.
- **Playground on a phone:** "Back to the film's situation" sits over the strap, and only the top two rows of the mix fit.
- **At-bat:** the mix chip opens low in the pinned view and can crowd the fine print.
- **Two wrists on a phone:** the two stacked watches need more than one screen, so the pulse is partly off-screen.
- **Small arrivals** in the lower sections are one shared rise; they are not tuned per section.

## Not verified
- **Safari, Firefox, a real phone, touch, real frame rate.** Everything was run in headless Chromium. The glass refraction is Chromium-only by design; the blurred fallback was not looked at in another browser.
- **Vibration** on the Accept press: the call is made only on a press, but no device was there to feel it.
- **The reference reels and sites** were not viewed. Chrome had two browsers connected and none selected, so `docs/site-v2-shots/references/BOARD.md` is from web search only, with no screenshots.
- **The white dot** in the prototype recording: it sits at one fixed spot in every frame and nothing in the prototype's code draws it, so I read it as the recorder's cursor marker. I did not re-run the old recording script to prove it; the new recordings have no dot.
- **Screen readers** were not run; the roles, labels and live regions are in place and Lighthouse accessibility is 100.
- **Three docs the prompt lists are not in the repo** (color research, watch direction, the earlier site report), so they were not read.

## Look at these first
1. `docs/site-v2-shots/final/site-v2-desktop-scroll.mp4` (full scroll, desktop)
2. `docs/site-v2-shots/final/site-v2-phone-scroll.mp4` (full scroll, phone)
3. `docs/site-v2-shots/rerender/wide-t71-old-vs-new.jpg` and `wide-t28-old-vs-new.jpg` (the film, old and new)
4. `docs/site-v2-shots/build/pass5/desktop-film-046.jpg`, `-074.jpg`, `-093.jpg` (stop 4, the call, the playground)
5. `docs/site-v2-shots/build/pass5-states/desktop-pg-2-landed-3-2.jpg` (the playground after a change)
6. `docs/site-v2-shots/build/pass5-states/desktop-wrists-4-changed-buzz.jpg` and `desktop-programs-player.jpg`
7. `docs/site-v2-shots/build/pass5/phone-film-074.jpg` and `phone-at-bat-0.jpg`
8. `docs/site-v2-shots/build/pass5/desktop-reduced-full.jpg` (reduced motion; the long screenshot repeats near its end, which is a capture artifact on tall pages, not the page)

## Left on this PC, not in the repo
- The rendered PNG masters: `web/scripts/watch-render/frames/` (gitignored, about 300 files).
- An empty `C:\frames` folder from a mis-pathed first render. Safe to delete.
- Blender portable in `C:\Users\kindl\tools\blender` and an Inter font copy in `C:\Users\kindl\tools\fonts`.
