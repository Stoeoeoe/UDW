# Tool Hotbar Setup Guide

## Overview
This guide explains how to create and configure the Tool Hotbar system for your game. The hotbar displays the first N items from an inventory and allows quick-use via keyboard, gamepad, or mouse.

---

## Part 1: Creating the HotbarSlot Prefab

### Step 1: Create the Base GameObject
1. In the Hierarchy, right-click → **UI → Panel** (or create an empty GameObject with RectTransform)
2. Rename it to `HotbarSlot`
3. Set the **RectTransform** size to approximately `80x80` pixels

### Step 2: Add Visual Components

#### A. Background Image (optional - slot already has one)
- The panel itself serves as the background
- Set the **Image** component color to a semi-transparent gray `(0.2, 0.2, 0.2, 0.8)`

#### B. Icon Image
1. Right-click `HotbarSlot` → **UI → Image**
2. Rename to `Icon`
3. Settings:
   - **Anchors**: Center-Center
   - **Size**: `60x60` (slightly smaller than slot)
   - **Sprite**: Leave None
   - **Color**: White `(1, 1, 1, 1)`
   - **Raycast Target**: DISABLED (important!)

#### C. Selected Indicator
1. Right-click `HotbarSlot` → **UI → Image**
2. Rename to `SelectedIndicator`
3. Settings:
   - **Anchors**: Stretch-Stretch (fill entire slot)
   - **Offsets**: All 0 (or -2 for inset)
   - **Sprite**: Use a border/highlight sprite (or solid white with border)
   - **Image Type**: Sliced (if using border sprite)
   - **Color**: Yellow/Gold `(1, 0.8, 0, 1)`
   - **Raycast Target**: DISABLED
   - **Initially disabled**: Uncheck "Enabled" in Inspector

### Step 3: Add Text Components

#### A. Quantity Text (TextMeshPro)
1. Right-click `HotbarSlot` → **UI → Text - TextMeshPro** (or regular Text if not using TMP)
2. Rename to `QuantityText`
3. Settings:
   - **Anchors**: Bottom-Right
   - **Pivot**: `(1, 0)`
   - **Position**: `(-5, 5)` from bottom-right
   - **Size**: `30x20`
   - **Font Size**: 16-18
   - **Color**: White with black outline
   - **Alignment**: Bottom-Right
   - **Raycast Target**: DISABLED

#### B. Key Binding Text (TextMeshPro)
1. Right-click `HotbarSlot` → **UI → Text - TextMeshPro**
2. Rename to `KeyBindingText`
3. Settings:
   - **Anchors**: Top-Left
   - **Pivot**: `(0, 1)`
   - **Position**: `(5, -5)` from top-left
   - **Size**: `30x20`
   - **Font Size**: 14-16
   - **Color**: White with slight shadow
   - **Alignment**: Top-Left
   - **Raycast Target**: DISABLED

### Step 4: Add Button Component
1. Select the root `HotbarSlot` GameObject
2. **Add Component → Button**
3. Button Settings:
   - **Transition**: Color Tint (or SpriteSwap)
   - **Normal Color**: White
   - **Highlighted Color**: Light Gray `(0.9, 0.9, 0.9)`
   - **Pressed Color**: Dark Gray `(0.7, 0.7, 0.7)`
   - **Navigation**: None (hotbar handles its own navigation)

### Step 5: Add HotbarSlot Script
1. Select the root `HotbarSlot` GameObject
2. **Add Component → HotbarSlot** script
3. Assign references in the Inspector:
   - **Icon Image**: Drag the `Icon` child
   - **Background Image**: The root's Image component
   - **Selected Indicator**: Drag the `SelectedIndicator` child
   - **Quantity Text**: Drag the `QuantityText` child
   - **Key Binding Text**: Drag the `KeyBindingText` child
   - **Slot Button**: The root's Button component
4. Adjust colors if needed:
   - **Empty Slot Color**: `(1, 1, 1, 0.3)`
   - **Filled Slot Color**: `(1, 1, 1, 1)`
   - **Selected Color**: `(1, 0.8, 0, 1)`

### Step 6: Create Prefab
1. Drag `HotbarSlot` from Hierarchy into your **Project** folder (e.g., `Assets/UI/Hotbar/`)
2. Delete the instance from the Hierarchy
3. Your HotbarSlot prefab is now ready!

---

## Part 2: Creating the ToolHotbar GameObject

### Step 1: Create the Hotbar Container
1. In your Canvas, right-click → **UI → Panel**
2. Rename to `ToolHotbar`
3. Position it where you want (typically bottom-center of screen):
   - **Anchors**: Bottom-Center
   - **Pivot**: `(0.5, 0)`
   - **Position**: `(0, 20)`
   - **Size**: Auto-adjust based on slot count (e.g., `450x100` for 5 slots)

