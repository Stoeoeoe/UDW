# Inventory

`InventoryState` is the live saved data: ordered item-ID/quantity slots, capacity
(the slots array length), held stack and source index, toolbelt shortcuts, selected
item ID, equipment and `StartingLoadoutApplied`. It stores no Unity references.

Responsibilities:
- `InventoryStorage` is a plain C# model for slots, stacking, adding/removing,
  swapping and sorting. It binds directly to saved slots and has no events.
- `InventoryInteraction` transfers items between slots and the saved held stack.
  Its `TryPickUp`, `TryPlaceHeld` and `TryReturnHeld` operations finish all writes
  before asking `SlotInventory` to publish notifications. Held state is read-only
  through the public API.
- `SlotInventory` initializes, registers, binds state and publishes notifications.
- `CharacterLoadout` owns toolbelt assignment, selection and equipment.
- `InventoryActions` coordinates equipment exchanges, consumption and upgrades.

Use `Capacity` and `GetSlot(index)` for individual reads. `GetSnapshot()` explicitly
allocates a detached resolved array; changing it never changes saved slots. Ordinary
mutations update individual saved slots, preserving the array. Sorting and
all-or-nothing transactions prepare snapshots; internal commits write them back
without notifications. Commit inventory, money, equipment and stock before
publishing callbacks. Failed gameplay operations leave all participants unchanged.

Item definitions and loaded save data must satisfy the project's validation and
migration contracts. Missing definitions in occupied slots fail clearly. Invalid
programming arguments throw; full inventories, empty-slot pickups and incompatible
placement remain normal rejections. No migration framework is implemented here.

`SlotInventory.Bind` connects the player inventory to `GameState.Player.Inventory`
on every spawn. NPC inventories stay local unless explicitly bound. Capacity for
new state is configuration columns times starting rows (or the legacy slot count
for inventories without a configuration). Saved capacity always takes precedence.
`IsInitialized` explicitly distinguishes an unbound component from an empty bag.
Storage, interaction, loadout and actions retain their identity when binding a new
save root; all use the replacement live state.

`PlayerStateManager` supplies starting tools/items. The full loadout is prepared
before committing; overflow leaves contents and marker untouched. The saved marker
is set before callbacks. Emptying the bag or changing scenes never grants it again.
The player's registered inventory and its configuration are required setup.

The toolbelt stores tool-ID shortcuts independent of capacity and slot order.
Assigning or clearing one never moves items. Removed tools leave empty shortcuts;
shortcuts cannot create items. Starting tools are assigned once. Seeds can be selected
from the bag without occupying toolbelt cells. Equipment and held items remain save-owned.

Shared discovery populates `Assets/Resources/ItemCatalog.asset` from definitions
under `ItemCatalog.Path` (currently `Assets`) after import/save and before play/build.
Use **Tools > Inventory > Rebuild Item Catalog** or **Tools > Catalogs** for authoring.
Runtime resolves IDs through this single catalog and never scans assets. IDs must
be unique, non-empty and stable. Renaming them breaks saved references.

Tests cover stack limits, atomic additions, direct mutation, detached snapshots,
split/partial merges, swaps, full-bag returns, transaction failures, notification
ordering, starting-loadout idempotence, equipment, toolbelt and held-stack save/load.
See [UI setup](../../UI/InventoryScreen/SETUP_GUIDE.md).
