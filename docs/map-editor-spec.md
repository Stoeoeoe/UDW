# Map Editor Specification & Implementation Plan

This document details the architecture and implementation requirements for the Map Editor, focusing on the complex variation system and the high-performance canvas rendering pipeline.

## 1. Core Principles
- **State-Driven Rendering**: The viewport is a pure function of the Editor State. 
- **Canvas-Only Viewport**: The level canvas, tiles, entities, and overlays are rendered using HTML5 Canvas (2D). React is used only for the editor's "frame" (panels, toolbars, menus).
- **Relational Integrity**: Maps reference Tilesets by ID. Entities reference Entity Types by ID.

---

## 2. The Variation System (Inheritance Tree)
Variations allow for non-destructive overrides of a "Base" map to support seasons, weather, or story events.

### 2.1 Variation Structure
A Map contains a list of Variations. Each variation follows a tree-like inheritance model:
- **Base Map**: The root of all data.
- **Variation**: Inherits from the Base (or another Variation) and defines specific "deltas".

### 2.2 Functional Requirements
- **Visual Swapping**: Variations can specify a `tilesetSuffix` (e.g., `_winter`). The renderer will attempt to load `{baseTilesetId}{suffix}` if it exists, swapping the entire look without changing tile data.
- **Layer Overrides**:
    - **Mode: Replace**: Variation provides a full copy of the layer data.
    - **Mode: Merge**: Variation provides a sparse grid; `null` values fall back to the parent variation/base.
- **Entity Overrides**:
    - Variations can **Add** new entities (e.g., holiday decorations).
    - Variations can **Modify** properties of existing entities (e.g., locking a house during a certain "variation").
    - Variations can **Remove** entities (masking them from view/physics).

---

## 3. Rendering Pipeline (Canvas)
The viewport must remain responsive regardless of map size.

### 3.1 Composite Rendering Loop
The renderer should follow this order for every frame:
1.  **Clear**: Fill background with the "Ugly Gray" (`#171923`) or a custom color.
2.  **Transform**: Apply `camera.zoom` and `camera.offset` (pan).
3.  **Tile Layer Stack**:
    - Resolve the active variation's final tile ID for every coordinate (traversing the inheritance tree upward).
    - Look up the resolved `TileID` in the active `Tileset`.
    - Draw sprite.
4.  **Entity Overlay**: Draw entity placeholders based on the resolved entity list for the active variation.
5.  **Spatial Primitives**: Render Paths and Areas as polylines/rects.
6.  **Tool Hints**: Render brush previews, selection marquee, or "snapping" highlights.

### 3.2 Performance Constraints
- **Culling**: Only render tiles/entities that intersect with the current `Camera` view bounds.
- **Offscreen Buffering**: For large static maps, consider rendering chunks to offscreen canvases.

---

## 4. Tool System & Interactions
Tools act on the **Active Layer** and **Active Variation**.

### 4.1 Tools
- **Select**: Inspect entities/tiles. Deep selection (drilling through variations) is supported.
- **Paint Brush**:
    - **Standard**: Paints the current `TileID`.
    - **Terrain (Smart)**: Resolves Wang/Blob logic on-the-fly and applies the resulting `TileIDs` to the layer data.
- **Entity Placer**: Places a new entity definition. In a variation, this adds an "Add Entity" override.

---

## 5. Technical Invariants
- **Coordinate Space**: Tile coordinates are the source of truth. World-space (pixel) coordinates are derived by `TileCoord * Project.tileSize`.
- **Determinism**: The state must be serializable. No "random" visual variations should be stored in the map file (though the renderer can randomize visuals based on the tile ID or coordinate).
- **Undo/Redo**: Every mutation (Add tile, move entity, change variation property) must be captured as a command.

## 6. Project & Folder Structure
- `tilesets/`: JSON definitions.
- `maps/`: JSON definitions containing `Base` + `Variations`.
- `assets/`: PNG files.

---

## 7. Next Steps for Implementation
1.  **Zustand Store Expansion**: Add `activeVariationId` and handlers for CRUD on variations.
2.  **Resolved Data Selectors**: Implement "computed" getters that resolve the final Tile/Entity data for the current variation by climbing the inheritance tree.
3.  **Canvas Viewport Component**: Replace React-heavy list-based rendering with a robust `MapCanvas` component using `requestAnimationFrame`.
