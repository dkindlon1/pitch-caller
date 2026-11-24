# MCU / BLE module selection, watch revB

Scope: BLE 5 peripheral, LE Secure Connections bonding, AES, ~10 GPIO + SPI + 2x I2C + 1 ADC + PWM, >=256 kB flash and >=64 kB RAM after the BLE stack, MCUboot DFU over BLE, low sleep and connection current, small footprint buildable by JLCPCB/PCBWay (4-layer, no microvias preferred), low RF certification work. Zephyr / nRF Connect SDK preferred.

Sources: only pages fetched in this session (URLs given). Where a fetched page did not give a value, the cell says "not found". Where a value came from a search snippet only, it says "search snippet only, not fetched".

Conventions: "DC/DC" = supply at 3 V with DC/DC enabled unless the page says otherwise. Module-level currents are not SoC currents.

---

## 0. Summary

| Role | Part | Why |
|---|---|---|
| Best module (size + certification) | Insight SiP ISP1807 (nRF52840, 8x8x1.0 mm LGA) | Smallest fetched nRF52840 module with integrated antenna, 32 kHz crystal, 32 MHz crystal and DC/DC; FCC, IC, CE, TELEC, Bluetooth SIG IDs listed. Price/stock not retrieved. |
| Second module (cheapest verified stock) | Raytac MDBT50Q-1MV2 (nRF52840, chip antenna, 15.5x10.5x2.05 mm) | FCC SH6MDBT50Q and IC 8017A-MDBT50Q listed; DigiKey qty 1 $6.15, 18 in stock (marketplace). Larger; 32.768 kHz crystal must be added on host. |
| Best bare SoC | Nordic nRF52840 aQFN73 7x7 (NRF52840-QIAA-R) | 1 MB / 256 kB, 48 GPIO, SPI/I2C/SAADC/PWM, datasheet current table with RTC + full RAM retention. Price and stock not retrieved. |
| Open | nRF54L15 power numbers | Not found in any fetched page. Do not pick nRF54L15 on power grounds until the datasheet power section is read. |

---

## 1. Bare SoCs (Section A)

### 1.1 Memory, package, radio

