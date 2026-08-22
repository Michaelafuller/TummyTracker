/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./node_modules/react-native-gesture-handler/jestSetup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@tanstack/.*|drizzle-orm/.*))',
  ],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest/style-mock.js',
  },
  collectCoverageFrom: ['src/lib/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
};
