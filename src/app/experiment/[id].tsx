// Follow/verdict screen (GitHub #19, Cycle A) — one experiment's live status:
// today's instruction, progress, and (once the schedule reaches phase
// 'ready') the verdict card + "Finish experiment". A completed experiment
// shows its FROZEN verdict (verdictJson) rather than a live re-evaluation —
// see verdictRatesSentence's doc comment for why. An abandoned one just shows
// when it ended.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { abandonExperiment, finishExperiment } from '@/db/repository';
import { useDayCheckIns } from '@/features/checkin/useDayCheckIns';
import {
  challengeTodayLabel,
  confidenceChipLabel,
  daysLoggedSoFarSentence,
  endedEarlySentence,
  phaseInstruction,
  phaseStatusLine,
  slipsSentence,
  verdictHeadline,
  verdictNumbersSentence,
  verdictRatesSentence,
  VERDICT_DISCLAIMER,
} from '@/features/experiments/copy';
import { currentPhase, dayFacts, evaluateExperiment, type ExperimentVerdict } from '@/features/experiments/engine';
import { useExperiment } from '@/features/experiments/useExperiments';
import { useAllEntries } from '@/features/logging/useEntries';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput } from '@/lib/datetime';

function parseFrozenVerdict(verdictJson: string | null): ExperimentVerdict | null {
  if (!verdictJson) return null;
  try {
    return JSON.parse(verdictJson) as ExperimentVerdict;
  } catch {
    return null;
  }
}

function VerdictCard({ verdict, numbersSentence }: { verdict: ExperimentVerdict; numbersSentence: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="smallBold">{verdictHeadline(verdict.kind)}</ThemedText>
      {verdict.confidence != null ? (
        <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small">{confidenceChipLabel(verdict.confidence)}</ThemedText>
        </View>
      ) : null}
      <ThemedText type="small">{verdict.reason}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {numbersSentence}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {VERDICT_DISCLAIMER}
      </ThemedText>
    </View>
  );
}

export default function ExperimentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const exp = useExperiment(id);
  const entries = useAllEntries();
  const checkIns = useDayCheckIns();
  // Lazy-init so today's key is read once per mount, not on every render.
  const [today] = useState(() => formatDateInput(Date.now()));
  const [working, setWorking] = useState(false);

  const evaluation = useMemo(() => {
    if (!exp || exp.status !== 'active') return null;
    return evaluateExperiment(exp, entries, checkIns, today);
  }, [exp, entries, checkIns, today]);

  const phase = useMemo(() => (exp ? currentPhase(exp, today) : null), [exp, today]);

  const exposedToday = useMemo(() => {
    if (!exp) return false;
    return dayFacts(entries, checkIns, exp.term).get(today)?.exposed === true;
  }, [exp, entries, checkIns, today]);

  function handleEnd() {
    if (!exp) return;
    Alert.alert('End experiment?', 'This stops it early — there will be no verdict.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End experiment',
        style: 'destructive',
        onPress: async () => {
          setWorking(true);
          try {
            await abandonExperiment(exp.id, Date.now());
            router.back();
          } finally {
            setWorking(false);
          }
        },
      },
    ]);
  }

  async function handleFinish() {
    if (!exp || !evaluation?.verdict) return;
    setWorking(true);
    try {
      await finishExperiment(exp.id, evaluation.verdict, Date.now());
    } finally {
      setWorking(false);
    }
  }

  if (exp === undefined) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const frozenVerdict = exp.status === 'completed' ? parseFrozenVerdict(exp.verdictJson) : null;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="subtitle">{`Testing ${exp.term}`}</ThemedText>

        {exp.status === 'active' && phase ? (
          <>
            <ThemedText type="smallBold">
              {phaseStatusLine(phase.phase, phase.dayOfPhase, phase.phaseLength)}
            </ThemedText>
            <ThemedText type="small">{phaseInstruction(phase.phase, exp.term)}</ThemedText>
            {phase.phase === 'challenge' ? (
              <ThemedText type="small" themeColor="textSecondary">
                {challengeTodayLabel(exposedToday)}
              </ThemedText>
            ) : null}

            {evaluation ? (
              <View style={styles.section}>
                {slipsSentence(evaluation.slipDays) ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {slipsSentence(evaluation.slipDays)}
                  </ThemedText>
                ) : null}
                <ThemedText type="small" themeColor="textSecondary">
                  {daysLoggedSoFarSentence(evaluation)}
                </ThemedText>
              </View>
            ) : null}

            {phase.phase === 'ready' && evaluation?.verdict ? (
              <>
                <VerdictCard verdict={evaluation.verdict} numbersSentence={verdictNumbersSentence(evaluation)} />
                <PrimaryButton
                  label={working ? 'Finishing…' : 'Finish experiment'}
                  accessibilityLabel="Finish experiment"
                  onPress={handleFinish}
                  disabled={working}
                />
              </>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="End experiment"
              disabled={working}
              onPress={handleEnd}>
              <ThemedText type="link" themeColor="danger">
                End experiment
              </ThemedText>
            </Pressable>
          </>
        ) : null}

        {frozenVerdict ? (
          <VerdictCard verdict={frozenVerdict} numbersSentence={verdictRatesSentence(frozenVerdict)} />
        ) : null}

        {exp.status === 'abandoned' && exp.endedAt != null ? (
          <ThemedText type="small" themeColor="textSecondary">
            {endedEarlySentence(exp.endedAt)}
          </ThemedText>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: Spacing.one,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
});
