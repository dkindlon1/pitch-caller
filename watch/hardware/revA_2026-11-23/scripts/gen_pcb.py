"""Build kicad/pitchiq_watch.kicad_pcb from design.py with KiCad's own pcbnew API.
Stages:  python3 gen_pcb.py place   -> placed, unrouted board + Specctra DSN
         python3 router.py          -> tracks and vias (scripts/router.py, a grid maze router)
         python3 gen_pcb.py finish  -> add planes, fill, save
Placement is by script (coordinates below). Routing is by autorouter. Nothing here is hand-tuned RF or signal-integrity work."""
import sys, os, pcbnew
sys.path.insert(0, os.path.dirname(__file__)); import design as D
HERE = os.path.dirname(os.path.abspath(__file__))
KD = os.path.join(HERE, "..", "kicad"); PCB = os.path.join(KD, "pitchiq_watch.kicad_pcb")
PLACED = os.path.join(HERE, "..", "out", "placed.kicad_pcb")
DSN = os.path.join(HERE, "..", "out", "pitchiq_watch.dsn"); SES = os.path.join(HERE, "..", "out", "pitchiq_watch.ses")
LIBS = "/usr/share/kicad/footprints"
mm = pcbnew.FromMM
def V(x, y): return pcbnew.VECTOR2I(mm(x), mm(y))
W, H, RAD = 32.0, 36.0, 3.0
OX, OY = 100.0, 80.0   # board origin on the sheet

# ref: (x, y, rotation degrees, side)   board coordinates in mm, origin top-left, y down
PLACE = {
    # F = component side = faces the back of the watch (battery and motor sit over it). B = flat side = display side.
    "U1": (16.0, 8.4, 0, "F"),
    "C2": (17.4, 17.7, 0, "F"), "C1": (20.2, 17.8, 0, "F"),                     # right under the module's VDD/VDDH pads (28, 30)
    "Y1": (11.2, 18.0, 0, "F"), "C3": (9.95, 19.9, 0, "F"), "C4": (12.45, 19.9, 0, "F"),   # by the module's XL1/XL2 pads (17, 18)
    "BT1": (4.9, 8.4, 0, "F"), "R3": (2.6, 11.6, 0, "F"), "R4": (5.0, 11.6, 0, "F"), "C10": (7.4, 11.6, 0, "F"), "C11": (2.6, 12.9, 0, "F"),
    "JP1": (6.2, 13.6, 0, "F"), "J2": (4.6, 17.2, 0, "F"), "J1": (5.5, 25.5, 270, "F"), "J4": (5.8, 33.3, 0, "F"),
    "Q2": (10.9, 22.7, 0, "F"), "R5": (9.6, 25.3, 0, "F"), "R6": (11.8, 25.3, 0, "F"), "R7": (9.6, 26.6, 0, "F"),
    "U4": (18.6, 22.2, 0, "F"), "J3": (16.0, 31.6, 0, "F"),
    "SW1": (29.4, 12.0, 90, "F"), "Q1": (24.9, 12.4, 0, "F"), "R8": (24.9, 15.0, 0, "F"), "D1": (25.3, 16.5, 0, "F"), "M1": (29.3, 16.3, 0, "F"),   # motor pads 12 mm from the antenna end (round-2 finding); an ERM has no polarity
    "C9": (24.9, 18.4, 0, "F"), "R2": (27.2, 18.4, 0, "F"), "C14": (30.0, 18.5, 0, "F"), "U3": (29.2, 21.5, 0, "F"), "C7": (25.3, 20.4, 0, "F"), "C8": (25.3, 22.0, 0, "F"),
    "R11": (25.0, 24.0, 0, "F"), "R12": (27.3, 24.0, 0, "F"), "C13": (29.6, 24.6, 0, "F"),
    "U2": (25.6, 28.0, 0, "F"), "R1": (29.7, 26.8, 0, "F"), "C6": (29.6, 29.4, 0, "F"), "C5": (24.4, 31.6, 0, "F"), "D2": (28.7, 31.8, 0, "F"),
    "R13": (23.6, 33.8, 0, "F"), "R14": (26.4, 33.8, 0, "F"),
    "TP1": (24.0, 33.4, 0, "B"), "TP2": (26.6, 33.4, 0, "B"), "TP3": (29.0, 32.6, 0, "B"), "TP4": (30.2, 30.0, 0, "B"),   # display side, bottom-right: reachable until the LCD is bonded
}
KEEPOUT = (6.0, 0.0, 26.0, 4.0)   # antenna end of the module: no copper on any layer out to the board edge (review finding)

