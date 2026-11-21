# Building editor — implementation plan (Vulcanus)

How to build the building editor described in [building-editor.md](building-editor.md), in Vulcanus only. Unity's
side (importing buildings) gets its own plan once the catalog unification has landed; this plan only fixes the data
Vulcanus hands to Unity (phase 8).

Each phase is one reviewable chunk: it ends with passing tests, a working editor and a commit. Phases build on each
other in order. File paths are relative to `Tools/Vulcanus/app/src` unless they start with `Schemas/` (repository root)
or `docs/`.

## Decisions this plan rests on

These were settled while designing; each is cheap to revisit before its phase starts.

| # | Decision | Why |
|---|---|---|
| D1 | A building is stored as a **plan** (size, inner walls, rooms, openings, roof). The exterior and interior images are always *composed* from the plan and the kit; nothing generated is edited by hand. | One source of truth: the inside and outside can never disagree. |
| D2 | A **kit** is a sheet image (PNG or Aseprite, flattened) in the **standard kit layout** — every piece at a fixed position — plus a descriptor JSON with a namespaced ID. A variation is an optional extra sheet in the same layout, drawn over the base (for example only the snow). Aseprite slices and variation layers are a later addition. | Works with any image editor; no slices to maintain; IDs stay stable and mod-friendly. |
| D3 | Walls are whole cells; storey 3 tiles; 45° gable roof, ridge parallel to the front; interior on the same grid. | Fixed in building-editor.md. |
| D4 | Placed buildings and interiors **produce ordinary map data** at save: collisions, triggers, anchors and location links, marked as generated. | Unity already imports these; doors and collision work without new Unity code. |
| D5 | Vulcanus **bakes** the composed images (exterior per variation, interior) next to the building at save. | Unity places images instead of re-implementing the composition rules. |
| D6 | A building with an interior map may be placed **once** in the project; buildings without one may be placed any number of times. | The interior's door must lead back to exactly one exterior. |
| D7 | First scope only: one storey, one rectangular wing, gable roof, doors, windows on the south wall, one chimney. Validation rejects anything else. | Prove the kit approach before hip roofs, L shapes and storeys. |

## Data model

### Kit descriptor — `kits/<name>.kit.json`

```json
{
  "$schema": "../../../../Schemas/building-kit.schema.json",
  "formatVersion": 1,
  "id": "base:roman_basic",
  "name": "Roman basic",
  "source": "assets/kits/kit_roman_basic.png",
  "variations": { "winter": "assets/kits/kit_roman_basic_winter.png" },
  "folderPath": ""
}
```

`source` and the variation sheets are paths relative to the project folder, like tileset sprite sheets; `.png`,
`.aseprite` and `.ase` are accepted (Aseprite files are flattened as tilesets already are). Every sheet uses the
standard kit layout (`lib/buildings/kitLayout.ts`, the layout of `docs/building-kit/kit_roman_basic.aseprite`), so a
piece's position is known from its name. A variation sheet only needs pixels where something changes.

### Building — `buildings/<name>.building.json`

```json
{
  "$schema": "../../../../Schemas/building.schema.json",
  "formatVersion": 1,
  "id": "base:farmhouse",
  "name": "Farmhouse",
  "folderPath": "",
  "kit": "base:roman_basic",
  "width": 9,
  "depth": 7,
  "innerWalls": [{ "x": 4, "y": 1, "direction": "south", "length": 5 }],
  "rooms": [
    { "id": "kitchen", "at": { "x": 2, "y": 3 }, "name": "Kitchen", "floor": "floor_tiles" },
    { "id": "bedroom", "at": { "x": 6, "y": 3 }, "name": "Bedroom", "floor": "floor_boards" }
  ],
  "openings": [
    { "id": "entrance", "kind": "door", "x": 6, "y": 6 },
    { "id": "window-1", "kind": "window", "x": 2, "y": 6 },
    { "id": "window-2", "kind": "window", "x": 7, "y": 6 },
    { "id": "inner-door", "kind": "door", "x": 4, "y": 4 }
  ],
  "chimney": { "column": 2 },
  "roof": { "kind": "gable" },
  "interiorMapId": "base:farmhouse_interior"
}
```

