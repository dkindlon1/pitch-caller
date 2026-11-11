# Runway exports for the public site

Put the files exactly as named below in this folder (`web/public/media/runway/`). Nothing on the site loads them yet:
each one gets wired in once the file is here and looks right. The site works without any of them.

House rules for every asset: black and white only (the site adds its one red itself), no text, no logos, no team
uniforms or colors, no faces, no MLB or real-team look. Shot at night under stadium lights, with soft haze.

## 1. Pitcher at release (`pitcher-release.png`, plus `pitcher-release@2x.png`)

Where: the hero and the at-bat chapter. Today the ball leaves from an empty mound; a backlit pitcher at the release
point fixes that. It's drawn as a flat card standing on the 3D mound, blended so black disappears.

- Type: still image, 3:4, at least 1536 x 2048, pure black background.
- Prompt: *A right-handed baseball pitcher at the instant of release, seen from directly behind home plate at a
  catcher's eye level, about sixty feet away. Full body, three-quarter arm slot, throwing arm extended toward the
  camera, glove arm tucked, front leg planted. He is a near-black silhouette with a thin bright rim light from stadium
  light towers behind him and to the left. Pure black background, faint haze around the rim light, no ground visible
  below the ankles. Plain dark uniform with no numbers, letters, logos or stripes; cap pulled low so no face is
  visible. Monochrome, high contrast, photographic, sharp edges.*
- Camera: locked off, straight on, no tilt.

## 2. Light-tower haze loop (`haze-loop.mp4`, `haze-loop.webm`, `haze-loop.jpg`)

Where: behind the glass panels in "Questions from coaches" and "Talk to us", in place of the drawn pitch trails.

- Type: video, 16:9, 1920 x 1080, 8 seconds, seamless loop, no audio. Export H.264 MP4 and VP9 WebM, each under 2.5 MB;
  `haze-loop.jpg` is its first frame, used under reduced motion and while the video loads.
- Prompt: *Out-of-focus banks of stadium lights at night, seen from low on the field looking up, drifting very slowly
  left to right through thin haze. Large soft circular light blooms on a pure black sky, lower third fading to black.
  Monochrome, very dark overall, subtle film grain, calm and slow. No people, no field, no text.*
- Camera: a slow continuous pan, roughly 3 degrees across the clip, so the loop point is invisible.

## 3. Leather and seam macro (`seam-macro.jpg`)

Where: the at-bat chapter's ending, as a slow-moving backdrop behind "Strikeout swinging."

- Type: still image, 21:9, at least 3360 x 1440.
- Prompt: *Extreme macro of a new baseball: white leather grain filling the frame, one red double-stitched seam curving
  across the right third, raking light from the top left so every stitch casts a small shadow. Shallow depth of field,
  the left side falling softly out of focus into near-black. Photographic, crisp, high detail. No logos, no printing,
  no text.*
- Note: this is the one asset that carries red, and only in the stitching.
