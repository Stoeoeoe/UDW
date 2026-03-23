# Map Editor — CLAUDE.md

## Project Overview

A tile-based map editor for 2D games, built as an Electron desktop app. It supports multi-tileset maps, Wang/terrain autotiling, entity placement, map variations (seasons/generics), and spatial primitives (paths, areas, anchors).

The codebase lives in `app/`. There is also a `packages/` directory with an `editor-shell` library and a `create-editor-app` scaffolding CLI, but these are not yet integrated into the main app.

---

## Stack

| Layer | Technology |
|---|---|
| Electron shell | Electron 30 + `vite-plugin-electron` |
| UI framework | React 18 + Chakra UI v2 |
| State | Zustand 5 + Immer 11 (`subscribeWithSelector`) |
| Forms | React Hook Form 7 + Zod 4 |
| Map rendering | PixiJS (canvas in `MapViewportPixi.tsx`) |
| Styling | Tailwind CSS v4 + Chakra (mixed) |
| Build | Vite 5 + TypeScript 5 |
| Testing | Vitest 4 (unit, jsdom) + Playwright (e2e) + Storybook 10 |

---

## Directory Layout

```
app/
  electron/         Main process (main.ts, preload.ts, ipcHandlers.ts)
  src/
    types/          Data model types
      schema.ts     — Project, Map, Layer, Tileset, Entity* types
      editor.ts     — EditorState, ToolType, EditorMode runtime types
    store/
      useEditorStore.ts   — Single Zustand store (~1550 lines) for all editor state
    lib/
      fileSystem.ts       — Electron IPC / Web FS API abstraction
      saveManager.ts      — Debounced save + SaveStatus store
      mapUtils.ts         — resolveTileAt, resolveEntities (variation-aware)
      tileRef.ts          — Compact tile encoding: (tilesetIdx << 16) | tileIdx
      tileUtils.ts        — TilePattern building, samplePatternAt, createTileRef
      terrainUtils.ts     — Corner-based autotiling algorithms
      algorithms.ts       — Bresenham, flood fill, brush generators
      randomUtils.ts      — Weighted random tile sampling, seeded random
      recentProjects.ts   — localStorage-backed recent projects list
      defaultEntities.ts  — Built-in entity type definitions
    config/
      constants.ts        — DEFAULT_TILE_SIZE, ZOOM_*, PANEL_SIZES, ANIMATION
      entityTypes.ts      — More built-in entity types (partially redundant with defaultEntities.ts)
    components/
      common/       — Shared UI shells (PanelShell, ViewportShell, Toolbar, etc.)
      dialogs/      — MapCreator, ProjectSettingsEditor
      layout/       — AppLayout, TopBar, MapToolbar
      navigation/   — Sidebar
      panels/       — ProjectPanel, TilesetPanel, ToolPropertiesPanel, PropertiesPanel
      screens/
        map/        — MapEditor, MapViewportPixi, LayersPanel, VariationManager, etc.
        tileset/    — TilesetEditor, TilesetToolbar
        terrain/    — TerrainEditor
        entity/     — EntityEditor, EntityPalette
        layer/      — LayerEditor
        settings/   — SettingsEditor
        startup/    — LandingScreen
    hooks/
      usePanZoom.ts       — Camera pan/zoom for canvas viewports
      useTileSelection.ts — Tile selection logic
      useLayerDragDrop.ts — Layer reordering DnD
```

---

## Core Data Model

### Tile Encoding

Tile data in `Layer.data[y][x]` is stored as a compact number:
```
(tilesetIndex << 16) | tileIndex
```
- `tilesetIndex` = position of the tileset ID in `Map.tilesetRefs[]`
- `tileIndex`    = tile index within that tileset (max 65535 tiles per tileset)

Encode/decode via `encodeTileRef` / `decodeTileRef` in `lib/tileRef.ts`.  
String format (`"tilesetId:index"`) is used only for variations and in-memory composition.

### Map Variations

Variations override base layer data and entities. They form an inheritance tree via `parentId`. Resolving a tile calls `resolveTileAt(map, layerId, x, y, variationId)` which walks the chain child→parent→base and returns the first non-null override. Variation layer overrides store data as **strings** (not encoded numbers).

### Project → Maps → Tilesets

- One `project.json` per project, holds metadata, terrain types, layer definitions, entity type definitions.
- Maps live in `maps/*.map.json`.
- Tilesets live in `tilesets/*.tileset.json`.
- Sprite assets live in `assets/`.

---

## Running the App

```bash
cd app
npm install

# Development (Electron dev server)
npm run dev

# Run unit tests (Vitest)
npm test

# Watch mode
npm run test:watch

# Storybook
npm run storybook

# Production build
npm run build
```

---

## State Management Conventions

- **All editor state lives in `useEditorStore`** (`src/store/useEditorStore.ts`). Do not create parallel stores for editor concerns.
- **`useSaveStore`** (`lib/saveManager.ts`) tracks save status only (`idle | saving | saved | error`). It is a separate store because save status is read by multiple UI components independently.
- Mutations use **Immer** inside `set()`. Use `castDraft()` when assigning complex objects (Maps, class instances).
- The store **auto-saves `currentMap`** via a `subscribeWithSelector` subscription at the bottom of the file. Debounced via `saveMapDebounced` (300 ms).
- `persistProject(project)` is a module-level helper in the store that saves `project.json` and updates save status. Terrain/entity/layer-definition CRUD actions all call this.

