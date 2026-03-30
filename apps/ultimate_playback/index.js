// Filter the noisy bridgeless feature-flag warnings before Expo modules
// initialize, but keep fatal runtime errors visible.
const _origError = console.error;
console.error = function (...args) {
  const msg = String(args[0] || '');
  if (msg.includes('disableEventLoopOnBridgeless') || msg.includes('feature flag')) {
    return;
  }
  return _origError.apply(console, args);
};

const { registerRootComponent } = require('expo');
const { default: App } = require('./App');
registerRootComponent(App);
