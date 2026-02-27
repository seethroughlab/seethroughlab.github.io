#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/process-batch.sh <source-dir> <slug-prefix>
# Example: ./scripts/process-batch.sh "1 Hour Challenge" one-hour-experiment
#
# Scans Day01–Day30 directories, auto-selects best video per day,
# shows a manifest for review, then processes each with process-video.sh.

if [ $# -ne 2 ]; then
  echo "Usage: $0 <source-dir> <slug-prefix>"
  echo "Example: $0 \"1 Hour Challenge\" one-hour-experiment"
  exit 1
fi

SRCDIR="$1"
PREFIX="$2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROCESS_SCRIPT="${SCRIPT_DIR}/process-video.sh"

if [ ! -x "$PROCESS_SCRIPT" ]; then
  echo "Error: process-video.sh not found or not executable at $PROCESS_SCRIPT"
  exit 1
fi

# select_best_video <day-dir> <day-number>
# Prints the path to the best video file for a given day
select_best_video() {
  local day_dir="$1"
  local day_num="$2"  # e.g. "01", "18"
  local day_num_nozero="${day_num#0}"  # strip leading zero for matching

  # Collect all video files
  local videos=()
  while IFS= read -r -d '' f; do
    videos+=("$f")
  done < <(find "$day_dir" -maxdepth 1 -type f \( -iname '*.mp4' -o -iname '*.mov' \) -print0 2>/dev/null)

  if [ ${#videos[@]} -eq 0 ]; then
    return 1
  fi

  # If only one video, use it
  if [ ${#videos[@]} -eq 1 ]; then
    echo "${videos[0]}"
    return 0
  fi

  # Multiple candidates — apply heuristics

  # 1. Prefer files with "Better Audio" in the name
  for v in "${videos[@]}"; do
    if [[ "$(basename "$v")" == *"Better Audio"* ]]; then
      echo "$v"
      return 0
    fi
  done

  # 2. Prefer files with "withaudio" in the name
  for v in "${videos[@]}"; do
    if [[ "$(basename "$v")" == *"withaudio"* ]]; then
      echo "$v"
      return 0
    fi
  done

  # 3. Prefer DayNN.mp4 (exact match, with or without space)
  for v in "${videos[@]}"; do
    local base
    base="$(basename "$v")"
    if [[ "$base" == "Day${day_num_nozero}.mp4" ]] || \
       [[ "$base" == "Day${day_num}.mp4" ]] || \
       [[ "$base" == "Day ${day_num_nozero}.mp4" ]] || \
       [[ "$base" == "Day ${day_num}.mp4" ]]; then
      echo "$v"
      return 0
    fi
  done

  # 4. Prefer DayNN.mov
  for v in "${videos[@]}"; do
    local base
    base="$(basename "$v")"
    if [[ "$base" == "Day${day_num_nozero}.mov" ]] || \
       [[ "$base" == "Day${day_num}.mov" ]]; then
      echo "$v"
      return 0
    fi
  done

  # 5. Prefer any file starting with "Day" and ending in .mp4
  for v in "${videos[@]}"; do
    local base
    base="$(basename "$v")"
    if [[ "$base" == Day*.mp4 ]]; then
      echo "$v"
      return 0
    fi
  done

  # 6. Prefer any file starting with "Day" (any extension)
  for v in "${videos[@]}"; do
    local base
    base="$(basename "$v")"
    if [[ "$base" == Day* ]]; then
      echo "$v"
      return 0
    fi
  done

  # 7. Fallback: first video alphabetically
  printf '%s\n' "${videos[@]}" | sort | head -1
}

get_video_info() {
  local file="$1"
  local width height duration
  width=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$file" 2>/dev/null || echo "?")
  height=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$file" 2>/dev/null || echo "?")
  duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$file" 2>/dev/null | cut -d. -f1 || echo "?")
  echo "${width}x${height} ${duration}s"
}

echo "Scanning ${SRCDIR} for Day01–Day30..."
echo ""

# Build manifest
declare -a MANIFEST_DAYS=()
declare -a MANIFEST_FILES=()
declare -a MANIFEST_INFO=()
ERRORS=0

for i in $(seq -w 1 30); do
  day_num="$i"
  day_num_nozero="${i#0}"
  day_dir="${SRCDIR}/Day$(printf '%02d' "$day_num_nozero")"

  if [ ! -d "$day_dir" ]; then
    echo "WARNING: Directory not found: $day_dir"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  selected=$(select_best_video "$day_dir" "$day_num" || true)
  if [ -z "$selected" ]; then
    echo "WARNING: No video found in $day_dir"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  info=$(get_video_info "$selected")

  MANIFEST_DAYS+=("$day_num")
  MANIFEST_FILES+=("$selected")
  MANIFEST_INFO+=("$info")
done

if [ ${#MANIFEST_DAYS[@]} -eq 0 ]; then
  echo "Error: No videos found!"
  exit 1
fi

# Print manifest
echo "============================================"
echo "  BATCH PROCESSING MANIFEST"
echo "  Prefix: ${PREFIX}"
echo "  Videos: ${#MANIFEST_DAYS[@]} / 30"
echo "============================================"
echo ""
printf "%-6s %-14s %s\n" "Day" "Info" "File"
printf "%-6s %-14s %s\n" "---" "----" "----"

for idx in "${!MANIFEST_DAYS[@]}"; do
  printf "%-6s %-14s %s\n" \
    "${MANIFEST_DAYS[$idx]}" \
    "${MANIFEST_INFO[$idx]}" \
    "$(basename "${MANIFEST_FILES[$idx]}")"
done

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "WARNING: $ERRORS days had issues (see above)"
fi

echo ""
read -rp "Proceed with processing? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "Processing ${#MANIFEST_DAYS[@]} videos..."
echo ""

FAILED=0
for idx in "${!MANIFEST_DAYS[@]}"; do
  day="${MANIFEST_DAYS[$idx]}"
  file="${MANIFEST_FILES[$idx]}"
  slug="${PREFIX}/${day}"

  echo "━━━ Day ${day} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if "$PROCESS_SCRIPT" "$file" "$slug"; then
    echo "✓ Day ${day} complete"
  else
    echo "✗ Day ${day} FAILED"
    FAILED=$((FAILED + 1))
  fi
  echo ""
done

echo "============================================"
echo "  BATCH COMPLETE"
echo "  Processed: $((${#MANIFEST_DAYS[@]} - FAILED)) / ${#MANIFEST_DAYS[@]}"
if [ "$FAILED" -gt 0 ]; then
  echo "  Failed: $FAILED"
fi
echo "  Output: processed/videos/${PREFIX}/"
echo "============================================"
