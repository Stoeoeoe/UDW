# ScriptableObject review

Reviewed 5 October 2026 against the current working tree, including in-progress catalog changes.

The strongest next step is to unify **authoring validation, identity policy, and discovery triggers**. The existing catalog abstraction already handles most flat definition collections. A universal ScriptableObject base class would add less value and would blur useful differences between definitions, imported graphs, ordered configuration, and transient runtime data.

## Scope and evidence

- Inventoried project C# declarations under `Assets`, including indirect item/catalog subclasses and the `Tile` subclass. Also inventoried vendor declarations under `Assets/Plugins`, `Assets/TopDownEngine`, and the SuperTiled2Unity sources in root `Runtime` and `Editor`.
- Found **27 concrete production asset types**, **6 abstract/base declarations** (counting both catalog arities), and **3 test-only types** in the game code. `GameplayTagCatalog` is editor-only; `VulcanusTile` inherits ScriptableObject through Unity's tile hierarchy.
- Checked serialized `.asset` files through their script GUIDs, relevant prefabs, source import files, consumers, importer code, and existing test source. Found 31 `.asset` records pointing to project asset scripts, including one obsolete/mismatched hoe record. This is a disk inventory, not an AssetDatabase enumeration.
- Imported assets must be counted separately: two `.vproj`, two `.vts`, one `.vitm`, one `.entity.json`, and one `.runtime.dialogue.json` source file. A tileset produces many tile subassets; these are not extra `.asset` files.
- Started with graphify queries and verified findings in current source. No wiki index was present. Some graph locations differ from current source, so source links below are authoritative.
- The initial review was read-only and did not run Unity tests. Subsequent implementation status and verification are noted under each finding. Runtime consequences in unresolved findings remain static findings; editor materialization and binary/package assets require Unity verification. Framework-derived inspectors/importers and package/DLL-defined Unity types are not treated as game content definitions.

## Findings, ordered by impact

### 1. Season progression has two conflicting sources of truth — high priority

**Implementation status (5 October 2026):** rollover now calls `GameCalendar.GetNextSeason(time.season)`. The unused legacy `SeasonData.index` field and the index-specific manager regression test were removed by the user. Existing calendar-order tests remain. Runtime/editor compilation passed after that cleanup; tests have not been executed. Configuration validation remains a separate follow-up.

At the initial review, [UrTimeManager.StartNewDay](../Assets/Core/TimeAndWeather/UrTimeManager.cs:263) selected the next season with `seasons[currentSeasonData.index % seasons.Length]`. [GameCalendar.GetNextSeason](../Assets/Core/TimeAndWeather/GameCalendar.cs:20) used configured array order and was called only by its tests.

The shipped SystemRoot order is Spring, Summer, Autumn, Winter. Their authored `index` values are respectively 1, 0, 3, 3. The original rollover therefore went Spring → Summer → Spring, while Winter pointed back to Winter. Calendar cooldown deadlines used array order, so progression and deadline calculation disagreed. This also contradicted the project's explicit calendar rule in AGENTS.md.

**Unify:** make `StartNewDay` use `Calendar.GetNextSeason(time.season)`. Remove or deprecate the redundant `SeasonData.index` authoring field after checking external authoring dependencies. Validate nonempty seasons, unique season values, nonnull entries, positive season duration, and a valid starting season/day.

**Verification needed:** an integration test that drives `UrTimeManager.StartNewDay` through a season boundary with deliberately misleading asset indices. Existing [GameCalendarTests](../Assets/Core/TimeAndWeather/Editor/GameCalendarTests.cs:60) test the helper, so they do not catch this disconnected consumer.

### 2. Imported definitions do not trigger automatic catalog refresh — medium priority

**Implementation status:** `.vitm` imports, moves and deletions now schedule the shared delayed refresh. An integration test covers initial import, changed IDs and deletion without a manual catalog refresh. Runtime/editor compilation passed; Unity test execution remains pending. The original evidence follows.

[CatalogDiscovery.OnPostprocessAllAssets](../Assets/Core/Catalogs/Editor/CatalogDiscovery.cs:63) schedules refresh only for `.asset` and `.prefab` paths. [ItemImporter](../Assets/Core/Tile/Editor/Vulcanus/ItemImporter.cs:87) creates an `ItemDefinition` as the main object of a `.vitm` import. The hook ignores that source extension, including its deletion and movement.

**Consequence:** importing a new `.vitm` alone can leave the catalog stale until another qualifying asset change, save, manual refresh, or the pre-play/pre-build refresh. Those later refreshes make this a freshness gap, not a claim that imported items can never be discovered. An import-time error also falls back to TextAsset, which can silently remove the definition on the next refresh.

**Unify:** extend the shared post-import scheduling policy to supported definition-producing imports. Keep discovery delayed and outside ScriptedImporter execution. Include imported, deleted, moved, and old paths; retain the guard against catalog-save refresh loops. ID changes should invalidate the catalog index even when its references remain unchanged, as `Refresh` already does.

**Verification needed:** import/move/delete a valid `.vitm` and observe catalog changes without entering play or manually refreshing.

### 3. A legacy hoe asset points to an abstract game item script — medium priority

**Implementation status:** the obsolete hoe asset and its metadata were removed by the user. The evidence below records the original review snapshot.

