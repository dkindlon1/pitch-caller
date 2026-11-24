# PitchIQ watch rev D: final engineering report

Date: 2026-11-23. Branch `feat/watch-custom-hardware`. Nothing was ordered, paid for or built. Nothing in this report is a physical test result.

## Verdict

| Decision | Result |
|---|---|
| Order the bare / assembled boards today | **NO-GO** |
| Order a case meant to seal | **NO-GO** |
| Buy sample parts and a printed fit-check case set (about $200-260, my estimate, no cart priced) | **GO, if you approve the purchase** |

Why the board order is NO-GO: three things decide whether the board is right, and none can be settled from files.

1. The display cable. Which face of the Sharp panel's cable carries the contacts, how long the tail is, and whether it reaches the connector after the fold. The connector type and pin order on the board are my best reading of Sharp's drawing and KiCad's 3D model. If that reading is wrong, the display does not work and the board is scrap. A $12 panel and a $2 connector answer it.
2. The fabricator's answers: a 30.6 x 36 mm board is below JLCPCB's 70 x 70 mm minimum for two-sided assembly, so it needs their panel option; 6 layers at 0.8 mm, filled vias and the notch need their confirmation. No quote was obtained.
3. Part rotations in the placement file are unverified apart from one correction taken from a community table. They have to be checked in JLCPCB's preview before paying.

The loop stopped here because every remaining blocker needs real parts, a supplier's answer or a purchase you control.

## Status at a glance

| Area | Status | Evidence |
|---|---|---|
| Schematic | Rule-clean | KiCad 7.0.11 native ERC: 0 errors, 0 warnings (`out/erc_report_kicad.txt`). The check was proven live: breaking the power pins on purpose produced 9 errors |
| Board | Rule-clean, routed | KiCad DRC: 0 errors, 0 unconnected, 68 warnings (66 footprint-library notices, 2 silk over copper). Copper matches the netlist with 0 differences |
| Circuit vs datasheets | Checked on paper | All 33 pins of the power chip compared with Nordic's product specification v1.3; module, accelerometer, USB-C, crystal, transistor pinouts compared with drawings (`reviews/p1_*.md`) |
| 3D CAD | Built, interference check passes | `cad/build.py`: 25 solids, no unintended overlaps, all clearance rules met. A CAD check is not a fit check |
| Firmware | Compiles | Watch target exit 0, 226,516 B flash (46.88 %), 50,656 B RAM, 0 warnings; dev-kit target exit 0; core host tests pass. **Never run on hardware** |
| Waterproofing | Design concept only | Not validated. A printed nylon cover is not expected to seal |
| Sourcing | Partly viable | Details in section 10 |

## 1. Board revision and verification

Rev D board: 30.6 x 36 x 0.8 mm, 6 layers, 62 parts, 38 nets, 142 vias. Rev A, B and C are untouched in the repo.

`scripts/check.sh` (output in `out/check_output.txt`) ends with `CHECK: PASS`: netlist equals `design.py`, scripted ERC 0, native ERC 0/0, pad nets 0 differences, DRC 0 errors, antenna keep-out 0 violations, BOM complete, fab files present, firmware core tests pass. Passing these checks says the files agree with each other. It does not say a built board works.

## 2. The twelve rev C issues

| # | Issue | Result | Evidence |
|---|---|---|---|
| 1 | USB-C height | Closed in files | GCT drawing re-read: 4.21 mm. Modelled in CAD; the stack was rebuilt around it |
| 2 | Connector on the underside | Closed in files | In a 10.3 x 6.3 mm edge notch on the bottom side; CAD shows clearance to the cell |
| 3 | USB-C orientation | Closed on paper | Pin map compared with the GCT drawing by a reviewer. A real part must still be laid on a 1:1 print |
| 4 | Charging a flat cell | Firmware fix, untested | Charger is now told to charge below the low-battery threshold (register 0x50), and errors are cleared and retried. Compiles only. Starting from USB with a flat or missing cell is still a bench test |
| 5 | Programming-pad protection | Closed in files | 100 ohm series resistors, protection diodes, 1 k on the 3 V pad |
| 6 | Display cable contact side | **Open, needs a panel** | Best reading: contacts face up after the fold, so a top-contact connector |
| 7 | Display connector choice | Changed, **needs a panel** | Hirose FH12A-10S-0.5SH(55), top contact, hand-fitted, pin order reversed. One auditor read the cable entry the other way; I sectioned KiCad's own 3D model and it faces the lower board edge as designed |
| 8 | Antenna keep-out | Closed in files | T-shaped keep-out per Raytac's zone; checker reports 0 violations. Range is unmeasured |
| 9 | Battery near the radio | Open, needs measurement | Cell, display glass, steel spring bar and screws all sit near the antenna end. Only a range test answers this |
| 10 | Unreviewed autorouting | Reviewed | Independent routing review: voltage drops fine (55 mV worst), planes continuous, no dangling tracks. Its findings on capacitor placement were fixed and re-routed |
| 11 | No native ERC | Closed | Runs inside KiCad's own tool and is part of `check.sh` |
| 12 | Nordic power circuit comparison | Closed on paper | Full specification text obtained; all pins confirmed |

