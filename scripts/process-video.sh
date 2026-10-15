#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/process-video.sh [--grain] <input-video> <slug>
# Outputs HLS in 3 renditions + poster to processed/videos/<slug>/
#
# Quality-based (CRF) with a bitrate ceiling per rendition: calm footage comes out small, busy or textured footage gets
# the bits it needs up to the ceiling (a fixed 4 Mbps smeared the grain in Antiphon's Show reel). --grain adds x264's
# grain tuning, for film grain, noise or shader texture. Keyframes every 2 s in every rendition, so segments line up and
# players can switch rendition cleanly. The master playlist states each rendition's measured peak and average bitrate.

TUNE=()
if [ "${1:-}" = "--grain" ]; then
  TUNE=(-tune grain)
  shift
fi

if [ $# -ne 2 ]; then
  echo "Usage: $0 [--grain] <input-video> <slug>"
  exit 1
fi

INPUT="$1"
SLUG="$2"
OUTDIR="processed/videos/${SLUG}"

if [ ! -f "$INPUT" ]; then
  echo "Error: input file '$INPUT' not found"
  exit 1
fi

command -v ffmpeg >/dev/null 2>&1 || { echo "Error: ffmpeg not found"; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "Error: ffprobe not found"; exit 1; }

# Detect input dimensions
WIDTH=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$INPUT")
HEIGHT=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$INPUT")

if [ -z "$WIDTH" ] || [ -z "$HEIGHT" ]; then
  echo "Error: could not detect video dimensions"
  exit 1
fi

# A keyframe every 2 s in every rendition (at the same moments), so 6 s segments line up across them
FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$INPUT")
KEYFRAMES=(-force_key_frames "expr:gte(t,n_forced*2)" -sc_threshold 0)

echo "Input: ${WIDTH}x${HEIGHT} at ${FPS} fps${TUNE[0]+, grain tuning}"

# Determine scaling direction based on orientation
# Landscape (width > height): fit within 16:9 box (1920x1080 etc.), never wider than that
# Square/portrait (height >= width): scale by width → TARGET:-2
if [ "$WIDTH" -gt "$HEIGHT" ]; then
  ORIENTATION="landscape"
  SCALE_1080="1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2"
  SCALE_720="1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2"
  SCALE_480="854:480:force_original_aspect_ratio=decrease:force_divisible_by=2"
else
  ORIENTATION="square/portrait"
  SCALE_1080="1080:-2"
  SCALE_720="720:-2"
  SCALE_480="480:-2"
fi

echo "Orientation: ${ORIENTATION}"
echo "Processing '$INPUT' → ${OUTDIR}/"

rm -rf "$OUTDIR"
mkdir -p "${OUTDIR}/1080p" "${OUTDIR}/720p" "${OUTDIR}/480p"

# Extract poster frame at 2 seconds
echo "Extracting poster..."
ffmpeg -y -ss 2 -i "$INPUT" -frames:v 1 -q:v 2 "${OUTDIR}/poster.jpg" 2>/dev/null

# Encode all three renditions in a single ffmpeg pass
echo "Encoding HLS renditions (1080p, 720p, 480p)..."
ffmpeg -y -i "$INPUT" \
  -filter_complex "[0:v]split=3[v1][v2][v3]; \
    [v1]scale=${SCALE_1080}:out_range=tv,format=yuv420p[v1out]; \
    [v2]scale=${SCALE_720}:out_range=tv,format=yuv420p[v2out]; \
    [v3]scale=${SCALE_480}:out_range=tv,format=yuv420p[v3out]" \
  -map "[v1out]" -map 0:a? \
  -c:v:0 libx264 -crf 18 -maxrate:v:0 12M -bufsize:v:0 24M ${TUNE[@]+"${TUNE[@]}"} "${KEYFRAMES[@]}" \
  -preset slow -profile:v high -level 4.1 \
  -c:a aac -b:a 128k -ac 2 \
  -hls_time 6 -hls_list_size 0 -hls_segment_type mpegts \
  -hls_segment_filename "${OUTDIR}/1080p/seg_%03d.ts" \
  "${OUTDIR}/1080p/index.m3u8" \
  -map "[v2out]" -map 0:a? \
  -c:v:0 libx264 -crf 19 -maxrate:v:0 6M -bufsize:v:0 12M ${TUNE[@]+"${TUNE[@]}"} "${KEYFRAMES[@]}" \
  -preset slow -profile:v main -level 3.1 \
  -c:a aac -b:a 128k -ac 2 \
  -hls_time 6 -hls_list_size 0 -hls_segment_type mpegts \
  -hls_segment_filename "${OUTDIR}/720p/seg_%03d.ts" \
  "${OUTDIR}/720p/index.m3u8" \
  -map "[v3out]" -map 0:a? \
  -c:v:0 libx264 -crf 20 -maxrate:v:0 2500k -bufsize:v:0 5M ${TUNE[@]+"${TUNE[@]}"} "${KEYFRAMES[@]}" \
  -preset slow -profile:v main -level 3.0 \
  -c:a aac -b:a 96k -ac 2 \
  -hls_time 6 -hls_list_size 0 -hls_segment_type mpegts \
  -hls_segment_filename "${OUTDIR}/480p/seg_%03d.ts" \
  "${OUTDIR}/480p/index.m3u8"

# Compute actual output resolutions from the encoded files
RES_1080=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${OUTDIR}/1080p/seg_000.ts" | grep -m1 . | tr ',' 'x')
RES_720=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${OUTDIR}/720p/seg_000.ts" | grep -m1 . | tr ',' 'x')
RES_480=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${OUTDIR}/480p/seg_000.ts" | grep -m1 . | tr ',' 'x')

echo "Actual resolutions: 1080p=${RES_1080}, 720p=${RES_720}, 480p=${RES_480}"

# Peak and average bitrate of a rendition, measured from its segments (bits per second)
rates() {
  awk -v dir="$1" '
    /^#EXTINF:/ { split($0, a, ":"); d = a[2] + 0; next }
    /\.ts$/ {
      cmd = "stat -f %z \"" dir "/" $0 "\" 2>/dev/null || stat -c %s \"" dir "/" $0 "\""
      cmd | getline sz; close(cmd)
      r = sz * 8 / d; if (r > peak) peak = r; bytes += sz; secs += d
    }
    END { printf "%d %d\n", peak, bytes * 8 / secs }' "$1/index.m3u8"
}
read -r PEAK_1080 AVG_1080 < <(rates "${OUTDIR}/1080p")
read -r PEAK_720 AVG_720 < <(rates "${OUTDIR}/720p")
read -r PEAK_480 AVG_480 < <(rates "${OUTDIR}/480p")
echo "Bitrates (peak/average kbps): 1080p=$((PEAK_1080/1000))/$((AVG_1080/1000)), 720p=$((PEAK_720/1000))/$((AVG_720/1000)), 480p=$((PEAK_480/1000))/$((AVG_480/1000))"

# Create master playlist with actual resolutions and measured bitrates
echo "Creating master playlist..."
cat > "${OUTDIR}/index.m3u8" << MASTER
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=${PEAK_1080},AVERAGE-BANDWIDTH=${AVG_1080},RESOLUTION=${RES_1080},CODECS="avc1.640029,mp4a.40.2"
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=${PEAK_720},AVERAGE-BANDWIDTH=${AVG_720},RESOLUTION=${RES_720},CODECS="avc1.4d401f,mp4a.40.2"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=${PEAK_480},AVERAGE-BANDWIDTH=${AVG_480},RESOLUTION=${RES_480},CODECS="avc1.4d401e,mp4a.40.2"
480p/index.m3u8
MASTER

echo "Done: ${OUTDIR}/"
ls -lhR "$OUTDIR" | head -30
