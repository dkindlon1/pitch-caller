#!/usr/bin/env bash
# Cut a Runway clip into the stills ScrollFilm plays as you scroll.
#   scripts/film-frames.sh <clip.mp4> <name> <wide|tall> [fps]
# writes public/media/film/<name>/<wide|tall>/0001.webp ... and prints the frame count to pass to <ScrollFilm>.
# Wide frames are 1600 px across, tall ones 900 px across; 12 frames a second of clip is smooth at scroll speed.
set -euo pipefail
clip="$1"; name="$2"; kind="$3"; fps="${4:-12}"
here="$(cd "$(dirname "$0")/.." && pwd)"
out="$here/public/media/film/$name/$kind"
rm -rf "$out"; mkdir -p "$out"
if [ "$kind" = tall ]; then scale="scale=900:-2"; else scale="scale=1600:-2"; fi
ffmpeg -v error -y -i "$clip" -vf "fps=$fps,$scale" -c:v libwebp -quality 64 -compression_level 6 "$out/%04d.webp"
ffmpeg -v error -y -i "$out/0001.webp" -q:v 3 "$here/public/media/film/$name/$kind-poster.jpg"
n=$(ls "$out" | wc -l); size=$(du -sh "$out" | cut -f1)
echo "$name/$kind: $n frames, $size"
