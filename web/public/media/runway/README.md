# Runway exports for the public site

Status (Nov 11): Drew made the first set in Runway (Seedream 5.5 stills, one Gen-4.5 clip) and these are live:
- `pitcher-release.webp`: option 2 of 4 (arm cocked, striding), cut out with rembg (isnet-general-use), the ball
  erased from his hand. He stands on the mound in the at-bat chapter only (the hero's framing puts the mound off screen).
- `haze-loop.mp4/.webm/.jpg`: the Gen-4.5 clip, crossfaded into an 8.5 s loop, behind "Talk to us".
- `seam-1.webp`: option 1 of 4, graded dark behind "Between pitches", scrubbed slowly with the scroll.

Not used: pitcher options 1, 3 and 4 (option 3's matte fused the light tower to his hand), seam options 2 to 4. A sharper
3:4 pitcher at true release on pure black (prompt below) would still be an upgrade; the current one is 1024 px square
with stadium and towers baked in.

- `../film/flyover/` (Nov 11, second batch): the Gen-4.5 night flyover, regenerated with a flat mound, cut by
  `scripts/film-frames.sh` into 121 graded frames (wide 3.9 MB, phone 9:16 crop 1.4 MB). It is the hero, playing as you
  scroll. A true 9:16 version would look better on phones than the crop.

The site works without any of these files.

Models (Runway's menu, Nov 2026): stills with **Gen-4 Image**, fixed up with **Nano Banana 2** (or GPT-Image-1.5 for
the seam macro); video with **Gen-4.5 Image to Video**, which makes 720p clips of 2 to 10 seconds, so upscale in Runway
before exporting. Send the raw downloads: the loop crossfade, WebM/MP4 encodes and first-frame JPGs are done here.

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
- Make it in two steps: a 16:9 still from the prompt above (Gen-4 Image), then Gen-4.5 Image to Video, 10 seconds,
  with only the motion: *Very slow continuous camera pan left to right, about three degrees across the whole clip. The
  haze drifts gently through the light blooms. The lights stay steady with no flicker. Calm and slow, no cuts, no zoom.*
- The loop point is hidden here with a crossfade; Gen-4.5 does not make seamless loops.

## 3. Leather and seam macro (`seam-macro.jpg`)

Where: the at-bat chapter's ending, as a slow-moving backdrop behind "Strikeout swinging."

- Type: still image, 21:9, at least 3360 x 1440.
- Prompt: *Extreme macro of a new baseball: white leather grain filling the frame, one red double-stitched seam curving
  across the right third, raking light from the top left so every stitch casts a small shadow. Shallow depth of field,
  the left side falling softly out of focus into near-black. Photographic, crisp, high detail. No logos, no printing,
  no text.*
- Note: this is the one asset that carries red, and only in the stitching.

## 4. Spinning seam, scrubbed by scroll (`seam-spin.mp4`), optional

Where: between "Between pitches" and the at-bat. Scrolling turns the ball, frame by frame. Video scrubbed by scroll is
the most common pattern in web-design Reels this fall (an AI-made product shot, turned into frames that follow the
scroll); this is PitchIQ's version of it.

- Make it from asset 3: Gen-4.5 Image to Video, 16:9, 10 seconds, with `seam-macro.jpg` (or a 16:9 crop of it) as the
  first frame, then upscale.
- Motion prompt: *The baseball rotates slowly and steadily toward the camera on its axis, as if spinning out of a
  pitcher's hand in extreme slow motion. The red seam travels smoothly across the frame. Camera locked off, the light
  stays fixed, no cuts, no zoom.*
- Check the seam frame by frame: video models often bend or duplicate stitches. If it warps, skip this one.
