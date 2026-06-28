import {
  entryDateKeys,
  filterByEntryType,
  filterEntriesInRange,
  formatPeriodLabel,
  getPeriodRange,
  groupEntriesByDay,
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
  ];

  it('all returns everything', () => {
    expect(filterByEntryType(entries, 'all')).toHaveLength(3);
  });

  it('food returns meals and snacks only', () => {
    expect(filterByEntryType(entries, 'food').map((e) => e.type)).toEqual(['meal', 'snack']);
  });

  it('bm returns bowel movements only', () => {
    expect(filterByEntryType(entries, 'bm').map((e) => e.type)).toEqual(['bowel_movement']);
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
