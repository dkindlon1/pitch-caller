# PitchIQ watch rev E: prototype readiness report

Date: 2026-11-24. Branch `feat/watch-custom-hardware`. Nothing was ordered, paid for, sent to a supplier, or built. Nothing here is a physical test result. Rev A to D are untouched.

## Decisions

| | Decision | Result |
|---|---|---|
| A | Buy the sample components | **GO** (needs your approval to spend) |
| B | Order the five boards | **NO-GO** today. Three things left, none fixable in files |
| C | Print a fit-check enclosure | **GO** |
| D | Assemble a complete working prototype | **NO-GO**: needs B, the parts, and the first board brought up |
| E | Production | Not close; list at the end |

What still blocks B, and the cheapest way to close each:

1. **Display connector land pattern and tail.** The connector is the top-contact Hirose FH12A, drawn on KiCad's footprint for the bottom-contact FH12. Nobody here could open Hirose's drawing. Close it with the $12 panel and $1.56 connector from the sample list, laid on the 1:1 print (`out/pitchiq_watch_revE_1to1_top.pdf`), or by opening the datasheet on the DigiKey page and sending me the land-pattern page.
2. **Supplier answers.** JLCPCB's own pages disagree about 6 layers at 0.8 mm; PCBWay says ask. The inquiry and an identical file package for both are ready (`docs/SUPPLIER_INQUIRY_revE.md`, `supplier_package_revE.zip`). Free. Both emails are in your Gmail as drafts with the package attached; nothing was sent.
3. **Part rotations in the assembler's preview**, above all the power chip, which is turned 90 degrees in rev E. Free; done at order time.

## What rev E fixed

**Found by reading Sharp's drawing directly (the biggest change).** The display's cable is centred on the glass and 13.63 mm long. Rev D had the connector 1.3 mm off centre and about 5.6 mm too close to the edge: the folded cable would have had 5.6 mm nowhere to go. The connector moved to the centre line where the cable ends. That forced the power chip to turn 90 degrees and its parts to be re-placed, and the whole board was re-routed.

**Found by the independent audit (critical).** The first rev E manufacturing files were still rev D's: 20 of 46 part placements were wrong and the power chip's rotation was wrong. My check script only tested that the files existed. Fixed: the check now re-exports every time and fails if any file is older than the board or the placement file disagrees with it. It reported 36 problems on the stale files and 0 after re-export.

Other board changes: battery + and - printed beside the battery pads (the board had no polarity mark); 25 V capacitors on the power rails; seven bring-up test pads (battery, I2C, display clock, log output, ground); two unfitted resistors as a fallback for USB-C detection with a flat cell; battery pads and jumper moved.

Firmware: charger switched off before its current is changed; a separate bring-up build that reports the power chip, accelerometer, display start-up and pairing code over a test pad and buzzes the motor on a button press. The normal build is unchanged apart from 16 bytes.

CAD: cable modelled from Sharp's dimensions with new rule checks; button bore tightened so its O-ring keeps its squeeze; back gasket groove corrected (it was 143 % full); M1.6 screws with larger lug roots; tighter locating pins; a display assembly sequence that can physically be done.

## Evidence

| Area | Result | File |
|---|---|---|
| Schematic | KiCad ERC 0 errors, 0 warnings | `out/erc_report_kicad.txt` |
| Board | DRC 0 errors, 0 unconnected, 77 warnings (75 library notices, 2 silk over copper); 71 footprints, 40 nets, copper equals schematic | `out/check_output.txt`, `out/drc_report.txt` |
| Same, by the auditor's own script | 248 pad nets match, 0 unconnected, no copper in the antenna zone | `reviews/e3_final_audit.md` |
| Manufacturing files | 46 placement rows, 0.000 mm worst difference from the board | `out/check_output.txt` |
| Firmware pins vs board | 11 of 11 signals plus programming, crystal, reset match the module's datasheet | `reviews/e1_pcb_final_review.md` |
| Firmware | Watch build exit 0, 226,532 B flash (46.88 %), 50,656 B RAM; bring-up build exit 0, 229,744 B; dev-kit build exit 0; host tests pass. Compiles only | `firmware/build_logs/boss_revE_*.log` |
| CAD | Interference and rule checks pass in both presets; 28 parts; body 34.8 x 42.1 x 11.49 mm, 54.5 mm over the lugs, 36.5 mm across the button | `cad/report.md`, `cad/step/`, `cad/step_mjf/` |

