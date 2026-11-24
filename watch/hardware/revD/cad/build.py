"""Parametric 3D model of the complete PitchIQ watch (rev D): every part as a solid, the assembly, STEP exports and checks.

    python3 cad/build.py            build everything, write cad/step/*.step, cad/assembly.step, cad/views/*.svg, cad/report.md
    python3 cad/build.py --check    build and run the checks only; exit code 1 if any hard check fails

All dimensions come from cad/params.py (and, through it, the board outline, notch, holes and part positions from the PCB
source scripts/gen_pcb.py), so the board and the case cannot drift apart silently.
The component bodies are ENVELOPES (boxes and cylinders at the datasheet size), not detailed vendor models.
Nothing here has been printed, machined or fitted. Needs: pip install cadquery.
"""
import os, sys, math, itertools
import cadquery as cq
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import params as PM
P = PM.P; D = PM.derived(); W, H = PM.BOARD_W, PM.BOARD_H

def Y(y): return H - y                                   # board y (down) -> CAD Y (up)
def box(x0, x1, y0, y1, z0, z1):
    """Box given in board coordinates (y down)."""
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0, centered=False).translate((x0, Y(y1), z0))
def cyl(x, y, d, z0, z1): return cq.Workplane("XY").circle(d / 2).extrude(z1 - z0).translate((x, Y(y), z0))
def rrect(x0, x1, y0, y1, r, z0, z1):
    """Rounded rectangle prism in board coordinates."""
    r = min(r, (x1 - x0) / 2 - 0.01, (y1 - y0) / 2 - 0.01)
    s = cq.Workplane("XY").rect(x1 - x0, y1 - y0).extrude(z1 - z0)
    if r > 0.01: s = s.edges("|Z").fillet(r)
    return s.translate(((x0 + x1) / 2, Y((y0 + y1) / 2), z0))
def xcyl(x0, x1, y, z, d): return cq.Workplane("YZ").circle(d / 2).extrude(x1 - x0).translate((x0, Y(y), z))   # cylinder along x
def xslot(x0, x1, y, z, w, h, r):
    """Rounded slot along x: width w along the wall (board y), height h (z)."""
    r = min(r, w / 2 - 0.01, h / 2 - 0.01)
    return cq.Workplane("YZ").rect(w, h).extrude(x1 - x0).edges("|X").fillet(r).translate((x0, Y(y), z))

zb = D["z_board_bot"]; ZT = D["z_top"]; ZBAY = D["z_bay"]; ZBACK = D["z_back"]
X0, X1, Y0, Y1 = D["x0"], D["x1"], D["y0"], D["y1"]
IX0, IX1, IY0, IY1 = -P["clear"], W + P["clear"], -P["clear"], H + P["clear"] + P["fpc_loop"]     # inner cavity
usb_y = PM.USB_Y; zc = D["z_usb_c"]

