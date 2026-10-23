# Definition catalogs

Derive a concrete ScriptableObject from `DefinitionCatalog<T>` and override:

```csharp
public override string Path => "Assets/Content/MyDefinitions";
protected override string GetDefinitionId(MyDefinition definition) => definition.Id;
```

Create its catalog asset (normally via its `CreateAssetMenu`). The shared editor
discovery finds every catalog asset and recursively discovers definitions of its
type under `Path`. No runtime folder scanning occurs. Items, skills, deities,
plants, typewriter sounds and spawnables use this pipeline. Items and plants search `Assets` because their
definitions live in multiple folders; skills/deities keep their existing
Resources authoring folders, and spawnables search `Assets/Content/Spawnables`.
`DefaultCatalogAssets.CreateMissingCatalogs()` creates the default Resources
catalog assets when absent and returns only those it created. Existing assets
and enabled selections are not overwritten. **Tools > Catalogs > Create Missing
Catalogs** reports the result and schedules discovery separately. The same API
is used by automatic initialization. Spawnables keep their explicitly assigned
catalog asset; there is no inventory-specific catalog builder.

Open **Tools > Catalogs > Browse** to select a catalog, search entries, inspect definitions,
toggle Enabled, or refresh discovery. Existing choices are preserved by asset
reference across refresh, rename and moves within the discovery path. New entries
default to enabled; deleted/out-of-path assets are removed. Returning a removed
asset later counts as a new entry. Enable/disable edits support Undo and are saved
in the catalog asset. They do not alter the original definition.

Disabled entries return null from ID lookup. They remain referenced by the catalog
and may still be included in the build; disabling is not asset stripping. This is
lookup selection, not a global gameplay veto: direct references from shops,
starting loadouts, prefabs or inventory runtime caches can still use a definition.
Global restrictions would require those consumers to explicitly consult catalogs.

Discovery checks IDs and folders before replacing entries. Invalid discovery logs
an editor error, preserves the old list, and blocks a build. Validation belongs
at this authoring boundary, not in each runtime lookup. Catalogs are authoring
data, not player save state. Refresh also runs before entering Play Mode.

`CatalogResources` caches individual catalog loads and resets between play
sessions (including when domain reload is disabled). Skills/deities retain their
mod `Register` APIs, but their dictionaries contain only mod-added definitions;
built-ins resolve directly through the catalog's single ID index. PlantManager
also reads its catalog instead of maintaining a copy. Spawnable enumeration does
not allocate a new array; its spawner still tracks registered prefabs for mods.
Change selections before starting a session, not during play: changing lookup
selection does not rebuild already-active characters, boons, plants or entities.

Adding content of an existing type needs no registry edits: create/import its
definition under that catalog's `Path`. Unity import/save hooks and the pre-play
and pre-build refresh discover it automatically. Imported source formats must
produce Unity definition assets; arbitrary JSON is not itself a definition asset.
Adding a *new catalog type* still requires its class and, if desired, one default
asset registration in `DefaultCatalogAssets` (not one registration per content item).

Cutscenes use the same pipeline: `.runtime.cutscene.json` sources under Assets
import into `CutsceneDefinition` assets, and `CutsceneCatalog` discovers them.
The source schema and Lua action manifest are import dependencies. Invalid
current cutscene sources block Play Mode and builds even if Unity retained an
older artifact. Map/actor/dialogue references are bound before playback.

## Specialized catalogs

Do not force relationship data into the flat definition base. Vulcanus world
catalogs retain map/location/prefab bindings, and dialogue databases retain their
project association. Both now share `IdIndex.FirstWins`, explicitly selecting
case-insensitive comparison and preserving their existing first-binding-wins
policy. The helper deliberately does not validate definitions.

`CatalogAssetDiscovery.Find(folder, type)` is a separate editor-only helper for
ordered recursive asset loading, including root prefab components. A specialized
editor can use it without inheriting `DefinitionCatalog`; retain its project
scope and import dependencies. Do not scan AssetDatabase from runtime code or
inside a ScriptedImporter just to rebuild a global catalog.

Season arrays and weighted weather choices remain separate: ordering and weights
carry gameplay meaning and must not become a sorted flat catalog.

## TODO: test-session profiles

- A separate `GameTestProfile` asset choosing new-game season/day and per-catalog
  selection overrides. Do not put game-start configuration in the catalog base.
- Apply profile selections to session-local catalog views, without modifying the
  authored catalog assets or persisting derived selections in player saves.
- If definition-value overrides become useful, use runtime copies or a separate
  override layer; never edit the original ScriptableObject during Play Mode.
- Decide how disabled content affects direct consumers before promising a global
  "disable this mechanic/item" switch. No profiles or runtime overrides exist yet.

## Speaker audio and comparison rules

`TypewriterSoundCatalog` discovers sounds throughout `Assets` and indexes `ActorId`, not asset names. It preserves case-insensitive speaker matching through `IdComparer`; flat catalogs otherwise retain ordinal comparison. Shared duplicate validation uses the same comparer as lookup, so `Player` and `player` cannot coexist in the speaker catalog. `DataManager` exposes this catalog directly, and all presenters use `TypewriterSoundResolver`; there is no Resources folder scan or copied list/dictionary.

The delayed import hook also covers `.vitm` imports, moves and deletions, so imported item definitions and changed IDs update automatically without entering play. Catalog writes remain excluded from import-triggered scheduling to avoid refresh loops.
