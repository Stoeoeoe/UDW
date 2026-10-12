using Core.Equipment;
using Core.Events;
using Core.Inventory;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Character
{
    public class MainCharacter : GameCharacter, IEventListener<ItemSelectedEvent>, IEventListener<InventoryChangedEvent>
    {
        private static MainCharacter _currentMainCharacter;

        public static MainCharacter CurrentMainCharacter
        {
            get
            {
                if (!_currentMainCharacter)
                    _currentMainCharacter = FindFirstObjectByType<MainCharacter>();
                return _currentMainCharacter;
            }
        }

        public int CurrentSelectedSlotIndex { get; protected set; }
        private readonly Dictionary<string, WornEquipmentItem> _appliedEquipment = new();

        protected override void Awake()
        {
            base.Awake();
            _currentMainCharacter = this;
        }

        protected override void Start()
        {
            base.Start();
            CharacterManager.Instance.RegisterMainCharacter(this);
        }

        protected virtual void OnEnable()
        {
            this.Subscribe<ItemSelectedEvent>();
            this.Subscribe<InventoryChangedEvent>();
        }

        protected virtual void OnDisable()
        {
            this.Unsubscribe<ItemSelectedEvent>();
            this.Unsubscribe<InventoryChangedEvent>();
        }

        public void OnEvent(ItemSelectedEvent e)
        {
            if (e.Inventory && e.Inventory != MainInventory) return;
            SetHeldItem(e.HeldItem);
            CurrentSelectedSlotIndex = e.InventorySlotIndex;
        }

        public void OnEvent(InventoryChangedEvent e)
        {
            if (e.InventoryRef == MainInventory) RefreshInventoryState();
        }

        public void RefreshInventoryState()
        {
            SetHeldItem(MainInventory.Loadout.ActiveHandItem);
            CurrentSelectedSlotIndex = MainInventory.Loadout.ActiveHandInventoryIndex;
            var config = MainInventory.Configuration;
            foreach (var id in _appliedEquipment.Keys.ToArray())
            {
                var previous = _appliedEquipment[id];
                if (Array.Exists(config.EquipmentSlots, slot => slot.Id == id) &&
                    MainInventory.Loadout.GetEquipment(id).Item == previous) continue;
                for (var i = 0; i < previous.Modifiers.Length; i++)
                    RemoveAttributeModifier(previous.Modifiers[i].Attribute, $"equipment:{id}:{i}");
                _appliedEquipment.Remove(id);
            }
            foreach (var slot in config.EquipmentSlots)
            {
                if (_appliedEquipment.ContainsKey(slot.Id) ||
                    MainInventory.Loadout.GetEquipment(slot.Id).Item is not WornEquipmentItem item) continue;
                for (var i = 0; i < item.Modifiers.Length; i++)
                {
                    var modifier = item.Modifiers[i];
                    var source = $"equipment:{slot.Id}:{i}";
                    SetAttributeModifier(modifier.Attribute, source, modifier.Flat, modifier.Percent);
                }
                _appliedEquipment[slot.Id] = item;
            }
        }
    }
}