def build():
    parts = {}
    # ------------------------------------------------------------------ board (outline, notch, holes from the PCB source)
    n = PM.NOTCH
    pcb = rrect(0, W, 0, H, PM.BOARD_R, zb, 0).cut(box(n[0] - 1, n[2], n[1], n[3], zb - 1, 1))
    for hx, hy in PM.HOLES: pcb = pcb.cut(cyl(hx, hy, 1.6, zb - 1, 1))
    parts["pcb"] = pcb
    # ------------------------------------------------------------------ top-side component envelopes
    u1 = PM.PLACE["U1"]; m = P["module"]
    parts["ble_module"] = box(u1[0] - m[0] / 2, u1[0] + m[0] / 2, u1[1] - m[1] / 2, u1[1] + m[1] / 2, 0, m[2])
    parts["antenna_keepout"] = box(0, W, 0, 4.4, zb, 0.02)                                 # copper-free strip of the board (marker volume, excluded from checks)
    mc = PM.MOTOR_C; parts["motor"] = cyl(mc[0], mc[1], P["motor"][0], 0.05, 0.05 + P["motor"][1])
    j1 = PM.PLACE["J1"]; f = P["fpc_conn"]
    parts["fpc_connector"] = box(j1[0] - f[0] / 2, j1[0] + f[0] / 2, j1[1] - 1.2, j1[1] - 1.2 + f[1], 0, f[2])   # footprint body spans y -1.2 .. +4.4 from its origin
    u2 = PM.PLACE["U2"]; q = P["pmic"]; parts["pmic"] = box(u2[0] - q[0] / 2, u2[0] + q[0] / 2, u2[1] - q[1] / 2, u2[1] + q[1] / 2, 0, q[2])
    u4 = PM.PLACE.get("U4", (24.5, 6.6, 0)); parts["accelerometer"] = box(u4[0] - 1, u4[0] + 1, u4[1] - 1, u4[1] + 1, 0, 1.0)
    # ------------------------------------------------------------------ display, its cable, lens
    lx, ly = P["lcd_xy"]; lw, ll, lt = P["lcd"]
    parts["lcd"] = box(lx, lx + lw, ly, ly + ll, D["z_lcd0"], D["z_lcd1"])
    fx0 = lx + lw / 2 - P["fpc_w"] / 2; fx1 = fx0 + P["fpc_w"]; t = P["fpc_t"]; ye = ly + ll; yo = ye + P["fpc_loop"] - 0.3
    zin = P["fpc_conn"][2] - 0.6                                                           # cable enters the connector about 0.6 mm below its top
    parts["lcd_fpc"] = (box(fx0, fx1, ye, yo, D["z_lcd0"], D["z_lcd0"] + t)                 # leaves the glass
                        .union(box(fx0, fx1, yo - t, yo, zin, D["z_lcd0"] + t))              # folds down (drawn square; real fold has radius >= 0.45)
                        .union(box(fx0, fx1, j1[1] + 3.0, yo, zin, zin + t)))                # runs back into the connector mouth
    ax0, ax1 = lx - P["aperture_margin"], lx + lw + P["aperture_margin"]
    ay0, ay1 = ly - P["aperture_margin"], ly + ll + P["fpc_loop"] + 0.2                     # the opening is longer at the cable end
    led = P["lens_ledge"]
    Lx0, Lx1, Ly0, Ly1 = ax0 - led, ax1 + led, ay0 - led, min(ay1 + led, Y1 - 0.8)
    parts["lens"] = rrect(Lx0, Lx1, Ly0, Ly1, 1.5, D["z_lens0"], ZT)
    parts["lens_adhesive"] = rrect(Lx0, Lx1, Ly0, Ly1, 1.5, D["z_lcd1"], D["z_lens0"]).cut(box(ax0, ax1, ay0, ay1, D["z_lcd1"] - 1, ZT + 1))
    # ------------------------------------------------------------------ bottom side: cell, switch, USB-C
    cx, cy = P["cell_xy"]; cw, cl, ct = P["cell"]
    parts["cell"] = box(cx, cx + cw, cy, cy + cl, D["cell_z0"], D["cell_z1"])
    sw = PM.PLACE["SW1"]; s = P["switch"]
    parts["side_switch"] = box(sw[0] - 1.35, sw[0] - 1.35 + s[0], sw[1] - s[1] / 2, sw[1] + s[1] / 2, zb - s[2], zb).union(
        box(sw[0] - 1.35 + s[0], W - 0.06, sw[1] - 1.0, sw[1] + 1.0, zb - 2.2, zb - 1.0))    # plunger nub reaching the board edge
    zsw = zb - 1.6                                                                          # plunger centre line
    fl, sh, nose = P["usb_flange"], P["usb_shell"], P["usb_nose"]; xf = D["x_flange"]
    usb = (box(xf, xf + fl[2], usb_y - fl[0] / 2, usb_y + fl[0] / 2, D["z_usb_bot"], D["z_usb_top"])
           .union(box(xf + fl[2], P["usb_body_back"], usb_y - sh[0] / 2, usb_y + sh[0] / 2, D["z_usb_top"] - sh[1], D["z_usb_top"]))
           .union(xslot(xf - nose[2], xf, usb_y, zc, nose[0], nose[1], nose[1] / 2 - 0.02))
           .union(box(P["usb_body_back"], P["usb_tail"][0], usb_y - 3.2, usb_y + 3.2, zb - P["usb_tail"][1], zb)))   # solder tails on the board's bottom face
    parts["usb_c"] = usb
    go, gi = P["gasket_outer"], P["gasket_inner"]; xp = D["x_pocket"]
    parts["usb_gasket"] = xslot(xp, xf, usb_y, zc, go[0], go[1], 1.6).cut(xslot(xp - 1, xf + 1, usb_y, zc, gi[0], gi[1], 1.28))
    # ------------------------------------------------------------------ port plate (separate piece carrying GCT's pocket and opening)
    pk = P["pocket"]; po = P["port_open"]; pw = P["plate"][0]; ptop = zc + pk[1] / 2 + P["plate"][1]
    plate = box(X0, D["x_wall_in"], usb_y - pw / 2, usb_y + pw / 2, ZBAY, ptop)
    plate = plate.cut(xslot(xp, D["x_wall_in"] + 1, usb_y, zc, pk[0], pk[1], 1.6)).cut(xslot(X0 - 1, xp + 1, usb_y, zc, po[0], po[1], 1.43))
    parts["port_plate"] = plate
    # ------------------------------------------------------------------ main case
    r = P["corner_r"]
    case = rrect(X0, X1, Y0, Y1, r, ZBAY, ZT)
    case = case.cut(rrect(IX0, IX1, IY0, IY1, PM.BOARD_R + P["clear"], ZBAY - 1, D["z_lcd0"] - 0.15))        # cavity up to the underside of the bezel
    case = case.cut(box(ax0, ax1, ay0, ay1, D["z_lcd0"] - 1, ZT + 1))                                         # display opening
    case = case.cut(rrect(Lx0 - 0.1, Lx1 + 0.1, Ly0 - 0.1, Ly1 + 0.1, 1.6, D["z_lcd1"], ZT + 1))              # lens recess (ledge at the glass top level)
    g = P["plate_gap"]
    case = case.cut(box(X0 - 1, D["x_wall_in"] + 0.01, usb_y - pw / 2 - g, usb_y + pw / 2 + g, ZBAY - 1, ptop + g))   # window for the port plate
    case = case.cut(xcyl(IX1 - 0.5, X1 + 1, sw[1], zsw, P["plunger"][0] + 0.15))                              # button bore
    case = case.cut(xcyl(IX1 - 0.01, IX1 + 0.5, sw[1], zsw, P["plunger"][1] + 0.3))                           # counterbore for the plunger's retaining head
    rb = P["rib"]                                                                                             # ribs the board's top face stops against
    for (x, y, sx, sy) in ((IX0, IY0, 1, 1), (IX1, IY0, -1, 1)):                                               # two at the antenna end (plastic only there)
        case = case.union(box(min(x, x + sx * (rb[0] + P["clear"])), max(x, x + sx * (rb[0] + P["clear"])), min(y, y + sy * rb[1]), max(y, y + sy * rb[1]), 0.0, D["z_lcd0"] - 0.14))
    for x, sx in ((IX0, 1), (IX1, -1)):                                                                        # two on the long sides near the lower end, below the glass
        case = case.union(box(min(x, x + sx * (rb[0] + P["clear"])), max(x, x + sx * (rb[0] + P["clear"])), 30.0, 30.0 + rb[1], 0.0, P["top_zone"]))
    for hx, hy in PM.HOLES[:2]:                                                                                # locating pins through the two upper board holes
        case = case.union(cyl(hx, hy, 2.6, 0.0, D["z_lcd0"] - 0.14)).union(cyl(hx, hy, P["pin_d"], zb - 0.3, 0.01))
    # lugs: two at each end, bar axis along x
    gap, lw_, ll_, lh = P["lug_gap"], P["lug_w"], P["lug_len"], P["lug_h"]; xc = (X0 + X1) / 2; zl0 = ZBAY   # lugs start at the case's bottom face; the cover's ears close them from below
    zbar = ZBACK + P["bar_z_from_back"]
    for ye0, ye1, ybar in ((Y0 - ll_, Y0 + 0.5, Y0 - P["bar_from_face"]), (Y1 - 0.5, Y1 + ll_, Y1 + P["bar_from_face"])):
        for xa, xb in ((xc - gap / 2 - lw_, xc - gap / 2), (xc + gap / 2, xc + gap / 2 + lw_)):
            lug = box(xa, xb, ye0, ye1, zl0, zl0 + lh)
            case = case.union(lug)
        case = case.cut(xcyl(xc - gap / 2 - P["lug_hole"][1], xc + gap / 2 + P["lug_hole"][1], ybar, zbar, P["lug_hole"][0]))
    # cover screws go up through ears of the back cover into the four lug roots: outside the gasket loop, and no boss needed in the 1.8 mm walls
    scr = P["screw"]; sc = []
    for yy in (Y0 - P["screw_from_face"], Y1 + P["screw_from_face"]):
        for xx in (xc - gap / 2 - lw_ / 2, xc + gap / 2 + lw_ / 2): sc.append((xx, yy))
    for x, y in sc: case = case.cut(cyl(x, y, scr[1], ZBAY - 0.01, ZBAY + scr[3] - P["back_t"] + 0.4))
    parts["case"] = case
    # ------------------------------------------------------------------ back cover, its gasket, screws
    back = rrect(X0, X1, Y0, Y1, r, ZBACK, ZBAY)
    for ye0, ye1 in ((Y0 - ll_, Y0 + 0.5), (Y1 - 0.5, Y1 + ll_)):                                              # ears under the four lugs carry the cover screws
        for xa, xb in ((xc - gap / 2 - lw_, xc - gap / 2), (xc + gap / 2, xc + gap / 2 + lw_)):
            back = back.union(box(xa, xb, ye0, ye1, ZBACK, ZBAY))
    bg = P["back_gasket"]; mid = P["wall"] / 2
    ring_o = rrect(X0 + mid - bg[0] / 2, X1 - mid + bg[0] / 2, Y0 + mid - bg[0] / 2, Y1 - mid + bg[0] / 2, r - 0.4, ZBAY - bg[2], ZBAY)
    ring_i = rrect(X0 + mid + bg[0] / 2, X1 - mid - bg[0] / 2, Y0 + mid + bg[0] / 2, Y1 - mid - bg[0] / 2, r - 1.4, ZBAY - bg[2] - 1, ZBAY + 1)
    groove = ring_o.cut(ring_i)
    back = back.cut(groove)
    for x, y in sc: back = back.cut(cyl(x, y, scr[0] + 0.2, ZBACK - 1, ZBAY + 1)).cut(cyl(x, y, scr[2] + 0.3, ZBACK - 0.01, ZBACK + 0.45))
    for hx, hy in PM.HOLES[2:]:                                                                                # posts under the lower board holes, with locating pins
        back = back.union(cyl(hx, hy, P["post_d"], ZBAY - 0.01, zb)).union(cyl(hx, hy, P["pin_d"], zb - 0.01, 0.4))
    back = back.union(box(cx + 2, cx + cw - 2, cy + cl + 0.4, cy + cl + 1.2, ZBAY - 0.01, ZBAY + 1.5))         # cell stop rib (lower end)
    parts["back_cover"] = back
    parts["back_gasket"] = groove.translate((0, 0, 0))                                                         # drawn at its compressed size (fills the groove)
    screws = None
    for x, y in sc:
        s1 = cyl(x, y, scr[2], ZBACK, ZBACK + 0.4).union(cyl(x, y, scr[0] - 0.25, ZBACK + 0.39, ZBACK + scr[3]))   # shank drawn at the thread root
        screws = s1 if screws is None else screws.union(s1)
    parts["cover_screws"] = screws
    # ------------------------------------------------------------------ button plunger and its O-ring
    pl = P["plunger"]; orr = P["plunger_oring"]
    parts["button_plunger"] = xcyl(W - 0.02, X1 + pl[2], sw[1], zsw, pl[0]).union(xcyl(IX1 + 0.02, IX1 + 0.45, sw[1], zsw, pl[1]))
    parts["button_oring"] = xcyl(IX1 + 0.75, IX1 + 0.75 + 0.5, sw[1], zsw, pl[0] + 0.14).cut(xcyl(IX1, X1, sw[1], zsw, pl[0]))   # marker ring at the gland position
    # ------------------------------------------------------------------ spring bars and strap stubs
    bars = None; straps = None; b = P["bar"]; st = P["strap"]
    for ybar, sgn in ((Y0 - P["bar_from_face"], -1), (Y1 + P["bar_from_face"], 1)):
        bb = xcyl(xc - gap / 2 + 0.05, xc + gap / 2 - 0.05, ybar, zbar, b[0]).union(xcyl(xc - gap / 2 - b[2] + 0.2, xc + gap / 2 + b[2] - 0.2, ybar, zbar, b[1]))
        bars = bb if bars is None else bars.union(bb)
        y0s, y1s = (ybar - st[2], ybar + st[1] / 2) if sgn < 0 else (ybar - st[1] / 2, ybar + st[2])
        ss = box(xc - st[0] / 2 + 0.1, xc + st[0] / 2 - 0.1, y0s, y1s, zbar - st[1] / 2, zbar + st[1] / 2).cut(xcyl(xc - gap, xc + gap, ybar, zbar, b[0] + 0.1))
        straps = ss if straps is None else straps.union(ss)
    parts["spring_bars"] = bars; parts["strap"] = straps
    return parts

