import { describe, expect, it } from 'vitest';
import {
  collectObjectPlacementOrigins,
  computeObjectInstanceSortDepth,
  expandObjectInstanceSpriteTiles,
  expandObjectInstanceTiles,
  getCenteredObjectPlacementOrigin,
  getCenteredObjectPlacementPixelOrigin,
  getObjectDefinition,
  getObjectDefinitionDimensions,
  getObjectDefinitionPixelSize,
  getObjectInstanceAtTile,
  getObjectInstanceAtWorldPosition,
  getObjectInstanceBounds,
  iterateRenderableObjectTiles,
  objectPlacementIntersectsMap,
  removeObjectInstanceAtTile,
  resolveObjectInstanceTileAt,
} from './mapObjects';
import type { Layer, Tileset } from '../types/schema';

describe('mapObjects placement helpers', () => {
  const tilesets = new Map<string, Tileset>([
    [
      'village',
      {
        version: 1,
        id: 'village',
        name: 'Village',
        spriteSheet: 'village.png',
        columns: 4,
        tileCount: 64,
        tiles: {},
        objects: [
          {
            id: 'tree',
            name: 'Tree',
            tiles: [
              { x: 0, y: 0, tileIndex: 1 },
              { x: 1, y: 0, tileIndex: 2 },
              { x: 0, y: 1, tileIndex: 5 },
            ],
          },
        ],
      },
    ],
  ]);

  it('computes object dimensions from relative tiles', () => {
    expect(getObjectDefinitionDimensions(tilesets, 'village', 'tree')).toEqual({
      width: 2,
      height: 2,
    });
  });

  it('centers placement around the cursor tile and clamps near the map edge', () => {
    expect(getCenteredObjectPlacementOrigin(tilesets, 'village', 'tree', 5, 6, 10, 10)).toEqual({
      x: 4,
      y: 5,
    });

    expect(getCenteredObjectPlacementOrigin(tilesets, 'village', 'tree', 0, 0, 10, 10)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('centers pixel placement around the cursor position without tile snapping', () => {
    expect(
      getCenteredObjectPlacementPixelOrigin(tilesets, 'village', 'tree', 41, 57, 16, 160, 160),
    ).toEqual({
      x: 25,
      y: 41,
    });
  });

  it('detects whether an overhanging object still intersects the map', () => {
    expect(objectPlacementIntersectsMap(tilesets, 'village', 'tree', -16, -16, 16, 10, 10)).toBe(
      true,
    );
    expect(objectPlacementIntersectsMap(tilesets, 'village', 'tree', -40, -40, 16, 10, 10)).toBe(
      false,
    );
  });

  it('collects placement origins for rectangle, circle, and line draw modes', () => {
    expect(
      collectObjectPlacementOrigins(
        'rect',
        { x: 2, y: 2 },
        { x: 5, y: 5 },
        1,
        tilesets,
        'village',
        'tree',
        10,
        10,
      ),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 1, y: 3 },
      { x: 3, y: 3 },
    ]);

    const circleOrigins = collectObjectPlacementOrigins(
      'circle',
      { x: 2, y: 2 },
      { x: 4, y: 2 },
      1,
      tilesets,
      'village',
      'tree',
      10,
      10,
    );
    expect(new Set(circleOrigins.map((origin) => `${origin.x},${origin.y}`)).size).toBe(
      circleOrigins.length,
    );

    expect(
      collectObjectPlacementOrigins(
        'line',
        { x: 2, y: 2 },
        { x: 7, y: 2 },
        1,
        tilesets,
        'village',
        'tree',
        10,
        10,
      ),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 5, y: 1 },
    ]);
  });
});

// ─── Shared fixture ───────────────────────────────────────────────────────────

