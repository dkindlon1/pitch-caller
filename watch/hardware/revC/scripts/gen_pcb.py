"""Build kicad/pitchiq_watch.kicad_pcb from design.py with KiCad's own pcbnew API.
Stages:  python3 gen_pcb.py place   -> placed, unrouted board + Specctra DSN
         python3 router.py          -> tracks and vias (scripts/router.py, a grid maze router)
         python3 gen_pcb.py finish  -> add planes, fill, save
Placement is by script (coordinates below). Routing is by autorouter. Nothing here is hand-tuned RF or signal-integrity work."""
import sys, os, math, pcbnew
sys.path.insert(0, os.path.dirname(__file__)); import design as D
HERE = os.path.dirname(os.path.abspath(__file__))
KD = os.path.join(HERE, "..", "kicad"); PCB = os.path.join(KD, "pitchiq_watch.kicad_pcb")
PLACED = os.path.join(HERE, "..", "out", "placed.kicad_pcb")
DSN = os.path.join(HERE, "..", "out", "pitchiq_watch.dsn"); SES = os.path.join(HERE, "..", "out", "pitchiq_watch.ses")
LIBS = "/usr/share/kicad/footprints"
mm = pcbnew.FromMM
def V(x, y): return pcbnew.VECTOR2I(mm(x), mm(y))
W, H, RAD = 30.0, 36.0, 3.0
USB_Y = 10.5; NOTCH = (0.0, USB_Y - 5.15, 6.3, USB_Y + 5.15)   # board-edge notch for the mid-mount USB-C receptacle (x0, y0, x1, y1)
OX, OY = 100.0, 80.0   # board origin on the sheet

# ref: (x, y, rotation degrees, side)   board coordinates in mm, origin top-left, y down
PLACE = {
    # Rev C stack: the board is in the middle. F = top = display side: module, all small parts, the motor (glued to the board),
    # with the LCD lying 2.3 mm above. B = bottom = wrist side: the cell, the side switch, the lower half of the USB-C receptacle
    # and the programming pads.
    "U1": (15.0, 8.4, 0),
    "J3": (6.3, USB_Y, 0), "D2": (4.4, 17.6, 0),
    "C2": (17.6, 17.7, 0), "C1": (20.2, 17.8, 0), "R16": (15.4, 18.0, 0),
    "Y1": (11.9, 18.2, 0), "C3": (10.65, 20.0, 0), "C4": (13.15, 20.0, 0),
    "U4": (24.5, 6.6, 0), "C13": (24.5, 8.6, 0), "D3": (27.9, 5.7, 0),
    "Q1": (24.0, 10.9, 0), "R15": (24.0, 13.3, 0), "D1": (24.0, 14.8, 0), "R14": (24.0, 16.25, 0), "R13": (24.0, 17.25, 0), "C24": (23.9, 18.45, 0),
    "Q2": (27.9, 12.0, 0), "J2": (27.7, 16.9, 0),
    "M1": (3.2, 28.2, 0),
    "R3": (21.6, 19.9, 0), "R4": (23.6, 19.9, 0),
    # nPM1300 (pin 1 top-left): bucks and inductors on its left, battery/system/VBUS capacitors on its right
    "U2": (21.3, 24.2, 0),
    "L1": (15.2, 21.6, 180), "C8": (15.2, 23.3, 180), "L2": (15.2, 25.0, 180), "C9": (11.8, 21.9, 180), "C10": (11.8, 24.1, 180), "C25": (15.7, 26.7, 0),
    "C5": (27.5, 20.4, 0), "C12": (27.5, 22.4, 0), "C7": (27.5, 24.3, 0), "C6": (27.5, 26.0, 0),
    "R1": (26.1, 28.0, 0), "R2": (26.1, 29.5, 0), "C11": (20.1, 28.8, 90), "RT1": (23.1, 33.0, 0),
    "J1": (14.0, 31.0, 0), "R9": (20.7, 31.8, 0), "R10": (20.7, 30.6, 0), "C21": (20.7, 33.0, 0), "C22": (7.7, 29.4, 90), "C23": (7.7, 31.6, 90),
    "R11": (5.4, 34.6, 0), "R12": (5.4, 33.4, 0),
    # bottom side
    "SW1": (27.9, 12.0, 270), "BT1": (27.9, 21.0, 90), "JP1": (27.9, 26.4, 90),
    # programming pads in the strip left of the cell (reachable with the back cover off and the cell in place): GND, nRESET, SWDCLK, SWDIO, 3V0
    "TP2": (2.4, 19.4, 0), "TP5": (2.4, 22.0, 0), "TP4": (2.4, 24.6, 0), "TP3": (2.4, 27.2, 0), "TP6": (2.4, 29.8, 0),
    "D6": (4.9, 20.6, 90), "D5": (4.9, 24.0, 90), "D4": (4.9, 27.4, 90),
    "R19": (4.9, 30.6, 0), "R18": (4.9, 31.8, 0), "R17": (4.9, 33.0, 0),   # series resistors next to the pads they protect
    "TP1": (9.5, 7.0, 0), "TP8": (20.5, 7.0, 0),
}
KEEPOUT = (-1.0, 0.0, 33.0, 4.0)   # antenna end of the module: no copper on any layer, full board width (RF review)
HOLES = [(2.2, 2.2), (27.8, 2.2), (2.2, 33.8), (27.8, 33.8)]   # 1.6 mm unplated; the top pair sits beside the antenna: plastic posts only, no metal screws

