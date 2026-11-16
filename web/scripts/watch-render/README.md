# Watch film (the site's opening)

`build_watch.py` builds an original smartwatch in Blender (bpy 5.x, Cycles) that assembles from ~140 parts, turns face-on and
shows the call. `make_screens.py` draws the screen textures (the PitchIQ watch face; "FASTBALL / OUTSIDE" for the call).

    pip install bpy numpy pillow            # Python 3.13
    python make_screens.py                  # writes tex/*.png next to the script
    python build_watch.py --set wide --out frames/wide --scale 0.8 --samples 16 --frames 72    # 1280x800
    python build_watch.py --set tall --out frames/tall --scale 0.8 --samples 16 --frames 72    # 720x1120

Then encode each PNG to `public/media/film/watch/{wide,tall}/0001.webp ...` (quality 82) and the last frame to
`poster.jpg` / `tall-poster.jpg`. About 30 to 60 s a frame on two CPU cores; Blender on a GPU is much faster.
The watch is an illustration on a generic body, not PitchIQ hardware.
