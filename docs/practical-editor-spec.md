# Pixel World Level Editor - Complete Specification

## Document Overview

This is the complete specification for a browser-based 2D tile map editor for Unity-based pixel art games. The editor is built with React, Tailwind CSS, and HTML5 Canvas.

**Version:** 1.0  
**Target Framework:** React 18+ with TypeScript  
**Styling:** Tailwind CSS 3+  
**Rendering:** HTML5 Canvas (2D context)

---

# Part 1: Core Principles & Scope

## 1.1 Purpose

The Pixel World Level Editor is a **spatial data authoring tool** for creating tile-based game worlds. It enables:

- Designers to create and edit maps visually
- Modders to add custom content without touching Unity
- Teams to iterate quickly on level design
- Deterministic export to Unity-consumable formats

## 1.2 What This Editor IS

✅ A 2D tile map editor  
✅ A structured data authoring tool  
✅ A spatial geometry editor (tiles, entities, paths, areas)  
✅ A content validation tool  
✅ A file-based, offline-first application  

## 1.3 What This Editor IS NOT

❌ A game engine  
❌ A simulation or preview runtime  
❌ A visual scripting system  
❌ A Unity replacement  
❌ An animation editor  
❌ A tileset drawing tool (use external image editors)  

## 1.4 Core Architecture Principle

**Editor responsibilities:**
- Define WHAT exists and WHERE it exists
- Validate data correctness
- Export structured, typed data

**Unity responsibilities:**
- Define HOW things behave
- Implement game logic
- Run simulations
- Execute AI and schedules

**The boundary is absolute.** No editor logic leaks into runtime, no runtime logic exists in the editor.

---

# Part 2: Data Model & File Formats

## 2.1 Project Structure

A project is a folder containing all map data, tilesets, and assets.

```
my-game-project/
├── project.json                 # Project metadata
├── tilesets/
│   ├── grassland.tileset.json  # Tileset definitions
│   ├── dungeon.tileset.json
│   └── town.tileset.json
├── maps/
│   ├── overworld.map.json      # Map data
│   ├── town.map.json
│   └── dungeon_01.map.json
└── assets/
    ├── grassland.png           # Sprite sheets
    ├── dungeon.png
    └── entities.png
```

## 2.2 Project File Format

**File:** `project.json`

```typescript
interface Project {
  version: number              // File format version (starts at 1)
  name: string                 // Display name
  tileSize: number             // Tile dimensions in pixels (e.g., 16)
  defaultMapWidth: number      // Default new map width in tiles
  defaultMapHeight: number     // Default new map height in tiles
  metadata?: {
    author?: string
    description?: string
    created?: string           // ISO date string
    modified?: string          // ISO date string
  }
}
```

**Example:**
```json
{
  "version": 1,
  "name": "My Pixel Game",
  "tileSize": 16,
  "defaultMapWidth": 32,
  "defaultMapHeight": 32,
  "metadata": {
    "author": "Game Designer",
    "description": "Main game project",
    "created": "2026-01-15T10:00:00Z"
  }
}
```

## 2.3 Tileset File Format

**File:** `tilesets/{name}.tileset.json`

```typescript
interface Tileset {
  version: number
  id: string                   // Unique identifier (kebab-case)
  name: string                 // Display name
  spriteSheet: string          // Relative path to PNG file
  tileWidth: number            // Width in pixels
  tileHeight: number           // Height in pixels
  columns: number              // Number of columns in sprite sheet
  tileCount: number            // Total number of tiles
  tiles: TileDefinition[]
  terrainDefinitions?: TerrainDefinition[]  // Optional, Phase 2
}

interface TileDefinition {
  id: string                   // Stable identifier (e.g., "grass_01")
  spriteIndex: number          // Position in sprite sheet (row * columns + col)
  tags: string[]               // Semantic tags (e.g., ["walkable", "grass"])
  collision: CollisionType
  metadata?: Record<string, any>  // Custom key-value data
}

type CollisionType = "none" | "full" | "partial"

interface TerrainDefinition {
  id: string
  name: string
  matchMode: "edge" | "corner" | "blob"
  tiles: TerrainTile[]
}

interface TerrainTile {
  tileId: string
  edges?: number               // Bitmask for edge matching
  corners?: number             // Bitmask for corner matching
}
```

