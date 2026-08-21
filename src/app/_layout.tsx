import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppProviders } from '@/components/app-providers';
import { Colors } from '@/constants/theme';

// Palette-driven navigation themes (HANDOFF.md Cycle C): react-navigation's
// stock DefaultTheme/DarkTheme ship their own white/near-black/iOS-blue, so
// light-mode stack headers rendered off-palette. `link` (not `primary`, which
// is a fill color) drives the nav tint since it has to work as bare text —
// teal `primary` (#5BC0BE) is only 2.16:1 on white and must never be
// light-mode text/icon color.
const LightNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.link,
    background: Colors.light.background,
    card: Colors.light.backgroundElement,
    text: Colors.light.text,
    border: Colors.light.border,
  },
};

const DarkNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.link,
    background: Colors.dark.background,
    card: Colors.dark.backgroundElement,
    text: Colors.dark.text,
    border: Colors.dark.border,
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkNavTheme : LightNavTheme}>
      <AppProviders>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="entry/new" options={{ title: 'Add entry', presentation: 'modal' }} />
          <Stack.Screen name="bm/new" options={{ title: 'Log bowel movement', presentation: 'modal' }} />
          <Stack.Screen name="symptom/new" options={{ title: 'Log symptom', presentation: 'modal' }} />
          <Stack.Screen name="entry/[id]" options={{ title: 'Edit entry' }} />
          <Stack.Screen
            name="entry/component/[componentId]"
            options={{ title: 'Edit component' }}
          />
          <Stack.Screen
            name="meal/component"
            options={{ title: 'Confirm item', presentation: 'modal' }}
          />
          <Stack.Screen name="meal/review" options={{ title: 'Review meal', presentation: 'modal' }} />
          <Stack.Screen
            name="scan"
            options={{
              title: 'Scan barcode',
              presentation: 'modal',
              // Camera preview is always dark — keep the header legible against
              // it, deliberately independent of the active app theme (light or
              // dark stays dark here on purpose).
              headerStyle: { backgroundColor: Colors.dark.background },
              headerTintColor: Colors.dark.text,
              headerTitleStyle: { color: Colors.dark.text },
            }}
          />
        </Stack>
      </AppProviders>
    </ThemeProvider>
  );
}
