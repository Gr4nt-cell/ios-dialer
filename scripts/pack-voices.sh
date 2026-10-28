#!/usr/bin/env bash
# Publishes the voice files the app downloads on demand.
#
# The models used to ride inside the app, which took it past 80MB for two
# voices most people will only ever use one of. They now live on the "latest"
# release and the app fetches what it needs:
#
#   voice-male.onnx          17.8MB   Alan, British English, int8
#   voice-male-tokens.txt       <1KB
#   voice-female.onnx        17.8MB   Alba, British English, int8
#   voice-female-tokens.txt     <1KB
#   espeak-ng-data.zip       ~12MB    phonemiser data, shared by both
#
# Nothing here changes between builds, so it uploads only what is missing.
# Run it from CI, where gh is authenticated:  ./scripts/pack-voices.sh
set -euo pipefail

REPO="${GH_REPO:-Gr4nt-cell/ios-dialer}"
TAG="latest"
SHERPA="https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models"
MALE_VOICE="vits-piper-en_GB-alan-medium-int8"
FEMALE_VOICE="vits-piper-en_GB-alba-medium-int8"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
DIST="$WORK/dist"
mkdir -p "$DIST"

have() { gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[].name' 2>/dev/null | grep -qx "$1"; }

need=0
for f in voice-male.onnx voice-male-tokens.txt voice-female.onnx voice-female-tokens.txt espeak-ng-data.zip; do
  have "$f" || need=1
done
if [ "$need" = "0" ]; then
  echo "pack-voices: every voice file is already published"
  exit 0
fi

grab() {
  local name="$1" slot="$2"
  echo "pack-voices: fetching $name…"
  curl -fsSL "$SHERPA/$name.tar.bz2" -o "$WORK/$slot.tar.bz2"
  mkdir -p "$WORK/$slot"
  tar -xjf "$WORK/$slot.tar.bz2" -C "$WORK/$slot"
  local src="$WORK/$slot/$name"
  cp "$src"/*.onnx "$DIST/voice-$slot.onnx"
  cp "$src/tokens.txt" "$DIST/voice-$slot-tokens.txt"
  # espeak data is identical in both, so the first one wins
  if [ ! -s "$DIST/espeak-ng-data.zip" ]; then
    (cd "$src" && zip -qr "$DIST/espeak-ng-data.zip" espeak-ng-data)
  fi
}

grab "$MALE_VOICE" male
grab "$FEMALE_VOICE" female

ls -l "$DIST"
gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1 ||
  gh release create "$TAG" --repo "$REPO" --title "Latest build" --notes "Built automatically from main."

for f in "$DIST"/*; do
  name="$(basename "$f")"
  if have "$name"; then
    echo "pack-voices: $name already published"
  else
    echo "pack-voices: uploading $name"
    gh release upload "$TAG" "$f" --repo "$REPO" --clobber
  fi
done
echo "pack-voices: done"
