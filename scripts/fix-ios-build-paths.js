#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const reactCoreHeaderCandidates = [
  path.join('React.xcframework', 'ios-arm64', 'React.framework', 'Headers'),
  path.join(
    'React.xcframework',
    'ios-arm64_x86_64-simulator',
    'React.framework',
    'Headers'
  ),
  path.join(
    'React.xcframework',
    'ios-arm64_x86_64-maccatalyst',
    'React.framework',
    'Headers'
  ),
];

function updateFile(relativePath, transform) {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const updated = transform(original);

  if (updated !== original) {
    fs.writeFileSync(filePath, updated);
    console.log(`[fix-ios-build-paths] Patched ${relativePath}`);
  }
}

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Could not find ${label}`);
  }

  return source.replace(search, replacement);
}

function ensureReactCoreHeadersSymlink(reactCoreRoot) {
  const headersTarget = reactCoreHeaderCandidates
    .map((relativePath) => path.join(reactCoreRoot, relativePath))
    .find((candidate) => fs.existsSync(candidate));

  if (!headersTarget) {
    return;
  }

  const headersPath = path.join(reactCoreRoot, 'React.xcframework', 'Headers');

  try {
    const stats = fs.lstatSync(headersPath);
    if (stats.isSymbolicLink()) {
      const currentTarget = path.resolve(
        path.dirname(headersPath),
        fs.readlinkSync(headersPath)
      );
      if (currentTarget === headersTarget) {
        return;
      }
    }
  } catch (error) {
    // Fall through and rebuild the header link.
  }

  fs.rmSync(headersPath, { force: true, recursive: true });
  fs.symlinkSync(
    path.relative(path.dirname(headersPath), headersTarget),
    headersPath,
    'dir'
  );
  console.log(
    `[fix-ios-build-paths] Rebuilt ${path.relative(projectRoot, headersPath)}`
  );
}

function ensureReactNativeDependenciesHeaders(reactDependenciesRoot) {
  const headersTarget = path.join(
    reactDependenciesRoot,
    'framework',
    'packages',
    'react-native',
    'ReactNativeDependencies.xcframework',
    'Headers'
  );

  if (!fs.existsSync(headersTarget)) {
    return;
  }

  const headersPath = path.join(reactDependenciesRoot, 'Headers');

  try {
    const stats = fs.lstatSync(headersPath);
    if (stats.isSymbolicLink()) {
      const currentTarget = path.resolve(
        path.dirname(headersPath),
        fs.readlinkSync(headersPath)
      );
      if (currentTarget === headersTarget) {
        return;
      }
    }
  } catch (error) {
    // Fall through and rebuild the header link.
  }

  fs.rmSync(headersPath, { force: true, recursive: true });
  fs.symlinkSync(
    path.relative(path.dirname(headersPath), headersTarget),
    headersPath,
    'dir'
  );
  console.log(
    `[fix-ios-build-paths] Rebuilt ${path.relative(projectRoot, headersPath)}`
  );
}

function ensureReactNativeDependenciesNamespaces(reactDependenciesRoot) {
  const headersPath = path.join(reactDependenciesRoot, 'Headers');

  if (!fs.existsSync(headersPath)) {
    return;
  }

  const headerEntries = fs
    .readdirSync(headersPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name);

  for (const entry of headerEntries) {
    const namespacePath = path.join(reactDependenciesRoot, entry);
    const namespaceTarget = path.join(headersPath, entry);

    try {
      const stats = fs.lstatSync(namespacePath);

      if (stats.isSymbolicLink()) {
        const currentTarget = path.resolve(
          path.dirname(namespacePath),
          fs.readlinkSync(namespacePath)
        );

        if (currentTarget === namespaceTarget) {
          continue;
        }
      }

      fs.rmSync(namespacePath, { force: true, recursive: true });
    } catch (error) {
      // Fall through and rebuild the namespace link.
    }

    fs.symlinkSync(
      path.relative(path.dirname(namespacePath), namespaceTarget),
      namespacePath,
      'dir'
    );
    console.log(
      `[fix-ios-build-paths] Rebuilt ${path.relative(projectRoot, namespacePath)}`
    );
  }
}

function ensurePublicReactNativeDependencyNamespaces(reactDependenciesRoot) {
  const headersPath = path.join(reactDependenciesRoot, 'Headers');
  const publicHeadersRoot = path.join(projectRoot, 'ios', 'Pods', 'Headers', 'Public');

  if (!fs.existsSync(headersPath) || !fs.existsSync(publicHeadersRoot)) {
    return;
  }

  const headerEntries = fs
    .readdirSync(headersPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name);

  for (const entry of headerEntries) {
    const namespacePath = path.join(publicHeadersRoot, entry);
    const namespaceTarget = path.join(headersPath, entry);

    try {
      const stats = fs.lstatSync(namespacePath);

      if (stats.isSymbolicLink()) {
        const currentTarget = path.resolve(
          path.dirname(namespacePath),
          fs.readlinkSync(namespacePath)
        );

        if (currentTarget === namespaceTarget) {
          continue;
        }
      }

      if (stats.isDirectory()) {
        continue;
      }

      fs.rmSync(namespacePath, { force: true, recursive: true });
    } catch (error) {
      // Fall through and rebuild the public namespace link.
    }

    if (fs.existsSync(namespacePath)) {
      continue;
    }

    fs.symlinkSync(
      path.relative(path.dirname(namespacePath), namespaceTarget),
      namespacePath,
      'dir'
    );
    console.log(
      `[fix-ios-build-paths] Rebuilt ${path.relative(projectRoot, namespacePath)}`
    );
  }
}

function patchPodsShellScriptPhase(relativePath) {
  updateFile(relativePath, (source) => {
    return source
      .replaceAll(
        'bash -l -c \\"$PODS_TARGET_SRCROOT/../scripts/',
        'bash -l \\"$PODS_TARGET_SRCROOT/../scripts/'
      )
      .replaceAll(
        'bash -l -c "$PODS_TARGET_SRCROOT/../scripts/',
        'bash -l "$PODS_TARGET_SRCROOT/../scripts/'
      );
  });
}

function patchReactNativeBundleScriptPhase(relativePath) {
  updateFile(relativePath, (source) => {
    return source.replaceAll(
      '`\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\"`',
      'RN_XCODE_SCRIPT=\\"$(\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\")\\"\\n/bin/sh \\"$RN_XCODE_SCRIPT\\"'
    );
  });
}

