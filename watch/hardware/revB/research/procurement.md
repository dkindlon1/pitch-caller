# Rev B procurement verification (seen 2026-11-23)

Method: WebFetch of LCSC, JLCPCB partdetail, DigiKey, Future, Murata/TDK, Azumo, Adafruit, SparkFun pages today. "not shown" = the page text I received did not contain it. LCSC pages give only a "from" price and a stock number (from page metadata), not price breaks; JLCPCB pages give Basic/Extended but not stock or price. Mouser product pages failed to load (client error) so no Mouser stock/price was read. Newark search is robots-blocked. Arrow page loaded as an empty shell.

## 1. Machine-placed parts: C-number vs MPN

JLC = JLCPCB library type read on jlcpcb.com/partdetail/Cxxxx. LCSC stock/price from lcsc.com/product-detail/Cxxxx.html metadata.

| Ref | MPN in design.py | C-number | Result | Package | JLC | LCSC stock / from-price | URL |
|---|---|---|---|---|---|---|---|
| C2,C13,C15,C17,C21,C22 | CL05B104KO5NNNC | C1525 | matches (JLC page) | 0402 | Basic | not re-read | https://jlcpcb.com/partdetail/C1525 |
| C11,C14,C23 | CL05A105KA5NQNC | C52923 | matches | 0402 | Basic | not re-read | https://jlcpcb.com/partdetail/C52923 |
| C1,C5-C10,C16,C18-C20 | CL10A106KP8NNNC | C19702 | matches | 0603 | Basic | not re-read | https://jlcpcb.com/partdetail/C19702 |
| Y1 | Q13FC13500004 | C32346 | matches | SMD3215-2P | Basic | not re-read | https://jlcpcb.com/partdetail/C32346 |
| C3,C4 | CL05C180JB5NNNC | C307443 | matches | 0402 | Extended | not re-read | https://jlcpcb.com/partdetail/C307443 |
| D2,D3 | PESD5V0S1BA | C2985486 | matches | SOD-323 | Extended | not re-read | https://jlcpcb.com/partdetail/C2985486 |
| SW1 | SKRTLAE010 | C110293 | matches | SMD 4.5x3.4 | Extended | not re-read | https://jlcpcb.com/partdetail/C110293 |
| R5,R7-R10,R14,R15 | 0402WGF1003TCE | C25741 | matches | 0402 | Basic | not re-read | https://jlcpcb.com/partdetail/C25741 |
| Q1,Q2 | AO3400A | C20917 | matches | SOT-23 | Basic | not re-read | https://jlcpcb.com/partdetail/C20917 |
| D1 | 1N4148WS | C2128 | matches | SOD-323 | Basic | not re-read | https://jlcpcb.com/partdetail/C2128 |
| J1 | FH12-10S-0.5SH(55) | C506791 | matches | SMD 0.5 mm right angle | Extended | not re-read | https://jlcpcb.com/partdetail/C506791 |
| R16 | 0402WGF1002TCE | C25744 | matches | 0402 | Basic | not re-read | https://jlcpcb.com/partdetail/C25744 |
| R13 | 0402WGF470JTCE | C25118 | matches (47 ohm) | 0402 | Extended | not re-read | https://jlcpcb.com/partdetail/C25118 |
| R1 (UNVERIFIED) | 0402WGF4702TCE | C25792 | CORRECT: 47k 1% UNI-ROYAL | 0402 | Basic | 3,151,300 / $0.001 | https://www.lcsc.com/product-detail/C25792.html ; https://jlcpcb.com/partdetail/C25792 |
| R2 (UNVERIFIED) | 0402WGF1503TCE | C25755 | CORRECT: 150k 1% UNI-ROYAL | 0402 | Extended | not read | https://jlcpcb.com/partdetail/C25755 |
| R3,R4 (UNVERIFIED) | 0402WGF4701TCE | C25900 | CORRECT: 4.7k 1% UNI-ROYAL | 0402 | Basic | not read | https://jlcpcb.com/partdetail/C25900 |
| R12 DNP, R11 (UNVERIFIED) | 0402WGF0000TCE | C17168 | CORRECT: 0 ohm UNI-ROYAL | 0402 | Basic | not read | https://jlcpcb.com/partdetail/C17168 |
| C12 (UNVERIFIED) | CL21A106KAYNNNE | C15850 | CORRECT: 10 uF 25 V X5R 0805 Samsung | 0805 | Basic | 1,583,100 / $0.0159 | https://jlcpcb.com/partdetail/C15850 ; https://www.lcsc.com/product-detail/C15850.html |
| RT1 (UNVERIFIED) | NCP15XH103F03RC | C77131 | CORRECT: 10k 1% Murata, B 3380 (25/50) | 0402 | Extended | not read | https://jlcpcb.com/partdetail/C77131 |
| U5 (UNVERIFIED) | TPS61023DRLR | C919459 | CORRECT | SOT-563 | Extended | 134,550 / $0.1141 | https://www.lcsc.com/product-detail/C919459.html ; https://jlcpcb.com/partdetail/C919459 |
| U4 (UNVERIFIED) | LIS2DH12TR | C110926 | CORRECT | LGA-12 2x2 | Extended | 1,485 / $0.495 (research/sensors.md read 58,867 earlier; stock dropped) | https://www.lcsc.com/product-detail/C110926.html ; https://jlcpcb.com/partdetail/C110926 |
| U3 (UNVERIFIED) | MAX30101EFD+T | C2859066 | CORRECT | OLGA-14 3.3x5.6 | Extended | 53 / $5.2405 | https://www.lcsc.com/product-detail/C2859066.html ; https://jlcpcb.com/partdetail/C2859066 |
| U2 (UNVERIFIED) | NPM1300-QEAA-R7 | C7501206 | CORRECT | QFN-32-EP 5x5 | Extended | 921 / $2.3189 (earlier note said 0 stock) | https://www.lcsc.com/product-detail/C7501206.html ; https://jlcpcb.com/partdetail/C7501206 |
| U1 | MDBT50Q-1MV2 | C5118826 | matches | module | Extended | OUT OF STOCK / from $18.6021 | https://www.lcsc.com/product-detail/C5118826.html ; https://jlcpcb.com/partdetail/C5118826 |

