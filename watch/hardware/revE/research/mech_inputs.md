# revD mechanical inputs for the parametric CAD (research only, 2026-11-23)

Tags: SEEN = read on a drawing/datasheet/page this session (or in the existing revC/revD notes, where the source is named); EST = estimate or my arithmetic. Nothing here is a design.
Reuse: the GCT numbers below were re-read via https://static.chipdip.ru/lib/649/DOC044649109.pdf (USB4715 drawing, text extraction of the callouts) and https://static.chipdip.ru/lib/717/DOC044717621.pdf (gasket drawing). Callout lists are SEEN; which callout belongs to which feature is EST unless stated.

## A1. GCT USB4715-GF-A and gasket USBTJ-04
- Drawing callouts (SEEN, chipdip DOC044649109): flange width 10.54, body width 9.94 (9.99 shell), depth 8.20 overall (7.30 + 1.90 nose), front-face height 4.76, rear height 4.46, 0.55 PCB-dip, nose opening 8.34 (+0.06/-0.02) x 2.56 +/-0.04, 6.69 (+0.045/-0.055), overhang past board front edge 2.10, board thickness 0.80 +/-0.10 (layout tolerance +/-0.05). General drawing tolerance X.X +/-0.30, X.XX +/-0.25, X.XXX +/-0.10.
- Height above PCB top 4.21 (4.76 - 0.55) (EST arithmetic from SEEN callouts; matches Mouser "4.21 mm profile above PCB", per revC mechanical_rf.md).
- Gasket USBTJ-04 (SEEN, DOC044717621 + connector drawing): silicone 60A black, outline 10.64 x 4.86 (R1.60), inner opening 8.94 x 3.16 (R1.28), thickness 1.50 (callout "1.50" on both drawings; the gasket-drawing fetch could not say which callout was thickness, the connector drawing's gasket view lists 1.50 - treat as 1.50 EST-high-confidence), tolerance X.XX +/-0.25 (!). Gasket drawing lists it for USB4715 and USB4730.
- Compression (SEEN, connector drawing note): "0.45 mm min gasket compression between panel and shell; suggest 30-40 % of gasket thickness". 30-40 % of 1.50 = 0.45-0.60 mm, so the window is 0.45 min to 0.60 suggested; nothing is stated for a maximum. Compressed thickness therefore 0.90-1.05 mm.
- Panel cut-out (SEEN callouts): 11.00 +/-0.03 x 5.90 +/-0.03 R1.60 (gasket step), 9.14 (+0/-0.04) x 3.36 (+0/-0.04) R1.43 +/-0.03 (through opening), step depth 0.90 +/-0.03, panel thickness 1.80, C0.2 chamfer, 5.50 +/-0.03. Mapping of 5.50 is EST.
- Assembly order (SEEN): PCBA, then gasket (after reflow), then panel.
- Forces (SEEN): mating 5-20 N, unmating 6-20 N, 10,000 cycles (DigiKey says 20,000; use drawing). No retention force specified for the solder joints (SEEN: drawing gives none).
- Face or radial: see section B.
- Derived stack (EST, arithmetic on SEEN callouts): gasket 1.50 free; pocket depth 0.90; through-wall 0.90 (wall 1.80 = 0.90 pocket + 0.90 web); nose protrudes 1.90 beyond flange, so with flange face flush with the wall inner face the nose is 0.10 proud of the outer face (1.90 - 1.80). Gasket outer 10.64 x 4.86 sits in the 11.00 x 5.90 pocket (clearance 0.18 per side across, 0.52 per side in height); gasket inner opening 8.94 x 3.16 vs through-opening 9.14 x 3.36 (0.10 per side) vs nose 8.34 x 2.56 (0.30 per side).
- Compression window in terms of a gap g between flange face and wall inner face: compressed = 0.90 + g; GCT min compression 0.45 -> compressed <= 1.05 (g <= 0.15); GCT suggested 30-40 % -> 0.90-1.05. So g = 0 to 0.15 mm: window 0.15 mm wide (+/-0.075). GCT states no hard maximum (EST: silicone 60A tolerates more but force on the solder joints and nose rise).
- WARNING (EST interpretation): the gasket drawing's general tolerance X.XX +/-0.25 (and USBTJ-06: X.XX +/-0.25 with a 0.90 callout) is bigger than the 0.15 mm window. No specific tolerance is printed on the 1.50 callout, so either the gasket is much tighter than the drawing block says or GCT's window is soft. Measure gaskets and shim; do not assume 1.50.
- Not found: any GCT text calling the seal "face" or "radial"; GCT retention force for the shell stakes; mated-condition IP test; recommended panel for other thicknesses. Evidence for a FACE (axial) seal: the drawings' own geometry (gasket thickness 1.50 along the insertion axis, pocket depth 0.90, the 0.45 mm min compression "between panel and shell") and Mouser's wording that the gasket "requires fitment post-reflow solder processing to enable sealing to the chassis" (https://www.mouser.co.uk/new/gct/gct-usb4725-type-c-connectors, SEEN). Related USBTJ-06 gasket (USB4736) drawing: thickness 0.90, 10.64 x 4.86, inner 8.75 x 2.80 (https://www.mouser.com/datasheet/3/1507/1/usbtj-06.pdf, SEEN).
- GCT's newer USB4745 is IP68 with an integrated LIM gasket that "does not require rear pressure for gasket compression" (https://www.mouser.cl/new/gct/gct-usb4745-type-c-receptacle, SEEN); dimensions, board thickness, panel not on the page (NOT FOUND). Worth a look as an alternative because it removes the axial compression requirement; it is a 4-stake top-mount, board thickness unknown.

## A2. Sharp LS013B7DH03 (datasheet https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf, text extract only)
- SEEN: outline 26.6 x 30.3 x 0.741 mm, mass 1.2 g, active area 23.04 x 23.04, dot pitch 0.18, 128 x 128, 10 FPC input terminals, surface hardness >= 3H.
- SEEN: FPC bend area 0.8 to 6.0 mm from the glass edge, minimum bend radius inner R0.45, do not bend toward the polarizer side, 3 bends max (180 to 0 deg), FPC must not touch the glass edge, no stress at the FPC/panel joint. Recommended connectors: SMK CFP-4610-0150F (bottom contact), Molex 51441-1093 (bottom contact), CFP-4510-0150F (top contact). 0150F suggests 0.5 mm pitch (EST; Hirose FH12-10S-0.5SH is also 0.5 pitch).
- NOT FOUND (they are only in drawing Figure 8-1, which a text extract cannot read): active-area offsets from the edge, glass thickness (0.741 is the module), FPC tail width, tail length to the contact end, tail position along the edge, which face carries the contacts, contact pitch printed on the drawing, tolerances. Need the PDF page 8 opened as an image (the shell has no web access; do it in a browser).

## A3. Raytac MDBT50Q-1MV2 (spec Ver.K https://cdn.sparkfun.com/assets/4/7/4/3/8/_nRF52840__MDBT50Q-1MV2___MDBT50Q-P1MV2_Ver.K_spec.pdf, SEEN)
- Outline 15.5 (tol -0.15) x 10.5 (tol +0.2) x 2.05 mm height (no tolerance printed). Existing layout (U1 15.5 x 10.5, height 2.05) is consistent.
- Keep-out: the spec says keep the "No Ground Pad" area as wide as possible, on EACH layer, and place the module at the PCB edge. It prints NO mm clearance to metal, ground or plastic (the keep-out is in image-only figures; Raytac's design guide on its support page was robots-blocked). The existing mm numbers (keep-out 4 mm strip) come from the revB rf.md / Infineon AN91445 (a different antenna): EST.

## A4. Battery (150 mAh, about 20 x 26 x 3.8)
- Adafruit 1317 (https://www.adafruit.com/products/1317, SEEN): 26.02 x 19.75 x 3.8 mm, 4.65 g, JST-PH 2-pin attached, 127.5 mm lead, protection circuit included. No drawing, no tolerance, no lead-exit position, no PCM tab size (page said none). NOTE: the board is for 20 x 26: 26.02 x 19.75 is about what the layout assumes.
- Alternatives SEEN (all lack a usable drawing in text):
  - Jauch LP402025JU (Farnell https://uk.farnell.com/jauch/lp402025ju/battery-rechargeable-150mah-3/dp/4200220): listed 4.5 x 20.5 x 27 mm (listing figure, no max/tolerance stated), 5 g, 150 mAh typ / 140 min (datasheet https://www.farnell.com/datasheets/3959719.pdf has no drawing in text). NB the listing's 4.5 thick / 27 long are bigger than the nominal 4.0 x 25: they are probably max values.
  - LP-402025 (chipdip https://static.chipdip.ru/lib/412/DOC005412981.pdf): max T 4.5, W 20.5, L 29 (maximums, no tolerance).
  - LIP402025-1 (https://cdn.enfsolar.com/z/pp/2025/3/4ij2s6hbg2e/lip402025-batterie-rechargeable-lithium-ion-polymere-avec-ci.pdf): nominal 25 x 20 x 4, no tolerance.
  - PKCELL LP402025 (https://www.batterypkcell.com/news/lp402025-battery-guide-everything-you-need-to-know): 4.0 x 20 x 25, no max, no tolerance.
  - TinyCircuits ASR00003 (https://www.mouser.com/datasheet/2/855/TinyCircuits_ASR00003-1108413.pdf): 20 x 20 x 5.0, 150 mAh (page title says 140), 3.77 g, 12 mm leads.
  - Take-away (EST): a nominal "402025" cell is 4.0 x 20 x 25 nominal but 4.5 x 20.5 x 27-29 at the maximum, i.e. up to +0.5 thick, +0.5 wide, +2 to +4 long. Use the max as the pocket size; the existing bay of 4.3 mm for a 3.8 mm Adafruit cell is fine, for a 402025 at max it is NOT (4.5 + foam).
- Swelling: Jauch says a fully charged cell "takes up to 15 % more space overall" (volume, not thickness) and swelling must be allowed for (https://www.jauch.com/blog/en/what-special-features-are-there-to-consider-when-designing-in-a-lithium-polymer-cell/, SEEN). No sourced percent-of-thickness figure was found; 10 % of thickness (about 0.4 mm on a 4 mm cell) is a common rule I could not source (EST, unverified).
- NOT FOUND: PCM tab dimensions and lead exit for any listed cell. Needs a vendor drawing.

## A5. Vybronics VCLP0820B004L (https://www.vybronics.com/coin-vibration-motors/with-brushes/v-clp0820b004l, SEEN)
- 8.0 dia x 2.1 thick (no tolerance), self-adhesive tape included (secures to PCB or housing inner wall), wire leads only (length and exit position not stated; connectors optional). Weight per piece not stated. The datasheet PDF drawing (lead length, exit, tolerances) was not read: NOT FOUND.
- Whether 2.1 includes the tape: not stated. revC assumes 2.1 + 0.1 tape (EST).

## A6. Side switch SW1
- MPN in the scripts: Alps Alpine SKRTLAE010 (footprint Button_Switch_SMD:SW_Push_1P1T-MP_NO_Horizontal_Alps_SKRTLAE010), in /home/claude/pitchiq-watch/watch/hardware/revA_2026-11-23/scripts/design.py line 110 and revB/scripts/design.py line 73. The ../scripts path given does not exist for revD; no revC/revD design.py was found, so I assumed SW1 is unchanged (check).
- SEEN (https://dtsheet.com/model/3344157): operating force 1.6 N, operating travel 0.2 mm, horizontal (side) actuation, SMT, life 100,000 cycles, series size 4.5 x 3.55 (L x W). Height and actuator protrusion NOT readable (garbled table). revC mechanical_rf.md uses body 3.3 high, stem 2.0 wide (from the board, CHECKED there); stem tip 0.01-0.06 inside the board edge; those are the layout's own numbers, not re-verified here.

## A7. Hirose FH12-10S-0.5SH(55)
- SEEN (digikey.cn page): 10 positions, 0.50 mm pitch, bottom-contact, SMT right-angle, polyamide housing, phosphor bronze gold contacts. Height, depth, actuator swing NOT FOUND (catalog PDF returned binary; DigiKey table truncated). Existing revC note uses about 1.0 closed (recollection) and Future Electronics listing 2.0 max: still unverified.

## B. USB-C sealing strategy
Evidence base: GCT drawings (above); Mouser ("sealing to the chassis"); GCT USB4745 page ("does not require rear pressure for gasket compression"); Same Sky article (O-rings UV-glued to the shell for reflow, https://www.electronicdesign.com/technologies/components/interconnects/product/55375422/electronic-design-same-skys-rugged-usb-c-connectors-meet-diverse-needs, SEEN, no mechanism details); Slashgear (https://www.slashgear.com/2236068/good-reason-why-smartwatches-dont-use-usb-c-charging-ports/, SEEN: major smartwatch brands use pogo/magnetic because a USB-C port is hard to keep watertight; no mm data); Apple Rubber static gland table (below). No teardown showing a gasketed USB-C on a watch was found; no GCT application note on tolerances was found.

USB4715 seal type: FACE (axial) seal in a counterbored pocket, compressed along the insertion axis between the connector flange front face and the pocket floor of the wall (EST from SEEN geometry; GCT does not print the words). It is not a radial seal: the gasket's 0.30 gap to the nose and 0.10 to the through-opening show nothing is squeezed radially.

Tolerance chain (EST, using sourced process numbers): window +/-0.075 mm. Contributors: wall/pocket depth MJF +/-0.25 (Stratasys; JLC3DP +/-0.2 to 0.3; Xometry engineer-reviewed +/-0.25 XY, +/-0.42 Z under 30 mm; Xometry prototype tier +/-0.70 under 30 mm), SLA JLC3DP +/-0.15 to 0.20 (resin changes with time), CNC Protolabs +/-0.13 default (+/-0.005 in; tighter by request, not found), connector datum +/-0.05 (drawing layout), board outline +/-0.1 (EST), gasket thickness +/-0.25 per its block (see A1). Worst case MJF about 0.25+0.05+0.1+0.25 = 0.65 mm; RSS about 0.38. CNC about 0.13+0.05+0.1+0.25 worst 0.53, RSS about 0.32 (dominated by the gasket's own tolerance). Neither gets inside +/-0.075 by tolerance alone. Therefore the compression must be SET by measurement or by a compliant/bonded element, not by drawing tolerance.

| Option | Seal quality for a hand-built proto | Thickness / parts / assembly cost | Verdict |
|---|---|---|---|
| (1) Soldered receptacle, gasket face-compressed against case wall, board fixed | Fails the window on MJF (chain 0.65 vs 0.15); marginal on CNC; stakes carry the compression and every plug pull load | 0 extra thickness, 0 parts, easiest | Not defensible alone |
| (2) Board/connector floats (slots + foam or spring preload) | Compression set by a spring, but plug insertion (5-20 N) pushes the connector away from the gasket and unmating (6-20 N) pushes into it, so the gasket relaxes during insertion unless a hard stop exists, and then the chain returns | +foam/spring, slots in board (layout change), medium | Does not seal mated; weak |
| (3) USB-C daughterboard screwed to the case, flex/wires to main | Compression set by a datum on the daughterboard only (short chain: pocket depth + one seat), plug loads go to case, not main-board solder | +0.8 board + FFC/wires + 2 screws + second connector pair; layout change to the main board; most assembly | Best mechanically, costs layout and thickness |
| (4) Panel-mount waterproof USB-C (own flange/O-ring/screws) | Good in the catalogue sense but no 6-pin charge-only panel-mount part was found in this session; parts are bigger (USB4725 sits 6.5 mm above PCB, Mouser) | big | Not found suitable |
| (5) Potting/adhesive around the shell | Insensitive to tolerance (gap fill); permanent; no rework; adhesive on LCP/stainless needs testing; does not need compression | +0 thickness, 1 adhesive, messy | Good as backup to (1) |
| (6) Magnetic pogo | Easiest seal (no hole), outside the requirement | n/a | reference only |

Recommendation (EST, my judgement, not a tested design): option (1) re-arranged so the compression is set at assembly and the case tolerance is bonded out:
- Make the port plate (wall section with the pocket and opening) a separate small part, CNC or SLA-then-reamed, 1.80 thick, bonded into an oversize window in the printed case with a gap-filling adhesive (about 0.3-0.5 per side window clearance). Assemble gasket + plate onto the soldered receptacle in a jig set to g = 0.075 (compressed 0.975, 35 % of 1.50), then bond. The printed-case +/-0.25 drops out of the chain. Leak test each unit (port empty and with plug); add a fillet of RTV/UV adhesive around the flange at the pocket edge as a second seal if it leaks (option 5 as backup).
- If a tolerance-chain-only design is wanted, use CNC for the whole case wall and select gaskets by measurement with 0.05 shims under the board stop.
- Strain: put the plate snug on the nose (through-opening 9.14 x 3.36, nose 8.34 x 2.56 per the drawing leaves 0.40 per side; a hard 0.1 per side fit means opening 8.54 x 2.76 which is smaller than GCT's recommended opening and would also pinch the gasket; the revC note is wrong to ask for that unless the opening is a separate insert). Keep GCT's opening and take plug load with the plate bonded to the case and the case bearing on the overhang.

CAD numbers for this scheme: pocket 11.00 (+0.2/-0) x 5.90 (+0.2/-0) R1.60 prototype (GCT recommends +/-0.03: only CNC); pocket depth 0.90 +/-0.05; through-opening 9.14 +0/-0.04 x 3.36 +0/-0.04 R1.43 (prototype +0.15/-0); plate thickness 1.80; flange-face gap g 0.075 +/-0.05 target (compressed 0.975); datum: connector flange front face (A) to plate pocket floor; second datum: nose centre to opening centre (+/-0.1). Overhang 2.10 past board front edge (drawing) and nose 0.10 proud of the outer face when g=0.

## C. Button sealing (no sourced watch-button drawings found)
- SEEN force/travel: SKRTLAE010 1.6 N, 0.2 mm (A6). Budget (EST): boot or O-ring friction must add no more than about 1 N, so total below about 3 N; 0.2 mm travel means the plunger must be pre-loaded zero-gap and any seal compression stack of +/-0.1 matters. revC already flags the 0.35 mm tolerance chain vs 0.2 mm travel.
- O-ring plunger gland (Apple Rubber static table https://www.applerubber.com/src/pdf/table-a-static.pdf, SEEN; the column headings were garbled, mapping A depth, B width, C clearance is the tool's reading): cross-section 0.020 in (0.51 mm): depth 0.33-0.36, groove 0.89, squeeze 22-41 %; 0.040 in (1.02 mm): depth 0.69-0.76, groove 1.52, squeeze 19-37 %; 0.050 in (1.27 mm): depth 0.89-0.99, groove 1.91, squeeze 17-34 %. These are STATIC; a sliding plunger is dynamic and needs lower squeeze (EST 10-20 %, not sourced, not in the fetched page). 1.8 mm wall cannot hold a 1.52 groove (revC finding 5); a 0.51 mm cross-section groove (0.89 wide) is the only one that fits a 1.8 wall with 0.45 per side: EST.
- Silicone boot / overmould membrane: Digi-Key forum says boots for tactile switches are custom, suppliers named APM Hexseal, NKK, E-Switch, APEM (https://forum.digikey.com/t/external-waterproofing-boot-button-for-tactile-switch/5936, SEEN); no dimensions found. Parker face-type page: racetrack inner corner radii at least 3x (ideally 6x) cross-section (https://parker.com/promotionsite/oring-ehandbook/us/en/ehome/Face-Type-Seals, SEEN).
- Plunger diameter: stem is 2.0 wide (revC, board data); EST plunger Ø2.0-2.4 with a Ø0.51 O-ring; no sourced typical.

## D. Case-back seal and fasteners
- Flat gasket vs O-ring vs adhesive: no sourced minimum land width, compression or screw spacing found for a 35 x 42 mm cover. Only sourced numbers: Apple Rubber static gland table (section C) and micro O-ring page: standard cross-sections down to 0.20/0.25 mm with warning on tolerance stack-up (existing enclosure.md; https://www.applerubber.com/src/pdf/microrings.pdf). EST: O-ring groove land 0.89 + 2 x 0.5 min wall = 1.9 mm per side, flat gasket land >= 1.5 mm, screw pitch <= 12-15 mm: unsourced.
- Screws in plastic (existing enclosure.md, ABS extrapolation noted there): M1.4 pilot 1.12, boss OD 2.8, depth 2.8; M1.6 pilot 1.28, OD 3.2, depth 3.2 (ABS/PC); PC: M1.4 1.19/3.5; M1.6 1.36/4.0. EST/extrapolated.
- Heat-set inserts: McMaster M1.6 x 0.35 brass heat-set, standard 3.0 installed length, recommended hole 2.2 mm (92120A150, https://www.mcmaster.com/products/threaded-inserts/thread-size~m1-6/, SEEN; outer diameter not printed); CNC Kitchen has an "M1.6 x 2.5" brass insert (OD and hole not stated, https://www.3djake.com/cnc-kitchen/threaded-insert-m1-standard?sai=40671, SEEN); no M1.4 heat-set insert found. JLC3DP installs M3-M5 only (existing note). Boss OD 2-3x insert diameter per SPIROL/Stratasys (existing note) = 4.4-6.6 for the 2.2 hole: does not fit a 1.8 mm wall; so with M1.6 inserts the bosses must be local bulges. 

## E. Strap and lugs
- Archer QR silicone, 20 mm (https://www.archerwatchstraps.com/en-us/products/quick-release-silicone-black, SEEN): lug width 16-24 in 16,18,19..24; thickness 3 mm (single figure, no lug/tail split); length short 75 / long 120 mm; stainless tang buckle; QR lever bars built in; $19.99. Spring-bar dims are NOT on the product page. Archer's separate Quick Release Spring Bars page (https://www.archerwatchstraps.com/en-us/collections/accessories, SEEN): 1.8 mm OD, pins about 0.9 mm, 316L, $9.99 per 4; the help page agrees (https://help.archerwatchstraps.com/article/267-spring-bar-dimensions: body 1.8, pins about 0.9; tip length and bar length convention not stated). Whether the strap's integrated bars are the same bar is not stated (EST yes). No strap end width at the lug end other than "equals lug width"; no quick-release pin position.
- Contradiction with existing notes: strap.md says Archer bar diameter NOT FOUND and the lug model uses bar 1.5; Archer's bar body is 1.8 (tips 0.9). The lug hole 1.1 (for a 1.0 tip) is fine for 0.9 tips (hole 1.0 per ISO D1 = d1 + 0.10 as in strap.md) but the strap's bar pocket and any case recess that clears the 1.8 body must be sized for 1.8, not 1.5.
- Alt 1: Watch Straps Australia, black 20 mm quick-release silicone (TPSiV, DuPont) AUD 55.00 (https://watchstraps.com.au/products/silicone/quick-release-black-20mm, SEEN): thickness short part 4 to 3 mm, long part 4 to 2 mm (4 mm at the lug end); buckle-end width 18; lengths short 7.4 cm, long 12.1 cm (9.5 to last hole); spring bar 1.5 mm, tip 1.0 mm, tip length 1.5 mm. The only strap with full bar data; but 4 mm at the lug end versus the 3 mm swing assumption.
- Alt 2: Barton Black Elite Silicone 20 mm (https://www.bartonwatchbands.com/products/black-elite-silicone, SEEN): 70A, 2 mm taper to the 18 mm 316L buckle, standard 5-8 in and long 7-9 in wrists, QR bars integrated; thickness and bar diameter NOT published; price not on the page ($21.74 in the earlier strap.md fetch).
- Others checked, no dimensions published: Timex 20 mm QR silicone $30 (https://timex.com/20mm-quick-release-silicone-strap/TW7C65800YX.html), Trendhim black 20 mm QR GBP 17.99 (https://www.trendhim.co.uk/black-20-mm-silicone-quick-release-watch-straps-p.html). Ritche and StrapsCo pages not fetched (search only).
- Standard bar data (from strap.md, sourced there): 1.8 standard, 1.5 thin, tip about 0.9-1.0, tip length 1.5 (AU), ISO hole = d1 + 0.10 H11. Bar centre to case, lug thickness, clearance for a 3 mm strap: NOT FOUND, EST only (3.2 mm from case face; lug end 2.4 min).
- Lug-to-lug: only anecdote found (Gear Patrol, wrist about 160 mm round / 50 mm wide: avoids lug-to-lug above 50 mm, prefers 48 or less; https://www.gearpatrol.com/watches/watches-lug-to-lug/, SEEN). No population data. POSSIBLE CONTRADICTION: if the 41.8 mm case length excludes the lugs, revC's 5.2 mm lug on each end gives lug-to-lug about 41.8 + 2 x 5.2 = 52.2 mm (EST arithmetic), above that 50 mm anecdote; if 41.8 includes the lugs it is fine. Confirm which.

## F. Lens (30 x 34 x 1.0 window)
- 3M VHB display bonding brochure (https://multimedia.3m.com/mws/media/1674064O/3m-vhb-tape-display-bonding-brochure.pdf, SEEN): the only width figure is 0.5 mm: for bond lines below 0.5 mm wide it recommends 3M Plastic Bonding Adhesive 2665B / 2710P black or liquid PUR/epoxy, precision dispensed. Tape thickness ranges: 950XX 50-100 um, 934XX 200-300, 4914 150-3000, 5980 150-300, 5981 200-400 um (950XX/934XX/864XX/5980/5981 are Asia-only). No minimum tape frame width given: NOT FOUND (EST: 1.0 mm min frame is typical in phone-class lens tape; unsourced).
- Existing enclosure.md covers materials (hard-coated PC, Gorilla SR+, sapphire MOQ 100), custom-cut services (Pololu laser $25 min, Ponoko from $50) and lists UV/liquid adhesive as NOT FOUND. Supplier for one-off cut windows with price: NOT FOUND.

## G. Prototype processes (existing sourced numbers in enclosure.md, not re-fetched)
- MJF PA12: JLC3DP +/-0.2 (holes +/-0.3), min wall 0.8 mm at 10x10, 1.2 mm at 10x10 for some resins (table in enclosure.md), hole >= 1.0; Stratasys +/-0.25, wall 0.5, feature 0.5; Hubs +/-0.3 % (floor 0.3); Xometry prototype +/-0.70 under 30 mm, engineer-reviewed +/-0.25 XY, +/-0.42 Z. SLA JLC3DP +/-0.2 (0.15 mm at 1-3 days). CNC Protolabs +/-0.005 in (0.13 mm), features thicker than 0.51 mm, nominal thickness at least 1.02 mm. Cost: JLC3DP "from" SLA $0.30, MJF $1.00, CNC $5.00 floors only; PCBWay min order $25; a quote for a 35 x 42 x 11 two-part case: NOT FOUND (instant quotes need uploaded CAD). Order of magnitude (EST): printed set $5-30, CNC aluminium/PC set $60-200.

## CAD parameter table
| Name | Value (mm) | Tolerance | Tag | Source |
|---|---|---|---|---|
| usb_flange_w | 10.54 | X.XX +/-0.25 block | SEEN | GCT DOC044649109 (chipdip) |
| usb_body_w | 9.94 (shell 9.99) | +/-0.25 | SEEN | same |
| usb_depth_total | 8.20 (7.30 + 1.90 nose) | +/-0.25 | SEEN | same |
| usb_nose_open | 8.34 x 2.56 | +0.06/-0.02 ; +/-0.04 | SEEN | same |
| usb_height_above_pcb | 4.21 | +/-0.25 | SEEN+EST (4.76 - 0.55) | same, Mouser |
| usb_overhang | 2.10 | +/-0.25 | SEEN | same |
| usb_pcb_t | 0.80 | +/-0.10 (layout +/-0.05) | SEEN | same |
| gasket_free_t | 1.50 | X.XX +/-0.25 | SEEN | DOC044717621 |
| gasket_outer | 10.64 x 4.86 R1.60 | +/-0.25 | SEEN | same |
| gasket_inner | 8.94 x 3.16 R1.28 | +/-0.25 | SEEN | same |
| gasket_min_compression | 0.45 (30-40 % suggested = 0.45-0.60) | n/a | SEEN | DOC044649109 |
| compressed_gasket_t target | 0.975 | +/-0.05 | EST | derived |
| panel_t | 1.80 | n/a | SEEN | DOC044649109 |
| pocket | 11.00 x 5.90 R1.60, depth 0.90 | +/-0.03 (CNC only) | SEEN | same |
| opening | 9.14 x 3.36 R1.43 | +0/-0.04 | SEEN | same |
| usb_mate_force | 5-20 N, unmate 6-20 N, 10,000 cycles | n/a | SEEN | same |
| lcd_outline | 26.6 x 30.3 x 0.741 | n/a | SEEN | Sharp DS |
| lcd_active | 23.04 x 23.04 | n/a | SEEN | same |
| lcd_fpc_bend_zone | 0.8-6.0 from glass edge, inner R >= 0.45 | n/a | SEEN | same |
| lcd_fpc_tail (w, l, contact face, pitch) | NOT FOUND | | | drawing Fig 8-1 |
| mdbt_outline | 15.5 x 10.5 x 2.05 | -0.15 / +0.2 / none | SEEN | Raytac spec Ver.K |
| battery_adafruit | 26.02 x 19.75 x 3.8 | none given | SEEN | adafruit.com/products/1317 |
| battery_402025_max | 4.5 x 20.5 x 27 to 29 | max | SEEN | Farnell/chipdip |
| battery_swell | up to 15 % volume; thickness % NOT FOUND | | SEEN/EST | Jauch |
| motor | 8.0 dia x 2.1 | none | SEEN | Vybronics |
| sw1_force_travel | 1.6 N, 0.2 mm | n/a | SEEN | dtsheet SKRTLAE010 |
| fh12_pitch | 0.50, 10 pos, bottom contact | n/a | SEEN | digikey.cn |
| fh12_height_depth | NOT FOUND | | | |
| archer_strap_t | 3 | single figure | SEEN | archerwatchstraps.com |
| archer_spring_bar | 1.8 body, tips about 0.9 | n/a | SEEN | Archer accessories/help |
| au_strap_bar | 1.5 body, 1.0 tip, 1.5 tip length; strap 4 mm at lug | n/a | SEEN | watchstraps.com.au |
| oring_0.51_gland | depth 0.33-0.36, width 0.89, squeeze 22-41 % | | SEEN | Apple Rubber table A |
| oring_1.02_gland | depth 0.69-0.76, width 1.52, squeeze 19-37 % | | SEEN | same |
| m1.6_heat_set | installed length 3.0, hole 2.2 | | SEEN | McMaster 92120A150 |
| m1.4 heat_set | NOT FOUND | | | |
| mjf_tol | +/-0.25 (Stratasys), +/-0.2 to 0.3 (JLC3DP) | | SEEN | enclosure.md |
| cnc_tol | +/-0.13 default | | SEEN | Protolabs (enclosure.md) |
