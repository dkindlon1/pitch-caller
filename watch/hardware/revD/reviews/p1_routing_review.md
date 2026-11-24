# PitchIQ watch rev D: independent PCB layout review (p1)

Board file: `kicad/pitchiq_watch.kicad_pcb` (KiCad 7.0.11, loaded with pcbnew; 482 track segments, 150 vias, 261 pads). Coordinates below are BOARD coordinates in mm (sheet = +100 x, +80 y). Nothing was built or modified. Analysis scripts live in `/tmp/rv` (not part of the repo).

Method: connectivity was rebuilt from the copper (tracks, vias, pads) and checked against the net list (every power net is one cluster). Resistances use rho = 1.68e-8 ohm m, 35 um outer copper, 17.5 um inner copper, 0.2 mm tracks (every track on the board is 0.2 mm). The planes were rasterised at 0.05 mm from the filled zones. Temperature rise uses IPC-2221 (conservative for inner layers). The file defines no stackup, so JLCPCB default 6-layer copper weights were assumed.

## 0. Verdict

DRC passing is true but says little here. Electrically the copper is usable for a first engineering prototype: planes are solid, every ground and 3V0 pad has its own via, no dangling tracks, nothing in the antenna keep-out. I found 1 CRITICAL (mechanical collision, not electrical), 5 MAJOR, and 14 MINOR items. The MAJORs are mostly "autorouter ignored loop/placement quality" issues, not DC problems.

## 1. Severity list (summary)

| # | Sev | Finding | Where | Fix |
|---|-----|---------|-------|-----|
| C1 | CRITICAL | USB-C J3 (bottom) body overlaps the nominal cell outline by 2.0 x 6.0 mm | J3 courtyard x -2.12..8.22, y 5.2..15.8 vs cell x 6.2..25.95, y 9.8..35.8 | Decide mechanically before fab: cell must start at x >= 8.4, or board/J3 moves. Details in 9.1 |
| M1 | MAJOR | C25 (100 nF PVDD HF bypass) is wired to U2 pin 4 through 21 mm of track and 3 vias (F, In3, In2), so it does no HF decoupling | C25 at (15.7,26.7) | Move C25 to within 1.5 mm of U2.4, with its GND via next to U2.6 or the EP. See 2 |
| M2 | MAJOR | PVDD (U2.4) is fed from VSYS (U2.20) by a 28 mm, 92 mohm, 3-via detour (F, B, In3, F). C8's GND returns through a thin F-pour island and one via 2.8 mm away. Input loop is about 14 mm | track (24.1,24.4) to (18.5,23.9); C8.2 at (14.4,23.3); via (12.7,25.5) | Give C8.2 its own via within 0.5 mm of its pad, or put C8 on the pin 4 / pin 6 side. Widen the VSYS to PVDD feed to 0.4 mm. See 2 |
| M3 | MAJOR (ESD only) | Surge diode D2 is not at the connector. It hangs off a 1.5 mm stub plus a via, 8.5 mm of 0.2 mm track from J3.B9. VBUS trunk is 0.2 mm all the way | D2 at (4.4,17.6); branch point (5.5,18.0) | Move D2 to within 2 mm of J3 B9/A9 (7.0,12.0), widen VBUS J3 to U2 to >= 0.4 mm on B. See 1.1 |
| M4 | MAJOR (RF, unverified) | LCD metal outline starts 1.05 mm (lateral) from the module's antenna end | LCD outline y >= 5.5 vs module antenna zone y <= 4.45 | Keep LCD frame, FPC shield and any metal tape >= several mm from y 4.45 or measure return loss on the first board. See 6 |
| M5 | MAJOR (assembly) | 4 vias inside the U2 exposed pad are open 0.2 mm barrels with no tenting or fill noted in the file | U2.EP vias (20.4,23.3), (22.2,23.3), (20.4,25.1), (22.2,25.1) | State "tent/plug from the bottom" in the fab notes. Otherwise solder wicks away from the EP |

MINOR items are numbered m1 to m14 in section 10.

## 1. Current paths

All tracks are 0.2 mm. Current density at 0.5 A is 71 A/mm2 on 35 um copper, and 0.3 A on 17.5 um inner copper is 86 A/mm2. A 0.2 mm outer track carries about 0.74 A for 10 C rise (IPC-2221). A 0.2 mm 0.5 oz inner track carries about 0.22 A for 10 C.

### 1.1 VBUS (J3 to D2/C12 to U2.21)

