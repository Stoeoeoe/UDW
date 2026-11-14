import { StateCreator } from 'zustand';
import { ToolType, EditorMode, EditorState } from '../../types/editor';
import {
  buildTerrainGridFromLayer,
  findBestMatchingTileWithFallback,
  getCornerTerrainsForTile,
} from '../../lib/terrainUtils';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface ToolSlice {
  // State
  activeTool: ToolType;
  drawMode: 'point' | 'rect' | 'circle' | 'line' | 'flood';
  brushSize: number;
  /** Pixel radius of the water brush (0 is a single pixel). */
  waterBrushRadius: number;
  /** Bumped while painting so the water overlay redraws without a history entry per pointer move. */
  waterPaintRevision: number;
  /** Map pixel under the pointer while a water tool is active; null outside the map. */
  waterCursor: { x: number; y: number } | null;
  hoveredTile: { x: number; y: number } | null;
  hoveredWorldPosition: { x: number; y: number } | null;
  drawPreview: {
    isDrawing: boolean;
    start: { x: number; y: number } | null;
    end: { x: number; y: number } | null;
    mode?: 'draw' | 'select';
  };
  polygonPreviewPoints: [number, number][] | null; // WIP polygon vertices for triggerPolygon tool
  tilesetToolMode: 'select' | 'terrain' | 'objects';
  entitySnapMode: 'grid' | 'pixel';
  showCollisionOverlay: boolean;
  showTilesetCollisionOverlay: boolean;
  showTilesetSortPivotOverlay: boolean;
  showTilesetNavigationCostOverlay: boolean;
  showNavigationCostOverlay: boolean;
  showTerrainOverlay: boolean;
  show3DLayerView: boolean;
  showMapTestMode: boolean;
  mapFullscreen: boolean;
  timePreviewEnabled: boolean;
  timeOfDay: number;
  camera: EditorState['camera'];
  mapCameras: Record<string, { x: number; y: number; zoom: number }>;

  // Actions
  setActiveTool: (tool: ToolType) => void;
  setEntitySnapMode: (mode: 'grid' | 'pixel') => void;
  setShowCollisionOverlay: (enabled: boolean) => void;
  setShowTilesetCollisionOverlay: (enabled: boolean) => void;
  setShowTilesetSortPivotOverlay: (enabled: boolean) => void;
  setShowTilesetNavigationCostOverlay: (enabled: boolean) => void;
  setShowNavigationCostOverlay: (enabled: boolean) => void;
  setShowTerrainOverlay: (enabled: boolean) => void;
  setShow3DLayerView: (enabled: boolean) => void;
  setShowMapTestMode: (enabled: boolean) => void;
  setMapFullscreen: (enabled: boolean) => void;
  reloadTerrainLayers: () => void;
  setDrawMode: (mode: 'point' | 'rect' | 'circle' | 'line' | 'flood') => void;
  setBrushSize: (size: number) => void;
  setWaterBrushRadius: (radius: number) => void;
  bumpWaterPaintRevision: () => void;
  setWaterCursor: (pixel: { x: number; y: number } | null) => void;
  setMode: (mode: EditorMode) => void;
  setHoveredTile: (pos: { x: number; y: number } | null) => void;
  setHoveredWorldPosition: (pos: { x: number; y: number } | null) => void;
  setDrawPreview: (preview: {
    isDrawing: boolean;
    start: { x: number; y: number } | null;
    end: { x: number; y: number } | null;
    mode?: 'draw' | 'select';
  }) => void;
  setPolygonPreviewPoints: (points: [number, number][] | null) => void;
  setTilesetToolMode: (mode: 'select' | 'terrain' | 'objects') => void;
  setCamera: (camera: Partial<EditorState['camera']>) => void;
  resetCamera: () => void;
  setTimePreviewEnabled: (enabled: boolean) => void;
  setTimeOfDay: (time: number) => void;
  resetSelectedTiles: () => void;
}

