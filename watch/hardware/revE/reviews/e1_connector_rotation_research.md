# E1: display connector, CPL rotation and panel research (rev E)

Date 2026-11-23. Read-only on the design. Scratch in /tmp/e1conn. Tags: SEEN / MEASURED / ESTIMATE / NOT FOUND.

## PART 1. Display flex connector

### 1a. Sharp LS013B7DH03 (spec LCP-1112045, local /tmp/ds/sharp.pdf, 30 PDF pages = spec pages +2)
Rendered PDF page 25 (spec p.23, Fig 8-1) at 300 dpi and READ it; also PDF p.10 (Table 4) and p.11 (Fig 4-2).
- SEEN (sharp.pdf p.10, Table 4): 1 SCLK, 2 SI, 3 SCS, 4 EXTCOMIN, 5 DISP, 6 VDDA, 7 VDD, 8 EXTMODE, 9 VSS, 10 VSSA. Matches our net order.
- SEEN (drawing, p.25 left view "Display side up"): tail leaves the glass at 6 o'clock, centred. Terminal circle "10" is at LEFT, "1" at RIGHT (viewed from the display front). Stiffener (cross-hatched block) is drawn on this FRONT view, 5.5 +/-0.05 wide, spanning terminals 10..1.
- SEEN (drawing, p.25 right view "Back side up"): the contact fingers (10 vertical strips with the lead-in ticks) are drawn at the tail end on the BACK view. The stiffener is not drawn there. So: contacts on the back (polarizer-opposite) face, stiffener on the front face, contacts and stiffener on OPPOSITE faces. Pin 1 is at the right edge in front view, so it is at the left in the back view.
- SEEN tail geometry (p.25 dims): tail centred (13.3 from module left edge = centre line; 8.565 + 9.47 = tail wide part 9.47 mm wide, starts 8.565 from module left edge). Glass-edge-to-tail-end 13.63 mm. Stiffener block lower edge flush with the tail end, upper edge ~3.39 mm (BM) below the glass lip (the "3.39 (BM)" and "1.6" dims; I read 1.6 as the glass lip step, not the tail). Narrow contact section about 5.5 mm wide (between the two relief slits).
- SEEN thickness: side view prints "0.3 +/-0.3" at the tail (almost certainly a typo for +/-0.03). Panasonic Y5B sheet says applicable FPC t = 0.30 +/-0.03, so they agree (ESTIMATE that it is the stiffened contact area).
- SEEN contact pitch: not dimensioned in the drawing. 0.5 mm follows from the recommended connectors and the 5.5 mm stiffener (A = 4.5 mm for 10 contacts, +1 mm).
- SEEN (p.25 text): flat tail: "SMK FP12 Series: CFP-4610-0150F (Bottom side contact), Molex 51441-1093 (Bottom side contact)". Bent (Fig 8-2, same page): "SMK FP12 series: CFP-4510-0150F (Top side contact)". Bend zone 0.8-6.0 mm from glass edge, inner R0.45 min, "Do not bend backward (toward polarizer film side)", max 3 bends (180 -> 0 deg).
- Fold logic (ESTIMATE, derived): flat = contacts face down into a bottom-contact part; fold 180 deg under the glass (away from the polarizer) turns the contact face UP and keeps east as east, so terminal 1 stays EAST. Needs a TOP-contact or dual-contact connector with its opening facing the board edge the tail came from (south).
- MEASURED (pcbnew): J1 on the board is at (14.0, 31.0), rotation 0.0, front side, footprint Hirose_FH12-10S-0.5SH_1x10-1MP_P0.50mm_Horizontal. In that footprint (SEEN, KiCad file lines 1-40: pads y=-1.85 per earlier review, body to y=+4.4) the opening is toward -y (north, inward). The fold needs the opening to face SOUTH (the lower edge). This matches reviews/p1_display_connector.md sec 4: J1 should be rotated 180 (nets stay pad n = terminal n) rather than "nets reversed at rot 0". I did not re-derive the netlist; check design.py J1 nets against this before ordering.