---

## File I/O

`fileSystem.ts` exports a singleton `fileSystem`. It abstracts both:
1. **Electron** — calls `window.ipcRenderer.invoke(channel, args)` 
2. **Web** (fallback) — uses the File System Access API (`showDirectoryPicker`, etc.)

IPC channels are defined in `electron/ipcHandlers.ts` and registered in `electron/main.ts`.

When writing new file operations, always go through `fileSystem` — never call `ipcRenderer.invoke` directly from components.

---

## Known Issues & Technical Debt

### Security (High Priority)

1. **`electron/preload.ts` — No IPC channel whitelist.** The entire `ipcRenderer` API is exposed without filtering. Should restrict `invoke`/`send`/`on` to an explicit allowlist of safe channels.

2. **`electron/ipcHandlers.ts` — Path traversal risk.** Handlers like `app:fs-read-json`, `app:fs-write-json`, `app:fs-delete-json`, and especially **`app:read-file-buffer`** accept arbitrary paths/filenames from the renderer without sanitization. An XSS or prototype-pollution attack could read/write arbitrary files. All paths should be resolved with `path.resolve()` and validated to stay within `projectPath`.

3. **`electron/ipcHandlers.ts` — No schema validation on loaded JSON.** `app:open-project` and `app:load-project-by-path` parse and return raw JSON without validating the shape. Consider adding Zod validation for loaded `Project` files.

### Correctness

4. **`createNewMap` — Non-unique map IDs.** IDs are derived from the map name (`name.toLowerCase().replace(/\s+/g, '-')`). Creating two maps with the same name silently overwrites the first map's file. Add a uniqueness check or append a uuid suffix.

5. **`tileRef.ts` — Silent overflow on large tile indices.** If a tileset has more than 65535 tiles, `(tilesetIndex << 16) | tileIndex` silently corrupts data. Add a guard in `encodeTileRef`.

6. **`encodeTileRef` — Missing format validation.** If `tileRef` doesn't contain `':'`, `tileIndexStr` is `undefined` and `parseInt` returns `NaN`, producing a corrupt encoded value. Add a format guard.

7. **`saveManager.ts` — `flushPendingSaves()` is incomplete.** It clears timers but doesn't actually execute pending saves. Any code calling this before project close will silently lose the last few tile paints within the debounce window.

8. **`resolveTileAt` — Variation override loose null check.** `override.data[y]?.[x] !== null` passes through `undefined` (out-of-bounds access). Should use `!= null` (covers both null and undefined).

9. **`useEditorStore.ts` — `addMap` action is misleading.** It only sets `currentMap` and does not add to the `maps` array.

### Performance

10. **`useEditorStore.ts` — `JSON.stringify` on each map mutation.** The auto-save subscription calls `JSON.stringify(currentMap)` on every state change for diffing. For large maps this is expensive. Consider a version/dirty counter approach.

11. **`algorithms.ts` — `floodFillCollect` uses string-keyed Set.** `Set<string>` with `"x,y"` keys causes many string allocations. For maps ≥ 128×128 this can be slow. A numeric Set (`y * width + x`) would be faster.

12. **`loadProjectResources` — Multiple sequential `set()` calls.** Each call triggers a re-render cycle during project loading. Batch into fewer `set()` calls.

### Memory

13. **`loadSprite` — Object URL leak.** `URL.createObjectURL(blob)` is never revoked. Each sprite load allocates a permanent URL until page unload. Track and revoke when tilesets are removed.

### Code Quality

14. **`defaultEntities.ts` vs `entityTypes.ts` — Duplication.** Both files define overlapping entity types (chest, npc_spawn, etc.). Pick one source of truth.

15. **`validate()` is a placeholder.** Returns `[]` unconditionally. `validationErrors` state is never populated.

16. **`PropertyInstance.value: any`.** Loses all type safety. Consider `string | number | boolean | null`.

17. **`useEditorStore.ts` — `selectedEntityIds` is a `Set`.** While Immer v9+ supports `Set`, confirm this is handled correctly in all selects and subscriptions (Sets are not serializable and won't deep-compare as expected).

---

## Testing

- Unit tests: `src/**/*.test.ts` — run with `vitest run`
- Storybook component tests: run with `npm run storybook`
- E2E tests: `tests/example.spec.ts` — run with `playwright test`
- `setupTests.ts` configures jsdom and testing-library

When writing tests for store actions, use `useEditorStore.getState()` directly; do not use hooks in Vitest unit tests.

---

## Adding a New Tool

1. Add the tool name to `ToolType` in `src/types/editor.ts`
2. Add the tool icon/label config to the toolbar component
3. Handle the tool's mouse events in `useMapTools.ts` (the main tool dispatcher for the map viewport)
4. If the tool modifies tile data, use existing store actions (`paintTilesBatch`, `eraseTilesBatch`, etc.) — do not write directly to layer data

## Adding a New IPC Channel

1. Add the handler in `electron/ipcHandlers.ts`
2. **Validate all inputs** — treat all renderer-provided data as untrusted
3. Add the TypeScript wrapper in `src/lib/fileSystem.ts` under the Electron branch
4. Expose it through `fileSystem` — do not call `ipcRenderer.invoke` from UI code
