# Power electronics review, rev B (nPM1300 tree, buck, boost, battery, budget)

Sources used: nPM1300 Product Specification v1.1 (4490_483, 2024-06-16), https://download.mikroe.com/documents/datasheets/nPM1300_datasheet.pdf (section/figure numbers below refer to it; I read the text and Figures 54-58); PKCell QA.S.0228 cell spec (linked from https://www.adafruit.com/products/1317); TPS61023 datasheet (https://www.ti.com/lit/ds/symlink/tps61023.pdf, summary via fetch tool); MAX30101 datasheet (https://www.analog.com/media/en/technical-documentation/data-sheets/max30101.pdf); TDK MLP2012H table (https://www.farnell.com/datasheets/2041193.pdf); pcbnew read-only on kicad/pitchiq_watch.kicad_pcb. "[est]" = my estimate. Per the coordinator, items already covered by the electrical reviewer (battery-less cold start, 200 mA discharge limit, Isat unpublished, motor on VSYS, C12, 100 nF at PVDD) are not repeated except where I add evidence.

## Findings

### 1. MAJOR: charger NTC window is the default 0-60 C; the cell allows charging only 0-45 C
Evidence: PKCell spec Form 1 item 9: charge 0-45 C, discharge -20-60 C. nPM1300 6.2.5 Tables 13/14: defaults TCOLD 0, TCOOL 10, TWARM 45, THOT 60 C; "Charging does not happen below TCOLD or above THOT"; Warm region 45-60 C still charges (at VTERMR). firmware/app/src/power.c `charger_lite_init()` writes NTCR_SEL, VTERM, VTERMR, ISET, discharge limit, VBUS startup limit, trickle, ITERM, ADC, DIS_SET only; it never writes NTCWARM/NTCHOT (0x14/0x16) or BCHGCONFIG (0x3C). The devicetree has no thermistor-*-millidegrees properties either, so even the stock driver would leave the defaults (npm13xx_charger.c set_ntc_thresholds only acts on set properties).
Fix: write NTCHOT = NTCWARM code (10 k at 45 C = 337 per Table 13) or set BCHGCONFIG DISABLECHARGEWARM=1; add `thermistor-hot-millidegrees = <45000>` for the stock-driver path. Also lower DIETEMPSTOP from the 110 C default (6.2.6, Table 17) to about 60-70 C [est] so the case stays under skin-contact limits.

### 2. MAJOR: the NTC does not sense the cell, and the cell sits on the charger
Evidence: gen_pcb.py places RT1 at (29.8, 27.6) mm; the cell outline drawn at lines 116 is x 6.1-25.9, y 8.5-34.5, so RT1 is 3.9 mm outside the cell edge. U2 is at (22.8, 23.8) and L1/L2 at (16.7, 20.9/24.5): all under the cell. design.py line 66 says "place against the cell"; the placement does not do it. The cell is 3.8 mm thick with leads soldered, so there is no thermal path to RT1 except air.
Impact: cell temperature limits (finding 1) are enforced on a board temperature next to the PMIC, which reads high while charging and cannot see cell self-heating or external heat. Charger dissipation heats the cell from below (see thermal section).
Fix: move RT1 under the cell centre (bottom of cell, taped/foamed to it) or put a leaded NTC on the cell; keep NTC trace C under 100 pF (6.2.5 note).

### 3. MAJOR: R9 (100 k LCD_DISP to GND) burns 30 uA continuously; absent from the budget
Evidence: design.py line 111; ui.c line ~108 drives DISP active (3.0 V) permanently: 3.0 V / 100 k = 30 uA from 3V0 = about 26 uA from the cell [est eff 0.8-0.88]. The budget's whole standby figure is 50 uA. Same mechanism: R8 (BOOST_EN pull-down) 30 uA while HR runs, R14 (FL_PWM) about 9-18 uA while the frontlight runs, R6+R7 FB divider 5 V/832 k = 6 uA while boost is on.
Fix: R9 and R8 to 1 M (or 470 k); the reset-default purpose is kept. Standby estimate changes from about 83 to about 57 uA (see section 5).