**Example:**
```json
{
  "version": 1,
  "id": "grassland",
  "name": "Grassland Tileset",
  "spriteSheet": "../assets/grassland.png",
  "tileWidth": 16,
  "tileHeight": 16,
  "columns": 16,
  "tileCount": 256,
  "tiles": [
    {
      "id": "grass_01",
      "spriteIndex": 0,
      "tags": ["walkable", "grass", "natural"],
      "collision": "none"
    },
    {
      "id": "wall_stone",
      "spriteIndex": 10,
      "tags": ["solid", "stone"],
      "collision": "full"
    },
    {
      "id": "water_01",
      "spriteIndex": 20,
      "tags": ["water", "natural"],
      "collision": "none",
      "metadata": {
        "swimmable": true,
        "fishable": true
      }
    }
  ]
}
```

**Tileset Resolution Rules:**

1. Tile IDs are stable identifiers, never raw indices
2. Same tile ID across different tilesets = semantic equivalence
3. Sprite indices may differ between tilesets (e.g., base vs. winter variant)

## 2.4 Map File Format

**File:** `maps/{name}.map.json`

```typescript
interface Map {
  version: number
  id: string                   // Unique identifier
  name: string                 // Display name
  width: number                // Width in tiles
  height: number               // Height in tiles
  baseTilesetId: string        // Reference to tileset
  layers: Layer[]
  entities: EntityInstance[]
  spatialPrimitives?: SpatialPrimitives  // Optional paths/areas/anchors
  variations?: Variation[]     // Optional seasonal/contextual variants
  metadata?: MapMetadata
}

interface Layer {
  id: string                   // Unique within map
  name: string                 // Display name
  kind: LayerKind
  visible: boolean
  locked: boolean              // Prevent editing
  opacity: number              // 0.0 to 1.0
  zOrder: number               // Rendering order
  data: (string | null)[][]    // Tile IDs, row-major [y][x]
}

type LayerKind = 
  | "visual"        // Rendered tiles
  | "collision"     // Collision data
  | "navigation"    // Pathfinding hints
  | "metadata"      // Data-only, invisible

interface EntityInstance {
  id: string                   // Unique within map
  typeId: string               // Reference to entity type definition
  position: [number, number]   // Tile coordinates [x, y]
  rotation?: number            // Degrees, 0-360
  properties: Record<string, any>
  tags?: string[]
}

interface SpatialPrimitives {
  paths?: Path[]
  areas?: Area[]
  anchors?: Anchor[]
}

interface Path {
  id: string
  name: string
  points: [number, number][]   // Tile coordinates
  closed: boolean              // Connect last to first
  width?: number               // Path width in tiles
  tags: string[]
}

interface Area {
  id: string
  name: string
  shape: "rectangle" | "polygon"
  points: [number, number][]   // Tile coordinates
  priority: number             // Overlapping area resolution
  tags: string[]
}

interface Anchor {
  id: string
  name: string
  position: [number, number]   // Tile coordinates
  rotation?: number            // Degrees
  tags: string[]
}

interface Variation {
  id: string
  kind: "season" | "generic"
  displayName: string
  parentId?: string            // Variation inheritance
  tilesetSuffix?: string       // e.g., "_winter"
  layerOverrides?: Record<string, LayerOverride>
  entityOverrides?: EntityOverride[]
  metadata?: Record<string, any>
}

interface LayerOverride {
  data: (string | null)[][]    // Sparse or full replacement
  mode: "replace" | "merge"    // How to apply override
}

interface EntityOverride {
  action: "add" | "remove" | "modify"
  entityId?: string            // For remove/modify
  entity?: EntityInstance      // For add/modify
}

interface MapMetadata {
  description?: string
  music?: string
  ambience?: string
  entryPoints?: { id: string; position: [number, number] }[]
  exitPoints?: { id: string; targetMap: string; targetPosition: [number, number] }[]
}
```

