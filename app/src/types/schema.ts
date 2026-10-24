import type { EditorResource } from './editorResource';

export interface FolderedEditorResource {
  folderPath?: string;
}

export interface NamedEditorResource extends EditorResource, FolderedEditorResource {}

export interface DisplayNamedEditorResource extends FolderedEditorResource {
  id: string;
  displayName: string;
}

export interface KeyedEditorResource extends FolderedEditorResource {
  key: string;
}

export type SchemaEditorResource =
  | NamedEditorResource
  | DisplayNamedEditorResource
  | KeyedEditorResource;

export function getSchemaResourceId(resource: SchemaEditorResource): string {
  if ('key' in resource) return resource.key;
  return resource.id;
}

export function getSchemaResourceName(resource: SchemaEditorResource): string {
  if ('name' in resource) return resource.name;
  if ('displayName' in resource) return resource.displayName;
  return resource.key;
}

export interface Project {
  /** Namespace for independently stored resources; legacy projects default to base. */
  idPrefix?: string;
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
  // Project-level item class definitions (templates with extra property schemas)
  itemClasses?: ItemClass[];
  // Default layer definitions for maps
  layerDefinitions?: LayerDefinition[];
  // Project-level entity type definitions
  entityTypes?: EntityType[];
  // Project-level tile metadata definitions shared by every tileset
  tileMetadataDefinitions?: PropertyDefinition[];
  // Project-level location metadata definitions for maps/locations
  locationMetadataDefinitions?: PropertyDefinition[];
  // Named variables exposed to the Lua sandbox at runtime
  gameVariables?: GameVariable[];
  // Scripting primitives
  scriptTables?: ScriptTable[];
  scriptFunctions?: ScriptFunction[];
  scriptNamespaces?: ScriptNamespace[];
  scriptContextTypes?: ScriptContextType[];
  // Dialogue scripting defaults
  defaultDialogueContextTypeId?: string;
  dialogueTypes?: DialogueType[];
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

export interface Tileset extends NamedEditorResource {
  version: number;
  spriteSheet: string; // Relative path to PNG file (from project root or assets)
  columns: number; // Number of columns in sprite sheet
  tileCount: number; // Total number of tiles
  tiles: Record<number, TileDefinition>; // Keyed by tile index (integer)
  wangSets?: WangSet[]; // Modern autotiling logic (Tiled-compatible)
  objects?: TilesetObjectDefinition[]; // Reusable multi-tile object definitions (trees, bushes, etc.)
}

export interface TilesetObjectDefinition {
  id: string;
  name: string;
  tiles: TilesetObjectTile[];
}

export interface TilesetObjectTile {
  x: number; // Relative tile offset from the object's top-left origin
  y: number; // Relative tile offset from the object's top-left origin
  tileIndex: number;
}

export interface TileDefinition {
  id?: string; // Optional semantic string ID (e.g. "player_spawn")
  spriteIndex?: number; // Optional index into the tileset sprite sheet
  tags?: string[]; // Semantic tags (e.g. ["walkable", "water"])
  collision?: CollisionDefinition;
  properties?: PropertyInstance[];
  terrain?: string; // Optional terrain id referencing a WangColor or terrain set
  probability?: number; // Optional placement probability weight for random tile selection (relative weight)
  // Tile-heights from this tile to the ground contact. Used on Y-sorted layers:
  // depth = worldY + pivotY * tileSize. Default 1 (this tile IS the ground tile).
  // For tiles above the ground (e.g. tree crown 3 rows up): set pivotY = 3 so
  // sort depth = this tile's worldY + 3*tileSize = the actual ground line.
  pivotY?: number;
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

export interface Map extends NamedEditorResource {
  version: number;
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
  // Source trigger — references a MapTrigger on this map.
  triggerId: string;
  // Target map id.
  targetMapId: string;
  // Arrival anchor on the target map. Its position/facing define the landing.
  targetAnchorId: string;
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
  // Sorting layer governs how visual/tile layers are sorted at runtime.
  // 'ground' uses the layer's fixed zOrder; 'above' always renders on top.
  sortingLayer?: SortingLayer;
  icon?: string; // Optional icon identifier
  // For tile-like layers this holds encoded tile IDs, row-major [y][x]
  data?: (number | null)[][]; // Encoded tile IDs (tiles only)
  // For Y-sorted object layers: connected painted tiles stored as first-class groups.
  objectGroups?: ObjectGroup[];
  // Explicit placed object instances for object layers.
  objectInstances?: MapObjectInstance[];

