"""Fabrication outputs must come from the current board (rev E audit finding C1: rev E's first package carried rev D files).
Checks: every file in out/fab is newer than the board file; the placement file lists exactly the machine-placed parts; each row's
position equals the footprint's position on the board; each rotation equals the rule in gen_bom.py; the battery polarity marks
are in the bottom silkscreen Gerber."""
import sys, os, csv, glob, pcbnew
sys.path.insert(0, os.path.dirname(__file__)); import design as D, gen_pcb as G
HERE = os.path.dirname(os.path.abspath(__file__)); FAB = os.path.join(HERE, "..", "out", "fab"); bad = []
tb = os.path.getmtime(G.PCB)
old = [os.path.relpath(f, FAB) for f in glob.glob(FAB + "/**/*", recursive=True) if os.path.isfile(f) and os.path.getmtime(f) < tb]
if old: bad.append(f"{len(old)} fab files older than the board: {old[:4]}")
b = pcbnew.LoadBoard(G.PCB); rows = {r["Designator"]: r for r in csv.DictReader(open(os.path.join(FAB, "cpl_jlcpcb.csv")))}
want = {r for r, p in D.P.items() if not p["dnp"] and not p["hand"]}
if set(rows) != want: bad.append(f"placement file parts differ from the design: extra {sorted(set(rows) - want)}, missing {sorted(want - set(rows))}")
worst = 0.0
for ref, r in rows.items():
    f = b.FindFootprintByReference(ref)
    if f is None: bad.append(ref + " not on the board"); continue
    x = float(r["Mid X"].replace("mm", "")); y = -float(r["Mid Y"].replace("mm", ""))
    xs = [pcbnew.ToMM(p.GetPosition().x) for p in f.Pads()]; ys = [pcbnew.ToMM(p.GetPosition().y) for p in f.Pads()]
    fx, fy = pcbnew.ToMM(f.GetPosition().x), pcbnew.ToMM(f.GetPosition().y)
    d = max(abs(x - fx), abs(y - fy)); worst = max(worst, d)
    if d > 0.02: bad.append(f"{ref}: placement file ({x:.2f}, {y:.2f}) but board ({fx:.2f}, {fy:.2f})")
    rot = f.GetOrientationDegrees() % 360; side = "Bottom" if f.IsFlipped() else "Top"
    exp = (180.0 - rot) % 360.0 if side == "Bottom" else rot
    if D.P[ref]["fp"].endswith("SOT-23"): exp = (exp - 90.0) % 360.0
    if r["Layer"] != side or abs((float(r["Rotation"]) - exp + 180) % 360 - 180) > 0.5: bad.append(f"{ref}: placement file {r['Layer']} {r['Rotation']} but board gives {side} {exp:g}")
silk = [t.GetText() for t in b.GetDrawings() if isinstance(t, pcbnew.PCB_TEXT) and t.GetLayer() == pcbnew.B_SilkS]
if sorted(silk) != ["+", "-"]: bad.append(f"battery polarity marks on the bottom silkscreen of the board: {silk}")
g = open(os.path.join(FAB, "gerber", "pitchiq_watch-B_Silkscreen.gbo")).read()
if g.count("D01*") + g.count("D03*") < 4: bad.append("bottom silkscreen Gerber has no drawn objects (polarity marks missing)")
print(f"fab check: {len(rows)} placement rows, worst position difference {worst:.3f} mm, bottom silk texts {sorted(silk)}, problems: {len(bad)}")
for m in bad[:12]: print("  FAB PROBLEM:", m)
sys.exit(1 if bad else 0)
