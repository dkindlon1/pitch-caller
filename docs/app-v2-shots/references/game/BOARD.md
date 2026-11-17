# Board A: glanceable, sports and in-motion interfaces

Captured headless Chromium, 1440x900, DPR 1. Fonts/colours are the computed values of the first heading and of `body`. Where `body` background is transparent, the page background sits on another element.

## Apple Watch Ultra 2
- Apple Watch, https://www.apple.com/apple-watch-ultra-2/
- Screenshot: docs/app-v2-shots/references/game/apple-com-apple-watch-ultra-2.png
- Fonts/colours: heading "SF Pro Display" (first h1 "Apple Watch"); body "SF Pro Text"; body bg rgb(255,255,255); body color rgb(29,29,31)
- Technique: large display numerals on the watch faces ("10:09", "10:00") dominate each card; the card title and price sit below in small type, with a filled pill "Learn more" beside a plain text "Buy >" link.

## CarPlay
- Apple CarPlay, https://www.apple.com/ios/carplay/
- Screenshot: docs/app-v2-shots/references/game/apple-com-ios-carplay-scrolled.png (after one 1000px wheel scroll; the top of the page is a photo only)
- Fonts/colours: heading "SF Pro Display" ("Car keys and CarPlay. A smarter ride from start to finish."); body "SF Pro Text"; body bg rgb(255,255,255); body color rgb(29,29,31)
- Technique: the in-car screen mock uses stacked rounded tiles, each with one large title ("Prop run-through") and a single small time line beneath it; the rest of the chrome is minimal.

## Hawk-Eye Innovations
- Hawk-Eye, https://www.hawkeyeinnovations.com/
- Screenshot: docs/app-v2-shots/references/game/hawkeyeinnovations-com-scrolled.png (after one 1000px wheel scroll; the phone-app UI is in the carousel, below the hero)
- Fonts/colours: heading "Montserrat" (first heading "Latest News"); body "Montserrat"; body bg transparent (dark sections set on child elements); body color rgb(16,16,28)
- Technique: two phone mockups overlap the edge of a dark carousel slide; the phone screens show a stat list with bars and a large single figure ("174.1 km/h"), and the carousel uses small orange dot indicators with arrow buttons.

## Strava features
- Strava, https://www.strava.com/features
- Screenshot: docs/app-v2-shots/references/game/strava-com-features-s2.png (captured after three wheel steps; the top of the page is blank while content loads)
- Fonts/colours: heading "BoathouseExtended" (first h1 "The best of Strava. Built for your goals."); body "Boathouse"; body bg transparent; body color rgb(102,102,102)
- Technique: three dark rounded cards each hold a light inset panel with one bold figure per row ("28:29", "59:27") and a small grey unit line under it; an orange "NEW" badge sits above each card title.

Rejected (no product UI visible, or not loaded): Trackman (cookie modal blocks scroll; hero only), Rapsodo (404 page), Whoop (Cloudflare block page), F1 Live Timing (cookie modal; "no live session" text only). Only 4 of 5 requested pages qualified.
