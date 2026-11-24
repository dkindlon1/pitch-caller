# PitchIQ watch rev E: independent final audit (e3)

Auditor: fresh reader, read-only. Nothing is built; no statement here says a part works, seals or was tested. Scratch: /tmp/e3audit.
Tags: MEASURED (how) / FROM FILE (path) / NOT CHECKED.

## Findings

### CRITICAL

**C1. Every manufacturing file in out/fab is stale: it is the pre-re-route (rev D placement) board.**
- MEASURED (mtimes): kicad/pitchiq_watch.kicad_pcb 22:58:29. All 17 Gerbers/drills + pitchiq_watch-pos.csv are 20:54:25-26, i.e. 2 h older. Only bom_jlcpcb.csv and cpl_jlcpcb.csv are 22:59:36, but gen_bom.py:62-64 builds the CPL from the stale pos.csv.
- MEASURED (kicad-cli pcb export gerbers/drill of the current board into /tmp/e3audit/g, diff against out/fab/gerber ignoring date lines): all 15 layer files, both drill files and Edge_Cuts DIFFER (e.g. F_Cu 14642 diff lines, In4 9001, PTH.drl 280). Only the .gbrjob matches.
- MEASURED (pcbnew vs cpl_jlcpcb.csv, 46 rows): 20 of 46 rows are at the wrong place: U2 off by (-3.3,-1.3) mm, L2 (-10.3,-4.9), C8 (-6.6,-6.25), C10 (-13.7,-7.6), C25, C5, C6, C7, C11, C12, C21, C22, C23, R1, R2, R3, R4, R9, R10, RT1. U2's CPL rotation is 0 while the board has it at 90. 26 rows match.
- Cause (FROM FILE scripts/export_fab.sh, scripts/check.sh:26): export_fab.sh was not re-run after the router; check.sh only tests that the files are non-empty, so "CHECK: PASS" does not see it.
- The two bottom-silkscreen polarity marks ARE in the board file (MEASURED, grep: gr_text "-" at (126.2,96.3) and "+" at (126.2,99.5), layer B.SilkS; they sit at the BT1 GND and BATP pad rows) but the shipped B_Silkscreen.gbo is the 20:54 one (176 lines; a fresh export has 184).
- Fix: run `scripts/export_fab.sh` then `scripts/gen_bom.py`; add to check.sh (a) every out/fab file newer than the .kicad_pcb, (b) a CPL-vs-board coordinate/side compare (my script: /tmp/e3audit/dump.py plus the compare in this report). Then re-diff a second fresh export against out/fab. Re-verify U2/U4/D1/D2 CPL rotations in the assembler's preview (U2 was turned 90 degrees in rev E; the CPL rotation has never been checked for the new orientation).
- Matrix rows affected: E2 (PASS -> FAIL), B12 (BLOCKED, add the staleness).

### MAJOR

**M1. docs/MATRIX_revE.md E2 says PASS for "fabrication outputs regenerated from the rev E board"; it is false (see C1).** Fix: set E2 to FAIL until C1 is closed; then cite the new timestamps.

**M2. Sourcing: the power chip U2 (LCSC C7501206) is in the machine BOM and CPL but has 0 stock at LCSC.** FROM FILE scripts/design.py U2 desc ("LCSC 0 stock Nov 23: buy at DigiKey/Mouser") and out/fab/bom_jlcpcb.csv. An assembled order stalls or the line is dropped. Fix: decide before ordering: either consign U2 (and say so in the order) or order bare boards plus hand assembly; put "customer-supplied" in the notes for U2 in FAB_NOTES_revE.md.

**M3. Display connector land pattern is unverified for the part that is specified.** FROM FILE design.py J1 desc: "Land pattern assumed equal to the bottom-contact FH12-10S footprint ... not checked on Hirose's drawing"; the part ordered is the top-contact FH12A-10S-0.5SH(55). MEASURED: pads are at x 13.05..17.55 y 23.55 (pitch 0.5, 1.3 mm long), MP pads at (11.15,26.8) and (19.45,26.8). Not checkable offline. Fix: before ordering boards, put Hirose's drawing for FH12A-10S-0.5SH(55) next to the footprint and check pad length, MP position and body depth (the CAD uses 5.6 deep, 2.0 high, "SEEN on KiCad's 3D model", not Hirose's).