- J3.B9 to U2.21: 32.6 mm of track, 79 mohm, 1 via (B then F). Layers: B (28.5 mm incl. a 9.9 mm diagonal (12.4,24.9) to (5.4,17.9) and a 5.8 mm run (21.8,24.5) to (16.0,24.5)), via (25.6,23.8), F 1.3 mm.
- J3.A9 to U2.21: 39.4 mm, 110 mohm, 3 vias, includes In2 (8.3,9.3) to (8.3,11.9) to (8.6,12.9), 5 mm of 0.5 oz inner copper.
- J3.B9 to D2.1: 8.5 mm incl. 1 via (3.9,17.9). D2 sits on a stub 1.5 mm past the branch point (5.5,18.0).
- U2.21 to C12.1: 2.43 mm, 5.8 mohm.
- Drop at 0.5 A: 40 mV (B9 route) or 55 mV (A9 route). Outer track rise 4 C. If the A9 branch took 0.25 A of it, the In2 piece rises 13 C. 0.5 A through In2 alone would rise 62 C, but the parallel B9 route prevents that.
- Via count: 1 (B9 route), 3 (A9 route). A 0.2/0.5 via carries well over 0.5 A; not a limit.
- Judgement: DC is fine at 500 mA. A 1 A charger input limit would put the A9/In2 branch at its limit. The real problem is the surge path (M3): IEC-style ESD current runs through 8.5 mm (about 8 nH) of 0.2 mm track and a via before the clamp, so the clamp voltage at the pin rises well above the diode's 9.2 V. The 25 V C12 and 22 V pin rating give some margin; do not call this protected.
- Extra: the 9.9 mm B diagonal runs under the cell (cell starts x = 6.2). Cell foil against 0.2 mm tracks is acceptable only with intact mask (m11).

### 1.2 VBAT (BT1 to JP1 to U2.19)

- BT1.1 to JP1.1 (BATP): 3.78 mm, 9 mohm, B only, 0 vias.
- JP1.2 to U2.19 (VBAT): 5.4 mm, 14 mohm, 1 via (29.2,24.9) from B to F.
- Total board copper about 23 mohm plus the solder bridge. At 0.3 A: 7 mV and 1.3 C. Acceptable. One via only, in a path with no redundancy (a failed via cuts the battery). Cheap to add a second via at about (29.3,25.3) next to JP1.2.

### 1.3 VSYS

- U2.20 to C7: 2.2 mm, 5 mohm, direct. U2.20 to C24: 11 mm, 26 mohm. U2.20 to D1: 14.3 mm, 34 mohm.
- U2.20 to U2.4 (PVDD): 28.3 mm, 92 mohm, 3 vias (F, B, In3, F). In3 portion: (20.3,19.6) to (17.0,22.9) to (12.7,22.9), 9 mm of 0.5 oz copper. At 0.3 A the In3 section rises 19 C (IPC-2221), fine for the real buck input current (about 150 mA mean), not fine for sustained 300 mA.
- U2.20 to M1.1: 38.4 mm, 117 mohm, 3 vias.
- Drop buck input at 150 mA: 14 mV. Drop to motor at 100 mA: 12 mV.
- Topology problem: VSYS is a long daisy chain with a detour to PVDD. See M1/M2.

### 1.4 Buck 2 switch node and output

- SW2: U2.5 (18.862,24.45) to L2.1 (16.263,25.0): 1.84 mm F track, 4 mohm, 0 vias, 0% over plane voids, In1 solid beneath. Nothing within 0.3 mm except U2.6 pad. This part is good.
- L2.2 (14.138,25.0) to C10.1 (12.575,24.1): 1.8 mm centre to centre, joined through In4. L2.2 uses via (13.9,26.0) with a 0.4 mm stub, C10.1 uses (12.4,26.2). One via each side (no parallel vias). 200 mA through one 0.2 mm via is about 15 A/mm2 of barrel, no problem.
- Temperature: 0.2 A on 0.2 mm outer, 0.5 C. SW2 resistance 4 mohm gives under 1 mV. Fine.

### 1.5 Motor

- M1.1 (VSYS) to U2.20: see 1.3 (38 mm, 117 mohm, 3 vias).
- M1.2 (MOTOR_N) to Q1.3: 30.4 mm, 73 mohm, F only. D1.2 to M1.2: 27 mm.
- Total loop resistance 190 mohm, so 19 mV at 100 mA start. Fine.
- Flyback diode D1 is at the Q1 end (24,14.8), 27 mm from the motor, so the inductive loop (D1 to VSYS to M1 to MOTOR_N to D1) is about 65 mm of track. At 35 mA nominal this is not a failure, but it makes the PWM edge a board-wide radiator. m1.

### 1.6 3V0 into In4

- 22 vias connect to In4, all 3V0 pads have their own via and stub (22 track clusters, 22 with a via). No pad relies only on pour. Plane fill 787 mm2 (87% of the board area outside the antenna strip), copper-only necks > 0.6 mm everywhere in the main body (see 3).
- Buck output goes into the plane at one via (13.9,26.0). Nearest consumers: U2.32 sense at 1.17 mm edge-gap from its via, U1.28/.30 3.5 mm, J1 5 mm.
- Judgement: acceptable.

