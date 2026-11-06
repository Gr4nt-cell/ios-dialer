const { withProjectBuildGradle } = require('expo/config-plugins');

const REPOSITORY = 'modules/dialer/android/libs/maven';

module.exports = function withOfflineTtsRepository(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const { contents } = cfg.modResults;
    if (contents.includes(REPOSITORY)) return cfg;

    const repositoriesBlock = /allprojects\s*\{\s*repositories\s*\{/;
    if (!repositoriesBlock.test(contents)) {
      throw new Error('Could not add the bundled offline speech Maven repository to android/build.gradle.');
    }

    cfg.modResults.contents = contents.replace(
      repositoriesBlock,
      (block) => `${block}\n    maven { url uri("$rootDir/../${REPOSITORY}") }`
    );
    return cfg;
  });
};
