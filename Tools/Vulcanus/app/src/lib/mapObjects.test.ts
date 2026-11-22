import { describe, expect, it } from 'vitest';
import {
  collectObjectPlacementOrigins,
  computeObjectInstanceSortDepth,
  expandObjectInstanceSpriteTiles,
  expandObjectInstanceTiles,
  getCenteredObjectPlacementOrigin,
  getCenteredObjectPlacementPixelOrigin,
  getObjectDimensions,
  getObjectInstanceAtTile,
  getObjectInstanceAtWorldPosition,
  getObjectInstanceBounds,
  indexObjects,
  iterateRenderableObjectTiles,
  mapsPlacingObject,
  objectPlacementIntersectsMap,
  removeObjectInstanceAtTile,
  resolveObjectInstanceTileAt,
} from './mapObjects';
import type { Layer, MapObjectInstance, Tileset } from '../types/schema';
import type { ObjectDefinition } from '../types/object';

const TILE_SIZE = 16;

// A 2 x 2 object with its bottom-right tile missing; tile 1 stands 2 tiles above the ground.
const tree: ObjectDefinition = {
  formatVersion: 1,
  id: 'test:tree',
  name: 'Tree',
  tilesetId: 'test:props',
  tiles: [
    { x: 0, y: 0, tileIndex: 1 },
    { x: 1, y: 0, tileIndex: 2 },
    { x: 0, y: 1, tileIndex: 5 },
  ],
};
const empty: ObjectDefinition = { ...tree, id: 'test:empty', name: 'Empty', tiles: [] };
const objects = indexObjects([tree, empty]);

const tilesets = new Map<string, Tileset>([
  [
    'test:props',
    {
      version: 1,
      id: 'test:props',
      name: 'Props',
      spriteSheet: 'props.png',
      columns: 4,
      tileCount: 64,
      tiles: { 1: { pivotY: 2 }, 2: {}, 5: {} },
      wangSets: [],
    },
  ],
]);

// Placed at pixel (32, 48): tile (2, 3) top-left.
const placed: MapObjectInstance = { id: 'inst-1', objectId: 'test:tree', x: 32, y: 48 };

function makeObjectLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: 'obj',
    name: 'Objects',
    kind: 'object',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 0,
    objectInstances: [placed],
    ...overrides,
  };
}

describe('placement', () => {
  it('measures an object in tiles, and knows nothing of unknown or empty objects', () => {
    expect(getObjectDimensions(objects, 'test:tree')).toEqual({ width: 2, height: 2 });
    expect(getObjectDimensions(objects, 'test:bush')).toBeNull();
    expect(getObjectDimensions(objects, 'test:empty')).toBeNull();
  });

  it('centers placement around the cursor tile and clamps near the map edge', () => {
    expect(getCenteredObjectPlacementOrigin(objects, 'test:tree', 5, 6, 10, 10)).toEqual({
      x: 4,
      y: 5,
    });
    expect(getCenteredObjectPlacementOrigin(objects, 'test:tree', 0, 0, 10, 10)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('centers pixel placement around the cursor position without tile snapping', () => {
    expect(
      getCenteredObjectPlacementPixelOrigin(objects, 'test:tree', 41, 57, 16, 160, 160),
    ).toEqual({ x: 25, y: 41 });
  });

  it('detects whether an overhanging object still intersects the map', () => {
    expect(objectPlacementIntersectsMap(objects, 'test:tree', -16, -16, 16, 10, 10)).toBe(true);
    expect(objectPlacementIntersectsMap(objects, 'test:tree', -40, -40, 16, 10, 10)).toBe(false);
  });

  it('collects placement origins for rectangle, circle, and line draw modes', () => {
    const collect = (mode: 'rect' | 'circle' | 'line', end: { x: number; y: number }) =>
      collectObjectPlacementOrigins(mode, { x: 2, y: 2 }, end, 1, objects, 'test:tree', 10, 10);

    expect(collect('rect', { x: 5, y: 5 })).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 1, y: 3 },
      { x: 3, y: 3 },
    ]);
    const circle = collect('circle', { x: 4, y: 2 });
    expect(new Set(circle.map((origin) => `${origin.x},${origin.y}`)).size).toBe(circle.length);
    expect(collect('line', { x: 7, y: 2 })).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 5, y: 1 },
    ]);
  });
});