updateFile('node_modules/expo-constants/scripts/get-app-config-ios.sh', (source) => {
  if (source.includes('PROJECT_DIR_BASENAME=$(basename "$PROJECT_DIR")')) {
    return source;
  }

  return replaceOnce(
    source,
    'PROJECT_DIR_BASENAME=$(basename $PROJECT_DIR)',
    'PROJECT_DIR_BASENAME=$(basename "$PROJECT_DIR")',
    'quoted PROJECT_DIR basename lookup'
  );
});

updateFile('node_modules/expo/ios/AppDelegates/RCTAppDelegateUmbrella.h', (source) => {
  const currentImportBlock = [
    '#if __has_include(<React_RCTAppDelegate/React-RCTAppDelegate-umbrella.h>)',
    '#import <React_RCTAppDelegate/React-RCTAppDelegate-umbrella.h>',
    '#else',
    '#import <React_RCTAppDelegate/React_RCTAppDelegate-umbrella.h>',
    '#endif',
  ].join('\n');

  const previousPatchedImportBlock = [
    '#if __has_include(<React-Core-prebuilt/React_RCTAppDelegate/React_RCTAppDelegate-umbrella.h>)',
    '#import <React-Core-prebuilt/React_RCTAppDelegate/React_RCTAppDelegate-umbrella.h>',
    '#elif __has_include(<React_RCTAppDelegate/React-RCTAppDelegate-umbrella.h>)',
    '#import <React_RCTAppDelegate/React-RCTAppDelegate-umbrella.h>',
    '#else',
    '#import <React_RCTAppDelegate/React_RCTAppDelegate-umbrella.h>',
    '#endif',
  ].join('\n');

  const patchedImportBlock = [
    '#import <React-RCTAppDelegate/RCTAppDelegate.h>',
    '#import <React-RCTAppDelegate/RCTAppSetupUtils.h>',
    '#import <React-RCTAppDelegate/RCTArchConfiguratorProtocol.h>',
    '#import <React-RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>',
    '#import <React-RCTAppDelegate/RCTDependencyProvider.h>',
    '#import <React-RCTAppDelegate/RCTJSRuntimeConfiguratorProtocol.h>',
    '#import <React-RCTAppDelegate/RCTReactNativeFactory.h>',
    '#import <React-RCTAppDelegate/RCTRootViewFactory.h>',
    '#import <React-RCTAppDelegate/RCTUIConfiguratorProtocol.h>',
  ].join('\n');

  if (source.includes(patchedImportBlock)) {
    return source;
  }

  if (source.includes(previousPatchedImportBlock)) {
    return replaceOnce(
      source,
      previousPatchedImportBlock,
      patchedImportBlock,
      'previous Expo RCTAppDelegate umbrella import block'
    );
  }

  return replaceOnce(
    source,
    currentImportBlock,
    patchedImportBlock,
    'Expo RCTAppDelegate umbrella import block'
  );
});