No C-number in the file was wrong. Corrections needed in design.py are the blanks (section 2) and one wrong URL:
- U3 `src=` URL https://www.digikey.com/en/products/detail/analog-devices-inc-maxim-integrated/MAX30101EFD-T/6188734 is the page for **MAX30102EFD+T** (stock 0, 33 weeks, $13.89 @1). The MAX30101EFD+T page is .../MAX30101EFD-T/6188733. The "DigiKey 5,962 in stock" figure in research/sensors.md and the U3 desc could not be reproduced (DigiKey 6188733 text showed title MAX30101EFD+T, 10-week lead, but no stock or price in what I received).
- U1 is not hand=True but cannot be bought through LCSC; it must be consigned or hand-fitted.

## 2. Blank fills

### (a) 2.2 uH buck inductors L1, L2
| Option | MPN | LCSC | JLC | DCR | Isat / rating | Size, height | Stock / price | URL |
|---|---|---|---|---|---|---|---|---|
| **Recommended** | Murata DFE201610E-2R2M=P2 | **C337891** | Extended | 140 mohm (DigiKey UK/Future: 140 mohm max) | Isat 2.4 A, rated 1.7 A (LCSC); Future page shows 1.7 A and 2.4 A, conflict between rows | 2.0 x 1.6 mm, shielded metal alloy, "0806". Height not shown on any 2.2 uH page I read; the 1R0 sibling in the same series lists 1.00 mm max at DigiKey | LCSC 4,130 / from $0.0686; Future 3,000 in stock, $0.22 @3,000 MOQ 3,000, 30 wk, Active | https://lcsc.com/product-detail/Inductors-SMD_Murata-Electronics-DFE201610E-2R2M-P2_C337891.html ; https://jlcpcb.com/partdetail/C337891 ; https://www.futureelectronics.com/p/passives--inductors--rf-inductors/dfe201610e-2r2m-p2-murata-1116637 |
| Footprint-compatible fallback | TDK MLP2012H2R2MT0S1 | C383369 | Extended | 150 mohm typ, 195 mohm max | rated current 1 A at 40 K rise; **Isat not stated** (TDK gives DC-bias graph only) | 0805 (2.0 x 1.25), 1.0 mm max | LCSC 70,775 / $0.0832 @5, $0.0508 @4,000 | https://www.lcsc.com/product-detail/C383369.html ; https://www.farnell.com/datasheets/2041193.pdf |

