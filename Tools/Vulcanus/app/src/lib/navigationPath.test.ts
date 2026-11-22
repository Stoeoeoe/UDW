import { describe, expect, it } from 'vitest';
import {
  computeBlockedGrid,
  computeMapNavigation,
  findGridPath,
  planRoute,
  polygonOverlapsBox,
} from './navigationPath';
import type { NavigationCostGrid } from './navigationCost';
import type { Layer, Map as GameMap, MapCollision, Tileset } from '../types/schema';
import { indexObjects } from './mapObjects';

const TILE = 16;

// Tile indices: 0 = grass, 1 = road (cost 1), 2 = wall (full collision), 3 = fence post (small centred polygon),
// 4 = low hedge along the top edge only.
const tileset: Tileset = {
  version: 1,
  id: 'base:village',
  name: 'Village',
  spriteSheet: 'village.png',
  columns: 8,
  tileCount: 8,
  tiles: {
    1: { navigationCost: 1 },
    2: { collision: { type: 'full' } },
    3: {
      collision: {
        type: 'complex',
        shapes: [
          {
            id: 'p',
            type: 'polygon',
            points: [
              [0.4, 0.4],
              [0.6, 0.4],
              [0.6, 0.6],
              [0.4, 0.6],
            ],
          },
        ],
      },
    },
    4: {
      collision: {
        type: 'complex',
        shapes: [
          {
            id: 'p',
            type: 'polygon',
            points: [
              [0, 0],
              [1, 0],
              [1, 0.1],
              [0, 0.1],
            ],
          },
        ],
      },
    },
    // A bench: a rectangle across the middle.
    5: {
      collision: {
        type: 'complex',
        shapes: [{ id: 'r', type: 'rectangle', x: 0.1, y: 0.45, width: 0.8, height: 0.1 }],
      },
    },
  },
} as unknown as Tileset;
const tilesets = new Map([[tileset.id, tileset]]);
const objects = indexObjects([
  {
    formatVersion: 1,
    id: 'test:stone',
    name: 'Stone',
    tilesetId: tileset.id,
    tiles: [{ x: 0, y: 0, tileIndex: 2 }],
  },
]);

/** A map from rows of characters: . grass, = road, # wall, o fence post, ~ hedge, b bench. */
function makeMap(rows: string[], collisions: MapCollision[] = []): GameMap {
  const codes: Record<string, number> = { '.': 0, '=': 1, '#': 2, o: 3, '~': 4, b: 5 };
  const terrain: Layer = {
    id: 'terrain',
    name: 'Terrain',
    kind: 'terrain',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 0,
    data: rows.map((row) => [...row].map((c) => codes[c])),
  };
  return {
    version: 1,
    id: 'base:village',
    name: 'Village',
    width: rows[0].length,
    height: rows.length,
    baseTilesetId: tileset.id,
    tilesetRefs: [tileset.id],
    layers: [terrain],
    entities: [],
    spatialPrimitives: { collisions },
  } as unknown as GameMap;
}

const grid = (costs: number[][]): NavigationCostGrid => ({
  width: costs[0].length,
  height: costs.length,
  cells: costs.map((row) => row.map((cost) => ({ cost, sourceLayerId: null }))),
});
const open = (w: number, h: number) =>
  Array.from({ length: h }, () => Array<boolean>(w).fill(false));

describe('computeBlockedGrid', () => {
  it('blocks full-collision tiles and polygons that reach the middle of a cell', () => {
    const blocked = computeBlockedGrid(makeMap(['.#o~']), tilesets, objects, TILE);
    expect(blocked[0]).toEqual([false, true, true, false]); // a hedge on the tile's edge leaves the middle free
  });

  it('counts rectangle shapes, as Unity does', () => {
    expect(computeBlockedGrid(makeMap(['b.']), tilesets, objects, TILE)[0]).toEqual([true, false]);
  });

  it('blocks under placed objects at their exact position, also between tiles', () => {
    const map = makeMap(['....', '....']);
    // A one-tile stone placed 1.5 tiles across and half a tile down covers the middles of four cells.
    map.layers.push({
      id: 'objects',
      name: 'Objects',
      kind: 'object',
      visible: true,
      locked: false,
      opacity: 1,
      zOrder: 1,
      objectInstances: [{ id: 's', objectId: 'test:stone', x: 24, y: 8 }],
    } as unknown as Layer);
    expect(computeBlockedGrid(map, tilesets, objects, TILE)).toEqual([
      [false, true, true, false],
      [false, true, true, false],
    ]);
  });

  it('blocks cells that drawn water covers more than half of', () => {
    const map = makeMap(['....', '....']);
    // Each pixel row: 25 water pixels (all of cell 0, 9 of 16 columns of cell 1), 7 dry, 7 water (cell 2), 25 dry.
    const rle = Array.from({ length: 2 * TILE }, () => [1, 25, 0, 7, 1, 7, 0, 25]).flat();
    map.layers.push({
      id: 'water',
      name: 'Water',
      kind: 'water',
      visible: true,
      locked: false,
      opacity: 1,
      zOrder: 1,
      waterBodies: [{ id: 'pond', name: 'Pond' }],
      waterMask: { width: 4 * TILE, height: 2 * TILE, rle },
    } as unknown as Layer);
    expect(computeBlockedGrid(map, tilesets, objects, TILE)).toEqual([
      [true, true, false, false],
      [true, true, false, false],
    ]);
  });

  it('blocks cells under the map collision shapes', () => {
    const map = makeMap(
      ['....', '....'],
      [
        { id: 'rect', shape: 'rectangle', position: [0, 0], size: [32, 16] },
        { id: 'circle', shape: 'circle', position: [56, 24], radius: 6 },
      ],
    );
    expect(computeBlockedGrid(map, tilesets, objects, TILE)).toEqual([
      [true, true, false, false],
      [false, false, false, true],
    ]);
  });

  it.each([
    [0, 0, 4, 16, true],
    [12, 0, 4, 16, true],
    [0, 0, 16, 4, true],
    [0, 12, 16, 4, true],
    [0, 0, 4, 4, true],
    [0, 0, 3, 16, false],
    [13, 0, 3, 16, false],
  ] as const)(
    'blocks footprint contact but leaves gaps free: rectangle (%s, %s, %s, %s)',
    (x, y, w, h, expected) => {
      const map = makeMap(
        ['.'],
        [{ id: 'rect', shape: 'rectangle', position: [x, y], size: [w, h] }],
      );
      expect(computeBlockedGrid(map, tilesets, objects, TILE)[0][0]).toBe(expected);
    },
  );

  it('ignores hidden layers', () => {
    const map = makeMap(['#']);
    map.layers[0].visible = false;
    expect(computeBlockedGrid(map, tilesets, objects, TILE)).toEqual([[false]]);
  });
});

