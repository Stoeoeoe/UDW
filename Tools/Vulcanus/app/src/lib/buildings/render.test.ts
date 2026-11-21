import { describe, expect, it } from 'vitest';
import { drawList } from './render';
import type { KitPiece, ResolvedKit } from './resolveKit';

const blank = { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
const piece = (variations: string[] = []): KitPiece => ({
  base: blank,
  variations: new Map(variations.map((id) => [id, blank])),
});
const kit = {
  pieces: new Map([
    ['roof_slope_m', piece(['winter', 'snowstorm'])],
    ['wall_mid_m', piece()],
    ['chimney_top', piece(['winter'])],
  ]),
} as unknown as ResolvedKit;

describe('draw list', () => {
  it('draws opaque pieces before overlays, each base before its variation', () => {
    const draws = drawList(
      [
        { piece: 'chimney_top', column: 1, row: 0, overlay: true },
        { piece: 'roof_slope_m', column: 1, row: 0, overlay: false },
        { piece: 'wall_mid_m', column: 1, row: 1, overlay: false },
      ],
      kit,
      ['winter'],
    );
    expect(draws).toEqual([
      { piece: 'roof_slope_m', variation: null, x: 16, y: 0 },
      { piece: 'roof_slope_m', variation: 'winter', x: 16, y: 0 },
      { piece: 'wall_mid_m', variation: null, x: 16, y: 16 },
      { piece: 'chimney_top', variation: null, x: 16, y: 0 },
      { piece: 'chimney_top', variation: 'winter', x: 16, y: 0 },
    ]);
  });

  it('uses the first variation in the chain the piece has, and leaves out pieces the kit lacks', () => {
    const draws = drawList(
      [
        { piece: 'roof_slope_m', column: 0, row: 0, overlay: false },
        { piece: 'chimney_top', column: 0, row: 0, overlay: false },
        { piece: 'door_upper', column: 0, row: 0, overlay: false },
      ],
      kit,
      ['snowstorm', 'winter'],
    );
    expect(draws.map((d) => `${d.piece}/${d.variation}`)).toEqual([
      'roof_slope_m/null',
      'roof_slope_m/snowstorm',
      'chimney_top/null',
      'chimney_top/winter',
    ]);
  });
});
