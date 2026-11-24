"""PitchIQ watch board, rev D: single source of truth (parts, pins -> nets, pin types, footprints, sourcing).
Original design for our own Zephyr firmware. No Bangle.js pin map, no Espruino, no external flash.
Rev C (2026-11-23): heart-rate sensor, its 5 V boost and the 1.8 V rail load removed; waterproof USB Type-C receptacle for
charging (no USB data); 8 mm motor; hidden SWD pads only; board 30 x 36 mm.
gen_sch.py, erc.py, gen_pcb.py and gen_bom.py all read this file, so schematic, checks, board and BOM cannot disagree.
Pin numbers come from research/datasheets.md (extracted from the manufacturers' documents, with URLs)."""

NC = None
P = {}
# pin types for the scripted ERC: pi power in, po power out (source), in, out, io, od open-drain out, pas passive, nc
def part(ref, value, fp, pins, mpn="", mfr="", lcsc="", desc="", dnp=False, hand=False, src="", side="F"):
    P[ref] = dict(ref=ref, value=value, fp=fp, pins=[(a, b, c) for a, b, c, *_ in pins], types={p[0]: (p[3] if len(p) > 3 else "pas") for p in pins},
                  mpn=mpn, mfr=mfr, lcsc=lcsc, desc=desc, dnp=dnp, hand=hand, src=src, side=side)
def two(ref, value, fp, a, b, **k):
    part(ref, value, fp, [("1", "1", a), ("2", "2", b)], **k)

R0402 = "Resistor_SMD:R_0402_1005Metric"; C0402 = "Capacitor_SMD:C_0402_1005Metric"; C0603 = "Capacitor_SMD:C_0603_1608Metric"
def R(ref, val, a, b, mpn, lcsc, desc, **k): two(ref, val, R0402, a, b, mpn=mpn, mfr="UNI-ROYAL" if mpn.startswith("0402WG") else "Yageo", lcsc=lcsc, desc=desc, **k)
def C100n(ref, net, desc, **k): two(ref, "100nF", C0402, net, "GND", mpn="CL05B104KO5NNNC", mfr="Samsung", lcsc="C1525", desc=desc, **k)
def C1u(ref, net, desc, **k): two(ref, "1uF", C0402, net, "GND", mpn="CL05A105KA5NQNC", mfr="Samsung", lcsc="C52923", desc=desc, **k)
def C10u(ref, net, desc, **k): two(ref, "10uF", C0603, net, "GND", mpn="CL10A106KP8NNNC", mfr="Samsung", lcsc="C19702", desc=desc + " (10 V part: rails here are <= 5.5 V)", **k)

# ---------------------------------------------------------------- radio module: nRF52840 inside Raytac MDBT50Q-1MV2
used = {  # module pad -> (name, net, type)      PIN MAP v1 (ours; mirrored in watch/firmware/boards/pitchiq/pitchiq_watch)
    "17": ("P0.00/XL1", "XL1", "pas"), "18": ("P0.01/XL2", "XL2", "pas"),
    "37": ("P0.13 LCD_SCK", "LCD_SCK", "out"), "39": ("P0.15 LCD_MOSI", "LCD_MOSI", "out"), "41": ("P0.17 LCD_CS", "LCD_CS", "out"),
    "44": ("P0.20 EXTCOMIN", "LCD_EXTCOMIN", "out"), "46": ("P0.22 LCD_DISP", "LCD_DISP", "out"), "48": ("P0.24 FL_PWM", "FL_PWM", "out"),
    "19": ("P0.26 SDA", "I2C_SDA", "io"), "16": ("P0.27 SCL", "I2C_SCL", "io"),
    "20": ("P0.04 ACC_INT1", "ACC_INT", "in"), "22": ("P0.06 PMIC_INT", "PMIC_INT", "in"),
    "27": ("P0.11 VIB", "VIB", "out"), "40": ("P0.18/nRESET", "NRESET", "in"),
    "51": ("SWDIO", "SWDIO", "io"), "53": ("SWDCLK", "SWDCLK", "in"),   # reach the cradle pads through 100R (R17, R18)
    "28": ("VDD", "3V0", "pi"), "30": ("VDDH", "3V0", "pi"), "31": ("DCCH", NC, "nc"), "32": ("VBUS", "GND", "pas"),   # USB not used: Raytac "USB disabled" reference ties VBUS to GND
    "1": ("GND", "GND", "pi"), "2": ("GND", "GND", "pi"), "15": ("GND", "GND", "pi"), "33": ("GND", "GND", "pi"), "55": ("GND", "GND", "pi"),
}
other = {"3": "P1.10", "4": "P1.11", "5": "P1.12", "6": "P1.13", "7": "P1.14", "8": "P1.15", "9": "P0.03", "10": "P0.29", "11": "P0.02",
         "12": "P0.31", "13": "P0.28", "14": "P0.30", "21": "P0.05", "23": "P0.07", "24": "P0.08", "25": "P1.08", "26": "P1.09", "29": "P0.12", "34": "D-", "35": "D+",
         "36": "P0.14", "38": "P0.16", "42": "P0.19", "43": "P0.21", "45": "P0.23", "47": "P1.00", "49": "P0.25", "50": "P1.02",
         "52": "P0.09", "54": "P0.10", "56": "P1.04", "57": "P1.06", "58": "P1.07", "59": "P1.05", "60": "P1.03", "61": "P1.01"}
