"""Placement check on out/placed.kicad_pcb: courtyard bounding-box overlaps per side, parts off the board, parts in the motor circle."""
import sys, os, math, pcbnew
sys.path.insert(0, os.path.dirname(__file__)); import gen_pcb as G
b = pcbnew.LoadBoard(G.PLACED); T = pcbnew.ToMM; box = {}
for f in b.GetFootprints():
    r = f.GetReference()
    if r.startswith("H"): continue
    side = "B" if f.IsFlipped() else "F"
    cy = f.GetCourtyard(pcbnew.B_CrtYd if side == "B" else pcbnew.F_CrtYd); bb = cy.BBox() if cy.OutlineCount() else None
    if bb is None or bb.GetWidth() == 0:
        xs = [T(p.GetBoundingBox().GetLeft()) for p in f.Pads()] + [T(p.GetBoundingBox().GetRight()) for p in f.Pads()]; ys = [T(p.GetBoundingBox().GetTop()) for p in f.Pads()] + [T(p.GetBoundingBox().GetBottom()) for p in f.Pads()]
        box[r] = (side, min(xs) - G.OX, min(ys) - G.OY, max(xs) - G.OX, max(ys) - G.OY)
    else: box[r] = (side, T(bb.GetLeft()) - G.OX, T(bb.GetTop()) - G.OY, T(bb.GetRight()) - G.OX, T(bb.GetBottom()) - G.OY)
bad = 0; refs = sorted(box)
for i, a in enumerate(refs):
    A = box[a]
    if a not in ("J3", "BT1", "SW1", "U1") and (A[1] < 0.2 or A[2] < 0.2 or A[3] > G.W - 0.2 or A[4] > G.H - 0.2): print("OFF BOARD", a, [round(v, 2) for v in A[1:]]); bad += 1
    if A[0] == "F" and a != "M1":
        cx = min(max(G.MOTOR[0], A[1]), A[3]); cyy = min(max(G.MOTOR[1], A[2]), A[4])
        if math.hypot(cx - G.MOTOR[0], cyy - G.MOTOR[1]) < G.MOTOR[2]: print("IN MOTOR CIRCLE", a); bad += 1
    for c in refs[i + 1:]:
        B = box[c]
        if A[0] != B[0]: continue
        ox = min(A[3], B[3]) - max(A[1], B[1]); oy = min(A[4], B[4]) - max(A[2], B[2])
        if ox > 0.01 and oy > 0.01: print(f"OVERLAP {a}/{c} side {A[0]}: {ox:.2f} x {oy:.2f}"); bad += 1
for r in sys.argv[1:]:
    f = b.FindFootprintByReference(r); print(r, [round(v, 2) for v in box[r][1:]], " ".join(f"{p.GetNumber()}:{p.GetNetname()}@({T(p.GetPosition().x) - G.OX:.2f},{T(p.GetPosition().y) - G.OY:.2f})" for p in f.Pads() if p.GetNetname())[:700])
print("PLACEMENT:", "OK" if not bad else f"{bad} problems")
