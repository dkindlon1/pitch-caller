# PitchIQ watch core (portable C99)

The hardware-independent logic of the Bangle.js watch app (`watch/bangle/pitchiq.app.js`) ported to C99, plus host tests
that show the C behaves identically to the JavaScript.

| File | What it is |
|---|---|
| `pq_sec.h/.c` | `PQSec`: AES-128 block encrypt (const S-box, no allocation), CMAC (RFC 4493), SP 800-108 KDF, per-inning keys, `pq_seal`, `pq_open` (constant-time tag compare), key-frame build/parse. `pq_sec_set_aes(fn)` swaps in a hardware AES-ECB function (NULL = software again). |
| `pq_core.h/.c` | `PQCore(io)`: `struct pq_core` with `pq_core_init / on_connect / on_disconnect / on_write(data, len) / tick / view`. Hardware only through `struct pq_io` (draw, buzz, light, notify, now_ms, secure). |
| `tests/gen_vectors.js` | Loads the original JS the way `watch/bangle/test.js` does (vm, no `Bangle`), runs it, writes `tests/vectors.json`. Deterministic (fixed seed). Also checks its own AES output against OpenSSL and its CMAC against RFC 4493. |
| `tests/vectors.json` | Generated. Crypto vectors and scenario traces (checked in so `make test` works without node). |
| `tests/test_core.c` | Replays every vector and scenario step against the C and compares everything observable. |

The code under test uses only `string.h`, `stdint.h`, `stdbool.h`, `stddef.h`: no malloc, no floating point. The test file
itself uses stdio/malloc (it parses JSON).

## Run

    make vectors   # regenerate tests/vectors.json with node (PQ_JS=/path/to/pitchiq.app.js to point at another copy)
    make test      # gcc -std=c99 -Wall -Wextra -Werror -O2, run; then again with -fsanitize=address,undefined

`make test` runs the whole comparison twice, once with the software AES and once with a hook installed through
`pq_sec_set_aes()` (the hook wraps the software cipher, so it proves the plumbing, not a real chip).

## Using it on the watch

Fill a `struct pq_io` (`user` is passed back as the first argument of every callback), `pq_core_init`, then call
`pq_core_on_connect/on_disconnect` from the link events, `pq_core_on_write` with each write from the coach's app, and
`pq_core_tick` about once a second. `now_ms` can be any millisecond clock that does not run backwards; it is 64-bit.
`notify` receives the receipt text (`K42`, `P`, `A7`, `B..`) as bytes, not NUL-terminated. In `struct pq_view`, `sign == NULL` means
no call (the JS `words: null`); `nwords == 0` with a sign is the "get it over" call (the JS `words: []`). `pq_core.rejected` is
the JS `rejected` counter (32-bit here).

## What is compared

Scenarios: 82, about 1,900 steps, each step's full output (every draw with link/nokey/sign/words, buzz kind, light, notify
text, in order), the `view()` afterwards, and the JS `st` fields `rejected`, `lastN`, `inning`, `mode`, `link`. They cover
the full-mode happy path, changed call, clear, end, replay of an older number, repeat of the same number (receipt, no buzz),
forged tag and every tampered byte, wrong key id, other game's key, earlier inning, key frame over an insecure link, same key
re-sent after reconnect, new key, pairing-only mode (valid, malformed, big numbers, insecure link, replay/repeat), plain text in
full mode, heartbeat with and without a key, link timeout (boundary at exactly 6000 ms) then repeat restores the held call,
link timeout then newer/older message, disconnect clears, 6 h key expiry (boundary and refresh), n at 65535, inning 255, valid
tags with bad bodies, odd lengths, and 12 randomized scenarios from a fixed seed (garbage, forged and tampered frames, key
and mode changes, clock jumps).
Crypto: 44 AES blocks, 36 CMACs (lengths 0, 1, 8, 15, 16, 17, 20, 31, 32, 33, 40, 47, 48, 64, 65, 100), 17 KDF outputs, 28
inning keys, 60 sealed frames (round-tripped through `pq_open`), 37 `open` cases (flipped bytes, wrong key id, bad bodies), key
frames; plus FIPS-197 C.1 / appendix B and the four RFC 4493 examples typed directly into `test_core.c`.