part("U1", "MDBT50Q-1MV2", "RF_Module:Raytac_MDBT50Q",
     [(n,) + used[n] if n in used else (n, other[n], NC, "nc") for n in map(str, range(1, 62))],
     mpn="MDBT50Q-1MV2", mfr="Raytac", lcsc="C5118826", desc="nRF52840 BLE module, chip antenna, FCC ID SH6MDBT50Q (LCSC out of stock Nov 23: consign)",
     src="https://www.sparkfun.com/nordic-nrf52840-ble-module-mdbt50q-1mv2.html")
C10u("C1", "3V0", "module bulk decoupling, next to VDD/VDDH pads"); C100n("C2", "3V0", "module decoupling")
two("Y1", "32.768kHz", "Crystal:Crystal_SMD_3215-2Pin_3.2x1.5mm", "XL1", "XL2", mpn="Q13FC13500004", mfr="Epson", lcsc="C32346", desc="FC-135 32.768 kHz 12.5 pF")
for r, n in (("C3", "XL1"), ("C4", "XL2")):
    two(r, "18pF", C0402, n, "GND", mpn="CL05C180JB5NNNC", mfr="Samsung", lcsc="C307443", desc="crystal load: 2 x (12.5 pF - ~3.5 pF stray)")

# ---------------------------------------------------------------- power: Nordic nPM1300 (charger, power path, ship mode, 2 bucks, fuel gauge)
part("U2", "nPM1300-QEAA", "Package_DFN_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm",
     [("1", "VOUT1", NC, "nc"), ("2", "PVSS1", "GND", "pi"), ("3", "SW1", NC, "nc"),   # BUCK1 unused: no inductor or capacitor, as in Nordic's one-buck reference configuration (PS v1.3, config 2 parts list)
      ("4", "PVDD", "VSYS", "pi"), ("5", "SW2", "SW2", "po"), ("6", "PVSS2", "GND", "pi"),
      ("7", "GPIO0", NC, "nc"), ("8", "GPIO1 (INT)", "PMIC_INT", "out"), ("9", "GPIO2", NC, "nc"), ("10", "GPIO3", NC, "nc"), ("11", "GPIO4", NC, "nc"),
      ("12", "VDDIO", "3V0", "pi"), ("13", "SDA", "I2C_SDA", "io"), ("14", "SCL", "I2C_SCL", "in"), ("15", "SHPHLD", "BTN", "in"),
      ("16", "VSET2", "VSET2", "pas"), ("17", "VSET1", "VSET1", "pas"), ("18", "NTC", "NTC", "pas"), ("19", "VBAT", "VBAT", "io"), ("20", "VSYS", "VSYS", "po"),
      ("21", "VBUS", "VBUS", "pi"), ("22", "VBUSOUT", "VBUSOUT", "po"), ("23", "CC1", "CC1", "pas"), ("24", "CC2", "CC2", "pas"),   # the chip has its own 5.1 k pull-downs (Rd) on CC1/CC2
      ("25", "LED0", NC, "nc"), ("26", "LED1", NC, "nc"), ("27", "LED2", NC, "nc"),
      ("28", "LSIN1/VINLDO1", "GND", "pas"), ("29", "LSOUT1", NC, "nc"), ("30", "LSIN2/VINLDO2", "GND", "pas"), ("31", "LSOUT2", NC, "nc"),   # unused load switches: inputs to ground, outputs open
      ("32", "VOUT2", "3V0", "pi"), ("33", "AVSS (pad)", "GND", "pi")],
     mpn="NPM1300-QEAA-R7", mfr="Nordic Semiconductor", lcsc="C7501206", desc="PMIC: 800 mA charger with power path, ship mode, 2 x 200 mA buck, fuel gauge (LCSC 0 stock Nov 23: buy at DigiKey/Mouser)",
     src="https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-QEAA-R7/19722485")
