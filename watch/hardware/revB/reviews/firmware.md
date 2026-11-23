# Firmware review, PitchIQ watch rev B (Zephyr v4.4.2, nRF52840)

Scope: firmware/boards/pitchiq/pitchiq_watch, firmware/app, firmware/core, against hardware/revB/scripts/design.py, the research notes and the Zephyr v4.4.2 tree. No west build run. `make test` in firmware/core: 82 scenarios, 1941 steps, 231 vectors, ASan clean. Line numbers are against the tree as read; where a line is approximate it is marked "~".

Findings are ordered by severity. BLOCKER = must fix before ordering boards.

## BLOCKER

### 1. Bonds are never persisted: settings backend is NONE
Defect: prj.conf:40 sets `CONFIG_BT_SETTINGS=y` and prj.conf:64 sets `CONFIG_SETTINGS=y`, but no NVS or ZMS backend is selected. The generated `/home/claude/zws/build_pitchiq/app/zephyr/.config:2513` has `CONFIG_SETTINGS_NONE=y`. `settings_load()` returns 0 with the NONE backend and BT starts normally, so the failure is silent. Every reset or battery swap forgets the bond and the identity keys, so the accept-list logic in ble_pq.c:126-170 never engages after a reboot, and the phone must re-pair every time. With the watchdog absent (finding 2) a crash makes this worse. The settings_storage_partition at dts:221-258 is dead flash.
Evidence: .config:2513; prj.conf:60-64 comment says "bonds survive reset" which is false for this build.
Fix: add `CONFIG_NVS=y` and `CONFIG_SETTINGS_NVS=y` (or `CONFIG_ZMS=y` and `CONFIG_SETTINGS_ZMS=y`), plus `CONFIG_SETTINGS_NVS_SECTOR_COUNT` sized to the partition. Add a boot assertion: after `settings_load()` log the backend and the bond count, and add a test step to bring-up that pairs, resets, and checks the bond count.

## MAJOR

### 2. No watchdog, and a fatal error halts forever
Defect: `watchdog0 = &wdt0` alias exists (dts:51) but nothing in app/src uses it and `CONFIG_WATCHDOG` is not set. Zephyr v4.4.2 has no `RESET_ON_FATAL_ERROR` option; the default `k_sys_fatal_error_handler` ends in `arch_system_halt`, an infinite loop with interrupts locked (kernel/fatal.c). A hard fault, stack overflow or assert on the wrist leaves a frozen watch with the LCD holding its last frame, no EXTCOMIN toggling, and the radio dead. Only the PMIC long-press recovers it.
Fix: enable `CONFIG_WATCHDOG=y`, feed from the system workqueue tick (app_glue.c tick_work) with a timeout of ~8 s, and override `k_sys_fatal_error_handler` to `sys_reboot(SYS_REBOOT_COLD)` after writing a reset reason to a retained RAM word. Log the RESETREAS register at boot.

### 3. Accelerometer high-pass filter is off, so the motion interrupt fires continuously
Defect: sensors.c:53-69 programs sampling frequency, SLOPE_TH and SLOPE_DUR and installs a trigger. On the LIS2DH12 the INT1 generator compares raw (unfiltered) data unless CTRL_REG2 HPIS1 and the HP mode are set. The Zephyr lis2dh driver does not enable the filter from these attributes. With gravity (about 1 g on one axis) permanently above any sensible threshold, the interrupt asserts all the time. Result: the screen light stays on, idle detection never sees idle, and the wake-from-sleep path burns power.
Evidence: sensors.c:63-69; no CTRL_REG2 write anywhere in app/src.
Fix: write CTRL_REG2 (0x21) with FDS=0, HPM=00 normal, HPIS1=1 through the bus handle in the dts (the lis2dh driver exposes no attribute; use `i2c_reg_write_byte_dt` after driver init), read REFERENCE (0x26) once to latch the reference, and check by logging the INT1_SRC register. Add a bring-up test that holds the watch still for 10 s and asserts zero motion events.

