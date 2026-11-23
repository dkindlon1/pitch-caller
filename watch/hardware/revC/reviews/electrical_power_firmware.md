# PitchIQ watch rev C: electrical, power and firmware review

Reviewer: independent (electrical + power + firmware). Date of reading: 2026-11-23. Read-only: only this file was written.
Nothing has been built, so every statement below is "consistent on paper" or "compiles", never "works".

Tags: CHECKED (file:line or arithmetic), FROM SOURCE (taken from the named file, not independently verified), ESTIMATE, NOT CHECKED (why).

Sources read: hardware/revC/scripts/design.py, erc.py, gen_pcb.py (TP coordinates only), power_budget.py, out/check_output.txt, research/datasheets.md, usbc_motor.md, docs/power_budget.md; revB reviews (electrical, power, firmware, second_round); firmware app (prj.conf, prod.conf, power.c, haptics.c, main.c, app_glue.c, ble_pq.c, ui.c, i2c_util.c, boards conf), the board dts and pinctrl, firmware/README.md, build_logs/boss_revC_*.log; Zephyr v4.4.2 npm13xx charger driver and gap.h; Raytac MDBT50Q spec text extracted at /tmp/rv_dl/raytac/m.txt (the module pin table is NOT in research/datasheets.md, which is a rev B file with no Raytac section).

Counts: BLOCKER 0, MAJOR 3, MINOR 13.

---------------------------------------------------------------------------
## BLOCKER

None found. (Caveat: three open facts below could turn into blockers on the first bench test; see MAJOR 1 and the "not checked" list.)

---------------------------------------------------------------------------
## MAJOR

### MAJOR 1: charging depends on the nPM1300 presenting a valid Rd on CC1/CC2, including with a dead battery, and that is not sourced
Evidence:
- CHECKED: design.py:54 comment says "the chip has its own 5.1 k pull-downs (Rd) on CC1/CC2"; design.py:116 wires J3 A5/B5 straight to U2.23/U2.24 (CC1/CC2) and nothing else is on those nets (no external Rd, no ESD part).
- CHECKED: datasheets.md:149 states "Internal pull-downs Rd = 5.1 kOhm on CC1/CC2" with a Nordic URL; but usbc_motor.md:80 says the same Nordic page "does not print the value; you stated 5.1 kOhm". So 5.1 k is the user's statement, not a read datasheet value.
- Dead battery: NOT FOUND in datasheets.md or usbc_motor.md (searched "dead battery", "Rd"). Nothing says whether the pull-downs are always connected (a plain resistor, as USB Type-C requires of a sink with a dead battery) or switched by a supply that does not exist when VBAT is 0 V and VBUS is not yet applied. A compliant source (every USB-C to USB-C PD charger) only drives VBUS after it sees Rd, so if Rd is absent in that state the watch never charges from a C-to-C cable.
- FROM SOURCE (usbc_motor.md:82): behaviour with both CC pins connected is "not specifically documented".
Fix: before ordering boards, test on a Nordic nPM1300-EK (or the first U2-only bring-up board) with the cell removed (JP1 open is already the plan) and a flat cell, using a USB-C PD charger and a C-to-C cable, and record VBUS at J3. If Rd is missing: fit 5.1 k 1 % (0402) from CC1 and CC2 to GND (footprints can be added now as DNP; do NOT fit them if the internal Rd is present, because the parallel 2.55 k is outside the Rd range).

