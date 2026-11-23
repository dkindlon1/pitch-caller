# QA review, rev B (hardware QA engineer). Evidence-based; nothing here was built or measured on hardware.

Method: ran check.sh; read every script; wrote independent read-only scripts in /tmp/qa (x1.py cross-check, m1-m4.py measurements, pcbnew + `kicad-cli sch export netlist` to /tmp); read firmware pin files, defconfig, power.c, sensors.c, app_glue.c, ble_pq.c, haptics.c; ran `make test`; inspected (did not rebuild) the existing build directory /home/claude/zws/build_pitchiq. No project file other than this one was modified.

## 0. Output of `bash scripts/check.sh` (complete, as run 2026-11-23, wall time 1.4 s)

```
== 1 schematic parses in KiCad and its netlist equals design.py
netlist check: 39 nets in schematic, 39 in design, 70 components, differences: 0
== 1b scripted electrical-rule check (NOT KiCad's ERC: KiCad 7 has no command-line ERC)
scripted ERC: 70 parts, 39 nets, errors 0, strap/passive-driven notes 3
  note  net BOOST_FB: input(s) set only by passive parts (strap or switch): U5.1, R6.2, R7.1
  note  net BTN: input(s) set only by passive parts (strap or switch): U2.15, SW1.1, D3.1
  note  net LCD_EXTMODE: input(s) set only by passive parts (strap or switch): J1.8, R11.2, R12.1
== 2 board copper equals design.py (pad nets) and KiCad DRC
board check: 70 footprints, 142 vias, 495 track segments, copper layers 6, pad-net differences: 0
DRC (KiCad 7.0.11): errors 0 {}, unconnected 0, warnings 73 {'silk_over_copper': 2, 'lib_footprint_issues': 70, 'track_dangling': 1}
antenna strip check (x 6-26 mm, y 0-4 mm, 6 layers): foreign copper items 0
== 3 BOM: every fitted part has an MPN, a source and (if machine-placed) an LCSC number
CPL rows: 56
BOM lines 41, SMT parts 56, unique SMT part numbers 27
on-board parts incl. battery+motor: $36.52 @1, $29.46 @~100; display +$12.39 @1 / +$7.97 @100; with display: $48.91 @1, $37.43 @~100
JLCPCB sides: {'F': 51, 'B': 5}
SMT parts without an LCSC number: []
BOM lines missing MPN or source: []
== 4 manufacturing files present
== 5 firmware: C core tests against the JavaScript app (host build)
[hook AES] the hook was called 2802 times
ALL PASS
sanitizer run: clean (no ASan/UBSan reports, exit 0)
CHECK: PASS (design files consistent and rule-clean; this says nothing about a built board)
```

## 1. What the check can and cannot catch (what could be wrong while everything passes)

Chain of custody: design.py -> gen_sch.py -> schematic -> `kicad-cli` netlist -> check_net.py compares it back to design.py. gen_pcb.py/router.py build the board from design.py, and check_pcb.py compares pad nets back to design.py. Every comparison is circular. A wrong fact in design.py (pin number, pin type, value, footprint choice, placement) is faithfully copied into the schematic, board, ERC, BOM and CPL and all of them pass. The only independent inputs are the research notes, and no script reads those.

What each script does not see:
- check_net.py: compares nets (39 = 39) and the ref set only. Not values, footprints, pin names, pin electrical types, or the symbol-pin-to-footprint-pad mapping beyond equal numbers.
- check_pcb.py: compares pad nets only (line 6-9). It does not compare footprint name, side, position, value or rotation. (I did, see section 2: no differences.)
- erc.py: runs on pin types that design.py itself declares. Types are chosen to make it pass: nPM1300 BUCK outputs VOUT1/VOUT2 are declared `pi` and the inductor pin 2 is declared `po` "as the ERC's power source" (design.py:59 comment); VBAT is `io`; CC/LSIN pins `pas`. The only real voltage-domain test is an 11-entry hand table (erc.py LIMIT), which cannot see capacitor DC-bias derating, VBUS 5.0-5.5 V against the 5 V stand-off TVS, ratings of the 0603 10 V parts on the 5 V_LED node, sequencing, or I2C level compatibility (MAX30101 VDD 1.8 V on a bus pulled to 3.0 V: the research file says INFERENCE only). The 3 "strap/passive-driven" notes are informational and cannot fail.
- drc.py: exit 0 whenever errors = 0 and unconnected = 0; every warning class is ignored by the exit code. DRC ran with footprints saved WITHOUT a library nickname (all 70 board footprints have an empty lib name, `PQ` for the custom ones), so KiCad skipped its footprint-vs-library comparison: 70 `lib_footprint_issues` are that, not 70 independent defects. I re-did the comparison myself against /usr/share/kicad/footprints: 3 differences, all explained (SW1 pad trim is the documented DFM change; U2 has extra paste-aperture sub-pads with no number; U3 pad order only differs because the footprint was mirrored top-to-bottom). So no hidden footprint edit, but the check cannot be trusted to find one.
- check_antenna.py: tests only the rectangle x 6-26, y 0-4 mm. Passes. It says nothing about the battery, the display or the enclosure next to the antenna (finding 7).
- BOM/CPL/Gerber step: step 4 only tests that the fab files exist and are non-empty. check.sh does not regenerate the Gerbers or `pitchiq_watch-pos.csv`; gen_bom.py silently reads whatever pos.csv is on disk to build the CPL. Today they agree with the board (section 2) but nothing enforces it.
- `make test` (step 5) tests the portable message logic only (section 4).
- 73 warnings: see 1.1.