# pairs that are meant to touch or to sit inside one another (a shared face has no volume; these are listed so that a real
# overlap between them still gets reported if it exceeds the tolerance below)
MARKERS = {"antenna_keepout"}
PRESS = {("button_oring", "case"), ("back_gasket", "back_cover"), ("usb_gasket", "port_plate"), ("usb_gasket", "usb_c"), ("lcd_fpc", "fpc_connector"),
         ("cover_screws", "case"), ("spring_bars", "case"), ("spring_bars", "strap"), ("pcb", "usb_c"), ("back_gasket", "port_plate")}

def vol(s): return s.val().Volume()
def checks(parts, verbose=True):
    out = []; hard = 0
    names = [n for n in parts if n not in MARKERS]
    for a, b in itertools.combinations(names, 2):
        try: v = vol(parts[a].intersect(parts[b]))
        except Exception: v = 0.0
        if v > 0.02:
            ok = (a, b) in PRESS or (b, a) in PRESS
            out.append(("intended overlap" if ok else "INTERFERENCE", f"{a} / {b}", f"{v:.2f} mm3"))
            hard += 0 if ok else 1
    def dist(a, b): return parts[a].val().distance(parts[b].val())
    need = [("cell", "usb_c", 0.15), ("cell", "side_switch", 0.30), ("cell", "back_cover", 0.10), ("cell", "pcb", 0.30), ("lcd", "ble_module", 0.20), ("lcd", "motor", 0.20),
            ("lcd", "fpc_connector", 0.20), ("lcd", "case", 0.10), ("usb_c", "back_cover", 0.15), ("usb_c", "case", 0.20), ("side_switch", "back_cover", 0.20),
            ("pcb", "case", 0.0), ("lens", "lcd", 0.10), ("strap", "case", 0.05), ("motor", "case", 0.15), ("ble_module", "case", 0.15), ("fpc_connector", "case", 0.15),
            ("lcd_fpc", "case", 0.15), ("lcd_fpc", "back_cover", 0.15), ("spring_bars", "cover_screws", 0.25), ("button_plunger", "side_switch", 0.0)]
    cl = []
    for a, b, req in need:
        d = dist(a, b); ok = d + 1e-6 >= req
        cl.append((a, b, d, req, ok)); hard += 0 if ok else 1
    return out, cl, hard