def custom(name):
    f = pcbnew.FOOTPRINT(None); f.SetFPID(pcbnew.LIB_ID("PQ", name))
    def pad(num, x, y, w, h):
        p = pcbnew.PAD(f); p.SetNumber(num); p.SetShape(pcbnew.PAD_SHAPE_RECT); p.SetAttribute(pcbnew.PAD_ATTRIB_SMD)
        ls = pcbnew.LSET(); ls.AddLayer(pcbnew.F_Cu); ls.AddLayer(pcbnew.F_Mask); p.SetLayerSet(ls);   # no paste: hand-soldered pads
        p.SetSize(V(w, h)); p.SetPos0(V(x, y)); p.SetPosition(V(x, y)); f.Add(p)
    if name == "Pad_2x_wire":
        pad("1", -1.6, 0, 1.8, 3.0); pad("2", 1.6, 0, 1.8, 3.0); cw, ch = 3.0, 2.0
    elif name == "Pad_2x_wire_small":
        pad("1", -1.0, 0, 1.2, 1.8); pad("2", 1.0, 0, 1.2, 1.8); cw, ch = 2.0, 1.4
    elif name == "FPC_4p_0.5mm_pads":
        for i in range(4): pad(str(i + 1), (i - 1.5) * 0.5, 0, 0.3, 1.8)
        cw, ch = 1.5, 1.4
    for x0, y0, x1, y1 in ((-cw, -ch, cw, -ch), (cw, -ch, cw, ch), (cw, ch, -cw, ch), (-cw, ch, -cw, -ch)):
        s = pcbnew.FP_SHAPE(f); s.SetShape(pcbnew.SHAPE_T_SEGMENT); s.SetStart0(V(x0, y0)); s.SetEnd0(V(x1, y1)); s.SetStart(V(x0, y0)); s.SetEnd(V(x1, y1)); s.SetLayer(pcbnew.F_CrtYd); s.SetWidth(mm(0.05)); f.Add(s)
    return f

def outline(b):
    def seg(x0, y0, x1, y1):
        s = pcbnew.PCB_SHAPE(b); s.SetShape(pcbnew.SHAPE_T_SEGMENT); s.SetStart(V(OX + x0, OY + y0)); s.SetEnd(V(OX + x1, OY + y1)); s.SetLayer(pcbnew.Edge_Cuts); s.SetWidth(mm(0.1)); b.Add(s)
    def arc(cx, cy, sx, sy, ex, ey):
        s = pcbnew.PCB_SHAPE(b); s.SetShape(pcbnew.SHAPE_T_ARC); s.SetCenter(V(OX + cx, OY + cy)); s.SetStart(V(OX + sx, OY + sy)); s.SetEnd(V(OX + ex, OY + ey)); s.SetLayer(pcbnew.Edge_Cuts); s.SetWidth(mm(0.1)); b.Add(s)
    r = RAD
    seg(r, 0, W - r, 0); seg(W, r, W, H - r); seg(W - r, H, r, H); seg(0, H - r, 0, r)
    arc(W - r, r, W - r, 0, W, r); arc(W - r, H - r, W, H - r, W - r, H); arc(r, H - r, r, H, 0, H - r); arc(r, r, 0, r, r, 0)

