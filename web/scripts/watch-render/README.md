# Watch film (the site's opening)

`build_watch.py` builds an original smartwatch in Blender (5.x, Cycles) that assembles from ~140 parts, turns face-on and
shows the call. `make_screens.py` draws the screen textures (the PitchIQ watch face; "FASTBALL / OUTSIDE" for the call).
`encode.py` turns the rendered frames into the files the site loads and checks them.

    pip install numpy pillow                 # for make_screens.py and encode.py
    python make_screens.py                   # writes tex/*.png next to the script
    blender -b -P build_watch.py -- --set wide --out frames/wide --frames 150 --samples 768    # 1920x1200
    blender -b -P build_watch.py -- --set tall --out frames/tall --frames 150 --samples 768    # 1080x1680
    blender -b -P build_watch.py -- --set wide --out frames/cut-wide --frames 150 --samples 768 --only 149 --alpha
    blender -b -P build_watch.py -- --set tall --out frames/cut-tall --frames 150 --samples 768 --only 149 --alpha
    python encode.py --quality 84            # writes public/media/film/watch/...

About 6 to 7 s a frame on an RTX 5070 Ti (OptiX); `--device CPU` works and is far slower. `--skip-existing` resumes a
stopped render. `--frames 72 --only 0,14,28` renders single moments of the older 72-frame timing for comparisons.
The timeline (every keyframe, the camera path) is unchanged from the first film; the v2 pass changed light, materials,
strap detail, resolution and frame count only. `python -m pip install bpy` also runs the script where the module loads.

The HDRIs in `hdri/` are from Poly Haven (CC0). `fonts/Inter-Bold.ttf` is Inter (SIL Open Font License).
The watch is an illustration on a generic body, not PitchIQ hardware.
