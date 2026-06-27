// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle ships SQL migrations as bundled string assets; Metro must treat `.sql`
// as a source extension so `import m0000 from './0000_x.sql'` resolves at runtime.
// https://orm.drizzle.team/docs/get-started/expo-new
config.resolver.sourceExts.push('sql');

module.exports = config;
