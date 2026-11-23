# Mechanical integration review, PitchIQ watch rev B

Reviewer role: wearables mechanical integration. Nothing was built or measured. Board data come from `kicad/pitchiq_watch.kicad_pcb` read with pcbnew (read-only), placement from `scripts/gen_pcb.py`. Part heights are not in the board file; every height below is tagged **[DS]** (read from a datasheet or distributor page this session), **[RS]** (project research file), or **[EST]** (my estimate, must be verified with parts in hand).

Coordinates are board mm, origin top-left, y down. Z is measured from the top face of the PCB (component side) unless stated.

## 0. Dimensioned data used

Plan view (from the board file, bounding boxes include courtyards unless noted):

| Item | Plan extent (x, y) | Source |
|---|---|---|
| Board | 0..32 x 0..36, corner R3, 0.8 thick | gen_pcb.py:15 |
| U1 MDBT50Q module (F) | x 10.75..21.25, y 0.65..16.15 (rotated 90 deg: 10.5 wide x 15.5 tall), chip antenna at the top edge | board file, mcu.md:82 |
| Antenna keep-out | x 6..26, y 0..4 (all layers) | gen_pcb.py:42 |
| Cell outline (Dwgs_User) | x 6.1..25.9, y 8.5..34.5 (19.8 x 26.0) | gen_pcb.py:116 |
| LCD outline (Cmts_User, "a proposal") | x 2.7..29.3, y 2.85..33.15 (26.6 x 30.3), centre x = 16.0 | gen_pcb.py:117 |
| Optical window (Eco1_User) | x 12.5..19.5, y 17.5..23.5 (7 x 6) | gen_pcb.py:118 |
| U3 MAX30101 (B), at (16.0, 20.5) | body 3.3 x 5.6 -> x 14.35..17.65, y 17.7..23.3; courtyard x 13.97..17.92, y 17.44..23.69 | board file |
| Bottom caps C14/C15 | x 10.67..12.53, y 19.1..21.7 | board file |
| Bottom caps C16/C17 | x 19.09..22.11, y 19.05..22.1 | board file |
| Cradle pads TP1..TP5 (B, 2 mm) | y = 28.5, x = 8, 12, 16, 20, 24 (4 mm pitch, 16 mm span) | gen_pcb.py:39 |
| Test pads TP6..TP9 (B, 1.5 mm) | x 5.0 / 8.5, y 12.0 / 15.5 | gen_pcb.py:40 |
| J1 FH12 (F) at (15.0, 31.0) | courtyard x 9.42..20.58, y 27.97..35.92; FPC mouth at y = 34.4 (footprint body to local y 3.4), flip-lock lever outline to y = 35.4; signal tails at y = 29.15 | board file + KiCad footprint Hirose_FH12-10S-0.5SH_1x10-1MP |
| SW1 SKRTLAE010 (F), (29.4, 12.0), rot 90 | pads/courtyard x 27.33..31.72, y 9.14..14.86; actuator stem points +x, tip at x = 29.4 + 2.04 = **31.44**, i.e. 0.56 mm inside the board edge; stem 2.0 wide (y 11..13), protrudes 0.83 beyond the body | KiCad footprint F.Fab (stem y 1.21..2.04, x +/-1.0) |
| M1 motor pads (F) | (29.2, 16.6), pads +/-1.0, courtyard x 27.2..31.2 | board file |
| BT1 cell-lead pads (F) | x 1.58..7.62, y 6.38..10.42 | board file |
| RT1 NTC (F) | x 28.84..30.75 | board file |

Heights (z above PCB top):

