import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { parseMealReminderResponse } from './model';

/**
 * Opens the quick-log screen for a slot when the user taps one of our
 * breakfast/lunch/dinner reminders (GitHub #26). A notification is never a
 * record: this only navigates. Sibling of `useDayCheckInResponses` and
 * `useExperimentNotificationResponses`, mounted alongside them on Home; each
 * ignores the others' slots. Reminders scheduled before this change already
 * carry `content.data.slot`, so no reschedule is needed.
 */
export function useMealReminderResponses(): void {
  const response = Notifications.useLastNotificationResponse();
  const router = useRouter();
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!response) return;
    const parsed = parseMealReminderResponse(response);
    if (!parsed) return;

    // Once per notification id — a re-render with the same response object
    // (before clearLastNotificationResponse takes effect) must not push twice.
    const identifier = response.notification.request.identifier;
    if (handled.current.has(identifier)) return;
    handled.current.add(identifier);

    router.push({ pathname: '/quick-log', params: { slot: parsed.slot } });
    try {
      Notifications.clearLastNotificationResponse();
    } catch {
      // Best-effort — a relaunch re-handling this response is the only downside.
    }
  }, [response, router]);
}
