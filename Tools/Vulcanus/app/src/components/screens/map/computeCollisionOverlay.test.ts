import { describe, it, expect } from 'vitest';
import { computeCollisionOverlay } from './useMapRenderer';
import type { Map as GameMap, Tileset } from '../../../types/schema';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeMap(overrides: Partial<GameMap> = {}): GameMap {
  return {
    version: 1,
    id: 'test-map',
    name: 'Test Map',
    width: 2,
    height: 1,
    baseTilesetId: 'ts1',
    tilesetRefs: ['ts1'],
    variations: [],
    layers: [],
    entities: [],
    ...overrides,
  };
}

function makeTileset(
  tiles: Record<number, { collision?: { type: string; shapes?: unknown[] } }>,
  id = 'ts1',
): Tileset {
  return {
    version: 1,
    id,
    name: 'Tileset',
    columns: 2,
    tileCount: 4,
    spriteSheet: 's.png',
    tiles: tiles as Tileset['tiles'],
    wangSets: [],
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('computeCollisionOverlay integration', () => {
  it('computes merged segments for a map with adjacent full-tile collisions', () => {
    const currentMap = makeMap({
      layers: [
        {
          id: 'ground',
          name: 'Ground',
          kind: 'visual',
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 0,
          data: [[0, 1]],
        },
      ],
    });

    const tilesets = new Map<string, Tileset>();
    tilesets.set(
      'ts1',
      makeTileset({
        0: { collision: { type: 'full' } },
        1: { collision: { type: 'full' } },
      }),
    );

    const { fillPolygons, mergedSegments } = computeCollisionOverlay(currentMap, null, tilesets);

    // Two fill polygons expected (one per tile)
    expect(fillPolygons.length).toBe(2);

    // Shared middle edge should be cancelled out
    expect(mergedSegments.size).toBeLessThan(8);
  });

  it('returns empty results for null map', () => {
    const { fillPolygons, mergedSegments } = computeCollisionOverlay(null, null, new Map());
    expect(fillPolygons).toHaveLength(0);
    expect(mergedSegments.size).toBe(0);
  });

  it('skips tiles with collision type "none"', () => {
    const currentMap = makeMap({
      layers: [
        {
          id: 'ground',
          name: 'Ground',
          kind: 'visual',
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 0,
          data: [[0, 1]],
        },
      ],
    });

    const tilesets = new Map<string, Tileset>();
    tilesets.set(
      'ts1',
      makeTileset({
        0: { collision: { type: 'none' } },
        1: { collision: { type: 'none' } },
      }),
    );

    const { fillPolygons, mergedSegments } = computeCollisionOverlay(currentMap, null, tilesets);
    expect(fillPolygons).toHaveLength(0);
    expect(mergedSegments.size).toBe(0);
  });

  it('skips invisible layers', () => {
    const currentMap = makeMap({
      layers: [
        {
          id: 'ground',
          name: 'Ground',
          kind: 'visual',
          visible: false, // invisible
          locked: false,
          opacity: 1,
          zOrder: 0,
          data: [[0, 1]],
        },
      ],
    });

    const tilesets = new Map<string, Tileset>();
    tilesets.set(
      'ts1',
      makeTileset({
        0: { collision: { type: 'full' } },
        1: { collision: { type: 'full' } },
      }),
    );

    const { fillPolygons } = computeCollisionOverlay(currentMap, null, tilesets);
    expect(fillPolygons).toHaveLength(0);
  });

  it('skips layers that are not visual or object kind', () => {
    const currentMap = makeMap({
      layers: [
        {
          id: 'terrain',
          name: 'Terrain',
          kind: 'terrain', // not visual or object
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 0,
          data: [[0, 1]],
        },
      ],
    });

    const tilesets = new Map<string, Tileset>();
    tilesets.set(
      'ts1',
      makeTileset({
        0: { collision: { type: 'full' } },
        1: { collision: { type: 'full' } },
      }),
    );

    const { fillPolygons } = computeCollisionOverlay(currentMap, null, tilesets);
    expect(fillPolygons).toHaveLength(0);
  });

  it('processes object-kind layers the same as visual layers', () => {
    const currentMap = makeMap({
      layers: [
        {
          id: 'objects',
          name: 'Objects',
          kind: 'object',
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 0,
          data: [[0, 1]],
        },
      ],
    });

    const tilesets = new Map<string, Tileset>();
    tilesets.set(
      'ts1',
      makeTileset({
        0: { collision: { type: 'full' } },
        1: { collision: { type: 'full' } },
      }),
    );

    const { fillPolygons } = computeCollisionOverlay(currentMap, null, tilesets);
    expect(fillPolygons).toHaveLength(2);
  });

  it('handles complex collision with polygon shapes', () => {
    const currentMap = makeMap({
      width: 1,
      height: 1,
      layers: [
        {
          id: 'ground',
          name: 'Ground',
          kind: 'visual',
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 0,
          data: [[0]],
        },
      ],
    });

    const tilesets = new Map<string, Tileset>();
    tilesets.set(
      'ts1',
      makeTileset({
        0: {
          collision: {
            type: 'complex',
            shapes: [
              {
                id: 'shape-1',
                type: 'polygon',
                // A triangle occupying bottom-left half of tile (normalized 0..1 coords)
                points: [
                  [0, 0],
                  [1, 0],
                  [0, 1],
                ] as [number, number][],
              },
            ],
          },
        },
      }),
    );

    const { fillPolygons, mergedSegments } = computeCollisionOverlay(
      currentMap,
      null,
      tilesets,
      16,
    );
    expect(fillPolygons).toHaveLength(1);
    expect(fillPolygons[0]).toHaveLength(3);
    // Segments from a triangle (3 edges, none shared)
    expect(mergedSegments.size).toBe(3);
  });

  it('skips complex shapes with fewer than 3 points', () => {
    const currentMap = makeMap({
      width: 1,
      height: 1,
      layers: [
        {
          id: 'ground',
          name: 'Ground',
          kind: 'visual',
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 0,
          data: [[0]],
        },
      ],
    });

    const tilesets = new Map<string, Tileset>();
    tilesets.set(
      'ts1',
      makeTileset({
        0: {
          collision: {
            type: 'complex',
            shapes: [
              {
                id: 'shape-bad',
                type: 'polygon',
                points: [
                  [0, 0],
                  [1, 0],
                ] as [number, number][], // only 2 points
              },
            ],
          },
        },
      }),
    );

    const { fillPolygons } = computeCollisionOverlay(currentMap, null, tilesets, 16);
    expect(fillPolygons).toHaveLength(0);
  });

  it('uses suffixed tileset for a variation with tilesetSuffix', () => {
    const currentMap = makeMap({
      width: 1,
      height: 1,
      variations: [
        {
          id: 'winter',
          displayName: 'Winter',
          kind: 'season',
          tilesetSuffix: '_winter',
        },
      ],
      layers: [
        {
          id: 'ground',
          name: 'Ground',
          kind: 'visual',
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 0,
          data: [[0]],
        },
      ],
    });

    const tilesets = new Map<string, Tileset>();
    // Base tileset: no collision
    tilesets.set('ts1', makeTileset({ 0: { collision: { type: 'none' } } }, 'ts1'));
    // Suffixed tileset: has collision
    tilesets.set('ts1_winter', makeTileset({ 0: { collision: { type: 'full' } } }, 'ts1_winter'));

    const { fillPolygons } = computeCollisionOverlay(currentMap, 'winter', tilesets, 16);
    expect(fillPolygons).toHaveLength(1);
  });
});
