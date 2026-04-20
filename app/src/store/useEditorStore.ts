import { create } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector, devtools } from 'zustand/middleware';
import { castDraft } from 'immer';
import { temporal, type TemporalState } from 'zundo';
import { EditorState, ValidationError, EditorMode } from '../types/editor';
import { Project, Map as GameMap, Tileset } from '../types/schema';
import { recentProjects } from '../lib/recentProjects';
import { resolveEntities } from '../lib/mapUtils';
import { fileSystem } from '../lib/fileSystem';
import { registerSaveAccessors, saveMapDebounced } from '../lib/saveManager';
import { migrateTilesetOnLoad } from '../lib/tilesetMigration';
import {
  getPreferredSelectedLayerId,
  syncToolStateForSelectedLayer,
  pendingTilesetSaves,
  withHistorySuppressed,
  registerTemporalStore,
} from './storeHelpers';
import { loadProjectResources, loadSprite } from './projectLoader';
import { createActorSlice, ActorSlice } from './slices/actorSlice';
import { createItemSlice, ItemSlice } from './slices/itemSlice';
import { createItemClassSlice, ItemClassSlice } from './slices/itemClassSlice';
import { createTerrainSlice, TerrainSlice } from './slices/terrainSlice';
import { createEntityTypeSlice, EntityTypeSlice } from './slices/entityTypeSlice';
import { createLayerDefinitionSlice, LayerDefinitionSlice } from './slices/layerDefinitionSlice';
import { createScriptingSlice, ScriptingSlice } from './slices/scriptingSlice';
import { createToolSlice, ToolSlice } from './slices/toolSlice';
import { createTilePaintSlice, TilePaintSlice } from './slices/tilePaintSlice';
import { createTilesetSlice, TilesetSlice } from './slices/tilesetSlice';
import { createEntityInstanceSlice, EntityInstanceSlice } from './slices/entityInstanceSlice';
import {
  createMapSlice,
  MapSlice,
  createLocationLinkSlice,
  LocationLinkSlice,
} from './slices/mapSlice';
import { createLayerSlice, LayerSlice } from './slices/layerSlice';
import { createTriggerSlice, TriggerSlice } from './slices/triggerSlice';

// ============================================================================
// Store interface
// ============================================================================

export interface EditorStore
  extends
    ActorSlice,
    ItemSlice,
    ItemClassSlice,
    TerrainSlice,
    EntityTypeSlice,
    LayerDefinitionSlice,
    ScriptingSlice,
    ToolSlice,
    TilePaintSlice,
    TilesetSlice,
    EntityInstanceSlice,
    MapSlice,
    LocationLinkSlice,
    LayerSlice,
    TriggerSlice {
  // Fields from EditorState not owned by any slice
  project: Project | null;
  projectPath: string | null;
  resourcesLoaded: boolean;
  resourceLoadingLabel: string | null;
  resourceLoadingProgress: number;
  mode: EditorMode;
  loadedSprites: globalThis.Map<string, HTMLImageElement>;
  selectedEntityTypeId: string | null;
  panels: EditorState['panels'];
  validationErrors: ValidationError[];
  dialogueIndex: import('../types/schema').DialogueIndex | null;
  dialogues: globalThis.Map<string, import('../types/schema').DialogueDocument>;
  selectedDialogueId: string | null;
  selectedDialogueNodeId: string | null;

  // Project actions
  loadProject: (path: string, project: Project) => Promise<void>;
  closeProject: () => void;
  loadProjectResources: () => Promise<void>;
  loadSprite: (path: string, blob: Blob) => Promise<string>;
  updateProject: (project: Project) => Promise<void>;

  // Misc
  validate: () => ValidationError[];
}

// ============================================================================
// History machinery
// ============================================================================

type EditorHistorySnapshot = { currentMap: GameMap | null };

const UNDO_HISTORY_LIMIT = 50;
let historyBatchDepth = 0;

