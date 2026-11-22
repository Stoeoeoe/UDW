import { StateCreator } from 'zustand';
import { createTileRef } from '../../lib/tileUtils';
import { sampleRandomTile } from '../../lib/randomUtils';
import { samplePatternAt } from '../../lib/tileUtils';
import { floodFillCollect } from '../../lib/algorithms';
import {
  createMapObjectInstanceId,
  indexObjects,
  removeObjectInstanceAtTile,
} from '../../lib/mapObjects';
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
  selectedObjectInstanceId: string | null;
  paintTile: (layerId: string, x: number, y: number, tilesetId: string, tileIndex: number) => void;
  paintTilesBatch: (
    layerId: string,
    tiles: Array<{ x: number; y: number; tilesetId: string; tileIndex: number }>,
  ) => void;
  placeObjectInstance: (layerId: string, x: number, y: number, objectId: string) => void;
  removeObjectInstance: (layerId: string, objectInstanceId: string) => void;
  moveObjectInstance: (layerId: string, objectInstanceId: string, x: number, y: number) => void;
  selectObjectInstance: (id: string | null) => void;
  eraseTile: (layerId: string, x: number, y: number) => void;
  eraseTilesBatch: (layerId: string, positions: Array<{ x: number; y: number }>) => void;
  eraseObjectInstanceAt: (layerId: string, x: number, y: number) => void;
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
  selectedObjectInstanceId: null,

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

  placeObjectInstance: (layerId, x, y, objectId) =>
    set((state) => {
      if (!state.currentMap || state.activeVariationId) return;
      const layer = state.currentMap.layers.find((candidate) => candidate.id === layerId);
      if (!layer || layer.locked) return;
      if (!layer.objectInstances) {
        layer.objectInstances = [];
      }
      const objectInstanceId = createMapObjectInstanceId();
      layer.objectInstances.push({ id: objectInstanceId, objectId, x, y });
      delete layer.data;
      state.selectedObjectInstanceId = objectInstanceId;
    }),

  removeObjectInstance: (layerId, objectInstanceId) =>
    set((state) => {
      if (!state.currentMap || state.activeVariationId) return;
      const layer = state.currentMap.layers.find((candidate) => candidate.id === layerId);
      if (!layer || layer.locked || !layer.objectInstances) return;
      layer.objectInstances = layer.objectInstances.filter(
        (instance) => instance.id !== objectInstanceId,
      );
      if (state.selectedObjectInstanceId === objectInstanceId) {
        state.selectedObjectInstanceId = null;
      }
    }),

  moveObjectInstance: (layerId, objectInstanceId, x, y) =>
    set((state) => {
      if (!state.currentMap || state.activeVariationId) return;
      const layer = state.currentMap.layers.find((candidate) => candidate.id === layerId);
      if (!layer || layer.locked || !layer.objectInstances) return;
      const objectInstance = layer.objectInstances.find(
        (instance) => instance.id === objectInstanceId,
      );
      if (!objectInstance) return;
      objectInstance.x = x;
      objectInstance.y = y;
    }),

  selectObjectInstance: (id) =>
    set((state) => {
      state.selectedObjectInstanceId = id;
      if (id !== null) {
        state.selectedEntityId = null;
        state.selectedLinkId = null;
        state.selectedAnchorId = null;
        state.selectedTriggerId = null;
      }
    }),

  eraseTile: (layerId, x, y) =>
    set((state) => {
      if (!state.currentMap) return;
      setTileInState(state.currentMap, state.activeVariationId, layerId, x, y, null);
    }),

  eraseObjectInstanceAt: (layerId, x, y) =>
    set((state) => {
      if (!state.currentMap || state.activeVariationId) return;
      const layer = state.currentMap.layers.find((candidate) => candidate.id === layerId);
      if (!layer || layer.locked) return;
      const hit = removeObjectInstanceAtTile(
        layer,
        x,
        y,
        indexObjects(state.objects),
        state.project?.tileSize ?? 16,
      );
      if (hit && state.selectedObjectInstanceId === hit.id) {
        state.selectedObjectInstanceId = null;
      }
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
      const startTile = resolveTileAt(
        currentMap,
        layerId,
        startX,
        startY,
        activeVariationId,
      );
      if (startTile === targetTileRef) return;
      const cells = floodFillCollect(
        startX,
        startY,
        currentMap.width,
        currentMap.height,
        (x, y) =>
          resolveTileAt(currentMap, layerId, x, y, activeVariationId) === startTile,
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
      const startTile = resolveTileAt(
        currentMap,
        layerId,
        startX,
        startY,
        activeVariationId,
      );
      const cells = floodFillCollect(
        startX,
        startY,
        currentMap.width,
        currentMap.height,
        (x, y) =>
          resolveTileAt(currentMap, layerId, x, y, activeVariationId) === startTile,
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
        } else if (mode === 'stamp' && (tilesetId || pattern)) {
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
            if (tileIdx !== null && tilesetId)
              setTileInState(
                currentMap,
                activeVariationId,
                layerId,
                x,
                y,
                createTileRef(tilesetId, tileIdx),
              );
            else if (tileIdx === null) {
              setTileInState(currentMap, activeVariationId, layerId, x, y, null);
            }
          } else if (tilesetId && tileIndex !== undefined && tileIndex !== null) {
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