### 1.1 DRC warning classes (out/drc_report.txt)
| Class | Count | Matters? |
|---|---|---|
| lib_footprint_issues | 70 | No by itself; it means the footprint-vs-library DRC check did not run. Compensated by my manual comparison. Fix by giving footprints a library nickname (or loading a fp-lib-table) so KiCad can run the check. |
| silk_over_copper | 2 | No. Both are Y1 (crystal) silk lines at board (9.725, 17.125) and (9.725, 18.875) clipped by the C3/C4 pad mask openings. Cosmetic; the fab clips the silk. |
| track_dangling | 1 | No, electrically benign. Found with pcbnew: net 3V0, F.Cu, 0.2 mm stub from (23.7, 6.7) to (23.5, 6.7) board coordinates. Its east end lies on LIS2DH12 pad 3 (3V0) and its west end lands mid-segment on the diagonal (23.7, 6.5)->(23.3, 6.9) that runs to via (23.2, 6.9). KiCad flags a T-joint at the middle of a segment as "dangling"; DRC reports 0 unconnected, so the net is whole. Cosmetic router artifact. |

## 2. Independent cross-check results (x1.py)

| Comparison | Result |
|---|---|
| design.py vs schematic netlist, all 70 refs: value and footprint | 0 differences |
| design.py vs board: footprint name, side (F/B), value, pad copper layer vs side | 0 differences (70/70) |
| design.py vs board: pad nets | 0 (same as check_pcb) |
| design.py vs docs/BOM.csv: value, MPN, footprint, assembly class | 0 differences; BOM.csv carries all 70 refs plus LCD1 and FL1 (off-board lines) |
| design.py vs out/fab/bom_jlcpcb.csv: 56 fitted SMT refs, value, footprint, LCSC, MPN | 0 differences, none missing, none extra |
| out/fab/cpl_jlcpcb.csv vs board: 56 rows, layer, X, Y (sign flipped), rotation | 0 differences |
| Hand-soldered / not fitted excluded from BOM and CPL | Yes. Excluded: BT1, J2, JP1, M1 (hand), R12, TP1-TP9 (dnp). None of the 14 appear in either file. |
| Bottom parts flagged Bottom in CPL | Yes: U3, C14, C15, C16, C17 (= the 5 bottom SMT parts in design.py) |
| Gerber set | Six copper layers with content: F_Cu 9297 draws/373 flashes (incl. fills), In1 3757/142, In2 58/142, In3 43/142, In4 5186/142, B_Cu 4864/173. Job file lists Copper L1..L6. PTH.drl holds 142 holes = 142 vias; every via is 0.50/0.25 mm. Edge_Cuts present. Inner signal layers In2/In3 carry only 58 and 43 segments each (the autorouter used F and B for 394 of 495 segments). |
| Gerbers current vs board | Not byte-verified: re-exporting with `--board-plot-params` gives extra via-drill flashes on the inner layers, i.e. different plot options, so no diff is meaningful. Counts (142 flashes = 142 vias) and CPL positions agree. |
| Via tenting | All 142 vias have no solder-mask layer in the board and the F/B mask Gerbers contain only the apertures for pads/test pads (C1.0/1.6/2.1 mm); no via-sized openings. All tented. |

Open items the cross-check cannot settle: CPL rotation convention for bottom parts and for U2/U5/SW1 against JLCPCB's part library (finding 2), and out-of-stock parts in the JLC BOM (finding 9).

## 3. Firmware vs hardware pin map

Module pad -> GPIO mapping in design.py (`used` + `other`) compared with the KiCad MDBT50Q-1MV2 symbol (/usr/share/kicad/symbols/RF_Module.kicad_sym, 61 pins): all 26 `used` entries and all 36 `other` entries agree. Compiled devicetree of the existing watch build (build_pitchiq/app/zephyr/zephyr.dts) agrees with pitchiq_watch-pinctrl.dtsi. Caveat: the KiCad symbol is a library file; the Raytac PDF was not independently read by me, so the pad->GPIO table has one independent source, not two.

| Net / pad | GPIO | Firmware | Polarity check |
|---|---|---|---|
| LCD_SCK pad 37 | P0.13 | SPIM2 SCK | n/a |
| LCD_MOSI pad 39 | P0.15 | SPIM2 MOSI | n/a |
| LCD_CS pad 41 | P0.17 | cs-gpios ACTIVE_HIGH | OK: SCS active high, R10 100k pull-down |
| LCD_EXTCOMIN pad 44 | P0.20 | extcomin-gpios, 60 Hz | OK with R11 (EXTMODE high) |
| LCD_DISP pad 46 | P0.22 | zephyr,user lcd-disp ACTIVE_HIGH | OK: R9 pull-down keeps display off |
| FL_PWM pad 48 | P0.24 | PWM0 ch0, normal polarity | OK: Q2 gate high = on, R14 pull-down |
| I2C_SDA 19 / SCL 16 | P0.26 / P0.27 | TWIM0 | OK: R3/R4 4.7k to 3V0 (pinctrl comment says "assumption: external pull-ups": they exist) |
| ACC_INT pad 20 | P0.04 | irq ACTIVE_HIGH | OK (LIS2DH12 INT1 push-pull, active high default) |
| HR_INT pad 21 | P0.05 | irq ACTIVE_LOW in DT, NOT used by sensors.c (FIFO polled) | polarity OK, R5 100k pull-up; wired but unused |
| PMIC_INT pad 22 | P0.06 | host-int-gpios ACTIVE_HIGH, pmic-int-pin = 1 | OK if nPM1300 GPIO1 is routed (design: U2 pin 8 GPIO1) |
| BOOST_EN pad 24 | P0.08 | boost-en ACTIVE_HIGH | OK: R8 pull-down |
| VIB pad 27 | P0.11 | PWM1 ch0, normal, 20 kHz, run at 100 % duty | OK: Q1 gate high = on, R15 pull-down |
| NRESET pad 40 | P0.18 | `&uicr gpio-as-nreset` | OK; R16 10k pull-up to 3V0 |
| XL1/XL2 pads 17/18 | P0.00/P0.01 | CLOCK_CONTROL_NRF_K32SRC_XTAL=y | OK (finding 5) |
| SWDIO/SWDCLK 51/53 | dedicated | none | n/a |