def custom(name):
    f = pcbnew.FOOTPRINT(None); f.SetFPID(pcbnew.LIB_ID("PQ", name))
    def pad(num, x, y, w, h):
        p = pcbnew.PAD(f); p.SetNumber(num); p.SetShape(pcbnew.PAD_SHAPE_RECT); p.SetAttribute(pcbnew.PAD_ATTRIB_SMD)
        ls = pcbnew.LSET(); ls.AddLayer(pcbnew.F_Cu); ls.AddLayer(pcbnew.F_Mask); p.SetLayerSet(ls);   # no paste: hand-soldered pads
        p.SetSize(V(w, h)); p.SetPos0(V(x, y)); p.SetPosition(V(x, y)); f.Add(p)
    if name == "Pad_2x_wire":
        pad("1", -1.6, 0, 1.8, 3.0); pad("2", 1.6, 0, 1.8, 3.0); cw, ch = 3.0, 2.0
    elif name == "USB4715":
        # GCT USB4715-GF-A land pattern, drawn from GCT's "Recommended PCB Layout" (PCB 0.80 mm). Origin = middle of the notch's
        # back edge; local +x points into the board, the receptacle opens toward -x; local y runs along the board edge.
        # Contact pads are 0.30 mm longer than the drawing's 1.05 and start 0.25 mm behind the notch edge (edge clearance).
        def smd(num, y, w):
            p = pcbnew.PAD(f); p.SetNumber(num); p.SetShape(pcbnew.PAD_SHAPE_RECT); p.SetAttribute(pcbnew.PAD_ATTRIB_SMD)
            ls = pcbnew.LSET(); [ls.AddLayer(L) for L in (pcbnew.F_Cu, pcbnew.F_Mask, pcbnew.F_Paste)]; p.SetLayerSet(ls)
            p.SetSize(V(1.35, w)); p.SetPos0(V(0.925, y)); p.SetPosition(V(0.925, y)); f.Add(p)
        for num, y, w in (("B12", -2.75, 0.80), ("B9", -1.52, 0.76), ("A5", -0.50, 0.70), ("B5", 0.50, 0.70), ("A9", 1.52, 0.76), ("A12", 2.75, 0.80)): smd(num, y, w)
        k = 0
        for x in (-2.30, -5.30):          # shell stakes: plated slots 0.50 x 1.10 in pads 0.90 x 1.50, long axis along x
            for y in (-5.80, 5.80):
                k += 1; p = pcbnew.PAD(f); p.SetNumber(f"S{k}"); p.SetShape(pcbnew.PAD_SHAPE_OVAL); p.SetAttribute(pcbnew.PAD_ATTRIB_PTH)
                p.SetLayerSet(pcbnew.PAD.PTHMask()); p.SetSize(V(1.50, 0.90)); p.SetDrillShape(pcbnew.PAD_DRILL_SHAPE_OBLONG); p.SetDrillSize(V(1.10, 0.50))
                p.SetPos0(V(x, y)); p.SetPosition(V(x, y)); f.Add(p)
        for x0, y0, x1, y1 in ((-8.4, -5.27, 1.9, -5.27), (1.9, -5.27, 1.9, 5.27), (1.9, 5.27, -8.4, 5.27), (-8.4, 5.27, -8.4, -5.27)):   # body 10.54 wide, 2.1 mm past the board edge
            for layer in (pcbnew.F_Fab, pcbnew.F_CrtYd):
                sh = pcbnew.FP_SHAPE(f); sh.SetShape(pcbnew.SHAPE_T_SEGMENT); sh.SetStart0(V(x0, y0)); sh.SetEnd0(V(x1, y1)); sh.SetStart(V(x0, y0)); sh.SetEnd(V(x1, y1)); sh.SetLayer(layer); sh.SetWidth(mm(0.05)); f.Add(sh)
        return f
    elif name == "Pad_2x_wire_small":
        pad("1", -1.0, 0, 1.2, 1.8); pad("2", 1.0, 0, 1.2, 1.8); cw, ch = 2.0, 1.4
    for x0, y0, x1, y1 in ((-cw, -ch, cw, -ch), (cw, -ch, cw, ch), (cw, ch, -cw, ch), (-cw, ch, -cw, -ch)):
        s = pcbnew.FP_SHAPE(f); s.SetShape(pcbnew.SHAPE_T_SEGMENT); s.SetStart0(V(x0, y0)); s.SetEnd0(V(x1, y1)); s.SetStart(V(x0, y0)); s.SetEnd(V(x1, y1)); s.SetLayer(pcbnew.F_CrtYd); s.SetWidth(mm(0.05)); f.Add(s)
    return f

