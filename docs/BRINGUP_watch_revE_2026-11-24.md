# PitchIQ watch rev E: first-board bring-up and test procedure

Revised 2026-11-23 against the CURRENT `kicad/pitchiq_watch.kicad_pcb` (pad positions re-read with pcbnew, origin x=100 y=80), `scripts/design.py`, `docs/BOM.csv`, `docs/FAB_NOTES_revE.md`, and the firmware README "Rev E changes" with `app/src/bringup.c`, `app/bringup.conf`, `app/bringup.overlay`.

**Nothing has been built, flashed, powered or measured on hardware. The bring-up firmware variant compiles (build logs `build_logs/boss_revE_*.log`) and has never run.** Every number is tagged:

- **design value** = from a design file or a datasheet fact those files record (source named).
- **bench rule** = my own pass/stop threshold. NOT a design value.
- **not given** = the files contain no number; I did not invent one.

Read it once end to end before touching the board, and fill in the results sheet as you go.

Orientation and units:

1. Coordinates are board millimetres from the board file: origin top-left seen from the TOP (display) side, x right, y down; y = 0 is the antenna-end edge. The USB-C notch is in the LEFT edge (x = 0), y 5.35 to 15.65 (design value, `gen_pcb.py`). Board 30.6 x 36.0 mm. Looking at the BOTTOM side with the antenna end still at the top of your view, the left edge appears on the RIGHT. (B) = bottom-side part, (T) = top.
2. Use the **bring-up firmware variant** for the first board (Tests 5, 8-12). Use the **normal build** for Test 13 (current), because the bring-up build polls the PMIC every 5 s and the accelerometer every 1 s and drives a UART, so its current is not representative.
3. Stop at the first STOP and write down what you saw. Do not "try one more thing" with a cell connected.

---

## 0. Before power: safety, ESD, bench

### 0.1 Safety rules for the Li-po (Adafruit 1317, 150 mAh, protected, 3.7 V nominal, 4.2 V full)

1. **Never short the cell leads, even for a moment.** The pack's protection circuit is a last line of defence, not a fuse to test. Cut and strip ONE lead at a time, tape the other end.
2. **No heat on a cell.** Solder the leads with the lowest iron temperature that makes a good joint, quickly. Never put a board with a cell on a hot plate or under hot air. Do all hot-air work (U1, U2, J3, rework) BEFORE the cell is connected.
3. **Charge only while you are in the room watching.** No overnight, no "back in an hour", on any of the first boards. The first charge has a time limit (Test 5).
4. **Fire-safe surface:** ceramic tile or metal tray; a LiPo bag or lidded metal tin; dry sand or a suitable extinguisher within reach. Do not throw water on a burning Li-po; leave the room if it vents.
5. **Stop immediately** on: cell too hot to hold (about 45 degC, bench rule; the firmware itself stops charging above 45 degC, design value `power_budget.md`), swelling, hissing, a sweet or chemical smell, smoke.
6. **Check cell polarity with the meter before soldering** (Test 5). Do not trust wire colours.
7. Do not charge a cell that has been shorted, dented, punctured or is swollen.
8. A protected cell can read near 0 V if its protector has opened (`p1_electrical_reference.md`). Do NOT test that case on the first board (Test 5.5).
9. Keep JP1 (battery link) OPEN until Test 5. With JP1 open there is no battery connection at all, so Tests 1-4 and 6-9 run on USB power only.

### 0.2 ESD

- Wrist strap to a mat, or touch grounded metal before handling.
- Only the side button (clamp D3) and the programming pads (clamps D4-D6) have ESD clamps (design). Everything else, including the new top-side test pads, the module, the power chip and the LCD, is unprotected: hold the board by its edges, and do not drag a charged cable or wire across the pads.
- Keep the Sharp LCD in its anti-static bag until Test 9.

### 0.3 Bench equipment

| Item | Essential or nice | Used in | Cheap substitute |
|---|---|---|---|
| Digital multimeter: diode mode, resistance, DC volts to 0.1 mV, 200 mA range, 200 uA (or 2 mA) range, intact fuse | **Essential** | all | any 10-20 dollar DMM; check the fuse (continuity mA to COM) first |
| Current-limited bench supply, 0-5.5 V, limit adjustable down to 10 mA | **Essential** for Test 3 | 3, 4 | cheap USB-powered adjustable buck module with a current-limit knob. There is no safe zero-cost current limit. Fallback: USB-A 5 V charger + inline USB meter, accepting the supply can deliver amps if something shorts. |
| USB power meter (inline volts and mA) | Nice | 3, 5 | the bench supply display, or the DMM 200 mA range in the + lead |
| USB-C cables: one C-to-C, one A-to-C, with a known-good 5 V charger for each | **Essential** | 3, 5 | USB-C breakout board |
| **3.3 V USB-UART adapter** (CP2102, FT232 or similar, set to 3.3 V logic) | **Essential** for the bring-up build | 8-12 | none needed: they cost a few dollars. Without it you must use RTT through the DK instead (works, but needs the 5 SWD wires on the board all the time). Wiring in 0.5. |
| Terminal program for 115200 8N1 (for example `picocom -b 115200 /dev/ttyUSB0`, PuTTY, Arduino serial monitor) | **Essential** | 8-12 | any serial terminal |
| nRF52840-DK (the 10-pin "Debug out" header P20 is the programmer) | **Essential** | 6-14 | any J-Link or CMSIS-DAP probe (RTT works with J-Link; CMSIS-DAP via pyOCD not checked here) |
| 5 fine jumper wires or 5-pin pogo jig (SWD) | **Essential** | 6-14 | wire-wrap wire soldered to the pads. Programming pads are 1.5 mm round at 2.6 mm pitch (design value, board file and BOM). |
| 3 fine wires for the UART (adapter RX, GND, optional TX) | **Essential** | 8-12 | wire-wrap wire. The UART pads are 1.0 mm round at 2.0 mm pitch (BOM: TestPoint_Pad_D1.0mm). |
| Magnifier: 10x loupe or USB microscope | **Essential** | 1 | phone macro camera and good light |
| Hot air + flux | Nice (essential for U1, U2, J3 rework) | 1 | hot plate/preheater + iron + flux |
| Fine soldering iron, solder, flux, wick, tweezers | **Essential** | 1, 5 | none |
| Phone with nRF Connect | **Essential** | 10 | another BLE scanner; nRF Connect shows interval and RSSI |
| Oscilloscope or 8-ch USB logic analyser | Nice | 3, 4, 9, 12 | meter with a Hz mode for EXTCOMIN; a 10 dollar 24 MHz logic analyser |
| Nordic PPK2 | Nice | 13 | multimeter in series (burden voltage caveats in Test 13) |
| IR thermometer | Nice | 5 | back of a finger: if you cannot hold it 3 seconds, stop (bench rule) |
| Ceramic tile, LiPo bag, sand, Kapton tape, side cutters, heat-shrink | **Essential** | 5 | metal tray and lidded tin |

### 0.4 Pad finder (all from the current board file; mm)

| Name | Where (x, y) | Notes |
|---|---|---|
| Programming pad nRESET = TP5 (B) | (2.4, 19.4) | 1.5 mm round |
| Programming pad SWDCLK = TP4 (B) | (2.4, 22.0) | |
| Programming pad GND = TP2 (B) | (2.4, 24.6) | middle pad |
| Programming pad SWDIO = TP3 (B) | (2.4, 27.2) | |
| Programming pad 3V0 reference = TP6 (B) | (2.4, 29.8) | through R20 = 1 kohm |
| VBUS test pad TP1 (B) | (9.5, 7.0) | |
| VSYS test pad TP8 (B) | (20.5, 7.0) | |
| **TP9 VBAT (T)** | (8.6, 34.2) | new in rev E, 1.0 mm |
| **TP10 I2C_SDA (T)** | (10.6, 34.2) | |
| **TP11 I2C_SCL (T)** | (12.6, 34.2) | |
| **TP12 LCD_EXTCOMIN (T)** | (14.6, 34.2) | |
| **TP13 UART_TX (T)** (module P0.05) | (16.6, 34.2) | goes to the adapter's RX |
| **TP14 UART_RX (T)** (module P0.08) | (18.6, 34.2) | from the adapter's TX (see 0.5) |
| **TP15 GND (T)** | (20.6, 34.2) | |
| Battery pad "+" (BT1 pin 1, net BATP) (B) | (28.5, 19.5) | 3.0 mm (x) by 1.8 mm (y) |
| Battery pad "-" (BT1 pin 2, GND) (B) | (28.5, 16.3) | 3.2 mm centre to centre from "+". The bottom silkscreen has "+" and "-" beside each pad (`gen_pcb.py`: 2.3 mm toward the cell side of each pad); I have not seen the printed board, so still verify with the meter. |
| JP1 pad A (net BATP) (B) | (28.5, 31.25) | solder jumper, 1.3 mm pitch |
| JP1 pad B (net VBAT) (B) | (28.5, 29.95) | |
| Side button SW1 (B) | (28.5, 12.0) | |
| USB-C J3 contacts (B) | A12 GND (7.03, 7.75); A9 VBUS (7.03, 8.98); B5 CC2 (7.03, 10.00); A5 CC1 (7.03, 11.00); B9 VBUS (7.03, 12.02); B12 GND (7.03, 13.25) | |
| Shell stakes S4, S2, S3, S1 (B) | (1.0, 4.7), (4.0, 4.7), (1.0, 16.3), (4.0, 16.3) | plated slots |
| Cell body (B) | x 6.6 to 26.35, y 9.8 to 35.8 (`cad/params.py`) | TP1, TP8, programming pads, battery pads and JP1 are all outside this area. TP9-TP15 are on the TOP side. |
| GND, top | TP15 (20.6, 34.2); C1 pin 2 (20.97, 17.80); C5 pin 2 (22.90, 19.42); C7 pin 2 (25.15, 18.58) | |
| 3V0, top | C1 pin 1 (19.42, 17.80); C11 pin 1 (28.60, 26.92); C10 pin 1 (25.03, 33.50) | |
| VSYS, top | C7 pin 1 (25.15, 20.12); C8 pin 1 (22.10, 29.38); TP8 (B) | |
| VBAT, top | TP9 (8.6, 34.2); C6 pin 1 (26.85, 20.12) | |
| VBUSOUT, top | C5 pin 1 (22.90, 20.38) | |
| VBUS, top | C12 pin 1 (23.90, 20.38); D2 pin 1 (8.0, 14.6); TP1 (B) | |
| SDA / SCL | TP10 (10.6, 34.2) / TP11 (12.6, 34.2); also R3 pin 2 (12.51, 31.20) / R4 pin 2 (14.51, 31.20) | |
| NRESET, top | R16 pin 2 (15.91, 18.00) | |
| NTC | RT1 pin 1 (28.90, 31.51) | |
| VSET1 / VSET2 | R1 pin 1 (28.20, 20.41) / R2 pin 1 (28.70, 22.41) | |
| LCD connector J1 (T) | pad 1 (13.05, 23.55) ... pad 10 (17.55, 23.55), 0.5 mm pitch; side tabs (11.15, 26.80) and (19.45, 26.80). Pad 1 GND, 2 GND, 3 EXTMODE, 4-5 3V0, 6 DISP, 7 EXTCOMIN, 8 CS, 9 MOSI, 10 SCLK. J1 pad n carries Sharp terminal 11 - n. | J1 is centred at (15.3, 25.4) |
| Module edge pad 44 EXTCOMIN | (19.65, 9.75) | still reachable with the display fitted |
| CC fallback resistors (T), NOT fitted | R21 (CC1 to GND): pad 1 (21.30, 20.41), pad 2 (21.30, 19.39). R22 (CC2 to GND): pad 1 (20.20, 20.46), pad 2 (20.20, 19.44) | BOM: DNP |
| Motor pads M1 (T) | + (VSYS) (2.2, 28.2); - (MOTOR_N) (4.2, 28.2) | |