describe('polygonOverlapsBox', () => {
  const box: [[number, number], [number, number]] = [
    [1, 1],
    [2, 2],
  ];
  it('detects containment either way and crossing edges', () => {
    expect(
      polygonOverlapsBox(
        [
          [1.4, 1.4],
          [1.6, 1.4],
          [1.5, 1.6],
        ],
        box,
      ),
    ).toBe(true);
    expect(
      polygonOverlapsBox(
        [
          [0, 0],
          [3, 0],
          [3, 3],
          [0, 3],
        ],
        box,
      ),
    ).toBe(true);
    expect(
      polygonOverlapsBox(
        [
          [0, 1.5],
          [3, 1.5],
          [3, 1.6],
          [0, 1.6],
        ],
        box,
      ),
    ).toBe(true);
    expect(
      polygonOverlapsBox(
        [
          [3, 3],
          [4, 3],
          [4, 4],
        ],
        box,
      ),
    ).toBe(false);
  });
});

describe('findGridPath', () => {
  it('walks straight and merges the run into its end cell', () => {
    const path = findGridPath([0, 0], [3, 0], grid([[2, 2, 2, 2]]), open(4, 1));
    expect(path).toEqual({ waypoints: [[3, 0]], totalCost: 6 });
  });

  it('prefers a cheaper road over a shorter field, like Unity', () => {
    // The top row is field with swamp (9) between start and goal; the bottom row is road (1).
    const costs = grid([
      [2, 9, 9, 9, 2],
      [1, 1, 1, 1, 1],
    ]);
    const path = findGridPath([0, 0], [4, 0], costs, open(5, 2))!;
    expect(path.waypoints).toEqual([
      [1, 1],
      [3, 1],
      [4, 0],
    ]);
  });

  it('never cuts a corner past a blocked cell', () => {
    const blocked = open(2, 2);
    blocked[0][1] = true;
    const path = findGridPath(
      [0, 0],
      [1, 1],
      grid([
        [2, 2],
        [2, 2],
      ]),
      blocked,
    )!;
    expect(path.waypoints).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it('returns null when the goal is blocked or walled off, and an empty route for the same cell', () => {
    const blocked = open(3, 1);
    blocked[0][1] = true;
    expect(findGridPath([0, 0], [2, 0], grid([[2, 2, 2]]), blocked)).toBeNull();
    expect(findGridPath([0, 0], [1, 0], grid([[2, 2, 2]]), blocked)).toBeNull();
    expect(findGridPath([1, 0], [1, 0], grid([[2, 2, 2]]), blocked)).toEqual({
      waypoints: [],
      totalCost: 0,
    });
  });
});

describe('planRoute', () => {
  it('goes from the exact start through turning cell middles to the exact destination', () => {
    const map = makeMap(['...', '.#.', '...']);
    const route = planRoute(
      computeMapNavigation(map, tilesets, objects, TILE),
      [8, 8],
      [40, 44],
      TILE,
    );
    expect(route?.[0]).toEqual([0.5, 0.5]);
    expect(route?.[route.length - 1]).toEqual([2.5, 2.75]);
    expect(route?.slice(1, -1).every(([x, y]) => x % 1 === 0.5 && y % 1 === 0.5)).toBe(true);
  });

  it('is null when no route exists', () => {
    const map = makeMap(['.#.']);
    expect(
      planRoute(computeMapNavigation(map, tilesets, objects, TILE), [8, 8], [40, 8], TILE),
    ).toBeNull();
  });
});
