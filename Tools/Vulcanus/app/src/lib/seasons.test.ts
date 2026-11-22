import { describe, expect, it } from 'vitest';
import {
  findSeasonTwin,
  isSeasonTwin,
  opaqueTileIndices,
  seasonalTileset,
  seasonTwinMismatch,
} from './seasons';
import type { Tileset } from '../types/schema';

const tileset = (id: string, extra: Partial<Tileset> = {}): Tileset => ({
  version: 1,
  id,
  name: id,
  spriteSheet: `${id}.png`,
  columns: 2,
  tileCount: 4,
  tiles: {},
  ...extra,
});

const village = tileset('test:village');
const winter = tileset('test:village_winter', { baseTilesetId: 'test:village', season: 'winter' });

describe('season twins', () => {
  it('are found by base tileset and season', () => {
    const all = [village, winter];
    expect(isSeasonTwin(winter)).toBe(true);
    expect(isSeasonTwin(village)).toBe(false);
    expect(findSeasonTwin(all, 'test:village', 'winter')).toBe(winter);
    expect(findSeasonTwin(all, 'test:village', 'summer')).toBeUndefined();
    expect(findSeasonTwin(all, 'test:other', 'winter')).toBeUndefined();
  });

  it('need the same grid as their base', () => {
    expect(seasonTwinMismatch(winter, village)).toBeNull();
    expect(seasonTwinMismatch({ columns: 4, tileCount: 4 }, village)).toMatch(/same grid/);
    expect(seasonTwinMismatch({ columns: 2, tileCount: 6 }, village)).toMatch(/same grid/);
  });

  it('only redraw tiles in a season', () => {
    const tilesets = new Map([
      [village.id, village],
      [winter.id, winter],
    ]);
    expect(seasonalTileset(tilesets, village, 0, null, new Map(), 2)).toBe(village);
    // Without the twin's sheet loaded, the base is drawn.
    expect(seasonalTileset(tilesets, village, 0, 'winter', new Map(), 2)).toBe(village);
  });
});

describe('opaqueTileIndices', () => {
  it('lists the tiles with any visible pixel', () => {
    // A 4 x 4 sheet of 2 x 2 tiles; one pixel of tile 1 and one of tile 2 are visible.
    const width = 4;
    const pixels = new Uint8ClampedArray(width * 4 * 4);
    const showPixel = (x: number, y: number) => (pixels[(y * width + x) * 4 + 3] = 1);
    showPixel(3, 1);
    showPixel(0, 2);
    expect([...opaqueTileIndices(pixels, width, 2, 4, 2)]).toEqual([1, 2]);
  });
});
