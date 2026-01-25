
export interface Project {
    version: string;              // File format version (starts at 1.0)
    name: string;                 // Display name
    tileSize: number;             // Tile dimensions in pixels (e.g., 16)
    defaultMapWidth: number;      // Default new map width in tiles
    defaultMapHeight: number;     // Default new map height in tiles
    metadata?: {
        author?: string;
        description?: string;
        created?: string;           // ISO date string
        modified?: string;          // ISO date string
    };
}

export interface Tileset {
    version: number;
    id: string;                   // Unique identifier (kebab-case)
    name: string;                 // Display name
    spriteSheet: string;          // Relative path to PNG file (from project root or assets)
    tileWidth: number;            // Width in pixels
    tileHeight: number;           // Height in pixels
    columns: number;              // Number of columns in sprite sheet
    tileCount: number;            // Total number of tiles
    tiles: Record<number, TileDefinition>; // Keyed by tile index (integer)
    wangSets?: WangSet[];         // Modern autotiling logic (Tiled-compatible)
}

export interface TileDefinition {
    id?: string;                  // Optional semantic string ID (e.g. "player_spawn")
    tags?: string[];              // Semantic tags (e.g. ["walkable", "water"])
    collision?: CollisionDefinition;
    properties?: PropertyInstance[];
}

export interface CollisionDefinition {
    type: "none" | "full" | "complex";
    shapes?: CollisionShape[];    // Reserved for complex geometry (rects, polygons)
}

export interface CollisionShape {
    id: string;
    type: "rectangle" | "polygon" | "circle";
    points?: [number, number][];  // Local tile coordinates (0.0 to 1.0 or pixels)
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

export interface WangSet {
    id: string;
    name: string;
    type: "corner" | "edge" | "mixed";
    colors: WangColor[];
    tileMappings: Record<number, number[]>; // tileIndex -> [T, TR, R, BR, B, BL, L, TL]
}

export interface WangColor {
    id: number;                   // 1-indexed (0 is none/neutral)
    name: string;
    color: string;                // Hex color for editor visualization
    labelIcon?: string;           // Optional placeholder for terrain type
}

export interface PropertyInstance {
    key: string;
    value: any;
}

export interface Map {
    version: number;
    id: string;                   // Unique identifier
    name: string;                 // Display name
    width: number;                // Width in tiles
    height: number;               // Height in tiles
    baseTilesetId: string;        // Reference to tileset
    layers: Layer[];
    entities: EntityInstance[];
    spatialPrimitives?: SpatialPrimitives;  // Optional paths/areas/anchors
    variations?: Variation[];     // Optional seasonal/contextual variants
    metadata?: MapMetadata;
}

export interface Layer {
    id: string;                   // Unique within map
    name: string;                 // Display name
    kind: LayerKind;
    visible: boolean;
    locked: boolean;              // Prevent editing
    opacity: number;              // 0.0 to 1.0
    zOrder: number;               // Rendering order
    data: (string | null)[][];    // Tile IDs, row-major [y][x]
}

export type LayerKind =
    | "visual"        // Rendered tiles
    | "collision"     // Collision data
    | "navigation"    // Pathfinding hints
    | "metadata";      // Data-only, invisible

export interface EntityInstance {
    id: string;                   // Unique within map
    typeId: string;               // Reference to entity type definition
    position: [number, number];   // Tile coordinates [x, y]
    rotation?: number;            // Degrees, 0-360
    properties: Record<string, any>;
    tags?: string[];
    timeScope?: TimeScope;
}

export interface TimeScope {
    startTime: number;          // 0.0 to 1.0
    endTime: number;            // 0.0 to 1.0 (can wrap, e.g., 0.9 to 0.1)
    seasons?: string[];         // Optional: only visible in these seasons
}

export interface SpatialPrimitives {
    paths?: Path[];
    areas?: Area[];
    anchors?: Anchor[];
}

export interface Path {
    id: string;
    name: string;
    points: [number, number][];   // Tile coordinates
    closed: boolean;              // Connect last to first
    width?: number;               // Path width in tiles
    tags: string[];
}

export interface Area {
    id: string;
    name: string;
    shape: "rectangle" | "polygon";
    points: [number, number][];   // Tile coordinates
    priority: number;             // Overlapping area resolution
    tags: string[];
}

export interface Anchor {
    id: string;
    name: string;
    position: [number, number];   // Tile coordinates
    rotation?: number;            // Degrees
    tags: string[];
}

export interface Variation {
    id: string;
    kind: "season" | "generic";
    displayName: string;
    parentId?: string;            // Variation inheritance
    tilesetSuffix?: string;       // e.g., "_winter"
    layerOverrides?: Record<string, LayerOverride>;
    entityOverrides?: EntityOverride[];
    metadata?: Record<string, any>;
}

export interface LayerOverride {
    data: (string | null)[][];    // Sparse or full replacement
    mode: "replace" | "merge";    // How to apply override
}

export interface EntityOverride {
    action: "add" | "remove" | "modify";
    entityId?: string;            // For remove/modify
    entity?: EntityInstance;      // For add/modify
}

export interface MapMetadata {
    description?: string;
    music?: string;
    ambience?: string;
    entryPoints?: { id: string; position: [number, number] }[];
    exitPoints?: { id: string; targetMap: string; targetPosition: [number, number] }[];
}

// Entity Type Definitions
export interface EntityType {
    id: string;                   // Unique identifier
    category: EntityCategory;
    displayName: string;
    description?: string;
    placeholderColor: string;     // Hex color for editor rendering
    placeholderIcon?: string;     // Optional icon identifier
    properties: PropertyDefinition[];
    defaultSize?: [number, number];  // Tile dimensions [width, height]
}

export type EntityCategory =
    | "object"       // Physical world objects
    | "trigger"      // Invisible trigger zones
    | "spawn"        // Spawn points
    | "transition"   // Map transitions
    | "decoration";   // Visual-only elements

export interface PropertyDefinition {
    key: string;
    label: string;
    type: PropertyType;
    defaultValue: any;
    required: boolean;
    description?: string;
    constraints?: PropertyConstraints;
}

export type PropertyType =
    | "string"
    | "number"
    | "boolean"
    | "enum"
    | "color"
    | "reference";    // Reference to another entity or asset

export interface PropertyConstraints {
    min?: number;             // For numbers
    max?: number;             // For numbers
    pattern?: string;         // Regex for strings
    options?: string[];       // For enums
    referenceType?: string;   // For references
}
