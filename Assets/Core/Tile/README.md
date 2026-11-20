# Vulcanus map imports

`.vproj` imports project definitions, `.vts` imports tiles and reusable object prefabs,
and `.vmap` imports a map prefab plus its `LocationData` subasset. The importer declares
project, tileset, and sprite-sheet dependencies before import so a fresh collection of
source files imports in the correct order.

Tileset references resolve by the authored JSON `id`, matching exactly. A filename
does not supply an alias for that ID. Each map builds one tileset index; duplicate IDs
fail import. Sprite-sheet paths resolve relative to their source file or project file.
There is no recursive filename fallback. Missing required tilesets, textures, or object
prefabs produce import errors instead of partial maps or text assets.

Aseprite sources referenced by `.vts` files are automatically imported as Sprite Sheet,
with merged layers, zero packing padding, and read/write enabled. Tile IDs depend on
the original canvas grid; animation atlas packing can otherwise leave populated maps
invisible. Unreferenced Aseprite animation assets retain their settings. For an existing
source imported before its `.vts` reference was added, reimport the Aseprite file once.
The tileset importer reports incompatible packing or undersized/cropped textures rather
than accepting them silently. Keep static tileset canvases at their authored grid size.

Object artwork and colliders are created once by the tileset importer. The map importer
places instances of those prefabs and applies layer sorting. Terrain, anchors, triggers,
and entity property overrides remain baked into the map. Persistent entities retain
their authored IDs and active-root templates under inactive parents; they are bound and
enabled later by `WorldObjectSpawner`.

`VulcanusWorldCatalog.MapBindings` owns map-to-location relationships. The catalog's
editor sync discovers imported maps and preserves manual bindings. Project definitions
do not contain another copy of location mappings.

Assigned world catalogs refresh automatically on editor startup, after map/project
imports, moves and deletions, when saving a catalog, and before play/build. Discovered
rows record the source asset GUID so deleted maps and maps moved into another project
are removed. Nested projects own their own maps. Manual map rows and entity-prefab
assignments are preserved. Unchanged refreshes do not save the catalog; invalid imports
or duplicate map IDs preserve the previous bindings and block play/build.

Imported locations store an explicit `scenePath`. The wrapper path is
`Assets/Scenes/Maps/<source filename>.unity`, independent of the map's stable ID and
display name. Source filenames must be unique within this scene output folder.
Wrappers are created once; existing scene contents are preserved on reimport, and
their Build Settings registration is checked again. Unity requires a saved current
scene before creating or opening another scene additively.

Map metadata `musicCue` selects an enabled, namespaced `MusicCue` ID and
`musicPreset` selects one of that cue's presets. They import into a
`MusicEnvironment` on the map prefab, so location music survives map reimports
without scene overrides. Maps without music metadata submit no music request.
Missing/disabled cues and missing/unknown presets fail at import. Apollo exports
`Assets/Content/Music/<namespace>/<name>/cue.apollocue`, which imports its aligned
PCM stems and presets into a catalog-discovered `MusicCue` automatically.

`LocationCatalog` automatically discovers `LocationData` assets and imported map
subassets throughout `Assets`, including other content projects. It refreshes after
map imports, moves and deletions and before play/build. `LevelManager` loads this
generated Resources catalog; no world-catalog assignment on `SystemRoot` or manual
location asset creation is needed. World catalogs continue to own project-scoped
map/prefab relationships used by authoring and importers.

`LevelManager` loads the explicit scene path and uses it to resolve initial locations
and filter location lifecycle callbacks. Hand-authored locations without a scene path
continue to use their ID as the scene name.

Location links use `linkType: "door"` (the default, press Interact) or
`linkType: "open"` (activate on player contact). NPC contact does not activate
interactables; NPC commands can explicitly call `TriggerInteraction`, except for
player-only location links. Location requests are rejected during startup or an
existing transition. Explicit arrival keys must resolve; only initial placement
without a key falls back to a default spawn point.

Run the `MapLoading` EditMode category for catalog, path, decoding, and integration
coverage. Integration tests import disposable source assets, preserve Build Settings,
and read the project's registered spawnable prefab without changing its catalog.

## Navigation cost

