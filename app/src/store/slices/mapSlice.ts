import {
  resourceFileKey,
  resourceRegistry,
  resourceSchemaPath,
  normalizeResourceDocument,
} from '../../lib/resourceRegistry';
import { qualifyResourceId, assertUniqueResourceIds } from '../../lib/resourceIds';
import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { Anchor, Map as GameMap, LocationLink } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import { serializeMap } from '../../lib/mapMigration';
import { DEFAULT_LINK_FACING } from '../../lib/locationLinkUtils';
import { saveMapDebounced } from '../../lib/saveManager';
import {
  addMissingDefinitionLayers,
  createLayersFromDefinitions,
  createDefaultLayer,
  ensureNavigationLayer,
  getPreferredSelectedLayerId,
  choosePreferredSelectedLayerId,
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

async function persistMap(map: GameMap) {
  await fileSystem.saveJson(resourceRegistry.location.folder, resourceFileKey('location', map.id), {
    $schema: resourceSchemaPath('location'),
    ...serializeMap(map),
  });
}

function normalizeFacing(facing?: [number, number] | null): [number, number] {
  if (!facing) return DEFAULT_LINK_FACING;
  const [x, y] = facing;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return DEFAULT_LINK_FACING;
  const len = Math.hypot(x, y);
  if (len < 0.0001) return DEFAULT_LINK_FACING;
  return [Number((x / len).toFixed(4)), Number((y / len).toFixed(4))];
}

function ensureAnchorCollection(map: GameMap): Anchor[] {
  if (!map.spatialPrimitives) map.spatialPrimitives = {};
  if (!map.spatialPrimitives.anchors) map.spatialPrimitives.anchors = [];
  return map.spatialPrimitives.anchors;
}

export interface MapSlice {
  maps: GameMap[];
  currentMap: GameMap | null;
  currentMapPath: string | null;
  activeVariationId: string | null;

  setCurrentMap: (map: GameMap | null) => void;
  loadMap: (mapId: string) => void;
  createNewMap: (
    name: string,
    width: number,
    height: number,
    tilesetId: string,
    folderPath?: string,
  ) => Promise<void>;
  updateCurrentMap: (updates: Partial<GameMap>) => void;
  addMap: (map: GameMap) => void;
  deleteMap: (mapId: string) => Promise<void>;
  updateMapFolderPath: (mapId: string, folderPath: string) => Promise<void>;
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
          const withDefs = addMissingDefinitionLayers(
            normalizeResourceDocument(map, 'location', state.project?.idPrefix),
            state.layerDefinitions,
          );
          const enrichedMap = ensureNavigationLayer(withDefs);
          state.currentMap = castDraft(enrichedMap);
          state.currentMapPath = `${resourceRegistry.location.folder}/${fileSystem.resolveFilename(resourceRegistry.location.folder, resourceFileKey('location', enrichedMap.id))}`;
          state.selectedLinkId = null;
          state.selectedAnchorId = null;
          state.selectedTriggerId = null;
          state.selectedObjectInstanceId = null;
          if (enrichedMap && state.mapCameras?.[enrichedMap.id]) {
            state.camera = { ...state.mapCameras[enrichedMap.id] };
          }

          const prevSelectedLayerId = state.selectedLayerId;
          const prevSelectedLayer = state.currentMap?.layers.find(
            (l) => l.id === prevSelectedLayerId,
          );
          const prevSelectedLayerName = prevSelectedLayer?.name ?? null;
          const prevLayerKind = prevSelectedLayer?.kind ?? null;

          state.selectedLayerId = choosePreferredSelectedLayerId(
            enrichedMap,
            prevSelectedLayerId ?? null,
            prevSelectedLayerName,
            prevLayerKind ?? null,
          );
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

          const enrichedMap = ensureNavigationLayer(map);
          state.currentMap = castDraft(enrichedMap);
          state.currentMapPath = `${resourceRegistry.location.folder}/${fileSystem.resolveFilename(resourceRegistry.location.folder, resourceFileKey('location', enrichedMap.id))}`;
          state.activeVariationId = null;
          state.selectedEntityId = null;
          state.selectedEntityIds = new Set();
          state.selectedObjectInstanceId = null;
          state.selectedLinkId = null;
          state.selectedAnchorId = null;
          state.selectedTriggerId = null;

          state.camera = state.mapCameras?.[mapId]
            ? { ...state.mapCameras[mapId] }
            : { x: 0, y: 0, zoom: 1.5 };

          const prevSelectedLayerId = state.selectedLayerId;
          const prevSelectedLayer = state.currentMap?.layers.find(
            (l) => l.id === prevSelectedLayerId,
          );
          const prevSelectedLayerName = prevSelectedLayer?.name ?? null;
          const prevLayerKind = prevSelectedLayer?.kind ?? null;

          state.selectedLayerId = choosePreferredSelectedLayerId(
            enrichedMap,
            prevSelectedLayerId ?? null,
            prevSelectedLayerName,
            prevLayerKind ?? null,
          );
          syncToolStateForSelectedLayer(state, { forceDefault: true });
        }),
      { clearHistory: true },
    ),

  createNewMap: async (name, width, height, tilesetId, folderPath = '') => {
    const id = qualifyResourceId(
      name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
      get().project?.idPrefix,
    );
    assertUniqueResourceIds([...get().maps, { id }]);
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
      folderPath: folderPath.trim() || undefined,
    };
    const newMap = ensureNavigationLayer(
      normalizeResourceDocument(rawMap, 'location', get().project?.idPrefix),
    );

    await fileSystem.saveJson(resourceRegistry.location.folder, resourceFileKey('location', id), {
      $schema: resourceSchemaPath('location'),
      ...serializeMap(newMap),
    });

    withHistorySuppressed(
      () =>
        set((state) => {
          state.maps.push(castDraft(newMap));
          state.currentMap = castDraft(newMap);
          state.currentMapPath = `${resourceRegistry.location.folder}/${fileSystem.resolveFilename(resourceRegistry.location.folder, resourceFileKey('location', newMap.id))}`;
          state.activeVariationId = null;
          state.selectedLinkId = null;
          state.selectedAnchorId = null;
          state.selectedLayerId = getPreferredSelectedLayerId(newMap);
          syncToolStateForSelectedLayer(state, { forceDefault: true });
        }),
      { clearHistory: true },
    );
  },

  addMap: (map) =>
    set((state) => {
      state.currentMap = castDraft(
        normalizeResourceDocument(map, 'location', state.project?.idPrefix),
      );
    }),

  updateCurrentMap: (updates) =>
    set((state) => {
      if (!state.currentMap) return;
      Object.assign(
        state.currentMap,
        normalizeResourceDocument(
          { ...state.currentMap, ...updates, id: state.currentMap.id },
          'location',
          state.project?.idPrefix,
        ),
      );

      if (updates.baseTilesetId && !state.currentMap.tilesetRefs.includes(updates.baseTilesetId)) {
        state.currentMap.tilesetRefs.unshift(updates.baseTilesetId);
      }

      if (updates.baseTilesetId && !state.activeVariationId) {
        state.activeTilesetId = updates.baseTilesetId;
      }
    }),

  deleteMap: async (mapId) => {
    // Remove links pointing to the deleted map from all other maps, persist,
    // and update state.
    const affectedMaps: GameMap[] = get()
      .maps.filter((m) => m.id !== mapId)
      .map((m) => ({
        ...m,
        locationLinks: (m.locationLinks ?? []).filter((l) => l.targetMapId !== mapId),
      }))
      .filter((m, idx) => {
        const original = get().maps.filter((x) => x.id !== mapId)[idx];
        return (original.locationLinks?.length ?? 0) !== (m.locationLinks?.length ?? 0);
      });

    await fileSystem.deleteJson(
      resourceRegistry.location.folder,
      resourceFileKey('location', mapId),
    );
    for (const updated of affectedMaps) {
      await persistMap(updated);
    }

    withHistorySuppressed(
      () =>
        set((state) => {
          for (const updated of affectedMaps) {
            const idx = state.maps.findIndex((m) => m.id === updated.id);
            if (idx !== -1) state.maps[idx] = castDraft(updated);
            if (state.currentMap?.id === updated.id) {
              state.currentMap = castDraft(updated);
            }
          }

          state.maps = state.maps.filter((m) => m.id !== mapId);

          if (state.currentMap?.id === mapId) {
            if (state.maps.length > 0) {
              state.currentMap = castDraft(state.maps[0]);
              state.currentMapPath = `${resourceRegistry.location.folder}/${fileSystem.resolveFilename(resourceRegistry.location.folder, resourceFileKey('location', state.maps[0].id))}`;
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

  updateMapFolderPath: async (mapId, folderPath) => {
    let updatedMap: GameMap | null = null;
    set((state) => {
      const idx = state.maps.findIndex((m) => m.id === mapId);
      if (idx < 0) return;
      const merged = { ...state.maps[idx], folderPath } as GameMap;
      updatedMap = merged;
      state.maps[idx] = castDraft(merged);
      if (state.currentMap?.id === mapId) {
        state.currentMap = castDraft(merged);
      }
    });
    const map = updatedMap ?? get().maps.find((m) => m.id === mapId);
    if (map) await persistMap(map);
  },
});

// ============================================================================
// Location link + anchor actions
// ============================================================================

export interface LocationLinkSlice {
  selectedLinkId: string | null;
  selectedAnchorId: string | null;
  pendingNewLinkId: string | null;

  addAnchor: (anchor: Anchor) => void;
  updateAnchor: (id: string, updates: Partial<Anchor>, skipSave?: boolean) => void;
  removeAnchor: (id: string) => void;
  selectAnchor: (id: string | null) => void;
  addLocationLink: (link: LocationLink) => void;
  updateLocationLink: (id: string, updates: Partial<LocationLink>, skipSave?: boolean) => void;
  removeLocationLink: (id: string) => void;
  selectLink: (id: string | null) => void;
  clearPendingNewLink: () => void;
  updateMapAnchor: (
    mapId: string,
    anchorId: string,
    updates: Partial<Anchor>,
    skipSave?: boolean,
  ) => void;
}

function upsertMapInState(state: { maps: unknown[]; currentMap: unknown }, updatedMap: GameMap) {
  const maps = state.maps as GameMap[];
  const mapIndex = maps.findIndex((map) => map.id === updatedMap.id);
  if (mapIndex !== -1) {
    maps[mapIndex] = castDraft(updatedMap);
  }

  const currentMap = state.currentMap as GameMap | null;
  if (currentMap?.id === updatedMap.id) {
    state.currentMap = castDraft(updatedMap);
  }
}

export const createLocationLinkSlice: ImmerStateCreator<LocationLinkSlice> = (set, get) => ({
  selectedLinkId: null,
  selectedAnchorId: null,
  pendingNewLinkId: null,

  addAnchor: (anchor) => {
    set((state) => {
      if (!state.currentMap) return;
      const anchors = ensureAnchorCollection(state.currentMap);
      anchors.push(
        castDraft({
          ...anchor,
          facing: normalizeFacing(anchor.facing ?? DEFAULT_LINK_FACING),
        }),
      );
      state.selectedAnchorId = anchor.id;
      state.selectedLinkId = null;
      state.selectedEntityId = null;
    });
    const { currentMap } = get();
    if (currentMap) saveMapDebounced(currentMap);
  },

  updateAnchor: (id, updates, skipSave = false) => {
    const normalizedUpdates = { ...updates };
    if (normalizedUpdates.facing) {
      normalizedUpdates.facing = normalizeFacing(normalizedUpdates.facing);
    }

    set((state) => {
      if (!state.currentMap) return;
      const anchors = ensureAnchorCollection(state.currentMap);
      const anchor = anchors.find((item) => item.id === id);
      if (!anchor) return;
      Object.assign(anchor, normalizedUpdates);
    });

    if (!skipSave) {
      const { currentMap } = get();
      if (currentMap) saveMapDebounced(currentMap);
    }
  },

  removeAnchor: (id) => {
    set((state) => {
      if (!state.currentMap) return;
      const anchors = ensureAnchorCollection(state.currentMap);
      state.currentMap.spatialPrimitives!.anchors = anchors.filter((anchor) => anchor.id !== id);
      // Drop links that lose their target anchor.
      if (state.currentMap.locationLinks) {
        state.currentMap.locationLinks = state.currentMap.locationLinks.filter(
          (link) => link.targetAnchorId !== id,
        );
      }
      if (state.selectedAnchorId === id) state.selectedAnchorId = null;
    });
    // Cascade: drop links in other maps whose targetAnchorId references this anchor on this map.
    const { currentMap, maps } = get();
    if (currentMap) {
      for (const otherMap of maps) {
        if (otherMap.id === currentMap.id) continue;
        const filtered = (otherMap.locationLinks ?? []).filter(
          (link) => !(link.targetMapId === currentMap.id && link.targetAnchorId === id),
        );
        if (filtered.length !== (otherMap.locationLinks?.length ?? 0)) {
          const updated: GameMap = { ...otherMap, locationLinks: filtered };
          set((state) => {
            upsertMapInState(state, updated);
          });
          saveMapDebounced(updated);
        }
      }
      saveMapDebounced(currentMap);
    }
  },

  selectAnchor: (id) =>
    set((state) => {
      state.selectedAnchorId = id;
      if (id !== null) {
        state.selectedLinkId = null;
        state.selectedEntityId = null;
      }
    }),

  addLocationLink: (link) => {
    set((state) => {
      if (!state.currentMap) return;
      if (!state.currentMap.locationLinks) state.currentMap.locationLinks = [];
      state.currentMap.locationLinks.push(castDraft(link));
      state.selectedLinkId = link.id;
      state.selectedAnchorId = null;
      state.pendingNewLinkId = link.id;
    });
    const { currentMap } = get();
    if (currentMap) saveMapDebounced(currentMap);
  },

  updateLocationLink: (id, updates, skipSave = false) => {
    set((state) => {
      if (!state.currentMap?.locationLinks) return;
      const link = state.currentMap.locationLinks.find((l) => l.id === id);
      if (link) Object.assign(link, updates);
    });
    if (!skipSave) {
      const { currentMap } = get();
      if (currentMap) saveMapDebounced(currentMap);
    }
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
      if (id !== null) {
        state.selectedEntityId = null;
        state.selectedAnchorId = null;
      }
    }),

  clearPendingNewLink: () =>
    set((state) => {
      state.pendingNewLinkId = null;
    }),

  updateMapAnchor: (mapId, anchorId, updates, skipSave = false) => {
    const normalizedUpdates = { ...updates };
    if (normalizedUpdates.facing) {
      normalizedUpdates.facing = normalizeFacing(normalizedUpdates.facing);
    }

    let updatedMap: GameMap | null = null;

    set((state) => {
      const targetMap = state.maps.find((map) => map.id === mapId);
      if (!targetMap) return;

      const anchors = targetMap.spatialPrimitives?.anchors ?? [];
      if (!anchors.some((anchor) => anchor.id === anchorId)) return;

      updatedMap = {
        ...targetMap,
        spatialPrimitives: {
          ...(targetMap.spatialPrimitives ?? {}),
          anchors: anchors.map((anchor) =>
            anchor.id === anchorId ? { ...anchor, ...normalizedUpdates } : anchor,
          ),
        },
      };

      upsertMapInState(state, updatedMap);
    });

    if (!skipSave && updatedMap) {
      saveMapDebounced(updatedMap);
    }
  },
});
