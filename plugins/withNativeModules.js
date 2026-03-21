/**
 * withNativeModules.js
 * Expo config plugin — copies WatchBridgeModule + WidgetDataModule files
 * into ios/UltimatePlayback/ and ensures the bridging header exists.
 *
 * The xcodeproj Ruby gem (setup_xcode_targets.rb) handles adding these
 * to the pbxproj and creating Watch/Widget targets.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

const FILES = [
  'WatchBridgeModule.swift',
  'WatchBridgeModule.m',
  'WidgetDataModule.swift',
  'WidgetDataModule.m',
];

const plugin = (config) => {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const src  = path.join(cfg.modRequest.projectRoot, 'native', 'RN');
      const dest = path.join(cfg.modRequest.platformProjectRoot, 'UltimatePlayback');

      for (const file of FILES) {
        const from = path.join(src,  file);
        const to   = path.join(dest, file);
        if (fs.existsSync(from) && !fs.existsSync(to)) {
          fs.copyFileSync(from, to);
          console.log('[withNativeModules] Copied:', file);
        }
      }

      // Ensure bridging header exists
      const bh = path.join(dest, 'UltimatePlayback-Bridging-Header.h');
      if (!fs.existsSync(bh)) {
        fs.writeFileSync(bh, [
          '// Auto-generated bridging header',
          '#import <React/RCTBridgeModule.h>',
          '#import <React/RCTEventEmitter.h>',
          '',
        ].join('\n'));
        console.log('[withNativeModules] Created bridging header');
      }

      return cfg;
    },
  ]);

  return config;
};

module.exports = plugin;
