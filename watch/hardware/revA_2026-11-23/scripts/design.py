"""PitchIQ watch board, rev A: the single source of truth (parts, pins -> nets, footprints, sourcing).
gen_sch.py, gen_pcb.py and gen_bom.py all read this file, so the schematic, the board and the BOM cannot disagree.
Pin map follows espruino/Espruino boards/BANGLEJS2.py (46b13ba) so a Bangle.js 2 firmware image sees the same pins."""

NC = None  # explicitly not connected

# ref: dict(value, sym (name, [(pin number, pin name, net)]), fp, mpn, mfr, lcsc, desc, dnp, hand)
P = {}

def part(ref, value, fp, pins, mpn="", mfr="", lcsc="", desc="", dnp=False, hand=False, src=""):
    P[ref] = dict(ref=ref, value=value, fp=fp, pins=pins, mpn=mpn, mfr=mfr, lcsc=lcsc, desc=desc, dnp=dnp, hand=hand, src=src)

def two(ref, value, fp, a, b, **k):
    part(ref, value, fp, [("1", "1", a), ("2", "2", b)], **k)

R0402 = "Resistor_SMD:R_0402_1005Metric"
C0402 = "Capacitor_SMD:C_0402_1005Metric"
C0603 = "Capacitor_SMD:C_0603_1608Metric"

# ---------------------------------------------------------------- radio module (nRF52840, pre-certified)
used = {  # module pad -> (pin name, net)   Bangle.js 2 pin map
    "9": ("P0.03/AIN1", "BAT_SENSE"), "16": ("P0.27", "LCD_MOSI"), "17": ("P0.00/XL1", "XL1"), "18": ("P0.01/XL2", "XL2"),
    "19": ("P0.26", "LCD_SCK"), "21": ("P0.05", "LCD_CS"), "22": ("P0.06", "LCD_EXTCOMIN"), "23": ("P0.07", "LCD_DISP"),
    "24": ("P0.08", "LCD_BL"), "28": ("VDD", "3V0"), "30": ("VDDH", "3V0"), "31": ("DCCH", NC), "32": ("VBUS", NC),
    "36": ("P0.14", "FLASH_CS"), "37": ("P0.13", "FLASH_MISO"), "38": ("P0.16", "FLASH_SCK"), "39": ("P0.15", "FLASH_MOSI"),
    "40": ("P0.18/nRESET", "NRESET"), "41": ("P0.17", "BTN"), "42": ("P0.19", "VIB"), "45": ("P0.23", "CHG_STAT"),
    "51": ("SWDIO", "SWDIO"), "53": ("SWDCLK", "SWDCLK"),
    "1": ("GND", "GND"), "2": ("GND", "GND"), "15": ("GND", "GND"), "33": ("GND", "GND"), "55": ("GND", "GND"),
}
other = {"3": "P1.10", "4": "P1.11", "5": "P1.12", "6": "P1.13", "7": "P1.14", "8": "P1.15", "10": "P0.29", "11": "P0.02",
         "12": "P0.31", "13": "P0.28", "14": "P0.30", "20": "P0.04", "25": "P1.08", "26": "P1.09", "27": "P0.11", "29": "P0.12",
         "34": "D-", "35": "D+", "43": "P0.21", "44": "P0.20", "46": "P0.22", "47": "P1.00", "48": "P0.24", "49": "P0.25",
         "50": "P1.02", "52": "P0.09", "54": "P0.10", "56": "P1.04", "57": "P1.06", "58": "P1.07", "59": "P1.05", "60": "P1.03",
         "61": "P1.01"}
pins = [(n, used[n][0], used[n][1]) if n in used else (n, other[n], NC) for n in map(str, range(1, 62))]
part("U1", "MDBT50Q-1MV2", "RF_Module:Raytac_MDBT50Q", pins, mpn="MDBT50Q-1MV2", mfr="Raytac", lcsc="C5118826",
     desc="nRF52840 BLE module, chip antenna, FCC ID SH6MDBT50Q (LCSC out of stock Nov 23: consign)", src="https://www.sparkfun.com/nordic-nrf52840-ble-module-mdbt50q-1mv2.html")
