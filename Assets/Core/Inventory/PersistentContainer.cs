using System;
using Character;
using Core.Spawning;
using UnityEngine;

namespace Core.Inventory
{
    /// <summary>Persistent world view. The spawner binds owner and contents before enabling it.</summary>
    public sealed class PersistentContainer : SpawnedObject
    {
        [SerializeField] private CharacterDefinition owner;
        [SerializeField, Min(1)] private int capacity = 20;
        [SerializeField] private string displayName = "Chest";
        public string DisplayName => displayName;
        public CharacterDefinition Owner => owner;
        public ContainerStorage Storage { get; private set; }
        public event Action Changed;

        public void ValidateConfiguration()
        {
            if (!owner || capacity <= 0 || string.IsNullOrWhiteSpace(displayName))
                throw new InvalidOperationException($"Container '{name}' requires an owner, positive capacity and display name.");
            owner.RequireValidConfiguration();
        }

        public override SpawnedObjectState CreateState()
        {
            ValidateConfiguration();
            return new ContainerState { OwnerCharacterId = owner.CharacterId,
                Inventory = new InventoryState { Slots = new InventorySlotState[capacity] } };
        }

        protected override void OnStateBound()
        {
            ValidateConfiguration();
            if (State is not ContainerState state)
                throw new InvalidOperationException($"Container '{PersistentId}' requires ContainerState.");
            Storage = new ContainerStorage(state, CharacterCatalog.Require, ItemCatalog.Find);
        }

        private void Awake()
        {
            if (Storage == null) throw new InvalidOperationException($"Container '{name}' must be bound by WorldObjectSpawner before activation.");
        }

        public bool TryTransfer(GameCharacter character, bool deposit, int slot, int quantity)
        {
            if (!character) throw new ArgumentNullException(nameof(character));
            var inventory = character.MainInventory;
            bool moved = deposit
                ? Storage.TryDeposit(inventory.Storage, slot, quantity)
                : Storage.TryWithdraw(inventory.Storage, slot, quantity);
            if (!moved) return false;
            InventoryChangedEvent.Trigger(inventory);
            Changed?.Invoke();
            return true;
        }
    }
}
