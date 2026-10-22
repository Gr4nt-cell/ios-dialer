# Phone — iOS-style dialer for Android (Expo)

An Android phone app with an iOS-inspired look that can replace your phone's
default dialer: floating tab bar, large titles, round keypad, its own full-screen
call screen, light and dark mode (follows the system, or force either in
Settings › Appearance).

## Features

**Liquid Glass look**
- Glass material throughout: real background blur behind the floating tab bar
  and search button, translucent fills, bright top highlights and darker lower
  edges on buttons, keypad keys, search fields, segmented controls and sheets.
- Floating capsule tab bar with a glass "lens" that slides and bulges between tabs.
- **Unified layout** (default): Calls (favorites row + recents, with a filter for
  Missed / Voicemail / Unknown callers), Contacts, Keypad, and a round Search button.
  **Classic layout**: Favorites, Recents, Contacts, Keypad, Voicemail.
- Settings › Appearance: switch layout, and choose **Clear** or **Tinted** glass.
- Call screen: the caller's photo blurred full-screen behind glass controls.

**Default phone app**
- Asks Android for the phone-app role (banner on the Keypad, or Settings ›
  Default Phone App). Once set, every call — incoming and outgoing, from any app —
  uses this app's call screen.
- Incoming calls: full-screen over the lock screen, or a heads-up notification with
  Answer / Decline. Ringtone and vibration come from your system settings.
- Ongoing-call notification with a live timer and Hang up.

**Call screen**
- Accept, Decline, reply with a quick text message.
- Mute, keypad (touch tones for menus), speaker / Bluetooth / headphones, hold,
  add call, contacts, end.
- Call waiting: End & Accept, Decline, Hold & Accept.
- Two calls: swap between them or merge into a conference.
- Dual SIM: picks a SIM when your phone is set to "ask every time".
- Screen turns off when the phone is at your ear.
- Asks before sending tones after a wait (`;`) in a number.
- Tap the chevron to use the rest of the app mid-call; tap the green pill to return.

**USSD and codes**
- `*124#`, `*170#`, `#100#` … run straight from the keypad. The network's reply
  shows in the app, with a SIM switch on dual-SIM phones.
- Menus that need a reply open in the network's own dialog (tap *Reply to Menu*).
  Turn off *Show Replies in App* in Settings to always use that dialog.
- `*#*#4636#*#*`-style service codes work while Phone is the default.

**Everything from before**
- Keypad with dial tones, haptics, T9 contact suggestions, `+` / pause / wait on
  long-press, paste, redial.
- Recents from the system call history, grouped, All/Missed, missed badge, delete.
- Contacts with A–Z index, search, create, edit, delete; contact cards.
- Favorites, voicemail, number blocking (applies to the whole phone while Phone
  is the default), opens from `tel:` links.

## Build the APK without a computer (GitHub)

1. Create a GitHub repository and upload this project's files.
2. In the repo: **Settings › Secrets and variables › Actions › New repository secret**,
   name `EXPO_TOKEN`, value: an access token from expo.dev › Account settings ›
   Access tokens.
3. **Actions › Build APK › Run workflow.** When it finishes, the download link is in
   the log and under your project on expo.dev.

## Build and install

Needs Node 20+ and an Android phone (Android 8 or later for USSD replies in the app).

```bash
npm install
npx expo install --fix      # aligns every package to your Expo SDK version
npm install -g eas-cli
eas login
eas build -p android --profile preview      # installable APK
```

Install the APK from the link EAS gives you, open Phone, and tap **Set Default**.
(Local alternative with Android Studio installed: `npx expo run:android`.)

The project has two small native modules in `modules/`, so it needs this build —
it can't run inside Expo Go.

Before publishing, change `android.package` in `app.json` to your own id.

## Testing calls on an emulator

Set Phone as default inside the emulator, then from the emulator's
*Extended controls › Phone* (or `adb emu gsm call 0241234567`) simulate an
incoming call.

## Good to know

- Android only shows the IMEI to system apps, so `*#06#` points you to
  Settings › About phone.
- Google Play allows call-log and phone permissions only for apps that are the
  default dialer — this app qualifies once it's set as default, but you'll need
  to fill in Play's permissions declaration form.

## Google Play requirements (checked on every build)

Both GitHub builds (APK on every push, AAB on demand) run `scripts/play-check.js` after
compiling. The build **fails** if the app would be flagged by Play, and the report is published
next to the downloads as `play-check.txt` (and on each run's summary page):

| Requirement | How it's met | Checked |
| --- | --- | --- |
| Target SDK ≥ Play's minimum (35; 36 next) | Expo SDK default | fail below 35, warn below 36 |
| Code obfuscation ≥ 25% ("DEX code optimisation") | R8 on, via `plugins/withReleaseOptimizations.js` | fail below 25% |
| No orientation / resize restrictions (Android 16 large screens) | `"orientation": "default"`; phones lock portrait at runtime | fail on fixed orientation |
| Build number always increases | `versionCode` = 100 + commit count (`app.config.js`) | fail if ≤ 1 |
| No advertising ID | no ad / analytics SDKs | warn if present |
| No internet (privacy policy promise) | `blockedPermissions` in app.json | warn if present |
| Edge-to-edge | `edgeToEdgeEnabled`; app code avoids deprecated window calls | info only — remaining calls are inside React Native / AndroidX |

To use the same checks in another Expo / React Native app, copy `scripts/play-check.js`,
`plugins/withReleaseOptimizations.js`, `app.config.js` and the "Set the build number" and
"Google Play readiness check" steps from `.github/workflows/`.

When Google raises a requirement (usually the target SDK each August), update `MIN_TARGET_SDK` /
`NEXT_TARGET_SDK` at the top of `scripts/play-check.js`, and the Expo SDK if needed.
