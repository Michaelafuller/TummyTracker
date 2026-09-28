// Start-experiment screen (GitHub #19, Cycle A) — modal, opened with
// `?term=<term>` from the Insights watchlist section. Shows the schedule
// built from the chosen elimination length, a baseline preview read from
// existing logs, the safety note, and blocks starting when one is already
// active (the repository enforces the same rule; this is just the UI
// reflection of it).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { FormScrollView } from '@/components/keyboard-aware-screen';
import { PrimaryButton } from '@/components/primary-button';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { startExperiment } from '@/db/repository';
import { requestExperimentNotificationRefresh } from '@/features/experiments/experimentNotifications';
import { ensureNotificationPermission } from '@/features/notifications/service';
import { useWatchlistStore } from '@/features/watchlist/watchlistStore';
import { useDayCheckIns } from '@/features/checkin/useDayCheckIns';
import {
  baselinePreviewSentence,
  baselineWarning,
  EXPERIMENT_ACTIVE_BLOCKED_MESSAGE,
  EXPERIMENT_SAFETY_NOTE,
  experimentPlanLines,
} from '@/features/experiments/copy';
import { DEFAULT_PROTOCOL, ELIMINATION_CHOICES, baselinePreview, experimentSchedule, type EliminationChoice } from '@/features/experiments/engine';
import { useActiveExperiment } from '@/features/experiments/useExperiments';
import { useAllEntries } from '@/features/logging/useEntries';
import { formatDateInput } from '@/lib/datetime';

const ELIMINATION_OPTIONS = ELIMINATION_CHOICES.map((days) => ({ value: String(days), label: `${days} days` }));

export default function NewExperimentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ term?: string }>();
  const term = typeof params.term === 'string' ? params.term.trim() : '';
  const entries = useAllEntries();
  const checkIns = useDayCheckIns();
  const activeExperiment = useActiveExperiment();
  const [eliminationDays, setEliminationDays] = useState<string>(String(DEFAULT_PROTOCOL.eliminationDays));
  const [submitting, setSubmitting] = useState(false);
  // Lazy-init so today's key is read once per mount, not on every render.
  const [today] = useState(() => formatDateInput(Date.now()));

  const schedule = useMemo(
    () =>
      experimentSchedule({
        term,
        startDate: today,
        baselineDays: DEFAULT_PROTOCOL.baselineDays,
        eliminationDays: Number(eliminationDays),
        challengeDays: DEFAULT_PROTOCOL.challengeDays,
        observationDays: DEFAULT_PROTOCOL.observationDays,
      }),
    [term, today, eliminationDays],
  );

  const baseline = useMemo(
    () => baselinePreview(entries, checkIns, term, today, DEFAULT_PROTOCOL.baselineDays),
    [entries, checkIns, term, today],
  );
  const warning = baselineWarning(baseline);
  const blocked = activeExperiment != null;

  async function handleStart() {
    setSubmitting(true);
    try {
      const created = await startExperiment(
        { term, eliminationDays: Number(eliminationDays) as EliminationChoice },
        Date.now(),
      );
      // startExperiment may have added the term to the watchlist in the DB;
      // save-time warnings read the in-memory store, so refresh it.
      void useWatchlistStore.getState().load();
      // Starting is a direct user action, so it's the one place we ask for
      // notification permission (once). The experiment starts either way;
      // scheduling only happens when it was granted.
      try {
        await ensureNotificationPermission();
      } catch {
        // A permission failure must never block the experiment.
      }
      requestExperimentNotificationRefresh();
      router.replace(`/experiment/${created.id}`);
    } catch (e) {
      // The repository refuses a second active experiment (a double tap, or
      // one started elsewhere since this screen rendered). Matched by name so
      // this screen doesn't need the DB module's class at runtime.
      if (e instanceof Error && e.name === 'ExperimentAlreadyActiveError') {
        Alert.alert("Couldn't start", EXPERIMENT_ACTIVE_BLOCKED_MESSAGE);
      } else {
        Alert.alert("Couldn't start", 'Something went wrong starting the experiment — try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (term.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="smallBold">Nothing to test</ThemedText>
      </ThemedView>
    );
  }

  return (
    <FormScrollView>
      <ThemedText type="subtitle">{`Test ${term}`}</ThemedText>

      <View style={styles.planLines}>
        {experimentPlanLines(schedule).map((line) => (
          <ThemedText key={line} type="small" themeColor="textSecondary">
            {line}
          </ThemedText>
        ))}
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">Elimination length</ThemedText>
        <SegmentedControl
          options={ELIMINATION_OPTIONS}
          value={eliminationDays}
          onChange={(value) => {
            if (value) setEliminationDays(value);
          }}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="small" themeColor="textSecondary">
          {baselinePreviewSentence(baseline)}
        </ThemedText>
        {warning ? (
          <ThemedText type="small" themeColor="textSecondary">
            {warning}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {EXPERIMENT_SAFETY_NOTE}
      </ThemedText>

      {blocked ? (
        <ThemedText type="small" themeColor="danger">
          {EXPERIMENT_ACTIVE_BLOCKED_MESSAGE}
        </ThemedText>
      ) : null}

      <PrimaryButton
        label={submitting ? 'Starting…' : 'Start experiment'}
        accessibilityLabel="Start experiment"
        onPress={handleStart}
        disabled={blocked || submitting}
      />
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planLines: {
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
});