function finalizeHistoryBatchSave(): void {
  if (historyBatchDepth > 0) {
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
      state.selectedAnchorId = null;
      state.selectedTriggerId = null;
      state.activeVariationId = null;
      return;
    }

    if (state.activeVariationId) {
      const hasVariation = currentMap.variations?.some((v) => v.id === state.activeVariationId);
      if (!hasVariation) state.activeVariationId = null;
    }

    if (state.selectedLayerId && !currentMap.layers.some((l) => l.id === state.selectedLayerId)) {
      state.selectedLayerId = getPreferredSelectedLayerId(currentMap);
    }
    if (!state.selectedLayerId) {
      state.selectedLayerId = getPreferredSelectedLayerId(currentMap);
    }

    syncToolStateForSelectedLayer(state);

    if (state.selectedLinkId) {
      const hasLink = currentMap.locationLinks?.some((l) => l.id === state.selectedLinkId) ?? false;
      if (!hasLink) state.selectedLinkId = null;
    }

    if (state.selectedAnchorId) {
      const hasAnchor = currentMap.spatialPrimitives?.anchors?.some(
        (anchor) => anchor.id === state.selectedAnchorId,
      );
      if (!hasAnchor) state.selectedAnchorId = null;
    }

    if (state.selectedTriggerId) {
      const hasTrigger = currentMap.spatialPrimitives?.triggers?.some(
        (t) => t.id === state.selectedTriggerId,
      );
      if (!hasTrigger) state.selectedTriggerId = null;
    }

    if (state.selectedEntityId) {
      const hasEntity = resolveEntities(currentMap, state.activeVariationId).some(
        (e) => e.id === state.selectedEntityId,
      );
      if (!hasEntity) state.selectedEntityId = null;
    }
  });
}

export function beginEditorHistoryBatch(): void {
  historyBatchDepth += 1;
  if (historyBatchDepth === 1) {
    useEditorStore.temporal.getState().resume();
  }
}

export function endEditorHistoryBatch(): void {
  if (historyBatchDepth === 0) return;
  historyBatchDepth -= 1;
  if (historyBatchDepth === 0) {
    useEditorStore.temporal.getState().resume();
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
  if (!(target instanceof HTMLElement)) return false;
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
  if (state.mode !== 'maps' || !state.currentMap) return false;
  if (
    isEditableTarget(target ?? (typeof document !== 'undefined' ? document.activeElement : null))
  ) {
    return false;
  }
  if (command === 'undo') undoEditorChange();
  else redoEditorChange();
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
          // ── Slices ────────────────────────────────────────────────────────
          ...createActorSlice(set, get, {} as never),
          ...createItemSlice(set, get, {} as never),
          ...createItemClassSlice(set, get, {} as never),
          ...createTerrainSlice(set, get, {} as never),
          ...createEntityTypeSlice(set, get, {} as never),
          ...createLayerDefinitionSlice(set, get, {} as never),
          ...createScriptingSlice(set, get, {} as never),
          ...createToolSlice(set, get, {} as never),
          ...createTilePaintSlice(set, get, {} as never),
          ...createTilesetSlice(set, get, {} as never),
          ...createEntityInstanceSlice(set, get, {} as never),
          ...createMapSlice(set, get, {} as never),
          ...createLocationLinkSlice(set, get, {} as never),
          ...createLayerSlice(set, get, {} as never),
          ...createTriggerSlice(set, get, {} as never),

          // ── Initial state not owned by slices ─────────────────────────────
          project: null,
          projectPath: null,
          resourcesLoaded: false,
          resourceLoadingLabel: null,
          resourceLoadingProgress: 0,
          mode: 'project' as EditorMode,
          loadedSprites: new globalThis.Map(),
          selectedEntityTypeId: null,
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

          // ── Project actions ────────────────────────────────────────────────
          loadProject: async (path, project) => {
            withHistorySuppressed(
              () =>
                set((state) => {
                  state.project = project;
                  state.projectPath = path;
                  state.resourcesLoaded = false;
                  state.resourceLoadingLabel = 'Preparing workspace';
                  state.resourceLoadingProgress = 0.05;
                  state.currentMap = null;
                  state.currentMapPath = null;
                  state.maps = [];
                  state.tilesets = new globalThis.Map();
                  state.loadedSprites = new globalThis.Map();
                  state.selectedLayerId = null;
                  state.selectedAnchorId = null;
                  state.activeTilesetId = null;
                  state.selectedTileIndex = null;
                  state.activeVariationId = null;
                  state.terrainTypes = [];
                  state.entityTypes = [];
                  state.tileMetadataDefinitions = [];
                  state.locationMetadataDefinitions = [];
                }),
              { clearHistory: true },
            );
            recentProjects.add(project.name, path);
          },

          closeProject: () => {
            for (const timeoutId of pendingTilesetSaves.values()) clearTimeout(timeoutId);
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
                  state.resourcesLoaded = false;
                  state.resourceLoadingLabel = null;
                  state.resourceLoadingProgress = 0;
                  state.currentMap = null;
                  state.maps = [];
                  state.tilesets = new globalThis.Map();
                  state.loadedSprites = new globalThis.Map();
                  state.activeTilesetId = null;
                  state.selectedTileIndex = null;
                  state.selectedAnchorId = null;
                  state.entityTypes = [];
                  state.tileMetadataDefinitions = [];
                  state.locationMetadataDefinitions = [];
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

          loadProjectResources: () => loadProjectResources(set, get),

          loadSprite: (path, blob) => loadSprite(path, blob, set),

          updateProject: async (project) => {
            await fileSystem.saveJson('', `${project.id}.vproj`, {
              $schema: '../schemas/project.schema.json',
              ...project,
            });
            set((state) => {
              state.project = project;
            });
          },

          validate: () => [],
        })),
      ),
    ),
    {
      limit: UNDO_HISTORY_LIMIT,
      partialize: (state) => ({ currentMap: state.currentMap }),
      equality: isTrackedHistoryEqual,
      onSave: () => {
        finalizeHistoryBatchSave();
      },
    },
  ),
);

