"""BOM (engineering + JLCPCB format), placement file (JLCPCB CPL) and a parts cost roll-up, all from design.py.
Prices are the figures seen on supplier pages on 2026-11-23 (see research/*.md). 'seen' = a worker or I read it on the page;
'est' = estimate, not read anywhere. Nothing here is a quote."""
import sys, os, csv, re
sys.path.insert(0, os.path.dirname(__file__)); import design as D
ROOT = os.path.join(os.path.dirname(__file__), ".."); FAB = os.path.join(ROOT, "out", "fab"); os.makedirs(FAB, exist_ok=True)
# mpn -> (unit price qty 1, unit price qty ~100, status, where)
PRICE = {
 "MDBT50Q-1MV2": (8.95, 8.06, "seen (SparkFun WRL-21605; LCSC out of stock)", "https://www.sparkfun.com/nordic-nrf52840-ble-module-mdbt50q-1mv2.html"),
 "NPM1300-QEAA-R7": (3.42, 2.09, "seen (Mouser, sourcing review; 5,641 in stock)", "https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NPM1300-QEAA-R7/19722485"),
 "LIS2DH12TR": (1.79, 1.30, "seen (Mouser price, sourcing review; LCSC 297 in stock, DigiKey/Mouser none until Apr 2027; same-pad alternate LIS2DW12 C189624 needs its own driver)", "https://www.lcsc.com/product-detail/C110926.html"),
 "MLP2012H2R2MT0S1": (0.05, 0.03, "est", "https://www.lcsc.com/product-detail/C383369.html"),
 "Q13FC13500004": (0.0736, 0.0736, "seen (from-price)", "https://www.lcsc.com/product-detail/C32346.html"),
 "FH12-10S-0.5SH(55)": (0.3016, 0.3016, "seen (from-price)", "https://jlcpcb.com/partdetail/HRS_Hirose-FH12_10S_0_5SH_55/C506791"),
 "SKRTLAE010": (0.0744, 0.0744, "seen (from-price)", "https://www.lcsc.com/product-detail/C110293.html"),
 "AO3400A": (0.0429, 0.0429, "seen (from-price)", "https://jlcpcb.com/partdetail/C20917"),
 "PESD5V0S1BA": (0.0125, 0.0125, "seen (from-price)", "https://jlcpcb.com/partdetail/C2985486"),
 "1N4148WS": (0.0053, 0.0053, "seen (from-price)", "https://www.lcsc.com/product-detail/C2128.html"),
 "NCP15XH103F03RC": (0.03, 0.02, "est", "https://www.lcsc.com/product-detail/C77131.html"),
 "1317": (5.95, 4.76, "seen", "https://www.adafruit.com/products/1317"),
 "USB4715-GF-A": (1.61, 1.17, "seen (Mouser via Octopart, 2,382 in stock; LCSC out of stock)", "https://octopart.com/part/gct/USB4715-GF-A"),
 "SMF5.0A": (0.0546, 0.0546, "seen (from-price, LCSC, 56,440 in stock)", "https://www.lcsc.com/product-detail/C151296.html"),
 "VCLP0820B004L": (3.15, 2.4713, "seen (DigiKey, 1,766 in stock)", "https://www.digikey.com/en/products/detail/vybronics-inc/VCLP0820B004L/10285889"),
}
PASSIVE = (0.01, 0.003, "est (Basic parts seen from $0.0005-0.01)", "JLCPCB library")
OFFBOARD = [  # not on the PCB BOM but needed per unit
 ("LCD1", "Sharp LS013B7DH03 1.28in 128x128 memory LCD (reflective, no light)", "LS013B7DH03", "Sharp", 12.39, 7.97, "seen (DigiKey, 33,493 in stock, Active)", "https://www.digikey.com/en/products/detail/sharp-microelectronics/LS013B7DH03/5300387"),
 ("GSK1", "Gasket for the USB-C receptacle (silicone, fitted after soldering, pressed against the case wall)", "USBTJ-04", "GCT", 0.20, 0.20, "est (sold with the connector as USB4715-GF-A-KIT at about the same price as the bare connector; separate price not seen)", "https://octopart.com/part/gct/USB4715-GF-A"),
 ("FL1", "OPTION for night games: Azumo LS013B7DH03 with frontlight bonded on (the DigiKey 11049-06_A1 at $47.87 is the film alone); LED voltage unpublished", "11049-06_T7", "Azumo", 32.08, 32.08, "seen at one distributor (ichome), sourcing review; replaces LCD1 when used; not in totals", "see reviews/sourcing.md"),
]
def price(p):
    if p["mpn"] in PRICE: return PRICE[p["mpn"]]
    if p["ref"][0] in "RC": return PASSIVE
    return (0.0, 0.0, "n/a", "")
