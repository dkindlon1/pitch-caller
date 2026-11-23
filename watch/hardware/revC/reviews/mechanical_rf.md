# Mechanical and RF review, PitchIQ watch rev C (nothing built, nothing measured on hardware)

Reviewer role: independent mechanical + RF. Read-only except this file. Board numbers come from `kicad/pitchiq_watch.kicad_pcb` loaded with pcbnew (origin x=100, y=80 subtracted; bottom parts are flipped). z is measured from the PCB top face unless "from back" is stated.
Tags: **CHECKED** (my measurement or a file I read, with the location), **FROM SOURCE** (named document), **ESTIMATE** (my judgement; verify with parts in hand). Nothing below says the design works; it says what fits on paper and what is unproven.

---

## 0. Headline

Rev C as drawn has two blockers that come from one wrong number: the GCT USB4715 stands **4.21 mm above the PCB top, not 1.80 mm**. It collides with the LCD (underside 2.30 mm) and with the lens plane, and its wall opening cannot be cut inside a 10.0 mm case. The "10.0 mm" and "34.2 x 40.2" headline numbers are not honest. Corrected: **about 11.6 mm thick and 37.4 x 41.9 mm** (receptacle kept on top), or **about 10.9 mm and 34.8 x 41.9 mm** if the receptacle is flipped to the bottom side (unproven, section 9).

---

## 1. USB4715 footprint versus the GCT drawing (pages 1 and 2 of /tmp/dl/gct4715/usb4715.pdf, rendered at 300 dpi and read by me)

Footprint = `custom()` branch "USB4715" and `NOTCH` in `scripts/gen_pcb.py`; board = pads actually in the .kicad_pcb (J3 at (6.3, 10.5), local +x = into the board).

| Item | Drawing "Recommended PCB Layout" | Footprint / board | Result |
|---|---|---|---|
| Pad row pitch B12-A12, B9-A9, A5-B5 | 5.50, 3.04, 1.00 (printed) | y = +-2.75, +-1.52, +-0.50 | MATCH |
| Pad widths | 2x0.80, 2x0.76, 2x0.70 (printed; which width belongs to which pair is read from the leaders, outer pair widest) | 0.80, 0.76, 0.70 | MATCH (pair assignment ESTIMATE) |
| Pad order and orientation | left-to-right B12, B9, A5, B5, A9, A12 with the opening toward the viewer | B12 at -y ... A12 at +y, opening toward -x; a clockwise 90 degree turn of the drawing gives the same order | MATCH. A mirror error would only swap A5/B5; the VBUS and GND pairs are symmetric, so it would be electrically benign |
| Pad length | 1.05 (printed), pad starts at the notch back edge | 1.35 long, centre 0.925 -> copper from 0.25 to 1.60 behind the back edge (CHECKED: board pads x 6.55..7.90) | **MISMATCH (deliberate, gen_pcb.py comment: copper-to-edge clearance)**. Consequence in section 5, finding 6 |
| Notch width | 10.30 (printed) | NOTCH y 5.35..15.65 = 10.30 | MATCH |
| Notch depth | 5.30 (to rear slot centre) + 1.00 = 6.30 (printed) | NOTCH x1 = 6.3 | MATCH |
| Overhang past board edge | 2.10 (printed) | fab/courtyard to x = -8.4 local = 2.1 past the edge | MATCH |
| Shell stake slot centres, across | 11.60 (printed) -> +-5.80 | y = +-5.80 | MATCH |
| Shell stake slot centres, along | 3.00 apart (printed), rear one 5.30 from the back edge, front one 1.00 from the front edge | local x = -2.30, -5.30 | MATCH |
| Slot (hole) | 4x 0.50 and 4x 1.10 (printed), long axis along the insertion direction | oblong drill 1.10 x 0.50, long axis along x | MATCH (which callout is hole and which is pad is ESTIMATE; the hatched oval scales to about 1.0 x 1.5) |
| Slot pad | 4x 0.90 and 4x 1.50 (printed) | pad 1.50 x 0.90 | MATCH (same caveat) |
| Slot pad to notch side wall | drawing shows the oval tangent to the wall | 5.80 - 0.45 - 5.15 = 0.20 mm | MATCH (CHECKED arithmetic) |
| Back-corner relief | circle of about R0.5 centred ON the notch corner (scaled from the picture, no callout) | arcs R0.5 centred on the back edge 0.5 mm from the corner, bulging into the board to x = 6.8 (CHECKED: arc centre (6.3, 5.85), mid (6.8, 5.85)); the corner itself stays a sharp 90 degree inside corner | **MISMATCH in shape, CANNOT TELL in size.** A routed inside corner gets the router radius, so the corner can pinch the 9.94/9.99 body (0.15-0.18 per side to the wall). Redraw as a circle on the corner |
| PCB thickness | 0.80 +-0.10, tolerance +-0.05 | board 0.8 (ds.SetBoardThickness) | MATCH, but the fab tolerance on 0.8 mm is not stated in the files |
| Body / flange height above PCB | see section 2 | MECH says 1.80 | MISMATCH, blocker |
| Tail reach versus pad | tail projects about 0.85 behind the 8.20 body (scaled off the side view, ESTIMATE +-0.1); body rear sits 0.2 in front of the back edge (dashed outline) -> tail tip about 0.65 behind the edge | pad copper begins 0.25 behind the edge | overlap about 0.40 mm of a 1.35 mm pad, versus about 0.65 of 1.05 on the drawing. CANNOT TELL until a part is in hand |

