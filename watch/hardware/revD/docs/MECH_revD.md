# Mechanical design, rev D

Everything here is a computer model. Nothing has been printed, machined, measured or fitted. "SEEN" means read on a manufacturer drawing or page; "EST" means an estimate that a real part must confirm.

## Files

| File | What it is |
|---|---|
| `cad/params.py` | Every dimension, with its SEEN / EST / DESIGN tag. Edit here. |
| `cad/build.py` | Builds all solids, the assembly, STEP files, views and the checks (`python3 cad/build.py`; needs `pip install cadquery`). |
| `cad/assembly.step`, `cad/exploded.step` | Whole watch, and the same parts pulled apart. Open in FreeCAD, Fusion 360, Onshape or SolidWorks. |
| `cad/step/*.step` | One STEP file per part (23 parts). |
| `cad/report.md` | Part volumes, every overlap between solids, every checked clearance. |
| `mech/pitchiq_watch_revD_layout.svg` | Dimensioned plan and section, generated from the same parameters (`scripts/mech_drawing.py`). |

The model is parametric in the sense that matters here: change a number in `params.py`, rerun, and every part, the STEP files, the drawing and the checks follow. The board outline, notch, holes and part positions are read from the PCB source (`scripts/gen_pcb.py`), so the case cannot silently disagree with the board. It is a Python (CadQuery) model, not a FreeCAD or Fusion feature tree. The component bodies are envelopes at datasheet size, not vendor models.

## Exterior

| | Value |
|---|---|
| Case | 34.8 x 41.8 x 11.19 mm |
| Over the lugs | 53.0 mm |
| Strap | 20 mm quick-release |

Stack, lens to back: lens 1.00, adhesive 0.15, display 0.74, clearance 0.35, top-side parts 2.35, board 0.80, bay 4.80, back 1.00.

The bay grew from 4.5 to 4.8 mm in this revision. The USB-C gasket's sealing face needs solid wall below it, and at 4.5 mm only 0.24 mm was left between the gasket and the case/back joint. At 4.8 mm it is 0.54 mm. The extra depth also gives the cell 0.5 mm of swelling room.

## Parts

| Part | Material and process (prototype) | Notes |
|---|---|---|
| Case | MJF nylon PA12, or CNC ABS/PC for sealed units | Walls 1.8, corner radius 4.0, four integral lugs, lens ledge, board stop ribs, two locating pins at the antenna end |
| Port plate | CNC acetal or SLA tough resin, reamed | 14.4 wide, full wall thickness. Carries GCT's pocket (11.00 x 5.90 x 0.90) and opening (9.14 x 3.36). Bonded into the case |
| Back cover | Same as case | 1.0 thick, four ears under the lugs for the screws, gasket groove, two posts with pins under the board, cell stop rib |
| Lens | 1.0 mm hard-coated PMMA or glass, 29.4 x 34.7, R1.5 | Bonded on a 1.2 mm ledge with die-cut tape |
| Back gasket | 1.0 wide x 0.5 thick silicone or PORON, die-cut or cut by hand | Sits in a 0.35 groove: 0.15 compression (30%) |
| USB-C gasket | GCT USBTJ-04 (comes in the connector kit) | 1.50 free, 0.90-1.05 compressed |
| Button plunger | Turned or printed, 2.0 shaft, 3.0 inner head | Retained by its head; O-ring 1.5 x 0.5 in the wall |
| Cover screws | 4 x M1.4 x 5 thread-forming for plastic | Size is an estimate, not picked from a catalogue |
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
2. The wall has a window 0.4 mm larger all round than the port plate.
3. With the board seated, the plate (with the gasket in its pocket) is pushed against the flange until the gasket is at 0.975 mm (0.075 mm gap between flange and wall face, set with a shim), then bonded to the case with epoxy or UV adhesive.
4. A small fillet of RTV around the flange is the second barrier.
5. Each unit gets a leak test.

Insertion loads: GCT gives 5-20 N to mate and 6-20 N to unmate. Pushing a plug in presses the flange into the gasket (toward the wall). Pulling a plug out is carried by the four shell stakes and six solder tails; the board in turn is held by the rib at that wall. No pull-strength figure for the stakes was found. Treat connector retention as a test item.

What stays unproven: the bond's long-term seal, the gasket's real free thickness (its drawing tolerance is larger than the window), the seal with a plug inserted, and sweat. No water-resistance claim is made.

## Tolerance analysis