for r, a, b in (("L2", "SW2", "3V0"),):
    part(r, "2.2uH", "Inductor_SMD:L_0805_2012Metric", [("1", "1", a), ("2", "2", b, "po")],   # pin 2 = regulated rail (the ERC's power source for that net)
         mpn="MLP2012H2R2MT0S1", mfr="TDK", lcsc="C383369", desc="buck inductor 2.2 uH, DCR 150 mOhm typ, 1 A rated (saturation current not published; alternative Murata DFE201610E-2R2M C337891 needs a 2016 footprint)")
C1u("C5", "VBUSOUT", "VBUSOUT bypass: 1 uF as in Nordic's bill of materials (PS v1.3)"); C10u("C6", "VBAT", "battery node"); C10u("C7", "VSYS", "system node"); C10u("C8", "VSYS", "buck input (PVDD)")
C100n("C25", "VSYS", "PVDD high-frequency bypass, placed 1 mm from the PVDD and PVSS1 pins")
C10u("C10", "3V0", "BUCK2 output"); C1u("C11", "3V0", "PMIC VDDIO")
C1u("C12", "VBUS", "VBUS input: 1 uF 25 V as in Nordic's bill of materials (the VBUS pin survives 22 V; keeps the capacitance a USB source sees at attach small)")
R("R1", "0R", "VSET1", "GND", "0402WGF0000TCE", "C17168", "VSET1 to ground = BUCK1 off at start-up (nothing uses 1.8 V in rev C; firmware never enables it). L1/C9 stay fitted so SW1/VOUT1 are terminated exactly as on Nordic's evaluation kit; fit 47k here to get 1.8 V back")
R("R2", "150k", "VSET2", "GND", "0402WGF1503TCE", "C25755", "BUCK2 start-up voltage = 3.0 V (nPM1300 VSET table)")
two("RT1", "10k NTC", R0402, "NTC", "GND", mpn="NCP15XH103F03RC", mfr="Murata", lcsc="C77131", desc="battery temperature (place against the cell); B 3380")
part("D2", "SMF5.0A", "Diode_SMD:D_SOD-123F", [("1", "K", "VBUS"), ("2", "A", "GND")], mpn="SMF5.0A", mfr="Littelfuse", lcsc="C151296", desc="USB VBUS surge clamp at the connector: 5 V stand-off, 9.2 V clamp (the power chip itself survives 22 V on VBUS). A 9 V or 12 V charger would overload it: 5 V chargers only")
part("BT1", "LiPo 150 mAh (protected)", "PQ:Pad_2x_wire", [("1", "+", "BATP", "po"), ("2", "-", "GND", "po")], mpn="1317", mfr="Adafruit",
     desc="3.7 V 150 mAh 402025 cell with protection circuit, under the board (wrist side); leads soldered to pads", hand=True, src="https://www.adafruit.com/products/1317", side="B")
part("JP1", "Battery link", "Jumper:SolderJumper-2_P1.3mm_Open_RoundedPad1.0x1.5mm", [("1", "A", "BATP"), ("2", "B", "VBAT")],
     mpn="(solder bridge)", mfr="-", desc="open until final assembly; bridge with solder last", hand=True, side="B")
