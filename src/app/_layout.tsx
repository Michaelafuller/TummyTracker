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
          <Stack.Screen name="symptom/new" options={{ title: 'Log symptom', presentation: 'modal' }} />
          <Stack.Screen name="entry/[id]" options={{ title: 'Edit entry' }} />
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
              // Camera preview is always dark — keep the header legible against it.
              headerStyle: { backgroundColor: '#000' },
              headerTintColor: '#fff',
              headerTitleStyle: { color: '#fff' },
            }}
          />
        </Stack>
      </AppProviders>
    </ThemeProvider>
  );
}
