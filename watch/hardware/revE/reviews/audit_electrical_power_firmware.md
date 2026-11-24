# PitchIQ watch rev D: final audit (electrical / power management / firmware), 2026-11-23

Scope: decide whether FIRST ENGINEERING PROTOTYPES may be ordered. Read-only except this file. Nothing was built or run on hardware.
Tags: CHECKED (file:line or my own measurement with pcbnew/diff) / NOT CHECKED. "Consistent on paper" and "compiles" are the strongest claims available.
Coordinates are board coordinates (sheet minus x 100, y 80). Measurement scripts are in /tmp/aud (not part of the repo).

## 0. VERDICT (my domain): NO-GO, one gate, then GO

The design has no electrical defect I can find that would damage the display or the nRF52840, and the power-chip circuit is consistent with PS v1.3 on paper.
It fails on one point that the design itself declares to be a gate: design.py:97 says "Must be confirmed with a real panel before boards are ordered".
That has not happened, and the file now contradicts itself about the display connector (section 2, finding F1).

Blocker that can still be fixed in files (and by a 1-hour physical mock-up, no boards needed):
- F1: J1 cable-entry direction. Measured: J1 sits at rot 0, so the FH12 footprint puts the cable opening on the NORTH side (toward the board centre), while design.py:94-96 says "cable entry toward the lower board edge" (south). With the tail folded under the glass from the south edge, an opening that faces north cannot take it. Reversing the nets did not fix that; it only moved terminal 1 to the east pad.

Everything else is either fixable after the order (firmware, F3-F5), a cheap optional hedge, or a physical-test dependency (section 8).
When F1 is closed (mock-up with the real Sharp panel plus a real FH12A-10S-0.5SH(55), then either keep rot 0 / reversed nets, or rotate J1 180 degrees and un-reverse the nets), my verdict becomes GO for ordering boards.

## 1. Status of every CRITICAL and MAJOR in the four p1 reviews

| p1 id | Was | Status | Evidence |
|---|---|---|---|
| elec #1 flat cell never charges (BCHGVBATLOWCHARGE) | CRITICAL | FIXED in firmware, compiles, not run | power.c:100 (reg 0x50), power.c:174 writes 1 before EN_SET at :176; same register as stock driver (zephyr npm13xx_charger.c:67, :647). Build log boss_revD_pitchiq.log ends EXIT 0. New problem found: trickle timeout, see F3 |
| elec #2 cold start from USB, no/empty cell | MAJOR | PARTLY FIXED; remains a Nordic-side unknown, PHYSICAL-TEST | C24 not fitted design.py:118; C12 and C5 now 1 uF design.py:64,67; VSYS cap now C7+C8 20 uF + C25 (design.py:64-65). The suggested series 0402 in VSYS and a VBUS-VSYS bridge pad were NOT added. Numbers in section 3.4 |
| elec #3 external CC resistors double Rd | MAJOR | FIXED on paper | no R21/R22 in design.py (note at :129-131); U2 CC1/CC2 go only to J3 A5/B5. Internal Rd with a dead chip: PHYSICAL-TEST |
| elec #4 / comp C1 / display J1 contact side and pin 1 | MAJOR / CRITICAL | PARTLY FIXED: contact side TOP now (design.py:98,101); terminal 1 now east (measured); opening direction contradicts the file's own comment, see F1 | pcbnew: J1 (14.0,31.0) rot 0; pad 10 = LCD_SCK at x=16.25 east; footprint pads y=29.15, body y 29.8..35.4 |
| elec #5 VBUS/VBUSOUT 10 uF | MINOR | FIXED | C12, C5 1 uF (design.py:64,67); C6 VBAT is still 10 uF (design.py:64), Nordic table 39 says 2.2 uF X7R 16 V: open MINOR |
| elec #6..#10 | MINOR | #6 SMF5.0A unchanged (open MINOR); #7 LSOUT open FIXED (design.py:56-57); #8 C26 added FIXED (design.py:89); #9 none; #10 L1/C9/"1V8" removed FIXED (design.py:50) | |
| comp C2 SW1 actuator faces the board interior | CRITICAL (unverified by p1 too) | OPEN, UNVERIFIED | SW1 unchanged at (28.5,12.0) rot -90 on B.Cu (pcbnew). Alps drawing never read by anyone |
| comp M1 CPL bottom rotation | MAJOR | FIXED | cpl_jlcpcb.csv: J3 Bottom 180, SW1 Bottom 270, D4 Bottom 90 |
| comp M2 CPL top-side JLC rotation corrections | MAJOR | OPEN (order-time check, not a design defect) | gen_bom.py:70 says no corrections applied; CPL has raw 0/90 for U1,U2,U4,Q1,D2. Compare pin 1 in JLC's preview |
| comp M3 J3 height 4.21 mm | MAJOR | OPEN, MINOR in practice | enclosure item |
| route C1 J3 body overlaps cell | CRITICAL (mech) | PARTLY: cell outline moved from x 6.2 to 6.6 (User.Drawings rectangle 6.6..26.35 x 9.8..35.8); J3 bbox still reaches x=8.22 (y 4.25..16.75) | MECH_revD.md says cell-to-J3 0.50 mm; these do not agree. Cell is lead-attached, so this does not block a board order: MINOR / PHYSICAL |
| route M1 C25 21 mm from U2.4 | MAJOR | FIXED | C25 (17.6,23.45) rot 90; pad1 VSYS (17.6,23.93) to U2.4 (18.86,23.95): 1.3 mm of F track, no via; C25.2 GND (17.6,22.97) to U2.2 PVSS1 by F track and own GND via (17.3,22.3) at 0.73 mm |
| route M2 C8 ground via 2.8 mm and thin feed | MAJOR | PARTLY FIXED | C8.2 (14.72,23.9) now 0.84 mm from GND via (13.9,23.7). VSYS tracks still all 0.2 mm (every VSYS, VBUS, VBAT, 3V0 segment is 0.2 mm; checked); the 0.4 mm widening was not done. Fine at 150 mA mean (p1 section 1.3) |
| route M3 D2 not at the connector | MAJOR (ESD) | FIXED for position, not for width | D2 (8.0,13.2): D2.1 ~3.7 mm and 1 via from J3.B9 (7.03,12.02); D2.2 GND nearest via 1.5 mm. VBUS trunk still 0.2 mm |
| route M4 LCD metal 1.05 mm from antenna end | MAJOR (RF) | OPEN; PHYSICAL-TEST | LCD outline unchanged y>=5.5 (User.Comments); check_output.txt antenna strip: foreign copper 0 |
| route M5 open via barrels in U2 EP | MAJOR (assembly) | OPEN; MINOR/PHYSICAL | EP vias (20.4,23.3) (22.2,23.3) (20.4,25.1) (22.2,25.1), drill 0.2; F_Mask has a 3.45 mm square opening for the EP so the barrels are exposed on top; no tent/fill note found in out/fab. Fix: order "via-in-pad resin filled" or accept wicking on engineering units |