**Example:**
```json
{
  "version": 1,
  "id": "town_square",
  "name": "Town Square",
  "width": 32,
  "height": 32,
  "baseTilesetId": "grassland",
  "layers": [
    {
      "id": "ground",
      "name": "Ground",
      "kind": "visual",
      "visible": true,
      "locked": false,
      "opacity": 1.0,
      "zOrder": 0,
      "data": [
        ["grass_01", "grass_01", "grass_01"],
        ["grass_01", "path_01", "grass_01"],
        ["grass_01", "grass_01", "grass_01"]
      ]
    },
    {
      "id": "collision",
      "name": "Collision",
      "kind": "collision",
      "visible": false,
      "locked": false,
      "opacity": 0.5,
      "zOrder": 100,
      "data": [
        [null, null, null],
        [null, null, null],
        [null, "wall_stone", null]
      ]
    }
  ],
  "entities": [
    {
      "id": "chest_001",
      "typeId": "chest",
      "position": [5, 10],
      "properties": {
        "locked": false,
        "lootTable": "common_chest"
      }
    },
    {
      "id": "door_001",
      "typeId": "door",
      "position": [16, 8],
      "properties": {
        "targetMap": "house_interior",
        "targetX": 5,
        "targetY": 10,
        "locked": false
      }
    }
  ],
  "variations": [
    {
      "id": "winter",
      "kind": "season",
      "displayName": "Winter",
      "tilesetSuffix": "_winter"
    },
    {
      "id": "winter_festival",
      "kind": "generic",
      "displayName": "Winter Festival",
      "parentId": "winter",
      "entityOverrides": [
        {
          "action": "add",
          "entity": {
            "id": "tree_001",
            "typeId": "decoration_tree",
            "position": [16, 16],
            "properties": { "decorated": true }
          }
        }
      ]
    }
  ],
  "metadata": {
    "description": "Central town gathering area",
    "music": "town_theme",
    "entryPoints": [
      { "id": "north_entrance", "position": [16, 0] }
    ]
  }
}
```

## 2.5 Entity Type Definitions

**Phase 1: Hardcoded in TypeScript**  
**Phase 2: External JSON file**

```typescript
interface EntityType {
  id: string                   // Unique identifier
  category: EntityCategory
  displayName: string
  description?: string
  placeholderColor: string     // Hex color for editor rendering
  placeholderIcon?: string     // Optional icon identifier
  properties: PropertyDefinition[]
  defaultSize?: [number, number]  // Tile dimensions [width, height]
}

type EntityCategory = 
  | "object"       // Physical world objects
  | "trigger"      // Invisible trigger zones
  | "spawn"        // Spawn points
  | "transition"   // Map transitions
  | "decoration"   // Visual-only elements

interface PropertyDefinition {
  key: string
  label: string
  type: PropertyType
  defaultValue: any
  required: boolean
  description?: string
  constraints?: PropertyConstraints
}

type PropertyType = 
  | "string"
  | "number"
  | "boolean"
  | "enum"
  | "color"
  | "reference"    // Reference to another entity or asset

interface PropertyConstraints {
  min?: number             // For numbers
  max?: number             // For numbers
  pattern?: string         // Regex for strings
  options?: string[]       // For enums
  referenceType?: string   // For references
}
```

**Example Entity Type Definitions:**

