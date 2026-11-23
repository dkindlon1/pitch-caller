"""Generate kicad/pitchiq_watch.kicad_sch (KiCad 7) from design.py.
Style: one box symbol per part, every used pin tied to a global net label, unused pins carry a no-connect flag.
It is a real, editable schematic; it is laid out by script, so it is a labelled-net schematic, not a hand-drawn one."""
import uuid, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import design as D

OUT = os.path.join(os.path.dirname(__file__), "..", "kicad", "pitchiq_watch.kicad_sch")
ROOT = "6f1d2c3a-0001-4a10-9c10-70697463686b"
G = 2.54
def U(): return str(uuid.uuid4())
def q(s): return '"' + str(s).replace('\\', '\\\\').replace('"', '\\"') + '"'
FONT = "(effects (font (size 1.27 1.27)))"

def geometry(p):
    pins = p["pins"]
    if len(pins) == 2: left, right = pins[:1], pins[1:]
    elif len(pins) == 1: left, right = pins, []
    else:
        h = (len(pins) + 1) // 2
        left, right = pins[:h], pins[h:]
    rows = max(len(left), len(right))
    wname = max([len(n) for _, n, _ in pins] + [4])
    w = max(4, int((wname * 2 * 1.1 + 6) / G) + 1) * G if len(pins) > 2 else 3 * G
    w = round(w / (2 * G)) * 2 * G
    h = (rows + 1) * G
    return left, right, w, h

def libsym(name, p):
    left, right, w, h = geometry(p)
    s = [f'    (symbol {q("PQ:" + name)} (pin_names (offset 1.016)) (in_bom yes) (on_board yes)']
    for k, v, hide in (("Reference", p["ref"].rstrip("0123456789"), ""), ("Value", p["value"], ""), ("Footprint", p["fp"], " hide"), ("Datasheet", "", " hide")):
        s.append(f'      (property {q(k)} {q(v)} (at 0 0 0) (effects (font (size 1.27 1.27)){hide}))')
    s.append(f'      (symbol {q(name + "_0_1")} (rectangle (start {-w/2:.2f} {h/2:.2f}) (end {w/2:.2f} {-h/2:.2f}) (stroke (width 0.254) (type default)) (fill (type background))))')
    s.append(f'      (symbol {q(name + "_1_1")}')
    pos = {}
    for side, lst in (("L", left), ("R", right)):
        for i, (num, nm, net) in enumerate(lst):
            y = h / 2 - (i + 1) * G
            x = -w / 2 - G if side == "L" else w / 2 + G
            ang = 0 if side == "L" else 180
            s.append(f'        (pin passive line (at {x:.2f} {y:.2f} {ang}) (length 2.54) (name {q(nm)} {FONT}) (number {q(num)} {FONT}))')
            pos[num] = (x, y, side)
    s.append('      )')
    s.append('    )')
    return "\n".join(s), pos, w, h

# sheet placement: columns of blocks (ref order), in mm on an A2 sheet
COLS = [
    (60,  ["U1"]),
    (150, ["Y1", "C3", "C4", "C1", "C2", "R3", "R4", "R16", "TP1", "TP2", "TP3", "TP4", "TP5", "TP6", "R17", "R18", "R19", "D4", "D5", "D6", "TP7", "TP8", "TP9"]),
    (225, ["U2", "L1", "L2", "R1", "R2", "RT1", "C12", "D2", "C25"]),
    (295, ["C5", "C6", "C7", "C8", "C9", "C10", "C11", "BT1", "JP1", "SW1", "D3"]),
    (365, ["U3", "C14", "C15", "C16", "C17", "R5", "U5", "L3", "C18", "C19", "C20", "R6", "R7", "R8"]),
    (440, ["J1", "C21", "C22", "C23", "R9", "R10", "R11", "R12", "J2", "R13", "Q2", "R14"]),
    (515, ["U4", "C13", "M1", "Q1", "R15", "D1", "C24"]),
]
TITLES = {60: "Radio module (nRF52840)", 150: "Clock, decoupling, I2C pull-ups, cradle and test pads", 225: "Power chip nPM1300",
          295: "Rails, battery, button", 365: "Heart rate (bottom side) and 5 V LED boost", 440: "Display and frontlight", 515: "Accelerometer, vibration motor"}

