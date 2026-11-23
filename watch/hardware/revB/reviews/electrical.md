# Rev B electrical / schematic review

Scope: scripts/design.py against manufacturer documents, scripts/erc.py, rail and state analysis. Nothing built or measured. Reviewer ran only `python3 -I scripts/erc.py`, `scripts/design.py`, and read-only pcbnew pad dumps.

## Sources, and what could not be obtained

- nPM1300 reference schematic image (Figure 1, QFN): NOT obtainable. Every Nordic PDF and image URL returns Cloudflare 403 to curl; WebFetch returns text only. What I did get, and rely on below:
  - Reference BOM (Configuration 1) with no node mapping: https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/hw_layout/ref_circuitry/frontpage.html-qfn32
  - **Nordic Hardware Design Guidelines white paper nwp_050 (Aug 2025), section 3.2, capacitor table by node, and section 3.1 inductor rule**: https://cm.nordicsemi.com/-/media/Software-and-other-downloads/Product-Briefs/nwp_050.pdf
  - Older Objective Product Spec v0.7 text (pin notes, abs max, RSHPHLD = 50 kOhm to VBAT, NTC/CC/VSET/LSIN notes): https://devzone.nordicsemi.com/cfs-file/__key/communityserver-discussions-components-files/4/nPM1300_5F00_OPS_5F00_v0.7.pdf
  - Nordic staff replies on DevZone (threads 127900 "nPM1300 HARDWARE", 125132, 114518, 128233, 128419) and the Nordic FAQ blog (SHPHLD, VBUS, battery-less operation). Staff replies are not the specification; marked "staff" where used.
  - The nPM1300 product spec says the document has no unused-pin section; the white paper says the same ("does not cover unused pin handling").
- Raytac MDBT50Q-1MV2 spec Ver. K (pin table and reference circuits, pages 16-18, 43, 48): downloaded and read, https://cdn.sparkfun.com/assets/4/7/4/3/8/_nRF52840__MDBT50Q-1MV2___MDBT50Q-P1MV2_Ver.K_spec.pdf
- Sharp LS013B7DH03 spec LCP-1112045 (pin table, abs max, Fig 9-1 rendered and viewed).
- TI TPS61023 datasheet, ADI MAX30101 datasheet (WebFetch text), Nexperia PESD5V0S1BA product page, TDK MLP2012 series (Farnell copy), DFRobot FIT0774 (Core Electronics page).

---

## Findings

### 1. MAJOR: cold start from the cradle with no battery is an unproven nPM1300 state with a documented failure, and a possible 3V0 over-voltage kills the MCU and LCD

Defect. The programming path in the brief is: 5 V on the VBUS pad, JP1 open (no cell), nPM1300 makes 3V0, MCU is flashed over SWD. In that state:
- VBAT is floating (10 uF only). Nordic documents battery-less operation as VBAT *tied to GND* (about 2.5 mA quiescent): FAQ https://devzone.nordicsemi.com/nordic/nordic-blog/b/blog/posts/frequently-asked-questions-for-the-npm1300-and-npm1304. Rev B floats it.
- Both bucks are enabled at power-up by the VSET straps (R1 47 k, R2 150 k), with about 40 uF nominal on VSYS plus two buck outputs, from a VBUS input limiter that starts at 100 mA (95 mA max, vbusin el_spec Table 1).
- DevZone thread 128233 (unanswered) reports exactly this class: VBUS 5 V, both VSET resistors fitted, VSYS stuck at about 2.5 V so the bucks never start; with VSET1 grounded it worked. https://devzone.nordicsemi.com/f/nordic-q-a/128233/npm1300-vsys-drops-to-2-5v-on-startup-unless-vbus-and-vsys-are-momentarily-shorted/566933
- DevZone thread 128419 (unanswered): custom board, standalone (no MCU) with 300 k on VSET2, BUCK2 measured near 4.2 to 4.45 V with USB connected (datasheets.md section 1.6 already cites it). Rev B uses 150 k, not 300 k, so this is not proof, but nobody has explained it. If 3V0 ever reaches 4.2 V: nRF52840 VDD abs max is 3.9 V, Sharp VDD abs max 3.6 V (Table 5), LIS2DH12 abs max 4.8 V.
Nothing on the board limits 3V0 (it is also a solid plane on In4), and the nPM1300 reference application was never reproduced.

