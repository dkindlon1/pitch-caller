# revB sensor research: PPG heart-rate sensor and 3-axis accelerometer

Scope: parts for a wrist-worn BLE device on nRF52-class MCU, 1.8-3.3 V rails, Zephyr RTOS. Parts must be orderable at DigiKey, Mouser or LCSC in qty 1-500, not EOL, assemblable by JLCPCB/PCBWay.

Date of research: 2026-11-23. Prices and stock are snapshots from the cited pages and will change. The DigiKey CN page quotes prices in CNY including 13% VAT.

Legend: "not found" = not stated on any page fetched. "unverified" = not confirmed from a fetched source.

## Method and limits

- Datasheets and product pages were read with WebFetch. Some PDFs were truncated, so fields on the truncated pages are marked not found.
- GitHub (Zephyr driver tree) was blocked by robots rules. The Nordic-hosted Zephyr bindings index was truncated before the Maxim, Bosch, ST and Kionix sections. No Zephyr driver name is confirmed in this file. Any driver name listed is marked unverified.
- Not researched in this pass (no fetched source): MAX86141, MAX86150, AS7038 pricing, AS7057, SFH 7072 + AFE, TI AFE4404/AFE4410, PixArt PAH8011/PAH8151, Goodix GH3011 datasheet (sign-in gated), Silicon Labs Si117x, LIS2DE12, BMA423, BMA530, KX023-1025, KX132-1211, Memsic MC3479.

---

## Part 1: Heart-rate (PPG) candidates

### 1a. Summary table

| Part | Green LED | Package (mm) | LED supply | VDD | Avg current (HR) | Shutdown | Lifecycle | Vendor HR algorithm | Zephyr driver | Price / stock |
|---|---|---|---|---|---|---|---|---|---|---|
| MAX30101EFD+T | Yes (537 nm typ) | 5.6 x 3.3 x 1.55 | Red/IR 3.1-5.5 V; green 4.5-5.5 V | 1.7-2.0 V | 600 uA typ, 1100 uA max (SpO2 and HR mode) | 0.7 uA typ, 2.5 uA max | Active (DigiKey) | No. Raw data only. Maxim MAXREFDES117 free algorithm exists | unverified ("maxim,max30101") | DigiKey CN: 5,962 in stock, CNY 113.46 qty 1 (cut tape), CNY 88.47 qty 100, CNY 85.53 qty 500. LCSC C2859066: 53 in stock, from $5.2405 |
| MAX30102EFD+T | not stated | 5.6 x 3.3 x 1.55 | +4.5 V for internal LEDs (EV kit) | +1.8 V sensor (EV kit) | not found | not found | PRODUCTION (ADI) | Yes, free algorithm (MAXREFDES117) | unverified | ADI: starting at $6.85 at 1ku; stock not shown. LCSC C6454833 (listed, stock not captured) |
| MAXM86161A | Yes (520-535 nm, 530 nm typ) | 2.9 x 4.3 x 1.4 (OLGA 14-pin) | VLED 3.0-5.5 V | VLDO 1.68-1.92 V (internal LDO, nominal 1.8 V) | ~600 uA (1 exposure), 970 uA (2), 1300 uA (3), at 100 sps and max LED current; optical channel alone <10 uA at 25 sps | 1.6 uA typ (LDO on, shutdown), 0.05 uA typ (LDO off) | not found (datasheet says production status is on a separate page) | No on-chip HR computation. Raw/conditioned data via 128-word FIFO | not found | not captured |
| VC31B (Vcare) | Yes (525 nm, 2000 mcd at 20 mA, max 100 mA) | 3 x 4.2 x 1.0 (LGA22) | Green forward voltage below 3.2 V at 20 mA; LED rail not separately specified | AVDD 3.0-3.6 V (3.3 V typ); DVDD 1.8-3.6 V | 25 uA at 25 Hz (incl. LED); ~2 uA unworn | ~400 nA | Not stated | Not stated in datasheet. Bangle.js 2 uses it with a vendor library that the Espruino forum describes as not open source | not found | not captured |
| AS7058 | not stated | 2.82 x 2.55 (42-ball WLCSP), height 0.57 mm (likely) | VCSEL/LED driver 1.75-5.5 V | VDVDD/VAVDD 1.70-1.98 V; VIOVDD 1.08-1.98 V | not stated | not stated | Not explicitly assigned in short datasheet | Not stated | not found | Mouser lists AS7058-BWLM / AS7058-BWLT. Price and stock not captured |
| AS7038RB | External LEDs. Simulations used 530 nm green; VD1-4 at 4.75 V | not stated (variant only; package not in fetched text) | 4.75 V (recommended) | 2.7-5.5 V | not stated | not stated | Not stated. Doc dated June 2020 | Not stated. Describes ams SpO2 algorithm only | not found | not captured |
| GH3011 (Goodix) | not stated | not stated | not stated | not stated | not stated ("ultra-low power") | not stated | Datasheet Rev 1.2, 2021-04-29 | Not stated. Page lists HR, HRV, SpO2 and wear detection as supported functions | not found | not captured |