| Chain | Nominal | Contributors | Worst case | Verdict |
|---|---|---|---|---|
| USB-C gasket gap, tolerance-only | 0.075 | case wall position 0.25 (MJF), board in case 0.30, connector on board 0.10 | +/-0.65 | Does not fit a 0.15 window: hence the port plate |
| USB-C gasket gap, with the bonded plate | 0.075 | shim 0.02, bond shrink/creep 0.03 EST | +/-0.05 | Fits, if the bond step is done with care |
| Lens to display | 0.15 adhesive | tape 0.02 | | Fine |
| Display underside to tallest top part (module 2.05 +0.2) | 0.65 | board seat 0.1, display bond 0.05, module 0.2 | 0.30 left | Fine |
| Cell to back cover | 0.50 | cell thickness: 3.8 for the chosen cell, other 402025 cells up to 4.5 | -0.2 with a 4.5 mm cell | Use the 3.8 mm cell or raise `bay` |
| Cell to USB-C body | 0.50 | cell width up to 20.5 on other cells, placement 0.3 | 0.0 | Cell must be located by the back cover's rib and foam |
| Cell to side switch | 1.20 | same | 0.5 | Fine |
| Board edge to wall | 0.30 | MJF 0.25, board 0.10 | -0.05 | Ream or file printed cases; fine in CNC |
| Lug gap for a 20 mm strap | 20.00 +0.10 | MJF 0.25 | | Model 20.2 and ream when printing |
| Back gasket compression | 0.15 of 0.50 | groove 0.1, gasket 0.05 | 0 to 0.3 | Marginal in MJF; cut gasket from 0.6 stock if leaks |

## Clearances and interference

From `cad/report.md` (generated). No part overlaps another except three intended ones (screw threads in their pilots, the cable in its connector, the receptacle body sitting in the board notch). All 21 checked clearances meet their minimum. Smallest: plunger to switch 0.04 (meant to touch), strap to lugs 0.10 a side, lens to display 0.15, display to case opening 0.20.

## Preliminary structural estimates (not simulations)

- Lug tear-out. Each bar tip sits 1.9 mm deep in a 1.0 mm hole, 2.4 mm from the lug end. Two shear planes of about 1.9 x 1.9 mm per tip, PA12 shear strength taken as 29 MPa (0.6 x 48 MPa tensile): about 200 N per tip, 400 N per bar, before any safety factor. With a factor of 3 for printed parts, about 130 N working load per bar. No test has been done; printed nylon lugs are the first thing to pull-test.
- Cover screws. Four M1.4 screws in the lug roots. The long sides of the cover span about 38 mm between screws; a 1.0 mm nylon cover may not hold gasket pressure in the middle. If it leaks there, the fixes are a stiffer cover (CNC, or 1.5 mm) or adhesive gasket tape.
- Button. Switch force 1.6 N, O-ring drag unknown. The plunger's inner head stops it leaving the case.

No finite-element analysis was run.

## Assembly sequence

1. Bond the lens to the case ledge. Bond the display to the lens underside inside the opening (frame of tape), tail toward the lower end.
2. Fit the button O-ring and plunger from inside.
3. Board (already assembled and tested): solder motor leads, stick the motor down. Fit the USB-C gasket into the port plate.
4. Latch the display cable into J1 with the board held at an angle, then swing the board down onto the ribs and the two locating pins.
5. Set the port plate against the connector with the shim, bond it, add the RTV fillet. Let it cure.
6. Solder the cell leads, check polarity with a meter, bridge the battery jumper. Lay the cell on its foam pad.
7. Program through the five pads beside the cell (they stay reachable with the cell in place).
8. Fit the back gasket and cover, four screws.
9. Fit the strap.

Serviceable afterwards: back cover, cell, strap, board. Not serviceable without damage: lens, display, port plate.

## Prototype manufacturing plan

1. One fit-check set in MJF PA12 (case, cover, plate, plunger) from a print bureau. Purpose: does everything go in. Not for sealing.
2. Measure real parts, update `params.py`, rebuild.
3. One CNC set (or SLA tough resin, reamed) for sealing and strap tests.
4. Lens: laser-cut 1.0 mm hard-coated acrylic for the first units.

No quotations were obtained. Bureau design-guide tolerances: MJF +/-0.25, CNC +/-0.13.

## Size comparison

| | Reference | Rev C | Rev D (recommended) | Smaller alternative |
|---|---|---|---|---|
| Case | 36 x 43 x 12 | 34.8 x 41.8 x 10.9 | 34.8 x 41.8 x 11.2 | about 34.8 x 40.6 x 10.7 |
| What changes | | | +0.3 for the gasket land and cell swell | Needs a 1 mm-tall radio module (-0.5 thickness, new board) and a shorter display cable loop (-1.2 length); neither can be confirmed without parts |

Rev D is the recommended size. The preferred 34 x 40 x 11 target is missed by 0.8 mm in width (set by the display glass plus walls), 1.8 mm in length (the display cable fold) and 0.2 mm in thickness (the USB-C connector's height).