[HoeInventoryItem.asset](../Assets/Interaction/Tools/Hoe/HoeInventoryItem.asset:12) references GUID `2c045c4cb91b40bc945c2007b82ef9e9`, which now belongs to [EquippableItem.cs](../Assets/Core/Items/EquippableItem.cs:9), an abstract class. Its stored class identifier and fields still describe MoreMountains `BaseItem` (`ItemID`, `MaximumStack`, `Quantity`, etc.), rather than the current `ItemDefinition` layout.

This is an obsolete serialization binding, not a valid second implementation of the new item model. Whether Unity presents it as a missing/unloadable script needs editor verification. No reference to the asset's GUID was found in scanned `.prefab`, `.unity`, or `.asset` files.

**Action:** inspect it in Unity and either replace it with a correctly authored concrete `ToolData`, or retire it after a full AssetDatabase dependency check. Do not adapt the game's inventory back to vendor item state to keep this one asset working. Do not delete it based only on this static scan.

### 4. Typewriter lookup uses two different identities and duplicates resolution logic — medium priority

**Implementation status:** the default `TypewriterSoundCatalog` indexes `ActorId` with ordinal case-insensitive matching and matching duplicate validation. `DataManager` exposes the catalog without a Start-time scan or copied collections; the Vulcan presenter delegates to the shared resolver. Tests cover asset-name independence, case matching, disabled entries and conflicting actor IDs. Runtime/editor compilation passed; Unity test execution remains pending. Pitch validation remains part of the broader definition-validation follow-up. The original evidence follows.

[DataManager](../Assets/Core/Data/DataManager.cs:24) scans Resources in `Start` and creates a dictionary keyed by asset **name**. Both [TypewriterSoundResolver](../Assets/Interaction/Dialogue/TypewriterSoundResolver.cs:41) and [VulcanusDialogueUGUIPresenter](../Assets/Core/Dialogue/Vulcanus/VulcanusDialogueUGUIPresenter.cs:362) then look up a speaker ID and fall back to scanning the list by **ActorId**, ignoring case.

The actual asset is named `StandardTypewriterSounds`, with `ActorId: Player`. Its intended mapping consequently takes the fallback path. Duplicate file names can throw during `ToDictionary`; duplicate ActorIds are not validated. The code default Resources path is singular `TypewriterSound`, while the prefab override and actual folder are plural `TypewriterSounds`; the current prefab avoids that mismatch.

**Unify:** add a `TypewriterSoundCatalog` using `ActorId`, settle on a documented comparison policy, and use one resolver from all presenters. Validate duplicate actor IDs and pitch bounds before play/build. Removing the copied list/dictionary/fallback loops also reduces initialization-order dependence on `DataManager.Start`.

Do not silently choose case-sensitive lookup when moving to `DefinitionCatalog`, whose current index uses `StringComparer.Ordinal`: the existing fallback treats ActorIds case-insensitively. Either make comparer policy configurable for this catalog, or explicitly normalize and validate keys.

### 5. Definition identity checks are embedded in a generic catalog validator — medium priority

**Implementation status (5 October 2026):** shared ID predicates now cover nonblank, namespaced and strict lowercase namespaced forms. Catalog authoring checks and skill mod registration use the appropriate shared rule; deity registration uses the shared nonblank rule. Per-type validation remains at the authoring boundary. Compilation passed; tests have not been run.

[CatalogValidation](../Assets/Core/Catalogs/Editor/CatalogValidation.cs:13) knows specific gameplay types (`SkillDefinition`, `SpawnedObject`). Skill mod registration separately repeats its namespace/whitespace checks. Deity mod registration only requires a nonblank ID. Items default a missing ID to asset name; plants accept any nonblank ID. Locations show the namespaced-ID drawer but currently contain legacy unnamespaced IDs.

Lookup policies also differ deliberately: flat catalogs and saved state use ordinal keys; Vulcan world/dialogue bindings and location resolution are case-insensitive and first-wins. Skill validation allows more forms than the strict lowercase spawnable regex. An Inspector drawer is authoring assistance, not validation.

**Unify:** extract small reusable ID validators and let each catalog/definition choose its policy. Keep structural checks (folder, missing definition, duplicate ID) in shared discovery; put type-specific rules in a per-type validator. Reuse those rules at the mod registration boundary. Keep `ItemId`, `SkillId`, and imported IDs unchanged while adding an optional common `Id` interface/property.

This does **not** justify rewriting all IDs to `base:*`: saved keys and external formats already use different conventions. Existing stable IDs remain stable; stricter rules can apply to new content without introducing save migrations.

### 6. Validation is mostly about IDs, not whether definitions can execute — medium priority

**Implementation status (5 October 2026):** plant catalogs now reject missing stages, stages without a day-zero seed, non-increasing or negative thresholds, and missing or invalid sprite/prefab representations. Other type-specific checks in the table remain follow-up work. Compilation passed; tests have not been run.

Examples of missing authoring checks:

| Type | Rules worth validating before play/build |
|---|---|
| Items | Positive `MaxStackSize`; nonnegative prices; concrete instantiable class; required subtype references. |
| Plants | Nonempty/non-null growth stages; usable day-zero seed stage; increasing nonnegative thresholds; valid sprite/prefab representation. |
| Tools | Nonnegative charge/cost/timing values; required effect/animation data according to actual action behavior. |
| Deities/boons/skills | Valid thresholds/levels, nonnull nested records, valid tags, finite attribute modifiers. Optional presentation fields should remain optional. |
| Terrain | Unique `TerrainType` in the map's configured set; required sound assignment if footsteps assume one. |
| Sounds | Finite, ordered pitch bounds; valid clips, with silence allowed where intentionally supported. |
| Seasons/weather | Valid ordered season configuration; nonempty weighted choices with valid references and finite nonnegative weights; an explicit all-zero-weight policy. |
| Spawnables | Active prefab root and required root component; valid ID; assigned Systems catalog. Root-only discovery silently skips child-only components. |
| Shops | Existing offering validation, plus enforcement through the same pre-play/build path. |
| Imported catalogs | Duplicate/conflicting bindings, project association, unresolved required references, and import errors. |

