# PCBWay vs JLCPCB for 5 prototype watch boards (revE)

Date read: 2026-11-23. Source: only what each company publishes on its own public pages (no logins, no quotes, no forms).
This is NOT a quotation. Every figure is tagged:
- SEEN = read on that page (URL given). Note: the page text was read through a summarising fetch tool, so exact wording is from its extract.
- ESTIMATE = my arithmetic or judgement, with the basis stated. Ranges are wide on purpose.
- NOT FOUND = I could not read it (price calculators need login/scripts; several help pages failed to load).

Board: 30.6 x 36.0 mm, 6 layers, 0.8 mm, TG150+, ENIG, filled+capped vias in the QFN pad, 10.3 x 6.3 mm edge notch with 0.5 mm radius corners, 4 plated slots, +/-0.1 mm outline at notch, 46 machine-placed parts (38 top / 8 bottom).

Abbreviations: VIP = via-in-pad (filled and capped via under a pad). PCBA = assembled board. Rails = scrap strips around a panel that the machines grip.

---

## 1. Side-by-side table

| # | Item | JLCPCB | PCBWay |
|---|------|--------|--------|
| 1 | 6-layer at 0.8 mm: offered / standard stackup / lead time | 0.8 mm is in the thickness list "0.8/1.0/1.2/1.6/2.0" for 6-layer, SEEN https://jlcpcb.com/6-layer-pcb and https://jlcpcb.com/capabilities/Capabilities. BUT conflicting: the same page's FAQ says thickness "ranges from 1.0 up to 2.0", and the impedance page lists 6-layer stackups only at 1.2/1.6/2.0 mm (0.8 appears only under 4-layer), SEEN https://jlcpcb.com/impedance. So a standard 6L 0.8 stackup is NOT confirmed. Lead time: "as fast as 48 hours" SEEN (6-layer page). | 0.8 mm is in the general thickness list (0.2-3.2), but for 6L the minimum-thickness table says ">=0.9 mm normal process, 0.70 mm next tier", so 0.8 is not clearly classified; page says confirm with a sales rep, SEEN https://www.pcbway.com/capabilities.html. 6L 0.8 stackup list: first 4 of 74 six-layer entries are 1.6 mm; the rest was cut off, so NOT FOUND https://www.pcbway.com/multi-layer-laminated-structure.html. Build time 6L: 7 days (<1 m2), 72 h urgent, SEEN https://www.pcbway.com/quickturn-pcb-fabrication.html |
| 2 | Filled + capped vias (VIP) | "Yes, free of charge" for 6-layer and above; resin-filled and plated over; SEEN https://jlcpcb.com/6-layer-pcb and https://jlcpcb.com/news/free-via-in-pad (Apr 2024). Capabilities page: epoxy or copper-paste filled & capped, vias 0.15-0.55 mm, "default for 6-layer and above", SEEN. IPC-4761 type not stated (NOT FOUND by name). | Offered: resin filled with electroplated cap; but "higher production costs" and "longer production time", no amount, SEEN https://www.pcbway.com/pcb_prototype/PCB_Via_in_Pad.html. No via size or thickness limit stated; type VII not named (NOT FOUND). Separate plugging spec: 0.20-0.40 mm holes filled to 70% only, 0.4-0.7 mm to 100% (this is plugging, not capping), SEEN capabilities page. |
| 3 | Small-board panelization | Customer-designed panel is the clear path: rails >=5 mm, 3-4 fiducials 1 mm dia with mask opening 2x, fiducials >=3.35 mm from board edge, SEEN https://jlcpcb.com/help/article/how-to-add-edge-rails-fiducials-for-pcb-assembly-order. Terms: "Tooling holes, Edge rails and Fiducials are required"; for boards under 70x70 or without rails "JLCPCB will select a suitable production method ... for instance, mouse bite", SEEN https://jlcpcb.com/help/article/Terms-and-Conditions-of-JLCPCB-Assembly-Service (5.5, 5.14). Delivery formats: mouse bites (both tiers), V-cut Standard only, SEEN https://jlcpcb.com/capabilities/pcb-assembly-capabilities. Fee for them panelizing: NOT FOUND. Rail removal after assembly = "additional post-processing fees", amount NOT FOUND. | PCBWay says boards smaller than 50x100 mm or non-rectangular "must be panelized in an array", rails on the two long edges; rails needed if copper is within 3.5 mm of the edge, SEEN https://www.pcbway.com/assembly-special-remind.html. "Panel design can be provided by you or we do the panel design" (leave a message at order), min assembly panel 50x50 mm, SEEN https://www.pcbway.com/pcb_prototype/Panel_Requirements_for_Assembly.html. Tab-route spacing 1.6 mm; stamp holes >=0.45 mm dia, 0.35 mm spacing, 5-6 holes per tab; solid tab >=2 mm; V-cut gaps 0 or 3 mm and V-cut must run straight across the panel (so V-cut is a poor fit for rounded corners/notch; tabs with stamp holes are the fit), SEEN. Rails >=3 mm, process edges 5-10 mm, fiducials 1.0 mm dia, >=5 mm from edge, 2 mm non-plated tooling holes, fiducials needed on both sides if both populated, SEEN https://www.pcbway.com/helpcenter/design_instruction/PCB_Panelization__Breakaway_Rails__Fiducial_Marks__Tooling_Holes.html. Panelization fee: NOT FOUND. Minimum single-board size: NOT FOUND (10x10 mm "smaller needs panelizing" on assembly page). |
| 4 | Double-sided assembly | Only on Standard PCBA; Standard single board min 70x70 mm (panel 70x70 to 250x250), rails + fiducials required, build time >=4 days, SEEN https://jlcpcb.com/capabilities/pcb-assembly-capabilities. Setup $51.12 and stencil $16.42 double-sided vs $25.56 / $8.21 single-sided, SEEN https://jlcpcb.com/blog/reduce-pcb-assembly-cost-prototype (prices dated 2026-10-09). | "We also offer single or double-sided placement", SEEN https://www.pcbway.com/assembly-capabilities.html. Min board 10x10 mm. Double-sided surcharge, setup and stencil fees: NOT FOUND (pages point to the instant quote). |
| 5 | Single-sided assembly + customer hand-fits the rest | Economic PCBA is single-sided, 10x10 mm min, 2/4/6 layers, 0.8-1.6 mm, "standard stack-up only", edge rails/fiducials not needed, 0402 and 0.4 mm pitch minimum, reflow 255 C fixed, X-ray included for QFN/LGA, SEEN https://jlcpcb.com/capabilities/pcb-assembly-capabilities. Nothing published says an empty bottom matters. Fit risk: Economic needs the 6L 0.8 stackup to count as "standard" (unconfirmed, see row 1) and VIP/ENIG to be allowed under Economic ("limited by options"). Through-hole hand-soldering service exists ($3.58 labor + about $0.0164/joint) but that is their service, not customer hand-fitting; hand-fitting by customer is not addressed (NOT FOUND). Also: component body must be >=2.5 mm from board edge (Terms 2.3), which the notch area must respect. | Partial turnkey ("Partial Turn-key/Combo") and consigned/kitted are offered, SEEN assembly-capabilities page. Unpopulated bottom or customer hand-fit parts: not addressed (NOT FOUND). Nothing published says an empty side matters. |
| 6 | Part sourcing, consigned parts, out of stock | JLC parts library (stock figures on the page conflict: 760,000+ vs 680,000+), global sourcing 9-15 days, pre-order to private library, consigned parts, new-part request, SEEN https://jlcpcb.com/pcb-assembly. Consign rules: only parts with a JLC part number; clearance fee about $45 (<5,000 CNY parcel) or $85, $70 per 50 part numbers, ship to Zhuhai warehouse, DDP recommended, invoice with HS code etc., SEEN https://jlcpcb.com/help/article/important-note-before-you-consign-the-part-to-jlcpcb. Consigned parts "will not be tested". Overage/spares rule: NOT FOUND. Out of stock: no policy; if a part is left unpopulated JLC refunds that part's cost and joints, SEEN Terms 4.1. | Turnkey ("do not mark up on the parts cost"), consigned/kitted, partial turnkey, SEEN assembly-capabilities page. Consigned spares: ICs/connectors 1-5 extra; 0402 and smaller min 100 pcs plus 50 extra; passives min 50 plus 30 extra; unused parts not returned unless requested, SEEN https://www.pcbway.com/assembly-special-remind.html. Substitutions: "we will again ask for your final approval", SEEN https://www.pcbway.com/assembly-faq.html. Consign handling fee and US-customer shipping process: NOT FOUND. |
| 7 | Orientation/polarity checking, DFM/DFA, preview, photos | Free DFM/DFA analysis plus JLCDFM; 3D viewer to "verify component placement and orientation" at parts-confirm step; AOI catches polarity afterwards, SEEN https://jlcpcb.com/pcb-assembly. Terms 2.6: customer must "check the placement and polarity in 2D production file". Optional "Confirm Parts Placement" $0.45, SEEN blog page. Rotation offsets not addressed; photos not published. | AOI covers "polarity", X-ray covers QFN, SEEN assembly-capabilities. No DFM/DFA service, placement preview or photo policy published (NOT FOUND); one customer testimonial mentions first-board photos only. FAQ suggests you send assembly drawings and photos to avoid wrong placement. |
| 8 | Fab tolerances | Outline +/-0.2 regular, +/-0.1 high-precision; CNC +/-0.1 precision or +/-0.2; V-cut +/-0.4; plated slot min 0.35 mm wide (multilayer), length >=2x width, tolerance +0.13/-0.08; non-plated +/-0.2; 1 oz 6L track/space 0.09/0.09 mm; via 0.15 hole / 0.25 dia (0.2 preferred); annular ring 0.20 recommended, 0.15 absolute (1 oz); thickness tolerance +/-0.1 mm below 1.0 mm. SEEN https://jlcpcb.com/capabilities/Capabilities. Min inside corner / router bit: NOT FOUND. Per your earlier read, +/-0.1 precision routing needs >=50x50 mm and three tooling holes. | Outline +/-0.2 CNC, +/-0.5 V-cut; plated slot >=0.5 wide (non-plated >=0.8); slot tolerance NOT FOUND; track/space 0.1/0.1 mm standard; min drill 0.15 (below 0.2 mm costs extra); annular ring 0.15 mm min. SEEN https://www.pcbway.com/capabilities.html. +/-0.1 mm outline NOT FOUND (published is +/-0.2). Router bit / inside radius: NOT FOUND. |
| 9 | Published pricing, shipping, tariff | PCB: "5pcs 6-layer PCBs starts from $2" (floor, not our spec), SEEN 6-layer page. Calculator for our spec: NOT FOUND. PCBA fees: see section 2. Shipping rates to US: NOT FOUND. Tariff: DDP prepaid for US individuals under $800 (companies may choose CPT and pay duty themselves); total prepaid rate "About 35%~92.5%", Section 301 25%, Section 232 50% on steel/aluminum/copper alloy, rates cut about 10% from 2026-03-17; refunds or extra charges after the tax bill arrives (2-8 weeks); PCBA "often don't qualify" for exemptions, SEEN https://jlcpcb.com/help/article/us-tariff-policy-faq (page is internally inconsistent: "175%" and "35-90%" appear). | PCB, PCBA price: NOT FOUND (instant quote only). Build time 7 days for 6L (row 1). Shipping: "International Express" 3-7 days, "Economy" 5-20 days after leaving their facility, orders ship 2-4 days after placement; rates computed at checkout, no table, SEEN https://www.pcbway.com/helpcenter/shipping_instructions/International_Order___Shipping_Information.html (page dated 2024-02-22). Tariff: DHL DTP and FedEx DDP prepay duty; PCBWay applies 30%-73% and refunds difference when the tax invoice arrives; latest-labelled update (2026-08-15): PCB 37.5%, SMT 47.50%, stencils 77.90%; USPS Global Standard 30% paid on arrival; Global Direct Shipping rejects parcels over $60 declared, SEEN https://www.pcbway.com/blog/News/Impact_of_the_New_U_S_Tariff_Policy_on_Customs_Clearance_51dff4fd.html (page sections out of date order). |
| 10 | Likely DFM/DFA concerns | See section 4. | See section 4. |

