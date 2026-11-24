# Power, battery, haptics and charge-connector research (rev B)

Scope: parts for a sealed wrist device, 80-250 mAh single-cell LiPo, 1.8 V or 3.0 V system rail, 3.3-5 V LED/LCD rail, coin vibration motor, 5 V charging via magnetic pogo or USB-C.

Rules used: every value below was read from a fetched page (URL in the row). "not stated" / "not shown" means the fetched page did not contain it. Nothing here is a guessed part number, price, threshold or stock level. Prices and stock were often login-gated on TI and Nordic pages; those cells say so.

Fetch date: 2026-11-23.

---

## 1. Power-management ICs

### 1a. Integrated charger + regulator PMICs

| Part | Package / size | Charge current | Buck outputs | LDO / load switch | Ship mode current | Quiescent current | Fuel gauge | Interface | Price / stock / eval | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| Nordic nPM1300 | QFN32 5x5 mm; WLCSP 3.1x2.4 mm | 32-800 mA | 2 bucks, 1.0-3.3 V in 100 mV steps | 2 LDO/load switches | 370 nA | not stated ("ultra-low power") | Algorithm-based coulomb-counter SoC/SoH, no extra parts | I2C-compatible TWI | IC price not shown (distributor link only). Eval kit NPM1300-EK: DigiKey qty 1 $64.35, 168 in stock | https://www.nordicsemi.com/Products/nPM1300 ; https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-EK/19722486 |
| Nordic nPM1100 | QFN24 4x4 mm; WLCSP 2x2 mm; "as low as 23 mm2" total | 20-400 mA (linear) | 1 buck, 150 mA, pin-selectable 1.8 / 2.1 / 2.7 / 3.0 V. No LDO stated. Unregulated 3-5.5 V rail up to 660 mA | none stated | 460 nA | not stated | not stated | not stated (100% pin-configurable, no software) | not shown; eval kit not stated | https://www.nordicsemi.com/Products/nPM1100 |
| TI BQ25120A | DSBGA 25-pin YFP, 2.5x2.5 mm WCSP (page area 6.76 mm2) | 5-300 mA | 300 mA buck, 1.8 V default | 100 mA LDO or load switch (load switch default); LDO voltage I2C-set | <50 nA ship-mode battery current | 700 nA typical with buck on, no load | not stated (simple voltage-based monitor only) | I2C | IC price/stock not shown; BQ25120AEVM listed both "In stock" and "Not available" on the same page | https://www.ti.com/product/bq25120a |
| ADI/Maxim MAX77654 | WLP 30-bump, 2.79x2.34x0.5 mm, 0.4 mm pitch; total solution 29.7 mm2 | 7.5-300 mA, 7.5 mA steps | 3 SIMO buck-boosts, 0.8-5.5 V, 50 mV steps (OTP defaults, e.g. 1.8 / 1.8 / 3.5 V in variant A) | 2 x 100 mA LDOs, 0.8-3.975 V, 25 mV steps | <200 nA (0.2 uA typ, 1 uA max, BATT factory ship) | 6 uA typ with 3 SBB + 2 LDO on (low-power bias, WDT off; 13 uA max) | not stated | I2C, 7-bit address 0x48, up to 3.4 MHz | Price/stock not captured. "Evaluation kit available" on the cover; no kit number given | https://cdn.sparkfun.com/assets/7/1/8/9/3/MAX77654_Datasheet.pdf |
| TI BQ25180 | YBG 8-pin | 5 mA-1 A | not stated | not stated | 3.2 uA, wake by button | 15 nA shutdown, 3 uA battery-only, 30 uA adapter sleep | not stated | I2C (bus speed not stated) | not captured | https://ti.com/document-viewer/BQ25180/datasheet |

