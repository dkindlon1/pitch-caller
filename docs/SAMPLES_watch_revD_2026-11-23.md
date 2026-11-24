# PitchIQ watch rev D: sample purchase list, test checklist, fabricator inquiry

Date: 2026-11-23. Nothing has been bought or sent. Prices marked SEEN were read on the supplier's page today; anything else says so. Sales tax is not included.

## 1. Totals

| Tier | What it buys | Total |
|---|---|---|
| **Essential** | Answers every question that gates the board order and the case fit | **$63.58** seen, plus Adafruit's shipping (shown only at checkout, my guess $5-9) and the printed case ($0 if you print at RIT, otherwise my guess $30-45, not quoted) |
| Recommended | Lets the display actually be lit and the firmware run before boards exist | + $65.03 |
| Optional | Charger bench testing before boards | + $64.35 |
| Everything | | $192.96 seen, plus the two unpriced items above |

The earlier $200-260 estimate assumed both dev kits and a paid print were needed now. They are not: the board-order gate is closed by the essential tier alone.

## 2. Essential purchases

| # | Item | Manufacturer / part number | Supplier, link | Qty | Unit | Line | Stock | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | Display panel | Sharp LS013B7DH03 | DigiKey 425-2903-ND, https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/5300387 | 1 | $12.39 SEEN | $12.39 | 33,493 | The board-order gate: contact face, terminal 1 side, tail length and thickness, fold |
| 2 | Display connector, top contact | Hirose FH12A-10S-0.5SH(55) | DigiKey HFK110CT-ND, https://www.digikey.com/en/products/detail/hirose-electric-co-ltd/FH12A-10S-0-5SH-55/1110331 | 3 | $1.56 SEEN | $4.68 | 4,529 | Check it on a 1:1 footprint print; mate it with the tail. Three because hand soldering 0.5 mm pitch can cost one |
| 3 | USB-C connector with gasket | GCT USB4715-GF-A-KIT (USB4715-GF-A + USBTJ-04) | DigiKey 2073-USB4715-GF-A-KITCT-ND, https://www.digikey.com/en/products/detail/gct/USB4715-GF-A-KIT/16889471 | 2 | $1.71 SEEN | $3.42 | 5,953 | Height, pad reach, gasket thickness, fit in the notch and the port plate |
| 4 | Side switch | Alps Alpine SKRTLAE010 | DigiKey 4809-SKRTLAE010CT-ND (search that number on digikey.com) | 2 | $0.72 (read on Findchips' DigiKey row, not on DigiKey's own page) | $1.44 | 7,826 | Confirm the actuator points off the board edge, body size, press force |
| 5 | Motor, stand-in | Vybronics VC0820B006F | DigiKey 1670-VC0820B006F-ND, https://www.digikey.com/en/products/detail/vybronics-inc/VC0820B006F/6009906 | 1 | $3.73 SEEN | $3.73 | 797 | Same maker and 8.0 x 2.1 mm body as the design motor, which is out of stock (see note). Size and mounting check only |
| | DigiKey shipping | USPS Ground Advantage | https://www.digikey.com/en/help/same-day-shipping | | | $4.99 SEEN | | UPS/FedEx ground is $8.49 |
| 6 | Battery | Adafruit 1317, 3.7 V 150 mAh | https://www.adafruit.com/product/1317 | 1 | $5.95 SEEN | $5.95 | in stock | Measure real thickness (bay takes 4.0 mm max), lead polarity, fit in the bay |
| | Adafruit shipping | | | | | not seen | | Shown at checkout; lithium cells ship ground |
| 7 | Strap, 20 mm quick-release black silicone | Archer ARC-QRS-BLK20 | https://www.archerwatchstraps.com/en-us/products/quick-release-silicone-black | 1 | $19.99 SEEN | $19.99 | 20 | Lug gap, bar diameter and tip fit, strap swing clearance |
| | Archer shipping | USPS Ground Advantage | | | | $6.99 SEEN | | Free over $50 |
| 8 | Printed fit-check case set | From `cad/step_mjf/`: case, back cover, port plate, plunger | RIT makerspace, or a print bureau | 1 set | not quoted | | | Everything in section 5 marked "case" |
| | **Essential total, seen prices** | | | | | **$63.58** | | |