two("C1", "10uF", C0603, "3V0", "GND", mpn="CL10A106KP8NNNC", mfr="Samsung", lcsc="C19702", desc="module bulk decoupling (next to VDD/VDDH pads)")
two("C2", "100nF", C0402, "3V0", "GND", mpn="CL05B104KO5NNNC", mfr="Samsung", lcsc="C1525", desc="module decoupling")
two("Y1", "32.768kHz", "Crystal:Crystal_SMD_3215-2Pin_3.2x1.5mm", "XL1", "XL2", mpn="Q13FC13500004", mfr="Epson", lcsc="C32346",
    desc="FC-135 32.768 kHz 12.5 pF, low-frequency clock (ESPR_LSE_ENABLE)")
two("C3", "18pF", C0402, "XL1", "GND", mpn="CL05C180JB5NNNC", mfr="Samsung", lcsc="C307443", desc="crystal load: 2 x (12.5 pF - ~3.5 pF stray)")
two("C4", "18pF", C0402, "XL2", "GND", mpn="CL05C180JB5NNNC", mfr="Samsung", lcsc="C307443", desc="crystal load: 2 x (12.5 pF - ~3.5 pF stray)")

# ---------------------------------------------------------------- power: USB-C in, charger, 3.0 V rail, battery sense
part("J3", "USB-C (power only)", "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12",
     [("A1", "GND", "GND"), ("A4", "VBUS", "VBUS"), ("A5", "CC1", "CC1"), ("A6", "D+", NC), ("A7", "D-", NC), ("A8", "SBU1", NC),
      ("A9", "VBUS", "VBUS"), ("A12", "GND", "GND"), ("B1", "GND", "GND"), ("B4", "VBUS", "VBUS"), ("B5", "CC2", "CC2"),
      ("B6", "D+", NC), ("B7", "D-", NC), ("B8", "SBU2", NC), ("B9", "VBUS", "VBUS"), ("B12", "GND", "GND"), ("S1", "SHIELD", "GND")],
     mpn="TYPE-C-31-M-12", mfr="Korean Hroparts", lcsc="C165948", desc="USB-C receptacle, charge power only")
two("R13", "5.1k", R0402, "CC1", "GND", mpn="0402WGF5101TCE", mfr="UNI-ROYAL", lcsc="C25905", desc="USB-C sink Rd")
two("R14", "5.1k", R0402, "CC2", "GND", mpn="0402WGF5101TCE", mfr="UNI-ROYAL", lcsc="C25905", desc="USB-C sink Rd")
two("D2", "TVS 5V", "Diode_SMD:D_SOD-323", "VBUS", "GND", mpn="PESD5V0S1BA", mfr="DOWO (Nexperia original)", lcsc="C2985486", desc="VBUS ESD clamp (bidirectional)")
part("U2", "MCP73832T-2ACI/OT", "Package_TO_SOT_SMD:SOT-23-5",
     [("1", "STAT", "CHG_STAT"), ("2", "VSS", "GND"), ("3", "VBAT", "VBAT"), ("4", "VDD", "VBUS"), ("5", "PROG", "PROG")],
     mpn="MCP73832T-2ACI/OT", mfr="Microchip", lcsc="C38066", desc="Li-ion charger 4.20 V, open-drain STAT")
two("R1", "13k", R0402, "PROG", "GND", mpn="0402WGF1302TCE", mfr="UNI-ROYAL", lcsc="C25754", desc="charge current 1000 V / 13k = 77 mA")
two("C5", "10uF", C0603, "VBUS", "GND", mpn="CL10A106KP8NNNC", mfr="Samsung", lcsc="C19702", desc="charger input")
two("C6", "10uF", C0603, "VBAT", "GND", mpn="CL10A106KP8NNNC", mfr="Samsung", lcsc="C19702", desc="charger output / battery node")
two("C14", "10uF", C0603, "VBAT", "GND", mpn="CL10A106KP8NNNC", mfr="Samsung", lcsc="C19702", desc="battery-rail reservoir for motor start (review finding)")
part("U3", "TPS7A0230PDBVR", "Package_TO_SOT_SMD:SOT-23-5",
     [("1", "IN", "VBAT"), ("2", "GND", "GND"), ("3", "EN", "VBAT"), ("4", "NC", NC), ("5", "OUT", "3V0")],
     mpn="TPS7A0230PDBVR", mfr="Texas Instruments", lcsc="C3747031", desc="3.0 V 200 mA LDO, 25-60 nA quiescent")
