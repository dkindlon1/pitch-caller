# Reference board: high-end web work

Status: research done with WebFetch and WebSearch only. Chrome was NOT used (two browsers connected, none selected). No screenshots taken. No computed colors or fonts read from live pages. Entries below are search-level leads, not verified live inspections.

## Instagram reels (quality bar)

Login prompt shown on all seven, but captions and first ~12 comments were readable. Comments are from WebFetch's summary of the page and may be incomplete.

- **#1 DZrcGVFNhgG (docmo.agency), villa tour site.** Shows AI-generated frames plus a scroll engine and GSAP reveals. Comments are almost all "Villa" (one typo). Praise: none beyond the keyword. No design critique.
- **#2 DfUvC-GhLSI (thedzianis), "Layers" prompts.** Shows websites built from two quiet colors plus one loud accent. Praise: "restrained palette with one bold accent," "mood and polish." Comments are mostly "Layers" (keyword farming).
- **#3 DfK9uklOWJ_ (textura.eu), 3D hero mobile recomposition.** Argues desktop 3D heroes shrunk for mobile break the composition; mobile needs recomposition for a vertical screen. Comments are almost all "Claude" (keyword farming).
- **#4 DfGEE7DIvjU (niki.aroca), one accent color.** Praise: neutral layout plus one saturated accent guides the eye to the CTA. Question raised: whether the creator tests accent contrast ratios in OKLCH first.
- **#5 DfScZgPSqc1 (diego.a.does), two colors + one accent.** Shows black/white + lime, with the accent "only on the button you want pressed." Praise: two-color version "looks perfect." Critique: adding a third color "looks AI generated" (flagged by two commenters).
- **#6 DfuhfgpRQxa (charles.unemployed), colour wheel.** Engagement is mostly "Accent" keyword farming, plus one remark that the third option was good but the first two looked better initially.
- **#7 DfXTi-Yoveg (pierredelcourr), "one color that surprises."** Praise: "Fire," "color combinations are very attractive." Critique (most useful): a longer comment says hierarchy gets lost when accents are added; keep the title white so the eye lands there first. Another commenter notes the first two colors are monochromatic and the third is opposite on the wheel.

Reel takeaway: the pattern commenters respond to is restraint (two neutrals plus one accent used on the CTA only). The main objection is any third color.

## 1. Scroll-scrubbed product reveal (image sequence, pinned)

- **More Nutrition (Awwwards Site of the Day, Nov 3, 2025).** URL: https://www.awwwards.com/more-nutrition-you-deserve-more.html. Screenshot: none. Technique: swapping image sources during fast scroll stuttered, so frames were drawn to a canvas instead. Colors/fonts: not read.
- **Pinned canvas hero, ~120-frame sequence (pattern reference).** URL: https://kombai.com/gallery/inspirations/hero_scrub_glen/ (also https://21st.dev/@duthiljean/components/hero-scrub). Screenshot: none. Technique: pin the hero, map scroll progress to a preloaded frame index on canvas. Colors/fonts: n/a.
- **SPYLT (Tubik Studio).** URL: https://tubikstudio.com/blog/spylt-case-study/. Screenshot: none. Linear storytelling scroll, not a frame scrub; Site of the Day per Tubik. Colors/fonts: not read.

## 2. Liquid-glass / frosted panels over dark imagery

- **Liquid Glass on the Web (2026 guide).** URL: https://www.buildmvpfast.com/blog/liquid-glass-css-backdrop-filter-recipes-2026. Screenshot: none. Technique: CSS backdrop-filter blur gives frost only; real refraction needs SVG displacement or WebGL. Colors/fonts: n/a.
- **LiquidGlass WebGL demo.** URL: https://www.cssscript.com/demo/webgl-liquid-glass. Screenshot: none. Technique: WebGL refraction for the glass edge. Colors/fonts: n/a.
- **Codrops (not found).** No Codrops liquid-glass case study surfaced. Not verified.

## 3. Live interactive product demo embedded in a marketing page

