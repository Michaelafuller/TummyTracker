import { useState, type ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

// The real Collapsible (components/ui/collapsible.tsx) animates its expand
// with react-native-reanimated's FadeIn, which needs the native Worklets
// runtime — unavailable under Jest ("WorkletsError: Native part of Worklets
// doesn't seem to be initialized"). Stand in a plain toggle that preserves
// the same collapsed-by-default / tap-to-expand contract every screen under
// test relies on, without touching the reanimated runtime at all. Shared
// manual mock (HANDOFF.md #16 §5) — `jest.mock('@/components/ui/collapsible')`
// picks this up automatically, no factory needed.
export function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setIsOpen((value) => !value)}>
        <Text>{title}</Text>
      </Pressable>
      {isOpen ? children : null}
    </>
  );
}
