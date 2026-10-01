import type { LogEntry, Medication, MedicationDose, MedicationEvent } from '@/db/schema';
import {
  buildCalendarTheme,
  entryDateKeys,
  filterByEntryType,
  filterEntriesInRange,
  filterJournalItems,
  formatPeriodLabel,
  getPeriodRange,
  groupEntriesByDay,
  logEntriesToJournalItems,
  medicationEventsToJournalItems,
  type JournalItem,
} from '../journal';

const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

describe('getPeriodRange', () => {
  const anchor = at(2026, 6, 24); // Wed 2026-06-24

  it('day mode covers exactly that calendar day', () => {
    const { start, end } = getPeriodRange(anchor, 'day');
    expect(start).toBe(at(2026, 6, 24, 0, 0));
    expect(end).toBe(at(2026, 6, 25, 0, 0));
  });

  it('week mode covers Sunday..Saturday containing the anchor', () => {
    const { start, end } = getPeriodRange(anchor, 'week');
    expect(start).toBe(at(2026, 6, 21, 0, 0)); // Sunday
    expect(end).toBe(at(2026, 6, 28, 0, 0)); // next Sunday
  });

  it('month mode covers the whole calendar month', () => {
    const { start, end } = getPeriodRange(anchor, 'month');
    expect(start).toBe(at(2026, 6, 1, 0, 0));
    expect(end).toBe(at(2026, 7, 1, 0, 0));
  });
});

describe('filterEntriesInRange', () => {
  const entries = [
    { loggedAt: at(2026, 6, 24, 8) },
    { loggedAt: at(2026, 6, 25, 9) },
    { loggedAt: at(2026, 6, 27, 9) },
  ];

  it('keeps entries within the half-open range', () => {
    const range = getPeriodRange(at(2026, 6, 24), 'day');
    expect(filterEntriesInRange(entries, range)).toHaveLength(1);
  });

  it('excludes the exact end boundary', () => {
    const range = { start: at(2026, 6, 24, 0, 0), end: at(2026, 6, 25, 0, 0) };
    const onBoundary = [{ loggedAt: at(2026, 6, 25, 0, 0) }];
    expect(filterEntriesInRange(onBoundary, range)).toHaveLength(0);
  });
});

