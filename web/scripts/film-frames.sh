#!/usr/bin/env bash
# Cut a Runway clip into the stills ScrollFilm plays as you scroll.
#   scripts/film-frames.sh <clip.mp4> <name> <wide|tall> [fps]
# writes public/media/film/<name>/<wide|tall>/0001.webp ... and prints the frame count to pass to <ScrollFilm>.
# Wide frames are up to 1600 px across (never upscaled). Tall frames are for phones: a 9:16 clip if you have one, or
# the middle of a 16:9 clip cut to 9:16 (pass "crop" as the 5th argument). 12 frames a second is smooth at scroll speed.
# A light night grade is applied to both: a little less saturation, a little darker.
set -euo pipefail
clip="$1"; name="$2"; kind="$3"; fps="${4:-12}"; crop="${5:-}"
here="$(cd "$(dirname "$0")/.." && pwd)"
out="$here/public/media/film/$name/$kind"
rm -rf "$out"; mkdir -p "$out"
grade="eq=saturation=0.86:brightness=-0.025:contrast=1.04"
if [ "$kind" = tall ]; then
  if [ "$crop" = crop ]; then scale="crop=ih*9/16:ih,scale='min(900,iw)':-2"; else scale="scale='min(900,iw)':-2"; fi
else scale="scale='min(1600,iw)':-2"; fi
ffmpeg -v error -y -i "$clip" -vf "fps=$fps,$scale,$grade" -c:v libwebp -quality 64 -compression_level 6 "$out/%04d.webp"
ffmpeg -v error -y -i "$out/0001.webp" -q:v 3 "$here/public/media/film/$name/$kind-poster.jpg"
n=$(ls "$out" | wc -l); size=$(du -sh "$out" | cut -f1)
echo "$name/$kind: $n frames, $size"
