# Mechanical design, rev E

Everything here is a computer model. Nothing has been printed, machined, measured or fitted. "SEEN" means read on a manufacturer drawing or page; "EST" means an estimate that a real part must confirm.

## Files

| File | What it is |
|---|---|
| `cad/params.py` | Every dimension, with its SEEN / EST / DESIGN tag. Edit here. |
| `cad/build.py` | Builds all solids, the assembly, STEP files, views and the checks (`python3 cad/build.py`; needs `pip install cadquery`). |
| `cad/assembly.step`, `cad/exploded.step` | Whole watch, and the same parts pulled apart. Open in FreeCAD, Fusion 360, Onshape or SolidWorks. |
| `cad/step/*.step` | One STEP file per part (24 parts), nominal dimensions. `cad/step_mjf/` holds the same parts with printing allowances. |
| `cad/report.md` | Part volumes, every overlap between solids, every checked clearance. |
| `mech/pitchiq_watch_revD_layout.svg` | Dimensioned plan and section, generated from the same parameters (`scripts/mech_drawing.py`). |

The model is parametric in the sense that matters here: change a number in `params.py`, rerun, and every part, the STEP files, the drawing and the checks follow. The board outline, notch, holes and part positions are read from the PCB source (`scripts/gen_pcb.py`), so the case cannot silently disagree with the board. It is a Python (CadQuery) model, not a FreeCAD or Fusion feature tree. The component bodies are envelopes at datasheet size, not vendor models.

## Exterior

| | Value |
|---|---|
| Case | 34.8 x 42.1 x 11.49 mm body. On the right side a 5 mm round boss stands 1.0 mm proud at the button and the cap 0.6 mm more: 36.4 mm across the button |
| Over the lugs | 53.3 mm |
| Strap | 20 mm quick-release |

Stack, lens to back: lens 1.00, adhesive 0.15, display 0.74, clearance 0.35, top-side parts 2.35, board 0.80, bay 5.10, back 1.00.

The bay grew from 4.5 mm (rev C) to 5.1 mm. The reason is the USB-C port plate: the gasket pocket sits low on the wall, and the plate needs at least 0.6 mm of solid material under the pocket. The mechanical audit found only 0.02 mm there in my first rev D model. The fix was a deeper bay (5.10) and a pocket 5.30 mm high instead of GCT's 5.90 (still 0.22 mm clear of the gasket all round). The deeper bay also gives the cell 0.8 mm of swelling room. The case length grew 0.3 mm so the display cable's fold starts at least 0.8 mm past the glass edge, as Sharp requires.

## Parts