def main():
    parts = build()
    inter, clear, hard = checks(parts)
    print(f"case {D['case_w']:.2f} x {D['case_l']:.2f} x {D['thickness']:.2f} mm, {D['lug_to_lug']:.2f} over the lugs; parts modelled: {len(parts)}")
    for k, n, v in inter: print(f"  {k}: {n} {v}")
    for a, b, d, req, ok in clear: print(f"  clearance {a} - {b}: {d:.2f} mm (need {req:.2f}) {'ok' if ok else 'TOO SMALL'}")
    print("CAD CHECK:", "PASS" if hard == 0 else f"FAIL ({hard} hard findings)")
    if "--check" in sys.argv: sys.exit(1 if hard else 0)
    os.makedirs(os.path.join(HERE, "step"), exist_ok=True); os.makedirs(os.path.join(HERE, "views"), exist_ok=True)
    colors = {"pcb": (0.1, 0.45, 0.2), "case": (0.15, 0.15, 0.17), "back_cover": (0.2, 0.2, 0.22), "lens": (0.6, 0.8, 0.95), "lcd": (0.75, 0.78, 0.7), "cell": (0.7, 0.7, 0.75),
              "usb_c": (0.8, 0.8, 0.82), "strap": (0.05, 0.05, 0.05), "port_plate": (0.35, 0.35, 0.4), "usb_gasket": (0.9, 0.3, 0.2), "back_gasket": (0.9, 0.3, 0.2), "button_oring": (0.9, 0.3, 0.2)}
    asm = cq.Assembly(name="pitchiq_watch_revD")
    for n, s in parts.items():
        if n in MARKERS: continue
        cq.exporters.export(s, os.path.join(HERE, "step", n + ".step"))
        c = colors.get(n, (0.6, 0.6, 0.6)); asm.add(s, name=n, color=cq.Color(*c, 0.35 if n == "lens" else 1.0))
    asm.save(os.path.join(HERE, "assembly.step"))
    # exploded view: move groups apart along z
    lift = {"lens": 14, "lens_adhesive": 11, "lcd": 8, "lcd_fpc": 8, "case": 3, "port_plate": 3, "usb_gasket": 0, "button_plunger": 3, "button_oring": 3, "pcb": -6, "ble_module": -6, "motor": -6,
            "fpc_connector": -6, "pmic": -6, "accelerometer": -6, "usb_c": -6, "side_switch": -6, "cell": -12, "back_gasket": -17, "back_cover": -20, "cover_screws": -27, "spring_bars": 3, "strap": 3}
    ex = cq.Assembly(name="exploded")
    for n, s in parts.items():
        if n in MARKERS: continue
        ex.add(s.translate((0, 0, lift.get(n, 0))), name=n)
    ex.save(os.path.join(HERE, "exploded.step"))
    comp = ex.toCompound(); allc = asm.toCompound()
    opt = dict(width=900, height=700, marginLeft=40, marginTop=40, showAxes=False, strokeWidth=0.25, showHidden=False)
    for name, shape, direction in (("exploded_iso", comp, (1.0, -1.2, 0.9)), ("assembly_iso", allc, (1.0, -1.2, 0.9)), ("assembly_back_iso", allc, (1.0, -1.2, -0.9)),
                                   ("assembly_top", allc, (0, 0, 1)), ("assembly_side", allc, (1, 0, 0)), ("assembly_port_side", allc, (-1, 0, 0))):
        cq.exporters.export(cq.Workplane(obj=shape), os.path.join(HERE, "views", name + ".svg"), opt=dict(opt, projectionDir=direction))
    # report
    R = ["# CAD build report, rev D (generated by cad/build.py; nothing printed or fitted)", "",
         f"Case {D['case_w']:.2f} x {D['case_l']:.2f} x {D['thickness']:.2f} mm; {D['lug_to_lug']:.2f} mm over the lugs.", "",
         "## Part volumes", "", "| Part | Volume mm3 |", "|---|---|"]
    for n, s in parts.items():
        if n not in MARKERS: R.append(f"| {n} | {vol(s):.0f} |")
    R += ["", "## Overlaps between solids (threshold 0.02 mm3)", "", "| Kind | Pair | Overlap |", "|---|---|---|"] + [f"| {k} | {n} | {v} |" for k, n, v in inter] + (["| none | | |"] if not inter else [])
    R += ["", "Intended overlaps are seals drawn at free size, screws and bar tips in their holes, and the cable in the connector.", "",
          "## Clearances (minimum distance between solids)", "", "| A | B | Distance mm | Required mm | Result |", "|---|---|---|---|---|"]
    R += [f"| {a} | {b} | {d:.2f} | {req:.2f} | {'ok' if ok else 'TOO SMALL'} |" for a, b, d, req, ok in clear]
    R += ["", f"Result: {'PASS' if hard == 0 else 'FAIL'} ({hard} hard findings)."]
    open(os.path.join(HERE, "report.md"), "w").write("\n".join(R) + "\n")
    sys.exit(1 if hard else 0)

if __name__ == "__main__":
    main()
