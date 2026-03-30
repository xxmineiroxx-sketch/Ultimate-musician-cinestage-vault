// Patch console.error before Expo modules initialize to suppress
// known false-alarm errors in Expo Go SDK 55 on iOS simulators.
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

const { registerRootComponent } = require('expo');
const { default: App } = require('./App');
registerRootComponent(App);
