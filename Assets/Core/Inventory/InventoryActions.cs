using System;
using Character;
using Core.Equipment;
using Items;

namespace Core.Inventory
{
    /// <summary>
    /// Coordinates bag/loadout transfers and actions involving character effects or
    /// money. Prepare changes first, commit all participants, then publish events.
    /// </summary>
    public sealed class InventoryActions
    {
        private readonly SlotInventory _inventory;

        internal InventoryActions(SlotInventory inventory) => _inventory = inventory;

        public bool TryEquip(int source, EquipmentSlotDefinition slot)
        {
            if (!Array.Exists(_inventory.Configuration.EquipmentSlots, s => s.Id == slot.Id)) return false;
            var stack = _inventory.GetSlot(source);
            if (stack.Item is not WornEquipmentItem item || !item.Fits(slot)) return false;
            var content = _inventory.GetSnapshot();
            var previous = _inventory.Loadout.GetEquipment(slot.Id);
            content[source] = content[source].Quantity == 1 ? ItemStack.Empty : new ItemStack(item, content[source].Quantity - 1);
            if (previous.IsOccupied && !_inventory.Storage.TryPrepareAddition(previous.Item, previous.Quantity, content, out content)) return false;
            _inventory.Storage.CommitContent(content);
            _inventory.Loadout.SetEquipment(slot.Id, item);
            InventoryChangedEvent.Trigger(_inventory);
            return true;
        }

        public bool TryUnequip(EquipmentSlotDefinition slot)
        {
            var previous = _inventory.Loadout.GetEquipment(slot.Id);
            if (previous.IsEmpty || !_inventory.Storage.TryPrepareAddition(previous.Item, previous.Quantity, out var content)) return false;
            _inventory.Storage.CommitContent(content);
            _inventory.Loadout.RemoveEquipment(slot.Id);
            InventoryChangedEvent.Trigger(_inventory);
            return true;
        }

        public bool TryUpgrade(Wallet wallet)
        {
            if (!_inventory.Configuration.TryGetUpgrade(_inventory.Capacity, out var upgrade)) return false;
            var slots = _inventory.Storage.PrepareExpansion(checked(upgrade.Rows * _inventory.Columns));
            var previous = wallet.Balance;
            if (!wallet.TrySpend(upgrade.Price, false)) return false;
            _inventory.Storage.CommitExpansion(slots);
            wallet.Notify(previous);
            InventoryChangedEvent.Trigger(_inventory);
            return true;
        }

        public bool TryEquipHeld(EquipmentSlotDefinition slot)
        {
            var held = _inventory.HeldStack;
            if (!Array.Exists(_inventory.Configuration.EquipmentSlots, s => s.Id == slot.Id) ||
                held.Item is not WornEquipmentItem item || !item.Fits(slot)) return false;
            var previous = _inventory.Loadout.GetEquipment(slot.Id);
            var content = _inventory.GetSnapshot();
            if (previous.IsOccupied && !_inventory.Storage.TryPrepareAddition(previous.Item, previous.Quantity, content, out content)) return false;
            _inventory.Storage.CommitContent(content);
            _inventory.Loadout.SetEquipment(slot.Id, item);
            _inventory.Interaction.RemoveHeldSilently(1);
            _inventory.NotifyHeldChange();
            return true;
        }

        public bool TryConsume(int source, GameCharacter character)
        {
            var stack = _inventory.GetSlot(source);
            if (stack.Item is not ConsumableItem item || !item.CanConsume(character)) return false;
            _inventory.Storage.RemoveItemAt(source);
            item.Apply(character);
            InventoryChangedEvent.Trigger(_inventory);
            return true;
        }
    }
}