describe('placed objects', () => {
  it('expand to map cells and to pixels, with their tileset', () => {
    expect(expandObjectInstanceTiles(objects, placed, TILE_SIZE)).toEqual([
      { x: 2, y: 3, tilesetId: 'test:props', tileIndex: 1 },
      { x: 3, y: 3, tilesetId: 'test:props', tileIndex: 2 },
      { x: 2, y: 4, tilesetId: 'test:props', tileIndex: 5 },
    ]);
    expect(expandObjectInstanceSpriteTiles(objects, placed, TILE_SIZE)).toEqual([
      { x: 32, y: 48, tilesetId: 'test:props', tileIndex: 1 },
      { x: 48, y: 48, tilesetId: 'test:props', tileIndex: 2 },
      { x: 32, y: 64, tilesetId: 'test:props', tileIndex: 5 },
    ]);
    const unknown = { ...placed, objectId: 'test:bush' };
    expect(expandObjectInstanceTiles(objects, unknown, TILE_SIZE)).toEqual([]);
    expect(expandObjectInstanceSpriteTiles(objects, unknown, TILE_SIZE)).toEqual([]);
  });

  it('have pixel bounds, unless the object is unknown', () => {
    expect(getObjectInstanceBounds(objects, placed, TILE_SIZE)).toEqual({
      x: 32,
      y: 48,
      width: 32,
      height: 32,
    });
    expect(
      getObjectInstanceBounds(objects, { ...placed, objectId: 'test:bush' }, TILE_SIZE),
    ).toBeNull();
  });

  it('show their tiles at the cells they cover', () => {
    const layer = makeObjectLayer();
    expect(resolveObjectInstanceTileAt(layer, 2, 3, objects, TILE_SIZE)).toBe('test:props:1');
    expect(resolveObjectInstanceTileAt(layer, 3, 3, objects, TILE_SIZE)).toBe('test:props:2');
    expect(resolveObjectInstanceTileAt(layer, 3, 4, objects, TILE_SIZE)).toBeNull();
    expect(iterateRenderableObjectTiles(layer, objects, TILE_SIZE)).toHaveLength(3);
    expect(
      iterateRenderableObjectTiles(makeObjectLayer({ objectInstances: undefined }), objects),
    ).toEqual([]);
  });

  it('are found by cell and by world position, the last placed on top', () => {
    const second = { ...placed, id: 'inst-2' };
    const layer = makeObjectLayer({ objectInstances: [placed, second] });
    expect(getObjectInstanceAtTile(layer, 2, 3, objects, TILE_SIZE)).toEqual(second);
    expect(getObjectInstanceAtTile(layer, 0, 0, objects, TILE_SIZE)).toBeNull();
    expect(getObjectInstanceAtWorldPosition(layer, 33, 49, objects, TILE_SIZE)).toEqual(second);
    expect(getObjectInstanceAtWorldPosition(layer, 0, 0, objects, TILE_SIZE)).toBeNull();
  });

  it('are removed at a cell they cover, and not elsewhere', () => {
    const layer = makeObjectLayer({ objectInstances: [{ ...placed }] });
    expect(removeObjectInstanceAtTile(layer, 0, 0, objects, TILE_SIZE)).toBeNull();
    expect(layer.objectInstances).toHaveLength(1);
    expect(removeObjectInstanceAtTile(layer, 2, 3, objects, TILE_SIZE)).toEqual(placed);
    expect(layer.objectInstances).toHaveLength(0);
  });

  it('sort by the lowest ground line of their tiles, after the layer order', () => {
    // Tile 1 at y 48 with pivotY 2 and tile 5 at y 64 with pivotY 1 both reach 80.
    expect(computeObjectInstanceSortDepth(objects, tilesets, makeObjectLayer(), placed, 16)).toBe(
      80,
    );
    const layer = makeObjectLayer({ zOrder: 10 });
    expect(computeObjectInstanceSortDepth(objects, tilesets, layer, placed, 16)).toBe(90);
    // An object without tiles sorts at its top edge.
    const bare = { ...placed, objectId: 'test:empty' };
    expect(computeObjectInstanceSortDepth(objects, tilesets, layer, bare, 16)).toBe(48);
  });

  it('name the maps they are placed on', () => {
    const map = (id: string, layer: Layer) => ({ id, layers: [layer] });
    const maps = [
      map('test:farm', makeObjectLayer()),
      map('test:town', makeObjectLayer({ objectInstances: [] })),
    ];
    expect(mapsPlacingObject(maps, 'test:tree').map((entry) => entry.id)).toEqual(['test:farm']);
    expect(mapsPlacingObject(maps, 'test:bush')).toEqual([]);
  });
});
