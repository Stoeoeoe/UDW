# UrInventoryDisplay Setup Guide

This guide explains how to set up the UGUI inventory system for a Stardew Valley-like game.

## Components Overview

### 1. UrInventoryDisplay
The main inventory controller that manages the inventory grid and item interactions.

### 2. UrInventorySlot
Individual slot prefab that displays an item's icon and quantity.

### 3. InventoryHeldItemDisplay
Shows the currently held item icon near the cursor when picking up items.

### 4. InventoryHeldItemEvent
Event system for communicating held item state changes.

---

## Interaction Model (Stardew Valley-like)

| Action | Empty Slot | Same Item (Stackable) | Different Item |
|--------|------------|----------------------|----------------|
| **Left-click (not holding)** | Nothing | Pick up entire stack | Pick up entire stack |
| **Left-click (holding)** | Place entire stack | Stack as much as possible | Swap items |
| **Right-click (not holding)** | Nothing | Pick up half stack | Pick up half stack |
| **Right-click (holding)** | Place one item | Add one to stack | Nothing |

**Note:** Items held persist when closing inventory - just like Stardew Valley!

---

## Setup Steps

### Step 1: Create the Inventory UI Panel

1. Create a new Canvas (or use existing UI Canvas)
2. Create a Panel as child and name it `InventoryPanel`
3. Add `UrInventoryDisplay` component to the panel
4. Add `CanvasGroup` component to the panel (if not auto-added)

### Step 2: Create the Slot Container

1. Inside `InventoryPanel`, create an empty GameObject named `SlotContainer`
2. Add `GridLayoutGroup` component with these settings:
   - Cell Size: (64, 64) or your preferred slot size
   - Spacing: (4, 4)
   - Start Corner: Upper Left
   - Start Axis: Horizontal
   - Child Alignment: Upper Left
   - Constraint: Fixed Column Count
   - Constraint Count: 5 (or match your inventory columns)
3. Add `ContentSizeFitter` component:
   - Horizontal Fit: Preferred Size
   - Vertical Fit: Preferred Size

### Step 3: Create the Slot Prefab

1. Create a new UI Panel and name it `InventorySlotPrefab`
2. Set size to match GridLayoutGroup cell size (e.g., 64x64)
3. Add these child elements:
   - **BackgroundImage**: Image component for slot background
   - **IconImage**: Image component for item icon (centered, slightly smaller)
   - **HighlightImage**: Image component for selection highlight (overlay)
   - **QuantityText**: TextMeshPro text for item quantity (bottom-right corner)
4. Add `UrInventorySlot` component to the root
5. Assign the references in the inspector
6. Save as prefab in your prefabs folder
7. Delete the scene instance

### Step 4: Create the Held Item Display

1. Create a new UI Panel at the Canvas root level named `HeldItemDisplay`
2. Set the anchor to center-center (it will follow the cursor)
3. Set size to your item icon size (e.g., 48x48)
4. Add these child elements:
   - **ItemIcon**: Image component for the item icon
   - **QuantityText**: TextMeshPro text for quantity
5. Add `InventoryHeldItemDisplay` component
6. Add `CanvasGroup` component
7. Assign references and set cursor offset (e.g., 20, -20)
8. Ensure this is on top of other UI (higher sibling index or sorting)

### Step 5: Create Action Buttons (Optional)

1. Inside `InventoryPanel`, create buttons:
   - **UseButton**: Button labeled "Use" (for consumables)
   - **DestroyButton**: Button labeled "Destroy" (to trash items)
2. Style as desired

### Step 6: Configure UrInventoryDisplay

1. Select the InventoryPanel
2. In the UrInventoryDisplay inspector, assign:
   - **Target Inventory Name**: "MainInventory" (same as ToolHotbar)
   - **Player Id**: "Player1" (same as ToolHotbar)
   - **Slot Prefab**: Your slot prefab
   - **Slot Container**: The SlotContainer transform
   - **Held Item Display**: The InventoryHeldItemDisplay component
   - **Use Button**: The Use button (optional)
   - **Destroy Button**: The Destroy button (optional)
   - **Open Inventory Action**: Link to your InputSystem OpenInventory action
   - **Inventory Canvas Group**: Auto-assigned or assign the panel's CanvasGroup

---

## Input System Setup

1. Ensure your InputSystem_Actions asset has an "OpenInventory" action (it already does)
2. In the UrInventoryDisplay, set the `OpenInventoryAction` to reference this action
3. Default binding is typically `Tab` or `E` key

---

## How It Works with the Hotbar

The inventory and hotbar share the **same inventory** (`MainInventory`). The hotbar displays slots 0-4 (or however many you configure), while the full inventory display shows ALL slots.

When you move items in the inventory:
1. The inventory triggers `MMInventoryEvent.ContentChanged`
2. Both the hotbar and inventory display listen to this event
3. Both refresh their displays automatically

If the currently selected hotbar slot changes content, the hotbar will re-equip/unequip accordingly.

---

## Usage

### Opening/Closing Inventory
- Press the assigned key (e.g., Tab) to toggle
- Or call `UrInventoryDisplay.OpenInventory()` / `CloseInventory()` / `ToggleInventory()`

### Picking Up Items
- **Left-click**: Pick up the entire stack
- **Right-click**: Pick up half the stack (rounded up)

### Placing Items
- **Left-click empty slot**: Place entire held stack
- **Left-click same item**: Stack items (excess stays held)
- **Left-click different item**: Swap items
- **Right-click empty slot**: Place just one item
- **Right-click same item**: Add one to the stack

### Using Items
- Select a slot by clicking
- Click the "Use" button for usable/consumable items

### Destroying Items
- Select a slot by clicking
- Click the "Destroy" button to permanently remove the item

---

## Events

The system fires these events:

- `InventoryHeldItemEvent`: When picking up or putting down items in the UI
- `MMInventoryEvent.ContentChanged`: When inventory content changes (listened by Hotbar too)

---

## Customization

### Styling Slots
Modify the slot prefab's colors and layout. Configure colors in `UrInventorySlot`:
- Empty Slot Color
- Filled Slot Color  
- Highlight Color

### Dynamic Inventory Size
The system automatically creates/destroys slots when `TargetInventory.Content.Length` changes.