Both meet DCR < 400 mohm. Only the Murata part has a published Isat >= 500 mA. Using it means changing L1/L2 footprint from 0805 to 2016 (0806); the TDK part keeps the 0805 footprint but Isat is unverified.

### (b) 1 uH boost inductor L3 (TPS61023, Isat >= 1 A)
| Option | MPN | LCSC | JLC | DCR | Isat / rating | Size, height | Stock / price | URL |
|---|---|---|---|---|---|---|---|---|
| **Recommended** | Murata DFE201610E-1R0M=P2 | **C161082** | Extended | 57 mohm max | Isat 3.6 A, rated 2.7 A | 2.0 x 1.6 mm, 1.00 mm max (DigiKey), Active, 24 wk | LCSC 18,830 / from $0.0778 | https://www.lcsc.com/product-detail/C161082.html ; https://jlcpcb.com/partdetail/C161082 ; https://www.digikey.ca/en/products/detail/murata-electronics/DFE201610E-1R0M-P2/7430535 |
| 0805 fallback | TDK MLP2012H1R0MT0S1 | C307742 | Extended | 120 mohm typ (LCSC attribute) / 156 mohm (JLC, LCSC table) | rated 1.1 A at 40 K rise; Isat not stated | 0805, 1.0 mm max | LCSC 7,025; $0.0852 @5, $0.0671 @50, $0.058 @150, $0.0513 @500 | https://www.lcsc.com/product-detail/C307742.html ; https://jlcpcb.com/partdetail/C307742 |

Using the Murata pair for L1, L2, L3 gives one footprint (2016) for all three inductors.

### (c) R6 732 k 1% 0402
- Use **UNI-ROYAL 0402WGF7323TCE, C27016**, 732 kohm 1% 0402, JLC **Extended**, LCSC stock **200** (thin; enough for a prototype run only). https://www.lcsc.com/product-detail/C27016.html ; https://jlcpcb.com/partdetail/C27016
- The design's MPN RC0402FR-07732KL (Yageo): I found no LCSC listing for it. Change the MPN in design.py to 0402WGF7323TCE.
- Check: Vout = 0.595 x (1 + 732k/100k) = 4.95 V (arithmetic, reference value from design comment, not re-read from the TPS61023 datasheet today). 1% parts across 4.9-5.1 V: 732k gives 4.95 V; a 750k pair would give 5.06 V but I did not find a stocked 750k 0402 LCSC listing (lioncircuits shows Royal Ohm 0402WGF7503TCE out of stock, no C-number), so no alternative pair is offered.

## 3. Key purchased items

### Sharp LS013B7DH03 (display) lifecycle verdict
Verdict: **not obsolete at Sharp as far as any page shows; Mouser's "obsolete / restricted" is a Mouser catalog status, and its Sharp memory-LCD landing page is dated 2015 and titled INACTIVE.** DigiKey lists it Active with ~33.5k stock. I found no Sharp end-of-life or last-time-buy notice in search. Treat the status as "Active, single-source, 28-week lead" until DigiKey confirms an order ships.

