import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { Anchor, Map as GameMap } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import { serializeMap } from '../../lib/mapMigration';
import {
  DEFAULT_LINK_FACING,
  getDefaultLinkTargetPosition,
  getLinkOwnedAnchor,
  normalizeFacingVector,
  resolveLinkTarget,
} from '../../lib/locationLinkUtils';
import { saveMapDebounced } from '../../lib/saveManager';
import {
  addMissingDefinitionLayers,
  createLayersFromDefinitions,
  createDefaultLayer,
  ensureAnchorLayer,
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

async function persistMap(map: GameMap) {
  await fileSystem.saveJson('maps', `${map.id}.map.json`, {
    $schema: '../../schemas/map.schema.json',
    ...serializeMap(map),
  });
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
          const enrichedMap = ensureAnchorLayer(ensureLocationLinkLayer(withDefs));
          state.currentMap = castDraft(enrichedMap);
          state.currentMapPath = `maps/${enrichedMap.id}.map.json`;
          state.selectedLinkId = null;
          state.selectedAnchorId = null;
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

          const enrichedMap = ensureAnchorLayer(ensureLocationLinkLayer(map));
          state.currentMap = castDraft(enrichedMap);
          state.currentMapPath = `maps/${enrichedMap.id}.map.json`;
          state.activeVariationId = null;
          state.selectedEntityId = null;
          state.selectedEntityIds = new Set();
          state.selectedLinkId = null;
          state.selectedAnchorId = null;

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
    const newMap = ensureAnchorLayer(ensureLocationLinkLayer(rawMap));

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
          state.selectedAnchorId = null;
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
    // Find maps that have location links targeting the deleted map so we can
    // remove those links and persist the updated files before wiping the map.
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

    await fileSystem.deleteJson('maps', `${mapId}.map.json`);
    for (const updated of affectedMaps) {
      await persistMap(updated);
    }

    withHistorySuppressed(
      () =>
        set((state) => {
          // Apply cascaded link removals
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
  selectedAnchorId: string | null;
  pickingLinkTargetForLinkId: string | null;
  pendingNewLinkId: string | null;

  addAnchor: (anchor: Anchor) => void;
  updateAnchor: (id: string, updates: Partial<Anchor>, skipSave?: boolean) => void;
  removeAnchor: (id: string) => void;
  selectAnchor: (id: string | null) => void;
  addLocationLink: (link: import('../../types/schema').LocationLink) => void;
  updateLocationLink: (
    id: string,
    updates: Partial<import('../../types/schema').LocationLink>,
    skipSave?: boolean,
  ) => void;
  removeLocationLink: (id: string) => void;
  selectLink: (id: string | null) => void;
  startPickingLinkTarget: (linkId: string) => void;
  cancelPickingLinkTarget: () => void;
  commitLinkTarget: (linkId: string, mapId: string, position: [number, number]) => void;
  clearPendingNewLink: () => void;
  updateMapAnchor: (
    mapId: string,
    anchorId: string,
    updates: Partial<Anchor>,
    skipSave?: boolean,
  ) => void;
  createTargetAnchorForLink: (linkId: string) => Promise<string | null>;
  createBidirectionalCounterpart: (sourceLinkId: string) => Promise<void>;
}

export const createLocationLinkSlice: ImmerStateCreator<LocationLinkSlice> = (set, get) => ({
  selectedLinkId: null,
  selectedAnchorId: null,
  pickingLinkTargetForLinkId: null,
  pendingNewLinkId: null,

  addAnchor: (anchor) => {
    set((state) => {
      if (!state.currentMap) return;
      const anchors = ensureAnchorCollection(state.currentMap);
      anchors.push(
        castDraft({
          ...anchor,
          facing: normalizeFacingVector(anchor.facing ?? DEFAULT_LINK_FACING),
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
      normalizedUpdates.facing = normalizeFacingVector(normalizedUpdates.facing);
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
      if (state.currentMap.locationLinks) {
        state.currentMap.locationLinks = state.currentMap.locationLinks.map((link) => ({
          ...link,
          anchorId: link.anchorId === id ? undefined : link.anchorId,
          targetAnchorId: link.targetAnchorId === id ? undefined : link.targetAnchorId,
        }));
      }
      if (state.selectedAnchorId === id) state.selectedAnchorId = null;
    });
    const { currentMap } = get();
    if (currentMap) saveMapDebounced(currentMap);
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
    const projectTileSize = get().project?.tileSize ?? 16;
    const targetPosition =
      link.targetPosition ??
      getDefaultLinkTargetPosition(link.sourcePosition, link.triggerSize, projectTileSize);
    const targetFacing = normalizeFacingVector(link.targetFacing ?? DEFAULT_LINK_FACING);
    const normalizedLink = {
      ...link,
      targetPosition,
      targetFacing,
    };

    set((state) => {
      if (!state.currentMap) return;
      if (!state.currentMap.locationLinks) state.currentMap.locationLinks = [];
      state.currentMap.locationLinks.push(castDraft(normalizedLink));
      state.selectedLinkId = normalizedLink.id;
      state.selectedAnchorId = null;
      state.pendingNewLinkId = normalizedLink.id;
    });
    const { currentMap } = get();
    if (currentMap) saveMapDebounced(currentMap);
  },

  updateLocationLink: (id, updates, skipSave = false) => {
    const normalizedUpdates = { ...updates };
    if (normalizedUpdates.targetFacing) {
      normalizedUpdates.targetFacing = normalizeFacingVector(normalizedUpdates.targetFacing);
    }

    set((state) => {
      if (!state.currentMap?.locationLinks) return;
      const link = state.currentMap.locationLinks.find((l) => l.id === id);
      if (link) Object.assign(link, normalizedUpdates);
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
        const anchor =
          !mapId || mapId === state.currentMap.id
            ? (getLinkOwnedAnchor(
                state.currentMap.locationLinks.find((item) => item.id === link.targetLinkId),
                state.currentMap,
              ) ??
              (link.targetAnchorId
                ? state.currentMap.spatialPrimitives?.anchors?.find(
                    (item) => item.id === link.targetAnchorId,
                  )
                : undefined))
            : undefined;

        if (anchor) {
          anchor.position = position;
        } else {
          link.targetPosition = position;
        }
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

  updateMapAnchor: (mapId, anchorId, updates, skipSave = false) => {
    const normalizedUpdates = { ...updates };
    if (normalizedUpdates.facing) {
      normalizedUpdates.facing = normalizeFacingVector(normalizedUpdates.facing);
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

  createTargetAnchorForLink: async (linkId) => {
    const state = get();
    const sourceMap = state.currentMap;
    if (!sourceMap) return null;

    const link = sourceMap.locationLinks?.find((item) => item.id === linkId);
    if (!link) return null;

    const resolvedTarget = resolveLinkTarget(link, sourceMap, state.maps);
    if (link.targetMapId && !resolvedTarget.targetMap) {
      return null;
    }

    const targetMap = resolvedTarget.targetMap ?? sourceMap;
    const anchorId = `anchor-${Date.now()}`;
    const baseName = (link.label?.trim() || 'Arrival').replace(/\s+/g, ' ');
    const newAnchor: Anchor = {
      id: anchorId,
      name: `${baseName} Anchor`,
      position: resolvedTarget.position,
      facing: resolvedTarget.facing,
      tags: ['link-arrival'],
    };

    if (targetMap.id === sourceMap.id) {
      const combinedMap: GameMap = {
        ...sourceMap,
        spatialPrimitives: {
          ...(sourceMap.spatialPrimitives ?? {}),
          anchors: [...(sourceMap.spatialPrimitives?.anchors ?? []), newAnchor],
        },
        locationLinks: (sourceMap.locationLinks ?? []).map((item) =>
          item.id === linkId
            ? {
                ...item,
                targetAnchorId: anchorId,
                targetPosition: resolvedTarget.position,
                targetFacing: resolvedTarget.facing,
              }
            : item,
        ),
      };

      await persistMap(combinedMap);
      set((draft) => {
        upsertMapInState(draft, combinedMap);
      });
      return anchorId;
    }

    const updatedTargetMap: GameMap = {
      ...targetMap,
      spatialPrimitives: {
        ...(targetMap.spatialPrimitives ?? {}),
        anchors: [...(targetMap.spatialPrimitives?.anchors ?? []), newAnchor],
      },
    };

    const updatedSourceMap: GameMap = {
      ...sourceMap,
      locationLinks: (sourceMap.locationLinks ?? []).map((item) =>
        item.id === linkId
          ? {
              ...item,
              targetAnchorId: anchorId,
              targetPosition: resolvedTarget.position,
              targetFacing: resolvedTarget.facing,
            }
          : item,
      ),
    };

    await persistMap(updatedTargetMap);
    await persistMap(updatedSourceMap);

    set((draft) => {
      upsertMapInState(draft, updatedTargetMap);
      upsertMapInState(draft, updatedSourceMap);
    });

    return anchorId;
  },

  createBidirectionalCounterpart: async (sourceLinkId) => {
    const state = get();
    const sourceMap = state.currentMap;
    if (!sourceMap) return;

    const sourceLink = sourceMap.locationLinks?.find((l) => l.id === sourceLinkId);
    if (!sourceLink || !sourceLink.targetMapId) return;

    const targetMap = state.maps.find((m) => m.id === sourceLink.targetMapId);
    if (!targetMap) return;

    const resolvedTarget = resolveLinkTarget(sourceLink, sourceMap, state.maps);

    const counterpartId = `link-${Date.now()}`;
    const counterpart: import('../../types/schema').LocationLink = {
      id: counterpartId,
      label: sourceLink.label ? `↩ ${sourceLink.label}` : undefined,
      sourcePosition: resolvedTarget.position,
      triggerSize: sourceLink.triggerSize,
      targetMapId: sourceMap.id,
      targetPosition: sourceLink.sourcePosition,
      targetFacing: normalizeFacingVector(sourceLink.targetFacing ?? DEFAULT_LINK_FACING),
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

    await persistMap(updatedTargetMap);
    await persistMap(updatedSourceMap);

    set((s) => {
      upsertMapInState(s, updatedTargetMap);
      upsertMapInState(s, updatedSourceMap);
    });
  },
});