export const createToolSlice: ImmerStateCreator<ToolSlice> = (set) => ({
  // Initial state
  activeTool: 'stamp',
  drawMode: 'point',
  brushSize: 1,
  waterBrushRadius: 4,
  waterPaintRevision: 0,
  waterCursor: null,
  hoveredTile: null,
  hoveredWorldPosition: null,
  drawPreview: { isDrawing: false, start: null, end: null },
  polygonPreviewPoints: null,
  tilesetToolMode: 'select',
  entitySnapMode: 'grid',
  showCollisionOverlay: false,
  showTilesetCollisionOverlay: false,
  showTilesetSortPivotOverlay: false,
  showTilesetNavigationCostOverlay: false,
  showNavigationCostOverlay: false,
  showTerrainOverlay: false,
  show3DLayerView: false,
  showMapTestMode: false,
  mapFullscreen: false,
  timePreviewEnabled: false,
  timeOfDay: 0.5,
  camera: { x: 0, y: 0, zoom: 1.5 },
  mapCameras: {},

  setActiveTool: (tool) =>
    set((state) => {
      if (
        (state.activeTool === 'triggerPolygon' || state.activeTool === 'collisionPolygon') &&
        tool !== state.activeTool
      ) {
        state.polygonPreviewPoints = null;
      }
      state.activeTool = tool;
      if (tool === 'stamp' && !state.selectedLayerId && state.currentMap) {
        state.selectedLayerId = state.currentMap.layers[0]?.id || null;
      }
      if (tool === 'terrain' && !state.selectedTerrainId && state.terrainTypes.length > 0) {
        state.selectedTerrainId = state.terrainTypes[0].id;
      }
    }),

  setEntitySnapMode: (mode) =>
    set((state) => {
      state.entitySnapMode = mode;
    }),
  setShowCollisionOverlay: (enabled) =>
    set((state) => {
      state.showCollisionOverlay = enabled;
    }),
  setShowTilesetCollisionOverlay: (enabled) =>
    set((state) => {
      state.showTilesetCollisionOverlay = enabled;
    }),
  setShowTilesetSortPivotOverlay: (enabled) =>
    set((state) => {
      state.showTilesetSortPivotOverlay = enabled;
    }),
  setShowTilesetNavigationCostOverlay: (enabled) =>
    set((state) => {
      state.showTilesetNavigationCostOverlay = enabled;
    }),
  setShowNavigationCostOverlay: (enabled) =>
    set((state) => {
      state.showNavigationCostOverlay = enabled;
    }),
  setShowTerrainOverlay: (enabled) =>
    set((state) => {
      state.showTerrainOverlay = enabled;
    }),
  setShow3DLayerView: (enabled) =>
    set((state) => {
      state.show3DLayerView = enabled;
    }),
  setShowMapTestMode: (enabled) =>
    set((state) => {
      state.showMapTestMode = enabled;
    }),
  setMapFullscreen: (enabled) =>
    set((state) => {
      state.mapFullscreen = enabled;
    }),

  reloadTerrainLayers: () =>
    set((state) => {
      const { currentMap, activeTilesetId, tilesets } = state;
      if (!currentMap || !activeTilesetId) return;
      const tileset = tilesets.get(activeTilesetId);
      if (!tileset) return;

      const tilesetIndex = currentMap.tilesetRefs.indexOf(activeTilesetId);
      if (tilesetIndex === -1) return;
      const tilesetBase = tilesetIndex << 16;

      for (const layer of currentMap.layers) {
        if (layer.kind !== 'terrain' || !layer.terrainData || !layer.data) continue;
        const terrainGrid = buildTerrainGridFromLayer(layer.data, tilesets, currentMap.tilesetRefs);
        for (let y = 0; y < currentMap.height; y++) {
          for (let x = 0; x < currentMap.width; x++) {
            const corners = getCornerTerrainsForTile(x, y, terrainGrid);
            if (corners.every((c) => c === null)) {
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

  setDrawMode: (mode) =>
    set((state) => {
      state.drawMode = mode;
    }),
  setBrushSize: (size) =>
    set((state) => {
      state.brushSize = Math.max(1, Math.round(size));
    }),
  setWaterBrushRadius: (radius) =>
    set((state) => {
      state.waterBrushRadius = Math.max(0, Math.min(64, Math.round(radius)));
    }),
  bumpWaterPaintRevision: () =>
    set((state) => {
      state.waterPaintRevision += 1;
    }),
  setWaterCursor: (pixel) =>
    set((state) => {
      const current = state.waterCursor;
      // Skip no-op updates so hovering within one pixel does not redraw the cursor.
      if (current?.x === pixel?.x && current?.y === pixel?.y) return;
      state.waterCursor = pixel;
    }),
  setDrawPreview: (preview) =>
    set((state) => {
      state.drawPreview = preview;
    }),
  setPolygonPreviewPoints: (points) =>
    set((state) => {
      state.polygonPreviewPoints = points;
    }),
  setHoveredTile: (pos) =>
    set((state) => {
      state.hoveredTile = pos;
    }),
  setHoveredWorldPosition: (pos) =>
    set((state) => {
      state.hoveredWorldPosition = pos;
    }),

  setMode: (mode) =>
    set((state) => {
      state.mode = mode;
      state.selectedTileIndex = null;
      state.selectedTileIndices = [];
      state.mapEditorSelectedTileIndex = null;
      state.mapEditorSelectedTileIndices = [];
      state.tilesetEditorSelectedTileIndex = null;
      state.tilesetEditorSelectedTileIndices = [];
    }),

  setTilesetToolMode: (mode) =>
    set((state) => {
      state.tilesetToolMode = mode;
      if (mode === 'terrain' && !state.selectedTerrainId && state.terrainTypes.length > 0) {
        state.selectedTerrainId = state.terrainTypes[0].id;
      }
    }),

  setCamera: (camera) =>
    set((state) => {
      state.camera = { ...state.camera, ...camera };
      if (state.currentMap) {
        state.mapCameras = state.mapCameras || {};
        state.mapCameras[state.currentMap.id] = { ...state.camera };
      }
    }),

  resetCamera: () =>
    set((state) => {
      state.camera = { x: 0, y: 0, zoom: 1.5 };
    }),
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
      state.selectedObjectDefinitionId = null;
      state.selectedTerrainId = null;
      state.sampledPattern = null;
    }),
});
