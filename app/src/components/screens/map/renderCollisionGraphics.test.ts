import { describe, it, expect, vi } from 'vitest';
import { computeCollisionOverlay, renderCollisionGraphics } from './useMapRenderer';
import type { Graphics } from 'pixi.js';
import type { Map as GameMap, Tileset } from '../../../types/schema';

describe('renderCollisionGraphics (mocked Graphics)', () => {
  it('invokes Graphics fill and stroke for computed overlay', () => {
    const currentMap: GameMap = {
      version: 1,
      id: 'map-1',
      name: 'Map 1',
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
          data: [[0, 1]],
        },
      ],
      entities: [],
    };

    const tilesets = new Map<string, Tileset>();
    tilesets.set('ts1', {
      version: 1,
      id: 'ts1',
      name: 'Tileset 1',
      tileWidth: 16,
      tileHeight: 16,
      columns: 2,
      tileCount: 2,
      spriteSheet: 's.png',
      tiles: {
        0: { collision: { type: 'full' } },
        1: { collision: { type: 'full' } },
      },
      wangSets: [],
    });

    const { fillPolygons, mergedSegments } = computeCollisionOverlay(currentMap, null, tilesets);

    // Mock Graphics-like object
    const mockG = {
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      setStrokeStyle: vi.fn(),
      stroke: vi.fn(),
    } as unknown as Graphics;

    renderCollisionGraphics(mockG, fillPolygons, mergedSegments);

    // Expect fill called once per polygon
    expect(mockG.fill).toHaveBeenCalledTimes(fillPolygons.length);
    // Expect stroke called once for merged segments
    expect(mockG.setStrokeStyle).toHaveBeenCalled();
    expect(mockG.stroke).toHaveBeenCalledTimes(1);

    // moveTo should be called for each polygon and for each segment
    expect(mockG.moveTo).toHaveBeenCalled();
    expect(mockG.lineTo).toHaveBeenCalled();
    expect(mockG.closePath).toHaveBeenCalledTimes(fillPolygons.length);
  });
});
