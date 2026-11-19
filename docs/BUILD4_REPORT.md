# Build 4: watch security (fake-tested): report

Branch `feat/watch-security` (from `main` 8ee2fdc), pushed. Spec: `docs/PLAN_watch_security_2026-11-18.md`, section 5
steps 1–6. Everything was proved against the existing fakes (fake Web Bluetooth running the real watch core, fake
Bangle firmware in Node, a fake clock) and the local Supabase. **Nothing ran on a real watch**; those items are under
"Not verified" and in the README's desk-test list. Local Supabase only; nothing on `main`, nothing deployed, no
production migration. Working notes: `docs/BUILD4_PROGRESS.md`.

## What was built
- **Crypto, one code on both sides** (`app/watch_sec.js`; the identical block sits in `watch/bangle/pitchiq.app.js`
  between `PQSEC` markers, because Espruino uploads one file):
  - AES-128 in plain ES5. On the watch, the firmware's AES is used when it gives the FIPS-197 answer at start-up;
    otherwise the app's own runs.
  - CMAC (RFC 4493).
  - Inning keys from the game key by NIST SP 800-108 (counter mode, CMAC as the PRF): one key to encrypt and one to
    authenticate, per inning. Nothing is sent between innings.
- **The sealed message**: 16 bytes in one Bluetooth write (the watch's characteristic takes 20).
  - Bytes 0–4: version, game key id, inning, message number (2 bytes).
  - Bytes 5–7: the call (sign, spot, changed flag), AES-CTR encrypted.
  - Bytes 8–15: an 8-byte CMAC tag over the first 8 bytes.
- **Pairing** (plan 2.1):
  - The watch asks the firmware for passkey pairing with MITM protection (`NRF.setSecurity`), and shows the 6-digit
    code ("Pair 123456") until it's bonded.
  - Writes need an encrypted, passkey-protected link (characteristic `security`).
  - Once bonded, only bonded devices may connect (`NRF.setWhitelist(true)`).
- **The game key** (plan 2.3):
  - 16 random bytes per game (Web Crypto), made with the first Accept of a game.
  - Sent as the first write of every connection while a game is on.
  - The watch takes it **only over the encrypted, passkey-bonded link** and keeps it in memory only.
  - **End game** on the coach's screen wipes it on every watch. A key nobody ended expires on the watch after 6 hours.
- **The watch's rules** (plan 2.6, 3): it drops silently, with no buzz and nothing shown:
  - A message that fails the check.
  - An older message number (a replay), or one from an earlier inning or another game.
  - A plain-text call in the old format.

  It shows "—" with "no key" until the key arrives. A plain heartbeat counts for liveness only while no key is held.
- **Message numbers count up through the whole game, across both watches and every reconnect.** They are part of the
  CTR counter block, so they must never repeat under one key; the prototype's numbering restarted on each connection.
  A reload makes a new game key, which resets the watch's count, so a reload can't leave a watch stuck.
- **Team watch list**: migration `20261119020000_watch_security.sql` (`team_watches`, `pc_watch_register`,
  `pc_watch_remove`, `pc_watch_list`).
  - The game app registers each paired watch with its role. Pitcher or catcher is chosen in Setup → Watches; the
    first watch defaults to pitcher.
  - Team **Settings → Watches** in the portal lists them and removes one, with a confirm step.
  - A removed watch is never sent another key by any device on the team. The app keeps the list on the device, so a
    removal holds offline, and forgets the watch. Only a coach who manages the roster can put it back, after it's
    paired again.
- **README**: a security section, what the watch shows, and desk-test items 6–9 plus more (see "Not verified").

## Commands and results
B4_RESULTS

## Readings and proposals
1. **Receipts from the watch stay plain** (`A<n>` receipt, `B<pct>` battery, `K<id>` key received). They only feed
   the coach's "On the watch ✓" and battery readout, and the link is bonded. Sealing them is possible later.
2. **The 8-byte tag** (64 bits) is the standard truncation for short messages. With replay protection, a forger would
   need about 2^64 tries over Bluetooth in one game.
3. **Removing a watch** stops keys and makes this browser forget it (`device.forget()` where Chrome has it). The
   operating system's own Bluetooth bond may stay until it's removed in the OS settings; that's on the desk-test list.
4. **The soak test** (dev only, `?watchsoak`) now runs under its own game key; after a soak, the next real game makes a
   fresh one.
5. **If Espruino's AES is missing or too slow**, the plan's fallback (pairing-only encryption for the prototype) is not
   built. The firmware check falls back to the JavaScript AES, which needs timing at the desk (README).

## Not verified (needs the real watch: README desk-test list)
- Passkey pairing in Chrome with the Bangle, and that an unpaired device can neither connect nor write
  (`NRF.setSecurity`, `NRF.setWhitelist`, characteristic `security` options: Espruino behaviour assumed from its docs).
- `NRF.getSecurityStatus()` reporting `encrypted` and `mitm_protected` as the watch core expects.
- AES speed on the Bangle (firmware or JavaScript) and Accept-to-buzz delay with encryption. Target under 300 ms.
- The service with "Programmable" off; battery over a soak with encryption on.
- Whether the OS-level bond needs removing by hand after a watch is removed.
