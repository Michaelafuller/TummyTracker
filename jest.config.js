/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./node_modules/react-native-gesture-handler/jestSetup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-keyboard-controller|@tanstack/.*|drizzle-orm/.*))',
  ],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest/style-mock.js',
  },
  // Agent git worktrees live under .claude/worktrees/ — full copies of src/ —
  // so a plain `npm test` would run every suite twice (and against a stale
  // branch). Separator-agnostic so it matches on Windows too.
  testPathIgnorePatterns: ['/node_modules/', '[/\\\\]\\.claude[/\\\\]'],
  modulePathIgnorePatterns: ['[/\\\\]\\.claude[/\\\\]'],
  collectCoverageFrom: ['src/lib/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
};
