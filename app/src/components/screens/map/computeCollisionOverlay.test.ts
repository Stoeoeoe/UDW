import { describe, it, expect } from 'vitest';
import { computeCollisionOverlay } from './useMapRenderer';
import type { Map as GameMap, Tileset } from '../../../types/schema';

describe('computeCollisionOverlay integration', () => {
  it('computes merged segments for a map with adjacent full-tile collisions', () => {
    // Create a minimal 2x1 map with two visual tiles, both full collision
    const currentMap: GameMap = {
      width: 2,
      height: 1,
      baseTilesetId: 'ts1',
      tilesetRefs: ['ts1'],
      variations: [],
      layers: [
        {
          id: 'ground',
          kind: 'visual',
          visible: true,
          zOrder: 0,
        },
      ],
      // layer data: ground layer with two tiles referencing ts1:0 and ts1:1
      // resolveTileAt uses encoded strings of the form 'tsId:index'
    };

    // We will stub resolveTileAt behavior by placing encoded refs in a data grid
    currentMap.layers[0].data = [[0, 1]];

    const tilesets = new Map<string, Tileset>();
    tilesets.set('ts1', {
      id: 'ts1',
      columns: 2,
      spriteSheet: 's.png',
      tiles: {
        0: { collision: { type: 'full' } },
        1: { collision: { type: 'full' } },
      },
    });

    const { fillPolygons, mergedSegments } = computeCollisionOverlay(currentMap, null, tilesets);

    // Two fill polygons expected (one per tile)
    expect(fillPolygons.length).toBe(2);

    // Shared middle edge between the two tiles should be toggled twice and removed
    // So mergedSegments should have less than the sum of individual edges (8)
    expect(mergedSegments.size).toBeLessThan(8);
  });
});
