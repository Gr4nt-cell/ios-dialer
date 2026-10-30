const { withSettingsGradle } = require('@expo/config-plugins');

const MARKER = '// ios-dialer local offline voice models';

module.exports = function withLocalVoiceMaven(config) {
  return withSettingsGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes(MARKER)) return modConfig;

    const managementMatch = /\bdependencyResolutionManagement\s*\{/.exec(contents);
    if (!managementMatch) {
      contents += `

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        mavenCentral()
        ${MARKER}
        maven { url = uri("$rootDir/local-maven") }
    }
}
`;
      modConfig.modResults.contents = contents;
      return modConfig;
    }

    const repositoriesPattern = /\brepositories\s*\{/g;
    repositoriesPattern.lastIndex = managementMatch.index + managementMatch[0].length;
    const repositoriesMatch = repositoriesPattern.exec(contents);
    if (repositoriesMatch) {
      const insertAt = repositoriesMatch.index + repositoriesMatch[0].length;
      contents = `${contents.slice(0, insertAt)}\n        ${MARKER}\n        maven { url = uri("$rootDir/local-maven") }\n${contents.slice(insertAt)}`;
    } else {
      const insertAt = managementMatch.index + managementMatch[0].length;
      const repositoriesMode = /\brepositoriesMode\b/.test(contents)
        ? ''
        : '\n    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)';
      contents = `${contents.slice(0, insertAt)}${repositoriesMode}\n    repositories {\n        google()\n        mavenCentral()\n        ${MARKER}\n        maven { url = uri("$rootDir/local-maven") }\n    }\n${contents.slice(insertAt)}`;
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });
};
