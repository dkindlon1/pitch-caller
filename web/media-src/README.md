# Source media (not served)

Originals the site's processed frames are cut from. Kept here so a re-capture never has to work from finished frames.

- `inside/push.mp4`: the "Inside the call" dugout push-in. Runway session "Night Dugout Coach iPad", the second (favorited)
  Kling 4.0 output, 1920x1080, 24 fps, 121 frames. Rebuild the footage with:
  `python3 scripts/screen-composite.py media-src/inside/push.mp4 <out> 25`, then
  `FILM_W=1920 scripts/film-frames.sh <out>/push.mp4 inside push 24` (and `pull`), then `scripts/film-phone.sh <out>`.