## 2. Buck loop (U2 BUCK2: PVDD pin 4, SW2 pin 5, PVSS2 pin 6)

| Segment | Measured | Layer | Return |
|---|---|---|---|
| PVDD pin 4 (18.86,23.95) to C8.1 (15.98,23.3) | 2.96 mm centre, 2.0 mm pad gap, 2.18 mm track | F | n/a |
| C8.2 GND (14.43,23.3) to GND via | via (12.7,25.5), 2.8 mm; via is reached through a 0.57 mm stub into a 3.6 mm2 F-pour island (x 12.4..15.35, y 22.9..26.25), thermal-relief spokes | F then In1 | In1 plane solid below |
| In1 plane run to EP vias | (12.7,25.5) to (20.4,25.1): 7.7 mm | In1 | continuous plane |
| EP vias to PVSS pins | pin 6 and pin 2 tied to EP by 0.3 mm stubs; 4 EP vias | F | direct |
| SW2 pin 5 to L2.1 | 1.84 mm | F | n/a |
| L2.2 to C10.1 | 1.8 mm centre, via In4 | F, via, In4, via, F | n/a |
| C10.2 GND (11.0,24.1) to GND via | (11.0,22.7) / (10.2,23.7), 0.4 mm gap | F, In1 | In1 solid |
| C10 return to U2 PVSS | about 10 mm of In1 to the EP vias | In1 | continuous plane |
| C25 (100 nF) to PVDD | 21.0 mm track, 3 vias (F, In3, In2, F), 87 mohm | F, In3, In2 | its GND via is 0.34 mm away (good) but the supply side is not |

- Input loop (PVDD to C8 to via to In1 to EP vias to PVSS): about 14 mm, 2 layer changes. Output loop (SW2 to L2 to C10 to via to In1 to EP to PVSS): about 15 mm, 4 layer changes (2 via pairs in the 3V0 plane hop). Rough loop inductance with a close return plane: 6 to 10 nH each, with 100 to 300 mV spikes expected on PVDD at the switching edges for a 200 mA step. For a 200 mA buck feeding a 2.4 GHz radio next to it, that is mediocre rather than broken.
- Return path is a solid plane (In1 directly below F), voids under SW2 track: 0%. This is the best part of the loop.
- Practice: input cap should sit directly across PVDD and PVSS (pad to pad under 1 mm, shared ground via at the cap), and the 100 nF closest. Nordic's general text on the nPM1300 hardware pages, which I could read, says only that the BUCK supply should be decoupled "as close as possible to the supply pins", that grounds, VDD connections and bypass capacitors "must be connected as close as possible to the device", and "Long power supply lines on the PCB should be avoided". The numeric layout figures (reference layouts for QFN: 4 copper layers, no components on the bottom) are images that I could not read. So M1 and M2 are judged against these qualitative rules and standard buck practice, not against Nordic numbers.
- Fixes (approximate; confirm free space in KiCad):
  - M1: relocate C25 to about (17.4,22.0) or any spot within 1.5 mm of pin 4 and pin 6; direct F track to U2.4, GND via within 0.5 mm of C25.2. C25 at (15.7,26.7) is next to L2 and pin 6 of the row below; connecting C25.1 straight to C8.1 (15.975,23.3) with a 0.3 mm F track would be enough to cure it if C25 is moved to (15.7,22.6)-ish.
  - M2: add a GND via within 0.5 mm of C8.2 (14.43,23.3) (for example at (14.4,22.8)); widen the U2.20 to U2.4 path to 0.4 mm on In3 (use 0.5 mm and a second via pair at (24.9,19.6) and (12.7,22.9)).

## 3. Ground and 3V0 planes

