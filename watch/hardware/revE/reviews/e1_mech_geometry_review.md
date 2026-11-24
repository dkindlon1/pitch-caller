# E1 mechanical geometry review, rev E (copy of rev D). Nothing built, nothing proven to work or seal.

Method: CadQuery 2.8 import of cad/step and cad/step_mjf, OCC point-in-solid line scans (0.01-0.02 mm), BRepExtrema distances, boolean intersections. Scratch: /tmp/e1mech. Board coordinates; CAD y = 36 - board y.
Tags: MEASURED (how) / FROM FILE / NOT CHECKED.
Session was interrupted once: the full-solid thin-wall voxel scan and the board-insertion sweep were NOT run (trimesh not installed). Thin features below are only those found by line scans.

## Verdicts
1 PCB retention: FAIL (z-down and plug-in loads), BLOCKED (insertion/J1)
2 Port plate: FAIL (no lap/stop, tolerance chain omits gasket thickness), seal BLOCKED
3 Button: FAIL (bore too loose, lands 0.58/0.59, no inward stop), alignment BLOCKED
4 Display: FAIL (no glass seat or glass-to-lens adhesive in the model; aperture vs active area), latch access BLOCKED
5 Battery: PASS on clearances, FAIL on z retention (foam only), leads BLOCKED
6 Motor: PASS clearances; couples to board then case via ribs (see below)
7 Lugs: PASS nominal, FAIL in MJF (bar-hole web below 0.6)
8 Back seal: FAIL for solid silicone (groove 143 % full), FAIL for printed cover stiffness; screws outside sealed loop PASS
9 Assembly order: step 4 BLOCKED, step 2/4 board-passes-plunger only with plunger retracted
10 Tolerances: see list; M1.4 screws not realistic, M1.6 inserts fit only with changes

## 1 PCB mounting
- Restraint (MEASURED: slabs of case/back_cover at z 0.01..0.3, -1.0..-0.85, -1.6..-1.4, -0.5..0.3):
  - +z: four ribs on the board top at the corners and long sides, plus two pin bosses d2.6 at H1/H2. Total contact on the board top face 18.73 mm2 (intersect of case with board shifted 0.01 mm / 0.01).
  - x,y: only the walls (0.30 clearance, MEASURED: case inner face x=-0.30 and 30.90) and four d1.10 pins in 1.6 holes (0.25 radial; hole radius 0.75-0.85 MEASURED). Two pins are on the case (H1,H2), two on the cover (H3,H4). No rib or pin carries load in x toward the board.
  - -z: nothing rigid. Cover posts d2.6 (area 5.31 mm2 each) stop 0.5 below the board (MEASURED z -1.3 top); a 0.5 mm foam pad is assumed. In the MJF set post and rib heights vary +/-0.25 each: foam gap 0.0 to 1.0, so the board can be loose.
- Under ribs/pins/posts (pad extents from the board file, both sides): no pad of any part overlaps a rib, boss or post. Holes H1/H2 overlap the rib/boss footprint only because the pad bounding box is the NPTH itself. Nearest: R20 (bottom) 0.28 mm in xy from post H3 (post top z -1.3 vs 0402 bottom about -1.15 EST height, so no vertical room argument either). Copper tracks under ribs NOT CHECKED.
- Plug insertion (5-20 N) pushes the board +x. Nothing but the 0.25 pin clearance and the 0.30 wall gap stops it, and the pins are 1.1 mm PA12. 0.25 mm of board travel is more than the 0.075 mm gasket gap, so the seal can open during mating. FAIL for a sealing set.
- Insertion path (FROM FILE build.py + MEASURED): case is open at the bottom, board enters from -z. Port plate window is open at the bottom, plate comes in from outside after the board (sequence step 5). Plunger pad is at x 30.55..31.04 while board edge is 30.6: they overlap 0.05 mm in x over the board's entire insertion height, so the plunger MUST be retracted (0.25 available, head hits step at 31.6). Switch nub tip 30.53 vs pad 30.55 (0.01 gap). J1 cable tail (z 1.4..1.52, y 34..37.4) overlaps the connector body volume 1.0 mm3 (intended) and lies in the vertical path of the connector (top z 2.0), so a straight vertical insertion is impossible once the cable is latched: the board must be tilted. Tilt path NOT CHECKED (BLOCKED, needs the real panel).

