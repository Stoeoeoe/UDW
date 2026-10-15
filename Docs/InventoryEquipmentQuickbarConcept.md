This earlier design is superseded by the dedicated toolbelt shortcuts described in [the current setup guide](../Assets/UI/InventoryScreen/SETUP_GUIDE.md). The belt no longer uses the first bag row.

# Inventory, equipment and quickbar concept

Design baseline from the initial inspection. The bag/quickbar model, menu controls, equipment ownership and capacity upgrades have since been implemented; see the [current setup guide](../Assets/UI/InventoryScreen/SETUP_GUIDE.md) for configuration and limitations. The table below records the starting point for this work.

The current menu separates **Bag**, **Equipment**, and a **World** placeholder into tabs. Worn slots and wearable choices belong to Equipment, while Bag focuses on carried items and quick access. Capacity purchases have been removed from the menu; merchant-based upgrades remain future work. The original combined layout and upgrade hints below are historical proposals, not the current screen specification. Tools still share the bag with other items while their gameplay role is being discussed.

## Direction

The player has **one bag**, **a quickbar showing the bag's first row**, and **equipment slots for worn items**. Selecting something in a menu, carrying a stack with the cursor, choosing a tool for the hand, and wearing equipment are four distinct states. The interface must make each visible and keep them independent.

Use ten columns, with bag upgrades exposing one, two or three rows: 10 / 20 / 30 slots. Ten is the recommended shipped configuration because the project already has ten quick-slot input actions and a ten-slot player bag. These values should live in an authored configuration asset, rather than being repeated as constants in presenters. Columns determine the layout; saved capacity determines how many slots the player owns.

No weight system, tool-only bag, automatic rearrangement or arbitrary scrolling grid is needed for the first version.

## What exists today

| Area | Current implementation | Implication |
|---|---|---|
| Ownership | `GameState.Player.Inventory` saves ordered item-ID/quantity slots, capacity and the cursor-held stack. `SlotInventory` provides mutations and resolved views. | Keep this as the authoritative bag. |
| Initialization | `PlayerStateManager` binds the main inventory and applies the configured starting loadout once. | Build on this, preserving loaded capacity and item order. |
| Items | Definitions provide IDs, icons, descriptions, categories, stack limits and prices; the catalog discovers authored definitions. | Reuse definitions and catalog lookup, without per-item UI wiring. |
| Quickbar | `ToolHotbar` displays the first N bag slots; the main prefab configures ten. Its view also publishes item-selection events. | The first-row model already exists, but gameplay selection currently belongs too much to the presenter. |
| Active hand | `ItemSelectedEvent` sets `MainCharacter.CurrentlyHeldItem` and a source slot index. Seed usage relies on that index. | Selection needs a single gameplay owner that validates its source after inventory changes. |
| Equipment | `EquippableItem` means an item can be held; there is no saved worn-equipment system in the player state. | Worn equipment is a new capability, not a relabeling of current tool selection. |
| Menu | The UITK inventory wraps 72-pixel slots to fit the available width. Left-click carries stacks; Shift-click selects them for a generic Use/Discard footer. | Rows change with window width, and the hidden distinction between selection and carrying is confusing. |
| Item use | The inventory's Use button publishes an equip event. `SlotInventory.UseItem` contains behavior TODOs. | Do not present consumption or universal Use as completed functionality. |
| Shared UI | `UrGUIManager` owns visibility, optional character/calendar pauses and configurable sounds. | Inventory should reuse this policy and audio layer. |
| Legacy content | The player prefab also contains `ToolInventory`; SystemRoot contains additional legacy/demo inventory displays and hotbars. | Audit actual references and active hierarchy before removing unused components. |

Relevant source: [inventory state](../Assets/Core/Inventory/InventoryState.cs), [inventory operations](../Assets/Core/Inventory/SlotInventory.cs), [player initialization](../Assets/Core/PlayerStateManager.cs), [quickbar](../Assets/UI/Hotbar/ToolHotbar.cs), [current screen](../Assets/UI/InventoryScreen/UrInventoryUIDocumentPresenter.cs), [player state](../Assets/Core/Game/GameState.cs).

## Click failure: prefab and scene inspection

Inspection of `Assets/Resources/SystemRoot.prefab` and its loaded `SampleScene` instance found one enabled EventSystem with an enabled `InputSystemUIInputModule`. It references `Assets/InputSystem_Actions.inputactions`, which contains a complete UI action map, **but every individual UI action reference is unset**, including Point, Click, RightClick, Navigate, Submit and Cancel.

