// babel-plugin-inline-import inlines Drizzle's `.sql` migration files as raw
// strings (instead of letting Metro/Babel try to parse SQL as JavaScript). Paired
// with `config.resolver.sourceExts.push('sql')` in metro.config.js.
// https://orm.drizzle.team/docs/get-started/expo-new
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
