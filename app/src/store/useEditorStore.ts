import { create } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector, devtools } from 'zustand/middleware';
import { castDraft } from 'immer';
import { temporal, type TemporalState } from 'zundo';
import { EditorState, ToolType, ValidationError, EditorMode } from '../types/editor';
import {
  Project,
  Map as GameMap,
  Layer,
  Variation,
  EntityInstance,
  Tileset,
  TileDefinition,
  LocationLink,
  PropertyValues,
} from '../types/schema';
import { recentProjects } from '../lib/recentProjects';
import { resolveEntities, resolveTileAt } from '../lib/mapUtils';
import { sampleRandomTile } from '../lib/randomUtils';
import { samplePatternAt, createTileRef } from '../lib/tileUtils';
import { fileSystem } from '../lib/fileSystem';
import { floodFillCollect } from '../lib/algorithms';
import { saveMapDebounced, useSaveStore } from '../lib/saveManager';
import { serializeTileset } from '../lib/tilesetMigration';
import { serializeMap } from '../lib/mapMigration';
import { resolveSpriteAsset } from '../lib/asepriteUtils';
import {
  buildTerrainGridFromLayer,
  findBestMatchingTileWithFallback,
  getCornerTerrainsForTile,
} from '../lib/terrainUtils';
import {
  addMissingDefinitionLayers,
  createLayersFromDefinitions,
  ensureLocationLinkLayer,
  createDefaultLayer,
  getPreferredSelectedLayerId,
  syncToolStateForSelectedLayer,
  setTileInState,
  pendingTilesetSaves,
  TILESET_SAVE_DEBOUNCE_MS,
} from './storeHelpers';
import { createActorSlice, ActorSlice } from './slices/actorSlice';
import { createTerrainSlice, TerrainSlice } from './slices/terrainSlice';
import { createEntityTypeSlice, EntityTypeSlice } from './slices/entityTypeSlice';
import { createLayerDefinitionSlice, LayerDefinitionSlice } from './slices/layerDefinitionSlice';
import { createScriptingSlice, ScriptingSlice } from './slices/scriptingSlice';

// ============================================================================
// Tileset debounced save (references store instance, stays here)
// ============================================================================

function scheduleTilesetSave(tilesetId: string): void {
  const existing = pendingTilesetSaves.get(tilesetId);
  if (existing) {
    clearTimeout(existing);
  }

  const timeoutId = setTimeout(async () => {
    pendingTilesetSaves.delete(tilesetId);
    const tileset = useEditorStore.getState().tilesets.get(tilesetId);
    if (!tileset) return;

    const snapshot = serializeTileset(JSON.parse(JSON.stringify(tileset)) as Tileset);
    useSaveStore.getState().setStatus('saving');
    await fileSystem.saveJson('tilesets', `${tilesetId}.tileset.json`, snapshot);
    useSaveStore.getState().setStatus('saved');
    setTimeout(() => {
      if (useSaveStore.getState().status === 'saved') {
        useSaveStore.getState().setStatus('idle');
      }
    }, 2000);
  }, TILESET_SAVE_DEBOUNCE_MS);

  pendingTilesetSaves.set(tilesetId, timeoutId);
}

// ============================================================================
// Store interface
// ============================================================================

export interface EditorStore
  extends
    EditorState,
    ActorSlice,
    TerrainSlice,
    EntityTypeSlice,
    LayerDefinitionSlice,
    ScriptingSlice {
  // Actions
  loadProject: (path: string, project: Project) => Promise<void>;
  closeProject: () => void;
  loadProjectResources: () => Promise<void>;
  loadSprite: (path: string, blob: Blob) => Promise<string>;
  updateProject: (project: Project) => Promise<void>;

  // Map Actions
  setCurrentMap: (map: GameMap | null) => void;
  loadMap: (mapId: string) => void;
  createNewMap: (name: string, width: number, height: number, tilesetId: string) => Promise<void>;
  updateCurrentMap: (updates: Partial<GameMap>) => void;
  deleteMap: (mapId: string) => Promise<void>;
  addMap: (map: GameMap) => void;

  // Tool actions
  setActiveTool: (tool: ToolType) => void;
  setEntitySnapMode: (mode: 'grid' | 'pixel') => void;
  setShowCollisionOverlay: (enabled: boolean) => void;
  setShowTilesetCollisionOverlay: (enabled: boolean) => void;
  setShowTerrainOverlay: (enabled: boolean) => void;
  reloadTerrainLayers: () => void;
  setDrawMode: (mode: 'point' | 'rect' | 'circle' | 'line' | 'flood') => void;
  setBrushSize: (size: number) => void;
  setMode: (mode: EditorMode) => void;
  setHoveredTile: (pos: { x: number; y: number } | null) => void;
  setDrawPreview: (preview: {
    isDrawing: boolean;
    start: { x: number; y: number } | null;
    end: { x: number; y: number } | null;
    mode?: 'draw' | 'select';
  }) => void;

  // Tileset actions
  setActiveTileset: (id: string | null) => void;
  setSelectedTile: (index: number | null) => void;
  setSelectedTiles: (indexes: number[]) => void;
  toggleSelectedTile: (index: number) => void;
  setSelectedTerrain: (id: string | null) => void;
  setSampledPattern: (
    pattern: {
      tilesetId: string;
      pattern: (number | null)[][];
      width: number;
      height: number;
    } | null,
  ) => void;
  addTileset: (tileset: Tileset) => Promise<void>;
  updateTileset: (id: string, updates: Partial<Tileset>) => Promise<void>;
  deleteTileset: (id: string) => Promise<void>;
  updateTileDefinition: (tilesetId: string, index: number, definition: TileDefinition) => void;

  // Tile actions
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
      pattern?: {
        pattern: (number | null)[][];
        patternW: number;
        patternH: number;
      };
    },
  ) => void;
  setTileCornerTerrain: (
    tilesetId: string,
    index: number,
    corner: number,
    terrainId: string | null,
  ) => Promise<void>;

  // Entity actions
  placeEntity: (entity: EntityInstance) => void;
  removeEntity: (entityId: string) => void;
  moveEntity: (entityId: string, position: [number, number]) => void;
  updateEntityLabel: (entityId: string, label: string | undefined) => void;
  updateEntityProperties: (entityId: string, properties: PropertyValues) => void;

  // Layer actions
  addLayer: (layer: Layer) => void;
  removeLayer: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  reorderLayer: (layerId: string, newZOrder: number) => void;
  toggleLayerVisibility: (layerId: string) => void;
  selectLayer: (layerId: string) => void;

  // Variation actions
  setActiveVariation: (variationId: string | null) => void;
  addVariation: (variation: Variation) => void;
  updateVariation: (id: string, updates: Partial<Variation>) => void;
  removeVariation: (id: string) => void;

  // Entity selection
  selectEntity: (id: string | null) => void;
  setSelectedEntityType: (id: string | null) => void;

  // Camera actions
  setCamera: (camera: Partial<EditorState['camera']>) => void;
  resetCamera: () => void;

  // Time preview actions
  setTimePreviewEnabled: (enabled: boolean) => void;
  setTimeOfDay: (time: number) => void;

  // Tileset toolbar mode
  setTilesetToolMode: (mode: 'select' | 'terrain') => void;

  // Reset selected tiles
  resetSelectedTiles: () => void;

  // Location link actions
  addLocationLink: (link: LocationLink) => void;
  updateLocationLink: (id: string, updates: Partial<LocationLink>) => void;
  removeLocationLink: (id: string) => void;
  selectLink: (id: string | null) => void;
  startPickingLinkTarget: (linkId: string) => void;
  cancelPickingLinkTarget: () => void;
  commitLinkTarget: (linkId: string, mapId: string, position: [number, number]) => void;
  clearPendingNewLink: () => void;
  createBidirectionalCounterpart: (sourceLinkId: string) => Promise<void>;

  // Validation
  validate: () => ValidationError[];
}

