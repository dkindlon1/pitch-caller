# PitchIQ watch app (prototype), Bangle.js 2

Shows the call the coach accepts: the catcher's sign, big, with the location in words under it ("3 / LOW AND OUTSIDE").
"Get it over" shows the sign alone. Pitcher and catcher wear the same thing. Plan: `docs/PLAN_watch_prototype_2026-11-15.md`
(rev 3) in the project.

| On the watch | Means |
|---|---|
| sign + words, one long buzz | a new accepted call |
| sign + words, two short buzzes | the call changed before the pitch (e.g. a shake-off, then a new call accepted) |
| a short bar ("—") | no call right now (between pitches, or waiting for the coach's Accept) |
| **NO LINK** (red) | the link to the coach dropped, or nothing came for 6 s. The call is taken off; the coach gives the sign by hand |
| green / red dot, top right | link up / down |

## Install (Espruino Web IDE, Chrome)
1. Charge the watch. Open https://www.espruino.com/ide in Chrome, click the connect icon (top left) and pick the
   Bangle.js. On the watch, Settings → Bluetooth → **Programmable** must be **On** for this step.
2. Paste `pitchiq.app.js` into the right-hand editor. Next to the Upload button, pick **Storage**, and save as
   `pitchiq.app.js`. Upload.
3. In the left-hand console, run once:
   `require("Storage").writeJSON("pitchiq.info", {id:"pitchiq", name:"PitchIQ", src:"pitchiq.app.js", type:"app"})`
4. Disconnect the IDE (connect icon again). The app's Bluetooth service only appears once nothing is connected.
5. On the watch: Settings → Bluetooth → **Programmable: Off** (nobody nearby can upload code; PitchIQ doesn't need it).
   Settings → **Quiet Mode: Off** (quiet mode can silence the buzz). Don't pair the watch to a phone (notifications
   would cover the call).
6. Open **PitchIQ** from the launcher. If it isn't listed, run `load("pitchiq.app.js")` in the IDE console with
   Programmable on, then turn Programmable off again.

To leave the app, **hold the button 3 seconds**. A short press (a glove) does nothing.

## Connect from the game app
1. Open the game app in **Chrome on a PC, laptop or Android device**, over `https` or `localhost`. For the prototype
   (not deployed), from the repo on the `watch-proto` branch: `cd app && python3 -m http.server 8000`, then open
   `http://localhost:8000/dist/pitch-caller.html`. Not by double-clicking the file: `file://` has no Bluetooth. Not
   the iPad: Safari has no Web Bluetooth.
2. Setup → **Watches** → **Connect a watch**, pick the Bangle. Up to two (pitcher and catcher).
3. Test games: a local practice game, signed out or on the dev project, **never pitchiq-prod**.

## Desk test checklist (what Claude couldn't check)
- [ ] The watch connects; Setup shows its name and battery.
- [ ] Accept puts the sign and words on the watch with one long buzz; "On the watch ✓" on the coach's screen.
- [ ] Every spot reads right: high/low and inside/outside, LOW, CHASE HIGH, CHASE LOW, and the sign alone for "get it over".
- [ ] Shake-off → the watch clears; a new Accept gives two short buzzes.
- [ ] Recording the pitch clears the watch to "—".
- [ ] Walk out of range: NO LINK on the watch, "No link" on the coach's screen; come back: it reconnects by itself.
- [ ] The service works with Programmable **Off**.
- [ ] A short press of the button doesn't leave the app; a 3 s hold does.
- [ ] Sun: the sign and words read at a glance with the backlight off.

## Files
- `pitchiq.app.js`: the app. Its core (`PQCore`) has no Bangle calls, so `test.js` runs it in Node, and
  `app/watch_test.js` drives it through fake Bluetooth from the coach's side.
- `test.js`: `node watch/bangle/test.js`