def link(p):
    if p["src"]: return p["src"]
    if p["mpn"] in PRICE: return PRICE[p["mpn"]][3]
    return f"https://www.lcsc.com/product-detail/{p['lcsc']}.html" if p["lcsc"] else "LCSC number not verified: search the MPN"
groups = {}
for p in D.P.values():
    k = (p["value"], p["fp"], p["mpn"], p["dnp"])
    groups.setdefault(k, []).append(p)
def refkey(r): m = re.match(r"([A-Z]+)(\d+)", r); return (m.group(1), int(m.group(2)))
rows = []; tot1 = tot100 = 0.0
for k, ps in sorted(groups.items(), key=lambda kv: refkey(kv[1][0]["ref"])):
    p = ps[0]; refs = sorted([q["ref"] for q in ps], key=refkey); pr = price(p)
    fit = "DNP (not fitted)" if p["dnp"] else ("hand-soldered after SMT" if p["hand"] else "SMT")
    n = 0 if p["dnp"] else len(ps); tot1 += n * pr[0]; tot100 += n * pr[1]
    desc = "; ".join(dict.fromkeys(q["desc"] for q in sorted(ps, key=lambda q: refkey(q["ref"]))))
    rows.append([",".join(refs), len(ps), p["value"], desc, p["mfr"], p["mpn"], p["fp"].split(":")[1], p["lcsc"] or "-", fit, f"{pr[0]:.4f}", f"{pr[1]:.4f}", pr[2], link(p)])
with open(os.path.join(ROOT, "docs", "BOM.csv"), "w", newline="") as f:
    w = csv.writer(f); w.writerow(["Refs", "Qty", "Value", "Function", "Manufacturer", "MPN", "Footprint", "LCSC", "Assembly", "USD each @1", "USD each @~100", "Price status", "Buy / source"])
    w.writerows(rows)
    for r, d, mpn, mfr, a, b, st, u in OFFBOARD: w.writerow([r, 1, d, "display / option", mfr, mpn, "-", "-", "fitted by hand", f"{a:.2f}", f"{b:.2f}", st, u])
with open(os.path.join(FAB, "bom_jlcpcb.csv"), "w", newline="") as f:
    w = csv.writer(f); w.writerow(["Comment", "Designator", "Footprint", "LCSC Part #", "MPN"])
    for k, ps in groups.items():
        p = ps[0]
        if p["dnp"] or p["hand"]: continue
        w.writerow([p["value"], ",".join(sorted([q["ref"] for q in ps], key=refkey)), p["fp"].split(":")[1], p["lcsc"], p["mpn"]])
# JLCPCB placement file from KiCad's own position export
pos = os.path.join(FAB, "pitchiq_watch-pos.csv")
if os.path.exists(pos):
    with open(pos) as f, open(os.path.join(FAB, "cpl_jlcpcb.csv"), "w", newline="") as g:
        r = csv.DictReader(f); w = csv.writer(g); w.writerow(["Designator", "Mid X", "Mid Y", "Layer", "Rotation"]); n = 0
        for row in r:
            if D.P[row["Ref"]]["dnp"] or D.P[row["Ref"]]["hand"]: continue
            w.writerow([row["Ref"], row["PosX"] + "mm", row["PosY"] + "mm", "Top" if row["Side"] == "top" else "Bottom", row["Rot"]]); n += 1
    print("CPL rows:", n)
smt = [p for p in D.P.values() if not p["dnp"] and not p["hand"]]
noverified = sorted({p["mpn"] for p in smt if not p["lcsc"]})
print(f"BOM lines {len(rows)}, SMT parts {len(smt)}, unique SMT part numbers {len({p['mpn'] for p in smt})}")
print(f"on-board parts incl. battery+motor: ${tot1:.2f} @1, ${tot100:.2f} @~100; display +$12.39 @1 / +$7.97 @100; with display: ${tot1+12.39:.2f} @1, ${tot100+7.97:.2f} @~100")
print("JLCPCB sides:", {sd: sum(1 for p in smt if p["side"] == sd) for sd in "FB"})
print("SMT parts without an LCSC number:", noverified)
sys.exit(1 if noverified else 0)