### 4. MAJOR: battery over-discharge recovery and certification evidence are unverified
Evidence: nPM1300 6.2.2: "An undervoltage lockout circuit is not included on the device and must be set up on the battery pack"; "CHARGER waits until a battery is detected". PKCell spec gives only 3.0 V end-of-discharge, no PCM thresholds for overcharge, overcurrent or short; the Adafruit page gives no thresholds either. A forum thread (devzone 126153) reports that newer silicon revisions disable battery detection and VBAT "pinging" behaviour is not defined by Nordic (not confirmed). So whether a PCM-tripped cell (pack terminals open at 3.0 V) is ever re-detected and recharged is unknown, and the only independent second layer against a charger fault (VSYS about 4.9 V reaching VBAT) is a PCM whose overcharge threshold nobody has read.
Fix: bench test with a deliberately over-discharged cell before ordering volume; require a pack with published PCM thresholds (OV, UV, OC, short) and an IEC 62133-2 report, not only the UN38.3 report linked on the product page. I am not giving a legal opinion on UL 2054 / IEC 62368-1; the usual expectation is a certified pack plus a charger that respects its limits (4.2 V, 0-45 C, 1C max charge here), which findings 1-2 currently break. A board-level protector is not electrically required if the PCM is documented; it becomes necessary if you cannot get the PCM thresholds.

### 5. MAJOR: cradle row is 180-degree symmetric and the pads face the skin with no protection
Evidence: TP1..TP5 at x = 108/112/116/120/124 mm, y = 108.5 (VBUS, GND, SWDIO, SWDCLK, NRESET), 4 mm pitch; rotating the cradle 180 degrees puts VBUS on NRESET (nRF P0.18, VDD+0.3 V max) and GND on SWDIO. Nothing in the repo describes mechanical keying. SWDIO, SWDCLK, nRESET go straight to MCU pins with no ESD part; R16 (10 k pull-up from 3V0 to NRESET) forms a divider with any sweat bridge to the adjacent GND pad: resets whenever the bridge is under about 4.3 k [est, VIL 0.3 VDD] and leaks up to 300 uA below that.
Fix: key the cradle mechanically (or reorder: GND outermost on both ends, VBUS in the middle), add ESD diodes on SWD/nRESET, gold finish (job file says Finish "None"), and consider disabling the pads in firmware/hardware when not docked.

### 6. MAJOR (document): power_budget.md arithmetic is correct, but several inputs and claims are wrong
(a) Ship mode "37.0 years": uses only the PMIC 0.37 uA (Table, section 3.8). Ignored: PCM quiescent (about 3 uA typical for a one-cell protector [est]), cell self-discharge (PKCell Form 2 item 3 only guarantees at least 80 percent capacity after 28 days, i.e. up to 20 percent per month), C6 insulation resistance (Samsung CL10A106KP8NNNC reliability table: 10,000 Mohm or 100 Mohm x uF, lower value applies = 10 Mohm for 10 uF, so up to 0.42 uA at 4.2 V at spec minimum). Realistic shelf life is months, not years; PKCell 7.5 advises a top-up after 6 months of storage. State "ship at 40-60 percent, recharge every 6 months".
(b) HR inputs differ from firmware: budget uses 25 mA, 215 us, 100 sps. Devicetree uses led-pa 0x30 = 9.6 mA, led-pw 411 us, smp-sr 100 with smp-ave 2 (if the LED fires at sr x ave = 200 pulses/s, which I could not confirm in the datasheet) giving 0.79 mA average LED current instead of 0.54 mA. Budget frontlight 30 percent, firmware LIGHT_DUTY_PERCENT 60.
(c) The text "200 mA default / 1 A selectable": the datasheet Table 16 gives 200 mA / 1 A as nominal "validated through simulation" and Table 17 gives IBATLIMLOW 290 mA typ, IBATLIMHIGH 1460 mA typ; no default is stated.
(d) Buck efficiency 0.88 at 5-50 uA loads is optimistic; the datasheet gives only 93 percent at 200 mA PWM (6.3.6). I used 0.78/0.82/0.86 for under 30 uA / under 100 uA / under 1 mA [est].
(e) Motor taken at 50 mA rated x 450 ms; firmware drives it at 100 percent duty straight from VSYS (haptics.c), so at 3.8 V mean it is about 26 percent higher than rated, plus start current (I used +15 percent [est]).
(f) PMIC IQ 2 uA is an estimate; the datasheet figure is 0.8 uA with one buck auto, 1.1 uA with two (BUCK1 is switched off by firmware). Nordic forum thread 107322 reports 1-4 mA after misconfigured GPIO control or unserviced INT; measure it.
(g) Charge time "2.0 h CC plus taper, 2.5-3 h": CC phase covers about 75 percent of capacity: 0.75 x 150 / 74 mA = 1.5 h, plus CV to ITERM about 1 h [est] = about 2.5 h. The total is fine, the breakdown is not. Actual ICHG code gives 74 mA, not 75. ITERM is 10 percent = 7.4 mA (cell cut-off is 0.01C = 1.5 mA), so the cell ends about 5 percent short; acceptable. In the Cool band (0-10 C) current halves (Table 14): about 4 h.

