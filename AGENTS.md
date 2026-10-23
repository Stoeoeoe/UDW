# Core axiom: broken setup must fail before gameplay

**Missing required services, singletons, components, references, IDs or invalid
required definition data mean the game is broken. Establish and verify these
contracts before gameplay; gameplay code must rely on them.**

Before each response and code change, silently check: **Is this an expected game
state, or am I hiding broken setup?** Apply this rule when reviewing existing code
as well as when adding new code.

- Validate authored data in asset/import/scene validators and before Play Mode or
  builds. Validate dynamic/mod content when registering it. Establish required
  runtime dependencies at initialization/binding; report a clear failure there.
- Do not turn missing required dependencies into `false`, a no-op, empty arrays,
  fallback objects or ordinary failed-action feedback. Do not repair invalid
  authored values with gameplay clamps/defaults or invent missing IDs at runtime.
  Examples: guarding every call with `ItemManager.Instance && ...`, skipping null
  entries in a required definition list, or returning no growth stages for a
  malformed plant. Fix the setup and its validation instead.
- Keep checks for expected gameplay outcomes: full bags, insufficient money,
  unavailable targets, external-input rejection and explicit optional features.
  Invalid arguments to internal inventory operations are programming errors. An
  intentionally empty configuration allowed by its validator is valid.
  Inventory assets and loaded save data must satisfy validation/migration contracts;
  missing definitions in occupied inventory slots are broken setup, not empty slots.
  Handle scene-loading/destruction boundaries explicitly instead of
  making required dependencies optional throughout gameplay.
- Tests must build valid fixtures and verify boundary failures. Do not weaken
  production contracts to accommodate incomplete test scenes or assets. Nullable
  annotations must describe actual optionality, not excuse missing initialization.
- When authoring/serialization contracts change, update affected assets and fixtures
  together; use an explicit editor migration script when needed. Validate supported
  save input before binding it. Follow the prototyping rule below: do not add save
  compatibility migrations or schema bumps unless requested.
- Before finishing, inspect new guards, null-conditionals, clamps and fallback
  returns. Every one must represent an expected runtime condition or an explicit
  boundary check. Otherwise remove it and enforce the invariant at its owner.

## Every change needs a concrete reason

**Implement complexity only to solve an identified project problem or support an
actual use case. Possibility alone is not a requirement.**

- Before implementation, identify the concrete problem, the existing caller or
  supported workflow that needs the change, and why the simplest existing approach
  is insufficient. State that reason briefly before nontrivial structural changes.
- Every design decision needs a concrete explanation of what happens in this game
  and why that behavior needs the change. Name the actual gameplay scenario and
  caller or authored content. "Clean code", "robustness", "best practice" and
  generic Unity shutdown concerns are not sufficient reasons on their own.
- Do not implement hypothetical scenarios unless the user explicitly requests
  them. A prototype or test invented by the agent is not evidence of a gameplay
  requirement. Leave unsupported behavior out rather than adding guards for it.
- Required global managers are established by game startup. Consumers rely on
  that contract instead of repeating manager-presence checks. Keep a manager
  reference when it serves an actual operation, such as unsubscribing from the
  same instance that owns an event; do not add shutdown guards without a demonstrated need.
- Prefer established project conventions. A refactor should remove duplication or
  make a demonstrated operation easier to understand; do not invent extra behavior
  while carrying it out.
- Do not add abstractions, configuration, lifecycle states, extension points or
  defensive branches for hypothetical future scenarios. Tests that merely encode
  a newly invented behavior do not establish a product requirement.
- Keep scope tied to the user's request. Distinguish required behavior from optional
  improvements, and leave speculative improvements out. This reasoning check is
  not an additional permission or approval step.
- Before finishing, check each added responsibility and branch against its concrete
  reason. Remove complexity that has no supported use case. Required setup invariants
  still belong at validation, registration or initialization boundaries.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Save compatibility during prototyping

- Save formats can evolve in place for now. Do not bump the save schema version or add migrations for backwards compatibility unless the user asks.
- If a change to a fundamental state or save contract raises a compatibility question, ask the user before adding compatibility machinery.

## Asynchronous latest-wins work

- When several asynchronous operations can overlap but only the newest result should be published or applied, use a small generation counter: increment it when starting work, capture that value locally, and check it again after each wait before publishing the result. `UrTimeManager.UpdateWeather` is an example.
- Use this for latest-wins semantics, not as a default replacement for cancellation. If earlier work has side effects or consumes significant resources, cancel or clean it up as well. Keep the counter with the owner of the operation and explain why stale completions must be ignored.

## Persistent game state

