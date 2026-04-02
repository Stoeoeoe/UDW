import { Project, Tileset, Map, LayerDefinition, EntityType } from './schema';

export interface EditorState {
  // Project data
  project: Project | null;
  projectPath: string | null; // Folder path or null if unsaved
  mode: EditorMode;

  // Assets
  tilesets: globalThis.Map<string, Tileset>; // Keyed by tileset.id
  loadedSprites: globalThis.Map<string, HTMLImageElement>; // Keyed by sprite path

  // All maps in the project (lightweight, for browsing)
  maps: Map[];

  // Current editing context
  currentMap: Map | null;
  currentMapPath: string | null;

  // Variation & temporal context
  activeVariationId: string | null; // null = base
  timePreviewEnabled: boolean;
  timeOfDay: number; // 0.0 to 1.0, normalized

  // Selection & active tool
  activeTool: ToolType;
  selectedLayerId: string | null;
  selectedTileIndex: number | null; // Selected index within active tileset
  selectedTileIndices: number[]; // Multiple selected indices for stencil selection
  selectedTerrainId: string | null; // Selected terrain for autotiling
  activeTilesetId: string | null; // Currently visible tileset in palette
  // Per-editor selection (keeps map and tileset selections independent when needed)
  mapEditorSelectedTileIndex?: number | null;
  mapEditorSelectedTileIndices?: number[];
  tilesetEditorSelectedTileIndex?: number | null;
  tilesetEditorSelectedTileIndices?: number[];
  // Sampled pattern from right-click copy (preserves exact spatial arrangement)
  sampledPattern: {
    tilesetId: string;
    pattern: (number | null)[][]; // 2D array of tile indices, null for empty
    width: number;
    height: number;
  } | null;
  selectedEntityTypeId: string | null; // For entity placement
  selectedEntityId: string | null; // Currently active entity for inspection
  selectedEntityIds: Set<string>; // Multiple selected entities
  entitySnapMode: 'grid' | 'pixel'; // Snap mode for entity placement/movement

  drawMode: 'point' | 'rect' | 'circle' | 'line' | 'flood'; // Shape mode for tools
  brushSize: number; // Brush radius for point/line modes (1 = single tile)
  hoveredTile: { x: number; y: number } | null; // Currently hovered tile in viewport
  // Live drawing preview (used to render shape previews while dragging)
  drawPreview?: {
    isDrawing: boolean;
    start: { x: number; y: number } | null;
    end: { x: number; y: number } | null;
    mode?: 'draw' | 'select'; // 'draw' = stamp preview, 'select' = selection rectangle
  };

  // Tileset-specific tool mode used by the Tileset toolbar
  tilesetToolMode?: 'select' | 'terrain';

  // Camera
  camera: {
    x: number; // Pan offset X in pixels
    y: number; // Pan offset Y in pixels
    zoom: number; // Zoom level (0.5 = 50%, 2.0 = 200%)
  };
  mapCameras: Record<string, { x: number; y: number; zoom: number }>; // Per-map camera state

  // UI state
  panels: {
    layersOpen: boolean;
    tilesetPaletteOpen: boolean;
    entitiesOpen: boolean;
    inspectorOpen: boolean;
    variationsOpen: boolean;
  };

  // Project-level terrain types (for autotiling / labeling)
  terrainTypes: TerrainType[];

  // Project-level entity type definitions
  entityTypes: EntityType[];

  // Project-level layer definitions (template layers for maps)
  layerDefinitions: LayerDefinition[];
  selectedLayerDefinitionId: string | null;

  // Validation
  validationErrors: ValidationError[];
}

export interface TerrainType {
  id: string;
  displayName: string;
  color: string; // hex
}

export type ToolIcon = {
  id: string;
  icon: React.ReactElement;
  label: string;
  tooltip?: string;
  group: string;
};

export type ToolType =
  | 'select'
  | 'stamp'
  | 'random'
  | 'erase'
  | 'terrain' // Terrain brush for autotiling
  | 'fill' // Phase 2
  | 'entitySelect' // Select & move entities
  | 'entityPlace'
  | 'entityDelete' // Delete entities
  | 'pathDraw' // Phase 2
  | 'areaDraw' // Phase 2
  | 'anchorPlace'; // Phase 2

export interface ValidationError {
  severity: 'error' | 'warning';
  message: string;
  location?: {
    mapId?: string;
    layerId?: string;
    entityId?: string;
    position?: [number, number];
  };
}

export type EditorMode =
  | 'project'
  | 'maps'
  | 'tilesets'
  | 'entities'
  | 'settings'
  | 'terrain'
  | 'layers';