describe('groupEntriesByDay', () => {
  it('groups by day, newest day and newest entry first', () => {
    const entries = [
      { id: 'a', loggedAt: at(2026, 6, 24, 8) },
      { id: 'b', loggedAt: at(2026, 6, 24, 20) },
      { id: 'c', loggedAt: at(2026, 6, 25, 9) },
    ];
    const groups = groupEntriesByDay(entries);
    expect(groups.map((g) => g.key)).toEqual(['2026-06-25', '2026-06-24']);
    expect(groups[1].entries.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const entries = [{ loggedAt: at(2026, 6, 24, 8) }, { loggedAt: at(2026, 6, 25, 9) }];
    const before = [...entries];
    groupEntriesByDay(entries);
    expect(entries).toEqual(before);
  });
});

describe('formatPeriodLabel', () => {
  it('labels a day with weekday and date', () => {
    expect(formatPeriodLabel(at(2026, 6, 27), 'day')).toBe('Sat, Jun 27');
  });

  it('labels a week as a date range (same month)', () => {
    expect(formatPeriodLabel(at(2026, 6, 24), 'week')).toBe('Jun 21 – 27');
  });

  it('labels a cross-month week with both months', () => {
    // Week containing 2026-07-01 → Sun Jun 28 .. Sat Jul 4
    expect(formatPeriodLabel(at(2026, 7, 1), 'week')).toBe('Jun 28 – Jul 4');
  });

  it('labels a month with year', () => {
    expect(formatPeriodLabel(at(2026, 6, 27), 'month')).toBe('June 2026');
  });
});

describe('filterByEntryType', () => {
  const entries = [
    { type: 'meal' },
    { type: 'snack' },
    { type: 'bowel_movement' },
    { type: 'symptom' },
  ];

  it('all returns everything', () => {
    expect(filterByEntryType(entries, 'all')).toHaveLength(4);
  });

  it('food returns meals and snacks only', () => {
    expect(filterByEntryType(entries, 'food').map((e) => e.type)).toEqual(['meal', 'snack']);
  });

  it('bm returns bowel movements only', () => {
    expect(filterByEntryType(entries, 'bm').map((e) => e.type)).toEqual(['bowel_movement']);
  });

  it('symptom returns symptoms only', () => {
    expect(filterByEntryType(entries, 'symptom').map((e) => e.type)).toEqual(['symptom']);
  });

  it('meds has no log-entry meaning and returns everything, like all', () => {
    expect(filterByEntryType(entries, 'meds')).toHaveLength(4);
  });
});

function makeLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'entry1',
    type: 'meal',
    mealSlot: null,
    name: 'Toast',
    barcode: null,
    loggedAt: at(2026, 6, 24, 8),
    sentiment: null,
    bristolScale: null,
    symptomType: null,
    severity: null,
    notes: null,
    ingredientsText: null,
    tagsJson: null,
    servingG: null,
    calories: null,
    fatG: null,
    saturatedFatG: null,
    carbsG: null,
    proteinG: null,
    fiberG: null,
    sugarG: null,
    sodiumMg: null,
    componentCount: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med1',
    name: 'Omeprazole',
    defaultDose: null,
    doseUnit: null,
    frequency: null,
    startDate: null,
    endDate: null,
    isActive: true,
    isRegular: false,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<MedicationEvent> = {}): MedicationEvent {
  return {
    id: 'evt1',
    takenAt: at(2026, 6, 24, 9),
    timeKnown: true,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeDose(overrides: Partial<MedicationDose> = {}): MedicationDose {
  return {
    id: 'dose1',
    eventId: 'evt1',
    medicationId: 'med1',
    dose: 10,
    doseUnit: 'mg',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('logEntriesToJournalItems', () => {
  it('wraps each entry, keyed by its own id and loggedAt', () => {
    const entry = makeLogEntry({ id: 'e1', loggedAt: 500 });
    expect(logEntriesToJournalItems([entry])).toEqual([{ kind: 'log', id: 'e1', loggedAt: 500, entry }]);
  });
});

describe('medicationEventsToJournalItems', () => {
  it('summarizes each event\'s doses using the CURRENT medication name and the DOSE\'S OWN snapshot', () => {
    const events = [makeEvent({ id: 'evt1' })];
    const doses = [makeDose({ eventId: 'evt1', medicationId: 'med1', dose: 10, doseUnit: 'mg' })];
    // Current default is now 40mg — the snapshot (10mg) must still be shown.
    const meds = [makeMedication({ id: 'med1', name: 'Omeprazole (renamed)', defaultDose: 40, doseUnit: 'mg' })];

    const items = medicationEventsToJournalItems(events, doses, meds);

    expect(items).toEqual([
      {
        kind: 'medication',
        id: 'evt1',
        loggedAt: events[0].takenAt,
        timeKnown: true,
        summary: 'Omeprazole (renamed) 10 mg',
        notes: null,
      },
    ]);
  });

  it('joins multiple doses in one event with " · "', () => {
    const events = [makeEvent({ id: 'evt1' })];
    const doses = [
      makeDose({ id: 'd1', eventId: 'evt1', medicationId: 'medA', dose: 20, doseUnit: 'mg' }),
      makeDose({ id: 'd2', eventId: 'evt1', medicationId: 'medB', dose: 200, doseUnit: 'mg' }),
    ];
    const meds = [
      makeMedication({ id: 'medA', name: 'Omeprazole' }),
      makeMedication({ id: 'medB', name: 'Ibuprofen' }),
    ];

    const items = medicationEventsToJournalItems(events, doses, meds);
    expect(items[0].kind).toBe('medication');
    expect((items[0] as { summary: string }).summary).toBe('Omeprazole 20 mg · Ibuprofen 200 mg');
  });

  it('shows an inactive medication\'s current name (never deleted, #11 invariant)', () => {
    const events = [makeEvent({ id: 'evt1' })];
    const doses = [makeDose({ eventId: 'evt1', medicationId: 'med1' })];
    const meds = [makeMedication({ id: 'med1', name: 'Discontinued Med', isActive: false })];

    const items = medicationEventsToJournalItems(events, doses, meds);
    expect((items[0] as { summary: string }).summary).toBe('Discontinued Med 10 mg');
  });

  it('shows "Unknown medication" when the dose\'s medication row cannot be found', () => {
    const events = [makeEvent({ id: 'evt1' })];
    const doses = [makeDose({ eventId: 'evt1', medicationId: 'missing' })];

    const items = medicationEventsToJournalItems(events, doses, []);
    expect((items[0] as { summary: string }).summary).toBe('Unknown medication 10 mg');
  });

  it('carries the event\'s timeKnown and notes through', () => {
    const events = [makeEvent({ id: 'evt1', timeKnown: false, notes: 'with food' })];
    const items = medicationEventsToJournalItems(events, [], []);
    expect(items[0]).toMatchObject({ timeKnown: false, notes: 'with food' });
  });
});

describe('filterJournalItems', () => {
  const logItem: JournalItem = { kind: 'log', id: 'e1', loggedAt: 100, entry: makeLogEntry({ id: 'e1', type: 'meal', loggedAt: 100 }) };
  const bmItem: JournalItem = { kind: 'log', id: 'e2', loggedAt: 200, entry: makeLogEntry({ id: 'e2', type: 'bowel_movement', loggedAt: 200 }) };
  const medItem: JournalItem = { kind: 'medication', id: 'evt1', loggedAt: 150, timeKnown: true, summary: 'Omeprazole 10 mg', notes: null };
  const items = [logItem, bmItem, medItem];

  it('"all" keeps every item, food and medication alike', () => {
    expect(filterJournalItems(items, 'all')).toEqual(items);
  });

  it('"meds" keeps only medication items', () => {
    expect(filterJournalItems(items, 'meds')).toEqual([medItem]);
  });

  it('"food" keeps only food log items and excludes medication items', () => {
    expect(filterJournalItems(items, 'food')).toEqual([logItem]);
  });

  it('"bm" keeps only BM log items and excludes medication items', () => {
    expect(filterJournalItems(items, 'bm')).toEqual([bmItem]);
  });

  it('merged sort order (by loggedAt via groupEntriesByDay) mixes log and medication items', () => {
    const merged = filterJournalItems(items, 'all');
    const grouped = groupEntriesByDay(merged);
    expect(grouped[0].entries.map((i) => i.id)).toEqual(['e2', 'evt1', 'e1']);
  });

  it('calendar dots (entryDateKeys) include a day that only has a medication item', () => {
    const medOnlyDay: JournalItem = {
      kind: 'medication',
      id: 'evt2',
      loggedAt: at(2026, 6, 30, 9),
      timeKnown: true,
      summary: 'Omeprazole 10 mg',
      notes: null,
    };
    const withMedDay = [...items, medOnlyDay];

    const allKeys = entryDateKeys(filterJournalItems(withMedDay, 'all'));
    expect(allKeys).toContain('2026-06-30');

    const foodKeys = entryDateKeys(filterJournalItems(withMedDay, 'food'));
    expect(foodKeys).not.toContain('2026-06-30');
  });
});

describe('entryDateKeys', () => {
  it('returns unique day keys', () => {
    const entries = [
      { loggedAt: at(2026, 6, 24, 8) },
      { loggedAt: at(2026, 6, 24, 20) },
      { loggedAt: at(2026, 6, 25, 9) },
    ];
    expect(entryDateKeys(entries).sort()).toEqual(['2026-06-24', '2026-06-25']);
  });
});

describe('buildCalendarTheme', () => {
  const palette = {
    background: '#bg',
    text: '#text',
    textSecondary: '#text2',
    accent: '#accent',
    accentText: '#accentText',
    primary: '#primary',
    primaryText: '#primaryText',
  };

  it('gives today its own fill so it is visible without being selected', () => {
    const theme = buildCalendarTheme(palette);
    expect(theme.todayBackgroundColor).toBe('#primary');
    expect(theme.todayTextColor).toBe('#primaryText');
    // Regression: today used to render in plain dayTextColor — indistinguishable.
    expect(theme.todayTextColor).not.toBe(theme.dayTextColor);
  });

  it('never styles today like the selected day', () => {
    const theme = buildCalendarTheme(palette);
    expect(theme.todayBackgroundColor).not.toBe(theme.selectedDayBackgroundColor);
    expect(theme.selectedDayBackgroundColor).toBe('#accent');
    expect(theme.selectedDayTextColor).toBe('#accentText');
  });
});
