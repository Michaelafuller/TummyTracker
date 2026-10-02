import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';

import { useCheckInFeedbackStore } from './checkInFeedbackStore';
import { parseDayCheckInResponse } from './dayCheckInModel';
import { recordDayCheckIn } from './dayCheckInService';

/**
 * Handles a tap on the day check-in's Fine/Rough notification action
 * (GitHub #13). A plain tap on the notification body just opens the app, as
 * today (`parseDayCheckInResponse` returns null for it). Mounted from the
 * Home screen (`(tabs)/index.tsx`), not the root — Home is the initial tab
 * so it's mounted whenever the app is, and only after the migration gate,
 * so the write can never race the migrations.
 */
export function useDayCheckInResponses(): void {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!response) return;
    const parsed = parseDayCheckInResponse(response);
    if (!parsed) return;

    // Once per (notification, action) pair — a relaunch shouldn't re-apply
    // an already-handled response even before clearLastNotificationResponse
    // has taken effect.
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handled.current.has(key)) return;
    handled.current.add(key);

    const identifier = response.notification.request.identifier;

    (async () => {
      try {
        await recordDayCheckIn(parsed.date, parsed.status);
        // Only after the record resolved — a failed write shows nothing new.
        useCheckInFeedbackStore.getState().show({ date: parsed.date, status: parsed.status, at: Date.now() });
      } catch {
        // A failed record must not crash the screen.
      }
      try {
        await Notifications.dismissNotificationAsync(identifier);
      } catch {
        // Android leaves the notification up after an action tap otherwise — best-effort only.
      }
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // Best-effort — a relaunch re-applying this response is the only downside.
      }
    })();
  }, [response]);
}