## 2 USB-C port plate
- MEASURED (scans): plate x -2.10..-0.30 (1.8, equals wall), y 18.3..32.7 (14.4), z -5.9..1.02. Material under pocket 0.60 (z -5.9..-5.3), above pocket 1.0 (0.02..1.02), land beside pocket 1.66 each side at pocket level; pocket 11.04 wide x 5.3 high, floor x -1.2, depth 0.90. Opening 9.14-9.16 x 3.38 (z -4.32..-0.94). Nose 8.34 x 2.56 -> 0.40/0.41 each side. Floor land under gasket (opening edge to gasket outer) 0.75 each way; gasket inner bore (8.94x3.16) is 0.10 smaller than the opening per side, so 0.10 of gasket bore hangs unsupported.
- Window in case: y 18.14..32.86 (gap 0.16 each side), top 1.18 (gap 0.16 over 1.02). MJF: gaps 0.42 both. Window cut runs the full wall thickness: NO lap, step or flange. The plate can be pushed into the case (stopped only by the connector flange, 0.075 mm) or pulled out (-x) by gasket reaction. Only adhesive holds it. FAIL.
- Glue area (MEASURED geometry, my arithmetic): top 14.4x1.8 = 25.9, two sides 6.92x1.8 = 24.9, total about 51 mm2 in a 0.16 gap; bottom face coplanar with case bottom (-5.9), no bond there.
- Compression set by: the shim gap between flange and plate (g), pocket depth 0.90, gasket free thickness. Gasket modelled x -1.19..-0.23 = 0.97, 35 %.
- Tolerance chain, compression = t_free - (0.90 + g) = 1.50 - 0.975 = 0.525 nominal. Terms: gasket free thickness +/-0.25 (GCT drawing block, FROM FILE mech_inputs A1), pocket depth +/-0.05 CNC (+/-0.15 SLA, +/-0.25 MJF), shim 0.02, bond creep 0.03 (docs EST). Worst case CNC: 0.25+0.05+0.02+0.03 = 0.35 -> compression 0.175..0.875 (12..58 %), below GCT 0.45 minimum at the low end. RSS 0.26. MECH_revD.md's +/-0.05 chain leaves out the gasket thickness, which dominates. Fix: measure each gasket and set shim g = t_free - 0.90 - 0.525 (add to procedure), do not use a fixed 0.075.
- Gasket fill (EST, incompressible): needs about +54 % plan area at 35 % squeeze; free area around it about 13 mm2 vs about 12.7 needed: about 97 % full, no margin. Treat as overfilled risk; widen pocket (params pocket 11.00x5.30 -> 11.20x5.50 gives about 22 % more edge room; plate floor under pocket then 0.50, below 0.6, so also raise bay 5.10 -> 5.30).
- MODEL ERROR: x_flange is derived from `clear`, so in step_mjf the connector is stretched 0.15 mm (nose tip -2.275, flange -0.375) while the board and body back (6.1) are unchanged. Fix build.py: xf = -0.225 fixed (board-referenced), derive plate from xf, not from x_wall_in.
- Leak path: plate/case joint (0.16 gap, 1.8 long) runs outside to inside; the back gasket crosses it at the bottom but does not close it. Seal relies on the bond. Pocket top 0.02 is level with the board top face. BLOCKED (test).

