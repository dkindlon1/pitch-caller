# RF review: Raytac MDBT50Q-1MV2 integration, PitchIQ watch rev B

Reviewer scope: antenna keep-out, stack-up detuning, FCC modular conditions, radiated test plan, BLE link parameters.
Method: `pcbnew` read-only on `kicad/pitchiq_watch.kicad_pcb` (origin 100,80 mm subtracted; all coordinates below are board mm, y down), plus Raytac spec Ver.K, FCC exhibits, Zephyr `.config` of `/home/claude/zws/build_pitchiq/app/zephyr/.config`. Nothing was edited, built, or measured on hardware. Everything labelled "estimate" is engineering judgement, not a measurement or a published figure.

## 0. Measured geometry

| Item | Value |
|---|---|
| Board | 32.0 x 36.0 mm, 3 mm corner radius, 6 copper layers |
| U1 centre / rotation | (16.0, 8.4), 0 deg, F.Cu; antenna end faces the top (y = 0) board edge |
| U1 body (F.Fab) | x 10.7..21.3, y 0.6..16.2 (10.5 x 15.5 mm, matches datasheet) |
| Antenna section of the module | y 0.6..4.1 (first pad row at y 4.65; Raytac figure: antenna end = 3.8 mm, i.e. to y 4.4) |
| Distance antenna end to board top edge | 0.6 mm (no overhang; module is inside the outline) |
| Distance module sides to left/right board edge | 10.7 mm each (module centred) |
| Keep-out rule area | x 6..26, y -1..4.0, all 6 layers, no copper/tracks/vias (gen_pcb.py:105-109), 20.0 mm wide = module + 4.75 mm each side |
| Battery drawing (Dwgs_User, gen_pcb.py:116) | x 6.1..25.9, y 8.5..34.5 |
| LCD drawing (Cmts_User, gen_pcb.py:117) | x 2.7..29.3, y 2.85..33.15, "position is a proposal" |

Copper actually present in the antenna end (rasterised at 0.5 mm, fills included; independent of check_antenna.py):

| Layer | x 6..26, y < 4.0 | Fill edge near the module |
|---|---|---|
| F.Cu | empty | GND fill reaches y 4.2 at x < 9.75 and x > 22; between x 10..22 it starts at y ~4.4 (pad row) |
| In1 GND | empty | solid across the full width from y 4.4 (under pads 1/55), matches Raytac figure |
| In2 | empty (no fill zone on this layer) | no track at y < 4.9 |
| In3 | empty | no track at y < 4.9 |
| In4 3V0 plane | empty | solid from y 4.4 |
| B.Cu GND | empty | solid from y 4.4 |

So the strip itself is clean on all 6 layers (confirms check_antenna.py). Left and right of the strip (x < 6 and x > 26, y 0.3..4) there is GND/3V0 copper on F, In1, In4, B at the same y as the antenna.

Everything within 5 mm of the antenna section (box x 10.7..21.3, y 0.6..4.1), nearest first (distance = box to box/pad):

| Distance | Item |
|---|---|
| 0.60 mm | F.Cu GND stubs (11.1,4.8)-(11.1,5.0) and (20.6,4.8)-(20.6,5.0) from module pads 1 and 55 |
| 0.65 mm | GND vias (11.1,5.0) and (20.6,5.0), 0.25 mm drill |
| 1.25 mm | GND via (11.8,5.6) |
| 1.45 mm | SWDCLK via (21.1,5.8) and F.Cu/In2 track (21.1,5.8)-(21.1,7.5) |
| 2.03 mm | U4 LIS2DH12 body (x 23.08..25.88, y 5.08..7.88); nearest pad U4.1 (I2C_SCL) 2.83 mm |
| 2.3 mm | In3 ACC_INT track (24.5,6.5)-(21.4,9.6) |
| 2.4-2.6 mm | I2C_SCL via (23.5,5.7) + F.Cu/In2 tracks |
| 2.5-3.1 mm | SWDIO F.Cu track (20.9,6.7)-(21.7,7.3), via (21.7,7.3); B.Cu SWDIO (21.7,7.3)-(21.7,9.8) at 3.1 mm |
| 3.0-3.3 mm | 3V0 tracks/via around U4 pins 2/3 |
| 3.45 mm | FL_PWM via (20.6,7.8) and In2 track |
| 3.83 mm | BT1 footprint (battery pads); pad BT1.2 (GND, 6.2,8.4) is 4.56 mm, BT1.1 (3.0,8.4) > 5 mm |
| 4.66 mm | C13 (24.6,8.6) |
| 4.5-5 mm | LCD_DISP via (21.1,9.0), SWDCLK In2 (22.5,8.9)-(22.5,12.1), U4 pins 5-10 |
| 5.33 mm | Q1 (just outside) |
| 6.7 mm | TP7 (1V8, bottom) |
| 7.0 mm | D3 (TVS) |
| 7.9 mm | TP6 (3V0, bottom) |
| 8.1 mm | JP1 |
| 7.9 mm | SW1 (metal tact switch) |

