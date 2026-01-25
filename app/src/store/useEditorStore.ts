import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { castDraft } from 'immer';
import { EditorState, ToolType, ValidationError, EditorMode } from '../types/editor';
import { Project, Map, Layer, Variation, EntityInstance, Tileset, TileDefinition } from '../types/schema';
import { recentProjects } from '../lib/recentProjects';

interface EditorStore extends EditorState {
    // Actions
    loadProject: (path: string, project: Project) => Promise<void>;
    closeProject: () => void;
    loadProjectResources: () => Promise<void>; // Load all maps, tilesets, sprites
    loadSprite: (path: string, blob: Blob) => Promise<string>; // Returns object URL
    updateProject: (project: Project) => Promise<void>;

    // Map Actions
    setCurrentMap: (map: Map) => void;
    createNewMap: (name: string, width: number, height: number, tilesetId: string) => void;

    // Tool actions
    setActiveTool: (tool: ToolType) => void;
    setMode: (mode: EditorMode) => void;

    // Tileset actions
    setActiveTileset: (id: string | null) => void;
    setSelectedTile: (index: number | null) => void;
    addTileset: (tileset: Tileset) => Promise<void>;
    updateTileset: (id: string, updates: Partial<Tileset>) => Promise<void>;
    deleteTileset: (id: string) => Promise<void>;
    updateTileDefinition: (tilesetId: string, index: number, definition: TileDefinition) => void;

    // Tile actions
    paintTile: (layerId: string, x: number, y: number, tilesetId: string, tileIndex: number) => void;
    eraseTile: (layerId: string, x: number, y: number) => void;

    // Entity actions
    placeEntity: (entity: EntityInstance) => void;
    removeEntity: (entityId: string) => void;
    updateEntityProperties: (entityId: string, properties: Record<string, any>) => void;

    // Layer actions
    addLayer: (layer: Layer) => void;
    removeLayer: (layerId: string) => void;
    reorderLayer: (layerId: string, newZOrder: number) => void;
    toggleLayerVisibility: (layerId: string) => void;
    selectLayer: (layerId: string) => void;

    // Variation actions
    setActiveVariation: (variationId: string | null) => void;
    addVariation: (variation: Variation) => void;

    // Camera actions
    setCamera: (camera: Partial<EditorState['camera']>) => void;
    resetCamera: () => void;

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
        activeVariation: null,
        timePreviewEnabled: false,
        timeOfDay: 0.5,
        activeTool: 'select',
        selectedLayerId: null,
        selectedTileIndex: null,
        activeTilesetId: null,
        selectedEntityTypeId: null,
        selectedEntityIds: new Set(),
        camera: { x: 0, y: 0, zoom: 1.0 },
        panels: {
            layersOpen: true,
            tilesetPaletteOpen: true,
            entitiesOpen: false,
            inspectorOpen: true,
            variationsOpen: false
        },
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

            // 2. Load all maps (metadata only, not setting as current)
            const maps = await fileSystem.loadAllMaps();

            // Optionally load the first map as current
            if (maps.length > 0) {
                set(state => {
                    state.currentMap = castDraft(maps[0]);
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
                state.currentMap = castDraft(map);
            });
        },

        createNewMap: (_name, _width, _height, _tilesetId) => {
            // Implementation placeholder
        },

        setActiveTool: (tool) => {
            set(state => {
                state.activeTool = tool;
            });
        },

        setMode: (mode) => {
            set(state => {
                state.mode = mode;
            });
        },

        setActiveTileset: (id) => set(state => {
            state.activeTilesetId = id;
            state.selectedTileIndex = null;
        }),

        setSelectedTile: (index) => set(state => {
            state.selectedTileIndex = index;
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

        paintTile: (layerId, x, y, tilesetId, tileIndex) => set(state => {
            const layer = state.currentMap?.layers.find(l => l.id === layerId);
            if (layer && layer.data[y] && !layer.locked) {
                // String format for composite reference: "tilesetId:index"
                layer.data[y][x] = `${tilesetId}:${tileIndex}`;
            }
        }),

        eraseTile: (layerId, x, y) => set(state => {
            const layer = state.currentMap?.layers.find(l => l.id === layerId);
            if (layer && layer.data[y] && !layer.locked) {
                layer.data[y][x] = null;
            }
        }),

        placeEntity: (entity) => set(state => {
            if (state.currentMap) {
                state.currentMap.entities.push(castDraft(entity));
            }
        }),

        removeEntity: (entityId) => set(state => {
            if (state.currentMap) {
                state.currentMap.entities = state.currentMap.entities.filter(e => e.id !== entityId);
            }
        }),

        updateEntityProperties: (entityId, properties) => set(state => {
            if (state.currentMap) {
                const entity = state.currentMap.entities.find(e => e.id === entityId);
                if (entity) {
                    entity.properties = { ...entity.properties, ...properties };
                }
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

        reorderLayer: (_layerId, _newZOrder) => {
            // Implementation placeholder
        },

        toggleLayerVisibility: (layerId) => set(state => {
            const layer = state.currentMap?.layers.find(l => l.id === layerId);
            if (layer) {
                layer.visible = !layer.visible;
            }
        }),

        selectLayer: (layerId) => set(state => {
            state.selectedLayerId = layerId;
        }),

        setActiveVariation: (variationId) => {
            set(state => {
                state.activeVariation = variationId;
            });
        },

        addVariation: (_variation) => {
            // Implementation placeholder
        },

        setCamera: (camera) => set(state => {
            state.camera = { ...state.camera, ...camera };
        }),

        resetCamera: () => set(state => {
            state.camera = { x: 0, y: 0, zoom: 1.0 };
        }),

        validate: () => {
            return []; // Placeholder
        }
    }))
);
