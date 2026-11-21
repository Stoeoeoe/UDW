import { describe, expect, it } from 'vitest';
import type { Map as GameMap } from '../../types/schema';
import { farmhouse } from './farmhouse.fixture';
import { buildingLayer, testMap } from './mapPlacement.fixture';
import {
  buildingInstanceAt,
  footprintCollisionCells,
  kitVariationChain,
  placementOrigin,
  placementRefusal,
} from './mapPlacement';

describe('placing buildings on maps', () => {
  it('looks kit variations up from the active map variation through its parents', () => {
    const map: GameMap = {
      ...testMap('test:farm'),
      variations: [
        { id: 'winter', kind: 'season', displayName: 'Winter' },
        { id: 'snowstorm', kind: 'generic', displayName: 'Snowstorm', parentId: 'winter' },
      ],
    };
    expect(kitVariationChain(map, null)).toEqual([]);
    expect(kitVariationChain(map, 'snowstorm')).toEqual(['snowstorm', 'winter']);
  });

  it('puts the door under the pointer', () => {
    expect(placementOrigin(farmhouse(), { x: 10, y: 12 })).toEqual({ x: 4, y: 6 });
  });

  it('finds a building by its roof as well as its footprint', () => {
    const layer = buildingLayer([{ id: 'a', buildingId: 'test:farmhouse', x: 4, y: 6 }]);
    expect(buildingInstanceAt(layer, [farmhouse()], { x: 4, y: 3 })?.id).toBe('a');
    expect(buildingInstanceAt(layer, [farmhouse()], { x: 12, y: 12 })?.id).toBe('a');
    expect(buildingInstanceAt(layer, [farmhouse()], { x: 4, y: 2 })).toBeUndefined();
    expect(buildingInstanceAt(layer, [farmhouse()], { x: 4, y: 13 })).toBeUndefined();
  });

  it('places a building with an interior once in the project', () => {
    const withInterior = { ...farmhouse(), interiorMapId: 'test:farmhouse_inside' };
    const elsewhere = testMap('test:village', [
      buildingLayer([{ id: 'a', buildingId: 'test:farmhouse', x: 0, y: 3 }]),
    ]);
    const here = testMap('test:farm', [buildingLayer()]);
    expect(placementRefusal([here, elsewhere], here, withInterior)).toBe(
      'Farmhouse is already placed on village. A building with an interior can be placed once.',
    );
    expect(placementRefusal([here], here, withInterior)).toBeNull();
    expect(placementRefusal([here, elsewhere], here, farmhouse())).toBeNull();
  });

  it('collides on the whole footprint except the entrance', () => {
    const cells = footprintCollisionCells(farmhouse(), {
      id: 'a',
      buildingId: 'test:farmhouse',
      x: 10,
      y: 20,
    });
    expect(cells).toHaveLength(9 * 7 - 1);
    expect(cells).not.toContainEqual({ x: 16, y: 26 });
    expect(cells).toContainEqual({ x: 14, y: 24 });
  });
});
