# PitchIQ watch board, rev A: engineering report (Nov 23, 2026)

**Status: design package complete and rule-checked. Nothing has been built, powered, programmed or measured.**
Every claim below is one of three kinds, and is labelled where it matters:
**[run]** a tool was run here and its output read · **[seen]** read on a supplier or datasheet page on Nov 23 ·
**[est]** my estimate, not read anywhere.

## 1. Summary and decision

**Recommended design:** a 32 × 36 mm, 4-layer board built around a pre-certified nRF52840 radio module (Raytac
MDBT50Q-1MV2), wired so that the display, backlight, button, vibration motor, battery sense, charge status and flash sit
on **the same pins as a Bangle.js 2**. The stock Bangle.js 2 firmware and your `pitchiq.app.js` then run with no source
change to the app (one option added, see §9). Everything the app doesn't use is gone: touch, accelerometer, compass,
GPS, heart rate, pressure.

**What was actually verified [run]:**
- Schematic netlist exported by KiCad equals the design: 31 nets, 46 parts, 0 differences.
- Board pad nets equal the design: 0 differences. KiCad 7.0.11 design-rule check: **0 errors, 0 unconnected pads**,
  48 warnings (46 are "footprint not in a library table", a headless-run artefact; 2 are silkscreen clipped by mask).
- No copper on any of the 4 layers in the antenna strip.
- Five independent reviews, then a second-round review of the fixes (§11).

**What was not, and why it matters:**
- **Firmware was never compiled.** Building Espruino in this session was blocked. There is no downloadable full
  Bangle.js 2 hex; it must be built from source before a blank board can be programmed (§9).
- **KiCad's schematic rule check (ERC) was not run.** KiCad 7 has no command-line ERC. Open the schematic and run it once.
- **The display is the weak point.** The only purchasable one (Switch Science, 19 in stock, $34.28 [seen]) has **no
  backlight**; the backlit version is sold out and marked discontinued there. No same-resolution alternative was found.
  With that display the watch is unreadable at a night game without field lights.
- **Cost does not beat buying Bangle.js 2 watches** (£83, £71 in volume [seen]) at prototype quantities: about $90 per
  unit at 5 units before a case, your time and any certification [est] (§10).

**My recommendation:** don't order boards yet. First run the Bangle.js 2 desk and field tests you already planned, and
buy two displays and one module (about $80) to settle the connector orientation and antenna questions on the bench.
The package is ready for that next step, and for a 5-board order after it.

## 2. What the software needs
Full matrix with line references: `docs/01_software_audit.md`. In short, the app is a Bluetooth peripheral that draws a
digit and a few words on a 176×176 screen, buzzes, reads one button and reports battery level.

| Needed | Not needed |
|---|---|
| nRF52840 + Espruino (Bangle.js 2 build), BLE antenna | Touch controller |
| LPM013M126 176×176 colour memory LCD | Accelerometer, compass |
| Vibration motor | GPS |
| One button | Heart-rate sensor |
| Battery, charger, battery-voltage reading | Pressure sensor |
| 8 MB SPI flash (Espruino `Storage`) | Second button, speaker |
| 32.768 kHz crystal | USB data |
| Backlight (night games only) | |

The app has only ever run against fake watches in Node. It has not run on a real Bangle.js 2.