### MAJOR 2: SWD pad row is 180-degree symmetric and the 3V0 pad is wired straight to the rail (rev B NEW-1 fix (c) never applied)
Evidence:
- CHECKED: design.py:122 and gen_pcb.py:45 put the five pads in one line at y = 19.4, 22.0, 24.6, 27.2, 29.8 = GND, nRESET, SWDCLK, SWDIO, 3V0.
- Arithmetic: a jig rotated 180 degrees maps GND to 3V0, nRESET to SWDIO, SWDCLK to SWDCLK. The jig's GND pin then lands on the 3V0 pad and ties the BUCK2 rail to the probe ground (and to the PC's USB ground), while the board GND pad meets the jig's VTref pin.
- CHECKED: TP6 (3V0) is on net 3V0 with no series element and no clamp (design.py:125, :134 area; R17-R19 and D4-D6 protect only SWDIO, SWDCLK, nRESET, design.py:128-132). The three logic pads do have 100R plus a TVS (CHECKED design.py:128-132); the fix that rev B second_round.md NEW-1 asked for on the VTref pad is missing.
- NOT CHECKED: whether BUCK2 survives a hard short (short-circuit behaviour is not in datasheets.md).
Fix: (a) key the pogo jig mechanically (one extra pad position or an offset locating pin), AND (b) put 1 k in series with TP6 (VTref is a high-impedance input, so 1 k costs nothing) with a 5 V TVS at the pad, OR reorder the row so the end pads cannot be GND and 3V0 (for example GND, nRESET, SWDCLK, SWDIO, 3V0 becomes nRESET, SWDCLK, GND, SWDIO, 3V0, which is not symmetric).

### MAJOR 3: power budget uses advertising and connection assumptions that contradict the firmware; the typical-day figure is optimistic
Evidence:
- CHECKED (arithmetic, script constants re-run): the 3-hour game plus 21 hours standby gives 3.53 mAh/day and 34 days on 150 mAh at 80 % usable, matching docs/power_budget.md. Game profile 0.711 mA, standby profile 0.0667 mA (the doc rounds to 0.07).
- Contradiction 1 (advertising): power_budget.py:28 models ADV_1S, "uA at 1 s interval" (22.7 uA at 3.0 V). CHECKED: ble_pq.c:159 starts advertising at BT_GAP_ADV_FAST_INT_MIN_2 / MAX_2, which are 0x00a0 / 0x00f0 (100 ms / 150 ms) in gap.h:62,64, and there is no slow-advertising fallback in ble_pq.c:138-167. Using the script's own per-event charge at about 125 ms: 22.7 x 8 = 182 uA at 3.0 V, standby 0.220 mA at the cell, day = 6.75 mAh, 17.8 days (ESTIMATE, script constants).
- Contradiction 2 (connection interval): the profile "relaxed link, 100 ms" is not reachable. CHECKED: prj.conf:384-386 and ble_pq.c:218 request 16 units = 20 ms min and max, latency 0, and nothing relaxes it. Also the "standby" profile assumes the phone is absent; with a paired phone connected all day the link runs at 20 ms. Script constants: idle connected at 20 ms = 0.457 mA, 24 h = 11.0 mAh/day, about 10.9 days (ESTIMATE).
- TX power +8 dBm: CHECKED prj.conf:391 and the built .config (BT_CTLR_TX_PWR_PLUS_8=y); the script uses 14.8 mA "est from memory" (power_budget.py:11), consistent with the setting but not a read value.
- LCD refresh: the script charges one 1 Hz-class redraw per call (50 per hour, power_budget.py:35). NOT CHECKED whether the screen is redrawn on every 1 s tick (app_glue.c:190-196 runs pq_core_tick each tick; I did not trace which ticks call ui refresh).
- CHECKED: R9 1 M standing load (3 uA at 3.0 V) is included (power_budget.py:21).
Fix: change ADV to the firmware's interval (or change the firmware to a slow interval when no phone is expected), model the connected-idle case at 20 ms as the default day, rerun, and either relax the connection interval in firmware after idle or state the real days between charges.

---------------------------------------------------------------------------
## MINOR

