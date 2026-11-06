#!/usr/bin/env bash
# Sign a bundle with the upload key, outside CI.
#
# The CI build comes out debug-signed when the signing secrets aren't set, so
# this takes that bundle, drops the debug signature and re-signs it with the
# upload key. Signing a bundle with jarsigner is Google's own documented
# method, so the result is a proper upload-key signature, not a workaround in
# the bad sense — the key simply never leaves the machine running this.
#
#   ./scripts/sign-aab.sh <input.aab> <upload-keystore> <output.aab>
#
# The keystore password is read from the ANDROID_KEYSTORE_PASSWORD environment
# variable, or prompted for, so it stays out of your shell history.
set -euo pipefail

IN=${1:?usage: sign-aab.sh <input.aab> <keystore> <output.aab>}
KEYSTORE=${2:?usage: sign-aab.sh <input.aab> <keystore> <output.aab>}
OUT=${3:?usage: sign-aab.sh <input.aab> <keystore> <output.aab>}
ALIAS=${ANDROID_KEY_ALIAS:-upload}

if [ -z "${ANDROID_KEYSTORE_PASSWORD:-}" ]; then
  read -rsp "Keystore password: " ANDROID_KEYSTORE_PASSWORD
  echo
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp "$IN" "$TMP/work.aab"

# drop whatever signed it before; jarsigner refuses to replace a signature
zip -q -d "$TMP/work.aab" 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/*.DSA' 'META-INF/*.EC' || true

jarsigner -keystore "$KEYSTORE" \
  -storepass "$ANDROID_KEYSTORE_PASSWORD" -keypass "$ANDROID_KEYSTORE_PASSWORD" \
  -sigalg SHA256withRSA -digestalg SHA-256 \
  -signedjar "$OUT" "$TMP/work.aab" "$ALIAS"

# a debug-signed bundle is only rejected after it reaches Play, so check here
if jarsigner -verify -certs "$OUT" | grep -q "Android Debug"; then
  echo "sign-aab: the debug certificate survived — not safe to upload" >&2
  exit 1
fi
jarsigner -verify "$OUT" | grep -q "jar verified" || { echo "sign-aab: verification failed" >&2; exit 1; }

echo "sign-aab: signed $(basename "$OUT") ($(wc -c < "$OUT") bytes) as:"
for f in $(unzip -l "$OUT" 'META-INF/*.RSA' | awk '/META-INF/{print $4}'); do
  unzip -p "$OUT" "$f" | keytool -printcert | grep -E "Owner:|SHA256:"
done