- `WorldState` uses one location-bucket dictionary. UUID-only calls are wrappers over the reserved `$global` bucket; authored locations must avoid that ID by convention (no runtime guard). Global entries enumerate with `LocationId == null`. `TryGet` returns false for missing, null or differently typed state; `Set` rejects replacing an existing concrete type. No ID/null-state validation is done at this store. Enumeration is live: materialize with `ToArray`/`ToList` before mutating the store. There is no second global-object dictionary or save mapping.

- `GameSaveData` is the live, Odin-serialized root. `GameState` exposes its `player`, `world`, `story`, and `time` sections through `GameStateManager`. Do not add a second capture/restore mapping in the manager.
- Put every value that must survive a save/load in a field of that root or one of its state sections. Public serializable fields persist directly; mark private persistent fields with `[OdinSerialize]`. Mark runtime references, subscriptions, caches, and scene objects `[NonSerialized]` and rebuild or rebind them after load.
- When adding a top-level section, add it to `GameSaveData` and expose it through `GameStateManager` and `GameState`. The editor test `EveryGameStateSectionIsPartOfTheSaveRoot` checks this relationship. Extend the save round-trip test with representative data from the new section.
- Loading replaces the root before scene objects are initialized. Keep post-load runtime work explicit and ordered (for example, rebinding the favour manager and applying saved time); do not discover restore methods by reflection.
- `PlayerStateManager` binds the main inventory to `GameState.Player.Inventory` on every character initialization. `InventoryState` owns ordered item-ID/quantity slots, saved capacity, and `StartingLoadoutApplied`. Prepare the entire starting loadout before committing; set the saved marker before publishing notifications. Never infer initialization from whether inventory is empty. NPC inventories remain runtime-local unless explicitly bound. `SlotInventory.Capacity` and `GetSlot` provide individual access; `GetSnapshot` explicitly allocates a detached resolved snapshot. Use mutation methods, not snapshot writes. Occupied slots require resolvable definitions; missing definitions fail clearly instead of being skipped. See `Assets/Core/Inventory/README.md`.
- Shared catalog discovery automatically maintains `Assets/Resources/ItemCatalog.asset` from authored item definitions on editor startup/import/save and before play/build. Runtime loads that single catalog to resolve saved IDs, without scanning assets. Keep item IDs unique, non-empty, and stable; item asset creation needs no manager wiring. Do not persist ScriptableObject references in inventory state.
- New flat asset catalogs derive from `Core.Catalogs.DefinitionCatalog<T>` and override `Path` (an Assets-relative discovery folder) and `GetDefinitionId`. Items, skills, deities, plants and spawnables use shared editor `CatalogDiscovery`, preserving enabled selections and refreshing before play/build. `DefaultCatalogAssets` bootstraps default Resources assets; add a registration there only when a new catalog needs an automatically created default. `Tools > Catalogs` is the generic Odin browser. Runtime loads individual catalogs through `CatalogResources`; skill/deity mod registration remains explicit. Select enabled content before play; active registries are not live-reconfigured. Disabled means excluded from lookup, not globally blocked or stripped. Specialized map/dialogue catalogs keep their relationships and share `IdIndex.FirstWins`; editor-only `CatalogAssetDiscovery` is reusable without inheritance. Preserve calendar ordering and weather weights. Test profiles/runtime overrides are deferred in `Assets/Core/Catalogs/README.md`.
- The inventory UI's drag-held stack/source index also belong to `InventoryState`, not the display. Slot/held changes must be complete before publishing inventory or held-item events. Internal silent slot writes are only for these grouped UI updates; normal gameplay mutations notify immediately.
- `GameCharacter.Wallet` is a plain C# object, created with its character owner in `Awake`; it is not a component and needs no prefab wiring. For the main character, `PlayerStateManager` binds it directly to `GameState.Player.Wallet`; NPC wallets are runtime-local unless explicitly bound to persistent entity state. The wallet limits balances to 0–9,999,999 and publishes `WalletChangedEvent` after mutations. Rewards use capped `Add`; trading uses all-or-nothing `TrySpend`/`TryAdd`. `ItemDefinition.BuyBasePrice`/`SellBasePrice` are per-unit prices, not a shop stock list. Player money, inventory slots, and shop stock persist; shop UI is not implemented.

- Inventory responsibility boundaries: `SlotInventory` is the scene adapter for
  initialization, registration, binding and notifications. Plain C# `InventoryStorage`
  owns slots, stacking, adding/removing, swaps and sorting; `InventoryInteraction`
  owns pickup, placement and return of the saved held stack. Held state is read-only
  to callers. `CharacterLoadout` owns shortcuts, selection and equipment;
  `InventoryActions` coordinates gear, consumption and wallet-funded upgrades. All
  operate on the same live `InventoryState`. Do not recreate a partial-class grab
  bag, duplicate saved state, or make core storage depend on UI event definitions.