Verification matrix (`docs/MATRIX_revE.md`): 52 requirements. 38 pass at the level stated in each row (files, CAD, compiles or paper; 6 of those also carry a blocked physical part), 14 are blocked on parts, supplier replies or bench tests, 0 fail. No row is a FAIL that could be fixed in files.

## Independent audit

`reviews/e3_final_audit.md`. One critical and three major findings:

| Finding | Disposition |
|---|---|
| Critical: manufacturing files stale | Fixed, gate added, then re-verified by a separate reviewer with its own script (`reviews/e4_fab_reverify.md`): 46 placements at 0.000 mm from the board, all 20 Gerber and drill files identical to a fresh export, and the new gate caught a deliberately shifted part and a deliberately wrong rotation |
| Major: matrix said those files passed | Corrected |
| Major: power chip has uncertain stock at the assembler | Documented: check on the day, otherwise supply it or hand-solder |
| Major: connector land pattern unverified | Open, blocker 1 above |

Smaller items it measured, accepted for prototypes: the feed to the buck input is a 13.5 mm thin track with two vias; the motor's protection diode sits at the switch, 25 mm from the motor; test-pad stubs on I2C are about 21 mm; the cable slack is 0.22 mm by its arithmetic against 0.53 mm by mine (both inside the allowed window). It read the display connector mapping independently and agrees, at about 85 % confidence. I dispute one item: it measured the mounting holes 0.19 mm from the edge; they are 1.07 mm from the corner arc.

Things that were refused by this environment's permission checks and not retried: installing the panel tool, and downloading the Hirose and Panasonic connector drawings.

## Suppliers

`docs/SUPPLIERS_revE.md`. Neither published a price for this board, so these are wide estimates for 5 boards delivered, not quotations:

| | Bare boards | Top side assembled, rest by hand | Both sides assembled on a panel |
|---|---|---|---|
| JLCPCB | $55-200 | $260-780 | $340-950 |
| PCBWay | $110-310 | $390-1,170 | $490-1,390 |

Tariffs (35 % and up) and parts dominate. JLCPCB is cheaper with published fees but puts the polarity check on you; PCBWay designs the panel and asks before substituting. A route that avoids the panel entirely: machine-place the top side only and hand-solder the 8 simple bottom parts.

Prototype cost on top of the boards: samples $63.58 essential (see the rev D sample list; the same parts apply), radio modules, displays, cells, motors and USB-C connectors for five units roughly $150-200, printed case sets not quoted.

## First-board procedure

`docs/BRINGUP_revE.md`: 14 tests in order, each with equipment, expected design values, stop limits, pass criteria and troubleshooting, plus a results sheet. It uses the bring-up build and a $5 USB-UART adapter. Known rough edges it records: the bring-up build buzzes the motor 3 s after boot, so fit the motor last; the top test pads are covered once the display is fitted.

## E. Before production

One board through the full bring-up; real display cable and connector confirmed; charging from a flat cell; radio range in the case; seal and leak tests on machined parts with an aluminium back; strap pull test; battery life measured; a real signing key in the bootloader (it uses the public debug key); FCC handling for the module in this enclosure; Bluetooth listing fee when you sell; battery transport test documentation; tooling for the case and strap.

## Deliverables

Under `watch/hardware/revE/`: KiCad design (`kicad/`), CAD (`cad/`), matrix, BOM (`docs/BOM.csv`), manufacturing outputs (`out/fab/`), supplier comparison and inquiry, bring-up procedure, reviews including the audit, this report. Firmware under `watch/firmware/`.

## What I need from you

1. Approve the sample purchase, or just the $30.65 minimum (display, connectors, USB-C, switch, stand-in motor).
2. Check the two supplier drafts in your Gmail (addresses included) and send them, or tell me to.
