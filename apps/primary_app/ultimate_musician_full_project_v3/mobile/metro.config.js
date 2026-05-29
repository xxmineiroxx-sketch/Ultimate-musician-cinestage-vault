const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const projectNodeModules = path.resolve(projectRoot, "node_modules");
const reactNativeNodeModules = path.resolve(
  projectNodeModules,
  "react-native",
  "node_modules",
);
const config = getDefaultConfig(projectRoot);

// Keep Metro inside this app's dependency tree so it doesn't hoist a mismatched
// React package from elsewhere in the workspace, while still allowing nested
// React Native dependencies to resolve from the local install.
config.resolver.nodeModulesPaths = [
  projectNodeModules,
  reactNativeNodeModules,
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => {
      const moduleName = String(name);
      const projectPath = path.join(projectNodeModules, moduleName);

      if (fs.existsSync(projectPath)) {
        return projectPath;
      }

      return path.join(reactNativeNodeModules, moduleName);
    },
  },
);

module.exports = config;