My corrected estimates (script in /tmp/rev/budget.py, battery side, 3.8 V mean, includes about 6 uA PCM+self-discharge in standby only):
| Profile | As built | With R9/R8 fixed |
|---|---|---|
| Standby, adv 1 s, screen on | about 83 uA | about 57 uA |
| Game typical, 20 ms, 50 calls/h, HR off | about 0.88 mA | about 0.86 mA |
| Game relaxed, 100 ms | about 0.60 mA | about 0.57 mA |
| Heavy (HR on, frontlight 30 percent) | about 3.9 mA | about 3.9 mA |
Daily use (3 h game + 21 h standby): typical 4.4 mAh/day as built, 3.8 fixed; on 120 mAh usable that is 27 vs 32 days; heavy about 13 mAh/day, 9 days. The budget's 3.1 / 39 days is about 20-30 percent optimistic. The connected 20 ms figure (387 uA) rests on 7.7 uC per event [est]; verify with Nordic's Online Power Profiler or a measurement; I did not run it.

### 7. MINOR: VBUS limit is never raised, so the effective limit is 100 mA
Evidence: 6.1.3: the 100 mA default stays until VBUSINILIM0 is written and TASKUPDATEILIMSW; power.c writes only VBUSINILIMSTARTUP (500 mA, encoding 5 is correct) and the dts comment claims a 500 mA source. Spec for the startup register does not say it applies to a VBUS already present. IBUS100MA max is 95 mA (Table 10). Charge 74 mA + system 15-20 mA is at the limit; system load has priority (6.2.10) so charge simply slows. Fix: also write VBUSINILIM0 then TASKUPDATEILIMSW (0x00) after VBUS detect, if the cradle really supplies 500 mA.

### 8. MINOR: TPS61023 is a 2.7-3.7 A valley-limit part with a 1.0-1.1 A thermal-rated inductor
Evidence: TPS61023 6.5: valley limit 2.7 min / 3.7 typ A; 6.3: inductor 0.37-2.9 uH, saturation must exceed peak inductor current; TDK rated current 1100 mA is a 40 K temperature-rise rating, Isat not published. My ripple calc (VIN 3.0 V, VOUT 4.95 V, 1 MHz, L 0.8 uH worst) gives 1.8 A pk-pk; with the 50 mA LED maximum the peak is about 1.0 A in continuous conduction [est]. Any overload (start-up into the 3 x 10 uF + the sensor, short, sensor fault) runs to the 2.7-3.7 A limit with a saturated inductor. Start-up: pre-charge about 350 mA while VOUT is low, then 0.7 ms soft start (7.3.2): input about 0.35 A for about 0.3 ms [est], which also exceeds the low battery discharge limit on its own.
Input capacitance is listed as 1-4.7 uF effective (6.3); VSYS here has about 25 uF effective across C7/C8/C18/C24 [est]; harmless electrically but verify start-up.
Fix: use the same 2.2 uH MLP2012H2R2 as L3 (allowed, peak about 0.5 A [est], one fewer BOM line) or a 1 uH part with Isat of at least 2.5 A; keep EN soft-sequenced.

