# Review: watch prototype plan (Nov 15)

Reviewed `PLAN_watch_prototype_2026-11-15.md` (rev 1) against the game app on `main` (`4da21eb`, v1.2.3: `app/index.src.html`, `engine.js`, `build.py`, `web/scripts/game-shell.mjs`), Espruino/Bangle docs and Web Bluetooth behaviour. **Every fix below is now in rev 2 of the plan except the three decisions at the end.** This is my own review, not a fresh-context one.

## Must fix (each would break the test or give a wrong result)

| # | Gap | Fix in rev 2 |
|---|---|---|
| 1 | **The same call twice in a row never reaches the watch.** Rev 1 sent only when pitch, spot or coach flag changed. Fastball up-in, ball, then fastball up-in again looks unchanged, so the watch stays on "—". | Each call gets an id (a counter in the game, set in `makeCall` and the coach's `pickBox`), and the watch is sent the call whenever the id changes. |
| 2 | **After a page reload the watch ignores every call.** The sequence number restarts at 1 and the watch drops anything older than what it last saw. Undo has the same problem: it restores an old call. | Two separate numbers. The **call id** is only for spotting a change on the coach side. The **message number** always counts up, and the watch resets it on every new connection. |
| 3 | **Retries re-buzz.** A retry after a lost receipt would buzz the catcher again. | Same message number again → the watch re-sends the receipt and doesn't buzz. |
| 4 | **Overlapping Bluetooth writes fail.** Chrome refuses a write while one is in progress ("GATT operation already in progress"), and rev 1 had heartbeats, calls and retries that could collide. | One write queue. A new call removes any older call still waiting in the queue. |
| 5 | **"Chase" has no direction in rev 1.** In the engine, a chase is *above* the zone for fastballs (FB, SI, FC) and *below* it for SL, CB and CH (`yTarget`, `targetHeight` in `engine.js`). | The grid draws chase by pitch type, using the engine's own rule. A watch test covers it. |
| 6 | **The rev 1 link sends code to the watch.** That needs the watch's "Programmable" setting on, which lets anyone nearby connect and upload code. The fixes rev 1 named are shaky: Bangle's own docs mark passkey as beta with likely Web Bluetooth problems, and users report the whitelist failing on reconnect. | The watch app opens its **own Bluetooth service** that accepts data, not code. Programmable stays off except when uploading the app. This also removes any guessing about echo and REPL output. To confirm on the watch: the service works with Programmable off. |
| 7 | **The watch app can be closed by a stray press.** On a Bangle the button goes back to the clock, and a catcher's glove will hit it. | The app takes over the button (a long press to exit), keeps itself open, and the phone/notification pairing stays off. If the app isn't open, no receipt comes back and the coach sees "Not on the watch". |
| 8 | **The 300-call bullpen isn't realistic.** No catcher catches 300 pitches for a test. | A **soak mode** (hidden, dev-only) sends a new random call every 5 s for an hour (~720 calls) with the watch at mound distance and counts receipts. Then a normal bullpen (~40–60 pitches) checks the real flow. |
| 9 | **Test setup traps.** Opening `app/dist/pitch-caller.html` straight from disk (`file://`) has no Web Bluetooth. And a test game played through the portal lands in pitchiq-prod, which just had to be cleaned. | Run the game app from `/app/game/` (https) or `localhost`. Test games are local practice games, signed out or on the dev project, never pitchiq-prod. |

## Should fix

| # | Gap | Fix in rev 2 |
|---|---|---|
| 10 | Rev 1 never defined "the call changed" (the double buzz). | A call that replaces another **before a pitch is recorded** (shake-off, coach call, pitching change, undo) is a change: two short buzzes. The first call after a recorded pitch is new: one long buzz. |
| 11 | Two pitches of the same type share a sign (two sliders both show 3). The app allows this today; on the watch they look identical, and in sign-only mode there's no way to tell them apart. Also true on the iPad now. | Setup warns when two active pitches share a sign. The watch adds a 2–3 letter label for those pitches only. |
| 12 | **The delivery receipt is the device talking back.** NFHS softball's 2027 guidance says players may not transmit information back through the device. Baseball's wording likely reads the same way. | The receipt can be switched off. With it off, each call is sent three times and the watch drops the repeats. Bullpens keep it on (no rules apply). Note for later: the Bangle has no microphone, while an Apple Watch does, and NFHS bars audio/video devices on players. |
| 13 | Reconnecting was vague. | A dropped link reconnects automatically with no tap while the page stays open. Only a page reload needs a Reconnect tap. The watch shows NO LINK the moment it disconnects, not 6 s later. |
| 14 | "Tap → buzz under 0.5 s" didn't say which tap. The engine's at-bat solve can take noticeable time at the start of an at-bat. | Measure from the call appearing on the coach screen to the buzz. Log engine time separately, since the pitch clock limits how long all of it can take. |
| 15 | Nothing on the watch shows when a call is stale. | Show the count (e.g. 2-1) small under the call. |
| 16 | Where the watch settings live. | On the device only, not in the synced setup or game plan. |
| 17 | The new tests could sit outside CI. | They're added to `scripts/test-app.sh`, so CI runs them. |
| 18 | A laptop in the dugout is awkward. | Any Android phone or tablet with Chrome also has Web Bluetooth and can be the field sender. If range is short, try a USB Bluetooth adapter with an external antenna. |

## Checked and fine
- The hook point: every call is assigned in `makeCall`, the coach's `pickBox`, or cleared (`G().call = null` after roster/setup changes, which sends a clear).
- `build.py` can inline one more module.
- No `Permissions-Policy` header blocks Bluetooth on `/app/game/`.
- The iPad (Safari) has no `navigator.bluetooth`, so hiding the watch UI there leaves the iPad untouched.
- Rules: NFHS 2027 allows one-way to the pitcher and/or catcher from the dugout. The NCAA allows one-way devices.
- The intentional-walk suggestion isn't sent. The coach decides that, as today.

## Decisions for Drew
1. **Auto-send or Send button?** Today the coach sees the call before the catcher does and can change it.
   - Auto-send: the catcher gets every engine call the instant it's made. A coach change arrives as a changed call (two buzzes), and while the coach's own-call panel is open the watch shows WAIT.
   - Send button: one extra tap per pitch, but nothing reaches the catcher until the coach agrees.
2. **Watch screen:** sign + pitch type + grid, or sign + grid only?
3. **Second watch:** now, or after the single-watch tests?