## 2. J1 display connector: independent re-derivation

### 2.1 Facts measured (CHECKED)
- J1 = Hirose_FH12-10S-0.5SH_1x10-1MP footprint, (14.0,31.0), rot 0, F.Cu. Pads 1..10 at x = 11.75, 12.25 ... 16.25 (pad n at 11.25+0.5n), y = 29.15; mount tabs MP at (9.85,32.4) and (18.15,32.4).
- Nets by pad: 1 GND, 2 GND, 3 LCD_EXTMODE, 4 3V0, 5 3V0, 6 LCD_DISP, 7 LCD_EXTCOMIN, 8 LCD_CS, 9 LCD_MOSI, 10 LCD_SCK.
- Sharp order: T1 SCLK, T2 SI, T3 SCS, T4 EXTCOMIN, T5 DISP, T6 VDDA, T7 VDD, T8 EXTMODE, T9 VSS, T10 VSSA. design.py:99-100 assigns pad (11-n) to terminal n. Pad 10 (east) = T1 ... pad 1 (west) = T10. Consistent with the table; the as-built copper agrees with design.py (check_output.txt: pad-net differences 0).
- Body: footprint fab outline y 29.8..35.4 (south of the pads), board edge y=36.05, silk body to y=35.5. Signal pads (28.5..29.8 in y) project NORTH of the body front edge.

### 2.2 Fold geometry (from p1_display_connector.md, not re-measured: it rests on Sharp Fig 4-1/8-2 text, which I did not re-read)
Glass above the board, tail leaves the south glass edge, folds 180 degrees backward (away from the polarizer) and runs NORTH under the glass. Contacts that were on the back face now face up, so a TOP-contact part is needed; east stays east, so Sharp terminal 1 lands on the EAST side. Both rev D choices (top contact, T1 on the east pad) agree with that.

