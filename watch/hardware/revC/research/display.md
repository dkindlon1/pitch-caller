# Always-on display research for revB watch (1.0 to 1.3 in, sun + night readable)

Research date: 2026-11-23. Every fact below was read from a fetched page; the URL is given per row. Items marked **NOT FOUND** could not be seen on any fetched page. Sources marked **(non-official)** are distributor or aggregator pages, not the manufacturer.

Sharp datasheet PDF used: https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf (a SparkFun-hosted copy, non-official). The DigiKey page links the official-looking copy at https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/929/LS013B7DH03_Spec.pdf (not fetched).

---

## 1. Summary table (fetched values only)

| Part | Tech | Size / res / colour | Outline W x H x T (mm) | Active area (mm) | Interface / VDD | Power (display, no update / update) | Lifecycle | Qty-1 price | Stock | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| LS013B7DH03 | Reflective TFT, mono, no backlight | 1.28 in, 128x128, mono | 26.6 x 30.3 x 0.741 | 23.04 x 23.04 | Serial (SCLK, SI, SCS), 3.0 V typ (2.7-3.3 V), fSCLK 1.1 MHz max, no 5 V stated | 12 uW typ / 50 uW max; 1 Hz update 50 uW typ / 130 uW max | DigiKey: Active. Mouser: Obsolete. Futureelectronics: Active. See section 4 | $12.39 (tray), $7.9728 @100, $7.7443 @500 (DigiKey) | DigiKey 35,736 (claimed); Futureelectronics 0; Mouser "restricted" | [DS](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf), [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/425-2903-ND/5300387), [Mouser](https://www.mouser.com/c/?q=LS013B7DH03), [FE](https://www.futureelectronics.com/p/6117773) |
| Azumo 11049-06_A1 (frontlit LS013B7DH03) | Frontlit reflective | 1.28 in, 128x128, mono | not found | 23.04 x 23.04 | not found | 12-50 uW display (Azumo page) | DigiKey: Active | $47.87; $39.40 @10; $34.5147 @100; no @500 listed | 247 (DigiKey) | [Azumo](https://www.azumotech.com/products/1-28-monochrome-display-11049-06/), [DK](https://www.digikey.com/en/products/detail/azumo/11049-06-A1/9602607) |
| LS013B7DH05 | Listed as transflective (DigiKey) and reflective (Azumo) — conflict | 1.26 in (32.00 mm diag), 144x168, black/white | not found | not found on DigiKey; Azumo gives 20.88 (H) x 24.36 (V) | not found | Azumo 11655-03 page: 25-35 uW (for the frontlit version) | DigiKey: Active | $9.50180 only at 1,120 units | DigiKey: not in stock; LCSC: 0 | [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH05/5799456), [LCSC](https://www.lcsc.com/product-detail/C17500193.html) |
| Azumo 11655-03_A1 (frontlit LS013B7DH05) | Frontlit reflective | 1.26 in, 144x168 | not found | 20.88 x 24.36 | not found | 25-35 uW display | DigiKey: Active | CAD $83.51; $69.013 @10; $60.6622 @100; no @500 | 0 (DigiKey; a "1,120 in stock 27-May-2027" note is shown) | [Azumo](https://datasheets.globalspec.com/ds/Azumo-Tech/11655-03/7767909b-50f7-4f1b-ac38-a9629253a82a), [DK](https://www.digikey.ca/en/products/detail/azumo/11655-03-A1/9602603) |
| LS011B7DH03 | Reflective TFT, mono | 1.08 in, 160x68, mono | not found | 25.28 x 10.74 | not found | not found | DigiKey: Active | not listed (only $8.008 @1,600) | DigiKey: not kept in stock | [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS011B7DH03/25953418) |
| LS014B7DD01 | Reflective TFT, colour RGB | 1.39 in, 280x280, RGB | not found | 37.48 x 37.28 | Parallel 6-bit (not serial) | not found | DigiKey: **Obsolete** ("no longer manufactured ... once stock is depleted") | EUR 38.77 (Austria, ex VAT); EUR 31.40 @12; EUR 27.69 @108 | 838 (DigiKey Austria) | [DK-AT](https://www.digikey.at/en/products/detail/sharp-microelectronics/LS014B7DD01/23349347) |
| LS012B7DD06 (datasheet found, part-number mismatch) | Reflective TFT, colour | Datasheet describes 1.19 in, 240x240, 64 colours | 33.04 x 33.94 x 0.785 | phi 30.24 | Parallel 6-bit, VDD1 3.2 V, **VDD2 5.0 V** | 11 uW typ / 180 uW max; 1 Hz 33 uW typ / 210 uW max | not stated | not found | not found | [DS](https://www.data-modul.com/sites/default/files/products/LS012B7DD06-specification-12038622.pdf) |

Not fetched in full: LS013B7DH05 outline and pinout, LS010B7DH04, LS013B7DD02, LS006B7DH03, transflective TFT modules, e-paper. See section 8.

---

## 2. Per-part detail

### 2.1 Sharp LS013B7DH03 (1.28 in, 128x128, mono reflective)

- **Technology:** reflective, monochrome, serial interface. [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/425-2903-ND/5300387) says "TFT, monochrome, reflective, serial interface." No backlight is named in the datasheet or on DigiKey. Built-in backlight: **none**. Frontlight: see Azumo 11049-06 (section 2.2).
- **Diagonal / resolution:** 1.28 in (32.51 mm), 128 x 128 dots, 0.18 mm dot pitch. [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/425-2903-ND/5300387). Colours: monochrome (not listed as colour on DigiKey).
- **Outline:** 26.6 x 30.3 x 0.741 mm. Active area 23.04 (H) x 23.04 (V) mm. [DS](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf)
- **Interface:** serial data communication, SCLK / SI / SCS. The datasheet does not call it SPI. [DS](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf)
- **Supply:** VDD and VDDA 3.0 V typ, 2.7 to 3.3 V recommended. No 5 V requirement stated. [DS](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf)
- **Max serial clock:** fSCLK 1 MHz typ, 1.1 MHz max. [DS](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf)
- **Power (average, not current):** display mode without data update 12 uW typ / 50 uW max; data update at 1 Hz 50 uW typ / 130 uW max. [DS](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf)
- **FPC:** the datasheet recommends SMK FP12 series CFP-4610-0150F (bottom-side contact) or CFP-4510-0150F (top-side contact), and Molex 51441-1093 (bottom-side contact). **Connector pitch and pin count: NOT FOUND** in the fetched text. [DS](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf)
- **Pin table (10 terminals), from the datasheet:**

| Pin | Code | Function |
|---|---|---|
| 1 | SCLK | Serial clock input |
| 2 | SI | Serial data input |
| 3 | SCS | Chip select input |
| 4 | EXTCOMIN | COM inversion polarity input |
| 5 | DISP | Display ON/OFF (memory retained) |
| 6 | VDDA | Analog power 3.0 V |
| 7 | VDD | Logic power 3.0 V |
| 8 | EXTMODE | COM inversion mode select (high: external COM, low: serial flag) |
| 9 | VSS | Logic ground |
| 10 | VSSA | Analog ground |

Source: [DS](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf)

- **Lifecycle:** datasheet has no lifecycle status. DigiKey: Active. Mouser: Obsolete. See section 4.
- **Zephyr driver:** `sharp,ls0xx` (on SPI bus) lists LS013B7DH03 as an example panel. [Zephyr binding](https://docs.zephyrproject.org/latest/build/dts/api/bindings/display/sharp,ls0xx.html)

### 2.2 Azumo 11049-06 (frontlit version of LS013B7DH03)

- **Base panel:** Sharp LS013B7DH03. [DK](https://www.digikey.com/en/products/detail/azumo/11049-06-A1/9602607), [Azumo](https://www.azumotech.com/products/1-28-monochrome-display-11049-06/)
- **Frontlight type:** Azumo front-light panel with a thin lightguide and a single LED. Exact LED voltage, current, forward voltage and added thickness: **NOT FOUND** on the product page. [Azumo](https://www.azumotech.com/products/1-28-monochrome-display-11049-06/). The linked datasheet (https://www.azumotech.com/uploads/2020/03/12367-01_T5_Sharp-1.28_11049-xx_FLP-Data-Sheet.pdf) was not fetched (it is named on DigiKey, so it is official Azumo).
- **Power:** 12-50 uW display power consumption, per the Azumo page. [Azumo](https://www.azumotech.com/products/1-28-monochrome-display-11049-06/)
- **Night / sunlight claim:** the page says "high quality and low power viewability in all environments." It makes no explicit night or sunlight claim. [Azumo](https://www.azumotech.com/products/1-28-monochrome-display-11049-06/)
- **Price (DigiKey, USD, tray):** $47.87 qty 1; $39.40 qty 10; $34.5147 qty 100; no qty 500 break listed. [DK](https://www.digikey.com/en/products/detail/azumo/11049-06-A1/9602607)
- **Stock:** 247 at DigiKey. Lead time 32 weeks. [DK](https://www.digikey.com/en/products/detail/azumo/11049-06-A1/9602607)
- **Outline, interface, supply, FPC pinout:** NOT FOUND on fetched pages.

### 2.3 Azumo 11655-03 (frontlit version of LS013B7DH05)

- **Base panel:** Sharp LS013B7DH05, 1.26 in. [Azumo listing](https://datasheets.globalspec.com/ds/Azumo-Tech/11655-03/7767909b-50f7-4f1b-ac38-a9629253a82a), [DK](https://www.digikey.ca/en/products/detail/azumo/11655-03-A1/9602603)
- **Active area:** 20.88 (H) x 24.36 (V) mm, 0.145 mm dot pitch, 175 PPI. Graphic reflective monochrome TFT (1 bpp). [Azumo listing](https://datasheets.globalspec.com/ds/Azumo-Tech/11655-03/7767909b-50f7-4f1b-ac38-a9629253a82a)
- **Power:** 25-35 uW display power consumption. No static vs update split. [Azumo listing](https://datasheets.globalspec.com/ds/Azumo-Tech/11655-03/7767909b-50f7-4f1b-ac38-a9629253a82a)
- **Night / sunlight claim (exact):** "visible in all environments - sunlight, low-light, & moonlight". [Azumo listing](https://datasheets.globalspec.com/ds/Azumo-Tech/11655-03/7767909b-50f7-4f1b-ac38-a9629253a82a) (vendor marketing; not independently measured)
- **Frontlight LED specs, thickness, outline, interface, supply, pinout:** NOT FOUND on the fetched page.
- **Price (DigiKey Canada, CAD, tray):** $83.51 qty 1; $69.013 qty 10; $60.6622 qty 100; no qty 500 listed. [DK-CA](https://www.digikey.ca/en/products/detail/azumo/11655-03-A1/9602603)
- **Stock:** 0 at DigiKey. The same page says "1,120 estimated in stock on 27-May-2027", a future date that may be a page error. Lead time 32 weeks. [DK-CA](https://www.digikey.ca/en/products/detail/azumo/11655-03-A1/9602603)

### 2.4 Sharp LS013B7DH05 (1.26 in, 144x168, mono)

- **Technology:** DigiKey says "TFT - Monochrome (Transflective display mode)". Azumo says the base panel is a reflective RLCD. **Conflict; not resolved.** [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH05/5799456), [Azumo listing](https://datasheets.globalspec.com/ds/Azumo-Tech/11655-03/7767909b-50f7-4f1b-ac38-a9629253a82a)
- **Size / res:** 1.26 in (32.00 mm), 144 x 168, black and white. [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH05/5799456)
- **Price / stock:** DigiKey lists one tier only: 1,120 units at $9.50180. Not in stock at DigiKey. LCSC: out of stock, starting price $6.931 (no quantity breaks). [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH05/5799456), [LCSC](https://www.lcsc.com/product-detail/C17500193.html)
- **Lifecycle:** DigiKey Active; lead time 28 weeks. [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH05/5799456)
- **Datasheet URL on DigiKey:** https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/2328/LS013B7DH05.pdf (**not fetched**)
- **Outline, interface, supply, FPC, pinout, power:** NOT FOUND (the DigiKey and LCSC pages did not show them). Mouser product page fetch failed (client error), so Mouser stock for this part is **NOT FOUND**.
- **Zephyr:** listed as an example panel for `sharp,ls0xx`. [Zephyr binding](https://docs.zephyrproject.org/latest/build/dts/api/bindings/display/sharp,ls0xx.html)

### 2.5 Sharp LS011B7DH03 (1.08 in, 160x68, mono reflective)

- **Technology:** TFT monochrome, reflective. **Size:** 1.08 in (27.43 mm), 160 x 68, 0.16 mm dot pitch, viewing area 25.28 x 10.74 mm. [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS011B7DH03/25953418)
- **Price:** only $8.00800 at 1,600 units is listed. No qty 1 or 100 or 500 price. Not kept in stock at DigiKey; lead time 28 weeks. [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS011B7DH03/25953418)
- **Datasheet URL:** https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/6165/lcd202009e.pdf (**not fetched**)
- **Electrical / pinout / FPC:** NOT FOUND.

### 2.6 Sharp LS014B7DD01 (1.39 in colour, 280x280) — OBSOLETE

- DigiKey Austria: "This product is no longer manufactured and will no longer be stocked once stock is depleted." Status: Obsolete. [DK-AT](https://www.digikey.at/en/products/detail/sharp-microelectronics/LS014B7DD01/23349347)
- Colour RGB, reflective, no backlight listed, parallel 6-bit interface. [DK-AT](https://www.digikey.at/en/products/detail/sharp-microelectronics/LS014B7DD01/23349347)
- 1.39 in (35.31 mm), viewing area 37.48 x 37.28 mm. EUR 38.77 qty 1, EUR 31.40417 qty 12, EUR 27.69380 qty 108; 838 in stock. [DK-AT](https://www.digikey.at/en/products/detail/sharp-microelectronics/LS014B7DD01/23349347)
- Not a candidate for a serial-only design (parallel interface), and it is obsolete.

### 2.7 Sharp LS012B7DD06 / LS012B7DD06A (colour) — PART-NUMBER MISMATCH

- The data-modul specification file named LS012B7DD06 describes a **1.19 in, 240x240, 64-colour reflective TFT** with a **parallel 6-bit** interface, **VDD1 3.2 V and VDD2 5.0 V** (so it needs a 5 V rail), outline **33.04 x 33.94 x 0.785 mm**, active area phi 30.24 mm, FPC **21 positions**, Molex 503566-2100 connector recommended. [DS-DM](https://www.data-modul.com/sites/default/files/products/LS012B7DD06-specification-12038622.pdf)
- Power: 11 uW typ / 180 uW max hold; 1 Hz update 33 uW typ / 210 uW max; 30 Hz update 500 uW typ / 1200 uW max. [DS-DM](https://www.data-modul.com/sites/default/files/products/LS012B7DD06-specification-12038622.pdf)
- The Sharp lineup page lists the part as "LS012B7DD06A" and gives no status note. [Sharp lineup](https://global.sharp/products/device/lineup/selection/lcd/mobile/index.html)
- **Caveat:** the datasheet is hosted by a third party (data-modul), so it is non-official, and it is not clear it matches the 06A variant. Verify against Sharp before use. Stock and pricing: NOT FOUND.

### 2.8 Other Sharp candidates checked

- **LS013B7DD02** (colour): no distributor page or datasheet was fetched; a search returned only LS013B7DH03 pages. **NOT FOUND.**
- **LS010B7DH04**: appears in the Sharp lineup list; no datasheet or distributor page fetched. **NOT FOUND.**
- **LS006B7DH03**: not searched. **NOT CHECKED.**
- **LS021B7DD02** (2.13 in colour, 320x240, parallel): DigiKey Active, $35.21 qty 1, 838 in stock, 28 weeks. Too large for the target size, and it is not confirmed as a memory LCD. [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS021B7DD02/23347701)

---

## 3. Night readability (question a)

- **Sharp reflective panels without frontlight (LS013B7DH03, LS013B7DH05 base, LS011B7DH03):** the datasheets and distributor pages describe them as reflective, with no backlight. Night readability therefore needs a frontlight or external field light. Sources: [DS](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf), [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/425-2903-ND/5300387).
- **Built-in transflective:** DigiKey describes LS013B7DH05 as transflective. That is the only fetched source that does, and Azumo calls the same panel reflective. **Unresolved; needs the Sharp datasheet for LS013B7DH05 before design.**
- **Add-on frontlight (Azumo):** the Azumo frontlit modules for LS013B7DH03 (11049-06) and LS013B7DH05 (11655-03) are the only fetched options with a frontlight. Their LED voltage, current, added thickness and outline were **NOT FOUND**, so the power budget for night use is unknown. The 11655-03 page claims "sunlight, low-light, & moonlight" readability; this is vendor marketing and was not verified.
- **Mouser-style power figures for frontlit modules** (25-35 uW on 11655-03; 12-50 uW on 11049-06) are display-only and do **not** include the frontlight LED.

---

## 4. Stock and lifecycle (questions b and c)

### 4.1 LS013B7DH03 conflicting status

| Distributor | Lifecycle | Stock | Price | Source |
|---|---|---|---|---|
| DigiKey (425-2903-ND) | Active | 35,736 | $12.39 tray qty 1; $7.9728 @100; $7.7443 @500; 28-week mfr lead time | [DK](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/425-2903-ND/5300387) |
| Mouser | **Obsolete**; "Restricted Availability"; Mouser does not sell this in the user's region | not shown | not shown | [Mouser search](https://www.mouser.com/c/?q=LS013B7DH03) |
| Futureelectronics | Active | 0 global; 0 US; 0 factory | MOQ 2,240 at $6.54 (only break); 28-week lead | [FE](https://www.futureelectronics.com/p/6117773) |

**Conflict:** DigiKey shows 35,736 in stock with a 28-week factory lead time. Mouser says Obsolete. Futureelectronics shows zero. The DigiKey figure cannot be confirmed; treat it as **unverified** until a DigiKey order check or a Sharp distributor letter confirms it. Do not rely on the >500 stock claim without that check.

### 4.2 Parts with more than 500 units at an authorised distributor (question b)

- **LS013B7DH03** at DigiKey: 35,736 (claimed, see conflict above). Only fetched part with >500.
- Others fetched: LS013B7DH05 0 at DigiKey; LS011B7DH03 not in stock at DigiKey; LS014B7DD01 838 (obsolete); LS021B7DD02 838 (not in target size); Azumo 11049-06 247; Azumo 11655-03 0. None of these clear 500 except as noted.

### 4.3 Last-time-buy / discontinuation (question c)

- **No Sharp last-time-buy notice was found** on the Sharp lineup page for LS013B7DH03, LS013B7DH05, LS011B7DH03, LS012B7DD06A, LS013B7DD02, LS014B7DD01 or LS010B7DH04. The lineup page carries no status markers for those parts. [Sharp lineup](https://global.sharp/products/device/lineup/selection/lcd/mobile/index.html)
- **Mouser marks LS013B7DH03 Obsolete.** [Mouser](https://www.mouser.com/c/?q=LS013B7DH03)
- **LS014B7DD01 Obsolete at DigiKey Austria.** [DK-AT](https://www.digikey.at/en/products/detail/sharp-microelectronics/LS014B7DD01/23349347)
- **Futureelectronics PCNs on LS013B7DH03:** 08/21/2024 glass supplier change (AGC to Corning) "due to EOL of materials"; 06/13/2023 polarizer surface treatment and adhesive change, also "end-of-life for materials." These are material changes, not a panel discontinuation. [FE](https://www.futureelectronics.com/p/6117773)
- Sharp's own discontinuation list was **not fetched**; no Sharp PCN page was found. Treat "Active" on DigiKey as unconfirmed.

---

## 5. Pin / FPC summary (per part, fetched only)

| Part | FPC connector named | Pin count | Pitch | Pinout source |
|---|---|---|---|---|
| LS013B7DH03 | SMK CFP-4610-0150F / CFP-4510-0150F, Molex 51441-1093 | 10 terminals (table in section 2.1) | **NOT FOUND** | [DS](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf) |
| LS013B7DH05 | not fetched | not fetched | not fetched | not fetched |
| LS012B7DD06 (data-modul copy) | Molex 503566-2100 (bottom-side) | 21 positions (pins 2, 19, 21 NC) | not stated (0.126 mm is the dot pitch) | [DS-DM](https://www.data-modul.com/sites/default/files/products/LS012B7DD06-specification-12038622.pdf) |

---

## 6. Interface and driver

- **Zephyr driver:** `sharp,ls0xx` (on SPI bus). Required: `spi-max-frequency`, `width`, `height`. Optional: `extcomin-gpios`, `extcomin-frequency`, `disp-en-gpios`, `serial-vcom-inversion`, `serial-vcom-interval`, `supply-gpios`, `vin-supply`. Listed example panels include LS013B7DH03 and LS013B7DH05. The binding page gives no voltage requirements. [Zephyr binding](https://docs.zephyrproject.org/latest/build/dts/api/bindings/display/sharp,ls0xx.html)
- **Zephyr generic shield:** https://docs.zephyrproject.org/latest/boards/shields/ls0xx_generic/doc/index.html (seen in search results, not fetched).
- **LS013B7DH03 maps directly onto that driver:** SCLK, SI, SCS match the three SPI-style lines. The datasheet calls it serial, not SPI, so verify the clock polarity and CS timing against the datasheet before bring-up.
- **LS012B7DD06 is parallel and has a 5 V rail,** so it does not fit a SPI-only design.

---

## 7. Open items and things I could not verify

1. LS013B7DH03 stock: DigiKey (35,736) vs Mouser (Obsolete) vs Futureelectronics (0). Unresolved.
2. LS013B7DH05 technology: transflective (DigiKey) vs reflective (Azumo). Unresolved. Need the Sharp datasheet at https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/2328/LS013B7DH05.pdf (not fetched).
3. Azumo frontlight electrical specs (LED voltage, current, added thickness, outline) for 11049-06 and 11655-03: not found on fetched pages. The linked Azumo data sheet for 11049-06 was not fetched.
4. FPC pitch and pinout for LS013B7DH03 beyond the 10 terminals listed: connector pitch not found.
5. Price at qty 500 for LS013B7DH05 and both Azumo frontlit modules: not listed.
6. LS013B7DD02, LS010B7DH04, LS006B7DH03 and the transflective TFT / e-paper alternatives: not researched in full.
7. The data-modul LS012B7DD06 datasheet does not match its part name in a way I can confirm; verify with Sharp.
8. Mouser pages for LS013B7DH05 failed to load (client error), so Mouser stock for it is unknown.

---

## 8. Source list

- [LS013B7DH03 datasheet (SparkFun-hosted, non-official)](https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf)
- [LS013B7DH03 DigiKey](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/425-2903-ND/5300387)
- [LS013B7DH03 Mouser search (non-official aggregator view)](https://www.mouser.com/c/?q=LS013B7DH03)
- [LS013B7DH03 Futureelectronics (non-official)](https://www.futureelectronics.com/p/6117773)
- [LS013B7DH05 DigiKey](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH05/5799456)
- [LS013B7DH05 LCSC (non-official)](https://www.lcsc.com/product-detail/C17500193.html)
- [LS011B7DH03 DigiKey](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS011B7DH03/25953418)
- [LS014B7DD01 DigiKey Austria](https://www.digikey.at/en/products/detail/sharp-microelectronics/LS014B7DD01/23349347)
- [LS021B7DD02 DigiKey](https://www.digikey.com/en/products/detail/sharp-microelectronics/LS021B7DD02/23347701)
- [LS012B7DD06 spec (data-modul, non-official)](https://www.data-modul.com/sites/default/files/products/LS012B7DD06-specification-12038622.pdf)
- [Sharp mobile LCD lineup](https://global.sharp/products/device/lineup/selection/lcd/mobile/index.html)
- [Azumo 11049-06 page](https://www.azumotech.com/products/1-28-monochrome-display-11049-06/)
- [Azumo 11049-06 DigiKey](https://www.digikey.com/en/products/detail/azumo/11049-06-A1/9602607)
- [Azumo 11655-03 listing (GlobalSpec, non-official)](https://datasheets.globalspec.com/ds/Azumo-Tech/11655-03/7767909b-50f7-4f1b-ac38-a9629253a82a)
- [Azumo 11655-03 DigiKey Canada](https://www.digikey.ca/en/products/detail/azumo/11655-03-A1/9602603)
- [Zephyr sharp,ls0xx binding](https://docs.zephyrproject.org/latest/build/dts/api/bindings/display/sharp,ls0xx.html)