```typescript
const ENTITY_TYPES: EntityType[] = [
  {
    id: "chest",
    category: "object",
    displayName: "Chest",
    description: "Interactable storage container",
    placeholderColor: "#8B4513",
    defaultSize: [1, 1],
    properties: [
      {
        key: "locked",
        label: "Locked",
        type: "boolean",
        defaultValue: false,
        required: true,
        description: "Whether the chest is locked"
      },
      {
        key: "lootTable",
        label: "Loot Table",
        type: "string",
        defaultValue: "common_chest",
        required: true,
        description: "ID of the loot table to use"
      },
      {
        key: "respawns",
        label: "Respawns",
        type: "boolean",
        defaultValue: false,
        required: false
      }
    ]
  },
  {
    id: "door",
    category: "transition",
    displayName: "Door",
    placeholderColor: "#654321",
    defaultSize: [1, 2],
    properties: [
      {
        key: "targetMap",
        label: "Target Map",
        type: "string",
        defaultValue: "",
        required: true
      },
      {
        key: "targetX",
        label: "Target X",
        type: "number",
        defaultValue: 0,
        required: true,
        constraints: { min: 0 }
      },
      {
        key: "targetY",
        label: "Target Y",
        type: "number",
        defaultValue: 0,
        required: true,
        constraints: { min: 0 }
      },
      {
        key: "locked",
        label: "Locked",
        type: "boolean",
        defaultValue: false,
        required: false
      },
      {
        key: "keyRequired",
        label: "Key Required",
        type: "string",
        defaultValue: "",
        required: false
      }
    ]
  },
  {
    id: "npc_spawn",
    category: "spawn",
    displayName: "NPC Spawn Point",
    placeholderColor: "#4169E1",
    defaultSize: [1, 1],
    properties: [
      {
        key: "npcId",
        label: "NPC ID",
        type: "string",
        defaultValue: "",
        required: true
      },
      {
        key: "facing",
        label: "Initial Facing",
        type: "enum",
        defaultValue: "south",
        required: true,
        constraints: {
          options: ["north", "south", "east", "west"]
        }
      }
    ]
  },
  {
    id: "trigger_zone",
    category: "trigger",
    displayName: "Trigger Zone",
    placeholderColor: "#FF69B4",
    defaultSize: [2, 2],
    properties: [
      {
        key: "triggerId",
        label: "Trigger ID",
        type: "string",
        defaultValue: "",
        required: true
      },
      {
        key: "oneShot",
        label: "One Shot",
        type: "boolean",
        defaultValue: false,
        required: false,
        description: "Trigger only fires once"
      }
    ]
  },
  {
    id: "decoration_tree",
    category: "decoration",
    displayName: "Tree",
    placeholderColor: "#228B22",
    defaultSize: [2, 3],
    properties: [
      {
        key: "variant",
        label: "Tree Variant",
        type: "enum",
        defaultValue: "oak",
        required: true,
        constraints: {
          options: ["oak", "pine", "birch", "willow"]
        }
      },
      {
        key: "decorated",
        label: "Decorated",
        type: "boolean",
        defaultValue: false,
        required: false
      }
    ]
  }
]
```

---

# Part 3: Editor State Architecture

## 3.1 Global Editor State

The editor uses a centralized state management approach (React Context or Zustand).

```typescript
interface EditorState {
  // Project data
  project: Project | null
  projectPath: string | null           // Folder path or null if unsaved
  
  // Assets
  tilesets: Map<string, Tileset>       // Keyed by tileset.id
  loadedSprites: Map<string, HTMLImageElement>  // Keyed by sprite path
  
  // Current editing context
  currentMap: Map | null
  currentMapPath: string | null
  
  // Variation & temporal context
  activeVariation: string | null       // null = base
  timePreviewEnabled: boolean
  timeOfDay: number                    // 0.0 to 1.0, normalized
  
  // Selection & active tool
  activeTool: ToolType
  selectedLayerId: string | null
  selectedTileId: string | null        // For tile painting
  selectedEntityTypeId: string | null  // For entity placement
  selectedEntityIds: Set<string>       // Currently selected entities
  
  // Camera
  camera: {
    x: number                          // Pan offset X in pixels
    y: number                          // Pan offset Y in pixels
    zoom: number                       // Zoom level (0.5 = 50%, 2.0 = 200%)
  }
  
  // UI state
  panels: {
    layersOpen: boolean
    tilesetPaletteOpen: boolean
    entitiesOpen: boolean
    inspectorOpen: boolean
    variationsOpen: boolean
  }
  
  // Validation
  validationErrors: ValidationError[]
}

type ToolType = 
  | "select"
  | "tilePaint"
  | "tileErase"
  | "tileFill"        // Phase 2
  | "entityPlace"
  | "entitySelect"
  | "pathDraw"        // Phase 2
  | "areaDraw"        // Phase 2
  | "anchorPlace"     // Phase 2

interface ValidationError {
  severity: "error" | "warning"
  message: string
  location?: {
    mapId?: string
    layerId?: string
    entityId?: string
    position?: [number, number]
  }
}
```

## 3.2 State Management Pattern

**Recommended: Zustand with Immer**