// ============================================================================
// History machinery
// ============================================================================

type EditorHistorySnapshot = {
  currentMap: GameMap | null;
};

const UNDO_HISTORY_LIMIT = 50;

let historyBatchDepth = 0;
let historyBatchCaptured = false;
let historySuppressionDepth = 0;

function withHistorySuppressed<T>(fn: () => T, options?: { clearHistory?: boolean }): T {
  const temporalState = useEditorStore.temporal.getState();
  const shouldResume = temporalState.isTracking && historySuppressionDepth === 0;

  historySuppressionDepth += 1;
  temporalState.pause();

  try {
    const result = fn();
    if (options?.clearHistory) {
      temporalState.clear();
      historyBatchCaptured = false;
    }
    return result;
  } finally {
    historySuppressionDepth -= 1;
    if (shouldResume && historySuppressionDepth === 0 && historyBatchDepth === 0) {
      temporalState.resume();
    }
  }
}

function finalizeHistoryBatchSave(): void {
  if (historyBatchDepth > 0 && !historyBatchCaptured) {
    historyBatchCaptured = true;
    useEditorStore.temporal.getState().pause();
  }
}

function syncEditorSelectionsWithMap(): void {
  useEditorStore.setState((state) => {
    const currentMap = state.currentMap;

    if (!currentMap) {
      state.selectedLayerId = null;
      state.selectedEntityId = null;
      state.selectedLinkId = null;
      state.activeVariationId = null;
      return;
    }

    if (state.activeVariationId) {
      const hasVariation = currentMap.variations?.some(
        (variation) => variation.id === state.activeVariationId,
      );
      if (!hasVariation) {
        state.activeVariationId = null;
      }
    }

    if (
      state.selectedLayerId &&
      !currentMap.layers.some((layer) => layer.id === state.selectedLayerId)
    ) {
      state.selectedLayerId = getPreferredSelectedLayerId(currentMap);
    }

    if (!state.selectedLayerId) {
      state.selectedLayerId = getPreferredSelectedLayerId(currentMap);
    }

    syncToolStateForSelectedLayer(state);

    if (state.selectedLinkId) {
      const hasLink =
        currentMap.locationLinks?.some((link) => link.id === state.selectedLinkId) ?? false;
      if (!hasLink) {
        state.selectedLinkId = null;
      }
    }

    if (state.selectedEntityId) {
      const hasEntity = resolveEntities(currentMap, state.activeVariationId).some(
        (entity) => entity.id === state.selectedEntityId,
      );
      if (!hasEntity) {
        state.selectedEntityId = null;
      }
    }
  });
}

export function beginEditorHistoryBatch(): void {
  historyBatchDepth += 1;

  if (historyBatchDepth === 1) {
    historyBatchCaptured = false;
    if (historySuppressionDepth === 0) {
      useEditorStore.temporal.getState().resume();
    }
  }
}

export function endEditorHistoryBatch(): void {
  if (historyBatchDepth === 0) {
    return;
  }

  historyBatchDepth -= 1;

  if (historyBatchDepth === 0) {
    historyBatchCaptured = false;
    if (historySuppressionDepth === 0) {
      useEditorStore.temporal.getState().resume();
    }
  }
}

export function undoEditorChange(): void {
  endEditorHistoryBatch();
  useEditorStore.temporal.getState().undo();
  syncEditorSelectionsWithMap();
}

export function redoEditorChange(): void {
  endEditorHistoryBatch();
  useEditorStore.temporal.getState().redo();
  syncEditorSelectionsWithMap();
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.closest('[contenteditable="true"]') !== null
  );
}

export function runEditorHistoryCommand(
  command: 'undo' | 'redo',
  target?: EventTarget | null,
): boolean {
  const state = useEditorStore.getState();

  if (state.mode !== 'maps' || !state.currentMap) {
    return false;
  }

  if (
    isEditableTarget(target ?? (typeof document !== 'undefined' ? document.activeElement : null))
  ) {
    return false;
  }

  if (command === 'undo') {
    undoEditorChange();
  } else {
    redoEditorChange();
  }

  return true;
}

export function useEditorHistory<T>(
  selector: (state: TemporalState<EditorHistorySnapshot>) => T,
  equality?: (left: T, right: T) => boolean,
): T {
  return useStoreWithEqualityFn(useEditorStore.temporal, selector, equality);
}

function isTrackedHistoryEqual(
  pastState: EditorHistorySnapshot,
  currentState: EditorHistorySnapshot,
): boolean {
  return pastState.currentMap === currentState.currentMap;
}

// ============================================================================
// Store creation
// ============================================================================

