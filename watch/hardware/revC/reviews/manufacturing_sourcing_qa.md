# PitchIQ watch rev C: manufacturing, sourcing, cost and QA review (independent)

Date: 2026-11-23. Read-only review. Nothing was built, ordered or quoted. Nothing here recommends ordering: the owner must approve every purchase.
Tags: SEEN (read on a page today, 2026-11-23, URL given), SEEN-REVB (seen in ../revB/reviews/sourcing.md or revC research files earlier; not re-read), ESTIMATE (my judgement), NOT FOUND (could not read it).
Tool notes: Mouser search pages returned the wrong page today, so Mouser prices below come from Octopart snapshots or the revB review. LCSC pages give only "from" price and stock. DigiKey pages were truncated. The JLCPCB consigned-parts help page failed to load (client error).

What I measured myself on the files (pcbnew, KiCad 7 python, read-only):
- 153 vias, all 0.5 mm pad / 0.2 mm drill (annular ring 0.15 mm); minimum track 0.20 mm; minimum via hole-to-hole edge 0.50 mm.
- Smallest copper-to-outline distance: 0.200 mm, on the four USB-C shell stake pads (J3.S1-S4, 0.9 x 1.5 mm pads, 0.20 mm from the notch edge). Contact pads A5/B5/A9/B9/A12/B12 are 0.25 mm from the notch back edge. Everything else is at least 0.425 mm.
- 8 vias sit inside nPM1300 (U2) SMD pads. 236 pads on the 50 machine-placed parts. Bottom side: 7 machine-placed parts (D4, D5, D6, R17, R18, R19, SW1) plus hand parts BT1/JP1 and test pads.
- PTH drill file: 4 plated slots (G85) 0.5 x 1.1 mm at the stake positions, 0.2 mm vias, 0.5 mm slot tool. NPTH: 2 x 0.9 mm (SW1 bosses), 4 x 1.6 mm (case screws).
- F_Paste has apertures on all six USB-C contact pads; the four stake pads have no paste (gen_pcb.py line 72 sets PTHMask only).
- The gerber job file says Finish "None" and Revision "rev?". The package contains no panel, no rails, no fiducials.

---------------------------------------------------------------------------
## FINDINGS, ranked
---------------------------------------------------------------------------

