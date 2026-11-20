import { describe, expect, it } from 'vitest';
import { SOCIAL_STANDING_BANDS, bandOf } from './socialStandingBands';

describe('social standing bands', () => {
  it('cover 0 to 100 without gaps or overlap', () => {
    expect(SOCIAL_STANDING_BANDS[0].from).toBe(0);
    expect(SOCIAL_STANDING_BANDS.at(-1)!.to).toBe(100);
    SOCIAL_STANDING_BANDS.slice(1).forEach((band, i) =>
      expect(band.from).toBe(SOCIAL_STANDING_BANDS[i].to + 1),
    );
  });

  it('names the band at each edge', () => {
    expect([0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map((standing) => bandOf(standing).id)).toEqual(
      [
        'hostile',
        'hostile',
        'wary',
        'wary',
        'neutral',
        'neutral',
        'friendly',
        'friendly',
        'devoted',
        'devoted',
      ],
    );
  });

  it('rejects a standing outside 0 to 100', () => {
    expect(() => bandOf(101)).toThrow(RangeError);
  });
});
