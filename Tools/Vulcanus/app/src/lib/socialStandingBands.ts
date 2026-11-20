/** Named ranges of social standing, 0 to 100, shared by every character. */
export const SOCIAL_STANDING_BANDS = [
  { id: 'hostile', name: 'Hostile', from: 0, to: 19 },
  { id: 'wary', name: 'Wary', from: 20, to: 39 },
  { id: 'neutral', name: 'Neutral', from: 40, to: 59 },
  { id: 'friendly', name: 'Friendly', from: 60, to: 79 },
  { id: 'devoted', name: 'Devoted', from: 80, to: 100 },
] as const;

export type SocialStandingBand = (typeof SOCIAL_STANDING_BANDS)[number];

/** The band a whole standing between 0 and 100 falls in. */
export function bandOf(standing: number): SocialStandingBand {
  const band = SOCIAL_STANDING_BANDS.find(({ from, to }) => standing >= from && standing <= to);
  if (!band) throw new RangeError(`Social standing ${standing} is outside 0 to 100.`);
  return band;
}
