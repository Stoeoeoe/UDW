export interface Project {
  id: string; // Unique identifier (kebab-case)
  version: string; // File format version (starts at 1.0)
  name: string; // Display name
  tileSize: number; // Tile dimensions in pixels (e.g., 16)
  defaultMapWidth: number; // Default new map width in tiles
  defaultMapHeight: number; // Default new map height in tiles
  metadata?: {
    author?: string;
    description?: string;
    created?: string; // ISO date string
    modified?: string; // ISO date string
  };
  // Optional project-level terrain types for autotiling and labeling
  terrainTypes?: { id: string; displayName: string; color: string }[];
  // Default layer definitions for maps
  layerDefinitions?: LayerDefinition[];
  // Project-level entity type definitions
  entityTypes?: EntityType[];
}

export type LayerType = 'tile' | 'entity' | 'terrain';

export interface LayerDefinition {
  id: string; // Unique identifier
  name: string; // Display name
  type: LayerType; // Layer type (tile or entity)
  color: string; // Hex color for display in layer list
  zIndex: number; // Z-index for rendering order
  icon?: string; // Optional icon identifier (e.g., 'tree', 'building')
  description?: string; // Optional description
}

export interface Tileset {
  version: number;
  id: string; // Unique identifier (kebab-case)
  name: string; // Display name
  spriteSheet: string; // Relative path to PNG file (from project root or assets)
  columns: number; // Number of columns in sprite sheet
  tileCount: number; // Total number of tiles
  tiles: Record<number, TileDefinition>; // Keyed by tile index (integer)
  wangSets?: WangSet[]; // Modern autotiling logic (Tiled-compatible)
}

export interface TileDefinition {
  id?: string; // Optional semantic string ID (e.g. "player_spawn")
  tags?: string[]; // Semantic tags (e.g. ["walkable", "water"])
  collision?: CollisionDefinition;
  properties?: PropertyInstance[];
  terrain?: string; // Optional terrain id referencing a WangColor or terrain set
  probability?: number; // Optional placement probability weight for random tile selection (relative weight)
  // Optional per-corner terrain assignments for corner-based Wang tiles
  // Order: [top-left, top-right, bottom-left, bottom-right]
  terrainCorners?: (string | null)[];
}

export interface CollisionDefinition {
  type: 'none' | 'full' | 'complex';
  shapes?: CollisionShape[]; // Reserved for complex geometry (rects, polygons)
}

export interface CollisionShape {
  id: string;
  type: 'rectangle' | 'polygon' | 'circle';
  points?: [number, number][]; // Local tile coordinates (0.0 to 1.0 or pixels)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface WangSet {
  id: string;
  name: string;
  type: 'corner' | 'edge' | 'mixed';
  colors: WangColor[];
  tileMappings: Record<number, number[]>; // tileIndex -> [T, TR, R, BR, B, BL, L, TL]
}

export interface WangColor {
  id: number; // 1-indexed (0 is none/neutral)
  name: string;
  color: string; // Hex color for editor visualization
  labelIcon?: string; // Optional placeholder for terrain type
}

export interface PropertyInstance {
  key: string;
  value: PropertyValue;
}

export interface Map {
  version: number;
  id: string; // Unique identifier
  name: string; // Display name
  width: number; // Width in tiles
  height: number; // Height in tiles
  baseTilesetId: string; // Reference to tileset
  tilesetRefs: string[]; // Ordered list of tileset IDs used in this map
  layers: Layer[];
  entities: EntityInstance[];
  locationLinks?: LocationLink[]; // Map transition links (doors, exits, etc.)
  spatialPrimitives?: SpatialPrimitives; // Optional paths/areas/anchors
  variations?: Variation[]; // Optional seasonal/contextual variants
  metadata?: MapMetadata;
}

// ─────────────────────────────────────────────────────────────────────────────
// Location Links — first-class map transition data
// ─────────────────────────────────────────────────────────────────────────────

export interface LocationLink {
  id: string;
  label?: string;
  // Source: tile position on this map where the link is triggered
  sourcePosition: [number, number]; // Tile coordinates [x, y]
  // Trigger area around the source tile
  triggerSize: [number, number]; // Width/height in tiles (default [1, 1])
  // Target: where this link leads
  targetMapId: string; // Empty string = same map
  targetPosition: [number, number]; // Tile coordinates [x, y] on target map
  // Optionally reference a named entry on the target map by link id for bidirectional sync
  targetLinkId?: string;
  direction: 'one-way' | 'bidirectional';
  tags?: string[];
}

export interface Layer {
  id: string; // Unique within map
  name: string; // Display name
  kind: LayerKind;
  visible: boolean;
  locked: boolean; // Prevent editing
  opacity: number; // 0.0 to 1.0
  zOrder: number; // Rendering order
  icon?: string; // Optional icon identifier
  // For tile-like layers this holds encoded tile IDs, row-major [y][x]
  data?: (number | null)[][]; // Encoded tile IDs (tiles only)

