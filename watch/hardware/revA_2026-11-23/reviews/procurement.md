# Procurement review (sonnet, read-only, seen 2026-11-23) — findings
1 MAJOR U1 MDBT50Q-1MV2: DigiKey marketplace listing "no longer available"; LCSC C5118826 out of stock (from $18.60). Buyable: SparkFun WRL-21605 $8.95@1 / $8.50@25 / $8.06@100 in stock (sparkfun.com/nordic-nrf52840-ble-module-mdbt50q-1mv2.html); X-ON 494 stock $12.21@1 / $8.90@25. Budget $8-12.
2 MAJOR second source: only Raytac's own -P1MV2 (PCB antenna; DigiKey marketplace 42 stock $6.00 + $25 ship ~14 days; LCSC C5119772 out of stock) — same pads, different antenna keep-out. Raytac direct: sales@raytac.com, no web store.
3 MAJOR display: Switch Science 2858 LPM013M126A is WITHOUT backlight, JPY 3,960, 19 stock; international site $34.28 (not $26.40). Backlit LPM013M126C (catalog/5394, JPY 5,280) sold out / discontinued there. Brokers RFQ only (AERI 1,478 "in network"). No same-resolution alternative. Switch Science bundles an FH28-10S-0.5SH connector.
4 MAJOR C19666 4.7uF 0603: LCSC meta shows stock 10 -> confirm or pick a deep-stock part.
5 OK all 15 existing LCSC numbers match MPNs. C2985486 TVS from $0.0125. C38066 from $0.4509.
6 Blank cells filled: 13k 0402WGF1302TCE = C25754 (Ext); 47R 0402WGF470JTCE = C25118 (Ext); 3.3M -> Yageo RC0402FR-073M3L = C470023 (Ext, 34,100 stock); 18pF CL05C180JB5NNNC = C307443 (Ext); J1 FH12-10S-0.5SH(55) = C506791 (bottom contact, 0.3 mm FPC, 6,011 stock, from $0.3016, Ext).
7 Battery Adafruit 1317 in stock $5.95/$5.36@10/$4.76@100, UN38.3 report listed, JST-PH lead (cut to solder); Adafruit says charge <= 150 mA (100 mA suggested). 
8 Motor FIT0774 spec (Mouser overview PDF): 3 V, 50 mA rated, 1.5-4.2 V operating, 11,000 rpm. Alt: Precision Microdrives 310-103 (58 mA typ, start 106 mA).
9 JLC Extended lines: 12 (each adds a loading fee); Basic: 9. Possible swap 18pF -> 22pF C1555 Basic.
10 No EOL notices found. Long-lead: module, LCD, motor 9 weeks at DigiKey.