The installed input module only calls `AssignDefaultActions` when `HasNoActions` is true; an assigned action asset makes that check return false. Therefore this configuration has neither explicit bindings nor the automatic fallback. It is a concrete input-wiring fault consistent with dead mouse interactions. Confirm the final cause with real pointer input in Play mode after repairing the references.

The inventory is a `UIDocument`, with a valid PanelSettings reference and sorting order 20. The existing uGUI canvas has a GraphicRaycaster. A missing GraphicRaycaster on the inventory document is not the relevant configuration issue. Also check panel picking, transparent blockers and modal ordering when validating the repair, rather than assuming the binding fault is the only possible issue.

The earlier EditMode tests sent events directly to elements. They verify handlers and rebinding, but bypass device input and EventSystem delivery; they could pass despite this broken prefab configuration. Add asset-wiring coverage and a real-input Play mode check to close that gap.

## Layout and presentation

The inventory is a compact character-and-bag window. The bag is the visual focus; an equipment panel sits beside it, with an item detail area below or to the side. At narrow resolutions the panels stack vertically, while the bag keeps its column count. Scale slot sizes within readable limits before introducing scrolling. One to three rows should be visible together at the supported minimum resolution.

```text
  Character / Equipment       Bag                       Close
                              [1][2][3][4][5][6][7][8][9][0]  Quickbar
  [Head]  [Body]              [ ][ ][ ][ ][ ][ ][ ][ ][ ][ ]  Upgrade row
  [Feet]  [Accessory]         [ ][ ][ ][ ][ ][ ][ ][ ][ ][ ]  Upgrade row

  Item icon, name, description, quantity, relevant properties
  Context actions: Equip / Consume / Move to quickbar / Drop
  Money                                      Short control hints
```

Equipment slots in this sketch are a proposed initial set, enabled only when supporting item definitions and effects exist. Do not show nonfunctional empty equipment buttons. Slot identifiers, accepted item kinds, labels, icons and ordering are authored data; adding a slot should not require editing the screen's switch statements.

The first bag row is labeled Quickbar and shows the same key labels and active highlight as the HUD. Locked upgrade rows should appear as a compact upgrade hint rather than ten misleading empty slots. The HUD only shows the quickbar; opening the bag expands the same item layout, without rendering a second overlapping interactive HUD bar.

Do not style the selected detail item as the active tool. Use distinct focus/selection, active-hand and equipped-state indicators. Missing definitions retain their occupied cells and show a clear unavailable-item placeholder.

## Interaction contract

| Input | Result |
|---|---|
| Left-click a slot | Select it and show its details. No item movement. |
| Drag a stack onto a slot | Move, merge up to the stack limit, or swap; overflow remains at the source/cursor. |
| Right-click a stack | Open relevant context actions, including Split Stack when quantity permits. |
| Split Stack | Choose a quantity; carry only that amount for placement. |
| Context action / detail button | Perform the named operation. Labels reflect the item capability, rather than a generic Use. |
| Quick-slot keys or HUD click | Select the active hand slot; do not perform the world action immediately. |
| Next/previous quick-slot input | Cycle the quickbar, including empty cells so the player can select an empty hand. |
| Primary world action | Use the selected hand item through the existing interaction/action system. |
| Keyboard/gamepad navigation | Move focus, select, open context actions and move stacks using an explicit pick/place mode. |
| Escape | Cancel the current drag/context menu first, then close the inventory. |

This intentionally changes the current click-to-carry behavior: plain clicking should reliably inspect an item, and dragging should move it. Mouse split handling and keyboard pick/place use the same transaction operations.

Moving an item to the quickbar means moving it into a chosen first-row bag cell. It does not create a shortcut copy. Sorting affects only the storage rows by default, preserving the player's quickbar arrangement. Pickup first fills compatible stacks, then free storage cells, then free quickbar cells; existing placements never shift automatically.

Replace immediate Discard with an explicit Drop action when supported by world-item spawning. Dropping creates a world pickup after a successful inventory transaction. Valuable or multiple-item drops should have a clear confirmation. Destruction, if retained, is a separate named operation.

On close, resolve an active drag back to its source or a valid free slot before completing closure. Never lose the stack if its original slot became occupied. If resolution fails, retain it in the already saved held-stack field and show it clearly on reopen; do not silently delete it or block location teardown. Normal scene transitions/save-load must conserve total quantities, including the held stack.