two("C7", "1uF", C0402, "VBAT", "GND", mpn="CL05A105KA5NQNC", mfr="Samsung", lcsc="C52923", desc="LDO input")
two("C8", "1uF", C0402, "3V0", "GND", mpn="CL05A105KA5NQNC", mfr="Samsung", lcsc="C52923", desc="LDO output")
two("R11", "3.3M", R0402, "VBAT", "BAT_SENSE", mpn="RC0402FR-073M3L", mfr="Yageo", lcsc="C470023", desc="battery divider top (set batFullVoltage 0.3256 in firmware)")
two("R12", "1M", R0402, "BAT_SENSE", "GND", mpn="0402WGF1004TCE", mfr="UNI-ROYAL", lcsc="C26083", desc="battery divider bottom")
two("C13", "100nF", C0402, "BAT_SENSE", "GND", mpn="CL05B104KO5NNNC", mfr="Samsung", lcsc="C1525", desc="ADC reservoir for the high-impedance divider")
part("JP1", "Battery link", "Jumper:SolderJumper-2_P1.3mm_Open_RoundedPad1.0x1.5mm", [("1", "A", "BATP"), ("2", "B", "VBAT")],
     mpn="(solder bridge)", mfr="-", desc="open until final assembly: isolates the cell while motor/display are fitted; bridge with solder last", hand=True)
part("BT1", "LiPo 150 mAh (protected)", "PQ:Pad_2x_wire", [("1", "+", "BATP"), ("2", "-", "GND")],
     mpn="1317", mfr="Adafruit", desc="3.7 V 150 mAh 402025 cell with protection PCM; leads soldered to pads", hand=True,
     src="https://www.adafruit.com/products/1317")

# ---------------------------------------------------------------- display (JDI LPM013M126, 10-pin FPC) and backlight
part("J1", "LCD FPC 10p 0.5mm", "Connector_FFC-FPC:Hirose_FH12-10S-0.5SH_1x10-1MP_P0.50mm_Horizontal",
     [("1", "SCLK", "LCD_SCK"), ("2", "SI", "LCD_MOSI"), ("3", "SCS", "LCD_CS"), ("4", "EXTCOMIN", "LCD_EXTCOMIN"),
      ("5", "DISP", "LCD_DISP"), ("6", "VDDA", "3V0"), ("7", "VDD", "3V0"), ("8", "EXTMODE", "3V0"), ("9", "VSS", "GND"),
      ("10", "VSSA", "GND"), ("MP", "MP", "GND")],
     mpn="FH12-10S-0.5SH(55)", mfr="Hirose", lcsc="C506791", desc="ZIF FPC connector, bottom contact, for LPM013M126 FPC")
two("C10", "1uF", C0402, "3V0", "GND", mpn="CL05A105KA5NQNC", mfr="Samsung", lcsc="C52923", desc="LCD supply")
two("C11", "100nF", C0402, "3V0", "GND", mpn="CL05B104KO5NNNC", mfr="Samsung", lcsc="C1525", desc="LCD supply")
two("R3", "100k", R0402, "LCD_DISP", "GND", mpn="0402WGF1003TCE", mfr="UNI-ROYAL", lcsc="C25741", desc="display off while the MCU is in reset")
two("R4", "100k", R0402, "LCD_CS", "GND", mpn="0402WGF1003TCE", mfr="UNI-ROYAL", lcsc="C25741", desc="LCD deselected in reset (SCS is active high)")
part("J2", "Backlight FPC 4p 0.5mm", "PQ:FPC_4p_0.5mm_pads",
     [("1", "K2", "BL_K2"), ("2", "K1", "BL_K1"), ("3", "A", "3V0"), ("4", "A", "3V0")],
     mpn="(pads only)", mfr="-", desc="backlight FPC tail soldered to 4 pads; datasheet connector 503480-0400 is not stocked anywhere found", hand=True)
two("R5", "47R", R0402, "BL_K1", "BL_SW", mpn="0402WGF470JTCE", mfr="UNI-ROYAL", lcsc="C25118", desc="backlight LED 1: (3.0-2.67)/47 = 7 mA")
two("R6", "47R", R0402, "BL_K2", "BL_SW", mpn="0402WGF470JTCE", mfr="UNI-ROYAL", lcsc="C25118", desc="backlight LED 2")
part("Q2", "AO3400A", "Package_TO_SOT_SMD:SOT-23", [("1", "G", "LCD_BL"), ("2", "S", "GND"), ("3", "D", "BL_SW")],
     mpn="AO3400A", mfr="Alpha & Omega", lcsc="C20917", desc="backlight low-side switch (LCD_BL active high, PWM)")
