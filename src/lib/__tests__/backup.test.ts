import type {
  DayCheckIn,
  DayFactor,
  Experiment,
  LogEntry,
  MealComponent,
  Medication,
  MedicationDose,
  MedicationEvent,
  SavedMeal,
  SavedMealComponent,
} from '@/db/schema';
import { dosesForRestoredEvents, entriesToJson, parseBackupJson } from '../backup';

const BASE_ENTRY: LogEntry = {
  id: 'abc123',
  type: 'meal',
  mealSlot: 'breakfast',
  name: 'Oatmeal',
  barcode: null,
  loggedAt: 1000,
  sentiment: 4,
  bristolScale: null,
  symptomType: null,
  severity: null,
  notes: 'tasty',
  ingredientsText: 'oats, water',
  tagsJson: '["oats","water"]',
  calories: 150,
  fatG: 3,
  saturatedFatG: null,
  carbsG: 25,
  proteinG: 5,
  fiberG: 2,
  sugarG: 1,
  sodiumMg: 50,
  servingG: 150,
  componentCount: null,
  createdAt: 1,
  updatedAt: 2,
};

const BASE_COMPONENT: MealComponent = {
  id: 'comp1',
  entryId: 'abc123',
  name: 'Peas',
  barcode: null,
  servings: 2,
  servingG: 80,
  calories: 50,
  fatG: 0.2,
  saturatedFatG: null,
  carbsG: 9,
  proteinG: 3,
  fiberG: 4,
  sugarG: 3,
  sodiumMg: 2,
  ingredientsText: 'peas',
  tagsJson: '["peas"]',
  sortOrder: 0,
  createdAt: 5,
};

const BASE_MEDICATION: Medication = {
  id: 'med1',
  name: 'Omeprazole',
  defaultDose: 10,
  doseUnit: 'mg',
  frequency: 'once daily',
  startDate: 1700000000000,
  endDate: null,
  isActive: true,
  isRegular: false,
  notes: 'with breakfast',
  createdAt: 1,
  updatedAt: 2,
};

const BASE_MEDICATION_EVENT: MedicationEvent = {
  id: 'evt1',
  takenAt: 1700000100000,
  timeKnown: true,
  notes: 'felt fine',
  createdAt: 3,
  updatedAt: 4,
};

const BASE_MEDICATION_DOSE: MedicationDose = {
  id: 'dose1',
  eventId: 'evt1',
  medicationId: 'med1',
  dose: 10,
  doseUnit: 'mg',
  reason: null,
  createdAt: 5,
  updatedAt: 6,
};

const BASE_DAY_CHECK_IN: DayCheckIn = {
  id: 'ci1',
  date: '2026-06-15',
  status: 'fine',
  createdAt: 7,
  updatedAt: 8,
};

const BASE_DAY_FACTOR: DayFactor = {
  id: 'df1',
  date: '2026-06-15',
  sleep: 'poor',
  stress: 4,
  alcohol: 'a_lot',
  caffeine: 'usual',
  period: true,
  createdAt: 11,
  updatedAt: 12,
};

const BASE_EXPERIMENT: Experiment = {
  id: 'exp1',
  term: 'lactose',
  startDate: '2026-04-01',
  baselineDays: 14,
  eliminationDays: 14,
  challengeDays: 3,
  observationDays: 3,
  status: 'completed',
  verdictJson: '{"kind":"likely-trigger","confidence":"high"}',
  endedAt: 1700000200000,
  createdAt: 9,
  updatedAt: 10,
};

