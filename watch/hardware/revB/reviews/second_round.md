# Second-round review, PitchIQ watch rev B (after fix pass 1)

Method: read the sources and measured the routed board with pcbnew (read-only). Nothing was built or run on hardware by me. "Compiles" means the build logs say so; "consistent on paper" means the files agree with each other. CHECKED = I read or measured it. NOT CHECKED = I did not, reason given.

## 0. State of the evidence

- CHECKED: build logs `firmware/build_logs/boss_pitchiq.log` and `boss_dk.log` both end `EXIT 0` (twice each: app + mcuboot). Both are newer (14:17) than the last source edit (app_glue.c 14:10, ui.c 14:11, dts 14:03). Not "no warnings": each log has exactly one CMake warning (CMakeLists.txt:343, default MCUboot debug signing key). No compiler warnings found in either log.
- CHECKED: `out/check_output.txt` (15:53:54) is newer than the .kicad_pcb (15:53:51) and gen_pcb.py (15:45). It reports DRC errors 0, unconnected 0, 83 warnings = 81 lib_footprint_issues (embedded footprints, library names empty) + 2 silk_over_copper (silk at board (9.7,17.1) and (9.7,18.9), in the Y1/C3/C4 crystal area; cosmetic).
- CHECKED: pin map. dts `PQ_PIN_*` = SCK 13, MOSI 15, SCS 17, EXTCOMIN 20, DISP 22, light PWM 24, SDA 26, SCL 27, ACC_INT 4, PPG_INT 5, PMIC_INT 6, BOOST_EN 8, MOTOR 11. Same numbers as design.py U1 rows (design.py:10-16). Consistent on paper.
- NOT CHECKED: the circuit against the nPM1300, TPS61023, MAX30101, LIS2DH12 and Sharp datasheets, apart from the cases named below. check.sh is a self-consistency check (see QA finding 1).

## 1. Hardware wiring (CHECKED, design.py and pcbnew)

| Item | Result |
|---|---|
| R17/R18/R19 100R | U1 pad (SWDIO/SWDCLK/NRESET) to R pin 1, R pin 2 to `*_P` net to pad (design.py:135-137; pcbnew: R17 1=SWDIO 2=SWDIO_P etc., all on B.Cu). Series resistor is on the pad side of the module, correct. |
| R16 10k | 3V0 to NRESET, i.e. on the MCU side of R19 (design.py:140; pcbnew F.Cu at (14.6,18.0)). Correct side. |
| D4/D5/D6 | pin 1 on `SWDIO_P`/`SWDCLK_P`/`NRESET_P`, pin 2 GND; so on the pad side of the resistor, not the MCU side. Correct. SOD-323 pin order is irrelevant only if the part is bidirectional (PESD5V0S1BA is sold as bidirectional; datasheet not in repo, NOT CHECKED). |
| nRESET levels | Probe pulls low through R19+probe Rout: about 3.0 V x (100+50)/(10.1k) = 0.04 V, far under VIL. Released: R16 pulls up, only TVS leakage flows, no divider effect. Valid both ways on paper (arithmetic, not measured). |
| Cradle pads | pcbnew B.Cu, board mm: TP1 VBUS (3.0,28.5), TP2 GND (6.5), TP5 NRESET_P (10.0), TP4 SWDCLK_P (13.5), TP3 SWDIO_P (17.0), TP6 3V0 (20.5). Matches gen_pcb.py:43. |
| D2 | still VBUS to GND, at (28.4,31.2) next to the PMIC, 25 mm from TP1. Fine as an IC-end clamp. |
| U1 pad 32 | GND (pcbnew). U2 pins 29, 31 GND (pcbnew); 28/30 GND per design.py:41. Whether the nPM1300 allows LSOUT grounded is NOT CHECKED (datasheets.md has no statement). |
| C25, R8/R9, L3 | C25 100n on VSYS (PVDD net), R8/R9 1M, L3 2.2 uH, as in design.py:62,104,112,100 and BOM.csv. |

## 2. Board measurements (CHECKED, pcbnew)