### MINOR

**m1. Buck output sense and loop (not a violation I can show to fail; unverified against Nordic's reference layout).** MEASURED (own copper graph, /tmp/e3audit/paths.py, tracks split at T-junctions; connectivity cross-checked by pcbnew with a removed-track control that raised the unconnected count 0 -> 1). All power tracks are 0.2 mm wide, 152 vias 0.5/0.2.
| Pin to cap pad | Copper length | Width | Vias | Note |
|---|---|---|---|---|
| U2.4 PVDD to C25 | 1.17 mm F.Cu | 0.2 | 0 | ok |
| U2.4 PVDD to C8 | 3.90 mm F.Cu | 0.2 | 0 | ok |
| U2.2/U2.6 PVSS1/2 to ground | no track; both pad centres lie inside the F.Cu GND pour (HitTestFilledArea true); EP has 4 vias (23.7/25.5, 24.6/26.4) | | | ok |
| U2.5 SW2 to L2.1 | 2.20 mm F.Cu | 0.2 | 0 | ok |
| L2.2 to C10.1 | 1.98 mm F.Cu | 0.2 | 0 | ok |
| U2.32 VOUT2 to 3V0 | 0.4 mm to a via at (21.4,27.3), then the In4 plane, then via (24.8,31.5) to L2.2/C10 (~5.4 mm in-plane) | 0.2 | 2 | goes through a via before reaching the cap; L2/C10 are 3.8 mm south of the pin |
| U2.21 VBUS to C12 | 2.85 mm | 0.2 | 0 | ok |
| U2.22 VBUSOUT to C5 | 3.06 mm | 0.2 | 0 | ok |
| U2.20 VSYS to C7 | 3.02 mm | 0.2 | 0 | ok |
| U2.19 VBAT to C6 | 3.53 mm | 0.2 | 0 | ok |
| U2.12 VDDIO to C11 | 2.20 mm | 0.2 | 0 | ok |
- No path is longer than 5 mm except the VOUT2 plane route. The buck loop (C8/C25, PVDD, SW2, L2, C10, GND pour back to PVSS2) is about 4 x 5.6 mm in outline: acceptable, not tight, because C10 sits 3.8 mm south of L2.
- PVDD (pin 4) reaches the VSYS pin (20) only by 13.5 mm of 0.2 mm track on B.Cu with 2 vias (via (25.0,20.9) -> B.Cu under U2 -> via (24.5,29.8)); the buck's local caps C8/C25 are at PVDD, bulk C7 at pin 20. Resistance about 0.07 ohm; not a failure, but the supply impedance seen by the buck input is higher than the layout looks.
- SW2 (2.2 mm, F.Cu only): nearest foreign copper C25.1 (VSYS) at 0.19 mm, U2 pads at 0.52-0.58 mm; the only other-layer copper under it is the B.Cu VSYS track with In1 ground between. Crystal (y 18), accelerometer (y 7), ACC_INT and antenna are all > 10 mm away. MEASURED.
- Fix (optional): add a short F.Cu track from pin 32 to L2.2/C10.1 or move C10 next to pin 32; widen the PVDD feed to 0.3 mm or add a second via pair.

**m2. Battery, motor, USB paths.** MEASURED (graph above). BT1.1 (BATP) to JP1.1: 13.03 mm, 0.2 mm, B.Cu only, 0 vias. JP1.2 to U2.19: 12.2 mm, 1 via; JP1.2 to C6.1: 11.6 mm, 1 via (the via at (25.7,21.1) joins the short F.Cu tree to C6/pin 19). Motor: M1.1 (VSYS) to U2.20 36 mm with 4 vias; M1.2 to Q1.3 32.6 mm with 6 vias (F, B, In2, In3); Q1.3 to flyback D1.2 4.2 mm but D1.1 to M1.1 40.8 mm: the flyback diode is about 25 mm from the motor, so the inductive loop is long. Q1.2 ground via the pour. USB: J3 B9 to D2.1 3.8 mm (1 via), A9 to D2.1 9.6 mm (5 vias), D2.1 to U2.21 21.4 mm (2 vias). CC1/CC2 to U2 22.6 / 23.4 mm with 1 / 5 vias. All DC or 35 mA-class currents at 0.2 mm (about 0.07-0.09 ohm); I judge them adequate, bring-up should measure the drop under motor load (matrix B11 is consistent).

**m3. Planes and edge.** MEASURED (pcbnew filled polygons, unfractured): In1 GND has 67 holes, largest 4.82 mm2 (1.14-4.76 x 32.75-34.85, around H3), 3.48 (27.3-29.5 x 32.75-34.85), 3.16 mm2 (13.14-14.86 x 15.75-19.15, five vias beside crystal pad Y1.1: 3V0, ACC_INT, CC2, NRESET, PMIC_INT); under U2 one 0.64 mm2 antipad; under L2 none. In1 outline starts at y = 4.0 (no plane under the antenna strip, as designed). NOT CHECKED: In4 (3V0) continuity. No track or via on any layer at y < 4.45 (antenna zone): none; In2/In3 tracks nearest the zone start at y = 5.6. Copper within 0.2 mm of the outline: only J3 pads (exactly 0.20 mm, as the fab note says) and the four 1.6 mm NPTH holes H1-H4: hole wall to the chamfered corner is 0.19 mm (arithmetic: centre (2.2,2.2), chamfer x+y=3). Ask the fabricator whether 0.19 mm hole-to-edge is accepted, or move H1-H4 0.1 mm inward (gen_pcb.py).

**m4. Crystal.** MEASURED. XL1: U1.17 to Y1.1 2.0 mm F.Cu; U1.17 to C3 5.2 mm (route loops west round the crystal, 0 vias). XL2: U1.18 via In2 (2 vias, 1.8 mm on In2) to Y1.2, about 5 mm, and Y1.2 to C4 1.6 mm. The two nets cross over each other's cap (XL1's cap is on the XL2 side). The XL2 via (11.5,17.4) and a 0.57 mm F.Cu stub lie under the crystal body between its pads; adjacent layer In1 is ground except the void in m3. For 32.768 kHz this is a small stray-capacitance error, not a function problem; design.py assumes 3.5 pF stray. Fix (optional): swap C3/C4 sides or the crystal pad order.

