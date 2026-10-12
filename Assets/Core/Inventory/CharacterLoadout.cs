using System;
using Core.Equipment;
using Interaction.Tools;
using Items;

namespace Core.Inventory
{
    /// <summary>
    /// Owns tool shortcuts and the selected carried item. IDs live in the existing
    /// InventoryState; resolving a shortcut never moves or duplicates bag contents.
    /// SlotInventory rebinds this object whenever its saved state is replaced.
    /// </summary>
    public sealed class CharacterLoadout
    {
        private readonly SlotInventory _inventory;
        private InventoryState _state;

        internal CharacterLoadout(SlotInventory inventory) => _inventory = inventory;

        internal void Bind(InventoryState state, int toolbeltSize)
        {
            _state = state;
            _state.Toolbelt ??= new string[toolbeltSize];
        }

        public int ToolbeltSize => _state.Toolbelt.Length;
        public int ActiveToolbeltSlot => string.IsNullOrEmpty(_state.SelectedItemId) ? -1 :
            Array.IndexOf(_state.Toolbelt, _state.SelectedItemId);
        public int ActiveHandInventoryIndex => FindItemIndex(_state.SelectedItemId);
        public EquippableItem ActiveHandItem => ActiveHandInventoryIndex is var index && index >= 0
            ? _inventory.Storage.Resolve(_state.Slots[index]).Item as EquippableItem : null;

        private int FindItemIndex(string id) => string.IsNullOrEmpty(id) ? -1 :
            Array.FindIndex(_state.Slots, slot => slot.Quantity > 0 && slot.ItemId == id);

        public ToolData GetToolbeltTool(int index)
        {
            if (index < 0 || index >= ToolbeltSize) throw new ArgumentOutOfRangeException(nameof(index));
            var inventoryIndex = FindItemIndex(_state.Toolbelt[index]);
            return inventoryIndex >= 0 ? _inventory.Storage.Resolve(_state.Slots[inventoryIndex]).Item as ToolData : null;
        }

        public bool SelectItem(int index)
        {
            if (index < -1) throw new ArgumentOutOfRangeException(nameof(index));
            var stack = index == -1 ? ItemStack.Empty : _inventory.GetSlot(index);
            if (index >= 0 && stack.Item is not EquippableItem) return false;
            _state.SelectedItemId = stack.ItemId;
            NotifySelection();
            return true;
        }

        public bool AssignToolbeltSlot(int source, int destination)
        {
            if (destination < 0 || destination >= ToolbeltSize) throw new ArgumentOutOfRangeException(nameof(destination));
            if (source < -1) throw new ArgumentOutOfRangeException(nameof(source));
            var stack = source == -1 ? ItemStack.Empty : _inventory.GetSlot(source);
            if (source >= 0 && stack.Item is not ToolData) return false;
            var id = stack.ItemId;
            if (id != null)
                for (var i = 0; i < ToolbeltSize; i++)
                    if (_state.Toolbelt[i] == id) _state.Toolbelt[i] = null;
            _state.Toolbelt[destination] = id;
            InventoryChangedEvent.Trigger(_inventory);
            return true;
        }

        public bool SelectToolbeltSlot(int index)
        {
            if (index < 0 || index >= ToolbeltSize) throw new ArgumentOutOfRangeException(nameof(index));
            _state.SelectedItemId = GetToolbeltTool(index) ? _state.Toolbelt[index] : null;
            NotifySelection();
            return true;
        }

        private void NotifySelection() =>
            ItemSelectedEvent.Trigger(ActiveHandItem, ActiveHandInventoryIndex, _inventory);

        public ItemStack GetEquipment(string slotId) => _state.Equipment.TryGetValue(slotId, out var slot)
            ? _inventory.Storage.Resolve(slot) : ItemStack.Empty;

        // InventoryActions commits bag and loadout together before publishing notifications.
        internal void SetEquipment(string slotId, WornEquipmentItem item)
        {
            _inventory.Storage.RememberItem(item);
            _state.Equipment[slotId] = new InventorySlotState(item.ItemId, 1);
        }

        internal void RemoveEquipment(string slotId) => _state.Equipment.Remove(slotId);

        // The starting-loadout transaction publishes only after bag contents,
        // shortcuts, selection and its saved initialization marker are committed.
        internal void InitializeStartingTools(ItemStack[] content)
        {
            var beltIndex = 0;
            foreach (var stack in content)
                if (stack.Item is ToolData && beltIndex < ToolbeltSize &&
                    !Array.Exists(_state.Toolbelt, id => id == stack.ItemId))
                    _state.Toolbelt[beltIndex++] = stack.ItemId;
            if (beltIndex > 0 && string.IsNullOrEmpty(_state.SelectedItemId))
                _state.SelectedItemId = _state.Toolbelt[0];
        }
    }
}
