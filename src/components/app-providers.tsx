import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useDatabaseMigrations } from '@/db/migrate';
import { runTagBackfillOnce } from '@/db/tagBackfillRunner';
import { refreshCheckInIfEnabled } from '@/features/goals/checkInService';
import { useGoalsStore } from '@/features/goals/goalsStore';
import { configureNotificationHandler } from '@/features/notifications/service';
import { usePrefsStore } from '@/features/prefs/prefsStore';
import { useWatchlistStore } from '@/features/watchlist/watchlistStore';
import { ThemedText } from './themed-text';

// One QueryClient for the app lifetime (react-query is used for the barcode lookup).
const queryClient = new QueryClient();

// Foreground reminders show as a banner.
configureNotificationHandler();

function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

/** Gates the app on the SQLite migrations being applied before any DB access. */
function MigrationGate({ children }: { children: ReactNode }) {
  const { success, error } = useDatabaseMigrations();

  // Fire-and-forget: additive-only, so stale-until-repaired reads for one
  // launch are acceptable. Do not gate rendering on it.
  useEffect(() => {
    if (success) {
      void runTagBackfillOnce();
      // Watchlist/goals reads must not race the migration gate — hydrate here too.
      void useWatchlistStore.getState().load();
      void useGoalsStore.getState().load();
      // Day rollover re-arming: if the check-in is enabled, its last-scheduled
      // fire may be stale (yesterday's totals) by the time the app reopens.
      void refreshCheckInIfEnabled();
    }
  }, [success]);

  if (error) {
    return (
      <Centered>
        <ThemedText type="smallBold">Could not prepare the database</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {error.message}
        </ThemedText>
      </Centered>
    );
  }

  if (!success) {
    return (
      <Centered>
        <ActivityIndicator />
        <ThemedText type="small" themeColor="textSecondary">
          Preparing your journal…
        </ThemedText>
      </Centered>
    );
  }

  return <>{children}</>;
}

/** App-wide providers: React Query + the database migration gate. */
export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    usePrefsStore.getState().load();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <MigrationGate>{children}</MigrationGate>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
});
