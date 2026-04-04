import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector, devtools } from 'zustand/middleware';
import { castDraft } from 'immer';
import { EditorState, ToolType, ValidationError, EditorMode } from '../types/editor';
import {
  Project,
  Map as GameMap,
  Layer,
  Variation,
  EntityInstance,
  Tileset,
  TileDefinition,
  LayerDefinition,
  EntityType,
  PropertyValues,
} from '../types/schema';
import { recentProjects } from '../lib/recentProjects';
import { resolveTileAt } from '../lib/mapUtils';
import { sampleRandomTile } from '../lib/randomUtils';
import { samplePatternAt, createTileRef } from '../lib/tileUtils';
import { fileSystem } from '../lib/fileSystem';
import { floodFillCollect } from '../lib/algorithms';
import { saveMapDebounced, useSaveStore } from '../lib/saveManager';
import { encodeTileRef } from '../lib/tileRef';
import { resolveSpriteAsset } from '../lib/asepriteUtils';

// ============================================================================
// Helper functions for layer management
// ============================================================================

/** Creates an empty 2D grid filled with null values */
function createEmptyGrid(width: number, height: number): (number | null)[][] {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

/** Creates an empty 2D grid filled with null values for variations */
function createEmptyStringGrid(width: number, height: number): (string | null)[][] {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

/** Adds missing layers from layer definitions to a map */
function addMissingDefinitionLayers(map: GameMap, layerDefs: LayerDefinition[]): GameMap {
  if (layerDefs.length === 0) return map;

  const existingDefIds = new Set(
    map.layers.filter((l) => l.definitionId).map((l) => l.definitionId),
  );
  const missingDefs = layerDefs.filter((def) => !existingDefIds.has(def.id));
  if (missingDefs.length === 0) return map;

  const newLayers: Layer[] = missingDefs.map((def) => ({
    id: def.id,
    name: def.name,
    kind: def.type === 'entity' ? 'entity' : def.type === 'terrain' ? 'terrain' : 'visual',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: def.zIndex,
    ...(def.type === 'entity'
      ? { entities: [] as EntityInstance[] }
      : {
          data: createEmptyGrid(map.width, map.height),
          ...(def.type === 'terrain'
            ? { terrainData: createEmptyStringGrid(map.width, map.height) }
            : {}),
        }),
    definitionId: def.id,
  }));

  const allLayers = [...map.layers, ...newLayers].sort((a, b) => a.zOrder - b.zOrder);
  return { ...map, layers: allLayers };
}

/** Creates layers from layer definitions */
function createLayersFromDefinitions(
  layerDefs: LayerDefinition[],
  width: number,
  height: number,
): Layer[] {
  return layerDefs
    .slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((def) => ({
      id: def.id,
      name: def.name,
      kind: def.type === 'entity' ? 'entity' : def.type === 'terrain' ? 'terrain' : 'visual',
      visible: true,
      locked: false,
      opacity: 1,
      zOrder: def.zIndex,
      ...(def.type === 'entity'
        ? { entities: [] as EntityInstance[] }
        : {
            data: createEmptyGrid(width, height),
            ...(def.type === 'terrain'
              ? { terrainData: createEmptyStringGrid(width, height) }
              : {}),
          }),
      definitionId: def.id,
    }));
}

/** Creates a default ground layer */
function createDefaultLayer(width: number, height: number): Layer {
  return {
    id: 'ground',
    name: 'Ground',
    kind: 'visual',
    visible: true,
    locked: false,
    opacity: 1,
    zOrder: 0,
    data: createEmptyGrid(width, height),
  };
}

/** Ensures a variation has a layer override initialized */
function ensureVariationLayerOverride(
  variation: Variation,
  layerId: string,
  width: number,
  height: number,
): void {
  if (!variation.layerOverrides) variation.layerOverrides = {};
  if (!variation.layerOverrides[layerId]) {
    variation.layerOverrides[layerId] = {
      mode: 'merge',
      data: createEmptyStringGrid(width, height),
    };
  }
}

/** Sets a tile value, handling variation overrides */
function setTileInState(
  map: GameMap,
  activeVariationId: string | null,
  layerId: string,
  x: number,
  y: number,
  value: string | null,
): void {
  if (activeVariationId) {
    const variation = map.variations?.find((v) => v.id === activeVariationId);
    if (variation) {
      ensureVariationLayerOverride(variation, layerId, map.width, map.height);
      variation.layerOverrides![layerId].data[y][x] = value; // Keep as string for variations
      return;
    }
  }
  const encodedValue = value ? encodeTileRef(value, map.tilesetRefs) : null;
  const layer = map.layers.find((l) => l.id === layerId);
  if (layer && layer.data && layer.data[y] && !layer.locked) {
    layer.data[y][x] = encodedValue;
  }
}

/** Persists project data to project.json with save status feedback */
async function persistProject(project: Project): Promise<void> {
  useSaveStore.getState().setStatus('saving');
  await fileSystem.saveJson('', 'project.json', project);
  useSaveStore.getState().setStatus('saved');
  setTimeout(() => {
    if (useSaveStore.getState().status === 'saved') useSaveStore.getState().setStatus('idle');
  }, 2000);
}

const TILESET_SAVE_DEBOUNCE_MS = 300;
const pendingTilesetSaves = new globalThis.Map<string, ReturnType<typeof setTimeout>>();

function scheduleTilesetSave(tilesetId: string): void {
  const existing = pendingTilesetSaves.get(tilesetId);
  if (existing) {
    clearTimeout(existing);
  }

  const timeoutId = setTimeout(async () => {
    pendingTilesetSaves.delete(tilesetId);
    const tileset = useEditorStore.getState().tilesets.get(tilesetId);
    if (!tileset) return;

    const snapshot = JSON.parse(JSON.stringify(tileset)) as Tileset;
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

interface EditorStore extends EditorState {
  // Actions
  loadProject: (path: string, project: Project) => Promise<void>;
  closeProject: () => void;
  loadProjectResources: () => Promise<void>; // Load all maps, tilesets, sprites
  loadSprite: (path: string, blob: Blob) => Promise<string>; // Returns object URL
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
    tiles: Array<{
      x: number;
      y: number;
      tilesetId: string;
      tileIndex: number;
    }>,
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
      tileIndices?: number[]; // For stencil or random selection
      pattern?: {
        pattern: (number | null)[][];
        patternW: number;
        patternH: number;
      }; // For stencil fill
    },
  ) => void;
  // Tileset corner terrain actions
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

  // Entity Actions
  selectEntity: (id: string | null) => void;
  setSelectedEntityType: (id: string | null) => void;

  // Entity type CRUD (project-level)
  addEntityType: (entityType: EntityType) => Promise<void>;
  updateEntityType: (id: string, updates: Partial<EntityType>) => Promise<void>;
  deleteEntityType: (id: string) => Promise<void>;

  // Terrain actions
  addTerrainType: (terrain: { id: string; displayName: string; color: string }) => Promise<void>;
  updateTerrainType: (
    id: string,
    updates: Partial<{ displayName: string; color: string }>,
  ) => Promise<void>;
  deleteTerrainType: (id: string) => Promise<void>;

  // Layer definition actions
  layerDefinitions: LayerDefinition[];
  selectedLayerDefinitionId: string | null;
  setSelectedLayerDefinition: (id: string | null) => void;
  addLayerDefinition: (definition: LayerDefinition) => Promise<void>;
  updateLayerDefinition: (id: string, updates: Partial<LayerDefinition>) => Promise<void>;
  deleteLayerDefinition: (id: string) => Promise<void>;

  // Camera actions
  setCamera: (camera: Partial<EditorState['camera']>) => void;
  resetCamera: () => void;

  // Time preview actions
  setTimePreviewEnabled: (enabled: boolean) => void;
  setTimeOfDay: (time: number) => void;

  // Tileset toolbar mode
  setTilesetToolMode: (mode: 'select' | 'terrain') => void;

  // Reset selected tiles in global editor state
  resetSelectedTiles: () => void;

  // Validation
  validate: () => ValidationError[];
}

export const useEditorStore = create<EditorStore>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        // Initial state
        project: null,
        projectPath: null,
        mode: 'project',
        tilesets: new globalThis.Map(),
        loadedSprites: new globalThis.Map(),
        maps: [],
        currentMap: null,
        currentMapPath: null,
        activeVariationId: null,
        timePreviewEnabled: false,
        timeOfDay: 0.5,
        activeTool: 'stamp',
        drawMode: 'point',
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
        entitySnapMode: 'grid',
        showCollisionOverlay: false,
        showTilesetCollisionOverlay: false,
        showTerrainOverlay: false,
        camera: { x: 0, y: 0, zoom: 1.5 },
        mapCameras: {},
        tilesetToolMode: 'select',
        panels: {
          layersOpen: true,
          tilesetPaletteOpen: true,
          entitiesOpen: true,
          inspectorOpen: true,
          variationsOpen: true,
        },
        terrainTypes: [],
        entityTypes: [],
        layerDefinitions: [],
        selectedLayerDefinitionId: null,
        validationErrors: [],

        // Actions implementation
        loadProject: async (path, project) => {
          set((state) => {
            state.project = project;
            state.projectPath = path;
            // Reset resources and map state
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
          });
          recentProjects.add(project.name, path);
        },

        closeProject: () => {
          for (const timeoutId of pendingTilesetSaves.values()) {
            clearTimeout(timeoutId);
          }
          pendingTilesetSaves.clear();

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
          });
        },

        loadProjectResources: async () => {
          // 1. Load all tilesets
          const tilesets = await fileSystem.loadAllTilesets();
          for (const tileset of tilesets) {
            // Ensure tileCount is sensible — some saved tilesets may have
            // incorrect tileCount (e.g. equal to columns). Prefer the
            // explicit tiles object length when available.
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

            // Load sprite for each tileset
            try {
              const blob = await fileSystem.loadAsset(tileset.spriteSheet);
              await useEditorStore.getState().loadSprite(tileset.spriteSheet, blob);
            } catch (e) {
              console.warn(`Failed to load sprite for tileset ${tileset.id}:`, e);
            }
          }

          // Set first tileset as active if none is set
          set((state) => {
            if (!state.activeTilesetId && tilesets.length > 0) {
              state.activeTilesetId = tilesets[0].id;
              state.selectedTileIndex = 0;
            }
          });

          // 1.5 Load terrain types from project.json (if present)
          const proj = useEditorStore.getState().project;
          if (proj?.terrainTypes && Array.isArray(proj.terrainTypes)) {
            set((state) => {
              state.terrainTypes = proj.terrainTypes!.map((t) => castDraft(t));
            });
          }

          // 1.6 Load layer definitions from project.json (if present)
          if (proj?.layerDefinitions && Array.isArray(proj.layerDefinitions)) {
            set((state) => {
              state.layerDefinitions = proj.layerDefinitions!.map((d) => castDraft(d));
            });
          }

          // 1.7 Load entity types from project.json (if present)
          if (proj?.entityTypes && Array.isArray(proj.entityTypes)) {
            set((state) => {
              state.entityTypes = proj.entityTypes!.map((e) => castDraft(e));
            });
          }

          // 1.8 Load entity type sprites
          const entityTypes = useEditorStore.getState().entityTypes;
          for (const et of entityTypes) {
            if (!et.sprite?.path) continue;
            try {
              const blob = await fileSystem.readFileAsBlob(et.sprite.path);
              await useEditorStore.getState().loadSprite(et.sprite.path, blob);
            } catch (e) {
              console.warn(`Failed to load sprite for entity type ${et.id}:`, e);
            }
          }

          // 2. Load all maps
          const maps = await fileSystem.loadAllMaps();

          // Get layer definitions to inject into maps
          const layerDefs = useEditorStore.getState().layerDefinitions;

          // Enrich all maps with missing layers and store the full list
          const enrichedMaps = maps.map((m) => addMissingDefinitionLayers(m, layerDefs));

          set((state) => {
            state.maps = castDraft(enrichedMaps);
          });

          // Optionally load the first map as current
          if (enrichedMaps.length > 0) {
            set((state) => {
              state.currentMap = castDraft(enrichedMaps[0]);
              // Auto-select first layer
              if (enrichedMaps[0].layers.length > 0) {
                state.selectedLayerId = enrichedMaps[0].layers[0].id;
              }
            });
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

          // Replace the Map instance so selectors depending on the Map identity update
          set((state) => {
            state.loadedSprites = new Map(state.loadedSprites);
            state.loadedSprites.set(path, castDraft(img));
          });

          return url;
        },

        updateProject: async (project) => {
          await fileSystem.saveJson('', 'project.json', project);
          set((state) => {
            state.project = project;
          });
        },

        setCurrentMap: (map) => {
          set((state) => {
            if (!map) {
              state.currentMap = null;
              return;
            }

            // Add missing layers from layer definitions
            const enrichedMap = addMissingDefinitionLayers(map, state.layerDefinitions);

            state.currentMap = castDraft(enrichedMap);
            // When a map is loaded, switch to tile paint tool by default
            state.activeTool = 'stamp';
            if (enrichedMap && state.mapCameras && state.mapCameras[enrichedMap.id]) {
              state.camera = { ...state.mapCameras[enrichedMap.id] };
            }
          });
        },

        loadMap: (mapId) => {
          set((state) => {
            const map = state.maps.find((m) => m.id === mapId);
            if (!map) return;

            // Save camera for current map before switching
            if (state.currentMap) {
              state.mapCameras = state.mapCameras || {};
              state.mapCameras[state.currentMap.id] = { ...state.camera };
            }

            state.currentMap = castDraft(map);
            state.activeVariationId = null;
            state.activeTool = 'stamp';
            state.selectedEntityId = null;
            state.selectedEntityIds = new Set();

            // Restore camera for the loaded map
            if (state.mapCameras && state.mapCameras[mapId]) {
              state.camera = { ...state.mapCameras[mapId] };
            } else {
              state.camera = { x: 0, y: 0, zoom: 1.5 };
            }

            // Auto-select first layer
            if (map.layers.length > 0) {
              state.selectedLayerId = map.layers[0].id;
            } else {
              state.selectedLayerId = null;
            }
          });
        },

        setTilesetToolMode: (mode) =>
          set((state) => {
            state.tilesetToolMode = mode;
            // Auto-select first terrain when entering terrain mode
            if (mode === 'terrain' && !state.selectedTerrainId && state.terrainTypes.length > 0) {
              state.selectedTerrainId = state.terrainTypes[0].id;
            }
          }),

        createNewMap: async (name, width, height, tilesetId) => {
          const id = name.toLowerCase().replace(/\s+/g, '-');

          // Get layer definitions from store to create default layers
          const layerDefs = useEditorStore.getState().layerDefinitions;

          // Create layers from definitions, or use a default ground layer
          const definedLayers = createLayersFromDefinitions(layerDefs, width, height);
          const layers =
            definedLayers.length > 0 ? definedLayers : [createDefaultLayer(width, height)];

          const newMap: GameMap = {
            version: 1,
            id,
            name,
            width,
            height,
            baseTilesetId: tilesetId,
            tilesetRefs: [tilesetId], // Start with base tileset
            layers,
            entities: [],
          };

          await fileSystem.saveJson('maps', `${id}.map.json`, newMap);

          set((state) => {
            state.maps.push(castDraft(newMap));
            state.currentMap = castDraft(newMap);
            state.activeVariationId = null;
            state.selectedLayerId = layers[0]?.id || null;
          });
        },

        addMap: (map: GameMap) => {
          // This might be used for loading, but currentMap is the primary state
          set((state) => {
            state.currentMap = castDraft(map);
          });
        },

        updateCurrentMap: (updates) => {
          set((state) => {
            if (!state.currentMap) return;

            Object.assign(state.currentMap, updates);

            // Keep base tileset accessible for encoding/decoding tile references.
            if (
              updates.baseTilesetId &&
              !state.currentMap.tilesetRefs.includes(updates.baseTilesetId)
            ) {
              state.currentMap.tilesetRefs.unshift(updates.baseTilesetId);
            }

            // When editing base metadata, align palette with the map's base tileset.
            if (updates.baseTilesetId && !state.activeVariationId) {
              state.activeTilesetId = updates.baseTilesetId;
            }
          });
        },

        deleteMap: async (mapId) => {
          const map = useEditorStore.getState().maps.find((m) => m.id === mapId);
          if (!map) return;

          // Delete from filesystem
          const filename = `${mapId}.map.json`;
          await fileSystem.deleteJson('maps', filename);

          set((state) => {
            // Remove from maps list
            state.maps = state.maps.filter((m) => m.id !== mapId);

            // If we just deleted the current map, clear or switch
            if (state.currentMap?.id === mapId) {
              if (state.maps.length > 0) {
                state.currentMap = castDraft(state.maps[0]);
                state.activeVariationId = null;
                state.selectedLayerId = state.maps[0].layers[0]?.id || null;
              } else {
                state.currentMap = null;
                state.activeVariationId = null;
                state.selectedLayerId = null;
              }
            }
          });
        },

        setActiveTool: (tool) => {
          set((state) => {
            state.activeTool = tool;
            // If switching to paint tool and no layer selected, select first
            if (tool === 'stamp' && !state.selectedLayerId && state.currentMap) {
              state.selectedLayerId = state.currentMap.layers[0]?.id || null;
            }
            // If switching to terrain tool and no terrain selected, default to first terrain
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

            // Pre-compute the encoded base for this tileset (avoids indexOf per cell)
            const tilesetIndex = map.tilesetRefs.indexOf(activeTilesetId);
            if (tilesetIndex === -1) return;
            const tilesetBase = tilesetIndex << 16;

            // Pre-index tileset: cornersKey -> tileIndex for O(1) lookup per cell.
            // Key = "TL|TR|BL|BR" where each part is the terrain id or "" for null.
            // Collect all tiles that have terrainCorners defined.
            type TileEntry = { index: number; probability: number };
            const exactIndex = new Map<string, TileEntry[]>();
            for (const [idxStr, def] of Object.entries(tileset.tiles)) {
              if (!def.terrainCorners) continue;
              const c = def.terrainCorners;
              const key = `${c[0] ?? ''}|${c[1] ?? ''}|${c[2] ?? ''}|${c[3] ?? ''}`;
              const prob =
                typeof def.probability === 'number' && def.probability > 0 ? def.probability : 1;
              const entry = { index: parseInt(idxStr, 10), probability: prob };
              const arr = exactIndex.get(key);
              if (arr) arr.push(entry);
              else exactIndex.set(key, [entry]);
            }

            const pickWeighted = (entries: TileEntry[]): number => {
              if (entries.length === 1) return entries[0].index;
              let total = 0;
              for (const e of entries) total += e.probability;
              let r = Math.random() * total;
              for (const e of entries) {
                r -= e.probability;
                if (r <= 0) return e.index;
              }
              return entries[entries.length - 1].index;
            };

            // Cache corner-key -> the winning TileEntry[] bucket (not the picked index).
            // We cache the bucket so the fuzzy search only runs once per unique corner config,
            // but pickWeighted() is called fresh each time so probability variation is preserved.
            const bucketCache = new Map<string, TileEntry[] | null>();

            const resolveCorners = (
              tl: string | null,
              tr: string | null,
              bl: string | null,
              br: string | null,
            ): number | null => {
              const key = `${tl ?? ''}|${tr ?? ''}|${bl ?? ''}|${br ?? ''}`;
              let bucket: TileEntry[] | null | undefined = bucketCache.get(key);
              if (bucket === undefined) {
                // Exact match
                const exact = exactIndex.get(key);
                if (exact) {
                  bucket = exact;
                } else {
                  // Fuzzy: find best scoring entries
                  const corners = [tl, tr, bl, br];
                  let bestScore = -1;
                  let bestEntries: TileEntry[] = [];
                  for (const [k, entries] of exactIndex) {
                    const parts = k.split('|');
                    let score = 0;
                    for (let i = 0; i < 4; i++) {
                      if ((parts[i] || null) === corners[i]) score++;
                    }
                    if (score > bestScore) {
                      bestScore = score;
                      bestEntries = entries;
                    } else if (score === bestScore) bestEntries = bestEntries.concat(entries);
                  }
                  bucket = bestScore > 0 ? bestEntries : null;
                }
                bucketCache.set(key, bucket);
              }
              return bucket ? pickWeighted(bucket) : null;
            };

            for (const layer of map.layers) {
              if (layer.kind !== 'terrain' || !layer.terrainData || !layer.data) continue;

              const td = layer.terrainData;
              const W = map.width;
              const H = map.height;

              // Build corner grid directly from terrainData using flat typed array for speed.
              // corners[y*W*4 + x*4 + corner] = terrain id index (0 = null).
              // Use a flat string[] instead: corners are sparse so use Map with int key.
              // Actually: derive corners on the fly per cell from its 4 neighbors in terrainData.
              // For cell (x,y):
              //   TL corner = last non-null among: (x-1,y-1), (x,y-1), (x-1,y), (x,y)  — reading raster order means (x,y) wins
              //   But the exact rule from applyTerrainToTile: each cell sets all 4 corners to its terrainId,
              //   overwriting neighbors' shared corners. Processing left-to-right, top-to-bottom,
              //   the last writer wins. So:
              //   TL of (x,y) = terrainData[y][x] if set, else terrainData[y][x-1] if set (its TR), else terrainData[y-1][x] if set (its BL), else terrainData[y-1][x-1] if set (its BR)
              //   But actually we just need: use a flat Uint8 corner grid.
              // Simplest fast approach: fill corner grid with one pass, then read 4 corners per cell.

              // Use a flat array: cornerGrid[y * (W+1) + x] = terrain id at corner-point (x,y)
              // corner-points go from (0,0) to (W,H), size (W+1)*(H+1)
              // Each cell (cx,cy) has corners: TL=(cx,cy) TR=(cx+1,cy) BL=(cx,cy+1) BR=(cx+1,cy+1)
              const cpW = W + 1;
              const cpH = H + 1;
              const cornerPt: (string | null)[] = new Array(cpW * cpH).fill(null);

              for (let y = 0; y < H; y++) {
                const row = td[y];
                if (!row) continue;
                for (let x = 0; x < W; x++) {
                  const t = row[x];
                  if (!t) continue;
                  // This cell owns 4 corner points
                  cornerPt[y * cpW + x] = t; // TL
                  cornerPt[y * cpW + (x + 1)] = t; // TR
                  cornerPt[(y + 1) * cpW + x] = t; // BL
                  cornerPt[(y + 1) * cpW + (x + 1)] = t; // BR
                }
              }

              // Now resolve each cell
              for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                  const tl = cornerPt[y * cpW + x];
                  const tr = cornerPt[y * cpW + (x + 1)];
                  const bl = cornerPt[(y + 1) * cpW + x];
                  const br = cornerPt[(y + 1) * cpW + (x + 1)];

                  if (!tl && !tr && !bl && !br) {
                    layer.data[y][x] = null;
                    continue;
                  }

                  const tileIdx = resolveCorners(tl, tr, bl, br);
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

        // Drawing preview used while dragging shapes
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
            // Reset all tile selection state when changing screen
            state.selectedTileIndex = null;
            state.selectedTileIndices = [];
            state.mapEditorSelectedTileIndex = null;
            state.mapEditorSelectedTileIndices = [];
            state.tilesetEditorSelectedTileIndex = null;
            state.tilesetEditorSelectedTileIndices = [];
          });
        },

        setActiveTileset: (id) =>
          set((state) => {
            state.activeTilesetId = id;
            state.selectedTileIndex = 0;
            state.selectedTerrainId = null; // Selection clear terrain
          }),

        setSelectedTile: (index) =>
          set((state) => {
            state.selectedTileIndex = index;
            if (index !== null) state.selectedTerrainId = null;
            state.selectedTileIndices = index !== null ? [index] : [];
            state.sampledPattern = null; // Clear sampled pattern when selecting tiles normally
          }),

        setSelectedTiles: (indexes) =>
          set((state) => {
            state.selectedTileIndices = indexes.slice();
            state.selectedTileIndex = indexes.length > 0 ? indexes[indexes.length - 1] : null;
            if (state.selectedTileIndex !== null) state.selectedTerrainId = null;
            state.sampledPattern = null; // Clear sampled pattern when selecting tiles normally
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
            // Clear normal tile selection when setting a sampled pattern
            if (pattern) {
              state.selectedTileIndices = [];
            }
          }),

        addTileset: async (tileset) => {
          useSaveStore.getState().setStatus('saving');
          await fileSystem.saveJson('tilesets', `${tileset.id}.tileset.json`, tileset);
          useSaveStore.getState().setStatus('saved');
          setTimeout(() => {
            if (useSaveStore.getState().status === 'saved')
              useSaveStore.getState().setStatus('idle');
          }, 2000);

          set((state) => {
            state.tilesets.set(tileset.id, castDraft(tileset));
            if (!state.activeTilesetId) state.activeTilesetId = tileset.id;
          });

          // Load sprite
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
              updatedTileset = JSON.parse(JSON.stringify(ts)); // Clone for safety
            }
          });

          if (updatedTileset) {
            useSaveStore.getState().setStatus('saving');
            await fileSystem.saveJson('tilesets', `${id}.tileset.json`, updatedTileset);
            useSaveStore.getState().setStatus('saved');
            setTimeout(() => {
              if (useSaveStore.getState().status === 'saved')
                useSaveStore.getState().setStatus('idle');
            }, 2000);

            // Reload sprite if spriteSheet changed
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

            // If terrainId is null, clear the terrain information for the corner
            if (terrainId === null) {
              const updatedCorners = [...tile.terrainCorners];
              updatedCorners[corner] = null;
              // Check if all corners are null, and if so, remove the terrainCorners property
              if (updatedCorners.every((corner) => corner === null)) {
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
            await fileSystem.saveJson('tilesets', `${tilesetId}.tileset.json`, updatedTileset);
            useSaveStore.getState().setStatus('saved');
            setTimeout(() => {
              if (useSaveStore.getState().status === 'saved')
                useSaveStore.getState().setStatus('idle');
            }, 2000);
          }
        },

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

        bucketFill: (
          layerId: string,
          startX: number,
          startY: number,
          tilesetId: string,
          tileIndex: number,
        ) =>
          set((state) => {
            if (!state.currentMap) return;
            const map = state.currentMap;
            const targetTileRef = createTileRef(tilesetId, tileIndex);
            const startTile = resolveTileAt(map, layerId, startX, startY, state.activeVariationId);

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
            const startTile = resolveTileAt(map, layerId, startX, startY, state.activeVariationId);

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

        placeEntity: (entity) =>
          set((state) => {
            if (!state.currentMap) return;

            // If a layer is selected and it's an entity layer, attach to that layer
            const selectedLayer = state.currentMap.layers.find(
              (l) => l.id === state.selectedLayerId,
            );
            if (selectedLayer && selectedLayer.kind === 'entity') {
              const toAdd = { ...entity, layerId: selectedLayer.id } as any;

              // If variation active, record as variation-level add override
              if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(
                  (v) => v.id === state.activeVariationId,
                );
                if (variation) {
                  if (!variation.entityOverrides) variation.entityOverrides = [];
                  variation.entityOverrides.push({
                    action: 'add',
                    entity: castDraft(toAdd),
                  });
                  return;
                }
              }

              // Otherwise add to the layer's entities
              if (!(selectedLayer as any).entities) (selectedLayer as any).entities = [];
              (selectedLayer as any).entities.push(castDraft(toAdd));
              return;
            }

            // Fallback: add to top-level entities (legacy behavior)
            if (state.activeVariationId) {
              const variation = state.currentMap.variations?.find(
                (v) => v.id === state.activeVariationId,
              );
              if (variation) {
                if (!variation.entityOverrides) variation.entityOverrides = [];
                variation.entityOverrides.push({
                  action: 'add',
                  entity: castDraft(entity),
                });
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

                // If it was an "add" override, just remove it
                const existingAddIdx = variation.entityOverrides.findIndex(
                  (o) => o.action === 'add' && o.entity?.id === entityId,
                );
                if (existingAddIdx !== -1) {
                  variation.entityOverrides.splice(existingAddIdx, 1);
                  return;
                }

                // Otherwise add a "remove" override for the base entity
                variation.entityOverrides.push({
                  action: 'remove',
                  entityId,
                });
                return;
              }
            }

            // Remove from top-level entities
            state.currentMap.entities = state.currentMap.entities.filter((e) => e.id !== entityId);

            // Also remove from any entity layers
            for (const layer of state.currentMap.layers) {
              if (layer.kind === 'entity' && (layer as any).entities) {
                (layer as any).entities = (layer as any).entities.filter(
                  (e: any) => e.id !== entityId,
                );
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
                const existing = variation.entityOverrides.find(
                  (o) => o.action === 'add' && o.entity?.id === entityId,
                );
                if (existing && existing.entity) {
                  existing.entity.position = position;
                  return;
                }
              }
            }

            // Update in top-level entities
            const entity = state.currentMap.entities.find((e) => e.id === entityId);
            if (entity) {
              entity.position = position;
              return;
            }

            // Update in entity layers
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

                // Check if we already have an override for this entity in this variation
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
                      existingOverride.entity = { properties: {} } as Partial<
                        import('../types/schema').EntityInstance
                      >;
                    if (existingOverride.entity) {
                      existingOverride.entity.properties = {
                        ...((existingOverride.entity.properties as PropertyValues) || {}),
                        ...properties,
                      } as PropertyValues;
                    }
                  }
                } else {
                  // Create a new "modify" override with a sparse entity
                  variation.entityOverrides.push({
                    action: 'modify',
                    entityId,
                    entity: { properties } as Partial<import('../types/schema').EntityInstance>,
                  });
                }
                return;
              }
            }

            // Try to find entity in top-level entities
            let entity = state.currentMap.entities.find((e) => e.id === entityId);
            if (!entity) {
              // Try to find in layers
              for (const layer of state.currentMap.layers) {
                if (layer.kind === 'entity' && (layer as any).entities) {
                  const found = (layer as any).entities.find((en: any) => en.id === entityId);
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
              // Stability: Sort layers by zOrder to keep indices predictable
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
            state.selectedLayerId = layerId;
            const layer = state.currentMap?.layers.find((l) => l.id === layerId);
            if (layer) {
              const VALID_TOOLS_BY_KIND: Record<string, string[]> = {
                terrain: ['terrain', 'erase'],
                visual: ['stamp', 'random', 'erase', 'fill', 'terrain', 'select'],
                collision: ['stamp', 'erase', 'fill', 'select'],
                navigation: ['stamp', 'erase', 'fill', 'select'],
                metadata: ['stamp', 'erase', 'fill', 'select'],
                entity: ['entitySelect', 'entityPlace', 'entityDelete'],
              };
              const valid = VALID_TOOLS_BY_KIND[layer.kind] ?? ['select'];
              if (!valid.includes(state.activeTool)) {
                if (layer.kind === 'entity') {
                  // Default to Select/Move when switching into entity layers
                  state.activeTool = 'entitySelect';
                } else if (layer.kind === 'terrain') {
                  state.activeTool = 'terrain';
                } else {
                  state.activeTool = 'stamp';
                }
              }
            }
          }),

        updateLayer: (layerId, updates) =>
          set((state) => {
            const layer = state.currentMap?.layers.find((l) => l.id === layerId);
            if (layer) {
              Object.assign(layer, updates);
              // Re-sort layers by zOrder if zOrder changed
              if (updates.zOrder !== undefined && state.currentMap) {
                state.currentMap.layers.sort((a, b) => a.zOrder - b.zOrder);
              }
            }
          }),

        setActiveVariation: (variationId) => {
          set((state) => {
            state.activeVariationId = variationId;
          });
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
              state.currentMap.variations = state.currentMap.variations?.filter((v) => v.id !== id);
              if (state.activeVariationId === id) state.activeVariationId = null;
            }
          });
        },

        selectEntity: (id) =>
          set((state) => {
            state.selectedEntityId = id;
          }),

        setSelectedEntityType: (id) =>
          set((state) => {
            state.selectedEntityTypeId = id;
            if (id) {
              state.activeTool = 'entityPlace';
            }
          }),

        // Terrain actions
        addTerrainType: async (terrain) => {
          set((state) => {
            state.terrainTypes.push(castDraft(terrain));
          });
          const proj = useEditorStore.getState().project;
          if (proj) {
            const projectToSave = {
              ...proj,
              terrainTypes: useEditorStore.getState().terrainTypes,
            };
            await persistProject(projectToSave);
            set((state) => {
              state.project = castDraft(projectToSave);
            });
          }
        },

        updateTerrainType: async (id, updates) => {
          set((state) => {
            const t = state.terrainTypes.find((tt) => tt.id === id);
            if (t) Object.assign(t, updates);
          });
          const proj = useEditorStore.getState().project;
          if (proj) {
            const projectToSave = {
              ...proj,
              terrainTypes: useEditorStore.getState().terrainTypes,
            };
            await persistProject(projectToSave);
            set((state) => {
              state.project = castDraft(projectToSave);
            });
          }
        },

        deleteTerrainType: async (id) => {
          set((state) => {
            state.terrainTypes = state.terrainTypes.filter((t) => t.id !== id);
            if (state.selectedTerrainId === id) state.selectedTerrainId = null;
          });
          const proj = useEditorStore.getState().project;
          if (proj) {
            const projectToSave = {
              ...proj,
              terrainTypes: useEditorStore.getState().terrainTypes,
            };
            await persistProject(projectToSave);
            set((state) => {
              state.project = castDraft(projectToSave);
            });
          }
        },

        // Entity type CRUD actions
        addEntityType: async (entityType) => {
          set((state) => {
            state.entityTypes.push(castDraft(entityType));
          });
          const proj = useEditorStore.getState().project;
          if (proj) {
            const projectToSave = {
              ...proj,
              entityTypes: useEditorStore.getState().entityTypes,
            };
            await persistProject(projectToSave);
            set((state) => {
              state.project = castDraft(projectToSave);
            });
          }
        },

        updateEntityType: async (id, updates) => {
          set((state) => {
            const et = state.entityTypes.find((e) => e.id === id);
            if (et) Object.assign(et, updates);
          });
          const proj = useEditorStore.getState().project;
          if (proj) {
            const projectToSave = {
              ...proj,
              entityTypes: useEditorStore.getState().entityTypes,
            };
            await persistProject(projectToSave);
            set((state) => {
              state.project = castDraft(projectToSave);
            });
          }
        },

        deleteEntityType: async (id) => {
          set((state) => {
            state.entityTypes = state.entityTypes.filter((e) => e.id !== id);
            if (state.selectedEntityTypeId === id) state.selectedEntityTypeId = null;
          });
          const proj = useEditorStore.getState().project;
          if (proj) {
            const projectToSave = {
              ...proj,
              entityTypes: useEditorStore.getState().entityTypes,
            };
            await persistProject(projectToSave);
            set((state) => {
              state.project = castDraft(projectToSave);
            });
          }
        },

        // Layer definition actions
        setSelectedLayerDefinition: (id) =>
          set((state) => {
            state.selectedLayerDefinitionId = id;
          }),

        addLayerDefinition: async (definition) => {
          set((state) => {
            state.layerDefinitions.push(castDraft(definition));
          });
          const proj = useEditorStore.getState().project;
          if (proj) {
            const projectToSave = {
              ...proj,
              layerDefinitions: useEditorStore.getState().layerDefinitions,
            };
            await persistProject(projectToSave);
            set((state) => {
              state.project = castDraft(projectToSave);
              if (state.currentMap) {
                state.currentMap = castDraft(
                  addMissingDefinitionLayers(state.currentMap, state.layerDefinitions),
                );
              }
            });
          }
        },

        updateLayerDefinition: async (id, updates) => {
          set((state) => {
            const def = state.layerDefinitions.find((d) => d.id === id);
            if (def) Object.assign(def, updates);
          });
          const proj = useEditorStore.getState().project;
          if (proj) {
            const projectToSave = {
              ...proj,
              layerDefinitions: useEditorStore.getState().layerDefinitions,
            };
            await persistProject(projectToSave);
            set((state) => {
              state.project = castDraft(projectToSave);
            });
          }
        },

        deleteLayerDefinition: async (id) => {
          set((state) => {
            state.layerDefinitions = state.layerDefinitions.filter((d) => d.id !== id);
            if (state.selectedLayerDefinitionId === id) state.selectedLayerDefinitionId = null;
          });
          const proj = useEditorStore.getState().project;
          if (proj) {
            const projectToSave = {
              ...proj,
              layerDefinitions: useEditorStore.getState().layerDefinitions,
            };
            await persistProject(projectToSave);
            set((state) => {
              state.project = castDraft(projectToSave);
            });
          }
        },

        setCamera: (camera) =>
          set((state) => {
            state.camera = { ...state.camera, ...camera };
            // Persist camera per-map so reopening a map restores its last view
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

        // Time preview
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

        validate: () => {
          return []; // Placeholder
        },
      })),
    ),
  ),
);