---

## 2. Delivered-cost estimates for 5 boards (NOT quotations)

Honest limits: neither company publishes a price I could read for this board. The PCB and parts lines are my judgement ranges, not arithmetic from a published price. Only the assembly fee lines for JLCPCB and the tariff percentages are SEEN. Treat totals as order-of-magnitude, low confidence.

Common assumptions (ESTIMATE): 23 unique part numbers on the full board; about 19-21 unique on the top side only; about 130 solder joints per board top side, about 250 both sides; parts cost per board $15-$40 top only, $20-$50 both sides, plus over-buy for minimum reel/pack sizes, so 5-board parts line $80-$200 (top) and $100-$250 (both). Radio module, USB-C and flex connector are hand-fitted by you and bought separately (not in these totals). Tariff applied to the whole invoice at the SEEN rate range (assumption: duty applies to goods value, not shipping). Shipping is not published; the ranges are my judgement for a small express parcel.

### JLCPCB

| Line | (a) bare | (b) top machine-assembled | (c) both sides, panel |
|---|---|---|---|
| 5 boards (6L, 0.8, ENIG, VIP free) | ESTIMATE $25-$80 (SEEN only the $2 floor and "VIP free") | ESTIMATE $30-$110 (bigger because rails/panel needed for Standard; Economic would avoid rails) | ESTIMATE $30-$110 |
| Panel / rails | none | included above (Standard needs rails; panel fee NOT FOUND) | included above; 2x3 panel is about 71 x 108 mm incl. 5 mm rails (ESTIMATE, my arithmetic: 2 x 30.6 + gap/rails by 3 x 36 + rails) |
| Setup | - | SEEN $25.56 (Standard single) or $8.18 (Economic) | SEEN $51.12 |
| Stencil | - | SEEN $8.21 (Standard) or $1.53 (Economic) | SEEN $16.42 |
| Feeder loading | - | Standard: ESTIMATE 20 unique x $1.53 = $30.60 (range $27-$32); Economic: $3.07 per unique Extended part only | ESTIMATE 23 x $1.53 = $35.19 (range $33-$36) |
| Solder joints | - | ESTIMATE ~650 joints x $0.0016 = ~$1 | ESTIMATE ~1250 x $0.0016 = ~$2 |
| Parts | - | ESTIMATE $80-$200 | ESTIMATE $100-$250 |
| Consigned nPM1300 (only if needed) | - | ESTIMATE +$75-$110 ($45 clearance SEEN + courier to Zhuhai, courier not published) | same |
| Shipping to US | ESTIMATE $20-$45 | ESTIMATE $25-$50 | ESTIMATE $25-$50 |
| Tariff (SEEN rate range 35%-92.5%) | ESTIMATE $9-$74 | ESTIMATE $80-$350 | ESTIMATE $100-$450 |
| **Total** | **ESTIMATE $55-$200** | **ESTIMATE $260-$780** | **ESTIMATE $340-$950** |
| Confidence | low | low (fees solid, rest wide) | low |

