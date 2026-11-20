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
is used by automatic initialization. The spawnable catalog is a default
Resources catalog like the others; there is no inventory-specific catalog builder.

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

`SystemRoot` discovers `[DefaultCatalog]` declarations through reflection, loads
each required Resources asset once while building the VContainer scope, and
registers it by its concrete type. Consumers inject the catalog they need; there
is no static catalog cache or central catalog list. Editor import/export code
loads authored assets directly and does not need a running scope.
Skills/deities retain their instance `Register` APIs, but their session-scoped
dictionaries contain only mod-added definitions;
built-ins resolve directly through the catalog's single ID index. PlantManager
also reads its catalog instead of maintaining a copy. Spawnable enumeration does
not allocate a new array; its spawner still tracks registered prefabs for mods.
Change selections before starting a session, not during play: changing lookup
selection does not rebuild already-active characters, boons, plants or entities.

Adding content of an existing type needs no registry edits: create/import its
definition under that catalog's `Path`. Unity import/save hooks and the pre-play
and pre-build refresh discover it automatically. Imported source formats must
produce Unity definition assets; arbitrary JSON is not itself a definition asset.
For a *new catalog type*, add `[DefaultCatalog(MyCatalog.ResourceName)]` to its
class if it needs a default Resources asset. Editor setup discovers this declaration;
there is no central list to update. Explicitly assigned catalogs omit the attribute.

To export a catalog as Lua resource choices, also annotate its class with
`[LuaResource("myResource")]`. Export uses the existing catalog IDs and enabled
entries, sorted by ID. Labels use the definition's asset name, or a public string
field/property named by `DescriptionMember = nameof(MyDefinition.DisplayName)`.
Discovery, default asset loading and export use reflection; no resource provider
class or exporter registration is required. Animation choices retain their special
finite-single-clip filtering, and directions come from the shared cardinal values.

Cutscenes use the same pipeline: `.runtime.cutscene.json` sources under Assets
import into `CutsceneDefinition` assets, and `CutsceneCatalog` discovers them.
The source schema and Lua action manifest are import dependencies. Invalid
current cutscene sources block Play Mode and builds even if Unity retained an
older artifact. Map/actor/dialogue references are bound before playback.

## Specialized catalogs

Do not force relationship data into the flat definition base. Vulcanus world
catalogs retain map/location/prefab bindings. Dialogues use the discovered
`DialogueCatalog`; each dialogue asset records its own project. IDs match exactly, including case, in every catalog. The
world catalogs share `IdIndex.FirstWins`, preserving their first-binding-wins
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

`TypewriterSoundCatalog` discovers sounds throughout `Assets` and indexes their lowercase `namespace:name` ID, not asset names. Vulcanus characters pick a default sound (`typewriterSound`) and optional per-emotion overrides (`emotionTypewriterSounds`) from the exported `typewriterSound` resource list. `TypewriterSoundResolver` returns the speaker's sound for the line's emotion, else the speaker's default, else the presenter's default; narrator lines and speakers without a character definition use the presenter's default. Importing a character fails if it names a sound that does not exist. `DataManager` exposes this catalog directly, and all presenters use `TypewriterSoundResolver`; there is no Resources folder scan or copied list/dictionary.

The delayed import hook also covers `.vitm` imports, moves and deletions, so imported item definitions and changed IDs update automatically without entering play. Catalog writes remain excluded from import-triggered scheduling to avoid refresh loops.

`LocationCatalog` discovers `LocationData` throughout `Assets`, including subassets
of imported `.vmap` files. Map imports, moves and deletions also schedule discovery.
`LevelManager` uses this catalog for location and scene lookup, so adding a location
requires no manager assignment. Location IDs match exactly, as in links and world catalogs.
Project-scoped world catalogs remain
responsible for map/prefab relationships; they do not register runtime locations.
