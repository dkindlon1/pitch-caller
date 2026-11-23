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
    # F = top = component side (battery lies over it, display above the battery). B = bottom = wrist side (heart-rate sensor, cradle pads).
    "U1": (16.0, 8.4, 0),
    "C2": (17.4, 17.7, 0), "C1": (20.2, 17.8, 0), "R16": (14.6, 18.0, 0),
    "Y1": (10.4, 18.0, 0), "C3": (9.15, 19.9, 0), "C4": (11.65, 19.9, 0),
    "BT1": (4.6, 8.4, 0), "JP1": (4.6, 12.2, 0), "R5": (4.6, 16.0, 0),
    "U4": (24.6, 6.6, 0), "C13": (24.6, 8.6, 0),
    "D3": (29.4, 7.9, 0), "SW1": (29.4, 12.0, 90), "Q1": (24.4, 11.2, 0), "R15": (24.4, 13.6, 0), "D1": (24.6, 15.1, 0), "M1": (29.2, 16.6, 0), "C24": (24.6, 17.2, 0),
    "R3": (23.0, 19.2, 0), "R4": (25.4, 19.2, 0),
    # nPM1300 (pin 1 top-left): bucks and inductors on its left, battery/system/VBUS capacitors on its right, 1.5 mm routing ring clear on every side
    "U2": (22.8, 23.8, 0),
    "L1": (16.7, 20.9, 180), "C8": (16.7, 22.7, 180), "L2": (16.7, 24.5, 180), "C9": (13.3, 21.3, 180), "C10": (13.3, 23.6, 180),   # rotated so the switch-node and supply pads face the chip
    "C5": (29.0, 20.0, 0), "C12": (29.0, 22.0, 0), "C7": (29.0, 23.9, 0), "C6": (29.0, 25.6, 0),
    "R1": (27.6, 27.6, 0), "RT1": (24.6, 32.8, 0),   # RT1 under the cell outline so it reads cell temperature, not PMIC temperature
     "R2": (27.6, 29.3, 0), "C11": (21.2, 28.4, 90), "D2": (28.4, 31.2, 0),
    # boost (pin 1 FB top-left, 6 VOUT top-right): output cap above the inductor, input cap below it
    "R7": (2.4, 19.1, 0), "R6": (2.4, 20.3, 0), "U5": (3.4, 22.4, 0), "L3": (6.8, 22.4, 0), "C19": (6.6, 20.4, 0), "C18": (6.6, 24.6, 0), "R8": (3.4, 24.4, 0), "C20": (10.2, 24.0, 0),
    "J1": (15.0, 31.0, 0), "R9": (21.7, 31.6, 0), "R10": (21.7, 30.4, 0), "C21": (21.7, 32.8, 0), "C22": (8.7, 29.4, 90), "C23": (8.7, 31.6, 90), "R11": (3.2, 26.6, 0), "R12": (3.2, 27.8, 0),   # LCD passives beside the connector, so the strip above its pins stays free for fan-out
    "Q2": (3.4, 30.4, 0), "R13": (7.2, 28.8, 0), "R14": (7.2, 30.2, 0), "J2": (6.4, 34.0, 0), "C25": (17.2, 26.3, 0),
    # bottom side
    "U3": (16.0, 20.5, 0), "C14": (11.6, 19.6, 0), "C15": (11.6, 21.2, 0), "C16": (20.6, 19.8, 0), "C17": (20.4, 21.6, 0),
    # Cradle contacts. Five in a row at 3.5 mm pitch, left to right seen from the top: GND, nRESET, SWDCLK, SWDIO, 3V0. The VBUS pad
    # is deliberately NOT in the row (it sits 6.5 mm right and 5.5 mm below its end), so the pattern has no 180-degree symmetry:
    # a pogo block put on backwards lands its +5 V pin on bare solder mask, never on the 3V0 pad or a logic pad
    # (second-round review). The row also stops at x = 21.5 to leave via room under the power chip. The case key is still required.
    "TP1": (27.0, 34.0, 0), "TP2": (6.5, 28.5, 0), "TP5": (10.0, 28.5, 0), "TP4": (13.5, 28.5, 0), "TP3": (17.0, 28.5, 0), "TP6": (20.5, 28.5, 0),
    "R19": (9.1, 31.0, 90), "R18": (12.6, 31.0, 90), "R17": (16.1, 31.0, 90), "D6": (10.8, 31.9, 90), "D5": (14.3, 31.9, 90), "D4": (17.8, 31.9, 90),   # below the pads, clear of the parts on the top side
    "TP7": (8.5, 12.0, 0), "TP8": (5.0, 15.5, 0), "TP9": (8.5, 15.5, 0),
}
KEEPOUT = (-1.0, 0.0, 33.0, 4.0)   # antenna end of the module: no copper on any layer, full board width (RF review)
HOLES = [(2.2, 2.2), (29.8, 2.2), (2.2, 33.8), (29.8, 33.8)]   # 1.6 mm unplated; the top pair sits beside the antenna: plastic posts only, no metal screws

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
    ds = b.GetDesignSettings(); ds.SetCopperLayerCount(6)
    ds.m_MinClearance = mm(0.127); ds.m_TrackMinWidth = mm(0.127); ds.m_ViasMinSize = mm(0.45); ds.m_MinThroughDrill = mm(0.2)
    ds.m_ViasMinAnnularWidth = mm(0.1); ds.m_CopperEdgeClearance = mm(0.25); ds.m_HoleClearance = mm(0.2); ds.m_HoleToHoleMin = mm(0.25)
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
    silk("+", 1.3, 8.4); silk("-", 8.0, 8.4); silk("BAT", 4.6, 5.7)   # pad 1 (+) is the left pad of BT1
    def fabline(layer, pts):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            s = pcbnew.PCB_SHAPE(b); s.SetShape(pcbnew.SHAPE_T_SEGMENT); s.SetStart(V(OX + x0, OY + y0)); s.SetEnd(V(OX + x1, OY + y1)); s.SetLayer(layer); s.SetWidth(mm(0.1)); b.Add(s)
    fabline(pcbnew.Dwgs_User, [(6.1, 9.8), (25.9, 9.8), (25.9, 35.8), (6.1, 35.8), (6.1, 9.8)])        # nominal 402025 cell (19.75 x 26.0) over the top side, 5.8 mm below the antenna keep-out
    fabline(pcbnew.Cmts_User, [(2.7, 5.5), (29.3, 5.5), (29.3, 35.8), (2.7, 35.8), (2.7, 5.5)])        # LS013B7DH03 outline 26.6 x 30.3 mm above the cell, pushed down so its metal is off the antenna end (RF review; position is a proposal)
    fabline(pcbnew.Eco1_User, [(13.9, 17.5), (18.1, 17.5), (18.1, 23.5), (13.9, 23.5), (13.9, 17.5)])  # bottom side: optical window area for the heart-rate sensor (keep the back cover opening here)
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
    t = pcbnew.PCB_TEXT(b); t.SetText("PitchIQ watch rev B - NOT BUILT OR TESTED"); t.SetLayer(pcbnew.F_Fab); t.SetPosition(V(OX + 16, OY + 37.5))
    t.SetTextSize(V(1.0, 1.0)); t.SetTextThickness(mm(0.15)); b.Add(t)
    pcbnew.SaveBoard(PCB, b); print("saved", PCB)

if __name__ == "__main__": {"place": place, "finish": finish}[sys.argv[1]]()
