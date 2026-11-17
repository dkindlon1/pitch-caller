SHIP: NO. Every check I could run passes, but the test copy of Safari's engine drew the site's fonts wrong ("PERFECT PITCH" came out as "FEFFECT FITCH"), and until someone looks at the preview in real Safari on an iPhone I can't tell you that is only the test engine.

# PitchIQ site v2: final check (Nov 16, 2026)

Branch `site/v2-alive`, final commit `b920719`. Nothing was merged, deployed or changed in Supabase.

**If the Safari look is clean, this is a yes.** It is the first item under "Before going live" and takes two minutes.

## 1. What was wrong and is now fixed
Four of these were real blockers that the earlier passes missed:

- **The playground was cut off on common laptops.** At 1280x800, on a 1366x768 laptop and on an iPad on its side, the left panel ran off the bottom of the pinned frame, so the hitter control and the reset could not be reached. On a phone turned sideways and at 200% zoom the whole film was broken.
- **Invisible headlines swallowed clicks.** The film's faded-out stops sat on top of the playground, so clicks on the runner buttons went nowhere.
- **Film headlines sometimes sat half their height too low.** GSAP was losing the stylesheet's vertical centring depending on the block's height. At 1440x900 this hit "It starts with the situation."
- **Stop 2's copy sat on the watch** (contrast 2.2:1 where the case passed behind it).

## 2. Checklist
| | Line | Result | Note |
|---|---|---|---|
| A1 | No overlap, clipping or sideways overflow | YES | Measured at 12 window sizes from saved geometry. Only intended overlaps remain (falling chips, the winning chip crossing the watch). |
| A2 | Each stop has a focal point, text off the watch | YES | Stops 2 to 4 now stay left of the watch. Small parts still drift behind copy; contrast holds (B4). |
| A3 | One rhythm, two-line headlines | YES | Every headline is at most two lines at seven sizes. Stops 2 to 4 share one size. |
| A4 | Lower sections hold the film's level | NO | Closer, not equal. Programs and questions are still plainer than the film (scores below). |
| A5 | No dead zones | YES | The phone ledger's empty moment at stop 3 is closed. The left playground panel keeps a blank strip where the reset button appears. |
| B1 | Light: no banding, edges or leaks, both paths | YES (shader) / NO (fallback) | Shader: clean at 6x contrast, no leak. Fallback (no WebGL only): still washes over the moving watch in stops 1 to 5 and shows soft ellipse edges at 6x; fixed from the call onward. |
| B1 | Rim thin, not a halo | YES | Was about 10 px wide; now about 2 px. |
| B2 | Glass consistent, refraction only at rest | YES | e2e checks it. WebKit and Firefox get plain blurred glass. |
| B3 | Type: right fonts, no shift, tracking | YES in Chromium and Firefox / NOT VERIFIED in Safari | Layout shift is 0. See the first line of this report. |
| B4 | Tokens only, green only for the call, AA contrast | YES | Copy over the film measures 5.9:1 or better against what passes behind it (was 2.2:1). axe: nothing serious. Green also marks the lit buzz pattern in two wrists, which is a call landing. |
| B5 | No artifacts at 2x, no seam, poster matches | YES | The film's own screen text is slightly soft at 2x: frames are 1920 wide. |
| C1 | Icons, share image, title, theme colour, canonical | YES | Share image and icon were the old site's art; both remade. Canonical and theme colour added. No `/favicon.ico` or manifest (see proposals). |
| C2 | 404 and other public routes | YES | New 404. Privacy and terms now use the site's look. Sign-in keeps the portal's look. |
| C3 | Copy proofread | YES | No typos. Apostrophes curled in the FAQ and the form. Three content points are in proposals. |
| C4 | Every link and button goes somewhere, anchors land | YES | 25 links; all seven anchors land within 4 px, including the pinned playground. |
| C5 | Hover, focus, active, disabled states | YES | Read in the stylesheet and exercised by the tests; not judged one by one on screen. |
| C6 | Selection, scrollbar, tap highlight, focus rings | YES | Scrollbar and tap highlight added. |
| D1 | Playground | YES | Burst clicks, 3-2, bases loaded, two out, 9th: real mix, watch matches. A changed call now leaves the watch when you scroll back into the story and returns with the playground. |
| D2 | Two wrists | YES | e2e. |
| D3 | At-bat strip | YES | The mix ran off the pinned frame; it now opens inside it. A click pins it open (hover used to open it and the click then shut it). |
| D4 | Contact form | YES, except success | Validation, error, honeypot and the honest "can't send yet" pass. Success with a real provider was not run. |
| D5 | FAQ | YES | Native details element; keyboard works. |
| D6 | Nav | YES | The menu now traps focus. |
| D7 | Scroll: wheel, keys, touch, anchors, hybrid | YES | Trackpad and real touch are emulated only. |
| E1 | axe: zero serious or critical | YES | 33 runs per browser in Chromium, WebKit and Firefox. Was 13 serious hits (one rule). |
| E2 | Keyboard pass, headings, hidden layers | YES | One h1. Screen readers were not run. |
| E3 | Reduced motion complete | YES | Also now serves phones on their side and small windows. |
| E4 | 200% zoom | YES | Was broken; the page becomes its calm version. |
| F1 | Lighthouse mobile | YES | 95, 95, 95. Accessibility, best practices, SEO 100. Layout shift 0. LCP 2.8 s, the headline. |
| F2 | Trace: no long tasks, no saturation | YES | No task over 50 ms. Compositor busy 1.0 s of 5. Shader on 166 to 184 frames/s, fallback 136 to 154. |
| F3 | Memory bounded on a phone | NOT VERIFIED | The code holds at most 12 tall frames; not measured on a device. |
| F4 | No console errors, failed requests, hydration warnings | YES in Chromium and WebKit / NO in Firefox | Firefox logs a "preloaded font not used" warning for the site's two fonts. |
| F5 | Throttled: usable from first paint, film never waits | NO | Usable, yes (first paint 1.3 s). But on slow 4G with a 4x slower CPU the film's first picture arrives at 2.1 s and trails the scroll for the first seconds. |
| G1 | WebKit and Firefox passes | YES, with the font caveat | Film scrubs, glass, playground, no overflow, all 19 interaction checks in each. |
| G2 | iPhone and Pixel profiles with touch | YES | Emulated at 390x844 and 360x740. |
| G3 | Real Safari, real phone, real GPU | NOT VERIFIED | Cannot be tested here. |

