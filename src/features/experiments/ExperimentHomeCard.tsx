// Home entry point for the active elimination experiment (GitHub #19) — a
// compact row above the backup nudge, rendered only while one is active.
// Renders nothing otherwise, so Home is unchanged for anyone not running one.
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { phaseStatusLine } from '@/features/experiments/copy';
import { currentPhase } from '@/features/experiments/engine';
import { useActiveExperiment } from '@/features/experiments/useExperiments';
import { useTheme } from '@/hooks/use-theme';
import { formatDateInput } from '@/lib/datetime';

function capitalize(term: string): string {
  return term.length === 0 ? term : term[0].toUpperCase() + term.slice(1);
}

export function ExperimentHomeCard({ now }: { now: number }) {
  const theme = useTheme();
  const router = useRouter();
  const experiment = useActiveExperiment();

  if (!experiment) return null;

  const phase = currentPhase(experiment, formatDateInput(now));
  // phaseStatusLine already returns 'Verdict ready' for phase 'ready' — no
  // special-casing needed here.
  const label = `${capitalize(experiment.term)} experiment · ${phaseStatusLine(phase.phase, phase.dayOfPhase, phase.phaseLength)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${experiment.term} experiment`}
      onPress={() => router.push(`/experiment/${experiment.id}`)}
      style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