1. VBUS input capacitance. CHECKED design.py:66: C12 is 10 uF nominal (CL21A106KAYNNNE, K = +-10 %), so up to 11 uF nominal at zero bias; effective value at 5 V is lower (ESTIMATE, X5R 0805 derating). The USB limit of 10 uF at attach is therefore met only after bias derating, not on the label. CHECKED design.py:63: C5 is another 10 uF on VBUSOUT; NOT FOUND in datasheets.md whether VBUSOUT is hard-connected to VBUS (datasheets.md:48 only says "VBUS output for host"); if it is, the VBUS-side total is about 20 uF nominal. Fix: confirm VBUSOUT topology; drop C5 or C12 to 4.7 uF if VBUSOUT is a pass-through. The USB 10 uF figure itself comes from the user's brief, not from a repo file.
2. VBUS TVS D2 SMF5.0A (design.py:70). CHECKED: cathode to VBUS, anode to GND (correct polarity). FROM SOURCE usbc_motor.md:84: Vrwm 5 V, Vbr 6.4 V, Vc 9.2 V; the clamp is under the nPM1300 VBUS abs max of 22 V (datasheets.md:146), so a surge clamps within the chip's rating. But a compliant 5 V source can sit at 5.25-5.5 V, above the 5.0 V standoff: leakage there is NOT CHECKED (not in the repo); same open item as rev B NEW-6. No series fuse (usbc_motor.md:86 "decision for the user"), so an over-voltage adapter shorts the TVS and the TVS then dissipates the charger's power. Fix: read SMF5.0A leakage at 5.5 V, consider a 6 V standoff part (clamp stays far below 22 V), and decide on a 0402/0603 fuse.
3. No ESD part on CC1/CC2 and no wet-port policy. CHECKED design.py:116 (CC pads go directly to U2); usbc_motor.md:85 calls CC ESD optional. usbc_motor.md:91 proposes firmware handling of "VBUS present with no valid CC attach"; CHECKED power.c:262-275 only leaves the 100 mA limit in that case and keeps charging. Cables with VCONN put up to 5.5 V on the unused CC pin; CHECKED datasheets.md:146 CC abs max is 5.5 V, so that is at the edge, not over it.
4. "Lite" charger vs the stock driver. The stock driver is compiled out (build .config: NPM13XX_CHARGER is not set; power.c:7-14), so power.c is what ships. CHECKED consistent with the stock npm13xx_charger.c: register bases and offsets (0x03 / 0x05 / 0x02 and the offsets at power.c:88-113 versus driver lines 48-86), VBUS limit index (linear range 100 mA at index 1, step 100 mA, so ua/100000 gives 1 for 100 mA and 5 for 500 mA, driver line 161), current index 16 + (ua-32000)/2000 written as idx/2, idx&1 (driver lines 149, 594-602; 75 mA rounds to 74 mA), term index ranges (driver line 144), discharge values 84/415 (driver line 158), USB-C detect register 0x05 and mask 0x0A (driver lines 85, 125, 434), VBUS-present bit 0x01 (driver line 130). Differences, none of which compiled code can reveal as wrong: (a) no CHGR error-clear write before enabling (stock driver clears errors before enable, line 515-ish); (b) ISET is written without disabling the charger first although datasheets.md:122 says it must be disabled; harmless on a cold start, but after a watchdog or fatal reboot while charging the new value may be ignored; add a write to CHGR_EN_CLR (offset 0x05) before the ISET writes; (c) only NTCHOT is written (power.c:161); cold, cool and warm stay at chip defaults that datasheets.md does not list (NOT CHECKED, so the comment at power.c:127 "0 C cold limit is already the chip default" is FROM SOURCE only); (d) a source advertising default USB power leaves the limit at 100 mA, while the stock driver would report 500 mA (driver lines 434-438); this is conservative and works against the 74 mA charge on paper; (e) BCHGVBATLOWCHARGE is never written (see 5). The stock path "has NOT been compiled" (power.c:13).
5. Flat-cell recovery claim is unproven. dts:134-136 and power.c:12-14 say a flat battery recovers because VBUS powers VSYS. CHECKED datasheets.md:161: below 2.1 V VBAT the charger does not charge unless BCHGVBATLOWCHARGE is set; neither power.c nor the dts (no vbatlow-charge-enable) sets it. Same open item as rev B power.md finding 4 (cell protection thresholds unknown). Fix: bench-test with a deliberately over-discharged cell; decide on trickle-charging a sub-2.1 V cell (safety call).
6. Motor drive. CHECKED design.py:105-110: M1 + to VSYS, M1 - to MOTOR_N; Q1 AO3400A G=VIB, S=GND, D=MOTOR_N; D1 K=VSYS, A=MOTOR_N (flyback orientation correct, cathode to supply side); R15 100k gate pull-down; C24 10 uF at VSYS. There is NO series gate resistor (ESTIMATE: low risk at 20 kHz, but 100 R is free). Firmware cap: CHECKED haptics.c:31,54-56: duty = 3000 / VSYS in permille; at 5.0 V (VBUS present) 60 %, at 4.2 V 71 %, so the average is 3.0 V against a 2.7-4.0 V rating (FROM SOURCE usbc_motor.md:108). The PWM peak is still VSYS (up to about 5 V, ESTIMATE of average vs rating for a 20 kHz drive). Weakness: power_vsys_mv_estimate() (power.c:287-295) uses the last VBAT sample (60 s) or last VBUS flag; a plug-in followed by a buzz before the next sample uses the battery figure, for example 3.7 V gives 81 %, 4.05 V effective at 5 V, 1 % over. Fix: refresh power_sample on the VBUS_DETECTED event before haptics, or cap at 60 % whenever the last sample is older than 5 s. D1 1N4148WS 150 mA class is adequate for 35 mA rating (ESTIMATE; start current not published, usbc_motor.md:129).
7. Frontlight cannot be driven as built (rev B electrical.md finding 11, still open). CHECKED design.py:100: R13 47 R from 3V0 to FL_A; FROM SOURCE datasheets.md:352 Vf about 3.0 V at 10 mA, so there is no headroom on a 3.0 V rail. Optional footprint, but the budget (power_budget.py:24, 5 mA) assumes it works.
8. Rev B MINORs still open: I2C pull-ups 4.7 k at 400 kHz (design.py:80; dts:82 I2C_BITRATE_FAST; rev B electrical.md 12; only two devices now, so lower risk); LCD_EXTCOMIN has no pull-down (design.py:96-97; R9 and R10 cover DISP and SCS only; rev B electrical.md 13); nPM1300 GPIO0 unused (design.py:51) so there is still no hardware reset path before power_init (rev B electrical.md 14; SWD nRESET pad is the only recovery).
9. No reboot-loop guard for watchdog resets. CHECKED main.c:25-27,90-103: the fatal-error handler counts consecutive fatal resets and parks after 3, which fixes rev B NEW-3 for faults. But a hang that trips the 8 s watchdog (app_glue.c:70) resets forever with no count; the bond key stays, the battery drains. Fix: read RESETREAS at boot (main.c:109 already reads it), count consecutive WDT resets in the noinit word, and park or run advertising-only after 3.
10. Stale documentation contradicts rev C. CHECKED firmware/README.md:90 says the compiled devicetree contains ppg (maxim,max30101) and BUCK1 (1.8 V); the built zephyr.dts contains no ppg, max30101, buck1 or boost match (grep returned nothing). README:129, :133, :139 still describe heart-rate behaviour. README:148 says the BUCK1 inductor is "not fitted", but design.py:60 and :67 and dts:114-117 say L1 and C9 stay fitted. Fix: reword those lines.
11. Unproven nPM1300 pin terminations (documented-valid status): VSET1 = 0R to GND leaves BUCK1 off at start-up (CHECKED datasheets.md:107, :115 "< 100 Ohm grounded = BUCK OFF"; FROM SOURCE, EK page). PVDD is on VSYS (design.py:50, C8, C25). SW1, VOUT1 are terminated in L1 and C9, a conservative choice; no Nordic page in the repo describes an unused BUCK1 with VSET1 grounded and the inductor fitted (Config 2 "one BUCK" in datasheets.md:97 is the nearest, and its figures were NOT READ). LSIN1/LSIN2 and LSOUT1/LSOUT2 tied to GND (design.py:56-57): the rev B fix, backed only by Nordic staff DevZone text (revB electrical.md 7), not the spec. GPIO0/2/3/4 and LED0-2 left open: datasheets.md:130 says GPIO default is input with weak pull-down (CHECKED). SHPHLD (design.py:52, button + 5 V TVS D3): internal pull values NOT READ (datasheets.md:142).
12. USB receptacle moves to the bottom side. design.py:116 pad order B12, B9, A5, B5, A9, A12 is mirror-symmetric for GND/VBUS pairs; a side flip must not swap VBUS and GND pads. CC1/CC2 swapping is harmless (both go to the chip). After the move rerun the pad-net check (check_output.txt step 2) rather than trusting the earlier PASS. Also: design.py was modified at 18:42 and the firmware logs are from 16:52; no pin used by firmware appears to have changed (see pin table) but the logs predate the last design edit.
13. Hard-coded duplicate pin and nets in firmware: main.c PQ_MOTOR_PIN 11 duplicates pitchiq_watch-pinctrl.dtsi PQ_PIN_MOTOR_PWM (comment says "must match"); consistent today (CHECKED value 11 in both), not enforced by the build.