| Part | Flash | RAM | Packages (size, pitch) | BLE | AES / ECC | GPIO | Source |
|---|---|---|---|---|---|---|---|
| nRF52840 | 1 MB | 256 kB | aQFN73 7x7 mm (48 GPIO); QFN48 6x6 mm (30 GPIO); WLCSP94 3.5x3.6 mm (48 GPIO). Ball/pad pitch: not found. CKAA designation not seen in fetched text (WLCSP labelled 3.544 x 3.607 mm on the Nordic page). | Bluetooth 5 | 128-bit AES co-processor; ECC P-256, Ed25519/Curve25519, RSA-2048 listed. LE Secure Connections not explicitly named. | 48 | https://docs.nordicsemi.com/r/bundle/ps_nrf52840/page/keyfeatures_html5.html ; https://www.mouser.com/datasheet/3/926/1/nrf52840-soc-v3.0.pdf |
| nRF52833 | 512 kB | 128 kB | aQFN73 7x7 mm; QFN40 5x5 mm; WLCSP 3.175x3.175 mm. Pitch: not found. | Bluetooth 5.4 (comparison table; conflicts with meta keywords) | not found | not found | https://www.nordicsemi.com/Products/nRF52833 |
| nRF52832 | 512 kB | 64 kB | Package list: not fetched from Nordic (QFAA QFN48 6x6 and CIAA WLCSP per request, not verified). | BLE 5 (per modules built on it; see 2.x) | not fetched | not fetched | https://www.mouser.com/datasheet/2/744/MDBT42Q-Version_B-1082198.pdf (module datasheet states nRF52832 with 512 kB / 64 kB) |
| nRF52811 | 192 kB | 24 kB | QFN48 6x6 mm (32 GPIO); QFN32 5x5 mm (17 GPIO); WLCSP32 2.48x2.46 mm (15 GPIO). Pitch: not found. | Bluetooth 5.4 (comparison table; meta says 5.2) | AES-128 listed; ECC not stated | 15-32 | https://www.nordicsemi.com/Products/nRF52811 |
| nRF52810, nRF52805, nRF52820 | not fetched (Nordic product pages returned only navigation) | not fetched | not fetched | not fetched | not fetched | not fetched | https://www.nordicsemi.com/Products/nRF52810 ; https://www.nordicsemi.com/Products/nRF52805 |
| nRF5340 | App core 1 MB; net core 256 kB | App 512 kB; net 64 kB | aQFN94 7x7 mm; WLCSP95 (images list 4.4x4.0 mm). Pitch: not found. | Bluetooth 5.4 (table; meta says 5.3) | not found | not found | https://www.nordicsemi.com/Products/nRF5340 |
| nRF54L15 | 1524 kB non-volatile (RRAM) | 256 kB | QFN48 6x6 mm and CSP per request; sizes and pitch not found in fetched text. | SoC BLE version not found in fetched text (the Raytac AN54LQ module page lists Bluetooth 6.0: https://www.acalbfi.com/technologies/communications/wireless-connectivity/bluetooth-modules/an54lq-series-bluetooth-6-0-lga-module-nrf54l05-nrf54l10-nrf54l15-based/) | not found in fetched text | not found | https://docs.nordicsemi.com/r/xtYqc8FBbjZ9zOaVr~LAaw/NwqCw7cW~aL751XsX3GSDw (memory table in page meta) |
| nRF54L10 | 1012 kB non-volatile (RRAM) | 192 kB | not found | not found | not found | not found | same URL as above |
| nRF54L05 | 500 kB non-volatile (RRAM) | 96 kB | not found | not found | not found | not found | same URL as above |

Note: the Ezurio BL54L10 page gives 1022 kB RRAM and 192 kB RAM for the nRF54L10 (https://www.ezurio.com/documentation/datasheet-bl54l15-series). This differs from the Nordic meta value of 1012 kB. Not resolved.

### 1.2 Current consumption

| Part | System OFF, no RAM | System ON, RTC wake, no RAM | System ON, RTC + RAM retention | TX 0 dBm, 3 V, DC/DC | RX 3 V, DC/DC | CPU active | Source |
|---|---|---|---|---|---|---|---|
| nRF52840 | 0.4 uA | 1.5 uA | 3.16 uA (full 256 kB RAM + RTC); full RAM retention without RTC 2.35 uA; no-RAM ON base 0.97 uA | 6.40 mA (datasheet "DC/DC at 3 V" table). Product page lists 4.8 mA peak TX at 0 dBm with no stated conditions; the two values conflict, the 6.40 mA figure is used here. | 6.26 mA at 1 Mbps (DC/DC 3 V) | 52 uA/MHz, CoreMark from flash, 64 MHz M4F (product page) | https://docs.nordicsemi.com/r/bundle/ps_nrf52840/page/keyfeatures_html5.html ; https://www.mouser.com/datasheet/3/926/1/nrf52840-soc-v3.0.pdf ; https://docs.nordicsemi.com/r/bundle/ps_nrf52840/page/_tmp/nrf52840/autodita/current/parameters.i_sleep.html |
| nRF52832 | 0.3 uA (System OFF, no RAM) | not found on SoC page | not found | not found | not found | not found | https://docs.nordicsemi.com/r/bundle/ps_nrf52832/page/power.html (System ON base current 1.2 uA, no RAM retention; 20 nA per 4 kB RAM section retained) |
| nRF52833 | not found | not found | not found | not found | not found | not found | https://www.nordicsemi.com/Products/nRF52833 (no current figures on page) |
| nRF52811 | not found | not found | not found | TX power +4 dBm stated, current not found | not found | not found | https://www.nordicsemi.com/Products/nRF52811 |
| nRF5340 | not found | not found | not found | not found | not found | not found | https://www.nordicsemi.com/Products/nRF5340 |
| nRF54L15 / L10 / L05 | not found | not found | not found | not found | not found | not found | https://docs.nordicsemi.com/r/bundle/ps_nrf54l15/page/keyfeatures_html5.html (power pages returned no figures) ; https://docs.nordicsemi.com/r/xtYqc8FBbjZ9zOaVr~LAaw/hU6UXgrZQn20z5feKvztEA (no figures) |

### 1.3 Reference SoCs (Section A, "for reference")

| Part | Flash / RAM | Package sizes, pitch | BLE | Sleep | TX 0 dBm 3 V | RX 3 V | CPU active | Source |
|---|---|---|---|---|---|---|---|---|
| Ambiq Apollo3 Blue | up to 1 MB flash, up to 384 KB SRAM | 5x5 mm 81-pin BGA (50 GPIO); 3.37x3.25 mm 66-pin WLCSP (37 GPIO). Pitch: not found. | Bluetooth 5 LE | 1 uA deep sleep, BLE in shutdown, RTC on (3.3 V). RAM retention: not found. | 3 mA (supply and DC/DC not stated) | 3 mA (conditions not stated) | 6 uA/MHz from flash or RAM at 3.3 V | https://cdn.sparkfun.com/assets/c/2/6/2/9/Apollo3-Blue-MCU-Datasheet.pdf |
| Renesas DA14531 | no flash (48 kB retainable system RAM; 32 kB OTP; 144 kB ROM) | WLCSP 17 balls 1.7x2.05 mm, 0.5 mm pitch; FCGQFN 24 pins 2.2x3 mm, 0.4 mm pitch | Bluetooth 5.1 | not found (only hibernation: buck 270 nA, boost 240 nA) | 3.5 mA with DC/DC, VBAT 3 V, 0 dBm (system current) | 2.2 mA (same conditions) | not found | https://www.renesas.com/en/document/dst/da14531-datasheet?r=1600096 |
| Silicon Labs EFR32BG22 (datasheet file efr32bg22l-datasheet.pdf) | 352 kB flash, 24 kB RAM (ordering info) | QFN32 4x4x0.85 mm; pitch not found | Bluetooth 5.x | EM2 with RAM retention and RTC, 3.0 V, DC-DC: 1.32 uA (LFXO), 1.66 uA (LFRCO) | 4.1 mA system (EM1P), radio-only 3.4 mA; 4.3 mA at VSCALE1 | 3.6 mA system, radio-only 2.5 mA | 26 uA/MHz (while loop from flash, DC-DC 3.0 V) | https://www.silabs.com/documents/public/data-sheets/efr32bg22l-datasheet.pdf |
| TI CC2340R5 | not found | RGE 24-pin, YBG 28-pin, RKP 40-pin (dimensions not in fetched text) | not found | not found | not found | not found | not found | https://ti.com/document-viewer/cc2340r5/datasheet |

Fails the 256 kB flash / 64 kB RAM requirement or leaves it unresolved: DA14531 (no flash), EFR32BG22 (352 kB flash, 24 kB RAM is below the 64 kB RAM minimum), CC2340R5 (not found).

### 1.4 Price, stock, lead time, Zephyr status

| Part | Price qty 1 | Price qty 100 | Stock | Lead time | Zephyr / NCS status | Source |
|---|---|---|---|---|---|---|
| NRF52840-QIAA-R (DigiKey) | not found in fetched text | not found | not found | 16 weeks (manufacturer standard) | Not fetched | https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NRF52840-QIAA-R/7725416 |
| NRF54L15-QFAA-R (DigiKey CA) | not found | not found | not found | 16 weeks | Not fetched; Nordic dev kit listed on DigiKey (search snippet only) | https://www.digikey.ca/en/products/detail/nordic-semiconductor-asa/NRF54L15-QFAA-R/24773455 |
| nRF52833, nRF52832, nRF5340, nRF52811, nRF52810/05/20, nRF54L10/05 | not found | not found | not found | not found | not verified | - |
| Apollo3 Blue, DA14531, EFR32BG22, CC2340R5 | not found | not found | not found | not found | not verified | - |

Zephyr: the Zephyr board pages fetched only cover the modules (sections 2.x). No Zephyr page for the bare SoCs was fetched in this session.

---

## 2. Pre-certified modules (Section B)

### 2.1 Summary table

| Module | SoC | Size LxWxH | Pads / pitch | Antenna | 32.768 kHz on module | DC/DC inductor on module | Flash / RAM | Certification IDs | Price qty 1 / 100, stock | Zephyr |
|---|---|---|---|---|---|---|---|---|---|---|
| Insight SiP ISP1807-LR (order code format ISP1807-TT-ZZ) | nRF52840 | 8 x 8 x 1.0 mm | LGA, double row, 0.65 mm pitch; land 0.4x0.4 mm, corners 0.8x0.8 mm | Integrated, 0.6 dBi | Yes | Yes (module total 13 uH) | 1 MB / 256 kB | FCC 2AAQS-ISP1807; IC 11306A-ISP1807; TELEC 020-200037; KCC R-C-iNs-ISP1807; NCC CCAJ23Y10060T5; CMIT 2022DJ13685; ANATEL 04057-23-14043; Bluetooth SIG D046560; CE DoC TR211203 | not retrieved (DigiKey product page not fetched) | not found |
| Raytac MDBT50Q-1MV2 (chip) / MDBT50Q-P1MV2 (PCB) | nRF52840 | 15.5 x 10.5 x 2.05 mm (chip); 2.0 mm (PCB) | Not found in text | Chip / PCB | No (external 32.768 kHz on XL1/XL2; module defaults LDO mode) | RF VDD inductor on module; Reg0 inductor (10 uH) external | 1 MB / 256 kB | FCC SH6MDBT50Q; IC 8017A-MDBT50Q; NCC CCAM18LP0820T7; QDID not listed as number; CE test report | $6.15 qty 1 (DigiKey, marketplace); qty 100 not found; 18 in stock | Board raytac_mdbt50q_db_40 (nRF52840) in Zephyr docs; limits noted |
| Raytac MDBT42Q-512K (chip) / MDBT42Q-P512K (PCB) | nRF52832 | 16 x 10 x 2.2 mm | Not found in text | Chip / PCB | Not explicit (XL1/XL2 pins for external crystal) | Internal DC/DC default; L2/L3 listed as removable in reference circuit | 512 kB / 64 kB | FCC SH6MDBT42Q; IC 8017A-MDBT42Q; NCC CCAM16LP1180T2 (MDBT42Q), CCAM16LP1181T1 (MDBT42Q-P) | LCSC C2828282 "MDBT42Q-512KV2": from $5.9576 USD, out of stock (listing name differs from datasheet name) | not fetched |
| Raytac AN54LQ-15 (chip) / AN54LQ-P15 (PCB) (nRF54L15 family) | nRF54L15 (per family page) | 13.7 x 9.5 x 1.8 mm | LGA; pitch not found | Chip / PCB | not found | not found | up to 1.5 MB / up to 256 kB | FCC, IC, CE, Telec, KC, SRRC, NCC, RCM, WPC listed; no numeric IDs in fetched text | not found | Board raytac_an54l15q_db (nRF54L15), supported features listed; no J-Link on board |
| u-blox ANNA-B112-00B-00 (nRF52832, u-connectXpress) | nRF52832 | 6.5 x 6.5 x 1.2 mm | Not found | Internal antenna pin ANT_INT; external tuning strip pins | No (external crystal or internal RC needed) | DC/DC integrated; inductor on module not stated | 512 kB / 64 kB | No FCC, IC, CE or QDID numbers in fetched text | DigiKey UK: status Obsolete; price and stock not found | not found |
| u-blox ANNA-B412-00B (nRF52833) | nRF52833 | 6.5 x 6.5 x 1.2 mm | Not found | ANT_PCB (corner mount), ANT_GND1/2 (mid-edge mount); no keep-out distances | No | DC/DC integrated; inductor on module not stated | 512 kB / 128 kB | QDID 138767 (end products); no FCC, IC, CE number in fetched text | not found | not found |
| Fanstel BM832 (nRF52832) / BM832A (nRF52810) | nRF52832 (BM832, BM832E); nRF52810 (BM832A) | 10.2 x 15.0 x 1.9 mm | 16 castellated + 24 LGA; pitch not found | Integrated PCB trace (BM832, BM832A); u.FL (BM832E) | No (added on host) | Yes (two inductors inside module) | BM832 512/64 kB; BM832A 192/24 kB | FCC X8WBM832; IC 4100A-BM832; TELEC 201-180924; QDID 97989; CE listed (no ID) | not found | not found |
| Ezurio BL54L15 (453-00001 trace; 453-00044 MHF4) | nRF54L15 | 14 x 10 x 1.6 mm | LGA, three rows, 0.75 mm pitch | Trace (must sit on host PCB edge) or IPEX MHF4 | No (optional, host side XL1/XL2) | Not stated (supply "Internal DCDC or LDO") | 1524 kB RRAM / 256 kB RAM | No numeric IDs in fetched text (FCC/ISED/CE/MIC listed) | not found | not found |
| Ezurio BL54L10 (453-00225 trace; 453-00226 MHF4) | nRF54L10 | not separately fetched (same family datasheet) | LGA family | Trace or MHF4 | not stated | not stated | 1022 kB RRAM / 192 kB RAM | not found | not found | not found |
| Panasonic PAN1780 (ENW89854A1KF, empty flash, with antenna) | nRF52840 | 15.6 x 8.7 x 2.0 mm (with case) | Not found | "with Antenna", type not stated | Yes (integrated 32 kHz crystal) | Not specified ("on-module DC/DC and LDO") | 1 MB / 256 kB | None listed; "FCC, IC, and CE approval are in preparation" | not found | not found |
| Murata WSM-BL241 (product brief URL labelled MBN52832; the PDF returned is WSM-BL241) | nRF52832 (per Cortex-M4 and 512/64 kB; SoC name not explicitly stated) | 7.4 x 7.0 x 0.9 mm | LGA; pitch not stated | On-board PCB; external via pad | not stated | not stated | 512 kB / 64 kB | FCC, IC, ETSI, TELEC listed; no IDs | not found | not found |
| Insight SiP ISP1507 (ISP1507-AX-RS) | not verified in fetched text | not fetched | not fetched | Integrated trace (DigiKey attributes) | not fetched | not fetched | not fetched | not fetched | not found; DigiKey manufacturer lead time 40 weeks | not found |
| Minew MS50SFB (nRF52832 variant) | nRF52832 (per search snippet) | not fetched (datasheet PDF exists) | not fetched | not fetched | not fetched | not fetched | not fetched | FCC ID 2ABU6-MS50SFB (search snippet only) | not found | not found |
| Ezurio BL652, Fanstel BM833 / BC833 / BM15, Raytac MDBT42V, Panasonic PAN1781, Seeed XIAO nRF54L15 (module) | - | not fetched or not found | - | - | - | - | - | - | - | - |

Notes:
- The XIAO nRF54L15 (SKU 114993696) datasheet link is a board product sheet: 1.5 MB NVM and "128 MHz Arm Cortex-M33", no size, pad, antenna, certification or current figures. Source: https://files.seeedstudio.com/Bazaar/product_pdf/114993696.pdf
- Raytac AN54LQ page: TX up to +8 dBm, RX BLE 1M about -96 dBm, supply 1.7 V to 3.6 V, operating -40 to +105 C. Source: https://www.acalbfi.com/technologies/communications/wireless-connectivity/bluetooth-modules/an54lq-series-bluetooth-6-0-lga-module-nrf54l05-nrf54l10-nrf54l15-based/
- ANNA-B412 TX and RX (conducted, 25 C): typical +8 dBm, RX -94 dBm at 1 Mbit/s; sleep 400 nA at 3.3 V (UART DSR, no RAM retention). No 0 dBm figure. Source: https://content.u-blox.com/sites/default/files/ANNA-B412_DataSheet_UBX-21028698.pdf

### 2.2 Keep-out and placement rules (datasheet text)

| Module | Rule as stated | Source |
|---|---|---|
| ISP1807 | "no metal, no traces and no components on any application PCB layer except mechanical LGA pads." Diagram shows 18.0 mm minimum and a 4.0 mm dimension whose meaning is not stated. | https://www.mouser.lt/datasheet/3/1572/1/isp_ble_DS1807.pdf |
| MDBT50Q (chip) | Exact distances not in text. "Make sure to keep the 'No Ground Pad' as wider as you can." Place near PCB edge for better performance. | https://cdn.sparkfun.com/assets/4/7/4/3/8/_nRF52840__MDBT50Q-1MV2___MDBT50Q-P1MV2_Ver.K_spec.pdf |
| MDBT42Q | Exact distances not in text. "When design is not allowed to leave such space, please make sure to keep the 'No-Ground-Pad' as wider as it can." | https://www.mouser.com/datasheet/2/744/MDBT42Q-Version_B-1082198.pdf |
| BL54L15 (trace antenna) | Module must be on host PCB edge, preferably edge centre. Keep-out about 5 mm wide x 28.6 mm long, no copper on any layer. Keep metal at least 40 mm from top/bottom and 30 mm from left/right; metal closer than 20 mm significantly degrades performance. | https://www.ezurio.com/documentation/datasheet-bl54l15-series |
| BM832 | Antenna area extends 4.4 mm beyond host PCB edge; ground plane at least 5 mm from antenna area edge; keep external metal at least 30 mm from antenna area; no ground plane below antenna; not for metal cases; mounting mid-board not recommended. | https://www.mouser.com/catalog/specsheets/Fanstel%20Corporation_03072019_BM832.pdf |
| ANNA-B112 / ANNA-B412 | No keep-out distances in the datasheet; refer to the ANNA-B4 system integration manual. ANT_PCB for corner mount, ANT_GND1/2 for mid-edge mount (ANNA-B412). | https://content.u-blox.com/sites/default/files/ANNA-B412_DataSheet_UBX-21028698.pdf |
| AN54LQ | Not extracted from fetched page. | https://www.acalbfi.com/technologies/communications/wireless-connectivity/bluetooth-modules/an54lq-series-bluetooth-6-0-lga-module-nrf54l05-nrf54l10-nrf54l15-based/ |

### 2.3 Module current figures (module datasheets, not SoC)

| Module | TX | RX | Sleep | Conditions | Source |
|---|---|---|---|---|---|
| ISP1807 (nRF52840) | 16.4 mA peak at +8 dBm; 6.4 mA peak at 0 dBm | 6.26 mA peak at 1 Mbps | System OFF 0.4 uA; System ON RTC wake 1.5 uA (no RAM retention) | VCC 3 V, DC/DC | https://www.mouser.lt/datasheet/3/1572/1/isp_ble_DS1807.pdf |
| PAN1780 (nRF52840) | 4.8 mA at 0 dBm | 4.8 mA | SYS OFF 0.4 uA (no RAM retention); SYS ON 1.5 uA (RTC, no RAM retention) | VDD 3.3 V, 25 C, DC/DC enabled | https://www.mouser.com/datasheet/2/315/preliminary_wm_pan1780_product_specification-1730518.pdf |
| MDBT50Q (nRF52840) | not in text (tables are images) | not in text | 0.4 uA SYS OFF; 1.5 uA SYS ON RTC (no RAM) | 3 V | https://cdn.sparkfun.com/assets/4/7/4/3/8/_nRF52840__MDBT50Q-1MV2___MDBT50Q-P1MV2_Ver.K_spec.pdf |
| MDBT42Q (nRF52832) | not in text (tables are images); output range +4 to -20 dBm | not in text | not in text | - | https://www.mouser.com/datasheet/2/744/MDBT42Q-Version_B-1082198.pdf |
| ANNA-B112 (nRF52832, u-connectXpress) | 5.3 mA at +0 dBm | 5.4 mA | No clocks, no RAM: 300 nA; RTC + 64 kB RAM retention with 32.768 kHz crystal: 2.2 uA; DSR sleep average 300 nA | 3.0 V, DC/DC | https://www.mouser.com/datasheet/2/1025/ANNA_B112_DataSheet_UBX_18011707-2935661.pdf |
| ANNA-B412 (nRF52833) | typical +8 dBm conducted; 0 dBm not stated | not in fetched extract | 400 nA average at 3.3 V (UART DSR, no RAM) | 25 C | https://content.u-blox.com/sites/default/files/ANNA-B412_DataSheet_UBX-21028698.pdf |
| BM832 (nRF52832) | not stated | not stated | not stated | "Receiver sensitivity -96 dBm at 1 Mbps" only | https://www.mouser.com/catalog/specsheets/Fanstel%20Corporation_03072019_BM832.pdf |
| BL54L15 (nRF54L15) | 17 mA peak / 8.3 mA average at 3.3 V LE 1M, +7 dBm max; 14 mA peak CW at 3.3 V | 0 dBm figure not stated in fetched extract | System OFF 0.6 uA; System ON idle 3 uA (GRTC, 256 kB RAM), 2.6 uA (192 kB RAM) | 3.3 V | https://www.ezurio.com/documentation/datasheet-bl54l15-series |
| Murata WSM-BL241 | 7 mA at +3.5 dBm (DC/DC) | 6 mA (DC/DC) | not stated | - | https://www.mouser.lt/datasheet/2/281/mbn52832_product_brief-1139650.pdf (URL returned WSM-BL241 content) |
| AN54LQ (nRF54L15) | not in text | not in text | not in text | - | https://www.acalbfi.com/... (page only lists TX and RX sensitivity) |

### 2.4 Module price and stock

| Module | Source | Price qty 1 | Price qty 100 | Stock |
|---|---|---|---|---|
| MDBT50Q-1MV2 | https://www.digikey.com/en/products/detail/raytac/MDBT50Q-1MV2/13677591 | $6.15 (ext. $6.15); marketplace item, ships in about 14 days, plus $25 flat shipping | not found | 18 |
| MDBT42Q-512KV2 (LCSC name) | https://www.lcsc.com/product-detail/C2828282.html | "From $5.9576" (USD, qty break not shown) | not found | Out of stock |
| ANNA-B112-00B | https://www.digikey.co.uk/en/products/detail/u-blox/ANNA-B112-00B/9817926 | not found (page truncated) | not found | not found (status: Obsolete) |
| ISP1507-AX-RS | https://www.digikey.com/en/products/detail/insight-sip/ISP1507-AX-RS/7100140 | not found | not found | not found (40-week lead time) |
| ISP1807-LR-RS | not fetched (DigiKey listing ID 10231699 seen in search only) | not found | not found | not found |
| BL54L15, BM832, PAN1780, AN54LQ, MS50SFB, XIAO nRF54L15 | - | not found | not found | not found |

---

## 3. Certification facts (Section C)

| Topic | Finding | Source |
|---|---|---|
| Modular approval covers intentional radiation | "the radio's modular approval means that you do not have to do any testing to FCC 15.247 for intentional radiators. The module's FCC ID fulfills that requirement." | https://www.digi.com/support/knowledge-base/fcc-modular-approval |
| Host still needs Part 15 unintentional testing | Host "probably still need[s] to go through FCC Part 15 Class A or B testing for unintentional radiation." Part B self-declaration allowed. Class B is for residential/small office. | https://www.digi.com/support/knowledge-base/fcc-modular-approval |
| Cost, intentional radiation (Digi estimate) | "Typical testing will take a week or two and run you $10,000-25,000." Vendor page, not a regulator. This is for the intentional-radiation test that a bare-SoC design would need. | https://www.digi.com/support/knowledge-base/fcc-modular-approval |
| Cost, Part 15 Class A/B (Digi estimate) | "will only take a day and cost $1,500-$2,500." | https://www.digi.com/support/knowledge-base/fcc-modular-approval |
| Host compliance with module installed | The host manufacturer must show 15B compliance "while the module(s) are installed and operating." | https://transition.fcc.gov/oet/ea/presentations/files/oct16/23-Equipment-Authorization-Modular-Devices-101216-JS.pdf |
| Module shielding and retained control | "The shielding design must fully enfold the RF circuitry." Responsible party must "demonstrate how it will retain control over the final installation." | https://transition.fcc.gov/oet/ea/presentations/files/oct16/23-Equipment-Authorization-Modular-Devices-101216-JS.pdf |
| Certified module reduces certification filing | Page says using certified modules can mean "a reduction or elimination of certification filing." No cost given. | https://transition.fcc.gov/oet/ea/presentations/files/oct16/23-Equipment-Authorization-Modular-Devices-101216-JS.pdf |
| Bare SoC with own antenna | Needs full intentional-radiator certification. No fetched page gave a cost specific to a bare-SoC design. | not found |
| Bluetooth SIG listing (QDID) | Module QDIDs seen: ANNA-B412 QDID 138767 (end products); BM832 QDID 97989; ISP1807 Bluetooth SIG Declaration ID D046560. Cost and process for a bare-SoC QDID not fetched. | https://content.u-blox.com/sites/default/files/ANNA-B412_DataSheet_UBX-21028698.pdf ; https://www.mouser.com/catalog/specsheets/Fanstel%20Corporation_03072019_BM832.pdf ; https://www.mouser.lt/datasheet/3/1572/1/isp_ble_DS1807.pdf |
| Part 15B for bare SoC or module | Not separately fetched. | not found |

---

## 4. Requirement check

| Requirement | nRF52840 SoC | ISP1807 (nRF52840) | MDBT50Q (nRF52840) | nRF52832 modules (MDBT42Q, ANNA-B112, BM832) | nRF54L15 family |
|---|---|---|---|---|---|
| Flash >= 256 kB | 1 MB | 1 MB | 1 MB | 512 kB | 1.5 MB (L15), 1.0 MB (L10), 500 kB (L05) |
| RAM >= 64 kB after BLE | 256 kB | 256 kB | 256 kB | 64 kB (leaves little after stack; not verified) | 256 kB (L15), 192 kB (L10), 96 kB (L05) |
| Sleep, RTC + RAM | 3.16 uA (full RAM) | 1.5 uA (no RAM); RAM retention per 4 kB block figure is garbled in datasheet | not found on module | 2.2 uA (ANNA-B112, module) | not found |
| TX 0 dBm, 3 V DC/DC | 6.40 mA | 6.4 mA peak | not found | 5.3 mA (ANNA-B112) | not found at 0 dBm (BL54L15 gives 14 mA peak CW at 3.3 V, max +7 dBm, radio only) |
| RX, 3 V DC/DC | 6.26 mA | 6.26 mA peak | not found | 5.4 mA (ANNA-B112) | not found (BL54L15 RX current not in fetched extract) |
| Size | 7x7 aQFN73 | 8x8x1.0 LGA | 15.5x10.5x2.05 | 6.5x6.5 (ANNA-B112/B412), 16x10 (MDBT42Q), 10.2x15 (BM832) | 13.7x9.5x1.8 (AN54LQ), 14x10x1.6 (BL54L15) |
| Pre-certified | no | yes (FCC, IC, CE, TELEC, NCC, KCC) | yes (FCC, IC, NCC) | ANNA-B412 QDID only; MDBT42Q FCC, IC, NCC; BM832 FCC, IC, TELEC, QDID | AN54LQ and BL54L15 list agencies, no numeric IDs |
| Zephyr | not verified on fetched pages | Not fetched | Board page exists (nRF52840) | Not fetched | Board page exists (AN54L15Q) |

---

## 5. Open questions

1. nRF54L15 power: no fetched page gave System ON, TX, RX or CPU current. Read the nRF54L15 datasheet "Power" and "Electrical specifications" sections before choosing it.
2. LE Secure Connections and MCUboot: not explicitly confirmed on any fetched page. Confirm in the SoC datasheet and NCS docs.
3. ISP1807 pad count: the drawing caption says 62 pads but the pin table lists pads up to 78 as NC. Confirm the pad map and whether a 4-layer board with 0.65 mm LGA pitch needs microvias. Not stated in the datasheet.
4. ISP1807 price and stock: DigiKey page for ISP1807-LR-RS was not fetched.
5. nRF52840 price, stock at qty 1 and 100: DigiKey product page did not show pricing in the fetched text.
6. nRF52840 TX 0 dBm: product page gives 4.8 mA peak with no conditions; the datasheet table gives 6.40 mA DC/DC at 3 V. The 6.40 mA is used here. Confirm against the spec PDF.
7. MDBT50Q keep-out distances: not in text; read the Raytac integration guide.
8. The URL labelled "mbn52832_product_brief" returned WSM-BL241 content. The MBN52832 datasheet was not obtained.
9. Insight ISP1507: SoC, size and certifications were not confirmed from a fetched datasheet; the search snippet says "8x8x1mm" BLE 4.2 but this was not fetched.
10. Not searched: Raytac MDBT42V, Fanstel BM833/BC833/BM15, Ezurio BL652/BL653, Minew MS88SF, Panasonic PAN1781.
11. Memory for user: nothing from memory was used in this report.
