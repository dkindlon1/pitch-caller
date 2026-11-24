# PitchIQ watch rev D: complete-device cost model

Date: 2026-11-23. Prepared by the independent final auditor (manufacturing / procurement / QA). Evidence and findings: ../reviews/audit_manufacturing_sourcing_qa.md.

**NOTHING HERE IS A QUOTATION.** I obtained no quote from JLCPCB, a print bureau, a CNC shop, a strap maker or a freight agent. Nothing has been ordered. Every cell tagged E is my arithmetic or judgement and can be wrong by a factor of two at 1-5 units. USD.

Tags: **S** = a price/fee I read on a vendor page in this run (2026-11-23). **S-old** = a price recorded as seen in this repo's research or rev C files on the same date or earlier, not re-read by me. **E** = estimate. **P** = published range for a different part or service.

## 1. What I read in this run (the only SEEN items)

| Item | Value | Source |
|---|---|---|
| nPM1300-QEAA-R7 | In stock 8,579; $2.95 @1, $2.205 @10, $1.8133 @100; 16 wk lead; Active | https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-QEAA-R7/19722485 |
| JLCPCB Standard PCBA fees | setup $51.12 double-side, stencil $16.42 double-side, feeder $1.53 per part, handling >= $14.93 only when both options are quoted, hand soldering $3.58 per order, placement confirmation $0.45, SMT $0.0016 per joint, fixture $8.21 each (2 for 1-29 pcs), single-board surcharge $0.48, packing $0.50 + $0.00003 x area cm2, panel fee only for extra designs | https://jlcpcb.com/help/article/pcb-assembly-price |
| JLCPCB overseas consignment channel | handling 2% of declared value, minimum $10 per shipment; duty and VAT held as deposit; goods go to a Hong Kong warehouse; storage 3 years | https://jlcpcb.com/help/article/how-to-consign-parts-to-jlcpcb (this page describes the overseas-seller channel; I could not confirm it is the route for a US hobby order) |
| O-ring 1.5 x 0.5 mm silicone 70A | A$100.14 per pack of 100 (A$90.13 at 50+ packs), on backorder, expected before 15 Dec 2026 | https://miniaturebearings.com.au/products/o-rings-silicone-rubber-small-packs-2-0-or-00150-050-s70-r-pk |
| All other prices below | S-old from research/procurement.md and revC/docs/COST_revC.md, or E | see section 3 |

Pages I tried and could not read (permission prompt not answered): DigiKey FH12A, VCLP0820B004L and LS013B7DH03; LCSC C110926 and C7501206; SparkFun MDBT50Q; Adafruit 1317; Archer strap. These prices are therefore S-old.

## 2. Recurring cost per delivered watch (printed enclosure, JLCPCB Standard double-sided, U1/U2/J3 consigned)

Assumptions: (a) JLCPCB Standard double-sided needs a panel of at least 70 x 70 mm with rails and fiducials (SEEN, section 1 of the audit), so the model uses a 2 x 2 panel (4 boards) and a minimum assembly order of 2 panels = 8 populated boards; the ICs for all 8 boards are bought, which is why the 1-unit column is large; (b) fabrication is priced at an assumed 5-panel minimum for 1 and 5 units; (c) 15% extra boards over units for scrap at 25+; (d) the display, cell, motor, strap are per delivered watch; (e) hand-fitted parts (J1 connector, battery pads, motor, display) are labour, not JLCPCB lines.

