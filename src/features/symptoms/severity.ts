// Severity scale 1–5 for symptom entries. 1 = mild, 5 = very severe.
// Separate from the sentiment scale (1 = bad experience there); these are orthogonal.

export const SEVERITY_VALUES = [1, 2, 3, 4, 5] as const;
export type SeverityValue = (typeof SEVERITY_VALUES)[number];

export interface SeverityOption {
  value: SeverityValue;
  label: string;
}

export const SEVERITY_SCALE: readonly SeverityOption[] = [
  { value: 1, label: 'Mild' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'Significant' },
  { value: 4, label: 'Severe' },
  { value: 5, label: 'Very severe' },
];

const BY_VALUE: Record<SeverityValue, SeverityOption> = SEVERITY_SCALE.reduce(
  (acc, option) => {
    acc[option.value] = option;
    return acc;
  },
  {} as Record<SeverityValue, SeverityOption>,
);

export function isSeverityValue(n: unknown): n is SeverityValue {
  return typeof n === 'number' && SEVERITY_VALUES.includes(n as SeverityValue);
}

export function severityLabel(value: SeverityValue): string {
  return BY_VALUE[value].label;
}