### Step 2: Create Slot Container
1. Right-click `ToolHotbar` → **Create Empty**
2. Rename to `SlotContainer`
3. Add **Horizontal Layout Group** component:
   - **Child Alignment**: Middle-Center
   - **Spacing**: 10
   - **Child Force Expand**: Both unchecked
   - **Child Control Size**: Both checked
4. Add **Content Size Fitter** component (optional):
   - **Horizontal Fit**: Preferred Size
   - **Vertical Fit**: Preferred Size

### Step 3: Add ToolHotbar Script
1. Select the root `ToolHotbar` GameObject
2. **Add Component → ToolHotbar** script
3. Configure in Inspector:

#### Inventory Binding
- **Target Inventory Name**: `"MainInventory"` (must match your inventory's GameObject name)
- **Player ID**: `"Player1"` (must match your player's ID)

#### Hotbar Configuration
- **Hotbar Size**: `5` (or however many slots you want)

#### Slot Prefab
- **Slot Prefab**: Drag your `HotbarSlot` prefab here
- **Slot Container**: Drag the `SlotContainer` child GameObject

#### Input Actions
This is where you define your input bindings:

##### Slot Actions (Array)
1. Set **Size** to match your **Hotbar Size** (e.g., 5)
2. For each element, configure the **Input Action**:

**Example for Slot 0:**
- Click the arrow next to `Slot Actions → Element 0`
- **Action → Use Reference**: None (Create)
- Click **Create Action**
- Set **Name**: `"Hotbar_Slot_1"`
- **Action Type**: Button
- **Control Type**: Any
- Click **Add Binding**
- Press your desired key (e.g., `1` key)
- ⚠️ **Important**: Click **Save Asset** if prompted

**Repeat for remaining slots:**
- Slot 1 → Bind to `2`
- Slot 2 → Bind to `3`
- Slot 3 → Bind to `4`
- Slot 4 → Bind to `5`

**OR use an existing Input Action Asset:**
- If you already have an Input Action Asset (`.inputactions` file):
  - Select **Use Reference → Input Action**
  - Choose your action from the dropdown
  - Make sure the action is enabled in your Input System settings

##### Next Slot Action
- **Name**: `"Hotbar_Next"`
- **Bindings**: 
  - Mouse Scroll Wheel Up
  - Right Shoulder Button (Gamepad)
  - Right Arrow Key

##### Previous Slot Action
- **Name**: `"Hotbar_Previous"`
- **Bindings**:
  - Mouse Scroll Wheel Down
  - Left Shoulder Button (Gamepad)
  - Left Arrow Key

---

## Part 3: Input System Configuration

### Option A: Using Inline Actions (Simplest)
The actions you create directly in the Inspector work immediately. Just make sure:
1. Each `InputActionProperty` is configured
2. The action has at least one binding
3. The ToolHotbar component will automatically enable/disable them

### Option B: Using Input Action Asset (Recommended for larger projects)
1. Create an Input Action Asset:
   - **Right-click** in Project → **Create → Input Actions**
   - Name it `HotbarInputActions`

2. Open the asset and create an Action Map:
   - **Action Maps** → `+` → Name it `"Hotbar"`
   - **Actions** → Add:
     - `Slot_1` (Button)
     - `Slot_2` (Button)
     - `Slot_3` (Button)
     - `Slot_4` (Button)
     - `Slot_5` (Button)
     - `Next_Slot` (Button)
     - `Previous_Slot` (Button)

3. Configure Bindings:
   - For each action, add bindings via **+ → Add Binding**
   - Use composite bindings for mouse wheel: **+ → 1D Axis**

4. In ToolHotbar Inspector:
   - **Slot Actions**: Set size to 5
   - For each element, select **Use Reference** → Choose action from asset
   - Do the same for Next/Previous actions

5. **Save the asset!**

---

## Part 4: Connecting to Your Inventory

### Ensure Your Inventory is Set Up
1. Find your **Inventory** GameObject in the scene (usually on the Player or a manager)
2. Check the **Inventory** component:
   - **Name**: Should match `TargetInventoryName` in ToolHotbar (e.g., `"MainInventory"`)
   - **Player ID**: Should match `PlayerID` in ToolHotbar (e.g., `"Player1"`)
   - **Content Size**: Must be at least as large as `HotbarSize`

3. The hotbar will automatically display the **first N items** from this inventory
   - Slot 0 = Inventory.Content[0]
   - Slot 1 = Inventory.Content[1]
   - etc.

### Handling the EquipRequest Event
The hotbar sends an `MMInventoryEvent` with type `EquipRequest` when an item is used. You need to handle this:

**Option 1: Extend InventoryItem**
```csharp
public override bool Equip(string playerID)
{
    // Your tool equip logic here
    Debug.Log($"Equipped {ItemName}");
    return true;
}
```

**Option 2: Listen in Another Component**
```csharp
public class ToolEquipHandler : MonoBehaviour, MMEventListener<MMInventoryEvent>
{
    protected virtual void OnEnable()
    {
        this.MMEventStartListening<MMInventoryEvent>();
    }

    protected virtual void OnDisable()
    {
        this.MMEventStopListening<MMInventoryEvent>();
    }

    public virtual void OnMMEvent(MMInventoryEvent inventoryEvent)
    {
        if (inventoryEvent.InventoryEventType == MMInventoryEventType.EquipRequest)
        {
            // Handle tool equipping here
            InventoryItem item = inventoryEvent.EventItem;
            int slot = inventoryEvent.Index;
            
            Debug.Log($"Equip {item.ItemName} from slot {slot}");
            // Your logic...
        }
    }
}
```

---

## Part 5: Styling and Polish

### Visual Enhancements
1. **Slot Background Sprite**: Use a rounded-corner panel sprite
2. **Selected Indicator**: Use a glowing border sprite with animation
3. **Icon Fade**: Adjust `EmptySlotColor` alpha for empty slots
4. **Tooltips**: Add a `ToolTipDisplay` component (if using MoreMountains tooltip system)

### Animation (Optional)
1. Add **Animator** component to HotbarSlot prefab
2. Create animation clips:
   - **Selected_Highlight**: Scale pulse or glow
   - **Item_Added**: Pop-in animation
   - **Item_Used**: Flash or shrink

### Audio (Optional)
Extend `HotbarSlot.cs` to play sounds:
```csharp
public AudioClip SelectSound;
public AudioClip UseSound;

public override void SetSelected(bool selected)
{
    base.SetSelected(selected);
    if (selected && SelectSound != null)
    {
        MMSoundManagerSoundPlayEvent.Trigger(SelectSound, MMSoundManager.MMSoundManagerTracks.Sfx);
    }
}
```

---

## Part 6: Testing

### Test Checklist
1. ✅ Hotbar appears in scene with correct number of slots
2. ✅ Key bindings are displayed in top-left of each slot
3. ✅ When inventory has items, they appear in hotbar slots
4. ✅ Quantity displays correctly for stackable items
5. ✅ Pressing slot keys triggers `EquipRequest` event
6. ✅ Next/Previous buttons cycle through slots and highlight them
7. ✅ Clicking a slot with mouse triggers the same action
8. ✅ When items are added/removed from inventory, hotbar updates automatically
9. ✅ Selected slot stays highlighted
10. ✅ Empty slots remain visible but show no icon

### Debugging Tips
- **No slots appearing?** Check that `SlotPrefab` and `SlotContainer` are assigned
- **Input not working?** Verify Input Actions are enabled and have bindings
- **Items not showing?** Check `TargetInventoryName` and `PlayerID` match exactly
- **No events firing?** Ensure the Inventory component has `MMEventManager` in the scene
- **Console errors?** Make sure MoreMountains.Tools and MoreMountains.InventoryEngine are properly imported

---

## Example Scene Hierarchy

```
Canvas
└── ToolHotbar (ToolHotbar.cs)
    ├── Background (Image - optional)
    └── SlotContainer (Horizontal Layout Group)
        ├── HotbarSlot(Clone) [0]
        ├── HotbarSlot(Clone) [1]
        ├── HotbarSlot(Clone) [2]
        ├── HotbarSlot(Clone) [3]
        └── HotbarSlot(Clone) [4]
```

---

## Advanced Customization

### Dynamic Slot Count
Adjust `HotbarSize` at runtime:
```csharp
toolHotbar.HotbarSize = 8;
toolHotbar.InitializeHotbar(); // Re-creates slots
```

### Multiple Hotbars
Create separate ToolHotbar instances for different item categories:
- Tools Hotbar → Inventory: "ToolsInventory"
- Weapons Hotbar → Inventory: "WeaponsInventory"
- Consumables Hotbar → Inventory: "ConsumablesInventory"

### Context-Sensitive Bindings
Change `SlotActions` based on player state (driving, swimming, etc.):
```csharp
public InputActionProperty[] VehicleSlotActions;

void EnterVehicle()
{
    toolHotbar.SlotActions = VehicleSlotActions;
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Slots not visible | Check Canvas is in **Screen Space - Overlay** or has proper camera reference |
| Input not responding | Verify Input System package is installed and enabled in Project Settings |
| Items not syncing | Ensure both Inventory and ToolHotbar have matching names/PlayerIDs |
| Performance issues | Reduce `RefreshAllSlots()` frequency or use object pooling for slots |
| Text not showing | Install TextMeshPro package or use Unity's legacy Text component |

---

## Summary

You now have a fully functional, event-driven hotbar system that:
- ✅ Displays first N items from any inventory
- ✅ Supports per-slot keyboard bindings with automatic label display
- ✅ Supports next/previous navigation (controller/mouse wheel)
- ✅ Handles click interactions
- ✅ Shows item icons and quantities
- ✅ Highlights the currently selected slot
- ✅ Automatically syncs with inventory changes via events
- ✅ Lightweight and decoupled from InventoryDisplay

Enjoy your new hotbar system! 🎮
