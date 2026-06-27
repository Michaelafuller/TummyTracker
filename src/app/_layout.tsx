import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppProviders } from '@/components/app-providers';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppProviders>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="entry/new" options={{ title: 'Add entry', presentation: 'modal' }} />
          <Stack.Screen name="bm/new" options={{ title: 'Log bowel movement', presentation: 'modal' }} />
          <Stack.Screen name="entry/[id]" options={{ title: 'Edit entry' }} />
          <Stack.Screen name="scan" options={{ title: 'Scan barcode', presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ title: 'Reminders', presentation: 'modal' }} />
        </Stack>
      </AppProviders>
    </ThemeProvider>
  );
}