**The seven new top pads TP9-TP15 sit at y = 34.2, under the display's folded tail. Use them BEFORE the display is fitted** (Tests 2-8 and the first half of 9). After the display is on, use RTT (through the SWD pads) for logs, and the module edge pad 44 for EXTCOMIN.

### 0.5 USB-UART adapter wiring (bring-up build only)

| Adapter pin | Watch pad | Position |
|---|---|---|
| GND | TP15 GND | (20.6, 34.2) |
| RX | TP13 UART_TX (P0.05) | (16.6, 34.2) |
| TX | TP14 UART_RX (P0.08), **optional**: leave it unconnected | (18.6, 34.2) |
| 5 V or 3.3 V supply pin | **never connect** | |

- Terminal settings: **115200 baud, 8 data bits, no parity, 1 stop bit, no flow control** (`bringup.overlay`).
- **The adapter's TX must be 3.3 V logic, or left unconnected.** The watch logic rail is 3.0 V (design value) and the nRF52840 input limit is about the rail plus 0.3 V (a general nRF rule I am quoting from memory, not a design-file fact), so a 5 V TX would damage it. The bring-up firmware only writes logs; I did not find any command input in `bringup.c`, so leaving TX unconnected loses nothing.
- The adapter must not power the watch. Disconnect the UART adapter for Test 13.
- The UART works with no debugger at all, so Tests 8-12 can be run without the DK's five wires on the board.

---

## 1. Visual inspection

**Purpose.** Find assembly faults before power.

**Equipment.** Loupe or microscope; good light; the printed 1:1 outlines `out/pitchiq_watch_revE_1to1_top.pdf` and `_bottom.pdf` (these are announced but are not in `out/` yet as of this revision; print at 100% and check the scale: board 30.6 x 36.0 mm); the pad table above.

**Setup.** Unpowered, no cell, JP1 open, no LCD, no cables.

### 1.1 Polarised and orientation-sensitive parts

Locations come from the board file pad coordinates, not the silkscreen. Compare with the silkscreen and the PDF. `FAB_NOTES_revE.md` still says top-side rotations of U2, U4, D1, D2 and all bottom-side parts are NOT verified, so check every one.

| Part | What to check | Pin 1 / stripe, relative to board features |
|---|---|---|
| U1 Raytac module (T, hand-fitted, centre (15.0, 8.4)) | Antenna end faces the TOP edge (y = 0). All edge pads wetted, no bridges. | The SWD pads of the module are on its right (east) side: SWDCLK pad 53 (19.65, 5.75), SWDIO pad 51 (19.65, 6.55). |
| **U2 nPM1300 QFN32 (T, now rotated 90 degrees, centre (24.6, 25.5))** | Pin-1 dot at the **bottom-left (south-west)** corner. | Pin 1 pad at (22.85, 27.94). Pins run counter-clockwise: east along the BOTTOM row (1-8, y = 27.94, x 22.85 to 26.35), up the RIGHT side (9-16, x = 27.04, y 27.25 to 23.75), west along the TOP row (17-24, y = 23.06, x 26.35 to 22.85), down the LEFT side (25-32, x = 22.16). |
| U4 LIS2DH12 LGA-12 (T, centre (24.5, 6.9)) | Pin-1 mark at top-left; part square and flat. | Pin 1 (SCL) (23.74, 6.15); pin 12 (INT1) (24.25, 6.14); pin 9 (VDD) (25.26, 6.65). |
| D1 1N4148WS (T, (24.0, 14.8)) | Cathode stripe on the west pad (nearer the module). | Pad 1 = cathode = VSYS (22.95, 14.80); pad 2 = MOTOR_N (25.05, 14.80). |
| D2 SMF5.0A (T, (8.0, 13.2), rot 90) | Cathode stripe on the pad FURTHER from the antenna end (south). | Pad 1 = cathode = VBUS (8.0, 14.6); pad 2 = GND (8.0, 11.8). Reversed D2 would clamp VBUS to about 0.7 V. |
| D3 PESD5V0S1BA (T, (27.9, 5.7)) | KiCad pad 1 = cathode; design lists pad 1 as the signal side. | Pad 1 = BTN (26.85, 5.70) west; pad 2 = GND (28.95, 5.70). The exact variant (uni- or bidirectional) was not read in the reviews. |
| D4, D5, D6 (B) | Stripe on the signal-side pad (pad 1; on the bottom this is the pad FURTHER from the antenna end). | D4 pad 1 (4.90, 28.45), pad 2 (4.90, 26.35); D5 pad 1 (4.90, 24.05), pad 2 (4.90, 21.95); D6 pad 1 (4.90, 20.65), pad 2 (4.90, 18.55). |
| Q1, Q2 AO3400A SOT-23 (T) | Two pins on the west side, one alone on the east side. | Q1: pins 1, 2 at x = 23.06 (y 10.15, 12.05), pin 3 (24.94, 11.10). Q2: pins 1, 2 at x = 26.96 (y 11.05, 12.95), pin 3 (28.84, 12.00). Rotation uses a community-table correction (FAB notes). |
| J3 USB-C (B, hand-fitted) | In the left-edge notch, mouth outward; four shell stakes soldered. | Contacts at x = 7.03 (list in 0.4). |
| **J1 Hirose FH12A-10S-0.5SH(55), TOP-contact FPC connector (T, hand-fitted, centre (15.3, 25.4))** | Latch flips freely; no solder under the latch; opening toward the lower board edge (south); 10 pads and 2 side tabs soldered. It must be the "A" (top contact) type. | Pad 1 (GND) at the WEST end (13.05, 23.55); pad 10 (SCLK) at the EAST end (17.55, 23.55); tabs (11.15, 26.80), (19.45, 26.80). |
| SW1 (B) | Square on its pads, plunger toward the right edge. | Centre (28.5, 12.0); pads were trimmed (FAB notes). |
| BT1 pads, JP1 (B) | Clean, no solder; JP1 shows a gap. | BT1 "+" (28.5, 19.5), "-" (28.5, 16.3); JP1 (28.5, 31.25) and (28.5, 29.95). |
| M1 motor pads (T) | **Leave the motor UNFITTED until Test 12** (see below). | + at (2.2, 28.2). |
| Y1 32.768 kHz crystal (T, (11.9, 18.2)) | Not polarised; fillets on both ends. | Required: the firmware waits for it. |
| Capacitors, resistors | No tombstones, none missing. Compare with `docs/BOM.csv`. The five 10 uF parts (C1, C6, C7, C8, C10) are now 25 V parts (BOM). | NOT fitted (DNP): C24, R12, **R21, R22**. Fitted: R11. |
| TP1-TP6, TP8, TP9-TP15 | Bare copper pads only. | Positions in 0.4. |

Why the motor stays off the board until Test 12: the bring-up firmware buzzes the motor 300 ms after a 3 s delay on EVERY boot. A USB-only start with a motor fitted can brown out at that buzz and reboot, which would then repeat (see Test 12). With no motor fitted the buzz is harmless and still logs.

### 1.2 Solder bridges (0.5 mm pitch)

- **U2 (nPM1300)**: all four sides. Highest-risk neighbours: the TOP row (y = 23.06) pins 17 VSET1 (26.35), 18 NTC (25.85), 19 VBAT (25.35), 20 VSYS (24.85), 21 VBUS (24.35), 22 VBUSOUT (23.85), 23 CC1 (23.35), 24 CC2 (22.85); the RIGHT side (x = 27.04) pins 12 3V0, 13 SDA, 14 SCL, 15 BTN, 16 VSET2; the BOTTOM row (y = 27.94) pins 4 VSYS (24.35), 5 SW2 (24.85). A VBUS-to-VSYS or VBAT bridge is a power fault. The ground pad is under the part; its four vias are filled and capped (FAB notes).
- **U4**: LGA, check edges for squeeze-out.
- **J1**: 0.5 mm pitch; look between pads 3-6 (EXTMODE, 3V0, 3V0, DISP).
- **U1**: all edge pads.
- **J3**: contacts 1.0 mm apart (A5/B5 gap 0.30 mm): look for CC1-CC2 and VBUS-CC bridges.
- **TP9-TP15**: 1.0 mm pads at 2.0 mm pitch, 1.0 mm gaps; a blob here would join two nets (VBAT/SDA/SCL...). Keep them clean until used.

### 1.3 The four USB-C shell stakes

Plated slots 0.50 x 1.10 mm in 0.90 x 1.50 mm pads at (1.0, 4.7), (4.0, 4.7), (1.0, 16.3), (4.0, 16.3) (design value). Hand-soldered. Each: solder flowed into the slot, fillet on both faces, shell square and flush to the edge, no solder on the connector's inside (gasket surface).

**Expected (design value).** All parts per BOM, orientation per the table, no bridges.

**SAFE LIMITS.** Unpowered. Do not power a board with any suspected bridge on U2 or J3.

**Pass/fail.** PASS if 1.1-1.3 are all OK. FAIL on any missing, rotated or bridged part.

**Troubleshooting (most likely first).**
1. U1 or J3 crooked or bridged (hand work): reflow with flux, wick.
2. Tombstoned 0402: reheat one end.
3. D1 or D2 reversed (rotations unverified): resolder; recheck with the diode-mode table in Test 2.
4. U2 bridge you cannot see: go to Test 2; a bridge shows as a short between neighbouring rails.

---

## 2. Short-circuit and resistance checks (unpowered)

**Purpose.** Prove no rail is shorted before power, and that the strap resistors that set voltages are right.

**Equipment.** Multimeter (resistance, continuity, diode).

