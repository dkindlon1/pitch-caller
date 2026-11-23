# Review brief for rev B (read first)
PitchIQ watch rev B: an original wrist device (not a Bangle.js clone) that shows a pitch call, buzzes, and has an
accelerometer and optical heart rate. Own firmware on Zephyr RTOS. NOTHING HAS BEEN BUILT. You are an independent
reviewer: find defects. Do not edit, create or delete project files except the one report file named in your task.
Do not save boards. Do not run firmware builds (they are slow; build logs are provided).

Root: /home/claude/pitchiq-watch/watch
- hardware/revB/scripts/design.py : single source of truth: every part, pin, net, pin type, footprint, MPN, LCSC number.
- hardware/revB/scripts/erc.py (scripted ERC, not KiCad's), gen_pcb.py (placement, rules, 6-layer stack: F sig / In1 GND /
  In2 sig / In3 sig / In4 3V0 / B sig; board 32 x 36 x 0.8 mm), router.py (grid autorouter with fixed pre-routes), drc.py,
  check_antenna.py, check.sh (runs everything; `bash hardware/revB/scripts/check.sh` is allowed: it only regenerates out/ and docs/BOM.csv)
- hardware/revB/kicad/pitchiq_watch.kicad_sch / .kicad_pcb (KiCad 7.0.11; `python3 -c "import pcbnew"` works for read-only inspection)
- hardware/revB/out/ (drc_report.txt, fab/ gerbers+drill+bom+cpl, schematic PDF), hardware/revB/docs/BOM.csv, docs/power_budget.md
- hardware/revB/research/*.md : sourced notes (datasheets.md has the extracted pin tables with URLs; display, sensors, mcu, power, firmware_platform, procurement)
- firmware/core (portable C port of the message logic, host-tested against the original JavaScript), firmware/app (Zephyr
  application), firmware/boards/pitchiq/pitchiq_watch (board definition, pin map), firmware/README.md, firmware/build_logs/
- original app being replaced: /home/claude/dkindlon1/pitch-caller/watch/bangle/pitchiq.app.js ; coach-side sender /home/claude/dkindlon1/pitch-caller/app/watch.js
- Zephyr v4.4.2 source for reference: /home/claude/zws/zephyr ; previous revision and its reviews: hardware/revA_2026-11-23/

Design in one paragraph: Raytac MDBT50Q-1MV2 (nRF52840 module, chip antenna, at the top board edge) ; Nordic nPM1300 power
chip (USB-less 5 V in from cradle pads, charger with power path, ship mode, BUCK2 = 3.0 V system rail by 150 k strap,
BUCK1 = 1.8 V by 47 k strap for the heart-rate sensor core, button on SHPHLD) ; Sharp LS013B7DH03 128x128 reflective
memory LCD on a 10-pin FPC (Hirose FH12-10S-0.5SH(55)), optional frontlight LED pads ; Maxim MAX30101 heart-rate sensor
on the BOTTOM face with a TPS61023 5 V boost for its green LED ; ST LIS2DH12 accelerometer ; coin vibration motor on
VSYS via AO3400A ; 32.768 kHz crystal ; no external flash ; five 2 mm cradle pads on the bottom (VBUS, GND, SWDIO, SWDCLK,
nRESET) instead of a USB connector ; battery leads soldered to pads behind a solder jumper.
Already known and disclosed (do not re-report unless you add evidence): nothing built or measured; KiCad's own ERC not run
(scripted substitute); autorouted layout; nPM1300 reference schematic image was not readable, so its capacitor node
assignment and unused-pin handling (LSIN1/LSIN2 to GND, CC pins to GND, LED/GPIO pins open) are unconfirmed; FPC contact
side/orientation of the LCD unconfirmed; Azumo frontlight product form and LED Vf unknown; heart-rate estimate untested on
a wrist; firmware compiled but never run; production Bluetooth controller should move to nRF Connect SDK.
Report format: write your FULL review to the file named in your task. Number findings; each has severity (BLOCKER =
must fix before ordering boards / MAJOR / MINOR), the defect, evidence (file:line, measured value, or datasheet URL +
section), and the fix. End the file with a short "checked and found correct" list. No praise, no summary of the design.
Return to the caller at most 12 lines: your BLOCKER and MAJOR findings only, one line each, with the fix.