- Copper layers 6. Tracks/vias with any copper at y < 4.0 mm (board coords): 0. All four GND/3V0 zone fills have minimum y = 4.0 on every layer. U1 pads at y < 4: none. Holes: 4 NPTH 1.6 mm at (2.2,2.2), (29.8,2.2), (2.2,33.8), (29.8,33.8) (H1-H4). (Plus two 0.9 mm NPTH on SW1.)
- 161 vias, all 0.5 mm pad / 0.2 mm drill (ring 0.15 mm). 4 vias inside the U2 exposed pad (3.45 x 3.45 mm), unfilled.
- Smallest via-copper edge to a FOREIGN-net pad: between 0.20 and 0.25 mm (none at 0.20, three at 0.25: R17.2, U4.2, R3.2). Via copper to same-net pads sits about 0.05 mm outside the pad edge by router design (router.py:5,14), not measured per via.
- Smallest copper gap between any two pads on one side: more than 0.15 and at most 0.20 mm (U4 LGA). With mask expansion 0.025 mm per side (gen_pcb.py:77) the web is at least 0.10 mm, the figure the manufacturing review asked for.
- DRC unconnected 0, errors 0. Warning classes: lib_footprint_issues (81, harmless), silk_over_copper (2, cosmetic).
- NOT CHECKED: via tenting, whether via holes lie inside any pad mask opening (the old M1 second half); fiducials; CPL rotation.

## 3. First-round BLOCKER/MAJOR findings

Statuses: FIXED ON PAPER, PARTLY, OPEN, NEEDS HARDWARE.

