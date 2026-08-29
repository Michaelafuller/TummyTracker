import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Root-level render-error boundary (RESULTS 2026-08-16 carried recommendation).
 * Sits above ThemeProvider in `src/app/_layout.tsx` so it also catches
 * provider-level render errors — deliberately built ONLY from ThemedView /
 * ThemedText / PrimaryButton, which read theme via `useTheme()` ->
 * `useColorScheme()` directly and need no context, so they render correctly
 * even above every other provider in the tree.
 *
 * ONE class component by necessity: React only exposes error-boundary
 * behavior (`getDerivedStateFromError` / `componentDidCatch`) via class
 * lifecycles — there is no hook equivalent. This is the documented exception
 * to CLAUDE.md §8's "no class components" rule.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Dev visibility only — this app has no telemetry.
    console.error('Root error boundary caught a render error', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (error) {
      return (
        <ThemedView
          style={styles.container}
          accessibilityLabel="App error screen"
          testID="root-error-boundary-fallback">
          <ThemedText type="subtitle">Something went wrong</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            The app hit an unexpected error. Your journal data is safe on this device.
          </ThemedText>
          <ThemedText type="code" themeColor="textSecondary">
            {error.message}
          </ThemedText>
          <PrimaryButton label="Try again" accessibilityLabel="Try again" onPress={this.handleRetry} />
        </ThemedView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
});