### 4. Heart-rate service has open permissions and turns on the LED for an unauthenticated peer
Defect: the app uses `bt_hrs_notify`, `bt_hrs_cb_register` (ble_pq.c:113-121, 357). The stock HRS characteristics are registered with plain read and CCC write permissions, so any peer in range, bonded or not, can connect (when no bond exists), enable notifications, and trigger `EVT_HR_SUBSCRIBE` which starts the MAX30101 LEDs at 10 Hz polling and notifies live heart rate. That is both a privacy leak (health data to an unauthenticated peer) and a battery drain primitive. The PQ RX characteristic is correctly write-authenticated (ble_pq.c:91), but TX read and its CCC are open (ble_pq.c:92-94), so an unbonded peer can subscribe and read sealed frames and learn timing.
Fix: gate `hrs_ntf_changed` on `bt_conn_get_security(conn) >= BT_SECURITY_L4` (or the `io_secure` result already used for the core) and drop the subscribe otherwise; change TX read to `BT_GATT_PERM_READ_AUTHEN` and the CCC to `BT_GATT_PERM_READ_AUTHEN | BT_GATT_PERM_WRITE_AUTHEN`; set the HRS Kconfig permission option if v4.4.2 offers one (check `subsys/bluetooth/services/Kconfig.hrs`), otherwise replace HRS with a custom service using authenticated permissions. Note the JS client (watch.js) pairs first so this does not break it.

### 5. Advertising is not restarted after a failed connect
Defect: ble_pq.c on_connected error path returns without scheduling `adv_work`. A single failed connection (bad parameters, peer drop during setup, a scan-then-connect race) leaves the watch non-connectable until reboot. adv_start itself retries only when `bt_le_adv_start` fails (ble_pq.c:166-170).
Fix: in the `connected` callback with `err != 0`, call `k_work_schedule(&adv_work, K_MSEC(100))`. Also restart on `disconnected` for every reason, and add a 30 s watchdog check that `adv_flag` is set whenever there is no connection.

### 6. nPM1300 discharge limit (200 mA) is below the stated peak load
Defect: dts:173 `dischg-limit-microamp = <200000>`. docs/power_budget.md puts the peak at 150-240 mA (radio TX plus LCD plus HR LEDs plus motor). The upper end exceeds the limit, which makes the PMIC cut BAT discharge and brown the system out exactly when the motor and HR LED fire together. The firmware does not serialise them (haptics.c and sensors.c are independent).
Fix: raise to 1000 mA (nPM1300 ILIM options include 1 A) or serialise: hold HR LED current at its minimum while the motor is on, and add a brown-out log from the PMIC event. Confirm the chosen limit against the datasheet BCHGISETDISCHARGE table (research/datasheets.md).

### 7. Work items can be used before they are initialised (boot race)
Defect: main.c init order is ui, haptics, power, sensors, app_glue_init, ble_pq_init. `sensors` installs the accelerometer interrupt (sensors.c:69) and the HR work before `app_glue_init` runs `k_work_init(&evt_work, drain)` (app_glue.c:247). An early motion or button event calls `app_post`, which submits an uninitialised `evt_work` on the system workqueue: undefined behaviour (corrupted list or a hard fault). haptics.c:~66-74 also returns -ENODEV before `k_work_init_delayable(&work, run)` and later callers do not check it, so a missing motor driver turns the first `haptics_buzz` into a use of an uninitialised delayable.
Fix: move `app_glue_init()` first in main.c, or use static `K_WORK_DEFINE` and `K_WORK_DELAYABLE_DEFINE` for evt_work, tick_work, hold_work, notice_work, adv_work, haptics work, hr_work and light_off_work. Make haptics init set a `ready` flag before any return.