Motor note: the design motor, VCLP0820B004L, shows 0 in stock at DigiKey with 1,000 expected on 5 January 2027 ($3.15 at 1, SEEN, https://www.digikey.com/en/products/detail/vybronics-inc/VCLP0820B004L/10285889). The stand-in is stronger (0.30 G against 0.25 G) and is not rated for this board's motor supply, so it answers size and mounting, not feel or current. If you want the real one in hand when boards arrive, backorder 2 now ($6.30); it is needed then anyway.

## 3. Recommended and optional

| # | Item | Part number | Supplier, link | Qty | Price | Why | Tier |
|---|---|---|---|---|---|---|---|
| 9 | nRF52840 dev kit | Nordic NRF52840-DK | DigiKey 1490-1072-ND, https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NRF52840-DK/8593726 | 1 | $48.95 SEEN (717 in stock) | Runs the firmware's dev-kit build. Also the programmer for the watch boards later, so it is bought eventually either way | Recommended; borrow if you can |
| 10 | 0.5 mm 10-pin flex adapter board | Chip Quik FPC050P010 | DigiKey FPC050P010-ND, https://www.digikey.com/en/products/detail/chip-quik-inc/FPC050P010/5014722 | 1 | $3.69 SEEN (240 in stock) | Solder one FH12A to it, wire it to the dev kit, light the real panel. That proves the pin order electrically instead of by reading drawings | Recommended (only useful with item 9) |
| 11 | Second display panel | as item 1 | | 1 | $12.39 SEEN | Spare. The fold test and first-time handling of 0.74 mm glass can break one | Recommended |
| 12 | nPM1300 evaluation kit | Nordic NPM1300-EK | DigiKey 1490-NPM1300-EK-ND, https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-EK/19722486 | 1 | $64.35 SEEN (168 in stock) | Flat-cell and no-cell charging start, charger code, before boards exist | Optional |

Items 9-12 ride on the same DigiKey shipment.

## 4. Where the cost can come down

- **Dev kit ($48.95): borrow.** Ask RIT's EE/CE labs, a professor doing Bluetooth work, or a club. Any nRF52840-DK (PCA10056) works. It is not needed to clear the board order.
- **Evaluation kit ($64.35): skip for now.** The board already carries an unfitted capacitor position as the fallback for the cold-start risk this kit would test, so the first boards can do that test themselves. The cost of skipping is that a charger problem would be found on real boards instead of on a kit.
- **Printed case: print at RIT.** A resin or fine FDM print is good enough for fit. MJF nylon from a bureau is only needed to judge the real material, and that can wait.
- **Strap ($26.98 shipped): borrow any 20 mm quick-release strap** you or a teammate owns for the first lug check, and measure its bar. Buy the Archer one before the lug geometry is frozen, because bar diameters differ between brands.
- **Shipping:** one DigiKey order by USPS, not three. If DigiKey lists Adafruit 1317 in stock (not checked), add the cell there and drop the Adafruit shipment.
- Lowest possible spend that still clears the board-order gate: items 1-5 plus shipping, **$30.65**.

Tools to borrow, not buy: digital calipers (0.01 mm), multimeter with continuity, fine-tip soldering iron with flux, hot air or hot plate, a magnifier or microscope, tweezers, a kitchen or lab scale for button force. All are standard in an RIT lab or makerspace.

## 5. Test checklist

Record every number. A photo next to the calipers is enough evidence. Printable 1:1 board outlines: `out/pitchiq_watch_revD_1to1_top.pdf` and `..._bottom.pdf` (print at 100 %, no scaling; check the board outline measures 30.6 x 36.0 mm on paper before trusting it).

### A. Display panel and connector (gates the board order)

| # | Do | Expect (design assumption) | If different |
|---|---|---|---|
| A1 | Measure glass outline and thickness | 26.6 x 30.3 x 0.74 mm | Case aperture and stack change |
| A2 | Hold the panel face up, tail toward you. Which face of the tail has the exposed gold contacts? | The back face (away from the viewer) | Connector must become bottom-contact; board change |
| A3 | Find terminal 1 (Sharp's drawing marks it). Which side is it on, viewed from the front? | Right-hand side | Pin order on the board must be mirrored; board change |
| A4 | Count contacts and measure pitch across all 10 | 10 contacts, 0.5 mm pitch, 4.5 mm first to last | Wrong connector |
| A5 | Measure tail width, thickness at the contact end, and free length from the glass edge | 6.0 mm wide (my estimate), about 0.3 mm thick at the stiffener, at least 6 mm long | Thickness outside 0.3 +/-0.05 mm means the connector may not grip; short tail means the connector moves |
| A6 | Lay an FH12A on the 1:1 top print at J1 | Pads land on all 10 contacts and both mounting tabs; the flip lock is on the side facing the bottom board edge | Footprint must be redrawn from Hirose's drawing |
| A7 | Open the lock, insert the tail contacts-up, close the lock, tug gently | Tail seats fully and holds | Contact side wrong (see A2) |
| A8 | Fold the tail 180 degrees under the glass the way the watch does, with the glass 2.7 mm above the paper print | Reaches J1 without a sharp crease; the bend starts at least 0.8 mm past the glass edge | Move J1 or change the loop allowance |
| A9 | With the dev kit (items 9-10): wire the adapter to the kit, run the dev-kit firmware | Panel shows the firmware's screen | Pin order or driver wrong; fix before the board order |

### B. USB-C connector and gasket

| # | Do | Expect |
|---|---|---|
| B1 | Measure overall height, body width, body depth | 4.21 mm high; 9.94 mm wide; fits a 10.3 x 6.3 mm notch |
| B2 | Lay it in the notch on the 1:1 bottom print | Six contact tails and four shell stakes land on their pads and slots; body ends inside the notch |
| B3 | Measure the front flange | 10.54 x 4.76 mm |
| B4 | Measure the gasket: free thickness, outer size, opening | 1.50 mm; 10.64 x 4.86 mm; 8.94 x 3.16 mm |
| B5 | Plug in a USB-C cable | Plug seats fully with the gasket on; note how far the plug overmold needs to enter |
| B6 | Case: seat the connector and gasket in the printed port plate | Gasket sits in the pocket with a little side clearance; nose passes the opening; with the plate pushed home the gasket is squeezed to about 0.9-1.05 mm |

### C. Battery

| # | Do | Expect |
|---|---|---|
| C1 | Measure thickness at the thickest point, length, width | 3.8 mm (reject above 4.0), 26.02 x 19.75 mm |
| C2 | Measure voltage; identify which lead is positive with the meter, not by wire colour | 3.6-4.2 V |
| C3 | Case: drop it in the bay between the ribs, close the cover | No pressure on the cell; about 0.8 mm of room left for swelling |

Do not solder to the cell or cut both leads at once.

### D. Motor (stand-in)

| # | Do | Expect |
|---|---|---|
| D1 | Measure diameter and thickness, lead length | 8.0 x 2.1 mm |
| D2 | Place on the 1:1 top print at the motor circle | Clear of neighbouring parts; leads reach the pads |
| D3 | Run it from 3 V (two AA cells or a bench supply) held against the printed case on your wrist | Informative only: this motor is stronger than the design one |

### E. Side switch

| # | Do | Expect |
|---|---|---|
| E1 | Lay it on the 1:1 bottom print at SW1 | Actuator points off the board edge; pads match |
| E2 | Measure body size and how far the actuator stands out | 4.5 x 2.56 x 3.3 mm (my estimates) |
| E3 | Press it on a scale | Clicks at about 160 g |
| E4 | Case: plunger in the bore, press | Clicks, returns; note free play (design allows up to 0.25 mm) |

### F. Strap and lugs

| # | Do | Expect |
|---|---|---|
| F1 | Measure strap width at the bar, strap thickness, bar body diameter, tip diameter | 20.0 mm, 3 mm, 1.8 mm, 0.9 mm |
| F2 | Case: fit both strap halves | Bars snap into the holes; strap swings freely without rubbing the case end; no side slop over about 0.3 mm |
| F3 | Pull each strap half by hand, firmly | Lugs do not crack or spread. Note any whitening of the plastic |

### G. Printed case set

| # | Do | Expect |
|---|---|---|
| G1 | Measure body width, length, thickness | 34.8 x 42.1 x 11.49 mm (print allowances add a little) |
| G2 | Cut a 30.6 x 36.0 mm card from the 1:1 print, 0.8 mm thick, and drop it in | Seats on the ribs, pins enter the holes, no rocking |
| G3 | Fit lens-sized card, port plate, plunger, cover | Everything assembles in the documented order without force |
| G4 | Wear it | Sits flat; button reachable; note comfort and the feel of the 36.4 mm button side |

A printed case tells nothing about sealing. That needs the machined or moulded parts and a leak test later.

### What a pass means

A1-A8 and B1-B5 all matching: the board files stand as they are and only the fabricator's answers remain. Any mismatch in A2, A3, A6 or B2: I change the board before any order.

## 6. Fabricator: what their own pages say, and what to ask

Read on JLCPCB's pages today:

- 0.8 mm is a listed thickness, and the page does not exclude it for 6 layers. It does not state it for 6 layers either. Ask.
- Via-in-pad (epoxy filled and capped) is described as the default process for 6-layer and above boards.
- Outline tolerance +/-0.2 mm normal, +/-0.1 mm precision. Precision routing needs a piece at least 50 x 50 mm with three tooling holes, so it has to be done on a panel.
- ENIG is available (and HASL is not offered at 6 layers).
- Standard assembly (the only two-sided option) needs 70 x 70 mm minimum, edge rails and fiducials. Economic assembly is one side only, takes boards from 10 x 10 mm, needs no rails or fiducials, allows 6 layers at 0.8 mm, but "standard stack-up only".
- Their KiCad article defines the placement file columns (Designator, Mid X, Mid Y, Rotation, Layer, in millimetres) and says nothing about the rotation convention.

A cheaper route worth asking about: the bottom side carries only 8 simple parts (three protection diodes with no polarity, four resistors, the switch). Economic assembly of the top side only, with those 8 hand-soldered along with the module, USB-C and display connector, avoids the panel, rails and fiducials entirely.

### Inquiry to send (JLCPCB support chat or their support email; not sent)

> Subject: Pre-order questions, 6-layer 0.8 mm board, 30.6 x 36.0 mm, with assembly
>
> I am preparing an order of 5 prototype boards and would like to confirm the following before ordering. Gerbers, BOM and placement file can be supplied.
>
> Board: 6 layers, 0.8 mm finished thickness, FR-4 TG150 or higher, 1 oz outer and 0.5 oz inner copper, ENIG, 30.6 x 36.0 mm with 3 mm corner radii. Minimum via 0.2 mm drill / 0.5 mm pad. One edge has a 10.3 x 6.3 mm notch with 0.5 mm radius relief circles at its two inside corners. There are four plated slots for a USB-C connector shell.
>
> 1. Can you build 6 layers at 0.8 mm? Which standard stack-up applies, and what are the dielectric thicknesses?
> 2. Four vias sit inside the exposed pad of a QFN-32 and will have solder paste printed over them. Are all vias epoxy filled and capped by default on this order, and is there an extra charge?
> 3. Can the 0.5 mm radius inside corners of the notch be routed as drawn? What is your smallest router bit for this?
> 4. I need +/-0.1 mm on the outline at the notch (connector pads start 0.20 mm from the edge). Your page says precision routing needs a 50 x 50 mm piece with three tooling holes. If you panelise the board, can precision routing be applied to the panel?
> 5. For two-sided Standard assembly the board is below 70 x 70 mm. Will you panelise it (2 x 2 or 2 x 3) and add edge rails and fiducials, and what does that cost? Do you prefer that I supply the panel?
> 6. Alternatively: can this board go through Economic assembly, top side only, as a single 30.6 x 36.0 mm piece with filled vias and your standard 6-layer 0.8 mm stack-up?
> 7. Smallest parts are 0402 and a 2 x 2 mm LGA-12 at 0.5 mm pitch, plus a QFN-32 at 0.5 mm pitch. Any restrictions for Economic or Standard?
> 8. Do you accept customer-supplied parts from a US customer for a 5-board order (nPM1300-QEAA-R7), and what is the process and handling fee?
> 9. Rotation in my placement file follows KiCad's export (degrees counter-clockwise, bottom-side parts as KiCad reports them). Do your engineers correct rotation and polarity against the silkscreen and pin-1 marks, and will I be shown a placement preview to approve before production?
> 10. Please quote 5 and 10 boards, bare and assembled, with shipping to New York, USA.

The same text works for a second quote from PCBWay if you want a comparison.

## 7. Placement-file rotation: where it stands

- The fabricator publishes no rotation rule. Rotation is judged against the orientation of each part in their own library, which is why a KiCad export can be right for one footprint and 90 or 180 degrees off for another.
- Applied in the file: SOT-23 parts (Q1, Q2) carry a -90 degree correction from the community rotation table. Bottom-side parts use the mirrored convention the common KiCad-to-JLCPCB plugin uses.
- Not verified, and wrong rotation would damage or disable the board: U2 (power chip, QFN-32), U4 (accelerometer, LGA-12), Q1, Q2, D1, D2. Rotation does not matter electrically for D3-D6 (two-way protection diodes), resistors, capacitors, L2, Y1.
- The only real verification is their placement preview at order time: choose the option to confirm parts placement, then check pin 1 of U2 and U4, the single-pin side of Q1 and Q2, and the cathode bar of D1 and D2 against the silkscreen before approving. I will prepare a marked-up picture of those six parts for that check.
