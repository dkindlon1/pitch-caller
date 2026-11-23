# Rev B sourcing, cost and compliance review (second pass), seen 2026-11-23

Method: WebFetch/WebSearch only. "Seen" = on the cited page in today's fetch. "est" = my estimate, not seen. "Not found" = the page text I received did not contain it. Mouser product pages (/ProductDetail/) failed to load; Mouser *search* pages (https://www.mouser.com/c/?q=...) did load and are what I cite. DigiKey .com USD price tables were often cut off by the fetch tool; where DigiKey gave only CAD/GBP I say so. I did not redo the LCSC part-number check.

`python3 scripts/gen_bom.py` run: output "on-board parts incl. battery+motor: $36.52 @1, $29.46 @~100; with display $48.91 / $37.43". I recomputed from docs/BOM.csv (excluding LCD1, FL1 and DNP rows): $36.52 / $29.46. The arithmetic matches; the inputs do not (findings 1-3).

---

## Findings

### 1. MAJOR: U3 MAX30101EFD+T price in BOM.csv is a CNY conversion and is 14-16% too high; the part is also thinly stocked at LCSC and Mouser is dropping it
BOM.csv row U3: $15.90 @1 / $12.40 @100, "my conversion at 7.13". Real USD prices seen today:

| Qty | DigiKey (USD, cut tape) | Mouser (USD, via Mouser search page) |
|---|---|---|
| 1 | 13.72 | 13.19 |
| 5 | 12.462 | not listed |
| 10 | 11.993 | 11.14 |
| 25 | 11.432 | 10.53 |
| 50 | 11.0488 | not listed |
| 100 | 10.6974 | 9.86 |
| 250 | not listed | 9.74 |
| 500 | 10.3428 | 9.29 |
| 1000 | not listed | 9.10 |

- DigiKey: Active, **5,962 in stock, 180,000 factory stock, 10-week standard lead time**, T&R $9.19265 @5,000, Digi-Reel adds $7 reeling fee. https://www.digikey.com/en/products/detail/analog-devices-inc-maxim-integrated/MAX30101EFD-T/6188733 (page date not shown). The 5,962 figure from research/sensors.md reproduced.
- Mouser: 2,612 in stock, "Can Ship Immediately", but the page says **"MOUSER WILL NO LONGER BE CARRYING THIS ITEM IN THE FUTURE"**; origin Taiwan; "Est. Tariff" blank. https://www.mouser.com/c/?q=MAX30101EFD%2BT . Same price table appears on oemstrade (aggregator) with Mouser stock 2,665, Newark 3,930 stock ($13.72 @1, $10.70 @100, $10.34 @500), Verical 195,000 at $8.3612 @5,000 MOQ 5,000: https://www.oemstrade.com/search/MAX30101 (date not shown).
- LCSC C2859066: **53 in stock**, "from $5.2405", no price-break table in the page text. https://www.lcsc.com/product-detail/C2859066.html . A 100-board run cannot be filled from the JLCPCB library; consign DigiKey/Newark stock.
- Lifecycle on analog.com: **PRODUCTION** for both MAX30101EFD+ and MAX30101EFD+T; the page does not say "recommended for new designs", names **no successor**, no last-time-buy; both linked to PCN 1951 (9 May 2019, assembly). 1ku list $6.76. https://www.analog.com/en/products/max30101.html
- Note: DigiKey carries "MAX30101ACCEVKIT#" as Obsolete (research/procurement.md), the eval kit not the chip.

Corrected BOM effect: U3 contributes -$2.18 @1 and -$1.70 @100 versus the CSV. Fix: set U3 to 13.72 / 10.6974 (DigiKey, seen); update the U3 `desc` to say LCSC stock 53 is not usable for more than a handful of boards and Mouser is withdrawing the part.

### 2. MAJOR: U4 LIS2DH12TR is priced at an LCSC "from" price; it is out of stock at both big US distributors and LCSC stock is 297 today
BOM.csv: $0.53 flat. Seen:
- LCSC C110926: **297 in stock** (page meta, 2026-11-23), "from $0.495", no break table. https://www.lcsc.com/product-detail/C110926.html . procurement.md read 1,485 earlier the same day; research/sensors.md read 58,867. The trend is a sell-through, not noise.
- Mouser 511-LIS2DH12TR: **0 stock**, 42,713 on order due 4/12/2027 and 64,000 due 7/12/2027, 24-week lead, a 2025 PCN listed. USD cut tape: 1 $1.79; 5 $1.59; 10 $1.42; 50 $1.36; 100 $1.30; 500 $1.19; 1000 $1.15; 5000 $1.04. https://www.mouser.com/c/?q=LIS2DH12TR
- DigiKey LIS2DH12TR: 0 in stock, backorder, 24 weeks (from procurement.md, not re-read).
So the real open-market price is $1.79 @1 / $1.30 @100 and there is no US stock until April 2027. The $0.53 figure is only valid while LCSC stock lasts.

Drop-in alternatives (pin tables read from the ST datasheets today):

