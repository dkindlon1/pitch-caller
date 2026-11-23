# PCB design review (sonnet, read-only) — findings
1 MAJOR button polarity uncertain: BANGLEJS2.py BTN1 D17 IN_PULLDOWN; build_platform_config.py:154-158 -> BTN1_ONSTATE=1 (no "inverted"); jswrap_bangle.c:5913 pressed = pin high. Board wires SW1 to GND -> may never register. (jswrap_bangle.c:5899 SENSE_LOW contradicts.) Fix: resolve; likely SW1 between 3V0 and BTN.
2 MAJOR battery reads ~4% high with 3.3M/1M on 3.0 V (SAADC full-scale = VDD; V=4.2*v/0.3144). Fix ~3.0M/1M or set batteryFullVoltage.
3 MAJOR motor on VBAT, C7 only 1 uF: sag at low battery can drop 3V0 (LDO dropout, flash 2.7 V min). Fix: 10 uF bulk on VBAT near motor; avoid flash writes while buzzing.
4 MAJOR C1/C2 9-10 mm from module VDD pads 28/30 (17.6/18.4, 15.55). Fix: move next to them.
5 MAJOR antenna vs battery body; keep cell clear of antenna end.
6 MINOR vias/tracks under module body; confirm tenting. 7 MINOR crystal far (12-13 mm, 2 vias each, nets cross); place Y1 by pads 17/18 (12.8, 15.55), single layer.
8 MINOR no reverse-battery/PTC. 9 MINOR charger: termination 5.8 mA vs system load; no-battery OK. 10 MINOR backlight current spread with 47R from 3.0 V; allow 22-33R.
11 MINOR module VBUS pad floating: confirm vs Raytac fig 8.5. 12 MINOR mask expansion 0, no stackup; blank LCSC cells.
OK: all IC pinouts verified vs datasheets (MCP73832, TPS7A0230 DBV 1 IN 2 GND 3 EN 4 NC 5 OUT, GD25Q64E, AO3400A, TC2030, 1N4148WS); module pads; BANGLEJS2 pin map; USB-C CC; pulls; gate drive; DRC 0/0; min track-to-edge 1.1 mm.

## Boss resolution of finding 1 (button polarity) — reviewers were wrong, board is right
Evidence read directly: boards/BANGLEJS2.py:220 marks PD17 "NEGATED"; targets/nrf5x/jshardware.c:1194 inverts the read value for negated pins; jshardware.c:1209-1211 swaps IN_PULLDOWN -> IN_PULLUP for negated pins. So the real pin has an internal pull-up and reads low when pressed (matches SENSE_LOW wake at jswrap_bangle.c:5899). SW1 from P0.17 to GND is correct. Still a bring-up test item.