### 2.3 What is right, what is not
- Pin mapping by position (east pad = T1): RIGHT, if the tail enters the connector from the south and the front view puts T1 at the right (Sharp Fig 4-1 per p1). Same physical result as p1's alternative (rot 180, pad 1 east, un-reversed nets).
- Cable-entry direction: in this footprint, the pad row is the FRONT (opening) side; at rot 0 the opening faces NORTH. A tail that arrives travelling north cannot enter an opening that faces north. design.py:96 ("cable entry south") contradicts the footprint as placed. My confidence about the footprint reading is about 85%: I could not obtain the Hirose drawing (arrow.com PDF returned binary only; hirose.com/DigiKey not reachable). So: UNDECIDABLE without the part, but the file is internally inconsistent either way.
- If the opening really faces north and the board is built as is: no electrical damage, the panel just cannot be connected without an extra reverse bend (Sharp allows 3 bends and forbids bending toward the polarizer). Outcome is "no picture / respin".
- Also unverified: FH12A land pattern equals the FH12 footprint (BOM.csv line for J1 says so itself), stiffener vs connector depth, tail length.

### 2.4 Consequence of a wrong pin order (mirror T1<->T10 ... T5<->T6)
Panel terminal k would see the net of terminal 11-k: SCLK and SI pins held at board GND; VSS and VSSA driven by the MCU outputs LCD_SCK and LCD_MOSI; VDD and VDDA driven by the MCU outputs LCD_EXTCOMIN and LCD_DISP; DISP and EXTCOMIN tied to 3V0; SCS tied to the EXTMODE net (3V0 through R11), EXTMODE to LCD_CS.
Result: no picture for certain. Damage cannot be excluded: GPIO outputs (nRF52840 5 mA standard, 15 mA high drive) fight each other and the grounded pins through the panel's ESD diodes and internal VSS/VSSA tie; the panel supply is only microamps, so I expect the pin currents to stay in the mA range and the panel to survive, but I cannot show that. 3V0 itself (max 3.3 V even on a wrong VSET2, section 3.3) stays inside the panel's 3.6 V limit, and the display never sees VSYS. Rated: no-picture certain, damage possible but not expected. It is not a safety issue.

### 2.5 Cheap hedges (pick at least the first)
1. Before releasing Gerbers: buy one Sharp LS013B7DH03 and one FH12A-10S-0.5SH(55), fold the real tail, and look at which end of the connector it enters and which pad row meets which tail finger (about 1 hour, no boards). This closes F1.
2. On the first boards, do not populate J1 until a power-off continuity check with the panel seated: measure that the two pads that meet T9/T10 (VSS/VSSA, tied together inside the panel) are the GND pads (pads 1 and 2 as built).
3. Keep DISP low and do not power the panel until step 2 passes. 3V0 hard-wires VDD, so step 2 is the real protection.
4. If a respin is cheaper than a mock-up: place two J1 footprints is not feasible on 30 x 36 mm; do not try.

## 3. nPM1300 circuit vs PS v1.3 (pin by pin, CHECKED against design.py:49-70 and the PS text copy)

### 3.1 Pin table
| Pin | Name | rev D | Verdict |
|---|---|---|---|
| 1 VOUT1 / 3 SW1 | BUCK1 | NC / NC, no L or C (design.py:50) | consistent on paper. Nordic's one-buck reference (config 2, table 39 L1/C4 labels) uses BUCK1 as the used buck; rev D uses BUCK2 and leaves BUCK1 open, so "as in Nordic's configuration" (design.py:50, dts:115) is not literally true. UNVERIFIED ASSUMPTION, low risk: VSET1 grounded disables the buck (PS 6.3.1) and an unused buck is not documented to need parts |
| 2, 6 PVSS1/2 | GND | tied to EP by 0.3 mm F stubs | PS figure labels "Via to GND-layer on PVSS1/PVSS2" and "Net tie" to AVSS: Nordic separates PVSS from AVSS with a net tie. Rev D shorts all three at the EP. UNVERIFIED ASSUMPTION (figures are images); worst effect is noise on the ADC (battery/NTC readings), not damage |
| 4 PVDD | VSYS | C25 100 nF at 1.3 mm, C8 10 uF at 2.6 mm | consistent on paper |
| 5 SW2 | L2 2.2 uH 2012 to 3V0 | Isat of TDK MLP2012H2R2MT0S1 not read (PS table 19 needs > 350 mA) | UNVERIFIED ASSUMPTION; read the TDK sheet or use the Murata alternative named in BOM |
| 7-11 GPIO0..4 | GPIO1 = INT to P0.06; others NC | defaults are inputs with weak pull-downs; nothing feeds a PMIC GPIO from VSYS | consistent on paper |
| 12 VDDIO | 3V0 | 1.7 V to VSYS allowed | consistent on paper |
| 13/14 SDA/SCL | 4.7 k to 3V0 | | consistent on paper |
| 15 SHPHLD | BTN: SW1 to GND, D3 TVS | internal pull-up, button to GND is what PS requires | consistent on paper. PESD5V0S1BA leakage may exceed the 0.37 uA ship-mode figure of power_budget.md: NOT CHECKED, MINOR |
| 16 VSET2 | 150 k to GND = 3.0 V | PS table 18 | consistent on paper. Worst case any VSET resistor error gives <= 3.3 V (largest table entry), software cannot exceed 3.3 V either |
| 17 VSET1 | 0R = off | PS table 17 | consistent |
| 18 NTC | RT1 10k/3380 to GND | | consistent. ADCNTCRSEL written (power.c:156) |
| 19 VBAT | JP1 (open until assembly), C6 10 uF | table 39 says 2.2 uF X7R 16 V | open MINOR |
| 20 VSYS | C7 10 uF (10 V part) | table 39 uses 25 V 10 uF; at 5 V a 10 V 0603 X5R keeps maybe half its value | MINOR / UNVERIFIED (no DC-bias curve read); cheap fix: 16 V or 25 V parts for C7, C8, C6 |
| 21 VBUS | C12 1 uF 25 V, D2 TVS | table 39 1 uF | consistent |
| 22 VBUSOUT | C5 1 uF only | table 39 1 uF | consistent |
| 23/24 CC1/2 | straight to J3 A5/B5 | PS requires direct connection | consistent |
| 25-27 LED0-2 | NC | | consistent |
| 28/30 LSIN1/2 | GND | | PS silent; same as third-party boards. UNVERIFIED, low risk |
| 29/31 LSOUT1/2 | open | | good (a grounded output would be a dead short if a switch were enabled); firmware must never enable them (no node in dts) |
| 32 VOUT2 | 3V0 | | consistent |
| 33 EP | GND, 4 vias | | consistent; via barrels open, F5 |

