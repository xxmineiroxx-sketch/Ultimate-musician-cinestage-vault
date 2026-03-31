const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Keep Metro inside this app's dependency tree so it doesn't hoist a mismatched
// React package from elsewhere in the workspace.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => path.join(projectRoot, "node_modules", String(name)),
  },
);

module.exports = config;
