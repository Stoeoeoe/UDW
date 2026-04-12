import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { Map as GameMap } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import { serializeMap } from '../../lib/mapMigration';
import { saveMapDebounced } from '../../lib/saveManager';
import {
  addMissingDefinitionLayers,
  createLayersFromDefinitions,
  createDefaultLayer,
  ensureLocationLinkLayer,
  getPreferredSelectedLayerId,
  syncToolStateForSelectedLayer,
  withHistorySuppressed,
} from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface MapSlice {
  maps: GameMap[];
  currentMap: GameMap | null;
  currentMapPath: string | null;
  activeVariationId: string | null;

  setCurrentMap: (map: GameMap | null) => void;
  loadMap: (mapId: string) => void;
  createNewMap: (name: string, width: number, height: number, tilesetId: string) => Promise<void>;
  updateCurrentMap: (updates: Partial<GameMap>) => void;
  addMap: (map: GameMap) => void;
  deleteMap: (mapId: string) => Promise<void>;
}

export const createMapSlice: ImmerStateCreator<MapSlice> = (set, get) => ({
  maps: [],
  currentMap: null,
  currentMapPath: null,
  activeVariationId: null,

  setCurrentMap: (map) =>
    withHistorySuppressed(
      () =>
        set((state) => {
          if (!map) {
            state.currentMap = null;
            state.currentMapPath = null;
            return;
          }
          const withDefs = addMissingDefinitionLayers(map, state.layerDefinitions);
          const enrichedMap = ensureLocationLinkLayer(withDefs);
          state.currentMap = castDraft(enrichedMap);
          state.currentMapPath = `maps/${enrichedMap.id}.map.json`;
          state.selectedLinkId = null;
          if (enrichedMap && state.mapCameras?.[enrichedMap.id]) {
            state.camera = { ...state.mapCameras[enrichedMap.id] };
          }
          if (
            !state.selectedLayerId ||
            !enrichedMap.layers.find((l) => l.id === state.selectedLayerId)
          ) {
            state.selectedLayerId = getPreferredSelectedLayerId(enrichedMap);
          }
          syncToolStateForSelectedLayer(state, { forceDefault: true });
        }),
      { clearHistory: true },
    ),

  loadMap: (mapId) =>
    withHistorySuppressed(
      () =>
        set((state) => {
          const map = state.maps.find((m) => m.id === mapId);
          if (!map) return;

          if (state.currentMap) {
            state.mapCameras = state.mapCameras || {};
            state.mapCameras[state.currentMap.id] = { ...state.camera };
          }

          const enrichedMap = ensureLocationLinkLayer(map);
          state.currentMap = castDraft(enrichedMap);
          state.currentMapPath = `maps/${enrichedMap.id}.map.json`;
          state.activeVariationId = null;
          state.selectedEntityId = null;
          state.selectedEntityIds = new Set();
          state.selectedLinkId = null;

          state.camera = state.mapCameras?.[mapId]
            ? { ...state.mapCameras[mapId] }
            : { x: 0, y: 0, zoom: 1.5 };

          state.selectedLayerId = getPreferredSelectedLayerId(enrichedMap);
          syncToolStateForSelectedLayer(state, { forceDefault: true });
        }),
      { clearHistory: true },
    ),

  createNewMap: async (name, width, height, tilesetId) => {
    const id = name.toLowerCase().replace(/\s+/g, '-');
    const layerDefs = get().layerDefinitions;
    const definedLayers = createLayersFromDefinitions(layerDefs, width, height);
    const baseLayers =
      definedLayers.length > 0 ? definedLayers : [createDefaultLayer(width, height)];

    const rawMap: GameMap = {
      version: 1,
      id,
      name,
      width,
      height,
      baseTilesetId: tilesetId,
      tilesetRefs: [tilesetId],
      layers: baseLayers,
      entities: [],
    };
    const newMap = ensureLocationLinkLayer(rawMap);

    await fileSystem.saveJson('maps', `${id}.map.json`, {
      $schema: '../../schemas/map.schema.json',
      ...serializeMap(newMap),
    });

    withHistorySuppressed(
      () =>
        set((state) => {
          state.maps.push(castDraft(newMap));
          state.currentMap = castDraft(newMap);
          state.currentMapPath = `maps/${newMap.id}.map.json`;
          state.activeVariationId = null;
          state.selectedLinkId = null;
          state.selectedLayerId = getPreferredSelectedLayerId(newMap);
          syncToolStateForSelectedLayer(state, { forceDefault: true });
        }),
      { clearHistory: true },
    );
  },

  addMap: (map) =>
    set((state) => {
      state.currentMap = castDraft(map);
    }),

  updateCurrentMap: (updates) =>
    set((state) => {
      if (!state.currentMap) return;
      Object.assign(state.currentMap, updates);

      if (updates.baseTilesetId && !state.currentMap.tilesetRefs.includes(updates.baseTilesetId)) {
        state.currentMap.tilesetRefs.unshift(updates.baseTilesetId);
      }

      if (updates.baseTilesetId && !state.activeVariationId) {
        state.activeTilesetId = updates.baseTilesetId;
      }
    }),

  deleteMap: async (mapId) => {
    await fileSystem.deleteJson('maps', `${mapId}.map.json`);

    withHistorySuppressed(
      () =>
        set((state) => {
          state.maps = state.maps.filter((m) => m.id !== mapId);

          if (state.currentMap?.id === mapId) {
            if (state.maps.length > 0) {
              state.currentMap = castDraft(state.maps[0]);
              state.currentMapPath = `maps/${state.maps[0].id}.map.json`;
              state.activeVariationId = null;
              state.selectedLayerId = getPreferredSelectedLayerId(state.maps[0]);
              syncToolStateForSelectedLayer(state, { forceDefault: true });
            } else {
              state.currentMap = null;
              state.currentMapPath = null;
              state.activeVariationId = null;
              state.selectedLayerId = null;
            }
          }
        }),
      { clearHistory: true },
    );
  },
});

