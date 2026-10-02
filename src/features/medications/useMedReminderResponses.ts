import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { createMedicationEvent, deleteMedicationEvent, listMedications } from '@/db/repository';
import type { Medication } from '@/db/schema';
import { formatTime12h } from '@/lib/datetime';
import { formatDoseAmount } from '@/lib/medications';
import { responseHandledKey } from '@/features/notifications/model';
import { parseMedReminderResponse, tookDoses } from './reminderModel';

type Router = ReturnType<typeof useRouter>;

/** Opens the dose entry form with those medications ticked. Navigation only — nothing is written. */
function openEntryForm(router: Router, medicationIds: readonly string[]) {
  router.push({ pathname: '/medication/entry/new', params: { medicationIds: medicationIds.join(',') } });
}

function offerUndo(eventId: string, takenAt: number, doses: ReturnType<typeof tookDoses>, meds: readonly Medication[]) {
  const nameById = new Map(meds.map((med) => [med.id, med.name]));
  const summary = doses
    .map((dose) => `${nameById.get(dose.medicationId) ?? 'Medication'} ${formatDoseAmount(dose.dose, dose.doseUnit)}`)
    .join(', ');
  Alert.alert('Logged', `Logged ${summary} at ${formatTime12h(takenAt)}.`, [
    {
      text: 'Undo',
      style: 'destructive',
      onPress: () => {
        // Deletes exactly the event this tap created — nothing else.
        deleteMedicationEvent(eventId).catch(() => {
          Alert.alert("Couldn't undo that", 'Something went wrong removing it — try again from the Meds tab.');
        });
      },
    },
    { text: 'OK', style: 'cancel' },
  ]);
}

/**
 * Handles a medication reminder's notification response (GitHub #29):
 * - the "Took them" button logs ONE dose event at this moment, then offers
 *   Undo. It re-reads the medications at tap time and logs only those still
 *   active with a default dose + unit, at their CURRENT defaults — never
 *   stale scheduling-time data. When none qualify, it opens the prefilled
 *   entry form instead. It is the only place a reminder ever writes a dose,
 *   and only because the user explicitly tapped the button.
 * - a plain tap on the notification opens the entry form with those
 *   medications ticked (navigation only).
 * Mounted from the Home screen next to the other response hooks (Home is the
 * initial tab, mounted only after the migration gate, so the write can never
 * race the migrations). Each hook ignores the others' slots.
 */
export function useMedReminderResponses(): void {
  const response = Notifications.useLastNotificationResponse();
  const router = useRouter();
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!response) return;
    const parsed = parseMedReminderResponse(response);
    if (!parsed) return;

    // Once per (firing, action) — a relaunch or re-render must not log a second
    // dose even before clearLastNotificationResponse takes effect, but next
    // week's firing of the same WEEKLY reminder (same identifier) must log.
    const identifier = response.notification.request.identifier;
    const key = responseHandledKey(response);
    if (handled.current.has(key)) return;
    handled.current.add(key);

    (async () => {
      if (parsed.kind === 'took') {
        let logged = false;
        try {
          const meds = await listMedications();
          const doses = tookDoses(meds, parsed.medicationIds);
          if (doses.length > 0) {
            const takenAt = Date.now();
            const { event } = await createMedicationEvent({ takenAt, timeKnown: true, notes: null }, doses);
            logged = true;
            offerUndo(event.id, takenAt, doses, meds);
          }
        } catch {
          // Nothing was written (the event + doses go in one transaction) — fall through to the entry form.
        }
        if (!logged) openEntryForm(router, parsed.medicationIds);
      } else {
        openEntryForm(router, parsed.medicationIds);
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
  }, [response, router]);
}
