"""Compare the nets on the board's pads with design.py. Exit 1 on any difference."""
import sys, os, pcbnew
sys.path.insert(0, os.path.dirname(__file__)); import design as D
b = pcbnew.LoadBoard(sys.argv[1]); bad = 0; seen = set()
for f in b.GetFootprints():
    ref = f.GetReference(); seen.add(ref); want = {num: net for num, _, net in D.P[ref]["pins"]}
    for p in f.Pads():
        num = p.GetNumber()
        if not num: continue
        w = want.get(num); w = "" if w is None else w
        if p.GetNetname() != w: bad += 1; print("PAD NET DIFF", ref, num, repr(p.GetNetname()), "want", repr(w))
if seen != set(D.P): bad += 1; print("FOOTPRINT SET DIFF", seen ^ set(D.P))
tr = [t for t in b.GetTracks()]
print(f"board check: {len(seen)} footprints, {sum(1 for t in tr if t.Type()==pcbnew.PCB_VIA_T)} vias, {sum(1 for t in tr if t.Type()!=pcbnew.PCB_VIA_T)} track segments, copper layers {b.GetCopperLayerCount()}, pad-net differences: {bad}")
sys.exit(1 if bad else 0)
