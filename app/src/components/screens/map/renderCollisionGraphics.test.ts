import { describe, it, expect, vi } from 'vitest';
import { computeCollisionOverlay, renderCollisionGraphics } from './useMapRenderer';

describe('renderCollisionGraphics (mocked Graphics)', () => {
  it('invokes Graphics fill and stroke for computed overlay', () => {
    const currentMap: any = {
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
          data: [['ts1:0', 'ts1:1']],
        },
      ],
    };

    const tilesets = new Map();
    tilesets.set('ts1', {
      id: 'ts1',
      tileWidth: 16,
      tileHeight: 16,
      columns: 2,
      spriteSheet: 's.png',
      tiles: [{ collision: { type: 'full' } }, { collision: { type: 'full' } }],
    });

    const { fillPolygons, mergedSegments } = computeCollisionOverlay(currentMap, null, tilesets);

    // Mock Graphics-like object
    const mockG: any = {
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      setStrokeStyle: vi.fn(),
      stroke: vi.fn(),
    };

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
