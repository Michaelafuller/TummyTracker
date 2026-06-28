// Symptom types — single source of truth for value ↔ label (HANDOFF.md flagship trio).
// Mirror of features/bm/bristol.ts.

export const SYMPTOM_TYPE_VALUES = [
  'bloating',
  'constipation',
  'diarrhea',
  'cramps',
  'gas',
  'heartburn',
  'nausea',
  'upset_stomach',
  'fatigue',
] as const;

export type SymptomTypeValue = (typeof SYMPTOM_TYPE_VALUES)[number];

export interface SymptomTypeOption {
  value: SymptomTypeValue;
  label: string;
}

export const SYMPTOM_TYPES: readonly SymptomTypeOption[] = [
  { value: 'bloating', label: 'Bloating' },
  { value: 'constipation', label: 'Constipation' },
  { value: 'diarrhea', label: 'Diarrhea' },
  { value: 'cramps', label: 'Cramps' },
  { value: 'gas', label: 'Gas' },
  { value: 'heartburn', label: 'Heartburn' },
  { value: 'nausea', label: 'Nausea' },
  { value: 'upset_stomach', label: 'Upset stomach' },
  { value: 'fatigue', label: 'Fatigue' },
];

const BY_VALUE: Record<SymptomTypeValue, SymptomTypeOption> = SYMPTOM_TYPES.reduce(
  (acc, option) => {
    acc[option.value] = option;
    return acc;
  },
  {} as Record<SymptomTypeValue, SymptomTypeOption>,
);

export function isSymptomTypeValue(n: unknown): n is SymptomTypeValue {
  return typeof n === 'string' && SYMPTOM_TYPE_VALUES.includes(n as SymptomTypeValue);
}

export function symptomTypeLabel(value: SymptomTypeValue): string {
  return BY_VALUE[value].label;
}