---

## 2. Findings, ranked

### BLOCKER 1: the receptacle is 4.21 mm tall above the board, not 1.80 mm; it collides with the LCD and the lens plane
- **CHECKED, GCT drawing p1:** the rear view gives 4.46 overall; its SMT feet (the "0.10" coplanarity reference) sit 0.55 above the body bottom (side view "0.55"); so the feet plane is the PCB top and the body dips only 0.55 into the 0.8 mm board. Front view overall 4.76 minus 0.55 = **4.21**, which is exactly the "4.21 mm profile above PCB" quoted from Mouser in research/usbc_motor.md section 1.3. The rear shell top is 4.46 - 0.55 = 3.91.
- The "1.80" on the drawing is the height of the lower housing, body bottom to the shoulder (it also appears as panel thickness on page 2). MECH treats it as above-board height: `usb_above=1.8`, and the SVG note says "1.8 above the board top, about 1.9 below the board bottom" (mech_drawing.py). Reality: **nothing below the board bottom** (body bottom is 0.25 mm above the PCB bottom, CHECKED arithmetic 0.8 - 0.55), 4.21 above.
- Plan overlap (CHECKED from board + gen_pcb.py): receptacle body x -2.1..6.3, y 5.23..15.77; LCD glass x 1.7..28.3, y 5.5..35.8 -> 4.6 x 10.3 mm of the body lies under the glass. LCD underside is 2.15 + 0.15 = 2.30; body top 4.21: **1.9 mm interference**.
- Z (CHECKED arithmetic, MECH stack): PCB top is 1.0 + 4.0 + 0.8 = 5.8 mm from the back; flange top = 10.01 mm = the lens top (9.99) and fully inside the lens layer (9.0-10.0).
- Fix, pick one: (a) keep the receptacle on top, keep the LCD out of its footprint (LCD x >= 6.6) and raise the lens underside to flange top + 0.3 -> case about 11.6 mm; (b) LCD over the receptacle -> lens underside >= 4.51 over the PCB + LCD 0.89 -> about 12.5 mm; (c) flip the receptacle to the bottom side so its 4.21 sits in the cell bay beside the cell (section 9), about 10.9 mm; (d) drop the mid-mount receptacle for charging contacts (option C).

### BLOCKER 2: the wall opening for the port cannot exist inside the 10.0 mm case
- ESTIMATE: nose centred in the 4.76 flange -> centre 2.38 - 0.55 = 1.83 above the PCB top = 7.63 mm from the back (the drawing does not dimension the centre height; verify on a part).
- From GCT's panel drawing (p2): through opening 9.14 x 3.36 -> z 5.95..9.31 from the back; gasket step 11.00 x 5.90 (the 5.50 is the 5.90 less the C0.2 chamfers, ESTIMATE) -> z 4.68..10.58. The case is 10.0 high, the lens plane starts at 9.0, and the back cover seam is at 1.0. The step breaks out of the top by 0.58 mm, and the 3.36 hole by 0.31 mm cuts the lens bond line.
- Fix: the port must sit with at least 0.5 mm of one-piece wall above and below it, so the case needs height (see BLOCKER 1) or the receptacle must be flipped down; also keep the back-cover seam out of the opening.

### MAJOR 3: the 2.15 mm parts zone is too thin; the gap should be about 2.7 mm
Heights (z above PCB top):