### 1b. Per-part detail with sources

#### MAX30101EFD+T (Analog Devices / Maxim)

| Field | Finding | Source |
|---|---|---|
| Orderable part | MAX30101EFD+T (tape and reel), -40 to +85 C | https://www-cce.cldnet.analog.com/media/en/technical-documentation/data-sheets/MAX30101.pdf |
| Package and size | 14-pin OESIP, 5.6 x 3.3 x 1.55 mm. Datasheet also calls it OLGA in the soldering section | same |
| Integrated LEDs | Red 660 nm typ, IR 880 nm typ, Green 537 nm typ (527 nm in functional diagrams) | same |
| LED supply | Red and IR: 3.1 V min, 3.3 V typ, 5.0 V max. Green: 4.5 V min, 5.0 V typ, 5.5 V max | same |
| VDD | 1.7 V min, 1.8 V typ, 2.0 V max. Absolute max -0.3 to +2.2 V | same |
| VDDIO | Not specified (pull-up labelled VDDIO with no range) | same |
| I2C | 7-bit 0x57 (write 0xAE, read 0xAF). Up to 400 kHz. Open-drain active-low INT | same |
| Current | 600 uA typ, 1100 uA max, SpO2 and HR mode (PW 215 us, 50 sps). Not labelled "average". "< 1 mW" HR figure in features | same |
| Shutdown current | 0.7 uA typ, 2.5 uA max at 25 C | same |
| Cover glass / window | Integrated cover glass, hydrolytic class HGB 1. No air-gap guidance given | same |
| Algorithm | None supplied. Datasheet says SpO2 algorithm uses temperature data. HR mode does not need temperature | same |
| Assembly | Not sealed against dust or liquid. Install last, low-residue no-clean paste, no cleaning or coating | same |
| Algorithm and reference | MAXREFDES117 "Heart-Rate and Pulse-Oximetry Monitor" with free algorithm and C source (Arduino, mbed). Linux driver (MAX3010x) on GitHub | https://www.analog.com/en/products/max30102.html (same ADI family page) |
| Lifecycle | Not stated on datasheet (Rev 3, 6/20). DigiKey shows "Active" | https://www.digikey.cn/en/products/detail/analog-devices-inc-maxim-integrated/MAX30101EFD-T/6188733 |
| DigiKey | Part MAX30101EFD+TTR-ND (T&R), MAX30101EFD+TCT-ND (CT), MAX30101EFD+TDKR-ND (Digi-Reel). Stock 5,962 in stock, factory stock 180,000. CT/Digi-Reel tier CNY 113.46 qty 1, CNY 88.47 qty 100, CNY 85.53 qty 500. T&R only at qty 5,000: CNY 76.02. Digi-Reel adds CNY 49 reel fee | https://www.digikey.cn/en/products/detail/analog-devices-inc-maxim-integrated/MAX30101EFD-T/6188733 |
| LCSC | C2859066, MAX30101EFD+T, 53 in stock, from $5.2405. Price breaks and JLCPCB basic/extended not shown | https://www.lcsc.com/product-detail/C2859066.html |
| Mouser | Not captured (search page only) | https://www.findchips.com/search/max30101efd%2B |

Note: 600 uA average current is high for a battery wrist device. Green LED needs a 4.5-5.5 V rail, which the 1.8-3.3 V system does not supply, so a boost converter or a dedicated LED rail is required. Mouser stock not captured.

#### MAX30102EFD+ / +T (Analog Devices / Maxim)