```typescript
import create from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface EditorStore extends EditorState {
  // Actions
  loadProject: (path: string) => Promise<void>
  saveProject: () => Promise<void>
  createNewMap: (name: string, width: number, height: number) => void
  setCurrentMap: (mapId: string) => void
  
  // Tool actions
  setActiveTool: (tool: ToolType) => void
  
  // Tile actions
  paintTile: (layerId: string, x: number, y: number, tileId: string) => void
  eraseTile: (layerId: string, x: number, y: number) => void
  
  // Entity actions
  placeEntity: (entity: Omit<EntityInstance, 'id'>) => void
  removeEntity: (entityId: string) => void
  updateEntityProperties: (entityId: string, properties: Record<string, any>) => void
  
  // Layer actions
  addLayer: (layer: Omit<Layer, 'id'>) => void
  removeLayer: (layerId: string) => void
  reorderLayer: (layerId: string, newZOrder: number) => void
  toggleLayerVisibility: (layerId: string) => void
  
  // Variation actions
  setActiveVariation: (variationId: string | null) => void
  addVariation: (variation: Variation) => void
  
  // Camera actions
  setCamera: (camera: Partial<EditorState['camera']>) => void
  resetCamera: () => void
  
  // Validation
  validate: () => ValidationError[]
}

const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    // Initial state
    project: null,
    projectPath: null,
    tilesets: new Map(),
    loadedSprites: new Map(),
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
    
    // Actions
    paintTile: (layerId, x, y, tileId) => set(state => {
      const layer = state.currentMap?.layers.find(l => l.id === layerId)
      if (layer && layer.data[y] && !layer.locked) {
        layer.data[y][x] = tileId
      }
    }),
    
    // ... other actions
  }))
)
```

## 3.3 Undo/Redo System (Phase 2)

**Approach: Command Pattern**

```typescript
interface Command {
  execute: () => void
  undo: () => void
  description: string
}

interface UndoRedoState {
  history: Command[]
  currentIndex: number
  maxHistory: number  // e.g., 100
}

// Example command
class PaintTileCommand implements Command {
  constructor(
    private layerId: string,
    private x: number,
    private y: number,
    private newTileId: string,
    private oldTileId: string | null
  ) {}
  
  execute() {
    // Paint tile logic
  }
  
  undo() {
    // Restore old tile
  }
  
  description = `Paint tile at (${this.x}, ${this.y})`
}
```

---

# Part 4: Variation System

## 4.1 Variation Concepts

**Variations** allow the same map to have contextual or seasonal alternatives without duplicating data.

### Variation Types

1. **Seasonal Variations** (first-class)
   - Predefined: Spring, Summer, Autumn, Winter
   - Rendered as segmented UI buttons
   - May affect tileset resolution via suffix
   - Can interact with time-of-day preview

2. **Generic Variations**
   - User-defined contextual states
   - Examples: festival, post_disaster, quest_complete
   - Rendered in dropdown selector
   - Static (no time interaction)

### Variation Inheritance

Variations can inherit from a parent variation, forming a single chain:

```
base (implicit root)
  ↓
spring (seasonal)
  ↓
spring_festival (generic)
  ↓
spring_festival_night (generic)
```

**Rules:**
- Maximum one parent per variation
- No cycles allowed
- Inheritance depth should stay shallow (recommend max 3 levels)
- Root variations (no parent) are typically seasonal

## 4.2 Resolution Algorithm

When a variation is active, data is resolved top-down through the inheritance chain.

**For tiles:**
1. Check active variation's layerOverrides
2. If not found, check parent variation
3. Recurse to root
4. Fall back to base layer data

**For tilesets:**
1. Try `baseTilesetId + activeVariation.tilesetSuffix`
2. Try `baseTilesetId + parentVariation.tilesetSuffix`
3. Fall back to `baseTilesetId`

**For entities:**
1. Apply entity overrides from active variation
2. Apply parent variation overrides
3. Use base entity list

### Example Resolution

**Map:** town_square  
**Base Tileset:** grassland  
**Active Variation:** spring_festival (parent: spring)  

**Variation Definitions:**
- `spring`: tilesetSuffix = "_spring"
- `spring_festival`: tilesetSuffix = "_festival" (optional)

**Tileset Resolution Order:**
1. `grassland_festival` (not found)
2. `grassland_spring` (found ✓)
3. Use `grassland_spring`

**If grassland_spring didn't exist:**
1. `grassland_festival` (not found)
2. `grassland_spring` (not found)
3. `grassland` (base, always exists)

## 4.3 Editor UX for Variations

### UI Layout

```
┌─────────────────────────────────────┐
│ Variations Panel                    │
├─────────────────────────────────────┤
│ Season:                             │
│ [Spring][Summer][Autumn][Winter]    │  ← Segmented buttons
│                                     │
│ Variant:                            │
│ [Base ▼]                            │  ← Dropdown
│   Base                              │
│   Spring Festival                   │
│   After Storm                       │
└─────────────────────────────────────┘
```