## Catalog authoring and lookup

- Adding content of an existing definition type must not require a registry edit. Import/create its Unity definition asset under the catalog's `Path`; discovery runs automatically on relevant imports/saves and before play/build. External JSON/source files must first be imported into definition assets. Items and plants search all of `Assets` because their definitions occupy several existing folders. Do not move or exclude those assets just to retain an old Resources convention.
- Built-in skill/deity/plant ID lookup uses the catalog's single index. Skill/deity registries hold only mod-added definitions and reset between sessions; do not copy built-in catalog entries into another dictionary. `PlantManager.TryGetPlantData` delegates to its catalog. `CatalogResources` caches only catalog assets, not definitions. Enabled selection is not live teardown/reapplication of already-active gameplay effects.

## Shops

- `ShopDefinition` holds ordered offerings independent of NPC data. Offerings have stable IDs, item definitions, Daily/Never restocking, daily appearance chance, inclusive stock bounds, and buy price multipliers. Each `Shop` component has a permanent unique shop ID; sharing a definition does not imply shared inventory. Saved `ShopState` lives in `GameState.World` under that ID, with no item asset or scene references. Never reuse shop/offer IDs for unrelated content.
- Enabled shops refresh on `NewDayEvent`; reads/purchases catch up unloaded shops to the current day. Appearance and processed days are saved. Daily stock replaces remaining stock; Never retains its initial stock, even if initially hidden. Only the current skipped day is rolled, not every intermediate day. Do not reroll on opening or loading.
- Shop trades prepare inventory changes, silently commit money/items/stock, then publish wallet, inventory, and shop events. The internal silent wallet/inventory methods are transaction support, not APIs for bypassing notifications in ordinary gameplay. Sales use positive item sell base prices and the shop sell multiplier; they do not add buyback stock. Lua conditions, vendor money limits, and UI are not implemented. Player slot contents participate directly in the save root; no shop-specific inventory capture is needed.
- `ShopPurchaseEvent` and `ShopSaleEvent` describe successful customer purchases/sales with captured prices, quantities, before/after balances, and stock/slot quantities. `ShopRestockedEvent` describes initial/daily stock and availability processing with a read-only snapshot list; Never entries distinguish availability updates from replenishment. Construct these snapshots after committing but before publishing any callbacks. UI/audio reacts to these events; the shop does not play sounds. Failed trades return `ShopTradeResult` without success events. `ShopChangedEvent` remains the generic listing-refresh event.

## Persisted interactable uses and cooldowns

- Persistent Vulcanus map entities have a root `SpawnedObject` and a catalog entry. The importer serializes stable authored instance IDs with inactive configured templates in `VulcanusImportedMap.PersistentEntities`; these are never live gameplay entities. JSON overrides are applied at import time, not reflected at runtime. `typeId` resolves through `SpawnableCatalog` first; legacy Vulcanus aliases are allowed only for registered persistent prefabs. Missing/duplicate persistent instance IDs fail import. Nonpersistent entities and object layers remain baked.
- `WorldObjectSpawner.OnLocationEnter` reads the initialized map via `MapManager.CurrentMap`, seeds missing authored state, then restores saved records through the same bind-before-enable path as generated objects. Records persist position, rotation, `authored`, `removed`, and nested interaction data. Removal marks authored records rather than deleting them; generated records are deleted. Authored entities absent from the current map are not materialized. Never reuse an authored instance ID for a different entity. Configured templates must keep active roots under inactive parents.

- Generated entities use `WorldObjectSpawner` (one component in the Systems scene) with an explicitly assigned `SpawnableCatalog`. `Tools > Spawning > Set Up Systems Catalog` creates/assigns the catalog using Editor APIs. Put active-root prefabs with a root `SpawnedObject` in `Assets/Content/Spawnables`, manually authoring permanent lowercase `namespace:name` IDs (`base:` for shipped content). The folder is an editor convention only; runtime registers catalog references, never scans Resources. The refresh menu and pre-build hook rebuild/validate catalogs. Moving outside the authoring folder removes the prefab on refresh. Mods register their prefabs before restoring or spawning. `Spawn` rejects unregistered prefabs; all ID lookups go through `Resolve`. `Spawn(prefab, Vector3 worldPosition, state = null)` requires an entered location; tile callers resolve world positions themselves. Records use plain UUIDs in the location's world-state bucket, with no duplicated location field. Bind and track under an inactive staging parent before reparenting activates the view; exhausted objects can remove themselves during OnEnable.
- `SpawnedObjectState` owns placement and nested `interaction` data. Derive it for concrete entity data, optionally overriding `SpawnedObject.CreateState`; apply saved data in `OnStateBound` before Awake/OnEnable. Do not self-register or mint IDs while restoring. Only the first child interactable is bound. `AbstractInteractable` mutates the supplied `InteractableState` and raises `Depleted`; `SpawnedObject` handles removal. Interaction must not depend on Core.Spawning.
- Call `SpawnedObject.Remove()` / `WorldObjectSpawner.Despawn(id)` for permanent gameplay removal. Scene unload destroys views but keeps records; `DestroyWhenUsedUp` also permanently removes the entity (retaining a removal marker for authored entities). Ordinary `Destroy` is not permanent removal. Spawned position and rotation are captured on location leave and before `GameStateManager.Save`, not on disable. Other concrete entity fields must update their live state directly. Scale, inventory contents, and deterministic procedural generation are not implemented by the generic spawner.

