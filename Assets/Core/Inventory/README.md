# Player inventory persistence

`GameState.Player.Inventory` owns ordered slots (stable `ItemId` + quantity), capacity,
the UI-held stack, and `StartingLoadoutApplied`. It contains no asset references. `SlotInventory.Bind`
connects the scene inventory to this live state on each player spawn. NPC/other
inventories remain runtime-local unless explicitly bound to saved state.

`PlayerStateManager` keeps the existing starting tools/items configuration. The
complete loadout is prepared before committing anything; overflow or missing IDs
leave both contents and marker untouched. The marker is saved before notifications.
Emptying an initialized inventory, loading, and changing scenes do not grant it again.
Starting a new game with a fresh root does.

The shared catalog discovery populates `Assets/Resources/ItemCatalog.asset` from
item definitions under `ItemCatalog.Path` (currently `Assets`), after import,
saving definition edits, and before builds. You can also
use **Tools > Inventory > Rebuild Item Catalog**, or **Tools > Catalogs** to search
and enable/disable entries. Refresh preserves these selections. This is one explicit runtime
catalog, not a runtime scan. IDs must be unique and non-empty; renaming an existing
ID breaks its save references. Add new items as ordinary definition assets; no
additional prefab or manager wiring is needed.

Unknown item IDs retain their slots and quantities. They cannot be used or sold;
adding other items cannot overwrite them. The existing UI treats unresolved items
as unavailable/empty visually; a missing-item placeholder is a future UI task.
The drag-held stack and its source index are saved too. Drag/drop finishes updating
both the held stack and slots before notifying listeners.

`Content` returns a resolved snapshot, not mutable authoritative storage. Use
`AddItem`, `RemoveItemAt`, `MoveItem`, or `SetSlot`. Shop transactions use the internal
prepare/commit path so all inventory, wallet and stock changes precede notifications.
Do not shrink loaded capacity to the current prefab's default slot count.

Editor tests cover loadout idempotence/overflow, empty initialized saves, missing
definitions, slot order, shared-state rebinding, root serialization, and trading
round trips. No backwards-compatibility migrations are provided during prototyping.