### 3.2 Unused load switches, unused buck, CC, NTC, SHPHLD: as per table above; no state found that violates an abs-max on paper.

### 3.3 Anything that can overstress the display (3.6 V) or the nRF52840 (VDD 3.9 V)? CHECKED on paper: no.
- 3V0 comes only from BUCK2; VSET2 150 k = 3.0 V; the highest VSET entry is 3.3 V; dts caps BUCK2 at 3.0 V (pitchiq_watch.dts buck2 node). No path from VSYS or VBUS (5 V) to 3V0 exists in design.py (VSYS only feeds PVDD, the motor and D1).
- The nRF52840 module's VBUS pad (U1.32) is tied to GND (design.py:32): the module's own 5 V pin is not used.
- Residual: buck overshoot during start from a 5 V VSYS: PS abs max for VOUT is 5.5 V; overshoot to 3.9 V at the nRF is not documented either way. PHYSICAL-TEST: scope 3V0 on first USB plug-in (section 8).

### 3.4 Start-up from USB with a flat or absent cell (numbers)
Assumptions: 5.0 V source, 100 mA default limit (IBUS100MA, 95 mA min per PS), VBAT 0 to 2.1 V or open (JP1 open).
1. VBUS rises: VBUSPOR 3.9 V reached, VBUS-VBAT >= 210 mV (VBUSVALID), VSYS follows VBUS (PS 6.1.1: "VBUS voltage is seen at VSYS", not regulated). VSYS ~4.8-4.9 V.
2. Capacitance on VSYS: C7+C8 20 uF + C25 0.1 uF (C24 not fitted) + buck input; on VBUS 2 uF (C12+C5). Charging 20 uF to 5 V at 95 mA takes about 1 ms. Inrush into 2 uF at VBUS: small (this is why C12/C5 went to 1 uF).
3. BUCK2 starts (VSYS above 2.7 V, VSET2 sampled): 3V0 caps are C1 10 + C10 10 + C11 1 + C2 0.1 + C13/C26/C22/C23 about 22 uF. Soft-start limited; MCU boot current MCUboot + app ~5-10 mA at 3 V, or 3-6 mA from VSYS.
4. Charger is OFF until firmware enables it (PS 6.2.1). After MCUboot (signature check) and app init, charger_lite_init() sets VBATLOW charge (power.c:174) then enable (power.c:176): chip trickle charges at 10% of ICHG (74 mA, so 7.4 mA) while VBAT < 2.9 V (VTRICKLE_FAST), constant current 74 mA above.
5. Input current budget at the 100 mA limit: 74 mA charge + about 10 mA system = 84 mA, below 95 mA. A motor buzz (70-105 mA from VSYS, design.py:113) on top of 74 mA exceeds the limit; with a healthy cell the battery supplements, with a cell below ~2.9 V it cannot: VSYS sags toward 2.7 V and BUCK2/MCU can brown out. MINOR/PHYSICAL: gate haptics when VBUS is present and VBAT is low (not checked in haptics.c beyond the duty cap).
6. Trickle timeout: PS table 16 tOUTTRICKLE = 10 min. 7.4 mA x 10 min = 1.2 mAh. A cell that needs more than that to climb from its present voltage to 2.9 V ends in a latched charge error (PS 6.2.6: cleared by unplug/replug or TASKCLEARCHGERR). Firmware has no handler (grep: CHG_ERROR only wakes battery_report, app_glue.c:280-282). See F3.
7. Absent cell: PS 2706: repeated charger events; firmware will post EVT_CHARGER repeatedly, harmless but costs I2C traffic on USB.
8. Known external reports (DevZone 128233, 125337 in p1) of VSYS collapsing to 2.5 V on cold start remain unexplained by Nordic: PHYSICAL-TEST P1, with the fallback of a series resistor in VSYS (not added; only a respin item).

