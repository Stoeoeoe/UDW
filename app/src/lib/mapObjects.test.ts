import { describe, expect, it } from 'vitest';
import {
  collectObjectPlacementOrigins,
  getCenteredObjectPlacementOrigin,
  getCenteredObjectPlacementPixelOrigin,
  getObjectDefinitionDimensions,
  objectPlacementIntersectsMap,
} from './mapObjects';
import type { Tileset } from '../types/schema';

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