  // For terrain layers: parallel grid storing the terrain ID painted at each cell.
  // Used to re-resolve tile graphics when terrain rules change.
  terrainData?: (string | null)[][];

  // For layers that represent entities (entity layers), store instances here
  entities?: EntityInstance[];
  definitionId?: string; // Reference to LayerDefinition (if from project template)
}

export type LayerKind =
  | 'visual' // Rendered tiles
  | 'collision' // Collision data
  | 'navigation' // Pathfinding hints
  | 'metadata' // Data-only, invisible
  | 'entity' // Layer that contains entities (EntityInstance[])
  | 'terrain' // Terrain-painted layer (autotiled)
  | 'locationlink'; // Map transition links (doors, exits, portals)

export type PropertyValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | Record<string, string | number | boolean | null>;

export type PropertyValues = Record<string, PropertyValue>;

export interface EntityInstance {
  id: string; // Unique within map
  typeId: string; // Reference to entity type definition
  position: [number, number]; // Absolute pixel coordinates [x, y]
  rotation?: number; // Degrees, 0-360
  layerId?: string; // Optional: id of the entity layer this instance belongs to
  label?: string; // Optional display label shown on map
  properties: PropertyValues;
  tags?: string[];
  timeScope?: TimeScope;
}

export interface TimeScope {
  startTime: number; // 0.0 to 1.0
  endTime: number; // 0.0 to 1.0 (can wrap, e.g., 0.9 to 0.1)
  seasons?: string[]; // Optional: only visible in these seasons
}

export interface SpatialPrimitives {
  paths?: Path[];
  areas?: Area[];
  anchors?: Anchor[];
}

export interface Path {
  id: string;
  name: string;
  points: [number, number][]; // Tile coordinates
  closed: boolean; // Connect last to first
  width?: number; // Path width in tiles
  tags: string[];
}

export interface Area {
  id: string;
  name: string;
  shape: 'rectangle' | 'polygon';
  points: [number, number][]; // Tile coordinates
  priority: number; // Overlapping area resolution
  tags: string[];
}

export interface Anchor {
  id: string;
  name: string;
  position: [number, number]; // Tile coordinates
  rotation?: number; // Degrees
  tags: string[];
}

export interface Variation {
  id: string;
  kind: 'season' | 'generic';
  displayName: string;
  parentId?: string; // Variation inheritance
  tilesetSuffix?: string; // e.g., "_winter"
  layerOverrides?: Record<string, LayerOverride>;
  entityOverrides?: EntityOverride[];
  metadata?: Record<string, PropertyValue>;
}

export interface LayerOverride {
  data: (string | null)[][]; // Sparse or full replacement
  mode: 'replace' | 'merge'; // How to apply override
}

export interface EntityOverride {
  action: 'add' | 'remove' | 'modify';
  entityId?: string; // For remove/modify
  entity?: Partial<EntityInstance>;
}

export interface MapMetadata {
  description?: string;
  music?: string;
  ambience?: string;
  entryPoints?: { id: string; position: [number, number] }[];
  exitPoints?: {
    id: string;
    targetMap: string;
    targetPosition: [number, number];
  }[];
}

// Entity Type Definitions
export interface EntityType {
  id: string; // Unique identifier
  category: EntityCategory;
  displayName: string;
  description?: string;
  icon?: string; // Emoji or icon identifier for display
  group?: string; // Grouping label (e.g., "NPCs", "Interactables")
  placeholderColor: string; // Hex color for editor rendering
  placeholderIcon?: string; // Optional icon identifier (deprecated, use icon)
  properties: PropertyDefinition[];
  defaultSize?: [number, number]; // Pixel dimensions [width, height]
  sprite?: { path: string }; // Relative path to image asset; size locked to image dimensions
}

export type EntityCategory =
  | 'object' // Physical world objects
  | 'trigger' // Invisible trigger zones
  | 'spawn' // Spawn points
  | 'transition' // Map transitions
  | 'decoration'; // Visual-only elements

export interface PropertyDefinition {
  key: string;
  label: string;
  type: PropertyType;
  defaultValue: PropertyValue;
  required: boolean;
  description?: string;
  constraints?: PropertyConstraints;
}

export type PropertyType =
  | 'string'
  | 'int'
  | 'float'
  | 'number' // Legacy alias for float
  | 'boolean'
  | 'enum'
  | 'color'
  | 'vector2' // [x, y] number pair
  | 'reference'; // Reference to another entity or asset

export interface PropertyConstraints {
  min?: number; // For numbers
  max?: number; // For numbers
  pattern?: string; // Regex for strings
  options?: string[]; // For enums
  referenceType?: string; // For references
}
