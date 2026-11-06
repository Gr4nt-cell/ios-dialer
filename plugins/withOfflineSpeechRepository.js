const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// Bundled offline speech repository';
const REPOSITORY = `
${MARKER}
// The app resolves the library's transitive AAR; a library-only repository is insufficient.
allprojects {
  repositories {
    exclusiveContent {
      forRepository {
        maven {
          name = "BundledOfflineSpeech"
          url = uri("$rootDir/../modules/dialer/android/libs/maven")
        }
      }
      filter { includeGroup("com.k2fsa.sherpa") }
    }
  }
}
`;

module.exports = function withOfflineSpeechRepository(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('Offline speech repository requires the Expo Groovy Android template.');
    if (!cfg.modResults.contents.includes(MARKER)) cfg.modResults.contents += '\n' + REPOSITORY;
    return cfg;
  });
};
