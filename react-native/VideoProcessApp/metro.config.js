const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const extraNodeModules = {
  path: require.resolve('path-browserify'),
  buffer: require.resolve('buffer'),
  util: require.resolve('util'),
};

const config = {
  resolver: {
    extraNodeModules,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);