Arithmetic for totals: (b) low = (30+25.56+8.21+27+1+80) x 1.35 + 25 = about $257; high = (110+25.56+8.21+32+1+200) x 1.925 + 50 = about $776. (c) low = (30+51.12+16.42+33+2+100) x 1.35 + 25 = about $340; high = (110+51.12+16.42+36+2+250) x 1.925 + 50 = about $947. Note: with Economic instead of Standard for (b) the fixed fees drop by about $20 setup/stencil, but only if the 0.8 mm 6L stackup counts as standard (unconfirmed).

### PCBWay

| Line | (a) bare | (b) top machine-assembled | (c) both sides, panel |
|---|---|---|---|
| 5 boards | ESTIMATE $60-$180 (NOT FOUND published; VIP surcharge unpublished) | ESTIMATE $80-$250 (panel required: board is small and non-rectangular) | ESTIMATE $80-$250 |
| Panel design | - | NOT FOUND fee (they offer to design) | NOT FOUND fee |
| Setup + stencil + labor | - | ESTIMATE $100-$300 (NOT FOUND published) | ESTIMATE $150-$400 |
| Feeder/part fees | - | NOT FOUND | NOT FOUND |
| Parts (turnkey, no markup SEEN) | - | ESTIMATE $80-$200 (+ overage rules: 0402 packs of 100+50) | ESTIMATE $100-$250 |
| Consign handling | - | NOT FOUND | NOT FOUND |
| Shipping to US | ESTIMATE $30-$60 | ESTIMATE $30-$60 | ESTIMATE $30-$60 |
| Tariff (SEEN: PCB 37.5%, SMT 47.5%, stencil 77.9%, window 30-73%) | ESTIMATE $22-$68 | ESTIMATE $120-$370 | ESTIMATE $150-$430 |
| **Total** | **ESTIMATE $110-$310** | **ESTIMATE $390-$1,170** | **ESTIMATE $490-$1,390** |
| Confidence | low | very low (no published assembly fees) | very low |

