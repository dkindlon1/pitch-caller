# Source media (not served)

The Runway originals the site's processed frames and images are cut from, so a re-capture never has to work from
finished frames. All were made in Drew's Runway account (Nov 11) and matched here to what the site serves (Nov 15).

| File | Runway session, output | Site asset it makes | How it was matched |
|---|---|---|---|
| `inside/push.mp4` | "Night Dugout Coach iPad", second (favorited) Kling 4.0 output, 1920x1080, 121 frames | `public/media/film/inside/{push,pull}{,-phone}/` | Tracker reproduces `content/inside-track.ts` exactly |
| `flyover/flyover.mp4` | "Empty Stadium Night Aerial" (newer), Gen-4.5, 1280x720, 241 frames | `public/media/film/flyover/` (every 2nd frame, 121) | Site frames 1 / 61 / 121 = clip frames 0 / 120 / 240 (corr ≥ 0.996) |
| `atbat/catcher-delivery.mp4` | "Night Baseball Stadium Pitcher Shot", Kling 4.0, 1080p, 5 s | `public/media/film/atbat/catcher/` (clip frames 48-120) | Site frame 1 = clip frame 47 (corr 1.00) |
| `atbat/catcher-still.png` | same session, Seedream 5.5 (2816x1584) | the delivery's first frame | = clip frame 0 |
| `atbat/side.png`, `atbat/over.png` | same session, Seedream 5.5 (2816x1584) | `public/media/film/atbat/side.webp`, `over.webp` | corr 1.00 each |
| `runway/haze.mp4` | "Night Sky Stadium Bokeh", Gen-4.5, 1280x720, 10 s | `public/media/runway/haze-loop.{mp4,webm,jpg}` (crossfaded loop) | `haze-loop.jpg` = clip frame 36 |
| `runway/haze-still.jpeg` | same session, Seedream 5.5 | the haze clip's first frame | = clip frame 0 |
| `runway/seam-1.png` | "Baseball Leather Macro Study", Seedream 5.5 option 1 (1424x800) | `public/media/runway/seam-1.webp` | corr 1.00 |
| `runway/pitcher-2.jpeg` | "Pitcher Silhouette Monochrome Portrait", Seedream 5.5 option 2 (1024x1024) | `public/media/runway/pitcher-release.webp` (rembg cutout) | masked match 0.998 at scale 1, offset (326, 80) |

Rebuild the dugout footage with:
`python3 scripts/screen-composite.py media-src/inside/push.mp4 <out> 25`, then
`FILM_W=1920 scripts/film-frames.sh <out>/push.mp4 inside push 24` (and `pull`), then `scripts/film-phone.sh <out>`.
Other frame sets: `scripts/film-frames.sh <clip> <name> <wide|tall> [fps]` (see `public/media/runway/README.md`).
