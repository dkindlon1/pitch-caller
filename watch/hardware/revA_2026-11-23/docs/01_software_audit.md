# 1. Software audit: what the PitchIQ watch app needs from hardware

Source read: `dkindlon1/pitch-caller` at `8bcf909` (main, Nov 20 2026). Files: `watch/bangle/pitchiq.app.js` (325 lines),
`watch/bangle/README.md`, `app/watch.js` (507 lines, the coach-side sender), `app/watch_sec.js`.
Firmware reference: `espruino/Espruino` at `46b13ba` (Nov 23 2026), `boards/BANGLEJS2.py`, `libs/banglejs/jswrap_bangle.c`.

**Status of the software itself:** it has only run against fake watches in Node (`BUILD_watch_prototype_REPORT.md`,
"Not verified"). It has never run on a real Bangle.js 2. Every requirement below is read from source, not measured.

## What it does
A Bluetooth LE peripheral. The coach's laptop (Chrome Web Bluetooth) writes ≤20-byte frames to one characteristic; the
watch decrypts/authenticates them (AES-128 CTR + CMAC), shows the sign (a digit) and the location in words, buzzes, and
optionally notifies a receipt and battery level back. Nothing else.

## Software-to-hardware dependency matrix

| Software feature | Evidence (pitchiq.app.js line) | Hardware it needs | Class |
|---|---|---|---|
| Espruino JS runtime, `Bangle`, `NRF`, `E`, `g` globals | whole file; `typeof Bangle` L278 | nRF52840 running Espruino built with the Bangle.js 2 API (`jswrap_bangle.c`) | Essential |
| Custom GATT service, 1 write + 1 notify characteristic, maxLen 20 | L27–29, L301–309 | BLE radio + antenna, SoftDevice S140 | Essential |
| Passkey pairing with LE Secure Connections, bonding, whitelist | L293–297, L310 | SoftDevice peer manager; internal flash pages for bonds (no extra part) | Essential |
| 20 ms connection interval | L315 | radio; sets the active current | Essential |
| Draw 176×176, white ground, black text, red/green link dot, Vector font up to 150 px | L241–269 | LPM013M126 176×176 3-bit memory LCD on SPI (`LCD_MEMLCD` driver) | Essential |
| "black on white: the most readable in sun" with backlight off | L244, README "Sun" check | reflective display (no backlight needed by day) | Essential |
| `Bangle.setLCDPower(1)` on each new call ("backlight flashes briefly… night games", plan rev 3) | L299 | LCD backlight LED + switch on the `LCD_BL` pin | Conditionally required (night games) |
| `Bangle.buzz(450)` / two 120 ms buzzes | L270–273 | vibration motor + driver on `VIBRATE` pin (PWM, active high) | Essential |
| `Bangle.setUI({btn})`, `btnLoadTimeout: 3000` (hold 3 s to leave) | L321–322 | one push button on `BTN1` | Essential |
| `E.getBattery()` every 60 s | L306, L317 | battery voltage divider on an ADC pin (`BAT.pin_voltage`) | Essential |
| (firmware) `Bangle.isCharging()` — not called by the app | — | charger status line | Optional (useful for bring-up/production test) |
| App stored in `Storage` as `pitchiq.app.js` (21 kB) + `.info` | README Install | On Bangle.js 2 `Storage` lives entirely in the external 8 MB SPI flash (`saved_code.address 0x60000000`) | Essential as built (see note) |
| `require("crypto").AES` if present, else JS AES | L280–290 | none (software; `AES` lib is in the build) | Optional |
| `setInterval` 1 s tick, 60 s battery | L317, L323 | 32.768 kHz clock for low-power timing (`ESPR_LSE_ENABLE`) | Essential |
| Sender filter `namePrefix: "Bangle"` | app/watch.js L335 | none: firmware advertising name must start with "Bangle", or change one line in the sender | Firmware setting |
| Touch, accelerometer, magnetometer, GPS, heart rate, pressure, step count | not referenced anywhere | CST816S, KX023, mag, GPS, VC31, BMP280/SPL06 | **Unnecessary** |
| Second button, speaker, mic, NFC | not referenced | — | Unnecessary |

Note on storage: internal-flash storage is possible (`BANGLEJS2_IFLASH.py` exists upstream) and would remove the SPI
flash, but the default boot code, fonts and launcher assume the external flash and the bootloader can update from it.
Keeping the 8 MB flash is the lower-risk choice; removing it is a later cost-down.

## Resource needs
- CPU/RAM: the stock build gives 12,000 JS variables; the app holds a few small typed arrays (176-byte key schedule,
  16-byte frames). No measured figure exists; headroom is expected to be large. **Unverified until run on a watch.**
- AES: one CMAC + one CTR block per message. Speed in JS on the watch is an open item in the README ("game-ready means
  under 300 ms"). Not a hardware selection driver: the same nRF52840 is kept.
- Storage: ~25 kB of app files.

## Can it run unchanged on a custom board?
Yes, if the board presents the same firmware API. The app touches hardware only through `g`, `Bangle.buzz`,
`Bangle.setLCDPower`, `Bangle.setUI/setOptions`, `E.getBattery`, `NRF.*` and `Storage`. A board that keeps the nRF52840,
the same LCD, a motor, a button, a battery divider and the SPI flash **on the same pins as BANGLEJS2.py** needs no app
change and, as a fallback, could boot the stock Bangle.js 2 firmware image. What cannot be claimed: that the stock
firmware boots cleanly with the sensors absent (touch, accelerometer etc. are probed at start). That is a bring-up test.