## 3. Corrections made in rev D

- Removed two resistors that would have halved the USB-C detection resistance (the chip has them built in).
- Removed the unused 1.8 V regulator's parts; moved the power chip's capacitors next to its pins.
- Input capacitors changed to Nordic's values; second capacitor added at the accelerometer.
- Display connector changed to top-contact with reversed pin order.
- Antenna keep-out enlarged; protection diode moved onto the USB power pads.
- Module and USB-C connector taken out of the assembler's files (out of stock there, and the USB-C needs hand soldering anyway).
- Firmware: flat-cell charging and charger error recovery.
- One reviewer claim was checked and rejected with evidence: the notch corners are true relief circles (measured in the board file), not fillets.

## 4. CAD model and where it is

All under `watch/hardware/revD/cad/`:

- `params.py`: every dimension, each tagged seen on a drawing, estimated, or a design choice. Edit here and rebuild.
- `build.py`: the parametric model (CadQuery, Python). Running it rebuilds everything and runs the checks.
- `assembly.step`, `exploded.step`, `step/*.step` (one per part): open in SolidWorks, Fusion or Onshape.
- `step_mjf/`: the same parts with print allowances for a fit-check print.
- `report.md`: clearance and interference results. `views/`: drawings.
- `docs/MECH_revD.md`: mechanical BOM, assembly sequence, tolerance table, prototype plan.

Parts modelled: board, radio module, power chip, accelerometer, motor, display with its folded cable, lens, cell, side switch, USB-C with gasket, port plate, case, back cover and gasket, screws, button plunger with pad and O-ring, spring bars, strap.

## 5. Case dimensions

34.8 x 42.1 x 11.49 mm body, 53.3 mm over the lugs, 36.4 mm across the side button (a 1.0 mm boss plus the cap). Your reference was 36 x 43 x 12 and the wish was about 34 x 40 x 11. Width beats the wish; length and thickness do not. Thickness is set by the 4.21 mm USB-C connector plus the material its seal needs, and I did not trade that away.

## 6. USB-C sealing

The gasket seals on its face and must be squeezed from 1.50 mm to 0.90-1.05 mm, a window far tighter than the board-to-case tolerances can hold. The design does not rely on tolerances: a separate port plate carries the gasket pocket, is pushed against the connector with a shim setting the squeeze, and is then glued into an oversize window in the case wall, with a sealant bead as backup. Each unit would be leak-tested. Options compared (floating connector, daughterboard, flex, potting) are in `docs/MECH_revD.md`.

This is a concept with passing geometry. Whether it seals is unknown until one is built.

## 7. Strap

20 mm quick-release black silicone (reference: Archer, 1.8 mm bar with 0.9 mm tips, strap 3 mm thick). Lugs are 20.0 mm apart with bar holes in the model. Lug strength in printed nylon is a rough estimate and needs a pull test.

## 8. Integration results

Checked in CAD: no part collisions; cell has 0.80 mm of room to swell; display cable bend starts 0.8 mm or more past the glass; gasket land and plate thickness meet their minimums; the button plunger reaches the switch through a sealed bore. Not checkable in CAD: cable latch slack during assembly, button feel, whether the motor is felt through the back, RF.

## 9. BOM

`docs/BOM.csv` (39 lines). Machine-placed: 46 parts, 23 part numbers (`out/fab/bom_jlcpcb.csv`, `cpl_jlcpcb.csv`). Hand-fitted: radio module, USB-C, display connector, battery and motor leads.

## 10. Availability (read on vendor pages 2026-11-23 or earlier the same day; not re-checked at a cart)

- Power chip: 8,579 in stock at DigiKey.
- Radio module: SparkFun in stock; out of stock at LCSC.
- Display: in stock at DigiKey, 28-week factory lead time. Single source.
- USB-C: Mouser in stock; out at LCSC. Single source.
- Accelerometer: none at US distributors, some at LCSC.
- Motor: conflicting readings (in stock, then backorder). Treat as unconfirmed.
- Display connector: stock not seen.
- Cover screws (M1.4 thread-forming): no catalogue part found. Fallback is M1.6 with heat-set inserts, not yet modelled.