### 1b. Hirose FH12A-10S-0.5SH(55) vs KiCad FH12-10S footprint
- NOT FOUND: the Hirose drawing/land-pattern page. hirose.com and Arrow-hosted catalog (static6.arrow.com ...fh12catalogd31648en.pdf) fetched as binary/forbidden. Local /tmp/ds/fh12.pdf is a 21-byte "Forbidden." HTML file, not a datasheet.
- SEEN (pdf.elecfans.com/p/5134544.html via WebFetch, tables garbled): "A: top contact type"; HRS numbers FH12-10S-0.5SH = 586-0522-3, FH12A-10S-0.5SH = 586-0550-9; FPC t = 0.3 +/-0.05 for the series (no separate FH12A figure); test land 0.3 x 1.3 mm, metal mask 0.25 x 1.3 mm, mask 0.15 mm thick; 10-pin A = 4.5 and FPC B = 5.5 for both types.
- SEEN (Toronto-hosted Hirose FH12 catalogue, page 4 and 7 as relayed by WebFetch): FH12-10S: A 4.5, B 8.1, C 9.1, D 5.57. FH12A-10S dimension row came out as 9.1 / 8.35 / 4.5 / 9.5 / 5.57 with unlabeled columns. Reading this literally suggests FH12A is wider (8.35 vs 8.1) and has a different column set, so the outlines may NOT be identical. This is ESTIMATE only because the column labels are lost.
- Comparison with KiCad footprint (SEEN, /usr/share/kicad/footprints/Connector_FFC-FPC.pretty/Hirose_FH12-10S-0.5SH_...): pitch 0.50, MP stakes at x=+-4.15 (centre spacing 8.3), fab body x +-4.05 (8.1 = FH12 dim B, matches), body y -1.2..4.4 (5.6 = FH12 dim D 5.57, matches), courtyard x +-5.55, y -3..4.9. The catalogue test land 0.3 x 1.3 agrees with signal pads 0.3 wide.
- VERDICT: the FH12 footprint is verified against FH12, NOT against FH12A. KiCad ships no FH12A footprint (Connector_FFC-FPC.pretty has FH12, FH26, FH41 only; ls MEASURED). For FH12A, the pad row, tab-stake position and the actuator side relative to the contact tails are unverified. Because J1 is flagged hand=True in design.py (hand-soldered, not in the CPL), a pad mismatch will not be caught by JLCPCB; it would show on the first board only. Treat "same footprint is valid for FH12A" as NOT PROVEN.
- Stock (SEEN, futureelectronics.com FH12A-10S-0.5SH-55-hirose-electric-7009729): 0 in stock, 10,000 on order (first 6,000 due 03/08/2027), MOQ 2,000 at $0.75, flip lock, height 2 mm max, FPC thickness 0.3. FH12A is effectively not buyable as single pieces there. Earlier review (secondhand) quotes JLC C5139870 with 91 pcs; not rechecked.

### 1c. Dual-contact alternative: Panasonic AYF531035 (Y5B series)
- SEEN (DigiKey UK page, WebFetch): DigiKey 255-AYF531035, In-Stock 14,906; price GBP 0.66 @1, 0.557 @10, 0.4727 @100 (cut tape); status Active; flip lock, back lock; Surface Mount, Right Angle; 10 positions, 0.5 mm. Page: https://www.digikey.co.uk/en/products/detail/panasonic-industry/AYF531035/2402937. Same page lists AYF531035A (variant) 1,126 in stock at GBP 1.47. (USD price at digikey.com not fetched.)
- SEEN (Future page): AYF531035 0 stock, lead time 17 weeks, 5,000+ $0.345 only. So DigiKey is the single-piece source. Mouser page failed to load (NOT FOUND).
- SEEN datasheet: https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/9053/Y5B-W.pdf (not downloaded; relayed by WebFetch). Panasonic product page https://industry.panasonic.com/global/en/products/control/connector/fpc-ffc/number/ayf531035: "top and bottom contact", back lock, lever LCP, body length 7.00 mm, height 1.00 mm.
- Applicable FPC thickness 0.30 +/-0.03 mm (SEEN, datasheet via WebFetch). Equals Sharp tail 0.3 at the stiffened contact area. Body: height 1.00 mm; depth 3.20 mm (3.70 with lever open or lever included); length 7.00 mm. Recommended FPC: exposed contact length 1.5 mm min, total FPC length (A+1) = 5.50 +/-0.05 for 10 pins, stiffener 2.5 mm min length. Sharp tail: stiffener 5.5 wide matches the 5.50 cut width; this width matches the Sharp contact section.
- Lock: back flip (lever at the rear, FPC enters on the side opposite the lever). Cable-entry side relative to the solder tails: datasheet text says insertion is opposite the lever; whether the solder tails are on the entry side is NOT stated in the text I could get. Eigentime32's footprint places the tabs on the lever (+y) side of the pad row and its notes say the part takes the FPC on the pad side, 1.5 mm deep. ESTIMATE: at footprint rot 0 the cable enters from -y.
- Land pattern: the PDF text gave unlabeled values (0.30, 0.50, 0.80 x2, 0.40, 3.30, 1.00 x2; mask 120 um, 57% opening). The labelled version exists in a third-party KiCad footprint SEEN at /tmp/lcdrefs/Eigentime32/hardware/Eigentime32.pretty/Panasonic_AYF531035_1x10-1MP_P0.5mm_Horizontal.kicad_mod, whose descr says "Land pattern from Panasonic AYF53 datasheet ACCTB1E 201709-T; paste openings 0.25 x 0.31 mm per Panasonic metal mask pattern; body checked against the Y5B drawing". I did not verify it against the Panasonic PDF drawing myself (the 3.30 and 0.80/0.40 values in the text agree with it: 3.30 = tab-to-tab spacing, 0.4 x 0.8 tab pads, 0.3 pad width).
- KiCad ships NO AYF531035 footprint (NOT FOUND in Connector_FFC-FPC.pretty, which has no Panasonic entries). Complete footprint definition below.