part("SW1", "Side button", "Button_Switch_SMD:SW_Push_1P1T-MP_NO_Horizontal_Alps_SKRTLAE010", [("1", "1", "BTN"), ("2", "2", "GND"), ("MP", "MP", "GND")],
     mpn="SKRTLAE010", mfr="Alps Alpine", lcsc="C110293", desc="to nPM1300 SHPHLD: wake from ship mode, long-press power cycle, user button (events over I2C). Bottom side, beside the cell", side="B")
two("D3", "TVS 5V", "Diode_SMD:D_SOD-323", "BTN", "GND", mpn="PESD5V0S1BA", mfr="DOWO (Nexperia original)", lcsc="C2985486", desc="button ESD clamp (finger-touched)")

# ---------------------------------------------------------------- I2C bus
R("R3", "4.7k", "3V0", "I2C_SDA", "0402WGF4701TCE", "C25900", "I2C pull-up"); R("R4", "4.7k", "3V0", "I2C_SCL", "0402WGF4701TCE", "C25900", "I2C pull-up")

# ---------------------------------------------------------------- accelerometer (top side)
part("U4", "LIS2DH12TR", "Package_LGA:LGA-12_2x2mm_P0.5mm",
     [("1", "SCL", "I2C_SCL", "in"), ("2", "CS", "3V0", "in"), ("3", "SA0", "3V0", "in"), ("4", "SDA", "I2C_SDA", "io"), ("5", "RES", "GND", "pas"),
      ("6", "GND", "GND", "pi"), ("7", "GND", "GND", "pi"), ("8", "GND", "GND", "pi"), ("9", "VDD", "3V0", "pi"), ("10", "VDD_IO", "3V0", "pi"),
      ("11", "INT2", NC, "nc"), ("12", "INT1", "ACC_INT", "out")],
     mpn="LIS2DH12TR", mfr="STMicroelectronics", lcsc="C110926", desc="3-axis accelerometer, I2C 0x19, 4 uA at 25 Hz low-power")
C100n("C13", "3V0", "accelerometer decoupling, Vdd (pin 9)"); C100n("C26", "3V0", "accelerometer decoupling, Vdd_IO (pin 10): ST shows one capacitor per supply pin")

# ---------------------------------------------------------------- display: Sharp LS013B7DH03 (10-pin FPC) + optional frontlight LED
# Display connector. The glass lies face-up above the board and its tail (at the lower glass edge; Sharp terminal 1 on the
# RIGHT seen from the front, contacts on the BACK face) folds 180 degrees under the glass into J1. After that fold the contacts
# face UP (away from the board) and terminal 1 is still on the right (east). So: TOP-contact connector (Sharp names a
# top-contact type for the folded arrangement), cable entry toward the lower board edge, and Sharp terminal 1 on the east end.
# This footprint's pad 1 is at the WEST end with the cable entry south, so pad n carries Sharp terminal 11 - n.
# Evidence and remaining doubt: reviews/p1_display_connector.md. Must be confirmed with a real panel before boards are ordered.
part("J1", "LCD FPC 10p 0.5mm, top contact", "Connector_FFC-FPC:Hirose_FH12-10S-0.5SH_1x10-1MP_P0.50mm_Horizontal",
     [("10", "T1 SCLK", "LCD_SCK", "in"), ("9", "T2 SI", "LCD_MOSI", "in"), ("8", "T3 SCS", "LCD_CS", "in"), ("7", "T4 EXTCOMIN", "LCD_EXTCOMIN", "in"), ("6", "T5 DISP", "LCD_DISP", "in"),
      ("5", "T6 VDDA", "3V0", "pi"), ("4", "T7 VDD", "3V0", "pi"), ("3", "T8 EXTMODE", "LCD_EXTMODE", "in"), ("2", "T9 VSS", "GND", "pi"), ("1", "T10 VSSA", "GND", "pi"), ("MP", "MP", "GND")],
     mpn="FH12A-10S-0.5SH(55)", mfr="Hirose", lcsc="", hand=True, src="https://www.digikey.com/en/products/detail/hirose-electric-co-ltd/FH12A-10S-0-5SH-55/1110331",
     desc="ZIF FPC connector, TOP contact (the A in FH12A). Hand-fitted or consigned: no LCSC number found. Land pattern assumed equal to the bottom-contact FH12-10S footprint used here (same series; not checked on Hirose's drawing)")
