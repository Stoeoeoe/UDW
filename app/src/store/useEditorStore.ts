import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { castDraft } from 'immer';
import { EditorState, ToolType, ValidationError, EditorMode } from '../types/editor';
import { Project, Map, Layer, Variation, EntityInstance, Tileset, TileDefinition, LayerDefinition } from '../types/schema';
import { recentProjects } from '../lib/recentProjects';

interface EditorStore extends EditorState {
    // Actions
    loadProject: (path: string, project: Project) => Promise<void>;
    closeProject: () => void;
    loadProjectResources: () => Promise<void>; // Load all maps, tilesets, sprites
    loadSprite: (path: string, blob: Blob) => Promise<string>; // Returns object URL
    updateProject: (project: Project) => Promise<void>;

    // Map Actions
    setCurrentMap: (map: Map | null) => void;
    createNewMap: (name: string, width: number, height: number, tilesetId: string) => Promise<void>;
    addMap: (map: Map) => void;

    // Tool actions
    setActiveTool: (tool: ToolType) => void;
    setDrawMode: (mode: 'point' | 'rect' | 'circle' | 'line') => void;
    setBrushSize: (size: number) => void;
    setMode: (mode: EditorMode) => void;
    setHoveredTile: (pos: { x: number, y: number } | null) => void;
    setDrawPreview: (preview: { isDrawing: boolean; start: { x: number; y: number } | null; end: { x: number; y: number } | null }) => void;

    // Tileset actions
    setActiveTileset: (id: string | null) => void;
    setSelectedTile: (index: number | null) => void;
    setSelectedTiles: (indexes: number[]) => void;
    toggleSelectedTile: (index: number) => void;
    setSelectedTerrain: (id: string | null) => void;
    addTileset: (tileset: Tileset) => Promise<void>;
    updateTileset: (id: string, updates: Partial<Tileset>) => Promise<void>;
    deleteTileset: (id: string) => Promise<void>;
    updateTileDefinition: (tilesetId: string, index: number, definition: TileDefinition) => void;

    // Tile actions
    paintTile: (layerId: string, x: number, y: number, tilesetId: string, tileIndex: number) => void;
    paintTilesBatch: (layerId: string, tiles: Array<{ x: number; y: number; tilesetId: string; tileIndex: number }>) => void;
    eraseTile: (layerId: string, x: number, y: number) => void;
    eraseTilesBatch: (layerId: string, positions: Array<{ x: number; y: number }>) => void;
    bucketFill: (layerId: string, startX: number, startY: number, tilesetId: string, tileIndex: number) => void;
    // Tileset corner terrain actions
    setTileCornerTerrain: (tilesetId: string, index: number, corner: number, terrainId: string | null) => Promise<void>;

    // Entity actions
    placeEntity: (entity: EntityInstance) => void;
    removeEntity: (entityId: string) => void;
    updateEntityProperties: (entityId: string, properties: Record<string, any>) => void;

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

    // Terrain actions
    addTerrainType: (terrain: { id: string; displayName: string; color: string }) => Promise<void>;
    updateTerrainType: (id: string, updates: Partial<{ displayName: string; color: string }>) => Promise<void>;
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

    // Tileset toolbar mode
    setTilesetToolMode: (mode: 'select' | 'terrain') => void;

    // Validation
    validate: () => ValidationError[];
}

