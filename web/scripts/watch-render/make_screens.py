# The watch's three screen states, drawn to match watch/bangle/pitchiq.app.js: black on white, the link dot top right,
# the sign filling the space above the words, "—" as a short bar. 176 x 176 screen, drawn at 4x.
import os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE); os.makedirs("tex", exist_ok=True)
S = 12; W = 176 * S                      # v2 re-render: 2112 px, so the words stay crisp in the 1920-wide close-ups
F = os.path.join(HERE, "fonts", "Inter-Bold.ttf")   # Inter Bold (SIL OFL), from Fontsource
def base():
    im = Image.new("RGB", (W, W), "#ffffff"); d = ImageDraw.Draw(im)
    d.ellipse([W - 15*S, 5*S, W - 5*S, 15*S], fill="#00ee00")   # link up: green dot (pqDraw: fillCircle(W-10, 10, 5))
    return im, d
def centered(d, text, cy, size, fill="#000000"):
    f = ImageFont.truetype(F, size); l, t, r, b = d.textbbox((0, 0), text, font=f)
    d.text(((W - (r - l)) / 2 - l, cy - (b - t) / 2 - t), text, font=f, fill=fill)
# no call: the short bar
im, d = base(); d.rectangle([W/2 - 30*S, W/2 - 4*S, W/2 + 30*S, W/2 + 4*S], fill="#000000"); im.save("tex/screen_dash.png")
# a call: slider (sign 3), down and away -> LOW AND / OUTSIDE
im, d = base()
centered(d, "3", 62 * S, 112 * S)
centered(d, "LOW AND", 132 * S, 27 * S)
centered(d, "OUTSIDE", 160 * S, 27 * S)
im.save("tex/screen_call.png")
# no link (not used in the film, kept for the site)
im, d = base(); d.ellipse([W - 15*S, 5*S, W - 5*S, 15*S], fill="#ff0000")
centered(d, "NO LINK", 70 * S, 40 * S, "#ff0000"); centered(d, "Coach gives the sign", 118 * S, 15 * S); im.save("tex/screen_nolink.png")
print("ok")
# marketing call: pitch name and location in words
im, d = base()
def fit(text, cy, maxw):
    size = 60 * S
    while True:
        f = ImageFont.truetype(F, size); l, t, r, b = d.textbbox((0, 0), text, font=f)
        if r - l <= maxw or size < 10: break
        size -= 1
    centered(d, text, cy, size)
fit("FASTBALL", 66 * S, 150 * S)
d.rectangle([W/2 - 26*S, 96*S, W/2 + 26*S, 99*S], fill="#000000")
fit("OUTSIDE", 128 * S, 150 * S)
im.save("tex/screen_call.png"); print("call2 ok")