- In1 (GND): fill 810 mm2. Board area 1028 mm2, antenna strip 122 mm2, so 90% of the allowed area is copper. One polygon of 808.5 mm2 plus one 1.9 mm2 island at (1.05,4.0) to (3.9,5.15) next to the J3 notch. That island is tied to the main plane through the thermal-relief spokes of the J3 shell stakes S2/S4 (GND pads at (4.0,4.7), (1.0,4.7)); it is not floating.
- In4 (3V0): fill 787 mm2 (87%), one polygon, no islands.
- Voids: all are via antipads (no void polygons were produced by the fill). Longest merged void chains: In1 (8.6,3.8) to (21.5,4.7), which is the antenna keep-out edge, not a split; In1 (21.1,4.6) to (27.5,9.0), 7.2 mm diagonal of antipads for the U4/D3/C13/Q1 vias, copper bridges between antipads still more than 0.6 mm wide (erosion test: a 0.6 mm neck would break the plane at 0.30 mm erosion; the main polygon stays 658 mm2, one piece); In4 (8.6,3.8) to (21.5,6.2), 12.5 mm, same keep-out edge plus module antipads. No electrical split longer than 5 mm anywhere in the body of either plane. The only chain over 5 mm that is not the keep-out edge is the 7.2 mm one above, and it is passable.
- GND stitching vias: 59 GND vias (4 in the U2 EP, 2 per most ICs). Counting the planes: In1 is tied to F and B pours by those vias too (F and B GND pours exist, 540 and 670 mm2, in 7 and 3 islands; all islands hold a via or pad).
- Every IC ground pin and decoupling capacitor ground pad has a stub plus own via, 0.32 to 0.47 mm pad-edge to via edge. Exceptions (edge gap to nearest GND via over 1.0 mm; each does have a track or pour path to a via):

| Pad | Edge gap to nearest GND via | Note |
|---|---|---|
| C8.2 (14.43,23.3) | 2.15 mm | buck input cap, see M2 |
| U2.2 (18.86,22.95), U2.6 (18.86,24.95) | 1.12, 1.10 mm | tied to EP by 0.3 mm stub; EP vias are the path (acceptable) |
| C6.2 (28.3,26.0) | 1.08 mm | VBAT cap, 1.1 mm stub |
| D5.2 (4.9,21.95), D4.2, D6.2, R15.2, R22.2 | 3.41, 1.87, 1.15, 1.89, 1.74 mm | TVS and pull-downs reach the plane through B or F pour, one thermal-spoke neck |
| U2.28 (21.55,21.76) | 0.98 mm | LSIN/LSOUT ground pins, fine |

- 3V0 pad table: C2.1 1.19, R3.1 1.42, R4.1 1.77, C10.1 1.62, U2.32 1.17 mm edge gap, all with a track-connected via. U2.12 (VDDIO), U1.28, U1.30, U4.9/.10 and J1.6/.7 have vias within 0.4 mm.
- Judgement: plane integrity is good. The F/B pours add nothing for return current and cause the tombstone concern (m7).

## 4. Decoupling proximity (pin pad to nearest capacitor, same net)

| Pin | Net | Nearest cap | Pad gap / centre | Connection |
|---|---|---|---|---|
| U1.28 | 3V0 | C2 (100 nF) | 1.54 / 2.21 mm | through In4 plane |
| U1.30 | 3V0 | C2, C1 (10 uF) | 1.54 / 2.17 mm; C1 2.0 mm | C2 direct 1.5 mm F track (3.6 mohm); C1 through plane |
| U2.4 PVDD | VSYS | C8 (10 uF) | 2.00 / 2.96 mm | direct F track, 2.18 mm. C25 (100 nF) 21 mm, 3 vias (M1) |
| U2.20 VSYS | VSYS | C7 | 2.10 / 2.99 mm | direct F, 2.2 mm |
| U2.19 VBAT | VBAT | C6 | 2.15 / 3.17 mm | direct F, 2.45 mm; C6 GND via 1.08 mm |
| U2.21 VBUS | VBUS | C12 | 2.00 / 3.21 mm | direct F, 2.43 mm |
| U2.22 VBUSOUT | VBUSOUT | C5 | 3.23 / 4.27 mm | direct F, 4.16 mm |
| U2.12 VDDIO | 3V0 | C11 (1 uF) | 1.99 / 2.81 mm | through plane |
| U2.32 VOUT2 | 3V0 | C1 | 3.05 / 3.96 mm | through plane; C10 6.56 mm |
| U2.1 VOUT1 | 1V8 | C9 | 5.40 / 6.31 mm | direct F 5.5 mm (unused rail, ignore) |
| U4.9 / U4.10 | 3V0 | C13 | 1.93 / 2.57 and 2.39 / 3.02 mm | through plane |
| J1.6 / J1.7 | 3V0 | C10 4.07, C11 4.89, C22 6.09, C23 about 6.6 mm | | through plane; panel draws microamps (m5) |

All are within 1.5 to 2.4 mm gap except the buck-related and J1 items. The 2 mm class gaps are not good practice for RF module supplies (target under 1 mm), but with a solid plane and 0.4 mm GND vias it is acceptable for a first prototype. Only the pins using "through plane" rely on 2 vias in series (about 1 nH total plus plane spreading).

## 5. Crystal Y1 (32.768 kHz)