| | LIS2DH12 | LIS2DE12 | LIS2DW12 |
|---|---|---|---|
| Pin 1 | SCL/SPC | same | same |
| Pin 2 | CS | same | same |
| Pin 3 | SDO/SA0 | same | same |
| Pin 4 | SDA/SDI/SDO | same | same |
| Pin 5 | Res (connect to GND) | RES (connect to GND) | **NC** (tie to VDD, VDD_IO or GND) |
| Pin 6 | GND | GND | GND |
| Pin 7 | GND | GND | **RES (connect to GND)** |
| Pin 8 | GND | GND | GND |
| Pin 9/10 | Vdd / Vdd_IO | same | same |
| Pin 11/12 | INT2 / INT1 | same | same |
| Package | LGA-12 (dimensions not extracted) | LGA-12 (not extracted) | LGA-12L **2.0 x 2.0 x 0.7 mm max** |
| 25 Hz current | 4 uA (ref. earlier research) | 4 uA normal mode (Table 11) | 1.5 to 10 uA depending on low-power mode (Low-power mode 1 to 4; 3 uA in mode 2) |

URLs: https://www.st.com/resource/en/datasheet/lis2dh12.pdf , https://www.st.com/resource/en/datasheet/lis2de12.pdf , https://www.st.com/resource/en/datasheet/lis2dw12.pdf
- design.py:80-84 ties pin 5 and pins 6/7/8 to GND, pin 2 and 3 to 3V0, INT2 open. That satisfies **all three** parts electrically (pin 5 NC-or-GND on LIS2DW12, pin 7 RES-to-GND on LIS2DW12, both GND in the current netlist). LIS2DE12 and LIS2DH12 are identical in the pin table. I did not compare land-pattern drawings (numbers did not extract), so check pad sizes before relying on "same footprint".
- Stock seen: **LIS2DW12TR LCSC C189624: 14,783 in stock, from $0.5439** https://www.lcsc.com/product-detail/C189624.html ; Mouser LIS2DW12TR 0 stock, 46,904 on order for 1/20/2027, 24 wk, $1.79 @1 / $1.30 @100 / $1.19 @500 https://www.mouser.com/c/?q=LIS2DW12TR . **LIS2DE12TR LCSC C155639: 3 in stock**, from $1.4422 https://www.lcsc.com/product-detail/C155639.html ; Mouser 0 stock, 23,621 due 4/12/2027, $1.68 @1 / $1.22 @100 / $1.07 @1000 https://www.mouser.com/c/?q=LIS2DE12TR . JLCPCB basic/extended class for C189624 not read.
- Not verified: WHO_AM_I value and register map of LIS2DW12 and LIS2DE12 versus the firmware's LIS2DH12 driver (not extracted this pass). LIS2DW12 is a different register map from LIS2DH12 as I understand it (not seen on a page today), so firmware needs a second driver; LIS2DE12 is 8-bit output only (not read today).
Fix: price U4 at $1.79 / $1.30 for a non-LCSC buy; add LIS2DW12TR C189624 as the approved alternate in design.py and write the second driver now; buy 10 LIS2DH12 from LCSC while stock exists.

