import { StateCreator } from 'zustand';
import { resolveTileAt } from '../../lib/mapUtils';
import { sampleRandomTile } from '../../lib/randomUtils';
import { samplePatternAt } from '../../lib/tileUtils';
import { createTileRef } from '../../lib/tileRef';
import { floodFillCollect } from '../../lib/algorithms';
import { setTileInState } from '../storeHelpers';

export interface TileSlice {
  paintTile: (
    layerId: string,
    x: number,
    y: number,
    tilesetId: string,
    tileIndex: number,
  ) => void;
  paintTilesBatch: (
    layerId: string,
    tiles: Array<{
      x: number;
      y: number;
      tilesetId: string;
      tileIndex: number;
    }>,
  ) => void;
  eraseTile: (layerId: string, x: number, y: number) => void;
  eraseTilesBatch: (
    layerId: string,
    positions: Array<{ x: number; y: number }>,
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
      pattern?: {
        pattern: (number | null)[][];
        patternW: number;
        patternH: number;
      };
    },
  ) => void;
}

export const createTileSlice: StateCreator<any, any, [], TileSlice> = (set) => ({
  paintTile: (layerId, x, y, tilesetId, tileIndex) =>
    set((state: any) => {
      if (!state.currentMap) return;
      const tileRef = createTileRef(tilesetId, tileIndex);
      setTileInState(
        state.currentMap,
        state.activeVariationId,
        layerId,
        x,
        y,
        tileRef,
      );
    }),

  paintTilesBatch: (layerId, tiles) =>
    set((state: any) => {
      if (!state.currentMap) return;
      for (const { x, y, tilesetId, tileIndex } of tiles) {
        if (
          x < 0 ||
          y < 0 ||
          x >= state.currentMap.width ||
          y >= state.currentMap.height
        )
          continue;
        setTileInState(
          state.currentMap,
          state.activeVariationId,
          layerId,
          x,
          y,
          createTileRef(tilesetId, tileIndex),
        );
      }
    }),

  eraseTile: (layerId, x, y) =>
    set((state: any) => {
      if (!state.currentMap) return;
      setTileInState(
        state.currentMap,
        state.activeVariationId,
        layerId,
        x,
        y,
        null,
      );
    }),

  eraseTilesBatch: (layerId, positions) =>
    set((state: any) => {
      if (!state.currentMap) return;
      for (const { x, y } of positions) {
        if (
          x < 0 ||
          y < 0 ||
          x >= state.currentMap.width ||
          y >= state.currentMap.height
        )
          continue;
        setTileInState(
          state.currentMap,
          state.activeVariationId,
          layerId,
          x,
          y,
          null,
        );
      }
    }),

  bucketFill: (
    layerId: string,
    startX: number,
    startY: number,
    tilesetId: string,
    tileIndex: number,
  ) =>
    set((state: any) => {
      if (!state.currentMap) return;
      const map = state.currentMap;
      const targetTileRef = createTileRef(tilesetId, tileIndex);
      const startTile = resolveTileAt(
        map,
        layerId,
        startX,
        startY,
        state.activeVariationId,
      );

      if (startTile === targetTileRef) return;

      const tilesToFill = floodFillCollect(
        startX,
        startY,
        map.width,
        map.height,
        (x, y) =>
          resolveTileAt(map, layerId, x, y, state.activeVariationId) ===
          startTile,
      );

      for (const { x, y } of tilesToFill) {
        setTileInState(
          map,
          state.activeVariationId,
          layerId,
          x,
          y,
          targetTileRef,
        );
      }
    }),

  bucketFillAdvanced: (layerId, startX, startY, options) =>
    set((state: any) => {
      if (!state.currentMap) return;
      const map = state.currentMap;
      const { mode, tilesetId, tileIndex, tileIndices, pattern } = options;
      const tileset = tilesetId ? state.tilesets.get(tilesetId) : undefined;
      const startTile = resolveTileAt(
        map,
        layerId,
        startX,
        startY,
        state.activeVariationId,
      );

      const tilesToFill = floodFillCollect(
        startX,
        startY,
        map.width,
        map.height,
        (x, y) =>
          resolveTileAt(map, layerId, x, y, state.activeVariationId) ===
          startTile,
      );

      for (const { x, y } of tilesToFill) {
        if (mode === 'erase') {
          setTileInState(map, state.activeVariationId, layerId, x, y, null);
        } else if (mode === 'random' && tilesetId) {
          const randomIdx = sampleRandomTile(
            tileIndices || (tileIndex !== undefined ? [tileIndex] : []),
            tileset,
          );
          if (randomIdx !== null) {
            setTileInState(
              map,
              state.activeVariationId,
              layerId,
              x,
              y,
              createTileRef(tilesetId, randomIdx),
            );
          }
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
            if (tileIdx !== null) {
              setTileInState(
                map,
                state.activeVariationId,
                layerId,
                x,
                y,
                createTileRef(tilesetId, tileIdx),
              );
            }
          } else if (tileIndex !== undefined && tileIndex !== null) {
            setTileInState(
              map,
              state.activeVariationId,
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
