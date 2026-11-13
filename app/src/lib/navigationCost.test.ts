import { describe, expect, it } from 'vitest';
import {
  computeNavigationCostGrid,
  navigationCostTint,
  DEFAULT_NAVIGATION_COST,
} from './navigationCost';
import type { Layer, Map as GameMap, Tileset } from '../types/schema';

// Tile indices: 0 = road (cost 1), 1 = swamp (cost 9), 2 = decoration (no cost), 3 = rug (cost 5)
const tileset: Tileset = {
  version: 1,
  id: 'base:village',
  name: 'Village',
  spriteSheet: 'village.png',
  columns: 4,
  tileCount: 16,
  tiles: {
    0: { navigationCost: 1 },
    1: { navigationCost: 9 },
    3: { navigationCost: 5 },
  },
  objects: [
    {
      id: 'rug',
      name: 'Rug',
      tiles: [
        { x: 0, y: 0, tileIndex: 3 },
        { x: 1, y: 0, tileIndex: 2 },
      ],
    },
  ],
};
const tilesets = new Map([[tileset.id, tileset]]);

// Encoded tile ref: tilesetRefs[0] in the high bits.
const ref = (index: number) => index;

function layer(
  id: string,
  kind: Layer['kind'],
  zOrder: number,
  data: (number | null)[][],
  visible = true,
): Layer {
  return { id, name: id.toUpperCase(), kind, visible, locked: false, opacity: 1, zOrder, data };
}

function makeMap(layers: Layer[], width = 3, height = 2): GameMap {
  return {
    version: 1,
    id: 'm',
    name: 'M',
    width,
    height,
    baseTilesetId: tileset.id,
    tilesetRefs: [tileset.id],
    layers,
    entities: [],
  } as unknown as GameMap;
}

const empty = (w = 3, h = 2) =>
  Array.from({ length: h }, () => Array<number | null>(w).fill(null));

describe('computeNavigationCostGrid', () => {
  it('uses the default cost with no source when nothing has a cost', () => {
    const grid = computeNavigationCostGrid(
      makeMap([layer('terrain', 'terrain', 0, empty())]),
      tilesets,
      null,
    );
    expect(grid.cells[0][0]).toEqual({ cost: DEFAULT_NAVIGATION_COST, sourceLayerId: null });
  });

  it('uses the terrain tile cost and reports the terrain layer', () => {
    const data = empty();
    data[1][2] = ref(0);
    const grid = computeNavigationCostGrid(
      makeMap([layer('terrain', 'terrain', 0, data)]),
      tilesets,
      null,
    );
    expect(grid.cells[1][2]).toEqual({ cost: 1, sourceLayerId: 'terrain' });
    expect(grid.cells[0][0].cost).toBe(DEFAULT_NAVIGATION_COST);
  });

  it('lets a higher layer with a cost override terrain', () => {
    const t = empty();
    t[0][0] = ref(0);
    const v = empty();
    v[0][0] = ref(1);
    const grid = computeNavigationCostGrid(
      makeMap([layer('terrain', 'terrain', 0, t), layer('over', 'visual', 5, v)]),
      tilesets,
      null,
    );
    expect(grid.cells[0][0]).toEqual({ cost: 9, sourceLayerId: 'over' });
  });

  it('treats tiles without a cost as transparent', () => {
    const t = empty();
    t[0][0] = ref(0);
    const v = empty();
    v[0][0] = ref(2);
    const grid = computeNavigationCostGrid(
      makeMap([layer('terrain', 'terrain', 0, t), layer('deco', 'visual', 5, v)]),
      tilesets,
      null,
    );
    expect(grid.cells[0][0]).toEqual({ cost: 1, sourceLayerId: 'terrain' });
  });

  it('ignores invisible layers', () => {
    const t = empty();
    t[0][0] = ref(0);
    const v = empty();
    v[0][0] = ref(1);
    const grid = computeNavigationCostGrid(
      makeMap([layer('terrain', 'terrain', 0, t), layer('hidden', 'visual', 5, v, false)]),
      tilesets,
      null,
    );
    expect(grid.cells[0][0].cost).toBe(1);
  });

  it('applies override layers in ascending zOrder regardless of array order', () => {
    const a = empty();
    a[0][0] = ref(1);
    const b = empty();
    b[0][0] = ref(3);
    const grid = computeNavigationCostGrid(
      makeMap([layer('high', 'visual', 9, a), layer('low', 'visual', 2, b)]),
      tilesets,
      null,
    );
    expect(grid.cells[0][0]).toEqual({ cost: 9, sourceLayerId: 'high' });
  });

  it('keeps terrain as the base even when its zOrder is above other layers', () => {
    const t = empty();
    t[0][0] = ref(0);
    const v = empty();
    v[0][0] = ref(1);
    const grid = computeNavigationCostGrid(
      makeMap([layer('terrain', 'terrain', 50, t), layer('under', 'visual', 1, v)]),
      tilesets,
      null,
    );
    expect(grid.cells[0][0]).toEqual({ cost: 9, sourceLayerId: 'under' });
  });

  it('applies costs from placed object-layer instances and skips cost-less object tiles', () => {
    const objects: Layer = {
      id: 'objs',
      name: 'Objs',
      kind: 'object',
      visible: true,
      locked: false,
      opacity: 1,
      zOrder: 3,
      objectInstances: [
        { id: 'r1', tilesetId: tileset.id, objectDefinitionId: 'rug', x: 16, y: 16 },
      ],
    };
    const t = empty();
    t[1][2] = ref(0);
    const grid = computeNavigationCostGrid(
      makeMap([layer('terrain', 'terrain', 0, t), objects]),
      tilesets,
      null,
    );
    expect(grid.cells[1][1]).toEqual({ cost: 5, sourceLayerId: 'objs' });
    // Second rug tile has no cost: the terrain cost underneath stays.
    expect(grid.cells[1][2]).toEqual({ cost: 1, sourceLayerId: 'terrain' });
  });
});

describe('navigationCostTint', () => {
  it('has no tint at the default cost, green below and red above', () => {
    expect(navigationCostTint(DEFAULT_NAVIGATION_COST)).toBeNull();
    expect(navigationCostTint(1)?.color).toBe(0x3fb950);
    expect(navigationCostTint(10)?.color).toBe(0xf85149);
  });
});
