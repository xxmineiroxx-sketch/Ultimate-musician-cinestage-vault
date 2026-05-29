#!/bin/bash
# Generate app icons from a 1024x1024 source PNG
# Usage: Place your icon at assets/icon-source.png, then run this script.
# Requires: macOS (sips + iconutil — both built in)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$PROJECT_ROOT/assets/icon-source.png"
ICONSET="$PROJECT_ROOT/assets/icon.iconset"
OUTPUT="$PROJECT_ROOT/assets/icon.icns"

if [ ! -f "$SOURCE" ]; then
  echo "Error: source icon not found at $SOURCE"
  echo "Please provide a 1024x1024 PNG at assets/icon-source.png"
  exit 1
fi

echo "Generating iconset from $SOURCE..."
mkdir -p "$ICONSET"

sips -z 16   16   "$SOURCE" --out "$ICONSET/icon_16x16.png"
sips -z 32   32   "$SOURCE" --out "$ICONSET/icon_16x16@2x.png"
sips -z 32   32   "$SOURCE" --out "$ICONSET/icon_32x32.png"
sips -z 64   64   "$SOURCE" --out "$ICONSET/icon_32x32@2x.png"
sips -z 128  128  "$SOURCE" --out "$ICONSET/icon_128x128.png"
sips -z 256  256  "$SOURCE" --out "$ICONSET/icon_128x128@2x.png"
sips -z 256  256  "$SOURCE" --out "$ICONSET/icon_256x256.png"
sips -z 512  512  "$SOURCE" --out "$ICONSET/icon_256x256@2x.png"
sips -z 512  512  "$SOURCE" --out "$ICONSET/icon_512x512.png"
sips -z 1024 1024 "$SOURCE" --out "$ICONSET/icon_512x512@2x.png"

echo "Converting iconset to .icns..."
iconutil -c icns "$ICONSET" -o "$OUTPUT"

echo "Cleaning up iconset folder..."
rm -rf "$ICONSET"

echo "Done: $OUTPUT"
