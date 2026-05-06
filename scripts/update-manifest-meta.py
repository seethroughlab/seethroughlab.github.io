#!/usr/bin/env python3
"""
Backfill year and project fields in public/bts/manifest.json using
NAS sidecar metadata fetched from the Vimeo export directory.

Usage:
  python3 scripts/update-manifest-meta.py /tmp/nas_meta.json
"""

import json
import re
import sys
from pathlib import Path

NAS_META_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/nas_meta.json")
MANIFEST_PATH = Path(__file__).parent.parent / "public/bts/manifest.json"


FOLDER_OVERRIDES: dict[str, str] = {
    "AccATX": "Acc ATX",
    "AudraSonic": "AudraSonic",
    "HoloLens": "HoloLens",
    "PermaJersey": "PermaJersey",
    "PfizerParticles": "Pfizer Particles",
    "SeeNoEvil": "See No Evil",
    "MoodyConcourse": "Moody Concourse",
    "Dell_Club_Tracker": "Dell Club",
    "AABA_Lounge_Content": "AABA Lounge",
    "Landscape_Scenes": "Landscape Scenes",
    "KAG_Demo": "KAG Demo",
    "Creative_Coding_Unity": "Creative Coding",
    "Baron_Samedi": "Baron Samedi",
    "Volumetric_Media_Player": "Volumetric Media Player",
}


def folder_to_project(folder: str) -> str:
    """Convert a NAS folder name to a human-readable project label."""
    if folder in FOLDER_OVERRIDES:
        return FOLDER_OVERRIDES[folder]
    # Replace underscores and hyphens with spaces
    s = folder.replace("_", " ").replace("-", " ")
    # Collapse multiple spaces
    s = re.sub(r" +", " ", s).strip()
    # Title-case fully-lowercase names
    if s == s.lower():
        s = s.title()
    return s


def main():
    nas_entries = json.loads(NAS_META_PATH.read_text())

    # Build lookup: video_id -> {year, project}
    lookup: dict[str, dict] = {}
    for entry in nas_entries:
        vid_id = entry["id"]
        year_str = entry.get("year", "")
        folder = entry.get("folder", "")
        lookup[vid_id] = {
            "year": int(year_str) if year_str.isdigit() else None,
            "project": folder_to_project(folder) if folder else None,
        }

    manifest = json.loads(MANIFEST_PATH.read_text())

    matched = 0
    unmatched = 0
    for clip in manifest:
        # Extract numeric Vimeo ID from the URL (trailing _<digits>.mp4)
        m = re.search(r"_(\d+)\.mp4$", clip.get("url", ""))
        if not m:
            unmatched += 1
            continue
        vid_id = m.group(1)
        meta = lookup.get(vid_id)
        if meta:
            if meta["year"] is not None:
                clip["year"] = meta["year"]
            if meta["project"] is not None:
                clip["project"] = meta["project"]
            matched += 1
        else:
            unmatched += 1

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Updated {matched} clips, {unmatched} unmatched.")


if __name__ == "__main__":
    main()
