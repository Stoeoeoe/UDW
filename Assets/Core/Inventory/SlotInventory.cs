using System;
using System.Collections.Generic;
using UnityEngine;

namespace Core.Inventory
{
    /// <summary>Unity initialization, registration, save binding and inventory notifications.</summary>
    public class SlotInventory : MonoBehaviour
    {
        [SerializeField] string _inventoryName;
        [SerializeField] string _playerID = "Player1";
        [SerializeField] int _numberOfSlots = 15;
        [SerializeField] private InventoryConfiguration configuration;
        private InventoryState _state;
        private InventoryStorage _storage;
        private static readonly Dictionary<(string, string), SlotInventory> _registry = new();

        public InventoryConfiguration Configuration { get => configuration; set => configuration = value; }
        public int Columns => configuration ? configuration.Columns : _numberOfSlots;
        private int InitialCapacity => configuration ? checked(configuration.Columns * configuration.StartingRows) : _numberOfSlots;
        public string InventoryName => _inventoryName;
        public string PlayerID => _playerID;
        public bool IsInitialized => _storage != null;
        internal InventoryStorage Storage => _storage ?? throw new InvalidOperationException("Inventory must be initialized before use.");
        public int Capacity => Storage.Capacity;
        public ItemStack GetSlot(int index) => Storage.GetSlot(index);
        public ItemStack[] GetSnapshot() => Storage.GetSnapshot();
        public InventoryInteraction Interaction { get; private set; }
        public CharacterLoadout Loadout { get; private set; }
        public InventoryActions Actions { get; private set; }
        public ItemStack HeldStack => Interaction.HeldStack;
        public int HeldSourceIndex => Interaction.HeldSourceIndex;

        private void Initialize(InventoryState state, Func<string, ItemDefinition> resolve)
        {
            if (_storage == null) _storage = new InventoryStorage(state, resolve, InitialCapacity);
            else _storage.Bind(state, resolve, InitialCapacity);
            _state = state;
            if (Interaction == null) Interaction = new InventoryInteraction(_storage, state, NotifyHeldChange);
            else Interaction.Bind(state);
            Loadout ??= new CharacterLoadout(this);
            Loadout.Bind(state, configuration ? configuration.ToolbeltSlots : 10);
            Actions ??= new InventoryActions(this);
        }
        private void Awake()
        {
            EnsureInitialized();
            _registry[(_inventoryName, _playerID)] = this;
        }
        public void EnsureInitialized()
        {
            if (!IsInitialized) Initialize(new InventoryState(), ItemCatalog.Find);
        }
        private void OnDestroy() => _registry.Remove((_inventoryName, _playerID));
        public static SlotInventory FindInventory(string inventoryName, string playerID)
        {
            _registry.TryGetValue((inventoryName, playerID), out var inventory);
            return inventory;
        }
        public void Bind(InventoryState state, Func<string, ItemDefinition> resolve = null)
        {
            Initialize(state, resolve ?? ItemCatalog.Find);
            InventoryChangedEvent.Trigger(this);
        }
        public bool ApplyStartingLoadout(IEnumerable<ItemDefinition> items)
        {
            if (!IsInitialized) throw new InvalidOperationException("Inventory must be initialized before use.");
            if (_state.StartingLoadoutApplied) return true;
            var prepared = GetSnapshot();
            foreach (var item in items)
                if (!Storage.TryPrepareAddition(item, 1, prepared, out prepared)) return false;
            Storage.CommitContent(prepared);
            Loadout.InitializeStartingTools(prepared);
            _state.StartingLoadoutApplied = true;
            InventoryChangedEvent.Trigger(this);
            return true;
        }
        public bool AddItem(ItemDefinition item, int quantity)
        {
            if (!Storage.AddItem(item, quantity)) return false;
            InventoryChangedEvent.Trigger(this);
            return true;
        }
        public void RemoveItemAt(int index, int quantity = 1)
        {
            if (Storage.RemoveItemAt(index, quantity)) InventoryChangedEvent.Trigger(this);
        }
        public void MoveItem(int from, int to)
        {
            Storage.MoveItem(from, to);
            InventoryChangedEvent.Trigger(this);
        }
        public void SetSlot(int index, ItemStack stack)
        {
            Storage.SetSlot(index, stack);
            InventoryChangedEvent.Trigger(this);
        }
        public void SortStorage()
        {
            Storage.SortStorage();
            InventoryChangedEvent.Trigger(this);
        }
        internal void NotifyHeldChange()
        {
            var held = HeldStack;
            var source = HeldSourceIndex;
            InventoryChangedEvent.Trigger(this);
            if (held.IsEmpty) InventoryHeldItemEvent.TriggerClear();
            else InventoryHeldItemEvent.Trigger(held.Item, held.Quantity, source);
        }
    }
}