- `width`, `depth`: the footprint in tiles, outer walls included.
- `innerWalls`: straight runs of wall cells starting at `(x, y)` and going `east` or `south` for `length` cells.
- `rooms`: one entry per floor region; `at` is any cell inside the region, so a room keeps its identity when walls move.
  Room and opening `id`s are local IDs (`LOCAL_ID_PATTERN`) and stay stable because generated map data refers to them.
- `floor`: the name of a floor piece in the kit (`floor_*`).
- `chimney`: optional.
- `roof.kind`: only `gable` for now; the field exists because the next roof kind is already planned (hip).
- `interiorMapId`: optional; the map whose interior this building is.

### Placed building — on a map layer of kind `building`

```json
{ "id": "farmhouse-1", "buildingId": "base:farmhouse", "x": 12, "y": 8 }
```

`x`, `y` are the tile coordinates of the footprint's top-left cell. The exterior image reaches 3 rows higher (D3).

### Interior map — a normal map with a binding

```json
{ "buildingInterior": { "buildingId": "base:farmhouse" } }
```

Its `width`/`height` equal the building's `width`/`depth`; `baseTilesetId` may stay empty (the schema allows it).

---

## Phase 0 — Resource types: kits and buildings exist, load and save

Goal: `Kits` and `Buildings` appear in the explorer, can be created, renamed, deleted, saved and reloaded. Editors are
placeholders.

### Schemas (`Schemas/`)

- `building-kit.schema.json`: `formatVersion` (1), `id` (resource ID pattern), `name`, `source` (non-empty string),
  `variations` (object of variation ID → sheet path), `folderPath`; `additionalProperties: false`.
- `building.schema.json`: the shape above. Use `enum` (not `const`; NJsonSchema ignores `const`) for `roof.kind`,
  `opening.kind`, `direction`. Integers with minimums: `width ≥ 3`, `depth ≥ 5`, `length ≥ 1`, coordinates ≥ 0.
  Structural rules the schema cannot express are phase 2 validation.

### Types (`types/building.ts`)

`BuildingKit`, `Building`, `BuildingInnerWall`, `BuildingRoom`, `BuildingOpening` (`kind: 'door' | 'window'`),
`BuildingInstance`. Add `buildingInterior?: { buildingId: string }` to `Map` in `types/schema.ts`.

### Registration (follow `quest` at every point)

| File | Change |
|---|---|
| `lib/resourceRegistry.ts` | `building-kit` (`folder: 'kits'`, `.kit.json`) and `building` (`folder: 'buildings'`, `.building.json`) with `normalize` qualifying `id`, `kit`, `interiorMapId`. Extend the folder union. |
| `types/editorResource.ts` | Add `'building-kit'`, `'building'` to `editorResourceTypeIds`; create flows `'simple'` for kits, `'building'` for buildings. |
| `lib/editorResourceTypes.ts` | Two entries modelled on `quest` (label, icon, accent, save unit prefixes `building-kit:` / `building:`, rename, delete, folder path, file explorer path). Extend the document switches (`case 'quest'` at ~574, ~705, ~732). |
| `types/workspace.ts` | Documents `{ kind: 'building-kit'; kitId }` and `{ kind: 'building'; buildingId }`. |
| `lib/workspaceTree.ts`, `lib/resourceAdapters.ts` | Descriptors, sections and folder grouping for both kinds. |
| `lib/workspaceRouting.ts` | URL hash round trip (`doc=building&id=…`). |
| `lib/workspaceCommandPalette.ts` | Both kinds searchable. |
| `lib/fileSystem.ts` | `loadAllBuildingKits()`, `loadAllBuildings()` (pattern of `loadAllQuests`). |
| `store/projectLoader.ts` | Load both after tilesets, before maps (maps will reference buildings). |
| `store/slices/buildingKitSlice.ts`, `store/slices/buildingSlice.ts` | Copy the quest slice's structure: items, saved copies, history with the 800 ms merge, `add/update/delete/save/discard/undo/redo/reset`, `issues` set by `check…` on save (phase 2 fills in validation). |
| `store/useEditorStore.ts` | Wire both slices; undo/redo routing for the two document kinds. |
| `components/navigation/WorkspaceContextMenu.tsx`, `lib/buildings/newBuilding.ts` | Both use the simple ID-and-name create flow. A new building is a 9 × 7 shell (one room, an entrance in the south wall) using the first kit, if any; the kit is chosen in the building editor (phase 3). A new kit has no sheet until one is chosen in the kit editor (phase 1). |
| `components/workspace/WorkspaceDocumentViews.tsx`, `documentPresentation.ts` | Route the two kinds to placeholder editors; `layout: 'canvas'`. |
| `components/layout/EditorHistoryActions.tsx` | Undo/redo for both kinds. |