Fix (cheap, all optional-footprint level):
1. Bring-up order: build and power U2 with its passives only (U1, J1, U3 are hand or consigned anyway). Bench VBUS 5 V current-limited at 100 mA, cell attached and JP1 bridged, then also with no cell. Confirm 3V0 = 3.0 V +/-5 % and 1V8 with no load before fitting U1 and J1. Write this into the bring-up doc.
2. Make R1 a 0R/47k choice: VSET1 below 100 Ohm leaves BUCK1 disabled at start-up (Nordic buck page, datasheets.md 1.4, 1.6). The firmware already enables BUCK1 over TWI (regulator-boot-off in pitchiq_watch.dts, BUCK1 is switched on before heart-rate use), so the 1.8 V rail does not need to be on at boot, and the cold-start load drops. Check in the PS that BUCKnENASET works with VSET grounded (datasheets.md 1.6 says the registers override the default state).
3. Program with a cell attached whenever possible.

### 2. MAJOR: firmware sets the discharge limit to 200 mA; the project's own budget says worst case is 150-240 mA

Evidence: firmware/boards/pitchiq/pitchiq_watch/pitchiq_watch.dts:173 `dischg-limit-microamp = <200000>`; docs/power_budget.md:17 (motor start 100-150 mA + radio + boost pulse = 150-240 mA worst case, "only if the firmware avoids buzzing during a heart-rate LED pulse train or raises the limit"). Nordic: IBATLIMLOW 200 mA, IBATLIMHIGH 1 A; when exceeded "VSYS falls below VSYSPOF and the device resets" (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/charger.html-discharge_current_limit, datasheets.md 1.10). The limit is also not accurate. A reset during the pitch-call buzz is the product's main function failing.
Fix: set the high limit (1 A; the Adafruit 1317 cell has its own protection circuit) in the DT and in the `DISCHG_LIMIT` macro (power.c), or serialize motor and heart-rate LED. Confirm the cell's pulse discharge rating (150 mAh = 1 C is 150 mA continuous).

### 3. MAJOR: cradle pad order is mirror-symmetric, so a cradle placed 180 degrees puts 5 V on nRESET

Evidence: scripts/gen_pcb.py:39: TP1..TP5 at x = 8, 12, 16, 20, 24 on a 32 mm wide board (centre x = 16), order VBUS, GND, SWDIO, SWDCLK, nRESET. A 180 degree rotation of a symmetric 5-pin pogo block maps VBUS to nRESET (nRF52840 P0.18, abs max VDD + 0.3 V) and GND to SWDCLK. Nothing is in series and only VBUS has a clamp. The brief names no mechanical key.
Fix: put VBUS on the centre pad (maps to itself under rotation) and arrange the other four so that the rotated mapping only swaps signal with signal or GND with a signal (e.g. nRESET, SWDCLK, VBUS, SWDIO, GND is not symmetric-safe by itself; the rule is: no pad pair (i, 6-i) may contain VBUS and a logic pad). Add a mechanical key or magnet polarity on the cradle as the real protection, and see finding 5.

### 4. MAJOR: no target-voltage (VTref) pad on the cradle

Evidence: the five pads are VBUS, GND, SWDIO, SWDCLK, nRESET (design.py:128). 3V0 is only on TP6, a 1.5 mm DNP test pad. SEGGER J-Link and the Nordic DK on-board debugger refuse to talk without target voltage on VTref. A probe with a fixed 3.3 V output into a 3.0 V part sits at nRF52840 abs max (VDD + 0.3 V = 3.3 V) with no tolerance; a +5 % probe is over it.
Fix: add 3V0 as a sixth cradle pad (promote TP6) or state the programmer is a CMSIS-DAP type with adjustable or tolerant I/O, and limit it to 3.0 V. Also add a 100 Ohm series resistor on SWDCLK and SWDIO at the module.

### 5. MAJOR: SWDIO, SWDCLK and nRESET pads face the wrist with no ESD clamp or series resistance

Evidence: design.py:128, 130; nets SWDIO, SWDCLK, NRESET have only {U1 pad, TP pad, (R16)}; the only ESD parts are D2 (VBUS) and D3 (BTN). Bottom-face gold pads touch skin and sweat. P0.18 (nRESET) directly on a skin-contact pad is the ESD entry into the MCU.
Fix: low-capacitance ESD array on the three signal pads (DNP-able footprint), 100 Ohm series on SWDIO and SWDCLK, and keep the 10 k on nRESET plus a 100 Ohm to the pad. Add a sweat note: VBUS pad is 5 V when docked, floating otherwise (fine), but pad spacing 4 mm gives a conductive-sweat path from 5 V to nRESET when docked.

