#!/usr/bin/env bash
# Copy the Cassvision research page's assets from the Cassvision repo: the case and internals STLs,
# the camera pipeline compiled to JS, the viewer's clips and screen still, and the carrier board renders.
#
#   scripts/sync-cassvision.sh            # copy what the Cassvision repo has built
#   scripts/sync-cassvision.sh --rebuild  # regenerate there first (CAD, internals, pipeline; clips if missing)
#
# CASSVISION=/path/to/cassvision overrides the repo location (default ~/Developer/cassvision).
# Then check the page locally (npm run build && npm run preview) and commit what changed.
set -euo pipefail

SRC="${CASSVISION:-$HOME/Developer/cassvision}"
SITE="$(cd "$(dirname "$0")/.." && pwd)"
LAB="$SITE/public/lab/cassvision"
IMG="$SITE/public/images/research/cassvision"

# Printed parts and internals, as loaded by public/lab/cassvision/cassvision.js (CASE_PARTS, CASE_INTERNALS, in_camera).
PARTS=(front_shell rear_bezel grip grip_cap trigger window_ring
       in_camera in_nano in_nano_parts in_carrier_board in_carrier_parts in_usb_link in_screen)
CLIPS=(market smiles yotel fireside)

[ -d "$SRC" ] || { echo "Cassvision repo not found at $SRC (set CASSVISION)"; exit 1; }

if [ "${1:-}" = "--rebuild" ]; then
  # build.py --cad re-runs pxl_case.py and pxl_internals.py, rebuilds firmware/web if its sources changed,
  # and cuts the clips if they're missing (they come from personal footage in ~/Movies).
  (cd "$SRC" && python3 tools/viewer/build.py --cad)
fi

missing=0
need() { [ -f "$1" ] || { echo "missing: $1"; missing=1; }; }
for p in "${PARTS[@]}"; do need "$SRC/enclosure/out/$p.stl"; done
need "$SRC/firmware/web/out/pxl_web.js"
need "$SRC/tools/viewer/dist/screen.png"
for c in "${CLIPS[@]}"; do need "$SRC/tools/viewer/dist/raw/$c.mp4"; done
need "$SRC/cassvision_carrier/renders/iso.png"
need "$SRC/cassvision_carrier/renders/top.png"
[ "$missing" = 0 ] || { echo "Build them in the Cassvision repo first, or run with --rebuild."; exit 1; }

mkdir -p "$LAB/parts" "$LAB/clips" "$IMG"
for p in "${PARTS[@]}"; do cp "$SRC/enclosure/out/$p.stl" "$LAB/parts/"; done
cp "$SRC/firmware/web/out/pxl_web.js" "$LAB/"
cp "$SRC/tools/viewer/dist/screen.png" "$LAB/"
# The viewer's raw clips (the pipeline runs on them in the browser). Kept in clips/: raw/ is gitignored here.
for c in "${CLIPS[@]}"; do cp "$SRC/tools/viewer/dist/raw/$c.mp4" "$LAB/clips/"; done
for v in iso top; do
  ffmpeg -hide_banner -loglevel error -y -i "$SRC/cassvision_carrier/renders/$v.png" -q:v 3 "$IMG/carrier-$v.jpg"
done

# Parts no longer in the list (a part renamed or dropped in the CAD).
for f in "$LAB"/parts/*.stl; do
  n="$(basename "$f" .stl)"
  [[ " ${PARTS[*]} " == *" $n "* ]] || echo "note: $LAB/parts/$n.stl is no longer synced; remove it if the viewer doesn't use it"
done

echo "Synced from $SRC. Changed:"
git -C "$SITE" status --short -- public/lab/cassvision public/images/research/cassvision