| Row | tag | 1 unit | 5 units | 25 units | 100 units | 500 units |
|---|---|---|---|---|---|---|
| Board ICs and passives: U1, U2, U4, J1, SW1, Y1, Q1-Q2, D1-D6, L2, RT1, 32 R/C (multiplied by boards built / units) | S+E | 117.87 | 23.57 | 17.07 | 14.17 | 13.23 |
| USB-C receptacle + gasket (USB4715-GF-A + USBTJ-04), same multiplier | S-old+E | 13.92 | 2.78 | 1.89 | 1.47 | 1.46 |
| Spares / yield allowance, 10% of the two rows above | E | 13.18 | 2.64 | 1.90 | 1.56 | 1.47 |
| Display LS013B7DH03 (DigiKey break prices) | S | 12.39 | 12.39 | 9.60 | 7.97 | 7.74 |
| Cell Adafruit 1317 | S | 5.95 | 5.95 | 5.36 | 4.76 | 4.76 |
| Motor VCLP0820B004L | S-old (backorder at DigiKey in revC check; NOT re-read) | 3.15 | 3.15 | 2.79 | 2.47 | 2.47 |
| PCB fabrication, 6-layer 0.8 mm ENIG, panelised 2x2 with rails, precision outline, via fill (order spend / units) | E | 100.00 | 20.00 | 5.44 | 3.48 | 2.59 |
| PCB assembly service + consign handling (fixed fees from JLCPCB table SEEN; part-line count and consign fees E), / units | S+E | 158.76 | 31.75 | 7.44 | 2.94 | 1.57 |
| Enclosure set: MJF case + cover, SLA/CNC port plate, plunger, lens, O-ring, screws/inserts (printed option) | E | 60.00 | 45.00 | 28.00 | 16.00 | 9.00 |
| Strap + spring bars (Archer 20 mm, $19.99 seen in research file; 100/500 E) | S/E | 19.99 | 19.99 | 19.99 | 18.50 | 5.50 |
| Final assembly + test labour at $25/h (120/90/60/40/30 min) | E | 50.00 | 37.50 | 25.00 | 16.67 | 12.50 |
| Shipping, order-level cost / units | E | 70.00 | 16.00 | 5.20 | 3.30 | 2.00 |
| Tariff 35% x (PCB + assembly + all board parts), basis assumed | S(rate)+E(basis) | 120.94 | 24.19 | 10.52 | 7.56 | 6.57 |
| **Total per delivered unit** | | **746.15** | **244.91** | **140.20** | **100.86** | **70.86** |
| **Total order spend (units x per-unit)** | | 746.15 | 1,224.57 | 3,505.09 | 10,085.76 | 35,432.26 |
| Boards built / panels | | 8 / 2 | 8 / 2 | 32 / 8 | 116 / 29 | 576 / 144 |

The column totals are sums of the cells above; the 1-unit and 5-unit columns are dominated by the 8-board minimum, the fabrication minimum and JLCPCB's fixed fees (about $108 plus consign handling). Nothing is included for FCC, Bluetooth listing, UN38.3 or a leak-test lab (section 4).

## 3. Basis of each row

| Row | Basis |
|---|---|
| Board ICs and passives | U1 SparkFun $8.95/$8.50 (25)/$8.06 (100) S-old; 500 E. U2 DigiKey today (S). U4 Mouser $1.79 ... $1.19 S-old (US distributors have none until April 2027 per rev C; LCSC listed 297 in stock, from $0.495, S-old). J1 FH12A-10S-0.5SH(55): price NOT SEEN, $0.30 E (the bottom-contact FH12 listed $0.3016 S-old). Y1, SW1, Q1/Q2, D1, D2, D3-D6: LCSC "from" prices S-old ($0.0736, $0.0744, $0.0429 each, $0.0053, $0.0546, $0.0125 each). L2 $0.05 and RT1 $0.03 E. 32 passives at $0.01 E. Multiplied by boards built / units. |
| USB-C | Mouser/Octopart $1.61/$1.37/$1.17 plus gasket $0.13/$0.113/$0.097 (S-old, rev C). 500 uses the 100 price E. |
| Display | DigiKey 425-2903-ND $12.39/$9.60 (10)/$7.9728 (100)/$7.7443 (500), 28 weeks (S-old, research/procurement.md). 5 units uses the 1-9 price, 25 the 10-99 price. Mouser lists it obsolete/restricted; Future has 0 stock at an MOQ of 2,240. |
| Cell | Adafruit $5.95/$5.36/$4.76 (S-old). |
| Motor | Vybronics $3.15/$2.789/$2.4713 (S-old). DigiKey showed backorder in the rev C review; treat as unavailable until a cart confirms. Alternate PUI HD-EM0802-LW15-R $2.64 (S-old) is not drop-in (rated 2.6-3.6 V, thickness not found). |
| PCB fabrication | No JLCPCB quote page was readable. $100 for a 5-panel order of 74 x 85 mm 6-layer 0.8 mm ENIG with via fill is a guess (E; range $80-250); 25/100/500 units assume $17/$12/$9 per panel (E). |
| Assembly | Fixed: setup $51.12 + stencil $16.42 + 2 fixtures $16.42 + $3.58 + $0.45 (all S) + feeder $1.53 x about 13 Extended lines (E, line count mine) = about $108; scaled E to $118/$165/$325 for 8/29/144 panels. Variable $0.0016 x about 230 joints per board + $1.40 per panel (E). Consign handling: $10 minimum plus about $35 parts freight to the warehouse (E; the consigned-parts fee for a US customer was NOT FOUND). |
| Enclosure | E. Printed set (MJF case + cover about $18, SLA port plate $12, plunger $6, lens laser cut with a $25 minimum order (S-old, Pololu), O-ring share, screws/inserts) = $60 at 1. The O-ring is sold only in packs of 100 (A$100.14, SEEN today), a one-time cost of about $65 plus freight; per-unit share is $0.65. 100/500 E. |
| Strap | Archer 20 mm $19.99 (S-old); 100 units assumes $18.50 (E); 500 custom moulded $5.50 (P, MOQ 300-500). |
| Labour | 120/90/60/40/30 minutes at $25/h (E): rev C's 90/60/40/30/25 plus port-plate bonding with shim, RTV fillet, cure and a leak test. |
| Shipping | E: 1 unit $70 (JLCPCB DHL + three distributor parcels + print + strap), then $80/$130/$330/$1,000 per order. |
| Tariff | 35% of PCB + assembly + all board parts (including consigned ICs, which cross the border twice). JLCPCB's 35% on PCBA is S-old (rev C: jlcpcb.com/news/logistics-update-us-china-tariff, table dated 2026-03-17); the basis is my assumption. |