| Part | Material and process (prototype) | Notes |
|---|---|---|
| Case | MJF nylon PA12, or CNC ABS/PC for sealed units | Walls 1.8, corner radius 4.0, four integral lugs, lens ledge, board stop ribs, two locating pins at the antenna end |
| Port plate | CNC acetal or SLA tough resin, reamed | 14.4 wide, full wall thickness. Carries the gasket pocket (11.00 x 5.30 x 0.90; GCT draws 5.90 high) and GCT's opening (9.14 x 3.36). Bonded into the case |
| Back cover | Same as case | 1.0 thick, four ears under the lugs for the screws, gasket groove, two posts with pins under the board, cell stop rib |
| Lens | 1.0 mm hard-coated PMMA or glass, 29.4 x 34.7, R1.5 | Bonded on a 1.2 mm ledge with die-cut tape |
| Back gasket | 1.0 wide x 0.5 thick silicone or PORON, die-cut or cut by hand | Sits in a 0.35 groove: 0.15 compression (30%) |
| USB-C gasket | GCT USBTJ-04 (comes in the connector kit) | 1.50 free, 0.90-1.05 compressed |
| Button plunger | Turned or printed, 2.0 shaft, 3.0 inner head, 0.5 mm soft pad on its tip | Retained by its head; O-ring 1.5 x 0.5 in a gland in the 2.3 mm bore. The pad absorbs the stack-up (about +/-0.4 mm against 0.2 mm of switch travel) and lets the board pass the plunger on assembly |
| Cover screws | 4 x M1.4 x 5 thread-forming for plastic | Size is an estimate; the sourcing audit found no catalogue part. Fallback to price and model before any case order: M1.6 screws into heat-set brass inserts (McMaster 92120A150 was the audit's suggestion; not modelled, lug root width not re-checked for it) |
| Spring bars | 2 x Archer quick-release, 1.8 body, 0.9 tips | Come with the strap |
| Strap | Archer 20 mm quick-release silicone, black, 3 mm thick, 75 / 120 mm | $19.99 seen |

## USB-C sealing strategy

Options compared (detail and sources in `research/mech_inputs.md`, section B):

| Option | Seal quality | Thickness | Cost and assembly | Verdict |
|---|---|---|---|---|
| Connector on the board, pocket moulded into the case wall | Fails by arithmetic: the gasket needs its gap held within 0.15 mm, and a printed case plus board plus solder chain is about 0.65 mm worst case (0.38 RSS) | none | cheapest | Rejected |
| Board allowed to float toward the port | Seal depends on a spring force we cannot size without parts | none | fiddly | Rejected for now |
| **Separate port plate bonded in after setting the gap** | Gap set by measurement on each unit, not by tolerances | none | one small extra part, one bond step, a jig | **Chosen** |
| USB-C on its own small board screwed to the case | Best mechanically | likely +0.5 | new board, a flex or wires, more assembly | Keep as the fallback |
| Panel-mount waterproof USB-C | none found in a 6-pin charge-only size | | | Not available |
| Potting around the shell | Works, not serviceable | none | messy | Used only as a backup fillet |

How the chosen option works:

1. The receptacle is soldered to the board as designed. Its flange faces the inside of the left wall.
2. The wall has a window 0.15 mm larger than the port plate. The window locates the plate up-down and along the wall; only its depth is free.
3. With the board seated, the plate (with the gasket in its pocket) is pushed against the flange until the gasket is at 0.975 mm (0.075 mm gap between flange and wall face, set with a shim), then bonded to the case with epoxy or UV adhesive.
4. A small fillet of RTV around the flange is the second barrier.
5. After cure, the case's bottom face is lapped flat across the plate joint, because the back gasket crosses it.
6. Each unit gets a leak test.

Insertion loads: GCT gives 5-20 N to mate and 6-20 N to unmate. Pushing a plug in presses the flange into the gasket (toward the wall). Pulling a plug out is carried by the four shell stakes and six solder tails; the board in turn is held by the rib at that wall. No pull-strength figure for the stakes was found. Treat connector retention as a test item.

What stays unproven: the bond's long-term seal, the gasket's real free thickness (its drawing tolerance is larger than the window), the seal with a plug inserted, and sweat. No water-resistance claim is made.

## Tolerance analysis

| Chain | Nominal | Contributors | Worst case | Verdict |
|---|---|---|---|---|
| USB-C gasket gap, tolerance-only | 0.075 | case wall position 0.25 (MJF), board in case 0.30, connector on board 0.10 | +/-0.65 | Does not fit a 0.15 window: hence the port plate |
| USB-C gasket gap, with the bonded plate | 0.075 | shim 0.02, bond shrink/creep 0.03 EST | +/-0.05 | Fits, if the bond step is done with care |
| Lens to display | 0.15 adhesive | tape 0.02 | | Fine |
| Display underside to tallest top part (module 2.05 +0.2) | 0.65 | board seat 0.1, display bond 0.05, module 0.2 | 0.30 left | Fine |
| Cell to back cover | 0.80 | cell thickness: 3.8 for the chosen cell, other 402025 cells up to 4.5 | +0.1 with a 4.5 mm cell | Fits either cell |
| Cell to USB-C body | 0.50 | cell width up to 20.5 on other cells, placement 0.3 | 0.0 | Cell must be located by the back cover's rib and foam |
| Cell to side switch | 1.20 | same | 0.5 | Fine |
| Board edge to wall | 0.30 | MJF 0.25, board 0.10 | -0.05 | Ream or file printed cases; fine in CNC |
| Lug gap for a 20 mm strap | 20.00 +0.10 | MJF 0.25 | | Model 20.2 and ream when printing |
| Back gasket compression | 0.15 of 0.50 | groove 0.1, gasket 0.05 | 0 to 0.3 | Marginal in MJF; cut gasket from 0.6 stock if leaks |

## Clearances and interference

From `cad/report.md` (generated). No part overlaps another except intended ones (screw threads in their pilots, the cable in its connector, the pad on the plunger). Every checked clearance and design rule meets its minimum; the list with values is in the report file.

## Preliminary structural estimates (not simulations)

- Lug tear-out. Each bar tip sits 1.9 mm deep in a 1.0 mm hole, 2.4 mm from the lug end. Two shear planes of about 1.9 x 1.9 mm per tip, PA12 shear strength taken as 29 MPa (0.6 x 48 MPa tensile): about 200 N per tip, 400 N per bar, before any safety factor. With a factor of 3 for printed parts, about 130 N working load per bar. No test has been done; printed nylon lugs are the first thing to pull-test.
- Cover screws. Four M1.4 screws in the lug roots. The long sides of the cover span about 45 mm between screws. The audit's arithmetic gives about 2.4 mm of bowing mid-span for a 1.0 mm nylon cover under gasket load, so **a printed nylon cover will not seal**. The sealing set needs a 1.5 mm aluminium cover (then re-test the antenna) or adhesive gasket tape instead of a compressed gasket. The printed set is for fit only.
- Antenna. A steel spring bar sits about 6.5 mm from the antenna zone and two of the cover screws about 7.3 mm. The board notes say no metal fasteners at that end. For the first range test use a plastic bar and nylon screws at the antenna end, then compare with steel.
- Thin features found by the audit: cover floor under the gasket groove 0.65 mm, screw-head floor 0.55 mm, lug webs 0.64-0.70 mm. Printable in MJF at the limit; fine in CNC.
- Button. Switch force 1.6 N, O-ring drag unknown. The plunger's inner head stops it leaving the case.

No finite-element analysis was run.

## Assembly sequence

1. Bond the lens to the case ledge. Bond the display to the lens underside inside the opening (frame of tape), tail toward the lower end.
2. Fit the button O-ring and plunger from inside.
3. Board (already assembled and tested): solder motor leads, stick the motor down. Fit the USB-C gasket into the port plate.
4. Latch the display cable into J1 with the board held at an angle, then swing the board down onto the ribs and the two locating pins. This step has no proven slack: the connector sits 0.7 mm under the glass and its latch needs about 2 mm to open, and the cable's length is unknown. It must be tried with a real panel before a case design is frozen.
5. Set the port plate against the connector with the shim, bond it, add the RTV fillet. Let it cure.
6. Solder the cell leads, check polarity with a meter, bridge the battery jumper. Lay the cell on its foam pad.
7. Program through the five pads beside the cell (they stay reachable with the cell in place).
8. Fit the back gasket and cover, four screws.
9. Fit the strap.

Serviceable afterwards: back cover, cell, strap. Not serviceable without damage: lens, display, port plate, and therefore the board (it is tied to the bonded plate by the connector and to the display by the cable).

## Prototype manufacturing plan

1. One fit-check set in MJF PA12 (case, cover, plate, plunger) from a print bureau, built from `cad/step_mjf/` (`PQ_PROCESS=mjf python3 cad/build.py`: wider clearances for +/-0.25 mm printing). Purpose: does everything go in. Not for sealing.
2. Measure real parts, update `params.py`, rebuild.
3. One CNC set (or SLA tough resin, reamed) for sealing and strap tests.
4. Lens: laser-cut 1.0 mm hard-coated acrylic for the first units.

No quotations were obtained. Bureau design-guide tolerances: MJF +/-0.25, CNC +/-0.13.

## Size comparison

| | Reference | Rev C | Rev D (recommended) | Smaller alternative |
|---|---|---|---|---|
| Case | 36 x 43 x 12 | 34.8 x 41.8 x 10.9 (could not have been built: USB-C seal) | 34.8 x 42.1 x 11.5 | about 34.8 x 40.6 x 11.0 |
| What changes | | | +0.6 thickness for the port plate, +0.3 length for the cable fold | Needs a 1 mm-tall radio module (-0.5 thickness, new board) and a shorter display cable loop (-1.5 length); neither can be confirmed without parts |

Rev D is the recommended size. The preferred 34 x 40 x 11 target is missed by 0.8 mm in width (set by the display glass plus walls), 2.1 mm in length (the display cable fold) and 0.5 mm in thickness (the USB-C connector's height and the plate that seals it). It is still smaller than the 36 x 43 x 12 reference in every dimension.

## Changes after the re-audit (2026-11-23)

- Button: the 1.8 mm wall could not hold the head counterbore, the O-ring groove and a proper wall each side (the re-audit measured a 0.16 mm lip). A round boss (5 mm x 1.0 mm) now thickens the wall to 2.8 mm at the button. Measured on `cad/step/case.step`: 0.59 mm and 0.60 mm of wall either side of the 0.90 mm groove. The counterbore is 0.70 mm deep, so the plunger can slide 0.25 mm outward to let the board and switch pass on assembly. Side effect: up to 0.25 mm of free play before the button bites; judge on a print.
- O-ring is now defined as 2.0 mm inner diameter x 0.5 mm section for the 2.0 mm shaft. Not sourced.
- Spring-bar centre moved from 3.2 to 3.5 mm off the case end: the web to the cover-screw pilot is 0.94 mm (0.79 mm in the print preset).
- Print preset: port-plate window gap 0.40 mm.
- `cad/report.md` formulas corrected: flex bend start is 0.89 mm (was printed as 1.03), pocket-to-gasket clearance 0.18 mm (was 0.22). Both still pass. Two rule checks added (groove walls, lug web).

## Rev E changes (2026-11-23)

Source: Sharp's outline drawing (spec page 23, fig. 8-1), read directly, and `reviews/e1_mech_geometry_review.md` (measurements on the exported STEP solids).

- **Display tail.** The drawing gives a tail centred on the glass, 13.63 mm long, 9.47 mm wide at the glass, 5.5 mm wide and 0.3 mm thick at the contact end, contacts on the back face, terminal 1 on the right seen from the front. Rev D had the connector 1.3 mm off the centre line and about 5.6 mm too far toward the lower edge: the folded tail would have been 5.6 mm too long to lie flat. The connector is now at board (15.3, 25.4). In the model the tail folds 0.9 mm past the glass at a 0.6 mm radius, runs back just under the glass and dives into the slot; the modelled path is 0.53 mm shorter than the real tail, which the loop absorbs. New rule checks: straight run, fold radius, loop room, tail slack 0 to 0.9 mm, tail centred.
- **Assembly of the display** (replaces step 4 of the sequence above): seat the board in the case. Hold the lens with the glass bonded under it tilted up from its lower edge, feed the tail down through the display opening into the connector (the connector lies under the opening, so tweezers reach the latch from above), close the latch, then fold the lens down onto its ledge. Not tried. The earlier sequence needed the latch closed in a 0.7 mm gap.
- **Glass support.** The glass hangs from the lens by the same 0.15 mm tape frame that bonds the lens to the case (new part `lcd_adhesive`). The lens needs a black printed border: the opening is larger than the 23.04 mm active square.
- **Small parts under the tail.** Resistors, capacitors (0.55 mm tall at most) and seven bring-up test pads sit under the tail's return run, which is 1.38 mm above the board there (envelope part `parts_under_tail`).
- **USB-C in the model** is fixed to the board (flange face at x = -0.225); the port plate follows the connector. Rev D derived it from the case clearance, which stretched the connector in the print preset. Gasket thickness varies by +/-0.25 mm (GCT), so the squeeze must be set per gasket: measure the free thickness t and shim the plate to leave t - 0.5 mm. The plate has no step and is held by adhesive only (about 51 mm2).
- **Button.** Bore 2.12 mm for the 2.0 mm shaft (was 2.30: the O-ring lost its squeeze when the shaft sat off-centre), groove 2.75 mm, boss 1.1 mm. Worst-case squeeze is now 0.06 mm instead of negative.
- **Back gasket.** 0.75 x 0.5 mm cord in a 1.2 x 0.35 mm groove (rev D's groove was 143 % full, which solid silicone cannot do). A printed nylon cover still bows more than the squeeze: a sealing build needs a 1.5 mm aluminium cover.
- **Screws and lugs.** M1.6 screws (no M1.4 catalogue part was found). Lug roots widened to 4.4 mm and lengthened to 6.2 mm, bar centre 4.1 mm from the case end, so a heat-set insert can replace the thread-forming pilot later (insert size not verified). Over the lugs: 54.5 mm. Screw-head counterbore 0.35 mm. Spring-bar tip bearing is about 27 N per tip with a factor of 3 (reviewer's arithmetic): a pull test decides.
- **Board retention.** Locating pins 1.40 mm in 1.6 mm holes (they take the USB plug push). The board is held down by 1.0 mm foam compressed to 0.5 mm on the cover posts; the cell by a foam pad on the cover (new part `cell_foam`).
- **Battery pads** moved to board (28.5, 17.9) and the battery jumper to (28.5, 30.6), bottom side, to free the power chip's via field. Lead exit from the cell is still unchecked.
- **Print preset** (`cad/step_mjf/`): lens recess margin 0.45, port-plate gap 0.55, lug holes 1.2, pins 1.2.
- Body unchanged: 34.8 x 42.1 x 11.49 mm; 36.5 mm across the button.

Not fixed, needs parts or a print: latch access and the swing-in, real switch actuator position, gasket bond and leak, cell lead exit, motor tape thickness, insert size, whether the button boss bothers the wrist.