export const useEditorStore = create<EditorStore>()(
  temporal(
    devtools(
      subscribeWithSelector(
        immer((set, get) => ({
          // ── Slices ─────────────────────────────────────────────────────────
          ...createActorSlice(set, get, {} as never),
          ...createTerrainSlice(set, get, {} as never),
          ...createEntityTypeSlice(set, get, {} as never),
          ...createLayerDefinitionSlice(set, get, {} as never),
          ...createScriptingSlice(set, get, {} as never),

          // ── Initial state ──────────────────────────────────────────────────
          project: null,
          projectPath: null,
          mode: 'project' as EditorMode,
          tilesets: new globalThis.Map(),
          loadedSprites: new globalThis.Map(),
          maps: [],
          currentMap: null,
          currentMapPath: null,
          activeVariationId: null,
          timePreviewEnabled: false,
          timeOfDay: 0.5,
          activeTool: 'stamp' as ToolType,
          drawMode: 'point' as const,
          brushSize: 1,
          hoveredTile: null,
          drawPreview: { isDrawing: false, start: null, end: null },
          selectedLayerId: null,
          selectedTileIndex: null,
          selectedTileIndices: [],
          mapEditorSelectedTileIndex: null,
          mapEditorSelectedTileIndices: [],
          tilesetEditorSelectedTileIndex: null,
          tilesetEditorSelectedTileIndices: [],
          selectedTerrainId: null,
          activeTilesetId: null,
          sampledPattern: null,
          selectedEntityTypeId: null,
          selectedEntityId: null,
          selectedEntityIds: new Set(),
          entitySnapMode: 'grid' as const,
          showCollisionOverlay: false,
          showTilesetCollisionOverlay: false,
          showTerrainOverlay: false,
          camera: { x: 0, y: 0, zoom: 1.5 },
          mapCameras: {},
          tilesetToolMode: 'select' as const,
          panels: {
            layersOpen: true,
            tilesetPaletteOpen: true,
            entitiesOpen: true,
            inspectorOpen: true,
            variationsOpen: true,
          },
          dialogueIndex: null,
          dialogues: new globalThis.Map(),
          selectedDialogueId: null,
          selectedDialogueNodeId: null,
          validationErrors: [],
          selectedLinkId: null,
          pickingLinkTargetForLinkId: null,
          pendingNewLinkId: null,

          // ── Project actions ────────────────────────────────────────────────
          loadProject: async (path, project) => {
            withHistorySuppressed(
              () =>
                set((state) => {
                  state.project = project;
                  state.projectPath = path;
                  state.currentMap = null;
                  state.currentMapPath = null;
                  state.maps = [];
                  state.tilesets = new globalThis.Map();
                  state.loadedSprites = new globalThis.Map();
                  state.selectedLayerId = null;
                  state.activeTilesetId = null;
                  state.selectedTileIndex = null;
                  state.activeVariationId = null;
                  state.terrainTypes = [];
                  state.entityTypes = [];
                  state.tileMetadataDefinitions = [];
                }),
              { clearHistory: true },
            );
            recentProjects.add(project.name, path);
          },

          closeProject: () => {
            for (const timeoutId of pendingTilesetSaves.values()) {
              clearTimeout(timeoutId);
            }
            pendingTilesetSaves.clear();

            const currentProjectPath = useEditorStore.getState().projectPath;
            if ('ipcRenderer' in window && currentProjectPath) {
              window.ipcRenderer
                .invoke('app:stop-watching', currentProjectPath)
                .catch(() => undefined);
            }

            withHistorySuppressed(
              () =>
                set((state) => {
                  state.project = null;
                  state.projectPath = null;
                  state.currentMap = null;
                  state.maps = [];
                  state.tilesets = new globalThis.Map();
                  state.loadedSprites = new globalThis.Map();
                  state.activeTilesetId = null;
                  state.selectedTileIndex = null;
                  state.entityTypes = [];
                  state.tileMetadataDefinitions = [];
                  state.gameVariables = [];
                  state.scriptTables = [];
                  state.scriptFunctions = [];
                  state.scriptNamespaces = [];
                  state.scriptContextTypes = [];
                  state.actors = [];
                  state.selectedActorId = null;
                  state.dialogueIndex = null;
                  state.dialogues = new globalThis.Map();
                  state.selectedDialogueId = null;
                  state.selectedDialogueNodeId = null;
                }),
              { clearHistory: true },
            );
          },

          loadProjectResources: async () => {
            // 1. Load all tilesets
            const tilesets = await fileSystem.loadAllTilesets();
            for (const tileset of tilesets) {
              const tilesObjCount = tileset.tiles ? Object.keys(tileset.tiles).length : 0;
              const normalizedTileCount = Math.max(
                tileset.tileCount || 0,
                tilesObjCount,
                tileset.columns || 1,
              );
              const normalized = { ...tileset, tileCount: normalizedTileCount } as typeof tileset;

              set((state) => {
                state.tilesets.set(tileset.id, castDraft(normalized));
              });

              try {
                const blob = await fileSystem.loadAsset(tileset.spriteSheet);
                await useEditorStore.getState().loadSprite(tileset.spriteSheet, blob);
              } catch (e) {
                console.warn(`Failed to load sprite for tileset ${tileset.id}:`, e);
              }
            }

            set((state) => {
              if (!state.activeTilesetId && tilesets.length > 0) {
                state.activeTilesetId = tilesets[0].id;
                state.selectedTileIndex = 0;
              }
            });

            const proj = useEditorStore.getState().project;

            // 1.5 Terrain types
            if (proj?.terrainTypes && Array.isArray(proj.terrainTypes)) {
              set((state) => {
                state.terrainTypes = proj.terrainTypes!.map((t) => castDraft(t));
              });
            }

            // 1.6 Layer definitions
            if (proj?.layerDefinitions && Array.isArray(proj.layerDefinitions)) {
              set((state) => {
                state.layerDefinitions = proj.layerDefinitions!.map((d) => castDraft(d));
              });
            }

            // 1.7 Entity types
            if (proj?.entityTypes && Array.isArray(proj.entityTypes)) {
              set((state) => {
                state.entityTypes = proj.entityTypes!.map((e) => castDraft(e));
              });
            }

            // 1.72 Tile metadata definitions
            if (proj?.tileMetadataDefinitions && Array.isArray(proj.tileMetadataDefinitions)) {
              set((state) => {
                state.tileMetadataDefinitions = proj.tileMetadataDefinitions!.map((d) =>
                  castDraft(d),
                );
              });
            }

            // 1.75 Game variables
            if (proj?.gameVariables && Array.isArray(proj.gameVariables)) {
              set((state) => {
                state.gameVariables = castDraft(proj.gameVariables!);
              });
            }

            // 1.76 Scripting primitives
            if (proj?.scriptTables && Array.isArray(proj.scriptTables)) {
              set((state) => {
                state.scriptTables = castDraft(proj.scriptTables!);
              });
            }
            if (proj?.scriptFunctions && Array.isArray(proj.scriptFunctions)) {
              set((state) => {
                state.scriptFunctions = castDraft(proj.scriptFunctions!);
              });
            }
            if (proj?.scriptNamespaces && Array.isArray(proj.scriptNamespaces)) {
              set((state) => {
                state.scriptNamespaces = castDraft(proj.scriptNamespaces!);
              });
            }
            if (proj?.scriptContextTypes && Array.isArray(proj.scriptContextTypes)) {
              set((state) => {
                state.scriptContextTypes = castDraft(proj.scriptContextTypes!);
              });
            }

            // 1.8 Actors
            const actors = await fileSystem.loadAllActors();
            set((state) => {
              state.actors = castDraft(actors);
            });

            // 1.85 Dialogue index + documents
            const loadedDialogueIndex =
              (await fileSystem.readDialogueIndex()) ??
              ({
                version: 1,
                categories: [],
                customActors: [],
                dialogues: [],
              } as import('../types/schema').DialogueIndex);

            const loadedDialogues = await fileSystem.loadDialoguesByIds(
              loadedDialogueIndex.dialogues.map((entry) => entry.id),
            );

            set((state) => {
              state.dialogueIndex = castDraft(loadedDialogueIndex);
              state.dialogues = new globalThis.Map(
                loadedDialogues.map((dialogue) => [dialogue.id, castDraft(dialogue)]),
              );
              state.selectedDialogueId = loadedDialogues[0]?.id ?? null;
              state.selectedDialogueNodeId =
                (
                  loadedDialogues[0] as unknown as {
                    startNodeId?: string;
                    entryStepId?: string;
                  }
                )?.startNodeId ??
                (
                  loadedDialogues[0] as unknown as {
                    startNodeId?: string;
                    entryStepId?: string;
                  }
                )?.entryStepId ??
                null;
            });

            // 1.9 Entity type sprites
            const entityTypes = useEditorStore.getState().entityTypes;
            for (const et of entityTypes) {
              if (!et.sprite?.path) continue;
              try {
                const path = et.sprite.path;
                const looksRelative = !path.match(/^([A-Za-z]:[/\\]|\/)/);
                const blob = looksRelative
                  ? await fileSystem.loadAsset(path)
                  : await fileSystem.readFileAsBlob(path);
                await useEditorStore.getState().loadSprite(path, blob);
              } catch (e) {
                console.warn(`Failed to load sprite for entity type ${et.id}:`, e);
              }
            }

            // 2. Load all maps
            const maps = await fileSystem.loadAllMaps();
            const layerDefs = useEditorStore.getState().layerDefinitions;
            const enrichedMaps = maps.map((m) => addMissingDefinitionLayers(m, layerDefs));

            withHistorySuppressed(() =>
              set((state) => {
                state.maps = castDraft(enrichedMaps);
              }),
            );

            if (enrichedMaps.length > 0) {
              withHistorySuppressed(
                () =>
                  set((state) => {
                    state.currentMap = castDraft(enrichedMaps[0]);
                    state.currentMapPath = `maps/${enrichedMaps[0].id}.map.json`;
                    state.selectedLayerId = getPreferredSelectedLayerId(enrichedMaps[0]);
                    syncToolStateForSelectedLayer(state, { forceDefault: true });
                  }),
                { clearHistory: true },
              );
            }
          },

          loadSprite: async (path, blob) => {
            const resolved = await resolveSpriteAsset(path, blob);
            const url = URL.createObjectURL(resolved.imageBlob);
            const img = new Image();
            img.src = url;
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
            });

            set((state) => {
              state.loadedSprites = new Map(state.loadedSprites);
              state.loadedSprites.set(path, castDraft(img));
            });

            return url;
          },

          updateProject: async (project) => {
            await fileSystem.saveJson('', `${project.id}.project.json`, {
              $schema: '../schemas/project.schema.json',
              ...project,
            });
            set((state) => {
              state.project = project;
            });
          },

          // ── Map actions ────────────────────────────────────────────────────
          setCurrentMap: (map) => {
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
                  if (enrichedMap && state.mapCameras && state.mapCameras[enrichedMap.id]) {
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
            );
          },

          loadMap: (mapId) => {
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

                  if (state.mapCameras && state.mapCameras[mapId]) {
                    state.camera = { ...state.mapCameras[mapId] };
                  } else {
                    state.camera = { x: 0, y: 0, zoom: 1.5 };
                  }

                  state.selectedLayerId = getPreferredSelectedLayerId(enrichedMap);
                  syncToolStateForSelectedLayer(state, { forceDefault: true });
                }),
              { clearHistory: true },
            );
          },

          createNewMap: async (name, width, height, tilesetId) => {
            const id = name.toLowerCase().replace(/\s+/g, '-');
            const layerDefs = useEditorStore.getState().layerDefinitions;
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

          addMap: (map: GameMap) => {
            set((state) => {
              state.currentMap = castDraft(map);
            });
          },

          updateCurrentMap: (updates) => {
            set((state) => {
              if (!state.currentMap) return;
              Object.assign(state.currentMap, updates);

              if (
                updates.baseTilesetId &&
                !state.currentMap.tilesetRefs.includes(updates.baseTilesetId)
              ) {
                state.currentMap.tilesetRefs.unshift(updates.baseTilesetId);
              }

              if (updates.baseTilesetId && !state.activeVariationId) {
                state.activeTilesetId = updates.baseTilesetId;
              }
            });
          },

          deleteMap: async (mapId) => {
            const map = useEditorStore.getState().maps.find((m) => m.id === mapId);
            if (!map) return;

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

          // ── Tool actions ───────────────────────────────────────────────────
          setActiveTool: (tool) => {
            set((state) => {
              state.activeTool = tool;
              if (tool === 'stamp' && !state.selectedLayerId && state.currentMap) {
                state.selectedLayerId = state.currentMap.layers[0]?.id || null;
              }
              if (tool === 'terrain' && !state.selectedTerrainId && state.terrainTypes.length > 0) {
                state.selectedTerrainId = state.terrainTypes[0].id;
              }
            });
          },

          setEntitySnapMode: (mode) =>
            set((state) => {
              state.entitySnapMode = mode;
            }),

          setShowCollisionOverlay: (enabled) =>
            set((state) => {
              state.showCollisionOverlay = enabled;
            }),

          setShowTerrainOverlay: (enabled) =>
            set((state) => {
              state.showTerrainOverlay = enabled;
            }),

          reloadTerrainLayers: () =>
            set((state) => {
              const map = state.currentMap;
              const activeTilesetId = state.activeTilesetId;
              if (!map || !activeTilesetId) return;

              const tileset = state.tilesets.get(activeTilesetId);
              if (!tileset) return;

              const tilesetIndex = map.tilesetRefs.indexOf(activeTilesetId);
              if (tilesetIndex === -1) return;
              const tilesetBase = tilesetIndex << 16;

              for (const layer of map.layers) {
                if (layer.kind !== 'terrain' || !layer.terrainData || !layer.data) continue;

                const W = map.width;
                const H = map.height;
                const terrainGrid = buildTerrainGridFromLayer(
                  layer.data,
                  state.tilesets,
                  map.tilesetRefs,
                );

                for (let y = 0; y < H; y++) {
                  for (let x = 0; x < W; x++) {
                    const corners = getCornerTerrainsForTile(x, y, terrainGrid);

                    if (corners.every((corner) => corner === null)) {
                      layer.data[y][x] = null;
                      continue;
                    }

                    const tileIdx = findBestMatchingTileWithFallback(tileset, corners, true);
                    layer.data[y][x] =
                      tileIdx !== null ? ((tilesetBase | tileIdx) as unknown as number) : null;
                  }
                }
              }
            }),

          setShowTilesetCollisionOverlay: (enabled) =>
            set((state) => {
              state.showTilesetCollisionOverlay = enabled;
            }),

          setDrawMode: (mode) =>
            set((state) => {
              state.drawMode = mode;
            }),

          setBrushSize: (size) =>
            set((state) => {
              state.brushSize = Math.max(1, Math.round(size));
            }),

          setDrawPreview: (preview) =>
            set((state) => {
              state.drawPreview = preview;
            }),

          setHoveredTile: (pos) =>
            set((state) => {
              state.hoveredTile = pos;
            }),

          setMode: (mode) => {
            set((state) => {
              state.mode = mode;
              state.selectedTileIndex = null;
              state.selectedTileIndices = [];
              state.mapEditorSelectedTileIndex = null;
              state.mapEditorSelectedTileIndices = [];
              state.tilesetEditorSelectedTileIndex = null;
              state.tilesetEditorSelectedTileIndices = [];
            });
          },

          // ── Tileset actions ────────────────────────────────────────────────
          setActiveTileset: (id) =>
            set((state) => {
              state.activeTilesetId = id;
              state.selectedTileIndex = null;
              state.selectedTileIndices = [];
              state.selectedTerrainId = null;
            }),

          setSelectedTile: (index) =>
            set((state) => {
              state.selectedTileIndex = index;
              if (index !== null) state.selectedTerrainId = null;
              state.selectedTileIndices = index !== null ? [index] : [];
              state.sampledPattern = null;
            }),

          setSelectedTiles: (indexes) =>
            set((state) => {
              state.selectedTileIndices = indexes.slice();
              state.selectedTileIndex = indexes.length > 0 ? indexes[indexes.length - 1] : null;
              if (state.selectedTileIndex !== null) state.selectedTerrainId = null;
              state.sampledPattern = null;
            }),

          toggleSelectedTile: (index) =>
            set((state) => {
              const idx = state.selectedTileIndices.indexOf(index);
              if (idx === -1) state.selectedTileIndices.push(index);
              else state.selectedTileIndices.splice(idx, 1);
              state.selectedTileIndex =
                state.selectedTileIndices.length > 0
                  ? state.selectedTileIndices[state.selectedTileIndices.length - 1]
                  : null;
              if (state.selectedTileIndex !== null) state.selectedTerrainId = null;
            }),

          setSelectedTerrain: (id) =>
            set((state) => {
              state.selectedTerrainId = id;
              if (id !== null) state.selectedTileIndex = null;
            }),

          setSampledPattern: (pattern) =>
            set((state) => {
              state.sampledPattern = pattern;
              if (pattern) {
                state.selectedTileIndices = [];
              }
            }),

          addTileset: async (tileset) => {
            useSaveStore.getState().setStatus('saving');
            await fileSystem.saveJson(
              'tilesets',
              `${tileset.id}.tileset.json`,
              serializeTileset(tileset),
            );
            useSaveStore.getState().setStatus('saved');
            setTimeout(() => {
              if (useSaveStore.getState().status === 'saved')
                useSaveStore.getState().setStatus('idle');
            }, 2000);

            set((state) => {
              state.tilesets.set(tileset.id, castDraft(tileset));
              if (!state.activeTilesetId) state.activeTilesetId = tileset.id;
            });

            try {
              const blob = await fileSystem.loadAsset(tileset.spriteSheet);
              await useEditorStore.getState().loadSprite(tileset.spriteSheet, blob);
            } catch (e) {
              console.warn('Failed to load sprite for new tileset:', e);
            }
          },

          updateTileset: async (id, updates) => {
            let updatedTileset: Tileset | undefined;

            set((state) => {
              const ts = state.tilesets.get(id);
              if (ts) {
                Object.assign(ts, updates);
                updatedTileset = JSON.parse(JSON.stringify(ts));
              }
            });

            if (updatedTileset) {
              useSaveStore.getState().setStatus('saving');
              await fileSystem.saveJson(
                'tilesets',
                `${id}.tileset.json`,
                serializeTileset(updatedTileset),
              );
              useSaveStore.getState().setStatus('saved');
              setTimeout(() => {
                if (useSaveStore.getState().status === 'saved')
                  useSaveStore.getState().setStatus('idle');
              }, 2000);

              if ('spriteSheet' in updates && updatedTileset.spriteSheet) {
                try {
                  const blob = await fileSystem.loadAsset(updatedTileset.spriteSheet);
                  await useEditorStore.getState().loadSprite(updatedTileset.spriteSheet, blob);
                } catch (e) {
                  console.warn('Failed to reload sprite after update:', e);
                }
              }
            }
          },

          deleteTileset: async (id) => {
            set((state) => {
              state.tilesets.delete(id);
              if (state.activeTilesetId === id) {
                state.activeTilesetId = null;
                state.selectedTileIndex = null;
              }
            });

            useSaveStore.getState().setStatus('saving');
            await fileSystem.deleteJson('tilesets', `${id}.tileset.json`);
            useSaveStore.getState().setStatus('saved');
            setTimeout(() => {
              if (useSaveStore.getState().status === 'saved')
                useSaveStore.getState().setStatus('idle');
            }, 2000);
          },

          updateTileDefinition: (tilesetId, index, definition) => {
            set((state) => {
              const ts = state.tilesets.get(tilesetId);
              if (ts) {
                ts.tiles[index] = castDraft(definition);
              }
            });
            scheduleTilesetSave(tilesetId);
          },

          setTileCornerTerrain: async (tilesetId, index, corner, terrainId) => {
            let updatedTileset: Tileset | undefined;

            set((state) => {
              const ts = state.tilesets.get(tilesetId);
              if (!ts) return;
              const tile = ts.tiles[index] || ({} as TileDefinition);
              if (!tile.terrainCorners) tile.terrainCorners = [null, null, null, null];
              tile.terrainCorners[corner] = terrainId;

              if (terrainId === null) {
                const updatedCorners = [...tile.terrainCorners];
                updatedCorners[corner] = null;
                if (updatedCorners.every((c) => c === null)) {
                  delete tile.terrainCorners;
                } else {
                  tile.terrainCorners = updatedCorners;
                }
              }

              ts.tiles[index] = castDraft(tile);
              updatedTileset = JSON.parse(JSON.stringify(ts));
            });

            if (updatedTileset) {
              useSaveStore.getState().setStatus('saving');
              await fileSystem.saveJson(
                'tilesets',
                `${tilesetId}.tileset.json`,
                serializeTileset(updatedTileset),
              );
              useSaveStore.getState().setStatus('saved');
              setTimeout(() => {
                if (useSaveStore.getState().status === 'saved')
                  useSaveStore.getState().setStatus('idle');
              }, 2000);
            }
          },

          // ── Tile painting ──────────────────────────────────────────────────
          paintTile: (layerId, x, y, tilesetId, tileIndex) =>
            set((state) => {
              if (!state.currentMap) return;
              const tileRef = createTileRef(tilesetId, tileIndex);
              setTileInState(state.currentMap, state.activeVariationId, layerId, x, y, tileRef);
            }),

          paintTilesBatch: (layerId, tiles) =>
            set((state) => {
              if (!state.currentMap) return;
              for (const { x, y, tilesetId, tileIndex } of tiles) {
                if (x < 0 || y < 0 || x >= state.currentMap.width || y >= state.currentMap.height)
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
            set((state) => {
              if (!state.currentMap) return;
              setTileInState(state.currentMap, state.activeVariationId, layerId, x, y, null);
            }),

          eraseTilesBatch: (layerId, positions) =>
            set((state) => {
              if (!state.currentMap) return;
              for (const { x, y } of positions) {
                if (x < 0 || y < 0 || x >= state.currentMap.width || y >= state.currentMap.height)
                  continue;
                setTileInState(state.currentMap, state.activeVariationId, layerId, x, y, null);
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
                (x, y) => resolveTileAt(map, layerId, x, y, state.activeVariationId) === startTile,
              );

              for (const { x, y } of tilesToFill) {
                setTileInState(map, state.activeVariationId, layerId, x, y, targetTileRef);
              }
            }),

          bucketFillAdvanced: (layerId, startX, startY, options) =>
            set((state) => {
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
                (x, y) => resolveTileAt(map, layerId, x, y, state.activeVariationId) === startTile,
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

          // ── Entity instance actions ────────────────────────────────────────
          placeEntity: (entity) =>
            set((state) => {
              if (!state.currentMap) return;

              const selectedLayer = state.currentMap.layers.find(
                (l) => l.id === state.selectedLayerId,
              );
              if (selectedLayer && selectedLayer.kind === 'entity') {
                const toAdd: EntityInstance = { ...entity, layerId: selectedLayer.id };

                if (state.activeVariationId) {
                  const variation = state.currentMap.variations?.find(
                    (v) => v.id === state.activeVariationId,
                  );
                  if (variation) {
                    if (!variation.entityOverrides) variation.entityOverrides = [];
                    variation.entityOverrides.push({ action: 'add', entity: castDraft(toAdd) });
                    return;
                  }
                }

                if (!selectedLayer.entities) selectedLayer.entities = [];
                selectedLayer.entities.push(castDraft(toAdd));
                return;
              }

              if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(
                  (v) => v.id === state.activeVariationId,
                );
                if (variation) {
                  if (!variation.entityOverrides) variation.entityOverrides = [];
                  variation.entityOverrides.push({ action: 'add', entity: castDraft(entity) });
                  return;
                }
              }

              state.currentMap.entities.push(castDraft(entity));
            }),

          removeEntity: (entityId) =>
            set((state) => {
              if (!state.currentMap) return;

              if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(
                  (v) => v.id === state.activeVariationId,
                );
                if (variation) {
                  if (!variation.entityOverrides) variation.entityOverrides = [];

                  const existingAddIdx = variation.entityOverrides.findIndex(
                    (o) => o.action === 'add' && o.entity?.id === entityId,
                  );
                  if (existingAddIdx !== -1) {
                    variation.entityOverrides.splice(existingAddIdx, 1);
                    return;
                  }

                  variation.entityOverrides.push({ action: 'remove', entityId });
                  return;
                }
              }

              state.currentMap.entities = state.currentMap.entities.filter(
                (e) => e.id !== entityId,
              );

              for (const layer of state.currentMap.layers) {
                if (layer.kind === 'entity' && layer.entities) {
                  layer.entities = layer.entities.filter((e) => e.id !== entityId);
                }
              }
            }),

          moveEntity: (entityId, position) =>
            set((state) => {
              if (!state.currentMap) return;

              if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(
                  (v) => v.id === state.activeVariationId,
                );
                if (variation) {
                  if (!variation.entityOverrides) variation.entityOverrides = [];

                  const existingAdd = variation.entityOverrides.find(
                    (o) => o.action === 'add' && o.entity?.id === entityId,
                  );
                  if (existingAdd && existingAdd.entity) {
                    existingAdd.entity.position = position;
                    return;
                  }

                  const existingModify = variation.entityOverrides.find(
                    (o) => o.action === 'modify' && o.entityId === entityId,
                  );
                  if (existingModify) {
                    if (!existingModify.entity) {
                      existingModify.entity = {} as Partial<EntityInstance>;
                    }
                    existingModify.entity.position = position;
                  } else {
                    variation.entityOverrides.push({
                      action: 'modify',
                      entityId,
                      entity: { position } as Partial<EntityInstance>,
                    });
                  }
                  return;
                }
              }

              const entity = state.currentMap.entities.find((e) => e.id === entityId);
              if (entity) {
                entity.position = position;
                return;
              }

              for (const layer of state.currentMap.layers) {
                if (layer.kind === 'entity' && layer.entities) {
                  const layerEntity = layer.entities.find((e) => e.id === entityId);
                  if (layerEntity) {
                    layerEntity.position = position;
                    return;
                  }
                }
              }
            }),

          updateEntityLabel: (entityId, label) =>
            set((state) => {
              if (!state.currentMap) return;

              if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(
                  (v) => v.id === state.activeVariationId,
                );
                if (variation) {
                  if (!variation.entityOverrides) variation.entityOverrides = [];

                  const existingAdd = variation.entityOverrides.find(
                    (o) => o.action === 'add' && o.entity?.id === entityId,
                  );
                  if (existingAdd && existingAdd.entity) {
                    existingAdd.entity.label = label;
                    return;
                  }

                  const existingModify = variation.entityOverrides.find(
                    (o) => o.action === 'modify' && o.entityId === entityId,
                  );
                  if (existingModify) {
                    if (!existingModify.entity) {
                      existingModify.entity = {} as Partial<EntityInstance>;
                    }
                    existingModify.entity.label = label;
                  } else {
                    variation.entityOverrides.push({
                      action: 'modify',
                      entityId,
                      entity: { label } as Partial<EntityInstance>,
                    });
                  }
                  return;
                }
              }

              const entity = state.currentMap.entities.find((e) => e.id === entityId);
              if (entity) {
                entity.label = label;
                return;
              }

              for (const layer of state.currentMap.layers) {
                if (layer.kind === 'entity' && layer.entities) {
                  const layerEntity = layer.entities.find((e) => e.id === entityId);
                  if (layerEntity) {
                    layerEntity.label = label;
                    return;
                  }
                }
              }
            }),

          updateEntityProperties: (entityId, properties) =>
            set((state) => {
              if (!state.currentMap) return;

              if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(
                  (v) => v.id === state.activeVariationId,
                );
                if (variation) {
                  if (!variation.entityOverrides) variation.entityOverrides = [];

                  const existingOverride = variation.entityOverrides.find(
                    (o) =>
                      (o.action === 'add' && o.entity?.id === entityId) ||
                      (o.action === 'modify' && o.entityId === entityId),
                  );

                  if (existingOverride) {
                    if (existingOverride.action === 'add' && existingOverride.entity) {
                      existingOverride.entity.properties = {
                        ...((existingOverride.entity.properties as PropertyValues) || {}),
                        ...properties,
                      } as PropertyValues;
                    } else if (existingOverride.action === 'modify') {
                      if (!existingOverride.entity)
                        existingOverride.entity = { properties: {} } as Partial<EntityInstance>;
                      if (existingOverride.entity) {
                        existingOverride.entity.properties = {
                          ...((existingOverride.entity.properties as PropertyValues) || {}),
                          ...properties,
                        } as PropertyValues;
                      }
                    }
                  } else {
                    variation.entityOverrides.push({
                      action: 'modify',
                      entityId,
                      entity: { properties } as Partial<EntityInstance>,
                    });
                  }
                  return;
                }
              }

              let entity = state.currentMap.entities.find((e) => e.id === entityId);
              if (!entity) {
                for (const layer of state.currentMap.layers) {
                  if (layer.kind === 'entity' && layer.entities) {
                    const found = layer.entities.find((en) => en.id === entityId);
                    if (found) {
                      entity = found;
                      break;
                    }
                  }
                }
              }

              if (entity) {
                entity.properties = { ...entity.properties, ...properties };
              }
            }),

          // ── Layer actions ──────────────────────────────────────────────────
          addLayer: (layer) =>
            set((state) => {
              if (state.currentMap) {
                state.currentMap.layers.push(castDraft(layer));
              }
            }),

          removeLayer: (layerId) =>
            set((state) => {
              if (state.currentMap) {
                state.currentMap.layers = state.currentMap.layers.filter((l) => l.id !== layerId);
              }
            }),

          reorderLayer: (layerId, newZOrder) =>
            set((state) => {
              if (!state.currentMap) return;
              const layer = state.currentMap.layers.find((l) => l.id === layerId);
              if (layer) {
                layer.zOrder = newZOrder;
                state.currentMap.layers.sort((a, b) => a.zOrder - b.zOrder);
              }
            }),

          toggleLayerVisibility: (layerId) =>
            set((state) => {
              const layer = state.currentMap?.layers.find((l) => l.id === layerId);
              if (layer) {
                layer.visible = !layer.visible;
              }
            }),

          selectLayer: (layerId) =>
            set((state) => {
              const prevLayer = state.currentMap?.layers.find(
                (l) => l.id === state.selectedLayerId,
              );
              state.selectedLayerId = layerId;
              syncToolStateForSelectedLayer(state, {
                forceDefault:
                  prevLayer?.kind !== state.currentMap?.layers.find((l) => l.id === layerId)?.kind,
              });
            }),

          updateLayer: (layerId, updates) =>
            set((state) => {
              const layer = state.currentMap?.layers.find((l) => l.id === layerId);
              if (layer) {
                Object.assign(layer, updates);
                if (updates.zOrder !== undefined && state.currentMap) {
                  state.currentMap.layers.sort((a, b) => a.zOrder - b.zOrder);
                }
              }
            }),

          // ── Variation actions ──────────────────────────────────────────────
          setActiveVariation: (variationId) => {
            withHistorySuppressed(
              () =>
                set((state) => {
                  state.activeVariationId = variationId;
                }),
              { clearHistory: true },
            );
          },

          addVariation: (variation) => {
            set((state) => {
              if (state.currentMap) {
                if (!state.currentMap.variations) state.currentMap.variations = [];
                state.currentMap.variations.push(castDraft(variation));
              }
            });
          },

          updateVariation: (id, updates) => {
            set((state) => {
              const variation = state.currentMap?.variations?.find((v) => v.id === id);
              if (variation) {
                Object.assign(variation, updates);
              }
            });
          },

          removeVariation: (id) => {
            set((state) => {
              if (state.currentMap) {
                state.currentMap.variations = state.currentMap.variations?.filter(
                  (v) => v.id !== id,
                );
                if (state.activeVariationId === id) state.activeVariationId = null;
              }
            });
          },

          // ── Entity selection ───────────────────────────────────────────────
          selectEntity: (id) =>
            set((state) => {
              state.selectedEntityId = id;
              if (id !== null) state.selectedLinkId = null;
            }),

          setSelectedEntityType: (id) =>
            set((state) => {
              state.selectedEntityTypeId = id;
              if (id) {
                state.activeTool = 'entityPlace';
              }
            }),

          // ── Camera ─────────────────────────────────────────────────────────
          setCamera: (camera) =>
            set((state) => {
              state.camera = { ...state.camera, ...camera };
              if (state.currentMap) {
                try {
                  state.mapCameras = state.mapCameras || {};
                  state.mapCameras[state.currentMap.id] = { ...state.camera };
                } catch (e) {
                  // ignore
                }
              }
            }),

          resetCamera: () =>
            set((state) => {
              state.camera = { x: 0, y: 0, zoom: 1.5 };
            }),

          // ── Time preview ───────────────────────────────────────────────────
          setTimePreviewEnabled: (enabled) =>
            set((state) => {
              state.timePreviewEnabled = enabled;
            }),

          setTimeOfDay: (time) =>
            set((state) => {
              state.timeOfDay = Math.max(0, Math.min(1, time));
            }),

          resetSelectedTiles: () =>
            set((state) => {
              state.selectedTileIndex = null;
              state.selectedTileIndices = [];
              state.selectedTerrainId = null;
              state.sampledPattern = null;
            }),

          setTilesetToolMode: (mode) =>
            set((state) => {
              state.tilesetToolMode = mode;
              if (mode === 'terrain' && !state.selectedTerrainId && state.terrainTypes.length > 0) {
                state.selectedTerrainId = state.terrainTypes[0].id;
              }
            }),

          // ── Location link actions ──────────────────────────────────────────
          addLocationLink: (link) => {
            set((state) => {
              if (!state.currentMap) return;
              if (!state.currentMap.locationLinks) state.currentMap.locationLinks = [];
              state.currentMap.locationLinks.push(castDraft(link));
              state.selectedLinkId = link.id;
              state.pendingNewLinkId = link.id;
            });
            const { currentMap } = useEditorStore.getState();
            if (currentMap) saveMapDebounced(currentMap);
          },

          updateLocationLink: (id, updates) => {
            set((state) => {
              if (!state.currentMap?.locationLinks) return;
              const link = state.currentMap.locationLinks.find((l) => l.id === id);
              if (link) Object.assign(link, updates);
            });
            const { currentMap } = useEditorStore.getState();
            if (currentMap) saveMapDebounced(currentMap);
          },

          removeLocationLink: (id) => {
            set((state) => {
              if (!state.currentMap?.locationLinks) return;
              state.currentMap.locationLinks = state.currentMap.locationLinks.filter(
                (l) => l.id !== id,
              );
              if (state.selectedLinkId === id) {
                state.selectedLinkId = null;
              }
            });
            const { currentMap } = useEditorStore.getState();
            if (currentMap) saveMapDebounced(currentMap);
          },

          selectLink: (id) => {
            set((state) => {
              state.selectedLinkId = id;
              if (id !== null) state.selectedEntityId = null;
            });
          },

          startPickingLinkTarget: (linkId) => {
            set((state) => {
              state.pickingLinkTargetForLinkId = linkId;
            });
          },

          cancelPickingLinkTarget: () => {
            set((state) => {
              state.pickingLinkTargetForLinkId = null;
            });
          },

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
            const { currentMap } = useEditorStore.getState();
            if (currentMap) saveMapDebounced(currentMap);
          },

          clearPendingNewLink: () => {
            set((state) => {
              state.pendingNewLinkId = null;
            });
          },

          createBidirectionalCounterpart: async (sourceLinkId) => {
            const state = useEditorStore.getState();
            const sourceMap = state.currentMap;
            if (!sourceMap) return;

            const sourceLink = sourceMap.locationLinks?.find((l) => l.id === sourceLinkId);
            if (!sourceLink || !sourceLink.targetMapId) return;

            const targetMap = state.maps.find((m) => m.id === sourceLink.targetMapId);
            if (!targetMap) return;

            const counterpartId = `link-${Date.now()}`;

            const counterpart: LocationLink = {
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

              if (s.currentMap?.id === sourceMap.id) {
                s.currentMap = castDraft(updatedSourceMap);
              }
            });
          },

          validate: () => {
            return [];
          },
        })),
      ),
    ),
    {
      limit: UNDO_HISTORY_LIMIT,
      partialize: (state) => ({
        currentMap: state.currentMap,
      }),
      equality: isTrackedHistoryEqual,
      onSave: () => {
        finalizeHistoryBatchSave();
      },
    },
  ),
);