// ============================================================================
// Location link actions (collocated with map slice — they operate on currentMap)
// ============================================================================

export interface LocationLinkSlice {
  selectedLinkId: string | null;
  pickingLinkTargetForLinkId: string | null;
  pendingNewLinkId: string | null;

  addLocationLink: (link: import('../../types/schema').LocationLink) => void;
  updateLocationLink: (
    id: string,
    updates: Partial<import('../../types/schema').LocationLink>,
  ) => void;
  removeLocationLink: (id: string) => void;
  selectLink: (id: string | null) => void;
  startPickingLinkTarget: (linkId: string) => void;
  cancelPickingLinkTarget: () => void;
  commitLinkTarget: (linkId: string, mapId: string, position: [number, number]) => void;
  clearPendingNewLink: () => void;
  createBidirectionalCounterpart: (sourceLinkId: string) => Promise<void>;
}

export const createLocationLinkSlice: ImmerStateCreator<LocationLinkSlice> = (set, get) => ({
  selectedLinkId: null,
  pickingLinkTargetForLinkId: null,
  pendingNewLinkId: null,

  addLocationLink: (link) => {
    set((state) => {
      if (!state.currentMap) return;
      if (!state.currentMap.locationLinks) state.currentMap.locationLinks = [];
      state.currentMap.locationLinks.push(castDraft(link));
      state.selectedLinkId = link.id;
      state.pendingNewLinkId = link.id;
    });
    const { currentMap } = get();
    if (currentMap) saveMapDebounced(currentMap);
  },

  updateLocationLink: (id, updates) => {
    set((state) => {
      if (!state.currentMap?.locationLinks) return;
      const link = state.currentMap.locationLinks.find((l) => l.id === id);
      if (link) Object.assign(link, updates);
    });
    const { currentMap } = get();
    if (currentMap) saveMapDebounced(currentMap);
  },

  removeLocationLink: (id) => {
    set((state) => {
      if (!state.currentMap?.locationLinks) return;
      state.currentMap.locationLinks = state.currentMap.locationLinks.filter((l) => l.id !== id);
      if (state.selectedLinkId === id) state.selectedLinkId = null;
    });
    const { currentMap } = get();
    if (currentMap) saveMapDebounced(currentMap);
  },

  selectLink: (id) =>
    set((state) => {
      state.selectedLinkId = id;
      if (id !== null) state.selectedEntityId = null;
    }),

  startPickingLinkTarget: (linkId) =>
    set((state) => {
      state.pickingLinkTargetForLinkId = linkId;
    }),

  cancelPickingLinkTarget: () =>
    set((state) => {
      state.pickingLinkTargetForLinkId = null;
    }),

  commitLinkTarget: (linkId, mapId, position) => {
    set((state) => {
      if (!state.currentMap?.locationLinks) return;
      const link = state.currentMap.locationLinks.find((l) => l.id === linkId);
      if (link) {
        link.targetMapId = mapId;
        link.targetPosition = position;
      }
      state.pickingLinkTargetForLinkId = null;
    });
    const { currentMap } = get();
    if (currentMap) saveMapDebounced(currentMap);
  },

  clearPendingNewLink: () =>
    set((state) => {
      state.pendingNewLinkId = null;
    }),

  createBidirectionalCounterpart: async (sourceLinkId) => {
    const state = get();
    const sourceMap = state.currentMap;
    if (!sourceMap) return;

    const sourceLink = sourceMap.locationLinks?.find((l) => l.id === sourceLinkId);
    if (!sourceLink || !sourceLink.targetMapId) return;

    const targetMap = state.maps.find((m) => m.id === sourceLink.targetMapId);
    if (!targetMap) return;

    const counterpartId = `link-${Date.now()}`;
    const counterpart: import('../../types/schema').LocationLink = {
      id: counterpartId,
      label: sourceLink.label ? `↩ ${sourceLink.label}` : undefined,
      sourcePosition: sourceLink.targetPosition,
      triggerSize: sourceLink.triggerSize,
      targetMapId: sourceMap.id,
      targetPosition: sourceLink.sourcePosition,
      targetLinkId: sourceLinkId,
      direction: 'bidirectional',
    };

    const updatedTargetMap: GameMap = {
      ...targetMap,
      locationLinks: [...(targetMap.locationLinks ?? []), counterpart],
    };
    const updatedSourceMap: GameMap = {
      ...sourceMap,
      locationLinks: sourceMap.locationLinks!.map((l) =>
        l.id === sourceLinkId
          ? { ...l, direction: 'bidirectional' as const, targetLinkId: counterpartId }
          : l,
      ),
    };

    await fileSystem.saveJson('maps', `${targetMap.id}.map.json`, {
      $schema: '../../schemas/map.schema.json',
      ...serializeMap(updatedTargetMap),
    });
    await fileSystem.saveJson('maps', `${sourceMap.id}.map.json`, {
      $schema: '../../schemas/map.schema.json',
      ...serializeMap(updatedSourceMap),
    });

    set((s) => {
      const targetIdx = s.maps.findIndex((m) => m.id === targetMap.id);
      if (targetIdx !== -1) s.maps[targetIdx] = castDraft(updatedTargetMap);
      const sourceIdx = s.maps.findIndex((m) => m.id === sourceMap.id);
      if (sourceIdx !== -1) s.maps[sourceIdx] = castDraft(updatedSourceMap);
      if (s.currentMap?.id === sourceMap.id) s.currentMap = castDraft(updatedSourceMap);
    });
  },
});
