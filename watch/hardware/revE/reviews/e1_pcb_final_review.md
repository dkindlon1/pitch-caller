# E1 final PCB review, PitchIQ watch rev E (copy of rev D)

Date 2026-11-23. Read-only review. Nothing was built, run or flashed; nothing here says a board works.
Tags: MEASURED (how) / FROM FILE (path:line) / NOT CHECKED.
Scratch: /tmp/e1pcb (a.py, b.py, c.py = pcbnew scripts; rt.txt = Raytac spec text). Paths below are relative to watch/hardware/revE/.

Method used for the net-level checks: a pcbnew script (python3, `pcbnew.LoadBoard`) compared the net on EVERY pad of every footprint in
kicad/pitchiq_watch.kicad_pcb with scripts/design.py. MEASURED: 62 design parts, 66 footprints (4 extra = H1..H4 mounting holes),
0 pad-net mismatches, 0 side mismatches. So board copper = design.py for all parts. The remaining risk is design.py vs the real datasheets, which is what the topics below check.

## Verdict table

| # | Topic | Verdict |
|---|---|---|
| 1 | J1 display connector | Pin order PASS; cable-entry direction and contact side BLOCKED (physical mock-up), and the repo contradicts itself: treat as FAIL until closed |
| 2 | Charging, flat battery | PASS on paper (firmware vs cell); cold start from flat cell BLOCKED (bench); CC Rd with unpowered chip BLOCKED |
| 3 | nPM1300 reference compliance | PASS (pins, L, C values); F7 voltage-rating deviation stays (should fix, one line) |
| 4 | USB-C / protection | PASS for function; no ESD on CC1/CC2 (nice to have) |
| 5 | BLE antenna keep-out | PASS (measured, all 6 layers); tuning BLOCKED |
| 6 | SWD / recovery | PASS (pads, resistors, reachability); recovery only via SWD pads (no serial or BLE recovery) |
| 7 | LIS2DH12 | PASS |
| 8 | Motor driver | PASS (no gate series resistor: nice to have) |
| 9 | Test points | PASS (list below) |
| 10 | Orientation / polarity | pin-to-net PASS; battery polarity silk FAIL (no silkscreen exists at all) |
| 11 | Routing / grounding | PASS for the real currents; F10 reduced to nice to have |
| 12 | Firmware to board pin map | PASS: 11 of 11 GPIOs verified against the Raytac spec |
| 13 | Leftovers F2 F6 F7 F8 F9 F10 F12 | see section 13 |

## MUST FIX before ordering boards

1. J1 (display connector) orientation is unresolved. Contradiction: scripts/design.py:94-99 says "cable entry toward the lower board edge" and that
   KiCad's 3D model shows actuator and slot at footprint +y; reviews/p1_display_connector.md section 2/4 infers opening toward -y (north) from the footprint geometry
   (pads at local y -1.85 on the front edge). The KiCad 3D model is not on this machine (/usr/share/kicad/3dmodels is absent: NOT CHECKED), and the Hirose
   drawing could not be fetched (curl and the local /tmp/ds/fh12.pdf, which is not a PDF, both failed). So neither claim can be reproduced here.
   Measured board state (pcbnew): J1 at (14.0, 31.0) rot 0, top side, pad 1 at x=11.75, pad 10 (LCD_SCK) at x=16.25, pads at y=29.15, body toward y 29.8..35.4, board bottom edge y=36.
   The mapping pad n = Sharp terminal 11-n puts terminal 1 (SCLK) on the east pad, which is what the fold requires, so the nets are right for rot 0.
   Action (no layout change until the answer is known): do the one-hour mock-up with a real LS013B7DH03 and a real FH12A-10S-0.5SH(55): fold the tail and see which side of the connector it enters.
   - If the tail enters from the south (design.py comment true): no change.
   - If it must enter from the north: rotate J1 180 degrees. gen_pcb.py:40 `"J1": (14.0, 31.0, 0)` -> `(14.0, 31.0, 180)`, and in design.py:101-102 make pad n = terminal n
     (pad "1" = T1 SCLK, "2" = T2 SI, "3" = T3 SCS, "4" = T4 EXTCOMIN, "5" = T5 DISP, "6" = T6 VDDA, "7" = T7 VDD, "8" = T8 EXTMODE, "9" = T9 VSS, "10" = T10 VSSA).
     After rotation the body occupies y ~26.6..31.2 and pad 1 is at x=16.25 (east). Re-run the router and DRC: the C22/C23/R9/R10/C21 neighbours (gen_pcb.py:40) and U2 (pads from x=18.86) may collide.
   - Hedge that removes both the entry and contact-side doubt: a dual-contact 0.5 mm 10-way connector (reviews/p1_display_connector.md section 5 names two) with a verified footprint.
   Also FH12A land pattern equal to the FH12 footprint is unverified (design.py:104).