[ShopDefinition.OnValidate](../Assets/Core/Shops/ShopDefinition.cs:35) already has comparatively strong checks, but logs an error and is outside the generic catalog build validator. [MapManager](../Assets/Core/Tile/MapManager.cs:89) and `UrTimeManager.Start` build dictionaries from Inspector arrays without a shared authoring check. `[Min]` and `[Range]` do not validate every import or programmatic assignment.

**Unify:** reusable per-type validation returning actionable diagnostics with asset and field paths; call it from Inspector feedback, importer completion, pre-play, and pre-build. Aggregate errors so authors see all problems. Required errors should stop play/build; intentional optional omissions should not.

Avoid runtime folder scans and validation on every lookup. Keep any necessary runtime/mod-boundary checks focused on incoming data.

### 7. Plant growth selection should have one implementation — medium priority, partly latent

**Implementation status (5 October 2026):** stage and index access now share one threshold-based selection method; authored list order defines progression, and malformed stage data is rejected during catalog discovery. Compilation passed; tests have not been run.

[PlantData](../Assets/Plants/PlantData.cs:14) has three overlapping ways to select a stage. `GetGrowthStageByDays` calls LINQ `Max` on `GrowthStage` objects, but [GrowthStage](../Assets/Plants/GrowthStage.cs:8) implements no comparison. With multiple eligible stages this attempts to compare non-comparable records. No current call site to that method was found, so this is a latent defect rather than a demonstrated active failure.

`GetGrowthStageIndexByDays` instead selects the last eligible entry in list order, initializing the answer to zero even when no threshold qualifies. `GetSeedStage` selects the first threshold ≤ 0. Unordered stages can therefore make these methods disagree.

**Unify:** retain one threshold-selection algorithm with a clearly documented ordering/eligibility contract, and implement both index and stage access through it. Validate authored order rather than silently sorting during runtime. Keep `SeedItem` as an inventory definition referencing `PlantData`; keep per-plant growth in `PlantState`.

The two inspected plant assets have day-zero stages and ordered thresholds; this finding does not claim those assets are currently malformed.

### 8. Transient transition data is serialized into a shared asset — medium priority, lifecycle risk

**Implementation status (5 October 2026):** pending entry/facing values now travel as `LevelManager` method arguments and never live in an asset. Initial editor-preview values are serialized on the manager; the mutable `TransitionContext` asset and its reference have been removed. Runtime/editor compilation passed; tests have not been run.

Before this fix, the `TransitionContext` asset held mutable public fields. `LevelManager` set them before a transition and cleared them after placement, so a failed/interrupted transition or play session could leave stale data. The request now travels through `LevelManager` method arguments.

**Ownership:** keep authored initial preview values on `LevelManager` and pass each pending request through the load call. Do not move this transient data into `GameSaveData`.

Do not move pending transition data into `GameSaveData` unless it should survive save/load. For overlapping scene loads, a latest-wins counter alone is insufficient: earlier loads have scene side effects and need cancellation/serialization/cleanup.

### 9. Surface pitch settings are disconnected from playback — low to medium priority

**Implementation status (5 October 2026):** footstep pitch now uses the selected `SurfaceSound` range, with neutral pitch when no surface profile is assigned. The duplicate pitch range was removed from `MovementAbility`. Runtime/editor compilation passed; tests have not been run.

[SurfaceSound](../Assets/Core/Tile/SurfaceSound.cs:6) stores `minPitch`/`maxPitch`, but [MovementAbility](../Assets/Character/Abilities/MovementAbility.cs:50) uses its own `pitchMin`/`pitchMax` instead. Editing surface pitch therefore has no effect on this playback path.

The expression `terrain?.SurfaceSound.walkSound` also protects against a missing terrain, but not a missing `SurfaceSound` on an existing terrain. Current terrain assets inspected have assigned sound references; this is a validation/null-handling gap.

**Unify:** `SurfaceSound` owns footstep pitch because the range varies with terrain. Keep typewriter pitch on `TypewriterSound`; the two sound assets model different audio behavior. Keep their sound assets separate because one models walk/run and the other models per-speaker character audio. A global sound catalog is unnecessary for directly referenced surface profiles.

### 10. Public mutation APIs can bypass definition cache invalidation — low priority, preventive

**Implementation status (5 October 2026):** plant growth-stage authoring fields are serialized privately and exposed through read-only accessors; importer catalog getters return array snapshots, and derived dictionaries are explicitly runtime-only. Mutable referenced mapping/message records and other unrelated definitions remain outside this pass.

`PlantData` now exposes its stage list and stage fields read-only. `VulcanWorldCatalog`, `VulcanusDialogueDatabase`, and `VulcanusDialogueAsset` return array snapshots; cached world map bindings and imported dialogue messages use read-only properties, and runtime dictionaries are explicitly nonserialized. `ShopOffering`, `SkillLevelDefinition.GrantedTags`, nested `SpriteOrPrefab`, and project mapping records still expose mutable data, so full deep immutability remains out of scope.

