import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';

import { getExperiment } from '@/db/repository';
import { parseExperimentResponse } from './experimentNotificationsModel';

/**
 * Opens the experiment screen when the user taps one of our phase reminders
 * (GitHub #19, Cycle B). A notification is never a record: this only
 * navigates — it never logs, marks a day or finishes anything. Sibling of
 * `useDayCheckInResponses` and mounted alongside it on Home; both read the
 * same "last response" and each ignores the other's slot. A tap for an
 * experiment that no longer exists or isn't active does nothing.
 */
export function useExperimentNotificationResponses(): void {
  const response = Notifications.useLastNotificationResponse();
  const router = useRouter();
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!response) return;
    const parsed = parseExperimentResponse(response);
    if (!parsed) return;

    // Once per notification id — a re-render with the same response object
    // (before clearLastNotificationResponse takes effect) must not push twice.
    const identifier = response.notification.request.identifier;
    if (handled.current.has(identifier)) return;
    handled.current.add(identifier);

    (async () => {
      try {
        const exp = await getExperiment(parsed.experimentId);
        if (exp && exp.status === 'active') {
          router.push(`/experiment/${exp.id}`);
        }
      } catch {
        // A failed lookup must not crash the screen.
      }
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // Best-effort — a relaunch re-handling this response is the only downside.
      }
    })();
  }, [response, router]);
}