| Field | Finding | Source |
|---|---|---|
| Lifecycle | "PRODUCTION". MAX30100 listed as "Obsolete" | https://www.analog.com/en/products/max30102.html |
| Orderable | MAX30102EFD+ and MAX30102EFD+T | same |
| Package | 5.6 x 3.3 x 1.55 mm, 14-pin optical module | same |
| LEDs | "Internal LEDs" only. Wavelengths and colors not given. No green LED claim found | same |
| Supply (EV kit) | +1.8 V sensor, +4.5 V internal LEDs, +3.3 V accelerometer | same |
| Price | "Starting From $6.85" at 1ku list. Stock not shown | same |
| Algorithm | Yes: MAXREFDES117 free algorithm with C source; MAXREFDES1043 SpO2 guide | same |
| LCSC | C6454833 (MAX30102EFD+T) listed. Stock and price not captured | https://jlcpcb.com/partdetail/MAX30102EFD%2BT/C6454833 |

Note: no green LED, so less suited to wrist HR than MAX30101. Datasheet not fetched in this pass.

#### MAXM86161A (Analog Devices, OLGA module)

| Field | Finding | Source |
|---|---|---|
| Package | 14-pin OLGA, 2.9 x 4.3 x 1.4 mm. Package code F142A4-1 | https://www.analog.com/media/en/technical-documentation/data-sheets/maxm86161a.pdf |
| Integrated LEDs | IR 880 nm, Red 660 nm, Green 530 nm (520-535 nm) | same |
| LED forward voltage | IR 1.6-1.9 V at 100 mA; Red 2.0-2.4 V at 20 mA; Green 2.8-3.4 V at 175 mA | same |
| Supply | VLED 3.0-5.5 V. Internal LDO output VLDO 1.68-1.92 V (nominal 1.8 V). No separate VDD range given | same |
| I2C | Write 0xC4, read 0xC5 (7-bit 0b1100010X) | same |
| Shutdown | 1.6 uA typ (max 11 uA) with LDO_EN=1 and SHDN=1. 0.05 uA typ (max 0.3 uA) with LDO_EN=0 | same |
| Average current | PPG_SR 100 sps, 117.3 us integration, max LED: ~600 uA (1 exposure), 970 uA (2), 1300 uA (3). Table garbled in the fetch | same |
| Algorithm | No on-chip HR or SpO2 computation. 128-word FIFO. Picket fence and ambient cancel are conditioning, not HR algorithms | same |
| Optical window | Not provided. Layout guidance covers bypass caps, grounding, shielding | same |
| Zephyr / open source | None mentioned | same |
| Ordering / lifecycle | Ordering table truncated; lifecycle on a separate page (not fetched). Mouser datasheet also truncated | https://www.mouser.com/datasheet/2/256/MAXM86161-1605388.pdf |

Note: this is the only module in the set with integrated green LED, and its 2.9 x 4.3 mm footprint is smaller than MAX30101. The LDO-based design supports 3.0-5.5 V on VLED. Its LED supply still needs 3.0 V minimum, so 3.3 V is the lowest usable rail. Ordering part numbers, price and stock not confirmed.

#### VC31B (Vcare, used in Bangle.js 2)

| Field | Finding | Source |
|---|---|---|
| Package | LGA22, 3 x 4.2 x 1.0 mm (height 0.94-1.06 mm) | https://www.espruino.com/datasheets/VC31B.pdf |
| LEDs | Green 525 nm, 2000 mcd at 20 mA, forward voltage below 3.2 V at 20 mA, max 100 mA. IR 940 nm, below 1.65 V at 20 mA, max 100 mA. No red LED | same |
| Supply | AVDD 3.0-3.6 V (3.3 V typ). DVDD 1.8-3.6 V. VDDIO 1.8 V or 3.3 V. Separate LDO recommended for the HR module, ripple below 40 mV pk-pk. Must not see sustained or pulse voltage above 3.6 V | same |
| I2C | Up to 400 kHz. 7-bit address 0x33. INT and RSTN pins | same |
| Current | Average 25 uA at 25 Hz including LED. Unworn about 2 uA. Shutdown about 400 nA | same |
| Optical window | Module-to-lens distance at most 0.1 mm, ideally 0. Window transmittance above 90%. Window transmission 400-1000 nm. Lens thickness at most 0.5 mm, hard glass or acrylic. Silicone light-shield frame required. No components within 0.6 mm | same |
| Algorithm | Not stated in datasheet. Bangle.js forum says the vcare library is not open source | https://forum.espruino.com/comments/16208458 |
| Lifecycle | No EOL or production status stated. Revision V1.54 (2021-10-20) | https://www.espruino.com/datasheets/VC31B.pdf |
| Distributors | Not captured. Not searched in this pass | - |

Note: AVDD minimum of 3.0 V means the rail must be 3.3 V. It cannot run on 1.8 V. Current figure is excellent. Algorithm must be written or sourced separately.

