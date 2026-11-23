# PitchIQ custom watch, rev C: engineering report

Date: 2026-11-23. Everything here is design work on a computer. No board, case or strap has been built or bought, no firmware has run on hardware, and no part has been held or measured.

`/boss-research-skill` is not installed. The boss-worker routing skill was used in its place: I planned, briefed and checked; workers researched and reviewed; I re-ran every check myself.

## Status

| Label | Status | Evidence |
|---|---|---|
| Design verification | **Files consistent and rule-clean; design not complete** | `scripts/check.sh` passes (output at the end). The enclosure is a dimensioned layout, not a CAD model. Open items in section 23. |
| Firmware build verification | **Compiles** | Both targets exit 0 and host tests pass, re-run by me after the last change. Never run on a device. |
| Physical prototype testing | **Not started** | Nothing built. |
| Production readiness | **No** | No validation, no certification, no tooling. |

**It is not ready to order.** The list in section 17 says what to buy first and what those parts must settle.

## What changed from rev B

- Heart-rate sensor, its 5 V boost and the 1.8 V load removed (about 15 parts).
- Waterproof USB-C for charging replaces the pogo cradle. Hidden programming pads remain inside the case.
- 8 mm motor, glued to the board.
- Board is 30.6 x 36 mm (was 32 x 36). It now sits in the middle of the stack: display side on top, battery side underneath.
- Whole-watch scope: case layout, strap, lugs, cost of the complete device.

Rev A and rev B are kept unchanged in `watch/hardware/revA_2026-11-23/` and `watch/hardware/revB/`.

**A mistake I made and corrected.** My first rev C stack assumed the USB-C connector stood 1.8 mm above the board and gave a 10.0 mm case. The mechanical reviewer read the same drawing and found it stands 4.21 mm proud. I re-read the drawing and they are right. The connector is now on the bottom of the board, in the battery bay, and the case is 10.9 mm.

## 1. Product requirements

| Requirement | Rev C |
|---|---|
| 3-axis accelerometer | LIS2DH12 |
| Bluetooth LE | nRF52840 module (Raytac MDBT50Q-1MV2), bonded and encrypted |
| 8 mm vibration motor | Vybronics VCLP0820B004L, 8.0 x 2.1 mm, 2.7-4.0 V, 35 mA |
| Always-on display | Sharp LS013B7DH03, 1.28 in, 128 x 128, reflective |
| Rechargeable battery, safe charging | 150 mAh protected cell, Nordic nPM1300 |
| Waterproof USB-C charging | GCT USB4715-GF-A with gasket, power only |
| Own firmware, programming and debug | Zephyr application, SWD on hidden pads, updates over Bluetooth |
| Button | One side button into the power chip |
| Strap | Standard 20 mm quick-release silicone |
| Excluded | GPS, compass, barometer, heart rate, environment sensors, touch |

Touch was not added: the existing interface is driven from the phone and one button.

## 2. Hardware architecture

- One 3.0 V rail from the power chip feeds everything. The motor runs from the system rail through a transistor.
- USB-C: VBUS and the two CC pins go to the power chip, which detects the charger type. No data lines.
- I2C: power chip and accelerometer. SPI: display.
- Battery joins through a solder jumper bridged at final assembly.
- Programming pads (bottom, inside the case): nRESET, SWDCLK, GND, SWDIO, 3.0 V reference. Each is protected, and ground is the middle pad so a reversed jig is harmless.

## 3-5. Schematic, board, rule checks

- Schematic: `kicad/pitchiq_watch.kicad_sch`, PDF in `out/`. Board: `kicad/pitchiq_watch.kicad_pcb`. Both are generated from `scripts/design.py` and open in KiCad 7.
- 65 parts, 40 nets, 6 layers, 0.8 mm, 150 vias, parts on both sides (42 top, 9 bottom machine-placed).
- KiCad design-rule check: 0 errors, 0 unconnected, 72 warnings. 69 are library-link notices (footprints are script-generated); 3 are silkscreen lines clipped at pads. I read each class.
- **KiCad's own ERC was not run** (KiCad 7 has no command-line ERC). A scripted substitute reports 0 errors. It trusts the pin types I declared and cannot check values, sequencing or orientation.
- **The board is autorouted by my own router.** No layout engineer has reviewed it. Treat it as a routed draft.

## 6. Processor selection

