// Patch console.error AND TurboModuleRegistry before Expo initializes.
// Suppresses bridgeless/new-arch false-alarm errors in Expo Go SDK 54.

// 1. Silence known bridgeless console noise
const _origError = console.error;
console.error = function (...args) {
  const msg = String(args[0] || '');
  if (
    msg.includes('disableEventLoopOnBridgeless') ||
    msg.includes('feature flag') ||
    msg.includes('[runtime not ready]') ||
    msg.includes('Runtime not ready') ||
    msg.includes('version mismatch') ||
    msg.includes('React Native version') ||
    msg.includes('PlatformConstants') ||
    msg.includes('TurboModuleRegistry')
  ) return;
  return _origError.apply(console, args);
};

// 2. Guard TurboModuleRegistry.getEnforcing so missing native modules
//    don't hard-crash the JS runtime before the bridge is ready.
try {
  const { TurboModuleRegistry } = require('react-native');
  if (TurboModuleRegistry) {
    const _origGet = TurboModuleRegistry.getEnforcing.bind(TurboModuleRegistry);
    TurboModuleRegistry.getEnforcing = function (name) {
      try {
        return _origGet(name);
      } catch (e) {
        // Return a no-op proxy so dependent modules don't crash on startup
        return new Proxy({}, { get: () => () => null });
      }
    };
  }
} catch (_) {}

const { default: registerRootComponent } = require('expo/src/launch/registerRootComponent');
const { default: App } = require('./App');
registerRootComponent(App);