2. Battery polarity is not marked. MEASURED (pcbnew): zero silkscreen items on the whole board, no footprint silk text, no board silk text. Only the fab-layer text "PitchIQ watch rev D - NOT BUILT OR TESTED" exists.
   BT1 pad 1 = "+" = BATP at (28.5, 22.6), pad 2 = "-" = GND at (28.5, 19.4), bottom copper. A reversed cell destroys the nPM1300 (VBAT).
   Change: gen_pcb.py `silk()` (line ~52, F_SilkS only) add a layer argument and add on B_SilkS: "+" beside (28.5, 22.6) and "-" beside (28.5, 19.4); also mark pin 1 of J1 side ("1" at x=11.75).
   (Reference designators were deliberately moved to the fab layer, gen_pcb.py:37, so the board has no silk text.)

## SHOULD FIX (cheap, no layout impact)

3. F7: design.py:21 `C10u` uses CL10A106KP8NNNC (10 V). It feeds C1 (3V0), C6 (VBAT), C7/C8 (VSYS), C10 (BUCK2 out). Nordic's BOM (nPM1300 PS v1.3, config 1 table 40, /tmp/dl_pcm/npm.txt around line 8140) uses 25 V X5R for the 10 uF parts, and the datasheet requires "rated voltage >= 10 V" for the buck output cap (Table 21).
   10 V X5R 0603 loses roughly half its capacitance at 4-5 V bias (typical X5R behaviour, not measured). Change the part to a 16 V or 25 V 10 uF 0603 X5R (family CL10A106KO8NNNC is 16 V; confirm the LCSC number before use) in design.py:21 and keep the desc text honest. VBUS/VBUSOUT 1 uF parts are CL05A105KA5NQNC (25 V by Samsung's code A): fine.
4. USB-C to USB-C chargers with an unpowered chip: design.py:131-133 itself says it is unknown whether the nPM1300's internal 5.1 k Rd (Table 9, npm.txt:916) exists with VBAT flat and VBUS absent. A C-to-C source gives no VBUS without Rd, so a flat watch could be unchargeable on such a charger. BLOCKED on a bench test. Hedge if the test is not done first: add two DNP 0402 5.1 k pads (CC1 to GND, CC2 to GND); fit only if the test fails. (Never fit with the internal Rd active: 2.55 k is out of range.)

## NICE TO HAVE

- Series 100R in each MOSFET gate (Q1 VIB, Q2 FL_PWM): none today (design.py:117, 111). PWM at 20 kHz from a GPIO into AO3400A is functional without; the resistor only damps edges.
- CC1/CC2 ESD diodes at J3 (IP67 port is user-touched; only VBUS has D2).
- C6/C7/C12/C5 sit 3.8 mm from the U2 pins (MEASURED: U2 pad 19 (23.74, 24.95) vs C6 (27.5, 26.0); C12 (27.5, 22.4)); move to 2 mm.
- Direct 3V0 probe point (TP6 is 3V0 through R20 1 k).
- Board text "rev D - NOT BUILT" -> "rev E".
- U2 exposed pad has 4 vias of 0.2 mm (MEASURED), FAB_NOTES requires epoxy fill (docs/FAB_NOTES_revD.md:8); make sure the order form selects it.

---------------------------------------------------------------------------------------------------

## 1. J1 display connector
- Sharp terminal list, MEASURED by reading /tmp/ds/sharp.txt lines 247-262 (Table 4): 1 SCLK, 2 SI, 3 SCS, 4 EXTCOMIN, 5 DISP, 6 VDDA, 7 VDD, 8 EXTMODE, 9 VSS, 10 VSSA.
- design.py:101-102 maps pad 10 = T1 SCLK ... pad 1 = T10 VSSA (pad n = terminal 11-n). Board pad nets (MEASURED): pad 1 GND, 2 GND, 3 LCD_EXTMODE, 4 3V0, 5 3V0, 6 LCD_DISP, 7 LCD_EXTCOMIN, 8 LCD_CS, 9 LCD_MOSI, 10 LCD_SCK; pad positions x = 11.75 + 0.5(n-1). So terminal 1 is on the east pad: matches design.py:93 fold logic (terminal 1 stays east). PASS for pin order given the fold description.
- Firmware to terminals: SPI P0.13 (SCK) -> pad 37 -> LCD_SCK -> J1.10 = T1 SCLK; P0.15 MOSI -> pad 39 -> LCD_MOSI -> J1.9 = T2 SI; P0.17 CS -> pad 41 -> LCD_CS -> J1.8 = T3 SCS; P0.20 -> pad 44 -> LCD_EXTCOMIN -> J1.7 = T4; P0.22 -> pad 46 -> LCD_DISP -> J1.6 = T5. PASS (MEASURED by script through design.py and the Raytac table, section 12).
- EXTMODE = 3V0 through R11 0R (design.py:107), matching dts "EXTMODE strapped high" and the driver's EXTCOMIN toggle (dts: extcomin-frequency 60 Hz, panel limit 54-65 Hz, sharp.txt:421).
- Open: entry direction, contact side, tail geometry. See MUST FIX 1. BLOCKED on physical parts.

## 2. Charging and depleted battery
- Cell: Adafruit 1317, 150 mAh, protected (design.py:72). Firmware, power.c: VTERM 4.2 V (TERM_IDX), warm 4.0 V, ICHG 75 mA = 0.5 C (dts term/current), discharge limit 1 A (415), VBUS start-up limit 100 mA with BUILD_ASSERT (power.c:121); raised to 500 mA only after USB-C detect reads 1.5/3 A (power.c VBUS_DETECT). VBATLOW charge enable written (power.c, reg 0x50). FROM FILE.
- NTC: board has RT1 10 k NCP15XH103F03RC on pad net NTC to GND (design.py:70; MEASURED pad nets; RT1 at (23.1, 33.0) top side, above the cell footprint which runs to y 35.8 per cad/params.py:43-44). Firmware: thermistor-ohms 10000. Binding enum is [0, 10000, 47000, 100000] (MEASURED: /home/claude/zws/zephyr/dts/bindings/sensor/nordic,npm13xx-charger-common.yaml:16-24), so index 1 is written to ADC NTCRSEL and the "NTC disabled" bit (index 0 only) is not set. Consistent: NTC fitted and enabled. NTC45C code 337 recomputed by hand: R(45C) = 10000 exp(3380(1/318.15-1/298.15)) = 4904 ohm, code 1024*4904/14904 = 337. OK. RT1 sits on the board 0.5 mm above the cell, not on it (datasheet npm.txt:7904 says to couple it to the battery pack): acceptable for prototypes.
- Flat or absent cell: datasheet (npm.txt:1233) says the charger waits until a battery is detected; JP1 open = no charging (safe). Flat cell: VBUS powers VSYS; MCU boots; firmware enables charge with trickle allowed. Trickle timeout recovery exists in power_sample (power.c, CHG_ERR_RETRIES). FROM FILE; not run.
- C24 (extra VSYS reservoir) is DNP in design.py:120 and absent from out/fab/bom_jlcpcb.csv (MEASURED by script: BOM minus design non-DNP = empty). OK.
- BLOCKED: a flat watch on a 100 mA source with 20 uF on VSYS (F2); the Rd question (SHOULD FIX 4).

## 3. Nordic reference compliance
- Datasheet pin table (MEASURED: /tmp/dl_pcm/npm.txt:7926-7970, Table 35) compared with design.py:49-58: all 32 pin names and the exposed pad agree.
- 8 pins re-verified against datasheet AND board copper (MEASURED: pad net on the board):
  pin 4 PVDD -> VSYS; pin 5 SW2 -> SW2 -> L2.1 (L2 pad 2 = 3V0); pin 12 VDDIO -> 3V0; pin 15 SHPHLD -> BTN (SW1 pad 1, D3); pin 16 VSET2 -> R2 150 k (npm.txt:2335 table: 150 k = 3.0 V); pin 17 VSET1 -> R1 0R to GND (npm.txt:2316: <100 ohm = BUCK1 OFF); pin 21 VBUS -> VBUS (D2, C12, J3 A9/B9); pin 22 VBUSOUT -> C5 only. Plus pin 32 VOUT2 -> 3V0, pin 33 EP -> GND with 4 vias. All pads carry the expected net.
- Inductor: design.py:63 L2 2.2 uH, DCR 150 mohm typ. Datasheet Table 20 (npm.txt:2376-2382): 2.2 uH +-20 %, DCR <= 400 mohm, Isat > 350 mA, Imax > 200 mA. Isat of MLP2012H2R2MT0S1: design.py says "not published"; /tmp/ds/tdk.pdf has no text layer. Rated 1 A from file. NOT CHECKED against the TDK document; margin to 350 mA looks large if the 1 A figure is right.
- Capacitors: C10 (BUCK2 out) 10 uF, rating 10 V = minimum allowed; C7/C8 VSYS, C6 VBAT 10 uF 10 V; C12 VBUS and C5 VBUSOUT 1 uF 25 V. Nordic BOM uses 25 V parts for the 10 uF caps and 2.2 uF on VBAT. F7 stays: SHOULD FIX 3.
- BUCK1 unused: VOUT1 and SW1 open, VSET1 grounded (design.py:50, 68). LSIN1/LSIN2 tied to GND, LSOUT open (design.py:56-57): no rule against this found in npm.txt (grep for unused/floating found only CC and NTC rules at lines 857 and 1299).

## 4. USB-C and protection
- J3 pads (MEASURED): A12/B12 GND, A9/B9 VBUS, A5 CC1, B5 CC2, S1-S4 shell all GND. CC1 -> U2.23, CC2 -> U2.24 directly, no external Rd (design.py:131), correct given Rd 5.1 k internal (npm.txt:916). Pad order along the connector: GND, VBUS, CC2, CC1, VBUS, GND (y 7.75 ... 13.25) is the standard receptacle order seen from the A12 end. FROM FILE for the pad geometry (GCT drawing in research/usbc_motor.md): NOT CHECKED against the drawing.
- D2 SMF5.0A (design.py:71): stand-off 5.0 V, clamp 9.2 V per design.py desc; nPM1300 VBUS survives 22 V per design.py:67 (NOT re-read in the datasheet by me). D2 at (8.0, 13.2), 1.4-4 mm from the J3 VBUS pads; cathode pad 1 = VBUS (MEASURED). Leakage at 5 V is a standing load of up to hundreds of uA (typical for the 5.0 V class; NOT CHECKED against smf.pdf, no text layer).
- ESD on CC pins: none. Shell to GND directly: acceptable.

## 5. BLE antenna
- MEASURED (pcbnew rule area + zone fills + tracks): rule area "antenna keep-out" on F.Cu, In1..In4, B.Cu, bbox x -1..33, y -1..4.45 mm, no copper pour, no tracks, no vias. Tracks and vias inside it: none. Zone-fill points inside: only at the fill boundary (y 4.0 across the board; under the module x 6.5..23.5 the fill edge is at y>=4.45; MEASURED boundary points at (6.5, 4.07-4.1) and (23.5, 4.1) lie at the zone's outer corners, outside the module's x range 9.75..20.25). scripts/check_antenna.py gives 0 foreign copper items (out/check_output.txt). Pads in the rule area: U1 pads 1 and 55 (GND, module's own), J3 S2/S4 shell pads (x 1.0 and 4.0, y 4.7, size 1.5 x 0.9), H1/H2 holes (non-plated).
- Module placement (MEASURED): U1 centre (15.0, 8.4) rot 0, body y 0.65..16.15, pads start at y 4.65, so the antenna end lies in the keep-out and 0.65 mm from the board edge.
- RF risk (not a layout defect I can fix): J3 metal shell body sits at x ~0.3-7.3, y ~4.3-16.8 (bottom side), about 2.5 mm from the module's left edge and 0.5 mm below the keep-out; the display and case metal are not in this file. NOT CHECKED; needs a range or RSSI check with the real watch. BLOCKED.
- Ground stitching: 51 GND vias total (MEASURED); stitching density near the module NOT CHECKED.

## 6. SWD and recovery
- Pads TP2..TP6 (bottom side, x = 2.4, y 19.4 nRESET, 22.0 SWDCLK, 24.6 GND, 27.2 SWDIO, 29.8 3V0; MEASURED), 1.5 mm round, mask-open, 2.6 mm pitch. Series R17 (SWDIO), R18 (SWDCLK), R19 (nRESET) 100R, TVS D4-D6, 3V0 reference through R20 1 k (design.py:139-149). Module pads 51 SWDIO and 53 SWDCLK (Raytac spec lines 459 etc.), 40 = nRESET with R16 10 k pull-up. PASS.
- Access: cell footprint starts at x 6.6 (cad/params.py:44), pads at x 1.65..3.15, so with the cell in place and the back cover off the pads are free (gen_pcb.py:44 comment). With the cover on: NOT CHECKED (no jig geometry in MECH_revD.md).
- UICR: dts `&uicr { gpio-as-nreset; }` (pitchiq_watch.dts) so P0.18 = nRESET, matching the 10 k pull-up.
- Recovery: mcuboot.conf has CONFIG_BOOT_SERIAL_UART=n and CONFIG_SERIAL=n (FROM FILE: app/sysbuild/mcuboot.conf:4-5). With APPROTECT on (prod.conf:6-7) the only way back from a bad CONFIRMED image is `nrfutil device recover` over the SWD pads (README.md:46), which erases bonds. An unconfirmed bad image reverts through MCUboot's swap (not tested). BLE DFU only works if the app runs. Acceptable for five prototypes; consider leaving APPROTECT off in prototype builds.

## 7. LIS2DH12 (U4)
- Datasheet pin table (MEASURED: /tmp/ds/lis.txt:402-427): 1 SCL, 2 CS (1 = I2C), 3 SA0, 4 SDA, 5 Res (GND), 6-8 GND, 9 Vdd, 10 Vdd_IO, 11 INT2, 12 INT1. design.py:85-87 identical; board pad nets identical (MEASURED). SA0 = 3V0 gives address 0011001 = 0x19 (lis.txt:1241-1243); dts reg = <0x19>.
- INT1 -> ACC_INT -> module pad 20 = P0.04 (Raytac spec: (20) P0.04/AIN2) = dts PQ_PIN_ACCEL_INT1 4. INT2 NC. PASS.
- Pull-ups R3/R4 4.7 k to 3V0 on SDA/SCL (design.py:81; MEASURED pads). Decoupling C13 100 nF (24.5, 8.7) and C26 100 nF (26.9, 7.9), U4 at (24.5, 6.9). PASS.

## 8. Vibration motor
- Q1 AO3400A: SOT-23 pad 1 G = VIB, 2 S = GND, 3 D = MOTOR_N (MEASURED pads; AO3400A SOT-23 pinout G,S,D). R15 100 k gate pull-down (design.py:118). No gate series resistor (nice to have).
- D1 1N4148WS: pad 1 K = VSYS, pad 2 A = MOTOR_N (MEASURED). KiCad SOD-323 pad 1 = cathode. Flyback orientation correct (cathode to supply). M1 + to VSYS, - to MOTOR_N.
- Rail: VSYS is battery (3.1-4.2 V) or about 5 V on USB; motor 35 mA max (design.py:116) is small against the PMIC's capability. Firmware caps duty for ~3 V (haptics.c:50-55). Whether the 8 mm motor tolerates 3 V is an ASSUMPTION in the dts, not checked.
- PWM: P0.11 -> pad 27 -> VIB -> Q1.G (MEASURED + Raytac). PWM1 channel 0 at 20 kHz (dts). PASS.

## 9. Test and programming pads (MEASURED, pcbnew, coordinates relative to board origin, all bottom side, 1.5 mm round, mask open)
| Ref | Net | Position | Notes |
|---|---|---|---|
| TP1 | VBUS | (9.5, 7.0) | outside the cell footprint (cell y >= 9.8) |
| TP8 | VSYS | (20.5, 7.0) | same |
| TP5 | NRESET_P (via R19 100R) | (2.4, 19.4) | left strip, clear of cell |
| TP4 | SWDCLK_P (R18) | (2.4, 22.0) | |
| TP2 | GND | (2.4, 24.6) | middle of the 5, ground |
| TP3 | SWDIO_P (R17) | (2.4, 27.2) | |
| TP6 | 3V0_P (R20 1 k) | (2.4, 29.8) | VTref only |
All are reachable with a probe on a bare board (bottom up) and with the cell and battery connected (cell sits at x >= 6.6, y 9.8..35.8). No top-side probe point exists; the I2C lines, PMIC_INT, NTC and SW2 have no pad. TP2..TP6, TP1, TP8 are marked DNP in design.py but are bare copper pads: nothing to place.

## 10. Orientation and polarity
Pad-number-to-net (MEASURED, all pads match design.py; design.py matches datasheets as follows):
- U2: all 32 + EP vs Table 35: PASS. Pin-1 position of the QFN on the board: pads 1-8 are on the left column (x 18.86), pads 17-24 on the right (x 23.74), pad 19-22 y 24.95..23.45 bottom to top: counter-clockwise from pin 1 at top left, standard.
- U4: PASS (section 7). Q1/Q2: G,S,D PASS. D1, D2, D3 pad 1 = cathode as KiCad footprints; D3 pad 1 = BTN, pad 2 = GND. SW1: pad 1 BTN, pad 2 GND, MP GND. U1: all used pads match the Raytac spec (section 12).
- J1 pad order: section 1. J3: section 4. Y1 and RT1: not polarised.
- Battery: BT1 pad 1 "+" BATP, pad 2 "-" GND; JP1 pad 1 BATP, pad 2 VBAT. Netlist correct. Silk marking: none (FAIL, MUST FIX 2).
- M1: pad 1 = "+" (VSYS), pad 2 = "-" (MOTOR_N). A coin ERM runs either way; no marking needed.
- CPL rotations (MEASURED, out/fab/cpl_jlcpcb.csv vs pcb): Q1 pcb rot 0 -> CPL 270; U2, U4, D1 rot 0 -> 0; D2 rot 90 -> 90; SW1 -90 -> 270. Whether JLCPCB's part library needs a rotation offset for SOT-23, SOD, QFN and the side switch (F11) can only be settled with JLCPCB's placement preview. BLOCKED.

## 11. Routing and grounding (MEASURED, pcbnew)
- Every track on the board is 0.2 mm (width histogram: VBUS, VBUSOUT, VSYS, VBAT, BATP, 3V0, SW2, MOTOR_N, GND all {0.2: n}).
- Lengths and layers: VBUS 39.9 mm (F.Cu 16.7, In3 7.1, B.Cu 16.0), 6 vias; VSYS 52.6 mm (F 28.5, In3 17.8, B 6.3), 4 vias; VBAT 5.7 mm; 3V0 24.4 mm, 22 vias, plus an In4 3V0 plane; SW2 1.9 mm single segment pair on F.Cu; MOTOR_N 35.9 mm (F 8.3, In2 11.9, In3 15.6), 3 vias.
- Currents: IPC-2221 (my arithmetic, 1 oz outer 0.2 mm = 10.9 mil2: 0.75 A for 10 C rise; 0.5 oz inner about 0.08 A*dT^0.44, so about 0.2 A for 10 C). Real worst case: charge 75 mA/0.9 + load about 100 mA, motor 35 mA: about 0.2-0.25 A. Inner-layer VBUS/VSYS runs (7.1 and 17.8 mm) are the weakest; resistance of 7.1 mm at 0.2 mm 0.5 oz is about 34 mohm. Not a function stopper. Stackup copper weights are only in docs/FAB_NOTES_revD.md:4 (1 oz outer, 0.5 oz inner); the pcb file carries no stackup block (NOT CHECKED).
- Buck loop: U2 SW2 pad (18.86, 24.45), L2 (15.5, 25.9) rot 180, C10 (12.1, 25.9) BUCK2 output cap, C8 (15.5, 23.9) and C25 (17.6, 23.45) at PVDD (C25 1.3 mm from pin 4). Plane order F.Cu / In1 GND / In2 / In3 / In4 3V0 / B.Cu GND (MEASURED zones): GND plane directly under the top layer, so the SW2 return is continuous. Plane continuity under the module and buck: fills present on In1, B.Cu, F.Cu GND (4, 2, 3 outlines); NOT checked for slivers.
- F10 reduced to nice to have: widen VBUS/VSYS to 0.3 mm where space allows (gen_pcb.py/router.py width).

## 12. Firmware-to-board pin map (MEASURED: Raytac MDBT50Q Ver.K spec, downloaded from the SparkFun cdn, /tmp/e1pcb/raytac_real.pdf, 75 pages, text in rt.txt; plus KiCad's own RF_Module symbol MDBT50Q-1MV2, which agrees on all 57 pins; /tmp/ds/raytac.pdf is a 403 HTML page, not a datasheet)
| MCU pin | Firmware name (dtsi) | Raytac pad | Raytac spec | design.py net | Goes to | Result |
|---|---|---|---|---|---|---|
| P0.13 | PQ_PIN_LCD_SCK 13 (SPIM2 SCK) | 37 | (37) P0.13 | LCD_SCK | J1.10 = Sharp T1 SCLK | match |
| P0.15 | LCD_MOSI 15 | 39 | (39) P0.15 | LCD_MOSI | J1.9 = T2 SI | match |
| P0.17 | LCD_SCS 17 (cs-gpios, active high) | 41 | (41) P0.17 | LCD_CS | J1.8 = T3 SCS, R10 100k to GND | match |
| P0.20 | LCD_EXTCOMIN 20 | 44 | (44) P0.20 | LCD_EXTCOMIN | J1.7 = T4 | match |
| P0.22 | LCD_DISP 22 | 46 | (46) P0.22 | LCD_DISP | J1.6 = T5, C21, R9 | match |
| P0.24 | LIGHT_PWM 24 | 48 | (48) P0.24 | FL_PWM | Q2.G, R14 | match |
| P0.26 | I2C_SDA 26 | 19 | (19) P0.26 | I2C_SDA | U2.13, U4.4, R3 | match |
| P0.27 | I2C_SCL 27 | 16 | (16) P0.27 | I2C_SCL | U2.14, U4.1, R4 | match |
| P0.04 | ACCEL_INT1 4 | 20 | (20) P0.04/AIN2 | ACC_INT | U4.12 INT1 | match |
| P0.06 | PMIC_INT 6 | 22 | (22) P0.06 | PMIC_INT | U2.8 GPIO1 (pmic-int-pin = 1) | match |
| P0.11 | MOTOR_PWM 11 | 27 | (27) P0.11/TRACEDATA2 | VIB | Q1.G, R15 | match |
| P0.18 | gpio-as-nreset (uicr) | 40 | (40) P0.18 nRESET | NRESET | R16, R19, TP5 path | match |
| SWDIO / SWDCLK | n/a | 51 / 53 | SWDIO / SWDCLK | SWDIO / SWDCLK | R17/R18 -> TP3/TP4 | match |
| P0.00/P0.01 | XL1/XL2 | 17 / 18 | XL1 / XL2 | XL1 / XL2 | Y1, C3, C4 | match |
| VDD, VDDH, VBUS, DCCH | n/a | 28, 30, 32, 31 | VDD, VDDH, VBUS, DCCH | 3V0, 3V0, GND, NC | USB unused: VBUS to GND | match |
Pads that are not NC in the module but unused here (P0.09/P0.10 = NFC pads 52/54, all others) are NC in design.py: no conflict. Firmware does not use P0.09/P0.10 (dtsi comment). No mismatch found. The accelerometer address 0x19 and the PMIC address 0x6B in the dts are consistent with the hardware (LIS2DH12 datasheet; nPM1300 TWI address 0x6B from the Zephyr node, not re-read in the datasheet).
Note: the dtsi pwm1_default uses PWM_OUT0 for the motor, which is the first channel of the PWM1 instance (correct: PWM_OUTn is per instance).

## 13. Leftover items from audit_electrical_power_firmware.md
- F2 (cold start from 100 mA USB, flat or absent cell, 20 uF on VSYS): still applies; bench-only. BLOCKED. Optional hedge: DNP series footprint between U2.20 and the load (not in the design today).
- F6 (crystal pad crossing XL1/XL2): still applies as a routing nicety. XL1 net 7.2 mm F.Cu, no vias (MEASURED). Fix if the board is re-routed: swap design.py:44 Y1 pins 1 and 2 nets ("XL1","XL2" -> "XL2","XL1") only if the router then shortens; a crystal is not polarised, so it works either way. Nice to have.
- F7 (10 V caps on 5 V rails, VBAT 10 uF vs Nordic 2.2 uF): applies; see SHOULD FIX 3. A 10 uF on VBAT is larger than Nordic's 2.2 uF; not a defect by itself.
- F8 (no disable-before-ISET write in charger_lite_init): still applies. power.c charger_lite_init writes ISET/VTERM then EN_SET without writing BCHGENABLECLR (CHGR 0x05) first; it matters only if charging was left enabled across a warm reset. Fix: in charger_lite_init before the first ISET write add `rc |= pm_wr(CHGR_BASE, 0x05U, 1U);` (BCHGENABLECLR, datasheet npm.txt:1163). Low risk; firmware, no board change.
- F9 (motor during USB with a low cell): still applies. haptics.c only scales duty from power_vsys_mv_estimate() (power.c); no low-battery or charging gate. Fix: skip haptics_buzz when last_mv < 3300 and not vbus, and when charging at the 100 mA limit.
- F10 (0.2 mm VBUS/VSYS tracks): still true (MEASURED); reduced to nice to have, see section 11.
- F12 (stale "rev C" strings): still applies. pitchiq_watch.dts compatible = "pitchiq,watch-rev-c" while model says "rev D"; pitchiq_watch-pinctrl.dtsi line 2, Kconfig.pitchiq_watch:1, board.yml:1,6, pitchiq_watch.yaml:4, power.c:121 and :285, haptics.c:5, docs/power_budget.md:1. Cosmetic; if compatible is renamed, check nothing else matches on "pitchiq,watch-rev-c" (NOT CHECKED).

## BLOCKED on physical parts or measurements
J1 cable entry and contact side (real panel + FH12A); nPM1300 Rd with unpowered chip on a C-to-C charger; flat-cell cold start (F2); antenna tuning and USB shell influence; JLCPCB CPL rotation preview (Q1, Q2, D1, D2, SW1, U2, U4); 8 mm motor voltage rating; L2 saturation current (TDK file unreadable here); inner-layer copper weight actually delivered; programming jig access with the cover on.

## What I did not check
Router DRC details (DRC report says 0 errors, 0 unconnected, 68 warnings, FROM FILE out/drc_report.txt); schematic ERC; gerbers; the Python research files; display/frontlight Azumo wiring beyond the netlist; BLE firmware.