| Part | Height | Tag |
|---|---|---|
| MDBT50Q-1MV2 module | 2.05 | [RS] mcu.md:16,82 (tolerance +/-0.15 assumed [EST]) |
| FH12-10S-0.5SH(55) | 2.0 max per Future Electronics listing; Hirose catalog figure for the FH12 series is about 1.0 mm (my recollection, not re-fetched). Both are <= module, so no stack effect | [DS] futureelectronics.com FH12-10S-0.5SH(55) page |
| SKRTLAE010 | 3.3 overall, actuator travel 0.2 mm, force 1.6 N, 4.5 x 3.55 plan | [DS] Mouser 688-SKRTLA page; LCSC C110293 page agrees on 4.5 x 3.4 x 3.3 and 1.6 N |
| TDK MLP2012H inductors L1-L3 | about 1.0-1.2 (not verified; procurement.md:162 lists inductor height as not re-read) | [EST] |
| C12 0805 10 uF 25 V | about 1.25 max | [EST] |
| 0603 10 uF, 0402 | 0.8-0.95 / 0.5-0.6 | [EST] |
| nPM1300 QFN | 0.85 (datasheets.md:70 row, 0.8/0.85/0.9) | [RS] |
| SOT-23 AO3400A | about 1.1 | [EST] |
| Crystal 3215 | about 0.9 | [EST] |
| LS013B7DH03 | 0.741 (module) | [DS] Sharp datasheet Section 3 |
| MAX30101 | 1.55 (5.6 x 3.3 x 1.55, integrated cover glass) | [DS] max30101.pdf |
| Adafruit 1317 cell | 3.8 nominal (user-supplied; lot tolerance and swelling not published) | user brief |
| FIT0774 motor | 10 mm dia x 2.7 mm | [RS] procurement.md:130 |

---

## 1. Findings

### 1. BLOCKER: the LCD FPC cannot reach J1 inside Sharp's bend rules

Sharp LS013B7DH03 datasheet (cdn.sparkfun.com copy, Sections 8-2 / Remarks 8-1, 8-2): FPC exits at the **6 o'clock** edge (consistent with J1 at the bottom), recommended bend area **0.8 to 6.0 mm from the glass edge**, minimum inner radius **R0.45**, **do not bend toward the polarizer**, 3 bends or fewer. The datasheet gives no FPC length, width, thickness or stiffener position.

J1 is horizontal (right-angle) and its mouth faces +y (toward the board bottom edge): KiCad footprint has the signal tails at local y = -1.85, body to y = +3.4, lever to y = +4.4. So the FPC must arrive heading -y at connector height. The display is on top of the cell, so the FPC does a U: out of the glass heading +y, down around the cell end, back under heading -y. Path (z from PCB top, nominal stack from section 2):

- Cell bottom 2.2 (module 2.05 + 0.15), cell top 6.0, foam 0.15, so the LCD bottom and FPC plane are at about 6.2. FPC slot plane in J1 about 0.5. Vertical drop **5.7 mm**.
- The bottom bend cannot start before the lever front (y = 35.4). With centre-line radius 0.5 (R0.45 inner plus half of 0.1 mm FPC), the vertical run sits at y = 35.9, i.e. **0.1 mm from the board edge (36.0)**. The FPC runs outside the PCB outline; the case inner length must grow to at least 37.6 mm (board 36 + 0.2 + loop).
- Distance along the FPC from the glass edge (y = 33.15): straight 2.25, first quarter-bend 0.79, vertical straight 4.7, second quarter-bend 0.79. The **second bend lies 7.7-8.5 mm from the glass edge, 1.7 to 2.5 mm outside the 0.8-6.0 mm rule.** Insertion to the contact tip (about y = 30.5) adds 4.9 mm, so the FPC must be about **13.4 mm long past the glass edge**; its length is unknown (not in the datasheet text I could read).
- With the larger radii a real FPC needs (inner R1.0), the second bend moves out further. Even the idealised minimum-radius path with the lever ignored puts the second bend at 6.4-7.3 mm.
- The cell end (y = 34.5) is 1.4 mm from the vertical FPC run; fine. The FPC and the LCD are not centred on the same line: LCD centre x = 16.0 (gen_pcb.py:117), J1 centre x = 15.0. A 1.0 mm lateral shift in a rigid fold stresses the glass bond (Sharp: "no stress to connective area").

Fix, in order of preference: (a) get a physical LCD and measure FPC length, stiffener extent and pin-1 side before choosing; (b) shrink the drop below about 4.2 mm (that is option B in section 4, where the second bend ends 5.7 mm out, only 0.3 mm of margin); (c) put the connector on a rigid-flex tail or a stiffened extension of the board that folds up to the LCD plane (option C), or solder the FPC to a small daughter board; (d) at minimum, move J1 so its lever does not set the vertical run (rotate J1 so the mouth faces the board and the lever is at the edge only if the FPC can come from above, which it cannot with the cell there). Assembly also needs the FPC latched in J1 before the cell goes in (the lever opens upward by several mm, more than the 0.15 mm of room under the cell over J1).

