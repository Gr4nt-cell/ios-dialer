#!/usr/bin/env bash
set -euo pipefail

BASE="https://github.com/Gr4nt-cell/ios-dialer/releases/download/latest"
ASSETS="modules/dialer/android/src/main/assets"
MAVEN="android/local-maven"
TMP="${RUNNER_TEMP:-/tmp}"

mkdir -p "$ASSETS/tts" "$ASSETS/espeak-ng-data" "$MAVEN"

fetch_asset() {
  local url="$1"
  local destination="$2"
  if [ ! -s "$destination" ]; then
    mkdir -p "$(dirname "$destination")"
    local temporary="$destination.download"
    rm -f "$temporary"
    curl --retry 3 --retry-delay 2 -fsSL "$url" -o "$temporary"
    test -s "$temporary"
    mv "$temporary" "$destination"
  fi
}

fetch_asset "$BASE/voice-female.onnx" "$ASSETS/tts/voice-female.onnx"
fetch_asset "$BASE/voice-female-tokens.txt" "$ASSETS/tts/voice-female-tokens.txt"
fetch_asset "$BASE/voice-male.onnx" "$ASSETS/tts/voice-male.onnx"
fetch_asset "$BASE/voice-male-tokens.txt" "$ASSETS/tts/voice-male-tokens.txt"

if [ ! -s "$ASSETS/espeak-ng-data/phontab" ]; then
  fetch_asset "$BASE/espeak-ng-data.zip" "$TMP/espeak-ng-data.zip"
  local_espeak="$TMP/espeak-assets"
  rm -rf "$local_espeak"
  mkdir -p "$local_espeak"
  unzip -oq "$TMP/espeak-ng-data.zip" -d "$local_espeak"
  test -s "$local_espeak/espeak-ng-data/phontab"
  rm -rf "$ASSETS/espeak-ng-data"
  mv "$local_espeak/espeak-ng-data" "$ASSETS/espeak-ng-data"
fi
test -s "$ASSETS/espeak-ng-data/phontab"

install_aar() {
  local group="$1"
  local artifact="$2"
  local version="$3"
  local url="$4"
  local group_path="${group//.//}"
  local directory="$MAVEN/$group_path/$artifact/$version"
  local filename="$artifact-$version"
  mkdir -p "$directory"
  fetch_asset "$url" "$directory/$filename.aar"
  cat > "$directory/$filename.pom" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>$group</groupId>
  <artifactId>$artifact</artifactId>
  <version>$version</version>
  <packaging>aar</packaging>
</project>
EOF
}

install_aar \
  "com.k2fsa" \
  "sherpa-onnx" \
  "2.0.1" \
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-2.0.1.aar"
install_aar \
  "com.github.csukuangfj.piper-phonemize" \
  "piper-phonemize" \
  "v1.5.9" \
  "https://github.com/csukuangfj/piper-phonemize/releases/download/v1.5.9/piper-phonemize-1.5.9.aar"

test -s "$ASSETS/tts/voice-female.onnx"
test -s "$ASSETS/tts/voice-male.onnx"
echo "Offline caller voice models and Android runtimes are ready."