### 6. MINOR (free fix): nRF52840 VBUS (module pad 32) is left open

Evidence: design.py:30. Raytac's own "USB Disabled" reference (spec page 48, rendered and read) ties VBUS to GND with D+/D- left NC. Nordic staff: "Grounding the VBUS pin is recommended when not using the USB interface" https://devzone.nordicsemi.com/f/nordic-q-a/84395/please-confirm-treatment-of-vbus-on-the-nrf52840-if-vddh-is-used. A floating pin beside RF and skin contact can trip the USB detect logic.
Fix: connect module pad 32 to GND; change the type to `pi` or `pas`. VDDH/VDD tied to 3V0, DCCH open, D+/D- open all match Raytac pages 43 and 48 and are correct.

### 7. MINOR: nPM1300 LSOUT1 (29) and LSOUT2 (31) are left open while LSIN1/LSIN2 go to GND

Evidence: design.py:54. Nordic staff (DevZone 127900): "VINLDO1/VINLDO2: tie to GND if unused. VOUTLDOx: tie to GND if unused." Nordic's OPS v0.7: LSIN must be at or below VSYS and the chip supplied before voltage is applied to the load-switch input (grounding LSIN is consistent). Not in the spec text itself, so staff-level evidence. Grounding costs nothing (load switch default OFF, datasheets.md 1.6).
Fix: tie pins 29 and 31 to GND. Unused LED0-2 and GPIO0/2/3/4 open is consistent with the pin descriptions (GPIO default input with weak pull-down, 500 kOhm; LED pins are sink outputs). No Nordic text contradicts it.

### 8. MINOR: nPM1300 decoupling versus Nordic's node table