#### AS7058 (ams OSRAM)

| Field | Finding | Source |
|---|---|---|
| Ordering codes | Q65113A6621, Q65113A6622 (AS7058); Q65113A6625, Q65113A6626 (AS7058A). Mouser: AS7058-BWLM, AS7058A-BWLM, AS7058-BWLT, AS7058A-BWLT | https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/7607/amsosram1182023AS7058ShortDatasheetDS0010853366997.pdf |
| Package | 42-ball WLCSP, 2.82 x 2.55 mm. Height probably 0.57 mm (outline drawing, unconfirmed) | same |
| LEDs | Up to 8 LED driver outputs and a VCSEL die. Wavelengths and green not stated | same |
| Supply | VDVDD and VAVDD 1.70-1.98 V (1.80 V typ). VIOVDD 1.08-1.98 V. LED/VCSEL 1.75-5.50 V | same |
| Interface | Pins suggest I2C and SPI, mode not stated | same |
| I2C address, shutdown, average current, window, algorithm, lifecycle | not found in short datasheet. Short datasheet defers to full datasheet | same |
| Mouser | https://www.mouser.com/en/new/ams-osram/ams-osram-as7058-afe/ (not price-checked) | - |

#### AS7038RB (ams OSRAM)

| Field | Finding | Source |
|---|---|---|
| LEDs | External LEDs. Simulations used green 530 nm, plus 657 nm red and 850 nm IR. Pins VD1-VD4 supply LEDs | https://ams-osram.com/documents/20143/36005/AS7038GB_AS7038RB_PD000546_1-00.pdf |
| LED supply | Recommended 4.75 V for VD1-VD4 | same |
| VDD | 2.7-5.5 V recommended | same |
| I2C | Slave address 0x30 (write 0x60, read 0x61). 100 and 400 kHz | same |
| Window | "No air gap between glass and skin." Keep glass thin, no wider air gap. Optical barrier 1 mm high | same |
| Currents, algorithm, lifecycle | not found. Document dated June 2020, marked confidential | same |

Note: 2.7 V minimum VDD and 4.75 V LED rail do not fit the 1.8-3.3 V constraint. Not a fit.

#### GH3011 (Goodix)

| Field | Finding | Source |
|---|---|---|
| Integration | Three LED drivers, one photodiode, one AFE. LED colors not stated | https://en.sekorm.com/doc/3769020.html |
| Functions | Heart rate, HRV, SpO2, wear detection | same |
| Datasheet | Rev 1.2, DS-GH3-00007-EN, 2021-04-29. 26-page PDF is behind sign-in | same |
| All electrical specs | not found in accessible sources | - |
| JLCPCB listing | jlcpcb.com/partdetail/GoodixTechnology-GH3011/C2680489 (stock and price not captured) | https://jlcpcb.com/partdetail/GoodixTechnology-GH3011/C2680489 |

Not usable for a recommendation until the datasheet is obtained.

---

## Part 2: Accelerometer candidates

### 2a. Summary table

| Part | Package (mm) | VDD | Low-power current | Power-down | Wake / tap | Interface | Lifecycle | Zephyr driver | DigiKey | LCSC (C-number, stock, price) | JLCPCB |
|---|---|---|---|---|---|---|---|---|---|---|---|
| LIS2DW12TR | LGA 12, 2.0 x 2.0 x 0.7 | 1.62-3.6 V (I/O separate) | <1 uA "active low-power" (no 12.5/25 Hz figure) | 50 nA | Wake-up, single/double tap, free-fall, 6D/4D | I2C, SPI | Active | unverified ("st,lis2dw12") | 0 in stock, backorder, 24-week lead | C189624: 13,817 in stock, $0.9098 qty 1, $0.5967 qty 100, $0.5621 qty 500 | Extended |
| BMA400 | LGA 12, 2.0 x 2.0 x 0.95 | VDD 1.72-3.6 V; VDDIO 1.2-3.6 V | 850 nA at 25 Hz, OSR=0 (fixed 25 Hz in LP mode; no 12.5 Hz figure) | 160 nA (sleep); 200 nA in another section | Wake-up on activity (LP mode), tap, step, activity recognition | I2C, SPI | Active | unverified ("bosch,bma400") | 0 in stock, 16-week lead, $2.48 shown as unit price on a related listing | C437655: 771 in stock, from $10.2398 | not shown |
| LIS2DH12TR | LGA 12, 2.0 x 2.0 x 1.0 | 1.71-3.6 V (I/O separate) | "Down to 2 uA" (no ODR stated) | not found | Free-fall, motion (2 generators), 6D/4D, sleep-to-wake | I2C, SPI | Active | unverified ("st,lis2dh") | DigiKey 4899838 listed (stock and price not captured) | C110926: 58,867 in stock, from $0.5339 | not shown |
| KX022-1020 | LGA, 2 x 2 x 0.9 | 1.71-3.6 V (2.5 V typ) | 5 uA at 12.5 Hz, 7 uA at 25 Hz (low-power, RES=0) | 0.9 uA standby | Wake-up, tap, tilt | I2C, SPI | "Not Recommended for New Designs" (page header) | not found | not captured | not captured | not captured |

