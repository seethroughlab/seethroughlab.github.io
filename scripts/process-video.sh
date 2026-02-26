#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/process-video.sh <input-video> <slug>
# Outputs HLS in 3 renditions + poster to processed/videos/<slug>/

if [ $# -ne 2 ]; then
  echo "Usage: $0 <input-video> <slug>"
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
    [v1]scale=-2:1080[v1out]; \
    [v2]scale=-2:720[v2out]; \
    [v3]scale=-2:480[v3out]" \
  -map "[v1out]" -map 0:a? \
  -c:v:0 libx264 -b:v:0 4M -maxrate:v:0 4.4M -bufsize:v:0 8M \
  -preset slow -profile:v high -level 4.1 \
  -c:a aac -b:a 128k -ac 2 \
  -hls_time 6 -hls_list_size 0 -hls_segment_type mpegts \
  -hls_segment_filename "${OUTDIR}/1080p/seg_%03d.ts" \
  "${OUTDIR}/1080p/index.m3u8" \
  -map "[v2out]" -map 0:a? \
  -c:v:0 libx264 -b:v:0 2M -maxrate:v:0 2.2M -bufsize:v:0 4M \
  -preset slow -profile:v main -level 3.1 \
  -c:a aac -b:a 128k -ac 2 \
  -hls_time 6 -hls_list_size 0 -hls_segment_type mpegts \
  -hls_segment_filename "${OUTDIR}/720p/seg_%03d.ts" \
  "${OUTDIR}/720p/index.m3u8" \
  -map "[v3out]" -map 0:a? \
  -c:v:0 libx264 -b:v:0 800k -maxrate:v:0 880k -bufsize:v:0 1600k \
  -preset slow -profile:v main -level 3.0 \
  -c:a aac -b:a 96k -ac 2 \
  -hls_time 6 -hls_list_size 0 -hls_segment_type mpegts \
  -hls_segment_filename "${OUTDIR}/480p/seg_%03d.ts" \
  "${OUTDIR}/480p/index.m3u8"

# Create master playlist
echo "Creating master playlist..."
cat > "${OUTDIR}/index.m3u8" << 'MASTER'
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=4128000,RESOLUTION=1920x1080
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2128000,RESOLUTION=1280x720
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=896000,RESOLUTION=854x480
480p/index.m3u8
MASTER

echo "Done: ${OUTDIR}/"
ls -lhR "$OUTDIR" | head -30