updateFile('node_modules/react-native/scripts/replace-rncore-version.js', (source) => {
  let updated = source;
  const replaceIfNeeded = (transformedSnippet, search, replacement, label) => {
    if (updated.includes(transformedSnippet)) {
      return;
    }

    updated = replaceOnce(updated, search, replacement, label);
  };

  if (!updated.includes("const path = require('path');")) {
    updated = replaceOnce(
      updated,
      "const fs = require('fs');\n",
      "const fs = require('fs');\nconst path = require('path');\n",
      'path import for RN core patch'
    );
  }

  if (!updated.includes('function getFinalLocation(podsRoot')) {
    updated = replaceOnce(
      updated,
      "const LAST_BUILD_FILENAME = 'React-Core-prebuilt/.last_build_configuration';\n",
      [
        'function getLastBuildFilename(podsRoot /*: string */) {',
        "  return path.join(podsRoot, 'React-Core-prebuilt', '.last_build_configuration');",
        '}',
        '',
        'function getFinalLocation(podsRoot /*: string */) {',
        "  return path.join(podsRoot, 'React-Core-prebuilt');",
        '}',
        '',
        'function getHeadersPath(finalLocation /*: string */) {',
        "  return path.join(finalLocation, 'React.xcframework', 'Headers');",
        '}',
        '',
        'function getHeadersSource(finalLocation /*: string */) {',
        '  const sliceCandidates = [',
        "    path.join(finalLocation, 'React.xcframework', 'ios-arm64', 'React.framework', 'Headers'),",
        "    path.join(finalLocation, 'React.xcframework', 'ios-arm64_x86_64-simulator', 'React.framework', 'Headers'),",
        "    path.join(finalLocation, 'React.xcframework', 'ios-arm64_x86_64-maccatalyst', 'React.framework', 'Headers'),",
        '  ];',
        '',
        '  return sliceCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;',
        '}',
        '',
        'function syncHeadersDirectory(finalLocation /*: string */) {',
        '  const headersSource = getHeadersSource(finalLocation);',
        '',
        '  if (headersSource == null) {',
        "    throw new Error(`Could not find React.xcframework headers inside ${finalLocation}`);",
        '  }',
        '',
        '  const headersPath = getHeadersPath(finalLocation);',
        "  fs.rmSync(headersPath, {force: true, recursive: true});",
        "  fs.symlinkSync(path.relative(path.dirname(headersPath), headersSource), headersPath, 'dir');",
        '}',
        '',
      ].join('\n'),
      'RN core path helpers'
    );
  }

  replaceIfNeeded(
    'function shouldReplaceRnCoreConfiguration(configuration /*: string */, podsRoot /*: string */) {',
    'function shouldReplaceRnCoreConfiguration(configuration /*: string */) {',
    'function shouldReplaceRnCoreConfiguration(configuration /*: string */, podsRoot /*: string */) {',
    'podsRoot-aware shouldReplaceRnCoreConfiguration signature'
  );

  replaceIfNeeded(
    '  const lastBuildFilename = getLastBuildFilename(podsRoot);\n' +
      '  const fileExists = fs.existsSync(lastBuildFilename);\n',
    '  const fileExists = fs.existsSync(LAST_BUILD_FILENAME);\n',
    [
      '  const lastBuildFilename = getLastBuildFilename(podsRoot);',
      '  const fileExists = fs.existsSync(lastBuildFilename);',
    ].join('\n') + '\n',
    'absolute RN core last build lookup'
  );

  replaceIfNeeded(
    '    console.log(`Found ${lastBuildFilename} file`);\n',
    '    console.log(`Found ${LAST_BUILD_FILENAME} file`);\n',
    '    console.log(`Found ${lastBuildFilename} file`);\n',
    'RN core last build filename log'
  );

  replaceIfNeeded(
    '    const oldConfiguration = fs.readFileSync(lastBuildFilename).toString();\n',
    '    const oldConfiguration = fs.readFileSync(LAST_BUILD_FILENAME).toString();\n',
    '    const oldConfiguration = fs.readFileSync(lastBuildFilename).toString();\n',
    'absolute RN core last build read'
  );

  replaceIfNeeded(
    '  const finalLocation = getFinalLocation(podsRoot);\n',
    "  const finalLocation = 'React-Core-prebuilt';\n",
    '  const finalLocation = getFinalLocation(podsRoot);\n',
    'absolute RN core final location'
  );

  replaceIfNeeded(
    "  syncHeadersDirectory(finalLocation);\n",
    "  spawnSync('tar', ['-xf', tarballURLPath, '-C', finalLocation], {\n    stdio: 'inherit',\n  });\n",
    "  spawnSync('tar', ['-xf', tarballURLPath, '-C', finalLocation], {\n    stdio: 'inherit',\n  });\n  syncHeadersDirectory(finalLocation);\n",
    'RN core headers sync after extraction'
  );

  replaceIfNeeded(
    'function updateLastBuildConfiguration(configuration /*: string */, podsRoot /*: string */) {',
    'function updateLastBuildConfiguration(configuration /*: string */) {',
    'function updateLastBuildConfiguration(configuration /*: string */, podsRoot /*: string */) {',
    'podsRoot-aware updateLastBuildConfiguration signature'
  );

  replaceIfNeeded(
    '  const lastBuildFilename = getLastBuildFilename(podsRoot);\n' +
      '  console.log(`Updating ${lastBuildFilename} with ${configuration}`);\n',
    '  console.log(`Updating ${LAST_BUILD_FILENAME} with ${configuration}`);\n',
    [
      '  const lastBuildFilename = getLastBuildFilename(podsRoot);',
      '  console.log(`Updating ${lastBuildFilename} with ${configuration}`);',
    ].join('\n') + '\n',
    'absolute RN core last build update log'
  );

  replaceIfNeeded(
    '  fs.writeFileSync(lastBuildFilename, configuration);\n',
    '  fs.writeFileSync(LAST_BUILD_FILENAME, configuration);\n',
    '  fs.writeFileSync(lastBuildFilename, configuration);\n',
    'absolute RN core last build write'
  );

  replaceIfNeeded(
    '  if (!shouldReplaceRnCoreConfiguration(configuration, podsRoot)) {\n',
    '  if (!shouldReplaceRnCoreConfiguration(configuration)) {\n',
    '  if (!shouldReplaceRnCoreConfiguration(configuration, podsRoot)) {\n',
    'podsRoot-aware RN core shouldReplace call'
  );

  replaceIfNeeded(
    '  updateLastBuildConfiguration(configuration, podsRoot);\n',
    '  updateLastBuildConfiguration(configuration);\n',
    '  updateLastBuildConfiguration(configuration, podsRoot);\n',
    'podsRoot-aware RN core updateLastBuild call'
  );

  return updated;
});

