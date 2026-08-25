// babel-plugin-inline-import inlines Drizzle's `.sql` migration files as raw
// strings (instead of letting Metro/Babel try to parse SQL as JavaScript). Paired
// with `config.resolver.sourceExts.push('sql')` in metro.config.js.
// https://orm.drizzle.team/docs/get-started/expo-new
//
// dynamicImportToRequireForJest (below) exists ONLY under Jest (doctor-PDF-
// report cycle, HANDOFF.md §0/§3). src/lib/haptics.ts and the settings
// screen's report handler use `await import('expo-haptics' | 'expo-print')`
// — never a static import — so Metro never eagerly resolves those native
// modules on the owner's old dev client. But under Jest (Node 25 + this
// repo's CJS jest-runtime, no `--experimental-vm-modules`), a REAL
// `import()` throws `"A dynamic import callback was invoked without
// --experimental-vm-modules"` at the VM level — silently swallowed by
// haptics.ts's own try/catch, and by the report handler's try/catch, but
// never reaching whatever `jest.mock('expo-haptics' | 'expo-print', ...)` a
// test registered. Rewriting `import(x)` to `Promise.resolve().then(() =>
// require(x))` routes the call through the ordinary CJS `require` Jest
// already intercepts.
//
// Gated on `process.env.JEST_WORKER_ID` rather than `api.caller` — jest-expo
// deliberately hardcodes the babel caller to `{ name: 'metro', bundler:
// 'metro' }` even under Jest (jest-expo/src/resolveBabelOptions.js), so
// Metro/EAS builds and this repo's own Jest runs are otherwise
// indistinguishable to babel-preset-expo. `JEST_WORKER_ID` is set by Jest
// itself in every worker process, never by Metro/EAS, so this stays a no-op
// for the real app bundle.
function dynamicImportToRequireForJest({ types: t }) {
  return {
    visitor: {
      CallExpression(path) {
        if (!t.isImport(path.node.callee)) return;
        const [source] = path.node.arguments;
        path.replaceWith(
          t.callExpression(
            t.memberExpression(
              t.callExpression(t.memberExpression(t.identifier('Promise'), t.identifier('resolve')), []),
              t.identifier('then'),
            ),
            [t.arrowFunctionExpression([], t.callExpression(t.identifier('require'), [source]))],
          ),
        );
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  const isJest = process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }], ...(isJest ? [dynamicImportToRequireForJest] : [])],
  };
};
