# Inventory setup and authoring

The current runtime view is composed by `InventoryScreen.uxml`, driven by `UrInventoryUIDocumentPresenter` on the `SystemRoot` prefab. It instantiates the reusable `GameMenuShell.uxml` and separate `BagPage.uxml` / `EquipmentPage.uxml` content. The scene and shared prefabs are already configured; no manual component setup is needed. Press **I** in Play mode to open it. It uses the project's `OpenInventory` action and registers with `UrGUIManager` while open. The menu opens on **Bag**, with separate **Equipment** and configurable additional tabs. World, Journal, Skills, Relationships and Settings begin as explicit placeholders. See [tabbed menu authoring](../Shared/README.md) to add or implement pages without changing the shell. Tab changes return carried items first; if there is no room, stay on Bag to resolve the carried stack.

Click a slot to inspect it; drag to move, merge or swap a stack. Item details and the useful primary action stay on the bag page. Split Stack opens an inline quantity prompt. Use selects a carried tool; Plant selects seeds and closes into planting preview, without moving either in the bag. The separate Assign to Toolbelt action configures tool shortcuts. Keyboard users navigate with arrows or Tab, inspect with Enter, and pick/place with Space. Escape cancels an inline prompt or held stack before closing. Releasing a drag outside a slot returns it safely.

`PlayerInventoryConfiguration.asset` is assigned to the player's main `SlotInventory`. It defines columns, initial rows, capacity tiers, toolbelt size, and supported equipment slots. The shipped setup uses ten columns and capacities 10/20/30. Bag upgrades cannot be purchased from this menu; a merchant upgrade interaction is not implemented yet. Existing capacity configuration and loaded capacity are retained. Pickups fill compatible stacks, then free cells in every bag row. Tidy Bag sorts every bag slot. Occupied slots require valid, resolvable definitions.

Inspecting an item never changes the hand. A hand label marks the active item while an outline marks the inspected item. The bag uses a grid beside item details, stacking the details underneath on narrow displays. The toolbelt HUD hides while a modal screen is open.

## Toolbelt shortcuts

The existing `ToolHotbar` on SystemRoot displays dedicated toolbelt cells with the authored number-key and next/previous bindings. Each cell references a carried tool by its stable item ID; belt cells are separate from bag slots and do not add capacity. Select a tool in the bag and choose **Assign to toolbelt** to assign, replace or clear a shortcut. **Use** selects the tool directly without moving it. Only `ToolData` items belong on the belt; selecting seeds with **Plant** closes the bag and enters planting mode. Tools and seeds follow their item IDs through sorting and bag moves. Missing tools cannot be created or used through a shortcut.

There is no automatic farm-action selection, radial action wheel or seed-picker HUD. The player chooses a held tool explicitly. Ready interactables retain the shared pointer/proximity targeting rule. Starting loadouts assign carried tools to belt cells once; assignments and the selected item persist in the live save root.

Create worn gear using **Create > Game > Equipment > Item**. Assign compatible slot definition assets and optional character attribute modifiers; gear ownership is saved under the same inventory state. Select a worn slot on Equipment to see only compatible replacements. Return to Bag explicitly removes the selected worn item. The bag's Wear action opens Equipment with a compatible slot selected. Full-bag failures leave both owners unchanged and show a message. No new gear content has been invented for the starting loadout.

Create supported food using **Create > Game > Items > Stamina Consumable**, then configure its restoration amount. Eat is enabled when the definition can apply its effect to the current character. Other consumable definitions implement the same validation/effect contract.

Enable **Prevent Dropping** on essential item definitions. The shipped hoe, watering jar and scythe are protected; replaceable definitions can remain droppable. The drop-spawning API enforces this rule too. Ordinary items expose a quiet Leave on Ground action with an inline confirmation showing the item and complete stack quantity; Keep in Bag receives initial focus. No item is destroyed as a fallback.

SystemRoot's ItemManager references `DroppedItem.prefab` and exposes drop offset/pickup delay. Dropped pickups currently use the existing runtime `WorldItem` system: they are not saved world entities and do not survive unloading their scene. Bag slots, equipment, toolbelt shortcuts, selected item, capacity and the carried stack are saved. Closing attempts to return carried items; if the bag cannot accept them, the saved carried stack remains intact for reopening.

SystemRoot's UI input module references the existing UI actions individually (Point, Click, RightClick, Navigate, Submit, Cancel and ScrollWheel). **Tools > UI > Validate Input Wiring** checks loaded scene modules, and build validation checks the shared prefab. The Play scene provides the end-to-end check that UI actions reach the inventory screen.

The screen's **Pause While Open** defaults to **Character And Clock**. Select **None**, **Character**, or **Game Clock** for a different policy; overlapping requests are owned by the common manager. See [screen pause setup](../Shared/README.md).

## Configured assets

- `Assets/Resources/SystemRoot.prefab`: inventory presenter/document, UI input actions, common UI manager, sound profile and dropped-item prefab. Bootstrapper supplies this root in scenes that have no authored instance.
- `Assets/Character/Player/TestCharacter.prefab`: main inventory references `PlayerInventoryConfiguration.asset`; SampleScene uses this player prefab.
- `Assets/UI/InventoryScreen/InventoryPanelSettings.asset`: inventory-owned panel settings, independent of the third-party dialogue panel.
- `Assets/UI/InventoryScreen/InventoryScreen.uxml` and `.uss`: layout and styling.

The earlier manual Canvas/slot-prefab steps described the legacy uGUI implementation. They are unnecessary for the current screen.

`InventoryScreenView` shares inventory binding, selected-cell state and managed-screen behavior between views. The UI Toolkit presenter is independent of the legacy Canvas display. Stack mutations belong to `SlotInventory`; inventory and shop event bursts refresh their views once in `LateUpdate`. Both bag drops and scythe harvests use `ItemManager.PrepareDrop`, which returns an initialized inactive pickup for activation after state is committed.
