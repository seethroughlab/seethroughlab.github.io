#!/usr/bin/env bash
set -euo pipefail

# Pulls .mov files from the NAS, converts to browser-compatible MP4, saves to OUTDIR.
# H.264 source: remux only (fast, lossless). Other codecs: re-encode with libx264 CRF 18.
# Downloads each file to a temp location first (ffmpeg needs seekable input for .mov).
# After this runs, upload with: node scripts/upload-bts.js <OUTDIR> --all-mp4s --skip-existing

NAS="root@openmediavault"
NAS_VIMEO="/srv/dev-disk-by-uuid-8dfd5250-f9f8-470e-b821-820ea31be6e6/Vimeo"
OUTDIR="${1:-/tmp/vimeo-movs-converted}"
TMPFILE="/tmp/vimeo-mov-input.mov"

# Each entry: "relative/path.mov:codec"
ENTRIES=(
  "AccATX/AccATXWindow-Particles-Test03_605773037.mov:mjpeg"
  "AccATX/AccATXWindow-Particles-Test04_606743749.mov:mjpeg"
  "AccATX/AccATXWindow-Particles-Test05_606843057.mov:mjpeg"
  "AccATX/AccATXWindow-Particles-Test06_611009578.mov:mjpeg"
  "AccATX/AccATXWindow-Particles-Test07_611044660.mov:mjpeg"
  "AccATX/AccATXWindow-Particles-Test08_611083471.mov:mjpeg"
  "AccATX/AccATXWindow-Particles-Test09_611166048.mov:mjpeg"
  "AccATX/AccATXWindow-Particles-Test10_611179860.mov:mjpeg"
  "ASCC/demo03-whiskey_363294016.mov:prores"
  "Baron_Samedi/GOPR7830_1080p_196177054.mov:h264"
  "Misc/Button_129281146.mov:h264"
  "Misc/hill_-_unstabilized_316077102.mov:h264"
  "Misc/myo-diagnostics_174272420.mov:h264"
  "Misc/Office_Party_148677316.mov:qtrle"
  "Misc/PhaseEight_Interaction_Prototype_002_145687667.mov:h264"
  "Misc/ScanLAB_TestData_CopyrightScanLABProjectsLtd_25pcxyz_137748313.mov:h264"
  "Misc/ScanLAB_TestData_CopyrightScanLABProjectsLtd_4pcxyz_137749741.mov:h264"
  "Misc/WITNESS_First_Test_122158784.mov:h264"
)

cleanup() { rm -f "$TMPFILE"; }
trap cleanup EXIT

mkdir -p "$OUTDIR"
total=${#ENTRIES[@]}
count=0

for entry in "${ENTRIES[@]}"; do
  rel_path="${entry%:*}"
  codec="${entry##*:}"
  filename="$(basename "${rel_path%.mov}.mp4")"
  outfile="$OUTDIR/$filename"
  count=$((count + 1))

  if [ -f "$outfile" ]; then
    echo "[$count/$total] Skipping $filename (already exists)"
    continue
  fi

  echo "[$count/$total] Downloading $filename (source: $codec)..."
  scp -q "$NAS:$NAS_VIMEO/$rel_path" "$TMPFILE"

  echo "[$count/$total] Converting $filename..."
  if [ "$codec" = "h264" ]; then
    ffmpeg -y -i "$TMPFILE" -c copy -movflags +faststart "$outfile" 2>/dev/null
  else
    ffmpeg -y -i "$TMPFILE" \
      -c:v libx264 -crf 18 -preset slow \
      -pix_fmt yuv420p \
      -c:a aac -b:a 128k -ac 2 \
      -movflags +faststart \
      "$outfile" 2>/dev/null
  fi

  rm -f "$TMPFILE"
  echo "[$count/$total] Done -> $outfile"
done

echo ""
echo "All $total files written to $OUTDIR"
echo ""
echo "Next step:"
echo "  node scripts/upload-bts.js $OUTDIR --all-mp4s --skip-existing"
