// Patch console.error before Expo modules initialize to suppress
// known false-alarm errors in Expo Go SDK 54 on iOS 26 simulators.
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

const { default: registerRootComponent } = require('expo/src/launch/registerRootComponent');
const { default: App } = require('./App');
registerRootComponent(App);
