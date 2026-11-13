# The 3D scene's copies of the app's zone panel (render/assets/), made from the site's 6x captures: everything outside
# the dashed chase band (bits of the app's neighbouring labels and panels) is faded into the panel's own background, so
# nothing stray floats beside the zone on the stage. The site's crisp layer keeps the untouched captures.
#   python3 scripts/zone-3d-textures.py
from PIL import Image, ImageDraw, ImageFilter
import os
here = os.path.dirname(os.path.abspath(__file__)); web = os.path.dirname(here)
for name in ("app-zone-before.png", "app-zone-after.png"):
    im = Image.open(os.path.join(web, "public/marketing", name)).convert("RGBA")
    W, H = im.size
    bg = Image.new("RGBA", im.size, im.getpixel((W // 2, 60)))           # the panel's background, above the zone
    keep = Image.new("L", im.size, 0)
    ImageDraw.Draw(keep).rounded_rectangle((132, 124, W - 122, H - 128), radius=60, fill=255)   # the chase band, with room
    keep = keep.filter(ImageFilter.GaussianBlur(14))
    Image.composite(im, bg, keep).save(os.path.join(web, "render/assets", name))
    print(name, im.size, im.getpixel((W // 2, 60)))