updateFile(
  'node_modules/react-native/third-party-podspecs/replace_dependencies_version.js',
  (source) => {
    let updated = source;
    const replaceIfNeeded = (transformedSnippet, search, replacement, label) => {
      if (updated.includes(transformedSnippet)) {
        return;
      }

      updated = replaceOnce(updated, search, replacement, label);
    };

    if (!updated.includes("const path = require('path');")) {
      updated = replaceOnce(
        updated,
        "const fs = require('fs');\n",
        "const fs = require('fs');\nconst path = require('path');\n",
        "path import for RN dependency patch"
      );
    }

    if (!updated.includes('function getLastBuildFilename(podsRoot')) {
      updated = replaceOnce(
        updated,
        "const LAST_BUILD_FILENAME = 'ReactNativeDependencies/.last_build_configuration';\n",
        [
          'function getLastBuildFilename(podsRoot /*: string */) {',
          "  return path.join(podsRoot, 'ReactNativeDependencies', '.last_build_configuration');",
          '}',
          '',
        ].join('\n'),
        'absolute last build filename helper'
      );
    }

    replaceIfNeeded(
      'function shouldReplaceRnDepsConfiguration(configuration /*: string */, podsRoot /*: string */) {',
      'function shouldReplaceRnDepsConfiguration(configuration /*: string */) {',
      'function shouldReplaceRnDepsConfiguration(configuration /*: string */, podsRoot /*: string */) {',
      'podsRoot-aware shouldReplaceRnDepsConfiguration signature'
    );

    replaceIfNeeded(
      '  const lastBuildFilename = getLastBuildFilename(podsRoot);\n' +
        '  const fileExists = fs.existsSync(lastBuildFilename);\n',
      "  const fileExists = fs.existsSync(LAST_BUILD_FILENAME);\n",
      [
        '  const lastBuildFilename = getLastBuildFilename(podsRoot);',
        '  const fileExists = fs.existsSync(lastBuildFilename);',
      ].join('\n') + '\n',
      'absolute last build lookup'
    );

    replaceIfNeeded(
      '    console.log(`Found ${lastBuildFilename} file`);\n',
      '    console.log(`Found ${LAST_BUILD_FILENAME} file`);\n',
      '    console.log(`Found ${lastBuildFilename} file`);\n',
      'last build filename log'
    );

    replaceIfNeeded(
      '    const oldConfiguration = fs.readFileSync(lastBuildFilename).toString();\n',
      '    const oldConfiguration = fs.readFileSync(LAST_BUILD_FILENAME).toString();\n',
      '    const oldConfiguration = fs.readFileSync(lastBuildFilename).toString();\n',
      'absolute last build read'
    );

    replaceIfNeeded(
      "  const finalLocation = path.join(podsRoot, 'ReactNativeDependencies', 'framework');\n",
      "  const finalLocation = 'ReactNativeDependencies/framework';\n",
      "  const finalLocation = path.join(podsRoot, 'ReactNativeDependencies', 'framework');\n",
      'absolute RN dependency extraction path'
    );

    replaceIfNeeded(
      'function updateLastBuildConfiguration(configuration /*: string */, podsRoot /*: string */) {',
      'function updateLastBuildConfiguration(configuration /*: string */) {',
      'function updateLastBuildConfiguration(configuration /*: string */, podsRoot /*: string */) {',
      'podsRoot-aware updateLastBuildConfiguration signature'
    );

    replaceIfNeeded(
      '  const lastBuildFilename = getLastBuildFilename(podsRoot);\n' +
        '  console.log(`Updating ${lastBuildFilename} with ${configuration}`);\n',
      '  console.log(`Updating ${LAST_BUILD_FILENAME} with ${configuration}`);\n',
      [
        '  const lastBuildFilename = getLastBuildFilename(podsRoot);',
        '  console.log(`Updating ${lastBuildFilename} with ${configuration}`);',
      ].join('\n') + '\n',
      'absolute last build update log'
    );

    replaceIfNeeded(
      '  fs.writeFileSync(lastBuildFilename, configuration);\n',
      '  fs.writeFileSync(LAST_BUILD_FILENAME, configuration);\n',
      '  fs.writeFileSync(lastBuildFilename, configuration);\n',
      'absolute last build write'
    );

    replaceIfNeeded(
      '  if (!shouldReplaceRnDepsConfiguration(configuration, podsRoot)) {\n',
      '  if (!shouldReplaceRnDepsConfiguration(configuration)) {\n',
      '  if (!shouldReplaceRnDepsConfiguration(configuration, podsRoot)) {\n',
      'podsRoot-aware shouldReplace call'
    );

    replaceIfNeeded(
      '  updateLastBuildConfiguration(configuration, podsRoot);\n',
      '  updateLastBuildConfiguration(configuration);\n',
      '  updateLastBuildConfiguration(configuration, podsRoot);\n',
      'podsRoot-aware updateLastBuild call'
    );

    return updated;
  }
);