C100n("C21", "LCD_DISP", "Sharp fig. 9-1: DISP to VSS"); C100n("C22", "3V0", "Sharp fig. 9-1: VDDA"); C1u("C23", "3V0", "Sharp fig. 9-1: VDD")
R("R9", "1M", "LCD_DISP", "GND", "0402WGF1004TCE", "C26083", "display off in reset (1 M: DISP is high all the time, so this resistor is a standing 3 uA load)"); R("R10", "100k", "LCD_CS", "GND", "0402WGF1003TCE", "C25741", "LCD deselected in reset (SCS active high)")
R("R11", "0R", "3V0", "LCD_EXTMODE", "0402WGF0000TCE", "C17168", "EXTMODE high: COM inversion from the EXTCOMIN pin")
R("R12", "0R", "LCD_EXTMODE", "GND", "0402WGF0000TCE", "C17168", "alternative: EXTMODE low, COM inversion by serial flag (fit instead of R11)", dnp=True)
part("J2", "Frontlight LED pads", "PQ:Pad_2x_wire_small", [("1", "A", "FL_A"), ("2", "K", "FL_K")], mpn="(pads only)", mfr="-", desc="for an Azumo frontlight LED tail (5 mA typ at 3.0 V); unused with a bare panel", hand=True)
R("R13", "47R", "3V0", "FL_A", "0402WGF470JTCE", "C25118", "frontlight LED current limit (value to confirm on the first frontlit unit)")
part("Q2", "AO3400A", "Package_TO_SOT_SMD:SOT-23", [("1", "G", "FL_PWM", "in"), ("2", "S", "GND", "pas"), ("3", "D", "FL_K", "pas")], mpn="AO3400A", mfr="Alpha & Omega", lcsc="C20917", desc="frontlight low-side switch (PWM)")
R("R14", "100k", "FL_PWM", "GND", "0402WGF1003TCE", "C25741", "frontlight off in reset")

# ---------------------------------------------------------------- vibration motor
part("M1", "ERM coin motor 8 mm 3 V", "PQ:Pad_2x_wire_small", [("1", "+", "VSYS"), ("2", "-", "MOTOR_N")], mpn="VCLP0820B004L", mfr="Vybronics",
     desc="8.0 x 2.1 mm coin vibration motor, 2.7-4.0 V, 35 mA max, adhesive backed, leads soldered to pads (firmware caps the duty: VSYS can exceed 4.0 V)", hand=True, src="https://www.digikey.com/en/products/detail/vybronics-inc/VCLP0820B004L/10285889")
part("Q1", "AO3400A", "Package_TO_SOT_SMD:SOT-23", [("1", "G", "VIB", "in"), ("2", "S", "GND", "pas"), ("3", "D", "MOTOR_N", "pas")], mpn="AO3400A", mfr="Alpha & Omega", lcsc="C20917", desc="motor low-side switch (PWM)")
R("R15", "100k", "VIB", "GND", "0402WGF1003TCE", "C25741", "motor off in reset")
part("D1", "1N4148WS", "Diode_SMD:D_SOD-323", [("1", "K", "VSYS"), ("2", "A", "MOTOR_N")], mpn="1N4148WS", mfr="various", lcsc="C2128", desc="motor flyback diode")
C10u("C24", "VSYS", "optional reservoir next to the motor switch. NOT fitted on the first boards: Nordic specifies 10 uF on VSYS and extra capacitance there makes start-up from a 100 mA USB source harder", dnp=True)

