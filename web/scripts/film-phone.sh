#!/usr/bin/env bash
# Cut the phone footage for "Inside the call": the same push and pull clips as the full frames (scripts/film-frames.sh
# with FILM_W=1920), but only the 720 px strip around the iPad that a phone ever shows, at full resolution.
#   scripts/film-phone.sh <out_dir of scripts/screen-composite.py>
# writes public/media/film/inside/{push,pull}-phone/0001.webp ... The strip (x 627, 720 wide) is centred on the iPad's
# screen at the held frame (content/inside-track.ts SCREEN[hold]); InsideCall.tsx FOOT_CROP must match it.
set -euo pipefail
src="$1"
here="$(cd "$(dirname "$0")/.." && pwd)"
grade="eq=saturation=0.86:brightness=-0.025:contrast=1.04"   # the same night grade as film-frames.sh
for clip in push pull; do
  out="$here/public/media/film/inside/$clip-phone"
  rm -rf "$out"; mkdir -p "$out"
  ffmpeg -v error -y -i "$src/$clip.mp4" -vf "fps=24,crop=720:1080:627:0,$grade" -c:v libwebp -quality 64 -compression_level 6 "$out/%04d.webp"
  echo "inside/$clip-phone: $(ls "$out" | wc -l) frames, $(du -sh "$out" | cut -f1)"
done