### Tests

- `lib/resourceRegistry.test.ts`: normalization qualifies IDs and keeps local room/opening IDs.
- `store/slices/buildingSlice.test.ts`: create → save writes `buildings/<name>.building.json` with `$schema`; rename;
  delete removes the file; undo/redo/discard (mirror `questSlice.test.ts`).
- `lib/workspaceRouting.test.ts`: hash round trip for both kinds.

### Done when

A kit and a building can be created from the explorer, survive a project reload, and the explorer, command palette and
tabs show them.

---

## Phase 1 — Reading kits

Goal: a kit resolves to pieces with images per variation, and the kit editor shows them and which are empty.

### Files

- `lib/buildings/kitLayout.ts`
  - `KIT_LAYOUT`: every piece name from building-editor.md with its cell in the sheet (column, row), its role
    (`opaque` | `overlay`) and its group (roof, wall, opening, interior wall, interior opening, floor). The layout is the
    prototype kit's: 16 × 14 cells of 16 px. Floors take the cells of row 11 (`floor_boards`, `floor_tiles`, and the
    rest of the row for further floors named `floor_<n>` until a name field exists).
- `lib/buildings/resolveKit.ts`
  - `resolveKit(kit, sheets): ResolvedKit` with `pieces: Map<name, { base: ImageData; variations: Map<variationId, ImageData> }>`,
    `variationIds`, `empty: string[]` (required pieces with no pixels in the base sheet), `problems: string[]`
    (sheet smaller than the layout, unreadable file).
  - Sheets are loaded with `resolveSpriteAsset` (PNG as is, Aseprite flattened), then cropped per piece; variation
    crops without pixels are dropped, so a piece "has" a variation only where its variation sheet draws something.
- `store/slices/buildingKitSlice.ts`: `resolvedKits: Map<kitId, ResolvedKit>`, resolved on load and when a sheet file
  changes (subscribe to the asset file watcher used for tilesets).
- `components/screens/building/BuildingKitEditor.tsx`
  - `EditorDocumentFrame` + `ResizableEditorLayout`; centre: the pieces by group at 3× with names; a variation selector
    (`base`, then each variation) re-renders every piece with that variation over its base.
  - Inspector (`InspectorShell`): name, base sheet and variation sheets (asset pickers as for tilesets; add/remove a
    variation with its ID), lists of empty pieces and problems.
- `docs/building-kit/`: add the prototype kit as `kit_roman_basic.png` and `kit_roman_basic_winter.png` beside the
  Aseprite file, as templates for either tool.
- Fixtures: the two prototype PNGs under `lib/__fixtures__/`.

### Tests

- `kitLayout.test.ts`: names are unique; no two pieces share a cell; every piece in building-editor.md is listed.
- `resolveKit.test.ts` (sheets as `ImageData` fixtures, no canvas needed): the prototype kit has no empty pieces;
  `variationIds = ['winter']`; `roof_slope_m` has a winter image, `wall_mid_m` does not; clearing a cell reports that
  piece as empty; a too small sheet is a problem.

### Done when

The prototype kit as PNG and as Aseprite both show all pieces; switching to `winter` shows snow on the roof pieces only;
painting a piece transparent in the sheet makes it appear under "Empty" after the file watcher fires.

---

## Phase 2 — The building model: grid, rooms, validation, layouts