| Source | Status | Stock | Price | Lead | URL |
|---|---|---|---|---|---|
| DigiKey 425-2903-ND | Active | 33,493 | $12.39 @1, $9.60 @10, $7.9728 @100, $7.7443 @500 (no 25 break shown) | 28 wk | https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/5300387 |
| Mouser 852-LS013B7DH03 | Obsolete, Restricted Availability, "does not sell in your region" | no stock/price shown | not shown | - | https://www.mouser.com/c/?q=LS013B7DH03 ; Mouser Sharp memory-LCD page (dated 2015, "INACTIVE") https://www.mouser.in/new/sharp-microelectronics/sharpmemorylcd |
| Future Electronics 6117773 | Active | 0 | $6.54 @2,240, MOQ 2,240 | 28 wk | https://www.futureelectronics.com/p/6117773 |
| LCSC C17302968 | listed | out of stock | from $3.9155 (no breaks) | - | https://lcsc.com/product-detail/LCD-Screen_Sharp-Microelectronics-LS013B7DH03_C17302968.html |
| Octopart | "Production" (4 months ago); Future shown "restocked" | - | $6.772 single price | - | https://octopart.com/part/sharp/LS013B7DH03 |
| Arrow | page shell only, no data | not found | not found | - | https://www.arrow.com/en/products/ls013b7dh03/sharp-microelectronics |
| Newark / Farnell | not found (search blocked) | not found | - | - | - |
| Tindie (Questwise breakout) | seller on break until 2026-12-01, no shipping | - | $17.80 | - | https://www.tindie.com/products/questwise-ventures/sharp-128-ultralow-power-10ua-128x128-memory-lcd/ |
| Sharp (sharpsde.com) | not fetched | not found | - | - | - |

Stock figure history: research/display.md read 35,736; today 33,493, so DigiKey stock is moving down (orders happen).

### Azumo 11049-06_A1 (frontlit LS013B7DH03)
- DigiKey: "Optical Film 1.28" Sharp LS013B7DH03 Display", category Optical Film, Active, 247 in stock, 32 wk, $47.87 @1, $39.40 @10, $34.5147 @100, no 25/500 break. https://www.digikey.com/en/products/detail/azumo/11049-06-A1/9602607
- Azumo product page describes a frontlit **display module** with the front light optically bonded to a Sharp LS013B7DH03, with a Buy-on-DigiKey link; no direct price, no web store, contact via "Where to Buy" / "Request a Meeting". https://www.azumotech.com/products/1-28-monochrome-display-11049-06/
- Azumo 11049-06 data sheet: "module with front light", lists Sharp P/N LS013B7DH03, display thickness 1.16 mm, front-light supply 3.0 V, 6-75 mW, 51 nits at 60 mW; LED Vf/If not given. https://pages.azumotech.com/hubfs/Data%20Sheets/1.28%2011049-06%20Data%20Sheet.pdf
- Azumo FLP data sheet 12367-01 (11049-xx): "front light film", 0.05 mm, LED 5 mA typ / 25 mA abs max / 80 mA pulse, Vf not stated, 1.00 mm pitch +/- contacts; 11049-06 is "FLAT ROLL", marked PRELIMINARY. https://www.azumotech.com/uploads/2020/03/12367-01_T5_Sharp-1.28_11049-xx_FLP-Data-Sheet.pdf
- **Unresolved:** the DigiKey category (film) and one data sheet say film only; the product page and the other data sheet say complete module. DigiKey price $47.87 vs $12.39 bare panel does not settle it. Order qty 1 or ask Azumo before committing the J2 design. LED Vf is not published, so R13 = 47 ohm stays unconfirmed.
- Other purchasable frontlit/backlit 1.28 in memory LCD: none found. Sharp's own page says LS013B7DH03 supports backlit transmissive mode (0.2%) but lists no backlit part number.

### Nordic nPM1300 and EK
| Item | Where | Status / stock | Price | Lead | URL |
|---|---|---|---|---|---|
| NPM1300-QEAA-R7 | DigiKey (4823-NPM1300-QEAA-R7CT-ND) | Active; stock and price not captured | not shown | 16 wk | https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-QEAA-R7/19722485 |
| NPM1300-QEAA-R7 | LCSC C7501206 | 921 | from $2.3189 | - | https://www.lcsc.com/product-detail/C7501206.html |
| NPM1300-QEAA-R7 | Mouser | page failed to load | not found | - | - |
| NPM1300-EK | DigiKey | Active, 168 in stock | $64.35 @1 | 16 wk | https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-EK/19722486 |