**m5. New test pads and CC resistors.** MEASURED. Nets correct (pcbnew vs design.py, 248 pad nets, 0 differences). No pad-to-copper gap below 0.12 mm anywhere on the board in my own clearance check (the only hit is SW1's own library pad vs shield pad, 0.075 mm, inside one footprint). Stubs (graph): TP10 SDA about 21 mm, TP11 SCL about 21 mm (In2/In3 + vias), TP12 EXTCOMIN about 11 mm, TP13/TP14 UART 22/20 mm dedicated, TP9 VBAT about 22 mm on In2 (an exposed 1 mm pad straight on the cell node, no series resistor), R21 CC1 0.8 mm, R22 CC2 0 mm. R21/R22 are unfitted (BOM and CPL: not present). All TP9-15 are under the glass and the tail's return run; only reachable before the display is mounted.

**m6. Tail path length is understated by the CAD check.** MEASURED (own slices of cad/step/lcd_fpc.step at x = 15.3): upper run z 2.70-2.82, lower run z 1.38-1.50, so run centres are 1.32 apart and the fold mid-radius is 0.66 (inner radius 0.60), not 0.60 / 0.54 as build.py uses (z_run = z_lcd0 - 2R - t). Arc 2.07 mm, not 1.885; the dive from z 1.44 to 0.55 over the 1.5 mm run is 1.74 mm long, not 1.62. My total: 13.105 + 0.19 + 0.12 = about 13.41 mm, slack about 0.22 mm (cad/report.md says 0.53). Still not negative, and Sharp gives no tolerance on 13.63. Fix: build.py line 70: use the true centre separation and dive hypotenuse; require slack >= 0.4 or reduce a0/R.

**m7. Silk marks and cell.** MEASURED. The "+"/"-" marks are at x = 26.2, the cell edge is x = 26.35: they sit at/under the cell edge and are covered once the cell is in. They are visible only before the cell is placed. Fix (optional): move to x = 25.4 beside the pads on the free side, or print the polarity on the cell foam.

**m8. Firmware: nothing blocking.** FROM FILE: power.c:165 writes CHGR_EN_CLR (0x05) before the ISET burst (166) and EN_SET (183) only if charging-enable; BUILD_ASSERT ranges; error retry max 5. Normal build: every bring-up hook is under IS_ENABLED(CONFIG_PQ_BRINGUP) (ui.c:102,112,118; ble_pq.c:310; app_glue.c:278; main.c:109,146), bringup.c and haptics_buzz_ms are compiled only with the option (CMakeLists.txt:23, haptics.c:91); board defconfig has SERIAL/CONSOLE/UART_CONSOLE = n and the UART overlay is only in app/bringup.overlay. Bring-up build runs a second I2C user (tick_work on the system workqueue: accelerometer, mfd reads) beside power.c; every access is a single register transaction (no read-modify-write), so no corruption path seen, but there is no application-level lock: NOT CHECKED against the TWIM driver's own locking. No buzz or log call from interrupt context found in the bring-up hooks (app_glue.c:278 is in the event switch; I assumed a thread: NOT CHECKED which). Build logs vs sources (MEASURED mtimes): sources latest 23:04:42 (bringup.c 23:07:13), logs pitchiq 23:05:18, dk 23:05:44, core 23:05:44, bringup 23:07:30: logs newer. Warnings: 2 per build (default MCUboot debug signing key; CMake warning at CMakeLists.txt:343, text not read). All four logs end EXIT 0.

**m9. Sourcing facts.** MEASURED: 46 CPL rows = every machine-placed, non-DNP part in design.py; none DNP or hand-fitted in the CPL (U1, J1, J2, J3, M1, BT1, JP1, test pads, H1-H4 excluded); no duplicate designators (71 footprints, 71 unique); every CPL part has an LCSC number (check_output.txt says so; the fab BOM has 23 unique lines); 38 top / 8 bottom. Basic/extended split: NOT CHECKED (cannot see LCSC offline).

## Connector J1 (check 7)

Read from the Sharp drawing p.23 fig. 8-1 (/tmp/e1conn/sharpimg/p25-25.png):
- Display-side-up view: the tail hangs from the lower glass edge; terminal numbers (10 on the left, 1 on the right) are on the right-hand end. So terminal 1 is on the RIGHT seen from the display front.
- The stiffener (hatched, 5.5 x about 4 mm) is drawn on the front view and the contact fingers on the "Back side up" view: contacts are on the BACK face.
- Length 13.63 mm from the glass edge; neck 9.47 mm wide (8.565 + 9.47 = 18.035 from the left, mirror of 26.6), stiffener 5.5 mm; "13.3" is the glass centre line and the tail is symmetric about it: centred. Thickness 0.3 at the stiffener.
- Remark 8-1: do not bend toward the polarizer; Fig 8-2 folds it under the back. A fold about the glass lower edge keeps x, so terminal 1 stays east; the back face (contacts) ends up facing UP toward the glass. Sharp lists the SMK top-side contact connector (CFP-4510-0150F) for that arrangement.
- MEASURED J1 pads: pad 1 at x 13.05 (west) ... pad 10 at 17.55 (east), row y = 23.55; pad nets: 1 GND, 2 GND, 3 LCD_EXTMODE, 4 3V0, 5 3V0, 6 LCD_DISP, 7 LCD_EXTCOMIN, 8 LCD_CS, 9 LCD_MOSI, 10 LCD_SCK. With terminal = 11 - pad: T1 SCLK pad 10, T2 SI 9, T3 SCS 8, T4 EXTCOMIN 7, T5 DISP 6, T6 VDDA 5, T7 VDD 4, T8 EXTMODE 3, T9 VSS 2, T10 VSSA 1. All ten match Sharp's list and the schematic nets.
- Conclusion: design.py's mapping is consistent with a tail that leaves the lower glass edge, folds 180 degrees under the glass and enters a top-contact connector with its slot toward the lower board edge. Confidence about 85% on the face/side/fold (drawing is clear on terminal side and tail, my inference on contact face from stiffener vs finger views is the weakest link), about 90% on the numbering given the pad x positions, the pad numbering of the Hirose part does not matter because the board pads fix the physical contact x positions. The remaining doubt is M3 (land pattern equal for FH12A) and the cable-slot direction at rotation 0 (taken from the designer's 3D-model sections; NOT CHECKED by me beyond reading the KiCad footprint: pad row y = 23.55 = origin - 1.85, body spans y 24.2-29.8 toward the lower edge, which agrees).
- If the other way were true: (a) contacts on the FRONT face would need a bottom-contact connector and the pad nets would be unchanged but the tail cannot lie contact-up: the display would show nothing; (b) terminal 1 on the west would put SCLK on pad 1 and VSSA on pad 10, driving GND/3V0 onto signal terminals and signals onto the display supplies: possible damage to the display or the chip's pins. Mitigation already in the files: power-off continuity check of pads 1 and 2 (T10/T9 = panel VSS) before first power.