Footprint "Panasonic_AYF531035_1x10-1MP_P0.5mm_Horizontal" (SEEN in Eigentime32 file, origin = centre of the signal pad row, pad row y=0, mm, KiCad y down):
| item | position | size | layers |
|---|---|---|---|
| pad 1..10 | x = -2.25, -1.75, ... +2.25 (pad n at x = -2.75 + 0.5 n), y = 0 | 0.30 x 0.80, rect | F.Cu, F.Mask |
| paste for each signal pad | same x, y = -0.045 | 0.25 x 0.31 | F.Paste |
| mounting pad "MP" left | (-3.25, +2.5) | 0.40 x 0.80 | F.Cu, F.Paste, F.Mask |
| mounting pad "MP" right | (+3.25, +2.5) | 0.40 x 0.80 | F.Cu, F.Paste, F.Mask |
Pad 1 = leftmost (x = -2.25). Body (SEEN in Panasonic page/datasheet figures): 7.00 x 3.20 mm (3.70 with lever), 1.00 high; body sits on the +y side, the MP stakes at y=+2.5 are on the lever side, so the FPC slot opens toward -y at rotation 0 (ESTIMATE, from the tab placement and Eigentime's "FPC enters on the pad side"). Suggested outline: fab rectangle x +-3.5, y -0.5..+2.7 (ESTIMATE, I did not extract the fab lines); courtyard x +-4.3, y -1.5..+3.3. Silk: pin-1 mark at the -x end outside the slot edge. For our fold: place at rot 180 so the slot opens south and pad 1 lands at +x (east), nets pad n = Sharp terminal n.
- No alternate 0.5 mm dual-contact part from Hirose/Molex/Omron was verified. Hirose FH34SRJ-10S-0.5SH(50) was named by the earlier review (worxpad's choice) but I did not open its page: NOT VERIFIED.

### 1d. Recommendation
Move to the dual-contact Panasonic AYF531035 (DigiKey 14,906 in stock, GBP 0.66 at 1, 1.0 mm high) using the Eigentime-derived footprint above, J1 at rot 180, nets pad n = terminal n.
- Why: removes the contact-face risk (a) completely; FH12A is out of stock at Future (MOQ 2,000) and its land pattern is unproven against KiCad's FH12 footprint (b); the AYF is 1.0 mm high, within the 2.0 mm limit.
- Remaining risks of AYF531035: (1) the footprint came from a third-party repo that quotes the Panasonic datasheet, not from my own read of the drawing; check the Y5B drawing page before layout; (2) cable-entry side vs tails is an inference; confirm in the drawing; (3) tail length: the tail ends 13.63 mm from the glass, the contact area needs 1.5 mm min exposed length and 5.5 mm tail, the bend zone is 0.8-6.0 mm from the glass, and the Sharp stiffener is 5.5 mm wide vs 5.50 FPC cut width (zero margin); (4) back-lock lever closes toward the rear, so the lever must be accessible and the panel must not cover it before closing; (5) thin 0.3 mm tail with stiffener on the face opposite the contacts: fine for a dual-contact part, but check that the Y5B grips the stiffener (it does by design, FPC t 0.30).
- Remaining risks if staying with FH12A: footprint unverified (b), no single-piece stock found (Future), the part is top contact only, so the contact-face answer must be right (SEEN evidence says top for a folded tail, 90% by the earlier review), plus tail length/depth unverified (c).

## PART 2. CPL rotation

### Sources read
- Bouni/kicad-jlcpcb-tools: cloned (HEAD dated 2026-11-22). Its rotation database is the same file: library.py:2228 downloads https://raw.githubusercontent.com/matthewlai/JLCKicadTools/master/jlc_kicad_tools/cpl_rotations_db.csv. The Corrections Manager can override per footprint/value/reference/LCSC part. NOTE the repo contains no checked-in rotations file of its own.
- matthewlai/JLCKicadTools: cpl_rotations_db.csv, 60 lines (59 rules), read in full (printed to /tmp/e1conn; HEAD dated 2025-05-01).

### How each tool treats bottom-side parts (SEEN source)
- Bouni fabrication.py lines 680-706: rot = KiCad orientation; if footprint is on the bottom (layer != 0): rot = (180 - rot) % 360; then rot = (rot + correction) % 360.
- JLCKicadTools cpl_fix_rotations.py: finds the LAST regex in file order that re.match()es the footprint name (anchored at start); bottom side: rot = (rot - corr) % 360 then rot = (-rot + 180) % 360, i.e. 180 - rot + corr; top: rot + corr. Same result as Bouni. Also flips the sign of X for bottom parts if KiCad exported it negative.
- scripts/gen_bom.py:64-72 (SEEN): bottom: rot = (180 - rot) % 360 (same as both); SOT-23 footprints get an extra -90; no other rules. Hard-coded endswith("SOT-23") instead of the DB regex; equivalent for our two SOT-23 parts. Position: uses KiCad's pos-file origin, whereas Bouni uses the bbox centre of the soldered pads (MEASURED: only SW1 differs, by 0.15 mm in x; all other CPL parts <0.05 mm). DNP and hand-soldered parts (U1, BT1, J1-J3, JP1, M1, TPs, R12, C24) are correctly excluded from CPL and BOM.

### Every CPL row (MEASURED with pcbnew on the board file and a regex run of the JLCKicadTools DB; no tool was run to alter anything)
Rule column: regex and offset; "no rule" means no entry in the DB matches. Expected = tool formula. Bottom rotations in the board are KiCad degrees.

| Ref | Footprint | Side | KiCad rot | CPL now | DB rule | Expected | Flag |
|---|---|---|---|---|---|---|---|
| D4, D5, D6 | D_SOD-323 | Bottom | 90 | 90 | no rule | 90 | ok |
| R17, R18, R19, R20 | R_0402_1005Metric | Bottom | 0 | 180 | no rule | 180 | ok |
| SW1 | SW_Push_1P1T-MP_NO_Horizontal_Alps_SKRTLAE010 | Bottom | 270 | 270 | no rule | 270 | ok |
| C1 | C_0603_1608Metric | Top | 0 | 0 | no rule | 0 | ok |
| C2, C3, C4, C5, C12, C13, C21 | C_0402_1005Metric | Top | 0 | 0 | no rule | 0 | ok |
| C6, C7 | C_0603_1608Metric | Top | 0 | 0 | no rule | 0 | ok |
| C8, C10 | C_0603_1608Metric | Top | 180 | 180 | no rule | 180 | ok |
| C11, C22, C23, C25, C26 | C_0402_1005Metric | Top | 90 | 90 | no rule | 90 | ok |
| D1, D3 | D_SOD-323 | Top | 0 | 0 | no rule | 0 | ok |
| D2 | D_SOD-123F | Top | 90 | 90 | no rule | 90 | ok |
| L2 | L_0805_2012Metric | Top | 180 | 180 | no rule | 180 | ok |
| Q1, Q2 | SOT-23 | Top | 0 | 270 | ^SOT-23, -90, offset 0,0 | 270 | ok |
| R1, R2, R3, R4, R9, R10, R11, R13, R14, R15, R16, RT1 | R_0402_1005Metric | Top | 0 | 0 | no rule | 0 | ok |
| U2 | QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm | Top | 0 | 0 | no rule (the QFN rule `^(.*?_|V)?QFN-(16|20|24|28|40)(-|_|$)` does not match 32) | 0 | ok |
| U4 | LGA-12_2x2mm_P0.5mm | Top | 0 | 0 | no rule | 0 | ok |
| Y1 | Crystal_SMD_3215-2Pin_3.2x1.5mm | Top | 0 | 0 | no rule | 0 | ok |

Result: 0 rows differ from what the database implies (45 CPL rows checked; script output kept at /tmp/e1conn/cpl_check.txt). BUT "no rule" only means the community has not logged a correction, not that JLC's library angle equals KiCad's. The community DB has no entries for SOD-323, SOD-123F, 3215 crystal, LGA-12, QFN-32, or the Alps switch.

Rows to change per the database: NONE. Rows that need a human look in JLCPCB's placement preview: U2, U4, Y1, D1, D2 (and D3-D6 TVS, symmetric-looking but polarised), Q1, Q2, SW1, L2 (symmetric, no risk).

### JLCPCB/EasyEDA library orientation for polarised parts
NOT FOUND for every one of them. I searched (EasyEDA forum threads, KiBot position notes, kibot issue 510 turned up in results) but could not retrieve per-part orientation pages: JLCPCB's part detail pages do not state pin-1 orientation, and EasyEDA's API is not reachable via github-only curl. Confidence estimates (ESTIMATE, not measured):
- U2 nPM1300 QFN-32 (C7501206): KiCad QFN pin 1 is top-left at 0 deg; JLC library for QFN is normally pin 1 top-left too, and the DB's QFN rule (270) is for 16-40 pin sizes that most likely have different EasyEDA-library orientation; 32 is listed in that regex? NO: the regex lists 16, 20, 24, 28, 40, not 32. That gap is itself a warning: QFN-32 parts were not logged. Confidence in 0 deg: ~60%. Must check JLC preview. Also C7501206 is a newly listed part and may be an extended/custom library entry.
- U4 LIS2DH12 LGA-12 (C110926): confidence ~55% for 0 deg; LGA-12 is not in the DB. Check preview.
- Q1/Q2 AO3400A SOT-23 (C20917): DB says -90 for ^SOT-23 (SEEN, applied): ~85%.
- D1 1N4148WS SOD-323 (C2128), D3-D6 PESD5V0S1BA (C2985486): no DB rule; ~65% for 0 deg (D_SOD-323 cathode at pad 1 on KiCad's left; JLC library convention often matches), preview check needed. Bottom D4-D6: formula 180 - rot as tools do.
- D2 SMF5.0A SOD-123F (C151296): no rule; ~60%. Unidirectional TVS polarity matters here.
- Y1 32.768 kHz 3215 crystal (C32346): no polarity (2-pin); a 180 error is harmless electrically.
- SW1 Alps SKRTLAE010 (C110293): no rule; symmetric tactile switch footprint but the side-mount orientation at bottom side: ~50%; preview required. SW1 position offset 0.15 mm (pad bbox vs origin) exists.
- L2 2.2 uH 0805: no polarity.
Action: before ordering, open JLCPCB's SMT preview for U2, U4, D1, D2, D3-D6, Q1, Q2, SW1 and compare pin-1 marks with the board silk; adjust CPL rotation there. That is the only way to be sure.

## PART 3. Panel for two-sided assembly

### KiKit version for KiCad 7.0.11 (SEEN, GitHub workflow files at tags)
- v1.4.0 CI: kicad v6, v7; v1.5.0 CI: v7, v7-testing, v8-testing, nightly; v1.6.0 CI: v7, v7-testing, v8, v8-testing; v1.7.0 CI: v7, v7-testing, v8, v8-testing, nightly; v1.7.2 CI: v8, v9; v1.8.0/v1.8.1 CI: v9, v10 ("only KiCAD 9 and 10 are supported" in bug_report.yml).
- So pin kikit==1.7.0 or 1.7.1 for KiCad 7.0.11 (latest CI-tested for v7; I did not check v1.7.1's matrix: ESTIMATE it equals 1.7.0). 1.6.0 is also fine. Do not use 1.7.2 or newer. KiKit needs the pcbnew Python module of the same KiCad install (system python with KiCad 7). Shapely >= 2.0.3 is required by the current setup.py; older tags may need other pins (NOT checked). Do not install anything now.

### Recipe (CLI; JSON keys SEEN in kikit panelization docs at master; keys should be the same at v1.7.0 except where noted)
```
kikit panelize \
  --layout 'grid; rows: 2; cols: 2; hspace: 2mm; vspace: 2mm' \
  --tabs 'type: annotation' \
  --cuts 'type: mousebites; drill: 0.5mm; spacing: 0.8mm; offset: 0.2mm; prolong: 0.5mm' \
  --framing 'type: railstb; width: 5mm; space: 3mm; mintotalheight: 70mm; mintotalwidth: 70mm' \
  --tooling 'type: 4hole; size: 2mm; hoffset: 2.5mm; voffset: 2.5mm; paste: false' \
  --fiducials 'type: 3fid; coppersize: 1mm; opening: 2mm; hoffset: 5mm; voffset: 2.5mm' \
  --post 'millradius: 1mm' \
  pitchiq_watch.kicad_pcb panel.kicad_pcb
```
Rails: `railstb` puts rails top and bottom; use `railslr` to put them left/right (choose the pair parallel to the long side that carries the connector so the antenna end is not at a rail). 2 x 2 of 30.6 x 36 gives about 63.2 x 74 mm before rails, so 5 mm top/bottom rails make about 63.2 x 84 mm; mintotalwidth 70 mm then forces extra width (a rails-only frame adds material to the rail in the requested direction; confirm in the result).
Tabs: `annotation` type: place `kikit:Tab` footprints on the board edge in the board file, one or two per side, away from the notch edge and the antenna end (the spacing/fixed tab types cannot avoid features). Tab width about 3 mm; 2 mm tabs also OK for a thin board.
Fiducials on three corners per side: KiKit's `3fid` puts the three fiducials on the frame/rail, and it puts them on BOTH sides of the panel (copper and mask opening on F and B) per its docs behaviour (ESTIMATE; confirm in the generated file). Fiducial copper 1 mm with mask opening 2 mm = JLC convention. Tooling holes `4hole` at corners, size 2 mm.
JLCPCB specific: there is a preset `jlcTooling.json` (3 holes of 1.152 mm, paste false, mask margin 1.3 mm) in kikit/resources/panelizePresets, which is JLC's own PCB-order tooling; if JLC adds the rails, use no tooling. JLC also has `jlcVcuts.json`; we do not want V-cuts.

### Known pitfalls (SEEN in docs/source where noted, otherwise ESTIMATE)
1. Current KiKit (master, v1.8.x) refuses KiCad 7; use v1.7.0 as above. Python must be the one that provides pcbnew.
2. Mouse bites with a rounded-corner board: set `prolong` so the drill line reaches through the corner fillet; the doc says "offset: positive puts the cuts into the board, negative puts the cuts into the tabs" (SEEN docs/panelization/cli.md). Keep bites at a drill 0.5 mm, pitch 0.8 mm for a 3 mm tab (about 4 holes). Drills of 0.5 mm are above JLC's 0.5 mm min? JLC's non-plated hole minimum is 0.5 mm; verify in their DFM.
3. Edge notch: KiKit's `source: auto` finds the outline; an inward notch is fine, but `annotation` tabs near the notch edge can overlap the notch. Place tab annotations only on the flat straight edges; avoid the antenna keep-out side.
4. Boards panelled top-to-bottom grid: the notch must face the same way on all four pieces, which a plain grid gives; do not use alternation unless you also want mirrored boards.
5. Two-sided assembly: fiducials need to be on both sides; panel needs its own fiducials, because the assembler uses the rail ones. Keep copper-free clearance 3 mm around each. Fiducials per board on the board itself are not added by KiKit.
6. Rails vs components: JLC wants 5 mm rails on the two long sides for assembly (parts nearer than 3-4 mm to the rail edge are not placed). Our boards are separated by 2 mm gaps and the edge parts (R17-R20, TPs on the left edge at x about 2.4-5 mm) are fine because the rails are outside the board.
7. After panelising: rerun DRC on the panel, and regenerate the CPL from the PANEL (KiKit renames refs unless `renameref: "{orig}"`; default in the preset is "{orig}", so every board has the same ref; JLC requires unique designators in a panel when it places by designator, so use `renameref: '{orig}_{n}'` or give JLC the single-board CPL plus a panel note). This is the main assembly pitfall.
8. Output a panel .kicad_pcb with `--post 'millradius: 1mm'` only if the fillet is wanted; for outer rails use `fillet: 1mm` in framing.
9. Gerber/CPL for a panel via the plugin kicad-jlcpcb-tools is not guaranteed to work with KiKit 'renameref'; test.

## Facts for memory (main session decides)
- J1 hand-soldered; AYF531035 at DigiKey UK GBP 0.66 @1, 14,906 in stock (2026-11-23).
- CPL file matched DB for all 45 rows; remaining risk is JLC library orientation of U2, U4, D1-D6, Q1, Q2, SW1.
