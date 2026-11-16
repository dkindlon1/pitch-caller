# PitchIQ site v2: three directions (Nov 16, 2026)

Status: Phase 0 and Phase 1 of `PROMPT_website_build_2026-11-16.md` are done. Nothing is built yet. Waiting for Drew's pick.
Branch `site/v2-alive`, made from `site/watch-redesign` (c6cb854). Mocks and screenshots: `docs/site-v2-directions/`. Film screenshots: `docs/site-v2-shots/phase0/`.

## Phase 0: what the film gives us
- The film runs and rests correctly on the current branch (dev server, Chrome headless, 1440x900 and 390x844, at 0%, 50%, 100%).
- Colors read from the frames: ground `#0c0b0e` (every corner of every frame), case `#2b2b30`, screen `#f2f2f2`, strap pins `#806749`, link dot `#b5e8a9`, brightest part highlight `#eae6e3`.
- Today's seam: the page ground is `#070707`, the film ground is `#0c0b0e`, and the film simply scrolls away with the strap cut off before a plain section starts. All three directions fix this by setting the page ground to the film's own `#0c0b0e` and starting the next chapter on the film's last frame.
- The engine demo already takes count, outs, bases, inning and score (`lib/demo.ts`), so the playground can run on the real engine. The call shown in every mock is real output (engine 1.2.3, sample starter, same-side hitter, college tables, 1-2, runner on second, one out, tied in the 7th).

## A. Night Game
**Concept:** the camera pulls back from the wrist into a ballpark under the lights. The scoreboard holds the situation, the field holds the reads.
- **Type:** Big Shoulders Display 900 (tall, condensed, scoreboard caps) with Hanken Grotesk for reading.
- **Palette:** night `#0c0b0e` (film ground), deep grass `#0f2a1e`, grass under lights `#1f6b45`, dirt `#6b4a34`, chalk `#f1efe6`, one accent: scoreboard bulb `#ffb22e`.
- **Hand-off:** the last frame stays pinned, the watch slides left and shrinks while a light tower blooms top right and green rises from the bottom edge. Same ground color, so no cut.
- **Sections:** film, five reads on the scoreboard, set the situation (field), the at-bat as pitches over the plate, the watch (two wrists), for programs, questions, contact, footer.
- **Motion moments:** (1) the pull-back from wrist to park; (2) scoreboard bulbs that flip digit by digit as you change the count, then chalk lines run from each read on the field into the call; (3) the at-bat chapter, where each pitch flies the mound-to-plate line and the next call lights the board.
- **Risk:** the isometric field has to look lit and real or it reads as a game graphic. It would be layered images and SVG, not live 3D.

