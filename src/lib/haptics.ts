// Tactile feedback wrapper (HANDOFF.md doctor-PDF-report cycle, haptics rider —
// spec from the swipe-delete cycle's §B.6). The installed dev client on the
// owner's Pixel predates the `expo-haptics` native module, so this file NEVER
// imports it statically — only a dynamic `await import('expo-haptics')` inside
// the function body, so Metro never eagerly resolves the native module on the
// old client (CLAUDE.md-adjacent constraint, HANDOFF.md §0).
//
// Every call site fires this fire-and-forget (`void tapFeedback(...)`, never
// `await`ed in a UI flow) — a missing/incompatible native module must never
// block or throw into the caller, so every error here is swallowed silently.

export type FeedbackKind = 'impact' | 'success';

/**
 * Fire a short haptic pulse. `impact` for a destructive/reveal action (swipe
 * reveal, confirmed delete); `success` for a completed save. Resolves
 * without throwing even when `expo-haptics` isn't installed in the running
 * client (old dev-client builds) or the native call itself rejects.
 */
export async function tapFeedback(kind: FeedbackKind): Promise<void> {
  try {
    const Haptics = await import('expo-haptics');
    if (kind === 'impact') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch {
    // Missing native module, or the native call itself failed — silent no-op.
  }
}
