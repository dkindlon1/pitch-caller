# Review brief (read this first)
Board: PitchIQ watch rev A. A custom PCB to run an existing Espruino app (shows a pitch call, buzzes) that today targets a
Bangle.js 2 watch. Nothing has been built. You are an independent reviewer: find defects, do not fix files.
Files (all under /home/claude/pitchiq-watch-hw):
- scripts/design.py  : single source of truth: every part, pin, net, footprint, MPN, LCSC number. START HERE.
- docs/01_software_audit.md : what the app needs. App source: /home/claude/dkindlon1/pitch-caller/watch/bangle/pitchiq.app.js
- Firmware reference: /home/claude/espruino-ref (boards/BANGLEJS2.py, libs/banglejs/jswrap_bangle.c, libs/graphics/lcd_memlcd.c, targets/nrf5x)
- kicad/pitchiq_watch.kicad_sch / .kicad_pcb (KiCad 7.0.11; python3 `import pcbnew` works for read-only inspection; do NOT save)
- scripts/gen_pcb.py (placement coordinates, rules, planes), scripts/router.py (grid autorouter), out/drc_report.txt
- out/fab/ (gerbers, drill, bom_jlcpcb.csv, cpl_jlcpcb.csv), docs/BOM.csv
- research/*.md : worker research notes with URLs (display, module, power parts, fab/compliance, verification)
Key decisions already made: Raytac MDBT50Q-1MV2 module (nRF52840), same GPIOs as Bangle.js 2 for LCD/backlight/button/
motor/battery/flash so a Bangle.js 2 firmware image sees the same pins; JDI LPM013M126 LCD on a 10-pin 0.5 mm FPC (Hirose
FH12-10S-0.5SH(55)); TPS7A0230 3.0 V LDO from the LiPo; MCP73832 charger at 77 mA from USB-C; 8 MB GD25Q64E flash;
AO3400A low-side switches for motor and backlight; battery and motor leads hand-soldered to pads; 4-layer 0.8 mm board
32 x 36 mm, inner layers GND and 3V0 planes, autorouted by a script.
Known and already disclosed (do not re-report unless you add something new): no board built or tested; firmware not
compiled; display only from Switch Science/brokers; backlight connector Molex 503480-0400 not purchasable so J2 is 4 bare
pads; FPC orientation unconfirmed without the display in hand; KiCad 7 has no CLI ERC so ERC was not run.
You may use WebSearch/WebFetch to check datasheets. Do not edit, create or delete any file. Do not run builds.
Return at most 30 lines: numbered findings, each: severity (BLOCKER / MAJOR / MINOR), what is wrong, the evidence (file:line
or datasheet URL + figure), and the fix you recommend. Then one line: what you checked and found correct. No praise.