  // For terrain layers: parallel grid storing the terrain ID painted at each cell.
  // Used to re-resolve tile graphics when terrain rules change.
  terrainData?: (string | null)[][];

  // For layers that represent entities (entity layers), store instances here
  entities?: EntityInstance[];
  definitionId?: string; // Reference to LayerDefinition (if from project template)
}

export type SortingLayer = 'ground' | 'above';

export interface ObjectGroup {
  id: string;
  tiles: ObjectGroupTile[];
}

export interface ObjectGroupTile {
  x: number;
  y: number;
  tilesetId: string;
  tileIndex: number;
}

export interface MapObjectInstance {
  id: string;
  tilesetId: string;
  objectDefinitionId: string;
  x: number; // Pixel X coordinate of the object's top-left origin; may be negative for overhangs
  y: number; // Pixel Y coordinate of the object's top-left origin; may be negative for overhangs
}

export type LayerKind =
  | 'visual' // Rendered tile layers
  | 'object' // Placed reusable object instances
  | 'collision' // Collision data
  | 'navigation' // Combined layer for anchors, triggers, and location links
  | 'metadata' // Data-only, invisible
  | 'entity' // Layer that contains entities (EntityInstance[])
  | 'terrain'; // Terrain-painted layer (autotiled)

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
  triggers?: MapTrigger[];
  collisions?: MapCollision[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Map Triggers — collision-less zones that fire game events
// ─────────────────────────────────────────────────────────────────────────────

export type TriggerType = 'locationLinkTrigger';

export type TriggerShape = 'rectangle' | 'polygon';

export interface MapTrigger {
  id: string;
  label?: string;
  type: TriggerType;
  shape: TriggerShape;
  // Rectangle: [x, y] origin + width/height via size.  Polygon: list of absolute pixel vertices.
  position: [number, number]; // Pixel coords [x, y] — top-left for rect, first vertex for polygon
  size?: [number, number]; // Pixel [width, height] — only for rectangle shape
  points?: [number, number][]; // Absolute pixel vertices — only for polygon shape
  tags?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Map Collisions — physics collider shapes stored as spatial primitives
// ─────────────────────────────────────────────────────────────────────────────

export type MapCollisionShape = 'rectangle' | 'polygon' | 'circle';

export interface MapCollision {
  id: string;
  label?: string;
  shape: MapCollisionShape;
  position: [number, number]; // top-left for rect, center for circle, first vertex for polygon
  size?: [number, number]; // rectangle only: [width, height]
  radius?: number; // circle only
  points?: [number, number][]; // polygon only: absolute pixel vertices
  tags?: string[];
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
  position: [number, number]; // Pixel coordinates [x, y]
  facing?: [number, number]; // Normalized facing vector
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
  world?: WorldMapMetadata;
  entryPoints?: { id: string; position: [number, number] }[];
  exitPoints?: {
    id: string;
    targetMap: string;
    targetPosition: [number, number];
  }[];
}

export interface WorldMapMetadata {
  included?: boolean;
  x?: number;
  y?: number;
  category?: 'world' | 'indoor' | 'special';
}

// Game Variable Definitions — named runtime values exposed to the Lua sandbox
export type GameVariableType = 'boolean' | 'number' | 'string' | 'enum' | 'table';

/** A primitive field inside a table. No nesting beyond this. */
export interface TableField {
  key: string; // Field name within the table
  type: 'boolean' | 'number' | 'string' | 'enum';
  description?: string;
  defaultValue: boolean | number | string;
  enumValues?: string[]; // Only when type === 'enum'
}

/** A reusable table definition with named fields. */
export interface ScriptTable {
  id: string;
  name: string; // Lua-accessible name (e.g. "npcData", "questEntry")
  description?: string;
  fields: TableField[];
}

export interface GameVariable extends KeyedEditorResource {
  key: string; // Dotted Lua path, e.g. "weather.isRain" or "date.season"
  type: GameVariableType;
  category: string; // Grouping label, e.g. "Weather", "Date", "Game State"
  description?: string;
  // For primitive types:
  defaultValue: boolean | number | string;
  enumValues?: string[]; // Only used when type === 'enum'
  // For table type — reference a ScriptTable by ID:
  tableId?: string; // Only used when type === 'table'
  // Legacy: inline complex fields (migrated to tableId)
  complexFields?: TableField[];
}

// ─── Scripting Primitives ────────────────────────────────────────────────────
// Shared building blocks for global functions, namespaces, and context types.

export type ScriptPrimitiveType = 'boolean' | 'number' | 'string' | 'enum' | 'table' | 'void';

export interface ScriptParam {
  name: string;
  type: ScriptPrimitiveType;
  description?: string;
  enumValues?: string[]; // Only when type === 'enum'
}

/** A callable function exposed to the Lua sandbox. */
export interface ScriptFunction {
  id: string;
  name: string; // Lua-callable name (e.g. "wait", "pan")
  description?: string;
  params: ScriptParam[];
  returnType: ScriptPrimitiveType; // 'void' = no return
  returnTableId?: string; // Only used when returnType === 'table'
}

/** A singleton table-like namespace (e.g. weather, camera, audio). */
export interface ScriptNamespace {
  id: string;
  name: string; // Lua global name (e.g. "weather")
  description?: string;
  fields: GameVariable[]; // Same shape as registry variables
  functions: ScriptFunction[];
}

/**
 * Defines the shape of `self` for a script execution context
 * (e.g. npc, cutscene, dialogue). Not accessible by name in Lua —
 * injected as `self` by the runtime.
 */
export interface ScriptContextType {
  id: string;
  name: string; // e.g. "npc", "cutscene"
  description?: string;
  fields: GameVariable[];
  functions: ScriptFunction[];
}

// Item Definitions

/** A reusable template that adds extra property definitions to items of a given class. */
export interface ItemClass {
  id: string; // Unique identifier (kebab-case)
  name: string; // Display name (e.g. "Seed", "Weapon", "Equipment")
  description?: string;
  properties: PropertyDefinition[]; // Extra properties for items of this class
}

export interface Item extends NamedEditorResource {
  category: string; // Category grouping (e.g. "Consumable", "Weapon")
  icon: string; // Relative path to icon image (from project assets)
  description: string; // Long description shown to the player
  maxStackSize: number; // Maximum stack size in inventory (default 99)
  pickupSound?: string; // Relative path to pickup audio clip (optional)
  classId?: string; // Optional reference to an ItemClass id
  classProperties?: PropertyValues; // Values for the extra properties defined by the assigned ItemClass
}

// Actor Definitions
export interface Actor extends NamedEditorResource {
  icon: string; // Emoji icon for display
  emotions?: string[]; // Named emotions available for line nodes
}

export interface DialogueType {
  id: string;
  name: string;
  description?: string;
  contextTypeId?: string;
}

export interface DialogueNodeEditorMeta {
  branchId?: string;
  parentChoiceNodeId?: string;
  parentOptionId?: string;
  branchOrder?: number;
}

export type DialogueNodeType = 'line' | 'choice' | 'action' | 'jump' | 'comment' | 'end';

export interface DialogueNodeBase {
  id: string;
  type: DialogueNodeType;
  editor?: DialogueNodeEditorMeta;
}

export interface DialogueLineNode extends DialogueNodeBase {
  type: 'line';
  speaker?: string;
  emotion?: string;
  text: string;
  msgKey: string;
  next?: string | null;
}

export interface DialogueChoiceOption {
  id: string;
  text: string;
  msgKey: string;
  condition?: string | null;
  targetNodeId: string;
}

export interface DialogueChoiceNode extends DialogueNodeBase {
  type: 'choice';
  options: DialogueChoiceOption[];
}

export interface DialogueActionNode extends DialogueNodeBase {
  type: 'action';
  lua: string;
  next?: string | null;
}

export interface DialogueJumpNode extends DialogueNodeBase {
  type: 'jump';
  targetDialogueId?: string | null;
  targetNodeId: string;
}

export interface DialogueCommentNode extends DialogueNodeBase {
  type: 'comment';
  text: string;
}

export interface DialogueEndNode extends DialogueNodeBase {
  type: 'end';
}

export type DialogueNode =
  | DialogueLineNode
  | DialogueChoiceNode
  | DialogueActionNode
  | DialogueJumpNode
  | DialogueCommentNode
  | DialogueEndNode;

export interface DialogueI18nMessage {
  msgKey: string;
  text: string;
  nodeId: string;
  sourceType: 'line' | 'choiceOption';
  optionId?: string;
}

export interface DialogueI18nExport {
  dialogueId: string;
  dialogueName: string;
  generatedAt: string;
  messages: DialogueI18nMessage[];
}

export interface DialogueDocument extends NamedEditorResource {
  version: number;
  oneShot: boolean;
  dialogueTypeId?: string;
  startNodeId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  nodes: DialogueNode[];
}

// Entity Type Definitions
export interface EntityType extends DisplayNamedEditorResource {
  category: EntityCategory;
  description?: string;
  icon?: string; // Emoji or icon identifier for display
  group?: string; // Grouping label (e.g., "Actors", "Interactables")
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