A mutation check was done by hand while writing this (a `>` turned into `>=` in the link timeout, dropping a tag byte from the
compare, and so on all make the test fail), but it is not part of `make test`.

## Not covered

- Everything in the JS after the core: drawing, buzz patterns/timing, the BLE service, pairing/passkey/LESC, `NRF.getSecurityStatus`,
  the real `require("crypto").AES`, the timers. Those are watch glue and need the desk test on the hardware.
- A real hardware AES behind `pq_sec_set_aes()`, and speed or stack use on the target (the software cipher keeps a 176-byte
  round-key schedule and a few 16-byte buffers on the stack; `struct pq_core` is 176 bytes on a 64-bit host).
- The coach side (`app/watch_sec.js`) beyond using the same `seal`/`keyFrame` byte layout.
- Clock wrap-around of `now_ms` (the code uses 64-bit milliseconds and a signed difference, like the JS's plain subtraction).
- `pq_seal` with an inning above 255: the C parameter is a byte (the JS throws for 256).

## Known differences from the JS

- Plain pairing-mode message numbers: the JS accepts any `n` for which `String(parseInt(s)) === s`, including a few values
  above 2^53 that happen to print exactly (for example `10000000000000000`). The C accepts canonical decimal numbers up to
  2^53 (9007199254740992) and rejects anything larger. A real coach app never sends such a number. The tests cover 2^53-1, 2^53,
  2^53+1, 2^32 and a 30-digit number, which agree.
- `held.n === n` in the JS repeat branch is always true (`held` is cleared whenever `lastN` changes), so the C keeps the check only for fidelity.

## JS behaviours that looked surprising or suspect (C is kept faithful; none changed)

1. Any write, even one that is dropped (forged, garbage, wrong length), refreshes `lastRx` and brings a dead link back to
   "linked" (green dot, NO LINK removed). The 6 s liveness is therefore not authenticated. (Writes need the bonded link, so
   this is probably acceptable, but it is not what "no message for 6 s" suggests.)
2. A heartbeat or any message with a newer number after a link timeout clears `held` (JS line 220), and the earlier call's
   number is then "older", so a repeat of the call is dropped: the call cannot be restored. If the coach app sends a
   heartbeat before repeating the call after a reconnect, the held-call feature never fires. Test:
   `heartbeat_after_timeout_forgets_held`.
3. In pairing-only mode there is no cap on `n` (full mode is capped at 65535 by the frame). One authenticated-link message such as
   `C9007199254740991,...` makes every later message "older" until `P`, `E` or a new key. And `P` resets `lastN`
   to 0 (it wipes), so re-sending `P` re-opens the replay window for pairing-only messages (it needs the secure link). A secure-link
   `P` in full mode also drops the game key (a downgrade). Tests: `pairing_P_again_resets_count`, `pairing_big_numbers`,
   `pairing_to_full_and_back`.
4. `H` (plain heartbeat) is accepted in pairing mode and with no key without any `secure()` check and without counting as
   rejected; in full mode it counts as rejected.
5. A repeat is any message with the same number, whatever its content or kind (`clear` with the number of the shown call only
   gets a receipt). Fine for a coach that never reuses a number; test `full_repeat_number_other_content` pins it.
6. `keyAt` (the 6 h clock) is set only by a key frame or `P`; valid messages do not extend it, so a key that is never re-sent
   expires 6 h after it arrived even in active use. Re-sending the same key extends it (`key_refresh_extends_expiry`).
7. `rejected` can grow without limit in JS; here it is a `uint32_t` (wraps at 4 billion).
