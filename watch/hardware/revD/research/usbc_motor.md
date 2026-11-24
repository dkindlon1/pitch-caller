# revC research: waterproof USB-C (charge only) and 8 mm vibration motor

Date: 2026-11-23. Research only, no design. Rules used: every number is from a page or PDF fetched in this session. Tags: NOT FOUND (could not fetch it), ESTIMATE (my reading or engineering judgement, not a sourced number), NOT VERIFIED.
Prices/stock are a snapshot of what the page showed on 2026-11-23; DigiKey pages were truncated before the price table for most connectors, so connector prices come from Octopart's distributor table or the LCSC "From" figure.

---------------------------------------------------------------------------
## PART 1: WATERPROOF USB TYPE-C RECEPTACLE (CHARGE ONLY)
---------------------------------------------------------------------------

### 1.1 Verdict

PRIMARY: GCT USB4715-GF-A (mid-mount, 6 pin, power only, IP67). Only part found whose recommended PCB thickness is 0.80 +/-0.10 mm, equal to the revC board (GCT drawing, https://static.chipdip.ru/lib/649/DOC044649109.pdf, read as an image: "Recommended PCB Layout, Thickness 0.80+/-0.10 mm, Tolerance +/-0.05 mm").
ALTERNATE: GCT USB4736-GF-A (top-mount, 6 pin, power only, IP67), same maker, same gasket scheme, better stocked at Mouser/DigiKey/Newark, no board cut-out needed. Caveat: its drawing recommends 1.20 +/-0.10 mm PCB (https://www.mouser.be/datasheet/2/837/USB4736-3675709.pdf), so 0.8 mm is outside the stated range (NOT VERIFIED that it works at 0.8).

Neither part has a KiCad 7 stock footprint. Land patterns are given below.

### 1.2 Candidate table

| # | Part (maker) | LCSC | Pins | Mount | IP | Rated current | Price 1/10/100 (as seen) | Stock (as seen) | Datasheet |
|---|---|---|---|---|---|---|---|---|---|
| A | USB4715-GF-A (GCT) | C6906846 (JLCPCB/LCSC page: https://jlcpcb.com/partdetail/7870880-USB4715_GFA/C6906846 ; LCSC page https://www.lcsc.com/product-detail/C6906846.html shows Out of Stock, "From $1.0801") | 6 contacts (A5 CC1, A9 VBUS, A12 GND, B5 CC2, B9 VBUS, B12 GND) + shell; DigiKey lists "24 (6+18 dummy)" | Mid-mount, sunk into board cut-out, right angle, SMT contacts + 4 through-hole shell stakes (slotted plated holes) | IP67 | 3.00 A total on VBUS, 4.25 A GND, 1.25 A on each CC; 20 V DC | Mouser USD 1.610 / 1.370 / 1.170; Newark 1.91 / 1.91 / 1.57; TME 1.50 / 1.27 / 1.09 (all via https://octopart.com/part/gct/USB4715-GF-A). DigiKey EUR 1.43 single (https://www.digikey.de/en/product-highlight/g/gct/usb-type-c-connectors-for-ip67-charging) | Mouser 2,382; Newark 622; TME 700; LCSC 0 | https://static.chipdip.ru/lib/649/DOC044649109.pdf (mirror of GCT drawing; gct.co blocks fetching via robots.txt); Mouser IPX7/IP6X test reports https://www.mouser.ca/pdfDocs/USB4715-IPX7TestReport.pdf , https://www.mouser.ca/pdfDocs/USB4715-IP6XTestReport.pdf (links only, reports not read) |
| A2 | USB4715-GF-A-KIT (connector + gasket USBTJ-04) | C5984345 (https://lcsc.com/product-detail/USB-Connectors_Global-Connector-Technology-USB4715-GF-A-KIT_C5984345.html, Out of Stock, "From $1.0774") | same | same | IP67 | same | Octopart/Heilind EUR 1.61 (DigiKey highlight page above) | LCSC 0 | same |
| B | USB4736-GF-A (GCT) | NOT FOUND (search returned none) | 6 contacts, same pin map | Top-mount, right angle, SMT contacts + through-hole shell stakes, sits on top of board edge | IP67, "100% tested" | 3.00 A VBUS, 4.25 A GND, 1.25 A CC; 48 V DC | DigiKey USD 1.710 / 1.449 / 1.231; Newark 1.820 / 1.630 / 1.310 (https://octopart.com/part/gct/USB4736-GF-A); DigiKey EUR 1.52 (highlight page) | DigiKey 517; Newark 629 | https://www.mouser.be/datasheet/2/837/USB4736-3675709.pdf ; https://www.mouser.co.uk/pdfDocs/dc85e427-0386-4c8c-b10d-d80bc1c005b1_USB4736-Product-Specification.pdf (link only) |
| C | LWP-C108D-007-J-19 (Linkplex) | NOT FOUND | 6 (DigiKey: 24 positions incl. 18 dummy) | Top-mount style, right angle, SMT contacts, through-hole shell legs; drawing shows PCB 1.00 mm in the chassis assembly | IPX7 (logo on drawing, "30 Min/1m") | 3 A, 20 VDC (DigiKey) | NOT FOUND (DigiKey page truncated before price table; https://www.digikey.com/en/products/detail/linkplex/LWP-C108D-007-J-19/22971428) | NOT FOUND (lead time 12 wk listed) | https://www.linkplextech.com/images/pdf_product/WPC108D-A_3.0.pdf (read as image). Drawing is dimensionally almost identical to GCT USB4736 (same 9.94 / 8.34 / 6.69 / 9.79 / 6.5 numbers). Gasket "O-RING-13" |
| D | 217177-0001 (Molex) | NOT FOUND | 6 circuits, 0.50 mm pitch | Mid-mount, SMT, right angle | IPx5 only (Molex part page; DigiKey "IPX5 - Waterproof") | 3 A, 30 V AC/DC (DigiKey); Molex page says 1.25 A per contact | NOT FOUND (https://www.digikey.ca/en/products/detail/molex/2171770001/13913761 truncated) | NOT FOUND | https://www.molex.com/en-us/products/part-detail/2171770001 ("PCB thickness 0.60 mm recommended"; no drawing fetched). Not suitable: IPx5 is spray only. Molex IPx8 mid-mount 202410 exists in family doc https://www.content.molex.com/dxdam/c9/c924179b-a897-4f79-a5ae-cfdc94fc73cb/987651-4081.pdf (6 A, PCB 0.60-0.80) but pin count/price/stock/LCSC NOT FOUND, and the family is 16/24-pin per https://www.mouser.in/new/molex/molex-waterproof-usb-c-connectors |
| E | EB-504-4006 (Elecbee, OEM maker not named) | n/a | 6 | SMT straight, with rubber ring | page says both IPX8 and IP68 | page says 1.5 A in table and "5A" in features (conflict) | USD 1.58 qty 1 only | "In stock" | none (https://www.elecbee.com/en-13681-waterproof-type-c-connector-female-socket-6p-smt-with-waterproof-ring). No dimensions, no drawing: not usable for layout |
| F | JAE DX07 waterproof | NOT FOUND | 16/24 | SMT right-angle, IPX8 after reflow, no potting (https://heilind.com/npi/stocking-package/1007 ) | IPX8 | 5 A | NOT FOUND | NOT FOUND | I could not find a verified waterproof DX07 order code. DX07S024WJ1R350 turned out to be a non-waterproof vertical part (Octopart: "vertical SMT, 12 mm height"). KiCad's DX07 files are the non-waterproof parts. Dropped. |

Not verified / dropped: Korean Hroparts TYPE-C-31-E-06 (LCSC C961732, 6P SMD, "Recessed", 6.7 mm long, 207 in stock, from $0.5548; LCSC page lists no IP rating, datasheet PDF would not load) and TYPE-C-31-M-17 (C283540): no waterproof claim found, so not waterproof as far as I could verify. SHOU HAN, G-Switch (only the non-waterproof footprints exist in KiCad), Kinghelm, Wurth, CUI/Same Sky, Amphenol: not found as orderable 6-pin waterproof parts in this session (Same Sky article exists: https://www.electronicdesign.com/technologies/components/interconnects/product/55375422/electronic-design-same-skys-rugged-usb-c-connectors-meet-diverse-needs, not read). TE IPX8 and Hirose CX90MWD2G-24P (IPX8, 24P mid-mount, "immersion in 1.5 m of water for 30 min", https://estore.heilind.com/npi/stocking-package/1479) exist but are 24-pin, no price/footprint data found.

### 1.3 Primary in detail: GCT USB4715-GF-A

Source for all of this section: GCT drawing https://static.chipdip.ru/lib/649/DOC044649109.pdf (drawing date 4 July 2022, rev A3 20/11/23) read from the rendered page images. Dimensions I read off the drawing graphics are marked ESTIMATE where the callout-to-feature mapping is my interpretation.

Body and height
- Description on drawing: "Type C Receptacle, Horizontal, Mid-Mount, SMT, IP67, For Power Charging Only, 6 Pin".
- Width over body flange 10.54; body 9.94; 11.60 across the shell stakes. Depth 8.20 overall (7.30 and 1.90 sections shown). Front-face height 4.76 (flange 2.56 +/-0.04 above the contact centerline callout). Board slot in the part for PCB 0.80.
- Height above PCB: Mouser says "4.21 mm profile above PCB" (https://www.mouser.ca/gct-usb4715-usb-connector). The drawing shows 4.76 overall. Mapping of 4.76 vs 4.21 to the board top is ESTIMATE; take 4.21 as the above-board figure and 4.76 as the total.
- Part sits 2.10 mm beyond the board front edge of the cut-out (drawing "2.10" below the notch).
- Materials: LCP insulator UL94V-0, stainless shell nickel, gasket silicone 60A.

IP rating and requirements
- IP67, "Ingress Protection Rating: IP67" on drawing; 100% tested (DigiKey highlight page https://www.digikey.de/en/product-highlight/g/gct/usb-type-c-connectors-for-ip67-charging). Mated vs unmated condition: NOT STATED on drawing. Test depth/time: NOT STATED (test reports exist, linked above, not read).
- Needs the silicone gasket USBTJ-04 (sold separately or as -KIT), fitted after reflow, compressed between the enclosure panel and the connector shell: "0.45 mm min gasket compression between panel and shell (suggest compression 30-40% of gasket thickness)". Gasket outline: outer 10.64 x 4.86 (R1.60), inner 8.94 x 3.16 (R1.28), 1.50 thick.
- No potting is mentioned on the drawing. The seal is the gasket to the enclosure panel, so the ENCLOSURE must provide the sealing face; an O-ring on the shell alone is not the scheme.
- Recommended panel cut-out (Recommended Panel Spec, callouts): 11.00 +/-0.03 and 5.90 +/-0.03 (outer step, R1.60 +/-0.03), 9.14 +0.00/-0.04 and 5.50 +/-0.03 (through opening, R1.43 +/-0.03), 3.36 +0/-0.04, panel/step depth 0.90 +/-0.03, panel section 1.80, C0.2 chamfer. Which callout is which feature is ESTIMATE.
- Mating cycles: drawing says 10,000 (DigiKey page says 20,000 for this part: conflict, use drawing). Mating force 5-20 N. Operating -30 to +85 C. Voltage 20 V DC.

Land pattern (recommended PCB layout, top view). Coordinates read from the drawing at 400 dpi, ESTIMATE for anything not a printed callout. Printed callouts are marked (p).
Reference: X = 0 at connector centerline. Y = 0 at the BACK edge of the board notch (the notch edge nearest the contact pads); +Y goes into the board (away from the notch); the notch opens toward -Y to the board front edge. Units mm.
- Board notch (cut-out): width 10.30 (p), depth 6.30 (= 5.30 (p) + 1.00 (p)) from Y=0 to the board front edge at Y = -6.30. The part overhangs 2.10 (p) beyond the front edge, so it ends at about Y = -8.40. Back corners have round relief cut-outs (callouts "4x 0.90, 4x 0.50": relief size, interpretation ESTIMATE).
- Six SMD contact pads, all on the board surface behind the notch back edge, pad height 1.05 (p), spanning Y = 0 to +1.05 (pad center Y = +0.525, ESTIMATE from drawing):

| Pad | Signal | X center | Width x height |
|---|---|---|---|
| B12 | GND | -2.75 | 0.80 x 1.05 |
| B9 | VBUS | -1.52 | 0.76 x 1.05 |
| A5 | CC1 | -0.50 | 0.70 x 1.05 |
| B5 | CC2 | +0.50 | 0.70 x 1.05 |
| A9 | VBUS | +1.52 | 0.76 x 1.05 |
| A12 | GND | +2.75 | 0.80 x 1.05 |

Pitch callouts that support this: B12-to-A12 5.50 (p), B9-to-A9 3.04 (p), A5-to-B5 1.00 (p); widths 2x 0.80, 2x 0.76, 2x 0.70 (p). Note the pad order across the top row is B12, B9, A5, B5, A9, A12 (the drawing's own label order); this is NOT the usual USB-C left-to-right order, so do not mirror it from the GND/VBUS assumption.
- Four shell stake slots (plated through, solder area): centers X = +/-5.80 (11.60 (p) between them), Y = -2.30 and -5.30 (3.00 (p) apart, lower one 1.00 (p) from the board front edge; 5.30 (p) from back edge). Slot hole 0.50 wide x 1.10 long, pad 0.90 x 1.50: callouts "4x 0.90 / 4x 0.50" (widths) and "4x 1.50 / 4x 1.10" (lengths); which belongs to hole vs pad is ESTIMATE (graphic shows a plated oval with solder annulus). A routed (milled) slot is needed: 0.50 mm width is a drill-slot, tell the fab.
- Board edge reference: the notch edges above; the layout notes "Tolerance +/-0.05 mm".
- Mating-plug pin table on drawing: A5 CC1, A9 VBUS, A12 GND, B5 CC2, B9 VBUS, B12 GND, shell GND.
- KiCad: NONE in /usr/share/kicad/footprints/Connector_USB.pretty. Nearest are USB_C_Receptacle_GCT_USB4125-xx-x_6P_TopMnt_Horizontal.kicad_mod and USB_C_Receptacle_GCT_USB4135-GF-A_6P_TopMnt_Horizontal.kicad_mod (same pad X values -2.75/-1.52/-0.5/0.5/1.52/2.75, pad 1.2 high), but those are the NON-waterproof top-mount parts with different shell holes (+/-4.32 / +/-5.125) and no notch. Do not reuse them for USB4715. The pad X/width numbers above match them, which is a useful cross-check on the pad row, not on the shell/notch geometry. Footprint must be drawn from the datasheet: "none: must be drawn".

### 1.4 Alternate in detail: GCT USB4736-GF-A (top mount)
Source: https://www.mouser.be/datasheet/2/837/USB4736-3675709.pdf (text extract only, drawing not rendered, since the Mouser PDF download failed).
- Top-mount, horizontal, SMT contacts, through-hole shell stakes, IP67, 3 A VBUS, 48 V, 20,000 cycles. Gasket USBTJ-06 (silicone 60A), suggested compression 35-45%, min 0.315 mm; gasket fitted after reflow. Layout board thickness 1.20 +/-0.10, board edge shown as "PCB Edge" with pad order B12, B9, A5, B5, A9, A12.
- Pad/hole detail: callouts 4X 1.10 / 0.50, 4X 1.80 / 1.20, 2X Ø0.95 holes, overall 9.79 / 6.50 / 5.50 / 3.04 / 1.00 / 3.00 / 3.10 (pad x/y NOT FOUND in text). Linkplex LWP-C108D drawing (rendered image, https://www.linkplextech.com/images/pdf_product/WPC108D-A_3.0.pdf) shows the same family geometry: pads 2x 0.8, 2x 0.76, 2x 0.7 wide, pitch 5.5 / 3.04 / 1.0, 2x Ø0.95 holes, slots 1.1 (4X), 0.5 (4X), 3.1 (2X) and 3 (2X), PCB edge reference, overall 9.79 (2X) by 6 (2X), recommended tolerance +/-0.05. Full pad x/y for USB4736 itself: NOT FOUND. Treat this as "must be drawn from the datasheet" (get the GCT drawing PDF https://www.mouser.co.uk/pdfDocs/00cac539-3516-409e-9d80-ff8ac7dc7521_USB4736-Product-Drawing.pdf in a browser).
- Panel cut-out on Linkplex drawing: 10.94 +/-0.03 x 5.16 +/-0.03 (outer, R2.15) and 9.06 +/-0.03 x 3.28 +/-0.03 (R1.36), panel 2.20 section, 7.05; gasket interference 0.30 min, keep PCB 0.1-0.15 mm away from the gasket. For USB4736 the equivalent GCT cut-out numbers: 9.14 (+0/-0.04), 11.00 +/-0.03, 5.50, 5.90, 3.36, R1.43, R1.60 (callouts, same as USB4715).
- Height above PCB: NOT FOUND (not labeled in extracted text).
- KiCad: none. USB4125/USB4135 are the nearest but are different (non-waterproof) parts.

### 1.5 Sink-side circuit for charge-only USB-C

All Nordic statements below are from the nPM1300 product spec pages:
- "USB port detection" https://docs.nordicsemi.com/r/rB10PbOjrqd7xv9UvDPlFQ/ge87WkK4RabK6CwXQhDHSQ : CC1 and CC2 "must be connected directly to the USB connector for detection to happen"; each pin has an internal pull-down equal to Rd (the page does not print the value; you stated 5.1 kOhm, consistent with USB-C Rd); the source pulls up one CC line, the other stays at 0 V, so the part sees one orientation at a time; until detection, VBUS current is limited to a default 100 mA; host sets VBUSINILIM0 then writes TASK.UPDATE.ILIMSW; limit returns to 100 mA after reset or unplug/replug; if USB-C is not used CC can float or be grounded.
- Nordic DevZone answer (https://devzone.nordicsemi.com/f/nordic-q-a/123787/cc-lines-esd-protection): CC pins are not required; floating or grounded works; default limit 100 mA; MCU may raise it to 500 mA over I2C.
- Both CC pins wired to the two connector CC pads (A5 and B5) is the intended connection. Internal Rd is enough; NO external 5.1 kOhm should be added (that would put Rd in parallel with the internal one and shift the thresholds). Behavior with both CC connected: not specifically documented ("not addressed"); the part samples one at a time per plug orientation. Caveat: because the cable's other CC may be wired as VCONN/Ra in e-marked cables, only the line with the source pull-up is valid; the datasheet handles this. Caveat 2: charging at about 75 mA is under the 100 mA default, so the charge works even before firmware raises the limit; this is a consequence of the 100 mA default cited above.
- Overvoltage: nPM1300 VBUS OVP extends to 22 V (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/vbusin.html); the page gives no separate VBUS absolute maximum (NOT FOUND).
- VBUS TVS recommendation: Littelfuse SMF5.0A, LCSC C151296, SOD-123FL, Vrwm 5 V, Vbr 6.4 V, Vc 9.2 V, 200 W (10/1000 us), LCSC stock 56,440, "from $0.0546" (https://www.lcsc.com/product-detail/C151296.html); DigiKey lists 21.7 A Ipp (https://www.digikey.com/en/products/detail/littelfuse-inc/SMF5-0A/3429605). Placement: at the connector VBUS pads, before anything else, to GND. Other LCSC SMF5.0A makers exist (JSMSEMI C2857263, MDD C193402) but I used Littelfuse. Fits the 9.2 V clamp inside the 22 V OVP window. A 5 V TVS is meant for a plain 5 V charger; it will fail short if a 9 V/12 V adapter is plugged (ESTIMATE).
- CC ESD: the DevZone thread says CC protection is optional for non-medical use; a Nordic engineer answered that CC can be left unprotected (thread did not comment on ESD). For a sealed device with a gasketed port the user rarely touches the pins; if a CC clamp is wanted use a low-capacitance 5 V ESD diode (e.g. LCSC C85401 Nexperia PESD5V0U1UL, only its LCSC listing was seen, specs NOT read). Optional (ESTIMATE).
- Fuse/series protection at 100-500 mA: NOT FOUND in a fetched source. ESTIMATE of normal practice: a small resettable PTC or 0603/0402 fuse (about 500 mA hold or higher) in series with VBUS is common on cheap designs, but the nPM1300 already has a VBUS current limiter and 22 V OVP, so many designs use only the TVS. With a TVS that clamps at 9.2 V, a fuse is what protects the TVS from an over-voltage adapter. Decision for the user.

### 1.6 Wet or contaminated port

- TI application note SDAA491 (https://www.ti.com/lit/pdf/SDAA491): water bridging VBUS or CC can create a live short because a source pulls CC to 3-5 V even unattached; current through a liquid bridge between energized pins "causes corrosion within the connector"; controllers detect liquid by biasing SBU/CC/D pins between 0 V and 3.3 V and measuring leakage voltage (not resistance), prefer SBU, and on a wet reading "remove VBUS and release CC" until the readings recover; thresholds must be set from measured board values.
- Consequences for this charge-only 6-pin part: it has no SBU or D+/D- pins, so only CC1/CC2 can be monitored, and TI warns CC monitoring is only reliable when unattached. The nPM1300 documents no liquid detection (nothing found in the fetched pages), so the only handle is firmware: read USBCDETECTSTATUS and VBUS-present/CC state, and if VBUS is present with no valid CC attach (no Rd/Ra from source) treat it as a wet or non-compliant source and set the VBUSIN limit low or stop charging. This is ESTIMATE; behavior not documented by Nordic.
- Wearable practice: NOT FOUND in a fetched source (search surfaced only patents about wet-contact detection; not read). Sealed-gasket USB-C (IP67) as here is one answer; the common alternatives are magnetic pogo-pin chargers or contacts under the case. Because VBUS stays at 0 V until a source attaches, a dry/unplugged port has no energized pins, which limits corrosion risk; the risk is when a charger is plugged into a wet port (ESTIMATE).
- Rinse and dry before charging, gold-plated contacts help (GCT contacts: "gold flash", solder tails tin over nickel, drawing).

---------------------------------------------------------------------------
## PART 2: 8 MM COIN VIBRATION MOTOR
---------------------------------------------------------------------------

### 2.1 Recommendation
PRIMARY: Vybronics VCLP0820B004L (low current, 8.0 x 2.1 mm, 35 mA max).
ALTERNATE: Vybronics VC0820B006F (same size, stronger 0.30 G, 85 mA max).
Why: both are verified 2.1 mm thick, wire lead, self-adhesive backed, stocked in the US at DigiKey with quantity prices; VCLP is lowest current for a 75 mA-class charger/LiPo wearable; VC0820B006F is the stronger option if 0.25 G feels weak. Limitation: operating range for VCLP is 2.7-4.0 V (a full LiPo is 4.2 V; ESTIMATE that you PWM or drive from a regulated 3.3 V rail), VC0820B006F is 2.7-3.3 V so it must not sit directly on VSYS at full charge.

### 2.2 Candidate table (ERM unless stated)

| Part (maker) | D x T mm | Rated V / range | Rated current | Start current | Speed / G | Termination | Adhesive | Price 1/10/100 | Stock | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| VCLP0820B004L (Vybronics) | 8.0 x 2.1 | 3.0 V DC / 2.7-4.0 V | 35 mA max, 30 mA typical | NOT FOUND | 9,000 rpm min / 0.25 Grms | Wire leads (Molex or AVX ELCO connectors on request) | Self-adhesive tape included | DigiKey USD 3.15 / 2.789 / 2.4713 | DigiKey 1,766 | https://www.vybronics.com/coin-vibration-motors/with-brushes/v-clp0820b004l ; https://www.digikey.com/en/products/detail/vybronics-inc/VCLP0820B004L/10285889 |
| VC0820B006F (Vybronics) | 8.0 x 2.1 | 3.0 V DC / 2.7-3.3 V | 85 mA max, 61 mA typical | NOT FOUND | 10,000 rpm min / 0.30 Grms; rise 90 ms max, fall 50 ms max | Wire leads (connectors optional); custom FPC only at 10K pcs | Self-adhesive tape included (can be ordered without) | DigiKey USD 3.31 / 2.931 / 2.5977 | DigiKey 1,369 | https://www.vybronics.com/coin-vibration-motors/with-brushes/v-c0820b006f ; https://www.digikey.com/en/products/detail/vybronics-inc/VC0820B006F/6009906 |
| HD-EM0802-LW15-R (PUI Audio) | 8.00 dia; thickness NOT FOUND | 3 VDC / 2.6-3.6 V | 85 mA at 3 V | NOT FOUND | 12,000 +/-2,500 rpm; G not given; terminal resistance 32 Ohm +/-20% | Wire leads, length NOT FOUND | NOT FOUND | DigiKey USD 2.64 / 2.338 / 2.0721 | DigiKey 903 | https://puiaudio.com/file/specs-HD-EM0802-LW15-R.pdf ; https://www.digikey.com/en/products/detail/pui-audio-inc/HD-EM0802-LW15-R/16522087 |
| JYC0820 (Jie Yi) | 8.00 dia; thickness NOT FOUND | 3.0 V; starting voltage 2.3 V max | 100 mA max | NOT FOUND | 10,000 +/-3,000 rpm; torque 2.94 mNm; G NOT FOUND | Leads UL1571 AWG32, length NOT FOUND | "UV adhesive" listed (meaning not clear) | DigiKey CAD 2.98 / 2.539 / 2.1582 (Canadian site) | DigiKey 1,394 | https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/5564/JYC0820.pdf ; https://www.digikey.ca/en/products/detail/jie-yi-electronics-limited/JYC0820/20193266 |
| 308-100 (Precision Microdrives) | 8 x 3.4 | 3 V / max 3.6 V; start 1.62 V typ | 94 mA max | 124 mA max | 12,500 rpm / 1.13 G typ; 0.8 g | 45 mm AWG32 leads, no FPC | Not listed | USD 9.78 (single price shown, no tiers) | "Stocked design", no count | https://www.precisionmicrodrives.com/product/308-100-8mm-vibration-motor-3mm-type ; datasheet https://precisionmicrodrives.com/cdn/catalog_product/445ff874-bf32-474d-9e41-d7606db3b147/308-100-datasheet.pdf |
| C0820BE03L27 (INEED Motor) | NOT FOUND | 3 VDC | NOT FOUND | NOT FOUND | 10,000 rpm | NOT FOUND | NOT FOUND | NOT FOUND | NOT FOUND | https://www.digikey.com.au/en/products/detail/ineed-motor/C0820BE03L27/15796037 (page truncated) |

LRA (8 mm class; AC driver required):

| Part | D x T | Rated V | Current | Freq / G | Termination | Price 1/10/100 | Stock | Source |
|---|---|---|---|---|---|---|---|---|
| VG0825001U (Vybronics) | 8.0 x 2.55 | 1.2 Vrms (0.1-1.25 Vrms) | 80 mA max, 66 mA typ | 240 Hz / 0.70 Grms | Leads (custom lengths); self-adhesive tape | NOT FOUND (DigiKey page truncated) | NOT FOUND (DigiKey lead time 9 wk) | https://www.vybronics.com/coin-vibration-motors/lra/v-g0825001u ; https://www.digikey.com.br/en/products/detail/vybronics-inc/VG0825001U/22514380 |
| LRA0832BE03L15 (INEED Motor, marketplace) | 8.00 dia x 3.2 ("shaft and bearing" length) | NOT FOUND | NOT FOUND | NOT FOUND / 1.7 G | Wire leads | DigiKey.at EUR 2.77 / 2.468 / 2.1837 (excl VAT; EUR 26.63 flat shipping) | 4,763 | https://www.digikey.at/en/products/detail/ineed-motor/LRA0832BE03L15/15795982 |
| C08-005 (Precision Microdrives) | 8 dia x 3.2 | max 1.85 V; start 0.5 V | 102 mA max, 75 mA typ | 235 Hz / 1.28 G typ, 0.61 G min | 100 mm AWG32 leads | USD 7.72 (single) | "Stocked design" | https://precisionmicrodrives.com/products/32931431-4ed1-49ce-870b-5766169ee5c6/c08-005-8mm-coin-lra |
| HD-LA0803-LW10-R (PUI) | 8 x 8 x 3.2 | 2 Vrms | NOT FOUND | NOT FOUND / 1.5 G RMS | Lead wires | NOT FOUND | Mouser 1,172; Newark 371; DigiKey 305 | https://puiaudio.com/product/haptics/HD-LA0803-LW10-R |

Not found for ERM: spring-contact or FPC/SMD-pad 8 mm ERM. DigiKey highlight pages exist for Vybronics compression spring contact motors and Jinlong mid-mount spring contact coin motors (https://www.digikey.com.br/en/product-highlight/v/vybronics/compression-spring-contact-vibration-motor-series ; https://www.digikey.be/en/product-highlight/j/jinlong/c1020k001f-coin-vibration-motor) but the ones surfaced are 10 mm class, not read. The Vybronics 8 mm page says custom FPC only at 10K pcs. No LCSC or Adafruit/SparkFun 8 mm ERM found: LCSC C2894725 (KOTL C0830B100F1) returned "Part not found" on https://www.lcsc.com/product-detail/C2894725.html.

### 2.3 Drive circuit
- ERM (VCLP0820B004L, VC0820B006F, etc.): DC brushed motor. Low-side N-MOSFET (logic-level, gate driven from the MCU GPIO, gate series resistor and pull-down) with a flyback diode across the motor (Schottky, cathode to the supply side) is sufficient, which is what the board has now; PWM for intensity. The motor's inductance is large (PMD 308-100 lists 59.54 mH, 316 Ohm typical: https://www.precisionmicrodrives.com/product/308-100-8mm-vibration-motor-3mm-type), so the flyback diode matters. Supply must stay in range: 2.7-4.0 V for VCLP, 2.7-3.3 V for VC0820B006F (Vybronics pages above).
- LRA (VG0825001U etc.): needs an AC (resonant-frequency) driver, a plain low-side MOSFET with DC will not work. A haptic driver IC such as TI DRV2605L is the usual choice (NOT fetched, ESTIMATE from general knowledge); it also removes the need for your own flyback diode. The Vybronics LRA is specified in Vrms (1.2 Vrms) and 240 Hz, so the driver must be set to that.
- Start current: only PMD publishes it (124 mA max for 308-100); Vybronics pages do not list start current, so size the MOSFET and the supply for several times the rated current (ESTIMATE) and check LiPo sag during start.

---------------------------------------------------------------------------
## NOT VERIFIED / OPEN ITEMS
- Full USB4736 pad x/y and height above PCB (Mouser PDF download failed; text extract incomplete).
- USB4715 height above PCB: Mouser 4.21 mm vs drawing 4.76 mm total.
- LCSC numbers for USB4736 and Linkplex part.
- Prices for Linkplex, Molex 217177; stock at LCSC for USB4715 is 0.
- IP67 mated vs unmated, test depth and time (GCT test reports linked but not read).
- Which callouts map to which panel cut-out feature.
- Fuse practice, wearable wet-port practice, CC ESD part: no sourced fact.
- Motor start current for Vybronics, thickness of PUI/Jie Yi, price for VG0825001U.
- Browser-blocked or unreachable: gct.co (robots), docs.nordicsemi.com usbc page (robots), LCSC datasheet PDFs, Molex PDFs.
