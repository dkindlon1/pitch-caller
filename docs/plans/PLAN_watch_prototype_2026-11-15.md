# Watch prototype plan: PitchIQ calls on a Bangle.js 2 (Nov 15, rev 3)

Rev 2 added every fix from `REVIEW_watch_prototype_plan_2026-11-15.md`. Rev 3 adds Drew's three decisions (Nov 15):
1. **The coach accepts each call**, and the accepted call goes to the watches.
2. **The watch shows only the sign and the location in words.** "Get it over" shows the sign alone.
3. **Two watches, both identical**: pitcher and catcher see the same thing.

**Goal:** prove the engine's call can reach the catcher's (later also the pitcher's) wrist in one step, reliably and fast enough for a game, and find out how much it improves the experience. This is a test, not a product: no iPad, no store, no production.

**Decided:** two Bangle.js 2 watches (the first one is enough to start building). The sender is the PitchIQ game app in **Chrome on a PC/laptop, or an Android phone/tablet** (both have Web Bluetooth; iPad Safari doesn't). The iPad stays exactly as it is.

## What gets built

### 1. Watch app (`watch/bangle/`, new)
- **Files:** `pitchiq.app.js`, its metadata file, and a README with install steps (Espruino Web IDE in Chrome → upload to storage).
- **Its own Bluetooth service:** one characteristic the sender writes to and one the watch notifies receipts on. It takes **data, not code**, so the watch's "Programmable" setting stays off except while uploading the app. (To confirm on the watch: the service works with Programmable off.)
- **Message:** codes only, no names or pitch types. Each carries the message number, call id, sign, location code and changed flag. The sender works out the chase direction, so the watch never needs the pitch type.
- **Screen** (176×176, readable in sun; the backlight flashes briefly on each new call for night games). **Only two things show:**
  - the **sign** (1–6, the app's numbers, or a pitch's kept sign), as large as the screen allows;
  - the **location in words** under it:

    | Engine spot | Watch shows |
    |---|---|
    | up-in | HIGH AND INSIDE |
    | up-away | HIGH AND OUTSIDE |
    | down-in | LOW AND INSIDE |
    | down-away | LOW AND OUTSIDE |
    | down-middle ("keep it down") | LOW |
    | middle ("get it over") | *nothing: the sign alone* |
    | chase, FB/SI/FC | CHASE HIGH |
    | chase, SL/CB/CH | CHASE LOW |

    Chase direction follows the engine (`yTarget`/`targetHeight` in `engine.js`). Inside and outside are the hitter's, so the words mean the same thing to the pitcher and the catcher. No role setting, no grid, and both watches look the same.
  - A small link dot in a corner is the only other mark.
- **Buzz:** one long buzz = a newly accepted call. Two short buzzes = **changed call**: a new accepted call that replaces one already on the watch before a pitch was recorded (e.g. a shake-off after it was sent, then a new call accepted).
- **Clear:** a clear message shows "—" and never buzzes. It's sent after a result, on the third out, and when the app clears its call. Until the coach accepts the next call, both watches show "—".
- **Message rules:**
  - a message numbered lower than the last one is dropped;
  - the same number again gets the receipt re-sent and no buzz;
  - the count resets on every new connection.
- **Stays open:** the app takes over the button (long press to exit) and keeps itself in front. The watch isn't paired to a phone, so no notifications cover the call.
- **Link loss:** NO LINK in red the moment the watch disconnects, and also if no heartbeat arrives for 6 s.
- The button and touchscreen send nothing to the coach.

### 2. Sender in the game app (`app/watch.js`, new; inlined by `build.py`)
- **Accept button.** Nothing goes to the watches until the coach accepts.
  - A big **Accept** button sits under the call on the Game screen (keyboard: Enter), whenever a watch is connected.
  - It works the same for the engine's call and for the coach's own call (pick, "Grade and use my call", then Accept).
  - Once accepted, the button reads "On the watches ✓".
  - A new call (shake-off, pitching change, coach change) needs Accept again.
  - With no watch connected, the button and the Game screen are exactly as today.
- **Call id:** a counter kept in the game, set wherever a call is made: the engine call in `makeCall` (which also covers shake-off re-calls, pitching changes and recalls) and the coach's call in `pickBox`. Accept sends the call id now on screen, and an id is sent once (retries aside). A cleared call (`G().call = null`), a recorded result or `inningOver` sends a clear. Undo restores an older call, which needs Accept again.
- **Changed flag:** set when an accepted call replaces one already on the watches with no pitch recorded since (the game's recorded-pitch count hasn't moved).
- **Two watches, one call:** every message goes to both watches. Each watch has its own receipt, and the status pill names the watch that missed (by its Bluetooth name).
- **Message number:** a separate counter that always goes up and restarts on each connection.
- **One write queue:** writes never overlap (Chrome rejects overlapping writes), and a new call removes any older call still waiting.
- **Delivery receipt** (on by default, can be switched off):
  - On: no receipt within 1 s → the coach screen says **"Not on the watch — give the sign"**, and the call is retried until it's received or replaced.
  - Off (for game use under one-way rules): each call is sent three times about 150 ms apart, and the watch drops the repeats.
- **Heartbeat:** every 3 s while a game is open.
- **Reconnect:** after a drop, it reconnects by itself while the page stays open. After a page reload, the coach taps Reconnect once (Chrome needs a tap to pick a device).
- **UI:**
  - Setup gets a "Watches" card: Connect/Reconnect for up to two, each watch's name and battery %, and "Delivery receipt".
  - The Game screen gets the Accept button and a status pill: on both / not on watch X / no link.
  - **Shared signs:** the watch shows no pitch type, so two active pitches sharing a sign (e.g. two sliders both 3) can't be told apart. The app allows that today. When a watch is on, Setup flags it and has the coach give one of them a different sign number before a game opens.
  - All of it is hidden where there's no Web Bluetooth (the iPad), and it's off by default.
  - The watch settings live **on the device only**, not in the synced setup or game plan.
- **Soak mode** (dev-only, from a URL flag): accepts and sends a new random call every 5 s by itself, counting sent, received and late for each watch.
- **Not sent:** the intentional-walk suggestion (the coach decides, as today).

## Where to run it
- The game app from **`/app/game/`** (https) or **`localhost`**, never by opening the built file from disk (`file://` has no Web Bluetooth).
- Test games are **local practice games**, signed out or on the dev Supabase project, **never pitchiq-prod**.

## Checks

| Check | Who | Pass |
|---|---|---|
| Sender unit tests (fake Bluetooth devices): nothing sent before Accept; the same call twice in a row (each accepted) is sent twice; both watches get every message, each with its own receipt; message numbers after reconnect; retry doesn't re-buzz; write queue never overlaps and drops older calls; changed flag (accepted call replaced before a pitch vs after one); clear on result, third out and null call; receipt off = three sends; chase direction per pitch type | Claude (Node) | all pass |
| Browser e2e (stand-in `navigator.bluetooth`): engine call → Accept → sent once; shake-off → new call needs Accept; coach call → Accept; undo needs Accept; shared signs flagged in Setup; with no watch, the Game screen matches today's (no Accept button); the iPad build shows no watch UI | Claude (Playwright) | all pass |
| Watch app logic in Node against stubbed Bangle calls: the sign and the words for all seven spots (middle = sign alone, chase high/low); buzz patterns; "—" on clear; dropped and repeated message numbers; NO LINK on disconnect and on a missing heartbeat; button doesn't exit on a short press | Claude | all pass |
| Existing suite (`scripts/test-app.sh`, parity, golden), with the new tests added to it | Claude | unchanged + new pass |
| Install, pair from Chrome, desk test; the service works with Programmable off | Drew | call, buzz, receipt |
| **Delay:** Accept tap → buzz on both watches, filmed in slow-mo, 20 calls; engine time logged separately | Drew | under 0.5 s each |
| **Soak:** 1 hour with the watch at mound distance, sender in the dugout | Drew | ≥ 99.5% received within 1 s, 0 wrong calls shown |
| **Range:** the plate and the mound, people in between | Drew | every call delivered (if not: USB adapter with an antenna) |
| **Bullpen:** a normal session with the catcher | Drew + catcher | no missed or misread calls |
| **Readability:** sign and words in direct sun, one glance, on both the pitcher's and the catcher's wrist | Drew + catcher | their word |
| **Battery:** 3 hours connected | Drew | ≥ 50% left |
| **Wear:** pitcher's glove-side wrist through deliveries; the catcher's choice of wrist | Drew | stays put, no accidental exits |

Claude can't verify Bluetooth to a real watch, delay, range, sun or battery. Those rows are Drew's, and nothing gets called working until they're done.

## Order
1. **Now:** branch `watch-proto` off `main`; build the watch app, the sender and the first four checks; report.
2. **Watch arrives:** install, pair, desk test, delay.
3. **On the field:** soak, range, bullpen, sun, battery, wear.
4. **Second watch:** pitcher and catcher together. The code supports two from the start, but the real two-watch test waits for the second watch. Each connects with its own tap.
5. **Decide**, from the results and Drew's judgment:
   - native iPad wrapper (Capacitor + Bluetooth plugin);
   - Apple Watch companion app;
   - own band;
   - stop here.

Nothing touches production or `main` without Drew's go.

## Rules and limits
- **Bullpens and practice:** no rule issue.
- **Games:** NFHS 2027 allows one-way communication from the dugout to the pitcher and/or catcher. The NCAA allows one-way devices.
  - For game use, the receipt goes off (it's the device sending back).
  - Check with the conference or state association whether a smartwatch is acceptable.
  - The Bangle has no microphone or camera.
- **Security:** plain Bluetooth, not encrypted.
  - Fine for a prototype: only codes are sent, Programmable is off, and the watch takes one connection at a time.
  - A sold product needs real pairing and encryption.
- **Out of scope:**
  - the iPad sending;
  - Apple Watch;
  - custom hardware;
  - more than two watches;
  - anything the player sends to the coach.

## The iPad
Accept is on the Game screen wherever a watch is connected. In this prototype that means Chrome (PC, laptop or Android). The iPad can't send to a watch until the native wrapper exists (Order step 5), because iPad Safari has no Web Bluetooth. Without a watch, the iPad game works exactly as today.

## Open for Drew
None. Ready to build on `watch-proto` on his go.