const xcodeEnvLocalPath = path.join(projectRoot, 'ios', '.xcode.env.local');
if (fs.existsSync(xcodeEnvLocalPath)) {
  const normalized = 'export NODE_BINARY=$(command -v node)\n';
  if (fs.readFileSync(xcodeEnvLocalPath, 'utf8') !== normalized) {
    fs.writeFileSync(xcodeEnvLocalPath, normalized);
    console.log('[fix-ios-build-paths] Normalized ios/.xcode.env.local');
  }
}

ensureReactCoreHeadersSymlink(
  path.join(projectRoot, 'ios', 'Pods', 'React-Core-prebuilt')
);
ensureReactNativeDependenciesHeaders(
  path.join(projectRoot, 'ios', 'Pods', 'ReactNativeDependencies')
);
ensureReactNativeDependenciesNamespaces(
  path.join(projectRoot, 'ios', 'Pods', 'ReactNativeDependencies')
);
ensurePublicReactNativeDependencyNamespaces(
  path.join(projectRoot, 'ios', 'Pods', 'ReactNativeDependencies')
);
patchPodsShellScriptPhase('ios/Pods/Local Podspecs/EXConstants.podspec.json');
patchPodsShellScriptPhase('ios/Pods/Pods.xcodeproj/project.pbxproj');
patchReactNativeBundleScriptPhase('ios/UltimatePlayback.xcodeproj/project.pbxproj');