**Setup.** No USB, no cell, JP1 OPEN, no LCD, no programmer or UART wires, no motor. Black probe on a GND point: TP15 (20.6, 34.2) or TP2 (2.4, 24.6) or any capacitor pin 2. The board has a GND plane (In1) and a 3.0 V plane (In4) (FAB notes), so rail-to-GND readings start low and CLIMB for several seconds while capacitors charge. Wait about 10 seconds. Capacitance (design): 3V0 about 22 uF plus chip; VSYS about 20 uF (C7 + C8 + C25; C24 not fitted); VBAT 10 uF; VBUS 1 uF; VBUSOUT 1 uF.

**Rail-to-GND readings** (resistance mode, red on the pad). The thresholds are **bench rules**; the design has no resistor to ground on any of these rails.

| # | Net, probe | OK | STOP if |
|---|---|---|---|
| 1 | VBUS: TP1 (9.5, 7.0) | settles above 100 kohm | below 1 kohm |
| 2 | VSYS: TP8 (20.5, 7.0) | above 100 kohm | below 1 kohm |
| 3 | VBAT: TP9 (8.6, 34.2) | above 100 kohm (JP1 open, no cell) | below 1 kohm |
| 4 | 3V0: C1 pin 1 (19.42, 17.80) | above 50 kohm | below 500 ohm |
| 5 | VBUSOUT: C5 pin 1 (22.90, 20.38) | above 100 kohm | below 1 kohm |
| 6 | SW2 (buck node): L2 pin 1 (25.80, 29.74) | same as line 4 (through L2, DCR 150 mohm typ) | below 500 ohm |
| 7 | BATP: battery "+" pad (28.5, 19.5) (B) | OL (JP1 open: isolated) | below 1 Mohm |
| 8 | LCD_EXTMODE: J1 pad 3 (14.05, 23.55) | same as line 4 (R11 is 0 ohm to 3V0) | below 500 ohm |

**Cross pairs.** Expected OPEN (above 100 kohm after settling, bench rule); a beep or below 1 kohm is a STOP.

| # | Pair | Probe points |
|---|---|---|
| 9 | VBUS to VSYS | TP1 and TP8 |
| 10 | VBUS to 3V0 | TP1 and C1 pin 1 |
| 11 | VSYS to 3V0 | TP8 and C1 pin 1 |
| 12 | VSYS to VBAT | TP8 and TP9 |
| 13 | VBAT to 3V0 | TP9 and C1 pin 1 |
| 14 | VBUS to CC1, to CC2 | TP1 to J3 A5 (7.03, 11.00) and B5 (7.03, 10.00) |
| 15 | CC1 to CC2 | A5 to B5 |
| 16 | SDA to SCL | TP10 (10.6, 34.2) and TP11 (12.6, 34.2) |
| 17 | SWDIO pad to SWDCLK pad | TP3 and TP4 |
| 18 | JP1 pad A to pad B | (28.5, 31.25) and (28.5, 29.95): must be OPEN |
| 19 | UART_TX to UART_RX | TP13 and TP14 |
| 20 | Any test pad TP9-TP14 to its neighbour | adjacent pads at 2.0 mm pitch |
| 21 | USB-C shell stake S1 (4.0, 16.3) to GND | expected: beep, below 1 ohm (shell tied to GND, design) |

**Strap and fixed resistors** (single resistors measured across their own pads; chips add small parallel paths, allow +/-5%; the resistors are 1% parts except R13 at 5%):

| Resistor | Between | Design value | Accept |
|---|---|---|---|
| R2 | VSET2 (R2 pin 1 (28.70, 22.41)) and GND (pin 2 (28.70, 21.39)) | 150 kohm, sets BUCK2 = 3.0 V (VSET table, `design.py`) | 142 to 158 kohm |
| R1 | VSET1 (R1 pin 1 (28.20, 20.41)) and GND (pin 2 (28.20, 19.39)) | 0 ohm: BUCK1 off | below 1 ohm; "do not leave VSET floating" (`p1_electrical_reference.md`) |
| R11 | 3V0 (4.89, 34.60) to EXTMODE (5.91, 34.60) | 0 ohm | below 1 ohm |
| R16 | 3V0 (14.89, 18.00) to NRESET (15.91, 18.00) | 10 kohm | 9.5 to 10.5 kohm |
| R3, R4 | 3V0 to SDA / SCL: R3 (11.49 to 12.51, 31.20), R4 (13.49 to 14.51, 31.20) | 4.7 kohm each | 4.4 to 4.8 kohm |
| R17, R18, R19 | SWDIO / SWDCLK / NRESET: TP3 to U1 pad 51 (19.65, 6.55); TP4 to U1 pad 53 (19.65, 5.75); TP5 to R16 pin 2 | 100 ohm each | 95 to 105 ohm |
| R20 | TP6 (2.4, 29.8) to C1 pin 1 (19.42, 17.80) | 1 kohm | 0.95 to 1.05 kohm |
| RT1 NTC | RT1 pin 1 (28.90, 31.51) to GND (pin 2 (28.90, 30.49)) | 10 kohm at 25 degC, B = 3380. Calculated from B: about 12.1 kohm at 20 degC, 8.3 kohm at 30 degC. Tolerance not given. | within 20% of the calculated value |
| R9 | DISP (18.99, 31.20) to GND (20.01, 31.20) | 1 Mohm | 0.9 to 1.1 Mohm (slow: C21 charges) |
| R10 | CS (16.99, 31.20) to GND (18.01, 31.20) | 100 kohm | 90 to 110 kohm |
| R15 | VIB (Q1 pin 1 (23.06, 10.15)) to GND | 100 kohm | 90 to 110 kohm |
| R21, R22 | NOT fitted | the pads must read open: CC1 pad (21.30, 20.41) to GND pad (21.30, 19.39); CC2 pad (20.20, 20.46) to (20.20, 19.44) | a 5.1 kohm reading here means someone fitted them |

**Diode mode** (red = positive; a good silicon junction reads about 0.4-0.8 V forward and OL reversed; those junction numbers are general behaviour, not from the design files):

| Check | Red | Black | Expect |
|---|---|---|---|
| D2 (cathode VBUS, anode GND) | GND | TP1 VBUS | a diode drop |
| D2 reversed direction | TP1 VBUS | GND | OL. Below 1 V = D2 reversed or VBUS shorted: STOP |
| Q1 body diode (source GND, drain MOTOR_N) | GND | M1 pad 2 (4.2, 28.2) | a diode drop |
| D1 (cathode VSYS, anode MOTOR_N) | M1 pad 2 | TP8 | a diode drop if nothing else conducts; OL is not a stop (the VSYS node also goes to chip pins I cannot predict) |
| Chip pins, D3-D6 | any | any | **not justified**; use only to catch a dead 0.000 V short |

**CC pins, unpowered.** The nPM1300 has its own 5.1 kohm pull-down (Rd) on CC1/CC2 (PS Table 9). Whether it is present with the chip completely unpowered is **not stated by Nordic**. Measure J3 A5 (7.03, 11.00) to GND and B5 (7.03, 10.00) to GND:
- about 5.1 kohm (4.6 to 5.6 kohm; that range is the USB Type-C Rd range quoted from memory in the review, so soft): Rd present unpowered.
- OL: Rd absent unpowered. A USB-C to USB-C charger will not put 5 V on a dead board. Use the A-to-C cable, TP1, or the **fallback resistors R21 and R22** (below).
- about 2.55 kohm: R21/R22 are fitted in addition to the chip's Rd (see below).