### 9. MINOR: VSYS follows VBUS, so LED rail follows the cable
Evidence: 6.1.1: SYSREG "does not regulate" VSYS; RON 300 mOhm (Table 10); VBUSOVP 5.5 V typ. VSYS about VBUS minus 0.3 ohm x I. TPS61023 7.3.5: VIN above VOUT gives pass-through, VOUT = VIN minus drops. LED rail therefore follows VBUS, up to about 5.5 V, below MAX30101 6.0 V absolute maximum but outside its 4.5-5.5 V green guaranteed range only above 5.5 V. Fix: firmware rule: no HR/boost while VBUS present; document cradle supply 5.0 V +/-5 percent.

### 10. MINOR: buck/boost layout as routed (pcbnew measurements)
- PVSS1 (U2.2) and PVSS2 (U2.6) have their nearest GND vias 3.18 mm and 2.50 mm away; the exposed pad (4.83 mm from the nearest via) has 0 vias inside its footprint and joins the F.Cu pour through thermal spokes (zone pad connection THERMAL, spoke 0.25 mm). Nordic Figure 54 annotates "Via to GND-layer on PVSS1 / PVSS2" and uses one 10 uF input cap per buck returned to the matching PVSS; here there is one input cap (C8, 3.0 mm of 0.2 mm track from PVDD) for both. Return current likely finds In1 (0.1 mm below) through the pour, so the loop is small, but add vias at both PVSS pins and under the EP. Impact not measured.
- Inductors sit 2.6 mm (L2) and 3.4 mm (L1) from SW pins; output caps 6-7 mm from the VOUT pins (reference layout Figure 60 puts them adjacent). SW1 = 2.7 mm, SW2 = 1.8 mm, all F.Cu, 0 vias: good.
- Boost: BOOST_SW is routed through two vias on In2 for 5.9 mm to jump over L3 pad 1 (about 7 nH [est]); C19 2.25 mm from VOUT, GND via 0.46 mm from U5.4: good. C18 is 3.6 mm from VIN.
- All tracks 0.2 mm. R at 1 oz outer 2.5 mOhm/mm, 0.5 oz inner 4.9 mOhm/mm [est copper 35/17.5 um], via 0.84 mOhm each [est 20 um plating]. Path results: VBAT pad to U2.19 80 mOhm (32 mm, 2 vias) = 16 mV at 200 mA, 6 mV at charge; VSYS U2.20 to PVDD 85 mOhm (via In3 detour), to U5.3 108 mOhm, to motor 46 mOhm; VBUS TP1 to U2.21 134 mOhm (30 mm, mostly In2) = 13 mV at 100 mA; 5V_LED to sensor 62 mOhm = 3 mV at 50 mA. Temperature rise (IPC-2221 [est]): inner 0.5 oz 0.2 mm at 0.25 A about 12 C, at 0.1 A about 1.5 C; outer at 0.25 A under 1 C. No path is a problem at the real currents. Note nPM1300 RONCHARGER 160 mOhm (Table 17) adds to the battery path.

### 11. MINOR: capacitors and unused pins differ from the Nordic reference
- Reference BOM (Tables 40-42): 10 uF X5R 25 V; this design uses 10 V parts (design.py C10u). Buck output spec (Table 21): 10 uF nominal, rated at least 10 V, ESR at most 50 mOhm. My DC-bias estimates for 10 uF 0603 X5R 10 V (Samsung curve not retrievable here): about 8 uF at 1.8 V, about 6 uF at 3.0 V, about 4 uF at 5 V. 3V0 total about 13 uF effective is fine; 1V8 about 9 uF; boost output 3 x about 4.2 = 12.6 uF, above the 4 uF minimum. Consider 25 V or 0805 for C9/C10.
- Reference Figures 54/58: VBUS 1 uF, VBAT 2.2 uF, VBUSOUT 1 uF, VDDIO 100 nF. This design is larger on each; fine, except VBAT/VBUS hot-plug (below).
- Config 3 (Figure 58) grounds LSIN1/2 and LSOUT1/2 together; design.py grounds only LSIN and leaves LSOUT (pins 29, 31) open. Ground them.
- This resolves the disclosed unknown on capacitor node assignment and unused pins: see Figures 54, 58 on pages 157, 160.