## 4. Native ERC (CHECKED)
- Genuine: out/erc_report_kicad.txt is KiCad's own text ("ERC report (Mon Nov 23 20:56:46 2026, Encoding UTF8)", 0 errors, 0 warnings), newer than kicad_sch (20:25:49). scripts/native_erc.sh drives eeschema's ERC dialog through Xvfb/xdotool with fixed click coordinates; native_erc_run.txt "Terminated" is the script's own pkill. The .kicad_pro has no rule_severities override (default severities apply).
- Symbols carry real pin types (PQ.kicad_sym: 25 power_in, 7 power_out, 17 input, 10 output, 7 bidirectional, 122 passive, 49 no_connect), generated from design.py's type table (gen_sch.py:12).
- What 0 errors proves: connectivity matches the author's type table, no output-output conflict, every power_in net has a power_out driver, no stray unconnected pin (49 no_connect flags).
- What it does NOT prove: the types themselves (hand-written by the author, not from a manufacturer library; most U2 pins are "passive", so pin-function checks are weak); every pin is attached by a single-pin global label (gen_sch.py:95), so wire-level errors cannot occur; the 'power_out' sources for GND (BT1.2) and 3V0 (L2.2) are an author convention; there are 0 PWR_FLAG; no voltage-domain, sequencing, pull-up, or footprint pin-1 checking. Pin numbers vs datasheets are only as good as p1_electrical_reference.md (it read the PS pin table; I did not re-read Raytac/ST/Sharp pin tables).
- The "scripted ERC" in check_output.txt (own script, 4 strap notes) was read but its logic was NOT audited.

## 5. Board measurements (pcbnew, CHECKED)
- U2 PVDD: C25 centre to U2.4 1.3 mm (F track 0.6 mm + pad), C8 2.6 mm centre; C25 GND own via 0.73 mm plus F track to U2.2; C8 GND via 0.84 mm. EP: 4 vias at 1.27 mm from centre. U2.2/U2.6 are 1.55-1.58 mm from the nearest via but tied to the EP by F stubs. Loop PVDD-C8-via-In1-EP-PVSS about 8-9 mm. Acceptable for a first spin.
- VBUS: J3.B9 -> D2.1 about 3.7 mm and 1 via; J3 -> C12.1 about 30 mm over F, In3 (7 mm, 0.5 oz), B, with 4 vias; C12.1 -> U2.21 3.9 mm F, no via. All 0.2 mm. DC: about 0.11 ohm, 55 mV at 0.5 A (hand calc, same as p1). A 30 nH-class trunk between the clamp and the chip is irrelevant for the slow hot-plug ring but means ESD at ns scale is not clamped at the chip pin: MINOR, 22 V pin rating gives margin. Fix if wanted: 0.4 mm VBUS trunk. (The automated path search failed on pad bridging; these lengths are hand-summed from the segment list, +-0.5 mm.)
- Crystal: XL1 7.2 mm, all F, 0 vias; XL2 5.7 mm with 2 vias (In2 2.9 mm). XL1 and XL2 cross because Y1 pads are swapped relative to the module pads. Y1 is non-polarised: swap the nets on Y1.1/Y1.2 and the crossing, both vias and about 1 pF of extra stray go away. MINOR. Check the 32 kHz frequency on the first board.
- 3V0 into In4: 22 vias; L2.2 to nearest 3V0 via 1.16 mm, C10.1 0.89 mm, U2.32 0.58 mm, U1.28/30 0.7 mm.
- Ground at U2: see first bullet. J1 supply pins J1.4/5 have vias 1.05 mm; C22/C23 are several mm away (panel draws microamps).
- Via 0.5/0.2 mm everywhere (annular ring 0.15 mm, JLC absolute minimum; p1 m6 still open).
- Nothing I found that a competent layout engineer would refuse to fabricate for an engineering prototype. Items they would ask to change if cheap: widen VBUS/VSYS-PVDD to 0.3-0.4 mm, add fiducials (p1 m8), second via on VBAT (p1 m14), fill or tent EP vias, swap Y1 nets.

