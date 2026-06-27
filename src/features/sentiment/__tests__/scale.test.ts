import {
  isSentimentValue,
  SENTIMENT_SCALE,
  SENTIMENT_VALUES,
  sentimentEmoji,
  sentimentLabel,
  sentimentOption,
} from '../scale';

describe('sentiment scale', () => {
  it('has exactly five options for values 1..5 in order', () => {
    expect(SENTIMENT_SCALE.map((o) => o.value)).toEqual([1, 2, 3, 4, 5]);
    expect(SENTIMENT_VALUES).toEqual([1, 2, 3, 4, 5]);
  });

  it('maps every value to a non-empty label and emoji', () => {
    for (const value of SENTIMENT_VALUES) {
      expect(sentimentEmoji(value).length).toBeGreaterThan(0);
      expect(sentimentLabel(value).length).toBeGreaterThan(0);
      expect(sentimentOption(value).value).toBe(value);
    }
  });

  it('matches the constitution mapping (1=very unhappy 😖 .. 5=very satisfied 😄)', () => {
    expect(sentimentLabel(1)).toBe('very unhappy');
    expect(sentimentEmoji(1)).toBe('😖');
    expect(sentimentLabel(3)).toBe('neutral');
    expect(sentimentLabel(5)).toBe('very satisfied');
    expect(sentimentEmoji(5)).toBe('😄');
  });

  it('guards valid vs invalid sentiment values', () => {
    expect(isSentimentValue(1)).toBe(true);
    expect(isSentimentValue(5)).toBe(true);
    expect(isSentimentValue(0)).toBe(false);
    expect(isSentimentValue(6)).toBe(false);
    expect(isSentimentValue(2.5)).toBe(false);
    expect(isSentimentValue('3')).toBe(false);
    expect(isSentimentValue(null)).toBe(false);
  });
});
