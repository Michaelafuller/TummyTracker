// The Bristol Stool Scale (1–7) — the single source of truth for value ↔ label.
// Descriptive only; the app presents this as an observation, never medical advice.

export const BRISTOL_VALUES = [1, 2, 3, 4, 5, 6, 7] as const;
export type BristolValue = (typeof BRISTOL_VALUES)[number];

export interface BristolOption {
  value: BristolValue;
  label: string;
}

export const BRISTOL_SCALE: readonly BristolOption[] = [
  { value: 1, label: 'Separate hard lumps' },
  { value: 2, label: 'Lumpy, sausage-like' },
  { value: 3, label: 'Sausage with cracks' },
  { value: 4, label: 'Smooth, soft sausage' },
  { value: 5, label: 'Soft blobs' },
  { value: 6, label: 'Mushy, ragged edges' },
  { value: 7, label: 'Watery, no solids' },
];

const BY_VALUE: Record<BristolValue, BristolOption> = BRISTOL_SCALE.reduce(
  (acc, option) => {
    acc[option.value] = option;
    return acc;
  },
  {} as Record<BristolValue, BristolOption>,
);

export function isBristolValue(n: unknown): n is BristolValue {
  return typeof n === 'number' && BRISTOL_VALUES.includes(n as BristolValue);
}

export function bristolLabel(value: BristolValue): string {
  return BY_VALUE[value].label;
}
