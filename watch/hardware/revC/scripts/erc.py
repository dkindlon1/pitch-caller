"""Scripted electrical-rule check on design.py, using the pin types declared there.
KiCad 7 (the only version installable here) has no command-line ERC, so this is NOT KiCad's ERC: it applies the same
classes of rule (undriven inputs, unpowered supply pins, output conflicts, floating pins, open-drain without pull-up,
one-pin nets, supply pins on the wrong rail). Run KiCad's own ERC in the GUI before ordering boards. Exit 1 on any error."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__)); import design as D
err = []; warn = []
nets = {}
for p in D.P.values():
    for num, name, net in p["pins"]:
        t = p["types"][num]
        if net is D.NC:
            if t not in ("nc",): err.append(f"{p['ref']}.{num} ({name}) type {t} is unconnected")
            continue
        if t == "nc": err.append(f"{p['ref']}.{num} ({name}) is declared no-connect but sits on net {net}")
        nets.setdefault(net, []).append((p["ref"], num, name, t))
POWER = {"GND", "3V0", "1V8", "VSYS", "VBAT", "VBUS", "5V_LED", "BATP", "VBUSOUT"}
def other_net(ref, num):
    p = D.P[ref]; o = [n for a, _, n in p["pins"] if a != num]
    return o[0] if len(p["pins"]) == 2 else None
for net, pins in sorted(nets.items()):
    ts = [t for *_, t in pins]
    if len(pins) < 2: err.append(f"net {net}: only one pin ({pins[0][0]}.{pins[0][1]})")
    drivers = [x for x in pins if x[3] in ("out", "po")]
    if net != "GND" and len(drivers) > 1: err.append(f"net {net}: more than one driving output: " + ", ".join(f"{r}.{n}" for r, n, *_ in drivers))
    if "pi" in ts and "po" not in ts: err.append(f"net {net}: supply pins with no source: " + ", ".join(f"{r}.{n}" for r, n, _, t in pins if t == "pi"))
    if "in" in ts and not any(t in ("out", "po", "io", "od", "pas") for t in ts): err.append(f"net {net}: inputs with nothing driving them")
    if "in" in ts and not any(t in ("out", "po", "io", "od") for t in ts):
        # only passives drive it: must be a strap (resistor/switch/divider), list it so a person can confirm
        warn.append(f"net {net}: input(s) set only by passive parts (strap or switch): " + ", ".join(f"{r}.{n}" for r, n, *_ in pins))
    if "od" in ts or (net.startswith("I2C_")):
        pulls = [r for r, n, _, t in pins if r.startswith("R") and other_net(r, n) in POWER - {"GND"}]
        if not pulls: err.append(f"net {net}: open-drain line without a pull-up resistor")
    if net in POWER and any(t in ("out", "od") for t in ts): err.append(f"net {net}: a logic output drives a supply net")
# supply pins must sit on a supply net; decoupling present on every IC supply net
for p in D.P.values():
    for num, name, net in p["pins"]:
        if p["types"][num] == "pi" and net not in POWER: err.append(f"{p['ref']}.{num} ({name}) is a supply pin on non-supply net {net}")
for net in ("3V0", "1V8", "VSYS", "VBAT", "VBUS"):   # rev C has no 5 V LED rail
    if not any(r.startswith("C") for r, *_ in nets.get(net, [])): err.append(f"supply net {net} has no capacitor")
# voltage domain table (declared limits; checked against the rail each supply pin is on)
RAIL_V = {"3V0": 3.0, "1V8": 1.8, "5V_LED": 5.0, "VSYS": 5.5, "VBAT": 4.45, "VBUS": 5.5}
LIMIT = {("U1", "28"): (1.7, 3.6), ("U1", "30"): (1.7, 3.6), 
         ("U4", "9"): (1.71, 3.6), ("U4", "10"): (1.71, 3.6), ("J1", "6"): (2.7, 3.3), ("J1", "7"): (2.7, 3.3), ("U2", "12"): (1.7, 5.5)}   # rev C: heart-rate sensor (U3) and boost (U5) removed
for (ref, num), (lo, hi) in LIMIT.items():
    net = dict((a, n) for a, _, n in D.P[ref]["pins"])[num]; v = RAIL_V.get(net)
    if v is None or not (lo <= v <= hi): err.append(f"{ref}.{num} on {net} ({v} V) is outside its {lo}-{hi} V range")
print(f"scripted ERC: {len(D.P)} parts, {len(nets)} nets, errors {len(err)}, strap/passive-driven notes {len(warn)}")
for e in err: print("  ERROR", e)
for w in warn: print("  note ", w)
sys.exit(1 if err else 0)
