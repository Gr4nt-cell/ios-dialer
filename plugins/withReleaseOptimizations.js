// Release builds: shrink and obfuscate the code with R8 (Play flags apps under 25% obfuscation).
// Resource shrinking stays off: React Native looks up bundled images and sounds by name at
// runtime, which the resource shrinker can't see. The app's own native modules are kept by name
// because Expo finds them by class name at runtime.
const fs = require('fs');
const path = require('path');
const { withGradleProperties, withDangerousMod } = require('expo/config-plugins');

const RULES = `
# --- added by plugins/withReleaseOptimizations.js ---
# The app's own Expo modules, services and receivers (looked up by name)
-keep class expo.modules.dialer.** { *; }
-keep class expo.modules.calllog.** { *; }
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, Exceptions
# Expo modules read Kotlin metadata for argument types
-keep class kotlin.Metadata { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keep class * implements expo.modules.kotlin.records.Record { *; }
-dontwarn expo.modules.**
-dontwarn com.google.mlkit.**
`;

function setProp(props, key, value) {
  const existing = props.find((p) => p.type === 'property' && p.key === key);
  if (existing) existing.value = value;
  else props.push({ type: 'property', key, value });
}

module.exports = function withReleaseOptimizations(config) {
  config = withGradleProperties(config, (cfg) => {
    setProp(cfg.modResults, 'android.enableProguardInReleaseBuilds', 'true');
    // older template property names, harmless if unused
    setProp(cfg.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    return cfg;
  });
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes('withReleaseOptimizations')) fs.writeFileSync(file, current + '\n' + RULES);
      return cfg;
    },
  ]);
  return config;
};