// Register temporal store reference (used by withHistorySuppressed in slices)
registerTemporalStore(() => useEditorStore.temporal.getState());
registerSaveAccessors({
  getMapById: (mapId) => {
    const state = useEditorStore.getState();
    if (state.currentMap?.id === mapId) {
      return state.currentMap;
    }
    return state.maps.find((map) => map.id === mapId) ?? null;
  },
  getProject: () => useEditorStore.getState().project,
  getTilesetById: (tilesetId) => useEditorStore.getState().tilesets.get(tilesetId) ?? null,
});

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
          } catch (e) {
            console.warn('Failed to reload sprite asset', relativePath, e);
          }
        }
        for (const [id, ts] of state.tilesets.entries()) {
          try {
            if (ts.spriteSheet === relativePath && state.loadedSprites.has(relativePath)) {
              const blob = await fileSystem.loadAsset(relativePath);
              await state.loadSprite(relativePath, blob);
              console.info('Tileset sprite changed for tileset:', id, relativePath);
            }
          } catch (_e) {
            /* ignore per-tileset errors */
          }
        }
      } catch (_e) {
        /* swallow */
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
        const migratedTileset = migrateTilesetOnLoad(tileset);
        useEditorStore.setState((state) => {
          const newMap = new Map(state.tilesets);
          try {
            newMap.set(migratedTileset.id, migratedTileset);
          } catch (_e) {
            newMap.set(relativePath, migratedTileset);
          }
          return { tilesets: newMap };
        });
        if (migratedTileset.spriteSheet) {
          try {
            const blob = await fileSystem.loadAsset(migratedTileset.spriteSheet);
            await useEditorStore.getState().loadSprite(migratedTileset.spriteSheet, blob);
          } catch (e) {
            console.warn('Failed to reload tileset sprite:', migratedTileset.spriteSheet, e);
          }
        }
      } catch (_e) {
        /* swallow */
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
        if (idx !== -1) state.maps[idx] = castDraft(currentMap);
      });
    }
  },
  { fireImmediately: false },
);
