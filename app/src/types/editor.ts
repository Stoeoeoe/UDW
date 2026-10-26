import {
  Project,
  Tileset,
  Map,
  LayerDefinition,
  EntityType,
  Character,
  DialogueDocument,
  GameVariable,
  ScriptTable,
  ScriptFunction,
  ScriptNamespace,
  ScriptContextType,
  PropertyDefinition,
} from './schema';

export interface EditorState {
  // Project data
  project: Project | null;
  projectPath: string | null; // Folder path or null if unsaved
  resourcesLoaded: boolean;
  resourceLoadingLabel: string | null;
  resourceLoadingProgress: number;
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
  selectedObjectDefinitionId?: string | null; // Selected reusable multi-tile object definition
  selectedObjectInstanceId?: string | null; // Selected placed object instance on the map
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
  showCollisionOverlay: boolean; // Visualize tile collision shapes in map viewport
  showTilesetCollisionOverlay: boolean; // Visualize tile collision shapes in tileset editor
  showTilesetSortPivotOverlay: boolean; // Visualize per-tile pivotY line in tileset editor
  showTerrainOverlay: boolean; // Visualize painted terrain IDs on terrain layers

  drawMode: 'point' | 'rect' | 'circle' | 'line' | 'flood'; // Shape mode for tools
  brushSize: number; // Brush radius for point/line modes (1 = single tile)
  hoveredTile: { x: number; y: number } | null; // Currently hovered tile in viewport
  hoveredWorldPosition: { x: number; y: number } | null; // Currently hovered pixel position in viewport
  // Live drawing preview (used to render shape previews while dragging)
  drawPreview?: {
    isDrawing: boolean;
    start: { x: number; y: number } | null;
    end: { x: number; y: number } | null;
    mode?: 'draw' | 'select'; // 'draw' = stamp preview, 'select' = selection rectangle
  };

  // Tileset-specific tool mode used by the Tileset toolbar
  tilesetToolMode?: 'select' | 'terrain' | 'objects';

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

  // Project-level tile metadata definitions (applies to all tilesets)
  tileMetadataDefinitions: PropertyDefinition[];
  // Project-level location metadata definitions (applies to maps/locations)
  locationMetadataDefinitions: PropertyDefinition[];

  // Character definitions (persisted in characters/ or legacy npcs/ directory)
  characters: Character[];
  selectedCharacterId: string | null;

  // Dialogue database (stored separately from project)
  dialogues: globalThis.Map<string, DialogueDocument>;
  selectedDialogueId: string | null;
  selectedDialogueNodeId: string | null;

  // Game variable registry (persisted in project)
  gameVariables: GameVariable[];

  // Scripting primitives (persisted in project)
  scriptTables: ScriptTable[];
  scriptFunctions: ScriptFunction[];
  scriptNamespaces: ScriptNamespace[];
  scriptContextTypes: ScriptContextType[];

  // Project-level layer definitions (template layers for maps)
  layerDefinitions: LayerDefinition[];
  selectedLayerDefinitionId: string | null;

  // Location link selection/editing state
  selectedLinkId: string | null; // Currently selected link (shown in inspector)
  selectedAnchorId: string | null; // Currently selected anchor
  pendingNewLinkId: string | null; // Set immediately after link placement to trigger setup dialog

  // Trigger selection/editing state
  selectedTriggerId: string | null; // Currently selected trigger zone

  // Collision selection/editing state
  selectedCollisionId: string | null; // Currently selected collision shape

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
  | 'select' // Global select — works across all layers (anchors, triggers, links, entities)
  | 'stamp'
  | 'random'
  | 'erase'
  | 'terrain' // Terrain brush for autotiling
  | 'fill'
  | 'objectSelect' // Select & move placed map objects
  | 'objectPlace' // Place reusable tileset objects as map instances
  | 'objectDelete' // Delete placed map objects
  | 'entitySelect' // Select & move entities
  | 'entityPlace'
  | 'entityDelete' // Delete entities
  | 'linkPlace' // Link creation tool — click a highlighted trigger to start a link
  | 'anchorPlace'
  | 'triggerPlace' // Place a new trigger zone (drag to size, rectangle)
  | 'triggerPolygon' // Draw a polygon trigger by clicking vertices
  | 'collisionRect' // Drag to place a rectangle collision shape
  | 'collisionPolygon' // Click vertices to draw a polygon collision shape
  | 'collisionCircle' // Click center + drag to set radius for a circle collision shape
  | 'collisionSelect'; // Select / move / resize / delete collision shapes

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
  | 'cutscenes'
  | 'project'
  | 'maps'
  | 'tilesets'
  | 'entities'
  | 'characters'
  | 'items'
  | 'dialogues'
  | 'scripting'
  | 'settings'
  | 'config'
  | 'terrain'
  | 'layers';
