"""No copper of any kind (tracks, vias, filled planes) in the antenna strip: board x 6..26 mm, y 0..4.0 mm, all 4 layers.
The module's own pads are the only copper allowed there. Exit 1 if anything else is found."""
import sys, pcbnew
b = pcbnew.LoadBoard(sys.argv[1]); mm = pcbnew.FromMM; OX, OY = 100.0, 80.0
box = pcbnew.BOX2I(pcbnew.VECTOR2I(mm(OX + 6.05), mm(OY + 0.0)), pcbnew.VECTOR2I(mm(19.9), mm(4.0)))   # interior of the strip (plane fill stops exactly on its x = 6 / 26 edges)
bad = 0
for t in b.GetTracks():
    if box.Intersects(t.GetBoundingBox()): bad += 1; print("track/via in antenna strip:", t.GetNetname())
layers = [pcbnew.F_Cu, pcbnew.In1_Cu, pcbnew.In2_Cu, pcbnew.B_Cu]
for z in b.Zones():
    if z.GetIsRuleArea(): continue
    for L in layers:
        if not z.IsOnLayer(L): continue
        poly = z.GetFilledPolysList(L)
        for i in range(poly.OutlineCount()):
            o = poly.Outline(i)
            for k in range(o.PointCount()):
                p = o.CPoint(k)
                if box.Contains(p) and p.y < mm(OY + 3.95): bad += 1; print("plane copper in antenna strip:", z.GetNetname(), b.GetLayerName(L), pcbnew.ToMM(p.x) - OX, pcbnew.ToMM(p.y) - OY); break
print(f"antenna strip check (x 6-26 mm, y 0-4 mm, 4 layers): foreign copper items {bad}")
sys.exit(1 if bad else 0)
