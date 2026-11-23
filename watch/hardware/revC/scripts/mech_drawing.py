"""Dimensioned layout drawing of the rev C watch (case concept, option B) as SVG: plan view and stack section.
All numbers come from MECH below, the same numbers quoted in docs. This is a concept layout to check packaging,
not a CAD model and not a manufacturing drawing. Nothing here has been built."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
MECH = dict(
    board=(30.6, 36.0), board_t=0.8, clear=0.3, wall=1.8, lens_t=1.0, lens_adh=0.15, lcd=(26.6, 30.3, 0.74), lcd_gap=0.35, top_gap=2.35, fpc_loop=1.6,
    cell=(19.75, 26.0, 3.8), cell_foam=0.7, back_t=1.0, lcd_xy=(2.0, 5.5), cell_xy=(6.2, 9.8), usb_y=10.5, usb_body=(10.54, 8.2, 4.76), usb_proud=4.21, usb_over=2.1,
    btn_y=12.0, motor=(5.3, 22.7, 8.0, 2.1), antenna_keepout=4.0, lug_gap=20.0, lug_bar_from_face=3.2, lug_len=5.6, lug_t=4.0, bar_d=1.5, bar_hole=1.1, bar_hole_depth=1.8,
    holes=[(2.2, 2.2), (28.4, 2.2), (2.2, 33.8), (28.4, 33.8)], screw="M1.4 thread-forming into plastic bosses (pilot 1.12, estimate)")
M = MECH
case_w = M["board"][0] + 2 * (M["clear"] + M["wall"]); case_l = M["board"][1] + 2 * (M["clear"] + M["wall"]) + M["fpc_loop"]   # the display cable folds over 1.6 mm past the board's bottom edge
stack = [("lens (hard-coated PC)", M["lens_t"]), ("adhesive", M["lens_adh"]), ("LCD LS013B7DH03", M["lcd"][2]), ("gap over parts", M["lcd_gap"]),
         ("top-side parts (module 2.05 +0.15, motor 2.1 + tape)", M["top_gap"]), ("PCB", M["board_t"]), ("bay: cell 3.8 + swell 0.3 + foam; USB-C body 4.21 beside it", M["cell"][2] + M["cell_foam"]), ("back cover", M["back_t"])]
case_t = sum(t for _, t in stack)
if __name__ == "__main__":
    S = 12.0; pad = 60
    o = []
    def R(x, y, w, h, st="fill:none;stroke:#222;stroke-width:1.5", rx=0): o.append(f'<rect x="{x*S+pad:.1f}" y="{y*S+pad:.1f}" width="{w*S:.1f}" height="{h*S:.1f}" rx="{rx*S:.1f}" style="{st}"/>')
    def T(x, y, s, size=13, anchor="start", col="#222"): o.append(f'<text x="{x*S+pad:.1f}" y="{y*S+pad:.1f}" font-family="sans-serif" font-size="{size}" text-anchor="{anchor}" fill="{col}">{s}</text>')
    def L(x0, y0, x1, y1, st="stroke:#06c;stroke-width:1"): o.append(f'<line x1="{x0*S+pad:.1f}" y1="{y0*S+pad:.1f}" x2="{x1*S+pad:.1f}" y2="{y1*S+pad:.1f}" style="{st}"/>')
    def C(x, y, r, st="fill:none;stroke:#222;stroke-width:1.2"): o.append(f'<circle cx="{x*S+pad:.1f}" cy="{y*S+pad:.1f}" r="{r*S:.1f}" style="{st}"/>')
    def dimh(x0, x1, y, txt): L(x0, y, x1, y); L(x0, y - 0.5, x0, y + 0.5); L(x1, y - 0.5, x1, y + 0.5); T((x0 + x1) / 2, y - 0.5, txt, 12, "middle", "#06c")
    def dimv(y0, y1, x, txt): L(x, y0, x, y1); L(x - 0.5, y0, x + 0.5, y0); L(x - 0.5, y1, x + 0.5, y1); T(x + 0.6, (y0 + y1) / 2, txt, 12, "start", "#06c")
    # ---------- plan view, seen from the lens side. origin = case outer top-left; lugs above and below
    lx = M["lug_len"]; ox, oy = 6.0, lx + 6.0
    def P(x, y): return ox + x, oy + y
    bx = M["wall"] + M["clear"]; by = bx
    T(ox, oy - lx - 3.5, "PitchIQ watch rev C: packaging layout (concept, option B). Plan view from the display side. mm. NOT BUILT.", 15)
    R(ox, oy, case_w, case_l, rx=4.0)
    lw = (case_w - M["lug_gap"]) / 2
    for yy in (oy - lx, oy + case_l):
        R(ox, yy, lw, lx, rx=1.0); R(ox + case_w - lw, yy, lw, lx, rx=1.0)
    bar_y_top = oy - M["lug_bar_from_face"]; bar_y_bot = oy + case_l + M["lug_bar_from_face"]
    for yy in (bar_y_top, bar_y_bot): L(ox + lw - M["bar_hole_depth"], yy, ox + case_w - lw + M["bar_hole_depth"], yy, "stroke:#a00;stroke-width:2;stroke-dasharray:6 3")
    T(ox + case_w / 2, bar_y_top - 0.6, f"spring bar {M['bar_d']} dia, hole {M['bar_hole']} x {M['bar_hole_depth']} deep", 11, "middle", "#a00")
    R(*P(bx, by), *M["board"], st="fill:#eef6ee;stroke:#383;stroke-width:1.2", rx=3.0); T(*P(bx + 9.5, by + 34.8), "PCB 30.6 x 36 x 0.8", 11, col="#383")
    R(*P(bx, by), M["board"][0], M["antenna_keepout"], st="fill:#fde;stroke:#c36;stroke-width:1;stroke-dasharray:4 3"); T(*P(bx + 15, by + 2.6), "antenna end: no copper, no metal", 11, "middle", "#c36")
    R(*P(bx + M["lcd_xy"][0], by + M["lcd_xy"][1]), M["lcd"][0], M["lcd"][1], st="fill:none;stroke:#06c;stroke-width:1.5"); T(*P(bx + 15, by + 8.0), "LCD glass 26.6 x 30.3 (active 23.04 x 23.04)", 11, "middle", "#06c")
    R(*P(bx + 3.48, by + 5.5 + 2.0), 23.04, 23.04, st="fill:none;stroke:#06c;stroke-width:0.8;stroke-dasharray:3 3")
    R(*P(bx + M["cell_xy"][0], by + M["cell_xy"][1]), M["cell"][0], M["cell"][1], st="fill:none;stroke:#b70;stroke-width:1.2;stroke-dasharray:8 4"); T(*P(bx + 16, by + 30.0), "cell 19.75 x 26 x 3.8 (under the board)", 11, "middle", "#b70")
    C(*P(bx + M["motor"][0], by + M["motor"][1]), M["motor"][2] / 2); T(*P(bx + M["motor"][0], by + M["motor"][1] + 0.4), "motor 8", 10, "middle")
    ub = M["usb_body"]; R(*P(bx - M["usb_over"], by + M["usb_y"] - ub[0] / 2), ub[1], ub[0], st="fill:#ddd;stroke:#222;stroke-width:1.2"); T(*P(bx + 0.4, by + M["usb_y"] + 0.4), "USB-C (under)", 10)
    R(*P(bx + 28.6, by + M["btn_y"] - 2.25), 3.9, 4.5, st="fill:#ddd;stroke:#222;stroke-width:1.2"); T(*P(case_w + 0.5 - bx, by + M["btn_y"] + 0.4), "button", 10)
    for hx, hy in M["holes"]: C(*P(bx + hx, by + hy), 0.8, "fill:#fff;stroke:#222;stroke-width:1")
    dimh(ox, ox + case_w, oy + case_l + lx + 3.0, f"case width {case_w:.1f}")
    dimv(oy, oy + case_l, ox + case_w + 4.0, f"case body {case_l:.1f}")
    dimv(oy - lx, oy + case_l + lx, ox + case_w + 14.0, f"over lugs {case_l + 2 * lx:.1f}")
    dimh(ox + lw, ox + case_w - lw, oy - lx - 1.2, f"lug gap {M['lug_gap']:.2f} +0.10/-0")
    dimv(oy - M["lug_bar_from_face"], oy, ox - 2.5, f"{M['lug_bar_from_face']}")
    # ---------- stack section (vertical scale x3)
    sx = ox + case_w + 34.0; sy = oy; Z = 3.0
    T(sx, sy - 3.5, "Stack through the middle of the watch, lens at the top (vertical scale 3x)", 15)
    z = 0.0
    cols = ["#cde", "#eee", "#9bd", "#fff", "#efe", "#383", "#fc8", "#bbb"]
    for (name, t), col in zip(stack, cols):
        R(sx, sy + z * Z, 26.0, t * Z, st=f"fill:{col};stroke:#222;stroke-width:1"); T(sx + 27.0, sy + (z + t / 2) * Z + 0.4, f"{t:.2f}  {name}", 12); z += t
    dimv(sy, sy + z * Z, sx - 3.0, ""); T(sx - 3.6, sy + z * Z / 2, f"{case_t:.1f}", 13, "end", "#06c")
    T(sx, sy + z * Z + 3.0, f"Case about {case_w:.1f} x {case_l:.1f} x {case_t:.1f} mm, {case_l + 2 * lx:.1f} mm over the lugs. Wall {M['wall']}, board clearance {M['clear']}.", 12)
    T(sx, sy + z * Z + 4.6, f"USB-C receptacle on the BOTTOM of the board, in the cell bay: it stands {M['usb_proud']} mm proud of the board (GCT drawing: 4.76 flange,", 12)
    T(sx, sy + z * Z + 6.2, "0.55 sunk in the notch). Opening through the left wall, sealed by its gasket (wall opening 9.14 x 3.36 with an 11.00 x 5.90 step).", 12)
    T(sx, sy + z * Z + 7.8, "The board must float about 0.5 mm toward the port so the gasket, not the solder, sets the seal (slotted holes + foam).", 12)
    T(sx, sy + z * Z + 9.4, f"Back cover: {M['screw']}; bottom two holes only. Top two holes are plastic locating posts (antenna end).", 12)
    T(sx, sy + z * Z + 11.0, "Seal: die-cut gasket or adhesive on a flat ledge. An O-ring groove does not fit a 1.8 mm wall.", 12)
    T(sx, sy + z * Z + 12.6, f"Lugs: gap {M['lug_gap']:.2f} (model 20.2 and ream if printed), thickness >= {M['lug_t']}, bar centre {M['lug_bar_from_face']} from the case face and 2.4 from the lug end.", 12)
    T(sx, sy + z * Z + 14.2, "All of this is a packaging estimate. No CAD model, no part measured, no fit checked.", 12, col="#a00")
    Wpx = (sx + 112) * S + pad; Hpx = (oy + case_l + lx + 8) * S + pad
    out = os.path.join(os.path.dirname(__file__), "..", "mech", "pitchiq_watch_revC_layout.svg")
    open(out, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{Wpx:.0f}" height="{Hpx:.0f}" viewBox="0 0 {Wpx:.0f} {Hpx:.0f}"><rect width="100%" height="100%" fill="#fff"/>' + "".join(o) + "</svg>")
    print(f"case {case_w:.1f} x {case_l:.1f} x {case_t:.2f} mm; over lugs {case_l + 2 * lx:.1f}; wrote {out}")
