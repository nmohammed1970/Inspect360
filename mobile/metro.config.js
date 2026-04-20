// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Bundle imports that reach outside `mobile/` (e.g. `../shared/roleLabels.ts`)
config.watchFolders = [workspaceRoot];

module.exports = config;

