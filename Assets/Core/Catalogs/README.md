# Definition catalogs

There is one `DefinitionCatalog` asset at `Assets/Resources/DefinitionCatalog.asset`.
Consumers inject it and name the definition family in each operation:

```csharp
catalog.Get<ItemDefinition>(id);          // null when absent or disabled
catalog.Require<CharacterDefinition>(id); // fails when required content is missing
catalog.All<SpawnedObject>();             // enabled definitions, including derived types
```

To add a ScriptableObject resource type, derive from `DefinitionScriptableObject`
and annotate its definition class with `[DefinitionResource]`. The base owns the
serialized `Id`, implements `IDefinition`, and validates identity and field rules.
Use `DefinitionScriptableObject<MyValidator>` when the feature has additional rules;
definitions with only field rules do not need an empty validator class. The default
discovery folder is `Assets`; pass a folder to the attribute to restrict discovery.
No catalog subclass, per-type asset, service registration or exporter entry is needed.

```csharp
[DefinitionResource("Assets/Content/MyDefinitions")]
[LuaResource("myResource", DescriptionMember = nameof(DisplayName))] // optional Lua picker
public sealed class MyDefinition : DefinitionScriptableObject
{
    [field: SerializeField] public string DisplayName { get; private set; }
}
```

Definition IDs default to lowercase `namespace:name`. Existing families with other
contracts declare `IdFormat` on `DefinitionResource`: `Any` for nonblank IDs such
as weather's `Sunny`, or `Namespaced` when uppercase names are allowed. Producers
call `SetId` while constructing definitions, before exposing them to gameplay.
Prefab components implement `IDefinition` directly; `SpawnedObject.Id` remains the
prefab identity and `PersistentId` remains the individual saved object's identity.
The relational Vulcanus world asset also implements the interface directly, using
its existing asset name as its ID.

Derived classes belong to their annotated base family: produce, tools and equipment
are all item definitions. IDs match exactly, including case, and must be unique
within a family. Different families can use the same ID. Definition IDs and player
save contracts do not change when content is added to this catalog.

Editor discovery loads definition assets recursively, including root prefab
components. There is no runtime folder scanning. Skills/deities retain their
Resources authoring folders, and spawnables use `Assets/Content/Spawnables`.
`DefaultCatalogAssets.CreateMissingCatalogs()` and **Tools > Catalogs > Create Missing
Catalogs** create the single default asset only when absent. Existing selections
are not overwritten.

Open **Tools > Catalogs > Browse** to filter by definition family, search entries, inspect definitions,
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

`GameServices` loads the required catalog once while building the VContainer scope
and registers it as `DefinitionCatalog`. Missing setup fails at this boundary.
Editor import/export code loads the authored asset directly without a running scope.
Collection validators with feature-specific cross-reference rules annotate their
static method with `[DefinitionValidation(typeof(MyDefinition))]` in editor code.
The shared authoring validation discovers these methods automatically; individual
definition validation continues through `ValidatedScriptableObject`.
Skills/deities retain their instance `Register` APIs, but their session-scoped
dictionaries contain only mod-added definitions;
built-ins resolve directly through the catalog's family ID index. PlantManager
also reads its catalog instead of maintaining a copy. Spawnable enumeration does
not allocate a new array; its spawner still tracks registered prefabs for mods.
Change selections before starting a session, not during play: changing lookup
selection does not rebuild already-active characters, boons, plants or entities.

Adding content of an existing type needs no registry edits: create/import its
definition under the family's discovery path. Unity import/save hooks and the pre-play
and pre-build refresh discover it automatically. Imported source formats must
produce Unity definition assets; arbitrary JSON is not itself a definition asset.
To export a definition family as Lua resource choices, also annotate its class with
`[LuaResource("myResource")]`. Export uses the existing catalog IDs and enabled
entries, sorted by ID. Labels use the definition's asset name, or a public string
field/property named by `DescriptionMember = nameof(MyDefinition.DisplayName)`.
Discovery and export read the definition metadata; no resource provider
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
shared catalog's `VulcanusDialogueAsset` family; each dialogue asset records its own project. IDs match exactly, including case. The
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

The `TypewriterSound` family discovers sounds throughout `Assets` and indexes their lowercase `namespace:name` ID, not asset names. Vulcanus characters pick a default sound (`typewriterSound`) and optional per-emotion overrides (`emotionTypewriterSounds`) from the exported `typewriterSound` resource list. `TypewriterSoundResolver` returns the speaker's sound for the line's emotion, else the speaker's default, else the presenter's default; narrator lines and speakers without a character definition use the presenter's default. Importing a character fails if it names a sound that does not exist. Presenters use `TypewriterSoundResolver`; there is no runtime Resources folder scan or copied dictionary.

The delayed import hook also covers `.vitm` imports, moves and deletions, so imported item definitions and changed IDs update automatically without entering play. Catalog saves also refresh per-family importer dependency hashes; unchanged discovery does not resave the asset.

Importers that consume catalog choices depend on `CatalogDiscovery.DependencyName<T>()`,
not the whole catalog file. Maps depend on the spawnable choices this way. The catalog
also contains imported locations, so a map-to-catalog-file dependency would form a
cycle and reimport maps whenever an unrelated item or other resource changes.

The `LocationData` family discovers definitions throughout `Assets`, including subassets
of imported `.vmap` files. Map imports, moves and deletions also schedule discovery.
`LevelManager` uses this catalog for location and scene lookup, so adding a location
requires no manager assignment. Location IDs match exactly, as in links and world catalogs.
Project-scoped world catalogs remain
responsible for map/prefab relationships; they do not register runtime locations.