def rules(b):
    ds = b.GetDesignSettings(); ds.SetCopperLayerCount(4)
    ds.m_MinClearance = mm(0.127); ds.m_TrackMinWidth = mm(0.127); ds.m_ViasMinSize = mm(0.45); ds.m_MinThroughDrill = mm(0.2)
    ds.m_ViasMinAnnularWidth = mm(0.1); ds.m_CopperEdgeClearance = mm(0.25); ds.m_HoleClearance = mm(0.2); ds.m_HoleToHoleMin = mm(0.25)
    ds.m_SolderMaskExpansion = mm(0.05); ds.SetBoardThickness(mm(0.8)); ds.m_MinResolvedSpokes = 1   # every plane pad also has its own via
    nc = ds.m_NetSettings.m_DefaultNetClass
    nc.SetClearance(mm(0.15)); nc.SetTrackWidth(mm(0.2)); nc.SetViaDiameter(mm(0.5)); nc.SetViaDrill(mm(0.25))

def place():
    b = pcbnew.BOARD(); rules(b); outline(b)
    netmap = {}
    for name in sorted(D.nets()):
        n = pcbnew.NETINFO_ITEM(b, name); b.Add(n); netmap[name] = n
    for ref, p in D.P.items():
        lib, name = p["fp"].split(":")
        f = custom(name) if lib == "PQ" else pcbnew.FootprintLoad(f"{LIBS}/{lib}.pretty", name)
        assert f, p["fp"]
        if ref == "SW1":   # DFM deviation from the stock Alps land pattern: its 0.9 mm boss holes sit 0.10 / 0.15 mm from its own
            for pad in f.Pads():   # pads; trim those pads so every hole-to-copper gap is at least 0.2 mm (check the joints on first boards)
                if pad.GetNumber() == "1": pad.SetSize(V(0.75, 1.4)); q = pad.GetPos0(); pad.SetPos0(pcbnew.VECTOR2I(q.x, mm(-1.1))); pad.SetPosition(pcbnew.VECTOR2I(pad.GetPosition().x, mm(-1.1)))
                if pad.GetNumber() == "MP": pad.SetSize(V(1.3, 0.8)); q = pad.GetPos0(); pad.SetPos0(pcbnew.VECTOR2I(q.x, mm(1.1))); pad.SetPosition(pcbnew.VECTOR2I(pad.GetPosition().x, mm(1.1)))
        f.SetReference(ref); f.SetValue(p["value"]); b.Add(f)
        x, y, rot, side = PLACE[ref]
        f.SetPosition(V(OX + x, OY + y))
        if side == "B": f.Flip(f.GetPosition(), False)
        f.SetOrientationDegrees(rot)
        if p["dnp"] or p["hand"]: f.SetAttributes(f.GetAttributes() | pcbnew.FP_EXCLUDE_FROM_POS_FILES | pcbnew.FP_EXCLUDE_FROM_BOM)
        pinnet = {num: net for num, _, net in p["pins"]}
        nums = set()
        for pad in f.Pads():
            num = pad.GetNumber(); nums.add(num)
            if num in pinnet and pinnet[num] is not D.NC: pad.SetNet(netmap[pinnet[num]])
        missing = [n for n in pinnet if n not in nums]
        assert not missing, (ref, "pads missing in footprint", missing)
        f.Value().SetVisible(False); r = f.Reference(); r.SetVisible(True); r.SetLayer(pcbnew.B_Fab if side == 'B' else pcbnew.F_Fab)   # designators on the fab layer: the board is too dense for silk text
        r.SetTextSize(V(0.5, 0.5)); r.SetTextThickness(mm(0.08)); r.SetPosition(f.GetPosition())
    k = pcbnew.ZONE(b); k.SetIsRuleArea(True); kl = pcbnew.LSET()
    for L in (pcbnew.F_Cu, pcbnew.In1_Cu, pcbnew.In2_Cu, pcbnew.B_Cu): kl.AddLayer(L)
    k.SetLayerSet(kl); k.SetZoneName("antenna keep-out")
    k.SetDoNotAllowCopperPour(True); k.SetDoNotAllowTracks(True); k.SetDoNotAllowVias(True); k.SetDoNotAllowPads(False); k.SetDoNotAllowFootprints(False)
    o = k.Outline(); o.NewOutline()
    for x, y in ((KEEPOUT[0], KEEPOUT[1] - 1), (KEEPOUT[2], KEEPOUT[1] - 1), (KEEPOUT[2], KEEPOUT[3]), (KEEPOUT[0], KEEPOUT[3])): o.Append(mm(OX + x), mm(OY + y))
    b.Add(k)
    def silk(txt, x, y):
        t = pcbnew.PCB_TEXT(b); t.SetText(txt); t.SetLayer(pcbnew.F_SilkS); t.SetPosition(V(OX + x, OY + y)); t.SetTextSize(V(0.8, 0.8)); t.SetTextThickness(mm(0.12)); b.Add(t)
    silk("+", 1.2, 8.4); silk("-", 8.6, 8.4); silk("BAT", 4.9, 5.8);   # pad 1 (+) is the left pad of BT1
    def fabline(layer, pts):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            s = pcbnew.PCB_SHAPE(b); s.SetShape(pcbnew.SHAPE_T_SEGMENT); s.SetStart(V(OX + x0, OY + y0)); s.SetEnd(V(OX + x1, OY + y1)); s.SetLayer(layer); s.SetWidth(mm(0.1)); b.Add(s)
    fabline(pcbnew.Dwgs_User, [(1.5, 9.5), (21.5, 9.5), (21.5, 35.5), (1.5, 35.5), (1.5, 9.5)])     # nominal 402025 cell position over the component side, clear of the antenna end
    fabline(pcbnew.Cmts_User, [(2.7, 3.1), (29.3, 3.1), (29.3, 32.9), (2.7, 32.9), (2.7, 3.1)])     # LCD module outline 26.62 x 29.72 mm on the display side (position is a proposal)
    pcbnew.SaveBoard(PCB, b); pcbnew.SaveBoard(PLACED, b)
    ok = pcbnew.ExportSpecctraDSN(b, DSN)
    print("placed", len(b.GetFootprints()), "footprints; DSN export:", ok)