def main():
    placed = set()
    lib, body = [], []
    for x, refs in COLS:
        y = 30.0
        body.append(f'  (text {q(TITLES[x])} (at {x - 20:.2f} 18 0) (effects (font (size 2.2 2.2) bold) (justify left bottom)) (uuid {U()}))')
        for ref in refs:
            p = D.P[ref]; placed.add(ref)
            name = ref
            sym, pos, w, h = libsym(name, p)
            lib.append(sym)
            cx = round(x / 1.27) * 1.27; cy = round((y + h / 2) / 1.27) * 1.27
            props = [("Reference", ref, cx - w / 2, cy - h / 2 - 3.2, ""), ("Value", p["value"], cx - w / 2, cy - h / 2 - 1.2, ""),
                     ("Footprint", p["fp"], cx, cy, " hide"), ("Datasheet", "", cx, cy, " hide"),
                     ("MPN", p["mpn"], cx, cy, " hide"), ("Manufacturer", p["mfr"], cx, cy, " hide"), ("LCSC", p["lcsc"], cx, cy, " hide"),
                     ("Description", p["desc"], cx, cy, " hide")]
            s = [f'  (symbol (lib_id {q("PQ:" + name)}) (at {cx:.2f} {cy:.2f} 0) (unit 1) (in_bom {"no" if p["dnp"] else "yes"}) (on_board yes) (dnp {"yes" if p["dnp"] else "no"}) (uuid {U()})']
            for k, v, px, py, hide in props:
                s.append(f'    (property {q(k)} {q(v)} (at {px:.2f} {py:.2f} 0) (effects (font (size 1.27 1.27)) (justify left){hide}))')
            for num, _, _ in p["pins"]: s.append(f'    (pin {q(num)} (uuid {U()}))')
            s.append(f'    (instances (project "pitchiq_watch" (path {q("/" + ROOT)} (reference {q(ref)}) (unit 1))))')
            s.append('  )')
            body.append("\n".join(s))
            for num, nm, net in p["pins"]:
                px, py, side = pos[num]
                ax, ay = cx + px, cy - py
                if net is D.NC:
                    body.append(f'  (no_connect (at {ax:.2f} {ay:.2f}) (uuid {U()}))')
                else:
                    ang, just = (180, "right") if side == "L" else (0, "left")
                    body.append(f'  (global_label {q(net)} (shape passive) (at {ax:.2f} {ay:.2f} {ang}) (effects (font (size 1.27 1.27)) (justify {just})) (uuid {U()}))')
            y += h + 14
    missing = set(D.P) - placed
    assert not missing, missing
    notes = ["PitchIQ watch board rev B. Generated from scripts/design.py (edit there). Original pin map for our own Zephyr firmware.",
             "U3 (heart-rate sensor), its capacitors and all TP pads are on the BOTTOM side (wrist side). Everything else is on the top side.",
             "NOT BUILT. nPM1300 capacitor node assignment and unused-pin handling must be compared with Nordic's reference schematic before ordering."]
    for i, t in enumerate(notes):
        body.append(f'  (text {q(t)} (at 40 {560 + i * 5} 0) (effects (font (size 1.8 1.8)) (justify left bottom)) (uuid {U()}))')
    out = ['(kicad_sch (version 20230121) (generator pitchiq_gen)', f'  (uuid {ROOT})', '  (paper "A1")',
           '  (title_block (title "PitchIQ watch board") (rev "B") (company "PitchIQ") (comment 1 "nRF52840 module, nPM1300, LS013B7DH03, MAX30101, LIS2DH12; own firmware (Zephyr)"))',
           '  (lib_symbols', "\n".join(lib), '  )', "\n".join(body), '  (sheet_instances (path "/" (page "1")))', ')']
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w").write("\n".join(out) + "\n")
    print("wrote", OUT)

main()