## 4. Enclosure alternative: CNC for sealing units

Use this for the first units that must hold a leak test (printed MJF tolerances are +/-0.25 mm against a 0.15 mm gasket window, see MECH_revD.md).

| | 1 | 5 | 25 | 100 |
|---|---|---|---|---|
| CNC acetal/PC set (case, cover, port plate) E, replaces the printed case/cover/plate part of the enclosure row | 220 | 150 | 85 | 55 |
| Printed set from the table (E) | 60 | 45 | 28 | 16 |
| Delta per unit if CNC (E) | +160 | +105 | +57 | +39 |

No CNC quote was obtained. JLC3DP's front page says CNC "from $5.00" (S-old, research/enclosure.md) with no part-size example, so I do not use it.

## 5. One-time items (not per unit)

| Item | Prototype (1-5) | At 100 | At 500 | Basis |
|---|---|---|---|---|
| Sample parts bought before the board order (section 6 of the audit): 2 displays $24.78, 5 FH12A about $1.50-6 E, 5 SKRTLAE010 $0.37, 2 cells $11.90, 2 motors $6.30, 3 USB-C kits $5.22, nPM1300 x3 $8.85, strap $19.99, 3 extra MDBT50Q $26.85 | about 105-110 | 0 | 0 | S-old/E unit prices from section 3 |
| O-ring pack (100) | about 65 + freight | 65 | 65 | S today: A$100.14, converted at an assumed 0.65 USD per AUD (E) |
| Lens: one laser-cut window order | 25 | 25 | 25 | Pololu minimum S-old |
| Printed fit-check set (MJF) | 60-100 | 0 | 0 | E |
| CNC sealing set (if used) | 220-450 | 0 | 0 | E |
| Debug probe (Raspberry Pi Debug Probe) | 12 | 12 | 12 | S-old |
| Pogo jig for the five programming pads | 25-55 | 500-2,000 | 500-2,000 | S-old/E |
| Leak and push-pull test rig (bucket, pressure syringe, force gauge) | 20-60 | 60 | 60 | E |
| Optional nPM1300-EK $64.35, nRF52840-DK $48.95 | 0-113 | 0 | 0 | S-old |
| Injection tooling, strap tooling, FCC (SDoC/certification), Bluetooth SIG listing ($12,000), UN38.3, IPX7 lab | 0 | see rev C COST_revC.md section 2 (unchanged, S-old/P): about 14,800-35,200 total | about 19,300-80,700 | not re-researched |
| **Total prototype build one-time (excluding optional kits, CNC)** | **about 330-480** | | | sum of the above |

## 6. What moves the number most

1. JLCPCB's real quote for a 6-layer 0.8 mm panelised board and the consignment terms. Fixed fees are about $108 before consignment; the fabrication line is a guess.
2. Whether J3, U1 and U2 are JLCPCB-assembled at all. Without consignment each becomes a hand-soldering job and the assembly rows fall, labour rises.
3. The 8-board minimum: if you hand-assemble 5 boards from bare PCBs the assembly row is replaced by a stencil ($8-16) and about 3 hours of your time per board.
4. Enclosure route (printed vs CNC): +$160 at 1 unit.
5. U4 supply: the LIS2DH12TR has no US distributor stock until April 2027 (rev C S-old) and 297 at LCSC; a driver for the pad-compatible LIS2DW12 does not exist yet.
6. Motor supply (backorder at DigiKey), display (single source, 28 weeks).
