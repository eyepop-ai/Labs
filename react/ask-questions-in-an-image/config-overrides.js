const path = require('path');

module.exports = function override(config) {
  config.resolve.fallback = {
    ...(config.resolve.fallback || {}),
    path: require.resolve('path-browserify'),
  };
  return config;
};