# ---------------------------------------------------------------- USB Type-C charging port (power only: no data lines used)
# GCT USB4715-GF-A: 6-contact, mid-mount (sits in a notch in the board edge), IP67 with its gasket USBTJ-04 pressed against the
# case wall. Pin names and land pattern from GCT's drawing (research/usbc_motor.md). CC1/CC2 go straight to the power chip.
part("J3", "USB-C receptacle (power only, IP67)", "PQ:USB4715",
     [("A12", "GND", "GND", "pi"), ("B12", "GND", "GND", "pi"), ("A9", "VBUS", "VBUS", "po"), ("B9", "VBUS", "VBUS", "pas"), ("A5", "CC1", "CC1", "pas"), ("B5", "CC2", "CC2", "pas"),
      ("S1", "SHELL", "GND", "pas"), ("S2", "SHELL", "GND", "pas"), ("S3", "SHELL", "GND", "pas"), ("S4", "SHELL", "GND", "pas")],
     mpn="USB4715-GF-A", mfr="GCT", lcsc="C6906846", desc="waterproof USB Type-C, charging only; gasket USBTJ-04 is fitted after soldering (kit: USB4715-GF-A-KIT, C5984345). LCSC out of stock Nov 23: buy at Mouser and consign",
     src="https://octopart.com/part/gct/USB4715-GF-A", side="B")

# No external CC pull-downs, on purpose: the nPM1300 has its own 5.1 k Rd on CC1/CC2 (Product Specification v1.3, table 9).
# External 5.1 k in parallel would present about 2.55 k, outside the USB Type-C sink range. Whether the internal Rd is
# present with the chip completely unpowered is not stated by Nordic: test a flat watch on a USB-C to USB-C charger.

# ---------------------------------------------------------------- hidden programming pads (BOTTOM side, inside the case, for a pogo jig)
# Five pads in a row: nRESET, SWDCLK, GND, SWDIO, 3V0. GND is the middle pad, so a jig put on backwards still lands ground on
# ground; nothing else it can then touch is unprotected: the logic pads have 100R and a clamp, and the 3V0 pad (target-voltage
# reference for the probe, never a supply input) reaches the rail through 1 k (R20).
for ref, net, t, d in (("TP2", "GND", "pas", "ground"), ("TP3", "SWDIO_P", "io", "SWDIO"), ("TP4", "SWDCLK_P", "out", "SWDCLK"),
                       ("TP5", "NRESET_P", "pas", "nRESET"), ("TP6", "3V0_P", "pas", "3V0 reference out (VTref) through 1 k")):
    part(ref, d, "TestPoint:TestPoint_Pad_D1.5mm", [("1", "1", net, t)], desc=f"programming pad: {d}", dnp=True, side="B")
R100 = dict(mpn="0402WGF1000TCE", lcsc="C25076")
R("R17", "100R", "SWDIO", "SWDIO_P", desc="series protection, SWDIO pad", side="B", **R100)
R("R18", "100R", "SWDCLK", "SWDCLK_P", desc="series protection, SWDCLK pad", side="B", **R100)
R("R19", "100R", "NRESET", "NRESET_P", desc="series protection, nRESET pad", side="B", **R100)
R("R20", "1k", "3V0", "3V0_P", "0402WGF1001TCE", "C11702", "limits current if the 3V0 reference pad is ever shorted or back-fed by a misplaced jig (a probe's reference input draws microamps)", side="B")
for ref, net in (("D4", "SWDIO_P"), ("D5", "SWDCLK_P"), ("D6", "NRESET_P")):
    two(ref, "TVS 5V", "Diode_SMD:D_SOD-323", net, "GND", mpn="PESD5V0S1BA", mfr="DOWO (Nexperia original)", lcsc="C2985486", desc="programming-pad ESD clamp (about 35 pF: fine for SWD at 1 MHz through 100R)", side="B")
R("R16", "10k", "3V0", "NRESET", "0402WGF1002TCE", "C25744", "reset pull-up (pin is a GPIO until firmware enables pin reset)")
for ref, net in (("TP8", "VSYS"), ("TP1", "VBUS")):
    part(ref, net, "TestPoint:TestPoint_Pad_D1.5mm", [("1", "1", net)], desc="test pad " + net, dnp=True, side="B")

def nets():
    n = {}
    for p in P.values():
        for num, name, net in p["pins"]:
            if net is not NC: n.setdefault(net, []).append((p["ref"], num))
    return n

if __name__ == "__main__":
    n = nets(); print(len(P), "parts,", len(n), "nets")
    for k in sorted(n): print(f"{k:14s} {len(n[k]):2d}  " + " ".join(f"{r}.{p}" for r, p in n[k])[:150])