| Top-side part | Height | Tag |
|---|---|---|
| USB4715 flange / rear shell | 4.21 / 3.91 | CHECKED (drawing) |
| Motor VCLP0820B004L, adhesive backed | 2.1 + tape about 0.1 = about 2.2; with +0.1 spread 2.35 | FROM SOURCE research/usbc_motor.md 2.1 (whether 2.1 includes the tape is not stated); tape ESTIMATE |
| Raytac MDBT50Q-1MV2 | 2.05, +-0.15 assumed -> 2.20 | FROM SOURCE revB mechanical.md (mcu.md); tolerance ESTIMATE |
| C12 0805 10 uF 25 V | 1.25 nominal, about 1.45 max | ESTIMATE |
| L1, L2 TDK MLP2012H2R2 (0805 footprint) | 1.0-1.2 | ESTIMATE (revB, not verified) |
| SOT-23 Q1, Q2 (AO3400A) | about 1.1-1.2 | ESTIMATE |
| SOD-123F D2 | about 1.1 | ESTIMATE |
| Crystal 3215 Y1 | about 0.9 | ESTIMATE |
| J1 FH12-10S-0.5SH closed | about 1.0 (Hirose catalog, recollection); Future Electronics listing said 2.0 max | FROM SOURCE revB mechanical.md, not re-fetched; open lever swings several mm up |
| U4 LGA 2x2 | 1.0 max | FROM SOURCE research/datasheets.md line 258 |
| nPM1300 QFN | 0.85 | FROM SOURCE datasheets.md line 70 |

- Clearance to the LCD underside (2.30): module worst 0.10; motor worst about -0.05 to 0.10; plus PCB bow (6 layers, 30 x 36, ESTIMATE up to 0.2) and assembly tilt. Rev B kept 2.25 for the same module and was only 0.2 over it.
- Recommended: LCD underside at **2.70** above the PCB top (2.35 worst motor + 0.35). That is +0.40 on the stack. If the motor moves off the LCD footprint, 2.55 is the floor set by the module (2.20 + 0.35).
- The motor is an ERM: keep the 0.35 gap even at its worst height; vibration amplitude is small (ESTIMATE), but a glass panel resting on a spinning can will crack or buzz.

### MAJOR 4: LCD FPC and J1 under the glass (details in section 4 of this report)
Rule compliance is better than rev B on paper; the contact side and the FPC length are still unknown, assembly needs a fold-over sequence, and the loop sticks 1.7 mm outside the board.

### MAJOR 5: O-ring groove does not fit in a 1.8 mm wall or a 1.0 mm back cover
- MECH note: "O-ring 1.02 section in a 0.69-0.76 deep x 1.52 wide groove". A face groove in the 1.8 mm wall rim leaves 1.8 - 1.52 = 0.28 mm total (0.14 per side), below the 0.5 mm MJF minimum feature (research/enclosure.md) and far below the 1.0-1.2 mm walls it recommends. Cutting it in the 1.0 mm back plate leaves 0.24-0.31 mm of plate under the groove.
- Printed MJF tolerance is +-0.25 (Stratasys, enclosure.md) against an O-ring window of about 0.07 mm (enclosure.md section 4); research says printed grooves are unrealistic (enclosure.md line 188).
- Fix: either a die-cut or formed-in-place gasket against a hard stop with an adhesive-sealed back (keeps the 1.8 wall), or a local rim lip at least 1.52 + 2 x 1.0 = 3.5 mm wide (adds 3.4 mm to each case dimension), and CNC or moulded sealing faces (enclosure.md).

### MAJOR 6: USB gasket compression and tail overlap have no tolerance margin
- CHECKED arithmetic from GCT p1-p2: nose length 1.90 beyond the flange, wall 1.80, pocket depth 0.90, gasket 1.50 thick, minimum compression 0.45, suggested 30-40% (0.45-0.60). With MECH's 0.3 clearance the flange sits at -0.2 and the wall inner face at -0.3: gasket 1.0 thick, 33% compressed. It only works at nominal.
- Window is about +-0.08 mm. The chain is: connector position on the board (notch +-0.05 per drawing, fab profile tolerance ESTIMATE +-0.1), board location in the case (board holes 1.6 vs screw 1.4: 0.1 play), printed wall +-0.25 (enclosure.md), and the overhang tolerance (the title block gives X.XX +-0.25). Sum about +-0.35 or more: leak at the low end, crushed gasket or stressed solder at the high end.
- Fix: do not locate the connector through the board. Let the board float 0.5 mm in x (slotted holes) with foam or a spring pushing the flange against the gasket, and put a hard stop on the wall pocket depth.
- Tail overlap: see table in section 1; the 0.25 mm start offset leaves about 0.40 mm of overlap. Fix: pad 0.20..1.25 (1.05 long) and ask the fab for 0.15 copper-to-edge on that edge only, or move the notch edge back 0.1 and re-check body fit.