## 3 Button
- MEASURED (x scan at r=1.25 mm): counterbore wall floor x 31.61; inner land 31.61..32.19 = 0.58; groove 32.19..33.10 = 0.91; outer land 33.10..33.69 = 0.59. Both under the 0.60 rule (build.py uses design values, the solid is 0.01-0.02 short). Same in MJF. Boss d5 x1.0 (y 21.51..26.49), wall at button 2.8.
- Groove radial depth beyond the bore = (2.72-2.30)/2 = 0.21. Ring 2.0 ID x 0.5: shaft 2.0 to groove bottom 2.72 gives radial gap 0.36, squeeze (0.5-0.36)/0.5 = 28 %, stretch 0 %, groove fill 0.196/(0.89x0.36) = 61 %. But bore 2.30 vs shaft 1.98-2.0 lets the shaft sit 0.15 off-centre: gap 0.21 (58 % squeeze) one side, 0.51 (-2 %, no contact) the other. Ring only seals if the shaft is centred. FAIL. Change plunger_bore 2.30 -> 2.12, gland (2.72, 0.89) -> (2.75, 0.89) (gap 0.375, 25 %), gland_land stays 0.6 and shift: add 0.03 to the land by CB or boss height button_boss (5.0, 1.0) -> (5.0, 1.1).
- Retention: head d3.0 (x 30.92..31.35) in counterbore d3.3 to x 31.6: outward travel 0.25, then step stops it. Inward: no stop except the switch (travel 0.2) and then pad compression 0.5; plunger can be driven into the switch. Add an inward stop (counterbore floor on the inner side, or plunger collar) so inward travel <= pad + 0.2. Nice to have until the real switch overtravel is known.
- Axis alignment (MEASURED scans): plunger axis y 24.00, z -2.40; actuator nub y 23.01..24.99, z -2.99..-1.81, so offsets 0.00 / 0.00 by construction (both come from the same variables). Real SKRTLAE010 actuator height is NOT in the files (body 3.3 high and nub z are EST). BLOCKED. Nub is only 1.2 high vs pad 2.0, tolerant to z error up to about 0.4.
- Pad to nub gap 0.01 nominal; chain ~ +/-0.7 (case wall 0.25 MJF, board location 0.5, switch 0.1 EST) minus retract 0.25: up to 0.45 mm into a 0.5 pad: the switch could be held pressed. BLOCKED on pad stiffness.

## 4 Display
- MEASURED: glass x 2.0..28.6, y(cad) 0.2..30.5, z 2.7..3.44. Aperture x 1.79..28.81 (0.21 each side), y -1.91..30.71 (0.21 north side, 2.11 at the cable end). Ledge top z 3.43/3.44, case cavity ceiling z 2.56 lies 0.2 mm OUTSIDE the glass edge in plan. So nothing is under the glass edge: there is no glass seat. lens_adhesive is a ring only over the ledge; inside test at (15,15,3.5) is empty: no adhesive over the glass, 0.15 air gap lens-to-glass. The display is supported by nothing in the model (docs say tape frame on the lens underside; not modelled). FAIL. Fix: build.py add a ring on the glass border at z 3.44..3.59: box(lx,lx+lw,ly,ly+ll) minus box over active area (23.04 sq) with margin; width available per side about (26.6-23.04)/2 = 1.78 if the active area is centred (offsets NOT FOUND, Sharp Fig 8-1 not read). Use a 1.0 wide ring. Also add `lcd_seat` ledge under the glass: set aperture_margin 0.2 -> 0.5 only in the cavity ceiling (a 0.8 wide lip at z 2.56..2.70 inside the glass outline) if tape is not enough.
- Aperture vs active area: opening 27.02 x 32.62 vs active 23.04 x 23.04: at least 1.78+0.21 of dead glass border per side in x and about 3.6 in y is visible unless the lens has a black print mask. Lens print is not in the model or docs. FAIL (cosmetic); NOT CHECKED: viewing angle.
- Lens recess: x 0.49..30.11 (29.62) vs lens 29.40: 0.11 per side; MJF 0.31.
- Flex: lcd_fpc to case 0.50, to lens 0.77, to pcb 1.40 (all MEASURED distances). Inner fold radius implied (1.46-2.76 centreline spacing 1.30 - 0.12)/2 = 0.59 >= 0.45 (Sharp). Bend starts 0.89 past glass (FROM FILE reaudit). Tail enters connector only 1.4 mm (y 34.0..35.4); real FH12 insertion depth NOT CHECKED. Tail width 6.0 EST.
- Latch access: glass to connector top 0.70 (MEASURED); docs say latch needs about 2. Mouth faces south; slot south of the board is 2.2 mm (board edge y 36, inner wall 38.2) and the cable fold occupies it. BLOCKED (needs real panel); by the model alone it cannot open with the board seated.

