# Persistent spawning

Open **Tools > Spawning > Catalog** to edit the catalog in a dedicated Odin window. It inspects the asset directly, reusing its prefab list and validation rather than keeping separate window data.

1. Run **Tools > Spawning > Set Up Systems Catalog** in Unity (outside Play Mode, with Systems-scene edits saved). It creates `Assets/Content/SpawnableCatalog.asset`, adds a `WorldObjectSpawner` to Systems if needed, and assigns the catalog. The spawner registers for LevelManager's location lifecycle; map initialization happens before reconstruction.
2. Add `SpawnedObject` to the root of an active prefab (or derive it for specific gameplay). The first child `AbstractInteractable`, if present, has its uses and saved cooldowns bound automatically.
3. Put the prefab under `Assets/Content/Spawnables` and manually assign its stable lowercase `namespace:name` ID, such as `base:chest`. Never change an ID once used in saves. The catalog holds explicit prefab references; runtime does not scan folders. The folder is only an editor authoring convention. Renaming or moving a prefab does not change its ID, but moving it outside the authoring folder removes it from the next catalog refresh. Prefabs loaded by mods must be registered through `WorldObjectSpawner.Register` before spawning or restoring them.

Odin's AssetList populates when the Inspector draws it. **Tools > Spawning > Refresh Catalogs** and the pre-build hook explicitly refresh the serialized lists even if the Inspector was never opened. Invalid or duplicate IDs block builds. `Spawn` refuses unregistered prefabs instead of quietly registering them; all ID lookups go through `Resolve`.

```csharp
// Absolute world coordinates; tile callers resolve the tile's WorldPosition first:
var chest = WorldObjectSpawner.Instance.Spawn(chestPrefab, new Vector3(12.5f, 7.5f, 0));

// Permanent removal, not just removal of the scene view:
chest.Remove();
```

Spawning requires an entered location. The spawner creates a plain UUID, registers its `SpawnedObjectState` in that location's world-state bucket, instantiates under an inactive staging parent, binds identity/state, tracks the instance, and then reparents it to activate the view. Tracking happens before activation because an exhausted object can remove itself during OnEnable. Objects do **not** self-register on enable. Location re-entry reconstructs records with their existing IDs; it does not rerun initial generation. Missing prefab records are logged and skipped without blocking other objects. If you generate a starting population, separately persist that generation's completion flag so it runs only once.

`SpawnedObjectState` contains prefab ID, world position and rotation, authored/removal flags, and nested interaction data. Location belongs to the storage bucket, not a duplicated field. Tile coordinates are resolved by the caller; the resulting world position is saved.

For specialized state, derive `SpawnedObjectState`, override `SpawnedObject.CreateState`, and override `SpawnedObject.OnStateBound` to apply that data. Alternatively pass a fresh concrete state as the optional third argument to `Spawn`. `OnStateBound` runs before Awake/OnEnable, so don't rely on references cached by those callbacks. Keep persistent changes in the live state.

Direct transform movement is captured before `GameStateManager.Save` and before clearing location views, not on disable. Scene unload/ordinary `Destroy` does not delete a saved record; `Remove`/`Despawn` does. `DestroyWhenUsedUp` raises the interactable's `Depleted` event; its owning `SpawnedObject` performs permanent removal. Interaction does not depend on Spawning.

This version supports spawning into the entered location and one interactable per entity. It does not implement chest contents, scale persistence, respawn schedules, or deterministic procedural generation. No sample gameplay prefab is created.

## Map-authored persistent entities

Entity types whose prefab root has `SpawnedObject` use the same runtime state and spawning path. The map's `typeId` can resolve directly to a registered `PrefabId`; Vulcanus mappings remain available for nonpersistent entities and existing type aliases. Persistent mapped prefabs must also be in `SpawnableCatalog`.

The importer keeps these placements as inactive configured templates, not live gameplay instances. This preserves imported JSON property overrides without runtime reflection. Missing or duplicate persistent instance IDs fail import; no random fallback is allowed for persistent entities. The importer revision ensures existing maps are reimported with this representation.

Location entry seeds a concrete state via each template's `CreateState()` only if there is no saved record. Saved position, rotation, and interaction data win over map defaults. Runtime-created entities use new UUIDs; map entities retain their authored IDs within the location bucket. Both bind before activation and use `OnStateBound` for concrete saved data.

Removing an authored entity sets `removed` on its record instead of deleting it, preventing the map from resurrecting it. Removing a generated entity still deletes its record. Authored records whose placements no longer exist in the map are retained but not materialized. IDs must never be reused for unrelated entities.

The generic system now captures position and rotation. Scale, respawn schedules, entity tags/time scopes, and concrete inventory contents are not added by this integration. Nonpersistent entities and baked object layers retain their import-time behavior; add a root `SpawnedObject` and catalog entry when an entity needs persistent tracking.
