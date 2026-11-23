# PitchIQ watch firmware (rev B), Zephyr v4.4.2

First working firmware for the custom watch (nRF52840 in a Raytac MDBT50Q module). The message logic is the tested portable C in
`core/` (not modified); everything else here is hardware glue.

## Layout

| Path | What |
|---|---|
| `core/` | `pq_core`, `pq_sec`: state machine and crypto, host-tested. Compiled into the app unchanged. |
| `boards/pitchiq/pitchiq_watch/` | Board (hardware model v2): `pitchiq_watch.dts`, `pitchiq_watch-pinctrl.dtsi` (**every pin number is a `PQ_PIN_*` define at the top of this file**), `Kconfig.pitchiq_watch`, `pitchiq_watch_defconfig`, `board.cmake`, `board.yml`, `pitchiq_watch.yaml`, `pre_dt_board.cmake`. |
| `app/prj.conf`, `sysbuild.conf`, `sysbuild/mcuboot.conf` | Configuration. MCUboot swap-using-move, ECDSA P-256, RTT logging, LE Secure Connections only. |
| `app/boards/nrf52840dk_nrf52840.{overlay,conf}` | DK stand-ins: LED1 = buzz, LED2 = frontlight, button 1 = watch button. |
| `app/boards/pitchiq_watch.conf` | Watch-only options (charger driver off, see below). |
| `app/Kconfig` | `PQ_HAVE_*` (follow the devicetree), `PQ_BATTERY_STUB`, `PQ_NPM1300_STOCK_CHARGER`, gesture and policy options. |
| `app/src/main.c` | Start-up order, health flag for the update confirmation. |
| `app/src/app_glue.c` | Binds `struct pq_io`; one work-queue thread runs the core; 1 s tick; button gestures; battery receipts; MCUboot confirm; idle-policy hook. |
| `app/src/ble_pq.c` | GATT service (same three UUIDs as the JS), pairing/bonding, accept list, advertising, mcumgr guard. |
| `app/src/ui.c`, `ui_render.[ch]` | Display API and frontlight; `ui_render` is pure C (the 5x7 font and layout) and was checked on a host. |
| `app/src/haptics.c` | 450 ms buzz (new), 2 x 120 ms 120 ms apart (changed), via `k_work`. |
| `app/src/power.c` | nPM1300: battery, charger, button, ship mode. DK stub. |
| `app/src/sensors.c`, `hr_est.[ch]` | LIS2DH12 motion; MAX30101 heart rate (off by default) and the integer peak-interval estimator. |

## Build

    export ZEPHYR_TOOLCHAIN_VARIANT=gnuarmemb GNUARMEMB_TOOLCHAIN_PATH=/usr
    cd /home/claude/zws
    west build -p always -b pitchiq_watch --sysbuild -d build_pitchiq \
        /home/claude/pitchiq-watch/watch/firmware/app -- -DBOARD_ROOT=/home/claude/pitchiq-watch/watch/firmware
    west build -p always -b nrf52840dk/nrf52840 --sysbuild -d build_dk \
        /home/claude/pitchiq-watch/watch/firmware/app

`imgtool` (MCUboot signing) needs the Python module `cbor2`; it was missing in this workspace and was `pip install`ed.
The signing key is MCUboot's **debug key** (`root-ec-p256.pem`, CMake warns). Before any real watch ships, set
`SB_CONFIG_BOOT_SIGNATURE_KEY_FILE` to your own key; a watch built with the debug key accepts updates signed with the public one.

## Flash