### 2b. Per-part detail with sources

#### LIS2DW12TR (STMicroelectronics)

| Field | Finding | Source |
|---|---|---|
| Lifecycle | "Product is in volume production" | https://www.st.com/en/mems-and-sensors/lis2dw12.html |
| Package | LGA 12-lead, 2.0 x 2.0 x 0.7 mm | same |
| Supply | 1.62-3.6 V. Independent I/O supply | same |
| Low-power current | "Below 1 uA in active low-power mode." No figure at 12.5 or 25 Hz | same |
| Power-down | 50 nA | same |
| Interrupts | Motion detection engine with free-fall, wake-up, single/double tap, 6D/4D. Pin mapping not stated on the product page | same |
| Interface | High-speed I2C and SPI. I2C address not stated | same |
| Orderable | LIS2DW12TR | same |
| DigiKey | Part 497-17718-2-ND (T&R), -1-ND (CT), -6-ND (Digi-Reel). Stock 0, backorder, 24-week manufacturer lead time. Status Active. Supply 1.62-3.6 V. Price table not captured | https://www.digikey.com/en/products/detail/stmicroelectronics/LIS2DW12TR/7914708 |
| LCSC | C189624. 13,817 in stock. Qty 1 $0.9098, qty 100 $0.5967, qty 500 $0.5621. Extended part | https://lcsc.com/product-detail/image/LIS2DW12TR_C189624.html |
| Zephyr | Not verified in this pass | - |

Note: the 0 DigiKey stock is the main availability risk. LCSC has stock and an Extended classification. Low-power figure at 12.5 Hz not confirmed, so the power budget needs the full datasheet.

#### BMA400 (Bosch Sensortec)

| Field | Finding | Source |
|---|---|---|
| Package | LGA 12-pin, 2 x 2 mm footprint, height 0.95 mm | https://cdn.sparkfun.com/assets/e/9/e/6/0/BMA400-Datasheet.pdf |
| Supply | VDD 1.72-3.6 V (1.8 V typ). VDDIO 1.2-3.6 V (1.8 V typ) | same |
| Low-power current | Table: 1.35 / 1.1 / 0.93 / 0.85 uA for osr_lp 11/10/01/00 at fixed 25 Hz. Spec table IDDlp1: 850 nA at 25 Hz, OSR=0. No 12.5 Hz low-power figure (12.5 Hz is a normal-mode ODR) | same |
| Sleep | 160 nA (spec table). Power Modes section says 200 nA. Datasheet internally inconsistent | same |
| Interrupts | Activity and inactivity (generic 1 and 2), activity changed, STILL/WALK/RUN recognition, single and double tap (needs 200 Hz data), step detector/counter, wake-up on activity (LP mode only), orientation, data ready, FIFO | same |
| Interface | SPI 4-wire and 3-wire, I2C, 2 interrupt pins. I2C address in truncated section | same |
| Orderable | BMA400 (Bosch). Part numbers in truncated section | same |
| Lifecycle | Rev 1.8, March 2022. DigiKey shows Active | same |
| DigiKey | Part 828-1081-2-ND (T&R), -1-ND (CT), -6-ND (Digi-Reel). Status Active. Manufacturer lead time 16 weeks. Stock and price not captured. Related listing on LIS2DW12 page shows BMA400 with 0 in stock and $2.48 unit price | https://www.digikey.com/en/products/detail/bosch-sensortec/BMA400/8634935 ; https://www.digikey.com/en/products/detail/stmicroelectronics/LIS2DW12TR/7914708 |
| LCSC | C437655, BMA400, 771 in stock, "From $10.2398". Price breaks, status and JLCPCB class not shown | https://lcsc.com/product-detail/C437655.html |
| Zephyr | Not verified in this pass | - |