- XL1: 7.36 mm, 2 vias (F to In2 to F around (11.8,16.2) to (13.0,16.9)), 28% over plane voids (via antipads). XL2: 5.18 mm, F only, 0% over voids. Crystal pads Y1.1 (13.15,18.2), Y1.2 (10.65,18.2) and C3/C4 loads at (10.65,20.0), (13.15,20.0).
- XL1 crosses under XL2's F track at about (12.4,16.8) (separated by In1 and the In2 layer). The crystal pads are swapped relative to the module pins, which is why the autorouter needed a layer change. Stray capacitance is likely 1 to 2 pF above the 3.5 pF assumed in design.py (C3/C4 18 pF assume 3.5 pF stray); 32 kHz error is small (a few ppm), acceptable for BLE connection timing but check the frequency on the first board.
- In1 coverage under the crystal block (x 9.4..14.4, y 16.8..20.8): 91% (antipads from the XL1 and SWDIO vias). F GND pour covers only 21% of that area, so there is no guard ring.
- Noisy or active signals within 1 mm: SWDIO via (12.4,16.3) at 0.25 mm from XL2 and 0.29 mm from XL1; ACC_INT via 0.46 mm; I2C_SCL track and U1.16 pad 0.50 to 0.58 mm; MOTOR_N F track 0.80 mm from XL2; NRESET via 0.75 mm. SW2 is 10 mm away. LCD_SCK passes under C4 on In3 (shielded by In1 plane, coupling negligible). With a 32 kHz high-impedance node, aggressors idle at DC (SWDIO), run at 400 kHz (I2C) or kHz PWM (motor); coupling capacitance is a few hundredths of a pF against 12.5 pF. MINOR (m2). Fix: move the SWDIO via at (12.4,16.3) and ACC_INT via (13.4,16.2) 1 mm away; swap Y1 pads so XL1/XL2 do not cross.

## 6. Antenna

Raytac's MDBT50Q spec (Ver.K, section 2.3, readable text): "No Ground Pad should be included in the corresponding position of the antenna in EACH LAYER", keep the no-ground area "as wider as you can regardless of the size of your PCB", place the module "towards the edge of PCB". The keep-out dimensions are figures on pp. 14 to 15, which I could not read. Raytac's keep-out blog post and the "Footprint_Design Guide (230606)" were not readable either.

Measured:

| Layer | Tracks, vias, pads (not U1) at y < 4.0 | Zone copper at y < 4.0 |
|---|---|---|
| F | 0 | 0.00 mm2 |
| In1 | 0 | 0.00 mm2 |
| In2, In3 | 0 | no zones |
| In4 | 0 | 0.00 mm2 |
| B | 0 | 0.00 mm2 |