---------------------------------------------------------------------------
## Answers to the numbered questions (short)

1. USB-C sink.
- CC wiring: CHECKED design.py:116 and :54 (J3 A5 to U2.23, B5 to U2.24; no external Rd). Internal Rd with dead battery: NOT FOUND (see MAJOR 1).
- VBUS path: J3 A9/B9 to VBUS net to U2.21, D2 and C12 on that net (CHECKED design.py:66, :70, :116). TVS standoff/clamp vs abs max: 5.0 V / 9.2 V against 22 V (FROM SOURCE usbc_motor.md:84, CHECKED datasheets.md:146). Leakage in the 5.0-5.5 V band NOT CHECKED (MINOR 2).
- Shell: S1-S4 tied to GND (CHECKED design.py:117); acceptable for a non-metal case; no RC isolation.
- USB-C to USB-C from a PD charger: on paper the source sees Rd, drives 5 V, advertises 1.5 A or 3 A through Rp; power.c:265 raises the limit to 500 mA on that detect, same mask as the stock driver (CHECKED). The watch has no PD controller, so it stays at 5 V (FROM MEMORY of the USB-C spec, NOT CHECKED in repo).
- Legacy A-to-C: Rp for default USB leaves the detect field without the 1.5/3 A bits, the limit stays at 100 mA (CHECKED power.c:265 logic); 74 mA charge fits under 100 mA only if system load stays low (ESTIMATE; supplement mode covers peaks, not checked).
- VBUS capacitance: see MINOR 1.
2. Removal of HR, boost, 1.8 V rail.
- Dangling nets: CHECKED the netlist; no net has a single pin, check_output.txt step 1b reports 0 errors. 1V8 net contains U2.1, L1.2, C9 only; SW1 contains U2.3 and L1.1; VSET1 contains U2.17 and R1. No U3, U5 or 5 V LED rail remain (design.py:3, erc.py:39,42 comments).
- Unused buck: see MINOR 11.
- Leftover firmware references: CHECKED grep for max30101, hr_, heart, boost, BUCK1, 1v8 in firmware/app and boards: matches only in comments (ble_pq.c:3, sensors.c:2, pinctrl comment, dts:2, dts:114-118) and README (MINOR 10). No code reference. The built zephyr.dts has no ppg/max30101/buck1/boost entries.
3. Pin check: see table below. No mismatch found for U2, U4, J1, J3 and for the U1 pads that are used; a mismatch does not exist, but the U1 table is not in datasheets.md (it is in the Raytac spec text).
4. Motor: MINOR 6.
5. SWD: 100R series on SWDIO, SWDCLK, nRESET (design.py:128-130), PESD5V0S1BA at each pad (design.py:131-132, TVS 5 V, about 35 pF per design.py:132 text), 10 k pull-up R16 on nRESET on the module side of R19 (design.py:133). No external pull on SWDIO/SWDCLK: relies on nRF52840 internal pulls (FROM MEMORY of the nRF52840 product spec, NOT CHECKED in the repo). 3V0 reference pad: MAJOR 2.
6. Power budget: MAJOR 3.
7. Firmware: pin map equals design.py (table). Charger settings (CHECKED dts:142-154, power.c:149-174): termination 4.20 V, warm 4.00 V, 75 mA requested (74 mA written, 0.49 C on 150 mAh), discharge limit 1 A (value 415), start-up VBUS limit 100 mA enforced by BUILD_ASSERT (power.c:117), NTC 10 k, beta 3380 (NTC 45 C code 337 re-computed: R = 10000 x exp(3380 x (1/318.15 - 1/298.15)) = 4906 ohm, code 1024 x 4906/14906 = 337, matches power.c:128), die stop/resume codes 410/422 are estimates (power.c:131-134). Watchdog: 8 s, SOC reset, fed from the 1 s tick and from the I2C recovery (CHECKED app_glue.c:70, i2c_util.c:23); fatal handler parks after 3 fatal resets (main.c:25-27); WDT loop not guarded (MINOR 9). Bond storage: CHECKED prj.conf:394-401 (BT_SETTINGS, NVS, SETTINGS_NVS), storage partition 0xfc000 + 0x4000 = flash end (dts:228-232), 4 sectors of 4 KB = 16 KB with SETTINGS_NVS_SECTOR_COUNT=4 (boards/pitchiq_watch.conf), slots 0xc000 + 0x78000 = 0x84000 and 0x84000 + 0x78000 = 0xfc000 (arithmetic OK), BT_MAX_PAIRED=1. Assumes removed hardware: none in code (MINOR 10 is docs). Build logs: CHECKED tail of firmware/build_logs/boss_revC_pitchiq.log and boss_revC_dk.log, both end with "EXIT 0". That says the code compiles, nothing more.
8. Scripted ERC limits: see list below.