## Active hand and equipment

The quickbar is a view of bag ownership. An active hand slot points to a bag cell; the item stays in that cell. The gameplay selection service resolves the current item from that cell whenever inventory changes. If it is empty, unresolved or not usable in the hand, clear the held item. Selection follows the **cell**, so swapping a hoe with seeds in the active cell changes the hand to seeds. Inventory inspection alone never changes the active hand.

Persist the selected quickbar cell with player inventory/selection state. On character initialization, bind inventory first, validate selection, then rebuild the held item. Views subscribe to selection events instead of equipping as a side effect of refresh. This prevents the current hotbar refresh from overriding a selection made elsewhere.

Worn equipment owns actual items in separate saved equipment slots. Equipping transfers one compatible item out of the bag; replacing equipment transfers the previous item back. Prepare the complete exchange, verify capacity and compatibility, commit all ownership and effects, then publish events. If the outgoing item has nowhere to go, reject the exchange without changing anything. Unequipping follows the same rule. Do not store another reference to a bag slot and allow the same item to be worn and sold simultaneously.

Store stable slot IDs and item IDs/quantities, without scene objects or definition references. Initially this supports simple quantity-one gear. Unique rolled properties, durability or item-instance IDs require a separate design when those features become real requirements.

Use distinct item capabilities for holding tools/placeables, consuming items and wearing gear. `EquippableItem` currently only covers holding; preserve that meaning during the first repair, then introduce explicit worn-slot eligibility. Menu actions come from these capabilities and their validation results. Materials and produce must not offer a misleading Equip/Consume action.

## Ownership and configuration

- **Persistent state:** existing bag slots, held stack and source, plus selected quickbar cell and proposed worn equipment under `GameState.Player`. Extend the live save root directly; no parallel capture/restore map, schema bump or migration machinery during prototyping.
- **Gameplay services:** own selection, capacity upgrades, item moves, equipment exchanges and item action validation. Publish snapshots/events only after complete commits. UI is not the owner of character equipment.
- **Presenters:** render snapshots, focus/hover/details and drag feedback; issue commands. They must not resize saved inventories or mutate `Content` arrays.
- **Authored settings:** column count, supported capacities, upgrade costs, input action references, slot definitions, UI layout limits and sound profiles. Item content remains catalog-driven. New items must not require adding case statements or registry entries to UI code.
- **Common UI Manager:** owns pause options, modal input priority and sound playback. Inventory defaults to pausing character and calendar; opening options can override either. Even a nonpausing screen must consume its UI inputs so clicking it cannot also trigger a world action. Only the top modal receives navigation/submit/close.

Use a single runtime UI input setup referencing the project's UI action map. An editor validation step should report missing references and duplicate active EventSystems before play/build. Do not repair scenes by creating a fresh set of hardcoded actions at runtime.

## Implementation sequence and acceptance

1. **Repair and validate input:** bind the existing UI actions on SystemRoot, check scene overrides and duplicate input modules, verify real pointer/keyboard input and panel hit testing. Cover asset wiring as well as direct element events.
2. **Unify bag and quickbar:** introduce authored layout settings; render the first row identically in HUD and menu; move active selection into gameplay state; preserve existing saved quantities/capacity. Stop presenter refreshes from selecting items.
3. **Replace menu interactions:** click-to-inspect, drag/drop, split/context actions and keyboard pick/place; explicit cancellation and quantity-conservation tests. Share slot presentation and commands with shop screens where useful.
4. **Add equipment when content is ready:** authored slot definitions, saved ownership, transactional exchanges and effect rebinding. Audit and retire unused tool/demo inventories after checking references.
5. **Add progression:** capacity upgrades expose complete rows. Test upgrade affordability and commit behavior without shrinking existing saves.

The result is accepted when: clicks reach visible slots and buttons in the real scene; 10/20/30-slot bags show one/two/three stable rows; selecting details does not equip; the HUD and bag agree on active selection; moves/splits/equipment/save-load conserve ownership; depleted or moved items cannot leave a stale usable hand item; unresolved IDs remain protected; closing or changing location never loses a carried stack; and UI gestures cannot trigger world actions, including with pause disabled.

The implementation follows this sequence. Shipped gear/food content and persistence for dropped world pickups remain separate content/world-state work; the new equipment and consumable authoring APIs are ready to use.
