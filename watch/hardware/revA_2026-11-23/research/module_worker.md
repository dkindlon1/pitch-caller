# Worker report: nRF52840 modules (haiku, fetched 2026-11-23) — boss to verify chosen part
- Raytac MDBT50Q-1MV2 (chip antenna) 15.5x10.5x2.05 mm, 61 pads, 32 MHz xtal + DC/DC (REG1) inductor on module, 32.768k EXTERNAL, REG0 10uH external only if VDDH used. FCC ID SH6MDBT50Q, IC 8017A-MDBT50Q. DigiKey $6.15@1, 18 in stock https://www.digikey.com/en/products/detail/raytac/MDBT50Q-1MV2/13677591 ; LCSC C5118826 out of stock.
  Datasheet: https://cdn.sparkfun.com/assets/4/7/4/3/8/_nRF52840__MDBT50Q-1MV2___MDBT50Q-P1MV2_Ver.K_spec.pdf  Antenna rule: no ground/copper under antenna on any layer.
- Raytac MDBT50Q-P1MV2 (PCB antenna) same size/pads; LCSC/JLC C5119772 "Extended" https://jlcpcb.com/partdetail/RAYTAC-MDBT50QP1MV2/C5119772 ; price/stock not seen.
- Fanstel BT840F 15x20.8x1.9, FCC X8WBT840F; no LCSC listing seen. u-blox NINA-B301: 32k on board but no internal antenna. Minew MS88SF2 DigiKey EUR 6.66, 1,051 stock (specs unclear). Ebyte E73-2G4M08S1C: no FCC ID seen, LCSC listing missing.
KiCad 7 stock library has footprint RF_Module:Raytac_MDBT50Q.