### 2. BLOCKER: contacts face up after the fold, J1 is a bottom-contact part

Tracking the FPC pad face through the two -90 degree bends (axis along x, so no x mirroring): a face that points down at the glass points **up** at the connector after the 180 degree U. J1 is FH12-10S-0.5SH, a **bottom-contact** ZIF (RS Components listing for 6882801 labels the FH12 10-way as "ZIF Bottom Contact"; the FH12A variant is listed as "ZIF Top Contact", RS 1722481). Sharp's connector list pairs **bottom-contact** types (CFP-4610-0150F, Molex 51441-1093) with Figure 8-1 and the **top-contact** CFP-4510-0150F with the bent-FPC Section 8-2. That is consistent with the fold flipping the contact face. The datasheet does not say which face carries the fingers (disclosed as unconfirmed in the brief), but the datasheet's own pairing plus the geometry says the ordered part is likely the wrong variant.

Fix: before the board order, confirm the FPC finger face on a physical panel. If fingers face the glass side (the usual ACF-on-ledge case), switch J1 to the top-contact FH12A-10S-0.5SH(55) and re-check its land pattern (not necessarily identical; the research file did not read it). Also confirm pin 1 is on the same x side after the fold (x order is preserved by the fold, but the FPC may have pin 1 on the right when viewed from the viewer side).

### 3. BLOCKER: the 10 mm coin motor has no location in this plan

The FIT0774 is 10 mm dia x 2.7 mm. Free areas:

- **Top side, outside the cell:** the right strip is x 25.9..32.0 (6.1 mm wide) and is full of D3, SW1, M1 pads, D1, Q1, R15, C5-C7, C12, U4; the left strip x 0..6.1 holds BT1, JP1, R5, R6/R7, U5, L3. Neither can take a 10 mm disc.
- **Under the cell:** the cell bottom is 2.2 above the board; the motor is 2.7.
- **Bottom side:** U3 and C14-C17 take x 10.7..22.1, y 17.4..23.7; the cradle pads take y 27..30 over x 6.5..25.5; TP6-TP9 take x 3.7..9.8, y 10.7..16.8. The only 10 mm free zone is the top-right of the bottom face (x about 21.5..31.5, y 4..14) with 0.5 mm to the board edge, directly under the accelerometer U4 (23.1..25.9, y 5.1..7.9), which would see the full motor drive. It also needs the back plate 2.7 + 0.1 + 0.8 below the PCB, 2.1 mm deeper than the sensor side (1.6), turning the back into a stepped boss. The sensor window then needs a 2.1 mm light-pipe or the back becomes a 2.1 mm dome; both break the optical rule in finding 6.
- M1 pads are at (29.2, 16.6): 2.8 mm from the board edge, under the LCD overhang. There is no 10 mm disc footprint behind them.

Fix: choose now: (a) an 8 mm coin LRA/ERM (power.md:106 lists 8 x 2.6-3.3 mm LRAs) in a bay that grows the case by about 9 mm in one direction; (b) a 10 mm motor in a bay at the end of the case (+11 mm length, about 35 x 51); (c) a motor on a flex tail beside the board. In every case rigid-mount the motor to the case, not to the PCB, and keep it away from the antenna end and from U4.

### 4. MAJOR: the battery can lie over the component side, but only 1.0 mm above everything except the module

Only the module (2.05) and possibly J1 exceed about 1.25 mm. The cell footprint (x 6.1..25.9, y 8.5..34.5) overlaps the module in x 10.75..21.25, y 8.5..16.15 (10.5 x 7.65 mm). Moving the cell down is not possible: module 15.5 + cell 26.0 = 41.5 mm in a 36 mm board, so at least 5.5 mm of overlap is forced. Consequences:

