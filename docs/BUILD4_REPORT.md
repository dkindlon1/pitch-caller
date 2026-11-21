# Build 4: watch security (fake-tested): report

> **Update, Nov 19 (Drew's follow-ups):** a pairing-only mode was added as a setting (default full encryption), the fallback if AES is too slow on the watch. Counts now: watch_test 106/106, watch app test 80/80, watch_e2e 47/47. See `docs/FOLLOWUPS_1-4_REPORT.md`.

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
Full proof run on the final code: `C:/dev/pitch-caller-logs/run_b4_full.sh`, which builds the game app and the site, runs the watch proofs, then every existing check. Logs are in `C:/dev/pitch-caller-logs/b4full/`.

| Check (plan section 4) | Result |
|---|---|
| **1. Encryption shared between sender and watch, fixed test vectors on both sides:** `app/watch_sec_test.js` | **22/22**. The watch app's crypto block is byte-identical to `app/watch_sec.js`. Both sides pass AES-128 FIPS-197 C.1, all four RFC 4493 CMAC examples, and AES on 300 random blocks against OpenSSL. An independent build from Node's OpenSSL AES (its own CMAC, KDF and AES-CTR) agrees with both sides on pinned vectors and on 400 random messages (every kind, innings 1–255). Each side opens the other's messages; a wrong key, wrong key id or short frame doesn't open. |
| **2. Tampered, replayed, wrong-inning and wrong-game messages rejected by the watch code under the fake:** `app/watch_test.js` section 9 | All rejected, with no buzz and nothing shown: all 128 one-bit changes of a captured call; an older captured call; a forged newer number; a plain-text call in the old format; an inning-2 call after inning 3; a frame relabelled to a later inning; a call captured in the previous game; any call after End game; a game key over a link that isn't passkey-bonded. A removed watch gets no key and is forgotten. |
| **3. Inning rotation, extras included** | Both sides derive identical keys for innings 1–255, all 510 distinct (`watch_sec_test`). In `watch_test` the watch follows innings 1, 2, 3 and 10, 11, 12 with no new key sent between innings. |
| **4. Key expiry and end-game wipe under the fake clock** | End game wipes both sides' keys (`watch_test`; and in the real page with two watches, `watch_e2e` section 12). Expiry: a dropped link keeps the key; at 5 h 59 m 59 s on the fake clock it's still there; past 6 h the watch's own tick wipes it. |
| **5. Message size fits one Bluetooth write** | Sealed message 16 bytes, game key 18, every write in every run ≤ 20 (largest 18). `watch_e2e` checks the air in the real page carries only the key once per connection and 16-byte frames, with no plain-text call, spot word, watch name or pitcher name. |
| The watch flow end to end on the fakes | `watch_test` **86/86** (sections 1–8, the prototype's whole flow under encryption, plus 9). `watch_e2e` **41/41** (Accept, clears, shake-off as a change, shared signs, two watches, soak, End game, in the built app). `watch_optin_e2e` 17/17. `watch/bangle/test.js` **68/68**: the watch app against stand-in firmware, covering pairing settings, every spot drawn, key rules, NO LINK, and the firmware AES used only when it gives the right answer (7 block operations for an inning's first call, 3 after). |
| Team watch list: `supabase/test/watch_rls_test.js` | **19/19**: a caller registers; every coach sees; head coach or owner removes; a caller can't put a removed watch back; players, other teams and signed-out visitors see nothing; no direct writes. |
| Portal Settings → Watches: `web/tests/watches_e2e.js` | **11/11** (after two fixes to the test itself: text matches inside the hidden confirm, and waiting for the redirect). Covers list, roles, remove with confirm, notice, the removed state, the database row, the game app's list call, phone width. |
| Web chain: tsc, `npm test`, `next build`, site e2e | all pass |
| SQL tests, each alone | sync 38, client_review 37, sync_auth 9, app_sync_e2e 37, rls_matrix 347, waitlist 22, v12_sessions 11, watch_rls 19: pass. `review_test` 28/29 (the baseline's known failure). **`v11_kinds_test` fails** by construction, as in Builds 1–3 (it now names this build's migration). |
| Portal e2es | shell 43, offline_game 22, portal 30, billing 52, player_admin 24, uploads 33, retention 10, gameplan 38: all pass |
| `scripts/test-app.sh` | every suite passes. Two runs stopped on test problems, both fixed: (1) `watch_e2e`'s "nothing readable" rule (any 4 letters in a row) could be tripped by random ciphertext, so it now looks for the actual plaintext; (2) `fold_e2e`'s fake watches (`app/shots_v2.js`) didn't speak the sealed protocol. The steps after the stop (fold_e2e 112, watch_optin_e2e 17, sync_pill_e2e 16, readout_sessions_e2e 6) were then run through the same runner. |
| Screens: `C:/dev/pitch-caller-shots/build4/` | Settings → Watches at 1440 (list, confirm, removed) and 390 (no sideways scroll) |

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
