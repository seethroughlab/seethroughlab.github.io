#!/usr/bin/env bash
set -euo pipefail

SRC="/Users/jeff/Desktop/AABA"
MAX_PARALLEL=2

# Each line: "filename|slug"
ENTRIES=(
  "Dunes - Afternoon - small.mp4|aaba-lounge-dunes-afternoon"
  "Dunes - Midnight - small.mp4|aaba-lounge-dunes-midnight"
  "Dunes - Morning - small.mp4|aaba-lounge-dunes-morning"
  "Dunes - Sunrise - small.mp4|aaba-lounge-dunes-sunrise"
  "Dunes - Sunset - small.mp4|aaba-lounge-dunes-sunset"
  "Ferns - Afternoon - small.mp4|aaba-lounge-ferns-afternoon"
  "Ferns - Midnight - small.mp4|aaba-lounge-ferns-midnight"
  "Ferns - Morning - small.mp4|aaba-lounge-ferns-morning"
  "Ferns - Sunrise - small.mp4|aaba-lounge-ferns-sunrise"
  "Ferns - Sunset - small.mp4|aaba-lounge-ferns-sunset"
  "Garden - Afternoon - small.mp4|aaba-lounge-garden-afternoon"
  "Garden - Midnight - small.mp4|aaba-lounge-garden-midnight"
  "Garden - Morning - small.mp4|aaba-lounge-garden-morning"
  "Garden - Sunrise - small.mp4|aaba-lounge-garden-sunrise"
  "Garden - Sunset - small.mp4|aaba-lounge-garden-sunset"
  "Mountain - Afternoon - small.mp4|aaba-lounge-mountain-afternoon"
  "Mountain - Midnight - small.mp4|aaba-lounge-mountain-midnight"
  "Mountain - Morning - small.mp4|aaba-lounge-mountain-morning"
  "Mountain - Sunrise - small.mp4|aaba-lounge-mountain-sunrise"
  "Mountain - Sunset - small.mp4|aaba-lounge-mountain-sunset"
)

for ENTRY in "${ENTRIES[@]}"; do
  FILE="${ENTRY%%|*}"
  SLUG="${ENTRY##*|}"

  # Skip already-encoded
  if [ -f "processed/videos/$SLUG/index.m3u8" ]; then
    echo "Skipping (already done): $SLUG"
    continue
  fi

  echo "$SRC/$FILE|$SLUG"
done | xargs -P "$MAX_PARALLEL" -I {} bash -c '
  INPUT="${1%%|*}"
  SLUG="${1##*|}"
  echo "Starting: $SLUG"
  ./scripts/process-video.sh "$INPUT" "$SLUG"
  echo "Finished: $SLUG"
' _ {}

echo "All AABA videos encoded."
