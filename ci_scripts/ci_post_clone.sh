#!/bin/sh

set -eu

PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

log() {
  printf '%s\n' "[ci_post_clone] $*"
}

normalize_watch_assets() {
  legacy_watch_dir="$PROJECT_ROOT/ios/UltimatePlaybackWatch 2"
  legacy_assets_dir="$legacy_watch_dir/Assets.xcassets"
  watch_dir="$PROJECT_ROOT/ios/UltimatePlaybackWatch"
  watch_assets_dir="$watch_dir/Assets.xcassets"

  if [ -d "$legacy_assets_dir" ] && [ ! -d "$watch_assets_dir" ]; then
    log "Normalizing stray watch asset folder"
    mkdir -p "$watch_dir"
    mv "$legacy_assets_dir" "$watch_assets_dir"
    rmdir "$legacy_watch_dir" 2>/dev/null || true
  fi
}

ensure_xcodeproj_gem() {
  if ruby -e "require 'xcodeproj'" >/dev/null 2>&1; then
    log "Ruby gem xcodeproj already available"
    return
  fi

  export GEM_HOME="${GEM_HOME:-$HOME/.gem}"
  export GEM_PATH="$GEM_HOME"
  export PATH="$GEM_HOME/bin:$PATH"

  log "Installing Ruby gem xcodeproj"
  gem install xcodeproj --no-document

  ruby -e "require 'xcodeproj'" >/dev/null 2>&1
}

cd "$PROJECT_ROOT"

export CI=1
export COCOAPODS_DISABLE_STATS=1
export HOMEBREW_NO_AUTO_UPDATE=1

log "Project root: $PROJECT_ROOT"
log "Node: $(command -v node)"
log "npm: $(command -v npm)"

ensure_xcodeproj_gem

if [ "${CI_POST_CLONE_SKIP_NPM_INSTALL:-0}" != "1" ]; then
  log "Installing JavaScript dependencies"
  npm ci
else
  log "Skipping npm ci because CI_POST_CLONE_SKIP_NPM_INSTALL=1"
fi

if [ "${CI_POST_CLONE_SKIP_PREBUILD:-0}" != "1" ]; then
  log "Generating iOS workspace with Expo prebuild"
  npx expo prebuild --platform ios --clean --non-interactive

  log "Reapplying local iOS path fixes"
  node scripts/fix-ios-build-paths.js
else
  log "Skipping Expo prebuild because CI_POST_CLONE_SKIP_PREBUILD=1"
fi

normalize_watch_assets

if [ ! -d ios/UltimatePlayback.xcworkspace ]; then
  log "Expected ios/UltimatePlayback.xcworkspace to exist after prebuild"
  exit 1
fi

log "iOS workspace is ready for Xcode Cloud"