---------------------------------------------------------------------------
## Rev B regression check

| Rev B item | Rev C state |
|---|---|
| electrical 6 module VBUS floating | fixed, design.py:32 ties pad 32 to GND (CHECKED) |
| electrical 7 LSOUT open | fixed, design.py:56-57 (CHECKED) |
| electrical 2 / firmware 6 discharge limit 200 mA | fixed, dts:147-149 1 A, BUILD_ASSERT power.c:142 (CHECKED) |
| electrical 10 motor from VSYS | duty cap implemented, haptics.c:54-56 (CHECKED); residual in MINOR 6 |
| electrical 11 frontlight headroom | NOT fixed (MINOR 7) |
| electrical 12 I2C pull-ups, 13 EXTCOMIN pull-down, 14 hard reset | NOT fixed (MINOR 8) |
| electrical 1 cold start, nothing built | still unproven, NOT CHECKED (no hardware); BUCK2 still 150 k = 3.0 V (design.py:68); rev B plan (bench U2 first with 100 mA limit, with and without a cell) still applies |
| power 1 NTC 0-45 C | NTCHOT set to 45 C (power.c:161); other thresholds default, NOT CHECKED |
| power 3 R9 30 uA | fixed, 1 M (design.py:96) |
| power 7 VBUS limit never raised | fixed with CC detect (power.c:262-275) |
| power 4 over-discharge recovery | still open (MINOR 5) |
| firmware 1 bonds not persisted | fixed (prj.conf:394-401, NVS 16 KB) |
| firmware 2 watchdog / fatal halt | fixed (app_glue.c:70, main.c:25-103) |
| second_round NEW-1 symmetric cradle | cradle gone, but the SWD row has the same symmetry (MAJOR 2) |
| NEW-2 watchdog before first kick | fixed by feeding in I2C recovery (i2c_util.c:23) |
| NEW-3 reboot loop | fatal handler fixed, WDT loop open (MINOR 9) |
| NEW-6 TVS standoff | still open (MINOR 2) |
| firmware 8 production security | prod.conf exists, default build unlocked; sysbuild_prod.conf:5 still has a placeholder key path; NOT CHECKED beyond reading (not a rev C hardware matter) |