def outline(b):
    def seg(x0, y0, x1, y1):
        s = pcbnew.PCB_SHAPE(b); s.SetShape(pcbnew.SHAPE_T_SEGMENT); s.SetStart(V(OX + x0, OY + y0)); s.SetEnd(V(OX + x1, OY + y1)); s.SetLayer(pcbnew.Edge_Cuts); s.SetWidth(mm(0.1)); b.Add(s)
    def arc(cx, cy, sx, sy, ex, ey):
        s = pcbnew.PCB_SHAPE(b); s.SetShape(pcbnew.SHAPE_T_ARC); s.SetCenter(V(OX + cx, OY + cy)); s.SetStart(V(OX + sx, OY + sy)); s.SetEnd(V(OX + ex, OY + ey)); s.SetLayer(pcbnew.Edge_Cuts); s.SetWidth(mm(0.1)); b.Add(s)
    r = RAD
    x0, y0, x1, y1 = NOTCH; rr = 0.5
    seg(r, 0, W - r, 0); seg(W, r, W, H - r); seg(W - r, H, r, H)
    seg(0, H - r, 0, y1); seg(0, y1, x1, y1); seg(0, y0, 0, r); seg(x1, y0, 0, y0)          # left edge, broken by the notch
    seg(x1, y0 + 2 * rr, x1, y1 - 2 * rr)                                                   # notch back edge between the corner reliefs
    arc(x1, y0 + rr, x1, y0, x1, y0 + 2 * rr); arc(x1, y1 - rr, x1, y1 - 2 * rr, x1, y1)    # 0.5 mm radius reliefs bulging into the board
    arc(W - r, r, W - r, 0, W, r); arc(W - r, H - r, W, H - r, W - r, H); arc(r, H - r, r, H, 0, H - r); arc(r, r, 0, r, r, 0)

