# Vulcanus map imports

`.vproj` imports project definitions, `.vts` imports tiles and reusable object prefabs,
and `.vmap` imports a map prefab plus its `LocationData` subasset. The importer declares
project, tileset, and sprite-sheet dependencies before import so a fresh collection of
source files imports in the correct order.

Tileset references resolve by the authored JSON `id`, case-insensitively. A filename
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

`LevelManager` loads the explicit scene path and uses it to resolve initial locations
and filter location lifecycle callbacks. Hand-authored locations without a scene path
continue to use their ID as the scene name.

Run the `MapLoading` EditMode category for catalog, path, decoding, and integration
coverage. Integration tests import disposable source assets, preserve Build Settings,
and read the project's registered spawnable prefab without changing its catalog.