- **No verified premium example found.** Only vendor blogs surfaced: Guideflow (https://www.guideflow.com/blog/embed-demos-landing-pages), Howdygo (https://www.howdygo.com/blog/what-are-interactive-product-demos). Technique from Guideflow: an inline embed that loads the demo inside page content, versus a modal overlay. Treat its engagement claims as vendor marketing.

## 4. Sequence or timeline told with scroll (steps joined by a drawn line)

- **Draw SVG (NextWeb, Awwwards element).** URL: https://www.awwwards.com/inspiration/interactive-element-draw-svg-wheel-of-fortune-by-nextweb. Screenshot: none. Technique: SVG path draw tied to scroll. Note: it is a wheel widget, not a timeline. Colors/fonts: not read.
- **Scrolling Timeline, project flow (Nikola Miseljlin).** URL: https://www.awwwards.com/inspiration/scroll-nikola-misel-puklin. Screenshot: none. Colors/fonts: not read.
- **NEVERHACK timeline.** URL: https://www.awwwards.com/inspiration/timeline-neverhack. Screenshot: none.

## 5. Two-device sync moment

- **No verified Awwwards example found.** Closest technique: Elementor device mockups with a shared group ID so laptop and phone scroll together, matching transition durations (https://theplusaddons.com/docs/connect-multiple-scrolling-device-mockups-in-elementor/). Elementor-specific, not premium.
- Studio guidance: on mobile, use a reduced version of the scroll effect rather than copying desktop (https://studiomeyer.io/en/blog/scroll-storytelling).

## 6. Stats / dashboard panel that fills in on enter

- **Dashboard Stats Design (Pulsetic, Awwwards element).** URL: https://www.awwwards.com/inspiration/dashboard-stats-design-pulsetic. Screenshot: none. Animation on entry not confirmed.
- **GetYourGuide travel trend tracker, stats animation on scroll (Awwwards element).** URL: https://www.awwwards.com/inspiration/stats-animation-getyourguide-travel-experience-trend-tracker-fall-2024. Screenshot: none.
- **Technique (reference):** CountUp.js with an IntersectionObserver that starts each counter once when its block enters view.

## Recheck needed

Once a Chrome browser is selected, re-run: screenshots for the Awwwards and Codrops entries above, and computed fonts/colors (body background, h1 fontFamily, fontSize, fontWeight, letterSpacing). The move-2, 3 and 5 searches returned no verified premium examples; they need a targeted Awwwards or Codrops pass.


# Round 2 (Nov 16): seen in Chrome, logged in

The seven reels were watched in the Windows browser (it was logged into Instagram), a few frames each, with their captions and the first screen of comments. Live sites were opened and their headline styles read with JavaScript. Screenshots are in this folder.

## The reels
| Reel | What it shows | What to take | What the comments flag |
|---|---|---|---|
| DZrcGVFNhgG (docmo.agency) | A villa tour: about 200 frames scrubbed by scroll, numbered chapters ("01 Above everything") in a serif over full-bleed frames | One idea per stop, the frame fills the screen, the words sit on it | Comments are only keyword replies |
| DfUvC-GhLSI (thedzianis) | Dark heroes with a glowing orb; two quiet colors and one loud accent, the accent only on the button | Accent only where you want a press | "Why do you all copy each other" (the look is common now) |
| DfK9uklOWJ_ | 3D heroes re-shot for phones | Recompose for the tall frame: camera closer, text in its own zone | none useful |
| DfGEE7DIvjU | One accent color over black and blue | Keep it to one accent | Contrast fails (3.48:1 called out), "a lot going on, I don't know where to look", "the orange makes it look bad", "it's AI and it shows" |
| DfScZgPSqc1 | 60/30/10 color split | Two colors do 90% of the work | "That 10% color makes it look 100% AI", "lime green is overused", "remove the last color" |
| DfuhfgpRQxa | Accent from the color wheel | Match saturation, not just hue | The saturated orange fights the green and cream |
| DfXTi-Yoveg | Sand and green plus one touch | One surprise | "You need to know where to add it or it is a mess" |

## Live sites
| Site | Screenshot | The one thing worth learning | Type and color read off the page |
|---|---|---|---|
| apple.com/apple-watch-ultra-4 | apple-ultra-hero.jpg, apple-ultra-closer-look.jpg, apple-ultra-accent-headline.jpg | Product lit low and from the side on black: rim light draws the case edge, the screen is the brightest thing. One heavy uppercase line over it. One colored headline per page (green). | Background rgb(0,0,0); SF Pro |
| apple.com/watch | apple-watch-overview-1.jpg, apple-watch-made-for-each-other.jpg | Pacing: one statement, lots of air, then the product. "Made for each other" shows two devices with one short paragraph. | White and rgb(245,245,247) |
| linear.app | linear-hero.jpg, linear-three-up.jpg | Near-black ground, one weight of type, tight tracking; second headline in grey; three plain facts in a row with a thin line above. | Background rgb(8,9,10); Inter 64px weight 510, tracking -1.4px; grey rgb(138,143,152) |

## What changed on the site because of this
- Film: lighting pushed toward the Apple Ultra look (rim light on wider bevels, soft cards reflected in the strap, the screen as the brightest thing).
- Programs: cut from seven cards to three big numbers and three lanes, after "a lot going on, I don't know where to look".
- Two wrists: three plain facts in a row under the watches (the Linear three-up).
- Color: nothing added. Ground and chalk carry the page, blue is the mood, green is only the call and the two buttons you press.

Not seen: Awwwards and Codrops were not opened this round. The reels were sampled (a few frames each), not watched with sound.

## Final check (Nov 16, evening)
Seen in Chrome on the Windows browser. Only one new site was captured this round; the reels were not watched again and the "3 to 5 live sites per section" target was not met.
| Site | Screenshot | One line |
|---|---|---|
| raycast.com | raycast-hero.jpg | One centred headline over one shaped light on near-black, a single small button: the light is the picture, nothing competes with it. |