- The whole cell bottom plane sits at 2.2 mm instead of about 1.45 mm: about 0.75 mm of dead height over about 90% of the cell area. Needs a die-cut spacer or a pocketed foam; do not let the pouch rest directly on the module's RF can (abrasion, short to the shield, heat).
- BT1 pads (x 1.58..7.62, y 6.38..10.42) overlap the cell corner (x 6.1..7.6, y 8.5..10.4). Solder blobs and the 0.5-0.8 mm lead insulation there are fine at 2.2 mm clearance, but the cell lead exit (centre of the short end, x = 16.0, y = 8.5, likely over the module) must be routed 11 mm left to x = 4.6 above the module can. Lead exit position and the protection-board bulge of the 1317 are unknown.
- Cell swelling: allow +0.3 mm over the 3.8 nominal (not in any datasheet; EST). Foam on both faces, not a rigid pocket.
- RT1 (BOM text "place against the cell", BOM.csv) is at x 28.84..30.75, 2.9 mm beyond the cell edge (x = 25.9) and not under it; it senses the board and the air, not the cell. Move it under the cell footprint or add a thermal pad.

### 5. MAJOR: full stack-up (intended order lens / LCD / cell / PCB / sensor / back cover)

Measured from the skin plane (outer face of the sensor window) up to the lens top. Tolerances are +/- values I assumed where no datasheet gives one [EST].

| # | Layer | Nominal | Tol | Note |
|---|---|---|---|---|
| 1 | Window over sensor (glass 0.4; Gorilla-class 0.2-0.5, ADI simulated 0.2-1.0) | 0.40 | 0.03 | |
| 2 | Air gap / gasket window to sensor | 0.15 | 0.10 | ADI: do not exceed 0.8, smaller is better |
| 3 | MAX30101 (with its own cover glass) | 1.55 | 0.10 | [DS] |
| | Skin plane to PCB bottom | 2.10 | | back-plate outer face sits 0.5 above this plane (window protrudes 0.5) |
| 4 | PCB | 0.80 | 0.08 | 6-layer 0.8 mm |
| 5 | Module 2.05 + Kapton 0.05 + clearance 0.15 | 2.25 | 0.15 | tallest part under the cell |
| 6 | Cell | 3.80 | 0.30 (+0.3 swell) | |
| 7 | Foam / adhesive | 0.15 | 0.05 | |
| 8 | LCD | 0.741 | 0.05 | [DS] |
| 9 | OCA to lens (or frontlight film, unknown thickness) | 0.15 | 0.03 | Azumo 11049-06 added thickness NOT FOUND (display.md:60) |
| 10 | Lens (hard-coated PC 1.0; glass 0.55 saves 0.45) | 1.00 | 0.05 | |
| | **Total skin plane to lens top** | **10.99 (11.0)** | RSS 0.39; linear 0.94 (+0.3 swell) | |

Add 0.3 mm for a proud bezel: **11.3 mm skin to bezel**; worst case about 12.3 mm. Case plan size: board 32 x 36 + 0.2 clearance + FPC loop 1.2 at the bottom edge + wall 1.2 = **about 35 x 40 mm**, plus lugs (about 4 mm each end), so about 35 x 48 over lugs. No motor bay yet. With the 5.7 mm drop of finding 1 and the 10 mm motor of finding 3, add 11 mm in one direction.

Closure check: the stack closes in thickness. It does not close in plan for the motor (finding 3) or the FPC (finding 1).

### 6. MAJOR: heart-rate optics

Sources: Analog Devices "Guidelines for the Opto-Mechanical Integration of Heart-Rate Monitors in Wearable Earbud Devices" (analog.com technical article); ADI design note "PPG ID Recommendations - Chest Patch Wearables"; MAX30101 datasheet; PMC7570982.