**Unify:** private serialized authoring fields with read-only public access; mutations only through importer/editor configuration APIs that invalidate indexes. `IReadOnlyList` reduces accidental writes but is not deep immutability if contained objects remain mutable. Make runtime cache intent explicit, using `[NonSerialized]` where appropriate for consistency with the save/runtime conventions; ordinary Unity does not serialize these plain dictionaries already.

Do not move serialized fields into a new base class just to standardize names. Preserve existing serialized field/property backing names unless a deliberate asset conversion is part of the change.

### 11. Imported property schemas and diagnostics can share utilities — low priority

**Implementation status (5 October 2026):** item import now warns with the item ID, property key and target type when a class property cannot be applied. The two serialized property schema structs remain separate to avoid changing their asset type identities; shared importer diagnostics/schema design remains a follow-up.

[VulcanusProject.PropertyDefinition](../Assets/Core/Tile/Vulcan/VulcanProject.cs:31) and [VulcanEntityDefinition.PropertyDefinition](../Assets/Core/Tile/Vulcan/VulcanEntityDefinition.cs:10) repeat the same key/label/type/default/required shape. Import configuration and diagnostic plumbing repeat across the imported assets.

[ItemImporter](../Assets/Core/Tile/Editor/Vulcanus/ItemImporter.cs:118) ignores the return value from `TryApplyPropertyToObject`. The actual `gugu.vitm` contains `numberOfDays`, which the current `SeedItem` does not declare. Exact class resolution depends on project mapping, so successful import of that example is unverified; when the class resolves, an unsupported property can disappear without a field-specific diagnostic.

**Unify:** shared serializable schema records where their external semantics really match; common diagnostic records and reporting; validate a typed imported definition after configuring it. Report unknown/unassignable properties rather than silently swallowing all setter failures; item import now logs the class-property failures, while other importer paths need a separate diagnostic pass. Keep the reflection-based conversion confined to import time. Imported fields with special meanings still belong to their domain types.

### 12. Remaining asset-authoring inconsistencies — low priority or informational

**Implementation status (5 October 2026):** removed the unused duplicate `ToolData.toolName` field, populated inherited item names for the hoe and watering jar, and grouped tool, plant, terrain and season asset menus under consistent categories. Other informational authoring observations below remain unchanged.

**Implementation status (5 October 2026):** removed the unused duplicate `ToolData.toolName` field, populated inherited item names for the hoe and watering jar, and grouped tool, plant, terrain and season asset menus under consistent categories. Other informational authoring observations below remain unchanged.

- The four default Resources catalog `.asset` files were absent at review time. [DefaultCatalogAssets](../Assets/Core/Catalogs/Editor/DefaultCatalogAssets.cs:17) creates them automatically, including before play/build. Confirm their generated contents and intended source-control policy after Unity imports the current changes. Absence alone is not a runtime defect if bootstrapping runs successfully.
- [TestSkill.asset](../Assets/Skills/TestSkill.asset:15) has ID `TestSkill` and lives outside `SkillCatalog.Path` (`Assets/Resources/Skills`). It will not be discovered by that default catalog. If this is intended shipped content, give it a valid authored ID and put/import it within the chosen discovery scope; if it is a deliberate fixture, document that. Do not automatically broaden all catalog scopes just for an unused test asset.
- `ToolData.toolName` was removed as an unused duplicate of inherited `ItemName`; the two shipped tool assets now have distinct inherited display names.
- Tool, plant, terrain and season creation menus now use grouped categories under `Game/Items`, `Game/World` and `Game/Time`.
- `WeatherData.locationFilter`, `playMusic`, `weatherMusic`, and `weatherRendererFeature` have no C# consumer found in the project source scan; `weatherMaterial` is consumed by the weather renderer feature. Verify external/serialized integrations before removing dormant fields or promising their behavior. Weather selection is rerolled on saved-time refresh; the save root does not currently hold a selected weather ID. Decide whether weather continuity is required before adding persistent weather state.

## Complete game asset inventory

Counts are matching on-disk `.asset` records, not imported subassets or runtime-created instances. Zero means no matching `.asset` file found, not necessarily unused code.

