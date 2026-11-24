# PitchIQ watch rev D: final audit (manufacturing, procurement, QA), decision on FIRST ENGINEERING PROTOTYPES

Date: 2026-11-23. Read-only audit. Nothing built, ordered or quoted. Cost model: ../docs/COST_revD.md.

Tags: SEEN = read in this run (URL given). SEEN-FILE = read in a repo research/review file dated the same day, not re-read by me. FROM MEMORY = not read anywhere in this run. NOT SEEN = I tried and could not read it, or did not try. MEASURED = I computed it from the board/gerbers with pcbnew or a script.

## VERDICT: NO-GO for ordering boards plus assembly as packaged. GO (owner approval needed) for a split order: sample parts first, boards second.

Reasons in one paragraph: the package passes its own checks (native ERC 0, native DRC 0 errors, netlist = design.py, CPL = board, firmware builds), but (1) it cannot be submitted to JLCPCB Standard double-sided assembly (board 30.7 x 36.1 mm against a 70 x 70 mm minimum, no rails, no fiducials, no panel), (2) the three most expensive parts (U1, U2, J3) sit in the JLCPCB BOM as if JLCPCB stocked them while the files themselves say they are out of stock at LCSC, (3) the CPL carries raw KiCad rotations with a known community correction missing for Q1/Q2 and no preview evidence for the other polarised parts, (4) the four vias in U2's exposed pad are open on top with paste printed over them, (5) the display connector (J1: top-contact FH12A, land pattern assumed equal to the FH12) and the USB-C sealing chain are unproven and are exactly the things a cheap sample purchase can prove before 6-layer boards are bought, and (6) the first-pass reviews (p1_*) pre-date the final board by 30-40 minutes and no re-review of the final layout exists.

---

## 1. Fab package integrity

### 1.1 What I measured (pcbnew on kicad/pitchiq_watch.kicad_pcb; gerbers parsed as text)

