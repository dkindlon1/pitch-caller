# Datasheet extraction for Rev B watch parts

Date of reading: 2026-11-23. Rule used: only what was read is reported; "NOT READ" marks anything I could not read; "INFERENCE" marks anything I derived from read data and did not read as a statement.

## How each source was read

| Source | Method | Reliability note |
|---|---|---|
| Nordic nPM1300 product spec (docs.nordicsemi.com, HTML bundle `ps_npm1300`) | WebFetch text extraction, page by page. Nordic PDFs and image files return Cloudflare 403 to curl, so no PDF text, no schematic or layout images. | Tables read as text. Figures (schematics, package drawing, layouts) NOT READ. Numbers come through a summarising reader, so re-check pin and component values against the Nordic PDF before releasing the board. |
| ADI MAX30101 and MAX30102 datasheets (analog.com PDF, Rev 3, 6/20) | WebFetch text extraction of the PDF. A direct curl download failed (HTTP/2 error) and a mirror download was blocked by the sandbox, so I did not pursue it. | Pin table and electrical numbers read as text. Package drawing and land pattern drawing NOT READ (only drawing numbers appear). |
| ST LIS2DH12 (DocID025056 Rev 6) | PDF downloaded (SparkFun CDN copy of the ST datasheet), `pdftotext`, package page rendered and viewed. Cross-checked against a WebFetch of st.com. | Highest confidence of all parts. |
| Sharp LS013B7DH03 spec LCP-1112045 (first issue 2012-09-06) | PDF downloaded (SparkFun CDN copy, Mouser-stamped), `pdftotext`, outline and circuit pages rendered and viewed. | High confidence. FPC pitch and thickness are not on any page I read. |
| Azumo 11049-06 | Azumo module datasheet PDF (preliminary, 04/24/2024) and FLEx front-light-panel datasheet 12367-01_T5, both downloaded and rendered to images, viewed. Azumo web pages and DigiKey page via WebFetch. | High for the two PDFs. |
| Boost converters | MT3608: WebFetch of an Aerosemi PDF (it is the MT3608B Rev1.1 datasheet). TPS61099 and TPS61023: WebFetch of the TI datasheets (ti.com/lit/gpn/...). | TI equations came through garbled; formula shown is the standard form and is flagged. |
| Prices and stock | WebFetch of distributor pages today. LCSC pages gave only a starting price in page metadata, not price breaks. | Stock changes hourly. |

---

## 1. Nordic nPM1300, QFN32 5x5 mm (order code NPM1300-QEAA)

### 1.1 Pin table, QFN32

Source: https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/pin.html-qfn32 (section "QFN32 pin assignments", text table, fully read).

| Pin | Name | Type | Function |
|---|---|---|---|
| 1 | VOUT1 | Power | BUCK1 output |
| 2 | PVSS1 | Power | BUCK1 power ground |
| 3 | SW1 | Power | BUCK1 regulator output to inductor |
| 4 | PVDD | Power | BUCK[n] power input |
| 5 | SW2 | Power | BUCK2 regulator output to inductor |
| 6 | PVSS2 | Power | BUCK2 power ground |
| 7 | GPIO0 | Digital I/O | GPIO0 |
| 8 | GPIO1 | Digital I/O | GPIO1 |
| 9 | GPIO2 | Digital I/O | GPIO2 |
| 10 | GPIO3 | Digital I/O | GPIO3 |
| 11 | GPIO4 | Digital I/O | GPIO4 |
| 12 | VDDIO | Power | Supply for TWI and GPIOs |
| 13 | SDA | Digital I/O | TWI data |
| 14 | SCL | Digital input | TWI clock |
| 15 | SHPHLD | Digital input | Ship mode hold |
| 16 | VSET2 | Analog input | Voltage set for BUCK2 to resistor |
| 17 | VSET1 | Analog input | Voltage set for BUCK1 to resistor |
| 18 | NTC | Analog input | Battery thermistor |
| 19 | VBAT | Power | Battery |
| 20 | VSYS | Power | System voltage output |
| 21 | VBUS | Power | Input supply |
| 22 | VBUSOUT | Analog output | VBUS output for host |
| 23 | CC1 | Analog input | USB Type-C configuration channel 1 |
| 24 | CC2 | Analog input | USB Type-C configuration channel 2 |
| 25 | LED0 | Analog output | LEDDRV0 output |
| 26 | LED1 | Analog output | LEDDRV1 output |
| 27 | LED2 | Analog output | LEDDRV2 output |
| 28 | LSIN1/VINLDO1 | Power | LOADSW1 supply or LDO1 input |
| 29 | LSOUT1/VOUTLDO1 | Power | LOADSW1 or LDO1 output |
| 30 | LSIN2/VINLDO2 | Power | LOADSW2 supply or LDO2 input |
| 31 | LSOUT2/VOUTLDO2 | Power | LOADSW2 or LDO2 output |
| 32 | VOUT2 | Power | BUCK2 output |
| Exposed pad | AVSS | Power | Ground |

### 1.2 Package and land pattern

Source: https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/hw_layout/mech_spec/frontpage.html-qfn32 (Table 1, "QFN32 5.0 x 5.0 mm package").

| Parameter | Min | Nom | Max |
|---|---|---|---|
| Body D, E (mm) | 4.9 | 5.0 | 5.1 |
| Pitch e (mm) | - | 0.5 | - |
| D2, E2 window (mm) | 3.4 | 3.5 | 3.6 |
| Height A (mm) | 0.8 | 0.85 | 0.9 |
| Standoff A1 (mm) | 0 | 0.035 | 0.05 |
| Terminal width b (mm) | 0.2 | 0.25 | 0.3 |
| Terminal length L (mm) | 0.3 | 0.4 | 0.45 |

- The page does not label D2/E2 as the exposed pad. I read it as the exposed pad size (INFERENCE from the standard QFN drawing convention).
- Other nominal values A2 0.65, A3 0.08, A4 0.203, K 0.35 appear with no labels defined on the page.
- **Recommended PCB land pattern: NOT READ.** The mechanical page has no land pattern. Figure 1 (package drawing) is an image, NOT READ. Nordic points to reference layouts on the Downloads tab at https://www.nordicsemi.com/Products/nPM1300/Downloads, which returned 403 to my tools. The PCB guidelines page (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/hw_layout/ref_circuitry/frontpage.html-hw_layout) has only generic text: decouple the BUCK supply close to the supply pins, avoid long supply lines, use a minimum of two layers with a ground plane. "PCB layout example" (...frontpage.html-layout) lists Figures 7-11 (QFN top silkscreen, top, mid 1, mid 2, bottom) as images, NOT READ, and says "No components on the bottom layer."