| Concrete type | Count | Role and unification decision |
|---|---:|---|
| [ItemCatalog](../Assets/Core/Inventory/ItemCatalog.cs:8) | 0 | Flat ID lookup; keep shared catalog base and default bootstrap. |
| [SkillCatalog](../Assets/Character/SkillCatalog.cs:7) | 0 | Flat ID lookup; keep scoped discovery and built-in catalog index. |
| [DeityCatalog](../Assets/Core/Divinity/DeityCatalog.cs:7) | 0 | Flat ID lookup; keep built-ins separate from mod dictionary. |
| [PlantCatalog](../Assets/Plants/PlantCatalog.cs:7) | 0 | Flat ID lookup; keep all-Assets discovery and manager delegation. |
| [SpawnableCatalog](../Assets/Core/Spawning/SpawnableCatalog.cs:9) | 1 | Flat root-prefab lookup; keep explicit Systems assignment. |
| [SkillDefinition](../Assets/Character/SkillDefinition.cs:10) | 2 | Authored level effects and presentation; common identity/presentation interfaces are optional. |
| [DeityDefinition](../Assets/Core/Divinity/DeityDefinition.cs:8) | 1 | Authored thresholds/decay/presentation; domain validation belongs here. |
| [BoonDefinition](../Assets/Core/Divinity/BoonDefinition.cs:10) | 1 | Reusable effects; already shares `CharacterGrant` with skills. No independent save ID/catalog needed. |
| [ToolData](../Assets/Interaction/Tools/ToolData.cs:11) | 2 | Item specialization; remove redundant name only after usage verification. |
| [SeedItem](../Assets/Plants/SeedItem.cs:10) | 2 | Item specialization referencing a plant; keep that relationship. |
| [PlantData](../Assets/Plants/PlantData.cs:9) | 2 | Species/growth definition; unify stage selection and validation. |
| [ShopDefinition](../Assets/Core/Shops/ShopDefinition.cs:25) | 0 | Ordered offerings; keep stock in `ShopState`, not this asset. No catalog needed until global definition lookup is required. |
| [LocationData](../Assets/Core/Location/LocationData.cs:7) | 2 | Location identity/type/label; good candidate for a flat `LocationCatalog`. |
| [TerrainData](../Assets/Core/Tile/TerrainData.cs:7) | 4 | Terrain enum → surface profile; validate configured set. A terrain catalog is optional. |
| [SurfaceSound](../Assets/Core/Tile/SurfaceSound.cs:6) | 2 | Shared walk/run audio profile; direct references are sufficient. |
| [TypewriterSound](../Assets/Interaction/Dialogue/TypewriterSound.cs:8) | 1 | Speaker → audio mapping; good flat-catalog candidate. |
| [SeasonData](../Assets/Core/TimeAndWeather/SeasonData.cs:7) | 4 | Ordered calendar entry and weighted weather configuration; keep order and weights. |
| [WeatherData](../Assets/Core/TimeAndWeather/Weather/WeatherData.cs:11) | 2 | Weather effects/profile; direct weighted references suffice today. Catalog only if ID resolution becomes necessary. |
| [VulcanusProject](../Assets/Core/Tile/Vulcan/VulcanProject.cs:9) | 0 | Imported project schema/configuration; two `.vproj` sources. Keep project scope. |
| [VulcanEntityDefinition](../Assets/Core/Tile/Vulcan/VulcanEntityDefinition.cs:7) | 0 | Imported entity schema; one `.entity.json` source. Preserve import-time conversion. |
| [VulcanusTilesetAsset](../Assets/Core/Tile/Vulcan/VulcanTilesetAsset.cs:7) | 0 | Imported indexed tiles/object definitions; two `.vts` sources. Keep indexed layout. |
| [VulcanusTile](../Assets/Core/Tile/Vulcan/VulcanTile.cs:16) | 0 | Imported Unity tile subasset; keep Unity tile inheritance. |
| [VulcanusWorldCatalog](../Assets/Core/Tile/Vulcan/VulcanWorldCatalog.cs:10) | 1 | Relational map/location/prefab bindings; keep specialized shape and shared `IdIndex`. |
| [VulcanusDialogueAsset](../Assets/Core/Dialogue/Vulcanus/VulcanusDialogueAsset.cs:10) | 0 | Imported executable graph and messages; one runtime dialogue source. Keep graph shape. |
| [VulcanusDialogueDatabase](../Assets/Core/Dialogue/Vulcanus/VulcanusDialogueDatabase.cs:10) | 1 | Project-associated dialogue lookup; keep association and shared `IdIndex`. |
| [GameplayTagCatalog](../Assets/Core/GameplayTags/Editor/GameplayTagCatalog.cs:8) | 1 | Editor-only string vocabulary; keep separate from runtime asset catalogs. |

Abstract/base declarations: `ItemDefinition`, `EquippableItem`, `ConsumableItem`, `PlaceableItem`, `DefinitionCatalog`, `DefinitionCatalog<T>`. Test-only types: `InventoryTestItem`, `ShopTestItem`, `CatalogTestDefinitionCatalog`. Together with the 27 concrete types, these account for all 36 game-code declarations found.

## What should remain separate

1. **Saved state and definitions.** Inventory slots, held stacks, wallet balances, skills, favour, plant growth, shop stock, spawned placement and interaction deadlines already have plain saved-state owners. Preserve `GameSaveData` as the single live root and definition IDs as references. Do not add ScriptableObject references or a second capture/restore mapping.
2. **Flat catalogs and relationships.** Use `DefinitionCatalog<T>` for independently discovered keyed definitions. Keep Vulcan world and dialogue catalogs specialized; their association, fallback and first-binding policy carry domain meaning. Reuse discovery/validation utilities without forcing their data into flat entries.
3. **Calendar order and lookup order.** Sorting definitions for deterministic discovery is appropriate; sorting seasons or weighted weather configuration changes gameplay.
4. **Asset content and behavior.** Items describe content; actions/characters own execution. Skills and boons already share `CharacterGrant`; further effect-system inheritance is unnecessary until another real consumer requires it.
5. **Vendor models and game models.** MoreMountains and Pixel Crushers APIs have their own serialized schemas and lifecycle. Adapt at integration boundaries rather than changing third-party bases. RuleTile, VolumeProfile and ScriptableRendererFeature are engine/package contracts, not candidates for the game catalog hierarchy.

## Recommended sequence