**The R21 / R22 fallback (added in rev E, not fitted).** Two 5.1 kohm resistors from CC1 and CC2 to GND. Fit them only if Test 3B shows a flat watch will not start on a C-to-C charger. Once the chip is powered, its own Rd is in parallel, so the source sees about 2.55 kohm per pin, which is outside the USB Type-C sink range (the earlier design review's reasoning, `design.py` note). So the fallback may make a powered watch misbehave on some chargers. Record it as an experiment: fit one at a time, retest both a flat and a running watch, and ask before keeping them.

**SAFE LIMITS.** Unpowered; none. Do not go on with any STOP.

**Pass/fail.** PASS if lines 1-21 are not shorts and every strap resistor is in its window and JP1 reads open.

**Troubleshooting (most likely first).**
1. Rail reads low and climbs: capacitors charging. Wait.
2. Rail to GND under 500 ohm: bridged fine-pitch pin (U2 first) or a flipped capacitor. Measure from the rail pad toward each capacitor on that rail (VSYS: C7 (25.15, 20.12), C8 (22.10, 29.38), C25; 3V0: C1, C2, C10, C11, C13, C26, C22, C23); the lowest resistance is closest to the fault.
3. VSET2 not 150 kohm: R2 wrong or missing.
4. VBUS-VSYS beep: bridge at U2 pins 20-21 (24.85 and 24.35, y = 23.06) or a solder ball under U2.
5. CC1-CC2 beep: bridge at J3.
6. Adjacent test pads beep: a solder smear from handling; clean with wick and flux.

---

## 3. USB-C input verification (first power, no battery)

**Purpose.** First 5 V, hard current limit; confirm no fault current and USB-C detection in both orientations.

**Equipment.** Bench supply (essential) or USB meter with the USB-A fallback; multimeter; USB-C cables.

**Setup.** No battery, JP1 open, no LCD, no motor, no programmer or UART wires (first power with nothing attached). Meter on the 200 mA range in the + lead, or the bench supply display.

### 3A. Direct power through TP1 (bypasses the connector and CC; do this first)

1. Supply at 0 V, current limit **20 mA** (bench rule).
2. Supply GND to TP2 (2.4, 24.6) or TP15 (20.6, 34.2); supply + to TP1 (9.5, 7.0). Use clips.
3. Raise to 5.0 V over about 5 seconds, watching the current. Note the current at 5.0 V. Raise the limit to **100 mA** (bench rule; the chip's own default input limit is 100 mA, `p1_electrical_reference.md`) and note any change.
4. Measure VSYS (TP8) and 3V0 (C1 pin 1) (Test 4).

**Expected (design values).** VBUS = source; the chip's window is 4.0-5.5 V (VBUSOVP 5.5 V). The chip passes VBUS to VSYS unregulated and starts BUCK2 when VSYS is 2.7 V or more. Input current with a blank module: **not given**. With firmware running: about 3-6 mA from VSYS while the MCU boots and advertises (audit estimate, `audit_electrical_power_firmware.md` line 105, not measured). The bring-up build adds UART and I2C polling to that (not quantified in the files). Cold start from VBUS only with no battery has documented problems (Nordic DevZone threads, `p1_electrical_reference.md` item 2); C24 is NOT fitted for that reason.

**SAFE LIMITS (STOP):** current at the limit and not falling after 2 s; any part hot; smell/smoke; VBUS sagging below 4.0 V with the supply in current limit; VSYS above 5.5 V; 3V0 above 3.3 V (the Sharp panel's abs max is 3.6 V).

**Pass/fail.** PASS: not in current limit at 5.0 V; steady current below 30 mA (bench rule); VSYS and 3V0 come up (Test 4).

### 3B. Through the USB-C connector, both orientations

1. A-to-C cable into a known-good 5 V source (through the USB meter if you have one). Read volts and current. Unplug, rotate the plug 180 degrees, plug again, read again.
2. C-to-C cable with a 5 V USB-C charger. Only expect a result if Test 2's CC check read about 5.1 kohm; if it read OL, "nothing happens" is the answer (see the R21/R22 fallback in Test 2).
3. Each orientation: VBUS (TP1), VSYS (TP8), 3V0 (C1 pin 1), and the CC pin voltages (J3 A5 and B5 to GND, plugged in). Only the active-orientation CC carries the source's level; the other carries the chip's Rd (about 0 V).

**Expected (design values).** VBUS about 5 V. The chip's CC thresholds (Table 9): 0.2 V connected, 0.66 V 1.5 A source, 1.23 V 3 A source. The firmware raises the input limit from 100 mA to 500 mA only if it sees a 1.5 A or 3 A source; otherwise it stays at 100 mA; the limit returns to 100 mA at each re-plug. Input current with firmware, no battery: 3-6 mA (estimate); accept 2 to 15 mA, wide (bench rule). While charging a cell: about 84 mA = 74 mA + about 10 mA system (audit estimate).

**SAFE LIMITS (STOP):** source protection trips or the charger gets hot; input current above 100 mA with no battery; VBUS above 5.5 V (a 9 V or 12 V charger would overload D2: 5 V chargers only); smell.

**Pass/fail.** PASS: both orientations give the same VBUS, rails and a stable current in the window. Works only one way = FAIL (CC or contact fault at J3).

**Troubleshooting (most likely first).**
1. C-to-C does nothing but 3A works: internal Rd absent when unpowered. Use the A-to-C cable, or try the R21/R22 fallback (Test 2). Record it: a dead-cell watch cannot be charged on a C-to-C charger without a hardware change.
2. Supply in current limit at 5 V: back to Test 2; look for the hot part by touch or IR after 2 s at 20 mA.
3. VSYS stuck near 2.5 V, 3V0 never rises: the documented cold-start problem. Confirm C24 is not fitted; try exactly the 100 mA limit; try 4.5 V and 5.2 V; stop and ask.
4. 3V0 not near 3.0 V: R2 / VSET2.
5. Works only after re-plug: contact bounce, re-solder J3.

---

## 4. Power rail measurements

**Purpose.** Record the rails with design values, USB power, no battery.

**Equipment.** Multimeter; optional scope.

**Setup.** Test 3 passed. Black probe on TP15 or TP2.

| Rail | Probe | Design value | Accept | Notes |
|---|---|---|---|---|
| VBUS | TP1 (9.5, 7.0) | source voltage, about 5.0 V | 4.0 to 5.5 V | |
| VSYS | TP8 (20.5, 7.0) or C7 pin 1 (25.15, 20.12) | unregulated: about VBUS (PS s.6.1.1) | drop not given. Bench rule: within 0.5 V below VBUS, never above 5.5 V | |
| 3V0 | C1 pin 1 (19.42, 17.80) or TP6 (through 1 kohm) | **3.0 V** | 2.85 to 3.15 V (+/-5%, review figure; the VSET resistor is a 5% max tolerance) | Firmware only confirms it. |
| VBAT | TP9 (8.6, 34.2) | no cell: not given | not a short | |
| VBUSOUT | C5 pin 1 (22.90, 20.38) | not given | not a short | |
| SW2 | L2 pin 1 (25.80, 29.74) | not given | scope only | |

**Ripple (optional, scope).** Probe C1 pin 1 with a spring ground on C1 pin 2 (20.97, 17.80), 20 MHz limit. Spec: **not given** (only a 4 uF minimum output capacitance). Bench rule: record; investigate above 100 mV peak to peak; ask above 300 mV.

**SAFE LIMITS.** 3V0 above 3.3 V or VSYS above 5.5 V: power off.

**Pass/fail.** PASS if VBUS, VSYS, 3V0 are in the window and stable for 60 s.

**Troubleshooting (most likely first).**
1. 3V0 = 0 V, VSYS fine: BUCK2 not starting. Check R2, L2 (soldered both ends; SW2 pin 5 at (24.85, 27.94)), C10 (25.03, 33.50), C8, VSET2 at U2 pin 16 (27.04, 23.75).
2. 3V0 about 1.8 V or other: wrong VSET2 resistor.
3. 3V0 right but sags at module start: look for a short on the 3V0 side (module, U4, J1 solder).
4. VSYS low, VBUS fine: power-path bridge at U2.
5. VBUS drops when connected: supply cannot hold the 100 mA limit.

---

## 5. Battery connection and charging

**Purpose.** Connect the cell safely; prove charging starts, runs at the designed current, ends at the designed voltage, and the cell stays cool.

**Equipment.** Multimeter (volts, 200 mA); USB meter (nice); tile, bag, sand; iron; Kapton; clock; the **bring-up build** with the UART adapter or the DK; IR thermometer (nice).

**Setup.** Tests 1-4 passed and the bring-up firmware is flashed (Tests 6-8) so that the charger code runs. JP1 OPEN. A cell that has not been shorted or damaged.

### 5.1 Polarity check before soldering

1. With the cell lead ends bare and apart, measure across them. **Design value: 3.0 to 4.2 V**; a normal pack reads about 3.7-4.0 V. Record it. A reading near 0 V: STOP and ask.
2. Confirm the lead you labelled "+" reads positive with the red probe. Mark it with red tape.
3. Board pads (design, `design.py` BT1): "+" at (28.5, 19.5) (net BATP, goes to JP1 pad A); "-" at (28.5, 16.3) (GND). The bottom silkscreen is meant to carry "+" and "-" beside the pads (not seen by me). Verify with the meter: the "-" pad beeps to GND; the "+" pad is OPEN to GND (JP1 open, no cell).
4. JP1 still open: solder "-" first, then "+". Tape the cell flat on the tile.
5. Meter: "+" pad to GND = the cell voltage from step 1 (within 0.05 V, bench rule); **VBAT at TP9 (8.6, 34.2) or C6 pin 1 (26.85, 20.12) = 0 V** (JP1 open); JP1 A to B still OPEN.

### 5.2 Connect with JP1

6. Bridge JP1 (pads (28.5, 31.25) and (28.5, 29.95), 1.3 mm apart) with a drop of solder. (Or leave it open and use the meter as ammeter: 5.4.)
7. Read VBAT at TP9: the cell voltage. Whether the chip leaves ship mode when a cell is first connected is **not stated in the files**. If 3V0 stays 0 V with only the cell, hold the side button 1 s (wake time 1008 ms, design value `pitchiq_watch.dts`).
8. Plug in USB (A-to-C first). Charging does not start by itself: the chip comes up with charging OFF, 32 mA, 100 mA input limit; the firmware enables it. Watch the UART log.

### 5.3 Charge settings (design values, `pitchiq_watch.dts`, `power.c`, README)

| Item | Value |
|---|---|
| Charge current | 75 mA asked; 2 mA steps, so 74 mA (audit line 106). The bring-up PMIC line prints `iset .. mA (idx ..)`: expect 74 mA, idx 37 (my reading of `ISET_IDX`: 16 + (75000-32000)/2000 = 37; verify against the first log) |
| Termination voltage | 4.20 V (4.00 V in the warm range) |
| Termination current | chip default 10% of charge current, about 7.4 mA (not set by firmware) |
| Trickle | 10% of ICHG = 7.4 mA below 2.9 V (PS default) |
| Flat-cell rescue | firmware writes BCHGVBATLOWCHARGE = 1 so a cell below 2.1 V still charges |
| Rev E change | the charger is now disabled (BCHGENABLECLR) before the current register is written, then enabled |
| Input limit | 100 mA default; 500 mA only for a detected 1.5 A / 3 A source |
| Temperature stop | above 45 degC (NTC code 337); the default build reads no battery temperature for logging |
| Estimated time | about 2.5 h (1.5 h constant current + 1 h taper); about 4 h at 0-10 degC (`power_budget.md`, estimate) |

### 5.4 How to confirm charging

- **Bring-up log, every 5 s:** `PMIC vbus %d chg_stat 0x%02x chg_err 0x%02x vbus_stat 0x%02x vbat %u mV iset %u mA (idx %u) rc %d/%d`. Expect `vbus 1` with USB, `iset 74 mA`, `chg_err 0x00`, `rc 0/0`, `vbat` rising. **What each `chg_stat` value means is not given** in the files (the README lists the charger status bit meanings as an ASSUMPTION): record the values you see before and during charging and compare them with the PS register table. A nonzero `rc` means an I2C read failed.
- The normal log line once a minute, `battery <mV> mV <pct> % charging vbus`, is still printed. Charger errors print `charger error 0x..: cleared and re-enabled (try n of 5)` and `charging left off until the cable is re-plugged`.
- **Meter:** VBAT at TP9 rises and settles at or just below 4.20 V at the end (terminal voltage reads higher than open-circuit while charging). USB-meter input current about 84 mA while charging, then a few mA.
- **Ammeter at JP1:** leave JP1 OPEN; meter on 200 mA, red on JP1 pad B (VBAT, (28.5, 29.95)), black on pad A (BATP, (28.5, 31.25)). Expect about 74 mA. Meter burden lowers the cell voltage a few tenths of a volt: fine for a check.
- No charge LED exists (LED0-LED2 not connected).

### 5.5 Flat cell

Design intent (not tested): firmware allows charging below 2.1 V and charges at 7.4 mA until 2.9 V, then 74 mA. **Do not try it on the first board.** The reviews ask for it but give no safe method of making a protected cell go flat. If you must test it later, a current-limited 2.5 V bench supply on JP1 pad B instead of a real flat cell is far safer (my suggestion). If your cell is below 3.0 V at the start of 5.1, expect a long charge and do not leave it.

### 5.6 Temperature and time limit

- Touch or IR the cell and the area around U2 (24.6, 25.5) every 10 minutes. Bench rule: warm is fine up to about 40 degC; too hot to hold 3 s = STOP. Firmware cut-off: 45 degC (design).
- **First supervised charge time limit: 3.5 hours (bench rule)** (2.5 h estimate + 1 h). If VBAT is not near 4.1 V and input current not below about 20 mA by then, STOP and ask.

**SAFE LIMITS (STOP; unplug USB; open JP1 or lift the "+" lead):** cell above 4.25 V (bench margin over 4.20 V); charge current above 100 mA (design 74); cell or U2 too hot; swelling, hissing, smell; VBAT collapsing once current flows; more than 3.5 h; any short.

**Pass/fail.** PASS: iset 74 mA and measured charge current 60-90 mA (bench rule); terminates at 4.15-4.22 V; cell temperature normal; done inside 3.5 h.

**Troubleshooting (most likely first).**
1. No charging, `PMIC` lines show `iset` not 74 or `rc` nonzero: I2C (U2 pins 13/14 at (27.04, 25.25) and (27.04, 24.75); R3/R4; check SDA and SCL at TP10/TP11 idle at 3.0 V).
2. `chg_err` nonzero: NTC. Check RT1 (10 kohm at 25 degC, Test 2); a missing RT1 reads as hot/cold and blocks charging.
3. Current well below 74 mA (about 7 mA): trickle phase (cell below 2.9 V), or the 100 mA input limit is eaten by system load; check VSYS.
4. Current 32 mA flat: chip default; firmware did not write ICHG.
5. VBAT never rises: JP1 not bridged, cold joint, or charging disabled.
6. After re-plug the limit returns to 100 mA: normal.

---

## 6. SWD connectivity (nRF52840-DK to the five pads)

**Purpose.** The debug link for flashing, recovery and (optionally) RTT logs.

**Equipment.** nRF52840-DK, 5 fine wires or a pogo jig, USB cable for the DK, nRF Command Line Tools or `nrfutil device`, SEGGER J-Link software.

**Setup.** Watch powered from USB (3V0 present; the DK reads target voltage). Wire with the watch unplugged, GND first, then VTG, then signals; then plug in USB. If you only need logs (not flashing), the UART in 0.5 is enough and no SWD wires are needed.

### 6.1 Wiring

The DK's 10-pin "Debug out" header (P20) uses the standard ARM Cortex 10-pin order. **That pin order is NOT in the design files; it is from Nordic's DK documentation as I know it. Check it against the DK silkscreen and user guide first.**

| DK debug-out pin | Signal | Watch pad | Position (B) | Name on board |
|---|---|---|---|---|
| 1 | VTG (target voltage sense) | TP6 | (2.4, 29.8) | 3V0 reference through R20 = 1 kohm; sense only, never a supply |
| 2 | SWDIO | TP3 | (2.4, 27.2) | SWDIO (R17 100 ohm + D4) |
| 3 (or 5) | GND | TP2 | (2.4, 24.6) | GND, the MIDDLE pad |
| 4 | SWDCLK | TP4 | (2.4, 22.0) | SWDCLK (R18 100 ohm + D5) |
| 10 | nRESET | TP5 | (2.4, 19.4) | nRESET (R19 100 ohm + D6) |
| 6, 7, 8, 9 | not connected | none | none | SWO is not connected on the module |

Order along the USB-C edge from the antenna end downward: nRESET, SWDCLK, GND, SWDIO, 3V0, pitch 2.6 mm.

nRESET now works as a reset pin: `gpio-as-nreset` is in the board devicetree (README Rev E changes; module pad 40 / P0.18, 10 kohm pull-up R16). I have not verified that it resets a real chip.

### 6.2 Detect the chip

Standard Nordic and SEGGER commands, **not in the firmware README and never run**:
```
nrfjprog --deviceversion
JLinkExe -device NRF52840_xxAA -if SWD -speed 1000 -autoconnect 1    (then: connect)
```
- Start at **1000 kHz** (clamps and series resistors were described as fine for 1 MHz). `board.cmake` asks for 4000 kHz; if `west flash` is flaky, lower it.
- Good: the tool names an nRF52840. **Protected chip:** `nrfjprog` stops with a readback-protection message (wording from Nordic's tools, not the files) and tells you to use `--recover`. **Recover ERASES THE WHOLE CHIP: bootloader, app, bonds, keys.** Then reflash both images (Test 7). The default build does not lock the chip; the production build does.

**SAFE LIMITS.** Wire GND, then VTG, then signals. If VTG measures above 3.3 V at the DK, disconnect.

**Pass/fail.** PASS: an nRF52840 is identified.

**Troubleshooting (most likely first).**
1. No device with a powered watch: SWDIO/SWDCLK swapped, GND missing, cold joint, VTG missing. Continuity: TP3 to U1 pad 51 (19.65, 6.55) = 100 ohm; TP4 to pad 53 (19.65, 5.75) = 100 ohm.
2. 3V0 absent at TP6: fix Tests 3-4.
3. Works at 1000 kHz not 4000: keep the lower speed.
4. Connects then drops: 3V0 sagging or crystal start-up.
5. Protected: recover as above.
6. Module solder on pads 51 and 53: reflow.

---

## 7. Firmware flashing (MCUboot + app), bring-up build

**Purpose.** Load the bootloader and the signed bring-up application.

**Equipment.** The Test 6 setup; `/home/claude/zws` (Zephyr v4.4.2), `west`.

**Build the bring-up variant** (README Rev E changes; compiles, never run; I did not check that the output folder already exists):
```
export ZEPHYR_TOOLCHAIN_VARIANT=gnuarmemb GNUARMEMB_TOOLCHAIN_PATH=/usr
cd /home/claude/zws
west build -p always -b pitchiq_watch --sysbuild -d build_bringup \
    /home/claude/pitchiq-watch/watch/firmware/app -- \
    -DBOARD_ROOT=/home/claude/pitchiq-watch/watch/firmware \
    -DEXTRA_CONF_FILE=bringup.conf -DEXTRA_DTC_OVERLAY_FILE=bringup.overlay
```
**Flash** (README commands, adapted to the bring-up folder; "the flash commands were not run"):
```
west flash -d build_bringup --runner jlink
```
Module read-protected: `nrfutil device recover`, then `west flash -d build_bringup --runner nrfutil`. CMSIS-DAP: `--runner pyocd`.

**Expected output.** Not recorded anywhere. By design: two programming passes, MCUboot first (`0x00000`, 48 kB partition), then the signed app into slot 0 (`0x0c000`, 480 kB). Each ends with verify; exit 0. Layout: slot 1 `0x84000` (480 kB), storage `0xfc000` (16 kB, bonds). It is the **unlocked** build (debug signing key, debug port open); do not flash the production build (`prod.conf`) on the first boards.

**For Test 13 later** reflash the NORMAL build (`west build ... -d build_pitchiq` without the two EXTRA files, README Build section).

**SAFE LIMITS.** Do not interrupt a flash. Power from USB, not from the cell alone.

**Pass/fail.** PASS: both images programmed and verified, exit 0.

**Troubleshooting (most likely first).**
1. Cannot connect: Test 6.
2. Verify failure: lower the speed, shorten wires.
3. Write errors: APPROTECT; recover.
4. Build or hex missing: run the build command.
5. `imgtool` complains about `cbor2`: `pip install cbor2`.

---

## 8. MCU boot: what proves the firmware runs

**Purpose.** Prove the application runs, not only the bootloader, and that the chips it depends on answer.

**Equipment.** USB-UART adapter and terminal (115200 8N1) wired as in 0.5 (before the display is fitted); the DK/RTT is the alternative once the display covers TP13-TP15.

**Setup.** Watch on USB (5.0 V, 100 mA limit), bring-up build flashed, motor NOT fitted, UART adapter on TP13/TP15, terminal open. Reset by unplugging and replugging USB, or with the DK nRESET.

**Log channels.** The bring-up build logs on the UART (TP13) AND on RTT (through the SWD pads). The normal build has RTT only. Logs are not stored: open the terminal before reset.

**Expected lines (from `bringup.c`, `app_glue.c`, `main.c`; none has ever been seen on hardware):**

1. `PitchIQ watch firmware starting` and the reset cause line from `main.c`.
2. **`BOOT fw <version> reset 0x<RESETREAS> <text> confirmed <0 or 1>`** (bring-up line). The reset cause comes from Zephyr's `hwinfo`; MCUboot may already have cleared RESETREAS (README: unchecked), so a zero is not a fault. What `confirmed 0/1` means in MCUboot terms I did not verify: record it.
3. `watchdog armed: 8000 ms`.
4. `LCD init ok` or `LCD init failed`. With no panel fitted yet, record what appears: whether it can say "ok" without a panel is not stated (the SPI driver does not need the panel to answer; I did not check).
5. **`ACCEL WHO_AM_I 0x33 at I2C 0x19 rc 0 (expect 0x33 at 0x19) OK`** (or `MISMATCH`).
6. `PMIC vbus 1 chg_stat .. chg_err .. vbus_stat .. vbat .. mV iset .. mA (idx ..) rc 0/0` every 5 s.
7. `ACCEL mg x .. y .. z ..` every 1 s.
8. About 3 s after boot: `boot buzz`, `buzz 300 ms` (nothing physical without the motor).
9. `advertising as "PitchIQ XXXX", fast`.
10. About 15 s after boot: `image confirmed: 0`. It needs the PMIC and accelerometer identity checks and advertising running (`app_glue.c`); a failure prints `board identity check failed: image NOT confirmed`.

**Bootloader-only versus app running:**

| Symptom | Meaning |
|---|---|
| UART shows 1-10 | App running. |
| No UART and no RTT output; nothing in nRF Connect | Bootloader only or nothing running. MCUboot is silent when healthy (no UART, warning-level logs). |
| Log stops after line 1 | App froze, or the kernel is waiting for the 32.768 kHz crystal (README rev C changes: "blocks if it never starts"). |
| `PitchIQ watch firmware starting` repeats about every 8 s | Watchdog reset loop; read the reset cause. |
| `previous run ended in a fatal error ... (halt at 3)` | Fatal-error guard: after 3 in a row the firmware parks until power-cycled. |
| Garbled characters on the UART | Wrong baud rate, or the adapter is at a different logic level. |
| UART silent but RTT works | UART wiring: adapter RX must go to TP13 (UART_TX), not TX to TX. |

**SAFE LIMITS.** As Test 3: input current below 30 mA (bench rule), 3V0 in 2.85-3.15 V.

**Pass/fail.** PASS: lines 1-3, 5, 6, 7, 9 and 10 appear; `ACCEL ... OK`.

**Troubleshooting (most likely first).**
1. No UART output: swap-check wiring (0.5), adapter set to 3.3 V, correct port and 115200; confirm with RTT that the app runs at all.
2. Log stops after line 1: Y1 and its 18 pF capacitors; reflow Y1 (11.9, 18.2). The crystal nodes have no test pad.
3. `PMIC ... rc` nonzero or `power_init failed`: I2C: R3/R4, SDA/SCL (TP10/TP11 idle 3.0 V), U2 pins 13/14, address 0x6b.
4. `image NOT confirmed`: if PMIC lines are fine, Test 11.
5. Reset loop with a watchdog reset cause: a stuck I2C bus (SDA or SCL held low at TP10/TP11).

---

## 9. Display operation

**Purpose.** Prove the Sharp LS013B7DH03 memory LCD shows a picture and EXTCOMIN runs at 60 Hz.

**Equipment.** The LCD (in its bag); multimeter; scope, logic analyser or a meter with a Hz mode (nice).

**Setup.** Tests 1-8 done. J1 is a hand-fitted Hirose FH12A (top contact, 0.5 mm, 10 pins), centre (15.3, 25.4).

### 9.1 Before the panel: check EXTCOMIN and DISP with no display fitted

TP12 is the EXTCOMIN pad, (14.6, 34.2), on the top side under where the display tail goes. With the bring-up build running and the panel NOT fitted:
- EXTCOMIN at TP12 (red probe, black on TP15): **design value 60 Hz** (`extcomin-frequency = <60>`; the panel needs 54 to 65 Hz per the dts comment), 3.0 V amplitude, toggled by the driver thread. A DC meter reads between 0 and 3.0 V (duty not stated; about 1.5 V if 50%); a meter with a Hz mode should read about 60 Hz (accept 54-65 Hz).
- J1 pads (red on the pad, black on GND): pads 4 and 5 (VDD, VDDA) (14.55 and 15.05, 23.55) = 3.0 V; pad 3 EXTMODE (14.05, 23.55) = 3.0 V (R11); pad 8 CS (16.55, 23.55) = 0 V idle (R10); pad 6 DISP (15.55, 23.55) = 3.0 V once the firmware has started the display (the first picture is drawn first and DISP raised afterwards, `ui.c`), 0 V before; pads 1-2 = 0 V.

Then power off, and fit the panel.

### 9.2 Seating the panel

1. Power off. Flip the J1 latch up. Slide the FPC tail in with the gold fingers facing UP, square, until it stops; push the latch down evenly. A half-pitch shift connects the wrong signals.
2. The tail folds 180 degrees backward under the glass so that the contact face looks up (design reasoning, `p1_display_connector.md`). Sharp terminal 1 (SCLK) should end at the EAST end (J1 pad 10 (17.55, 23.55)); the board's pad 1 (GND, Sharp terminal 10) is at the WEST end because J1 pad n carries Sharp terminal 11 - n. If the fingers face DOWN or the tail would have to enter from the wrong side, it will not seat: do not force it.
3. The audit (`audit_electrical_power_firmware.md`, lines 59-63) says: do not rely on the panel until a power-off continuity check with it seated; J1 pads 1 and 2 are the ground pads (they beep to TP2 in the netlist). Also check 3V0 to GND (Test 2 line 4) did not drop below its earlier value (bench rule: stay above 50 kohm).
4. The connector geometry is **unproven**: the review rates contact side and pin-1 end at 85-90%; no built board uses this fold.

### 9.3 Power and what you should see

1. Power from USB. The log line **`LCD init ok`** should appear. The picture is the idle screen drawn by `ui_render` (README: layouts were rendered for "NO LINK", "no key" and the pairing screen); the exact look is not recorded. The panel is reflective: view it in good light; 128 x 128, black on a light background.
2. With the panel fitted, TP12 is covered. EXTCOMIN is still reachable at the module pad 44 (19.65, 9.75). Alternatively use RTT instead of the UART, because TP13-TP15 are also covered.
3. EXTMODE is strapped high: the panel inverts its common voltage from the EXTCOMIN pin. If EXTCOMIN stops the picture fades over time (general memory-LCD behaviour; not in the files).

### 9.4 Symptoms

| Symptom | Likely cause |
|---|---|
| Blank, but everything else works and the J1 pad voltages are right | **No contact**: tail not fully in, latch up, or fingers facing down (the wrong side for this top-contact connector). Reseat. |
| Blank and 3V0 low or a boot problem | Short or damaged panel. |
| Mirrored, upside-down, all black/white | Tail rotated or inserted reversed. The audit: an inverted connection gives "no picture for certain; damage possible but not expected". Power off at once if the board or panel warms. |
| No picture, EXTCOMIN toggles, DISP 3.0 V | Data not arriving: probe J1 pads 10, 9, 8 (SCLK (17.55, 23.55), MOSI (17.05, 23.55), CS (16.55, 23.55)) during a screen update; J1 solder; module pads 37, 39, 41 (LCD_SCK (19.65, 12.95), LCD_MOSI (19.65, 12.15), LCD_CS (19.65, 11.35)). |
| Faint picture that fades | EXTCOMIN missing. |
| `LCD init failed` in the log | Driver/SPI start-up failure; check the log line before it. |
| Wrong contact side | A bottom-contact part (plain FH12) cannot touch a tail whose fingers face up: nothing on screen, no short. The BOM calls for FH12A. |

**SAFE LIMITS.** 3V0 above 3.3 V (panel abs max 3.6 V); panel or tail warm; do not bend the FPC backward toward the polarizer; min inner radius 0.45 mm; at most 3 bends (Sharp, `p1_display_connector.md`).

**Pass/fail.** PASS: readable stable picture, `LCD init ok`, EXTCOMIN 54-65 Hz.

**Troubleshooting (most likely first).** The symptom table, in order: contact, tail orientation, latch, J1 0.5 mm bridges, module pads, EXTCOMIN, panel.

---

## 10. BLE advertising and connection

**Purpose.** Prove the radio, name, advertising schedule and passkey pairing.

**Equipment.** Phone with nRF Connect; the UART terminal (or RTT). The passkey is now also logged, so the display is no longer required for pairing.

**Setup.** Firmware running (Test 8), phone 0.5-1 m away.

**Expected (design values, firmware).**
- Name: **"PitchIQ" + space + the last 4 hex digits of the address** (e.g. `PitchIQ A1B2`); compile-time name `CONFIG_BT_DEVICE_NAME="PitchIQ"`. PitchIQ service UUIDs begin `7a1d0002` (RX) and `7a1d0003` (TX); service UUID in the scan response; Battery Service and mcumgr SMP service also exposed.
- Schedule: **fast = 100 to 150 ms for 30 s after every start; then slow = 1.0 to 1.2 s** (`ble_pq.c`, constants `BT_GAP_ADV_FAST_INT_MIN_2/MAX_2` = 100/150 ms, `SLOW_INT` 1000/1200 ms). Restarts fast after each disconnect and reset. Log: `advertising as "PitchIQ XXXX", fast` then `..., slow`.
- Security: LE Secure Connections only, bondable, passkey display-only. **Bring-up build: the line `PASSKEY %06u` is logged when pairing asks**, and the passkey is also drawn on the screen if the display is fitted. New random number each pairing.
- Connection: 20 ms interval requested, 6 s supervision timeout; the phone may refuse. Connection RSSI is logged every 10 s; TX power +8 dBm.
- With a bond, only the bonded phone connects. Hold the button 5 s to forget it (log `button held: forgetting the pairing`).

**Actions.**
1. nRF Connect, SCAN. Find `PitchIQ XXXX`. Within 30 s of a reset: interval about 100-150 ms. After 30 s: about 1.0-1.2 s. Record RSSI.
2. Connect and bond. The log prints `PASSKEY nnnnnn`; type it into the phone. Pairing succeeds. Reset the watch and reconnect: the bond must survive (the README lists "pair, reset, bond count must be 1" as still to do).
3. Read Battery Level; it should match the `battery .. %` log line.
4. **RSSI sanity check (bare board, not a range claim):** same phone, same spot, 0.5 m and 1 m. **No expected RSSI in the files.** Bench rule: the board must be seen and connect at 1 m in the same room; compare with the DK running the DK build (it also advertises `PitchIQ XXXX`) at the same spot; more than 10 dB difference is worth reporting. The RF review notes the Sharp panel's metal lies 1.05 mm from the antenna end, so redo with the panel fitted before judging the antenna.

**SAFE LIMITS.** None specific. Do not pair during a flash.

**Pass/fail.** PASS: name seen; fast-then-slow observed; pairing completes with the logged passkey; bond survives a reset.

**Troubleshooting (most likely first).**
1. Not seen: app filters; `advertising failed` in the log; antenna end clear of metal/hand; another phone.
2. Weak (below about -90 dBm at 1 m, bench rule): module solder (U1), antenna keepout (no copper y 0-4 mm), a metal object, 3V0 dip during transmit (radio about 15 mA).
3. Pairing starts but no `PASSKEY` line: you are not running the bring-up build (the normal build only says `passkey for pairing is on the screen`).
4. Pairing fails repeatedly: stale bond on the phone; remove it and hold the button 5 s.
5. Interval never slows: look for `advertising as ..., slow`.
6. Connects then drops: 20 ms request or supervision timeout; read the log.

---

## 11. Accelerometer (LIS2DH12)

**Purpose.** Prove the part answers and reports gravity.

**Equipment.** UART terminal; multimeter.

**Setup.** Bring-up build running.

**Expected.**
- Address **0x19** (SA0 high, `design.py`); WHO_AM_I register 0x0F = **0x33** (`sensors.c`). Log line: **`ACCEL WHO_AM_I 0x33 at I2C 0x19 rc 0 (expect 0x33 at 0x19) OK`**; `MISMATCH` otherwise; `rc` nonzero = bus error.
- Idle I2C at 3.0 V (4.7 kohm pull-ups): SDA at TP10 (10.6, 34.2) and SCL at TP11 (12.6, 34.2), each about 3.0 V (accept 2.85-3.15 V).
- Every second: **`ACCEL mg x .. y .. z ..`** in milligravity. 1 g = 1000 mg. Board flat: the axis along gravity reads about +/-1000 mg and the other two near 0. **Tolerance not given.** Bench rule: the vertical axis between 900 and 1100 mg in magnitude, the other two within +/-150 mg, and sqrt(x^2+y^2+z^2) between 900 and 1100 mg. **Which board axis is which is not stated**: use magnitudes, and flip the board to see the sign change. Do each of the three faces/edges to cover all three axes.
- The earlier startup line `accel high-pass on INT1: ... INT1_SRC 0x..` (still printed): with the board still, IA must be 0.
- Motion events print no log line; not testable.

**Actions.** 1. Check SDA/SCL idle. 2. Reset and read the WHO_AM_I line. 3. Rest the board on three different faces and note the mg lines. 4. Wait for `image confirmed: 0`.

**SAFE LIMITS.** None (passive part, 3.0 V rail).

**Pass/fail.** PASS: WHO_AM_I OK; three axes each reach about 1 g when pointed along gravity.

**Troubleshooting (most likely first).**
1. `LIS2DH12 not ready` / rc nonzero: I2C wiring or solder under the LGA: U4 pin 1 SCL (23.74, 6.15) and pin 4 SDA (23.74, 7.65); VDD/VDD_IO from C13/C26; reflow U4.
2. WHO_AM_I wrong (0x00 or 0xFF): stuck bus, or the alternate LIS2DW12 part fitted (BOM same-pad alternate needs its own driver): check the markings.
3. PMIC answers, accelerometer not: SA0 not high gives address 0x18 (datasheet fact in `p1_electrical_reference.md`); pin 3 is under the LGA.
4. Bus held low: SDA-SCL short (Test 2 line 16) or an unpowered device pulling down; measure TP10/TP11.
5. Readings all zero or constant: the sensor is in power-down; read the log for a driver error.

---

## 12. Motor activation

**Purpose.** Prove the motor and its switch, measure the current, and check the start does not brown out the board on battery.

**Equipment.** Multimeter (200 mA range), PPK2 or scope (nice); the motor (8 mm coin ERM, 2.7-4.0 V, 35 mA max, Vybronics VCLP0820B004L); UART terminal; a charged cell for the battery-only check.

**Setup.** Fit the motor only now: leads to M1 pads, + at (2.2, 28.2) (VSYS), - at (4.2, 28.2) (MOTOR_N); C24 NOT fitted. Hand-soldered ahead of this test, after Tests 3-11 passed.

**How to trigger it (bring-up build):** a **300 ms buzz 3 s after every boot** (log `boot buzz`, `buzz 300 ms`) and **on every short button press** (released before 5 s; log `button short press`, `buzz 300 ms`). The 5 s hold behaviour is unchanged: forget pairing plus the "changed" pattern (2 x 120 ms), and a 10 s hold power-cycles the watch (hardware, `long-press-reset`). A short press also lights the frontlight (not fitted; nothing visible).

**Expected (design values).**
- Motor rated 35 mA; start current 2-3 times that: about **70-105 mA** (estimate; start current is not on the data sheet); radio at +8 dBm adds about 15 mA; worst case about **90-120 mA** (`power_budget.md`).
- The firmware caps the duty so the motor sees about 3.0 V average: about 60% on USB (VSYS about 5 V); higher on battery (`haptics.c`, `power_vsys_mv_estimate`; the battery sample can be 60 s old). Discharge limit is 1 A (dts).
- **USB with no cell:** a buzz of 70-105 mA on top of the system current is at or above the 95 mA minimum of the 100 mA input limit, so VSYS can sag and BUCK2/the MCU can brown out (audit line 107 describes this for a cell below about 2.9 V). Because the bring-up build buzzes 3 s after EVERY boot, a USB-only start with a motor fitted may reboot, then buzz again after the next boot. That would show as repeated `BOOT fw ...` lines about 3 s apart. It is an expected design limitation, not necessarily a fault; to avoid it, run the motor tests with a charged cell connected.

**Actions.**
1. **USB with a charged cell (JP1 bridged):** meter in the +5 V lead (200 mA) or USB meter. Press the button briefly, release. Watch the current rise during the 300 ms buzz. A DMM shows an average and flicker; PPK2 or scope shows the real pulse (design estimate 70-105 mA).
2. **Battery only (USB unplugged, cell above 3.8 V):** repeat. Watch the UART/RTT: no second `BOOT fw` line may appear. Repeat at about 3.5 V if you have a cell at that level.
3. The motor must visibly vibrate; Q1 (24.0, 11.1) and the motor must not smell or warm.
4. Scope (nice): Q1 gate (Q1 pin 1 (23.06, 10.15)) for the PWM burst; MOTOR_N (M1 pad 2) for a low-side pulse with D1 limiting the turn-off spike at about VSYS.

**SAFE LIMITS (STOP):** current above 150 mA (bench rule); motor or Q1 hot; reset on every buzz on a charged cell; motor running continuously.

**Pass/fail.** PASS: motor vibrates on the 3 s boot buzz and on short presses; the battery-only test does not reboot on a cell above 3.8 V; the USB-no-cell behaviour is recorded whatever it is.

**Troubleshooting (most likely first).**
1. Log shows `buzz 300 ms` but no vibration: motor lead joint; Q1 orientation; gate never toggles (module pad 27 VIB (16.20, 14.65) solder); R15 is only a pull-down.
2. No `button short press` line: button path: SW1 to U2 SHPHLD (pin 15 (27.04, 24.25)), SW1 solder (trimmed pads), D3 orientation; make sure you released before 5 s.
3. Reboots on every buzz on a charged cell: VSYS/VBAT droop: JP1 joint, C6/C7/C8 fitted, cell resistance.
4. Motor on continuously at power-up: gate floating (R15 missing) or shorted.
5. Watch power-cycles: button held past 10 s.

---

## 13. Power-consumption measurement

**Purpose.** Measure sleep and active current and compare with the power budget.

**Equipment.** Multimeter with 200 uA (or 2 mA) and 200 mA ranges; PPK2 (nice); a charged cell.

**Setup.** **Flash the NORMAL build (Test 7 note): the bring-up build wakes the CPU for 1 s and 5 s I2C polling and a UART, so its current says nothing about the product.** Disconnect the SWD wires, the DK and the UART adapter completely. USB unplugged. JP1 OPEN; the instrument replaces JP1: cell side = pad A (28.5, 31.25), board side = pad B (28.5, 29.95).

**Method A: multimeter in series.** Red to pad A, black to pad B. Caveats (general meter behaviour, not from the files):
- A low range drops a few tenths of a volt at full scale (burden voltage). At 70 uA this is small; during a radio burst (about 15 mA) or a motor buzz (about 100 mA) it is large and can reset the chip. **Do not run the motor or connection tests through the meter.** Use it only for quiet standby. Bridge the meter with a clip lead while the board starts up and remove it once idle.
- Start on the 2 mA range; drop to 200 uA only when below 0.2 mA.
- The reading is an average of spikes (advertising every 1.0-1.2 s, EXTCOMIN 60 times a second): wait 10 s.
- Never leave the meter in a uA range while charging or buzzing; unplug the meter before plugging in USB.

**Method B: PPK2 (nice).** Ampere-meter mode at JP1 (same points) or source-meter mode with VOUT = 3.8 V on JP1 pad B, cell disconnected, GND to TP2. Whether it resolves the 0.37 uA ship-mode level is not something the files tell me.

**Expected (design values, `power_budget.md`, rev E header; an ESTIMATE; 150 mAh at 80% usable = 120 mAh; 3.8 V mean; buck efficiency 0.82):**

| State | Design current | Life on 150 mAh | How to get the state |
|---|---|---|---|
| Ship mode | 0.37 uA | months (cell protector and self-discharge dominate) | entered by the firmware below 3% battery (three readings a minute apart, not charging); wake with a 1 s press |
| Standby, advertising at 1.0-1.2 s, no phone, screen on | **0.07 mA (70 uA)** | about 75 days | 30+ s after reset, no phone |
| Connected idle (20 ms, no calls) | 0.46 mA | about 11 days | bonded phone connected |
| Game typical (connected, 50 calls/h) | 0.71 mA | about 7 days | needs the PitchIQ app: not testable |
| Game at night, frontlight 30% | 2.16 mA | about 56 h | frontlight not fitted |
| Peak (motor start + radio) | 90-120 mA | n/a | Test 12; not through a meter |

Life in hours = 120 mAh / reading in mA. 0.07 mA gives 1714 h = 71 days (the budget says about 75); 0.14 mA gives 36 days; 1 mA gives 5 days. The budget includes a standing 3 uA for R9.

**Bench rules for acceptance** (no tolerance given): standby up to 0.14 mA (2 times design) OK; above 0.14 mA investigate; above 1 mA STOP and ask. Known contributions above the estimate: the 60 Hz EXTCOMIN currently toggles on the CPU (the budget lists moving it to the RTC as a saving of about 19 uA). The nRF52840's DC/DC regulator is enabled in the board file (`&reg1 ... NRF5X_REG_MODE_DCDC`, with the comment that the module's inductor is assumed fitted); whether the budget assumed that is not stated.

**SAFE LIMITS.** Meter fuse intact; see the caveats; STOP on any smell.

**Pass/fail.** PASS: standby at most 0.14 mA. FAIL: above 1 mA.

**Troubleshooting (most likely first).**
1. 1 mA or more: you are still running the bring-up build, a debugger or UART adapter is attached, the CPU is not sleeping, or a rail load fault.
2. 0.3-0.5 mA: still in the 20 ms connected state, or inside the 30 s fast advertising phase.
3. Resets with the meter in the path: burden voltage; clip lead; or Method B.
4. Reading rises with time: a bonded phone reconnecting; stop its app.

---

## 14. Firmware recovery testing

**Purpose.** Prove every bad-firmware state can be recovered through the five SWD pads, and observe MCUboot swap-and-confirm before trusting over-the-air updates.

**Equipment.** The Test 6 setup; a second build with a visible change; `mcumgr` (or nRF Connect Device Manager); a bonded phone.

**Setup.** Watch on USB, firmware running with `image confirmed: 0`, SWD connected.

### 14.1 Recovery paths that exist

| Path | What it does | Source |
|---|---|---|
| SWD through the five pads: erase and reflash | universal recovery while APPROTECT is not locked | README |
| `nrfutil device recover` / `nrfjprog --recover` | full chip erase (bootloader, app, bonds, keys); also unlocks | README, `prod.conf` |
| Hold the side button 10 s | nPM1300 power-cycles the watch (hardware); leaves the fatal "park" halt | dts `long-press-reset`, README |
| Hold the side button 5 s | forget pairing and buzz | README |
| Hold the side button 1 s | wake from ship mode | dts |
| MCUboot test-swap revert | an uploaded and tested image not confirmed within 15 s of healthy running is swapped back at the next reset | `app_glue.c`, README |
| 8 s watchdog | resets a hung app | README |
| Fatal-error guard | 3 fatal resets in a row park the chip until power-cycled | README |
| nRESET pad (new in rev E) | pin reset on P0.18 (`gpio-as-nreset`); not verified on hardware | README Rev E |

**Do not exist:** serial recovery or UART DFU in MCUboot (`CONFIG_BOOT_SERIAL_UART=n`; the new bring-up UART is the APP's log, not an MCUboot recovery port), USB DFU (module USB pad tied to GND), button-at-boot to enter the bootloader, BLE recovery of a bad bootloader, BLE recovery of a bad app (mcumgr lives in the app).

### 14.2 Tests (each reversible through SWD)

1. **Blank chip.** Full chip erase. No UART, no RTT, no advertising, low current; SWD still connects. Reflash (Test 7).
2. **Blank app, good bootloader.** Erase slot 0 only, or flash only the MCUboot hex into a blank chip. MCUboot's behaviour with no valid image is its default, not recorded in the files; expect nothing visible. Reflash.
3. **Bad app.** Flash MCUboot, then an invalid app (the unsigned `zephyr.hex` or a signed file with one byte changed). Expect MCUboot to refuse it (ECDSA P-256, debug key): no UART, no advertising. Reflash the good image.
4. **Swap and confirm over Bluetooth.** On a bonded phone:
   ```
   mcumgr --conntype ble --connstring peer_name='PitchIQ XXXX' image upload app/zephyr/zephyr.signed.bin
   ```
   (README; XXXX = your address digits), then `image test <hash>` (hash from `image list`), then reset. Expect: the new image runs, `image confirmed: 0` after 15 s of healthy running; `image list` shows it confirmed. Swap time is not recorded.
5. **Rollback.** Upload and `image test` again, reset, and **within 15 s remove all power** (unplug USB with JP1 open). Power up again: MCUboot must restore the OLD image. Do NOT use the button: a 10 s hold passes the 5 s "forget pairing" gesture and wipes the bond.
6. **Locked chip (optional, last).** Only after everything else passed and only with your own signing key: flash the production build (`prod.conf`, README "Production build"); `nrfjprog --readcode` must fail; then `nrfutil device recover` and reflash the unlocked build. Never do this on your only board. The pads stay reachable with the back cover off.
7. **A module that arrived locked:** `nrfutil device recover`, then Test 7.

**SAFE LIMITS.** Never interrupt a flash. Never run recover on cell power alone. Do not flash the locking build to a board with damaged pads.

**Pass/fail.** PASS: tests 1-5 end with `image confirmed: 0` after the stated recovery, and rollback restores the OLD version. FAIL if any state cannot be recovered over SWD (stop and ask: that would be a pad hardware fault).

**Troubleshooting (most likely first).**
1. Upload fails: not bonded (mcumgr over BLE needs a bonded phone), or wrong `peer_name`.
2. New image never confirms: needs healthy + advertising/connected + PMIC and accelerometer identity: look for `board identity check failed`.
3. Rollback does not happen: 15 s passed before you cut power.
4. Recover fails: wiring; Test 6.

---

## Results sheet (one page)

Expected values are design values unless marked rule.

| Test | Item | Expected | Measured | Pass / Fail | Notes |
|---|---|---|---|---|---|
| 1 | Orientation: U1 antenna up; U2 pin 1 south-west; D1 stripe west; D2 stripe south; Q1/Q2 lone pin east; J1 = FH12A | per 1.1 | | | |
| 1 | Bridges on U2, J1, U1, J3, TP9-TP15; stakes S1-S4 wetted | none | | | |
| 2 | VBUS, VSYS, VBAT, 3V0, VBUSOUT to GND | above OK value (rule) | | | |
| 2 | Cross pairs 9-20 | open | | | |
| 2 | R2 (VSET2) / R1 (VSET1) | 150 kohm (142-158) / 0 ohm | | | |
| 2 | R16 / R3 / R4 / R17-R19 / R20 | 10 k / 4.7 k / 100 R / 1 k | | | |
| 2 | RT1 at room temperature | 10 k at 25 C (about 12.1 k at 20 C) | | | |
| 2 | R21, R22 | open (not fitted) | | | |
| 2 | CC1, CC2 to GND unpowered | about 5.1 kohm or OL (record which) | | | |
| 3A | Input current at 5.0 V via TP1 | below 30 mA (rule); 3-6 mA firmware (estimate) | | | |
| 3B | Both orientations, A-to-C and C-to-C | same VBUS and current | | | |
| 4 | VBUS / VSYS / 3V0 | 4.0-5.5 V / about VBUS / 3.00 V (2.85-3.15) | | | |
| 5 | Cell voltage and polarity before soldering | 3.0-4.2 V | | | |
| 5 | PMIC log `iset` / measured charge current | 74 mA / 60-90 mA (rule) | | | |
| 5 | Termination; temperature; time | 4.15-4.22 V; not hot; under 3.5 h (rule) | | | |
| 6 | Chip detected over SWD | nRF52840 identified | | | |
| 7 | MCUboot + signed bring-up app flashed | exit 0, verified | | | |
| 8 | UART lines 1-10, `image confirmed: 0` | seen within about 15 s | | | |
| 9 | EXTCOMIN (TP12 before the panel); `LCD init ok`; picture | 54-65 Hz (60 design); ok; readable | | | |
| 10 | Name; fast then slow; `PASSKEY` pairing; bond survives reset | `PitchIQ XXXX`; 100-150 ms 30 s then 1.0-1.2 s | | | |
| 11 | `ACCEL WHO_AM_I 0x33 at I2C 0x19 ... OK` | 0x33 | | | |
| 11 | Each axis about 1 g along gravity | 900-1100 mg (rule) | | | |
| 12 | Boot buzz and short-press buzz; battery-only start | vibrates; no second `BOOT` line on a charged cell | | | |
| 13 | Standby current, NORMAL build | 0.07 mA design; up to 0.14 mA (rule) | | | |
| 13 | Connected idle | 0.46 mA | | | |
| 14 | Blank/bad-app recovery; swap and confirm; rollback | back to `image confirmed: 0`; old image restored | | | |

---

## Stop-and-ask list (do not continue; ask first)

1. Any rail-to-GND or rail-to-rail short in Test 2 (below 1 kohm; 3V0 below 500 ohm), or adjacent test pads shorted.
2. R2 not 150 kohm, R1 not 0 ohm, or R21/R22 found fitted without you having decided to.
3. First power: current at the limit and not falling after 2 s; VBUS below 4.0 V under load; any heat, smell, smoke.
4. VSYS stuck near 2.5 V, 3V0 above 3.3 V or not near 3.0 V.
5. VBUS above 5.5 V at any time, or a non-5 V charger.
6. Cell below 3.0 V (or 0 V) before connecting; reversed polarity; any cell damage.
7. Charge current above 100 mA, VBAT above 4.25 V, cell too hot, no termination after 3.5 h.
8. The five SWD pads will not connect the chip after Test 6 checks (hardware fault).
9. A protected chip with unknown contents: do not recover until you accept it erases everything.
10. `image confirmed: 0` never appears and `board identity check failed` shows, or `ACCEL ... MISMATCH`, or PMIC `rc` nonzero.
11. SDA or SCL held low (check TP10/TP11).
12. Display: panel will not seat, tail damaged, or board/panel warm after seating (possible reversed connection).
13. Standby above 1 mA; the watch resets on every buzz on a charged cell.
14. A bad-app test that leaves the chip unrecoverable through SWD.

---

## Gaps found while writing (status against the current rev E files)

Status key: **FIXED IN REV E**, **STILL OPEN**, **ACCEPTED**. "Fixed" means the design files now address it; none of it is proven on hardware.

1. Log channel only RTT over SWD. **FIXED IN REV E (bring-up build):** UART TX on TP13 (P0.05), RX TP14 (P0.08), RTT kept. Still open in detail: TP13-TP15 sit under the display tail, so with the display fitted you are back to RTT; SWO is still not connected (**STILL OPEN**, minor); the normal build still logs RTT only (**ACCEPTED**).
2. nRESET pad may not reset the chip. **FIXED IN REV E** on paper (`gpio-as-nreset` in the board devicetree); **STILL OPEN** to verify on a real chip.
3. Accelerometer has no readout. **FIXED IN REV E (bring-up build):** WHO_AM_I line and x/y/z in mg every second. The normal build still has no readout (**ACCEPTED**). Which axis is which is still not documented (**STILL OPEN**).
4. Motor and self-test only by the 5 s hold. **FIXED IN REV E (bring-up build):** 300 ms buzz 3 s after boot and on a short press. **STILL OPEN:** the boot buzz can make a USB-only, no-cell start reboot repeatedly with the motor fitted (Test 12); suggest a bring-up option to skip the boot buzz when no cell is present, or fit the motor last (this procedure does).
5. Pairing depends on the LCD. **FIXED IN REV E (bring-up build):** `PASSKEY %06u` is logged. Normal build still shows it on screen only (**ACCEPTED**).
6. Missing test pads: VBAT, SDA, SCL, EXTCOMIN, second GND. **FIXED IN REV E:** TP9, TP10, TP11, TP12, TP15 (top, y = 34.2). **STILL OPEN:** no pad for VBUSOUT, SW2, PMIC_INT, ACC_INT or the crystal nodes XL1/XL2 (a 32.768 kHz fault blocks the whole firmware at boot; only a log that stops after line 1 reveals it); and all seven new pads are covered once the display is fitted.
7. Only current-measurement point is JP1; none for USB input current or 3V0 alone. **STILL OPEN.** Suggestion: 0 ohm links in the VBUS path and in the 3V0 feed to J1.
8. No charge indicator (nPM1300 LED pins not connected). **STILL OPEN**, mitigated by the 5 s `PMIC` log line in the bring-up build.
9. Rd with an unpowered chip is unknown; a C-to-C charger may not power a dead-cell watch. **PARTLY FIXED IN REV E:** unfitted R21/R22 (5.1 kohm to GND) as a fallback; the unpowered-Rd question itself is **STILL OPEN** (Tests 2 and 3 decide it), and the fallback doubles Rd once the chip is powered (about 2.55 kohm), so it needs a test.
10. Cold start from USB with no battery is a documented risk; a motor buzz on USB-only power can exceed the 100 mA input limit. **STILL OPEN** (C24 already unfitted; the 0 ohm series pad suggested in the review is not in the files I read).
11. Flat or protector-open cell test has no safe procedure. **STILL OPEN** (suggestion: a current-limited bench supply on JP1 pad B as the "cell"). The charger is now disabled before the current is written (README rev E) and the flat-cell enable exists, but neither has run.
12. Rev naming inconsistencies. **FIXED IN REV E:** files are named revE (`FAB_NOTES_revE.md`, `MECH_revE.md`, `power_budget.md` header says rev E). **STILL OPEN:** the 1:1 prints `out/pitchiq_watch_revE_1to1_top.pdf` and `_bottom.pdf` do not exist in `out/` yet.
13. Display connector geometry unproven (contact side, pin-1 end, entry direction rated 85-90% on paper). **STILL OPEN.** Seat a real panel unpowered before first power with it; consider a dual-contact connector later.
14. Rotation of U2, U4, D1, D2, TVS diodes unverified (`FAB_NOTES_revE.md` still says so); TVS variant polarity not recorded. **STILL OPEN.** U2 was also rotated 90 degrees in this revision, so recheck its pin 1 (south-west).
15. Sleep current may exceed the budget. **PARTLY FIXED:** the nRF52840 DC/DC is enabled in the board file (`&reg1`, DCDC mode), so my earlier statement that none was enabled was wrong. **STILL OPEN:** the 60 Hz EXTCOMIN still toggles on the CPU (about 19 uA, budget); and the bring-up build must not be used for the current test.
16. Programming pads only reachable with the back cover off. **ACCEPTED** for bring-up; production recovery path not defined (**STILL OPEN**).
17. No flash, UART or RTT command has ever been run, and the DK debug-out pin order in Test 6 comes from outside the design files. **STILL OPEN.** Suggestion: run Tests 6-8 once on the DK build first (`west flash -d build_dk`).
18. New in this revision: the bring-up `confirmed %d` flag and the reset cause may not mean what they appear to (README: RESETREAS may already be cleared). **STILL OPEN**, informational.
19. New in this revision: the UART's RX pad has a pull-up (`bias-pull-up`) and TX is a plain output, so the adapter's TX at 5 V logic would exceed the nRF input limit; the procedure says to leave it unconnected. **ACCEPTED** with that instruction.