GPIO used by firmware and not wired: none (all 13 `PQ_PIN_*` appear in design.py). Wired but not used by firmware: HR_INT (P0.05, configured nowhere); LCD_EXTMODE strap (hardware only); nPM1300 GPIO0/2/3/4, LED0-2, LSOUT1/2 (open by design); LIS2DH12 INT2 (NC); P0.09/P0.10 (NFC pins, left floating, firmware does not touch them). No polarity mismatch found. Note the nPM1300 interrupt path also carries the user button, so the button depends on I2C (finding 4).

`make test` in firmware/core, full output (also run inside check.sh):
```
build/test_core tests/vectors.json
[software AES] 19 known-answer checks, 231 crypto vectors, 82 scenarios (1941 steps, 1424 events) compared: all identical to the JS
[hook AES] 19 known-answer checks, 231 crypto vectors, 82 scenarios (1941 steps, 1424 events) compared: all identical to the JS
[hook AES] the hook was called 2802 times
ALL PASS
--- again with -fsanitize=address,undefined
build/test_core_san tests/vectors.json
[software AES] 19 known-answer checks, 231 crypto vectors, 82 scenarios (1941 steps, 1424 events) compared: all identical to the JS
[hook AES] 19 known-answer checks, 231 crypto vectors, 82 scenarios (1941 steps, 1424 events) compared: all identical to the JS
[hook AES] the hook was called 2802 times
ALL PASS
sanitizer run: clean (no ASan/UBSan reports, exit 0)
```
These tests would pass unchanged with a wrong port for every peripheral: they compile only pq_core.c/pq_sec.c/tests (Makefile SRCS) and never include a devicetree, driver, GPIO, I2C, SPI, PWM, Bluetooth stack, MCUboot, or power.c/sensors.c/ui.c/haptics.c/hr_est.c. Wrong pin, wrong polarity, wrong I2C address, wrong LCD bit order, no clock crystal, charger never enabled: all invisible. They prove the message/crypto logic equals the JavaScript, nothing else.

Build logs (firmware/build_logs): two files of 46 lines each (`*.tail.log`), the last 46 ninja lines. They show: the MCUboot sub-build linking, one memory table (FLASH 27552 B of 48 KB = 56.05 % for pitchiq; 27356 B for the DK), and CMake's "Using default MCUboot signing key ... not secure" warning. They do not show the application image, its size, its warnings, or an exit status, and a 46-line tail cannot show "no compiler or Kconfig warning" (README claim). I did not rebuild (brief), but the on-disk build supports the README numbers: `arm-none-eabi-size build_pitchiq/app/zephyr/zephyr.elf` gives text 217300, data 2520, bss 48039 (README: 217,300 B flash); app/zephyr/zephyr.signed.bin 219,983 B exists (12:36). `.config` shows K32SRC_XTAL=y, `CONFIG_WATCHDOG` not set, swap-using-move.

## 4. Measurements on the board (m1.py, m2.py, m4.py; pcbnew read-only; board coordinates, origin top-left of board)

All tracks are 0.20 mm; one net class (Default: clearance 0.15, via 0.50/0.25); design-rule minimum clearance 0.127. Distances are copper edge to copper edge.

Minimum clearance per layer (different nets; zones excluded):
| Layer | track-track | track-pad | via-involved | pad-pad (library) |
|---|---|---|---|---|
| F | 0.200 (I2C_SCL/I2C_SDA near 23.5, 26.6) | 0.175 (ACC_INT to U4.11) | 0.216 (5V_LED to GND via) | 0.150 (U4 pins 1-2, LGA land pattern) |
| In2 | 0.383 (FL_PWM/SWDCLK) | none measured under 0.4 | 0.216 (BTN to GND via) | n/a |
| In3 | 0.200 (I2C_SCL/LCD_MOSI near 21.8, 23.8) | n/a | 0.189 (ACC_INT to LCD_DISP via at 20.9, 9.6) | n/a |
| B | 0.200 (5V_LED/HR_INT near 16.5, 15.6) | 0.175 (VBAT track to C16.2) | 0.189 (GND to 3V0 via at 21.1, 21.3) | 0.400 |
| In1, In4 (planes) | via-to-via 0.400 | | | |
Smallest gap anywhere: 0.150 mm (U4 library pads, mask web then 0.05 mm with 0.05 mm expansion, below typical fab mask-web limits: the mask will be merged between those pads, normal for LGA but not checked by DRC because `solder_mask_min_width` is 0). Smallest routed-copper gap: 0.175 mm. All are above the 0.127 mm rule and above JLCPCB's 6-layer minimum; none is a defect.

Copper to board edge: closest track 1.50 mm, closest via 1.35 mm, closest pad corner 1.10 mm (J2 and SW1 MP). Plane pours are inset 0.30 mm from the edge (gen_pcb.py zone inset); rule is 0.25 mm. OK.

Vias per net class: there is only the Default class, so 142 vias in one class. By role: 74 on GND/3V0 (GND 54, 3V0 20), 18 other power (5V_LED 5, VSYS 4, VBUS 3, 1V8 2, VBAT, VBUSOUT, BATP...), 50 signal (I2C_SCL 6, I2C_SDA 5, LCD_DISP 3, NRESET 3, SWDIO 3, XL2 3, remaining signal nets 1-2 each). No power/signal net class separation exists (all 0.2 mm, so e.g. VSYS to the boost and motor is 0.2 mm wide; ~0.2 A peak is within trace capability but the voltage drop is not computed anywhere).

