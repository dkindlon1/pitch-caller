# Plan: watch sign security, Nov 18, 2026

Status: **plan, nothing built.** Adds to PLAN_watch_prototype_2026-11-15.md (rev 3) and the watch app already written
in `watch/bangle/` (not yet verified on a real watch). Items marked **(default)** are Claude's suggestion.

## 1. Drew's decisions
| Topic | Decision |
|---|---|
| Pairing | Passkey: the watch shows a 6-digit code once, typed on the laptop. After that they're bonded and nothing else can connect. |
| Messages | Encrypted with a key made fresh for each game, rotated each inning. A captured message is useless. |
| What players see | The plain sign + location (as in the prototype plan). Encryption protects the radio; nothing for players to decode. |
| Lost / stolen watch | Game keys expire after each game; the coach can remove a watch from the team in the portal so it never gets new keys. |
| Haptics | Arrival only (one long buzz = new call, two short = changed call, as already planned). The screen shows the call. |
| Sender | Laptop in Chrome for now; iPad pinned. |

## 2. How it works
1. **Pairing (once per watch):** Bluetooth passkey bonding (Espruino `NRF.setSecurity` with a display passkey;
   **to verify on the watch**). The bond lives on the watch and the laptop's Chrome.
2. **Registering:** after pairing, the game app registers the watch to the team (watch id, role pitcher / catcher,
   date) in the portal's team watch list.
3. **Game key (before each game):** the game app makes a random 128-bit game key and writes it to each registered watch
   over the bonded link. Kept in the watch's memory only (not flash) **(default)**, so a power cycle forgets it.
4. **Inning keys:** both sides derive each inning's key from the game key and the inning number (a standard key
   derivation), so nothing new is sent between innings.
5. **Each message:** the existing call message (message number, call id, sign, location code, changed flag) encrypted
   and authenticated with the inning key (AES in an authenticated mode; Espruino's AES support **to verify**; if only
   raw AES blocks are available, AES-CTR plus a message check code built from it **(default fallback)**).
6. **Replay protection:** the watch rejects any message number it has already seen or older, and any message that fails
   the check. A rejected message never buzzes or shows.
7. **End of game:** the app sends "end game"; the watch wipes the game key. If that message never arrives, the key
   expires after a set time (6 hours **(default)**).
8. **Removing a watch:** the coach removes it in the portal; the game app stops sending it keys and clears the bond
   on the laptop. A removed watch can't receive a new game key without re-pairing with the passkey.

## 3. What the watch shows when security fails
- No game key: "—" plus a small "no key" mark; no buzz.
- Message fails the check: ignored silently (counted for the soak test log).
- The link dot behaves as today.

## 4. Proof
**Before the watch arrives (with the existing fakes and Node):**
1. Encryption code shared or mirrored between sender and watch, checked with fixed test vectors on both sides.
2. Tampered, replayed, wrong-inning and wrong-game messages are all rejected by the watch app code under the fake.
3. Inning rotation: both sides derive the same keys for every inning, including extra innings.
4. Key expiry and end-game wipe under the fake clock.
5. Message size still fits one Bluetooth write (checked).

**When the watch arrives (Drew's desk test, added to the watch README):**
6. Passkey pairing works and an unpaired device can't connect.
7. AES runs on the Bangle and the delay stays game-ready (measured, not assumed).
8. The app's service still works with "Programmable" off.
9. Battery over a soak with encryption on.

## 5. Build steps
1. Encryption + key derivation module (sender) and the watch-side version; test vectors.
2. Pairing flow in the game app (`?watch=1`): pair, register, role.
3. Game key push before first pitch; inning rotation; end-game wipe.
4. Portal: team watch list with remove.
5. Fake-based proof steps 1–5.
6. README additions for the desk test (steps 6–9).

## 6. Open
- If Espruino's AES turns out too slow or missing on the Bangle, fall back to pairing-only encryption for the
  prototype and keep the app-level layer for the custom watch. Decided at the desk test.
