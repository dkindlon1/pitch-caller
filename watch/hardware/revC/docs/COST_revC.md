# PitchIQ watch rev C: complete-device cost model

Date: 2026-11-23. Prepared by the independent manufacturing/sourcing/QA reviewer (see ../reviews/manufacturing_sourcing_qa.md for evidence and links).

**NONE OF THIS IS A QUOTATION.** No vendor quoted anything. No PCB, assembly, print, strap, shipping or duty price was obtained from a calculator or sales rep. Nothing has been ordered and nothing should be ordered without the owner's approval. Dollar figures are USD.

Tag legend (every cell carries one):
- **S** = SEEN: a price read on a vendor page today (2026-11-23) or listed in this repo's research/review files as seen (source in the notes table). "S-old" = seen in an earlier revision's review today or earlier, not re-read.
- **P** = PUBLISHED RANGE: a range printed on a vendor or blog page, not a quote for this part.
- **E** = ESTIMATE: my arithmetic or judgement. Mixed tags (S+E) mean a seen unit price combined with an assumed quantity or fee count.

## 1. Recurring cost per complete device (USD per unit)

Assumes: PCBA at JLCPCB Standard double-sided (needed: SW1 is on the bottom, and Standard is the only tier with bottom-side placement), U1 and J3 consigned, display/battery/motor/gasket hand-fitted by the owner, enclosure printed (MJF) up to 100 units and aluminium-tool injection moulded at 500, strap bought retail up to 100 and a custom moulded silicone strap at 500.

| Row | 1 unit | 5 units | 25 units | 100 units | 500 units |
|---|---|---|---|---|---|
| Electronic components on the board (U1 BLE module, U2 PMIC, U4 accel, passives, FPC connector, button, diodes) | 15.26 S+E | 15.06 S+E | 13.24 S+E | 12.27 S+E | 11.89 E |
| Display (Sharp LS013B7DH03) | 12.39 S | 12.39 S | 9.60 S | 7.97 S | 7.74 S |
| Battery (Adafruit 1317, 150 mAh protected) | 5.95 S | 5.95 S | 5.36 S | 4.76 S | 4.76 S |
| Motor (VCLP0820B004L) | 3.15 S-old | 3.15 S-old | 2.79 S-old | 2.47 S-old | 2.47 E |
| USB-C connector + gasket (USB4715-GF-A + USBTJ-04) | 1.74 S | 1.74 S | 1.48 S | 1.27 S | 1.27 E |
| PCB fabrication (6-layer 0.8 mm ENIG, 30 x 36, notch) | 45.00 E | 9.00 E | 3.80 E | 2.20 E | 1.40 E |
| PCB assembly (JLCPCB Standard double-sided) | 108.12 S+E | 22.48 S+E | 5.62 S+E | 2.45 S+E | 1.61 S+E |
| Enclosure (top, back, lens, O-ring, screws, button cap) | 56.50 E | 22.40 E | 14.10 E | 12.40 E | 7.50 P |
| Strap + spring bars | 20.49 S+E | 18.98 S+E | 18.98 S+E | 18.98 E | 5.50 P |
| Final assembly labour (minutes assumed: 90 / 60 / 40 / 30 / 25; at $25/h) | 37.50 E | 25.00 E | 16.67 E | 12.50 E | 10.42 E |
| Shipping | 55.00 E | 14.00 E | 4.80 E | 3.20 E | 2.00 E |
| Tariff / duty (35% x electronics + PCB + assembly; rate seen, basis assumed) | 58.93 S+E | 16.29 S+E | 7.93 S+E | 5.92 S+E | 5.22 S+E |
| **Total per unit** | **420.03** | **166.43** | **104.36** | **86.40** | **61.77** |
| **Total order spend (units x per-unit)** | 420 | 832 | 2,609 | 8,640 | 30,887 |

The totals are sums of the cells above, so they are only as good as the weakest tag in each column. The 1-unit column is dominated by JLCPCB's fixed order fees (about $105) and the minimum board count.

## 2. One-time costs (not per unit)

