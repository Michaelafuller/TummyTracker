import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export interface FormFieldProps {
  label: string;
  error?: string;
  /** Optional trailing text next to the label, e.g. a character counter. */
  hint?: string;
  children: ReactNode;
}

/** Label + optional hint + control + optional error message. */
export function FormField({ label, error, hint, children }: FormFieldProps) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {hint ? (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
      {children}
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * Dictation-safe wrapper around RN's `TextInput` (HANDOFF.md Cycle B): every
 * call site passes `value` + `onChangeText` (fully controlled), which used to
 * push `value` back into the native field on every keystroke. iOS dictation
 * streams provisional *marked text* while listening; each of those
 * onChangeText -> setState -> re-render round trips invalidated the
 * marked-text session, so the final recognized phrase got *inserted* instead
 * of *replacing* the stream — the text appeared twice. Android voice typing
 * hit a milder version of the same issue.
 *
 * Fix: render uncontrolled (`defaultValue`, not `value`). A *programmatic*
 * change (search-result fill, serving-size rescale, form reset) — as opposed
 * to an echo of what the user just typed/dictated, tracked by comparing
 * against the last value we saw come out of `onChangeText` — forces the
 * native `TextInput` to remount via a bumped `key`, so it re-mounts with a
 * fresh `defaultValue`. (Design fallback, HANDOFF.md Cycle B: pushing the
 * text imperatively via `ref.setNativeProps({ text })` was the first choice,
 * but proved unreliable for tests — RNTL's test renderer never observes a
 * `setNativeProps` call, only `value`/`defaultValue` props and its own
 * `fireEvent.changeText` bookkeeping, so a remount is what both the wrapper
 * contract tests below and real dictation need.) No call site changes; they
 * keep passing `value`/`onChangeText` as if this were still fully controlled.
 */
export function ThemedTextInput({ style, multiline, value, onChangeText, ...props }: TextInputProps) {
  const theme = useTheme();
  // The last text this component reported out via onChangeText — used to
  // tell "the user just typed this" apart from "the caller changed `value`
  // programmatically" so only the latter forces a remount.
  const lastReportedRef = useRef(value);
  const [remountCount, setRemountCount] = useState(0);

  useEffect(() => {
    if (value !== lastReportedRef.current) {
      lastReportedRef.current = value;
      setRemountCount((n) => n + 1);
    }
  }, [value]);

  function handleChangeText(text: string) {
    lastReportedRef.current = text;
    onChangeText?.(text);
  }

  return (
    <TextInput
      key={remountCount}
      defaultValue={value}
      onChangeText={handleChangeText}
      placeholderTextColor={theme.textSecondary}
      multiline={multiline}
      {...props}
      // Caller `style` (width/flex) is merged LAST but on top of the themed base,
      // so per-field sizing can't strip the background/text colors (dark-mode fix).
      style={[
        styles.input,
        { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border },
        multiline && styles.multiline,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: 44,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: Spacing.two,
  },
});