export const useEditorStore = create<EditorStore>()(
    immer((set) => ({
        // Initial state
        project: null,
        projectPath: null,
        mode: 'project',
        tilesets: new globalThis.Map(),
        loadedSprites: new globalThis.Map(),
        currentMap: null,
        currentMapPath: null,
        activeVariationId: null,
        timePreviewEnabled: false,
        timeOfDay: 0.5,
        activeTool: 'tilePaint',
        drawMode: 'point',
        brushSize: 1,
        hoveredTile: null,
            drawPreview: { isDrawing: false, start: null, end: null },
        selectedLayerId: null,
        selectedTileIndex: null,
        selectedTileIndices: [],
        selectedTerrainId: null,
        activeTilesetId: null,
        selectedEntityTypeId: null,
        selectedEntityId: null,
        selectedEntityIds: new Set(),
        camera: { x: 0, y: 0, zoom: 1.5 },
        mapCameras: {},
        tilesetToolMode: 'select',
        panels: {
            layersOpen: true,
            tilesetPaletteOpen: true,
            entitiesOpen: true,
            inspectorOpen: true,
            variationsOpen: true
        },
        terrainTypes: [],
        layerDefinitions: [],
        selectedLayerDefinitionId: null,
        validationErrors: [],

        // Actions implementation
        loadProject: async (path, project) => {
            set(state => {
                state.project = project;
                state.projectPath = path;
                // Reset resources and map state
                state.currentMap = null;
                state.currentMapPath = null;
                state.tilesets = new globalThis.Map();
                state.loadedSprites = new globalThis.Map();
                state.selectedLayerId = null;
                state.activeTilesetId = null;
                state.selectedTileIndex = null;
                state.activeVariationId = null;
                state.terrainTypes = [];
            });
            recentProjects.add(project.name, path);
        },

        closeProject: () => {
            set(state => {
                state.project = null;
                state.projectPath = null;
                state.currentMap = null;
                state.tilesets = new globalThis.Map();
                state.loadedSprites = new globalThis.Map();
                state.activeTilesetId = null;
                state.selectedTileIndex = null;
            });
        },

        loadProjectResources: async () => {
            const { fileSystem } = await import('../lib/fileSystem');

            // 1. Load all tilesets
            const tilesets = await fileSystem.loadAllTilesets();
            for (const tileset of tilesets) {
                set(state => {
                    state.tilesets.set(tileset.id, castDraft(tileset));
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
            set(state => {
                if (!state.activeTilesetId && tilesets.length > 0) {
                    state.activeTilesetId = tilesets[0].id;
                    state.selectedTileIndex = 0;
                }
            });

            // 1.5 Load terrain types from project.json (if present)
            const proj = useEditorStore.getState().project;
            if (proj && Array.isArray((proj as any).terrainTypes)) {
                set(state => {
                    state.terrainTypes = (proj as any).terrainTypes.map((t: any) => castDraft(t));
                });
            }

            // 1.6 Load layer definitions from project.json (if present)
            if (proj && Array.isArray((proj as any).layerDefinitions)) {
                set(state => {
                    state.layerDefinitions = (proj as any).layerDefinitions.map((d: any) => castDraft(d));
                });
            }

            // 2. Load all maps
            const maps = await fileSystem.loadAllMaps();

            // Get layer definitions to inject into maps
            const layerDefs = useEditorStore.getState().layerDefinitions;

            // Helper: add missing layers from definitions to a map
            const addMissingDefinitionLayers = (map: Map): Map => {
                if (layerDefs.length === 0) return map;

                const existingDefIds = new Set(
                    map.layers.filter(l => l.definitionId).map(l => l.definitionId)
                );

                const missingDefs = layerDefs.filter(def => !existingDefIds.has(def.id));
                if (missingDefs.length === 0) return map;

                const newLayers: Layer[] = missingDefs.map(def => ({
                    id: def.id,
                    name: def.name,
                    kind: def.type === 'tile' ? 'visual' as const : 'visual' as const,
                    visible: true,
                    locked: false,
                    opacity: 1,
                    zOrder: def.zIndex,
                    data: Array(map.height).fill(null).map(() => Array(map.width).fill(null)),
                    definitionId: def.id,
                }));

                // Merge and sort by zOrder
                const allLayers = [...map.layers, ...newLayers].sort((a, b) => a.zOrder - b.zOrder);
                return { ...map, layers: allLayers };
            };

            // Optionally load the first map as current (with missing layers added)
            if (maps.length > 0) {
                const enrichedMap = addMissingDefinitionLayers(maps[0]);
                set(state => {
                    state.currentMap = castDraft(enrichedMap);
                    // Auto-select first layer
                    if (enrichedMap.layers.length > 0) {
                        state.selectedLayerId = enrichedMap.layers[0].id;
                    }
                });
            }
        },

        loadSprite: async (path, blob) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.src = url;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            set(state => {
                state.loadedSprites.set(path, castDraft(img));
            });

            return url;
        },

        updateProject: async (project) => {
            const { fileSystem } = await import('../lib/fileSystem');
            await fileSystem.saveJson('', 'project.json', project);
            set(state => {
                state.project = project;
            });
        },

        setCurrentMap: (map) => {
            set(state => {
                if (!map) {
                    state.currentMap = null;
                    return;
                }

                // Add missing layers from layer definitions
                const layerDefs = state.layerDefinitions;
                const existingDefIds = new Set(
                    map.layers.filter(l => l.definitionId).map(l => l.definitionId)
                );
                const missingDefs = layerDefs.filter(def => !existingDefIds.has(def.id));

                let enrichedMap = map;
                if (missingDefs.length > 0) {
                    const newLayers: Layer[] = missingDefs.map(def => ({
                        id: def.id,
                        name: def.name,
                        kind: def.type === 'tile' ? 'visual' as const : 'visual' as const,
                        visible: true,
                        locked: false,
                        opacity: 1,
                        zOrder: def.zIndex,
                        data: Array(map.height).fill(null).map(() => Array(map.width).fill(null)),
                        definitionId: def.id,
                    }));
                    const allLayers = [...map.layers, ...newLayers].sort((a, b) => a.zOrder - b.zOrder);
                    enrichedMap = { ...map, layers: allLayers };
                }

                state.currentMap = castDraft(enrichedMap);
                // When a map is loaded, switch to tile paint tool by default
                state.activeTool = 'tilePaint';
                if (enrichedMap && state.mapCameras && state.mapCameras[enrichedMap.id]) {
                    state.camera = { ...state.mapCameras[enrichedMap.id] };
                }
            });
        },

        setTilesetToolMode: (mode) => set(state => {
            state.tilesetToolMode = mode;
            // Auto-select first terrain when entering terrain mode
            if (mode === 'terrain' && !state.selectedTerrainId && state.terrainTypes.length > 0) {
                state.selectedTerrainId = state.terrainTypes[0].id;
            }
        }),

        createNewMap: async (name, width, height, tilesetId) => {
            const { fileSystem } = await import('../lib/fileSystem');
            const id = name.toLowerCase().replace(/\s+/g, '-');

            // Get layer definitions from store to create default layers
            const layerDefs = useEditorStore.getState().layerDefinitions;

            // Create layers from definitions, sorted by zIndex
            const definedLayers: Layer[] = layerDefs
                .slice()
                .sort((a, b) => a.zIndex - b.zIndex)
                .map(def => ({
                    id: def.id,
                    name: def.name,
                    kind: def.type === 'tile' ? 'visual' as const : 'visual' as const, // entity layers use same kind for now
                    visible: true,
                    locked: false,
                    opacity: 1,
                    zOrder: def.zIndex,
                    data: Array(height).fill(null).map(() => Array(width).fill(null)),
                    definitionId: def.id, // Link back to definition
                }));

            // If no definitions, create a default ground layer
            const layers = definedLayers.length > 0 ? definedLayers : [
                {
                    id: 'ground',
                    name: 'Ground',
                    kind: 'visual' as const,
                    visible: true,
                    locked: false,
                    opacity: 1,
                    zOrder: 0,
                    data: Array(height).fill(null).map(() => Array(width).fill(null))
                }
            ];

            const newMap: Map = {
                version: 1,
                id,
                name,
                width,
                height,
                baseTilesetId: tilesetId,
                layers,
                entities: []
            };

            await fileSystem.saveJson('maps', `${id}.map.json`, newMap);

            set(state => {
                state.currentMap = castDraft(newMap);
                state.activeVariationId = null;
                state.selectedLayerId = layers[0]?.id || null;
            });
        },

        addMap: (map: Map) => {
            // This might be used for loading, but currentMap is the primary state
            set(state => {
                state.currentMap = castDraft(map);
            });
        },

        setActiveTool: (tool) => {
            set(state => {
                state.activeTool = tool;
                // If switching to paint tool and no layer selected, select first
                if (tool === 'tilePaint' && !state.selectedLayerId && state.currentMap) {
                    state.selectedLayerId = state.currentMap.layers[0]?.id || null;
                }
            });
        },

        setDrawMode: (mode) => set(state => {
            state.drawMode = mode;
        }),

        setBrushSize: (size) => set(state => {
            state.brushSize = Math.max(1, Math.round(size));
        }),

            // Drawing preview used while dragging shapes
            setDrawPreview: (preview) => set(state => {
                state.drawPreview = preview;
            }),

        setHoveredTile: (pos) => set(state => {
            state.hoveredTile = pos;
        }),

        setMode: (mode) => {
            set(state => {
                state.mode = mode;
            });
        },

        setActiveTileset: (id) => set(state => {
            state.activeTilesetId = id;
            state.selectedTileIndex = 0;
            state.selectedTerrainId = null; // Selection clear terrain
        }),

        setSelectedTile: (index) => set(state => {
            state.selectedTileIndex = index;
            if (index !== null) state.selectedTerrainId = null;
            state.selectedTileIndices = index !== null ? [index] : [];
        }),

        setSelectedTiles: (indexes) => set(state => {
            state.selectedTileIndices = indexes.slice();
            state.selectedTileIndex = indexes.length > 0 ? indexes[indexes.length - 1] : null;
            if (state.selectedTileIndex !== null) state.selectedTerrainId = null;
        }),

        toggleSelectedTile: (index) => set(state => {
            const idx = state.selectedTileIndices.indexOf(index);
            if (idx === -1) state.selectedTileIndices.push(index);
            else state.selectedTileIndices.splice(idx, 1);
            state.selectedTileIndex = state.selectedTileIndices.length > 0 ? state.selectedTileIndices[state.selectedTileIndices.length - 1] : null;
            if (state.selectedTileIndex !== null) state.selectedTerrainId = null;
        }),

        setSelectedTerrain: (id) => set(state => {
            state.selectedTerrainId = id;
            if (id !== null) state.selectedTileIndex = null;
        }),

        addTileset: async (tileset) => {
            const { fileSystem } = await import('../lib/fileSystem');
            await fileSystem.saveJson('tilesets', `${tileset.id}.tileset.json`, tileset);

            set(state => {
                state.tilesets.set(tileset.id, castDraft(tileset));
                if (!state.activeTilesetId) state.activeTilesetId = tileset.id;
            });

            // Load sprite
            try {
                const blob = await fileSystem.loadAsset(tileset.spriteSheet);
                await useEditorStore.getState().loadSprite(tileset.spriteSheet, blob);
            } catch (e) {
                console.warn("Failed to load sprite for new tileset:", e);
            }
        },

        updateTileset: async (id, updates) => {
            const { fileSystem } = await import('../lib/fileSystem');
            let updatedTileset: Tileset | undefined;

            set(state => {
                const ts = state.tilesets.get(id);
                if (ts) {
                    Object.assign(ts, updates);
                    updatedTileset = JSON.parse(JSON.stringify(ts)); // Clone for safety
                }
            });

            if (updatedTileset) {
                await fileSystem.saveJson('tilesets', `${id}.tileset.json`, updatedTileset);
            }
        },

        deleteTileset: async (id) => {
            const { fileSystem } = await import('../lib/fileSystem');

            set(state => {
                state.tilesets.delete(id);
                if (state.activeTilesetId === id) {
                    state.activeTilesetId = null;
                    state.selectedTileIndex = null;
                }
            });

            await fileSystem.deleteJson('tilesets', `${id}.tileset.json`);
        },

        updateTileDefinition: (tilesetId, index, definition) => set(state => {
            const ts = state.tilesets.get(tilesetId);
            if (ts) {
                ts.tiles[index] = castDraft(definition);
            }
        }),

        setTileCornerTerrain: async (tilesetId, index, corner, terrainId) => {
            const { fileSystem } = await import('../lib/fileSystem');
            let updatedTileset: Tileset | undefined;

            set(state => {
                const ts = state.tilesets.get(tilesetId);
                if (!ts) return;
                const tile = ts.tiles[index] || {} as TileDefinition;
                if (!tile.terrainCorners) tile.terrainCorners = [null, null, null, null];
                tile.terrainCorners[corner] = terrainId;

                // If terrainId is null, clear the terrain information for the corner
                if (terrainId === null) {
                    const updatedCorners = [...tile.terrainCorners];
                    updatedCorners[corner] = null;
                    // Check if all corners are null, and if so, remove the terrainCorners property
                    if (updatedCorners.every(corner => corner === null)) {
                        delete tile.terrainCorners;
                    } else {
                        tile.terrainCorners = updatedCorners;
                    }
                }

                ts.tiles[index] = castDraft(tile);
                updatedTileset = JSON.parse(JSON.stringify(ts));
            });

            if (updatedTileset) {
                await fileSystem.saveJson('tilesets', `${tilesetId}.tileset.json`, updatedTileset);
            }
        },

        paintTile: (layerId, x, y, tilesetId, tileIndex) => set(state => {
            if (!state.currentMap) return;

            const tileRef = `${tilesetId}:${tileIndex}`;

            // If we are in a variation, paint in the variation override
            if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(v => v.id === state.activeVariationId);
                if (variation) {
                    if (!variation.layerOverrides) variation.layerOverrides = {};
                    if (!variation.layerOverrides[layerId]) {
                        // Create a sparse grid for the override
                        variation.layerOverrides[layerId] = {
                            mode: 'merge',
                            data: Array(state.currentMap?.height || 0).fill(null).map(() => Array(state.currentMap?.width || 0).fill(null))
                        };
                    }
                    variation.layerOverrides[layerId].data[y][x] = tileRef;
                    return;
                }
            }

            // Otherwise paint in the base layer
            if (state.currentMap) {
                const layer = state.currentMap.layers.find(l => l.id === layerId);
                if (layer && layer.data[y] && !layer.locked) {
                    layer.data[y][x] = tileRef;
                }
            }
        }),

        paintTilesBatch: (layerId, tiles) => set(state => {
            if (!state.currentMap) return;

            const layer = state.currentMap.layers.find(l => l.id === layerId);
            const variation = state.activeVariationId
                ? state.currentMap.variations?.find(v => v.id === state.activeVariationId)
                : null;

            for (const { x, y, tilesetId, tileIndex } of tiles) {
                if (x < 0 || y < 0 || x >= state.currentMap.width || y >= state.currentMap.height) continue;
                const tileRef = `${tilesetId}:${tileIndex}`;

                if (variation) {
                    if (!variation.layerOverrides) variation.layerOverrides = {};
                    if (!variation.layerOverrides[layerId]) {
                        variation.layerOverrides[layerId] = {
                            mode: 'merge',
                            data: Array(state.currentMap.height).fill(null).map(() => Array(state.currentMap!.width).fill(null))
                        };
                    }
                    variation.layerOverrides[layerId].data[y][x] = tileRef;
                } else if (layer && layer.data[y] && !layer.locked) {
                    layer.data[y][x] = tileRef;
                }
            }
        }),

        eraseTile: (layerId, x, y) => set(state => {
            if (!state.currentMap) return;

            if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(v => v.id === state.activeVariationId);
                if (variation) {
                    if (!variation.layerOverrides) variation.layerOverrides = {};
                    if (!variation.layerOverrides[layerId]) {
                        variation.layerOverrides[layerId] = {
                            mode: 'merge',
                            data: Array(state.currentMap?.height || 0).fill(null).map(() => Array(state.currentMap?.width || 0).fill(null))
                        };
                    }
                    variation.layerOverrides[layerId].data[y][x] = null;
                    return;
                }
            }

            const layer = state.currentMap.layers.find(l => l.id === layerId);
            if (layer && layer.data[y] && !layer.locked) {
                layer.data[y][x] = null;
            }
        }),

        eraseTilesBatch: (layerId, positions) => set(state => {
            if (!state.currentMap) return;

            const layer = state.currentMap.layers.find(l => l.id === layerId);
            const variation = state.activeVariationId
                ? state.currentMap.variations?.find(v => v.id === state.activeVariationId)
                : null;

            for (const { x, y } of positions) {
                if (x < 0 || y < 0 || x >= state.currentMap.width || y >= state.currentMap.height) continue;

                if (variation) {
                    if (!variation.layerOverrides) variation.layerOverrides = {};
                    if (!variation.layerOverrides[layerId]) {
                        variation.layerOverrides[layerId] = {
                            mode: 'merge',
                            data: Array(state.currentMap.height).fill(null).map(() => Array(state.currentMap!.width).fill(null))
                        };
                    }
                    variation.layerOverrides[layerId].data[y][x] = null;
                } else if (layer && layer.data[y] && !layer.locked) {
                    layer.data[y][x] = null;
                }
            }
        }),

        bucketFill: (layerId: string, startX: number, startY: number, tilesetId: string, tileIndex: number) => set(state => {
            if (!state.currentMap) return;
            const map = state.currentMap;
            const targetTileRef = `${tilesetId}:${tileIndex}`;

            // Helper to get tile with variation resolution
            const getTile = (lx: number, ly: number) => {
                const context = state.activeVariationId
                    ? map.variations?.find(v => v.id === state.activeVariationId)
                    : null;

                if (context) {
                    const override = context.layerOverrides?.[layerId];
                    if (override && override.data[ly]?.[lx] !== undefined) {
                        return override.data[ly][lx];
                    }
                }
                const layer = map.layers.find(l => l.id === layerId);
                return layer?.data[ly]?.[lx] || null;
            };

            const startTile = getTile(startX, startY);
            if (startTile === targetTileRef) return;

            const stack: [number, number][] = [[startX, startY]];
            const visited = new Set<string>();

            while (stack.length > 0) {
                const [cx, cy] = stack.pop()!;
                const key = `${cx},${cy}`;
                if (visited.has(key)) continue;
                visited.add(key);

                if (getTile(cx, cy) === startTile) {
                    // Apply paint
                    if (state.activeVariationId) {
                        const v = map.variations?.find(v => v.id === state.activeVariationId)!;
                        if (!v.layerOverrides) v.layerOverrides = {};
                        if (!v.layerOverrides[layerId]) {
                            v.layerOverrides[layerId] = {
                                mode: 'merge',
                                data: Array(map.height).fill(null).map(() => Array(map.width).fill(null))
                            };
                        }
                        v.layerOverrides[layerId].data[cy][cx] = targetTileRef;
                    } else {
                        const l = map.layers.find(l => l.id === layerId);
                        if (l && !l.locked) l.data[cy][cx] = targetTileRef;
                    }

                    // Push neighbors
                    if (cx > 0) stack.push([cx - 1, cy]);
                    if (cx < map.width - 1) stack.push([cx + 1, cy]);
                    if (cy > 0) stack.push([cx, cy - 1]);
                    if (cy < map.height - 1) stack.push([cx, cy + 1]);
                }
            }
        }),

        placeEntity: (entity) => set(state => {
            if (!state.currentMap) return;

            // If variation active, add to overrides
            if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(v => v.id === state.activeVariationId);
                if (variation) {
                    if (!variation.entityOverrides) variation.entityOverrides = [];
                    variation.entityOverrides.push({
                        action: 'add',
                        entity: castDraft(entity)
                    });
                    return;
                }
            }

            // Otherwise add to base
            state.currentMap.entities.push(castDraft(entity));
        }),

        removeEntity: (entityId) => set(state => {
            if (!state.currentMap) return;

            if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(v => v.id === state.activeVariationId);
                if (variation) {
                    if (!variation.entityOverrides) variation.entityOverrides = [];

                    // If it was an "add" override, just remove it
                    const existingAddIdx = variation.entityOverrides.findIndex(o => o.action === 'add' && o.entity?.id === entityId);
                    if (existingAddIdx !== -1) {
                        variation.entityOverrides.splice(existingAddIdx, 1);
                        return;
                    }

                    // Otherwise add a "remove" override for the base entity
                    variation.entityOverrides.push({
                        action: 'remove',
                        entityId
                    });
                    return;
                }
            }

            state.currentMap.entities = state.currentMap.entities.filter(e => e.id !== entityId);
        }),

        updateEntityProperties: (entityId, properties) => set(state => {
            if (!state.currentMap) return;

            if (state.activeVariationId) {
                const variation = state.currentMap.variations?.find(v => v.id === state.activeVariationId);
                if (variation) {
                    if (!variation.entityOverrides) variation.entityOverrides = [];

                    // Check if we already have an override for this entity in this variation
                    const existingOverride = variation.entityOverrides.find(o =>
                        (o.action === 'add' && o.entity?.id === entityId) ||
                        (o.action === 'modify' && o.entityId === entityId)
                    );

                    if (existingOverride) {
                        if (existingOverride.action === 'add' && existingOverride.entity) {
                            existingOverride.entity.properties = { ...existingOverride.entity.properties, ...properties };
                        } else if (existingOverride.action === 'modify') {
                            if (!existingOverride.entity) existingOverride.entity = { properties: {} } as any;
                            if (existingOverride.entity) {
                                existingOverride.entity.properties = { ...existingOverride.entity.properties, ...properties };
                            }
                        }
                    } else {
                        // Create a new "modify" override
                        variation.entityOverrides.push({
                            action: 'modify',
                            entityId,
                            entity: { properties } as any // Sparse entity for properties override
                        });
                    }
                    return;
                }
            }

            const entity = state.currentMap.entities.find(e => e.id === entityId);
            if (entity) {
                entity.properties = { ...entity.properties, ...properties };
            }
        }),

        addLayer: (layer) => set(state => {
            if (state.currentMap) {
                state.currentMap.layers.push(castDraft(layer));
            }
        }),

        removeLayer: (layerId) => set(state => {
            if (state.currentMap) {
                state.currentMap.layers = state.currentMap.layers.filter(l => l.id !== layerId);
            }
        }),

        reorderLayer: (layerId, newZOrder) => set(state => {
            if (!state.currentMap) return;
            const layer = state.currentMap.layers.find(l => l.id === layerId);
            if (layer) {
                layer.zOrder = newZOrder;
                // Stability: Sort layers by zOrder to keep indices predictable
                state.currentMap.layers.sort((a, b) => a.zOrder - b.zOrder);
            }
        }),

        toggleLayerVisibility: (layerId) => set(state => {
            const layer = state.currentMap?.layers.find(l => l.id === layerId);
            if (layer) {
                layer.visible = !layer.visible;
            }
        }),

        selectLayer: (layerId) => set(state => {
            state.selectedLayerId = layerId;
        }),

        updateLayer: (layerId, updates) => set(state => {
            const layer = state.currentMap?.layers.find(l => l.id === layerId);
            if (layer) {
                Object.assign(layer, updates);
                // Re-sort layers by zOrder if zOrder changed
                if (updates.zOrder !== undefined && state.currentMap) {
                    state.currentMap.layers.sort((a, b) => a.zOrder - b.zOrder);
                }
            }
        }),

        setActiveVariation: (variationId) => {
            set(state => {
                state.activeVariationId = variationId;
            });
        },

        addVariation: (variation) => {
            set(state => {
                if (state.currentMap) {
                    if (!state.currentMap.variations) state.currentMap.variations = [];
                    state.currentMap.variations.push(castDraft(variation));
                }
            });
        },

        updateVariation: (id, updates) => {
            set(state => {
                const variation = state.currentMap?.variations?.find(v => v.id === id);
                if (variation) {
                    Object.assign(variation, updates);
                }
            });
        },

        removeVariation: (id) => {
            set(state => {
                if (state.currentMap) {
                    state.currentMap.variations = state.currentMap.variations?.filter(v => v.id !== id);
                    if (state.activeVariationId === id) state.activeVariationId = null;
                }
            });
        },

        selectEntity: (id) => set(state => {
            state.selectedEntityId = id;
            if (id) {
                state.activeTool = 'select'; // Switch to selection tool when selecting
            }
        }),

        setSelectedEntityType: (id) => set(state => {
            state.selectedEntityTypeId = id;
            if (id) {
                state.activeTool = 'entityPlace';
            }
        }),

        // Terrain actions
        addTerrainType: async (terrain) => {
            set(state => {
                state.terrainTypes.push(castDraft(terrain));
            });
            // Persist into project.json if project open
            const { fileSystem } = await import('../lib/fileSystem');
            const proj = useEditorStore.getState().project;
            if (proj) {
                const projectToSave = { ...proj, terrainTypes: useEditorStore.getState().terrainTypes };
                await fileSystem.saveJson('', 'project.json', projectToSave);
                set(state => { state.project = projectToSave as any; });
            }
        },

        updateTerrainType: async (id, updates) => {
            set(state => {
                const t = state.terrainTypes.find(tt => tt.id === id);
                if (t) Object.assign(t, updates as any);
            });
            const { fileSystem } = await import('../lib/fileSystem');
            const proj = useEditorStore.getState().project;
            if (proj) {
                const projectToSave = { ...proj, terrainTypes: useEditorStore.getState().terrainTypes };
                await fileSystem.saveJson('', 'project.json', projectToSave);
                set(state => { state.project = projectToSave as any; });
            }
        },

        deleteTerrainType: async (id) => {
            set(state => {
                state.terrainTypes = state.terrainTypes.filter(t => t.id !== id);
                if (state.selectedTerrainId === id) state.selectedTerrainId = null;
            });
            const { fileSystem } = await import('../lib/fileSystem');
            const proj = useEditorStore.getState().project;
            if (proj) {
                const projectToSave = { ...proj, terrainTypes: useEditorStore.getState().terrainTypes };
                await fileSystem.saveJson('', 'project.json', projectToSave);
                set(state => { state.project = projectToSave as any; });
            }
        },

        // Layer definition actions
        setSelectedLayerDefinition: (id) => set(state => {
            state.selectedLayerDefinitionId = id;
        }),

        addLayerDefinition: async (definition) => {
            set(state => {
                state.layerDefinitions.push(castDraft(definition));
            });
            const { fileSystem } = await import('../lib/fileSystem');
            const proj = useEditorStore.getState().project;
            if (proj) {
                const projectToSave = { ...proj, layerDefinitions: useEditorStore.getState().layerDefinitions };
                await fileSystem.saveJson('', 'project.json', projectToSave);
                set(state => { state.project = projectToSave as any; });
            }
        },

        updateLayerDefinition: async (id, updates) => {
            set(state => {
                const def = state.layerDefinitions.find(d => d.id === id);
                if (def) Object.assign(def, updates as any);
            });
            const { fileSystem } = await import('../lib/fileSystem');
            const proj = useEditorStore.getState().project;
            if (proj) {
                const projectToSave = { ...proj, layerDefinitions: useEditorStore.getState().layerDefinitions };
                await fileSystem.saveJson('', 'project.json', projectToSave);
                set(state => { state.project = projectToSave as any; });
            }
        },

        deleteLayerDefinition: async (id) => {
            set(state => {
                state.layerDefinitions = state.layerDefinitions.filter(d => d.id !== id);
                if (state.selectedLayerDefinitionId === id) state.selectedLayerDefinitionId = null;
            });
            const { fileSystem } = await import('../lib/fileSystem');
            const proj = useEditorStore.getState().project;
            if (proj) {
                const projectToSave = { ...proj, layerDefinitions: useEditorStore.getState().layerDefinitions };
                await fileSystem.saveJson('', 'project.json', projectToSave);
                set(state => { state.project = projectToSave as any; });
            }
        },

        setCamera: (camera) => set(state => {
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

        resetCamera: () => set(state => {
            state.camera = { x: 0, y: 0, zoom: 1.5 };
        }),

        validate: () => {
            return []; // Placeholder
        }
    }))
);