Arithmetic: (a) low 60 x 1.375 + 30 = $112; high 180 x 1.375... 180 x 1.375 + 60 = $308. (b) low (80+100+80) x 1.4 + 30 = about $394; high (250+300+200) x 1.475 + 60 = about $1,166. (c) low (80+150+100) x 1.4 + 30 = about $492; high (250+400+250) x 1.475 + 60 = about $1,388. The 1.4 and 1.475 multipliers blend the SEEN 37.5% and 47.5% rates.

Takeaway: the two are probably within a factor of about 1.5 of each other; the spread is dominated by parts, tariff and the unknown PCB price, not by anything I could read. Get a real quote from each before deciding on price.

---

## 3. Manufacturing-risk comparison (plain words)

Judgement, not fact.

Bare boards (a): JLCPCB is lower risk on paper. Its filled-and-capped vias are published as free and standard for 6-layer, with sizes and tolerances in numbers, and a +/-0.1 mm outline option. Two catches: the 0.8 mm six-layer stackup is contradicted by two of its own pages, and the +/-0.1 mm outline option needs a bigger board (50x50 mm) and tooling holes, so our 30.6 x 36 mm board likely rides on a panel with tooling holes. PCBWay publishes only +/-0.2 mm outline, charges an unpublished extra for filled vias, and says its 6L 0.8 mm status needs a sales check. Neither says anything about the smallest inside corner their router bit can cut, and your 0.5 mm radius corners need a 1.0 mm bit at most (ESTIMATE: common router bits are about 0.8-2.0 mm; confirm).

