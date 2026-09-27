import { StyleSheet, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { SettingsButton } from '@/components/settings-button';

// The gear overlay renders once here, above every tab (HANDOFF.md §5) — as a
// later sibling of AppTabs so it paints on top, absolutely positioned via its
// own styles (see settings-button.tsx) rather than anything here.
export default function TabsLayout() {
  return (
    <View style={styles.container}>
      <AppTabs />
      <SettingsButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