| Review | Finding | Status | Evidence |
|---|---|---|---|
| firmware 1 | Bonds not persisted (SETTINGS_NONE) | FIXED ON PAPER (NEEDS HARDWARE for pair/reset/count) | prj.conf `CONFIG_NVS=y`, `CONFIG_SETTINGS_NVS=y`; built .config has NVS (zws/build_pitchiq .config); dts storage_partition@fc000 16 KB, clear of slot1; ble_pq.c:381-388 logs bond count. |
| firmware 2 | No watchdog, fatal halts | FIXED ON PAPER, one new minor (N2, N3) | main.c:26-36 fatal handler reboots; app_glue.c:79-95 wdt 8 s, RESET_SOC; kick in tick() app_glue.c:193. |
| firmware 3 | LIS2DH12 high-pass off | FIXED ON PAPER (NEEDS HARDWARE) | sensors.c:~79-86 writes CTRL_REG2 0x21 = 0x01 (HPIS1 is bit 0, HPM=00, FDS=0), reads REFERENCE 0x26, logs INT1_SRC. Stock lis2dh driver writes CTRL2 only under LIS2DH_ACCEL_HP_FILTERS (lis2dh.c:281, not enabled), so nothing overwrites it. |
| firmware 4 | HRS/TX open permissions | FIXED ON PAPER | prj.conf `BT_HRS_DEFAULT_PERM_RW_AUTHEN=y`; ble_pq.c:97-100 RX write, TX read and CCC all AUTHEN; ble_pq.c:126 subscribe needs security >= L4. |
| firmware 5 | Advertising not restarted | FIXED ON PAPER | ble_pq.c:226 (connect failure) and :248 (every disconnect, before the `c != conn` early return); adv_start retries in 2 s on error (:182). |
| firmware 6 | Discharge limit 200 mA | FIXED ON PAPER | dts:177 `<1000000>`; power.c:134 maps to code 415, same as stock driver table (npm13xx_charger.c:158) and written at 0x0A/0x0B (stock CHGR_OFFSET_ISET_DISCHG 0x0A). BUILD_ASSERT guards the value. |
| firmware 7 | Boot race / uninit work | FIXED ON PAPER | `K_WORK_DEFINE`/`K_WORK_DELAYABLE_DEFINE` in app_glue.c:50-55, ble_pq.c:59; haptics `ready` flag (haptics.c:42,89,94). |
| electrical 1 | Cold start from cradle, no battery | NEEDS HARDWARE | Mitigated by bring-up procedure only (report section 15, risk 3). No design change. |
| electrical 2 | Discharge limit vs worst case | FIXED ON PAPER | as firmware 6. |
| electrical 3 | Cradle 180-degree symmetry | PARTLY (see NEW-1) | Order is now VBUS, GND, nRESET, SWDCLK, SWDIO, 3V0. Rotated 180 degrees, VBUS meets the 3V0 pad. |
| electrical 4 | No VTref pad | FIXED ON PAPER | TP6 = 3V0 at (20.5,28.5), B.Cu. |
| electrical 5 | No clamp / series R on pads | FIXED ON PAPER | R17-19 + D4-6 wired correctly (section 1). |
| power 1 | Charger NTC window 0-60 C | FIXED ON PAPER | power.c:111-120,151: NTCHOT (0x16, same as stock NTC_TEMPS + 3*2) = 337 = 1024*R/(R+10k) at R = 4.90 k (10 k, beta 3380, 45 C; my recomputation gives 336.9, stock driver would floor to 336, 0.1 C difference). Die stop 410 / resume 422 = 69.7 / 60.2 C using stock constants (394.67 C - code x 0.7926). |
| power 2 | NTC does not sense the cell | NEEDS HARDWARE | design.py:67 RT1 "place against the cell"; whether it touches the cell is a mechanical fact, NOT CHECKED. |
| power 3 | R9 100k burns 30 uA | PARTLY | R9 and R8 now 1M (design.py:104,112). power_budget.md has no mention of either (grep: no R8/R9/standing load) so "absent from the budget" is still true. |
| power 4 | Over-discharge recovery | OPEN | Report risk 8, bench test. |
| power 5 | Cradle symmetric, no protection | PARTLY | as electrical 3 and 5. |
| power 6 | Budget inputs wrong | NOT CHECKED in detail | Only read lines 3, 17-23 of power_budget.md. |
| rf 1 | LCD over antenna / cell too close | NEEDS HARDWARE | Board copper strip y 0-4 mm is clear on all 6 layers (measured). The display and battery outline positions are drawn in gen_pcb.py only; actual panel and cell clearance cannot be judged without hardware. |
| rf 2 | Antenna 0.6 mm from edge, ground wings | NOT CHECKED | Not measured. |
| rf 3 | TX 0 dBm, no Coded PHY | PARTLY | `BT_CTLR_TX_PWR_PLUS_8=y`; Coded PHY still off (prj.conf). Range NEEDS HARDWARE. |
| rf 4, 5 | Wrist loading; FCC grant | NEEDS HARDWARE / OPEN | Report risk 6, 7. |
| rf 6 | Supervision timeout shorter than app timer | FIXED ON PAPER | prj.conf PREF_TIMEOUT=600 (6 s); equals, not exceeds, the 6 s app timer. |
| rf 7 | PHY selection | PARTLY | 2M disabled; Coded not enabled. |
| mechanical 1, 2, 3 (BLOCKER) | FPC reach, contact side, motor location | OPEN | Report risk 1, 2 say Open. No file change I could find. |
| mechanical 4-7, 9 | Battery height, stack, optics, MAX30101 assembly, button | OPEN / NEEDS HARDWARE | NOT CHECKED beyond the report's own status. |
| mechanical 8 | Cradle pads on skin side | PARTLY | Series R + TVS added; sealing and magnets are mechanical. |
| mechanical 10 | No mounting holes | FIXED ON PAPER | 4 NPTH 1.6 mm measured. |
| manufacturing M1 | Vias in pad copper | PARTLY | Foreign-net min 0.20-0.25 mm edge gap (measured); same-net via copper about 0.05 mm from the pad edge by design; mask-opening overlap NOT CHECKED. |
| manufacturing M2 | Mask webs 0.05 mm | FIXED ON PAPER | Gap > 0.15 mm, expansion 0.025, web >= 0.10 mm (measured). |
| manufacturing M3 | Annular ring 0.125 | FIXED ON PAPER | 0.5/0.2 mm, ring 0.15 mm. Fab limits NOT CHECKED. |
| manufacturing M4-M8 | Assembly class, fiducials, CPL angles, U1 purchase, reflow | OPEN / NOT CHECKED | U1 and U2 still flagged consign/DigiKey in design.py:desc; report risk register lists none of M4, M5, M7, M8. |
| manufacturing M9 | Programming access | NEEDS HARDWARE | Six cradle pads. |
| qa 1 | CHECK: PASS is self-consistency | OPEN (inherent) | check_output.txt:last line says so. |
| qa 2 | Bottom-side CPL orientation | OPEN | NOT CHECKED. |
| qa 3 | Cradle pads bare | FIXED ON PAPER | as electrical 5. |
| qa 4 | I2C: no retry, watchdog | FIXED ON PAPER | `PQ_I2C_RETRY` (pq_app.h) wraps PMIC, accel, PPG accesses; watchdog as firmware 2. |
| qa 5 | 32 kHz crystal failure hangs boot | OPEN | defconfig and built .config still `K32SRC_XTAL=y`, RC not set. |
| qa 6 | Debug MCUboot key, bad image accepted | PARTLY | Identity check before confirm (app_glue.c:211-222): PMIC VBUS_STATUS read and LIS2DH12 WHO_AM_I = 0x33. Debug key still in the default build (CMake warning in both logs); prod.conf was never compiled (README). |
| qa 7 | Antenna environment | NEEDS HARDWARE | |
| qa 8 | Peak load vs PMIC limit | FIXED ON PAPER | 1 A limit; HR start deferred while motor busy (haptics_busy). |
| qa 9 | BOM has unavailable parts | OPEN | design.py U1/U2 descriptions. |
| qa 10 | Battery can be soldered backwards | OPEN | Report section 15 step 3: "There is no reverse-polarity protection". |
| sourcing 1-3, 6 | Prices, part labels, frontlight | NOT CHECKED | Report says corrected; I did not re-price. |
| sourcing 4, 5, 7, 13 | FCC separation, Zephyr controller qualification, display MOQ, tariff | OPEN | Commercial/regulatory, no fix possible in files. |

