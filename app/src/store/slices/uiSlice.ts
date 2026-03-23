import { StateCreator } from 'zustand';
import type { EditorMode, ToolType, ValidationError } from '../../types/editor';

export interface UiSlice {
  mode: EditorMode;
  activeTool: ToolType;
  drawMode: 'point' | 'rect' | 'circle' | 'line' | 'flood';
  brushSize: number;
  hoveredTile: { x: number; y: number } | null;
  drawPreview: {
    isDrawing: boolean;
    start: { x: number; y: number } | null;
    end: { x: number; y: number } | null;
    mode?: 'draw' | 'select';
  };
  selectedLayerId: string | null;
  selectedTileIndex: number | null;
  selectedTileIndices: number[];
  mapEditorSelectedTileIndex: number | null;
  mapEditorSelectedTileIndices: number[];
  tilesetEditorSelectedTileIndex: number | null;
  tilesetEditorSelectedTileIndices: number[];
  selectedTerrainId: string | null;
  activeTilesetId: string | null;
  sampledPattern: {
    tilesetId: string;
    pattern: (number | null)[][];
    width: number;
    height: number;
  } | null;
  selectedEntityTypeId: string | null;
  selectedEntityId: string | null;
  selectedEntityIds: Set<string>;
  camera: { x: number; y: number; zoom: number };
  mapCameras: Record<string, { x: number; y: number; zoom: number }>;
  tilesetToolMode: 'select' | 'terrain';
  panels: {
    layersOpen: boolean;
    tilesetPaletteOpen: boolean;
    entitiesOpen: boolean;
    inspectorOpen: boolean;
    variationsOpen: boolean;
  };
  timePreviewEnabled: boolean;
  timeOfDay: number;
  validationErrors: ValidationError[];

  setActiveTool: (tool: ToolType) => void;
  setDrawMode: (mode: 'point' | 'rect' | 'circle' | 'line' | 'flood') => void;
  setBrushSize: (size: number) => void;
  setDrawPreview: (preview: {
    isDrawing: boolean;
    start: { x: number; y: number } | null;
    end: { x: number; y: number } | null;
    mode?: 'draw' | 'select';
  }) => void;
  setHoveredTile: (pos: { x: number; y: number } | null) => void;
  setMode: (mode: EditorMode) => void;
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
  setCamera: (camera: Partial<{ x: number; y: number; zoom: number }>) => void;
  resetCamera: () => void;
  setTimePreviewEnabled: (enabled: boolean) => void;
  setTimeOfDay: (time: number) => void;
  setTilesetToolMode: (mode: 'select' | 'terrain') => void;
  resetSelectedTiles: () => void;
  selectEntity: (id: string | null) => void;
  setSelectedEntityType: (id: string | null) => void;
  validate: () => ValidationError[];
}

export const createUiSlice: StateCreator<any, any, [], UiSlice> = (set) => ({
  mode: 'project',
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
  timePreviewEnabled: false,
  timeOfDay: 0.5,
  validationErrors: [],

  setActiveTool: (tool) => {
    set((state: any) => {
      state.activeTool = tool;
      // If switching to paint tool and no layer selected, select first
      if (tool === 'stamp' && !state.selectedLayerId && state.currentMap) {
        state.selectedLayerId = state.currentMap.layers[0]?.id || null;
      }
    });
  },

  setDrawMode: (mode) =>
    set((state: any) => {
      state.drawMode = mode;
    }),

  setBrushSize: (size) =>
    set((state: any) => {
      state.brushSize = Math.max(1, Math.round(size));
    }),

  setDrawPreview: (preview) =>
    set((state: any) => {
      state.drawPreview = preview;
    }),

  setHoveredTile: (pos) =>
    set((state: any) => {
      state.hoveredTile = pos;
    }),

  setMode: (mode) => {
    set((state: any) => {
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
    set((state: any) => {
      state.activeTilesetId = id;
      state.selectedTileIndex = 0;
      state.selectedTerrainId = null; // Selection clear terrain
    }),

  setSelectedTile: (index) =>
    set((state: any) => {
      state.selectedTileIndex = index;
      if (index !== null) state.selectedTerrainId = null;
      state.selectedTileIndices = index !== null ? [index] : [];
      state.sampledPattern = null; // Clear sampled pattern when selecting tiles normally
    }),

  setSelectedTiles: (indexes) =>
    set((state: any) => {
      state.selectedTileIndices = indexes.slice();
      state.selectedTileIndex =
        indexes.length > 0 ? indexes[indexes.length - 1] : null;
      if (state.selectedTileIndex !== null) state.selectedTerrainId = null;
      state.sampledPattern = null; // Clear sampled pattern when selecting tiles normally
    }),

  toggleSelectedTile: (index) =>
    set((state: any) => {
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
    set((state: any) => {
      state.selectedTerrainId = id;
      if (id !== null) state.selectedTileIndex = null;
    }),

  setSampledPattern: (pattern) =>
    set((state: any) => {
      state.sampledPattern = pattern;
      // Clear normal tile selection when setting a sampled pattern
      if (pattern) {
        state.selectedTileIndices = [];
      }
    }),

  setCamera: (camera) =>
    set((state: any) => {
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
    set((state: any) => {
      state.camera = { x: 0, y: 0, zoom: 1.5 };
    }),

  setTimePreviewEnabled: (enabled) =>
    set((state: any) => {
      state.timePreviewEnabled = enabled;
    }),

  setTimeOfDay: (time) =>
    set((state: any) => {
      state.timeOfDay = Math.max(0, Math.min(1, time));
    }),

  setTilesetToolMode: (mode) =>
    set((state: any) => {
      state.tilesetToolMode = mode;
      // Auto-select first terrain when entering terrain mode
      if (
        mode === 'terrain' &&
        !state.selectedTerrainId &&
        state.terrainTypes.length > 0
      ) {
        state.selectedTerrainId = state.terrainTypes[0].id;
      }
    }),

  resetSelectedTiles: () =>
    set((state: any) => {
      state.selectedTileIndex = null;
      state.selectedTileIndices = [];
      state.selectedTerrainId = null;
      state.sampledPattern = null;
    }),

  selectEntity: (id) =>
    set((state: any) => {
      state.selectedEntityId = id;
      if (id) {
        state.activeTool = 'select'; // Switch to selection tool when selecting
      }
    }),

  setSelectedEntityType: (id) =>
    set((state: any) => {
      state.selectedEntityTypeId = id;
      if (id) {
        state.activeTool = 'entityPlace';
      }
    }),

  validate: () => {
    return []; // Placeholder
  },
});