def rules(b):
    ds = b.GetDesignSettings(); ds.SetCopperLayerCount(6)
    ds.m_MinClearance = mm(0.127); ds.m_TrackMinWidth = mm(0.127); ds.m_ViasMinSize = mm(0.45); ds.m_MinThroughDrill = mm(0.2)
    ds.m_ViasMinAnnularWidth = mm(0.1); ds.m_CopperEdgeClearance = mm(0.19)   # 0.2 mm: the connector's stake pads sit 0.20 mm from the notch edge by GCT's own layout; ds.m_HoleClearance = mm(0.2); ds.m_HoleToHoleMin = mm(0.25)
    ds.m_SolderMaskExpansion = mm(0.025); ds.SetBoardThickness(mm(0.8)); ds.m_MinResolvedSpokes = 1   # every plane pad also has its own via
    nc = ds.m_NetSettings.m_DefaultNetClass
    nc.SetClearance(mm(0.15)); nc.SetTrackWidth(mm(0.2)); nc.SetViaDiameter(mm(0.5)); nc.SetViaDrill(mm(0.2))

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
        x, y, rot = PLACE[ref]; side = p["side"]
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
    for n, (hx, hy) in enumerate(HOLES):
        f = pcbnew.FOOTPRINT(b); f.SetFPID(pcbnew.LIB_ID("PQ", "Hole_1.6mm_NPTH")); f.SetReference(f"H{n + 1}"); f.SetValue("1.6 mm hole")
        p = pcbnew.PAD(f); p.SetNumber(""); p.SetShape(pcbnew.PAD_SHAPE_CIRCLE); p.SetAttribute(pcbnew.PAD_ATTRIB_NPTH); p.SetLayerSet(pcbnew.PAD.UnplatedHoleMask())
        p.SetSize(V(1.6, 1.6)); p.SetDrillSize(V(1.6, 1.6)); f.Add(p); b.Add(f); f.SetPosition(V(OX + hx, OY + hy))
        f.SetAttributes(pcbnew.FP_EXCLUDE_FROM_POS_FILES | pcbnew.FP_EXCLUDE_FROM_BOM | pcbnew.FP_BOARD_ONLY); f.Reference().SetVisible(False); f.Value().SetVisible(False)
    k = pcbnew.ZONE(b); k.SetIsRuleArea(True); kl = pcbnew.LSET()
    for L in (pcbnew.F_Cu, pcbnew.In1_Cu, pcbnew.In2_Cu, pcbnew.In3_Cu, pcbnew.In4_Cu, pcbnew.B_Cu): kl.AddLayer(L)
    k.SetLayerSet(kl); k.SetZoneName("antenna keep-out")
    k.SetDoNotAllowCopperPour(True); k.SetDoNotAllowTracks(True); k.SetDoNotAllowVias(True); k.SetDoNotAllowPads(False); k.SetDoNotAllowFootprints(False)
    o = k.Outline(); o.NewOutline()
    for x, y in ((KEEPOUT[0], KEEPOUT[1] - 1), (KEEPOUT[2], KEEPOUT[1] - 1), (KEEPOUT[2], KEEPOUT[3]), (KEEPOUT[0], KEEPOUT[3])): o.Append(mm(OX + x), mm(OY + y))
    b.Add(k)
    def silk(txt, x, y):
        t = pcbnew.PCB_TEXT(b); t.SetText(txt); t.SetLayer(pcbnew.F_SilkS); t.SetPosition(V(OX + x, OY + y)); t.SetTextSize(V(0.8, 0.8)); t.SetTextThickness(mm(0.12)); b.Add(t)
    
    def fabline(layer, pts):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            s = pcbnew.PCB_SHAPE(b); s.SetShape(pcbnew.SHAPE_T_SEGMENT); s.SetStart(V(OX + x0, OY + y0)); s.SetEnd(V(OX + x1, OY + y1)); s.SetLayer(layer); s.SetWidth(mm(0.1)); b.Add(s)
    fabline(pcbnew.Dwgs_User, [(6.2, 9.8), (25.95, 9.8), (25.95, 35.8), (6.2, 35.8), (6.2, 9.8)])        # nominal 402025 cell (19.75 x 26.0) UNDER the board (bottom side), between the USB-C body and the side switch
    fabline(pcbnew.Cmts_User, [(1.7, 5.5), (28.3, 5.5), (28.3, 35.8), (1.7, 35.8), (1.7, 5.5)])        # LS013B7DH03 outline 26.6 x 30.3 mm above the cell, pushed down so its metal is off the antenna end (RF review; position is a proposal)
    fabline(pcbnew.Eco1_User, [(5.3 + 4.1 * math.cos(a / 12 * math.pi), 22.7 + 4.1 * math.sin(a / 12 * math.pi)) for a in range(25)])   # top side: keep-clear circle for the 8 mm motor (glued to the board)
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
    for net, layer in (("GND", pcbnew.In1_Cu), ("3V0", pcbnew.In4_Cu), ("GND", pcbnew.F_Cu), ("GND", pcbnew.B_Cu)): zone(b, net, layer)   # 6 layers: F sig / In1 GND / In2 sig / In3 sig / In4 3V0 / B sig
    pcbnew.ZONE_FILLER(b).Fill(b.Zones())
    t = pcbnew.PCB_TEXT(b); t.SetText("PitchIQ watch rev C - NOT BUILT OR TESTED"); t.SetLayer(pcbnew.F_Fab); t.SetPosition(V(OX + 16, OY + 37.5))
    t.SetTextSize(V(1.0, 1.0)); t.SetTextThickness(mm(0.15)); b.Add(t)
    pcbnew.SaveBoard(PCB, b); print("saved", PCB)

if __name__ == "__main__": {"place": place, "finish": finish}[sys.argv[1]]()