Assembly (b), (c): PCBWay is lower risk for this particular board, mainly because of shape and size. JLCPCB's double-sided service needs 70x70 mm boards with 5 mm rails and fiducials, so our board must be put on a panel that you design correctly (or JLCPCB chooses mouse bites for you), with the notch and rounded corners and 2.5 mm part-to-edge rule to respect. PCBWay explicitly says it will design the panel for non-rectangular small boards, has human sales contact, asks your approval for substitutions, and lets you supply some parts. Its downside: no published assembly prices or DFM/DFA tools, so you pay in time and email. JLCPCB's automatic parts choice and "you check polarity in the 2D file" put the burden of catching rotated parts on you; its free DFM, the 3D viewer, and the $0.45 placement confirmation help. Economic PCBA (single-sided, no rails, 6-layer allowed) could suit scenario (b) at the lowest cost but depends on the unconfirmed "standard stackup" rule and 255 C reflow on a 0.8 mm board.

Overall: JLCPCB for bare boards and cheapest top-only assembly if they confirm the stackup; PCBWay if you want a human to handle the panel and the double-sided build. Both need the written answers in section 5 first.

---

## 4. Likely DFM/DFA concerns (items 10)

1. 0.8 mm six-layer stackup availability (JLCPCB pages conflict; PCBWay "confirm with sales"). SEEN above.
2. Via-in-pad: 0.2 mm drill with 0.5 mm pad fits both limits (JLC cap vias 0.15-0.55 mm SEEN). Make sure the four pad vias are the only filled/capped vias and the rest are tented only.
3. Notch with 0.5 mm radius: needs a router bit of about 1.0 mm or smaller; limit NOT FOUND at both. Ask.
4. +/-0.1 mm outline: JLC precision needs panel with tooling holes; PCBWay publishes +/-0.2 only.
5. Plated slots: JLC min 0.35 mm wide and length >=2x width; PCBWay min 0.5 mm. Check the four slots against both.
6. Small board: both force a panel for double-sided; JLC V-cut is +/-0.4 mm and cannot follow a notch; use mouse bites/tabs. Mouse-bite stubs sit near the notch.
7. Rails/fiducials: JLC fiducials need >=3.35 mm from edge; PCBWay >=5 mm. Bottom fiducials needed if the bottom is machine-assembled.
8. Bottom side parts (SOD-323 diodes, 0402, side switch): a side tactile switch is an odd shape for pick-and-place; confirm they can place it or plan to hand-fit it.
9. JLC rule: part body >=2.5 mm from the board edge (Terms 2.3); our notch and edge parts may violate it.
10. QFN-32 and LGA-12: both do X-ray (JLC includes in quote; PCBWay lists QFN X-ray). Stencil: JLC suggests step stencil for mixed sizes.
11. nPM1300-QEAA-R7 (R7 = reel): sourcing via JLC library unknown; consigning means ~$45 clearance plus courier; PCBWay overage rule is 1-5 spares for ICs.
12. Orientation: confirm polarity of diodes and switch and pin-1 of QFN/LGA against their production file, not just yours.
13. Tariff exposure on assembled boards looks high (35%-92.5% JLC prepaid; PCBWay SMT 47.5%).