Tileset tiles may carry an optional `navigationCost` (integer 1-100, lower = preferred; imported into
`VulcanusTile.TryGetNavigationCost`, absent = unset). The tileset importer throws for values outside that range
(tilesets are not schema-validated on import). `NavigationCostGridBuilder` bakes one `NavigationCostGrid` per map at
import (`VulcanusImportedMap.NavigationCosts`), in Unity cell coordinates (`y = height - 1 - vulcanusY`, like
`PopulateTileLayer`). The rule, mirrored by Vulcanus' overlay (`docs/navigation-cost.md` in the editor repo):

- A cell starts with the **terrain layer** tile's cost; if that tile has none (or there is no terrain tile) the default
  cost `NavigationCostGrid.DefaultCost` (2) applies. The terrain layer is the first visible terrain layer with tile data,
  the same one `MapImporter` uses as the terrain tilemap, and is always the base regardless of zOrder.
- Every other visible tile or object layer, in ascending `zOrder`, overrides the cost where its tile has a cost. Tiles
  without a cost are transparent. Object layers contribute their placed instances' object tiles (first instance wins).
- Invisible layers are ignored.

The grid also bakes which cells static collision blocks (`NavigationCostGrid.IsBlocked`, built by
`NavigationBlockedCellsBuilder`), so routes on maps that aren't loaded can be planned later (STO-70). A cell is blocked
when collision covers its middle half: tile collisions on visible visual and terrain layers ("full" fills the cell,
"complex" uses its polygon and rectangle shapes), placed objects at their exact position, drawn water covering more than
half the cell, and map collision shapes. `NavigationBakeMatchesPhysicsTests` checks the bake against Physics2D on map-1;
Vulcanus' route preview (`computeBlockedGrid`) follows the same rules. Placed entities are not baked, and live walking
still asks Physics2D, so dynamic obstacles keep blocking.

The scene-independent weighted A* is `Assets/Character/GridPathfinder.cs`. The importer revision was bumped so existing
maps reimport and gain a grid.

## Navigation (NavigateTo)

`CharacterNavigation.NavigateTo(actor, feetDestination, mapManager)` returns a tickable, disposable `NavigationRoute`
(same lifecycle as `MoveTo`'s `NavigationMove`: the caller ticks it and disposes it when interrupted). It plans once, with
`GridPathfinder` over the map's baked `NavigationCostGrid`, then walks the waypoints segment by segment. There is no
re-planning, waiting or stuck handling. No route sets `Status = Unreachable` with an `Error` naming the character, start
and destination tiles. The destination is a feet position (like `characters.walkPath` points); the last waypoint is that
exact position, not the tile centre.

- Tiles are walked at the middle of the sprite as drawn. Imported tile sprites have a top-centre pivot, so a cell's
  sprite hangs half a cell below the logical cell (`MapManager.TileVisualOffset`); routes and the debug view use
  `WorldToVisualTile` / `TileToVisualCenter`, not the logical `TileToWorldCenter`.
- `MoveTo` / `characters.moveTo` / `walkPath` are unchanged: straight lines only, characters block them.
- Blocking is decided at runtime: a tile is blocked when `Physics2D.OverlapBox` with the character's solid footprint
  (shrunk to 90%) hits a non-trigger collider in its collision mask. Colliders on the `Characters` physics layer are ignored,
  so characters never block planning.
- While walking, `NavigationMove` runs in pass-through mode: its solid colliders add the `Characters` layer to
  `excludeLayers` (with `layerOverridePriority = int.MaxValue`, restored on arrival, cancellation and disposal), and its
  straight-segment check ignores that layer. Walls and objects keep their contacts. Every character's solid colliders must
  stay on the `Characters` layer (layer 10, formerly "Player").

Dev tooling (editor only):

- `unity command navigate_to <characterId> <anchorId>` (Play mode): sends a character in the current map to an anchor and
  returns status, total cost and waypoints. `NavigationCommands` ticks the route until it ends, the location unloads or
  Play mode stops, and logs the final status.
- **Tools > Navigation > Show Navigation Debug** (checked state in `EditorPrefs`) draws in the Scene view, with nothing
  added to scenes or prefabs: per-cell cost tint and number of the current map's `NavigationCostGrid` (visible cells only;
  works in Edit mode on an opened map prefab/scene and in Play mode), the cells the last request treated as blocked
  (orange outlines), active routes as cyan polylines with the destination ringed, and the start and goal in red when a
  request failed. Gameplay publishes to the debug view only through the editor-only `NavigationDebug` hook.
