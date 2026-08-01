#!/usr/bin/env bash
set -euo pipefail

ICLOUD_ROOT="${ICLOUD_ROOT:-/Users/studio/Library/Mobile Documents/com~apple~CloudDocs}"
OBSIDIAN_ROOT="${OBSIDIAN_ROOT:-/Users/studio/Documents/ObsidianVault}"
OUT_DIR="${OUT_DIR:-/tmp/ultimate-icloud-idea-scan}"

mkdir -p "$OUT_DIR"

PRUNE_NAMES=(
  node_modules
  .git
  .expo
  .next
  Pods
  Headers
  DerivedData
  build
  dist
  cache
)

KEYWORDS='ultimate|cinestage|playback|musician|worship|setlist|idea|roadmap|feature|brain|siri|automation|agent|workflow|graphify|obsidian|sync|lead singer|vocal|chord|preset|stem|ableton|kontakt|waves|scene|mixer|x32|wing|sq|gld|propresenter'

build_prune_expression() {
  local first=1
  printf '\\('
  for name in "${PRUNE_NAMES[@]}"; do
    if [[ "$first" -eq 0 ]]; then
      printf ' -o'
    fi
    printf ' -name %q' "$name"
    first=0
  done
  printf ' \\)'
}

echo "Writing scan output to $OUT_DIR"

find "$ICLOUD_ROOT" \
  \( -name node_modules -o -name .git -o -name .expo -o -name .next -o -name Pods -o -name Headers -o -name DerivedData -o -name build -o -name dist -o -name cache \) -prune -o \
  -type f \( -iname '*.md' -o -iname '*.txt' -o -iname '*.rtf' -o -iname '*.docx' -o -iname '*.pdf' -o -iname '*.json' -o -iname '*.csv' -o -iname '*.xlsx' -o -iname '*.pages' -o -iname '*.numbers' \) \
  -print > "$OUT_DIR/icloud-readable-docs.txt"

find "$ICLOUD_ROOT" \
  \( -name node_modules -o -name .git -o -name .expo -o -name .next -o -name Pods -o -name Headers -o -name DerivedData -o -name build -o -name dist -o -name cache \) -prune -o \
  -type d \( -iname '*ultimate*' -o -iname '*cinestage*' -o -iname '*playback*' -o -iname '*musician*' -o -iname '*worship*' -o -iname '*ableton*' -o -iname '*kontakt*' -o -iname '*preset*' -o -iname '*stems*' -o -iname '*scene*' -o -iname '*mixer*' \) \
  -print > "$OUT_DIR/relevant-dirs.txt"

find "$OBSIDIAN_ROOT" \
  \( -name node_modules -o -name .git -o -name cache \) -prune -o \
  -type f -print > "$OUT_DIR/obsidian-files.txt"

rg -i "$KEYWORDS" "$OUT_DIR/icloud-readable-docs.txt" > "$OUT_DIR/icloud-keyword-docs.txt" || true
rg -i "$KEYWORDS" "$OUT_DIR/obsidian-files.txt" > "$OUT_DIR/obsidian-keyword-docs.txt" || true

{
  echo "# Ultimate iCloud Idea Scan"
  echo
  date
  echo
  wc -l "$OUT_DIR/icloud-readable-docs.txt" "$OUT_DIR/relevant-dirs.txt" "$OUT_DIR/obsidian-files.txt" "$OUT_DIR/icloud-keyword-docs.txt" "$OUT_DIR/obsidian-keyword-docs.txt"
  echo
  echo "Review these files first:"
  echo "- $OUT_DIR/icloud-keyword-docs.txt"
  echo "- $OUT_DIR/relevant-dirs.txt"
  echo "- $OUT_DIR/obsidian-keyword-docs.txt"
} > "$OUT_DIR/SUMMARY.md"

cat "$OUT_DIR/SUMMARY.md"