---------------------------------------------------------------------------
## Pin-check table (design.py vs source)

Sources: U2 = datasheets.md:25-59; U4 = datasheets.md:234-247; J1 = datasheets.md:268-279; J3 = usbc_motor.md:63-66; U1 = Raytac spec text /tmp/rv_dl/raytac/m.txt (not datasheets.md).

| Part | Pins compared | Result |
|---|---|---|
| U2 nPM1300 QFN32 | 1 VOUT1, 2 PVSS1, 3 SW1, 4 PVDD, 5 SW2, 6 PVSS2, 7-11 GPIO0-4, 12 VDDIO, 13 SDA, 14 SCL, 15 SHPHLD, 16 VSET2, 17 VSET1, 18 NTC, 19 VBAT, 20 VSYS, 21 VBUS, 22 VBUSOUT, 23 CC1, 24 CC2, 25-27 LED0-2, 28-31 LSIN/LSOUT, 32 VOUT2, 33 EP (design.py:50-57) | all 33 match, CHECKED |
| U4 LIS2DH12 | 1 SCL, 2 CS to 3V0, 3 SA0 to 3V0 (0x19), 4 SDA, 5 RES to GND, 6-8 GND, 9 VDD, 10 VDD_IO, 11 INT2 open, 12 INT1 (design.py:84-86) | all 12 match, CHECKED; INT2 open is allowed on paper? NOT CHECKED (datasheets.md has no INT2 floating statement) |
| J1 LCD FPC | 1 SCLK, 2 SI, 3 SCS, 4 EXTCOMIN, 5 DISP, 6 VDDA, 7 VDD, 8 EXTMODE, 9 VSS, 10 VSSA (design.py:92-93) | all 10 match, CHECKED; rail 3.0 V is in 2.7-3.3 V (datasheets.md:290) |
| J3 USB4715 | A12 GND, B12 GND, A9 VBUS, B9 VBUS, A5 CC1, B5 CC2, shell GND (design.py:116-117) | match drawing table usbc_motor.md:66, CHECKED; pad X positions in gen_pcb.py NOT CHECKED here |
| U1 MDBT50Q | 16 P0.27 SCL, 17 P0.00/XL1, 18 P0.01/XL2, 19 P0.26 SDA, 20 P0.04, 22 P0.06, 27 P0.11, 28 VDD, 30 VDDH, 31 DCCH open, 32 VBUS to GND, 37 P0.13, 39 P0.15, 40 P0.18/nRESET, 41 P0.17, 44 P0.20, 46 P0.22, 48 P0.24, 51 SWDIO, 53 SWDCLK | all match the Raytac table, CHECKED; GND pads 1, 2, 15, 33, 55: pad 15 and 33 CHECKED against spec text, 1, 2, 55 NOT CHECKED (not in the extracted text I read) |

