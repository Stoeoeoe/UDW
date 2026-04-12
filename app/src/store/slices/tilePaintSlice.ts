import { StateCreator } from 'zustand';
import { createTileRef } from '../../lib/tileUtils';
import { sampleRandomTile } from '../../lib/randomUtils';
import { samplePatternAt } from '../../lib/tileUtils';
import { floodFillCollect } from '../../lib/algorithms';
import { resolveTileAt } from '../../lib/mapUtils';
import { setTileInState } from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface TilePaintSlice {
  paintTile: (layerId: string, x: number, y: number, tilesetId: string, tileIndex: number) => void;
  paintTilesBatch: (
    layerId: string,
    tiles: Array<{ x: number; y: number; tilesetId: string; tileIndex: number }>,
  ) => void;
  eraseTile: (layerId: string, x: number, y: number) => void;
  eraseTilesBatch: (layerId: string, positions: Array<{ x: number; y: number }>) => void;
  paintTerrainDataBatch: (
    layerId: string,
    cells: Array<{ x: number; y: number; terrainId: string | null }>,
  ) => void;
  bucketFill: (
    layerId: string,
    startX: number,
    startY: number,
    tilesetId: string,
    tileIndex: number,
  ) => void;
  bucketFillAdvanced: (
    layerId: string,
    startX: number,
    startY: number,
    options: {
      mode: 'stamp' | 'random' | 'erase';
      tilesetId?: string;
      tileIndex?: number;
      tileIndices?: number[];
      pattern?: { pattern: (number | null)[][]; patternW: number; patternH: number };
    },
  ) => void;
}

export const createTilePaintSlice: ImmerStateCreator<TilePaintSlice> = (set) => ({
  paintTile: (layerId, x, y, tilesetId, tileIndex) =>
    set((state) => {
      if (!state.currentMap) return;
      setTileInState(
        state.currentMap,
        state.activeVariationId,
        layerId,
        x,
        y,
        createTileRef(tilesetId, tileIndex),
      );
    }),

  paintTilesBatch: (layerId, tiles) =>
    set((state) => {
      if (!state.currentMap) return;
      const { currentMap, activeVariationId } = state;
      for (const { x, y, tilesetId, tileIndex } of tiles) {
        if (x < 0 || y < 0 || x >= currentMap.width || y >= currentMap.height) continue;
        setTileInState(
          currentMap,
          activeVariationId,
          layerId,
          x,
          y,
          createTileRef(tilesetId, tileIndex),
        );
      }
    }),

  eraseTile: (layerId, x, y) =>
    set((state) => {
      if (!state.currentMap) return;
      setTileInState(state.currentMap, state.activeVariationId, layerId, x, y, null);
    }),

  eraseTilesBatch: (layerId, positions) =>
    set((state) => {
      if (!state.currentMap) return;
      const { currentMap, activeVariationId } = state;
      for (const { x, y } of positions) {
        if (x < 0 || y < 0 || x >= currentMap.width || y >= currentMap.height) continue;
        setTileInState(currentMap, activeVariationId, layerId, x, y, null);
      }
    }),

  paintTerrainDataBatch: (layerId, cells) =>
    set((state) => {
      const map = state.currentMap;
      if (!map) return;
      const layer = map.layers.find((l) => l.id === layerId);
      if (!layer) return;
      if (!layer.terrainData) {
        layer.terrainData = Array(map.height)
          .fill(null)
          .map(() => Array(map.width).fill(null));
      }
      for (const { x, y, terrainId } of cells) {
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        layer.terrainData[y][x] = terrainId;
      }
    }),

  bucketFill: (layerId, startX, startY, tilesetId, tileIndex) =>
    set((state) => {
      if (!state.currentMap) return;
      const { currentMap, activeVariationId } = state;
      const targetTileRef = createTileRef(tilesetId, tileIndex);
      const startTile = resolveTileAt(currentMap, layerId, startX, startY, activeVariationId);
      if (startTile === targetTileRef) return;
      const cells = floodFillCollect(
        startX,
        startY,
        currentMap.width,
        currentMap.height,
        (x, y) => resolveTileAt(currentMap, layerId, x, y, activeVariationId) === startTile,
      );
      for (const { x, y } of cells) {
        setTileInState(currentMap, activeVariationId, layerId, x, y, targetTileRef);
      }
    }),

  bucketFillAdvanced: (layerId, startX, startY, options) =>
    set((state) => {
      if (!state.currentMap) return;
      const { currentMap, activeVariationId } = state;
      const { mode, tilesetId, tileIndex, tileIndices, pattern } = options;
      const tileset = tilesetId ? state.tilesets.get(tilesetId) : undefined;
      const startTile = resolveTileAt(currentMap, layerId, startX, startY, activeVariationId);
      const cells = floodFillCollect(
        startX,
        startY,
        currentMap.width,
        currentMap.height,
        (x, y) => resolveTileAt(currentMap, layerId, x, y, activeVariationId) === startTile,
      );

      for (const { x, y } of cells) {
        if (mode === 'erase') {
          setTileInState(currentMap, activeVariationId, layerId, x, y, null);
        } else if (mode === 'random' && tilesetId) {
          const idx = sampleRandomTile(
            tileIndices ?? (tileIndex !== undefined ? [tileIndex] : []),
            tileset,
          );
          if (idx !== null)
            setTileInState(
              currentMap,
              activeVariationId,
              layerId,
              x,
              y,
              createTileRef(tilesetId, idx),
            );
        } else if (mode === 'stamp' && tilesetId) {
          if (pattern && pattern.patternW > 0 && pattern.patternH > 0) {
            const tileIdx = samplePatternAt(
              {
                pattern: pattern.pattern,
                patternW: pattern.patternW,
                patternH: pattern.patternH,
                minCol: 0,
                minRow: 0,
              },
              startX,
              startY,
              x,
              y,
            );
            if (tileIdx !== null)
              setTileInState(
                currentMap,
                activeVariationId,
                layerId,
                x,
                y,
                createTileRef(tilesetId, tileIdx),
              );
          } else if (tileIndex !== undefined && tileIndex !== null) {
            setTileInState(
              currentMap,
              activeVariationId,
              layerId,
              x,
              y,
              createTileRef(tilesetId, tileIndex),
            );
          }
        }
      }
    }),
});