## 3. The original Bangle.js 2
**Confirmed** (Espruino's own pages and `boards/BANGLEJS2.py` at 46b13ba):
nRF52840, 256 kB RAM, 1 MB flash + 8 MB GD25Q64 SPI flash; LPM013M126 LCD; CST816 touch; KX023 accelerometer; 175 mAh
cell; 4-contact magnetic cable (2 charge, 2 SWD); pins LCD CS/EXTCOMIN/DISP/SCK/MOSI = D5/D6/D7/D26/D27, backlight D8,
button D17, motor D19, battery voltage D3, charging D23, flash D13–D16. Measured currents published by Espruino: idle
0.15–0.3 mA, BLE connected 0.75 mA, backlight +16 mA.

**Deduced from firmware source:** the button is a switch to ground with an internal pull-up (pin marked negated,
`jshardware.c` 1194 and 1209–1211); backlight and motor are active-high; battery is read through a divider of about 1/4.

**Not known** (Espruino says the hardware is an off-the-shelf watch whose design was worked out from the PCB): the
original schematic, its regulator, charger and antenna design. None of these were invented here; the new board uses
its own circuits for them.

## 4. Architecture chosen
| | A: copy the Bangle.js 2 | B: only what the app uses (chosen, with A's pin map) |
|---|---|---|
| Software change | none | none to the app; firmware unchanged |
| Radio | bare nRF52840 + antenna design + own FCC intentional-radiator test | certified module, antenna included |
| Parts on board | ~90+ [est] | 46 (37 machine-placed) |
| Engineering risk | high: RF layout, fine-pitch chip, unknown original circuits | lower: no RF design |
| Battery life | sensors draw power | fewer loads; one known side effect (§9, fake accelerometer events) |

B wins on cost, risk and effort. Keeping A's pin map is what makes "no firmware port" possible: a trimmed board
definition would need about 12 patches to `jswrap_bangle.c` (firmware review), so the plan is to use `BANGLEJS2.py`
unchanged.

## 5. Electrical design
Source of truth: `scripts/design.py`. Schematic: `kicad/pitchiq_watch.kicad_sch`, PDF in `out/`.

| Block | Parts | Notes |
|---|---|---|
| Radio/MCU | U1 MDBT50Q-1MV2, C1 10 µF, C2 100 nF | VDD and VDDH tied to 3.0 V (normal-voltage mode), DCCH and VBUS open |
| Clock | Y1 32.768 kHz 12.5 pF, C3/C4 18 pF | firmware waits forever for this crystal: it must start |
| Charge input | J3 USB-C (power only), R13/R14 5.1 k, D2 TVS | no USB data |
| Charger | U2 MCP73832 (open-drain status), R1 13 k | 1000 V / 13 k = 77 mA; Adafruit says ≤150 mA for the cell [seen] |
| Battery | BT1 pads, JP1 solder link, 150 mAh protected cell | JP1 stays open until final assembly |
| 3.0 V rail | U3 TPS7A0230, C7/C8 1 µF, C14 10 µF | LCD wants 2.7–3.3 V (3.0 typical); flash ≥2.7 V |
| Battery reading | R11 3.3 M, R12 1 M, C13 100 nF | about 1 µA; needs `batFullVoltage` 0.3256 in firmware settings, else reads ~4% high |
| Display | J1 FH12-10S-0.5SH(55), C10/C11, R3/R4 pulls | pin order per JDI datasheet; EXTMODE tied high |
| Backlight | Q2 AO3400A, R5/R6 47 Ω, J2 four pads | about 7 mA per LED from 3.0 V; only useful with a backlit display |
| Flash | U4 GD25Q64E, C9, R2 pull-up | same family as the Bangle |
| Motor | Q1 AO3400A, D1, R8, M1 pads | motor on the battery rail, PWM from firmware; 50 mA rated [seen]; pads 12 mm from the antenna |
| Button | SW1 to ground | firmware turns on the pin's internal pull-up |
| Debug | J4 Tag-Connect TC2030-NL pads, TP1–4 | SWD only |

**Power budget [est, from Espruino's published Bangle.js 2 figures]:** about 1 mA average while connected at the app's
20 ms interval (0.3 mA idle + radio), plus 50 mA × 0.45 s per buzz. A 3-hour game with 150 calls ≈ 4 mAh. A 150 mAh
cell would last roughly 6 days connected, or about 30 games. Charge time about 2.5–3 hours at 77 mA. Peak about
120–170 mA at motor start. **None of this is measured.**

## 6. PCB
- 32 × 36 mm, 3 mm corner radius, 0.8 mm thick, 4 layers: top signals, inner 1 ground plane, inner 2 3.0 V plane, bottom signals.
- 0.2 mm tracks, 0.15 mm clearance, 0.5/0.25 mm vias (108), all inside JLCPCB's published 4-layer limits [seen].
- All machine-placed parts on one side (the side facing the back of the watch). The other side is flat for the display.
- Antenna end of the module at the top edge; no copper on any layer for x 6–26 mm, y 0–4 mm [run].
- Placement is by script and routing by a small grid router I wrote (`scripts/router.py`). It is rule-clean, not
  hand-optimised. There are tracks and tented vias under the module body.
- Stackup thicknesses are not set in the file. Take the fabricator's standard 0.8 mm 4-layer stackup.

## 7. Bill of materials
Full list with links: `docs/BOM.csv`. JLCPCB-format files: `out/fab/bom_jlcpcb.csv`, `out/fab/cpl_jlcpcb.csv`.
All 21 machine-placed part numbers have an LCSC number that a reviewer confirmed against the part [seen].

| Item | Part | Price each | Where | Risk |
|---|---|---|---|---|
| Radio module | Raytac MDBT50Q-1MV2 | $8.95 / $8.06 @100 [seen] | SparkFun (in stock); LCSC out of stock | Medium: one maker; the PCB-antenna version is the only same-footprint second source |
| Display | JDI LPM013M126A (no backlight) | $34.28 [seen] | Switch Science, 19 in stock | **High**: single small source, no alternative |
| Battery | Adafruit 1317, 150 mAh, protected | $5.95 / $4.76 @100 [seen] | Adafruit; UN38.3 report listed | Low |
| Motor | DFRobot FIT0774, 10 mm, 3 V, 50 mA | $0.99 [seen] | DigiKey (9-week lead noted) | Low |
| Flash | GD25Q64ESIG | $1.15 / $0.55 @95 [seen] | LCSC | Low (W25Q64JVSSIQ fits the same pads) |
| Charger | MCP73832T-2ACI/OT | $0.66 / $0.45 [seen] | LCSC | Low |
| Regulator | TPS7A0230PDBVR | from $0.21 [seen] | LCSC | Low |
| LCD connector | Hirose FH12-10S-0.5SH(55) | from $0.30 [seen] | LCSC C506791 | Low |
| Everything else | 28 passives, switch, FETs, USB-C, crystal, diodes | under $1 total [seen/est] | LCSC, 9 Basic + 12 Extended lines | Low |

On-board parts, battery and motor: **$18.82 at 1, $15.74 at ~100**. Display adds $34.28.

## 8. Manufacturing plan
- **Fabrication and assembly:** JLCPCB standard assembly, single side, or PCBWay turnkey. Files are in `out/fab/`
  (Gerbers for 4 copper layers, mask, paste, silk, outline; separate plated and non-plated drill files).
- **Before uploading:** add 5 mm panel rails with mouse-bites and fiducials (parts sit 0.2–0.7 mm from the edge), check
  every part's rotation in the assembler's preview, and consign the radio module if it is still out of stock at LCSC.
- **Hand steps, in this order:** program and test the bare board (§9) → solder motor leads → plug the display → solder
  battery leads (connector cut off) → bridge JP1 last.
- **Tools:** Tag-Connect TC2030-IDC-NL cable ($33.95 [seen]), an SWD probe such as a J-Link or nRF52840-DK [est ~$50–60],
  a current-limited bench supply, a multimeter.
- **Not designed:** the case, strap, seals, a charging cradle, mounting holes. The battery and display outlines on the
  drawing layers are proposals.

## 9. Firmware and bring-up
1. **Build the firmware first, on your PC.** `BOARD=BANGLEJS2`, bootloader pass then the main pass, giving a merged hex
   with SoftDevice S140 6.1.1, bootloader, app and settings. Espruino publishes only update zips for this board, which
   cannot program a blank chip (firmware review). Do this before ordering anything.
2. Bare board, display unplugged, JP1 open: 3.7 V from a bench supply limited to 20 mA onto TP4. Check 3.0 V on TP1.
3. Probe the crystal: it must oscillate. If it doesn't, the firmware reboots forever.
4. `nrfjprog --recover`, flash the hex over J4. The J4 reset pin does nothing on this firmware; reset over SWD.
5. Hold the button about 3.5 s to boot from cold (the bootloader powers off after 1 s otherwise).
6. Connect with the Espruino Web IDE, run `Bangle.factoryReset()` once (the flash is blank), upload `pitchiq.app.js`,
   and set `batFullVoltage` to 0.3256.
7. Plug the display only after checking J1 pin 1 against the display's pin 1 with a meter.

**Two app changes needed for this board (not made; they are yours to approve):**
- Close the Bluetooth console in the app (`NRF.setServices(svc, {uart: false})`). Without the Bangle's Settings app
  there is no other way to turn "Programmable" off, and an open console would let anyone nearby read the game key.
- Rewrite the README install steps, which rely on the touchscreen launcher and Settings.

Known side effect: with no accelerometer the firmware sees constant fake tap events and keeps polling at 80 ms, which
costs some battery. Recovery if the app breaks: hold the button 5 s for Bluetooth DFU, or SWD.

## 10. Cost [est unless marked]
Per-order fixed costs at JLCPCB [seen]: setup $25.56, stencil $8.21, about $3 per Extended part line (12 lines),
$0.0016 per joint. Board price, shipping and duty were not quotable from here: I assumed $25–40 for boards, $30
shipping and the 35–92.5% US duty range JLCPCB's own page states. **These are not quotes.**

| Quantity | Parts per unit | Fabrication, assembly, shipping, duty | Total | Per unit |
|---|---|---|---|---|
| 1 (minimum order is 5 boards) | $53 | $170–220 | $225–275 | $225–275 |
| 5 | $53 | $180–240 | $445–505 | ~$90–100 |
| 25 | $52 | $330–480 | $1,630–1,780 | ~$65–71 |
| 100 | $50 | $500–900 | $5,500–5,900 | ~$55–59 |
| 500 | $50 if prices held | — | not estimable | — |

25 units and up cannot be built today: only 19 displays are on sale. One-time tools: about $90–100.
If sold as a product: Bluetooth SIG qualification fee $12,000 (Adopter member) or $6,000 (Associate) [seen]; FCC Part
15B testing of the finished product is still required with a certified module (lab price not found); the cell's UN38.3
test summary is needed for shipping.

## 11. Risks and what the reviews found
Five reviewers (PCB, firmware, manufacturing, procurement, QA) read the package cold; their reports are in `reviews/`.

**Fixed after review:** module decoupling and crystal moved next to their pins; copper removed from the antenna strip;
10 µF added on the battery rail for motor start; battery isolation link added; hand-solder pads moved to the right side
and stripped of paste; polarity marks added; all part numbers filled; module and display prices corrected.
**Reviewers were wrong on one point:** two said the button was wired backwards; the firmware source shows it is right.
**Second round:** a fresh reviewer measured the fixes on the board and confirmed them, and found the motor pads still 3 mm from the antenna. They are now 12 mm away, and the full check was re-run after that change (same result as above).

| Risk | Severity | Likelihood | What settles it |
|---|---|---|---|
| Display supply, and no backlight on the one you can buy | High | Certain today | Find a source for the backlit LPM013M126C, or accept day-only use |
| Display connector orientation (mirrored = blank screen, possible stress) | High | Unknown | Meter check with a display in hand before first plug-in |
| Firmware never built; no blank-chip image exists | High | Certain until built | Build on your PC first |
| Antenna detuned by the battery, motor body and display metal close to it in the stack | High | Likely to cost range | Range test against a Bangle.js 2 at the dugout-to-mound distance |
| 32 kHz crystal fails to start → reboot loop | Medium | Low | Scope on first board |
| Dead-flat battery may not recover on USB (77 mA charger, no power path, no under-voltage cut-off) | Medium | Possible | Test; add a low-battery shutdown in the app |
| No reverse-battery or fuse protection beyond the cell's own | Medium | User error | Polarity marks are on the board; protected cell is mandatory |
| Autorouted layout, tracks under the module, trimmed button pads | Medium | Unknown | Fabricator DFM check; inspect first boards |
| Bluetooth console open unless the app closes it | Medium | Certain until changed | One-line app change, then test |
| Battery percentage wrong without calibration | Low | Certain | Set `batFullVoltage`; calibrate per unit |
| LCD driven at 4 MHz vs 2 MHz datasheet limit (same as stock Bangle) | Low | Low | Look for display artefacts |
| "Bangle.js" name: the board advertises as "Bangle.js xxxx" | Legal | — | No trademark rule was found on Espruino's pages; ask Espruino before selling. Firmware is MPL-2.0 |

## 12. Roadmap
| # | Step | Done when | Effort [est] |
|---|---|---|---|
| 1 | Bangle.js 2 arrives: run the desk and field checklists you already have | app proven on real hardware | your test time |
| 2 | Build the Bangle.js 2 firmware from source on your PC | merged hex contains SoftDevice, bootloader, app | 1–2 evenings |
| 3 | Buy 2 displays, 1 module, 1 cell, 1 motor | parts in hand | ~$100 |
| 4 | Open the project in KiCad 8/9, run ERC and DRC, look at the layout | clean, or findings fixed | 1 evening |
| 5 | Check J1 orientation and antenna placement against the real parts | pin 1 confirmed | 1 hour |
| 6 | Panelize, order 5 boards assembled | boards arrive | ~$450–500, 2–3 weeks |
| 7 | Bring-up (§9), then the test list in `reviews/qa.md` item 14 | every test has a recorded number | 2–3 evenings |
| 8 | Rev B from what the tests show; case design | — | — |

## 13. Buy / do checklist for a first prototype
- [ ] Bangle.js 2 tests finished (decides whether this is worth doing)
- [ ] Firmware hex built and inspected
- [ ] 2× LPM013M126A (Switch Science 2858), 2× MDBT50Q-1MV2 (SparkFun), 2× Adafruit 1317, 2× FIT0774
- [ ] TC2030-IDC-NL cable, SWD probe
- [ ] ERC in KiCad; J1 pin 1 check; panel added
- [ ] Upload `out/fab/` to JLCPCB or PCBWay; check rotations in the preview
- [ ] Decide: backlit display source, or day-only

## Files
`scripts/design.py` (edit here) → `gen_sch.py`, `gen_pcb.py place`, `router.py`, `gen_pcb.py finish`, `gen_bom.py`.
`bash scripts/check.sh` re-runs every check. `research/` holds the sourcing notes with URLs; `reviews/` the reviews.

**Skill note:** `/boss-research-skill` is not installed. Research used the boss-worker-routing skill as you chose:
five Haiku research workers, six Sonnet reviews (five first-round, one second-round), with my own spot checks of the critical items.