Signal map, design.py vs dts/pinctrl (CHECKED, pitchiq_watch-pinctrl.dtsi:258-268, dts):

| Signal | design.py net, module pad | dts |
|---|---|---|
| LCD SCK | P0.13, pad 37 | PQ_PIN_LCD_SCK 13, spi2 SCK |
| LCD MOSI | P0.15, pad 39 | 15, spi2 MOSI |
| LCD SCS (active high) | P0.17, pad 41 | 17, cs-gpios ACTIVE_HIGH |
| LCD EXTCOMIN | P0.20, pad 44 | 20, extcomin-gpios, 60 Hz |
| LCD DISP | P0.22, pad 46 | 22, lcd-disp-gpios ACTIVE_HIGH |
| Frontlight PWM | P0.24, pad 48 | 24, pwm0 ch0 |
| I2C SDA | P0.26, pad 19 | 26, TWIM SDA |
| I2C SCL | P0.27, pad 16 | 27, TWIM SCL |
| ACC INT1 | P0.04, pad 20 | 4, irq-gpios ACTIVE_HIGH; reg 0x19 matches SA0 high |
| PMIC INT (nPM1300 GPIO1) | P0.06, pad 22 | 6, host-int-gpios, pmic-int-pin = 1 |
| Motor VIB | P0.11, pad 27 | 11, pwm1 ch0, 20 kHz period 50 us |
| nRESET | P0.18, pad 40 | &uicr gpio-as-nreset |
| SWDIO / SWDCLK | pads 51 / 53 | none needed |
| Button | nPM1300 SHPHLD | via nPM1300 events, no GPIO |
| nPM1300 I2C 0x6B | U2.13/14 | reg 0x6b (datasheets.md:154) |