## B. On the Glass
**Concept:** the film ends on the watch screen, so the camera keeps going until you are inside it. The rest of the site is drawn on the watch face: black on glass white.
- **Type:** Archivo only, using its width axis: 62% width at weight 900 for the giant words and numerals, 118% width for headings and labels.
- **Palette:** glass `#f2f2f2` (the film's screen white, dominant), ink `#101012`, bezel `#1c1c1f`, two accents: seam red `#d2232a` and the link dot `#2fa84f`.
- **Hand-off:** the last frame scales up from the screen's center until the screen fills the viewport and the bezel becomes the page frame. FASTBALL / OUTSIDE re-sets from the film's face type into the heavy page type.
- **Sections:** film, inside the screen (the five reads beside the call), set the situation, the at-bat as a strip of faces, back out to the wrist (two watches), for programs, questions, contact, footer.
- **Motion moments:** (1) the push through the glass; (2) the count numerals roll like a mechanical counter and the mix bars re-sort when you change anything; (3) the pull back out, where the page shrinks into the watch and a second watch lands beside it.
- **Risk:** it is the boldest and the only light one. The film is dark, so the push through the glass has to be exact or it flashes.

## C. The Movement
**Concept:** the film took the watch apart. This takes the call apart the same way: five reads as the parts of one movement, on the film's own black and brass.
- **Type:** Bodoni Moda (display, upright and italic) with Instrument Sans (already in the repo) for reading.
- **Palette:** black `#0c0b0e`, case `#2b2b30`, bone `#eae6e3`, brass `#b89a66` with a shadow tone `#5d4a2c`, and stitch red `#c8322b` for the thread and the dial hands.
- **Hand-off:** none needed. The last frame holds, a brass tick ring draws around the watch, and the five reads are pulled out along red stitched threads.
- **Sections:** film, one call taken apart, turn the dials, the at-bat, two wrists, for programs, questions, contact, footer.
- **Motion moments:** (1) the tick ring draws and the threads stitch outward from the screen; (2) brass dials you drag, with light that follows the cursor on the metal; (3) the threads pull tight back into the watch when the new call lands.
- **Risk:** it is the closest to what exists now (black, a warm metal, a serif). The prompt warned about that default. It is here because it is the film's native palette, not because it is new.

## My read
A is the one I would build. It is the only one that looks like baseball before you read a word, and the field gives the playground a real place to live. B is the most original and the riskiest. C is the safest and the least new. Mixing works: A's park and scoreboard with B's giant condensed call type is a natural pair.

## Honesty notes on the mocks
- The mix percentages, the call and the reason line are real engine output for the stated situation. The read notes on A's field, the read values on B's first screen and the hitter chips are illustrations and say so (B's chips are not wired).
- Every mock labels the watch as an illustration and a prototype. No latency, range, battery, rule, price, logo or waitlist claims appear.

## Skills
- frontend-design: followed (plan, subject-led choices, self-critique from screenshots).
- taste-skill: read. Its full run (dealt palettes, its own starter kit and finish gate) was not run, because it builds its own static page system and the prompt asks for three chosen directions inside the existing app. Its rules I kept: no eyebrow labels, no index numbering, two typefaces at most, headlines of two lines.
- web-design-guidelines and awesome-design-md: fetched, to be applied in Phase 2. No DESIGN.md was used for the mocks.

## Not verified
- Mocks were shot in Chrome headless only, at 1440x900 and 390x844. No Safari, no real phone.
- The mocks are static. No motion was built, so the motion moments are plans, not tested work.
- `tsc`, tests, build, e2e and Lighthouse were not run in this phase (no app code changed).

## D. Floodlight, liquid glass (added Nov 16 after Drew passed on A, B and C)
Drew asked for a glassmorphic, liquid glass theme on scheme A (Floodlight) from `RESEARCH_color_schemes_2026-11-16.md`.
- **Palette:** ground `#0c0b0e`, midnight `#14224f`, read glow `#2f5bff`, chalk `#ecebe6`, link green `#62f07a` only where a call lands (the watch's link dot, the watch rim, the "Call landed" chip, and the end of the reads-to-call blend). The blend runs `#2f5bff` to `#62f07a` in OKLab.
- **Type:** Archivo only (116% width bold for headlines, 66% width for the count numerals).
- **Hand-off:** the last frame holds, a blue floodlight comes up behind the watch, and the five reads surface as glass pills with lines that turn green where they reach the watch.
- **Playground:** a glass control panel (count, runners, outs, inning, hitter), a glass panel with the engine's mix, and the watch taking the call. Same real engine output as the other mocks.
- **Glass in the mock:** backdrop blur and saturation, a bright top rim, an inner bloom and a blue caustic along the bottom edge. True lens refraction (an SVG displacement filter on the backdrop) is Chrome-only today and was not tried.
- Mock: `docs/site-v2-directions/d-floodlight-glass.html`, shots `d-floodlight-glass-*.jpg`. Chrome headless only, static, no motion built.

## E. The film tells the call (added Nov 16, Drew's idea)
Drew: as the watch comes together, show the inputs and the decisions, building to the final outcome, fastball outside. Think of a premium Apple product page where the product carries one message at a time. A little more green.
- **What changes:** only the words and glass over the film. Frames, timing, scroll length and loading stay as they are.
- **Layout rule:** one statement on the left, the watch in the middle, one glass ledger on the right that fills as you scroll, and a three-part rail (Inputs, Decision, Call) at the bottom. On the phone the statement sits on top and the ledger becomes a tray at the bottom.
- **Six stops:** title; the situation (2-2, one out, runner on third, tied in the 3rd); the pitcher's feel and the hitter (same side, just saw a slider away); the mix being weighed; down to one; "Fastball, outside." with the call landed and a button into the playground.
- **Green:** the rail fills blue to green, the winning row turns green at "Down to one", and the final headline, glass rim, call chip and buttons are green. Blue stays the color of inputs.
- **Truth:** the story is one real engine run (engine 1.2.3, sample starter, college tables). Top of the mix is fastball down and away at 26%, reason line "He's sitting slider". The watch shows it as FASTBALL / OUTSIDE. The engine draws from the mix, so the page says "top of the mix", not "the only call".
- Type in this mock: Hanken Grotesk only.
- Mock: `docs/site-v2-directions/e-film-story.html`, shots `e-film-story-desktop.jpg` and `e-film-story-phone.jpg`. Static, Chrome headless only.
