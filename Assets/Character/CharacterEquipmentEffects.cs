using System;
using System.Collections.Generic;
using System.Linq;
using Core.Equipment;
using Core.Events;
using Core.Inventory;

namespace Character
{
    /// <summary>Reconciles equipped-item bonuses; equipment contents remain owned by the loadout.</summary>
    public sealed class CharacterEquipmentEffects : IDisposable, IEventListener<InventoryChangedEvent>
    {
        private readonly SlotInventory _inventory;
        private readonly CharacterAttributes _attributes;
        private readonly Dictionary<string, WornEquipmentItem> _applied = new();

        public CharacterEquipmentEffects(SlotInventory inventory, CharacterAttributes attributes)
        {
            if (!inventory || !inventory.IsInitialized || !inventory.Configuration)
                throw new InvalidOperationException("Equipment effects require an initialized inventory with a configuration.");
            _inventory = inventory;
            _attributes = attributes ?? throw new ArgumentNullException(nameof(attributes));
            Refresh();
            this.Subscribe<InventoryChangedEvent>();
        }

        public void OnEvent(InventoryChangedEvent change)
        {
            if (change.InventoryRef == _inventory) Refresh();
        }

        public void Refresh()
        {
            var slots = _inventory.Configuration.EquipmentSlots;
            foreach (var id in _applied.Keys.ToArray())
            {
                if (Array.Exists(slots, slot => slot.Id == id) && _inventory.Loadout.GetEquipment(id).Item == _applied[id]) continue;
                Remove(id);
            }
            foreach (var slot in slots)
            {
                if (_applied.ContainsKey(slot.Id) || _inventory.Loadout.GetEquipment(slot.Id).Item is not WornEquipmentItem item) continue;
                // Record ownership before attribute notifications can observe the new bonuses.
                _applied.Add(slot.Id, item);
                for (var i = 0; i < item.Modifiers.Length; i++)
                {
                    var modifier = item.Modifiers[i];
                    _attributes.SetModifier(modifier.Attribute, $"equipment:{slot.Id}:{i}", modifier.Flat, modifier.Percent);
                }
            }
        }

        private void Remove(string id)
        {
            var item = _applied[id];
            _applied.Remove(id);
            for (var i = 0; i < item.Modifiers.Length; i++)
                _attributes.RemoveModifier(item.Modifiers[i].Attribute, $"equipment:{id}:{i}");
        }

        public void Dispose()
        {
            this.Unsubscribe<InventoryChangedEvent>();
            foreach (var id in _applied.Keys.ToArray()) Remove(id);
        }
    }
}
