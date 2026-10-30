const { withProjectBuildGradle } = require('@expo/config-plugins');

const MARKER = '// ios-dialer local offline voice models';

module.exports = function withLocalVoiceMaven(config) {
  return withProjectBuildGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (contents.includes(MARKER)) return modConfig;

    const repositoriesBlock = /\ballprojects\s*\{\s*repositories\s*\{/m.exec(contents);
    if (repositoriesBlock) {
      const insertAt = repositoriesBlock.index + repositoriesBlock[0].length;
      contents = `${contents.slice(0, insertAt)}\n        ${MARKER}\n        maven { url = uri("$rootDir/local-maven") }\n${contents.slice(insertAt)}`;
    } else {
      contents += `

allprojects {
    repositories {
        ${MARKER}
        maven { url = uri("$rootDir/local-maven") }
    }
}
`;
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });
};