def zone(b, net, layer, inset=0.3):
    z = pcbnew.ZONE(b); z.SetLayer(layer); z.SetNetCode(b.GetNetcodeFromNetname(net))
    o = z.Outline(); o.NewOutline()
    for x, y in ((inset, inset), (W - inset, inset), (W - inset, H - inset), (inset, H - inset)): o.Append(mm(OX + x), mm(OY + y))
    z.SetLocalClearance(mm(0.2)); z.SetMinThickness(mm(0.2)); z.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
    z.SetThermalReliefGap(mm(0.2)); z.SetThermalReliefSpokeWidth(mm(0.25)); z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
    z.SetAssignedPriority(0); b.Add(z); return z

def finish():
    b = pcbnew.LoadBoard(PCB)
    print("tracks+vias from router.py:", len(b.GetTracks()))
    for net, layer in (("GND", pcbnew.In1_Cu), ("3V0", pcbnew.In2_Cu), ("GND", pcbnew.F_Cu), ("GND", pcbnew.B_Cu)): zone(b, net, layer)
    pcbnew.ZONE_FILLER(b).Fill(b.Zones())
    t = pcbnew.PCB_TEXT(b); t.SetText("PitchIQ watch rev A - NOT BUILT OR TESTED"); t.SetLayer(pcbnew.F_Fab); t.SetPosition(V(OX + 16, OY + 37.5))
    t.SetTextSize(V(1.0, 1.0)); t.SetTextThickness(mm(0.15)); b.Add(t)
    pcbnew.SaveBoard(PCB, b); print("saved", PCB)

if __name__ == "__main__": {"place": place, "finish": finish}[sys.argv[1]]()
