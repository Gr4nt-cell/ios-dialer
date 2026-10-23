# Signed builds — Phone (com.gr4nt.dialer)

Version **1.0.2**, versionCode **171**, built from commit 1bc2e1d (call-waiting glass pill).

Both files are signed with the upload key (CN=Gr4nt, OU=Phone, O=Gr4nt, C=GH,
SHA-256 A4:A9:FD:12:7D:D7:49:62:6D:55:1A:7E:62:A3:B9:F1:1B:04:E7:51:EB:1D:8A:E2:FB:4A:75:21:00:BF:1B:7F).

- `ios-dialer-signed.aab` — upload this to Google Play.
- `ios-dialer-signed.apk` — install directly (APK Signature Scheme v2, zip-aligned).
  Uninstall a debug-signed build first; Android won't update across different signing keys.

Checked by the "Verify signed builds" workflow with the Android SDK's apksigner, zipalign and jarsigner.