describe('entriesToJson / parseBackupJson roundtrip', () => {
  it('roundtrips a single entry intact', () => {
    const json = entriesToJson([BASE_ENTRY]);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual(BASE_ENTRY);
    expect(result.mealComponents).toHaveLength(0);
    expect(result.medications).toHaveLength(0);
    expect(result.medicationEvents).toHaveLength(0);
    expect(result.medicationDoses).toHaveLength(0);
    expect(result.dayCheckIns).toHaveLength(0);
  });

  it('roundtrips multiple entries', () => {
    const second: LogEntry = { ...BASE_ENTRY, id: 'def456', name: 'Soup' };
    const json = entriesToJson([BASE_ENTRY, second]);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1].name).toBe('Soup');
  });

  it('roundtrips an empty list', () => {
    const json = entriesToJson([]);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(0);
    expect(result.mealComponents).toHaveLength(0);
  });

  it('roundtrips entries with their mealComponent rows intact', () => {
    const json = entriesToJson([BASE_ENTRY], [BASE_COMPONENT]);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mealComponents).toHaveLength(1);
    expect(result.mealComponents[0]).toEqual(BASE_COMPONENT);
  });

  it('roundtrips entries with the medication inventory and history intact', () => {
    const json = entriesToJson(
      [BASE_ENTRY],
      [BASE_COMPONENT],
      [BASE_MEDICATION],
      [BASE_MEDICATION_EVENT],
      [BASE_MEDICATION_DOSE],
    );
    // entriesToJson always writes the current version (9) — parseBackupJson
    // separately still reads older v1-v8 files (tested below).
    expect(JSON.parse(json).version).toBe(9);

    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.medications).toEqual([BASE_MEDICATION]);
    expect(result.medicationEvents).toEqual([BASE_MEDICATION_EVENT]);
    expect(result.medicationDoses).toEqual([BASE_MEDICATION_DOSE]);
    expect(result.dayCheckIns).toEqual([]);
  });

  it('roundtrips entries with day check-ins intact', () => {
    const json = entriesToJson(
      [BASE_ENTRY],
      [BASE_COMPONENT],
      [BASE_MEDICATION],
      [BASE_MEDICATION_EVENT],
      [BASE_MEDICATION_DOSE],
      [BASE_DAY_CHECK_IN],
    );

    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dayCheckIns).toEqual([BASE_DAY_CHECK_IN]);
    expect(result.experiments).toEqual([]);
  });

  it('roundtrips entries with elimination experiments intact (v5 data, now in a v9 file)', () => {
    const json = entriesToJson(
      [BASE_ENTRY],
      [BASE_COMPONENT],
      [BASE_MEDICATION],
      [BASE_MEDICATION_EVENT],
      [BASE_MEDICATION_DOSE],
      [BASE_DAY_CHECK_IN],
      [BASE_EXPERIMENT],
    );
    expect(JSON.parse(json).version).toBe(9);

    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.experiments).toEqual([BASE_EXPERIMENT]);
  });

  it('roundtrips an active experiment with a null verdictJson/endedAt', () => {
    const active: Experiment = { ...BASE_EXPERIMENT, status: 'active', verdictJson: null, endedAt: null };
    const json = entriesToJson([BASE_ENTRY], [], [], [], [], [], [active]);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.experiments).toEqual([active]);
  });
});

describe('legacy v4 backup import (no experiments key)', () => {
  it('imports a v4-shaped file with an empty experiments array', () => {
    const legacy = {
      version: 4,
      entries: [BASE_ENTRY],
      dayCheckIns: [BASE_DAY_CHECK_IN],
    };
    const result = parseBackupJson(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dayCheckIns).toEqual([BASE_DAY_CHECK_IN]);
    expect(result.experiments).toEqual([]);
  });
});

