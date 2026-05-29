#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Building Ultimate Musician Desktop..."

# Generate DMG background if it doesn't exist
if [ ! -f "assets/dmg-background.png" ]; then
  echo "Generating DMG background..."
  bash scripts/create-dmg-background.sh
fi

echo "Building renderer (Vite)..."
npx vite build

echo "Creating installer..."
npx electron-builder --mac --publish never

echo "Done! Installer written to ./release/"
ls -lh release/ 2>/dev/null || true
