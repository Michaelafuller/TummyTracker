// The 1–5 sentiment scale — the SINGLE source of truth for value ↔ label ↔ emoji
// (CLAUDE.md §7). Never hard-code these emojis or labels in screens; import from here.

export const SENTIMENT_VALUES = [1, 2, 3, 4, 5] as const;
export type SentimentValue = (typeof SENTIMENT_VALUES)[number];

export interface SentimentOption {
  value: SentimentValue;
  /** Short human label, e.g. "neutral". */
  label: string;
  emoji: string;
}

export const SENTIMENT_SCALE: readonly SentimentOption[] = [
  { value: 1, label: 'very unhappy', emoji: '😖' },
  { value: 2, label: 'unhappy', emoji: '🙁' },
  { value: 3, label: 'neutral', emoji: '😐' },
  { value: 4, label: 'satisfied', emoji: '🙂' },
  { value: 5, label: 'very satisfied', emoji: '😄' },
];

const BY_VALUE: Record<SentimentValue, SentimentOption> = SENTIMENT_SCALE.reduce(
  (acc, option) => {
    acc[option.value] = option;
    return acc;
  },
  {} as Record<SentimentValue, SentimentOption>,
);

/** Type guard: is `n` one of the valid 1–5 sentiment values? */
export function isSentimentValue(n: unknown): n is SentimentValue {
  return typeof n === 'number' && SENTIMENT_VALUES.includes(n as SentimentValue);
}

/** Full option (label + emoji) for a value. Throws on an out-of-range value. */
export function sentimentOption(value: SentimentValue): SentimentOption {
  return BY_VALUE[value];
}

export function sentimentEmoji(value: SentimentValue): string {
  return BY_VALUE[value].emoji;
}

export function sentimentLabel(value: SentimentValue): string {
  return BY_VALUE[value].label;
}