1. Fix the season rollover consumer and verify boundary behavior; inspect the legacy hoe asset.
2. Close imported-definition refresh gaps; add diagnostics for failed item property assignments.
3. Introduce reusable per-type validation, used by import/editor/pre-play/pre-build and mod registration where applicable.
4. Add `TypewriterSoundCatalog` and a single speaker resolver. Add `LocationCatalog` if location authoring should share enabled selection/discovery; preserve existing scene/location mappings and case policy. Do not turn the relational world catalog into a location list.
5. Separate transient transition data from authored defaults; settle surface pitch ownership and plant stage selection.
6. Adopt read-only definition APIs gradually. Optionally add tiny identity/presentation interfaces (`Id`, `DisplayName`, `Description`, `Icon`) using existing storage. Do not impose icons/descriptions/IDs on types that do not need them.

A shared skill/deity **mod-registry helper** is possible because both maintain a mod-only dictionary, reset between sessions, reject duplicates and delegate built-ins to a catalog. Its benefit is modest with only two consumers; keep type-specific validation and failure behavior visible. The spawner's combined prefab registration table serves materialization and mods, so it should not be removed merely because other systems use catalog lookup directly.

No save-schema bump, backwards-compatibility machinery, broad asset moves, or vendor edits are warranted by this review.

## Validation plan for subsequent implementation

Existing test source covers shared discovery/selection, default catalog creation, first-wins indexing, inventory/shop/world persistence, spawnables, divine favour, calendar helpers and cooldowns. These tests were inspected, not executed.

Add targeted checks for the behaviors that the review exposes: actual manager season rollover; `.vitm` import lifecycle; actor IDs differing from asset names and duplicate/case behavior; invalid growth sequences and stage selection; transient request cleanup; and domain errors preventing builds. After each code change, run the relevant Unity tests and `graphify update .` per AGENTS.md. Preserve asset GUIDs, save IDs, authored enabled choices, location association, and weighted/calendar ordering.

## Third-party and embedded package inventory

The source declaration inventory is appended below. These types were checked for architectural overlap and ownership, rather than subjected to a line-by-line vendor correctness audit. Their presence alone is not a reason to unify or remove them. Precompiled vendor types, engine-native assets, cached UPM package code and imported subasset counts remain outside this static enumeration.

| Family | Types | Recommended treatment |
|---|---|---|
| MoreMountains inventory | `InventoryItem`, `BaseItem`, demo armor/bomb/health/weapon items, TopDownEngine inventory health/key/weapon adapters | Keep vendor inventory independent. The obsolete hoe binding is a game-asset cleanup issue. |
| MoreMountains audio/feedback/tools | Settings, playlists, channels, sequences, loot tables, achievements, debug/configuration assets | Keep vendor ownership; configure or wrap APIs rather than changing their serialized bases. |
| Pixel Crushers | Dialogue databases, localization/text/font assets, faction/emotion/deed definitions, spawned-object lists and wrapper subclasses | Keep vendor schemas and wrappers. Share game-level speaker resolution where both dialogue systems need it. |
| AllIn1 VFX | Helper and demo effect/texture collections | Independent rendering/demo tooling; no game catalog abstraction needed. |
| SuperTiled2Unity | Tiles/tilesets, importer assets, settings, icons, sprite providers and errors | Embedded importer/package contracts. Keep separate from Vulcan schemas; remove only as an explicit dependency cleanup. |

### Source declaration appendix

