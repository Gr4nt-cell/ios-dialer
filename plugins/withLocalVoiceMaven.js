const { withSettingsGradle } = require('@expo/config-plugins');

const MARKER = '// ios-dialer local offline voice models';

module.exports = function withLocalVoiceMaven(config) {
  return withSettingsGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes(MARKER)) return modConfig;

    const managementStart = contents.indexOf('dependencyResolutionManagement');
    const repositoriesStart = contents.indexOf('repositories {', managementStart);
    if (managementStart < 0 || repositoriesStart < 0) {
      throw new Error('Could not add the local voice repository to dependencyResolutionManagement.');
    }

    const insertAt = repositoriesStart + 'repositories {'.length;
    contents = `${contents.slice(0, insertAt)}\n        ${MARKER}\n        maven { url = uri("$rootDir/local-maven") }\n${contents.slice(insertAt)}`;
    modConfig.modResults.contents = contents;
    return modConfig;
  });
};