## 6. Firmware
### 6.1 Pin map dts vs design.py (CHECKED, all consistent)
| Function | dtsi define | design.py net / module pad |
|---|---|---|
| LCD SCK | P0.13 | LCD_SCK, pad 37 P0.13 |
| LCD MOSI | P0.15 | LCD_MOSI, pad 39 P0.15 |
| LCD SCS (active high) | P0.17 | LCD_CS, pad 41 P0.17, R10 pull-down |
| LCD EXTCOMIN | P0.20 | LCD_EXTCOMIN, pad 44 P0.20 |
| LCD DISP | P0.22 | LCD_DISP, pad 46 P0.22, R9 1 M |
| Frontlight PWM | P0.24 | FL_PWM, pad 48 P0.24, R14 pull-down |
| I2C SDA / SCL | P0.26 / P0.27 | I2C_SDA pad 19 / I2C_SCL pad 16 |
| Accel INT1 | P0.04 | ACC_INT pad 20 |
| PMIC INT (nPM1300 GPIO1) | P0.06 | PMIC_INT pad 22; dts pmic-int-pin = 1 matches U2.8 GPIO1 |
| Motor PWM | P0.11 | VIB pad 27, R15 pull-down |
| nRESET | P0.18 (gpio-as-nreset) | NRESET pad 40, R16 10 k, R19 100R to the pad |
Also consistent: accel address 0x19 (SA0 high, design.py:85), nPM1300 0x6b, EXTMODE strapped high by R11 with EXTCOMIN toggled by the driver, SPIM2. Whether the Raytac pad-to-port numbers themselves are right: NOT RE-CHECKED by me; p1_electrical_reference.md says they match the Raytac table except pads 20 and 27 which it did not see printed.

### 6.2 Builds (CHECKED)
- boss_revD_pitchiq.log, boss_revD_dk.log end "EXIT 0"; boss_revD_core.log ends "ALL PASS", "sanitizer run: clean", "EXIT 0". Zephyr stock charger path is not compiled (CONFIG_NPM13XX_CHARGER=n in app/boards/pitchiq_watch.conf; power.c "lite" path is what runs).
- mtimes: pitchiq log 20:57:52, dk log 20:58:10; power.c 20:19:59, ble_pq.c 18:51, all other src earlier. Only pitchiq_watch.dts is newer (20:58:51). I preprocessed the current dts with cpp and diffed it against the build's zephyr.dts.pre: the only difference is the string model = "PitchIQ watch rev D" (built: "rev C"). So the dts edit after the build is harmless; the compiled image is functionally the current source. (Image was built from the sources as of 20:57 only if no other file changed afterwards; power.c and pinctrl are older than the log.)
- Stale text only: dts compatible "pitchiq,watch-rev-c", pinctrl dtsi header "rev C", README title "rev C", power.c header "rev C".

