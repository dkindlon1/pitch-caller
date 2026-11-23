# QA review (sonnet, read-only) — findings
1 BLOCKER(verify) button polarity: stock image expects pin HIGH = pressed (BANGLEJS2.py:135 IN_PULLDOWN; build_platform_config.py:154 ONSTATE=1; jswrap_bangle.c:1273, :5913). Board wires to GND.
2 MAJOR copper strip (12.4 x 0.35 mm, all 4 layers) between board top edge and U1 keep-out at the antenna tip; planes inset only 0.3 mm. Fix: extend keep-out to board edge.
3 MAJOR deep-discharge boot loop on USB (precharge ~7.7 mA < load); no UVLO; charger may never terminate. Fix: firmware low-battery shutdown / supervisor; test.
4 MAJOR no polarity silk on BT1/M1, no reverse protection, no fuse; motor at up to 4.2 V.
5 MAJOR J1 mirrored case mapping: display supplies meet GPIOs, blank display, possible stress. First power with FPC unplugged, current-limited. FH12 vs datasheet FH28: contact side unconfirmed.
6 MAJOR check is circular (generators vs design.py); orientation/polarity of J1 pin 1, SW1 actuator, J3 not covered by any script.
7 MINOR DRC blind spots: mask expansion 0 / web 0 / paste margin 0; no stackup; no .kicad_dru; some severities ignored by default; warnings pass; 22 vias under module (tented).
8 Measured: min track-track 0.200 mm; min track-to-other-pad ~0.175 mm; min copper-edge 0.251 mm (plane), tracks 1.0, vias 0.85.
9 MINOR BOM.csv descriptions wrong for grouped lines (R2/R7/R8, Q1); paste on DNP/hand pads; schematic PDF older than .kicad_sch; check.sh passes with blank LCSC cells.
10 MINOR battery scaling +3.6%. 11 MINOR LFXO failure = hang at SoftDevice start. 12 MINOR ESD: only VBUS clamp; button straight to module pin.
13 MINOR flash absent undetected; A-variant display may have no backlight.
14 Bring-up tests to add (with pass criteria): rail resistance before power; 3V0 = 3.00 V +/-3%; idle current; charge 77 mA +/-15% and STAT; USB no battery; SWD attach; flash JEDEC ID 0xC84017; LFXO within 20 ppm; button levels; backlight 5-9 mA/LED; motor < 120 mA; RSSI vs Bangle.js 2 at 1 m; J1 pin-1 continuity before plugging display; ESD 4 kV on button.
