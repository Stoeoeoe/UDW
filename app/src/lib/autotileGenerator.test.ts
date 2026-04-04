import { describe, expect, it } from 'vitest';
import { composeTilePixels, getAutoTilePatterns } from './autotileGenerator';

describe('getAutoTilePatterns', () => {
  it('returns full 16-corner pattern set', () => {
    const patterns = getAutoTilePatterns('full');
    expect(patterns).toHaveLength(16);
    expect(patterns.some((p) => p.key === 'ABBA')).toBe(true);
    expect(patterns.some((p) => p.key === 'BAAB')).toBe(true);
  });

  it('returns simple set without checkerboards', () => {
    const patterns = getAutoTilePatterns('simple');
    expect(patterns).toHaveLength(14);
    expect(patterns.some((p) => p.key === 'ABBA')).toBe(false);
    expect(patterns.some((p) => p.key === 'BAAB')).toBe(false);
  });
});

describe('composeTilePixels', () => {
  it('uses terrain A pixels for all-A corner pattern', () => {
    const aPixels = new Uint8ClampedArray([255, 0, 0, 255]);
    const bPixels = new Uint8ClampedArray([0, 255, 0, 255]);

    const result = composeTilePixels(['A', 'A', 'A', 'A'], aPixels, bPixels, 1, 1);
    expect(Array.from(result)).toEqual([255, 0, 0, 255]);
  });

  it('uses terrain B pixels for all-B corner pattern', () => {
    const aPixels = new Uint8ClampedArray([255, 0, 0, 255]);
    const bPixels = new Uint8ClampedArray([0, 255, 0, 255]);

    const result = composeTilePixels(['B', 'B', 'B', 'B'], aPixels, bPixels, 1, 1);
    expect(Array.from(result)).toEqual([0, 255, 0, 255]);
  });
});
