# Worker report: display (haiku, fetched 2026-11-23) — boss must verify pin table against PDF
Datasheet: https://www.espruino.com/datasheets/LPM013M126C.pdf ; A-variant: https://www.data-modul.com/sites/default/files/products/LPM013M126A-specification-12022028.pdf
FPC 10 pins: 1 SCLK, 2 SI, 3 SCS, 4 EXTCOMIN, 5 DISP, 6 VDDA, 7 VDD, 8 EXTMODE, 9 VSS, 10 VSSA. Connector named in datasheet: Hirose FH28-10S-0.5SH(05) (0.5 mm pitch inferred).
Backlight FPC 4 pins: Cathode2, Cathode1, Anode, Anode. Connector: Molex 503480-0400. LED: 2-chip white, max 30 mA, Vf ~2.67 V, 15 mA typ (1S2P per lcds-screen).
VDD/VDDA 2.7 / 3.0 typ / 3.3 max, abs max 3.6 V. VDD first or together with VDDA. SPI 1 MHz typ, 2 MHz max. EXTCOMIN 1-140 Hz. EXTMODE H = EXTCOMIN pin used.
Power: no-update 2 uW typ, update 10 uW typ (extraction garbled - verify).
Bangle.js 2 page: backlight on = +16 mA; touch is separate CST816D.
Sourcing: NOT on DigiKey/Mouser/LCSC. Switch Science JDI-LPM013M126A SKU 2858 JPY 3,960, 19 in stock https://www.switch-science.com/catalog/2858/ (page says no light element -> A variant may lack backlight). Brokers: AERI (1478 "in network"), lcds-screen (RFQ). 
Alternatives (NOT drop-in, different resolution, mono): Sharp LS013B7DH03 128x128 DigiKey $12.39@1/$7.97@100, 35,738 stock; LS013B7DH05 144x168 not stocked.
No 176x176 colour drop-in found.
RISK: display is single-source / broker-only. Top supply risk.