const villageTileset: Tileset = {
  version: 1,
  id: 'village',
  name: 'Village',
  spriteSheet: 'village.png',
  columns: 4,
  tileCount: 64,
  tiles: {
    1: { pivotY: 2 }, // has non-default pivotY
    2: {},
    5: {},
  },
  objects: [
    {
      id: 'tree',
      name: 'Tree',
      tiles: [
        { x: 0, y: 0, tileIndex: 1 },
        { x: 1, y: 0, tileIndex: 2 },
        { x: 0, y: 1, tileIndex: 5 },
      ],
    },
  ],
  wangSets: [],
};

const tilesets = new Map<string, Tileset>([['village', villageTileset]]);

const TILE_SIZE = 16;

// Object placed at pixel (32, 48) — tile (2,3) top-left
const objectInstance = {
  id: 'inst-1',
  tilesetId: 'village',
  objectDefinitionId: 'tree',
  x: 32,
  y: 48,
};

function makeObjectLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 'obj',
    name: 'Objects',
    kind: 'visual',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 0,
    objectInstances: [objectInstance],
    ...overrides,
  };
}

describe('getObjectDefinition', () => {
  it('returns the definition for a known object', () => {
    expect(getObjectDefinition(tilesets, 'village', 'tree')).toEqual(villageTileset.objects![0]);
  });

  it('returns null for an unknown tileset', () => {
    expect(getObjectDefinition(tilesets, 'unknown', 'tree')).toBeNull();
  });

  it('returns null for an unknown object id', () => {
    expect(getObjectDefinition(tilesets, 'village', 'bush')).toBeNull();
  });
});

describe('getObjectDefinitionPixelSize', () => {
  it('returns pixel size scaled by tileSize', () => {
    // tree is 2×2 tiles
    expect(getObjectDefinitionPixelSize(tilesets, 'village', 'tree', TILE_SIZE)).toEqual({
      width: 32,
      height: 32,
    });
  });

  it('returns null for unknown object', () => {
    expect(getObjectDefinitionPixelSize(tilesets, 'village', 'bush', TILE_SIZE)).toBeNull();
  });
});

describe('expandObjectInstanceTiles', () => {
  it('expands to tile-grid coordinates', () => {
    // objectInstance at pixel (32,48), tileSize=16 → tile origin (2,3)
    const tiles = expandObjectInstanceTiles(
      tilesets,
      'village',
      'tree',
      objectInstance.x,
      objectInstance.y,
      TILE_SIZE,
    );
    expect(tiles).toHaveLength(3);
    expect(tiles).toContainEqual({ x: 2, y: 3, tilesetId: 'village', tileIndex: 1 });
    expect(tiles).toContainEqual({ x: 3, y: 3, tilesetId: 'village', tileIndex: 2 });
    expect(tiles).toContainEqual({ x: 2, y: 4, tilesetId: 'village', tileIndex: 5 });
  });

  it('returns empty array for unknown object', () => {
    expect(expandObjectInstanceTiles(tilesets, 'village', 'bush', 0, 0, TILE_SIZE)).toEqual([]);
  });
});

describe('expandObjectInstanceSpriteTiles', () => {
  it('expands to pixel coordinates relative to the instance origin', () => {
    const tiles = expandObjectInstanceSpriteTiles(
      tilesets,
      'village',
      'tree',
      objectInstance.x,
      objectInstance.y,
      TILE_SIZE,
    );
    expect(tiles).toHaveLength(3);
    // Tile at relative (0,0) → pixel (32, 48)
    expect(tiles).toContainEqual({ x: 32, y: 48, tilesetId: 'village', tileIndex: 1 });
    // Tile at relative (1,0) → pixel (48, 48)
    expect(tiles).toContainEqual({ x: 48, y: 48, tilesetId: 'village', tileIndex: 2 });
    // Tile at relative (0,1) → pixel (32, 64)
    expect(tiles).toContainEqual({ x: 32, y: 64, tilesetId: 'village', tileIndex: 5 });
  });

  it('returns empty array for unknown object', () => {
    expect(expandObjectInstanceSpriteTiles(tilesets, 'village', 'bush', 0, 0, TILE_SIZE)).toEqual(
      [],
    );
  });
});

