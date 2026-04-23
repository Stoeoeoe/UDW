import { describe, expect, it, vi } from 'vitest';
import { applyShape } from './shapeUtils';
import type { Map as GameMap, Tileset } from '../types/schema';

describe('applyShape', () => {
  const map: GameMap = {
    version: 1,
    id: 'map',
    name: 'Map',
    width: 4,
    height: 4,
    baseTilesetId: 'village',
    tilesetRefs: ['village'],
    layers: [
      {
        id: 'ground',
        name: 'Ground',
        kind: 'visual',
        visible: true,
        locked: false,
        opacity: 1,
        zOrder: 0,
        data: Array.from({ length: 4 }, () => Array(4).fill(null)),
      },
    ],
    entities: [],
  };

  const tilesets = new Map<string, Tileset>([
    [
      'village',
      {
        version: 1,
        id: 'village',
        name: 'Village',
        spriteSheet: 'village.png',
        columns: 4,
        tileCount: 16,
        tiles: {},
      },
    ],
  ]);

  it('clips a brush centered outside the map to in-bounds paint operations', async () => {
    const paintTilesBatch = vi.fn();

    await applyShape({
      currentMap: map,
      selectedLayerId: 'ground',
      activeTilesetId: 'village',
      selectedTileIndex: 2,
      selectedTileIndices: [],
      activeTool: 'stamp',
      tilesets,
      paintTilesBatch,
      eraseTilesBatch: vi.fn(),
      getPattern: () => null,
      brushSize: 3,
      mode: 'point',
      start: { x: -1, y: 1 },
      end: { x: -1, y: 1 },
      action: 'paint',
    });

    expect(paintTilesBatch).toHaveBeenCalledWith('ground', [
      { x: 0, y: 0, tilesetId: 'village', tileIndex: 2 },
      { x: 0, y: 1, tilesetId: 'village', tileIndex: 2 },
      { x: 1, y: 1, tilesetId: 'village', tileIndex: 2 },
      { x: 0, y: 2, tilesetId: 'village', tileIndex: 2 },
    ]);
  });
});