### 6.3 Charger init (power.c:150-179) vs stock driver (npm13xx_charger.c:530-680)
Same registers and order as the stock driver for: NTCR_SEL, VTERM (4.2 V -> idx 8, formula checked against the driver's range 4.0 V idx 4 step 50 mV), VTERMR (4.0 V), ISET (74 mA after rounding: idx 37), ISET_DISCHG (415 = 1 A), ILIMSTARTUP (idx 1 = 100 mA, matches VBUSINILIM0 encoding where 5 = 500 mA, PS 6.1.8.2), trickle and iterm selects, IBAT_EN, TASK_AUTO, DIS_SET, VBATLOW_EN, EN_SET.
Additions beyond stock: NTCHOT = 45 C code 337 (stops charging above 45 C, power.c:129,162), DIETEMPSTOP 70 C / RESUME 60 C codes 410/422 (hand-checked, formula from the stock driver).
Missing steps / weaknesses:
- No disable before the ISET write (PS 6.2.3: "CHARGER must be disabled before changing the current setting"). On a cold boot the charger is already off; on an MCU-only reset with charging active the write happens with charging enabled. Same value, so low risk. Fix: write BCHGENABLECLR (CHGR 0x05) = 1 first in charger_lite_init. (Stock driver has the same gap.)
- No TASKCLEARCHGERR (CHGR 0x00) and no handling of CHG_ERROR events (see F3).
- Safe defaults: charging OFF at chip reset, so a bad image cannot start a charge by itself; 74 mA is 0.49 C of 150 mAh; VTERM 4.2 V; cold limit chip default (0 C), hot limit 45 C; trickle 10%. Nothing here is unsafe for a protected 150 mAh cell on paper. Battery temperature is not read (lite path) but the chip enforces the window itself.

### 6.4 BLE (CHECKED)
- Name "PitchIQ" + last two address bytes (ble_pq.c:393-402; prj.conf CONFIG_BT_DEVICE_NAME="PitchIQ"). Phone app filter: app/watch.js:335 in both repo copies accepts namePrefix "PitchIQ" and "Bangle" (so the README remark that the page needs editing is stale).
- Service UUID 7a1d0001-... advertised (ble_pq.c:164 BT_DATA_UUID128_ALL), RX 7a1d0002 / TX 7a1d0003 defined (:41-43); same UUIDs as watch.js:34.
- LESC only, MITM, bondable, 1 bond, accept list after bonding (prj.conf, ble_pq.c:132,146-156,242), BT_PRIVACY on. Function with a phone NOT CHECKED.

### 6.5 Leftovers
- No reference to removed hardware in code: grep for heart/ppg/max30101/boost/buck1/1v8/flash found only comments about their removal. "Bangle"/"Espruino": only comments naming the JS source file (ble_pq.c:5, core/ README and tests, gen_vectors.js:14 absolute path into the old repo). The pinctrl comment mentions P0.05 and P0.08 free. Harmless.

### 6.6 Recovery from a bad image
- Rollback only covers images flashed as "test" that never confirm (MCUboot swap-using-move, confirm after 15 s per README); mcumgr serial recovery is off (mcuboot.conf CONFIG_BOOT_SERIAL_UART=n). A bad image that boots, confirms, then misbehaves, or a corrupt bootloader, needs SWD.
- SWD path: five bottom pads (design.py:137-139, TP2-TP6, DNP test-point footprints = bare pads), SWDIO/SWDCLK/nRESET through 100R plus clamps, ground in the middle (reversed jig lands GND on GND), 3V0 pad is a 1 k reference, not a supply: the watch must be powered from USB or the cell during programming. With the unlocked default build APPROTECT is off; prod.conf locks it and then recovery is a full erase (nrfjprog --recover), as README says.
- A hung but running image can be power-cycled by a 10 s SHPHLD hold (dts long-press-reset); this does not restore a good image.

## 7. Power budget (docs/power_budget.md) arithmetic (CHECKED by hand)
- 0.07 mA standby on 150 mAh x 0.8 = 120 mAh gives 71 days, table says 75 days (+5%, the 0.07 is rounded from about 0.067); game 0.71 mA gives 7.0 days (table 7); idle 0.46 mA gives 10.9 days (11); night 2.16 mA gives 55.6 h (56 h); 3 h game + 21 h standby = 3.6 mAh/day (table 3.5), 34 days; night 7.9 mAh/day, 15 days; all-day connected 11.0 mAh/day, about 11 days. The 100 mAh and 250 mAh columns scale correctly. Charge: 150 mAh / 74 mA ~ 2 h; "1.5 h CC + 1 h taper" is plausible.
- Consistency with settings: 20 ms interval (prj.conf PERIPHERAL_PREF_MIN/MAX_INT 16 = 20 ms), +8 dBm (CONFIG_BT_CTLR_TX_PWR_PLUS_8, 15 mA matches), advertising 1.0-1.2 s (ble_pq.c:166 BT_GAP_ADV_SLOW_INT_MIN/MAX), 1 A discharge limit (dts), 74 mA charge, 500 mA only after a 1.5/3 A advertisement (power.c:267-274), 45 C limit (power.c:129). The "30 s then slow advertising" and the 3 uA R9 load: NOT CHECKED in firmware; R9 = 3 V / 1 M = 3 uA is arithmetic-correct.
- All current figures are estimates (labelled "estimate, not measured"); the header still says "rev C". Not measurable on paper: UNVERIFIED ASSUMPTION.
- Not in the budget: D3 TVS leakage on SHPHLD in ship mode; PESD5V0S1BA leakage at 4.2 V could be comparable to the 0.37 uA figure. MINOR.

## 8. Findings, classified

### CRITICAL DEFECT
- F1 (J1 entry direction / fold, section 2). Evidence: pcbnew J1 rot 0, pads y=29.15, body y>=29.8; design.py:94-100 claims "cable entry south". Self-declared gate design.py:97 not met. Fix: do the mock-up (hedge 1), then either keep as is (if the Hirose drawing shows leads at the rear, which would also make design.py:96 right) or rotate J1 180 degrees and un-reverse the nets (pad n = terminal n, pad 1 east, entry south). Update the comment in design.py to the real answer.

### MAJOR RISK
- F2 (cold start from USB with flat/absent cell on a 100 mA limit, no series element, 20 uF on VSYS). Evidence: section 3.4, PS 6.1.1 and DevZone reports in p1. Fix before order (cheap, optional): add DNP 0402 footprints for a 0R/10R in series between U2.20 and the VSYS load, and a DNP VBUS-VSYS bridge pad; keep C24 off; reduce C7/C8 if the test fails. Otherwise PHYSICAL-TEST P1.
- F3 (flat-cell charge can end in a latched trickle-timeout error; firmware never clears or retries). Evidence: PS tOUTTRICKLE 10 min, 7.4 mA trickle = 1.2 mAh; power.c has no TASKCLEARCHGERR or error handling; CHG_ERROR only calls battery_report (app_glue.c:280). Fix: on EVT_CHARGER read BCHGERRREASON (CHGR 0x36), write TASKCLEARCHGERR (0x00) and TASKRELEASEERR, re-enable charging at most N times with a log line; or raise ICHG during trickle is not possible (ITRICKLE fixed 10%), so accept a replug as the user action and show "charge error" on the LCD.
- F4 (D2 SMF5.0A is a 5.0 V stand-off clamp on a 5.0-5.5 V rail; its leakage is a standing load and its clamp is 9.2 V vs 22 V pin rating): this is MINOR for damage, flagged MAJOR only because a 9 V/12 V source would overload it; USB-C PD is never negotiated, so accept for prototypes. (Carried from p1 #6; no change in rev D.)

### MINOR
- F5 U2 EP via barrels open (4 x 0.2 mm), no fab note. Fix: resin-filled via-in-pad option or accept wicking.
- F6 Crystal: swap Y1 pad nets to remove the XL1/XL2 crossing and 2 vias.
- F7 C6 VBAT 10 uF vs Nordic 2.2 uF; C7/C8/C6 10 V parts at 5 V bias. Use 16/25 V parts.
- F8 No disable-before-ISET write and no error clear in charger_lite_init.
- F9 Haptics during USB with a low cell can brown out VSYS; gate it.
- F10 VBUS and VSYS-to-PVDD tracks 0.2 mm; p1 asked for 0.4 mm.
- F11 SW1 actuator direction (comp C2) unverified; CPL top-side rotations (comp M2) need JLC preview; fiducials none.
- F12 Stale "rev C" strings in dts compatible, dtsi, README, power_budget.md, power.c header.
- F13 D3 leakage vs ship-mode current.

### UNVERIFIED ASSUMPTION
- Unused BUCK1 left open with no L/C is acceptable (Nordic's one-buck figure uses BUCK1 as the used buck; figure images unreadable).
- PVSS1/PVSS2/AVSS shorted at the EP vs Nordic's net-tie layout.
- TDK L2 Isat > 350 mA; FH12A land pattern equals FH12; Raytac module pad numbers 20 and 27; Samsung DC-bias; 3.5 pF stray assumption for the 18 pF crystal loads.
- Whether LSIN grounded is correct (PS silent).

### PHYSICAL-TEST DEPENDENCY (order of first bring-up)
- P1 Bench supply 5 V, current-limited to 100 mA, no cell (JP1 open): VSYS, 3V0, MCU boot, scope VSYS and 3V0 on plug-in; repeat with USB-A-to-C and C-to-C chargers.
- P2 Dead or tripped-protector cell on USB-C to USB-C charger: does the internal Rd exist with a dead chip? If not, USB-A-to-C cable works (no sink Rd needed) and DNP external 5.1 k footprints would be the fix (not present in rev D).
- P3 Charge a deliberately tripped cell: BCHGVBATLOWCHARGE works, trickle timeout behaviour (F3), charge current 74 mA measured, termination 4.2 V, NTC window (heat and cool the cell).
- P4 J1: mock-up before boards; first power-up of the panel only after the continuity check (section 2.5).
- P5 32.768 kHz frequency, LCD EXTCOMIN 60 Hz, I2C 400 kHz scope.
- P6 RF: return loss / range with the LCD, USB-C shell and cell fitted (p1 M4).
- P7 Real current profile (standby, connected, game) vs power_budget.md; ship-mode current with D3 fitted.
- P8 Motor start current and VSYS droop on USB with a low cell.
- P9 USB-C gasket and cell fit (MECH_revD.md and the 1.6 mm J3/cell question).

## 9. What I did not do
I did not build, simulate, or run anything; did not read Hirose, Sharp, Raytac, Alps, TDK, Littelfuse drawings myself (Hirose fetch failed); did not re-verify the Raytac pad table; did not audit erc.py logic; did not read haptics.c, app_glue.c or ui.c in detail; the p1 reviews are cited where I relied on them (Sharp figure reading, PS table reading), and the PS text copy used is the third-party GitHub mirror named in p1_electrical_reference.md (v1.3, 22105 lines), not Nordic's own PDF.
