"""
PitchIQ site hero: an original smartwatch (not any real product's design) assembles from its parts, turns screen-on and
receives a call. Rendered with Blender Cycles (bpy). The screen shows the real PitchIQ watch face (see make_screens.py).

Run (inside the venv):  python build_watch.py --set wide --out frames/wide [--only 0,30,60] [--scale 0.5] [--samples 32]
Open in Blender instead:  blender -b -P build_watch.py -- --set wide --out //frames/wide
Units: 1 Blender unit = 1 mm.
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector

# ---------------------------------------------------------------- arguments
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
SET = arg("--set", "wide")                      # wide (16:10) or tall (9:16, used for tablets and phones)
OUT = arg("--out", f"frames/{SET}")
ALPHA = "--alpha" in argv                  # a transparent ground: the watch cut out of a frame (the page lifts the last frame this way)
SKIP = "--skip-existing" in argv           # resume a stopped render: leave frames that are already on disk
SCALE = float(arg("--scale", "1"))
SAMPLES = int(arg("--samples", "768"))
N = int(arg("--frames", "150"))
DEVICE = arg("--device", "GPU")                 # GPU (OptiX, then CUDA) or CPU
HDRI = arg("--hdri", "studio_small_09_2k.exr")  # in hdri/ next to this script (Poly Haven, CC0)
HDRI_STR = float(arg("--hdri-strength", "1.0"))
HDRI_ROT = float(arg("--hdri-rot", "0"))
EXPOSURE = float(arg("--exposure", "-0.15"))
LOOK = arg("--look", "AgX - Medium High Contrast")
GROUND = (0x0c, 0x0b, 0x0e)                     # the page's ground: the frame edges must be exactly this
REST = int(arg("--rest", "0"))
ONLY = [int(x) for x in arg("--only", "").split(",") if x != ""]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(OUT)                 # Blender reads a relative render path from the drive root on Windows
RES = {"wide": (1920, 1200), "tall": (1080, 1680)}[SET]   # v2: was 1600x1000 / 900x1400 at --scale 0.8

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"; scene.unit_settings.scale_length = 0.001
scene.render.engine = "CYCLES"
cy = scene.cycles
cy.samples = SAMPLES; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.008; cy.adaptive_min_samples = 64
cy.use_denoising = True; cy.denoiser = "OPENIMAGEDENOISE"
try: cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"; cy.denoising_prefilter = "ACCURATE"
except Exception: pass
cy.max_bounces = 12; cy.glossy_bounces = 8; cy.transmission_bounces = 8; cy.transparent_max_bounces = 16; cy.diffuse_bounces = 3
cy.sample_clamp_indirect = 6; cy.caustics_reflective = False; cy.caustics_refractive = False
cy.device = "CPU"
if DEVICE == "GPU":
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = kind; prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type == kind]
                if gpus:
                    for d in prefs.devices: d.use = d.type == kind
                    cy.device = "GPU"; print("render device:", kind, [d.name for d in gpus], flush=True); break
            except Exception: continue
    except Exception as e:
        print("GPU not available, rendering on the CPU:", e, flush=True)
    try: cy.denoising_use_gpu = cy.device == "GPU"
    except Exception: pass
scene.render.resolution_x = int(RES[0] * SCALE); scene.render.resolution_y = int(RES[1] * SCALE); scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_depth = "16"
scene.render.use_motion_blur = True; scene.render.motion_blur_shutter = 0.45 * (N - 1) / 71.0   # the same blur length as the 72-frame film
scene.render.dither_intensity = 0.0                # no dither: the ground has to stay one flat color
try:
    scene.view_settings.view_transform = "AgX"
except Exception:
    scene.view_settings.view_transform = "Standard"
try: scene.view_settings.look = LOOK
except Exception: pass
scene.view_settings.exposure = EXPOSURE
bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
scene.frame_start = 0; scene.frame_end = N - 1
# The world: a studio HDRI lights and reflects in the watch, but the camera itself sees one flat color, calibrated
# below so every empty pixel comes out exactly GROUND after the view transform.
w = bpy.data.worlds.new("W"); scene.world = w; w.use_nodes = True
wn = w.node_tree
for n in list(wn.nodes): wn.nodes.remove(n)
w_out = wn.nodes.new("ShaderNodeOutputWorld"); w_mix = wn.nodes.new("ShaderNodeMixShader"); w_lp = wn.nodes.new("ShaderNodeLightPath")
w_env = wn.nodes.new("ShaderNodeBackground"); w_flat = wn.nodes.new("ShaderNodeBackground")
w_tex = wn.nodes.new("ShaderNodeTexEnvironment"); w_map = wn.nodes.new("ShaderNodeMapping"); w_co = wn.nodes.new("ShaderNodeTexCoord")
w_tex.image = bpy.data.images.load(os.path.join(HERE, "hdri", HDRI))
w_map.inputs["Rotation"].default_value = (0, 0, math.radians(HDRI_ROT))
w_env.inputs["Strength"].default_value = HDRI_STR; w_flat.inputs["Strength"].default_value = 1.0
wn.links.new(w_co.outputs["Generated"], w_map.inputs["Vector"]); wn.links.new(w_map.outputs["Vector"], w_tex.inputs["Vector"])
wn.links.new(w_tex.outputs["Color"], w_env.inputs["Color"])
wn.links.new(w_lp.outputs["Is Camera Ray"], w_mix.inputs[0]); wn.links.new(w_env.outputs[0], w_mix.inputs[1]); wn.links.new(w_flat.outputs[0], w_mix.inputs[2])
wn.links.new(w_mix.outputs[0], w_out.inputs[0])

def calibrate_ground():
    """Find the scene-linear color the camera must see so the saved pixel is exactly GROUND (the view transform is not
    the plain sRGB curve). Renders an empty 8x8 frame a few times; the scene has no objects yet."""
    import tempfile
    cd = bpy.data.cameras.new("calcam"); co = bpy.data.objects.new("calcam", cd); scene.collection.objects.link(co); scene.camera = co
    keep = (scene.render.resolution_x, scene.render.resolution_y, cy.samples, cy.use_denoising, scene.render.use_motion_blur, scene.render.filepath)
    scene.render.resolution_x = scene.render.resolution_y = 8; cy.samples = 1; cy.use_denoising = False; scene.render.use_motion_blur = False
    tmp = os.path.join(tempfile.gettempdir(), "pq_ground_cal.png")
    want = [c / 255.0 for c in GROUND]
    lo = [1e-5] * 3; hi = [0.2] * 3; lin = [0.006] * 3; got = want
    for it in range(40):                       # bisection per channel (the transform is steep and not quite per-channel)
        lin = [math.sqrt(a * b) for a, b in zip(lo, hi)]
        w_flat.inputs["Color"].default_value = (*lin, 1)
        scene.render.filepath = tmp; bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(tmp); im.colorspace_settings.name = "Non-Color"; got = list(im.pixels[:3]); bpy.data.images.remove(im)
        if max(abs(g - t) for g, t in zip(got, want)) < 0.0003: break
        for i in range(3):
            if got[i] > want[i]: hi[i] = lin[i]
            else: lo[i] = lin[i]
            if hi[i] / lo[i] < 1.0005: lo[i] /= 1.3; hi[i] *= 1.3     # another channel moved this one: reopen the bracket
    assert max(abs(g - t) for g, t in zip(got, want)) < 0.0015, "the ground color did not calibrate"
    print("ground calibrated:", [round(g * 255, 3) for g in got], "from linear", [round(l, 6) for l in lin], flush=True)
    (scene.render.resolution_x, scene.render.resolution_y, cy.samples, cy.use_denoising, scene.render.use_motion_blur, scene.render.filepath) = keep
    bpy.data.objects.remove(co); bpy.data.cameras.remove(cd)
calibrate_ground()
scene.render.film_transparent = ALPHA
if ALPHA: scene.render.image_settings.color_mode = "RGBA"

# ---------------------------------------------------------------- helpers
def setin(node, name, value):
    try:
        node.inputs[name].default_value = value
    except KeyError:
        pass

def material(name, color, metal=0.0, rough=0.5, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    setin(p, "Base Color", (*color, 1)); setin(p, "Metallic", metal); setin(p, "Roughness", rough)
    for k, v in kw.items():
        setin(p, k.replace("_", " "), v)
    return m

def rrect(wd, ht, r, seg=10):
    pts = []; cx, cyy = wd / 2 - r, ht / 2 - r
    for sx, sy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((sx * cx + r * math.cos(a), sy * cyy + r * math.sin(a)))
    return pts

def to_obj(name, bm, mat, bevel=0.0, bevel_seg=3, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    if smooth:
        for poly in me.polygons: poly.use_smooth = True
    ob.data.materials.append(mat)
    if bevel:
        md = ob.modifiers.new("bev", "BEVEL"); md.width = bevel; md.segments = bevel_seg; md.limit_method = "ANGLE"; md.angle_limit = math.radians(35)
    return ob

def prism(name, outer, z0, z1, mat, inner=None, bevel=0.0, bevel_seg=3):
    bm = bmesh.new()
    def loop(pts, z): return [bm.verts.new((x, y, z)) for x, y in pts]
    a0, a1 = loop(outer, z0), loop(outer, z1); n = len(outer)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a0[i], a0[j], a1[j], a1[i]))
    if inner:
        b0, b1 = loop(inner, z0), loop(inner, z1)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((b0[j], b0[i], b1[i], b1[j]))
            bm.faces.new((a1[i], a1[j], b1[j], b1[i]))
            bm.faces.new((a0[j], a0[i], b0[i], b0[j]))
    else:
        bm.faces.new(a1); bm.faces.new(list(reversed(a0)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return to_obj(name, bm, mat, bevel, bevel_seg)

def box(name, size, loc, mat, bevel=0.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.translate(bm, vec=loc, verts=bm.verts)
    return to_obj(name, bm, mat, bevel, 2, smooth=False)

def cyl(name, r, h, loc, mat, axis="Z", bevel=0.0, seg=40):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    if axis == "X": bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(math.pi / 2, 3, "Y"), verts=bm.verts)
    if axis == "Y": bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(math.pi / 2, 3, "X"), verts=bm.verts)
    bmesh.ops.translate(bm, vec=loc, verts=bm.verts)
    return to_obj(name, bm, mat, bevel, 2)

# ---------------------------------------------------------------- materials
def brushed(name, color, rough, aniso=0.6, grain=(1.0, 90.0, 90.0), bump=0.035, vary=0.07, tangent="Z", coat=0.0):
    """Brushed metal: stretched noise drives a fine bump (the brushing lines) and a little roughness variation, with
    anisotropic highlights along the grain. Not perfect CG: the variation and a larger, faint smudge layer break it up."""
    m = material(name, color, 1.0, rough, Anisotropic=aniso, Coat_Weight=coat, Coat_Roughness=0.08)
    nt = m.node_tree; p = nt.nodes["Principled BSDF"]
    co = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = grain
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 1.6; nz.inputs["Detail"].default_value = 6.0
    sm = nt.nodes.new("ShaderNodeTexNoise"); sm.inputs["Scale"].default_value = 0.11; sm.inputs["Detail"].default_value = 3.0
    nt.links.new(co.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"]); nt.links.new(co.outputs["Object"], sm.inputs["Vector"])
    add = nt.nodes.new("ShaderNodeMath"); add.operation = "MULTIPLY_ADD"; add.inputs[1].default_value = vary; add.inputs[2].default_value = rough - vary * 0.5
    nt.links.new(nz.outputs["Fac"], add.inputs[0])
    add2 = nt.nodes.new("ShaderNodeMath"); add2.operation = "MULTIPLY_ADD"; add2.inputs[1].default_value = 0.06; nt.links.new(sm.outputs["Fac"], add2.inputs[0]); nt.links.new(add.outputs[0], add2.inputs[2])
    nt.links.new(add2.outputs[0], p.inputs["Roughness"])
    bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = bump; bp.inputs["Distance"].default_value = 0.02
    nt.links.new(nz.outputs["Fac"], bp.inputs["Height"]); nt.links.new(bp.outputs["Normal"], p.inputs["Normal"])
    tg = nt.nodes.new("ShaderNodeTangent"); tg.direction_type = "RADIAL"; tg.axis = tangent
    nt.links.new(tg.outputs["Tangent"], p.inputs["Tangent"])
    return m
M_CASE = brushed("case", (0.20, 0.20, 0.215), 0.27, aniso=0.65)                      # dark titanium, brushed
M_BACK = brushed("back", (0.24, 0.24, 0.26), 0.30, aniso=0.5, grain=(60.0, 60.0, 1.0), tangent="Z")
M_GOLD = brushed("champagne", (0.88, 0.70, 0.42), 0.17, aniso=0.3, bump=0.012, vary=0.04)
M_STRAP = brushed("strap", (0.085, 0.085, 0.095), 0.30, aniso=0.6, grain=(1.0, 80.0, 80.0), bump=0.03, tangent="Y")   # dark coated steel links
M_STRAP_POL = brushed("strap_polished", (0.14, 0.14, 0.155), 0.12, aniso=0.0, bump=0.004, vary=0.03)                  # the polished centre of each link
M_PCB = material("pcb", (0.012, 0.02, 0.03), 0.0, 0.35)
M_CHIP = material("chip", (0.015, 0.015, 0.017), 0.0, 0.28)
M_PAD = material("pads", (0.9, 0.68, 0.28), 1.0, 0.25)
M_PASS = material("passive", (0.22, 0.17, 0.10), 0.0, 0.5)
M_FOIL = material("foil", (0.34, 0.35, 0.37), 1.0, 0.38)
M_LABEL = material("label", (0.03, 0.03, 0.035), 0.0, 0.5)
M_MOTOR = material("motor", (0.62, 0.62, 0.64), 1.0, 0.34)
M_LCD = material("lcd", (0.015, 0.016, 0.02), 0.0, 0.18)
M_FLEX = material("flex", (0.55, 0.30, 0.10), 0.0, 0.45)
M_INK = material("ink", (0.002, 0.002, 0.003), 0.0, 0.35)

def glass_material():
    m = bpy.data.materials.new("glass"); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    # real glass: the slab has thickness and refracts (IOR 1.52), with a faint smudge in its roughness. Shadow rays
    # pass straight through, so the parts under the crystal are still lit without caustics.
    out = nt.nodes.new("ShaderNodeOutputMaterial"); mix = nt.nodes.new("ShaderNodeMixShader")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); gl = nt.nodes.new("ShaderNodeBsdfGlass"); lp = nt.nodes.new("ShaderNodeLightPath")
    gl.inputs["IOR"].default_value = 1.52; gl.inputs["Color"].default_value = (0.985, 0.99, 1.0, 1)
    co = nt.nodes.new("ShaderNodeTexCoord"); sm = nt.nodes.new("ShaderNodeTexNoise"); sm.inputs["Scale"].default_value = 0.16; sm.inputs["Detail"].default_value = 4.0
    ramp = nt.nodes.new("ShaderNodeMath"); ramp.operation = "MULTIPLY_ADD"; ramp.inputs[1].default_value = 0.035; ramp.inputs[2].default_value = 0.0
    nt.links.new(co.outputs["Object"], sm.inputs["Vector"]); nt.links.new(sm.outputs["Fac"], ramp.inputs[0]); nt.links.new(ramp.outputs[0], gl.inputs["Roughness"])
    nt.links.new(lp.outputs["Is Shadow Ray"], mix.inputs[0]); nt.links.new(gl.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0]); return m
M_GLASS = glass_material()

def screen_material():
    m = bpy.data.materials.new("screen"); m.use_nodes = True; nt = m.node_tree; p = nt.nodes["Principled BSDF"]
    ta = nt.nodes.new("ShaderNodeTexImage"); tb = nt.nodes.new("ShaderNodeTexImage"); mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    ta.image = bpy.data.images.load(os.path.join(HERE, "tex/screen_dash.png")); tb.image = bpy.data.images.load(os.path.join(HERE, "tex/screen_call.png"))
    for t in (ta, tb): t.interpolation = "Cubic"; t.extension = "CLIP"; t.image.colorspace_settings.name = "sRGB"
    nt.links.new(ta.outputs[0], mx.inputs[6]); nt.links.new(tb.outputs[0], mx.inputs[7])
    setin(p, "Base Color", (0.0, 0.0, 0.0, 1)); setin(p, "Roughness", 0.2)
    nt.links.new(mx.outputs[2], p.inputs["Emission Color"])
    return m, mx, p
M_SCREEN, SCR_MIX, SCR_P = screen_material()

# ---------------------------------------------------------------- the watch (an original design)
root = bpy.data.objects.new("WATCH", None); scene.collection.objects.link(root); root.rotation_mode = "ZXY"
parts = {}
def add(name, ob, group):
    ob.parent = root; parts.setdefault(group, []).append(ob); return ob

CW, CH, CR = 40.0, 44.0, 10.5                    # case outer width, height, corner radius
Z_TOP = 9.6

# case back, with a ring window
back = prism("backplate", rrect(CW - 0.4, CH - 0.4, CR - 0.2), 0.0, 1.0, M_BACK, bevel=0.25)
ring = cyl("back_ring", 8.5, 0.18, (0, 0, 1.0), M_GOLD, bevel=0.05, seg=64); ring.parent = back
win = cyl("back_win", 6.6, 0.22, (0, 0, 1.02), M_INK, bevel=0.02, seg=64); win.parent = back
for i, (sx, sy) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
    s = cyl(f"screw{i}", 1.1, 0.35, (sx * 15.0, sy * 17.0, 1.05), M_PAD, bevel=0.05, seg=16); s.parent = back
add("backplate", back, "back")

# frame: the mid case with lugs and a button
frame = prism("frame", rrect(CW, CH, CR), 1.0, Z_TOP, M_CASE, inner=rrect(36.0, 40.0, 8.0), bevel=0.55, bevel_seg=4)
add("frame", frame, "frame")
for sgn in (1, -1):
    lug = box(f"lug{sgn}", (27.0, 7.0, 6.4), (0, sgn * 24.0, 5.4), M_CASE, bevel=1.2); lug.parent = frame
    pin = cyl(f"pin{sgn}", 0.9, 25.0, (0, sgn * 24.6, 5.4), M_GOLD, axis="X", seg=16); pin.parent = frame
btn = cyl("button", 1.9, 2.4, (20.8, 6.0, 5.6), M_GOLD, axis="X", bevel=0.3, seg=48); btn.parent = frame
btn2 = box("button_pad", (0.8, 9.0, 5.0), (19.6, 6.0, 5.6), M_CASE, bevel=0.3); btn2.parent = frame

# battery pouch
batt = prism("battery", rrect(31.0, 34.0, 2.5), 1.4, 4.7, M_FOIL, bevel=0.35)
lab = prism("battery_label", rrect(24.0, 20.0, 1.5), 4.7, 4.74, M_LABEL); lab.parent = batt
for k in (-1, 1):
    tab = box(f"tab{k}", (3.0, 2.4, 0.18), (k * 4.0, 18.8, 3.0), M_PAD); tab.parent = batt
add("battery", batt, "battery")

# main board: a dense two-sided-looking module — QFN microcontroller, flash, PMIC, drivers, inductor, RF can,
# traces, vias, test pads, silkscreen and ~60 passives
M_SILK = material("silk", (0.62, 0.62, 0.60), 0.0, 0.7)
M_SOLD = material("solder", (0.75, 0.76, 0.78), 1.0, 0.30)
M_RES = material("resistor", (0.02, 0.02, 0.025), 0.0, 0.4)
M_IND = material("inductor", (0.50, 0.30, 0.16), 1.0, 0.38)
pcb = prism("pcb", rrect(34.0, 38.0, 6.0), 5.0, 5.8, M_PCB, bevel=0.1)
def on_pcb(ob): ob.parent = pcb; return ob
ZT = 5.8
rnd = random.Random(7)
KEEPOUT = []                                   # (cx, cy, hx, hy) footprints so nothing overlaps
def reserve(cx, cy, hx, hy, pad=0.9): KEEPOUT.append((cx, cy, hx + pad, hy + pad))
def free(x, y, m=0.0):
    if (x + 8.0) ** 2 + (y + 9.5) ** 2 < 6.6 ** 2: return False            # the motor sits above this spot
    if abs(x) > 15.2 or abs(y) > 17.2: return False
    return all(not (abs(x - cx) < hx + m and abs(y - cy) < hy + m) for cx, cy, hx, hy in KEEPOUT)

# microcontroller: QFN package, die plate, pin-1 dot, leads on all four sides
MX, MY = 3.5, -4.5
mcu = on_pcb(box("mcu", (8.0, 8.0, 1.0), (MX, MY, ZT + 0.5), M_CHIP, bevel=0.14)); reserve(MX, MY, 4.9, 4.9)
plate = box("mcu_plate", (5.4, 5.4, 0.05), (MX, MY, ZT + 1.02), M_FOIL, bevel=0.03); plate.parent = mcu
for i in range(3):
    ln = box(f"mcu_mark{i}", (3.2 - i * 0.8, 0.22, 0.03), (MX + 0.2, MY - 0.3 + i * 0.8, ZT + 1.06), M_CHIP); ln.parent = mcu
dot = cyl("mcu_dot", 0.35, 0.04, (MX - 3.0, MY - 3.0, ZT + 1.03), M_PAD, seg=14); dot.parent = mcu
for side in range(4):
    for i in range(14):
        u = -3.25 + i * 0.5
        if side == 0: loc, sz = (MX + u, MY - 4.15, ZT + 0.07), (0.30, 0.8, 0.14)
        elif side == 1: loc, sz = (MX + u, MY + 4.15, ZT + 0.07), (0.30, 0.8, 0.14)
        elif side == 2: loc, sz = (MX - 4.15, MY + u, ZT + 0.07), (0.8, 0.30, 0.14)
        else: loc, sz = (MX + 4.15, MY + u, ZT + 0.07), (0.8, 0.30, 0.14)
        lead = box(f"mcu_lead{side}_{i}", sz, loc, M_PAD); lead.parent = mcu

def gull_ic(name, cx, cy, w, h, nper, axis="x", z=0.9):
    ic = on_pcb(box(name, (w, h, z), (cx, cy, ZT + z / 2), M_CHIP, bevel=0.1)); reserve(cx, cy, w / 2 + 0.7, h / 2 + 0.7, 0.4)
    top = box(name + "_mk", (w * 0.55, 0.18, 0.03), (cx, cy, ZT + z + 0.02), M_SILK); top.parent = ic
    for i in range(nper):
        u = (i - (nper - 1) / 2) * (w / nper if axis == "x" else h / nper) * 0.95
        for sg in (-1, 1):
            if axis == "x": loc, sz = (cx + u, cy + sg * (h / 2 + 0.3), ZT + 0.12), (0.30, 0.7, 0.2)
            else: loc, sz = (cx + sg * (w / 2 + 0.3), cy + u, ZT + 0.12), (0.7, 0.30, 0.2)
            lg = box(f"{name}_lg{i}_{sg}", sz, loc, M_SOLD); lg.parent = ic
    return ic
gull_ic("flash", -8.5, 8.0, 5.6, 4.2, 6, "x")
gull_ic("pmic", 9.5, 4.5, 4.4, 4.4, 5, "x", 0.8)
gull_ic("drv", 9.5, -10.5, 3.4, 3.0, 4, "x", 0.7)
hr = on_pcb(box("hr", (4.6, 4.6, 0.9), (-12.4, 1.8, ZT + 0.45), M_CHIP, bevel=0.1)); reserve(-12.4, 1.8, 2.4, 2.4)
for k, dx in enumerate((-1.0, 1.0)):
    led = cyl(f"hr_led{k}", 0.55, 0.05, (-12.4 + dx, 1.8, ZT + 0.93), material(f"led{k}", (0.05, 0.9, 0.2), 0, 0.25, Emission_Color=(0.05, 0.9, 0.2, 1), Emission_Strength=0.6), seg=18); led.parent = hr
ind = on_pcb(box("ind", (4.2, 4.2, 1.6), (14.0, -0.8, ZT + 0.8), M_IND, bevel=0.25)); reserve(14.0, -0.8, 2.1, 2.1)
xtal = on_pcb(box("xtal", (3.2, 2.5, 0.9), (-2.0, -13.8, ZT + 0.45), M_FOIL, bevel=0.1)); reserve(-2.0, -13.8, 1.6, 1.3)
conn = on_pcb(box("conn", (12.0, 2.4, 1.3), (0.0, 16.4, ZT + 0.65), M_CHIP, bevel=0.1)); reserve(0.0, 16.4, 6.0, 1.2, 0.3)
for i in range(18):
    p = box(f"conn_pin{i}", (0.3, 0.9, 0.12), (-5.1 + i * 0.6, 14.8, ZT + 0.07), M_PAD); p.parent = conn
latch = box("conn_latch", (11.4, 0.5, 0.35), (0.0, 17.35, ZT + 1.15), M_FOIL, bevel=0.06); latch.parent = conn
reserve(9.5, 12.0, 4.5, 3.5, 0.2)                                     # RF shield position (the can itself is added with the extras)
reserve(-9.0, 15.8, 6.0, 1.9, 0.0)                                    # antenna meander

# passives: tan caps, black resistors with silver ends
n_pass = 0
for i in range(400):
    if n_pass >= 62: break
    x, y = rnd.uniform(-15, 15), rnd.uniform(-17, 17)
    if not free(x, y, 0.5): continue
    horiz = rnd.random() < 0.5; sz = (1.0, 0.5, 0.4) if horiz else (0.5, 1.0, 0.4)
    if rnd.random() < 0.5:
        p = on_pcb(box(f"c{n_pass}", sz, (x, y, ZT + 0.2), M_PASS, bevel=0.04))
    else:
        p = on_pcb(box(f"r{n_pass}", sz, (x, y, ZT + 0.2), M_RES, bevel=0.04))
        for sg in (-1, 1):
            e = box(f"r{n_pass}_e{sg}", (0.18, 0.5, 0.42) if horiz else (0.5, 0.18, 0.42), (sg * 0.41 if horiz else 0, 0 if horiz else sg * 0.41, 0), M_SOLD)
            e.parent = p; e.location = (sg * 0.41, 0, 0) if horiz else (0, sg * 0.41, 0)
    KEEPOUT.append((x, y, 0.9, 0.9)); n_pass += 1

# traces: copper routed out of the microcontroller, 45-degree bends; one curve object, many splines
cu = bpy.data.curves.new("traces", "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = 0.05; cu.bevel_resolution = 1
def trace(pts):
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts): p.co = (x, y, ZT + 0.03, 1)
for i in range(14):
    for side in (0, 1, 2, 3):
        if i % 2 or rnd.random() < 0.35: continue
        u = -3.25 + i * 0.5
        if side == 0: x0, y0, dx, dy = MX + u, MY - 4.55, 0, -1
        elif side == 1: x0, y0, dx, dy = MX + u, MY + 4.55, 0, 1
        elif side == 2: x0, y0, dx, dy = MX - 4.55, MY + u, -1, 0
        else: x0, y0, dx, dy = MX + 4.55, MY + u, 1, 0
        L1 = rnd.uniform(1.5, 3.5); mx, my = x0 + dx * L1, y0 + dy * L1
        s1 = rnd.choice((-1, 1)); L2 = rnd.uniform(1.5, 4.5)
        ex, ey = mx + (dy != 0) * s1 * L2 + dx * 0.0, my + (dx != 0) * s1 * L2
        mid = (mx + (dy != 0) * s1 * L2 * 0.5 + dx * L2 * 0.5, my + (dx != 0) * s1 * L2 * 0.5 + dy * L2 * 0.5)
        pts = [(x0, y0), (mx, my), (mid[0] + (dx or 0) * 0.0 + (dy != 0) * s1 * L2 * 0.0, mid[1]), (ex, ey)]
        if all(abs(px) < 15.5 and abs(py) < 17.5 for px, py in pts): trace(pts)
tr = bpy.data.objects.new("traces", cu); scene.collection.objects.link(tr); tr.data.materials.append(M_PAD); on_pcb(tr)

# vias, test pads and silkscreen
for i in range(90):
    x, y = rnd.uniform(-15, 15), rnd.uniform(-17, 17)
    if not free(x, y, 0.2): continue
    v = cyl(f"via{i}", 0.26, 0.04, (x, y, ZT + 0.02), M_PAD, seg=10); v.parent = pcb
    vh = cyl(f"viah{i}", 0.11, 0.05, (x, y, ZT + 0.03), M_INK, seg=8); vh.parent = pcb
for i in range(8):
    t = box(f"tp{i}", (0.9, 0.9, 0.05), (-6.0 + i * 1.7, -16.6, ZT + 0.03), M_PAD); t.parent = pcb
for i in range(16):
    x, y = rnd.uniform(-14, 14), rnd.uniform(-16, 16)
    if free(x, y, 0.6):
        sl = box(f"silk{i}", (1.6 if i % 2 else 0.25, 0.25 if i % 2 else 1.4, 0.02), (x, y, ZT + 0.015), M_SILK); sl.parent = pcb
# BLE antenna: a gold meander
ant_pts = [(-14, 14.5)]
for i in range(7): ant_pts += [(-14 + i * 1.4, 17.0 if i % 2 == 0 else 14.5), (-13.3 + i * 1.4, 17.0 if i % 2 == 0 else 14.5)]
acu = bpy.data.curves.new("ant", "CURVE"); acu.dimensions = "3D"; acu.bevel_depth = 0.14; acu.bevel_resolution = 2
sp = acu.splines.new("POLY"); sp.points.add(len(ant_pts) - 1)
for p, (x, y) in zip(sp.points, ant_pts): p.co = (x, y, ZT + 0.04, 1)
antob = bpy.data.objects.new("antenna", acu); scene.collection.objects.link(antob); antob.data.materials.append(M_PAD); on_pcb(antob)
add("pcb", pcb, "pcb")

# vibration motor: the part that buzzes on the wrist
motor = cyl("motor", 5.0, 2.3, (-8.0, -9.5, 7.0), M_MOTOR, bevel=0.2, seg=48)
cap = cyl("motor_cap", 2.0, 0.08, (-8.0, -9.5, 8.18), M_CHIP, seg=32); cap.parent = motor
for i, c in enumerate(((0.9, 0.6, 0.1), (0.1, 0.1, 0.1))):
    wire = box(f"wire{i}", (0.5, 6.5, 0.4), (-8.0 + (i - 0.5) * 1.6, -14.5, 6.3), material(f"wire{i}", c, 0, 0.5)); wire.parent = motor
add("motor", motor, "motor")

# display module: panel, active area (the screen), flex cable
lcd = prism("lcd", rrect(35.2, 37.6, 4.0), 8.1, 9.2, M_LCD, bevel=0.18)
scr_bm = bmesh.new(); bmesh.ops.create_grid(scr_bm, x_segments=1, y_segments=1, size=15.5)
screen = to_obj("screen", scr_bm, M_SCREEN, smooth=False); screen.location = (0, 0.0, 9.215); screen.parent = lcd
sc_me = screen.data; uv = sc_me.uv_layers.new(name="UV") if not sc_me.uv_layers else sc_me.uv_layers[0]
for l in sc_me.loops:
    v = sc_me.vertices[l.vertex_index].co; uv.data[l.index].uv = (v.x / 31.0 + 0.5, v.y / 31.0 + 0.5)
fx = [((0, -19.2, 8.6), 5.0, 0.0), ((0, -22.0, 7.0), 4.4, 55.0), ((0, -21.2, 4.3), 5.2, 100.0)]
for i, (loc, ln, ang) in enumerate(fx):
    seg = box(f"flex{i}", (9.0, 0.14, ln), loc, M_FLEX)
    seg.rotation_euler = (math.radians(ang) * 0.0, 0, 0); seg.parent = lcd
lcd_flex_tail = box("flex_tail", (9.0, 4.0, 0.14), (0, -21.6, 3.2), M_FLEX); lcd_flex_tail.parent = lcd
add("display", lcd, "display")

# cover glass with its black ink border
gl = prism("glass", rrect(CW - 0.3, CH - 0.3, CR - 0.15), Z_TOP, Z_TOP + 1.25, M_GLASS, bevel=0.35)
inkring = prism("ink", rrect(CW - 1.2, CH - 1.2, CR - 0.6), Z_TOP + 0.02, Z_TOP + 0.06, M_INK, inner=rrect(31.6, 31.6, 3.0)); inkring.parent = gl
add("glass", gl, "glass")


# extra components so the exploded view has real depth
shield = box("shield", (9.0, 7.0, 1.0), (9.5, 12.0, 6.3), M_FOIL, bevel=0.12); shield.parent = pcb
for i in range(5):
    for j in range(3):
        dd = cyl(f"shield_h{i}_{j}", 0.3, 0.03, (9.5 - 3.2 + i * 1.6, 12.0 - 2.0 + j * 2.0, 6.81), M_INK, seg=10); dd.parent = shield
chassis = prism("chassis", rrect(35.6, 39.6, 7.8), 4.7, 5.0, M_CASE, inner=rrect(31.5, 35.0, 5.5), bevel=0.12); add("chassis", chassis, "pcb")
touch = prism("touch", rrect(34.8, 37.2, 3.8), 9.30, 9.38, M_GLASS, bevel=0.03); add("touch", touch, "display")
gasket = prism("gasket", rrect(CW - 1.0, CH - 1.0, CR - 0.5), 9.40, 9.58, M_INK, inner=rrect(34.0, 38.0, 6.0)); add("gasket", gasket, "glass")
for i, sx in enumerate((-5.0, 5.0)):
    p = cyl(f"pogo{i}", 1.0, 1.4, (sx, 15.0, -0.5), M_PAD, bevel=0.08, seg=20); add(f"pogo{i}", p, "back")
for i, (sx, sy) in enumerate(((1, 1), (-1, -1))):
    sc = cyl(f"screw_b{i}", 1.0, 0.5, (sx * 13.5, sy * 15.5, 6.05), M_PAD, bevel=0.06, seg=16); sc.parent = pcb

# segmented straps: a chain of rounded links on pins, curling back over the wrist
def centre(s, y0, direction, length):
    return (direction * (y0 + length * s), 5.4 - (max(0.0, s - 0.35) ** 1.7) * 26.0)
def segmented(prefix, y0, direction, length, n, holes, group):
    for i in range(n):
        p0 = centre(i / n, y0, direction, length); p1 = centre((i + 1) / n, y0, direction, length)
        dy, dz = p1[0] - p0[0], p1[1] - p0[1]; ln = math.hypot(dy, dz)
        ob = box(f"{prefix}{i}", (19.6, ln - 0.5, 2.3), (0, 0, 0), M_STRAP, bevel=0.55)
        ob.location = (0, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); ob.rotation_euler = (math.atan2(dz, dy), 0, 0)
        ob["seg"] = i; add(f"{prefix}{i}", ob, group)
        # link detail (children of the link, so they ride its animation): a polished centre piece between two shut lines
        inl = box(f"{prefix}{i}_in", (7.4, ln - 1.5, 0.16), (0, 0, 1.19), M_STRAP_POL, bevel=0.07); inl.parent = ob
        for sg in (-1, 1):
            gr = box(f"{prefix}{i}_gr{sg}", (0.2, ln - 1.0, 0.05), (sg * 4.5, 0, 1.155), M_INK); gr.parent = ob
        if holes and i >= 2:
            h = cyl(f"hole{prefix}{i}", 1.3, 0.06, (0, 0, 1.18), M_INK, seg=20); h.parent = ob
        pin = cyl(f"pin_{prefix}{i}", 0.75, 20.6, (0, 0, 0), M_GOLD, axis="X", seg=14)
        pin.location = (0, p0[0], p0[1]); pin["seg"] = i; add(f"pin_{prefix}{i}", pin, group)
        for sg in (-1, 1):                                              # pin heads, with a screwdriver slot
            cp = cyl(f"cap_{prefix}{i}_{sg}", 1.0, 0.5, (sg * 10.35, 0, 0), M_GOLD, axis="X", bevel=0.12, seg=24); cp.parent = pin
            sl = box(f"slot_{prefix}{i}_{sg}", (0.06, 1.5, 0.22), (sg * 10.6, 0, 0), M_INK); sl.parent = pin
segmented("sTop", 25.0, 1, 48.0, 9, False, "strap_top")
segmented("sBot", 25.0, -1, 66.0, 12, True, "strap_bot")
kp = centre(0.85, 25.0, 1, 48.0)
keep = box("keeper", (21.0, 5.0, 3.2), (0, 0, 0), M_STRAP, bevel=0.6); keep.location = (0, kp[0], kp[1]); keep["seg"] = 8; add("keeper", keep, "strap_top")
buckle = box("buckle", (22.5, 1.4, 2.2), (0, 0, 0), M_GOLD, bevel=0.35); buckle.location = (0, 25.0 + 8.0, 5.4 + 1.6); buckle["seg"] = 1; add("buckle", buckle, "strap_top")

# ---------------------------------------------------------------- stage: floor and lights
def strip(name, size, loc, aim, color, strength):
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=(size[0] * 2, size[1] * 2, 1), verts=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); ob.location = loc
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    em = nt.nodes.new("ShaderNodeEmission"); o = nt.nodes.new("ShaderNodeOutputMaterial")
    em.inputs["Color"].default_value = (*color, 1); em.inputs["Strength"].default_value = strength; nt.links.new(em.outputs[0], o.inputs[0])
    ob.data.materials.append(m)
    d = Vector(aim) - Vector(loc); ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    ob.visible_camera = False
    return ob
strip("rim_left", (60, 330), (-300, 190, 90), (0, 0, 0), (0.82, 0.9, 1.0), 22.0)
strip("rim_right", (45, 330), (310, 150, 30), (0, 0, 0), (1.0, 0.86, 0.66), 20.0)
strip("top_soft", (260, 160), (0, -60, 330), (0, 0, 0), (1.0, 1.0, 1.0), 4.5)
strip("kick_low", (200, 40), (0, 260, -60), (0, 0, 0), (0.9, 0.95, 1.0), 6.0)
ff = strip("front_fill", (360, 220), (0, -520, -20), (0, 0, 0), (1.0, 1.0, 1.0), 0.7); ff.visible_glossy = False; ff.visible_transmission = False   # fill only: no veil in the crystal

# ---------------------------------------------------------------- camera
target = bpy.data.objects.new("target", None); scene.collection.objects.link(target)
cam_d = bpy.data.cameras.new("cam"); cam_d.lens = 85; cam_d.sensor_width = 36; cam_d.sensor_fit = "HORIZONTAL"; cam_d.dof.use_dof = True
cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam); scene.camera = cam
tc = cam.constraints.new("TRACK_TO"); tc.target = target; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"

# ---------------------------------------------------------------- the timeline
import re
def clamp(x): return max(0.0, min(1.0, x))
def smoother(x): x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10)
def mixf(a, b, k): return a + (b - a) * k

# which objects fly: every registered part, plus named children (screws, chips, passives, pins...)
groups_of = {}
for g, objs in parts.items():
    for o in objs: groups_of[o] = g
def group_of(o):
    while o is not None and o not in groups_of: o = o.parent
    return groups_of.get(o)
FLY = re.compile(r"^(screw\d|screw_b\d|pin-?1|button|button_pad|c\d+|r\d+|mcu|flash|pmic|drv|hr|ind|xtal|sensor|conn|shield)$")
flyers = []
for o in list(bpy.data.objects):
    if o.type not in ("MESH", "CURVE"): continue
    if o.name in ("floor",) or o.name.startswith(("rim_", "top_soft", "kick_", "front_fill")): continue
    top = o in groups_of
    if not top and not FLY.match(o.name): continue
    g = group_of(o)
    if g is None: continue
    o.parent = root; o.matrix_parent_inverse.identity()
    flyers.append((o, g))
GSTART = {"back": 0.05, "chassis": 0.08, "battery": 0.09, "pcb": 0.13, "motor": 0.15, "display": 0.21, "glass": 0.29, "frame": 0.11, "strap_top": 0.33, "strap_bot": 0.36}
ZB = {"back": -40, "battery": -26, "pcb": -16, "motor": -10, "display": 16, "glass": 36, "frame": 4, "strap_top": 0, "strap_bot": 0}
rnd = random.Random(11)
SPREAD = {"wide": 1.0, "tall": 0.7}[SET]
info = []
for o, g in flyers:
    s0 = GSTART.get(g, 0.2) + rnd.uniform(-0.035, 0.05) + (0.011 * o.get("seg", 0) if g.startswith("strap") else 0.0)
    d = min(rnd.uniform(0.17, 0.30), 0.62 - s0); d = max(d, 0.12)
    v = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 0.8))).normalized()
    off = v * rnd.uniform(55, 175) * SPREAD + Vector((0, 0, ZB.get(g, 0)))
    if g.startswith("strap"): off += Vector((0, 30 if g == "strap_top" else -30, 0))
    rot0 = tuple(rnd.choice((-1, 1)) * rnd.uniform(0.5, 3.0) for _ in range(3))
    info.append((o, Vector(o.location), tuple(o.rotation_euler), s0, d, off, rot0))
print("flying parts:", len(info), flush=True)

# camera path: macro drift through the cloud, pull back to reveal, orbit, then face-on for the call
KEYS = [(0.00, 125, -10, -40, 1.6), (0.20, 100, 7, -14, 1.8), (0.40, 170, 16, 14, 3.2), (0.58, 300, 24, 32, 6.0),
        (0.72, 330, 10, -14, 9.0), (0.88, 250, 3, -3, 12.0), (1.00, 238, 0, 0, 12.0)]
CS = {"wide": 1.0, "tall": 0.56}[SET]
ZOOM = float(arg("--zoom", "2.2"))
def camera_at(t):
    for (ta, *a), (tb, *b) in zip(KEYS, KEYS[1:]):
        if t <= tb:
            k = clamp((t - ta) / (tb - ta)); k = 0.55 * k + 0.45 * smoother(k)
            return [mixf(x, y, k) for x, y in zip(a, b)]
    return list(KEYS[-1][1:])

def root_pose(t):
    rx0, rz0 = math.radians(58), math.radians(-26)
    spin = smoother((t - 0.60) / 0.26)
    rx = mixf(rx0 + math.radians(8) * smoother(t / 0.6), math.radians(90), spin)
    rz = mixf(rz0 * (1 - 0.55 * smoother(t / 0.6)) + math.radians(40) * (1 - smoother(t / 0.5)), 0.0, spin)
    ry = math.radians(-5) * (1 - spin) * math.sin(t * 3.0)
    buzz = max(0.0, 1 - (t - 0.915) / 0.06) if t >= 0.915 else 0.0
    sh = math.sin(t * 900.0) * buzz
    return (rx + math.radians(0.7) * sh, ry, rz + math.radians(0.9) * sh)

def key(ob, frame, loc=None, rot=None):
    if loc is not None: ob.location = loc; ob.keyframe_insert("location", frame=frame)
    if rot is not None: ob.rotation_euler = rot; ob.keyframe_insert("rotation_euler", frame=frame)

N0 = N - REST
rimL = bpy.data.objects["rim_left"]; rim_home = Vector(rimL.location)
for f in range(N):
    t = min(f / (N0 - 1), 1.0); r = clamp((f - (N0 - 1)) / REST) if REST else 0.0
    for o, home, hrot, s0, d, off, rot0 in info:
        k = smoother((t - s0) / d)
        loc = home + off * (1 - k)
        rot = tuple(hrot[i] + rot0[i] * (1 - k) ** 1.5 for i in range(3))
        o.rotation_mode = "XYZ"; key(o, f, loc, rot)
    rp = list(root_pose(t))
    ease = smoother(r)
    rp[0] += math.radians(1.1) * math.sin(r * math.pi * 1.2) * ease          # the watch floats a touch
    rp[1] += math.radians(2.2) * math.sin(r * math.pi * 1.0) * ease
    rp[2] += math.radians(1.6) * math.sin(r * math.pi * 1.6 + 0.4) * ease
    key(root, f, (0, 0, 0), tuple(rp))
    dist, ez, yawd, fst = camera_at(t); dist *= CS * ZOOM * (1 - 0.045 * ease)           # slow push-in
    yaw = math.radians(yawd + 2.6 * math.sin(r * math.pi * 0.9) * ease)                 # drift sideways, then settle
    cam.location = (dist * math.sin(yaw), -dist * math.cos(yaw), ez * CS + 2.0 * ease); cam.keyframe_insert("location", frame=f)
    cam_d.dof.focus_object = target; cam_d.dof.aperture_fstop = fst; cam_d.dof.keyframe_insert("aperture_fstop", frame=f)
    target.location = (0, 0, 0); target.keyframe_insert("location", frame=f)
    rimL.location = rim_home + Vector((0, 0, -90)) * smoother(r) + Vector((90, 0, 0)) * smoother(r); rimL.keyframe_insert("location", frame=f)   # glint slides across the case
    power = smoother((t - 0.84) / 0.04); call = smoother((t - 0.925) / 0.025)
    SCR_MIX.inputs[0].default_value = call; SCR_MIX.inputs[0].keyframe_insert("default_value", frame=f)
    SCR_P.inputs["Emission Strength"].default_value = 4.4 * power; SCR_P.inputs["Emission Strength"].keyframe_insert("default_value", frame=f)

# ---------------------------------------------------------------- render
os.makedirs(OUT, exist_ok=True)
frames = ONLY or list(range(N))
for f in frames:
    if SKIP and os.path.exists(os.path.join(OUT, f"f_{f:04d}.png")): continue
    scene.frame_set(f)
    scene.render.filepath = os.path.join(OUT, f"f_{f:04d}.png")
    bpy.ops.render.render(write_still=True)
    print("frame", f, "done", flush=True)