### 8. Production security: debug signing key, no APPROTECT, no downgrade protection
Defect: the MCUboot `.config` shows ECDSA P-256 signing with the public MCUboot debug key (the repo's sample key), so anyone can sign an image that this bootloader accepts, and mcumgr over BLE is enabled (prj.conf:72-82). BLE mcumgr is authenticated (`MCUMGR_TRANSPORT_BT_PERM_RW_AUTHEN`) and gated by `smp_guard` (ble_pq.c:305), which limits the exposure to bonded peers, but the combination of a public key and an open SWD port means a physical attacker (or a bonded phone) can load firmware that dumps the RAM game key. `CONFIG_NRF_APPROTECT_LOCK` is not set (soc/nordic/Kconfig), and `swap-using-move` without `MCUBOOT_DOWNGRADE_PREVENTION` allows rollback to an old image. Image 219,832 B (zephyr.bin; signed.bin is 219,983 B) fits the slots in dts:221-258.
Fix: generate a project key outside the repo (`imgtool keygen -t ecdsa-p256`), set `SB_CONFIG_BOOT_SIGNATURE_KEY_FILE`, set `CONFIG_MCUBOOT_DOWNGRADE_PREVENTION=y` with a security counter (or `SB_CONFIG_MCUBOOT_MODE_SWAP_USING_OFFSET` plus version compare), set `CONFIG_NRF_APPROTECT_LOCK=y` and `CONFIG_NRF_APPROTECT_USER_HANDLING=n` in the production build only, and keep an unlocked bring-up variant. Verify the five cradle pads still reach SWDIO/SWDCLK/nRESET for a recovery erase (`nrfjprog --recover` works against APPROTECT on nRF52840 via CTRL-AP erase).

## MINOR

### 9. Dead Kconfig option and a stale alias
Kconfig:70 `PQ_LCD_BIT_ORDER_MSB` is not referenced; the ls0xx driver uses LSB-first SPI mode by its own binding. Remove it to avoid a false sense of configurability. dts:47 puts `lcd-disp-gpios` under `zephyr,user`; fine, but confirm the driver does not also claim DISP (it does not in the generated zephyr.dts).

### 10. Hold gesture does not wipe the game key
app_glue.c hold handling (hold_fired) ends the session but does not call the core's key wipe, so the in-RAM game key survives a "hold to end" until the next reset. If the intent (per core/README.md) is that a hold ends the game and the key, call the wipe path.

### 11. Low-battery path sleeps 2 s in the work queue
app_glue.c low-battery path uses `k_sleep(K_SECONDS(2))` on the system workqueue, which blocks all events (including BT notify, mcumgr and the tick) for 2 s. Replace with a delayable work.

### 12. HR polled at 10 Hz and notified at 10 Hz
sensors.c hr_poll polls the FIFO on a fixed timer rather than on the INT line, which costs wakeups and CPU. Use the FIFO almost-full interrupt (design.py routes MAX30101 INT) and notify at 1 Hz with the estimate, not per sample.

### 13. EXTCOMIN 60 Hz cost
The ls0xx driver toggles EXTCOMIN from a thread timer at 60 Hz. At ~18 uA this is acceptable but it prevents the longest sleep states. docs/power_budget.md already suggests this saving; if sleep time matters, use the nRF PWM or a GPIOTE+PPI toggle (the PWM pin map in dts supports it).

### 14. BLE name prefix
The JS app filters on `namePrefix: "Bangle"` (watch.js:335) but this firmware advertises its own name. Verify the phone code and the firmware agree before the first pairing test.

## Checked and found correct

- Pin-for-pin map: every GPIO, polarity, pull, I2C address (nPM1300, MAX30101, LIS2DH12), the PWM pins, interrupt lines and the nPM1300 GPIO used as interrupt match design.py exactly; no mismatches. R1 47k gives BUCK1 1.8 V and R2 150k gives BUCK2 3.0 V, matching the VSET table in research/datasheets.md; R3/R4 4.7k I2C pull-ups present; R16 10k reset pull-up present.
- nRESET as GPIO-as-nreset in UICR (dts:74-77) with the pull-up on R16; recovery pads reach it.
- LS013B7DH03: DISP is released only after an all-clear, line addressing is 1-128, SPI is LSB-first, SCLK within the 1.1 MHz maximum.
- BT security configuration: `BT_SMP_SC_ONLY` and `BT_SMP_ENFORCE_MITM` set (prj.conf:35-37), shell disabled (prj.conf:11), no serial recovery in MCUboot, RX characteristic requires authenticated write, smp_guard installed on `MGMT_EVT_OP_CMD_RECV`, accept list used once a bond exists.
- Game key lives in RAM only and is not logged in the paths read.
- Threading model: pq_core runs only on the system workqueue via `app_post`; no direct core calls from ISR or BT callbacks were found other than through `app_post`.
- Haptics timing and patterns match the JS (450 ms; 120/120/120).
- Image size 219,832 B fits slot0 and the flash layout in dts:221-258; `BOOT_VALIDATE_SLOT0=y`.
- firmware/core: 82 scenarios, 1941 steps, 231 vectors pass under ASan.

## Not covered or only partly covered

- Finding 4 HRS permission: whether v4.4.2 `Kconfig.hrs` offers a permission option was not confirmed beyond grepping the service source (no such option seen in hrs.c).
- Findings 10 to 14 are lower-confidence reads of the glue code; line numbers marked "~" are approximate.
- Section 4 of the scope (bring-up hooks, self-test, RTT, missing tests): no RTT logging backend, no boot self-test (I2C ID reads of nPM1300, MAX30101 part ID 0xFF, LIS2DH12 WHO_AM_I 0x33) and no hardware-in-loop tests exist. Add: a boot-time ID scan with results logged and shown on the LCD, `CONFIG_USE_SEGGER_RTT=y` with `CONFIG_LOG_BACKEND_RTT=y` for the bring-up build, and tests for bond persistence across reset, motion idle with the HP filter, advertising recovery after a failed connect, and watchdog reset.
