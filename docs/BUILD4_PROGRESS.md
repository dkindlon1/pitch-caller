# Build 4 progress: watch security (fake-tested)

Spec: docs/PLAN_watch_security_2026-11-18.md. Branch feat/watch-security (from main 8ee2fdc). Worktree C:/dev/pc-b4.
Read first: watch/bangle/README.md, app/watch.js, app/watch_test.js, app/watch_e2e.js.

## Steps (plan section 5)
| # | Step | State |
|---|---|---|
| 1 | Crypto + key derivation (sender) and the watch-side copy; test vectors | done: `app/watch_sec.js`, block copied into `watch/bangle/pitchiq.app.js`; `watch_sec_test.js` 22/22 |
| 2 | Pairing flow in the game app (`?watch=1`): pair, register, role | done: passkey on the watch (`NRF.setSecurity`), role buttons, `pc_watch_register` |
| 3 | Game key before the first pitch; inning rotation; end-game wipe | done: key with the first accept of a game and first on every connection; per-inning keys; End game |
| 4 | Portal: team watch list with remove | done: Settings → Watches, `pc_watch_remove`; `watch_rls_test` 19/19; `web/tests/watches_e2e.js` |
| 5 | Fake-based proof steps 1-5 | done: `watch_sec_test`, `watch_test` section 9, `watch/bangle/test.js`, `watch_e2e` |
| 6 | README: desk test steps 6-9 | done |

## Design (taken without asking)
- One 16-byte frame per message: version, key id, inning, message number (2 bytes), 3 bytes AES-CTR, 8-byte CMAC tag.
  Fits the watch's 20-byte characteristic with room; the game key is an 18-byte frame.
- AES-128 in plain ES5 on both sides (the watch uses the firmware's AES if it passes FIPS-197 at start). CMAC per
  RFC 4493; inning keys by SP 800-108 (CMAC PRF), separate encryption and MAC keys.
- Message numbers count up through the game across all watches and connections: the counter block must never repeat
  under one key. A reload makes a new game key, which resets the watch's count.
- Plain heartbeat only while no key is held (liveness); with a key, liveness comes from sealed frames.
- Receipts (A<n>, B<pct>, K<id>) from the watch stay plain: informational, and the link itself is bonded.

## Next
- Done: full run (`run_b4_full.sh`), report, pushed.