---------------------------------------------------------------------------
## Limits of the scripted ERC (erc.py)

CHECKED by reading erc.py:
- It reads pin types that the same author typed into design.py, so a wrong pin number, wrong type, or wrong net on a datasheet pin is invisible to it; it never compares against datasheets.md.
- Passive ("pas") pins satisfy almost every rule, so the USB CC lines, VBUSOUT, VSET1, VSET2, NTC and the TVS diodes are not checked for a sensible partner (erc.py:27-28).
- It cannot see diode or MOSFET orientation (anode/cathode, gate/drain/source are labels only), component values (R2 150 k giving 3.0 V, R1 0R, the NTC value), voltage ratings against the actual rail, TVS standoff versus source voltage, capacitor DC-bias derating, or capacitance limits such as the USB 10 uF.
- Power-source logic is declared by hand (L1.2 and L2.2 are typed "po" to stand in for the bucks, U2.20 "po" for VSYS); it cannot tell whether a source actually starts (dead battery, VBUS-only start, VSET behaviour, BUCK2 start-up with VBAT floating).
- Voltage-domain check is a four-line table (erc.py:42-44) covering U1, U4, J1 and U2.12 only; LIMIT does not include U2, the TVS parts, the motor or the NTC.
- It does not know about CC1/CC2 Rd/Rp logic, USB-C attach states, PD, or hot-plug transients.
- It does not check footprints against pin numbers or geometry, placement, return paths, antenna keep-out, thermal, or sequencing, and says so itself (erc.py:1-4: NOT KiCad's ERC).
- Its notes (check_output.txt: four strap/passive-driven notes) are informational, not a pass on those nets.
- Its PASS in out/check_output.txt covers design-file consistency only ("this says nothing about a built board", CHECKED last line).

---------------------------------------------------------------------------
## Not checked (and why)

- Whether the nPM1300 Rd is always connected, VBUSOUT topology, SHPHLD internal pull, default NTC cold/cool/warm thresholds, BUCK2 short-circuit behaviour, load-switch pin grounding in the spec: not in datasheets.md and the Nordic figures and some pages are marked NOT READ there (datasheets.md:9, :81, :96, :142).
- Nordic electrical figures were extracted by a summarising reader (datasheets.md:9); I did not re-fetch the Nordic documents.
- SMF5.0A leakage at 5.0-5.5 V, USB 2.0 / Type-C 10 uF figure source, nRF52840 internal SWD pulls, USB-C PD default behaviour: from memory only, not in the repo.
- Any hardware behaviour: nothing is built; cold start with no battery and with a flat cell, motor start current, frontlight Vf, BCHGCHARGESTATUS bit meanings (power.c:75-81 marks them as an ASSUMPTION; the stock driver does not name the bits) are all open.
- Layout: gen_pcb.py pad X positions for J3, clearance, antenna, and the USB-C move to the bottom side (not in scope).
- Whether the UI redraws on every 1 s tick; mcumgr/MCUboot behaviour; production signing and APPROTECT beyond reading prod.conf.
- The CMake sysbuild MCUboot image and DK build were not examined beyond their final "EXIT 0" lines.