Crystal nets (Y1 at (10.4, 18.0)): XL1 = 4.30 mm of track on F, 0 vias. XL2 = 7.64 mm (0.90 mm F + 6.74 mm on In3), 3 vias. Asymmetric by 3.3 mm and 3 vias; unequal stray C only shifts load by a fraction of a pF (small against 18 pF + 3.5 pF assumed), but XL2 spends 6.7 mm on an inner layer whose neighbour In2 has no plane between them. Distance, nearest copper of XL net to nearest copper of switching net (pads included): XL1-BOOST_SW 1.66 mm (Y1/C3 area to L3 at (6.8, 22.4)), XL2-BOOST_SW 2.48 mm, XL1-SW1 5.43, XL1-SW2 7.30, XL2-SW1 5.61, XL2-SW2 7.09 mm. Centre-line crossings in plan with other nets: XL1 and XL2 are crossed by I2C_SCL (0.00-0.01 mm centre distance, i.e. crossing) and I2C_SDA on different layers. 32 kHz crystals are tolerant; flagged MINOR (finding 12).

Antenna keep-out (rule area x 6-26, y -1..4, all 6 layers; module's own keep-outs x 9.8-22.2, y 0.65-4.4): zero tracks, vias or fills inside. Nearest non-pad copper: GND track on F at (11.1, 4.8) and (20.6, 4.8), 0.70 mm from the strip; GND vias 0.75 mm; nearest signal via I2C_SCL at (23.5, 5.7), 1.45 mm; nearest signal track 1.5 mm. Items within 1 mm: those 4, all GND. No signal track is under the keep-out or within 1 mm of it. But the board's own fab drawing (gen_pcb.py line 117) puts the display outline at y 2.85-33.15, i.e. 1.55 mm of the display overlaps the antenna zone in plan (finding 7).

Vias near optical sensor U3 (centre (16.0, 20.5), body outline x 13.97-17.92, y 17.44-23.69): 28 vias within 3 mm of the outline, 6 of them at 0.00 mm (under the body: GND at (15.6, 23.4), (14.1, 20.3), (16.7, 21.2), NRESET (15.5, 17.5) and others at <=0.1 mm, BOOST_EN (13.9, 18.8)). All are tented (none has a mask opening; B.Mask layer absent on all 142 vias). Untented vias within 3 mm of U3: 0.

## 5. Findings

Severity: BLOCKER = fix before ordering boards; MAJOR; MINOR. No BLOCKER defect was found that I could prove from files alone. The two items closest to blockers are findings 2 and 3, which can lose a whole assembled unit or the MCU.

**1. MAJOR: "CHECK: PASS" is self-consistency, and one footnote is missing from the claim.** Evidence: section 1. All comparisons are circular; the pin tables of U2 (nPM1300), U3, U4, U5, J1, SW1 have no independent mechanical check. I verified the module map against the KiCad symbol (OK) and U5's pin table against the TI datasheet page I fetched (https://www.ti.com/lit/gpn/TPS61023, DRL: 1 FB, 2 EN, 3 VIN, 4 GND, 5 SW, 6 VOUT, matches). I could not independently check U2, U3, U4 (no library symbol exists for them in /usr/share/kicad/symbols). Fix: before ordering, have a second person tick each IC pin against the PDF pin tables (nPM1300 QFN32, MAX30101 OLGA-14, LIS2DH12 LGA-12, FH12 contact numbering, Alps switch pads) and print the check as "consistency", not "verified".

**2. MAJOR: bottom-side placement is mirrored top-to-bottom with CPL rotation 0, and the CPL has not been checked against JLCPCB's orientation convention.** Evidence: gen_pcb.py:91 `f.Flip(f.GetPosition(), False)` mirrors about the horizontal axis, then `SetOrientationDegrees(rot)` with rot 0. For U3 the board has pin 1 at (-1.2, +2.4) mm from centre; the library footprint has pin 1 at (-1.2, -2.4); KiCad's normal bottom flip (left-right) at rotation 0 would put pin 1 at (+1.2, -2.4). The board equals KiCad's standard bottom placement turned 180 degrees, but out/fab/cpl_jlcpcb.csv says `U3,...,Bottom,0.000000`. Passives are symmetric; U3 (a $13-16 asymmetric OLGA, pin 1 marking not on the board silk) is not: if JLC's library rotation is applied literally the sensor is soldered 180 degrees off, SDA/SCL/INT/VDD/VLED all on the wrong pads. Also not checked: JLC rotation offsets for U2 (QFN-32), U5 (SOT-563), Q1/Q2, SW1 (rotated 90), J1. Fix: regenerate bottom parts with `Flip(pos, True)` and the rotation value that JLC expects, then confirm every IC (U2, U3, U4, U5, U1, J1, SW1) in JLCPCB's own DFM/assembly viewer before paying; add a pin-1 mark to the fab/silk layers.

**3. MAJOR: the five cradle pads on the wrist face put nRESET, SWDIO and SWDCLK on bare gold with no ESD part, series resistor or water tolerance.** Evidence: design.py TP3/TP4/TP5 (side B) tie straight to U1 pads 51/53/40 (only R16 10 k pull-up on nRESET); D2 protects only VBUS; D3 only the button. Pads are 2 mm discs at 4 mm pitch (x = 8, 12, 16, 20, 24 mm at y = 28.5 mm) on the side that touches skin and sweat. Sweat or a water film across GND-nRESET (2 mm gap per pair: GND is adjacent to SWDIO; nRESET is adjacent to SWDCLK, not to GND, but one film spans several) holds nRESET low or injects levels into the MCU: the watch resets or sits in reset while worn. A wet cradle with 5 V on VBUS puts up to 5 V (through the film) on pins rated VDD+0.3 V. Skin ESD goes direct to the MCU. Fix: series 100-470 ohm on SWDIO/SWDCLK, a 3.3 V low-capacitance TVS array on the three pads, move the programming contacts away from the skin face or place them under a removable cover, and give nRESET a stronger pull-up (1 k to 4.7 k) or disable the pin reset in production (UICR) once firmware is stable.

**4. MAJOR: one I2C bus carries the charger/button chip and all sensors; firmware has no bus recovery, no retry, no watchdog.** Evidence: design.py nets I2C_SDA/SCL (U1, U2, U3, U4); power.c `power_init` is called once, logs the error and continues; main.c lines 30-34; `CONFIG_WATCHDOG` not set (.config); README says the watchdog is not enabled in v1. The charger is enabled only by firmware writes at boot (power.c charger_lite_init; the chip comes up with charging off). The button reaches the firmware only as an nPM1300 event read over I2C (pmic_event). A stuck-low bus at boot (any sensor, or ESD) means: no charging ever (silent battery drain), button dead, no battery reports; Bluetooth/LCD/buzz keep working until the cell is flat; and `healthy` stays true so an update would still be confirmed. Fix: retry `power_init` with i2c bus recovery (9 SCL pulses) at intervals, treat charger enable failure as non-healthy, enable the hardware watchdog, and consider a second I2C bus (TWIM1 on spare pins) for the sensors.

**5. MAJOR: crystal that does not start hangs boot with no fallback.** Evidence: pitchiq_watch_defconfig comment ("the nRF52 clock driver spins forever at boot waiting for it"); `.config` has K32SRC_RC not set. Y1 and the 18 pF caps are untested and the XL2 route is 7.6 mm. The user sees a dead watch (no screen, no advertising, no RTT after kernel start). Fix: first-article test (checklist step 8) before anything else; and ship a build option or runtime fallback to the RC oscillator (CONFIG_CLOCK_CONTROL_NRF_K32SRC_RC with calibration) so a bad crystal degrades battery life, not function.

**6. MAJOR: a bad or wrong-board image can be accepted and permanently confirmed over Bluetooth.** Evidence: prj.conf MCUBOOT debug key (CMake warning in both build logs; the public key is in the Zephyr tree, and README acknowledges this); the DK build is signed with the same key and passes the same confirmation test: on a watch it would advertise, `healthy` is true (ui_init cannot fail: SPI writes are unacknowledged), and after 15 s `boot_write_img_confirmed()` makes it permanent. The DK image uses PQ_BATTERY_STUB and no charger setup, so charging is never enabled; the only recovery is the SWD pads and a probe. Rollback covers crashes and hangs, not wrong-function images. Fix: production signing key (README already says so), embed a board ID checked in the app before confirm, and make the confirm test also require power_init success and a successful I2C read of the charger.

**7. MAJOR: antenna environment is a coin-flip that the package does not test.** Evidence: gen_pcb.py:117 draws the display outline at y 2.85-33.15 over the chip-antenna strip (module keep-out y 0.65-4.4, antenna end 0.125 mm from the board edge); the cell (metal pouch) is drawn at y 8.5-34.5 over the module body; the wrist is on the other face. check_antenna.py only checks copper in the PCB plane. Raytac's keep-out guidance was not read by me in this review. Fix: confirm with Raytac's layout guideline (the module datasheet, not the KiCad footprint), add the metal-near-antenna constraint to the enclosure drawing, and make checklist step 15 (RSSI against a dev kit, on and off the wrist) a go/no-go.

**8. MAJOR: peak load can exceed the PMIC discharge limit the firmware itself sets, and nothing serialises the loads.** Evidence: dts `dischg-limit-microamp = <200000>`; docs/power_budget.md says worst case 150-240 mA when motor (100-150 mA), radio and a MAX30101 LED pulse coincide, "under the nPM1300's 200 mA ... only if the firmware avoids buzzing during a heart-rate LED pulse train"; haptics.c has no reference to sensors/HR; the motor is driven at 100 % duty with no soft start (haptics.c motor_set). Result: during a buzz with heart rate on the nPM1300 can trip its battery current limit, VSYS sags, the 3V0 rail drops, and the watch resets in the middle of a call. Also L3 (TDK MLP2012H1R0MT0S1, saturation current not recorded in the BOM) sits behind a boost whose valley limit is 2.7 A min (research datasheets.md 6.3) charging ~25 uF (C16-C20); the first BOOST_EN may pull a very high spike from VSYS. Fix: raise the discharge limit to 1 A in the dts (power budget says it is selectable) or pause HR LED pulses during a buzz; ramp the motor; measure VSYS during BOOST_EN and buzz (checklist steps 11-12); get an inductor datasheet with Isat >= 3 A or confirm startup current on the bench.

**9. MAJOR: the JLC BOM includes two parts that the BOM itself calls unavailable.** Evidence: design.py U1 desc "LCSC out of stock Nov 23: consign", U2 "LCSC 0 stock Nov 23: buy at DigiKey/Mouser"; both rows are in out/fab/bom_jlcpcb.csv and CPL (U1 C5118826, U2 C7501206), together the two largest cost items. The caveat is only in a description column JLC does not read. Fix: remove U1/U2 from the assembly files, or set them up as consigned parts with the order form; do not upload this BOM as-is.

**10. MAJOR: battery can be soldered in backwards and nothing stops it.** Evidence: BT1 is the symmetric footprint PQ:Pad_2x_wire (1.8 x 3.0 mm pads at +/-1.6 mm); polarity is two silkscreen characters "+" and "-" at (1.3, 8.4) and (8.0, 8.4); the cell's leads are hand-soldered. nPM1300 abs max VBAT is -0.3 V (research power.md line 146). A reversed cell at JP1 drives the PMIC, C6 and the 3V0-rail loads with -4 V. User sees nothing (board dead) after the part is destroyed. Fix: asymmetric pad size or a keying silkscreen box, a P-FET or Schottky reverse guard at JP1, and an assembly drawing with lead colours.

**11. MINOR: RT1 is not placed against the cell and sits next to the charger.** Evidence: design.py desc "place against the cell"; gen_pcb.py PLACE RT1 (29.8, 27.6); cell outline x 6.1-25.9, so RT1 is 3.9 mm beyond the cell edge and about 4.5 mm from U2. The NTC then reads board temperature near the PMIC. Fix: move RT1 under the cell area or use a flying NTC bonded to the cell.

**12. MINOR: crystal routing.** XL2 is 7.64 mm with 3 vias and 6.7 mm on In3 next to In2 with no plane between; I2C crosses both nets; the boost inductor is 1.66 mm from the XL1 land. Not a proven problem for a 32 kHz crystal. Fix: re-route XL1/XL2 as short F-layer pair over In1 GND, equal length; check start-up time (checklist step 8).

**13. MINOR: I2C pull-ups to 3.0 V on a part whose VDD is 0 V most of the time.** Evidence: research datasheets.md 205-206 (INFERENCE; no leakage statement for SDA/SCL above VDD). With BUCK1 off, SDA/SCL at 3.0 V through 4.7 k may back-feed the MAX30101 core through an input diode. Fix: measure 1V8 with HR off (checklist step 7); if above 0.2 V, add a switch/level shifter or keep BUCK1 on.

**14. MINOR: VBUS TVS stand-off equals the input.** D2 PESD5V0S1BA is a 5.0 V stand-off part on a cradle supply that may reach 5.25-5.5 V; leakage rises and the clamp may conduct on a high cradle. Fix: 6 V or higher stand-off (still under the PMIC's 22 V rating) or specify a 5.0 V +/-5 % cradle supply.

**15. MINOR: fab files are not regenerated by check.sh.** pitchiq_watch-pos.csv, the Gerbers and the drill files are made by an earlier step (13:42) and only tested for existence. Fix: have check.sh re-export them to a temp directory and diff or at least compare timestamps with the .kicad_pcb.

**16. MINOR: build evidence is thin.** build_logs are 46-line tails. They show MCUboot built and no app memory line; the README's "no compiler or Kconfig warning" cannot be seen in them. The on-disk ELF supports the sizes. Fix: store the full logs and the final `west build` exit code.

**17. MINOR: holding the button 5 s wipes pairing even if the user means a hard reset.** Evidence: PQ_BOND_CLEAR_HOLD_MS 5000 < 10 s hardware reset. A 30 s hold wipes the bond (5 s), resets at ~10 s, and can repeat after the reboot while still held. The user has to re-pair. Fix: require a separate gesture, or show a confirmation.

**18. MINOR: no assembly drawing.** Reference designators are on Fab layers only; silk has three labels. Pin-1/polarity marks for the sensor, TVS diodes (D1-D3), the module and FPC are not on the board. Compounds finding 2.

## 6. Failure-mode review (circuit plus firmware together)

| Event | What the user sees | Detected / survived? |
|---|---|---|
| Battery fully flat | Dead watch. On the cradle VBUS powers VSYS through the PMIC power path and the MCU boots, then firmware enables charging (power.c). | Survived if firmware boots and I2C works; until then charging is off (findings 4, 6). Cell protection IC may add a no-charge period at deep discharge: unverified. |
| Cable attached, no battery (JP1 open, which is also the state of the first board) | Watch runs from cable; button works. | Survives. Charger will cycle on the 10 uF VBAT cap; firmware posts battery removed events (EVT_CHARGER) but shows nothing. 100 mA VBUS limit until the firmware raises it. Measure it (checklist 5). |
| Cell reversed at JP1 | Dead board, possibly smoke or heat. | Not detected; PMIC VBAT abs max -0.3 V (finding 10). |
| Button held 30 s | Pairing wiped at 5 s, watch power-cycles at about 10 s (nPM1300 hardware), may loop while held. | Survives (hardware reset); the pairing loss is a design choice (finding 17). |
| LCD FPC not seated | Blank screen. Buzz, Bluetooth and receipt continue; the pitch call never shows. | NOT detected: SPI to the panel has no readback, `ui_init` cannot fail, image is confirmed. Reversed connector order puts 3V0 on the panel's DISP/EXTCOMIN inputs and the panel's VSS pins on the MCU SPI outputs; likely no visible image, damage unlikely but not verified. Flipped FPC (no contact) is the same as not seated. |
| MAX30101 absent or 1.8 V rail missing | Heart rate never starts; calls and buzz work. | Detected: `sensors_hr_start` reads part ID 0xFF (want 0x15), logs an error, switches BUCK1 off and returns. Survives. A 1.8 V short is different (boost shorted row). |
| Boost shorted (5V_LED to GND) | When enabled: VSYS collapses, watch resets or the cell's protection trips and the watch goes dead until charged. When disabled the TPS61023 isolates the output. | Not detected (no monitoring of 5V_LED). BOOST_EN has a pull-down so it is off after any reset; the next HR subscribe repeats it. 2.7 A min valley limit (finding 8). |
| I2C bus stuck low (one sensor failed) | Battery percent stops updating, button and frontlight gesture dead, no charging if it happens at boot. LCD, buzz, Bluetooth still work. | Not recovered (finding 4). |
| Crystal not starting | Watch looks dead: no screen, no advertising. | Not survived: the clock driver waits forever (finding 5). Nothing to roll back to because no reset occurs after that point. |
| Firmware update interrupted mid-transfer | Old firmware keeps running; partial slot-1 image is never marked for test. If power is lost during the swap, MCUboot swap-using-move is built to resume. | Survives by design (MCUboot); not tested by anyone. |
| Bad image flashed over Bluetooth | A crashing or non-advertising image rolls back on the next reset (needs a manual reset: no watchdog, so a hang persists until the user holds the button 10 s). A wrong-function image that advertises is confirmed permanently. | Partly (finding 6). |
| Dropped in water with cradle pads exposed | On the wrist face: pads bridged by water; nRESET can be pulled low (watch stuck in reset) while wet; on the cradle, VBUS can leak 5 V into SWD pins; gold pad corrosion if a supply stays attached. After drying it should recover. | Not protected (finding 3). Enclosure ingress is outside this package. |

## 7. First-article bring-up checklist (not present in the package)

Use a current-limited bench supply, a meter, a scope and a nRF52840 DK as the reference radio. Record the value measured next to each pass criterion. Stop at the first failure.

1. Visual and pin 1: under a microscope check U1, U2, U3 (bottom), U4, U5, J1, D1-D3, Q1, Q2, SW1 orientation against the pin-1 marks; inspect the J1 and SW1 solder joints (SW1 pads were trimmed from the stock land pattern). Pass: all orientation marks agree with the assembly drawing; no bridges.
2. Unpowered shorts (JP1 open, no cell): resistance to GND on VBAT, VSYS, VBUS, 3V0, 1V8, 5V_LED, VBUSOUT. Pass: each above 1 kohm (the 3V0 node >= 1 kohm and rising as caps charge); none below 100 ohm.
3. Cradle supply only (VBUS 5.0 V, current limit 100 mA, JP1 open, no cell): apply. Pass: supply current below 20 mA after 1 s; VBUS pad 4.9-5.1 V; VSYS present; 3V0 = 3.00 V +/- 3 % (2.91-3.09 V; hard limits 2.85-3.15 V); 1V8 = 1.80 V +/- 3 % (1.75-1.85 V) (BUCK1 is on at start-up); 5V_LED < 0.1 V.
4. Program: SWD to the cradle pads: read DEVICEID/FICR, `nrfutil device recover` if APPROTECT, flash MCUboot then app. Pass: probe connects at 1 MHz three times in a row; flash verify reports OK.
5. First boot on cable, no cell: RTT logs "PitchIQ watch firmware starting", no error lines; `power_init` returns 0. Pass: no brown-out reset in 10 minutes; supply current below 20 mA average. With no cell and the charger enabled, scope VBAT for 60 s: pass if it settles at or below 4.45 V with no repeating restart faster than 1 s; otherwise disable charging when no cell is detected.
6. Fit cell: solder JP1 with the correct polarity (meter the lead colours and the pad: + to BT1 pad 1 BATP side). Pass: before bridging JP1, meter BATP to GND = cell voltage with correct sign (3.3-4.2 V). After bridging: VBAT = cell voltage within 20 mV.
7. Rails on battery only (cable off): wake from ship mode with a 1 s press if needed. Pass: 3V0 3.00 V +/- 3 %; 1V8 when HR off < 0.2 V (finding 13); 5V_LED < 0.1 V; VSYS within 0.1 V of VBAT minus drop.
8. Crystal: build a test image that routes the 32.768 kHz LFCLK (RTC compare, PPI to GPIOTE) to a spare GPIO toggling at 1 Hz; measure with a frequency counter over 60 s. Pass: LFCLK start within 1 s of power-up; 1 Hz output within +/-20 ppm (period 1.000000 s +/- 20 us); no hang after five cold boots; repeat at 10, 25 and 40 C if possible.
9. I2C: with HR core on, scan 0x00-0x7F. Pass: ACK at 0x19, 0x57, 0x6B only; LIS2DH12 WHO_AM_I (reg 0x0F) = 0x33; MAX30101 part ID (reg 0xFF) = 0x15; nPM1300 (0x6B) ACKs and a read of the charger status register (0x03/0x34) returns without NACK; ADC VBAT reading within +/-50 mV of the meter. Scope SDA/SCL: rise time below 300 ns at 400 kHz; no clock stretching beyond 10 us.
10. Display: draw all-white, all-black, checkerboard, a 128x128 border, and the real pitch screen. Pass: no inverted columns (PQ_LCD_BIT_ORDER_MSB set correctly), no random pixels at power-up, no fade after 10 minutes (EXTCOMIN 60 Hz measured at 55-65 Hz, duty near 50 %), supply current delta with the display on below 50 uA average, correct orientation. Pull the FPC and reseat: the picture returns.
11. Buzz: run the 450 ms buzz and the 2 x 120 ms pattern on battery and on cable. Pass: motor current at 3 V steady 40-70 mA, start-up peak at VSYS below 200 mA and below the dts discharge limit; VSYS dip below 200 mV; 3V0 never below 2.85 V; no reset in 50 consecutive buzzes; buzz while HR is running also passes (finding 8).
12. Heart-rate rails: enable the boost with HR active. Pass: 5V_LED between 4.80 and 5.10 V (calculated 4.95 V; VREF 580-610 mV gives 4.83-5.07 V); settling within 5 ms of BOOST_EN (firmware assumption); VSYS dip below 300 mV at enable; green LED current through the sensor 9.6 mA (0x30 setting) +/-20 %; PPG signal present with a finger on the window (AC amplitude above 0.1 % of DC).
13. Currents (cell fitted, JP1 bridged, meter on the BATP lead or a source-meter replacing the cell): ship mode, measured on a bench supply at VBAT 3.8 V without the cell (the cell's own protection IC draws 1-4 uA): pass below 2 uA, hard fail above 10 uA; advertising 1 s with screen on, HR off: pass below 80 uA average over 60 s (estimate 50 uA); connected at 20 ms interval: pass below 1.1 mA average (estimate 0.70 mA, 1.5x margin); HR on, frontlight 30 %: below 5 mA (estimate 3.2 mA).
14. Charging: cradle 5.0 V, cell at 3.5 V. Pass: constant-current 75 mA +/- 10 % (67-83 mA) measured at the cell lead; termination 4.20 V +/- 1 % (4.158-4.242 V); VBUS current under the 500 mA limit; NTC reading consistent with ambient (+/-3 C); the charger status bits agree with the meter. With firmware removed (blank flash) confirm charging stays off, as the README claims.
15. BLE range: watch off-wrist on a plastic stand, then on the wrist, against the nRF52840 DK with the same advertising power (0 dBm), same phone, same room: RSSI at 1 m and at 5 m (line of sight), mean of 100 advertising reports. Pass: watch within 6 dB of the DK at 1 m and 5 m off-wrist; within 10 dB on-wrist; connection holds for 10 minutes at 5 m. Fail: more than 10 dB below the DK off-wrist (finding 7).
16. Pairing: factory-fresh watch, phone requests pairing. Pass: passkey shown within 1 s, 6 digits match, bond persists across a battery pull, a second phone cannot connect after bonding, 5 s hold forgets the bond and reopens advertising.
17. Sealed message round trip with the coach page (local copy with the PitchIQ name filter, see firmware/README): 50 consecutive messages. Pass: all 50 displayed and acknowledged, receipt received by the page for each, buzz each time, p95 latency below 1 s, zero duplicates, tamper (one flipped byte) rejected.
18. Firmware update and rollback: (a) upload a good signed image with mcumgr, `image test`, reset: new version string, confirmed after 15 s, survives a reset. (b) Upload an image built with `healthy=false`: after the reset and 15 s the watch is running the new image unconfirmed, a manual reset (10 s button hold) returns the old version. (c) Cut the Bluetooth link at 50 % of an upload: old image still boots, resumed upload works. (d) Remove the cell during the swap (after reset): the watch recovers to a valid image. (e) An upload from an unbonded phone is refused. Pass: all five.
19. Environmental: 30 min on the wrist; check the pads for sweat bridging (nRESET stays high, no resets); brief 1 minute damp-cloth wipe of the pads with the cradle disconnected; the watch must not reset (finding 3).

## 8. Readiness labels

| Label | Earned? | One line of evidence |
|---|---|---|
| DESIGN COMPLETE | No, not for ordering. The files are mutually consistent; they are not complete. | Section 2: all six files agree with design.py; but the brief itself lists unconfirmed nPM1300 capacitor nodes, LCD FPC side, frontlight, KiCad ERC not run, and findings 2, 3, 9, 10 are unresolved. |
| FIRMWARE BUILD VERIFIED | Yes, for "it compiled and linked" only. | On-disk build_pitchiq ELF is 217300 text, 48039 bss, signed.bin exists; the logs in build_logs are tails that do not show the app (finding 16); `make test` passes but never touches hardware code. |
| READY FOR PROTOTYPE REVIEW | Yes. | check.sh passes, section 2 cross-checks pass, and the package states what it has not done. This review is the proof it can be reviewed. |
| PHYSICALLY VALIDATED | No. | Nothing built, flashed or measured; the checklist in section 7 is entirely open. |
| PRODUCTION READY | No. | Debug signing key, no watchdog, no production test, unprotected programming pads, CPL and BOM not accepted by a fabricator. |

## 9. Checked and found correct

- check.sh reproduces on this machine: netlist 39/39 nets and 70/70 parts equal, scripted ERC 0 errors, DRC 0 errors / 0 unconnected, antenna strip empty, BOM 41 lines, CPL 56 rows, `make test` ALL PASS.
- Schematic netlist exported by `kicad-cli` matches design.py by ref, value and footprint; board matches design.py by footprint name, side, value, pad layer and net; docs/BOM.csv matches design.py for all 70 refs.
- out/fab/bom_jlcpcb.csv has exactly the 56 fitted SMT refs and no hand-soldered or DNP part; cpl_jlcpcb.csv matches the board in layer, X, Y and rotation and flags the 5 bottom parts Bottom.
- Gerbers: six copper layers with content; 142 PTH holes = 142 vias; all vias tented.
- Module pad -> GPIO map equals the KiCad MDBT50Q-1MV2 symbol for all 61 pins; every GPIO used by the firmware is wired; no wired signal other than HR_INT, EXTMODE and unused PMIC pins is ignored by firmware; polarities (SCS, DISP, EXTCOMIN, BOOST_EN, FL_PWM, VIB, INT lines) are consistent between dts and the pull-up/pull-down parts.
- TPS61023 pin table in design.py equals the TI datasheet (DRL package); BUCK straps (47 k = 1.8 V on BUCK1, 150 k = 3.0 V on BUCK2) match the VSET table in research/power.md.
- Feedback network: 0.595 V x (1 + 732k/100k) = 4.95 V, inside the MAX30101 VLED+ window; MAX30101 VDD 1.8 V rail within 1.7-2.0 V.
- Layout: all tracks 0.20 mm, minimum routed gap 0.175 mm, minimum copper-to-edge 1.10 mm (pads) / 1.35 mm (vias) / 0.30 mm (pours), nothing under or near the antenna strip except GND at 0.70 mm; no untented via near U3.
- The one `track_dangling` item is a benign T-joint stub on 3V0 at (23.7, 6.7); the two `silk_over_copper` items are Y1 silkscreen.
- Firmware core vs JS: 19 known-answer checks, 231 crypto vectors, 82 scenarios identical, sanitizer clean.
