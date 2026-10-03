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

- `GameSaveData` is the live, Odin-serialized root. `GameState` exposes its `player`, `world`, `story`, and `time` sections through `GameStateManager`. Do not add a second capture/restore mapping in the manager.
- Put every value that must survive a save/load in a field of that root or one of its state sections. Public serializable fields persist directly; mark private persistent fields with `[OdinSerialize]`. Mark runtime references, subscriptions, caches, and scene objects `[NonSerialized]` and rebuild or rebind them after load.
- When adding a top-level section, add it to `GameSaveData` and expose it through `GameStateManager` and `GameState`. The editor test `EveryGameStateSectionIsPartOfTheSaveRoot` checks this relationship. Extend the save round-trip test with representative data from the new section.
- Loading replaces the root before scene objects are initialized. Keep post-load runtime work explicit and ordered (for example, rebinding the favour manager and applying saved time); do not discover restore methods by reflection.
- `PlayerStateManager` now keeps current stamina in `GameState.Player`. Inventory contents are still scene-owned and are **not yet saved**; the one-time starting-loadout flag is runtime bookkeeping. Add stable item-ID inventory state before treating inventory as persistent.

## Persisted interactable uses and cooldowns

- `AbstractInteractable` owns contact, optional activation limits, cooldown selection, feedback, and state notifications. `Cooldown Type` selects None, Gameplay Seconds (scaled), Real Time Seconds (unscaled while the game is running), In Game Hours, or Until Time. Until Time selects Next Day, Next Season, or Next Year. Hours and calendar deadlines are saved with uses in `GameState.World` as `InteractableState.availableAtMinute`; seconds are runtime-only. `Cooldown` is only a deadline calculation; the interactable schedules its refresh separately.
- Every placed interactable with limited uses, an in-game-hours cooldown, or an Until Time cooldown needs a stable `persistentId` unique within its location. Set it on the scene instance, not a shared prefab; changing it later disconnects existing saved state. A missing ID makes that interactable unavailable and logs an error.
- Add `InteractableVisuals` only when state-specific visuals are needed. Its optional `ReadyPrefab`, `InCooldownPrefab`, and `UsedUpPrefab` are visual-only children of the stable interactable root. Do not put the interaction collider or ID on these prefabs. `InCooldownPrefab` appears only while a cooldown is active, and `UsedUpPrefab` only after limited uses are exhausted; `DestroyWhenUsedUp` on `AbstractInteractable` removes the root instead.
- Interactables do not poll for visual or availability changes. A successful use and cooldown transitions raise `InteractableStateChangedEvent` (with `RemainingUses`, where -1 means unlimited). `UrTimeManager` raises `GameTimeChangedEvent` when the clock advances; `AbstractInteractable` listens only when it has an in-game cooldown. The interaction sensor responds to state-change events rather than polling.
- `PlayerInteractionContextSnapshot.ActionableInteractable` is the single target rule for modes and interaction actions: a ready pointer target wins, otherwise a ready proximity target is used. `PointerManager` and `InteractionSensor` exclude unavailable interactables; while `SceneReady` is false, mode resolution and starting primary actions are blocked. Keep future targeting logic consistent with this rule.
- `UrTime` uses value equality so unchanged time does not make successive context snapshots unequal and repeatedly notify overlay/cursor/animation listeners.
- `AbstractInteractable` evaluates availability in one place and refreshes visuals/notifications through `RefreshState`. `LevelManager` initializes early and immediately delivers an already-entered location to late registrants, but only to listeners owned by that location (persistent systems-scene listeners receive all locations). Enter and leave both refresh state; `Unavailable` hides the optional visual child. Loading an active location in place is still unsupported by `GameStateManager.Load`; normal loading restores state before location entry.
- Subclasses overriding `OnDisable` must call `base.OnDisable()` so the interactable unregisters from the clock and location lifecycle and cancels its scheduled cooldown refresh without resetting the deadline.
- New `DivineFavourInteractable` components default to Until Time / Next Day (once per game day), rather than a rolling 24-hour cooldown. The deity and favour amount are assigned in the Inspector. All saved cooldown modes use `GameState.Time.TotalMinutes` and refresh on clock changes.
- `UrTimeManager` uses `GameCalendar` for both season rollover and calendar deadlines. The ordered `seasons` array defines the year, with its first entry as the start of the year; `SeasonData.index` does not determine progression. Calendar deadlines use the configured morning start and always target the next boundary, even when activated on its first morning. A new game may start mid-season; do not infer its date from `daysSinceStart` alone.