---

## 5. Questions only a supplier can answer (send the same text to both)

1. Can you build 6 layers at 0.8 mm finished thickness with 1 oz outer / 0.5 oz inner, TG150 or higher, ENIG? Which exact stackup (layer thicknesses) would you use, and is it your standard stackup?
2. Is filled-and-capped via-in-pad (IPC-4761 type VII) available at 0.2 mm drill / 0.5 mm pad for four vias under a QFN pad, at 0.8 mm thickness? Is it included in the price or an extra charge (amount)? Does it add days?
3. Can you hold +/-0.1 mm on the outline at a 10.3 x 6.3 mm edge notch for a 30.6 x 36 mm board? What is the smallest inside-corner radius / router bit you use? Is a 0.5 mm radius acceptable?
4. Can you route four plated slots, and what are your minimum width and tolerance for plated slots on a 6-layer board?
5. For a 30.6 x 36 mm board with a notch and rounded corners: do you panelize it for us, at what fee, with mouse bites or tabs (not V-cut)? What are your rail width, fiducial and tooling-hole rules, and may we send our own panel?
6. What is the smallest single-board size you accept for (i) single-sided and (ii) double-sided machine assembly, and what extra fees apply to double-sided?
7. If we want only the top side machine-assembled and the bottom side left empty (we hand-fit eight bottom parts), is there any issue with leaving the bottom unpopulated or with fiducials/tooling on the bottom?
8. Can you place a side-actuated tactile switch, SOD-323 diodes and 0402 resistors on the bottom side, and a 3215 crystal and LGA-12 2x2 mm at 0.5 mm pitch?
9. List every fee for 5 boards in each scenario (bare, top-only, both sides): setup, stencil, feeder/part-loading, panel, engineering, test, rail removal, and parts handling.
10. For a part we supply (Nordic nPM1300-QEAA-R7, reel or cut tape): what is the process for a US customer, the shipping address, the handling or clearance fee, the spare quantity you require, and what you do if it is late or short?
11. If one of the other 22 part numbers is out of stock, do you stop and ask us before substituting? How long will you wait?
12. How do you verify rotation and polarity (diodes, QFN/LGA pin 1, switch)? Do you give a placement drawing or 3D preview for sign-off, and do you send photos of the first assembled board before shipping?
13. What is the build time and the delivery time to the USA for each scenario, and what shipping options and rates apply to a parcel under 1 kg?
14. How are US import duties handled in 2026 for bare boards and assembled boards (prepaid, rate used, refund of the difference), and which shipping method do you advise?

---

## 6. Contact channels (as published)

JLCPCB
- Online chat: Mon-Fri 24 h, Sat 9am-6pm GMT+8; WhatsApp same hours; Help Center; contact form. SEEN https://jlcpcb.com/pcb-assembly
- Email: support@jlcpcb.com. SEEN as directed by https://jlcpcb.com/help/article/important-note-before-you-consign-the-part-to-jlcpcb (page rendering showed "supportjlcpcb.com" with the @ missing, so the address is as read through the extract, confirm on the site before sending).
- No separate engineering email found (NOT FOUND).