// Listen for native asset changes (Electron) and reload affected sprites/tilesets
if ((window as any).ipcRenderer) {
  (window as any).ipcRenderer.on(
    'app:asset-changed',
    async (_event: any, payload: { eventType: string; relativePath: string }) => {
      const { relativePath } = payload;
      try {
        const state = useEditorStore.getState();

        // If we already have this asset loaded, reload it
        if (state.loadedSprites.has(relativePath)) {
          try {
            const blob = await fileSystem.loadAsset(relativePath);
            await state.loadSprite(relativePath, blob);
            console.info('Reloaded sprite asset:', relativePath);
          } catch (e) {
            console.warn('Failed to reload sprite asset', relativePath, e);
          }
        }

        // Also, if any tileset references this spriteSheet path, reload its image
        for (const [id, ts] of state.tilesets.entries()) {
          try {
            if ((ts as any).spriteSheet === relativePath) {
              if (state.loadedSprites.has(relativePath)) {
                const blob = await fileSystem.loadAsset(relativePath);
                await state.loadSprite(relativePath, blob);
              }
              // Optionally, reload tileset metadata if needed (not implemented here)
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

  (window as any).ipcRenderer.on(
    'app:tileset-changed',
    async (
      _event: any,
      payload: { eventType: string; relativePath: string; tileset: any | null },
    ) => {
      const { relativePath, tileset } = payload;
      try {
        if (!tileset) {
          console.warn('Tileset changed but could not parse JSON:', relativePath);
          return;
        }

        // Replace tilesets Map reference so selectors react
        useEditorStore.setState((state) => {
          const newMap = new Map(state.tilesets);
          try {
            newMap.set(tileset.id, tileset);
          } catch (e) {
            newMap.set(relativePath, tileset);
          }
          return { tilesets: newMap } as any;
        });

        // If tileset references a spriteSheet, reload the image blob
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
}

// =============================================================================
// Auto-save subscription: Save currentMap whenever it changes
// =============================================================================

// Track the last saved map state to avoid re-saving on initial load
let lastSavedMapJson: string | null = null;

// Subscribe to currentMap changes and auto-save with debouncing
useEditorStore.subscribe(
  (state) => state.currentMap,
  (currentMap, prevMap) => {
    if (!currentMap) {
      lastSavedMapJson = null;
      return;
    }

    // Skip if this is just loading a map (not a mutation)
    const currentJson = JSON.stringify(currentMap);
    if (currentMap.id !== prevMap?.id) {
      // Map changed (loaded different map), just track it
      lastSavedMapJson = currentJson;
      return;
    }

    // If content actually changed, save it
    if (currentJson !== lastSavedMapJson) {
      lastSavedMapJson = currentJson;
      saveMapDebounced(currentMap);

      // Sync changes back to the maps list so browsing stays up-to-date
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

// Subscribe to project settings changes and update save status
useEditorStore.subscribe(
  (state) => ({
    terrainTypes: state.terrainTypes,
    entityTypes: state.entityTypes,
    layerDefinitions: state.layerDefinitions,
  }),
  () => {
    // The individual actions already call persistProject,
    // but we update save status here for visual feedback
    useSaveStore.getState().setStatus('saved');
    setTimeout(() => {
      if (useSaveStore.getState().status === 'saved') {
        useSaveStore.getState().setStatus('idle');
      }
    }, 2000);
  },
  { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
);