### Interaction Rules

1. Selecting a season activates that seasonal variation
2. Variant dropdown shows children of active season
3. "Base" in dropdown = no variation active
4. When editing with variation active:
   - Changes write to that variation's overrides
   - Non-overridden content shows inherited data
   - Visual indicators (subtle highlight) show overridden tiles/entities

### Creating New Variations

```typescript
interface CreateVariationDialog {
  name: string
  kind: "season" | "generic"
  parent?: string              // Optional parent variation ID
  tilesetSuffix?: string       // Optional tileset suffix
}

// Validation rules:
// - Name must be unique within map
// - Parent must exist if specified
// - Seasonal variations cannot have non-seasonal parents
// - No circular inheritance
```

## 4.4 Variation Data Overrides

### Layer Overrides

```typescript
interface LayerOverride {
  data: (string | null)[][]
  mode: "replace" | "sparse"
}
```

**Replace Mode:**
- Entire layer is replaced
- Dimensions must match base layer

**Sparse Mode (Phase 2):**
- Only specified cells override base
- More efficient for small changes

### Entity Overrides

```typescript
interface EntityOverride {
  action: "add" | "remove" | "modify"
  entityId?: string            // Required for remove/modify
  entity?: EntityInstance      // Required for add, optional for modify
}
```

**Add:** New entity only visible in this variation  
**Remove:** Hide base entity in this variation  
**Modify:** Change properties of base entity  

### Metadata Overrides

Variations can also override map metadata:

```typescript
interface VariationMetadataOverride {
  music?: string
  ambience?: string
  description?: string
}
```

---

# Part 5: Time-of-Day Preview System (Optional/Phase 2)

## 5.1 Purpose

The time-of-day preview system allows designers to visualize time-dependent content without simulating game time.

**Not a simulation.** This is a **preview context** only.

## 5.2 Time Context

```typescript
interface TimeContext {
  enabled: boolean             // Preview on/off
  timeOfDay: number            // 0.0 to 1.0 (midnight to midnight)
  discretePhase?: TimePhase    // Optional named phase
}

type TimePhase = "dawn" | "morning" | "day" | "evening" | "dusk" | "night"

// Phase mappings (configurable):
const TIME_PHASES = {
  dawn: [0.20, 0.25],      // 4:48 AM - 6:00 AM
  morning: [0.25, 0.42],   // 6:00 AM - 10:00 AM
  day: [0.42, 0.67],       // 10:00 AM - 4:00 PM
  evening: [0.67, 0.79],   // 4:00 PM - 7:00 PM
  dusk: [0.79, 0.83],      // 7:00 PM - 8:00 PM
  night: [0.83, 1.20]      // 8:00 PM - 4:48 AM (wraps)
}
```

## 5.3 Time-Scoped Entities

Entities can declare time constraints:

```typescript
interface EntityInstance {
  // ... other fields
  timeScope?: TimeScope
}

interface TimeScope {
  startTime: number          // 0.0 to 1.0
  endTime: number            // 0.0 to 1.0 (can wrap, e.g., 0.9 to 0.1)
  seasons?: string[]         // Optional: only visible in these seasons
}
```

**Visibility Logic:**

```typescript
function isEntityVisible(entity: EntityInstance, context: TimeContext): boolean {
  if (!context.enabled) {
    // Time preview OFF: show all non-scoped entities
    return entity.timeScope === undefined
  }
  
  if (!entity.timeScope) {
    // Always visible if not scoped
    return true
  }
  
  const { startTime, endTime } = entity.timeScope
  const time = context.timeOfDay
  
  // Handle time range wrapping (e.g., 8 PM to 4 AM)
  if (startTime <= endTime) {
    return time >= startTime && time <= endTime
  } else {
    return time >= startTime || time <= endTime
  }
}
```

## 5.4 Onion View (Phase 2)

For selected entities with time scopes, show translucent "ghost" positions before/after current time.

```typescript
interface OnionViewSettings {
  enabled: boolean
  windowSize: number           // Hours before/after (e.g., 2 hours)
  stepSize: number             // Time step for ghosts (e.g., 0.5 hours)
  opacity: number              // Ghost opacity (0.0 to 1.0)