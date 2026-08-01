#!/usr/bin/env bash
set -euo pipefail

ICLOUD_ROOT="${ICLOUD_ROOT:-/Users/studio/Library/Mobile Documents/com~apple~CloudDocs}"
OBSIDIAN_ROOT="${OBSIDIAN_ROOT:-/Users/studio/Documents/ObsidianVault}"
OUT_DIR="${OUT_DIR:-/tmp/ultimate-icloud-full-inventory}"

mkdir -p "$OUT_DIR"

echo "Writing full inventory to $OUT_DIR"

find "$ICLOUD_ROOT" -type d -print > "$OUT_DIR/icloud-all-dirs.txt"
find "$ICLOUD_ROOT" -type f -print > "$OUT_DIR/icloud-all-files.txt"
find "$OBSIDIAN_ROOT" -type f -print > "$OUT_DIR/obsidian-all-files.txt"

sed "s#^$ICLOUD_ROOT/##" "$OUT_DIR/icloud-all-files.txt" \
  | awk -F/ '{print $1}' \
  | sort \
  | uniq -c \
  | sort -nr > "$OUT_DIR/icloud-top-file-counts.txt"

sed "s#^$ICLOUD_ROOT/##" "$OUT_DIR/icloud-all-dirs.txt" \
  | awk -F/ '{print $1}' \
  | sort \
  | uniq -c \
  | sort -nr > "$OUT_DIR/icloud-top-dir-counts.txt"

awk '
function ext(path) {
  n = split(path, a, "/")
  f = a[n]
  if (f !~ /\./) return "[no extension]"
  sub(/^.*\./, "", f)
  return tolower(f)
}
{ print ext($0) }
' "$OUT_DIR/icloud-all-files.txt" \
  | sort \
  | uniq -c \
  | sort -nr > "$OUT_DIR/icloud-extension-counts.txt"

rg -i '\.md$|\.txt$|\.pdf$|\.docx$|\.rtf$|\.pages$|\.numbers$|\.xlsx$|\.csv$|\.json$' \
  "$OUT_DIR/icloud-all-files.txt" > "$OUT_DIR/icloud-doc-like-files.txt" || true

rg -i '\.wav$|\.mp3$|\.m4a$|\.aif$|\.aiff$|\.flac$|\.als$|\.mid$|\.midi$|\.nki$|\.nkc$|\.nksn$|\.asd$|\.scl$|\.chn$|\.scn$|\.syx$|\.mxl$|\.musicxml$|\.abc$|\.pdf$' \
  "$OUT_DIR/icloud-all-files.txt" > "$OUT_DIR/icloud-music-asset-files.txt" || true

rg -i 'README|TODO|ROADMAP|BLUEPRINT|SPEC|ARCHITECTURE|GUIDE|CHECKLIST|COMPLETE|IMPLEMENTATION|INTEGRATION|WORKFLOW|IDEA|FEATURE|AUDIT|REPORT|DECISION' \
  "$OUT_DIR/icloud-doc-like-files.txt" > "$OUT_DIR/icloud-planning-docs.txt" || true

rg -i 'node_modules|/\.git/|/Pods/|/Headers/|/DerivedData/|/build/|/dist/|/\.expo/|/\.next/|/target/|/\.venv/|/venv/' \
  "$OUT_DIR/icloud-all-files.txt" > "$OUT_DIR/icloud-build-noise-files.txt" || true

{
  echo "# Ultimate iCloud Full Inventory"
  echo
  date
  echo
  echo "Raw counts:"
  wc -l "$OUT_DIR/icloud-all-dirs.txt" "$OUT_DIR/icloud-all-files.txt" "$OUT_DIR/obsidian-all-files.txt"
  echo
  echo "Derived counts:"
  wc -l "$OUT_DIR/icloud-doc-like-files.txt" "$OUT_DIR/icloud-music-asset-files.txt" "$OUT_DIR/icloud-planning-docs.txt" "$OUT_DIR/icloud-build-noise-files.txt"
  echo
  echo "Top iCloud folders by file count:"
  sed -n '1,40p' "$OUT_DIR/icloud-top-file-counts.txt"
  echo
  echo "Top file extensions:"
  sed -n '1,80p' "$OUT_DIR/icloud-extension-counts.txt"
} > "$OUT_DIR/SUMMARY.md"

cat "$OUT_DIR/SUMMARY.md"