### MAJOR 7: side switch SW1 (bottom side) works mechanically only with a plunger that does not exist yet
- CHECKED (board): SW1 flipped, rotated -90, actuator stem points **outward, +x**; stem x 29.06..29.99 on B.Fab, so the **tip is 0.01-0.06 mm inside the board edge (x = 30.0)**, stem 2.0 wide (y 10.95..13.05). Body x 26.5..29.16, y 9.7..14.3. Pads x 26.1..29.4, y 9.42..14.58.
- Height: 3.3 mm body (FROM SOURCE revB, Mouser/LCSC) fits the 4.0-4.3 mm bay under the board with 0.7 spare. It is beside the cell (cell edge 25.95), not under it. Stem centre about 1.65 below the board bottom (ESTIMATE, stem height not published).
- Stem tip to wall: inner wall at 30.3, outer face at 32.1 -> a 2.1 mm plunger plus seal is needed; MECH has no button part, no seal, no plunger position. Travel is 0.2 mm at 1.6 N (FROM SOURCE revB). The revB tolerance chain (about 0.35 mm) is still larger than the 0.2 mm travel (revB finding 9 is unchanged).
- Cell edge to SW1 pad copper: **0.15 mm**; to the switch body 0.55 (CHECKED). Cell width tolerance is not published.
- Fix: silicone boot or lever with at least 0.5 mm take-up, plunger guided in the wall, cell pocket 0.5 mm wider on that side.

### MAJOR 8: lugs and strap, items missing (section 7 of this report)

### MAJOR 9: RF, ranked risks (section 8)

### MINOR 10: remaining items
- BT1 pads (x 26.4..29.4, y 18.5..23.5) sit 0.45 mm from the cell edge; JP1 1.2 mm; R17-R19 pad edge 0.52 mm from the cell edge (x 5.68 vs 6.2); D4-D6 1.08 mm (CHECKED). Cell lead exit and the protection-board bulge are unknown (revB finding 4).
- Notch relief shape (section 1).
- TP1, TP8 are bottom test pads at y 6.25-7.75 (above the cell start y 9.8): fine.
- Courtyard of the USB footprint is drawn 10.3 deep; the part is 8.20 plus tails.
- check_antenna.py and the DRC do not check z-height at all; "CHECK: PASS" in out/check_output.txt says nothing about stack collisions (it says so itself).

---

## 3. Bottom side: what the cell clears (question 2)

| Pair | Measurement | Tag |
|---|---|---|
| Cell vs USB-C lower body | The body bottom is 0.25 above the PCB bottom, the cell top is 0.2 foam below it: about 0.45 mm vertical. In plan the cell edge (x 6.2) is 0.1 past the notch back edge (6.3), and the body rear is 0.2 in front of that edge. No collision, assuming the 0.55 reading | CHECKED arithmetic, drawing read by me |
| Cell vs switch body / pads | 0.55 / 0.15 mm | CHECKED |
| Cell vs BT1 / JP1 pads | 0.45 / 1.2 mm | CHECKED |
| Cell vs programming pads TP2-TP6 (x 1.65..3.15) | 3.05 mm; D4-D6 1.08, R17-R19 0.52 | CHECKED |
| Heights: D4-D6 SOD-323 about 1.1, R17-R19 0402 about 0.5, TP pads flat, SW1 3.3, JP1/BT1 pads flat plus solder about 0.5 | all below the 4.0-4.3 bay | ESTIMATE except SW1 |
| Programming-pad access | With the back cover off and the cell in place the pogo reaches pads in the left strip (x 1.65-3.15). Not possible if the cover screws go from the top through the board (section 7) | CHECKED geometry, assembly path ESTIMATE |

Cell bay: MECH uses 3.8 + 0.2 foam = 4.0. Rev B added 0.3 mm swell and tolerance (revB finding 5, ESTIMATE); rev C dropped it. Use 4.3.

---

## 4. LCD FPC and J1 (question 3)

