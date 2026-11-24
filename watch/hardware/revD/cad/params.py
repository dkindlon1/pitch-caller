"""Every dimension of the PitchIQ watch rev D mechanical model, in one place (mm).

Edit a value here and run `python3 cad/build.py` to rebuild every part, the assembly, the STEP files and the checks.
Tags: SEEN = read on a manufacturer drawing or page (source in research/mech_inputs.md); EST = estimate to be measured
on the real part; DESIGN = our own choice.

Coordinates used by build.py: x and y are the board's own (KiCad) coordinates, origin at the board's top-left corner
seen from the display side, y pointing down the board. z = 0 is the board's top (display-side) copper face, +z toward the lens.
The CAD model mirrors y (Y_cad = board_h - y) so that the solid is right-handed and the display faces +Z.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))
try:
    import gen_pcb as G                       # board outline, notch, holes, part positions come from the PCB source of truth
    BOARD_W, BOARD_H, BOARD_R, NOTCH, HOLES, MOTOR_C, PLACE, USB_Y = G.W, G.H, G.RAD, G.NOTCH, G.HOLES, G.MOTOR, G.PLACE, G.USB_Y
except Exception as e:                        # lets the CAD be rebuilt on a machine without KiCad's Python module
    print("note: gen_pcb not importable (%s); using the copied board numbers below" % e)
    BOARD_W, BOARD_H, BOARD_R = 30.6, 36.0, 3.0
    NOTCH = (0.0, 5.35, 6.3, 15.65); HOLES = [(2.2, 2.2), (28.4, 2.2), (2.2, 33.8), (28.4, 33.8)]; MOTOR_C = (5.3, 22.7, 4.1); USB_Y = 10.5
    PLACE = {"U1": (15.0, 8.4, 0), "J1": (14.0, 31.0, 0), "U2": (21.3, 24.2, 0), "SW1": (28.5, 12.0, 270), "BT1": (28.5, 21.0, 90)}

P = dict(
    # ---- board ------------------------------------------------------------------------------------------------------
    board_t=0.80,                 # SEEN (fab order), +/-0.08
    # ---- display (Sharp LS013B7DH03) --------------------------------------------------------------------------------
    lcd=(26.6, 30.3, 0.74),       # SEEN outline x, y, thickness
    lcd_xy=(2.0, 5.5),            # DESIGN: glass top-left corner on the board (clear of the antenna end)
    lcd_active=(23.04, 23.04),    # SEEN
    lcd_gap=0.35,                 # DESIGN: clearance between the tallest top-side part zone and the glass underside
    fpc_w=6.0, fpc_t=0.12,        # EST: tail width and thickness (the Sharp figure is an image; measure the part)
    fpc_loop=1.9,                 # DESIGN: room past the glass edge for the fold. Sharp allows bending only from 0.8 mm beyond the glass (SEEN), radius >= 0.45
    # ---- lens --------------------------------------------------------------------------------------------------------
    lens_t=1.00, lens_adh=0.15,   # DESIGN: hard-coated PMMA or glass, bonded with a die-cut frame of tape
    lens_ledge=1.2,               # DESIGN: bond ledge width all round
    aperture_margin=0.2,          # DESIGN: gap between the glass edge and the case opening
    # ---- top-side parts ----------------------------------------------------------------------------------------------
    top_zone=2.35,                # DESIGN: height reserved above the board (module 2.05 +0.2 SEEN, motor 2.1 + tape)
    module=(10.5, 15.5, 2.05),    # SEEN Raytac MDBT50Q-1MV2 (x, y, z)
    motor=(8.0, 2.1),             # SEEN diameter, thickness
    fpc_conn=(9.1, 5.6, 2.0),     # SEEN on KiCad's 3D model of FH12-10S-0.5SH (width, depth, height); cable slot on the footprint's +y side
    pmic=(5.0, 5.0, 0.9),         # SEEN package
    # ---- bottom-side parts and the bay -------------------------------------------------------------------------------
    cell=(19.75, 26.0, 3.8),      # SEEN Adafruit 1317 (x, y, thickness). Other 402025 cells run to 20.5 x 29 x 4.5 (SEEN max)
    cell_xy=(6.6, 9.8),           # DESIGN: 0.5 mm clear of the back of the USB-C body
    cell_gap=0.5,                 # DESIGN: foam / Kapton between the board's bottom and the cell (clears the USB-C solder tails)
    bay=5.10,                     # DESIGN: board bottom to back cover. Set by the port plate: it needs >= 0.6 mm of material under the gasket pocket
    switch=(2.56, 4.5, 3.3),      # EST Alps SKRTLAE010 body (x, y, height below the board); plunger tip at the board edge
    switch_travel=0.2, switch_force=1.6,   # SEEN
    # ---- USB-C receptacle (GCT USB4715-GF-A) and its gasket (USBTJ-04) ------------------------------------------------
    usb_flange=(10.54, 4.76, 0.2),      # SEEN width, height; EST flange thickness (sheet metal; it stands in front of the board edge, wider than the 10.30 notch)
    usb_shell=(9.94, 4.46),             # SEEN width, height behind the flange
    usb_nose=(8.34, 2.56, 1.90),        # SEEN tongue shell width, height, length in front of the flange
    usb_sink=0.55,                      # SEEN: how far the body sinks into the board notch
    usb_body_back=6.1,                  # DESIGN: body ends just inside the 6.3 mm notch; solder tails reach x = 7.55
    usb_tail=(7.55, 0.30),              # SEEN pad end; EST tail + solder height below the board's bottom face
    gasket_free=1.50, gasket_outer=(10.64, 4.86), gasket_inner=(8.94, 3.16),   # SEEN
    gasket_compressed=0.975,            # DESIGN target (35 %); GCT: at least 0.45 compression, 30-40 % suggested -> 0.90..1.05
    pocket=(11.00, 5.30, 0.90),         # width and depth SEEN (GCT 11.00 x 5.90 x 0.90). Height reduced to 5.30 (DESIGN): still 0.22 mm clear of the 4.86 gasket all round, and leaves 0.6 mm of plate under it
    port_open=(9.14, 3.36),             # SEEN: through-opening for the nose
    plate=(14.4, 1.0),                  # DESIGN: port-plate width along the wall, and how far it rises above the pocket top
    plate_gap=0.15,                     # DESIGN: fit clearance round the port plate. The window locates the plate in y and z; only its depth (x) is set against the real connector
    # ---- case --------------------------------------------------------------------------------------------------------
    clear=0.30,                   # DESIGN: board edge to inner wall
    wall=1.80,                    # SEEN: GCT's panel thickness for the gasket pocket; also our wall everywhere
    corner_r=4.0,                 # DESIGN: outer corner radius
    back_t=1.00,                  # DESIGN
    back_gasket=(1.0, 0.50, 0.35),# DESIGN: back gasket width, free thickness, groove depth in the cover
    screw_from_face=1.5,          # DESIGN: cover screws sit in the lug roots, this far outside the case end faces
    screw=(1.4, 1.12, 2.6, 5.0),  # EST: M1.4 thread-forming screw: thread dia, pilot hole, head dia, length. Not selected from a catalogue
    rib=(1.5, 3.0),               # DESIGN: wall ribs that the board's top face stops against (reach over the board, length)
    post_d=2.6, pin_d=1.10,       # DESIGN: posts and locating pins. Pins are 0.5 mm loose in the 1.6 holes because two different parts carry them
    post_foam=0.5,                # DESIGN: cover posts stop this far below the board; a foam pad takes up the gap (the ribs above set the board's height)
    # ---- button ------------------------------------------------------------------------------------------------------
    plunger=(2.0, 3.0, 0.6),      # DESIGN: shaft dia, inner head dia, how far the cap stands proud of the case
    plunger_pad=0.5,              # DESIGN: soft pad between plunger and switch: absorbs the +/-0.4 mm stack-up, lets the board pass on assembly
    plunger_bore=2.30, gland=(2.72, 0.89),   # DESIGN bore for the 2.0 shaft; gland diameter and width (Apple Rubber table for a 0.5 section: depth 0.33-0.36, width 0.89 SEEN)
    button_boss=(5.0, 1.0),       # DESIGN: round boss on the outer wall at the button (dia, height). The 1.8 mm wall cannot hold a head counterbore, a gland and 0.6 mm lands (re-audit N1)
    plunger_retract=0.25,         # DESIGN: how far the plunger can slide outward, so the board and switch pass it on assembly
    gland_land=0.6,               # DESIGN: minimum wall each side of the O-ring groove
    plunger_oring=(2.0, 0.5),     # EST, NOT SOURCED: O-ring inner dia x section for the 2.0 shaft (gland per Apple Rubber table: depth 0.33-0.36, width 0.89 SEEN)
    # ---- lugs and strap (Archer 20 mm quick-release silicone) -----------------------------------------------------------
    lug_gap=20.0,                 # DESIGN: +0.10 / -0; model 20.2 for printed parts and ream
    lug_w=4.0, lug_len=5.6, lug_h=4.4,       # DESIGN
    bar_from_face=3.5,            # DESIGN: bar centre from the case end face (clears a 3 mm strap end swinging)
    bar_z_from_back=2.2,          # DESIGN: bar centre above the back face
    bar=(1.8, 0.9, 1.9),          # SEEN Archer quick-release bar body dia and tip dia; EST tip engagement
    lug_hole=(1.0, 1.9),          # DESIGN: hole dia for a 0.9 tip, depth
    strap=(20.0, 3.0, 14.0),      # SEEN width, thickness; length of the stub modelled
    # ---- process tolerances used by the tolerance report -----------------------------------------------------------------
    tol_mjf=0.25, tol_cnc=0.13, tol_pcb=0.10, tol_place=0.10,   # SEEN (service-bureau design guides), EST placement
)
# Allowances for a first fit-check print in MJF nylon (+/-0.25): PQ_PROCESS=mjf python3 cad/build.py writes cad/step_mjf/.
MJF = dict(aperture_margin=0.40, clear=0.45, lug_gap=20.3, lug_hole=(1.3, 1.9), lens_recess_margin=0.30, plate_gap=0.40)
P["lens_recess_margin"] = 0.10
PROCESS = os.environ.get("PQ_PROCESS", "nominal")
if PROCESS == "mjf": P.update(MJF)

def derived(P=P):
    """Stack and envelope numbers that follow from P. Returned as a dict so the report and the drawings use the same values."""
    D = {}
    D["z_lcd0"] = P["top_zone"] + P["lcd_gap"]                 # glass underside
    D["z_lcd1"] = D["z_lcd0"] + P["lcd"][2]
    D["z_lens0"] = D["z_lcd1"] + P["lens_adh"]
    D["z_top"] = D["z_lens0"] + P["lens_t"]                    # outside face of the lens = top of the case
    D["z_board_bot"] = -P["board_t"]
    D["z_bay"] = D["z_board_bot"] - P["bay"]                   # inside face of the back cover = bottom of the walls
    D["z_back"] = D["z_bay"] - P["back_t"]                     # outside face of the back
    D["thickness"] = D["z_top"] - D["z_back"]
    D["x0"] = -(P["clear"] + P["wall"]); D["x1"] = BOARD_W + P["clear"] + P["wall"]
    D["y0"] = -(P["clear"] + P["wall"]); D["y1"] = BOARD_H + P["clear"] + P["wall"] + P["fpc_loop"]
    D["case_w"] = D["x1"] - D["x0"]; D["case_l"] = D["y1"] - D["y0"]
    D["lug_to_lug"] = D["case_l"] + 2 * P["lug_len"]
    D["z_usb_top"] = D["z_board_bot"] + P["usb_sink"]          # top of the receptacle body (inside the notch)
    D["z_usb_bot"] = D["z_usb_top"] - P["usb_flange"][1]
    D["z_usb_c"] = (D["z_usb_top"] + D["z_usb_bot"]) / 2       # centre line of the port
    D["x_wall_in"] = -P["clear"]                               # inside face of the left wall
    D["x_pocket"] = D["x_wall_in"] - P["pocket"][2]            # pocket floor = sealing land
    D["x_flange"] = D["x_pocket"] + P["gasket_compressed"]     # front face of the receptacle flange when the gasket is at target
    D["usb_overhang"] = -(D["x_flange"] - P["usb_nose"][2])    # nose tip past the board edge (GCT: 2.10)
    D["land_margin"] = (D["z_usb_c"] - P["gasket_outer"][1] / 2) - D["z_bay"]   # wall material below the gasket's lower edge
    D["pocket_floor_margin"] = (D["z_usb_c"] - P["pocket"][1] / 2) - D["z_bay"]  # plate material below the pocket
    D["cell_z1"] = D["z_board_bot"] - P["cell_gap"]; D["cell_z0"] = D["cell_z1"] - P["cell"][2]
    D["cell_swell_room"] = D["cell_z0"] - D["z_bay"]
    return D

if __name__ == "__main__":
    D = derived()
    for k in ("case_w", "case_l", "thickness", "lug_to_lug", "usb_overhang", "land_margin", "pocket_floor_margin", "cell_swell_room"): print(f"{k:16s} {D[k]:.2f}")