Notes on the table:
- nPM1300 buck max is 3.3 V. That covers a 1.8 V or 3.0 V system rail, but not a 5 V rail. A 5 V LCD or 3.3-5 V LED rail needs a separate boost.
- BQ25120A and BQ25180 have input OVP. BQ25120A: 5.5 V OVP, 20 V tolerant, 3.4-5.5 V VIN operating (https://www.ti.com/product/bq25120a). BQ25180: 25 V tolerant, 3.0-5.9 V operating (https://ti.com/document-viewer/BQ25180/datasheet).
- None of the Nordic or TI pages I fetched gave a quiescent current for nPM1300 or nPM1100. This is the main open question for the nPM options.

### 1b. Discrete set (requested comparison)

| Part | Package | Key numbers | Source |
|---|---|---|---|
| MCP73831/2 (MCP73832 is the open-drain STAT variant of the same datasheet) | 8-lead 2x3 mm DFN, 5-lead SOT-23 | Charge 15-500 mA. Float 4.20 / 4.35 / 4.40 / 4.50 V, +/-0.75%. Charging Iq 510 uA typ. VDD < VSTOP: 0.1 uA typ. Input 3.75-6 V (abs max 7 V) | https://www.farnell.com/datasheets/1784520.pdf |
| TI TPS7A02 LDO | DSBGA 0.637 mm square (4-pin YCH), X2SON 1x1 mm (DQN), SOT-23-5 2.9x2.8 mm (DBV) | 200 mA max, 25 nA typ Iq (even in dropout), 3 nA shutdown, input 1.5-6.0 V, fixed outputs 0.8-5.0 V. Price not shown | https://www.ti.com/product/TPS7A02 |
| TI TPS62840 buck | VSON-HR 8-pin DLC 2x1.5 mm; HVSSOP DGR; DSBGA YBG 0.95x1.488 mm | 750 mA max, 60 nA typ Iq, 25 nA shutdown, input 1.8-6.5 V. Price/stock not shown (login) | https://www.ti.com/product/tps62840 |

The discrete set is a known-Iq option: 60 nA buck plus 25 nA LDO plus 500 uA-class charger during charge. Its cost is more parts and more board area than one PMIC. Discrete-set charge current is set by a resistor (per the MCP73831 datasheet) and has no fuel gauge.

### 1c. Quiescent current summary for the 1.8 V / 3.0 V system rail

| Option | Quiescent current (as fetched) |
|---|---|
| nPM1300 | not stated |
| nPM1100 | not stated |
| BQ25120A | 700 nA with buck on (no load) |
| MAX77654 | 6 uA typ, 3 SBB + 2 LDO on |
| TPS7A02 + TPS62840 | 25 nA + 60 nA |

---

## 2. Battery protection

### 2a. Cell-level PCM (built into the cell)

Found on Adafruit product pages (see section 4): the 150 mAh and 350 mAh cells both say they include protection circuitry against overcharge, over-discharge (cut-out at 3.0 V) and output short (https://www.adafruit.com/products/1317 ; https://www.adafruit.com/products/2750).

Not found: a source that says a PCM-only cell is sufficient for a sealed wearable. The Adafruit pages state the PCM protections only. I did not find vendor guidance on whether a host-side board protector is also needed. Open question.

### 2b. Board-level protector thresholds (as stated in datasheets)

| Part | Overcharge (VOVP) | Over-discharge (VUVP) | Discharge overcurrent | Charge overcurrent | Short circuit | Package | Source |
|---|---|---|---|---|---|---|---|
| TI BQ2970 family (BQ2970-BQ2973; 18 factory variants) | 3.85-4.60 V, 50 mV steps, +/-10 mV at 25 C | 2.00-2.80 V, 50 mV steps, +/-50 mV | 90-200 mV, 5 mV steps | -45 to -155 mV | 300 / 400 / 500 / 600 mV | 6-pin DSE WSON, 1.5x1.5x0.75 mm (max height 0.8 mm) | https://www.ti.com/lit/gpn/bq2970 |
| DW01A (one-cell protection IC) | 4.280 V typ (4.230-4.330 V) | 2.400 V typ (2.300-2.500 V) | 0.160 V typ (0.140-0.180 V) | -0.150 V typ | 1.000 V typ | SOT-23-6 | https://uelectronics.com/wp-content/uploads/2021/05/Datasheet-DW01A.pdf |

Notes:
- The BQ2970 thresholds are per variant. A specific orderable part (for example BQ29700) sets one combination of these thresholds. I did not check which variant fits 3.6-4.2 V cells. Open question.
- DW01A is paired with a MOSFET pair (FS8205A or S8205A) in the typical board. I saw the S8205A datasheet only in search results (https://static.sparkfun.com/assets/learn_tutorials/2/5/1/S8205A_B_E.pdf). Its numbers were not fetched.

---

## 3. Boost or regulator for a 5 V or 3.3-4.5 V LED/LCD rail

| Part | Input | Output | Quiescent current | Package / size | Price / stock | Source |
|---|---|---|---|---|---|---|
| TI TPS61099 boost | 0.7-5.5 V | 1.8-5.5 V adjustable | 600 nA into VOUT, 400 nA into VIN (datasheet-typical 800 nA / 1 uA per product table) | 6-ball DSBGA (YFF) 1.23x0.88 mm (1.4 mm2); 6-pin WSON (DRV) 2x2 mm | not shown; eval boards "In stock," inventory login-gated | https://www.ti.com/product/TPS61099 |

Not found on the fetched pages: TPS61099 output current, switching frequency, and the TPS610981 / TLV61220 / MT3608 figures from the brief. TPS610981 and TLV61220 were not searched. MT3608 was excluded by the brief itself.

---

## 4. LiPo cells

Only the cells below were seen on fetched pages. All other requested capacities are "not found."

| Capacity | Thickness x width x length | Max charge | PCM | Connector | Price (qty) | Stock | UN38.3 | Source |
|---|---|---|---|---|---|---|---|---|
| 80 mAh | not found | not found | not found | not found | not found | not found | not found | none seen |
| 100 mAh | not fetched | not fetched | not fetched | not fetched | not fetched | not fetched | not fetched | search result only: https://core-electronics.com.au/lithium-ion-polymer-battery-3-7v-100mah.html (not fetched) |
| 110 mAh | not found | not found | not found | not found | not found | not found | not found | none seen |
| 150 mAh | 3.8 x 19.75 x 26.02 mm (page lists 19.75 x 26.02 x 3.8 mm; thickness 3.8 mm is labeled by the page) | 150 mA or less, suggests 100 mA | yes (over-charge, over-discharge cut-out at 3.0 V, output short) | genuine 2-pin JST-PH pre-attached | $5.95 (1-9); $5.36 (10-99); $4.76 (100+) | in stock | "UN38.3 Report" linked; statement text not on page | https://www.adafruit.com/products/1317 |
| 180 mAh | not found | not found | not found | not found | not found | not found | not found | none seen |
| 200 mAh | not found | not found | not found | not found | not found | not found | not found | none seen |
| 250 mAh | not stated | not stated | not stated | not stated | not stated | not stated | not stated | title/meta only: https://www.electromaker.io/shop/product/li-polymer-battery-37v-250mah |
| 350 mAh (above range, reference) | 5.2 x 19.6 x 36 mm (page lists 36 x 19.6 x 5.2 mm) | 350 mA or less | yes (same three protections) | 2-pin JST-PH (page image alt text says JST-SH; text says JST-PH) | $6.95 (1 unit) | in stock | "UN38.3 Report" linked; statement text not on page | https://www.adafruit.com/products/2750 |

Not found: a Renata/ICP, Varta, PKCell, Jauch or LiPol Battery Co part at 80-250 mAh was not fetched. Only the Adafruit and Electromaker pages above were checked. The 250 mAh Electromaker page gives only the title specs.

---

## 5. Haptics

### 5a. Coin / small motors (datasheet numbers)

| Part | Type (as stated) | Diameter x thickness | Rated voltage | Max operating voltage | Start | Rated current | Frequency | Weight | Source |
|---|---|---|---|---|---|---|---|---|---|
| Precision Microdrives C08-005 | 8 mm coin LRA (linear resonant) | 8 mm x 3.3 mm (excl. leads) | 1.8 V RMS | 1.85 V RMS; auto-resonance mode 30% (typ.) lower, case-by-case validation | start voltage max 0.5 V RMS, typ 0.17 V RMS (start current not stated); tLag 12 ms, tRise 33 ms, tStop 123 ms typ at rated voltage | typ 75 mA RMS, max 102 mA RMS | 233 Hz +/-8 Hz | 0.95 g | https://www.precisionmicrodrives.com/datasheets/C08-005%20-%20datasheet-004.pdf |
| Precision Microdrives C08-00A | 8 mm coin, resonant-frequency type | 8 mm x 2.6 mm (excl. leads) | 1.2 V RMS | 1.25 V RMS; auto-resonance 30% typ. lower | start voltage max 0.4 V RMS, typ 0.26 V RMS (start current not stated) | typ 28 mA RMS, max 41 mA RMS | 237 Hz +/-8 Hz | 1 g | https://www.precisionmicrodrives.com/datasheets/C08-00A%20-%20datasheet%20-%20002.pdf |
| Precision Microdrives 304-002 | eccentric weight, coreless, "ERM-consistent" (type not named) | 4 mm x 8 mm body (not coin) | 3 V | not stated | typ 93 mA, max 114 mA; lag 8 ms, rise 26 ms | typ 67 mA, max 95 mA | n/a | n/a | https://precisionmicrodrives.com/cdn/catalog_product/bcf5120d-7432-43cc-b86b-8f7bbf4e9e73/304-002-datasheet.pdf |
| Precision Microdrives 308-102 | eccentric weight, iron core (type not named) | 8 mm x 14.5 mm body (cylinder, not coin) | 4.5 V | 5.5 V | typ 406 mA, max 640 mA; lag 9 ms, rise 21 ms | typ 145 mA, max 200 mA; 19,000 rpm; 5.5 G typ | n/a | n/a | https://precisionmicrodrives.com/cdn/catalog_product/826d8a66-dc5c-493a-8740-b0e05c5115ff/308-102-datasheet.pdf |

Not found:
- 8 mm coin ERM with rated voltage and start current, as a coin ERM. The 304-002 and 308-102 datasheets are ERM-consistent but are not coin.
- 10 mm coin ERM: not searched.
- Rectangular "taptic"-style LRA: not searched.
- The C08-005 product page (https://www.precisionmicrodrives.com/?p=12426) returned "Page Not Found" with no specs. The datasheet PDF above is the source for C08-005.
- Prices and stock for all motors: not seen on the datasheet pages.

### 5b. Drivers

| Part | Supply | Quiescent | Shutdown | Package / size | Built-in effects | Motor types | Price / stock | Source |
|---|---|---|---|---|---|---|---|---|
| TI DRV2605L | 2.0-5.2 V (5.5 V output max) | not listed | 4 uA | DSBGA YZF 9-pin 3.0625 mm2; VSSOP DGS 10-pin 3x4.9 mm | yes: 100+ effects (6 ERM libraries, 1 LRA library), audio-to-vibe | LRA and ERM | not shown for chip; EVM "In stock" | https://www.ti.com/product/DRV2605L |
| TI DRV2603, DRV8212, Dialog DA7280 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | not fetched |

The C08-005 datasheet names TI DRV2605L and DRV2625 as LRA drivers (https://www.precisionmicrodrives.com/datasheets/C08-005%20-%20datasheet-004.pdf).

### 5c. Strength and energy comparison

Not found on any fetched page: a vendor statement that an LRA or ERM gives a stronger or more distinguishable short buzz at lower energy. The C08-005 datasheet gives drive numbers (1.8 V RMS, 233 Hz, 75 mA typ) and lag/rise/stop timing, but no comparison to ERM. The 304-002 and 308-102 datasheets give start and rated currents for ERM-type cylinders. Those are not comparable to coin LRAs. This is an open question.

LCSC numbers for drivers: not found. LCSC was not searched for any driver.

---

## 6. Charge and programming connection

### 6a. Magnetic pogo connectors

| Part | Pins / pitch | Side | Price | Stock | Source |
|---|---|---|---|---|---|
| Adafruit DIY magnetic connector, straight, 6 contacts | 6 pogo pins, 2.2 mm spacing | PCB-side, straight solderable | $7.95 (1-9), $7.16 (10-99), $6.36 (100+) | 10 in stock | https://www.adafruit.com/products/5467 |
| Adafruit DIY magnetic connector, 8 contacts | 8 pins, 2.2 mm (listing only) | PCB-side | not fetched | not fetched | https://www.adafruit.com/products/5469 (search result only) |

Current rating for the Adafruit connector: not stated. Cable-side part: not described on the page.

Search-result pages only (not fetched, no specs seen): Mill-Max Maxnetic spring-loaded connectors (https://www.mouser.in/en/new/mill-max/mill-max-878-connectors/), EDAC spring-loaded magnetic connectors (https://www.mouser.in/new/edac/edac-spring-loaded-connectors-assemblies/), TE magnetic pogo cable assemblies (https://www.te.com/en/products/cable-assemblies/copper-cable-assemblies/multimedia-cable-assemblies/magnetic-pogo-pin-cable-assemblies.html), Farnell magnetic connectors (https://cpc.farnell.com/c/cable-leads-connectors/connectors/magnetic-connectors-cable-assemblies). Pin counts, pitch, price and stock from these were not seen.

Bare gold pads with pogo cradle: not searched. Not found.

### 6b. USB-C receptacle, IPX7

| Part | Rating | Mount | Circuits | Status | Price | Source |
|---|---|---|---|---|---|---|
| Molex right-angle surface-mount USB Type-C, USB 3.2, single port | IPX7 (listed as "robust waterproof rating") | Surface, SMT | 24 circuits | "Currently unavailable"; page says it is being discontinued | not stated | https://uk.rs-online.com/web/p/usb-connectors/0296993P |

Other IPX7 or waterproof USB-C parts appeared in search results only (Globtek, Tensility, JAE, Linkplex, Same Sky) and were not fetched. Their IP ratings were not confirmed.

### 6c. ESD and over-voltage on the 5 V input

| Part | Package | Key numbers | Source |
|---|---|---|---|
| Nexperia PESD5V0S1BA (bidirectional TVS) | SOD323 (SC-76) | clamping 14 V (low clamping voltage), peak pulse power 130 W; reverse standoff, breakdown and capacitance not stated; price/stock not stated | https://www.nexperia.com/product/PESD5V0S1BA |

OVP switch: the charger-integrated OVP on BQ25120A (5.5 V) and BQ25180 (25 V tolerant) is listed in section 1a. No standalone small OVP switch was searched. Not found.

---

## 7. Reverse-polarity / ideal diode

| Part | Input | On-resistance | Quiescent current | Package / size | Price / stock | Source |
|---|---|---|---|---|---|---|
| TI LM66100 | 1.5-5.5 V (page also lists -6 V reverse absolute max on VIN) | 79 mOhm typ at 5 V; 91 mOhm at 3.6 V; 141 mOhm at 1.8 V | 150 nA typ at 3.6 V (300 nA max); shutdown 120 nA | SOT-SC70 DCK, 6-pin, 2x2.1 mm | not shown (EVM "In stock") | https://www.ti.com/product/LM66100 |

Forward-voltage drop figure: not shown on the product page. Datasheet (SLVSEZ8A) was found in search results but not fetched.

---

## 8. Open questions and gaps

1. nPM1300 and nPM1100 quiescent current: not stated on the product pages. Needs the nPM1300 product specification PDF (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/product_overview.html), which I did not fetch.
2. IC prices and stock: Nordic and TI product pages hide qty pricing and inventory behind login, except the nPM1300 eval kit (DigiKey, qty 1, $64.35, 168 in stock). Price and stock for the chips still need a distributor check on DigiKey, Mouser or LCSC.
3. MAX77654 and BQ25180 fuel-gauge presence: not stated on the fetched pages.
4. LiPo cells at 80, 110, 180 and 200 mAh: no source seen. 100 and 250 mAh: no specs captured.
5. UN38.3: Adafruit pages link a test report but the statement text is not on the page. No UN38.3 summary was fetched for any cell.
6. Coin ERM at 8 mm or 10 mm, with rated voltage: not found. The fetched 8 mm parts are LRAs (C08-005, C08-00A).
7. Driver comparison (DRV2603, DRV8212, DA7280) and LCSC numbers: not checked.
8. Vendor claim about LRA vs ERM strength and energy: not found.
9. Pogo connector pin counts and prices from Mill-Max, EDAC, TE and Farnell: only search-result listings were seen.
10. Board protector pick: BQ2970 variant fitting a 4.2 V cell not chosen. DW01A plus S8205A datasheet numbers for the MOSFET side not fetched.
11. TPS61099 output current and switching frequency: not stated on the fetched page.

---

## Sources fetched (2026-11-23)

- https://www.nordicsemi.com/Products/nPM1300
- https://www.nordicsemi.com/Products/nPM1100
- https://www.ti.com/product/bq25120a
- https://www.ti.com/product/TPS61099
- https://www.ti.com/product/DRV2605L
- https://www.precisionmicrodrives.com/?p=12426 (Page Not Found, no specs)
- https://www.precisionmicrodrives.com/datasheets/C08-005%20-%20datasheet-004.pdf
- https://www.precisionmicrodrives.com/datasheets/C08-00A%20-%20datasheet%20-%20002.pdf
- https://precisionmicrodrives.com/cdn/catalog_product/826d8a66-dc5c-493a-8740-b0e05c5115ff/308-102-datasheet.pdf
- https://precisionmicrodrives.com/cdn/catalog_product/bcf5120d-7432-43cc-b86b-8f7bbf4e9e73/304-002-datasheet.pdf
- https://cdn.sparkfun.com/assets/7/1/8/9/3/MAX77654_Datasheet.pdf
- https://www.ti.com/product/tps62840
- https://www.farnell.com/datasheets/1784520.pdf (MCP73831/2)
- https://ti.com/document-viewer/BQ25180/datasheet
- https://www.ti.com/lit/gpn/bq2970
- https://uelectronics.com/wp-content/uploads/2021/05/Datasheet-DW01A.pdf
- https://www.adafruit.com/products/1317
- https://www.adafruit.com/products/2750
- https://www.electromaker.io/shop/product/li-polymer-battery-37v-250mah
- https://www.adafruit.com/products/5467
- https://uk.rs-online.com/web/p/usb-connectors/0296993P
- https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-EK/19722486
- https://www.ti.com/product/TPS7A02
- https://www.nexperia.com/product/PESD5V0S1BA
- https://www.ti.com/product/LM66100

Search results only (not fetched): S8205A datasheet, Mill-Max, EDAC, TE, Farnell magnetic connector pages, core-electronics 100 mAh listing, Globtek/Tensility/JAE IPX7 USB-C listings, LM66100 datasheet (SLVSEZ8A), BQ2970 variant pages.