describe('getObjectInstanceBounds', () => {
  it('returns bounding rect in pixels', () => {
    expect(getObjectInstanceBounds(tilesets, objectInstance, TILE_SIZE)).toEqual({
      x: 32,
      y: 48,
      width: 32,
      height: 32,
    });
  });

  it('returns null for unknown object definition', () => {
    expect(
      getObjectInstanceBounds(
        tilesets,
        { ...objectInstance, objectDefinitionId: 'bush' },
        TILE_SIZE,
      ),
    ).toBeNull();
  });
});

describe('resolveObjectInstanceTileAt', () => {
  it('returns tile ref for a tile covered by an object instance', () => {
    const layer = makeObjectLayer();
    // tile (2,3) is covered by the tree trunk (tileIndex 1)
    expect(resolveObjectInstanceTileAt(layer, 2, 3, tilesets, TILE_SIZE)).toBe('village:1');
    // tile (3,3) is covered (tileIndex 2)
    expect(resolveObjectInstanceTileAt(layer, 3, 3, tilesets, TILE_SIZE)).toBe('village:2');
  });

  it('returns null for a tile not covered by any object', () => {
    const layer = makeObjectLayer();
    expect(resolveObjectInstanceTileAt(layer, 0, 0, tilesets, TILE_SIZE)).toBeNull();
  });

  it('falls back to objectGroups when no objectInstances cover the tile', () => {
    const layer: Layer = {
      id: 'obj',
      name: 'Objects',
      kind: 'visual',
      visible: true,
      locked: false,
      opacity: 1,
      zOrder: 0,
      objectGroups: [
        {
          id: 'grp-1',
          tiles: [{ x: 5, y: 5, tilesetId: 'village', tileIndex: 7 }],
        },
      ],
    };
    expect(resolveObjectInstanceTileAt(layer, 5, 5, tilesets, TILE_SIZE)).toBe('village:7');
    expect(resolveObjectInstanceTileAt(layer, 0, 0, tilesets, TILE_SIZE)).toBeNull();
  });
});

describe('getObjectInstanceAtTile', () => {
  it('returns the object instance that covers the given tile', () => {
    const layer = makeObjectLayer();
    expect(getObjectInstanceAtTile(layer, 2, 3, tilesets, TILE_SIZE)).toEqual(objectInstance);
  });

  it('returns null when no instance covers the tile', () => {
    const layer = makeObjectLayer();
    expect(getObjectInstanceAtTile(layer, 0, 0, tilesets, TILE_SIZE)).toBeNull();
  });

  it('returns the topmost (last in array) instance for overlapping instances', () => {
    const instance2 = {
      id: 'inst-2',
      tilesetId: 'village',
      objectDefinitionId: 'tree',
      x: 32,
      y: 48,
    };
    const layer = makeObjectLayer({ objectInstances: [objectInstance, instance2] });
    // Last instance is returned (topmost paint order)
    expect(getObjectInstanceAtTile(layer, 2, 3, tilesets, TILE_SIZE)).toEqual(instance2);
  });
});

describe('getObjectInstanceAtWorldPosition', () => {
  it('returns the instance whose sprite tiles contain the world position', () => {
    const layer = makeObjectLayer();
    // tile at (32,48) to (48,64) — hit inside first tile
    expect(getObjectInstanceAtWorldPosition(layer, 33, 49, tilesets, TILE_SIZE)).toEqual(
      objectInstance,
    );
  });

  it('returns null for a world position not covered by any instance', () => {
    const layer = makeObjectLayer();
    expect(getObjectInstanceAtWorldPosition(layer, 0, 0, tilesets, TILE_SIZE)).toBeNull();
  });
});

