// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Bundle imports that reach outside `mobile/` (e.g. `../shared/roleLabels.ts`)
config.watchFolders = [workspaceRoot];

// When shared/* imports a package (e.g. zod), resolve it from mobile/node_modules.
// On EAS only `mobile/` runs npm ci — root node_modules is not available.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;

