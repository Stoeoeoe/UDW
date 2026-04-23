import { describe, expect, it, vi } from 'vitest';
import { applyTerrainShape } from './terrainShapeUtils';
import type { Map as GameMap, Tileset } from '../types/schema';

describe('applyTerrainShape', () => {
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
        id: 'terrain',
        name: 'Terrain',
        kind: 'terrain',
        visible: true,
        locked: false,
        opacity: 1,
        zOrder: 0,
        data: Array.from({ length: 4 }, () => Array(4).fill(null)),
        terrainData: Array.from({ length: 4 }, () => Array(4).fill(null)),
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

  it('clips a terrain brush centered outside the map to in-bounds terrain cells', async () => {
    const paintTerrainDataBatch = vi.fn();

    await applyTerrainShape({
      currentMap: map,
      selectedLayerId: 'terrain',
      activeTilesetId: 'village',
      tilesets,
      paintTilesBatch: vi.fn(),
      eraseTilesBatch: vi.fn(),
      paintTerrainDataBatch,
      brushSize: 3,
      mode: 'point',
      start: { x: -1, y: 1 },
      end: { x: -1, y: 1 },
      terrainId: 'grass',
      terrainGridRef: new Map(),
    });

    expect(paintTerrainDataBatch).toHaveBeenCalledWith('terrain', [
      { x: 0, y: 0, terrainId: 'grass' },
      { x: 0, y: 1, terrainId: 'grass' },
      { x: 1, y: 1, terrainId: 'grass' },
      { x: 0, y: 2, terrainId: 'grass' },
    ]);
  });
});