PCBWay
- service@pcbway.com (general/English sales, recommended channel); feedback@pcbway.com (after-sales); anson@pcbway.com (PCB design/layout/mechanical, closest technical contact). SEEN https://www.pcbway.com/contact.html
- Phone +86 571 8503 9969 (Mon-Fri 9:00-18:00, Sat 9:00-12:00 GMT+8); email/service hours 9:00-23:00 daily GMT+8; "Online Chat" listed. SEEN same page.
- Also: https://www.pcbway.com/helpcenter/salesservice/I_have_questions_about_details_of_pcb_or_assembly.html (assigned sales rep process; contents not read).

---

## 7. Still NOT FOUND

- Any price for our PCB spec at either company; PCBWay assembly setup/stencil/labor fees; shipping rates to the US (both).
- Router-bit/inside-corner limit (both); PCBWay +/-0.1 mm outline and slot tolerance.
- 0.8 mm 6-layer stackup confirmation (JLC contradicting pages; PCBWay list truncated).
- JLCPCB panelization fee and rail-removal fee; PCBWay panelization fee and minimum single-board size.
- Consign spares rule (JLC) and consign handling fee (PCBWay); JLC pages that failed to load: assembly help pages, price guide, stackup page.
- Polarity/rotation preview and first-article photo policy (PCBWay); photos (JLC).
- IPC-4761 type VII named explicitly (neither).

## Live order-form readings, 2026-11-24 (rev E Gerbers loaded; nothing saved to a cart, nothing ordered)

Read in the suppliers' own instant-quote forms in a browser, not signed in. These are form prices before any engineer has reviewed the files; both sites say the final price is subject to review.

**JLCPCB** (`cart.jlcpcb.com/quote`, Gerber zip uploaded; the form detected "6 layer board of 36x30.6mm"):
- 0.8 mm is selectable for 6 layers (0.4 and 0.6 mm are greyed out). Standard 6-layer 0.8 mm stack-ups are listed (JLC06081H-1080A, -2116, -7628 and others). This settles the conflict between their published pages.
- Epoxy filled and capped vias: selectable, $0.00 extra. 0.2 mm via hole adds $17.15 and forces TG155 and a 4-wire test ($16.87). ENIG $17.20.
- Precision +/-0.1 mm outline is greyed out for this board: "Individually routed boards need to be at least 50x50 mm for precision routing".
- Bare boards, 5 pcs, 7-8 days: **$86.38** with production-file confirmation ($1.05). Shipping estimate **$25.99** UPS Express Saver, duties prepaid (DDP), 2-4 business days. About **$112 delivered** before coupons.
- Assembly: Economic is greyed out for this board; only Standard is offered. Standard offers top, bottom or both sides. Edge rails and fiducials "Added by JLCPCB": the form says the board is enlarged to 70.6 x 70 mm with rails. "Confirm Parts Placement" exists as an option (set to Yes, not auto-confirmed). Assembly prices appear only after the BOM and placement files are uploaded on the next step, which needs the terms box ticked and a sign-in; not done.
- Consequence: the "Economic, top side only, no panel" idea from the rev D notes is not available. The panel question is answered: JLCPCB adds the rails itself.

**PCBWay** (`pcbway.com/orderonline.aspx`, Standard PCB form, values typed in; no file uploaded):
- 6 layers, 0.8 mm, 5/5 mil track and space, 0.2 mm minimum hole, ENIG, TG150: all selectable together.
- Bare boards, 5 pcs, 5-6 days: **$176.09**. Shipping **$26.55** DHL, 2-4 business days. About **$203 delivered**.
- The Standard form has no filled-and-capped via option (only tenting / plugged with solder mask); the page points to its Advanced PCB form for resin-filled vias and via-in-pad. Not priced. Their assembly quote was not opened.

Still needing a human answer from each: the notch's 0.5 mm inside-corner relief, outline tolerance at the notch without precision routing, customer-supplied nPM1300, and assembled price.