Nordic white paper section 3.2: VBUS 1 uF ("follow USB limits"), VBUSOUT 1 uF always, VBAT 2.2 uF, VSYS 10 uF (>= 4 uF effective, same net as PVDD), per-buck PVDD 4 uF effective, outputs 4 to 20 uF effective, min 6.3 V rating, "add 10 nF to 100 nF in parallel on PVDD/VSYS for RF-sensitive designs".
Rev B: C12 VBUS 10 uF 25 V (above the 1 uF figure; a USB source expects at most about 10 uF at attach, so a probe's 5 V sees the whole 10 uF), C5 VBUSOUT 10 uF, C6 VBAT 10 uF, C7+C8 VSYS 20 uF, C9/C10 10 uF, C11 1 uF VDDIO. Every Nordic minimum is met, and the 10 V X5R 0603 parts (Samsung CL10A106KP8NNNC) still clear 4 uF effective at 4-5 V only if the DC-bias curve is checked (they typically lose 50 to 70 % at 5 V). The 20 uF effective upper limit on VOUTn is met.
Fix: add 100 nF (0402) at PVDD/VSYS (RF-sensitive: BLE module on the same board); consider 4.7 uF on VBUS; confirm effective capacitance from the Samsung DC-bias tool.

### 9. MINOR: inductors have no published saturation current

Nordic white paper 3.1: 2.2 uH +/-20 %, saturation current above 400 mA. TDK MLP2012H2R2MT0S1 and MLP2012H1R0MT0S1: rated current is "current assumed when temperature has risen to 40 C max" (1000 mA and 1100 mA), DCR max 0.15 and 0.12 Ohm, no Isat given (Farnell copy https://www.farnell.com/datasheets/2041193.pdf). Multilayer ferrite parts usually roll off near the rated current. For L3 on the boost, TPS61023's switch limit is 2.7 A min, 3.7 A typ and its Table 8-2 inductors are 7 to 9.6 A Isat; a start-up into about 40 uF nominal on 5V_LED can hit that limit and saturate the part. DCR 0.15 Ohm also costs boost efficiency.
Fix: use a part with published Isat for L1/L2 (>= 600 mA) and L3 (>= 1.5 A); or accept and measure ripple and start-up current on the first board.

### 10. MINOR: motor runs from VSYS; firmware comment and motor range disagree

Evidence: design.py:120 M1+ on VSYS; pitchiq_watch.dts:34 says the motor is driven "from the 3.0 V rail". FIT0774: rated 3 V, 50 mA, operating range 1.5 to 4.2 V (https://core-electronics.com.au/mini-vibration-motor-10-2-7mm.html.plain.md, start current not listed). VSYS is 3.1 to 4.2 V on battery and up to about 5.2 V docked (RON VBUS-VSYS 300 mOhm; VBUS up to 5.5 V OVP). 100 % duty at 4.2 V is at the end of the motor range; docked it exceeds it.
Fix: scale PWM duty to about 3.0 V / VSYS (read VSYS from the PMIC ADC) or cap the duty when VBUS is present; correct the DT comment.

### 11. MINOR: frontlight current cannot work from the 3.0 V rail as built

Evidence: R13 47 Ohm from 3V0 (design.py:115); Azumo FLEx datasheet LED: IF 5 mA typ, 25 mA abs max, Vf plot about 3 V at 10 mA (datasheets.md 5.3); module spec 6-75 mW at 3.0 V. 3.0 V minus Vf minus Vds leaves 0 to 0.1 V, so a few mA at best, and strongly Vf- and temperature-dependent. Disclosed as unknown Vf; adding the supply-headroom evidence.
Fix: feed J2 anode from VSYS through a current limit sized for the highest VSYS (5.2 V docked) or use a constant-current sink (nPM1300 LED drivers sink 5 mA and need an anode rail that forward-biases them; OPS v0.7).

### 12. MINOR: I2C 4.7 k at 400 kHz with three devices and a bottom-side sensor

Zephyr sets I2C_BITRATE_FAST (pitchiq_watch.dts). Rise time 0.85 x R x C exceeds 300 ns above about 74 pF with 4.7 k. Bus length is 32 mm across layers plus three pads and a second-layer MAX30101 via.
Fix: 2.2 k to 3.3 k pull-ups (sink 3 mA limit: 3.0 V / 1.5 mA at 2 k, fine; MAX30101 VOL 0.4 V at 3 mA and VIL max 0.54 V, LIS2DH12 VIL 0.6 V). Add I2C test points (finding 16).

### 13. MINOR: strap and reset-state details

- R11 (3V0 to EXTMODE) and R12 (EXTMODE to GND) are both 0R: fitting both shorts 3V0 to GND. design.py:112-113. Use a 3-pad solder jumper or a single 0R footprint with a pad to each rail.
- LCD_EXTCOMIN, LCD_SCK and LCD_MOSI have no pull-down; with the MCU in reset EXTCOMIN floats, so DC can build on the LC. Sharp Table 6-3 requires EXTCOMIN toggling at 54-65 Hz when EXTMODE is high. Add 100 k to GND on EXTCOMIN (SCS and DISP already have one).
- Sharp Table 5: input high max is VDD. The LCD never sees a voltage above its own VDD because it shares 3V0 with the MCU: correct, but note it if the LCD is ever moved to a switched rail.

### 14. MINOR: no hard-reset path before firmware has configured the PMIC

The long-press reset (`long-press-reset = "one-button"`, pitchiq_watch.dts:133) is written over TWI each boot; the nPM1300 has no non-volatile memory (Nordic staff, DevZone 125132). A firmware that hangs before `power_init()` has no hardware reset except nRESET via the cradle, and that works only after the UICR gpio-as-nreset is written (DT `&uicr { gpio-as-nreset; }`) by the first flash.
Fix (optional): route nPM1300 GPIO0 to NRESET as open-drain (Nordic's reference application uses GPIO0 as a reset output, datasheets.md 1.9), or accept SWD recovery via the cradle on every first unit.

### 15. MINOR: battery temperature sensing does not sense the battery

RT1 (NCP15XH103F03RC, 10 k, B 3380) is placed on the board at (29.8, 27.6) beside the charger, not on the cell; the Adafruit 1317 cell has two leads and no thermistor. The charger's temperature windows therefore track board and PMIC heating, not the cell. With a 75 mA charge into a 150 mAh protected cell the risk is low but the NTC shows the wrong thing. NTC 10 k, B 3380 and ADCNTCRSEL match what the firmware writes (power.c, thermistor-ohms 10000). Nordic: the NTC must be "thermally coupled to the battery pack".
Fix: bring the NTC out to two pads for a thermistor taped to the cell, or document that cell temperature is not monitored and tell the charger NTC is board temperature.

### 16. MINOR: missing test points

None on I2C SDA/SCL, VBAT/BATP (JP1 can serve as an ammeter point, no probe pad), PMIC_INT, SW1/SW2, VBUSOUT, LCD_EXTCOMIN. Add DNP 1 mm pads for SDA, SCL, VBAT, PMIC_INT at least.

### 17. MINOR (process): the scripted ERC proves the netlist matches design.py and little else

erc.py, 51 lines. It is circular: the pin types it checks are declared in design.py by the author, so a wrong type is accepted; the one cross-check against hardware is the 11-entry LIMIT table. Classes of error it cannot catch, with evidence from this review:
1. Wrong or missing connections that a datasheet requires: VBUS open (finding 6) and LSOUT open (7) pass because `nc` pins are accepted as unconnected, and nothing says which pins must be tied.
2. DNP: it treats DNP parts as fitted (R12 and R11 both present = 3V0 to GND short; TP1 is DNP yet is the only `po` source for net VBUS, so the "supply with no source" rule is satisfied by a part that is not on the board).
3. Rail and voltage-domain checks other than the supply pins in LIMIT: the 3.0 V I2C and INT pull-ups into a 1.8 V part are never examined (they are in fact acceptable, see below, but the tool does not know that).
4. Sequencing and power states (cable without battery, ship mode, probe-powered, back-feed through ESD diodes).
5. Values: VSET resistor table, divider ratio, crystal load, capacitor voltage and bias, inductor Isat, RC times.
6. Orientation: diode, connector pin 1 and contact side, TVS, battery polarity, footprint pad numbering versus the package (check_pcb.py compares only pad net names to design.py).
7. "Decoupling present" is satisfied by any capacitor on the net, anywhere.
8. A resistor pull-up to any `POWER` net counts (an I2C pull-up to 5V_LED would pass).
9. Inductor pin 2 is declared `po` so the buck rails always have a "source", whatever the PMIC pin is.
10. It does not check pins against two-pin passives with both ends on one net, and does not read the PCB.
Not wrong, just not electrical review: I found no incorrect pin type in design.py (all U2, U1, U3, U4, U5, J1, Q1/Q2, D1-D3, TP1-TP5 types are consistent with their datasheets). Still required before ordering: KiCad's own ERC in the GUI (already disclosed) and a second person re-deriving every pin from the datasheets (this review did that for U1, U2, U3, U4, U5, J1, Q1, Q2).

---

## Questions asked in the task, answered

TPS61023 with 5 V charger present (VSYS up to 5.5 V). VIN may exceed the 4.95 V setpoint. TI section 7.3.5: when VOUT reaches 101 % of the target the converter stops switching and fully turns on the high-side PMOS (pass-through), VOUT = VIN minus inductor DCR and RDS(on) drop; switching resumes below 97 %. No damage: abs max VIN and VOUT are 7 V. 5V_LED then follows VSYS, about 5.2 V docked (VBUS-VSYS RON 0.3 Ohm, VBUS OVP 5.5 V). MAX30101 abs max VLED+ 6.0 V; green LED range 4.5-5.5 V, red/IR 3.1-5.0 V (firmware uses green only: led-slot 3). Acceptable. Boost OVP 5.5-6.0 V does not trip below VSYS 5.5 V.

MAX30101 I2C pull-ups to 3.0 V with the part at 1.8 V or unpowered. Acceptable. Datasheet: "The interrupt and I2C pins can be pulled up to an external voltage even when the power supplies are not powered up"; all non-supply pins -0.3 to +6.0 V; VIH 0.7 x VDD = 1.26 V. INT is open drain with R5 100 k to 3V0, within the same statement. No finding.

MAX30101 sequencing. Datasheet recommends VDD first, tolerant on power-down. Rev B: BUCK1 is on at boot (strap), firmware turns it off, BOOST_EN has R8 to GND. Firmware must raise BUCK1 before BOOST_EN; hardware has no interlock (acceptable for the first spin).

TPS61023 EN from a 3.0 V GPIO. VIH 1.2 V, VIL 0.42 V typ: fine. FB 732 k / 100 k with VREF 0.595 V (0.580-0.610): 4.95 V nominal, 4.83-5.07 V worst case, above the 4.5 V green minimum. R2 100 k is below TI's 300 k limit.

Button on SHPHLD at battery voltage. SHPHLD has an internal 50 kOhm pull-up to VBAT (OPS v0.7 Table 30; FAQ). Button to GND is the documented exit circuit; Nordic says do not connect SHPHLD to an MCU GPIO (leakage in ship mode): Rev B does not. D3 (PESD5V0S1BA) has IRM 5 nA per Nexperia, so ship mode is not hurt. At 4.2 V a press draws 84 uA. Fine.

---

## Checked and found correct

- nPM1300 QFN32, all 33 pads: pin numbers and names in design.py:48-55 equal Nordic's QFN32 table (datasheets.md 1.1 and OPS v0.7): VOUT1 1, PVSS1 2, SW1 3, PVDD 4, SW2 5, PVSS2 6, GPIO0-4 7-11, VDDIO 12, SDA 13, SCL 14, SHPHLD 15, VSET2 16, VSET1 17, NTC 18, VBAT 19, VSYS 20, VBUS 21, VBUSOUT 22, CC1/CC2 23/24, LED0-2 25-27, LSIN1 28, LSOUT1 29, LSIN2 30, LSOUT2 31, VOUT2 32, AVSS pad 33. KiCad U2 pads read via pcbnew match; the nine unnumbered pads are paste apertures only.
- VSET: resistors to GND (Nordic tooltip on the reference page; OPS v0.7 "through a resistor to GND"), 47 k gives BUCK1 1.8 V and 150 k gives BUCK2 3.0 V (table), 1 % parts against the 5 % maximum, never floating. PVDD on VSYS, VDDIO on 3V0 (Nordic recommends a buck output), CC1/CC2 to GND (Nordic: floating or ground), NTC 10 k to GND, SDA/SCL pull-ups to VDDIO.
- Buck inductors 2.2 uH, DCR 0.15 Ohm against Nordic's < 400 mOhm.
- MAX30101: pins 1-14 as in the datasheet; VLED+ pins 9 and 10 on 5V_LED, VDD on 1V8, PGND and GND on ground, N.C. pads left open; bypass at least 1 uF on VLED+ and VDD; INT pull-up present.
- LIS2DH12: CS tied to Vdd_IO (I2C), SA0 high gives 0x19, RES to GND, GND pins 6-8, INT2 open, Vdd and Vdd_IO both on 3V0. No address clash (0x19, 0x57, 0x6B).
- TPS61023 DRL pinout (1 FB, 2 EN, 3 VIN, 4 GND, 5 SW, 6 VOUT), 1 uH inside 0.37-2.9 uH, output capacitance above 4 uF effective, input 10 uF.
- Sharp FPC pin order (1 SCLK ... 10 VSSA), EXTMODE high (Remark 4-1), SCS active high with 100 k pull-down, DISP 100 k pull-down, C1/C2/C3 equal Fig 9-1 (0.1 uF DISP, 0.1 uF VDDA, 1 uF VDD), VDD 3.0 V inside 2.7-3.3 V.
- AO3400A: pin 1 G, 2 S, 3 D, 3.0 V gate drive, 100 k gate pull-downs, D1 flyback orientation (K to VSYS, A to MOTOR_N).
- Crystal: FC-135 12.5 pF with 2 x 18 pF: C = 9 pF in series plus about 3.5 pF stray gives 12.5 pF (assumes about 4 pF pin plus about 2 pF board, confirm Epson CL on the fitted part).
- nRF52840 module: VDD 28 and VDDH 30 both on 3V0, DCCH 31 open, GND pads 1, 2, 15, 33, 55; XL1/XL2 pads 17/18; SWDIO 51, SWDCLK 53, P0.18/nRESET 40; all used GPIO pad numbers match the Raytac pin table (Raytac pp. 16-18). Reset 10 k pull-up fine.
- ESD: D2 on VBUS (bidirectional 5 V, VCL 14 V, below the 22 V VBUS abs max), D3 on BTN. 25 V capacitor on VBUS.
- Abs max in the states checked: cable without battery (VSYS at most 5.5 V, boost pass-through acceptable), battery without cable (VBUS pad floats, no back-feed path), ship mode (BTN node at VBAT, nothing else powered), VBAT at most 4.45 V (Nordic requires below 4.65 V). Exceptions are findings 1, 3, 4, 5, 10.
- Missing nets considered and not needed: charger status (nPM1300 status register and GPIO1 interrupt), battery sense (nPM1300 ADC), a reverse-battery clamp (cell has its own protection circuit; the pads are silk-marked + and -; reversing the leads still puts -4 V on VBAT, abs min -0.3 V: take care on assembly).