### BLOCKER 1: No confirmed way to get J3 (USB-C) and U1 (BLE module) onto a JLCPCB-assembled board
Evidence: LCSC C6906846 (USB4715-GF-A) is "Out of Stock, from $1.0801" (https://www.lcsc.com/product-detail/C6906846.html, SEEN). LCSC C5118826 (MDBT50Q-1MV2) is "Out of Stock, from $18.6021" (https://www.lcsc.com/product-detail/C5118826.html, SEEN). Both must therefore be consigned (customer supplied). JLCPCB's assembly capabilities page says of parts supply only "we only provide assembly service and do not ship parts separately" and does not address consignment (https://jlcpcb.com/capabilities/pcb-assembly-capabilities, SEEN). The consigned-parts help page would not load, so rules, fees and the receiving address are NOT FOUND. The page also lists no rule for mid-mount parts that sit in a board notch, and states stacked/odd parts are handled manually "with extra labor cost".
Consequence: the fab package cannot be submitted as it stands. If consignment is refused or the connector cannot be machine-placed, the board comes back without J3 and U1, and a 15.5 x 10.5 mm castellated module plus a 6-contact mid-mount connector must be hand-soldered (hot air). That is a different cost and yield picture from the one in COST_revC.md.
Fix (all before any order): ask JLCPCB support in writing (a) whether consigned parts are accepted for a Standard double-sided order and the fee, (b) whether C6906846 or the KIT C5984345 can be machine-placed into a notch, or whether J3 will be a "hand-solder" line, (c) whether U1 consigned in cut tape is accepted. Keep the written answers with the order. Fallback: JLCPCB assembles everything else, J3 and U1 marked DNP, owner fits both by hand on the first 1-5 boards.

### BLOCKER 2: The fab package is not in a form JLCPCB's double-sided assembly accepts (board too small, no rails, no fiducials)
Evidence: Standard assembly is the only tier with double-sided placement (Economic is "single-sided placement only"). Standard "Single PCB: 70x70 mm to 460x500 mm"; "Edge rails: Standard requires them"; "Fiducials: Standard requires them" (https://jlcpcb.com/capabilities/pcb-assembly-capabilities, SEEN). The rev C board is 30 x 36 mm (gerber job size 30.1 x 36.1), and SW1 is on the bottom, so double-sided is unavoidable. grep of gen_pcb.py and gen_bom.py finds no panel, rail or fiducial logic.
Consequence: the order must be a panel of at least about 70 x 70 mm (2 x 2 boards plus rails is roughly 66 x 78 mm before rails; 3 x 2 is safer), with fiducials. Minimum useful quantity becomes 4-6 boards, and the USB-C connector body overhangs the board edge by 2.1 mm (GCT drawing, research/usbc_motor.md), which constrains how the notch edge faces the neighbour board or rail.
Fix: either let JLCPCB panelise (ordering option, mouse-bite panel; confirm in the quote that the notch edge and the 2.1 mm overhang have at least 3 mm clear), or build the panel in KiCad (3 x 2, 5 mm rails, 3 fiducials, mouse bites away from the notch). Add 3 fiducials per side. Re-run the CPL on the panelised file.

### MAJOR 1: USB-C shell stakes get no paste: the connector is anchored only by six small contact pads unless someone hand-solders the stakes
Evidence: stake pads are PTH oval pads with plated 0.5 x 1.1 mm slots and no paste layer (gen_pcb.py line 72; F_Paste check above). Reflow paste on the top surface will not fill a through slot. GCT specifies mating force 5-20 N (research/usbc_motor.md, from the GCT drawing). Six contact pads of 0.7-0.8 x 1.35 mm are not a strain-relief.
Fix: state "hand-solder J3 shell stakes" on the order (JLCPCB hand soldering was $3.58 per order, SEEN-REVB, https://jlcpcb.com/help/article/pcb-assembly-price) or solder them yourself; add a pull/push test of 25 N on the first article (see QA). Do not rely on reflow to wick solder into the slots.

### MAJOR 2: Stake pads sit exactly at the fab limit (0.20 mm to the notch) while the regular outline tolerance is +/-0.2 mm
Evidence: JLCPCB: "Copper clearance from routed board edges: >=0.2 mm"; outline tolerance "+/-0.1 mm (Precision) and +/-0.2 mm (Regular) for CNC routing" (https://jlcpcb.com/capabilities/pcb-capabilities, SEEN). My measurement: four stake pads at 0.200 mm. gen_pcb.py sets the KiCad copper-edge clearance rule to 0.19 mm, below the fab minimum, so the DRC "0 errors" result does not show this. PCBWay lists line-to-edge for CNC milling as 0.25 mm normal, 0.20 mm medium difficulty (https://www.pcbway.com/capabilities.html, SEEN).
Consequence: on a regular-tolerance board the notch edge can land on or inside the pad copper (no electrical consequence, the pad is shell ground, but it will probably draw an engineering question or a copper-exposure remark). Pad copper is cut at the notch edge on the worst case.
Fix: select Precision outline tolerance, and reduce the stake pad width from 0.9 to 0.8 mm (clearance 0.25 mm, annular ring still 0.15 mm around a 0.5 mm slot) or set the DRC rule to 0.20 mm so the file tells the truth. Keep GCT's slot size.

### MAJOR 3: Routed notch with 0.5 mm radius reliefs is at the edge of what JLCPCB publishes
Evidence: the Edge_Cuts file has two 0.5 mm radius arcs at the notch back corners (1.0 mm wide pockets). JLCPCB: "The minimum Non-Plated Slot Width is 1.0 mm" and gives no minimum router-bit or inside-corner radius for outline cut-outs (page SEEN above). So a 1.0 mm router bit is exactly at the published slot floor, and the number for the outline is NOT FOUND. The plated slots (0.5 mm) are fine: "Multi-layer: 0.35 mm" minimum plated slot (same page). PCBWay minimum plated slot is 0.5 mm, non-plated 0.8 mm (their page).
Fix: ask JLCPCB (DFM chat or the pre-order engineer review) to confirm the 1.0 mm bit for the corners; fallback is R0.6 reliefs (check against the GCT land pattern, callouts "4x 0.90, 4x 0.50" in research/usbc_motor.md were read from the drawing image and the relief size mapping is ESTIMATE).

### MAJOR 4: Only one fab can make this board; PCBWay's published 6-layer minimum thickness is 0.9 mm
Evidence: "Minimum thickness by layer count: 4L >=0.60 mm, 6L >=0.9 mm" (https://www.pcbway.com/capabilities.html, SEEN). JLCPCB lists 0.8 mm among FR-4 thicknesses "0.4/0.6/0.8/1.0/1.2/1.6/2.0 mm" but the page does not name a 6-layer-specific list (SEEN above); earlier work saw 0.8 mm accepted for 6 layers (SEEN-REVB). Whether the quote form actually accepts 6 layers x 0.8 mm for this size today is NOT VERIFIED (quote pages did not load in revB; I did not retry).
Fix: before design freeze, open the JLCPCB instant-quote page and select 6 layers, 0.8 mm, ENIG, 30 x 36 mm, and screenshot the price. If it refuses, the stack-up and the GCT 0.80 +/-0.10 mm slot (the whole reason for 0.8 mm) both need rethinking.

### MAJOR 5: Motor VCLP0820B004L is out of stock at DigiKey today, with conflicting stock figures
Evidence: DigiKey page today: "out of stock and can be placed on backorder", Active, Manufacturer standard lead time 9 weeks (https://www.digikey.com/en/products/detail/vybronics-inc/VCLP0820B004L/10285889, SEEN). The earlier research file read 1,766 in stock and $3.15 / $2.789 / $2.4713 on the same day. Octopart: "we do not know of any distributors", price $2.19 with no distributor, inventory trend -62.18% over 3 months (https://octopart.com/part/vybronics/VCLP0820B004L, SEEN). Single-source.
Alternates (all seen in research/usbc_motor.md, not re-read today): PUI HD-EM0802-LW15-R, 8 mm dia, thickness NOT FOUND, 85 mA, 903 in stock, $2.64 at DigiKey, rated 2.6-3.6 V; Vybronics VC0820B006F, 8.0 x 2.1 mm, 1,369 stock, $3.31, but only 2.7-3.3 V (cannot sit on VSYS, which reaches 4.2 V). The design drives the motor from the system rail with a low-side FET, so neither alternate is a drop-in without a duty cap or regulated rail.
Fix: confirm real availability in a cart before design freeze; if gone, pick PUI HD-EM0802-LW15-R only after measuring a sample for thickness (pocket is 8.0 x 2.1 mm) and re-set the firmware duty cap for 3.6 V max.

### MAJOR 6: LIS2DH12TR is a thin single-source item; US distributors have none until April 2027
Evidence: LCSC C110926 "From $0.495, 297 in stock" (https://www.lcsc.com/product-detail/C110926.html, SEEN). Octopart: Weyland Electronics 40,000 at $0.530 flat, Sensible Micro 12,226 at $1.688/$1.563; Avnet/Future/Arrow stock unreadable (https://octopart.com/part/stmicroelectronics/LIS2DH12TR, SEEN, table garbled). Mouser 0 stock, 42,713 due 2027-04-12, 24-week lead; DigiKey 0 stock, 24 weeks (SEEN-REVB). Stock at LCSC has fallen 58,867 to 1,485 to 297 across revB reviews.
Alternate: LIS2DW12TR (LCSC C189624, 14,783 in stock at revB) is pad-compatible but needs its own driver (register map differs, SEEN-REVB, not re-verified).
Fix: for a 1-5 board build, buy the part now only after approval (about 10 pieces) or use the broker stock accepting counterfeit risk; write the LIS2DW12 driver before any volume run.

### MAJOR 7: CPL rotation and origin risk (custom footprints, bottom side)
Evidence: J3's CPL row is at the notch back-edge midpoint (106.3, -90.5) rotation 0, which is the origin of the custom USB4715 footprint (gen_pcb.py comment "Origin = middle of the notch's back edge"), not the body centre that JLCPCB's library uses for C6906846. SW1 has a modified land pattern (DFM deviation in gen_pcb.py) and is placed on the bottom at -90 degrees; D4-D6 are bottom at 90 degrees; R17-R19 bottom at 0. JLCPCB bottom-side rotation and origin conventions differ from KiCad's for several part families. KiCad's export does not know JLCPCB's per-part rotation offsets. The pos file and CPL agree with the board (SEEN in files); no JLCPCB preview was seen.
Fix: after upload, inspect JLCPCB's placement preview for every polarised or asymmetric part (U1, U2, U4, J1, D1-D6, J3, SW1) and pay the $0.45 parts-placement confirmation (SEEN-REVB). For J3 specifically, if it is machine-placed, the origin offset must be checked to better than 0.1 mm because the pads are 0.7 mm wide.

### MAJOR 8: Waterproof claim cannot be supported by the planned enclosure tolerances
Evidence: GCT's gasket needs 0.45 mm minimum compression (30-40% of the 1.5 mm thickness) against panel cut-outs toleranced +/-0.03 mm (research/usbc_motor.md, GCT drawing read as image). MJF PA12 prints are +/-0.25 to +/-0.30 mm; the best seen CNC tolerance is +/-0.13 mm (research/enclosure.md). Mated versus unmated IP67 condition, test depth and time are "NOT STATED" on the drawing (research/usbc_motor.md).
Consequence: the connector's IP67 rating cannot be inherited by the product, and the rev C case concept (printed, 1.02 mm O-ring in a 0.69-0.76 mm deep groove, scripts/mech_drawing.py) cannot hold that groove depth.
Fix: see QA section: no waterproof or IP claim anywhere; design the first leak-test case with CNC sealing faces.

### MAJOR 9 (for selling only): Raytac grant and Bluetooth listing
Evidence (SEEN-REVB, ../revB/reviews/sourcing.md findings 4 and 5): the MDBT50Q grant needs the antenna at least 5 mm from the body, the latest FCC grant is "Limited Single Modular", Zephyr's own controller has no current SIG qualification, and the SIG fee is $12,000 per qualification for an Adopter, effective 2026-03-01. A 0.8 mm board in a wrist case may not give 5 mm. Not a prototype blocker; it is the largest one-time cost and a possible redesign for a product.

### MINOR 1: Vias at the fab's absolute minimum annular ring
JLCPCB: multilayer PTH annular ring "Recommended 0.20 mm or above; absolute minimum 0.15 mm"; min via "0.15 mm hole size / 0.25 mm via diameter" (page SEEN). All 153 vias are 0.5/0.2, ring exactly 0.15 mm. Within limits, no margin. Fix: 0.55/0.20 vias where space allows; costs nothing.

### MINOR 2: 8 open vias in the nPM1300 pads (QFN, X-ray inspected)
Open 0.2 mm vias in solder pads wick paste and cause voids. JLCPCB applies X-ray to BGA/QFN/LGA automatically (page SEEN), which will report voids but not prevent them. Fix: tent/fill request on those vias (confirm JLCPCB's "via in pad" option and fee, NOT FOUND), or move the vias outside the pad. Check U2 on X-ray report of the first article.

### MINOR 3: Double-sided assembly is forced by the button, not by the six small parts
SW1 (button on the bottom, per the rev C requirement) is why a bottom pass exists. Moving D4-D6 and R17-R19 to the top removes no fee, because the bottom stencil and setup are still needed for SW1. Double-sided costs $51.12 setup vs $25.56 single, and a $16.42 stencil vs $8.21 (SEEN-REVB, https://jlcpcb.com/help/article/pcb-assembly-price), about $34 per order extra, which is a fixed cost that matters only at 1-25 units. Decision: leave them; only move SW1 to the top (side-actuated part or a top button) would let you use cheaper single-sided Economic assembly, and Economic has its own limits (no edge plating, no rails needed, panel max 250 x 250; single-sided only). The bottom parts are light and small; the heaviest bottom SMT is SW1 (4.5 x 3.4 mm), which is within normal bottom-side practice. Reflow order (heaviest side up first) is the fab's call.

### MINOR 4: Fab package metadata
Gerber job: Finish "None", Revision "rev?". ENIG must be chosen in the order form (6-layer HASL is not supported at JLCPCB, page SEEN). 66 "lib_footprint_issues" DRC warnings mean KiCad's footprint-vs-library check never ran (footprints have no library nickname). Fix: set finish, revision text, and silk the revision on the board.

### MINOR 5: Single-source panel and lifecycle
LS013B7DH03: DigiKey Active, 33,493 in stock, 28-week lead, tray, $12.39 / $9.60 / $7.9728 / $7.7443 at 1/10/100/500 (https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/5300387, SEEN today). Single source; Future MOQ 2,240; two material-driven PCNs (SEEN-REVB). Fine for 1-100 units; no second source proven.

### MINOR 6: BOM price notes
- Gasket USBTJ-04: BOM carries $0.20 est; Mouser 640-USBTJ-04 is $0.130 / $0.113 / $0.097 at 1/10/100, 31,498 in stock (https://octopart.com/part/gct/USBTJ-04, SEEN).
- USB4715-GF-A: Mouser $1.610 / $1.370 / $1.170 (2,382 in stock), Newark $1.91 (622), TME $1.50 (700), Future 1,400 at MOQ 700 (https://octopart.com/part/gct/USB4715-GF-A, SEEN). KIT USB4715-GF-A-KIT: DigiKey 2073-USB4715-GF-A-KITCT-ND 2,274 in stock at $1.810 / $1.538 / $1.307; TME 364 at $1.53 (https://octopart.com/part/gct/USB4715-GF-A-KIT, SEEN). Buying the bare connector at Mouser plus the gasket (about $1.74 at 1) is cheaper than the KIT at 1 ($1.81) by a few cents; either works. LCSC KIT C5984345 also out of stock (SEEN-REVB).
- SMF5.0A C151296: LCSC 56,440 in stock, from $0.0546 (https://www.lcsc.com/product-detail/C151296.html, SEEN); package listed "SOD-123FL" (BOM footprint D_SOD-123F: same family, check the land pattern).
- nPM1300-QEAA-R7: LCSC C7501206 921 in stock from $2.3189 (SEEN-REVB, today's page shows 921 and $2.3189 in the page meta, SEEN). Octopart today: Newark 4,704 in stock at $2.70 / $2.70 / $1.75 (1/10/100); Future 13,500 at $1.38 single price (unlabelled, not trusted); CoreStaff $2.856 / $2.374 / $1.813; Braemac and Avnet 0 stock (https://octopart.com/part/nordic-semiconductor/NPM1300-QEAA-R7, SEEN, table garbled). BOM uses the revB Mouser $3.42 / $2.09, which is higher than Newark; not wrong, conservative. DigiKey 16-week factory lead (SEEN-REVB).
- MDBT50Q-1MV2: SparkFun WRL-21605 in stock, $8.95 / $8.50 at 25+ / $8.06 at 100+ (https://www.sparkfun.com/nordic-nrf52840-ble-module-mdbt50q-1mv2.html, SEEN); LCSC out of stock; Octopart has no listing; DigiKey marketplace $6.15 at 18 pieces with $25 shipping and X-ON $12.21 (SEEN-REVB). Raytac direct minimum NOT FOUND. Single source (module) with retail-only stock.
- Battery Adafruit 1317: $5.95, $5.36 at 10-99, $4.76 at 100+, in stock, 19.75 x 26.02 x 3.8 mm, JST-PH lead, no thermistor (https://www.adafruit.com/product/1317, SEEN). Note: the BOM solders the leads to pads, so the JST is cut off; battery polarity must be checked by meter because Adafruit warns other brands' polarity differs.

---------------------------------------------------------------------------
## c. Alternates and single-source/lead-time table

| Item | Primary | Status today | Alternate | Flag |
|---|---|---|---|---|
| USB-C | GCT USB4715-GF-A | LCSC 0; Mouser 2,382; Newark 622; TME 700 | GCT USB4736-GF-A (top mount, PCB 1.2 mm recommended, 0.8 mm NOT VERIFIED; DigiKey 517, Newark 629 in research) | single source (GCT); only part found for 0.80 mm |
| TVS | SMF5.0A C151296 | LCSC 56,440 | JSMSEMI C2857263, MDD C193402 (research only) | multi-source |
| Accelerometer | LIS2DH12TR C110926 | LCSC 297; US 0 to Apr 2027 | LIS2DW12TR C189624 (new driver) | thin |
| BLE module | MDBT50Q-1MV2 | LCSC 0; SparkFun in stock | Insight ISP1807-LR-RS (DigiKey, 4-week lead SEEN-REVB, different footprint) | single source, retail only |
| PMIC | NPM1300-QEAA-R7 | LCSC 921; Newark 4,704 | NPM1300-QEAA-R (Mouser 19-week lead, SEEN-REVB) | single source (Nordic), stock fine |
| Display | LS013B7DH03 | DigiKey 33,493, 28 wk | LS013B7DH05 (different panel, not drop-in) | single source |
| Motor | VCLP0820B004L | DigiKey 0, 9 wk | PUI HD-EM0802-LW15-R; VC0820B006F (3.3 V max) | single source, conflicting stock |

Three weakest: (1) MDBT50Q-1MV2 (retail-only stock, no LCSC, must be consigned, grant caveats); (2) VCLP0820B004L motor (out of stock today, one maker); (3) LIS2DH12TR (297 at LCSC, nothing US until April 2027), with USB4715-GF-A a close fourth (LCSC 0, one maker, consigned).

---------------------------------------------------------------------------
## Purchasing lists (for the owner to approve; nothing to be ordered now)
---------------------------------------------------------------------------

Quantities: ONE = build 1 watch; FIVE = build 5 watches. Spares: 1 extra of each IC for ONE, 2 extra for FIVE (ESTIMATE of practice). Prices are per piece at the quantity shown, SEEN unless marked.
"JLC" = ordered through JLCPCB's parts library (price is LCSC "from" price shown in BOM.csv; JLC adds its own fees); "consign" = bought by owner and sent to the assembler (rules NOT FOUND).

### Electronic items
| Item | Supplier / part no. | Qty ONE | Qty FIVE | Seen price | Link |
|---|---|---|---|---|---|
| 6-layer PCB 0.8 mm ENIG 30x36, notch, slots | JLCPCB | 5 boards (min; ESTIMATE, panel needed, BLOCKER 2) | 8-10 boards (2 panels) ESTIMATE | ESTIMATE $45 per 5-board order (no quote read, earlier "$2" promo and third-party $30-42 per board at 5 pcs are PUBLISHED RANGE only) | https://jlcpcb.com/capabilities/pcb-capabilities |
| PCB assembly service (Standard, double-sided) | JLCPCB | 1 order | 1 order | fees SEEN-REVB: setup $51.12, stencil $16.42, feeder $1.53 per Extended line, handling >=$14.93, $0.0016 per joint, hand-solder $3.58, placement confirm $0.45 | https://jlcpcb.com/help/article/pcb-assembly-price |
| U1 MDBT50Q-1MV2 | SparkFun WRL-21605 (consign) | 2 | 7 | $8.95 / $8.95 (1-24) | https://www.sparkfun.com/nordic-nrf52840-ble-module-mdbt50q-1mv2.html |
| U2 NPM1300-QEAA-R7 | Newark (Octopart) or LCSC C7501206 (JLC) | 2 | 7 | Newark $2.70; LCSC from $2.3189 (921 in stock); Mouser $3.42 SEEN-REVB | https://www.lcsc.com/product-detail/C7501206.html |
| U4 LIS2DH12TR | LCSC C110926 (JLC) | 2 | 7 | from $0.495 (297 in stock) | https://www.lcsc.com/product-detail/C110926.html |
| J3 USB4715-GF-A | Mouser 640-USB4715-GF-A (consign) | 2 | 7 | $1.61 (2,382 in stock); TME $1.50 | https://octopart.com/part/gct/USB4715-GF-A |
| GSK1 gasket USBTJ-04 | Mouser 640-USBTJ-04 | 3 | 10 | $0.130 (31,498 in stock) | https://octopart.com/part/gct/USBTJ-04 |
| D2 SMF5.0A | LCSC C151296 (JLC) | 2 | 7 | from $0.0546 | https://www.lcsc.com/product-detail/C151296.html |
| J1 FH12-10S-0.5SH(55) | LCSC C506791 (JLC) | 2 | 7 | $0.3016 (SEEN-REVB from-price) | https://jlcpcb.com/partdetail/HRS_Hirose-FH12_10S_0_5SH_55/C506791 |
| SW1 SKRTLAE010 | LCSC C110293 (JLC) | 2 | 7 | $0.0744 from-price | https://www.lcsc.com/product-detail/C110293.html |
| Other passives, diodes, FETs, crystal, NTC, inductors (C1-C25, R1-R19, D1, D3-D6, Q1, Q2, RT1, L1, L2, Y1) | LCSC via JLC, see out/fab/bom_jlcpcb.csv | 1 set | 5 sets | $0.003-0.083 each (BOM.csv: the 0.003-0.01 values are ESTIMATE; MLP2012H2R2MT0S1 SEEN-REVB $0.0832 at 5) | https://www.lcsc.com/product-detail/C383369.html |
| LCD LS013B7DH03 | DigiKey 425-2903-ND | 2 | 6 | $12.39 (33,493 in stock) | https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/5300387 |
| Battery 150 mAh 402025 protected | Adafruit 1317 | 2 | 6 | $5.95 | https://www.adafruit.com/product/1317 |
| Motor VCLP0820B004L | DigiKey (backorder, 9 wk) | 2 | 6 | $3.15 / $2.789 (10) SEEN-REVB in research; today page shows out of stock, price not captured | https://www.digikey.com/en/products/detail/vybronics-inc/VCLP0820B004L/10285889 |
| Frontlight option (not in totals) | Azumo 11049-06_T7 via ichome | 0 | 0 | $32.08 (SEEN-REVB, one distributor) | https://ichome.com/product-detail/azumo/11049-06-t7 |

### Mechanical items
| Item | Supplier / part no. | Qty ONE | Qty FIVE | Seen price | Link |
|---|---|---|---|---|---|
| Case top, case back (printed, MJF PA12, 1.2-1.5 mm walls) | JLC3DP or PCBWay or Craftcloud | 1 set (+1 spare) | 5 sets (+2 spare) | ESTIMATE $5-15 per part at 1, $4-10 at 5 (JLC3DP "from $1.00" SEEN-REVB is a floor, PCBWay $25 minimum order SEEN-REVB) | https://jlc3dp.com/ |
| Lens, hard-coated PC or PMMA 1.0-1.5 mm, about 28 x 32 | Ponoko / laser-cut service | 2 | 7 | $25 minimum order (Pololu; 3 mm sheet only, too thick) and $50 for 1 (Ponoko), SEEN-REVB; real price ESTIMATE | research/enclosure.md section 3 |
| O-ring 1.02 mm section for the back cover groove (size set by case CAD, not fixed) | McMaster or Zoro | 1 pack | 1 pack | ESTIMATE; reference only: Zoro Viton 16 mm ID x 2 mm section PK25 $3.45 (wrong size, SEEN) | https://www.zoro.com/i/G2524794/ |
| Screws M1.4 thread-forming, 4 per watch | not found (McMaster/Misumi/Accu) | 10 | 30 | NOT FOUND (ESTIMATE $0.05-0.30 each) | - |
| Button cap | printed with the case or silicone boot | 1 | 5 | ESTIMATE $0-5 | - |
| Strap, quick-release silicone 20 mm (lug gap 20.0 in scripts/mech_drawing.py) | Archer ARC-QRS-BLK20 | 1 | 5 (or Barton ESQR-BLACK-20 $21.74, 15% off at 5+) | $19.99 each, 20 in stock, shipping $6.99 under $50 (SEEN) | https://www.archerwatchstraps.com/en-us/products/quick-release-silicone-black |
| Spring bars 1.5 mm (strap's own quick-release bars; lug hole 1.1 x 1.8 deep) | included with strap; spares ESTIMATE | 0 extra | 2 extra pairs | Esslinger 1.80 mm bars $4.50 per 10 are sold out and not available in 20 mm (SEEN) so not usable | https://www.esslinger.com/watch-band-pin-1-80mm-regular-double-shoulder-stainless-steel-spring-bars-package-of-10 |
| Lens adhesive, LCD tape, polyimide tape, wire, flux, solder | any | 1 lot | 1 lot | ESTIMATE $15-30 per lot | - |

### Tools (one time)
| Item | Supplier / part no. | Qty | Seen price | Link |
|---|---|---|---|---|
| Debug probe (CMSIS-DAP; fit with nRF52840 not verified) | Adafruit 5699, Raspberry Pi Debug Probe | 1 | $12.00, in stock (SEEN) | https://www.adafruit.com/product/5699 |
| Alternative probe | SEGGER J-Link EDU Mini | 0-1 | $75.95, non-commercial use only (SEEN-REVB) | - |
| Pogo-pin jig | Adafruit P75-B1 pins plus a printed or milled holder | 1 | pins $4.95 per 10 (SEEN-REVB); holder ESTIMATE $20-50 | - |
| nRF52840-DK, nPM1300-EK (optional references) | DigiKey | 0-1 each | $48.95 and $64.35 (SEEN-REVB) | https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-EK/19722486 |

---------------------------------------------------------------------------
## d. QA plan for the first article (rev C: no heart rate, USB-C charging, cell under the board, button on the bottom)
---------------------------------------------------------------------------

Pass criteria below are targets I propose, not measured values.

Incoming and bare board
1. Gerbers loaded in a viewer: notch 10.3 x 6.3 mm, four 0.5 x 1.1 mm plated slots, ENIG selected, thickness 0.8 mm +/-10% (caliper), notch width and stake-slot position measured against the GCT drawing (+/-0.05 mm tolerance).
2. After assembly: microscope check of U1, U2, U4, J1, SW1 and the six J3 contact pads; X-ray report on U2 (8 vias in pads), U4 and U1 ground pads; confirm no solder bridge between the 0.7 mm pads A5/B5 (1.0 mm pitch).
3. J3: seat check (shell flush against the notch, body 2.1 mm past the board edge), stakes soldered, push/pull 25 N along the plug axis without shift (GCT mating force 5-20 N), continuity of each contact pad to its trace, both plug orientations on a USB-C cable.
4. Resistance between VBUS, VSYS, 3V0, GND with no cell: no shorts. Check R1/R11 = 0 R, R12 and R12 not fitted.

Power-up (current-limited bench supply, no cell, then with the cell)
5. 5 V on VBUS through J3 with a 100 mA limit: VBUS clamp D2 at 5 V (no heating), 3V0 present, no brown-out in 10 minutes, average current under 20 mA.
6. I2C scan finds the PMIC and LIS2DH12 (0x19); read WHO_AM_I. No heart-rate sensor is fitted in rev C: confirm the firmware build has no MAX30101 init and that nothing waits on it.
7. Charge: cell polarity checked by meter before soldering (Adafruit warns about reversed polarity on other brands, SEEN). Charge current and termination logged; NTC reading plausible at room temperature; battery node never above 4.2 V; charge only with a 5 V source (D2 would fail on 9/12 V); CC1/CC2 detection works in both plug orientations; current limit starts at 100 mA until firmware raises it.
8. Cell under the board: measure the stack (cell 3.8 mm, PCB, parts) against the case; check no pressure on the cell from the board, no contact between pads on the underside and the cell foil, thermal rise after one full charge by IR thermometer; cell swelling inspection after 10 cycles. The cell is a protected pouch: never charge unattended on the first articles.
9. Button on the bottom (SW1 to SHPHLD): short press event over I2C, long press power cycle, ship-mode wake, no ship-mode entry by accident; actuate it through the actual case button cap; 1,000 presses; check ESD clamp D3 and that finger touch does not wake the PMIC through leakage.
10. Display: all-white/black/checkerboard/border/real screen, no inverted columns, no fade after 10 minutes at the EXTCOMIN rate, FPC fully seated in J1 (bottom-contact ZIF, orientation).
11. Motor: current and VSYS sag at full duty (35 mA max rating) with a charged cell; confirm the duty cap while VSYS is above 4.0 V.
12. BLE: RSSI at 1 m and 5 m off-wrist and on-wrist against the DK; the antenna must not touch the cell or the strap lug area.
13. Programming and debug: pogo jig on TP2-TP6, SWD connects, flash and verify, repeat 20 times; confirm the 100 R series resistors do not cause flashing errors.
14. Mechanical fit: case closes with 4 screws without light leakage on the lens, no lug play with the strap, button travel, USB-C gasket compression measured (target 0.45 mm minimum, GCT).

Water ingress (what a small company can do itself, and what must not be claimed)
- Method (ESTIMATE, a suggested procedure, not a standard): build 3 dummy units: same case, lens, O-ring, gasket, screws at a fixed torque, a real USB-C connector fitted, a dry paper wick or a water-indicator sticker inside, no battery and no electronics. Steps: (a) dry weigh and visual; (b) 10 minutes at 10 cm depth; (c) 30 minutes at 30 cm; (d) 30 minutes at 1 m only on units that passed; weigh after each and open to inspect; (e) repeat on a second set after 20 USB-C mating cycles, 500 button presses and 10 cycles between 5 C and 40 C. Note that GCT states mated/unmated condition and test depth are not on its drawing. Only after dummy units pass do you test one powered unit, in short immersions and never while charging. Use a consistent pressure-decay or vacuum check if you can borrow one.
- What must NOT be claimed: IP67, IPX7, "waterproof", "water resistant to N metres/ATM", "safe for swimming/showering", or any rating, because: the connector's IP67 depends on 30-40% gasket compression against a panel cut-out of +/-0.03 mm, which printed MJF cannot hold (+/-0.25-0.30 mm); a rating needs a third-party IEC 60529 / ISO 22810 report on the actual unit; Casio notes water pressure on a moving wrist is far higher than the rated static depth (research/enclosure.md). Say "sweat and rain resistant, not tested to a standard" at most, and only after your own dummy tests pass, and never "do not charge when wet" omitted (TI app note: water across VBUS/CC pins corrodes the connector, research/usbc_motor.md).
- A lab report from an accredited test house: price NOT FOUND.

---------------------------------------------------------------------------
## Could not verify
---------------------------------------------------------------------------
- JLCPCB consigned-parts rules/fees, mid-mount-in-notch placement capability, 6-layer 0.8 mm option in the live quote form, and the real PCB price (quote pages unreadable).
- Real PCB, panel and shipping prices; JLCPCB duty basis for consigned parts; any Mouser page (search returned the wrong page).
- VCLP0820B004L price and stock (conflict), Octopart tables for LIS2DH12TR and nPM1300 were garbled.
- O-ring size and price, M1.4 screws, lens price, case print prices, strap volume prices, spring-bar source for 20 mm.
- JLC library type (Basic/Extended) of several parts, so the Extended fee count (about 12) is an estimate.