Outputs: `build_pitchiq/mcuboot/zephyr/zephyr.hex` and `build_pitchiq/app/zephyr/zephyr.signed.hex` (first programming: sysbuild's
`west flash` writes both, bootloader first; there is no merged hex without Nordic's partition manager) and
`build_pitchiq/app/zephyr/zephyr.signed.bin` (for updates over Bluetooth). The flash commands below were not run.

    # J-Link (SWD pads on the watch)
    west flash -d build_pitchiq --runner jlink
    # A module that came pre-programmed and read-protected (APPROTECT): erase it first, then flash
    nrfutil device recover
    west flash -d build_pitchiq --runner nrfutil
    # CMSIS-DAP probe
    west flash -d build_pitchiq --runner pyocd
    # DK: the on-board J-Link
    west flash -d build_dk

Logs are SEGGER RTT: `JLinkRTTViewer`, or `JLinkExe` + `JLinkRTTClient`.

Update over Bluetooth (bonded phone only): `mcumgr --conntype ble --connstring peer_name='PitchIQ XXXX' image upload app/zephyr/zephyr.signed.bin`
(or nRF Connect Device Manager), then `image test` and reset. The new image is confirmed by the firmware after 15 s of healthy
running; if it never confirms, the next reset swaps the old image back.

## Behaviour summary

* Advertises as `PitchIQ` + last 4 hex digits of the address (e.g. `PitchIQ A1B2`).
* RX (`7a1d0002-...`) write / write-without-response, <= 20 bytes, authenticated encrypted link required. TX (`7a1d0003-...`) read + notify;
  receipts are only sent on a secure link. Also Battery Service, Heart Rate Service (only fed while heart rate runs), and mcumgr SMP.
* LE Secure Connections only, bondable, MITM. The watch is display-only: **the passkey appears when the phone starts pairing** (the stack makes a new random one each time) and is shown full screen as `Pair` / 6 digits. This differs from the JS watch, which showed one number all the time while unbonded.
* After a bond exists, advertising uses the filter accept list: only the bonded phone can connect. **Hold the button 5 s**
  (`CONFIG_PQ_BOND_CLEAR_HOLD_MS`) to forget the bond; advertising reopens to any phone. One bond only (`BT_MAX_PAIRED=1`).
* 20 ms connection interval is requested (peripheral preferred parameters plus an update on connect); the phone may refuse.
* Button (nPM1300 SHPHLD): press = frontlight; 5 s hold = forget pairing; 10 s hold = the nPM1300 power-cycles the watch. Below 3 % battery
  (three readings a minute apart, not charging) the watch enters ship mode; hold the button 1 s to wake.
* Heart rate: OFF. Starts when a client subscribes to Heart Rate Measurement (`CONFIG_PQ_HR_ON_SUBSCRIBE`) or when code calls `sensors_hr_start()`. Sequence: BUCK1 (1.8 V) on, sensor configured in shutdown, BOOST_EN (5 V) on, sensor runs; stop is the reverse.

## Try the DK with the existing coach page today

Flash `build_dk` (above). The DK advertises as `PitchIQ XXXX`; LED1 buzzes, LED2 is the light, the call text appears in the RTT log as
`SCREEN CALL sign 3 | HIGH AND | INSIDE`, button 1 stands in for the watch button. The coach page cannot find it unchanged:

* `/home/claude/dkindlon1/pitch-caller/app/watch.js` line 335 filters `namePrefix: "Bangle"`. In a **local copy** (that repo is read-only here) change that one line to

      const device = await bt.requestDevice({ filters: [{ namePrefix: "PitchIQ" }], optionalServices: [SVC] });

  (a filter on the service UUID `{ services: [SVC] }` also works, because the watch advertises it in the scan response).
* Pairing: the passkey appears in the DK log (`passkey for pairing is on the screen`) but the DK has no screen, so the 6 digits are in the
  `SCREEN Pair 123456` log line. On the page nothing else has to change for the receiver; the page's UX of showing the number before pairing is the other thing worth revisiting, since the watch now shows it when pairing starts.

## Verified / not verified

Verified (run in this workspace):
* Both `west build` commands exit 0 with no compiler or Kconfig warning (the only message is CMake's "debug signing key"). Zephyr v4.4.2, gnuarmemb 13.2.
* Watch image: 217,300 B flash text+data, 50,584 B RAM used (19 %) in the 483,178 B slot region; MCUboot 27,552 B of its 48 KB (56 %). DK similar.
* The compiled devicetree contains lcd (`sharp,ls0xx`), accel (`st,lis2dh12`), ppg (`maxim,max30101`), the nPM1300 with regulators, BUCK1 (1.8 V), BUCK2 (3.0 V, always on) and charger, pwm0, pwm1, i2c0, spi2, all enabled; the real code paths (display, PMIC, accelerometer, heart rate) are the ones compiled in the watch build.
* The screen layout, font and link icon were rendered as text on a host for several calls, "NO LINK", "no key" and the pairing screen. The heart-rate estimator was run on a host against synthetic PPG (48 to 180 bpm, noise, 0.25 Hz baseline wander, no-contact, lost signal): within +-3 bpm after 15 s in all cases.

NOT verified (nothing ran on hardware or a radio):
* Nothing was flashed or run: no boot, no RTT output, no Bluetooth link, no pairing, no passkey display, no bond, no accept-list behaviour with a phone that uses a private address, no mcumgr update, no MCUboot swap or rollback, no confirm.
* All the ASSUMPTION lines (grep `ASSUMPTION` in `boards/` and `app/`): pin map v1, I2C pull-ups, 32 kHz crystal, DC/DC, P0.18 reset, nPM1300 interrupt pin routing and button, VSET straps for BUCK1/BUCK2, NTC beta, charger status bit meanings, LCD bit order and DISP/clear order, motor/light PWM drive, boost settling time, MAX30101 thresholds, battery curve.
* The accept-list path with a phone that changes its address needs `CONFIG_BT_PRIVACY` to work as designed; only a real phone shows it.
* The heart-rate estimator on a wrist (motion artefacts, real signal levels). The accelerometer attribute values.

Stubbed / replaced:
* **Charger.** The stock Zephyr nPM1300 charger driver calls `logf()`, so it needs a full C library. This workspace's toolchain has none Zephyr can use (no picolibc; newlib built without retargetable locking), so the build fails with it. By default `power.c` programs the charger itself through the mfd driver with the same registers and the same devicetree values (4.20 V, 75 mA, 100 mA steps VBUS limit 500 mA, 10 k NTC, enable) and reads voltage, charge status and VBUS; it has **no battery temperature**. `CONFIG_PQ_NPM1300_STOCK_CHARGER=y` plus removing `CONFIG_NPM13XX_CHARGER=n` from `app/boards/pitchiq_watch.conf` uses the stock driver under the Zephyr SDK; that path has not been compiled.
* **MAX30101.** The stock driver is not used (it configures the chip once at boot and cannot survive the 1.8 V rail being cut); `sensors.c` does the I2C from the devicetree properties. The INT pin is wired but unused (the FIFO is polled every 100 ms).
* **nRF52840 DK.** No LCD, accelerometer, heart-rate sensor or PMIC: `PQ_HAVE_*` are off, the screen is described in the log, battery is the fixed `PQ_BATTERY_STUB` (100 %), ship mode is ignored.
* The battery percentage is a typical Li-ion voltage curve, not this cell's.

## Production build (not the default)

The default build is the unlocked bring-up build (debug signing key, debug port open). The production extras are three extra conf files: `app/prod.conf` (APPROTECT lock, image version), `app/sysbuild_prod.conf` (signing key path) and `app/sysbuild/mcuboot_prod.conf` (downgrade prevention).

1. Generate the project key OUTSIDE this repository (never commit it, keep a backup): `python3 /home/claude/zws/bootloader/mcuboot/scripts/imgtool.py keygen -k /secure/place/pitchiq_signing_key.pem -t ecdsa-p256`
2. Build:

       west build -p always -b pitchiq_watch --sysbuild -d build_prod app -- -DBOARD_ROOT=<firmware dir> \
         -DEXTRA_CONF_FILE=prod.conf -DSB_EXTRA_CONF_FILE=sysbuild_prod.conf \
         -Dmcuboot_EXTRA_CONF_FILE=<firmware dir>/app/sysbuild/mcuboot_prod.conf \
         -DSB_CONFIG_BOOT_SIGNATURE_KEY_FILE=\"/secure/place/pitchiq_signing_key.pem\"

3. Raise `CONFIG_MCUBOOT_IMGTOOL_SIGN_VERSION` in `prod.conf` for every release: with downgrade prevention an upgrade must carry a higher version. Flash the first image with the locked build; recovery from APPROTECT is a full chip erase (`nrfjprog --recover`) through the cradle pads, which also wipes bonds and keys.

Not compiled or run here: the production build was not built (a test build needs a signing key and none was generated in this workspace); the Kconfig symbols were checked against the Zephyr v4.4.2 and MCUboot trees only.

## Fix pass 1 (review fixes; everything below compiles, nothing was run on hardware)

Checks: pitchiq_watch west build exit 0, nrf52840dk build exit 0, `make -C core test` exit 0 (ALL PASS, sanitizer clean). Logs in `build_logs/fix1_*.log`. Watch app: text 225,396 B + data 3,028 B, bss 47,726 B; signed.bin 228,592 B; MCUboot 27,552 B of 48 KB. DK app: text 216,700 B, data 3,072 B, bss 44,680 B. Built `.config` for both boards has `CONFIG_SETTINGS_NVS=y` and `# CONFIG_SETTINGS_NONE is not set`.

1. Bonds: NVS + settings enabled (`prj.conf`), 4 sectors on the watch (`boards/pitchiq_watch.conf`), 8 on the DK; both boards already have a `storage` partition that does not overlap the slots (watch 0xfc000+16 KB after slot1; DK 0xf8000+32 KB). `ble_pq.c` logs the bond count after `settings_load()`. Bring-up test still to do on hardware: pair, reset, count must be 1.
2. Watchdog 8 s (`app_glue.c` `app_wdt_init`/`wdt_kick`, fed from the 1 s tick); `k_sys_fatal_error_handler` in `main.c` records the reason in a noinit word and cold-reboots; RESETREAS and the previous fatal reason are logged at boot.
3. LIS2DH12 CTRL_REG2 HPIS1 set, REFERENCE read, INT1_SRC logged (`sensors.c` accel_init). Compiled only.
4. HRS permissions AUTHEN via `CONFIG_BT_HRS_DEFAULT_PERM_RW_AUTHEN`; TX read and its CCC AUTHEN; HR subscribe ignored unless the link is security level 4.
5. Advertising restarts in the connect-failure path and on every disconnect (including connections the firmware never took).
6. Discharge limit 1 A in the dts and a BUILD_ASSERT-checked `DISCHG_LIMIT` in `power.c`. Heart-rate start is deferred while the motor buzzes (`haptics_busy()`, retried on the tick). Not done: a buzz that starts while HR is already running is not delayed; the 1 A limit covers it.
7. Work items are static (`K_WORK_DEFINE`, `K_WORK_DELAYABLE_DEFINE`) in app_glue, ble_pq, haptics, sensors, ui; app_glue also holds queued events until the core is initialised; haptics has a `ready` flag.
8. `prod.conf`, `sysbuild_prod.conf`, `sysbuild/mcuboot_prod.conf` (see above). Not compiled.
9. +8 dBm, supervision timeout 600 (6 s, in prj.conf and the on-connect update), 2M PHY off, connection RSSI logged every 10 s (HCI Read RSSI).
10. `PQ_I2C_RETRY` (3 tries, `i2c_recover_bus` between) wraps every PMIC, accelerometer and heart-rate register access (`i2c_util.c`, `pq_app.h`). Before `boot_write_img_confirmed()` the PMIC must answer and the LIS2DH12 WHO_AM_I must read 0x33. The MAX30101 part ID is not part of that check (its rail is off at boot).
11. Motor duty capped to about 3.0 V effective from `power_vsys_mv_estimate()`: 5 V when VBUS is present, else the last battery sample (60 s old at worst; 4.2 V if never sampled). dts comment corrected. VSYS itself is not measured.
12. Minor findings: 9 done (dead Kconfig option removed); 10 done (hold gesture re-initialises the core, which wipes the key; the core has no separate wipe call); 11 done (delayable work instead of `k_sleep`); 12 partial (notify at 1 Hz; FIFO interrupt not done, needs INT line handling across the rail cycling); 13 skipped (driver thread, a hardware/driver change); 14 skipped (phone code is outside this scope; the README section above already says what to change).
13. Charger temperature (power review 1): NTCHOT written as code 337 (45 C for 10 k, beta 3380, checked against the stock driver's formula and register offsets 0x16; a BUILD_ASSERT guards the thermistor values); DIETEMPSTOP 70 C (code 410) and DIETEMPRESUME 60 C (code 422), my estimates.
14. VBUS limit: 500 mA written to VBUSINILIM and triggered with ILIMUPDATE whenever VBUS is seen (it resets to 100 mA on cable removal); startup limit unchanged at 500 mA. Chosen from the existing devicetree value; only valid if the cradle supplies 500 mA.

Heart-rate LED settings in use (devicetree `pitchiq_watch.dts` lines 112-119, applied by `sensors.c` 132-133 and 236): green only (slot 3), LED current 0x30 = 9.6 mA, pulse width 411 us (18-bit), sample rate 100 Hz, averaging 2 (so 50 FIFO samples per second), ADC range 4096 nA, FIFO polled every 100 ms (`sensors.c:140`), notified at 1 Hz.