two("R7", "100k", R0402, "LCD_BL", "GND", mpn="0402WGF1003TCE", mfr="UNI-ROYAL", lcsc="C25741", desc="backlight off in reset")

# ---------------------------------------------------------------- storage
part("U4", "GD25Q64E", "Package_SO:SOIC-8_5.23x5.23mm_P1.27mm",
     [("1", "CS#", "FLASH_CS"), ("2", "DO/IO1", "FLASH_MISO"), ("3", "WP#/IO2", "3V0"), ("4", "GND", "GND"),
      ("5", "DI/IO0", "FLASH_MOSI"), ("6", "CLK", "FLASH_SCK"), ("7", "HOLD#/IO3", "3V0"), ("8", "VCC", "3V0")],
     mpn="GD25Q64ESIG", mfr="GigaDevice", lcsc="C2685734", desc="8 MB SPI NOR flash (Espruino Storage), same family as Bangle.js 2")
two("C9", "100nF", C0402, "3V0", "GND", mpn="CL05B104KO5NNNC", mfr="Samsung", lcsc="C1525", desc="flash decoupling")
two("R2", "100k", R0402, "3V0", "FLASH_CS", mpn="0402WGF1003TCE", mfr="UNI-ROYAL", lcsc="C25741", desc="flash deselected in reset")

# ---------------------------------------------------------------- vibration motor, button
part("M1", "ERM coin motor 10 mm 3 V", "PQ:Pad_2x_wire_small", [("1", "+", "VBAT"), ("2", "-", "MOTOR_N")],
     mpn="FIT0774", mfr="DFRobot", desc="coin vibration motor, leads soldered to pads", hand=True, src="https://www.digikey.com/en/products/detail/dfrobot/FIT0774/14322639")
part("Q1", "AO3400A", "Package_TO_SOT_SMD:SOT-23", [("1", "G", "VIB"), ("2", "S", "GND"), ("3", "D", "MOTOR_N")],
     mpn="AO3400A", mfr="Alpha & Omega", lcsc="C20917", desc="motor low-side switch (VIBRATE active high, PWM)")
two("R8", "100k", R0402, "VIB", "GND", mpn="0402WGF1003TCE", mfr="UNI-ROYAL", lcsc="C25741", desc="motor off in reset")
part("D1", "1N4148WS", "Diode_SMD:D_SOD-323", [("1", "K", "VBAT"), ("2", "A", "MOTOR_N")],
     mpn="1N4148WS", mfr="various", lcsc="C2128", desc="motor flyback diode")
part("SW1", "Side button", "Button_Switch_SMD:SW_Push_1P1T-MP_NO_Horizontal_Alps_SKRTLAE010",
     [("1", "1", "BTN"), ("2", "2", "GND"), ("MP", "MP", "GND")],
     mpn="SKRTLAE010", mfr="Alps Alpine", lcsc="C110293", desc="side-push tactile switch to GND (BTN1; firmware enables the internal pull-up, jshardware.c 1209-1211)")

# ---------------------------------------------------------------- programming and test access
part("J4", "TC2030-NL (SWD)", "Connector:Tag-Connect_TC2030-IDC-NL_2x03_P1.27mm_Vertical",
     [("1", "VCC", "3V0"), ("2", "SWDIO", "SWDIO"), ("3", "nRESET", "NRESET"), ("4", "SWCLK", "SWDCLK"), ("5", "GND", "GND"), ("6", "SWO", NC)],
     mpn="(footprint only)", mfr="Tag-Connect", desc="pogo footprint for TC2030-IDC-NL cable; no part fitted", dnp=True)
for ref, net in (("TP1", "3V0"), ("TP2", "VBUS"), ("TP3", "GND"), ("TP4", "VBAT")):
    part(ref, net, "TestPoint:TestPoint_Pad_D1.5mm", [("1", "1", net)], desc="test pad " + net, dnp=True)

def nets():
    n = {}
    for p in P.values():
        for num, name, net in p["pins"]:
            if net is not NC:
                n.setdefault(net, []).append((p["ref"], num))
    return n

if __name__ == "__main__":
    n = nets()
    print(len(P), "parts,", len(n), "nets")
    for k in sorted(n):
        print(f"{k:14s} {len(n[k]):2d}  " + " ".join(f"{r}.{p}" for r, p in n[k]))
    single = [k for k, v in n.items() if len(v) < 2]
    print("single-pin nets:", single)