| Item | Result | JLCPCB published (SEEN https://jlcpcb.com/capabilities/pcb-capabilities, fetched today) | Verdict |
|---|---|---|---|
| Layers | 6 copper: F.Cu, In1-In4, B.Cu; board thickness 0.8 mm in the job file; files .gtl .g2-.g5 .gbl present | Multilayer 4-32; thickness list includes 0.8 mm but page does "not explicitly confirm 0.8 mm for 6 layers" | 0.8 mm x 6 layers NOT VERIFIED by a quote (same gap as rev C MAJOR 4; PCBWay lists 6L >= 0.9 mm, SEEN-FILE rev C) |
| Mask, paste, silk, edge, drill | F/B mask, F/B paste, F/B silk, Edge_Cuts, PTH.drl, NPTH.drl, drill maps present | needs Gerber + Excellon | complete |
| Outline | 14 Edge.Cuts items, no open endpoints (MEASURED): 30.6 x 36.0 mm, R3 corners, notch x 100.0-106.3 (6.3) by y 85.35-95.65 (10.3) | tolerance +/-0.2 mm regular, +/-0.1 mm high precision | closed; select high-precision outline |
| Notch relief | There are NO relief circles. The notch back corners are R0.5 fillets (arcs centred 0.5 from each corner). | Page gives "no inside corner radius"; says rectangular cut-outs without rounded corners are not supported | MAJOR: R0.5 needs a 1.0 mm router; JLCPCB's minimum non-plated slot is 1.0 mm (SEEN) so it is at the floor; ask DFM |
| Vias | 142 vias, all 0.50 pad / 0.20 drill, ring 0.15 mm (MEASURED) | min via hole 0.15, via dia 0.25; annular ring recommended 0.20, absolute min 0.15; 0.1/0.2 option needs thickness <= 1 mm and ENIG/OSP | legal, at the absolute minimum ring: MINOR |
| Tracks | all tracks 0.20 mm (MEASURED); closest track-track gap 0.20, closest pad-pad 0.151 (U4 LGA pads) | multilayer 0.09/0.09 mm at 1 oz | comfortable |
| Plated slots | 4 slots 1.1 x 0.5 mm in the PTH file as G85 routed slots (lines X100.7Y-84.7G85X101.3Y-84.7 etc., MEASURED) with pads 1.5 x 0.9: the USB-C shell stakes ARE exported as slots, not as 0.5 mm round holes | plated slot min 0.35 mm, length >= 2x width | OK; ring 0.20 |
| Round holes | 0.5 (slot tool), 0.9 NPTH x2, 1.6 NPTH x4; PTH 0.2 vias | PTH hole recommended >= 0.5 mm to avoid mask stuck; non-plated slot min 1.0 | OK |
| Copper to edge | smallest 0.200 mm: all six J3 contact pads and the four stake pads (MEASURED); KiCad rule is 0.19 mm | copper >= 0.2 mm from routed edges; outline +/-0.2 regular | MAJOR: zero margin; with Regular tolerance pad copper can be trimmed. Order high precision or shave pads |
| Hole-to-hole | 0.25 mm rule (KiCad) | not found on page | UNVERIFIED |
| Silk | one aperture, 0.12 mm line (F_Silkscreen D10 C,0.12); 2 KiCad silk_over_copper warnings | silk line >= 0.15 mm; text height >= 1.0 mm | MINOR: 0.12 mm lines will be thickened or dropped; check legibility, nothing functional on silk |
| Via-in-pad | 4 vias in U2's exposed pad (120.4/122.2, 103.3/105.1), no mask aperture at the vias on either side, BUT the pad's own mask opening covers them on top (pad 33 has F.Mask), and 9 paste apertures 0.93 x 0.93 sit on the pad with the four vias inside the apertures (MEASURED) | per the page: "via-in-pad: filled with epoxy or copper paste, plated over; default for 6-layer and higher" (fetch summary; confirm in the quote); plugged vias need no mask openings on either side | MAJOR: top side is not tented, solder paste is printed on open 0.2 mm barrels. No tenting/plug statement exists in the package (the p1 routing review M5 asked for one) |
| Paste | F paste 204 flashes, B paste 25. No paste on test pads TP*, BT1, M1, J2, JP1, shell stakes (MEASURED). Paste IS on J1 (hand-fitted) and on all U1 pads | | OK except J1 gets paste but no part: the pads are tinned, harmless for hand-fitting |
| Surface finish | job file says Finish "None", Revision "rev?" | | MISSING DELIVERABLE: write ENIG (needed for the 0.5 mm pitch module, LGA and exposed programming pads) in the order |
| Stackup / impedance | no stackup in the .kicad_pcb (grep: none); no fab-notes file; no impedance needed (SPI at 1-4 MHz, chip antenna module) | controlled impedance available on 6L; no stackup rule for <= 10 layers | MISSING DELIVERABLE: add a one-page fab note: 6L, 0.8 mm, ENIG, high-precision outline, via treatment, the four plated slots, silk colour, "do not panelise with the notch facing a neighbour" |
| Fiducials / panel / rails | none (grep of gen_pcb.py: no fiducial, panel or rail logic; no FID footprints on the board) | Standard assembly: "Edge rails: required"; "Fiducials: required"; min single board AND panel 70 x 70 mm (SEEN https://jlcpcb.com/capabilities/pcb-assembly-capabilities) | MANUFACTURING BLOCKER (section 2.3) |
| Freshness | pcb 20:54:25, gerbers 20:54:25, CPL 20:56:49, design.py 20:25 | | consistent |

0.8 mm 6-layer availability: the page lists 0.8 mm as FR-4 thickness and imposes a layer restriction only at 2.5 mm and above, but does not confirm 6L at 0.8 mm. The quote page was not read in this run. UNVERIFIED ASSUMPTION; the whole case is built on it (GCT slot 0.80 +/-0.10 mm).

### 1.2 Fixes
- Add 4 via-in-pad treatments: either (a) move the four vias to the pad corners outside the paste windows and keep them tented, or (b) delete the paste apertures over the vias (keep 5 windows), and in all cases write "resin-filled and capped via-in-pad, U2 pad 33" in the fab note and confirm it in the instant quote. Also run the first reflow with the EP void check (QA gate G6).
- Choose high-precision outline or trim the J3 pads 0.05-0.1 mm and set the KiCad copper-edge rule to 0.20 so DRC states the truth.
- Ask JLCPCB DFM/engineering chat about the R0.5 notch corners before paying.

---

## 2. Assembly files

### 2.1 CPL vs board (MEASURED by script)
All 48 CPL rows match the board: same ref set as "not DNP and not hand" in design.py (no missing, no extra), X = board X, Y = -board Y, layer equals the footprint side. Machine-placed: 39 top, 9 bottom (D4-D6, J3, R17-R20, SW1). bom_jlcpcb.csv has the same 48 refs, no duplicates.

### 2.2 Rotation check
Bottom formula in gen_bom.py: rot = (180 - rot) mod 360 for bottom rows. SEEN against the kicad-jlcpcb-tools source (https://raw.githubusercontent.com/Bouni/kicad-jlcpcb-tools/main/fabrication.py lines 686-689: "bottom angles need to be mirrored on Y-axis: rotation = (180 - rotation) % 360", then a per-footprint correction is added). The formula is applied correctly: J3 0 -> 180, SW1 -90 -> 270, D4-D6 90 -> 90, R17-R20 0 -> 180 (symmetric parts), as in the CPL. JLCPCB's own CPL help page names the columns (Designator, Mid X, Mid Y, Rotation, Layer, mm) and says nothing about rotation conventions (SEEN https://jlcpcb.com/help/article/how-to-generate-the-bom-and-centroid-file-from-kicad); its orientation-fix repo only shows editing the CPL after the viewer reveals an error (SEEN https://www.github.com/JLCPCB/JLCPCB-SMT-Assembly-Components-orientation-fix). So the per-footprint corrections are not published by JLCPCB; the only SEEN table is the community one (https://raw.githubusercontent.com/matthewlai/JLCKicadTools/master/jlc_kicad_tools/cpl_rotations_db.csv, 59 rules).

| Ref | Part | Raw / CPL | Evidence | Status |
|---|---|---|---|---|
| Q1, Q2 | AO3400A SOT-23 | 0 / 0 | community DB rule "^SOT-23" correction -90 (SEEN) -> expected 270 | MAJOR RISK: documented correction missing; wrong rotation swaps gate/source/drain; fix CPL to 270 then confirm in preview |
| U2 | nPM1300 QFN-32 | 0 / 0 | DB rule covers QFN-16/20/24/28/40 (270) but not QFN-32 (SEEN) | UNVERIFIED: pin 1 in preview |
| U4 | LIS2DH12 LGA-12 | 0 / 0 | no rule | UNVERIFIED |
| D1, D3 | SOD-323 | 0 / 0 | no rule; D4-D6 (90 / 90, bottom) bidirectional TVS, orientation irrelevant | D1 polarised (flyback): UNVERIFIED; D3 non-polar |
| D2 | SMF5.0A SOD-123F, unidirectional | 90 / 90 | no rule | UNVERIFIED, polarised, cathode must be on VBUS |
| J3 | USB4715 (custom footprint, origin = notch back-edge middle) | 0 -> 180 | the JLCPCB library centroid for C6906846 is the body, not this origin (rev C MAJOR 7, SEEN-FILE) | MANUFACTURING BLOCKER if machine-placed; make J3 hand/consigned (2.4) |
| SW1 | SKRTLAE010, modified pads | -90 -> 270 | no rule; B.Fab shows the actuator lug on the +x side reaching x = 130.59, board edge 130.6 (MEASURED), i.e. outward; the p1 C2 concern (actuator inward) is not what the final board shows; Alps drawing never read | UNVERIFIED (preview + Alps drawing) |
| U1 | Raytac module | 0 / 0 | no rule; antenna must face the board's top edge | UNVERIFIED; consigned/hand anyway |

Unresolved from the first-pass review: p1_component_verification M1/M2. M1 is fixed (formula). M2 (top-side per-footprint corrections) is still open and the generator says so in a comment. The fix is procedural: upload, open JLCPCB's placement preview, compare pin 1 for U2, U4, Q1, Q2, D1, D2, SW1, edit the CPL, pay the $0.45 placement confirmation (SEEN https://jlcpcb.com/help/article/pcb-assembly-price).

### 2.3 JLCPCB double-sided assembly rules and whether the package can be ordered
SEEN https://jlcpcb.com/capabilities/pcb-assembly-capabilities today: double-sided placement is Standard only (Economic is single-sided); Standard minimum single board AND panel 70 x 70 mm; edge rails and fiducials required on Standard; Standard min pitch 0.35 mm (U1/U2/U4 fine); the page does not cover maximum component height, notched mid-mount connectors, consignment, or BOM/CPL rotation rules. Stacked/odd parts are handled manually "with extra labor".

The package as it stands: 30.7 x 36.1 mm, no rails, no fiducials, no panel. It CANNOT be ordered as a Standard double-sided assembly. Whether JLCPCB's own panelisation option adds rails and fiducials to a 30 mm board and passes the 70 x 70 minimum: NOT VERIFIED (their quote page was not read; the assembly page lists "V-cut panels" as a Standard delivery format and an economy mouse-bite format, which says nothing about adding rails). What must be done at order time, in order:
1. Panel: either build a 2 x 2 panel in KiCad (about 74 x 85 mm with 5 mm rails, mouse bites, 3 fiducials per side, notch edges not facing a neighbour closer than 3 mm because J3's body overhangs the board edge by about 2.1 mm, SEEN-FILE rev C) or use JLCPCB's "panel by JLCPCB" option and read back the drawing they return (FROM MEMORY that the option exists).
2. Re-run the CPL on the panel (positions shift).
3. Upload Gerbers, BOM, CPL; choose Standard, double-sided, 6 layers, 0.8 mm, ENIG, high-precision outline, via fill; tick placement confirmation and read the viewer for every polarised part.
4. Mark J1, M1, BT1, JP1, J2 as "not placed"; they are already absent from the BOM and CPL (design.py hand=True). 
5. Tell them J3's four shell stakes need hand soldering (the slots get no reflow paste): $3.58 per order (SEEN).
Alternative that avoids all of the above for first units: order bare 6L boards, put the paste stencil and hot air to work yourself on the 5 boards (about 3 hours per board, section 2.4).

### 2.4 Consigned and hand-fitted parts, workability for 5 boards
| Part | Route in files | Status | Workable for 5 boards? |
|---|---|---|---|
| U1 MDBT50Q-1MV2 | in bom_jlcpcb.csv with C5118826; design.py desc: "LCSC out of stock Nov 23: consign" | SparkFun $8.95 (SEEN-FILE); LCSC out of stock (SEEN-FILE) | Only by consignment. The one consignment page I could read (SEEN https://jlcpcb.com/help/article/how-to-consign-parts-to-jlcpcb) describes an overseas-seller channel: ship to a Hong Kong warehouse, register price/HS code/country of origin, handling 2% (minimum $10), duty held as deposit, storage 3 years. It says nothing about cut-tape rules, quantity overage or US customers' own orders: NOT FOUND. The BOM must be edited so JLCPCB does not try to source U1. |
| U2 nPM1300 | in BOM with C7501206 | DigiKey 8,579 in stock, $2.95 (SEEN today); LCSC 921 (SEEN-FILE, an older note said 0) | Order via LCSC/JLCPCB library if stock holds at order time, else consign. Decide on the day. |
| J3 USB4715-GF-A | in BOM with C6906846 and in CPL | LCSC out of stock (SEEN-FILE); Mouser 2,382 (SEEN-FILE) | Do not machine-place: custom origin, notch mid-mount, shell stakes need hand solder, and out of stock. Set hand=True in design.py, remove from BOM/CPL, fit by hand or consign with the other two. |
| J1 FH12A-10S-0.5SH(55) | hand=True, no LCSC number | the part exists at Future/Avnet/Octopart (titles only SEEN in search; stock NOT SEEN). A JLC part number C5139870 appears in a research note (SEEN-FILE: "91 pcs in stock when logged") | hand-fit with hot air (10 pads at 0.5 mm): fine for 5 boards. Pads already carry paste. |
| BT1 cell, M1 motor, display, JP1, J2 | hand | | fine for 5 |
| Gasket USBTJ-04 | with the connector kit | | fine |

Hand work per board, first 5: J1, J3 stakes (if JLCPCB does not), motor leads, cell leads (polarity check), display flex, bonding of the port plate. About 2 hours of skilled time per board, which the cost model carries as labour.

---

## 3. BOM vs schematic vs board (MEASURED by script)

| Source | Parts |
|---|---|
| design.py | 62 refs (9 DNP, 5 hand) |
| netlist check (check_output.txt) | 62 components, 38 nets, 0 differences |
| board | 66 footprints = 62 + H1-H4 (mounting holes, not in design.py by design) |
| docs/BOM.csv | 62 refs, quantities sum to 62, none missing or extra; plus LCD1, GSK1, FL1 off-board lines |
| out/fab/bom_jlcpcb.csv | 25 lines, 48 refs = CPL's 48 exactly, no duplicates |
| DNP | C24, R12, TP1-TP6, TP8 (shown as "DNP" in BOM.csv; C24 and R12 carry LCSC numbers; test pads are bare copper by design, which is intended for TP2-TP6 and TP1/TP8) |

Findings: MINOR design.py R1 description says "L1/C9 stay fitted so SW1/VOUT1 are terminated"; no L1 or C9 exists in rev D (the buck-1 is unused). MINOR stale text; fix the note. MINOR gen_bom.py still prices U2 at $3.42 (old Mouser); today's DigiKey is $2.95 @1. The DNP handling is correct: nothing DNP or hand-fitted reaches the JLCPCB BOM/CPL.

---

## 4. Sourcing (date 2026-11-23)

Method note: the web fetch tool prompted for permission on most pages and the prompts were not answered; the following were READ today: DigiKey nPM1300 page, JLCPCB capability, assembly and price pages, JLCPCB consignment page, the kicad-jlcpcb-tools source, the community rotation table, McMaster 99461A654, miniaturebearings O-ring page. Everything else is SEEN-FILE from research/procurement.md, usbc_motor.md, mech_inputs.md, strap.md and the rev C cost file, dated 2026-11-23 (not re-read) and is marked as such.

| Item | Result | Status | Alternate? |
|---|---|---|---|
| nPM1300-QEAA-R7 | DigiKey in stock 8,579; $2.95 @1, $2.205 @10, $1.8133 @100; 16 wk; Active (https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-QEAA-R7/19722485) | SEEN | none (single source: Nordic) but stock deep; LCSC 921 (SEEN-FILE) |
| MDBT50Q-1MV2 | SparkFun $8.95/$8.50/$8.06, in stock, quantity not shown; LCSC out of stock from $18.60 | SEEN-FILE | ISP1807-LR-RS (Insight SiP, different footprint: not drop-in) |
| LIS2DH12TR | LCSC 297 from $0.495; DigiKey/Mouser zero until April 2027 (rev C file) | SEEN-FILE | LIS2DW12TR C189624, pad-compatible, no firmware driver exists: single-sourced in practice |
| LS013B7DH03 | DigiKey 33,493, $12.39/$9.60/$7.97, 28 wk; Mouser "obsolete, restricted"; Future 0 | SEEN-FILE | none (Sharp memory LCD, no alternate considered); 28 wk lead is a schedule risk |
| FH12A-10S-0.5SH(55) | listed at Future, Avnet, Octopart (search titles only); DigiKey page blocked; the JLC part number is a note-only claim | NOT SEEN (stock, price) | FH12-10S bottom-contact is the wrong contact side; Panasonic AYF531035 dual-contact (SEEN-FILE p1 review, not priced) |
| USB4715-GF-A (+ gasket/kit) | Mouser 2,382, $1.61/$1.37/$1.17; gasket $0.13; kit USB4715-GF-A-KIT C5984345; LCSC out of stock (SEEN-FILE) | SEEN-FILE | GCT USB4745 IP68 (no price, dimensions NOT FOUND); no other charge-only 6-pin waterproof part found: single-sourced |
| Vybronics VCLP0820B004L | DigiKey earlier 1,766 at $3.15; rev C file: out of stock, 9 wk backorder; Octopart no distributor | SEEN-FILE, conflicting | PUI HD-EM0802-LW15-R ($2.64, 2.6-3.6 V, thickness NOT FOUND); VC0820B006F (2.7-3.3 V, can't sit on VSYS): not drop-in |
| Adafruit 1317 150 mAh | $5.95/$5.36/$4.76, 19.75 x 26.02 x 3.8 mm, in stock | SEEN-FILE | SparkFun PRT-13853 110 mAh, 4.0 mm thick (thicker) |
| FC-135 crystal Q13FC13500004 | LCSC C32346 "Basic", from $0.0736 | SEEN-FILE | many 3215 32.768 kHz crystals; low risk |
| TDK MLP2012H2R2MT0S1 | LCSC C383369, 70,775, from $0.0832 @5; Isat not published | SEEN-FILE | Murata DFE201610E-2R2M C337891 (2016 footprint, Isat 2.4 A): needs a footprint change |
| AO3400A | LCSC C20917 Basic, from $0.0429 | SEEN-FILE | many equivalents |
| SMF5.0A | LCSC C151296, 56,440, from $0.0546 | SEEN-FILE | low risk |
| PESD5V0S1BA | LCSC C2985486 (DOWO), from $0.0125 | SEEN-FILE | low risk |
| Alps SKRTLAE010 | LCSC C110293, 64,910, from $0.0744; Alps drawing never read | SEEN-FILE | sole-sourced footprint (edited pads); no alternate |
| Archer 20 mm quick-release silicone | $19.99, 20 in stock, shipping $6.99 (rev C file); bar body 1.8, tips 0.9 (research) | SEEN-FILE; page blocked today | Barton $21.74, Watch Straps Australia AUD 55, Trendhim GBP 17.99 (no bar dimensions except WSA); retail strap, not a risk |
| Spring bars | come with the Archer strap; separate Archer page exists (title) | SEEN-FILE | Archer only |
| M1.4 thread-forming screws for plastic | No real catalogue part found. McMaster 99461A654 (the Phillips thread-forming result) is M2.5 x 7 (SEEN today, price shown as a placeholder). Zoro lists M1.4 x 4 "thread cutting" torx screws in steel (search title only; that is a metal thread-cutting screw, not a plastic one). McMaster M1.6 x 3.0 brass heat-set insert 92120A150 exists (SEEN-FILE). FROM MEMORY: EJOT Delta PT / PT-WN 5451 exists down to M1.4 but I did not see a catalogue entry or a stockist. | NOT FOUND | Redesign to M1.6 heat-set inserts (needs bay and boss size check; M1.4 heat-set not found) or M2 thread-forming (McMaster family exists at M2.5). MECH_revD.md already says "estimate, not picked from a catalogue": treat as open |
| 1.0 mm hard-coated acrylic / lens | No supplier of a cut 29.4 x 34.7 x 1.0 mm hard-coated window found; Pololu laser cut lists only 3 and 6 mm acrylic (SEEN-FILE); McMaster hard-coated PC is 1.59 mm (SEEN-FILE, $59.64 sheet); Ponoko "from $50 for 1" | NOT FOUND for 1.0 mm | 1.59 mm hard-coated PC breaks the stack (lens is 1.00 in the 11.19 mm stack); plain 1.0 mm PMMA/PC cut by laser |
| Gasket material (1.0 wide x 0.5 thick silicone / PORON, die-cut) | no supplier or price read | NOT FOUND | cut by hand from sheet; no source named |
| O-ring 1.5 x 0.5 mm | OR-00150-050-S70-R: 1.5 mm ID, 0.5 mm section, silicone 70 shore, red, pack of 100, A$100.14 (A$90.13 at 50+ packs), backorder to before 15 Dec 2026 (https://miniaturebearings.com.au/products/o-rings-silicone-rubber-small-packs-2-0-or-00150-050-s70-r-pk) | SEEN, backordered | the same size sold by another Australian shop (title only); note: an ID 1.5 ring on the 2.0 mm plunger stretches it 33%; confirm whether MECH_revD means ID 1.5 or OD 1.5 and pick ID 2.0 x 0.5 if the shaft is 2.0 |

Flags: unobtainable: M1.4 plastic screw, 1.0 mm hard-coated window cut part, gasket supplier. Single-sourced with no practical alternate: nPM1300, LS013B7DH03, USB4715-GF-A, LIS2DH12TR (alternate needs software), SKRTLAE010 (edited footprint), VCLP0820B004L (alternates change the electrical rating), the O-ring in this pack size (one Australian supplier, backordered).

---

## 5. Cost model
See ../docs/COST_revD.md. Per delivered watch, printed enclosure, consigned ICs, panelised JLCPCB Standard, all E unless stated there: about $746 at 1, $245 at 5, $140 at 25, $101 at 100, $71 at 500. Not a quotation; the PCB, consign, shipping, enclosure and labour rows are estimates; only the nPM1300 price, JLCPCB assembly fee table and the O-ring price were read in this run.

---

## 6. QA

### 6.1 Incoming inspection, minimum list for the first 5 units (per part lot, record in a sheet)
1. Bare PCB (5 of 5): outline 30.6 x 36.0 +/-0.2 caliper; notch 10.3 x 6.3; thickness 0.80 +/-0.08 mm (the GCT slot needs 0.80 +/-0.10); the four slots exist and are plated; ENIG not oxidised; continuity of GND, 3V0, VSYS, VBUS to the pads (no shorts: 3V0-GND, VSYS-GND, VBUS-GND > 10 kOhm before any part is powered).
2. U1 and U2: package marking and lot match the distributor bag; U1 pad row flat under a loupe.
3. J3: fit the receptacle to a bare board before soldering anything: shell stakes enter the slots, body sits in the 10.3 x 6.3 notch, flange against the edge; measure the 0.8 mm board in the slot.
4. J1: place the physical FH12A on a 1:1 printout of the footprint; check pad pitch, rear stake positions and the opening direction.
5. Display flex: tail contacts visible side and terminal 1 position against J1 at the fold (paper mock-up, gate S1).
6. Cell: voltage 3.6-4.2 V, measured thickness (3.8 mm), lead polarity; no cell above 4.0 mm goes in the bay.
7. Motor: thickness <= 2.1 mm, resistance, runs at 3.0 V.
8. Gasket: free thickness (calipers, 5 samples); drawing tolerance is +/-0.25 on a 0.15 mm window.
9. Case parts: lug gap 20.2 +/-0.1, board pocket, port window, ream as needed.

### 6.2 Bring-up gate list, first 5 boards
G0 Visual and microscope: U2 pin 1 and U4 pin 1 (marks), Q1/Q2 (gate pin), D1/D2 polarity, J1/J3 solder, bridging on U1.
G1 Power-off resistance: rails to GND (no shorts).
G2 Cell disconnected (JP1 open), bench 3.8 V source current-limited 50 mA on the VBAT pads: quiescent current, then VSYS, 3V0 = 3.0 +/-0.1 V (R2 150 k).
G3 nPM1300 over I2C 0x6B (FROM MEMORY on address; check against the firmware's dts): read ID, set VBUS limit, VBATLOW charge enable (power.c does this; compiles, not run on hardware per its own comment).
G4 SWD: connect through the five programming pads with the pogo jig (nRESET, SWDCLK, GND, SWDIO, 3V0), erase, flash MCUboot + app, read back.
G5 Radio: advertise, connect from a phone, RSSI at 1 m against a bare MDBT50Q-1MV2 dev board (antenna keep-out and LCD metal 1.05 mm from the antenna, p1 routing M4).
G6 PMIC thermal pad: X-ray (JLCPCB offers X-ray at $1.64 per piece for 1-10 pcs, SEEN) or section one board: voids in the U2 pad.
G7 Display: draw, EXTCOMIN toggle, no image inversion; pin mapping via J1.
G8 Motor, frontlight FET (Q1, Q2 gate threshold at 3.0 V), button short/long press via SHPHLD, accelerometer WHO_AM_I 0x33 (FROM MEMORY), interrupt.
G9 Charging: USB-C to USB-C charger and USB-A charger (CC Rd presence unpowered, flat battery), 100/150 mA charge, NTC. Measure the current through the cell.
G10 Ship mode, wake, current in ship mode, 24 h sleep current against power_budget.md.
G11 Leak and retention tests only on units that passed G0-G10.

### 6.3 Physical validation tests this design depends on
| # | Test | Pass criterion | Cheapest way |
|---|---|---|---|
| S1 | Display tail fold: contact side of the Sharp tail vs top-contact FH12A, terminal 1 at east end after a 180 degree fold | contacts face up, terminal 1 aligns with pad 10 of J1 | buy 1 display + 1 FH12A, paper mock-up with the real tail |
| S2 | FH12A land pattern equals the FH12 footprint used | pads, rear stakes, opening direction match on a 1:1 printout | the same samples, no solder |
| S3 | Notch mid-mount fit of J3 in 0.8 mm board: stake slots, flange against the edge, flange to wall distance | body seats, overhang about 2.1 mm, gasket gap measurable | 1 connector kit + a scrap of 0.8 mm FR4 cut to the notch, or the first bare board |
| S4 | Gasket free thickness and compression: 1.50 nominal, compress to 0.975 | five gaskets within 1.40-1.60 and a shim that sets 0.075 mm | calipers, shims, SLA/MJF part |
| S5 | Seal with port plate bonded: bubble/pressure test at 0.2-0.5 bar (low), then 30 min at 1 m immersion with no plug, then with a plug | no bubbles, dry inside, no dye ingress; (no IP claim) | a syringe and tube, a bucket, dye tablet, a dummy unit with only the connector |
| S6 | Connector retention: push 20 N and pull 20 N on the plug with a force gauge | no pad lift, no board movement, gasket gap unchanged | luggage scale |
| S7 | Cover seal and screw pull-out: M1.6 inserts or screws in printed nylon, 4 cycles | no stripped thread after 5 cycles; gasket not leaking | printed fit set |
| S8 | Lug/spring bar pull test: 130 N working load per bar (MECH_revD estimate) | no tear-out in PA12 at 130 N | luggage scale, strap and a printed lug |
| S9 | Button: plunger force with O-ring | total below 3 N, click felt and registered | force gauge, the sample switch and O-ring |
| S10 | Cell swell room: thickness measured under the board with the real cell | 3.8 mm cell clears the back cover by 0.4 mm | calipers |
| S11 | Antenna: return loss / RSSI with display and metal near the antenna end | RSSI within 3 dB of a bare module at 1 m | phone app, a dev board |
| S12 | Nordic CC Rd unpowered (flat watch on a USB-C to USB-C charger) | charger presents 5 V | one board, a USB-C charger |
| S13 | Charging below VBATLOW and at 4.0 V motor limit | flat cell charges; motor never above 4.0 V rms | one board |
| S14 | Lens bond with VHB 0.15 mm and the hard-coated sample | no air bubbles, survives 10 thermal cycles 0-40 C | laser-cut samples |

### 6.4 What goes where
BEFORE the board order, on bought sample parts: S1, S2, S3 (with a bought kit and an offcut), S4, S9, S10 (cell/motor measurements), S7 (printed fit set), S8, the sample gate for J1/J3/SW1 footprints (incoming inspection items 3-4-5-6-7-8), M1.6 screw/insert choice, lens source choice, and a JLCPCB DFM check plus quote for the 6L 0.8 mm panel including the R0.5 notch and via fill. Cost about $105-110 plus a printed fit set ($60-100) (COST_revD.md section 5).
ON the first boards: S5, S6, S11, S12, S13, S14, G0-G11.

---

## 7. GO criteria, one by one

| Criterion | Supported by the files? | Evidence |
|---|---|---|
| Schematic complete | Yes | netlist check: 62 components, 38 nets, 0 differences; stale text only (R1 note) |
| Native ERC run and clean | Yes | out/erc_report_kicad.txt: 0 errors, 0 warnings (KiCad's own ERC, driven on a virtual screen, as check.sh says) |
| Layout complete | Yes (functionally) | 62 footprints, 142 vias, 434 segments, 0 unconnected; 4 mounting holes; but the first-pass routing review was written before the final board and no post-fix re-review exists |
| Native DRC run and clean | Yes, with caveats | KiCad 7.0.11: 0 errors, 0 unconnected, 68 warnings (66 lib_footprint_issues, 2 silk_over_copper). The copper-edge rule is 0.19 mm, below JLCPCB's 0.20 mm. DRC passes where JLCPCB's limit is at zero margin |
| Critical circuits independently reviewed | Partly | p1_electrical_reference.md and p1_routing_review.md exist but date from 20:17-20:19 against a board regenerated 20:54; their findings (C25/PVDD, D2 near J3, via fill, J3 vs cell) look fixed in the board by position but no document records it; the electrical CRITICAL (charge below VBATLOW) is fixed in power.c (SEEN), not run on hardware |
| Major footprints and pin mappings verified | No | Hirose FH12A land pattern never read (drawing blocked); Alps SKRTLAE010, TDK, Littelfuse, Nordic land patterns never read; custom USB4715 footprint matches the GCT drawing by callouts but with pads starting 0.20 mm behind the notch edge. U1/U2/U4/J1 pin mapping consistent with datasheet extracts in research/datasheets.md; pin 1 CPL orientation unverified |
| CAD assembly complete | Yes, as a model | 23 STEP files + assembly.step; 0 hard findings in cad/report.md; "component bodies are envelopes at datasheet size, not vendor models" |
| PCB and enclosure mechanically compatible | Not proven | CAD reads the board outline from gen_pcb.py and passes (cell to USB-C 0.20 mm, plunger to switch 0.04 mm). MECH_revD's own worst-case chain shows cell to back -0.2 mm with a 4.5 mm cell, cell to USB-C 0.0, board to wall -0.05 on MJF. Nothing fitted |
| Critical clearances accounted for | Yes, on paper | tolerance table in MECH_revD.md; the gasket window (0.15) vs MJF (+/-0.65) is solved only by the port-plate bond step, which is untested |
| USB-C sealing has a defensible design | Defensible as a test plan, not as a result | port plate + shim + RTV fillet; the doc itself states "No water-resistance claim is made"; gasket drawing tolerance +/-0.25 mm against a 0.15 mm window, retention force unknown |
| Sourcing viable | Partly | big ICs obtainable (nPM1300 SEEN 8,579; U1 SparkFun; J3 Mouser per file); the display lead time is 28 weeks, the motor and U4 are thin or out; M1.4 screw, lens cut part, gasket supplier not found; J1 stock NOT SEEN |
| Manufacturing documentation complete | No | no panel/rails/fiducials, no fab-notes file, no stackup or finish (job file: Finish "None"), no via-fill statement, no assembly drawing, no consignment procedure, J3 mis-flagged as SMT |
| Firmware builds; pin mappings consistent | Yes | build_logs/boss_revD_core/dk/pitchiq: EXIT 0; core host tests ALL PASS and sanitizer clean; pitchiq build uses MCUboot's DEBUG signing key (CMake warning, SEEN); PQ_PIN_* in pitchiq_watch-pinctrl.dtsi (13, 15, 17, 20, 22, 24, 26, 27, 4, 6, 11) equals design.py's module pin map. No hardware ever run |
| No known defect makes fabrication unreasonable | Yes, if the fixes below are made | no electrical short or net error found; the problems are manufacturing, not function |
| Remaining unknowns defined as physical tests | Yes (this audit adds the full list in 6.3) | MECH_revD.md lists the unproven items in prose; no pass criteria until now |

---

## 8. Findings, classified

MANUFACTURING BLOCKERS
- MB1. No panel, rails or fiducials, 30.7 x 36.1 mm vs 70 x 70 mm minimum (SEEN). Fix: 2 x 2 KiCad panel with rails/fiducials, or confirm JLCPCB's panelisation in the quote; re-run CPL.
- MB2. U1, U2, J3 are in the JLCPCB BOM as library parts; the repo's own notes say LCSC is out of stock; consignment terms for a US customer NOT FOUND. Fix: remove U1 and J3 (set hand=True), confirm U2 stock the day of the order or consign, send the rules in writing.
- MB3. J3 CPL origin is the notch back-edge middle, not the part centroid. Fix: hand-fit J3 and delete it from the CPL.
- MB4. Fab files carry no finish, stackup or fab note (job: Finish "None"). Fix: write ENIG, 0.8 mm, 6L, high-precision outline, via fill in a fab-notes file.

MAJOR RISKS
- MR1. Q1/Q2 CPL rotation 0, community DB rule "^SOT-23" says -90. Fix: CPL 270 and verify in preview.
- MR2. U2 exposed pad: 4 open vias with paste printed over them. Fix: move vias or cut paste, state via-in-pad fill, X-ray/section one board.
- MR3. All J3 pads and stake pads at exactly 0.200 mm from the notch, JLCPCB minimum 0.2 mm, regular tolerance +/-0.2 mm. Fix: high-precision outline and trim pads.
- MR4. R0.5 notch corners, JLCPCB gives no inside-radius rule (1.0 mm slot minimum). Fix: ask DFM before paying.
- MR5. 0.8 mm 6-layer not confirmed by a quote. Fix: open the instant quote with the real size.
- MR6. M1.4 screws, 1.0 mm window cut part and gasket source do not exist as catalogue items I could find. Fix: switch to M1.6 inserts (McMaster 92120A150) and re-check the bay, order plain 1.0 mm laser-cut PMMA/PC.
- MR7. Single sources: LIS2DH12TR (US stock none), VCLP0820B004L (backorder), SKRTLAE010 (edited footprint), USB4715-GF-A, LS013B7DH03 (28 weeks). Fix: buy spares for all 5 boards at once (about 10 U4, 3 motors).
- MR8. Port-plate sealing relies on a bonded shim step never tried and a gasket whose tolerance (+/-0.25) exceeds the window. Fix: S4, S5, S6 on a dummy unit before the board order.

CRITICAL DEFECT
- None found that makes fabrication unreasonable. I found no net error, no short, no polarity mistake in the design data. If J1's footprint or pin order is wrong (UNVERIFIED, see below) it becomes a CRITICAL DEFECT for the display; therefore it is a pre-order gate.

UNVERIFIED ASSUMPTION
- UA1. J1 FH12A land pattern equals the FH12 footprint (design.py says so itself); display contact side and terminal order after the fold are inferred (90% by the review). Gate S1/S2 before boards.
- UA2. SW1 actuator direction and edited pads (Alps drawing never read); B.Fab shows the lug pointing outward.
- UA3. Rotation of U2, U4, D1, D2, SW1, U1 in JLCPCB's library.
- UA4. U2/L2 inductor saturation current (TDK does not publish it; margin argued only).
- UA5. 10 uF 0603 10 V X5R capacitors keep about 40-60% capacitance at 3-5 V (FROM MEMORY per p1 review).
- UA6. nPM1300's CC Rd present with the chip unpowered (Nordic is silent).
- UA7. O-ring ID/OD meaning in MECH_revD (1.5 x 0.5) vs a 2.0 mm plunger.

MINOR
- Via ring 0.15 mm at the minimum; silk lines 0.12 mm; R1 desc mentions L1/C9 that do not exist; gen_bom.py U2 price stale; MCUboot debug signing key in the firmware build; 66 lib_footprint_issues warnings (custom footprints).

MISSING DELIVERABLE
- Panel file, fiducials, fab-notes/stackup/finish, via treatment statement, assembly drawing, consign procedure and shipping list, written JLCPCB DFM answers, a confirmed 6L 0.8 mm quote.

PHYSICAL-TEST DEPENDENCY
- S1-S14 above; four of them (S1, S2, S3, S4) gate the board order.

---

## 9. Verdict and order split

NO-GO for ordering the boards and JLCPCB assembly as the package stands.

GO, subject to the owner's approval, for ORDER 1 (sample parts, about $105-110 for the electronic and mechanical samples plus a printed fit set at $60-100, COST_revD.md section 5): 2 displays, 5 FH12A, 5 SKRTLAE010, 2 cells, 2 motors, 3 USB4715 kits, 3 nPM1300, the Archer strap, a printed MJF/SLA fit set, laser-cut 1.0 mm window samples, the O-ring pack (backordered to mid-December), and a JLCPCB quote with a DFM answer on the notch corners, via fill, 0.8 mm 6L, panelisation and consignment.

ORDER 2 (6-layer boards plus assembly) only after: S1-S4 pass; the CPL is corrected (Q1/Q2 270) and previewed; U1, J3 are removed from the JLCPCB lines; the panel with rails and fiducials exists; the via-in-pad fix and the fab note are added; high-precision outline is selected; and a post-fix independent re-review of the final board exists. If JLCPCB cannot take the panel, order bare 6L boards only and assemble the 5 prototypes by hand with a stencil.