describe('removeObjectInstanceAtTile', () => {
  it('removes and returns the instance at the given tile', () => {
    const layer = makeObjectLayer({
      objectInstances: [{ ...objectInstance }],
    });
    const removed = removeObjectInstanceAtTile(layer, 2, 3, tilesets, TILE_SIZE);
    expect(removed).toEqual(objectInstance);
    expect(layer.objectInstances).toHaveLength(0);
  });

  it('returns null and leaves layer unchanged when no instance at tile', () => {
    const layer = makeObjectLayer({
      objectInstances: [{ ...objectInstance }],
    });
    const removed = removeObjectInstanceAtTile(layer, 0, 0, tilesets, TILE_SIZE);
    expect(removed).toBeNull();
    expect(layer.objectInstances).toHaveLength(1);
  });
});

describe('computeObjectInstanceSortDepth', () => {
  it('uses the maximum (tile.y + pivotY * tileSize) across all sprite tiles', () => {
    const layer = makeObjectLayer();
    // Tiles:
    //   (32,48) tileIndex=1, pivotY=2 → depth = 48 + 2*16 = 80
    //   (48,48) tileIndex=2, pivotY=undefined→1 → depth = 48 + 16 = 64
    //   (32,64) tileIndex=5, pivotY=undefined→1 → depth = 64 + 16 = 80
    // max = 80, plus zOrder=0 → 80
    const depth = computeObjectInstanceSortDepth(tilesets, layer, objectInstance, TILE_SIZE);
    expect(depth).toBe(80);
  });

  it('includes layer zOrder in the depth', () => {
    const layer = makeObjectLayer({ zOrder: 10 });
    const depth = computeObjectInstanceSortDepth(tilesets, layer, objectInstance, TILE_SIZE);
    expect(depth).toBe(90);
  });

  it('falls back to objectInstance.y (no zOrder) when no tiles', () => {
    const emptyTilesets = new Map<string, Tileset>([
      [
        'village',
        {
          ...villageTileset,
          objects: [{ id: 'empty', name: 'Empty', tiles: [] }],
        },
      ],
    ]);
    const layer = makeObjectLayer({ zOrder: 5 });
    const inst = { ...objectInstance, objectDefinitionId: 'empty' };
    // When no sprite tiles exist the implementation returns objectInstance.y directly
    expect(computeObjectInstanceSortDepth(emptyTilesets, layer, inst, TILE_SIZE)).toBe(inst.y);
  });
});

describe('iterateRenderableObjectTiles', () => {
  const baseMap = {
    version: 1 as const,
    id: 'map',
    name: 'Map',
    width: 10,
    height: 10,
    baseTilesetId: 'village',
    tilesetRefs: ['village'],
    layers: [],
    entities: [],
    variations: [],
  };

  it('returns tiles from objectInstances when present', () => {
    const layer = makeObjectLayer();
    const tiles = iterateRenderableObjectTiles(baseMap, layer, tilesets, TILE_SIZE);
    expect(tiles).toHaveLength(3);
    expect(tiles).toContainEqual({ x: 2, y: 3, tilesetId: 'village', tileIndex: 1 });
  });

  it('returns tiles from objectGroups when no objectInstances', () => {
    const layer: Layer = {
      id: 'obj',
      name: 'Objects',
      kind: 'visual',
      visible: true,
      locked: false,
      opacity: 1,
      zOrder: 0,
      objectGroups: [
        {
          id: 'grp',
          tiles: [
            { x: 1, y: 1, tilesetId: 'village', tileIndex: 3 },
            { x: 2, y: 2, tilesetId: 'village', tileIndex: 4 },
          ],
        },
      ],
    };
    const tiles = iterateRenderableObjectTiles(baseMap, layer, tilesets, TILE_SIZE);
    expect(tiles).toHaveLength(2);
  });

  it('returns empty array for a layer with no object data', () => {
    const layer: Layer = {
      id: 'empty',
      name: 'Empty',
      kind: 'visual',
      visible: true,
      locked: false,
      opacity: 1,
      zOrder: 0,
    };
    const tiles = iterateRenderableObjectTiles(baseMap, layer, tilesets, TILE_SIZE);
    expect(tiles).toHaveLength(0);
  });
});
