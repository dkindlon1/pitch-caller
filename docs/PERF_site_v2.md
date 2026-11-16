# Site v2: scroll performance (Nov 16, 2026)

Measured with `web/tests/perf_trace.js`: real Chrome 157 with this PC's GPU (RTX 5070 Ti), 1440x900 at 2x, a Chrome
performance trace of 5 seconds of mouse-wheel scrolling (100 px notches, 8 a second) on the production build. The
display here runs at 240 Hz, so a perfect run is about 240 frames a second and 4.2 ms between frames.
Summaries of every run: `docs/site-v2-shots/perf/before/` and `after/` (JSON). Raw traces are not kept in the repo.

## What the trace found, biggest first
| # | Cause | Evidence (before) |
|---|---|---|
| 1 | **The SVG refraction (`backdrop-filter: url(#lens)`)** on three panels, two of them invisible at the time. The renderer's compositor thread was busy 4.85 s of the 5 s. | 119 frames/s. With refraction off: 209. With all glass off: 226. |
| 2 | **Blur tweens on glass panels** (the ledger and chips blurred in and out while also blurring their backdrop). | GPU tasks of 14 to 40 ms and frame gaps of 22 to 42 ms as the ledger (1.7 s) and chips (4.9 s) arrived. Gone with filters off. |
| 3 | **The animation code arriving as one long task** (GSAP, then every section's setup, with the film's layout run twice), plus building the lens filters. | One 91 ms main-thread task and a 205 ms gap between frames, 65 ms after first paint. On slow 4G it landed mid-scroll at 1.9 s (97 ms task, 238 ms gap). |
| 4 | **Frames decoded on the main thread** the first time each was drawn. | 84 decodes, 313 ms in the 5 s, up to 5 ms each (a 240 Hz frame is 4.2 ms). |
| 5 | **Loading order.** Only every 8th frame came with the page; the rest started on the first scroll, coarse to fine. | On a 10 Mbps line: 8 jumps of more than 2 frames, one of 150, picture up to 143 frames from the scroll position. |
| 6 | Canvas larger than the film: 2138x1350 drawn from 1920x1200 frames. | Small; fixed by capping the canvas at the frames' own size (now 1920x1200 here). |

Not causes: the engine script (186 KB, loads at about 2 s, no task over 16 ms), the fonts, Lenis itself, the lower
sections (off screen), and the two full-screen `mix-blend-mode` lights (no change with them off).

## What changed
1. **Refraction only at rest** (`GlassFx.tsx`). While the page scrolls or the film's timeline is still easing, lens
   panels are plain blurred glass. About 0.2 s after everything stops, the panels on screen get their refraction back,
   and the filter is built then, not at startup. A panel at opacity 0 carries no backdrop filter at all (`.is-off`).
2. **No blur tweens on glass.** The ledger and chips now move, scale and fade. The call words keep their blur.
3. **Setup in separate tasks** with a frame between them (`motion.ts`), and the film's layout runs once.
4. **Frame loading rebuilt** (`filmFrames.ts`):
   - every frame at an eighth of the size, 50 to a sheet, three files (160 KB wide, 185 KB tall), asked for first;
   - sharp frames: the first 12 with the page, then nearest the scroll position in the direction of travel;
   - decoded off the main thread ahead of the scroll (8 ahead, 2 behind) and released behind it;
   - the scrub draws the sharp frame, else a sharp neighbour one frame away, else the small copy of the exact frame,
     else the nearest frame of any kind. It never waits;
   - frames start at first paint and follow the scroll without waiting for GSAP.
5. **Hybrid opening behind a flag** (`?hybrid=1`, or `HYBRID_DEFAULT` in `Film.tsx`; off by default). The first 22
   frames play by themselves over 2.5 s, easing to a stop, then the scroll continues from that frame. Scrolling stops
   it at once. Not under reduced motion, not when the page opens already scrolled. From stop 4 on it is identical.

## Before and after (5 s of scrolling)
| Run | | Frames/s | Gaps over 20 ms | Longest gap | Compositor busy | Main-thread decode |
|---|---|---|---|---|---|---|
| Scroll right at first paint | before | 119 | 5 | 205 ms | 4852 ms | 313 ms |
| | after | 229 | 3 (all in the first 0.16 s) | 45 ms | 1156 ms | 0 |
| Scroll after the page settles | before | 122 | 3 | 37 ms | 4908 ms | 319 ms |
| | after | 234 | 1 | 20 ms | 1075 ms | 0 |
| Whole film, 12 s | before | 121 | 6 | 38 ms | 11277 ms | 545 ms |
| | after | 231 | 2 | 26 ms | 2649 ms | 20 ms |
| Hybrid: 2.6 s playing, then scroll | after | 232 | 5 (4 in the first 0.14 s) | 37 ms | 815 ms | 0 |

Film tracking on a throttled line (scroll starts at first paint):
| Line | | First picture | Jumps over 2 frames | Mean distance from the scroll position | Sharp share |
|---|---|---|---|---|---|
| 10 Mbps, 40 ms | before | 0.40 s | 8 (largest 150) | 1.8 frames (95th: 6.3) | all sharp once loaded |
| | after | 0.30 s | 1 (largest 6) | 0.5 frames (95th: 0.9) | 93% |
| Slow 4G (1.6 Mbps, 150 ms) | before | 2.6 s | 6 of 6 | 10.9 frames | n/a |
| | after | 2.7 s | 2 of 18 | 11.1 frames | 0% in the first 5 s |

Slow 4G is not better in its first 3 seconds: the page's own HTML and scripts fill the line, and the first sheet
(74 KB) lands at about 2.7 s either way. After that the scrub follows on small copies instead of standing still.

## Lighthouse (production build, localhost, 3 runs each)
| | Performance | LCP | TBT | CLS | Speed Index |
|---|---|---|---|---|---|
| Mobile, default | 95, 95, 95 | 2.8 s | 40 ms | 0 | 2.5 s |
| Mobile, `?hybrid=1` | 89, 89, 89 | 2.8 s | 30 to 50 ms | 0 | 7.0 s |
| Desktop, default | 100 | 0.6 s | 0 ms | 0 | |

The hybrid scores lower only on Speed Index: the screen keeps changing for 2.5 s by design.

## What is left
- Two tasks of 28 and 22 ms when the animation code arrives (the film's timeline and one other section's setup),
  three 45 ms gaps about 0.1 s after first paint. A scroll that starts later than that does not meet them.
- Two 26 ms gaps late in the film (7.3 s and 10.9 s into a full scroll: the call words and the playground panels).

## Side by side
`docs/site-v2-shots/perf/standard-vs-hybrid.mp4` (same input both sides: load, 2.8 s wait, 9 s of scrolling) and
`standard-vs-hybrid-sheet.jpg` (one frame a second). The recording is 25 frames a second, so it shows behaviour, not
smoothness.

## Not verified
- Any machine but this one. A slower GPU or a larger window was not measured; the refraction cost grows with both.
- Safari, Firefox, a real phone. The loader has a fallback for browsers without `createImageBitmap`, never run.
- Memory on a phone with up to 12 decoded tall frames (about 87 MB) held at once.
- The glass now changes at rest: blur 22 px while moving, refraction (blur 9 px, bent edges) about 0.2 s after
  stopping, 2 to 3 s after a wheel flick because the timeline eases out. Seen in screenshots, not judged by eye in motion.
- The ledger and chips without their blur-in, and the hybrid's stops 1 to 3 over later frames, were checked in
  stills only.
- Throttled runs use Chrome's emulated network, on localhost.