Kept: Raytac MDBT50Q-1MV2 (nRF52840). It has a certified radio and antenna, a known price ($8.95 seen in rev B research) and the firmware already builds for it. Its 2.05 mm height sets the gap under the display.

| Alternative | Why not now |
|---|---|
| 8 x 8 mm module (ISP1807 class, about 1 mm tall) | Would save about 1 mm of thickness. Price and stock were not confirmed. Best candidate for a later, thinner revision. |
| Bare nRF52840 or nRF54L15 | Own antenna and full radio certification. |

## 7. Display

Sharp LS013B7DH03: readable in direct sun with no light, about 4 uA to hold an image, 33,491 in stock at DigiKey at $12.39 when checked.

- Colour alternatives: Sharp LS013B7DH06 is obsolete. JDI LPM013M126C (the Bangle's type) showed 1,478 at one broker with no price. Neither is a safe choice.
- Night games: the bare panel has no light. You chose to start without one. The board keeps pads and a switch for a frontlight so the Azumo frontlit version can be fitted later.
- Risk: single source; Sharp distributors quote a 2,240-piece factory minimum.
- Open: which face of the flex cable carries the contacts, and its length. This decides the connector type and cannot be settled without a panel.

## 8. Battery and power budget

`docs/power_budget.md`, an estimate from datasheet figures. Not measured.

| Use | Battery current | Life on 150 mAh (80% usable) |
|---|---|---|
| Idle, no phone (advertising slowly, screen on) | 0.07 mA | about 75 days |
| Game, connected, 50 calls an hour | 0.71 mA | about 7 days of continuous play |
| Phone left connected, no calls | 0.46 mA | about 11 days |
| One 3-hour game a day, idle otherwise | 3.5 mAh a day | about 34 days |
| Night game with the optional frontlight | 2.16 mA | about 56 hours |

The reviewer found my first model assumed slow advertising while the firmware advertised fast all the time. I changed the firmware (fast for 30 seconds, then slow) and rebuilt it, so model and code now agree. Charging takes about 2.5 hours and stops above 45 C.

## 9. USB-C charging

- Connector: GCT USB4715-GF-A, 6 contacts, rated IP67 by its maker when its gasket is compressed against the case wall. Mouser showed 2,382 in stock at $1.61. LCSC was out of stock.
- It mounts in a 10.3 x 6.3 mm notch in the board edge, on the bottom side, and reaches 2.1 mm past the edge into the wall.
- Sink configuration: the power chip presents the CC pull-downs itself. Whether it still does with a completely flat cell is not confirmed, so the board has two unfitted resistor positions as a fallback.
- Protection: a 5 V surge clamp at the connector; the power chip tolerates 22 V on its input.
- A waterproof connector does not make the watch waterproof. Sealing depends on the gasket compression (window about plus or minus 0.08 mm against a tolerance chain of about 0.35 mm), the lens bond and the back seal. The fix is to let the board float toward the port. No water resistance is claimed.

## 10. Motor

Vybronics VCLP0820B004L (DigiKey showed $3.15; one reviewer saw it out of stock later the same day, so check). Alternate: VC0820B006F.

- Glued to the top of the board in an 8.2 mm keep-clear circle with no vias under it. Leads solder to two pads.
- Driven by a transistor with a flyback diode. Firmware limits the drive to about 3 V effective, because the system rail reaches about 5 V while charging.
- Open: whether it can be felt at the wrist through the board, battery bay and back cover. Needs a test.

## 11. Accelerometer

LIS2DH12 (kept). Stock is thin: 297 at LCSC, none at DigiKey or Mouser until April 2027. The LIS2DW12 fits the same pads and is well stocked but needs a driver change.

## 12. Bluetooth

- Bluetooth LE is kept. The watch advertises as "PitchIQ" and exposes the same service the phone app already uses.
- Security: passkey pairing, bonded and encrypted link, one bond; an unbonded phone is refused once a bond exists. Bonds persist across resets (in code; not tested).
- Antenna: the module's own, at the top edge. No copper within 4 mm of that edge on any layer, full board width.
- Updates: over Bluetooth through the bootloader, with rollback if a new image fails its self-check.
- Phone app: `app/watch.js` now accepts devices named "PitchIQ" as well as "Bangle" (committed on the branch; untested against a watch).
- **Before selling:** Bluetooth SIG membership (free at the basic level) and a one-time $12,000 qualification fee per design; the firmware must move to Nordic's qualified controller. The module's FCC grant is conditional on 5 mm between antenna and body, which a lab must confirm for a watch. None of this is needed, and none was paid, for prototypes.
- RF risks ranked by the reviewer: display glass 1 mm from the antenna, the USB-C steel shell 3.5 mm from it, the steel spring bar across the antenna end, the wrist. All need a range measurement.

## 13. Strap

Recommendation: standard 20 mm quick-release silicone. It suits a 34.8 mm case, is the most common width, and needs no tooling.

| Option | Supplier and product | Width | Price seen | Minimum | Notes |
|---|---|---|---|---|---|
| **Prototype (primary)** | Archer Watch Straps, Quick Release Silicone, black | 20 mm | $19.99 | 1 | 3 mm thick, 75 / 120 mm lengths, pin buckle |
| Pilot | Barton Elite Silicone, black | 20 mm | $21.74; $18.48 at 5 or more | 1 | 50+ by quote |
| Smaller case | Archer Quick Release Silicone | 18 mm | $19.99 | 1 | Only if the case shrinks |
| Volume | Alibaba supplier (UPro), silicone | 20 mm | $0.64 | 20 | Quality unknown; sample first |
| FKM rubber | Barton Elite FKM / Crafter Blue | 20 mm | $48.74 / $75 | 1 | Both sold out when checked; not justified for a first build |

Full comparison, links and lead times: `research/strap.md`. No skin-safety or hypoallergenic claim is made for any of them. A custom moulded strap is not recommended: tooling was quoted in the $500-20,000 range for no functional gain.

## 14. Strap mounting

`mech/pitchiq_watch_revC_layout.svg`. These are estimates from general practice, not from a strap in hand.

| Dimension | Value |
|---|---|
| Lug gap | 20.00 +0.10 / -0 (model 20.2 and ream if 3D printed) |
| Spring bar | 1.5 mm body, 1.0 mm tips, quick-release |
| Lug holes | 1.1 mm diameter, at least 1.8 mm deep |
| Bar centre from case face | 3.2 mm |
| Bar centre to lug end | 2.4 mm (lug length 5.6 mm) |
| Lug thickness | at least 4.0 mm |
| Length over lugs | 53.0 mm |

Open: the height of the bar relative to the back (decides whether the watch sits flat), lug strength in printed nylon (marginal by a rough estimate), and the steel bar's effect on the antenna. A plastic bar at the antenna end is worth testing.

## 15. Enclosure and size options

Layout drawing: `mech/pitchiq_watch_revC_layout.svg`. It is a packaging layout to check that parts fit. It is **not** a CAD model and cannot be printed.

Stack, lens to back: lens 1.00, adhesive 0.15, display 0.74, clearance 0.35, top-side parts 2.35, board 0.80, battery bay 4.50 (cell 3.8, swell, foam; USB-C body 4.21 beside it), back 1.00 = **10.9 mm**.

| | A: reference (rev B) | B: rev C (recommended) | C: smallest practical |
|---|---|---|---|
| Case | about 36 x 44 x 11-12 | **34.8 x 41.8 x 10.9** | about 31 x 39 x 9.5 |
| Board | 32 x 36 | 30.6 x 36 | about 27 x 34 |
| Display | 1.28 in, 26.6 x 30.3 glass | same | same (the glass sets the width) |
| Battery | 150 mAh, 19.75 x 26 x 3.8 | same | about 100-120 mAh, thinner |
| Antenna | top edge, 4 mm clear | same | same |
| USB-C | none (cradle) | left side, bottom of board | none: needs charging contacts instead |
| Motor | no location found | top of board, left | same |
| Strap | 20 mm | 20 mm | 18 mm |
| Battery life, 3 h game a day | about 30 days | about 34 days | about 22-27 days |
| Manufacturing | double-sided board | same, plus board notch | lower module, thinner lens, tighter case |
| Status | designed | designed | estimate only; nothing drawn |

Your target was about 34 x 40 x 11. Option B is 0.8 mm wider and 1.8 mm longer than that, and 0.1 mm thinner. The length comes from the display cable folding past the board's lower edge. Option C conflicts with the waterproof USB-C requirement, because that connector alone is 4.2 mm tall.

Construction proposed: printed nylon (MJF PA12) for fit prototypes; CNC or moulded parts for anything that must seal; hard-coated polycarbonate lens bonded with tape; die-cut gasket or adhesive on a flat ledge for the back (an O-ring groove does not fit a 1.8 mm wall); two screws at the lower corners; plastic locating posts at the antenna end; a sealed plunger for the side button (not designed).

## 16. Bill of materials

`docs/BOM.csv` (electronics) and `docs/COST_revC.md` (whole device). Electronics: 40 lines, 51 machine-placed parts, 27 distinct part numbers, each with an LCSC number. Board parts plus battery and motor: $25.98 for one, $20.68 each at 100; with the display $38.37 and $28.65.

Mechanical items (case top, back, lens, gasket, screws, button cap, strap, spring bars) are costed in `COST_revC.md`. They have no part numbers yet because the case is not modelled.

## 17. Prototype purchasing list (nothing ordered)

First, to settle open questions (about $130-190):

- Sharp LS013B7DH03 panel: contact face, cable length, fold test.
- GCT USB4715-GF-A kit with gasket: confirm the 4.21 mm height, tail reach on the pads, leak test.
- Battery (Adafruit 1317) and motor (VCLP0820B004L): real dimensions, feel.
- Archer 20 mm strap with spring bars: lug geometry.
- nRF52840 dev kit ($48.95) and nPM1300 evaluation kit ($64.35): run the firmware; test USB-C charging start with a flat cell.

Only after those: boards, then a printed case.

## 18. Manufacturing files

`out/fab/`: Gerbers for 6 copper layers, mask, paste, silk, outline; drill files; placement file; JLCPCB BOM and placement CSVs. Regenerate with `scripts/export_fab.sh`.

Not ready to submit, per the manufacturing review:

1. JLCPCB's double-sided assembly needs a panel at least 70 x 70 mm with rails and fiducials. The files are a single 30.6 x 36 mm board. Use their panelising option or build a panel.
2. The module and the USB-C connector were out of stock at LCSC, so they must be supplied to JLCPCB or fitted by hand. Their consignment rules could not be read; ask in writing.
3. Only JLCPCB lists 6 layers at 0.8 mm among the fabs checked.
4. The connector's four shell stakes need hand soldering.

## 19. Assembly plan

1. Board assembly by the fab (everything except module and connector if they cannot be supplied).
2. Hand-fit module and USB-C connector if needed; solder the connector's shell stakes.
3. Electrical bring-up on the bare board, in the rev B order: shorts check, power chip alone, rails, then program.
4. Solder motor leads; glue the motor.
5. Latch the display cable with the display folded out beside the board, then fold it over.
6. Solder battery leads; check polarity; bridge the battery jumper last.
7. Fit the USB-C gasket; seat the board in the case top with the board floated toward the port.
8. Bond the lens; fit gasket and back; fit strap.

The display connector is under the glass once assembled, so the display cannot be replaced without breaking the lens bond.

## 20. Firmware and flashing

- `watch/firmware/core`: the PitchIQ logic in portable C, tested on a PC against the original JavaScript (19 known-answer checks, 231 crypto vectors, 82 scenarios, all identical).
- `watch/firmware/app`: Zephyr 4.4.2 application with MCUboot. No Espruino anywhere.
- Builds I ran after the last change (logs in `watch/firmware/build_logs/boss_revC_*.log`):

| Target | Result | Size |
|---|---|---|
| `pitchiq_watch` | exit 0, no compiler warnings | 226,184 B flash (47%), 50,656 B RAM; bootloader 27,552 B |
| `nrf52840dk/nrf52840` | exit 0 | 219,512 B flash |
| Core host tests | all pass, sanitizer clean | |

- Flashing: debug probe on the five programming pads; afterwards updates over Bluetooth. Commands in `watch/firmware/README.md`.
- Not done: hardened production build (own signing key, debug-port lock) has config files but was never compiled.

## 21-22. Cost

From `docs/COST_revC.md`, written by the sourcing reviewer. Most cells are estimates; only the ones marked there as seen are supplier prices. None is a quotation.

| | 1 | 5 | 25 | 100 | 500 |
|---|---|---|---|---|---|
| Complete watch, per unit | about $420 | about $166 | about $104 | about $86 | about $62 |

Includes electronics, board, assembly, display, battery, motor, connector, printed case, retail strap, hand assembly at $25 an hour, shipping and a 35% tariff on the electronics. The single-unit figure is mostly fixed order fees.

One-time costs: about $40-180 for prototypes (probe, jig, optional dev kits). To sell: about $15,000-35,000 at 100 units, driven by the $12,000 Bluetooth fee, FCC testing ($1,500-5,000 if the module's grant covers a watch) and optional tooling.

## 23. Validation plan and open items

Needs parts in hand, in priority order:

1. Display cable: contact face, length, fold around 0.8 mm radius.
2. USB-C connector: height, tail overlap on the pads, leak test with the port empty and with a plug, pull test.
3. Charging start with a flat cell from a USB-C to USB-C charger.
4. Power chip start-up from USB with no battery (reports of the 3.0 V rail going too high).
5. Cell: real width, thickness, swell, lead position. Clearance to the side switch is 0.75 mm and to the connector's solder tails about 0.4 mm.
6. Radio range on the wrist, with and without display, connector shell and spring bar.
7. Motor: felt at the wrist?
8. Everything in the rev B test plan (rails, sleep current, pairing, update and rollback, watchdog, drop, sweat).

Open design items that are not tests: the enclosure CAD, the button plunger and its seal, the back seal, lug height, the panel for assembly, comparing the power chip circuit against Nordic's reference schematic (their site refused downloads), and running ERC inside KiCad.

## 24. Independent reviews

Three reviewers worked on the first rev C package; full reports are in `reviews/`.

| Review | Worst finding | Result |
|---|---|---|
| Mechanical and RF | USB-C connector is 4.21 mm tall, not 1.8; the 10.0 mm case was impossible (blocker) | Fixed: connector moved to the bottom, stack redone at 10.9 mm, board widened 0.6 mm, pads and notch corrected to the drawing, no vias under the motor. Button plunger, seals and lug details remain open. |
| Electrical, power, firmware | No blocker. Flat-cell USB-C start unproven; programming pad row could be reversed; power model disagreed with firmware | Fixed on paper: fallback resistor positions, pad order changed with ground in the middle, 1 k on the reference pad, firmware advertising changed and rebuilt. 13 minor items are listed in its report and are not fixed. |
| Manufacturing, sourcing, QA | Files cannot be submitted as they are (panel, consigned parts) | Not fixed; documented in section 18. Cost model written. |

**The fixes above have not been reviewed by a second person.** The earlier rev B work had a second review round; rev C has had one.

## 25. Check output

`bash watch/hardware/revC/scripts/check.sh`, last run after all changes, exit code 0:

```
== 1 schematic parses in KiCad and its netlist equals design.py
netlist check: 40 nets in schematic, 40 in design, 65 components, differences: 0
== 1b scripted electrical-rule check (NOT KiCad's ERC: KiCad 7 has no command-line ERC)
scripted ERC: 65 parts, 40 nets, errors 0, strap/passive-driven notes 4
== 2 board copper equals design.py (pad nets) and KiCad DRC
board check: 65 footprints, 150 vias, 482 track segments, copper layers 6, pad-net differences: 0
DRC (KiCad 7.0.11): errors 0 {}, unconnected 0, warnings 72 {'silk_over_copper': 3, 'lib_footprint_issues': 69}
antenna strip check (full width, y 0-4 mm, 6 layers): foreign copper items 0
== 3 BOM: every fitted part has an MPN, a source and (if machine-placed) an LCSC number
CPL rows: 51
BOM lines 40, SMT parts 51, unique SMT part numbers 27
on-board parts incl. battery+motor: $25.98 @1, $20.68 @~100; display +$12.39 @1 / +$7.97 @100; with display: $38.37 @1, $28.65 @~100
JLCPCB sides: {'F': 42, 'B': 9}
SMT parts without an LCSC number: []
BOM lines missing MPN or source: []
== 4 manufacturing files present
== 5 firmware: C core tests against the JavaScript app (host build)
ALL PASS
sanitizer run: clean (no ASan/UBSan reports, exit 0)
CHECK: PASS (design files consistent and rule-clean; this says nothing about a built board)
```

This proves the schematic, board, parts list and firmware pin map agree with one source file and that the board passes KiCad's design rules. It cannot find an error in that source file.

## 26. Repository

Branch `feat/watch-custom-hardware` (never merged to main). Earlier commits on it: `b5f09b7` (rev A archive, rev B, firmware), `0c54e7f` (phone app accepts "PitchIQ"), `5b688be` (rev C work in progress). The commit that adds this report follows them; see `git log` on the branch.

Files: `watch/hardware/revC/` (`scripts/`, `kicad/`, `out/fab/`, `docs/`, `mech/`, `research/`, `reviews/`), `watch/firmware/`, and this report copied to `docs/`. Images are not committed.