| Item | Prototype build (1-5 units) | Selling at 100 units | Selling at 500 units | Tag and basis |
|---|---|---|---|---|
| Debug probe (Raspberry Pi Debug Probe, Adafruit 5699) | 12.00 | 12.00 | 12.00 | S: $12.00 in stock today; fit with nRF52840 not verified. J-Link EDU Mini $75.95 is non-commercial only (S-old) |
| Pogo-pin programming jig (pins + holder) | 25-55 | 500-2,000 production fixture | 500-2,000 | pins $4.95 per 10 S-old; holder and production fixture E |
| Optional references: nRF52840-DK $48.95, nPM1300-EK $64.35 | 0-113.30 | 0 | 0 | S-old (DigiKey, revB) |
| Injection tooling, case top + back, aluminium or P20 | 0 (printed) | 200-1,000 silicone mould only if casting | 4,000-24,000, plus 800-2,500 per side action for the USB-C opening | P (RapidDirect, Formlabs, LAN PDT, Protolabs from $1,495 per tool); window, gasket and button-boot tooling NOT FOUND |
| Custom strap mould | 0 (retail strap) | 0 | 500-20,000 | P (strap research; supplier MOQ 300-500 seen; unit price NOT FOUND) |
| FCC for a device using a certified module (Part 15B host SDoC) | 0 | 1,500-5,000 | 1,500-5,000 | P: Digi $1,500-2,500; compliancetesting.com $1,900-5,000 (S-old, revB). If the lab rules the modular grant does not cover this host (Raytac grant is "Limited Single Modular", 5 mm body separation condition), certification with a pre-certified module is $4,900-10,000 (P) |
| Bluetooth SIG listing, Adopter member | 0 | 12,000 | 12,000 | S-old: $12,000 per qualification, 2026 fee schedule effective 2026-03-01 (revB sourcing finding 5), membership dues for Adopter $0. Firmware must be on a qualified controller (NCS SoftDevice Controller), not vanilla Zephyr |
| Battery UN38.3 test summary | 0 (cell supplier's report) | 250-7,000 | 250-7,000 | P: $250 per model (JJR lab) up to $5,000-7,000 (Epec); only needed if the pack is custom or the retailer's report cannot be used. IEC 62133 $6,000-10,000 (P) only if a customer demands it |
| Lab water test (IPX7 report) | 0 (own dummy test, a few dollars) | 500-3,000 | 500-3,000 | E: no price found; do not claim a rating without it |
| **Total** | **about 37-180** | **about 14,800-35,200** | **about 19,300-80,700** | sums of the ranges above; the range is wide because tooling, FCC route and UN38.3 route are unknown |

## 3. Notes: where each row's number comes from

| Row | Basis |
|---|---|
| Electronics | docs/BOM.csv unit prices (parts excluding battery, motor, USB-C, display) with tier prices for the three big ICs: U1 SparkFun $8.95 (1-24), $8.50 (25+), $8.06 (100+) S; U2 Mouser (S-old) $3.42, $2.33 at 25, $2.09 at 100, 500 E $1.90 (today Octopart shows Newark $2.70 / $1.75 at 1 / 100, S, so this row is conservative); U4 Mouser $1.79 / $1.59 / $1.42 / $1.30 / $1.19 (S-old) while LCSC "from $0.495" S stock is 297. Passives from BOM, mostly E (0.003-0.01). No yield loss or spare-part overage is included (add 5-10%). |
| Display | DigiKey 425-2903-ND today: $12.39 / $9.60 (10) / $7.9728 (100) / $7.7443 (500), 33,493 in stock, 28 weeks. Quantity 5 uses the 1-9 price. |
| Battery | Adafruit 1317 today: $5.95; $5.36 at 10-99; $4.76 at 100+ (500 uses the 100+ price). |
| Motor | VCLP0820B004L: $3.15 / $2.789 (10) / $2.4713 (100) from the research file (S-old). DigiKey today shows out of stock, 9-week backorder, price not captured; 500 price E. Treat as unavailable until a cart confirms. |
| USB-C + gasket | Mouser USB4715-GF-A $1.610 / $1.370 / $1.170 plus USBTJ-04 $0.130 / $0.113 / $0.097 (Octopart tables today). DigiKey KIT $1.81 / $1.538 / $1.307 is similar. 500 uses the 100 price (E). |
| PCB fabrication | No JLCPCB 6-layer price was readable. 1 unit = a 5-board minimum order at about $45 total (E, from revB model); 5-500 units use the revB per-board estimates. Panelisation (BLOCKER 2: JLCPCB Standard assembly wants at least 70 x 70 mm) will change this; it could be higher at 1-25 units. P context: a third-party article gives 6-layer boards at $30-42 each at 5 pcs, $14-20 at 50, $5-8 at 500 for generic sizes (revB sourcing finding 12). |
| PCB assembly | Fixed order fees (S-old, https://jlcpcb.com/help/article/pcb-assembly-price): Standard double-sided setup $51.12, stencil $16.42, feeder $1.53 per Extended line (about 12 lines E), handling $14.93 minimum, hand solder $3.58 (stakes), placement confirm $0.45, consign fee NOT FOUND. Total fixed about $105 E. Per board: joints 236 x $0.0016 plus packing and single-board surcharge, about $1.4 E. 1 unit = a 2-board order ($108.12). The consigned-part fee and the panel make the real figure uncertain. |
| Enclosure | E from research/enclosure.md ranges (mid-values): printed MJF parts $7-10 each at 1-5, $5.5 at 25, $4 at 100; window $25 minimum order at 1 (S-old), $5, $1.5, $2 each; O-ring and screws E ($3.5 and $6 pack at 1, falling to $0.2 each); button $0-2. 500 units = injection moulded $0.50-4 per part (P, LAN PDT) plus window, boot, O-ring, screws; glass or sapphire window price NOT FOUND. Tooling is in section 2. |
| Strap | Archer $19.99 (S, 20 in stock; shipping $6.99 is in the shipping row); at 5+ Barton $21.74 with 15% off = $18.48 (S-old); plus $0.50 E for spare bars. 100 units assumes the same retail price because Barton's 50+ quote is NOT FOUND, so this cell is E and probably high. 500 = custom moulded silicone $3-8 each (E in strap.md; MOQ 300-500 S-old). |
| Labour | Assumed minutes per unit: battery leads, motor leads, LCD and FPC fit, lens adhesive and cure, gasket, O-ring, back cover with 4 screws, strap, programming and a short functional test. 90 minutes for the first build, 60 / 40 / 30 / 25 as the process settles. Rate $25 per hour, E, a small US shop; the owner's own unpaid time would make this row 0 but the time is real. Final QA time is not included. |
| Shipping | E: JLCPCB DHL about $30 per order (revB estimate, not seen), plus distributor, strap ($6.99 SEEN under $50) and print shipping; per-order estimates $55, $70, $120, $320, $1,000. |
| Tariff | JLCPCB says 35% on PCB and 35% on SMT assembled boards (https://jlcpcb.com/news/logistics-update-us-china-tariff, S-old, rate table dated March 17, 2026; FAQ updated Oct 29, 2026 lists "about 35%-92.5%"). Basis (order value vs goods value, treatment of consigned parts that cross the border twice) is NOT FOUND, so I applied 35% to electronics + PCB + assembly, which is a conservative E. China-made prints, lens or strap would add duty not included. |

## 4. What would change the number most

1. **JLCPCB's real panel, setup and consigned-part fees, and whether J3 and U1 can be consigned at all** (BLOCKER 1 and 2). At 1-25 units the roughly $105 fixed order fee and the PCB panel minimum are the biggest lines, and a refusal turns J3 and U1 into hand-soldering jobs.
2. **The tariff basis.** 35% over electronics + PCB + assembly adds $58.93 at 1 unit and $5.22 at 500; if it applies to the whole PCBA value including consigned parts, or if the US distributor parts avoid it, the figure moves by tens of dollars at 1-5 units.
3. **Enclosure route.** Printed parts at $5-15 each versus a $4,000-24,000 injection tool; a CNC sealing face for any water test will cost far more than printing.
4. **The strap.** A retail strap is $18-22 each; a custom moulded strap is $3-8 but needs 300-500 units and a $500-20,000 tool.
5. **Compliance route.** FCC from $1,500 to $10,000, Bluetooth SIG $12,000, UN38.3 up to $7,000, all fixed regardless of units sold; at 100 units they add over $140 per unit.
6. **Display and motor supply.** Display $7.74-12.39 and single source with 28-week lead; motor is out of stock at DigiKey today.
7. **Labour minutes.** Going from 90 to 30 minutes per unit is worth about $25 per unit.