- **Window:** ADI: cover transmission > 90% at the module wavelengths, index near 1.5 (skin), glass, polycarbonate or acrylic; as thin as the wear allows (simulated 0.2-1.0 mm; Gorilla Glass down to 0.2 mm, > 91% at 532/880 nm). **Air gap not to exceed 0.8 mm**; crosstalk rises with air gap and cover thickness. Design target: 0.4 mm glass (or 0.5 mm clear PC), gap <= 0.2 mm, i.e. sensor face within 0.6 mm of skin.
- **Barrier:** ADI gives **no barrier height or width**; it says absorbing barriers are optional (the module has its own internal barrier). The MAX30101 datasheet gives no LED or photodiode position inside the package, so the barrier line cannot be placed from documents. Single large window = crosstalk path through the cover (light reflected inside the glass). Put black PSA or black ink on the window with a slit aligned between emitter and detector, and a black silicone gasket (shore 40-60) from the sensor shoulder to the window.
- **Leakage paths:** (a) inside the cover glass, as above; (b) through white/natural printed back plates (PA12 SLS and clear resins are translucent to green and IR): use black material; (c) the gap between plate and skin (ambient light); (d) 0.8 mm FR4 board: bottom face is the sensor face, so top-side LED light is not a concern, but the standard green solder mask is not opaque to 880 nm near the sensor; (e) the drawn window (7 x 6) is larger than the sensor optics and **overlaps C16 (x 19.09..22.11) by 0.41 mm**: the aperture should be about 4.2 x 6.0 mm (sensor body 3.3 x 5.6 plus 0.45 mm), leaving 1.4 mm to C16 and 1.8 mm to C14/C15 for the gasket wall.
- **Protrusion and contact pressure:** ADI gives no pressure number and no protrusion distance (only: "protrudes from the bottom of the wrist band", a raised mesa helps contact). PMC7570982 tested 12, 33 and 54 mmHg on the wrist during exercise: **54 mmHg best** (r 0.81-0.95, MAPE 2.4-3.8%), 33 mmHg close (MAPE 2.4-4.6%), **12 mmHg poor (MAPE 8.9-11.8%)**; its contact area was 473 mm2, so 54 mmHg is about 7.2 kPa or 3.4 N there. For a 7 x 6 mm window that scales to about 0.3 N at 54 mmHg (7.2 kPa x 42 mm2), but with strap tension doing the work. Design: back-plate dome 1.5-3 mm high with the window at the apex, protruding 0.5 mm past the dome surface minimum; strap tension is the pressure source, not the case.
- **Flat back versus wrist:** a 32 mm chord across a wrist with a top-of-wrist radius of about 45 mm (estimate from a 60 x 40 mm elliptical cross-section) lifts the edges about 2.9 mm. The sensor at (16.0, 20.5) is near the board centre (16, 18), which is correct; a flat 35 mm back will rock. Use a convex back; mount x across the wrist, y along the forearm.
- **Pogo wells are 2.1 mm below the window face:** the pads (B.Cu) are 1.55 + 0.15 + 0.4 below the window plane minus 0.5 protrusion (plate outer face is 1.6 mm below the PCB bottom). Wells are 1.6 mm deep over the pads, which is workable for a P75-B1 pogo (3 mm stroke, procurement.md:141) but traps sweat.
- **Motion:** a pitching forearm and a catcher's wrist see sharp accelerations and a strap that slips; expect PPG heart rate to be valid at rest only. The brief says the heart-rate estimate is untested; the mechanical contribution is relative motion between window and skin, minimised by 3-7 kPa preload and a tight strap, not by case design alone.

### 7. MAJOR: MAX30101 assembly conflicts with the BOM's SMT assembly

MAX30101 datasheet: the part "should be the last component installed on the board", should not be cleaned with a liquid, baked or coated, "not sealed from dust or liquid", reflow 260 C max. BOM.csv lists U3 as SMT (JLCPCB assembly). A standard fab flow (wash, bake before reflow) violates three of these. Fix: order assembly with "no wash, no bake" and the sensor hand-soldered or placed last, or specify to the assembler that U3 is a hand-mount line item. Because the sensor is not liquid-sealed, the window gasket must seal both to the sensor and to the plate (finding 8).

### 8. MAJOR: cradle pads on the skin side: sweat, corrosion, ESD, sealing, magnets

