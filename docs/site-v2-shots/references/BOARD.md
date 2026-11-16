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