## Mechanical (checks 9-11)

- 9. MEASURED (CadQuery 2.8.0, every STEP in cad/step and cad/step_mjf, bbox-pruned boolean intersect, threshold 0.005 mm3, in /tmp/e3audit/cadchk.py): nominal preset overlaps: button_pad/button_plunger 0.377, case/cover_screws 1.665, fpc_connector/lcd_fpc 5.445 mm3 (all marked intended in cad/report.md); MJF preset: case/cover_screws 1.665, fpc_connector/lcd_fpc 5.445 only. No other overlap in either preset. lcd_fpc minimum distances: case 0.48, lens 0.77, parts_under_tail 0.30, pcb 0.40, back_cover 5.78; touches lcd (0.00, attached at the glass edge). Tail x 10.56-20.04 (centre 15.3 = J1 x = glass centre line 2.0 + 13.3) MEASURED. Tail reaches board y 37.42, 1.42 mm beyond the 36 mm board edge (it is the fold; the case aperture is lengthened for it: FROM FILE build.py:73).
- Board file vs tail: top-side parts under the return run (x 10.56-20.04, y 26.5-37): only 0402s R3, R4, R9, R10, C21, C22, C23 (all y 30.7-32.8) and TP10-TP15 flat pads; none taller than 0.55 mm; the return run underside is at z 1.38, the dive reaches z 0.40 only for y 26.5-30.3, which has no parts except J1. Heights (FROM FILE CAD envelopes and BOM): U2 0.9, 0603 0.9, 0805 inductor MLP2012H about 1.0 (NOT CHECKED against TDK's sheet), J1 modelled 2.0: all below the glass underside z 2.70; U2 sits under the glass with 1.8 mm to spare; L2 is not under the tail (x 25.4-26.2).
- 10. NOT CHECKED independently: button gland walls, O-ring squeeze (report: 0.06 mm worst case vs 0.04 required), gasket groove fill (report 12%), lug webs (1.45), screw head floor (0.65), pins (0.10 clearance), port-plate 0.62/0.84. Only cad/report.md was read; the STEP volumes in it match the file sizes' ordering but I did not section the case.
- 11. MEASURED (cell.step bbox, board file): cell x 6.6-26.35, y 9.8-35.8 (board), z -5.1..-1.3, board underside z -0.8: 0.5 mm foam gap. BT1 pads (28.5,16.3)/(28.5,19.5) extend x 27.0-30.0, JP1 x 27.2-29.8, SW1 x 26.4-30.8 y 9.1-14.9: all clear of the cell's x range except SW1's courtyard edge (26.4 vs 26.35: 0.05 mm, in x only; its z range -4.1..-0.8 is within the cell's z range; the cell/side_switch distance in the report is 0.80, so the real body is farther than the courtyard). Bottom-side parts now under the cell footprint: none except J3's tails (x to 7.55, 0.30 mm below the board, 0.20 mm above the cell: cad/report.md "cell / usb_c 0.20"). B.Cu tracks and pour do run under the cell (BATP, VBUS, VSYS, VBAT; 0.5 mm foam).

## Matrix audit (docs/MATRIX_revE.md)

Rows I dispute or qualify:
- E2 PASS -> FAIL (C1).
- B12 stays BLOCKED but must also say the CPL is stale and U2's rotation changed with the 90 degree turn.
- C5 "slack 0.53 mm" is overstated: about 0.22 mm by my arithmetic (m6); stays BLOCKED on the real tail.
- B5 PASS (files): true for 9 of 10 pin-to-cap paths; VOUT2 reaches L2/C10 only through two vias and the In4 plane (m1). Acceptable as PASS with a note.
- B3 PASS: independently reproduced (248 pad nets, 0 differences). B2 PASS: reproduced (my connectivity: 0 unconnected, with a control); kicad-cli 7.0.11 has no `pcb drc` command (only `export`), so I read out/drc_report.txt: its time 22:59:36 is newer than the board 22:58:29. I did not re-run KiCad DRC; my own copper clearance check found nothing under 0.12 mm. B8 PASS: reproduced. B10 PASS: reproduced. C1 PASS: reproduced for both presets.
- A3 stays BLOCKED (correct). D1-D5 PASS (compiles): logs newer than sources, EXIT 0.
- B11 "rev E routing is new, final audit looks at the power paths": done here; no fail.
Requirements missing from the matrix: (1) fabrication files freshly derived from the board (current file freshness check); (2) CPL coordinates equal board; (3) FH12A land pattern and body depth/height; (4) U2 availability (0 stock); (5) hole-to-edge for H1-H4; (6) polarity marks present in the shipped silkscreen Gerber; (7) module radio certification in the enclosure (not a design-file item; NOT CHECKED); (8) JP1 starts open: the battery is not connected until it is bridged (FROM FILE FAB_NOTES: "bridge last"); the bring-up must say so (not audited).

## What I could not check
- In4 3V0 plane continuity; mask/silk/drill/annular rules (only my own copper-clearance and edge distances; KiCad DRC could not be re-run, kicad-cli 7.0.11 has no drc).
- Hirose FH12A drawing, TDK MLP2012H datasheet, Nordic reference layout; fabricator and assembler capabilities (0.8 mm at 6 layers, filled vias, 0.19 mm hole-to-edge, panel); LCSC basic/extended split.
- Detailed gland / gasket / lug / screw / pin / port-plate measurements in the case solids (check 10).
- Whether the TWIM driver serialises the second I2C user; which thread runs the button event handler; the text of the CMake warning at CMakeLists.txt:343.
- docs/BRINGUP_revE.md (excluded), docs/SUPPLIERS_revE.md and power_budget.md contents.

## Verdicts
- (A) Buying sample components: GO. Nothing here depends on the stale files. Buy U2 at DigiKey/Mouser (not at LCSC), the FH12A-10S-0.5SH(55), the 25 V 10 uF 0603 parts, spares of 0402s.
- (B) Ordering the five boards, bare or assembled: NO-GO until C1 is closed (re-export Gerbers/drill/pos/CPL from the 22:58 board, re-diff, fresh CPL-vs-board check, placement preview for U2 and the polarised parts) and M3 (land pattern) is checked. Assembled also needs M2 (U2 consigned or hand assembly) and the open supplier answers (matrix B13/B14). After that: GO for bare boards; assembled GO only with supplier confirmation.
- (C) Printing a fit-check enclosure: GO. Interference is clean in both presets (MEASURED), the board-to-case relationships and tail clearances hold; do not read the print as proof of the tail length (m6) or of any seal.
- (D) Assembling a complete functional prototype: NO-GO now: needs correct boards (C1), parts (U2, display with its 28-week lead, motor out of stock until January per MATRIX E3), J1 land pattern (M3), and the bring-up run on real hardware; the firmware has never run on hardware.
- (E) Before production: close C1 and add a fab-file freshness gate; one real board through bring-up (rails, charge from a flat cell, I2C, display with the real tail and a continuity check of J1, crystal frequency); real panel for the tail path and J1 pin order; Hirose/TDK/Nordic checks above; the seal and strap tests; supplier capability answers; replace the MCUboot debug signing key; sort the m1-m7 layout items (VOUT2 sense, PVDD feed, flyback distance, hole-to-edge).