## 5 Battery
- MEASURED distances: cell to usb_c 0.20 (z, solder tails 0.30 EST), cell to board 0.50, cell to switch body 0.80, cell to back cover ribs 0.30, to J1/ble/pmic/motor 1.30/1.30/1.30/1.35, to port plate 6.9. Swelling room to cover 0.8 (z -5.9 vs -5.1) = 21 % of thickness.
- Board file bottom side (xy gaps to the cell, x 6.6..26.35, board y 9.8..35.8): D4-D6 0.72, R17-R19 0.74, JP1 0.87, SW1 box 0.07 (body x gap 0.8), BT1 pads 0.12 (pad edge x 27.0, 0.65 from the cell), TP1/TP8 1.52, J3 footprint box overlaps the cell in xy (x to 8.22, y to 16.75), so J3 tails/stakes vs cell rely on the 0.2 z gap. Heights of bottom parts: EST only, NOT CHECKED against 3D models.
- Retention: x/y by cover ribs 0.3-0.4 mm off the cell (left rib x 5.7..6.3, right 26.65..27.1, ends y 8.6..9.4 and 36.2..37.0), rib top z -4.5, so they cover only 0.6 of the 3.8 thickness. z: foam only; the cell sits 0.8 above the cover and can rise 0.5 into the J3 tails and BT1 wires. FAIL: add a foam pad on the cover side (cell_gap 0.5 stays, add 0.8+ compressed foam under cell) or make the pad under the board non-compressible.
- Lead exit and PCM tab: NOT FOUND, BLOCKED. Right rib sits 0.3 from the cell on the BT1 side; wire route to BT1 (x 27..30) crosses it above z -4.5: ok in principle. Rib edges are sharp square boxes (no pouch contact risk found beyond that).
- Other 402025 cells (20.5 x 27-29 x 4.5): do not fit the ribs (docs note).

## 6 Motor
- Sits on the board top at x 1.3..9.3, y(cad) 9.3..17.3, z 0.05..2.15, on its own self-adhesive (0.05 modelled, real tape thickness NOT FOUND). Gaps (MEASURED): LCD underside 0.55, case ceiling 0.40, board 0.05, cell 1.35, lens 1.44. Part of the motor (x 1.3..2.0) is outside the glass outline, under the 2.56 case ceiling.
- Vibration path: motor to board (adhesive), board to case through four rib/boss contacts (18.7 mm2) pressed by foam, then to case. Board to LCD: through the connector and cable only. Case is coupled, glass is not rigidly coupled. Pins are loose (0.25), so a rattle is possible. NOT CHECKED: frequency or amplitude.

## 7 Lugs and strap
- MEASURED (scans): lug x 1.32..5.28 and 25.32..29.28 (4.0 wide), gap 20.04 nominal (MJF 20.3), height z -5.9..-1.5, hole axis z -4.7, dia 1.02 (MJF 1.28), depth 1.9 (x 3.39..5.28), bar hole centre 3.5 from end face, lug tip beyond hole 1.58.
- Webs: hole to lug bottom 0.68 nominal, 0.55 MJF (FAIL <0.6); hole to pilot 0.92 nominal, 0.81 MJF; pilot to lug side (4.0-1.14)/2 = 1.43; hole to lug tip 1.58 (MJF 1.43). Pilot is a through hole (scan empty from z -5.9 to -1.4), open on the lug top.
- Strap swing: strap end corner radius 2.12 about the bar vs 3.5 to the case end face: 1.38 clear; MJF 1.48. Lateral strap to lug/cover ears 0.10 (nominal), 0.25 MJF. Spring bar to case 0.05 (tip contact area, by design).
- Strength (my arithmetic, PA12 48 MPa tensile, 29 MPa shear, no test): bearing area tip 0.9 x 1.9 = 1.71 mm2 -> 82 N per tip at yield, 164 N per bar. Shear-out 2 x 1.9 x 1.58 = 6.0 mm2 x 29 = 174 N per tip. Bearing governs: about 80 N per tip before yield; with a factor of 3 for printed parts about 27 N per tip, 55 N per bar. This is below the docs' 130 N figure, which used shear-out only. Bar-tip engagement 1.9 is EST. Pull-test needed.