### Raytac MDBT50Q-1MV2 / Insight SiP ISP1807
| Item | Where | Status / stock | Price | URL |
|---|---|---|---|---|
| MDBT50Q-1MV2 | SparkFun WRL-21605 | in stock (qty not shown) | $8.95 @1, $8.50 @25+, $8.06 @100+ | https://www.sparkfun.com/nordic-nrf52840-ble-module-mdbt50q-1mv2.html |
| MDBT50Q-1MV2 | LCSC C5118826 | out of stock | from $18.6021 | https://www.lcsc.com/product-detail/C5118826.html |
| MDBT50Q-1MV2 | X-ON, DigiKey marketplace | from revA review (not re-read today): X-ON 494 stock $12.21 @1; DigiKey "no longer available" | - | research in ../revA_2026-11-23/reviews/procurement.md |
| ISP1807-LR-RS | DigiKey (1786-1019-x-ND) | Active, 4 wk lead; stock and price not captured. Eval board ISP1807-LR-TB also listed | not shown | https://www.digikey.com/en/products/detail/insight-sip/ISP1807-LR-RS/10231699 |
| ISP1807-TT | not found anywhere | - | - | - |

### Other ICs on DigiKey
| Item | Status / stock | Price | Lead | URL |
|---|---|---|---|---|
| LIS2DH12TR | Active, 0 in stock (backorder) | not shown | 24 wk | https://www.digikey.com/en/products/detail/stmicroelectronics/LIS2DH12TR/4899838 |
| TPS61023DRLR | Active; stock/price not captured | not shown | 26 wk | https://www.digikey.com/short/3ft719b2 (title TPS61023DRLR) |
| MAX30101EFD+T | title confirmed; stock/price/status not captured | not shown | 10 wk | https://www.digikey.com/en/products/detail/analog-devices-inc-maxim-integrated/MAX30101EFD-T/6188733 |
| MAX30101ACCEVKIT# | **Obsolete** ("no longer manufactured") | not shown | - | https://www.digikey.com/en/products/detail/analog-devices-inc-maxim-integrated/MAX30101ACCEVKIT/6123034 |
| SparkFun MAX30101 breakout (16474) | listed on DigiKey, not opened | - | - | https://www.digikey.com/en/products/detail/sparkfun-electronics/16474/12686341 |

LCSC is the only source in this pass with a MAX30101EFD+T stock number (53), which is thin for a build of more than a few boards.

### Batteries (all with protection circuit)
| Cell | Size (mm) | Capacity | Datasheet / source | Price, stock | Fits 20 x 26 | URL |
|---|---|---|---|---|---|---|
| Adafruit 1317 (402025 + PCM) | 19.75 x 26.02 x 3.8, 4.65 g | 150 mAh | C1515 datasheet at Adafruit | $5.95 @1, $5.36 @10-99, $4.76 @100; in stock; charge <= 150 mA, 100 mA suggested; no thermistor; JST-PH lead | yes | https://www.adafruit.com/product/1317 |
| SparkFun PRT-13853 (DTP401525) | 4.0 max thick x 15 x 25 max | 110 mAh | DW01+ / 8205 PCM; charge 1C max (110 mA); cut-off 2.8 V | $7.53; in stock; JST-PH | yes, smaller footprint, not thinner (4.0 vs 3.8) | https://www.sparkfun.com/products/13853 ; http://cdn.sparkfun.com/datasheets/Prototyping/spe-00-DTP401525-110mah-en-1.0ver.pdf |
| DNK302030 (thinner option) | 3.0 x 20 x 32 | 120 mAh | PCM, charge 0.2C rec / 0.5C max | price not found | **no, 32 mm long** | https://www.dnkpower.com/wp-content/uploads/2023/11/DNK302030-3.7V-120mAh-Lipo-Battery-Specification.pdf |
| Ampul 502025 | 5 x 20 x 25, 6 g | 200 mAh | page only, no datasheet link, connector not stated | 5.63 EUR ex VAT; in stock | yes (5 mm thick) | https://ampul.eu/en/battery/3839-li-pol-battery-200mah-37v-502025 |
| Hypercell HPL402323-2C | 4.2 x 23.5 x 24.5 | 190 mAh | Mikroe datasheet, PCM (Seiko G3J), 0.5C/1C charge | price not found | **no, 23.5 mm wide** | https://download.mikroe.com/documents/datasheets/Hypercell HPL402323-2C-3.7V-190mAh - datasheet.pdf |

