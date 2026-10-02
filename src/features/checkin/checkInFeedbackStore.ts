import { create } from 'zustand';

import type { DayStatus } from '@/db/schema';

/** A check-in just recorded from the notification's Fine/Rough action. */
export interface RecordedCheckIn {
  /** The local day the answer was recorded for ('YYYY-MM-DD'). */
  date: string;
  status: DayStatus;
  /** When it was recorded (epoch ms) — also tells a newer answer from an older one. */
  at: number;
}

type CheckInFeedbackStore = {
  recorded: RecordedCheckIn | null;
  show: (recorded: RecordedCheckIn) => void;
  clear: () => void;
};

/**
 * Tiny transient store behind Home's "✓ Rough day recorded" banner. Written only
 * by `useDayCheckInResponses` after a notification answer was actually recorded;
 * never persisted, never a record itself.
 */
export const useCheckInFeedbackStore = create<CheckInFeedbackStore>((set) => ({
  recorded: null,
  show: (recorded) => set({ recorded }),
  clear: () => set({ recorded: null }),
}));
