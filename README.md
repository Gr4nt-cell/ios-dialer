# Signed bundle

`ios-dialer.aab` — the Play upload bundle, signed with the upload key.
Only the current build is kept here; earlier bundles were removed.

This branch exists because the build workflow cannot sign (the signing
secrets aren't set on the repository) and the release page cannot be edited
from the session that does the signing, so the bundle is signed locally and
committed here instead.

To upload to Play: download `ios-dialer.aab` and upload it under
**Production → Create new release**. Opt into Play App Signing when asked;
the key here is the *upload* key, which Play replaces with its own app
signing key.

Upload key certificate fingerprint (SHA-256):

    F8:FC:6C:ED:E6:37:59:11:A5:79:EA:6C:13:32:7E:3A:FC:5E:A2:69:5A:26:D9:08:15:D5:BB:41:B4:5B:78:AB