// ============================================================================
// IPC listeners (Electron hot-reload for assets and tilesets)
// ============================================================================

if ('ipcRenderer' in window) {
  window.ipcRenderer.on(
    'app:asset-changed',
    async (_event, payload: { eventType: string; relativePath: string }) => {
      const { relativePath } = payload;
      try {
        const state = useEditorStore.getState();

        if (state.loadedSprites.has(relativePath)) {
          try {
            const blob = await fileSystem.loadAsset(relativePath);
            await state.loadSprite(relativePath, blob);
            console.info('Reloaded sprite asset:', relativePath);
          } catch (e) {
            console.warn('Failed to reload sprite asset', relativePath, e);
          }
        }

        for (const [id, ts] of state.tilesets.entries()) {
          try {
            if (ts.spriteSheet === relativePath) {
              if (state.loadedSprites.has(relativePath)) {
                const blob = await fileSystem.loadAsset(relativePath);
                await state.loadSprite(relativePath, blob);
              }
              console.info('Tileset sprite changed for tileset:', id, relativePath);
            }
          } catch (e) {
            // ignore per-tileset errors
          }
        }
      } catch (e) {
        // swallow errors
      }
    },
  );

  window.ipcRenderer.on(
    'app:tileset-changed',
    async (
      _event,
      payload: { eventType: string; relativePath: string; tileset: Tileset | null },
    ) => {
      const { relativePath, tileset } = payload;
      try {
        if (!tileset) {
          console.warn('Tileset changed but could not parse JSON:', relativePath);
          return;
        }

        useEditorStore.setState((state) => {
          const newMap = new Map(state.tilesets);
          try {
            newMap.set(tileset.id, tileset);
          } catch (e) {
            newMap.set(relativePath, tileset);
          }
          return { tilesets: newMap };
        });

        if (tileset.spriteSheet) {
          try {
            const blob = await fileSystem.loadAsset(tileset.spriteSheet);
            await useEditorStore.getState().loadSprite(tileset.spriteSheet, blob);
          } catch (e) {
            console.warn('Failed to reload tileset sprite:', tileset.spriteSheet, e);
          }
        }
      } catch (e) {
        // swallow
      }
    },
  );

  window.ipcRenderer.on('app:history-command', (_event, command: 'undo' | 'redo') => {
    runEditorHistoryCommand(command);
  });
}