Note: BMA400 is the best-documented ultra-low-power option for activity, but its low-power figure is at 25 Hz only. Price and stock conflict across sources, so confirm before ordering.

#### LIS2DH12TR (STMicroelectronics)

| Field | Finding | Source |
|---|---|---|
| Lifecycle | "Product is in volume production" | https://www.st.com/en/mems-and-sensors/lis2dh12.html |
| Package | LGA 12-lead, 2.0 x 2.0 x 1.0 mm | same |
| Supply | 1.71-3.6 V. Independent I/O supply | same |
| Low-power | "Ultra-low power consumption down to 2 uA." No ODR stated | same |
| Power-down | not found | same |
| Interrupts | Two programmable generators for free-fall and motion, 6D/4D orientation, sleep-to-wake and return-to-sleep. Click not mentioned | same |
| Interface | I2C and SPI. I2C address not stated | same |
| Orderable | LIS2DH12TR | same |
| LCSC | C110926, 58,867 in stock, "From $0.5339". Breaks and JLCPCB class not shown | https://www.lcsc.com/product-detail/Accelerometers_STMicroelectronics-LIS2DH12TR_C110926.html |
| DigiKey | Listing 4899838 (LIS2DH12TR). Stock and price not captured | https://www.digikey.com/en/products/detail/stmicroelectronics/LIS2DH12TR/4899838 |
| Zephyr | Not verified in this pass | - |

Note: lowest cost and deepest stock of the three. Its low-power figure is not tied to a data rate, so compare against the full datasheet.

#### KX022-1020 (Kionix, ROHM)

| Field | Finding | Source |
|---|---|---|
| Lifecycle | Page header says "Not Recommended for New Designs" | https://fscdn.rohm.com/kionix/en/datasheet/KX022-1020%20Specifications%20Rev%2012.0.pdf |
| Package | 2 x 2 x 0.9 mm LGA | same |
| Supply | VDD 1.71 V min, 2.5 V typ, 3.6 V max. IO_VDD 1.7 V min up to VDD | same |
| Low-power current | 5 uA at 12.5 Hz, 7 uA at 25 Hz (RES=0). Generic 10 uA typical | same |
| Standby | 0.9 uA | same |
| Interrupts | Wake-up, tap and double tap, tilt position | same |
| I2C address | 0x3E/0x3F (ADDR high) or 0x3C/0x3D (ADDR low) | same |
| Distributors | Not captured. Excluded from recommendation due to status | - |

Excluded: "Not Recommended for New Designs" on the vendor datasheet.

---

## Recommendations

### Heart-rate sensor

- Top pick: MAX30101EFD+T. It is the only candidate with a confirmed green LED, Active status and fetched stock (DigiKey 5,962 in stock; LCSC 53 in stock). Risks: green LED needs 4.5-5.5 V, which is not on a 1.8-3.3 V system rail, so you need a boost or dedicated LED rail. Average current is 600 uA. No algorithm from vendor (MAXREFDES117 free algorithm exists as reference).
- Runner-up: VC31B (Vcare). Best power (25 uA average). Green 525 nm. Requires a 3.3 V rail for AVDD (3.0-3.6 V), an external LDO, and a strict optical stack (window at most 0.1 mm from sensor, 0.6 mm keep-out). No vendor algorithm stated. Distributor availability not captured, so JLCPCB sourcing is unconfirmed.

### Accelerometer

- Top pick: LIS2DW12TR. Active, 0.7 mm LGA, 50 nA power-down, wake-up and tap interrupts, LCSC stock 13,817 at $0.9098 qty 1, Extended. Risk: DigiKey shows 0 stock on backorder, so source through LCSC. 12.5 Hz current not confirmed.
- Runner-up: BMA400. Active, lowest documented low-power current (850 nA at 25 Hz), wake-up on activity in LP mode, step and tap. Risks: LCSC price quoted "From $10.2398", DigiKey 0 stock with 16-week lead. 12.5 Hz current not confirmed.

### Open items

1. Obtain full datasheets for MAX86141, MAX86150, AFE4404, PAH8011/8151, LIS2DE12, BMA423, BMA530, KX023/KX132 and MC3479 (not fetched).
2. Verify Zephyr driver names in a reachable source (Zephyr repo or Nordic docs). Names above are unverified.
3. Confirm DigiKey and Mouser price/stock manually. DigiKey pages were truncated before price tables.
4. Confirm JLCPCB basic/extended class for MAX30101 and VC31B (not shown on fetched pages).
5. Obtain the GH3011 datasheet (sign-in gated) before using it.