describe('experiment validation', () => {
  it('rejects an experiment missing an id', () => {
    const bad = { ...BASE_EXPERIMENT, id: '' };
    const result = parseBackupJson(JSON.stringify({ version: 5, entries: [BASE_ENTRY], experiments: [bad] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Experiment at index 0 has an invalid shape.');
  });

  it('rejects an experiment with a malformed startDate', () => {
    const bad = { ...BASE_EXPERIMENT, startDate: '04/01/2026' };
    const result = parseBackupJson(JSON.stringify({ version: 5, entries: [BASE_ENTRY], experiments: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an experiment with an invalid status', () => {
    const bad = { ...BASE_EXPERIMENT, status: 'paused' };
    const result = parseBackupJson(JSON.stringify({ version: 5, entries: [BASE_ENTRY], experiments: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an experiment with a non-positive day count', () => {
    const bad = { ...BASE_EXPERIMENT, eliminationDays: 0 };
    const result = parseBackupJson(JSON.stringify({ version: 5, entries: [BASE_ENTRY], experiments: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an experiment whose verdictJson is not a string or null', () => {
    const bad = { ...BASE_EXPERIMENT, verdictJson: 42 };
    const result = parseBackupJson(JSON.stringify({ version: 5, entries: [BASE_ENTRY], experiments: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('defaults verdictJson/endedAt to null when absent (an active experiment)', () => {
    const minimal = {
      id: 'e1',
      term: 'gluten',
      startDate: '2026-04-01',
      baselineDays: 14,
      eliminationDays: 14,
      challengeDays: 3,
      observationDays: 3,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    };
    const result = parseBackupJson(JSON.stringify({ version: 5, entries: [BASE_ENTRY], experiments: [minimal] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.experiments[0].verdictJson).toBeNull();
    expect(result.experiments[0].endedAt).toBeNull();
  });
});

describe('legacy v1 backup import (no mealComponents key)', () => {
  it('imports a v1-shaped file with an empty mealComponents array', () => {
    const legacy = { version: 1, entries: [BASE_ENTRY] };
    const result = parseBackupJson(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.mealComponents).toEqual([]);
    expect(result.medications).toEqual([]);
  });

  it('imports a bare entries array (pre-version format) with no components', () => {
    const result = parseBackupJson(JSON.stringify([BASE_ENTRY]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mealComponents).toEqual([]);
    expect(result.medications).toEqual([]);
  });
});

describe('legacy v2 backup import (no medication keys)', () => {
  it('imports a v2-shaped file with empty medication arrays', () => {
    const legacy = { version: 2, entries: [BASE_ENTRY], mealComponents: [BASE_COMPONENT] };
    const result = parseBackupJson(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mealComponents).toEqual([BASE_COMPONENT]);
    expect(result.medications).toEqual([]);
    expect(result.medicationEvents).toEqual([]);
    expect(result.medicationDoses).toEqual([]);
  });
});

describe('legacy v3 backup import (no dayCheckIns key)', () => {
  it('imports a v3-shaped file with an empty dayCheckIns array', () => {
    const legacy = {
      version: 3,
      entries: [BASE_ENTRY],
      medications: [BASE_MEDICATION],
      medicationEvents: [BASE_MEDICATION_EVENT],
      medicationDoses: [BASE_MEDICATION_DOSE],
    };
    const result = parseBackupJson(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.medications).toEqual([BASE_MEDICATION]);
    expect(result.dayCheckIns).toEqual([]);
  });
});

describe('daily factors (GitHub #23, backup v6)', () => {
  it('roundtrips daily factors intact (v6 data, now in a v9 file)', () => {
    const json = entriesToJson([BASE_ENTRY], [], [], [], [], [], [], [BASE_DAY_FACTOR]);
    expect(JSON.parse(json).version).toBe(9);

    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dayFactors).toEqual([BASE_DAY_FACTOR]);
  });

  it('defaults dayFactors to [] for a v5 file (no key)', () => {
    const result = parseBackupJson(JSON.stringify({ version: 5, entries: [BASE_ENTRY], experiments: [BASE_EXPERIMENT] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dayFactors).toEqual([]);
    expect(result.experiments).toEqual([BASE_EXPERIMENT]);
  });

  it('defaults dayFactors to [] for a v1 file', () => {
    const result = parseBackupJson(JSON.stringify({ version: 1, entries: [BASE_ENTRY] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dayFactors).toEqual([]);
  });

  it('accepts a row with only one factor, treating absent fields as null', () => {
    const minimal = { id: 'df2', date: '2026-06-16', stress: 2, createdAt: 1, updatedAt: 2 };
    const result = parseBackupJson(JSON.stringify({ version: 6, entries: [BASE_ENTRY], dayFactors: [minimal] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dayFactors[0]).toEqual({
      id: 'df2',
      date: '2026-06-16',
      sleep: null,
      stress: 2,
      alcohol: null,
      caffeine: null,
      period: null,
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it.each([
    ['a missing id', { id: '' }],
    ['a malformed date', { date: '06/15/2026' }],
    ['an unknown sleep level', { sleep: 'great' }],
    ['an unknown alcohol level', { alcohol: 'lots' }],
    ['an unknown caffeine level', { caffeine: 'decaf' }],
    ['stress 0', { stress: 0 }],
    ['stress 6', { stress: 6 }],
    ['a fractional stress', { stress: 2.5 }],
    ['a string stress', { stress: '3' }],
    ['a non-boolean period', { period: 1 }],
    ['a missing createdAt', { createdAt: undefined }],
    ['a missing updatedAt', { updatedAt: undefined }],
  ])('rejects a day factor with %s', (_label, override) => {
    const bad = { ...BASE_DAY_FACTOR, ...override };
    const result = parseBackupJson(JSON.stringify({ version: 6, entries: [BASE_ENTRY], dayFactors: [bad] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Day factor at index 0 has an invalid shape.');
  });

  it('accepts null in every factor field (a row whose chips were all cleared)', () => {
    const cleared = { ...BASE_DAY_FACTOR, sleep: null, stress: null, alcohol: null, caffeine: null, period: null };
    const result = parseBackupJson(JSON.stringify({ version: 6, entries: [BASE_ENTRY], dayFactors: [cleared] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dayFactors).toEqual([cleared]);
  });
});

describe('day check-in validation', () => {
  it('rejects a day check-in missing an id', () => {
    const bad = { ...BASE_DAY_CHECK_IN, id: '' };
    const result = parseBackupJson(JSON.stringify({ version: 4, entries: [BASE_ENTRY], dayCheckIns: [bad] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Day check-in at index 0 has an invalid shape.');
  });

  it('rejects a day check-in with a malformed date', () => {
    const bad = { ...BASE_DAY_CHECK_IN, date: '06/15/2026' };
    const result = parseBackupJson(JSON.stringify({ version: 4, entries: [BASE_ENTRY], dayCheckIns: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a day check-in with an invalid status', () => {
    const bad = { ...BASE_DAY_CHECK_IN, status: 'meh' };
    const result = parseBackupJson(JSON.stringify({ version: 4, entries: [BASE_ENTRY], dayCheckIns: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a day check-in missing createdAt/updatedAt', () => {
    const bad = { ...BASE_DAY_CHECK_IN, updatedAt: undefined };
    const result = parseBackupJson(JSON.stringify({ version: 4, entries: [BASE_ENTRY], dayCheckIns: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('accepts a valid rough-status day check-in', () => {
    const roughCheckIn = { ...BASE_DAY_CHECK_IN, id: 'ci2', date: '2026-06-16', status: 'rough' };
    const result = parseBackupJson(JSON.stringify({ version: 4, entries: [BASE_ENTRY], dayCheckIns: [roughCheckIn] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dayCheckIns).toEqual([roughCheckIn]);
  });
});

describe('medication validation', () => {
  it('rejects a medication missing an id', () => {
    const bad = { ...BASE_MEDICATION, id: '' };
    const result = parseBackupJson(JSON.stringify({ version: 3, entries: [BASE_ENTRY], medications: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a medication event missing takenAt', () => {
    const bad = { ...BASE_MEDICATION_EVENT, takenAt: undefined };
    const result = parseBackupJson(
      JSON.stringify({ version: 3, entries: [BASE_ENTRY], medicationEvents: [bad] }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a medication dose missing medicationId', () => {
    const bad = { ...BASE_MEDICATION_DOSE, medicationId: '' };
    const result = parseBackupJson(
      JSON.stringify({ version: 3, entries: [BASE_ENTRY], medicationDoses: [bad] }),
    );
    expect(result.ok).toBe(false);
  });

  it('defaults isActive to true and nullable fields to null when absent', () => {
    const minimal = { id: 'm1', name: 'Vitamin D', createdAt: 1, updatedAt: 1 };
    const result = parseBackupJson(
      JSON.stringify({ version: 3, entries: [BASE_ENTRY], medications: [minimal] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.medications[0].isActive).toBe(true);
    expect(result.medications[0].defaultDose).toBeNull();
    expect(result.medications[0].doseUnit).toBeNull();
  });

  it('roundtrips isRegular in a v9 file (GitHub #26)', () => {
    const regular: Medication = { ...BASE_MEDICATION, id: 'm-reg', isRegular: true };
    const json = entriesToJson([BASE_ENTRY], [], [BASE_MEDICATION, regular]);
    expect(JSON.parse(json).version).toBe(9);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.medications.map((m) => m.isRegular)).toEqual([false, true]);
  });

  it('imports a v7 medication (no isRegular) as not regular', () => {
    const v7Medication = Object.fromEntries(
      Object.entries(BASE_MEDICATION).filter(([key]) => key !== 'isRegular'),
    );
    const result = parseBackupJson(
      JSON.stringify({ version: 7, entries: [BASE_ENTRY], medications: [v7Medication] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.medications[0].isRegular).toBe(false);
  });

  it('treats a non-boolean isRegular as false', () => {
    const odd = { ...BASE_MEDICATION, isRegular: 'yes' };
    const result = parseBackupJson(
      JSON.stringify({ version: 8, entries: [BASE_ENTRY], medications: [odd] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.medications[0].isRegular).toBe(false);
  });
});

describe('medication dose reason (GitHub #28, backup v9)', () => {
  it('roundtrips a dose reason in a v9 file', () => {
    const withReason: MedicationDose = { ...BASE_MEDICATION_DOSE, reason: 'headache' };
    const json = entriesToJson([BASE_ENTRY], [], [BASE_MEDICATION], [BASE_MEDICATION_EVENT], [withReason]);
    expect(JSON.parse(json).version).toBe(9);
    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.medicationDoses).toEqual([withReason]);
  });

  it('imports a v8 dose (no reason) with reason null', () => {
    const v8Dose = Object.fromEntries(Object.entries(BASE_MEDICATION_DOSE).filter(([key]) => key !== 'reason'));
    const result = parseBackupJson(
      JSON.stringify({ version: 8, entries: [BASE_ENTRY], medicationDoses: [v8Dose] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.medicationDoses[0].reason).toBeNull();
  });

  it('normalises a blank or non-string reason to null', () => {
    const blank = { ...BASE_MEDICATION_DOSE, id: 'd-blank', reason: '   ' };
    const odd = { ...BASE_MEDICATION_DOSE, id: 'd-odd', reason: 42 };
    const result = parseBackupJson(
      JSON.stringify({ version: 9, entries: [BASE_ENTRY], medicationDoses: [blank, odd] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.medicationDoses.map((d) => d.reason)).toEqual([null, null]);
  });
});

describe('mealComponent validation', () => {
  it('rejects a mealComponent missing an id', () => {
    const bad = { ...BASE_COMPONENT, id: '' };
    const result = parseBackupJson(JSON.stringify({ version: 2, entries: [BASE_ENTRY], mealComponents: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects a mealComponent missing entryId', () => {
    const bad = { ...BASE_COMPONENT, entryId: undefined };
    const result = parseBackupJson(JSON.stringify({ version: 2, entries: [BASE_ENTRY], mealComponents: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('defaults servings to 1 and sortOrder to 0 when absent', () => {
    const minimal = {
      id: 'c1',
      entryId: 'abc123',
      name: 'Rice',
      createdAt: 1,
    };
    const result = parseBackupJson(
      JSON.stringify({ version: 2, entries: [BASE_ENTRY], mealComponents: [minimal] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mealComponents[0].servings).toBe(1);
    expect(result.mealComponents[0].sortOrder).toBe(0);
    expect(result.mealComponents[0].barcode).toBeNull();
  });
});

describe('parseBackupJson error cases', () => {
  it('rejects invalid JSON', () => {
    const result = parseBackupJson('not json {{{');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/JSON/i);
  });

  it('rejects a file with no entries field and no array', () => {
    const result = parseBackupJson(JSON.stringify({ foo: 'bar' }));
    expect(result.ok).toBe(false);
  });

  it('rejects an entry missing the required id field', () => {
    const bad = { ...BASE_ENTRY, id: '' };
    const result = parseBackupJson(JSON.stringify({ version: 1, entries: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an entry with an unknown type', () => {
    const bad = { ...BASE_ENTRY, type: 'pizza' };
    const result = parseBackupJson(JSON.stringify({ version: 1, entries: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an entry with a non-numeric loggedAt', () => {
    const bad = { ...BASE_ENTRY, loggedAt: '2026-06-28' };
    const result = parseBackupJson(JSON.stringify({ version: 1, entries: [bad] }));
    expect(result.ok).toBe(false);
  });

  it('normalises absent optional fields to null', () => {
    const minimal = {
      id: 'min01',
      type: 'snack',
      name: 'Apple',
      loggedAt: 100,
      createdAt: 1,
      updatedAt: 1,
    };
    const result = parseBackupJson(JSON.stringify({ version: 1, entries: [minimal] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].barcode).toBeNull();
    expect(result.entries[0].calories).toBeNull();
    expect(result.entries[0].servingG).toBeNull();
  });
});

describe('dosesForRestoredEvents', () => {
  const dose = (id: string, eventId: string) => ({ id, eventId });

  it('keeps only doses whose event this restore inserted', () => {
    const doses = [dose('d1', 'newEvent'), dose('d2', 'newEvent'), dose('d3', 'existingEvent')];
    expect(dosesForRestoredEvents(doses, ['newEvent']).map((d) => d.id)).toEqual(['d1', 'd2']);
  });

  it('adds nothing to an event that already exists (an edit re-minted its dose ids)', () => {
    // The device's edited event keeps its current doses; the backup's older
    // dose rows for it (different ids) must not be merged in as duplicates.
    const staleBackupDoses = [dose('old-d1', 'e1'), dose('old-d2', 'e1')];
    expect(dosesForRestoredEvents(staleBackupDoses, [])).toEqual([]);
  });

  it('returns nothing for an empty backup', () => {
    expect(dosesForRestoredEvents([], ['e1'])).toEqual([]);
  });
});

describe('saved meals (GitHub #25, backup v7)', () => {
  const MEAL: SavedMeal = {
    id: 'sm1',
    name: 'Chicken Rice',
    nameKey: 'chicken rice',
    type: 'meal',
    mealSlot: 'dinner',
    createdAt: 10,
    updatedAt: 11,
  };
  const COMPONENT: SavedMealComponent = {
    id: 'smc1',
    savedMealId: 'sm1',
    name: 'Rice',
    barcode: null,
    servings: 1.5,
    servingG: 150,
    calories: 200,
    fatG: 1,
    saturatedFatG: null,
    carbsG: 40,
    proteinG: 4,
    fiberG: 1,
    sugarG: 0,
    sodiumMg: 5,
    ingredientsText: 'rice, water',
    tagsJson: '["rice"]',
    sortOrder: 0,
    createdAt: 10,
  };

  it('roundtrips saved meals and their items in a v9 file', () => {
    const json = entriesToJson([BASE_ENTRY], [], [], [], [], [], [], [], [MEAL], [COMPONENT]);
    expect(JSON.parse(json).version).toBe(9);

    const result = parseBackupJson(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedMeals).toEqual([MEAL]);
    expect(result.savedMealComponents).toEqual([COMPONENT]);
  });

  it('defaults both saved-meal arrays to [] for a v6 file (no keys)', () => {
    const result = parseBackupJson(JSON.stringify({ version: 6, entries: [BASE_ENTRY], dayFactors: [BASE_DAY_FACTOR] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedMeals).toEqual([]);
    expect(result.savedMealComponents).toEqual([]);
  });

  it('defaults both saved-meal arrays to [] for a v1 file', () => {
    const result = parseBackupJson(JSON.stringify({ version: 1, entries: [BASE_ENTRY] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedMeals).toEqual([]);
    expect(result.savedMealComponents).toEqual([]);
  });

  it('re-derives nameKey from the name and trims it, never trusting the file', () => {
    const result = parseBackupJson(
      JSON.stringify({ version: 7, entries: [], savedMeals: [{ ...MEAL, name: '  Chicken RICE ', nameKey: 'whatever' }] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedMeals[0]).toMatchObject({ name: 'Chicken RICE', nameKey: 'chicken rice' });
  });

  it('fills defaults for a minimal saved meal and component', () => {
    const result = parseBackupJson(
      JSON.stringify({
        version: 7,
        entries: [],
        savedMeals: [{ id: 'a', name: 'Toast', type: 'snack', createdAt: 1, updatedAt: 1 }],
        savedMealComponents: [{ id: 'b', savedMealId: 'a', name: 'Bread', createdAt: 1 }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.savedMeals[0].mealSlot).toBeNull();
    expect(result.savedMealComponents[0]).toMatchObject({ servings: 1, sortOrder: 0, calories: null, tagsJson: null });
  });

  it.each([
    ['a blank name', { ...MEAL, name: '  ' }],
    ['a bad type', { ...MEAL, type: 'symptom' }],
    ['a bad meal slot', { ...MEAL, mealSlot: 'brunch' }],
    ['no id', { ...MEAL, id: '' }],
    ['a non-numeric createdAt', { ...MEAL, createdAt: 'x' }],
  ])('rejects a saved meal with %s', (_label, bad) => {
    const result = parseBackupJson(JSON.stringify({ version: 7, entries: [], savedMeals: [bad] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/saved meal at index 0/i);
  });

  it('rejects a saved-meal component without a savedMealId', () => {
    const result = parseBackupJson(
      JSON.stringify({ version: 7, entries: [], savedMealComponents: [{ ...COMPONENT, savedMealId: '' }] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/saved meal component at index 0/i);
  });
});