// ============================================================================
// Auto-save subscription
// ============================================================================

let lastSavedMapJson: string | null = null;

useEditorStore.subscribe(
  (state) => state.currentMap,
  (currentMap, prevMap) => {
    if (!currentMap) {
      lastSavedMapJson = null;
      return;
    }

    const currentJson = JSON.stringify(currentMap);
    if (currentMap.id !== prevMap?.id) {
      lastSavedMapJson = currentJson;
      return;
    }

    if (currentJson !== lastSavedMapJson) {
      lastSavedMapJson = currentJson;
      saveMapDebounced(currentMap);

      useEditorStore.setState((state) => {
        const idx = state.maps.findIndex((m) => m.id === currentMap.id);
        if (idx !== -1) {
          state.maps[idx] = castDraft(currentMap);
        }
      });
    }
  },
  { fireImmediately: false },
);

useEditorStore.subscribe(
  (state) => ({
    terrainTypes: state.terrainTypes,
    entityTypes: state.entityTypes,
    layerDefinitions: state.layerDefinitions,
  }),
  () => {
    useSaveStore.getState().setStatus('saved');
    setTimeout(() => {
      if (useSaveStore.getState().status === 'saved') {
        useSaveStore.getState().setStatus('idle');
      }
    }, 2000);
  },
  { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
);
