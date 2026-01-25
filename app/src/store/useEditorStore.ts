import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { castDraft } from 'immer';
import { EditorState, ToolType, ValidationError, EditorMode } from '../types/editor';
import { Project, Map, Layer, Variation, EntityInstance } from '../types/schema';
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

    // Tile actions
    paintTile: (layerId: string, x: number, y: number, tileId: string) => void;
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
    selectTile: (tileId: string) => void;

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
        selectedTileId: null,
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
                state.selectedTileId = null;
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
            });
        },

        loadProjectResources: async () => {
            const { fileSystem } = await import('../lib/fileSystem');

            // 1. Load all tilesets
            const tilesets = await fileSystem.loadAllTilesets();
            for (const tileset of tilesets) {
                set(state => {
                    state.tilesets.set(tileset.id, tileset);
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
            console.log(`Loaded ${maps.length} maps:`, maps.map(m => m.name));

            // Optionally load the first map as current
            if (maps.length > 0) {
                set(state => {
                    state.currentMap = maps[0];
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
                state.currentMap = map;
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

        paintTile: (layerId, x, y, tileId) => set(state => {
            const layer = state.currentMap?.layers.find(l => l.id === layerId);
            if (layer && layer.data[y] && !layer.locked) {
                layer.data[y][x] = tileId;
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
                state.currentMap.entities.push(entity);
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
                state.currentMap.layers.push(layer);
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

        selectTile: (tileId) => set(state => {
            state.selectedTileId = tileId;
            // Also set tool to paint automatically? Maybe later.
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
