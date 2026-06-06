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

// Prevent Metro from resolving modules from outside this app's node_modules.
// Without this, react-native-svg (and others) can be found in multiple
// locations — Expo Go's pre-bundled copy and the local node_modules — causing
// "Had to register two views with the same name RNSVGCircle" crashes.
config.resolver.nodeModulesPaths = [
  projectNodeModules,
  reactNativeNodeModules,
];
config.resolver.disableHierarchicalLookup = false;
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