Goal: pure functions that turn a building into a cell grid, rooms, problems and piece placements. No UI. This is the
heart of the feature, so it is tested hardest.

### Files (`lib/buildings/`)

- `grid.ts`
  - `buildGrid(building): Grid` — `cells[y][x]: 'wall' | 'floor'`, outer border and inner walls as wall.
  - `wallNeighbourMask(grid, x, y)` — N 1, E 2, S 4, W 8.
- `rooms.ts`
  - `findRegions(grid)` — 4-connected floor regions with bounding boxes.
  - `resolveRooms(building, grid)` — pairs regions with `rooms` by `at`; returns regions without a room and rooms
    whose `at` is not on a floor cell.
- `validate.ts` — `validateBuilding(building, kit?: ResolvedKit): string[]` (errors block saving), each message naming
  the element (`Opening window-2: …`):
  1. `width ≥ 3`, `depth ≥ 5`; inner walls inside the outer walls, not on the border, at least one cell long.
  2. Every floor region is a rectangle with exactly one room; every room's `at` is on a floor cell of its own region.
  3. Every room is at least 3 rows deep (2 rows of back wall + 1 walkable).
  4. Openings sit on wall cells, no two on one cell, none on a corner of the outer wall.
  5. Windows only in the south outer wall (`y = depth − 1`).
  6. Exactly one door in the south outer wall (the entrance); none in the other outer walls.
  7. A door in an inner wall connects two different rooms (floor on both sides along its axis).
  8. `chimney.column` in `1 … width − 2`.
  9. With a resolved kit: `kit` exists, no missing pieces, every room's `floor` is one of the kit's floors.
  10. Unique room and opening IDs.
- `exteriorLayout.ts` — `layoutExterior(building): Placement[]`, `Placement = { piece; col; row; overlay: boolean }`,
  following the exterior table: rows `0 … depth + 2`, columns `0 … width − 1`, `_l/_m/_r` by column, door and window
  replacements, chimney overlays last.
- `interiorLayout.ts` — `layoutInterior(building, grid): { placements: Placement[]; blocked: boolean[][]; entrance: { x; y } }`
  following the interior rules: wall caps with neighbour masks; `threshold`, `entrance_mat`, `window_cap`; the two face
  rows under every wall cell with floor south of it (`_l/_r` by the side walls); `door_face_upper/lower` below a door in
  a horizontal inner wall; floors by room. `blocked` marks walls and face rows (except where a door cuts the face);
  phase 6 turns it into collisions.
- `render.ts` — `renderPlacements(placements, kit, variationChain, target: CanvasRenderingContext2D, scale)`: opaque
  pieces first, then overlays; each piece draws its base, then the first variation in `variationChain` it has.
  `variationChain` is the active map variation followed by its `parentId`s.
- `index.ts` re-exports the public functions.

### Tests (`lib/buildings/*.test.ts`)

- `grid` / `rooms`: the example farmhouse (the JSON above) has two rectangular regions, each paired with its room.
- `validate`: one failing fixture per rule above with its exact message; the example farmhouse has no errors.
- `exteriorLayout`: golden test — the example farmhouse's placements equal the table in building-editor.md
  (e.g. row 7 column 6 is `door_lintel`, row 0 column 2 has `chimney_top` as an overlay after `roof_ridge_m`).
- `interiorLayout`: golden placements for the example farmhouse (row 1 is `wall_face_upper_*` in both rooms, (4, 4)
  is `threshold`, (6, 6) is `entrance_mat`); `blocked` covers walls and face rows, not the threshold.
- `render`: uses a fake 2D context recording `putImageData` calls (jsdom has no canvas): overlays come after opaque
  pieces; winter falls back to base for pieces without snow.

### Done when

The example farmhouse validates, and its layouts match building-editor.md cell for cell.

---

## Phase 3 — The building editor: plan canvas and inspector

Goal: draw and edit a building, see it inside and out, with undo, validation and autosave.

### Layout (`components/screens/building/BuildingEditor.tsx`)

