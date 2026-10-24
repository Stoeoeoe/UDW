import { describe, expect, it } from 'vitest';
import { migrateTilesetOnLoad, serializeTileset } from './tilesetMigration';
import type { Tileset } from '../types/schema';

describe('tilesetMigration', () => {
  it('preserves reusable object definitions on save/load', () => {
    const tileset: Tileset = {
      version: 1,
      id: 'base:village',
      name: 'Village',
      spriteSheet: 'village.png',
      columns: 8,
      tileCount: 64,
      tiles: {},
      objects: [
        {
          id: 'obj_tree',
          name: 'Tree',
          tiles: [
            { x: 0, y: 0, tileIndex: 10 },
            { x: 0, y: 1, tileIndex: 26 },
            { x: 0, y: 2, tileIndex: 42 },
          ],
        },
      ],
    };

    const serialized = serializeTileset(tileset);
    expect(serialized.objects).toEqual(tileset.objects);

    const migrated = migrateTilesetOnLoad(serialized);
    expect(migrated.objects).toEqual(tileset.objects);
  });
});