## 3. Scores (mine, before to after)
| Section | Type | Colour | Layout | Motion | Interactivity | Craft | Story | Phone | Accessibility |
|---|---|---|---|---|---|---|---|---|---|
| Film, stops 1 to 6 | 8 to 9 | 8 to 9 | 6 to 9 | 9 | n/a | 7 to 9 | 9 | 8 to 9 | 6 to 9 |
| Hand-off and playground | 9 | 9 | 5 to 9 | 9 | 6 to 9 | 8 to 9 | 9 | 9 | 7 to 9 |
| The at-bat | 9 | 9 | 8 to 9 | 9 | 7 to 9 | 8 to 9 | 9 | 9 | 7 to 9 |
| Two wrists | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 8 | 9 |
| For programs | 8 to 9 | 9 | 9 | 9 | 8 | 9 | 8 | 9 | 9 |
| Questions, contact, footer | 8 to 9 | 9 | 8 to 9 | 8 | 8 | 8 to 9 | n/a | 9 | 9 |

Still under 9, and each needs a decision from you rather than more polish:
- **Two wrists on a phone:** the stacked watches need more than one screen.
- **Programs interactivity:** a lane only dims the others; nothing opens.
- **Programs story:** its sample numbers disagree with the film's pitcher (proposal 1).
- **Questions and contact motion:** only the shared rise.

## 4. What changed
| Area | Change | Commit |
|---|---|---|
| Layout | Calm version for windows the film cannot fit (wide and under 600 px tall or 1024 px wide); two tightening steps for short laptops and iPads; centring fix; stops 2 to 4 two lines and off the watch | `b03b4f8` |
| Light | Cut-out masks stored as distance fields; thin rim; shader at 80% of CSS size | `c2f5c6b` |
| Light | Shader compiles and its mask decodes off the main thread (removed a 108 ms task) | `4f2fee6` |
| Interaction | Faded stops no longer take clicks; changed call follows the playground; call-word letters never cut | `d5f6838` |
| Interaction | At-bat mix inside the frame; buttons named by hidden text; no sign-in prefetch | `afd377c` |
| Contrast | Ground-colour pool under film copy, deeper phone shade, lighter illustration note | `c891eb8` |
| Small details | Share image, apple icon, favicon colours | `18a3f5a` |
| Small details | 404 page, legal pages, canonical, theme colour, portal font no longer preloaded | `8b92193` |
| Last round | Clean teardown when the page turns calm; at-bat click pins; fallback light off the watch at the call; section headlines; menu focus trap | `b03b4f8`, `b920719` |
| Tools | Capture, sheet, audit, interaction and contrast scripts | `15e6804`, `afd377c`, `c891eb8` |

One change reaches outside the marketing pages: the root layout no longer preloads the portal's condensed font, because every public page was fetching it unused.

