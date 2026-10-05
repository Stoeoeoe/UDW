using System;
using System.Reflection;
using System.Linq;
using Core.Events;
using UI.InventoryScreen;
using NUnit.Framework;
using Sirenix.Serialization;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Core.Inventory.Editor
{
    public sealed class InventoryTestItem : ItemDefinition { }

    public sealed class InventoryDragTestDisplay : UrInventoryDisplay
    {
        public SlotInventory Inventory;
        public override SlotInventory TargetInventory => Inventory;
        protected override void Awake() { }
        public void PickUp(int slot) => PickUpEntireStack(slot);
        public void PickUpHalf(int slot) => PickUpHalfStack(slot);
        public void Place(int slot) => PlaceHeldItem(slot);
        public void PlaceOne(int slot) => PlaceOneItem(slot);
    }

    public sealed class InventoryPersistenceTests : IEventListener<InventoryChangedEvent>
    {
        private GameObject _root;
        private SlotInventory _inventory;
        private InventoryTestItem _item;
        private InventoryState _state;
        private bool _checkMarker;
        private int _events;
        private int? _expectedTotal;

        [SetUp]
        public void SetUp()
        {
            _root = new GameObject("Inventory tests");
            _root.SetActive(false);
            _inventory = _root.AddComponent<SlotInventory>();
            typeof(SlotInventory).GetField("_numberOfSlots", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(_inventory, 2);
            typeof(SlotInventory).GetMethod("Awake", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(_inventory, null);
            _item = ScriptableObject.CreateInstance<InventoryTestItem>();
            typeof(ItemDefinition).GetField("<ItemId>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_item, "test:grain");
            _state = new InventoryState();
            _inventory.Bind(_state, id => id == _item.ItemId ? _item : null);
            _events = 0;
            _checkMarker = false;
            _expectedTotal = null;
            EventBus<InventoryChangedEvent>.Subscribe(this);
        }

        [TearDown]
        public void TearDown()
        {
            EventBus<InventoryChangedEvent>.Unsubscribe(this);
            Object.DestroyImmediate(_root);
            Object.DestroyImmediate(_item);
        }

        public void OnEvent(InventoryChangedEvent change)
        {
            if (change.InventoryRef != _inventory) return;
            _events++;
            if (_checkMarker) Assert.That(_state.StartingLoadoutApplied, Is.True);
            if (_expectedTotal.HasValue)
                Assert.That(_state.Slots.Sum(slot => slot.Quantity) + _state.HeldSlot.Quantity,
                    Is.EqualTo(_expectedTotal.Value), "Callbacks must not observe lost or duplicated dragged items.");
        }

        [Test]
        public void StartingLoadoutCommitsBeforeNotificationsAndDoesNotRepeatAfterEmptyingOrRebinding()
        {
            _checkMarker = true;
            Assert.That(_inventory.ApplyStartingLoadout(new[] { _item, _item }), Is.True);
            Assert.That(_events, Is.EqualTo(1));
            Assert.That(_inventory.Content[0].Quantity, Is.EqualTo(2));
            _inventory.RemoveItemAt(0, 2);
            var bytes = SerializationUtility.SerializeValue(_state, DataFormat.JSON, out var references);
            Assert.That(references, Is.Empty);
            _state = SerializationUtility.DeserializeValue<InventoryState>(bytes, DataFormat.JSON);
            _inventory.Bind(_state);
            Assert.That(_inventory.ApplyStartingLoadout(new[] { _item }), Is.True);
            Assert.That(_inventory.Content[0].IsOccupied, Is.False);
        }

        [Test]
        public void OverflowAndInvalidLoadoutsDoNotPartiallyAddOrMarkInitialized()
        {
            typeof(ItemDefinition).GetField("<MaxStackSize>k__BackingField", BindingFlags.Instance | BindingFlags.NonPublic)
                .SetValue(_item, 1);
            Assert.That(_inventory.ApplyStartingLoadout(new[] { _item, _item, _item }), Is.False);
            Assert.That(_inventory.ApplyStartingLoadout(new ItemDefinition[] { _item, null }), Is.False);
            Assert.That(_state.StartingLoadoutApplied, Is.False);
            Assert.That(_state.Slots[0].Quantity, Is.Zero);
            Assert.That(_events, Is.Zero);
            Assert.That(_inventory.ApplyStartingLoadout(Array.Empty<ItemDefinition>()), Is.True);
            Assert.That(_state.StartingLoadoutApplied, Is.True);
        }

        [Test]
        public void MissingItemsReserveSlotsAndSurviveAddingMovingAndRoundTrip()
        {
            _state.Slots[0] = new InventorySlotState("missing:item", 4);
            Assert.That(_inventory.AddItem(_item, 3), Is.True);
            Assert.That(_state.Slots[0].ItemId, Is.EqualTo("missing:item"));
            _inventory.MoveItem(0, 1);
            Assert.That(_state.Slots[1].ItemId, Is.EqualTo("missing:item"));
            var bytes = SerializationUtility.SerializeValue(_state, DataFormat.JSON);
            var restored = SerializationUtility.DeserializeValue<InventoryState>(bytes, DataFormat.JSON);
            _inventory.Bind(restored, id => id == _item.ItemId ? _item : null);
            Assert.That(_inventory.Content[0].Item, Is.SameAs(_item));
            Assert.That(_inventory.Content[1].Item, Is.Null);
            Assert.That(_inventory.Content[1].IsOccupied, Is.True);
            Assert.That(_inventory.Content[1].Quantity, Is.EqualTo(4));
            Assert.That(_inventory.AddItem(_item, _item.MaxStackSize), Is.False);
            // A later resolver can restore access without changing saved contents.
            _inventory.Bind(restored, id => _item);
            Assert.That(_inventory.Content[1].Item, Is.SameAs(_item));
        }

        [Test]
        public void DragDropCallbacksSeeCommittedSlotsAndHeldStack()
        {
            var display = _root.AddComponent<InventoryDragTestDisplay>();
            display.Inventory = _inventory;
            _inventory.AddItem(_item, 4);
            _expectedTotal = 4;
            display.PickUp(0);
            Assert.That(_state.HeldSlot.Quantity, Is.EqualTo(4));
            display.PlaceOne(1);
            Assert.That(_state.HeldSlot.Quantity, Is.EqualTo(3));
            display.Place(1);
            display.PickUpHalf(1);
            display.Place(0);
            Assert.That(_state.HeldSlot.Quantity, Is.Zero);
            Assert.That(_state.Slots[0].Quantity, Is.EqualTo(2));
            Assert.That(_state.Slots[1].Quantity, Is.EqualTo(2));
        }

        [Test]
        public void DraggedStackRemainsSaveOwnedAcrossRoundTripAndSceneRebinding()
        {
            _inventory.HeldStack = new ItemStack(_item, 3);
            _inventory.HeldSourceIndex = 1;
            var bytes = SerializationUtility.SerializeValue(_state, DataFormat.JSON, out var references);
            Assert.That(references, Is.Empty);
            var restored = SerializationUtility.DeserializeValue<InventoryState>(bytes, DataFormat.JSON);
            _inventory.Bind(restored, id => _item);
            Assert.That(_inventory.HeldStack.Quantity, Is.EqualTo(3));
            Assert.That(_inventory.HeldStack.Item, Is.SameAs(_item));
            Assert.That(_inventory.HeldSourceIndex, Is.EqualTo(1));
        }

        [Test]
        public void SceneInventoryCannotMutateTheSavedSlotsThroughItsContentSnapshot()
        {
            _inventory.AddItem(_item, 2);
            _inventory.Content[0] = ItemStack.Empty;
            Assert.That(_state.Slots[0].Quantity, Is.EqualTo(2));
            var other = _root.AddComponent<SlotInventory>();
            other.Bind(_state, id => _item);
            other.RemoveItemAt(0);
            Assert.That(_inventory.Content[0].Quantity, Is.EqualTo(1));
        }
    }
}