```
EditorDocumentFrame (title, Validate button + status, Settings)
└── ResizableEditorLayout
    ├── content: SplitEditorCanvas
    │   ├── left:  PlanCanvas      (editable; draws the interior composition + overlays)
    │   └── right: PreviewPanel    (Exterior | Interior tabs, variation select, zoom)
    └── rightPanel: BuildingInspector (InspectorShell)
```

The plan *is* the interior view: editing happens on what the inside will look like, with overlays for what the inside
cannot show (room names, opening markers, invalid cells in red).

### Plan canvas (`PlanCanvas.tsx`)

- HTML canvas 2D (no Pixi needed at this size); integer zoom 2×–6× via `ZoomControls`, wheel zoom, middle-drag pan.
- Redraws on building, kit or zoom change only (same principle as the map's on-demand rendering).
- Overlays: grid lines, wall cells tinted, room labels centred, door/window/chimney glyphs, selection outline,
  cells named in validation errors outlined red, a ghost preview of what the active tool would do under the cursor.
- Tools (toolbar with `ToolbarToggleButton`, shortcuts in brackets):
  - **Select** [V]: click a room, opening or the chimney to inspect it; Delete removes openings/the chimney.
  - **Wall** [W]: drag a straight line of cells inside the outer walls; becomes one `innerWalls` entry; dragging over
    existing wall cells is a no-op for those cells.
  - **Erase wall** [E]: drag over inner wall cells to remove them (splits or shortens runs); outer walls can't be erased.
  - **Door** [D] / **Window** [N]: click a wall cell; refused cells show why in the ghost preview (e.g. "Windows go in the
    south wall").
  - **Chimney** [C]: click a column (in the plan, the top wall row).
  - **Room** [R]: click a floor region without a room to create one (name defaults from the next free `room-N`).
- When walls change, `rooms` are re-paired by `at`; a room whose region vanished is removed, a new region gets a room
  automatically, and the change is one undo step.

### Preview panel (`PreviewPanel.tsx`)

- Exterior: `layoutExterior` rendered on a grass-coloured background with a 16 × 32 character silhouette beside the
  door for scale (as in the example renders).
- Interior: `layoutInterior` rendered without overlays.
- Variation select: `base` plus the kit's `variationIds`.

### Inspector (`BuildingInspector.tsx`)

- **Building** (nothing selected): name, kit (select of kits; changing it re-validates floors), width and depth
  (number inputs; shrinking removes walls, rooms and openings outside the new bounds after a confirmation listing
  them), roof kind (read-only "Gable" for now), chimney on/off, interior map (phase 6).
- **Room**: name, ID (rename keeps references), floor (select of the kit's floors with a swatch of the piece).
- **Opening**: kind (door/window, filtered by what's allowed there), ID, position (read-only), delete.

### Store and saving

- `buildingSlice`: `updateBuilding`, history (merge window as quests), `checkBuilding` (runs `validateBuilding` with the
  resolved kit; issues shown under Validate), save on autosave/Save as for quests; errors block saving.
- Saving writes the building JSON only (baking is phase 8).

### Tests

- `BuildingEditor.test.tsx` (pattern of `QuestEditor.test.tsx`, canvas mocked):
  wall tool creates an inner wall and a second room; door tool refuses an outer side wall with the reason shown;
  window tool places a window in the south wall; shrinking the depth asks for confirmation and removes a door;
  undo restores; Validate lists an error for a 2-row room.
- `PlanCanvas` hit testing: screen → cell at each zoom.

### Done when

The example farmhouse can be built from an empty 9 × 7 shell in the editor, validates, autosaves, and its previews match
the example renders.

---

## Phase 4 — Explorer and references polish

- Thumbnails in the explorer and create dialog: exterior at 1× (cached per building revision).
- `lib/resourceReferences.ts`: building → kit, building → interior map; kit → buildings using it. `ResourceLinks` in
  both editors' headers.
- Deleting a kit used by buildings: blocked with the list of buildings (like other referenced resources).
- Command palette: "New building", "Open kit".
- Tests: references in `resourceReferences.test.ts`; delete blocked.

---

## Phase 5 — Placing buildings on maps

Goal: buildings appear on exterior maps, can be placed, moved and removed, and look right per variation.

### Map format

- `LayerKind` gains `'building'`; `Layer` gains `buildings?: BuildingInstance[]`. `Schemas/map.schema.json`: the layer
  kind enum (as `enum`), `buildings` items `{ id, buildingId, x, y }`.
- `LayersPanel.tsx` / `LAYER_CATEGORIES`: building layers under "Objects"; "Add Building layer".

### Map editor

- Tool `building` in `toolSlice` (shortcut [U]); palette in the map inspector: buildings with thumbnails and a search
  field.
- Placement: ghost exterior snapped to tiles under the cursor (footprint outlined); click places; drag moves; Delete
  removes; the selected instance shows its footprint, its door and an "Open building" button (`OpenResourceButton`).
- Placing a building that has an interior map a second time is refused with the reason (D6).
- `useMapRenderer.renderBuildings()`: one container per building layer; each instance is a sprite of its exterior
  rendered by `renderPlacements` into an offscreen canvas, cached by `(buildingId, building revision, variation chain)`;
  the sprite's origin is 3 rows above the footprint. Called from the store subscription when the layer, the building
  or the active variation changes (on-demand rendering requests the frame).
- Collision overlay (`renderCollisionOverlay`) draws placed footprints as the generated collision will be.

### Tests

- `mapSlice` / layer tests: add/move/remove instances; refusal for a second placement of a building with an interior.
- `useMapRenderer` unit test: an instance's sprite is placed at `(x·16, (y − 3)·16)`.

### Done when

The farmhouse can be placed on Map 1, moved, removed, and shows its winter look when the map's winter variation is
active.

---

## Phase 6 — Generated map data: collisions, doors and links

Goal: placed buildings and interiors produce the collisions, triggers, anchors and links the game needs, kept in sync
automatically (D4).

### `lib/buildings/mapData.ts`

- `generateExteriorData(map, buildings): GeneratedMapData` per placed building:
  - a collision rectangle for the footprint, with the entrance cell left open;
  - a trigger on the entrance cell (`type: 'locationLinkTrigger'`) and an arrival anchor one cell south of it,
    facing south;
  - if the building has an interior map: a link `door` → the interior's arrival anchor.
- `generateInteriorData(map, building): GeneratedMapData` for an interior map:
  - collisions from `layoutInterior(...).blocked`, merged into rectangles row by row;
  - a trigger on the entrance mat and an arrival anchor one cell north of it, facing north;
  - a link back to the arrival anchor in front of the building's single placement (D6).
- Every generated element's ID is `building:<instance or building id>:<role>` and it carries the tag `generated`.
  `applyGeneratedData(map, data)` replaces all `generated` elements of the map with the new ones; hand-made elements are
  never touched.

### Where it runs

- `lib/saveManager.saveMapImmediate`: before `serializeMap`, apply the generated data (accessors for buildings and
  maps via `saveAccessors`).
- Saving a building re-saves the maps it is placed on and its interior map, so their generated data follows.
- The map editor shows generated triggers, anchors and collisions locked: not selectable for editing, labelled
  "From building Farmhouse".

### Tests (`lib/buildings/mapData.test.ts`)

- Exterior: footprint collision excludes the door cell; trigger and anchor positions; link to the interior anchor.
- Interior: collisions equal `blocked`; entrance link back to the exterior anchor.
- `applyGeneratedData` replaces only `generated` elements and is idempotent.
- `saveManager` test: saving a map with a placed building writes the generated elements.

### Done when

Saving Map 1 with the farmhouse writes its collision, door trigger, anchor and link; moving the building and saving
moves them; removing it removes them.

---

## Phase 7 — Interiors

Goal: a building's interior is a map that shows the generated interior and takes props and entities like any map.

- Building inspector, **Interior map**: "Create interior map" creates a location (`addMap`) with
  `width = building.width`, `height = building.depth`, `buildingInterior.buildingId`, an entity layer and an object
  layer, sets `interiorMapId`, and opens it. "Open" when it exists. A building can only own one interior (validation).
- Map editor for an interior map:
  - a locked, non-removable base layer "Building" drawn from `layoutInterior` with the map's variation;
  - painting tiles and terrain is disabled; entity, object and navigation tools work;
  - the map size fields are read-only ("Set by building Farmhouse").
- When the building's size changes, its interior map is resized with it; objects or entities that end up outside the
  map or on blocked cells are listed in a warning after the change (never moved or deleted silently).
- Tests: create interior sets both references; resize follows the building; the base layer cannot be edited or removed.

### Done when

From the farmhouse, "Create interior map" gives a map showing the two rooms, furniture can be placed inside, and walking
the generated links goes outside → inside → outside (checked in phase 6's data).

---

## Phase 8 — Baked images for Unity (D5)

- On building save, write next to the building JSON:
  - `<stem>.exterior.png` (base) and `<stem>.exterior.<variation>.png` for every kit variation that changes at least
    one placed piece;
  - `<stem>.interior.png` and `<stem>.interior.<variation>.png` likewise.
- Rendering through `renderPlacements` into an `OffscreenCanvas`, then `fileSystem.saveBinary` (add it if missing,
  pattern of the music renderer's binary writes).
- Stale variation files are deleted when a variation no longer changes anything; deleting a building deletes its PNGs.
- Saving a kit re-bakes every building using it (progress shown in the save indicator).
- The building JSON stays the source; the PNGs are exports (like quests' `.i18n.json`).
- Contract for the Unity plan (documented in building-editor.md when this phase lands): sprite pivot at the
  footprint's bottom-left; the exterior image is `width × (depth + 3)` tiles; the interior image is `width × depth`;
  variation files are chosen by the active season or variation ID.
- Tests: baking writes the expected file names; a kit change re-bakes users; deleting cleans up.

---

## Phase 9 — Documentation and end-to-end check

- `docs/building-editor.md`: replace "Status: rules and a prototype kit only" with how to use the editor; keep the
  rules section authoritative.
- `Tools/Vulcanus/app/docs/editor-language.md` check (`npm run lint:editors`) for the new screens' wording.
- Playwright e2e (`tests/e2e/buildings.spec.ts`, on a copy of a fixture project): create kit from the prototype file,
  create the farmhouse, place it on a map, create its interior, reload the project and find everything again.

---

## Cross-cutting rules for every phase

- Follow `.claude/docs/screen_building_instructions.md` and the newer canvas editors (quest editor) for layout; Chakra
  props and theme tokens, no raw hex outside `lib/editorColors.ts` (`npm run lint:ui`).
- Schemas change in the same commit as the types (`Schemas/`), with `enum` instead of `const`.
- IDs are exact: no case-insensitive comparisons anywhere.
- Validate at the boundaries (load, save, Validate button); the editor shows problems instead of guessing fixes.
- Each phase: `npx vitest run` for the touched areas, `npx eslint --max-warnings 0` and `npx prettier --check` on
  changed files, then commit.

## Out of scope here

- Unity importer for buildings (needs the unified catalogs; consumes phase 6's map data and phase 8's images).
- Hip roofs, L/U shapes, more storeys, the domus atrium, columns and porticos.
- Props, terrain overlays and the project-wide variation list (separate plans; this plan uses map variation IDs as they
  are, and a kit's variation IDs must match them).
- Aseprite slices and variation layers inside one Aseprite file (a later addition on top of the standard layout).
- AI furnishing by room function (rooms get a `function` field when that work starts).

## Open questions to settle before the phases that need them

| Before | Question |
|---|---|
| Phase 5 | Should building layers sort with entities by footprint (y-sort) in the editor, or is drawing them in layer order enough until Unity shows the real sorting? |
| Phase 6 | Is a footprint rectangle (minus the door) the right exterior collision, or should the front wall's face rows stay walkable so characters can walk "in front of" the building visually overlapping it? |
| Phase 7 | Interiors on the same grid as the footprint (D3) make small houses cramped; confirm before interiors are built, since changing it later changes generated data. |
| Phase 8 | Bake per kit variation (as planned) or only for variation IDs that maps actually use? |
