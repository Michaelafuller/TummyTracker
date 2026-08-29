import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { getKeyboardController } from '@/lib/keyboard';

// Both exports below resolve their implementation ONCE, at module scope, from
// `getKeyboardController()` — never inside the component body. See
// src/lib/keyboard.ts's header for why: React Compiler forbids conditional
// hooks, and a provider/host component can't be swapped in after the tree has
// mounted, so the KC-vs-fallback branch has to be decided before any
// component using it ever renders.
//
// Fallback rule: when the running client predates
// `react-native-keyboard-controller`'s native module (getKeyboardController()
// returns null — always true under Jest and on the pre-A1 dev client), both
// exports fall back to EXACTLY today's hand-rolled behavior (KeyboardAvoidingView
// + ScrollView / KeyboardAvoidingView alone). Nothing regresses until the
// owner's next EAS build ships the native module — this file only adds the
// keyboard-aware upside on top once it does.
const kc = getKeyboardController();

const formContent = {
  padding: Spacing.four,
  paddingBottom: Spacing.six,
  gap: Spacing.four,
};

export interface FormScrollViewProps {
  children: ReactNode;
  /** Replaces (not merges with) the shared default form padding/gap when provided. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Gap kept between the focused input and the keyboard top. KC path only. */
  bottomOffset?: number;
  testID?: string;
}

/**
 * Scrolling form wrapper. Prefer this over hand-rolling
 * `KeyboardAvoidingView` + `ScrollView` in a screen — see this file's header
 * for the fallback contract.
 */
export const FormScrollView = kc
  ? function FormScrollView({ children, contentContainerStyle, bottomOffset, testID }: FormScrollViewProps) {
      return (
        <kc.KeyboardAwareScrollView
          bottomOffset={bottomOffset ?? Spacing.six}
          contentContainerStyle={contentContainerStyle ?? styles.formContent}
          keyboardShouldPersistTaps="handled"
          testID={testID}>
          {children}
        </kc.KeyboardAwareScrollView>
      );
    }
  : function FormScrollView({ children, contentContainerStyle, testID }: FormScrollViewProps) {
      return (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={contentContainerStyle ?? styles.formContent}
            keyboardShouldPersistTaps="handled"
            testID={testID}>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      );
    };

export interface KeyboardShiftViewProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Non-scrolling keyboard-shifting wrapper (used by Home). See this file's
 * header for the fallback contract.
 */
export const KeyboardShiftView = kc
  ? function KeyboardShiftView({ children, style }: KeyboardShiftViewProps) {
      return (
        <kc.KeyboardAvoidingView behavior="padding" style={[styles.flex, style]}>
          {children}
        </kc.KeyboardAvoidingView>
      );
    }
  : function KeyboardShiftView({ children, style }: KeyboardShiftViewProps) {
      return (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.flex, style]}>
          {children}
        </KeyboardAvoidingView>
      );
    };

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  formContent,
});
