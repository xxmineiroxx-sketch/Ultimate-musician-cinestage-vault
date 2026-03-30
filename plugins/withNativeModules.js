/**
 * withNativeModules.js
 * Expo config plugin — copies WatchBridgeModule + WidgetDataModule files
 * into ios/UltimatePlayback/ and ensures the generated iOS project keeps
 * the playback-specific native fixes after every prebuild.
 *
 * The xcodeproj Ruby gem (setup_xcode_targets.rb) still handles adding the
 * Watch/Widget targets and wiring files into the project.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FILES = [
  'WatchBridgeModule.swift',
  'WatchBridgeModule.m',
  'WidgetDataModule.swift',
  'WidgetDataModule.m',
];

const DEBUG_BUNDLE_URL =
  'http://localhost:8082/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&minify=false';

const REACT_NATIVE_XCODE_SCRIPT_OLD =
  `\`"$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'"\``;
const REACT_NATIVE_XCODE_SCRIPT_NEW =
  `"$("$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'")"`;

function replaceOnce(source, search, replacement) {
  return source.includes(search) ? source.replace(search, replacement) : source;
}

function writeIfChanged(filePath, source, label) {
  const original = fs.readFileSync(filePath, 'utf8');
  if (original === source) {
    return;
  }

  fs.writeFileSync(filePath, source);
  console.log(`[withNativeModules] Patched ${label}`);
}

function ensureBridgingHeader(appPath) {
  const headerPath = path.join(appPath, 'UltimatePlayback-Bridging-Header.h');
  if (fs.existsSync(headerPath)) {
    return;
  }

  fs.writeFileSync(
    headerPath,
    [
      '// Auto-generated bridging header',
      '#import <React/RCTBridgeModule.h>',
      '#import <React/RCTEventEmitter.h>',
      '',
    ].join('\n')
  );
  console.log('[withNativeModules] Created bridging header');
}

function patchAppDelegate(iosRoot) {
  const appDelegatePath = path.join(iosRoot, 'UltimatePlayback', 'AppDelegate.swift');
  if (!fs.existsSync(appDelegatePath)) {
    return;
  }

  let source = fs.readFileSync(appDelegatePath, 'utf8');

  if (!source.includes('private let debugBundleURL = URL(')) {
    source = replaceOnce(
      source,
      'import ReactAppDependencyProvider\n\n',
      `import ReactAppDependencyProvider\n\nprivate let debugBundleURL = URL(\n  string: "${DEBUG_BUNDLE_URL}"\n)\n\n`
    );
  }

  if (!source.includes('UserDefaults.standard.set("localhost:8082", forKey: "RCT_jsLocation")')) {
    source = replaceOnce(
      source,
      '  ) -> Bool {\n',
      '  ) -> Bool {\n#if DEBUG\n    UserDefaults.standard.set("localhost:8082", forKey: "RCT_jsLocation")\n    UserDefaults.standard.set("http", forKey: "RCT_packager_scheme")\n#endif\n'
    );
  }

  if (source.includes('bridge.bundleURL ?? bundleURL()')) {
    source = replaceOnce(
      source,
      '    // needed to return the correct URL for expo-dev-client.\n    bridge.bundleURL ?? bundleURL()\n',
      '#if DEBUG\n    return bundleURL()\n#else\n    // needed to return the correct URL for expo-dev-client.\n    return bridge.bundleURL ?? bundleURL()\n#endif\n'
    );
  }

  source = replaceOnce(
    source,
    '    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")',
    '    return debugBundleURL'
  );

  writeIfChanged(appDelegatePath, source, 'AppDelegate.swift');
}

function patchPodfile(iosRoot) {
  const podfilePath = path.join(iosRoot, 'Podfile');
  if (!fs.existsSync(podfilePath)) {
    return;
  }

  let source = fs.readFileSync(podfilePath, 'utf8');
  if (source.includes("metro_port = '8082'")) {
    return;
  }

  source = replaceOnce(
    source,
    `  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
end
`,
    `  post_install do |installer|
    metro_port = '8082'

    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )

    expo_constants_script = File.join(__dir__, '..', 'node_modules', 'expo-constants', 'scripts', 'get-app-config-ios.sh')
    if File.exist?(expo_constants_script)
      script_source = File.read(expo_constants_script)
      patched_source = script_source.gsub(
        'PROJECT_DIR_BASENAME=$(basename $PROJECT_DIR)',
        'PROJECT_DIR_BASENAME=$(basename "$PROJECT_DIR")'
      )

      if patched_source != script_source
        File.write(expo_constants_script, patched_source)
      end
    end

    xcode_env_local = File.join(__dir__, '.xcode.env.local')
    if File.exist?(xcode_env_local)
      File.write(xcode_env_local, <<~SH)
        export NODE_BINARY=$(command -v node)
      SH
    end

    installer.target_installation_results.pod_target_installation_results.each_value do |pod_installation_result|
      pod_installation_result.resource_bundle_targets.each do |resource_bundle_target|
        resource_bundle_target.build_configurations.each do |build_config|
          build_config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
          build_config.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
        end
      end
    end

    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        build_config.build_settings['RCT_METRO_PORT'] = metro_port
      end

      target.shell_script_build_phases.each do |phase|
        script = phase.shell_script.to_s
        next unless script.start_with?('bash -l -c "$PODS_TARGET_SRCROOT/../scripts/')

        phase.shell_script = script.sub(
          'bash -l -c "$PODS_TARGET_SRCROOT/../scripts/',
          'bash -l "$PODS_TARGET_SRCROOT/../scripts/'
        )
      end
    end

    installer.aggregate_targets.each do |aggregate_target|
      user_project = aggregate_target.user_project
      app_target = user_project.native_targets.find { |target| target.name == 'UltimatePlayback' }
      development_team = app_target&.build_configurations
        &.map { |build_config| build_config.build_settings['DEVELOPMENT_TEAM'] }
        &.find { |value| value && !value.empty? }

      user_project.native_targets.each do |target|
        next unless ['UltimatePlayback', 'UltimatePlaybackWatch', 'UltimatePlaybackWidget'].include?(target.name)

        target.build_configurations.each do |build_config|
          build_config.build_settings['RCT_METRO_PORT'] = metro_port
          build_config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
          build_config.build_settings['DEVELOPMENT_TEAM'] = development_team if development_team
        end
      end

      user_project.save
    end

    installer.pods_project.save
  end
end
`
  );

  writeIfChanged(podfilePath, source, 'Podfile');
}

function patchXcodeProject(iosRoot) {
  const xcodeProjectPath = path.join(iosRoot, 'UltimatePlayback.xcodeproj', 'project.pbxproj');
  if (!fs.existsSync(xcodeProjectPath)) {
    return;
  }

  const source = replaceOnce(
    fs.readFileSync(xcodeProjectPath, 'utf8'),
    REACT_NATIVE_XCODE_SCRIPT_OLD,
    REACT_NATIVE_XCODE_SCRIPT_NEW
  );

  writeIfChanged(xcodeProjectPath, source, 'project.pbxproj');
}

function syncNativeTargets(projectRoot) {
  const setupScriptPath = path.join(projectRoot, 'scripts', 'setup_xcode_targets.rb');
  if (!fs.existsSync(setupScriptPath)) {
    return;
  }

  execFileSync('ruby', [setupScriptPath], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  console.log('[withNativeModules] Synced native watch/widget targets');
}

const plugin = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const src = path.join(cfg.modRequest.projectRoot, 'native', 'RN');
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const appPath = path.join(iosRoot, 'UltimatePlayback');

      for (const file of FILES) {
        const from = path.join(src, file);
        const to = path.join(appPath, file);
        if (fs.existsSync(from) && !fs.existsSync(to)) {
          fs.copyFileSync(from, to);
          console.log('[withNativeModules] Copied:', file);
        }
      }

      ensureBridgingHeader(appPath);
      patchAppDelegate(iosRoot);
      patchPodfile(iosRoot);
      patchXcodeProject(iosRoot);
      syncNativeTargets(projectRoot);

      return cfg;
    },
  ]);

module.exports = plugin;
