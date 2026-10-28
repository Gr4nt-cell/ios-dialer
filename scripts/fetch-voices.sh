#!/usr/bin/env bash
# Fetches the neural speech runtime and the two bundled voices.
#
# Run after `expo prebuild`, before Gradle. Nothing here is committed: the
# models are 61MB each and would bloat the repository for ever, so CI pulls
# them on each build and Gradle packages them into the app.
#
#   ./scripts/fetch-voices.sh
#
# What it places:
#   android/local-maven/...             the sherpa-onnx runtime, as a Maven
#                                       module — AGP refuses a bare .aar file
#                                       dependency inside a library module
#   modules/dialer/android/src/main/assets/tts/
#     male/ female/                     each with its .onnx and tokens.txt
#     espeak-ng-data/                   phonemiser data, English only
set -euo pipefail

SHERPA_VERSION="1.13.7"
# int8 builds of the same two voices: 17.8MB each against 63MB, which is the
# difference between a 75MB app and a 170MB one. Same recordings, same model,
# weights stored at lower precision — sherpa publishes them as first-class
# downloads and loads them exactly the same way.
MALE_VOICE="vits-piper-en_GB-alan-medium-int8"
FEMALE_VOICE="vits-piper-en_GB-alba-medium-int8"
RELEASES="https://github.com/k2-fsa/sherpa-onnx/releases/download"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/modules/dialer/android/src/main/assets/tts"
MAVEN="$ROOT/android/local-maven/com/k2fsa/sherpa-onnx/$SHERPA_VERSION"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---------- the runtime ----------
mkdir -p "$MAVEN"
if [ ! -s "$MAVEN/sherpa-onnx-$SHERPA_VERSION.aar" ]; then
  echo "Fetching sherpa-onnx $SHERPA_VERSION…"
  curl -fsSL "$RELEASES/v$SHERPA_VERSION/sherpa-onnx-$SHERPA_VERSION.aar" \
    -o "$MAVEN/sherpa-onnx-$SHERPA_VERSION.aar"
fi
# KEEP_ABIS trims the runtime's native libraries before Gradle ever sees it.
# Patching Gradle to do this proved unreliable — React Native writes its own
# abiFilters line, and a packaging exclude did nothing either — so the archive
# is edited directly, where the result can be printed and checked.
if [ -n "${KEEP_ABIS:-}" ]; then
  AAR="$MAVEN/sherpa-onnx-$SHERPA_VERSION.aar"
  for abi in armeabi-v7a arm64-v8a x86 x86_64; do
    case " $KEEP_ABIS " in
      *" $abi "*) ;;
      *) zip -q -d "$AAR" "jni/$abi/*" >/dev/null 2>&1 || true ;;
    esac
  done
  echo "Runtime architectures kept:"
  unzip -l "$AAR" | awk -F/ '/jni\//{print "  " $2}' | sort -u
  echo "Runtime size: $(du -h "$AAR" | cut -f1)"
fi

cat > "$MAVEN/sherpa-onnx-$SHERPA_VERSION.pom" <<POM
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.k2fsa</groupId>
  <artifactId>sherpa-onnx</artifactId>
  <version>$SHERPA_VERSION</version>
  <packaging>aar</packaging>
</project>
POM

# The voices themselves are no longer packaged: they are published to the
# release by pack-voices.sh and the app downloads the one it wants. See
# VoiceDownload.kt. This script now only places the runtime.
echo "fetch-voices: runtime ready (voices are downloaded on demand)"
