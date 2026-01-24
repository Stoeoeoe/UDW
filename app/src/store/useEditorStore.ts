import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { castDraft } from 'immer';
import { EditorState, ToolType, ValidationError } from '../types/editor';
import { Project, Tileset, Map, Layer, Variation, EntityInstance } from '../types/schema';

interface EditorStore extends EditorState {
    // Actions
    loadProject: (path: string, project: Project) => Promise<void>;
    loadSprite: (path: string, blob: Blob) => Promise<string>; // Returns object URL

    // Map Actions
    setCurrentMap: (map: Map) => void;
    createNewMap: (name: string, width: number, height: number, tilesetId: string) => void;

    // Tool actions
    setActiveTool: (tool: ToolType) => void;

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
    immer((set, get) => ({
        // Initial state
        project: null,
        projectPath: null,
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
            });
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

        setCurrentMap: (map) => {
            set(state => {
                state.currentMap = map;
            });
        },

        createNewMap: (name, width, height, tilesetId) => {
            // Implementation placeholder
        },

        setActiveTool: (tool) => {
            set(state => {
                state.activeTool = tool;
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

        reorderLayer: (layerId, newZOrder) => {
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

        addVariation: (variation) => {
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
