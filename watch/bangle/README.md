# PitchIQ watch app (prototype), Bangle.js 2

Shows the call the coach accepts: the catcher's sign, big, with the location in words under it ("3 / LOW AND OUTSIDE").
"Get it over" shows the sign alone. Pitcher and catcher wear the same thing. Plan: `docs/plans/PLAN_watch_prototype_2026-11-15.md`
(rev 3), in the repo at `docs/plans/` and in the project.

| On the watch | Means |
|---|---|
| sign + words, one long buzz | a new accepted call |
| sign + words, two short buzzes | the call changed before the pitch (e.g. a shake-off, then a new call accepted) |
| a short bar ("—") | no call right now (between pitches, or waiting for the coach's Accept) |
| **NO LINK** (red) | the link to the coach dropped, or nothing came for 6 s. The call is taken off; the coach gives the sign by hand |
| green / red dot, top right | link up / down |
| "no key" under the bar | this game's key hasn't arrived (the coach's app sends it with the first call of the game); nothing can show until it does |
| "Pair 123456" at the bottom | not paired yet: type this code on the laptop when Chrome asks |

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

## Security (docs/PLAN_watch_security_2026-11-18.md)
- **Pairing, once per watch:** the first connection asks Chrome (Windows / macOS / Android) for the 6-digit code the watch
  shows. The watch asks for LE Secure Connections, so a recording of the pairing can't be cracked later. After that the
  watch and that laptop are bonded, and only bonded devices may connect and write.
- **A fresh key every game:** the game app makes a random 128-bit key for each game and sends it to each watch over the
  bonded link. The watch keeps it in memory only (a restart forgets it) and wipes it at **End game**, or after 6 hours if
  the game was never ended.
- **Every call is sealed:** encrypted and authenticated with a key derived for that inning (AES-128, CTR + CMAC, in
  16 bytes). The watch drops, silently, anything that fails the check, repeats an older message, comes from an earlier
  inning or another game, or arrives in plain text. A dropped message never buzzes or shows.
- **Lost or stolen watch:** remove it in the portal (team **Settings → Watches**). No device on the team will send it
  another key: each laptop asks the team's list before it sends a key, so a laptop that hadn't heard of the removal yet
  can't undo it. To use it again, pair it again (Setup → Watches → **Connect a watch**, with its code) as a coach who
  manages the roster; only that deliberate pairing re-adds it.
- **Reconnecting:** the laptop sends the same game key again; the watch keeps its message count, so nothing captured
  before the reconnect can be replayed.
- Players see what they always saw: the sign and the spot. The encryption only protects the radio.
- **Pairing-only mode** (Setup → Watches → Message security; full encryption is the default): the fallback if the
  watch's AES is too slow. No game key; calls go in plain text over the bonded link only; message numbers still refuse
  replays; End game and the 6-hour limit end the session the same way.

## Connect from the game app
1. Open the game app in **Chrome on a PC, laptop or Android device**, over `https` or `localhost`. For the prototype
   (not deployed), from the repo on the `watch-proto` branch: `cd app && python3 -m http.server 8000`, then open
   `http://localhost:8000/dist/pitch-caller.html?watch=1`. Once deployed: `/app/game/?watch=1`. The `?watch=1` turns
   the watch features on for this browser only (they stay on; `?watch=0` turns them off). Not by double-clicking the
   file: `file://` has no Bluetooth. Not the iPad: Safari has no Web Bluetooth.
2. Setup → **Watches** → **Connect a watch**, pick the Bangle. The first time, type the code the watch shows when Chrome
   asks to pair. Up to two; mark each **Pitcher** or **Catcher** (the first is the pitcher's until you change it). Signed in,
   each one is added to the team's watch list.
3. Test games: a local practice game, signed out or on the dev project, **never pitchiq-prod**.

## Desk test checklist (what Claude couldn't check)
Security (plan section 4, items 6-9; Build 4 tested everything else against fake watches and Node):
- [ ] **Pairing:** the first Connect shows the watch's 6-digit code and Chrome asks for it; after typing it, Setup shows
      "game key ✓" once a game starts. (`NRF.setSecurity` with a display passkey, MITM and `lesc: 1`; not run on a real watch.)
- [ ] **The bond is LE Secure Connections:** after pairing, in the IDE console (or the app's debug line),
      `NRF.getSecurityStatus()` shows `encrypted: true`, `mitm_protected: true` and, where the firmware reports it,
      `lesc: true`. On Windows, Settings → Bluetooth → the Bangle → properties lists the pairing as "LE Secure Connections";
      on Android, nRF Connect's bond info does. If it says legacy pairing, the firmware or the OS didn't take `lesc`: note
      which, and don't use full encryption in a real game until it's fixed.
- [ ] **An unpaired device can't connect or write:** from a second laptop or phone (nRF Connect), try to connect and to
      write to the PitchIQ characteristic: refused (it should not even get a connection once the watch is bonded). (`NRF.setWhitelist(true)` and `security: { write: { encrypted, mitm } }`
      on the characteristic; Espruino's behaviour here is unverified.)
- [ ] **Removing a watch:** remove it in Settings → Watches while the game app is open on a second laptop that still has
      it connected; drop the link (walk away) and come back: that laptop must not send a key ("game key" never shows ✓)
      and forgets the watch. Then Connect again from the laptop: refused. Check whether Chrome's own pairing (the OS bond)
      also needs removing in the OS Bluetooth settings; re-adding it should show the 6-digit code again.
- [ ] **AES on the Bangle:** in the IDE console, `PQSec.isNative()` says whether the firmware's AES passed the start-up
      check (else the app's own JavaScript AES runs). Time it: `t=getTime(); for(i=0;i<20;i++) PQSec.inningKeys(new Uint8Array(16),i+1); print((getTime()-t)/20)`
      (one new inning) and the time from Accept to the buzz over 20 calls: **game-ready means under 300 ms** from Accept
      to buzz.
- [ ] **If AES is too slow** (Accept to buzz over 300 ms with full encryption): switch to pairing-only, Setup → Watches →
      Message security → **Pairing only**, and run the Accept-to-buzz timing again. Calls then go over the paired link
      without the extra encryption layer (old message numbers are still refused, and only the bonded laptop can write).
      Note which mode the watch was game-ready in.
- [ ] **The service still works with Programmable off** (Settings → Bluetooth → Programmable: Off), including pairing.
- [ ] **Battery over a soak with encryption on:** `?watch=1&watchsoak`, Setup → soak at 5 s for 2 hours; note the battery
      before and after (the receipts show it).
- [ ] **End game** on the coach's screen: both watches show "—" and "no key".
- [ ] **Restart the watch mid-game:** it comes back with "no key"; the next call (or Reconnect) sends the key again.

The prototype's own checks:
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
  `app/watch_test.js` drives it through fake Bluetooth from the coach's side. The crypto block between the `PQSEC`
  markers is a copy of `app/watch_sec.js` (the coach's side); `app/watch_sec_test.js` checks they're identical and runs
  the published AES / CMAC test vectors on both.
- `test.js`: `node watch/bangle/test.js`