## 5. Checks (all on the final build)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm test` | 54 of 54 |
| `npm run build` | compiled |
| `npm run e2e` (includes story and playground agreement) | 57 checks, all pass |
| `node web/tests/final_audit.js` | Chromium, WebKit, Firefox: exit 0, 52 ok each, 0 serious or critical axe hits in 33 runs each |
| `node web/tests/final_interact.js` | 19 of 19 in Chromium, WebKit and Firefox |
| `python web/tests/final_contrast.py` | 0 blocks of film copy under 4.5:1 at six sizes; lowest 5.9:1 |
| Lighthouse mobile | 95 / 95 / 95; LCP 2.8 s each; blocking time 70, 80, 70 ms; layout shift 0 |

Trace, 5 s of scrolling from first paint, real Chrome on this PC's RTX 5070 Ti at 1440x900 2x (240 Hz screen). These four ran one build before the last; the changes after it were stylesheet and at-bat only.
| Run | Frames/s | Main-thread tasks over 50 ms | Film behind the scroll |
|---|---|---|---|
| Shader on | 166 (184 on an earlier run) | 0 | 0.4 frames |
| Shader off (`?nogl=1`) | 136 (154 earlier) | 1 (51 ms) | 0.4 frames |
| Phone profile, 12 s | 233 | 0 | 0.4 frames |
| 4x CPU, slow 4G | 90 | 5 (longest 193 ms) | 50 frames in the first seconds |

Both light paths are slower than the 229 frames/s recorded before the light work. I did not measure the shader before my change to its resolution, so I can't say how much of that is mine.

Browser matrix: Chromium, WebKit and Firefox at desktop and phone sizes for the film, the hand-off and every section; Chromium also at laptop, tablet, 1920, 360 wide and six awkward sizes.

## 6. Proposals for Drew
I made no visual mocks; these are content or scope calls.
1. **Programs sample numbers.** The panel says slider 77.4 mph, changeup 78.0. The film's pitcher throws slider 78, changeup 77. Suggest matching the panel to the film's pitcher.
2. **FAQ, "Can I use it during games?"** It ends "Game prep, bullpens and scrimmages are fine anywhere." That reads as a device-rule claim, which the content rules exclude. Suggest cutting the sentence.
3. **Reply promise.** "We read every message and write back" and "usually within a day or two". Keep only if true.
4. **A first picture on slow connections.** Show the film's first frame as a plain background until the frames arrive. It was dropped earlier to protect LCP, so it needs a measured try.
5. **`/favicon.ico` and a manifest.** Neither exists. Browsers use the linked icons; adding a site-wide favicon means choosing between the site's mark and the portal's.
6. **Programs:** let a lane open into its counts.

## 7. Not verified
- **Real Safari and a real iPhone.** The test engine is Playwright's Windows build of WebKit, which does not paint variable-font widths. I believe the fault is that build. I added a guard so letters overlap rather than get cut if it ever recurs.
- **Real phone, real touch, vibration, trackpad.**
- **Any GPU but this one.** The shader now draws four times the pixels it did.
- **Screen readers.**
- **Contact form success** with an email provider set.
- **Phone memory**, measured.
- **The reference pass.** Chrome was connected, but I captured one new site and did not re-watch the reels. The "3 to 5 sites per section" target was not met.
- **The original build prompt** (`docs/PROMPT_site_v2_build_2026-11-16.md`) is not in the repo, so its rules were taken from the plan and the build report.
- **The recordings** were made two small commits before the final one.
- **Baseline Lighthouse and trace** were not run before I started changing things, so there is no before figure for those two.

## 8. Before going live
1. Open the preview in Safari on an iPhone and on a Mac. Scroll to the call. The words must read PERFECT PITCH in heavy condensed type.
2. On the phone: turn it sideways (you should get the still, stacked version), then back.
3. Set the email provider variables (`RESEND_API_KEY`, `CONTACT_TO`) and send one real message.
4. Set `SITE_URL` so the share image and canonical address are right; paste the link into a chat to see the card.
5. Decide proposals 1 and 2 (both are content on the page today).
6. Decide what happens to the old site, then merge.

## 9. Look at these first
All in `docs/site-v2-shots/final-check/picks/` unless noted.
1. `04-playground-short-laptops-before-after.png`
2. `05-stop2-before-after.png`
3. `03-rim-before-after-2x.png`
4. `01-after-desktop-film.png` and `02-after-phone-film.png`
5. `08-test-webkit-fonts-NOT-real-safari.png` (the reason for the NO)
6. `07-404-and-privacy-before-after.png`
7. `10-sideways-phone-calm-version-top.png`
8. `docs/site-v2-shots/final/site-v2-desktop-scroll.mp4` and `site-v2-phone-scroll.mp4`

The full lossless captures (about 2.2 GB) are on this PC under `docs/site-v2-shots/final-check/before` and `after`; only the contact sheets and picks are in the repo.