Only the two 1.6 mm NPTH holes H1 (2.2,2.2), H2 (28.4,2.2) are present (NPTH, no copper). The planes actually stop at y = 4.4 under the module (x 8.8..21.2, module's own keep-out), so the module's full antenna zone (module y 0.125 to 4.45, no pads) is copper-free. Nearest foreign copper: GND tracks at (10.1,4.8), (19.9,4.8) (0.25 mm below the module's first pad row, these are the module's own GND pad stubs), GND via (20.3,4.9) at 0.29 mm. Judgement: the keep-out is correct, and is full board width (30.6 mm).

Under the module body (x 10..20, y 0.8..16.2), outside U1 pads:
- F: short stub tracks from pads to vias (GND, 3V0, ACC_INT, FL_PWM, I2C_SCL/SDA, LCD_*, NRESET, PMIC_INT, SWD*, VIB, XL1, XL2).
- In2: CC1 (13.9,11.0) to (24.7,21.8) (13 mm diagonal), CC2 (11.7,10.0) to (23.7,22.0), I2C_SDA (16.0,16.8) to (13.2,14.0), VIB (18.0,12.5) to (21.9,12.5), XL1 stub.
- In3: ACC_INT (13.7,15.0) to (23.4,5.3), I2C_SCL (20.1,6.1) to (11.5,14.7), SWDCLK (19.7,5.7) to (11.2,14.2), LCD_SCK (11.8,22.8) to (20.3,14.3), LCD_EXTCOMIN, NRESET.
- B: CC1 (13.5,11.0) to (7.5,11.0), LCD_CS (18.2,13.6) to (20.3,11.5), LCD_DISP (15.6,15.8) to (17.8,13.6), SWDIO (19.0,9.7) to (12.4,16.3), pads TP1 (9.5,7.0) and TP8 (20.5,7.0).
- Vias under the body: 14 (3V0 x2, GND x3, ACC_INT, CC1, I2C_SCL, I2C_SDA, LCD_EXTCOMIN, NRESET, PMIC_INT, VIB, XL1).
- Zone coverage under the body: F 45%, B 61%, In1 and In4 73% (signal escape means the planes are perforated by antipads).
- I could not find Raytac wording that forbids planes or vias under the non-antenna part of the module. Open question: if the module body bottom has exposed metal between pads, untented vias under it would short; confirm vias are tented under U1 (m4). In2/In3 routing beneath the module's RF-ground area is usual for modules.

Distances from the module's antenna zone rectangle (x 10..20, y 0.125..4.45):

| Object | Distance |
|---|---|
| J3 metal shell body (x -2.1..8.2, y 5.23..15.77; bottom side) | 1.96 mm lateral (corner (8.2,5.23)), plus 0.8 mm board in z |
| J3 shell stake pads S2/S4 (4.0,4.7), (1.0,4.7) | 5.55 mm |
| BT1 pads | 15.7 mm |
| Cell outline (6.2..25.95, 9.8..35.8; bottom side) | 5.35 mm |
| LCD outline (2.0..28.6, 5.5..35.8; 2.7 mm above the module) | 1.05 mm lateral (M4) |
| J1 pads | 24.05 mm |
| SW1 side switch | 8.96 mm |

M4 is a judgement call: Raytac states no distance I could read. The panel's metal frame 1 mm from the chip antenna end and 2.7 mm above the board is a recognised detuning risk. J3 shell 2 mm away is also metal in the near field; 5 mm or more is the usual wish.

## 7. Signal routing

- LCD_SCK: 19.3 mm, F 0.8 mm then In3 17.3 mm, 2 vias. On In3 it runs 0.83 mm from LCD_MOSI and 1.5 mm from LCD_EXTCOMIN; reference plane In4 (3V0) with 9% of length over antipad voids (longest run 0.48 mm). Fine. The other LCD lines: MOSI 22.6, CS 27.8, EXTCOMIN 21.2, DISP 30.3 mm. At the display's few-MHz SPI no matching is needed.
- I2C: SDA 35.8 mm, 5 vias; SCL 43.1 mm, 5 vias; F and In3 (SDA also In2). About 4 pF per line plus pull-ups 4.7k, fine for 400 kHz.
- SWD: SWDCLK 38.7 mm (In3, 2 vias), SWDIO 37.0 mm (B 10 mm, In2, 3 vias); both through 100 ohm resistors to the pads. Fine for 1 to 4 MHz.
- Parallel runs near the switch nodes: SW2 and SW1 have no neighbour within 0.3 mm over any length except the U2 pad (0.3 mm of overlap at pin 6 and pin 2). No track runs parallel to a switch node for more than 2 mm. VBUS runs on B at y = 24.5 directly under the SW2/L2 track (y = 24.5, x 16.8..18.5), separated by In1 and In4 planes; fine.
- Plane-void crossings: 80.3 mm of 744 mm track (10.8%) runs over a void in its reference plane (F and In2 over In1, In3 and B over In4); longest single run 0.81 mm (FL_PWM at (26.4,10.6)); next 0.75 mm CC1 B (9.1,11.0), 0.66 mm VSYS F (22.8,15.0). Nothing over 1 mm. 3V0 stubs are 57% over void (they are stubs).
- Acute angles: 22 joints under 89 degrees, all on GND and 3V0 stubs near vias (13 at 45 degrees hairpin, 9 at 0 degrees = overlapping segments, e.g. GND F (20.5,21.0), (19.6,22.9)). Cosmetic. m10.
- Dangling track ends: 0 (every end sits in a pad, a via or on another track).
- Vias in pads: 8 centre-in-pad hits, all the 4 intended vias in U2's exposed pad (each counted against the pad and its paste sub-pad). No other via touches a pad. Smallest via-to-pad edge gap for a foreign net: 0.215 mm (ACC_INT via (24.2,5.3) to U4.1). Minimum via hole-to-hole edge gap 0.50 mm (centres 0.7 mm).

## 8. Manufacturing (JLCPCB multilayer, from jlcpcb.com/capabilities/Capabilities)

JLCPCB figures read: outer layer 1 oz 0.09/0.09 mm trace/space; via 0.15 mm hole / 0.25 mm diameter minimum (0.2 mm hole preferred), annular ring 0.20 mm recommended / 0.15 mm absolute minimum (1 oz); via hole-to-hole 0.2 mm, pad hole-to-hole 0.45 mm; copper to routed board edge 0.2 mm; solder mask bridge 0.10 mm (0.13 mm for black or white); silkscreen line width 0.15 mm, text height 1.0 mm, pad to silk 0.15 mm; NPTH 0.5 mm minimum. No general fiducial spec was shown on that page (panel rules only), and no inner-layer minimum was given.

| Item | Present | Limit | Verdict |
|---|---|---|---|
| Track width | 0.20 mm all | 0.09 mm | fine |
| Track to track, same layer, different nets | 0.20 mm (F (15.0,20.7) 1V8 to MOTOR_N; B LCD_CS to LCD_DISP at (18.2,13.6); In3 I2C_SCL to SWDCLK at (20.1,6.1)) | 0.09 mm | fine |
| Track to pad | 0.175 mm (SWDCLK_P to D4.2 at (5.4,24.6); MOTOR_N to C1.1 at (18.7,17.0)) | 0.09 mm | fine |
| Track to via | 0.189 mm (CC1/CC2 at (8.9,10.0)) | 0.09 mm | fine |
| Via to via, edge | 0.207 mm | | fine |
| Via annular ring | 0.15 mm (0.5 mm pad, 0.2 mm drill, 150 vias) | 0.15 absolute, 0.20 recommended | MINOR (m6): at the absolute minimum |
| Hole to hole (vias) | 0.50 mm | 0.2 mm (vias) | fine |
| J3 stake slots 1.1 x 0.5 in 1.5 x 0.9 pads | ring 0.20 mm | 0.15 / 0.20 | fine |
| Copper to edge: tracks | 0.5 mm min (VBUS B at (7.05,16.45)) | 0.2 mm | fine |
| Copper to edge: vias | 0.45 mm | 0.2 mm | fine |
| Copper to edge: J3 contact pads and stakes | 0.20 mm | 0.2 mm | at the limit (m6) |
| Copper to edge: zone fills (all 4 plane/pour layers) | 0.19 mm | 0.2 mm | marginally under (m6): set copper edge clearance 0.25 mm |
| Mask web between QFN/LGA pads (pad gap 0.25 mm, mask expansion 0.025 mm per side) | 0.20 mm | 0.10 mm | fine |
| Silk over copper | 3 DRC warnings: F.Silk lines at (11.2,17.3), (11.2,19.1), (2.2,16.6) | | m9, clipped by mask, cosmetic |
| Fiducials | none | | m8 |
| NPTH holes 1.6 mm (H1..H4) | copper to hole edge: H1 1.25 mm, H2 2.25 mm, H3 0.46 mm (SWDCLK via (2.5,32.7)), H4 3.46 mm | | fine |
| J3 notch 10.3 x 6.3 mm | 0.5 mm radius reliefs on both inside corners; contact pads 0.20 mm from the notch back edge; no other copper within 0.4 mm | routed internal corner radius normally >= 0.5 mm | acceptable; confirm with fab that a 0.5 mm radius corner is routable |

- Thermal relief: F, In1, In4, B zones use thermal reliefs (gap 0.2 mm, spoke 0.25 mm) on all pads and vias. 33 small-passive GND pads (0402/0603 R, C, D) touch an F or B GND pour through spokes while their other pad is on a 0.2 mm track. Combined with the stub-to-via on the GND pad, this asymmetry is a tombstoning risk (m7). Fix: remove the F/B GND pours in a 1 mm band around the small passives, or use 4 spokes of 0.15 mm.

## 9. Mechanical keep-outs (gen_pcb.py)

### 9.1 J3 vs cell (CRITICAL C1)

gen_pcb.py draws the cell outline at x 6.2..25.95, y 9.8..35.8 (nominal 402025, 19.75 x 26.0), on the bottom, "between the USB-C body and the side switch". J3 (bottom) has its own courtyard at x -2.12..8.22, y 5.2..15.8 (body 10.54 wide, extending 1.9 mm past the notch back edge at x = 6.3). Overlap: x 6.2..8.22 (2.02 mm) by y 9.8..15.8 (6.0 mm). Both parts stand about 4 mm proud of the bottom (receptacle 4.21 mm, cell 4.0 mm per the design notes). Moving the cell right by 2.1 mm to x 8.3 runs it into SW1 (courtyard x 26.42..30.82, y 9.14..14.86), BT1 (26.47..30.53, 17.97..24.03) and JP1 (27.22..29.78, 24.72..28.08): no room on this board. Options: a narrower cell (about 17.5 mm wide), deeper notch plus re-planned bay, or re-place SW1, BT1 and JP1. The J3 footprint geometry is the author's own drawing from GCT's layout; check the GCT drawing for the true body extent behind the notch before deciding. The overlap is the author's own two drawings against each other, so I rate it CRITICAL.

### 9.2 Others

- Motor circle (5.3,22.7) r 4.1: 0 vias within r + 0.25 mm; no F pads inside the circle (the programming pads TP2, TP4, TP5 and diodes D4, D5, D6 are bottom side, so no collision with the motor, which is on top). Tracks cross the circle (MOTOR_N (10.7,20.7) to (4.6,26.8)), allowed, covered by mask.
- Cell outline vs bottom parts: J3 (above). R21 (8.1,9.4) and R22 (8.1,11.6) are DNP 0402 fallback resistors on B inside the cell outline (courtyards y 8.44..10.36 and 10.64..12.56 at x 7.61..8.59). Both sit under the cell if fitted (m11). VBUS B track under the cell as noted in 1.1.
- Holes: top pair H1/H2 inside the antenna keep-out, plastic posts only (per the comment), no copper. Bottom pair has copper 0.46 mm (H3) and 3.46 mm (H4) from the hole edge: fine.
- LCD outline starts y = 5.5, so the LCD and the antenna zone do not overlap in plan (1.05 mm gap, M4).

## 10. MINOR list

- m1: Flyback diode D1 at (24,14.8) is 27 mm of track from the motor (loop about 65 mm). Put D1 within 3 mm of M1 or accept at 35 mA.
- m2: Crystal: XL1 has 2 vias and crosses XL2; SWDIO via (12.4,16.3) 0.25 mm from XL2; ACC_INT via 0.46 mm. Fix as in 5.
- m3: TP1 (9.5,7.0) and TP8 (20.5,7.0) DNP test pads on B sit 2.25 mm below the antenna keep-out under the module; VSYS stub to TP8 is 8.3 mm long (22.8,15.4) to (22.8,8.1) to TP8. Move both to y > 10 or remove the stub.
- m4: 14 vias under the module body; verify tenting in the fab notes. Not readable from the PCB file.
- m5: J1 supply pins 4 to 6.6 mm from their capacitors (C22, C23 at (7.7,29.4), (7.7,31.6) vs J1.6/.7 at (14.25,29.15)). Panel current is microamps; acceptable. Move C22/C23 beside the connector if space.
- m6: Via annular ring 0.15 mm (JLC absolute minimum; 0.20 recommended); zone copper to edge 0.19 mm (limit 0.2 mm; set copper edge clearance to 0.25 mm); J3 pads 0.20 mm to edge (limit).
- m7: 33 small-passive GND pads in pour spokes: tombstone risk (see 8).
- m8: No fiducials. For JLC assembly of a 30.6 x 36 mm board, add two 1 mm fiducials on F (e.g. (1.5,34.5) and (29,34.5)) and two on B, and a local pair near U2 (QFN 0.5 mm) if the panel rails do not carry them.
- m9: 3 silkscreen-over-copper warnings (F.Silk (11.2,17.3), (11.2,19.1), (2.2,16.6)); reference designators are on the fab layer, so the board has almost no silk. Add polarity/pin-1 marks for U1, U2, U4, J1 if wanted.
- m10: 22 acute or overlapping segment joints, all in GND and 3V0 stubs. Cosmetic.
- m11: R21/R22 under the cell if ever fitted; VBUS B diagonal under the cell: keep mask intact, add a layer of Kapton under the cell.
- m12: 10.8% of track length over plane voids (longest run 0.81 mm); XL1 28% over voids. No action.
- m13: VSYS In3 section (0.5 oz, 0.2 mm) is rated 0.22 A for 10 C; at the 0.3 A peak 19 C. Fine for the real 150 mA buck input, widen to 0.3 mm if VSYS is expected to carry 300 mA continuously.
- m14: Single-via paths: VBAT (JP1 to U2.19) via (29.2,24.9), 3V0 into the plane from L2.2 via (13.9,26.0). Add a second via on each.

## 11. What I judge acceptable for a first engineering prototype, and why

- Antenna: copper-free at y < 4.0 on all six layers, zone clear to y 4.4 under the module; matches Raytac's one readable rule (no ground in the antenna area on each layer).
- Planes: In1 and In4 continuous (90% and 87% fill), no split over 5 mm, all voids are plain via antipads; every IC ground pin and every capacitor ground pad has its own via at 0.3 to 0.5 mm. That is better than most first spins.
- Switch node SW2: 1.84 mm, over solid In1, no neighbours.
- Power DC: worst drop 55 mV at VBUS 500 mA, 7 mV at VBAT 300 mA, 19 mV motor loop; worst temperature rise 4 C outer, 13 C inner (shared branch). No DC power fix is required.
- Signals: SPI 19 mm, I2C 36 to 43 mm, SWD 37 to 39 mm: all well within what their speeds tolerate. No dangling stubs.
- Manufacturing: all minima are above JLC limits except the three at-the-limit items in m6. Via-in-pad only in the EP, as intended.
- Not acceptable as is: C1 (mechanical), M1 and M2 (buck input decoupling placement), M3 (surge diode placement), M5 (EP via wicking). The rest can ride into the first build.

## 12. What I could not check

- Raytac keep-out dimensions (figures only) and Nordic's reference-layout numbers (images only); GCT's receptacle drawing; the real cell outline.
- Via tenting, mask openings and stackup dielectric thickness (not in the PCB file); loop inductance and ESD current are hand estimates, not simulation.
- Any RF, EMC or SI behaviour; temperature numbers are IPC-2221 estimates.