No bottom-side pad, track or component other than the vias/tracks listed lies within 5 mm. The five cradle pads are at y 28.5, far away.

Module ground stitching (vias within 2 mm of each GND pad): pad 1: two vias (0.43, 1.05 mm); pad 2: two (shared); pad 15: one at 0.47 mm; pad 33: one at 0.46 mm; pad 55: one at 0.35 mm. Total 7 GND vias within the module outline region, all 0.25 mm drill.

Signals under the module body (x 10.7..21.3, y 0.6..16.2): In2 carries FL_PWM 11.9 mm, LCD_DISP 9.9 mm, VIB 3.6 mm, 5V_LED 2.9 mm, SWDIO 2.2 mm, SWDCLK 2.0 mm; In3 carries ACC_INT 10.3 mm, NRESET 5.5 mm, LCD_CS 5.2 mm, XL2 1.0 mm, EXTCOMIN 0.8 mm; B.Cu carries VBAT 10.3 mm, 5V_LED 5.1 mm, SWDIO 4.8 mm, HR_INT 3.5 mm. In the antenna end (y < 4.4) there is no In2/In3 copper at all.

## 1. Raytac guidance (quoted)

Source: Raytac MDBT50Q-1MV2 / P1MV2 spec Ver.K, section 2.3 "RF Layout Suggestion (aka Keep-Out Area)", pages 13-15: https://cdn.sparkfun.com/assets/4/7/4/3/8/_nRF52840__MDBT50Q-1MV2___MDBT50Q-P1MV2_Ver.K_spec.pdf
- "Make sure to keep the 'No Ground Pad' as wider as you can regardless of the size of your PCB."
- "No Ground Pad should be included in the corresponding position of the antenna in EACH LAYER."
- "Place the module towards the edge of PCB to have better performance than placing it on the center."
- Figures (p.13-14): No-Ground-Pad area is 3.8 mm tall (the antenna section of the 15.5 mm module), top and bottom layers; the drawn strip spans roughly the whole PCB width. I measured that off the page-13 picture: strip about 3x the 10.5 mm module width, i.e. about 30 mm, so roughly 10 mm of clear strip each side of the module. These numbers are scaled from an image, not printed.
- p.14: "Please add via holes in GROUND area as many as possible, especially around the four corners."
- No printed numbers for overhang, corner distance, minimum ground plane size, or distance to batteries/metal. I found no separate Raytac application note; the Raytac layout-review offer (service@raytac.com, page 13) is the only other channel.
- Antenna data (p.33): peak gain -0.65 dBi at 2450 MHz, efficiency 25.2 % at 2400, 29.6 % at 2450, 25.0 % at 2500 (average gain about -5.3 dBi), measured in free space. "Working range is tested in open space": 1-MV2 over 300 m at 1 Mbps, over 550 m at 125 kbps, over 150 m at 2 Mbps (page 1). Sensitivity -95 dBm (1 Mbps), -103 dBm (125 kbps), TX +8 dBm (lines 145-149 of the text).
- Supporting generic chip-antenna guidance (Infineon AN91445, https://www.infineon.com/dgdl/Infineon-AN91445_Antenna_Design_and_RF_Layout_Guidelines-ApplicationNotes-v09_00-EN.pdf): "Never place any component, planes, mounting screws, or traces in the antenna keep-out area across all layers" (sec. 12); near field "up to 4-mm distance from the antenna" and "no metal is allowed in the antenna near-field" (sec. 12, 15.1.4); plastic/casing lowers the resonant frequency "about 100 MHz to 200 MHz" (sec. 11.2) and "must be tuned again"; a nearby battery cable "can completely detune the antenna" (sec. 15.1.4). That note is for a different antenna; use it as direction only.

## 2. Findings

### 1. BLOCKER: the proposed stack puts the LCD over the antenna and the cell 4.4 mm from it; the panel cannot clear the antenna on this board
Evidence: gen_pcb.py:117 draws the LCD at y 2.85..33.15 (x 2.7..29.3). The antenna section of U1 is y 0.6..4.1, so the glass, its metal driver area and ITO overlap 1.25 mm of the antenna section and sit directly above the rest of the module (the module's Fab outline is y 0.6..16.2). gen_pcb.py:116 puts the cell edge at y 8.5, which is 4.4 mm from the antenna section (and about 5-6 mm from the chip element). The cell spans x 6.1..25.9, so it lies completely below the antenna (module x 10.7..21.3). Infineon puts the near field at 4 mm and says no metal in it.
To keep a 4-5 mm margin the LCD top edge has to be at y >= about 8.5, which puts the 30.3 mm panel bottom edge at y 38.8, 2.8 mm past the board bottom edge (36) and still inside the 40 mm case only if the board sits at the case top. J1 (FPC) is at y 31, so the FPC tail geometry also changes.
Impact (estimate): a glass/metal-frame panel and a foil pouch directly over/next to a narrow-band chip antenna (efficiency 25-29 % even in free space) detunes it and costs several dB to tens of dB. I could not find a published figure for a Li-Po pouch 4-5 mm from a chip antenna; treat the number as unknown until measured.
Fix (choose one before ordering boards):
a. Let the antenna overhang: move U1 up so the antenna section is outside the PCB outline (extend the board edge so the 3.8 mm antenna end is beyond the ground/battery/LCD footprint), or place the board in the case so the antenna end is past the LCD and cell edge by >= 5 mm. With a 36 x 40 mm case that means the LCD and cell must end about y 8-9 on the board axis, so either cut the panel's overlap with a case-level stand-off (LCD glass offset toward the bottom, FPC tail folded) or enlarge the case in y by about 3-4 mm.
b. Rotate U1 90 degrees and put the antenna in a corner (Infineon sec. 12: "place the antenna in a corner"), where the LCD (x 2.7..29.3) and cell (x 6.1..25.9) leave 0 to 2.7 mm at best: this does not solve it by itself; the cell/LCD must shrink back from that corner.
c. At minimum, shift the LCD proposal to start at y >= 8.5 in the drawing so the conflict is visible, and add a courtyard line for "no metal/battery/glass above" over the antenna end on a user layer.
The first prototype could still be built as a measured experiment, but then the order should include a variant with U1 overhanging the edge (see finding 2) so the baseline is known.

### 2. MAJOR: antenna 0.6 mm inside the edge, with ground wings 4.7 mm each side at the same y
Evidence: measured table above. Raytac: strip "as wider as you can" and module toward the edge (page 13). Their drawing has about 10 mm of clear strip each side; this board has 4.75 mm, then GND on F/In1/B and a 3V0 plane on In4 starting at x 6 and x 26 from y 0.3. The module sits 0.6 mm inside the outline so there is no overhang. The Raytac figure appears to have the antenna end flush with the board edge, not overhanging, so 0.6 mm is not itself a violation; the narrow strip is the issue.
Impact: ground flanking the antenna in the same plane at 4.75 mm pulls the resonance down and lowers efficiency (Infineon sec. 11.1: larger/closer ground lowers the resonant frequency). The antenna is already narrow-band (25 % efficiency at the band edges).
Fix: widen the no-copper strip to the full width of the board over y 0..4.4 on all layers (the corners are rounded anyway), or at least to x 2..30. Cost: about 5 x 4 mm of ground plane, negligible. Also extend `check_antenna.py` to the new area.

### 3. MAJOR: TX power is 0 dBm; the module can do +8 dBm; with no Coded PHY the 20-40 m through-body link has little or negative margin
Evidence: `.config`: `CONFIG_BT_CTLR_TX_PWR_0=y`, `CONFIG_BT_CTLR_TX_PWR_DBM=0`, `CONFIG_BT_CTLR_TX_PWR_DYNAMIC_CONTROL` not set; prj.conf has no TX power line. `CONFIG_BT_CTLR_PHY_CODED` not set (only `_SUPPORT=y`), `CONFIG_BT_EXT_ADV` not set, `CONFIG_BT_CTLR_PHY_2M=y`.
Link budget (estimate; free-space path loss at 2.44 GHz: 66.2 dB at 20 m, 69.7 dB at 30 m, 72.2 dB at 40 m; phone assumed +4 dBm and -3 dBi, watch average gain -5.3 dBi from Raytac, watch sensitivity -95 dBm at 1 Mbps):

| Case (installed loss X / body block / fade margin) | Margin at 20 m | Margin at 40 m |
|---|---|---|
| Optimistic: 4 dB / 0 / 6 dB | +14.5 dB | +8.5 dB |
| Typical: 8 dB / 10 dB / 8 dB | -1.5 dB | -7.5 dB |
| Pessimistic: 15 dB / 20 dB / 10 dB | -20.5 dB | -26.5 dB |

These are phone to watch (downlink). The link layer needs both directions, and the watch to phone direction is 4 dB worse at 0 dBm than the phone's assumed +4 dBm, so subtract 4 dB, or add 8 dB if the watch goes to +8 dBm (net +4). The assumptions (installed loss, body block, phone power) are mine; the only cited figures are the antenna table, the sensitivities, and the FSPL arithmetic. Qualitative support for body blocking: the Nordic DevZone answer for nRF52840 devices that drop when a body blocks line of sight outdoors (https://devzone.nordicsemi.com/f/nordic-q-a/122227/ble-link-drops-when-body-blocks-line-of-sight-between-nrf52840-devices/539608, no dB values given); more than 10 dB difference between phone carriage states (https://arxiv.org/pdf/2006.15711). I did not find a quoted dB figure for a wrist chip antenna with a body in the path.
Fix: set `CONFIG_BT_CTLR_TX_PWR_PLUS_8=y` (the grant's conducted output is 0.0066 W = +8.2 dBm, so +8 dBm is within what was tested; see finding 5). Current cost is small because radio duty is low (check against docs/power_budget.md; its 6.4 mA radio figure was for 0 dBm). Coded PHY is only useful if the coach app can use it; see finding 7.

### 4. MAJOR: wrist and case loading are not accounted for; antenna orientation versus strap
Evidence/estimate: board bottom face is toward the wrist. The antenna end has no copper on any layer (by design), so it radiates freely toward the wrist side as well; the ground planes only shield under the module body. With a 36 x 40 x 12 mm case the plastic wall is about 2.6 mm from the antenna (0.6 mm to board edge + 2 mm case margin) and the skin is within a few mm of the antenna section on the bottom side: board 0.8 mm + back cover. Infineon gives a 100-200 MHz downward shift for plastic near a chip antenna; on a 25-29 % efficiency antenna with about 100 MHz usable bandwidth that moves the resonance out of the band, and body tissue (high permittivity) adds loss and further shift (estimate: 6-12 dB total installed loss for the board in the case on the wrist, but this is a guess; the arm/wrist studies I found (e.g. https://core.ac.uk/download/96782181.pdf) did not give a detuning figure for a chip antenna).
The module antenna is at the 12 o'clock end of the face. Straps attach at 12 and 6 o'clock, so the forearm/hand tissue continues in line with the antenna end. Rotating U1 so the antenna sits at the 3 or 9 o'clock edge (the wrist curves away from the case there) is likely better, but I cannot show that without a measurement: put a rotated variant in the test plan.
Fix: (a) tune/verify with the case and a wrist phantom (saline/gelatin phantom or a real wrist), not free space; (b) keep >= 5 mm of air between the skin side and the antenna if the case allows; (c) test both antenna orientations; (d) leave a provision for a series/shunt pi-match? Not possible with this module (antenna matched internally), so the only knobs are placement, keep-out size and case material (no metal, no conductive paint, no metallised plastic).

### 5. MAJOR: FCC modular grant conditions are probably not met as the stack stands (5 mm to the user), and the host has its own obligations
Evidence (grant exhibit, https://fcc.report/FCC-ID/SH6MDBT50Q/3937502.pdf; grant listing https://fccid.io/SH6MDBT50Q):
- "This transmitter module is authorized only for use in device where the antenna may be installed such that 5mm may be maintained between the antenna and users." Body-worn operation was tested only with an accessory that has no metal and holds the handset at least 5 mm from the body.
- Grants: original 07/26/2018 "Single Modular", 15C, 2402-2480 MHz, 0.0066 W conducted; Class II permissive changes 2020 (one is "Limited Single Modular" for another company's host). Grant note: "Modular Approval. This is a portable device. Power Output is conducted." and "valid only when the module is sold to OEM integrators and must be installed by the OEM or OEM integrators."
- Listed antennas in the exhibit: u.FL, chip, PCB at 5, -0.65 and 0.41 dBi (the chip gain agrees with the Raytac table). The antenna must stay as certified (the module's own chip antenna, no host-side antenna change or extension).
- Host label: "Contains FCC ID: SH6MDBT50Q" (and IC "Contains IC ID: 8017A-MDBT50Q") visible on the product, or an e-label if the product qualifies; the FCC text for the user manual (Raytac spec section 9.11.1); the integrator must not tell end users how to remove/install the module; no co-located transmitter (this board has none). Taking the module's grant does not remove the host's own unintentional-radiator testing (FCC Part 15B) and the Bluetooth SIG qualification/listing if the Bluetooth name or logo is used (the Raytac spec lists no QDID number per research/mcu.md).
- The grant text I could fetch did not contain a PCB layout condition beyond the 5 mm spacing; the Raytac keep-out is guidance, not a grant condition. I could not read the TCB grant PDF itself (only exhibit text via fcc.report), so confirm the "special conditions" box on the actual grant.
Problem: a wrist-worn watch with the module on the board face that sits within a few mm of the skin cannot guarantee 5 mm. Fix/options: (1) ask Raytac or a TCB (KDB inquiry) whether a body-worn host at less than 5 mm needs a Class II permissive change or a host SAR/RF exposure evaluation; (2) from memory of KDB 447498 D01 (verify before relying): the SAR test-exclusion threshold is (max power in mW / min separation in mm) x sqrt(f in GHz) <= 3.0, with separation below 5 mm treated as 5 mm; at 2.44 GHz that is about 9.6 mW (+9.8 dBm), so +8 dBm (6.3 mW) and 0 dBm both pass on paper, +8 dBm only with a small margin; (3) do not raise TX above the tested +8 dBm; (4) keep the case and strap free of metal near the antenna (the test was done with no metal).

### 6. MAJOR: BLE supervision timeout (4 s) is shorter than the app's no-link timer (6 s), so a fade drops the link instead of riding through
Evidence: ble_pq.c:221-222 requests interval 16 (20 ms), latency 0, timeout 400 (4 s); prj.conf PERIPHERAL_PREF_* the same (`CONFIG_BT_PERIPHERAL_PREF_TIMEOUT=400`); firmware/core/pq_core.h:17 `PQ_LINK_MS 6000`; watch.js:39 heartbeat `HB_MS = 3000`, reconnect backoff 1, 2, 4, 8, 10 s.
A 4 s body-block fade makes the controller declare the link lost at 4 s; the central then needs its backoff (>= 1 s) plus scan/connect plus re-encryption, so the app's 6 s timer fires about the time the link comes back, and any second fade restarts the cycle. A heartbeat every 3 s against a 6 s timer leaves one lost heartbeat of margin.
Fix: supervision timeout 600-1000 (6-10 s; the controller allows up to 32 s; the central chooses the final value, and Apple's accessory rules cap it at 6 s from memory, so use 600 if iOS centrals matter), heartbeat 2 s, keep latency 0 during a game (peripheral latency would delay the central's writes by (latency+1) x 20 ms). Also drop one of the two parameter requests (GAP_AUTO_UPDATE and the explicit update in on_connected do the same thing).

### 7. MAJOR: PHY selection is left to the central and 2M is enabled; Coded PHY is off and probably unusable with the Web Bluetooth coach app
Evidence: `.config` above; `CONFIG_BT_USER_PHY_UPDATE` not set, so the watch never requests a PHY (the Zephyr LL only initiates a PHY update on a host command: ull_conn.c:676 `ull_cp_phy_update`); the central can still switch the link to 2M because `CONFIG_BT_CTLR_PHY_2M=y`.
Why it matters: 2M costs about 3 dB of sensitivity (my knowledge of nRF52 numbers, not in the Raytac text) and gains nothing for 20-byte messages every 20 ms. Coded PHY gives -103 dBm vs -95 dBm (Raytac spec), about 8 dB, but needs extended advertising (`CONFIG_BT_EXT_ADV`) and a central that asks for it. Web Bluetooth (the coach page, watch.js:335 `bt.requestDevice`) has no API to select a PHY, so Coded PHY would not be used.
Fix: for the range-critical build set `CONFIG_BT_CTLR_PHY_2M=n` (1M only), log the connection PHY in `on_connected`, and put Coded PHY (BT_EXT_ADV + BT_CTLR_PHY_CODED + a native coach app that sets PHY_LE_CODED) on the roadmap if the field test fails. Note that production should move to the nRF Connect SDK controller anyway (already disclosed).

### 8. MINOR: no RSSI/PER instrumentation in the firmware for the radiated tests
Evidence: `.config`: `CONFIG_BT_CTLR_CONN_RSSI_SUPPORT=y` but `# CONFIG_BT_CTLR_CONN_RSSI is not set`; no HCI Read RSSI/counter code in ble_pq.c; no DTM/radio-test build.
Fix: enable `CONFIG_BT_CTLR_CONN_RSSI=y`, log RSSI (bt_hci Read RSSI vendor/standard command) and a per-connection sequence counter on the notify characteristic (TX 7a1d0003) so packet loss can be counted at the phone side; also build the Zephyr/NCS DTM or `radio_test` sample for the free-space baseline.

### 9. MINOR: single 0.25 mm via per module ground pad; Raytac asks for as many as possible, especially at the four corners
Evidence: pads 15, 33, 55 have one via each (0.35-0.47 mm away), pads 1/2 share two; the corner vias (11.1,5.0), (20.6,5.0), (10.8,15.3), (20.7,16.0) exist but are single.
Fix: add a second via per GND pad where the router left room (pads 15, 33, 55) and a row of stitching vias on the fill edge at y 4.4-5.0, x 9..11 and 21..23. The module's inner pad area (56-61) is NC so those do not help.

### 10. MINOR: U4, SWD traces and battery pads in the antenna near field
Evidence: U4 body 2.03 mm from the antenna section, its pins carry I2C/3V0/ACC_INT; SWDIO/SWDCLK vias are 1.45-2.95 mm away and each runs about 25 mm to the bottom pads (TP3/TP4 at y 28.5), unterminated and floating in operation, so they form stubs near 2.4 GHz; BT1.2 (battery GND pad) 4.56 mm; battery wire routing is not drawn (Infineon sec. 15.1.4: a battery cable near the antenna can completely detune it).
Fix: keep U4 and C13 at least 5 mm out (move to y >= 9 if possible), put a 100 pF-1 nF capacitor to GND or a 0 ohm/ferrite at the SWD cradle pads' end (or break the lines with a 1 kohm series resistor at the module end) to kill the stubs, and route the battery leads away from the antenna end (down toward y 12-34, not across y 4-8).

### 11. MINOR: connection and advertising parameters
Evidence: ble_pq.c:166 advertises at 0x00a0-0x00f0 (100-150 ms) forever; connection interval 20/20 ms is requested with min = max (Apple's rule, from memory: max >= min + 15 ms, so an iOS central may ignore the request; the coach app is Chrome, so low priority); `CONFIG_BT_CTLR_TX_PWR_*` applies to advertising as well.
Fix: keep the fast advertising for the first 30-60 s and then fall back to 1 s (battery); set min 15 ms / max 30 ms; keep 100-150 ms.

### 12. MINOR: check_antenna.py checks only the strip it was told to check
Evidence: check_antenna.py tests x 6.05..25.95, y 0..3.95 only. It does not test the flanks (finding 2), components near the antenna (finding 10), the stack, or the keep-out under the module's first pad row (y 4.0..4.4). It also declares the strip clean while In2/In3 hold no zone at all, which is true but not enforced.
Fix: extend the check to a full-width strip, to a 5 mm component keep-out (U4/C13/Q1) and to the Cmts_User LCD/Dwgs_User cell outlines against the antenna box.

## 3. First-prototype RF test plan

Conducted tests are impossible (chip antenna, no RF connector), so all RF tests are radiated or link-level.
1. Reference baseline: an nRF52840-DK and a Raytac MDBT50Q dev board (same module, free space, no case, no battery) running the same firmware at the same TX power. Record RSSI at a fixed phone position at 1, 5, 10 m (same orientation) so the dB difference between the bare module and the watch is the host loss. Use 1000 or more samples per point and repeat three times, in an open field away from Wi-Fi.
2. Watch tests with the production stack: case on, battery in, LCD fitted, on a wrist (and on a saline/gelatin phantom for repeatability). Repeat with (a) the arm at the side, (b) the arm in the throwing position, (c) body rotated 0/90/180/270 degrees relative to the phone. Compare with step 1: the target is under 6 dB total installed loss; under 10 dB is workable; above 10 dB redo the placement (finding 1, 2).
3. Radiated power: TRP via a Bluetooth DTM continuous TX (nRF Connect SDK `radio_test` or Zephyr DTM) in an anechoic/reverberation chamber if one can be booked (most universities and EMC labs offer it by the hour); otherwise use the relative method in step 1. Check the frequency response: sweep the three advertising channels and channels 0/19/39 (2402/2440/2480 MHz) because the detuning shows first as an edge channel dropping.
4. Packet error rate at distance: phone or laptop to watch at 10, 20, 30, 40 m in the real layout (dugout to mound), with a person standing in the path, at least 10,000 notifications at 20 ms with a sequence counter (finding 8), PER and RSSI per channel; repeat with the watch on the throwing arm. Pass criterion suggestion: PER under 1 % at 30 m with a body in the path, and no disconnect over a full inning.
5. Coexistence: run the same PER test with Wi-Fi traffic (iperf) on channels 1, 6, 11 at 1 m from the watch and with a phone hotspot; BLE advertising channels 37/38/39 (2402/2426/2480 MHz) sit between the three Wi-Fi channels, but the data channels do not, so adaptive frequency hopping must run. Check the central sends a channel map update (log with an nRF sniffer or nRF Connect). Also test in the real stadium during a game if possible, with many phones scanning.
6. Regression after every change in the case material, battery model or LCD position: rerun steps 1-4 (detuning shows as a loss in step 1 first).

## Checked and found correct
- Keep-out strip x 6..26, y 0..4.0 is empty on all six layers including the filled zones (independent raster at 0.5 mm; matches check_antenna.py).
- No In2/In3 copper at y < 4.9, so no signal under the antenna feed area; In1 GND is solid from y 4.4 under the module pads as Raytac's figure shows.
- Module orientation matches Raytac's figure (antenna toward the board edge, ground below), module centred in x with 10.7 mm to each side edge.
- Module body size 10.5 x 15.5 mm matches the datasheet; module GND pads 1, 2, 15, 33, 55 are all connected to GND and each has a via within 0.5 mm.
- No bottom-side components, test pads or tracks within 5 mm of the antenna except the vias/tracks listed; JP1 (8.1 mm), D3 (7.0 mm), SW1 (7.9 mm) and the cradle pads are clear.
- PQ_LINK_MS (6 s) is longer than the 4 s supervision timeout, so a lost link is detected by the stack before the app times out (the order is right; the margin is the problem in finding 6).
- Advertising on all three channels with the scan response carrying the 128-bit UUID; 32.768 kHz sample clock source set to XTAL (50 ppm accuracy class, crystal Q13FC13500004 is +-20 ppm), load capacitors 18 pF match 12.5 pF CL with 3.5 pF stray.
- Module supply: VDD and VDDH both on 3V0, DCCH and VBUS left open; the module's own RF supply inductor means no host RF components are needed.