| Type | Base | Source |
|---|---|---|
| `All1VfxDemoEffect` | `ScriptableObject` | [All1VfxDemoEffect.cs](<../Assets/Plugins/AllIn1VfxToolkit/Demo & Assets/Demo/Scripts/All1VfxDemoEffect.cs:6>) |
| `All1VfxDemoEffectCollection` | `ScriptableObject` | [All1VfxDemoEffectCollection.cs](<../Assets/Plugins/AllIn1VfxToolkit/Demo & Assets/Demo/Scripts/All1VfxDemoEffectCollection.cs:6>) |
| `All1VfxDemoTextureCollection` | `ScriptableObject` | [All1VfxDemoTextureCollection.cs](<../Assets/Plugins/AllIn1VfxToolkit/Demo & Assets/Textures Demo/Scripts/All1VfxDemoTextureCollection.cs:6>) |
| `AllIn1ParticleHelperSO` | `ScriptableObject` | [AllIn1ParticleHelperSO.cs](<../Assets/Plugins/AllIn1VfxToolkit/Scripts/AllIn1ParticleHelperSO.cs:6>) |
| `SpawnedObjectList` | `ScriptableObject` | [SpawnedObjectList.cs](<../Assets/Plugins/Pixel Crushers/Common/Scripts/Save System/Spawning/SpawnedObjectList.cs:14>) |
| `StringAsset` | `ScriptableObject` | [StringAsset.cs](<../Assets/Plugins/Pixel Crushers/Common/Scripts/Text/StringAsset.cs:12>) |
| `TextTable` | `ScriptableObject, ISerializationCallbackReceiver` | [TextTable.cs](<../Assets/Plugins/Pixel Crushers/Common/Scripts/Text/TextTable.cs:13>) |
| `LocalizedFonts` | `ScriptableObject` | [LocalizedFonts.cs](<../Assets/Plugins/Pixel Crushers/Common/Scripts/UI/LocalizedFonts.cs:14>) |
| `SpawnedObjectList` | `PixelCrushers.SpawnedObjectList` | [SpawnedObjectList.cs](<../Assets/Plugins/Pixel Crushers/Common/Wrappers/Save System/Spawning/SpawnedObjectList.cs:13>) |
| `StringAsset` | `PixelCrushers.StringAsset` | [StringAsset.cs](<../Assets/Plugins/Pixel Crushers/Common/Wrappers/Text/StringAsset.cs:14>) |
| `TextTable` | `PixelCrushers.TextTable` | [TextTable.cs](<../Assets/Plugins/Pixel Crushers/Common/Wrappers/Text/TextTable.cs:14>) |
| `LocalizedFonts` | `PixelCrushers.LocalizedFonts` | [LocalizedFonts.cs](<../Assets/Plugins/Pixel Crushers/Common/Wrappers/UI/LocalizedFonts.cs:14>) |
| `DialogueDatabase` | `ScriptableObject` | [DialogueDatabase.cs](<../Assets/Plugins/Pixel Crushers/Dialogue System/Scripts/MVC/Model/Data/DialogueDatabase.cs:15>) |
| `CustomLuaFunctionInfo` | `ScriptableObject` | [CustomLuaFunctionInfo.cs](<../Assets/Plugins/Pixel Crushers/Dialogue System/Scripts/Utility/CustomLuaFunctionInfo.cs:6>) |
| `LocalizedTextTable` | `ScriptableObject` | [LocalizedTextTable.cs](<../Assets/Plugins/Pixel Crushers/Dialogue System/Scripts/Utility/LocalizedTextTable.cs:16>) |
| `LocalizedTextTable` | `PixelCrushers.DialogueSystem.LocalizedTextTable` | [LocalizedTextTable.cs](<../Assets/Plugins/Pixel Crushers/Dialogue System/Wrappers/Deprecated/Localized Text/LocalizedTextTable.cs:13>) |
| `CustomLuaFunctionInfo` | `PixelCrushers.DialogueSystem.CustomLuaFunctionInfo` | [CustomLuaFunctionInfo.cs](<../Assets/Plugins/Pixel Crushers/Dialogue System/Wrappers/Editor/CustomLuaFunctionInfo.cs:13>) |
| `DialogueDatabase` | `PixelCrushers.DialogueSystem.DialogueDatabase` | [DialogueDatabase.cs](<../Assets/Plugins/Pixel Crushers/Dialogue System/Wrappers/MVC/Model/DialogueDatabase.cs:12>) |
| `FactionDatabase` | `ScriptableObject` | [FactionDatabase.cs](<../Assets/Plugins/Pixel Crushers/LoveHate/Scripts/Core/Faction Database/FactionDatabase.cs:16>) |
| `DeedCategory` | `ScriptableObject` | [DeedCategory.cs](<../Assets/Plugins/Pixel Crushers/LoveHate/Scripts/Core/Faction Members/Deeds/DeedCategory.cs:11>) |
| `EmotionModel` | `ScriptableObject` | [EmotionModel.cs](<../Assets/Plugins/Pixel Crushers/LoveHate/Scripts/Core/Faction Members/Emotions/EmotionModel.cs:12>) |
| `DeedTemplateLibrary` | `ScriptableObject` | [DeedTemplateLibrary.cs](<../Assets/Plugins/Pixel Crushers/LoveHate/Scripts/Interaction/Deeds/DeedTemplateLibrary.cs:13>) |
| `FactionDatabase` | `PixelCrushers.LoveHate.FactionDatabase` | [FactionDatabase.cs](<../Assets/Plugins/Pixel Crushers/LoveHate/Wrappers/Core/Faction Database/FactionDatabase.cs:12>) |
| `DeedCategory` | `PixelCrushers.LoveHate.DeedCategory` | [DeedCategory.cs](<../Assets/Plugins/Pixel Crushers/LoveHate/Wrappers/Core/Faction Members/DeedCategory.cs:13>) |
| `EmotionModel` | `PixelCrushers.LoveHate.EmotionModel` | [EmotionModel.cs](<../Assets/Plugins/Pixel Crushers/LoveHate/Wrappers/Core/Faction Members/EmotionModel.cs:12>) |
| `DeedTemplateLibrary` | `PixelCrushers.LoveHate.DeedTemplateLibrary` | [DeedTemplateLibrary.cs](<../Assets/Plugins/Pixel Crushers/LoveHate/Wrappers/Interaction/Deeds/DeedTemplateLibrary.cs:12>) |
| `DamageType` | `ScriptableObject` | [DamageType.cs](<../Assets/TopDownEngine/Common/Scripts/Characters/Health/DamageType.cs:10>) |
| `InventoryEngineHealth` | `InventoryItem` | [InventoryEngineHealth.cs](<../Assets/TopDownEngine/Common/Scripts/Items/InventoryEngineHealth.cs:14>) |
| `InventoryEngineKey` | `InventoryItem` | [InventoryEngineKey.cs](<../Assets/TopDownEngine/Common/Scripts/Items/InventoryEngineKey.cs:14>) |
| `InventoryWeapon` | `InventoryItem` | [InventoryWeapon.cs](<../Assets/TopDownEngine/Common/Scripts/Items/InventoryWeapon.cs:14>) |
| `ArmorItem` | `InventoryItem` | [ArmorItem.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/InventoryEngine/Demos/PixelRogue/Scripts/Items/ArmorItem.cs:13>) |
| `BombItem` | `InventoryItem` | [BombItem.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/InventoryEngine/Demos/PixelRogue/Scripts/Items/BombItem.cs:13>) |
| `HealthBonusItem` | `InventoryItem` | [HealthBonusItem.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/InventoryEngine/Demos/PixelRogue/Scripts/Items/HealthBonusItem.cs:11>) |
| `WeaponItem` | `InventoryItem` | [WeaponItem.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/InventoryEngine/Demos/PixelRogue/Scripts/Items/WeaponItem.cs:13>) |
| `InventoryItem` | `ScriptableObject` | [InventoryItem.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/InventoryEngine/InventoryEngine/Scripts/Core/InventoryItem.cs:31>) |
| `BaseItem` | `InventoryItem` | [BaseItem.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/InventoryEngine/InventoryEngine/Scripts/Items/BaseItem.cs:11>) |
| `MMF_PlayerConfiguration` | `ScriptableObject` | [MMF_PlayerConfiguration.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMFeedbacks/Editor/Core/MMF_PlayerConfiguration.cs:14>) |
| `MMFeedbacksConfiguration` | `ScriptableObject` | [MMFeedbacksConfiguration.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMFeedbacks/Editor/Core/MMFeedbacksConfiguration.cs:14>) |
| `MMChannel` | `ScriptableObject` | [MMChannel.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMFeedbacks/MMFeedbacks/Core/MMChannels/MMChannel.cs:52>) |
| `MMSequence` | `ScriptableObject` | [MMSequence.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMFeedbacks/MMFeedbacks/Sequencing/Scripts/MMSequence.cs:72>) |
| `MMF_MMSoundManagerSoundData` | `ScriptableObject` | [MMF_MMSoundManagerSoundData.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMFeedbacks/MMFeedbacksForThirdParty/MMTools/Feedbacks/MMF_MMSoundManagerSoundData.cs:19>) |
| `MMDebugMenuData` | `ScriptableObject` | [MMDebugMenuData.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMTools/Accessories/MMDebugMenu/Scripts/MMDebugMenuData.cs:131>) |
| `MMSMPlaylist` | `ScriptableObject` | [MMSMPlaylist.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMTools/Core/MMAudio/MMSMPlaylist/MMSMPlaylist.cs:39>) |
| `MMSoundManagerSettingsSO` | `ScriptableObject` | [MMSoundManagerSettingsSO.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMTools/Core/MMAudio/MMSoundManager/MMSoundManagerSettingsSO.cs:15>) |
| `MMReferencedScriptableObject` | `ScriptableObject where T : ScriptableObject` | [MMReferencedScriptableObject.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMTools/Core/MMSingletons/MMReferencedScriptableObject.cs:11>) |
| `MMAchievementList` | `ScriptableObject` | [MMAchievementList.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMTools/Foundation/MMAchievements/Scripts/MMAchievementList.cs:12>) |
| `MMLootTableGameObjectSO` | `ScriptableObject` | [MMLootTableGameObjectSO.cs](<../Assets/TopDownEngine/ThirdParty/MoreMountains/MMTools/Foundation/MMLoot/MMLootTableGameObjectSO.cs:9>) |
| `SuperAsset` | `ScriptableObject` | [SuperAsset.cs](<../Editor/AssetTypes/SuperAsset.cs:9>) |
| `SuperAssetMap` | `SuperAsset` | [SuperAssetMap.cs](<../Editor/AssetTypes/SuperAssetMap.cs:3>) |
| `SuperAssetSettings` | `SuperAsset` | [SuperAssetSettings.cs](<../Editor/AssetTypes/SuperAssetSettings.cs:4>) |
| `SuperAssetTemplate` | `SuperAsset` | [SuperAssetTemplate.cs](<../Editor/AssetTypes/SuperAssetTemplate.cs:4>) |
| `SuperAssetTileset` | `SuperAsset` | [SuperAssetTileset.cs](<../Editor/AssetTypes/SuperAssetTileset.cs:3>) |
| `SuperAssetWorld` | `SuperAsset` | [SuperAssetWorld.cs](<../Editor/AssetTypes/SuperAssetWorld.cs:3>) |
| `SuperIcons` | `ScriptableSingleton<SuperIcons>` | [SuperIcons.cs](<../Editor/Icons/SuperIcons.cs:7>) |
| `ObjectTemplate` | `ScriptableObject` | [ObjectTemplate.cs](<../Editor/ObjectTemplate.cs:6>) |
| `ST2USettings` | `ScriptableSingleton<ST2USettings>` | [ST2USettings.cs](<../Editor/Settings/ST2USettings.cs:12>) |
| `BadTileSpriteProvider` | `ScriptableSingleton<BadTileSpriteProvider>` | [BadTileSpriteProvider.cs](<../Editor/Tiles/BadTileSpriteProvider.cs:8>) |
| `BadTileTextures` | `ScriptableObject` | [BadTileTextures.cs](<../Editor/Tiles/BadTileTextures.cs:5>) |
| `ImportErrors` | `ScriptableObject` | [ImportErrors.cs](<../Runtime/Errors/ImportErrors.cs:8>) |
| `SuperTileset` | `ScriptableObject` | [SuperTileset.cs](<../Runtime/SuperTileset.cs:7>) |
| `SuperBadTile` | `SuperTile` | [SuperBadTile.cs](<../Runtime/Tiles/SuperBadTile.cs:7>) |
| `SuperTile` | `TileBase` | [SuperTile.cs](<../Runtime/Tiles/SuperTile.cs:8>) |
| `TilesetSprites` | `ScriptableObject` | [TilesetSprites.cs](<../Runtime/Tiles/TilesetSprites.cs:7>) |