- Newly generated interactable IDs use `<GameObject name>_<UUID>`. The name is captured during editor generation, not recomputed at lookup; renaming an object must never alter its stored save key. Existing valid IDs stay unchanged unless explicitly regenerated.

- `AbstractInteractable` owns contact, optional activation limits, cooldown selection, feedback, and state notifications. `Cooldown Type` selects None, Gameplay Seconds (scaled), Real Time Seconds (unscaled while the game is running), In Game Hours, or Until Time. Until Time selects Next Day, Next Season, or Next Year. Hours and calendar deadlines are saved with uses in `GameState.World` as `InteractableState.availableAtMinute`; seconds are runtime-only. `Cooldown` is only a deadline calculation; the interactable schedules its refresh separately.
- Interactables use a globally unique serialized UUID (`persistentId`) directly with `GameState.World.Set(id, state)` / `TryGet(id, out state)`, without location context or a key prefix. New components receive a UUID; editor validation replaces missing/invalid IDs. After duplicating an object or placing another instance of a shared prefab, use `Regenerate Persistent UUID` on the new scene instance and retain that override (do not apply it to the prefab). Never regenerate an existing saved object's UUID. Runtime-spawned persistent instances need an authored/spawn-record UUID rather than sharing their template's UUID. Plants/farmland still use the separate location-scoped WorldState API.
- Add `InteractableVisuals` only when state-specific visuals are needed. Its optional `ReadyPrefab`, `InCooldownPrefab`, and `UsedUpPrefab` are visual-only children of the stable interactable root. Do not put the interaction collider or ID on these prefabs. `InCooldownPrefab` appears only while a cooldown is active, and `UsedUpPrefab` only after limited uses are exhausted; `DestroyWhenUsedUp` on `AbstractInteractable` removes the root instead.
- Interactables do not poll for visual or availability changes. A successful use and cooldown transitions raise `InteractableStateChangedEvent` (with `RemainingUses`, where -1 means unlimited). `UrTimeManager` raises `GameTimeChangedEvent` when the clock advances; `AbstractInteractable` listens only when it has an in-game cooldown. The interaction sensor responds to state-change events rather than polling.
- `PlayerInteractionContextSnapshot.ActionableInteractable` is the single target rule for modes and interaction actions: a ready pointer target wins, otherwise a ready proximity target is used. `PointerManager` and `InteractionSensor` exclude unavailable interactables; while `SceneReady` is false, mode resolution and starting primary actions are blocked. Keep future targeting logic consistent with this rule.
- `UrTime` uses value equality so unchanged time does not make successive context snapshots unequal and repeatedly notify overlay/cursor/animation listeners.
- `AbstractInteractable` evaluates availability in one place and refreshes visuals/notifications through `RefreshState`. It does not implement or register for location lifecycle; enabling/disabling owns its runtime presentation and subscriptions. `Unavailable` hides the optional visual child. Loading an active location in place is still unsupported by `GameStateManager.Load`; normal loading restores state before scene interactables are enabled.
- Subclasses overriding `OnDisable` must call `base.OnDisable()` so the interactable unregisters from the clock and cancels its scheduled cooldown refresh without resetting the deadline.
- New `DivineFavourInteractable` components default to Until Time / Next Day (once per game day), rather than a rolling 24-hour cooldown. The deity and favour amount are assigned in the Inspector. All saved cooldown modes use `GameState.Time.TotalMinutes` and refresh on clock changes.
- `UrTimeManager` uses `GameCalendar` for both season rollover and calendar deadlines. The ordered `seasons` array defines the year, with its first entry as the start of the year; `SeasonData.index` does not determine progression. Calendar deadlines use the configured morning start and always target the next boundary, even when activated on its first morning. A new game may start mid-season; do not infer its date from `daysSinceStart` alone.