### 1.3 Reference application circuit

Source: https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/hw_layout/ref_circuitry/frontpage.html-qfn32 ("Configuration 1", Table 2 Bill of material). Figure 1 "QFN schematic" is an image: NOT READ, so which designator sits on which net is NOT READ.

| Designator | Value | Description | Footprint |
|---|---|---|---|
| C1, C5 | 1.0 uF | X5R, 10 V, +/-10% | 0603 |
| C2, C3, C4, C7, C8, C9, C10, C11, C12 | 10 uF | X5R, 25 V, +/-20% | 0603 |
| C6 | 2.2 uF | X7R, 16 V, +/-10% | 0603 |
| C13 | 100 nF | X5R, +/-10% | 0201 |
| L1, L2 | 2.2 uH | DCR < 400 mOhm, +/-20% | 0806 |
| R1, R2 | "Dependent on bus speed and parasitic capacitances" | Optional TWI pull-ups, 0.05 W, +/-1% | 0201 |
| R3, R4 | See VSET table in 1.4 | Set BUCK1 and BUCK2 output voltages, 0.05 W, +/-1% | 0201 |
| U1 | nPM1300 | QFN32 or CSP35 | |

- Inductor current (saturation) rating: **NOT STATED** on any page I read. Only 2.2 uH, DCR < 400 mOhm, +/-20%, 0806.
- BUCK component selection and BUCK electrical specification pages (inductor and output capacitor requirements, dropout, current): NOT READ (page fetch failed).
- NTC value: **NOT READ.** Reference page says only "Configured"; the application page (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/application/frontpage.html-unique_1689778285) says "The NTC pin connects to an external NTC thermistor" and "Place the NTC thermistor with thermal coupling on the battery pack". Register names NTCCOLD/COOL/WARM/HOT and ADCNTCRSEL exist but the resistor/beta values were not on the pages read. A devzone staff post (see 1.8) suggested trying 10 kOhm as a stand-in for debugging; that is not a spec.
- Configuration summary, source https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/hw_layout/ref_circuitry/frontpage.html Table 1: Config 1 full (both BUCKs, both LDO/LOADSW, ship exit, charging, NTC, 3 LEDs, GPIO, TWI, VSET1 47 kOhm, VSET2 150 kOhm, VOUT1 1.8 V, VOUT2 3.0 V, VBUSOUT, VDDIO). Config 2 simple (one BUCK, VSET1 47 kOhm). **Config 3 "minimal" (no BUCKs, no NTC, no ship mode) still lists TWI as configured and Charging as available.**

### 1.4 VSET1 / VSET2 start-up voltage resistor tables