### 12. MINOR: 1.8 V rail sits at the bottom of the MAX30101 window
VDD 1.7-2.0 V (MAX30101 electrical table). BUCK1 accuracy +/-5 percent (6.3.6) and 50 mVpp hysteretic ripple give 1.685 V worst case. Typical parts are better, but 1.9 V set by firmware (100 mV steps) shifts the window to 1.78-2.02 V, also marginal at the top. Decide by measurement.

### 13. MINOR: battery polarity and JP1
No reverse-polarity protection on VBAT (abs min -0.3 V) with soldered leads; silkscreen only. The cell spec 7.1 warns reversed connection destroys it. Add a keyed pad or P-FET. JP1 and the 40 uF (nominal) behind it: hot-plug is heavily overdamped (cell + PCM + 160 mOhm path, lead inductance about 0.1 uH [est], damping ratio above 3 [est]), so no overshoot problem.

## Thermal
Charger is linear (6.2.6, overview): P = (VSYS - VBAT) x ICHG, VSYS about 4.97 V on a 5.0 V cradle. At 74 mA: 146 mW at 3.0 V, 94 mW at 3.7 V, 65 mW at 4.1 V [est]. RthetaJA 24.2 C/W (JESD51-7, Table 8) gives 4-5 C rise; this board is probably 30-40 C/W [est] so 5-6 C. Not a hot spot by itself; the concern is it sits under the cell (finding 2) and the EP has no vias. Buck dissipation at 200 mA about 40 mW [est]. No other hot spots found.

## Could not check
Nordic's own PCB reference layout files (downloads tab), buck PWM peak current limit (not in v1.1 text; v0.7 only says 400 mA), efficiency curves, Samsung DC-bias curves, TDK Isat, PESD5V0S1BA VRWM/VBR/leakage (datasheet not reachable), AO3400A and 1N4148WS figures (from memory, not re-fetched; no problem expected at 150 mA), Nordic Online Power Profiler, PCM thresholds of the cell.

## Checked and found correct
- VSET1 47 k = 1.8 V and VSET2 150 k = 3.0 V (Tables 18/19).
- Inductor 2.2 uH +/-20 percent, DCR 150 mOhm under 400 mOhm; rated 1.0 A against the 350 mA Isat / 200 mA Imax requirement (Table 20); buck peak at 200 mA is about 0.25 A [est].
- Charge register encodings in power.c: ISET 37 (74 mA), VTERM index 8 (4.20 V), VTERMR 4 (4.0 V), discharge 42/0 code, trickle 2.9 V, ITERM 10 percent, VBUS startup code 5; status bits (BCHGCHARGESTATUS A-H) match; ship hold 1008 ms is an allowed tshipToActive value.
- Charge settings against cell: 74 mA is 0.49C (cell 1C quick, 0.2C standard, Adafruit 150 mA max), 4.20 V +/-1 percent, 7 h timer, cold cutoff at 0 C matches.
- NTC 10 k B 3380 (Murata NCP15XH103F03RC) is a supported type (Table 12); NTC trace 4.6 mm.
- BOOST_FB: 0.595 x (1 + 732 k/100 k) = 4.95 V, +/-2.5 percent reference gives about 4.8-5.1 V, inside 4.5-5.5 V.
- Boost output capacitance and EN thresholds OK; load disconnect in shutdown confirmed (TPS61023 7.3.2); MAX30101 tolerates pulled-up I2C/INT with VDD off (power-sequencing section).
- Motor flyback diode orientation, no overvoltage on AO3400A, SW1/SW2 short routes, GND via distance under 1 mm for every decoupling cap, ship-mode entry/exit mechanism (SHPHLD button, VBUS wake), SHPHLD pull-up 50 k to the higher of VBAT/VBUS.
- power_budget.py unit handling (uC per event to uA, per-call energy) and the quoted 18 uA and 277 uA savings reproduce.