## 11. Cost estimates

From `docs/COST_revD.md`. **None of this is a quotation.** Per finished watch: about $746 / $245 / $140 / $101 / $71 at 1 / 5 / 25 / 100 / 500 units. The small quantities are dominated by minimum orders and fixed fees and could be off by a factor of two. A machined case adds about $160 / $105 / $57 / $39 at 1 / 5 / 25 / 100. Certification costs (FCC, the $12,000 Bluetooth fee when you sell) are not included. The model predates moving the module and USB-C to hand-fitting, which shifts a few dollars from assembly to labour.

## 12. Firmware build

Zephyr 4.4.2 with MCUboot. Both targets and the host tests exit 0; logs in `watch/firmware/build_logs/boss_revD_*.log`, written after the last source change. A clean compile is all that exists.

## 13. Audit findings

Three independent audits, each able to reject:

- Electrical / power / firmware: NO-GO on the display connector direction (rejected with 3D-model evidence, see issue 7) and on missing physical tests. Charger error handling was added in response.
- Mechanical / integration / RF: NO-GO for the case, GO for boards. Its critical finding (0.02 mm of material under the gasket pocket) and the others were fixed and are now enforced by rule checks.
- Manufacturing / sourcing / QA: NO-GO for boards plus assembly as packaged; GO for a split order with samples first. File fixes applied; the rest are order-time actions.

A fourth reviewer then re-measured every claimed fix on the actual files (`reviews/reaudit_after_corrections.md`):

- Confirmed by its own measurement: 0.62 mm under the gasket pocket, pins and posts, print allowances, envelope, no collisions in either part set, no rib collisions, notch relief circles, module and USB-C out of the assembler's files, charger code present and built after the last edit.
- Display connector: it sectioned the 3D model itself and agrees the cable entry faces the lower edge and the pin mapping is consistent. Its confidence in the whole chain is about 75-80 %, because the rest depends on Sharp's drawing and on the top-contact part sharing the footprint. That is why the panel check gates the board order.
- It rejected one of my fixes: the button O-ring groove left a 0.16 mm wall, not the 0.2 mm I claimed, and the plunger could not move out of the board's way. Fixed with a local boss at the button; I measured the result on the exported solid (0.59 and 0.60 mm walls). It also found a thin lug web in the print set (fixed, now 0.79 mm), a missing print gap (fixed) and two wrong numbers in my clearance report (fixed).
- Its verdicts: sample parts GO; boards NO-GO today. Same as mine.

These last fixes have not been re-audited by anyone but me. Also not re-checked after the first audit: a few minor electrical notes (capacitor voltage ratings, track widths on two nets, leftover "rev C" text strings), listed in `reviews/audit_electrical_power_firmware.md`.

## 14. Physical validation still required

Before the board order (sample parts):
- Display panel and connector: contact face, tail length, fold, connector on a 1:1 footprint print.
- USB-C part and gasket: height, pad reach, gasket free thickness.
- Cell thickness (nothing over 4.0 mm fits), motor size and feel, strap and bar fit in printed lugs.
- Dev kits: run the firmware; charge start from USB with a flat cell and with no cell.

On the first boards: power-up, charging, display, radio range in the case with steel and plastic bars, button force, motor felt at the wrist, battery life against the power budget.

On the first cases: port-plate bond and leak test, cover seal (needs a 1.5 mm aluminium cover or an adhesive gasket; printed nylon is expected to bow), lug pull test.

## 15. GO / NO-GO criteria used

A GO for boards needed all of: checks clean (met); circuit matched to datasheets (met on paper); every board-affecting unknown closed (not met: display cable); fabricator confirms it can build and assemble this board (not met); placement rotations verified (not met). A GO for a sealing case needed a validated seal concept (not met, by definition, without parts).

## 16. Next steps, in order

1. You approve the sample purchase: Sharp panel, two FH12A connectors, USB4715 kit with gasket, cell, motor, strap, nRF52840 dev kit, nPM1300 evaluation kit, printed fit-check case set from `cad/step_mjf/`.
2. Run the checks in section 14. If the display cable differs from my reading, I change the connector and re-route (small change).
3. Get a JLCPCB quote with the notes in `docs/FAB_NOTES_revD.md`; check rotations in their preview.
4. Then, with your approval, order 5 boards.