Source: https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/core_components/buck/doc/frontpage.html-output-voltage (read via WebFetch; I derived that anchor URL by pattern, and its content matches the EK user guide page https://docs.nordicsemi.com/r/bundle/ug_npm1300_ek/page/ug/npm1300_ek/vset.html). Resistor max tolerance stated as 5% (EK page; the reference BOM above says 1%).

| Resistor on VSETn | VOUT1 (BUCK1) | VOUT2 (BUCK2) |
|---|---|---|
| < 100 Ohm (grounded) | 0 V (BUCK OFF) | 0 V (BUCK OFF) |
| 4.7 kOhm | 1.0 V | 1.8 V |
| 10 kOhm | 1.2 V | 2.0 V |
| 22 kOhm | 1.5 V | 2.2 V |
| 47 kOhm | 1.8 V | 2.4 V |
| 68 kOhm | 2.0 V | 2.5 V |
| 100 kOhm | 2.2 V | 2.7 V |
| 150 kOhm | 2.5 V | 3.0 V |
| 250 to 500 kOhm | 2.7 V | 3.3 V |

- **1.8 V: BUCK1 with 47 kOhm on VSET1, or BUCK2 with 4.7 kOhm on VSET2.**
- **3.0 V: BUCK2 only, with 150 kOhm on VSET2. BUCK1 cannot reach 3.0 V through the resistor (maximum 2.7 V).**
- "The VSET[n] pins are effective only at start up." Do not leave VSETn floating. Output range overview: "Configurable output voltages between 1.0 V and 3.3 V" (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/core_components/buck/doc/frontpage.html). BUCK1 and BUCK2 outputs must not be tied together.

### 1.5 Charge current and termination voltage

- Both are configured over TWI. "The termination voltage, VTERM, is configured through TWI up to 4.45 V" and "Charge current is configured through TWI" (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/application/frontpage.html-unique_1440426601). There is no pin or resistor option on the QFN32 pin table.
- ICHG: 32 mA to 800 mA in 2 mA steps; "default value of 32 mA" (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/charger.html-charging-current). Charger must be disabled before changing BCHGISETMSB/LSB.
- VTERM default: **NOT STATED** (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/charger.html-termination-voltage points to registers BCHGVTERM / BCHGVTERMR). Electrical spec Table 7 range: 3.50 to 3.65 V and 4.00 to 4.45 V in 50 mV steps (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/charger.html-charger_el_spec).
- "Host software enables charging through register BCHGENABLESET." Charging starts when VBUS is present and higher than VBAT by VBUSVALIDR (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/charger.html-charging_cycle). The page does not say what happens with no host. INFERENCE: with no MCU writing over TWI, charging is not enabled.

### 1.6 Power-up defaults with no host

- BUCK: on/off by VSET pin, registers or GPIO. VSETn resistor present gives the BUCK enabled at that voltage at start-up; grounded VSETn leaves it disabled (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/core_components/buck/doc/frontpage.html-on-off-control). Registers BUCKnENASET/CLR override the default state.
- LDO / load switches: "OFF by default" (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/core_components/loadsw/doc/frontpage.html). LDO default voltage: NOT STATED.
- GPIO: default "input with weak pull-down" (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/core_components/gpio/doc/frontpage.html).
- VBUS input current limit default: 100 mA (IBUS100MA), up to 95 mA max in spec (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/vbusin.html-vbus-current-limiter and ...vbusin.html-el_spec Table 1). Raising it needs TWI (VBUSINILIM0).
- No OTP or retained registers: reset always returns the same state. Source: Nordic staff reply in https://devzone.nordicsemi.com/f/nordic-q-a/128419/npm1300-buck2-not-regulating-to-3-3-v-in-standalone-mode/567744 (forum post, not the spec). The same thread: a custom board with 300 kOhm on VSET2 for 3.3 V in standalone mode measured BUCK2 near 4.2 to 4.45 V with USB connected; thread is marked unanswered. Treat standalone (no-MCU) operation as unproven.
- POR/BOR: VBUSPOR 3.9 V, VBUSBOR 3.8 V, VBATPOR 2.75 V, VBATBOR 2.4 V (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/vbusin.html-el_spec and ...charger.html-charger_el_spec).

### 1.7 SHPHLD, ship mode

Source: https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/core_components/ship/doc/ship-mode.html and https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/application/frontpage.html-unique_639700645.

- Exit: "A push button to GND is required." Pull SHPHLD low for at least tshipToActive (numeric value NOT READ; electrical spec page fetch failed), or apply VBUS above VBUSPOR, or the wake-up timer (Hibernate only).
- Entry: write TASKENTERSHIPMODE over TWI (or TASKENTERHIBERNATE). Button hold time is set in SHPHLDCONFIG then TASKSHPHLDCFGSTROBE, and both must be done before entering. If VBUS is absent entry is immediate.
- "Ship mode is enabled at production time through the TWI interface." Application example text: "SHPHLD is connected to SW2 and is in the circuit to exit Ship mode." The schematic image is NOT READ, so the exact button/pull-up network is NOT READ. Any signal able to pull SHPHLD low for the required period can replace the button.
- SHPHLD internal pull values: NOT READ.

### 1.8 Absolute maximum, operating limits, VBUS and CC

- Abs max (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/abs_max_ratings/doc/abs_max_ratings.html, Table 1): VBUS -0.3 to 22 V; VBAT, VSYS, PVDD, VDDIO -0.3 to 5.5 V; analog pins incl. NTC, CC1, CC2, SHPHLD, LED0-2, LSIN/LSOUT, VSET1/2, VBUSOUT, VOUT1/2, SW1/2 -0.3 to 5.5 V; GPIO0-4, SDA, SCL -0.3 to VDDIO+0.3 V.
- Recommended operation (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/recommended_op_conditions/doc/recommended_op_conditions.html): VBUS 4.0 to 5.5 V; VBAT 2.3 to 4.45 V; VDDIO 1.7 V min, max = VSYS; TA -40 to +85 C.
- VBUS OVP threshold typ 5.5 V (SYSREG Table 1). Overview says "Overvoltage protection to 22 V".
- CC1/CC2: "If USB Type-C configuration is not used, CC1 and CC2 can be left floating or connected to ground." VBUS limit then stays 100 mA until the host changes it. Internal pull-downs Rd = 5.1 kOhm on CC1/CC2. Source: https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/vbusin.html-usb-port-detection and ...vbusin.html-el_spec.
- VBUS valid when VBUS - VBAT above 210 mV rising / 160 mV falling.

### 1.9 I2C (TWI), GPIO, VDDIO

- 7-bit address "110 1011" (= 0x6B, my conversion). 16-bit register addressing, 8-bit data. Source: https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/core_components/ctrl_reg/doc/frontpage.html.
- Bit rate 100 kbps to 1000 kbps; "I2C compatible up to 400 kHz"; supplied by VDDIO; page recommends tying VDDIO to a BUCK output. Pull-up values not specified (BOM says optional, depends on bus). Source: same page and ...ctrl_reg/doc/twi_elspec.html Table 1. VIH/VIL for SDA/SCL/GPIO: NOT READ.
- GPIO: 5 on QFN32 (GPIO0-4); 3 LED drivers (LED0-2, usable as open-drain outputs); supplied by VDDIO. Reference application: interrupt on GPIO1, RESET on GPIO0 (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/application/frontpage.html).

### 1.10 Built-in protections and currents

- Battery discharge current limit: IBATLIMLOW 200 mA, IBATLIMHIGH 1 A (registers BCHGISETDISCHARGE MSB/LSB 42/0 and 207/1), "not designed for accurate current limiting"; if exceeded VSYS falls below VSYSPOF and the device resets. Default level not stated. Source: https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/chapters/charger.html-discharge_current_limit.
- Battery under-voltage: VBATBOR 2.4 V reset; VBATLOW 2.1 V minimum VBAT for charging (below that charging needs BCHGVBATLOWCHARGE); trickle to constant-current at 2.9 V default. A configurable under-voltage cutoff (POF comparator, VSYSPOF threshold) exists but its values were NOT READ. Source: ...charger.html-charger_el_spec Table 7.
- Charger thermal: stop 110 C, resume 100 C (defaults); device thermal shutdown 120 C, 20 C hysteresis. Trickle timeout 10 min, charge timeout 7 h.
- Currents (https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/product_overview.html-sys-el-spec Table 2, typical): ship 370 nA; hibernate 500 nA; battery, all BUCKs/LDOs off 600 nA; one BUCK in auto mode 800 nA; both 1100 nA; one BUCK PWM 4.0 mA; both PWM 7.1 mA. VSYS max load 1.0 A battery only, 1.5 A with VBUS.
- BUCK rating: 200 mA each (key features page https://docs.nordicsemi.com/r/bundle/ps_npm1300/page/product_overview.html).

### 1.11 Price and stock, NPM1300-QEAA-R7 (read 2026-11-23)

| Seller | Qty 1 | Qty 100 | Stock | Notes | URL |
|---|---|---|---|---|---|
| DigiKey | $2.95 | $1.8133 | 8,579 | Active, 16 wk factory lead, cut tape/Digi-Reel/TR | https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-QEAA-R7/19722485 |
| Mouser (listing 949-NPM1300-QEAA-R, the "-R" suffix, not "-R7") | $2.99 | $1.83 | 6,574 | 8,000 more due 3/5/2027; 16 wk lead; reels of 4,000 $1.55 | https://www.mouser.com/ProductDetail/949-NPM1300-QEAA-R |
| Mouser R7 listing | NOT READ directly | NOT READ | NOT READ | The "-R" page said an "nPM1300-QEAA-R7" listing exists at $2.95 and is in stock; that is second-hand. | |
| LCSC C7501206 (R7) | $2.1406 | $2.0463 | 0 | JLCPCB Extended, 1500/reel | https://lcsc.com/product-detail/image/nPM1300-QEAA-R7_C7501206.html |

---

## 2. Analog Devices / Maxim MAX30101 (14-pin OESIP, 5.6 x 3.3 x 1.55 mm, 0.8 mm pitch)

Source for everything in this section unless stated: https://www.analog.com/media/en/technical-documentation/data-sheets/max30101.pdf (Rev 3, 6/20; read through text extraction).

### 2.1 Pin table

Section "Pin Description".

| Pin | Name | Function |
|---|---|---|
| 1 | N.C. | Not connected; tie to PCB pad for mechanical stability |
| 2 | SCL | I2C clock input |
| 3 | SDA | I2C data, bidirectional, open-drain |
| 4 | PGND | Power ground for LED driver blocks |
| 5, 6, 7, 8 | N.C. | Not connected; tie to PCB pad for mechanical stability |
| 9, 10 | VLED+ | LED supply (anode); bypass to PGND |
| 11 | VDD | Analog supply input; bypass to GND |
| 12 | GND | Analog ground |
| 13 | INT | Active-low interrupt, open-drain; needs external pull-up |
| 14 | N.C. | Not connected; tie to PCB pad for mechanical stability |

### 2.2 Supply, I/O and sequencing

- VDD 1.7 V min / 1.8 V typ / 2.0 V max. Abs max VDD -0.3 to +2.2 V (Absolute Maximum Ratings).
- VLED+ for red and IR: 3.1 V min / 3.3 typ / 5.0 V max. **VLED+ for the green LED: 4.5 V min / 5.0 typ / 5.5 V max** (Electrical Characteristics). Abs max VLED+ to PGND -0.3 to +6.0 V.
- I2C address: 7-bit 1010111, write 0xAE, read 0xAF (7-bit value 0x57 is my conversion).
- Digital inputs SCL/SDA: VIH min 0.7 x VDD, VIL max 0.3 x VDD, hysteresis 0.5 x VDD; VOL 0.4 V max at 3 mA.
- Pin voltage abs max: "all other pins to GND" (includes SDA, SCL, INT) -0.3 V to +6.0 V. INT may be pulled up to an external supply "up to +5 V from GND."
- **Can SDA/SCL/INT be pulled to 3.0 V with VDD = 1.8 V?** The datasheet has no sentence saying so for SDA/SCL. It does allow INT pull-up to 5 V and rates every pin to 6 V against GND. INFERENCE: with the 6 V rating, a 3.0 V pull-up is within abs max, and the VIH threshold would be 0.7 x 1.8 = 1.26 V (calculated). The typical circuit shows a 1 kOhm pull-up to a rail labelled "VDDIO" with no voltage given. I did not find a statement about leakage into the pin with the pull-up above VDD.
- Sequencing: power VDD first, then VLED+. I2C and INT may be pulled up before power is applied. PWR_RDY interrupt after VDD rises above UVLO. On power-down any order is tolerated.
- Decoupling (text): at least 1 uF on VLED+, close to the IC, low ESR. Typical circuit figure labels 10 uF, 0.1 uF, 4.7 uF, 0.1 uF but the figure-to-pin mapping is NOT READ. VLED+ supply drawn as +5.0 V (200 mA), VDD +1.8 V (20 mA). SDA pull-up "typically greater than 500 Ohm"; INT example 4.7 kOhm.
- Shutdown: SHDN bit (register 0x09 bit 7). ISHDN 0.7 uA typ, 2.5 uA max at 25 C. Registers retained.
- Supply current: IDD 600 uA typ, 1100 uA max (SpO2/HR or IR-only mode, 215 us pulse width, 50 sps). The datasheet gives no table of supply current versus LED current or sample rate, so "average supply current for one green LED at 50-100 sps" is **NOT in the datasheet**.
  - Calculation only (not a datasheet value): LED charge per sample = current x pulse width. At 25 mA and 215 us the charge per sample is 5.375 nC; at 100 sps that is 0.54 uA average on VLED+. At 50.0 mA it doubles. Pulse width options: 69, 118, 215, 411 us. LED current steps about 0.2 mA, 0x0F about 3.0 mA, 0x3F about 12.6 mA, 0x7F about 25.4 mA, 0xFF about 51.0 mA (register description). Whether the 600 uA IDD includes the LED current: NOT READ.
- Green LED (50 mA, 25 C): 530-545 nm (537 typ), forward voltage 3.3 V typ, radiant power 17.2 mW. Programmable LED current 0 to 50 mA. Maximum LED current abs max: not stated.

### 2.3 Cover glass, optics

- Module is an OLGA with integrated cover glass, hydrolytic class "HGB 1" (value column unreadable). Not sealed against dust or liquid; install last, no liquid cleaning, bake or coating. Datasheet points to Application Note 6381 as handling guide.
- AN6381 = "Organic Land Grid Array (OLGA) and Its Applications", https://www.analog.com/en/design-notes/organic--land-grid-array-olga-and-its-applications.html. Key numbers: NSMD pads recommended; Type 3 or finer no-clean paste; stencil 100 um, aperture 25 um smaller per side than pad; Pb-free peak 260 C, time above 217 C 60-150 s; MSL3, bake 125 C 48 h if card pink; flux cleaning not recommended; vent holes must not be blocked by solder or flux. The note's page does not name the MAX30101 or MAX30102 (related products listed are MAX86160 and MAXM86161), so applicability is "referenced by the datasheet, not confirmed on the note".
- Window design numbers are NOT in the MAX30101 datasheet. Closest ADI document: https://www.analog.com/en/resources/technical-articles/guidelines-for-the-optomechanical-integration-of-heartrate-monitors-in-wearable-earbud-devices.html. It covers MAX86160/MAXM86161, not MAX30101. Numbers there: cover transmission above 90% at the operating wavelengths, keep glass thin (simulated 0.2 to 1.0 mm), air gap sensor to cover not above 0.8 mm (simulated 0.1 to 1.5 mm), absorptive ink on the cover where light reflects back, no aperture sizes given.

### 2.4 Land pattern vs MAX30102 / KiCad

- Both datasheets give: package 14 OESIP, outline 21-1048, **land pattern 90-0602**, 5.6 x 3.3 x 1.55 mm, 0.8 mm pitch. MAX30101 package code F143A5+1; MAX30102 package code F143A5MK+1 (https://www.analog.com/media/en/technical-documentation/data-sheets/max30102.pdf). The MAX30102 pin table read the same as the MAX30101 table above for pins 1-14 (N.C. on 1, 5, 6, 7, 8, 14; VLED+ on 9 and 10 in both).
- So the drawings cited are the same number; I could not read the drawing itself (NOT READ), so the pad geometry is not verified by me.
- KiCad footprint `Maxim_OLGA-14_3.3x5.6mm_P0.8mm`: **not confirmed.** The KiCad Package_LGA footprint list at https://kicad.github.io/footprints/Package_LGA showed 25 footprints and none named Maxim_OLGA-14; the gitlab raw file fetch was refused by robots rules. The name may exist in a different library or a newer release; I could not check.
- Availability: LCSC C2859066 MAX30101EFD+T, OLGA-14, 53 in stock, starting price $5.2405 (page metadata), Basic/Extended tag not shown (https://www.lcsc.com/product-detail/C2859066.html).

---

## 3. ST LIS2DH12 (LGA-12, 2 x 2 x 1.0 mm max)

Source: ST datasheet DocID025056 Rev 6 (copy at https://cdn.sparkfun.com/assets/a/e/e/3/9/lis2dh12_datasheet.pdf; the st.com copy https://www.st.com/resource/en/datasheet/lis2dh12.pdf gave the same pin table). Section 1.2 "Pin description", Table 2, page 9/53.

### 3.1 Pin table

| Pin | Name | Function |
|---|---|---|
| 1 | SCL / SPC | I2C serial clock / SPI serial port clock |
| 2 | CS | SPI enable; I2C/SPI mode select: 1 = SPI idle mode / I2C communication enabled, 0 = SPI communication mode / I2C disabled |
| 3 | SDO / SA0 | SPI serial data output / I2C least significant bit of device address. Internally pulled up (Table 3: 54.4 kOhm at Vdd_IO 1.7 V, 49.2 at 1.8, 30.4 at 2.5, 20.4 at 3.6) |
| 4 | SDA / SDI / SDO | I2C data / SPI data in / 3-wire interface data out |
| 5 | RES | Connect to GND |
| 6 | GND | 0 V supply |
| 7 | GND | 0 V supply |
| 8 | GND | 0 V supply |
| 9 | Vdd | Power supply |
| 10 | Vdd_IO | Power supply for I/O pins |
| 11 | INT2 | Interrupt pin 2 |
| 12 | INT1 | Interrupt pin 1 |

Ties: **CS (pin 2) to Vdd_IO for I2C** ("When using the I2C, CS must be tied high"); RES (pin 5) to GND; SA0 (pin 3) to GND for address 0x18, to Vdd_IO for 0x19 (it has an internal pull-up, so a floating SA0 reads as 1); pins 6, 7, 8 to GND.

### 3.2 Addresses, supply, current

- Slave address 001100x (Table 16). SA0 = 0: write 0x30, read 0x31 (7-bit 0x18). SA0 = 1: write 0x32, read 0x33 (7-bit 0x19). The 7-bit values are the datasheet's 0011000b / 0011001b.
- Vdd 1.71 to 3.6 V (2.5 V typ); Vdd_IO 1.71 V to Vdd + 0.1 V (Table 6). Vdd may be removed while Vdd_IO stays up without blocking the bus. Vdd and Vdd_IO must both be present for normal behavior.
- Logic levels (Table 6): VIH min 0.8 x Vdd_IO, VIL max 0.2 x Vdd_IO.
- Decoupling (text near Figure 5): 100 nF ceramic and 10 uF "aluminum" placed as near as possible to pin 9. The figure label placement is only partly legible.
- Current, Table 12 (low-power / normal / high-res): 1 Hz 2/2/2 uA; **10 Hz 3/4/4 uA; 25 Hz 4/6/6 uA; 50 Hz 6/11/11 uA**; 100 Hz 10/20/20 uA. Power-down 0.5 uA typ (Table 6, IddPdn).
- Package: Figure 12 (viewed): length 2.00 +/-0.15, width 2.00 +/-0.15, height 1.0 max. The bottom-view pad dimensions (0.5 pitch marks, 0.275, 0.1, 0.25) are too small to read reliably in the render: land pattern and pad sizes NOT READ. The datasheet gives no recommended land pattern.

---

## 4. Sharp LS013B7DH03

Source: Sharp spec LCP-1112045 (https://cdn.sparkfun.com/assets/d/e/8/9/7/LS013B7DH03_datasheet.pdf). Page numbers below are Sharp's own page labels.

### 4.1 FPC pin table (Table 4, page 9)

| Pin | Code | I/O | Level | Signal |
|---|---|---|---|---|
| 1 | SCLK | I | 0/3.0 V | Serial clock |
| 2 | SI | I | 0/3.0 V | Serial input |
| 3 | SCS | I | 0/3.0 V | Chip select |
| 4 | EXTCOMIN | I | 0/3.0 V | COM inversion polarity input |
| 5 | DISP | I | 0/3.0 V | Display ON/OFF (memory is kept; L = all white) |
| 6 | VDDA | I | 3.0 V | Analog supply |
| 7 | VDD | I | 3.0 V | Logic supply |
| 8 | EXTMODE | I | 0/3.0 V | COM inversion mode select |
| 9 | VSS | I | 0 V | Logic ground |
| 10 | VSSA | I | 0 V | Analog ground |

### 4.2 Connector, FPC (Section 8, page 23)

- Recommended connectors printed on the outline page: SMK FP12 series CFP-4610-0150F (bottom side contact); Molex 51441-1093 (bottom side contact); SMK FP12 series CFP-4510-0150F (top side contact).
- FPC bend: recommended bend area 0.8 to 6.0 mm from glass edge; minimum inner bend radius R0.45; bend 3 times or fewer; do not bend toward the polarizer side. FPC stiffener width 5.5 +/-0.05 (drawing).
- **FPC pitch and FPC thickness: NOT READ** (not in the text and not dimensioned in the outline drawing that I viewed). Which face of the FPC carries the exposed fingers: NOT READ from the drawing; only the connector list above ("bottom side contact" vs "top side contact") is stated.

### 4.3 Electrical (pages 11-15)

- Abs max: VDDA, VDD -0.3 to +3.6 V (also applies to EXTMODE); inputs up to VDD; storage -30 to +80 C; operating (panel surface) -20 to +70 C.
- Recommended: VDDA 2.7 / 3.0 / 3.3 V; VDD 2.7 / 3.0 / 3.3 V; VIH min VDD - 0.1 V; VIL max VSS + 0.1 V.
- EXTMODE: H = EXTCOMIN signal enabled (connect EXTMODE to VDD); L = serial input flag (M1) enabled (connect EXTMODE to VSS) (Remark 4-1).
- **EXTCOMIN frequency 54 to 65 Hz** (Table 6-3-2), high width 2 us min, setup 5 us, hold 0 us. COM frequency 27 to 32.5 Hz. Frame frequency (fSCS) 54 to 65 Hz. Note "(*1) make the EXTCOMIN frequency less than the frame rate frequency". The power consumption test, however, uses fSCS = 1 Hz.
- **SCLK**: 1 MHz typ, 1.1 MHz max; SCLK high and low width 404.55 ns min, 450 ns max.
- **SCS is active high**: data-update and display-mode frames are clocked while SCS is high. SCS high width 153.45 us min in data update mode, 22.55 us in display mode; SCS low width 6 us min; SCS setup tsSCS 6 us; hold thSCS 2 us. SI setup 227 ns, hold 525 ns (Table 6-3-2, page 14).
- Modes (page 16-19): 3-bit mode select M0 M1 M2 then 5 dummy clocks; data update mode M0 = H, then 8-bit gate line address, 128 data bits, 16 transfer clocks; display mode M0 = L; all clear M0 = L, M2 = H. Data: L = black, H = white.
- Power-on sequence (Section 6-2, Figure 6-1, page 13): 3 V rise; pixel memory initialisation using the all-clear flag (at least once, 16 clocks plus hold) or one full white frame; T3 at least 30 us DISP latch release; T4 at least 30 us COM polarity init; when DISP and EXTCOMIN start together allow 30 us or more before SCS starts. Power-off: pixel memory clear, T6 at least 30 us, then 3 V falls. The Figure 6-1 waveform order of DISP and EXTCOMIN is only partly read.
- Recommended bypass (Figure 9-1, page 24): C1 DISP to VSS 0.1 uF B-characteristic ceramic; C2 VDDA to VSS 0.1 uF or more; C3 VDD to VSS 1 uF or more (B characteristic ceramic).
- Power: 12 uW typ / 50 uW max static; 50 uW typ / 130 uW max at 1 Hz update (3 V, 1 MHz SCLK).

### 4.4 Mechanical and optical

- Active area 23.04 x 23.04 mm; 128 x 128 dots; dot pitch 0.18 mm; diagonal 3.259 cm (1.28 in).
- Module outline (Table 3 and drawing): **26.6 (W) x 30.3 (H) x 0.741 (D) mm** (drawing: 26.60 +/-0.2 x 30.30 +/-0.2; total thickness 0.741 +/-0.11). Mass 1.2 g.
- Transflective type; transmission about 0.2%; reflectance typ 18%, contrast ratio typ 18 (min 14).
- Light shield: the gate driver outside the active area must be shielded from light (Precautions (7)).

### 4.5 Lifecycle and availability, checked 2026-11-23

| Channel | Status read | Stock | Price | URL |
|---|---|---|---|---|
| Sharp (sharpsde.com memory LCD product table) | Listed (1.28 in, 128 x 128, -20 to 70 C); the page has no status column and I found no EOL, NRND or PCN notice. This is absence of a notice, not a confirmation of "active". | n/a | n/a | https://www.sharpsde.com/products/displays/memory-lcd/ |
| DigiKey 425-2903-ND | Part Status: Active, no obsolescence banner | 33,493 | $12.39 (1), $7.9728 (100), tray, 28 wk lead | https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/5300387 |
| Mouser 852-LS013B7DH03 | **"Obsolete"**; "Restricted Availability"; "Mouser does not presently sell this product in your region"; tray, factory pack 2240; no price or stock shown; a page error also appeared | not shown | not shown | https://www.mouser.com/en/ProductDetail/Sharp-Microelectronics/LS013B7DH03?qs=La0%252B8xZSm19d3Mbp4mkNrQ%3D%3D |
| Octopart aggregate | "Production (Last Updated: 3 weeks ago)", introduced 2020-05-07; DigiKey shown 35,743 in stock (matches the "35,736" in the earlier research note); Future, Avnet, Arrow 0 stock | | | https://octopart.com/part/sharp/LS013B7DH03 |

Resolution of the conflict: both statements are real; they are different channels. DigiKey (today 33,493, earlier 35,7xx, so stock is falling slowly) lists it Active. Mouser's page says Obsolete with no stock and no sale in my region. I could not find any Sharp notice that explains Mouser's flag, so the cause (Mouser stock-out, regional restriction, or a real end-of-life) is NOT RESOLVED. Treat availability as DigiKey-only today.

---

## 5. Azumo 11049-06_A1 (front light for LS013B7DH03)

### 5.1 What it is

- Azumo web page (https://www.azumotech.com/products/1-28-monochrome-display-11049-06/) markets "1.28 in Monochrome Display 11049-06": Sharp LS013B7DH03 combined with Azumo's front light panel bonded below the cover glass.
- DigiKey for **11049-06_A1** (https://www.digikey.com/en/products/detail/azumo/11049-06-A1/9602607): DigiKey Part 2004-11049-06_A1-ND; category Optoelectronics Accessories; "Accessory Type: Optical Film"; description "GRAPHIC DISPLAY FILM - 1.28"" / "Optical Film 1.28" Sharp LS013B7DH03 Display"; "For Use With: 1.28" Sharp LS013B7DH03 Display". Part Status Active, tray, 32 wk lead, **247 in stock**, **$47.87 (1), $39.40 (10), $34.5147 (100)**. Linked datasheet is the front-light-panel one (5.3).
- My conclusion from those two read facts: the DigiKey SKU is listed as the film (front light panel) that goes on a Sharp display you buy separately, not a display plus film. NOT RESOLVED beyond that, since DigiKey's attribute table was only partly returned and Azumo's page and module datasheet describe the combined module. Ask Azumo or DigiKey before buying whether the LCD is included.
- Front light is "bonded" per Azumo but "designed to laminate to the front surface" per the FLEx datasheet. The film is 0.05 mm thick (both documents).

### 5.2 Module datasheet (Azumo "1.28 Reflective B&W LCD 2.0", 11049-06 Product Data Sheet, preliminary, latest update 04/24/2024)

URL: https://pages.azumotech.com/hubfs/Data%20Sheets/1.28%2011049-06%20Data%20Sheet.pdf (one page, read from a render; the text layer is empty).

| Item | Value |
|---|---|
| Sharp P/N | LS013B7DH03 |
| Resolution / active area | 128 x 128 / 23.04 x 23.04 mm |
| PPI | 141 (the Azumo web page says 136; 25.4/0.18 mm = 141, my arithmetic) |
| Product outline | **27.46 mm (W) x 30.3 mm (H)** |
| Display thickness | **1.16 mm** |
| Display power | 12 uW static, 50 uW at 1 Hz update |
| Display supply | 3.0 V analog and 3.0 V logic |
| Interface | SPI |
| **Front light supply voltage** | **3.0 V** |
| **Front light power** | **6 to 75 mW**; brightness typ 51 nits at 60 mW |
| Contrast ratio (native LCD) | 18 |
| Storage / operating temperature | -30 to 80 C / -20 to 70 C |

### 5.3 Front-light panel datasheet (FLEx Lighting, 12367-01_T5, 2020)

URL: https://www.azumotech.com/uploads/2020/03/12367-01_T5_Sharp-1.28_11049-xx_FLP-Data-Sheet.pdf (two pages, read from renders). 11049-06 is shown as "PRELIMINARY", flat-roll tail.

- LED electrical (Electrical table, page 2): forward current IF 5 mA typ, 25 mA abs max; pulse forward current IFP 80 mA abs max; reverse voltage VR 5 V abs max. **Forward voltage: not tabulated.** A forward-current vs forward-voltage plot is on page 2 with axes 2.0 to 4.5 V; I could only eyeball it (the 10 mA point sits near 3 V, accuracy about 0.2 V), so treat Vf as NOT READ precisely. With the module's stated 3.0 V supply, a series resistor or constant-current drive is therefore needed; the datasheet shows no resistor.
- Connection: the light source is a single LED on the film's tail with two contacts, "POSITIVE CONTACT (+)" and "NEGATIVE CONTACT (-)". Tail contact drawing: **1.00 mm pitch**, contacts 0.80 mm wide, spacing dimensions 3.32 and 2.49 mm. Which pad is which relative to the tail's orientation: NOT READ with confidence.
- Connector: no single part number. The datasheet lists "Example ZIF Connectors": Molex 503480-0400, 52745-0497, 54550-0471, 54548-0471 (bottom), 505110-0492. Which of these fit a two-contact 1.00 mm tail: NOT READ.
- Dimensions on the FLP drawing (variants -01, -03, -06 share the page): film about 32.0 mm long; thickness dimensions 0.96, 1.9, 3.1 mm appear for different variants; the 11049-06 outline dimensions are NOT READ separately.
- Optical for 11049-03 (Sharp + front light): contrast ratio 14 with front light on; viewing angles 60/30 (V) and 65/65 (H).

---

## 6. Boost converters for 5.0 V at up to 60 mA from a 3.0 to 4.2 V cell

### 6.1 Aerosemi MT3608 (SOT-23-6)

Source: https://atta.szlcsc.com/upload/public/pdf/source/20231108/A2E6FFA724546D8334EF0FC1E6740EDE.pdf (LCSC-hosted datasheet). **This document is titled MT3608B Rev1.1 (2011); the LCSC listing is for MT3608.** I could not open https://www.lcsc.com/datasheet/C84817.pdf. Differences between MT3608 and MT3608B were not verified.

| Pin | Name | Function |
|---|---|---|
| 1 | SW | Power switch output (MOSFET drain) |
| 2 | GND | Ground |
| 3 | FB | Feedback input, 0.6 V |
| 4 | EN | On/off control input |
| 5 | VIN | Input supply, bypass locally |
| 6 | NC | No connect |

- Feedback voltage 0.588 / 0.6 / 0.612 V (min/typ/max). Formula VOUT = VREF x (1 + R1/R2) with VREF 0.6 V (the equation text was garbled; formula as the document describes it).
- VIN 2.5 to 24 V; output up to 24 V; switch current limit 4 A (VIN 5 V, 50% duty).
- EN high 1.5 V, low 0.4 V (listed without min/max labels). "A high input at EN turns on the converter, and a low input turns it off."
- Shutdown current (VEN = 0 V) 0.1 uA typ, 1 uA max. Quiescent PFM (no switching) 70 uA typ, 150 uA max; PWM 1.0 mA typ, 2.0 mA max.
- Application circuit (Figure 1): L 4.7 uH (text recommends 4.7 to 22 uH), CIN and COUT 22 uF ceramic X5R/X7R, R1 110 kOhm and R2 15 kOhm (gives about 5 V by my arithmetic and per the figure), Schottky diode with reverse breakdown above VOUT, no part number.
- **Does the output stay connected to the input through the diode when disabled?** NOT stated in the datasheet. INFERENCE (not read): Figure 1 uses the standard boost topology with the inductor from VIN to SW and a Schottky from SW to VOUT, which leaves a DC path VIN to VOUT when EN is low. No load disconnect is described anywhere in the text I read.
- LCSC C84817: stock 59,283, starting price $0.0814 (page metadata, no breaks), https://www.lcsc.com/product-detail/C84817.html. JLCPCB: **Extended** (https://jlcpcb.com/partdetail/C84817), stock and price breaks not shown.

### 6.2 TI TPS61099 family

Source: https://www.ti.com/lit/gpn/TPS61099 (SLVSD88).

- Fixed 5.0 V version: **TPS610997** (device comparison table, Section 4). Other fixed versions: 610996 4.5 V, 610995 3.6 V, 610994 3.3 V, 610993 3.0 V, 610992 2.5 V, 610991 1.8 V (preview). TPS61099 is the adjustable part.
- Packages: **DSBGA-6 (YFF) 1.23 x 0.88 mm and WSON-6 (DRV) 2 x 2 mm only; no SOT-23-6.**
- Pins (Table 5-1): VIN A1 / 6; SW B1 / 5; EN C1 / 4; GND A2 / 1; VOUT B2 / 2; FB C2 / 3; PowerPAD (DRV) 7 to GND (YFF / DRV). FB is connected to GND for fixed versions. EN must not float.
- **True load disconnect: yes.** "True disconnection during shutdown"; Section 7.3.3 says the rectifying PMOS fully turns off, giving complete disconnection between input and output.
- Currents (Section 6.5, TJ -40 to 85 C): IQ into VIN 0.4 uA typ, 1.1 max; IQ into VOUT 0.6 typ, 1.5 max; shutdown into VIN 0.5 uA typ, 1.6 max (VIN 3.7 V, VOUT 0 V).
- VIN 0.7 to 5.5 V; VOUT 1.8 to 5.5 V; switch current limit 0.8 / 1 / 1.25 A (min/typ/max) when VOUT is 2.5 V or more. Fixed 5.0 V accuracy 4.90 / 5.00 / 5.10 V in PWM. Adjustable VREF 1.00 V (0.98 to 1.02); formula VOUT = VREF x (1 + R1/R2) (equation garbled in extraction; example R1 1 MOhm, R2 249 kOhm gives 5.02 V by my arithmetic).
- Components: L 2.2 uH nominal (range 0.7 to 2.86 uH); Table 8-2 inductors for VOUT above 3 V: Wurth 74404024022 (2.2 uH, Isat 1.95 A, DCR 80 mOhm, 2.5 x 2.0 x 1.2), muRata LQH2HPN2R2MJR (1.7 A, 92 mOhm), TDK VLS201610Cx-2R2M (1.45 A, 163 mOhm). CIN 10 uF normally recommended; COUT min 20 uF effective (nominal range column 10/20/100 uF); example capacitor GRM188R60J106ME84D.
- LCSC / JLCPCB: TPS610997YFFR **C2072359**, DSBGA-6, 642 in stock, starting price $0.6409 (page metadata) (https://www.lcsc.com/product-detail/C2072359.html). JLCPCB lists the YFFT variant C1848519 as **Extended** (https://jlcpcb.com/partdetail/TexasInstruments-TPS610997YFFT/C1848519). Adjustable TPS61099DRVR C2842395, WSON-6, out of stock, from $0.7866. I found no LCSC listing for TPS610997DRVR (the search showed TPS610995DRVR C2071098 only, which is the 3.6 V part). Basic/Extended for C2072359 and C2842395 not shown.

### 6.3 TI TPS61023

Source: https://www.ti.com/lit/gpn/TPS61023.

- Only one orderable variant read: TPS61023DRLR, **adjustable only** (no fixed 5 V part). SOT563 (DRL) 6-pin, 1.20 x 1.60 mm.
- Pins: 1 FB, 2 EN, 3 VIN, 4 GND, 5 SW, 6 VOUT.
- True disconnect: yes. "True disconnection between input and output during shutdown"; Section 7.3.2: in shutdown "The output is disconnected from input power supply."
- Currents (Section 6.5): IQ into VIN 0.9 uA typ, 3.0 max; IQ into VOUT 20 uA typ, 30 max; shutdown ISD 0.1 uA typ, 0.2 max (VIN = 3.6 V, 25 C).
- VIN 0.5 to 5.5 V; VOUT 2.2 to 5.5 V; valley current limit 2.7 A min, 3.7 A typ. VREF 580 / 595 / 610 mV (PWM). Formula VOUT = VREF x (1 + R1/R2) (equation garbled; Section 8.2.2.1 recommends R2 below 300 kOhm). EN high 1.2 V, low 0.35 to 0.45 V.
- Components: L 1.0 uH nominal (0.37 to 2.9 uH); Table 8-2 1 uH parts: Coilcraft XEL4030-102ME (Isat 9.0 A, 4.0 x 4.0 x 3.1 mm), Wurth 74438357010 (9.6 A, 4.1 x 4.1 x 3.1), Cyntec HBME042A-1R0MS-99 (7.0 A, 4.1 x 4.1 x 2.1). CIN effective 1.0 to 4.7 uF per Section 6.3 (Section 8.2.2.5 says 10 uF; inconsistent in the datasheet); COUT effective 4 to 1000 uF (10 uF nominal); Figure 8-1 uses 10 uF in and 2 x 22 uF out.
- LCSC **C919459** TPS61023DRLR SOT-563: stock 134,550, starting price $0.1141 (page metadata) (https://www.lcsc.com/product-detail/C919459.html). JLCPCB: **Extended** (https://jlcpcb.com/partdetail/TexasInstruments-TPS61023DRLR/C919459); stock and price breaks not shown. Another listing: TPS61023DRLT C1852149 (not read).

### 6.4 Summary of the three for a switched 5 V / 60 mA LED rail

| Part | Fixed 5 V | Load disconnect | Shutdown current (typ/max) | Package | LCSC | JLC class |
|---|---|---|---|---|---|---|
| MT3608 (read from MT3608B sheet) | No, FB divider 110k / 15k | Not stated (inferred none) | 0.1 / 1 uA | SOT-23-6 | C84817 | Extended |
| TPS610997 | Yes | Yes | 0.5 / 1.6 uA | DSBGA-6 1.23 x 0.88 mm (YFF); WSON-6 2 x 2 (DRV) per datasheet | C2072359 (YFFR) | Extended (YFFT) |
| TPS61023 | No, FB divider | Yes | 0.1 / 0.2 uA | SOT563 1.2 x 1.6 mm | C919459 | Extended |
