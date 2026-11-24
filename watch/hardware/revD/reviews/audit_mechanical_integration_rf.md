# Independent final audit: mechanical + RF/Bluetooth + electromechanical integration, PitchIQ watch rev D

Auditor roles: mechanical design engineer, RF/Bluetooth engineer, integration reviewer. Read-only except this file. Nothing here was built, printed or fitted; every statement is geometry on paper.
Tags: MEASURED (my own script on the STEP files in cad/step/*.step via CadQuery/OCC, or on the .kicad_pcb via pcbnew; scratch scripts in /tmp/aud), FROM FILE (named file read), NOT CHECKED, plus finding classes CRITICAL DEFECT / MAJOR RISK / MINOR / UNVERIFIED ASSUMPTION / PHYSICAL-TEST DEPENDENCY.
Board coordinates (x,y) as in params.py; z=0 board top, +z to the lens; CAD Y = 36 - y. "board y" is used below unless "CAD Y" is stated.

## 0. Verdict in one paragraph

NO-GO for ordering the case set as the files stand (boards: GO, see section 9). The model is genuinely parametric and mostly consistent with the board file, and the envelope is honest. But my own measurements found one geometry defect that makes the port plate unmanufacturable and unseals the case-back gasket across it (pocket leaves 0.02 mm of plate below it), a locating-pin scheme that will bind or not fit with MJF tolerances (0.075 mm radial clearance, pins held by two different parts), a button chain that cannot work within +/-0.35 mm against 0.2 mm switch travel (and has no O-ring gland in the model at all), a display-flex fold that starts 0.6 mm from the glass edge against Sharp's 0.8 mm minimum, an assembly sequence that has the display tail latched onto a connector that then has to move 1-2 mm, and several features below printable size. All are fixable in params.py / build.py; none needs a board change. After those fixes, ordering a fit-check print is justified; the unknowns that remain are physical tests (list in section 8).

## A. Model fidelity

Method: imported all 23 STEP parts, compared bounding boxes and volumes with cad/report.md (case 3314.5 vs 3315, lcd 596.4, pcb 816.8: STEP matches the report, so the STEP files are not stale), compared positions with the .kicad_pcb footprints.

| Item | In CAD? | Verdict |
|---|---|---|
| PCB 30.6 x 36 x 0.8, R3 corners, USB notch (0..6.3, 5.35..15.65), 4 x 1.6 holes | yes, from gen_pcb.py (imports G.NOTCH, G.HOLES, G.PLACE) | MEASURED: bbox x0..30.6, y0..36, z -0.8..0. Matches board file. |
| BLE module 10.5 x 15.5 x 2.05 | yes, box at U1 (15.0, 8.4): x 9.75..20.25, board y 0.65..16.15 | MEASURED. Matches footprint centre and Raytac outline (research A3). Antenna keep-out only as a marker volume, not exported (MARKERS), so it takes part in no check. |
| Display 26.6 x 30.3 x 0.74 at (2.0, 5.5) | yes | MEASURED x 2.0..28.6, board y 5.5..35.8, z 2.70..3.44. Matches Dwgs/Cmts_User outline in the board file. Active area (23.04) is NOT modelled, and its offset inside the glass is NOT FOUND (Fig 8-1 unread): UNVERIFIED. |
| Display flex + connector J1 | yes but drawn as three square boxes (6.0 x 0.12), connector body 9.0 x 5.6 x 2.0 | Fold is drawn square; connector height 2.0 is EST (Hirose FH12 data NOT FOUND); flex tail width/length EST. See B3. |
| Battery | yes, box 19.75 x 26.0 x 3.8 at (6.6, 9.8), z -5.1..-1.3 | MEASURED. Matches Dwgs_User cell outline. Leads, protection board, tab and lead exit NOT modelled (NOT FOUND for any cell). |
| USB-C receptacle | yes: flange 10.54 x 4.76 x 0.6, body 9.94 x 4.46, nose 8.34 x 2.56 x 1.90, tails | MEASURED bbox x -2.125..7.55. Flange thickness 0.6 is EST; see A-note 1. |
| USB gasket | yes: 10.64 x 4.86 outer, 8.94 x 3.16 inner, drawn compressed 0.975 | MEASURED x -1.20..-0.225 (0.975 = 35 % of 1.50). OK. |
| Port plate + pocket + opening | yes | MEASURED: pocket 11.00 x 5.90, depth 0.90; opening 9.14 x 3.36. Defect in B/D: the pocket leaves 0.02 mm below it. |
| Side switch | yes: body 2.56 x 4.5 x 3.3 + stem to x 30.54 | MEASURED from STEP; checked against the KiCad Alps SKRTLAE010 footprint Fab layer (body 4.5 x 2.56, stem 2.0 wide to 2.04 from origin): in plan it matches (stem tip at 28.5 + 2.04 = 30.54). Height 3.3 and the plunger axis (zb - 1.6) remain EST. |
| Motor | yes, cylinder d8 x 2.1 at (5.3, 22.7), z 0.05..2.15 | MEASURED. Matches MOTOR keep-clear circle. Motor leads and pads (M1 at 3.2, 28.2) NOT modelled. |
| Accelerometer | yes 2 x 2 x 1.0 at U4 (24.5, 6.9) | MEASURED. Matches. |
| PMIC | yes 5 x 5 x 0.9 | OK |
| Main case, back cover | yes | OK; see structure |
| Display window, lens, lens adhesive | yes | Adhesive is modelled only on the ledge, not as the frame between glass and lens that the assembly sequence says holds the display. |
| Button plunger + O-ring | plunger yes; O-ring NO | The "O-ring" is a tube of OD 2.14 / ID 2.00 / 0.5 long (volume 0.2 mm3) in a 2.15 bore. There is no gland groove anywhere in the case. The seal is not modelled. MAJOR (B/C). |
| Case-back gasket | yes, ring in a 0.35 groove | OK; crossing of the port plate is a problem (D). |
| Screws | yes, 4 plain shanks (thread root), heads in counterbores | No threads, no catalogue part (EST). |
| 20 mm lugs, spring bars, strap | yes: lug_gap 20.0, bars 1.8 body / 0.9 tips, strap 20.0 x 3.0 x 14 stub | Strap is modelled 19.8 wide in a 20.0 gap; MECH says "model 20.2". The params value is 20.0. See C-strap. |
| Programming pads TP2-TP6, D4-D6, R17-R20, BT1/JP1 pads, TP1/TP8, all passives, module pads | NOT modelled | The check script cannot see them. I checked them myself (B2). |
| Plug overmould envelope | NOT modelled | I checked it by arithmetic (D). |

A-note 1: flange 0.6 thick puts it at x -0.225..+0.375 with the notch 10.30 wide and the flange 10.54 wide, so 0.12 mm per side of flange lies inside the board for x 0..0.375 and z -0.8..-0.25. MEASURED intersection pcb/usb_c = 0.050 mm3 (build.py lists it as "intended: the receptacle body sitting in the board notch"; it is not the body, it is the flange ears). The drawing implies the flange front sits 0.20 in front of the board edge, so the true flange thickness may be about 0.2 (then no overlap). UNVERIFIED ASSUMPTION; fix: set `usb_flange=(10.54, 4.76, 0.20)` until measured, and delete ("pcb","usb_c") from PRESS so a real overlap is reported.

## B. Interference, clearance, kinematics (measured)

### B1. All solid pairs (own pairwise intersection, any volume above 0.001 mm3), MEASURED
Overlaps: lcd_fpc/fpc_connector 1.008 (cable in connector, intended), usb_c/pcb 0.050 (A-note 1), case/cover_screws 0.856 (thread in pilot, intended). Nothing else. Matches build.py, so the model has no hidden solid collisions among modelled parts.

Distances I measured (mm): cell-usb_c 0.200; cell-back_cover 0.400; cell-pcb 0.500; cell-side_switch 0.800; lcd-case 0.200; lcd-lens 0.150; lcd-motor 0.550; lcd-ble 0.650; lcd_fpc-lens 0.770; lcd_fpc-case 0.500; usb_c-back_cover 0.590; usb_gasket-back_cover 0.540; usb_gasket-pcb 0.268; port_plate-case 0.400 (bond gap); plunger-switch 0.040; plunger-case 0.050; spring_bars-case 0.050; spring_bars-back_cover 0.304; strap-case 0.100; strap-back_cover 0.100; case-side_switch 0.603.

### B2. Parts the model leaves out (from the board file; heights are my typical-package assumptions)
Top side: L2 0805 inductor, C6/C7/C8/C10/C24/C1 0603 10 uF, Q1/Q2 SOT-23, D1/D3 SOD-323, D2 SOD-123F, Y1 3215 crystal, U4, J2 pads. All are 1.0 to 1.2 mm tall at most, glass underside is 2.70: at least 1.5 mm clear (MEASURED underside; heights EST). Only module (2.05), motor (2.15) and J1 (2.0 EST) approach the glass (0.65 / 0.55 / 0.70 measured). Wires on M1 and J2 pads are unmodelled but have 2.7 mm.
Ribs and pins vs top parts: left rib x -0.3..1.5, y 30..33 and right rib x 29.1..30.9 are clear of M1 pads (y up to 29.1) and of everything else (FROM FILE: footprint boxes). Nearest top part to a case pin shoulder (d2.6 at (2.2,2.2) and (28.4,2.2)): D3 at 1.2 mm. Fine.
Bottom side: everything except the cell, SW1 and the USB-C lies outside the cell footprint (x 6.6..26.35, y 9.8..35.8): D4-D6 and R17-R20 at x <= 5.9, TP pads at x 2.4, BT1/JP1 at x >= 27.0, TP1/TP8 at y <= 8.3. No unmodelled bottom part sits under the cell (FROM FILE, footprint boxes). Smallest gap cell to D4-D6: 0.7 mm in x.
- Cover posts (d3.0 at (2.2,33.8) and (28.4,33.8)) vs R20 (1.0 x 0.5 at (2.6,31.9)): about 0.15 mm lateral (corner of 0402 pad to post wall, my arithmetic); with MJF position +/-0.25 it can touch. MINOR: move R20 +0.5 in x or shrink `post_d` to 2.4.
- Cover pins (d1.45, top at z 0.4) vs the left rib corner (1.5, 33.0): 0.34 mm diagonal (arithmetic). OK.
- Battery pads BT1 span x 27.0..30.0, cell edge is 26.35: 0.65 mm for the solder and wire bend. Lead exit of the cell is NOT FOUND. The Adafruit cell has a 127 mm JST lead: it must be cut and soldered, and the lead has to pass the strip x 26.35..30.6 that also holds SW1 and JP1. UNVERIFIED.

### B3. Display flex path (physics)
MEASURED from lcd_fpc: leaves the glass edge at board y 35.8, reaches board y 37.1 (loop reach 1.3 mm = fpc_loop 1.6 - 0.3), drops from z 2.70 to z 1.40 (1.3 mm), returns to board y 34.0 (1.4 mm inside the connector body, which ends at y 35.4). The drop is a 180-degree U with centre-line separation 1.3 mm, so inner radius = (1.3 - 0.12)/2 = 0.59, which meets R >= 0.45 (OK). But Sharp's bend zone starts 0.8 mm from the glass edge. U outer extreme at 1.3 mm means the bend starts at 1.3 - 0.59 - 0.12 = 0.59 mm (0.73 even at the minimum radius). That violates the 0.8 mm limit by 0.07 to 0.21 mm. MAJOR RISK. Fix in params.py: `fpc_loop=1.9` (reach 1.6, bend start 0.89), costs 0.3 mm of case length (41.8 to 42.1). Everything that derives from fpc_loop (lens opening, case length, the lens-end wall) follows.
Tail length is unknown, the contact face is unknown, J1's real height may be about 1.0 not 2.0 (then the U is about 2.2 mm tall and the reach must grow again). All UNVERIFIED; needs the Sharp Fig 8-1 page and the FH12 drawing before the CNC set.
Also check: glass edge to flex must not touch: flex starts flush with the glass underside, 0.12 mm thick, drawn inside the glass z-range; no clearance is demonstrable from the model.

### B4. Can the board be inserted? (kinematics)
Cavity (x -0.3..30.9, y -0.3..37.9) is open to the back from z -5.6 up to the ribs at z 0; ribs and pins are all above or at z 0, so a board moving up in +z meets nothing except:
1. The case pins (d1.45) hang down to z -1.1 and must find the board's two upper holes. Radial clearance is 0.075 (1.45 pin, 1.6 hole). MJF position scatter is +/-0.25, so the pins will not enter (MAJOR, see C1).
2. The button plunger tip is at x 30.58 inside the cavity; the switch stem tip is at 30.54. The board rises past the plunger with 0.04 mm side clearance (MEASURED, plunger-switch 0.04). The plunger cannot retract (its head has 0.05 mm of outward travel), so printed tolerance makes the stem hit the plunger. MAJOR (C-button).
3. The flex. Sequence step 4 says latch J1 with the board held at an angle, then swing it down. J1 sits under the glass: its top (2.0 EST) is 0.7 mm below the glass, and a flip-lock actuator needs to open upward by about 2 mm or more. So J1 must be latched with its end lowered by at least 2 mm (tilt 4 degrees about the pin end), then raised 2 mm with the tail fixed to the glass. The modelled U has about 1.3 mm of height and unknown spare length. Needs either extra tail length (a service loop) or a connector whose actuator opens toward the board edge. UNVERIFIED, MAJOR RISK, and physically testable only with the real display and connector. I could not prove the sequence feasible and I could not prove it infeasible; the geometry gives no slack.
4. USB-C nose into the wall window: the window is 15.2 x (to z 1.72) and open at the bottom; the nose (8.34 x 2.56) and flange (10.54 x 4.76) pass with more than 2 mm to spare. OK (MEASURED: window cut by build.py, plate-case gap 0.40).
5. Port plate and gasket: MECH step 3 says "fit the USB-C gasket into the port plate" but the pocket opens toward the interior (+x) while the plate goes in from outside (the opening is a closed hole around the nose). The gasket has to be put on the nose/flange first. Order wording is wrong, geometry is feasible. MINOR.

## C. The 17 integration items

1. PCB mounting and retention. Top face: four stops (two pin shoulders d2.6 at the antenna holes, two side ribs). Bottom face: two posts d3.0 at the lower holes touching the board at exactly z -0.8 (post top = board bottom, ribs bottom = board top, zero nominal gap on both). In-plane: four pins (two on the case, two on the cover) in four 1.6 holes, clearance 0.075 radial. Result: over-constrained in z (six hard contacts, three needed) and in xy (four pins; the cover's two pins are located relative to the case only by screw clearance holes 1.6 for a 1.4 screw, no dowels). With MJF +/-0.25 each way: either 0.5 mm of rattle or a bowed 0.8 mm board; and the cover pins will not meet the board holes. MAJOR RISK. Fix: `pin_d=1.10` (build.py uses pin_d for both pin sets), 0.3 x 45 chamfers on pin tips, give the cover posts a 0.5 mm compressible pad (PORON/silicone) and make post height `zb - 0.5` in build.py (so the cover presses via foam), and add `back_t` dowel tolerance note. NOT CHECKED: 4-hole tolerance chain on a real board (hole to hole +/-0.1 EST).
2. Battery packaging. Bay 4.80 holds 0.5 foam + 3.8 cell (cell bottom -5.10, cover -5.60: 0.40 measured). A 4.5 mm cell (SEEN max for the 402025 family) gives -0.2: MECH admits it. Cell retention is one rib at the lower end (board y 36.2..37.0, z -5.6..-4.1); nothing stops it moving in x or toward the USB shell (0.5 mm in x to the body, 0.2 mm in z to the tails). MAJOR/MINOR: add three more 0.8 mm rib segments in build.py (x = cx - 0.5 and cx + cw + 0.5, and one at the upper end), and cut the foam around the tails.
3. Display position vs active area and opening. Opening = glass + 0.2 per side (lcd-case 0.20 measured). MJF +/-0.25 means a printed opening can be 0.05 smaller than the glass. MAJOR RISK for the print: set `aperture_margin=0.40` for the fit-check print (and lens recess margin 0.1 to 0.3 in build.py, `Lx0 - 0.1` etc.). Active area offsets: NOT FOUND, so the lens window position over the 23.04 square is UNVERIFIED.
4. Flex routing: B3.
5. USB-C placement and access. Port is flush: nose tip x -2.125, plate/case outer face -2.1 (nose proud by 0.025, MEASURED; nose length 1.90 +/-0.25 per the drawing's general tolerance, so it may be recessed 0.2). Plug overmould 12.35 x 6.5 would span board y 4.3..16.7 (flat wall from y 1.9 to 34.1, so it clears the R4 corners by 2.4) and z -5.88..+0.62 (it overlaps the cover edge by 0.28, flat face, fine). Not recessed too deep: it is flush, so the overmould butts the plate face. PHYSICAL TEST: plug depth/wipe with a real plug and 0.2 mm of nose recess.
6. Insertion force path. Mating 5-20 N pushes the flange toward the gasket and then the plate, which is bonded in the case through a 0.4 mm epoxy gap 1.8 deep: shear area per side about 1.8 x 6.9 mm, adequate. Unmating 6-20 N pulls the connector (four stakes and six tails) and the board toward the wall; the board is held laterally only by the four pins and the 0.3 mm wall clearance. No retention force is published for the stakes (NOT FOUND). PHYSICAL TEST.
7. Gasket compression: D.
8. Button operation. Switch travel 0.2 mm. Nominal rest gap plunger tip to stem is 0.04 (0.09 with the head against its shoulder). Chain: case counterbore position (MJF +/-0.25), board position in case (0.3 mm wall clearance, pins), switch placement 0.1, stem tip 0.06 inside the board edge. Result range about -0.4 to +0.5: either the button is permanently pressed or it needs 0.5 mm of travel. MAJOR RISK. The plunger bore is 2.15 for a 2.0 shaft (0.075 radial; an MJF hole will close, it will bind), there is no O-ring gland (see A), and the seal is a placeholder. Fix in params/build.py: `plunger=(2.0, 3.0, 0.6)` -> add a 0.5 mm silicone/foam pad between plunger tip and stem (the pad takes the tolerance), counterbore depth 0.5 -> 1.0 so the plunger can retract 0.5 during board insertion, bore 2.15 -> 2.40 plus a real gland groove (0.89 wide, depth 0.35 for the 0.51 section ring) 0.4 mm outside the counterbore, bore reamed after printing.
9. Motor placement. Fine: 0.55 to glass, 0.4 to case. Leads unmodelled. Wires from M1 pads (1.5 mm from the motor edge) stay under 2.7 mm. MINOR.
10. Antenna clearance (RF). MEASURED distances from the antenna zone (box board y 0.65..4.45, x 9.75..20.25, z 0..2.05) to: LCD glass 1.23 mm (plan gap 1.05 in y, 2.7 above), lens 1.54, USB-C shell 3.69, cell 5.51, spring bar 6.50 (the 19.9 mm steel bar runs parallel to the antenna end), cover screws 7.33 and 7.82 (the two at the antenna end), side switch 8.74, motor 14.8. Raytac's mm guidance is NOT FOUND (the keep-out is in image-only figures; research A3), so no number here can be compared with it; the only stated rules are "keep No Ground Pad area as wide as possible on EACH layer" and "place at PCB edge" (satisfied: antenna end at the board edge, keep-out strip y 0..4.0 plus module strip to 4.45 in gen_pcb.py). The board's own comment says the top holes get "plastic posts only, no metal screws"; the cover screws are metal and sit 7.3 mm from the antenna, the bar 6.5 mm. MAJOR RISK (RF), PHYSICAL-TEST DEPENDENCY: range or S11 test with the case closed, with and without the bar and metal screws. Fall-back already in files: nylon screws for the antenna-end pair, a short plastic bar for the test strap.
11. Programming pads access. Pads TP2-TP6 at x 2.4, pitch 2.6 mm, strip x 1.1..5.9 between the left wall (-0.3) and the cell (6.6). With the cover off there are 4.8 mm of open depth above the pads and nothing in the way (MEASURED: nothing modelled there; the cover is off). Needs a custom 5-pin pogo block at 2.6 mm pitch; no TC2030 fits. Posts at y >= 32.3 are beyond TP6 (y 31.1): fine. PHYSICAL-TEST: make the jig.
12. Case-back closure and gasket path. Loop is a 1.0 wide ring on the wall centre line (x -1.7..-0.7 along the port wall). It crosses: (a) the port plate (D: half of its land is over the pocket void); (b) the 0.4 mm epoxy bond gaps at both plate ends and top (it must cross a gap filled with epoxy that must be flush within about 0.1 mm); (c) the lug roots only by 0.1 mm (lugs end at Y0+0.5, groove edge at Y0+0.4). It does not cross screws (screws at 1.5 mm outside the case end). Cover floor under the groove is 1.0 - 0.35 = 0.65 mm (MEASURED probe: cover solid from -6.6 to -5.95), below the 0.8 mm MJF minimum wall (JLC3DP, research G). Cover span: see E.
13. Assembly order: B4 and the corrected order in section 7.
14. Strap attachment. Bars: body 1.8, tips 0.9 entering lug holes 1.9 deep (tip engagement 1.7 modelled). Lug gap is 20.0 in params.py but MECH says model 20.2 and ream; printed PA12 at +/-0.25 may close a 20 mm strap end (the modelled strap is 19.8). MINOR/MAJOR for the strap test: `lug_gap=20.3` in params.py (the bar is 19.9 body plus tips; bar length is NOT FOUND for the real Archer bar). Lug hole 1.0 dia x 1.9 deep is at the MJF minimum hole size (JLC3DP hole >= 1.0, holes +/-0.3): a 0.9 tip will not enter: `lug_hole=(1.3, 1.9)` for the print, ream to 1.0 afterwards. Strap swing: bar centre 3.2 from the end face; modelled strap end corner radius 2.12 about the bar: 1.08 mm clear of the case end face (arithmetic). Real strap end thickness 3 to 4 mm (alt strap 4 at the lug end): UNVERIFIED. Quick-release lever: bar at z -4.4, cover ears closes the lug from below at -5.6; lever faces the wearer side and is reachable below the strap (strap bottom -5.9 is 0.7 above the cover plane): OK on paper, PHYSICAL TEST. Lug-to-lug 53.0 mm exceeds the 50 mm anecdote (research E): comfort, not function.
15. Serviceability. Cover (four screws), cell, strap, board removable. The board cannot be removed without tearing the display flex out of J1 or un-bonding the port plate (the plate is bonded and the nose is through it). MECH says "board serviceable"; it is not serviceable with the plate bonded and the flex latched under the glass. MINOR (documentation).
16. Tolerances. MECH table: port gap +/-0.05 only with the bonded plate (assumes shim 0.02, creep 0.03: both EST); board-to-wall -0.05 worst case (interference): set `clear=0.45` for the print. Case 34.8 -> 35.1 then.
17. Final dimensions: F.

## D. USB-C sealing, bonded port plate

Is the approach defensible for a prototype? Yes as an engineering experiment (it decouples the printed wall from the gasket window, which the tolerance chain proves is necessary: +/-0.65 vs window 0.15, FROM FILE MECH). No as drawn, because of the following.

MEASURED geometry (STEP):
- Pocket 11.00 x 5.90, depth 0.90 (x -1.2..-0.3), opening 9.14 x 3.36 through the 0.90 web, plate 14.4 wide, z -5.6..+1.32, x -2.1..-0.3.
- Gasket drawn x -1.20..-0.225 = 0.975 compressed (35 % of 1.50, inside GCT's 30-40 %, min 0.45 compression met: 0.525). Free thickness tolerance +/-0.25 per the gasket block, so real compression may be 0.275 to 0.775: the "0.075 gap with a shim" must be set per gasket by measuring it.
- Land margins around the gasket (outer edge): below 0.54 (to the joint plane), above 1.52, sides 1.88 each to the plate edge and 2.28 to the case. These are the numbers the documentation quotes.
- **But the pocket itself is 5.90 tall, centred on the port (z -2.63), so it spans z -5.58..+0.32 and the plate's bottom face is at z -5.60. MEASURED by point probes: at (x -0.75, board y 10.5) the plate is solid at z -5.595 and -5.585 and void from -5.575 up: the pocket leaves a 0.02 mm sliver of plate below it.** On top the skin is 1.0 mm.
  Consequences: (1) CRITICAL DEFECT for manufacture: 0.02 mm cannot be machined, printed or moulded; the real part has a pocket open to the joint plane. (2) The case-back gasket line (x -1.7..-0.7) passes under the plate: only its outer half (x -1.7..-1.2) sits on the 0.9 mm web; the inner half (x -1.2..-0.7) sits over the void. Land under the back gasket is halved, and the gasket can extrude into the pocket. (3) The 0.54 mm land margin that justified growing the bay from 4.5 to 4.8 is measured to the gasket edge, not to the pocket edge, which is what carries the seal, and it was not enough anyway.
  Fix (params.py): either `bay=5.50` (pocket bottom margin 0.72), or `pocket=(11.00, 5.30, 0.90)` with `bay=5.10` (the gasket is only 4.86 tall; GCT's 5.90 is a panel cut-out, margin 0.62, thickness +0.3). Prefer the second: it costs 0.3 mm instead of 0.7.
- Bond gap: window is plate + 0.40 on both ends and the top, 0.40 x 1.8 deep channels, open at the bottom to the joint plane. The back gasket (1.0 wide) crosses each channel mouth; the channel mouth is 1.8 wide (x -2.1..-0.3), so 0.4 to 0.8 mm of mouth is outside the gasket and open. The epoxy must fill 1.8 mm deep gaps with no voids and be flush with the case/plate bottom plane to about 0.1 mm for the gasket to cross it. MAJOR RISK. No datum fixes the plate's z (the plate hangs in a window 0.4 oversize; only the flange face sets x, the shim sets the gap, nothing sets z or y except a jig that is not designed). Requirement: add a plate z/y locating tab (a 0.5 mm shoulder on the plate bottom, or bond the plate against a flat-lapped plate), specify a lap/grind of the joint plane after cure, and state it in the procedure.
- Sealing land on all four sides of the pocket: sides (14.4 - 11.0)/2 = 1.70 each (plus 0.4 bond gap), top 1.0, bottom 0.02. Required before trusting: bottom at least 0.6.
- Overmould: see C5.

What I require before trusting it on a prototype: (1) the pocket fix above; (2) gasket thickness measured on at least 5 pieces (the drawing block says +/-0.25); (3) a shimmed jig that locates plate z and y and holds x to 0.05; (4) a leak test with port empty (air pressure decay at 0.3 bar before any water) and with a plug in; (5) a pull test of the stakes (NOT FOUND for GCT); (6) epoxy qualified on PA12 and on CNC acetal (adhesion on acetal is poor: choose SLA tough resin or ABS/PC for the plate, or a mechanical key plus epoxy); (7) RTV fillet as designed. Until (4) passes no water-resistance claim; MECH already makes none.

Back-gasket compression (Item 7/12): groove 0.35, gasket 0.50 free: 0.15 (30 %). My arithmetic on cover stiffness (flagged because MECH only says "may not hold"): the cover is a 1.0 mm PA12 plate, 34.8 wide, supported only at four lug-root screws about 44.8 mm apart along its length. Take a line load of only 0.1 N/mm per long edge (a very soft PORON-type gasket; silicone 60A at 30 % is more like 1 N/mm): the cover bends as a beam, I = 34.8 x 1.0^3/12 = 2.9 mm4, E = 1.5 GPa, load 0.2 N/mm: mid-span deflection = 5 w L^4 / (384 E I) = 5 x 0.2 x 4.03e6 / (384 x 1500 x 2.9) = 2.4 mm. The gasket's own compression is 0.15 mm, so the middle of both long sides has no compression at all. To get below 0.15 mm the cover needs about 2.5 mm of PA12, 1.5 mm of aluminium, or mid-span fasteners (impossible in a 1.8 mm wall). MAJOR RISK for sealing (not for fit). Fix: for sealing tests, a 1.5 mm aluminium cover (RF: a metal plate 5.6 mm under the antenna is a detune risk, test it) or a PSA gasket tape bonded around the ring with the screws only as retention; leave the fit-check print at 1.0.

## E. Structure and printability

MEASURED walls (point probes and geometry from build.py; my raster slicing attempt gave garbage and was discarded, so the list below is geometry from params/build.py cross-checked with probes, not an exhaustive medial-axis scan; NOT CHECKED: exhaustive thin-wall scan):
- Cover floor under the gasket groove: 0.65 mm (probe: solid -6.6..-5.95). Below the 0.8 mm MJF minimum. MINOR for the print; fix `back_t=1.15` (groove still 0.35: floor 0.80).
- Cover under each screw head: counterbore 2.9 dia x 0.45 deep in a 4.0 wide, 1.0 thick ear: remaining 0.55 mm under the head and 0.55 mm side walls: MINOR. Fix: counterbore 2.7, ear width `lug_w=4.4`, or pan-head screw in a pocket.
- Lug bar hole 1.0 dia: web to the screw pilot 1.7 - 0.5 - 0.56 = 0.64 mm; web below the hole to the lug bottom 0.7 mm (hole centre z -4.4, bottom -4.9, lug bottom -5.6): both below 0.8. MINOR; fix `bar_z_from_back=2.6` (adds 0.4 below the hole) and screw_from_face=1.2.
- Lug end: 5.6 - 3.2 - 0.5 = 1.9 mm to the end; tear-out estimate in MECH (about 200 N per tip, factor 3) uses a 1.9 x 1.9 shear area per plane: reasonable for PA12 but untested: PHYSICAL TEST.
- Lug cross-section 4.0 x 4.4; M1.4 engagement 4.0 mm of 4.4 (pilot runs through the lug top at z -1.2: a through hole, visible on the lug top; screw tip stops 0.4 below). Pilot 1.12 is below the MJF 1.0 min feature after shrink: drill after print. Wall around the pilot 1.44 mm each side: OK. MINOR: end the pilot 0.6 short of the lug top.
- Lens recess wall at the flex end: lens recess y to 38.9, case outer 39.7: 0.80 mm straight, 0.79 at the R4/R1.6 corners (arithmetic), 1.15 tall. At the limit; becomes 0.80 again when `fpc_loop` rises (the min() with `Y1 - 0.8` moves with it). MINOR.
- Lens ledge 1.3 wide x 0.89 thick: OK. Side walls beside the lens recess 2.6: OK. Antenna-end bezel 6.1: heavy but irrelevant.
- Button bore 2.15, lug hole 1.0, pilot 1.12, pin 1.45 in 1.6: the first, second and fourth need reaming or redesign (see C).
- Plate pocket skin 0.02: D.
- Cover span and gasket line load: D.
Machinable: CNC plate, case and cover: the pocket skin and 0.65 floor are the only items; 1.0 mm cover floor in aluminium is fine.

## F. Size

MEASURED from the assembly STEP:
- Case + lens + cover + plate: x -2.1..32.7 = 34.80, board-direction length 41.8 body (CAD Y -3.7..38.1; with lugs -9.3..43.7 = 53.0), z -6.6..+4.59 = 11.19. The headline 34.8 x 41.8 x 11.19 is the honest body envelope. Without the lugs the length is 41.8; with the lugs 53.0.
- Plunger cap: x to 33.30, so 35.4 wide (+0.6) with the button.
- Strap stub + bars: assembly total 35.4 x 76.2 x 11.19 (stubs are 14 mm).
- The headline excludes the +0.3 (fpc_loop 1.9) and +0.3 (pocket/bay fix) I require, giving 34.8 x 42.1 x 11.49. Print-clearance changes (`clear=0.45`) add 0.3 to the width: 35.1.
Could it shrink without redesign? Width: the walls are 1.8 only because of the GCT panel thickness at the port; elsewhere 1.5 would take 0.6 off the width (walls 1.5 give 33.6... but the lens ledge and lug roots then sit at the limit); thickness: lens 1.0 to 0.7 (-0.3), back cover to 0.8 with a 0.35 groove fails the 0.8 floor rule. None of this is free; the length is held by RF (display 1.05 mm from the antenna end) and the flex loop. Honest answer: it does not shrink without redesign; it grows by 0.6 mm in thickness and length if the fixes above are accepted.

## G. Model checks that are missing in build.py (concrete)

1. No check includes unmodelled parts (list in B2).
2. PRESS hides ("pcb","usb_c") which is a real flange/notch overlap.
3. The antenna keep-out marker is excluded from every check: add `("antenna_keepout","lcd")` etc. as reported distances, not pass/fail.
4. No check that the plate pocket leaves >= 0.6 mm below it (`D["z_usb_c"] - pocket[1]/2 - z_bay >= 0.6`): add it to checks().
5. No MJF thin-wall check (add a z-slice offset test or at least the listed arithmetic).
6. Required clearances are dubious: cell-usb 0.15, pcb-case 0.0 (a pass at zero), strap-case 0.05.

## 7. Corrected assembly order (what I would write in MECH_revD.md)
1. Bond lens to case ledge and display to lens (frame of tape on the glass border, active area free).
2. Plunger from inside, pad on its tip, ring in the gland.
3. Solder motor, cell leads to BT1/JP1 on the board outside the case; cut leads short; apply foam with tail cut-out.
4. Latch J1 with the board in a jig 4 degrees tilted and ONLY if the tail slack has been measured; else change the connector.
5. Seat the board on the pins (pin 1.1) and ribs, cover posts with foam.
6. Slide the gasket on the nose, plate from outside, shim, bond, lap the joint plane after cure.
7. Program through pogo jig. 8. Gasket, cover, four screws. 9. Strap.

## 8. Physical-test list (cannot be resolved in files)
1. Sharp LS013B7DH03 flex: tail length, contact face, bend start, active-area offsets (open PDF page 8 as an image) and the FH12 height/actuator swing with the glass in place.
2. Fit-check print (MJF PA12) of case, cover, plate, plunger with real parts: board insertion, pins, button reaming, aperture, lens, lug hole, strap.
3. Gasket: free thickness on 5 pieces, compressed set at 0.975, air-decay and water test with a plug in and out.
4. Port plate bond: epoxy on the plate material, flushness of the joint plane, plate z datum.
5. Cover stiffness: 1.0 mm PA12 versus 1.5 mm Al versus PSA tape; leak test.
6. Button: force and travel with the pad, 1.6 N plus drag.
7. Antenna: S11 or range with the case closed, with/without the spring bar and metal screws, with the cell and display in place, USB plug in and out.
8. USB-C plug depth and stake retention, 20 N pull.
9. Strap pull test (lug tear-out), strap swing, quick-release lever access.
10. Cell lead exit and PCM tab on the actual cell; cell swelling at 4.5 mm worst case.
11. Programming jig at 2.6 mm pitch.

## 9. Verdict for my domain

**NO-GO for the case set as currently in files; GO for ordering the boards** (no mechanical blocker requires a PCB change; boards can proceed, keeping the 1.6 mm holes and the notch as they are).

Blockers still fixable in files (all changes to cad/params.py or cad/build.py):
1. CRITICAL: port plate pocket leaves 0.02 mm below it. `pocket=(11.00, 5.30, 0.90)`, `bay=5.10` (or `bay=5.50`); add the 0.6 mm margin check.
2. MAJOR: pins 1.45 in 1.6 holes, located by two parts. `pin_d=1.10`, tip chamfers, posts on 0.5 foam (`post` height zb - 0.5), board over-constrained in z.
3. MAJOR: button chain +/-0.35 vs 0.2 travel, no gland, bore 2.15. Add a 0.5 pad, counterbore depth 1.0, bore 2.40, real gland.
4. MAJOR: flex bend starts 0.59 mm from the glass edge (Sharp 0.8): `fpc_loop=1.9`.
5. MAJOR: flex/connector latch sequence has no slack; require the tail length and connector actuator access before the CNC set.
6. MAJOR: cover cannot compress the gasket along 44.8 mm edges (2.4 mm deflection at 0.1 N/mm): 1.5 mm Al or PSA tape for the sealing set.
7. MAJOR: bond gap crossing (back gasket across 0.4 mm epoxy channels, no z datum for the plate).
8. MAJOR: print clearances: `aperture_margin=0.40`, `clear=0.45`, `lug_gap=20.3`, `lug_hole=(1.3, 1.9)`, lens recess margin 0.3.
9. MAJOR (RF): metal bar 6.5 mm and metal screws 7.3 mm from the antenna; physical test with fall-back nylon.
10. MINOR: cell retention ribs, thin walls (cover floor 0.65, ear 0.55, webs 0.64/0.7), flange 0.6 vs notch, R20 vs post.

Once items 1 to 4, 8 and the minor list are in the files and build.py checks include the new margins, a fit-check print and the boards are justified (not a sealed unit and not a CNC set).