I did not find a protected cell around 100-120 mAh that is both thinner than 3.8 mm and no longer than 26 mm with a datasheet.

### DFRobot FIT0774 motor
DigiKey: Active, 2,683 in stock, $0.99 @1 (other breaks not shown), 9 wk lead, 3 VDC ERM, 10 x 2.7 mm, wire leads, bulk. https://www.digikey.com/en/products/detail/dfrobot/FIT0774/14322639

## 4. Development tools
| Tool | Where | Price | Stock / note | URL |
|---|---|---|---|---|
| nRF52840-DK | DigiKey | $48.95 @1 | 548 in stock, 16 wk | https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NRF52840-DK/8593726 |
| J-Link EDU Mini | Adafruit 3571 | $75.95 | in stock; **non-commercial use only**, no support | https://www.adafruit.com/product/3571 |
| J-Link EDU Mini | SEGGER US shop 8.08.91 | $76.00 (-5% at 10+) | in stock; "not sold to companies" | https://shop-us.segger.com/product/j-link-edu-mini-8-08-91/ |
| J-Link EDU Mini | SparkFun | $60 | retired, out of stock | https://www.sparkfun.com/segger-j-link-edu-mini.html |
| Raspberry Pi Debug Probe SC0889 | DigiKey | $12.00 @1 | 2,750 in stock, 22 wk nominal | https://www.digikey.com/en/products/detail/raspberry-pi/SC0889/17877576 |
| nPM1300-EK | DigiKey | $64.35 | 168 in stock | https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-EK/19722486 |
| Pogo pins P75-B1 needle head, 10 pack | Adafruit 2430 | $4.95 (1-9), $4.46 (10-99), $3.96 (100+) | 74 in stock; 1 mm body, 0.7 mm head, 16 mm / 13 mm compressed | https://www.adafruit.com/products/2430 |
| Pogo-pin clamp for 2 mm pads | not found as a product; build a jig around P75-B1 | - | - | - |

Note: the Raspberry Pi Debug Probe is CMSIS-DAP (SWD); its fit with the nRF52840 and Zephyr was not checked here. A fetch of a guessed DigiKey URL for SC0889 earlier returned an unrelated page and was discarded; the table uses the URL from search results.

## 5. JLCPCB Extended count
Distinct machine-placed BOM lines (26, plus U1 if it is placed from consignment = 27).

Extended (14, +U1 = 15): C307443 18 pF, C7501206 nPM1300, L1/L2 inductor (C337891 or C383369), C25755 150k, C77131 NTC, C2985486 TVS, C110293 button, C110926 LIS2DH12, C2859066 MAX30101, C919459 TPS61023, L3 inductor (C161082 or C307742), C27016 732k, C506791 FPC connector, C25118 47R; U1 C5118826.

Basic (12): C1525, C52923, C19702, C32346, C15850, C25792, C25900, C25741, C17168, C20917, C2128, C25744.

Basic substitutes that leave the design unchanged:
- 18 pF load caps C3/C4: 22 pF 0402 C0G **C1555** (0402CG220J500NT, Basic, https://jlcpcb.com/partdetail/C1555). Not "no change": load capacitance becomes (22 + ~3.5)/2 = ~12.75 pF vs 12.5 pF target (arithmetic from design comment; crystal and stray values not re-verified).
- The other Extended lines (ICs, TVS, button, connector, inductors, 150k, 732k, 47R, NTC) have no Basic equivalent I verified. I did not search for Basic replacements for 47R, 150k, 732k or the TVS.

## Could not verify
- Price breaks on LCSC (only "from" prices); JLCPCB stock and price (not shown).
- Mouser pages (load failed), Arrow, Newark, Sharp's own site, Sharp EOL notice (no search hit).
- DigiKey stock and price for TPS61023DRLR, MAX30101EFD+T, NPM1300-QEAA-R7, LIS2DH12TR breaks, ISP1807-LR-RS (pages truncated before the price table).
- Azumo 11049-06 film-only vs full module; Azumo LED Vf.
- Height of Murata DFE201610E-2R2M; Isat of the TDK MLP2012H parts.
- ISP1807-TT availability anywhere.