- J1 at (14, 31), top side, pads y 28.5..33.5 (CHECKED). Mouth faces +y; signal tails at y 29.15; lever front at y 35.4 (FROM SOURCE revB, from the KiCad footprint). Glass bottom edge y 35.8, FPC exit at the 6 o'clock edge (FROM SOURCE revB, Sharp datasheet).
- Rev C path: FPC leaves the glass edge at z 2.30 heading +y, folds 180 degrees toward the rear (the allowed direction: "do not bend toward the polarizer side", datasheets.md 4.2), and returns at z about 0.5 heading -y into the mouth. Vertical separation about 1.8 mm, centre-line radius about 0.9, inner radius about 0.8 mm, above the R0.45 minimum. The bend centre is at 0.8-6.0 mm from the glass edge if it starts at y >= 36.6. Both numbers CHECKED by arithmetic; FPC thickness is NOT READ, so the inner radius is ESTIMATE.
- Result: **better than rev B on the bend rule** (rev B: 5.7 mm drop, second bend 7.7-8.5 mm out, 1.7-2.5 mm outside the rule; blockers 1 in revB mechanical.md). The 180 degree fold counts as one of the three allowed bends.
- Still the **same** unknown as rev B blocker 2: which face carries the fingers. After a 180 degree fold the finger face flips. The FH12-10S-0.5SH is bottom-contact (fingers must face the board). So the fingers must face the viewer at the glass. Sharp's connector list pairs top-contact CFP-4510 with the bent FPC (FROM SOURCE revB finding 2, not re-verified). The risk of needing the top-contact FH12A is unchanged. CANNOT TELL without a panel.
- **Worse** in four ways:
  1. The loop (outermost point about y 37.6) lies 1.6 mm outside the board edge (y 36). The case length must grow by about 1.7 (included in section 9).
  2. J1 (x 14.0) is not under the FPC exit if the LCD moves to x >= 6.6 (BLOCKER 1 fix a): the FPC then runs 5.9 mm sideways. Move J1 to about x 20 (R9, R10, C21, RT1 must move) or recentre.
  3. The FPC length past the glass must be at least about 10.5 mm (0.8 straight + 2.8 half circle + about 7 to the fingertip at y about 29.4, ESTIMATE); length is NOT READ.
  4. Reachability: J1 is **under the glass** (glass edge 2.3 mm past J1's pads, lever swing zone y 33..35.4 under the glass). It cannot be opened or latched once the LCD is in place, so the FPC must be latched with the LCD flipped out beside the board and then folded over, with the lens bond made after. No rework or LCD swap without destroying the lens bond. ESTIMATE of the sequence, geometry CHECKED.
- Fix: put the panel in hand (finger face, pin 1 side, length, stiffener position); decide J1 type from it; move J1 under the FPC exit; give the loop 1.7 mm of case.

---

## 5. Motor (question 4)

- Keep-clear circle centre (5.3, 22.7), R4.1; motor R4.0 (CHECKED gen_pcb.py).
- Neighbours (CHECKED, pcbnew): D2 pad edge y 18.15 vs circle top 18.6 -> 0.45 to the circle, 0.55 to the can. C3 / Y1 at x >= 10.1 -> 0.7 mm to the circle. M1 lead pads x 1.6..4.8, y 27.3..29.1: nearest corner 4.63 from the centre -> 0.53 to the circle, 0.63 to the can. No other pad within 4.6 of the centre.
- Above: the LCD underside at 2.30 against a can of 2.1 + tape: clearance -0.05..0.10 (finding 3).
- **Vias under the motor: 5** at (4.3, 22.7), (5.5, 22.3), (4.3, 19.3), (4.3, 25.7), (3.7, 26.3) (CHECKED). The can is steel; whether the vias are tented is not set (mask expansion 0.025, no tent flag read). An untented via under a metal can with tape that squeezes thin is a short risk. Fix: tent them, or keep the zone via-free, or lay a solid GND pour with no via pads.
- M1 pads are hand-soldered; leads of about 4.6 mm cross a gap to the can. Wire strain and routing are not drawn.
- Coupling to the wrist: the motor is on the display side. Its path is board 0.8, then either the foam/cell bay (the circle overlaps the cell for x 6.2..9.4) or the empty strip, then the back cover. Whether 0.25 Grms (FROM SOURCE usbc_motor.md, fixture figure) is felt at the skin through a soft foam and a 4 mm bay is unknown. Needs an accelerometer on the back cover.
- The 8 mm can is 14 mm from the antenna section: low RF risk.

---

## 6. USB-C: wall, strain, water (question 5)

- Wall 1.8 equals GCT's panel thickness 1.80 (CHECKED p2). Nose 1.90 versus wall 1.80 -> nose flush with the outer face only if the flange sits 0.1 inboard of the wall (CHECKED arithmetic, finding 6). Overhang 2.10 = 1.8 + 0.3 (CHECKED MECH). The plan numbers are consistent at nominal; the tolerances are not (finding 6).
- Vertical position and the 10 mm case: BLOCKERS 1-2.
- Strain relief: plug mating force is 5-20 N (drawing p1). ESTIMATE: a 5 N side load at a 12 mm lever (2.1 overhang plus plug body) is about 60 N mm. It is carried by four plated 0.5 x 1.1 slots 3.0 mm apart in x and by the nose in the wall hole (about 0.4 mm of play per side, 9.14 x 3.36 against 8.34 x 2.56). The board is only 0.8 mm and the notch leaves a 6.3 x 5.35 corner peninsula carrying H1. No calculation or pull test exists. Fix: wall hole snug to the nose (0.1 per side) so the case, not the solder, takes the load; pull and wiggle test on a prototype.
- Water path through the receptacle: the opening is a through-cavity with 6 exposed contacts. Whether the contacts are sealed inside is NOT STATED (IP67 "mated vs unmated: NOT STATED", usbc_motor.md 1.3). The board notch leaves a 0.15 mm gap each side and open space behind the body, so everything depends on the part sealing itself internally and on the gasket. CANNOT TELL; needs a leak test with the port empty and with a plug.

---

## 7. Lugs, strap, bosses, screws, ledges

MECH: lug gap 20.0 (+0.10/-0), bar centre 3.2 from the case face, lug length 5.2, lug thickness 4.0, bar 1.5, hole 1.1 x 1.8 deep (CHECKED).

- Defensible against research/strap.md (all [E] estimates there, no source for lug design): gap 20.0 +0.10/-0 for a retail quick-release strap, hole 1.1 (1.2 modelled, ream to 1.1), depth 1.8 over the 1.5 tip length (strap.md line 53), lug thickness 4.0 minimum.
- **Not defensible:** bar centre to lug end = 5.2 - 3.2 = **2.0 mm**, below strap.md's own 2.4 minimum; wall around the hole 2.0 - 0.55 = 1.45 < 1.5.
- **MJF PA12:** printed tolerance +-0.25 (strap.md line 171, enclosure.md) cannot hold a 20.0 +0.10/-0 gap; strap.md says model 20.2 and ream. Holes 1.1 are at the printer's minimum feature. Anisotropy (weaker in z) is unaddressed. Revb's load estimate (31 MPa at 50 N with a stress concentration of 2, versus 30-48 MPa for PA12) is marginal and unrefined: lug root dimensions in z are not in MECH.
- **Moulded plastic:** a 1.1 mm hole with 1.45 mm wall around it and a 4.0 mm lug is a normal PC/ABS rule of thumb, but nothing is sourced; no draft, no fillet R >= 1.0 (strap.md blend note), no flow direction.
- **Missing:** lug height in z and where the bar sits in z (centre at z = 5.0 puts a 3-4 mm strap 3 mm off the skin: the watch will rock); wrist curvature clearance of the back; strap tail clearance; which strap (gap 20 in a 34.2 case is 1.7:1, strap.md prefers about 2:1); spring-bar shoulder load; fatigue and impact test (dive, sleeve snag); the lug pair sits at the antenna end, see RF.
- **Corner holes (1.6 mm NPTH):** MECH specifies "M1.4 thread-forming, boss OD 2.8, pilot 1.12" (matches enclosure.md 5.1 for ABS, extrapolated by that file's own admission). A 2.8 boss cannot pass a 1.6 hole, so either the board sits on bosses from the back with screws from the top through the board (then the LCD covers the screws and the "back cover off with the cell in place" programming access is false), or the load path is undefined in MECH. The lower bosses (2.2, 33.8) and (27.8, 33.8) are under the glass (x 1.7..28.3, y to 35.8).
- **Lens bond ledge:** a 1.8 wall gives about 1.2-1.4 mm of land after the inner lip; adequate for adhesive on paper, no recess means the lens edge is exposed. Hard-coat PC bonding needs a test (enclosure.md 3.3).
- **Footprint check:** the LCD (26.6 x 30.3) plus 0.3 + 0.3 clearance and 2 x 1.8 walls needs 30.8 mm wide, so the 34.2 comes from the board plus the USB overhang, not from the LCD. After BLOCKER 1 the width is set by the LCD x 6.6..33.2: see section 9.

---

## 8. RF (question 8). Ranked risks, all ESTIMATE until measured

Geometry (CHECKED): module U1 x 9.75..20.25, y 0.65..16.15, antenna section y 0.65..4.45 (FROM SOURCE revB rf.md); keep-out x -1..33, y 0..4 all six layers; check_antenna.py reports 0 foreign copper items there (out/check_output.txt).

1. **LCD glass, ITO and FPC (HIGH).** Glass edge y 5.5 is only 1.05 mm from the antenna section in plan, 0.25 mm above the module top (2.30 vs 2.05), and covers 10.7 mm of the module body. Rev B had it overlapping the section; rev C is better by 2.3 mm and still inside the 4 mm near field that Infineon AN91445 gives (FROM SOURCE revB rf.md; a different antenna, direction only).
2. **USB-C stainless shell, 3.9-4.2 mm tall (HIGH, new in rev C).** Nearest corner (6.3, 5.23) to the antenna section corner (9.75, 4.45) is **3.54 mm** (CHECKED arithmetic). It is tied to the GND planes through four stakes starting at y 4.25. It is a tall grounded metal block beside the radiator, asymmetric about the antenna, 4 times the height of the module's antenna element.
3. **Steel spring bar (MEDIUM-HIGH, not in any earlier review).** A 20 mm bar sits about 5.3 mm beyond the case face, across the antenna end, 5.9 mm from the module's end (board edge y 0; the bar is at -2.1 - 3.2 = -5.3); plus the buckle and the wrist behind it. Plastic bars or a pin-less lug would remove it.
4. **Wrist and cell (MEDIUM).** Skin to the module top is about 5.8 + 1 = 6.8 mm over the antenna (CHECKED arithmetic from the stack, antenna height ESTIMATE), above the 5 mm in the Raytac/FCC grant condition (FROM SOURCE revB rf.md finding 5). A foil cell starts at y 9.8, 5.35 mm in plan from the antenna section; the board and its ground planes lie between. A wrist lying under the antenna end is the realistic worst case; the 5 mm figure only holds on a flat wrist and a rigid back (the back should be convex per revB).
5. **Screws (MEDIUM-LOW, contradiction).** gen_pcb.py says the top holes are "plastic posts only, no metal screws"; MECH says M1.4 thread-forming for all four. H1 (2.2, 2.2) and H2 (27.8, 2.2) are inside the keep-out strip, 7.5 mm from the module's corners. Infineon: no screws in the keep-out (FROM SOURCE revB rf.md). Use nylon or plastic bosses at the top holes.
6. **Case plastic (MEDIUM, tunable only by geometry).** Wall 2.1 mm from the antenna end plus the lens. The module's match is internal; nothing on the board can retune it.
7. **U4, SWD pad stubs, motor can (LOW).** U4 is about 3.3 mm from the module's right side; the can is 14 mm away.

Raytac guidance and the earlier RF review found no printed distance to batteries or metal (revB rf.md); everything above is therefore comparative.

What must be measured (parts in hand): radiated RSSI/PER and TRP of the assembled stack against a bare MDBT50Q dev board at 1, 5, 10 m (revB rf.md test plan, steps 1-4), repeated with: LCD fitted, a dummy LCD (glass with ITO or foil), the USB4715 shell fitted on a blank board versus omitted, the cell, the spring bar, and with the wrist (or a phantom) under the back; edge channels 2402/2480 MHz for detuning; plastic versus metal screws; antenna rotated to the 3 o'clock edge as a variant. No conducted S11 is possible with this module.

---

## 9. Corrected stack, case sizes and the three options

### Corrected stack (receptacle kept on the top side, LCD clear of it): 11.6 mm

| Layer | MECH rev C | Corrected | Why |
|---|---|---|---|
| Back cover | 1.00 | 1.00 | unchanged |
| Cell and foam | 4.00 | 4.30 | +0.3 swell/tolerance (revB finding 5, ESTIMATE) |
| PCB | 0.80 | 0.80 (0.9 at +0.1) | drawing +-0.10 |
| Parts zone to lens underside | 2.15 + 0.15 + 0.74 + 0.15 = 3.19 | 4.51 (flange 4.21 + 0.30) | BLOCKER 1 |
| of which LCD stack | gap 2.30 | underside 2.7 min, LCD 0.74, OCA 0.15 sit inside the 4.51 | finding 3 |
| Lens | 1.00 | 1.00 | unchanged |
| **Total** | **10.0** | **11.6** | |

If the LCD stays over the receptacle: 12.5 mm. If the receptacle is flipped to the bottom (bay 4.5 for the 4.21 flange): 1.0 + 4.5 + 0.8 + 2.7 + 0.74 + 0.15 + 1.0 = **10.9 mm** (ESTIMATE; needs the seam, port centre height 3.5 from the back, and a floor 0.5 mm under the 5.90 step checked; the part must be soldered on the B side, which changes pad order viewed from the top, still benign for A5/B5).

### Corrected plan size
- Width (receptacle on top): LCD x 6.6..33.2 sets the right wall at 33.5; outer from -2.1 to 33.5 + 1.8 = **37.4**. The board stays 30 wide; the LCD overhangs it by 3.2 mm; J1 moves under the FPC exit.
- Length: loop outermost y 37.6 + 0.3 clearance + 1.8 wall + 2.1 top = **41.9** (MECH 40.2).
- Flipped receptacle: width about 34.8 (board 30.6 so the cell can move 0.5 from the connector), length 41.9, thickness 10.9.
- O-ring: with a 1.8 wall it does not fit; with a 3.5 mm lip add 3.4 to each dimension. Prefer a gasket and adhesive.
- Lugs add about 5.2 at each end (MECH).

### The three options
| | A: rev B (36 x 44 x 11-12) | B: rev C as claimed (34.2 x 40.2 x 10.0) | B corrected (this review) | C: smallest practical (ESTIMATE) |
|---|---|---|---|---|
| Size | 36 x 44 x 11-12 | 34.2 x 40.2 x 10.0 | 37.4 x 41.9 x 11.6 (flip option 34.8 x 41.9 x 10.9) | about 31 x 39 x 9.5 |
| What limits it | module + cell > board, FPC 5.7 mm drop, no motor home | none claimed | USB-C 4.21 mm tall, FPC loop, gasket | LCD 26.6 wide, antenna 4 mm clear of the glass, cell 3.8 mm |
| Honest? | the numbers of that review | **No** | closest to what I can check | |

Is B's headline honest? **No.** It depends on a USB height 2.4 mm too low, a cell bay without swell, a 0.10 mm margin over the module and none over the motor, an FPC loop left out of the length, an O-ring groove wider than the wall, and a lens plane the receptacle would run into. The corrected case is not smaller than A in thickness (11.6 vs 11-12) and is about 1.4 mm wider and 2.1 mm shorter than A's 36 x 44. B's real gain is the removal of the rev B FPC drop and of the 10 mm motor problem, not the footprint.

C needs, in order: (1) no board-edge waterproof receptacle (magnetic or spring charging contacts on the back, or a side contact pair): removes the notch, the overhang and 4.21 mm; (2) a lower module (about 1.1 mm class, not the Raytac 2.05; revB listed ISP1807-class 1.0-1.1, not verified) or the module and motor outside the LCD footprint, so the parts zone drops from 2.7 to about 1.6; (3) an 0.7 mm lens (glass or thin PC) and a 3.0-3.4 mm cell; (4) walls of 1.2-1.4 and an adhesive back, no O-ring; (5) the module's antenna end still beyond the glass: length about 38-39 whatever the width. Thickness estimate 1.0 + 4.2 + 0.8 + 1.6 + 0.74 + 0.15 + 0.7 = 9.2 (9.5 with margin); width 26.6 + 2 x (0.3 + 1.3) = 29.8, 31 with a switch strip. Nothing in C has a drawing, a footprint or a measurement.

---

## 10. Needs parts in hand (priority)

1. Sharp LS013B7DH03 with FPC: finger face, pin 1 side, FPC length past the glass, stiffener position, thickness, outline; fold test around R0.8.
2. GCT USB4715-GF-A with USBTJ-04 gasket: confirm 0.55 below the feet plane, 4.21 above, nose centre height, tail reach on the pad (0.40 vs 0.65 overlap), nose length 1.90, leak test with the port empty, pull test on the 0.8 mm board.
3. Cell: width, thickness over a lot, swell after cycling, lead exit, protection-board bulge.
4. Motor thickness with tape; module and J1 heights by calipers on an assembled board; SKRTLAE010 stem height and rest position.
5. Radiated RF comparison on the stack, with and without LCD, USB shell, cell, spring bar, wrist or phantom.
6. A printed case in nylon and a CNC or moulded sealing face to test the gasket scheme.

## 11. What I could not verify
- The tail projection (0.85) and the 0.55/4.21 reading come from my reading of a rendered PDF; the arithmetic ties to the Mouser 4.21 figure but the drawing has no 'above PCB' callout.
- Port centre height; panel callout mapping (5.50/5.90/3.36).
- FPC thickness, length, finger face; J1 height; lever swing.
- Every height tagged ESTIMATE.
- No file here gives the case assembly sequence or the screw load path; I treated them as undefined.
