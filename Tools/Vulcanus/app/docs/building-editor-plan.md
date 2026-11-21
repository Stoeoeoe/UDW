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
| D1 | A building is stored as a **plan**: size, scale, a plan per floor (inner walls, rooms, openings, stairs), roof and chimney. The exterior and interior images are always *composed* from the plan and the kit; nothing generated is edited by hand. | One source of truth: the inside and outside can never disagree. |
| D2 | A **kit** is a sheet image (PNG or Aseprite, flattened) in the **standard kit layout** — every piece at a fixed position — plus a descriptor JSON with a namespaced ID. A variation is an optional extra sheet in the same layout, drawn over the base (for example only the snow). Aseprite slices and variation layers are a later addition. | Works with any image editor; no slices to maintain; IDs stay stable and mod-friendly. |
| D3 | Walls are whole cells; 4 tiles of wall per floor and of back-wall face inside; interiors on the building's grid. The exterior follows readable rules, not scale: roof slope squashed to half the depth (2–4 rows), side, front or cross gable, inside optionally twice as wide as the front. | Drawn to scale, the roof dwarfed the front (revised after phase 5). |
| D4 | Placed buildings and interiors **produce ordinary map data** at save: collisions, triggers, anchors and location links, marked as generated. | Unity already imports these; doors and collision work without new Unity code. |
| D5 | Vulcanus **bakes** the composed images (exterior per variation, interior) next to the building at save. | Unity places images instead of re-implementing the composition rules. |
| D6 | A building with an interior map may be placed **once** in the project; buildings without one may be placed any number of times. | The interior's door must lead back to exactly one exterior. |
| D7 | Scope: one rectangular wing, any number of floors, side/front/cross gable, doors, windows on the south wall, one chimney. Validation rejects anything else. | Prove the kit approach before hip roofs and L shapes. |

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
  "scale": 1,
  "floors": [
    {
      "innerWalls": [{ "x": 4, "y": 1, "direction": "south", "length": 5 }],
      "rooms": [
        { "id": "kitchen", "at": { "x": 2, "y": 3 }, "name": "Kitchen", "floor": "floor_tiles" },
        { "id": "bedroom", "at": { "x": 6, "y": 3 }, "name": "Bedroom", "floor": "floor_boards" }
      ],
      "openings": [
        { "id": "entrance", "kind": "door", "x": 6, "y": 6 },
        { "id": "window-1", "kind": "window", "x": 2, "y": 6 },
        { "id": "inner-door", "kind": "door", "x": 4, "y": 4 }
      ],
      "stairsUp": { "x": 2, "y": 5 }
    },
    {
      "innerWalls": [],
      "rooms": [{ "id": "loft", "at": { "x": 1, "y": 1 }, "name": "Loft", "floor": "floor_boards" }],
      "openings": [{ "id": "window-1", "kind": "window", "x": 4, "y": 6 }]
    }
  ],
  "chimney": { "column": 2 },
  "roof": { "kind": "front-gable" },
  "interiorMapId": "base:farmhouse_interior"
}
```

- `width`, `depth`: the grid in tiles, outer walls included; every floor has it.
- `scale`: plan columns per column of the front (1 or 2).
- `floors`: ground floor first. `innerWalls` are straight runs of wall cells starting at `(x, y)` and going `east` or
  `south` for `length` cells. `rooms` has one entry per floor region; `at` is any cell inside the region, so a room
  keeps its identity when walls move. Room and opening `id`s are local IDs (`LOCAL_ID_PATTERN`), unique per floor, and
  stay stable because generated map data refers to them. `stairsUp` is on every floor but the top one.
- `floor` (of a room): the name of a floor piece in the kit (`floor_*`).
- `chimney`: optional; a column of the plan.
- `roof.kind`: `side-gable`, `front-gable` or `cross-gable`.
- `interiorMapId`: optional; the map whose interior this building is (phase 7 decides how upper floors get theirs).

### Placed building — on a map layer of kind `building`

```json
{ "id": "farmhouse-1", "buildingId": "base:farmhouse", "x": 12, "y": 8 }
```

`x`, `y` are the tile coordinates of the footprint's top-left cell. The footprint is as many rows as the roof's slope;
the exterior image reaches up from it by the rest of its rows (D3).

### Interior map — a normal map with a binding

```json
{ "buildingInterior": { "buildingId": "base:farmhouse" } }
```

Its `width`/`height` equal the building's `width`/`depth`; `baseTilesetId` may stay empty (the schema allows it).
Upper floors need their own maps; phase 7 settles how they are bound.

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
- `store/useResolvedKitsStore.ts`: resolved kits by kit ID, in a store of their own (pixels derived from files, not
  documents with history), re-read when a kit's sheets change or the asset file watcher reports a changed sheet.
- `lib/asepriteLayers.ts`: flattening Aseprite files honours hidden groups (the parser library drops layer nesting), so a
  kit's Aseprite file can keep a hidden `variations` group as a drawing aid.
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

- `grid.ts` — `buildGrid(building)`: `wall[y][x]` for the border and inner walls; `wallNeighbourMask` (N 1, E 2, S 4,
  W 8).
- `rooms.ts` — `findRegions(grid)` (4-connected floor areas with bounds), `isRectangle`, `roomsByRegion` (rooms paired
  with areas by their `at` cell).
- `validate.ts` — `validateBuildingPlan(building, kit?)`: the errors that block saving, each naming what it concerns:
  1. at least 3 × 5 tiles; inner walls inside the outer walls;
  2. every floor area a rectangle with exactly one room; every room's `at` on a floor cell;
  3. every room at least 3 rows deep (2 rows of back wall + 1 walkable);
  4. openings on wall cells, not on corners, one per cell;
  5. windows only in the south wall;
  6. exactly one door in the south wall (the entrance), none in the other outer walls;
  7. a door in an inner wall leads from one room to another;
  8. the chimney on a column between the outer walls;
  9. a kit chosen; with the resolved kit, no empty pieces and every room's floor drawn in it;
  10. unique room and opening IDs.
- `layout.ts` — `layoutExterior(building)` and `layoutInterior(building)` → `Placement[]` (`piece`, `column`, `row`,
  `overlay`) by the rules of building-editor.md; the interior also gives `blocked[y][x]` (walls, windows and back-wall
  faces, not doors) and the entrance cell, for phase 6's collisions and links.
- `render.ts` — `drawList(placements, kit, variationChain)`: what to draw in order (opaque pieces, then overlays; each
  base, then the first variation in the chain the piece has); `renderDraws` draws it on a canvas without smoothing.
- `farmhouse.fixture.ts` — the example farmhouse, shared by the tests.

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
- There is no room tool: rooms follow the walls (`lib/buildings/edit.ts`, `reconcile`). When walls change, a room whose
  `at` became wall moves to a neighbouring floor cell, a floor area keeps its first room, an area without a room gets
  `room-N`, and openings whose wall is gone are removed — all in the same undo step. Rooms are named and given floors
  in the inspector after selecting them.
- Problems are shown live (the plan's cells outlined in red, the list in the inspector, the count in the header),
  from `buildingIssues` in the building slice, which also decides what blocks saving.

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

- Thumbnails: the explorer row's icon is the building's exterior in its base look (`BuildingThumbnail.tsx`, one image
  per building revision and resolved kit), the plain icon until the kit is read. The create dialog has none: a new
  building is always the same shell.
- `lib/resourceReferences.ts`: building → kit, building → interior map; kit → buildings using it. `ResourceLinks` in
  both editors' headers; buildings and kits are in the resource index, so the links open them.
- Deleting a kit used by buildings is refused, naming them (`deleteRefusal` on the resource type, checked before the
  delete confirmation in the explorer and its context menu). No other resource type refuses deletes yet.
- Command palette: buildings and kits are opened from it since phase 0; it has no "New …" commands for any type, so
  none were added.
- Tests: references in `resourceReferences.test.ts`; delete refusal in `editorResourceDeleteRefusal.test.ts`.

---

## Phase 5 — Placing buildings on maps

Goal: buildings appear on exterior maps, can be placed, moved and removed, and look right per variation.

### Map format

- `LayerKind` gains `'building'`; `Layer` gains `buildings?: BuildingInstance[]`. `Schemas/map.schema.json`: the layer
  kind enum (as `enum`), `buildings` items `{ id, buildingId, x, y }`.
- `LayersPanel.tsx` / `LAYER_CATEGORIES`: building layers under "Objects"; "Add Building layer".

### Map editor

- Tools follow the object layer's: **Select / Move Building** [M] (click a building's footprint or roof to select it,
  drag to move it) and **Place Building** [N]; Delete removes the selected building. The bottom panel
  (`BuildingBottomPanel.tsx`) lists the buildings with thumbnails and a search field; picking one switches to Place.
  The panel also shows the selected building with "Open building" and "Remove from map".
- Placement: the building's door goes under the pointer; the ghost is the exterior, faded and outlined red when it
  cannot be placed. Placing, moving and removing edit the base map only, like objects.
- Placing a building that has an interior map a second time is refused (D6); the panel says why as soon as that
  building is picked.
- Drawing (`mapBuildingSprites.ts`): a building layer is drawn in its layer order inside `renderTiles`, each building a
  sprite of its exterior (`exteriorCanvas` in `lib/buildings/render.ts`, cached per building revision, kit and variation
  chain), 3 rows above its footprint, back to front by footprint bottom. The variation chain is the map's active
  variation and its parents, matched to kit variations by ID. A building whose kit is not read yet is drawn as its
  footprint's outline; the map redraws when kits are read.
- The collision overlay draws each footprint except the doors in its south wall (`footprintCollisionCells`, which
  phase 6 generates from).

### Tests

- `lib/buildings/mapPlacement.test.ts`: variation chain, door under the pointer, hit test by roof and footprint, the
  D6 refusal, footprint collision.
- `store/slices/mapBuildingSlice.test.ts`: place/move/remove; refusals for a second placement and in a variation.
- `mapBuildingSprites.test.ts`: an instance is drawn at `(x·16, (y − 3)·16)`, back to front.

### Done when

The farmhouse can be placed on Map 1, moved, removed, and shows its winter look when the map's winter variation is
active.

---

## Phase 5b — Floors, scale and roof kinds (after phase 5)

Goal: buildings look like buildings. Phase 5 showed the to-scale exterior failing: a 7-deep building had 7 rows of
roof over 3 of wall. Revised D1, D3 and D7.

- Format: `floors` (each with `innerWalls`, `rooms`, `openings`, `stairsUp?`), `scale` (1|2), `roof.kind`
  `side-gable | front-gable | cross-gable`. No migration (prototyping); the example buildings were rewritten by hand.
- `lib/buildings/plan.ts`: `FloorPlan` (a floor with the building's size), `floorPlan`, `withFloor`, `floorName`. Grid,
  rooms, edits and floor validation work on a `FloorPlan`; `resize` resizes every floor.
- `layout.ts`: `roofDepthRows`, `frontColumn`, `frontWidth`, `entranceOf`, `gableSpan`, `exteriorShape` and the new
  `layoutExterior` (building-editor.md, Exterior); `layoutInterior` draws stairs; `layoutFloor`.
- `validate.ts`: `planIssues` per floor (only the ground floor has an entrance; doors to the outside only there), stairs
  between floors, an odd front for a front gable, wings of 2 columns beside a cross gable. `PlanIssue.floor` says
  which floor's plan outlines it.
- Kit: `gable_*`, `wall_band_{l,m,r}`, `stairs_up`, `stairs_down` (prototype art in the kit files).
- Editor: floor tabs with "Add floor" and "Remove top floor"; Stairs up tool [S]; roof and inside width in the
  inspector; the preview shows the floor being edited inside.
- Maps: the footprint is the bottom slope rows of the exterior; placement, hit test, collision overlay follow
  `exteriorShape`.

---

## Phase 5c — Taller walls, window sizes, larger interiors (after phase 5b)

Goal: walls and rooms at the scale of games like this one. Asked for after phase 5b: walls about 64 px, windows at
least 32 px, interiors large enough to move around in.

- 4 rows per floor outside (`STOREY_ROWS`), a 4-row back-wall face inside (`BACK_WALL_ROWS`); rooms need 6 rows.
- Windows have a `size`: `small`, `medium`, `large` (required for windows in the schema). Windows may also go in the
  north wall, where they show inside on the back wall of the room below.
- `scale` may be 3. A new building is 16 × 12 at scale 2: large inside, an 8-column front.
- The door is four pieces (`door_middle` added); windows are three sizes of pieces outside and inside; the back-wall
  face is `wall_face_1` … `_4`, the door through it `door_face_1` … `_4`. Positions in `kitLayout.ts`; the prototype
  kit and the example buildings were redrawn to match.

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
- Hip roofs, L/U shapes, the domus atrium, columns and porticos.
- Props, terrain overlays and the project-wide variation list (separate plans; this plan uses map variation IDs as they
  are, and a kit's variation IDs must match them).
- Aseprite slices and variation layers inside one Aseprite file (a later addition on top of the standard layout).
- AI furnishing by room function (rooms get a `function` field when that work starts).

## Open questions to settle before the phases that need them

| Before | Question |
|---|---|
| Phase 5 | Should building layers sort with entities by footprint (y-sort) in the editor, or is drawing them in layer order enough until Unity shows the real sorting? |
| Phase 6 | Is a footprint rectangle (minus the door) the right exterior collision, or should the front wall's face rows stay walkable so characters can walk "in front of" the building visually overlapping it? |
| Phase 8 | Bake per kit variation (as planned) or only for variation IDs that maps actually use? |