## 8 Back seal
- MEASURED: groove z -6.25..-5.9 (0.35), width 1.0 (x -1.71..-0.69), cover floor under groove 0.64; groove centre in the 1.8 wall (lands 0.39 + 0.41 of metal-to-metal stop). Gasket free 1.0 x 0.5 into 1.0 x 0.35 groove: nominal squeeze 0.15/0.5 = 30 %. Fill = 0.5/0.35 = 143 %: solid silicone cannot reach the hard stop (no void); PORON/foam can. MJF groove depth +/-0.25 gives squeeze -0.1..0.4 mm (0..80 %).
- Fix: back_gasket (1.0, 0.50, 0.35) -> (0.75, 0.50, 0.35) and groove width 1.2 (new key back_groove_w=1.2 used for ring_o/ring_i in build.py): fill 0.375/0.42 = 89 %, lands 0.3 each side. Or use closed-cell foam and keep.
- Bowing (repeat): beam 45 mm between screw rows (MEASURED screw y -5.5 and 39.6 cad, x 3.3/27.3), effective strip 10 x 1.0 mm, E 1.6 GPa: delta = 5wL^4/(384EI) = 12 mm x (w / 0.3 N/mm). Even w = 0.01 N/mm gives 0.4 mm, above the 0.15 mm gasket squeeze. Beam theory is crude (plate action helps, torsion hurts) but the margin is a factor of 3 or more; a printed 1.0 mm cover will not seal (agrees with docs). Sealing set: 1.5 mm aluminium and 3 screws per long side or closer screws (positions are limited to the ears).
- Screws: pilot through the lug, screw 5.0 long, engagement z -5.9..-1.9 = 4.0 mm; screw rows lie 1.9 mm outside the gasket outline (MEASURED distance gasket-screws 0.65 to screw head, gasket y range -3.6..37.7 vs screws -5.5/39.6), so they do not cross the sealed volume. Screw-head floor in cover: z -6.44..-5.91 = 0.53 (FAIL <0.6).
- Cover location: only the four screws (hole 1.6 for 1.4, 0.1 radial); no dowels. Flush at X0/Y0 within 0.0 (nominal) and 0.0 (MJF).

## 9 Assembly sequence walk (MECH_revD.md)
1. Lens to ledge, display to lens: lens bond OK; display bond has no adhesive in the model (see 4). 
2. Plunger from inside: OK (head d3.0 through the counterbore d3.3). Plunger not retained inward until the board is in.
3. Motor/gasket: OK.
4. J1 latch then swing board in: BLOCKED/likely impossible as drawn (0.7 mm over the connector, tail in the vertical path, plunger must be retracted).
5. Plate from outside onto nose, bond: possible only with a jig since nothing stops the plate (section 2).
6-7: cell leads then programming: pads TP1-TP6 are in the cell-free band; TP4/TP2/TP3 pads at x 1.65..3.15 are 2.9 mm from the cell (reachable). Cell lead solder with the cover off: reachable from below.
8-9: fine geometrically.

## 10 Tolerances (convention: every printed face may sit 0.25 off in any direction; PCB +/-0.1)
Printed set (step_mjf), worst case:
- Lens in recess: 0.31 per side nominal - 0.25 - 0.05 lens = 0.01: marginal (recess_margin 0.30 -> 0.45, key lens_recess_margin).
- Board to wall: 0.45-0.25-0.10 = 0.10 OK.
- Glass to aperture: 0.40-0.25-0.10 = 0.05 OK (glass has no location anyway).
- Plate in window: 0.42 - 0.25 (plate printed) - 0.25 (window) = -0.08 FAIL if plate printed, +0.04 if CNC/SLA; plate_gap 0.40 -> 0.55.
- Lug hole web 0.55 FAIL (lug_hole (1.3,1.9) -> (1.2,1.9) gives 0.60; bar_z_from_back 2.2 -> 2.4 gives 0.80).
- Lug gap 20.3: tip engagement (EST bar 23.4 extended) 1.43 per side at worst: OK; model stretches bars with the gap (model artifact).
- Gland lands 0.58/0.59: FAIL (<0.6).
- Foam gap under board 0..1.0: FAIL for retention (section 1).
- Pad/switch: see section 3, FAIL marginal.
- USB connector model stretched in MJF: model error (section 2).
Machined set (+/-0.05, nominal solids): all fits keep at least 0.05 except: pad/switch 0.01 (by design), spring bar/case 0.05 (contact), lens recess 0.11 OK.