- Five 2 mm pads at **4 mm pitch, 16 mm span** (TP1-TP5, y = 28.5, x = 8..24). No commercial magnetic connector fits (Adafruit 5467 is 2.2 mm pitch, power.md:141); the cradle is custom. No magnet or ferromagnetic part is in the design; a charging cradle that holds the watch needs a steel plate or magnet in the back (adds thickness near the antenna end, away from y = 28, ok) and alignment features, none designed.
- **Corrosion:** pads are on B.Cu with the project's gold finish assumed (BOM does not state ENIG thickness; JLC standard ENIG is about 0.05 um Au over Ni, porous). Sweat (NaCl and lactic acid, estimated 0.5-2 S/m) plus a continuously biased net corrodes Ni through pores. Biased nets: NRESET is held at 3.0 V by R16 (10 k), VBUS is at the charger input, SWDIO and SWDCLK carry internal pulls. Estimate (mine): a 0.1 mm sweat film bridging the 2 mm edge gap of two neighbouring pads is about 10 kOhm at 1 S/m, comparable to R16, which can pull NRESET into the undefined region (0.9-2.1 V on a 3.0 V rail) and cause resets during a sweaty game.
- **ESD on the skin side:** only VBUS has a TVS (D2); SWDIO, SWDCLK and NRESET (nRF52840 pins, no clamp) connect straight to 2 mm pads facing human skin. Add TVS or series resistors, or do not expose them.
- **Sealing:** five pogo holes through the back plate are five leak paths (sweat, dirt, impact). Better: keep the holes closed. Options: insert-moulded gold-plated stainless or brass contacts flush in the plate, with a conductive elastomer strip (zebra) or spring fingers between plate contacts and the pads (the gap is 0.8-1.6 mm); or silicone O-ring per well with the gold pins on the cradle only; or a single sealed sliding door. The programming pads (SWDIO, SWDCLK, NRESET) do not need to be on the skin side in the field: leave them as internal pads and expose only VBUS and GND.
- **Galvanic:** with gold pads, brass or stainless contacts in the plate and a Ni underlayer, a wet junction creates a cell: use the same metal (gold-plated) on both sides, and avoid aluminium or zinc anywhere near the back.
- **Test pads TP6-TP9** (bottom, x 3.7..9.8, y 10.7..16.8) sit inside the case under the plate: the plate needs a 0.3 mm pocket or must stand 0.6 mm off the PCB there; they are DNP in the BOM so no component height.

### 9. MAJOR: the button actuator and the case wall

SW1 stem tip is at x = 31.44, **0.56 mm inside the board edge**, 2.0 mm wide (y 11..13), travel only **0.2 mm** at **1.6 N** [DS] (Mouser/LCSC). Switch height 3.3 mm, so the stem centre is about 1.65 mm above the PCB top (EST: stem height not published), i.e. about 4.05 mm above the skin plane's back-plate face. Consequences:

- Tolerance chain to the plunger: board edge +/-0.1 (fab), PCB to case 0.15, plunger to case 0.1, switch actuator position unknown. The sum is about 0.35 mm, **larger than the 0.2 mm travel**: either the switch is preloaded (stuck, ghost presses, battery drain through SHPHLD) or dead. Use a compliant plunger (silicone boot as spring, 0.5-1.0 mm of take-up) or a lever.
- 1.6 N through a silicone boot (adds about 0.2-0.5 N) is a firm button for a sealed side key; it also has to survive being pressed by a sleeve or glove. The stem is exposed at the board edge only 0.28 mm from the SW1 pad copper to the edge (the board rule is 0.25 mm): fine, but there is no margin for the 3.2 x 4.5 body overhang if the edge is routed (+/-0.1).
- Seal: 3 mm wide hole in a 1.2 mm wall plus a 2 mm plunger; use an O-ring on the plunger (x = 32.2, y = 12.0 axis) or a moulded silicone button; dirt and clay in a bare 0.3 mm gap will jam a 0.2 mm travel.
- The LCD overhangs the switch (LCD x to 29.3 over SW1 x 27.3..31.7): fine at 6.2 mm above the PCB top versus 3.3 mm switch height.

### 10. MAJOR: no mounting holes; proposed positions and edge clamp

The PCB has no mounting holes. I computed, for every point, the distance to the nearest **track, via or pad** on all six layers from the board file (`/tmp` script, read-only), excluding the four plane pours (F.Cu GND, In1 GND, In4 3V0, B.Cu GND), which pcbnew would cut around an NPTH.

Proposed holes (0.5 mm copper-to-hole keep-out around a 1.4-1.7 mm hole, web to the board edge >= 0.8 mm):