### 3. MAJOR: U2 nPM1300 BOM source label is wrong; actual prices and stock
BOM.csv says "seen (DigiKey)" for $2.95 @1 / $1.8133 @100. Those numbers match **Newark** (2.95 / 1.81 @100) and CoreStaff ($1.813 @100) on Octopart, not DigiKey (DigiKey's price table was cut off in my fetches; the CAD page showed stock only). https://octopart.com/part/nordic-semiconductor/NPM1300-QEAA-R7 (date not shown).
Seen today:
- Mouser 949-NPM1300-QEAA-R7: **5,641 in stock**, 4,500 on order due 11/2/2026; cut tape 1 $3.42, 10 $2.55, 25 $2.33, 100 $2.09; reel 1,500 $1.78. Variant NPM1300-QEAA-R (949-NPM1300-QEAA-R): 4,204 in stock, 19-week factory lead, cut tape $3.05 / $2.28 / $2.08 / $1.87 @100. https://www.mouser.com/c/?q=NPM1300-QEAA-R7
- DigiKey NPM1300-QEAA-R7: Active, **16-week lead**, in stock 9,247 (digikey.ca page, prices in CAD, price table not captured). https://www.digikey.ca/en/products/detail/nordic-semiconductor-asa/NPM1300-QEAA-R7/19722485
- Octopart: Future 538 stock ($3.14 @1, $2.69 @100), TME 1,456 ($2.70 @1, $1.75 @100), Newark 2,880 ($2.95 @1, $1.81 @100).
- LCSC C7501206: 921 in stock, from $2.3189 (procurement.md; not re-read).
Stock is healthy (not a risk). Fix: relabel the source as Newark/Octopart; use Mouser $3.42 @1 / $2.09 @100 as the verified US price. Delta is +$0.47 @1 / +$0.28 @100.

### 4. MAJOR: the Raytac grant requires 5 mm antenna-to-body separation; a wrist watch with the module at the 12 o'clock edge may not meet it, and the latest FCC grant is "Limited Single Modular"
- Raytac approval sheet (MDBT50Q, Version B, 2018/06/12): module meets FCC RF exposure guidelines "when used with an accessory that contains no metal and that positions the handset a minimum of 5mm from the body"; IC: "authorized only for use in device where the antenna may be installed such that 5mm may be maintained between the antenna and users"; IC portable use needs separate evaluation by the integrator; "must not be co-located ... with any other antenna or transmitter". https://fcc.report/FCC-ID/SH6MDBT50Q/3937502.pdf
- FCC ID SH6MDBT50Q: original grant 07/26/2018 "Single Modular"; Class II changes 05/15/2020 and **07/15/2020 "Limited Single Modular"**, described as for integration into a specific third-party reader host; output 0.0066 W conducted; grant describes "a portable device". https://fccid.io/SH6MDBT50Q
- Consequence: the case design must keep the chip antenna at least 5 mm from skin (check the case stack: a 0.8 mm board in a wrist case will not give 5 mm unless the antenna end overhangs/lifts) or the product needs its own RF exposure evaluation (cost not found). Also confirm with Raytac/TCB which of the three grants applies to an unmodified MDBT50Q-1MV2 on a different host. Raytac layout review: service@raytac.com (same PDF).

### 5. MAJOR: Zephyr's own Bluetooth controller has no current Bluetooth SIG qualification; the listing path forces nRF Connect SDK or a full controller test
- Nordic nRF52840 qualification matrix: "the Zephyr Controller subsystem was qualified with **QDID 150092** for nRF52840, using nRF Connect SDK 1.3.2 for core specification 5.1. ... **Other qualifications for the Zephyr Controller subsystem are not planned.**" NCS SoftDevice Controller: latest listed NCS 3.3.1, **DN Q390989**, core spec 6.3; NCS 3.3.2 to 3.4.1 (LTS) show no value. https://docs.nordicsemi.com/r/bundle/comp_matrix_nrf52840/page/comp/nrf52840/nrf52840_ble_qdid_qual_matrix.html
- Zephyr docs (host only): v4.4 host Design Number Q385945, listing 332380; v4.5 Q399832, listing 353725. The page says nothing about the Link Layer. https://docs.zephyrproject.org/latest/services/connectivity/bluetooth/bluetooth-qual.html . The firmware targets Zephyr v4.4.2 (REVIEW_BRIEF): host DN exists, controller DN does not.
- Nordic DevZone: "QDID 194918 (nRF52833, NCS 2.1) ... not valid for vanilla Zephyr"; qualification is tied to NCS tags. https://devzone.nordicsemi.com/f/nordic-q-a/106443/qdid-for-bluetooth-stack-when-using-zephyr-vanilla/461378
- Fee, effective 01 March 2026: **Adopter $12,000 per qualification; Contributing Adopter $8,000 first of the year, then $12,000; Associate $6,000**; dues separate (Adopter $0; Associate $11,250 small / $52,500 large). https://www.bluetooth.com/develop-with-bluetooth/qualification-listing/qualification-listing-fees/ . The page does not address listing with already-qualified components.
- Fix: plan the product firmware on the NCS SoftDevice Controller + a qualified host DN (Nordic DNs), as the brief already hints; the cheapest legal listing is Adopter $12,000 (membership free) with reuse of Nordic DNs. Whether the Raytac module's own listing (QDID not shown in my sources) can be reused with custom firmware: not found.

### 6. MAJOR: frontlight, J2 and FL1: what Azumo 11049-06_A1 actually is, and how to buy a frontlit LS013B7DH03
- DigiKey 11049-06_A1 (2004-11049-06_A1-ND): category "Optoelectronics Accessories / Optical Film", description "Optical Film 1.28" Sharp LS013B7DH03 Display", Active, 247 in stock, 32-week lead, tray, **$47.87 @1, $39.40 @10, $34.5147 @100**. https://www.digikey.com/en/products/detail/azumo/11049-06-A1/9602607 . **It is the film only, not a module.** Azumo FLP datasheet 12367-01: front-light film 0.05 mm, LED 5 mA typ / 25 mA abs max / 80 mA pulse, Vf not stated, "PRELIMINARY" (from procurement.md, not re-read).
- The bonded module is a different SKU, **11049-06_T7** ("AZUMO DISP W/ SHARP LS013B7DH03"): ichome.com **$32.08 @1**, stock not stated ("Inventory changes frequently") https://ichome.com/product-detail/azumo/11049-06-t7 ; LCSC C17504651 **out of stock, from $22.1612** https://lcsc.com/product-detail/LCD-Screen_Azumo-11049-06_T7_C17504651.html ; Azumo's page says the module is sold through Digi-Key but I found no DigiKey T7 page. Azumo's resource page lists part numbers 11049-06 (front light panel), 11049-06 T7 (display module), 12402-01 T1 (developer kit). https://www.azumotech.com/resource-center/front-light-panel-for-ls013b7dh03-displays/
- Contact route: azumotech.com product page has "Request a Meeting", "Talk to an engineer", "Where to Buy", CAD behind a form; no MOQ or price on the page. https://www.azumotech.com/products/1-28-monochrome-display-11049-06/
- Dev kit: DigiKey 12402-01_A1 "AZUMO DEVKIT W/SHARP 1.28 RLCD", not stocked, **42-week lead**, one price break shown: **20 at $213.12 each ($4,262.41)**, contents "Board(s)". https://www.digikey.com/en/products/detail/azumo/12402-01-A1/9602623 . Azumo kits have a driver adjustable 1 to 25 mA and 2 MB SPI flash per DigiKey's highlight page. https://www.digikey.hk/en/product-highlight/f/flex-lighting/flex-monochrome-dev-kits-with-sharp-rlcd
- BOM.csv FL1 row "whether the SKU is film only or a bonded module is unresolved": resolved for the DigiKey SKU (film). FL1 as priced ($47.87/$34.51) is the film; hand-laminating a 0.05 mm film onto a Sharp panel is not a realistic prototype step. LED Vf still not published, so R13 stays unconfirmed.
- Other frontlit modules seen: Azumo dev kits with Kyocera TN181AN (13261-01_A1, EUR 291.14) and TN216AN (13262-01_A1, EUR 298.33), 0 stock; sizes and interfaces not stated. https://www.digikey.ie/en/product-highlight/a/azumo/display-modules-with-kyocera-monochrome-displays . Azumo 12342-06_T2 (4.4 in module) Obsolete. No purchasable 1.2-1.3 in frontlit SPI memory-LCD module other than Azumo T7 was found. Transflective TFT alternative: not searched to a product page, so no data.
- Fix: for an evaluation buy T7 (ichome $32.08, or ask Azumo via "Where to Buy") rather than A1 + panel; do not commit J2 geometry or R13 until the Vf is measured on that sample.

### 7. MAJOR: LS013B7DH03 is single-source with a 2,240-piece factory MOQ, and one DigiKey variant is already Obsolete
- DigiKey 425-2903-ND: Active, **35,736 in stock**, 28-week lead, tray, $12.39 @1, $9.60 @10, $7.9728 @100, $7.7443 @500 (no 25 or 250 break). BOM.csv says 33,493; today's number is 35,736 (stock moves both ways). https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/5300387
- DigiKey 425-2904-ND **LS013B7DH03-DU**: "Obsolete ... This product is no longer manufactured", 1.3 in 128 x 128, tray. https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH05/5300388 (that URL resolved to the -DU page; my search for DH05 had guessed the ID).
- Future Electronics 6117773: Active, stock 0, **MOQ 2,240 (one box)**, 28-week lead, $6.54; two PCNs: **Aug 2024 glass supplier change AGC to Corning (0.5t only), from Dec 2024 production, driven by end-of-life materials; June 2023 polarizer surface treatment and adhesive change, also EOL materials**. https://www.futureelectronics.com/p/6117773
- Octopart: DigiKey 35,743 at $12.39 ... $7.744 @1000; Avnet and Arrow 0 stock, MOQ 2,240 ($6.447, $6.125); Weyland Electronics 500 stock tape and reel $5.26; lifecycle "Production" updated 3 weeks ago. https://octopart.com/part/sharp/LS013B7DH03
- Mouser: LS013B7DH03 "Obsolete, Restricted availability, does not presently sell in your region" (a Mouser catalog status). https://www.mouser.com/c/?q=LS013B7DH03 . LCSC C17302968 out of stock, from $3.9155. https://www.lcsc.com/product-detail/C17302968.html
- Sharp lineup page lists the model without a status. https://global.sharp/products/device/lineup/selection/lcd/mobile/index.html . I found no Sharp EOL or last-time-buy notice; I found two material-driven PCNs (2023, 2024), which is the nearest thing to an allocation/EOL signal.
- Sharp-direct MOQ/tray size: not found except the 2,240 box.

Second-source candidates (what I saw; none is a proven drop-in):

| Part | Size | Resolution | Colour | Stock/price seen | Notes |
|---|---|---|---|---|---|
| LS013B7DH05 | 1.26 in (3.2 cm) | 144 x 168 | B/W, transflective | Octopart: Classic Components 1,142 ($12.00); Future 0 (MOQ 560, $8.23); Avnet 0 (MOQ 1,120); Arrow 0 (MOQ 1,120); LCSC C17500193 0 stock (from $7.088). https://octopart.com/part/sharp/LS013B7DH05 | 10-terminal table is **the same pin order and names** as DH03 (1 SCLK, 2 SI, 3 SCS, 4 EXTCOMIN, 5 DISP, 6 VDDA, 7 VDD, 8 EXTMODE, 9 VSS, 10 VSSA); VDD/VDDA 2.7-3.3 V. https://cdn.eicom.ru/media/PDF/6421265.pdf . Neither datasheet states pin compatibility; resolution, outline and FPC geometry differ so firmware and mechanics change. Azumo lists a 1.26 in film 11655-03_A1 as a related product. |
| LS012B7DD01 | 1.17 in | 184 x 38 | B/W | not found | Sharp line-up lists it as 184 x 38, not 1.2 in square: https://datasheet.chipsmall.com/LS012B7DD01/238235.pdf ; Mouser brochure agrees: https://www.mouser.com/pdfdocs/Sharp_Memory_LCD_Brochure_2015746065.PDF . Not a substitute. |
| LS013B7DH06 | 1.33 in | 128 x RGB x 128 | **8-colour** | Octopart: C Plus Electronics "Contact", no price; DigiKey lists it as 1.28 in 128x128 FPC. https://octopart.com/part/sharp-microelectronics/LS013B7DH06-DU | Input voltage listed as **5 V**, interface 3 V serial (chipsmall PDF). Different supply; not a drop-in on a 3.0 V rail. |
| LS011B7DH03 | 1.08 in | 160 x 68 | B/W | not found | Sharp line-up only. |
Fix: treat the 128 x 128 panel as single-source. Order enough panels for the whole pilot run in one buy (DigiKey qty 100 is $7.9728) and plan to qualify DH05 (pin order identical) only if a layout/firmware change is acceptable.

### 8. MINOR: R6 732 k, stock conflict, and the 4.9-5.1 V window cannot be guaranteed by any divider
- LCSC C27016: procurement.md read **200** in stock; today's page meta says **25,100 in stock, "from $0.0029"** https://www.lcsc.com/product-detail/C27016.html . I cannot reconcile the two; JLCPCB page shows Extended, no stock. https://jlcpcb.com/partdetail/C27016
- TPS61023 datasheet: VREF **580 / 595 / 610 mV (PWM)**, FB leakage 4 nA typ / 20 nA max, R2 < 300 k, typical application is exactly 732 k / 100 k = 4.95 V. https://www.ti.com/lit/ds/symlink/tps61023.pdf
- Worst case for 732k/100k with 1% resistors: 0.58 x (1 + 7.32 x 0.99/1.01) = **4.74 V** to 0.61 x (1 + 7.32 x 1.01/0.99) = **5.17 V**. The brief's 4.9-5.1 V target is tighter than VREF tolerance alone (4.826 to 5.075 V with ideal resistors), so no resistor pair can guarantee it. MAX30101 green LED VLED+ spec is 4.5 / 5.0 / 5.5 V; red and IR are specified 3.1 / 3.3 / **5.0 max**, abs max 6.0 V (analog.com datasheet). So the green LED is safe across the spread; a 5.17 V rail slightly exceeds the red/IR spec (a MINOR). https://www.analog.com/media/en/technical-documentation/data-sheets/max30101.pdf
- Stocked alternative that keeps 4.95 V: **1.1 M (UNI-ROYAL 0402WGF1104TCE, C133039, 79,400 in stock, Extended)** over **150 k (0402WGF1503TCE C25755, already in the BOM as R2)**: 0.595 x (1 + 1100/150) = **4.958 V**, worst case 4.75 to 5.17 V. https://www.lcsc.com/product-detail/C133039.html ; https://jlcpcb.com/partdetail/C133039 . This swaps one Extended line (732 k) for another (1.1 M), so no fee change, and it removes the 200-piece stock dependence. A 750 k (0402WGF7503TCE): no LCSC number found (Octopart shows no listing).

### 9. MINOR: NTC RT1 is "Not For New Designs" at DigiKey
DigiKey NCP15XH103F03RC page: status **"Not For New Designs"**, B25/50 3380 K, 1%. LCSC C77131: 297,650 in stock, from $0.0073. BOM.csv has $0.03 / $0.02 (est), about 4x too high but trivial. https://www.digikey.com/en/products/detail/murata-electronics/NCP15XH103F03RC/1644666 ; https://www.lcsc.com/product-detail/C77131.html . Fix: pick the active Murata successor (the NCP15XH103D03RC / NCP15XH103J03RC family appeared in search; status not read) before a volume build.

### 10. MINOR: TDK inductors: BOM "est" prices are low; Mouser has the 2.2 uH on backorder
- MLP2012H2R2MT0S1 (L1, L2) LCSC C383369: 70,775 in stock, MOQ 5, full reel 4,000; $0.0832 @5, $0.0700 @50, $0.0635 @150, $0.0586 @500, $0.0532 @2,500 (page applies a 1% discount: $0.0824, $0.0693, $0.0629, $0.0581). BOM has $0.05 / $0.03. https://www.lcsc.com/product-detail/C383369.html
- Mouser 810-MLP2012H2R2MT0S1: **0 stock, 23,980 on order, first due 2/1/2027**, 10-wk lead; $0.23 @1, $0.19 @10, $0.157 @100, $0.129 @1000, reel 4,000 $0.106; page notes possible 8% tariff for US shipments. https://www.mouser.com/c/?q=MLP2012H2R2MT0S1
- DigiKey UK MLP2012H2R2MT0S1: Active, 58,605 in stock, 10-wk, GBP 0.17 @1, 0.1151 @100, 0.10044 @500 (GBP, ex VAT); USD table cut off. https://www.digikey.co.uk/en/products/detail/tdk/MLP2012H2R2MT0S1/4327857
- MLP2012H1R0MT0S1 (L3) LCSC C307742: 7,025 in stock, MOQ 5; $0.0852 @5, $0.0671 @50, $0.0580 @150, $0.0513 @500, $0.0458 @2,500. https://www.lcsc.com/product-detail/C307742.html . Mouser (via Octopart) 5,982 in stock, $0.240 @1, $0.161 @100, $0.143 @1000. https://octopart.com/part/tdk/MLP2012H1R0MT0S1
- Isat of the TDK parts is not published (carried over from procurement.md).

### 11. MINOR: Raytac MDBT50Q-1MV2 BOM price and sourcing
- DigiKey (marketplace, ships from Raytac): **$6.15 @1, 18 in stock, ~14 days, $25.00 flat shipping**, Active, retail package; other breaks cut off. https://www.digikey.com/en/products/detail/raytac/MDBT50Q-1MV2/13677591 (this beats the BOM's SparkFun $8.95).
- SparkFun WRL-21605: in stock (qty not shown), $8.95 / $8.50 @25 / $8.06 @100, volume form above that. https://www.sparkfun.com/nordic-nrf52840-ble-module-mdbt50q-1mv2.html
- X-ON: 494 stock, $12.208 @1, $9.422 @2, $8.918 @6, $8.904 @25, $8.82 @176, MOQ 1. https://www.xonelec.com/mpn/raytaccorporation/mdbt50q1mv2
- LCSC C5118826 out of stock, from $18.6021. LionCircuits out of stock (INR 2,611 @1). Mouser shows only Adafruit 4078 (a breakout, $12.95, 0 stock) not the bare module. Octopart: "We don't have any listings for this part".
- **Raytac's own minimum order: not found.** raytac.com contact page gives sales@raytac.com, +886-2-32340208, replies within 5 business days, and a distributor page (contents not retrieved). https://www.raytac.com/contact/index.php
- Sources are a handful of marketplace/retail lots (18, 494); a 100-unit run needs a direct quote or a distributor order.

### 12. MINOR: JLCPCB Extended-part fee is stated three different ways
- JLCPCB assembly price page: "feeder loading $3.07 (extended)" for Economic and **$1.53 (basic/extended) for Standard**; Standard setup $25.56 single / **$51.12 double-sided**; stencil $8.21 / **$16.42 double-sided**; handling >= $14.93; $0.0016/joint SMT; $0.48/board single-board surcharge; packing $0.50 + $0.00003 x area (cm2); hand soldering $3.58 per order; $0.45 to confirm parts placement. https://jlcpcb.com/help/article/pcb-assembly-price
- JLCPCB FAQ: "we charge $3 per extended component" (not stated per unique part or per placement). https://jlcpcb.com/help/article/98-PCB-Assembly-FAQs
- Third party (techoverflow, modified 2026-10-20): extended fee cut to $1.50 per component type on 2025-12-19, previously $3. https://techoverflow.net/2024/04/09/jlcpcb-pcba-assembly-price-overview/
- procurement.md and the revA report use $3/line. With 15 Extended lines the spread is $22.95 vs $45. Used $1.53 below (JLCPCB's own price page); confirm in the cart.
- JLCPCB assembly page: "from 2 boards", banner "No setup fee" conflicts with "$8 setup" (Economic). Economic's single-sided limit is not stated on the pages read, so I priced Standard double-sided. https://jlcpcb.com/pcb-assembly
- 6-layer capabilities: 0.8 mm available; ENIG supported; HASL not supported on 6+ layers; via-in-pad default; multilayer minimum via 0.15/0.25 mm; ENIG area surcharge only above 30% copper-area-of-finish. https://jlcpcb.com/capabilities/pcb-capabilities ; https://jlcpcb.com/help/article/in-what-cases-will-there-be-charged-extra . JLCPCB notice dated Aug 06, 2026: 6-layer and above standard lead time about 5 days longer for about 15 days (not an unlimited change). https://jlcpcb.com/news/pcb-lead-time-and-price-adjustment-august2026
- **PCB fabrication price for 32 x 36 mm 6-layer 0.8 mm ENIG: not found.** jlcpcb.com/pcb-quote and multilayer-pcb failed to load; PCBWay multilayer page failed. JLCPCB 6-layer page: "starts from $2" for 5 pcs (marketing); the Nov 2022 offer was "$2 for 5pcs 6-8 Layer ... (5x5cm, ENIG, Via-in-Pad)" but the page is inconsistent (also titled "free") and has no end date. https://jlcpcb.com/6-layer-pcb ; https://jlcpcb.com/news/special-offer-6-8-layer-high-precision-pcbs . A third-party article (atlaspcb via DEV, undated year) gives 6L generic: 5 pcs $30-42, 50 pcs $14-20, 500 pcs $5-8 per board. https://dev.to/abc_8b09c7009ee0029b85665/multilayer-pcb-cost-breakdown-4-layer-vs-6-layer-vs-8-layer-2026-pricing-e75 . PCBWay published: "PCB Assembly Only 29$ for 20pcs", stencil $10 (190 x 290 mm) to $15; bare PCB $5 for 10 pcs (1-14 layers, marketing); no setup, per-part, or double-sided fee on the pages read. https://www.pcbway.com/pcb-assembly.html

### 13. MAJOR (cost model): JLCPCB US tariff is pre-collected at 35% on PCB and PCBA
JLCPCB Customs FAQ (page says "Last updated on Oct 29, 2026"; rate table is an image): Provisional tariff 10% (Feb 24 to Jul 24, 2026), Section 122 12.5% official but JLC sets 10% from Jul 24, 2026, Section 301 25%, regular 0 to 7.5%, **total "about 35%~92.5%"**; individuals must use DDP (taxes pre-collected at checkout), companies DDP or CPT; DHL/UPS/FedEx Express only for US (no postal). https://jlcpcb.com/help/article/us-tariff-policy-faq . Logistics update dated March 17, 2026: **PCB 35.00%, SMT (PCBA) 35.00%**, stencils 90%, FA 55%. https://jlcpcb.com/news/logistics-update-us-china-tariff . Base for the percentage (order value vs. goods value): not stated. Shipping price to US: **not found**. Mouser notes a possible 8% tariff on the TDK inductor and 11% on a MAXM86161 eval kit shipped to the US.
BOM.csv covers parts only, so the manufacturing cost model is absent from the BOM; the table below adds it.

---

## Cost table (per delivered unit, USD)

Assumptions: Standard double-sided assembly at JLCPCB; 15 Extended lines; about 232 solder joints on 56 placed parts (my count from the design: module 61 pads, nPM1300 33, MAX30101 14, LGA 12, FPC 12, button 4, SOT/SOD 18, crystal 2, passives about 76; estimate); battery, motor, display hand-fitted by me; U1 Raytac consigned (bought in US, no duty); everything else sourced by JLCPCB; US DDP duty = 35% x (PCB + assembly + JLCPCB-sourced parts), basis assumed. Components use the corrected prices above. "seen" and "est" per column. Row 1 is not orderable at JLCPCB (5-board PCB minimum seen in procurement notes; PCBA "from 2"): it is the cost of a 2-board order where one board is used.

| Qty | Components on board incl. U1, ex battery/motor (seen; passives est) | Display (seen) | Battery + motor (seen) | PCB fab (est) | Assembly (fees seen; joint count est) | Shipping (est) | Duty 35% (rate seen, basis est) | Total per unit without display | With display |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 27.91 | 12.39 | 6.94 | 45.00 (5-board order) | 108.12 (fixed 105.42 + 2 boards) | 30.00 | 66.86 | **303.80** (incl. spare-board parts $19.0) | **316.19** |
| 5 | 26.66 | 12.39 | 6.94 | 9.00 | 22.44 | 6.00 | 17.20 | **88.24** | **100.63** |
| 25 | 23.77 | 9.60 | 6.35 | 3.80 | 5.57 | 1.60 | 8.62 | **49.71** | **59.31** |
| 100 | 22.34 | 7.97 | 5.75 | 2.20 | 2.41 | 0.70 | 6.61 | **40.01** | **47.98** |
| 500 | 21.77 | 7.74 | 5.75 | 1.40 | 1.56 | 0.40 | 5.84 | **36.72** | **44.46** |

Component column breakdown (seen unless noted): U1 $8.95 / 8.95 / 8.50 / 8.06 / 8.06 (SparkFun; 500 est); U2 Mouser $3.42 / 3.42 (5 not listed) / 2.33 / 2.09 / 1.90 (500 est); U3 DigiKey 13.72 / 12.462 / 11.432 / 10.6974 / 10.3428; U4 LCSC $0.495 flat ("from", LCSC-only; $1.79 / $1.59 / $1.36 / $1.30 / $1.19 at Mouser); inductors LCSC breaks; NTC $0.0073; other passives/diodes/FETs/FPC/button/crystal from BOM.csv ($1.07 @1-5, $0.80 @25+; "est" for the 0.003-0.01 passives, "from-price" for the rest). Battery Adafruit 1317 $5.95 / 5.36 (10-99) / 4.76 (100+); motor $0.99 (DigiKey, other breaks not shown); display DigiKey $12.39 / 9.60 (10) / 7.9728 (100) / 7.7443 (500). Corrected on-board totals with battery and motor: **$34.85 @1, $33.60 @5, $30.12 @25, $28.09 @100, $27.52 @500**; with display **$47.24 / 45.99 / 39.72 / 36.06 / 35.26**. Against the CSV's $36.52 / $29.46 (no display) and $48.91 / $37.43 (with display): about -$1.7 @1 and -$1.4 @100 net (U3 and inductor/NTC corrections, offset by nPM1300 and LCSC U4). If U4 and U2 are bought at Mouser and U1 at DigiKey ($6.15), on-board with battery and motor is $33.35 @1 / $26.98 @100 (my arithmetic).
PCB column: estimate only (no calculator result obtained); at 5 pcs the three sources I read span "$2 promo" to "$30-42"; the 500-unit figure is lower than the third-party $5-8 because the board is about 1/9 of a 100 x 100 mm board (still an estimate).
Spend that is not per unit, one-time (seen): nRF52840-DK $48.95 (DigiKey, 548 stock, 16 wk), nPM1300-EK $64.35 (DigiKey, 168 stock, 16 wk; $64.15 @20, $64.05 @100), Raspberry Pi Debug Probe SC0889 $12.00 (DigiKey; CMSIS-DAP fit with nRF52840/Zephyr not checked), pogo pins P75-B1 10-pack $4.95 (Adafruit); J-Link EDU Mini $75.95 is non-commercial only (procurement.md). Pogo-pin jig: not found, est $20-50 of materials. Seen one-time total without jig: **$130.25** (DK + EK + probe + pogo pins); with J-Link instead of the Pi probe $194.20. JLCPCB stencil, setup, handling and the Extended fees are already in the assembly column as order-level amounts ($105.42 per order).

---

## Compliance cost and steps if sold in the USA (seen)

1. FCC Part 15B host (unintentional radiator) with a certified module: Digi: **$1,500 to $2,500**, about a day; self-declaration allowed for Part B; host still needs Class A/B testing; module FCC ID covers 15.247 only (page last updated May 23, 2025). https://www.digi.com/support/knowledge-base/fcc-modular-approval . compliancetesting.com (page modified 2026-11-05): verification/SDoC **$1,900 to $5,000**; certification with pre-certified radio module **$4,900 to $10,000**; unlicensed transmitter certification $7,900 to $12,000; "starting points". https://compliancetesting.com/fcc-certification-faqs/fcc-certification-cost/ . Also finding 4 (5 mm body separation; "Limited Single Modular" grant): may add an RF exposure evaluation, cost not found. Labels: "Contains FCC ID: SH6MDBT50Q" and IC ID; user manual must not describe module removal.
2. Bluetooth SIG: **$12,000 Adopter / $8,000 first listing Contributing Adopter / $6,000 Associate** per qualification, effective 2026-03-01; dues separate. Zephyr vanilla vs NCS: finding 5. Reusing the Zephyr host DN Q385945 helps the host part only; controller needs NCS SoftDevice Controller DN (Q390989 on NCS 3.3.1) or a controller test.
3. Battery UN38.3 (49 CFR 173.185(a)(3)): cell/battery manufacturer and each subsequent distributor must make a test summary available; elements: manufacturer name and contacts, test laboratory name and contacts, unique report ID, report date, description (chemistry, mass, Wh, model number), list of tests and pass/fail, reference to the UN Manual edition and amendments, name and title of a responsible person; small lithium-ion cell limit 20 Wh (a 150 mAh cell is about 0.6 Wh). https://www.law.cornell.edu/cfr/text/49/173.185 . Adafruit 1317: page links a UN38.3 test report (https://cdn-shop.adafruit.com/product-files/1317/1317_LP402025+UN38.3.pdf), a datasheet and an MSDS, but does not name the cell manufacturer and does not mention IEC 62133 or UL (I did not open the report PDF). https://www.adafruit.com/product/1317 . For a product you sell, get the summary in your name chain from the cell maker, not only the retailer.
4. IEC 62133: not required by 49 CFR 173.185; test cost per Epec (pack maker): UN38.3 **$5,000-$7,000**, 4-6 weeks, 16 packs; IEC (62133, CB) **$6,000-$10,000**, 6-8 weeks, 33 sealed + 11 open; UL 2054/1642 $15,000-$20,000. https://www.epectec.com/batteries/battery-pack-certifications.html . JJR lab (2024-05-06): UN38.3 $250 per model for <=100 Wh, $1,700 per model above (table layout unclear). https://www.jjrlab.com/news/how-much-does-un383-testing-cost.html . Whether a US retailer or customer will demand IEC 62133 or UL: not found.

---

## 6. The three purchases that retire the most risk per dollar (all seen prices)

1. **One bonded frontlit display: Azumo 11049-06_T7 (ichome $32.08, or via Azumo "Where to Buy") plus one bare Sharp LS013B7DH03 ($12.39 DigiKey), about $45.** Retires: whether the front light is film or module (finding 6), LED Vf and current for R13/J2, FPC contact side and orientation of the panel (known open item), and gives a DH03 in hand to test the display driver. Fallback if T7 is unobtainable: DigiKey 11049-06_A1 film $47.87 is not a usable prototype by itself.
2. **nPM1300-EK, $64.35 (DigiKey, 168 in stock).** The PMIC is the board's most connection-sensitive part and the unread reference schematic, strap values and unused-pin handling are the open items; the EK gives a working reference to probe against before any rev B board is built.
3. **nRF52840-DK, $48.95 (DigiKey, 548 in stock), with 5 x MAX30101EFD+T at DigiKey $62.31 ($12.462 each) only if a bare chip is needed for the first boards.** The DK lets the Zephyr app run on real silicon and a MAX30101 breakout (SparkFun 16474 is listed on DigiKey; price not seen) plus the DK tests heart rate on a wrist before the board is ordered. 
Cheap add-on while LCSC stock lasts: 10 x LIS2DH12TR (about $5) and 10 x LIS2DW12TR C189624 (about $6), since LIS2DH12 LCSC stock is 297 and US stock is zero until April 2027.

---

## Checked and found correct
- BOM totals reproduce: $36.52 @1 and $29.46 @~100 from docs/BOM.csv (arithmetic only).
- LS013B7DH03 FPC pin table (10 pins, SCLK, SI, SCS, EXTCOMIN, DISP, VDDA, VDD, EXTMODE, VSS, VSSA) matches the datasheet pin order used in design notes; datasheet speaks only of a backlight (0.2% transmissive), not a front light. https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf
- TPS61023 VREF 595 mV typ and the 732 k / 100 k 4.95 V application are in the TI datasheet.
- MAX30101 package 5.6 x 3.3 x 1.55 mm, 0.8 mm pitch, 14 pins; the pinout in design.py:90-93 (SCL 2, SDA 3, PGND 4, VLED+ 9/10, VDD 11, GND 12, INT 13) matches the datasheet table; VDD 1.7-2.0 V so the 1.8 V BUCK1 supply is in range.
- LIS2DH12 net list in design.py:80-84 is valid for LIS2DH12, LIS2DE12 and LIS2DW12 (finding 2).
- DFRobot FIT0774 $0.99, nRF52840-DK $48.95, nPM1300-EK $64.35, Adafruit 1317 prices match procurement.md (EK and DK re-read today for DigiKey; DK and 1317 price breaks carried from procurement.md).
- Murata NCP15XH103F03RC is 10 k, B 3380 K, 1%, 0402 (status caveat in finding 9).
- JLC 6-layer: 0.8 mm and ENIG supported in the capabilities page; Extended count of about 15 lines remains as stated in procurement.md section 5 (not re-derived).