## Interference and thin features
- Overlaps (MEASURED, 276 pairs, nominal): only button_pad/plunger 0.38, case/cover_screws 0.86, fpc_connector/lcd_fpc 1.01 mm3; all intended. The press fits listed in build.py (O-ring, gaskets) show 0.00 volume (touching, drawn compressed). No unintended overlap.
- Thin (<0.6) found by scans: gland lands 0.58/0.59, cover screw-head floor 0.53, plate under pocket 0.60 (limit), cover under groove 0.64, lug hole-to-bottom 0.68 (all >=0.6 except the first two; MJF 0.55 lug web). Whole-solid scan of case, back_cover and port_plate: NOT CHECKED.

## M1.4 screws, M1.6 heat-set inserts (FROM FILE mech_inputs D, McMaster 92120A150)
Insert installed length 3.0, hole 2.2 (outer diameter not printed, NOT CHECKED). Room: lug 4.0 wide -> web each side (4.0-2.2)/2 = 0.90; length available z -5.9..-1.5 = 4.4, hole 3.0 deep leaves 1.4 above; web to bar hole 3.5-1.5-1.1-0.5 = 0.40 (FAIL <0.6). Needed: bar_from_face 3.5 -> 4.1 (lug_len 5.6 -> 6.2), or screw_from_face 1.5 -> 1.0 (pilot centre 1.0 from face; hole then runs into the wall root, check). Lug width lug_w 4.0 -> 4.4 recommended (web 1.1). Cover hole 1.8, head 3.0. Case length grows 1.2 mm overall. Not modelled; prices unchecked.

## Fix lists
MUST FIX before a printed fit-check set:
- params MJF dict: lens_recess_margin 0.30 -> 0.45; plate_gap 0.40 -> 0.55; lug_hole (1.3,1.9) -> (1.2,1.9); (or bar_z_from_back 2.2 -> 2.4).
- params plunger_bore 2.30 -> 2.12, gland (2.72,0.89) -> (2.75,0.89), button_boss (5.0,1.0) -> (5.0,1.1) (lands >= 0.6).
- build.py: keep usb x_flange fixed to the board (-0.225); keep spring-bar length independent of lug_gap.
- build.py: add the glass-border adhesive ring and a plan for the glass seat (section 4).
- build.py: cover screw head floor: head counterbore depth 0.45 -> 0.35 (floor 0.63).
- Cover post/foam: specify 1.0 mm foam compressed to 0.5; and cell foam on the cover side.
MUST FIX before a sealing set:
- Plate lap: add a flange on the plate outer face (plate x X0-0.4..) and a matching recess in the case, or a bonded step; plate_gap stays 0.15.
- Per-gasket shim rule (g = t_free - 1.425), pocket 11.20 x 5.50 with bay 5.30.
- Back gasket (0.75, 0.50, 0.35), groove 1.2; metal 1.5 mm cover.
- Board x stop against plug insertion: add two ribs at the left wall edge (x -0.3..0.0 touching the board edge) or reduce pin clearance: pin_d 1.10 -> 1.40 (0.1 radial).
- Real switch/panel/connector dimensions (BLOCKED items).
NICE TO HAVE: inward plunger stop, black print mask on lens, M1.6 inserts (lug_w 4.4, lug_len 6.2, bar_from_face 4.1), rounded rib edges near the cell.

BLOCKED (physical part or print): J1 latch access and tilt insertion, tail depth/width, switch actuator position, pad stiffness, gasket real thickness and bond leak path, cell lead exit and PCM tab, motor tape thickness, bottom-part heights, active-area offsets, strap bar dimensions, screw availability.