## 4. Firmware checks that went beyond "does the line exist"

- Self-check before confirm (CHECKED, app_glue.c:211-222, power.c:280, sensors.c:90): needs PMIC read and LIS2DH12 ID only. The LIS2DH12 sits on 3V0 (design.py:83-86), so it is powered at boot; the MAX30101 is deliberately not tested, so a good image is not reverted for a rail that is off. Requires `healthy` (ui, haptics, ble init ok) and advertising or connected, 15 s after boot. On the DK build both identity functions return true (power.c:338, sensors.c:105).
- Passkey/bonding: CONFIG_BT_MAX_PAIRED=1 with an accept list of bonded peers (ble_pq.c:164-168). If the phone deletes its bond but the watch keeps it, the watch will not accept a new pairing and the only recovery is the button-hold clear (ble_pq.c:198). Documented behaviour, not a new defect; listed as NEW-5.
- nPM1300 register addresses (CHECKED against stock `drivers/sensor/nordic/npm13xx_charger/npm13xx_charger.c`): CHGR 0x03, ADC 0x05, VBUS 0x02, ISET_DISCHG 0x0A, VTERM 0x0C/0x0D, TRICKLE 0x0E, ITERM 0x0F, NTC temps from 0x10 (hot = 4th entry = 0x16), die temps 0x18 (stop 0x18, resume 0x1A), NTCR_SEL 0x0A, TASK_AUTO 0x0C, IBAT_EN 0x24, VBUS ILIMUPDATE 0, ILIM 1, ILIMSTARTUP 2, STATUS 7. All match. The stock directory is `npm13xx_charger`, not `npm1300_charger`.
- Motor duty cap (haptics.c:50-58): duty = 3000 mV / VSYS estimate; VSYS estimate is the last battery sample (up to 60 s old) or 5 V with VBUS. Reasonable on paper; the 3 V figure is average-equivalent, not RMS.
- VBUS limit: written to ILIM then ILIMUPDATE when VBUS first seen, flag reset when VBUS is removed (power.c:249-254). Consistent with the stock driver's behaviour.

## 5. NEW findings