| Hole | Position | Clear to non-plane copper | Distance to board edge | Verdict |
|---|---|---|---|---|
| H1 | (2.2, 2.2) | 4.70 mm | 1.87 | free; the hole is 6.0 mm from the antenna keep-out end x = 6: use a nylon or brass screw or a plastic boss |
| H2 | (29.8, 2.2) | 5.25 | 1.87 | free; same note |
| H3 | (29.8, 33.8) | 2.98 | 1.87 | free |
| H4 | (2.2, 33.8) | 1.20 | 1.87 | marginal, J2 pads (4.0 x 2.8 at (5, 34)) are 1.2 mm away; or (2.6, 33.4): 0.80 mm (too tight) |

Each is clear of the LCD outline (x 2.7..29.3, y 2.85..33.15) for a boss up to 2.5 mm if the boss ends below the LCD bottom plane at about z = 6.2.
Edge clamp alternative: strips at least 0.9 mm clear of copper exist on the **left edge (x = 1.0) for y 0-18, 24-28.5 and 32.5-36**, and on the **right edge only for y 0-6.5 and 29-36** (SW1, M1, D3, C5-C7, C12, SW1 occupy the rest; SW1 pads reach x = 31.72). A 0.8 mm case ledge on the left and the bottom-right corner plus two screws would hold the board. Also place no clamp on the bottom edge across x 9.4..20.6 (FPC).
Note: a screw at a corner is 0.8 mm closer to the cell/LCD corner than the board edge; the cell and LCD corners (x 2.7 / 6.1) are clear.

### 11. MINOR: case, lens, impact, strap loads (baseball)

- **Lens:** a hard-coated 1.0 mm polycarbonate lens survives dirt and glove-slap better than 0.55 mm glass; a glass LCD (0.741 mm, Sharp precaution 9: avoid stress on the glass surface) must not take the lens load: support the LCD on a perimeter foam ledge (0.15 mm foam), isolate the lens from it with a 0.2-0.3 mm OCA or gasket, and put the bezel 0.3 mm proud. A direct ball strike (145 g at 40 m/s carries about 116 J) destroys any of these; design target is sleeve/glove/dirt/dive impacts only.
- **Seal:** adhesive-sealed lens (PSA 0.2 mm, not counted above because it sits in a recess), O-ring or adhesive back, silicone boot on the button, and no open pogo wells (finding 8). Sweat and clay: smooth back, no sharp wells.
- **Strap loads:** spring-bar lugs on a printed case: a 6 mm wide x 4 mm thick lug root, 5 mm lever arm, 50 N tug gives 15.6 MPa nominal, about 31 MPa with a stress concentration of 2 (my estimate); SLS PA12 is about 30-48 MPa and weaker along Z. Use 4 mm minimum lug thickness, a fillet R >= 1, bar holes at least 1.5 mm from the lug edge, or a stainless insert. A moulded case with integral lugs needs the same sections.
- **Antenna:** the cell (foil pouch) edge is at y = 8.5, 4.5 mm from the keep-out's lower end (y = 4); the LCD glass outline (y = 2.85) overlaps the keep-out strip (y < 4) by 1.15 mm, and its ITO and metal traces sit 8 mm above the chip antenna. Both are untested detuning risks; Raytac guidance on nearby metal was not part of the research files.

---

## 2. Size options

Estimates; unverified items are marked.

| | A: reference | B: compact | C: smallest |
|---|---|---|---|
| Parts | 32 x 36 board, MDBT50Q (15.5 x 10.5 x 2.05), 1.28 in LCD, 150 mAh 19.75 x 26.02 x 3.8 | 8 x 8 ISP1807-class module (height about 1.0-1.1, not verified), same LCD, 110 mAh cell assumed 3.0 x 17 x 25 (not a verified product) | 1.0-1.1 in memory LCD (LS011B7DH03: active 25.28 x 10.74, outline NOT FOUND in display.md; LS010B7DH04 not researched), WLCSP parts, rigid-flex; sensor of about 1.0 mm (VC31B 3 x 4.2 x 1.0, sensors.md:94), cell about 2.8 mm |
| Thickness (skin plane to lens) | 11.0 nominal, 11.3 with bezel, 12.3 worst | 9.2 (2.10 + 0.8 + 1.45 + 3.0 + 0.15 + 0.741 + 0.15 + 0.8), 9.5 with bezel | about 7.6 (1.6 + 0.5 + 1.15 + 2.8 + 0.1 + 0.75 + 0.1 + 0.6), 7.9 with bezel |
| Case L x W (without lugs) | 40 x 35 | 36 x 30 (board about 27 x 32; LCD 26.6 x 30.3 + frame) | about 31 x 25 if the 160 x 68 strip panel (outline guess 30 x 17) is used with the cell lying beside it; 26 x 30 for a square 1.0 in panel (outline guess) |
| FPC closes? | No (finding 1) | Marginal: drop 4.25, second bend ends 5.7 mm out, margin 0.3 mm | Yes, if the connector sits on a rigid-flex tail |
| Motor | no home (finding 3) | 8 mm LRA beside the cell, +9 mm | 6-8 mm LRA only; needs a bay |
| What limits it | module 15.5 + cell 26.0 > 36 mm board; the module's 2.05 height lifts the cell; 5.7 mm FPC drop; the 10 mm motor; the pads | LCD glass 26.6 x 30.3 and its FPC loop; sensor 1.55 plus window; cell thickness | panel outline and FPC ledge, cell thickness (about 2.8), sensor module height, 8 mm minimum for a usable motor |