### NEW-1 MAJOR (BLOCKER unless the cradle is mechanically keyed): 180-degree cradle puts VBUS on the 3V0 rail
Evidence: gen_pcb.py:43 and design.py:131 (pads at x = 3.0, 6.5, 10.0, 13.5, 17.0, 20.5 on a row centred at 11.75). Under a 180 degree rotation pad i meets pad 7-i: VBUS (TP1) meets 3V0 (TP6). TP6 is wired straight to the 3V0 net (design.py:132, pcbnew TP6 net 3V0) with no series element and no clamp. That is 5 V (up to the cradle's 500 mA) onto the BUCK2 output and plane; nRF52840 VDD abs max 3.9 V, Sharp VDD abs max 3.6 V (electrical review finding 1). The first-round fix moved the hazard from nRESET to the main rail; the first review's own rule was "no pair may contain VBUS and a logic pad", and this order still pairs VBUS with the rail. Other pairs are harmless (GND/SWDIO, nRESET/SWDCLK).
Fix: (a) mechanical key on the cradle (offset magnet, or one extra pad position) as the real protection; (b) reorder so VBUS pairs with GND, for example VBUS, nRESET, SWDCLK, SWDIO, 3V0, GND, then 3V0 meets nRESET (harmless) and GND meets VBUS (reverse polarity, which D2 and the PMIC input must tolerate: check the nPM1300 VBUS reverse rating, NOT CHECKED); (c) put 100 R plus a TVS on TP6 as well (VTref is a high-impedance input, 100 R costs nothing).

### NEW-2 MINOR: watchdog is armed ~before the first kick, boot can take longer than 8 s only when the I2C bus is stuck
Evidence: main.c:41 `app_wdt_init()` first; the only kick is `tick()` (app_glue.c:193) whose first run is scheduled at the end of `app_glue_init` (app_glue.c:352), after ui_init, haptics_init, power_init (about 15 PMIC writes in `charger_lite_init`, power.c:144-160) and sensors_init. A NACK returns at once, but a stuck bus costs `I2C_NRFX_TRANSFER_TIMEOUT` 500 ms per try (Kconfig.nrfx:29), x3 tries plus bus recovery per access, so a stuck bus at boot can exceed 8 s and reset the chip in a loop. On a good image with a transient bus fault that prevents confirmation and rolls back. Not a problem with a healthy bus. The same applies in `tick()` itself if the bus sticks (identity check, power sample).
Fix: call `wdt_kick()` inside `pq_i2c_recover()` and between init steps in main(); or arm the watchdog after `power_init()`.

### NEW-3 MINOR: no reboot-loop guard for the fatal handler
Evidence: main.c:30-36. A persistent fault on a confirmed image reboots forever with no back-off; the noinit magic only records the last reason. Fix: count consecutive fatal reboots in the noinit area and, after 3, skip optional modules (sensors, HR) or stay in advertising-only mode.

### NEW-4 MINOR: documentation not updated after the fix
Evidence: power_budget.md contains no mention of R8/R9 1M standing loads (about 3 uA each while on) or the 1 A discharge limit; REPORT_watch_revB_2026-11-23.md:~line 300 still contains the literal placeholder `{{SECOND_REVIEW}}`; risk 14 in the report says via copper is 0.05 mm from "neighbouring pads" but the measured gap to foreign-net pads is 0.20-0.25 mm (the 0.05 mm is same-net). Fix: add the loads to the budget, fill or remove the placeholder, reword risk 14.

### NEW-5 MINOR: bond-lockout recovery depends on a button gesture
Evidence: prj.conf BT_MAX_PAIRED=1, accept list built from bonds (ble_pq.c:164-168). Phone-side "forget device" alone does not let a phone re-pair. Fix: state it on the pairing screen or in the README troubleshooting; consider letting the accept list expire after N seconds without a bonded peer.

### NEW-6 MINOR: TVS standoff
Evidence: D2/D4-D6 are PESD5V0S1BA (design.py:68,139), 5.0 V standoff. VBUS from a cradle can sit at 5.0-5.25 V. Leakage near standoff is not specified in the repo, so NOT CHECKED. Fix: read the datasheet leakage at 5.25 V; if it matters use a 5.5 V or 6 V standoff part on D2 only.

## 6. Counts

Counted by individual first-round finding (hand count, approximate to one or two): FIXED ON PAPER 18, PARTLY 8, NEEDS HARDWARE 6, OPEN 14 (power 4, rf 5, mechanical 1-3, qa 1/2/5/9/10, sourcing 4/5/7/13). Not verified by me, status taken from the report or left undecided: mechanical 4-7 and 9, manufacturing M4-M8 (shown OPEN/NOT CHECKED), power 6, rf 2, sourcing 1-3 and 6 (NOT CHECKED).

## 7. What I did not check

Datasheet pin-by-pin correctness of every part (circular check), nPM1300 start-up behaviour, TVS part data, CPL and bottom-side rotation, fiducials and panelisation, mask opening vs via holes, via tenting, buck/boost layout loops, antenna geometry and wrist performance, FCC and BLE qualification, mechanical stack, sourcing prices and stock, whether `prod.conf` builds (not compiled by the authors either), host tests (`core` tests: I only read the log summary "ALL PASS, sanitizer clean" in check_output.txt), hardware behaviour of any firmware change.