---

## 3. Mechanical unknowns to settle with parts in hand (priority order)

1. **LCD FPC:** which face carries the fingers, pin-1 side after the fold, total length beyond the glass, stiffener extent, thickness. Decides J1 variant (finding 2) and whether the geometry closes (finding 1). One panel on the bench answers all of it in an hour.
2. **Coin motor choice and position** (finding 3): 8 mm versus 10 mm, LRA versus ERM, where it mounts, its coupling into U4 and into the case.
3. **Tallest-part heights as built:** module (2.05 +/-?), J1 (1.0 or 2.0), inductors, C12; they set the 2.25 mm component zone (finding 4). Measure with calipers on the real assembled board.
4. **Cell as received:** thickness over a lot of cells, swelling after 20 charge cycles, lead exit position, protection-board bulge, lead length (finding 4).
5. **MAX30101 optics:** LED and photodiode position inside the package (not in the datasheet), the barrier line, a window material/thickness/gap sweep (0.2-0.5 mm glass, gap 0.1-0.4 mm), signal on a wrist at 3-7 kPa (finding 6).
6. **Button stem height and tolerance chain** (finding 9): measure stem centre height and rest position on real switches; test a silicone boot at 1.6 N.
7. **Cradle design:** contacts, pitch, magnets, sealing and corrosion test in artificial sweat on the real pads; ESD on the exposed pads (finding 8).
8. **Frontlight film thickness and outline (Azumo 11049-06, NOT FOUND)** and LCD to lens bonding.
9. **RF with the stack on:** antenna return loss with cell, LCD, case and a hand/wrist model, with and without metal screws.
10. **Strap/case material** (printed PA12, moulded PC, or metal) and lug section (finding 11).

---

## 4. Checked and found correct

- Sensor orientation: MAX30101 is on the bottom face (rotated onto B.Cu) with its integrated cover glass facing the wrist, and sits at the board centre (16.0, 20.5 vs board centre 16, 18).
- LCD FPC exit at the 6 o'clock edge matches J1 on the bottom board edge (15.0, 31.0); the 10 terminals match the datasheet table.
- SW1 stem points toward +x (right edge) with the rotation used; the footprint's pad-trimming deviation is documented in gen_pcb.py:84.
- Cell length (26.0) fits the board (y 8.5..34.5) and clears the antenna keep-out (y < 4) by 4.5 mm; cell width (19.8) is inside the LCD width (26.6).
- SW1 and the LCD: switch height 3.3 mm is below the LCD bottom plane (about 6.2 mm) so the LCD overhang over SW1 does not collide.
- Corner positions H1-H3 are free of tracks, vias and pads on all six layers (clearances 4.7-5.25 mm and 2.98 mm).
- Left-edge strips (x < 1.0, y 0-18) are free of tracks, vias and pads for clamping.
- Bottom caps C14-C17 leave 1.44-1.8 mm between the sensor body (x 14.35..17.65) and neighbouring parts, enough for a 0.8-1.0 mm gasket wall, provided the aperture is narrowed (finding 6).
- Thickness closes: skin plane to lens 11.0 mm nominal, with no part taller than the 2.25 mm component zone except the SW1 (outside the cell footprint).
